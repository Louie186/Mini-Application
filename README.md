# QuickLaunch

One-click launcher for your apps, Excel files, folders and websites. One file, no install.

## Set up (1 minute)

1. Put `QuickLaunch.hta` in a normal folder (e.g. `Documents\QuickLaunch`)
   - Not inside a zip, not in Downloads if you clear it
2. Double-click it
3. Pick a look, then add your first item
4. Optional: right-click it in the taskbar → **Pin to taskbar**

- It makes a `QuickLaunch-data` folder next to itself – that's your saved list
- To move it to another PC: copy `QuickLaunch.hta` **and** `QuickLaunch-data` together

## Add an item (about 3 seconds)

- **Fastest:** copy a path or link → click QuickLaunch → **Ctrl+V** → type a description → **Enter**
  - Copy a file's path: Shift + right-click the file → **Copy as path**
- **Or:** click **+ Add** → **File...** / **Folder...** / paste a web link
- The name and file type are filled in for you
- Each item keeps a simple log:
  - Name
  - Description
  - From (who gave it, or where it came from)
  - Date (today by default)
  - Times opened and last opened (automatic)

## Use it

- **Click** an item → it opens
- **Right-click** (or `···`) → Open file location, Copy path, Edit, Duplicate, Remove
- **Search:** just start typing. **Enter** opens the top result. **Esc** clears it
- **List view** (☰) or **Icon view** (▦) – icons re-flow when you resize the window
- **List view:** click a column title (Name, From, Date...) to sort
- **Groups:** click **+ Group** to make one. Right-click a group to rename, move or delete it
- Items that can't be found (moved / drive offline) show **not found** in red

## Export a list for someone

- Click **Export ▾**
  - **PDF** – a tidy A4 table, opens when ready
  - **CSV / Excel** – opens the folder with the file selected
- It exports **what you're looking at** – pick a group or search first to narrow it down
- Files are saved in `QuickLaunch-data\exports`
- **Import CSV...** adds a list someone sent you

## Looks (⚙)

- Themes: Light, Dark, Blueprint, Retro 8-bit, Game Boy
- Sizes: Compact, Normal, Large

## If something goes wrong

- **Windows blocks the file:** right-click → Properties → tick **Unblock** → OK
- **Downloaded as `.txt`:** rename it to `QuickLaunch.hta`
- **"Can't save here" message:** move it out of the zip / temp folder
- **Lost your list?** `QuickLaunch-data\library.backup.json` is an automatic backup
  - Rename it to `library.json` to restore
- **Had the old QuickLaunch in the same folder?** It offers to import your old shortcuts (⚙ → Import old QuickLaunch)

## For whoever maintains this

- Edit `src/QuickLaunch.template.hta`, then run `python3 src/build.py` to rebuild `QuickLaunch.hta` (adds the built-in icon)
