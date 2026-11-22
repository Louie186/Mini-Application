# -*- coding: utf-8 -*-
"""Export LOD sheets from chosen ACC models to PDF + DWG, then embed logos in AutoCAD.

Pick: LOD (CSV) -> Dry run / Export -> output folder -> models (tick boxes).
Each model opens in the background (detached, all worksets), exports, closes without saving.
"""
from __future__ import print_function

__title__ = 'Export\nSheets'
__author__ = 'BIM Export'

import os
import io
import time

from pyrevit import forms, script

import bimexport_core as core

uiapp = __revit__                       # noqa: F821  (provided by pyRevit)
app = uiapp.Application
output = script.get_output()


def ask_inputs(settings):
    # 1. what to export
    what = forms.CommandSwitchWindow.show(
        ['Sheets from my LOD (CSV)', 'All sheets in the chosen models'],
        message='What do you want to export?')
    if not what:
        return None
    lod_rows, lod_path = None, None
    if what.startswith('Sheets from'):
        init = os.path.dirname(settings.get('last_lod') or '') or None
        lod_path = forms.pick_file(file_ext='csv', init_dir=init, title='Pick your LOD (saved as CSV UTF-8)')
        if not lod_path:
            return None
        lod_rows = core.read_lod(lod_path)
        if not lod_rows:
            forms.alert('No drawing numbers found in that CSV.\n\n'
                        'It needs a column like "Drawing Number" or "Sheet Number".')
            return None
        settings['last_lod'] = lod_path

    # 2. dry run or export
    mode = forms.CommandSwitchWindow.show(
        ['Dry run (check only, export nothing)', 'Export PDF + DWG'],
        message='Mode')
    if not mode:
        return None
    do_export = mode.startswith('Export')

    # 3. output folder
    out_root = forms.pick_folder(title='Output folder for the exports')
    if not out_root:
        return None
    settings['last_output'] = out_root

    # 4. models
    reg = core.refresh_register(app.VersionNumber)
    if not reg:
        forms.alert('No cloud models found on this PC.\n\n'
                    'The list is built from Revit\'s cloud cache: any ACC model you have opened '
                    'in Revit %s on this PC appears here.' % app.VersionNumber)
        return None
    labels = {}
    for r in reg.values():
        labels[core.register_label(r)] = r
    chosen = forms.SelectFromList.show(sorted(labels.keys()), title='Tick the models to export',
                                       multiselect=True, button_name='Use these models')
    if not chosen:
        return None
    models = [labels[c] for c in chosen]

    # 5. logos
    run_cad = False
    if do_export:
        run_cad = forms.alert('After exporting, start AutoCAD to embed the logos (IMG2OLE)?',
                              yes=True, no=True)
    settings['run_img2ole'] = bool(run_cad)

    summary = ('%s\n\nModels: %d\nSheets: %s\nOutput: %s\nLogos in AutoCAD: %s\n\n'
               'Revit will be busy until it finishes. Continue?' %
               ('EXPORT' if do_export else 'DRY RUN', len(models),
                ('%d from LOD' % len(lod_rows)) if lod_rows is not None else 'all',
                out_root, 'yes' if run_cad else 'no'))
    if not forms.alert(summary, yes=True, no=True):
        return None
    return lod_rows, lod_path, do_export, out_root, models, run_cad


def main():
    settings = core.load_settings()
    picked = ask_inputs(settings)
    core.save_settings(settings)
    if not picked:
        return
    lod_rows, lod_path, do_export, out_root, models, run_cad = picked

    log_path = os.path.join(out_root, 'SheetExport_log.csv')
    reg = core.load_register()
    matched_all = set()
    totals = {'ok': 0, 'failed': 0, 'would': 0}
    cad_jobs = []
    model_lines = []
    started = time.time()

    with core.QuietRevit(uiapp):
        with forms.ProgressBar(title='Exporting {value} of {max_value} models', cancellable=True) as pb:
            for i, rec in enumerate(models):
                if pb.cancelled:
                    model_lines.append('Cancelled by user.')
                    break
                pb.update_progress(i, len(models))
                label = core.register_label(rec)
                log = []
                doc = core.find_open_doc(app, rec['ModelGUID'])
                opened_here = False
                if doc is None:
                    doc, region, err = core.open_cloud_model(app, rec, settings.get('region'))
                    if doc is None:
                        model_lines.append('FAILED to open %s: %s' % (label, err))
                        core.append_csv(log_path, core.LOG_HEADER,
                                        [[core.now(), 'OPEN', label, '', '', '', '', '', 'OPEN_FAILED', '', err]])
                        continue
                    opened_here = True
                    r = reg.get(rec['ModelGUID'].lower(), rec)
                    r['Region'] = region
                try:
                    name = core.model_name(doc)
                    r = reg.setdefault(rec['ModelGUID'].lower(), dict(rec))
                    r['Name'] = name
                    r['LastSeen'] = core.now()
                    t0 = time.time()
                    link_notes = core.check_links(doc)
                    matched, counts, notes, raw_dir = core.export_model(
                        doc, lod_rows, out_root, settings, do_export, log)
                    matched_all |= matched
                    for k in totals:
                        totals[k] += counts[k]
                    if do_export and os.path.isdir(raw_dir):
                        final_dir = os.path.join(os.path.dirname(raw_dir), 'DWG')
                        for f in os.listdir(raw_dir):
                            if f.lower().endswith('.dwg'):
                                cad_jobs.append((os.path.join(raw_dir, f), final_dir))
                    for n in link_notes + notes:
                        log.append([core.now(), 'INFO', name, '', '', '', '', '', 'NOTE', '', n])
                    model_lines.append('%s: %d sheet(s) matched, %s, %.0fs%s' % (
                        name, len(matched),
                        ('%d exported, %d failed' % (counts['ok'], counts['failed'])) if do_export
                        else ('%d file(s) would export' % counts['would']),
                        time.time() - t0,
                        ('  [%s]' % '; '.join(link_notes)) if link_notes else ''))
                except Exception as e:
                    model_lines.append('ERROR in %s: %s' % (label, e))
                    log.append([core.now(), 'ERROR', label, '', '', '', '', '', 'ERROR', '', core.text(e)])
                finally:
                    core.append_csv(log_path, core.LOG_HEADER, log)
                    if opened_here and doc is not None:
                        try:
                            doc.Close(False)      # never save, never sync
                        except Exception as e:
                            model_lines.append('Could not close %s: %s' % (label, e))
            pb.update_progress(len(models), len(models))

    core.save_register(reg)

    # LOD numbers not found in any chosen model
    missing = []
    if lod_rows is not None:
        for row in lod_rows:
            if row['_listed'].lower() not in matched_all:
                missing.append(row['_listed'])
        if missing:
            core.append_csv(log_path, core.LOG_HEADER,
                            [[core.now(), 'CHECK', '', m, '', '', '', '', 'NOT_IN_CHOSEN_MODELS', '',
                              'Not found in any of the chosen models'] for m in missing])

    cad_msg = ''
    if do_export and run_cad and cad_jobs:
        cad_msg = core.start_img2ole(cad_jobs, out_root, settings)

    # report
    output.print_md('## Sheet Export - %s' % ('EXPORT' if do_export else 'DRY RUN'))
    output.print_md('Time: %.1f min' % ((time.time() - started) / 60.0))
    for l in model_lines:
        output.print_md('- ' + l)
    if do_export:
        output.print_md('**Files exported: %d, failed: %d**' % (totals['ok'], totals['failed']))
    else:
        output.print_md('**Files that would export: %d**' % totals['would'])
    if missing:
        output.print_md('**LOD numbers not found in the chosen models: %d**' % len(missing))
        for m in missing[:30]:
            output.print_md('  - ' + m)
    if cad_msg:
        output.print_md('**Logos:** ' + cad_msg)
    output.print_md('Log: `%s`' % log_path)


main()
