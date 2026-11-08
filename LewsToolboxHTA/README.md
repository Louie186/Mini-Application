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
| 📋 Delegate | Coming |
| ✅ Submission Check | Coming |
| ⚙ Settings | ✅ |

## Launcher

- Works exactly like QuickLaunch (same buttons, keys, Excel bulk edit, timer)
- Its list is separate from your QuickLaunch.hta list, unless you choose:
  - **Settings → Launcher list → Use my QuickLaunch list…** and pick the folder that has QuickLaunch.hta
  - Then both show the same list. Don't keep both open at the same time (the last one closed saves)
- QuickLaunch.hta itself is never changed

## Bulk Files

Nothing changes on disk until you click **▶ Preview and run…** and say OK.

1. **Pick folder…** (Include subfolders; **Only:** e.g. `*.pdf; *.dwg`) – or right-click a folder in the Launcher → **Open in Bulk Files**
2. New names (ticked files only): **Find / Replace**, **Add at start / end**, **Number ▾**, **More ▾** (case, spaces, remove characters, date, file ending), or type in the **New name** box
   - Or **Edit new names in Excel** → change the *New name* column → save → **Load names from Excel**
3. **Check** column: green OK · orange warning (still runs) · red problem (skipped: bad characters, same name twice, already exists, path too long)
4. **What to do:** Copy (default, safe) · Move · Rename in place – Move and Rename stay 🔒 locked until you tick *Allow changes to the original folder* (locks again after each run)
5. **Never overwrites, never deletes.** **Undo last run** renames / moves back, or sends copies to the Recycle Bin. A CSV log is saved for every run; **History** lists them

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
