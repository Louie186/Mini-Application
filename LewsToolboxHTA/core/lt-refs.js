/* Lew's Toolbox - references for a task or a checklist item (used by Tasks and Delegate).
   A reference: { kind: "link" | "file" | "folder" | "drawing" | "note", value, label, send: "copy" | "link" }
     link    = a web / SharePoint / ACC address        file / folder = a path on the PC or network
     drawing = a drawing number (title from the Drawing Register)   note = a short instruction
   send "copy" = the file / folder is copied into the transmittal when the task is delegated (default for files);
   send "link" = only its location is given (for things already on a shared drive). */
(function (L) {
  var KINDS = [["link", "&#128279;", "Link"], ["file", "&#128196;", "File"], ["folder", "&#128193;", "Folder"], ["drawing", "&#128208;", "Drawing"], ["note", "&#128221;", "Note"]];
  var ICON = {}, NAME = {}; for (var i = 0; i < KINDS.length; i++) { ICON[KINDS[i][0]] = KINDS[i][1]; NAME[KINDS[i][0]] = KINDS[i][2]; }
  L.REF_ICON = ICON; L.REF_NAME = NAME;
  function base(p) { p = ("" + p).replace(/[\\\/]+$/, ""); var i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/")); return i >= 0 ? p.substring(i + 1) : p; }
  L.refBase = base;
  /* what a reference shows as */
  L.refLabel = function (r) {
    if (r.label) return r.label;
    if (r.kind == "file" || r.kind == "folder") return base(r.value);
    if (r.kind == "drawing") { try { var R = L.register && L.register(), d = R && R.find(r.value); if (d && d.title) return r.value + " - " + d.title; } catch (e) { } }
    return r.value;
  };
  L.refCopies = function (r) { return (r.kind == "file" || r.kind == "folder") && r.send != "link"; };
  /* plain text, one line each (email, CSV, Excel) */
  L.refLines = function (refs) {
    var o = []; for (var i = 0; i < (refs || []).length; i++) { var r = refs[i];
      o.push(NAME[r.kind] + ": " + (r.label && r.kind != "note" ? r.label + " - " : "") + (r.kind == "note" ? r.value : r.kind == "drawing" ? L.refLabel(r) : r.value) + (L.refCopies(r) ? "  (copy in the transmittal)" : "")); }
    return o;
  };
  /* small read-only list, e.g. under a task in a list */
  L.refChips = function (refs) {
    var h = ""; for (var i = 0; i < (refs || []).length; i++) { var r = refs[i];
      h += '<span class="rfc" title="' + L.esc(NAME[r.kind] + ": " + r.value) + '">' + ICON[r.kind] + " " + L.esc(L.refLabel(r)) + "</span>"; }
    return h;
  };
  /* editor: shows the references in "el" and changes the "refs" array in place; onChange() after every change */
  L.refEditor = function (el, refs, onChange) {
    var draw = function () {
      var h = [];
      for (var i = 0; i < refs.length; i++) { var r = refs[i], fileish = r.kind == "file" || r.kind == "folder";
        h.push('<div class="rf" data-ri="' + i + '"><span class="rfi" title="' + NAME[r.kind] + '">' + ICON[r.kind] + '</span>' +
          (r.kind == "note" ? '<input type="text" class="rfv" value="' + L.esc(r.value) + '" placeholder="Note">' :
            '<input type="text" class="rfl" value="' + L.esc(r.label || "") + '" placeholder="' + L.esc(L.refLabel({ kind: r.kind, value: r.value })) + '" title="Name shown to the person (optional)"><input type="text" class="rfv" value="' + L.esc(r.value) + '">') +
          (fileish ? '<select class="rfs" title="Copy it into the transmittal, or only give its location"><option value="copy"' + (r.send != "link" ? " selected" : "") + '>Send a copy</option><option value="link"' + (r.send == "link" ? " selected" : "") + ">Link only</option></select>" : "") +
          (r.kind == "link" || fileish ? '<span class="rfo" title="Open">&#8599;</span>' : "") + '<span class="rfx" title="Remove">&#10005;</span></div>'); }
      var opts = ""; for (var k = 0; k < KINDS.length; k++) opts += '<option value="' + KINDS[k][0] + '">' + KINDS[k][1] + " " + KINDS[k][2] + "</option>";
      h.push('<div class="rfadd"><select class="rfk">' + opts + '</select><input type="text" class="rfnew" placeholder="Paste a link (https://...)"><button class="btn small rfb" style="display:none">Browse...</button><button class="btn small rfa">+ Add</button></div>');
      el.innerHTML = h.join("");
      var k2 = el.getElementsByTagName("select"); for (var s = 0; s < k2.length; s++) if (k2[s].className == "rfk") k2[s].value = el.__kind || "link";
      hint();
    };
    var q = function (c) { var a = el.getElementsByTagName("*"); for (var i = 0; i < a.length; i++) if ((" " + a[i].className + " ").indexOf(" " + c + " ") >= 0) return a[i]; return null; };
    var hint = function () { var k = q("rfk").value, n = q("rfnew");
      n.placeholder = { link: "Paste a link (https://...)", file: "Path of the file, or Browse...", folder: "Path of the folder, or Browse...", drawing: "Drawing number(s) - several: one per line or , between", note: "e.g. Use the markup on page 3" }[k];
      q("rfb").style.display = k == "file" || k == "folder" ? "" : "none"; };
    var add = function () {
      var k = q("rfk").value, v = L.trim(q("rfnew").value); if (!v) { try { q("rfnew").focus(); } catch (e) { } return; }
      var vals = k == "drawing" ? v.split(/[\r\n,;]+/) : [v];
      for (var i = 0; i < vals.length; i++) { var x = L.trim(vals[i]).replace(/^"|"$/g, ""); if (x) refs.push({ kind: k, value: x, label: "", send: "copy" }); }
      el.__kind = k; draw(); if (onChange) onChange(); try { q("rfnew").focus(); } catch (e) { }
    };
    el.onclick = function (e) { e = e || window.event; var t = e.target || e.srcElement, row = L.up(t, "data-ri"), i = row ? +row.getAttribute("data-ri") : -1;
      if (t.className == "rfx" && i >= 0) { refs.splice(i, 1); draw(); if (onChange) onChange(); }
      else if (t.className == "rfo" && i >= 0) { try { L.open(refs[i].value); } catch (x) { alert("Couldn't open:\n" + refs[i].value); } }
      else if ((" " + t.className + " ").indexOf(" rfa ") >= 0) add();
      else if ((" " + t.className + " ").indexOf(" rfb ") >= 0) { if (q("rfk").value == "folder") { var f = L.pickFolder("Pick the folder"); if (f) { q("rfnew").value = f; add(); } } else L.pickFile(function (p) { q("rfnew").value = p; add(); }); } };
    el.onchange = function (e) { e = e || window.event; var t = e.target || e.srcElement, row = L.up(t, "data-ri"), i = row ? +row.getAttribute("data-ri") : -1;
      if (t.className == "rfk") { el.__kind = t.value; hint(); return; }
      if (i < 0) return; if (t.className == "rfv") refs[i].value = L.trim(t.value); else if (t.className == "rfl") refs[i].label = L.trim(t.value); else if (t.className == "rfs") refs[i].send = t.value;
      if (onChange) onChange(); };
    el.onkeydown = function (e) { e = e || window.event; var t = e.target || e.srcElement; if (e.keyCode == 13 && t.className == "rfnew") { add(); if (e.preventDefault) e.preventDefault(); e.returnValue = false; return false; } };
    draw();
    return { redraw: draw };
  };
  /* styles for the editor and the chips (added to the page's look) */
  L.REF_CSS = [".rf{display:flex;align-items:center;margin:0 0 4px}.rf .rfi{flex:none;width:22px;text-align:center}",
    ".rf .rfl{flex:0 0 160px;height:26px;margin-right:4px}.rf .rfv{flex:1 1 auto;min-width:80px;height:26px;margin-right:4px}.rf .rfs{flex:none;width:110px;height:26px;margin-right:4px}",
    ".rf .rfo,.rf .rfx{flex:none;width:24px;text-align:center;cursor:pointer;color:{muted}}.rf .rfo:hover{color:{accent}}.rf .rfx:hover{color:{bad}}",
    ".rfadd{display:flex;align-items:center;margin-top:2px}.rfadd .rfk{flex:none;width:110px;height:26px;margin-right:4px}.rfadd .rfnew{flex:1 1 auto;height:26px;margin-right:4px}.rfadd .btn{margin:0 4px 0 0}",
    ".rfc{display:inline-block;margin:2px 6px 0 0;padding:0 7px;font-size:.85em;border-radius:{r}px;background:{chip};color:{text};white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}"];
})(LT);
