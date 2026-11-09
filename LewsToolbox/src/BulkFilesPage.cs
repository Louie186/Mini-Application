// Lew's Toolbox - Bulk Files tab: rename / copy / move many files with a preview, Excel round trip, safety lock and Undo.
// Safety rules: Copy is the default. Nothing is ever overwritten or deleted. Rename / Move need the lock opened first.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace LewsToolbox
{
    class BRow
    {
        public int Id;
        public string Full = "", Rel = "", Name = "", NewName = "";
        public bool Tick = true;
        public long Size;
        public string Note = "";
        public int Level;            // 0 ok, 1 warning, 2 problem (skipped), -1 no change (skipped)
        public string Target = "";
    }

    class BOp { public string From = "", To = ""; public long Size; }
    class BBatch { public string When = "", Kind = "", Source = "", Dest = ""; public bool Undone; public List<BOp> Ops = new List<BOp>(); }
    class BHistory { public List<BBatch> Batches = new List<BBatch>(); }

    [Tab("files")]
    class BulkFilesPage : UserControl, IPage, IReceiver
    {
        List<BRow> rows = new List<BRow>();
        string folder = "", dest = "";
        TextBox filter, findBox, replBox, prefixBox, suffixBox;
        NumericUpDown numStart, numDigits;
        CheckBox subfolders, keepTree, unlock, matchCase;
        RadioButton modeCopy, modeMove, modeRename;
        ComboBox show;
        Label folderLbl, destLbl, count, summary;
        DataGridView grid;
        Button runBtn, undoBtn;
        ProgressBar progress;
        bool busy;
        string HistFile { get { return Settings.PathOf("bulk-files-history.json"); } }

        const int CTick = 0, CFolder = 1, CName = 2, CNew = 3, CCheck = 4;

        public BulkFilesPage() { BuildUi(); Validate_(); }
        public void OnShown() { }
        public void Reload() { UpdateUndo(); }

        /* ---------- layout ---------- */
        void BuildUi()
        {
            // 1. source
            var src = Ui.Bar();
            src.Controls.Add(Ui.Btn("\U0001F4C2 Pick folder...", PickSource, "accent"));
            folderLbl = Ui.Lbl("No folder picked", "bold");
            src.Controls.Add(folderLbl);
            subfolders = new CheckBox { Text = "Include subfolders", AutoSize = true, Checked = true, Margin = new Padding(Theme.Px(10), Theme.Px(7), Theme.Px(3), 0) };
            src.Controls.Add(subfolders);
            src.Controls.Add(Ui.Lbl("Only:"));
            filter = new TextBox { Width = Theme.Px(130), Margin = new Padding(Theme.Px(3), Theme.Px(5), Theme.Px(3), Theme.Px(3)) };
            new ToolTip().SetToolTip(filter, "Optional, e.g.  *.pdf   or   *.pdf; *.dwg   or   *A-1*");
            src.Controls.Add(filter);
            src.Controls.Add(Ui.Btn("↻ Load files", LoadFiles));
            count = Ui.Lbl("", "muted");
            src.Controls.Add(count);

            // 2. rename tools
            var tools = Ui.Bar("bg");
            tools.Controls.Add(Ui.Lbl("New names:", "bold"));
            findBox = Box(110, "Find"); replBox = Box(110, "Replace with");
            tools.Controls.Add(findBox); tools.Controls.Add(replBox);
            matchCase = new CheckBox { Text = "Aa", AutoSize = true, Margin = new Padding(Theme.Px(2), Theme.Px(7), Theme.Px(2), 0) };
            new ToolTip().SetToolTip(matchCase, "Match upper / lower case");
            tools.Controls.Add(matchCase);
            tools.Controls.Add(Ui.Btn("Replace", Replace, "small"));
            tools.Controls.Add(Sep());
            prefixBox = Box(90, "Prefix"); tools.Controls.Add(prefixBox);
            tools.Controls.Add(Ui.Btn("Add at start", delegate { Apply(n => prefixBox.Text + n); }, "small"));
            suffixBox = Box(90, "Suffix"); tools.Controls.Add(suffixBox);
            tools.Controls.Add(Ui.Btn("Add at end", delegate { Apply(n => n + suffixBox.Text); }, "small"));
            tools.Controls.Add(Sep());
            tools.Controls.Add(Ui.Lbl("No. from"));
            numStart = new NumericUpDown { Minimum = 0, Maximum = 999999, Value = 1, Width = Theme.Px(64), Margin = new Padding(Theme.Px(3), Theme.Px(5), 0, 0) };
            numDigits = new NumericUpDown { Minimum = 1, Maximum = 8, Value = 3, Width = Theme.Px(44), Margin = new Padding(Theme.Px(3), Theme.Px(5), 0, 0) };
            new ToolTip().SetToolTip(numDigits, "Digits (3 = 001)");
            tools.Controls.Add(numStart); tools.Controls.Add(numDigits);
            tools.Controls.Add(Ui.Btn("Number", Number, "small"));
            tools.Controls.Add(Sep());
            tools.Controls.Add(Ui.MenuBtn("More", MoreMenu, "small"));

            // 3. list tools
            var listBar = Ui.Bar("bg");
            listBar.Controls.Add(Ui.Btn("Tick all", delegate { foreach (var r in rows) r.Tick = true; Validate_(); }, "small"));
            listBar.Controls.Add(Ui.Btn("Untick all", delegate { foreach (var r in rows) r.Tick = false; Validate_(); }, "small"));
            listBar.Controls.Add(Ui.Btn("Invert", delegate { foreach (var r in rows) r.Tick = !r.Tick; Validate_(); }, "small"));
            listBar.Controls.Add(Sep());
            listBar.Controls.Add(Ui.Btn("✎ Edit new names in Excel", ExcelOut, "small"));
            listBar.Controls.Add(Ui.Btn("⬆ Load names from Excel", ExcelIn, "small"));
            listBar.Controls.Add(Ui.Btn("↺ Reset new names", delegate { if (rows.Any(r => r.NewName != r.Name) && !Ui.Confirm(this, "Put every new name back to the current name?")) return; foreach (var r in rows) r.NewName = r.Name; Validate_(); }, "small"));
            listBar.Controls.Add(Sep());
            listBar.Controls.Add(Ui.Lbl("Show:"));
            show = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = Theme.Px(150), Margin = new Padding(Theme.Px(3), Theme.Px(5), 0, 0) };
            show.Items.AddRange(new object[] { "All files", "Ticked only", "Changed names", "Problems only" });
            show.SelectedIndex = 0;
            show.SelectedIndexChanged += delegate { Fill(); };
            listBar.Controls.Add(show);

            // grid
            grid = new DataGridView
            {
                Dock = DockStyle.Fill, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AllowUserToResizeRows = false,
                SelectionMode = DataGridViewSelectionMode.CellSelect, AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.None,
                EditMode = DataGridViewEditMode.EditOnKeystrokeOrF2
            };
            grid.Columns.Add(new DataGridViewCheckBoxColumn { HeaderText = "✓", Width = Theme.Px(34) });
            grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Folder", Width = Theme.Px(160), ReadOnly = true });
            grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Current name", Width = Theme.Px(300), ReadOnly = true });
            grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "New name  (click to edit)", Width = Theme.Px(300) });
            grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Check", AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill, ReadOnly = true, MinimumWidth = Theme.Px(160) });
            grid.CellValueChanged += GridEdited;
            grid.CurrentCellDirtyStateChanged += delegate { if (grid.CurrentCell is DataGridViewCheckBoxCell) grid.CommitEdit(DataGridViewDataErrorContexts.Commit); };
            grid.CellDoubleClick += (s, e) => { if (e.RowIndex >= 0 && e.ColumnIndex == CName) { var r = RowAt(e.RowIndex); if (r != null) try { Shell.ShowInFolder(r.Full); } catch (Exception) { } } };

            // bottom: what to do
            var bottom = new FlowLayoutPanel { Dock = DockStyle.Bottom, AutoSize = true, Tag = "panel", Padding = new Padding(Theme.Px(6), Theme.Px(6), Theme.Px(6), Theme.Px(6)) };
            bottom.Controls.Add(Ui.Lbl("What to do:", "bold"));
            modeCopy = Radio("Copy to another folder (safe)", true);
            modeMove = Radio("Move to another folder", false);
            modeRename = Radio("Rename in place", false);
            bottom.Controls.Add(modeCopy); bottom.Controls.Add(modeMove); bottom.Controls.Add(modeRename);
            bottom.SetFlowBreak(modeRename, true);
            bottom.Controls.Add(Ui.Btn("\U0001F4C2 Pick target folder...", PickDest));
            destLbl = Ui.Lbl("No target folder", "muted");
            bottom.Controls.Add(destLbl);
            keepTree = new CheckBox { Text = "Keep subfolders", AutoSize = true, Checked = true, Margin = new Padding(Theme.Px(10), Theme.Px(7), Theme.Px(3), 0) };
            keepTree.CheckedChanged += delegate { Validate_(); };
            bottom.Controls.Add(keepTree);
            bottom.SetFlowBreak(keepTree, true);
            unlock = new CheckBox { Text = "\U0001F512 Allow changes to the original folder", AutoSize = true, Margin = new Padding(Theme.Px(3), Theme.Px(7), Theme.Px(10), 0) };
            unlock.CheckedChanged += delegate { unlock.Text = (unlock.Checked ? "\U0001F513" : "\U0001F512") + " Allow changes to the original folder"; Validate_(); };
            new ToolTip().SetToolTip(unlock, "Rename and Move change your original folder, so they stay locked until you tick this.\nIt locks again after each run.");
            bottom.Controls.Add(unlock);
            runBtn = Ui.Btn("▶ Preview and run...", Run, "accent");
            bottom.Controls.Add(runBtn);
            undoBtn = Ui.Btn("↶ Undo last run...", Undo);
            bottom.Controls.Add(undoBtn);
            bottom.Controls.Add(Ui.Btn("History", ShowHistory, "small"));
            progress = new ProgressBar { Width = Theme.Px(160), Height = Theme.Px(18), Visible = false, Margin = new Padding(Theme.Px(6), Theme.Px(9), 0, 0) };
            bottom.Controls.Add(progress);
            summary = Ui.Lbl("", "muted");
            bottom.Controls.Add(summary);

            Controls.Add(grid);
            Controls.Add(bottom);
            Controls.Add(listBar);
            Controls.Add(tools);
            Controls.Add(src);
            UpdateUndo();
        }

        TextBox Box(int w, string cue)
        {
            var t = new TextBox { Width = Theme.Px(w), Margin = new Padding(Theme.Px(3), Theme.Px(5), Theme.Px(3), Theme.Px(3)) };
            t.HandleCreated += delegate { try { SendMessage(t.Handle, 0x1501, (IntPtr)1, cue); } catch (Exception) { } };
            return t;
        }
        static Label Sep() { return new Label { Text = "|", AutoSize = true, Tag = "muted", Margin = new Padding(Theme.Px(4), Theme.Px(7), Theme.Px(4), 0) }; }
        RadioButton Radio(string text, bool on)
        {
            var r = new RadioButton { Text = text, AutoSize = true, Checked = on, Margin = new Padding(Theme.Px(8), Theme.Px(7), Theme.Px(3), 0) };
            r.CheckedChanged += delegate { if (r.Checked) { unlock.Checked = false; Validate_(); } };
            return r;
        }
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, string l);

        string Mode { get { return modeRename.Checked ? "rename" : modeMove.Checked ? "move" : "copy"; } }

        /* ---------- load ---------- */
        void PickSource()
        {
            var f = Ui.PickFolder(this, "Pick the folder with the files", folder);
            if (f == null) return;
            folder = f;
            LoadFiles();
        }

        public void LoadFolder(string f) { folder = f; LoadFiles(); }
        public void Receive(string what, string value) { if (what == "open-folder" && Directory.Exists(value)) LoadFolder(value); }

        void LoadFiles()
        {
            if (folder == "" || !Directory.Exists(folder)) { Ui.Info(this, "Pick a folder first."); return; }
            if (rows.Any(r => r.NewName != r.Name) && !Ui.Confirm(this, "Reload the files? New names you typed will be lost.")) return;
            folderLbl.Text = folder;
            var pats = filter.Text.Split(new[] { ';', ',' }, StringSplitOptions.RemoveEmptyEntries).Select(p => p.Trim()).Where(p => p != "").ToList();
            var regs = pats.Select(p => new Regex("^" + Regex.Escape(p.Contains("*") || p.Contains("?") ? p : "*" + p + "*").Replace("\\*", ".*").Replace("\\?", ".") + "$", RegexOptions.IgnoreCase)).ToList();
            var list = new List<BRow>();
            var skipped = new List<string>();
            Cursor = Cursors.WaitCursor;
            try
            {
                Walk(folder, subfolders.Checked, list, regs, skipped);
            }
            finally { Cursor = Cursors.Default; }
            int id = 1;
            rows = list.OrderBy(r => r.Rel, StringComparer.OrdinalIgnoreCase).ThenBy(r => r.Name, StringComparer.OrdinalIgnoreCase).ToList();
            foreach (var r in rows) r.Id = id++;
            Validate_();
            if (skipped.Count > 0) Ui.Info(this, "Some folders couldn't be opened (no permission?) and were skipped:\n" + string.Join("\n", skipped.Take(10)));
        }

        void Walk(string dir, bool deep, List<BRow> list, List<Regex> regs, List<string> skipped)
        {
            try
            {
                foreach (var f in Directory.GetFiles(dir))
                {
                    var fi = new FileInfo(f);
                    if ((fi.Attributes & (FileAttributes.Hidden | FileAttributes.System)) != 0) continue;
                    if (fi.Name.StartsWith("~$")) continue;     // Office lock files
                    if (regs.Count > 0 && !regs.Any(r => r.IsMatch(fi.Name))) continue;
                    string rel = dir.Length > folder.Length ? dir.Substring(folder.Length).TrimStart('\\', '/') : "";
                    list.Add(new BRow { Full = f, Rel = rel, Name = fi.Name, NewName = fi.Name, Size = fi.Length });
                }
                if (deep)
                    foreach (var d in Directory.GetDirectories(dir))
                    {
                        var di = new DirectoryInfo(d);
                        if ((di.Attributes & (FileAttributes.Hidden | FileAttributes.System)) != 0) continue;
                        Walk(d, true, list, regs, skipped);
                    }
            }
            catch (Exception) { skipped.Add(dir); }
        }

        void PickDest()
        {
            var f = Ui.PickFolder(this, "Pick the folder to copy / move the files into", dest == "" ? folder : dest);
            if (f == null) return;
            dest = f;
            destLbl.Text = dest;
            destLbl.Tag = "bold"; Theme.Apply(destLbl);
            Validate_();
        }

        /* ---------- new names ---------- */
        IEnumerable<BRow> Ticked { get { return rows.Where(r => r.Tick); } }

        static string Stem(string n) { int i = n.LastIndexOf('.'); return i > 0 ? n.Substring(0, i) : n; }
        static string Ext(string n) { int i = n.LastIndexOf('.'); return i > 0 ? n.Substring(i) : ""; }

        /* changes the name part (not the .pdf ending) of every ticked file */
        void Apply(Func<string, string> f)
        {
            if (!Ticked.Any()) { Ui.Info(this, "Tick the files to change first."); return; }
            foreach (var r in Ticked) r.NewName = f(Stem(r.NewName)) + Ext(r.NewName);
            Validate_();
        }

        void Replace()
        {
            if (findBox.Text == "") { Ui.Info(this, "Type the text to find."); return; }
            string find = findBox.Text, repl = replBox.Text;
            var re = new Regex(Regex.Escape(find), matchCase.Checked ? RegexOptions.None : RegexOptions.IgnoreCase);
            int hits = Ticked.Count(r => re.IsMatch(Stem(r.NewName)));
            Apply(n => re.Replace(n, repl.Replace("$", "$$")));
            summary.Text = "Replaced in " + hits + " name" + (hits == 1 ? "" : "s") + ".";
        }

        void Number()
        {
            int n = (int)numStart.Value, digits = (int)numDigits.Value;
            var m = Theme.Menu();
            Theme.Item(m, "Put the number at the start (001_name)", () => { int k = n; Apply(s => (k++).ToString(new string('0', digits)) + "_" + s); });
            Theme.Item(m, "Put the number at the end (name_001)", () => { int k = n; Apply(s => s + "_" + (k++).ToString(new string('0', digits))); });
            Theme.Item(m, "Replace the whole name with the number", () => { int k = n; Apply(s => (k++).ToString(new string('0', digits))); });
            m.Show(Cursor.Position);
        }

        ContextMenuStrip MoreMenu()
        {
            var m = Theme.Menu();
            Theme.Item(m, "UPPER CASE", () => Apply(s => s.ToUpperInvariant()));
            Theme.Item(m, "lower case", () => Apply(s => s.ToLowerInvariant()));
            Theme.Item(m, "Spaces → _", () => Apply(s => s.Replace(' ', '_')));
            Theme.Item(m, "Spaces → -", () => Apply(s => s.Replace(' ', '-')));
            Theme.Item(m, "Remove double spaces / trim", () => Apply(s => Regex.Replace(s, " {2,}", " ").Trim()));
            m.Items.Add(new ToolStripSeparator());
            Theme.Item(m, "Remove first N characters...", () => { int k; var a = Ui.Ask(this, "Remove characters", "How many from the START?", "1"); if (a != null && int.TryParse(a, out k) && k > 0) Apply(s => s.Length > k ? s.Substring(k) : s); });
            Theme.Item(m, "Remove last N characters...", () => { int k; var a = Ui.Ask(this, "Remove characters", "How many from the END (before .pdf etc.)?", "1"); if (a != null && int.TryParse(a, out k) && k > 0) Apply(s => s.Length > k ? s.Substring(0, s.Length - k) : s); });
            Theme.Item(m, "Add today's date at the end (_YYYY-MM-DD)", () => { string d = DateTime.Now.ToString("yyyy-MM-dd"); Apply(s => s + "_" + d); });
            Theme.Item(m, "Change the file ending (e.g. .PDF → .pdf)...", () =>
            {
                var a = Ui.Ask(this, "File ending", "New ending for the ticked files (e.g. .pdf):", ".pdf");
                if (string.IsNullOrEmpty(a)) return;
                if (!a.StartsWith(".")) a = "." + a;
                foreach (var r in Ticked) r.NewName = Stem(r.NewName) + a;
                Validate_();
            });
            return m;
        }

        /* ---------- checks ---------- */
        static readonly char[] BadChars = "\\/:*?\"<>|".ToCharArray().Concat(Enumerable.Range(0, 32).Select(i => (char)i)).ToArray();   // Windows rules, on any PC
        static readonly string[] Reserved = { "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9" };

        string TargetOf(BRow r)
        {
            string name = r.NewName;
            if (Mode == "rename") return Path.Combine(Path.GetDirectoryName(r.Full), name);
            if (dest == "") return "";
            return keepTree.Checked && r.Rel != "" ? Path.Combine(dest, r.Rel, name) : Path.Combine(dest, name);
        }

        void Validate_()
        {
            string mode = Mode;
            var targets = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var r in rows)
            {
                r.Level = 0; r.Note = ""; r.Target = "";
                if (!r.Tick) continue;
                string n = r.NewName ?? "";
                if (n.Trim() == "") { r.Level = 2; r.Note = "New name is empty"; continue; }
                if (n.IndexOfAny(BadChars) >= 0) { r.Level = 2; r.Note = "Has a character Windows doesn't allow:  \\ / : * ? \" < > |"; continue; }
                if (n.EndsWith(" ") || n.EndsWith(".") || n.StartsWith(" ")) { r.Level = 2; r.Note = "Starts / ends with a space or dot"; continue; }
                if (Reserved.Contains(Stem(n).ToUpperInvariant())) { r.Level = 2; r.Note = "\"" + Stem(n) + "\" is a name Windows reserves"; continue; }
                if (mode == "rename" && n == r.Name) { r.Level = -1; r.Note = "No change"; continue; }
                r.Target = TargetOf(r);
                if (r.Target == "") { r.Level = 1; r.Note = "Pick a target folder"; continue; }
                if (r.Target.Length >= 260) { r.Level = 2; r.Note = "Path too long (" + r.Target.Length + " characters, max 259)"; continue; }
                bool caseOnly = mode == "rename" && string.Equals(n, r.Name, StringComparison.OrdinalIgnoreCase);
                if (!caseOnly && File.Exists(r.Target)) { r.Level = 2; r.Note = "A file with this name is already there - won't overwrite"; continue; }
                if (mode != "rename" && string.Equals(Path.GetFullPath(r.Target), Path.GetFullPath(r.Full), StringComparison.OrdinalIgnoreCase)) { r.Level = 2; r.Note = "Target is the file itself"; continue; }
                int c; targets.TryGetValue(r.Target, out c); targets[r.Target] = c + 1;
                if (!string.Equals(Ext(n), Ext(r.Name), StringComparison.OrdinalIgnoreCase)) { r.Level = 1; r.Note = "File ending changed (" + Ext(r.Name) + " → " + (Ext(n) == "" ? "none" : Ext(n)) + ")"; }
                else r.Note = n != r.Name ? "OK – new name" : "OK";
            }
            foreach (var r in rows)
                if (r.Tick && r.Level >= 0 && r.Level < 2 && r.Target != "" && targets.ContainsKey(r.Target) && targets[r.Target] > 1)
                { r.Level = 2; r.Note = "Same new name as another file (" + targets[r.Target] + " files)"; }
            Fill();
            UpdateButtons();
        }

        void UpdateButtons()
        {
            string mode = Mode;
            bool needsLock = mode != "copy";
            unlock.Enabled = needsLock;
            if (!needsLock) unlock.Checked = false;
            int ready = rows.Count(r => r.Tick && (r.Level == 0 || r.Level == 1) && r.Target != "");
            int bad = rows.Count(r => r.Tick && r.Level == 2);
            int changed = rows.Count(r => r.NewName != r.Name);
            runBtn.Enabled = !busy && ready > 0 && (!needsLock || unlock.Checked) && (mode == "rename" || dest != "");
            count.Text = rows.Count == 0 ? "" : rows.Count + " files  ·  " + rows.Count(r => r.Tick) + " ticked  ·  " + changed + " new names" + (bad > 0 ? "  ·  " + bad + " problems" : "");
            if (rows.Count == 0) summary.Text = "Pick a folder to start.";
            else if (mode != "rename" && dest == "") summary.Text = "Pick a target folder.";
            else if (needsLock && !unlock.Checked) summary.Text = "Locked: tick “Allow changes to the original folder” to " + mode + ".";
            else summary.Text = ready + " file(s) ready" + (bad > 0 ? ", " + bad + " with problems will be skipped" : "") + ".";
        }

        /* ---------- grid ---------- */
        List<BRow> shownRows = new List<BRow>();
        bool filling;

        BRow RowAt(int i) { return i >= 0 && i < shownRows.Count ? shownRows[i] : null; }

        void Fill()
        {
            filling = true;
            int keep = grid.FirstDisplayedScrollingRowIndex;
            IEnumerable<BRow> q = rows;
            switch (show.SelectedIndex)
            {
                case 1: q = q.Where(r => r.Tick); break;
                case 2: q = q.Where(r => r.NewName != r.Name); break;
                case 3: q = q.Where(r => r.Tick && r.Level >= 1); break;
            }
            shownRows = q.ToList();
            grid.SuspendLayout();
            grid.Rows.Clear();
            var t = Theme.Cur;
            foreach (var r in shownRows)
            {
                int i = grid.Rows.Add(r.Tick, r.Rel == "" ? "." : r.Rel, r.Name, r.NewName, r.Tick ? r.Note : "(not ticked)");
                var gr = grid.Rows[i];
                var chk = gr.Cells[CCheck];
                chk.Style.ForeColor = !r.Tick || r.Level == -1 ? t.Muted : r.Level == 2 ? t.Bad : r.Level == 1 ? t.Warn : t.Ok;
                if (r.NewName != r.Name) gr.Cells[CNew].Style.Font = Theme.UiFont(0, FontStyle.Bold);
                if (!r.Tick) { gr.DefaultCellStyle.ForeColor = t.Muted; }
            }
            if (keep >= 0 && keep < grid.Rows.Count) grid.FirstDisplayedScrollingRowIndex = keep;
            grid.ResumeLayout();
            filling = false;
        }

        void GridEdited(object s, DataGridViewCellEventArgs e)
        {
            if (filling || e.RowIndex < 0) return;
            var r = RowAt(e.RowIndex);
            if (r == null) return;
            var v = grid.Rows[e.RowIndex].Cells[e.ColumnIndex].Value;
            if (e.ColumnIndex == CTick) r.Tick = v is bool && (bool)v;
            else if (e.ColumnIndex == CNew) r.NewName = (Convert.ToString(v) ?? "").Trim();
            else return;
            BeginInvoke(new Action(Validate_));
        }

        /* ---------- Excel round trip ---------- */
        string ExcelFile { get { return Path.Combine(Settings.ExportsDir, "bulk-files-names.csv"); } }

        void ExcelOut()
        {
            if (rows.Count == 0) { Ui.Info(this, "Load some files first."); return; }
            try
            {
                var list = new List<string[]> { new[] { "ID", "Folder", "Current name", "New name" } };
                list.AddRange(rows.Select(r => new[] { r.Id.ToString(), r.Rel == "" ? "." : r.Rel, r.Name, r.NewName }));
                Csv.Write(ExcelFile, list);
                Shell.Open(ExcelFile);
                Ui.Info(this, "The file list is opening in Excel.\n\n" +
                    "1. Change only the  New name  column (formulas and fill-down are fine)\n" +
                    "2. Don't change ID or Current name, don't add rows\n" +
                    "3. Save (Ctrl+S, keep CSV format) and close Excel\n" +
                    "4. Click  ⬆ Load names from Excel\n\n" +
                    "Nothing changes on disk until you click Preview and run.");
            }
            catch (Exception e) { Ui.Error(this, "Couldn't make the Excel file.", e); }
        }

        void ExcelIn()
        {
            if (rows.Count == 0) { Ui.Info(this, "Load the same folder first, then load the names."); return; }
            string f = File.Exists(ExcelFile) ? ExcelFile : null;
            if (f == null || !Ui.Confirm(this, "Load names from the file made by “Edit new names in Excel”?\n\n(No = pick another .csv / .xlsx file)"))
            {
                f = Ui.PickFile(this, "Excel or CSV|*.xlsx;*.xlsm;*.csv", "Pick the file with the new names");
                if (f == null) return;
            }
            List<string[]> t;
            try { t = Table.Read(f); }
            catch (IOException) { Ui.Info(this, "The file is still open in Excel. Save and close it, then try again."); return; }
            catch (Exception e) { Ui.Error(this, "Couldn't read the file.", e); return; }
            int hr = t.FindIndex(r => Table.Col(r, "New name") >= 0);
            if (hr < 0) { Ui.Info(this, "The file needs a  New name  column (and ID or Current name)."); return; }
            var h = t[hr];
            int cId = Table.Col(h, "ID"), cCur = Table.Col(h, "Current name", "Name", "File name"), cNew = Table.Col(h, "New name"), cFolder = Table.Col(h, "Folder");
            var byId = rows.ToDictionary(r => r.Id);
            int set = 0, same = 0; var bad = new List<string>();
            foreach (var x in t.Skip(hr + 1))
            {
                string nn = Table.Get(x, cNew), cur = Table.Get(x, cCur);
                if (nn == "" && cur == "") continue;
                BRow r = null; int id;
                if (cId >= 0 && int.TryParse(Table.Get(x, cId), out id) && byId.ContainsKey(id)) r = byId[id];
                if (r != null && cur != "" && !string.Equals(r.Name, cur, StringComparison.OrdinalIgnoreCase)) r = null;     // ID points to a different file now
                if (r == null && cur != "")
                {
                    string fld = Table.Get(x, cFolder); if (fld == ".") fld = "";
                    var m = rows.Where(z => string.Equals(z.Name, cur, StringComparison.OrdinalIgnoreCase) && (cFolder < 0 || string.Equals(z.Rel, fld, StringComparison.OrdinalIgnoreCase))).ToList();
                    if (m.Count == 1) r = m[0];
                }
                if (r == null) { bad.Add(cur == "" ? "row " + Table.Get(x, cId) : cur); continue; }
                if (nn == "") { same++; continue; }
                if (nn != r.NewName) { r.NewName = nn; set++; } else same++;
            }
            Validate_();
            Ui.Info(this, "New names loaded: " + set + "\nUnchanged: " + same + (bad.Count > 0 ? "\n\nNot matched to a file (" + bad.Count + "):\n" + string.Join("\n", bad.Take(12)) + (bad.Count > 12 ? "\n…" : "") : "") +
                "\n\nCheck the list, then click Preview and run.");
        }

        /* ---------- run ---------- */
        void Run()
        {
            Validate_();
            string mode = Mode;
            var todo = rows.Where(r => r.Tick && (r.Level == 0 || r.Level == 1) && r.Target != "").ToList();
            if (todo.Count == 0) return;
            if (mode != "rename" && IsInside(dest, folder) && subfolders.Checked)
            { Ui.Info(this, "The target folder is inside the folder you're reading from.\nPick a target folder outside it (or untick Include subfolders)."); return; }
            int warn = todo.Count(r => r.Level == 1), bad = rows.Count(r => r.Tick && r.Level == 2);
            string verb = mode == "copy" ? "COPY" : mode == "move" ? "MOVE" : "RENAME";
            var sample = todo.Take(8).Select(r => "  " + r.Name + (r.NewName != r.Name ? "  →  " + r.NewName : ""));
            string msg = verb + " " + todo.Count + " file(s)" + (mode == "rename" ? " in their own folders." : " into:\n" + dest + (keepTree.Checked ? "\n(keeping subfolders)" : "")) +
                "\n\n" + string.Join("\n", sample) + (todo.Count > 8 ? "\n  … and " + (todo.Count - 8) + " more" : "") +
                (warn > 0 ? "\n\n⚠ " + warn + " with a warning (e.g. file ending changed)" : "") +
                (bad > 0 ? "\n✖ " + bad + " with problems will be SKIPPED" : "") +
                "\n\nNothing is overwritten. You can Undo this run afterwards.\n\nGo ahead?";
            if (!Ui.Confirm(this, msg, "Preview – " + verb, mode != "copy")) return;

            var batch = new BBatch { When = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"), Kind = mode, Source = folder, Dest = mode == "rename" ? folder : dest };
            var jobs = todo.Select(r => new { r.Full, r.Target, r.Size }).ToList();
            var errors = new List<string>();
            SetBusy(true, jobs.Count);
            var th = new Thread(() =>
            {
                if (mode == "rename")
                {
                    // two steps so swaps (A→B and B→A) work: first to temporary names, then to the new names
                    var temps = new List<Tuple<string, string, string, long>>();
                    foreach (var j in jobs)
                    {
                        string tmp = Path.Combine(Path.GetDirectoryName(j.Full), "~lt_" + Guid.NewGuid().ToString("N").Substring(0, 8) + "_" + Path.GetFileName(j.Full));
                        try { File.Move(j.Full, tmp); temps.Add(Tuple.Create(j.Full, tmp, j.Target, j.Size)); }
                        catch (Exception e) { errors.Add(Path.GetFileName(j.Full) + ": " + e.Message); }
                    }
                    int k = 0;
                    foreach (var t in temps)
                    {
                        try
                        {
                            if (File.Exists(t.Item3)) throw new IOException("a file with the new name appeared - left as it was");
                            File.Move(t.Item2, t.Item3);
                            lock (batch) batch.Ops.Add(new BOp { From = t.Item1, To = t.Item3, Size = t.Item4 });
                        }
                        catch (Exception e)
                        {
                            errors.Add(Path.GetFileName(t.Item1) + ": " + e.Message);
                            try { File.Move(t.Item2, t.Item1); } catch (Exception) { errors.Add("  !! still named " + Path.GetFileName(t.Item2) + " - rename it back by hand"); }
                        }
                        Step(++k);
                    }
                }
                else
                {
                    int k = 0;
                    foreach (var j in jobs)
                    {
                        try
                        {
                            Directory.CreateDirectory(Path.GetDirectoryName(j.Target));
                            if (File.Exists(j.Target)) throw new IOException("a file with this name is already there - not overwritten");
                            if (mode == "copy") File.Copy(j.Full, j.Target, false); else File.Move(j.Full, j.Target);
                            lock (batch) batch.Ops.Add(new BOp { From = j.Full, To = j.Target, Size = j.Size });
                        }
                        catch (Exception e) { errors.Add(Path.GetFileName(j.Full) + ": " + e.Message); }
                        Step(++k);
                    }
                }
                try { BeginInvoke(new Action(() => Finished(batch, errors))); } catch (Exception) { }
            });
            th.IsBackground = true;
            th.Start();
        }

        void Step(int k) { try { BeginInvoke(new Action(() => { if (k <= progress.Maximum) progress.Value = k; })); } catch (Exception) { } }

        void SetBusy(bool on, int max = 0)
        {
            busy = on;
            progress.Visible = on;
            if (on) { progress.Maximum = Math.Max(1, max); progress.Value = 0; summary.Text = "Working… don't close the program."; }
            foreach (Control c in Controls) if (c != grid) c.Enabled = !on;
            grid.Enabled = !on;
            UpdateButtons();
        }

        void Finished(BBatch batch, List<string> errors)
        {
            SetBusy(false);
            if (batch.Ops.Count > 0) { SaveBatch(batch); WriteLog(batch, errors); }
            unlock.Checked = false;
            string verb = batch.Kind == "copy" ? "Copied" : batch.Kind == "move" ? "Moved" : "Renamed";
            Ui.Info(this, verb + ": " + batch.Ops.Count + " file(s)" + (errors.Count > 0 ? "\n\nNot done (" + errors.Count + "):\n" + string.Join("\n", errors.Take(15)) + (errors.Count > 15 ? "\n… (all in the log)" : "") : "") +
                "\n\nA log was saved in the exports folder. Use  ↶ Undo last run  to put it back.");
            if (batch.Kind != "copy") { rows.Clear(); LoadFiles(); }
            else Validate_();
            if (batch.Kind != "rename" && batch.Ops.Count > 0) { try { Shell.Open(batch.Dest); } catch (Exception) { } }
        }

        static bool IsInside(string child, string parent)
        {
            if (child == "" || parent == "") return false;
            char sep = Path.DirectorySeparatorChar;
            string c = Path.GetFullPath(child).TrimEnd('\\', '/') + sep, p = Path.GetFullPath(parent).TrimEnd('\\', '/') + sep;
            return c.StartsWith(p, StringComparison.OrdinalIgnoreCase);
        }

        /* ---------- history, log, undo ---------- */
        void SaveBatch(BBatch b)
        {
            var h = Json.Load<BHistory>(HistFile);
            h.Batches.Add(b);
            while (h.Batches.Count > 30) h.Batches.RemoveAt(0);
            try { Json.Save(HistFile, h); } catch (Exception e) { Ui.Error(this, "The run worked, but its Undo record couldn't be saved.", e); }
            UpdateUndo();
        }

        void WriteLog(BBatch b, List<string> errors)
        {
            try
            {
                var list = new List<string[]> { new[] { "Time", "Action", "From", "To" } };
                list.AddRange(b.Ops.Select(o => new[] { b.When, b.Kind, o.From, o.To }));
                list.AddRange(errors.Select(e => new[] { b.When, "NOT DONE", e, "" }));
                Csv.Write(Path.Combine(Settings.ExportsDir, "BulkFiles_" + b.Kind + "_" + Names.Stamp() + ".csv"), list);
            }
            catch (Exception) { }
        }

        void UpdateUndo()
        {
            var h = Json.Load<BHistory>(HistFile);
            var last = h.Batches.LastOrDefault(b => !b.Undone);
            undoBtn.Enabled = last != null;
            new ToolTip().SetToolTip(undoBtn, last == null ? "Nothing to undo" : "Undo: " + last.Kind + " of " + last.Ops.Count + " file(s) at " + last.When);
        }

        void Undo()
        {
            var h = Json.Load<BHistory>(HistFile);
            var b = h.Batches.LastOrDefault(x => !x.Undone);
            if (b == null) { Ui.Info(this, "Nothing to undo."); return; }
            string what = b.Kind == "copy" ? "send the " + b.Ops.Count + " COPIES to the Recycle Bin (your originals are not touched)"
                : b.Kind == "move" ? "move " + b.Ops.Count + " file(s) back to where they were"
                : "rename " + b.Ops.Count + " file(s) back to their old names";
            if (!Ui.Confirm(this, "Undo the " + b.Kind + " from " + b.When + "?\n\nThis will " + what + ".\nFiles changed since then are left alone.")) return;
            int done = 0; var skipped = new List<string>();
            var copiesToBin = new List<string>();
            foreach (var o in Enumerable.Reverse(b.Ops))
            {
                try
                {
                    if (!File.Exists(o.To)) { skipped.Add(Path.GetFileName(o.To) + ": not there any more"); continue; }
                    if (b.Kind == "copy")
                    {
                        if (new FileInfo(o.To).Length != o.Size) { skipped.Add(Path.GetFileName(o.To) + ": changed since the copy - kept"); continue; }
                        copiesToBin.Add(o.To);
                    }
                    else
                    {
                        if (File.Exists(o.From)) { skipped.Add(Path.GetFileName(o.From) + ": a file with the old name is back - kept"); continue; }
                        Directory.CreateDirectory(Path.GetDirectoryName(o.From));
                        File.Move(o.To, o.From); done++;
                    }
                }
                catch (Exception e) { skipped.Add(Path.GetFileName(o.To) + ": " + e.Message); }
            }
            if (copiesToBin.Count > 0)
            {
                if (Recycle(copiesToBin)) done += copiesToBin.Count;
                else skipped.Add("Couldn't send the copies to the Recycle Bin - they are still there");
            }
            b.Undone = true;
            try { Json.Save(HistFile, h); } catch (Exception) { }
            UpdateUndo();
            Ui.Info(this, "Undone: " + done + (skipped.Count > 0 ? "\n\nLeft as they are (" + skipped.Count + "):\n" + string.Join("\n", skipped.Take(15)) : ""));
            if (folder != "" && Directory.Exists(folder)) { rows.Clear(); LoadFiles(); }
        }

        void ShowHistory()
        {
            var h = Json.Load<BHistory>(HistFile);
            if (h.Batches.Count == 0) { Ui.Info(this, "No runs yet."); return; }
            var lines = Enumerable.Reverse(h.Batches).Take(15).Select(b => b.When + "   " + b.Kind.ToUpperInvariant() + "   " + b.Ops.Count + " file(s)" + (b.Undone ? "   (undone)" : "") + "\n      " + b.Source + (b.Kind != "rename" ? "  →  " + b.Dest : ""));
            Ui.Info(this, string.Join("\n\n", lines) + "\n\nFull logs (CSV) are in:\n" + Settings.ExportsDir, "Bulk Files history");
        }

        /* Recycle Bin (so an Undo of a copy can still be got back) */
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct SHFILEOPSTRUCT
        {
            public IntPtr hwnd; public uint wFunc;
            [MarshalAs(UnmanagedType.LPWStr)] public string pFrom;
            [MarshalAs(UnmanagedType.LPWStr)] public string pTo;
            public ushort fFlags; public bool fAnyOperationsAborted; public IntPtr hNameMappings;
            [MarshalAs(UnmanagedType.LPWStr)] public string lpszProgressTitle;
        }
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHFileOperation(ref SHFILEOPSTRUCT op);

        static bool Recycle(List<string> files)
        {
            try
            {
                var op = new SHFILEOPSTRUCT { wFunc = 3, pFrom = string.Join("\0", files) + "\0\0", fFlags = 0x0040 | 0x0010 | 0x0004 | 0x0400 };   // DELETE, ALLOWUNDO|NOCONFIRMATION|SILENT|NOERRORUI
                return SHFileOperation(ref op) == 0 && !op.fAnyOperationsAborted;
            }
            catch (Exception) { return false; }
        }
    }
}
