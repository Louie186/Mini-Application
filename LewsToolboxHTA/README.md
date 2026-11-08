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
| 📁 Bulk Files | Coming next |
| 🗂 Tracker | Coming |
| 📋 Delegate | Coming |
| ✅ Submission Check | Coming |
| ⚙ Settings | ✅ |

## Launcher

- Works exactly like QuickLaunch (same buttons, keys, Excel bulk edit, timer)
- Its list is separate from your QuickLaunch.hta list, unless you choose:
  - **Settings → Launcher list → Use my QuickLaunch list…** and pick the folder that has QuickLaunch.hta
  - Then both show the same list. Don't keep both open at the same time (the last one closed saves)
- QuickLaunch.hta itself is never changed

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
