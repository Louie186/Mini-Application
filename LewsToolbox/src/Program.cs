// Lew's Toolbox - start-up, settings and the main window with its tabs.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace LewsToolbox
{
    static class Program
    {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        [STAThread]
        static void Main()
        {
            try { if (Environment.OSVersion.Version.Major >= 6) SetProcessDPIAware(); } catch (Exception) { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.ThreadException += (s, e) => Crash(e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (s, e) => Crash(e.ExceptionObject as Exception);
            using (var g = Graphics.FromHwnd(IntPtr.Zero)) Theme.Scale = g.DpiX / 96f;
            Settings.Load();
            Application.Run(new MainForm());
        }

        static void Crash(Exception e)
        {
            try
            {
                string log = Path.Combine(Settings.DataDir, "error-log.txt");
                Directory.CreateDirectory(Settings.DataDir);
                File.AppendAllText(log, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + e + "\r\n\r\n");
            }
            catch (Exception) { }
            MessageBox.Show("Something went wrong, but your saved data is safe.\n\n" + (e != null ? e.Message : "") +
                "\n\nDetails were written to error-log.txt in the data folder.", "Lew's Toolbox", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    /* Settings for THIS PC (kept in %APPDATA%\LewsToolbox), so each PC can point to its own OneDrive path. */
    class SettingsData
    {
        public string DataFolder = "";        // empty = "LewsToolbox-data" next to the program
        public string Theme = "light";
        public string Size = "normal";
        public string TrackerFolder = "";     // optional: Lew's Tracker data folder (to read Delegation.json)
        public string LastPage = "launcher";
        public int[] Window;                  // x, y, w, h, maximised
        public string UserName = "";
    }

    static class Settings
    {
        public static SettingsData D = new SettingsData();
        static string File_ { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "LewsToolbox", "settings.json"); } }
        public static string ExeDir { get { return Path.GetDirectoryName(Application.ExecutablePath); } }

        public static string DataDir
        {
            get
            {
                string d = D.DataFolder;
                if (string.IsNullOrEmpty(d)) d = Path.Combine(ExeDir, "LewsToolbox-data");
                return d;
            }
        }
        public static string ExportsDir { get { return Path.Combine(DataDir, "exports"); } }
        public static string PathOf(string file) { return Path.Combine(DataDir, file); }

        public static void Load()
        {
            D = Json.Load<SettingsData>(File_);
            if (string.IsNullOrEmpty(D.UserName)) D.UserName = Environment.UserName;
            Theme.Cur = LewsToolbox.Theme.Get(D.Theme);
            LewsToolbox.Theme.SetSize(D.Size);
        }

        public static void Save()
        {
            try { Json.Save(File_, D); } catch (Exception) { }
        }
    }

    interface IPage
    {
        void OnShown();     // called each time the tab is opened
        void Reload();      // data folder changed - read the data again
    }

    class MainForm : Form
    {
        Panel nav, body;
        readonly Dictionary<string, Control> pages = new Dictionary<string, Control>();
        readonly Dictionary<string, Button> navBtns = new Dictionary<string, Button>();
        string current;
        Label clock;
        public static MainForm Me;

        static readonly string[][] Tabs =
        {
            new[] { "launcher", "\U0001F680  Launcher" },
            new[] { "tracker", "\U0001F5C2  Tracker" },
            new[] { "delegate", "\U0001F4CB  Delegate" },
            new[] { "check", "✅  Submission Check" },
            new[] { "files", "\U0001F4C1  Bulk Files" },
            new[] { "settings", "⚙  Settings" },
        };

        public MainForm()
        {
            Me = this;
            Text = "Lew's Toolbox";
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }
            MinimumSize = new Size(Theme.Px(760), Theme.Px(480));
            KeyPreview = true;
            var w = Settings.D.Window;
            if (w != null && w.Length == 5 && w[2] > 200 && Screen.AllScreens.Length > 0 && IsOnScreen(new Rectangle(w[0], w[1], w[2], w[3])))
            {
                StartPosition = FormStartPosition.Manual;
                Bounds = new Rectangle(w[0], w[1], w[2], w[3]);
                if (w[4] == 1) WindowState = FormWindowState.Maximized;
            }
            else { Size = new Size(Theme.Px(1100), Theme.Px(700)); StartPosition = FormStartPosition.CenterScreen; }

            Build();
            FormClosing += delegate
            {
                var b = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                Settings.D.Window = new[] { b.X, b.Y, b.Width, b.Height, WindowState == FormWindowState.Maximized ? 1 : 0 };
                Settings.D.LastPage = current;
                Settings.Save();
            };
            Load += delegate { Show(Settings.D.LastPage ?? "launcher"); };
        }

        static bool IsOnScreen(Rectangle r)
        {
            foreach (var s in Screen.AllScreens) if (s.WorkingArea.IntersectsWith(r)) return true;
            return false;
        }

        void Build()
        {
            SuspendLayout();
            Controls.Clear();
            pages.Clear(); navBtns.Clear();
            body = new Panel { Dock = DockStyle.Fill };
            nav = new Panel { Dock = DockStyle.Left, Width = Theme.Px(190), Tag = "panel", Padding = new Padding(Theme.Px(8)) };
            var title = new Label { Text = "Lew's Toolbox", Dock = DockStyle.Top, Height = Theme.Px(44), TextAlign = ContentAlignment.MiddleLeft, Tag = "big bold" };
            var list = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Tag = "panel" };
            foreach (var t in Tabs)
            {
                string key = t[0];
                var b = new Button { Text = t[1], TextAlign = ContentAlignment.MiddleLeft, Width = Theme.Px(170), Height = Theme.Px(38), Tag = "nav", Margin = new Padding(0, 0, 0, Theme.Px(4)) };
                b.Click += delegate { Show(key); };
                navBtns[key] = b;
                list.Controls.Add(b);
            }
            clock = new Label { Dock = DockStyle.Bottom, Height = Theme.Px(52), TextAlign = ContentAlignment.MiddleCenter, Tag = "bold", Cursor = Cursors.Hand };
            clock.Click += delegate { ClockForm.Open(this); };
            new ToolTip().SetToolTip(clock, "Click for stopwatch and timer");
            var tick = new Timer { Interval = 1000 };
            tick.Tick += delegate { UpdateClock(); };
            tick.Start();
            UpdateClock();
            nav.Controls.Add(list);
            nav.Controls.Add(clock);
            nav.Controls.Add(title);
            Controls.Add(body);
            Controls.Add(nav);
            Theme.Apply(this);
            ResumeLayout();
        }

        void UpdateClock()
        {
            string t = DateTime.Now.ToString("HH:mm") + "\n" + DateTime.Now.ToString("ddd d MMM");
            string timer = ClockForm.Countdown();
            if (timer != null) t = "⏱ " + timer + "\n" + DateTime.Now.ToString("HH:mm");
            if (clock.Text != t) clock.Text = t;
            clock.ForeColor = ClockForm.Ringing && DateTime.Now.Second % 2 == 0 ? Theme.Cur.Bad : Theme.Cur.Text;
        }

        Control Make(string key)
        {
            switch (key)
            {
                case "launcher": return new LauncherPage();
                case "settings": return new SettingsPage();
                case "tracker": return new ComingSoon("Tracker", "Your own work list: Today, This week, Overdue and a Board view.\nDelegated tasks show here as “Waiting on …”.", 3);
                case "delegate": return new ComingSoon("Delegate", "Make tasks, assign people, send each person an Excel sheet or HTML task pack,\nthen load their filled-in sheet back to see the status.", 4);
                case "check": return new ComingSoon("Submission Check", "Pick a submission folder and your list - it checks file count and file names.", 5);
                case "files": return new ComingSoon("Bulk Files", "Rename, copy and move many files at once, with a preview, an Excel round trip and Undo.", 2);
            }
            return new Panel();
        }

        public void Show(string key)
        {
            if (!navBtns.ContainsKey(key)) key = "launcher";
            Control page;
            if (!pages.TryGetValue(key, out page))
            {
                page = Make(key);
                page.Dock = DockStyle.Fill;
                pages[key] = page;
                body.Controls.Add(page);
                Theme.Apply(page);
            }
            foreach (var p in pages) p.Value.Visible = p.Key == key;
            foreach (var b in navBtns) b.Value.Tag = b.Key == key ? "nav on" : "nav";
            foreach (var b in navBtns.Values) Theme.Apply(b);
            current = key;
            var ip = page as IPage;
            if (ip != null) ip.OnShown();
        }

        /* After a theme / size change: rebuild everything with the new look. */
        public void Restyle() { BeginInvoke(new Action(RestyleNow)); }
        void RestyleNow()
        {
            string keep = current;
            foreach (var p in pages.Values) p.Dispose();
            Build();
            Show(keep);
        }

        /* After the data folder changes */
        public void ReloadAll()
        {
            foreach (var p in pages.Values) { var ip = p as IPage; if (ip != null) ip.Reload(); }
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            // Ctrl+1..6 jumps between tabs
            if ((keyData & Keys.Control) == Keys.Control)
            {
                int n = (int)(keyData & Keys.KeyCode) - (int)Keys.D1;
                if (n >= 0 && n < Tabs.Length) { Show(Tabs[n][0]); return true; }
            }
            return base.ProcessCmdKey(ref msg, keyData);
        }
    }

    /* Placeholder for tabs built in a later stage */
    class ComingSoon : UserControl
    {
        public ComingSoon(string title, string text, int stage)
        {
            var p = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(Theme.Px(30)) };
            p.Controls.Add(new Label { Text = title, AutoSize = true, Tag = "big bold" });
            p.Controls.Add(new Label { Text = text, AutoSize = true, Margin = new Padding(0, Theme.Px(10), 0, 0) });
            p.Controls.Add(new Label { Text = "Coming in stage " + stage + ".", AutoSize = true, Tag = "muted", Margin = new Padding(0, Theme.Px(16), 0, 0) });
            Controls.Add(p);
        }
    }
}
