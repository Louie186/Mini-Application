# -*- coding: utf-8 -*-
"""
bimexport_core - logic for the "Export Sheets" pyRevit button.

Works in pyRevit's IronPython 2.7 engine (default) and in CPython 3.

What it does, per chosen ACC model:
  open in the background (detached, all worksets) -> check links ->
  export the LOD sheets that live in this model to PDF + DWG -> close without saving.
Then (optional) starts AutoCAD to embed the logos with IMG2OLE.
"""
from __future__ import print_function

import os
import re
import io
import json
import time
import datetime

import clr
clr.AddReference('RevitAPI')
import Autodesk.Revit.DB as DB
from Autodesk.Revit.DB import (FilteredElementCollector, ViewSheet, ElementId,
                               BuiltInParameter, PDFExportOptions, DWGExportOptions,
                               ExportPDFSettings, ModelPathUtils, OpenOptions,
                               DetachFromCentralOption, WorksetConfiguration,
                               WorksetConfigurationOption, BasicFileInfo, RevitLinkType,
                               FailureProcessingResult, FailureSeverity)
from System import Guid
from System.Collections.Generic import List

SETTINGS_DIR = os.path.join(os.environ.get('APPDATA', ''), 'BIMExport')
SETTINGS_FILE = os.path.join(SETTINGS_DIR, 'settings.json')
REGISTER_FILE = os.path.join(SETTINGS_DIR, 'ModelRegister.csv')
REGISTER_COLS = ['Name', 'Project', 'Region', 'ProjectGUID', 'ModelGUID', 'LastSeen']

LOG_HEADER = ['Timestamp', 'Mode', 'Model', 'ListedNumber', 'SheetName', 'Revision',
              'Format', 'File', 'Status', 'Seconds', 'Note']

DEFAULT_SETTINGS = {
    'naming_rule': '{DrawingNumber}',
    'dwg_setup': '',
    'pdf_setup': '',
    'region': 'EMEA',
    'last_lod': '',
    'last_output': '',
    'run_img2ole': True,
    'img2ole_lsp': '',                       # blank = the copy inside this extension
    'acad_exe': '',
}


# ------------------------------------------------------------------ basics --
def now():
    return datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def text(v):
    if v is None:
        return u''
    try:
        return u'%s' % v
    except Exception:
        return u'%r' % (v,)


LOGS_FOLDER = u'_Logs'


def logs_dir(out_root):
    """<export folder>\\_Logs: every log, queue and script file of a run (drawings stay outside)."""
    return ensure_dir(os.path.join(out_root, LOGS_FOLDER))


def ensure_dir(d):
    if d and not os.path.isdir(d):
        os.makedirs(d)
    return d


def clean(name):
    name = re.sub(r'[\\/:*?"<>|]', '-', name)
    name = re.sub(r'\s+', ' ', name)
    name = re.sub(r'([-_.])\1+', r'\1', name)
    name = re.sub(r'\s*([-_])\s*([-_])\s*', r'\1', name)
    return name.strip(' -_.')


def is_guid(s):
    return bool(re.match(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$', s or ''))


# -------------------------------------------------------------------- CSV --
def read_text(path):
    for enc in ('utf-8-sig', 'mbcs', 'cp1252', 'latin-1'):
        try:
            with io.open(path, 'r', encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, LookupError):
            continue
    raise Exception('Cannot read %s - save it as CSV UTF-8.' % path)


def parse_csv_line(line, delim):
    out, cur, quoted, i = [], [], False, 0
    while i < len(line):
        c = line[i]
        if quoted:
            if c == '"':
                if i + 1 < len(line) and line[i + 1] == '"':
                    cur.append('"')
                    i += 1
                else:
                    quoted = False
            else:
                cur.append(c)
        else:
            if c == '"':
                quoted = True
            elif c == delim:
                out.append(u''.join(cur))
                cur = []
            else:
                cur.append(c)
        i += 1
    out.append(u''.join(cur))
    return out


def read_csv(path):
    lines = [l for l in read_text(path).splitlines() if l.strip()]
    if not lines:
        return []
    delim = ';' if lines[0].count(';') > lines[0].count(',') else ','
    head = [h.strip() for h in parse_csv_line(lines[0], delim)]
    rows = []
    for l in lines[1:]:
        vals = parse_csv_line(l, delim)
        rows.append(dict((head[i], (vals[i] if i < len(vals) else u'').strip()) for i in range(len(head))))
    return rows


def csv_line(values):
    return u','.join(u'"%s"' % text(v).replace(u'"', u'""') for v in values)


def _append(path, header, rows):
    new = not os.path.exists(path) or os.path.getsize(path) == 0
    with io.open(path, 'a', encoding='utf-8-sig' if new else 'utf-8') as f:
        if new:
            f.write(csv_line(header) + u'\n')
        for r in rows:
            f.write(csv_line(r) + u'\n')


def usable_log_path(path):
    """The log path, or a new dated one if the file is locked (e.g. open in Excel). Never creates the file."""
    if not os.path.exists(path):
        return path
    try:
        with io.open(path, 'a', encoding='utf-8'):
            pass
        return path
    except Exception:
        base, ext = os.path.splitext(path)
        return u'%s_%s%s' % (base, datetime.datetime.now().strftime('%Y%m%d_%H%M%S'), ext)


def append_csv(path, header, rows):
    """Append rows. Never stops the run: if the file is locked, writes a dated copy.
    Returns the path actually written."""
    try:
        _append(path, header, rows)
        return path
    except Exception:
        alt = usable_log_path(path)
        if alt == path:
            alt = os.path.splitext(path)[0] + u'_%d.csv' % int(time.time())
        try:
            _append(alt, header, rows)
        except Exception:
            pass
        return alt


def write_csv(path, header, rows):
    with io.open(path, 'w', encoding='utf-8-sig') as f:
        f.write(csv_line(header) + u'\n')
        for r in rows:
            f.write(csv_line(r) + u'\n')


# --------------------------------------------------------------- settings --
def load_settings():
    s = dict(DEFAULT_SETTINGS)
    try:
        with io.open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
            s.update(json.loads(f.read()))
    except Exception:
        pass
    return s


def save_settings(s):
    ensure_dir(SETTINGS_DIR)
    with io.open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
        f.write(text(json.dumps(s, indent=2)))


# --------------------------------------------------------------------- LOD --
ALIASES = {
    'drawingnumber': 'drawingnumber', 'drawingno': 'drawingnumber', 'drawingno.': 'drawingnumber',
    'dwgno': 'drawingnumber', 'dwgno.': 'drawingnumber', 'documentnumber': 'drawingnumber',
    'documentno': 'drawingnumber', 'docno': 'drawingnumber', 'docno.': 'drawingnumber',
    'sheetnumber': 'sheetnumber', 'sheetno': 'sheetnumber', 'sheetno.': 'sheetnumber',
    'title': 'sheetname', 'drawingtitle': 'sheetname', 'drawingname': 'sheetname', 'sheetname': 'sheetname',
    'rev': 'revision', 'rev.': 'revision', 'revision': 'revision',
    'pdf': 'pdf', 'dwg': 'dwg',
}


def key(s):
    return (s or u'').strip().lower().replace(u' ', u'').replace(u'_', u'')


def read_lod(path):
    """Rows with normalised keys: drawingnumber / sheetnumber / sheetname / revision / pdf / dwg."""
    rows = []
    for r in read_csv(path):
        row = {}
        for k, v in r.items():
            kk = key(k)
            row[ALIASES.get(kk, kk)] = v
        num = (row.get('drawingnumber') or row.get('sheetnumber') or u'').strip()
        if num:
            row['_listed'] = num
            rows.append(row)
    return rows


def lod_parts(number):
    return [p.strip() for p in (number or u'').split(u'-')]


def lod_candidates(row):
    """Ways a listed number can match a Revit sheet number."""
    c = []
    if row.get('sheetnumber'):
        c.append(row['sheetnumber'])
    dn = row.get('drawingnumber', u'')
    if dn:
        p = lod_parts(dn)
        c.append(dn)
        if len(p) >= 7:
            c.append(p[6])            # sequence, e.g. 10100
        if len(p) >= 2:
            c.append(p[-2])
    return [x.strip().lower() for x in c if x.strip()]


def list_revision(row):
    if row.get('revision'):
        return row['revision']
    p = lod_parts(row.get('drawingnumber', u''))
    return p[-1] if len(p) >= 8 else u''


def yes(v, default=True):
    if v is None or text(v).strip() == u'':
        return default
    return text(v).strip().lower() in (u'y', u'yes', u'1', u'true', u'x')


# ---------------------------------------------------------- model register --
def load_register():
    reg = {}
    if os.path.exists(REGISTER_FILE):
        for r in read_csv(REGISTER_FILE):
            mg = (r.get('ModelGUID') or u'').lower()
            if is_guid(mg):
                reg[mg] = dict((c, r.get(c, u'')) for c in REGISTER_COLS)
    return reg


def save_register(reg):
    ensure_dir(SETTINGS_DIR)
    rows = sorted(reg.values(), key=lambda r: (r.get('Project', u''), r.get('Name', u'')))
    write_csv(REGISTER_FILE, REGISTER_COLS, [[r.get(c, u'') for c in REGISTER_COLS] for r in rows])


def _name_from_cache_file(path):
    """Model and project name from a cached cloud model (header only, fast)."""
    try:
        info = BasicFileInfo.Extract(path)
        cp = info.CentralPath or u''
        parts = [p for p in re.split(r'[\\/]+', cp) if p and not p.endswith(':')]
        if parts:
            name = re.sub(r'\.rvt$', u'', parts[-1], flags=re.I)
            proj = parts[-2] if len(parts) >= 2 else u''
            return name, proj
    except Exception:
        pass
    return None, None


def discover_cache(revit_version):
    """Cloud models this PC has opened before:
    %LOCALAPPDATA%/Autodesk/Revit/Autodesk Revit <ver>/CollaborationCache/<user>/<projectGUID>/<modelGUID>.rvt"""
    base = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Autodesk', 'Revit',
                        'Autodesk Revit %s' % revit_version, 'CollaborationCache')
    found = {}
    if not os.path.isdir(base):
        return found
    for user in os.listdir(base):
        up = os.path.join(base, user)
        if not os.path.isdir(up):
            continue
        for proj in os.listdir(up):
            pp = os.path.join(up, proj)
            if not (is_guid(proj) and os.path.isdir(pp)):
                continue
            for f in os.listdir(pp):
                mg = f[:-4]
                if f.lower().endswith('.rvt') and is_guid(mg):
                    fp = os.path.join(pp, f)
                    mt = os.path.getmtime(fp)
                    if mg.lower() not in found or found[mg.lower()]['mtime'] < mt:
                        found[mg.lower()] = {'ProjectGUID': proj.lower(), 'ModelGUID': mg.lower(),
                                             'path': fp, 'mtime': mt}
    return found


def refresh_register(revit_version):
    """Register + anything new in the local cache. Returns the register dict."""
    reg = load_register()
    for mg, c in discover_cache(revit_version).items():
        r = reg.get(mg)
        if r is None:
            r = dict((k, u'') for k in REGISTER_COLS)
            r['ProjectGUID'], r['ModelGUID'] = c['ProjectGUID'], mg
            reg[mg] = r
        if not r.get('Name'):
            name, proj = _name_from_cache_file(c['path'])
            if name:
                r['Name'], r['Project'] = name, proj or r.get('Project', u'')
    save_register(reg)
    return reg


def natural_key(text_):
    """Sort like a person: 21002 before 21010, 'Model 2' before 'Model 10', case ignored."""
    return [(0, int(t), u'') if t.isdigit() else (1, 0, t) for t in re.split(r'(\d+)', (text_ or u'').lower()) if t != u'']


def model_sort_key(r):
    """Models: real project models in number order first, then copies such as *_detached / test models."""
    name = (r.get('Name') or u'').strip()
    side = 1 if re.search(r'(detached|test|copy|backup|old)', name, re.I) else 0
    return (side, natural_key(name or core_label(r)))


def core_label(r):
    return register_label(r)


def register_label(r):
    name = r.get('Name') or (u'(unnamed model %s)' % r['ModelGUID'][:8])
    proj = r.get('Project') or r['ProjectGUID'][:8]
    return u'%s   [%s]' % (name, proj)


# ------------------------------------------------------------- open/close --
def _regions(preferred):
    known = []
    for attr, fallback in (('CloudRegionEMEA', 'EMEA'), ('CloudRegionUS', 'US'), ('CloudRegionAPAC', 'AUS')):
        known.append(getattr(ModelPathUtils, attr, fallback))
    order = [preferred] if preferred else []
    return order + [r for r in known if r != preferred]


def find_open_doc(app, model_guid):
    for d in app.Documents:
        try:
            if d.IsModelInCloud and d.GetCloudModelPath().GetModelGUID().ToString().lower() == model_guid:
                return d
        except Exception:
            pass
    return None


def _open(app, path, opts):
    try:
        return app.OpenDocumentFile(path, opts, DB.DefaultOpenFromCloudCallback())
    except AttributeError:
        return app.OpenDocumentFile(path, opts)


def workset_config(path, worksets, skip_pattern):
    """'all'  : every workset (complete prints)
       'none' : all user worksets closed - fastest, no linked models load (enough to read the drawing list)
       'skip' : every workset except those whose name matches skip_pattern (e.g. *Link*) -> links not loaded
    Returns (WorksetConfiguration, note)."""
    if worksets == 'none':
        return WorksetConfiguration(WorksetConfigurationOption.CloseAllWorksets), None
    if worksets == 'skip' and skip_pattern:
        try:
            import fnmatch
            infos = list(DB.WorksharingUtils.GetUserWorksetInfo(path))
            pats = [p.strip().lower() for p in skip_pattern.split(';') if p.strip()]
            keep = [w for w in infos if not any(fnmatch.fnmatch(w.Name.lower(), p) for p in pats)]
            skipped = [w.Name for w in infos if w not in keep]
            wc = WorksetConfiguration(WorksetConfigurationOption.CloseAllWorksets)
            wc.Open(List[DB.WorksetId]([w.Id for w in keep]))
            return wc, (u'Worksets not opened (links skipped): %s' % u', '.join(skipped)) if skipped else \
                u'No workset matched "%s" - all worksets opened' % skip_pattern
        except Exception as e:
            return WorksetConfiguration(WorksetConfigurationOption.OpenAllWorksets), \
                u'Could not read worksets (%s) - all worksets opened' % text(e)
    return WorksetConfiguration(WorksetConfigurationOption.OpenAllWorksets), None


def open_cloud_model(app, rec, preferred_region, allow_non_workshared=False, worksets='all', skip_pattern=u''):
    """Open a cloud model for printing.
    Workshared: DETACHED from central with all worksets (a temporary copy, never synced).
    Not workshared: there is no central to detach from, so Revit can only open the real model.
      This is refused unless allow_non_workshared is True.
    Returns (doc, region, note-or-error)."""
    errors = []
    for reg in _regions(rec.get('Region') or preferred_region):
        try:
            path = ModelPathUtils.ConvertCloudGUIDsToCloudPath(
                reg, Guid(rec['ProjectGUID']), Guid(rec['ModelGUID']))
        except Exception as e:
            errors.append(u'%s: %s' % (reg, text(e)))
            continue
        try:
            opts = OpenOptions()
            opts.DetachFromCentralOption = DetachFromCentralOption.DetachAndPreserveWorksets
            wc, wnote = workset_config(path, worksets, skip_pattern)
            opts.SetOpenWorksetsConfiguration(wc)
            return _open(app, path, opts), reg, wnote
        except Exception as e:
            msg = text(e)
        low = msg.lower()
        if 'detach' in low or 'workshar' in low or ('central' in low and 'missing' not in low):
            if not allow_non_workshared:
                return None, reg, (u'NOT WORKSHARED - skipped to protect it. It cannot be opened detached, '
                                   u'so printing would open the real model. Allow it in the Run tab only if '
                                   u'nobody (including you in another Revit window) has it open.')
            try:
                return _open(app, path, OpenOptions()), reg, \
                    u'Not workshared - opened directly as allowed (closed without saving)'
            except Exception as e2:
                msg = text(e2)
        if 'central model is missing' in low:
            msg = u'not found in this region'
        errors.append(u'%s: %s' % (reg, msg))
    return None, None, u' | '.join(errors)


def check_links(doc, reload_links=True):
    notes = []
    for lt in FilteredElementCollector(doc).OfClass(RevitLinkType):
        try:
            if not RevitLinkType.IsLoaded(doc, lt.Id):
                if not reload_links:
                    notes.append(u'Link not loaded (skipped on purpose): %s' % lt.Name)
                    continue
                try:
                    lt.Reload()
                    notes.append(u'Reloaded link: %s' % lt.Name)
                except Exception as e:
                    notes.append(u'LINK NOT LOADED: %s (%s)' % (lt.Name, text(e)))
        except Exception:
            pass
    return notes


class QuietRevit(object):
    """While active: auto-close Revit pop-ups and delete warnings, so the run never stops."""

    def __init__(self, uiapp):
        self.uiapp = uiapp
        self.app = uiapp.Application

    def _dialog(self, sender, args):
        try:
            args.OverrideResult(1)
        except Exception:
            pass

    def _failures(self, sender, args):
        try:
            fa = args.GetFailuresAccessor()
            for m in list(fa.GetFailureMessages()):
                if m.GetSeverity() == FailureSeverity.Warning:
                    fa.DeleteWarning(m)
            args.SetProcessingResult(FailureProcessingResult.Continue)
        except Exception:
            pass

    def __enter__(self):
        self.uiapp.DialogBoxShowing += self._dialog
        self.app.FailuresProcessing += self._failures
        return self

    def __exit__(self, *a):
        try:
            self.uiapp.DialogBoxShowing -= self._dialog
        except Exception:
            pass
        try:
            self.app.FailuresProcessing -= self._failures
        except Exception:
            pass
        return False


# ------------------------------------------------------------------ export --
def model_name(doc):
    t = re.sub(r'\.rvt$', u'', doc.Title, flags=re.I)
    try:
        u = doc.Application.Username or u''
        if u and t.lower().endswith(u'_' + u.lower()):
            t = t[:-(len(u) + 1)]
    except Exception:
        pass
    return t


def _param(el, name):
    p = el.LookupParameter(name)
    if p is None:
        return None
    return p.AsString() or p.AsValueString() or u''


def sheet_revision(sheet):
    p = sheet.get_Parameter(BuiltInParameter.SHEET_CURRENT_REVISION)
    return (p.AsString() if p else u'') or u''


def model_guid(doc):
    try:
        return doc.GetCloudModelPath().GetModelGUID().ToString().lower()
    except Exception:
        return u''


def fixed_name(settings, guid, number):
    """Exact file name set beforehand for this model + sheet (Issue Sheets), else None."""
    names = settings.get('_names') or {}
    return names.get(u'%s|%s' % ((guid or u'').lower(), number.strip().lower()))


def build_name(rule, vals, sheet_param, project_param):
    """Apply the naming rule. sheet_param / project_param: functions name -> text or None."""
    missing = []

    def rep(m):
        token = m.group(1).strip()
        k = key(token)
        if k in vals:
            return vals[k] or u''
        low = token.lower()
        if low.startswith('p:'):
            v = sheet_param(token[2:].strip())
        elif low.startswith('project:'):
            v = project_param(token[8:].strip())
        else:
            v = None
        if v is None:
            missing.append(token)
            return u''
        return v

    return clean(re.sub(r'\{([^}]+)\}', rep, rule)), missing


def drawing_code(listed):
    """The list's code without any revision: its first 7 parts (5013-KEO-T1-ZZ-PLN-INT-10100)."""
    p = lod_parts(listed)
    return u'-'.join(p[:7]) if len(p) >= 7 else (listed or u'').strip()


def make_name(doc, sheet, rule, row, model):
    rev = sheet_revision(sheet)
    listed = row.get('drawingnumber') or u''
    code = drawing_code(listed) if listed else sheet.SheetNumber
    # {DrawingNumber} = the list's code + the revision Revit shows on the sheet NOW (never the list's revision),
    # so the file name always matches the title block. If the rule adds a revision itself, the code alone.
    rule_has_rev = bool(re.search(r'\{\s*(list\s*)?revision\s*\}', rule or u'', re.I))
    if listed and len(lod_parts(listed)) >= 7 and not rule_has_rev:
        dn = code + (u'-' + rev if rev else u'')
    elif listed and len(lod_parts(listed)) >= 7:
        dn = code
    else:
        dn = listed or sheet.SheetNumber
    vals = {
        'sheetnumber': sheet.SheetNumber, 'sheetname': sheet.Name,
        'revision': rev, 'model': model,
        'date': datetime.date.today().strftime('%Y%m%d'),
        'drawingnumber': dn, 'drawingcode': code,
        'listrevision': list_revision(row),
    }
    return build_name(rule, vals, lambda n: _param(sheet, n),
                      lambda n: _param(doc.ProjectInformation, n))


def _sheet_texts(sheet):
    """(name, value) of the sheet's text parameters (e.g. a 'Drawing Number' shown in the title block)."""
    out = []
    try:
        for p in sheet.Parameters:
            try:
                if p.StorageType == DB.StorageType.String and p.HasValue:
                    v = p.AsString()
                    if v:
                        out.append((text(p.Definition.Name), text(v).strip()))
            except Exception:
                continue
    except Exception:
        pass
    return out


def name_guard(sheet, name, rev, texts=None):
    """Last check before a file is written: does the file name match what the sheet shows?
    Returns None (fine) or the reason to BLOCK it. Only names shaped like a drawing code are checked:
    ...-<sheet number>-<revision>."""
    parts = [x.strip() for x in (name or u'').split(u'-')]
    num = (sheet.SheetNumber or u'').strip().lower()
    idx = [i for i, x in enumerate(parts) if x.lower() == num]
    if not idx:
        return None
    i = idx[-1]
    tail = parts[i + 1:]
    if len(tail) > 1:
        return None                                          # not a code + revision shape: leave it
    if tail:
        if not rev:
            return u'the file name has revision %s, but the sheet has NO revision in Revit' % tail[0]
        if tail[0].lower() != rev.strip().lower():
            return u'the file name has revision %s, but the sheet shows %s' % (tail[0], rev)
    base = u'-'.join(parts[:i + 1]).lower()
    for pname, v in (texts if texts is not None else _sheet_texts(sheet)):
        # a text on the sheet that holds the full drawing number (code + revision) must say the same as the file
        vp = [x.strip() for x in v.split(u'-')]
        if tail and len(vp) == i + 2 and u'-'.join(vp[:i + 1]).lower() == base and v.lower() != name.lower():
            return u'the sheet\'s "%s" shows %s, the file would be %s' % (pname, v, name)
    return None


# ------------------------------------------------------ saved sheet lists --
SHEET_CACHE_FILE = os.path.join(SETTINGS_DIR, 'SheetCache.json')


SHEET_DIR = os.path.join(SETTINGS_DIR, 'sheets')      # one file per model: safe with several Revit windows


def load_sheet_cache():
    c = {}
    try:                                                    # older single-file cache
        with io.open(SHEET_CACHE_FILE, 'r', encoding='utf-8') as f:
            c.update(json.loads(f.read()))
    except Exception:
        pass
    if os.path.isdir(SHEET_DIR):
        for fn in os.listdir(SHEET_DIR):
            if fn.lower().endswith('.json'):
                try:
                    with io.open(os.path.join(SHEET_DIR, fn), 'r', encoding='utf-8') as f:
                        c[fn[:-5].lower()] = json.loads(f.read())
                except Exception:
                    pass
    return c


def save_sheet_entry(guid, entry):
    ensure_dir(SHEET_DIR)
    tmp = os.path.join(SHEET_DIR, guid.lower() + '.tmp')
    dst = os.path.join(SHEET_DIR, guid.lower() + '.json')
    with io.open(tmp, 'w', encoding='utf-8') as f:
        f.write(text(json.dumps(entry, indent=1)))
    if os.path.exists(dst):
        os.remove(dst)
    os.rename(tmp, dst)


def save_sheet_cache(c):
    for guid, entry in c.items():
        try:
            save_sheet_entry(guid, entry)
        except Exception:
            pass


def rule_params(rule):
    """Sheet and project parameter names used by the naming rule."""
    sp, pp = [], []
    for t in re.findall(r'\{([^}]+)\}', rule or u''):
        t = t.strip()
        if t.lower().startswith('p:'):
            sp.append(t[2:].strip())
        elif t.lower().startswith('project:'):
            pp.append(t[8:].strip())
    return sp, pp


def read_sheet_list(doc, rule):
    """Everything needed to show, name and check the sheets later without opening the model."""
    sp, pp = rule_params(rule)
    sheets = []
    for s in FilteredElementCollector(doc).OfClass(ViewSheet):
        if s.IsPlaceholder:
            continue
        params = {}
        for n in sp:
            v = _param(s, n)
            if v is not None:
                params[n] = v
        sheets.append({'number': s.SheetNumber, 'name': s.Name, 'rev': sheet_revision(s), 'params': params})
    sheets.sort(key=lambda x: x['number'])
    project = {}
    for n in pp:
        v = _param(doc.ProjectInformation, n)
        if v is not None:
            project[n] = v
    orgs, current = read_browser_orgs(doc), u''
    try:
        current = DB.BrowserOrganization.GetCurrentBrowserOrganizationForSheets(doc).Name
    except Exception:
        pass
    return {'model': model_name(doc), 'guid': model_guid(doc), 'updated': now(), 'rule': rule, 'sheets': sheets, 'project': project,
            'orgs': orgs, 'current_org': current, 'setups': read_export_setups(doc)}


def read_browser_orgs(doc):
    """{organization name: {sheet number: [folder, subfolder, ...]}} for every sheet browser organization."""
    out = {}
    try:
        sheet_type = DB.BrowserOrganizationType.Sheets
        sheets = [s for s in FilteredElementCollector(doc).OfClass(ViewSheet) if not s.IsPlaceholder]
        for org in FilteredElementCollector(doc).OfClass(DB.BrowserOrganization):
            try:
                if org.Type != sheet_type:
                    continue
                m = {}
                for s in sheets:
                    try:
                        if hasattr(org, 'AreFiltersSatisfied') and not org.AreFiltersSatisfied(s.Id):
                            continue
                    except Exception:
                        pass
                    try:
                        m[s.SheetNumber] = [text(i.Name) for i in org.GetFolderItems(s.Id)]
                    except Exception:
                        m[s.SheetNumber] = []
                out[text(org.Name)] = m
            except Exception:
                continue
    except Exception:
        pass
    return out


def plan_from_cache(entry, numbers, out_root, settings, log):
    """Dry run from a saved sheet list (no model opened). Returns count of files."""
    model = entry.get('model', u'?')
    rule = settings.get('naming_rule') or u'{DrawingNumber}'
    fmts = settings.get('_formats') or {'pdf': u'Y', 'dwg': u'Y'}
    mdir = model_folder(out_root, model, settings)
    n = 0
    for e in entry.get('sheets', []):
        if e['number'].strip().lower() not in numbers:
            continue
        vals = {'sheetnumber': e['number'], 'sheetname': e['name'], 'revision': e.get('rev', u''),
                'model': model, 'date': datetime.date.today().strftime('%Y%m%d'),
                'drawingnumber': e['number'], 'listrevision': u''}
        fixed = fixed_name(settings, entry.get('guid', u''), e['number'])
        if fixed:
            name, missing = fixed, []
        else:
            name, missing = build_name(rule, vals, lambda p: e.get('params', {}).get(p),
                                       lambda p: entry.get('project', {}).get(p))
        note = (u'Unknown token(s): %s (refresh the sheet lists if you changed the naming rule)'
                % u', '.join(missing)) if missing else u''
        for fmt, sub in ((u'PDF', 'PDF'), (u'DWG', '_DWG_raw')):
            if yes(fmts.get(fmt.lower())):
                n += 1
                log.append([now(), u'DRYRUN', model, e['number'], e['name'], e.get('rev', u''), fmt,
                            os.path.join(mdir, sub, (name or clean(e['number'])) + u'.' + fmt.lower()),
                            u'WOULD_EXPORT', u'', note])
    return n


PDF_DEFAULTS = {'setup': '', 'paper': 'Use sheet size', 'orientation': 'Auto', 'placement': 'Center',
                'offset_x': 0.0, 'offset_y': 0.0, 'zoom': 'Fit to page', 'zoom_pct': 100,
                'raster_quality': 'High', 'colors': 'Color', 'processing': 'Vector',
                'links_blue': False, 'hide_ref_planes': True, 'hide_unref_tags': False, 'mask_coincident': False,
                'hide_scope': True, 'hide_crop': True, 'halftone_thin': False}
DWG_DEFAULTS = {'setup': '', 'version': '2018', 'layers': 'AIA', 'merged_views': True, 'shared_coords': False,
                'colors': 'IndexColors', 'units': 'Default'}

PDF_COLORS = [('Color', 'Color'), ('Grayscale', 'GrayScale'), ('Black lines', 'BlackLine')]
PDF_PAPERS = [('Use sheet size', 'Default'), ('A0', 'ISO_A0'), ('A1', 'ISO_A1'), ('A2', 'ISO_A2'),
              ('A3', 'ISO_A3'), ('A4', 'ISO_A4'), ('ANSI D', 'ANSI_D'), ('ANSI E', 'ANSI_E'),
              ('Letter', 'Letter'), ('Tabloid', 'Tabloid')]
PDF_ORIENT = [('Auto', 'Auto'), ('Portrait', 'Portrait'), ('Landscape', 'Landscape')]
PDF_PLACE = [('Center', 'Center'), ('Offset from corner', 'LowerLeft')]
PDF_ZOOM = [('Fit to page', 'FitToPage'), ('Zoom', 'Zoom')]
PDF_RASTER = ['Low', 'Medium', 'High', 'Presentation']
DWG_LAYERS = ['AIA', 'ISO13567', 'CP83', 'BS1192']
DWG_COLORS = [('Index colors', 'IndexColors'), ('True color', 'TrueColor'), ('True color per view', 'TrueColorPerView')]
DWG_VERSIONS = ['2018', '2013', '2010', '2007']

PDF_BOOLS = [('links_blue', 'ViewLinksInBlue'), ('hide_ref_planes', 'HideReferencePlane'),
             ('hide_unref_tags', 'HideUnreferencedViewTags'), ('mask_coincident', 'MaskCoincidentLines'),
             ('hide_scope', 'HideScopeBoxes'), ('hide_crop', 'HideCropBoundaries'),
             ('halftone_thin', 'ReplaceHalftoneWithThinLines')]


def to_api(pairs, shown):
    for d, a in pairs:
        if d == shown:
            return a
    return shown


def to_shown(pairs, api):
    for d, a in pairs:
        if a == api:
            return d
    return api


def _set(obj, prop, val, notes=None):
    try:
        setattr(obj, prop, val)
    except Exception as e:
        if notes is not None:
            notes.append(u'%s not set (%s)' % (prop, text(e)))


def _enum(enum_type, name):
    try:
        return getattr(enum_type, name)
    except Exception:
        return None


def _get(obj, prop, default=None):
    try:
        return getattr(obj, prop)
    except Exception:
        return default


def pdf_settings(settings):
    ps = dict(PDF_DEFAULTS)
    ps.update(settings.get('pdf') or {})
    return ps


def dwg_settings(settings):
    ds = dict(DWG_DEFAULTS)
    ds.update(settings.get('dwg') or {})
    return ds


def pdf_values(opts):
    """Readable values of a PDFExportOptions (what the window shows)."""
    v = {'paper': to_shown(PDF_PAPERS, text(_get(opts, 'PaperFormat', 'Default'))),
         'orientation': to_shown(PDF_ORIENT, text(_get(opts, 'PaperOrientation', 'Auto'))),
         'placement': to_shown(PDF_PLACE, text(_get(opts, 'PaperPlacement', 'Center'))),
         'offset_x': _get(opts, 'OriginOffsetX', 0.0), 'offset_y': _get(opts, 'OriginOffsetY', 0.0),
         'zoom': to_shown(PDF_ZOOM, text(_get(opts, 'ZoomType', 'FitToPage'))),
         'zoom_pct': _get(opts, 'ZoomPercentage', 100),
         'raster_quality': text(_get(opts, 'RasterQuality', 'High')),
         'colors': to_shown(PDF_COLORS, text(_get(opts, 'ColorDepth', 'Color'))),
         'processing': 'Raster' if _get(opts, 'AlwaysUseRaster', False) else 'Vector'}
    for key, prop in PDF_BOOLS:
        v[key] = bool(_get(opts, prop, PDF_DEFAULTS[key]))
    return v


def dwg_values(opts):
    return {'version': text(_get(opts, 'FileVersion', 'R2018')).replace('R', ''),
            'layers': text(_get(opts, 'LayerMapping', 'AIA')),
            'merged_views': bool(_get(opts, 'MergedViews', True)),
            'shared_coords': bool(_get(opts, 'SharedCoords', False)),
            'colors': text(_get(opts, 'Colors', 'IndexColors')),
            'units': text(_get(opts, 'TargetUnit', 'Default'))}


def naming_rule_from_pdf(doc, opts):
    """Turn a PDF setup's file-naming rule into this tool's rule, e.g.
    {Project:Project Number}-{P:Originator}-...-{SheetNumber}-{Revision}."""
    try:
        parts = list(opts.GetNamingRule())
    except Exception:
        return u''
    proj_cat = None
    try:
        proj_cat = doc.ProjectInformation.Category.Id
    except Exception:
        pass
    out = []
    for i, p in enumerate(parts):
        token = None
        pid = p.ParamId
        val = _get(pid, 'Value', None)
        if val is None:
            val = _get(pid, 'IntegerValue', 0)
        try:
            if val < 0:
                import System
                bip = System.Enum.ToObject(BuiltInParameter, val)
                if bip == BuiltInParameter.SHEET_NUMBER:
                    token = u'{SheetNumber}'
                elif bip == BuiltInParameter.SHEET_NAME:
                    token = u'{SheetName}'
                elif bip == BuiltInParameter.SHEET_CURRENT_REVISION:
                    token = u'{Revision}'
                else:
                    name = DB.LabelUtils.GetLabelFor(bip)
            else:
                name = doc.GetElement(pid).Name
        except Exception:
            name = u'?'
        if token is None:
            is_proj = proj_cat is not None and _get(p, 'CategoryId', None) == proj_cat
            token = (u'{Project:%s}' if is_proj else u'{P:%s}') % name
        sep = _get(p, 'Separator', u'') or u''
        out.append((_get(p, 'Prefix', u'') or u'') + token + (_get(p, 'Suffix', u'') or u'') +
                   (sep if i < len(parts) - 1 else u''))
    return u''.join(out)


def read_export_setups(doc):
    """Saved PDF and DWG export setups of a model, with their values (shown in the window)."""
    pdf, dwg = {}, {}
    try:
        for s in FilteredElementCollector(doc).OfClass(ExportPDFSettings):
            try:
                o = s.GetOptions()
                v = pdf_values(o)
                v['naming'] = naming_rule_from_pdf(doc, o)
                pdf[text(s.Name)] = v
            except Exception:
                pass
    except Exception:
        pass
    try:
        for s in FilteredElementCollector(doc).OfClass(DB.ExportDWGSettings):
            try:
                dwg[text(s.Name)] = dwg_values(s.GetDWGExportOptions())
            except Exception:
                pass
    except Exception:
        pass
    return {'pdf': pdf, 'dwg': dwg}


def _apply_pdf(opts, ps, notes):
    for prop, enum_name, val in (('PaperFormat', 'ExportPaperFormat', to_api(PDF_PAPERS, ps['paper'])),
                                 ('PaperOrientation', 'PageOrientationType', to_api(PDF_ORIENT, ps['orientation'])),
                                 ('PaperPlacement', 'PaperPlacementType', to_api(PDF_PLACE, ps['placement'])),
                                 ('ZoomType', 'ZoomType', to_api(PDF_ZOOM, ps['zoom'])),
                                 ('RasterQuality', 'RasterQualityType', ps['raster_quality']),
                                 ('ColorDepth', 'ColorDepthType', to_api(PDF_COLORS, ps['colors']))):
        e = _enum(getattr(DB, enum_name, None), val)
        if e is None:
            notes.append(u'PDF %s "%s" not available - Revit default used' % (prop, val))
        else:
            _set(opts, prop, e, notes)
    if ps['placement'] != 'Center':
        _set(opts, 'OriginOffsetX', float(ps.get('offset_x') or 0))
        _set(opts, 'OriginOffsetY', float(ps.get('offset_y') or 0))
    if ps['zoom'] == 'Zoom':
        _set(opts, 'ZoomPercentage', int(ps.get('zoom_pct') or 100))
    _set(opts, 'AlwaysUseRaster', ps.get('processing') == 'Raster')
    for key, prop in PDF_BOOLS:
        _set(opts, prop, bool(ps.get(key)))


def pdf_options(doc, settings, notes):
    """The model's own setup when it has the chosen one; otherwise the same values from the window."""
    ps = pdf_settings(settings)
    if ps.get('setup'):
        for s in FilteredElementCollector(doc).OfClass(ExportPDFSettings):
            if s.Name == ps['setup']:
                opts = s.GetOptions()
                opts.Combine = True
                return opts
        notes.append(u"PDF setup '%s' not in this model - its values from the window were used" % ps['setup'])
    opts = PDFExportOptions()
    _apply_pdf(opts, ps, notes)
    opts.Combine = True
    return opts


def dwg_options(doc, settings, notes):
    ds = dwg_settings(settings)
    if ds.get('setup'):
        opts = DWGExportOptions.GetPredefinedOptions(doc, ds['setup'])
        if opts is not None:
            return opts
        notes.append(u"DWG setup '%s' not in this model - its values from the window were used" % ds['setup'])
    opts = DWGExportOptions()
    v = _enum(DB.ACADVersion, 'R' + text(ds['version']))
    if v is not None:
        _set(opts, 'FileVersion', v, notes)
    _set(opts, 'LayerMapping', ds['layers'], notes)
    _set(opts, 'MergedViews', bool(ds['merged_views']))
    _set(opts, 'SharedCoords', bool(ds['shared_coords']))
    c = _enum(getattr(DB, 'ExportColorMode', None), ds.get('colors') or 'IndexColors')
    if c is not None:
        _set(opts, 'Colors', c, notes)
    return opts


def model_folder(out_root, model, settings):
    return os.path.join(out_root, clean(model)) if settings.get('per_model_folder', True) else out_root


def export_model(doc, lod_rows, out_root, settings, do_export, log, picked=None, progress=None):
    """Export: picked sheet numbers (set, lower case), else LOD sheets found in this
    model, else all sheets (lod_rows None).
    Returns (matched listed numbers, counts, model notes, dwg_raw_folder)."""
    model = model_name(doc)
    mode = u'EXPORT' if do_export else u'DRYRUN'
    notes = []
    sheets = {}
    for s in FilteredElementCollector(doc).OfClass(ViewSheet):
        if not s.IsPlaceholder:
            sheets.setdefault(s.SheetNumber.strip().lower(), s)

    jobs = []                       # (row, sheet)
    if picked is not None:
        fmts = settings.get('_formats') or {}
        cur = (settings.get('_current_guid') or model_guid(doc) or u'').lower()
        for k in sorted(picked):
            if k in sheets:
                row = dict(fmts)
                row.update((settings.get('_row_formats') or {}).get(u'%s|%s' % (cur, k)) or {})   # Quick Print list
                row['_listed'] = sheets[k].SheetNumber
                jobs.append((row, sheets[k]))
    elif lod_rows is None:
        for s in sorted(sheets.values(), key=lambda x: x.SheetNumber):
            jobs.append(({'_listed': s.SheetNumber}, s))
    else:
        for row in lod_rows:
            for c in lod_candidates(row):
                if c in sheets:
                    jobs.append((row, sheets[c]))
                    break

    mdir = model_folder(out_root, model, settings)
    pdf_dir = os.path.join(mdir, 'PDF')
    raw_dir = os.path.join(mdir, '_DWG_raw')
    counts = {'ok': 0, 'failed': 0, 'would': 0, 'blocked': 0}
    if not jobs:
        return set(), counts, notes, raw_dir

    pdf_opts = dwg_opts = None
    if do_export:
        ensure_dir(pdf_dir)
        ensure_dir(raw_dir)
        pdf_opts = pdf_options(doc, settings, notes)
        dwg_opts = dwg_options(doc, settings, notes)

    matched = set()
    stopped = False
    # ---- 1) decide every file name first (live revision) and block anything that does not match the sheet
    plan = []
    for job_i, (row, sheet) in enumerate(jobs):
        listed = row['_listed']
        matched.add(listed.lower())
        note = []
        lname = row.get('sheetname', u'')
        if lname and lname.strip().lower() != sheet.Name.strip().lower():
            note.append(u"Name differs from LOD: '%s'" % lname)
        rev = sheet_revision(sheet)
        lrev = list_revision(row)
        if lrev and rev and lrev.strip().lower() != rev.strip().lower():
            note.append(u'Revision differs: LOD %s, Revit %s' % (lrev, rev))
        elif lrev and not rev:
            note.append(u'LOD has revision %s, Revit sheet has none' % lrev)
        block = None
        fixed = fixed_name(settings, settings.get('_current_guid') or model_guid(doc), sheet.SheetNumber)
        if fixed:                                 # Issue Sheets: MIDP code + the revision the sheet shows NOW
            name, fnote, block = resolve_fixed(fixed, sheet, rev)
            missing = []
            if fnote:
                note.append(fnote)
                notes.append(u'%s: %s' % (sheet.SheetNumber, fnote))     # shown in the report too
        else:
            name, missing = make_name(doc, sheet, settings.get('naming_rule') or u'{DrawingNumber}', row, model)
            if not rev and lrev:
                note.append(u'named WITHOUT a revision (the sheet has none in Revit)')
        if missing:
            note.append(u'Unknown token(s): ' + u', '.join(missing))
        if not name:
            name = clean(sheet.SheetNumber)
        guard = block or name_guard(sheet, name, rev)      # live check: file name vs what the sheet shows
        fmts = settings.get('_formats') or {}
        formats = []
        if yes(row.get('pdf') or fmts.get('pdf')) and yes(fmts.get('pdf')):
            formats.append(u'PDF')
        if yes(row.get('dwg') or fmts.get('dwg')) and yes(fmts.get('dwg')):
            formats.append(u'DWG')
        plan.append((job_i, row, sheet, listed, rev, name, note, guard, formats))

    # ---- 2) all PDFs of this model in ONE Revit export (same settings, much less overhead per drawing)
    batch = {}
    if do_export and settings.get('batch_pdf', True):
        todo = [p for p in plan if not p[7] and u'PDF' in p[8]]
        if len(todo) > 1:
            if progress:
                try:
                    progress(1, len(jobs), u'PDF', u'%d drawings in one go' % len(todo), None)
                except Exception:
                    pass
            batch = _batch_pdf(doc, [p[2] for p in todo], out_root, model, settings, notes)
    dbatch = {}
    if do_export and settings.get('batch_dwg', True):
        todo = [p for p in plan if not p[7] and u'DWG' in p[8]]
        if len(todo) > 1:
            if progress:
                try:
                    progress(1, len(jobs), u'DWG', u'%d drawings in one go' % len(todo), None)
                except Exception:
                    pass
            dbatch = _batch_dwg(doc, [p[2] for p in todo], raw_dir, dwg_opts, notes)

    # ---- 3) write the files
    for (job_i, row, sheet, listed, rev, name, note, guard, formats) in plan:
        if guard:
            counts['blocked'] = counts.get('blocked', 0) + 1
            counts['failed'] += 1
            notes.append(u'BLOCKED %s: %s - not exported' % (sheet.SheetNumber, guard))
            log.append([now(), mode, model, listed, sheet.Name, rev, u'', name, u'BLOCKED', u'',
                        u'; '.join(note + [guard])])
            if progress:
                try:
                    progress(job_i + 1, len(jobs), u'PDF', sheet.SheetNumber, u'FAILED')
                except Exception:
                    pass
            continue
        for fmt in formats:
            folder = pdf_dir if fmt == u'PDF' else raw_dir
            target = os.path.join(folder, name + u'.' + fmt.lower())
            if not do_export:
                counts['would'] += 1
                log.append([now(), mode, model, listed, sheet.Name, rev, fmt, target, u'WOULD_EXPORT', u'',
                            u'; '.join(note)])
                continue
            if progress:
                try:
                    if progress(job_i + 1, len(jobs), fmt, sheet.SheetNumber, None) is False:
                        stopped = True              # Cancel pressed: stop after the current file
                except Exception:
                    pass
            if stopped:
                break
            t0 = time.time()
            status, extra = u'FAILED', u''
            try:
                if os.path.exists(target):
                    os.remove(target)
                done_early = (batch if fmt == u'PDF' else dbatch).get(sheet.SheetNumber.strip().lower())
                if done_early and os.path.exists(done_early):
                    os.rename(done_early, target)          # made in the one-go export: just give it its name
                else:
                    ids = List[ElementId]([sheet.Id])
                    if fmt == u'PDF':
                        pdf_opts.FileName = name
                        doc.Export(folder, ids, pdf_opts)
                    else:
                        doc.Export(folder, name, ids, dwg_opts)
                if os.path.exists(target):
                    status = u'OK'
                else:
                    extra = u'Revit reported no file'
            except Exception as e:
                extra = text(e)
            counts['ok' if status == u'OK' else 'failed'] += 1
            log.append([now(), mode, model, listed, sheet.Name, rev, fmt, target, status,
                        u'%.1f' % (time.time() - t0), u'; '.join([n for n in note + [extra] if n])])
            if progress:
                try:
                    if progress(job_i + 1, len(jobs), fmt, sheet.SheetNumber, status) is False:
                        stopped = True
                except Exception:
                    pass
        if stopped:
            notes.append(u'Cancelled - remaining drawings of this model were not exported')
            break
    _batch_cleanup(out_root, model)
    return matched, counts, notes, raw_dir


def resolve_fixed(fixed, sheet, rev):
    """Issue Sheets names, finished at print time with the revision the sheet shows NOW.
    fixed: old style text, or {'base', 'mode': 'code'|'number', 'shown', 'expected', 'norev'}.
    Returns (name, note, block reason)."""
    if not isinstance(fixed, dict):
        return fixed, u'', None
    if fixed.get('mode') == 'number':
        return clean(sheet.SheetNumber), u'', None
    base, note = fixed.get('base') or u'', u''
    if fixed.get('conflict'):
        return base, u'', fixed['conflict']
    shown, exp = (fixed.get('shown') or u'').strip(), (fixed.get('expected') or u'').strip()
    if exp and (rev or u'').strip().lower() != exp.lower():
        return base, u'', u'the list expects %s, the sheet shows %s' % (exp, rev or u'no revision')
    if not rev:
        if not fixed.get('norev'):
            return base, u'', u'the sheet has no revision in Revit'
        name = base
    else:
        name = u'%s-%s' % (base, rev)
    if shown and rev and shown.lower() != rev.strip().lower():
        note = u'revision changed since Check: %s -> %s (named %s)' % (shown, rev, rev)
    if clean(name) != name:
        return name, note, u'characters not allowed in a file name: "%s"' % name
    return name, note, None


def _batch_dir(out_root, model):
    return os.path.join(logs_dir(out_root), u'_pdf_batch', clean(model))


def _batch_cleanup(out_root, model):
    d = _batch_dir(out_root, model)
    try:
        if os.path.isdir(d):
            for fn in os.listdir(d):
                try:
                    os.remove(os.path.join(d, fn))
                except Exception:
                    pass
            os.rmdir(d)
        parent = os.path.dirname(d)
        if os.path.isdir(parent) and not os.listdir(parent):
            os.rmdir(parent)
    except Exception:
        pass


def _batch_dwg(doc, sheets, raw_dir, opts, notes):
    """All DWGs of a model in ONE Revit export, straight into _DWG_raw (so logo images and xrefs stay where the
    DWG expects them). Revit names them <prefix>-...<sheet number>...; each sheet's main file is found and renamed
    later. Anything not found for sure is exported one by one. Returns {sheet number lower: file}."""
    prefix = u'_one%d' % int(time.time() * 10 % 100000000)
    try:
        before = set(os.listdir(raw_dir))
        doc.Export(raw_dir, prefix, List[ElementId]([s.Id for s in sheets]), opts)
    except Exception as e:
        notes.append(u'DWGs one by one (one-go export not possible: %s)' % text(e))
        return {}
    new = [f for f in os.listdir(raw_dir) if f not in before and f.lower().endswith(u'.dwg') and f.startswith(prefix)]
    out = {}
    for s in sheets:
        num = s.SheetNumber.strip()
        pat = re.compile(u'(^|[\\s_\\-])' + re.escape(num) + u'([\\s_\\-.]|$)', re.I)
        cands = sorted([f for f in new if pat.search(f[len(prefix):])], key=len)
        if cands and (len(cands) == 1 or len(cands[0]) < len(cands[1])):      # the sheet itself (xrefs are longer)
            out[num.lower()] = os.path.join(raw_dir, cands[0])
    if not out:                                      # nothing usable: remove what the one-go export made
        for f in os.listdir(raw_dir):
            if f not in before and f.startswith(prefix):
                try:
                    os.remove(os.path.join(raw_dir, f))
                except Exception:
                    pass
    if len(out) < len(sheets):
        notes.append(u'%d DWG(s) exported one by one (not found for sure in the one-go export)' % (len(sheets) - len(out)))
    return out


def _batch_pdf(doc, sheets, out_root, model, settings, notes):
    """Export many sheets as separate PDFs in ONE call, named by sheet number in a work folder.
    Returns {sheet number lower: file}. Anything missing is simply exported one by one afterwards."""
    d = _batch_dir(out_root, model)
    _batch_cleanup(out_root, model)
    ensure_dir(d)
    try:
        opts = pdf_options(doc, settings, [])
        opts.Combine = False
        rule = DB.TableCellCombinedParameterData.Create()
        rule.ParamId = ElementId(BuiltInParameter.SHEET_NUMBER)
        rule.CategoryId = ElementId(DB.BuiltInCategory.OST_Sheets)
        try:
            rule.Prefix, rule.Suffix, rule.Separator = u'', u'', u''
        except Exception:
            pass
        opts.SetNamingRule(List[DB.TableCellCombinedParameterData]([rule]))
        doc.Export(d, List[ElementId]([s.Id for s in sheets]), opts)
    except Exception as e:
        notes.append(u'PDFs one by one (one-go export not possible: %s)' % text(e))
        return {}
    want = dict((clean(s.SheetNumber).strip().lower(), s.SheetNumber.strip().lower()) for s in sheets)
    out = {}
    for fn in os.listdir(d):
        stem, ext = os.path.splitext(fn)
        if ext.lower() == u'.pdf' and stem.strip().lower() in want:
            out[want[stem.strip().lower()]] = os.path.join(d, fn)
    if len(out) < len(sheets):
        notes.append(u'%d PDF(s) printed one by one (not found in the one-go export)' % (len(sheets) - len(out)))
    return out


# ------------------------------------------------- shared queue (N windows) --
QUEUE_POINTER = os.path.join(SETTINGS_DIR, 'active_queue.txt')


def _pid():
    try:
        return os.getpid()
    except Exception:
        import System
        return System.Diagnostics.Process.GetCurrentProcess().Id


def queue_create(out_root, job, guids, first=None):
    """One file per model in <out_root>\\_queue. Claiming = renaming the file (atomic)."""
    qd = os.path.join(logs_dir(out_root), '_queue')
    ensure_dir(qd)
    for fn in os.listdir(qd):
        try:
            os.remove(os.path.join(qd, fn))
        except Exception:
            pass
    with io.open(os.path.join(qd, 'job.json'), 'w', encoding='utf-8') as f:
        f.write(text(json.dumps(job, indent=1)))
    for g in guids:
        io.open(os.path.join(qd, g + '.todo'), 'w').close()
    if job.get('run_cad'):
        io.open(os.path.join(qd, 'logos.pending'), 'w').close()
    ensure_dir(SETTINGS_DIR)
    with io.open(QUEUE_POINTER, 'w', encoding='utf-8') as f:
        f.write(text(qd))
    return qd


def _alive(pid):
    try:
        import System
        System.Diagnostics.Process.GetProcessById(int(pid))
        return True
    except Exception:
        return False


HELPERS_FILE = os.path.join(SETTINGS_DIR, 'helpers.json')


def launch_helpers(qd, kind, n, revit_exe):
    """Start n extra Revit windows; each joins the shared run 'qd' by itself (one helper slot each) and closes
    when no model is left. Returns how many were started."""
    n = max(0, int(n or 0))
    if not n:
        return 0
    for k in range(1, n + 1):
        io.open(os.path.join(qd, 'helper_%d.slot' % k), 'w').close()      # NOT a model ticket (no .todo / .taken_)
    with io.open(HELPERS_FILE, 'w', encoding='utf-8') as f:
        f.write(text(json.dumps({'queue': qd, 'kind': kind, 't': time.time(), 'n': n})))
    started = 0
    import subprocess
    for k in range(n):
        try:
            subprocess.Popen([revit_exe or 'Revit.exe', '/nosplash'])
            started += 1
        except Exception:
            pass
    return started


def take_helper_slot(process_started):
    """A Revit started for a shared run takes one helper slot. Returns (queue folder, kind) or None."""
    try:
        with io.open(HELPERS_FILE, 'r', encoding='utf-8') as f:
            h = json.loads(f.read())
    except Exception:
        return None
    t = float(h.get('t') or 0)
    if time.time() - t > 1200 or (process_started and process_started < t - 30):
        return None                                   # old request, or a Revit that was already running
    qd = h.get('queue') or u''
    if not os.path.isdir(qd) or queue_stopped(qd) or queue_finished(qd):
        return None
    for fn in sorted(os.listdir(qd)):
        if fn.startswith('helper_') and fn.endswith('.slot'):
            try:
                os.rename(os.path.join(qd, fn), os.path.join(qd, '%s_used_%s' % (fn, _pid())))
                return qd, h.get('kind') or u'issue'
            except Exception:
                continue
    return None


def queue_info(qd):
    """{'left': models nobody started, 'working': Revit windows printing now, 'orphans': models a closed
    window had started (e.g. Revit closed during sleep), 'started': when the run began}"""
    info = {'left': 0, 'working': set(), 'orphans': 0, 'started': u''}
    try:
        for fn in os.listdir(qd):
            if fn.endswith('.todo'):
                info['left'] += 1
            elif '.taken_' in fn:
                pid = fn.split('.taken_')[-1]
                if _alive(pid):
                    info['working'].add(pid)
                else:
                    info['orphans'] += 1
        info['started'] = datetime.datetime.fromtimestamp(
            os.path.getmtime(os.path.join(qd, 'job.json'))).strftime('%d/%m %H:%M')
    except Exception:
        pass
    return info


def queue_reclaim(qd):
    """Models started by a window that no longer exists go back to the queue."""
    try:
        for fn in os.listdir(qd):
            if '.taken_' in fn and not _alive(fn.split('.taken_')[-1]):
                try:
                    os.rename(os.path.join(qd, fn), os.path.join(qd, fn.split('.taken_')[0] + '.todo'))
                except Exception:
                    pass
    except Exception:
        pass


def queue_stop(qd):
    """Kill switch: nobody starts another model; windows still printing stop after their current file;
    the logo helper stops after its current AutoCAD batch."""
    try:
        for fn in os.listdir(qd):
            if fn.endswith('.todo'):
                try:
                    os.rename(os.path.join(qd, fn), os.path.join(qd, fn[:-5] + '.stopped'))
                except Exception:
                    pass
        io.open(os.path.join(qd, 'stop'), 'w').close()
        out_root = os.path.dirname(os.path.dirname(qd))          # <out>\_Logs\_queue
        for n in ('IMG2OLE_queue.stop', 'IMG2OLE_queue.done'):
            io.open(os.path.join(logs_dir(out_root), n), 'w').close()
    except Exception:
        pass
    try:
        with io.open(QUEUE_POINTER, 'r', encoding='utf-8') as f:
            same = f.read().strip() == qd
        if same:
            os.remove(QUEUE_POINTER)
    except Exception:
        pass


def queue_stopped(qd):
    return bool(qd) and os.path.exists(os.path.join(qd, 'stop'))


def queue_active():
    """(queue folder, job, models left) of a running shared export, or None."""
    try:
        with io.open(QUEUE_POINTER, 'r', encoding='utf-8') as f:
            qd = f.read().strip()
        if queue_stopped(qd):
            return None
        queue_reclaim(qd)                             # e.g. a Revit closed while the PC was asleep
        left = [x for x in os.listdir(qd) if x.endswith('.todo') or '.taken_' in x]
        if not left:
            return None
        with io.open(os.path.join(qd, 'job.json'), 'r', encoding='utf-8') as f:
            return qd, json.loads(f.read()), len(left)
    except Exception:
        return None


def queue_claim(qd, prefer=()):
    """Take the next model nobody has started. Returns its GUID or None."""
    try:
        todo = [x[:-5] for x in os.listdir(qd) if x.endswith('.todo')]
    except Exception:
        return None
    todo.sort(key=lambda g: (g not in prefer, g))
    for g in todo:
        try:
            os.rename(os.path.join(qd, g + '.todo'), os.path.join(qd, '%s.taken_%s' % (g, _pid())))
            return g
        except Exception:
            continue                      # another window was faster
    return None


def queue_done(qd, guid):
    for fn in os.listdir(qd):
        if fn.startswith(guid + '.taken_'):
            try:
                os.rename(os.path.join(qd, fn), os.path.join(qd, guid + '.done'))
            except Exception:
                pass


def queue_release(qd, guid):
    """Give a model back (e.g. this window was cancelled before starting it)."""
    for fn in os.listdir(qd):
        if fn.startswith(guid + '.taken_'):
            try:
                os.rename(os.path.join(qd, fn), os.path.join(qd, guid + '.todo'))
            except Exception:
                pass


def queue_finished(qd):
    try:
        return not any(x.endswith('.todo') or '.taken_' in x for x in os.listdir(qd))
    except Exception:
        return False


def queue_claim_logos(qd):
    """Only one window starts AutoCAD."""
    try:
        os.rename(os.path.join(qd, 'logos.pending'), os.path.join(qd, 'logos.started'))
        return True
    except Exception:
        return False


# --------------------------------------------------------------- AutoCAD --
def write_ansi(path, body):
    """AutoCAD reads scripts and LISP text files as ANSI (Windows code page)."""
    for enc in ('mbcs', 'cp1252', 'utf-8'):
        try:
            with io.open(path, 'w', encoding=enc) as f:
                f.write(body)
            return
        except (LookupError, UnicodeEncodeError):
            continue


BUNDLED_IMG2OLE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'img2ole', 'IMG2OLE.lsp')


def img2ole_path(settings):
    """IMG2OLE.lsp: the one set in the settings, else the copy that ships inside this extension."""
    p = settings.get('img2ole_lsp') or u''
    if p and os.path.exists(p):
        return p
    if os.path.exists(BUNDLED_IMG2OLE):
        return BUNDLED_IMG2OLE
    return None


def _norm_dir(p):
    return os.path.normcase(os.path.normpath(p.replace(u'\\...', u'').strip()))


def acad_profiles():
    """Every AutoCAD profile of this Windows user: [(Variables key path, TRUSTEDPATHS value)].
    A profile counts even when its 'Variables' key does not exist yet (it is created when writing)."""
    out = []
    try:
        from Microsoft.Win32 import Registry
    except Exception:
        return out
    base = r'Software\Autodesk\AutoCAD'
    root = Registry.CurrentUser.OpenSubKey(base)
    if root is None:
        return out
    for ver in root.GetSubKeyNames():                 # R25.0 ...
        try:
            vk = root.OpenSubKey(ver)
            prods = vk.GetSubKeyNames() if vk else []
        except Exception:
            continue
        for prod in prods:                            # ACAD-8101:409 ...
            try:
                pk = vk.OpenSubKey(prod + r'\Profiles')
                profs = pk.GetSubKeyNames() if pk else []
            except Exception:
                continue
            for prof in profs:                        # <<Unnamed Profile>> ...
                path = r'%s\%s\%s\Profiles\%s\Variables' % (base, ver, prod, prof)
                cur = u''
                try:
                    k = Registry.CurrentUser.OpenSubKey(path)
                    if k is not None:
                        cur = text(k.GetValue('TRUSTEDPATHS') or u'')
                except Exception:
                    pass
                out.append((path, cur))
    return out


def acad_versions_found():
    """What exists under HKCU\\Software\\Autodesk\\AutoCAD (for messages)."""
    try:
        from Microsoft.Win32 import Registry
        root = Registry.CurrentUser.OpenSubKey(r'Software\Autodesk\AutoCAD')
        return list(root.GetSubKeyNames()) if root else []
    except Exception:
        return []


def acad_trusted_missing(folder):
    """(all profiles, profiles that do NOT trust folder yet)."""
    want = _norm_dir(folder)
    profiles = acad_profiles()
    missing = [(p, v) for p, v in profiles if want not in [_norm_dir(x) for x in v.split(u';') if x.strip()]]
    return profiles, missing


def acad_add_trusted(folder):
    """Add folder to Trusted Locations in every AutoCAD profile (AutoCAD must be closed)."""
    from Microsoft.Win32 import Registry
    done = 0
    for path, cur in acad_trusted_missing(folder)[1]:
        try:
            k = Registry.CurrentUser.CreateSubKey(path)          # creates 'Variables' if missing
            k.SetValue('TRUSTEDPATHS', (cur.rstrip(u';') + u';' if cur.strip() else u'') + folder)
            done += 1
        except Exception:
            pass
    return done


def acad_running():
    try:
        import System
        return len(System.Diagnostics.Process.GetProcessesByName('acad')) > 0
    except Exception:
        return False


def find_acad(settings):
    p = settings.get('acad_exe') or u''
    if p and os.path.exists(p):
        return p
    base = r'C:\Program Files\Autodesk'
    if os.path.isdir(base):
        for d in sorted(os.listdir(base), reverse=True):
            if d.lower().startswith('autocad'):
                exe = os.path.join(base, d, 'acad.exe')
                if os.path.exists(exe):
                    return exe
    return None


def find_raw_dwgs(out_root):
    """(raw dwg, final DWG folder) for every <model>/_DWG_raw/*.dwg under out_root."""
    jobs = []
    if not os.path.isdir(out_root):
        return jobs
    top = os.path.join(out_root, '_DWG_raw')             # "one folder per model" switched off
    if os.path.isdir(top):
        for f in sorted(os.listdir(top)):
            if f.lower().endswith('.dwg'):
                jobs.append((os.path.join(top, f), os.path.join(out_root, 'DWG')))
    for m in sorted(os.listdir(out_root)):
        raw = os.path.join(out_root, m, '_DWG_raw')
        if os.path.isdir(raw):
            for f in sorted(os.listdir(raw)):
                if f.lower().endswith('.dwg'):
                    jobs.append((os.path.join(raw, f), os.path.join(out_root, m, 'DWG')))
    return jobs


def img2ole_summary(out_root):
    """Latest IMG2OLE result per drawing from IMG2OLE_files.csv: (counts by result, problem lines)."""
    path = os.path.join(logs_dir(out_root), 'IMG2OLE_files.csv')
    if not os.path.exists(path) and os.path.exists(os.path.join(out_root, 'IMG2OLE_files.csv')):
        path = os.path.join(out_root, 'IMG2OLE_files.csv')          # older runs (before _Logs)
    if not os.path.exists(path):
        return None, []
    latest = {}
    for r in read_csv(path):
        if r.get('Mode') == 'RUN':
            latest[r.get('File', u'')] = r
    counts, problems = {}, []
    for f, r in sorted(latest.items()):
        res = r.get('Result', u'?')
        counts[res] = counts.get(res, 0) + 1
        if res not in (u'OK', u'NO_IMAGES'):
            problems.append(u'%s: %s (replaced %s, skipped %s, failed %s) %s' % (
                os.path.basename(f), res, r.get('Replaced'), r.get('Skipped'), r.get('Failed'), r.get('Message', u'')))
    return counts, problems


def start_img2ole(jobs, out_root, settings):
    """jobs: list of (raw dwg file, final DWG folder). Starts AutoCAD, returns a message."""
    lsp = img2ole_path(settings)
    if not lsp:
        return u'IMG2OLE.lsp not found - logos NOT embedded. Reinstall the BIMExport extension (it has an img2ole folder).'
    acad = find_acad(settings)
    if not acad:
        return u'AutoCAD not found - logos NOT embedded. Set acad_exe in settings.'
    ld = logs_dir(out_root)
    jobs_file = os.path.join(ld, u'IMG2OLE_jobs.txt')
    write_ansi(jobs_file, u''.join(u'%s|%s\n' % (src, dst if dst.endswith('\\') else dst + u'\\')
                                   for src, dst in jobs))
    starter = os.path.join(ld, u'IMG2OLE_start.scr')
    fwd = lambda p: p.replace(u'\\', u'/')
    body = (u'(setenv "IMG2OLE_HOME" "%s")\n' % os.path.dirname(lsp).replace(u'\\', u'\\\\') +
            u'(load "%s")\n' % fwd(lsp) +
            u'(i2o:batch-file "%s" "RUN" "EMF" "%s/")\n' % (fwd(jobs_file), fwd(ld).rstrip(u'/')))
    write_ansi(starter, body)
    import System
    System.Diagnostics.Process.Start(acad, u'/nologo /b "%s"' % starter)
    return u'AutoCAD started to embed logos in %d DWG(s). Leave it until it says "IMG2OLE finished".' % len(jobs)


# ------------------------------------------- logos WHILE Revit exports --
def _ansi_append(path, text_):
    for enc in ('mbcs', 'cp1252', 'utf-8'):
        try:
            with io.open(path, 'a', encoding=enc) as f:
                f.write(text_)
            return
        except (LookupError, UnicodeEncodeError):
            continue


def logo_pipeline_reset(out_root):
    """Start a fresh queue in this output folder (old queue files removed)."""
    for n in ('IMG2OLE_queue.txt', 'IMG2OLE_queue.pos', 'IMG2OLE_queue.done', 'IMG2OLE_queue.stop'):
        try:
            os.remove(os.path.join(logs_dir(out_root), n))
        except Exception:
            pass


def logo_queue_add(out_root, jobs):
    """jobs: [(raw dwg, final DWG folder)] -> appended for the background helper."""
    if jobs:
        _ansi_append(os.path.join(logs_dir(out_root), u'IMG2OLE_queue.txt'),
                     u''.join(u'%s|%s\n' % (a, b if b.endswith('\\') else b + u'\\') for a, b in jobs))


def logo_queue_done(out_root):
    with io.open(os.path.join(logs_dir(out_root), u'IMG2OLE_queue.done'), 'w', encoding='utf-8') as f:
        f.write(now())


def logo_runner_start(out_root, settings):
    """Start the background helper (one per output folder). Returns (started, message)."""
    lsp = img2ole_path(settings)
    acad = find_acad(settings)
    if not lsp or not acad:
        return False, u'IMG2OLE or AutoCAD not found'
    ps1 = os.path.join(os.path.dirname(lsp), u'IMG2OLE_runner.ps1')
    if not os.path.exists(ps1):
        return False, u'IMG2OLE_runner.ps1 missing'
    try:
        import System
        psi = System.Diagnostics.ProcessStartInfo('powershell.exe')
        psi.Arguments = (u'-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "%s" '
                         u'-Folder "%s" -Acad "%s" -Lsp "%s"' % (ps1, logs_dir(out_root).rstrip(u'\\'), acad, lsp))
        psi.UseShellExecute = False
        psi.CreateNoWindow = True
        System.Diagnostics.Process.Start(psi)
        return True, u'Logo helper started: AutoCAD embeds logos while Revit exports'
    except Exception as e:
        return False, text(e)
