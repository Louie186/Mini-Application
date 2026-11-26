# -*- coding: utf-8 -*-
"""Background checks by Lew: a separate Revit checks your models at set times, finds what changed in every
drawing, and keeps a few models open so printing them is only the export.
"""
from __future__ import print_function

__title__ = 'Back-\nground'
__author__ = 'Lew'
__context__ = 'zero-doc'

import os
import re

from pyrevit import forms, script      # loads pyRevit (and WPF) first

import clr
for _asm in ('PresentationFramework', 'PresentationCore', 'WindowsBase'):
    try:
        clr.AddReference(_asm)
    except Exception:
        pass
import System
from System.Windows.Controls import CheckBox, TextBlock
from System.Windows.Media import BrushConverter

import bimexport_core as core
import bimexport_ui as ui
import bimbackground as bg

ui.setup(__revit__)                     # noqa: F821
app = ui.app
output = script.get_output()
XAML = os.path.join(os.path.dirname(__file__), 'BackgroundWindow.xaml')
_BC = BrushConverter()
STATE_COLOURS = {'stalled': '#C0392B', 'checking': '#2E8B57', 'printing': '#2E8B57', 'applying': '#2E8B57', 'idle': '#1F5FA8',
                 'paused': '#D98E04', 'needs sign-in': '#C0392B', 'stopped': '#6B7785'}


class BackgroundWindow(forms.WPFWindow):

    def __init__(self, reg):
        forms.WPFWindow.__init__(self, XAML)
        self.reg = reg
        self.cfg = bg.load_config()
        self.cache = core.load_sheet_cache()
        self.watch = set(self.cfg['models'])
        self.times_tb.Text = u', '.join(self.cfg['times'])
        for d in range(1, 8):
            getattr(self, 'd%d' % d).IsChecked = d in self.cfg['days']
        self.enabled_cb.IsChecked = bool(self.cfg.get('enabled', True))
        for n in range(0, 7):
            self.keep_cb.Items.Add(core.text(n))
        self.keep_cb.SelectedItem = core.text(min(6, int(self.cfg.get('keep_open') or 0)))
        self._busy = True
        for o in (u'All', u'Ticked only', u'Not ticked'):
            self.show_cb.Items.Add(o)
        self.show_cb.SelectedItem = u'All'
        self._busy = False
        self._fill_models()
        self._refresh(None, None)
        try:                                       # live status
            from System.Windows.Threading import DispatcherTimer
            from System import TimeSpan
            self._timer = DispatcherTimer()
            self._timer.Interval = TimeSpan.FromSeconds(3)
            self._timer.Tick += self._refresh
            self._timer.Start()
        except Exception:
            self._timer = None

    # ---------------------------------------------------------------- models
    def _line(self, g):
        e = self.cache.get(g) or {}
        name = e.get('model') or (self.reg.get(g) or {}).get('Name') or g[:8]
        ch = e.get('bg_changes') or {}
        if not e.get('bg_checked'):
            info = u'not checked yet'
        else:
            att = len([1 for c in ch.values() if c['since_issue'] is None or c['since_issue']])
            info = u'checked %s  ·  %s' % (e['bg_checked'][5:16].replace(u'-', u'/'),
                                               (u'%d need attention' % att) if att else u'nothing to do')
        return name, info

    def _fill_models(self):
        flt = (self.search_tb.Text or u'').strip().lower()
        show = self.show_cb.SelectedItem or u'All'
        self.models_lb.Items.Clear()
        rows = []
        for g, r in self.reg.items():
            g = g.lower()
            name, info = self._line(g)
            if flt and flt not in name.lower():
                continue
            if (show == u'Ticked only' and g not in self.watch) or (show == u'Not ticked' and g in self.watch):
                continue
            rows.append((core.model_sort_key({'Name': name}), g, name, info))
        for _, g, name, info in sorted(rows):
            cb = CheckBox()
            tb = TextBlock()
            tb.Text = u'%s     %s' % (name, info if g in self.watch else u'')
            cb.Content = tb
            cb.Tag = g
            cb.IsChecked = g in self.watch
            cb.Click += self._on_watch
            self.models_lb.Items.Add(cb)

    def _on_watch(self, sender, args):
        (self.watch.add if sender.IsChecked else self.watch.discard)(sender.Tag)
        self.saved_tb.Text = u'Not saved yet - press Save.'

    def _tick_shown(self, on):
        for cb in self.models_lb.Items:
            (self.watch.add if on else self.watch.discard)(cb.Tag)
        self.saved_tb.Text = u'Not saved yet - press Save.'
        self._fill_models()

    def on_tick_all(self, sender, args):
        self._tick_shown(True)

    def on_untick_all(self, sender, args):
        self._tick_shown(False)

    def on_search(self, sender, args):
        self._fill_models()

    def on_show(self, sender, args):
        if not getattr(self, '_busy', False):
            self._fill_models()

    # ---------------------------------------------------------------- status
    def _refresh(self, sender, args):
        st, alive = bg.status(), bg.alive()
        state = (st.get('state') or u'') if alive else (u'stalled' if bg.stalled() else u'not running')
        self.state_tb.Text = state.upper()
        try:
            self.state_bd.Background = _BC.ConvertFromString(STATE_COLOURS.get(state, '#6B7785'))
        except Exception:
            pass
        t = bg.load_todo()
        left = len([i for i in t.get('items', []) if i['state'] == 'waiting'])
        if alive:
            msg = st.get('message') or u''
        elif state == u'stalled':
            msg = u'The background Revit is open but not working - look at it (a message may be waiting), or press Stop'
        elif bg.starting():
            msg = u'Starting the background Revit (1-2 minutes)...'
        else:
            msg = u'Starts at the next check time, or press Check now'
        if left and not alive:
            msg = u'Unfinished check: %d model(s) left - continues where it stopped (press Check now)' % left
        self.state_msg_tb.Text = msg
        kept = st.get('kept') or {}
        self.footer_tb.Text = u'Last check: %s%s   ·   %s' % (
            (st.get('last_check') or u'never')[:16], (u'  (%s)' % st.get('last_summary')) if st.get('last_summary') else u'',
            (u'Open for fast printing: ' + u', '.join(u'%s (%s)' % (self._line(g)[0], (v.get('as_of') or u'')[11:16])
                                                    for g, v in kept.items())) if (alive and kept) else u'No models open for fast printing')
        self.pause_btn.Content = u'Resume' if bg.control() == 'pause' else u'Pause'
        if sender is not None:                    # timer: pick up new check results
            new = core.load_sheet_cache()
            if any((new.get(g) or {}).get('bg_checked') != (self.cache.get(g) or {}).get('bg_checked') for g in self.watch):
                self.cache = new
                self._fill_models()

    # --------------------------------------------------------------- actions
    def _read(self):
        self.cfg['models'] = sorted(self.watch)
        times = sorted(set(u'%02d:%02d' % (int(a), int(b)) for a, b in
                           re.findall(r'(\d{1,2})[:.](\d{2})', self.times_tb.Text or u'') if int(a) < 24 and int(b) < 60))
        self.cfg['times'] = times
        self.cfg['days'] = [d for d in range(1, 8) if getattr(self, 'd%d' % d).IsChecked] or [1, 2, 3, 4, 5]
        self.cfg['enabled'] = bool(self.enabled_cb.IsChecked)
        try:
            self.cfg['keep_open'] = int(self.keep_cb.SelectedItem)
        except Exception:
            pass
        if not self.cfg.get('revit_exe'):
            try:
                self.cfg['revit_exe'] = System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName
            except Exception:
                pass

    def on_save(self, sender, args):
        self._read()
        bg.save_config(self.cfg)
        bg.prune_todo(self.cfg)                   # unticked models leave an unfinished check straight away
        ok, msg = bg.install_schedule(self.cfg)
        self.times_tb.Text = u', '.join(self.cfg['times'])
        self.saved_tb.Text = (u'Saved. ' + msg) if ok else (u'Saved, but: ' + msg)
        self._fill_models()

    def on_check_now(self, sender, args):
        self._read()
        bg.save_config(self.cfg)
        bg.prune_todo(self.cfg)
        if not self.cfg['models']:
            forms.alert('Tick at least one model.')
            return
        bg.set_control('run')
        bg.request_check()
        if not bg.alive():
            bg.start_background_revit(self.cfg, check=False)
            self.saved_tb.Text = u'Starting the background Revit (1-2 minutes), then it checks %d model(s).' % len(self.cfg['models'])
        else:
            self.saved_tb.Text = u'Check requested.'
        self._refresh(None, None)

    def on_reload(self, sender, args):
        gs = [it.Tag for it in self.models_lb.SelectedItems]
        if not gs:
            forms.alert('Select the model line(s) to reload (click a line, Ctrl+click for more).')
            return
        for g in gs:
            bg.request_reload(g)
        bg.set_control('run')
        if not bg.alive():
            self._read()
            bg.save_config(self.cfg)
            bg.start_background_revit(self.cfg, check=False)
            self.saved_tb.Text = u'Starting the background Revit to reload %d model(s) fully.' % len(gs)
        else:
            self.saved_tb.Text = u'%d model(s) go to the front and reload fully.' % len(gs)
        self._refresh(None, None)

    def on_changes(self, sender, args):
        self.action = 'changes'
        self.Close()

    def on_pause(self, sender, args):
        bg.set_control('run' if bg.control() == 'pause' else 'pause')
        self._refresh(None, None)

    def on_stop(self, sender, args):
        if bg.alive() and forms.alert(u'Stop the background Revit?\n\nIt finishes the current model, then closes. '
                                      u'An unfinished check continues where it stopped next time.', yes=True, no=True):
            bg.set_control('stop')
        self._refresh(None, None)

    def on_close(self, sender, args):
        self.Close()


def show_changes(cfg, reg, cache):
    output.print_md(u'## What changed (background checks)')
    for g in cfg['models']:
        e = cache.get(g) or {}
        name = e.get('model') or (reg.get(g) or {}).get('Name') or g[:8]
        ch = e.get('bg_changes') or {}
        if not ch:
            output.print_md(u'### %s\nNot checked yet' % name)
            continue
        att = [(n, c) for n, c in sorted(ch.items()) if c['since_issue'] is None or c['since_issue']]
        output.print_md(u'### %s  -  checked %s  -  %d of %d drawing(s) need attention' % (
            name, (e.get('bg_checked') or u'')[:16], len(att), len(ch)))
        for n, c in att[:300]:
            why = u'never issued' if c['since_issue'] is None else u'; '.join(c['since_issue'])
            output.print_md(u'- **%s**: %s' % (n, why))


def main():
    reg = core.refresh_register(app.VersionNumber)
    if not reg:
        forms.alert('No ACC models found on this PC (open each model once in Revit first).')
        return
    w = BackgroundWindow(dict((g.lower(), r) for g, r in reg.items()))
    w.action = None
    w.ShowDialog()
    try:
        if w._timer is not None:
            w._timer.Stop()
    except Exception:
        pass
    if w.action == 'changes':
        show_changes(bg.load_config(), reg, core.load_sheet_cache())


main()
