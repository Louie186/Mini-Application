// Lew's Toolbox - makes real .xlsx files without Excel or extra libraries (an .xlsx is a zip of XML files).
// Supports what the task sheets need: styles, dates, formulas, merged cells, frozen header, filter,
// drop-down lists, grouped rows (+ / -), conditional colours, hidden sheets.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security;
using System.Text;

namespace LewsToolbox
{
    class XStyle
    {
        public bool Bold, Italic, Wrap, Border;
        public double Size = 10;
        public string Color = "FF1F2430", Fill = "", HAlign = "", VAlign = "top", NumFmt = "", Font = "Calibri";
        public int Indent;
        public XStyle Copy() { return (XStyle)MemberwiseClone(); }
        public string Key() { return string.Join("|", Bold, Italic, Wrap, Border, Size, Color, Fill, HAlign, VAlign, NumFmt, Font, Indent); }
    }

    class XSheet
    {
        public string Name;
        public bool VeryHidden, ShowGrid = true;
        public string TabColor = "";
        public int FreezeRows;
        public readonly Dictionary<int, double> Widths = new Dictionary<int, double>();
        public readonly Dictionary<int, double> Heights = new Dictionary<int, double>();
        public readonly Dictionary<int, int> Outline = new Dictionary<int, int>();
        public readonly SortedDictionary<int, SortedDictionary<int, Tuple<object, int>>> Cells = new SortedDictionary<int, SortedDictionary<int, Tuple<object, int>>>();
        public readonly List<string> Merges = new List<string>();
        public readonly List<Tuple<string, string>> Lists = new List<Tuple<string, string>>();          // range, "a,b,c"
        public readonly List<Tuple<string, string, int>> CondFormats = new List<Tuple<string, string, int>>();   // range, formula, dxf index
        public string AutoFilter = "";
        public bool OutlineAbove;
        readonly XBook book;
        public XSheet(XBook b, string name) { book = b; Name = name; }

        /* value: string, number, DateTime, or XFormula */
        public void Set(int row, int col, object value, XStyle st = null)
        {
            SortedDictionary<int, Tuple<object, int>> r;
            if (!Cells.TryGetValue(row, out r)) Cells[row] = r = new SortedDictionary<int, Tuple<object, int>>();
            r[col] = Tuple.Create(value, st == null ? 0 : book.StyleId(st));
        }
        public void Style(int row, int col, XStyle st)
        {
            object v = null;
            SortedDictionary<int, Tuple<object, int>> r;
            if (Cells.TryGetValue(row, out r) && r.ContainsKey(col)) v = r[col].Item1;
            Set(row, col, v, st);
        }
        public static string Ref(int row, int col) { return ColName(col) + row; }
        public static string ColName(int col) { string s = ""; while (col > 0) { int m = (col - 1) % 26; s = (char)('A' + m) + s; col = (col - 1) / 26; } return s; }
    }

    class XFormula { public string F; public XFormula(string f) { F = f; } }

    class XBook
    {
        public readonly List<XSheet> Sheets = new List<XSheet>();
        readonly List<XStyle> styles = new List<XStyle> { new XStyle() };
        readonly Dictionary<string, int> styleIds = new Dictionary<string, int>();
        public readonly List<Tuple<string, bool, string>> Dxfs = new List<Tuple<string, bool, string>>();   // font colour, bold, fill
        public string Creator = "Lew's Toolbox";

        public XBook() { styleIds[styles[0].Key()] = 0; }
        public XSheet Add(string name) { var s = new XSheet(this, name); Sheets.Add(s); return s; }
        public int StyleId(XStyle s)
        {
            string k = s.Key(); int id;
            if (styleIds.TryGetValue(k, out id)) return id;
            styles.Add(s.Copy()); id = styles.Count - 1; styleIds[k] = id; return id;
        }
        public int Dxf(string fontColor, bool bold, string fill) { Dxfs.Add(Tuple.Create(fontColor, bold, fill)); return Dxfs.Count - 1; }

        static string X(string s)
        {
            if (s == null) return "";
            var sb = new StringBuilder();
            foreach (char c in s) { if (c < 32 && c != 9 && c != 10 && c != 13) sb.Append(' '); else if (c == 0xFFFE || c == 0xFFFF) sb.Append(' '); else sb.Append(c); }
            return SecurityElement.Escape(sb.ToString());
        }
        static string N(double d) { return d.ToString("R", CultureInfo.InvariantCulture); }

        public void Save(string path)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path)));
            string tmp = path + ".tmp";
            using (var fs = new FileStream(tmp, FileMode.Create))
            using (var zip = new ZipArchive(fs, ZipArchiveMode.Create))
            {
                Put(zip, "[Content_Types].xml", ContentTypes());
                Put(zip, "_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" Target=\"docProps/core.xml\"/></Relationships>");
                Put(zip, "docProps/core.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"><dc:creator>" + X(Creator) + "</dc:creator><dcterms:created xsi:type=\"dcterms:W3CDTF\">" + DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ") + "</dcterms:created></cp:coreProperties>");
                Put(zip, "xl/workbook.xml", Workbook());
                Put(zip, "xl/_rels/workbook.xml.rels", WorkbookRels());
                Put(zip, "xl/styles.xml", StylesXml());
                for (int i = 0; i < Sheets.Count; i++) Put(zip, "xl/worksheets/sheet" + (i + 1) + ".xml", SheetXml(Sheets[i], i == 0));
            }
            if (File.Exists(path)) File.Delete(path);
            File.Move(tmp, path);
        }

        static void Put(ZipArchive z, string name, string xml)
        {
            var e = z.CreateEntry(name, CompressionLevel.Optimal);
            using (var w = new StreamWriter(e.Open(), new UTF8Encoding(false))) w.Write(xml);
        }

        string ContentTypes()
        {
            var sb = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/><Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/>");
            for (int i = 0; i < Sheets.Count; i++) sb.Append("<Override PartName=\"/xl/worksheets/sheet" + (i + 1) + ".xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>");
            return sb.Append("</Types>").ToString();
        }

        string Workbook()
        {
            var sb = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><bookViews><workbookView xWindow=\"0\" yWindow=\"0\" windowWidth=\"28800\" windowHeight=\"15000\" activeTab=\"0\"/></bookViews><sheets>");
            for (int i = 0; i < Sheets.Count; i++)
                sb.Append("<sheet name=\"" + X(Sheets[i].Name) + "\" sheetId=\"" + (i + 1) + "\"" + (Sheets[i].VeryHidden ? " state=\"veryHidden\"" : "") + " r:id=\"rId" + (i + 1) + "\"/>");
            sb.Append("</sheets>");
            // the filter needs a hidden defined name
            var dn = new StringBuilder();
            for (int i = 0; i < Sheets.Count; i++)
                if (Sheets[i].AutoFilter != "")
                {
                    var p = Sheets[i].AutoFilter.Split(':');
                    dn.Append("<definedName name=\"_xlnm._FilterDatabase\" localSheetId=\"" + i + "\" hidden=\"1\">'" + X(Sheets[i].Name.Replace("'", "''")) + "'!" + Abs(p[0]) + ":" + Abs(p[1]) + "</definedName>");
                }
            if (dn.Length > 0) sb.Append("<definedNames>").Append(dn).Append("</definedNames>");
            return sb.Append("<calcPr calcId=\"191029\" fullCalcOnLoad=\"1\"/></workbook>").ToString();
        }

        static string Abs(string r)
        {
            int i = 0; while (i < r.Length && char.IsLetter(r[i])) i++;
            return "$" + r.Substring(0, i) + "$" + r.Substring(i);
        }

        string WorkbookRels()
        {
            var sb = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">");
            for (int i = 0; i < Sheets.Count; i++) sb.Append("<Relationship Id=\"rId" + (i + 1) + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet" + (i + 1) + ".xml\"/>");
            sb.Append("<Relationship Id=\"rId" + (Sheets.Count + 1) + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>");
            return sb.Append("</Relationships>").ToString();
        }

        string StylesXml()
        {
            var numFmts = new List<string>(); var fonts = new List<string>(); var fills = new List<string> { "<fill><patternFill patternType=\"none\"/></fill>", "<fill><patternFill patternType=\"gray125\"/></fill>" };
            var borders = new List<string> { "<border><left/><right/><top/><bottom/><diagonal/></border>" };
            Func<List<string>, string, int> idx = (l, s) => { int i = l.IndexOf(s); if (i < 0) { l.Add(s); i = l.Count - 1; } return i; };
            var xfs = new StringBuilder();
            foreach (var s in styles)
            {
                string font = "<font>" + (s.Bold ? "<b/>" : "") + (s.Italic ? "<i/>" : "") + "<sz val=\"" + N(s.Size) + "\"/><color rgb=\"" + s.Color + "\"/><name val=\"" + X(s.Font) + "\"/><family val=\"2\"/></font>";
                int fo = idx(fonts, font);
                int fi = s.Fill == "" ? 0 : idx(fills, "<fill><patternFill patternType=\"solid\"><fgColor rgb=\"" + s.Fill + "\"/><bgColor indexed=\"64\"/></patternFill></fill>");
                int bo = s.Border ? idx(borders, "<border><left style=\"thin\"><color rgb=\"FFD0D7E2\"/></left><right style=\"thin\"><color rgb=\"FFD0D7E2\"/></right><top style=\"thin\"><color rgb=\"FFD0D7E2\"/></top><bottom style=\"thin\"><color rgb=\"FFD0D7E2\"/></bottom><diagonal/></border>") : 0;
                int nf = 0;
                if (s.NumFmt == "0%") nf = 9;
                else if (s.NumFmt != "") nf = 164 + idx(numFmts, s.NumFmt);
                string align = "<alignment vertical=\"" + s.VAlign + "\"" + (s.HAlign != "" ? " horizontal=\"" + s.HAlign + "\"" : "") + (s.Wrap ? " wrapText=\"1\"" : "") + (s.Indent > 0 ? " indent=\"" + s.Indent + "\"" : "") + "/>";
                xfs.Append("<xf numFmtId=\"" + nf + "\" fontId=\"" + fo + "\" fillId=\"" + fi + "\" borderId=\"" + bo + "\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\" applyAlignment=\"1\"" + (nf > 0 ? " applyNumberFormat=\"1\"" : "") + ">" + align + "</xf>");
            }
            var sb = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">");
            if (numFmts.Count > 0)
            {
                sb.Append("<numFmts count=\"" + numFmts.Count + "\">");
                for (int i = 0; i < numFmts.Count; i++) sb.Append("<numFmt numFmtId=\"" + (164 + i) + "\" formatCode=\"" + X(numFmts[i]) + "\"/>");
                sb.Append("</numFmts>");
            }
            sb.Append("<fonts count=\"" + fonts.Count + "\">" + string.Concat(fonts) + "</fonts>");
            sb.Append("<fills count=\"" + fills.Count + "\">" + string.Concat(fills) + "</fills>");
            sb.Append("<borders count=\"" + borders.Count + "\">" + string.Concat(borders) + "</borders>");
            sb.Append("<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>");
            sb.Append("<cellXfs count=\"" + styles.Count + "\">" + xfs + "</cellXfs>");
            sb.Append("<cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles>");
            sb.Append("<dxfs count=\"" + Dxfs.Count + "\">");
            foreach (var d in Dxfs)
                sb.Append("<dxf>" + (d.Item1 != "" || d.Item2 ? "<font>" + (d.Item2 ? "<b/>" : "") + (d.Item1 != "" ? "<color rgb=\"" + d.Item1 + "\"/>" : "") + "</font>" : "") +
                    (d.Item3 != "" ? "<fill><patternFill patternType=\"solid\"><bgColor rgb=\"" + d.Item3 + "\"/></patternFill></fill>" : "") + "</dxf>");
            sb.Append("</dxfs><tableStyles count=\"0\"/></styleSheet>");
            return sb.ToString();
        }

        string SheetXml(XSheet s, bool first)
        {
            var sb = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">");
            sb.Append("<sheetPr" + (s.AutoFilter != "" ? " filterMode=\"0\"" : "") + ">" + (s.TabColor != "" ? "<tabColor rgb=\"" + s.TabColor + "\"/>" : "") + "<outlinePr summaryBelow=\"" + (s.OutlineAbove ? "0" : "1") + "\"/></sheetPr>");
            sb.Append("<sheetViews><sheetView workbookViewId=\"0\"" + (s.ShowGrid ? "" : " showGridLines=\"0\"") + (first ? " tabSelected=\"1\"" : "") + ">");
            if (s.FreezeRows > 0)
                sb.Append("<pane ySplit=\"" + s.FreezeRows + "\" topLeftCell=\"A" + (s.FreezeRows + 1) + "\" activePane=\"bottomLeft\" state=\"frozen\"/><selection pane=\"bottomLeft\" activeCell=\"A" + (s.FreezeRows + 1) + "\" sqref=\"A" + (s.FreezeRows + 1) + "\"/>");
            sb.Append("</sheetView></sheetViews>");
            int maxOutline = s.Outline.Count == 0 ? 0 : s.Outline.Values.Max();
            sb.Append("<sheetFormatPr defaultRowHeight=\"15\"" + (maxOutline > 0 ? " outlineLevelRow=\"" + maxOutline + "\"" : "") + "/>");
            if (s.Widths.Count > 0)
            {
                sb.Append("<cols>");
                foreach (var w in s.Widths.OrderBy(x => x.Key)) sb.Append("<col min=\"" + w.Key + "\" max=\"" + w.Key + "\" width=\"" + N(w.Value) + "\" customWidth=\"1\"/>");
                sb.Append("</cols>");
            }
            sb.Append("<sheetData>");
            var rowsAll = new SortedSet<int>(s.Cells.Keys.Concat(s.Heights.Keys).Concat(s.Outline.Keys));
            foreach (int r in rowsAll)
            {
                sb.Append("<row r=\"" + r + "\"");
                double h; if (s.Heights.TryGetValue(r, out h)) sb.Append(" ht=\"" + N(h) + "\" customHeight=\"1\"");
                int ol; if (s.Outline.TryGetValue(r, out ol) && ol > 0) sb.Append(" outlineLevel=\"" + ol + "\"");
                sb.Append(">");
                SortedDictionary<int, Tuple<object, int>> cells;
                if (s.Cells.TryGetValue(r, out cells))
                    foreach (var c in cells)
                    {
                        string rf = XSheet.Ref(r, c.Key), st = c.Value.Item2 > 0 ? " s=\"" + c.Value.Item2 + "\"" : "";
                        object v = c.Value.Item1;
                        if (v == null || (v is string && (string)v == "")) sb.Append("<c r=\"" + rf + "\"" + st + "/>");
                        else if (v is XFormula) sb.Append("<c r=\"" + rf + "\"" + st + "><f>" + X(((XFormula)v).F) + "</f></c>");
                        else if (v is DateTime) sb.Append("<c r=\"" + rf + "\"" + st + "><v>" + N(((DateTime)v).ToOADate()) + "</v></c>");
                        else if (v is int || v is double || v is long) sb.Append("<c r=\"" + rf + "\"" + st + "><v>" + N(Convert.ToDouble(v)) + "</v></c>");
                        else
                        {
                            string t = Convert.ToString(v);
                            if (t.Length > 32000) t = t.Substring(0, 32000);
                            sb.Append("<c r=\"" + rf + "\"" + st + " t=\"inlineStr\"><is><t xml:space=\"preserve\">" + X(t) + "</t></is></c>");
                        }
                    }
                sb.Append("</row>");
            }
            sb.Append("</sheetData>");
            if (s.AutoFilter != "") sb.Append("<autoFilter ref=\"" + s.AutoFilter + "\"/>");
            if (s.Merges.Count > 0) { sb.Append("<mergeCells count=\"" + s.Merges.Count + "\">"); foreach (var m in s.Merges) sb.Append("<mergeCell ref=\"" + m + "\"/>"); sb.Append("</mergeCells>"); }
            int pri = 1;
            foreach (var cf in s.CondFormats)
                sb.Append("<conditionalFormatting sqref=\"" + cf.Item1 + "\"><cfRule type=\"expression\" dxfId=\"" + cf.Item3 + "\" priority=\"" + (pri++) + "\"><formula>" + X(cf.Item2) + "</formula></cfRule></conditionalFormatting>");
            if (s.Lists.Count > 0)
            {
                sb.Append("<dataValidations count=\"" + s.Lists.Count + "\">");
                foreach (var l in s.Lists)
                    sb.Append("<dataValidation type=\"list\" allowBlank=\"1\" showErrorMessage=\"1\" errorTitle=\"Status\" error=\"Pick from the list\" sqref=\"" + l.Item1 + "\"><formula1>\"" + X(l.Item2) + "\"</formula1></dataValidation>");
                sb.Append("</dataValidations>");
            }
            sb.Append("<pageMargins left=\"0.5\" right=\"0.5\" top=\"0.6\" bottom=\"0.6\" header=\"0.3\" footer=\"0.3\"/>");
            sb.Append("<pageSetup orientation=\"landscape\" paperSize=\"9\"/>");
            return sb.Append("</worksheet>").ToString();
        }
    }
}
