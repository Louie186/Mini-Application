# -*- coding: utf-8 -*-
"""Shared parts of the BIM Export buttons (Export Sheets, Issue Sheets):
opening models, the AutoCAD check, the threaded progress window, the export loop, the report.
Call setup(__revit__) once from the button script."""
from __future__ import print_function

import os
import time

from pyrevit import forms, script

import clr
for _asm in ('PresentationFramework', 'PresentationCore', 'WindowsBase', 'System.Xaml'):
    try:
        clr.AddReference(_asm)          # WPF libraries, whatever order the buttons import things in
    except Exception:
        pass

import bimexport_core as core

uiapp = None
app = None
output = None


def setup(revit_uiapp):
    global uiapp, app, output
    uiapp = revit_uiapp
    app = revit_uiapp.Application
    output = script.get_output()


# ------------------------------------------------------------ model access --
KEPT = {}            # models read for their sheet list and kept open for the export: guid -> (doc, note)
OPEN_SECS = {}       # guid -> seconds it took to open


def open_model(rec, settings, reg, worksets=None):
    """Returns (doc, close_after, note, error)."""
    guid = rec['ModelGUID'].lower()
    if guid in KEPT:
        doc, note = KEPT.pop(guid)
        return doc, True, note, None
    doc = core.find_open_doc(app, guid)
    if doc is not None:
        return doc, False, 'Already open in this Revit - exported from your open copy (including unsynced changes)', None
    t0 = time.time()
    if worksets is None:
        worksets = 'skip' if settings.get('skip_links') else 'all'
    doc, region, err = core.open_cloud_model(app, rec, settings.get('region'),
                                             bool(settings.get('allow_non_workshared', False)),
                                             worksets, settings.get('link_pattern') or '*Link*')
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


def scan_models(models, settings, reg, cache, keep, extra=None):
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
                try:
                    pb.title = u'Reading drawing lists (quick open, no links): model %d of %d  \u00b7  %s' % (
                        i + 1, len(models), rec.get('Name') or core.register_label(rec))
                except Exception:
                    pass
                guid = rec['ModelGUID'].lower()
                doc, close_after, note, err = open_model(rec, settings, reg, worksets='none')   # quick: no worksets, no links
                if doc is None:
                    failed.append('%s: %s' % (core.register_label(rec), err))
                    continue
                try:
                    cache[guid] = core.read_sheet_list(doc, rule)
                    cache[guid]['guid'] = guid
                    if extra:
                        extra(doc, guid, cache[guid])          # e.g. Issue Sheets: revisions, title blocks
                except Exception as e:
                    failed.append('%s: %s' % (core.register_label(rec), core.text(e)))
                if close_after:
                    close_model(doc)                  # light copy: never reused for printing
    core.save_sheet_cache(cache)
    core.save_register(reg)
    return failed


# ------------------------------------------------------------------ window --
from System.Windows import Thickness, FontWeights, VerticalAlignment, GridLength
from System.Windows.Controls import (CheckBox, TreeViewItem, StackPanel, TextBlock, ComboBox,
                                     Orientation)
from System.Windows.Media import BrushConverter

_BC = BrushConverter()


def _brush(hexcolor):
    b = _BC.ConvertFromString(hexcolor)
    try:
        b.Freeze()                      # shareable between the Revit thread and the progress window thread
    except Exception:
        pass
    return b


MUTED = _brush('#6B7785')
ACCENT = _brush('#1F5FA8')
NO_GROUPING = u'(no grouping)'


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


def needs_scan(entry):
    return not entry or 'orgs' not in entry or 'setups' not in entry


def plain_text(t):
    """A TextBlock, so names show exactly as in ACC (WPF hides '_' in plain checkbox text)."""
    tb = TextBlock()
    tb.Text = t
    return tb


# ------------------------------------------------------- progress window --
from System import Action
from System.Windows import Visibility, GridUnitType
from System.Windows.Controls import Grid, ColumnDefinition
from System.Windows.Threading import Dispatcher, DispatcherPriority

PXAML = os.path.join(os.path.dirname(__file__), 'ProgressWindow.xaml')
OK_BRUSH = _brush('#1E8A4C')
BAD_BRUSH = _brush('#C0392B')
RUN_BRUSH = _brush('#1F5FA8')
ICON = {'wait': (u'○', MUTED), 'run': (u'▶', RUN_BRUSH), 'ok': (u'✔', OK_BRUSH),
        'bad': (u'✖', BAD_BRUSH), 'skip': (u'–', MUTED)}


def _cell(grid, col, text, brush=None, bold=False):
    tb = TextBlock()
    tb.Text = text
    if brush is not None:
        tb.Foreground = brush
    if bold:
        tb.FontWeight = FontWeights.SemiBold
    tb.Margin = Thickness(0, 2, 6, 2)
    Grid.SetColumn(tb, col)
    grid.Children.Add(tb)
    return tb


def _row(widths):
    g = Grid()
    for w in widths:
        cd = ColumnDefinition()
        cd.Width = GridLength(w) if w else GridLength(1, GridUnitType.Star)
        g.ColumnDefinitions.Add(cd)
    return g


class ProgressWindow(forms.WPFWindow):
    """Fixed window: all models with their status, and the drawings of the current model.
    Normally lives on its OWN thread (see ProgressUI), so it keeps moving while Revit is busy."""

    def __init__(self, models, picked, cache, formats, title, skip_links=False, own_thread=True):
        forms.WPFWindow.__init__(self, PXAML, set_owner=not own_thread)
        self.own_thread = own_thread
        self.cancelled = False
        self.t0 = time.time()
        self.files_ok = self.files_bad = 0
        self.formats = formats                 # ['PDF', 'DWG']
        self.skip_links = skip_links
        self.picked, self.cache = picked, cache
        self.title_tb.Text = title
        self.overall_pb.Maximum = max(1, len(models))
        self.rows = {}
        for rec in models:
            g = rec['ModelGUID'].lower()
            entry = cache.get(g) or {}
            n = len(picked.get(g, [])) if picked else len(entry.get('sheets', []))
            r = _row([26, 0, 110, 150])
            icon = _cell(r, 0, ICON['wait'][0], ICON['wait'][1], True)
            _cell(r, 1, entry.get('model') or rec.get('Name') or core.register_label(rec))
            _cell(r, 2, u'%d drawing(s)' % n, MUTED)
            info = _cell(r, 3, u'waiting', MUTED)
            self.models_sp.Children.Add(r)
            self.rows[g] = (icon, info)
        self.done_models = 0
        self.models_count_tb.Text = u'0 of %d done' % len(models)
        self.cells = {}
        self._tick(None, None)
        if own_thread:                          # live clock, independent of Revit
            from System.Windows.Threading import DispatcherTimer
            from System import TimeSpan
            self._timer = DispatcherTimer()
            self._timer.Interval = TimeSpan.FromSeconds(1)
            self._timer.Tick += self._tick
            self._timer.Start()

    def _tick(self, sender, args):
        self.status_tb.Text = u'Elapsed %s   ·   %d file(s) exported   ·   %d failed' % (
            time.strftime('%H:%M:%S', time.gmtime(time.time() - self.t0)), self.files_ok, self.files_bad)

    def pump(self):
        """Only needed when the window shares Revit's thread (fallback)."""
        if self.own_thread:
            return
        try:
            self._tick(None, None)
            Dispatcher.CurrentDispatcher.Invoke(Action(lambda: None), DispatcherPriority.Background)
        except Exception:
            pass

    def on_cancel(self, sender, args):
        self.cancelled = True
        self.cancel_btn.IsEnabled = False
        self.cancel_btn.Content = u'Stopping after the current file...'

    def _set(self, guid, state, text):
        icon, info = self.rows.get(guid, (None, None))
        if icon is not None:
            icon.Text, icon.Foreground = ICON[state]
            info.Text = text
            info.Foreground = ICON[state][1] if state in ('ok', 'bad') else MUTED

    def model_started(self, rec):
        g = rec['ModelGUID'].lower()
        entry = self.cache.get(g) or {}
        name = entry.get('model') or rec.get('Name') or core.register_label(rec)
        self._set(g, 'run', u'opening...')
        self.current_tb.Text = u'Now:  ' + name
        self.phase_tb.Text = (u'Opening the model from ACC (link worksets skipped - faster).' if self.skip_links else
                              u'Opening the model from ACC with all worksets and linked models. Big models or '
                              u'many links take longest here - Revit is busy, this window keeps running.')
        self.sheets_sp.Children.Clear()
        self.cells = {}
        nums = sorted(self.picked.get(g, [])) if self.picked else [e['number'].lower() for e in entry.get('sheets', [])]
        names = dict((e['number'].strip().lower(), e) for e in entry.get('sheets', []))
        for k in nums:
            e = names.get(k, {'number': k, 'name': ''})
            r = _row([90, 0, 90, 90])
            _cell(r, 0, e['number'])
            _cell(r, 1, e['name'])
            pdf = _cell(r, 2, u'○ waiting' if 'PDF' in self.formats else u'–', MUTED)
            dwg = _cell(r, 3, u'○ waiting' if 'DWG' in self.formats else u'–', MUTED)
            self.sheets_sp.Children.Add(r)
            self.cells[k] = {'PDF': pdf, 'DWG': dwg}
        self.sheet_pb.Maximum = max(1, len(nums) * len(self.formats))
        self.sheet_pb.Value = 0
        self.sheet_pb.IsIndeterminate = True        # moving bar while the model opens
        self.sheets_count_tb.Text = u'%d drawing(s)' % len(nums)
        self.pump()

    def phase(self, text):
        self.phase_tb.Text = text
        self.pump()

    def file(self, fmt, num, status):
        """status None = starting, 'OK' or 'FAILED' = finished."""
        self.sheet_pb.IsIndeterminate = False
        c = self.cells.get(num.strip().lower(), {}).get(fmt)
        if c is not None:
            if status is None:
                c.Text, c.Foreground = u'▶ exporting', RUN_BRUSH
                self.phase_tb.Text = u'Exporting %s  %s' % (fmt, num)
            elif status == 'OK':
                c.Text, c.Foreground = u'✔ done', OK_BRUSH
            else:
                c.Text, c.Foreground = u'✖ failed', BAD_BRUSH
        if status is not None:
            self.sheet_pb.Value = self.sheet_pb.Value + 1
            if status == 'OK':
                self.files_ok += 1
            else:
                self.files_bad += 1
        self.pump()
        return not self.cancelled

    def model_done(self, guid, ok, text):
        self.sheet_pb.IsIndeterminate = False
        self._set(guid, 'ok' if ok else 'bad', text)
        self.done_models += 1
        self.overall_pb.Value = self.done_models
        self.models_count_tb.Text = u'%d of %d done' % (self.done_models, len(self.rows))
        self.pump()

    def finish(self, headline, out_root, other_windows=False, logo_count=0, logo_since=None):
        for g, (icon, info) in self.rows.items():
            if info.Text == u'waiting':
                self._set(g, 'skip', u'done in another window' if other_windows else u'not exported')
        self.sheet_pb.IsIndeterminate = False
        self.title_tb.Text = headline
        self.current_tb.Text = u'Finished' if not self.cancelled else u'Stopped'
        self.phase_tb.Text = u'Full details: SheetExport_log.csv in the output folder.'
        self.cancel_btn.Visibility = Visibility.Collapsed
        self.open_btn.Visibility = Visibility.Visible
        self.close_btn.Visibility = Visibility.Visible
        self._out = out_root
        if getattr(self, '_timer', None) is not None:
            self._timer.Stop()
        if logo_count and self.own_thread:
            self._logo_total, self._logo_since = logo_count, logo_since or core.now()
            self.logo_tb.Visibility = Visibility.Visible
            self.logo_tb.Foreground = RUN_BRUSH
            self.logo_tb.Text = u'Logos: AutoCAD is starting... (0 of %d drawings)' % logo_count
            from System.Windows.Threading import DispatcherTimer
            from System import TimeSpan
            self._logo_timer = DispatcherTimer()
            self._logo_timer.Interval = TimeSpan.FromSeconds(3)
            self._logo_timer.Tick += self._logo_tick
            self._logo_timer.Start()
        else:
            self.spinner.Visibility = Visibility.Collapsed
            self.done_icon.Visibility = Visibility.Visible
        self._tick(None, None)

    def _logo_tick(self, sender, args):
        """Follow AutoCAD: count the drawings IMG2OLE has finished since the export."""
        try:
            rows = [r for r in core.read_csv(os.path.join(self._out, 'IMG2OLE_files.csv'))
                    if r.get('Mode') == 'RUN' and r.get('Timestamp', '') >= self._logo_since]
        except Exception:
            rows = []
        done = len(rows)
        bad = len([r for r in rows if r.get('Result') not in ('OK', 'NO_IMAGES')])
        if done >= self._logo_total:
            self._logo_timer.Stop()
            self.spinner.Visibility = Visibility.Collapsed
            self.done_icon.Visibility = Visibility.Visible
            if bad:
                self.logo_tb.Foreground = BAD_BRUSH
                self.logo_tb.Text = (u'⚠ Logos: %d of %d drawings need a check. Click "Embed Logos" on this '
                                     u'folder to see which.' % (bad, done))
            else:
                self.logo_tb.Foreground = OK_BRUSH
                self.logo_tb.Text = u'✔ Logos embedded in all %d drawing(s). Finished DWGs are in the DWG folder.' % done
        else:
            self.logo_tb.Text = u'Logos: AutoCAD is embedding... %d of %d drawings' % (done, self._logo_total)

    def on_open(self, sender, args):
        try:
            os.startfile(self._out)
        except Exception:
            import System
            System.Diagnostics.Process.Start('explorer.exe', self._out)

    def on_close_done(self, sender, args):
        self.Close()


class ProgressUI(object):
    """Runs the ProgressWindow on its own thread, so it animates and keeps time while Revit works.
    Every call is forwarded safely to the window's thread."""

    def __init__(self, *args):
        from System.Threading import Thread, ThreadStart, ApartmentState, ManualResetEvent
        self._args, self.win, self.error = args, None, None
        self._ready, self._closed = ManualResetEvent(False), ManualResetEvent(False)
        t = Thread(ThreadStart(self._run))
        t.SetApartmentState(ApartmentState.STA)
        t.IsBackground = True
        t.Start()
        self._ready.WaitOne()
        if self.error:
            raise Exception(self.error)

    def _run(self):
        try:
            self.win = ProgressWindow(*self._args)
            self.win.Closed += self._on_closed
            self.win.Show()
        except Exception as e:
            self.error = core.text(e)
            self._ready.Set()
            return
        self._ready.Set()
        Dispatcher.Run()

    def _on_closed(self, sender, args):
        self._closed.Set()
        Dispatcher.CurrentDispatcher.BeginInvokeShutdown(DispatcherPriority.Background)

    def _call(self, name, *a):
        w = self.win

        def go():
            try:
                getattr(w, name)(*a)
            except Exception:
                pass
        try:
            w.Dispatcher.BeginInvoke(Action(go))
        except Exception:
            pass

    @property
    def cancelled(self):
        return bool(getattr(self.win, 'cancelled', False))

    def model_started(self, rec):
        self._call('model_started', rec)

    def phase(self, text):
        self._call('phase', text)

    def file(self, fmt, num, status):
        self._call('file', fmt, num, status)
        return not self.cancelled

    def model_done(self, guid, ok, text):
        self._call('model_done', guid, ok, text)

    def finish(self, headline, out_root, other_windows=False, logo_count=0, logo_since=None):
        self._call('finish', headline, out_root, other_windows, logo_count, logo_since)
        self._closed.WaitOne()                   # wait until you close the result window

    def close(self):
        self._call('Close')
        self._closed.WaitOne(5000)


def open_progress(models, picked, cache, formats, title, skip_links=False):
    try:
        return ProgressUI(models, picked, cache, formats, title, skip_links)
    except Exception:
        w = ProgressWindow(models, picked, cache, formats, title, skip_links, own_thread=False)   # fallback
        w.Show()
        w.pump()
        return w


def finish_title(totals, cad_msg):
    t = u'Finished: %d file(s) exported, %d failed' % (totals['ok'], totals['failed'])
    if cad_msg and not cad_msg.startswith('AutoCAD started'):
        t += u'  \u00b7  LOGOS NOT STARTED: ' + cad_msg
    return t


def export_models(next_rec, models, job, settings, reg, cache, log_path, title):
    """Export model after model, as long as next_rec() gives one.
    Returns (lines, totals, matched, progress window)."""
    do_export, out_root = job['do_export'], job['out_root']
    picked = dict((g, set(v)) for g, v in job['picked'].items()) if job.get('picked') is not None else None
    lod_rows = job.get('lod_rows')
    fm = job.get('_formats') or settings.get('_formats') or {}
    formats = [f for f in ('PDF', 'DWG') if core.yes(fm.get(f.lower()))]
    totals = {'ok': 0, 'failed': 0, 'would': 0}
    lines, matched_all = [], set()
    opened_before = set(KEPT.keys())
    pw = open_progress(models, picked, cache, formats, title, bool(settings.get('skip_links')))
    try:
        return _export_loop(pw, next_rec, job, settings, reg, cache, log_path, picked, lod_rows, totals,
                            lines, matched_all, opened_before, do_export, out_root)
    except Exception:
        try:
            pw.close()
        except Exception:
            pass
        raise


def _export_loop(pw, next_rec, job, settings, reg, cache, log_path, picked, lod_rows, totals,
                 lines, matched_all, opened_before, do_export, out_root):
    with core.QuietRevit(uiapp):
        while not pw.cancelled:
            rec = next_rec()
            if rec is None:
                break
            label = core.register_label(rec)
            guid = rec['ModelGUID'].lower()
            log = []
            t0 = time.time()
            pw.model_started(rec)

            def progress(i, n, fmt, num, status=None):
                return pw.file(fmt, num, status)

            def work(doc):
                pw.phase(u'Reading drawings, export setups and links...')
                entry = core.read_sheet_list(doc, settings.get('naming_rule') or '{DrawingNumber}')
                entry['guid'] = guid
                if job.get('_extra_read'):
                    try:
                        job['_extra_read'](doc, guid, entry)        # Issue Sheets: revisions, title blocks, version
                    except Exception:
                        pass
                cache[guid] = entry
                settings['_current_guid'] = guid
                try:
                    core.save_sheet_entry(guid, entry)
                except Exception:
                    pass
                links = core.check_links(doc, reload_links=not settings.get('skip_links'))
                res = core.export_model(doc, lod_rows, out_root, settings, do_export, log,
                                        picked=picked.get(guid) if picked is not None else None,
                                        progress=progress)
                pw.phase(u'Closing the model (not saved)...')
                return res, links, core.model_name(doc)

            try:
                res, note, err = run_on_model(rec, settings, reg, work)
            except Exception as e:
                res, note, err = None, None, core.text(e)
            if res is None:
                lines.append('FAILED %s: %s' % (label, err))
                log.append([core.now(), 'OPEN', label, '', '', '', '', '', 'FAILED', '', err])
                pw.model_done(guid, False, u'not opened - see report')
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
                timing = ('open %.0fs + export %.0fs' % (osecs, max(0, total - osecs))
                          if (osecs is not None and guid not in opened_before)
                          else 'export %.0fs (model was already open)' % total)
                lines.append('%s: %d drawing(s), %s  |  %s%s' % (
                    mname, len(matched),
                    ('%d file(s) exported, %d failed' % (counts['ok'], counts['failed'])) if do_export
                    else ('%d file(s) would export' % counts['would']),
                    timing, ('  [%s]' % '; '.join(extra)) if extra else ''))
                if job.get('_logo_pipeline') and do_export:
                    try:                                   # hand this model's DWGs to AutoCAD right away
                        final_dir = os.path.join(os.path.dirname(raw_dir), 'DWG')
                        new_jobs = [(row[7], final_dir) for row in log
                                    if len(row) > 8 and row[6] == u'DWG' and row[8] == u'OK']
                        if new_jobs:
                            core.logo_queue_add(out_root, new_jobs)
                            job['_logo_jobs'] = job.get('_logo_jobs', 0) + len(new_jobs)
                            if not job.get('_logo_runner'):
                                ok_, msg_ = core.logo_runner_start(out_root, settings)
                                job['_logo_runner'] = ok_
                                job['_logo_runner_msg'] = msg_
                                if not ok_:
                                    job['_logo_pipeline'] = False        # fall back: start AutoCAD at the end
                    except Exception:
                        job['_logo_pipeline'] = False
                pw.model_done(guid, counts['failed'] == 0,
                              u'%d file(s), %s' % (counts['ok'], time.strftime('%M:%S', time.gmtime(total)))
                              if counts['failed'] == 0 else u'%d failed - see report' % counts['failed'])
            core.append_csv(log_path, core.LOG_HEADER, log)
            if job.get('_on_done'):
                job['_on_done'](guid)
        if pw.cancelled:
            lines.append('Cancelled by user (models not started are left for other windows / next run).')
    core.save_register(reg)
    return lines, totals, matched_all, pw


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


