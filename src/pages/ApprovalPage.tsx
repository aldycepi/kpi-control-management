import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Eye, RefreshCw, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import type { ApprovalHistory, KpiForm, KpiPoint } from '../lib/types';
import { currentPeriod, formatDateTime, formatNumber, monthLabel } from '../lib/utils';
import { Badge, Button, Card, DataTable, EmptyState, Field, LoadingBlock, Modal, PageHeader, Textarea } from '../components/UI';

type Detail = { form: KpiForm; points: KpiPoint[]; history: ApprovalHistory[] };
type BulkFailure = { id: string; formNo: string; message: string };

export function ApprovalPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [items, setItems] = useState<KpiForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkFailures, setBulkFailures] = useState<BulkFailure[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const directOpened = useRef<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_approval_queue', { p_period: period });
      if (error) throw error;
      const nextItems = (data || []) as KpiForm[];
      setItems(nextItems);
      setSelectedIds((previous) => {
        const allowed = new Set(nextItems.map((item) => item.id));
        return new Set([...previous].filter((id) => allowed.has(id)));
      });
    } catch (error: any) { toast.error(error.message); } finally { setLoading(false); }
  };

  useEffect(() => {
    setSelectedIds(new Set<string>());
    setBulkFailures([]);
    load();
  }, [period]);

  const open = async (id: string, notificationId?: string | null) => {
    try {
      const { data, error } = await supabase.rpc('get_form_detail_v2', { p_form_id: id });
      if (error) throw error;
      setDetail(data as Detail);
      setNote('');
      if (notificationId) {
        const { error: notificationError } = await supabase.from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', notificationId)
          .eq('form_id', id);
        if (notificationError) toast.error(`Dokumen terbuka, tetapi status notifikasi gagal diperbarui: ${notificationError.message}`);
        else setSearchParams({ form: id }, { replace: true });
      }
    } catch (error: any) { toast.error(error.message); }
  };

  useEffect(() => {
    const formId = searchParams.get('form');
    const notificationId = searchParams.get('notification');
    if (!formId || directOpened.current === formId) return;
    directOpened.current = formId;
    open(formId, notificationId);
  }, [searchParams]);

  const closeDetail = () => {
    setDetail(null);
    if (searchParams.get('form')) {
      directOpened.current = null;
      setSearchParams({}, { replace: true });
    }
  };

  const getUnreadApprovalNotificationIds = async (formId: string): Promise<string[]> => {
    const { data, error } = await supabase.from('notifications')
      .select('id')
      .eq('form_id', formId)
      .eq('type', 'APPROVAL_PENDING')
      .is('read_at', null);
    if (error) {
      console.warn('Approval notification snapshot could not be read.', error);
      return [];
    }
    return (data || []).map((row) => String(row.id));
  };

  const markApprovalNotificationsRead = async (notificationIds: string[]) => {
    if (!notificationIds.length) return;
    const { error } = await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', notificationIds);
    if (error) console.warn('Approval completed but notification read-state could not be synchronized.', error);
  };

  const review = async (action: 'APPROVE'|'REJECT') => {
    if (!detail) return;
    if (action === 'REJECT' && !note.trim()) { toast.error('Alasan reject wajib diisi.'); return; }
    setReviewing(true);
    try {
      const notificationIds = await getUnreadApprovalNotificationIds(detail.form.id);
      const { data, error } = await supabase.rpc('review_kpi_form', { p_form_id: detail.form.id, p_action: action, p_note: note.trim() });
      if (error) throw error;
      await markApprovalNotificationsRead(notificationIds);
      toast.success(data?.message || 'Approval berhasil diproses.');
      closeDetail(); await load();
    } catch (error: any) { toast.error(error.message); } finally { setReviewing(false); }
  };

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const stageSummary = useMemo(() => {
    const summary = new Map<string, number>();
    selectedItems.forEach((item) => {
      const stage = item.current_stage || 'Unknown Stage';
      summary.set(stage, (summary.get(stage) || 0) + 1);
    });
    return [...summary.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [selectedItems]);

  const toggleSelected = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBulkFailures([]);
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set<string>() : new Set(items.map((item) => item.id)));
    setBulkFailures([]);
  };

  const openBulkConfirm = () => {
    if (!selectedItems.length) {
      toast.error('Pilih minimal satu KPI untuk bulk approval.');
      return;
    }
    setBulkFailures([]);
    setBulkProgress({ current: 0, total: selectedItems.length });
    setBulkConfirmOpen(true);
  };

  const bulkApprove = async () => {
    if (!selectedItems.length || bulkApproving) return;

    const queueSnapshot = [...selectedItems];
    const failures: BulkFailure[] = [];
    let successCount = 0;
    setBulkApproving(true);
    setBulkFailures([]);
    setBulkProgress({ current: 0, total: queueSnapshot.length });

    for (let index = 0; index < queueSnapshot.length; index += 1) {
      const item = queueSnapshot[index];
      setBulkProgress({ current: index + 1, total: queueSnapshot.length });
      try {
        const notificationIds = await getUnreadApprovalNotificationIds(item.id);
        const { error } = await supabase.rpc('review_kpi_form', {
          p_form_id: item.id,
          p_action: 'APPROVE',
          p_note: ''
        });
        if (error) throw error;
        await markApprovalNotificationsRead(notificationIds);
        successCount += 1;
      } catch (error: any) {
        failures.push({
          id: item.id,
          formNo: item.form_no,
          message: error?.message || 'Approval gagal diproses.'
        });
      }
    }

    setBulkApproving(false);
    setBulkFailures(failures);
    await load();
    setSelectedIds(new Set(failures.map((failure) => failure.id)));

    if (successCount > 0) {
      toast.success(`${successCount} KPI berhasil di-approve.`);
    }

    if (failures.length > 0) {
      const preview = failures.slice(0, 3).map((failure) => failure.formNo).join(', ');
      const suffix = failures.length > 3 ? ` +${failures.length - 3} lainnya` : '';
      toast.error(`${failures.length} KPI gagal diproses: ${preview}${suffix}.`);
    } else {
      setBulkConfirmOpen(false);
    }
  };

  return <div className="page-stack">
    <PageHeader eyebrow="APPROVAL OPERATING QUEUE" title={`Approval Queue · ${monthLabel(period)}`} description="Antrean hanya menampilkan form yang memang berada pada stage dan scope approval Anda." actions={<><input className="input compact" type="month" value={period} onChange={(e) => setPeriod(e.target.value)}/><Button variant="secondary" onClick={load} loading={loading}><RefreshCw size={16}/> Refresh</Button></>}/>
    <div className="queue-banner"><div><span>{items.length}</span><div><strong>Forms Awaiting Action</strong><p>Oldest submissions are prioritized first.</p></div></div><i/></div>
    <Card>
      {loading ? <LoadingBlock/> : items.length ? <>
        <div className="approval-bulk-toolbar">
          <div className="approval-bulk-summary">
            <strong>{selectedIds.size} KPI Selected</strong>
            <span>Bulk approval hanya memproses KPI yang memang berada di approval queue Anda. Reject tetap dilakukan per dokumen.</span>
          </div>
          <div className="approval-bulk-actions">
            <Button variant="ghost" onClick={() => setSelectedIds(new Set<string>())} disabled={!selectedIds.size || bulkApproving}>Clear Selection</Button>
            <Button variant="success" onClick={openBulkConfirm} disabled={!selectedIds.size || bulkApproving}><CheckCircle2 size={17}/> Approve Selected ({selectedIds.size})</Button>
          </div>
        </div>
        <DataTable headers={[
          <label className="approval-select-all" title="Select all visible KPI" key="select-all">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(element) => { if (element) element.indeterminate = someSelected; }}
              onChange={toggleSelectAll}
              aria-label="Select all visible KPI"
            />
            <span>Select</span>
          </label>,
          'Form No','Employee','Department','Period','Stage','Status','Score','Submitted','Action'
        ]}>
          {items.map((item) => <tr key={item.id} className={selectedIds.has(item.id) ? 'approval-row-selected' : undefined}>
            <td className="approval-select-cell"><input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelected(item.id)} aria-label={`Select ${item.form_no}`}/></td>
            <td><b>{item.form_no}</b></td>
            <td><strong>{item.full_name}</strong><small className="table-sub">{item.employee_code}</small></td>
            <td>{item.department_name}<small className="table-sub">{item.section || '-'}</small></td>
            <td>{item.period_key}</td>
            <td><Badge tone="warning">{item.current_stage || '-'}</Badge></td>
            <td><Badge>{item.status}</Badge></td>
            <td className="score-cell strong">{formatNumber(item.final_score, 2)}</td>
            <td>{formatDateTime(item.submitted_at)}</td>
            <td><Button variant="ghost" onClick={() => open(item.id)}><Eye size={16}/> Review</Button></td>
          </tr>)}
        </DataTable>
      </> : <EmptyState title="Approval queue kosong" description="Tidak ada KPI yang membutuhkan tindakan Anda pada periode ini."/>}
    </Card>

    <Modal open={bulkConfirmOpen} title="Confirm Multiple Approval" onClose={() => { if (!bulkApproving) setBulkConfirmOpen(false); }} footer={<>
      <Button variant="ghost" onClick={() => setBulkConfirmOpen(false)} disabled={bulkApproving}>Cancel</Button>
      <Button variant="success" loading={bulkApproving} onClick={bulkApprove} disabled={bulkApproving || !selectedItems.length}>
        <CheckCircle2 size={17}/>{bulkApproving ? ` Processing ${bulkProgress.current}/${bulkProgress.total}` : ` Approve ${selectedItems.length} KPI`}
      </Button>
    </>}>
      <div className="bulk-approval-confirm">
        <div className="bulk-approval-callout">
          <CheckCircle2 size={22}/>
          <div><strong>{selectedItems.length} KPI akan diproses untuk approval.</strong><span>Setiap dokumen tetap divalidasi oleh authorization existing dan dicatat pada approval history serta audit trail masing-masing KPI.</span></div>
        </div>
        <div className="bulk-stage-summary">
          {stageSummary.map(([stage, count]) => <div key={stage}><span>{stage}</span><strong>{count}</strong></div>)}
        </div>
        <div className="bulk-selected-preview">
          {selectedItems.slice(0, 8).map((item) => <div key={item.id}><div><strong>{item.form_no}</strong><span>{item.full_name} · {item.department_name || '-'}</span></div><Badge tone="warning">{item.current_stage || '-'}</Badge></div>)}
          {selectedItems.length > 8 && <p>+ {selectedItems.length - 8} KPI lainnya</p>}
        </div>
        {bulkFailures.length > 0 && <div className="bulk-failure-list">
          <strong>{bulkFailures.length} KPI gagal dan tetap dipilih untuk retry.</strong>
          {bulkFailures.map((failure) => <div key={failure.id}><b>{failure.formNo}</b><span>{failure.message}</span></div>)}
        </div>}
      </div>
    </Modal>

    <Modal open={Boolean(detail)} title={detail ? `${detail.form.form_no} · ${detail.form.full_name}` : ''} onClose={closeDetail} wide footer={<><Button variant="ghost" onClick={closeDetail}>Close</Button><Button variant="danger" loading={reviewing} onClick={() => review('REJECT')}><XCircle size={17}/> Reject</Button><Button variant="success" loading={reviewing} onClick={() => review('APPROVE')}><CheckCircle2 size={17}/> Approve Stage</Button></>}>
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
