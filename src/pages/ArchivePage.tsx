import { useEffect, useState } from 'react';
import { Download, Eye, FileDown, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { Department, KpiForm } from '../lib/types';
import { formatDateTime, formatNumber } from '../lib/utils';
import { printOfficialKpi, type OfficialPrintDetail } from '../lib/officialPrint';
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select } from '../components/UI';

type PdfRecord = { id: string; bucket_name: string; object_path: string; file_name: string; status: string; generated_at: string; signature_hash: string };
type Detail = OfficialPrintDetail & { pdf?: PdfRecord[] };

export function ArchivePage() {
  const [filters, setFilters] = useState({ period: '', status: '', department: '', search: '' });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [items, setItems] = useState<KpiForm[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const limit = 50;

  const load = async (nextOffset = offset) => {
    setLoading(true);
    try {
      const [{ data, error }, { data: dept }] = await Promise.all([
        supabase.rpc('archive_search_v2', { p_period: filters.period || null, p_status: filters.status || null, p_department: filters.department || null, p_search: filters.search || null, p_limit: limit, p_offset: nextOffset }),
        supabase.from('departments').select('*').eq('active',true).order('department_name')
      ]);
      if (error) throw error;
      setItems(data?.items || []); setTotal(Number(data?.total || 0)); setOffset(nextOffset); setDepartments((dept || []) as Department[]);
    } catch (error: any) { toast.error(error.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(0); }, []);
  const open = async (id: string) => {
    const { data, error } = await supabase.rpc('get_form_detail_v2', { p_form_id: id });
    if (error || !data?.form) { toast.error(error?.message || 'Detail KPI tidak tersedia.'); return; }
    const { data: profile } = await supabase
      .from('users')
      .select('academic,join_date')
      .eq('id', data.form.user_id)
      .maybeSingle();
    setDetail({ ...(data as Detail), profile: profile || null });
  };
  const exportCsv = () => {
    const rows = [['Form No','Period','Employee','Department','Status','Stage','Final Score','Updated'],...items.map((x)=>[x.form_no,x.period_key,x.full_name,x.department_name,x.status,x.current_stage,x.final_score,x.updated_at])];
    const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'); const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='KPI_Archive.csv';a.click();URL.revokeObjectURL(a.href);
  };
  const openUrl = (url: string, fileName = 'KPI.pdf', popup?: Window | null) => {
    if (popup) { popup.location.replace(url); return; }
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.download = fileName; a.click();
  };
  const browserPrint = async () => {
    if (!detail?.form.id) return;
    try {
      await printOfficialKpi(detail.form.id);
      toast.success('Dialog print dibuka menggunakan layout KPI resmi dengan QR approval.');
    } catch (error: any) {
      toast.error(error?.message || 'Browser Print gagal dibuka.');
    }
  };
  const generatePdf = async () => {
    if (!detail?.form.id) return;
    setGeneratingPdf(true);
    try {
      const result = await api<{ downloadUrl: string; fileName: string }>(`/api/forms/${detail.form.id}/pdf`, { method: 'POST' });
      if (!result.downloadUrl) throw new Error('Signed PDF URL tidak tersedia.');
      openUrl(result.downloadUrl, result.fileName);
      toast.success('PDF resmi satu halaman dibuat dan disimpan ke arsip.');
      await open(detail.form.id);
    } catch (error: any) {
      toast.error(error.message);
    } finally { setGeneratingPdf(false); }
  };
  const openArchivedPdf = async (item: PdfRecord) => {
    const { data, error } = await supabase.storage.from(item.bucket_name).createSignedUrl(item.object_path, 3600);
    if (error || !data?.signedUrl) { toast.error(error?.message || 'PDF tidak dapat dibuka.'); return; }
    openUrl(data.signedUrl, item.file_name);
  };
  return <div className="page-stack">
    <PageHeader eyebrow="HISTORICAL RECORD & DATA EXPLORER" title="Archive & Explorer" description="Search, filter, review, and export KPI forms across your authorized data scope." actions={<Button variant="ghost" onClick={exportCsv}><Download size={16}/> Export Visible</Button>}/>
    <Card title="Advanced Filters">
      <div className="form-grid five"><Field label="Period"><Input type="month" value={filters.period} onChange={(e)=>setFilters({...filters,period:e.target.value})}/></Field><Field label="Status"><Select value={filters.status} onChange={(e)=>setFilters({...filters,status:e.target.value})}><option value="">All Status</option>{['DRAFT','SUBMITTED','CHECKED','VERIFIED','APPROVED','REJECTED','ARCHIVED'].map(x=><option key={x}>{x}</option>)}</Select></Field><Field label="Department"><Select value={filters.department} onChange={(e)=>setFilters({...filters,department:e.target.value})}><option value="">All Departments</option>{departments.map(d=><option key={d.id} value={d.id}>{d.department_name}</option>)}</Select></Field><Field label="Search"><Input value={filters.search} onChange={(e)=>setFilters({...filters,search:e.target.value})} placeholder="Form, employee, name..."/></Field><Field label="Action"><Button onClick={()=>load(0)} loading={loading}><Search size={16}/> Apply Filter</Button></Field></div>
    </Card>
    <Card title={`${total} records found`} subtitle={`Showing ${offset+1}-${Math.min(offset+items.length,total)}`}>
      {loading ? <LoadingBlock/> : items.length ? <><DataTable headers={['Form No','Period','Employee','Department','Status','Stage','Score','Updated','']}>
        {items.map(x=><tr key={x.id}><td><b>{x.form_no}</b></td><td>{x.period_key}</td><td>{x.full_name}<small className="table-sub">{x.employee_code}</small></td><td>{x.department_name}<small className="table-sub">{x.section||'-'}</small></td><td><Badge>{x.status}</Badge></td><td>{x.current_stage||'-'}</td><td className="score-cell strong">{formatNumber(x.final_score,2)}</td><td>{formatDateTime(x.updated_at)}</td><td><Button variant="ghost" onClick={()=>open(x.id)}><Eye size={16}/></Button></td></tr>)}
      </DataTable><div className="pagination"><Button variant="ghost" disabled={offset===0} onClick={()=>load(Math.max(0,offset-limit))}>Previous</Button><span>Page {Math.floor(offset/limit)+1} / {Math.max(1,Math.ceil(total/limit))}</span><Button variant="ghost" disabled={offset+limit>=total} onClick={()=>load(offset+limit)}>Next</Button></div></> : <EmptyState title="Data tidak ditemukan" description="Ubah filter pencarian untuk menemukan arsip KPI."/>}
    </Card>
    <Modal open={Boolean(detail)} title={detail?.form.form_no||''} onClose={()=>setDetail(null)} wide footer={<><Button variant="ghost" onClick={browserPrint}>Browser Print</Button><Button onClick={generatePdf} loading={generatingPdf} disabled={detail?.form.status !== 'APPROVED'} title={detail?.form.status !== 'APPROVED' ? 'Official PDF tersedia setelah status APPROVED.' : undefined}><FileDown size={16}/> Generate Official PDF</Button></>}>
      {detail&&<div className="detail-stack"><div className="detail-meta-grid"><div><span>Employee</span><strong>{detail.form.full_name}</strong></div><div><span>Period</span><strong>{detail.form.period_key}</strong></div><div><span>Status</span><Badge>{detail.form.status}</Badge></div><div><span>Score</span><strong>{formatNumber(detail.form.final_score,2)}</strong></div></div><DataTable headers={['No','Objective','Weight','Target','Actual','Achievement','Score']}>{detail.points.map(p=><tr key={p.id||p.point_no}><td>{p.point_no}</td><td>{p.kpi_objective}</td><td>{p.weight_percent}%</td><td>{p.target??'-'}</td><td>{p.actual??'-'}</td><td>{formatNumber(p.achievement_percent,2)}%</td><td>{formatNumber(p.score_percent,2)}</td></tr>)}</DataTable><div className="timeline compact">{detail.history.map(h=><div key={h.id}><i/><div><strong>{h.stage_name} · {h.action}</strong><p>{h.note||'-'}</p><span>{h.actor_name||'System'} · {formatDateTime(h.created_at)}</span></div></div>)}</div>{Boolean(detail.pdf?.length)&&<div className="pdf-archive-list"><strong>Generated PDF Archive</strong>{detail.pdf!.map(item=><button key={item.id} className="pdf-archive-item" onClick={()=>openArchivedPdf(item)}><FileDown size={15}/><span>{item.file_name}</span><small>{formatDateTime(item.generated_at)} · {item.signature_hash?.slice(0,12)}</small></button>)}</div>}</div>}
    </Modal>
  </div>;
}
