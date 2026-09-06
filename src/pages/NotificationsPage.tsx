import { useEffect, useState } from 'react';
import { Bell, CheckCheck, ExternalLink, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import type { NotificationItem } from '../lib/types';
import { formatDateTime } from '../lib/utils';
import { Badge, Button, Card, EmptyState, LoadingBlock, PageHeader } from '../components/UI';

export function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) toast.error(error.message); else setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markAll = async () => {
    const { error } = await supabase.rpc('mark_all_notifications_read_v2');
    if (error) toast.error(error.message); else { toast.success('Semua notifikasi ditandai dibaca.'); load(); }
  };

  const mark = async (id: string) => {
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    if (error) toast.error(error.message); else load();
  };

  const openApproval = (item: NotificationItem) => {
    if (!item.form_id) return;
    navigate(`/approvals?form=${encodeURIComponent(item.form_id)}&notification=${encodeURIComponent(item.id)}`);
  };

  return <div className="page-stack">
    <PageHeader eyebrow="PERSONAL ACTION SIGNALS" title="Notification Center" description="Approval requests can be opened directly. The notification is marked read automatically after the related approval document opens successfully." actions={<><Button variant="ghost" onClick={markAll}><CheckCheck size={16}/> Mark All Read</Button><Button variant="secondary" onClick={load}><RefreshCw size={16}/> Refresh</Button></>}/>
    <Card>
      {loading ? <LoadingBlock/> : items.length ? <div className="notification-list">
        {items.map((item) => {
          const canOpenApproval = Boolean(item.form_id && item.type === 'APPROVAL_PENDING');
          return <div key={item.id} className={item.read_at ? '' : 'unread'}>
            <div className="notif-icon"><Bell/></div>
            <div>
              <div className="notif-title-row"><strong>{item.title}</strong><Badge tone={item.priority === 'CRITICAL' || item.priority === 'HIGH' ? 'danger' : 'blue'}>{item.priority}</Badge></div>
              <p>{item.message}</p>
              <span>{item.type} · {formatDateTime(item.created_at)}</span>
            </div>
            <div className="notification-actions">
              {canOpenApproval && <Button variant="secondary" onClick={() => openApproval(item)}><ExternalLink size={15}/> Open Approval</Button>}
              {!item.read_at && <Button variant="ghost" onClick={() => mark(item.id)}>Mark Read</Button>}
            </div>
          </div>;
        })}
      </div> : <EmptyState title="Tidak ada notifikasi" description="Semua tenang. Control center tidak memiliki sinyal baru."/>}
    </Card>
  </div>;
}
