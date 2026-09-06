import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileUp, Plus, Printer, Save, Send, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import type { ApprovalHistory, KpiForm, KpiPoint } from '../lib/types';
import { currentPeriod, formatDateTime, formatNumber, monthLabel } from '../lib/utils';
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select } from '../components/UI';

const blankPoint = (no: number): KpiPoint => ({
  point_no: no, subject: '', kpi_objective: '', uom: '', weight_percent: 0, source_data: '',
  target: null, actual: null, calc_type: 'HIGHER_BETTER', manual_score: null
});



type KpiImportPreview = KpiPoint & { _row: number; _errors: string[] };
const KPI_IMPORT_HEADERS = ['point_no','subject','kpi_objective','uom','weight_percent','source_data','target','actual','calc_type','manual_score'];

function parseCsvLine(line: string) {
  const out: string[] = []; let current = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') { if (quoted && line[i + 1] === '"') { current += '"'; i += 1; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { out.push(current.trim()); current = ''; }
    else current += char;
  }
  out.push(current.trim()); return out;
}

function rowsFromCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => Object.fromEntries(parseCsvLine(line).map((value, i) => [headers[i], value === '' ? null : value])));
}

let xlsxLoader: Promise<any> | null = null;
function loadXlsx() {
  if ((window as any).XLSX) return Promise.resolve((window as any).XLSX);
  if (xlsxLoader) return xlsxLoader;
  xlsxLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'; script.async = true;
    script.onload = () => (window as any).XLSX ? resolve((window as any).XLSX) : reject(new Error('Excel parser tidak tersedia.'));
    script.onerror = () => reject(new Error('Excel parser gagal dimuat. Gunakan CSV jika jaringan perusahaan memblokir CDN.'));
    document.head.appendChild(script);
  });
  return xlsxLoader;
}

function validateKpiImport(rawRows: any[]): KpiImportPreview[] {
  return rawRows.map((raw, index) => {
    const calc = String(raw.calc_type || 'HIGHER_BETTER').trim().toUpperCase();
    const numberOrNull = (value: any) => value === null || value === undefined || value === '' ? null : Number(value);
    const row: KpiImportPreview = {
      _row: index + 2, _errors: [],
      point_no: Number(raw.point_no || index + 1), subject: String(raw.subject || '').trim(),
      kpi_objective: String(raw.kpi_objective || '').trim(), uom: String(raw.uom || '').trim(),
      weight_percent: Number(raw.weight_percent ?? 0), source_data: String(raw.source_data || '').trim(),
      target: numberOrNull(raw.target), actual: numberOrNull(raw.actual),
      calc_type: calc as KpiPoint['calc_type'], manual_score: numberOrNull(raw.manual_score)
    };
    if (!Number.isInteger(row.point_no) || row.point_no < 1) row._errors.push('point_no harus bilangan bulat >= 1');
    if (!row.kpi_objective) row._errors.push('kpi_objective wajib diisi');
    if (!Number.isFinite(row.weight_percent) || row.weight_percent < 0 || row.weight_percent > 100) row._errors.push('weight_percent harus 0-100');
    if (!['HIGHER_BETTER','LOWER_BETTER','MANUAL_SCORE'].includes(calc)) row._errors.push('calc_type tidak valid');
    if (calc !== 'MANUAL_SCORE' && (row.target === null || !Number.isFinite(Number(row.target)))) row._errors.push('target wajib berupa angka');
    if (calc === 'MANUAL_SCORE' && row.manual_score !== null && (Number(row.manual_score) < 0 || Number(row.manual_score) > 100)) row._errors.push('manual_score harus 0-100');
    return row;
  });
}

function downloadKpiTemplate() {
  const sample = [KPI_IMPORT_HEADERS.join(','), '1,Delivery,On Time Delivery,%,30,Daily Delivery Report,100,96,HIGHER_BETTER,', '2,Quality,Defect Rate,PPM,40,QA Report,100,85,LOWER_BETTER,', '3,Improvement,Kaizen Score,Score,30,Kaizen Review,,,MANUAL_SCORE,90'].join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', sample], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'my_kpi_import_template.csv'; anchor.click(); URL.revokeObjectURL(url);
}

function computed(point: KpiPoint) {
  const weight = Number(point.weight_percent || 0);
  let achievement = 0;
  if (point.calc_type === 'MANUAL_SCORE') achievement = Number(point.manual_score || 0);
  else if (point.target && point.actual !== null) {
    achievement = point.calc_type === 'HIGHER_BETTER'
      ? (Number(point.actual) / Number(point.target)) * 100
      : (Number(point.target) / Math.max(Number(point.actual), 0.000001)) * 100;
  }
  achievement = Math.max(0, Math.min(achievement, 100));
  return { achievement, score: achievement * weight / 100 };
}

export function MyKpiPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [form, setForm] = useState<KpiForm | null>(null);
  const [title, setTitle] = useState('Monthly Individual KPI');
  const [dueDate, setDueDate] = useState('');
  const [points, setPoints] = useState<KpiPoint[]>([blankPoint(1)]);
  const [history, setHistory] = useState<ApprovalHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState('');
  const [importRows, setImportRows] = useState<KpiImportPreview[]>([]);

  const editable = !form || ['DRAFT', 'REJECTED'].includes(form.status);
  const totals = useMemo(() => points.reduce((acc, p) => {
    const c = computed(p); acc.weight += Number(p.weight_percent || 0); acc.score += c.score; return acc;
  }, { weight: 0, score: 0 }), [points]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_kpi_v2', { p_period: period });
      if (error) throw error;
      setForm(data?.form || null);
      setTitle(data?.form?.form_title || 'Monthly Individual KPI');
      setDueDate(data?.form?.due_date || '');
      setPoints(data?.points?.length ? data.points : [blankPoint(1)]);
      setHistory(data?.history || []);
    } catch (error: any) { toast.error(error.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [period]);

  const updatePoint = (index: number, key: keyof KpiPoint, value: any) => {
    setPoints((current) => current.map((point, i) => i === index ? { ...point, [key]: value } : point));
  };
  const addPoint = () => setPoints((current) => [...current, blankPoint(current.length + 1)]);
  const removePoint = (index: number) => setPoints((current) => current.filter((_, i) => i !== index).map((p, i) => ({ ...p, point_no: i + 1 })));

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('save_kpi_draft_v2', { p_payload: { period_key: period, form_title: title, due_date: dueDate || null, points } });
      if (error) throw error;
      toast.success(`Draft tersimpan: ${data.form_no}`);
      await load();
    } catch (error: any) { toast.error(error.message); } finally { setSaving(false); }
  };

  const submit = async () => {
    if (!form?.id) { toast.error('Simpan draft terlebih dahulu.'); return; }
    if (Math.round(totals.weight * 100) / 100 !== 100) { toast.error(`Total bobot harus 100%. Saat ini ${formatNumber(totals.weight, 2)}%.`); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('submit_kpi_form', { p_form_id: form.id });
      if (error) throw error;
      toast.success(data?.message || 'KPI berhasil disubmit.');
      await load();
    } catch (error: any) { toast.error(error.message); } finally { setSaving(false); }
  };


  const loadImportFile = async (file?: File) => {
    if (!file) return;
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let rawRows: any[] = [];
      if (extension === 'xlsx' || extension === 'xls') {
        const XLSX = await loadXlsx();
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) throw new Error('Workbook tidak memiliki worksheet.');
        rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: null, raw: false });
      } else rawRows = rowsFromCsv(await file.text());
      if (!rawRows.length) throw new Error('File tidak memiliki data KPI.');
      const missing = ['kpi_objective','weight_percent','calc_type'].filter((key) => !(key in rawRows[0]));
      if (missing.length) throw new Error(`Kolom wajib tidak ditemukan: ${missing.join(', ')}`);
      setImportRows(validateKpiImport(rawRows)); setImportName(file.name); setImportOpen(true);
    } catch (error: any) { toast.error(error.message); }
    finally { if (importRef.current) importRef.current.value = ''; }
  };

  const applyImport = () => {
    const invalid = importRows.filter((row) => row._errors.length);
    if (invalid.length) { toast.error(`${invalid.length} baris masih memiliki error. Perbaiki file lalu upload ulang.`); return; }
    const clean = importRows.sort((a,b) => a.point_no - b.point_no).map(({ _row, _errors, ...point }, index) => ({ ...point, point_no: index + 1 }));
    const totalWeight = clean.reduce((sum, row) => sum + Number(row.weight_percent || 0), 0);
    if (Math.round(totalWeight * 100) / 100 !== 100) { toast.error(`Total bobot file harus 100%. Saat ini ${formatNumber(totalWeight, 2)}%.`); return; }
    setPoints(clean); setImportOpen(false);
    toast.success(`${clean.length} KPI points dimuat ke workspace. Data database belum berubah sampai Save Draft diklik.`);
  };

  const uploadEvidence = async (file?: File) => {
    if (!file || !form?.id) { toast.error('Simpan form sebelum upload evidence.'); return; }
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
      const path = `${form.period_key}/${form.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from('kpi-evidence').upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user.id;
      const { error: insertError } = await supabase.from('evidence_files').insert({ form_id: form.id, bucket_name: 'kpi-evidence', object_path: path, file_name: file.name, mime_type: file.type || 'application/octet-stream', file_size: file.size, metadata: { auth_user_id: userId } });
      if (insertError) throw insertError;
      toast.success('Evidence berhasil diupload.');
    } catch (error: any) { toast.error(error.message); }
  };

  if (loading) return <LoadingBlock label="Membuka worksheet KPI..."/>;

  return <div className="page-stack print-kpi-page">
    <PageHeader eyebrow="INDIVIDUAL PERFORMANCE WORKSHEET" title={`My KPI · ${monthLabel(period)}`} description="Isi target dan aktual, pastikan bobot tepat 100%, lalu submit ke approval matrix." actions={<><input ref={importRef} hidden type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(e) => loadImportFile(e.target.files?.[0])}/><Button variant="secondary" onClick={downloadKpiTemplate}><Download size={16}/> Import Template</Button><Button onClick={() => importRef.current?.click()} disabled={!editable}><UploadCloud size={16}/> Import / Upload KPI</Button><Button variant="ghost" onClick={() => window.print()}><Printer size={16}/> Print</Button></>}/>

    <div className="kpi-summary-strip">
      <div className="kpi-summary-primary"><span>Form No</span><strong>{form?.form_no || 'Belum dibuat'}</strong><small>{form?.form_no ? 'Nomor form aktif' : 'Nomor otomatis setelah draft disimpan'}</small></div>
      <div><span>Status</span><strong><Badge tone={form?.status === 'APPROVED' ? 'success' : form?.status === 'REJECTED' ? 'danger' : 'blue'}>{form?.status || 'DRAFT'}</Badge></strong></div>
      <div><span>Total Weight</span><strong className={Math.round(totals.weight) === 100 ? 'text-success' : 'text-danger'}>{formatNumber(totals.weight, 2)}%</strong></div>
      <div><span>Calculated Score</span><strong>{formatNumber(totals.score, 2)}</strong></div>
      <div><span>Current Stage</span><strong>{form?.current_stage || 'Belum dimulai'}</strong></div>
    </div>

    {form?.status === 'REJECTED' && <div className="alert danger"><strong>Rejected:</strong> {form.review_note || 'Perlu revisi sebelum submit ulang.'}</div>}

    <Card title="KPI Header" subtitle="Identity otomatis mengikuti profile dan department scope.">
      <div className="form-grid three">
        <Field label="Period"><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}/></Field>
        <Field label="Form Title"><Input value={title} disabled={!editable} onChange={(e) => setTitle(e.target.value)}/></Field>
        <Field label="Due Date"><Input type="date" value={dueDate} disabled={!editable} onChange={(e) => setDueDate(e.target.value)}/></Field>
      </div>
    </Card>

    <Card title="KPI Points" subtitle="Higher Better, Lower Better, atau Manual Score." action={editable && <Button variant="secondary" onClick={addPoint}><Plus size={16}/> Add Point</Button>}>
      <DataTable headers={['No','Subject','KPI Objective','UOM','Weight %','Source Data','Target','Actual','Calculation','Ach. %','Score','']}>
        {points.map((point, index) => { const calc = computed(point); return <tr key={index}>
          <td className="num-cell">{index + 1}</td>
          <td><Input value={point.subject || ''} disabled={!editable} onChange={(e) => updatePoint(index, 'subject', e.target.value)}/></td>
          <td className="wide-cell"><Input value={point.kpi_objective || ''} disabled={!editable} onChange={(e) => updatePoint(index, 'kpi_objective', e.target.value)}/></td>
          <td><Input value={point.uom || ''} disabled={!editable} onChange={(e) => updatePoint(index, 'uom', e.target.value)}/></td>
          <td><Input type="number" step="0.01" min="0" max="100" value={point.weight_percent} disabled={!editable} onChange={(e) => updatePoint(index, 'weight_percent', Number(e.target.value))}/></td>
          <td><Input value={point.source_data || ''} disabled={!editable} onChange={(e) => updatePoint(index, 'source_data', e.target.value)}/></td>
          <td><Input type="number" step="0.01" value={point.target ?? ''} disabled={!editable || point.calc_type === 'MANUAL_SCORE'} onChange={(e) => updatePoint(index, 'target', e.target.value === '' ? null : Number(e.target.value))}/></td>
          <td><Input type="number" step="0.01" value={point.actual ?? ''} disabled={!editable || point.calc_type === 'MANUAL_SCORE'} onChange={(e) => updatePoint(index, 'actual', e.target.value === '' ? null : Number(e.target.value))}/></td>
          <td><Select value={point.calc_type} disabled={!editable} onChange={(e) => updatePoint(index, 'calc_type', e.target.value)}><option value="HIGHER_BETTER">Higher Better</option><option value="LOWER_BETTER">Lower Better</option><option value="MANUAL_SCORE">Manual Score</option></Select>{point.calc_type === 'MANUAL_SCORE' && <Input type="number" min="0" max="100" placeholder="Score" value={point.manual_score ?? ''} disabled={!editable} onChange={(e) => updatePoint(index, 'manual_score', e.target.value === '' ? null : Number(e.target.value))}/>}</td>
          <td className="score-cell">{formatNumber(calc.achievement, 2)}%</td>
          <td className="score-cell strong">{formatNumber(calc.score, 2)}</td>
          <td>{editable && points.length > 1 && <button className="icon-btn danger" onClick={() => removePoint(index)}><Trash2 size={16}/></button>}</td>
        </tr>})}
      </DataTable>
      <div className="table-total"><span>Total Weight <b>{formatNumber(totals.weight, 2)}%</b></span><span>Weighted Score <b>{formatNumber(totals.score, 2)}</b></span></div>
    </Card>

    <div className="action-dock no-print">
      <div className="action-dock-copy"><strong>{editable ? 'Mode Draft' : 'Mode Workflow Terkunci'}</strong><span>{editable ? 'Simpan perubahan terlebih dahulu. Submit hanya setelah seluruh KPI lengkap dan total bobot 100%.' : `Status saat ini: ${form?.status}`}</span></div>
      <div>
        <input ref={fileRef} hidden type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.xlsx,.docx" onChange={(e) => uploadEvidence(e.target.files?.[0])}/>
        <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={!form?.id}><FileUp size={17}/> Evidence</Button>
        {editable && <Button variant="secondary" loading={saving} onClick={save}><Save size={17}/> Save Draft</Button>}
        {editable && <Button loading={saving} onClick={submit}><Send size={17}/> Submit KPI</Button>}
      </div>
    </div>



    <Modal open={importOpen} title={`Import KPI Preview${importName ? ` · ${importName}` : ''}`} onClose={() => setImportOpen(false)} wide footer={<><Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button><Button onClick={applyImport} disabled={!importRows.length || importRows.some((row) => row._errors.length)}><CheckCircle2 size={16}/> Apply to Workspace</Button></>}>
      <div className="kpi-import-summary">
        <div><span>Rows</span><strong>{importRows.length}</strong></div>
        <div><span>Valid</span><strong>{importRows.filter((r) => !r._errors.length).length}</strong></div>
        <div className={importRows.some((r) => r._errors.length) ? 'has-error' : ''}><span>Errors</span><strong>{importRows.filter((r) => r._errors.length).length}</strong></div>
        <div><span>Total Weight</span><strong>{formatNumber(importRows.reduce((sum,r) => sum + Number(r.weight_percent || 0), 0), 2)}%</strong></div>
      </div>
      {importRows.some((r) => r._errors.length) && <div className="alert danger"><AlertTriangle size={17}/><strong>Validation failed.</strong> Database tidak akan disentuh. Perbaiki baris yang ditandai lalu upload ulang.</div>}
      {importRows.length ? <DataTable headers={['Row','No','Subject','KPI Objective','UOM','Weight','Target','Actual','Calculation','Validation']}>
        {importRows.slice(0,100).map((row) => <tr key={row._row} className={row._errors.length ? 'import-row-error' : ''}><td>{row._row}</td><td>{row.point_no}</td><td>{row.subject || '-'}</td><td>{row.kpi_objective}</td><td>{row.uom || '-'}</td><td>{formatNumber(row.weight_percent,2)}%</td><td>{row.target ?? '-'}</td><td>{row.actual ?? '-'}</td><td>{row.calc_type}</td><td>{row._errors.length ? <span className="validation-error">{row._errors.join('; ')}</span> : <span className="validation-ok"><CheckCircle2 size={14}/> Valid</span>}</td></tr>)}
      </DataTable> : <EmptyState title="No import data" description="Upload CSV atau Excel sesuai template KPI."/>}
      <p className="import-safety-note">Import ini hanya memuat data ke draft workspace. Existing KPI tidak ditulis ke database sampai Anda menekan <b>Save Draft</b>, sehingga preview dan validasi selalu terjadi sebelum perubahan data.</p>
    </Modal>

    <Card title="Approval History" subtitle="Immutable event trail for this KPI form.">
      {history.length ? <div className="timeline">{history.map((item) => <div key={item.id}><i/><div><strong>{item.stage_name} · {item.action}</strong><p>{item.note || 'No note'}</p><span>{item.actor_name || 'System'} · {formatDateTime(item.created_at)}</span></div></div>)}</div> : <EmptyState title="Belum ada approval history" description="History akan muncul setelah KPI disubmit."/>}
    </Card>
  </div>;
}
