// Lew's Toolbox - Delegate tab, part 1: the screen.
// Make tasks (with checklist items), assign people, send each person an Excel sheet and/or an HTML task pack,
// load their filled-in files / replies back and see the status. File formats are in DelegateFiles.cs.
// Data: delegate.json. Also writes delegate-feed.json so the Tracker can show "Waiting on <name>".
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;

namespace LewsToolbox
{
    [Tab("delegate")]
    class DelegatePage : UserControl, IPage
    {
        static readonly string[] St = DelegateFiles.Statuses;
        DData data;
        List<DTask> web = new List<DTask>();
        string FileName { get { return Settings.PathOf("delegate.json"); } }
        string FeedFile { get { return Settings.PathOf("delegate-feed.json"); } }

        string view = "list";       // list | team | web
        FlowLayoutPanel viewBar;
        ComboBox person;
        TextBox search;
        CheckBox hideDone;
        Label hint;
        DataGridView grid;
        bool filling;
        // what each grid row is
        readonly List<Tuple<DTask, DSub, string>> rowMap = new List<Tuple<DTask, DSub, string>>();

        public DelegatePage()
        {
            LoadData();
            BuildUi();
            Render();
        }

        public void OnShown() { LoadWeb(); Render(); }
        public void Reload() { LoadData(); Render(); }

        /* ---------- data ---------- */
        void LoadData()
        {
            data = Json.Load<DData>(FileName);
            if (data.Tasks == null) data.Tasks = new List<DTask>();
            if (data.Issued == null) data.Issued = new List<DIssue>();
            if (data.Imports == null) data.Imports = new List<DImport>();
            foreach (var t in data.Tasks)
            {
                if (t.Subs == null) t.Subs = new List<DSub>();
                if (t.History == null) t.History = new List<string>();
                if (!St.Contains(t.Status)) t.Status = "Not started";
                foreach (var s in t.Subs) if (!St.Contains(s.Status)) s.Status = "Not started";
            }
            LoadWeb();
        }

        void LoadWeb()
        {
            web = new List<DTask>();
            if (string.IsNullOrEmpty(Settings.D.TrackerFolder)) return;
            try { web = DelegateFiles.ReadWebApp(Settings.D.TrackerFolder); } catch (Exception) { }
        }

        void Save()
        {
            try { Json.Save(FileName, data); WriteFeed(); }
            catch (Exception e) { Ui.Error(this, "Delegate data couldn't be saved to:\n" + FileName, e); }
        }

        /* For the Tracker tab: one line per open task, "waiting on" its people */
        void WriteFeed()
        {
            var feed = new List<Dictionary<string, object>>();
            foreach (var t in data.Tasks)
            {
                string st = DelegateFiles.StatusOf(t);
                if (st == "Completed") continue;
                var open = t.Subs.Where(s => s.Status != "Completed").ToList();
                var names = (t.Subs.Count == 0 ? DelegateFiles.SplitNames(t.Who) : open.SelectMany(s => DelegateFiles.SplitNames(s.Who == "" ? t.Who : s.Who))).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                if (names.Count == 0) continue;
                var dues = (t.Subs.Count == 0 ? new[] { t.Due } : open.Select(s => s.Due == "" ? t.Due : s.Due)).Where(d => d != "").OrderBy(d => d).ToList();
                string title = t.Code + " " + t.Title + (t.Subs.Count > 0 ? "  (" + t.Subs.Count(s => s.Status == "Completed") + "/" + t.Subs.Count + " done)" : "");
                feed.Add(new Dictionary<string, object> { { "Id", t.Id }, { "Title", title }, { "Who", string.Join(", ", names) }, { "Due", dues.FirstOrDefault() ?? "" }, { "Status", st }, { "Project", t.Project } });
            }
            Json.Save(FeedFile, feed);
        }

        static string Today { get { return DateTime.Today.ToString("yyyy-MM-dd"); } }
        static string Stamp() { return DateTime.Now.ToString("dd MMM HH:mm", CultureInfo.InvariantCulture); }
        static string NewId(string p) { return p + DateTime.Now.Ticks.ToString("x") + new Random().Next(4096).ToString("x"); }
        static DateTime? D(string s) { DateTime d; return DateTime.TryParseExact(s ?? "", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out d) ? d : (DateTime?)null; }
        static string Nice(string s) { var d = D(s); return d == null ? "" : d.Value.ToString("ddd dd MMM", CultureInfo.InvariantCulture); }
        static bool Late(string due, string status) { var d = D(due); return d != null && d.Value < DateTime.Today && status != "Completed"; }
        string NextCode() { data.Seq++; string c; do { c = "T" + data.Seq.ToString("000"); if (data.Tasks.Any(t => t.Code == c)) data.Seq++; else break; } while (true); return c; }
        static string NextSubCode(DTask t)
        {
            int max = 0;
            foreach (var s in t.Subs) { int n; var p = s.Code.Split('.'); if (p.Length > 1 && int.TryParse(p[p.Length - 1], out n)) max = Math.Max(max, n); }
            return t.Code + "." + (max + 1);
        }
        IEnumerable<string> People()
        {
            return data.Tasks.SelectMany(t => DelegateFiles.SplitNames(t.Who).Concat(t.Subs.SelectMany(s => DelegateFiles.SplitNames(s.Who))))
                .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(n => n);
        }

        /* ---------- layout ---------- */
        void BuildUi()
        {
            var top = Ui.Bar();
            top.Controls.Add(Ui.Btn("+ New task", delegate { Edit(null); }, "accent"));
            top.Controls.Add(Ui.Btn("\U0001F4E4 Send to people…", delegate { SendDialog(); }));
            top.Controls.Add(Ui.Btn("⬆ Load replies…", LoadReplies));
            top.Controls.Add(Ui.Btn("\U0001F4CB Paste reply…", PasteReply));
            top.Controls.Add(Ui.MenuBtn("More", MoreMenu));

            viewBar = Ui.Bar("bg");

            var filters = Ui.Bar("bg");
            filters.Controls.Add(Ui.Lbl("Person:"));
            person = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = Theme.Px(150), Margin = new Padding(Theme.Px(3), Theme.Px(5), Theme.Px(3), 0) };
            person.SelectedIndexChanged += delegate { if (!filling) Render(); };
            filters.Controls.Add(person);
            search = new TextBox { Width = Theme.Px(170), Margin = new Padding(Theme.Px(8), Theme.Px(5), Theme.Px(3), 0) };
            search.TextChanged += delegate { Render(); };
            filters.Controls.Add(Ui.Lbl("Search:"));
            filters.Controls.Add(search);
            hideDone = new CheckBox { Text = "Hide completed", AutoSize = true, Checked = true, Margin = new Padding(Theme.Px(10), Theme.Px(7), Theme.Px(3), 0) };
            hideDone.CheckedChanged += delegate { Render(); };
            filters.Controls.Add(hideDone);
            hint = Ui.Lbl("", "muted");
            filters.Controls.Add(hint);

            grid = new DataGridView
            {
                Dock = DockStyle.Fill, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AllowUserToResizeRows = false, ReadOnly = true,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect, MultiSelect = false
            };
            grid.CellDoubleClick += (s, e) => { var m = At(e.RowIndex); if (m != null && m.Item1 != null && !m.Item1.FromWeb) Edit(m.Item1); else if (m != null && m.Item3 != null && view == "team") { SelectPerson(m.Item3); } };
            grid.MouseUp += (s, e) =>
            {
                if (e.Button != MouseButtons.Right) return;
                var hit = grid.HitTest(e.X, e.Y); if (hit.RowIndex < 0) return;
                grid.ClearSelection(); grid.Rows[hit.RowIndex].Selected = true;
                var m = At(hit.RowIndex); if (m == null || m.Item1 == null || m.Item1.FromWeb) return;
                RowMenu(m.Item1, m.Item2).Show(grid, e.Location);
            };
            grid.KeyDown += (s, e) =>
            {
                var m = grid.CurrentRow != null ? At(grid.CurrentRow.Index) : null;
                if (m == null || m.Item1 == null || m.Item1.FromWeb) return;
                if (e.KeyCode == Keys.Enter || e.KeyCode == Keys.F2) { e.SuppressKeyPress = true; Edit(m.Item1); }
            };

            Controls.Add(grid);
            Controls.Add(filters);
            Controls.Add(viewBar);
            Controls.Add(top);
        }

        Tuple<DTask, DSub, string> At(int i) { return i >= 0 && i < rowMap.Count ? rowMap[i] : null; }

        void SelectPerson(string p)
        {
            view = "list";
            for (int i = 0; i < person.Items.Count; i++) if ((string)person.Items[i] == p) person.SelectedIndex = i;
            Render();
        }

        /* ---------- render ---------- */
        void Render()
        {
            if (viewBar == null) return;
            filling = true;
            string keep = person.SelectedIndex > 0 ? (string)person.SelectedItem : null;
            var ppl = People().ToList();
            person.Items.Clear(); person.Items.Add("Everyone"); foreach (var p in ppl) person.Items.Add(p);
            person.SelectedIndex = keep != null && ppl.Contains(keep) ? ppl.IndexOf(keep) + 1 : 0;
            filling = false;

            viewBar.SuspendLayout(); viewBar.Controls.Clear();
            int open = data.Tasks.Count(t => DelegateFiles.StatusOf(t) != "Completed");
            int late = data.Tasks.Sum(t => t.Subs.Count == 0 ? (Late(t.Due, t.Status) ? 1 : 0) : t.Subs.Count(s => Late(s.Due == "" ? t.Due : s.Due, s.Status)));
            viewBar.Controls.Add(Ui.Btn("☰ Tasks  " + open, delegate { view = "list"; Render(); }, view == "list" ? "on" : ""));
            viewBar.Controls.Add(Ui.Btn("\U0001F465 Team", delegate { view = "team"; Render(); }, view == "team" ? "on" : ""));
            if (!string.IsNullOrEmpty(Settings.D.TrackerFolder))
                viewBar.Controls.Add(Ui.Btn("\U0001F310 Lew's Tracker  " + web.Count, delegate { LoadWeb(); view = "web"; Render(); }, view == "web" ? "on" : ""));
            var lateLbl = Ui.Lbl(late > 0 ? late + " late" : "", "bold");
            viewBar.Controls.Add(lateLbl);
            if (data.Imports.Count > 0) { var li = data.Imports.Last(); viewBar.Controls.Add(Ui.Lbl("Last reply: " + li.From + ", " + li.When, "muted")); }
            Theme.Apply(viewBar);
            lateLbl.ForeColor = Theme.Cur.Bad;
            viewBar.ResumeLayout();

            if (view == "team") RenderTeam(); else RenderList(view == "web" ? web : data.Tasks);
        }

        bool Match(DTask t, DSub s, string who, string[] words)
        {
            if (who != null && !(DelegateFiles.Has(t.Who, who) || (s != null ? DelegateFiles.Has(s.Who, who) : t.Subs.Any(x => DelegateFiles.Has(x.Who, who))))) return false;
            if (words.Length == 0) return true;
            string hay = (t.Code + " " + t.Title + " " + t.Group + " " + t.Notes + " " + t.Who + " " + string.Join(" ", t.Subs.Select(x => x.Code + " " + x.Title + " " + x.Notes + " " + x.Who))).ToLowerInvariant();
            return words.All(w => hay.Contains(w));
        }

        void RenderList(List<DTask> tasks)
        {
            grid.Columns.Clear(); rowMap.Clear();
            string[] cols = { "ID", "Task / item", "Group", "Assigned to", "Due", "Status", "Progress", "Notes", "Last update" };
            int[] w = { 70, 300, 110, 130, 100, 100, 70, 220, 130 };
            for (int i = 0; i < cols.Length; i++) grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = cols[i], Width = Theme.Px(w[i]), SortMode = DataGridViewColumnSortMode.NotSortable });
            grid.Columns[7].AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;
            string who = person.SelectedIndex > 0 ? (string)person.SelectedItem : null;
            var words = search.Text.ToLowerInvariant().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            var th = Theme.Cur;
            grid.Rows.Clear();
            var bold = Theme.UiFont(0, FontStyle.Bold);
            foreach (var t in tasks.OrderBy(t => DelegateFiles.StatusOf(t) == "Completed").ThenBy(t => t.Code, StringComparer.OrdinalIgnoreCase))
            {
                string st = DelegateFiles.StatusOf(t);
                if (hideDone.Checked && st == "Completed") continue;
                if (!Match(t, null, who, words)) continue;
                bool mineWhole = who == null || DelegateFiles.Has(t.Who, who);
                int i = grid.Rows.Add((t.FromWeb ? "\U0001F310 " : "") + t.Code, t.Title, t.Group, t.Who, Nice(t.Due), st, ((int)Math.Round(DelegateFiles.Progress(t) * 100)) + "%", Flat(t.Notes), t.Updated);
                rowMap.Add(Tuple.Create(t, (DSub)null, (string)null));
                var r = grid.Rows[i];
                r.DefaultCellStyle.BackColor = th.Chip; r.DefaultCellStyle.Font = bold;
                Colour(r, t.Due, st);
                foreach (var s in t.Subs)
                {
                    if (hideDone.Checked && s.Status == "Completed" && st != "Completed") { }
                    if (!mineWhole && !DelegateFiles.Has(s.Who, who)) continue;
                    string due = s.Due == "" ? t.Due : s.Due;
                    int j = grid.Rows.Add(s.Code, "    ↳ " + s.Title, "", s.Who == "" ? (t.Who == "" ? "" : "(" + t.Who + ")") : s.Who, Nice(due), s.Status, "", Flat(s.Notes), s.Updated);
                    rowMap.Add(Tuple.Create(t, s, (string)null));
                    Colour(grid.Rows[j], due, s.Status);
                    if (s.Status == "Completed") grid.Rows[j].DefaultCellStyle.ForeColor = th.Muted;
                }
            }
            hint.Text = view == "web" ? "Read-only copy of Lew's Tracker. More ▾ > Copy Lew's Tracker tasks into the Toolbox to work on them here."
                : rowMap.Count == 0 ? (data.Tasks.Count == 0 ? "No tasks yet – click + New task." : "Nothing matches.") : "Double-click = edit  ·  Right-click = status, add item, send…";
        }

        static string Flat(string s) { return (s ?? "").Replace("\r", " ").Replace("\n", " "); }

        void Colour(DataGridViewRow r, string due, string st)
        {
            var th = Theme.Cur;
            if (Late(due, st)) { r.Cells[4].Style.ForeColor = th.Bad; r.Cells[4].Value = r.Cells[4].Value + "  late"; }
            r.Cells[5].Style.ForeColor = st == "Completed" ? th.Ok : st == "In progress" ? th.Warn : th.Text;
        }

        void RenderTeam()
        {
            grid.Columns.Clear(); rowMap.Clear(); grid.Rows.Clear();
            string[] cols = { "Person", "Open items", "Late", "Due this week", "Due next week", "Done", "Load" };
            int[] w = { 180, 90, 70, 110, 110, 70, 200 };
            for (int i = 0; i < cols.Length; i++) grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = cols[i], Width = Theme.Px(w[i]) });
            grid.Columns[6].AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;
            var ws = DateTime.Today.AddDays(-(((int)DateTime.Today.DayOfWeek + 6) % 7));
            var th = Theme.Cur;
            foreach (var p in People())
            {
                // one "item" = a checklist item, or a task without items
                var items = new List<Tuple<string, string>>();
                foreach (var t in data.Tasks)
                {
                    if (t.Subs.Count == 0) { if (DelegateFiles.Has(t.Who, p)) items.Add(Tuple.Create(t.Due, t.Status)); }
                    else foreach (var s in t.Subs) if (DelegateFiles.Has(s.Who == "" ? t.Who : s.Who, p)) items.Add(Tuple.Create(s.Due == "" ? t.Due : s.Due, s.Status));
                }
                var openI = items.Where(x => x.Item2 != "Completed").ToList();
                int late = openI.Count(x => Late(x.Item1, x.Item2));
                int thisW = openI.Count(x => D(x.Item1) != null && D(x.Item1).Value >= DateTime.Today && D(x.Item1).Value < ws.AddDays(7));
                int nextW = openI.Count(x => D(x.Item1) != null && D(x.Item1).Value >= ws.AddDays(7) && D(x.Item1).Value < ws.AddDays(14));
                string load = late > 0 ? "⚠ Behind (" + late + " late)" : openI.Count >= 10 || thisW >= 6 ? "Busy" : openI.Count <= 3 ? "Has room" : "OK";
                int i = grid.Rows.Add(p, openI.Count, late == 0 ? "" : late.ToString(), thisW, nextW, items.Count - openI.Count, load);
                rowMap.Add(Tuple.Create((DTask)null, (DSub)null, p));
                if (late > 0) { grid.Rows[i].Cells[2].Style.ForeColor = th.Bad; grid.Rows[i].Cells[6].Style.ForeColor = th.Bad; }
                else if (load == "Has room") grid.Rows[i].Cells[6].Style.ForeColor = th.Ok;
                else if (load == "Busy") grid.Rows[i].Cells[6].Style.ForeColor = th.Warn;
            }
            hint.Text = "Double-click a person to see their tasks";
        }

        /* ---------- row actions ---------- */
        ContextMenuStrip RowMenu(DTask t, DSub s)
        {
            var m = Theme.Menu();
            Theme.Item(m, "Edit task…", () => Edit(t)).Font = Theme.UiFont(0, FontStyle.Bold);
            if (s != null || t.Subs.Count == 0)
                foreach (var st in St)
                {
                    string v = st;
                    var it = Theme.Item(m, "Status: " + st, () => { if (s != null) { s.Status = v; s.Updated = Stamp() + " · me"; } else { t.Status = v; } t.Updated = Stamp() + " · me"; t.History.Add(Stamp() + "  " + (s != null ? s.Code : t.Code) + " → " + v); Save(); Render(); });
                    it.Checked = (s != null ? s.Status : t.Status) == st;
                }
            m.Items.Add(new ToolStripSeparator());
            Theme.Item(m, "\U0001F4E4 Send this task…", () => SendDialog(t));
            Theme.Item(m, "History", () => Ui.Info(this, t.History.Count == 0 ? "No history yet." : string.Join("\n", t.History.Skip(Math.Max(0, t.History.Count - 30))), t.Code + " history"));
            Theme.Item(m, "Duplicate", () =>
            {
                var c = Json.Read<DTask>(Json.Write(t)); c.Id = NewId("t"); c.Code = NextCode(); c.Status = "Not started"; c.Updated = ""; c.History = new List<string> { Stamp() + "  Copied from " + t.Code };
                int n = 1; foreach (var x in c.Subs) { x.Id = NewId("s"); x.Code = c.Code + "." + (n++); x.Status = "Not started"; x.Updated = ""; }
                data.Tasks.Add(c); Save(); Render();
            });
            Theme.Item(m, "Delete task", () => { if (Ui.Confirm(this, "Delete " + t.Code + " \"" + t.Title + "\" and its items?")) { data.Tasks.Remove(t); Save(); Render(); } });
            return m;
        }

        ContextMenuStrip MoreMenu()
        {
            var m = Theme.Menu();
            Theme.Item(m, "Export all tasks → Excel (CSV)", ExportCsv);
            Theme.Item(m, "Open the folder with sent files", () => { Directory.CreateDirectory(SentRoot); Shell.Open(SentRoot); });
            Theme.Item(m, "Sent and received log", ShowLog);
            m.Items.Add(new ToolStripSeparator());
            Theme.Item(m, "Default project name…", () => { var p = Ui.Ask(this, "Project", "Project name used on new tasks and sheets:", data.Project); if (p != null) { data.Project = p; Save(); } });
            if (!string.IsNullOrEmpty(Settings.D.TrackerFolder)) Theme.Item(m, "Copy Lew's Tracker tasks into the Toolbox…", CopyWeb);
            else Theme.Item(m, "Link Lew's Tracker (Settings)", () => MainForm.Me.Show("settings"));
            return m;
        }

        /* ---------- edit ---------- */
        void Edit(DTask t)
        {
            bool isNew = t == null;
            var w = isNew ? new DTask { Id = NewId("t"), Code = "", Project = data.Project, Created = Today, Who = person.SelectedIndex > 0 ? (string)person.SelectedItem : "" } : Json.Read<DTask>(Json.Write(t));
            using (var f = new Form())
            {
                f.Text = isNew ? "New task" : "Edit " + t.Code;
                f.StartPosition = FormStartPosition.CenterParent; f.ShowInTaskbar = false; f.MinimizeBox = false;
                f.Size = new Size(Theme.Px(900), Theme.Px(640));
                var tl = new TableLayoutPanel { Dock = DockStyle.Top, ColumnCount = 4, AutoSize = true, Padding = new Padding(Theme.Px(10)) };
                tl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize)); tl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60));
                tl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize)); tl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
                var code = new TextBox { Text = isNew ? "" : w.Code, Dock = DockStyle.Fill };
                var title = new TextBox { Text = w.Title, Dock = DockStyle.Fill };
                var group = new TextBox { Text = w.Group, Dock = DockStyle.Fill };
                var proj = new TextBox { Text = w.Project, Dock = DockStyle.Fill };
                var who = new ComboBox { Text = w.Who, Dock = DockStyle.Fill };
                foreach (var p in People()) who.Items.Add(p);
                who.Text = w.Who;
                var due = new DateTimePicker { Format = DateTimePickerFormat.Custom, CustomFormat = "ddd dd MMM yyyy", ShowCheckBox = true, Dock = DockStyle.Fill };
                var dd = D(w.Due); due.Value = dd ?? DateTime.Today; due.Checked = dd != null;
                var stat = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Dock = DockStyle.Fill }; stat.Items.AddRange(St); stat.SelectedItem = St.Contains(w.Status) ? w.Status : St[0];
                var notes = new TextBox { Text = w.Notes, Dock = DockStyle.Fill, Multiline = true, Height = Theme.Px(48), ScrollBars = ScrollBars.Vertical };
                Cell(tl, 0, "ID", code, "Task", title);
                Cell(tl, 1, "Group", group, "Project", proj);
                Cell(tl, 2, "Assigned to", who, "Due", due);
                Cell(tl, 3, "Status", stat, "Notes", notes);
                var whoTip = new Label { Text = "Several people: put a comma between names. Leave ID empty for the next number.", AutoSize = true, Tag = "muted small" };
                tl.Controls.Add(whoTip, 1, 4); tl.SetColumnSpan(whoTip, 3);

                var itemsLbl = new Label { Text = "Checklist items (optional) – one row each. Empty Assigned to / Due = same as the task.", Dock = DockStyle.Top, Height = Theme.Px(26), Tag = "bold", Padding = new Padding(Theme.Px(10), Theme.Px(6), 0, 0) };
                var items = new DataGridView { Dock = DockStyle.Fill, AllowUserToAddRows = true, AllowUserToDeleteRows = true, RowHeadersVisible = true, SelectionMode = DataGridViewSelectionMode.CellSelect };
                items.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "ID", Width = Theme.Px(60), ReadOnly = true });
                items.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Item", Width = Theme.Px(260) });
                items.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Assigned to", Width = Theme.Px(120) });
                items.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Due (dd/mm/yyyy)", Width = Theme.Px(110) });
                var stCol = new DataGridViewComboBoxColumn { HeaderText = "Status", Width = Theme.Px(110), FlatStyle = FlatStyle.Flat }; stCol.Items.AddRange(St);
                items.Columns.Add(stCol);
                items.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Notes", AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill });
                items.DefaultValuesNeeded += (s, e) => { e.Row.Cells[4].Value = "Not started"; };
                foreach (var s in w.Subs) items.Rows.Add(s.Code, s.Title, s.Who, D(s.Due) != null ? D(s.Due).Value.ToString("dd/MM/yyyy") : "", s.Status, s.Notes);
                items.DataError += (s, e) => { e.ThrowException = false; };

                var btns = new FlowLayoutPanel { Dock = DockStyle.Bottom, AutoSize = true, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(Theme.Px(6)), Tag = "panel" };
                var cancel = Ui.Btn("Cancel", null); cancel.DialogResult = DialogResult.Cancel;
                var ok = Ui.Btn(isNew ? "Add task" : "Save", null, "accent");
                btns.Controls.Add(cancel); btns.Controls.Add(ok);
                btns.Controls.Add(Ui.Btn("+ Paste items (one per line)…", delegate
                {
                    var txt = AskLines(f, "Paste items", "One item per line (e.g. copied from Excel or an email):");
                    if (txt == null) return;
                    foreach (var line in txt.Replace("\r", "").Split('\n').Select(x => x.Trim()).Where(x => x != ""))
                    {
                        var parts = line.Split('\t');
                        items.Rows.Add("", parts[0], parts.Length > 1 ? parts[1] : "", parts.Length > 2 ? parts[2] : "", "Not started", "");
                    }
                }));
                ok.Click += delegate
                {
                    if (items.IsCurrentCellInEditMode) items.EndEdit();
                    string c = code.Text.Trim();
                    if (title.Text.Trim() == "") { MessageBox.Show(f, "Type what the task is."); return; }
                    if (c != "" && data.Tasks.Any(x => x != t && string.Equals(x.Code, c, StringComparison.OrdinalIgnoreCase))) { MessageBox.Show(f, "ID " + c + " is already used by another task."); return; }
                    var bad = new List<string>();
                    foreach (DataGridViewRow r in items.Rows)
                    {
                        if (r.IsNewRow) continue;
                        string ds = Convert.ToString(r.Cells[3].Value ?? "").Trim();
                        if (ds != "" && ParseDate(ds) == null) bad.Add(Convert.ToString(r.Cells[1].Value) + ": \"" + ds + "\"");
                    }
                    if (bad.Count > 0) { MessageBox.Show(f, "These dates aren't clear - use dd/mm/yyyy:\n" + string.Join("\n", bad)); return; }
                    f.DialogResult = DialogResult.OK;
                };
                f.AcceptButton = null; f.CancelButton = cancel;
                f.Controls.Add(items);
                f.Controls.Add(itemsLbl);
                f.Controls.Add(tl);
                f.Controls.Add(btns);
                Theme.Apply(f);
                f.Shown += delegate { title.Focus(); };
                if (f.ShowDialog(this) != DialogResult.OK) return;

                w.Code = code.Text.Trim() == "" ? (isNew ? NextCode() : t.Code) : code.Text.Trim();
                w.Title = title.Text.Trim(); w.Group = group.Text.Trim(); w.Project = proj.Text.Trim(); w.Who = who.Text.Trim();
                w.Due = due.Checked ? due.Value.ToString("yyyy-MM-dd") : ""; w.Notes = notes.Text.Trim();
                var old = w.Subs.ToDictionary(s => s.Code, s => s);
                var subs = new List<DSub>();
                var tmp = new DTask { Code = w.Code };
                foreach (DataGridViewRow r in items.Rows)
                {
                    if (r.IsNewRow) continue;
                    string it = Convert.ToString(r.Cells[1].Value ?? "").Trim(); if (it == "") continue;
                    string sc = Convert.ToString(r.Cells[0].Value ?? "").Trim();
                    DSub s;
                    if (sc != "" && old.ContainsKey(sc)) s = old[sc];
                    else { s = new DSub { Id = NewId("s") }; }
                    s.Title = it; s.Who = Convert.ToString(r.Cells[2].Value ?? "").Trim();
                    var pd = ParseDate(Convert.ToString(r.Cells[3].Value ?? "").Trim()); s.Due = pd == null ? "" : pd.Value.ToString("yyyy-MM-dd");
                    string ns = Convert.ToString(r.Cells[4].Value ?? "Not started"); if (ns != s.Status) { s.Status = St.Contains(ns) ? ns : "Not started"; }
                    s.Notes = Convert.ToString(r.Cells[5].Value ?? "").Trim();
                    subs.Add(s);
                }
                // codes follow the task code (T001.1, T001.2 ...); keep existing numbers
                foreach (var s in subs) if (s.Code == "" || !s.Code.StartsWith(w.Code + ".")) { tmp.Subs = subs.Where(x => x.Code != "" && x.Code.StartsWith(w.Code + ".")).ToList(); s.Code = NextSubCode(tmp); }
                w.Subs = subs;
                if (w.Subs.Count == 0) w.Status = (string)stat.SelectedItem;
                w.Updated = Stamp() + " · me";
                if (isNew) { w.History.Add(Stamp() + "  Created"); data.Tasks.Add(w); }
                else { w.History.Add(Stamp() + "  Edited"); data.Tasks[data.Tasks.IndexOf(t)] = w; }
                Save(); Render();
            }
        }

        static DateTime? ParseDate(string s)
        {
            if (string.IsNullOrEmpty(s)) return null;
            DateTime d;
            if (DateTime.TryParseExact(s, new[] { "d/M/yyyy", "d/M/yy", "yyyy-MM-dd", "d-M-yyyy", "d.M.yyyy", "d MMM yyyy", "dd MMM yyyy" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out d)) return d;
            if (DateTime.TryParseExact(s + "/" + DateTime.Today.Year, "d/M/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out d)) return d;
            return null;
        }

        static void Cell(TableLayoutPanel t, int row, string l1, Control c1, string l2, Control c2)
        {
            t.Controls.Add(new Label { Text = l1, AutoSize = true, Margin = new Padding(0, Theme.Px(7), Theme.Px(8), 0) }, 0, row);
            t.Controls.Add(c1, 1, row);
            t.Controls.Add(new Label { Text = l2, AutoSize = true, Margin = new Padding(Theme.Px(12), Theme.Px(7), Theme.Px(8), 0) }, 2, row);
            t.Controls.Add(c2, 3, row);
        }

        static string AskLines(IWin32Window owner, string title, string question)
        {
            using (var f = new Form())
            {
                f.Text = title; f.StartPosition = FormStartPosition.CenterParent; f.ShowInTaskbar = false; f.MinimizeBox = false;
                f.Size = new Size(Theme.Px(560), Theme.Px(420));
                var l = new Label { Text = question, Dock = DockStyle.Top, Height = Theme.Px(30), Padding = new Padding(Theme.Px(8), Theme.Px(8), 0, 0) };
                var tb = new TextBox { Dock = DockStyle.Fill, Multiline = true, ScrollBars = ScrollBars.Both, AcceptsReturn = true, WordWrap = false };
                var b = new FlowLayoutPanel { Dock = DockStyle.Bottom, AutoSize = true, FlowDirection = FlowDirection.RightToLeft, Tag = "panel" };
                var cancel = Ui.Btn("Cancel", null); cancel.DialogResult = DialogResult.Cancel;
                var ok = Ui.Btn("OK", null, "accent"); ok.DialogResult = DialogResult.OK;
                b.Controls.Add(cancel); b.Controls.Add(ok);
                f.Controls.Add(tb); f.Controls.Add(l); f.Controls.Add(b);
                f.CancelButton = cancel;
                Theme.Apply(f);
                return f.ShowDialog(owner) == DialogResult.OK ? tb.Text : null;
            }
        }

        /* ---------- send ---------- */
        string SentRoot { get { return Path.Combine(Settings.ExportsDir, "Delegate"); } }

        /* the tasks for one person: whole tasks assigned to them, or only their items */
        List<DTask> PlanFor(IEnumerable<DTask> tasks, string who)
        {
            var list = new List<DTask>();
            foreach (var t in tasks)
            {
                if (who == null || DelegateFiles.Has(t.Who, who)) { list.Add(t); continue; }
                var mine = t.Subs.Where(s => DelegateFiles.Has(s.Who, who)).ToList();
                if (mine.Count == 0) continue;
                var c = Json.Read<DTask>(Json.Write(t)); c.Subs = Json.Read<List<DSub>>(Json.Write(mine));
                list.Add(c);
            }
            return list;
        }

        public void SendDialog(DTask only = null)
        {
            var pool = only != null ? new List<DTask> { only } : data.Tasks.Where(t => DelegateFiles.StatusOf(t) != "Completed").ToList();
            if (pool.Count == 0) { Ui.Info(this, data.Tasks.Count == 0 ? "Make a task first (+ New task)." : "All tasks are completed – nothing to send."); return; }
            var ppl = pool.SelectMany(t => DelegateFiles.SplitNames(t.Who).Concat(t.Subs.SelectMany(s => DelegateFiles.SplitNames(s.Who)))).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(n => n).ToList();
            using (var f = new Form())
            {
                f.Text = only != null ? "Send " + only.Code : "Send tasks to people";
                f.StartPosition = FormStartPosition.CenterParent; f.ShowInTaskbar = false; f.MinimizeBox = false; f.MaximizeBox = false;
                f.FormBorderStyle = FormBorderStyle.FixedDialog;
                f.ClientSize = new Size(Theme.Px(520), Theme.Px(470));
                var p = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(Theme.Px(14)), AutoScroll = true };
                p.Controls.Add(new Label { Text = (only != null ? only.Code + " " + only.Title : pool.Count + " open task(s)") + " – who gets a file?", AutoSize = true, Tag = "bold" });
                var who = new CheckedListBox { Width = Theme.Px(470), Height = Theme.Px(140), CheckOnClick = true };
                foreach (var n in ppl) who.Items.Add(n, true);
                p.Controls.Add(who);
                var all = new CheckBox { Text = "Also one file with everything (for a group / the whole team)", AutoSize = true, Checked = ppl.Count == 0 };
                p.Controls.Add(all);
                if (ppl.Count == 0) p.Controls.Add(new Label { Text = "No one is assigned yet – one file with everything will be made.", AutoSize = true, Tag = "muted" });
                p.Controls.Add(new Label { Text = "File types", AutoSize = true, Tag = "bold", Margin = new Padding(0, Theme.Px(12), 0, 0) });
                var xl = new CheckBox { Text = "Excel task sheet (.xlsx) – yellow boxes to fill in, drop-down status", AutoSize = true, Checked = true };
                var pk = new CheckBox { Text = "HTML task pack (.html) – opens in any browser, phone friendly, sends a reply", AutoSize = true, Checked = true };
                var si = new CheckBox { Text = "Simple Excel table (.xlsx) – plain rows, no formulas", AutoSize = true };
                p.Controls.Add(xl); p.Controls.Add(pk); p.Controls.Add(si);
                p.Controls.Add(new Label { Text = "Files are saved with today's date and time in the name,\nin a new folder under exports\\Delegate. Then attach them to an email / Teams.", AutoSize = true, Tag = "muted", Margin = new Padding(0, Theme.Px(12), 0, 0) });
                var b = new FlowLayoutPanel { Dock = DockStyle.Bottom, AutoSize = true, FlowDirection = FlowDirection.RightToLeft, Tag = "panel", Padding = new Padding(Theme.Px(6)) };
                var cancel = Ui.Btn("Cancel", null); cancel.DialogResult = DialogResult.Cancel;
                var ok = Ui.Btn("Make the files", null, "accent"); ok.DialogResult = DialogResult.OK;
                b.Controls.Add(cancel); b.Controls.Add(ok);
                f.Controls.Add(p); f.Controls.Add(b);
                f.CancelButton = cancel;
                Theme.Apply(f);
                if (f.ShowDialog(this) != DialogResult.OK) return;
                var people = who.CheckedItems.Cast<string>().ToList();
                if (!xl.Checked && !pk.Checked && !si.Checked) { Ui.Info(this, "Tick at least one file type."); return; }
                if (people.Count == 0 && !all.Checked) { Ui.Info(this, "Tick at least one person, or “One file with everything”."); return; }
                MakeFiles(pool, people, all.Checked, xl.Checked, pk.Checked, si.Checked);
            }
        }

        public string MakeFiles(List<DTask> pool, List<string> people, bool everyone, bool xl, bool pack, bool simple)
        {
            string stamp = Names.Stamp();
            string folder = Path.Combine(SentRoot, stamp);
            string project = pool.Select(t => t.Project).FirstOrDefault(x => x != "") ?? data.Project;
            if (string.IsNullOrEmpty(project)) project = "Tasks";
            string by = Settings.D.UserName;
            var made = new List<string>();
            var targets = people.Select(x => (string)x).ToList();
            if (everyone || targets.Count == 0) targets.Add(null);
            try
            {
                foreach (var who in targets)
                {
                    var plan = PlanFor(pool, who);
                    if (plan.Count == 0) continue;
                    string label = who ?? "Everyone";
                    string exportId = NewId("x");
                    string baseName = "Tasks_" + Names.Safe(label).Replace(' ', '_') + "_" + Names.Safe(project).Replace(' ', '_') + "_" + stamp;
                    if (xl) { string fp = Path.Combine(folder, baseName + ".xlsx"); DelegateFiles.BuildPlan(fp, plan, project, by, label, exportId); made.Add(fp); }
                    if (simple) { string fp = Path.Combine(folder, baseName + "_simple.xlsx"); DelegateFiles.BuildSimple(fp, plan, project, by, label); made.Add(fp); }
                    if (pack) { string fp = Path.Combine(folder, baseName + ".html"); DelegateFiles.BuildPack(fp, plan, project, "toolbox", by, label, who ?? "", exportId); made.Add(fp); }
                    data.Issued.Add(new DIssue { ExportId = exportId, When = DateTime.Now.ToString("yyyy-MM-dd HH:mm"), To = label, Folder = folder, Codes = plan.Select(x => x.Code).ToList() });
                    foreach (var t in pool.Where(t => plan.Any(x => x.Code == t.Code))) t.History.Add(Stamp() + "  Sent to " + label);
                }
            }
            catch (Exception e) { Ui.Error(this, "Couldn't make the files.", e); return null; }
            Save(); Render();
            if (made.Count == 0) { Ui.Info(this, "Nothing to send for the people picked."); return null; }
            if (!Ui.TestMode) { try { Shell.Open(folder); } catch (Exception) { } }
            Ui.Info(this, "Made " + made.Count + " file(s):\n" + string.Join("\n", made.Select(Path.GetFileName)) +
                "\n\nThe folder is open – attach the files to an email or Teams message.\n\nWhen they reply:\n• Excel: they save and send the file back → ⬆ Load replies\n• HTML pack: they press Send reply and send you the .txt (or paste the text) → ⬆ Load replies / \U0001F4CB Paste reply");
            return folder;
        }

        /* ---------- load replies ---------- */
        void LoadReplies()
        {
            var files = Ui.PickFiles(this, "Replies (Excel task sheets, reply .txt)|*.xlsx;*.xlsm;*.txt|All files|*.*", "Pick the files people sent back");
            if (files == null) return;
            var replies = new List<DReply>(); var errors = new List<string>();
            foreach (var f in files)
            {
                try { replies.Add(DelegateFiles.ReadFile(f)); }
                catch (IOException) { errors.Add(Path.GetFileName(f) + ": still open in Excel? Close it and try again."); }
                catch (Exception e) { errors.Add(Path.GetFileName(f) + ": " + e.Message); }
            }
            if (errors.Count > 0) Ui.Info(this, "Some files couldn't be read:\n" + string.Join("\n", errors));
            if (replies.Count > 0) Apply(replies);
        }

        void PasteReply()
        {
            var txt = AskLines(this, "Paste reply", "Paste the whole reply message from the HTML task pack (email / Teams):");
            if (string.IsNullOrWhiteSpace(txt)) return;
            try { var r = DelegateFiles.ParseReply(txt); r.File = "pasted reply"; Apply(new List<DReply> { r }); }
            catch (Exception e) { Ui.Error(this, "That isn't a task pack reply.", e); }
        }

        class Change { public string Text; public Action Do; }

        /* works out what changed, shows it, and applies it after a Yes */
        public int Apply(List<DReply> replies)
        {
            var changes = new List<Change>();
            var notFound = new List<string>();
            foreach (var rep in replies)
            {
                string from = rep.From != "" ? rep.From : WhoFromIssue(rep.ExportId) ?? Path.GetFileNameWithoutExtension(rep.File);
                string stamp = Stamp() + " · " + from;
                DTask cur = null; DTask newTask = null;
                int before = changes.Count;
                foreach (var row in rep.Rows)
                {
                    string id = row.Id.Trim();
                    DTask t = data.Tasks.FirstOrDefault(x => string.Equals(x.Code, id, StringComparison.OrdinalIgnoreCase));
                    DSub s = null;
                    if (t == null && id != "" && id.ToUpperInvariant() != "NEW")
                    {
                        foreach (var x in data.Tasks) { s = x.Subs.FirstOrDefault(y => string.Equals(y.Code, id, StringComparison.OrdinalIgnoreCase)); if (s != null) { t = x; break; } }
                        if (s == null) { notFound.Add(from + ": " + id + " " + row.Title); continue; }
                    }
                    if (t != null)
                    {
                        cur = t; newTask = null;
                        var tt = t; var ss = s;
                        bool canStatus = s != null || (t.Subs.Count == 0 && !row.Derived);
                        string oldSt = s != null ? s.Status : t.Status, oldNo = s != null ? s.Notes : t.Notes;
                        string label = (s != null ? s.Code + " " + s.Title : t.Code + " " + t.Title);
                        if (canStatus && St.Contains(row.Status) && row.Status != oldSt)
                        {
                            string v = row.Status;
                            changes.Add(new Change { Text = label + ":  " + oldSt + " → " + v + "   (" + from + ")", Do = () => { if (ss != null) { ss.Status = v; ss.Updated = stamp; } else tt.Status = v; tt.Updated = stamp; tt.History.Add(stamp + "  " + (ss != null ? ss.Code : tt.Code) + " → " + v); } });
                        }
                        if (row.Notes != null && row.Notes.Trim() != (oldNo ?? "").Trim())
                        {
                            string v = row.Notes.Trim();
                            changes.Add(new Change { Text = label + ":  notes → \"" + (v.Length > 60 ? v.Substring(0, 60) + "…" : v) + "\"   (" + from + ")", Do = () => { if (ss != null) { ss.Notes = v; ss.Updated = stamp; } else tt.Notes = v; tt.Updated = stamp; } });
                        }
                        continue;
                    }
                    if (row.Title == "") continue;
                    if (id.ToUpperInvariant() == "NEW")
                    {
                        if (data.Tasks.Any(x => string.Equals(x.Title, row.Title, StringComparison.OrdinalIgnoreCase))) { cur = data.Tasks.First(x => string.Equals(x.Title, row.Title, StringComparison.OrdinalIgnoreCase)); newTask = null; continue; }
                        var nt = new DTask { Id = NewId("t"), Title = row.Title, Group = row.Group, Who = row.Who != "" ? row.Who : (from == "Everyone" ? "" : from), Due = row.Due, Status = St.Contains(row.Status) ? row.Status : "Not started", Notes = (row.Notes ?? "").Trim(), Project = rep.Project != "" ? rep.Project : data.Project, Created = Today, Updated = stamp };
                        newTask = nt; cur = null;
                        changes.Add(new Change { Text = "NEW TASK: " + nt.Title + "   (" + from + ")", Do = () => { nt.Code = NextCode(); nt.History.Add(stamp + "  Added from a reply"); int k = 1; foreach (var x in nt.Subs) x.Code = nt.Code + "." + (k++); data.Tasks.Add(nt); } });
                        continue;
                    }
                    // a row with no ID = a new item under the task above
                    var spec = new DSub { Id = NewId("s"), Title = row.Title, Who = row.Who, Due = row.Due, Status = St.Contains(row.Status) ? row.Status : "Not started", Notes = (row.Notes ?? "").Trim(), Updated = stamp };
                    if (newTask != null) { newTask.Subs.Add(spec); continue; }
                    if (cur == null) { notFound.Add(from + ": \"" + row.Title + "\" (no task above it)"); continue; }
                    if (cur.Subs.Any(x => string.Equals(x.Title, row.Title, StringComparison.OrdinalIgnoreCase))) continue;   // already added before
                    var ct = cur;
                    changes.Add(new Change { Text = "NEW ITEM in " + cur.Code + ": " + row.Title + "   (" + from + ")", Do = () => { spec.Code = NextSubCode(ct); ct.Subs.Add(spec); ct.Updated = stamp; ct.History.Add(stamp + "  Item added: " + spec.Title); } });
                }
                var count = changes.Count - before;
                var r0 = rep;
                changes.Add(new Change { Text = null, Do = () => data.Imports.Add(new DImport { When = DateTime.Now.ToString("yyyy-MM-dd HH:mm"), From = from, File = r0.File, Changes = count }) });
            }
            var real = changes.Where(c => c.Text != null).ToList();
            string msgs = string.Join("\n", replies.Where(r => r.Message != "").Select(r => "✉ " + r.From + ": " + r.Message));
            if (real.Count == 0)
            {
                Ui.Info(this, "No changes in " + (replies.Count == 1 ? "this reply" : "these replies") + "." + (notFound.Count > 0 ? "\n\nNot found here (" + notFound.Count + "):\n" + string.Join("\n", notFound.Take(10)) : "") + (msgs != "" ? "\n\n" + msgs : ""));
                foreach (var c in changes) c.Do();
                Save(); Render();
                return 0;
            }
            string text = real.Count + " change(s):\n\n" + string.Join("\n", real.Take(25).Select(c => "• " + c.Text)) + (real.Count > 25 ? "\n… and " + (real.Count - 25) + " more" : "") +
                (notFound.Count > 0 ? "\n\nNot found here (skipped, " + notFound.Count + "):\n" + string.Join("\n", notFound.Take(8)) : "") +
                (msgs != "" ? "\n\n" + msgs : "") + "\n\nApply these changes?";
            if (!Ui.Confirm(this, text, "Replies")) return 0;
            foreach (var c in changes) c.Do();
            Save(); Render();
            return real.Count;
        }

        string WhoFromIssue(string exportId)
        {
            if (string.IsNullOrEmpty(exportId)) return null;
            var i = data.Issued.FirstOrDefault(x => x.ExportId == exportId);
            return i == null ? null : i.To;
        }

        /* ---------- other ---------- */
        void ExportCsv()
        {
            try
            {
                var rows = new List<string[]> { new[] { "ID", "Task", "Item", "Group", "Project", "Assigned to", "Due", "Status", "Notes", "Last update" } };
                foreach (var t in data.Tasks.OrderBy(x => x.Code))
                {
                    rows.Add(new[] { t.Code, t.Title, "", t.Group, t.Project, t.Who, t.Due, DelegateFiles.StatusOf(t), t.Notes, t.Updated });
                    foreach (var s in t.Subs) rows.Add(new[] { s.Code, "", s.Title, "", "", s.Who, s.Due == "" ? t.Due : s.Due, s.Status, s.Notes, s.Updated });
                }
                string f = Path.Combine(Settings.ExportsDir, "Delegate_all_" + Names.Stamp() + ".csv");
                Csv.Write(f, rows); Shell.Open(f);
            }
            catch (Exception e) { Ui.Error(this, "Couldn't export.", e); }
        }

        void ShowLog()
        {
            var sb = new StringBuilder();
            sb.AppendLine("SENT (last 15)");
            foreach (var i in Enumerable.Reverse(data.Issued).Take(15)) sb.AppendLine("  " + i.When + "  → " + i.To + "  (" + string.Join(", ", i.Codes.Take(6)) + (i.Codes.Count > 6 ? "…" : "") + ")");
            sb.AppendLine(); sb.AppendLine("RECEIVED (last 15)");
            foreach (var i in Enumerable.Reverse(data.Imports).Take(15)) sb.AppendLine("  " + i.When + "  ← " + i.From + "  " + i.Changes + " change(s)  [" + i.File + "]");
            Ui.Info(this, sb.ToString(), "Sent and received");
        }

        void CopyWeb()
        {
            LoadWeb();
            if (web.Count == 0) { Ui.Info(this, "No tasks found in Lew's Tracker's Delegation.json."); return; }
            var have = new HashSet<string>(data.Tasks.Select(t => (t.Title + "|" + t.Project).ToLowerInvariant()));
            var todo = web.Where(t => !have.Contains((t.Title + "|" + t.Project).ToLowerInvariant())).ToList();
            if (todo.Count == 0) { Ui.Info(this, "All of Lew's Tracker's tasks are already in the Toolbox."); return; }
            if (!Ui.Confirm(this, "Copy " + todo.Count + " task(s) from Lew's Tracker into the Toolbox?\n\nThey become Toolbox tasks (the web app is not changed). Same-name tasks already here are skipped.")) return;
            foreach (var w in todo)
            {
                var c = Json.Read<DTask>(Json.Write(w));
                c.FromWeb = false; c.Id = NewId("t");
                if (c.Code == "" || data.Tasks.Any(x => string.Equals(x.Code, c.Code, StringComparison.OrdinalIgnoreCase)))
                {
                    string oldCode = c.Code; c.Code = NextCode();
                    int k = 1; foreach (var s in c.Subs) s.Code = c.Code + "." + (k++);
                    if (oldCode != "") c.Notes = (c.Notes + "\n(was " + oldCode + " in Lew's Tracker)").Trim();
                }
                c.History = new List<string> { Stamp() + "  Copied from Lew's Tracker" };
                data.Tasks.Add(c);
            }
            Save(); view = "list"; Render();
        }
    }
}
