// Lew's Toolbox - Settings tab: looks, data folder (local or OneDrive), link to Lew's Tracker.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace LewsToolbox
{
    [Tab("settings")]
    class SettingsPage : UserControl, IPage
    {
        Label dataLbl, trackerLbl;

        public SettingsPage()
        {
            var root = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(Theme.Px(24)) };

            root.Controls.Add(H("Look"));
            var themes = new FlowLayoutPanel { AutoSize = true, MaximumSize = new Size(Theme.Px(700), 0) };
            foreach (var t in Theme.All)
            {
                var tt = t;
                themes.Controls.Add(Ui.Btn(t.Name, delegate { Settings.D.Theme = tt.Key; Theme.Cur = tt; Settings.Save(); MainForm.Me.Restyle(); }, Settings.D.Theme == t.Key ? "on" : ""));
            }
            root.Controls.Add(themes);
            var sizes = new FlowLayoutPanel { AutoSize = true };
            sizes.Controls.Add(Ui.Lbl("Text size:"));
            foreach (var s in new[] { new[] { "compact", "Compact" }, new[] { "normal", "Normal" }, new[] { "large", "Large" } })
            {
                string k = s[0];
                sizes.Controls.Add(Ui.Btn(s[1], delegate { Settings.D.Size = k; Theme.SetSize(k); Settings.Save(); MainForm.Me.Restyle(); }, Settings.D.Size == k ? "on" : ""));
            }
            root.Controls.Add(sizes);

            root.Controls.Add(H("Your name"));
            var nameRow = new FlowLayoutPanel { AutoSize = true, WrapContents = false };
            var nameBox = new TextBox { Text = Settings.D.UserName, Width = Theme.Px(220) };
            nameRow.Controls.Add(nameBox);
            nameRow.Controls.Add(Ui.Btn("Save", delegate { Settings.D.UserName = nameBox.Text.Trim(); Settings.Save(); Ui.Info(this, "Saved."); }));
            nameRow.Controls.Add(Ui.Lbl("Shown as “Issued by” on task sheets you send.", "muted"));
            root.Controls.Add(nameRow);

            root.Controls.Add(H("Data folder"));
            root.Controls.Add(Ui.Lbl("Where your lists are saved. Put it in OneDrive to use the same data on every PC.", "muted"));
            dataLbl = Ui.Lbl("", "bold");
            root.Controls.Add(dataLbl);
            var dataBtns = new FlowLayoutPanel { AutoSize = true };
            dataBtns.Controls.Add(Ui.Btn("Change folder...", ChangeDataFolder, "accent"));
            dataBtns.Controls.Add(Ui.Btn("Use the folder next to the program", delegate { SetDataFolder(""); }));
            dataBtns.Controls.Add(Ui.Btn("Open data folder", delegate { Directory.CreateDirectory(Settings.DataDir); Shell.Open(Settings.DataDir); }));
            root.Controls.Add(dataBtns);

            root.Controls.Add(H("Link to Lew's Tracker (optional)"));
            root.Controls.Add(Ui.Lbl("Pick the web app's data folder (the one with Delegation.json) to see those tasks here too.\nThe Toolbox only reads it - it never changes your web app's data.", "muted"));
            trackerLbl = Ui.Lbl("", "bold");
            root.Controls.Add(trackerLbl);
            var trBtns = new FlowLayoutPanel { AutoSize = true };
            trBtns.Controls.Add(Ui.Btn("Pick Lew's Tracker data folder...", delegate
            {
                var f = Ui.PickFolder(this, "Pick Lew's Tracker data folder (it has Delegation.json)", Settings.D.TrackerFolder);
                if (f == null) return;
                if (!File.Exists(Path.Combine(f, "Delegation.json")) && !Ui.Confirm(this, "There is no Delegation.json in that folder yet.\n\nUse it anyway?")) return;
                Settings.D.TrackerFolder = f; Settings.Save(); Refresh_();
            }));
            trBtns.Controls.Add(Ui.Btn("Unlink", delegate { Settings.D.TrackerFolder = ""; Settings.Save(); Refresh_(); }));
            root.Controls.Add(trBtns);

            root.Controls.Add(H("Keyboard"));
            root.Controls.Add(Ui.Lbl("Ctrl+1 … Ctrl+6 = switch tabs   ·   Ctrl+F = search   ·   Ctrl+V = add a copied path (Launcher)", "muted"));

            root.Controls.Add(H("About"));
            root.Controls.Add(Ui.Lbl("Lew's Toolbox. Settings for this PC: %APPDATA%\\LewsToolbox", "muted"));

            Controls.Add(root);
            Refresh_();
        }

        static Label H(string t) { return new Label { Text = t, AutoSize = true, Tag = "bold", Margin = new Padding(0, Theme.Px(18), 0, Theme.Px(4)) }; }

        public void OnShown() { Refresh_(); }
        public void Reload() { Refresh_(); }

        void Refresh_()
        {
            dataLbl.Text = Settings.DataDir + (Settings.D.DataFolder == "" ? "   (next to the program)" : "");
            trackerLbl.Text = Settings.D.TrackerFolder == "" ? "Not linked" : Settings.D.TrackerFolder;
        }

        void ChangeDataFolder()
        {
            var f = Ui.PickFolder(this, "Pick a folder for Lew's Toolbox data (e.g. in OneDrive)", Settings.DataDir);
            if (f == null) return;
            if (!f.EndsWith("LewsToolbox-data", StringComparison.OrdinalIgnoreCase) && !File.Exists(Path.Combine(f, "launcher.json")))
                f = Path.Combine(f, "LewsToolbox-data");
            SetDataFolder(f);
        }

        void SetDataFolder(string f)
        {
            string oldDir = Settings.DataDir;
            string newDir = f == "" ? Path.Combine(Settings.ExeDir, "LewsToolbox-data") : f;
            if (string.Equals(Path.GetFullPath(oldDir).TrimEnd('\\'), Path.GetFullPath(newDir).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) return;
            try { Directory.CreateDirectory(newDir); }
            catch (Exception e) { Ui.Error(this, "Can't use that folder.", e); return; }

            // copy my data across if the new folder is empty (never overwrite what's there)
            var mine = Directory.Exists(oldDir) ? Directory.GetFiles(oldDir, "*.json") : new string[0];
            bool newHasData = Directory.GetFiles(newDir, "*.json").Length > 0;
            if (mine.Length > 0 && !newHasData && Ui.Confirm(this, "Copy your current data into the new folder?\n\n(Your old folder is kept as it is.)"))
            {
                foreach (var file in mine) File.Copy(file, Path.Combine(newDir, Path.GetFileName(file)), false);
            }
            else if (newHasData) Ui.Info(this, "That folder already has Toolbox data - it will be used as it is.");

            Settings.D.DataFolder = f;
            Settings.Save();
            Refresh_();
            MainForm.Me.ReloadAll();
        }
    }
}
