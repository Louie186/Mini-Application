# -*- coding: utf-8 -*-
"""Issue Sheets by Lew: check what changed, review/fix revisions and title block Yes/No switches,
then export with exact MIDP file names and log every print in one issue register CSV.

Reading and exporting never change a model (detached, closed without saving).
Only 'Apply' changes models: revisions + Yes/No title block parameters, one transaction,
read back, sync + relinquish. An undo log allows 'Revert last apply'.
"""
from __future__ import print_function

__title__ = 'Issue\nSheets'
__author__ = 'Lew'
__context__ = 'zero-doc'

import os
import time

from pyrevit import forms, script      # loads pyRevit (and WPF) first

import clr
for _asm in ('PresentationFramework', 'PresentationCore', 'WindowsBase', 'System.Xaml', 'System.Data'):
    try:
        clr.AddReference(_asm)          # make sure the WPF and DataTable libraries are loaded
    except Exception:
        pass
import System
from System.Data import DataTable
from System.Windows import FrameworkElementFactory, DataTemplate, HorizontalAlignment, GridLength
from System.Windows.Controls import CheckBox, DataGridTemplateColumn
from System.Windows.Data import Binding, BindingMode, UpdateSourceTrigger

import bimexport_core as core
import bimissue_core as issue
import bimexport_ui as ui

ui.setup(__revit__)                     # noqa: F821
app = ui.app
output = script.get_output()
XAML = os.path.join(os.path.dirname(__file__), 'IssueWindow.xaml')


def needs_check(entry):
    return (not entry or 'issue' not in entry or 'orgs' not in entry
            or 'titleblock_types' not in (entry.get('issue') or {}))


def read_issue_extra(doc, guid, entry):
    entry['issue'] = issue.read_issue_data(doc)


def _table(cols):
    """cols: [(name, type)] -> DataTable"""
    t = DataTable()
    for name, typ in cols:
        t.Columns.Add(name, System.Boolean if typ is bool else System.String)
    return t


def _bool_column(name, header, readonly=False):
    """Checkbox column that reacts on the FIRST click (normal WPF needs two)."""
    f = FrameworkElementFactory(clr.GetClrType(CheckBox))
    b = Binding(name)
    b.Mode = BindingMode.OneWay if readonly else BindingMode.TwoWay
    b.UpdateSourceTrigger = UpdateSourceTrigger.PropertyChanged
    f.SetBinding(CheckBox.IsCheckedProperty, b)
    f.SetValue(CheckBox.HorizontalAlignmentProperty, HorizontalAlignment.Center)
    if readonly:
        f.SetValue(CheckBox.IsEnabledProperty, False)
    tmpl = DataTemplate()
    tmpl.VisualTree = f
    col = DataGridTemplateColumn()
    col.Header = header
    col.CellTemplate = tmpl
    col.SortMemberPath = name
    return col


class IssueWindow(ui.ExportSettingsMixin, forms.WPFWindow):

    def __init__(self, state, settings, reg, cache, register_rows):
        forms.WPFWindow.__init__(self, XAML)
        self.state, self.settings, self.reg, self.cache = state, settings, reg, cache
        self.by_sheet, self.by_model = issue.last_issues(register_rows)
        self.action = None
        self._busy = False
        self._headers = {}
        self._load_midp()
        self._tick_request()
        self._fill_settings()
        self._fill_sets()
        self._fill_models()
        self._build_sheets()
        self._fill_rev_models()
        self._fill_tb_sheets()
        self._refresh_changes()
        req = state.get('request')
        if req and state['loaded']:
            self._request_ready()
        self.header_info.Text = u'Revit %s\nIssue register: %d print(s) recorded%s' % (
            app.VersionNumber, len(register_rows),
            (u'\nToolbox request "%s": %d drawing(s)' % (req['name'], len(req['rows']))) if req else u'')
        try:
            if settings.get('issue_col_left'):
                self.col_left.Width = GridLength(float(settings['issue_col_left']))
            if settings.get('issue_col_right'):
                self.col_right.Width = GridLength(float(settings['issue_col_right']))
        except Exception:
            pass

    def _load_midp(self):
        """MIDP file + the codes of a Toolbox request (so a request works even without a MIDP file)."""
        rows = []
        m = self.state.get('midp')
        if m and os.path.exists(m):
            rows = core.read_lod(m)
        if self.state.get('request'):
            rows = rows + issue.request_midp_rows(self.state['request'])
        self.midp = issue.midp_index(rows) if rows else {}

    def _tick_request(self):
        """Tick the requested drawings in each model once it has been checked."""
        req = self.state.get('request')
        if not req:
            return
        done = self.state.setdefault('request_ticked', set())
        want = set(r['seq'].lower() for r in req['rows'])
        for g in self.state['loaded']:
            if g in done:
                continue
            done.add(g)
            for s in (self.cache.get(g) or {}).get('sheets', []):
                if s['number'].strip().lower() in want:
                    self.state['ticked'].add((g, s['number'].strip().lower()))

    def _request_ready(self):
        req = self.state['request']
        want = set(r['seq'].lower() for r in req['rows'])
        rows = [r for r in self._rowinfo.values() if r['num'].strip().lower() in want]
        ok = len([r for r in rows if r['ok']])
        issue.request_status(req, 'ready', u'Checked in Revit: %d ready, %d blocked, %d not found - waiting for Issue' % (
            ok, len(rows) - ok, len(want - set(r['num'].strip().lower() for r in rows))), 0, len(want))

    def _request_gone(self):
        """Cancelled in the Toolbox while this window was open."""
        req = self.state.get('request')
        if req and issue.request_cancelled(req):
            forms.alert(u'The Toolbox request "%s" was cancelled. It is unloaded - the drawings stay ticked; '
                        u'untick them if you don\'t want them.' % req['name'])
            self.state['request'] = None
            issue.drop_cancelled()
            self._load_midp()
            self._build_sheets()
            return True
        return False

    # ================================================================ settings
    def _fill_settings(self):
        s = self.settings
        fm = s.get('_formats') or {'pdf': 'Y', 'dwg': 'Y'}
        self.out_tb.Text = s.get('last_output') or ''
        self.register_tb.Text = s.get('issue_register') or ''
        self.per_model_cb.IsChecked = bool(s.get('per_model_folder', True))
        self.pdf_cb.IsChecked = core.yes(fm.get('pdf'))
        self.dwg_cb.IsChecked = core.yes(fm.get('dwg'))
        self.allow_norev_cb.IsChecked = bool(s.get('allow_no_rev', False))
        self.embed_cb.IsChecked = bool(s.get('embed', True))
        self.skip_links_cb.IsChecked = bool(s.get('skip_links', False))
        self.allow_nonws_cb.IsChecked = bool(s.get('allow_non_workshared', False))
        self.midp_tb.Text = self.state.get('midp') or ''
        self._names_info()
        self._fill_export_settings()               # PDF / CAD tabs: same as Export Sheets

    def _names_info(self):
        self.names_info_tb.Text = (u'From the MIDP / LOD: its code (first 7 parts) + Revit\'s current revision. '
                                   u'Uncertain = BLOCKED.' if self.midp else
                                   u'No MIDP / LOD picked: files are named by sheet number (e.g. 10100.pdf). '
                                   u'Pick one on the left to get the full drawing codes.')

    def _read_settings(self):
        s = self.settings
        s['last_output'] = self.out_tb.Text.strip()
        s['issue_register'] = self.register_tb.Text.strip()
        s['per_model_folder'] = bool(self.per_model_cb.IsChecked)
        s['_formats'] = {'pdf': 'Y' if self.pdf_cb.IsChecked else 'N', 'dwg': 'Y' if self.dwg_cb.IsChecked else 'N'}
        s['allow_no_rev'] = bool(self.allow_norev_cb.IsChecked)
        s['embed'] = bool(self.embed_cb.IsChecked)
        s['skip_links'] = bool(self.skip_links_cb.IsChecked)
        s['allow_non_workshared'] = bool(self.allow_nonws_cb.IsChecked)
        self._read_export_settings()
        try:
            s['issue_col_left'] = round(self.col_left.ActualWidth)
            s['issue_col_right'] = round(self.col_right.ActualWidth)
        except Exception:
            pass

    def on_browse(self, sender, args):
        f = forms.pick_folder(title='Output folder')
        if f:
            self.out_tb.Text = f

    def on_register_browse(self, sender, args):
        f = forms.save_file(file_ext='csv', default_name='IssueRegister')
        if f:
            self.register_tb.Text = f

    def on_midp_browse(self, sender, args):
        f = forms.pick_file(file_ext='csv', title='MIDP / LOD saved as CSV UTF-8')
        if f:
            self.state['midp'] = f
            self.midp_tb.Text = f
            self._load_midp()
            self._names_info()
            self._build_sheets()

    # =================================================================== sets
    def _fill_sets(self):
        self._busy = True
        self.sets_cb.Items.Clear()
        self.sets_cb.Items.Add(u'(none)')
        for n in sorted(issue.load_sets().keys()):
            self.sets_cb.Items.Add(n)
        self.sets_cb.SelectedItem = self.state.get('set') or u'(none)'
        self._busy = False

    def on_set_pick(self, sender, args):
        if self._busy:
            return
        name = self.sets_cb.SelectedItem
        st = issue.load_sets().get(name)
        if not st:
            return
        self.state['set'] = name
        self.state['checked_models'] = set(st.get('models', []))
        self.state['ticked'] = set(tuple(x) for x in st.get('ticked', []))
        if st.get('midp'):
            self.state['midp'] = st['midp']
            self.midp_tb.Text = st['midp']
            self._load_midp()
            self._names_info()
        self.state['loaded'] = [g for g in self.state['checked_models'] if not needs_check(self.cache.get(g))]
        self._fill_models()
        self._build_sheets()
        self._fill_rev_models()

    def on_set_save(self, sender, args):
        name = forms.ask_for_string(default=self.state.get('set') or '', prompt='Name of this set (e.g. Tender, Weekly):',
                                    title='Save set')
        if not name:
            return
        sets = issue.load_sets()
        sets[name] = {'models': sorted(self.state['checked_models']),
                      'ticked': sorted([list(k) for k in self.state['ticked']]), 'midp': self.state.get('midp', '')}
        issue.save_sets(sets)
        self.state['set'] = name
        self._fill_sets()

    def on_set_delete(self, sender, args):
        name = self.sets_cb.SelectedItem
        sets = issue.load_sets()
        if name in sets and forms.alert('Delete the set "%s"?' % name, yes=True, no=True):
            del sets[name]
            issue.save_sets(sets)
            self.state['set'] = None
            self._fill_sets()

    # ================================================================= models
    def _fill_models(self):
        flt = (self.model_search.Text or '').strip().lower()
        self.models_lb.Items.Clear()
        for r in sorted(self.reg.values(), key=lambda r: core.register_label(r).lower()):
            label = core.register_label(r)
            if flt and flt not in label.lower():
                continue
            g = r['ModelGUID'].lower()
            cb = CheckBox()
            cb.Content = ui.plain_text(label)
            cb.Tag = g
            cb.IsChecked = g in self.state['checked_models']
            cb.Click += self._on_model_click
            self.models_lb.Items.Add(cb)
        self._model_info()

    def _on_model_click(self, sender, args):
        (self.state['checked_models'].add if sender.IsChecked else self.state['checked_models'].discard)(sender.Tag)
        self._model_info()

    def _model_info(self):
        n = len(self.state['checked_models'])
        self.model_info_tb.Text = u'%d model(s) ticked. Check models reads drawings, revisions, title blocks and the last sync (quick open, no links).' % n

    def on_model_search(self, sender, args):
        self._fill_models()

    def on_check(self, sender, args):
        self._read_settings()
        self._request_gone()
        if not self.state['checked_models']:
            forms.alert('Tick at least one model.')
            return
        self.action = ('check', sorted(self.state['checked_models']))
        self.Close()

    # =============================================================== drawings
    def _rows(self):
        """One dict per drawing of the loaded models (also used by Issue / Dry run)."""
        out = []
        allow = bool(self.allow_norev_cb.IsChecked)
        for g in self.state['loaded']:
            e = self.cache.get(g) or {}
            iss = e.get('issue') or {}
            model = e.get('model', '?')
            for s in e.get('sheets', []):
                num = s['number']
                si = (iss.get('sheets') or {}).get(num, {})
                rev = si.get('current_number', s.get('rev', ''))
                if self.midp:
                    name, status, note = issue.file_name_for(num, rev, self.midp, allow)
                else:                                  # no MIDP yet: name by sheet number
                    name, status, note = core.clean(num), u'OK', u'named by sheet number (no MIDP)'
                    if name != num.strip():
                        name, status, note = None, u'BLOCKED', u'sheet number has characters not allowed in a file name'
                rq = issue.request_check(num, rev, self.state['request']) if self.state.get('request') else None
                if rq and status == u'OK' and not rq[0]:
                    status, note = u'BLOCKED', rq[1]          # revision is not the one the Toolbox asked for
                elif rq and status == u'OK':
                    note = (note + u'; ' if note else u'') + rq[1]
                last = self.by_sheet.get((model.lower(), num.lower()))
                out.append({'guid': g, 'num': num, 'model': model, 'name': s['name'],
                            'midp_title': issue.midp_title(num, self.midp), 'file': name or u'',
                            'rev': rev, 'date': si.get('current_date', u''),
                            'last': (last.get('Revision', u'') + u'  ' + last.get('PrintedOn', u'')[:10]) if last else u'-',
                            'change': issue.change_status(model, num, rev, iss.get('version', u''), self.by_sheet, self.by_model),
                            'check': (u'✔ OK' if status == 'OK' else u'✖ BLOCKED: ' + note) + (
                                u'  (%s)' % note if status == 'OK' and note else u'') + (
                                u'  ⚠ title differs from MIDP' if issue.midp_title(num, self.midp) and
                                issue.midp_title(num, self.midp).strip().lower() != s['name'].strip().lower() else u''),
                            'ok': status == 'OK',
                            'tb': (u'%s : %s' % (si['titleblock']['family'], si['titleblock']['type'])) if si.get('titleblock') else u''})
        return out

    def _build_sheets(self):
        cols = [('Key', str), ('Tick', bool), ('Model', str), ('Sheet', str), ('Revit name', str),
                ('MIDP title', str), ('File name', str), ('Rev', str), ('Rev date', str),
                ('Last issued', str), ('Change', str), ('Check', str), ('Title block', str)]
        t = _table(cols)
        flt = (self.sheet_search.Text or '').strip().lower()
        self._rowinfo = {}
        for r in self._rows():
            key = u'%s|%s' % (r['guid'], r['num'].lower())
            text = u' '.join([r['num'], r['name'], r['change'], r['check'], r['model']]).lower()
            if flt and flt not in text:
                continue
            row = t.NewRow()
            row['Key'] = key
            row['Tick'] = (r['guid'], r['num'].lower()) in self.state['ticked']
            for c, k in (('Model', 'model'), ('Sheet', 'num'), ('Revit name', 'name'), ('MIDP title', 'midp_title'),
                         ('File name', 'file'), ('Rev', 'rev'), ('Rev date', 'date'), ('Last issued', 'last'),
                         ('Change', 'change'), ('Check', 'check'), ('Title block', 'tb')):
                row[c] = r[k] or u''
            t.Rows.Add(row)
            self._rowinfo[key] = r
        t.ColumnChanged += self._on_sheet_cell
        self._sheets_table = t
        self.sheets_dg.ItemsSource = t.DefaultView
        self._status()

    def on_autocol(self, sender, e):
        n = e.PropertyName
        if n == 'Key' or (n == 'Title block' and not self.show_tb_cb.IsChecked):
            e.Cancel = True
            return
        if n == 'Tick':
            e.Column = _bool_column(n, u'✔')
            return
        e.Column.IsReadOnly = True

    def on_show_tb(self, sender, args):
        self._build_sheets()

    def _on_sheet_cell(self, sender, e):
        if e.Column.ColumnName != 'Tick':
            return
        g, num = e.Row['Key'].split(u'|', 1)
        if e.Row['Tick']:
            self.state['ticked'].add((g, num))
        else:
            self.state['ticked'].discard((g, num))
        self._status()

    def _set_ticks(self, pred):
        for row in self._sheets_table.Rows:
            r = self._rowinfo.get(row['Key'])
            if r is not None:
                row['Tick'] = bool(pred(r))
        self._status()

    def on_tick_changed(self, sender, args):
        self._set_ticks(lambda r: r['ok'] and not r['change'].startswith(u'No change'))

    def on_tick_all(self, sender, args):
        self._set_ticks(lambda r: True)

    def on_untick_all(self, sender, args):
        self._set_ticks(lambda r: False)

    def on_sheet_search(self, sender, args):
        self._build_sheets()

    def on_sheet_select(self, sender, args):
        it = self.sheets_dg.SelectedItem
        if it is None:
            return
        key = it['Key']
        self._selected = key
        lab = self._tb_labels_by_key.get(key) if hasattr(self, '_tb_labels_by_key') else None
        if lab and self.tb_sheet_cb.SelectedItem != lab:
            self.tb_sheet_cb.SelectedItem = lab
        g = key.split(u'|', 1)[0]
        name = (self.cache.get(g) or {}).get('model')
        if name and self.rev_model_cb.SelectedItem != name:
            self.rev_model_cb.SelectedItem = name

    def _status(self):
        loaded = set(self.state['loaded'])
        n = len([1 for k in self.state['ticked'] if k[0] in loaded])
        blocked = len([1 for k in self.state['ticked'] if k[0] in loaded and
                       not (self._rowinfo.get(u'%s|%s' % k) or {}).get('ok', True)])
        pend = sum(self._count_changes(g) for g in self.state['pending'])
        self.status_tb.Text = u'%d drawing(s) ticked%s   ·   %d model change(s) waiting for Apply   ·   %s' % (
            n, (u'  (%d BLOCKED - not exported)' % blocked) if blocked else u'', pend, self.out_tb.Text or u'no output folder')

    # ============================================================== revisions
    def _fill_rev_models(self):
        self._busy = True
        self.rev_model_cb.Items.Clear()
        self._rev_models = {}
        for g in self.state['loaded']:
            n = (self.cache.get(g) or {}).get('model', g)
            self._rev_models[n] = g
            self.rev_model_cb.Items.Add(n)
        self._busy = False
        if self.rev_model_cb.Items.Count:
            self.rev_model_cb.SelectedIndex = 0
            self.on_rev_model(None, None)

    def _pend(self, g):
        p = self.state['pending'].setdefault(g, {'new_revisions': [], 'edit_revisions': {}, 'sheet_revisions': {},
                                                 'params': [], 'sheet_ids': [], 'tb_types': []})
        p.setdefault('tb_types', [])
        return p

    def _revisions(self, g):
        """Existing revisions with pending edits + pending new ones, in sequence order."""
        iss = (self.cache.get(g) or {}).get('issue') or {}
        p = self.state['pending'].get(g) or {}
        out = []
        for r in iss.get('revisions', []):
            d = dict(r)
            d.update((p.get('edit_revisions') or {}).get(str(r['id']), {}))
            d['key'] = str(r['id'])
            out.append(d)
        top = max([r['seq'] for r in out] or [0])
        for i, nr in enumerate(p.get('new_revisions', [])):
            d = dict(nr)
            d.update({'key': nr['temp'], 'seq': top + i + 1, 'number': u'(new)', 'issued': False})
            out.append(d)
        return out

    def on_rev_model(self, sender, args):
        if self._busy or self.rev_model_cb.SelectedItem is None:
            return
        g = self._rev_models.get(self.rev_model_cb.SelectedItem)
        self._rev_g = g
        iss = (self.cache.get(g) or {}).get('issue') or {}
        self._busy = True
        self.numbering_cb.Items.Clear()
        for n in (u'per project', u'per sheet'):
            self.numbering_cb.Items.Add(n)
        self.numbering_cb.SelectedItem = u'per sheet' if self._per_sheet(g) else u'per project'
        self._busy = False
        self._numbering_info(g)
        t = _table([('Key', str), ('Seq', str), ('Rev', str), ('Date', str), ('Description', str),
                    ('Issued to', str), ('Issued by', str), ('Issued', bool)])
        for r in self._revisions(g):
            row = t.NewRow()
            row['Key'], row['Seq'] = r['key'], str(r['seq'])
            row['Rev'] = r.get('number') or (u'(per sheet)' if iss.get('per_sheet_numbering') and not r['key'].startswith('new') else u'(new)')
            row['Date'], row['Description'] = r.get('date', u''), r.get('description', u'')
            row['Issued to'], row['Issued by'], row['Issued'] = r.get('issued_to', u''), r.get('issued_by', u''), bool(r.get('issued'))
            t.Rows.Add(row)
        t.ColumnChanging += self._on_rev_changing
        t.ColumnChanged += self._on_rev_changed
        self._revs_table = t
        self.revs_dg.ItemsSource = t.DefaultView
        self._build_onsheet(g)

    def _per_sheet(self, g):
        """Numbering in effect for this model, including a change waiting for Apply."""
        iss = (self.cache.get(g) or {}).get('issue') or {}
        want = (self.state['pending'].get(g) or {}).get('numbering')
        return (want == u'PerSheet') if want else bool(iss.get('per_sheet_numbering'))

    def _numbering_info(self, g):
        p = self.state['pending'].get(g) or {}
        self.rev_info_tb.Text = (u'\u26A0 Waiting for Apply - changes the revision number on ALL drawings of this model'
                                 if p.get('numbering') else u'As set in the model')

    def _sheet_numbers(self, g, num, on):
        """{rev key: number on this sheet} with the numbering in effect (and pending ticks)."""
        iss = (self.cache.get(g) or {}).get('issue') or {}
        revs = [r for r in self._revisions(g) if r['key'] in on]
        return issue.predict_numbers(revs, iss, self._per_sheet(g))

    def on_numbering(self, sender, args):
        g = getattr(self, '_rev_g', None)
        if self._busy or not g or self.numbering_cb.SelectedItem is None:
            return
        iss = (self.cache.get(g) or {}).get('issue') or {}
        want = u'PerSheet' if self.numbering_cb.SelectedItem == u'per sheet' else u'PerProject'
        now = u'PerSheet' if iss.get('per_sheet_numbering') else u'PerProject'
        p = self._pend(g)
        if want == now:
            p.pop('numbering', None)
        else:
            # preview: which drawings get a different revision number
            changed = []
            for s in (self.cache.get(g) or {}).get('sheets', []):
                si = (iss.get('sheets') or {}).get(s['number'], {})
                on = self._on_sheet(g, s['number'])
                revs = [r for r in self._revisions(g) if r['key'] in on]
                if not revs:
                    continue
                top = max(revs, key=lambda r: r['seq'])
                new = issue.predict_numbers(revs, iss, want == u'PerSheet').get(top['key'], u'')
                old = si.get('current_number', u'')
                if new != old:
                    changed.append(u'%s: %s \u2192 %s' % (s['number'], old or u'-', new or u'-'))
            if not forms.alert(u'Change revision numbering to %s?\n\nLike Revit\'s Sheet Issues/Revisions > Numbering, this is ONE '
                               u'setting for the whole model. %d drawing(s) would show a different current revision:\n\n%s%s\n\n'
                               u'Drawings already issued would print with the new number next time. Nothing changes until Apply '
                               u'(Revert can undo it).' % (
                                   u'PER SHEET' if want == u'PerSheet' else u'PER PROJECT', len(changed),
                                   u'\n'.join(changed[:25]), (u'\n... and %d more' % (len(changed) - 25)) if len(changed) > 25 else u''),
                               yes=True, no=True):
                self._busy = True
                self.numbering_cb.SelectedItem = u'per sheet' if self._per_sheet(g) else u'per project'
                self._busy = False
                return
            p['numbering'] = want
        self._numbering_info(g)
        self._build_onsheet(g)
        self._refresh_changes()

    def on_autocol_revs(self, sender, e):
        n = e.PropertyName
        if n == 'Key':
            e.Cancel = True
        elif n == 'Issued':
            e.Column = _bool_column(n, n, readonly=True)
        else:
            e.Column.IsReadOnly = n in ('Seq', 'Rev')

    def _on_rev_changing(self, sender, e):
        if self._busy:
            return
        if e.Row['Issued']:
            e.ProposedValue = e.Row[e.Column]
            forms.alert('This revision is marked Issued, so Revit locks it.')

    def _on_rev_changed(self, sender, e):
        if self._busy:
            return
        g, key = self._rev_g, e.Row['Key']
        p = self._pend(g)
        field = {'Date': 'date', 'Description': 'description', 'Issued to': 'issued_to', 'Issued by': 'issued_by'}.get(e.Column.ColumnName)
        if not field:
            return
        val = core.text(e.Row[e.Column.ColumnName])
        if key.startswith('new'):
            for nr in p['new_revisions']:
                if nr['temp'] == key:
                    nr[field] = val
        else:
            orig = dict((str(r['id']), r) for r in ((self.cache.get(g) or {}).get('issue') or {}).get('revisions', []))[key]
            ed = p['edit_revisions'].setdefault(key, {})
            if val == orig.get(field, u''):
                ed.pop(field, None)
                if not ed:
                    p['edit_revisions'].pop(key, None)
            else:
                ed[field] = val
        self._build_onsheet(g)
        self._refresh_changes()

    def on_add_rev(self, sender, args):
        g = getattr(self, '_rev_g', None)
        if not g:
            forms.alert('Check the models first, then pick a model here.')
            return
        p = self._pend(g)
        temp = u'new%d' % (len(p['new_revisions']) + 1)
        p['new_revisions'].append({'temp': temp, 'date': time.strftime('%d/%m/%Y'), 'description': u'',
                                   'issued_by': u'', 'issued_to': u''})
        self.on_rev_model(None, None)
        self._refresh_changes()

    def _build_onsheet(self, g):
        e = self.cache.get(g) or {}
        iss = e.get('issue') or {}
        revs = self._revisions(g)
        self._onsheet_revs = revs
        cols = [('Key', str), ('Sheet', str), ('Name', str), ('Current rev', str), ('Current date', str)]
        self._headers = {}
        for r in revs:
            cn = u'R%s' % r['key']
            self._headers[cn] = u'%s · %s' % (r['seq'], r.get('number') or u'?') if not self._per_sheet(g) or r.get('number') \
                else u'%s · %s' % (r['seq'], r.get('date', u'')[:5] or u'?')
            cols.append((cn, bool))
        t = _table(cols)
        ticked_here = [n for (gg, n) in self.state['ticked'] if gg == g]
        p = self.state['pending'].get(g) or {}
        for s in e.get('sheets', []):
            num = s['number']
            if ticked_here and num.lower() not in ticked_here:
                continue                                   # show the ticked drawings (or all if none ticked)
            si = (iss.get('sheets') or {}).get(num, {})
            on = self._on_sheet(g, num)
            row = t.NewRow()
            row['Key'], row['Sheet'], row['Name'] = num, num, s['name']
            for r in revs:
                row[u'R%s' % r['key']] = r['key'] in on
            cur, date = self._current(g, on, num)
            row['Current rev'], row['Current date'] = cur, date
            t.Rows.Add(row)
        t.ColumnChanging += self._on_onsheet_changing
        t.ColumnChanged += self._on_onsheet_changed
        self._onsheet_table = t
        self.onsheet_dg.ItemsSource = t.DefaultView

    def _on_sheet(self, g, num):
        """Keys of the revisions on this sheet, with pending changes."""
        si = (((self.cache.get(g) or {}).get('issue') or {}).get('sheets') or {}).get(num, {})
        p = (self.state['pending'].get(g) or {}).get('sheet_revisions') or {}
        extra = p.get(num)
        clouds = [str(i) for i in si.get('cloud_revs', [])]
        if extra is None:
            extra = [str(i) for i in si.get('extra_revs', [])]
        return set(clouds) | set(str(i) for i in extra)

    def _current(self, g, on, sheet=None):
        """Current revision of a sheet as Revit will show it: the highest sequence on the sheet, numbered
        per project (its own number) or per sheet (counted on this sheet only, per numbering sequence)."""
        iss = (self.cache.get(g) or {}).get('issue') or {}
        revs = [r for r in self._revisions(g) if r['key'] in on]
        if not revs:
            return u'', u''
        top = max(revs, key=lambda r: r['seq'])
        si = (iss.get('sheets') or {}).get(sheet or u'', {})
        unchanged = (sorted(on) == sorted(str(i) for i in si.get('all_revs', []))
                     and not (self.state['pending'].get(g) or {}).get('numbering'))
        if unchanged and si.get('current_number') and str(si.get('current')) == top['key']:
            return si['current_number'], top.get('date', u'')          # exactly what Revit shows now
        num = self._sheet_numbers(g, sheet, on).get(top['key'], u'') or u'?'
        return num, top.get('date', u'')

    def on_autocol_onsheet(self, sender, e):
        n = e.PropertyName
        if n == 'Key':
            e.Cancel = True
        elif n.startswith('R') and n in self._headers:
            e.Column = _bool_column(n, self._headers[n])
        else:
            e.Column.IsReadOnly = True

    def _on_onsheet_changing(self, sender, e):
        if self._busy or not e.Column.ColumnName.startswith('R'):
            return
        g = self._rev_g
        key = e.Column.ColumnName[1:]
        si = (((self.cache.get(g) or {}).get('issue') or {}).get('sheets') or {}).get(e.Row['Key'], {})
        rev = [r for r in self._onsheet_revs if r['key'] == key]
        if key in [str(i) for i in si.get('cloud_revs', [])] and not e.ProposedValue:
            e.ProposedValue = True
            forms.alert('This revision comes from a revision cloud on the sheet - remove the cloud in Revit instead.')
        elif rev and rev[0].get('issued'):
            e.ProposedValue = e.Row[e.Column]
            forms.alert('This revision is marked Issued, so Revit locks it on sheets.')

    def _on_onsheet_changed(self, sender, e):
        if self._busy or not e.Column.ColumnName.startswith('R'):
            return
        g, num = self._rev_g, e.Row['Key']
        iss = (self.cache.get(g) or {}).get('issue') or {}
        si = (iss.get('sheets') or {}).get(num, {})
        on = set(k for k in [r['key'] for r in self._onsheet_revs] if e.Row[u'R%s' % k])
        clouds = set(str(i) for i in si.get('cloud_revs', []))
        extra = sorted(on - clouds)
        p = self._pend(g)
        if sorted(str(i) for i in si.get('extra_revs', [])) == extra:
            p['sheet_revisions'].pop(num, None)
        else:
            p['sheet_revisions'][num] = [k if k.startswith('new') else int(k) for k in extra]
            if si.get('id') and si['id'] not in p['sheet_ids']:
                p['sheet_ids'].append(si['id'])
        self._busy = True
        cur, date = self._current(g, on, num)
        e.Row['Current rev'], e.Row['Current date'] = cur, date
        self._busy = False
        self._refresh_changes()

    # ============================================================ title blocks
    def _fill_tb_sheets(self):
        """Drawing drop-down: every drawing of the checked models."""
        self._busy = True
        self.tb_sheet_cb.Items.Clear()
        self._tb_keys, self._tb_labels_by_key = {}, {}
        for g in self.state['loaded']:
            e = self.cache.get(g) or {}
            for sh in e.get('sheets', []):
                lab = u'%s   \u00b7   %s   %s' % (sh['number'], sh['name'], e.get('model', u''))
                key = u'%s|%s' % (g, sh['number'].lower())
                self._tb_keys[lab] = key
                self._tb_labels_by_key[key] = lab
                self.tb_sheet_cb.Items.Add(lab)
        self._busy = False

    def _tb_sheet_info(self, key):
        g, num_l = key.split(u'|', 1)
        iss = (self.cache.get(g) or {}).get('issue') or {}
        num = [n for n in (iss.get('sheets') or {}) if n.lower() == num_l]
        return g, iss, (num[0] if num else u''), ((iss.get('sheets') or {}).get(num[0], {}) if num else {})

    def on_tb_sheet(self, sender, args):
        if self._busy or self.tb_sheet_cb.SelectedItem is None:
            return
        key = self._tb_keys.get(self.tb_sheet_cb.SelectedItem)
        g, iss, num, si = self._tb_sheet_info(key)
        self._tb_sheet_key = key
        # title block(s) placed on this drawing
        tbs = si.get('titleblocks') or ([si['titleblock']] if si.get('titleblock') else [])
        self._tb_list = {}
        self._busy = True
        self.tb_inst_cb.Items.Clear()
        for tb in tbs:
            lab = u'%s : %s   (id %s)' % (tb['family'], tb['type'], tb['instance_id'])
            self._tb_list[lab] = tb
            self.tb_inst_cb.Items.Add(lab)
        self._busy = False
        if len(tbs) > 1:
            self.tb_info_tb.Text = u'\u26A0 This drawing has %d title blocks - pick one above.' % len(tbs)
        elif not tbs:
            self.tb_info_tb.Text = u'No title block on this drawing.'
        else:
            self.tb_info_tb.Text = u''
        # revisions on this drawing (as Revit shows them on the sheet)
        revs = dict((str(r['id']), r) for r in iss.get('revisions', []))
        clouds = set(str(i) for i in si.get('cloud_revs', []))
        t = _table([('Seq', str), ('Rev on sheet', str), ('Date', str), ('Description', str), ('How', str), ('Issued', str)])
        for rid in sorted((str(i) for i in si.get('all_revs', [])), key=lambda k: revs.get(k, {}).get('seq', 0)):
            r = revs.get(rid, {})
            row = t.NewRow()
            row['Seq'] = str(r.get('seq', u''))
            row['Rev on sheet'] = (si.get('numbers_on_sheet') or {}).get(rid) or r.get('number', u'')
            row['Date'], row['Description'] = r.get('date', u''), r.get('description', u'')
            row['How'] = u'revision cloud' if rid in clouds else u'added to sheet'
            row['Issued'] = u'Yes' if r.get('issued') else u''
            t.Rows.Add(row)
        self.tb_revs_dg.ItemsSource = t.DefaultView
        self._fill_tb_change(g, iss, tbs[0] if tbs else None)
        if tbs:
            self.tb_inst_cb.SelectedIndex = 0
            self._show_params(g, iss, num, tbs[0])
        else:
            self._show_params(g, iss, num, None)

    def on_tb_inst(self, sender, args):
        if self._busy or self.tb_inst_cb.SelectedItem is None or not getattr(self, '_tb_sheet_key', None):
            return
        g, iss, num, si = self._tb_sheet_info(self._tb_sheet_key)
        tb = self._tb_list.get(self.tb_inst_cb.SelectedItem)
        self._fill_tb_change(g, iss, tb)
        self._show_params(g, iss, num, tb)

    @staticmethod
    def _type_label(t):
        return u'%s : %s%s' % (t['family'], t['type'], (u'   (%s)' % t['size']) if t.get('size') else u'')

    def _fill_tb_change(self, g, iss, tb):
        """'Change to' list: every title block type loaded in this model."""
        self._busy = True
        self.tb_change_cb.Items.Clear()
        self._tb_types = {}
        for t in iss.get('titleblock_types', []):
            lab = self._type_label(t)
            self._tb_types[lab] = t
            self.tb_change_cb.Items.Add(lab)
        cur = None
        if tb:
            pend = [tc for tc in (self.state['pending'].get(g) or {}).get('tb_types', [])
                    if tc['instance_id'] == tb['instance_id']]
            want = pend[0]['type_id'] if pend else tb['type_id']
            for lab, t in self._tb_types.items():
                if t['id'] == want:
                    cur = lab
        if cur:
            self.tb_change_cb.SelectedItem = cur
        self._busy = False

    def _queue_tb_change(self, g, num, tb, new_t, keep):
        """Add (or remove, if it's back to the current type) one title block change."""
        p = self._pend(g)
        p['tb_types'] = [tc for tc in p['tb_types'] if tc['instance_id'] != tb['instance_id']]
        if new_t['id'] == tb['type_id']:
            return
        p['tb_types'].append({'instance_id': tb['instance_id'], 'type_id': new_t['id'], 'old_type_id': tb['type_id'],
                              'label': u'drawing %s' % num, 'new_label': u'%s : %s' % (new_t['family'], new_t['type']),
                              'old_label': u'%s : %s' % (tb['family'], tb['type']), 'copy_switches': bool(keep)})
        sid = (((self.cache.get(g) or {}).get('issue') or {}).get('sheets') or {}).get(num, {}).get('id')
        if sid and sid not in p['sheet_ids']:
            p['sheet_ids'].append(sid)

    def _size_of(self, g, type_id):
        for t in ((self.cache.get(g) or {}).get('issue') or {}).get('titleblock_types', []):
            if t['id'] == type_id:
                return t.get('size', u'')
        return u''

    def on_tb_change_one(self, sender, args):
        if not getattr(self, '_tb_sheet_key', None) or self.tb_change_cb.SelectedItem is None:
            forms.alert('Pick a drawing, then the title block to change to.')
            return
        g, iss, num, si = self._tb_sheet_info(self._tb_sheet_key)
        tb = self._tb_list.get(self.tb_inst_cb.SelectedItem)
        if tb is None and len(self._tb_list) == 1:
            tb = list(self._tb_list.values())[0]          # only one title block on the drawing
        new_t = self._tb_types.get(self.tb_change_cb.SelectedItem)
        if not tb or not new_t:
            return
        old_size, new_size = self._size_of(g, tb['type_id']), new_t.get('size', u'')
        if old_size and new_size and old_size != new_size and not forms.alert(
                u'The sheet size changes: %s \u2192 %s.\n\nViews are NOT moved - some may end up outside the border. '
                u'Continue?' % (old_size, new_size), yes=True, no=True):
            return
        self._queue_tb_change(g, num, tb, new_t, self.tb_keep_cb.IsChecked)
        self._refresh_changes()

    def on_tb_change_ticked(self, sender, args):
        if self.tb_change_cb.SelectedItem is None:
            forms.alert('Pick the title block to change to first (any drawing of a model that has it).')
            return
        new_t = self._tb_types.get(self.tb_change_cb.SelectedItem)
        fam, typ = new_t['family'], new_t['type']
        done, skipped, sizes = 0, [], set()
        for (g, num_l) in sorted(self.state['ticked']):
            if g not in self.state['loaded']:
                continue
            iss = (self.cache.get(g) or {}).get('issue') or {}
            match = [t for t in iss.get('titleblock_types', []) if t['family'] == fam and t['type'] == typ]
            sheets = iss.get('sheets') or {}
            num = [n for n in sheets if n.lower() == num_l]
            if not num:
                continue
            si = sheets[num[0]]
            tbs = si.get('titleblocks') or ([si['titleblock']] if si.get('titleblock') else [])
            label = u'%s (%s)' % (num[0], (self.cache.get(g) or {}).get('model', u''))
            if not match:
                skipped.append(label + u': this model does not have that title block')
                continue
            if len(tbs) != 1:
                skipped.append(label + u': %d title blocks on the sheet - change it on its own' % len(tbs))
                continue
            old_size = self._size_of(g, tbs[0]['type_id'])
            if old_size and match[0].get('size') and old_size != match[0]['size']:
                sizes.add(u'%s \u2192 %s' % (old_size, match[0]['size']))
            self._queue_tb_change(g, num[0], tbs[0], match[0], self.tb_keep_cb.IsChecked)
            done += 1
        self._refresh_changes()
        forms.alert(u'%d drawing(s) set to change to %s : %s.%s%s\n\nNothing changes in Revit until Apply.' % (
            done, fam, typ,
            (u'\n\n\u26A0 Sheet size changes: ' + u', '.join(sorted(sizes)) + u' - views are NOT moved.') if sizes else u'',
            (u'\n\nSkipped:\n' + u'\n'.join(skipped[:20])) if skipped else u''))

    def on_tb_change_undo(self, sender, args):
        if not getattr(self, '_tb_sheet_key', None):
            return
        g, iss, num, si = self._tb_sheet_info(self._tb_sheet_key)
        ids = set(t['instance_id'] for t in (si.get('titleblocks') or ([si['titleblock']] if si.get('titleblock') else [])))
        p = self._pend(g)
        p['tb_types'] = [tc for tc in p['tb_types'] if tc['instance_id'] not in ids]
        self.on_tb_sheet(None, None)
        self._refresh_changes()

    def on_autocol_plain(self, sender, e):
        if e.PropertyName == 'Key':
            e.Cancel = True

    def _show_params(self, g, iss, num, tb):
        t = _table([('Key', str), ('Parameter', str), ('Scope', str), ('Value', bool), ('Changes', str)])
        if tb:
            n_type = (iss.get('titleblock_type_count') or {}).get(str(tb['type_id']), 1)
            p = self.state['pending'].get(g) or {}
            for scope, items, eid, aff in (('Instance', tb['instance_params'], tb['instance_id'], u'this drawing only'),
                                           ('Type', tb['type_params'], tb['type_id'], u'ALL %d drawing(s) using this type' % n_type)):
                for prm in items:
                    val = prm['value']
                    for pc in p.get('params', []):
                        if pc['element_id'] == eid and pc['name'] == prm['name']:
                            val = pc['value']
                    row = t.NewRow()
                    row['Key'] = u'%s|%s|%s|%s' % (scope, eid, prm['name'], u'ro' if prm['readonly'] else u'rw')
                    row['Parameter'], row['Scope'], row['Value'] = prm['name'], scope, bool(val)
                    row['Changes'] = u'read-only' if prm['readonly'] else aff
                    t.Rows.Add(row)
        self._tb_ctx = (g, num, tb)
        t.ColumnChanging += self._on_param_changing
        t.ColumnChanged += self._on_param_changed
        self.params_dg.ItemsSource = t.DefaultView

    def on_autocol_params(self, sender, e):
        n = e.PropertyName
        if n == 'Key':
            e.Cancel = True
        elif n == 'Value':
            e.Column = _bool_column(n, u'Yes / No')
        else:
            e.Column.IsReadOnly = True

    def _on_param_changing(self, sender, e):
        if e.Column.ColumnName == 'Value' and e.Row['Key'].endswith(u'|ro'):
            e.ProposedValue = e.Row['Value']
            forms.alert('This parameter is read-only.')

    def _on_param_changed(self, sender, e):
        if e.Column.ColumnName != 'Value':
            return
        g, num, tb = self._tb_ctx
        scope, eid, name, _ = e.Row['Key'].split(u'|')
        eid = int(eid)
        items = tb['instance_params'] if scope == 'Instance' else tb['type_params']
        orig = [x['value'] for x in items if x['name'] == name][0]
        p = self._pend(g)
        p['params'] = [pc for pc in p['params'] if not (pc['element_id'] == eid and pc['name'] == name)]
        if bool(e.Row['Value']) != bool(orig):
            p['params'].append({'element_id': eid, 'name': name, 'value': bool(e.Row['Value']), 'scope': scope,
                                'label': (u'drawing %s' % num) if scope == 'Instance' else (u'type %s : %s' % (tb['family'], tb['type']))})
        self._refresh_changes()

    # ================================================================ changes
    def _count_changes(self, g):
        p = self.state['pending'].get(g) or {}
        return (len(p.get('new_revisions', [])) + len(p.get('edit_revisions', {})) +
                len(p.get('sheet_revisions', {})) + len(p.get('params', [])) + len(p.get('tb_types', [])) +
                (1 if p.get('numbering') else 0))

    def _refresh_changes(self):
        lines = []
        for g, p in sorted(self.state['pending'].items()):
            if not self._count_changes(g):
                continue
            lines.append(u'■ %s' % ((self.cache.get(g) or {}).get('model', g)))
            if p.get('numbering'):
                lines.append(u'   ~ Revision numbering \u2192 %s  (ALL drawings of this model)' % (
                    u'per sheet' if p['numbering'] == u'PerSheet' else u'per project'))
            for nr in p['new_revisions']:
                lines.append(u'   + NEW revision   %s   %s' % (nr.get('date', u''), nr.get('description', u'')))
            for rid, ed in p['edit_revisions'].items():
                lines.append(u'   ~ revision %s: %s' % (rid, u', '.join(u'%s = %s' % kv for kv in ed.items())))
            for num, ids in sorted(p['sheet_revisions'].items()):
                lines.append(u'   ~ sheet %s: manual revisions = %s' % (num, u', '.join(str(i) for i in ids) or u'(none)'))
            for tc in p.get('tb_types', []):
                lines.append(u'   ~ %s: title block %s \u2192 %s%s' % (tc['label'], tc.get('old_label', u''), tc['new_label'],
                                                                   u'  (keep switches)' if tc.get('copy_switches') else u''))
            for pc in p['params']:
                lines.append(u'   ~ %s "%s" = %s   (%s)' % (pc['scope'], pc['name'], u'Yes' if pc['value'] else u'No', pc['label']))
        self.changes_tb.Text = u'\n'.join(lines) or u'No changes waiting.'
        self._status()

    def on_apply(self, sender, args):
        todo = [g for g in self.state['pending'] if self._count_changes(g)]
        if not todo:
            forms.alert('No changes waiting.')
            return
        self._read_settings()
        self.action = ('apply', todo)
        self.Close()

    def on_discard(self, sender, args):
        if forms.alert('Discard all changes that are waiting?', yes=True, no=True):
            self.state['pending'] = {}
            self._fill_rev_models()
            self._refresh_changes()

    def on_revert(self, sender, args):
        self._read_settings()
        self.action = ('revert', None)
        self.Close()

    # ================================================================ footer
    def _ready(self):
        self._read_settings()
        s = self.settings
        if not s['last_output']:
            forms.alert('Choose where to save.')
            return False
        if not (self.pdf_cb.IsChecked or self.dwg_cb.IsChecked):
            forms.alert('Choose PDF and/or DWG.')
            return False
        rows = [self._rowinfo.get(u'%s|%s' % k) for k in self.state['ticked']]
        rows = [r for r in rows if r]
        if not rows:
            forms.alert('Tick at least one drawing.')
            return False
        names = [r['file'].lower() for r in rows if r['ok']]
        if len(names) != len(set(names)):
            forms.alert('Two ticked drawings would get the same file name. Check the MIDP.')
            return False
        if any(self._count_changes(g) for g in self.state['pending']):
            if not forms.alert('Some changes are not applied yet - the drawings would be issued WITHOUT them.\n\n'
                               'Issue anyway?', yes=True, no=True):
                return False
        if not s.get('issue_register'):
            s['issue_register'] = os.path.join(s['last_output'], 'IssueRegister.csv')
            self.register_tb.Text = s['issue_register']
        if s.get('embed') and self.dwg_cb.IsChecked and not ui.autocad_ready(s):
            return False
        return True

    def on_dryrun(self, sender, args):
        if self._ready():
            self.action = ('dryrun', None)
            self.Close()

    def on_issue(self, sender, args):
        if self._request_gone() or not self._ready():
            return
        rows = [self._rowinfo[u'%s|%s' % k] for k in self.state['ticked'] if u'%s|%s' % k in self._rowinfo]
        ok = [r for r in rows if r['ok']]
        models = sorted(set(r['model'] for r in ok))
        if not forms.alert(u'Issue %d drawing(s) from %d model(s)?%s\n\n%s\n\nClose these models in any OTHER Revit '
                           u'window. Nothing in the models is changed.' % (
                               len(ok), len(models),
                               (u'\n%d BLOCKED drawing(s) are skipped.' % (len(rows) - len(ok))) if len(rows) != len(ok) else u'',
                               u'\n'.join(u'  • ' + m for m in models)), yes=True, no=True):
            return
        # every row of the loaded models (for the Toolbox result: printed / blocked / not found)
        self.state['all_rows'] = list(self._rowinfo.values())
        self.action = ('issue', ok)
        self.Close()

    def on_close(self, sender, args):
        self._read_settings()
        self.action = None
        self.Close()


# ====================================================================== main
def do_check(guids, settings, reg, cache):
    recs = [reg[g] for g in guids if g in reg]
    failed = ui.scan_models(recs, settings, reg, cache, False, extra=read_issue_extra)
    if failed:
        forms.alert('Could not read these models:\n\n' + '\n'.join(failed))


def do_apply(guids, state, settings, reg, cache):
    others = issue.other_revit_windows()
    if others:
        forms.alert(u'Apply needs this to be the ONLY Revit window.\n\n%d other Revit window(s) are running. Close them '
                    u'(two Revit windows on one PC share the same local copy, which causes sync problems), then Apply '
                    u'again. Your changes are kept.' % others)
        return
    names = [(cache.get(g) or {}).get('model', g) for g in guids]
    if not forms.alert(u'Apply the changes to %d model(s)?\n\n%s\n\nEach model: your local copy (your own worksets) '
                       u'\u2192 ownership check \u2192 one change step \u2192 read back \u2192 sync + give back everything '
                       u'borrowed. Any problem: nothing is saved. Revit messages are NOT clicked away for you.'
                       % (len(guids), u'\n'.join(u'  \u2022 ' + n for n in names)), yes=True, no=True):
        return
    rule = settings.get('naming_rule') or '{DrawingNumber}'

    def fresh(doc):
        e = core.read_sheet_list(doc, rule)
        e['issue'] = issue.read_issue_data(doc)
        return e

    results = []
    for g in guids:
        ch = state['pending'][g]
        n_changes = sum(len(ch.get(k, [])) for k in ('new_revisions', 'edit_revisions', 'sheet_revisions', 'params', 'tb_types')) + (1 if ch.get('numbering') else 0)
        try:
            ok, log, undo, entry = issue.apply_changes(app, reg[g], ch, settings,
                                                       u'Issue Sheets by Lew: %d change(s)' % n_changes, after=fresh)
            undo_file = issue.save_undo(undo)
            if entry:                                   # read in the same open: no second open needed
                entry['guid'] = g
                cache[g] = entry
                try:
                    core.save_sheet_entry(g, entry)
                except Exception:
                    pass
            results.append(u'\u2714 %s\n     %s\n     Undo log: %s' % (cache[g].get('model', g), u'\n     '.join(log), undo_file))
            state['pending'].pop(g, None)
            if not entry:
                do_check([g], settings, reg, cache)
        except Exception as e:
            results.append(u'\u2716 %s: NOT changed - %s' % ((cache.get(g) or {}).get('model', g), core.text(e)))
    forms.alert(u'Apply finished:\n\n' + u'\n\n'.join(results))


def do_revert(settings, reg, cache):
    files = issue.last_undo_files()[:15]
    if not files:
        forms.alert('No applied changes to revert.')
        return
    pick = forms.SelectFromList.show([os.path.basename(f) for f in files], title='Revert which Apply?',
                                     button_name='Revert this one')
    if not pick:
        return
    f = [x for x in files if os.path.basename(x) == pick][0]
    if not forms.alert('Put back the old values of %s and sync?' % pick, yes=True, no=True):
        return
    try:
        ok, log = issue.revert(app, f, settings)
        forms.alert(u'Reverted:\n' + u'\n'.join(log))
    except Exception as e:
        forms.alert(u'Revert NOT done: %s' % core.text(e))


def do_issue(rows, state, settings, reg, cache, dry):
    out_root = settings['last_output']
    core.ensure_dir(out_root)
    names, picked = {}, {}
    for r in rows:
        names[u'%s|%s' % (r['guid'], r['num'].strip().lower())] = r['file']
        picked.setdefault(r['guid'], set()).add(r['num'].strip().lower())
    settings['_names'] = names
    if dry:
        output.print_md('## Issue Sheets - DRY RUN (nothing opened, nothing written)')
        for r in sorted(rows, key=lambda x: (x['model'], x['num'])):
            output.print_md(u'- **%s**  %s  →  `%s`  ·  %s' % (r['model'], r['num'], r['file'], r['change']))
        return
    models = [reg[g] for g in picked if g in reg]
    run_cad = settings.get('embed') and settings['_formats'].get('dwg') == 'Y'
    job = {'out_root': out_root, 'do_export': True, 'run_cad': bool(run_cad), 'models': models,
           'picked': dict((g, sorted(v)) for g, v in picked.items()), 'lod_rows': None,
           '_formats': settings['_formats'], '_extra_read': read_issue_extra}
    req = state.get('request')
    if req:
        n_files = len(rows) * len([1 for v in settings['_formats'].values() if v == 'Y'])
        prog = {'done': 0, 'model': u''}

        def on_progress(kind, a, b, status):
            if issue.request_cancelled(req):
                issue.request_status(req, 'printing', u'Cancelling - stopping after the current file...',
                                     prog['done'], n_files)
                return 'cancel'
            if kind == 'model':
                prog['model'] = a
                issue.request_status(req, 'printing', u'Opening %s...' % a, prog['done'], n_files)
            elif status is not None:
                prog['done'] += 1
                issue.request_status(req, 'printing', u'%s \u00B7 %s %s %s' % (prog['model'], b, a, status),
                                     prog['done'], n_files)
            else:
                issue.request_status(req, 'printing', u'%s \u00B7 printing %s (%s)...' % (prog['model'], b, a),
                                     prog['done'], n_files)
        job['_on_progress'] = on_progress
        issue.request_status(req, 'printing', u'Starting...', 0, n_files)
    log_path = core.usable_log_path(os.path.join(core.logs_dir(out_root), 'SheetExport_log.csv'))
    started, since = time.time(), core.now()
    logo_since = core.now()
    if run_cad:                                   # logos start while Revit is still exporting
        core.logo_pipeline_reset(out_root)
        job['_logo_pipeline'] = True
    queue = list(models)
    lines, totals, _, pw = ui.export_models(lambda: queue.pop(0) if queue else None, list(models), job, settings,
                                            reg, cache, log_path, u'Issuing')
    # one register row per printed drawing
    files = {}
    for lr in core.read_csv(log_path):
        if lr.get('Mode') == 'EXPORT' and lr.get('Status') == 'OK' and lr.get('Timestamp', '') >= since:
            files.setdefault((lr['Model'].lower(), lr['ListedNumber'].lower()), {})[lr['Format']] = lr['File']
    reg_rows_before = issue.read_register(settings['issue_register'])
    by_sheet, by_model = issue.last_issues(reg_rows_before)
    new_rows = []
    for r in rows:
        e = cache.get(r['guid']) or {}
        iss = e.get('issue') or {}
        si = (iss.get('sheets') or {}).get(r['num'], {})
        f = files.get((e.get('model', r['model']).lower(), r['num'].lower()))
        if not f:
            continue
        rev = si.get('current_number', r['rev'])
        revrec = [x for x in iss.get('revisions', []) if x['id'] == si.get('current')]
        new_rows.append({'DrawingCode': r['file'], 'Model': e.get('model', r['model']), 'SheetNumber': r['num'],
                         'SheetName': si.get('name', r['name']), 'Revision': rev,
                         'RevisionDate': si.get('current_date', r['date']),
                         'RevisionDescription': revrec[0]['description'] if revrec else u'',
                         'PrintedOn': core.now(), 'PrintedBy': getattr(app, 'Username', u''),
                         'Formats': u'+'.join(sorted(f.keys())), 'PDFFile': f.get('PDF', u''),
                         'DWGFile': f.get('DWG', u'').replace(os.sep + '_DWG_raw' + os.sep, os.sep + 'DWG' + os.sep)
                         if run_cad else f.get('DWG', u''),
                         'Change': issue.change_status(e.get('model', r['model']), r['num'], rev, iss.get('version', u''),
                                                       by_sheet, by_model),
                         'ModelVersion': iss.get('version', u''), 'Note': u''})
    reg_path = issue.write_register(settings['issue_register'], new_rows) if new_rows else settings['issue_register']
    cad_msg, logo_count = '', 0
    if run_cad and job.get('_logo_pipeline') and job.get('_logo_runner'):
        core.logo_queue_done(out_root)            # the helper finishes the last DWGs, then stops
        logo_count = job.get('_logo_jobs', 0)
        cad_msg = u'AutoCAD started earlier by the logo helper (%d DWG(s)); it finishes in the background.' % logo_count
    elif run_cad:                                 # helper not possible (e.g. PowerShell blocked): old way, at the end
        jobs = core.find_raw_dwgs(out_root)
        logo_since = core.now()
        cad_msg = core.start_img2ole(jobs, out_root, settings) if jobs else 'No DWG files to process.'
        if job.get('_logo_runner_msg') and not job.get('_logo_runner'):
            cad_msg += u'  (Logo helper not used: %s)' % job['_logo_runner_msg']
        logo_count = len(jobs) if cad_msg.startswith('AutoCAD started') else 0
    lines.append(u'Issue register: %d row(s) added → %s' % (len(new_rows), reg_path))
    if state.get('request'):
        state['_want_formats'] = [k.upper() for k, v in settings['_formats'].items() if v == 'Y']
        lines.append(request_result(state, rows, files, cache, run_cad))
    ui.report('Issue Sheets', started, lines, totals, True, [], cad_msg, log_path)
    pw.finish(ui.finish_title(totals, cad_msg), out_root, logo_count=logo_count, logo_since=logo_since)


def request_result(state, rows, files, cache, run_cad):
    """Tell the Toolbox what happened to each requested drawing; returns a report line."""
    req = state['request']
    by_num = {}
    for r in state.get('all_rows') or []:
        by_num.setdefault(r['num'].strip().lower(), []).append(r)
    printed = dict((r['num'].strip().lower(), r) for r in rows)
    out, n_ok = [], 0
    for q in req['rows']:
        k = q['seq'].lower()
        base = {'DrawingNumber': q['code'], 'SheetNumber': q['seq'], 'ExpectedRev': q['expected'], 'DoneOn': core.now()}
        r = printed.get(k)
        f = files.get(((cache.get(r['guid']) or {}).get('model', r['model']).lower(), r['num'].lower())) if r else None
        missing = [x for x in state.get('_want_formats') or [] if f is not None and x not in f]
        if r and f and missing:
            base.update({'RevitRev': r['rev'], 'Model': r['model'], 'Status': 'PARTIAL', 'PDFFile': f.get('PDF', u''),
                         'DWGFile': f.get('DWG', u''), 'Note': u'%s - no %s (cancelled or failed)' % (r['file'], u'/'.join(missing))})
        elif r and f:
            n_ok += 1
            base.update({'RevitRev': r['rev'], 'Model': r['model'], 'Status': 'PRINTED', 'PDFFile': f.get('PDF', u''),
                         'DWGFile': f.get('DWG', u'').replace(os.sep + '_DWG_raw' + os.sep, os.sep + 'DWG' + os.sep)
                         if run_cad else f.get('DWG', u''), 'Note': r['file']})
        elif r and issue.request_cancelled(req):
            base.update({'RevitRev': r['rev'], 'Model': r['model'], 'Status': 'CANCELLED',
                         'Note': u'cancelled from the Toolbox before it was printed'})
        elif r:
            base.update({'RevitRev': r['rev'], 'Model': r['model'], 'Status': 'FAILED',
                         'Note': u'export failed or blocked at print time - see the report'})
        elif by_num.get(k):
            x = by_num[k][0]
            base.update({'RevitRev': x['rev'], 'Model': x['model'],
                         'Status': 'BLOCKED' if not x['ok'] else 'NOT TICKED',
                         'Note': x['check'] if not x['ok'] else u'unticked in Revit'})
        else:
            base.update({'Status': 'NOT FOUND', 'Note': u'not in the checked models' +
                         (u' (Toolbox says model %s)' % q['model'] if q['model'] else u'')})
        out.append(base)
    path = issue.finish_request(req, out)
    state['request'] = None
    return u'Toolbox request "%s": %d of %d printed → result %s' % (req['name'], n_ok, len(out), path)


def load_request(state, settings, reg):
    """Offer the newest Toolbox request; tick its models and use its output folder."""
    reqs = issue.pending_requests()
    asked = None
    try:                                         # 'Open Issue Sheets now' in the Toolbox pop-up
        asked = System.AppDomain.CurrentDomain.GetData('BIMExport.OpenRequest')
        System.AppDomain.CurrentDomain.SetData('BIMExport.OpenRequest', None)
    except Exception:
        pass
    if not reqs:
        return
    hit = [r for r in reqs if asked and r['name'] == asked]
    req = hit[0] if hit else reqs[0]
    if hit:
        state['auto_check'] = True               # already confirmed in the pop-up
    elif not forms.alert(u'Lew\'s Toolbox sent a request: "%s"\n%d drawing(s)%s\n\nLoad it? The drawings are ticked after '
                       u'Check models. Names = MIDP code + Revit\'s current revision; any drawing whose Revit revision '
                       u'is not the one asked for is BLOCKED.%s' % (
                           req['name'], len(req['rows']),
                           (u'\nOutput: %s' % req['out']) if req['out'] else u'',
                           (u'\n\n(%d older request(s) wait after this one.)' % (len(reqs) - 1)) if len(reqs) > 1 else u''),
                       yes=True, no=True):
        return
    state['request'] = req
    state['request_ticked'] = set()
    issue.request_status(req, 'loaded', u'Loaded in Revit - next: Check models', 0, len(req['rows']))
    wanted = set(r['model'].strip().lower() for r in req['rows'] if r['model'].strip())
    for g, rec in reg.items():
        n = (rec.get('Name') or u'').strip().lower()
        if n and any(w == n or w in n or n in w for w in wanted):
            state['checked_models'].add(g.lower())
    if req['out']:
        settings['last_output'] = req['out']
    f = req['formats'].upper()
    if f:
        settings['_formats'] = {'pdf': 'Y' if 'PDF' in f else 'N', 'dwg': 'Y' if 'DWG' in f else 'N'}


def main():
    settings = core.load_settings()
    reg = core.refresh_register(app.VersionNumber)
    cache = core.load_sheet_cache()
    if not reg:
        forms.alert('No ACC models found on this PC (open each model once in Revit first).')
        return
    state = {'checked_models': set(), 'loaded': [], 'ticked': set(), 'pending': {}, 'midp': settings.get('issue_midp', ''),
             'set': None, 'request': None}
    load_request(state, settings, reg)
    if state.pop('auto_check', False) and state['checked_models']:
        issue.request_status(state['request'], 'checking', u'Revit is reading the models (quick open)...')
        do_check(sorted(state['checked_models']), settings, reg, cache)
        state['loaded'] = [g for g in state['checked_models'] if not needs_check(cache.get(g))]
    while True:
        register_rows = issue.read_register(settings.get('issue_register'))
        win = IssueWindow(state, settings, reg, cache, register_rows)
        win.ShowDialog()
        settings['issue_midp'] = state.get('midp', '')
        settings.pop('_names', None)
        core.save_settings(settings)
        act = win.action
        if act is None:
            return
        if act[0] == 'check':
            if state.get('request'):
                issue.request_status(state['request'], 'checking', u'Revit is reading the models (quick open)...')
            do_check(act[1], settings, reg, cache)
            state['loaded'] = [g for g in state['checked_models'] if not needs_check(cache.get(g))]
        elif act[0] == 'apply':
            do_apply(act[1], state, settings, reg, cache)
        elif act[0] == 'revert':
            do_revert(settings, reg, cache)
        elif act[0] == 'dryrun':
            rows = [win._rowinfo[u'%s|%s' % k] for k in state['ticked'] if u'%s|%s' % k in win._rowinfo]
            do_issue([r for r in rows if r['ok']], state, settings, reg, cache, True)
        elif act[0] == 'issue':
            do_issue(act[1], state, settings, reg, cache, False)
            settings.pop('_names', None)
            core.save_settings(settings)
            return


try:
    main()
finally:
    ui.close_kept()
