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
    'img2ole_lsp': r'C:\BIMTools\img2ole\IMG2OLE.lsp',
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
    new = not os.path.exists(path)
    with io.open(path, 'a', encoding='utf-8-sig' if new else 'utf-8') as f:
        if new:
            f.write(csv_line(header) + u'\n')
        for r in rows:
            f.write(csv_line(r) + u'\n')


def usable_log_path(path):
    """The log path, or a new dated one if the file is locked (e.g. open in Excel)."""
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


def open_cloud_model(app, rec, preferred_region):
    """Open a cloud model. Workshared: detached + all worksets.
    Not workshared (no central model): opened normally, closed without saving.
    Returns (doc, region, note-or-error)."""
    errors = []
    for reg in _regions(rec.get('Region') or preferred_region):
        try:
            path = ModelPathUtils.ConvertCloudGUIDsToCloudPath(
                reg, Guid(rec['ProjectGUID']), Guid(rec['ModelGUID']))
        except Exception as e:
            errors.append(u'%s: %s' % (reg, text(e)))
            continue
        # 1) workshared model: detached, all worksets
        try:
            opts = OpenOptions()
            opts.DetachFromCentralOption = DetachFromCentralOption.DetachAndPreserveWorksets
            opts.SetOpenWorksetsConfiguration(WorksetConfiguration(WorksetConfigurationOption.OpenAllWorksets))
            return _open(app, path, opts), reg, None
        except Exception as e:
            msg = text(e)
        low = msg.lower()
        if 'central' in low or 'workshar' in low:
            # 2) not workshared: there is no central model to detach from
            try:
                return _open(app, path, OpenOptions()), reg, \
                    u'Model is not workshared - opened directly (closed without saving)'
            except Exception as e2:
                msg = text(e2)
        errors.append(u'%s: %s' % (reg, msg))
    return None, None, u' | '.join(errors)


def check_links(doc):
    notes = []
    for lt in FilteredElementCollector(doc).OfClass(RevitLinkType):
        try:
            if not RevitLinkType.IsLoaded(doc, lt.Id):
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


def make_name(doc, sheet, rule, row, model):
    vals = {
        'sheetnumber': sheet.SheetNumber, 'sheetname': sheet.Name,
        'revision': sheet_revision(sheet), 'model': model,
        'date': datetime.date.today().strftime('%Y%m%d'),
        'drawingnumber': row.get('drawingnumber') or sheet.SheetNumber,
        'listrevision': list_revision(row),
    }
    missing = []

    def rep(m):
        token = m.group(1).strip()
        k = key(token)
        if k in vals:
            return vals[k] or u''
        low = token.lower()
        if low.startswith('p:'):
            v = _param(sheet, token[2:].strip())
        elif low.startswith('project:'):
            v = _param(doc.ProjectInformation, token[8:].strip())
        else:
            v = None
        if v is None:
            missing.append(token)
            return u''
        return v

    return clean(re.sub(r'\{([^}]+)\}', rep, rule)), missing


def pdf_options(doc, setup, notes):
    opts = None
    if setup:
        for s in FilteredElementCollector(doc).OfClass(ExportPDFSettings):
            if s.Name == setup:
                opts = s.GetOptions()
                break
        if opts is None:
            notes.append(u"PDF setup '%s' not found in this model - Revit defaults used" % setup)
    if opts is None:
        opts = PDFExportOptions()
        for prop in ('HideCropBoundaries', 'HideScopeBoxes', 'HideReferencePlane', 'HideUnreferencedViewTags'):
            try:
                setattr(opts, prop, True)
            except Exception:
                pass
    opts.Combine = True
    return opts


def dwg_options(doc, setup, notes):
    opts = None
    if setup:
        opts = DWGExportOptions.GetPredefinedOptions(doc, setup)
        if opts is None:
            notes.append(u"DWG setup '%s' not found in this model - Revit defaults used" % setup)
    if opts is None:
        opts = DWGExportOptions()
    opts.MergedViews = True
    try:
        opts.FileVersion = DB.ACADVersion.R2018
    except Exception:
        pass
    return opts


def export_model(doc, lod_rows, out_root, settings, do_export, log):
    """Export the LOD sheets found in this model (or all sheets when lod_rows is None).
    Returns (matched listed numbers, counts, model notes, dwg_raw_folder)."""
    model = model_name(doc)
    mode = u'EXPORT' if do_export else u'DRYRUN'
    notes = []
    sheets = {}
    for s in FilteredElementCollector(doc).OfClass(ViewSheet):
        if not s.IsPlaceholder:
            sheets.setdefault(s.SheetNumber.strip().lower(), s)

    jobs = []                       # (row, sheet)
    if lod_rows is None:
        for s in sorted(sheets.values(), key=lambda x: x.SheetNumber):
            jobs.append(({'_listed': s.SheetNumber}, s))
    else:
        for row in lod_rows:
            for c in lod_candidates(row):
                if c in sheets:
                    jobs.append((row, sheets[c]))
                    break

    mdir = os.path.join(out_root, clean(model))
    pdf_dir = os.path.join(mdir, 'PDF')
    raw_dir = os.path.join(mdir, '_DWG_raw')
    counts = {'ok': 0, 'failed': 0, 'would': 0}
    if not jobs:
        return set(), counts, notes, raw_dir

    pdf_opts = dwg_opts = None
    if do_export:
        ensure_dir(pdf_dir)
        ensure_dir(raw_dir)
        pdf_opts = pdf_options(doc, settings.get('pdf_setup'), notes)
        dwg_opts = dwg_options(doc, settings.get('dwg_setup'), notes)

    matched = set()
    for row, sheet in jobs:
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
        name, missing = make_name(doc, sheet, settings.get('naming_rule') or u'{DrawingNumber}', row, model)
        if missing:
            note.append(u'Unknown token(s): ' + u', '.join(missing))
        if not name:
            name = clean(sheet.SheetNumber)

        formats = []
        if yes(row.get('pdf')):
            formats.append(u'PDF')
        if yes(row.get('dwg')):
            formats.append(u'DWG')

        for fmt in formats:
            folder = pdf_dir if fmt == u'PDF' else raw_dir
            target = os.path.join(folder, name + u'.' + fmt.lower())
            if not do_export:
                counts['would'] += 1
                log.append([now(), mode, model, listed, sheet.Name, rev, fmt, target, u'WOULD_EXPORT', u'',
                            u'; '.join(note)])
                continue
            t0 = time.time()
            status, extra = u'FAILED', u''
            try:
                if os.path.exists(target):
                    os.remove(target)
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
    return matched, counts, notes, raw_dir


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


def start_img2ole(jobs, out_root, settings):
    """jobs: list of (raw dwg file, final DWG folder). Starts AutoCAD, returns a message."""
    lsp = settings.get('img2ole_lsp') or u''
    if not os.path.exists(lsp):
        return u'IMG2OLE.lsp not found (%s) - logos NOT embedded. Run IMG2OLE in AutoCAD yourself.' % lsp
    acad = find_acad(settings)
    if not acad:
        return u'AutoCAD not found - logos NOT embedded. Set acad_exe in settings.'
    jobs_file = os.path.join(out_root, u'IMG2OLE_jobs.txt')
    write_ansi(jobs_file, u''.join(u'%s|%s\n' % (src, dst if dst.endswith('\\') else dst + u'\\')
                                   for src, dst in jobs))
    starter = os.path.join(out_root, u'IMG2OLE_start.scr')
    fwd = lambda p: p.replace(u'\\', u'/')
    body = (u'(setenv "IMG2OLE_HOME" "%s")\n' % os.path.dirname(lsp).replace(u'\\', u'\\\\') +
            u'(load "%s")\n' % fwd(lsp) +
            u'(i2o:batch-file "%s" "RUN" "EMF" "%s/")\n' % (fwd(jobs_file), fwd(out_root).rstrip(u'/')))
    write_ansi(starter, body)
    import System
    System.Diagnostics.Process.Start(acad, u'/nologo /b "%s"' % starter)
    return u'AutoCAD started to embed logos in %d DWG(s). Leave it until it says "IMG2OLE finished".' % len(jobs)
