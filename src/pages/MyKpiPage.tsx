import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Plus, Printer, Save, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import type { ApprovalHistory, KpiForm, KpiPoint } from '../lib/types';
import { currentPeriod, formatDateTime, formatNumber, monthLabel } from '../lib/utils';
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, LoadingBlock, PageHeader, Select } from '../components/UI';

const blankPoint = (no: number): KpiPoint => ({
  point_no: no, subject: '', kpi_objective: '', uom: '', weight_percent: 0, source_data: '',
  target: null, actual: null, calc_type: 'HIGHER_BETTER', manual_score: null
});

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
    <PageHeader eyebrow="INDIVIDUAL PERFORMANCE WORKSHEET" title={`My KPI · ${monthLabel(period)}`} description="Isi target dan aktual, pastikan bobot tepat 100%, lalu submit ke approval matrix." actions={<Button variant="ghost" onClick={() => window.print()}><Printer size={16}/> Print</Button>}/>

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

    <Card title="Approval History" subtitle="Immutable event trail for this KPI form.">
      {history.length ? <div className="timeline">{history.map((item) => <div key={item.id}><i/><div><strong>{item.stage_name} · {item.action}</strong><p>{item.note || 'No note'}</p><span>{item.actor_name || 'System'} · {formatDateTime(item.created_at)}</span></div></div>)}</div> : <EmptyState title="Belum ada approval history" description="History akan muncul setelah KPI disubmit."/>}
    </Card>
  </div>;
}
