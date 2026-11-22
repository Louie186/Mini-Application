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
        if 'detach' in low or 'workshar' in low or ('central' in low and 'missing' not in low):
            # 2) not workshared: there is no central model to detach from
            try:
                return _open(app, path, OpenOptions()), reg, \
                    u'Model is not workshared - opened directly (closed without saving)'
            except Exception as e2:
                msg = text(e2)
        if 'central model is missing' in low:
            msg = u'not found in this region'
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


def make_name(doc, sheet, rule, row, model):
    vals = {
        'sheetnumber': sheet.SheetNumber, 'sheetname': sheet.Name,
        'revision': sheet_revision(sheet), 'model': model,
        'date': datetime.date.today().strftime('%Y%m%d'),
        'drawingnumber': row.get('drawingnumber') or sheet.SheetNumber,
        'listrevision': list_revision(row),
    }
    return build_name(rule, vals, lambda n: _param(sheet, n),
                      lambda n: _param(doc.ProjectInformation, n))


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
    return {'model': model_name(doc), 'updated': now(), 'rule': rule, 'sheets': sheets, 'project': project,
            'orgs': orgs, 'current_org': current}


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


PDF_DEFAULTS = {'setup': '', 'colors': 'Color', 'raster_quality': 'High', 'always_raster': False,
                'hide_crop': True, 'hide_scope': True, 'hide_ref_planes': True, 'hide_unref_tags': True}
DWG_DEFAULTS = {'setup': '', 'version': '2018', 'layers': 'AIA', 'merged_views': True, 'shared_coords': False}
PDF_COLORS = {'Color': 'Color', 'Grayscale': 'GrayScale', 'Black lines': 'BlackLine'}
DWG_LAYERS = ['AIA', 'ISO13567', 'CP83', 'BS1192']


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


def pdf_settings(settings):
    ps = dict(PDF_DEFAULTS)
    ps.update(settings.get('pdf') or {})
    if not ps.get('setup') and settings.get('pdf_setup'):
        ps['setup'] = settings['pdf_setup']
    return ps


def dwg_settings(settings):
    ds = dict(DWG_DEFAULTS)
    ds.update(settings.get('dwg') or {})
    if not ds.get('setup') and settings.get('dwg_setup'):
        ds['setup'] = settings['dwg_setup']
    return ds


def pdf_options(doc, settings, notes):
    ps = pdf_settings(settings)
    if ps.get('setup'):
        for s in FilteredElementCollector(doc).OfClass(ExportPDFSettings):
            if s.Name == ps['setup']:
                opts = s.GetOptions()
                opts.Combine = True
                return opts
        notes.append(u"PDF setup '%s' not found in this model - tool settings used" % ps['setup'])
    opts = PDFExportOptions()
    cd = _enum(getattr(DB, 'ColorDepthType', None), PDF_COLORS.get(ps['colors'], 'Color'))
    if cd is not None:
        _set(opts, 'ColorDepth', cd, notes)
    rq = _enum(getattr(DB, 'RasterQualityType', None), ps['raster_quality'])
    if rq is not None:
        _set(opts, 'RasterQuality', rq, notes)
    _set(opts, 'AlwaysUseRaster', bool(ps['always_raster']))
    _set(opts, 'HideCropBoundaries', bool(ps['hide_crop']))
    _set(opts, 'HideScopeBoxes', bool(ps['hide_scope']))
    _set(opts, 'HideReferencePlane', bool(ps['hide_ref_planes']))
    _set(opts, 'HideUnreferencedViewTags', bool(ps['hide_unref_tags']))
    opts.Combine = True
    return opts


def dwg_options(doc, settings, notes):
    ds = dwg_settings(settings)
    if ds.get('setup'):
        opts = DWGExportOptions.GetPredefinedOptions(doc, ds['setup'])
        if opts is not None:
            return opts
        notes.append(u"DWG setup '%s' not found in this model - tool settings used" % ds['setup'])
    opts = DWGExportOptions()
    v = _enum(DB.ACADVersion, 'R' + text(ds['version']))
    if v is not None:
        _set(opts, 'FileVersion', v, notes)
    _set(opts, 'LayerMapping', ds['layers'], notes)
    _set(opts, 'MergedViews', bool(ds['merged_views']))
    _set(opts, 'SharedCoords', bool(ds['shared_coords']))
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
        for k in sorted(picked):
            if k in sheets:
                row = dict(fmts)
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
    counts = {'ok': 0, 'failed': 0, 'would': 0}
    if not jobs:
        return set(), counts, notes, raw_dir

    pdf_opts = dwg_opts = None
    if do_export:
        ensure_dir(pdf_dir)
        ensure_dir(raw_dir)
        pdf_opts = pdf_options(doc, settings, notes)
        dwg_opts = dwg_options(doc, settings, notes)

    matched = set()
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
        name, missing = make_name(doc, sheet, settings.get('naming_rule') or u'{DrawingNumber}', row, model)
        if missing:
            note.append(u'Unknown token(s): ' + u', '.join(missing))
        if not name:
            name = clean(sheet.SheetNumber)

        fmts = settings.get('_formats') or {}
        formats = []
        if yes(row.get('pdf') or fmts.get('pdf')) and yes(fmts.get('pdf')):
            formats.append(u'PDF')
        if yes(row.get('dwg') or fmts.get('dwg')) and yes(fmts.get('dwg')):
            formats.append(u'DWG')

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
                    progress(job_i + 1, len(jobs), fmt, sheet.SheetNumber)
                except Exception:
                    pass
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
    qd = os.path.join(out_root, '_queue')
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


def queue_active():
    """(queue folder, job, models left) of a running shared export, or None."""
    try:
        with io.open(QUEUE_POINTER, 'r', encoding='utf-8') as f:
            qd = f.read().strip()
        left = [x for x in os.listdir(qd) if x.endswith('.todo')]
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
    path = os.path.join(out_root, 'IMG2OLE_files.csv')
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
