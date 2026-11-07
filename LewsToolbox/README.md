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
| 📁 Bulk Files | Rename / copy / move many files with preview, Excel round trip and Undo | Stage 2 |
| 🗂 Tracker | Your work list: Today, This week, Overdue, Board | Stage 3 |
| 📋 Delegate | Give tasks to people (Excel sheet or HTML task pack) and load their updates back | Stage 4 |
| ✅ Submission Check | Check a folder's file count and file names against your list | Stage 5 |

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
- `Build.bat` compiles it with the `csc.exe` that ships with Windows
- `tools/make_icon.py` remakes `src/app.ico`
- The old `QuickLaunch.hta` in the parent folder is separate and is not changed by this program
