# BIM Export by Lew: handover

**One button in Revit that exports chosen drawings from many ACC cloud models to PDF + DWG, then embeds the logos in the DWGs with AutoCAD.**

- **Owner:** Lew (Senior BIM Technician, construction & design consultancy)
- **Status:** working in real Revit 2025 for export. Logo embedding and the latest speed changes are built but **not yet confirmed on the real project**
- **Version:** v7.0 = Export Sheets v6.2 + **new Issue Sheets button** (branch `claude/epic-gates-3468ux`)
- **Source of truth:** this repo, `tools/pyrevit/` (pyRevit extension) and `tools/img2ole/` (AutoCAD logo tool)

> For a new conversation: read this file first, then `docs/sheet-export-plan.md` (history and decisions), then the code. The user prefers **bullet points, plain English, short answers, step-by-step instructions**.

---

## 1. What it does (the user's view)

- **Revit → BIMExport tab → Export Sheets.** One window, three panels:
  - **1 Models:** ACC cloud models known on this PC (tick 5–10 per Revit window). **Load drawings** reads each new model once (quick open, no links), then it's instant
  - **2 Drawings:** a tree per model: **model → sheet browser folders → drawings**. A **Browser** drop-down per model lists that model's sheet **Browser Organizations** (e.g. Sheet Discipline, Sheet Size). Tick folders or single drawings. Search, Tick all, Clear, Expand, Collapse, **Tick from LOD...** (CSV)
  - **3 Settings:** tabs **Output** (folder, one folder per model, PDF/DWG, file name rule) · **PDF** (setup drop-down from the models + all page settings) · **CAD** (DWG setup drop-down from the models + main values) · **Run** (embed logos, share with other Revit windows, skip link worksets, allow non-workshared)
  - Panels are resizable (draggable dividers, widths remembered)
- **Dry run:** instant, from the saved drawing lists. Opens nothing
- **Export:** a confirmation lists the models and reminds you to close them in other Revit windows. Then:
  - A **progress window** (own thread, animated): every model with its status and time, the current model's drawings with **PDF / DWG status per drawing**, elapsed clock, Cancel (stops after the current file)
  - At the end it becomes a **result window** (Open folder, Close) and **follows the logo step** ("Logos: 4 of 11 embedded" → "✔ Logos embedded in all 11")
- **Embed Logos** button: run or re-run the logo step on an export folder, and see the last result per drawing
- **Branding:** "by Lew" in the window headers, small "Lew" badge on both icons, `__author__ = 'Lew'`

---

## 2. Files

### pyRevit extension (`tools/pyrevit/BIMExport.extension/`)

| File | Lines | Role |
|---|---|---|
| `lib/bimexport_core.py` | ~1320 | All logic without UI: settings, CSV, register, cache discovery, model opening, sheet lists, browser orgs, export setups, PDF/DWG options, export, queue, AutoCAD helpers |
| `BIMExport.tab/Sheets.panel/Export Sheets.pushbutton/script.py` | ~1300 | Main button: model access, `ExportWindow`, `ProgressWindow` + `ProgressUI` (thread), export loop, shared queue, report |
| `.../Export Sheets.pushbutton/ExportWindow.xaml` | ~330 | Main window (WPF) |
| `.../Export Sheets.pushbutton/ProgressWindow.xaml` | ~130 | Progress / result window (WPF), spinner storyboard |
| `.../Export Sheets.pushbutton/icon.png` | | Icon with Lew badge |
| `.../Embed Logos.pushbutton/script.py` + `icon.png` | ~100 | Logo step on demand + last result summary |
| `img2ole/IMG2OLE.lsp`, `img2ole/IMG2OLE_clip.ps1` | | **Bundled copy** of the AutoCAD logo tool (keep in sync with `tools/img2ole/` when packaging) |
| `tools/pyrevit/README.md` | | User guide (install, use, safety, speed) |

### AutoCAD logo tool (`tools/img2ole/`, source)

| File | Role |
|---|---|
| `IMG2OLE.lsp` | AutoLISP: finds every raster IMAGE (model, layouts, all blocks incl. nested), replaces it with an embedded OLE picture at the same corner/size/rotation/layer/draw order, removes the image definition, logs to CSV. Commands `IMG2OLE1` (current drawing), `IMG2OLE` (batch). Entry points `i2o:process-file`, `i2o:batch`, `i2o:batch-file` |
| `IMG2OLE_clip.ps1` | Puts a picture on the clipboard as **Enhanced Metafile** (same as DiRoots) or DIB, transparent areas filled white |
| `Invoke-Img2OleDryRun.ps1` | Headless dry run with AutoCAD Core Console (for an AI agent) |
| `README.md` | User guide |

### Older / other

- `tools/revit-export/`: the first **Dynamo** single-model version (`SheetExport.dyn`, `SheetExport.py`). Superseded by pyRevit but still works for one open model
- `docs/sheet-export-plan.md`: full plan, findings and decisions history
- `LewsToolboxHTA/`: Lew's Toolbox (HTA). **The user has a newer version** than this repo (uploaded 2026-11-24, has Diary, Smart Inbox, lt-transmittal.js, lt-refs.js, lt-taskfolder.js). Not yet merged

### Packaging (how zips were made)

- Copy `tools/img2ole/IMG2OLE.lsp` + `IMG2OLE_clip.ps1` into `tools/pyrevit/BIMExport.extension/img2ole/`
- Zip `tools/pyrevit/**` (skip `__pycache__`) as `BIMTools/pyrevit/...`
- User installs by replacing `%APPDATA%\pyRevit\Extensions\BIMExport.extension` (user's PC: `C:\Users\F265\AppData\Roaming\pyRevit\Extensions\`), then **pyRevit → Reload**

---

## 3. How it works inside

### 3.1 Model list (no typing of IDs)

- Revit API can't browse ACC. The list comes from Revit's local cloud cache:
  `%LOCALAPPDATA%\Autodesk\Revit\Autodesk Revit <ver>\CollaborationCache\<user>\<projectGUID>\<modelGUID>.rvt`
- Names come from `BasicFileInfo.Extract(file).CentralPath`, and are updated from `doc.Title` whenever a model opens
- Saved in `%APPDATA%\BIMExport\ModelRegister.csv` (Name, Project, Region, ProjectGUID, ModelGUID, LastSeen)
- **Limit:** models never opened on this PC aren't listed. Full ACC browsing would need **APS (Autodesk Platform Services)** with admin setup (not built)
- WPF hides `_` in plain checkbox text, so all labels use `TextBlock` content (`plain_text()`)

### 3.2 Opening a cloud model (`core.open_cloud_model`)

- Path: `ModelPathUtils.ConvertCloudGUIDsToCloudPath(region, projectGuid, modelGuid)`
- Tries the saved/learned region first (this project: **US**), then EMEA, AUS. "The central model is missing" in a region = **not in that region**
- **Workshared:** `DetachFromCentralOption.DetachAndPreserveWorksets`, worksets per mode:
  - `'none'`: all worksets closed (**quick open** for reading drawing lists, no links load)
  - `'all'`: every workset (default for export)
  - `'skip'`: all except worksets matching a pattern (default `*Link*`), using `WorksharingUtils.GetUserWorksetInfo` → **links not loaded**
- **Not workshared** ("Detach option is not valid for cloud model"): **refused by default**. Only opened normally if `allow_non_workshared` is ticked
- `DefaultOpenFromCloudCallback` when available
- Model already open in the same Revit window: used as is, left open, report says so
- **Always closed with `doc.Close(False)`**. Never saved, never synced, no transactions
- `QuietRevit`: auto-closes Revit dialogs and deletes warnings during the run
- `check_links(doc, reload_links)`: reloads unloaded links unless links were skipped on purpose

### 3.3 Drawing lists (saved per model)

- `core.read_sheet_list(doc, rule)` → saved as `%APPDATA%\BIMExport\sheets\<modelGUID>.json` (one file per model so parallel windows don't clash; older single `SheetCache.json` still read):
  - `sheets`: number, name, current revision, params needed by the naming rule
  - `orgs`: `{browser organization name: {sheet number: [folder, subfolder…]}}` (`BrowserOrganization` of type Sheets, `GetFolderItems`, `AreFiltersSatisfied`)
  - `current_org`, `project` params, `updated`
  - `setups`: `{'pdf': {name: values + 'naming'}, 'dwg': {name: values}}` from `ExportPDFSettings` / `ExportDWGSettings`
- A model needs re-reading if its entry lacks `orgs` or `setups` (`needs_scan`)
- Every export refreshes the model's entry

### 3.4 Naming

- Tokens: `{SheetNumber} {SheetName} {Revision} {Model} {Date} {DrawingNumber} {ListRevision} {P:Sheet Param} {Project:Project Param}`
- `{DrawingNumber}` = the LOD number if the drawing came from a LOD/CSV, else the sheet number
- **"Use this setup's file naming"** (PDF tab) converts a Revit PDF setup's naming rule (`PDFExportOptions.GetNamingRule()`) into tokens, e.g. `{Project:Project Number}-{P:Originator}-…-{SheetNumber}-{Revision}`
- Project numbering: `PROJECT-ORIGINATOR-FUNCTIONAL-SPATIAL/LEVEL-TYPE-DISCIPLINE-SEQUENCE-REVISION`, e.g. `5013-KEO-T1-ZZ-PLN-INT-10100-T1`. The Revit sheet number is the **sequence** (`10100`). LOD matching tries: full number, 7th field, second-to-last field
- `clean()`: invalid Windows characters → `-`, no doubled separators from empty tokens
- Before export: duplicate target file names are blocked

### 3.5 Export settings

- `settings['pdf']`: setup, paper, orientation, placement, offset_x/y, zoom, zoom_pct, raster_quality, colors, processing (Vector/Raster), links_blue, hide_ref_planes, hide_unref_tags, mask_coincident, hide_scope, hide_crop, halftone_thin
- `settings['dwg']`: setup, version, layers (AIA/ISO13567/CP83/BS1192), colors, merged_views, shared_coords, units
- **A setup chosen in the window:** each model uses **its own copy** of that setup. A model without it gets the same values (copied into the window). Controls are greyed out (read-only) while a setup is chosen
- PDF: one call per sheet, `Combine = True`, `FileName = name` → one file with our name
- DWG: `doc.Export(folder, name, ids, DWGExportOptions)`. Default: merged views (one DWG per sheet), AutoCAD 2018

### 3.6 Output layout

```
<Output>\
  SheetExport_log.csv                 one row per file (or a dated copy if the log is open in Excel)
  <Model>\                            ("One folder per model"; off = everything in <Output>)
    PDF\        <name>.pdf
    _DWG_raw\   Revit's DWG + logo PNGs (input for IMG2OLE)
    DWG\        final DWGs with embedded logos (made by AutoCAD)
  IMG2OLE_files.csv / IMG2OLE_images.csv   logo logs
  IMG2OLE_jobs.txt / IMG2OLE_start.scr / IMG2OLE_batch.scr
  _queue\                             only for shared exports
```

### 3.7 Speed

- Drawing lists: quick open (`'none'` worksets), once per model, then instant
- Export: each model opened once. Optional "don't load linked models" (`'skip'`)
- Region learned after the first open
- **Shared export:** several Revit windows. Queue = one file per model in `<Output>\_queue\`, claimed by atomic rename (`.todo` → `.taken_<pid>` → `.done`). Pointer `%APPDATA%\BIMExport\active_queue.txt`. Other windows: Export Sheets → **Join**. The last window to finish starts the logo step once (`logos.pending` → `logos.started`)
- The user has **64 GB RAM**: 2–3 Revit windows are fine

### 3.8 Progress window

- `ProgressUI` runs `ProgressWindow` on its **own STA thread** (`Dispatcher.Run`), so the spinner, the moving bar and the clock work while Revit is busy. Calls are forwarded with `Dispatcher.BeginInvoke`. Shared brushes are **frozen**
- Fallback: same-thread window with manual pumping if the thread can't start
- `core.export_model(progress=...)` calls `progress(i, n, fmt, num, None)` before and `(…, 'OK'|'FAILED')` after each file. Returning `False` = Cancel
- After the export: a `DispatcherTimer` reads `IMG2OLE_files.csv` every 3 s to show logo progress

### 3.9 Logos (AutoCAD)

- Background: Revit's DWG export keeps logos as **linked** images (PNG files next to the DWG). DiRoots embeds them as **OLE "Picture (Enhanced Metafile)", Static**, inside the title block block (confirmed in AutoCAD from the user's samples)
- `core.start_img2ole`:
  - Writes `IMG2OLE_jobs.txt` (`raw dwg|final folder`, ANSI) and `IMG2OLE_start.scr`
  - Starts `acad.exe /nologo /b IMG2OLE_start.scr`
  - The script sets `IMG2OLE_HOME`, loads the LSP and calls `i2o:batch-file`
- IMG2OLE copies each raw DWG to its final folder, opens it in AutoCAD, puts the PNG on the clipboard (PowerShell helper), runs `PASTECLIP` once per picture file, copies the OLE into each owner block, fits it to the image, keeps the draw order, deletes the image and its definition, saves, closes
- Skips and logs: clipped, mirrored, skewed or 3D images, and missing PNGs
- **Pre-check** (`autocad_ready`) before an export with logos, and in Embed Logos:
  - Finds IMG2OLE (bundled) and AutoCAD
  - Offers a one-time **Trusted Locations** setup: writes `TRUSTEDPATHS` in `HKCU\Software\Autodesk\AutoCAD\<ver>\<prod>\Profiles\<profile>\Variables` (creates the key; AutoCAD must be closed)
  - If no profile is found: clipboard + manual steps, or AutoCAD's **"Always Load"**
- Needs **full AutoCAD** (user has it), on screen, clipboard. Not Core Console. One drawing at a time

---

## 4. Safety rules (agreed with the user)

- Never save, never sync, never modify a model. Read and export only
- Workshared models open **detached**. Non-workshared ones are skipped unless allowed
- Export confirmation reminds the user to close the models in other Revit windows (the user had sync problems before when the same model was open twice)
- Original DWGs are never overwritten by IMG2OLE (it works on copies in `DWG\`)
- **Desktop Connector opening was tried and rejected:** it downloads a copy, and **links are lost**
- **DiRoots is not used by the tool** (it can't be scripted). The user still owns it

---

## 5. Settings and data on the user's PC

- `%APPDATA%\BIMExport\settings.json`: naming_rule, pdf{}, dwg{}, _formats, per_model_folder, embed, share, skip_links, link_pattern, allow_non_workshared, region, last_output, last_lod, acad_exe, img2ole_lsp, acad_trust_manual, col_models, col_settings, keep_open_max
- `%APPDATA%\BIMExport\ModelRegister.csv`, `sheets\*.json`, `active_queue.txt`

---

## 6. Testing status

| Part | Status |
|---|---|
| Window, model list, drawing tree, browser drop-down, settings tabs, resizing | ✅ Seen working in real Revit (user screenshots) |
| Export PDF/DWG from cloud models | ✅ Working in real Revit ("very good"), incl. progress window v5 |
| Non-workshared refusal / region learning | ✅ Behaviour confirmed by user tests (their test models are non-workshared: `21002_detached`, `Test model_detached`) |
| Threaded animated progress window (v6) | ⚠️ Not yet confirmed in real Revit |
| Logo step end-to-end | ❌ Not working yet for the user: first the IMG2OLE folder was missing (now bundled), then the registry check failed ("AutoCAD has no settings", fixed in v6.1, **not re-tested**) |
| IMG2OLE in AutoCAD | ⚠️ Never run in real AutoCAD. Risk points: `PASTECLIP` prompt behaviour, PowerShell blocked by IT, OLE sizing via ActiveX |
| Quick open for drawing lists, skip link worksets (v6.2) | ⚠️ Not yet tested in real Revit (`GetUserWorksetInfo` on cloud paths unverified) |
| Same model open in another Revit window while exporting detached | ⚠️ Expected safe, not proven. User is warned instead |

**Testing method used here:** Python syntax checks, XAML/XML checks, LISP bracket/structure checker, and full simulations of the button with fake Revit, WPF, threading and pyRevit modules (no Revit/AutoCAD in the cloud workspace).

---

## 7. Open items / next steps

- **Confirm the logo step in real AutoCAD** (v6.1/6.2): Trusted Locations setup, `PASTECLIP` → OLE, sizes, `XREF` shows no images, DWG opens without the PNGs
- Confirm v6.2 speed: quick open timing, skip-links mode
- **File naming:** the user should pick their PDF setup and click **"Use this setup's file naming"**, then check the result looks like `5013-KEO-T1-ZZ-PLN-INT-10100-T1`
- Possible: paste safety check in IMG2OLE (verify the pasted OLE is a picture, retry), scheduled overnight start, other export formats (IFC, NWC, images: "later")
- **Upgrades planned in a new conversation:** an "AI team" for repetitive Revit/AutoCAD tasks, connected to **Lew's Toolbox** (HTA). Idea discussed:
  - The Toolbox writes job files to a shared `jobs` folder
  - A pyRevit Job Runner and the AutoCAD scripts pick them up
  - Results come back to the Toolbox (Diary, transmittal)
  - Start with read-only jobs. Model-changing jobs only as "preview, then approve"
  - Open questions to the user: top 5 repetitive tasks; update the repo with the newer Toolbox; manual "Run jobs" vs automatic when Revit is idle

---

## 7b. Issue Sheets (v7.0, new button, untested in real Revit)

- Files: `Issue Sheets.pushbutton/script.py`, `IssueWindow.xaml`, `icon.png`; `lib/bimissue_core.py`; shared UI moved to `lib/bimexport_ui.py` (+ `lib/ProgressWindow.xaml`). Export Sheets still uses its own copy
- Agreed rules (2026-11-24):
  - **File names only** are corrected, never the model: MIDP code first 7 parts + **Revit's current revision** (MIDP revision/dates are not reliable). Uncertain = BLOCKED
  - Change check: model **sync stamp** (`Document.GetDocumentVersion` → NumberOfSaves) vs the stamp when that drawing was last printed, + revision change. Per-drawing file compare was proposed (not built)
  - Revisions shown like Revit (sequence, Revit's own numbering), tick per sheet updates current rev/date, **add revision** allowed
  - Title block: family/type per drawing, Yes/No params only (instance/type), type = all drawings of that type
  - Export quality: the user's full setups, edited manually (basic/fast setups rejected)
  - **Apply** (only revisions + Yes/No): local copy with all worksets closed, ownership check, one transaction, read back, sync + relinquish, close; undo log in `%APPDATA%\BIMExport\apply_logs`, Revert
  - **Issue register**: one CSV (`settings['issue_register']`, default `<output>\IssueRegister.csv`), one row per print, sorted by drawing then date. Columns: DrawingCode, Model, SheetNumber, SheetName, Revision, RevisionDate, RevisionDescription, PrintedOn, PrintedBy, Formats, PDFFile, DWGFile, Change, ModelVersion, Note
  - Saved sets: `%APPDATA%\BIMExport\IssueSets.json`
- Bug fixed at the same time: new `SheetExport_log.csv` files were written **without a header** (the "file open in Excel" check created an empty file first)
- v7.1 safety fixes for Apply/Revert: refuse while any other Revit process runs; open the local copy with `OpenLastViewed` worksets (printing still opens ALL worksets, detached); no automatic dialog clicking (`StrictRevit`: warnings accepted + logged, errors roll back); `SaveLocalBefore=False` / `SaveLocalAfter=True`; fresh data read from the same open after sync (no second open); issue register `.backup` before each rewrite
- v7.1 speed: logo **pipeline** for Issue Sheets: `IMG2OLE_runner.ps1` (bundled) takes `<out>\IMG2OLE_queue.txt` lines appended after each model, runs one AutoCAD per batch (`i2o:*quit-after*` makes the batch QUIT), stops on `IMG2OLE_queue.done`; lock/pos/log files in the logs folder (`_Logs` since v7.3); falls back to end-of-run start. Export Sheets still starts AutoCAD at the end
- v7.2 (user feedback): MIDP is optional (no MIDP = file named by sheet number); Issue Sheets has the same Output/PDF/CAD/Run tabs as Export Sheets (shared `ExportSettingsMixin` in `bimexport_ui.py`, a copy of the Export window code); Title blocks tab has a drawing drop-down + title block drop-down (all title blocks per sheet are read into `titleblocks`) + the revisions on that drawing; per-sheet revision numbering supported (`rev_number()` never calls `Revision.RevisionNumber` blindly)
- v7.3 (user feedback):
  - **Title block type change**: Title blocks tab → "Change to" (every title block type loaded in the model, with sheet size from SHEET_WIDTH/HEIGHT). "Change this drawing" or "Change all ticked" (same family/type name matched per model; sheets with 2+ title blocks skipped). Queued as `tb_types` → `FamilyInstance.ChangeTypeId` in the Apply transaction; "Keep Yes/No switches" copies same-named Yes/No instance params. Size-change warning (views are not moved). Snapshot/verify/Revert cover it
  - **AutoCAD closes the last file**: `i2o:close-batch-docs` + `i2o:close-self-if-batch` at the end of `i2o:finish` (QSAVE, then QUIT if `i2o:*quit-after*`, else CLOSE). Batch copies listed in `IMG2OLE_open.txt`
  - **All logs in `<out>\_Logs\`** (`core.logs_dir`): SheetExport_log.csv, IMG2OLE_* (files/images CSV, jobs, start scripts, queue/pos/done/lock, runner log, open list) and the shared-export `_queue\`. `img2ole_summary` still reads old-location files. Drawings and IssueRegister.csv stay in the export folder
- v7.4 (user found a PDF named `-T1` while the sheet showed T2: Export Sheets used the LOD's revision):
  - `make_name`: `{DrawingNumber}` = LOD code first 7 parts + `SHEET_CURRENT_REVISION` (code alone if the rule has its own `{Revision}`/`{ListRevision}`); new `{DrawingCode}`
  - `name_guard(sheet, name, rev)` in `export_model` for EVERY file (rule or Issue fixed name): name shaped `…-<sheet no>-<rev>` must have the live sheet revision, and any sheet text parameter shaped `<same code>-<rev>` must equal the name. Fail = `BLOCKED` log row + model note, counted as failed, nothing written
  - **Toolbox requests**: `LewsToolboxHTA/tabs/revitpull.html` writes `%APPDATA%\BIMExport\Requests\Toolbox_*.csv` (DrawingNumber, ExpectedRev, Title, Model, OutputFolder, Formats, RequestedOn). Issue Sheets `load_request` offers the newest, ticks models by name, sets folder/formats; `_load_midp` merges request codes (7+ parts) into the MIDP; `_tick_request` ticks drawings after Check; `issue.request_check` blocks rev mismatches; `request_result` writes `Requests\Done\<name>.result.csv` (PRINTED / FAILED / BLOCKED / NOT TICKED / NOT FOUND) and moves the request to Done. Tab test: `LewsToolboxHTA/tests/t13-revitpull.js`
- v7.5: Revisions tab **Numbering** combo (`numbering_cb`, pending `numbering` = PerSheet/PerProject → `RevisionSettings.RevisionNumbering` in the Apply transaction, snapshot/verify/revert, RevisionSettings id in the ownership check). Preview with `issue.predict_numbers`: per sheet = count per numbering sequence on that sheet (`nseq` + `sequences` read from `RevisionNumberingSequence` alphanumeric/numeric settings; fallback for old cache = per-project numbers grouped by their letters). `_current` shows Revit's own number when nothing changed
- v7.6: request **live status** `Requests\<name>.status.json` (`issue.request_status`: loaded / checking / ready / printing done-of-total / done) via `job['_on_progress']` hook in `ui._export_loop`; **Cancel**: Toolbox writes `<name>.cancel` (or moves a never-picked request to `Done\Cancelled`); hook returns 'cancel' → `pw.cancel_now()`; `drop_cancelled()` on next start; result statuses PARTIAL / CANCELLED. Tab auto-refreshes every 3 s while a request is live
- To verify tomorrow: GetDocumentVersion on a detached quick open; DataGrid single-click checkboxes; Apply/sync on a test model; per-sheet numbering display; Revision.Create + SetAdditionalRevisionIds

## 8. Version history (short)

| Version | What changed |
|---|---|
| Dynamo v1–1.3 | Single open model, CSV/LOD list, naming, pop-up, diagnostics |
| pyRevit v1 | Multi-model ACC export, model list from cache, detached open, AutoCAD hand-off |
| v2–2.2 | Tick drawings per model, Embed Logos button, open once per run, shared queue between Revit windows |
| v3 | One professional window (models / drawing tree / settings) |
| v4–4.1 | Model export setups + full PDF page settings, safety for non-workshared models, names exactly as ACC, Lew branding, resizable panels |
| v5 | Progress window with per-model and per-drawing status |
| v6–6.2 | Threaded animated progress window + logo tracking, IMG2OLE bundled, AutoCAD setup check (+ fallback), quick open for drawing lists, optional skip of link worksets |
| v7.0 | **Issue Sheets** button (sets, change check, revisions, title block Yes/No, Apply/Revert, exact MIDP names, issue register); log header bug fixed |
| v7.1–7.3 | Safer Apply, logo pipeline, optional MIDP, full PDF/CAD tabs in Issue Sheets, per-sheet numbering, title block type change, AutoCAD auto-close, logs in `_Logs` |
| v7.6 | Toolbox requests: live progress + Cancel |
| v7.5 | Revision numbering per project / per sheet switch with preview (like Revit) |
| v7.4 | File name revision always from Revit + last-moment name guard (BLOCKED on mismatch); Toolbox "Pull from Revit" requests |
