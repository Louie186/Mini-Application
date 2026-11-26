# -*- coding: utf-8 -*-
"""Background checks by Lew: a separate Revit checks your models at set times (as many as you like), finds
what changed in every drawing, and keeps a few models open so printing them is only the export.

Pause / Resume / Stop, Check now, Reload a model fully now, models, times and memory are all here.
"""
from __future__ import print_function

__title__ = 'Back-\nground'
__author__ = 'Lew'
__context__ = 'zero-doc'

import os
import re

from pyrevit import forms, script      # loads pyRevit (and WPF) first

import System
import bimexport_core as core
import bimexport_ui as ui
import bimbackground as bg

ui.setup(__revit__)                     # noqa: F821
app = ui.app
output = script.get_output()


def _name(reg, cache, g):
    return (cache.get(g) or {}).get('model') or (reg.get(g) or {}).get('Name') or g[:8]


def status_text(cfg, reg, cache):
    st, alive = bg.status(), bg.alive()
    if not alive:
        head = u'Background Revit: NOT RUNNING'
    else:
        head = u'Background Revit: %s - %s' % ((st.get('state') or u'running').upper(), st.get('message') or u'')
    t = bg.load_todo()
    left = len([i for i in t.get('items', []) if i['state'] == 'waiting'])
    lines = [head]
    if left:
        lines.append(u'Unfinished check: %d model(s) left (continues where it stopped)' % left)
    lines.append(u'Last check: %s  %s' % ((st.get('last_check') or u'never')[:16], st.get('last_summary') or u''))
    lines.append(u'Watching %d model(s)  ·  %s  %s  ·  keep %s open  ·  pause below %s GB free%s' % (
        len(cfg['models']), u', '.join(cfg['times']) or u'no times',
        u'/'.join(bg.DAY_NAMES[d - 1][:3] for d in cfg['days']), cfg['keep_open'], cfg['min_free_gb'],
        u'' if cfg.get('enabled', True) else u'  ·  SCHEDULE OFF'))
    kept = st.get('kept') or {}
    if alive and kept:
        lines.append(u'Open for fast printing: ' + u', '.join(u'%s (as of %s)' % (_name(reg, cache, g), (v.get('as_of') or u'')[11:16])
                                                                for g, v in kept.items()))
    lines.append(u'Free memory now: %.0f GB' % bg.free_gb())
    return u'\n'.join(lines)


def pick_models(reg, cache, title, preselect=()):
    labels = dict((core.register_label(r), g.lower()) for g, r in reg.items())
    items = sorted(labels.keys(), key=lambda s: s.lower())
    try:
        items = [forms.TemplateListItem(l, checked=labels[l] in preselect) for l in items]
    except Exception:
        pass
    res = forms.SelectFromList.show(items, multiselect=True, title=title, button_name='OK')
    if res is None:
        return None
    return [labels[core.text(x)] for x in res]


def show_changes(cfg, reg, cache):
    output.print_md(u'## What changed - last background checks')
    any_ = False
    for g in cfg['models']:
        e = cache.get(g) or {}
        ch = e.get('bg_changes') or {}
        if not ch:
            output.print_md(u'- **%s**: not checked yet' % _name(reg, cache, g))
            continue
        att = [(n, c) for n, c in sorted(ch.items()) if c['since_issue'] is None or c['since_issue']]
        output.print_md(u'### %s  (checked %s, %s)' % (_name(reg, cache, g), (e.get('bg_checked') or u'')[:16],
                                                       u'reloaded by you' if e.get('bg_kind') == 'reload' else u'scheduled'))
        output.print_md(u'%d of %d drawing(s) need attention' % (len(att), len(ch)))
        for n, c in att[:200]:
            any_ = True
            why = u'never issued' if c['since_issue'] is None else u'; '.join(c['since_issue'])
            new = u'' if not c.get('since_check') else u'  ·  **new since the previous check**'
            output.print_md(u'- %s: %s%s' % (n, why, new))
    if not any_:
        output.print_md(u'Nothing needs attention.')


def main():
    reg = core.refresh_register(app.VersionNumber)
    cfg = bg.load_config()
    if not cfg.get('revit_exe'):
        try:
            cfg['revit_exe'] = System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName
            bg.save_config(cfg)
        except Exception:
            pass
    while True:
        cache = core.load_sheet_cache()
        cfg = bg.load_config()
        paused = bg.control() == 'pause'
        opts = [u'Check now', u'Reload a model fully now...', u'What changed', u'Resume' if paused else u'Pause',
                u'Stop the background Revit', u'Start the background Revit', u'Models to watch...',
                u'Schedule (times and days)...', u'Memory (models kept open, auto-pause)...',
                u'Turn the schedule %s' % (u'OFF' if cfg.get('enabled', True) else u'ON')]
        c = forms.CommandSwitchWindow.show(opts, message=status_text(cfg, reg, cache))
        if not c:
            return
        if c == u'Check now':
            if not cfg['models']:
                forms.alert('Choose the models to watch first.')
                continue
            bg.request_check()
            if not bg.alive():
                bg.start_background_revit(cfg, check=False)
                forms.alert(u'Starting the background Revit (1-2 minutes). It checks %d model(s), one by one.\n\n'
                            u'Leave it running - press this button any time to see where it is.' % len(cfg['models']))
        elif c.startswith(u'Reload'):
            gs = pick_models(reg, cache, 'Reload which model(s) fully now?', ())
            if not gs:
                continue
            if bg.alive():
                for g in gs:
                    bg.request_reload(g)
                forms.alert(u'%d model(s) go to the FRONT of the background list.' % len(gs))
            else:
                how = forms.CommandSwitchWindow.show([u'Start the background Revit and reload there',
                                                      u'Reload here now (this Revit is busy meanwhile)'],
                                                     message=u'No background Revit is running.')
                if not how:
                    continue
                if how.startswith(u'Start'):
                    for g in gs:
                        bg.request_reload(g)
                    bg.start_background_revit(cfg, check=False)
                else:
                    with forms.ProgressBar(title='Reloading fully (all worksets): {value} of {max_value}') as pb:
                        res = bg.read_here_now(ui.uiapp, gs, progress=lambda i, n: pb.update_progress(i, n))
                    forms.alert(u'\n'.join(u'%s: %s - %s' % (_name(reg, core.load_sheet_cache(), r['guid']), r['state'],
                                                             r.get('note', u'')) for r in res))
        elif c == u'What changed':
            show_changes(cfg, reg, cache)
            return
        elif c in (u'Pause', u'Resume'):
            bg.set_control('pause' if c == u'Pause' else 'run')
        elif c.startswith(u'Stop'):
            if forms.alert(u'Stop the background Revit?\n\nIt finishes the current model, closes the models it keeps '
                           u'open and closes. An unfinished check continues where it stopped next time.', yes=True, no=True):
                bg.set_control('stop')
        elif c.startswith(u'Start'):
            bg.set_control('run')
            bg.start_background_revit(cfg, check=False)
        elif c.startswith(u'Models'):
            gs = pick_models(reg, cache, 'Models to watch in the background', set(cfg['models']))
            if gs is not None:
                cfg['models'] = gs
                bg.save_config(cfg)
        elif c.startswith(u'Schedule'):
            t = forms.ask_for_string(default=u', '.join(cfg['times']), title='Check times',
                                     prompt=u'Times (24 h), as many as you like, e.g. 07:00, 10:00, 12:30, 15:00, 18:00')
            if t is None:
                continue
            times = sorted(set(u'%02d:%02d' % (int(a), int(b)) for a, b in re.findall(r'(\d{1,2})[:.](\d{2})', t)
                               if int(a) < 24 and int(b) < 60))
            days = forms.SelectFromList.show(bg.DAY_NAMES, multiselect=True, title='On which days?', button_name='OK')
            cfg['times'] = times
            if days:
                cfg['days'] = [bg.DAY_NAMES.index(d) + 1 for d in days]
            bg.save_config(cfg)
            ok, msg = bg.install_schedule(cfg)
            forms.alert(msg)
        elif c.startswith(u'Memory'):
            k = forms.ask_for_string(default=core.text(cfg['keep_open']), title='Models kept open',
                                     prompt=u'How many models may stay open in the background Revit for fast printing? '
                                            u'(0 = none; about 3-4 with 64 GB)')
            m = forms.ask_for_string(default=core.text(cfg['min_free_gb']), title='Auto-pause',
                                     prompt=u'Pause the background work when free memory is below (GB):')
            try:
                if k is not None:
                    cfg['keep_open'] = max(0, int(k))
                if m is not None:
                    cfg['min_free_gb'] = max(0.0, float(m))
            except Exception:
                forms.alert('Numbers only, please.')
                continue
            cw = forms.alert(u'Close the background Revit after each check?\n\nNo = keep it running so models stay '
                             u'open for fast printing.', yes=True, no=True)
            cfg['close_when_done'] = bool(cw)
            bg.save_config(cfg)
        elif c.startswith(u'Turn the schedule'):
            cfg['enabled'] = not cfg.get('enabled', True)
            bg.save_config(cfg)
            ok, msg = bg.install_schedule(cfg)
            forms.alert(u'Schedule %s. %s' % (u'ON' if cfg['enabled'] else u'OFF', msg))


main()
