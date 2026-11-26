# -*- coding: utf-8 -*-
"""BIMExport background checks (by Lew).

A separate "background Revit" checks the models you chose at the times you chose (Windows Task Scheduler):
each model opens detached (ALL worksets, links), every drawing gets a fingerprint (revisions, title block,
sheet, and every element seen in each of its views), it is compared with the last check and with the last
issue, and the result is saved. Up to N models stay open there, so printing them later only exports.

Files (all in %APPDATA%\\BIMExport\\Background):
    config.json         models, times, days, keep_open, min_free_gb, close_when_done
    todo.json           the current check, one line per model: waiting / done / failed  (resume after a stop)
    status.json         what the background Revit is doing (read by the Background button and the Toolbox)
    control.json        run / pause / stop   (Pause / Resume / Stop buttons)
    heartbeat.txt       written every few seconds while the background Revit runs
    check_now.flag      "check now" (written by the schedule / Check now)
    reload\\<guid>.flag  "reload this model fully now" (goes to the front of the list)
    claim.flag          a Revit started by the schedule becomes the background Revit
    issued\\<guid>.json  fingerprints of the drawings at their last issue
    print_jobs\\*.json   fast print jobs for models kept open (Issue Sheets / Quick Print)
Nothing here ever saves or syncs a model.
"""
from __future__ import print_function

import io
import json
import os
import time
import hashlib
import datetime

import bimexport_core as core

BG = os.path.join(core.SETTINGS_DIR, 'Background')
CONFIG = os.path.join(BG, 'config.json')
STATUS = os.path.join(BG, 'status.json')
CONTROL = os.path.join(BG, 'control.json')
TODO = os.path.join(BG, 'todo.json')
HEART = os.path.join(BG, 'heartbeat.txt')
CHECK_FLAG = os.path.join(BG, 'check_now.flag')
CLAIM_FLAG = os.path.join(BG, 'claim.flag')
RELOAD_DIR = os.path.join(BG, 'reload')
ISSUED_DIR = os.path.join(BG, 'issued')
JOBS_DIR = os.path.join(BG, 'print_jobs')
APPLY_DIR = os.path.join(BG, 'apply_jobs')
TASK_NAME = u'BIMExport Background'

DEFAULTS = {'enabled': True, 'models': [], 'times': ['07:00', '12:30', '18:00'], 'days': [1, 2, 3, 4, 5],
            'keep_open': 3, 'min_free_gb': 8, 'close_when_done': False, 'revit_exe': u''}
DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']


# ------------------------------------------------------------------ files --
def _rj(path, dflt):
    try:
        with io.open(path, 'r', encoding='utf-8') as f:
            return json.loads(f.read())
    except Exception:
        return dflt


def _wj(path, obj):
    core.ensure_dir(os.path.dirname(path))
    tmp = path + u'.tmp'
    with io.open(tmp, 'w', encoding='utf-8') as f:
        f.write(core.text(json.dumps(obj, indent=1)))
    if os.path.exists(path):
        os.remove(path)
    os.rename(tmp, path)


def load_config():
    c = dict(DEFAULTS)
    c.update(_rj(CONFIG, {}))
    return c


def save_config(c):
    _wj(CONFIG, c)


def status():
    return _rj(STATUS, {})


def set_status(**kw):
    s = status()
    s.update(kw)
    s['updated'] = core.now()
    try:
        _wj(STATUS, s)
    except Exception:
        pass


def control():
    return _rj(CONTROL, {}).get('state', 'run')


def set_control(state):
    _wj(CONTROL, {'state': state, 'when': core.now()})


def alive(max_age=45):
    """Is a background Revit running? (its heartbeat is recent)"""
    try:
        return time.time() - os.path.getmtime(HEART) < max_age
    except Exception:
        return False


# ------------------------------------------------------------- requests --
def request_check(guids=None):
    """Check now: all watched models (None) or the given ones. Joins an unfinished check (no repeats)."""
    _wj(CHECK_FLAG, {'when': core.now(), 'models': guids})


def request_reload(guid):
    """Reload this model fully now: it goes to the front of the list."""
    core.ensure_dir(RELOAD_DIR)
    _wj(os.path.join(RELOAD_DIR, guid.lower() + u'.flag'), {'when': core.now()})


def load_todo():
    return _rj(TODO, {'items': [], 'started': u''})


def save_todo(t):
    _wj(TODO, t)


def merge_requests(cfg):
    """Turn new flags into lines of the to-do list. An unfinished list is KEPT: a new check only adds the
    models that are not already waiting, so a stopped check continues where it stopped."""
    t = load_todo()
    items = t.get('items') or []
    waiting = set(i['guid'] for i in items if i['state'] == 'waiting')
    changed = False
    if os.path.isdir(RELOAD_DIR):
        for fn in sorted(os.listdir(RELOAD_DIR)):
            if not fn.endswith('.flag'):
                continue
            g = fn[:-5].lower()
            items = [i for i in items if not (i['guid'] == g and i['state'] == 'waiting')]
            items.insert(0, {'guid': g, 'kind': 'reload', 'state': 'waiting', 'tries': 0, 'added': core.now()})
            waiting.add(g)
            changed = True
            try:
                os.remove(os.path.join(RELOAD_DIR, fn))
            except Exception:
                pass
    if os.path.exists(CHECK_FLAG):
        req = _rj(CHECK_FLAG, {})
        try:
            os.remove(CHECK_FLAG)
        except Exception:
            pass
        if not any(i['state'] == 'waiting' for i in items):
            items = [i for i in items if i['kind'] == 'reload' and i['state'] == 'waiting']   # a fresh check
            t['started'] = core.now()
        for g in (req.get('models') or cfg.get('models') or []):
            g = g.lower()
            if g not in waiting:
                items.append({'guid': g, 'kind': 'check', 'state': 'waiting', 'tries': 0, 'added': core.now()})
                waiting.add(g)
        changed = True
    if changed:
        t['items'] = items
        save_todo(t)
    return t


def next_item(t):
    for i in t.get('items', []):
        if i['state'] == 'waiting':
            return i
    return None


# ----------------------------------------------------------- schedule ----
def task_xml(cfg, ps1):
    """Windows Task Scheduler definition: one trigger per time, on the chosen days, may wake the PC."""
    days = u''.join(u'<%s />' % DAY_NAMES[d - 1] for d in sorted(set(cfg.get('days') or [1, 2, 3, 4, 5])))
    trig = []
    today = datetime.date.today().isoformat()
    for t in cfg.get('times') or []:
        hh, mm = [int(x) for x in t.strip().split(':')[:2]]
        trig.append(u'<CalendarTrigger><StartBoundary>%sT%02d:%02d:00</StartBoundary><Enabled>true</Enabled>'
                    u'<ScheduleByWeek><DaysOfWeek>%s</DaysOfWeek><WeeksInterval>1</WeeksInterval></ScheduleByWeek>'
                    u'</CalendarTrigger>' % (today, hh, mm, days))
    return (u'<?xml version="1.0" encoding="UTF-16"?>\n'
            u'<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">'
            u'<RegistrationInfo><Description>BIMExport by Lew: check the watched Revit models in the background'
            u'</Description></RegistrationInfo>'
            u'<Triggers>%s</Triggers>'
            u'<Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType>'
            u'<RunLevel>LeastPrivilege</RunLevel></Principal></Principals>'
            u'<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>'
            u'<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>'
            u'<StartWhenAvailable>true</StartWhenAvailable><WakeToRun>true</WakeToRun>'
            u'<ExecutionTimeLimit>PT1H</ExecutionTimeLimit><Enabled>%s</Enabled></Settings>'
            u'<Actions Context="Author"><Exec><Command>powershell.exe</Command>'
            u'<Arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "%s"</Arguments>'
            u'</Exec></Actions></Task>') % (u''.join(trig), u'true' if cfg.get('enabled', True) else u'false', ps1)


def starter_ps1(cfg):
    """The small script the schedule runs: 'check now' + start the background Revit if none is running."""
    return (u'param([switch]$NoCheck)\r\n'
            u'$bg = "%s"\r\n'
            u'if (-not $NoCheck) { Set-Content -LiteralPath "$bg\\check_now.flag" -Value \'{"models": null}\' }\r\n'
            u'$hb = "$bg\\heartbeat.txt"\r\n'
            u'$alive = $false\r\n'
            u'if (Test-Path -LiteralPath $hb) { if (((Get-Date) - (Get-Item -LiteralPath $hb).LastWriteTime).TotalSeconds -lt 60) { $alive = $true } }\r\n'
            u'if (-not $alive) {\r\n'
            u'  Set-Content -LiteralPath "$bg\\claim.flag" -Value (Get-Date -Format s)\r\n'
            u'  Start-Process -FilePath "%s" -ArgumentList "/nosplash" -WindowStyle Minimized\r\n'
            u'}\r\n') % (BG, cfg.get('revit_exe') or u'Revit.exe')


def install_schedule(cfg):
    """Create / replace the Windows scheduled task. Returns (ok, message)."""
    import subprocess
    core.ensure_dir(BG)
    ps1 = os.path.join(BG, u'bg_start.ps1')
    with io.open(ps1, 'w', encoding='utf-8-sig') as f:
        f.write(starter_ps1(cfg))
    xml = os.path.join(BG, u'task.xml')
    with io.open(xml, 'w', encoding='utf-16') as f:
        f.write(task_xml(cfg, ps1))
    try:
        if not cfg.get('times'):
            subprocess.call(['schtasks', '/Delete', '/TN', TASK_NAME, '/F'])
            return True, u'Schedule removed (no times).'
        code = subprocess.call(['schtasks', '/Create', '/TN', TASK_NAME, '/XML', xml, '/F'])
        return code == 0, (u'Schedule saved: %s, %s' % (u', '.join(cfg['times']),
                                                         u'/'.join(DAY_NAMES[d - 1][:3] for d in cfg['days'])))\
            if code == 0 else u'Windows refused the schedule (schtasks code %s)' % code
    except Exception as e:
        return False, core.text(e)


def start_background_revit(cfg, check=False):
    import subprocess
    ps1 = os.path.join(BG, u'bg_start.ps1')
    if not os.path.exists(ps1):
        with io.open(ps1, 'w', encoding='utf-8-sig') as f:
            f.write(starter_ps1(cfg))
    args = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1]
    if not check:
        args.append('-NoCheck')
    subprocess.Popen(args)


# -------------------------------------------------------- fingerprints ----
def _h(parts):
    m = hashlib.md5()
    for p in parts:
        m.update(core.text(p).encode('utf-8'))
        m.update(b'\x1f')
    return m.hexdigest()[:16]


def _r(v):
    return u'%.3f' % v           # feet: about 0.3 mm


def _pt(p):
    return u'%s,%s,%s' % (_r(p.X), _r(p.Y), _r(p.Z))


def _params(el):
    out = []
    try:
        for p in el.Parameters:
            try:
                v = p.AsValueString() or p.AsString() or u''
                if v:
                    out.append(u'%s=%s' % (core.text(p.Definition.Name), core.text(v)))
            except Exception:
                continue
    except Exception:
        pass
    out.sort()
    return out


def element_sig(el, view, DB):
    """What a drawing shows of one element: type, place, size, and the text of notes / tags / dimensions."""
    parts = [core.text(el.Id)]
    try:
        parts.append(core.text(el.GetTypeId()))
    except Exception:
        pass
    try:
        bb = el.get_BoundingBox(view)
        if bb is not None:
            parts += [_pt(bb.Min), _pt(bb.Max)]
    except Exception:
        pass
    try:
        loc = el.Location
        if hasattr(loc, 'Point') and loc.Point is not None:
            parts.append(_pt(loc.Point))
        elif hasattr(loc, 'Curve') and loc.Curve is not None:
            parts += [_pt(loc.Curve.GetEndPoint(0)), _pt(loc.Curve.GetEndPoint(1))]
    except Exception:
        pass
    for attr in ('Text', 'TagText', 'ValueString'):      # text notes, tags, dimensions
        try:
            v = getattr(el, attr, None)
            if v:
                parts.append(core.text(v))
        except Exception:
            pass
    try:                                                 # a linked model: its own version
        if isinstance(el, DB.RevitLinkInstance):
            ld = el.GetLinkDocument()
            if ld is not None:
                parts.append(u'link v%s' % DB.Document.GetDocumentVersion(ld).NumberOfSaves)
    except Exception:
        pass
    try:                                                 # annotations: every value (tag families, keynotes...)
        cat = el.Category
        if cat is not None and core.text(cat.CategoryType) == u'Annotation':
            parts += _params(el)
    except Exception:
        pass
    return u'|'.join(parts)


def view_hash(doc, view, DB):
    sigs = []
    try:
        for el in DB.FilteredElementCollector(doc, view.Id).WhereElementIsNotElementType():
            try:
                sigs.append(element_sig(el, view, DB))
            except Exception:
                continue
    except Exception:
        return u'', 0
    sigs.sort()
    return _h(sigs), len(sigs)


def sheet_fingerprints(doc, numbers=None):
    """{sheet number: {'rev', 'tb', 'sheet', 'views': {view id: {'name', 'h', 'n'}}}} for all (or some) sheets."""
    import Autodesk.Revit.DB as DB
    out, cache = {}, {}
    want = set(n.strip().lower() for n in numbers) if numbers else None
    for s in DB.FilteredElementCollector(doc).OfClass(DB.ViewSheet):
        if s.IsPlaceholder or (want is not None and s.SheetNumber.strip().lower() not in want):
            continue
        try:
            revs = sorted(core.text(i) for i in s.GetAllRevisionIds())
        except Exception:
            revs = []
        cur = u''
        try:
            p = s.get_Parameter(DB.BuiltInParameter.SHEET_CURRENT_REVISION)
            cur = p.AsString() or u'' if p else u''
        except Exception:
            pass
        tb = []
        try:
            for inst in DB.FilteredElementCollector(doc, s.Id).OfCategory(DB.BuiltInCategory.OST_TitleBlocks) \
                    .WhereElementIsNotElementType():
                tb += [core.text(inst.GetTypeId())] + _params(inst) + _params(doc.GetElement(inst.GetTypeId()))
        except Exception:
            pass
        sh, _ = view_hash(doc, s, DB)
        views = {}
        try:
            placed = list(s.GetAllPlacedViews())
        except Exception:
            placed = []
        for vid in placed:
            k = core.text(vid)
            if k not in cache:
                v = doc.GetElement(vid)
                h, n = view_hash(doc, v, DB) if v is not None else (u'', 0)
                cache[k] = {'name': core.text(getattr(v, 'Name', k)), 'h': h, 'n': n}
            views[k] = cache[k]
        out[s.SheetNumber] = {'rev': _h(revs + [cur]), 'rev_no': cur, 'tb': _h(tb),
                              'sheet': _h([s.Name] + _params(s) + [sh]), 'views': views}
    return out


def compare(old, new):
    """Reasons a drawing changed: [] = no change, None = no earlier fingerprint."""
    if not old:
        return None
    why = []
    if old.get('rev') != new.get('rev'):
        why.append(u'revision (%s -> %s)' % (old.get('rev_no') or u'-', new.get('rev_no') or u'-')
                   if old.get('rev_no') != new.get('rev_no') else u'revisions on the sheet')
    if old.get('tb') != new.get('tb'):
        why.append(u'title block')
    if old.get('sheet') != new.get('sheet'):
        why.append(u'sheet (name / parameters / items on the sheet)')
    ov, nv = old.get('views') or {}, new.get('views') or {}
    for k, v in nv.items():
        if k not in ov:
            why.append(u'view added: %s' % v.get('name'))
        elif ov[k].get('h') != v.get('h'):
            why.append(u'view "%s"' % v.get('name'))
    for k, v in ov.items():
        if k not in nv:
            why.append(u'view removed: %s' % v.get('name'))
    return why


def issued_fps(guid):
    return _rj(os.path.join(ISSUED_DIR, guid.lower() + u'.json'), {})


def remember_issued(guid, fps):
    """After a print: these fingerprints are 'what was issued' for those drawings."""
    if not fps:
        return
    d = issued_fps(guid)
    d.update(fps)
    _wj(os.path.join(ISSUED_DIR, guid.lower() + u'.json'), d)


def changes_for(guid, fps, old_fps):
    """{sheet: {'since_check': [...] | None, 'since_issue': [...] | None}}"""
    issued = issued_fps(guid)
    out = {}
    for num, fp in fps.items():
        out[num] = {'since_check': compare((old_fps or {}).get(num), fp), 'since_issue': compare(issued.get(num), fp)}
    return out


def change_text(entry, num):
    """Words for the Issue Sheets 'Change' column, or None when no background check has seen this drawing."""
    ch = ((entry or {}).get('bg_changes') or {}).get(num)
    if not ch:
        return None
    when = (entry.get('bg_checked') or u'')[11:16]
    si = ch.get('since_issue')
    if si is None:
        return u'Never issued (checked %s)' % when
    if not si:
        return u'No change since last issue (checked %s)' % when
    return u'Changed since last issue: %s (checked %s)' % (u'; '.join(si[:4]) + (u' ...' if len(si) > 4 else u''), when)


# ------------------------------------------------------------ memory ----
def free_gb():
    try:
        import clr
        clr.AddReference('Microsoft.VisualBasic')
        from Microsoft.VisualBasic.Devices import ComputerInfo
        return float(ComputerInfo().AvailablePhysicalMemory) / (1024.0 ** 3)
    except Exception:
        return 999.0


def signed_in(app):
    try:
        from Autodesk.Revit.ApplicationServices import Application
        return bool(Application.IsLoggedIn)
    except Exception:
        return True


def _looks_like_login(err):
    e = (err or u'').lower()
    return any(w in e for w in (u'sign in', u'signed in', u'log in', u'login', u'autodesk id', u'not authorized',
                                u'unauthor', u'credential', u'token'))


# ---------------------------------------------------------- the engine ----
class Engine(object):
    """Runs inside the background Revit; tick() is called when Revit is idle and does ONE step."""

    def __init__(self, uiapp):
        self.uiapp = uiapp
        self.app = uiapp.Application
        self.kept = {}             # guid -> {'doc', 'as_of', 'used'}
        self.started_by_schedule = True

    # ---- helpers
    def _keep(self, guid, doc, cfg):
        n = int(cfg.get('keep_open') or 0)
        if n <= 0:
            core_close(doc)
            return
        self.kept[guid] = {'doc': doc, 'as_of': core.now(), 'used': time.time()}
        while len(self.kept) > n:
            old = sorted(self.kept.items(), key=lambda kv: kv[1]['used'])[0][0]
            core_close(self.kept.pop(old)['doc'])

    def _drop(self, guid):
        k = self.kept.pop(guid, None)
        if k:
            core_close(k['doc'])

    def kept_info(self):
        return dict((g, {'as_of': k['as_of']}) for g, k in self.kept.items())

    def shutdown(self):
        for g in list(self.kept.keys()):
            self._drop(g)
        set_status(state='stopped', message=u'Stopped', kept={})
        try:
            os.remove(HEART)
        except Exception:
            pass

    # ---- one step
    def tick(self):
        core.ensure_dir(BG)
        try:
            with io.open(HEART, 'w') as f:
                f.write(core.text(os.getpid()))
        except Exception:
            pass
        cfg = load_config()
        st = control()
        if st == 'stop':
            self.shutdown()
            return 'exit'
        if st == 'pause':
            set_status(state='paused', message=u'Paused - press Resume', kept=self.kept_info(), free_gb=round(free_gb(), 1))
            return 'wait'
        free = free_gb()
        if free < float(cfg.get('min_free_gb') or 0):
            while self.kept and free_gb() < float(cfg.get('min_free_gb') or 0):      # give memory back first
                self._drop(sorted(self.kept.items(), key=lambda kv: kv[1]['used'])[0][0])
            if free_gb() < float(cfg.get('min_free_gb') or 0):
                set_status(state='paused', message=u'Paused: only %.1f GB memory free (limit %s GB)' % (
                    free_gb(), cfg.get('min_free_gb')), kept=self.kept_info(), free_gb=round(free_gb(), 1))
                return 'wait'
        aj = next_apply_job()                     # changes first: everything printed later includes them
        if aj:
            if not signed_in(self.app):
                set_status(state='needs sign-in', message=u'Sign in to Autodesk to continue (an Apply is waiting)')
                return 'wait'
            run_apply_job(self, aj)
            return 'work'
        t = merge_requests(cfg)
        job = next_print_job(self, t)
        if job:
            run_print_job(self, job)
            return 'work'
        item = next_item(t)
        if item is None:
            done = [i for i in t.get('items', []) if i['state'] == 'done']
            set_status(state='idle', message=u'Waiting for the next check', current=u'', kept=self.kept_info(),
                       free_gb=round(free, 1), total=len(t.get('items', [])), done=len(done))
            if cfg.get('close_when_done') and not self.kept:
                return 'exit'
            return 'wait'
        if not signed_in(self.app):
            set_status(state='needs sign-in', message=u'Sign in to Autodesk in this Revit to continue (%d model(s) left)'
                       % len([i for i in t['items'] if i['state'] == 'waiting']), kept=self.kept_info())
            return 'wait'
        self.read(item, t, cfg)
        return 'work'

    def read(self, item, t, cfg, persist=True):
        self._persist = persist
        guid = item['guid']
        reg = core.load_register()
        rec = reg.get(guid)
        left = len([i for i in t['items'] if i['state'] == 'waiting'])
        done_n = len([i for i in t['items'] if i['state'] == 'done'])
        name = (rec or {}).get('Name') or guid
        set_status(state='checking', current=name, message=u'%s %s (%d left)' % (
            u'Reloading' if item['kind'] == 'reload' else u'Checking', name, left), done=done_n,
            total=len(t['items']), kept=self.kept_info(), free_gb=round(free_gb(), 1))
        if rec is None:
            self._finish(item, t, 'failed', u'not in the model list of this PC')
            return
        self._drop(guid)                                   # always read a FRESH copy
        settings = core.load_settings()
        try:
            with core.QuietRevit(self.uiapp):
                doc, region, err = core.open_cloud_model(self.app, rec, settings.get('region'),
                                                         bool(settings.get('allow_non_workshared', False)), 'all',
                                                         settings.get('link_pattern') or u'*Link*')
        except Exception as e:
            doc, err = None, core.text(e)
        if doc is None:
            if _looks_like_login(err) or not signed_in(self.app):
                set_status(state='needs sign-in', message=u'Sign in to Autodesk to continue (%d model(s) left)' % left)
                return                                     # stays 'waiting': continues here after sign-in
            item['tries'] = item.get('tries', 0) + 1
            if item['tries'] >= 2:
                self._finish(item, t, 'failed', err)
            else:                                          # one more try at the end of the list
                t['items'].remove(item)
                t['items'].append(item)
                if persist:
                    save_todo(t)
            return
        try:
            import bimissue_core as issue
            cache = core.load_sheet_cache()
            old = (cache.get(guid) or {}).get('fp') or {}
            entry = core.read_sheet_list(doc, settings.get('naming_rule') or u'{DrawingNumber}')
            entry['guid'] = guid
            entry['issue'] = issue.read_issue_data(doc)
            fps = sheet_fingerprints(doc)
            entry['fp'] = fps
            entry['bg_checked'] = core.now()
            entry['bg_kind'] = item['kind']
            entry['bg_changes'] = changes_for(guid, fps, old)
            core.save_sheet_entry(guid, entry)
            n_att = len([1 for c in entry['bg_changes'].values() if c['since_issue'] is None or c['since_issue']])
            self._keep(guid, doc, cfg)
            self._finish(item, t, 'done', u'%d drawing(s), %d need attention' % (len(fps), n_att))
        except Exception as e:
            core_close(doc)
            self._finish(item, t, 'failed', core.text(e))

    def _finish(self, item, t, state, note):
        item['state'], item['note'], item['when'] = state, note, core.now()
        if getattr(self, '_persist', True):
            save_todo(t)
        if not any(i['state'] == 'waiting' for i in t['items']):
            set_status(last_check=core.now(), last_summary=summary(t))


def read_here_now(uiapp, guids, progress=None):
    """'Reload fully' in THIS Revit (no background Revit running): same reading, models closed afterwards."""
    eng = Engine(uiapp)
    cfg = dict(load_config(), keep_open=0)
    out = []
    for n, g in enumerate(guids):
        if progress:
            progress(n, len(guids))
        item = {'guid': g.lower(), 'kind': 'reload', 'state': 'waiting', 'tries': 1}
        t = {'items': [item]}
        eng.read(item, t, cfg, persist=False)
        out.append(item)
    return out


def core_close(doc):
    try:
        doc.Close(False)
    except Exception:
        pass


def summary(t):
    items = t.get('items', [])
    return u'%d model(s) done, %d failed' % (len([i for i in items if i['state'] == 'done']),
                                             len([i for i in items if i['state'] == 'failed']))


# ------------------------------------------------------------- printing ----
def kept_models():
    """{guid: as_of} of the models the background Revit holds open right now."""
    if not alive():
        return {}
    return dict((g, v.get('as_of', u'')) for g, v in (status().get('kept') or {}).items())


def send_print_job(job):
    """Issue Sheets / Quick Print: print models the background Revit keeps open. Returns the job id."""
    core.ensure_dir(JOBS_DIR)
    jid = u'%s_%d' % (time.strftime('%Y%m%d_%H%M%S'), os.getpid())
    job['id'] = jid
    _wj(os.path.join(JOBS_DIR, jid + u'.json'), job)
    return jid


def print_job_result(jid):
    return _rj(os.path.join(JOBS_DIR, jid + u'.done.json'), None)


def next_print_job(engine=None, t=None):
    """The next print job whose models are READY: no Apply waiting for them, no reload waiting, and the open copy
    is newer than their last Apply (so the export always includes the applied changes)."""
    if not os.path.isdir(JOBS_DIR):
        return None
    busy = pending_applies()
    if t is not None:
        busy |= set(i['guid'] for i in t.get('items', []) if i['state'] == 'waiting' and i['kind'] == 'reload')
    applied = status().get('applied') or {}
    for fn in sorted(os.listdir(JOBS_DIR)):
        if fn.endswith('.json') and not fn.endswith('.done.json') and not fn.endswith('.tmp'):
            job = _rj(os.path.join(JOBS_DIR, fn), None)
            if not job:
                continue
            ready = True
            for g in (job.get('picked') or {}):
                k = engine.kept.get(g) if engine is not None else None
                if g in busy or (k is not None and applied.get(g, u'') > k.get('as_of', u'')):
                    ready = False
            if ready:
                return job
    return None


# ------------------------------------------------------------ apply ----
def send_apply_job(job):
    core.ensure_dir(APPLY_DIR)
    jid = u'%s_%s' % (time.strftime('%Y%m%d_%H%M%S'), job['guid'][:8])
    job['id'] = jid
    _wj(os.path.join(APPLY_DIR, jid + u'.json'), job)
    return jid


def apply_result(jid):
    return _rj(os.path.join(APPLY_DIR, jid + u'.done.json'), None)


def pending_applies():
    """Models with an Apply sent to the background Revit and not finished yet."""
    out = set()
    if os.path.isdir(APPLY_DIR):
        for fn in os.listdir(APPLY_DIR):
            if fn.endswith('.json') and not fn.endswith('.done.json'):
                j = _rj(os.path.join(APPLY_DIR, fn), None)
                if j:
                    out.add(j['guid'].lower())
    return out


def next_apply_job():
    if not os.path.isdir(APPLY_DIR):
        return None
    for fn in sorted(os.listdir(APPLY_DIR)):
        if fn.endswith('.json') and not fn.endswith('.done.json') and not fn.endswith('.tmp'):
            return _rj(os.path.join(APPLY_DIR, fn), None)
    return None


def run_apply_job(engine, job):
    """Apply in the background Revit: your local copy, one change step, read back, sync + give back, close.
    Then the model is reloaded fresh (front of the list) so every later print includes the change."""
    import bimissue_core as issue
    jid, guid = job['id'], job['guid'].lower()
    rec = core.load_register().get(guid) or job.get('rec')
    set_status(state='applying', message=u'Applying %d change(s) to %s and syncing...' % (
        job.get('n_changes', 0), (rec or {}).get('Name', guid)))
    engine._drop(guid)                              # the open detached copy is about to be out of date
    settings = core.load_settings()
    settings.update(job.get('settings') or {})
    settings['_bg_apply'] = True
    settings['_user_open_guids'] = job.get('user_open') or []
    res = {'guid': guid, 'done': u''}

    def fresh(doc):
        e = core.read_sheet_list(doc, settings.get('naming_rule') or u'{DrawingNumber}')
        e['issue'] = issue.read_issue_data(doc)
        return e
    try:
        with core.QuietRevit(engine.uiapp):
            ok, log, undo, entry = issue.apply_changes(engine.app, rec, job['changes'], settings,
                                                       job.get('comment') or u'Issue Sheets by Lew (background)',
                                                       after=fresh)
        res.update({'ok': True, 'log': log, 'undo': issue.save_undo(undo)})
        if entry:
            old = core.load_sheet_cache().get(guid) or {}
            for k in ('fp', 'bg_changes', 'bg_checked', 'bg_kind'):
                if k in old:
                    entry[k] = old[k]
            entry['guid'] = guid
            core.save_sheet_entry(guid, entry)
        st = status()
        applied = st.get('applied') or {}
        applied[guid] = core.now()
        set_status(applied=applied)
        request_reload(guid)                        # fresh copy WITH the synced change, before any print of it
    except Exception as e:
        res.update({'ok': False, 'error': core.text(e)})
    res['done'] = core.now()
    try:
        os.remove(os.path.join(APPLY_DIR, jid + u'.json'))
    except Exception:
        pass
    _wj(os.path.join(APPLY_DIR, jid + u'.done.json'), res)


def run_print_job(engine, job):
    """Export from the open copies (no opening): same export code, same names, same checks."""
    jid = job['id']
    src = os.path.join(JOBS_DIR, jid + u'.json')
    try:
        os.remove(src)
    except Exception:
        pass
    settings = core.load_settings()
    settings.update(job.get('settings') or {})
    settings['_names'] = job.get('names') or {}
    settings['_row_formats'] = job.get('row_formats') or {}
    settings['_formats'] = job.get('formats') or settings.get('_formats')
    out = job['out_root']
    log_path = core.usable_log_path(os.path.join(core.logs_dir(out), u'SheetExport_log_bg.csv'))
    res = {'models': {}, 'ok': 0, 'failed': 0, 'missing': []}
    set_status(state='printing', message=u'Printing %d model(s) for you' % len(job.get('picked') or {}))
    for guid, nums in (job.get('picked') or {}).items():
        k = engine.kept.get(guid)
        if not k:
            res['missing'].append(guid)
            continue
        k['used'] = time.time()
        log = []
        settings['_current_guid'] = guid
        try:
            matched, counts, notes, raw_dir = core.export_model(k['doc'], None, out, settings, True, log,
                                                                picked=set(n.lower() for n in nums))
            res['ok'] += counts['ok']
            res['failed'] += counts['failed']
            res['models'][guid] = {'as_of': k['as_of'], 'counts': counts, 'notes': notes}
            for n in notes:
                log.append([core.now(), 'INFO', core.model_name(k['doc']), '', '', '', '', '', 'NOTE', '', n])
            if job.get('run_cad'):
                final_dir = os.path.join(os.path.dirname(raw_dir), 'DWG')
                jobs = [(row[7], final_dir) for row in log if len(row) > 8 and row[6] == u'DWG' and row[8] == u'OK']
                if jobs:
                    core.logo_queue_add(out, jobs)
                    if not res.get('logo_runner'):
                        res['logo_runner'] = core.logo_runner_start(out, settings)[0]
            try:
                remember_issued(guid, sheet_fingerprints(k['doc'], nums)) if job.get('kind') == 'issue' else None
            except Exception:
                pass
        except Exception as e:
            res['models'][guid] = {'error': core.text(e)}
        core.append_csv(log_path, core.LOG_HEADER, log)
    res['log'] = log_path
    res['done'] = core.now()
    _wj(os.path.join(JOBS_DIR, jid + u'.done.json'), res)
