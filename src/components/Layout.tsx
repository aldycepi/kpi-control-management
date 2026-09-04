import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity, Archive, Bell, Building2, ChevronRight, ClipboardCheck, Factory,
  FileSpreadsheet, Gauge, HeartPulse, LayoutDashboard, LogOut, Menu, Network,
  PanelLeftClose, PanelLeftOpen, RefreshCw, Settings, ShieldCheck, Users, X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { cn, roleLabel } from '../lib/utils';
import { supabase } from '../lib/supabase';

const mainItems = [
  { to: '/', label: 'Executive Dashboard', icon: LayoutDashboard },
  { to: '/my-kpi', label: 'My KPI Workspace', icon: Gauge },
  { to: '/approvals', label: 'Approval Queue', icon: ClipboardCheck },
  { to: '/monitoring', label: 'Not Submitted', icon: Activity },
  { to: '/archive', label: 'Archive & Explorer', icon: Archive },
  { to: '/notifications', label: 'Notifications', icon: Bell }
];

const adminItems = [
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/departments', label: 'Departments', icon: Building2 },
  { to: '/admin/matrix', label: 'Approval Matrix', icon: Network },
  { to: '/admin/reroute', label: 'Scoped Reroute', icon: RefreshCw },
  { to: '/admin/import', label: 'Import Center', icon: FileSpreadsheet },
  { to: '/admin/audit', label: 'Audit Trail', icon: ShieldCheck },
  { to: '/admin/health', label: 'System Health', icon: HeartPulse },
  { to: '/admin/settings', label: 'Settings', icon: Settings }
];

const pageLabels: Record<string, string> = {
  '/': 'Executive Dashboard',
  '/my-kpi': 'My KPI Workspace',
  '/approvals': 'Approval Queue',
  '/monitoring': 'Submission Monitoring',
  '/archive': 'Archive & Explorer',
  '/notifications': 'Notifications',
  '/admin/users': 'User Administration',
  '/admin/departments': 'Department Master',
  '/admin/matrix': 'Approval Matrix',
  '/admin/reroute': 'Scoped Reroute',
  '/admin/import': 'Import Center',
  '/admin/audit': 'Audit Trail',
  '/admin/health': 'System Health',
  '/admin/settings': 'System Settings'
};

export function AppLayout() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('banshu-sidebar-collapsed') === 'true');
  const [unread, setUnread] = useState(0);
  const location = useLocation();
  const currentTitle = useMemo(() => pageLabels[location.pathname] || 'KPI Control Center', [location.pathname]);

  useEffect(() => setOpen(false), [location.pathname]);
  const toggleSidebar = () => setCollapsed((current) => {
    const next = !current;
    localStorage.setItem('banshu-sidebar-collapsed', String(next));
    return next;
  });
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).is('read_at', null);
      setUnread(count || 0);
    };
    load();
    const channel = supabase.channel(`notif-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return <div className={cn('app-shell fluent-app', collapsed && 'sidebar-collapsed')}>
    <aside className={cn('sidebar fluent-sidebar', open && 'sidebar-open', collapsed && 'is-collapsed')}>
      <div className="brand-panel">
        <div className="sidebar-logo"><img src="/brand/banshu-icon.png" alt="Banshu"/></div>
        <div className="brand-copy"><strong>BANSHU KPI</strong><span>Manufacturing Control OS</span></div>
        <button className="sidebar-collapse-toggle" onClick={toggleSidebar} title={collapsed ? 'Expand sidebar' : 'Minimize sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}>{collapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button>
        <button className="mobile-close" onClick={() => setOpen(false)}><X /></button>
      </div>

      <div className="sidebar-context">
        <div className="context-icon"><Factory size={18}/></div>
        <div className="context-copy"><span>Plant environment</span><strong>Production · Online</strong></div>
        <i/>
      </div>

      <nav className="nav-scroll">
        <p className="nav-section">CONTROL CENTER</p>
        {mainItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('nav-item', isActive && 'active')} title={collapsed ? label : undefined}>
          <span className="nav-icon"><Icon size={18}/></span><span className="nav-label">{label}</span>
          {label === 'Notifications' && unread > 0 ? <b className="nav-count">{Math.min(unread, 99)}</b> : <ChevronRight className="nav-chevron" size={14}/>} 
        </NavLink>)}

        {user?.role_code === 'ADMIN' && <>
          <p className="nav-section">ADMINISTRATION</p>
          {adminItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => cn('nav-item', isActive && 'active')} title={collapsed ? label : undefined}>
            <span className="nav-icon"><Icon size={18}/></span><span className="nav-label">{label}</span><ChevronRight className="nav-chevron" size={14}/>
          </NavLink>)}
        </>}
      </nav>

      <div className="sidebar-footer">
        <div className="user-avatar">{user?.full_name?.slice(0, 2).toUpperCase()}</div>
        <div className="user-meta"><strong>{user?.full_name}</strong><span>{roleLabel(user?.role_code)} · {user?.section || 'Corporate'}</span></div>
        <button className="icon-btn dark" onClick={signOut} title="Logout"><LogOut size={17}/></button>
      </div>
    </aside>

    {open && <div className="mobile-overlay" onClick={() => setOpen(false)} />}

    <main className="main-shell">
      <header className="topbar fluent-topbar">
        <button className="icon-btn mobile-menu" onClick={() => setOpen(true)}><Menu /></button>
        <div className="topbar-title"><span>PT BANSHU ELECTRIC INDONESIA</span><strong>{currentTitle}</strong></div>
        <div className="topbar-actions">
          <NavLink to="/notifications" className="icon-btn notif-btn"><Bell size={18}/>{unread > 0 && <span>{Math.min(unread, 99)}</span>}</NavLink>
          <div className="factory-status"><i></i><span>System Online</span></div>
        </div>
      </header>
      <div className="content"><Outlet /></div>
    </main>
  </div>;
}
