# -*- coding: utf-8 -*-
"""BIM Export: tick ACC models and drawings in one window, set PDF / CAD options, export.

Workshared models open DETACHED (all worksets, links checked) and close without saving.
Drawing lists are saved per model, so the window is instant after the first read.
"""
from __future__ import print_function

__title__ = 'Export\nSheets'
__author__ = 'Lew'
__context__ = 'zero-doc'                # works with no model open (it opens models itself)

import os
import time

from pyrevit import forms, script

import bimexport_core as core

uiapp = __revit__                       # noqa: F821  (provided by pyRevit)
app = uiapp.Application
output = script.get_output()


# ------------------------------------------------------------ model access --
KEPT = {}            # models read for their sheet list and kept open for the export: guid -> (doc, note)
OPEN_SECS = {}       # guid -> seconds it took to open


RUN_T0 = {'t': None}     # when the models were picked (first Check / Load / Issue / Export press)


def start_clock():
    if RUN_T0['t'] is None:
        RUN_T0['t'] = time.time()


def _time_line(started):
    t0 = RUN_T0['t']
    if t0 and t0 < started - 5:
        return 'Time: %.1f min since the models were picked (this run %.1f min)' % (
            (time.time() - t0) / 60.0, (time.time() - started) / 60.0)
    return 'Time: %.1f min' % ((time.time() - started) / 60.0)


def open_model(rec, settings, reg, worksets=None):
    """Returns (doc, close_after, note, error)."""
    guid = rec['ModelGUID'].lower()
    if guid in KEPT:
        doc, note = KEPT.pop(guid)
        return doc, True, note, None
    doc = core.find_open_doc(app, guid)
    if doc is not None:
        return doc, False, 'Already open in this Revit - exported from your open copy (including unsynced changes)', None
    t0 = time.time()
    if worksets is None:
        worksets = 'skip' if settings.get('skip_links') else 'all'
    doc, region, err = core.open_cloud_model(app, rec, settings.get('region'),
                                             bool(settings.get('allow_non_workshared', False)),
                                             worksets, settings.get('link_pattern') or '*Link*')
    OPEN_SECS[guid] = time.time() - t0
    if doc is None:
        return None, False, None, err
    r = reg.setdefault(guid, dict(rec))
    r['Name'] = core.model_name(doc)
    r['LastSeen'] = core.now()
    if region:
        r['Region'] = region
        if settings.get('region') != region:
            settings['region'] = region          # learn the ACC region: next models try it first
            core.save_settings(settings)
    return doc, True, err, None


def close_model(doc):
    try:
        doc.Close(False)                     # never save, never sync
    except Exception:
        pass


def close_kept():
    for guid in list(KEPT.keys()):
        close_model(KEPT.pop(guid)[0])


def run_on_model(rec, settings, reg, fn):
    """Open (detached if workshared), call fn(doc), close without saving.
    Returns (result, note, error)."""
    doc, close_after, note, err = open_model(rec, settings, reg)
    if doc is None:
        return None, None, err
    try:
        return fn(doc), note, None
    finally:
        if close_after:
            close_model(doc)


def scan_models(models, settings, reg, cache, keep):
    """Open each model to save its sheet list. keep=True leaves them open for the export
    (each model is then opened only ONCE in this run)."""
    rule = settings.get('naming_rule') or '{DrawingNumber}'
    failed = []
    with core.QuietRevit(uiapp):
        with forms.ProgressBar(title='Opening models to read sheet lists: {value} of {max_value}',
                               cancellable=True) as pb:
            for i, rec in enumerate(models):
                if pb.cancelled:
                    break
                pb.update_progress(i, len(models))
                try:
                    pb.title = u'Reading drawing lists (quick open, no links): model %d of %d  \u00b7  %s' % (
                        i + 1, len(models), rec.get('Name') or core.register_label(rec))
                except Exception:
                    pass
                guid = rec['ModelGUID'].lower()
                doc, close_after, note, err = open_model(rec, settings, reg, worksets='none')   # quick: no worksets, no links
                if doc is None:
                    failed.append('%s: %s' % (core.register_label(rec), err))
                    continue
                try:
                    cache[guid] = core.read_sheet_list(doc, rule)
                except Exception as e:
                    failed.append('%s: %s' % (core.register_label(rec), core.text(e)))
                if close_after:
                    close_model(doc)                  # light copy: never reused for printing
    core.save_sheet_cache(cache)
    core.save_register(reg)
    return failed


# ------------------------------------------------------------------ window --
from System.Windows import Thickness, FontWeights, VerticalAlignment, GridLength
from System.Windows.Controls import (CheckBox, TreeViewItem, StackPanel, TextBlock, ComboBox,
                                     Orientation)
from System.Windows.Media import BrushConverter

_BC = BrushConverter()


def _brush(hexcolor):
    b = _BC.ConvertFromString(hexcolor)
    try:
        b.Freeze()                      # shareable between the Revit thread and the progress window thread
    except Exception:
        pass
    return b


MUTED = _brush('#6B7785')
ACCENT = _brush('#1F5FA8')
NO_GROUPING = u'(no grouping)'
XAML = os.path.join(os.path.dirname(__file__), 'ExportWindow.xaml')


def autocad_ready(settings, ask=True):
    """Check (and offer to fix) what the logo step needs. True = ready."""
    lsp = core.img2ole_path(settings)
    if not lsp:
        forms.alert('IMG2OLE.lsp was not found.\n\nThe BIMExport extension folder should contain an "img2ole" '
                    'folder. Copy the whole BIMExport.extension again from the zip.')
        return False
    if not core.find_acad(settings):
        exe = forms.pick_file(file_ext='exe', title='AutoCAD not found - where is acad.exe? '
                                                    '(C:\\Program Files\\Autodesk\\AutoCAD 20xx)')
        if not exe:
            return False
        settings['acad_exe'] = exe
        core.save_settings(settings)
    folder = os.path.dirname(lsp)
    if settings.get('acad_trust_manual') == folder:
        return True                                   # you confirmed the manual setup before
    profiles, missing = core.acad_trusted_missing(folder)
    if not profiles:
        try:
            import System
            System.Windows.Clipboard.SetText(folder)
        except Exception:
            pass
        choice = forms.CommandSwitchWindow.show(
            ['I added it - continue', 'Continue - I will click "Always Load" in AutoCAD', 'Cancel'],
            message=('I could not find AutoCAD\'s settings automatically (found: %s).\n\n'
                     'Add this folder to AutoCAD\'s Trusted Locations once (the path is on your clipboard):\n%s\n\n'
                     'AutoCAD: OPTIONS > Files > Trusted Locations > Add > paste > OK.\n'
                     'Or skip it: the first time, AutoCAD asks about IMG2OLE.lsp - click "Always Load".'
                     % (', '.join(core.acad_versions_found()) or 'nothing', folder)))
        if not choice or choice == 'Cancel':
            return False
        if choice.startswith('I added'):
            settings['acad_trust_manual'] = folder
            core.save_settings(settings)
        return True
    if missing and ask:
        if not forms.alert('One-time AutoCAD setup:\n\nAdd this folder to AutoCAD\'s Trusted Locations, so AutoCAD '
                           'can run the logo tool without a security pop-up?\n\n%s' % folder, yes=True, no=True):
            return False
        while core.acad_running():
            if not forms.alert('Please close AutoCAD first (it would overwrite this setting when it closes).\n\n'
                               'Closed it?', yes=True, no=True):
                return False
        n = core.acad_add_trusted(folder)
        forms.alert('Done: added to %d AutoCAD profile(s).' % n)
    return True


def needs_scan(entry):
    return not entry or 'orgs' not in entry or 'setups' not in entry


def plain_text(t):
    """A TextBlock, so names show exactly as in ACC (WPF hides '_' in plain checkbox text)."""
    tb = TextBlock()
    tb.Text = t
    return tb


class ExportWindow(forms.WPFWindow):
    """Main window: 1 Models, 2 Drawings (tree), 3 Settings. Sets self.action and closes."""

    def __init__(self, state, settings, reg, cache):
        forms.WPFWindow.__init__(self, XAML)
        self.state, self.settings, self.reg, self.cache = state, settings, reg, cache
        self.action = None
        self._leaf = []          # (checkbox, key)
        self._groups = []        # (checkbox, [keys])
        self._fill_settings()
        self._fill_models()
        self._build_tree()
        self.header_info.Text = u'Revit %s\n%d ACC models on this PC  ·  region %s' % (
            app.VersionNumber, len(reg), settings.get('region') or '?')
        self._update_status()

    # ---------------------------------------------------------- settings --
    CUSTOM = u'(Custom - use the values below)'

    def _pdf_controls(self):
        return [self.pdf_paper_cb, self.pdf_orient_cb, self.pdf_place_cb, self.pdf_zoom_cb, self.pdf_zoom_tb,
                self.pdf_raster_cb, self.pdf_colors_cb, self.pdf_proc_cb, self.pdf_links_blue_cb,
                self.pdf_hide_ref_cb, self.pdf_hide_tags_cb, self.pdf_mask_cb, self.pdf_hide_scope_cb,
                self.pdf_hide_crop_cb, self.pdf_halftone_cb]

    def _dwg_controls(self):
        return [self.dwg_version_cb, self.dwg_layers_cb, self.dwg_colors_cb, self.dwg_merged_cb, self.dwg_shared_cb]

    def _show_pdf(self, v):
        shown = lambda pairs: [d for d, _ in pairs]
        self._combo(self.pdf_paper_cb, shown(core.PDF_PAPERS), v['paper'], keep_unknown=True)
        self._combo(self.pdf_orient_cb, shown(core.PDF_ORIENT), v['orientation'], keep_unknown=True)
        self._combo(self.pdf_place_cb, shown(core.PDF_PLACE), v['placement'], keep_unknown=True)
        self._combo(self.pdf_zoom_cb, shown(core.PDF_ZOOM), v['zoom'], keep_unknown=True)
        self.pdf_zoom_tb.Text = core.text(v.get('zoom_pct') or 100)
        self._combo(self.pdf_raster_cb, core.PDF_RASTER, v['raster_quality'], keep_unknown=True)
        self._combo(self.pdf_colors_cb, shown(core.PDF_COLORS), v['colors'], keep_unknown=True)
        self._combo(self.pdf_proc_cb, ['Vector', 'Raster'], v['processing'])
        for cb, k in ((self.pdf_links_blue_cb, 'links_blue'), (self.pdf_hide_ref_cb, 'hide_ref_planes'),
                      (self.pdf_hide_tags_cb, 'hide_unref_tags'), (self.pdf_mask_cb, 'mask_coincident'),
                      (self.pdf_hide_scope_cb, 'hide_scope'), (self.pdf_hide_crop_cb, 'hide_crop'),
                      (self.pdf_halftone_cb, 'halftone_thin')):
            cb.IsChecked = bool(v.get(k))
        self._pdf_offsets = (v.get('offset_x', 0.0), v.get('offset_y', 0.0))

    def _show_dwg(self, v):
        self._combo(self.dwg_version_cb, core.DWG_VERSIONS, core.text(v['version']), keep_unknown=True)
        self._combo(self.dwg_layers_cb, core.DWG_LAYERS, v['layers'], keep_unknown=True)
        self._combo(self.dwg_colors_cb, [d for d, _ in core.DWG_COLORS],
                    core.to_shown(core.DWG_COLORS, v.get('colors') or 'IndexColors'), keep_unknown=True)
        self.dwg_merged_cb.IsChecked = bool(v['merged_views'])
        self.dwg_shared_cb.IsChecked = bool(v['shared_coords'])

    def _setups(self, kind):
        """{setup name: (values, [models that have it])} over the loaded models."""
        out = {}
        for g in self.state.get('loaded', []):
            e = self.cache.get(g) or {}
            for name, vals in ((e.get('setups') or {}).get(kind) or {}).items():
                if name not in out:
                    out[name] = (vals, [])
                out[name][1].append(e.get('model', '?'))
        return out

    def _fill_setup_combos(self):
        self._filling = True
        for kind, cb, current in (('pdf', self.pdf_setup_cb, core.pdf_settings(self.settings).get('setup')),
                                  ('dwg', self.dwg_setup_cb, core.dwg_settings(self.settings).get('setup'))):
            names = sorted(self._setups(kind).keys())
            cb.Items.Clear()
            cb.Items.Add(self.CUSTOM)
            for n in names:
                cb.Items.Add(n)
            cb.SelectedItem = current if current in names else self.CUSTOM
        self._filling = False
        self.on_pdf_setup(None, None)
        self.on_dwg_setup(None, None)

    def on_pdf_setup(self, sender, args):
        if getattr(self, '_filling', False):
            return
        name = self.pdf_setup_cb.SelectedItem
        setups = self._setups('pdf')
        n_loaded = len(self.state.get('loaded', []))
        if name and name != self.CUSTOM and name in setups:
            vals, models = setups[name]
            self._show_pdf(vals)
            for c in self._pdf_controls():
                c.IsEnabled = False
            self.pdf_naming_btn.IsEnabled = bool(vals.get('naming'))
            self.pdf_setup_info.Text = u'In %d of %d loaded model(s). Shown: its settings (read-only).%s' % (
                len(models), n_loaded, (u'\nFile naming: ' + vals['naming']) if vals.get('naming') else u'')
        else:
            if sender is not None:
                self._show_pdf(core.pdf_settings(self.settings))
            for c in self._pdf_controls():
                c.IsEnabled = True
            self.pdf_naming_btn.IsEnabled = False
            self.pdf_setup_info.Text = (u'Load drawings to list the setups saved in the models.' if not setups
                                        else u'%d setup(s) found in the loaded models.' % len(setups))

    def on_dwg_setup(self, sender, args):
        if getattr(self, '_filling', False):
            return
        name = self.dwg_setup_cb.SelectedItem
        setups = self._setups('dwg')
        n_loaded = len(self.state.get('loaded', []))
        if name and name != self.CUSTOM and name in setups:
            vals, models = setups[name]
            self._show_dwg(vals)
            for c in self._dwg_controls():
                c.IsEnabled = False
            self.dwg_setup_info.Text = u'In %d of %d loaded model(s). Shown: its settings (read-only). Units: %s' % (
                len(models), n_loaded, vals.get('units', '?'))
        else:
            if sender is not None:
                self._show_dwg(core.dwg_settings(self.settings))
            for c in self._dwg_controls():
                c.IsEnabled = True
            self.dwg_setup_info.Text = (u'Load drawings to list the setups saved in the models.' if not setups
                                        else u'%d setup(s) found in the loaded models.' % len(setups))

    def on_pdf_naming(self, sender, args):
        name = self.pdf_setup_cb.SelectedItem
        vals = self._setups('pdf').get(name, ({}, []))[0]
        if vals.get('naming'):
            self.naming_tb.Text = vals['naming']
            forms.alert('File name rule copied from "%s":\n\n%s' % (name, vals['naming']))

    def _combo(self, cb, items, value, keep_unknown=False):
        cb.Items.Clear()
        for i in items:
            cb.Items.Add(i)
        if keep_unknown and value and value not in items:
            cb.Items.Add(value)
        cb.SelectedItem = value if (value in items or keep_unknown and value) else items[0]

    def _fill_settings(self):
        s = self.settings
        fm = s.get('_formats') or {'pdf': 'Y', 'dwg': 'Y'}
        self.out_tb.Text = s.get('last_output') or ''
        self.per_model_cb.IsChecked = bool(s.get('per_model_folder', True))
        self.pdf_cb.IsChecked = core.yes(fm.get('pdf'))
        self.dwg_cb.IsChecked = core.yes(fm.get('dwg'))
        self.naming_tb.Text = s.get('naming_rule') or '{SheetNumber}_{SheetName}'
        self._show_pdf(core.pdf_settings(s))
        self._show_dwg(core.dwg_settings(s))
        self.embed_cb.IsChecked = bool(s.get('embed', True))
        self.share_cb.IsChecked = bool(s.get('share', False))
        self.allow_nonws_cb.IsChecked = bool(s.get('allow_non_workshared', False))
        self.skip_links_cb.IsChecked = bool(s.get('skip_links', False))
        self.link_pattern_tb.Text = s.get('link_pattern') or '*Link*'
        self.model_search.Text = self.state.get('model_filter', '')
        self.sheet_search.Text = self.state.get('sheet_filter', '')
        try:                                                  # panel widths you dragged last time
            if s.get('col_models'):
                self.col_models.Width = GridLength(float(s['col_models']))
            if s.get('col_settings'):
                self.col_settings.Width = GridLength(float(s['col_settings']))
        except Exception:
            pass
        self._fill_setup_combos()

    def _read_settings(self):
        s = self.settings
        s['last_output'] = self.out_tb.Text.strip()
        s['per_model_folder'] = bool(self.per_model_cb.IsChecked)
        s['_formats'] = {'pdf': 'Y' if self.pdf_cb.IsChecked else 'N', 'dwg': 'Y' if self.dwg_cb.IsChecked else 'N'}
        s['naming_rule'] = self.naming_tb.Text.strip() or '{SheetNumber}'
        pset = self.pdf_setup_cb.SelectedItem
        try:
            zoom_pct = int(self.pdf_zoom_tb.Text)
        except Exception:
            zoom_pct = 100
        offs = getattr(self, '_pdf_offsets', (0.0, 0.0))
        s['pdf'] = {'setup': '' if (not pset or pset == self.CUSTOM) else pset,
                    'paper': self.pdf_paper_cb.SelectedItem, 'orientation': self.pdf_orient_cb.SelectedItem,
                    'placement': self.pdf_place_cb.SelectedItem, 'offset_x': offs[0], 'offset_y': offs[1],
                    'zoom': self.pdf_zoom_cb.SelectedItem, 'zoom_pct': zoom_pct,
                    'raster_quality': self.pdf_raster_cb.SelectedItem, 'colors': self.pdf_colors_cb.SelectedItem,
                    'processing': self.pdf_proc_cb.SelectedItem,
                    'links_blue': bool(self.pdf_links_blue_cb.IsChecked),
                    'hide_ref_planes': bool(self.pdf_hide_ref_cb.IsChecked),
                    'hide_unref_tags': bool(self.pdf_hide_tags_cb.IsChecked),
                    'mask_coincident': bool(self.pdf_mask_cb.IsChecked),
                    'hide_scope': bool(self.pdf_hide_scope_cb.IsChecked),
                    'hide_crop': bool(self.pdf_hide_crop_cb.IsChecked),
                    'halftone_thin': bool(self.pdf_halftone_cb.IsChecked)}
        dset = self.dwg_setup_cb.SelectedItem
        s['dwg'] = {'setup': '' if (not dset or dset == self.CUSTOM) else dset,
                    'version': self.dwg_version_cb.SelectedItem, 'layers': self.dwg_layers_cb.SelectedItem,
                    'colors': core.to_api(core.DWG_COLORS, self.dwg_colors_cb.SelectedItem),
                    'merged_views': bool(self.dwg_merged_cb.IsChecked),
                    'shared_coords': bool(self.dwg_shared_cb.IsChecked),
                    'units': core.dwg_settings(s).get('units', 'Default')}
        s['embed'] = bool(self.embed_cb.IsChecked)
        s['share'] = bool(self.share_cb.IsChecked)
        s['allow_non_workshared'] = bool(self.allow_nonws_cb.IsChecked)
        s['skip_links'] = bool(self.skip_links_cb.IsChecked)
        s['link_pattern'] = self.link_pattern_tb.Text.strip() or '*Link*'
        try:
            s['col_models'] = round(self.col_models.ActualWidth)
            s['col_settings'] = round(self.col_settings.ActualWidth)
        except Exception:
            pass
        s.pop('pdf_setup', None)
        s.pop('dwg_setup', None)
        self.state['model_filter'] = self.model_search.Text
        self.state['sheet_filter'] = self.sheet_search.Text

    # ------------------------------------------------------------ models --
    def _fill_models(self):
        flt = (self.model_search.Text or '').strip().lower()
        self.models_lb.Items.Clear()
        recs = sorted(self.reg.values(), key=lambda r: core.register_label(r).lower())
        for r in recs:
            label = core.register_label(r)
            if flt and flt not in label.lower():
                continue
            g = r['ModelGUID'].lower()
            cb = CheckBox()
            cb.Content = plain_text(label)
            cb.Tag = g
            cb.IsChecked = g in self.state['checked_models']
            cb.ToolTip = u'Sheet list saved: %s' % (self.cache.get(g, {}).get('updated') or 'not yet')
            cb.Click += self._on_model_click
            self.models_lb.Items.Add(cb)
        self._update_model_info()

    def _on_model_click(self, sender, args):
        if sender.IsChecked:
            self.state['checked_models'].add(sender.Tag)
        else:
            self.state['checked_models'].discard(sender.Tag)
        self._update_model_info()

    def _update_model_info(self):
        n = len(self.state['checked_models'])
        new = len([g for g in self.state['checked_models'] if needs_scan(self.cache.get(g))])
        txt = u'%d model(s) ticked' % n
        if new:
            txt += u'  ·  %d need reading once (they open in the background)' % new
        if n > 10:
            txt += u'\nMore than 10: tick "Share with other Revit windows" (Run tab).'
        self.model_info_tb.Text = txt

    def on_model_search(self, sender, args):
        self._fill_models()

    def on_load(self, sender, args):
        start_clock()
        self._read_settings()
        checked = list(self.state['checked_models'])
        if not checked:
            forms.alert('Tick at least one model first.')
            return
        if self.refresh_cb.IsChecked:
            to_scan = checked
        else:
            to_scan = [g for g in checked if needs_scan(self.cache.get(g))]
        if to_scan:
            if not forms.alert('Read the drawings of %d model(s)?\n\nEach opens in the background (detached), '
                               'then its list is saved. Next time it is instant.\n\nQuick open: no worksets and no '
                               'linked models are loaded for this step.' % len(to_scan), yes=True, no=True):
                return
            self.action = ('scan', to_scan)
            self.Close()
            return
        self.state['loaded'] = checked
        self._build_tree()
        self._fill_setup_combos()
        self._update_status()

    # ------------------------------------------------------------ drawings --
    def _keys_of(self, guid, sheets):
        return [(guid, e['number'].strip().lower()) for e in sheets]

    def _group_checkbox(self, text, keys, bold=False):
        cb = CheckBox()
        tb = TextBlock()
        tb.Text = text
        if bold:
            tb.FontWeight = FontWeights.SemiBold
        cb.Content = tb
        cb.Tag = keys
        cb.Click += self._on_group_click
        cb.VerticalAlignment = VerticalAlignment.Center
        self._groups.append((cb, keys))
        return cb

    def _build_tree(self):
        tv = self.sheets_tv
        tv.Items.Clear()
        self._leaf, self._groups = [], []
        flt = (self.sheet_search.Text or '').strip().lower()
        for guid in self.state.get('loaded', []):
            entry = self.cache.get(guid)
            if not entry:
                continue
            orgs = entry.get('orgs') or {}
            names = sorted(orgs.keys()) + [NO_GROUPING]
            org = self.state['org'].get(guid) or entry.get('current_org') or names[0]
            if org not in names:
                org = names[0]
            sheets = [e for e in entry.get('sheets', [])
                      if not flt or flt in (u'%s %s' % (e['number'], e['name'])).lower()]
            if org != NO_GROUPING:
                sheets = [e for e in sheets if e['number'] in orgs.get(org, {})] or sheets

            head = StackPanel()
            head.Orientation = Orientation.Horizontal
            mcb = self._group_checkbox(u'%s   (%d)' % (entry.get('model', '?'), len(sheets)),
                                       self._keys_of(guid, sheets), bold=True)
            head.Children.Add(mcb)
            lab = TextBlock()
            lab.Text = u'      Browser:  '
            lab.Foreground = MUTED
            lab.VerticalAlignment = VerticalAlignment.Center
            head.Children.Add(lab)
            combo = ComboBox()
            combo.MinWidth = 170
            for n in names:
                combo.Items.Add(n)
            combo.SelectedItem = org
            combo.SelectionChanged += self._org_handler(guid)
            head.Children.Add(combo)
            upd = TextBlock()
            upd.Text = u'      saved %s' % entry.get('updated', '?')
            upd.Foreground = MUTED
            upd.VerticalAlignment = VerticalAlignment.Center
            head.Children.Add(upd)

            mitem = TreeViewItem()
            mitem.Header = head
            mitem.IsExpanded = True
            mitem.Margin = Thickness(0, 2, 0, 6)
            tv.Items.Add(mitem)

            folders = {}
            members = {}
            for e in sheets:
                path = tuple(orgs.get(org, {}).get(e['number'], [])) if org != NO_GROUPING else ()
                key = (guid, e['number'].strip().lower())
                parent = mitem
                for depth in range(1, len(path) + 1):
                    sub = path[:depth]
                    members.setdefault(sub, []).append(key)
                    if sub not in folders:
                        fitem = TreeViewItem()
                        fitem.IsExpanded = True
                        folders[sub] = (fitem, parent)
                        parent.Items.Add(fitem)
                    parent = folders[sub][0]
                leaf = CheckBox()
                leaf.Content = plain_text(u'%s     %s     [%s]' % (e['number'], e['name'], e.get('rev') or '-'))
                leaf.Tag = key
                leaf.Click += self._on_leaf_click
                self._leaf.append((leaf, key))
                litem = TreeViewItem()
                litem.Header = leaf
                parent.Items.Add(litem)
            for sub, (fitem, _) in folders.items():
                fitem.Header = self._group_checkbox(u'%s   (%d)' % (sub[-1] or u'(blank)', len(members[sub])),
                                                    members[sub])
        self._sync_checks()

    def _org_handler(self, guid):
        def handler(sender, args):
            self.state['org'][guid] = sender.SelectedItem
            self._build_tree()
        return handler

    def _sync_checks(self):
        t = self.state['ticked']
        for cb, key in self._leaf:
            cb.IsChecked = key in t
        for cb, keys in self._groups:
            n = len([k for k in keys if k in t])
            cb.IsChecked = True if keys and n == len(keys) else (False if n == 0 else None)
        self._update_status()

    def _on_leaf_click(self, sender, args):
        if sender.IsChecked:
            self.state['ticked'].add(sender.Tag)
        else:
            self.state['ticked'].discard(sender.Tag)
        self._sync_checks()

    def _on_group_click(self, sender, args):
        keys = sender.Tag
        t = self.state['ticked']
        if all(k in t for k in keys):
            for k in keys:
                t.discard(k)
        else:
            for k in keys:
                t.add(k)
        self._sync_checks()

    def on_sheet_search(self, sender, args):
        self._build_tree()

    def on_tick_all(self, sender, args):
        for _, key in self._leaf:
            self.state['ticked'].add(key)
        self._sync_checks()

    def on_untick_all(self, sender, args):
        for _, key in self._leaf:
            self.state['ticked'].discard(key)
        self._sync_checks()

    def _expand(self, items, value):
        for it in items:
            try:
                it.IsExpanded = value
                self._expand(it.Items, value)
            except Exception:
                pass

    def on_expand(self, sender, args):
        self._expand(self.sheets_tv.Items, True)

    def on_collapse(self, sender, args):
        self._expand(self.sheets_tv.Items, False)

    def on_lod(self, sender, args):
        path = forms.pick_file(file_ext='csv', title='Pick a list of drawings (CSV UTF-8)')
        if not path:
            return
        rows = core.read_lod(path)
        found, missing = 0, []
        for row in rows:
            cands = set(core.lod_candidates(row))
            hit = False
            for guid in self.state.get('loaded', []):
                for e in (self.cache.get(guid) or {}).get('sheets', []):
                    k = e['number'].strip().lower()
                    if k in cands:
                        self.state['ticked'].add((guid, k))
                        hit = True
            if hit:
                found += 1
            else:
                missing.append(row['_listed'])
        self._sync_checks()
        forms.alert('%d of %d listed drawings ticked.%s' % (
            found, len(rows), ('\n\nNot found in the loaded models:\n' + '\n'.join(missing[:25])) if missing else ''))

    # ------------------------------------------------------------- footer --
    def picked(self):
        loaded = set(self.state.get('loaded', []))
        out = {}
        for guid, num in self.state['ticked']:
            if guid in loaded:
                out.setdefault(guid, set()).add(num)
        return out

    def _update_status(self):
        p = self.picked()
        fm = []
        if self.pdf_cb.IsChecked:
            fm.append('PDF')
        if self.dwg_cb.IsChecked:
            fm.append('DWG')
        self.status_tb.Text = u'%d drawing(s) ticked in %d model(s)   ·   %s   ·   %s' % (
            sum(len(v) for v in p.values()), len(p), ' + '.join(fm) or 'no format',
            self.out_tb.Text or 'no output folder yet')

    def on_browse(self, sender, args):
        f = forms.pick_folder(title='Output folder')
        if f:
            self.out_tb.Text = f
            self._update_status()

    def _ready(self):
        self._read_settings()
        p = self.picked()
        if not p:
            forms.alert('Tick at least one drawing (load the models first).')
            return False
        if not (self.pdf_cb.IsChecked or self.dwg_cb.IsChecked):
            forms.alert('Choose PDF and/or DWG (Output tab).')
            return False
        if not self.settings['last_output']:
            forms.alert('Choose where to save (Output tab).')
            return False
        if self.settings.get('embed') and self.dwg_cb.IsChecked and not autocad_ready(self.settings):
            return False
        # two drawings that would get the same file name?
        log = []
        for guid, nums in p.items():
            core.plan_from_cache(self.cache.get(guid, {}), nums, self.settings['last_output'], self.settings, log)
        seen, dup = set(), []
        for r in log:
            k = r[7].lower()
            if k in seen:
                dup.append(r[7])
            seen.add(k)
        if dup:
            forms.alert('These files would overwrite each other:\n\n%s\n\nTick "One folder per model" '
                        'or change the file name rule.' % '\n'.join(dup[:15]))
            return False
        return True

    def on_dryrun(self, sender, args):
        if self._ready():
            self.action = ('dryrun', None)
            self.Close()

    def on_export(self, sender, args):
        start_clock()
        if not self._ready():
            return
        names = sorted((self.cache.get(g) or {}).get('model', '?') for g in self.picked())
        if not forms.alert(u'Export %d model(s)?\n\n%s\n\nBefore you continue:\n'
                           u'- Close these models in any OTHER Revit window.\n'
                           u'- Nothing in the models is changed, saved or synced. Workshared models open '
                           u'detached and close without saving.' % (len(names), u'\n'.join(u'  \u2022 ' + n for n in names)),
                           yes=True, no=True):
            return
        self.action = ('export', None)
        self.Close()

    def on_close(self, sender, args):
        self._read_settings()
        self.action = None
        self.Close()


# ------------------------------------------------------- progress window --
from System import Action
from System.Windows import Visibility, GridUnitType
from System.Windows.Controls import Grid, ColumnDefinition
from System.Windows.Threading import Dispatcher, DispatcherPriority

PXAML = os.path.join(os.path.dirname(__file__), 'ProgressWindow.xaml')
OK_BRUSH = _brush('#1E8A4C')
BAD_BRUSH = _brush('#C0392B')
RUN_BRUSH = _brush('#1F5FA8')
ICON = {'wait': (u'○', MUTED), 'run': (u'▶', RUN_BRUSH), 'ok': (u'✔', OK_BRUSH),
        'bad': (u'✖', BAD_BRUSH), 'skip': (u'–', MUTED)}


def _cell(grid, col, text, brush=None, bold=False):
    tb = TextBlock()
    tb.Text = text
    if brush is not None:
        tb.Foreground = brush
    if bold:
        tb.FontWeight = FontWeights.SemiBold
    tb.Margin = Thickness(0, 2, 6, 2)
    Grid.SetColumn(tb, col)
    grid.Children.Add(tb)
    return tb


def _row(widths):
    g = Grid()
    for w in widths:
        cd = ColumnDefinition()
        cd.Width = GridLength(w) if w else GridLength(1, GridUnitType.Star)
        g.ColumnDefinitions.Add(cd)
    return g


class ProgressWindow(forms.WPFWindow):
    """Fixed window: all models with their status, and the drawings of the current model.
    Normally lives on its OWN thread (see ProgressUI), so it keeps moving while Revit is busy."""

    def __init__(self, models, picked, cache, formats, title, skip_links=False, own_thread=True):
        forms.WPFWindow.__init__(self, PXAML, set_owner=not own_thread)
        self.own_thread = own_thread
        self.cancelled = False
        self.t0 = RUN_T0['t'] or time.time()          # the clock runs from when the models were picked
        self.files_ok = self.files_bad = 0
        self.formats = formats                 # ['PDF', 'DWG']
        self.skip_links = skip_links
        self.picked, self.cache = picked, cache
        self.title_tb.Text = title
        self.overall_pb.Maximum = max(1, len(models))
        self.rows = {}
        for rec in models:
            g = rec['ModelGUID'].lower()
            entry = cache.get(g) or {}
            n = len(picked.get(g, [])) if picked else len(entry.get('sheets', []))
            r = _row([26, 0, 110, 150])
            icon = _cell(r, 0, ICON['wait'][0], ICON['wait'][1], True)
            _cell(r, 1, entry.get('model') or rec.get('Name') or core.register_label(rec))
            _cell(r, 2, u'%d drawing(s)' % n, MUTED)
            info = _cell(r, 3, u'waiting', MUTED)
            self.models_sp.Children.Add(r)
            self.rows[g] = (icon, info)
        self.done_models = 0
        self.models_count_tb.Text = u'0 of %d done' % len(models)
        self.cells = {}
        self._tick(None, None)
        if own_thread:                          # live clock, independent of Revit
            from System.Windows.Threading import DispatcherTimer
            from System import TimeSpan
            self._timer = DispatcherTimer()
            self._timer.Interval = TimeSpan.FromSeconds(1)
            self._timer.Tick += self._tick
            self._timer.Start()

    def _tick(self, sender, args):
        self.status_tb.Text = u'Elapsed %s   ·   %d file(s) exported   ·   %d failed' % (
            time.strftime('%H:%M:%S', time.gmtime(time.time() - self.t0)), self.files_ok, self.files_bad)

    def pump(self):
        """Only needed when the window shares Revit's thread (fallback)."""
        if self.own_thread:
            return
        try:
            self._tick(None, None)
            Dispatcher.CurrentDispatcher.Invoke(Action(lambda: None), DispatcherPriority.Background)
        except Exception:
            pass

    def on_cancel(self, sender, args):
        self.cancelled = True
        self.cancel_btn.IsEnabled = False
        self.cancel_btn.Content = u'Stopping after the current file...'

    def _set(self, guid, state, text):
        icon, info = self.rows.get(guid, (None, None))
        if icon is not None:
            icon.Text, icon.Foreground = ICON[state]
            info.Text = text
            info.Foreground = ICON[state][1] if state in ('ok', 'bad') else MUTED

    def model_started(self, rec):
        g = rec['ModelGUID'].lower()
        entry = self.cache.get(g) or {}
        name = entry.get('model') or rec.get('Name') or core.register_label(rec)
        self._set(g, 'run', u'opening...')
        self.current_tb.Text = u'Now:  ' + name
        self.phase_tb.Text = (u'Opening the model from ACC (link worksets skipped - faster).' if self.skip_links else
                              u'Opening the model from ACC with all worksets and linked models. Big models or '
                              u'many links take longest here - Revit is busy, this window keeps running.')
        self.sheets_sp.Children.Clear()
        self.cells = {}
        nums = sorted(self.picked.get(g, [])) if self.picked else [e['number'].lower() for e in entry.get('sheets', [])]
        names = dict((e['number'].strip().lower(), e) for e in entry.get('sheets', []))
        for k in nums:
            e = names.get(k, {'number': k, 'name': ''})
            r = _row([90, 0, 90, 90])
            _cell(r, 0, e['number'])
            _cell(r, 1, e['name'])
            pdf = _cell(r, 2, u'○ waiting' if 'PDF' in self.formats else u'–', MUTED)
            dwg = _cell(r, 3, u'○ waiting' if 'DWG' in self.formats else u'–', MUTED)
            self.sheets_sp.Children.Add(r)
            self.cells[k] = {'PDF': pdf, 'DWG': dwg}
        self.sheet_pb.Maximum = max(1, len(nums) * len(self.formats))
        self.sheet_pb.Value = 0
        self.sheet_pb.IsIndeterminate = True        # moving bar while the model opens
        self.sheets_count_tb.Text = u'%d drawing(s)' % len(nums)
        self.pump()

    def phase(self, text):
        self.phase_tb.Text = text
        self.pump()

    def file(self, fmt, num, status):
        """status None = starting, 'OK' or 'FAILED' = finished."""
        self.sheet_pb.IsIndeterminate = False
        c = self.cells.get(num.strip().lower(), {}).get(fmt)
        if c is not None:
            if status is None:
                c.Text, c.Foreground = u'▶ exporting', RUN_BRUSH
                self.phase_tb.Text = u'Exporting %s  %s' % (fmt, num)
            elif status == 'OK':
                c.Text, c.Foreground = u'✔ done', OK_BRUSH
            else:
                c.Text, c.Foreground = u'✖ failed', BAD_BRUSH
        if status is not None:
            self.sheet_pb.Value = self.sheet_pb.Value + 1
            if status == 'OK':
                self.files_ok += 1
            else:
                self.files_bad += 1
        self.pump()
        return not self.cancelled

    def model_done(self, guid, ok, text):
        self.sheet_pb.IsIndeterminate = False
        self._set(guid, 'ok' if ok else 'bad', text)
        self.done_models += 1
        self.overall_pb.Value = self.done_models
        self.models_count_tb.Text = u'%d of %d done' % (self.done_models, len(self.rows))
        self.pump()

    def finish(self, headline, out_root, other_windows=False, logo_count=0, logo_since=None):
        for g, (icon, info) in self.rows.items():
            if info.Text == u'waiting':
                self._set(g, 'skip', u'done in another window' if other_windows else u'not exported')
        self.sheet_pb.IsIndeterminate = False
        self.title_tb.Text = headline
        self.current_tb.Text = u'Finished' if not self.cancelled else u'Stopped'
        self.phase_tb.Text = u'Full details: _Logs\\SheetExport_log.csv in the output folder.'
        self.cancel_btn.Visibility = Visibility.Collapsed
        self.open_btn.Visibility = Visibility.Visible
        self.close_btn.Visibility = Visibility.Visible
        self._out = out_root
        if getattr(self, '_timer', None) is not None:
            self._timer.Stop()
        if logo_count and self.own_thread:
            self._logo_total, self._logo_since = logo_count, logo_since or core.now()
            self.logo_tb.Visibility = Visibility.Visible
            self.logo_tb.Foreground = RUN_BRUSH
            self.logo_tb.Text = u'Logos: AutoCAD is starting... (0 of %d drawings)' % logo_count
            from System.Windows.Threading import DispatcherTimer
            from System import TimeSpan
            self._logo_timer = DispatcherTimer()
            self._logo_timer.Interval = TimeSpan.FromSeconds(3)
            self._logo_timer.Tick += self._logo_tick
            self._logo_timer.Start()
        else:
            self.spinner.Visibility = Visibility.Collapsed
            self.done_icon.Visibility = Visibility.Visible
        self._tick(None, None)

    def _logo_tick(self, sender, args):
        """Follow AutoCAD: count the drawings IMG2OLE has finished since the export."""
        try:
            rows = [r for r in core.read_csv(os.path.join(core.logs_dir(self._out), 'IMG2OLE_files.csv'))
                    if r.get('Mode') == 'RUN' and r.get('Timestamp', '') >= self._logo_since]
        except Exception:
            rows = []
        done = len(rows)
        bad = len([r for r in rows if r.get('Result') not in ('OK', 'NO_IMAGES')])
        if done >= self._logo_total:
            self._logo_timer.Stop()
            self.spinner.Visibility = Visibility.Collapsed
            self.done_icon.Visibility = Visibility.Visible
            if bad:
                self.logo_tb.Foreground = BAD_BRUSH
                self.logo_tb.Text = (u'⚠ Logos: %d of %d drawings need a check. Click "Embed Logos" on this '
                                     u'folder to see which.' % (bad, done))
            else:
                self.logo_tb.Foreground = OK_BRUSH
                self.logo_tb.Text = u'✔ Logos embedded in all %d drawing(s). Finished DWGs are in the DWG folder.' % done
        else:
            self.logo_tb.Text = u'Logos: AutoCAD is embedding... %d of %d drawings' % (done, self._logo_total)

    def on_open(self, sender, args):
        try:
            os.startfile(self._out)
        except Exception:
            import System
            System.Diagnostics.Process.Start('explorer.exe', self._out)

    def on_close_done(self, sender, args):
        self.Close()


class ProgressUI(object):
    """Runs the ProgressWindow on its own thread, so it animates and keeps time while Revit works.
    Every call is forwarded safely to the window's thread."""

    def __init__(self, *args):
        from System.Threading import Thread, ThreadStart, ApartmentState, ManualResetEvent
        self._args, self.win, self.error = args, None, None
        self._ready, self._closed = ManualResetEvent(False), ManualResetEvent(False)
        t = Thread(ThreadStart(self._run))
        t.SetApartmentState(ApartmentState.STA)
        t.IsBackground = True
        t.Start()
        self._ready.WaitOne()
        if self.error:
            raise Exception(self.error)

    def _run(self):
        try:
            self.win = ProgressWindow(*self._args)
            self.win.Closed += self._on_closed
            self.win.Show()
        except Exception as e:
            self.error = core.text(e)
            self._ready.Set()
            return
        self._ready.Set()
        Dispatcher.Run()

    def _on_closed(self, sender, args):
        self._closed.Set()
        Dispatcher.CurrentDispatcher.BeginInvokeShutdown(DispatcherPriority.Background)

    def _call(self, name, *a):
        w = self.win

        def go():
            try:
                getattr(w, name)(*a)
            except Exception:
                pass
        try:
            w.Dispatcher.BeginInvoke(Action(go))
        except Exception:
            pass

    @property
    def cancelled(self):
        return bool(getattr(self.win, 'cancelled', False))

    def model_started(self, rec):
        self._call('model_started', rec)

    def phase(self, text):
        self._call('phase', text)

    def file(self, fmt, num, status):
        self._call('file', fmt, num, status)
        return not self.cancelled

    def model_done(self, guid, ok, text):
        self._call('model_done', guid, ok, text)

    def finish(self, headline, out_root, other_windows=False, logo_count=0, logo_since=None):
        self._call('finish', headline, out_root, other_windows, logo_count, logo_since)
        self._closed.WaitOne()                   # wait until you close the result window

    def close(self):
        self._call('Close')
        self._closed.WaitOne(5000)


def open_progress(models, picked, cache, formats, title, skip_links=False):
    try:
        return ProgressUI(models, picked, cache, formats, title, skip_links)
    except Exception:
        w = ProgressWindow(models, picked, cache, formats, title, skip_links, own_thread=False)   # fallback
        w.Show()
        w.pump()
        return w


def finish_title(totals, cad_msg):
    t = u'Finished: %d file(s) exported, %d failed' % (totals['ok'], totals['failed'])
    if cad_msg and not cad_msg.startswith('AutoCAD started'):
        t += u'  \u00b7  LOGOS NOT STARTED: ' + cad_msg
    return t


def export_models(next_rec, models, job, settings, reg, cache, log_path, title):
    """Export model after model, as long as next_rec() gives one.
    Returns (lines, totals, matched, progress window)."""
    do_export, out_root = job['do_export'], job['out_root']
    picked = dict((g, set(v)) for g, v in job['picked'].items()) if job.get('picked') is not None else None
    lod_rows = job.get('lod_rows')
    fm = job.get('_formats') or settings.get('_formats') or {}
    formats = [f for f in ('PDF', 'DWG') if core.yes(fm.get(f.lower()))]
    totals = {'ok': 0, 'failed': 0, 'would': 0}
    lines, matched_all = [], set()
    opened_before = set(KEPT.keys())
    pw = open_progress(models, picked, cache, formats, title, bool(settings.get('skip_links')))
    try:
        return _export_loop(pw, next_rec, job, settings, reg, cache, log_path, picked, lod_rows, totals,
                            lines, matched_all, opened_before, do_export, out_root)
    except Exception:
        try:
            pw.close()
        except Exception:
            pass
        raise


def _export_loop(pw, next_rec, job, settings, reg, cache, log_path, picked, lod_rows, totals,
                 lines, matched_all, opened_before, do_export, out_root):
    with core.QuietRevit(uiapp):
        while not pw.cancelled:
            rec = next_rec()
            if rec is None:
                break
            label = core.register_label(rec)
            guid = rec['ModelGUID'].lower()
            log = []
            t0 = time.time()
            pw.model_started(rec)

            def progress(i, n, fmt, num, status=None):
                return pw.file(fmt, num, status)

            def work(doc):
                pw.phase(u'Reading drawings, export setups and links...')
                entry = core.read_sheet_list(doc, settings.get('naming_rule') or '{DrawingNumber}')
                cache[guid] = entry
                try:
                    core.save_sheet_entry(guid, entry)
                except Exception:
                    pass
                links = core.check_links(doc, reload_links=not settings.get('skip_links'))
                res = core.export_model(doc, lod_rows, out_root, settings, do_export, log,
                                        picked=picked.get(guid) if picked is not None else None,
                                        progress=progress)
                pw.phase(u'Closing the model (not saved)...')
                return res, links, core.model_name(doc)

            try:
                res, note, err = run_on_model(rec, settings, reg, work)
            except Exception as e:
                res, note, err = None, None, core.text(e)
            if res is None:
                lines.append('FAILED %s: %s' % (label, err))
                log.append([core.now(), 'OPEN', label, '', '', '', '', '', 'FAILED', '', err])
                pw.model_done(guid, False, u'not opened - see report')
            else:
                (matched, counts, notes, raw_dir), links, mname = res
                matched_all |= matched
                for k in totals:
                    totals[k] += counts[k]
                extra = ([note] if note else []) + links + notes
                for n in extra:
                    log.append([core.now(), 'INFO', mname, '', '', '', '', '', 'NOTE', '', n])
                total = time.time() - t0
                osecs = OPEN_SECS.get(guid)
                timing = ('open %.0fs + export %.0fs' % (osecs, max(0, total - osecs))
                          if (osecs is not None and guid not in opened_before)
                          else 'export %.0fs (model was already open)' % total)
                lines.append('%s: %d drawing(s), %s  |  %s%s' % (
                    mname, len(matched),
                    ('%d file(s) exported, %d failed' % (counts['ok'], counts['failed'])) if do_export
                    else ('%d file(s) would export' % counts['would']),
                    timing, ('  [%s]' % '; '.join(extra)) if extra else ''))
                pw.model_done(guid, counts['failed'] == 0,
                              u'%d file(s), %s' % (counts['ok'], time.strftime('%M:%S', time.gmtime(total)))
                              if counts['failed'] == 0 else u'%d failed - see report' % counts['failed'])
            core.append_csv(log_path, core.LOG_HEADER, log)
            if job.get('_on_done'):
                job['_on_done'](guid)
        if pw.cancelled:
            lines.append('Cancelled by user (models not started are left for other windows / next run).')
    core.save_register(reg)
    return lines, totals, matched_all, pw


def report(title, started, lines, totals, do_export, missing, cad_msg, log_path):
    output.print_md('## %s' % title)
    output.print_md(_time_line(started))
    for l in lines:
        output.print_md('- ' + l)
    output.print_md('**Files %s: %d%s**' % (
        'exported' if do_export else 'that would export',
        totals['ok'] if do_export else totals['would'],
        (', failed: %d' % totals['failed']) if do_export else ''))
    if missing:
        output.print_md('**LOD numbers not found in the chosen models: %d**' % len(missing))
        for m in missing[:30]:
            output.print_md('  - ' + m)
    if cad_msg:
        output.print_md('**Logos:** ' + cad_msg)
    output.print_md('Log: `%s`' % log_path)


def run_queue(qd, job, settings, reg, cache, window_name):
    """Work on a shared export until no model is left. Any number of Revit windows can do this."""
    models = dict((m['ModelGUID'].lower(), m) for m in job['models'])
    for k in ('naming_rule', 'pdf', 'dwg', 'per_model_folder', '_formats', 'allow_non_workshared'):
        if k in job:
            settings[k] = job[k]
    log_path = core.usable_log_path(os.path.join(core.logs_dir(job['out_root']), 'SheetExport_log.csv'))
    job['_on_done'] = lambda g: core.queue_done(qd, g)
    claimed = []

    def next_rec():
        g = core.queue_claim(qd, prefer=tuple(KEPT.keys()))
        if g is None:
            return None
        claimed.append(g)
        return models.get(g)

    started = time.time()
    left = len([x for x in os.listdir(qd) if x.endswith('.todo')])
    lines, totals, _, pw = export_models(next_rec, job['models'], job, settings, reg, cache, log_path,
                                         u'Exporting  \u00b7  %s (shared)' % window_name)
    for g in list(KEPT.keys()):                 # kept models another window took: close ours
        close_model(KEPT.pop(g)[0])
    cad_msg, logo_count, logo_since = '', 0, None
    if core.queue_finished(qd):
        if job.get('run_cad') and core.queue_claim_logos(qd):
            jobs = core.find_raw_dwgs(job['out_root'])
            logo_since = core.now()
            cad_msg = core.start_img2ole(jobs, job['out_root'], settings) if jobs else 'No DWG files to process.'
            logo_count = len(jobs) if cad_msg.startswith('AutoCAD started') else 0
        lines.append('All models of the shared export are finished.')
    else:
        lines.append('Other Revit window(s) are still working. The last one to finish starts the logo step.')
    report('Sheet Export - %s (%d model(s) done here)' % (window_name, len(claimed)), started, lines,
           totals, job['do_export'], [], cad_msg, log_path)
    pw.finish(finish_title(totals, cad_msg), job['out_root'], other_windows=True,
              logo_count=logo_count, logo_since=logo_since)


def main():
    settings = core.load_settings()
    reg = core.refresh_register(app.VersionNumber)
    cache = core.load_sheet_cache()

    # another Revit window already started a shared export?
    active = core.queue_active()
    if active and (active[1] or {}).get('kind') != 'issue':        # a shared Issue Sheets run is joined there
        qd, job, left = active
        choice = forms.CommandSwitchWindow.show(
            ['Join the running export (%d model(s) left)' % left, 'Start a new export'],
            message='An export is running in another Revit window.')
        if not choice:
            return
        if choice.startswith('Join'):
            run_queue(qd, job, settings, reg, cache, 'Helper window')
            return

    if not reg:
        forms.alert('No ACC models found on this PC.\n\nThe list is built from Revit\'s cloud cache: any ACC model '
                    'you have opened in Revit %s on this PC appears here.' % app.VersionNumber)
        return

    state = {'checked_models': set(), 'loaded': [], 'ticked': set(), 'org': {},
             'model_filter': '', 'sheet_filter': ''}
    while True:
        win = ExportWindow(state, settings, reg, cache)
        win.ShowDialog()
        core.save_settings(settings)
        act = win.action
        if act is None:
            return
        if act[0] == 'scan':
            recs = [reg[g] for g in act[1] if g in reg]
            failed = scan_models(recs, settings, reg, cache, False)
            state['loaded'] = [g for g in state['checked_models'] if cache.get(g)]
            if failed:
                forms.alert('Could not read these models:\n\n' + '\n'.join(failed))
            continue
        break

    picked = win.picked()
    models = [reg[g] for g in picked if g in reg]
    for g in list(KEPT.keys()):                    # close models that are not part of the export
        if g not in picked:
            close_model(KEPT.pop(g)[0])
    do_export = act[0] == 'export'
    out_root = settings['last_output']
    core.ensure_dir(out_root)
    run_cad = do_export and settings.get('embed') and settings['_formats'].get('dwg') == 'Y'
    share = do_export and settings.get('share') and len(models) > 1

    if do_export and len(models) > 10 and not share:
        if not forms.alert('%d models in one Revit window will take a while.\n\nContinue anyway? '
                           '(Or tick "Share with other Revit windows" in the Run tab.)' % len(models),
                           yes=True, no=True):
            return

    job = {'out_root': out_root, 'do_export': do_export, 'run_cad': bool(run_cad), 'models': models,
           'picked': dict((g, sorted(v)) for g, v in picked.items()), 'lod_rows': None,
           'naming_rule': settings.get('naming_rule'), 'pdf': settings.get('pdf'), 'dwg': settings.get('dwg'),
           'per_model_folder': settings.get('per_model_folder', True), '_formats': settings['_formats'],
           'allow_non_workshared': bool(settings.get('allow_non_workshared', False))}

    if share:
        qd = core.queue_create(out_root, job, [m['ModelGUID'].lower() for m in models])
        run_queue(qd, job, settings, reg, cache, 'Main window')
        return

    log_path = core.usable_log_path(os.path.join(core.logs_dir(out_root), 'SheetExport_log.csv'))
    if not log_path.endswith('SheetExport_log.csv'):
        forms.alert('SheetExport_log.csv is open in another program (Excel?).\n\nThis run writes to:\n%s' % log_path)
    started = time.time()

    if not do_export:
        log, lines, totals = [], [], {'ok': 0, 'failed': 0, 'would': 0}
        for rec in models:
            g = rec['ModelGUID'].lower()
            entry = cache.get(g, {})
            n = core.plan_from_cache(entry, picked.get(g, set()), out_root, settings, log)
            totals['would'] += n
            lines.append('%s: %d drawing(s), %d file(s) would export (sheet list saved %s)' % (
                entry.get('model', '?'), len(picked.get(g, [])), n, entry.get('updated', '?')))
        core.append_csv(log_path, core.LOG_HEADER, log)
        report('Sheet Export - DRY RUN (instant, nothing opened)', started, lines, totals, False, [], '', log_path)
        return

    queue = list(models)
    queue.sort(key=lambda m: m['ModelGUID'].lower() not in KEPT)          # already-open models first
    lines, totals, _, pw = export_models(lambda: queue.pop(0) if queue else None, list(queue), job, settings,
                                         reg, cache, log_path, u'Exporting')
    cad_msg, logo_count, logo_since = '', 0, None
    if run_cad:
        jobs = core.find_raw_dwgs(out_root)
        logo_since = core.now()
        cad_msg = core.start_img2ole(jobs, out_root, settings) if jobs else 'No DWG files to process.'
        logo_count = len(jobs) if cad_msg.startswith('AutoCAD started') else 0
    report('Sheet Export - EXPORT', started, lines, totals, True, [], cad_msg, log_path)
    pw.finish(finish_title(totals, cad_msg), out_root, logo_count=logo_count, logo_since=logo_since)


try:
    main()
finally:
    close_kept()
