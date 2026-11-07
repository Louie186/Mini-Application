// Lew's Toolbox - looks (same themes as QuickLaunch) and small UI building blocks.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace LewsToolbox
{
    class Theme
    {
        public string Key, Name;
        public Color Bg, Panel, Hover, Text, Muted, Line, Accent, AccText, Chip, Ok, Warn, Bad;
        public bool Retro;

        static Color C(string hex) { return ColorTranslator.FromHtml(hex); }
        static Theme T(string key, string name, string bg, string panel, string hover, string text, string muted, string line, string accent, string accText, string chip, bool retro, bool darkish)
        {
            return new Theme
            {
                Key = key, Name = name, Bg = C(bg), Panel = C(panel), Hover = C(hover), Text = C(text), Muted = C(muted), Line = C(line),
                Accent = C(accent), AccText = C(accText), Chip = C(chip), Retro = retro,
                Ok = darkish ? C("#5fd38d") : C("#1f8a4c"), Warn = darkish ? C("#ffcd75") : C("#a86500"), Bad = darkish ? C("#ff7b72") : C("#c0392b")
            };
        }

        public static readonly List<Theme> All = new List<Theme>
        {
            T("light", "Light", "#f4f5f8", "#ffffff", "#eaf0fb", "#1d2330", "#6b7385", "#dde2ea", "#2f6fed", "#ffffff", "#e9ecf2", false, false),
            T("dark", "Dark", "#16181d", "#1f2229", "#2a2f3a", "#e8eaef", "#9097a6", "#30343e", "#5b9dff", "#0b1220", "#282c35", false, true),
            T("blueprint", "Blueprint", "#0d2a4c", "#12365f", "#1a4679", "#e6f0ff", "#9fb9dd", "#2b5a8f", "#ffd166", "#0d2a4c", "#173f6d", false, true),
            T("retro", "Retro 8-bit", "#1a1c2c", "#29366f", "#3b5dc9", "#f4f4f4", "#94b0c2", "#0b0c16", "#ffcd75", "#1a1c2c", "#333c57", true, true),
            T("gameboy", "Retro Grey", "#d6d2c8", "#e8e5de", "#f6f4ef", "#23233a", "#6b6b7d", "#4a4a5e", "#8b1c62", "#ffffff", "#cbc6ba", true, false),
            T("console", "Retro Console", "#dfe7f2", "#c9d6ea", "#f0f5fc", "#141b33", "#5a6a90", "#1b2a6b", "#1b2a6b", "#f0f5fc", "#d3deef", true, false),
        };

        public static Theme Get(string key) { return All.FirstOrDefault(t => t.Key == key) ?? All[0]; }

        public static Theme Cur = All[0];
        public static float FontSize = 9.75f;
        public static float Scale = 1f;          // screen zoom (100% = 1, 150% = 1.5)
        public static int Px(int n) { return (int)Math.Round(n * Scale); }

        public static Font UiFont(float delta = 0, FontStyle st = FontStyle.Regular)
        {
            string fam = Cur.Retro ? "Consolas" : "Segoe UI";
            return new Font(fam, Math.Max(7f, FontSize + delta), st);
        }

        public static void SetSize(string size)
        {
            FontSize = size == "compact" ? 9f : size == "large" ? 11.25f : 9.75f;
        }

        /* Colours every control on a form / panel. Controls tagged "accent" get the accent colour,
           "muted" gets grey text, "panel" gets the panel colour. */
        public static void Apply(Control root)
        {
            ApplyOne(root);
            foreach (Control c in root.Controls) Apply(c);
        }

        static void ApplyOne(Control c)
        {
            var t = Cur;
            string tag = c.Tag as string ?? "";
            if (tag.Contains("keepfont")) { } else c.Font = UiFont(tag.Contains("big") ? 3 : tag.Contains("small") ? -1 : 0, tag.Contains("bold") ? FontStyle.Bold : FontStyle.Regular);
            if (c is Form || c is UserControl) { c.BackColor = t.Bg; c.ForeColor = t.Text; }
            else if (c is Button)
            {
                var b = (Button)c;
                b.FlatStyle = FlatStyle.Flat;
                b.UseVisualStyleBackColor = false;
                bool acc = tag.Contains("accent"), nav = tag.Contains("nav");
                bool on = tag.Contains("on");
                b.BackColor = acc ? t.Accent : on ? t.Hover : nav ? t.Panel : t.Panel;
                b.ForeColor = acc ? t.AccText : t.Text;
                b.FlatAppearance.BorderColor = acc || on ? t.Accent : t.Line;
                b.FlatAppearance.BorderSize = nav && !on ? 0 : (t.Retro ? 2 : 1);
                b.FlatAppearance.MouseOverBackColor = acc ? ControlPaint.Light(t.Accent, 0.3f) : t.Hover;
                b.Cursor = Cursors.Hand;
            }
            else if (c is TextBox || c is ComboBox || c is NumericUpDown || c is DateTimePicker)
            {
                c.BackColor = t.Panel == t.Bg ? t.Hover : t.Bg; c.ForeColor = t.Text;
                if (c is TextBox) ((TextBox)c).BorderStyle = BorderStyle.FixedSingle;
                if (c is ComboBox) ((ComboBox)c).FlatStyle = FlatStyle.Flat;
            }
            else if (c is ListView)
            {
                var lv = (ListView)c;
                lv.BackColor = t.Panel; lv.ForeColor = t.Text; lv.BorderStyle = BorderStyle.None;
            }
            else if (c is DataGridView)
            {
                var g = (DataGridView)c;
                g.BackgroundColor = t.Panel; g.GridColor = t.Line; g.BorderStyle = BorderStyle.None;
                g.DefaultCellStyle.BackColor = t.Panel; g.DefaultCellStyle.ForeColor = t.Text;
                g.DefaultCellStyle.SelectionBackColor = t.Hover; g.DefaultCellStyle.SelectionForeColor = t.Text;
                g.DefaultCellStyle.Font = UiFont();
                g.AlternatingRowsDefaultCellStyle.BackColor = Blend(t.Panel, t.Bg, 0.5f);
                g.ColumnHeadersDefaultCellStyle.BackColor = t.Chip; g.ColumnHeadersDefaultCellStyle.ForeColor = t.Text;
                g.ColumnHeadersDefaultCellStyle.SelectionBackColor = t.Chip;
                g.ColumnHeadersDefaultCellStyle.Font = UiFont(0, FontStyle.Bold);
                g.EnableHeadersVisualStyles = false;
                g.RowHeadersVisible = false;
            }
            else if (c is Label || c is CheckBox || c is RadioButton || c is LinkLabel)
            {
                c.BackColor = Color.Transparent;
                c.ForeColor = tag.Contains("muted") ? t.Muted : tag.Contains("accent") ? t.Accent : t.Text;
                if (c is LinkLabel) { ((LinkLabel)c).LinkColor = t.Accent; ((LinkLabel)c).ActiveLinkColor = t.Accent; }
            }
            else if (c is Panel || c is FlowLayoutPanel || c is TableLayoutPanel || c is SplitContainer || c is GroupBox || c is TabPage)
            {
                c.BackColor = tag.Contains("panel") ? t.Panel : tag.Contains("chip") ? t.Chip : t.Bg;
                c.ForeColor = t.Text;
            }
        }

        public static Color Blend(Color a, Color b, float k)
        {
            return Color.FromArgb((int)(a.R + (b.R - a.R) * k), (int)(a.G + (b.G - a.G) * k), (int)(a.B + (b.B - a.B) * k));
        }

        /* Menus in the theme's colours */
        public class MenuColors : ProfessionalColorTable
        {
            public override Color MenuItemSelected { get { return Cur.Hover; } }
            public override Color MenuItemBorder { get { return Cur.Accent; } }
            public override Color MenuBorder { get { return Cur.Line; } }
            public override Color ToolStripDropDownBackground { get { return Cur.Panel; } }
            public override Color ImageMarginGradientBegin { get { return Cur.Panel; } }
            public override Color ImageMarginGradientMiddle { get { return Cur.Panel; } }
            public override Color ImageMarginGradientEnd { get { return Cur.Panel; } }
            public override Color SeparatorDark { get { return Cur.Line; } }
            public override Color MenuItemSelectedGradientBegin { get { return Cur.Hover; } }
            public override Color MenuItemSelectedGradientEnd { get { return Cur.Hover; } }
            public override Color MenuItemPressedGradientBegin { get { return Cur.Hover; } }
            public override Color MenuItemPressedGradientEnd { get { return Cur.Hover; } }
        }

        public static ContextMenuStrip Menu()
        {
            var m = new ContextMenuStrip();
            m.Renderer = new ToolStripProfessionalRenderer(new MenuColors());
            m.BackColor = Cur.Panel; m.ForeColor = Cur.Text; m.Font = UiFont();
            m.ShowImageMargin = false;
            return m;
        }

        public static ToolStripMenuItem Item(ContextMenuStrip m, string text, Action a)
        {
            var it = new ToolStripMenuItem(text);
            it.ForeColor = Cur.Text;
            it.Click += delegate { a(); };
            m.Items.Add(it);
            return it;
        }
    }

    static class Ui
    {
        public static Button Btn(string text, Action click, string tag = "")
        {
            var b = new Button { Text = text, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, Tag = tag, Margin = new Padding(Theme.Px(3)) };
            b.Padding = new Padding(Theme.Px(6), Theme.Px(2), Theme.Px(6), Theme.Px(2));
            if (click != null) b.Click += delegate { click(); };
            return b;
        }

        /* A button that opens a little menu underneath it */
        public static Button MenuBtn(string text, Func<ContextMenuStrip> build, string tag = "")
        {
            Button b = null;
            b = Btn(text + " ▾", delegate
            {
                var m = build();
                Theme.Apply(m);
                m.Show(b, new Point(0, b.Height));
            }, tag);
            return b;
        }

        public static Label Lbl(string text, string tag = "")
        {
            return new Label { Text = text, AutoSize = true, Tag = tag, Margin = new Padding(Theme.Px(3), Theme.Px(7), Theme.Px(3), Theme.Px(3)) };
        }

        public static FlowLayoutPanel Bar(string tag = "panel")
        {
            return new FlowLayoutPanel
            {
                Dock = DockStyle.Top, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, WrapContents = true,
                Padding = new Padding(Theme.Px(6), Theme.Px(4), Theme.Px(6), Theme.Px(4)), Tag = tag
            };
        }

        /* A one-line question box, e.g. "Group name:" */
        public static string Ask(IWin32Window owner, string title, string question, string value = "")
        {
            using (var f = new Form())
            {
                f.Text = title; f.FormBorderStyle = FormBorderStyle.FixedDialog; f.MinimizeBox = false; f.MaximizeBox = false;
                f.StartPosition = FormStartPosition.CenterParent; f.ShowInTaskbar = false;
                f.ClientSize = new Size(Theme.Px(380), Theme.Px(120));
                var l = new Label { Text = question, Left = Theme.Px(12), Top = Theme.Px(12), AutoSize = true };
                var tb = new TextBox { Text = value, Left = Theme.Px(12), Top = Theme.Px(38), Width = Theme.Px(356) };
                var ok = new Button { Text = "OK", DialogResult = DialogResult.OK, Left = Theme.Px(196), Top = Theme.Px(76), Width = Theme.Px(84), Height = Theme.Px(30), Tag = "accent" };
                var no = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, Left = Theme.Px(284), Top = Theme.Px(76), Width = Theme.Px(84), Height = Theme.Px(30) };
                f.Controls.AddRange(new Control[] { l, tb, ok, no });
                f.AcceptButton = ok; f.CancelButton = no;
                Theme.Apply(f);
                return f.ShowDialog(owner) == DialogResult.OK ? tb.Text.Trim() : null;
            }
        }

        public static bool Confirm(IWin32Window owner, string text, string title = "Lew's Toolbox")
        {
            return MessageBox.Show(owner, text, title, MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) == DialogResult.Yes;
        }

        public static void Info(IWin32Window owner, string text, string title = "Lew's Toolbox")
        {
            MessageBox.Show(owner, text, title, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        public static void Error(IWin32Window owner, string text, Exception e = null)
        {
            MessageBox.Show(owner, text + (e != null ? "\n\n" + e.Message : ""), "Lew's Toolbox", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        public static string PickFile(IWin32Window owner, string filter, string title = "Pick a file")
        {
            using (var d = new OpenFileDialog { Filter = filter, Title = title })
                return d.ShowDialog(owner) == DialogResult.OK ? d.FileName : null;
        }

        public static string[] PickFiles(IWin32Window owner, string filter, string title = "Pick files")
        {
            using (var d = new OpenFileDialog { Filter = filter, Title = title, Multiselect = true })
                return d.ShowDialog(owner) == DialogResult.OK ? d.FileNames : null;
        }

        public static string PickFolder(IWin32Window owner, string title, string start = null)
        {
            using (var d = new FolderBrowserDialog { Description = title, ShowNewFolderButton = true })
            {
                if (!string.IsNullOrEmpty(start) && System.IO.Directory.Exists(start)) d.SelectedPath = start;
                return d.ShowDialog(owner) == DialogResult.OK ? d.SelectedPath : null;
            }
        }
    }
}
