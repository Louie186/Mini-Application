# -*- coding: utf-8 -*-
"""Export sheets from ACC models to PDF + DWG, then embed the logos in AutoCAD.

Recommended flow: tick models -> tick sheets (grouped by model) -> Dry run or Export.
Workshared models open DETACHED (all worksets) - never your own local copy.
Every model is closed without saving.
"""
from __future__ import print_function

__title__ = 'Export\nSheets'
__author__ = 'BIM Export'
__context__ = 'zero-doc'                # works with no model open (it opens models itself)

import os
import time

from pyrevit import forms, script

import bimexport_core as core

uiapp = __revit__                       # noqa: F821  (provided by pyRevit)
app = uiapp.Application
output = script.get_output()

TICK, LOD, ALL = 'Tick sheets from the models (recommended)', 'Sheets from my LOD (CSV)', 'All sheets in the chosen models'


class SheetItem(forms.TemplateListItem):
    @property
    def name(self):
        return self.item['label']


# ------------------------------------------------------------ model access --
KEPT = {}            # models read for their sheet list and kept open for the export: guid -> (doc, note)
OPEN_SECS = {}       # guid -> seconds it took to open


def open_model(rec, settings, reg):
    """Returns (doc, close_after, note, error)."""
    guid = rec['ModelGUID'].lower()
    if guid in KEPT:
        doc, note = KEPT.pop(guid)
        return doc, True, note, None
    doc = core.find_open_doc(app, guid)
    if doc is not None:
        return doc, False, 'Already open in this Revit - exported from your open copy (including unsynced changes)', None
    t0 = time.time()
    doc, region, err = core.open_cloud_model(app, rec, settings.get('region'))
    OPEN_SECS[guid] = time.time() - t0
    if doc is None:
        return None, False, None, err
    r = reg.setdefault(guid, dict(rec))
    r['Name'] = core.model_name(doc)
    r['LastSeen'] = core.now()
    if region:
        r['Region'] = region
        if settings.get('region') != region:
            settings['region'] = region          # learn the ACC region: next models try it first
            core.save_settings(settings)
    return doc, True, err, None


def close_model(doc):
    try:
        doc.Close(False)                     # never save, never sync
    except Exception:
        pass


def close_kept():
    for guid in list(KEPT.keys()):
        close_model(KEPT.pop(guid)[0])


def run_on_model(rec, settings, reg, fn):
    """Open (detached if workshared), call fn(doc), close without saving.
    Returns (result, note, error)."""
    doc, close_after, note, err = open_model(rec, settings, reg)
    if doc is None:
        return None, None, err
    try:
        return fn(doc), note, None
    finally:
        if close_after:
            close_model(doc)


def scan_models(models, settings, reg, cache, keep):
    """Open each model to save its sheet list. keep=True leaves them open for the export
    (each model is then opened only ONCE in this run)."""
    rule = settings.get('naming_rule') or '{DrawingNumber}'
    failed = []
    with core.QuietRevit(uiapp):
        with forms.ProgressBar(title='Opening models to read sheet lists: {value} of {max_value}',
                               cancellable=True) as pb:
            for i, rec in enumerate(models):
                if pb.cancelled:
                    break
                pb.update_progress(i, len(models))
                guid = rec['ModelGUID'].lower()
                doc, close_after, note, err = open_model(rec, settings, reg)
                if doc is None:
                    failed.append('%s: %s' % (core.register_label(rec), err))
                    continue
                try:
                    cache[guid] = core.read_sheet_list(doc, rule)
                except Exception as e:
                    failed.append('%s: %s' % (core.register_label(rec), core.text(e)))
                if close_after and keep:
                    KEPT[guid] = (doc, note)
                elif close_after:
                    close_model(doc)
    core.save_sheet_cache(cache)
    core.save_register(reg)
    return failed


# ----------------------------------------------------------------- windows --
def pick_models(settings):
    reg = core.refresh_register(app.VersionNumber)
    if not reg:
        forms.alert('No cloud models found on this PC.\n\nThe list is built from Revit\'s cloud cache: '
                    'any ACC model you have opened in Revit %s on this PC appears here.' % app.VersionNumber)
        return None, None
    labels = {}
    for r in reg.values():
        lab = core.register_label(r)
        if lab in labels:                       # two models with the same name: add a short ID
            lab = u'%s   (%s)' % (lab, r['ModelGUID'][:8])
        labels[lab] = r
    chosen = forms.SelectFromList.show(sorted(labels.keys()), title='1. Tick the models',
                                       multiselect=True, button_name='Next')
    if not chosen:
        return None, None
    return [labels[c] for c in chosen], reg


def pick_sheets(models, cache):
    """Sheet picker grouped by model. Returns {modelGUID: set(sheet numbers, lower case)}."""
    groups, everything = {}, []
    for rec in models:
        entry = cache.get(rec['ModelGUID'].lower())
        if not entry:
            continue
        mname = entry.get('model') or core.register_label(rec)
        items = []
        for e in entry.get('sheets', []):
            it = SheetItem({'guid': rec['ModelGUID'].lower(), 'number': e['number'],
                            'label': u'%s   %s   [%s]      — %s' % (e['number'], e['name'],
                                                                         e.get('rev') or '-', mname)})
            items.append(it)
        groups[mname] = items
        everything.extend(items)
    if not everything:
        forms.alert('No sheets found in the chosen models.')
        return None
    groups['* All chosen models'] = everything
    chosen = forms.SelectFromList.show(groups, title='2. Tick the drawings (switch model at the top)',
                                       group_selector_title='Model:', multiselect=True,
                                       button_name='Use these drawings',
                                       default_group='* All chosen models')
    if not chosen:
        return None
    picked = {}
    for c in chosen:
        it = getattr(c, 'item', c)
        picked.setdefault(it['guid'], set()).add(it['number'].strip().lower())
    return picked


def export_models(next_rec, n_total, job, settings, reg, cache, log_path, pb_title):
    """Export model after model, as long as next_rec() gives one. Returns (lines, totals, matched)."""
    do_export, out_root = job['do_export'], job['out_root']
    picked = dict((g, set(v)) for g, v in job['picked'].items()) if job.get('picked') is not None else None
    lod_rows = job.get('lod_rows')
    totals = {'ok': 0, 'failed': 0, 'would': 0}
    lines, matched_all = [], set()
    opened_before = set(KEPT.keys())
    done = 0
    with core.QuietRevit(uiapp):
        with forms.ProgressBar(title=pb_title, cancellable=True) as pb:
            while True:
                if pb.cancelled:
                    lines.append('Cancelled by user (models not started are left for other windows / next run).')
                    break
                pb.update_progress(done, max(n_total, done + 1))
                rec = next_rec()
                if rec is None:
                    break
                done += 1
                label = core.register_label(rec)
                guid = rec['ModelGUID'].lower()
                log = []
                t0 = time.time()

                def work(doc):
                    entry = core.read_sheet_list(doc, settings.get('naming_rule') or '{DrawingNumber}')
                    cache[guid] = entry
                    try:
                        core.save_sheet_entry(guid, entry)
                    except Exception:
                        pass
                    links = core.check_links(doc)
                    res = core.export_model(doc, lod_rows, out_root, settings, do_export, log,
                                            picked=picked.get(guid) if picked is not None else None)
                    return res, links, core.model_name(doc)

                try:
                    res, note, err = run_on_model(rec, settings, reg, work)
                except Exception as e:
                    res, note, err = None, None, core.text(e)
                if res is None:
                    lines.append('FAILED %s: %s' % (label, err))
                    log.append([core.now(), 'OPEN', label, '', '', '', '', '', 'FAILED', '', err])
                else:
                    (matched, counts, notes, raw_dir), links, mname = res
                    matched_all |= matched
                    for k in totals:
                        totals[k] += counts[k]
                    extra = ([note] if note else []) + links + notes
                    for n in extra:
                        log.append([core.now(), 'INFO', mname, '', '', '', '', '', 'NOTE', '', n])
                    total = time.time() - t0
                    osecs = OPEN_SECS.get(guid)
                    lines.append('%s: %d drawing(s), %s  |  %s%s' % (
                        mname, len(matched),
                        ('%d file(s) exported, %d failed' % (counts['ok'], counts['failed'])) if do_export
                        else ('%d file(s) would export' % counts['would']),
                        ('open %.0fs + export %.0fs' % (osecs, max(0, total - osecs))
                         if (osecs is not None and guid not in opened_before)
                         else 'export %.0fs (model was already open)' % total),
                        ('  [%s]' % '; '.join(extra)) if extra else ''))
                core.append_csv(log_path, core.LOG_HEADER, log)
                if job.get('_on_done'):
                    job['_on_done'](guid)
    core.save_register(reg)
    return lines, totals, matched_all


def report(title, started, lines, totals, do_export, missing, cad_msg, log_path):
    output.print_md('## %s' % title)
    output.print_md('Time: %.1f min' % ((time.time() - started) / 60.0))
    for l in lines:
        output.print_md('- ' + l)
    output.print_md('**Files %s: %d%s**' % (
        'exported' if do_export else 'that would export',
        totals['ok'] if do_export else totals['would'],
        (', failed: %d' % totals['failed']) if do_export else ''))
    if missing:
        output.print_md('**LOD numbers not found in the chosen models: %d**' % len(missing))
        for m in missing[:30]:
            output.print_md('  - ' + m)
    if cad_msg:
        output.print_md('**Logos:** ' + cad_msg)
    output.print_md('Log: `%s`' % log_path)


def run_queue(qd, job, settings, reg, cache, window_name):
    """Work on a shared export until no model is left. Any number of Revit windows can do this."""
    models = dict((m['ModelGUID'].lower(), m) for m in job['models'])
    for k in ('naming_rule', 'dwg_setup', 'pdf_setup', '_formats'):
        if k in job:
            settings[k] = job[k]
    log_path = core.usable_log_path(os.path.join(job['out_root'], 'SheetExport_log.csv'))
    job['_on_done'] = lambda g: core.queue_done(qd, g)
    claimed = []

    def next_rec():
        g = core.queue_claim(qd, prefer=tuple(KEPT.keys()))
        if g is None:
            return None
        claimed.append(g)
        return models.get(g)

    started = time.time()
    left = len([x for x in os.listdir(qd) if x.endswith('.todo')])
    lines, totals, _ = export_models(next_rec, left, job, settings, reg, cache, log_path,
                                     '%s: exporting (shared with other Revit windows)' % window_name)
    for g in list(KEPT.keys()):                 # kept models another window took: close ours
        close_model(KEPT.pop(g)[0])
    cad_msg = ''
    if core.queue_finished(qd):
        if job.get('run_cad') and core.queue_claim_logos(qd):
            jobs = core.find_raw_dwgs(job['out_root'])
            cad_msg = core.start_img2ole(jobs, job['out_root'], settings) if jobs else 'No DWG files to process.'
        lines.append('All models of the shared export are finished.')
    else:
        lines.append('Other Revit window(s) are still working. The last one to finish starts the logo step.')
    report('Sheet Export - %s (%d model(s) done here)' % (window_name, len(claimed)), started, lines,
           totals, job['do_export'], [], cad_msg, log_path)


def main():
    settings = core.load_settings()
    reg = core.load_register()
    cache = core.load_sheet_cache()

    # another Revit window already started a shared export?
    active = core.queue_active()
    if active:
        qd, job, left = active
        choice = forms.CommandSwitchWindow.show(
            ['Join the running export (%d model(s) left)' % left, 'Start a new export'],
            message='An export is running in another Revit window.')
        if not choice:
            return
        if choice.startswith('Join'):
            run_queue(qd, job, settings, reg, cache, 'Helper window')
            return

    what = forms.CommandSwitchWindow.show([TICK, LOD, ALL], message='What do you want to export?')
    if not what:
        return

    lod_rows = None
    if what == LOD:
        init = os.path.dirname(settings.get('last_lod') or '') or None
        lod_path = forms.pick_file(file_ext='csv', init_dir=init, title='Pick your LOD (saved as CSV UTF-8)')
        if not lod_path:
            return
        lod_rows = core.read_lod(lod_path)
        if not lod_rows:
            forms.alert('No drawing numbers found in that CSV.\n\nIt needs a column like "Drawing Number".')
            return
        settings['last_lod'] = lod_path

    models, reg = pick_models(settings)
    if not models:
        return

    mode = forms.CommandSwitchWindow.show(
        ['Dry run (check only, export nothing)', 'Export'], message='Mode')
    if not mode:
        return
    do_export = mode == 'Export'

    fmt = forms.CommandSwitchWindow.show(['PDF + DWG', 'PDF only', 'DWG only'], message='Formats')
    if not fmt:
        return
    settings['_formats'] = {'pdf': 'Y' if 'PDF' in fmt else 'N', 'dwg': 'Y' if 'DWG' in fmt else 'N'}

    picked = None
    if what == TICK:
        missing = [m for m in models if m['ModelGUID'].lower() not in cache]
        to_scan = missing
        if not missing:
            how = forms.CommandSwitchWindow.show(
                ['Use saved sheet lists (instant)', 'Refresh sheet lists (opens each model)'],
                message='Sheet lists of the chosen models')
            if not how:
                return
            if how.startswith('Refresh'):
                to_scan = models
        elif not forms.alert('%d model(s) have no saved sheet list yet.\n\nRead them now? '
                             'Each opens once in the background (detached). '
                             'Next time this is instant.' % len(missing), yes=True, no=True):
            return
        if to_scan:
            keep = do_export and len(to_scan) <= int(settings.get('keep_open_max', 6))
            failed = scan_models(to_scan, settings, reg, cache, keep)
            if failed:
                forms.alert('Could not read these models:\n\n' + '\n'.join(failed))
        picked = pick_sheets(models, cache)
        if not picked:
            return
        models = [m for m in models if m['ModelGUID'].lower() in picked]
        for guid in list(KEPT.keys()):          # close kept models that have no ticked drawings
            if guid not in picked:
                close_model(KEPT.pop(guid)[0])

    out_root = forms.pick_folder(title='Output folder for the exports')
    if not out_root:
        return
    settings['last_output'] = out_root

    run_cad = False
    if do_export and 'DWG' in fmt:
        run_cad = forms.alert('After exporting, start AutoCAD to embed the logos?\n\n'
                              '(You can also do it later with the "Embed Logos" button.)', yes=True, no=True)

    instant = (what == TICK and not do_export)
    share = False
    if do_export and lod_rows is None and len(models) > 1:
        share = forms.alert('Share this export with other Revit windows?\n\n'
                            'Yes: open another Revit window, click Export Sheets there and choose '
                            '"Join". Each window takes the next model, so it finishes faster.\n'
                            '(64 GB memory: 2-3 windows are fine.)', yes=True, no=True)

    n_sheets = sum(len(v) for v in picked.values()) if picked else None
    if not forms.alert('%s\n\nModels: %d\nDrawings: %s\nFormats: %s\nOutput: %s\nLogos: %s\nShared: %s\n\n%s' % (
            'EXPORT' if do_export else 'DRY RUN', len(models),
            n_sheets if n_sheets is not None else ('%d from LOD' % len(lod_rows) if lod_rows else 'all'),
            fmt, out_root, 'yes' if run_cad else 'no', 'yes' if share else 'no',
            'Instant - no model is opened.' if instant else 'Revit will be busy until it finishes. Continue?'),
            yes=True, no=True):
        return
    core.save_settings(settings)
    core.ensure_dir(out_root)

    job = {'out_root': out_root, 'do_export': do_export, 'run_cad': run_cad, 'models': models,
           'picked': dict((g, sorted(v)) for g, v in picked.items()) if picked else None,
           'lod_rows': lod_rows, 'naming_rule': settings.get('naming_rule'),
           'dwg_setup': settings.get('dwg_setup'), 'pdf_setup': settings.get('pdf_setup'),
           '_formats': settings['_formats']}

    if share:
        qd = core.queue_create(out_root, job, [m['ModelGUID'].lower() for m in models])
        run_queue(qd, job, settings, reg, cache, 'Main window')
        return

    log_path = core.usable_log_path(os.path.join(out_root, 'SheetExport_log.csv'))
    if not log_path.endswith('SheetExport_log.csv'):
        forms.alert('SheetExport_log.csv is open in another program (Excel?).\n\nThis run writes to:\n%s' % log_path)
    started = time.time()

    if instant:
        log, lines, totals = [], [], {'ok': 0, 'failed': 0, 'would': 0}
        for rec in models:
            g = rec['ModelGUID'].lower()
            entry = cache.get(g, {})
            n = core.plan_from_cache(entry, picked.get(g, set()), out_root, settings, log)
            totals['would'] += n
            lines.append('%s: %d drawing(s), %d file(s) would export (sheet list saved %s)' % (
                entry.get('model', '?'), len(picked.get(g, [])), n, entry.get('updated', '?')))
        core.append_csv(log_path, core.LOG_HEADER, log)
        matched_all = set()
    else:
        queue = list(models)
        queue.sort(key=lambda m: m['ModelGUID'].lower() not in KEPT)       # already-open models first
        lines, totals, matched_all = export_models(lambda: queue.pop(0) if queue else None, len(queue),
                                                   job, settings, reg, cache, log_path,
                                                   'Exporting {value} of {max_value} models')

    missing = []
    if lod_rows is not None:
        missing = [r['_listed'] for r in lod_rows if r['_listed'].lower() not in matched_all]
        if missing:
            core.append_csv(log_path, core.LOG_HEADER,
                            [[core.now(), 'CHECK', '', m, '', '', '', '', 'NOT_IN_CHOSEN_MODELS', '',
                              'Not found in any of the chosen models'] for m in missing])

    cad_msg = ''
    if run_cad:
        jobs = core.find_raw_dwgs(out_root)
        cad_msg = core.start_img2ole(jobs, out_root, settings) if jobs else 'No DWG files to process.'
    report('Sheet Export - %s' % ('EXPORT' if do_export else 'DRY RUN'), started, lines, totals,
           do_export, missing, cad_msg, log_path)


try:
    main()
finally:
    close_kept()
