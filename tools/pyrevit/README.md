# BIM Export: one button for all models (pyRevit)

One button in Revit:

1. You pick your **LOD** (CSV), **Dry run** or **Export**, the **output folder**, and **tick the models**
2. It opens each model **by itself**, in the background (detached, all worksets, links checked)
3. It exports the LOD sheets that live in that model to **PDF + DWG**, named by the full LOD number
4. It closes the model **without saving**. No sync, no locks, colleagues aren't affected
5. Optional: it starts **AutoCAD** and embeds the logos (IMG2OLE) in all DWGs

You never open a model yourself.

> **Status: first version, tested only against a fake Revit.** Do a Dry run first, then Export on 1–2 models.

## Install (once, 5 minutes)

1. Install **pyRevit** if you don't have it (free: pyrevitlabs.io). Revit must be closed while installing
2. Copy the **`BIMExport.extension`** folder to pyRevit's extensions folder (`%APPDATA%\pyRevit\Extensions\`)
   - The logo tool (IMG2OLE) is **inside** it (`BIMExport.extension\img2ole\`), so there's nothing else to copy
3. Start Revit → **pyRevit** tab → **Settings** → **Custom Extension Directories** → **Add folder** → `C:\BIMTools\pyrevit` → **Save Settings and Reload**
4. A new **BIMExport** tab appears with the **Export Sheets** button
5. AutoCAD (for the logos): nothing to do by hand. The first time you export with "Embed logos" ticked, the tool offers to add its IMG2OLE folder to AutoCAD's Trusted Locations (close AutoCAD first)

## Use it

Click **BIMExport → Export Sheets**. One window opens:

| Panel | What you do |
|---|---|
| **1 Models** | Tick 5–10 models. **Load drawings** reads each new model once (opens it in the background, detached), then it's instant next time. Tick "Refresh lists" if sheets changed |
| **2 Drawings** | A tree per model: **model → browser folders → drawings**. Pick the **Browser** (sheet browser organization) next to each model. Tick a folder to tick everything in it. Search box, Tick all, Clear, Expand, Collapse. **Tick from LOD...** ticks the drawings listed in a CSV |
| **3 Settings** | **Output:** folder, one folder per model, PDF/DWG, file name rule. **PDF:** colours, raster quality, hide crop/scope/ref planes/unreferenced tags, or a saved setup name. **CAD:** DWG version, layer standard, one DWG per sheet, shared coordinates, or a saved setup name. **Run:** embed logos, share with other Revit windows |

Then **Dry run** (instant, nothing opened) or **Export**.

While exporting, the progress bar shows e.g. `Model 2 of 5 · Tower-ARC · DWG 3 of 12 (10102)`, with **Cancel**.

Settings are saved for next time. Before exporting, the tool warns you if two drawings would get the same file name.

**Embed Logos** button: run or re-run the logo step on an export folder any time, and see the last result per drawing.

### Faster: several Revit windows share one export

1. Start the export in Revit window 1 as usual, and answer **Yes** to "Share this export with other Revit windows?"
2. Open a **second Revit** (and a third, if you like) with any file
3. There, click **Export Sheets** → **Join the running export**
4. Each window takes the next model nobody has started, so no model is done twice
5. Each window shows its own report. The **last window to finish** starts AutoCAD for the logos (once)

- 64 GB memory: 2–3 windows are fine
- Cancel in one window: models it hasn't started stay in the queue for the others
- The queue lives in `<Output folder>\_queue\`

## Safety: what the tool does to your models

- **Workshared models** open **detached from central** (Revit's own "Detach and preserve worksets"): a temporary copy in memory, all worksets open
- The tool **never saves and never syncs**. It only reads sheets and exports, then closes with "do not save"
- It doesn't create a local file, take ownership of elements, or touch the central model, so your own session and your colleagues are unaffected
- **Non-workshared cloud models** (for example a model saved after detaching) **can't be detached**, a Revit rule. Opening them means opening the real model, so they are **skipped by default**. Allow them in the **Run** tab only if nobody, including you in another Revit window, has them open
- **A model already open in the same Revit window** is used as it is and left open (the report says so)
- Before exporting, a confirmation lists the models and reminds you to close them in other Revit windows

### Speed

- **Reading the drawing list** opens each model "light": all worksets closed, so no linked models load. Much faster than a full open, and only needed once per model (or when you tick Refresh)
- **The export** opens each model with **all worksets and links** (complete prints), unless you tick **Run → "Faster: don't load linked models"**. That leaves worksets named like `*Link*` closed (change the pattern to suit your project). Only use it for drawings that don't show linked content
- **Several Revit windows** can share one export (Run → Share)

### Opening models

- **Workshared models open detached** (all worksets), so they never touch your own local copy or the central model
- **Non-workshared cloud models** can't be detached (a Revit rule), so they open normally. They are still closed without saving
- **A model already open in this Revit** is used as it is, including your unsynced changes, and left open. The report says so

### Where the model list comes from

- Revit keeps a local copy of every **ACC cloud model you've opened on this PC**. The list is read from there, so no IDs to type
- A model you have **never** opened on this PC won't be listed. Open it once in Revit the normal way (or ask me about the ACC web-service option below)
- The list is saved in `%APPDATA%\BIMExport\ModelRegister.csv`. Names are updated every time a model is opened

## Issue Sheets (new button)

For formal issues: **what changed → fix revisions / title block switches → issue with exact MIDP names → log every print**. Export Sheets stays as it was.

1. **Models:** tick them (or pick a **saved set**: Save / Delete next to the list). Optionally pick your **MIDP / LOD (CSV)**. Without it, files are named by **sheet number** (e.g. `10100.pdf`)
2. **Check models:** quick open of each model (no worksets, no links). Reads drawings, revisions, title blocks and the model's **sync stamp**
3. **Drawings tab:** one row per drawing:
   - **File name** = MIDP code (first 7 parts) + **Revit's current revision**. Uncertain → **✖ BLOCKED** (not in MIDP, twice in MIDP, no revision, bad characters), never guessed
   - **Change**: New (never issued) · Revision changed (T1 → T2) · Model synced since last issue · No change
   - **Tick changed** ticks everything that changed and isn't blocked. Optional **Title block** column
4. **Revisions tab** (like Revit's Sheet Issues/Revisions + Revisions on Sheet):
   - All revisions with Rev, Date, Description, Issued to/by. Edit dates/descriptions (not Issued ones). **+ Add revision**
   - Tick revisions per drawing: **Current rev and date update straight away**. Clouded revisions can't be removed here
5. **Title blocks tab:** pick a **drawing** at the top (or click one in Drawings) → the **title block(s)** it really uses (a second drop-down if there's more than one), the **revisions on that drawing** (number on the sheet, date, cloud or added, issued), and the title block's **Yes/No** parameters (instance = this drawing, type = ALL drawings of that type). Only Yes/No can be changed
   - **Settings** on the right: the same **Output / PDF / CAD / Run** tabs as Export Sheets (setup drop-down + every Revit export option), shared between both buttons
6. **Changes tab → Apply to the models** (only if you changed revisions or Yes/No):
   - Local copy (not detached) → nobody else owns the items → **one change step** → read back → **sync + give back everything borrowed** → close
   - Any problem: **nothing is saved**. Every Apply keeps an undo log: **Revert last apply...**
   - Apply only runs when this is the **only Revit window** (two windows share one local copy). It opens your local copy with **your own last-used worksets**, never clicks Revit messages away, and doesn't save the local file before syncing (a failed sync leaves nothing behind)
7. **Issue:** with "Embed logos" ticked, a small **background helper** starts AutoCAD as soon as the first model's DWGs are ready and keeps feeding it while Revit exports the next models (one AutoCAD at a time; falls back to "AutoCAD at the end" if PowerShell is blocked). Then it exports the ticked drawings (detached, closed without saving) with the exact names, embeds logos if ticked, and writes **one row per print** in the **issue register** CSV (each drawing's prints grouped together, newest under the older ones)

**Change check, honestly:** the sync stamp changes with every sync, so "Model synced since last issue" means something in the model changed, not necessarily on that drawing. "No change" = same revision and no sync since that drawing was last printed.

## Output

```
<Output folder>\
  SheetExport_log.csv          one row per file (OK / FAILED / WOULD_EXPORT / NOT_IN_CHOSEN_MODELS)
  <Model name>\
    PDF\        5013-KEO-T1-ZZ-PLN-INT-10100-T1.pdf
    _DWG_raw\   Revit's DWG + the logo PNGs (input for IMG2OLE)
    DWG\        final DWGs with embedded logos (made by AutoCAD)
  IMG2OLE_files.csv / IMG2OLE_images.csv   logo logs
```

## Settings

Saved in `%APPDATA%\BIMExport\settings.json` (open it in Notepad):

| Setting | What it does | Default |
|---|---|---|
| `naming_rule` | File name. Tokens: `{DrawingNumber}` `{ListRevision}` `{SheetNumber}` `{SheetName}` `{Revision}` `{Model}` `{Date}` `{P:param}` `{Project:param}` | `{DrawingNumber}` |
| `dwg_setup` | Name of a saved DWG export setup in the models | blank = Revit default |
| `pdf_setup` | Name of a saved PDF export setup in the models | blank = Revit default |
| `region` | ACC region tried first (`EMEA`, `US`, `AUS`) | `EMEA` |
| `img2ole_lsp` | Where IMG2OLE.lsp is | `C:\BIMTools\img2ole\IMG2OLE.lsp` |
| `acad_exe` | AutoCAD program, if not found automatically | blank = newest AutoCAD |

## Good to know

- **Revit is busy while it runs.** You can work in other programs, or open a **second Revit** window for your own work
- **Prints show the last synced version in ACC.** Ask the team to sync before a print run (agree a cut-off time)
- Revit pop-ups during opening are closed automatically, and warnings are ignored, so the run doesn't stop
- If a model fails to open, it is logged and the run carries on with the next one
- If a model is already open in this Revit, it's used as it is and left open

## The "proper" ACC option (later, needs IT)

Revit's own tools can't browse ACC folders. To list **every** model in ACC, even ones never opened on this PC, we'd use Autodesk's web service (APS):

- An admin registers a small app and adds it to your ACC account (one time)
- You sign in once in a browser
- The model window then shows the real ACC folder tree

The rest of the tool stays the same.
