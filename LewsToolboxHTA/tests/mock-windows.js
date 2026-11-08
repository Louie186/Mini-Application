/* Test kit only (not part of the program): a pretend Windows for running the HTA pages in a normal
   browser. Files live in memory (shared by all frames), seeded with the real program folder.
   window.__SEED = { "C:\\LT\\tabs\\x.html": "text", ... } must be set before this runs. */
(function () {
  var W = window;
  var top = W; try { if (W.top && W.top.__mockFs) top = W.top; } catch (e) { }
  var FS = top.__mockFs || (top.__mockFs = { files: {}, dirs: {}, log: [] });
  function norm(p) { p = ("" + p).replace(/\//g, "\\").replace(/\\+$/, ""); return p.toLowerCase(); }
  function parentOf(p) { p = ("" + p).replace(/\//g, "\\").replace(/\\+$/, ""); var i = p.lastIndexOf("\\"); return i > 0 ? p.substring(0, i) : ""; }
  function addDirs(p) { var d = parentOf(p); while (d && !FS.dirs[norm(d)]) { FS.dirs[norm(d)] = d; d = parentOf(d); } }
  if (W.__SEED && !FS.seeded) { for (var k in W.__SEED) { FS.files[norm(k)] = { path: k, text: W.__SEED[k], time: Date.now() }; addDirs(k); } FS.seeded = 1; }
  function nameOf(p) { var s = ("" + p).replace(/\//g, "\\"); return s.substring(s.lastIndexOf("\\") + 1); }
  function children(dir, wantDirs) {
    var d = norm(dir) + "\\", out = [], src = wantDirs ? FS.dirs : FS.files;
    for (var k in src) if (k.indexOf(d) == 0 && k.substring(d.length).indexOf("\\") < 0) { var p = wantDirs ? src[k] : src[k].path; out.push(wantDirs ? folderObj(p) : fileObj(p)); }
    return out;
  }
  function coll(arr) { arr.Count = arr.length; return arr; }
  function fileObj(p) { var f = FS.files[norm(p)]; return { Path: f.path, Name: nameOf(f.path), Size: (f.text || "").length, DateLastModified: new Date(f.time), Attributes: 0, ParentFolder: { Path: parentOf(f.path) } }; }
  function folderObj(p) { return { Path: FS.dirs[norm(p)] || p, Name: nameOf(p), Attributes: 0, Files: coll(children(p, false)), SubFolders: coll(children(p, true)) }; }
  function err(msg) { var e = new Error(msg); e.number = -2146828235; return e; }
  function wildcard(src) { return /\*/.test(src); }

  var fso = {
    FileExists: function (p) { return !!FS.files[norm(p)]; },
    FolderExists: function (p) { return !!FS.dirs[norm(p)]; },
    CreateFolder: function (p) { if (!FS.dirs[norm(parentOf(p))] && parentOf(p).indexOf("\\") > 0) throw err("Path not found"); FS.dirs[norm(p)] = p; addDirs(p); },
    GetParentFolderName: function (p) { return parentOf(p); },
    GetFileName: function (p) { return nameOf(p); },
    GetFolder: function (p) { if (!FS.dirs[norm(p)]) throw err("Path not found"); return folderObj(p); },
    GetFile: function (p) { if (!FS.files[norm(p)]) throw err("File not found"); return fileObj(p); },
    CreateTextFile: function (p, ow) {
      if (!FS.dirs[norm(parentOf(p))]) throw err("Path not found: " + p);
      if (FS.files[norm(p)] && ow === false) throw err("File already exists");
      var buf = [];
      return { Write: function (t) { buf.push(t); }, WriteLine: function (t) { buf.push(t + "\r\n"); }, Close: function () { FS.files[norm(p)] = { path: p, text: buf.join(""), time: Date.now() }; FS.log.push("write " + p); } };
    },
    OpenTextFile: function (p) {
      var f = FS.files[norm(p)]; if (!f) throw err("File not found: " + p);
      var t = f.text, pos = 0;
      return { get AtEndOfStream() { return pos >= t.length; }, ReadAll: function () { pos = t.length; return t; }, Read: function (n) { var s = t.substring(pos, pos + n); pos += n; return s; }, Close: function () { } };
    },
    CopyFile: function (a, b, ow) {
      if (wildcard(a)) { var d = parentOf(a), fs = children(d, false); for (var i = 0; i < fs.length; i++) fso.CopyFile(fs[i].Path, b + "\\" + fs[i].Name, ow); return; }
      var f = FS.files[norm(a)]; if (!f) throw err("File not found: " + a);
      if (FS.dirs[norm(b)]) b = b + "\\" + nameOf(a);
      if (FS.files[norm(b)] && ow === false) throw err("File already exists");
      FS.files[norm(b)] = { path: b, text: f.text, time: Date.now() }; addDirs(b); FS.log.push("copy " + a + " -> " + b);
    },
    MoveFile: function (a, b) {
      var f = FS.files[norm(a)]; if (!f) throw err("File not found: " + a);
      if (FS.files[norm(b)] && norm(a) != norm(b)) throw err("File already exists");
      delete FS.files[norm(a)]; FS.files[norm(b)] = { path: b, text: f.text, time: f.time }; addDirs(b); FS.log.push("move " + a + " -> " + b);
    },
    DeleteFile: function (p) { if (!FS.files[norm(p)]) throw err("File not found"); delete FS.files[norm(p)]; FS.log.push("delete " + p); },
    CopyFolder: function (a, b) { if (wildcard(a)) { var ds = children(parentOf(a), true); if (!ds.length) throw err("Path not found"); } },
    GetTempName: function () { return "rad" + Math.random().toString(36).slice(2, 7) + ".tmp"; },
    BuildPath: function (a, b) { return a.replace(/\\+$/, "") + "\\" + b; }
  };
  var wsh = {
    ExpandEnvironmentStrings: function (s) { return s.replace(/%APPDATA%/ig, "C:\\Users\\lew\\AppData\\Roaming").replace(/%USERNAME%/ig, "lew").replace(/%WINDIR%/ig, "C:\\Windows").replace(/%LOCALAPPDATA%/ig, "C:\\Users\\lew\\AppData\\Local").replace(/%USERPROFILE%/ig, "C:\\Users\\lew"); },
    Run: function (cmd) { FS.log.push("run " + cmd); return 0; },
    SpecialFolders: function () { return "C:\\Users\\lew\\Desktop"; },
    CreateShortcut: function (p) { return { Save: function () { FS.files[norm(p)] = { path: p, text: "lnk", time: Date.now() }; addDirs(p); } }; },
    RegRead: function () { throw err("no registry"); }
  };
  var shellApp = {
    ShellExecute: function (p) { FS.log.push("open " + p); },
    BrowseForFolder: function () { var r = top.__nextFolder || null; top.__nextFolder = null; return r ? { Self: { Path: r } } : null; },
    NameSpace: function () { return null; }
  };

  /* a pretend Excel: remembers what is written, saves it as JSON in the pretend file system */
  function Sheet(name) { this.Name = name; this.Visible = -1; this.cells = {}; var me = this;
    this.Cells = function (r, c) { return cellObj(me, r, c); };
    this.Range = function (a) { var m = /^([A-Z]+)(\d+)$/.exec(a); if (m) return cellObj(me, +m[2], colNum(m[1])); return sink(); };
    this.Rows = function () { return sink(); }; this.Columns = function () { return sink(); };
    this.Outline = {}; this.Tab = {}; this.Activate = function () { }; this.Delete = function () { me.dead = true; };
    this.UsedRange = { get Rows() { return { Count: me.maxR() }; }, get Columns() { return { Count: me.maxC() }; }, Row: 1, Column: 1,
      get Value() { var nr = me.maxR(), nc = me.maxC(), a = []; for (var c = 1; c <= nc; c++) for (var r = 1; r <= nr; r++) { var v = me.cells[r + "," + c]; a.push(v == null ? null : v.show); } return a; } };
    this.maxR = function () { var m = 0; for (var k in me.cells) m = Math.max(m, +k.split(",")[0]); return m || 1; };
    this.maxC = function () { var m = 0; for (var k in me.cells) m = Math.max(m, +k.split(",")[1]); return m || 1; };
  }
  function colNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n; }
  function sink() { var o = { Interior: {}, Font: {}, Borders: {}, Validation: { Delete: function () { }, Add: function () { } }, FormatConditions: { Add: function () { return { Font: {} }; } } };
    o.Merge = o.Group = o.AutoFilter = o.Select = function () { }; return o; }
  function serial(d) { return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 864e5; }
  function cellObj(sh, r, c) { var k = r + "," + c, o = sink();
    Object.defineProperty(o, "Value", { get: function () { var v = sh.cells[k]; return v ? v.show : null; }, set: function (v) { sh.cells[k] = { show: v == null ? "" : v }; } });
    Object.defineProperty(o, "Value2", { get: function () { var v = sh.cells[k]; return v ? (v.serial != null ? v.serial : v.show) : null; }, set: function (v) { var old = sh.cells[k]; sh.cells[k] = { show: old && old.serial === v ? old.show : v, serial: old && old.serial === v ? v : null }; } });
    Object.defineProperty(o, "Formula", { get: function () { var v = sh.cells[k]; return v ? v.f || v.show : ""; }, set: function (f) { var m = /^=DATE\((\d+),(\d+),(\d+)\)$/.exec(f);
      if (m) { var d = new Date(+m[1], +m[2] - 1, +m[3]); sh.cells[k] = { show: m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2), serial: serial(d) }; } else sh.cells[k] = { show: "", f: f }; } });
    return o; }
  function Book(sheets) { var me = this; this.sheets = sheets || [new Sheet("Sheet1")];
    var ws = function (i) { var live = me.sheets.filter(function (s) { return !s.dead; }); if (typeof i == "number") return live[i - 1]; for (var j = 0; j < live.length; j++) if (live[j].Name == i) return live[j]; throw err("no sheet " + i); };
    Object.defineProperty(ws, "Count", { get: function () { return me.sheets.filter(function (s) { return !s.dead; }).length; } });
    ws.Add = function () { var s = new Sheet("Sheet" + (me.sheets.length + 1)); me.sheets.unshift(s); return s; };
    this.Worksheets = ws; this.Windows = function () { return {}; };
    this.SaveAs = function (p) { var out = me.sheets.filter(function (s) { return !s.dead; }).map(function (s) { return { name: s.Name, visible: s.Visible, cells: s.cells }; });
      FS.files[norm(p)] = { path: p, text: "MOCKXL" + JSON.stringify(out), time: Date.now() }; FS.log.push("excel save " + p); };
    this.Close = function () { }; }
  function excelApp() { return { Visible: false, DisplayAlerts: true, Quit: function () { },
    Workbooks: { Add: function () { return new Book(); },
      Open: function (p) { var f = FS.files[norm(p)]; if (!f || f.text.indexOf("MOCKXL") != 0) throw err("Excel can't open " + p);
        var arr = JSON.parse(f.text.substring(6)); return new Book(arr.map(function (x) { var s = new Sheet(x.name); s.Visible = x.visible; s.cells = x.cells; return s; })); } } }; }
  W.ActiveXObject = function (name) {
    if (/Excel\.Application/i.test(name) && top.__excel) return excelApp();
    if (/FileSystemObject/i.test(name)) return fso;
    if (/WScript\.Shell/i.test(name)) return wsh;
    if (/Shell\.Application/i.test(name)) return shellApp;
    throw err("Automation server can't create object: " + name);      // ADODB, Excel... behave as blocked
  };
  W.Enumerator = function (c) { var i = 0; this.atEnd = function () { return i >= c.length; }; this.moveNext = function () { i++; }; this.item = function () { return c[i]; }; };
  W.VBArray = function (a) { this.toArray = function () { return a; }; };
  try { W.clipboardData = { _t: "", setData: function (k, t) { top.__clip = t; return true; }, getData: function () { return top.__clip || ""; } }; } catch (e) { }
  W.__fsLog = FS.log;
})();
