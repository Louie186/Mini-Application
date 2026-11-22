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
def run_on_model(rec, settings, reg, fn):
    """Open the model (detached if workshared), call fn(doc), close without saving.
    A model already open in THIS Revit is used as it is and left open.
    Returns (result, note, error)."""
    guid = rec['ModelGUID'].lower()
    doc = core.find_open_doc(app, guid)
    opened_here, note, region = False, None, None
    if doc is None:
        doc, region, err = core.open_cloud_model(app, rec, settings.get('region'))
        if doc is None:
            return None, None, err
        opened_here, note = True, err
    else:
        note = 'Already open in this Revit - exported from your open copy (including unsynced changes)'
    try:
        r = reg.setdefault(guid, dict(rec))
        r['Name'] = core.model_name(doc)
        r['LastSeen'] = core.now()
        if region:
            r['Region'] = region
            if settings.get('region') != region:
                settings['region'] = region          # learn the ACC region: next models try it first
                core.save_settings(settings)
        return fn(doc), note, None
    finally:
        if opened_here:
            try:
                doc.Close(False)                     # never save, never sync
            except Exception:
                pass


def scan_models(models, settings, reg, cache):
    """Open each model once to save its sheet list."""
    rule = settings.get('naming_rule') or '{DrawingNumber}'
    failed = []
    with core.QuietRevit(uiapp):
        with forms.ProgressBar(title='Reading sheet lists: {value} of {max_value} models', cancellable=True) as pb:
            for i, rec in enumerate(models):
                if pb.cancelled:
                    break
                pb.update_progress(i, len(models))
                try:
                    res, note, err = run_on_model(rec, settings, reg, lambda d: core.read_sheet_list(d, rule))
                except Exception as e:
                    res, err = None, core.text(e)
                if res is None:
                    failed.append('%s: %s' % (core.register_label(rec), err))
                else:
                    cache[rec['ModelGUID'].lower()] = res
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
    labels = dict((core.register_label(r), r) for r in reg.values())
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


def main():
    settings = core.load_settings()
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

    picked = None
    cache = core.load_sheet_cache()
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
                             'Each opens once in the background (detached), then closes. '
                             'Next time this is instant.' % len(missing), yes=True, no=True):
            return
        if to_scan:
            failed = scan_models(to_scan, settings, reg, cache)
            if failed:
                forms.alert('Could not read these models:\n\n' + '\n'.join(failed))
        picked = pick_sheets(models, cache)
        if not picked:
            return
        models = [m for m in models if m['ModelGUID'].lower() in picked]

    mode = forms.CommandSwitchWindow.show(
        ['Dry run (check only, export nothing)', 'Export'], message='Mode')
    if not mode:
        return
    do_export = mode == 'Export'

    fmt = forms.CommandSwitchWindow.show(['PDF + DWG', 'PDF only', 'DWG only'], message='Formats')
    if not fmt:
        return
    settings['_formats'] = {'pdf': 'Y' if 'PDF' in fmt else 'N', 'dwg': 'Y' if 'DWG' in fmt else 'N'}

    out_root = forms.pick_folder(title='Output folder for the exports')
    if not out_root:
        return
    settings['last_output'] = out_root

    run_cad = False
    if do_export and 'DWG' in fmt:
        run_cad = forms.alert('After exporting, start AutoCAD to embed the logos?\n\n'
                              '(You can also do it later with the "Embed Logos" button.)', yes=True, no=True)

    n_sheets = sum(len(v) for v in picked.values()) if picked else None
    instant = (what == TICK and not do_export)
    if not forms.alert('%s\n\nModels: %d\nDrawings: %s\nFormats: %s\nOutput: %s\nLogos: %s\n\n%s' % (
            'EXPORT' if do_export else 'DRY RUN', len(models),
            n_sheets if n_sheets is not None else ('%d from LOD' % len(lod_rows) if lod_rows else 'all'),
            fmt, out_root, 'yes' if run_cad else 'no',
            'Instant - no model is opened.' if instant else 'Revit will be busy until it finishes. Continue?'),
            yes=True, no=True):
        return
    core.save_settings(settings)

    log_path = core.usable_log_path(os.path.join(out_root, 'SheetExport_log.csv'))
    if not log_path.endswith('SheetExport_log.csv'):
        forms.alert('SheetExport_log.csv is open in another program (Excel?).\n\nThis run writes to:\n%s' % log_path)

    totals = {'ok': 0, 'failed': 0, 'would': 0}
    lines, matched_all = [], set()
    started = time.time()

    if instant:
        log = []
        for rec in models:
            entry = cache.get(rec['ModelGUID'].lower(), {})
            n = core.plan_from_cache(entry, picked.get(rec['ModelGUID'].lower(), set()), out_root, settings, log)
            totals['would'] += n
            lines.append('%s: %d drawing(s), %d file(s) would export (sheet list saved %s)' % (
                entry.get('model', '?'), len(picked.get(rec['ModelGUID'].lower(), [])), n, entry.get('updated', '?')))
        core.append_csv(log_path, core.LOG_HEADER, log)
    else:
        with core.QuietRevit(uiapp):
            with forms.ProgressBar(title='Exporting {value} of {max_value} models', cancellable=True) as pb:
                for i, rec in enumerate(models):
                    if pb.cancelled:
                        lines.append('Cancelled by user.')
                        break
                    pb.update_progress(i, len(models))
                    label = core.register_label(rec)
                    guid = rec['ModelGUID'].lower()
                    log = []
                    t0 = time.time()

                    def work(doc):
                        cache[guid] = core.read_sheet_list(doc, settings.get('naming_rule') or '{DrawingNumber}')
                        links = core.check_links(doc)
                        res = core.export_model(doc, lod_rows, out_root, settings, do_export, log,
                                                picked=picked.get(guid) if picked else None)
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
                        lines.append('%s: %d drawing(s), %s, %.0fs%s' % (
                            mname, len(matched),
                            ('%d file(s) exported, %d failed' % (counts['ok'], counts['failed'])) if do_export
                            else ('%d file(s) would export' % counts['would']),
                            time.time() - t0, ('  [%s]' % '; '.join(extra)) if extra else ''))
                    core.append_csv(log_path, core.LOG_HEADER, log)
                pb.update_progress(len(models), len(models))
        core.save_register(reg)
        core.save_sheet_cache(cache)

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

    output.print_md('## Sheet Export - %s' % ('EXPORT' if do_export else 'DRY RUN'))
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


main()
