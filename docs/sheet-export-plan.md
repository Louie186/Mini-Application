# BIM Sheet Export, Review and Log: Plan (DRAFT)

Status: draft from planning chat. Items marked OPEN still need answers.
Owner: Lew (Senior BIM Technician). Editing of drawings stays with real people.

## Goal
- Export listed sheets from ~50 cloud Revit models without opening each model by hand.
- Review the exports, log them, and prepare a submission folder.
- Must work with or without Claude desktop on the PC (hybrid). Everything is plain files.

## Fixed decisions
- Revit version: 2025.4.
- Tool: a Dynamo graph with a built-in Python node (CPython 3 engine in Dynamo for Revit 2025). pyRevit is not required.
- Later, package the graph as a Dynamo custom node (inputs: drawing list, output folder, naming settings).
- Export with Revit's own PDF and DWG export, using saved export setups. DiRoots is not used and has no option in the script.
- User signs in to Autodesk by hand and stays signed in. No passwords in scripts, files or chat.
- All worksets open and all links loaded for each model (wait for links; log any link that fails).
- Models are opened detached so colleagues are not locked out. Each model is opened once, exports run, model closes, next model opens.
- Script skips and logs failures; one bad model must not stop a run.

## Inputs
1. Drawing list (CSV or Excel), one row per sheet:
   - SheetNumber, SheetName, ModelName, Formats (PDF / DWG / both). Optional: Revision, Status.
2. Model register (CSV, one-off, kept up to date):
   - ModelName, Region, ProjectGUID, ModelGUID. Cloud models open by these IDs.
3. Naming settings (small config file, flexible):
   - A template such as `{Project}-{SheetNumber}-{Revision}`; changed in the file, not the code.
4. Output folder: asked at run time. One sub-folder per model.

## Run flow
1. Read drawing list; group sheets by model; look up model IDs in the register.
2. For each model: open (all worksets, links loaded) -> find only the listed sheets -> export PDF/DWG -> write data extract -> close.
3. Write master CSV (one row per sheet: what was exported, file name, status) and a run log.
4. Flag: sheet on list but not in model; model will not open; failed links; duplicate sheet numbers.

## Data extract (added so checking is reliable)
Per sheet, written to CSV/JSON alongside the PDFs:
- Titleblock parameters (number, name, revision, date, stamps/status fields).
- Views placed on the sheet and their types.
- Tags per view (type, value, position), legend contents, sheet schedules.
- Line weight and override information where the API exposes it.
Reason: checking data is far more reliable than an AI "looking at" a PDF.

## Review (flexible, rules kept in a rules file)
Reliability tiers:
- Reliable (data checks): drawing number vs list, titleblock fields, stamps/status, revision, file naming, missing sheets, line weights.
- Medium (data + human confirm): tags vs legend, cutsheet items vs drawing items.
- Hard (AI visual spot-check only, human confirms): tag clashes, tag alignment, dimension correctness and completeness, view correctness.
Scenarios from the user:
1. Tags in drawing views vs legend list (all tags shown in the legend).
2. Items required by the cutsheets implemented in the drawing (completeness).
3. Drafting issues: line weight, tag clash, dimensions, tag alignment, view correctness, drawing number vs list, stamps.
Reviewer runs in either route: Claude agent (Claude Code on the PC) or office Copilot with a written guideline. Guideline to be built from an interview with the user. Agent flags; a person decides.

## Logo in CAD files: separate AutoCAD script (OPEN details)
- Title block family is supplied and cannot be edited; the logo is an image used on every sheet.
- Revit's own DWG export leaves the logo as a linked image file (it cannot bind images).
- DiRoots is NOT part of the script. Reason: no known way to drive ProSheets from a script. (User has a paid DiRoots and can still use it by hand outside this workflow.)
- Separate AutoCAD script runs after the export on selected DWG files (a chosen folder or a list):
  - Finds the logo image reference in each DWG.
  - Option A (preferred): replace it with a vector block of the logo at the same position and scale. Needs a vector logo (DWG) from the client.
  - Option B: embed the picture as an OLE object (what DiRoots reportedly does). Riskier to automate; may need full AutoCAD, not LT; larger files; high-resolution images may show blank.
  - Option C: keep the image linked and package DWG + image together (eTransmit).
  - Never overwrites the originals: writes fixed copies to a "processed" folder and logs every file (fixed / no logo found / failed).
- Test first on one DWG before any batch run.
- DECISIONS: user has AutoCAD (confirm full, not LT). No vector logo available. Client accepts an embedded (OLE) logo. So Option B is the route; Option C is the fallback.
- Idea to make B practical: build the embedded logo ONCE as a template block (e.g. copied from one DiRoots-exported DWG, or pasted as OLE by hand and saved as a block), then the script inserts that block in every DWG at the old image position/scale and removes the linked image. Needs a one-DWG feasibility test (block with OLE inserts, survives save, opens without the image file).
- OPEN: confirm full AutoCAD version; test the template-block idea.

## Logging and submission
- Logger updates a master register (new / changed / unchanged per sheet).
- Submission folder built by the agent if Claude Code is on the PC; otherwise copied by hand. User approves before anything goes out.

## OPEN items
- Naming rule and full drawing list (user to supply).
- Interview: how the user checks drawings (for the Reviewer guideline).
- Logo approach for DWG (test DiRoots output first).
- Does a model register already exist?
- How the legend is built (legend view, keynote legend, schedule) for the tag-vs-legend check.
- Cutsheet format (PDF, Excel) for the completeness check.

## Notes for the build session
- Cannot be tested in the cloud container (needs Revit). User tests each step on one model on their PC.
- Build order: one-model export -> list-driven multi-model -> data extract -> Reviewer rules -> logger -> custom node.
