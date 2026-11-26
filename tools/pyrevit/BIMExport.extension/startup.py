# -*- coding: utf-8 -*-
"""BIMExport startup (runs once when Revit / pyRevit loads).

Watches %APPDATA%\\BIMExport\\Requests for requests from Lew's Toolbox ("Pull from Revit").
When Revit is idle and a new request is there, it asks once:
    Open Issue Sheets now / Later / Not for this request
'Open' starts the Issue Sheets button with that request loaded and its models checked; you still press Issue.

Safe by design: it only reads that folder and writes a small status file; it never prints, opens or changes a
model by itself. Turn it off with  "watch_toolbox_requests": false  in %APPDATA%\\BIMExport\\settings.json.
"""
import io
import json
import os
import time

import System
from Autodesk.Revit.UI import TaskDialog, TaskDialogCommandLinkId, TaskDialogResult
from Autodesk.Revit.UI.Events import IdlingEventArgs  # noqa: F401  (makes the event type known)

try:
    from pyrevit import HOST_APP
    UIAPP = HOST_APP.uiapp
except Exception:
    UIAPP = __revit__                                   # noqa: F821

ROOT = os.path.join(os.environ.get('APPDATA', ''), 'BIMExport')
REQ = os.path.join(ROOT, 'Requests')
CHECK_EVERY = 4.0                                        # seconds between folder checks
SNOOZE = 600.0                                           # "Later" = ask again in 10 minutes
KEY = 'BIMExport.ToolboxWatcher'
ME = '%s:%s' % (os.environ.get('COMPUTERNAME', ''), System.Diagnostics.Process.GetCurrentProcess().Id)

state = {'next': 0.0, 'busy': False, 'snooze': {}, 'skip': set()}


def _on():
    try:
        with io.open(os.path.join(ROOT, 'settings.json'), 'r', encoding='utf-8') as f:
            return json.loads(f.read()).get('watch_toolbox_requests', True) is not False
    except Exception:
        return True


def _read_status(name):
    try:
        with io.open(os.path.join(REQ, name + '.status.json'), 'r', encoding='utf-8') as f:
            return json.loads(f.read())
    except Exception:
        return None


def _write_status(name, stage, text, total=0):
    try:
        p = os.path.join(REQ, name + '.status.json')
        with io.open(p + '.tmp', 'w', encoding='utf-8') as f:
            f.write(u'%s' % json.dumps({'stage': stage, 'text': text, 'done': 0, 'total': total, 'by': ME,
                                        'time': time.strftime('%Y-%m-%d %H:%M:%S')}))
        if os.path.exists(p):
            os.remove(p)
        os.rename(p + '.tmp', p)
    except Exception:
        pass


def _move_to_cancelled(name):
    dst = os.path.join(REQ, 'Done', 'Cancelled')
    try:
        if not os.path.isdir(dst):
            os.makedirs(dst)
        for ext in ('.csv', '.status.json', '.cancel'):
            src = os.path.join(REQ, name + ext)
            if os.path.exists(src):
                t = os.path.join(dst, name + ext)
                if os.path.exists(t):
                    os.remove(t)
                os.rename(src, t)
    except Exception:
        pass


def _count_rows(path):
    try:
        with io.open(path, 'r', encoding='utf-8-sig') as f:
            return max(0, len([l for l in f.read().splitlines() if l.strip()]) - 1)
    except Exception:
        return 0


def _candidates():
    """Requests nobody else is handling: no status yet, or 'noticed' by THIS Revit and not snoozed."""
    out = []
    if not os.path.isdir(REQ):
        return out
    now = time.time()
    for fn in os.listdir(REQ):
        if not fn.lower().endswith('.csv'):
            continue
        name = fn[:-4]
        st = _read_status(name)
        cancel = os.path.exists(os.path.join(REQ, name + '.cancel'))
        if cancel and (st is None or (st.get('stage') == 'noticed')):
            _move_to_cancelled(name)                     # cancelled in the Toolbox before anyone started it
            continue
        if name in state['skip'] or cancel:
            continue
        if st is not None and not (st.get('stage') == 'noticed' and st.get('by') == ME):
            continue                                     # another Revit window has it, or it is running
        if state['snooze'].get(name, 0) > now:
            continue
        out.append((os.path.getmtime(os.path.join(REQ, fn)), name))
    out.sort(reverse=True)
    return [n for _, n in out]


def _open_issue_sheets(name, mode='open'):
    """Start the Issue Sheets button (pyRevit) with this request; True if it started."""
    System.AppDomain.CurrentDomain.SetData('BIMExport.OpenRequest', name)   # Issue Sheets loads it without asking
    System.AppDomain.CurrentDomain.SetData('BIMExport.RequestMode', mode)
    try:
        from pyrevit.loader import sessionmgr
        for c in sessionmgr.find_all_commands():
            tn = c.typename.lower()
            flat = ''.join(ch for ch in tn if ch.isalnum())
            if 'bimexport' in flat and flat.endswith('issuesheets'):
                sessionmgr.execute_command_cls(c.extcmd_type)
                return True
    except Exception:
        pass
    System.AppDomain.CurrentDomain.SetData('BIMExport.OpenRequest', None)
    return False


BGSTATE = {'engine': None, 'next': 0.0, 'checked_claim': False}


def _process_start_epoch():
    try:
        st = System.Diagnostics.Process.GetCurrentProcess().StartTime.ToUniversalTime()
        return (st - System.DateTime(1970, 1, 1)).TotalSeconds
    except Exception:
        return 0.0


def _maybe_become_background():
    """A Revit started by the BIMExport schedule (claim.flag newer than this Revit) becomes the background Revit."""
    if BGSTATE['checked_claim']:
        return
    try:
        import bimbackground as bg
    except Exception:
        BGSTATE['checked_claim'] = True
        return
    if not os.path.exists(bg.CLAIM_FLAG):
        if time.time() - _process_start_epoch() > 300:
            BGSTATE['checked_claim'] = True             # started long before any claim: a normal Revit
        return
    flag_t = os.path.getmtime(bg.CLAIM_FLAG)
    if _process_start_epoch() < flag_t - 30 or bg.alive():
        BGSTATE['checked_claim'] = True
        return
    try:
        os.remove(bg.CLAIM_FLAG)                         # only ONE Revit takes it
    except Exception:
        BGSTATE['checked_claim'] = True
        return
    BGSTATE['checked_claim'] = True
    bg.set_control('run')
    BGSTATE['engine'] = bg.Engine(UIAPP)


def _exit_revit():
    try:
        from Autodesk.Revit.UI import RevitCommandId, PostableCommand
        UIAPP.PostCommand(RevitCommandId.LookupPostableCommandId(PostableCommand.ExitRevit))
    except Exception:
        pass


def _background_tick():
    """The background Revit: one step of work per idle moment (pause / stop are checked every time)."""
    now = time.time()
    if now < BGSTATE['next']:
        return
    try:
        r = BGSTATE['engine'].tick()
    except Exception:
        r = 'wait'
    BGSTATE['next'] = time.time() + (0.5 if r == 'work' else 5.0)
    if r == 'exit':
        BGSTATE['engine'] = None
        _exit_revit()


def on_idling(sender, args):
    if BGSTATE['engine'] is not None:
        _background_tick()
        return                                           # the background Revit never shows pop-ups
    _maybe_become_background()
    if BGSTATE['engine'] is not None:
        return
    now = time.time()
    if state['busy'] or now < state['next']:
        return
    state['next'] = now + CHECK_EVERY
    if not _on():
        return
    try:
        names = _candidates()
    except Exception:
        return
    if not names:
        return
    name = names[0]
    n = _count_rows(os.path.join(REQ, name + '.csv'))
    _write_status(name, 'noticed', u'Revit is asking you to open Issue Sheets', n)
    state['busy'] = True
    try:
        td = TaskDialog("Lew's Toolbox")
        td.MainInstruction = u'Toolbox request: %d drawing(s)' % n
        td.MainContent = (u'"%s" is waiting to be printed.%s\n\nPrint now: each model opens once and only the requested '
                          u'drawings are printed (MIDP code + the revision the sheet shows; a wrong revision is blocked). '
                          u'The model is never changed.' % (
                              name, (u'\n(%d more request(s) after this one)' % (len(names) - 1)) if len(names) > 1 else u''))
        td.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, u'Print now',
                          u'Fastest: no window, no Check - one open per model')
        td.AddCommandLink(TaskDialogCommandLinkId.CommandLink2, u'Open Issue Sheets first',
                          u'Review the drawings, then press Issue')
        td.AddCommandLink(TaskDialogCommandLinkId.CommandLink3, u'Later', u'Ask again in 10 minutes')
        td.AddCommandLink(TaskDialogCommandLinkId.CommandLink4, u'Not for this request',
                          u'Leave it for another Revit window or for later (Issue Sheets still offers it)')
        res = td.Show()
        if res in (TaskDialogResult.CommandLink1, TaskDialogResult.CommandLink2):
            if not _open_issue_sheets(name, 'print' if res == TaskDialogResult.CommandLink1 else 'open'):
                TaskDialog.Show("Lew's Toolbox", u'Could not start Issue Sheets automatically.\n\n'
                                                 u'Click BIMExport > Issue Sheets - the request is offered there.')
        elif res == TaskDialogResult.CommandLink4:
            state['skip'].add(name)
            try:
                os.remove(os.path.join(REQ, name + '.status.json'))   # free for other windows
            except Exception:
                pass
        else:
            state['snooze'][name] = time.time() + SNOOZE
            _write_status(name, 'noticed', u'Revit asked - you chose Later (asks again in 10 min)', n)
    except Exception:
        pass
    finally:
        state['busy'] = False
        state['next'] = time.time() + CHECK_EVERY


def _install():
    dom = System.AppDomain.CurrentDomain
    old = dom.GetData(KEY)
    if old is not None:                                  # pyRevit Reload: don't watch twice
        try:
            UIAPP.Idling -= old
        except Exception:
            pass
    old_t = dom.GetData(KEY + '.timer')
    if old_t is not None:
        try:
            old_t.Stop()
        except Exception:
            pass
    handler = System.EventHandler[IdlingEventArgs](on_idling)
    UIAPP.Idling += handler
    dom.SetData(KEY, handler)
    # Revit stops sending 'idle' when nobody touches it (the background Revit): a timer asks Revit every
    # 3 seconds to run us in a safe moment (ExternalEvent), so checks continue unattended.
    try:
        from Autodesk.Revit.UI import IExternalEventHandler, ExternalEvent
        from System.Windows.Threading import DispatcherTimer
        from System import TimeSpan

        class _Pulse(IExternalEventHandler):
            def Execute(self, uiapp):
                try:
                    on_idling(None, None)
                except Exception:
                    pass

            def GetName(self):
                return 'BIMExport background'

        ev = ExternalEvent.Create(_Pulse())
        timer = DispatcherTimer()
        timer.Interval = TimeSpan.FromSeconds(3)
        timer.Tick += lambda s_, e_: ev.Raise()
        timer.Start()
        dom.SetData(KEY + '.timer', timer)
        dom.SetData(KEY + '.event', ev)
    except Exception:
        pass


try:
    _install()
except Exception:
    pass
