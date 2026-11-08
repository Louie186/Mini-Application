# Lew's Toolbox

One program for everyday work: launcher, task tracker, delegation, submission check and bulk file tools.
Nothing to install. You build it on your own PC once, and then it's a normal program.

## Set up (one time, about 1 minute)

1. Get this `LewsToolbox` folder onto your PC (for example `Documents\LewsToolbox`)
   - If you downloaded a zip: right-click the zip → **Properties** → tick **Unblock** → OK, **then** extract it
2. Double-click **`Build.bat`**
   - A black window shows "Building…" for a few seconds
   - It makes **`LewsToolbox.exe`** in the same folder and opens it
3. Right-click `LewsToolbox.exe` → **Pin to taskbar** (Windows 11: Show more options → Pin to taskbar)

- No "Windows protected your PC" warning: the program was made on your own PC
- After an update, run `Build.bat` again. Your data is kept

## What's in it

| Tab | What it does | Status |
|---|---|---|
| 🚀 Launcher | One-click open of apps, files, folders and web links | ✅ Stage 1 |
| 📁 Bulk Files | Rename / copy / move many files with preview, Excel round trip and Undo | ✅ Stage 2 |
| 🗂 Tracker | Your work list: Today, This week, Overdue, Board | ✅ Stage 3 |
| 📋 Delegate | Give tasks to people (Excel sheet or HTML task pack) and load their updates back | ✅ Stage 4 |
| ✅ Submission Check | Check a folder's file count and file names against your list | ✅ Stage 5 |

## Launcher

- **Click** an item → it opens
- **Right-click** → Open file location, Copy path, Edit, Duplicate, Move to group, Remove
- **Add things:**
  - Copy a path or link → **Ctrl+V** in the Launcher (Shift + right-click a file → Copy as path)
  - Or drag files / folders onto the list
  - Or **+ Add ▾** → File(s) / Folder / Web link
- **Search:** just start typing. **Enter** opens the top result. **Esc** clears it
- **Groups:** **+ Group**. Click a group to show only that group. Right-click a group to rename, move or delete it
- **Icons / List** and **Grouped / All in one** buttons change the view
- Click a column title to sort
- Items that can't be found show in **red** (moved, or drive offline)
- **Import / Export ▾**
  - **Bulk edit in Excel**: opens your whole list in Excel → change / add / delete rows → save → **Apply bulk edit changes**
  - **Import from CSV / Excel file**: needs a **Location** column (Name, Group, Description, From, Date optional)
  - **Import my QuickLaunch list**: pick `QuickLaunch-data\library.json`. Your QuickLaunch file is not changed
  - **Export what I'm looking at**: a CSV for Excel
- **Clock** (bottom left): click for a stopwatch and timer

## Bulk Files

Rename, copy or move many files at once. Nothing changes on disk until you click **▶ Preview and run…** and say Yes.

1. **📂 Pick folder…** (tick **Include subfolders** to go deeper; **Only:** e.g. `*.pdf; *.dwg`)
2. Make the **new names** (only ticked files change):
   - **Find / Replace** (e.g. `-P01` → `-P02`), **Add at start / end**, **Number** (001, 002…)
   - **More ▾**: UPPER / lower case, spaces → `_`, remove characters, add today's date, change the file ending
   - Or click a **New name** cell and type
   - Or **✎ Edit new names in Excel** → change the *New name* column → save → **⬆ Load names from Excel**
3. Check the **Check** column:
   - Green **OK** = ready
   - Orange = warning (e.g. the file ending changed) – still runs
   - Red = problem, **skipped**: bad characters, same name twice, name already exists, path too long
4. **What to do:**
   - **Copy to another folder** (default, safe – originals untouched)
   - **Move to another folder** / **Rename in place** – these change your original folder, so they stay **🔒 locked** until you tick *Allow changes to the original folder* (it locks again after each run)
   - **Keep subfolders**: copies the folder structure too
5. **▶ Preview and run…** shows what will happen → **Yes**

Safety:
- **Never overwrites** and **never deletes** files
- **↶ Undo last run**: renames back / moves back / sends the copies to the Recycle Bin (files changed since are left alone)
- Every run is logged: `exports\BulkFiles_<action>_<date>.csv`. **History** shows the last runs
- Tip: in the Launcher, right-click a folder → **Open in Bulk Files**

## Tracker

Your own work list.

- **Quick add:** type a task and press **Enter**. Words it understands:
  - `today`, `tomorrow`, `mon` … `sun`, `next week`, `25/11` = due date
  - `#Tower1` = project (use `_` for spaces: `#Tower_1`)
  - `!` = high priority, `!low` = low
  - `@Sam` = waiting on Sam
  - Example: `Check RFI drawings fri #Tower1 !`
  - Added in the **Today** view with no date = due today
- **+ Detailed…** for every field: project, due, priority, status, waiting on, repeat, notes, time
- **Views:** Today · This week · Overdue (red) · All open · **Board** · Done
- **Board:** To do / Doing / Waiting / Done. Drag cards between columns. Double-click to edit
- **Tick ✓** (or **Space**) = done. **Double-click** = edit. **Right-click** = status, due date, timer, duplicate, delete
- **Repeat** (daily, weekdays, weekly, monthly): when you tick it done, the next one is made for you
- **Time:** right-click → **⏱ Start timer** (one at a time, shown at the top) or **+ Add time** (e.g. `1.5` or `0:45`)
- **Project** filter and **Search**
- **Export ▾**
  - **Copy this week's summary**: Done, Still open, Waiting on others, Time per project – paste into an email or Teams
  - Weekly summary / all tasks → Excel (CSV)
- **Delegated tasks** (from the Delegate tab) show here with 📋 as "Waiting on <name>". Change them in Delegate

## Delegate

Give tasks to people, send them a file, load their answers back, see who is behind.

1. **+ New task**: title, group, project, **Assigned to** (comma between names), due date, notes
   - Add **checklist items** in the table (each can have its own person and date)
   - **+ Paste items**: paste a list (one per line, e.g. from Excel)
   - IDs are made for you: `T001`, items `T001.1`, `T001.2` …
2. **📤 Send to people…**: tick the people, tick the file types:
   - **Excel task sheet** – yellow boxes to fill in, Status drop-down, + / − groups, empty NEW blocks to add work
   - **HTML task pack** – opens in any browser (phone too), To do / Doing / Done buttons, they press **Save reply** and send you the .txt
   - **Simple Excel table** – plain rows
   - Each person gets **only their tasks**. Files have the date and time in their name, in `exports\Delegate\<date>`
3. Attach the files to an email / Teams
4. When they reply: **⬆ Load replies…** (pick one or many .xlsx / .txt) or **📋 Paste reply…** (pasted message text)
   - You see every change first (status, notes, new items, new tasks) → **Yes** to apply
   - Loading the same file twice does not add things twice
5. **Views:** Tasks (with progress and **late** in red) · **👥 Team** (open, late, due this week / next week, Behind / Busy / Has room) · **🌐 Lew's Tracker** (read-only, when linked in Settings)
- **Right-click** a row: set status, send this task, history, duplicate, delete
- **More ▾**: export all to Excel (CSV), sent / received log, default project name, **copy Lew's Tracker tasks into the Toolbox**
- Same file formats as Lew's Tracker (web app): its sheets and task-pack replies load here, and the Toolbox's files load there
- Open tasks show in the **Tracker** tab as "Waiting on <name>"

## Submission Check

Check a submission folder against your list before you send it.

1. **📂 Submission folder…** (subfolders included)
2. **📄 My list (Excel / CSV)…** – any drawing register, transmittal or checklist
   - It finds the heading row by itself (title rows above it are fine)
   - Check the column boxes it picked, change them if needed:
     - **File name / number** (needed) – with or without revision and ending, e.g. `5013-KEO-ZZ-DR-A-10101` or `…-10101-P02.pdf`
     - **Revision** (optional), **File types** (optional, e.g. `pdf, dwg`), **Folder** (optional), **Title** (optional)
   - **All rows need:** file types for every row when the list has no File types column (empty = any type)
3. **▶ Check**
   - ✔ **Found**  ·  ✖ **Missing**  ·  ✖ **Wrong revision** (e.g. list says P02, folder has P01)  ·  ✖ **Missing file type** (e.g. PDF there, DWG missing)
   - ⚠ **Wrong folder**  ·  ⚠ **Listed twice**  ·  ⚠ Found with a note (upper/lower case differs, empty file, old revision also there, same file in two folders)
   - ➕ **Not on the list** – files in the folder that aren't on your list
   - **Count by file type**: found / needed for each type
- **Show:** everything, problems only, missing, wrong revision, files not on the list, OK only
- Double-click a row to open the file's folder
- **Report ▾**: **Excel report** (Summary, Checklist with results, Not on the list), **Copy summary** for email / Teams, other notes (empty files, long paths, names that don't follow the list's pattern)
- **Fix names in Bulk Files** opens the folder in the Bulk Files tab
- It remembers your folder, list and columns

## Settings (⚙)

- **Themes:** Light, Dark, Blueprint, Retro 8-bit, Retro Grey, Retro Console. **Text size:** Compact / Normal / Large
- **Data folder:** where your lists are saved
  - Default: `LewsToolbox-data` next to the program
  - **Change folder…** → pick a folder in OneDrive to use the same data on every PC
  - It offers to copy your current data across and never overwrites what's already there
- **Link to Lew's Tracker:** pick the web app's data folder (with `Delegation.json`) to see those tasks too. Read-only
- **Your name:** shown as "Issued by" on task sheets

## Keyboard

- `Ctrl+1` … `Ctrl+6` switch tabs
- `Ctrl+F` search, `Ctrl+V` add a copied path, `F2` edit, `Delete` remove

## If something goes wrong

- **Build.bat says it can't find the compiler:** ask IT to turn on ".NET Framework 4.8" (it's part of Windows)
- **Build failed:** send Claude a photo of the black window
- **Lost your list?** Each file in the data folder has a `.backup` copy next to it. It's used automatically if the main file is damaged
- **Something crashed:** details are in `error-log.txt` in the data folder

## For whoever maintains this

- Code is in `src/` (C# 5, Windows Forms, .NET Framework 4, no extra libraries)
- **One tab = one file** (`LauncherPage.cs`, `TrackerPage.cs`, `BulkFilesPage.cs`, `SettingsPage.cs` …). Delegate has two: `DelegatePage.cs` (screen) and `DelegateFiles.cs` (file formats). Submission Check is `CheckPage.cs`
  - A tab marks itself with `[Tab("key")]` and the main window finds it. Adding or changing a tab needs no edits elsewhere
  - Tabs never call each other directly. They pass small messages (`MainForm.Me.SendTo("files", "open-folder", path)`) or share a file in the data folder (`delegate-feed.json` → Tracker)
  - Shared helpers (saving, Excel/CSV reading, themes) are in `Util.cs` and `Theme.cs`; `XlsxWriter.cs` makes .xlsx files
- `src/taskpack-runtime.js` is the page inside an HTML task pack, copied unchanged from Lew's Tracker (`skills/delegate/taskpack.js`). `Build.bat` embeds it into the program. Keep it in step with the web app
- `Build.bat` compiles it with the `csc.exe` that ships with Windows
- `tools/make_icon.py` remakes `src/app.ico`
- The old `QuickLaunch.hta` in the parent folder is separate and is not changed by this program
