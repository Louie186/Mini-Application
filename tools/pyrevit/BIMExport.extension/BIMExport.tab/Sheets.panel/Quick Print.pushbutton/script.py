# -*- coding: utf-8 -*-
"""Quick Print by Lew: print the drawings of a list AS THEY ARE.

Pick a list (CSV) -> each drawing is placed in its model -> each model opens ONCE (detached, ALL worksets,
links loaded) -> the listed drawings print with your saved PDF / CAD settings -> closed without saving.
No checks, no changes. Names: the list's code + the revision the sheet shows now (the last-moment name check
still blocks a name that would not match the sheet).

List columns (only Drawing Number is required):
    Model           any part of the model name (21001, BIM-INT-21001, ...). Empty = found from the saved lists
    Drawing Number  full code, code + revision, or just the sheet number
    Expected Rev    optional: a different revision on the sheet = skipped and reported
    Formats         optional: PDF, DWG or PDF+DWG (empty = your saved setting)
"""
from __future__ import print_function

__title__ = 'Quick\nPrint'
__author__ = 'Lew'
__context__ = 'zero-doc'

import os
import time

from pyrevit import forms, script      # loads pyRevit (and WPF) first

import bimexport_core as core
import bimissue_core as issue
import bimexport_ui as ui

ui.setup(__revit__)                     # noqa: F821
app = ui.app
output = script.get_output()


def read_list(path):
    """Rows in the same shape as a Toolbox request (code, seq, expected, model, formats)."""
    rows = []
    for q in issue.read_request(path):
        f = (q.get('formats') or u'').upper()
        q['fmt'] = {'pdf': 'Y' if 'PDF' in f else 'N', 'dwg': 'Y' if 'DWG' in f else 'N'} if f else None
        rows.append(q)
    return rows


def plan(rows, settings, reg, cache):
    """Place every drawing in a model. Returns (by model {guid: [row]}, unknown [(drawing, why)])."""
    found, why = issue.request_models({'rows': rows}, reg, cache)
    by_model, unknown = {}, []
    for i, q in enumerate(rows):
        g = found.get(i)
        if g and g in reg:
            by_model.setdefault(g, []).append(q)
        else:
            unknown.append((q['code'], why.get(i, u'model unknown')))
    return by_model, unknown


def names_for(by_model, settings, cache):
    """File names, finished at print time with the revision the sheet shows (same rule as Issue Sheets)."""
    midp = {}
    if settings.get('issue_midp') and os.path.exists(settings['issue_midp']):
        midp = issue.midp_index(core.read_lod(settings['issue_midp']))
    names, picked, row_fmt = {}, {}, {}
    for g, rows in by_model.items():
        sheets = dict((s['number'].strip().lower(), s['number']) for s in (cache.get(g) or {}).get('sheets', []))
        for q in rows:
            k = q['seq'].strip().lower()
            parts = core.lod_parts(q['code'])
            if len(parts) >= 7:
                base, mode = u'-'.join(parts[:7]), 'code'
            else:
                codes = sorted(set(u'-'.join(core.lod_parts(h.get('drawingnumber', u''))[:7]) for h in midp.get(k, [])
                                   if len(core.lod_parts(h.get('drawingnumber', u''))) >= 7))
                base, mode = (codes[0], 'code') if len(codes) == 1 else (core.clean(q['seq']), 'number')
            num = sheets.get(k, q['seq'])
            key = u'%s|%s' % (g, num.strip().lower())
            names[key] = {'base': base, 'mode': mode, 'shown': u'', 'expected': q.get('expected', u''), 'norev': True}
            picked.setdefault(g, set()).add(num.strip().lower())
            if q.get('fmt'):
                row_fmt[key] = q['fmt']
    return names, picked, row_fmt


def main():
    settings = core.load_settings()
    reg = core.refresh_register(app.VersionNumber)
    cache = core.load_sheet_cache()
    if not reg:
        forms.alert('No ACC models found on this PC (open each model once in Revit first).')
        return
    path = forms.pick_file(file_ext='csv', init_dir=os.path.dirname(settings.get('quick_list') or u'') or None,
                           title='Quick Print: the list of drawings (CSV UTF-8)')
    if not path:
        return
    settings['quick_list'] = path
    rows = read_list(path)
    if not rows:
        forms.alert('No drawing numbers found in that list.\n\nIt needs a "Drawing Number" column.')
        return
    by_model, unknown = plan(rows, settings, reg, cache)
    if not by_model:
        forms.alert(u'None of the %d drawing(s) could be placed in a model:\n\n%s\n\nFill the Model column '
                    u'(any part of the model name).' % (len(rows), u'\n'.join(u'  • %s: %s' % u for u in unknown[:20])))
        return
    out = settings.get('last_output') or u''
    lines = [u'  • %s: %d drawing(s)' % ((cache.get(g) or {}).get('model') or reg[g].get('Name', g), len(v))
             for g, v in sorted(by_model.items(), key=lambda kv: -len(kv[1]))]
    fm = settings.get('_formats') or {'pdf': 'Y', 'dwg': 'Y'}
    choice = forms.CommandSwitchWindow.show(
        [u'Print now', u'Print to another folder...'],
        message=u'Quick Print: %d drawing(s) in %d model(s)%s\n%s\n\nEach model opens once (all worksets, links), '
                u'prints as it is, closes without saving.\nSave to: %s   ·   %s' % (
                    sum(len(v) for v in by_model.values()), len(by_model),
                    (u'  ·  %d NOT placed (see report)' % len(unknown)) if unknown else u'', u'\n'.join(lines),
                    out or u'(choose)', u' + '.join(f.upper() for f in ('pdf', 'dwg') if core.yes(fm.get(f)))))
    if not choice:
        return
    if choice.startswith(u'Print to') or not out:
        out = forms.pick_folder(title='Where should the drawings be saved?')
        if not out:
            return
        settings['last_output'] = out
    core.ensure_dir(out)

    names, picked, row_fmt = names_for(by_model, settings, cache)
    if row_fmt:                                   # a row asks for a format: switch it on for the run
        for f in ('pdf', 'dwg'):
            if any(v[f] == 'Y' for v in row_fmt.values()):
                fm = dict(fm, **{f: 'Y'})
    settings['_formats'] = fm
    settings['_names'] = names
    settings['_row_formats'] = row_fmt
    skip_links_before = settings.get('skip_links')
    settings['skip_links'] = False                # quick print = ALL worksets and links
    run_cad = settings.get('embed') and fm.get('dwg') == 'Y'
    if run_cad and not ui.autocad_ready(settings):
        run_cad = False
    models = [reg[g] for g in by_model]
    job = {'out_root': out, 'do_export': True, 'run_cad': bool(run_cad), 'models': models,
           'picked': dict((g, sorted(v)) for g, v in picked.items()), 'lod_rows': None, '_formats': fm,
           '_extra_read': lambda doc, guid, entry: entry.__setitem__('issue', issue.read_issue_data(doc))}
    if run_cad:
        core.logo_pipeline_reset(out)
        job['_logo_pipeline'] = True
    log_path = core.usable_log_path(os.path.join(core.logs_dir(out), 'SheetExport_log.csv'))
    failed = ui.wait_background_applies(list(picked.keys()), cache)
    if failed and not forms.alert(u'These background Applies did NOT go through - the prints would NOT include those '
                                  u'changes:\n\n%s\n\nPrint anyway?' % u'\n'.join(u'  \u2022 %s: %s' % f for f in failed),
                                  yes=True, no=True):
        return
    left, jid, fast_txt = ui.fast_print_offer(picked, names, settings, out, run_cad, 'quick',
                                              ('pdf', 'dwg', 'per_model_folder', 'batch_pdf', 'batch_dwg', 'embed',
                                               'acad_exe', 'img2ole_lsp'), row_formats=row_fmt, cache=cache)
    if jid:                                       # models open in the background Revit print there, at the same time
        models = [m for m in models if m['ModelGUID'].lower() in left]
        job['picked'] = dict((g, sorted(v)) for g, v in left.items())
    started, since = time.time(), core.now()      # the clock starts now: your choosing is not counted
    queue = list(models)
    pw, matched = None, set()
    try:
        if models:
            lines_out, totals, matched, pw = ui.export_models(lambda: queue.pop(0) if queue else None, list(models),
                                                              job, settings, reg, cache, log_path, u'Quick Print')
        else:
            lines_out, totals = [], {'ok': 0, 'failed': 0, 'would': 0}
        if jid:
            res = ui.fast_print_wait(jid) or {}
            totals['ok'] += res.get('ok', 0)
            totals['failed'] += res.get('failed', 0)
            lines_out.append(u'%s: %d file(s), %d failed%s' % (fast_txt, res.get('ok', 0), res.get('failed', 0),
                                                               u'' if res else u' - NO ANSWER from the background Revit'))
            for g in (res.get('models') or {}):
                matched = set(matched) | set(left.get(g, [])) | set(picked.get(g, []))
    finally:
        settings['skip_links'] = skip_links_before
        for k in ('_names', '_row_formats'):
            settings.pop(k, None)
        core.save_settings(settings)
    # drawings that were not in their model
    missing = []
    for g, rows_g in by_model.items():
        got = set(x.lower() for x in (matched or set()))
        for q in rows_g:
            if q['seq'].strip().lower() not in got:
                missing.append(u'%s (not found in %s)' % (q['code'], (cache.get(g) or {}).get('model') or g))
    if unknown:
        lines_out.append(u'NOT placed in a model: %d - %s' % (len(unknown), u'; '.join(u'%s: %s' % u for u in unknown[:10])))
    cad_msg, logo_count, logo_since = '', 0, core.now()
    if run_cad and (job.get('_logo_runner') or (jid and os.path.exists(os.path.join(core.logs_dir(out), 'IMG2OLE_runner.lock')))):
        core.logo_queue_done(out)
        logo_count = job.get('_logo_jobs', 0)
        cad_msg = u'AutoCAD started earlier by the logo helper (%d DWG(s)); it finishes in the background.' % logo_count
    elif run_cad:
        jobs = core.find_raw_dwgs(out)
        cad_msg = core.start_img2ole(jobs, out, settings) if jobs else 'No DWG files to process.'
        logo_count = len(jobs) if cad_msg.startswith('AutoCAD started') else 0
    ui.report('Quick Print', started, lines_out, totals, True, missing, cad_msg, log_path)
    if pw is not None:
        pw.finish(ui.finish_title(totals, cad_msg), out, logo_count=logo_count, logo_since=logo_since)


try:
    main()
finally:
    ui.close_kept()
