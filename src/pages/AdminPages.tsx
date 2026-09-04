import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Database, Download, FileUp, HeartPulse, Pencil, Plus, RefreshCw, Route, Save, Search, ShieldCheck, Sparkles, Trash2, UserRoundCog } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { AppUser, ApprovalMatrix, Department, KpiForm, RoleCode } from '../lib/types';
import { currentPeriod, formatDateTime, roleLabel } from '../lib/utils';
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, SearchInput, Select, Textarea } from '../components/UI';

const roleOptions: RoleCode[] = ['STAFF','LEADER','ASSMAN','PLANT_MANAGER','GENERAL_MANAGER','BOD_KI','BOD_BEI','ADMIN'];
const approvalRoles = ['', 'LEADER','ASSMAN','PLANT_MANAGER','GENERAL_MANAGER','BOD_KI','BOD_BEI'];

export function UsersAdminPage() {
  const [items, setItems] = useState<AppUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [accessMap, setAccessMap] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const empty = {
    email: '', password: '', employee_code: '', username: '', full_name: '', department_id: '',
    department_access_ids: [] as string[], section: '', position_name: '', role_code: 'STAFF' as RoleCode, active: true
  };
  const [form, setForm] = useState<any>(empty);

  const load = async () => {
    setLoading(true);
    const [{ data: users, error }, { data: departmentRows }, { data: accessRows }] = await Promise.all([
      supabase.from('users').select('id,auth_user_id,employee_code,username,email,full_name,department_id,section,position_name,role_code,active,must_change_password').order('full_name'),
      supabase.from('departments').select('*').order('department_name'),
      supabase.from('user_department_access').select('user_id,department_id').eq('active', true)
    ]);
    if (error) toast.error(error.message);
    else setItems((users || []) as AppUser[]);
    setDepartments((departmentRows || []) as Department[]);
    const nextMap: Record<string, string[]> = {};
    (accessRows || []).forEach((row: any) => { nextMap[row.user_id] = [...(nextMap[row.user_id] || []), row.department_id]; });
    setAccessMap(nextMap);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter((item) => [item.employee_code, item.username, item.email, item.full_name, item.role_code, item.section]
    .join(' ').toLowerCase().includes(search.toLowerCase()));
  const edit = (item?: AppUser) => {
    setForm(item ? { ...item, password: '', department_id: item.department_id || '', department_access_ids: accessMap[item.id] || [] } : empty);
    setOpen(true);
  };
  const toggleRelatedDepartment = (departmentId: string, checked: boolean) => {
    setForm((current: any) => ({
      ...current,
      department_access_ids: checked
        ? [...new Set([...(current.department_access_ids || []), departmentId])]
        : (current.department_access_ids || []).filter((id: string) => id !== departmentId)
    }));
  };
  const save = async () => {
    setSaving(true);
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ ...form, department_id: form.department_id || null, password: form.password || undefined })
      });
      toast.success('User dan scope department berhasil disimpan.');
      setOpen(false);
      await load();
    } catch (error: any) { toast.error(error.message); } finally { setSaving(false); }
  };
  const toggle = async (item: AppUser) => {
    try {
      await api(`/api/admin/users/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) });
      toast.success('Status user diperbarui.');
      await load();
    } catch (error: any) { toast.error(error.message); }
  };

  const remove = async (item: AppUser) => {
    const confirmed = window.confirm(`Hapus permanen user ${item.full_name} (${item.employee_code})? User yang sudah memiliki histori KPI sebaiknya dinonaktifkan, bukan dihapus.`);
    if (!confirmed) return;
    try {
      await api(`/api/admin/users/${item.id}`, { method: 'DELETE' });
      toast.success('User dan akun Supabase Auth berhasil dihapus.');
      await load();
    } catch (error: any) { toast.error(error.message); }
  };

  return <div className="page-stack">
    <PageHeader eyebrow="IDENTITY & ACCESS MANAGEMENT" title="User Administration" description="Supabase Auth identity dipisahkan dari profile, role, primary department, dan cross-department reporting scope." actions={<Button onClick={() => edit()}><Plus size={16}/> Add User</Button>}/>
    <Card action={<SearchInput value={search} onChange={setSearch} placeholder="Search users..."/>}>
      {loading ? <LoadingBlock/> : <DataTable headers={['Employee','Name','Username','Department','Related Scope','Section','Role','Status','']}>
        {filtered.map((item) => <tr key={item.id}>
          <td><b>{item.employee_code}</b></td>
          <td>{item.full_name}<small className="table-sub">{item.email}</small></td>
          <td>{item.username}</td>
          <td>{departments.find((department) => department.id === item.department_id)?.department_name || '-'}</td>
          <td>{(accessMap[item.id] || []).length ? <Badge tone="blue">{(accessMap[item.id] || []).length} dept</Badge> : '-'}</td>
          <td>{item.section || '-'}</td>
          <td>{roleLabel(item.role_code)}</td>
          <td><button className="link-button" onClick={() => toggle(item)}><Badge tone={item.active ? 'success' : 'danger'}>{item.active ? 'ACTIVE' : 'INACTIVE'}</Badge></button></td>
          <td><div className="table-actions"><Button variant="ghost" onClick={() => edit(item)}><Pencil size={15}/></Button><Button variant="ghost" className="danger-ghost" onClick={() => remove(item)}><Trash2 size={15}/></Button></div></td>
        </tr>)}
      </DataTable>}
    </Card>
    <Modal open={open} title={form.id ? 'Edit User' : 'Create User'} onClose={() => setOpen(false)} wide footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} loading={saving}><Save size={16}/> Save User</Button></>}>
      <div className="form-grid three">
        <Field label="Employee Code"><Input value={form.employee_code} onChange={(event) => setForm({...form, employee_code: event.target.value})}/></Field>
        <Field label="Username"><Input value={form.username} onChange={(event) => setForm({...form, username: event.target.value})}/></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(event) => setForm({...form, email: event.target.value})}/></Field>
        <Field label="Full Name"><Input value={form.full_name} onChange={(event) => setForm({...form, full_name: event.target.value})}/></Field>
        <Field label={form.id ? 'New Password (optional)' : 'Password'}><Input type="password" value={form.password} onChange={(event) => setForm({...form, password: event.target.value})}/></Field>
        <Field label="Role"><Select value={form.role_code} onChange={(event) => setForm({...form, role_code: event.target.value})}>{roleOptions.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</Select></Field>
        <Field label="Primary Department"><Select value={form.department_id} onChange={(event) => setForm({...form, department_id: event.target.value})}><option value="">No Department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.department_name}</option>)}</Select></Field>
        <Field label="Section"><Input value={form.section || ''} onChange={(event) => setForm({...form, section: event.target.value})}/></Field>
        <Field label="Position"><Input value={form.position_name || ''} onChange={(event) => setForm({...form, position_name: event.target.value})}/></Field>
      </div>
      <Field label="Related Department Access">
        <div className="checkbox-grid">
          {departments.filter((department) => department.id !== form.department_id).map((department) => <label key={department.id} className="checkbox-card">
            <input type="checkbox" checked={(form.department_access_ids || []).includes(department.id)} onChange={(event) => toggleRelatedDepartment(department.id, event.target.checked)}/>
            <span><strong>{department.department_code}</strong>{department.department_name}</span>
          </label>)}
        </div>
      </Field>
    </Modal>
  </div>;
}

export function DepartmentsAdminPage(){
  const [items,setItems]=useState<Department[]>([]);
  const [open,setOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const empty={department_code:'',department_name:'',plant_code:'',sort_order:999,active:true};
  const [form,setForm]=useState<any>(empty);
  const load=async()=>{const{data,error}=await supabase.from('departments').select('*').order('sort_order');if(error)toast.error(error.message);else setItems(data as Department[]||[])};
  useEffect(()=>{load()},[]);
  const save=async()=>{setSaving(true);try{await api('/api/admin/departments',{method:'POST',body:JSON.stringify({...form,sort_order:Number(form.sort_order)})});toast.success('Department tersimpan.');setOpen(false);load()}catch(e:any){toast.error(e.message)}finally{setSaving(false)}};
  const remove=async(item:Department)=>{if(!window.confirm(`Hapus permanen department ${item.department_name}? Department yang masih dipakai user, KPI, atau matrix tidak dapat dihapus.`))return;try{await api(`/api/admin/departments/${item.id}`,{method:'DELETE'});toast.success('Department dihapus.');load()}catch(e:any){toast.error(e.message)}};
  return <div className="page-stack"><PageHeader eyebrow="ORGANIZATION MASTER" title="Departments" description="Master department dan plant scope untuk user, dashboard, approval matrix, dan reporting." actions={<Button onClick={()=>{setForm(empty);setOpen(true)}}><Plus size={16}/> Add Department</Button>}/><Card><DataTable headers={['Code','Department Name','Plant','Sort','Status','']}>
    {items.map(x=><tr key={x.id}><td><b>{x.department_code}</b></td><td>{x.department_name}</td><td>{x.plant_code||'-'}</td><td>{x.sort_order}</td><td><Badge tone={x.active?'success':'danger'}>{x.active?'ACTIVE':'INACTIVE'}</Badge></td><td><div className="table-actions"><Button variant="ghost" onClick={()=>{setForm(x);setOpen(true)}}><Pencil size={15}/></Button><Button variant="ghost" className="danger-ghost" onClick={()=>remove(x)}><Trash2 size={15}/></Button></div></td></tr>)}
  </DataTable></Card><Modal open={open} title={form.id?'Edit Department':'Add Department'} onClose={()=>setOpen(false)} footer={<><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save} loading={saving}><Save size={16}/> Save</Button></>}><div className="form-grid two"><Field label="Department Code"><Input value={form.department_code} onChange={e=>setForm({...form,department_code:e.target.value})}/></Field><Field label="Department Name"><Input value={form.department_name} onChange={e=>setForm({...form,department_name:e.target.value})}/></Field><Field label="Plant Code"><Input value={form.plant_code||''} onChange={e=>setForm({...form,plant_code:e.target.value})}/></Field><Field label="Sort Order"><Input type="number" value={form.sort_order} onChange={e=>setForm({...form,sort_order:e.target.value})}/></Field><Field label="Status"><Select value={String(form.active)} onChange={e=>setForm({...form,active:e.target.value==='true'})}><option value="true">Active</option><option value="false">Inactive</option></Select></Field></div></Modal></div>
}

export function MatrixAdminPage(){
  const[items,setItems]=useState<ApprovalMatrix[]>([]);const[departments,setDepartments]=useState<Department[]>([]);const[users,setUsers]=useState<AppUser[]>([]);const[open,setOpen]=useState(false);const[saving,setSaving]=useState(false);
  const empty:any={matrix_code:'',department_id:'',section:'*',submitter_role_code:'*',priority:100,active:true,checked1_role_code:'',checked1_user_id:'',approval1_role_code:'',approval1_user_id:'',approval2_role_code:'',approval2_user_id:'',approval3_role_code:'',approval3_user_id:'',checked2_role_code:'',checked2_user_id:'',approval4_role_code:'',approval4_user_id:'',note:''};const[form,setForm]=useState<any>(empty);
  const load=async()=>{const[{data:m,error},{data:d},{data:u}]=await Promise.all([supabase.from('approval_matrix').select('*').order('priority'),supabase.from('departments').select('*').eq('active',true).order('department_name'),supabase.from('users').select('*').eq('active',true).order('full_name')]);if(error)toast.error(error.message);else setItems(m as ApprovalMatrix[]||[]);setDepartments(d as Department[]||[]);setUsers(u as AppUser[]||[])};useEffect(()=>{load()},[]);
  const set=(k:string,v:any)=>setForm((f:any)=>({...f,[k]:v}));const save=async()=>{setSaving(true);try{const p:any={...form,department_id:form.department_id||null,priority:Number(form.priority)};['checked1','approval1','approval2','approval3','checked2','approval4'].forEach(s=>{p[`${s}_role_code`]=p[`${s}_role_code`]||null;p[`${s}_user_id`]=p[`${s}_user_id`]||null});await api('/api/admin/matrix',{method:'POST',body:JSON.stringify(p)});toast.success('Approval matrix tersimpan.');setOpen(false);load()}catch(e:any){toast.error(e.message)}finally{setSaving(false)}};
  const disable=async(id:string)=>{try{await api(`/api/admin/matrix/${id}`,{method:'DELETE'});toast.success('Matrix dinonaktifkan.');load()}catch(e:any){toast.error(e.message)}};
  const stageField=(stage:string,label:string)=><div className="stage-config"><strong>{label}</strong><Select value={form[`${stage}_role_code`]||''} onChange={e=>set(`${stage}_role_code`,e.target.value)}><option value="">No Stage</option>{approvalRoles.filter(Boolean).map(r=><option key={r} value={r}>{roleLabel(r)}</option>)}</Select><Select value={form[`${stage}_user_id`]||''} onChange={e=>set(`${stage}_user_id`,e.target.value)}><option value="">Auto resolve by role</option>{users.filter(u=>!form[`${stage}_role_code`]||u.role_code===form[`${stage}_role_code`]).map(u=><option key={u.id} value={u.id}>{u.full_name} · {u.role_code}</option>)}</Select></div>;
  return <div className="page-stack"><PageHeader eyebrow="WORKFLOW ROUTING ENGINE" title="Approval Matrix" description="Department, section, dan submitter role menentukan route Checked1 hingga Approval4." actions={<Button onClick={()=>{setForm(empty);setOpen(true)}}><Plus size={16}/> Add Matrix</Button>}/><Card><DataTable headers={['Matrix','Scope','Submitter','Route','Priority','Status','']}>
    {items.map(x=>{const route=[x.checked1_role_code,x.approval1_role_code,x.approval2_role_code,x.approval3_role_code,x.checked2_role_code,x.approval4_role_code].filter(Boolean);return <tr key={x.id}><td><b>{x.matrix_code}</b></td><td>{departments.find(d=>d.id===x.department_id)?.department_name||'Global'}<small className="table-sub">{x.section||'*'}</small></td><td>{x.submitter_role_code}</td><td><div className="route-mini">{route.map((r,i)=><span key={i}>{r}</span>)}</div></td><td>{x.priority}</td><td><Badge tone={x.active?'success':'danger'}>{x.active?'ACTIVE':'INACTIVE'}</Badge></td><td><Button variant="ghost" onClick={()=>{setForm({...x,department_id:x.department_id||''});setOpen(true)}}><Pencil size={15}/></Button>{x.active&&<Button variant="ghost" onClick={()=>disable(x.id)}>Disable</Button>}</td></tr>})}
  </DataTable></Card><Modal open={open} title={form.id?'Edit Approval Matrix':'Create Approval Matrix'} onClose={()=>setOpen(false)} wide footer={<Button onClick={save} loading={saving}><Save size={16}/> Save Matrix</Button>}><div className="form-grid four"><Field label="Matrix Code"><Input value={form.matrix_code} onChange={e=>set('matrix_code',e.target.value)}/></Field><Field label="Department"><Select value={form.department_id||''} onChange={e=>set('department_id',e.target.value)}><option value="">Global</option>{departments.map(d=><option key={d.id} value={d.id}>{d.department_name}</option>)}</Select></Field><Field label="Section"><Input value={form.section||''} onChange={e=>set('section',e.target.value)} placeholder="* for all"/></Field><Field label="Submitter Role"><Select value={form.submitter_role_code} onChange={e=>set('submitter_role_code',e.target.value)}><option value="*">All Roles</option>{roleOptions.filter(r=>!['ADMIN','BOD_KI','BOD_BEI'].includes(r)).map(r=><option key={r}>{r}</option>)}</Select></Field></div><div className="stage-config-grid">{stageField('checked1','01 · Checked 1')}{stageField('approval1','02 · Approval 1')}{stageField('approval2','03 · Approval 2')}{stageField('approval3','04 · Approval 3')}{stageField('checked2','05 · Checked 2')}{stageField('approval4','06 · Approval 4')}</div><div className="form-grid two"><Field label="Priority"><Input type="number" value={form.priority} onChange={e=>set('priority',e.target.value)}/></Field><Field label="Note"><Input value={form.note||''} onChange={e=>set('note',e.target.value)}/></Field></div></Modal></div>
}

export function RerouteAdminPage(){
  const[departments,setDepartments]=useState<Department[]>([]);const[preview,setPreview]=useState<KpiForm[]>([]);const[selected,setSelected]=useState<string[]>([]);const[loading,setLoading]=useState(false);const[running,setRunning]=useState(false);const[progress,setProgress]=useState({processed:0,updated:0,failed:0});
  const[filters,setFilters]=useState<any>({period_key:currentPeriod(),department_id:'',status:'',current_stage:'',role_code:'',section:'',employee_code:'',form_no:''});
  useEffect(()=>{supabase.from('departments').select('*').eq('active',true).order('department_name').then(({data})=>setDepartments(data as Department[]||[]))},[]);
  const loadPreview=async()=>{setLoading(true);let q=supabase.from('kpi_forms').select('id,form_no,period_key,full_name,employee_code,department_name,department_id,section,role_code,status,current_stage,submitted_at').in('status',['SUBMITTED','CHECKED','VERIFIED']).order('submitted_at').limit(500);if(filters.period_key)q=q.eq('period_key',filters.period_key);if(filters.department_id)q=q.eq('department_id',filters.department_id);if(filters.status)q=q.eq('status',filters.status);if(filters.current_stage)q=q.eq('current_stage',filters.current_stage);if(filters.role_code)q=q.eq('role_code',filters.role_code);if(filters.section)q=q.eq('section',filters.section);if(filters.employee_code)q=q.eq('employee_code',filters.employee_code);if(filters.form_no)q=q.eq('form_no',filters.form_no);const{data,error}=await q;if(error)toast.error(error.message);else{setPreview(data as KpiForm[]||[]);setSelected([])}setLoading(false)};
  const run=async()=>{setRunning(true);setProgress({processed:0,updated:0,failed:0});let cursor:any=null;let hasMore=true;try{while(hasMore){const result:any=await api('/api/admin/reroute',{method:'POST',body:JSON.stringify({filters:{...filters,form_ids:selected.length?selected:undefined},cursor,batchSize:100})});setProgress(p=>({processed:p.processed+Number(result.processed||0),updated:p.updated+Number(result.updated||0),failed:p.failed+Number(result.failed?.length||0)}));cursor=result.next_cursor;hasMore=Boolean(result.has_more)&&!selected.length;if(selected.length)hasMore=false;}toast.success('Scoped reroute selesai.');loadPreview()}catch(e:any){toast.error(e.message)}finally{setRunning(false)}};
  const set=(k:string,v:string)=>setFilters((f:any)=>({...f,[k]:v}));
  return <div className="page-stack"><PageHeader eyebrow="APPROVAL ROUTE RECOVERY" title="Scoped Reroute Control" description="Pilih scope atau form tertentu. Reroute menghitung stage belum selesai dari history, bukan mengulang approval yang sudah selesai."/><Card title="Reroute Scope" subtitle="Kosongkan filter untuk seluruh pending KPI. Pilih form di preview untuk reroute selektif."><div className="form-grid four"><Field label="Period"><Input type="month" value={filters.period_key} onChange={e=>set('period_key',e.target.value)}/></Field><Field label="Department"><Select value={filters.department_id} onChange={e=>set('department_id',e.target.value)}><option value="">All Departments</option>{departments.map(d=><option key={d.id} value={d.id}>{d.department_name}</option>)}</Select></Field><Field label="Status"><Select value={filters.status} onChange={e=>set('status',e.target.value)}><option value="">All Pending</option>{['SUBMITTED','CHECKED','VERIFIED'].map(x=><option key={x}>{x}</option>)}</Select></Field><Field label="Current Stage"><Select value={filters.current_stage} onChange={e=>set('current_stage',e.target.value)}><option value="">All Stages</option>{['Checked1','Approval1','Approval2','Approval3','Checked2','Approval4'].map(x=><option key={x}>{x}</option>)}</Select></Field><Field label="Submitter Role"><Select value={filters.role_code} onChange={e=>set('role_code',e.target.value)}><option value="">All Roles</option>{roleOptions.map(r=><option key={r}>{r}</option>)}</Select></Field><Field label="Section"><Input value={filters.section} onChange={e=>set('section',e.target.value)}/></Field><Field label="Employee Code"><Input value={filters.employee_code} onChange={e=>set('employee_code',e.target.value)}/></Field><Field label="Form No"><Input value={filters.form_no} onChange={e=>set('form_no',e.target.value)}/></Field></div><div className="button-row"><Button variant="secondary" onClick={loadPreview} loading={loading}><Search size={16}/> Preview Scope</Button><Button variant="danger" onClick={run} loading={running} disabled={!preview.length}><Route size={16}/> Reroute {selected.length?`${selected.length} Selected`:`${preview.length} Previewed`}</Button></div>{running&&<div className="progress-panel"><div><span>Processed</span><b>{progress.processed}</b></div><div><span>Updated</span><b>{progress.updated}</b></div><div><span>Failed</span><b>{progress.failed}</b></div></div>}</Card><Card title={`Pending KPI Preview · ${preview.length}`} subtitle="Maximum preview 500 rows. Database reroute itself is cursor-batched.">{loading?<LoadingBlock/>:preview.length?<DataTable headers={['Select','Form No','Employee','Department','Role','Status','Stage','Submitted']}>
    {preview.map(x=><tr key={x.id}><td><input type="checkbox" checked={selected.includes(x.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,x.id]:s.filter(id=>id!==x.id))}/></td><td><b>{x.form_no}</b></td><td>{x.full_name}<small className="table-sub">{x.employee_code}</small></td><td>{x.department_name}<small className="table-sub">{x.section||'-'}</small></td><td>{x.role_code}</td><td><Badge>{x.status}</Badge></td><td>{x.current_stage}</td><td>{formatDateTime(x.submitted_at)}</td></tr>)}
  </DataTable>:<EmptyState title="Preview belum dimuat" description="Tentukan scope lalu klik Preview Scope."/>}</Card></div>
}

function parseCsv(text:string){const lines=text.trim().split(/\r?\n/).filter(Boolean);if(!lines.length)return[];const parse=(line:string)=>{const out:string[]=[];let cur='';let quote=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quote&&line[i+1]==='"'){cur+='"';i++}else quote=!quote}else if(c===','&&!quote){out.push(cur.trim());cur=''}else cur+=c}out.push(cur.trim());return out};const headers=parse(lines[0]);return lines.slice(1).map(line=>Object.fromEntries(parse(line).map((v,i)=>[headers[i],v===''?null:v])))}
function csvCell(value:unknown){const text=String(value??'');return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text}
function rowsToCsv(rows:any[]){if(!rows.length)return'';const headers=Object.keys(rows[0]);return [headers.join(','),...rows.map(row=>headers.map(header=>csvCell(row[header])).join(','))].join('\n')}
function downloadCsv(filename:string,content:string){const url=URL.createObjectURL(new Blob(['\ufeff',content],{type:'text/csv;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();URL.revokeObjectURL(url)}
function downloadStatic(path:string,filename:string){const anchor=document.createElement('a');anchor.href=path;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove()}
function normalizeImportedRows(rows:any[]){return rows.map((row)=>Object.fromEntries(Object.entries(row).map(([key,value])=>[String(key).trim(),value===undefined||value===''?null:value])))}
let xlsxLoader:Promise<any>|null=null;
function loadXlsx(){
  if((window as any).XLSX)return Promise.resolve((window as any).XLSX);
  if(xlsxLoader)return xlsxLoader;
  xlsxLoader=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    script.async=true;
    script.onload=()=>{const api=(window as any).XLSX;api?resolve(api):reject(new Error('Excel parser tidak tersedia.'))};
    script.onerror=()=>reject(new Error('Gagal memuat Excel parser. Gunakan CSV jika jaringan perusahaan memblokir CDN.'));
    document.head.appendChild(script);
  });
  return xlsxLoader;
}
async function downloadExcel(filename:string,rows:any[],sheetName='Data'){
  const XLSX=await loadXlsx();
  const workbook=XLSX.utils.book_new();
  const worksheet=XLSX.utils.json_to_sheet(rows,{skipHeader:false});
  const headers=rows.length?Object.keys(rows[0]):[];
  worksheet['!cols']=headers.map((header)=>({wch:Math.min(40,Math.max(14,header.length+2,...rows.slice(0,200).map((row)=>String(row[header]??'').length+2)))}));
  XLSX.utils.book_append_sheet(workbook,worksheet,sheetName.slice(0,31));
  const instructions=XLSX.utils.aoa_to_sheet([
    ['IMPORT INSTRUCTIONS'],
    ['1','Do not rename column headers.'],
    ['2','Keep employee codes, usernames, form numbers, and department codes as text.'],
    ['3','Database-owned fields are resolved automatically by the application.'],
    ['4','Allowed boolean values: true/false, 1/0, yes/no, active/inactive.'],
    ['5','Import is UPSERT-only. Delete data from the dedicated administration menu.']
  ]);
  instructions['!cols']=[{wch:6},{wch:95}];
  XLSX.utils.book_append_sheet(workbook,instructions,'Instructions');
  XLSX.writeFile(workbook,filename,{compression:true});
}

type ImportEntity='users'|'departments'|'approval_matrix'|'kpi_forms'|'kpi_points'|'demo_approvals';
type ImportFailure={row:number;identifier?:string;employee_code?:string;message:string};
type ImportExecutionResult={
  entity:ImportEntity;
  requested:number;
  created:number;
  updated:number;
  imported:number;
  failed:ImportFailure[];
  completedAt:string;
};
const importSamples:Record<ImportEntity,string>={
  users:'employee_code,username,password,full_name,department_code,section,position_name,role_code,active,must_change_password\nDEMO001,demo.user01,DemoPass123!,Demo User 01,PPC,Delivery Control,Staff,STAFF,true,true',
  departments:'department_code,department_name,plant_code,sort_order,active\nPPC,Production Planning Control,BEI,10,true',
  approval_matrix:'matrix_code,department_code,section,submitter_role_code,checked1_role_code,approval1_role_code,approval2_role_code,approval3_role_code,checked2_role_code,approval4_role_code,priority,active,note\nPPC-STAFF,PPC,*,STAFF,LEADER,ASSMAN,PLANT_MANAGER,GENERAL_MANAGER,BOD_KI,BOD_BEI,100,true,Standard six-stage route',
  kpi_forms:'form_no,period_year,period_month,employee_code,form_title,due_date\nKPI-202607-001,2026,7,DEMO001,Monthly Individual KPI,2026-07-31',
  kpi_points:'form_no,point_no,subject,kpi_objective,uom,weight_percent,source_data,target,actual,calc_type,manual_score\nKPI-202607-001,1,Delivery,On Time Delivery,%,100,Daily Delivery Report,100,96,HIGHER_BETTER,',
  demo_approvals:'form_no,approval_state\nDEMO-KPI-202607-008,APPROVED_BOD_BEI'
};

const requiredColumns:Record<ImportEntity,string[]>={
  users:['employee_code','username','password','full_name','department_code','role_code'],
  departments:['department_code','department_name'],
  approval_matrix:['matrix_code','department_code','checked1_role_code','approval1_role_code','approval2_role_code','approval3_role_code','checked2_role_code','approval4_role_code'],
  kpi_forms:['form_no','period_year','period_month','employee_code','form_title'],
  kpi_points:['form_no','point_no','kpi_objective','weight_percent','calc_type'],
  demo_approvals:['form_no','approval_state']
};

const importGuidance:Record<ImportEntity,{title:string;description:string;automatic:string}>={
  users:{title:'User essentials only',description:'Email Auth dibuat otomatis dari username. Related department dikelola dari User Administration, sehingga template tetap ringkas.',automatic:'Automatic: email, auth_user_id, related department scope, created_by, updated_by.'},
  departments:{title:'Department master',description:'Gunakan kode unik, nama department, plant, urutan tampilan, dan status aktif.',automatic:'Automatic: ID, timestamps, and audit metadata.'},
  approval_matrix:{title:'2 checked + 4 approval',description:'Route selalu tersedia dalam enam slot: Checked 1, Approval 1, Approval 2, Approval 3, Checked 2, Approval 4.',automatic:'Automatic: department_id resolved from department_code and approver users resolved later by role.'},
  kpi_forms:{title:'Form identity resolved automatically',description:'Cukup tentukan nomor form, periode, employee code, judul, dan due date.',automatic:'Automatic: period_key, user_id, name, department, section, position, role, and DRAFT status.'},
  kpi_points:{title:'Point linked by Form No',description:'Tidak perlu mencari UUID form. Gunakan form_no dan pilih calculation type dari dropdown pada template Excel.',automatic:'Automatic: form_id, achievement percent, weighted score, timestamps, and form total recalculation.'},
  demo_approvals:{title:'Demo workflow status only',description:'Khusus form DEMO-KPI-*. Gunakan setelah Departments, Users, Approval Matrix, KPI Forms, dan KPI Points selesai diimport.',automatic:'Automatic: approval route, approver identity, history, signature token, current stage, and final APPROVED status.'}
};

const demoDepartments=[
  ['PPC','Production Planning Control'],['PROD','Production'],['QA','Quality Assurance'],['ENG','Engineering'],['MTN','Maintenance'],
  ['WHS','Warehouse'],['MCL','Material Control Logistics'],['PUR','Purchasing'],['HRGA','Human Resources & General Affairs'],['FIN','Finance'],
  ['IT','Information Technology'],['SCM','Supply Chain Management'],['PP','Preparation Process'],['HA','Housing & Assembly'],['VCP','Visual Check Process'],
  ['RFG','Ready Finished Goods'],['QC','Quality Control'],['LAB','Quality Laboratory'],['EXIM','Export Import'],['MGMT','Plant Management']
] as const;

function demoRows(entity:ImportEntity){
  const period=currentPeriod();
  const [yearText,monthText]=period.split('-');
  const year=Number(yearText);const month=Number(monthText);
  const monthEnd=new Date(year,month,0).toISOString().slice(0,10);
  if(entity==='departments')return demoDepartments.map(([code,name],index)=>({department_code:code,department_name:name,plant_code:'BEI',sort_order:(index+1)*10,active:true}));
  if(entity==='users'){const roles=['LEADER','ASSMAN','PLANT_MANAGER','GENERAL_MANAGER','BOD_KI','BOD_BEI',...Array(14).fill('STAFF')];return demoDepartments.map(([code],index)=>({employee_code:`DEMO${String(index+1).padStart(3,'0')}`,username:`demo.user${String(index+1).padStart(2,'0')}`,password:'DemoPass123!',full_name:`Demo Employee ${String(index+1).padStart(2,'0')}`,department_code:code,section:index%2===0?'Operation':'Support',position_name:index<6?'Approver':'Staff',role_code:roles[index],active:true,must_change_password:true}));}
  if(entity==='approval_matrix')return demoDepartments.map(([code],index)=>({matrix_code:`${code}-STAFF`,department_code:code,section:'*',submitter_role_code:'STAFF',checked1_role_code:'PLANT_MANAGER',approval1_role_code:'GENERAL_MANAGER',approval2_role_code:'BOD_KI',approval3_role_code:'BOD_BEI',checked2_role_code:'PLANT_MANAGER',approval4_role_code:'GENERAL_MANAGER',priority:100+index,active:true,note:'Demo standard route: 2 checked and 4 approval'}));
  if(entity==='kpi_forms')return demoDepartments.map((_,index)=>({form_no:`DEMO-KPI-${year}${String(month).padStart(2,'0')}-${String(index+1).padStart(3,'0')}`,period_year:year,period_month:month,employee_code:`DEMO${String(index+1).padStart(3,'0')}`,form_title:`Monthly KPI Demo ${String(index+1).padStart(2,'0')}`,due_date:monthEnd}));
  if(entity==='demo_approvals')return Array.from({length:20},(_,index)=>({form_no:`DEMO-KPI-${year}${String(month).padStart(2,'0')}-${String(index+8).padStart(3,'0')}`,approval_state:index<12?'APPROVED_BOD_BEI':index<14?'CHECKED1':index<16?'APPROVAL1':index<18?'APPROVAL3':'SUBMITTED'}));
  const subjects=['Delivery','Output','Quality','Safety','Attendance','Efficiency','Downtime','Cost','5S','Kaizen','Material','Planning','Accuracy','Lead Time','Defect','Training','Audit','Inventory','Response','Compliance'];
  return subjects.map((subject,index)=>{const calc=index%3===0?'LOWER_BETTER':index%3===1?'MANUAL_SCORE':'HIGHER_BETTER';return {form_no:`DEMO-KPI-${year}${String(month).padStart(2,'0')}-${String(index+1).padStart(3,'0')}`,point_no:1,subject,kpi_objective:`${subject} Performance Achievement`,uom:calc==='MANUAL_SCORE'?'Score':'%',weight_percent:100,source_data:'Demo manufacturing data',target:calc==='MANUAL_SCORE'?null:100,actual:calc==='MANUAL_SCORE'?null:Math.max(70,98-index),calc_type:calc,manual_score:calc==='MANUAL_SCORE'?Math.max(72,96-index):null}});
}

function validateImportRows(entity:ImportEntity,rows:any[]){
  if(!rows.length)throw new Error('Tidak ada data untuk diproses.');
  const headers=Object.keys(rows[0]||{});
  const missing=requiredColumns[entity].filter((column)=>!headers.includes(column));
  if(missing.length)throw new Error(`Kolom wajib belum tersedia: ${missing.join(', ')}`);
  return normalizeImportedRows(rows);
}

export function ImportAdminPage(){
  const[entity,setEntity]=useState<ImportEntity>('users');
  const[text,setText]=useState(importSamples.users);
  const[rows,setRows]=useState<any[]>([]);
  const[running,setRunning]=useState(false);
  const[exporting,setExporting]=useState(false);
  const[importResult,setImportResult]=useState<ImportExecutionResult|null>(null);
  const[importProgress,setImportProgress]=useState('');

  const clearResult=()=>setImportResult(null);
  const parse=()=>{
    try{
      const parsed=validateImportRows(entity,parseCsv(text));
      setRows(parsed);clearResult();
      toast.success(`${parsed.length} rows parsed and validated.`);
    }catch(error:any){toast.error(error.message)}
  };
  const uploadFile=async(event:React.ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      const extension=file.name.split('.').pop()?.toLowerCase();
      if(extension==='xlsx'||extension==='xls'){
        const XLSX=await loadXlsx();
        const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
        const firstSheet=workbook.SheetNames[0];
        if(!firstSheet)throw new Error('Workbook tidak memiliki worksheet.');
        const parsed=validateImportRows(entity,XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet],{defval:null,raw:false}));
        setRows(parsed);setText(rowsToCsv(parsed));clearResult();
        toast.success(`${file.name} loaded and validated: ${parsed.length} rows.`);
      }else{
        const content=await file.text();setText(content);setRows([]);clearResult();
        toast.success(`${file.name} loaded. Click Parse & Validate.`);
      }
    }catch(error:any){toast.error(error.message)}finally{event.target.value=''}
  };
  const run=async()=>{
    if(!rows.length)return;
    setRunning(true);clearResult();setImportProgress(entity==='users'?`Preparing ${rows.length} users in Cloudflare-safe batches...`:'');
    try{
      if(entity==='users'){
        let created=0,updated=0;const failed:ImportFailure[]=[];
        for(let i=0;i<rows.length;i+=5){
          const result:any=await api('/api/admin/users/import',{method:'POST',body:JSON.stringify({rows:rows.slice(i,i+5)})});
          created+=Number(result.created||0);updated+=Number(result.updated||0);
          setImportProgress(`Processed ${Math.min(i+5,rows.length)} of ${rows.length} users. Each request contains a maximum of 5 users.`);
          failed.push(...(result.failed||[]).map((failure:any)=>({...failure,row:Number(failure.row||2)+i})));
        }
        const summary:ImportExecutionResult={entity,requested:rows.length,created,updated,imported:created+updated,failed,completedAt:new Date().toISOString()};
        setImportResult(summary);
        if(failed.length)toast.error(`${failed.length} rows failed. Alasan kegagalan tampil pada panel Import Result.`);
        else toast.success(`${created} users created and ${updated} users updated.`);
      }else{
        let imported=0;const failed:ImportFailure[]=[];
        for(let i=0;i<rows.length;i+=500){
          const result:any=await api('/api/admin/import',{method:'POST',body:JSON.stringify({entity,rows:rows.slice(i,i+500)})});
          imported+=Number(result.imported||0);
          failed.push(...(result.failed||[]).map((failure:any)=>({...failure,row:Number(failure.row||2)+i})));
        }
        const summary:ImportExecutionResult={entity,requested:rows.length,created:0,updated:0,imported,failed,completedAt:new Date().toISOString()};
        setImportResult(summary);
        if(failed.length)toast.error(`${failed.length} rows failed. Alasan kegagalan tampil pada panel Import Result.`);
        else toast.success(`${imported} rows imported successfully.`);
      }
    }catch(error:any){toast.error(error.message)}finally{setRunning(false);setImportProgress('')}
  };
  const downloadTemplateCsv=()=>downloadCsv(`${entity}_template.csv`,importSamples[entity]);
  const downloadTemplateExcel=()=>downloadStatic(`/templates/${entity}_template.xlsx`,`${entity}_template.xlsx`);
  const loadDemo=async()=>{
    try{
      const response=await fetch(`/templates/${entity}_dummy_50.csv`,{cache:'no-store'});
      if(!response.ok)throw new Error('Correlated dummy dataset tidak ditemukan pada static assets.');
      const demo=validateImportRows(entity,parseCsv(await response.text()));
      setRows(demo);setText(rowsToCsv(demo));clearResult();
      toast.success(`${demo.length} correlated dummy ${entity.replace('_',' ')} rows loaded. Review before execute.`);
    }catch(error:any){toast.error(error.message)}
  };
  const exportUsersCsv=async()=>{setExporting(true);try{const result:any=await api('/api/admin/users/export');downloadCsv(`users_export_${new Date().toISOString().slice(0,10)}.csv`,rowsToCsv(result.rows||[]));toast.success(`${result.rows?.length||0} users exported to CSV.`)}catch(error:any){toast.error(error.message)}finally{setExporting(false)}};
  const exportUsersExcel=async()=>{setExporting(true);try{const result:any=await api('/api/admin/users/export');await downloadExcel(`users_export_${new Date().toISOString().slice(0,10)}.xlsx`,result.rows||[],'Users');toast.success(`${result.rows?.length||0} users exported to Excel.`)}catch(error:any){toast.error(error.message)}finally{setExporting(false)}};
  const downloadFailureReport=()=>{
    if(!importResult?.failed.length)return;
    const report=importResult.failed.map(item=>({row:item.row,reference:item.identifier||item.employee_code||'-',reason:item.message}));
    downloadCsv(`${importResult.entity}_import_failures_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`,rowsToCsv(report));
  };
  const changeEntity=(value:string)=>{const next=value as ImportEntity;setEntity(next);setText(importSamples[next]);setRows([]);clearResult()};
  const guide=importGuidance[entity];
  return <div className="page-stack">
    <PageHeader eyebrow="CONTROLLED DATA LOADER" title="Import Center" description="Template hanya meminta data bisnis yang penting. ID, identity snapshot, status, dan field turunan dicari atau dihitung otomatis dari database." actions={<div className="import-toolbar"><Button variant="ghost" onClick={downloadTemplateCsv}><Download size={16}/> CSV Template</Button><Button variant="ghost" onClick={downloadTemplateExcel}><Download size={16}/> Excel Template</Button><Button variant="secondary" onClick={loadDemo}><Sparkles size={16}/> Load Correlated Demo</Button>{entity==='users'&&<><Button variant="secondary" onClick={exportUsersCsv} loading={exporting}><Download size={16}/> Export CSV</Button><Button variant="secondary" onClick={exportUsersExcel} loading={exporting}><Download size={16}/> Export Excel</Button></>}</div>}/>
    <div className="split-grid">
      <Card title="Import Configuration" subtitle="Import bersifat UPSERT. Penghapusan dilakukan dari menu administrasi khusus agar histori tetap aman.">
        <div className="import-guidance"><strong>{guide.title}</strong><span>{guide.description}</span><span><code>Resolved automatically</code> {guide.automatic}</span></div>
        <Field label="Entity"><Select value={entity} onChange={event=>changeEntity(event.target.value)}><option value="users">Users</option><option value="departments">Departments</option><option value="approval_matrix">Approval Matrix</option><option value="kpi_forms">KPI Forms</option><option value="kpi_points">KPI Points</option><option value="demo_approvals">Demo Approval Status</option></Select></Field>
        <Field label="Upload CSV or Excel File"><Input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={uploadFile}/></Field>
        <Field label="Data Preview / CSV Editor"><Textarea rows={18} value={text} onChange={event=>{setText(event.target.value);setRows([]);clearResult()}} placeholder={importSamples[entity]}/></Field>
        {rows.length>=10&&<div className="demo-banner"><Sparkles size={18}/><div><strong>Dummy dataset loaded</strong><span>Import order untuk demo penuh: Departments → Users → Approval Matrix → KPI Forms → KPI Points → Demo Approval Status.</span></div></div>}
        <div className="button-row"><Button variant="secondary" onClick={parse}><FileUp size={16}/> Parse & Validate</Button><Button onClick={run} loading={running} disabled={!rows.length}><Database size={16}/> Execute {rows.length} Rows</Button></div>{importProgress&&<div className="import-progress-note"><RefreshCw size={15}/><span>{importProgress}</span></div>}
      </Card>
      <Card title={`Preview · ${rows.length} rows`} subtitle="First 25 rows">{rows.length?<DataTable headers={Object.keys(rows[0]||{})}>{rows.slice(0,25).map((row,index)=><tr key={index}>{Object.keys(rows[0]).map(key=><td key={key}>{String(row[key]??'')}</td>)}</tr>)}</DataTable>:<EmptyState title="No parsed data" description="Upload CSV/Excel, paste CSV, or load the correlated demo dataset."/>}</Card>
    </div>
    {importResult&&<Card title="Import Result" subtitle={`Completed ${formatDateTime(importResult.completedAt)}`} action={importResult.failed.length?<Button variant="secondary" onClick={downloadFailureReport}><Download size={16}/> Download Failure Report</Button>:undefined}>
      <div className={`import-result-banner ${importResult.failed.length?'has-failure':'is-success'}`}>
        {importResult.failed.length?<AlertTriangle size={22}/>:<CheckCircle2 size={22}/>}<div><strong>{importResult.failed.length?'Import completed with validation errors':'Import completed successfully'}</strong><span>{importResult.failed.length?'Perbaiki baris di bawah, lalu upload ulang. Baris yang berhasil tidak perlu diulang jika memakai UPSERT.':'Seluruh baris berhasil diproses tanpa kegagalan.'}</span></div>
      </div>
      <div className="import-result-grid">
        <div><span>Requested</span><strong>{importResult.requested}</strong></div>
        {entity==='users'&&<><div><span>Created</span><strong>{importResult.created}</strong></div><div><span>Updated</span><strong>{importResult.updated}</strong></div></>}
        {entity!=='users'&&<div><span>Imported</span><strong>{importResult.imported}</strong></div>}
        <div className={importResult.failed.length?'result-failed':'result-ok'}><span>Failed</span><strong>{importResult.failed.length}</strong></div>
      </div>
      {importResult.failed.length?<div className="import-failure-section"><div className="import-failure-heading"><div><strong>Failed row details</strong><span>Nomor baris mengikuti file Excel/CSV, termasuk header pada baris pertama.</span></div><Badge tone="danger">{importResult.failed.length} FAILED</Badge></div><DataTable headers={['Row','Reference','Failure Reason']}>{importResult.failed.map((failure,index)=><tr key={`${failure.row}-${index}`}><td><b>{failure.row}</b></td><td>{failure.identifier||failure.employee_code||'-'}</td><td className="failure-reason">{failure.message}</td></tr>)}</DataTable></div>:<div className="import-success-note"><CheckCircle2 size={18}/><span>Database and Supabase Auth updates were completed successfully.</span></div>}
    </Card>}
  </div>
}

export function AuditAdminPage(){
  const[items,setItems]=useState<any[]>([]);const[search,setSearch]=useState('');const[loading,setLoading]=useState(true);const load=async()=>{setLoading(true);let q=supabase.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(500);const{data,error}=await q;if(error)toast.error(error.message);else setItems(data||[]);setLoading(false)};useEffect(()=>{load()},[]);const filtered=items.filter(x=>[x.actor_name,x.module,x.action,x.entity_table,x.result].join(' ').toLowerCase().includes(search.toLowerCase()));return <div className="page-stack"><PageHeader eyebrow="IMMUTABLE OPERATION TRACE" title="Audit Trail" description="Login, KPI, approval, admin mutation, reroute, import, and system operations." actions={<Button variant="secondary" onClick={load}><RefreshCw size={16}/> Refresh</Button>}/><Card action={<SearchInput value={search} onChange={setSearch} placeholder="Search audit..."/>}>{loading?<LoadingBlock/>:<DataTable headers={['Timestamp','Actor','Module','Action','Entity','Result']}>
    {filtered.map(x=><tr key={x.id}><td>{formatDateTime(x.created_at)}</td><td>{x.actor_name||'-'}</td><td><Badge tone="blue">{x.module}</Badge></td><td>{x.action}</td><td>{x.entity_table||'-'}</td><td><Badge tone={x.result==='SUCCESS'?'success':'danger'}>{x.result}</Badge></td></tr>)}
  </DataTable>}</Card></div>
}

export function HealthAdminPage(){
  const[data,setData]=useState<any>(null);const[loading,setLoading]=useState(false);const load=async()=>{setLoading(true);try{setData(await api('/api/admin/health'))}catch(e:any){toast.error(e.message)}finally{setLoading(false)}};useEffect(()=>{load()},[]);return <div className="page-stack"><PageHeader eyebrow="PLATFORM OBSERVABILITY" title="System Health" description="Connectivity and cardinality checks for the Cloudflare Worker and Supabase core tables." actions={<Button onClick={load} loading={loading}><Activity size={16}/> Run Health Check</Button>}/>{loading&&!data?<LoadingBlock/>:<><div className="health-hero"><HeartPulse/><div><strong>Platform Operational</strong><span>Last check: {formatDateTime(data?.timestamp)}</span></div><Badge tone="success">ONLINE</Badge></div><div className="metric-grid health-grid">{Object.entries(data?.counts||{}).map(([k,v])=><div className="metric-card metric-steel" key={k}><div className="metric-icon"><Database/></div><div><span>{k}</span><strong>{String(v??'-')}</strong><small>records</small></div></div>)}</div></>}</div>
}

export function SettingsAdminPage(){
  const[items,setItems]=useState<any[]>([]);const[key,setKey]=useState('COMPANY_NAME');const[value,setValue]=useState('PT Banshu Electric Indonesia');const[description,setDescription]=useState('Company name displayed in the application');const[saving,setSaving]=useState(false);const load=async()=>{const{data,error}=await supabase.from('system_settings').select('*').order('key');if(error)toast.error(error.message);else setItems(data||[])};useEffect(()=>{load()},[]);const save=async()=>{setSaving(true);try{await api('/api/admin/settings',{method:'POST',body:JSON.stringify({key,value,description})});toast.success('Setting saved.');load()}catch(e:any){toast.error(e.message)}finally{setSaving(false)}};return <div className="page-stack"><PageHeader eyebrow="SYSTEM CONFIGURATION" title="Settings" description="Non-secret runtime settings. Secrets remain in Cloudflare Worker secrets, never in the browser or database table."/><div className="split-grid"><Card title="Update Setting"><Field label="Key"><Input value={key} onChange={e=>setKey(e.target.value.toUpperCase())}/></Field><Field label="Value"><Textarea rows={5} value={value} onChange={e=>setValue(e.target.value)}/></Field><Field label="Description"><Input value={description} onChange={e=>setDescription(e.target.value)}/></Field><Button onClick={save} loading={saving}><Save size={16}/> Save Setting</Button></Card><Card title="Current Settings"><DataTable headers={['Key','Value','Updated']}>{items.map(x=><tr key={x.key}><td><b>{x.key}</b></td><td className="wide-cell">{x.value}</td><td>{formatDateTime(x.updated_at)}</td></tr>)}</DataTable></Card></div></div>
}
