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


def _open_issue_sheets(name):
    """Start the Issue Sheets button (pyRevit) with this request; True if it started."""
    System.AppDomain.CurrentDomain.SetData('BIMExport.OpenRequest', name)   # Issue Sheets loads it without asking
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


def on_idling(sender, args):
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
        td.MainContent = (u'"%s" is waiting to be printed.%s\n\nOpen Issue Sheets with it? The models are checked for '
                          u'you; you still press Issue. Nothing is printed or changed until then.' % (
                              name, (u'\n(%d more request(s) after this one)' % (len(names) - 1)) if len(names) > 1 else u''))
        td.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, u'Open Issue Sheets now')
        td.AddCommandLink(TaskDialogCommandLinkId.CommandLink2, u'Later', u'Ask again in 10 minutes')
        td.AddCommandLink(TaskDialogCommandLinkId.CommandLink3, u'Not for this request',
                          u'Leave it for another Revit window or for later (Issue Sheets still offers it)')
        res = td.Show()
        if res == TaskDialogResult.CommandLink1:
            if not _open_issue_sheets(name):
                TaskDialog.Show("Lew's Toolbox", u'Could not start Issue Sheets automatically.\n\n'
                                                 u'Click BIMExport > Issue Sheets - the request is offered there.')
        elif res == TaskDialogResult.CommandLink3:
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
    handler = System.EventHandler[IdlingEventArgs](on_idling)
    UIAPP.Idling += handler
    dom.SetData(KEY, handler)


try:
    _install()
except Exception:
    pass
