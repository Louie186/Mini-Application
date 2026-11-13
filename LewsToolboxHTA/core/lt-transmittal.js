/* Lew's Toolbox - making a transmittal (numbered sheet + optional copies of the files), shared by the
   Transmittal tab and the Delegate tab (delegating makes one for each person). Log: transmittals.json
   { next, prefix, log: [ { no, date, project, to, attn, purpose, notes, by, items: [ { number, title, rev, types, files } ], file, dir, tasks } ], project, out } */
(function (L) {
  var fso = L.fso;
  L.trFile = function () { return L.dataPath("transmittals.json"); };
  L.trLoad = function () { var s = L.readJson(L.trFile(), null) || {}; s.next = s.next || 1; s.prefix = s.prefix || "TR-"; s.log = s.log || []; s.project = s.project || ""; s.out = s.out || ""; return s; };
  L.trSave = function (s) { L.saveJson(L.trFile(), s); };
  L.trNo = function (s, n) { var x = "" + (n == null ? s.next : n); while (x.length < 3) x = "0" + x; return s.prefix + x; };
  L.trDir = function (s, no) { return (s.out || L.exportsDir() + "\\Transmittals") + "\\" + no; };
  /* ---------- revisions ----------
     "C02" -> { p: "C", n: 2 }. Order of the letters: P (preliminary) < T (tender) < C (construction) < A (as built); other letters after, A-Z.
     L.revCmp(a, b) < 0 when a is older. */
  var RORD = { P: 1, S: 1, D: 1, T: 2, C: 3, A: 4 };
  function rp(r) { var m = /^([A-Z]*)\s*(\d*)$/i.exec(L.trim(r || "")); if (!m) return { p: L.trim(r || "").toUpperCase(), n: 0 }; return { p: m[1].toUpperCase(), n: +m[2] || 0 }; }
  function rank(p) { return p ? (RORD[p] || 10 + p.charCodeAt(0)) : 0; }
  L.revCmp = function (a, b) { var x = rp(a), y = rp(b); if (x.p != y.p) return rank(x.p) - rank(y.p); return x.n - y.n; };
  var REV = /^([A-Z]{1,2}\d{1,3}|\d{2,3})$/i;
  /* "A-101-C02" -> { base: "A-101", rev: "C02" } (the revision is the last part after - or _) */
  L.trSplit = function (stem) { var i = Math.max(stem.lastIndexOf("-"), stem.lastIndexOf("_")); if (i > 0 && (stem.match(/[-_]/g) || []).length >= 2 && REV.test(stem.substring(i + 1))) return { base: stem.substring(0, i), rev: stem.substring(i + 1).toUpperCase() }; return { base: stem, rev: "" }; };
  /* every drawing ever issued: { "A-101": { rev: highest rev, no: "TR-005", date, last: { rev, no, date } } } */
  L.trIssued = function (s, to) {
    s = s || L.trLoad(); var o = {}, who = L.trim(to || "").toUpperCase();
    for (var i = 0; i < s.log.length; i++) { var t = s.log[i]; if (who && L.trim(t.to || "").toUpperCase() != who) continue; for (var k = 0; k < (t.items || []).length; k++) { var it = t.items[k], key = L.trim(it.number || "").toUpperCase(); if (!key) continue;
      var x = o[key] || (o[key] = { rev: "", no: "", date: "", last: null, count: 0 }); x.count++; x.last = { rev: it.rev || "", no: t.no, date: t.date };
      if (!x.no || L.revCmp(it.rev, x.rev) >= 0) { x.rev = it.rev || ""; x.no = t.no; x.date = t.date; } } }
    return o;
  };
  /* before issuing: is this revision right? { level: "bad" | "warn" | "ok" | "new", text }
     - lower than one already issued, or a newer revision of it is in the same folder = bad
     - the same revision as already issued = warn (a re-issue?) */
  L.revCheck = function (issued, number, rev, files) {
    var key = L.trim(number || "").toUpperCase(), x = issued[key], res = null;
    if (x && x.rev && rev && L.revCmp(rev, x.rev) < 0) res = { level: "bad", text: "\u26a0 Lower than " + x.rev + " already issued (" + x.no + ")" };
    else if (x && L.trim(rev).toUpperCase() == L.trim(x.rev).toUpperCase()) res = { level: "warn", text: "Same rev as " + x.no + " (" + L.fmtDate(x.date) + ") \u2013 a re-issue?" };
    else if (x) res = { level: "ok", text: "\u2191 from " + (x.rev || "(no rev)") + " (" + x.no + ")" };
    else res = { level: "new", text: "First issue" };
    var dirs = {}, newer = "";
    for (var i = 0; i < (files || []).length; i++) { var d = fso.GetParentFolderName(files[i]); if (d && !dirs[d.toLowerCase()]) { dirs[d.toLowerCase()] = d; } }
    for (var dk in dirs) if (dirs.hasOwnProperty(dk)) { try { var e = new Enumerator(fso.GetFolder(dirs[dk]).Files);
      for (; !e.atEnd(); e.moveNext()) { var n = "" + e.item().Name, j = n.lastIndexOf("."), sp = L.trSplit(j > 0 ? n.substring(0, j) : n);
        if (sp.base.toUpperCase() == key && sp.rev && rev && L.revCmp(sp.rev, rev) > 0 && (!newer || L.revCmp(sp.rev, newer) > 0)) newer = sp.rev; } } catch (e2) { } }
    if (newer) res = { level: "bad", text: "\u26a0 " + newer + " is in the folder \u2013 newer than " + rev };
    return res;
  };

  /* what's new since the last issue (to everyone, or to one recipient):
     docs = [{ number, rev }] -> { last: the last transmittal (to them), groups: { "new": [...], revised: [...], same: [...], older: [...] } }
     new = never sent · revised = a higher revision than sent · same = this revision was sent already · older = lower than sent */
  L.sinceLast = function (docs, to, s) {
    s = s || L.trLoad(); var iss = L.trIssued(s, to), g = { "new": [], revised: [], same: [], older: [] }, last = null, who = L.trim(to || "").toUpperCase();
    for (var i = s.log.length - 1; i >= 0 && !last; i--) if (!who || L.trim(s.log[i].to || "").toUpperCase() == who) last = s.log[i];
    for (var k = 0; k < docs.length; k++) { var d = docs[k], x = iss[L.trim(d.number || "").toUpperCase()];
      if (!x) g["new"].push(d); else if (L.trim(d.rev).toUpperCase() == L.trim(x.rev).toUpperCase()) g.same.push(d); else if (x.rev && d.rev && L.revCmp(d.rev, x.rev) < 0) g.older.push(d); else g.revised.push(d);
      d.was = x ? x.rev + " (" + x.no + ")" : ""; }
    return { last: last, groups: g };
  };

  /* t = { project, to, attn, purpose, notes, items: [...], tasks? }; opts.copy = copy each item's files in;
     opts.extra = [[source, path inside the transmittal folder], ...] (e.g. a task pack and its References\ files).
     Returns { no, dir, file, copied, errors }. Excel makes the sheet; without Excel a CSV is made. */
  /* opts.copy  = copy each item's files into the TR folder ("folder" package)
     opts.zip   = one zip, TR-005.zip, made straight from the files where they are - the transmittal sheet + each file once
                  (no copies in the folder, a name that appears twice goes in once) ("zip" package)
     neither     = the sheet only; the files stay where they are and their paths are in the log ("log" package) */
  L.trMake = function (t, opts) {
    opts = opts || {}; var s = L.trLoad();
    t.package = opts.zip ? "zip" : opts.copy ? "folder" : t.package || (opts.extra && opts.extra.length ? "folder" : "log");
    t.no = L.trNo(s); t.date = L.today(); t.by = t.by || L.settings().userName || "";
    var dir = L.trDir(s, t.no), base = dir + "\\" + t.no + "_" + L.safeName(t.to || "Transmittal").replace(/ /g, "_") + "_" + L.today(), made = null, copied = 0, errs = [];
    L.mkdirs(dir);
    try { made = trExcel(base + ".xlsx", t); } catch (e) { made = trCsv(base + ".csv", t); t.csv = true; }
    var put = function (src, to) {
      try { if (fso.FileExists(to) || fso.FolderExists(to)) throw new Error("already there"); var pd = to.substring(0, to.lastIndexOf("\\")); L.mkdirs(pd);
        if (fso.FolderExists(src)) fso.CopyFolder(src, to, false); else fso.CopyFile(src, to, false); copied++; } catch (e) { errs.push(fso.GetFileName(src) + ": " + (e.message || e)); } };
    if (opts.copy) for (var k = 0; k < t.items.length; k++) for (var f = 0; f < (t.items[k].files || []).length; f++) put(t.items[k].files[f], dir + "\\" + fso.GetFileName(t.items[k].files[f]));
    for (var x = 0; x < (opts.extra || []).length; x++) put(opts.extra[x][0], dir + "\\" + opts.extra[x][1]);
    if (opts.zip) {
      var src = [made], seen = {}, skipped = 0; seen[fso.GetFileName(made).toLowerCase()] = 1;
      var addSrc = function (p) { if (!p) return; var n = fso.GetFileName(p).toLowerCase(); if (seen[n]) { skipped++; return; } if (!fso.FileExists(p) && !fso.FolderExists(p)) { errs.push(fso.GetFileName(p) + ": not found"); return; } seen[n] = 1; src.push(p); };
      for (var k2 = 0; k2 < t.items.length; k2++) for (var f2 = 0; f2 < (t.items[k2].files || []).length; f2++) addSrc(t.items[k2].files[f2]);
      for (var x2 = 0; x2 < (opts.zipExtra || []).length; x2++) addSrc(opts.zipExtra[x2]);
      var zip = dir + "\\" + t.no + "_" + L.safeName(t.to || "Transmittal").replace(/ /g, "_") + "_" + L.today() + ".zip", lst = dir + "\\_zip-list.txt";
      try { if (fso.FileExists(zip)) fso.DeleteFile(zip, true); } catch (e) { }
      L.writeUtf8(lst, src.join("\r\n"), true);   // the list in a file: no limit on how many files
      L.wsh.Run('powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$l = Get-Content -LiteralPath \'' + lst.replace(/'/g, "''") + '\' -Encoding UTF8 | Where-Object { $_ }; Compress-Archive -LiteralPath $l -DestinationPath \'' + zip.replace(/'/g, "''") + '\' -Force"', 0, true);
      try { fso.DeleteFile(lst, true); } catch (e) { }
      if (fso.FileExists(zip)) { t.zip = zip; t.zipCount = src.length; copied = src.length - 1; if (skipped) errs.push(skipped + " file(s) with the same name as another went in once"); }
      else errs.push("The zip couldn't be made (needs Windows PowerShell 5) - the sheet is in " + dir);
    }
    t.file = made; t.dir = dir; s.log.push(t); s.next++; if (t.project) s.project = t.project; L.trSave(s);
    return { no: t.no, dir: dir, file: made, copied: copied, errors: errs, zip: t.zip || "" };
  };
function trCsv(path, t) {
    var rows = [["TRANSMITTAL", t.no], ["Project", t.project], ["To", t.to], ["Attention", t.attn], ["From", t.by], ["Date", t.date], ["Purpose of issue", t.purpose], ["Notes", t.notes], [], ["No.", "Drawing / document number", "Title", "Rev", "Format"]];
    for (var i = 0; i < t.items.length; i++) rows.push([i + 1, t.items[i].number, t.items[i].title, t.items[i].rev, t.items[i].types]);
    rows.push([], ["Issued by", t.by, "Received by", ""]); LT.writeCsv(path, rows); return path;
  }
  function trExcel(path, t) {
    var xl = null, wb = null;
    try {
      xl = new ActiveXObject("Excel.Application"); xl.Visible = false; xl.DisplayAlerts = false;
      wb = xl.Workbooks.Add(); while (wb.Worksheets.Count > 1) wb.Worksheets(wb.Worksheets.Count).Delete();
      var ws = wb.Worksheets(1); ws.Name = "Transmittal";
      var W = [6, 38, 50, 8, 14]; for (var c = 0; c < W.length; c++) ws.Columns(c + 1).ColumnWidth = W[c];
      ws.Cells(1, 1).Value = "TRANSMITTAL"; ws.Cells(1, 1).Font.Size = 18; ws.Cells(1, 1).Font.Bold = true;
      ws.Cells(1, 5).Value = t.no; ws.Cells(1, 5).Font.Size = 14; ws.Cells(1, 5).Font.Bold = true; ws.Cells(1, 5).HorizontalAlignment = -4152;
      var head = [["Project", t.project], ["To", t.to], ["Attention", t.attn], ["From", t.by], ["Date", ""], ["Purpose of issue", t.purpose]];
      for (var i = 0; i < head.length; i++) { ws.Cells(3 + i, 1).Value = head[i][0]; ws.Cells(3 + i, 1).Font.Bold = true; ws.Cells(3 + i, 2).Value = head[i][1]; }
      var d = LT.parseIso(t.date); ws.Cells(7, 2).Formula = "=DATE(" + d.getFullYear() + "," + (d.getMonth() + 1) + "," + d.getDate() + ")"; ws.Cells(7, 2).Value2 = ws.Cells(7, 2).Value2; ws.Cells(7, 2).NumberFormat = "dd mmm yyyy"; ws.Cells(7, 2).HorizontalAlignment = -4131;
      var r = 10, hdr = ["No.", "Drawing / document number", "Title", "Rev", "Format"];
      for (var h = 0; h < hdr.length; h++) { var hc = ws.Cells(r, h + 1); hc.Value = hdr[h]; hc.Font.Bold = true; hc.Font.Color = 0xFFFFFF; hc.Interior.Color = 0x7E3E5B; }
      for (var k = 0; k < t.items.length; k++) { r++; var it = t.items[k]; ws.Cells(r, 1).Value = k + 1; ws.Cells(r, 2).NumberFormat = "@"; ws.Cells(r, 2).Value = it.number; ws.Cells(r, 3).Value = it.title; ws.Cells(r, 4).NumberFormat = "@"; ws.Cells(r, 4).Value = it.rev; ws.Cells(r, 5).Value = it.types; ws.Cells(r, 3).WrapText = true; }
      try { var rg = ws.Range("A10:E" + r); rg.Borders.LineStyle = 1; rg.Borders.Color = 0xE2D7D0; } catch (e) { }
      r += 2; if (t.notes) { ws.Cells(r, 1).Value = "Notes"; ws.Cells(r, 1).Font.Bold = true; ws.Cells(r, 2).Value = t.notes; r += 2; }
      ws.Cells(r, 1).Value = "Issued by"; ws.Cells(r, 2).Value = t.by + "   ____________________"; ws.Cells(r, 3).Value = "Received by   ____________________   Date  __________";
      ws.Range("A" + r + ":C" + r).Font.Bold = true;
      try { ws.PageSetup.Orientation = 1; ws.PageSetup.Zoom = false; ws.PageSetup.FitToPagesWide = 1; ws.PageSetup.FitToPagesTall = false; } catch (e) { }
      if (fso.FileExists(path)) fso.DeleteFile(path);
      wb.SaveAs(path, 51); return path;
    } finally { try { if (wb) wb.Close(false); } catch (e) { } try { if (xl) xl.Quit(); } catch (e) { } }
  }
})(LT);
