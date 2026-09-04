import { useEffect, useState } from 'react';
import { AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { currentPeriod, monthLabel, roleLabel } from '../lib/utils';
import { Button, Card, DataTable, EmptyState, LoadingBlock, PageHeader, SearchInput } from '../components/UI';

type Row = { user_id: string; employee_code: string; full_name: string; department_name: string; section: string; position_name: string; role_code: string };

export function MonitoringPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [items, setItems] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try { const { data, error } = await supabase.rpc('monitoring_not_submitted', { p_period: period }); if (error) throw error; setItems(data || []); }
    catch (error: any) { toast.error(error.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [period]);
  const filtered = items.filter((x) => [x.employee_code,x.full_name,x.department_name,x.section].join(' ').toLowerCase().includes(search.toLowerCase()));
  const exportCsv = () => {
    const headers = ['Employee Code','Full Name','Department','Section','Position','Role'];
    const lines = [headers, ...filtered.map((x) => [x.employee_code,x.full_name,x.department_name,x.section,x.position_name,x.role_code])].map((r) => r.map((v) => `"${String(v || '').replaceAll('"','""')}"`).join(',')).join('\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines],{type:'text/csv'})); a.download=`KPI_Not_Submitted_${period}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  return <div className="page-stack">
    <PageHeader eyebrow="EXECUTION GAP MONITORING" title={`Not Submitted · ${monthLabel(period)}`} description="Daftar manpower aktif yang belum mengirim KPI pada periode berjalan." actions={<><input className="input compact" type="month" value={period} onChange={(e) => setPeriod(e.target.value)}/><Button variant="ghost" onClick={exportCsv}><Download size={16}/> CSV</Button><Button variant="secondary" onClick={load} loading={loading}><RefreshCw size={16}/> Refresh</Button></>}/>
    <div className="alert warning"><AlertTriangle/><div><strong>{items.length} manpower belum submit KPI</strong><span>Follow-up berdasarkan department, section, dan line management.</span></div></div>
    <Card action={<SearchInput value={search} onChange={setSearch} placeholder="Employee, name, department..."/>}>
      {loading ? <LoadingBlock/> : filtered.length ? <DataTable headers={['No','Employee Code','Full Name','Department','Section','Position','Role']}>
        {filtered.map((x,i) => <tr key={x.user_id}><td>{i+1}</td><td><b>{x.employee_code}</b></td><td>{x.full_name}</td><td>{x.department_name}</td><td>{x.section || '-'}</td><td>{x.position_name || '-'}</td><td>{roleLabel(x.role_code)}</td></tr>)}
      </DataTable> : <EmptyState title="Tidak ada gap submission" description="Semua user dalam scope ini sudah submit KPI."/>}
    </Card>
  </div>;
}
