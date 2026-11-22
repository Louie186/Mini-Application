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
2. Copy these folders to your PC:
   - `C:\BIMTools\pyrevit\BIMExport.extension\` (this folder)
   - `C:\BIMTools\img2ole\` (the IMG2OLE tool, for the logos)
3. Start Revit → **pyRevit** tab → **Settings** → **Custom Extension Directories** → **Add folder** → `C:\BIMTools\pyrevit` → **Save Settings and Reload**
4. A new **BIMExport** tab appears with the **Export Sheets** button
5. AutoCAD (for the logos): add `C:\BIMTools\img2ole` to **Trusted Locations** (see the IMG2OLE README)

## Use it

**Export Sheets** button:

1. **What to export:** pick **Tick sheets from the models** (recommended)
   - Or "Sheets from my LOD (CSV)", or "All sheets"
2. **Tick the models**
3. **Sheet lists:**
   - First time: each model opens **once** in the background (detached) to read its sheets, then closes
   - Next time: **instant** (uses the saved list), or choose **Refresh** if sheets changed
4. **Tick the drawings.** Switch model with the drop-down at the top, or use "* All chosen models". The search box filters the list
5. **Mode:** Dry run (instant, opens nothing) or Export
6. **Formats:** PDF + DWG, PDF only, or DWG only
7. **Output folder**
8. **Logos:** Yes starts AutoCAD after the export

**Embed Logos** button (run or re-run the logo step any time):

1. Pick the export output folder
2. It shows the result of the last logo run (OK / PARTIAL / FAILED per drawing)
3. It checks that IMG2OLE and AutoCAD can be found, and lets you point to them if not
4. It starts AutoCAD on every `<model>\_DWG_raw\*.dwg` and writes the finished files to `<model>\DWG\`

### Opening models

- **Workshared models open detached** (all worksets), so they never touch your own local copy or the central model
- **Non-workshared cloud models** can't be detached (a Revit rule), so they open normally. They are still closed without saving
- **A model already open in this Revit** is used as it is, including your unsynced changes, and left open. The report says so

### Where the model list comes from

- Revit keeps a local copy of every **ACC cloud model you've opened on this PC**. The list is read from there, so no IDs to type
- A model you have **never** opened on this PC won't be listed. Open it once in Revit the normal way (or ask me about the ACC web-service option below)
- The list is saved in `%APPDATA%\BIMExport\ModelRegister.csv`. Names are updated every time a model is opened

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
