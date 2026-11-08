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

| Tab | Status |
|---|---|
| 🚀 Launcher | ✅ Your full QuickLaunch, inside the Toolbox |
| 📁 Bulk Files | ✅ Rename / copy / move with preview, Excel, lock and Undo |
| 🗂 Tracker | ✅ Your work list: Today / Week / Overdue / Board, repeats, timer, weekly summary |
| 📋 Delegate | ✅ Tasks to people: Excel sheet / HTML task pack out, replies back, Team view |
| ✅ Submission Check | Coming |
| ⚙ Settings | ✅ |

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
- **+ Detailed…** for every field (project, due, priority, status, waiting on, repeat, notes, time)
- **Views:** Today · This week · Overdue (red) · All open · **Board** (drag cards between To do / Doing / Waiting / Done) · Done
- Tick = done · double-click = edit · right-click = status, due date, timer, add time, duplicate, delete
- **Repeat** daily / weekdays / weekly / monthly: tick it done and the next one is made
- **Time:** right-click → Start timer (shown at the top), or Add time (`1.5` or `0:45`)
- **Export ▾:** copy this week's summary for email / Teams, or CSV for Excel
- Delegated tasks (from the Delegate tab) show with 📋 as "Waiting on <name>"

## Delegate

1. **+ New task**: title, group, project, **Assigned to** (comma between names), due date, notes, and **checklist items** (each with its own person / date). IDs are made for you: `T001`, `T001.1` …
2. **📤 Send to people…** – tick people and file types. Each person gets only their tasks:
   - **Excel task sheet** (yellow boxes, Status drop-down, + / − groups, NEW blocks to add work) – made through your Excel
   - **HTML task pack** – opens in any browser (phone too); they press **Save reply** and send you the .txt
   - **Simple Excel table**
   - Saved in `exports\Delegate\<date time>`, and the folder opens – attach to email / Teams
3. **⬆ Load replies…** (their Excel file or reply .txt) or **📋 Paste reply…** – you see every change first, then OK. Loading the same reply twice adds nothing
4. Views: **Tasks** (progress, late in red) · **👥 Team** (open, late, this / next week, Behind / Busy / Has room) · **🌐 Lew's Tracker** (read-only, when linked)
- Right-click a row: status, send this task, history, duplicate, delete. **More ▾**: CSV export, sent / received log, project name, copy Lew's Tracker tasks in
- Same formats as Lew's Tracker (web app). Open tasks show in the Tracker as "Waiting on <name>"

## Settings

- Themes (Light, Dark, Blueprint, Retro 8-bit, Retro Grey, Retro Console) and text size – every tab follows
- Your name, data folder, Launcher list, Lew's Tracker link, taskbar shortcut
- `Ctrl+1` … `Ctrl+9` switch tabs

## For whoever maintains this

- **One tab = one file** in `tabs\`. The main window lists every `tabs\*.html` by itself, using the page's
  `<title>`, `<meta name="lt-order">` and `<meta name="lt-icon">`. Adding or changing a tab needs no other edits
- Each tab runs in its own frame (`application="yes"`), shares `core\lt-core.js` (files, settings, themes, Excel, menus)
  and talks to others only through the main window: `LT.main().send("files", "open-folder", path)`
- Plain JavaScript (ES5) only – the HTA engine is Internet Explorer 11
- `tabs\launcher.html` is made from QuickLaunch's code: `python3 LewsToolboxHTA/tools/build_launcher.py`
- `tests\` runs the pages in Chromium with a pretend Windows (`tests/mock-windows.js`); not shipped in the zip
