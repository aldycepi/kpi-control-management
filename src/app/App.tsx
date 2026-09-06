import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AppLayout } from '../components/Layout';
import { LoadingBlock } from '../components/UI';

const LoginPage = lazy(() => import('../pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const SetupPage = lazy(() => import('../pages/SetupPage').then((module) => ({ default: module.SetupPage })));
const DashboardPage = lazy(() => import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const MyKpiPage = lazy(() => import('../pages/MyKpiPage').then((module) => ({ default: module.MyKpiPage })));
const ApprovalPage = lazy(() => import('../pages/ApprovalPage').then((module) => ({ default: module.ApprovalPage })));
const MonitoringPage = lazy(() => import('../pages/MonitoringPage').then((module) => ({ default: module.MonitoringPage })));
const ArchivePage = lazy(() => import('../pages/ArchivePage').then((module) => ({ default: module.ArchivePage })));
const NotificationsPage = lazy(() => import('../pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })));
const PersonalSettingsPage = lazy(() => import('../pages/PersonalSettingsPage').then((module) => ({ default: module.PersonalSettingsPage })));
const UsersAdminPage = lazy(() => import('../pages/AdminPages').then((module) => ({ default: module.UsersAdminPage })));
const DepartmentsAdminPage = lazy(() => import('../pages/AdminPages').then((module) => ({ default: module.DepartmentsAdminPage })));
const MatrixAdminPage = lazy(() => import('../pages/AdminPages').then((module) => ({ default: module.MatrixAdminPage })));
const RerouteAdminPage = lazy(() => import('../pages/AdminPages').then((module) => ({ default: module.RerouteAdminPage })));
const ImportAdminPage = lazy(() => import('../pages/AdminPages').then((module) => ({ default: module.ImportAdminPage })));
const AuditAdminPage = lazy(() => import('../pages/AdminPages').then((module) => ({ default: module.AuditAdminPage })));
const HealthAdminPage = lazy(() => import('../pages/AdminPages').then((module) => ({ default: module.HealthAdminPage })));
const SettingsAdminPage = lazy(() => import('../pages/AdminPages').then((module) => ({ default: module.SettingsAdminPage })));

function Protected() {
  const { session, loading } = useAuth();
  if (loading) return <div className="full-loading"><LoadingBlock label="Initializing control center..."/></div>;
  if (!session) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user?.role_code === 'ADMIN' ? children : <Navigate to="/" replace />;
}


export function App() {
  return <Suspense fallback={<div className="full-loading"><LoadingBlock label="Loading application module..."/></div>}>
    <Routes>
      <Route path="/login" element={<LoginPage/>}/>
      <Route path="/setup" element={<SetupPage/>}/>
      <Route element={<Protected/>}>
        <Route index element={<DashboardPage/>}/>
        <Route path="my-kpi" element={<MyKpiPage/>}/>
        <Route path="approvals" element={<ApprovalPage/>}/>
        <Route path="monitoring" element={<MonitoringPage/>}/>
        <Route path="archive" element={<ArchivePage/>}/>
        <Route path="notifications" element={<NotificationsPage/>}/>
        <Route path="settings" element={<PersonalSettingsPage/>}/>
        <Route path="change-password" element={<Navigate to="/settings" replace/>}/>
        <Route path="admin/users" element={<AdminRoute><UsersAdminPage/></AdminRoute>}/>
        <Route path="admin/departments" element={<AdminRoute><DepartmentsAdminPage/></AdminRoute>}/>
        <Route path="admin/matrix" element={<AdminRoute><MatrixAdminPage/></AdminRoute>}/>
        <Route path="admin/reroute" element={<AdminRoute><RerouteAdminPage/></AdminRoute>}/>
        <Route path="admin/import" element={<AdminRoute><ImportAdminPage/></AdminRoute>}/>
        <Route path="admin/audit" element={<AdminRoute><AuditAdminPage/></AdminRoute>}/>
        <Route path="admin/health" element={<AdminRoute><HealthAdminPage/></AdminRoute>}/>
        <Route path="admin/settings" element={<AdminRoute><SettingsAdminPage/></AdminRoute>}/>
      </Route>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  </Suspense>;
}
