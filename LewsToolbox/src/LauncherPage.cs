// Lew's Toolbox - Launcher tab: one-click launcher for apps, files, folders and web links (QuickLaunch, as a program).
using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace LewsToolbox
{
    class LItem
    {
        public string Id = "", Name = "", Path = "", Type = "file", Group = "", Desc = "", From = "", Date = "";
        public int Opened;
        public long Last;      // when last opened (ms since 1970, same as QuickLaunch)
        public LItem Copy() { return (LItem)MemberwiseClone(); }
    }

    class LibraryData
    {
        public List<LItem> Items = new List<LItem>();
        public List<string> Groups = new List<string>();
        public string View = "list";            // list | icons
        public bool Grouped;
        public string SortKey = "name";
        public int SortDir = 1;
    }

    class LauncherPage : UserControl, IPage
    {
        LibraryData lib;
        string FileName { get { return Settings.PathOf("launcher.json"); } }
        TextBox search;
        FlowLayoutPanel groupStrip;
        ListView lv;
        ImageList small, large;
        Label count, hint;
        Button viewBtn, groupedBtn;
        string groupFilter = "";            // "" = all
        readonly Dictionary<string, bool> missing = new Dictionary<string, bool>();
        int checkRun;

        static readonly string[][] Cols =
        {
            new[] { "name", "Name", "220" }, new[] { "group", "Group", "110" }, new[] { "desc", "Description", "220" }, new[] { "from", "From", "110" },
            new[] { "date", "Date", "90" }, new[] { "opened", "Opened", "65" }, new[] { "last", "Last opened", "120" }, new[] { "path", "Location", "320" }
        };

        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, string l);

        public LauncherPage()
        {
            lib = Json.Load<LibraryData>(FileName);
            Clean();
            BuildUi();
            Render();
            HandleCreated += delegate { CheckMissing(); };
        }

        public void OnShown() { if (IsHandleCreated) BeginInvoke(new Action(() => search.Focus())); }
        public void Reload() { lib = Json.Load<LibraryData>(FileName); Clean(); groupFilter = ""; missing.Clear(); RenderGroups(); Render(); CheckMissing(); }

        void Clean()
        {
            if (lib.Items == null) lib.Items = new List<LItem>();
            if (lib.Groups == null) lib.Groups = new List<string>();
            foreach (var it in lib.Items)
            {
                it.Name = it.Name ?? ""; it.Path = it.Path ?? ""; it.Group = it.Group ?? ""; it.Desc = it.Desc ?? ""; it.From = it.From ?? ""; it.Date = it.Date ?? "";
                if (string.IsNullOrEmpty(it.Id)) it.Id = NewId();
                if (it.Group != "" && !lib.Groups.Contains(it.Group)) lib.Groups.Add(it.Group);
            }
        }

        void Save()
        {
            try { Json.Save(FileName, lib); }
            catch (Exception e) { Ui.Error(this, "Your launcher list couldn't be saved to:\n" + FileName, e); }
        }

        static string NewId() { return "i" + DateTime.Now.Ticks.ToString("x") + new Random().Next(4096).ToString("x"); }
        static long Now() { return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds; }
        static string When(long ms) { return ms <= 0 ? "" : new DateTime(1970, 1, 1).AddMilliseconds(ms).ToLocalTime().ToString("dd MMM yyyy HH:mm"); }

        /* ---------- layout ---------- */
        void BuildUi()
        {
            var top = Ui.Bar();
            search = new TextBox { Width = Theme.Px(260), Margin = new Padding(Theme.Px(3), Theme.Px(5), Theme.Px(8), Theme.Px(3)) };
            HandleCreated += delegate { try { SendMessage(search.Handle, 0x1501, (IntPtr)1, "Search (just start typing)"); } catch (Exception) { } };
            search.TextChanged += delegate { Render(); };
            search.KeyDown += SearchKeys;
            top.Controls.Add(search);
            top.Controls.Add(Ui.MenuBtn("+ Add", AddMenu, "accent"));
            top.Controls.Add(Ui.Btn("+ Group", () => NewGroup()));
            viewBtn = Ui.Btn("", delegate { lib.View = lib.View == "list" ? "icons" : "list"; Save(); Render(); });
            groupedBtn = Ui.Btn("", delegate { lib.Grouped = !lib.Grouped; Save(); Render(); });
            top.Controls.Add(viewBtn);
            top.Controls.Add(groupedBtn);
            top.Controls.Add(Ui.MenuBtn("Import / Export", ExcelMenu));
            count = Ui.Lbl("", "muted");
            top.Controls.Add(count);

            groupStrip = Ui.Bar("bg");

            small = new ImageList { ColorDepth = ColorDepth.Depth32Bit, ImageSize = new Size(Theme.Px(16), Theme.Px(16)) };
            large = new ImageList { ColorDepth = ColorDepth.Depth32Bit, ImageSize = new Size(Theme.Px(32), Theme.Px(32)) };
            lv = new ListView
            {
                Dock = DockStyle.Fill, FullRowSelect = true, HideSelection = false, MultiSelect = false, SmallImageList = small, LargeImageList = large,
                Activation = ItemActivation.OneClick, HotTracking = false, AllowDrop = true, ShowItemToolTips = true
            };
            foreach (var c in Cols) lv.Columns.Add(c[1], Theme.Px(int.Parse(c[2])));
            lv.ItemActivate += delegate { var it = Sel(); if (it != null) OpenItem(it); };
            lv.ColumnClick += (s, e) =>
            {
                string k = Cols[e.Column][0];
                if (lib.SortKey == k) lib.SortDir = -lib.SortDir; else { lib.SortKey = k; lib.SortDir = 1; }
                Save(); Render();
            };
            lv.MouseUp += (s, e) =>
            {
                if (e.Button != MouseButtons.Right) return;
                var hit = lv.HitTest(e.Location);
                if (hit.Item != null) { hit.Item.Selected = true; ItemMenu((LItem)hit.Item.Tag).Show(lv, e.Location); }
                else BlankMenu().Show(lv, e.Location);
            };
            lv.KeyDown += ListKeys;
            lv.KeyPress += (s, e) =>
            {
                if (!char.IsControl(e.KeyChar)) { search.Focus(); search.Text += e.KeyChar; search.SelectionStart = search.Text.Length; e.Handled = true; }
            };
            lv.DragEnter += (s, e) => { e.Effect = e.Data.GetDataPresent(DataFormats.FileDrop) || e.Data.GetDataPresent(DataFormats.Text) ? DragDropEffects.Link : DragDropEffects.None; };
            lv.DragDrop += (s, e) =>
            {
                var files = e.Data.GetData(DataFormats.FileDrop) as string[];
                if (files != null) AddPaths(files.ToList());
                else { var t = e.Data.GetData(DataFormats.Text) as string; if (t != null) AddFromText(t); }
            };

            hint = new Label
            {
                Dock = DockStyle.Bottom, Height = Theme.Px(26), Tag = "muted small", TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(Theme.Px(8), 0, 0, 0),
                Text = "Click = open  ·  Right-click = more  ·  Ctrl+V = add a copied path or link  ·  Drag files here to add  ·  Enter in search = open top result"
            };

            Controls.Add(lv);
            Controls.Add(hint);
            Controls.Add(groupStrip);
            Controls.Add(top);
            RenderGroups();
        }

        void RenderGroups()
        {
            groupStrip.SuspendLayout();
            groupStrip.Controls.Clear();
            groupStrip.Controls.Add(GroupBtn("All", ""));
            foreach (var g in lib.Groups) groupStrip.Controls.Add(GroupBtn(g, g));
            if (lib.Items.Any(i => i.Group == "") && lib.Groups.Count > 0) groupStrip.Controls.Add(GroupBtn("(No group)", "\u0000"));
            Theme.Apply(groupStrip);
            groupStrip.ResumeLayout();
        }

        Button GroupBtn(string text, string key)
        {
            int n = key == "" ? lib.Items.Count : lib.Items.Count(i => key == "\u0000" ? i.Group == "" : i.Group == key);
            var b = Ui.Btn(text + "  " + n, delegate { groupFilter = key; RenderGroups(); Render(); }, groupFilter == key ? "on small" : "small");
            if (key != "" && key != "\u0000")
            {
                b.MouseUp += (s, e) =>
                {
                    if (e.Button != MouseButtons.Right) return;
                    var m = Theme.Menu();
                    Theme.Item(m, "Rename group...", () => RenameGroup(key));
                    Theme.Item(m, "Move left", () => MoveGroup(key, -1));
                    Theme.Item(m, "Move right", () => MoveGroup(key, 1));
                    m.Items.Add(new ToolStripSeparator());
                    Theme.Item(m, "Delete group (keeps the items)", () => DeleteGroup(key));
                    m.Show(b, e.Location);
                };
            }
            return b;
        }

        /* ---------- list ---------- */
        List<LItem> Shown_()
        {
            IEnumerable<LItem> q = lib.Items;
            if (groupFilter == "\u0000") q = q.Where(i => i.Group == "");
            else if (groupFilter != "") q = q.Where(i => i.Group == groupFilter);
            var words = search.Text.ToLowerInvariant().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (words.Length > 0)
                q = q.Where(i => { string hay = (i.Name + " " + i.Desc + " " + i.From + " " + i.Group + " " + i.Path + " " + i.Date).ToLowerInvariant(); return words.All(w => hay.Contains(w)); });
            Func<LItem, IComparable> key;
            switch (lib.SortKey)
            {
                case "group": key = i => i.Group.ToLowerInvariant(); break;
                case "desc": key = i => i.Desc.ToLowerInvariant(); break;
                case "from": key = i => i.From.ToLowerInvariant(); break;
                case "date": key = i => i.Date; break;
                case "opened": key = i => i.Opened; break;
                case "last": key = i => i.Last; break;
                case "path": key = i => i.Path.ToLowerInvariant(); break;
                default: key = i => i.Name.ToLowerInvariant(); break;
            }
            var list = lib.SortDir >= 0 ? q.OrderBy(key).ThenBy(i => i.Name.ToLowerInvariant()) : q.OrderByDescending(key).ThenBy(i => i.Name.ToLowerInvariant());
            // when searching, best match (name starts with the text) first
            if (words.Length > 0) return list.OrderBy(i => i.Name.ToLowerInvariant().StartsWith(words[0]) ? 0 : 1).ToList();
            return list.ToList();
        }

        void Render()
        {
            var items = Shown_();
            lv.BeginUpdate();
            lv.Items.Clear();
            lv.Groups.Clear();
            lv.View = lib.View == "icons" ? View.LargeIcon : View.Details;
            lv.ShowGroups = lib.Grouped;
            var groups = new Dictionary<string, ListViewGroup>();
            if (lib.Grouped)
            {
                foreach (var g in lib.Groups) { var lg = new ListViewGroup(g, g); groups[g] = lg; lv.Groups.Add(lg); }
                var none = new ListViewGroup("", "No group"); groups[""] = none; lv.Groups.Add(none);
            }
            foreach (var it in items)
            {
                var row = new ListViewItem(it.Name) { Tag = it, ImageKey = IconKey(it) };
                row.SubItems.Add(it.Group); row.SubItems.Add(it.Desc); row.SubItems.Add(it.From); row.SubItems.Add(it.Date);
                row.SubItems.Add(it.Opened > 0 ? it.Opened.ToString() : ""); row.SubItems.Add(When(it.Last)); row.SubItems.Add(it.Path);
                bool miss = missing.ContainsKey(it.Id) && missing[it.Id];
                if (miss) { row.ForeColor = Theme.Cur.Bad; row.SubItems[7].Text = "NOT FOUND - " + it.Path; }
                row.ToolTipText = it.Name + (it.Desc != "" ? "\n" + it.Desc : "") + "\n" + it.Path + (miss ? "\n\nNOT FOUND - right-click > Edit to fix the location" : "")
                    + (it.Opened > 0 ? "\nOpened " + it.Opened + " time" + (it.Opened == 1 ? "" : "s") : "");
                if (lib.Grouped) row.Group = groups.ContainsKey(it.Group) ? groups[it.Group] : groups[""];
                lv.Items.Add(row);
            }
            lv.EndUpdate();
            for (int i = 0; i < Cols.Length; i++)
                lv.Columns[i].Text = Cols[i][1] + (lib.SortKey == Cols[i][0] ? (lib.SortDir >= 0 ? " ▲" : " ▼") : "");
            viewBtn.Text = lib.View == "list" ? "▦ Icons" : "☰ List";
            groupedBtn.Text = lib.Grouped ? "▤ Grouped" : "☰ All in one";
            count.Text = items.Count == lib.Items.Count ? items.Count + " items" : items.Count + " of " + lib.Items.Count;
            if (lib.Items.Count == 0) count.Text = "Empty - click + Add, or Ctrl+V a copied path";
        }

        LItem Sel() { return lv.SelectedItems.Count > 0 ? (LItem)lv.SelectedItems[0].Tag : null; }

        /* ---------- icons ---------- */
        string IconKey(LItem it)
        {
            string key, probe; bool folder = false;
            if (it.Type == "web") { key = "::web"; probe = "x.url"; }
            else if (it.Type == "folder") { key = "::folder"; probe = "folder"; folder = true; }
            else
            {
                string ext = "";
                try { ext = System.IO.Path.GetExtension(it.Path).ToLowerInvariant(); } catch (Exception) { }
                key = "ext" + ext; probe = "x" + (ext == "" ? ".txt" : ext);
            }
            if (!small.Images.ContainsKey(key))
            {
                var s = Shell.IconFor(probe, false, folder); var l = Shell.IconFor(probe, true, folder);
                if (s != null) small.Images.Add(key, s);
                if (l != null) large.Images.Add(key, l);
            }
            // programs and shortcuts get their own icon once we know the file is there
            string own = "own:" + it.Path.ToLowerInvariant();
            if (small.Images.ContainsKey(own)) return own;
            return key;
        }

        static bool OwnIcon(LItem it)
        {
            string e = "";
            try { e = System.IO.Path.GetExtension(it.Path).ToLowerInvariant(); } catch (Exception) { }
            return it.Type == "file" && (e == ".exe" || e == ".lnk" || e == ".ico" || e == ".appref-ms");
        }

        /* Checks in the background which items can't be found (so a slow network drive never freezes the window) */
        void CheckMissing()
        {
            int run = ++checkRun;
            var jobs = lib.Items.Where(i => i.Type != "web").Select(i => new { i.Id, i.Path, Own = OwnIcon(i) }).ToList();
            var t = new Thread(() =>
            {
                var res = new Dictionary<string, bool>();
                var icons = new List<Tuple<string, Bitmap, Bitmap>>();
                foreach (var j in jobs)
                {
                    bool ok = Shell.Exists(j.Path);
                    res[j.Id] = !ok;
                    if (ok && j.Own) icons.Add(Tuple.Create("own:" + j.Path.ToLowerInvariant(), Shell.IconFor(j.Path, false, false), Shell.IconFor(j.Path, true, false)));
                }
                try
                {
                    BeginInvoke(new Action(() =>
                    {
                        if (run != checkRun || IsDisposed) return;
                        foreach (var ic in icons)
                        {
                            if (ic.Item2 != null && !small.Images.ContainsKey(ic.Item1)) small.Images.Add(ic.Item1, ic.Item2);
                            if (ic.Item3 != null && !large.Images.ContainsKey(ic.Item1)) large.Images.Add(ic.Item1, ic.Item3);
                        }
                        missing.Clear();
                        foreach (var r in res) missing[r.Key] = r.Value;
                        Render();
                    }));
                }
                catch (Exception) { }
            });
            t.IsBackground = true;
            t.SetApartmentState(ApartmentState.STA);
            t.Start();
        }

        /* ---------- open ---------- */
        void OpenItem(LItem it)
        {
            try
            {
                Shell.Open(it.Path);
                it.Opened++; it.Last = Now(); Save();
                if (missing.ContainsKey(it.Id) && missing[it.Id]) { missing[it.Id] = false; }
                Render();
            }
            catch (Exception e)
            {
                missing[it.Id] = it.Type != "web" && !Shell.Exists(it.Path);
                Render();
                Ui.Error(this, "Couldn't open \"" + it.Name + "\".\n" + it.Path + (missing[it.Id] ? "\n\nIt can't be found - it may have moved, or the drive is offline." : ""), e);
            }
        }

        void SearchKeys(object s, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; var v = Shown_(); if (v.Count > 0) OpenItem(v[0]); }
            else if (e.KeyCode == Keys.Escape) { e.SuppressKeyPress = true; search.Text = ""; }
            else if (e.KeyCode == Keys.Down && lv.Items.Count > 0) { e.SuppressKeyPress = true; lv.Focus(); lv.Items[0].Selected = true; lv.Items[0].Focused = true; }
        }

        void ListKeys(object s, KeyEventArgs e)
        {
            var it = Sel();
            if (e.KeyCode == Keys.Enter && it != null) { e.SuppressKeyPress = true; OpenItem(it); }
            else if (e.KeyCode == Keys.Delete && it != null) { e.SuppressKeyPress = true; Remove(it); }
            else if (e.KeyCode == Keys.F2 && it != null) { e.SuppressKeyPress = true; Edit(it); }
            else if (e.KeyCode == Keys.Escape) { search.Text = ""; search.Focus(); }
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == (Keys.Control | Keys.V) && Visible)
            {
                // in the search box with text in it, Ctrl+V pastes into the search as normal
                if (search.Focused && (search.Text.Length > 0 || !ClipboardHasPath())) return base.ProcessCmdKey(ref msg, keyData);
                if (PasteAdd()) return true;
            }
            if (keyData == (Keys.Control | Keys.F) && Visible) { search.Focus(); search.SelectAll(); return true; }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        static bool ClipboardHasPath()
        {
            try
            {
                if (Clipboard.ContainsFileDropList()) return true;
                if (!Clipboard.ContainsText()) return false;
                string t = Names.CleanPath(Clipboard.GetText().Split('\n')[0]);
                return Shell.IsWeb(t) || t.StartsWith("\\\\") || (t.Length > 2 && t[1] == ':');
            }
            catch (Exception) { return false; }
        }

        bool PasteAdd()
        {
            try
            {
                if (Clipboard.ContainsFileDropList())
                {
                    var l = new List<string>();
                    foreach (string f in Clipboard.GetFileDropList()) l.Add(f);
                    AddPaths(l);
                    return true;
                }
                if (ClipboardHasPath()) { AddFromText(Clipboard.GetText()); return true; }
            }
            catch (Exception) { }
            return false;
        }

        /* ---------- add / edit ---------- */
        ContextMenuStrip AddMenu()
        {
            var m = Theme.Menu();
            Theme.Item(m, "File(s)...", () => { var f = Ui.PickFiles(this, "All files|*.*", "Add file(s)"); if (f != null) AddPaths(f.ToList()); });
            Theme.Item(m, "Folder...", () => { var f = Ui.PickFolder(this, "Pick a folder to add"); if (f != null) AddPaths(new List<string> { f }); });
            Theme.Item(m, "Web link or path (type / paste)...", () => Edit(null, ""));
            return m;
        }

        void AddFromText(string text)
        {
            var lines = text.Replace("\r", "").Split('\n').Select(Names.CleanPath).Where(x => x != "").ToList();
            AddPaths(lines);
        }

        void AddPaths(List<string> paths)
        {
            if (paths.Count == 0) return;
            if (paths.Count == 1) { Edit(null, paths[0]); return; }
            int added = 0, skipped = 0;
            foreach (var p in paths)
            {
                if (lib.Items.Any(i => string.Equals(i.Path, p, StringComparison.OrdinalIgnoreCase))) { skipped++; continue; }
                lib.Items.Add(Make(p, Names.Guess(p), groupFilter.Length > 0 && groupFilter != "\u0000" ? groupFilter : ""));
                added++;
            }
            Save(); RenderGroups(); Render(); CheckMissing();
            Ui.Info(this, "Added " + added + " item" + (added == 1 ? "" : "s") + (skipped > 0 ? "\n" + skipped + " already in your list (skipped)" : ""));
        }

        static string TypeOf(string p) { return Shell.IsWeb(p) ? "web" : Directory.Exists(p) ? "folder" : "file"; }

        static LItem Make(string path, string name, string group)
        {
            return new LItem { Id = NewId(), Path = path, Name = name, Type = TypeOf(path), Group = group, Date = DateTime.Now.ToString("yyyy-MM-dd") };
        }

        void Edit(LItem it, string newPath = null)
        {
            bool isNew = it == null;
            var work = isNew ? Make(newPath ?? "", Names.Guess(newPath), groupFilter.Length > 0 && groupFilter != "\u0000" ? groupFilter : "") : it.Copy();
            if (isNew && !string.IsNullOrEmpty(newPath))
            {
                var dup = lib.Items.FirstOrDefault(i => string.Equals(i.Path, newPath, StringComparison.OrdinalIgnoreCase));
                if (dup != null && !Ui.Confirm(this, "\"" + dup.Name + "\" already points to this location.\n\nAdd it again anyway?")) return;
            }
            using (var d = new ItemDialog(work, lib.Groups, isNew))
            {
                if (d.ShowDialog(this) != DialogResult.OK) return;
            }
            work.Type = TypeOf(work.Path);
            if (work.Group != "" && !lib.Groups.Contains(work.Group)) lib.Groups.Add(work.Group);
            if (isNew) lib.Items.Add(work);
            else { int i = lib.Items.IndexOf(it); lib.Items[i] = work; }
            Save(); RenderGroups(); Render(); CheckMissing();
        }

        void Remove(LItem it)
        {
            if (!Ui.Confirm(this, "Remove \"" + it.Name + "\" from the launcher?\n\n(Only the shortcut is removed - the file itself is not touched.)")) return;
            lib.Items.Remove(it); Save(); RenderGroups(); Render();
        }

        ContextMenuStrip ItemMenu(LItem it)
        {
            var m = Theme.Menu();
            Theme.Item(m, "Open", () => OpenItem(it)).Font = Theme.UiFont(0, FontStyle.Bold);
            if (it.Type != "web") Theme.Item(m, "Open file location", () => { try { Shell.ShowInFolder(it.Path); } catch (Exception e) { Ui.Error(this, "Couldn't open the folder.", e); } });
            Theme.Item(m, "Copy path", () => { try { Clipboard.SetText(it.Path); } catch (Exception) { } });
            if (it.Type == "folder") Theme.Item(m, "Open in Bulk Files", () => { var bf = MainForm.Me.Open("files") as BulkFilesPage; if (bf != null) bf.LoadFolder(it.Path); });
            m.Items.Add(new ToolStripSeparator());
            Theme.Item(m, "Edit...", () => Edit(it));
            Theme.Item(m, "Duplicate", () =>
            {
                var c = it.Copy(); c.Id = NewId(); c.Name += " (copy)"; c.Opened = 0; c.Last = 0;
                lib.Items.Insert(lib.Items.IndexOf(it) + 1, c); Save(); RenderGroups(); Render();
            });
            var mv = new ToolStripMenuItem("Move to group") { ForeColor = Theme.Cur.Text };
            foreach (var g in lib.Groups.Concat(new[] { "" }))
            {
                string gg = g;
                var sub = new ToolStripMenuItem(g == "" ? "(No group)" : g) { Checked = it.Group == g, ForeColor = Theme.Cur.Text };
                sub.Click += delegate { it.Group = gg; Save(); RenderGroups(); Render(); };
                mv.DropDownItems.Add(sub);
            }
            var ng = new ToolStripMenuItem("New group...") { ForeColor = Theme.Cur.Text };
            ng.Click += delegate { var n = NewGroup(); if (n != null) { it.Group = n; Save(); RenderGroups(); Render(); } };
            mv.DropDownItems.Add(ng);
            mv.DropDown.BackColor = Theme.Cur.Panel;
            m.Items.Add(mv);
            m.Items.Add(new ToolStripSeparator());
            Theme.Item(m, "Remove", () => Remove(it));
            return m;
        }

        ContextMenuStrip BlankMenu()
        {
            var m = AddMenu();
            m.Items.Add(new ToolStripSeparator());
            Theme.Item(m, "Paste (add copied path or link)", () => { if (!PasteAdd()) Ui.Info(this, "Copy a file path or web link first.\n\nTip: Shift + right-click a file > Copy as path."); });
            return m;
        }

        /* ---------- groups ---------- */
        string NewGroup()
        {
            string n = Ui.Ask(this, "New group", "Group name:");
            if (string.IsNullOrEmpty(n)) return null;
            var have = lib.Groups.FirstOrDefault(g => string.Equals(g, n, StringComparison.OrdinalIgnoreCase));
            if (have != null) return have;
            lib.Groups.Add(n); Save(); RenderGroups();
            return n;
        }

        void RenameGroup(string g)
        {
            string n = Ui.Ask(this, "Rename group", "New name for \"" + g + "\":", g);
            if (string.IsNullOrEmpty(n) || n == g) return;
            if (lib.Groups.Any(x => string.Equals(x, n, StringComparison.OrdinalIgnoreCase) && x != g)) { Ui.Info(this, "There is already a group called \"" + n + "\"."); return; }
            lib.Groups[lib.Groups.IndexOf(g)] = n;
            foreach (var it in lib.Items) if (it.Group == g) it.Group = n;
            if (groupFilter == g) groupFilter = n;
            Save(); RenderGroups(); Render();
        }

        void MoveGroup(string g, int dir)
        {
            int i = lib.Groups.IndexOf(g), j = i + dir;
            if (i < 0 || j < 0 || j >= lib.Groups.Count) return;
            lib.Groups[i] = lib.Groups[j]; lib.Groups[j] = g;
            Save(); RenderGroups(); Render();
        }

        void DeleteGroup(string g)
        {
            int n = lib.Items.Count(i => i.Group == g);
            if (!Ui.Confirm(this, "Delete the group \"" + g + "\"?\n\n" + (n > 0 ? "Its " + n + " item(s) are kept and moved to \"No group\"." : "It is empty."))) return;
            lib.Groups.Remove(g);
            foreach (var it in lib.Items) if (it.Group == g) it.Group = "";
            if (groupFilter == g) groupFilter = "";
            Save(); RenderGroups(); Render();
        }

        /* ---------- Excel / CSV ---------- */
        string BulkFile { get { return System.IO.Path.Combine(Settings.ExportsDir, "launcher-bulk-edit.csv"); } }
        static readonly string[] Head = { "ID", "Name", "Location", "Group", "Description", "From", "Date" };

        ContextMenuStrip ExcelMenu()
        {
            var m = Theme.Menu();
            Theme.Item(m, "Bulk edit in Excel (step 1: open the list)", BulkOpen);
            Theme.Item(m, "Apply bulk edit changes (step 2)", BulkApply);
            m.Items.Add(new ToolStripSeparator());
            Theme.Item(m, "Import from CSV / Excel file...", ImportTable);
            Theme.Item(m, "Import my QuickLaunch list...", ImportQuickLaunch);
            m.Items.Add(new ToolStripSeparator());
            Theme.Item(m, "Export what I'm looking at (CSV for Excel)", ExportView);
            return m;
        }

        static string[] RowOf(LItem i) { return new[] { i.Id, i.Name, i.Path, i.Group, i.Desc, i.From, i.Date }; }

        void BulkOpen()
        {
            try
            {
                var rows = new List<string[]> { Head };
                rows.AddRange(lib.Items.Select(RowOf));
                Csv.Write(BulkFile, rows);
                Shell.Open(BulkFile);
                Ui.Info(this, "Your list is opening in Excel.\n\n" +
                    "1. Change anything: Name, Location, Group, Description, From, Date\n" +
                    "2. Add items: fill a new row (Name + Location is enough, leave ID empty)\n" +
                    "3. Remove items: delete the row\n" +
                    "4. Don't change the ID column\n" +
                    "5. Save (Ctrl+S, keep CSV format) and close Excel\n" +
                    "6. Import / Export ▾ > Apply bulk edit changes");
            }
            catch (Exception e) { Ui.Error(this, "Couldn't make the Excel file.", e); }
        }

        void BulkApply()
        {
            if (!File.Exists(BulkFile)) { Ui.Info(this, "Do step 1 first: Import / Export ▾ > Bulk edit in Excel."); return; }
            List<string[]> rows;
            try { rows = Csv.Read(BulkFile); }
            catch (IOException) { Ui.Info(this, "The file is still open in Excel. Save and close it, then try again."); return; }
            if (rows.Count == 0) return;
            var h = rows[0];
            int cId = Table.Col(h, "ID"), cName = Table.Col(h, "Name"), cLoc = Table.Col(h, "Location", "Path"), cGrp = Table.Col(h, "Group"),
                cDesc = Table.Col(h, "Description"), cFrom = Table.Col(h, "From"), cDate = Table.Col(h, "Date");
            if (cLoc < 0) { Ui.Info(this, "The file needs a Location column."); return; }
            var byId = lib.Items.ToDictionary(i => i.Id);
            var seen = new HashSet<string>();
            var next = new List<LItem>();
            int added = 0, changed = 0;
            foreach (var r in rows.Skip(1))
            {
                string loc = Names.CleanPath(Table.Get(r, cLoc));
                if (loc == "") continue;
                string id = Table.Get(r, cId);
                LItem it;
                bool isNew = id == "" || !byId.ContainsKey(id) || seen.Contains(id);
                it = isNew ? Make(loc, "", "") : byId[id].Copy();
                string before = string.Join("|", RowOf(it));
                it.Path = loc; it.Type = TypeOf(loc);
                it.Name = Table.Get(r, cName); if (it.Name == "") it.Name = Names.Guess(loc);
                if (cGrp >= 0) it.Group = Table.Get(r, cGrp);
                if (cDesc >= 0) it.Desc = Table.Get(r, cDesc);
                if (cFrom >= 0) it.From = Table.Get(r, cFrom);
                if (cDate >= 0) it.Date = Table.Get(r, cDate);
                if (isNew) added++; else { seen.Add(id); if (string.Join("|", RowOf(it)) != before) changed++; }
                next.Add(it);
            }
            int removed = lib.Items.Count(i => !seen.Contains(i.Id));
            string msg = "Added: " + added + "\nChanged: " + changed + "\nRemoved: " + removed;
            if (added + changed + removed == 0) { Ui.Info(this, "No changes found in the Excel file."); return; }
            if (!Ui.Confirm(this, msg + (removed > 0 ? "\n\n" + removed + " item(s) were deleted in Excel and will be removed." : "") + "\n\nApply these changes?")) return;
            lib.Items = next;
            foreach (var it in next) if (it.Group != "" && !lib.Groups.Contains(it.Group)) lib.Groups.Add(it.Group);
            Save(); RenderGroups(); Render(); CheckMissing();
        }

        void ImportTable()
        {
            string f = Ui.PickFile(this, "Excel or CSV|*.xlsx;*.xlsm;*.csv|All files|*.*", "Import a list");
            if (f == null) return;
            try
            {
                var rows = Table.Read(f);
                int hr = rows.FindIndex(r => Table.Col(r, "Location", "Path", "Link") >= 0);
                if (hr < 0) { Ui.Info(this, "The file needs a column called Location (or Path / Link).\nName, Group, Description, From and Date are optional."); return; }
                var h = rows[hr];
                int cName = Table.Col(h, "Name"), cLoc = Table.Col(h, "Location", "Path", "Link"), cGrp = Table.Col(h, "Group"),
                    cDesc = Table.Col(h, "Description"), cFrom = Table.Col(h, "From"), cDate = Table.Col(h, "Date");
                int added = 0, updated = 0;
                foreach (var r in rows.Skip(hr + 1))
                {
                    string loc = Names.CleanPath(Table.Get(r, cLoc));
                    if (loc == "") continue;
                    var it = lib.Items.FirstOrDefault(i => string.Equals(i.Path, loc, StringComparison.OrdinalIgnoreCase));
                    if (it == null) { it = Make(loc, Names.Guess(loc), ""); lib.Items.Add(it); added++; } else updated++;
                    if (Table.Get(r, cName) != "") it.Name = Table.Get(r, cName);
                    if (Table.Get(r, cGrp) != "") it.Group = Table.Get(r, cGrp);
                    if (Table.Get(r, cDesc) != "") it.Desc = Table.Get(r, cDesc);
                    if (Table.Get(r, cFrom) != "") it.From = Table.Get(r, cFrom);
                    if (Table.Get(r, cDate) != "") it.Date = Xlsx.DateText(Table.Get(r, cDate));
                    if (it.Group != "" && !lib.Groups.Contains(it.Group)) lib.Groups.Add(it.Group);
                }
                Save(); RenderGroups(); Render(); CheckMissing();
                Ui.Info(this, "Imported.\nAdded: " + added + "\nUpdated (already in the list): " + updated);
            }
            catch (IOException e) { Ui.Error(this, "Couldn't read the file - is it open somewhere and locked?", e); }
            catch (Exception e) { Ui.Error(this, "Couldn't read the file.", e); }
        }

        /* Reads QuickLaunch-data\library.json from the old QuickLaunch.hta */
        void ImportQuickLaunch()
        {
            string start = System.IO.Path.Combine(Settings.ExeDir, "..", "QuickLaunch-data");
            string f;
            using (var d = new OpenFileDialog { Filter = "QuickLaunch list|library.json;*.json", Title = "Pick QuickLaunch-data\\library.json" })
            {
                try { if (Directory.Exists(start)) d.InitialDirectory = System.IO.Path.GetFullPath(start); } catch (Exception) { }
                if (d.ShowDialog(this) != DialogResult.OK) return;
                f = d.FileName;
            }
            try
            {
                var root = Json.ReadAny(File.ReadAllText(f)) as Dictionary<string, object>;
                var items = root != null && root.ContainsKey("items") ? root["items"] as object[] : null;
                if (items == null) { Ui.Info(this, "That doesn't look like a QuickLaunch list (library.json)."); return; }
                if (root.ContainsKey("groups") && root["groups"] is object[])
                    foreach (var g in (object[])root["groups"]) { string gs = Convert.ToString(g); if (gs != "" && !lib.Groups.Contains(gs)) lib.Groups.Add(gs); }
                int added = 0, skipped = 0;
                foreach (var o in items)
                {
                    var d = o as Dictionary<string, object>;
                    if (d == null) continue;
                    Func<string, string> s = k => d.ContainsKey(k) && d[k] != null ? Convert.ToString(d[k]) : "";
                    string path = s("path");
                    if (path == "") continue;
                    if (lib.Items.Any(i => string.Equals(i.Path, path, StringComparison.OrdinalIgnoreCase))) { skipped++; continue; }
                    var it = new LItem
                    {
                        Id = NewId(), Name = s("name") == "" ? Names.Guess(path) : s("name"), Path = path, Group = s("group"), Desc = s("desc"), From = s("from"), Date = s("date"),
                        Type = s("type") == "web" ? "web" : s("type") == "folder" ? "folder" : TypeOf(path)
                    };
                    int n; long l;
                    if (int.TryParse(s("opened"), out n)) it.Opened = n;
                    if (long.TryParse(s("last"), out l)) it.Last = l;
                    if (it.Group != "" && !lib.Groups.Contains(it.Group)) lib.Groups.Add(it.Group);
                    lib.Items.Add(it); added++;
                }
                Save(); RenderGroups(); Render(); CheckMissing();
                Ui.Info(this, "QuickLaunch list imported.\nAdded: " + added + (skipped > 0 ? "\nAlready here (skipped): " + skipped : "") + "\n\nYour QuickLaunch file was not changed.");
            }
            catch (Exception e) { Ui.Error(this, "Couldn't read that QuickLaunch list.", e); }
        }

        void ExportView()
        {
            try
            {
                var rows = new List<string[]> { Head.Skip(1).Concat(new[] { "Times opened", "Last opened" }).ToArray() };
                rows.AddRange(Shown_().Select(i => RowOf(i).Skip(1).Concat(new[] { i.Opened.ToString(), When(i.Last) }).ToArray()));
                string f = System.IO.Path.Combine(Settings.ExportsDir, "Launcher_" + Names.Stamp() + ".csv");
                Csv.Write(f, rows);
                Shell.ShowInFolder(f);
            }
            catch (Exception e) { Ui.Error(this, "Couldn't export.", e); }
        }
    }

    /* Add / edit one launcher item */
    class ItemDialog : Form
    {
        readonly LItem it;
        TextBox name, loc, desc, from, date;
        ComboBox group;

        public ItemDialog(LItem item, List<string> groups, bool isNew)
        {
            it = item;
            Text = isNew ? "Add item" : "Edit item";
            FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; MinimizeBox = false; ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            var t = new TableLayoutPanel { ColumnCount = 2, AutoSizeMode = AutoSizeMode.GrowAndShrink, Padding = new Padding(Theme.Px(12)), AutoSize = true };
            t.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            t.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, Theme.Px(420)));
            int w = Theme.Px(410);
            loc = new TextBox { Text = it.Path, Width = w };
            name = new TextBox { Text = it.Name, Width = w };
            group = new ComboBox { Width = w, DropDownStyle = ComboBoxStyle.DropDown };
            group.Items.Add(""); foreach (var g in groups) group.Items.Add(g);
            group.Text = it.Group;
            desc = new TextBox { Text = it.Desc, Width = w };
            from = new TextBox { Text = it.From, Width = w };
            date = new TextBox { Text = it.Date, Width = Theme.Px(140) };
            loc.TextChanged += delegate { if (name.Tag == null) name.Text = Names.Guess(Names.CleanPath(loc.Text)); };
            name.KeyPress += delegate { name.Tag = "typed"; };
            if (!isNew) name.Tag = "typed";

            var browse = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0) };
            browse.Controls.Add(Ui.Btn("File...", delegate { var f = Ui.PickFile(this, "All files|*.*"); if (f != null) loc.Text = f; }, "small"));
            browse.Controls.Add(Ui.Btn("Folder...", delegate { var f = Ui.PickFolder(this, "Pick a folder"); if (f != null) loc.Text = f; }, "small"));

            Row(t, "Location", loc);
            Row(t, "", browse);
            Row(t, "Name", name);
            Row(t, "Group", group);
            Row(t, "Description", desc);
            Row(t, "From", from);
            Row(t, "Date", date);
            var btns = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.RightToLeft, Dock = DockStyle.Fill };
            var cancel = Ui.Btn("Cancel", null); cancel.DialogResult = DialogResult.Cancel;
            var ok = Ui.Btn(isNew ? "Add" : "Save", null, "accent");
            ok.Click += delegate
            {
                string p = Names.CleanPath(loc.Text);
                if (p == "") { MessageBox.Show(this, "Type or paste a location (file, folder or web link)."); return; }
                it.Path = p; it.Name = name.Text.Trim() == "" ? Names.Guess(p) : name.Text.Trim();
                it.Group = group.Text.Trim(); it.Desc = desc.Text.Trim(); it.From = from.Text.Trim(); it.Date = date.Text.Trim();
                DialogResult = DialogResult.OK;
            };
            btns.Controls.Add(cancel); btns.Controls.Add(ok);
            int br = t.RowCount++;
            t.Controls.Add(btns, 0, br); t.SetColumnSpan(btns, 2);
            AcceptButton = ok; CancelButton = cancel;
            Controls.Add(t);
            AutoSize = true; AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Theme.Apply(this);
            Shown += delegate { if (loc.Text == "") loc.Focus(); else { name.Focus(); name.SelectAll(); } };
        }

        static void Row(TableLayoutPanel t, string label, Control c)
        {
            int r = t.RowCount++;
            t.Controls.Add(new Label { Text = label, AutoSize = true, Margin = new Padding(0, Theme.Px(7), Theme.Px(10), 0) }, 0, r);
            t.Controls.Add(c, 1, r);
        }
    }
}
