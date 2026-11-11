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
  /* t = { project, to, attn, purpose, notes, items: [...], tasks? }; opts.copy = copy each item's files in;
     opts.extra = [[source, path inside the transmittal folder], ...] (e.g. a task pack and its References\ files).
     Returns { no, dir, file, copied, errors }. Excel makes the sheet; without Excel a CSV is made. */
  L.trMake = function (t, opts) {
    opts = opts || {}; var s = L.trLoad();
    t.no = L.trNo(s); t.date = L.today(); t.by = t.by || L.settings().userName || "";
    var dir = L.trDir(s, t.no), base = dir + "\\" + t.no + "_" + L.safeName(t.to || "Transmittal").replace(/ /g, "_") + "_" + L.today(), made = null, copied = 0, errs = [];
    L.mkdirs(dir);
    try { made = trExcel(base + ".xlsx", t); } catch (e) { made = trCsv(base + ".csv", t); t.csv = true; }
    var put = function (src, to) {
      try { if (fso.FileExists(to) || fso.FolderExists(to)) throw new Error("already there"); var pd = to.substring(0, to.lastIndexOf("\\")); L.mkdirs(pd);
        if (fso.FolderExists(src)) fso.CopyFolder(src, to, false); else fso.CopyFile(src, to, false); copied++; } catch (e) { errs.push(fso.GetFileName(src) + ": " + (e.message || e)); } };
    if (opts.copy) for (var k = 0; k < t.items.length; k++) for (var f = 0; f < (t.items[k].files || []).length; f++) put(t.items[k].files[f], dir + "\\" + fso.GetFileName(t.items[k].files[f]));
    for (var x = 0; x < (opts.extra || []).length; x++) put(opts.extra[x][0], dir + "\\" + opts.extra[x][1]);
    t.file = made; t.dir = dir; s.log.push(t); s.next++; if (t.project) s.project = t.project; L.trSave(s);
    return { no: t.no, dir: dir, file: made, copied: copied, errors: errs };
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
