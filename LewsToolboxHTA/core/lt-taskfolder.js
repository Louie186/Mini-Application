/* Lew's Toolbox - task folders (used by the Tasks tab, and by Delegate for the references).
   A task folder (you choose where, you type its name):
     <name>\Reference\   what the work is based on (drawings, screenshots, emails, specs...)
            Incoming\    what comes back (markups, replies)
            Output\      what you / the team produce
            Reference\Backup and Ref\  (kept out of the way, so the top of the folder stays clean)
               Task Summary.html / .pdf  a one-page summary with links to every file (made new on every save)
               Notes.txt                 the dated notes, as plain text
               _task.json (hidden)       lets the Toolbox recognise the folder later; _task.backup.json = the one before
   The files are read from the folders every time, so a file renamed / added / deleted in Explorer shows up as it is.
   Plain ES5 for the HTA (Internet Explorer 11) engine. */
(function (L) {
  var fso = L.fso, SUBS = ["Reference", "Incoming", "Output"], MARK = "lt-task-folder";
  L.TF_SUBS = SUBS;
  var META = "Backup and Ref";
  L.TF_META = META;
  function metaDir(dir) { return dir + "\\Reference\\" + META; }
  function jsonPath(dir) { return metaDir(dir) + "\\_task.json"; }
  L.tfSummaryPath = function (dir) { return metaDir(dir) + "\\Task Summary.html"; };
  L.tfMetaDir = metaDir;
  /* recognised by its _task.json (in Reference\Backup and Ref, or at the top in folders made before) */
  L.tfIs = function (dir) { return !!dir && (fso.FileExists(jsonPath(dir)) || fso.FileExists(dir + "\\_task.json")); };
  L.tfRead = function (dir) { var j = L.readJson(jsonPath(dir), null) || L.readJson(dir + "\\_task.json", null); return j && j.kind == MARK ? j : null; };
  function hide(p) { try { fso.GetFile(p).Attributes = 2; } catch (e) { } }
  function unhide(p) { try { fso.GetFile(p).Attributes = 0; } catch (e) { } }
  /* makes the folder + its subfolders; returns the full path (or throws with a clear message) */
  L.tfMake = function (where, name) {
    name = L.trim(L.safeName(name || "")); if (!name) throw new Error("Type a folder name.");
    if (!where || !fso.FolderExists(where)) throw new Error("Pick where the folder goes.");
    var dir = where.replace(/[\\\/]+$/, "") + "\\" + name;
    if (fso.FolderExists(dir) && !L.tfIs(dir)) { var n = 0; var e = new Enumerator(fso.GetFolder(dir).Files); for (; !e.atEnd(); e.moveNext()) n++; if (n) throw new Error('"' + name + '" is already there and has files in it. Type another name, or use "Open a task folder" for an existing one.'); }
    L.mkdirs(dir); for (var i = 0; i < SUBS.length; i++) L.mkdirs(dir + "\\" + SUBS[i]); L.mkdirs(metaDir(dir));
    return dir;
  };
  /* every file in the three subfolders (and their subfolders): [{ sub, rel, name, path, ext, size, date }] */
  L.tfFiles = function (dir) {
    var out = [];
    var walk = function (sub, d, rel) { if (!fso.FolderExists(d)) return; var fo = fso.GetFolder(d), e = new Enumerator(fo.Files);
      for (; !e.atEnd(); e.moveNext()) { var f = e.item(), n = "" + f.Name; if (f.Attributes & 6 || /^~\$|^thumbs\.db$|^desktop\.ini$/i.test(n)) continue;
        var i = n.lastIndexOf("."), dt = null; try { dt = new Date(f.DateLastModified); } catch (x) { }
        out.push({ sub: sub, rel: (rel ? rel + "\\" : "") + n, name: n, path: "" + f.Path, ext: i > 0 ? n.substring(i + 1).toLowerCase() : "", size: +f.Size || 0, date: dt && !isNaN(dt) ? L.iso(dt) : "" }); }
      var s = new Enumerator(fo.SubFolders); for (; !s.atEnd(); s.moveNext()) if (!(s.item().Attributes & 6) && !(sub == "Reference" && !rel && ("" + s.item().Name).toLowerCase() == META.toLowerCase())) walk(sub, "" + s.item().Path, (rel ? rel + "\\" : "") + s.item().Name); };
    for (var i = 0; i < SUBS.length; i++) walk(SUBS[i], dir + "\\" + SUBS[i], "");
    out.sort(function (a, b) { return a.sub == b.sub ? (a.rel.toLowerCase() < b.rel.toLowerCase() ? -1 : 1) : SUBS.indexOf(a.sub) - SUBS.indexOf(b.sub); });
    return out;
  };
  /* copies or moves files / folders into <dir>\<sub>; a name that's already there gets (2), (3)... Returns { added: [names], errors: [] } */
  L.tfAdd = function (dir, sub, paths, move) {
    var to = dir + "\\" + sub, res = { added: [], errors: [] }; L.mkdirs(to);
    for (var i = 0; i < paths.length; i++) { var p = L.trim(paths[i]).replace(/^"|"$/g, ""); if (!p) continue;
      var isDir = fso.FolderExists(p); if (!isDir && !fso.FileExists(p)) { res.errors.push(p + " (not found)"); continue; }
      if (p.toLowerCase().indexOf(dir.toLowerCase() + "\\") == 0) { res.errors.push(L.refBase ? L.refBase(p) : p + " (already in the task folder)"); continue; }
      var nm = fso.GetFileName(p), b = nm, n = 1, dot = isDir ? -1 : b.lastIndexOf(".");
      while (fso.FileExists(to + "\\" + nm) || fso.FolderExists(to + "\\" + nm)) { n++; nm = dot > 0 ? b.substring(0, dot) + " (" + n + ")" + b.substring(dot) : b + " (" + n + ")"; }
      try { if (isDir) { if (move) fso.MoveFolder(p, to + "\\" + nm); else fso.CopyFolder(p, to + "\\" + nm, false); } else { if (move) fso.MoveFile(p, to + "\\" + nm); else fso.CopyFile(p, to + "\\" + nm, false); } res.added.push(nm); }
      catch (e) { res.errors.push(nm + " (" + (e.message || e) + ")"); } }
    return res;
  };
  /* Ctrl+V: whatever is on the clipboard goes into <dir>\<sub> -
     files / folders copied in Explorer (Ctrl+C) are copied in; a picture (snip) is saved as a PNG.
     Returns { kind: "files" | "image" | "", added: [names], errors: [] } */
  /* the files / folders copied in Explorer (Ctrl+C): just their full paths - nothing is copied */
  L.clipPaths = function () {
    var lst = L.env("%TEMP%") + "\\lt-clipp-" + new Date().getTime() + ".txt", q = function (x) { return x.replace(/'/g, "''"); }, paths = [];
    var ps = "Add-Type -AssemblyName System.Windows.Forms; $f=[Windows.Forms.Clipboard]::GetFileDropList(); if($f.Count){[IO.File]::WriteAllLines('" + q(lst) + "',[string[]]$f,[Text.Encoding]::Unicode)}";
    L.wsh.Run('powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -Command "' + ps.replace(/"/g, '\\"') + '"', 0, true);
    if (fso.FileExists(lst)) { try { var t = fso.OpenTextFile(lst, 1, false, -1); paths = (t.AtEndOfStream ? "" : t.ReadAll()).split(/\r?\n/); t.Close(); fso.DeleteFile(lst); } catch (e) { } }
    var o = []; for (var i = 0; i < paths.length; i++) if (L.trim(paths[i])) o.push(L.trim(paths[i])); return o;
  };
  L.tfPaste = function (dir, sub) {
    var d = new Date(), b = "Screenshot " + L.iso(d) + " " + L.pad(d.getHours()) + L.pad(d.getMinutes()) + L.pad(d.getSeconds()), nm = b + ".png", n = 1;
    while (fso.FileExists(dir + "\\" + sub + "\\" + nm)) nm = b + " (" + (++n) + ").png";
    var to = dir + "\\" + sub + "\\" + nm, lst = L.env("%TEMP%") + "\\lt-clip-" + d.getTime() + ".txt";
    L.mkdirs(dir + "\\" + sub);
    var q = function (s) { return s.replace(/'/g, "''"); };
    var ps = "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $f=[Windows.Forms.Clipboard]::GetFileDropList(); " +
      "if($f.Count){[IO.File]::WriteAllLines('" + q(lst) + "',[string[]]$f,[Text.Encoding]::Unicode)} " +
      "else{$i=[Windows.Forms.Clipboard]::GetImage(); if($i){$i.Save('" + q(to) + "',[Drawing.Imaging.ImageFormat]::Png)}}";
    L.wsh.Run('powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -Command "' + ps.replace(/"/g, '\\"') + '"', 0, true);
    if (fso.FileExists(to)) return { kind: "image", added: [nm], errors: [] };
    if (fso.FileExists(lst)) {
      var paths = []; try { var t = fso.OpenTextFile(lst, 1, false, -1); paths = (t.AtEndOfStream ? "" : t.ReadAll()).split(/\r?\n/); t.Close(); fso.DeleteFile(lst); } catch (e) { }
      var r = L.tfAdd(dir, sub, paths, false); r.kind = "files"; return r;
    }
    return { kind: "", added: [], errors: [] };
  };
  /* saves _task.json (hidden), Notes.txt and the summary (HTML, then PDF) */
  L.tfSave = function (dir, task, opts) {
    opts = opts || {};
    var j = { kind: MARK, v: 1, app: "Lew's Toolbox", id: task.id, code: task.code, title: task.title, project: task.project || "", who: task.who || "", due: task.due || "", status: task.status || "", priority: task.priority || "",
      created: task.created || "", events: task.events || [], description: task.notes || "", subs: task.subs || [], refs: task.refs || [], notes: task.fnotes || [], folder: dir, saved: L.today() };
    var md = metaDir(dir); L.mkdirs(md);
    var old = ["_task.json", "Notes.txt", "Task Summary.html", "Task Summary.pdf"];   // folders made before: their files move into Backup and Ref
    for (var o = 0; o < old.length; o++) { var op = dir + "\\" + old[o]; if (fso.FileExists(op)) { try { unhide(op); if (fso.FileExists(md + "\\" + old[o])) fso.DeleteFile(op, true); else fso.MoveFile(op, md + "\\" + old[o]); } catch (x) { } } }
    var jp = jsonPath(dir), bp = md + "\\_task.backup.json";
    if (fso.FileExists(jp)) { try { unhide(bp); unhide(jp); fso.CopyFile(jp, bp, true); hide(bp); } catch (x) { } }   // the one before, just in case
    unhide(jp); L.saveJson(jp, j); hide(jp);
    var nt = []; for (var i = 0; i < j.notes.length; i++) nt.push(j.notes[i].at + "\r\n" + j.notes[i].text + "\r\n"); L.writeUtf8(md + "\\Notes.txt", (j.title ? j.code + " " + j.title + " - notes\r\n\r\n" : "") + nt.join("\r\n"), true);
    var html = L.tfSummaryPath(dir); L.writeUtf8(html, L.tfSummary(dir, task), true);
    var pdf = "", locked = false;
    if (opts.pdf !== false) { var pp = md + "\\Task Summary.pdf"; pdf = L.tfPdf(html, pp); locked = !pdf && fso.FileExists(pp); }
    return { html: html, pdf: pdf, locked: locked };
  };
  /* PDF: printed by Edge (or Chrome) without a window - links stay clickable. Word is the backup. */
  L.tfPdf = function (html, pdf) {
    var env = function (s) { try { return L.env(s); } catch (e) { return ""; } }, cands = [env("%ProgramFiles(x86)%") + "\\Microsoft\\Edge\\Application\\msedge.exe", env("%ProgramFiles%") + "\\Microsoft\\Edge\\Application\\msedge.exe",
      env("%ProgramFiles%") + "\\Google\\Chrome\\Application\\chrome.exe", env("%ProgramFiles(x86)%") + "\\Google\\Chrome\\Application\\chrome.exe", env("%LOCALAPPDATA%") + "\\Google\\Chrome\\Application\\chrome.exe"];
    try { if (fso.FileExists(pdf)) fso.DeleteFile(pdf, true); } catch (e) { }
    if (fso.FileExists(pdf)) return "";   // still there = open in a PDF viewer: can't replace it now
    for (var i = 0; i < cands.length; i++) if (cands[i] && fso.FileExists(cands[i])) {
      L.wsh.Run('"' + cands[i] + '" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="' + pdf + '" "file:///' + html.replace(/\\/g, "/").replace(/ /g, "%20") + '"', 0, true);
      if (fso.FileExists(pdf)) return pdf; }
    var w = null; try { w = new ActiveXObject("Word.Application"); w.Visible = false; var doc = w.Documents.Open(html, false, true); doc.SaveAs2 ? doc.SaveAs2(pdf, 17) : doc.SaveAs(pdf, 17); doc.Close(false); } catch (e) { } finally { try { if (w) w.Quit(); } catch (e) { } }
    return fso.FileExists(pdf) ? pdf : "";
  };
  /* ---------- timeline: what happened to a task, from the Tasks tab (t.events) and from Delegate (its history) ----------
     [{ at: "2026-11-11 09:30", text, from: "Tasks" | "Delegate" }], oldest first */
  L.taskTimeline = function (t) {
    var out = [], ev = t.events || [], i;
    for (i = 0; i < ev.length; i++) out.push({ at: ev[i].at, text: ev[i].text, from: "Tasks" });
    if (t.delegated && t.delegated.code) {
      var dg = L.readJson(L.dataPath("delegate.json"), null) || {}, ts = dg.tasks || [], d = null;
      for (i = 0; i < ts.length; i++) if (ts[i].code == t.delegated.code) d = ts[i];
      var now = new Date();
      for (i = 0; d && i < (d.history || []).length; i++) {
        var m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d\d:\d\d)\s+(.*)$/.exec(d.history[i]); if (!m) continue;
        var mo = L.MON.indexOf(m[2]), y = now.getFullYear(); if (mo < 0) continue; if (mo > now.getMonth()) y--;   // Delegate's history has no year
        out.push({ at: L.iso(new Date(y, mo, +m[1])) + " " + m[3], text: d.code + ": " + m[4], from: "Delegate" }); } }
    out.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    return out;
  };
  L.taskEvent = function (t, text) { var d = new Date(); t.events = t.events || []; t.events.push({ at: L.iso(d) + " " + L.pad(d.getHours()) + ":" + L.pad(d.getMinutes()), text: text }); };

  /* ---------- close-out pack: Output + the summary (PDF + HTML) + notes, zipped next to the task folder's subfolders ---------- */
  L.tfCloseOut = function (dir, t) {
    var r = L.tfSave(dir, t), md = metaDir(dir), parts = [];
    if (fso.FolderExists(dir + "\\Output")) parts.push(dir + "\\Output");
    var extra = ["Task Summary.pdf", "Task Summary.html", "Notes.txt"]; for (var i = 0; i < extra.length; i++) if (fso.FileExists(md + "\\" + extra[i])) parts.push(md + "\\" + extra[i]);
    var zip = dir + "\\" + L.safeName((t.code ? t.code + " " : "") + t.title) + " - close-out " + L.today() + ".zip";
    try { if (fso.FileExists(zip)) fso.DeleteFile(zip, true); } catch (e) { throw new Error("The old close-out zip is open somewhere - close it and try again."); }
    var q = function (x) { return "'" + x.replace(/'/g, "''") + "'"; }, list = []; for (var k = 0; k < parts.length; k++) list.push(q(parts[k]));
    L.wsh.Run('powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Compress-Archive -LiteralPath ' + list.join(",").replace(/"/g, '\\"') + " -DestinationPath " + q(zip) + ' -Force"', 0, true);
    if (!fso.FileExists(zip)) throw new Error("The zip couldn't be made (needs Windows PowerShell 5 - standard on Windows 10 / 11).");
    return { zip: zip, pdf: r.pdf, parts: parts.length };
  };

  /* ---------- the summary page ---------- */
  function e(s) { return L.esc(s == null ? "" : s); }
  /* the summary lives in Reference\Backup and Ref\, so the links go two folders up; names with & # % spaces are encoded */
  function href(rel) { return "../../" + rel.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/"); }
  function size(n) { return n >= 1048576 ? (Math.round(n / 104857.6) / 10) + " MB" : n >= 1024 ? Math.round(n / 1024) + " KB" : n + " B"; }
  function date(iso) { var d = L.parseIso(iso); return d ? d.getDate() + " " + L.MON[d.getMonth()] + " " + d.getFullYear() : (iso || "&ndash;"); }
  var KIND = { pdf: "PDF", dwg: "DWG", dxf: "DXF", rvt: "Revit", rfa: "Revit family", ifc: "IFC", nwd: "Navisworks", nwc: "Navisworks", png: "Image", jpg: "Image", jpeg: "Image", gif: "Image", bmp: "Image", msg: "Email", eml: "Email", docx: "Word", doc: "Word", xlsx: "Excel", xls: "Excel", xlsm: "Excel", csv: "CSV", txt: "Text", zip: "ZIP" };
  L.tfSummary = function (dir, t) {
    var files = L.tfFiles(dir), by = {}, now = new Date();
    for (var i = 0; i < files.length; i++) (by[files[i].sub] = by[files[i].sub] || []).push(files[i]);
    var done = 0; for (var k = 0; k < (t.subs || []).length; k++) if (t.subs[k].status == "Done") done++;
    var fact = function (l, v) { return v ? '<div class="f"><span>' + l + "</span><b>" + v + "</b></div>" : ""; };
    var h = ['<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + e(t.code) + " " + e(t.title) + " - Task Summary</title><style>",
      "@page{size:A4;margin:14mm 14mm 16mm}*{box-sizing:border-box}body{margin:0;font:10.5pt/1.5 'Segoe UI',Arial,sans-serif;color:#1d2330;background:#eef1f5}",
      ".page{max-width:860px;margin:24px auto;background:#fff;box-shadow:0 2px 14px rgba(20,30,50,.12)}@media print{body{background:#fff}.page{margin:0;box-shadow:none;max-width:none}}",
      ".hd{background:#1f3a5f;color:#fff;padding:22px 28px 18px}.hd .k{font-size:9pt;letter-spacing:1.5px;text-transform:uppercase;opacity:.75}.hd h1{margin:4px 0 2px;font-size:20pt;font-weight:600;line-height:1.2}.hd .c{font-family:Consolas,monospace;font-size:10pt;opacity:.85}",
      ".facts{display:flex;flex-wrap:wrap;gap:0;border-bottom:1px solid #dde3ea}.f{flex:1 1 33.33%;max-width:33.34%;min-width:150px;padding:10px 28px;border-right:1px solid #eef1f5;border-bottom:1px solid #eef1f5}.f span{display:block;font-size:8pt;text-transform:uppercase;letter-spacing:.8px;color:#6b7385}.f b{font-weight:600}",
      ".sec{padding:16px 28px 6px;page-break-inside:avoid}.sec h2{margin:0 0 8px;font-size:11pt;text-transform:uppercase;letter-spacing:1px;color:#1f3a5f;border-bottom:2px solid #1f3a5f;padding-bottom:4px}",
      ".desc{white-space:pre-wrap}table{width:100%;border-collapse:collapse;font-size:9.5pt}th{text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.6px;color:#6b7385;border-bottom:1px solid #c9d2dc;padding:5px 6px}td{padding:5px 6px;border-bottom:1px solid #eef1f5;vertical-align:top}",
      "td.n{font-family:Consolas,monospace;white-space:nowrap;color:#4b5565}a{color:#1f5fbf;text-decoration:none}a:hover{text-decoration:underline}.tag{display:inline-block;padding:0 7px;border-radius:9px;font-size:8pt;font-weight:600;background:#e9eef5;color:#1f3a5f}.ok{background:#e3f4ea;color:#1f7a45}",
      ".note{border-left:3px solid #1f3a5f;padding:4px 10px;margin:0 0 8px;background:#f6f8fb}.note .at{font-size:8pt;color:#6b7385}.note .tx{white-space:pre-wrap}.muted{color:#8a93a3}",
      ".ft{padding:12px 28px 16px;font-size:8pt;color:#8a93a3;border-top:1px solid #eef1f5;display:flex;justify-content:space-between}</style></head><body><div class=\"page\">",
      '<div class="hd"><div class="k">Task Summary' + (t.project ? " &middot; " + e(t.project) : "") + '</div><h1>' + e(t.title) + '</h1><div class="c">' + e(t.code) + "</div></div>",
      '<div class="facts">' + fact("Assigned to", e(t.who || "Me")) + fact("Due", date(t.due)) + fact("Status", e(t.status || "To do")) + fact("Priority", e(t.priority || "Normal")) + fact("Created", date(t.created)) + fact("Checklist", t.subs && t.subs.length ? done + " of " + t.subs.length + " done" : "") + "</div>"];
    if (t.notes) h.push('<div class="sec"><h2>Description</h2><div class="desc">' + e(t.notes) + "</div></div>");
    var ns = t.fnotes || [];
    if (ns.length) { h.push('<div class="sec"><h2>Notes <span class="muted" style="font-weight:normal">(newest first)</span></h2>'); for (var m = ns.length - 1; m >= 0; m--) h.push('<div class="note"><div class="at">' + e(ns[m].at) + '</div><div class="tx">' + e(ns[m].text) + "</div></div>"); h.push("</div>"); }

    if (t.subs && t.subs.length) { h.push('<div class="sec"><h2>Checklist</h2><table><tr><th>ID</th><th>Item</th><th>Who</th><th>Due</th><th>Status</th></tr>');
      for (var c = 0; c < t.subs.length; c++) { var x = t.subs[c]; h.push('<tr><td class="n">' + e(x.code) + "</td><td>" + e(x.title) + "</td><td>" + e(x.who || "") + "</td><td>" + (x.due ? date(x.due) : "") + '</td><td><span class="tag' + (x.status == "Done" ? " ok" : "") + '">' + e(x.status || "To do") + "</span></td></tr>"); }
      h.push("</table></div>"); }
    var refs = (t.refs || []).slice(0); for (var r2 = 0; r2 < (t.subs || []).length; r2++) refs = refs.concat(t.subs[r2].refs || []);
    if (refs.length) { h.push('<div class="sec"><h2>References</h2><table><tr><th>Type</th><th>Reference</th></tr>');
      for (var r = 0; r < refs.length; r++) { var x2 = refs[r], lab = x2.kind == "drawing" ? L.refLabel(x2) : L.refShort ? L.refShort(x2).name : x2.value, link = x2.kind == "drawing" ? L.drawingLink(x2.value) : x2.kind == "link" ? (/^[a-z]+:/i.test(x2.value) ? x2.value : "https://" + x2.value) : x2.kind == "file" || x2.kind == "folder" ? "file:///" + x2.value.replace(/\\/g, "/") : "";
        var gone = (x2.kind == "file" && /^([a-z]:|\\\\)/i.test(x2.value) && !fso.FileExists(x2.value)) || (x2.kind == "folder" && /^([a-z]:|\\\\)/i.test(x2.value) && !fso.FolderExists(x2.value));
        if (gone) { h.push("<tr><td>" + e(L.REF_NAME ? L.REF_NAME[x2.kind] : x2.kind) + '</td><td><span class="muted" title="' + e(x2.value) + '">' + e(lab) + ' &nbsp;&#9888; not found (renamed or moved?)</span></td></tr>'); continue; }
        h.push("<tr><td>" + e(L.REF_NAME ? L.REF_NAME[x2.kind] : x2.kind) + "</td><td>" + (link ? '<a href="' + e(link) + '" title="' + e(x2.value) + '">' + e(lab) + "</a>" : e(x2.kind == "note" ? x2.value : lab)) + "</td></tr>"); }
      h.push("</table></div>"); }
    for (var s = 0; s < SUBS.length; s++) { var fs = by[SUBS[s]] || [];
      h.push('<div class="sec"><h2>' + SUBS[s] + ' <span class="muted" style="font-weight:normal">(' + fs.length + ")</span></h2>");
      if (!fs.length) h.push('<div class="muted">Nothing here yet.</div>');
      else { h.push("<table><tr><th>File</th><th>Type</th><th>Size</th><th>Date</th></tr>");
        for (var q = 0; q < fs.length; q++) h.push('<tr><td><a href="' + href(SUBS[s] + "\\" + fs[q].rel) + '">' + e(fs[q].rel) + "</a></td><td>" + e(KIND[fs[q].ext] || fs[q].ext.toUpperCase()) + "</td><td>" + size(fs[q].size) + "</td><td>" + date(fs[q].date) + "</td></tr>");
        h.push("</table>"); }
      h.push("</div>"); }
    var tl = L.taskTimeline(t);
    if (tl.length) { h.push('<div class="sec"><h2>Timeline</h2><table><tr><th style="width:130px">When</th><th>What happened</th></tr>');
      for (var z = 0; z < tl.length; z++) h.push('<tr><td class="n">' + e(tl[z].at) + "</td><td>" + e(tl[z].text) + (tl[z].from == "Delegate" ? ' <span class="muted">(Delegate)</span>' : "") + "</td></tr>");
      h.push("</table></div>"); }
    h.push('<div class="ft"><span title="' + e(dir) + '">&#128193; ' + e(fso.GetFileName(dir)) + "</span><span>Updated " + date(L.today()) + " " + L.pad(now.getHours()) + ":" + L.pad(now.getMinutes()) + (L.settings().userName ? " by " + e(L.settings().userName) : "") + " &middot; Lew's Toolbox</span></div></div></body></html>");
    return h.join("\n");
  };
})(LT);
