# -*- coding: utf-8 -*-
"""
bimissue_core - logic for the "Issue Sheets" button (no UI here).

- read_issue_data(doc):   model sync stamp, revisions, revisions on each sheet, title block Yes/No params
- file names:             MIDP/LOD drawing code (without its revision) + Revit's current revision. Exact or blocked
- issue register (CSV):   one row per print, grouped by drawing, newest print under the older ones
- change check:           model synced since the last issue? revision changed?
- apply / revert:         ONLY revisions (add, edit date/description, tick on sheets) and Yes/No title block
                          parameters. One transaction, read back, then sync + relinquish. Undo log for Revert.
IronPython 2.7 and CPython 3.
"""
from __future__ import print_function

import os
import io
import re
import json
import time

import clr
clr.AddReference('RevitAPI')
import Autodesk.Revit.DB as DB
from Autodesk.Revit.DB import (FilteredElementCollector, ViewSheet, ElementId, BuiltInCategory,
                               BuiltInParameter, StorageType, Transaction, TransactionStatus,
                               ModelPathUtils, OpenOptions, DetachFromCentralOption,
                               WorksetConfiguration, WorksetConfigurationOption)
from System import Guid
from System.Collections.Generic import List

import bimexport_core as core

SETS_FILE = os.path.join(core.SETTINGS_DIR, 'IssueSets.json')
APPLY_DIR = os.path.join(core.SETTINGS_DIR, 'apply_logs')
REGISTER_COLS = ['DrawingCode', 'Model', 'SheetNumber', 'SheetName', 'Revision', 'RevisionDate',
                 'RevisionDescription', 'PrintedOn', 'PrintedBy', 'Formats', 'PDFFile', 'DWGFile',
                 'Change', 'ModelVersion', 'Note']


# ------------------------------------------------------------------ ids --
def eid_int(eid):
    v = getattr(eid, 'Value', None)
    if v is None:
        v = eid.IntegerValue
    return int(v)


def make_eid(v):
    try:
        import System
        return ElementId(System.Int64(int(v)))
    except Exception:
        return ElementId(int(v))


def _txt(v):
    return core.text(v)


# ------------------------------------------------------------- reading --
def model_version(doc):
    """Changes with every sync to central: 'saves|guid' ('' if Revit can't tell)."""
    try:
        v = DB.Document.GetDocumentVersion(doc)
        return u'%s|%s' % (v.NumberOfSaves, _txt(v.VersionGUID))
    except Exception:
        return u''


def _is_yes_no(p):
    try:
        return p.Definition.GetDataType() == DB.SpecTypeId.Boolean.YesNo
    except Exception:
        pass
    try:
        return p.Definition.ParameterType == DB.ParameterType.YesNo
    except Exception:
        return False


def _yes_no_params(el):
    out = []
    for p in el.Parameters:
        try:
            if p.StorageType == StorageType.Integer and _is_yes_no(p):
                out.append({'name': _txt(p.Definition.Name), 'value': p.AsInteger() == 1,
                            'readonly': bool(p.IsReadOnly)})
        except Exception:
            pass
    out.sort(key=lambda x: x['name'].lower())
    return out


def rev_number(r):
    """A revision's own number. In 'per sheet' numbering Revit has none (each sheet numbers it itself)."""
    try:
        return _txt(r.RevisionNumber)
    except Exception:
        return u''


def rev_label(r):
    """For messages: the number, or 'seq N - date' when numbering is per sheet."""
    return rev_number(r) or u'seq %s (%s)' % (r.SequenceNumber, _txt(r.RevisionDate))


def _group_of(r):
    """Which counter a revision uses: its numbering sequence, else the letters of its number (T0 -> 'T')."""
    if r.get('nseq') not in (None, -1, u''):
        return u'seq:%s' % r['nseq']
    m = re.match(r'^\s*([^\d]*)', r.get('number') or u'')
    return u'pre:%s' % (m.group(1) if m else u'')


def sequence_values(iss):
    """{group: [numbers in order]} - from the model's numbering sequences, else from the per-project numbers."""
    vals = {}
    for k, v in (iss.get('sequences') or {}).items():
        if v:
            vals[u'seq:%s' % k] = v
    by_group = {}
    for r in sorted(iss.get('revisions', []), key=lambda x: x['seq']):
        if r.get('numbered', True) and r.get('number'):
            by_group.setdefault(_group_of(r), []).append(r['number'])
    for g, nums in by_group.items():
        vals.setdefault(g, nums)          # fallback: the per-project numbers in order (T0, T1, T2 ...)
    return vals


def predict_numbers(revs, iss, per_sheet):
    """{revision key: number shown on ONE sheet} for the revisions on it (revs = dicts with key/seq/number/nseq).
    Per project: each revision keeps its own number. Per sheet: like Revit, each sheet counts only its own
    revisions, separately for each numbering sequence (T0 + T2 ticked -> T0, T1)."""
    out = {}
    if not per_sheet:
        for r in revs:
            out[r['key']] = r.get('number') or u''
        return out
    vals = sequence_values(iss)
    last_group = None
    for r in sorted(iss.get('revisions', []), key=lambda x: x['seq']):
        last_group = _group_of(r)
    count = {}
    for r in sorted(revs, key=lambda x: x['seq']):
        if not r.get('numbered', True):
            out[r['key']] = u''
            continue
        g = _group_of(r) if not r['key'].startswith('new') else (last_group or u'pre:')
        i = count.get(g, 0)
        count[g] = i + 1
        seq = vals.get(g) or []
        out[r['key']] = seq[i] if i < len(seq) else u'?'
    return out


def _numbering_per_sheet(doc):
    try:
        rs = DB.RevisionSettings.GetRevisionSettings(doc)
        return _txt(rs.RevisionNumbering) == 'PerSheet'
    except Exception:
        return False


def _seq_values(doc, sid):
    """The numbers a Revision Numbering Sequence gives out, in order (first 200)."""
    try:
        sq = doc.GetElement(make_eid(sid))
        kind = _txt(sq.NumberType)
        if kind == 'Alphanumeric':
            a = sq.GetAlphanumericRevisionSettings()
            return [_txt(a.Prefix) + _txt(x) + _txt(a.Suffix) for x in a.GetSequence()][:200]
        if kind == 'Numeric':
            n = sq.GetNumericRevisionSettings()
            d = int(n.MinimumDigits or 0)
            return [_txt(n.Prefix) + str(int(n.StartNumber) + k).zfill(d) + _txt(n.Suffix) for k in range(200)]
    except Exception:
        pass
    return None


def _rev_seq_id(r):
    try:
        return eid_int(r.RevisionNumberingSequenceId)
    except Exception:
        return None


def _rev_numbered(r):
    try:
        return _txt(r.NumberType) != 'None'
    except Exception:
        return True


def read_clouds(doc, sheets):
    """{sheet number: [cloud]} - every revision cloud that shows on a sheet: drawn on the sheet itself or in a view
    placed on it. cloud = {id, rev, view, view_name, on_sheet, also_on: [other sheet numbers showing that view]}."""
    view_sheets = {}
    for s in sheets:
        try:
            ids = [eid_int(i) for i in s.GetAllPlacedViews()]
        except Exception:
            ids = []
        for v in ids + [eid_int(s.Id)]:
            view_sheets.setdefault(v, []).append(s.SheetNumber)
    out = {}
    try:
        clouds = list(FilteredElementCollector(doc).OfClass(DB.RevisionCloud))
    except Exception:
        return out
    for c in clouds:
        try:
            vid, rid = eid_int(c.OwnerViewId), eid_int(c.RevisionId)
            v = doc.GetElement(c.OwnerViewId)
            vname = _txt(getattr(v, 'Name', u''))
        except Exception:
            continue
        nums = view_sheets.get(vid, [])
        for n in nums:
            out.setdefault(n, []).append({'id': eid_int(c.Id), 'rev': rid, 'view': vid, 'view_name': vname,
                                          'on_sheet': isinstance(v, ViewSheet),
                                          'also_on': [x for x in nums if x != n]})
    return out


def read_issue_data(doc):
    """Everything the Issue window shows for one model (works with all worksets closed)."""
    revs = []
    rev_by_id = {}
    for rid in DB.Revision.GetAllRevisionIds(doc):
        r = doc.GetElement(rid)
        d = {'id': eid_int(rid), 'seq': r.SequenceNumber, 'number': rev_number(r),
             'date': _txt(r.RevisionDate), 'description': _txt(r.Description), 'issued': bool(r.Issued),
             'issued_by': _txt(r.IssuedBy), 'issued_to': _txt(r.IssuedTo),
             'nseq': _rev_seq_id(r), 'numbered': _rev_numbered(r)}
        revs.append(d)
        rev_by_id[d['id']] = d
    sheets = {}
    tb_count = {}
    all_sheets = [s for s in FilteredElementCollector(doc).OfClass(ViewSheet) if not s.IsPlaceholder]
    clouds_by_sheet = read_clouds(doc, all_sheets)
    for s in all_sheets:
        try:
            all_ids = [eid_int(i) for i in s.GetAllRevisionIds()]
            extra_ids = [eid_int(i) for i in s.GetAdditionalRevisionIds()]
        except Exception:
            all_ids, extra_ids = [], []
        cur = None
        try:
            cid = s.GetCurrentRevision()
            if cid and eid_int(cid) > 0:
                cur = eid_int(cid)
        except Exception:
            pass
        on_sheet = {}
        for i in all_ids:
            try:
                on_sheet[i] = _txt(s.GetRevisionNumberOnSheet(make_eid(i)))
            except Exception:
                on_sheet[i] = rev_by_id.get(i, {}).get('number', u'')
        tbs = []
        try:
            for inst in FilteredElementCollector(doc, s.Id).OfCategory(BuiltInCategory.OST_TitleBlocks) \
                    .WhereElementIsNotElementType():
                sym = inst.Symbol
                tname = sym.get_Parameter(BuiltInParameter.SYMBOL_NAME_PARAM).AsString()
                tbs.append({'instance_id': eid_int(inst.Id), 'type_id': eid_int(sym.Id),
                            'family': _txt(sym.FamilyName), 'type': _txt(tname),
                            'instance_params': _yes_no_params(inst), 'type_params': _yes_no_params(sym)})
        except Exception:
            pass
        for t_id in set(t['type_id'] for t in tbs):
            tb_count[t_id] = tb_count.get(t_id, 0) + 1
        tb = tbs[0] if tbs else None
        sheets[s.SheetNumber] = {
            'id': eid_int(s.Id), 'name': _txt(s.Name), 'all_revs': all_ids, 'extra_revs': extra_ids,
            'cloud_revs': [i for i in all_ids if i not in extra_ids], 'current': cur,
            'current_number': on_sheet.get(cur, u'') if cur else u'',
            'current_date': rev_by_id.get(cur, {}).get('date', u'') if cur else u'',
            'numbers_on_sheet': dict((str(k), v) for k, v in on_sheet.items()), 'titleblock': tb,
            'clouds': clouds_by_sheet.get(s.SheetNumber, []),
            'titleblocks': tbs}
    return {'version': model_version(doc), 'read_on': core.now(), 'revisions': revs,
            'per_sheet_numbering': _numbering_per_sheet(doc), 'sheets': sheets, 'clouds_read': True,
            'sequences': dict((str(k), _seq_values(doc, k)) for k in set(r['nseq'] for r in revs if r.get('nseq') not in (None, -1))),
            'titleblock_type_count': dict((str(k), v) for k, v in tb_count.items()),
            'titleblock_types': read_titleblock_types(doc)}


def _size(sym):
    out = []
    for bip in ('SHEET_WIDTH', 'SHEET_HEIGHT'):
        try:
            p = sym.get_Parameter(getattr(BuiltInParameter, bip))
            out.append(p.AsValueString() if p is not None else u'')
        except Exception:
            out.append(u'')
    return u' x '.join(x for x in out if x)


def read_titleblock_types(doc):
    """Every title block type loaded in the model: [{id, family, type, size}] (family, then type)."""
    out = []
    try:
        for sym in FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_TitleBlocks).WhereElementIsElementType():
            try:
                out.append({'id': eid_int(sym.Id), 'family': _txt(sym.FamilyName),
                            'type': _txt(sym.get_Parameter(BuiltInParameter.SYMBOL_NAME_PARAM).AsString()),
                            'size': _size(sym)})
            except Exception:
                pass
    except Exception:
        pass
    out.sort(key=lambda t: (t['family'].lower(), t['type'].lower()))
    return out


def _yes_no_values(el):
    """{name: True/False} of an element's changeable Yes/No parameters."""
    return dict((p['name'], p['value']) for p in _yes_no_params(el) if not p['readonly'])


# ------------------------------------------------------------ file names --
def midp_index(rows):
    """{sequence (lower): [rows]} from the MIDP/LOD rows (core.read_lod)."""
    idx = {}
    for r in rows:
        code = (r.get('drawingnumber') or r.get('sheetnumber') or u'').strip()
        parts = core.lod_parts(code)
        if len(parts) >= 7:
            idx.setdefault(parts[6].lower(), []).append(r)
        if code:
            idx.setdefault(code.lower(), []).append(r)
    return idx


def file_name_for(sheet_number, revit_rev, midp, allow_no_rev=False):
    """(file name or None, status, note). The name is the MIDP code's first 7 parts + Revit's revision.
    Anything uncertain is BLOCKED, never guessed."""
    hits = midp.get(sheet_number.strip().lower(), [])
    codes = sorted(set((h.get('drawingnumber') or h.get('sheetnumber') or u'').strip() for h in hits))
    if not codes:
        return None, u'BLOCKED', u'Not in the MIDP/LOD'
    bases = sorted(set(u'-'.join(core.lod_parts(c)[:7]) for c in codes if len(core.lod_parts(c)) >= 7))
    if len(bases) != 1:
        return None, u'BLOCKED', u'In the MIDP/LOD %d times with different codes: %s' % (len(codes), u', '.join(codes))
    base = bases[0]
    parts = core.lod_parts(base)
    if len(parts) != 7 or not all(parts) or parts[6].lower() != sheet_number.strip().lower():
        return None, u'BLOCKED', u'MIDP code "%s" does not end with the sheet number %s' % (base, sheet_number)
    if not revit_rev:
        if allow_no_rev:
            return base, u'OK', u'No revision on the sheet - name without revision'
        return None, u'BLOCKED', u'The sheet has no revision in Revit'
    name = u'%s-%s' % (base, revit_rev)
    if core.clean(name) != name:
        return None, u'BLOCKED', u'Characters not allowed in a file name: "%s"' % name
    return name, u'OK', u''


def midp_title(sheet_number, midp):
    hits = midp.get(sheet_number.strip().lower(), [])
    return hits[0].get('sheetname', u'') if hits else u''


# ---------------------------------------------------------- issue register --
def read_register(path):
    if not path or not os.path.exists(path):
        return []
    try:
        return core.read_csv(path)
    except Exception:
        return []


def last_issues(rows):
    """{(model lower, sheet lower): newest row} and {model lower: newest row}."""
    by_sheet, by_model = {}, {}
    for r in rows:
        k = (r.get('Model', u'').lower(), r.get('SheetNumber', u'').lower())
        if k not in by_sheet or r.get('PrintedOn', u'') >= by_sheet[k].get('PrintedOn', u''):
            by_sheet[k] = r
        m = k[0]
        if m not in by_model or r.get('PrintedOn', u'') >= by_model[m].get('PrintedOn', u''):
            by_model[m] = r
    return by_sheet, by_model


def change_status(model, sheet, rev, version, by_sheet, by_model):
    last = by_sheet.get((model.lower(), sheet.lower()))
    if last is None:
        return u'New (never issued)'
    if (last.get('Revision') or u'') != (rev or u''):
        return u'Revision changed (%s → %s)' % (last.get('Revision') or u'-', rev or u'-')
    lastv = last.get('ModelVersion', u'')          # the model's sync stamp when THIS drawing was last printed
    if not version or not lastv:
        return u'Unknown (no sync record yet)'
    if version.split(u'|')[0] != lastv.split(u'|')[0]:
        return u'Model synced since last issue'
    return u'No change'


def write_register(path, new_rows):
    """Add rows, keep each drawing's prints together (oldest first). Returns the path written."""
    rows = read_register(path) + new_rows
    rows.sort(key=lambda r: ((r.get('DrawingCode') or r.get('Model', u'') + u'|' + r.get('SheetNumber', u'')).lower(),
                             r.get('PrintedOn', u'')))
    data = [[r.get(c, u'') for c in REGISTER_COLS] for r in rows]
    if path and os.path.exists(path):
        try:
            import shutil
            shutil.copy2(path, path + u'.backup')          # previous version kept next to it
        except Exception:
            pass
    try:
        core.write_csv(path, REGISTER_COLS, data)
        return path
    except Exception:
        alt = core.usable_log_path(path)
        if alt == path:
            alt = os.path.splitext(path)[0] + u'_%d.csv' % int(time.time())
        core.write_csv(alt, REGISTER_COLS, data)
        return alt


# ------------------------------------------------------------------ sets --
def load_sets():
    try:
        with io.open(SETS_FILE, 'r', encoding='utf-8') as f:
            return json.loads(f.read())
    except Exception:
        return {}


def save_sets(sets):
    core.ensure_dir(core.SETTINGS_DIR)
    with io.open(SETS_FILE, 'w', encoding='utf-8') as f:
        f.write(core.text(json.dumps(sets, indent=1)))


# ------------------------------------------------- requests from the Toolbox --
# Lew's Toolbox (HTA) "Pull from Revit" writes  %APPDATA%\BIMExport\Requests\<name>.csv  with columns
#   DrawingNumber, ExpectedRev, Title, Model, OutputFolder, Formats, RequestedOn
# Issue Sheets loads it, ticks those drawings, BLOCKS any whose Revit revision is not the expected one,
# and after the issue moves it to Requests\Done with a <name>.result.csv next to it.
REQUESTS_DIR = os.path.join(core.SETTINGS_DIR, 'Requests')
REQUEST_RESULT_COLS = ['DrawingNumber', 'SheetNumber', 'ExpectedRev', 'RevitRev', 'Model', 'Status', 'PDFFile',
                       'DWGFile', 'Note', 'DoneOn']


def _req_key(s):
    return core.key(s)


def pending_requests():
    """Newest first: [{'path', 'name', 'rows': [...], 'out', 'formats'}]"""
    out = []
    if not os.path.isdir(REQUESTS_DIR):
        return out
    drop_cancelled()                                 # cancelled in the Toolbox before Revit got to them
    for fn in os.listdir(REQUESTS_DIR):
        p = os.path.join(REQUESTS_DIR, fn)
        if not fn.lower().endswith('.csv') or not os.path.isfile(p):
            continue
        try:
            rows = read_request(p)
        except Exception:
            continue
        if rows:
            out.append({'path': p, 'name': fn[:-4], 'rows': rows, 'mtime': os.path.getmtime(p),
                        'out': next((r['out'] for r in rows if r['out']), u''),
                        'formats': next((r['formats'] for r in rows if r['formats']), u'')})
    out.sort(key=lambda r: -r['mtime'])
    return out


def read_request(path):
    rows = []
    for r in core.read_csv(path):
        k = dict((_req_key(a), (b or u'').strip()) for a, b in r.items())
        code = k.get('drawingnumber') or k.get('drawingno') or k.get('sheetnumber') or u''
        if not code:
            continue
        parts = core.lod_parts(code)
        seq = parts[6] if len(parts) >= 7 else code
        exp = k.get('expectedrev') or k.get('revision') or k.get('rev') or (parts[7] if len(parts) >= 8 else u'')
        rows.append({'code': code, 'seq': seq.strip(), 'expected': exp.strip(), 'title': k.get('title', u''),
                     'model': k.get('model', u''), 'out': k.get('outputfolder', u''), 'formats': k.get('formats', u'')})
    return rows


def _norm_model(n):
    n = re.sub(r'\.rvt$', u'', (n or u'').strip().lower())
    return re.sub(r'[^a-z0-9]', u'', n)


def request_models(req, reg, cache):
    """Which model each requested drawing is in: by the Model column (loose match), else by the saved drawing
    lists (the sheet number is in exactly one model). Returns ({row index: guid}, {row index: why not})."""
    names = {}
    for g, rec in reg.items():
        for n in (rec.get('Name'), (cache.get(g.lower()) or {}).get('model')):
            if _norm_model(n):
                names.setdefault(_norm_model(n), set()).add(g.lower())
    by_sheet = {}
    for g, e in cache.items():
        if g.lower() in [x.lower() for x in reg]:
            for sh in e.get('sheets', []):
                by_sheet.setdefault(sh['number'].strip().lower(), set()).add(g.lower())
    found, why = {}, {}
    for i, q in enumerate(req['rows']):
        k, m = q['seq'].strip().lower(), _norm_model(q.get('model'))
        cands = set()
        if m:
            cands = set(names.get(m, set()))
            if not cands:
                for n, gs in names.items():
                    if len(m) >= 5 and (m in n or n in m):
                        cands |= gs
        has = by_sheet.get(k, set())
        if len(cands) > 1 and len(cands & has) == 1:
            cands = cands & has
        if len(cands) != 1:
            cands = has if len(has) == 1 else cands
        if len(cands) == 1:
            found[i] = list(cands)[0]
        elif len(cands) > 1:
            why[i] = u'"%s" fits %d models - write more of the model name' % (q['model'], len(cands))
        elif len(has) > 1:
            why[i] = u'drawing %s is in %d models - put the model name in the Model column' % (q['seq'], len(has))
        else:
            why[i] = (u'model "%s" not found on this PC' % q['model']) if m else \
                u'model unknown - put the model name in the Model column (or read the model once)'
    return found, why          # keyed by ROW (the same sheet number can be in two models, e.g. two towers)


def request_midp_rows(req):
    """The request's codes as MIDP rows, so names can be made even without a MIDP file."""
    return [{'drawingnumber': r['code'], 'sheetname': r['title'], '_listed': r['code']} for r in req['rows']
            if len(core.lod_parts(r['code'])) >= 7]          # a bare number needs the MIDP file for its code


def request_check(num, revit_rev, req):
    """None when the drawing is not in the request, else (ok, note)."""
    hit = [r for r in req['rows'] if r['seq'].lower() == num.strip().lower()]
    if not hit:
        return None
    exp = hit[0]['expected']
    if not exp:
        return True, u'Toolbox request (no revision given)'
    if not revit_rev:
        return False, u'Toolbox expects %s, the sheet has NO revision in Revit' % exp
    if exp.lower() == revit_rev.strip().lower():
        return True, u'matches the Toolbox request (%s)' % exp
    behind = _rev_order(revit_rev) < _rev_order(exp)
    return False, (u'Toolbox expects %s, Revit has %s - add the %s revision (Revisions tab), Apply, Check again'
                   % (exp, revit_rev, exp)) if behind else (
        u'Toolbox expects %s, Revit is already at %s - update the list in the Toolbox and send it again' % (exp, revit_rev))


def _rev_order(r):
    m = re.match(r'^\s*([A-Za-z]*)(\d*)', r or u'')
    return ((m.group(1) or u'').upper(), int(m.group(2) or 0)) if m else (u'', 0)


def request_status(req, stage, text, done=0, total=0):
    """Live progress for the Toolbox: Requests\\<name>.status.json (stage: loaded / checking / ready / printing / done)."""
    try:
        core.ensure_dir(REQUESTS_DIR)
        p = os.path.join(REQUESTS_DIR, u'%s.status.json' % req['name'])
        tmp = p + u'.tmp'
        with io.open(tmp, 'w', encoding='utf-8') as f:
            f.write(core.text(json.dumps({'stage': stage, 'text': text, 'done': done, 'total': total,
                                          'time': core.now(), 'by': os.environ.get('USERNAME', u'')})))
        if os.path.exists(p):
            os.remove(p)
        os.rename(tmp, p)
    except Exception:
        pass


def request_cancelled(req):
    """True when the Toolbox pressed Cancel (Requests\\<name>.cancel)."""
    return os.path.exists(os.path.join(REQUESTS_DIR, u'%s.cancel' % req['name']))


def drop_cancelled():
    """Requests cancelled before Revit picked them up: move them to Done\\Cancelled."""
    if not os.path.isdir(REQUESTS_DIR):
        return
    for fn in os.listdir(REQUESTS_DIR):
        if not fn.lower().endswith('.cancel'):
            continue
        name = fn[:-7]
        dst = core.ensure_dir(os.path.join(REQUESTS_DIR, 'Done', 'Cancelled'))
        for ext in (u'.csv', u'.status.json', u'.cancel'):
            src = os.path.join(REQUESTS_DIR, name + ext)
            try:
                if os.path.exists(src):
                    t = os.path.join(dst, name + ext)
                    if os.path.exists(t):
                        os.remove(t)
                    os.rename(src, t)
            except Exception:
                pass


def finish_request(req, results):
    """Write <name>.result.csv in Requests\\Done and move the request there. Returns the result path."""
    done = core.ensure_dir(os.path.join(REQUESTS_DIR, 'Done'))
    stamp = time.strftime('%Y%m%d_%H%M%S')
    res = os.path.join(done, u'%s.result.csv' % req['name'])
    core.write_csv(res, REQUEST_RESULT_COLS, [[r.get(c, u'') for c in REQUEST_RESULT_COLS] for r in results])
    try:
        dst = os.path.join(done, os.path.basename(req['path']))
        if os.path.exists(dst):
            dst = os.path.join(done, u'%s_%s.csv' % (req['name'], stamp))
        os.rename(req['path'], dst)
    except Exception:
        pass
    n_ok = len([r for r in results if r.get('Status') == 'PRINTED'])
    cancelled = any(r.get('Status') == 'CANCELLED' for r in results)
    request_status(req, 'done', u'%s%d of %d printed' % (u'Cancelled - ' if cancelled else u'', n_ok, len(results)),
                   n_ok, len(results))
    for ext in (u'.status.json', u'.cancel'):          # status / cancel flag go with the request
        try:
            st = os.path.join(REQUESTS_DIR, req['name'] + ext)
            if os.path.exists(st):
                dst_st = os.path.join(done, req['name'] + ext)
                if os.path.exists(dst_st):
                    os.remove(dst_st)
                os.rename(st, dst_st)
        except Exception:
            pass
    return res


# ------------------------------------------------------- apply / revert --
class ApplyError(Exception):
    pass


def other_revit_windows():
    """How many OTHER Revit programs are running on this PC."""
    try:
        import System
        return max(0, len(System.Diagnostics.Process.GetProcessesByName('Revit')) - 1)
    except Exception:
        return 0


def _open_for_edit(app, rec, settings):
    """Your normal LOCAL copy (not detached), opened with YOUR last-used worksets, so nothing about your
    local copy changes. Refused when the model is open here or any other Revit window is running
    (two windows on one PC share the same local file - that causes sync problems)."""
    if core.find_open_doc(app, rec['ModelGUID'].lower()) is not None:
        raise ApplyError(u'The model is open in this Revit window. Close it first, then Apply again.')
    n = other_revit_windows()
    if settings.get('_bg_apply'):                 # the background Revit: only YOUR Revit may run next to it,
        if rec['ModelGUID'].lower() in [g.lower() for g in settings.get('_user_open_guids') or []]:
            raise ApplyError(u'The model is open in your Revit. Close it there (sync first), then Apply again.')
        if n > 1:                                 # and it must not have this model open
            raise ApplyError(u'%d other Revit windows are running. Close all but yours - Revit windows on one PC '
                             u'share the same local copy.' % n)
    elif n:
        raise ApplyError(u'%d other Revit window(s) are running. Close them first - two Revit windows on one PC '
                         u'share the same local copy, which causes sync problems. (With the background Revit '
                         u'running, choose "Apply in the background Revit".)' % n)
    errors = []
    for reg in core._regions(rec.get('Region') or settings.get('region')):
        try:
            path = ModelPathUtils.ConvertCloudGUIDsToCloudPath(reg, Guid(rec['ProjectGUID']), Guid(rec['ModelGUID']))
            opts = OpenOptions()
            opts.DetachFromCentralOption = DetachFromCentralOption.DoNotDetach
            opts.SetOpenWorksetsConfiguration(WorksetConfiguration(WorksetConfigurationOption.OpenLastViewed))
            return core._open(app, path, opts)
        except Exception as e:
            msg = core.text(e)
            errors.append(u'%s: %s' % (reg, u'not found in this region' if 'central model is missing' in msg.lower() else msg))
    raise ApplyError(u'Could not open: ' + u' | '.join(errors))


class StrictRevit(object):
    """For Apply/Revert: NO automatic clicking of Revit dialogs. Plain warnings are noted and accepted;
    any ERROR makes Revit roll the whole change back."""

    def __init__(self, app, log):
        self.app, self.log = app, log

    def _failures(self, sender, args):
        try:
            fa = args.GetFailuresAccessor()
            errors = False
            for m in list(fa.GetFailureMessages()):
                if m.GetSeverity() == DB.FailureSeverity.Warning:
                    self.log.append(u'Revit warning accepted: %s' % core.text(m.GetDescriptionText()))
                    fa.DeleteWarning(m)
                else:
                    errors = True
                    self.log.append(u'Revit ERROR: %s' % core.text(m.GetDescriptionText()))
            args.SetProcessingResult(DB.FailureProcessingResult.ProceedWithRollBack if errors
                                     else DB.FailureProcessingResult.Continue)
        except Exception:
            pass

    def __enter__(self):
        self.app.FailuresProcessing += self._failures
        return self

    def __exit__(self, *a):
        try:
            self.app.FailuresProcessing -= self._failures
        except Exception:
            pass
        return False


def _owned_by_others(doc, ids):
    out = []
    if not doc.IsWorkshared:
        return out
    for i in ids:
        try:
            st = DB.WorksharingUtils.GetCheckoutStatus(doc, make_eid(i))
            if st == DB.CheckoutStatus.OwnedByOtherUser:
                el = doc.GetElement(make_eid(i))
                who = u''
                try:
                    who = DB.WorksharingUtils.GetWorksharingTooltipInfo(doc, make_eid(i)).Owner
                except Exception:
                    pass
                out.append(u'%s (%s)' % (core.text(getattr(el, 'Name', i)), who or u'another user'))
        except Exception:
            pass
    return out


def _set_yes_no(el, name, value):
    p = el.LookupParameter(name)
    if p is None or p.IsReadOnly or p.StorageType != StorageType.Integer:
        raise ApplyError(u'Parameter "%s" can not be changed' % name)
    p.Set(1 if value else 0)


def _xyz(p):
    return [p.X, p.Y, p.Z]


def _cloud_record(doc, cid):
    """Everything needed to draw the cloud again (Revert): view, revision, sketch curves, comments, mark."""
    c = doc.GetElement(make_eid(cid))
    if c is None:
        return None
    curves = []
    for cv in c.GetSketchCurves():
        if isinstance(cv, DB.Arc):
            curves.append(['A', _xyz(cv.GetEndPoint(0)), _xyz(cv.GetEndPoint(1)), _xyz(cv.Evaluate(0.5, True))])
        else:
            curves.append(['L', _xyz(cv.GetEndPoint(0)), _xyz(cv.GetEndPoint(1))])
    rec = {'id': cid, 'view': eid_int(c.OwnerViewId), 'rev': eid_int(c.RevisionId), 'curves': curves}
    for key, bip in (('comments', 'ALL_MODEL_INSTANCE_COMMENTS'), ('mark', 'ALL_MODEL_MARK')):
        try:
            p = c.get_Parameter(getattr(BuiltInParameter, bip))
            rec[key] = _txt(p.AsString()) if p is not None else u''
        except Exception:
            rec[key] = u''
    return rec


def _draw_cloud(doc, rec):
    pts = lambda v: DB.XYZ(v[0], v[1], v[2])
    curves = List[DB.Curve]()
    for cv in rec['curves']:
        if cv[0] == 'A':
            curves.Add(DB.Arc.Create(pts(cv[1]), pts(cv[2]), pts(cv[3])))
        else:
            curves.Add(DB.Line.CreateBound(pts(cv[1]), pts(cv[2])))
    c = DB.RevisionCloud.Create(doc, doc.GetElement(make_eid(rec['view'])), make_eid(rec['rev']), curves)
    for key, bip in (('comments', 'ALL_MODEL_INSTANCE_COMMENTS'), ('mark', 'ALL_MODEL_MARK')):
        if rec.get(key):
            try:
                c.get_Parameter(getattr(BuiltInParameter, bip)).Set(rec[key])
            except Exception:
                pass
    return c


def _families_named(doc, name):
    return [f for f in FilteredElementCollector(doc).OfClass(DB.Family) if _txt(f.Name).lower() == name.lower()]


def _family_load_options(overwrite):
    """Answers Revit's 'family already exists' question without a dialog."""
    class _Opts(DB.IFamilyLoadOptions):
        def OnFamilyFound(self, familyInUse, overwriteParameterValues):
            try:
                overwriteParameterValues.Value = bool(overwrite)
            except Exception:
                pass
            return True

        def OnSharedFamilyFound(self, sharedFamily, familyInUse, source, overwriteParameterValues):
            try:
                source.Value = DB.FamilySource.Family
                overwriteParameterValues.Value = bool(overwrite)
            except Exception:
                pass
            return True
    return _Opts()


def _backup_family(doc, fam, stem):
    """Save the model's current version of a family as .rfa (so Revert can load it back)."""
    # Revit names a loaded family after its FILE: the backup keeps the exact family name, in its own dated folder
    folder = core.ensure_dir(os.path.join(APPLY_DIR, u'family_backups', time.strftime('%Y%m%d_%H%M%S')))
    path = os.path.join(folder, u'%s.rfa' % stem)
    fd = doc.EditFamily(fam)
    try:
        o = DB.SaveAsOptions()
        o.OverwriteExistingFile = True
        fd.SaveAs(path, o)
    finally:
        fd.Close(False)
    return path


def _snapshot(doc, changes):
    """Old values of everything the changes touch (for verification and Revert)."""
    snap = {'revisions': {}, 'sheets': {}, 'params': [], 'tb_types': [], 'clouds': [], 'families': []}
    for lf in changes.get('load_families', []):
        old = _families_named(doc, lf['name'])
        if old:                                    # update: keep the model's current version for Revert
            snap['families'].append({'name': lf['name'], 'mode': 'update', 'backup': _backup_family(doc, old[0], lf['name'])})
        else:
            snap['families'].append({'name': lf['name'], 'mode': 'add'})
    for dc in changes.get('delete_clouds', []):
        r = _cloud_record(doc, dc['id'])
        if r is not None:
            r['label'] = dc.get('label', u'')
            snap['clouds'].append(r)
    if changes.get('numbering'):
        snap['numbering'] = u'PerSheet' if _numbering_per_sheet(doc) else u'PerProject'
    for rid in changes.get('edit_revisions', {}):
        r = doc.GetElement(make_eid(rid))
        snap['revisions'][str(rid)] = {'date': _txt(r.RevisionDate), 'description': _txt(r.Description),
                                       'issued_by': _txt(r.IssuedBy), 'issued_to': _txt(r.IssuedTo)}
    sheets = dict((s.SheetNumber, s) for s in FilteredElementCollector(doc).OfClass(ViewSheet))
    for num in changes.get('sheet_revisions', {}):
        s = sheets.get(num)
        if s is not None:
            snap['sheets'][num] = [eid_int(i) for i in s.GetAdditionalRevisionIds()]
    for pc in changes.get('params', []):
        el = doc.GetElement(make_eid(pc['element_id']))
        p = el.LookupParameter(pc['name']) if el is not None else None
        snap['params'].append(dict(pc, value=(p.AsInteger() == 1) if p is not None else None))
    for tc in changes.get('tb_types', []):
        inst = doc.GetElement(make_eid(tc['instance_id']))
        if inst is not None:
            snap['tb_types'].append({'instance_id': tc['instance_id'], 'type_id': eid_int(inst.GetTypeId()),
                                     'restore': _yes_no_values(inst), 'label': tc.get('label', u''),
                                     'new_label': tc.get('old_label') or u'the original title block',
                                     'copy_switches': False})
    return snap


def _apply_in_doc(doc, changes, log):
    """All changes in ONE transaction. Raises on any problem (Revit rolls everything back)."""
    sheets = dict((s.SheetNumber, s) for s in FilteredElementCollector(doc).OfClass(ViewSheet))
    created = {}
    t = Transaction(doc, 'Issue Sheets by Lew')
    t.Start()
    try:
        if changes.get('numbering'):
            rs = DB.RevisionSettings.GetRevisionSettings(doc)
            rs.RevisionNumbering = getattr(DB.RevisionNumbering, changes['numbering'])
            log.append(u'Revision numbering set to %s' % (u'per sheet' if changes['numbering'] == 'PerSheet' else u'per project'))
        for lf in changes.get('load_families', []):         # title block family from a .rfa file
            if not os.path.exists(lf['path']):
                raise ApplyError(u'Family file not found: %s' % lf['path'])
            ok = doc.LoadFamily(lf['path'], _family_load_options(lf.get('overwrite')))
            ok = ok[0] if isinstance(ok, tuple) else ok
            if not _families_named(doc, lf['name']):
                raise ApplyError(u'Revit did not load %s (newer Revit version, or not a family file?)' % lf['path'])
            log.append(u'Title block family %s: %s%s' % (lf['name'], u'updated' if lf.get('mode') == 'update' else u'added',
                                                         u' (type values from the file)' if lf.get('overwrite') else u''))
        for name in changes.get('delete_families', []):     # Revert of an added family
            for f in _families_named(doc, name):
                ids = list(f.GetFamilySymbolIds())
                used = [1 for i in ids for _ in FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_TitleBlocks)
                        .WhereElementIsNotElementType() if eid_int(_.GetTypeId()) == eid_int(i)]
                if used:
                    raise ApplyError(u'Family %s is still used on %d sheet(s) - change those back first' % (name, len(used)))
                doc.Delete(f.Id)
                log.append(u'Title block family %s removed' % name)
        for rc in changes.get('create_clouds', []):           # Revert: draw deleted clouds again
            _draw_cloud(doc, rc)
            log.append(u'Revision cloud drawn again in "%s"' % rc.get('label', rc['view']))
        for dc in changes.get('delete_clouds', []):
            el = doc.GetElement(make_eid(dc['id']))
            if el is None:
                raise ApplyError(u'Revision cloud %s not found (already removed?)' % dc['id'])
            r = doc.GetElement(el.RevisionId)
            if r is not None and r.Issued:
                raise ApplyError(u'Revision %s is marked Issued - Revit locks its clouds' % rev_label(r))
            doc.Delete(make_eid(dc['id']))
            log.append(u'Revision cloud removed (%s)' % dc.get('label', dc['id']))
        for nr in changes.get('new_revisions', []):
            r = DB.Revision.Create(doc)
            r.RevisionDate = nr.get('date', u'')
            r.Description = nr.get('description', u'')
            r.IssuedBy = nr.get('issued_by', u'')
            r.IssuedTo = nr.get('issued_to', u'')
            created[nr['temp']] = eid_int(r.Id)
            log.append(u'New revision: %s %s' % (nr.get('date', u''), nr.get('description', u'')))
        for rid, vals in changes.get('edit_revisions', {}).items():
            r = doc.GetElement(make_eid(rid))
            if r is None:
                raise ApplyError(u'Revision %s not found' % rid)
            if r.Issued:
                raise ApplyError(u'Revision %s is marked Issued - Revit locks it' % rev_label(r))
            for key, prop in (('date', 'RevisionDate'), ('description', 'Description'),
                              ('issued_by', 'IssuedBy'), ('issued_to', 'IssuedTo')):
                if key in vals:
                    setattr(r, prop, vals[key])
            log.append(u'Revision %s edited' % rev_label(r))
        for num, ids in changes.get('sheet_revisions', {}).items():
            s = sheets.get(num)
            if s is None:
                raise ApplyError(u'Sheet %s not found' % num)
            real = [created[i] if i in created else int(i) for i in ids]
            s.SetAdditionalRevisionIds(List[ElementId]([make_eid(i) for i in real]))
            log.append(u'Sheet %s: revisions set' % num)
        for tc in changes.get('tb_types', []):
            inst = doc.GetElement(make_eid(tc['instance_id']))
            if inst is None:
                raise ApplyError(u'Title block %s not found' % tc['instance_id'])
            old_vals = _yes_no_values(inst)
            inst.ChangeTypeId(make_eid(tc['type_id']))
            log.append(u'%s: title block changed to %s' % (tc.get('label', u''), tc.get('new_label', tc['type_id'])))
            keep = tc.get('restore') if tc.get('restore') is not None else (old_vals if tc.get('copy_switches') else {})
            missing = []
            for name, val in keep.items():
                p = inst.LookupParameter(name)
                if p is None or p.IsReadOnly or p.StorageType != StorageType.Integer:
                    missing.append(name)
                    continue
                p.Set(1 if val else 0)
            if keep:
                log.append(u'   switches kept: %d%s' % (len(keep) - len(missing), (
                    u'; not in the new title block: ' + u', '.join(sorted(missing))) if missing else u''))
        for pc in changes.get('params', []):
            el = doc.GetElement(make_eid(pc['element_id']))
            if el is None:
                raise ApplyError(u'Title block element %s not found' % pc['element_id'])
            _set_yes_no(el, pc['name'], pc['value'])
            log.append(u'%s "%s" = %s on %s' % (pc['scope'], pc['name'], u'Yes' if pc['value'] else u'No',
                                                pc.get('label', u'')))
        st = t.Commit()
        if st != TransactionStatus.Committed:
            raise ApplyError(u'Revit did not accept the changes (%s)' % st)
    except Exception:
        if t.HasStarted() and not t.HasEnded():
            t.RollBack()
        raise
    return created


def _verify(doc, changes, created):
    """Read back. Returns a list of differences (empty = all good)."""
    bad = []
    for lf in changes.get('load_families', []):
        if not _families_named(doc, lf['name']):
            bad.append(u'Family %s is not in the model' % lf['name'])
    for name in changes.get('delete_families', []):
        if _families_named(doc, name):
            bad.append(u'Family %s is still in the model' % name)
    for dc in changes.get('delete_clouds', []):
        if doc.GetElement(make_eid(dc['id'])) is not None:
            bad.append(u'Revision cloud %s is still there' % dc['id'])
    if changes.get('numbering') and (u'PerSheet' if _numbering_per_sheet(doc) else u'PerProject') != changes['numbering']:
        bad.append(u'Revision numbering not as expected')
    for nr in changes.get('new_revisions', []):
        r = doc.GetElement(make_eid(created.get(nr['temp'], -1)))
        if r is None or _txt(r.RevisionDate) != nr.get('date', u''):
            bad.append(u'New revision %s not as expected' % nr.get('date', u''))
    for rid, vals in changes.get('edit_revisions', {}).items():
        r = doc.GetElement(make_eid(rid))
        if 'date' in vals and _txt(r.RevisionDate) != vals['date']:
            bad.append(u'Revision %s date not as expected' % rid)
    sheets = dict((s.SheetNumber, s) for s in FilteredElementCollector(doc).OfClass(ViewSheet))
    for num, ids in changes.get('sheet_revisions', {}).items():
        want = sorted(created[i] if i in created else int(i) for i in ids)
        got = sorted(eid_int(i) for i in sheets[num].GetAdditionalRevisionIds())
        if want != got:
            bad.append(u'Sheet %s revisions not as expected' % num)
    for tc in changes.get('tb_types', []):
        inst = doc.GetElement(make_eid(tc['instance_id']))
        if inst is None or eid_int(inst.GetTypeId()) != int(tc['type_id']):
            bad.append(u'%s: title block type not as expected' % tc.get('label', tc['instance_id']))
    for pc in changes.get('params', []):
        p = doc.GetElement(make_eid(pc['element_id'])).LookupParameter(pc['name'])
        if p is None or (p.AsInteger() == 1) != bool(pc['value']):
            bad.append(u'"%s" on %s not as expected' % (pc['name'], pc.get('label', u'')))
    return bad


def _sync(doc, comment):
    """Sync + give back everything borrowed. ACC cloud models REQUIRE the local copy to be saved before and
    after the sync (Revit refuses otherwise), so both are on."""
    if doc.IsWorkshared:
        twc = DB.TransactWithCentralOptions()
        swc = DB.SynchronizeWithCentralOptions()
        swc.SetRelinquishOptions(DB.RelinquishOptions(True))
        swc.Comment = comment
        try:
            swc.SaveLocalBefore = True         # mandatory for cloud (server-based) models
            swc.SaveLocalAfter = True          # local matches central again after a good sync
        except Exception:
            pass
        doc.SynchronizeWithCentral(twc, swc)
    else:
        doc.Save()


def touched_ids(changes):
    ids = set(int(i) for i in changes.get('edit_revisions', {}))
    ids |= set(pc['element_id'] for pc in changes.get('params', []))
    ids |= set(int(s) for s in changes.get('sheet_ids', []))
    ids |= set(int(tc['instance_id']) for tc in changes.get('tb_types', []))
    ids |= set(int(dc['id']) for dc in changes.get('delete_clouds', []))
    return ids


def apply_changes(app, rec, changes, settings, comment, after=None):
    """Open your local copy, check ownership, apply in one transaction, verify, sync + relinquish, close.
    Nothing reaches the central model unless every step succeeds.
    after(doc) (optional) reads fresh data from the same open model, so no second open is needed.
    Returns (ok, log lines, undo record, after-result)."""
    log = []
    doc = _open_for_edit(app, rec, settings)
    try:
        with StrictRevit(app, log):
            if not doc.IsWorkshared and not settings.get('allow_non_workshared'):
                raise ApplyError(u'Not workshared - changes would be saved straight into the model. '
                                 u'Allow non-workshared models in the Run tab only if nobody has it open.')
            ids = touched_ids(changes)
            for lf in changes.get('load_families', []):     # updating a family: nobody else may own it
                ids |= set(eid_int(f.Id) for f in _families_named(doc, lf['name']))
            if changes.get('numbering'):
                try:
                    ids.add(eid_int(DB.RevisionSettings.GetRevisionSettings(doc).Id))
                except Exception:
                    pass
            owned = _owned_by_others(doc, ids)
            if owned:
                raise ApplyError(u'Owned by other users (ask them to sync and relinquish): ' + u'; '.join(owned))
            snap = _snapshot(doc, changes)
            created = _apply_in_doc(doc, changes, log)
            bad = _verify(doc, changes, created)
            if bad:
                raise ApplyError(u'Check after the change failed - NOT synced, nothing saved: ' + u'; '.join(bad))
            try:
                _sync(doc, comment)
            except Exception as e:
                # the local copy may already be saved WITH the change: keep the undo record and say so plainly
                undo = {'model': rec, 'when': core.now(), 'before': snap, 'created': created, 'changes': changes,
                        'sync_failed': True}
                try:
                    uf = save_undo(undo)
                except Exception:
                    uf = u'(undo record could not be saved)'
                raise ApplyError(u'SYNC FAILED: %s\n\nThe change is NOT in the ACC model. Your LOCAL copy may hold it '
                                 u'(saved before the sync). Open the model in Revit and Synchronize with Central to send '
                                 u'it, or use Revert last apply (undo record: %s).' % (core.text(e), uf))
            log.append(u'Synced with central (all borrowed elements given back)')
        undo = {'model': rec, 'when': core.now(), 'before': snap, 'created': created, 'changes': changes}
        fresh = None
        if after is not None:
            try:
                fresh = after(doc)
            except Exception:
                fresh = None
        return True, log, undo, fresh
    finally:
        try:
            doc.Close(False)            # after a good sync nothing is unsaved; on any failure this discards everything
        except Exception:
            pass


def save_undo(undo):
    core.ensure_dir(APPLY_DIR)
    p = os.path.join(APPLY_DIR, u'%s_%s.json' % (time.strftime('%Y%m%d_%H%M%S'), undo['model']['ModelGUID'][:8]))
    with io.open(p, 'w', encoding='utf-8') as f:
        f.write(core.text(json.dumps(undo, indent=1)))
    return p


def last_undo_files():
    if not os.path.isdir(APPLY_DIR):
        return []
    return sorted([os.path.join(APPLY_DIR, f) for f in os.listdir(APPLY_DIR) if f.endswith('.json')], reverse=True)


def revert(app, undo_file, settings):
    """Put back the old values of one Apply; delete the revisions it created if no sheet uses them."""
    with io.open(undo_file, 'r', encoding='utf-8') as f:
        undo = json.loads(f.read())
    before, created = undo['before'], undo.get('created', {})
    back = {'edit_revisions': dict((k, v) for k, v in before.get('revisions', {}).items()),
            'sheet_revisions': before.get('sheets', {}),
            'params': [p for p in before.get('params', []) if p.get('value') is not None],
            'tb_types': before.get('tb_types', []), 'numbering': before.get('numbering'),
            'create_clouds': before.get('clouds', []),
            'load_families': [{'path': f['backup'], 'name': f['name'], 'mode': 'update', 'overwrite': True}
                              for f in before.get('families', []) if f.get('mode') == 'update' and f.get('backup')],
            'delete_families': [f['name'] for f in before.get('families', []) if f.get('mode') == 'add'],
            'sheet_ids': undo['changes'].get('sheet_ids', [])}
    log = []
    doc = _open_for_edit(app, undo['model'], settings)
    strict = StrictRevit(app, log)
    strict.__enter__()
    try:
        owned = _owned_by_others(doc, touched_ids(back) | set(int(v) for v in created.values()))
        if owned:
            raise ApplyError(u'Owned by other users: ' + u'; '.join(owned))
        _apply_in_doc(doc, back, log)
        if created:
            t = Transaction(doc, 'Issue Sheets by Lew - revert')
            t.Start()
            used = set()
            for s in FilteredElementCollector(doc).OfClass(ViewSheet):
                used |= set(eid_int(i) for i in s.GetAllRevisionIds())
            for temp, rid in created.items():
                r = doc.GetElement(make_eid(rid))
                if r is not None and rid not in used and not r.Issued:
                    doc.Delete(make_eid(rid))
                    log.append(u'Removed the revision this Apply had added')
            t.Commit()
        bad = _verify(doc, back, {})
        if bad:
            raise ApplyError(u'Check after revert failed - NOT synced: ' + u'; '.join(bad))
        _sync(doc, u'Issue Sheets by Lew - revert')
        os.rename(undo_file, undo_file + u'.reverted')
        return True, log
    finally:
        strict.__exit__()
        try:
            doc.Close(False)
        except Exception:
            pass
