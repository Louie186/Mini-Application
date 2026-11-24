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


def _numbering_per_sheet(doc):
    try:
        rs = DB.RevisionSettings.GetRevisionSettings(doc)
        return _txt(rs.RevisionNumbering) == 'PerSheet'
    except Exception:
        return False


def read_issue_data(doc):
    """Everything the Issue window shows for one model (works with all worksets closed)."""
    revs = []
    rev_by_id = {}
    for rid in DB.Revision.GetAllRevisionIds(doc):
        r = doc.GetElement(rid)
        d = {'id': eid_int(rid), 'seq': r.SequenceNumber, 'number': _txt(r.RevisionNumber),
             'date': _txt(r.RevisionDate), 'description': _txt(r.Description), 'issued': bool(r.Issued),
             'issued_by': _txt(r.IssuedBy), 'issued_to': _txt(r.IssuedTo)}
        revs.append(d)
        rev_by_id[d['id']] = d
    sheets = {}
    tb_count = {}
    for s in FilteredElementCollector(doc).OfClass(ViewSheet):
        if s.IsPlaceholder:
            continue
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
        tb = None
        try:
            inst = FilteredElementCollector(doc, s.Id).OfCategory(BuiltInCategory.OST_TitleBlocks) \
                .WhereElementIsNotElementType().FirstElement()
            if inst is not None:
                sym = inst.Symbol
                tname = sym.get_Parameter(BuiltInParameter.SYMBOL_NAME_PARAM).AsString()
                tb = {'instance_id': eid_int(inst.Id), 'type_id': eid_int(sym.Id),
                      'family': _txt(sym.FamilyName), 'type': _txt(tname),
                      'instance_params': _yes_no_params(inst), 'type_params': _yes_no_params(sym)}
                tb_count[tb['type_id']] = tb_count.get(tb['type_id'], 0) + 1
        except Exception:
            pass
        sheets[s.SheetNumber] = {
            'id': eid_int(s.Id), 'name': _txt(s.Name), 'all_revs': all_ids, 'extra_revs': extra_ids,
            'cloud_revs': [i for i in all_ids if i not in extra_ids], 'current': cur,
            'current_number': on_sheet.get(cur, u'') if cur else u'',
            'current_date': rev_by_id.get(cur, {}).get('date', u'') if cur else u'',
            'numbers_on_sheet': dict((str(k), v) for k, v in on_sheet.items()), 'titleblock': tb}
    return {'version': model_version(doc), 'read_on': core.now(), 'revisions': revs,
            'per_sheet_numbering': _numbering_per_sheet(doc), 'sheets': sheets,
            'titleblock_type_count': dict((str(k), v) for k, v in tb_count.items())}


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


# ------------------------------------------------------- apply / revert --
class ApplyError(Exception):
    pass


def _open_for_edit(app, rec, settings):
    """A normal LOCAL copy (not detached), all user worksets closed: sheets, revisions and title blocks
    live on system worksets, so this is enough and fast."""
    if core.find_open_doc(app, rec['ModelGUID'].lower()) is not None:
        raise ApplyError(u'The model is open in this Revit window. Close it first, then Apply again.')
    errors = []
    for reg in core._regions(rec.get('Region') or settings.get('region')):
        try:
            path = ModelPathUtils.ConvertCloudGUIDsToCloudPath(reg, Guid(rec['ProjectGUID']), Guid(rec['ModelGUID']))
            opts = OpenOptions()
            opts.DetachFromCentralOption = DetachFromCentralOption.DoNotDetach
            opts.SetOpenWorksetsConfiguration(WorksetConfiguration(WorksetConfigurationOption.CloseAllWorksets))
            return core._open(app, path, opts)
        except Exception as e:
            msg = core.text(e)
            errors.append(u'%s: %s' % (reg, u'not found in this region' if 'central model is missing' in msg.lower() else msg))
    raise ApplyError(u'Could not open: ' + u' | '.join(errors))


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


def _snapshot(doc, changes):
    """Old values of everything the changes touch (for verification and Revert)."""
    snap = {'revisions': {}, 'sheets': {}, 'params': []}
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
    return snap


def _apply_in_doc(doc, changes, log):
    """All changes in ONE transaction. Raises on any problem (Revit rolls everything back)."""
    sheets = dict((s.SheetNumber, s) for s in FilteredElementCollector(doc).OfClass(ViewSheet))
    created = {}
    t = Transaction(doc, 'Issue Sheets by Lew')
    t.Start()
    try:
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
                raise ApplyError(u'Revision %s is marked Issued - Revit locks it' % r.RevisionNumber)
            for key, prop in (('date', 'RevisionDate'), ('description', 'Description'),
                              ('issued_by', 'IssuedBy'), ('issued_to', 'IssuedTo')):
                if key in vals:
                    setattr(r, prop, vals[key])
            log.append(u'Revision %s edited' % r.RevisionNumber)
        for num, ids in changes.get('sheet_revisions', {}).items():
            s = sheets.get(num)
            if s is None:
                raise ApplyError(u'Sheet %s not found' % num)
            real = [created[i] if i in created else int(i) for i in ids]
            s.SetAdditionalRevisionIds(List[ElementId]([make_eid(i) for i in real]))
            log.append(u'Sheet %s: revisions set' % num)
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
    for pc in changes.get('params', []):
        p = doc.GetElement(make_eid(pc['element_id'])).LookupParameter(pc['name'])
        if p is None or (p.AsInteger() == 1) != bool(pc['value']):
            bad.append(u'"%s" on %s not as expected' % (pc['name'], pc.get('label', u'')))
    return bad


def _sync(doc, comment):
    if doc.IsWorkshared:
        twc = DB.TransactWithCentralOptions()
        swc = DB.SynchronizeWithCentralOptions()
        swc.SetRelinquishOptions(DB.RelinquishOptions(True))
        swc.Comment = comment
        doc.SynchronizeWithCentral(twc, swc)
    else:
        doc.Save()


def touched_ids(changes):
    ids = set(int(i) for i in changes.get('edit_revisions', {}))
    ids |= set(pc['element_id'] for pc in changes.get('params', []))
    ids |= set(int(s) for s in changes.get('sheet_ids', []))
    return ids


def apply_changes(app, rec, changes, settings, comment):
    """Open a local copy, check ownership, apply in one transaction, verify, sync + relinquish, close.
    Nothing reaches the central model unless every step succeeds. Returns (ok, log lines, undo record)."""
    log = []
    doc = _open_for_edit(app, rec, settings)
    try:
        if not doc.IsWorkshared and not settings.get('allow_non_workshared'):
            raise ApplyError(u'Not workshared - changes would be saved straight into the model. '
                             u'Allow non-workshared models in the Run tab only if nobody has it open.')
        owned = _owned_by_others(doc, touched_ids(changes))
        if owned:
            raise ApplyError(u'Owned by other users (ask them to sync and relinquish): ' + u'; '.join(owned))
        snap = _snapshot(doc, changes)
        created = _apply_in_doc(doc, changes, log)
        bad = _verify(doc, changes, created)
        if bad:
            raise ApplyError(u'Check after the change failed - NOT synced, nothing saved: ' + u'; '.join(bad))
        _sync(doc, comment)
        log.append(u'Synced with central (all borrowed elements given back)')
        undo = {'model': rec, 'when': core.now(), 'before': snap, 'created': created, 'changes': changes}
        return True, log, undo
    finally:
        try:
            doc.Close(False)            # after a sync there is nothing unsaved; on failure this discards everything
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
            'sheet_ids': undo['changes'].get('sheet_ids', [])}
    log = []
    doc = _open_for_edit(app, undo['model'], settings)
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
        try:
            doc.Close(False)
        except Exception:
            pass
