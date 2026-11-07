// Lew's Toolbox - stopwatch and countdown timer (click the clock in the side bar).
using System;
using System.Diagnostics;
using System.Drawing;
using System.Media;
using System.Windows.Forms;

namespace LewsToolbox
{
    class ClockForm : Form
    {
        static ClockForm open;
        static DateTime? timerEnd;
        static TimeSpan timerPaused = TimeSpan.Zero;
        public static bool Ringing;
        static readonly Stopwatch sw = new Stopwatch();
        static Timer ring;

        public static string Countdown()
        {
            if (timerEnd == null) return null;
            var left = timerEnd.Value - DateTime.Now;
            if (left <= TimeSpan.Zero) { timerEnd = null; StartRinging(); return null; }
            return Fmt(left);
        }

        static string Fmt(TimeSpan t)
        {
            return t.TotalHours >= 1 ? string.Format("{0}:{1:00}:{2:00}", (int)t.TotalHours, t.Minutes, t.Seconds) : string.Format("{0}:{1:00}", t.Minutes, t.Seconds);
        }

        static void StartRinging()
        {
            Ringing = true;
            if (ring == null)
            {
                ring = new Timer { Interval = 1500 };
                ring.Tick += delegate { if (Ringing) SystemSounds.Exclamation.Play(); };
            }
            ring.Start();
            SystemSounds.Exclamation.Play();
        }

        public static void StopRinging() { Ringing = false; if (ring != null) ring.Stop(); }

        public static void Open(IWin32Window owner)
        {
            if (Ringing) { StopRinging(); return; }
            if (open != null && !open.IsDisposed) { open.Activate(); return; }
            open = new ClockForm();
            open.Show(owner);
        }

        Label swLbl, tmLbl;
        TextBox mins;
        ListBox laps;

        ClockForm()
        {
            Text = "Stopwatch & timer";
            FormBorderStyle = FormBorderStyle.FixedToolWindow;
            StartPosition = FormStartPosition.CenterParent;
            ClientSize = new Size(Theme.Px(340), Theme.Px(400));
            var root = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(Theme.Px(10)), AutoScroll = true };

            root.Controls.Add(new Label { Text = "Stopwatch", AutoSize = true, Tag = "bold" });
            swLbl = new Label { AutoSize = true, Tag = "big bold", Text = "0:00.0" };
            root.Controls.Add(swLbl);
            var swBar = new FlowLayoutPanel { AutoSize = true, WrapContents = false };
            swBar.Controls.Add(Ui.Btn("Start / Pause", delegate { if (sw.IsRunning) sw.Stop(); else sw.Start(); }, "accent"));
            swBar.Controls.Add(Ui.Btn("Lap", delegate { if (sw.IsRunning) laps.Items.Insert(0, "Lap " + (laps.Items.Count + 1) + "   " + SwText()); }));
            swBar.Controls.Add(Ui.Btn("Reset", delegate { sw.Reset(); laps.Items.Clear(); }));
            root.Controls.Add(swBar);
            laps = new ListBox { Width = Theme.Px(300), Height = Theme.Px(70), BorderStyle = BorderStyle.None };
            root.Controls.Add(laps);

            root.Controls.Add(new Label { Text = "Timer", AutoSize = true, Tag = "bold", Margin = new Padding(0, Theme.Px(12), 0, 0) });
            tmLbl = new Label { AutoSize = true, Tag = "big bold", Text = "--:--" };
            root.Controls.Add(tmLbl);
            var presets = new FlowLayoutPanel { Width = Theme.Px(310), AutoSize = true };
            foreach (int m in new[] { 1, 5, 10, 15, 25, 30, 45, 60 })
            {
                int mm = m;
                presets.Controls.Add(Ui.Btn(m + "m", delegate { StartTimer(TimeSpan.FromMinutes(mm)); }));
            }
            root.Controls.Add(presets);
            var custom = new FlowLayoutPanel { AutoSize = true, WrapContents = false };
            custom.Controls.Add(new Label { Text = "Minutes (e.g. 20 or 1:30):", AutoSize = true, Margin = new Padding(0, Theme.Px(8), 0, 0) });
            mins = new TextBox { Width = Theme.Px(60) };
            mins.KeyDown += (s, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; StartCustom(); } };
            custom.Controls.Add(mins);
            custom.Controls.Add(Ui.Btn("Go", StartCustom, "accent"));
            root.Controls.Add(custom);
            var stopBar = new FlowLayoutPanel { AutoSize = true, WrapContents = false };
            stopBar.Controls.Add(Ui.Btn("Pause / Resume", PauseTimer));
            stopBar.Controls.Add(Ui.Btn("Stop", delegate { timerEnd = null; timerPaused = TimeSpan.Zero; StopRinging(); }));
            root.Controls.Add(stopBar);

            Controls.Add(root);
            Theme.Apply(this);
            var t = new Timer { Interval = 100 };
            t.Tick += delegate
            {
                swLbl.Text = SwText();
                string c = Countdown();
                tmLbl.Text = Ringing ? "Time's up! (click Stop)" : c ?? (timerPaused > TimeSpan.Zero ? Fmt(timerPaused) + " (paused)" : "--:--");
            };
            t.Start();
            FormClosed += delegate { t.Dispose(); };
        }

        static string SwText()
        {
            var e = sw.Elapsed;
            return (e.TotalHours >= 1 ? ((int)e.TotalHours) + ":" + e.Minutes.ToString("00") : e.Minutes.ToString()) + ":" + e.Seconds.ToString("00") + "." + (e.Milliseconds / 100);
        }

        void StartCustom()
        {
            string s = mins.Text.Trim();
            double m;
            var parts = s.Split(':');
            int h, mi;
            if (parts.Length == 2 && int.TryParse(parts[0], out h) && int.TryParse(parts[1], out mi)) StartTimer(new TimeSpan(h, mi, 0));
            else if (double.TryParse(s, out m) && m > 0) StartTimer(TimeSpan.FromMinutes(m));
        }

        static void StartTimer(TimeSpan t) { StopRinging(); timerPaused = TimeSpan.Zero; timerEnd = DateTime.Now + t; }

        static void PauseTimer()
        {
            if (timerEnd != null) { timerPaused = timerEnd.Value - DateTime.Now; timerEnd = null; }
            else if (timerPaused > TimeSpan.Zero) { timerEnd = DateTime.Now + timerPaused; timerPaused = TimeSpan.Zero; }
        }
    }
}
