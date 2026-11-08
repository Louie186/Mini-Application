// Lew's Toolbox - Submission Check tab: compares a submission folder (and its subfolders) with your list (Excel / CSV).
// Checks: file count, each listed file found / missing / wrong revision / missing file type / wrong folder,
// files not on the list (extra), duplicates, empty files, names that don't follow the list's pattern.
// Self-contained: everything for this tab is in this one file. Settings: check.json in the data folder.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace LewsToolbox
{
    class CheckSettings
    {
        public string Folder = "", List = "", Formats = "";
        public string ColName = "", ColRev = "", ColFormat = "", ColFolder = "", ColTitle = "";
        public bool Subfolders = true;
    }

    class CFile { public string Full = "", Rel = "", Name = "", Stem = "", Ext = "", Folder = ""; public long Size; public bool Used; }

    class CRow
    {
        public int No;
        public string Entry = "", Title = "", Rev = "", Formats = "", Folder = "";
        public string Status = "", Note = "";
        public int Level;                                  // 0 ok, 1 warning, 2 problem
        public List<CFile> Files = new List<CFile>();
    }

    class CResult
    {
        public List<CRow> Rows = new List<CRow>();
        public List<CFile> Extra = new List<CFile>();
        public List<CFile> AllFiles = new List<CFile>();
        public List<string> Notes = new List<string>();
        public Dictionary<string, int[]> ByType = new Dictionary<string, int[]>();   // ext -> expected, found
    }

    static class SubmissionCheck
    {
        static readonly Regex RevRe = new Regex(@"^([A-Z]{1,2}\d{1,3}|\d{2,3})$", RegexOptions.IgnoreCase);

        public static string Up(string s) { return (s ?? "").Trim().ToUpperInvariant(); }
        static string Exts(string s) { return string.Join(",", Regex.Split(s ?? "", @"[\s,;/+&]+").Select(x => x.Trim().TrimStart('.').ToLowerInvariant()).Where(x => x != "")); }

        /* "5013-KEO-ZZ-DR-A-10101-P02" -> base "5013-KEO-ZZ-DR-A-10101", rev "P02" */
        public static void SplitRev(string stem, out string bas, out string rev)
        {
            bas = stem; rev = "";
            int i = Math.Max(stem.LastIndexOf('-'), stem.LastIndexOf('_'));
            if (i > 0 && stem.Count(c => c == '-' || c == '_') >= 2)
            {
                string last = stem.Substring(i + 1);
                if (RevRe.IsMatch(last)) { bas = stem.Substring(0, i); rev = last; }
            }
        }

        public static List<CFile> Scan(string folder, bool deep)
        {
            var list = new List<CFile>();
            Walk(folder, folder, deep, list);
            return list;
        }

        static void Walk(string root, string dir, bool deep, List<CFile> list)
        {
            try
            {
                foreach (var f in Directory.GetFiles(dir))
                {
                    var fi = new FileInfo(f);
                    if ((fi.Attributes & (FileAttributes.Hidden | FileAttributes.System)) != 0) continue;
                    if (fi.Name.StartsWith("~$") || fi.Name.Equals("Thumbs.db", StringComparison.OrdinalIgnoreCase) || fi.Name.Equals("desktop.ini", StringComparison.OrdinalIgnoreCase)) continue;
                    string rel = dir.Length > root.Length ? dir.Substring(root.Length).TrimStart('\\', '/') : "";
                    string ext = fi.Extension.TrimStart('.').ToLowerInvariant();
                    list.Add(new CFile { Full = f, Folder = rel, Rel = rel == "" ? fi.Name : Path.Combine(rel, fi.Name), Name = fi.Name, Stem = Path.GetFileNameWithoutExtension(fi.Name), Ext = ext, Size = fi.Length });
                }
                if (deep) foreach (var d in Directory.GetDirectories(dir))
                    {
                        if ((new DirectoryInfo(d).Attributes & (FileAttributes.Hidden | FileAttributes.System)) != 0) continue;
                        Walk(root, d, true, list);
                    }
            }
            catch (Exception) { }
        }

        /* rows: the list (already reduced to entry / title / rev / formats / folder) */
        public static CResult Run(List<CRow> rows, List<CFile> files, string defaultFormats)
        {
            var res = new CResult { Rows = rows, AllFiles = files };
            string defF = Exts(defaultFormats);
            var byStem = files.GroupBy(f => Up(f.Stem)).ToDictionary(g => g.Key, g => g.ToList());
            var byBase = new Dictionary<string, List<CFile>>();
            foreach (var f in files)
            {
                string b, r; SplitRev(Up(f.Stem), out b, out r);
                List<CFile> l; if (!byBase.TryGetValue(b, out l)) byBase[b] = l = new List<CFile>(); l.Add(f);
            }
            var seenEntries = new Dictionary<string, int>();
            foreach (var row in rows)
            {
                string entry = row.Entry.Trim();
                string entryExt = "";
                string e = Path.GetExtension(entry);
                if (e.Length > 1 && e.Length <= 5 && Regex.IsMatch(e.Substring(1), "^[A-Za-z][A-Za-z0-9]{1,3}$") && !RevRe.IsMatch(e.Substring(1))) { entryExt = e.Substring(1).ToLowerInvariant(); entry = entry.Substring(0, entry.Length - e.Length); }
                string formats = Exts(row.Formats);
                if (formats == "") formats = entryExt != "" ? entryExt : defF;
                var need = formats == "" ? new List<string>() : formats.Split(',').Distinct().ToList();

                string stemU = Up(entry), bas, revInName;
                SplitRev(stemU, out bas, out revInName);
                string wantRev = Up(row.Rev);
                string wantStem = wantRev != "" && revInName == "" ? null : stemU;   // list gives the rev separately
                string key = (wantStem ?? bas + "|" + wantRev);
                int dupNo; if (seenEntries.TryGetValue(key, out dupNo)) { row.Status = "Listed twice"; row.Note = "Same as row " + dupNo; row.Level = 1; continue; }
                seenEntries[key] = row.No;
                if (wantRev != "" && revInName != "" && wantRev != revInName) { row.Note = "List name has " + revInName + " but Rev column says " + wantRev + ". "; }

                // 1. exact matches
                var exact = new List<CFile>();
                if (wantStem != null) { List<CFile> l; if (byStem.TryGetValue(wantStem, out l)) exact.AddRange(l); }
                else
                {
                    foreach (var sep in new[] { "-", "_", "" })
                    { List<CFile> l; if (byStem.TryGetValue(bas + sep + wantRev, out l)) exact.AddRange(l); }
                    List<CFile> nb; if (byStem.TryGetValue(bas, out nb)) exact.AddRange(nb.Where(x => !exact.Contains(x)));   // file without rev in its name
                }
                // 2. same number, other revision
                List<CFile> sameBase; byBase.TryGetValue(bas, out sameBase);
                var otherRev = (sameBase ?? new List<CFile>()).Where(f => !exact.Contains(f)).ToList();
                var hits = need.Count > 0 ? exact.Where(f => need.Contains(f.Ext)).ToList() : exact;
                foreach (var f in exact) f.Used = true;
                foreach (var f in otherRev) f.Used = true;
                row.Files = exact.Concat(otherRev).ToList();

                var missingTypes = need.Where(x => !exact.Any(f => f.Ext == x)).ToList();
                foreach (var x in need) { int[] c; if (!res.ByType.TryGetValue(x, out c)) res.ByType[x] = c = new int[2]; c[0]++; if (exact.Any(f => f.Ext == x)) c[1]++; }

                if (exact.Count == 0 && otherRev.Count > 0)
                {
                    var revs = otherRev.Select(f => { string b2, r2; SplitRev(Up(f.Stem), out b2, out r2); return r2 == "" ? "(no rev)" : r2; }).Distinct();
                    row.Status = "Wrong revision"; row.Level = 2;
                    row.Note += "Expected " + (wantRev != "" ? wantRev : revInName != "" ? revInName : "(no rev)") + ", found " + string.Join(", ", revs);
                    continue;
                }
                if (exact.Count == 0) { row.Status = "Missing"; row.Level = 2; row.Note += need.Count > 0 ? "Need: " + string.Join(", ", need) : ""; continue; }
                if (missingTypes.Count > 0) { row.Status = "Missing file type"; row.Level = 2; row.Note += "Missing: " + string.Join(", ", missingTypes) + "  (have: " + string.Join(", ", exact.Select(f => f.Ext).Distinct()) + ")"; continue; }

                var notes = new List<string>();
                // exact name check (case / separator differences)
                foreach (var f in hits)
                    if (!f.Stem.StartsWith(entry, StringComparison.Ordinal)) { notes.Add("Upper/lower case differs from the list: " + f.Name); break; }
                if (row.Folder.Trim() != "")
                {
                    string wf = row.Folder.Trim().Trim('\\', '/').Replace('/', '\\');
                    var wrong = hits.Where(f => !f.Folder.Replace('/', '\\').EndsWith(wf, StringComparison.OrdinalIgnoreCase) && !f.Folder.Replace('/', '\\').StartsWith(wf, StringComparison.OrdinalIgnoreCase)).ToList();
                    if (wrong.Count > 0) { row.Status = "Wrong folder"; row.Level = 1; row.Note += "Expected in \"" + wf + "\", found in \"" + (wrong[0].Folder == "" ? "(top folder)" : wrong[0].Folder) + "\""; continue; }
                }
                var dups = hits.GroupBy(f => f.Name.ToUpperInvariant()).Where(g => g.Count() > 1).ToList();
                if (dups.Count > 0) notes.Add("Same file in " + dups[0].Count() + " folders");
                if (hits.Any(f => f.Size == 0)) notes.Add("Empty file (0 KB): " + hits.First(f => f.Size == 0).Name);
                if (otherRev.Count > 0) notes.Add("Also an old/other revision: " + otherRev[0].Name);
                row.Status = "Found"; row.Level = notes.Count > 0 ? 1 : 0;
                row.Note += string.Join(".  ", notes);
            }
            res.Extra = files.Where(f => !f.Used).ToList();
            // naming pattern from the list: number of parts between - or _
            var parts = rows.Select(r => Regex.Split(Path.GetFileNameWithoutExtension(r.Entry.Trim()), "[-_]").Length).Where(n => n > 1).GroupBy(n => n).OrderByDescending(g => g.Count()).FirstOrDefault();
            if (parts != null && parts.Count() >= Math.Max(3, rows.Count / 2))
            {
                int n = parts.Key;
                foreach (var f in res.Extra)
                    if (Math.Abs(Regex.Split(f.Stem, "[-_]").Length - n) > 1) res.Notes.Add("Name doesn't follow the list's pattern (" + n + " parts split by - or _): " + f.Rel);
            }
            foreach (var f in files.Where(f => f.Size == 0 && !rows.Any(r => r.Files.Contains(f)))) res.Notes.Add("Empty file (0 KB): " + f.Rel);
            foreach (var f in files.Where(f => f.Name.Any(c => c > 127))) res.Notes.Add("Unusual character in name: " + f.Rel);
            foreach (var f in files.Where(f => f.Full.Length >= 250)) res.Notes.Add("Path nearly too long (" + f.Full.Length + " characters): " + f.Rel);
            foreach (var f in res.Extra) { int[] c; if (!res.ByType.TryGetValue(f.Ext, out c)) res.ByType[f.Ext] = c = new int[2]; }
            foreach (var kv in res.ByType) kv.Value[1] = files.Count(f => f.Ext == kv.Key);
            return res;
        }
    }

    [Tab("check")]
    class CheckPage : UserControl, IPage, IReceiver
    {
        CheckSettings cfg;
        string CfgFile { get { return Settings.PathOf("check.json"); } }
        List<string[]> table;                      // the list as read
        int headRow;
        CResult last;

        Label folderLbl, listLbl, summary;
        CheckBox subs;
        ComboBox cName, cRev, cFormat, cFolder, cTitle, show;
        TextBox formats;
        FlowLayoutPanel mapBar, typeBar;
        DataGridView grid;
        readonly List<object> rowObjs = new List<object>();

        public CheckPage()
        {
            cfg = Json.Load<CheckSettings>(CfgFile);
            BuildUi();
            if (cfg.List != "" && File.Exists(cfg.List)) { try { ReadList(cfg.List, false); } catch (Exception) { } }
            ShowPaths();
        }

        public void OnShown() { }
        public void Reload() { cfg = Json.Load<CheckSettings>(CfgFile); ShowPaths(); }
        public void Receive(string what, string value) { if (what == "check-folder" && Directory.Exists(value)) { cfg.Folder = value; SaveCfg(); ShowPaths(); } }

        void SaveCfg() { try { Json.Save(CfgFile, cfg); } catch (Exception) { } }

        /* ---------- layout ---------- */
        void BuildUi()
        {
            var top = Ui.Bar();
            top.Controls.Add(Ui.Btn("\U0001F4C2 Submission folder…", PickFolder));
            folderLbl = Ui.Lbl("", "bold");
            top.Controls.Add(folderLbl);
            subs = new CheckBox { Text = "Include subfolders", AutoSize = true, Checked = cfg.Subfolders, Margin = new Padding(Theme.Px(10), Theme.Px(7), Theme.Px(3), 0) };
            subs.CheckedChanged += delegate { cfg.Subfolders = subs.Checked; SaveCfg(); };
            top.Controls.Add(subs);
            top.SetFlowBreak(subs, true);
            top.Controls.Add(Ui.Btn("\U0001F4C4 My list (Excel / CSV)…", PickList));
            listLbl = Ui.Lbl("", "bold");
            top.Controls.Add(listLbl);
            top.Controls.Add(Ui.Btn("▶ Check", RunCheck, "accent"));
            top.Controls.Add(Ui.MenuBtn("Report", ReportMenu));

            mapBar = Ui.Bar("bg");
            cName = Map("File name / number"); cRev = Map("Revision"); cFormat = Map("File types"); cFolder = Map("Folder"); cTitle = Map("Title");
            mapBar.Controls.Add(Ui.Lbl("All rows need:"));
            formats = new TextBox { Text = cfg.Formats, Width = Theme.Px(110), Margin = new Padding(Theme.Px(3), Theme.Px(5), Theme.Px(3), 0) };
            new ToolTip().SetToolTip(formats, "Used when the list has no File types column, e.g.  pdf  or  pdf, dwg\nEmpty = any file type is fine");
            formats.TextChanged += delegate { cfg.Formats = formats.Text; SaveCfg(); };
            mapBar.Controls.Add(formats);

            typeBar = Ui.Bar("bg");
            summary = Ui.Lbl("Pick the submission folder and your list, then ▶ Check.", "muted");

            var filterBar = Ui.Bar("bg");
            filterBar.Controls.Add(Ui.Lbl("Show:"));
            show = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = Theme.Px(200), Margin = new Padding(Theme.Px(3), Theme.Px(5), Theme.Px(3), 0) };
            show.Items.AddRange(new object[] { "Everything", "Problems only", "Missing", "Wrong revision", "Files not on the list", "OK only" });
            show.SelectedIndex = 0;
            show.SelectedIndexChanged += delegate { Fill(); };
            filterBar.Controls.Add(show);
            filterBar.Controls.Add(Ui.Btn("Fix names in Bulk Files", delegate { if (cfg.Folder != "") MainForm.Me.SendTo("files", "open-folder", cfg.Folder); }, "small"));
            filterBar.Controls.Add(Ui.Lbl("Double-click a row to open the file / folder", "muted small"));

            grid = new DataGridView
            {
                Dock = DockStyle.Fill, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AllowUserToResizeRows = false, ReadOnly = true,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect, MultiSelect = false
            };
            string[] cols = { "#", "On the list", "Title", "Rev", "Types", "Result", "Found in folder", "Note" };
            int[] w = { 45, 260, 180, 50, 80, 130, 260, 300 };
            for (int i = 0; i < cols.Length; i++) grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = cols[i], Width = Theme.Px(w[i]) });
            grid.Columns[7].AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;
            grid.CellDoubleClick += (s, e) =>
            {
                if (e.RowIndex < 0 || e.RowIndex >= rowObjs.Count) return;
                var o = rowObjs[e.RowIndex];
                try
                {
                    if (o is CFile) Shell.ShowInFolder(((CFile)o).Full);
                    else if (o is CRow && ((CRow)o).Files.Count > 0) Shell.ShowInFolder(((CRow)o).Files[0].Full);
                    else if (cfg.Folder != "") Shell.Open(cfg.Folder);
                }
                catch (Exception) { }
            };

            var sumBar = Ui.Bar("panel");
            sumBar.Controls.Add(summary);

            Controls.Add(grid);
            Controls.Add(filterBar);
            Controls.Add(typeBar);
            Controls.Add(sumBar);
            Controls.Add(mapBar);
            Controls.Add(top);
        }

        ComboBox Map(string label)
        {
            mapBar.Controls.Add(Ui.Lbl(label + ":"));
            var c = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = Theme.Px(130), Margin = new Padding(Theme.Px(3), Theme.Px(5), Theme.Px(8), 0) };
            c.SelectedIndexChanged += delegate { RememberMap(); };
            mapBar.Controls.Add(c);
            return c;
        }

        bool mapping;
        void RememberMap()
        {
            if (mapping) return;
            cfg.ColName = Sel(cName); cfg.ColRev = Sel(cRev); cfg.ColFormat = Sel(cFormat); cfg.ColFolder = Sel(cFolder); cfg.ColTitle = Sel(cTitle);
            SaveCfg();
        }
        static string Sel(ComboBox c) { return c.SelectedIndex > 0 ? (string)c.SelectedItem : ""; }

        void ShowPaths()
        {
            folderLbl.Text = cfg.Folder == "" ? "not picked" : cfg.Folder;
            listLbl.Text = cfg.List == "" ? "not picked" : Path.GetFileName(cfg.List) + (table != null ? "   (" + Math.Max(0, table.Count - headRow - 1) + " rows)" : "");
            subs.Checked = cfg.Subfolders;
            formats.Text = cfg.Formats;
        }

        void PickFolder()
        {
            var f = Ui.PickFolder(this, "Pick the submission folder", cfg.Folder);
            if (f == null) return;
            cfg.Folder = f; SaveCfg(); ShowPaths();
        }

        void PickList()
        {
            var f = Ui.PickFile(this, "Excel or CSV|*.xlsx;*.xlsm;*.csv|All files|*.*", "Pick your list (drawing register / transmittal / checklist)");
            if (f == null) return;
            try { ReadList(f, true); cfg.List = f; SaveCfg(); ShowPaths(); }
            catch (IOException) { Ui.Info(this, "The list is open and locked. Close it in Excel and try again."); }
            catch (Exception e) { Ui.Error(this, "Couldn't read that list.", e); }
        }

        static readonly string[] NameWords = { "file name", "filename", "drawing number", "drawing no", "drawing no.", "dwg no", "dwg number", "document number", "document no", "doc no", "doc number", "number", "name", "file", "deliverable" };

        /* reads the list and guesses which columns are which (the person can change them) */
        void ReadList(string path, bool guess)
        {
            table = Table.Read(path);
            // header = the first row (in the top 30) that has a name-like heading, else the first row with 2+ cells
            headRow = -1;
            for (int r = 0; r < Math.Min(30, table.Count) && headRow < 0; r++)
                if (table[r].Any(c => NameWords.Contains((c ?? "").Trim().ToLowerInvariant()))) headRow = r;
            if (headRow < 0) headRow = Math.Max(0, table.FindIndex(r => r.Count(c => (c ?? "").Trim() != "") >= 2));
            var head = table.Count > 0 ? table[headRow].Select((h, i) => (h ?? "").Trim() == "" ? "Column " + XSheet.ColName(i + 1) : h.Trim()).ToList() : new List<string>();
            mapping = true;
            foreach (var c in new[] { cName, cRev, cFormat, cFolder, cTitle }) { c.Items.Clear(); c.Items.Add("(none)"); foreach (var h in head) c.Items.Add(h); c.SelectedIndex = 0; }
            Func<string[], string, string> find = (words, saved) =>
            {
                if (!guess && saved != "" && head.Contains(saved)) return saved;
                foreach (var w in words) { var h = head.FirstOrDefault(x => x.ToLowerInvariant() == w); if (h != null) return h; }
                foreach (var w in words) { var h = head.FirstOrDefault(x => x.ToLowerInvariant().Contains(w)); if (h != null) return h; }
                return "";
            };
            Action<ComboBox, string> set = (c, v) => { if (v != "") c.SelectedItem = v; };
            set(cName, find(NameWords, cfg.ColName));
            set(cRev, find(new[] { "revision", "rev", "rev.", "current revision", "issue rev" }, cfg.ColRev));
            set(cFormat, find(new[] { "file types", "file type", "format", "formats", "type", "file format" }, cfg.ColFormat));
            set(cFolder, find(new[] { "folder", "subfolder", "location", "path" }, cfg.ColFolder));
            set(cTitle, find(new[] { "title", "description", "drawing title", "document title" }, cfg.ColTitle));
            if (cName.SelectedIndex == 0 && head.Count > 0) cName.SelectedIndex = 1;
            mapping = false;
            RememberMap();
        }

        /* ---------- run ---------- */
        public void RunCheck()
        {
            if (cfg.Folder == "" || !Directory.Exists(cfg.Folder)) { Ui.Info(this, "Pick the submission folder first."); return; }
            if (cfg.List == "" || !File.Exists(cfg.List)) { Ui.Info(this, "Pick your list first (Excel or CSV)."); return; }
            try { ReadList(cfg.List, false); }
            catch (IOException) { Ui.Info(this, "The list is open and locked. Close it in Excel and try again."); return; }
            catch (Exception e) { Ui.Error(this, "Couldn't read the list.", e); return; }
            if (cName.SelectedIndex <= 0) { Ui.Info(this, "Choose which column has the file name / number."); return; }
            int iName = cName.SelectedIndex - 1, iRev = cRev.SelectedIndex - 1, iFmt = cFormat.SelectedIndex - 1, iFold = cFolder.SelectedIndex - 1, iTitle = cTitle.SelectedIndex - 1;
            var rows = new List<CRow>();
            for (int r = headRow + 1; r < table.Count; r++)
            {
                string entry = Table.Get(table[r], iName);
                if (entry == "") continue;
                rows.Add(new CRow { No = r + 1, Entry = entry, Rev = Table.Get(table[r], iRev), Formats = Table.Get(table[r], iFmt), Folder = Table.Get(table[r], iFold), Title = Table.Get(table[r], iTitle) });
            }
            if (rows.Count == 0) { Ui.Info(this, "No rows found under the heading \"" + cName.SelectedItem + "\"."); return; }
            Cursor = Cursors.WaitCursor;
            try { last = SubmissionCheck.Run(rows, SubmissionCheck.Scan(cfg.Folder, cfg.Subfolders), cfg.Formats); }
            finally { Cursor = Cursors.Default; }
            ShowSummary();
            show.SelectedIndex = last.Rows.Any(x => x.Level > 0) || last.Extra.Count > 0 ? 1 : 0;
            Fill();
        }

        void ShowSummary()
        {
            var r = last;
            int found = r.Rows.Count(x => x.Status == "Found"), miss = r.Rows.Count(x => x.Status == "Missing"), rev = r.Rows.Count(x => x.Status == "Wrong revision"),
                type = r.Rows.Count(x => x.Status == "Missing file type"), fold = r.Rows.Count(x => x.Status == "Wrong folder"), warn = r.Rows.Count(x => x.Status == "Found" && x.Level == 1);
            bool allOk = miss + rev + type + fold == 0 && r.Extra.Count == 0;
            summary.Text = (allOk ? "✅ All good – " : "⚠ ") + r.Rows.Count + " on the list  ·  " + found + " found" + (warn > 0 ? " (" + warn + " with a note)" : "") +
                (miss > 0 ? "  ·  " + miss + " MISSING" : "") + (rev > 0 ? "  ·  " + rev + " wrong revision" : "") + (type > 0 ? "  ·  " + type + " missing a file type" : "") +
                (fold > 0 ? "  ·  " + fold + " in the wrong folder" : "") + "  ·  " + r.Extra.Count + " file(s) not on the list  ·  " + r.AllFiles.Count + " files in the folder";
            summary.Tag = allOk ? "bold" : "bold"; Theme.Apply(summary);
            summary.ForeColor = allOk ? Theme.Cur.Ok : Theme.Cur.Bad;
            typeBar.SuspendLayout(); typeBar.Controls.Clear();
            typeBar.Controls.Add(Ui.Lbl("Count by file type:", "bold"));
            foreach (var kv in r.ByType.OrderBy(k => k.Key))
            {
                string ext = kv.Key == "" ? "(none)" : "." + kv.Key;
                var l = Ui.Lbl(kv.Value[0] > 0 ? ext + "  " + kv.Value[1] + " / " + kv.Value[0] + " needed" : ext + "  " + kv.Value[1]);
                typeBar.Controls.Add(l);
                Theme.Apply(l);
                if (kv.Value[0] > 0) l.ForeColor = r.Rows.Any(x => x.Status == "Missing file type" || x.Status == "Missing") && kv.Value[1] < kv.Value[0] ? Theme.Cur.Bad : Theme.Cur.Ok;
            }
            typeBar.ResumeLayout();
        }

        void Fill()
        {
            grid.Rows.Clear(); rowObjs.Clear();
            if (last == null) return;
            var th = Theme.Cur;
            int mode = show.SelectedIndex;
            if (mode != 4)
                foreach (var r in last.Rows)
                {
                    if (mode == 1 && r.Level == 0) continue;
                    if (mode == 2 && r.Status != "Missing" && r.Status != "Missing file type") continue;
                    if (mode == 3 && r.Status != "Wrong revision") continue;
                    if (mode == 5 && r.Level != 0) continue;
                    string files = string.Join(", ", r.Files.Select(f => f.Rel).Take(3)) + (r.Files.Count > 3 ? " …" : "");
                    int i = grid.Rows.Add(r.No, r.Entry, r.Title, r.Rev, r.Formats == "" ? cfg.Formats : r.Formats, (r.Level == 0 ? "✔ " : r.Level == 1 ? "⚠ " : "✖ ") + r.Status, files, r.Note);
                    rowObjs.Add(r);
                    grid.Rows[i].Cells[5].Style.ForeColor = r.Level == 0 ? th.Ok : r.Level == 1 ? th.Warn : th.Bad;
                }
            if (mode == 0 || mode == 1 || mode == 4)
                foreach (var f in last.Extra)
                {
                    int i = grid.Rows.Add("", "", "", "", f.Ext, "➕ Not on the list", f.Rel, f.Size == 0 ? "Empty file (0 KB)" : "");
                    rowObjs.Add(f);
                    grid.Rows[i].Cells[5].Style.ForeColor = th.Warn;
                }
        }

        /* ---------- report ---------- */
        ContextMenuStrip ReportMenu()
        {
            var m = Theme.Menu();
            Theme.Item(m, "Excel report (.xlsx)", () => ExcelReport());
            Theme.Item(m, "\U0001F4CB Copy summary (for email / Teams)", () => { if (last == null) { Ui.Info(this, "Run a check first."); return; } try { Clipboard.SetText(SummaryText()); Ui.Info(this, "Summary copied."); } catch (Exception e) { Ui.Error(this, "Couldn't copy.", e); } });
            Theme.Item(m, "Other notes (empty files, long paths…)", () => Ui.Info(this, last == null ? "Run a check first." : last.Notes.Count == 0 ? "Nothing else to report." : string.Join("\n", last.Notes.Take(40))));
            return m;
        }

        public string SummaryText()
        {
            var r = last; var sb = new StringBuilder();
            sb.AppendLine("Submission check – " + DateTime.Now.ToString("dd MMM yyyy HH:mm"));
            sb.AppendLine("Folder: " + cfg.Folder);
            sb.AppendLine("List: " + Path.GetFileName(cfg.List));
            sb.AppendLine();
            sb.AppendLine("On the list: " + r.Rows.Count + "   Found: " + r.Rows.Count(x => x.Status == "Found") + "   Files in folder: " + r.AllFiles.Count);
            foreach (var st in new[] { "Missing", "Missing file type", "Wrong revision", "Wrong folder", "Listed twice" })
            {
                var l = r.Rows.Where(x => x.Status == st).ToList();
                if (l.Count == 0) continue;
                sb.AppendLine(); sb.AppendLine(st.ToUpperInvariant() + " (" + l.Count + ")");
                foreach (var x in l) sb.AppendLine("  • " + x.Entry + (x.Note != "" ? " – " + x.Note : ""));
            }
            if (r.Extra.Count > 0) { sb.AppendLine(); sb.AppendLine("NOT ON THE LIST (" + r.Extra.Count + ")"); foreach (var f in r.Extra) sb.AppendLine("  • " + f.Rel); }
            return sb.ToString();
        }

        public string ExcelReport()
        {
            if (last == null) { Ui.Info(this, "Run a check first."); return null; }
            try
            {
                var wb = new XBook();
                var head = new XStyle { Bold = true, Color = "FFFFFFFF", Fill = "FF5B3E7E", Border = true };
                var cell = new XStyle { Border = true, Wrap = true };
                Func<string, XStyle> res = st => { var s = cell.Copy(); s.Bold = true; s.Color = st.StartsWith("Found") ? "FF2E8B57" : st == "Wrong folder" || st == "Listed twice" || st.StartsWith("Not on") ? "FFA86500" : "FFC0392B"; return s; };

                var s1 = wb.Add("Summary"); s1.ShowGrid = false; s1.Widths[1] = 30; s1.Widths[2] = 70;
                s1.Set(1, 1, "SUBMISSION CHECK", new XStyle { Bold = true, Size = 14, Color = "FFFFFFFF", Fill = "FF3D2B56" }); s1.Style(1, 2, new XStyle { Fill = "FF3D2B56" });
                int r = 3;
                Action<string, object> kv = (k, v) => { s1.Set(r, 1, k, new XStyle { Bold = true }); s1.Set(r, 2, v); r++; };
                kv("Checked", DateTime.Now); s1.Style(3, 2, new XStyle { NumFmt = "dd mmm yyyy hh:mm", HAlign = "left" });
                kv("By", Settings.D.UserName); kv("Folder", cfg.Folder); kv("List", cfg.List); r++;
                kv("On the list", last.Rows.Count);
                foreach (var st in new[] { "Found", "Missing", "Missing file type", "Wrong revision", "Wrong folder", "Listed twice" }) kv(st, last.Rows.Count(x => x.Status == st));
                kv("Not on the list (extra files)", last.Extra.Count);
                kv("Files in the folder", last.AllFiles.Count); r++;
                s1.Set(r++, 1, "Count by file type", new XStyle { Bold = true });
                foreach (var t in last.ByType.OrderBy(k => k.Key)) kv(t.Key == "" ? "(none)" : "." + t.Key, t.Value[0] > 0 ? t.Value[1] + " found / " + t.Value[0] + " needed" : t.Value[1] + " found");

                var s2 = wb.Add("Checklist"); s2.FreezeRows = 1;
                string[] h = { "Row", "On the list", "Title", "Rev", "Types", "Result", "Found in folder", "Note" };
                double[] w = { 7, 40, 34, 7, 10, 18, 50, 50 };
                for (int i = 0; i < h.Length; i++) { s2.Widths[i + 1] = w[i]; s2.Set(1, i + 1, h[i], head); }
                r = 2;
                foreach (var x in last.Rows)
                {
                    object[] v = { x.No, x.Entry, x.Title, x.Rev, x.Formats == "" ? cfg.Formats : x.Formats, x.Status, string.Join("\n", x.Files.Select(f => f.Rel)), x.Note };
                    for (int i = 0; i < v.Length; i++) s2.Set(r, i + 1, v[i], i == 5 ? res(x.Status) : cell);
                    r++;
                }
                s2.AutoFilter = "A1:H" + Math.Max(2, r - 1);

                var s3 = wb.Add("Not on the list"); s3.FreezeRows = 1;
                string[] h3 = { "File", "Folder", "Type", "Size (KB)" }; double[] w3 = { 60, 40, 8, 10 };
                for (int i = 0; i < h3.Length; i++) { s3.Widths[i + 1] = w3[i]; s3.Set(1, i + 1, h3[i], head); }
                r = 2;
                foreach (var f in last.Extra) { s3.Set(r, 1, f.Name, cell); s3.Set(r, 2, f.Folder == "" ? "(top folder)" : f.Folder, cell); s3.Set(r, 3, f.Ext, cell); s3.Set(r, 4, Math.Round(f.Size / 1024.0, 1), cell); r++; }

                string path = Path.Combine(Settings.ExportsDir, "SubmissionCheck_" + Names.Safe(Path.GetFileName(cfg.Folder)).Replace(' ', '_') + "_" + Names.Stamp() + ".xlsx");
                wb.Save(path);
                if (!Ui.TestMode) Shell.Open(path);
                return path;
            }
            catch (Exception e) { Ui.Error(this, "Couldn't make the report.", e); return null; }
        }
    }
}
