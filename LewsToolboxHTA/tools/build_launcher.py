"""Makes tabs/launcher.html (the Launcher tab) from QuickLaunch's own code: ../src/QuickLaunch.template.hta.
QuickLaunch.hta itself is never changed. Run again after QuickLaunch is updated:
    python3 LewsToolboxHTA/tools/build_launcher.py
What changes for the Toolbox:
  - no <hta:application> (the main window is the app); name, order and icon for the side menu
  - the list is saved in the Toolbox data folder (or the QuickLaunch folder, if picked in Settings)
  - the window size, icon file and taskbar shortcut are left to the main window
  - theme and text size follow the Toolbox Settings (and changing them here changes every tab)
"""
import pathlib, re

here = pathlib.Path(__file__).resolve().parent
src = (here.parent.parent / 'src' / 'QuickLaunch.template.hta').read_text()
t = src


def sub(pattern, repl, text, count=1, flags=0):
    new, n = re.subn(pattern, repl, text, count=count, flags=flags)
    assert n >= 1, 'pattern not found: ' + pattern[:60]
    return new


# 1. the main window is the application
t = sub(r'<hta:application[\s\S]*?/>\n', '', t)
t = sub(r'<title>QuickLaunch</title>',
        '<title>Launcher</title>\n<meta name="lt-order" content="1">\n<meta name="lt-icon" content="&#128640;">\n'
        '<!-- MADE BY tools/build_launcher.py FROM src/QuickLaunch.template.hta - change that file, not this one. -->', t)
t = t.replace('__ICO__', '').replace('__LOGO__', '')

# 2. the logo and taskbar button belong to the main window
t = sub(r'</style>\n<style id="themeCss">', '#logo,#brand{display:none}\n</style>\n<style id="themeCss">', t)
t = sub(r'<div class="fld"><label>Taskbar</label>', '<div class="fld" style="display:none"><label>Taskbar</label>', t)

# 3. before QuickLaunch starts: where the list lives, and the Toolbox look
t = sub(r'\n<script>\n/\* =+\n   QuickLaunch', '''
<script src="../core/lt-core.js"></script>
<script>
/* Lew's Toolbox: the list lives in the Toolbox data folder, or next to QuickLaunch.hta if picked in Settings */
(function () { var s = LT.settings(); window.QL_DIR = s.launcherHome || LT.dataDir(); window.QL_SELF = LT.pathFromUrl(location.href); })();
function ltSync() { var s = LT.settings(); if (store) { store.theme = s.theme; store.size = s.size; } }
</script>
<script>
/* ================================================================
   QuickLaunch''', t)

# 4. start-up: no window sizing, no icon file / shortcut (the main window does those)
t = sub(r'load\(\); sizeWindow\(\);', 'load(); ltSync();', t)
t = sub(r'  try\{ if\(canSave&&!fso\.FileExists\(DIR\+"\\\\QuickLaunch\.ico"\)\)[\s\S]*?\},4000\); // after the icon file has surely been written\n', '', t)

# 5. after QuickLaunch: talk to the main window
t = sub(r'</script>\n</body>', '''</script>
<script>
/* Lew's Toolbox: theme / size changes go both ways, Ctrl+1..9 switches tabs */
(function () {
  var st = setTheme, sz = setSize;
  setTheme = function (k) { st(k); var s = LT.settings(); s.theme = k; LT.saveSettings(s); if (LT.main()) LT.main().themeChanged(window); };
  setSize = function (k) { sz(k); var s = LT.settings(); s.size = k; LT.saveSettings(s); if (LT.main()) LT.main().themeChanged(window); };
  window.ltTheme = function () { ltSync(); save(); applyLook(); render(); };
  window.ltReload = function () { location.reload(); };
  window.ltShown = function () { try { $("q").focus(); } catch (e) { } };
  LT.tabKeys();
})();
</script>
</body>''', t)

assert all(ord(c) < 127 for c in t), 'keep it pure ASCII like QuickLaunch'
out = here.parent / 'tabs' / 'launcher.html'
out.write_text(t, newline='\r\n')
print('built', out, len(t), 'chars')
