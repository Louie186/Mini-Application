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

The side menu follows the way the work flows: **WORK** (log it → hand it out → send it), **DRAWINGS**, **FILES**.

| Tab | What it does |
|---|---|
| 🏠 Home | Start of the day: today's tasks, waiting on others, next 2 weeks, recent files, team this week |
| 🚀 Launcher | Your full QuickLaunch, inside the Toolbox |
| **WORK** | |
| 🗂 Tasks | Every task starts here: your own to-dos and work to hand out – description, checklist, who (a person or a group), references |
| 📋 Delegate | Hand tasks out from Tasks: task packs with the references, groups with a lead, replies back · Board, Calendar, Team & groups, Workload |
| 📨 Transmittal | Numbered issue sheets (TR-001…) and their log – delegating makes one for each person by itself |
| **DRAWINGS** | |
| 📘 Drawing Register | Load each new MIDP: new / removed / retitled drawings, and every drawing's Tower / Typology / Model |
| 🔎 Find Drawings | Where is this drawing? Every file of it in one or more folders: revision, type, location |
| ✅ Folder Check | One folder, four views: **Submission check** · **Contents & checklist** · **Names** · **Compare** |
| 🗄 Superseded | Printed sheets: latest revision stays, older ones move to "Superseded" |
| **FILES** | |
| 📁 Bulk Files | Rename / copy / move with preview, Excel, multi-select, lock and Undo |
| 📂 Project Folders | Your standard folder tree for a new project in one click |
| 📊 Weekly Report | One click: done, delegated, sent, next week, team load – copy / email / save |
| ⚙ Settings | Looks, data folder, Launcher list, links, taskbar shortcut |

## The workflow: Tasks → Delegate → Transmittal

1. **Tasks** – log the task: what, description, checklist, **who does it** (a person or a group) and **references** (links, files, folders, drawings, notes – for the task and for each checklist item)
2. **Delegate** – **📥 From Tasks…** (or right-click the task in Tasks → **Delegate this task…**). The task comes across with everything, and **Send** opens
   - A **person** gets their own task pack. A **group** goes to its **lead**, who picks who does each item
3. **Make the files** – each person (or lead) gets a **transmittal folder** (TR-…): the transmittal sheet, their task pack and the reference files. Send that folder
4. Replies come back in **Delegate** (Load replies / Paste reply). **Tasks** shows who has it, how far it is (2/5 done), and marks it done when it's completed

## Looks and the side menu

- **Settings → Looks:** two new looks, **Slate** (dark) and **Slate Light**
  - Clean dashboard style: one steel-blue colour, pill-shaped buttons, rounded cards
  - The tab you're on gets a thin blue bar on its left
- **Fold the menu:** click **◀** next to *Lew's Toolbox* (or press **Ctrl+[**)
  - The menu shrinks to icons only. Click **▶** (or Ctrl+[ again) to open it
  - Remembered next time

## Tables (every tab)

- **No.** – every row has a number on the left, so you always know which row you're on
- **Column titles stay on top** when you scroll down
- **No. + column A are frozen** – the row number and drawing / document number (and any tick box) stay in place when you scroll sideways
  - It never wraps, so the number is always on one line
- **Change a column's width** – drag the right edge of its heading (it turns blue when you point at it)
  - **Double-click** the edge = back to normal
  - Widths are remembered per tab on this PC
- **Long text wraps** onto more lines instead of being cut off
- **Codes in a fixed-width font (Consolas)** – drawing numbers, revisions, IDs, models, file names and folders, so they line up character for character
  - Titles, notes and buttons stay in the normal font (easier to read)
  - The Retro looks keep their own font

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

## Tasks

- **Quick add:** type and press **Enter**. Words it understands: `today`, `tomorrow`, `mon` … `sun`, `next week`, `25/11` (due date), `#Tower1` (project, `_` for spaces), `!` / `!low` (priority), `@Sam` (waiting on Sam), `&MEP_Team` (who does it)
  - Example: `Check RFI drawings fri #Tower1 !`. Added in **Today** with no date = due today
- Every task gets an ID: `TL-001`, its checklist items `TL-001.1` …
- **+ Detailed…** for every field:
  - **Who does it** – empty = you. A person, or a group (groups are made in Delegate → Team & groups)
  - **Description / notes**, project, due (click it for a calendar), priority, status, repeat, time
  - **References for the whole task** – pick 🔗 Link · 📄 File · 📁 Folder · 📐 Drawing · 📝 Note, type or **Browse…**, **+ Add**
    - **Show as** (optional) – a short name instead of the long link / path, e.g. paste the ACC link and type `ACC – Tower 1 model`
    - Without a name it shows neatly by itself: a link shows its page / file name and the site (`Roof Kitchen Equipment Schedule.xlsx · keo.sharepoint.com`), a path shows the file name and only the last two folders (`…\Markups\2026-11-10`)
    - Click the name to open it · point at it to see the full link / path · **✎** to rename or change the link (Enter = done)
    - Files and folders: **Send a copy** (copied into the transmittal) or **Link only** (already on a shared drive)
    - Drawings: several at once (one per line, or `,` between). The title comes from the Drawing Register
  - **Checklist** – items with their own person, date, status and **📎 references** (click 📎 on the item)
  - **📋 Save and delegate** – saves, then hands it to Delegate
- **Views:** Today · This week · Overdue (red) · **To delegate** · **Waiting on others** · All open · **Board** · Done
- Tick = done · double-click = edit · right-click = **Delegate this task…**, status, due date, timer, add time, duplicate, delete
- **Repeat** daily / weekdays / weekly / monthly: tick it done and the next one is made
- **Time:** right-click → Start timer (shown at the top), or Add time (`1.5` or `0:45`)
- **Export ▾:** copy this week's summary for email / Teams, or CSV for Excel (with checklist and references)

### Task folders (everything about one task in one place)

- In Tasks: right-click a task → **📁 Make a task folder…** (or **📁 Task folder…** in the task window)
  - **Where:** you choose every time (Browse…) · **Folder name:** you type it (the task's name is suggested)
  - It makes: `Reference\` (what it's based on) · `Incoming\` (what comes back) · `Output\` (what you produce)
  - Kept out of the way in `Reference\Backup and Ref\`: **Task Summary.html** + **.pdf**, `Notes.txt`, and the hidden `_task.json` (+ `_task.backup.json`, the one before). Folders made before are tidied into it on the next save
- **Changed in Explorer?** The Toolbox reads the folders every time: a file you rename, add or delete in Explorer shows up as it is (the window checks every few seconds; **Read again** at once). A task reference pointing to an old name says **⚠ not found (renamed or moved?)** – ✎ to fix
- **Filling it** (tabs Reference / Incoming / Output / Notes):
  - Drag files from Explorer, or emails from Outlook, into the box (Windows: **Ctrl** = copy, **Shift** = move)
  - **+ Add files…** / **+ Add a folder…** – choose **Copy** or **Move** (remembered). The same name twice gets (2), (3)…
  - **📋 Paste screenshot** – take a snip (Win+Shift+S), click it: saved as `Screenshot <date time>.png`
  - **📝 Notes** – type or paste (Teams / email text, a call, a decision); each note gets the date and time
- **Task Summary** – made new on every save (always the folder as it is now), one professional page: details, description, notes, checklist, references, and every file of Reference / Incoming / Output **with links**. Updated when you close the window (if something changed), or **↻ Update summary (HTML + PDF)**. Open it with **📄 Open the summary** – the links open the files (the HTML keeps working if you move the folder; the PDF is made again on the next save). If the PDF is open in a viewer, close it and update again. The PDF is printed by Edge (or Chrome, or Word) without opening a window
- **📂 Open a task folder…** (top of Tasks) – pick any task folder: its task opens. If it isn't in your Tasks (another PC, or deleted), it's added back from the folder
- The task shows **📁 folder** in the list (click it). **Delegate this task**: the files in **Reference** go along as references (copied into the transmittal)

## Delegate

1. **📥 From Tasks…** – the tasks you logged with someone in "Who does it" and haven't handed out yet. Pick one: it becomes `T001` (with its checklist `T001.1` … and references) and **Send** opens
   - **More ▾ → + New task here** still makes a task only in Delegate (not in Tasks)
2. **📤 Send to people…** – tick people and file types. Each person gets only their tasks; a group's task goes to its **lead**
   - **Excel task sheet** (yellow boxes, Status drop-down, + / − groups, NEW blocks, a **References** column) – made through your Excel
   - **HTML task pack** – opens in any browser (phone too); references are clickable; they press **Save reply** and send you the .txt
   - **Simple Excel table**
   - **Make a transmittal for each person** (on by default) – see below
   - Saved in `exports\Delegate\<date time>`; reference copies go into its `References` folder
3. **⬆ Load replies…** (their Excel file or reply .txt) or **📋 Paste reply…** – you see every change first, then OK. Loading the same reply twice adds nothing

**Groups and leads** (view **👥 Team & groups** → **+ Group**, double-click to edit)
- A group = name, **lead**, members. A task for the group goes **only to the lead**
- The lead's HTML pack has an **Assign to** box on every item (their team); in the Excel sheet the **Assignee** column is yellow with a drop-down
- When the lead's reply comes back you see who does what ("Sam assigned T001.2 to Ben"); Team and Workload count each item for that person

**References in the packs**
- 🔗 links open the web page · 📄 / 📁 **Send a copy** open the copy in `References\` next to the pack · **Link only** opens the original path · 📐 drawings and 📝 notes are listed
- A reference file that can't be found is named in a message and in the pack, but not copied

**Transmittal for each person** (Send → "Make a transmittal for each person")
- `TR-…` folder (in the Transmittal tab's folder): the **transmittal sheet**, their **task pack(s)** and their **reference copies** (`References\…`, so the pack's links work there too). Drawings in the references are listed on the sheet
- Purpose **For action**; notes name the tasks (`T001`, `TL-001`). It's in the Transmittal log, the Delegate task's history and in Tasks

**Views:** **Tasks** (progress, late in red) · **▦ Board** · **📅 Calendar** · **👥 Team & groups** · **📊 Workload** · **🌐 Lew's Tracker** (read-only, when linked)
- **▦ Board** – drag a card to another column to change its status (a task with items follows its items)
- **📅 Calendar** – drag to another day to change the due date (**bold** = the task, **↳** = only its items that day; with a person picked, only theirs). Every move is in the task's **History**
- Every drag shows a message with **Undo** for 6 seconds
- **📊 Workload** – people and hours per week (click a name to change hours, e.g. part-time); type the **hours each open task needs**; the heat-map shows green has room · amber 80–100% · red overloaded. Click a box to see its tasks. **Options ▾**: include your own tasks, hours for tasks with no estimate, weeks to show, export
- Right-click a row: status, send this task, history, duplicate, delete. **More ▾**: new task here, new group, CSV export, sent / received log, project name, copy Lew's Tracker tasks in

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
- **Folder Check** looks drawings up here (Contents & checklist: Checklist ▾ → Drawing Register)
- Nothing about a project is written into the program – each project lives in `register\` in your data folder

## Folder Check

Pick the folder once – every view uses it (and remembers which view you used last):
- **✅ Submission check** – the folder against your list (revisions, file types, wrong folder, Remaining on top) – below
- **🔍 Contents & checklist** – what's in the folder, and a quick checklist: finished / remaining – see *Contents & checklist*
- **🏷 Names** – every file name against your naming rule – see *Names*
- **🔄 Compare** – this folder ("Now") against the last submission – see *Compare*

### Submission check

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
- **⬆ Remaining on top** (tick box next to Show, on by default): drawings **not yet in the folder** go to the top under **⏳ Remaining**, then **✔ In the folder** in your list's order
  - Order on top: Missing → Missing file type → Wrong revision. The red number next to it = how many are remaining
  - Untick to keep your list's order. Remembered
- **Report ▾:** Excel report (through Excel, or CSV if Excel isn't there), copy summary for email / Teams, other notes
- **Fix names in Bulk Files** opens the folder in Bulk Files. Folder, list and columns are remembered

### Contents & checklist

**Quick checklist check – what's finished, what's still missing**
1. **Folder...** – the folder to check (subfolders too)
2. **Checklist ▾** – your list:
   - **Paste a list** (quickest): one drawing number per line, copied from Excel or an email. A description after it (tab or two spaces) is kept
   - or your Drawing Register, your Submission check list, or any Excel / CSV
   - **Each drawing needs:** (optional) e.g. `pdf, dwg` – a drawing only counts as finished when it has all of these
3. It opens on **Remaining**. The bar on top shows how far you are:
   - **✔ Finished** (green) · **◐ Lacking** a file type (amber) · **✖ Missing** (red)
   - Buttons: **Remaining** · **Finished** · **Whole checklist** · **In the folder, not on the checklist**
- Matches the drawing number with or without the revision, with a date in front, or with the title after it
- **Export ▾** → CSV of what's shown, or **Copy what's remaining** (for email / Teams)
- Your checklist, the file types needed and the view are remembered


The folder comes first – "what's in here?"

1. **Folder…** (include subfolders). The first time it asks **which list gives the Tower / Typology / Model**:
   - your **Drawing Register**, the list you use in Submission check, **another Excel / CSV list**, or **none** (just drawings and file types)
   - Change it any time with **Reference list ▾**; the columns are guessed and can be changed (Sheet, Number, Description, Tower, Typology, Model)
   - With a **Drawing Register**, any Tower / Typology / Model your list doesn't have comes from the register (even with "none")
   - File names with extra text work too, e.g. `…-10100-T1 - Title.pdf` or `20261101_…-10100-T1.pdf`
2. Each drawing is shown **once**: its revisions (`T1, T2`), **file types** (`dwg`, `pdf ×2`, `rvt`), description, Tower, Typology, Model, folder
   - Top line: drawings, files, found in the list, **not in the list**, more than one revision, and a **count per file type** (click one to show only it)
3. **Show:** every drawing · not in the reference list · more than one revision · **summary by tower / typology** · other files (not drawings). Filters: Tower, Typology, File type, search
- **Export ▾:** CSV, copy summary for email / Teams, check this folder in the Submission check view, open it in Bulk Files. Double-click a row to open its folder

### Names

1. **Naming rule** – starts with an ISO 19650 rule (Project-Originator-Volume-Level-Type-Role-Number-Revision). **✎ Change the rule** (per part: any text / N letters / N digits / list of codes / revision) or **Rule ▾ > Set up from an example name**. Keep several rules (one per project)
2. **Folder** (subfolders, only some types)
3. **Check names** – each wrong name says which part is wrong ("Type XX is not an allowed code"). **Export (CSV)**, **Fix names in Bulk Files**

### Compare

- **Before** and **Now**: each a folder or a list (Excel / CSV) → **Compare**
- Matched by drawing number: ➕ **New** · ↻ **Revised** (P01 → P02) · ✖ **Removed** · ⚠ **Same revision, file changed** (folders: re-issued without a new revision?) · Unchanged
- **Copy summary** for the email "changes since last issue", or **Export (CSV)**

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

## Home

- Opens first. **Add a task for today** goes straight into Tasks
- **Today** (late, due today, doing) · **Waiting on others** (open delegated items, late first) · **Next 2 weeks** (every date from Tasks and Delegate, busy days in red) · **Recent files** (from the Launcher) · **Team this week** (once Delegate → Workload is used)
- Click anything to jump to its tab

## Transmittal

1. Project, **To**, Attention, Purpose of issue, Notes
2. Documents: **From a folder**, **Paste a list**, or Folder Check (Submission check) → Report ▾ → **Make a transmittal** – and **Delegate** makes one for each person by itself. **Fill titles from my list** uses the list set up in Folder Check
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

## Settings

- **Hover tips** (on by default): point at a tab in the side menu to see what it does. Settings also lists **what each tab does**
- Looks (Light, Dark, Blueprint, Retro 8-bit, Retro Grey, Retro Console, Slate, Slate Light) and text size – every tab follows
- Your name, data folder, Launcher list, Lew's Tracker link, taskbar shortcut
- `Ctrl+1` … `Ctrl+9` switch tabs

## For whoever maintains this

- **One tab = one file** in `tabs\`. The main window lists every `tabs\*.html` by itself, using the page's
  `<title>`, `<meta name="lt-order">`, `<meta name="lt-group">` (WORK / DRAWINGS / FILES heading, `-` = a line), `<meta name="lt-icon">` and `<meta name="lt-desc">` (the hover tip). Adding or changing a tab needs no other edits
- `tabs\parts\` = pages shown **inside** a tab (not in the menu): Workload (in Delegate); Contents, Naming, Compare (in Folder Check). `LT.appDir()` works from there too; `LT.folderPicked(f)` shares a folder with the other Folder Check views
- `core\lt-refs.js` – references (editor, labels, plain-text lines) used by Tasks and Delegate
- `core\lt-transmittal.js` – making a transmittal (`LT.trMake`), used by the Transmittal tab and by Delegate
- `core\lt-taskfolder.js` – task folders (`LT.tfMake`, `tfAdd`, `tfPasteShot`, `tfSave` = _task.json + Notes.txt + summary HTML/PDF, `tfRead`)
- `core\taskpack-runtime.js` – the HTML task pack page; the Toolbox adds references and the lead's "Assign to" (no curly brackets in its top comments)
- Tasks ↔ Delegate: `LT.main().send("delegate", "from-log", task)`, back with `LT.main().post("tracker", "delegated", …)` (post = no tab switch) and `delegate-feed.json` (code, log, to, tr, progress, status)
- Date boxes: `LT.datePicker(test)` adds the pop-up calendar (dd/mm/yyyy)
- `LT.register()` gives the current Drawing Register for look-ups (`find(number or file name)`)
- Lists are read with `LT.readList` (sheet choice, heading row or none, drawing-number column) and `LT.isCategory` (title rows)
- Each tab runs in its own frame (`application="yes"`), shares `core\lt-core.js` (files, settings, themes, Excel, menus)
  and talks to others only through the main window: `LT.main().send("files", "open-folder", path)`
- Plain JavaScript (ES5) only – the HTA engine is Internet Explorer 11
- `tabs\launcher.html` is made from QuickLaunch's code: `python3 LewsToolboxHTA/tools/build_launcher.py`
- `tests\` runs the pages in Chromium with a pretend Windows (`tests/mock-windows.js`); not shipped in the zip
