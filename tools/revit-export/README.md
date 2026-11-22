# Sheet Export (Revit 2025 + Dynamo)

Exports **only the sheets on your drawing list** from the **open** model to PDF and/or DWG, named your way, with a log.

> **Status: first version, tested only against a fake Revit.** Test on your dummy model first.
> This version works on **one model: the one you have open**. Looping through many cloud models comes next.

## Files

| File | What it is |
|---|---|
| `SheetExport.dyn` | Ready-made Dynamo graph (open this) |
| `SheetExport.py` | The code inside the graph's Python node (same code, for reading or pasting) |
| `DrawingList_template.csv` | Example drawing list. Copy it and fill in your own sheets |
| `build_dyn.py` | Only for updating the graph from the code. You don't need it |

## 1. Make your drawing list

- Open `DrawingList_template.csv` in Excel
- One row per sheet:
  - **SheetNumber** (required): must match Revit exactly
  - **SheetName** (optional): only used to warn you if Revit's name is different
  - **Model** (optional): the Revit model name. Rows for other models are ignored. Blank = any model
  - **PDF**, **DWG**: `Y` or `N`
- Save as **CSV UTF-8** (File → Save As → "CSV UTF-8 (Comma delimited)")

## 2. Run it on your dummy model

1. Open the dummy model in Revit
2. **Manage** tab → **Dynamo**
3. Open `SheetExport.dyn`
4. Check the run mode at the bottom left says **Manual**
5. Fill in the inputs on the left:
   - **Drawing list**: browse to your CSV
   - **Output folder**: browse to an empty test folder
   - **Naming rule**: e.g. `{SheetNumber}_{SheetName}` (see below)
   - **DWG export setup**: name of a saved setup in Revit, or leave blank
   - **PDF export setup**: name of a saved setup in Revit, or leave blank
   - **Export?**: leave **False** for the first run
6. Click **Run**: this is a **dry run**, nothing is exported
   - Read the Python node's result (click the small bar under it)
   - Open `SheetExport_log.csv` in the output folder. Each row says `WOULD_EXPORT`, `NOT_FOUND` and so on
7. All good? Set **Export?** to **True** → **Run**
8. Check the files in `<Output folder>\<Model>\PDF\` and `\DWG\`

## Naming rule tokens

| Token | Gives |
|---|---|
| `{SheetNumber}` | A-101 |
| `{SheetName}` | Ground Floor Plan |
| `{Revision}` | Current revision of the sheet |
| `{Model}` | Model name |
| `{Date}` | Today, e.g. 20261122 |
| `{P:Parameter Name}` | Any sheet parameter, e.g. `{P:Drawing Status}` |
| `{Project:Parameter Name}` | Any Project Information parameter, e.g. `{Project:Project Number}` |

Example: `{Project:Project Number}-{SheetNumber}-{Revision}` gives `5013-A-101-T1`

- Characters Windows doesn't allow (`\ / : * ? " < > |`) become `-`
- An empty value doesn't leave a double dash
- An unknown token is logged so you can fix the rule

## What it does for you

- Skips sheets listed twice, and says so
- Logs sheets that are on the list but not in the model (`NOT_FOUND`)
- Warns if a sheet name on the list differs from Revit
- Skips placeholder sheets
- DWG: one file per sheet (views are not split into separate xrefs), AutoCAD 2018 format
- Overwrites old files with the same name
- Each row in the log has the time taken, so we can estimate a full run

## If it doesn't work

| You see | Do this |
|---|---|
| The graph opens with a red or yellow node | Use the manual setup below, and send me a screenshot |
| `ERROR: ...` in the result | Send me the message and the log |
| `FAILED` rows in the log | Send me the log row. The note says why |
| `PDF setup '...' not found` | The name must match your saved setup in Revit exactly |

### Manual setup (if the .dyn won't open)

1. New Dynamo graph, set to **Manual**
2. Add these nodes: **File Path**, **Directory Path**, **String** ×3, **Boolean**
3. Add a **Python Script** node. Click **+** until it has `IN[0]` to `IN[5]`
4. Right-click it → **Edit**, paste all of `SheetExport.py`, and pick engine **CPython3**
5. Connect: File Path → IN[0], Directory Path → IN[1], String (naming) → IN[2], String (DWG setup) → IN[3], String (PDF setup) → IN[4], Boolean → IN[5]
6. Save as `SheetExport.dyn`

## After this works

- Run `IMG2OLE` on the `DWG` folder to embed the logos
- Next build step: open each listed **cloud** model in turn, with all worksets and links loaded
