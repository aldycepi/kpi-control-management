import { useEffect, useState } from 'react';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import type { NotificationItem } from '../lib/types';
import { formatDateTime } from '../lib/utils';
import { Badge, Button, Card, EmptyState, LoadingBlock, PageHeader } from '../components/UI';

export function NotificationsPage() {
  const [items,setItems]=useState<NotificationItem[]>([]); const [loading,setLoading]=useState(true);
  const load=async()=>{setLoading(true);const{data,error}=await supabase.from('notifications').select('*').order('created_at',{ascending:false}).limit(200);if(error)toast.error(error.message);else setItems(data||[]);setLoading(false)};
  useEffect(()=>{load()},[]);
  const markAll=async()=>{const{error}=await supabase.rpc('mark_all_notifications_read_v2');if(error)toast.error(error.message);else{toast.success('Semua notifikasi ditandai dibaca.');load()}};
  const mark=async(id:string)=>{const{error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id);if(error)toast.error(error.message);else load()};
  return <div className="page-stack"><PageHeader eyebrow="PERSONAL ACTION SIGNALS" title="Notification Center" description="Approval requests, progress updates, system alerts, and KPI status changes." actions={<><Button variant="ghost" onClick={markAll}><CheckCheck size={16}/> Mark All Read</Button><Button variant="secondary" onClick={load}><RefreshCw size={16}/> Refresh</Button></>}/><Card>{loading?<LoadingBlock/>:items.length?<div className="notification-list">{items.map(x=><div key={x.id} className={x.read_at?'':'unread'}><div className="notif-icon"><Bell/></div><div><div className="notif-title-row"><strong>{x.title}</strong><Badge tone={x.priority==='CRITICAL'||x.priority==='HIGH'?'danger':'blue'}>{x.priority}</Badge></div><p>{x.message}</p><span>{x.type} · {formatDateTime(x.created_at)}</span></div>{!x.read_at&&<Button variant="ghost" onClick={()=>mark(x.id)}>Mark Read</Button>}</div>)}</div>:<EmptyState title="Tidak ada notifikasi" description="Semua tenang. Control center tidak memiliki sinyal baru."/>}</Card></div>;
}
