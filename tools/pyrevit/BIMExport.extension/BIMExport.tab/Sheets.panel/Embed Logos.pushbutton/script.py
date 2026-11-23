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


def autocad_ready(settings, ask=True):
    """Check (and offer to fix) what the logo step needs. True = ready."""
    lsp = core.img2ole_path(settings)
    if not lsp:
        forms.alert('IMG2OLE.lsp was not found.\n\nThe BIMExport extension folder should contain an "img2ole" '
                    'folder. Copy the whole BIMExport.extension again from the zip.')
        return False
    if not core.find_acad(settings):
        exe = forms.pick_file(file_ext='exe', title='AutoCAD not found - where is acad.exe? '
                                                    '(C:\\Program Files\\Autodesk\\AutoCAD 20xx)')
        if not exe:
            return False
        settings['acad_exe'] = exe
        core.save_settings(settings)
    folder = os.path.dirname(lsp)
    if settings.get('acad_trust_manual') == folder:
        return True                                   # you confirmed the manual setup before
    profiles, missing = core.acad_trusted_missing(folder)
    if not profiles:
        try:
            import System
            System.Windows.Clipboard.SetText(folder)
        except Exception:
            pass
        choice = forms.CommandSwitchWindow.show(
            ['I added it - continue', 'Continue - I will click "Always Load" in AutoCAD', 'Cancel'],
            message=('I could not find AutoCAD\'s settings automatically (found: %s).\n\n'
                     'Add this folder to AutoCAD\'s Trusted Locations once (the path is on your clipboard):\n%s\n\n'
                     'AutoCAD: OPTIONS > Files > Trusted Locations > Add > paste > OK.\n'
                     'Or skip it: the first time, AutoCAD asks about IMG2OLE.lsp - click "Always Load".'
                     % (', '.join(core.acad_versions_found()) or 'nothing', folder)))
        if not choice or choice == 'Cancel':
            return False
        if choice.startswith('I added'):
            settings['acad_trust_manual'] = folder
            core.save_settings(settings)
        return True
    if missing and ask:
        if not forms.alert('One-time AutoCAD setup:\n\nAdd this folder to AutoCAD\'s Trusted Locations, so AutoCAD '
                           'can run the logo tool without a security pop-up?\n\n%s' % folder, yes=True, no=True):
            return False
        while core.acad_running():
            if not forms.alert('Please close AutoCAD first (it would overwrite this setting when it closes).\n\n'
                               'Closed it?', yes=True, no=True):
                return False
        n = core.acad_add_trusted(folder)
        forms.alert('Done: added to %d AutoCAD profile(s).' % n)
    return True

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

    if not autocad_ready(settings):
        return
    if not forms.alert('Embed logos in %d DWG(s)?\n\nAutoCAD: %s\n\nAutoCAD opens and works through them. '
                       'Avoid copy/paste (Ctrl+C) until it says "IMG2OLE finished". Finished drawings go to '
                       '<model>\\DWG\\. Click this button again later to see the result.'
                       % (len(jobs), core.find_acad(settings)), yes=True, no=True):
        return
    msg = core.start_img2ole(jobs, out_root, settings)
    output.print_md('**Logos:** ' + msg)
    forms.alert(msg)


main()
