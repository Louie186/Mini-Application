# -*- coding: utf-8 -*-
"""Embed the logos in exported DWGs (AutoCAD + IMG2OLE), and show the last result.

Pick the export output folder. Every <model>\\_DWG_raw\\*.dwg is processed by AutoCAD;
the finished drawings go to <model>\\DWG\\.
"""
from __future__ import print_function

__title__ = 'Embed\nLogos'
__author__ = 'BIM Export'
__context__ = 'zero-doc'

import os

from pyrevit import forms, script

import bimexport_core as core

output = script.get_output()


def main():
    settings = core.load_settings()
    out_root = forms.pick_folder(title='Export output folder (the one that holds the model folders)')
    if not out_root:
        return

    # last result
    counts, problems = core.img2ole_summary(out_root)
    if counts:
        output.print_md('## Last logo run in this folder')
        for k in sorted(counts):
            output.print_md('- %s: %d drawing(s)' % (k, counts[k]))
        for p in problems[:30]:
            output.print_md('  - ' + p)

    jobs = core.find_raw_dwgs(out_root)
    if not jobs:
        forms.alert('No DWGs found in <model>\\_DWG_raw\\ under:\n%s\n\nExport the sheets first.' % out_root)
        return

    # checks, with a chance to fix them here
    if not os.path.exists(settings.get('img2ole_lsp') or ''):
        lsp = forms.pick_file(file_ext='lsp', title='Where is IMG2OLE.lsp?')
        if not lsp:
            return
        settings['img2ole_lsp'] = lsp
    if not core.find_acad(settings):
        exe = forms.pick_file(file_ext='exe', title='Where is acad.exe? (e.g. C:\\Program Files\\Autodesk\\AutoCAD 2025)')
        if not exe:
            return
        settings['acad_exe'] = exe
    core.save_settings(settings)

    lsp_dir = os.path.dirname(settings['img2ole_lsp'])
    if not forms.alert('Embed logos in %d DWG(s)?\n\nAutoCAD: %s\nIMG2OLE: %s\n\n'
                       'Before you start, check once:\n'
                       '- AutoCAD Trusted Locations include %s\n'
                       '- AutoCAD is not busy with other work\n\n'
                       'Finished drawings go to <model>\\DWG\\. Click this button again later to see the result.'
                       % (len(jobs), core.find_acad(settings), settings['img2ole_lsp'], lsp_dir),
                       yes=True, no=True):
        return
    msg = core.start_img2ole(jobs, out_root, settings)
    output.print_md('**Logos:** ' + msg)
    forms.alert(msg)


main()
