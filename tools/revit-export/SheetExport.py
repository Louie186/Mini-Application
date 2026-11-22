# =============================================================================
# SheetExport.py  -  Dynamo Python Script node for Revit 2025 (CPython3 engine)
# -----------------------------------------------------------------------------
# Exports ONLY the sheets listed in a drawing list (CSV) from the OPEN model,
# to PDF and/or DWG, with your own file-naming rule. Writes a CSV log.
#
# Node inputs (in this order):
#   IN[0]  Drawing list (.csv)         File Path node
#   IN[1]  Output folder               Directory Path node
#   IN[2]  Naming rule                 String, e.g. {SheetNumber}_{SheetName}
#   IN[3]  DWG export setup name       String, blank = Revit default
#   IN[4]  PDF export setup name       String, blank = Revit default
#   IN[5]  Export?                     Boolean: False = DRY RUN, True = export
#
# Drawing list columns (first row = headers, any order, not case-sensitive).
# Your LOD can be used directly (save it as CSV UTF-8):
#   Drawing Number  e.g. 5013-KEO-T1-ZZ-PLN-INT-10100-T1   (or SheetNumber)
#                   The Revit sheet is found by: full number, else the 7th
#                   field (sequence, 10100), else the second-to-last field.
#   SheetName/Title (optional - warns if it differs from Revit)
#   Model           (optional - rows for other models are ignored)
#   Revision        (optional - else the last field of the drawing number)
#   PDF, DWG        (optional - Y/N; a missing column means Y)
#
# Naming rule tokens:
#   {DrawingNumber}   full number from the list (e.g. 5013-KEO-...-10100-T1)
#   {ListRevision}    revision from the list
#   {SheetNumber} {SheetName} {Revision} {Model} {Date}   (from Revit)
#   {P:Any Sheet Parameter}      e.g. {P:Drawing Status}
#   {Project:Any Project Info}   e.g. {Project:Project Number}
# A warning is logged when the list revision and the Revit revision differ.
#
# Output:  <Output folder>\<Model>\PDF\  and  <Output folder>\<Model>\DWG\
# Log:     <Output folder>\SheetExport_log.csv
# =============================================================================

import clr
import os
import re
import csv
import time
import datetime

clr.AddReference('RevitAPI')
from Autodesk.Revit.DB import (FilteredElementCollector, ViewSheet, ElementId,
                               BuiltInParameter, PDFExportOptions,
                               DWGExportOptions, ExportPDFSettings)
import Autodesk.Revit.DB as DB

clr.AddReference('RevitServices')
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

from System.Collections.Generic import List

doc = DocumentManager.Instance.CurrentDBDocument


# ---------------------------------------------------------------- inputs --
def arg(i, default):
    try:
        v = IN[i]
    except IndexError:
        return default
    if v is None:
        return default
    if isinstance(v, str) and v.strip() == "":
        return default
    return v


LIST_PATH = arg(0, None)
OUT_DIR = arg(1, None)
NAMING = arg(2, "{DrawingNumber}")
DWG_SETUP = str(arg(3, "")).strip()
PDF_SETUP = str(arg(4, "")).strip()
DO_EXPORT = bool(arg(5, False))
MODE = "EXPORT" if DO_EXPORT else "DRYRUN"

MODEL = re.sub(r'\.rvt$', '', doc.Title, flags=re.I)
try:                                     # local copies are titled "<Model>_<username>"
    _user = doc.Application.Username or ""
    if _user and MODEL.lower().endswith("_" + _user.lower()):
        MODEL = MODEL[:-(len(_user) + 1)]
except Exception:
    pass

LOG_HEADER = ["Timestamp", "Mode", "Model", "ListedNumber", "SheetName",
              "Revision", "Format", "File", "Status", "Seconds", "Note"]


# --------------------------------------------------------------- helpers --
def now():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def key(s):
    return (s or "").strip().lower().replace(" ", "").replace("_", "")


def yes(v):
    return (v or "").strip().lower() in ("y", "yes", "1", "true", "x")


def clean(name):
    name = re.sub(r'[\\/:*?"<>|]', '-', name)
    name = re.sub(r'\s+', ' ', name)
    name = re.sub(r'([-_.])\1+', r'\1', name)        # "--" left by an empty token -> "-"
    name = re.sub(r'\s*([-_])\s*([-_])\s*', r'\1', name)
    return name.strip(' -_.')


# other column names people use, mapped to the names this script needs
ALIASES = {
    "drawingnumber": "drawingnumber", "drawingno": "drawingnumber", "drawingno.": "drawingnumber",
    "dwgno": "drawingnumber", "dwgno.": "drawingnumber", "documentnumber": "drawingnumber",
    "documentno": "drawingnumber", "docno": "drawingnumber", "docno.": "drawingnumber",
    "sheetno": "sheetnumber", "sheetno.": "sheetnumber",
    "title": "sheetname", "drawingtitle": "sheetname", "drawingname": "sheetname",
    "modelname": "model", "revitmodel": "model",
    "rev": "revision", "rev.": "revision",
}


def read_list(path):
    data = None
    for enc in ("utf-8-sig", "mbcs", "cp1252"):
        try:
            with open(path, newline='', encoding=enc) as f:
                data = f.read()
            break
        except (UnicodeDecodeError, LookupError):
            continue
    if data is None:
        raise Exception("Cannot read the drawing list (save it as CSV UTF-8).")
    first = data.splitlines()[0] if data else ""
    delim = ';' if first.count(';') > first.count(',') else ','
    rows = []
    for r in csv.DictReader(data.splitlines(), delimiter=delim):
        row = {}
        for k, v in r.items():
            if k:
                kk = key(k)
                row[ALIASES.get(kk, kk)] = (v or "").strip()
        rows.append(row)
    return rows


def lod_parts(number):
    """5013-KEO-T1-ZZ-PLN-INT-10100-T1 -> ['5013','KEO',...,'10100','T1']"""
    return [p.strip() for p in (number or "").split("-")]


def find_sheet(row, sheets):
    """Return (sheet, matched_on). Tries SheetNumber, then the full LOD number,
    then the sequence (7th field), then the second-to-last field."""
    cands = []
    if row.get("sheetnumber"):
        cands.append(row["sheetnumber"])
    dn = row.get("drawingnumber", "")
    if dn:
        parts = lod_parts(dn)
        cands.append(dn)
        if len(parts) >= 7:
            cands.append(parts[6])
        if len(parts) >= 2:
            cands.append(parts[-2])
    for c in cands:
        s = sheets.get(c.strip().lower())
        if s is not None:
            return s, c
    return None, (cands[0] if cands else "")


def list_revision(row):
    """Revision from a Revision column, else the last field of the LOD number."""
    if row.get("revision"):
        return row["revision"]
    parts = lod_parts(row.get("drawingnumber", ""))
    return parts[-1] if len(parts) >= 8 else ""


def model_matches(cell):
    if not cell:
        return True
    m = re.sub(r'\.rvt$', '', cell.strip(), flags=re.I).lower()
    t = MODEL.lower()
    return t == m or t.startswith(m + "_")      # local copies get "_username"


def param_text(el, name):
    p = el.LookupParameter(name)
    if p is None:
        return None
    return p.AsString() or p.AsValueString() or ""


def make_name(sheet, rule, row):
    rev = sheet.get_Parameter(BuiltInParameter.SHEET_CURRENT_REVISION)
    vals = {
        "sheetnumber": sheet.SheetNumber,
        "sheetname": sheet.Name,
        "revision": (rev.AsString() if rev else "") or "",
        "model": MODEL,
        "date": datetime.date.today().strftime("%Y%m%d"),
        # from the drawing list / LOD row
        "drawingnumber": row.get("drawingnumber") or sheet.SheetNumber,
        "listrevision": list_revision(row),
    }
    missing = []

    def rep(m):
        token = m.group(1).strip()
        k = key(token)
        if k in vals:
            return vals[k]
        low = token.lower()
        if low.startswith("p:"):
            v = param_text(sheet, token[2:].strip())
        elif low.startswith("project:"):
            v = param_text(doc.ProjectInformation, token[8:].strip())
        else:
            v = None
        if v is None:
            missing.append(token)
            return ""
        return v

    return clean(re.sub(r'\{([^}]+)\}', rep, rule)), missing


def write_log(rows):
    path = os.path.join(OUT_DIR, "SheetExport_log.csv")
    new = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8-sig" if new else "utf-8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(LOG_HEADER)
        for r in rows:
            w.writerow(r)


def pdf_base_options(notes):
    opts = None
    if PDF_SETUP:
        for s in FilteredElementCollector(doc).OfClass(ExportPDFSettings):
            if s.Name == PDF_SETUP:
                opts = s.GetOptions()
                break
        if opts is None:
            notes.append("PDF setup '%s' not found - Revit defaults used" % PDF_SETUP)
    if opts is None:
        opts = PDFExportOptions()
        for prop, val in (("HideCropBoundaries", True), ("HideScopeBoxes", True),
                          ("HideReferencePlane", True), ("HideUnreferencedViewTags", True)):
            try:
                setattr(opts, prop, val)
            except Exception:
                pass
    opts.Combine = True          # one call = one sheet = one file with our name
    return opts


def dwg_options(notes):
    opts = None
    if DWG_SETUP:
        opts = DWGExportOptions.GetPredefinedOptions(doc, DWG_SETUP)
        if opts is None:
            notes.append("DWG setup '%s' not found - Revit defaults used" % DWG_SETUP)
    if opts is None:
        opts = DWGExportOptions()
    opts.MergedViews = True      # one DWG per sheet, views not as separate xrefs
    try:
        opts.FileVersion = DB.ACADVersion.R2018
    except Exception:
        pass
    return opts


def remove_if_exists(p):
    if os.path.exists(p):
        os.remove(p)


# ------------------------------------------------------------------ main --
def main():
    if doc.IsFamilyDocument:
        return ["Open a project model, not a family."]
    if not LIST_PATH or not os.path.isfile(str(LIST_PATH)):
        return ["IN[0]: pick the drawing list CSV."]
    if not OUT_DIR:
        return ["IN[1]: pick the output folder."]
    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)

    notes = []
    rows = read_list(str(LIST_PATH))
    if not rows or ("sheetnumber" not in rows[0] and "drawingnumber" not in rows[0]):
        return ["Drawing list needs a 'SheetNumber' or 'Drawing Number' column."]
    has_model_col = "model" in rows[0]

    sheets = {}
    for s in FilteredElementCollector(doc).OfClass(ViewSheet):
        sheets.setdefault(s.SheetNumber.strip().lower(), s)

    mine = [r for r in rows if model_matches(r.get("model", ""))]
    other = len(rows) - len(mine)

    pdf_dir = os.path.join(OUT_DIR, clean(MODEL), "PDF")
    dwg_dir = os.path.join(OUT_DIR, clean(MODEL), "DWG")
    pdf_opts = pdf_base_options(notes) if DO_EXPORT else None
    dwg_opts = dwg_options(notes) if DO_EXPORT else None
    if DO_EXPORT:
        for d in (pdf_dir, dwg_dir):
            if not os.path.isdir(d):
                os.makedirs(d)
        TransactionManager.Instance.ForceCloseTransaction()   # export must run outside a transaction

    log = []
    seen = set()
    counts = {"ok": 0, "failed": 0, "notfound": 0, "would": 0, "othermodel": 0}

    for r in mine:
        listed = (r.get("drawingnumber") or r.get("sheetnumber") or "").strip()
        if not listed:
            continue
        if listed.lower() in seen:
            log.append([now(), MODE, MODEL, listed, r.get("sheetname", ""), "", "", "", "SKIPPED", "", "Listed twice"])
            continue
        seen.add(listed.lower())

        sheet, matched = find_sheet(r, sheets)
        if sheet is None:
            if has_model_col:
                counts["notfound"] += 1
                log.append([now(), MODE, MODEL, listed, r.get("sheetname", ""), "", "", "", "NOT_FOUND", "",
                            "Sheet '%s' not in this model" % matched])
            else:
                counts["othermodel"] += 1
                log.append([now(), MODE, MODEL, listed, r.get("sheetname", ""), "", "", "", "NOT_IN_THIS_MODEL", "",
                            "No Model column - probably in another model"])
            continue
        num = listed

        note = []
        if sheet.IsPlaceholder:
            log.append([now(), MODE, MODEL, num, sheet.Name, "", "", "", "SKIPPED", "", "Placeholder sheet - nothing to print"])
            continue
        listed_name = r.get("sheetname", "")
        if listed_name and listed_name.strip().lower() != sheet.Name.strip().lower():
            note.append("Name differs from list: '%s'" % listed_name)

        name, missing = make_name(sheet, NAMING, r)
        if missing:
            note.append("Unknown token(s): " + ", ".join(missing))
        if not name:
            name = clean(sheet.SheetNumber)
            note.append("Naming rule gave an empty name - used sheet number")
        rev = sheet.get_Parameter(BuiltInParameter.SHEET_CURRENT_REVISION)
        rev = (rev.AsString() if rev else "") or ""
        lrev = list_revision(r)
        if lrev and rev and lrev.strip().lower() != rev.strip().lower():
            note.append("Revision differs: list %s, Revit %s" % (lrev, rev))
        elif lrev and not rev:
            note.append("List has revision %s, Revit sheet has none" % lrev)

        formats = []
        if "pdf" not in r or yes(r.get("pdf")):
            formats.append("PDF")
        if "dwg" not in r or yes(r.get("dwg")):
            formats.append("DWG")

        for fmt in formats:
            folder = pdf_dir if fmt == "PDF" else dwg_dir
            target = os.path.join(folder, name + "." + fmt.lower())
            if not DO_EXPORT:
                counts["would"] += 1
                log.append([now(), MODE, MODEL, num, sheet.Name, rev, fmt, target, "WOULD_EXPORT", "", "; ".join(note)])
                continue
            t0 = time.time()
            status, extra = "FAILED", ""
            try:
                remove_if_exists(target)
                ids = List[ElementId]([sheet.Id])
                if fmt == "PDF":
                    pdf_opts.FileName = name
                    doc.Export(folder, ids, pdf_opts)
                else:
                    doc.Export(folder, name, ids, dwg_opts)
                if os.path.exists(target):
                    status = "OK"
                else:
                    extra = "Revit reported no file"
            except Exception as e:
                extra = str(e)
            secs = "%.1f" % (time.time() - t0)
            counts["ok" if status == "OK" else "failed"] += 1
            log.append([now(), MODE, MODEL, num, sheet.Name, rev, fmt, target, status, secs,
                        "; ".join([n for n in note + [extra] if n])])

    write_log(log)

    summary = ["Model: " + MODEL,
               "Mode: " + ("EXPORT" if DO_EXPORT else "DRY RUN (nothing exported)"),
               "Sheets listed for this model: %d (other models ignored: %d)" % (len(seen), other),
               "Not found in model: %d" % counts["notfound"]]
    if counts["othermodel"]:
        summary.append("Not in this model (list has no Model column): %d" % counts["othermodel"])
    if DO_EXPORT:
        summary += ["Files exported: %d" % counts["ok"], "Files failed: %d" % counts["failed"]]
    else:
        summary += ["Files that would be exported: %d" % counts["would"]]
    summary += notes
    summary.append("Log: " + os.path.join(OUT_DIR, "SheetExport_log.csv"))
    return summary


try:
    OUT = main()
except Exception as e:
    import traceback
    OUT = ["ERROR: " + str(e), traceback.format_exc()]

OUT = ["Sheet Export ran at " + now()] + OUT

# Show the result in a Revit pop-up so it is obvious the script ran.
try:
    clr.AddReference('RevitAPIUI')
    from Autodesk.Revit.UI import TaskDialog
    TaskDialog.Show("Sheet Export", "\n".join(OUT[:12]))
except Exception:
    pass
