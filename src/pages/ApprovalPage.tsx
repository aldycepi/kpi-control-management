import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import type { ApprovalHistory, KpiForm, KpiPoint } from '../lib/types';
import { currentPeriod, formatDateTime, formatNumber, monthLabel } from '../lib/utils';
import { Badge, Button, Card, DataTable, EmptyState, Field, LoadingBlock, Modal, PageHeader, Textarea } from '../components/UI';

type Detail = { form: KpiForm; points: KpiPoint[]; history: ApprovalHistory[] };

export function ApprovalPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [items, setItems] = useState<KpiForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_approval_queue', { p_period: period });
      if (error) throw error;
      setItems((data || []) as KpiForm[]);
    } catch (error: any) { toast.error(error.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [period]);

  const open = async (id: string) => {
    try {
      const { data, error } = await supabase.rpc('get_form_detail_v2', { p_form_id: id });
      if (error) throw error;
      setDetail(data as Detail); setNote('');
    } catch (error: any) { toast.error(error.message); }
  };

  const review = async (action: 'APPROVE'|'REJECT') => {
    if (!detail) return;
    if (action === 'REJECT' && !note.trim()) { toast.error('Alasan reject wajib diisi.'); return; }
    setReviewing(true);
    try {
      const { data, error } = await supabase.rpc('review_kpi_form', { p_form_id: detail.form.id, p_action: action, p_note: note.trim() });
      if (error) throw error;
      toast.success(data?.message || 'Approval berhasil diproses.');
      setDetail(null); await load();
    } catch (error: any) { toast.error(error.message); } finally { setReviewing(false); }
  };

  return <div className="page-stack">
    <PageHeader eyebrow="APPROVAL OPERATING QUEUE" title={`Approval Queue · ${monthLabel(period)}`} description="Antrean hanya menampilkan form yang memang berada pada stage dan scope approval Anda." actions={<><input className="input compact" type="month" value={period} onChange={(e) => setPeriod(e.target.value)}/><Button variant="secondary" onClick={load} loading={loading}><RefreshCw size={16}/> Refresh</Button></>}/>
    <div className="queue-banner"><div><span>{items.length}</span><div><strong>Forms Awaiting Action</strong><p>Oldest submissions are prioritized first.</p></div></div><i/></div>
    <Card>
      {loading ? <LoadingBlock/> : items.length ? <DataTable headers={['Form No','Employee','Department','Period','Stage','Status','Score','Submitted','Action']}>
        {items.map((item) => <tr key={item.id}><td><b>{item.form_no}</b></td><td><strong>{item.full_name}</strong><small className="table-sub">{item.employee_code}</small></td><td>{item.department_name}<small className="table-sub">{item.section || '-'}</small></td><td>{item.period_key}</td><td><Badge tone="warning">{item.current_stage || '-'}</Badge></td><td><Badge>{item.status}</Badge></td><td className="score-cell strong">{formatNumber(item.final_score, 2)}</td><td>{formatDateTime(item.submitted_at)}</td><td><Button variant="ghost" onClick={() => open(item.id)}><Eye size={16}/> Review</Button></td></tr>)}
      </DataTable> : <EmptyState title="Approval queue kosong" description="Tidak ada KPI yang membutuhkan tindakan Anda pada periode ini."/>}
    </Card>

    <Modal open={Boolean(detail)} title={detail ? `${detail.form.form_no} · ${detail.form.full_name}` : ''} onClose={() => setDetail(null)} wide footer={<><Button variant="ghost" onClick={() => setDetail(null)}>Close</Button><Button variant="danger" loading={reviewing} onClick={() => review('REJECT')}><XCircle size={17}/> Reject</Button><Button variant="success" loading={reviewing} onClick={() => review('APPROVE')}><CheckCircle2 size={17}/> Approve Stage</Button></>}>
      {detail && <div className="detail-stack">
        <div className="detail-meta-grid"><div><span>Status</span><Badge>{detail.form.status}</Badge></div><div><span>Current Stage</span><strong>{detail.form.current_stage}</strong></div><div><span>Department</span><strong>{detail.form.department_name}</strong></div><div><span>Final Score</span><strong>{formatNumber(detail.form.final_score,2)}</strong></div></div>
        <DataTable headers={['No','Subject','KPI Objective','Weight','Target','Actual','Achievement','Score']}>
          {detail.points.map((p) => <tr key={p.id || p.point_no}><td>{p.point_no}</td><td>{p.subject}</td><td>{p.kpi_objective}</td><td>{formatNumber(p.weight_percent,2)}%</td><td>{p.target ?? '-'}</td><td>{p.actual ?? '-'}</td><td>{formatNumber(p.achievement_percent,2)}%</td><td className="score-cell strong">{formatNumber(p.score_percent,2)}</td></tr>)}
        </DataTable>
        <div className="timeline compact">{detail.history.map((h) => <div key={h.id}><i/><div><strong>{h.stage_name} · {h.action}</strong><p>{h.note || '-'}</p><span>{h.actor_name || 'System'} · {formatDateTime(h.created_at)}</span></div></div>)}</div>
        <Field label="Review Note"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan approval atau alasan reject..."/></Field>
      </div>}
    </Modal>
  </div>;
}
