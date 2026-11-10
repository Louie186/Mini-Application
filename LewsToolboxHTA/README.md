# Lew's Toolbox (HTA version)

The same kind of file as QuickLaunch, so it runs on PCs where new programs (.exe) are blocked.
No install, no build step.

## Set up

1. Right-click the zip → **Properties** → tick **Unblock** → OK, then **Extract All**
2. Keep these together in one folder:
   - `LewsToolbox.hta` – double-click this to open
   - `LewsToolbox.ico`
   - `core\` and `tabs\` folders
3. Optional: ⚙ Settings → **Make taskbar shortcut**, then pin that shortcut

- Your work is saved in `LewsToolbox-data` next to it (Settings → Data folder to move it, e.g. to OneDrive)
- Settings for this PC are in `%APPDATA%\LewsToolbox\settings-hta.json`

## Tabs

| Tab | What it does |
|---|---|
| 🏠 Home | Start of the day: today's tasks, waiting on others, next 2 weeks, recent files, team this week |
| 🚀 Launcher | Your full QuickLaunch, inside the Toolbox |
| 📁 Bulk Files | Rename / copy / move with preview, Excel, multi-select, lock and Undo |
| 🗂 Tracker | Your work list: Today / Week / Overdue / Board, repeats, timer |
| 📋 Delegate | Tasks to people: Excel sheet / HTML task pack out, replies back, Team view |
| 📘 Drawing Register | Load each new MIDP: new / removed / retitled drawings, and every drawing's Tower / Typology / Model |
| ✅ Submission Check | Folder vs your list: missing, wrong revision, missing type, extra files |
| 🔎 Find Drawings | Where is this drawing? Every file of it in one or more folders: revision, type, location |
| 🔍 Folder Contents | Pick a folder: every drawing once, its revisions, file types, and Tower / Typology / Model from your list |
| 🏷 Naming Checker | Every file name vs your naming rule (ISO 19650 style), part by part |
| 🔄 What Changed | Two submissions compared: new, revised, removed, same rev but changed |
| 📨 Transmittal | Issue sheet (Excel) with numbering, log, copy files to the transmittal folder |
| 🗄 Superseded | Printed sheets: latest revision stays, older ones move to "Superseded" |
| 📂 Project Folders | Your standard folder tree for a new project in one click |
| 📊 Weekly Report | One click: done, delegated, sent, next week, team load – copy / email / save |
| 👥 Team Workload | Hours per task and per person per week, as a heat-map |
| ⚙ Settings | Looks, data folder, Launcher list, links, taskbar shortcut |

## Looks and the side menu

- **Settings → Looks:** two new looks, **Slate** (dark) and **Slate Light**
  - Clean dashboard style: one steel-blue colour, pill-shaped buttons, rounded cards
  - The tab you're on gets a thin blue bar on its left
- **Fold the menu:** click **◀** next to *Lew's Toolbox* (or press **Ctrl+[**)
  - The menu shrinks to icons only. Click **▶** (or Ctrl+[ again) to open it
  - Remembered next time

## Tables (every tab)

- **Column A is frozen** – the drawing / document number (and any tick box before it) stays in place when you scroll sideways
  - It never wraps, so the number is always on one line
- **Change a column's width** – drag the right edge of its heading (it turns blue when you point at it)
  - **Double-click** the edge = back to normal
  - Widths are remembered per tab on this PC
- **Long text wraps** onto more lines instead of being cut off

## Launcher

- Works exactly like QuickLaunch (same buttons, keys, Excel bulk edit, timer)
- Its list is separate from your QuickLaunch.hta list, unless you choose:
  - **Settings → Launcher list → Use my QuickLaunch list…** and pick the folder that has QuickLaunch.hta
  - Then both show the same list. Don't keep both open at the same time (the last one closed saves)
- QuickLaunch.hta itself is never changed

## Bulk Files

Three steps on screen. Nothing changes on disk until you click **▶ Preview and run…** and say OK.

1. **Pick folder…** (or right-click a folder in the Launcher → Open in Bulk Files). **Options ▾**: include subfolders, only some files (e.g. `*.pdf`)
2. **New names** for the ticked files: **Find → Replace with** (e.g. `_P01` → `_P02`), or type in the **New name** box
   - **More name tools ▾**: add text at the start / end, numbering, case, spaces, remove characters, date, file ending, put names back
   - **Excel ▾**: edit the new names in Excel, then load them back
3. Choose **Copy to a folder** (default, safe), **Move to a folder** or **Rename in place** → **Preview and run…**
   - Move and Rename stay 🔒 locked until you tick *Allow changes to the original folder* (locks again after each run)

**Select several rows like File Explorer:** click, **Ctrl+click**, **Shift+click**, **Ctrl+A**
- **Space** = tick / untick the selected rows; ticking one box of a selection ticks them all
- **Delete** = take the selected rows off the list (the files themselves are not touched)
- **Right-click** = tick / untick, tick only these, take off the list, put names back, show in folder

**Check** column: green OK · orange warning (still runs) · red problem (skipped). **Never overwrites, never deletes.** **Undo last run** puts things back; a CSV log is saved for every run.

## Tracker

- **Quick add:** type and press **Enter**. Words it understands: `today`, `tomorrow`, `mon` … `sun`, `next week`, `25/11` (due date), `#Tower1` (project, `_` for spaces), `!` / `!low` (priority), `@Sam` (waiting on Sam)
  - Example: `Check RFI drawings fri #Tower1 !`. Added in **Today** with no date = due today
- **+ Detailed…** for every field (project, due – click it for a calendar, priority, status, waiting on, repeat, notes, time)
- **Views:** Today · This week · Overdue (red) · All open · **Board** (drag cards between To do / Doing / Waiting / Done) · Done
- Tick = done · double-click = edit · right-click = status, due date, timer, add time, duplicate, delete
- **Repeat** daily / weekdays / weekly / monthly: tick it done and the next one is made
- **Time:** right-click → Start timer (shown at the top), or Add time (`1.5` or `0:45`)
- **Export ▾:** copy this week's summary for email / Teams, or CSV for Excel
- Delegated tasks (from the Delegate tab) show with 📋 as "Waiting on <name>"

## Delegate

1. **+ New task**: title, group, project, **Assigned to** (comma between names), due date (**click it for a calendar**), notes, and **checklist items** (each with its own person / date). IDs are made for you: `T001`, `T001.1` …
2. **📤 Send to people…** – tick people and file types. Each person gets only their tasks:
   - **Excel task sheet** (yellow boxes, Status drop-down, + / − groups, NEW blocks to add work) – made through your Excel
   - **HTML task pack** – opens in any browser (phone too); they press **Save reply** and send you the .txt
   - **Simple Excel table**
   - Saved in `exports\Delegate\<date time>`, and the folder opens – attach to email / Teams
3. **⬆ Load replies…** (their Excel file or reply .txt) or **📋 Paste reply…** – you see every change first, then OK. Loading the same reply twice adds nothing
4. Views: **Tasks** (progress, late in red) · **▦ Board** · **📅 Calendar** · **👥 Team** (open, late, this / next week, Behind / Busy / Has room) · **🌐 Lew's Tracker** (read-only, when linked)
5. **▦ Board** – drag a card to another column to change its status
   - A task with items gets its status from its items, so it doesn't move (a message says why)
6. **📅 Calendar** – drag to another day to change the due date
   - **Bold** chip = the task's own due date · **↳** chip = only its items due that day
   - With a person picked, only that person's items move
   - Every move is written in the task's **History**
- Every drag shows a message with **Undo** for 6 seconds
- Right-click a row: status, send this task, history, duplicate, delete. **More ▾**: CSV export, sent / received log, project name, copy Lew's Tracker tasks in
- Same formats as Lew's Tracker (web app). Open tasks show in the Tracker as "Waiting on <name>"

## Drawing Register

One list of every drawing in a project, kept up to date from the MIDP. One register per project (**Project ▾**: new, rename, remove).

**First time for a project (about 2 minutes)**
1. **+ Make a project**, then **⚙ Setup**:
   - **Tower is part no. …** of the drawing number (e.g. `3` for `PRJ-ABC-T1-…`), or 0
   - **Models table → Import from Excel…** (a sheet with Tower, Typology, Model number headings), or type `Tower | Typology | Model` lines
   - **Import an existing drawing list…** (e.g. your last generated list or base data) – these count as checked
   - **Typology rules** (optional): `Unit Type {n} BR - Type {x} => {n}BR{x}`
2. **📥 Load new MIDP…** – the first time it asks which sheet has the drawings, then remembers it

**Every new MIDP**
- **📥 Load new MIDP…** → you see ➕ new, ✖ removed, ✎ title changed, ↩ back, then **Save to the register**
- New drawings get a **Tower / Typology guess** (orange) from:
  1. a known drawing with the most similar title
  2. your typology rules
  3. a section whose drawings have no typology (`-`)
- **Model** comes from the models table (Tower + Typology)
- **To check**: tick rows (click, Shift+click) → **✔ Accept the guesses** or **Set Tower / Typology…**; double-click a row to edit one; right-click for more
- **Not for a typology ( - )** for general drawings

**Views:** In the MIDP · Changes in the last MIDP · To check · Removed from the MIDP · Everything
- **Filter:** Section ▾, Tower ▾, Typology ▾ – tick one or more; type in the box to narrow the list (e.g. `enlarged` → **Tick all shown**). The search box looks in number, title and section. **✕ Clear filters**. Export follows the filters
- **Column widths:** drag the edge of a heading (all but Drawing); double-click the edge = back to normal. Remembered on this PC
- **Export ▾:** Excel with Number, Description, Tower, Typology, Model (like the generated list), or with revision / section / status; copy the MIDP changes for email / Teams
- **History ▾:** every MIDP loaded, with its changes
- **Submission Check** and **Folder Contents** look drawings up here (Folder Contents: Reference list ▾ → Drawing Register)
- Nothing about a project is written into the program – each project lives in `register\` in your data folder

## Submission Check

1. **Submission folder…** (include subfolders)
2. **My list (Excel / CSV)…** – any register, transmittal or checklist
   - **Sheet:** it picks the sheet with drawing numbers in Column A (else the one with the most numbers); change it with the **Sheet** picker
   - Works **with or without a heading row** (no heading: Column A = numbers, Column B = description)
   - Rows like **"Residential"** or **"Enlarged drawings"** are read as **category titles**, not drawings – the results show each drawing's category
   - **Tower, Typology, Model** columns (optional): found from the headings, or – with no heading row – from what the cells look like (`Tower 1` / `T1`, `1BRA`, `21000`). Not in your list? They come from the **Drawing Register**
   - A list with only the **number part** (e.g. `10110`) matches any file with that number in its name
   - It guesses the columns; change them if needed:
   - **File name / number** (with or without revision / ending), **Revision**, **File types** (e.g. `pdf, dwg`)
   - **More ▾**: Folder column, Title column, file types every row needs (when the list has no types column)
3. **▶ Check** – every list row gets: ✔ Found · ✖ Missing · ✖ Wrong revision · ✖ Missing file type · ⚠ Wrong folder · ⚠ Listed twice · ⚠ Found with a note (case differs, empty file, old revision also there)
   - ➕ files in the folder that aren't on the list, and a **count by file type** (found / needed)
   - Each drawing shows the **file types found** (e.g. `dwg, pdf`) and its Tower / Typology / Model
   - **Tower / Typology filters**, and **Show ▾ > Summary by tower / typology**: drawings, found, missing, wrong revision, file types and model per group (also in the copied summary and the Excel report)
- **Show:** problems only, missing, wrong revision, files not on the list… Double-click a row to open its folder
- **Report ▾:** Excel report (through Excel, or CSV if Excel isn't there), copy summary for email / Teams, other notes
- **Fix names in Bulk Files** opens the folder in Bulk Files. Folder, list and columns are remembered

## Find Drawings

"Where is this drawing?" – for one drawing or a whole list.

1. **Add folder…** – one or more (e.g. the project folder and an archive), subfolders included
   - **✕** at the front of a folder takes it off the search (long paths are shortened – point at one to see it all). **New search** takes all folders off and empties the drawings box. Nothing is deleted from your drive
   - Big folders are read a little at a time: you see the count go up, and **Stop** if it takes too long
   - Read once, then every search is instant. **Read again** after files change
2. **Drawings to find** – type or paste, one per line (Ctrl+Enter = Find). Or **Load a list (Excel / CSV)…**, or **From the Drawing Register…** (by Tower / Typology / Section)
   - The revision is ignored when searching (`…-10100`, `…-10100-T2` find the same files)
   - A short number like `10270` finds the full number
   - File names with a title after the number or a date in front are found too
3. One line per file: **Drawing · Rev · Type · Location · File name · Tower / Typology**
   - The newest revision is marked **latest** (order T → P → C, the same setting as Superseded)
   - ✖ **Not found** in red for drawings with no file
- **Show:** every file / not found only / found only · **latest revision only** · file type
- **Copy the folders** (full paths), **Export ▾** (CSV, copy the result). Double-click = open the folder; right-click = open the file, copy the location

## Folder Contents

The folder comes first – "what's in here?"

1. **Folder…** (include subfolders). The first time it asks **which list gives the Tower / Typology / Model**:
   - your **Drawing Register**, the list you use in Submission Check, **another Excel / CSV list**, or **none** (just drawings and file types)
   - Change it any time with **Reference list ▾**; the columns are guessed and can be changed (Sheet, Number, Description, Tower, Typology, Model)
   - With a **Drawing Register**, any Tower / Typology / Model your list doesn't have comes from the register (even with "none")
   - File names with extra text work too, e.g. `…-10100-T1 - Title.pdf` or `20261101_…-10100-T1.pdf`
2. Each drawing is shown **once**: its revisions (`T1, T2`), **file types** (`dwg`, `pdf ×2`, `rvt`), description, Tower, Typology, Model, folder
   - Top line: drawings, files, found in the list, **not in the list**, more than one revision, and a **count per file type** (click one to show only it)
3. **Show:** every drawing · not in the reference list · more than one revision · **summary by tower / typology** · other files (not drawings). Filters: Tower, Typology, File type, search
- **Export ▾:** CSV, copy summary for email / Teams, check this folder in Submission Check, open it in Bulk Files. Double-click a row to open its folder

## Home

- Opens first. **Add a task for today** goes straight into the Tracker
- **Today** (late, due today, doing) · **Waiting on others** (open delegated items, late first) · **Next 2 weeks** (every date from Tracker and Delegate, busy days in red) · **Recent files** (from the Launcher) · **Team this week** (once Team Workload is used)
- Click anything to jump to its tab

## Naming Checker

1. **Naming rule** – starts with an ISO 19650 rule (Project-Originator-Volume-Level-Type-Role-Number-Revision). **✎ Change the rule** (per part: any text / N letters / N digits / list of codes / revision) or **Rule ▾ > Set up from an example name**. Keep several rules (one per project)
2. **Folder** (subfolders, only some types)
3. **Check names** – each wrong name says which part is wrong ("Type XX is not an allowed code"). **Export (CSV)**, **Fix names in Bulk Files**

## What Changed

- **Before** and **Now**: each a folder or a list (Excel / CSV) → **Compare**
- Matched by drawing number: ➕ **New** · ↻ **Revised** (P01 → P02) · ✖ **Removed** · ⚠ **Same revision, file changed** (folders: re-issued without a new revision?) · Unchanged
- **Copy summary** for the email "changes since last issue", or **Export (CSV)**

## Transmittal

1. Project, **To**, Attention, Purpose of issue, Notes
2. Documents: **From a folder**, **Paste a list**, or Submission Check → Report ▾ → **Make a transmittal**. **Fill titles from my list** uses the list set up in Submission Check
3. **Make the transmittal** – Excel issue sheet (CSV without Excel), numbered **TR-001, TR-002…**; tick *also copy the files* to put the files in the transmittal folder
- **Sent log ▾**: reopen or reuse a past transmittal, numbering / prefix, where transmittals are saved, export the log

## Superseded

- Pick the **printed sheets folder** → **Find old revisions**: for each drawing the latest revision stays, older ones are ticked to move (untick to keep)
- Move to a **"Superseded" folder next to them** or **one central folder** → **Preview and move** → **Undo last move** if needed
- **Options ▾**: revision order (default T, P, C – oldest to newest), folder name, central folder. Never overwrites or deletes

## Project Folders

1. **Template** – one folder per line (`01 WIP\Architecture`), `{PROJECT}` = project name. Starts with an ISO 19650 style tree; **Template ▾**: save, save as new, rename, delete, **copy the folders of an existing project**
2. **Where** – parent folder + project folder name; the preview shows what's new and what's already there
3. **Create the folders** – only missing folders are made, nothing is deleted

## Weekly Report

- **This week / Last week**, tick the parts you want: my work (done, still open, time), delegated work by person (and late items), submissions sent, next week, team load
- **Copy for email / Teams**, **Open as an email**, or **Save** (text + CSV)

## Team Workload

- **People and hours per week** (click a name to change hours, e.g. part-time). People come from Delegate
- Type the **hours each open task needs**; the heat-map shows hours per person per week: green has room · amber 80–100% · red overloaded. Click a box to see its tasks
- **Options ▾**: include your own Tracker tasks, hours for tasks with no estimate, weeks to show, export

## Settings

- **Hover tips** (on by default): point at a tab in the side menu to see what it does. Settings also lists **what each tab does**
- Themes (Light, Dark, Blueprint, Retro 8-bit, Retro Grey, Retro Console) and text size – every tab follows
- Your name, data folder, Launcher list, Lew's Tracker link, taskbar shortcut
- `Ctrl+1` … `Ctrl+9` switch tabs

## For whoever maintains this

- **One tab = one file** in `tabs\`. The main window lists every `tabs\*.html` by itself, using the page's
  `<title>`, `<meta name="lt-order">`, `<meta name="lt-icon">` and `<meta name="lt-desc">` (the hover tip). Adding or changing a tab needs no other edits
- Date boxes: `LT.datePicker(test)` adds the pop-up calendar (dd/mm/yyyy)
- `LT.register()` gives the current Drawing Register for look-ups (`find(number or file name)`)
- Lists are read with `LT.readList` (sheet choice, heading row or none, drawing-number column) and `LT.isCategory` (title rows)
- Each tab runs in its own frame (`application="yes"`), shares `core\lt-core.js` (files, settings, themes, Excel, menus)
  and talks to others only through the main window: `LT.main().send("files", "open-folder", path)`
- Plain JavaScript (ES5) only – the HTA engine is Internet Explorer 11
- `tabs\launcher.html` is made from QuickLaunch's code: `python3 LewsToolboxHTA/tools/build_launcher.py`
- `tests\` runs the pages in Chromium with a pretend Windows (`tests/mock-windows.js`); not shipped in the zip
