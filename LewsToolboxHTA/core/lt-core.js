/* ================================================================
   Lew's Toolbox (HTA) - shared core, loaded by the main window and by every tab page.
   Plain JavaScript (ES5) so it runs in Windows' built-in HTA engine, like QuickLaunch.
   Gives:  LT.fso / LT.wsh, safe text + JSON saving, settings, data folder, themes, small helpers.
   ================================================================ */
var LT = (function () {
  var L = {};
  var fso = new ActiveXObject("Scripting.FileSystemObject");
  var wsh = new ActiveXObject("WScript.Shell");
  L.fso = fso; L.wsh = wsh;
  L.shell = function () { return new ActiveXObject("Shell.Application"); };
  var J = window.JSON;

  /* ---------- where things are ---------- */
  function pathFromUrl(href) {
    var h = decodeURIComponent(href.replace(/[?#].*$/, "").replace(/^file:/i, ""));
    if (/^\/\/\//.test(h)) h = h.substring(3); else if (/^\/\//.test(h)) h = "\\\\" + h.substring(2);
    return h.replace(/\//g, "\\");
  }
  L.pathFromUrl = pathFromUrl;
  /* the folder that holds LewsToolbox.hta (tab pages live in its "tabs" subfolder) */
  L.appDir = function () {
    var p = pathFromUrl(location.href), d = p.substring(0, p.lastIndexOf("\\"));
    if (/\\(tabs|core)$/i.test(d)) d = d.substring(0, d.lastIndexOf("\\"));
    return d;
  };
  L.env = function (s) { return wsh.ExpandEnvironmentStrings(s); };
  L.settingsFile = function () { return L.env("%APPDATA%") + "\\LewsToolbox\\settings-hta.json"; };

  /* ---------- files ---------- */
  L.exists = function (p) { try { return fso.FileExists(p) || fso.FolderExists(p); } catch (e) { return false; } };
  L.mkdirs = function (p) {
    if (!p || fso.FolderExists(p)) return;
    var parent = fso.GetParentFolderName(p);
    if (parent && !fso.FolderExists(parent)) L.mkdirs(parent);
    fso.CreateFolder(p);
  };
  /* Unicode text through the File System Object - works on every Windows PC
     (some work PCs block "ADODB.Stream", as QuickLaunch found out) */
  L.writeText = function (p, t) { L.mkdirs(fso.GetParentFolderName(p)); var f = fso.CreateTextFile(p, true, true); f.Write(t); f.Close(); };
  function looksText(t) { var n = Math.min(t.length, 400), ok = 0; for (var i = 0; i < n; i++) { var c = t.charCodeAt(i); if (c == 9 || c == 10 || c == 13 || (c >= 32 && c < 0x3000)) ok++; } return !n || ok >= n * 0.9; }
  L.readText = function (p) {
    var f = fso.OpenTextFile(p, 1, false, -1), t = f.AtEndOfStream ? "" : f.ReadAll(); f.Close();
    if (looksText(t)) return t.replace(/^﻿/, "");
    try { var s = new ActiveXObject("ADODB.Stream"); s.Type = 2; s.Charset = "utf-8"; s.Open(); s.LoadFromFile(p); var u = s.ReadText(); s.Close(); return u.replace(/^﻿/, ""); } catch (e) { }
    f = fso.OpenTextFile(p, 1, false, 0); t = f.AtEndOfStream ? "" : f.ReadAll(); f.Close();
    return utf8Decode(t.replace(/^ï»¿/, ""));
  };
  /* text read as ANSI that is really UTF-8 (e.g. a file from the web app) */
  function utf8Decode(s) { try { return /[Â-ô][\u0080-¿]/.test(s) ? decodeURIComponent(escape(s)) : s; } catch (e) { return s; } }
  /* UTF-8 text (for HTML files and CSV for Excel) - ADODB if allowed, otherwise ANSI */
  L.writeUtf8 = function (p, t, bom) {
    L.mkdirs(fso.GetParentFolderName(p));
    try {
      var s = new ActiveXObject("ADODB.Stream"); s.Type = 2; s.Charset = "utf-8"; s.Open(); s.WriteText(t);
      if (!bom) { s.Position = 3; var b = new ActiveXObject("ADODB.Stream"); b.Type = 1; b.Open(); s.CopyTo(b); b.SaveToFile(p, 2); b.Close(); s.Close(); }
      else { s.SaveToFile(p, 2); s.Close(); }
      return true;
    } catch (e) { }
    var f = fso.CreateTextFile(p, true, true); f.Write(t); f.Close();     // Unicode still keeps every letter
    return false;
  };
  L.readJson = function (p, dflt) {
    try { if (fso.FileExists(p)) return J.parse(L.readText(p)); } catch (e) {
      try { if (fso.FileExists(p + ".backup")) { alert("A saved file was damaged, so its backup copy was loaded:\n" + p); return J.parse(L.readText(p + ".backup")); } } catch (e2) { }
    }
    return dflt;
  };
  /* writes a temp file first, keeps the previous version as ".backup" */
  L.saveJson = function (p, o) {
    var tmp = p + ".tmp";
    L.writeText(tmp, J.stringify(o));
    if (fso.FileExists(p)) fso.CopyFile(p, p + ".backup", true);
    fso.CopyFile(tmp, p, true);
    fso.DeleteFile(tmp);
  };

  /* ---------- settings (per PC) + data folder ---------- */
  var DEF = { dataFolder: "", theme: "light", size: "normal", userName: "", trackerFolder: "", launcherHome: "", lastTab: "home", win: null };
  L.settings = function () {
    var s = L.readJson(L.settingsFile(), {}) || {};
    for (var k in DEF) if (DEF.hasOwnProperty(k) && s[k] === undefined) s[k] = DEF[k];
    if (!s.userName) { try { s.userName = L.env("%USERNAME%"); } catch (e) { } }
    return s;
  };
  L.saveSettings = function (s) { try { L.saveJson(L.settingsFile(), s); } catch (e) { } };
  L.dataDir = function () { var s = L.settings(); return s.dataFolder || (L.appDir() + "\\LewsToolbox-data"); };
  L.dataPath = function (name) { return L.dataDir() + "\\" + name; };
  L.exportsDir = function () { return L.dataDir() + "\\exports"; };

  /* ---------- Windows actions ---------- */
  L.open = function (p) {
    if (/^www\./i.test(p)) p = "https://" + p;
    if (/^(https?:|mailto:)/i.test(p)) { L.shell().ShellExecute(p, "", "", "open", 1); return; }
    L.shell().ShellExecute(p, "", fso.GetParentFolderName(p), "open", 1);
  };
  L.showInFolder = function (p) {
    if (fso.FolderExists(p)) wsh.Run('explorer.exe "' + p + '"', 1, false);
    else wsh.Run('explorer.exe /select,"' + p + '"', 1, false);
  };
  L.copyText = function (t) { try { window.clipboardData.setData("Text", t); return true; } catch (e) { return false; } };
  L.pickFolder = function (title) { try { var f = L.shell().BrowseForFolder(0, title || "Pick a folder", 0x51); return f ? f.Self.Path : null; } catch (e) { return null; } };
  /* file picker: the HTA engine gives the full path from a file input */
  L.pickFile = function (cb) {
    var inp = document.createElement("input"); inp.type = "file"; inp.style.display = "none"; document.body.appendChild(inp);
    inp.onchange = function () { var v = inp.value; try { document.body.removeChild(inp); } catch (e) { } if (v) cb(v); };
    inp.click();
  };

  /* ---------- small helpers ---------- */
  L.$ = function (id) { return document.getElementById(id); };
  L.esc = function (s) { return ("" + (s == null ? "" : s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  L.trim = function (s) { return ("" + (s == null ? "" : s)).replace(/^\s+|\s+$/g, ""); };
  L.pad = function (n) { return n < 10 ? "0" + n : "" + n; };
  L.now = function () { return (new Date()).getTime(); };
  L.iso = function (d) { d = d || new Date(); return d.getFullYear() + "-" + L.pad(d.getMonth() + 1) + "-" + L.pad(d.getDate()); };
  L.today = function () { return L.iso(new Date()); };
  L.stamp = function () { var d = new Date(); return L.iso(d) + "_" + L.pad(d.getHours()) + L.pad(d.getMinutes()); };
  L.MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  L.DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  L.parseIso = function (s) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  L.fmtDate = function (iso) { var d = L.parseIso(iso); return d ? L.DAYS[d.getDay()] + " " + d.getDate() + " " + L.MON[d.getMonth()] : (iso || ""); };
  L.uid = function (p) { return (p || "x") + L.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36); };
  L.safeName = function (s) { return L.trim(("" + s).replace(/[\\\/:*?"<>|\u0000-\u001f]/g, "_")); };
  L.up = function (el, attr) { while (el && el.getAttribute) { if (el.getAttribute(attr) != null) return el; el = el.parentNode; } return null; };
  L.toast = function (msg) {
    var t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.innerHTML = L.esc(msg); t.style.display = "block";
    if (L._tt) window.clearTimeout(L._tt);
    L._tt = window.setTimeout(function () { t.style.display = "none"; }, 2600);
  };

  /* ---------- CSV ---------- */
  L.csvCell = function (v) { v = (v == null) ? "" : ("" + v); return /[",;\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  L.writeCsv = function (p, rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) { var r = []; for (var j = 0; j < rows[i].length; j++) r.push(L.csvCell(rows[i][j])); out.push(r.join(",")); }
    L.writeUtf8(p, "﻿" + out.join("\r\n") + "\r\n", false);
  };
  L.parseCsv = function (t) {
    t = t.replace(/^﻿/, "");
    var first = t.split("\n")[0], sep = ",";
    var c = (first.match(/,/g) || []).length, s = (first.match(/;/g) || []).length, tb = (first.match(/\t/g) || []).length;
    if (s > c && s >= tb) sep = ";"; else if (tb > c && tb > s) sep = "\t";
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if (q) { if (ch == '"') { if (t.charAt(i + 1) == '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch == '"') q = true;
      else if (ch == sep) { row.push(cell); cell = ""; }
      else if (ch == "\r") { }
      else if (ch == "\n") { row.push(cell); cell = ""; rows.push(row); row = []; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  };

  /* ---------- Excel through Excel itself (no extra software) ---------- */
  function cellText(x) {
    if (x == null) return "";
    if (typeof x == "date") { var d = new Date(x); return L.iso(d); }
    return "" + x;
  }
  /* reads a sheet (by name, or the first) into rows of text. Gives back null if the sheet isn't there. */
  L.readExcel = function (p, sheetName) {
    var xl = null, wb = null, out = [];
    try {
      xl = new ActiveXObject("Excel.Application"); xl.Visible = false; xl.DisplayAlerts = false;
      wb = xl.Workbooks.Open(p, 0, true);
      var ws = null;
      if (sheetName) { for (var i = 1; i <= wb.Worksheets.Count; i++) if (("" + wb.Worksheets(i).Name).toLowerCase() == sheetName.toLowerCase()) ws = wb.Worksheets(i); if (!ws) return null; }
      else ws = wb.Worksheets(1);
      var ur = ws.UsedRange, nr = ur.Rows.Count, nc = ur.Columns.Count, r0 = ur.Row, c0 = ur.Column, v = ur.Value;
      for (var a = 1; a < r0; a++) out.push([]);
      if (nr == 1 && nc == 1) { var one = []; for (var b = 1; b < c0; b++) one.push(""); one.push(cellText(v)); out.push(one); }
      else {
        var arr = new VBArray(v).toArray();
        for (var r = 0; r < nr; r++) { var row = []; for (var k = 1; k < c0; k++) row.push(""); for (var c = 0; c < nc; c++) row.push(cellText(arr[c * nr + r])); out.push(row); }
      }
    } finally { try { if (wb) wb.Close(false); } catch (e) { } try { if (xl) xl.Quit(); } catch (e) { } }
    return out;
  };
  L.readTable = function (p) {
    return /\.(xlsx|xlsm|xls)$/i.test(p) ? L.readExcel(p) : L.parseCsv(L.readText(p));
  };
  L.col = function (head, names) {
    for (var i = 0; i < head.length; i++) { var h = L.trim(head[i]).toLowerCase(); for (var j = 0; j < names.length; j++) if (h == names[j].toLowerCase()) return i; }
    return -1;
  };
  L.cell = function (row, i) { return i >= 0 && i < row.length ? L.trim(row[i]) : ""; };

  /* ---------- looks (same themes as QuickLaunch) ---------- */
  L.THEMES = {
    light: { name: "Light", bg: "#f4f5f8", panel: "#ffffff", hover: "#eaf0fb", text: "#1d2330", muted: "#6b7385", line: "#dde2ea", accent: "#2f6fed", accText: "#ffffff", chip: "#e9ecf2", font: "'Segoe UI',Tahoma,sans-serif", r: 8, bw: 1, shadow: "0 1px 2px rgba(20,30,50,.07)", big: "0 16px 40px rgba(20,30,50,.25)", ok: "#1f8a4c", warn: "#a86500", bad: "#c0392b" },
    dark: { name: "Dark", bg: "#16181d", panel: "#1f2229", hover: "#2a2f3a", text: "#e8eaef", muted: "#9097a6", line: "#30343e", accent: "#5b9dff", accText: "#0b1220", chip: "#282c35", font: "'Segoe UI',Tahoma,sans-serif", r: 8, bw: 1, shadow: "none", big: "0 16px 40px rgba(0,0,0,.5)", ok: "#5fd38d", warn: "#ffcd75", bad: "#ff7b72" },
    blueprint: { name: "Blueprint", bg: "#0d2a4c", panel: "#12365f", hover: "#1a4679", text: "#e6f0ff", muted: "#9fb9dd", line: "#2b5a8f", accent: "#ffd166", accText: "#0d2a4c", chip: "#173f6d", font: "'Segoe UI',Tahoma,sans-serif", r: 4, bw: 1, shadow: "none", big: "0 16px 40px rgba(0,0,0,.45)", ok: "#5fd38d", warn: "#ffd166", bad: "#ff8a80" },
    retro: { name: "Retro 8-bit", bg: "#1a1c2c", panel: "#29366f", hover: "#3b5dc9", text: "#f4f4f4", muted: "#94b0c2", line: "#0b0c16", accent: "#ffcd75", accText: "#1a1c2c", chip: "#333c57", font: "'Lucida Console',Consolas,monospace", r: 0, bw: 2, shadow: "3px 3px 0 #0b0c16", big: "6px 6px 0 #0b0c16", retro: 1, ok: "#a7f070", warn: "#ffcd75", bad: "#ff6b6b" },
    gameboy: { name: "Retro Grey", bg: "#d6d2c8", panel: "#e8e5de", hover: "#f6f4ef", text: "#23233a", muted: "#6b6b7d", line: "#4a4a5e", accent: "#8b1c62", accText: "#ffffff", chip: "#cbc6ba", font: "'Lucida Console',Consolas,monospace", r: 0, bw: 2, shadow: "3px 3px 0 #4a4a5e", big: "6px 6px 0 #4a4a5e", retro: 1, ok: "#2e7d32", warn: "#9a5b00", bad: "#b13e53" },
    console: { name: "Retro Console", bg: "#dfe7f2", panel: "#c9d6ea", hover: "#f0f5fc", text: "#141b33", muted: "#5a6a90", line: "#1b2a6b", accent: "#1b2a6b", accText: "#f0f5fc", chip: "#d3deef", font: "'Lucida Console',Consolas,monospace", r: 0, bw: 2, shadow: "3px 3px 0 #1b2a6b", big: "6px 6px 0 #1b2a6b", retro: 1, ok: "#1f7a3a", warn: "#9a5b00", bad: "#b13e53" }
  };
  L.SIZES = { compact: { name: "Compact", fs: 12, row: 30 }, normal: { name: "Normal", fs: 13, row: 36 }, large: { name: "Large", fs: 15, row: 44 } };

  /* the shared look every tab page gets; a tab adds its own rules with {tokens} */
  L.BASE_CSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    "html,body{height:100%;overflow:hidden}",
    "body{background:{bg};color:{text};font-family:{font};font-size:{fs}px;cursor:default}",
    "input,select,textarea{font:inherit;color:{text};background:{bg};border:{bw}px solid {line};border-radius:{r}px;outline:none}",
    "input,select{height:30px;padding:0 8px}textarea{padding:6px 8px}",
    "input:focus,select:focus,textarea:focus{border-color:{accent}}",
    "select option{background:{panel};color:{text}}",
    ".btn{height:30px;padding:0 12px;margin:0 6px 6px 0;font:inherit;font-weight:bold;cursor:pointer;white-space:nowrap;outline:none;overflow:visible;background:{panel};color:{text};border:{bw}px solid {line};border-radius:{r}px}",
    ".btn:hover{background:{hover}}",
    ".btn.primary{background:{accent};color:{accText};border-color:{accent}}",
    ".btn.on{background:{hover};border-color:{accent}}",
    ".btn.small{height:26px;padding:0 9px;font-size:.92em}",
    ".btn[disabled]{opacity:.45;cursor:default}",
    ".bar{padding:8px 12px 2px;background:{panel};border-bottom:{bw}px solid {line}}",
    ".bar2{padding:8px 12px 2px}",
    ".muted{color:{muted}}.ok{color:{ok}}.warn{color:{warn}}.bad{color:{bad}}",
    ".chip{display:inline-block;padding:4px 11px;margin:0 6px 6px 0;font-weight:bold;cursor:pointer;font-size:.92em;background:{chip};color:{muted};border-radius:{rc}px}",
    ".chip:hover{color:{text}}.chip.on{background:{accent};color:{accText}}",
    "table.grid{border-collapse:collapse;width:100%}",
    "table.grid th{position:relative;text-align:left;padding:6px 8px;font-size:.8em;text-transform:uppercase;letter-spacing:.4px;color:{muted};border-bottom:{bw}px solid {line};white-space:nowrap;background:{panel}}",
    "table.grid td{padding:5px 8px;border-bottom:1px solid {lineSoft};vertical-align:top}",
    "table.grid tr:hover td{background:{hover}}",
    "table.grid tr.sel td{background:{hover}}",
    ".h{font-weight:bold;margin:14px 0 6px}",
    "h2{font-size:1.3em;margin:0 0 8px}",
    ".ov{display:none;position:fixed;left:0;top:0;right:0;bottom:0;z-index:20;background:rgba(0,0,0,.45)}",
    ".card{width:560px;max-width:94%;margin:5vh auto 0;padding:16px 18px;max-height:88vh;overflow-y:auto;background:{panel};border:{bw}px solid {line};border-radius:{r2}px;box-shadow:{big}}",
    ".card h3{font-size:1.15em;margin-bottom:12px}",
    ".fld{margin-bottom:9px}.fld label{display:block;font-size:.78em;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;color:{muted}}",
    ".fld input,.fld select,.fld textarea{width:100%}",
    ".row2{display:flex}.row2 .fld{flex:1 1 0px;min-width:0}.row2 .fld+.fld{margin-left:10px}",
    ".acts{display:flex;margin-top:12px}.sp{flex:1 1 0px}",
    "#menu{display:none;position:fixed;z-index:30;min-width:200px;padding:4px;background:{panel};border:{bw}px solid {line};border-radius:{r}px;box-shadow:{big}}",
    "#menu .mi{padding:7px 12px;cursor:pointer;white-space:nowrap;border-radius:{r}px}#menu .mi:hover{background:{accent};color:{accText}}",
    "#menu .sep{height:1px;margin:4px 6px;background:{line}}#menu .mi.on:before{content:'\\2713  '}",
    "#toast{position:fixed;right:18px;bottom:18px;z-index:40;padding:8px 16px;font-weight:bold;white-space:nowrap;display:none;background:{accent};color:{accText};border-radius:{r}px;box-shadow:0 6px 20px rgba(0,0,0,.3)}",
    ".scroll{overflow:auto}",
    "a{color:{accent}}"
  ];
  L.themeVars = function () {
    var s = L.settings(), t = L.THEMES[s.theme] || L.THEMES.light, z = L.SIZES[s.size] || L.SIZES.normal, v = {};
    for (var a in t) v[a] = t[a]; for (var b in z) v[b] = z[b];
    v.rc = t.r ? 99 : 0; v.r2 = t.r ? t.r + 2 : 0; v.lineSoft = t.retro ? "rgba(0,0,0,.25)" : t.line;
    return v;
  };
  function setCss(el, css) { if (el.styleSheet && typeof el.styleSheet.cssText == "string") el.styleSheet.cssText = css; else el.textContent = css; }
  /* puts the theme's colours into the page; call again after a theme change */
  L.applyLook = function (extraRules) {
    if (extraRules) L._extra = extraRules;
    var v = L.themeVars(), rules = L.BASE_CSS.concat(L._extra || []);
    if (v.retro) rules.push(".btn,.chip.on{box-shadow:{shadow}}.btn:active{box-shadow:none}");
    var el = document.getElementById("ltTheme");
    if (!el) { el = document.createElement("style"); el.id = "ltTheme"; document.getElementsByTagName("head")[0].appendChild(el); }
    setCss(el, rules.join("\n").replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined ? v[k] : m; }));
    return v;
  };

  /* ---------- pop-up menu ---------- */
  var acts = [];
  L.menu = function (x, y, items) {
    var m = document.getElementById("menu");
    if (!m) {
      m = document.createElement("div"); m.id = "menu"; document.body.appendChild(m);
      m.onclick = function (e) { var it = L.up(e.target || e.srcElement, "data-mi"); if (!it) return; var fn = acts[+it.getAttribute("data-mi")]; L.hideMenu(); if (fn) fn(); };
      document.attachEvent ? document.attachEvent("onmousedown", outside) : document.addEventListener("mousedown", outside, false);
    }
    acts = []; var h = "";
    for (var i = 0; i < items.length; i++) {
      if (items[i] == "-") { h += '<div class="sep"></div>'; continue; }
      acts.push(items[i].fn);
      h += '<div class="mi' + (items[i].on ? " on" : "") + '" data-mi="' + (acts.length - 1) + '">' + items[i].label + "</div>";
    }
    m.innerHTML = h; m.style.display = "block";
    var w = m.offsetWidth, hh = m.offsetHeight, W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
    m.style.left = Math.max(4, Math.min(x, W - w - 4)) + "px"; m.style.top = Math.max(4, Math.min(y, H - hh - 4)) + "px";
  };
  function outside(e) { var m = document.getElementById("menu"), t = e.target || e.srcElement; while (t) { if (t == m) return; t = t.parentNode; } L.hideMenu(); }
  L.hideMenu = function () { var m = document.getElementById("menu"); if (m) m.style.display = "none"; };

  /* ---------- inside the main window ---------- */
  L.main = function () { try { return window.top && window.top.LTMain ? window.top.LTMain : null; } catch (e) { return null; } };
  /* tab pages: Ctrl+1..9 switches tabs even while a tab has the keyboard */
  L.tabKeys = function () {
    var h = function (e) {
      e = e || window.event;
      if (e.ctrlKey && e.keyCode >= 49 && e.keyCode <= 57 && L.main()) { L.main().showIndex(e.keyCode - 49); if (e.preventDefault) e.preventDefault(); e.returnValue = false; return false; }
    };
    if (document.attachEvent) document.attachEvent("onkeydown", h); else document.addEventListener("keydown", h, false);
  };
  return L;
})();
