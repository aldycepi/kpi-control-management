import { useEffect, useMemo, useState } from 'react';
import {
  Activity, BadgeCheck, Clock3, Factory, Gauge, RefreshCw, Search,
  ShieldCheck, Target, UsersRound
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import type { DashboardSummary, Department, KpiForm } from '../lib/types';
import { currentPeriod, formatNumber, monthLabel } from '../lib/utils';
import { Badge, Button, Card, DataTable, LoadingBlock, MetricCard, PageHeader, Select } from '../components/UI';

const chartColors = ['#FFB718','#168C7A','#D97706','#DC2626','#64748B','#0B243D'];

type SearchRow = Pick<KpiForm,'id'|'form_no'|'period_key'|'full_name'|'employee_code'|'department_name'|'section'|'form_title'|'status'|'current_stage'|'final_score'> & {
  matched_kpi?: string | null;
};

export function DashboardPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [department, setDepartment] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchRows, setSearchRows] = useState<SearchRow[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: result, error }, { data: deptData, error: deptError }] = await Promise.all([
        supabase.rpc('dashboard_summary_v2', { p_period: period, p_department: department || null }),
        supabase.from('departments').select('*').eq('active', true).order('sort_order')
      ]);
      if (error) throw error;
      if (deptError) throw deptError;
      setData(result as DashboardSummary);
      setDepartments((deptData || []) as Department[]);
    } catch (error: any) {
      toast.error(error.message || 'Dashboard gagal dimuat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [period, department]);

  const runGlobalSearch = async () => {
    const keyword = search.trim();
    if (!keyword) { setSearchRows([]); return; }
    setSearching(true);
    try {
      // Preferred RPC searches form identity + KPI objective/subject under existing RLS.
      const { data: rpcData, error: rpcError } = await supabase.rpc('global_kpi_search_v1', {
        p_query: keyword,
        p_period: period || null,
        p_department: department || null,
        p_limit: 100
      });
      if (!rpcError) {
        setSearchRows((rpcData || []) as SearchRow[]);
        return;
      }

      // Compatibility fallback for databases that have not installed the optional search RPC yet.
      const { data: archive, error } = await supabase.rpc('archive_search_v2', {
        p_period: period || null,
        p_status: null,
        p_department: department || null,
        p_search: keyword,
        p_limit: 100,
        p_offset: 0
      });
      if (error) throw error;
      setSearchRows((archive?.items || []) as SearchRow[]);
    } catch (error: any) {
      toast.error(error.message || 'Global search gagal dijalankan.');
    } finally { setSearching(false); }
  };

  const statusData = useMemo(() => data?.statusDistribution || [], [data]);
  if (loading && !data) return <LoadingBlock label="Menyusun executive dashboard..."/>;

  return <div className="page-stack dashboard-page dms-dashboard">
    <section className="dms-executive-head">
      <div>
        <span className="eyebrow"><Factory size={14}/> KPI MANAGEMENT CONTROL</span>
        <h1>Executive Dashboard</h1>
        <p>Performance overview PT Banshu Electric Indonesia · {monthLabel(period)}</p>
      </div>
      <div className="dms-head-controls">
        <label><span>Period</span><input className="input compact" type="month" value={period} onChange={(e) => setPeriod(e.target.value)}/></label>
        <label><span>Department</span><Select value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">All Departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.department_name}</option>)}</Select></label>
        <Button variant="secondary" onClick={load} loading={loading}><RefreshCw size={16}/> Refresh</Button>
      </div>
    </section>

    <Card className="global-search-card" title="Global Search" subtitle="Cari Department, employee, form KPI, status, stage, atau objective KPI.">
      <div className="global-search-bar">
        <Search size={19}/><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runGlobalSearch(); }} placeholder="Contoh: QA, Andri, delivery, approved, KPI-202609..."/>
        {search && <button onClick={() => { setSearch(''); setSearchRows([]); }}>Clear</button>}
        <Button onClick={runGlobalSearch} loading={searching}><Search size={16}/> Search</Button>
      </div>
      {searchRows.length > 0 && <div className="global-search-results">
        <DataTable headers={['Form No','Employee','Department','KPI / Form','Status','Stage','Score']}>
          {searchRows.map((row) => <tr key={row.id}>
            <td><b>{row.form_no}</b><small className="table-sub">{row.period_key}</small></td>
            <td><strong>{row.full_name}</strong><small className="table-sub">{row.employee_code}</small></td>
            <td>{row.department_name || '-'}<small className="table-sub">{row.section || '-'}</small></td>
            <td>{row.matched_kpi || row.form_title || '-'}</td>
            <td><Badge>{row.status}</Badge></td><td>{row.current_stage || '-'}</td>
            <td className="score-cell strong">{formatNumber(row.final_score, 1)}</td>
          </tr>)}
        </DataTable>
      </div>}
    </Card>

    <PageHeader eyebrow="MANAGEMENT OVERVIEW" title="Key Performance Snapshot" description="Compact management view untuk submission, approval, execution gap, dan hasil akhir KPI." />

    <div className="metric-grid">
      <MetricCard label="Active Manpower" value={formatNumber(data?.totalUser)} detail="KPI population" icon={<UsersRound/>} tone="steel"/>
      <MetricCard label="Submission Rate" value={`${formatNumber(data?.completionRate, 1)}%`} detail={`${formatNumber(data?.submittedKpi)} submitted`} icon={<Target/>} tone="blue"/>
      <MetricCard label="Final Approved" value={formatNumber(data?.approvedKpi)} detail="Completed workflow" icon={<BadgeCheck/>} tone="green"/>
      <MetricCard label="Pending Approval" value={formatNumber(data?.pendingKpi)} detail="Requires action" icon={<Clock3/>} tone="amber"/>
      <MetricCard label="Not Submitted" value={formatNumber(data?.notSubmittedKpi)} detail="Execution gap" icon={<Activity/>} tone="red"/>
      <MetricCard label="Average Score" value={formatNumber(data?.averageFinalScore, 1)} detail="Approved KPI score" icon={<Gauge/>} tone="blue"/>
    </div>

    <div className="dashboard-grid">
      <Card title="Department Completion" subtitle="Submitted versus final approved by department" className="span-2 executive-chart-card">
        <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.departmentTrend || []} margin={{ top: 16, right: 12, left: 0, bottom: 24 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="department_name" angle={-20} textAnchor="end" interval={0} height={70}/><YAxis/><Tooltip cursor={{ fill: 'rgba(255,183,24,.08)' }}/><Bar dataKey="submitted" name="Submitted" fill="#0B243D" radius={[5,5,0,0]}/><Bar dataKey="approved" name="Approved" fill="#168C7A" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>
      </Card>

      <Card title="Status Distribution" subtitle="Current-period KPI population">
        <div className="donut-wrap"><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={67} outerRadius={98} paddingAngle={3} stroke="transparent">{statusData.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer><div className="donut-center"><strong>{formatNumber(data?.totalUser)}</strong><span>Employees</span></div></div>
        <div className="legend-list">{statusData.map((item, i) => <div key={item.name}><i style={{ background: chartColors[i % chartColors.length] }}/><span>{item.name}</span><b>{item.value}</b></div>)}</div>
      </Card>

      <Card title="Approval Bottleneck" subtitle="Pending forms by current stage">
        <div className="stage-list">{(data?.approvalStage || []).length ? data?.approvalStage.map((item) => <div key={item.name}><span><i style={{ width: `${Math.min(100, Math.max(8, item.value * 10))}%` }}/></span><div><b>{item.name}</b><strong>{item.value}</strong></div></div>) : <div className="mini-success"><ShieldCheck size={20}/><div><strong>No bottleneck</strong><span>Tidak ada pending approval.</span></div></div>}</div>
      </Card>

      <Card title="TOP 10 Performers" subtitle="Highest final KPI score" className="ranking-card">
        <div className="ranking-list">{(data?.topPerformer || []).slice(0, 10).map((item, index) => <div key={`${item.full_name}-${index}`}><span>{index + 1}</span><div><strong>{item.full_name}</strong><small>{item.department_name}</small></div><b>{formatNumber(item.final_score, 1)}</b></div>)}</div>
      </Card>

      <Card title="BOTTOM 10 Performance" subtitle="Lowest final KPI score · management attention" className="ranking-card ranking-bottom">
        <div className="ranking-list">{(data?.bottomPerformer || []).slice(0, 10).map((item, index) => <div key={`${item.full_name}-${index}`}><span>{index + 1}</span><div><strong>{item.full_name}</strong><small>{item.department_name}</small></div><b>{formatNumber(item.final_score, 1)}</b></div>)}</div>
      </Card>
    </div>
  </div>;
}
