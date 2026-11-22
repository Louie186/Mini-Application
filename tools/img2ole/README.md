# IMG2OLE: embed logos in exported DWGs

Revit's standard DWG export keeps logos and stamps as **linked** pictures (loose PNG files next to the DWG). DiRoots **embeds** them as OLE pictures. This tool does the same on any DWG.

- Finds **every** picture: model space, all layouts, inside all blocks (title block or not), and nested blocks
- Puts an embedded picture in the **same position, size, rotation, layer and draw order**
- Removes the old link, so the DWG no longer needs the PNG files
- No hard-coded positions, so any title block or sheet size works
- Skips (and logs) anything risky: cropped, mirrored, skewed or missing pictures

> **Status: not tested yet.** It was written without AutoCAD. Follow the test steps below on a **copy** first.

## Files

| File | What it is |
|---|---|
| `IMG2OLE.lsp` | The tool (AutoLISP). Commands `IMG2OLE1` and `IMG2OLE` |
| `IMG2OLE_clip.ps1` | Helper: puts a picture on the clipboard. The tool calls it, you don't |
| `Invoke-Img2OleDryRun.ps1` | Background dry run on a whole folder (for the AI team) |

Keep all three files **together in one folder**.

## One-time setup (5 minutes)

1. Copy the `img2ole` folder to your PC, e.g. `C:\BIMTools\img2ole`
2. In AutoCAD, type `OPTIONS` and open the **Files** tab
   - **Support File Search Path** → Add → `C:\BIMTools\img2ole`
   - **Trusted Locations** → Add → `C:\BIMTools\img2ole`
   - Without this, AutoCAD shows a security pop-up that stops batch runs
3. Load the tool: type `APPLOAD` and pick `IMG2OLE.lsp`
   - Optional: add it to **Startup Suite** in the same window so it loads every time

## Test 1: dry run on one drawing (changes nothing)

1. Open a standard-export DWG (with its PNGs next to it)
2. Type `IMG2OLE1` → **Dryrun**
3. Read the command line, e.g. `pictures 4, ready 4, skipped 0 -> OK`
4. Open `IMG2OLE_images.csv` (next to the drawing) in Excel
   - One row per picture: where it is, its size, and `WOULD_REPLACE` or `WOULD_SKIP` with the reason

## Test 2: replace on one drawing (use a copy!)

1. Open a **copy** of the DWG
2. Type `IMG2OLE1` → **Run** → **Emf**
3. Check:
   - The logos look right and sit in the same place
   - Click a logo inside the title block (`BEDIT`): Properties should say **OLE**, source **Picture (Enhanced Metafile)**
   - Type `XREF`: no images listed
4. Happy? `SAVE`. Not happy? `UNDO` back, and send me the CSV and a screenshot
5. Move the saved DWG to a folder **without** the PNGs and open it: the logos must still show

## Many drawings

1. Type `IMG2OLE`
2. Pick **Dryrun** first, then later **Run**
3. Pick drawings by **Folder** (all DWGs in it) or **List** (a .txt or .csv, one DWG path per line)
4. Press Enter to accept the output folder (default: `IMG2OLE_processed` inside the source folder)
5. Hands off AutoCAD until it says **IMG2OLE finished**

What happens:

- Originals are **never** opened or changed. The tool copies them to the output folder and works on the copies
- Dry run works on temporary copies and deletes them at the end
- Logs go in the output folder:
  - `IMG2OLE_files.csv`: one row per drawing. Result: `OK`, `CHECK`, `PARTIAL`, `FAILED`, `NO_IMAGES`
  - `IMG2OLE_images.csv`: one row per picture, with the reason for anything skipped

## Background dry run (AI team, no AutoCAD window)

Run in **Windows PowerShell** (not PowerShell 7):

```powershell
cd C:\BIMTools\img2ole
.\Invoke-Img2OleDryRun.ps1 -InputFolder "D:\Exports\2026-11-22"
```

- Uses AutoCAD Core Console (comes with full AutoCAD). Finds it automatically, or pass `-AccoreConsole "C:\Program Files\Autodesk\AutoCAD 2025\accoreconsole.exe"`
- Opens each original and **never saves**
- Logs go to `<InputFolder>\IMG2OLE_dryrun\`, plus `console_logs\` for troubleshooting
- The **Run** mode cannot run in Core Console (embedding needs the clipboard). Use `IMG2OLE` in AutoCAD for that

### For the AI agent

1. Run the dry run on the folder the user names
2. Read `IMG2OLE_files.csv` and `IMG2OLE_images.csv`
3. Report in plain bullets:
   - Drawings checked, and how many are `OK` / `CHECK` / `NO_IMAGES`
   - Every `WOULD_SKIP` picture: drawing, picture name, reason
   - Drawings with no log row (they failed to load; see `console_logs`)
4. Do **not** run the replace step. A person starts **Run** in AutoCAD

## If something goes wrong

| You see | Do this |
|---|---|
| Security pop-up when loading | Add the folder to **Trusted Locations** (setup step 2) |
| `Could not put the picture on the clipboard` | PowerShell may be blocked on your PC. Ask IT, or try `Dib` |
| `PASTECLIP did not create an OLE object` | Send me a screenshot of the command line |
| `Picture file not found` | The PNGs must sit next to the original DWG |
| File dialogs stopped appearing after a crash | Type `FILEDIA` → `1` |
| A batch stopped on a pop-up (missing fonts, proxy) | Close the pop-up. The batch should carry on. Tell me which pop-up it was |

## Known limits (by design)

- Cropped, mirrored or skewed pictures are skipped and logged, not guessed
- Pictures inside **xref** blocks are skipped. Process the xref DWG itself instead
- Rotated pictures are replaced but flagged "check visually"
- Transparent parts of a picture become white (same as DiRoots)
