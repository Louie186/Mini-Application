# QuickLaunch (v2)

A one-file Windows launcher for your everyday tools, folders, web links and multi-step "actions".

## Files

- `QuickLaunch.hta` – the new, improved version (use this one)
- `QuickLaunch-original.hta` – your original file, kept for reference

## How to use

- Put `QuickLaunch.hta` in any folder and double-click it
- Your shortcuts are saved in `quicklaunch-data\shortcuts.json` next to it
- Already using the old version? Drop the new file in the **same folder** – all your tiles, groups and settings carry over

## What's new in v2

**Right-click menu on every tile**
- Open
- Run as administrator
- Open file location
- Copy path
- Add / remove from Favourites
- Edit, Duplicate, Delete

**Better shortcuts**
- "Extra options" box – e.g. open Revit straight into a model file
- "Run as administrator" setting per program
- Notes box – shows when you hover over a tile

**Missing-file warning**
- Tiles show a red **!** if the file or folder can't be found (moved, renamed, or network drive offline)
- Checked quietly in the background so the window doesn't freeze

**Faster searching**
- Just start typing – search box takes over
- `Ctrl+F` or `/` – jump to search
- `Enter` – opens the top result
- `Esc` – clears the search
- Searches names, groups, notes and paths (e.g. "revit p:" finds Revit tiles on P:)

**Groups made easy**
- Click the ⚙ group tab for a proper window: rename, pick a colour, move left/right, delete
- (Replaces the old "type R, D or C" pop-ups)

**Safety and fixes**
- Automatic daily backup of your shortcuts (last 7 days) in `quicklaunch-data\backups`
- Wallpaper now saves straight away (before, it was lost unless you pressed Apply)
- CSV import now uses the normal Windows file picker (old one only worked on Windows XP)
- CSV export/import now includes options, admin and notes
- Changing a tile's path now refreshes its icon

**Look and feel**
- Your name in the greeting is now a setting (Settings → Your name)
- Greeting line shows your most-used tool
- Midnight, Forest and Mono themes now have their own real colours

## Everything else still works as before

- Grid / list view, themes, accent colours, wallpaper
- Drag tiles to reorder
- Recent and Favourites tabs
- Multi-step actions (open several apps/folders/sites in one click)
- Idle Pong and Stickman Fight
