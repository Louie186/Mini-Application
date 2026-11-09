// Lew's Toolbox - Delegate tab, part 2: the files that go out and come back.
// Same formats as Lew's Tracker (web app) so files and replies work in both:
//   - Excel task plan (.xlsx): Tasks sheet (yellow = fill in, Status drop-down, grouped rows), Guide, hidden _lt sheet
//   - HTML task pack (.html): one offline page; the person sends back a reply (.txt or pasted text with the LTUPDATE1 code)
//   - Simple Excel table (.xlsx): plain rows to copy by hand (can still be read back: ID / Status / Notes)
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;

namespace LewsToolbox
{
    class DSub
    {
        public string Id = "", Code = "", Title = "", Who = "", Due = "", Status = "Not started", Notes = "", Updated = "";
    }

    class DTask
    {
        public string Id = "", Code = "", Title = "", Group = "", Project = "", Who = "", Due = "", Status = "Not started", Notes = "", Created = "", Updated = "";
        public List<DSub> Subs = new List<DSub>();
        public List<string> History = new List<string>();
        [System.Web.Script.Serialization.ScriptIgnore] public bool FromWeb;     // read-only copy from Lew's Tracker
    }

    class DIssue { public string ExportId = "", When = "", To = "", Folder = ""; public List<string> Codes = new List<string>(); }
    class DImport { public string When = "", From = "", File = ""; public int Changes; }

    class DData
    {
        public List<DTask> Tasks = new List<DTask>();
        public int Seq;
        public string Project = "";
        public List<DIssue> Issued = new List<DIssue>();
        public List<DImport> Imports = new List<DImport>();
    }

    /* one line read back from a returned file */
    class DRow { public string Id = "", Title = "", Group = "", Who = "", Due = "", Status = "", Notes; public bool Derived; }
    class DReply { public string From = "", ExportId = "", Project = "", Message = "", File = ""; public List<DRow> Rows = new List<DRow>(); }

    static class DelegateFiles
    {
        public static readonly string[] Statuses = { "Not started", "In progress", "Completed" };
        public const string MARK = "LTUPDATE1:";

        public static List<string> SplitNames(string s)
        {
            return Regex.Split(s ?? "", @"\s*(?:,|;|&|/|\band\b)\s*", RegexOptions.IgnoreCase).Select(x => x.Trim()).Where(x => x != "").ToList();
        }
        public static bool Has(string who, string person) { return SplitNames(who).Any(n => string.Equals(n, person, StringComparison.OrdinalIgnoreCase)); }

        public static string StatusOf(DTask t)
        {
            if (t.Subs.Count == 0) return t.Status;
            if (t.Subs.All(s => s.Status == "Completed")) return "Completed";
            if (t.Subs.All(s => s.Status == "Not started")) return "Not started";
            return "In progress";
        }
        public static double Progress(DTask t)
        {
            if (t.Subs.Count == 0) return t.Status == "Completed" ? 1 : t.Status == "In progress" ? 0.5 : 0;
            return t.Subs.Sum(s => s.Status == "Completed" ? 1 : s.Status == "In progress" ? 0.5 : 0) / t.Subs.Count;
        }
        /* "Done" / "Yes" (checklist style) -> Completed, "No" -> Not started */
        public static string Norm(string v)
        {
            string t = (v ?? "").Trim().ToLowerInvariant();
            if (t == "done" || t == "yes" || t == "complete" || t == "completed") return "Completed";
            if (t == "in progress" || t == "wip" || t == "started" || t == "doing") return "In progress";
            if (t == "no" || t == "not started" || t == "not yet" || t == "to do") return "Not started";
            return (v ?? "").Trim();
        }
        static DateTime? D(string s) { DateTime d; return DateTime.TryParseExact(s ?? "", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out d) ? d : (DateTime?)null; }

        /* ---------- Excel task plan (same look as the web app) ---------- */
        const string CTitle = "FF3D2B56", CSub = "FF5B3E7E", CHead = "FFD9E1F2", CRow = "FFFBFBFD", CFill = "FFFFF2CC", CInk = "FF1F2430", CMuted = "FF6B7280", CWhite = "FFFFFFFF", CRed = "FFC0392B", COk = "FF2E8B57";

        public static void BuildPlan(string path, List<DTask> tasks, string project, string issuedBy, string scope, string exportId)
        {
            var wb = new XBook();
            var ws = wb.Add("Tasks");
            ws.TabColor = CSub; ws.ShowGrid = false; ws.FreezeRows = 5; ws.OutlineAbove = true;
            string[] head = { "ID", "Task / Checklist item", "Group", "Assignee", "Target date", "Status", "Progress", "Notes" };
            double[] widths = { 8, 46, 18, 18, 13, 14, 10, 44 };
            for (int i = 0; i < widths.Length; i++) ws.Widths[i + 1] = widths[i];
            const int H = 5; int last = head.Length;
            var issued = DateTime.Now;

            ws.Merges.Add("A1:H1");
            ws.Set(1, 1, "TASK PLAN   |   " + project, new XStyle { Bold = true, Size = 14, Color = CWhite, Fill = CTitle, VAlign = "center", Indent = 1 });
            for (int c = 2; c <= last; c++) ws.Style(1, c, new XStyle { Fill = CTitle });
            ws.Heights[1] = 26;
            ws.Set(2, 1, "Issued by: " + (issuedBy == "" ? "\u2014" : issuedBy) + "     Issued: " + issued.ToString("ddd dd MMM yyyy", CultureInfo.InvariantCulture) + (scope != "" ? "     For: " + scope : ""), new XStyle { Color = CMuted });
            ws.Set(3, 1, "Update the YELLOW boxes (Status, Notes).  To ADD: insert a row in a group (ID empty) = new item;  use a NEW block at the bottom = new task.  Then send the file back.", new XStyle { Italic = true, Color = CSub });
            var hs = new XStyle { Bold = true, Color = CWhite, Fill = CSub, Border = true, VAlign = "center" };
            for (int i = 0; i < last; i++) { var h = hs.Copy(); h.HAlign = i == 0 || (i >= 4 && i <= 6) ? "center" : "left"; ws.Set(H, i + 1, head[i], h); }
            ws.Heights[H] = 22;

            int r = H + 1;
            var statusCells = new List<string>();
            Func<bool, int, XStyle> cellStyle = (isTask, c) => new XStyle
            {
                Border = true, Fill = isTask ? CHead : CRow, Bold = isTask && c <= 2, Color = CInk, Wrap = c == 2 || c == 8,
                HAlign = c == 1 || (c >= 5 && c <= 7) ? "center" : "left", Indent = !isTask && c == 2 ? 2 : 0,
                NumFmt = c == 5 ? "dd mmm yyyy" : c == 7 ? "0%" : ""
            };
            Action<int, bool> styleRow = (row, isTask) => { for (int c = 1; c <= last; c++) ws.Style(row, c, cellStyle(isTask, c)); };
            Action<int, int> yellow = (row, c) => { var st = cellStyle(false, c); st.Fill = CFill; ws.Style(row, c, st); };
            Func<int, string> pct = row => "IF(F" + row + "=\"Completed\",1,IF(F" + row + "=\"In progress\",0.5,0))";

            foreach (var t in tasks)
            {
                int tr = r;
                styleRow(tr, true);
                SetKeep(ws, tr, 1, t.Code); SetKeep(ws, tr, 2, t.Title); SetKeep(ws, tr, 3, t.Group); SetKeep(ws, tr, 4, t.Who);
                var due = D(t.Due); if (due != null) SetKeep(ws, tr, 5, due.Value);
                SetKeep(ws, tr, 8, t.Notes);
                if (t.Subs.Count > 0)
                {
                    int a = tr + 1, b = tr + t.Subs.Count; string rng = "F" + a + ":F" + b;
                    SetKeep(ws, tr, 7, new XFormula("IFERROR((COUNTIF(" + rng + ",\"Completed\")+COUNTIF(" + rng + ",\"In progress\")/2)/" + t.Subs.Count + ",0)"));
                    SetKeep(ws, tr, 6, new XFormula("IF(COUNTIF(" + rng + ",\"Completed\")=" + t.Subs.Count + ",\"Completed\",IF(COUNTIF(" + rng + ",\"Not started\")=" + t.Subs.Count + ",\"Not started\",\"In progress\"))"));
                    var it = cellStyle(true, 6); it.Italic = true; it.Color = CMuted; it.Bold = false; ws.Style(tr, 6, it);
                    var nt = cellStyle(true, 8); nt.Fill = CFill; ws.Style(tr, 8, nt);
                }
                else
                {
                    SetKeep(ws, tr, 6, Statuses.Contains(t.Status) ? t.Status : "Not started");
                    SetKeep(ws, tr, 7, new XFormula(pct(tr)));
                    var st6 = cellStyle(true, 6); st6.Fill = CFill; ws.Style(tr, 6, st6);
                    var st8 = cellStyle(true, 8); st8.Fill = CFill; ws.Style(tr, 8, st8);
                    statusCells.Add("F" + tr);
                }
                r++;
                foreach (var s in t.Subs)
                {
                    styleRow(r, false);
                    SetKeep(ws, r, 1, s.Code); SetKeep(ws, r, 2, s.Title); SetKeep(ws, r, 4, s.Who);
                    var sd = D(s.Due) ?? due; if (sd != null) SetKeep(ws, r, 5, sd.Value);
                    SetKeep(ws, r, 6, Statuses.Contains(s.Status) ? s.Status : "Not started");
                    SetKeep(ws, r, 7, new XFormula(pct(r)));
                    SetKeep(ws, r, 8, s.Notes);
                    yellow(r, 6); yellow(r, 8);
                    statusCells.Add("F" + r);
                    ws.Outline[r] = 1;
                    r++;
                }
            }
            // ready-made empty task blocks (already grouped with + / -) for adding new work in Excel
            ws.Set(r, 1, "ADD NEW TASKS BELOW \u2014 type a task name next to NEW, its items in the rows under it. Empty blocks are ignored on import.", new XStyle { Italic = true, Size = 9, Color = CSub });
            r++;
            for (int k = 0; k < 3; k++)
            {
                styleRow(r, true);
                SetKeep(ws, r, 1, "NEW");
                foreach (int c in new[] { 2, 3, 4, 5, 6, 8 }) { var st = cellStyle(true, c); st.Fill = CFill; ws.Style(r, c, st); }
                statusCells.Add("F" + r);
                r++;
                for (int j = 0; j < 5; j++)
                {
                    styleRow(r, false);
                    foreach (int c in new[] { 2, 4, 5, 6, 8 }) yellow(r, c);
                    statusCells.Add("F" + r);
                    ws.Outline[r] = 1;
                    r++;
                }
            }
            int LAST = Math.Max(r - 1, H + 1);
            if (statusCells.Count > 0) ws.Lists.Add(Tuple.Create(string.Join(" ", statusCells), string.Join(",", Statuses)));
            ws.AutoFilter = "A" + H + ":H" + LAST;
            int late = wb.Dxf(CRed, true, ""), ok = wb.Dxf(COk, false, ""), full = wb.Dxf("", false, "FFE2F0D9"), part = wb.Dxf("", false, "FFFFF4D6");
            string body = "A" + (H + 1) + ":H" + LAST;
            ws.CondFormats.Add(Tuple.Create(body, "AND($E" + (H + 1) + "<>\"\",$E" + (H + 1) + "<TODAY(),$F" + (H + 1) + "<>\"Completed\")", late));
            ws.CondFormats.Add(Tuple.Create(body, "$F" + (H + 1) + "=\"Completed\"", ok));
            ws.CondFormats.Add(Tuple.Create("G" + (H + 1) + ":G" + LAST, "AND(ISNUMBER(G" + (H + 1) + "),G" + (H + 1) + ">=1)", full));
            ws.CondFormats.Add(Tuple.Create("G" + (H + 1) + ":G" + LAST, "AND(ISNUMBER(G" + (H + 1) + "),G" + (H + 1) + ">0,G" + (H + 1) + "<1)", part));
            string F = "F" + (H + 1) + ":F" + LAST, E = "E" + (H + 1) + ":E" + LAST;
            var lbl = new XStyle { Bold = true, Size = 9, Color = CMuted, HAlign = "right" };
            ws.Set(2, 6, "Done", lbl); ws.Set(2, 7, new XFormula("COUNTIF(" + F + ",\"Completed\")&\" / \"&COUNTA(" + F + ")"), new XStyle { Bold = true, Size = 11, HAlign = "center" });
            ws.Set(3, 6, "Overdue", lbl); ws.Set(3, 7, new XFormula("COUNTIFS(" + E + ",\"<\"&TODAY()," + F + ",\"<>Completed\")"), new XStyle { Bold = true, Size = 11, Color = CRed, HAlign = "center" });

            var g = wb.Add("Guide");
            g.ShowGrid = false; g.Widths[1] = 96;
            g.Set(1, 1, "HOW TO USE THIS FILE", new XStyle { Bold = true, Size = 14, Color = CWhite, Fill = CTitle });
            string[] guide =
            {
                "", "1.  Go to the Tasks sheet and find your name under Assignee.",
                "2.  Change Status with the drop-down: Not started / In progress / Completed.",
                "3.  Write your updates in Notes.",
                "4.  Only the YELLOW boxes are for you. Progress and the main task status fill in by themselves.",
                "5.  Use + / \u2212 on the left to open or close sub-rows.",
                "6.  Save and send the file back. Please keep the IDs and the file name as they are.",
                "", "ADDING MORE IN THE SAME FILE",
                "\u2022  New sub-item:  right-click a row inside the task's group \u2192 Insert.  Leave ID EMPTY.  Type the item name (Assignee, Target date, Status optional).",
                "\u2022  New task:  use an empty NEW block at the bottom (already grouped with + / \u2212).  Type the task name next to NEW and its items in the rows under it.",
                "   Need more?  Copy a whole NEW block (task row + its rows) and paste it below.  Or type NEW in the ID of any new row.",
                "", "Red text = overdue.   Green text = completed.", "", "Made with Lew's Toolbox \u2014 Delegate."
            };
            for (int i = 0; i < guide.Length; i++) g.Set(i + 2, 1, guide[i], new XStyle { Size = 11 });

            var meta = wb.Add("_lt");
            meta.VeryHidden = true;
            meta.Set(1, 1, "lt-planner"); meta.Set(1, 2, 2);
            meta.Set(2, 1, "toolbox"); meta.Set(3, 1, exportId); meta.Set(4, 1, issued.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")); meta.Set(5, 1, project);
            wb.Save(path);
        }

        /* sets a value and keeps the style already on the cell */
        static void SetKeep(XSheet ws, int row, int col, object v)
        {
            SortedDictionary<int, Tuple<object, int>> r;
            int st = ws.Cells.TryGetValue(row, out r) && r.ContainsKey(col) ? r[col].Item2 : 0;
            if (!ws.Cells.ContainsKey(row)) ws.Cells[row] = new SortedDictionary<int, Tuple<object, int>>();
            ws.Cells[row][col] = Tuple.Create(v is string && (string)v == "" ? null : v, st);
        }

        /* ---------- simple Excel table ---------- */
        public static void BuildSimple(string path, List<DTask> tasks, string project, string issuedBy, string scope)
        {
            var wb = new XBook();
            var ws = wb.Add("Tasks");
            ws.FreezeRows = 3;
            string[] head = { "ID", "Task", "Item", "Assigned to", "Due date", "Status", "Notes" };
            double[] w = { 9, 40, 40, 18, 13, 14, 44 };
            for (int i = 0; i < w.Length; i++) ws.Widths[i + 1] = w[i];
            ws.Set(1, 1, "Tasks for " + scope + "  \u2014  " + project + "  \u2014  from " + issuedBy + ", " + DateTime.Now.ToString("dd MMM yyyy", CultureInfo.InvariantCulture), new XStyle { Bold = true, Size = 13 });
            var hs = new XStyle { Bold = true, Fill = "FFE7E9EF", Border = true };
            for (int i = 0; i < head.Length; i++) ws.Set(3, i + 1, head[i], hs);
            int r = 4;
            Action<object[], bool> put = (vals, bold) =>
            {
                for (int i = 0; i < vals.Length; i++)
                    ws.Set(r, i + 1, vals[i], new XStyle { Border = true, Wrap = i == 1 || i == 2 || i == 6, Bold = bold && i < 3, NumFmt = i == 4 ? "dd mmm yyyy" : "" });
                r++;
            };
            foreach (var t in tasks)
            {
                var due = D(t.Due);
                put(new object[] { t.Code, t.Title, "", t.Who, due.HasValue ? (object)due.Value : "", t.Subs.Count > 0 ? "" : t.Status, t.Notes }, true);
                foreach (var s in t.Subs) { var sd = D(s.Due) ?? due; put(new object[] { s.Code, "", s.Title, s.Who, sd.HasValue ? (object)sd.Value : "", s.Status, s.Notes }, false); }
            }
            wb.Save(path);
        }

        /* ---------- HTML task pack ---------- */
        public static string Runtime()
        {
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("taskpack-runtime.js"))
            {
                if (s == null) throw new Exception("The task-pack page is missing from the program - run Build.bat again.");
                using (var rd = new StreamReader(s, Encoding.UTF8)) return rd.ReadToEnd();
            }
        }

        public static void BuildPack(string path, List<DTask> tasks, string project, string projectId, string issuedBy, string label, string person, string exportId)
        {
            var data = new Dictionary<string, object>
            {
                { "id", exportId }, { "projectId", projectId }, { "project", project }, { "by", issuedBy }, { "at", DateTime.Today.ToString("yyyy-MM-dd") },
                { "label", label }, { "person", person }, { "MARK", MARK },
                { "tasks", tasks.Select(t => new Dictionary<string, object> {
                    { "code", t.Code }, { "group", t.Group }, { "title", t.Title }, { "due", t.Due }, { "status", t.Status }, { "notes", t.Notes },
                    { "subs", t.Subs.Select(s => new Dictionary<string, object> { { "code", s.Code }, { "title", s.Title }, { "due", s.Due == "" ? t.Due : s.Due }, { "status", s.Status }, { "notes", s.Notes } }).ToList() }
                }).ToList() }
            };
            string src = Runtime();
            src = src.Substring(src.IndexOf('{') + 1, src.LastIndexOf('}') - src.IndexOf('{') - 1);
            string key = RandKey();
            string blob = Scramble(src + "\u0000" + Json.Write(data), key);
            string html = "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
                "<title>Tasks \u2014 " + HtmlEsc(label) + "</title></head><body>" +
                "<div id=\"app\" style=\"font:16px system-ui;padding:24px\">Opening your tasks\u2026</div>" +
                "<noscript><p style=\"font:16px system-ui;padding:24px\">Please open this file in Chrome or Edge.</p></noscript>" +
                "<script>(function(k,d){try{var b=atob(d),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i)^k.charCodeAt(i%k.length);" +
                "var s=new TextDecoder().decode(u),j=s.indexOf(\"\\u0000\");new Function(\"P\",s.slice(0,j))(JSON.parse(s.slice(j+1)));}" +
                "catch(e){document.getElementById(\"app\").textContent=\"This file could not open. Please use Chrome or Edge, or ask for a new file.\";}})(" +
                "\"" + key + "\",\"" + blob + "\");</script></body></html>";
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, html, new UTF8Encoding(false));
        }

        static string RandKey()
        {
            var rnd = new Random(); var sb = new StringBuilder();
            while (sb.Length < 24) { char c = (char)(33 + rnd.Next(90)); if (c != '"' && c != '\\' && c != '<' && c != '>') sb.Append(c); }
            return sb.ToString();
        }
        static string Scramble(string text, string key)
        {
            var u = Encoding.UTF8.GetBytes(text);
            for (int i = 0; i < u.Length; i++) u[i] ^= (byte)key[i % key.Length];
            return Convert.ToBase64String(u);
        }
        static string HtmlEsc(string s) { return (s ?? "").Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;"); }

        /* ---------- reading what comes back ---------- */
        public static DReply ReadFile(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            if (ext == ".xlsx" || ext == ".xlsm") return ReadExcel(path);
            var r = ParseReply(File.ReadAllText(path, Encoding.UTF8));
            r.File = Path.GetFileName(path);
            return r;
        }

        public static DReply ParseReply(string text)
        {
            int i = (text ?? "").IndexOf(MARK, StringComparison.Ordinal);
            if (i < 0) throw new Exception("This is not a Task Pack reply (no update code found).");
            string code = Regex.Replace(text.Substring(i + MARK.Length), "[^A-Za-z0-9+/=]", "");
            Dictionary<string, object> j;
            try { j = Json.ReadAny(Encoding.UTF8.GetString(Convert.FromBase64String(code))) as Dictionary<string, object>; }
            catch (Exception) { throw new Exception("The update code is damaged \u2014 ask them to send the reply file instead of copying it."); }
            if (j == null || !j.ContainsKey("kind") || Convert.ToString(j["kind"]) != "lt-taskpack-reply" || !(j["rows"] is object[])) throw new Exception("This is not a Task Pack reply.");
            Func<Dictionary<string, object>, string, string> g = (d, k) => d.ContainsKey(k) && d[k] != null ? Convert.ToString(d[k]) : "";
            var rep = new DReply { ExportId = g(j, "pack"), Project = g(j, "project"), Message = g(j, "message") };
            rep.From = g(j, "name") != "" ? g(j, "name") : g(j, "person") != "" ? g(j, "person") : g(j, "label");
            foreach (var o in ((object[])j["rows"]).Take(5000))
            {
                var d = o as Dictionary<string, object>; if (d == null) continue;
                rep.Rows.Add(new DRow
                {
                    Id = g(d, "id"), Title = g(d, "title"), Status = Norm(g(d, "status")), Due = Regex.IsMatch(g(d, "due"), @"^\d{4}-\d{2}-\d{2}$") ? g(d, "due") : "",
                    Notes = d.ContainsKey("notes") && d["notes"] != null ? Convert.ToString(d["notes"]) : null, Derived = d.ContainsKey("derived") && d["derived"] is bool && (bool)d["derived"]
                });
            }
            return rep;
        }

        public static DReply ReadExcel(string path)
        {
            var rep = new DReply { File = Path.GetFileName(path) };
            var meta = Xlsx.ReadSheet(path, "_lt");
            if (meta != null)
            {
                Func<int, string> m = r => meta.Count >= r && meta[r - 1].Length > 0 ? meta[r - 1][0] : "";
                rep.ExportId = m(3); rep.Project = m(5);
            }
            var rows = Xlsx.ReadSheet(path, "Tasks") ?? Xlsx.ReadSheet(path, "Checklist generator") ?? Xlsx.ReadFirstSheet(path);
            int head = -1; int cWid = -1, cId = -1, cSt = -1, cNotes = -1, cSub = -1, cTitle = -1, cGroup = -1, cWho = -1, cDue = -1;
            for (int r = 0; r < Math.Min(20, rows.Count) && head < 0; r++)
            {
                int wid = -1, id = -1, st = -1, no = -1, sub = -1, ti = -1, gr = -1, who = -1, due = -1;
                for (int c = 0; c < rows[r].Length; c++)
                {
                    string t = (rows[r][c] ?? "").Trim().ToLowerInvariant(); if (t == "") continue;
                    if (t == "website id") { if (wid < 0) wid = c; }
                    else if (t == "id" || t == "task id") { if (id < 0) id = c; }
                    else if (t.StartsWith("status")) { if (st < 0) st = c; }
                    else if (Regex.IsMatch(t, "^notes?$")) { if (no < 0) no = c; }
                    else if (Regex.IsMatch(t, "^(subtask|item)")) { if (sub < 0) sub = c; }
                    else if (t.StartsWith("task")) { if (ti < 0) ti = c; }
                    else if (t.StartsWith("group")) { if (gr < 0) gr = c; }
                    else if (t.StartsWith("assignee") || t.StartsWith("assigned")) { if (who < 0) who = c; }
                    else if (t.StartsWith("target date") || t.StartsWith("due")) { if (due < 0) due = c; }
                }
                if (id >= 0 && st >= 0) { head = r; cWid = wid; cId = id; cSt = st; cNotes = no; cSub = sub; cTitle = ti; cGroup = gr; cWho = who; cDue = due; }
            }
            if (head < 0) throw new Exception("Could not find the header row (ID \u2026 Status \u2026 Notes) in " + rep.File + ".");
            for (int r = head + 1; r < rows.Count; r++)
            {
                var R = rows[r];
                string id = Table.Get(R, cId);
                if (cWid >= 0) { string w = Table.Get(R, cWid); id = w != "" ? w : (id != "" ? "NEW" : ""); }
                string title = Regex.Replace(Table.Get(R, cSub) != "" ? Table.Get(R, cSub) : Table.Get(R, cTitle), @"^\u21B3\s*", "");
                if (id == "" && title == "") continue;
                if (Regex.IsMatch(id, "^ADD NEW TASKS", RegexOptions.IgnoreCase)) continue;
                string due = Xlsx.DateText(Table.Get(R, cDue));
                rep.Rows.Add(new DRow
                {
                    Id = id, Title = title, Group = Table.Get(R, cGroup), Who = Table.Get(R, cWho), Due = Regex.IsMatch(due, @"^\d{4}-\d{2}-\d{2}") ? due.Substring(0, 10) : "",
                    Status = Norm(Table.Get(R, cSt)), Notes = cNotes >= 0 ? Table.Get(R, cNotes) : null
                });
            }
            return rep;
        }

        /* ---------- Lew's Tracker (web app) data: Delegation.json = { keys: { "lt_delegate_v1...": {groups, tasks} } } ---------- */
        public static List<DTask> ReadWebApp(string folder)
        {
            var list = new List<DTask>();
            string f = Path.Combine(folder, "Delegation.json");
            if (!File.Exists(f)) return list;
            var root = Json.ReadAny(File.ReadAllText(f, Encoding.UTF8)) as Dictionary<string, object>;
            if (root == null) return list;
            var keys = root.ContainsKey("keys") ? root["keys"] as Dictionary<string, object> : root;
            if (keys == null) return list;
            Func<Dictionary<string, object>, string, string> g = (d, k) => d != null && d.ContainsKey(k) && d[k] != null ? Convert.ToString(d[k]) : "";
            foreach (var kv in keys.Where(k => k.Key.StartsWith("lt_delegate_v1") && !k.Key.StartsWith("lt_delegate_v1_ui")))
            {
                object v = kv.Value;
                if (v is string) { try { v = Json.ReadAny((string)v); } catch (Exception) { continue; } }
                var d = v as Dictionary<string, object>;
                if (d == null || !(d.ContainsKey("tasks") && d["tasks"] is object[])) continue;
                var groups = new Dictionary<string, string>();
                if (d.ContainsKey("groups") && d["groups"] is object[])
                    foreach (var go in (object[])d["groups"]) { var gd = go as Dictionary<string, object>; if (gd != null) groups[g(gd, "id")] = g(gd, "name"); }
                string proj = kv.Key.Length > "lt_delegate_v1".Length ? kv.Key.Substring("lt_delegate_v1".Length).Trim(':', '_', ' ') : "";
                foreach (var to in (object[])d["tasks"])
                {
                    var td = to as Dictionary<string, object>; if (td == null) continue;
                    var t = new DTask
                    {
                        Id = g(td, "id"), Code = g(td, "code"), Title = g(td, "title"), Who = g(td, "assignees"), Due = g(td, "due"), Status = Norm(g(td, "status")),
                        Notes = g(td, "notes"), Project = proj, FromWeb = true
                    };
                    string gid = g(td, "group"); t.Group = groups.ContainsKey(gid) ? groups[gid] : "";
                    if (!Statuses.Contains(t.Status)) t.Status = "Not started";
                    if (td.ContainsKey("subs") && td["subs"] is object[])
                        foreach (var so in (object[])td["subs"])
                        {
                            var sd = so as Dictionary<string, object>; if (sd == null) continue;
                            var s = new DSub { Id = g(sd, "id"), Code = g(sd, "code"), Title = g(sd, "title"), Who = g(sd, "assignees"), Due = g(sd, "due"), Status = Norm(g(sd, "status")), Notes = g(sd, "notes") };
                            if (!Statuses.Contains(s.Status)) s.Status = "Not started";
                            t.Subs.Add(s);
                        }
                    list.Add(t);
                }
            }
            return list;
        }
    }
}
