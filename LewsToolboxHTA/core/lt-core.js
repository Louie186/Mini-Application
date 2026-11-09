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
  var DEF = { dataFolder: "", theme: "light", size: "normal", userName: "", trackerFolder: "", launcherHome: "", lastTab: "home", win: null, tips: true };
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
  function sheetRows(ws) {
    var out = [], ur = ws.UsedRange, nr = ur.Rows.Count, nc = ur.Columns.Count, r0 = ur.Row, c0 = ur.Column, v = ur.Value;
    for (var a = 1; a < r0; a++) out.push([]);
    if (nr == 1 && nc == 1) { var one = []; for (var b = 1; b < c0; b++) one.push(""); one.push(cellText(v)); out.push(one); }
    else {
      var arr = new VBArray(v).toArray();
      for (var r = 0; r < nr; r++) { var row = []; for (var k = 1; k < c0; k++) row.push(""); for (var c = 0; c < nc; c++) row.push(cellText(arr[c * nr + r])); out.push(row); }
    }
    return out;
  }
  L.sheetRows = sheetRows;
  L.readExcel = function (p, sheetName) {
    var xl = null, wb = null;
    try {
      xl = new ActiveXObject("Excel.Application"); xl.Visible = false; xl.DisplayAlerts = false;
      wb = xl.Workbooks.Open(p, 0, true);
      var ws = null;
      if (sheetName) { for (var i = 1; i <= wb.Worksheets.Count; i++) if (("" + wb.Worksheets(i).Name).toLowerCase() == sheetName.toLowerCase()) ws = wb.Worksheets(i); if (!ws) return null; }
      else ws = wb.Worksheets(1);
      return sheetRows(ws);
    } finally { try { if (wb) wb.Close(false); } catch (e) { } try { if (xl) xl.Quit(); } catch (e) { } }
  };
  /* every visible sheet in one go: { names: [...], rows: { name: [[...]] } } */
  L.readExcelAll = function (p) {
    var xl = null, wb = null, out = { names: [], rows: {} };
    try {
      xl = new ActiveXObject("Excel.Application"); xl.Visible = false; xl.DisplayAlerts = false;
      wb = xl.Workbooks.Open(p, 0, true);
      for (var i = 1; i <= wb.Worksheets.Count; i++) { var ws = wb.Worksheets(i); if (ws.Visible != -1 && ws.Visible !== true) continue; var n = "" + ws.Name; out.names.push(n); out.rows[n] = sheetRows(ws); }
    } finally { try { if (wb) wb.Close(false); } catch (e) { } try { if (xl) xl.Quit(); } catch (e) { } }
    return out;
  };
  L.readTable = function (p) {
    return /\.(xlsx|xlsm|xls)$/i.test(p) ? L.readExcel(p) : L.parseCsv(L.readText(p));
  };

  /* ---------- drawing lists (registers, transmittals, checklists) ---------- */
  /* looks like a drawing / document number: 3+ separators, no spaces, has a digit (5013-KEO-T1-ZZ-PLN-INT-10100-T1) */
  L.isDocNo = function (s) { s = L.trim(s).replace(/\.[A-Za-z0-9]{2,4}$/, ""); return !/\s/.test(s) && /\d/.test(s) && (s.match(/[-_]/g) || []).length >= 3; };
  /* a category title inside the list, like "Residential" or "Enlarged drawings": no digits, or words with spaces, and nothing else on the row */
  L.isCategory = function (s, restOfRow) { s = L.trim(s); if (!s || L.isDocNo(s)) return false; if (restOfRow) return false; return !/\d/.test(s) || (/\s/.test(s) && !/[-_].*\d/.test(s)); };
  var NAME_WORDS = ["file name", "filename", "drawing number", "drawing numbers", "drawing no", "drawing no.", "dwg no", "dwg number", "document number", "document no", "doc no", "doc number", "number", "name", "file", "deliverable"];
  function docCount(rows) { var best = { col: -1, n: 0 }, per = {}; for (var r = 0; r < Math.min(rows.length, 2000); r++) for (var c = 0; c < rows[r].length; c++) if (L.isDocNo(rows[r][c])) { per[c] = (per[c] || 0) + 1; if (per[c] > best.n) best = { col: c, n: per[c] }; } return best; }
  /* reads a list from Excel (picks the sheet with the drawing numbers, or the one named) or CSV.
     Works with or without a heading row. Gives back { sheets, sheet, table, headRow (-1 = no heading), head, numCol } */
  L.readList = function (p, sheetName) {
    var res = { sheets: [], sheet: "", table: [], headRow: -1, head: [], numCol: -1 };
    if (/\.(xlsx|xlsm|xls)$/i.test(p)) {
      var all = L.readExcelAll(p), pick = null, bestN = -1;
      res.sheets = all.names;
      if (sheetName && all.rows[sheetName]) pick = sheetName;
      // the sheet with drawing numbers in Column A wins (a plain list), then the one with the most numbers
      else for (var i = 0; i < all.names.length; i++) { var dc = docCount(all.rows[all.names[i]]), n = dc.n ? dc.n + (dc.col == 0 ? 1e6 : 0) : 0; if (n > bestN) { bestN = n; pick = all.names[i]; } }
      res.sheet = pick || ""; res.table = pick ? all.rows[pick] : [];
    } else { res.table = L.parseCsv(L.readText(p)); res.sheets = ["(CSV)"]; res.sheet = "(CSV)"; }
    var t = res.table;
    for (var r = 0; r < Math.min(30, t.length) && res.headRow < 0; r++) for (var c = 0; c < t[r].length; c++) if (NAME_WORDS.indexOf(L.trim(t[r][c]).toLowerCase()) >= 0) { res.headRow = r; break; }
    // also "Drawing Number (without revision)" and the like
    for (var r2 = 0; r2 < Math.min(30, t.length) && res.headRow < 0; r2++) for (var c2 = 0; c2 < t[r2].length; c2++) if (NAME_WORDS.indexOf(L.trim(("" + t[r2][c2]).replace(/\([^)]*\)/g, "")).toLowerCase()) >= 0) { res.headRow = r2; break; }
    var width = 0; for (var w = 0; w < Math.min(t.length, 300); w++) width = Math.max(width, t[w].length);
    var letters = function (i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
    for (var h = 0; h < width; h++) { var name = res.headRow >= 0 ? L.trim((t[res.headRow] || [])[h]) : ""; res.head.push(name || "Column " + letters(h)); }
    res.numCol = docCount(t.slice(res.headRow + 1)).col;
    return res;
  };
  /* which column is which in a list read by readList. saved = earlier choices { name, title, rev, fmt, folder, tower, typo, model },
     guess = true to work it out again. Headings decide when there are any; without a heading row the cells do
     (number column, the text column next to it, Tower 1 / T1, 1BRA, 21000). */
  L.listColumns = function (list, saved, guess) {
    saved = saved || {};
    var head = list.head, t = list.table, hr = list.headRow, used = {}, out = {};
    var find = function (key, words) {
      var got = "";
      if (!guess && saved[key] && head.indexOf(saved[key]) >= 0) got = saved[key];
      else if (hr >= 0) {
        for (var w = 0; w < words.length && !got; w++) for (var h = 0; h < head.length; h++) if (!used[head[h]] && head[h].toLowerCase() == words[w]) { got = head[h]; break; }
        for (var w2 = 0; w2 < words.length && !got; w2++) for (var h2 = 0; h2 < head.length; h2++) if (!used[head[h2]] && head[h2].toLowerCase().indexOf(words[w2]) >= 0) { got = head[h2]; break; }
      }
      if (got) used[got] = 1;
      out[key] = got;
    };
    find("name", NAME_WORDS); if (!out.name) { out.name = list.numCol >= 0 ? head[list.numCol] : (head[0] || ""); used[out.name] = 1; }
    find("tower", ["tower", "building", "block", "bldg"]);
    find("typo", ["typology", "unit type", "apartment type", "unit"]);
    find("model", ["model", "model no", "model number", "model ref"]);
    find("rev", ["revision", "rev", "rev.", "current revision", "issue rev"]);
    find("fmt", ["file types", "file type", "format", "formats", "type", "file format"]);
    find("folder", ["folder", "subfolder", "location", "path"]);
    find("title", ["title", "description", "drawing title", "document title"]);
    if (hr < 0) {
      if (!out.title) { var nc = head.indexOf(out.name) + 1, n = 0; for (var r = 0; r < Math.min(t.length, 200); r++) if (L.cell(t[r], nc)) n++; if (n) out.title = head[nc]; }
      if (guess || (!out.tower && !out.typo && !out.model)) {
        var taken = {}; taken[out.name] = 1; taken[out.title] = 1;
        var best = function (re) { var top = "", topN = 0; for (var c = 0; c < head.length; c++) { if (taken[head[c]]) continue; var hit = 0, all = 0;
            for (var r2 = 0; r2 < Math.min(t.length, 300); r2++) { var v = L.cell(t[r2], c); if (!v || /^(0|-+|#?n\/a)$/i.test(v)) continue; all++; if (re.test(v)) hit++; }
            if (all && hit / all >= 0.6 && hit > topN) { top = head[c]; topN = hit; } } if (top) taken[top] = 1; return top; };
        out.tower = best(/^(tower|twr|t|building|bldg|block|blk)\s*[-_.]?\s*\d+[a-z]?$|^podium$/i);
        out.typo = best(/^(\d+\s*-?\s*b(ed)?r?(oom)?s?\s*[a-z]?\d*|studio\s*[a-z]?\d*|ph\s*[a-z]?\d*|penthouse.*|duplex.*|\d[a-z]{2,4}\d*)$/i);
        out.model = best(/^(\d{3,6}|[a-z0-9]+([-_][a-z0-9]*){3,}-?)$/i);
      }
    }
    return out;
  };
  /* a value that is only a formula leftover (0, -, #N/A...) */
  L.isBlankish = function (v) { return !v || /^(0|-+|#?n\/a|#ref!|#value!|#name\?)$/i.test(L.trim(v)); };
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
    "#datePop{display:none;position:fixed;z-index:35;width:236px;padding:8px;background:{panel};border:{bw}px solid {line};border-radius:{r}px;box-shadow:{big}}",
    ".dpH{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}.dpB{cursor:pointer;padding:3px 8px;border-radius:{r}px;font-weight:bold}.dpB:hover{background:{hover}}",
    ".dpT{width:100%;border-collapse:collapse}.dpT th{font-size:.75em;color:{muted};padding:2px 0;text-align:center}.dpT td{text-align:center;padding:4px 0;cursor:pointer;border-radius:{r}px}",
    ".dpT td.dpD:hover{background:{hover}}.dpT td.dpN{color:{accent};font-weight:bold}.dpT td.dpS{background:{accent};color:{accText};font-weight:bold}",
    ".dpF{display:flex;justify-content:space-between;margin-top:6px;border-top:1px solid {line};padding-top:5px;font-size:.9em}",
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

  /* ---------- pop-up calendar for date boxes (dd/mm/yyyy) ----------
     L.datePicker(test): a click in any text box where test(input) is true opens a small calendar under it.
     Typing still works. Works for rows added later too (one handler on the page). */
  var dp = null, dpIn = null, dpM = null;
  function dpParse(s) { var m = /^\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\s*$/.exec(s || ""); if (!m) return null; var y = +m[3]; if (y < 100) y += 2000; var d = new Date(y, +m[2] - 1, +m[1]); return isNaN(d.getTime()) ? null : d; }
  function dpDraw() {
    var sel = dpParse(dpIn.value), t = new Date(), y = dpM.getFullYear(), mo = dpM.getMonth(), first = new Date(y, mo, 1), start = (first.getDay() + 6) % 7, days = new Date(y, mo + 1, 0).getDate();
    var h = '<div class="dpH"><span class="dpB" data-dp="-1">&#9664;</span><b>' + ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][mo] + " " + y + '</b><span class="dpB" data-dp="1">&#9654;</span></div><table class="dpT"><tr>';
    var wd = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]; for (var w = 0; w < 7; w++) h += "<th>" + wd[w] + "</th>"; h += "</tr><tr>";
    for (var b = 0; b < start; b++) h += "<td></td>";
    for (var d = 1; d <= days; d++) {
      var c = "dpD"; if (sel && sel.getFullYear() == y && sel.getMonth() == mo && sel.getDate() == d) c += " dpS"; else if (t.getFullYear() == y && t.getMonth() == mo && t.getDate() == d) c += " dpN";
      h += '<td class="' + c + '" data-day="' + d + '">' + d + "</td>"; if ((start + d) % 7 == 0 && d < days) h += "</tr><tr>";
    }
    h += '</tr></table><div class="dpF"><span class="dpB" data-dp="today">Today</span><span class="dpB" data-dp="week">+1 week</span><span class="dpB" data-dp="clear">Clear</span></div>';
    dp.innerHTML = h;
  }
  function dpSet(d) { dpIn.value = d ? L.pad(d.getDate()) + "/" + L.pad(d.getMonth() + 1) + "/" + d.getFullYear() : ""; try { if (dpIn.onchange) dpIn.onchange(); } catch (e) { } L.hideDate(); }
  L.hideDate = function () { if (dp) dp.style.display = "none"; dpIn = null; };
  L.showDate = function (inp) {
    if (!dp) {
      dp = document.createElement("div"); dp.id = "datePop"; document.body.appendChild(dp);
      dp.onmousedown = function (e) { e = e || window.event; if (e.preventDefault) e.preventDefault(); e.returnValue = false; e.cancelBubble = true; if (e.stopPropagation) e.stopPropagation(); return false; };
      dp.onclick = function (e) {
        var ev = e || window.event; ev.cancelBubble = true; if (ev.stopPropagation) ev.stopPropagation();
        var el = (e || window.event).target || (e || window.event).srcElement, b = L.up(el, "data-dp"), dd = L.up(el, "data-day");
        if (dd) dpSet(new Date(dpM.getFullYear(), dpM.getMonth(), +dd.getAttribute("data-day")));
        else if (b) { var a = b.getAttribute("data-dp"), n = new Date(); n = new Date(n.getFullYear(), n.getMonth(), n.getDate());
          if (a == "today") dpSet(n); else if (a == "week") dpSet(new Date(n.getFullYear(), n.getMonth(), n.getDate() + 7)); else if (a == "clear") dpSet(null);
          else { dpM = new Date(dpM.getFullYear(), dpM.getMonth() + (+a), 1); dpDraw(); } }
      };
    }
    dpIn = inp; var s = dpParse(inp.value) || new Date(); dpM = new Date(s.getFullYear(), s.getMonth(), 1); dpDraw(); dp.style.display = "block";
    var r = inp.getBoundingClientRect(), W = document.documentElement.clientWidth, H = document.documentElement.clientHeight, w = dp.offsetWidth, h = dp.offsetHeight;
    dp.style.left = Math.max(4, Math.min(r.left, W - w - 4)) + "px"; dp.style.top = (r.bottom + h + 4 > H && r.top - h - 2 > 0 ? r.top - h - 2 : r.bottom + 2) + "px";
  };
  L.datePicker = function (test) {
    var h = function (e) {
      e = e || window.event; var t = e.target || e.srcElement;
      if (t && t.tagName == "INPUT" && test(t)) { if (dpIn != t) L.showDate(t); return; }
      if (dp && dp.style.display == "block") { var x = t; while (x) { if (x == dp) return; x = x.parentNode; } L.hideDate(); }
    };
    var k = function (e) { e = e || window.event; if (dpIn && (e.keyCode == 27 || e.keyCode == 9)) L.hideDate(); };
    if (document.attachEvent) { document.attachEvent("onclick", h); document.attachEvent("onkeydown", k); } else { document.addEventListener("click", h, false); document.addEventListener("keydown", k, false); }
  };

  /* ---------- Drawing Register (made in the Drawing Register tab), for other tabs to look drawings up ----------
     L.register() gives null, or { name, find(numberOrFileName) -> { number, title, cat, tower, typo, model } or null } */
  L.registerIndex = function () { return L.readJson(L.dataPath("register.json"), null) || { projects: [], current: "" }; };
  L.registerFile = function (id) { return L.dataPath("register\\" + id + ".json"); };
  L.register = function (id) {
    var ix = L.registerIndex(); id = id || ix.current; if (!id) return null;
    var name = ""; for (var i = 0; i < ix.projects.length; i++) if (ix.projects[i].id == id) name = ix.projects[i].name;
    var P = L.readJson(L.registerFile(id), null); if (!P || !P.drawings) return null;
    var D = P.drawings, seq = {}, cnt = {}, mm = {}, up = function (x) { return L.trim(x).toUpperCase().replace(/\s*-\s*/g, " - ").replace(/\s+/g, " "); };
    for (var m = 0; m < (P.models || []).length; m++) { var mk = up(P.models[m].tower) + "|" + up(P.models[m].typo); if (!mm[mk]) mm[mk] = P.models[m].model; }
    for (var k in D) if (D.hasOwnProperty(k)) { var ns = k.split(/[-_ .]+/); for (var j = 0; j < ns.length; j++) if (/^\d{3,}$/.test(ns[j])) { seq[ns[j]] = k; cnt[ns[j]] = (cnt[ns[j]] || 0) + 1; } }
    return { name: name, id: id,
      list: function () { var o = []; for (var k4 in D) if (D.hasOwnProperty(k4)) { var d4 = D[k4]; o.push({ number: d4.num || k4, title: d4.title || "", cat: d4.cat || "", tower: d4.tower || "", typo: d4.typo || "", inMidp: d4.inMidp !== false }); } return o; },
      count: function () { var n = 0; for (var k2 in D) if (D.hasOwnProperty(k2)) n++; return n; },
      find: function (s) {
        s = L.trim(s).toUpperCase().replace(/\.[A-Z0-9]{2,4}$/, "").replace(/-+$/, "");
        var hit = function (k3) { var d = D[k3]; return d ? { number: d.num || k3, title: d.title || "", cat: d.cat || "", tower: d.tower || "", typo: d.typo || "", ok: !!d.ok, model: d.model || (d.typo && d.typo != "-" ? mm[up(d.tower) + "|" + up(d.typo)] || d.impModel || "" : "") } : null; };
        if (D[s]) return hit(s);
        var p = s.split(/[-_]/); while (p.length > 2) { p.pop(); var b = p.join("-"); if (D[b]) return hit(b); }
        var ns2 = s.split(/[-_ .]+/); for (var q = ns2.length - 1; q >= 0; q--) if (/^\d{3,}$/.test(ns2[q]) && cnt[ns2[q]] == 1) return hit(seq[ns2[q]]);
        return null;
      } };
  };

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
