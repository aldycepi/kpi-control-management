import { useEffect, useMemo, useState } from 'react';
import {
  Activity, BadgeCheck, Clock3, Factory, Gauge, RefreshCw, ShieldCheck,
  Target, TrendingUp, UsersRound, Zap
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import type { DashboardSummary, Department } from '../lib/types';
import { currentPeriod, formatDateTime, formatNumber, monthLabel } from '../lib/utils';
import { Button, Card, LoadingBlock, MetricCard, PageHeader, Select } from '../components/UI';

const chartColors = ['#2563eb','#0f9f8f','#f59e0b','#ef4444','#64748b','#7c3aed'];

export function DashboardPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [department, setDepartment] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

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

  const statusData = useMemo(() => data?.statusDistribution || [], [data]);
  const completion = Number(data?.completionRate || 0);
  const healthTone = completion >= 90 ? 'healthy' : completion >= 70 ? 'watch' : 'critical';
  if (loading && !data) return <LoadingBlock label="Menyusun executive control tower..."/>;

  return <div className="page-stack dashboard-page">
    <section className="dashboard-hero fluent-glass">
      <div className="dashboard-hero-copy">
        <span className="eyebrow"><Factory size={14}/> FACTORY PERFORMANCE CONTROL TOWER</span>
        <h1>Performance pulse for <span>{monthLabel(period)}</span></h1>
        <p>Ringkasan submission, approval, completion, dan execution gap untuk seluruh scope yang dapat Anda akses.</p>
        <div className="hero-status-row">
          <div><i className={`health-light ${healthTone}`}/><span>Submission health</span><strong>{formatNumber(completion, 1)}%</strong></div>
          <div><ShieldCheck size={18}/><span>Governance</span><strong>RLS Active</strong></div>
          <div><Zap size={18}/><span>Edge runtime</span><strong>Cloudflare</strong></div>
        </div>
      </div>
      <div className="dashboard-hero-controls">
        <label><span>Period</span><input className="input" type="month" value={period} onChange={(e) => setPeriod(e.target.value)}/></label>
        <label><span>Department</span><Select value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">All Departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.department_name}</option>)}</Select></label>
        <Button variant="secondary" onClick={load} loading={loading}><RefreshCw size={16}/> Refresh Data</Button>
      </div>
      <div className="hero-factory-mark"><Factory/></div>
    </section>

    <PageHeader eyebrow="EXECUTIVE KPI OVERVIEW" title="Control Tower Metrics" description="Power BI-style KPI cards untuk membaca status organisasi dalam satu pandangan." />

    <div className="metric-grid">
      <MetricCard label="Active Manpower" value={formatNumber(data?.totalUser)} detail="KPI population" icon={<UsersRound/>} tone="steel"/>
      <MetricCard label="Submission Rate" value={`${formatNumber(data?.completionRate, 1)}%`} detail={`${formatNumber(data?.submittedKpi)} submitted`} icon={<Target/>} tone="blue"/>
      <MetricCard label="Final Approved" value={formatNumber(data?.approvedKpi)} detail="Completed workflow" icon={<BadgeCheck/>} tone="green"/>
      <MetricCard label="Pending Approval" value={formatNumber(data?.pendingKpi)} detail="Requires action" icon={<Clock3/>} tone="amber"/>
      <MetricCard label="Not Submitted" value={formatNumber(data?.notSubmittedKpi)} detail="Execution gap" icon={<Activity/>} tone="red"/>
      <MetricCard label="Average Score" value={formatNumber(data?.averageFinalScore, 1)} detail="Approved KPI score" icon={<Gauge/>} tone="blue"/>
    </div>

    <div className="dashboard-grid">
      <Card title="Department Completion" subtitle="Submitted versus final-approved by department" className="span-2 executive-chart-card">
        <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.departmentTrend || []} margin={{ top: 16, right: 12, left: 0, bottom: 24 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="department_name" angle={-20} textAnchor="end" interval={0} height={70}/><YAxis/><Tooltip cursor={{ fill: 'rgba(37,99,235,.05)' }}/><Bar dataKey="submitted" name="Submitted" fill="#2563eb" radius={[7,7,0,0]}/><Bar dataKey="approved" name="Approved" fill="#0f9f8f" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div>
      </Card>

      <Card title="Status Distribution" subtitle="Current-period KPI population">
        <div className="donut-wrap"><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={67} outerRadius={98} paddingAngle={4} stroke="transparent">{statusData.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer><div className="donut-center"><strong>{formatNumber(data?.totalUser)}</strong><span>Employees</span></div></div>
        <div className="legend-list">{statusData.map((item, i) => <div key={item.name}><i style={{ background: chartColors[i % chartColors.length] }}/><span>{item.name}</span><b>{item.value}</b></div>)}</div>
      </Card>

      <Card title="Approval Bottleneck" subtitle="Pending forms by current stage">
        <div className="stage-list">{(data?.approvalStage || []).length ? data?.approvalStage.map((item) => <div key={item.name}><span><i style={{ width: `${Math.min(100, Math.max(8, item.value * 10))}%` }}/></span><div><b>{item.name}</b><strong>{item.value}</strong></div></div>) : <div className="mini-success"><BadgeCheck size={20}/><div><strong>No bottleneck</strong><span>Tidak ada pending approval.</span></div></div>}</div>
      </Card>

      <Card title="Top Performance" subtitle="Highest final score" className="span-1">
        <div className="ranking-list">{(data?.topPerformer || []).slice(0, 6).map((item, index) => <div key={`${item.full_name}-${index}`}><span>{index + 1}</span><div><strong>{item.full_name}</strong><small>{item.department_name}</small></div><b>{formatNumber(item.final_score, 1)}</b></div>)}</div>
      </Card>

      <Card title="Recent Approval Activity" subtitle="Latest actions across visible scope" className="span-2">
        <div className="activity-feed">{(data?.recentActivity || []).length ? (data?.recentActivity || []).map((item: any, i) => <div key={i}><i className={item.action === 'REJECTED' ? 'danger' : 'success'}/><div><strong>{item.form_no} · {item.full_name}</strong><p>{item.action} at {item.stage_name}{item.note ? ` · ${item.note}` : ''}</p><span>{item.actor_name || 'System'} · {formatDateTime(item.created_at)}</span></div></div>) : <div className="empty-inline"><TrendingUp/><span>Aktivitas approval akan muncul di sini.</span></div>}</div>
      </Card>
    </div>
  </div>;
}
