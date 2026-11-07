// Lew's Toolbox - shared helpers: JSON, safe file saving, CSV, simple .xlsx reading, small UI bits.
// Written for C# 5 so it builds with the compiler that comes with Windows (no install).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Xml;

namespace LewsToolbox
{
    static class Json
    {
        static JavaScriptSerializer Make() { var s = new JavaScriptSerializer(); s.MaxJsonLength = int.MaxValue; s.RecursionLimit = 200; return s; }
        public static string Write(object o) { return Make().Serialize(o); }
        public static T Read<T>(string text) { return Make().Deserialize<T>(text); }
        public static object ReadAny(string text) { return Make().DeserializeObject(text); }

        /* Loads a JSON file. If it is damaged, the backup copy is used instead. */
        public static T Load<T>(string path) where T : new()
        {
            try { if (File.Exists(path)) return Read<T>(File.ReadAllText(path, Encoding.UTF8)); }
            catch (Exception)
            {
                try
                {
                    string bak = path + ".backup";
                    if (File.Exists(bak))
                    {
                        MessageBox.Show("A saved file was damaged, so its backup copy was loaded:\n" + path, "Lew's Toolbox");
                        return Read<T>(File.ReadAllText(bak, Encoding.UTF8));
                    }
                }
                catch (Exception) { }
            }
            return new T();
        }

        /* Saves safely: writes a temp file first, keeps the previous version as ".backup". */
        public static void Save(string path, object o)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, Write(o), new UTF8Encoding(false));
            if (File.Exists(path)) File.Copy(path, path + ".backup", true);
            File.Copy(tmp, path, true);
            File.Delete(tmp);
        }
    }

    static class Csv
    {
        public static string Cell(string v)
        {
            v = v ?? "";
            if (v.IndexOfAny(new[] { ',', '"', '\r', '\n', ';' }) >= 0) return "\"" + v.Replace("\"", "\"\"") + "\"";
            return v;
        }

        /* Writes a CSV that Excel opens with the right characters (UTF-8 with BOM). */
        public static void Write(string path, IList<string[]> rows)
        {
            var sb = new StringBuilder();
            foreach (var r in rows) sb.Append(string.Join(",", r.Select(Cell).ToArray())).Append("\r\n");
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, sb.ToString(), new UTF8Encoding(true));
        }

        /* Reads a CSV saved by Excel: UTF-8 or the PC's own code page, comma / semicolon / tab. */
        public static List<string[]> Read(string path)
        {
            byte[] bytes = File.ReadAllBytes(path);
            string text;
            try { text = new UTF8Encoding(false, true).GetString(bytes); }
            catch (DecoderFallbackException) { text = Encoding.Default.GetString(bytes); }
            text = text.TrimStart('﻿');
            string first = text.Split('\n')[0];
            char sep = ',';
            int c = first.Count(ch => ch == ','), s = first.Count(ch => ch == ';'), t = first.Count(ch => ch == '\t');
            if (s > c && s >= t) sep = ';'; else if (t > c && t > s) sep = '\t';
            var rows = new List<string[]>();
            var row = new List<string>();
            var cell = new StringBuilder();
            bool q = false;
            for (int i = 0; i < text.Length; i++)
            {
                char ch = text[i];
                if (q)
                {
                    if (ch == '"') { if (i + 1 < text.Length && text[i + 1] == '"') { cell.Append('"'); i++; } else q = false; }
                    else cell.Append(ch);
                }
                else if (ch == '"') q = true;
                else if (ch == sep) { row.Add(cell.ToString()); cell.Clear(); }
                else if (ch == '\r') { }
                else if (ch == '\n') { row.Add(cell.ToString()); cell.Clear(); rows.Add(row.ToArray()); row = new List<string>(); }
                else cell.Append(ch);
            }
            if (cell.Length > 0 || row.Count > 0) { row.Add(cell.ToString()); rows.Add(row.ToArray()); }
            return rows;
        }
    }

    /* Reads the first sheet of an .xlsx file without Excel (an .xlsx is a zip of XML files). */
    static class Xlsx
    {
        public static List<string[]> ReadFirstSheet(string path)
        {
            var rows = new List<string[]>();
            // open shared so it still works while the file is open in Excel
            using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            using (var zip = new ZipArchive(fs, ZipArchiveMode.Read))
            {
                var shared = new List<string>();
                var ss = zip.GetEntry("xl/sharedStrings.xml");
                if (ss != null)
                {
                    var d = LoadXml(ss);
                    foreach (XmlNode si in d.GetElementsByTagName("si"))
                    {
                        var sb = new StringBuilder();
                        foreach (XmlNode tn in ((XmlElement)si).GetElementsByTagName("t")) sb.Append(tn.InnerText);
                        shared.Add(sb.ToString());
                    }
                }
                string sheetPath = FirstSheetPath(zip);
                var se = zip.GetEntry(sheetPath);
                if (se == null) throw new Exception("No sheet found in " + Path.GetFileName(path));
                var sd = LoadXml(se);
                foreach (XmlNode rn in sd.GetElementsByTagName("row"))
                {
                    var cells = new SortedDictionary<int, string>();
                    foreach (XmlNode cn in ((XmlElement)rn).GetElementsByTagName("c"))
                    {
                        var ce = (XmlElement)cn;
                        int col = ColIndex(ce.GetAttribute("r"));
                        string type = ce.GetAttribute("t"), val = "";
                        var v = ce.GetElementsByTagName("v");
                        if (type == "inlineStr") val = ce.InnerText;
                        else if (v.Count > 0)
                        {
                            val = v[0].InnerText;
                            int idx;
                            if (type == "s" && int.TryParse(val, out idx) && idx < shared.Count) val = shared[idx];
                        }
                        if (col < 0) col = cells.Count == 0 ? 0 : cells.Keys.Max() + 1;
                        cells[col] = val;
                    }
                    int n = cells.Count == 0 ? 0 : cells.Keys.Max() + 1;
                    var arr = new string[n];
                    for (int i = 0; i < n; i++) arr[i] = cells.ContainsKey(i) ? cells[i] : "";
                    rows.Add(arr);
                }
            }
            return rows;
        }

        static string FirstSheetPath(ZipArchive zip)
        {
            try
            {
                var wb = LoadXml(zip.GetEntry("xl/workbook.xml"));
                var sheet = (XmlElement)wb.GetElementsByTagName("sheet")[0];
                string rid = sheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships");
                var rels = LoadXml(zip.GetEntry("xl/_rels/workbook.xml.rels"));
                foreach (XmlElement r in rels.GetElementsByTagName("Relationship"))
                    if (r.GetAttribute("Id") == rid)
                    {
                        string t = r.GetAttribute("Target").TrimStart('/');
                        return t.StartsWith("xl/") ? t : "xl/" + t;
                    }
            }
            catch (Exception) { }
            return "xl/worksheets/sheet1.xml";
        }

        static XmlDocument LoadXml(ZipArchiveEntry e)
        {
            var d = new XmlDocument();
            using (var s = e.Open()) d.Load(s);
            return d;
        }

        static int ColIndex(string cellRef)
        {
            if (string.IsNullOrEmpty(cellRef)) return -1;
            int n = 0, i = 0;
            while (i < cellRef.Length && char.IsLetter(cellRef[i])) { n = n * 26 + (char.ToUpperInvariant(cellRef[i]) - 'A' + 1); i++; }
            return n - 1;
        }

        /* Excel stores dates as day numbers - turns "45600" into a date (empty if it isn't one). */
        public static string DateText(string v)
        {
            double d;
            if (double.TryParse(v, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out d) && d > 20000 && d < 80000)
                return DateTime.FromOADate(d).ToString("yyyy-MM-dd");
            return v;
        }
    }

    /* Reads a table from .csv or .xlsx - whichever the person picked. */
    static class Table
    {
        public static List<string[]> Read(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            if (ext == ".xlsx" || ext == ".xlsm") return Xlsx.ReadFirstSheet(path);
            return Csv.Read(path);
        }
        public static string Get(string[] row, int i) { return i >= 0 && i < row.Length ? (row[i] ?? "").Trim() : ""; }
        /* finds a column by any of the given header names (not case sensitive) */
        public static int Col(string[] head, params string[] names)
        {
            for (int i = 0; i < head.Length; i++)
            {
                string h = (head[i] ?? "").Trim().ToLowerInvariant();
                foreach (var n in names) if (h == n.ToLowerInvariant()) return i;
            }
            return -1;
        }
    }

    static class Shell
    {
        public static bool IsWeb(string p)
        {
            return p != null && (p.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || p.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
                || p.StartsWith("www.", StringComparison.OrdinalIgnoreCase) || p.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase));
        }

        public static void Open(string p)
        {
            if (p.StartsWith("www.", StringComparison.OrdinalIgnoreCase)) p = "https://" + p;
            var psi = new ProcessStartInfo(p) { UseShellExecute = true };
            if (!IsWeb(p))
            {
                try { string dir = Path.GetDirectoryName(p); if (!string.IsNullOrEmpty(dir)) psi.WorkingDirectory = dir; } catch (Exception) { }
            }
            Process.Start(psi);
        }

        /* Opens the folder with the file selected */
        public static void ShowInFolder(string p)
        {
            if (Directory.Exists(p)) Process.Start("explorer.exe", "\"" + p + "\"");
            else Process.Start("explorer.exe", "/select,\"" + p + "\"");
        }

        public static bool Exists(string p)
        {
            try { return File.Exists(p) || Directory.Exists(p); } catch (Exception) { return false; }
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct SHFILEINFO
        {
            public IntPtr hIcon; public int iIcon; public uint dwAttributes;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szDisplayName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string szTypeName;
        }
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        static extern IntPtr SHGetFileInfo(string pszPath, uint attr, ref SHFILEINFO psfi, uint cb, uint flags);
        [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr h);

        /* The Windows icon for a file / folder. Works for missing files too (by their extension). */
        public static Bitmap IconFor(string path, bool large, bool isFolder)
        {
            try
            {
                var info = new SHFILEINFO();
                uint flags = 0x100 | (large ? 0u : 0x1u);              // SHGFI_ICON | small/large
                bool real = Exists(path);
                if (!real) flags |= 0x10;                             // SHGFI_USEFILEATTRIBUTES
                uint attr = isFolder ? 0x10u : 0x80u;
                IntPtr r = SHGetFileInfo(path, attr, ref info, (uint)Marshal.SizeOf(info), flags);
                if (r == IntPtr.Zero || info.hIcon == IntPtr.Zero) return null;
                using (var ic = Icon.FromHandle(info.hIcon))
                {
                    var bmp = ic.ToBitmap();
                    DestroyIcon(info.hIcon);
                    return bmp;
                }
            }
            catch (Exception) { return null; }
        }
    }

    static class Names
    {
        static readonly char[] Bad = Path.GetInvalidFileNameChars();
        public static string Stamp() { return DateTime.Now.ToString("yyyy-MM-dd_HHmm"); }
        public static string Safe(string s)
        {
            var sb = new StringBuilder();
            foreach (char c in s ?? "") sb.Append(Bad.Contains(c) ? '_' : c);
            return sb.ToString().Trim();
        }
        /* A friendly name from a path or link: "Report.xlsx" -> "Report", "https://www.site.com/x" -> "site.com" */
        public static string Guess(string p)
        {
            if (string.IsNullOrEmpty(p)) return "";
            if (Shell.IsWeb(p))
            {
                try
                {
                    string u = p.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? "https://" + p : p;
                    string host = new Uri(u).Host;
                    return host.StartsWith("www.") ? host.Substring(4) : host;
                }
                catch (Exception) { return p; }
            }
            string t = p.TrimEnd('\\', '/');
            string name = Path.GetFileName(t);
            if (string.IsNullOrEmpty(name)) return t;
            return Directory.Exists(t) ? name : Path.GetFileNameWithoutExtension(name);
        }
        /* Clean up a pasted path: quotes from "Copy as path", file:/// links */
        public static string CleanPath(string p)
        {
            p = (p ?? "").Trim().Trim('"').Trim();
            if (p.StartsWith("file:///", StringComparison.OrdinalIgnoreCase))
            {
                try { p = new Uri(p).LocalPath; } catch (Exception) { }
            }
            return p;
        }
    }
}
