// Lew's Toolbox - Tracker tab: your own work list. Self-contained: everything for this tab is in this one file.
// Data: tracker.json in the data folder.
// Delegated tasks: if the file "delegate-feed.json" exists in the data folder, its tasks are shown here
// (read-only) as "Waiting on <name>". Format: [ { "Title", "Who", "Due" (yyyy-MM-dd), "Status", "Project" } ]
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace LewsToolbox
{
    class TLog { public string Date = ""; public double Hours; }

    class TTask
    {
        public string Id = "", Title = "", Project = "", Due = "", Priority = "Normal", Status = "To do", WaitingOn = "", Notes = "", Repeat = "", Created = "", DoneOn = "";
        public List<TLog> Log = new List<TLog>();
        public long TimerStart;                 // ms since 1970 while a timer runs, else 0
        [System.Web.Script.Serialization.ScriptIgnore] public bool FromDelegate;   // shown from delegate-feed.json (not saved here)
        [System.Web.Script.Serialization.ScriptIgnore] public double Hours { get { return Log == null ? 0 : Log.Sum(l => l.Hours); } }
        [System.Web.Script.Serialization.ScriptIgnore] public bool Done { get { return Status == "Done"; } }
        public TTask Copy() { var c = (TTask)MemberwiseClone(); c.Log = (Log ?? new List<TLog>()).Select(l => new TLog { Date = l.Date, Hours = l.Hours }).ToList(); return c; }
    }

    class TrackerData { public List<TTask> Tasks = new List<TTask>(); public string View = "today"; }

    [Tab("tracker")]
    class TrackerPage : UserControl, IPage
    {
        static readonly string[] Statuses = { "To do", "Doing", "Waiting", "Done" };
        static readonly string[] Priorities = { "High", "Normal", "Low" };
        static readonly string[] Repeats = { "", "Daily", "Weekdays", "Weekly", "Monthly" };
        static readonly string[][] Views =
        {
            new[] { "today", "Today" }, new[] { "week", "This week" }, new[] { "overdue", "Overdue" },
            new[] { "open", "All open" }, new[] { "board", "Board" }, new[] { "done", "Done" }
        };

        TrackerData data;
        List<TTask> feed = new List<TTask>();
        string FileName { get { return Settings.PathOf("tracker.json"); } }
        string FeedFile { get { return Settings.PathOf("delegate-feed.json"); } }

        TextBox quick, search;
        ComboBox project;
        FlowLayoutPanel viewBar;
        Label timerLbl, hint;
        Button timerStop;
        DataGridView grid;
        TableLayoutPanel board;
        Panel body;
        Timer tick;
        List<TTask> shown = new List<TTask>();
        bool filling;

        public TrackerPage()
        {
            LoadData();
            BuildUi();
            Render();
            tick = new Timer { Interval = 1000 };
            tick.Tick += delegate { UpdateTimer(); };
            tick.Start();
            Disposed += delegate { tick.Dispose(); };
        }

        public void OnShown() { LoadFeed(); Render(); if (IsHandleCreated) BeginInvoke(new Action(() => quick.Focus())); }
        public void Reload() { LoadData(); Render(); }

        /* ---------- data ---------- */
        void LoadData()
        {
            data = Json.Load<TrackerData>(FileName);
            if (data.Tasks == null) data.Tasks = new List<TTask>();
            foreach (var t in data.Tasks)
            {
                if (t.Log == null) t.Log = new List<TLog>();
                t.Title = t.Title ?? ""; t.Project = t.Project ?? ""; t.Due = t.Due ?? ""; t.Notes = t.Notes ?? ""; t.WaitingOn = t.WaitingOn ?? ""; t.Repeat = t.Repeat ?? "";
                if (!Statuses.Contains(t.Status)) t.Status = "To do";
                if (!Priorities.Contains(t.Priority)) t.Priority = "Normal";
            }
            LoadFeed();
        }

        void LoadFeed()
        {
            feed = new List<TTask>();
            try
            {
                if (!File.Exists(FeedFile)) return;
                var arr = Json.ReadAny(File.ReadAllText(FeedFile, Encoding.UTF8)) as object[];
                if (arr == null) return;
                foreach (var o in arr)
                {
                    var d = o as Dictionary<string, object>;
                    if (d == null) continue;
                    Func<string, string> g = k => d.ContainsKey(k) && d[k] != null ? Convert.ToString(d[k]) : "";
                    if (g("Status") == "Done" || g("Status") == "Completed") continue;
                    feed.Add(new TTask { Id = "feed:" + g("Id"), Title = g("Title"), WaitingOn = g("Who"), Due = g("Due"), Project = g("Project"), Status = "Waiting", Notes = g("Status"), FromDelegate = true });
                }
            }
            catch (Exception) { }
        }

        void Save()
        {
            try { Json.Save(FileName, data); }
            catch (Exception e) { Ui.Error(this, "Your tasks couldn't be saved to:\n" + FileName, e); }
        }

        static string Today { get { return DateTime.Today.ToString("yyyy-MM-dd"); } }
        static DateTime? D(string s) { DateTime d; return DateTime.TryParseExact(s ?? "", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out d) ? d : (DateTime?)null; }
        static DateTime WeekStart(DateTime d) { int diff = ((int)d.DayOfWeek + 6) % 7; return d.Date.AddDays(-diff); }
        static long Now() { return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds; }
        static string NewId() { return "t" + DateTime.Now.Ticks.ToString("x") + new Random().Next(4096).ToString("x"); }
        static bool Overdue(TTask t) { var d = D(t.Due); return !t.Done && d != null && d.Value < DateTime.Today; }
        static string Nice(string due)
        {
            var d = D(due); if (d == null) return "";
            int days = (int)(d.Value - DateTime.Today).TotalDays;
            if (days == 0) return "Today";
            if (days == 1) return "Tomorrow";
            if (days == -1) return "Yesterday";
            if (days < 0) return d.Value.ToString("ddd d MMM") + "  (" + (-days) + "d late)";
            if (days < 7) return d.Value.ToString("dddd");
            return d.Value.ToString("ddd d MMM" + (d.Value.Year != DateTime.Today.Year ? " yyyy" : ""));
        }

        /* ---------- quick add:  "Check RFI drawings fri #Tower1 !"  ---------- */
        public static TTask Parse(string text, DateTime today)
        {
            var t = new TTask { Id = NewId(), Created = today.ToString("yyyy-MM-dd") };
            var words = new List<string>();
            var parts = text.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries).ToList();
            string[] days = { "mon", "tue", "wed", "thu", "fri", "sat", "sun" };
            for (int i = 0; i < parts.Count; i++)
            {
                string w = parts[i], l = w.ToLowerInvariant().TrimEnd(',', '.');
                DateTime dd;
                if (l == "today" || l == "tod") t.Due = today.ToString("yyyy-MM-dd");
                else if (l == "tomorrow" || l == "tmr" || l == "tom") t.Due = today.AddDays(1).ToString("yyyy-MM-dd");
                else if (l == "next" && i + 1 < parts.Count && parts[i + 1].ToLowerInvariant().StartsWith("week")) { t.Due = WeekStart(today).AddDays(7).ToString("yyyy-MM-dd"); i++; }
                else if (l.Length >= 3 && days.Contains(l.Substring(0, 3)) && (l.Length == 3 || Regex.IsMatch(l, "^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tues|weds|thur|thurs)$")))
                {
                    int want = (Array.IndexOf(days, l.Substring(0, 3)) + 1) % 7, now = (int)today.DayOfWeek;
                    int add = (want - now + 7) % 7; if (add == 0) add = 7;
                    t.Due = today.AddDays(add).ToString("yyyy-MM-dd");
                }
                else if (Regex.IsMatch(l, @"^\d{1,2}/\d{1,2}(/\d{2,4})?$") && DateTime.TryParseExact(l.Count(c => c == '/') == 1 ? l + "/" + today.Year : l,
                    new[] { "d/M/yyyy", "d/M/yy" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out dd))
                {
                    if (l.Count(c => c == '/') == 1 && dd < today.AddDays(-60)) dd = dd.AddYears(1);
                    t.Due = dd.ToString("yyyy-MM-dd");
                }
                else if (w.StartsWith("#") && w.Length > 1) t.Project = w.Substring(1).Replace('_', ' ');
                else if (w.StartsWith("@") && w.Length > 1) { t.WaitingOn = w.Substring(1).Replace('_', ' '); t.Status = "Waiting"; }
                else if (l == "!" || l == "!high" || l == "!!") t.Priority = "High";
                else if (l == "!low") t.Priority = "Low";
                else words.Add(w);
            }
            t.Title = string.Join(" ", words);
            return t;
        }

        /* ---------- layout ---------- */
        void BuildUi()
        {
            var top = Ui.Bar();
            quick = new TextBox { Width = Theme.Px(420), Margin = new Padding(Theme.Px(3), Theme.Px(5), Theme.Px(3), Theme.Px(3)) };
            quick.HandleCreated += delegate { Cue(quick, "Add a task…   e.g.  Check RFI drawings fri #Tower1 !"); };
            quick.KeyDown += (s, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; QuickAdd(); } };
            top.Controls.Add(quick);
            top.Controls.Add(Ui.Btn("+ Add", QuickAdd, "accent"));
            top.Controls.Add(Ui.Btn("+ Detailed…", delegate { Edit(null); }));
            top.Controls.Add(Ui.MenuBtn("Export", ExportMenu));
            var help = Ui.Lbl("?", "muted bold");
            help.Cursor = Cursors.Help;
            new ToolTip { AutoPopDelay = 30000 }.SetToolTip(help,
                "Quick add words:\n  today, tomorrow, mon … sun, next week, 25/11  = due date\n  #Project  = project (use _ for spaces: #Tower_1)\n  !  = high priority,  !low = low\n  @Name  = waiting on someone");
            top.Controls.Add(help);
            top.SetFlowBreak(help, true);

            viewBar = Ui.Bar("bg");
            hint = Ui.Lbl("", "muted");

            var filters = Ui.Bar("bg");
            filters.Controls.Add(Ui.Lbl("Project:"));
            project = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = Theme.Px(160), Margin = new Padding(Theme.Px(3), Theme.Px(5), Theme.Px(3), 0) };
            project.SelectedIndexChanged += delegate { if (!filling) Render(); };
            filters.Controls.Add(project);
            search = new TextBox { Width = Theme.Px(180), Margin = new Padding(Theme.Px(8), Theme.Px(5), Theme.Px(3), 0) };
            search.HandleCreated += delegate { Cue(search, "Search"); };
            search.TextChanged += delegate { Render(); };
            search.KeyDown += (s, e) => { if (e.KeyCode == Keys.Escape) search.Text = ""; };
            filters.Controls.Add(search);
            timerLbl = Ui.Lbl("", "bold");
            timerStop = Ui.Btn("■ Stop timer", StopAnyTimer, "small");
            timerStop.Visible = false;
            filters.Controls.Add(timerLbl);
            filters.Controls.Add(timerStop);
            filters.Controls.Add(hint);

            grid = new DataGridView
            {
                Dock = DockStyle.Fill, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AllowUserToResizeRows = false, ReadOnly = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect, MultiSelect = false
            };
            grid.Columns.Add(new DataGridViewCheckBoxColumn { HeaderText = "✓", Width = Theme.Px(34) });
            grid.Columns.Add(Col("Task", 320, true));
            grid.Columns.Add(Col("Project", 120, false));
            grid.Columns.Add(Col("Due", 150, false));
            grid.Columns.Add(Col("Priority", 70, false));
            grid.Columns.Add(Col("Status", 120, false));
            grid.Columns.Add(Col("Hours", 60, false));
            grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Notes", ReadOnly = true, AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill, MinimumWidth = Theme.Px(120) });
            grid.CurrentCellDirtyStateChanged += delegate { if (grid.CurrentCell is DataGridViewCheckBoxCell) grid.CommitEdit(DataGridViewDataErrorContexts.Commit); };
            grid.CellValueChanged += (s, e) =>
            {
                if (filling || e.RowIndex < 0 || e.ColumnIndex != 0) return;
                var t = At(e.RowIndex); if (t == null) return;
                bool on = grid.Rows[e.RowIndex].Cells[0].Value is bool && (bool)grid.Rows[e.RowIndex].Cells[0].Value;
                BeginInvoke(new Action(() => SetStatus(t, on ? "Done" : "To do")));
            };
            grid.CellDoubleClick += (s, e) => { var t = At(e.RowIndex); if (t != null) Edit(t); };
            grid.MouseUp += (s, e) =>
            {
                if (e.Button != MouseButtons.Right) return;
                var hit = grid.HitTest(e.X, e.Y);
                if (hit.RowIndex < 0) return;
                grid.ClearSelection(); grid.Rows[hit.RowIndex].Selected = true;
                var t = At(hit.RowIndex); if (t != null) TaskMenu(t).Show(grid, e.Location);
            };
            grid.KeyDown += (s, e) =>
            {
                var t = grid.CurrentRow != null ? At(grid.CurrentRow.Index) : null;
                if (t == null) return;
                if (e.KeyCode == Keys.Enter || e.KeyCode == Keys.F2) { e.SuppressKeyPress = true; Edit(t); }
                else if (e.KeyCode == Keys.Delete) { e.SuppressKeyPress = true; Delete(t); }
                else if (e.KeyCode == Keys.Space) { e.SuppressKeyPress = true; SetStatus(t, t.Done ? "To do" : "Done"); }
            };

            board = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, RowCount = 1, Visible = false, Padding = new Padding(Theme.Px(4)) };
            for (int i = 0; i < 4; i++) board.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
            board.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            int lastW = 0;
            board.Resize += delegate { if (board.Visible && Math.Abs(board.Width - lastW) > Theme.Px(30)) { lastW = board.Width; RenderBoard(); } };

            body = new Panel { Dock = DockStyle.Fill };
            body.Controls.Add(grid);
            body.Controls.Add(board);

            Controls.Add(body);
            Controls.Add(filters);
            Controls.Add(viewBar);
            Controls.Add(top);
        }

        static DataGridViewTextBoxColumn Col(string h, int w, bool bold)
        {
            var c = new DataGridViewTextBoxColumn { HeaderText = h, Width = Theme.Px(w), ReadOnly = true };
            if (bold) c.DefaultCellStyle.Font = Theme.UiFont(0, FontStyle.Bold);
            return c;
        }

        [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, string l);
        static void Cue(TextBox t, string text) { try { SendMessage(t.Handle, 0x1501, (IntPtr)1, text); } catch (Exception) { } }

        /* ---------- what to show ---------- */
        IEnumerable<TTask> All { get { return data.Tasks.Concat(feed); } }

        List<TTask> Pick(string view)
        {
            var today = DateTime.Today;
            var weekEnd = WeekStart(today).AddDays(6);
            string proj = project.SelectedIndex > 0 ? (string)project.SelectedItem : null;
            var words = search.Text.ToLowerInvariant().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            IEnumerable<TTask> q = All;
            if (proj != null) q = q.Where(t => t.Project == proj);
            if (words.Length > 0) q = q.Where(t => { string h = (t.Title + " " + t.Project + " " + t.Notes + " " + t.WaitingOn).ToLowerInvariant(); return words.All(w => h.Contains(w)); });
            switch (view)
            {
                case "today": q = q.Where(t => !t.Done && (t.Status == "Doing" || (D(t.Due) != null && D(t.Due).Value <= today))); break;
                case "week": q = q.Where(t => !t.Done && (t.Status == "Doing" || (D(t.Due) != null && D(t.Due).Value <= weekEnd))); break;
                case "overdue": q = q.Where(Overdue); break;
                case "open": case "board": q = q.Where(t => !t.Done || (view == "board" && D(t.DoneOn) != null && D(t.DoneOn).Value >= today.AddDays(-14))); break;
                case "done": return q.Where(t => t.Done).OrderByDescending(t => t.DoneOn).ThenBy(t => t.Title).ToList();
            }
            return q.OrderBy(t => D(t.Due) ?? DateTime.MaxValue).ThenBy(t => Array.IndexOf(Priorities, t.Priority)).ThenBy(t => t.Title).ToList();
        }

        void Render()
        {
            if (viewBar == null) return;
            filling = true;
            // project list
            string keepProj = project.SelectedIndex > 0 ? (string)project.SelectedItem : null;
            var projs = All.Select(t => t.Project).Where(p => p != "").Distinct().OrderBy(p => p).ToList();
            project.Items.Clear(); project.Items.Add("All projects"); foreach (var p in projs) project.Items.Add(p);
            project.SelectedIndex = keepProj != null && projs.Contains(keepProj) ? projs.IndexOf(keepProj) + 1 : 0;
            filling = false;

            // view buttons with counts
            viewBar.SuspendLayout();
            viewBar.Controls.Clear();
            foreach (var v in Views)
            {
                string key = v[0];
                int n = key == "board" ? -1 : Pick(key).Count;
                string tag = (data.View == key ? "on " : "") + (key == "overdue" && n > 0 ? "bold" : "");
                var b = Ui.Btn(v[1] + (n >= 0 && key != "done" ? "  " + n : ""), delegate { data.View = key; Save(); Render(); }, tag);
                viewBar.Controls.Add(b);
            }
            Theme.Apply(viewBar);
            foreach (Control c in viewBar.Controls) if (c.Text.StartsWith("Overdue") && !c.Text.EndsWith(" 0")) c.ForeColor = Theme.Cur.Bad;
            viewBar.ResumeLayout();

            bool isBoard = data.View == "board";
            grid.Visible = !isBoard; board.Visible = isBoard;
            if (isBoard) RenderBoard(); else RenderGrid();
            UpdateTimer();
        }

        TTask At(int i) { return i >= 0 && i < shown.Count ? shown[i] : null; }

        void RenderGrid()
        {
            filling = true;
            shown = Pick(data.View);
            grid.Rows.Clear();
            var th = Theme.Cur;
            foreach (var t in shown)
            {
                string status = t.Status == "Waiting" && t.WaitingOn != "" ? "Waiting on " + t.WaitingOn : t.Status;
                string title = (t.FromDelegate ? "\U0001F4CB " : "") + (t.TimerStart > 0 ? "⏱ " : "") + t.Title + (t.Repeat != "" ? "  ↻" : "");
                int i = grid.Rows.Add(t.Done, title, t.Project, t.Done ? "done " + Nice(t.DoneOn) : Nice(t.Due), t.Priority == "Normal" ? "" : t.Priority, status,
                    t.Hours > 0 ? t.Hours.ToString("0.##") : "", (t.Notes ?? "").Replace("\r", " ").Replace("\n", " "));
                var r = grid.Rows[i];
                if (t.FromDelegate) { r.DefaultCellStyle.ForeColor = th.Muted; r.Cells[0].ReadOnly = true; }
                if (t.Done) r.DefaultCellStyle.ForeColor = th.Muted;
                if (Overdue(t)) r.Cells[3].Style.ForeColor = th.Bad;
                else if (t.Due == Today && !t.Done) { r.Cells[3].Style.ForeColor = th.Accent; r.Cells[3].Style.Font = Theme.UiFont(0, FontStyle.Bold); }
                if (t.Priority == "High") r.Cells[4].Style.ForeColor = th.Bad;
                if (t.Status == "Doing") r.Cells[5].Style.ForeColor = th.Ok;
                if (t.Status == "Waiting") r.Cells[5].Style.ForeColor = th.Warn;
            }
            filling = false;
            hint.Text = shown.Count == 0 ? (data.View == "today" ? "Nothing due today – nice. Type a task above and press Enter." : "Nothing here.")
                : "Double-click = edit  ·  Space = done  ·  Right-click = more";
        }

        /* ---------- board ---------- */
        void RenderBoard()
        {
            board.SuspendLayout();
            board.Controls.Clear();
            var items = Pick("board");
            for (int c = 0; c < 4; c++)
            {
                string st = Statuses[c];
                var col = new Panel { Dock = DockStyle.Fill, Tag = "chip", Margin = new Padding(Theme.Px(4)), Padding = new Padding(Theme.Px(6)) };
                var list = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, AllowDrop = true, Tag = "chip" };
                var mine = items.Where(t => t.Status == st).ToList();
                var head = new Label { Text = st + "  " + mine.Count, Dock = DockStyle.Top, Height = Theme.Px(28), Tag = "bold" };
                int cw = Math.Max(Theme.Px(150), (board.ClientSize.Width / 4) - Theme.Px(40));
                foreach (var t in mine) list.Controls.Add(Card(t, cw));
                list.DragEnter += (s, e) => { e.Effect = e.Data.GetDataPresent(typeof(string)) ? DragDropEffects.Move : DragDropEffects.None; };
                list.DragDrop += (s, e) =>
                {
                    var id = e.Data.GetData(typeof(string)) as string;
                    var t = data.Tasks.FirstOrDefault(x => x.Id == id);
                    if (t != null && t.Status != st) BeginInvoke(new Action(() => SetStatus(t, st)));
                };
                col.Controls.Add(list);
                col.Controls.Add(head);
                board.Controls.Add(col, c, 0);
            }
            Theme.Apply(board);
            board.ResumeLayout();
            hint.Text = "Drag cards between columns  ·  Double-click a card to edit  ·  Done shows the last 14 days";
        }

        Control Card(TTask t, int width)
        {
            var th = Theme.Cur;
            int inner = width - Theme.Px(18);
            var card = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, Tag = "panel",
                Padding = new Padding(Theme.Px(8)), Margin = new Padding(0, 0, 0, Theme.Px(6)), Cursor = Cursors.Hand,
                MinimumSize = new Size(width, 0), MaximumSize = new Size(width, 0)
            };
            var title = new Label { Text = (t.FromDelegate ? "\U0001F4CB " : "") + (t.Priority == "High" ? "! " : "") + t.Title, AutoSize = true, MaximumSize = new Size(inner, 0), Tag = "bold" };
            var sub = new List<string>();
            if (t.Project != "") sub.Add(t.Project);
            if (t.Due != "" && !t.Done) sub.Add(Nice(t.Due));
            if (t.WaitingOn != "" && t.Status == "Waiting") sub.Add("@" + t.WaitingOn);
            if (t.Hours > 0) sub.Add(t.Hours.ToString("0.#") + "h");
            var info = new Label { Text = string.Join("  \u00B7  ", sub), AutoSize = true, MaximumSize = new Size(inner, 0), Tag = "muted small" };
            card.Controls.Add(title);
            if (sub.Count > 0) card.Controls.Add(info);
            Theme.Apply(card);
            if (Overdue(t)) info.ForeColor = th.Bad;
            card.Paint += (s, e) => { using (var p = new Pen(t.Priority == "High" ? th.Bad : th.Line, th.Retro ? 2 : 1)) e.Graphics.DrawRectangle(p, 0, 0, card.Width - 1, card.Height - 1); };
            Action<Control> wire = null;
            wire = c =>
            {
                c.MouseDown += (s, e) => { if (e.Button == MouseButtons.Left && e.Clicks == 1 && !t.FromDelegate) card.DoDragDrop(t.Id, DragDropEffects.Move); };
                c.DoubleClick += delegate { if (!t.FromDelegate) Edit(t); };
                c.MouseUp += (s, e) => { if (e.Button == MouseButtons.Right && !t.FromDelegate) TaskMenu(t).Show(c, e.Location); };
                foreach (Control k in c.Controls) wire(k);
            };
            wire(card);
            return card;
        }

        /* ---------- actions ---------- */
        void QuickAdd()
        {
            string s = quick.Text.Trim();
            if (s == "") { quick.Focus(); return; }
            var t = Parse(s, DateTime.Today);
            if (t.Title == "") { Ui.Info(this, "Type what the task is, e.g.  Check RFI drawings fri #Tower1"); return; }
            if (project.SelectedIndex > 0 && t.Project == "") t.Project = (string)project.SelectedItem;
            if (t.Due == "" && data.View == "today") t.Due = Today;      // added in Today view = due today
            data.Tasks.Add(t);
            Save();
            quick.Text = "";
            Render();
            hint.Text = "Added: " + t.Title + (t.Due != "" ? "  ·  due " + Nice(t.Due) : "") + (t.Project != "" ? "  ·  " + t.Project : "");
        }

        void SetStatus(TTask t, string st)
        {
            if (t.FromDelegate) { Render(); return; }
            if (t.TimerStart > 0 && st == "Done") StopTimer(t);
            bool wasDone = t.Done;
            t.Status = st;
            if (st == "Done" && !wasDone)
            {
                t.DoneOn = Today;
                var next = NextRepeat(t);
                if (next != null) { data.Tasks.Add(next); hint.Text = "Repeats – next one is due " + Nice(next.Due); }
            }
            if (st != "Done") t.DoneOn = "";
            Save(); Render();
        }

        static TTask NextRepeat(TTask t)
        {
            if (string.IsNullOrEmpty(t.Repeat)) return null;
            var from = D(t.Due) ?? DateTime.Today;
            DateTime n;
            switch (t.Repeat)
            {
                case "Daily": n = from.AddDays(1); break;
                case "Weekdays": n = from.AddDays(1); while (n.DayOfWeek == DayOfWeek.Saturday || n.DayOfWeek == DayOfWeek.Sunday) n = n.AddDays(1); break;
                case "Weekly": n = from.AddDays(7); break;
                case "Monthly": n = from.AddMonths(1); break;
                default: return null;
            }
            if (n < DateTime.Today) n = DateTime.Today;
            var c = t.Copy();
            c.Id = NewId(); c.Status = "To do"; c.DoneOn = ""; c.Due = n.ToString("yyyy-MM-dd"); c.Log = new List<TLog>(); c.TimerStart = 0; c.Created = Today;
            return c;
        }

        void Delete(TTask t)
        {
            if (t.FromDelegate) return;
            if (!Ui.Confirm(this, "Delete the task \"" + t.Title + "\"?")) return;
            data.Tasks.Remove(t); Save(); Render();
        }

        ContextMenuStrip TaskMenu(TTask t)
        {
            var m = Theme.Menu();
            if (t.FromDelegate)
            {
                Theme.Item(m, "From the Delegate tab – change it there", () => MainForm.Me.Show("delegate"));
                return m;
            }
            Theme.Item(m, "Edit…", () => Edit(t)).Font = Theme.UiFont(0, FontStyle.Bold);
            m.Items.Add(new ToolStripSeparator());
            foreach (var st in Statuses)
            {
                string s = st;
                var it = Theme.Item(m, (st == "Done" ? "✓ " : "") + st, () =>
                {
                    if (s == "Waiting" && t.WaitingOn == "") { var who = Ui.Ask(this, "Waiting on", "Who are you waiting on?"); if (who == null) return; t.WaitingOn = who; }
                    SetStatus(t, s);
                });
                it.Checked = t.Status == st;
            }
            m.Items.Add(new ToolStripSeparator());
            var due = new ToolStripMenuItem("Due") { ForeColor = Theme.Cur.Text };
            foreach (var d in new[] { new[] { "Today", "0" }, new[] { "Tomorrow", "1" }, new[] { "Next Monday", "mon" }, new[] { "In a week", "7" }, new[] { "No date", "" } })
            {
                string code = d[1];
                var sub = new ToolStripMenuItem(d[0]) { ForeColor = Theme.Cur.Text };
                sub.Click += delegate
                {
                    t.Due = code == "" ? "" : code == "mon" ? WeekStart(DateTime.Today).AddDays(7).ToString("yyyy-MM-dd") : DateTime.Today.AddDays(int.Parse(code)).ToString("yyyy-MM-dd");
                    Save(); Render();
                };
                due.DropDownItems.Add(sub);
            }
            m.Items.Add(due);
            if (t.TimerStart > 0) Theme.Item(m, "■ Stop timer", () => { StopTimer(t); Save(); Render(); });
            else Theme.Item(m, "⏱ Start timer", () => StartTimer(t));
            Theme.Item(m, "+ Add time…", () => AddTime(t));
            m.Items.Add(new ToolStripSeparator());
            Theme.Item(m, "Duplicate", () => { var c = t.Copy(); c.Id = NewId(); c.Status = "To do"; c.DoneOn = ""; c.Log = new List<TLog>(); c.TimerStart = 0; c.Created = Today; data.Tasks.Add(c); Save(); Render(); });
            Theme.Item(m, "Delete", () => Delete(t));
            return m;
        }

        /* ---------- time ---------- */
        void StartTimer(TTask t)
        {
            foreach (var x in data.Tasks.Where(x => x.TimerStart > 0).ToList()) StopTimer(x);
            t.TimerStart = Now();
            if (t.Status == "To do") t.Status = "Doing";
            Save(); Render();
        }

        static void StopTimer(TTask t)
        {
            if (t.TimerStart <= 0) return;
            double h = (Now() - t.TimerStart) / 3600000.0;
            t.TimerStart = 0;
            if (h >= 1.0 / 60) t.Log.Add(new TLog { Date = DateTime.Today.ToString("yyyy-MM-dd"), Hours = Math.Round(h, 2) });
        }

        void StopAnyTimer()
        {
            foreach (var x in data.Tasks.Where(x => x.TimerStart > 0).ToList()) StopTimer(x);
            Save(); Render();
        }

        void UpdateTimer()
        {
            var run = data.Tasks.FirstOrDefault(x => x.TimerStart > 0);
            if (run == null) { if (timerLbl.Text != "") { timerLbl.Text = ""; timerStop.Visible = false; } return; }
            var span = TimeSpan.FromMilliseconds(Now() - run.TimerStart);
            timerLbl.Text = "⏱ " + run.Title + "  " + (int)span.TotalHours + ":" + span.Minutes.ToString("00") + ":" + span.Seconds.ToString("00");
            timerStop.Visible = true;
        }

        void AddTime(TTask t)
        {
            var a = Ui.Ask(this, "Add time", "Hours spent on \"" + t.Title + "\" today (e.g. 1.5 or 0:45):", "");
            double h = ParseHours(a);
            if (h <= 0) return;
            t.Log.Add(new TLog { Date = Today, Hours = h });
            Save(); Render();
        }

        public static double ParseHours(string a)
        {
            if (string.IsNullOrEmpty(a)) return 0;
            a = a.Trim().ToLowerInvariant().Replace("h", "");
            var p = a.Split(':');
            int hh, mm; double d;
            if (p.Length == 2 && int.TryParse(p[0], out hh) && int.TryParse(p[1], out mm)) return hh + mm / 60.0;
            if (double.TryParse(a.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out d)) return d;
            return 0;
        }

        /* ---------- edit dialog ---------- */
        void Edit(TTask t)
        {
            if (t != null && t.FromDelegate) return;
            bool isNew = t == null;
            var w = isNew ? new TTask { Id = NewId(), Created = Today, Due = data.View == "today" ? Today : "", Project = project.SelectedIndex > 0 ? (string)project.SelectedItem : "" } : t.Copy();
            using (var f = new Form())
            {
                f.Text = isNew ? "New task" : "Edit task";
                f.FormBorderStyle = FormBorderStyle.FixedDialog; f.MaximizeBox = false; f.MinimizeBox = false; f.ShowInTaskbar = false;
                f.StartPosition = FormStartPosition.CenterParent; f.AutoSize = true; f.AutoSizeMode = AutoSizeMode.GrowAndShrink;
                var tl = new TableLayoutPanel { ColumnCount = 2, AutoSize = true, Padding = new Padding(Theme.Px(12)) };
                int W = Theme.Px(380);
                var title = new TextBox { Text = w.Title, Width = W };
                var proj = new ComboBox { Text = w.Project, Width = W };
                foreach (var p in All.Select(x => x.Project).Where(p => p != "").Distinct().OrderBy(p => p)) proj.Items.Add(p);
                proj.Text = w.Project;
                var due = new DateTimePicker { Format = DateTimePickerFormat.Custom, CustomFormat = "ddd d MMM yyyy", ShowCheckBox = true, Width = Theme.Px(200) };
                var dd = D(w.Due); due.Value = dd ?? DateTime.Today; due.Checked = dd != null;
                var prio = Combo(Priorities, w.Priority);
                var stat = Combo(Statuses, w.Status);
                var waiting = new TextBox { Text = w.WaitingOn, Width = Theme.Px(200) };
                var rep = Combo(Repeats, w.Repeat); rep.Items[0] = "(no repeat)"; if (w.Repeat == "") rep.SelectedIndex = 0;
                var notes = new TextBox { Text = w.Notes, Width = W, Height = Theme.Px(90), Multiline = true, ScrollBars = ScrollBars.Vertical, AcceptsReturn = true };
                var time = new Label { AutoSize = true, Margin = new Padding(0, Theme.Px(7), 0, 0) };
                Action showTime = () => time.Text = w.Hours > 0 ? w.Hours.ToString("0.##") + " h logged (" + w.Log.Count + " entr" + (w.Log.Count == 1 ? "y" : "ies") + ")" : "No time logged";
                showTime();
                var timeRow = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0) };
                var addH = new TextBox { Width = Theme.Px(60) };
                timeRow.Controls.Add(time);
                timeRow.Controls.Add(new Label { Text = "   Add:", AutoSize = true, Margin = new Padding(0, Theme.Px(7), 0, 0) });
                timeRow.Controls.Add(addH);
                timeRow.Controls.Add(Ui.Btn("+ h", delegate { double h = ParseHours(addH.Text); if (h > 0) { w.Log.Add(new TLog { Date = Today, Hours = h }); addH.Text = ""; showTime(); } }, "small"));

                Row(tl, "Task", title); Row(tl, "Project", proj); Row(tl, "Due", due); Row(tl, "Priority", prio); Row(tl, "Status", stat);
                Row(tl, "Waiting on", waiting); Row(tl, "Repeat", rep); Row(tl, "Notes", notes); Row(tl, "Time", timeRow);
                var btns = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.RightToLeft, Dock = DockStyle.Fill };
                var cancel = Ui.Btn("Cancel", null); cancel.DialogResult = DialogResult.Cancel;
                var ok = Ui.Btn(isNew ? "Add" : "Save", null, "accent");
                ok.Click += delegate
                {
                    if (title.Text.Trim() == "") { MessageBox.Show(f, "Type what the task is."); return; }
                    f.DialogResult = DialogResult.OK;
                };
                btns.Controls.Add(cancel); btns.Controls.Add(ok);
                if (!isNew) { var del = Ui.Btn("Delete", delegate { f.DialogResult = DialogResult.Abort; }); btns.Controls.Add(del); }
                int br = tl.RowCount++; tl.Controls.Add(btns, 0, br); tl.SetColumnSpan(btns, 2);
                f.Controls.Add(tl);
                f.AcceptButton = ok; f.CancelButton = cancel;
                Theme.Apply(f);
                f.Shown += delegate { title.Focus(); title.SelectionStart = title.Text.Length; };
                var res = f.ShowDialog(this);
                if (res == DialogResult.Abort) { Delete(t); return; }
                if (res != DialogResult.OK) return;
                w.Title = title.Text.Trim(); w.Project = proj.Text.Trim(); w.Due = due.Checked ? due.Value.ToString("yyyy-MM-dd") : "";
                w.Priority = (string)prio.SelectedItem; w.WaitingOn = waiting.Text.Trim(); w.Notes = notes.Text.Trim();
                w.Repeat = rep.SelectedIndex <= 0 ? "" : (string)rep.SelectedItem;
                string newStatus = (string)stat.SelectedItem;
                if (newStatus == "Waiting" && w.WaitingOn == "") { }
                if (isNew) { w.Status = newStatus; if (w.Done) w.DoneOn = Today; data.Tasks.Add(w); Save(); Render(); }
                else
                {
                    string old = t.Status;
                    w.Status = old;
                    data.Tasks[data.Tasks.IndexOf(t)] = w;
                    if (newStatus != old) SetStatus(w, newStatus); else { Save(); Render(); }
                }
            }
        }

        static ComboBox Combo(string[] items, string sel)
        {
            var c = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = Theme.Px(200) };
            foreach (var i in items) c.Items.Add(i);
            c.SelectedIndex = Math.Max(0, Array.IndexOf(items, sel));
            return c;
        }

        static void Row(TableLayoutPanel t, string label, Control c)
        {
            int r = t.RowCount++;
            t.Controls.Add(new Label { Text = label, AutoSize = true, Margin = new Padding(0, Theme.Px(7), Theme.Px(10), 0) }, 0, r);
            t.Controls.Add(c, 1, r);
        }

        /* ---------- weekly summary / export ---------- */
        ContextMenuStrip ExportMenu()
        {
            var m = Theme.Menu();
            Theme.Item(m, "\U0001F4CB Copy this week's summary (for email / Teams)", () =>
            {
                try { Clipboard.SetText(WeeklyText()); Ui.Info(this, "This week's summary is copied – paste it into an email or Teams."); }
                catch (Exception e) { Ui.Error(this, "Couldn't copy.", e); }
            });
            Theme.Item(m, "Weekly summary → Excel (CSV)", () => ExportCsv(true));
            Theme.Item(m, "All tasks → Excel (CSV)", () => ExportCsv(false));
            return m;
        }

        public string WeeklyText()
        {
            var ws = WeekStart(DateTime.Today); var we = ws.AddDays(6);
            Func<TTask, bool> inWeek = t => { var d = D(t.DoneOn); return d != null && d.Value >= ws && d.Value <= we; };
            var done = data.Tasks.Where(t => t.Done && inWeek(t)).OrderBy(t => t.Project).ThenBy(t => t.DoneOn).ToList();
            var open = data.Tasks.Where(t => !t.Done && D(t.Due) != null && D(t.Due).Value <= we).OrderBy(t => t.Due).ToList();
            var waiting = All.Where(t => !t.Done && t.Status == "Waiting").OrderBy(t => t.WaitingOn).ToList();
            var hours = data.Tasks.SelectMany(t => t.Log.Where(l => D(l.Date) != null && D(l.Date).Value >= ws && D(l.Date).Value <= we).Select(l => new { P = t.Project == "" ? "(no project)" : t.Project, l.Hours }))
                .GroupBy(x => x.P).Select(g => new { P = g.Key, H = g.Sum(x => x.Hours) }).OrderByDescending(x => x.H).ToList();
            var sb = new StringBuilder();
            sb.AppendLine("Week " + ws.ToString("d MMM") + " – " + we.ToString("d MMM yyyy") + (string.IsNullOrEmpty(Settings.D.UserName) ? "" : "  (" + Settings.D.UserName + ")"));
            sb.AppendLine();
            sb.AppendLine("DONE (" + done.Count + ")");
            foreach (var t in done) sb.AppendLine("  • " + t.Title + (t.Project != "" ? "  [" + t.Project + "]" : ""));
            sb.AppendLine();
            sb.AppendLine("STILL OPEN – due this week or late (" + open.Count + ")");
            foreach (var t in open) sb.AppendLine("  • " + t.Title + "  – " + Nice(t.Due) + (t.Project != "" ? "  [" + t.Project + "]" : ""));
            if (waiting.Count > 0)
            {
                sb.AppendLine();
                sb.AppendLine("WAITING ON OTHERS (" + waiting.Count + ")");
                foreach (var t in waiting) sb.AppendLine("  • " + t.Title + " – " + (t.WaitingOn == "" ? "?" : t.WaitingOn) + (t.Due != "" ? ", due " + Nice(t.Due) : ""));
            }
            if (hours.Count > 0)
            {
                sb.AppendLine();
                sb.AppendLine("TIME (" + hours.Sum(h => h.H).ToString("0.#") + " h)");
                foreach (var h in hours) sb.AppendLine("  • " + h.P + ": " + h.H.ToString("0.#") + " h");
            }
            return sb.ToString();
        }

        void ExportCsv(bool weekly)
        {
            try
            {
                var rows = new List<string[]>();
                string name;
                if (weekly)
                {
                    rows.Add(new[] { "Weekly summary" });
                    foreach (var line in WeeklyText().Replace("\r", "").Split('\n')) rows.Add(new[] { line.Trim().TrimStart('•').Trim() });
                    name = "Tracker_week_" + WeekStart(DateTime.Today).ToString("yyyy-MM-dd") + "_" + Names.Stamp() + ".csv";
                }
                else
                {
                    rows.Add(new[] { "Task", "Project", "Due", "Priority", "Status", "Waiting on", "Repeat", "Hours", "Done on", "Created", "Notes" });
                    rows.AddRange(data.Tasks.OrderBy(t => t.Done).ThenBy(t => D(t.Due) ?? DateTime.MaxValue).Select(t => new[] { t.Title, t.Project, t.Due, t.Priority, t.Status, t.WaitingOn, t.Repeat, t.Hours > 0 ? t.Hours.ToString("0.##") : "", t.DoneOn, t.Created, t.Notes }));
                    name = "Tracker_all_" + Names.Stamp() + ".csv";
                }
                string f = Path.Combine(Settings.ExportsDir, name);
                Csv.Write(f, rows);
                Shell.Open(f);
            }
            catch (Exception e) { Ui.Error(this, "Couldn't export.", e); }
        }
    }
}
