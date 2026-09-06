import { useEffect, useState } from 'react';
import { CalendarDays, GraduationCap, KeyRound, Save, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { api, ensureValidSession } from '../lib/api';
import { supabase } from '../lib/supabase';
import { roleLabel } from '../lib/utils';
import { Button, Card, Field, Input, PageHeader } from '../components/UI';

export function PersonalSettingsPage() {
  const { user, refreshProfile, signOut } = useAuth();
  const [departmentName, setDepartmentName] = useState('-');
  const [profile, setProfile] = useState({ full_name: '', academic: '', join_date: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setProfile({
      full_name: user?.full_name || '',
      academic: user?.academic || '',
      join_date: user?.join_date || ''
    });
  }, [user]);

  useEffect(() => {
    if (!user?.department_id) {
      setDepartmentName('Corporate / No Department');
      return;
    }
    supabase.from('departments').select('department_name').eq('id', user.department_id).maybeSingle()
      .then(({ data }) => setDepartmentName(data?.department_name || '-'));
  }, [user?.department_id]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile.full_name.trim()) { toast.error('Nama lengkap wajib diisi.'); return; }
    setSavingProfile(true);
    try {
      await api('/api/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: profile.full_name.trim(),
          academic: profile.academic.trim() || null,
          join_date: profile.join_date || null
        })
      });
      await refreshProfile();
      toast.success('Informasi pribadi berhasil diperbarui.');
    } catch (error: any) {
      toast.error(error.message || 'Gagal memperbarui profil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) { toast.error('Password minimal 8 karakter.'); return; }
    if (password !== confirm) { toast.error('Konfirmasi password tidak sama.'); return; }
    setSavingPassword(true);
    try {
      await ensureValidSession(false);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (error.code === 'reauthentication_needed') throw new Error('Supabase meminta login ulang sebelum password dapat diubah. Silakan logout dan login kembali, lalu ulangi perubahan password.');
        throw new Error(error.message || 'Gagal mengubah password.');
      }
      await supabase.auth.refreshSession().catch(() => undefined);
      await api('/api/me/password-complete', { method: 'POST', body: JSON.stringify({}) });
      await refreshProfile();
      setPassword('');
      setConfirm('');
      toast.success('Password berhasil diperbarui.');
    } catch (error: any) {
      const message = error?.message || 'Gagal mengubah password.';
      toast.error(message);
      if (message.toLowerCase().includes('session tidak valid')) await signOut().catch(() => undefined);
    } finally {
      setSavingPassword(false);
    }
  };

  return <div className="page-stack">
    <PageHeader eyebrow="PERSONAL ACCOUNT" title="My Settings" description="Kelola informasi pribadi dan password secara fleksibel. Department, jabatan, role, dan identitas kerja tetap dikendalikan administrator."/>
    <div className="settings-profile-grid">
      <Card title="Personal Information" subtitle="Informasi yang dapat Anda perbarui sendiri.">
        <form className="settings-form" onSubmit={saveProfile}>
          <div className="settings-section-title"><UserRound size={18}/><div><strong>Profile</strong><span>Personal data used on KPI documents.</span></div></div>
          <div className="form-grid two">
            <Field label="Full Name"><Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} required/></Field>
            <Field label="Employee Code"><Input value={user?.employee_code || ''} disabled/></Field>
            <Field label="Education / Academic"><div className="input-icon"><GraduationCap size={17}/><Input value={profile.academic} onChange={(e) => setProfile({ ...profile, academic: e.target.value })} placeholder="Contoh: S1 Teknik Industri"/></div></Field>
            <Field label="Join Date"><div className="input-icon"><CalendarDays size={17}/><Input type="date" value={profile.join_date} onChange={(e) => setProfile({ ...profile, join_date: e.target.value })}/></div></Field>
          </div>
          <div className="account-readonly-grid">
            <div><span>Username</span><strong>{user?.username || '-'}</strong></div>
            <div><span>Email</span><strong>{user?.email || '-'}</strong></div>
            <div><span>Department</span><strong>{departmentName}</strong></div>
            <div><span>Section</span><strong>{user?.section || '-'}</strong></div>
            <div><span>Position</span><strong>{user?.position_name || '-'}</strong></div>
            <div><span>Role</span><strong>{roleLabel(user?.role_code)}</strong></div>
          </div>
          <div className="settings-actions"><Button type="submit" loading={savingProfile}><Save size={16}/> Save Personal Information</Button></div>
        </form>
      </Card>

      <Card title="Password & Security" subtitle="Perubahan password bersifat opsional dan dapat dilakukan kapan saja.">
        <form className="settings-form" onSubmit={changePassword}>
          <div className="settings-section-title"><KeyRound size={18}/><div><strong>Change Password</strong><span>Tidak ada kewajiban mengganti password setelah login.</span></div></div>
          <Field label="New Password" hint="Minimal 8 karakter."><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan password baru" minLength={8} required/></Field>
          <Field label="Confirm New Password"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Ulangi password baru" minLength={8} required/></Field>
          <div className="settings-security-note"><ShieldCheck size={17}/><span>Password tidak pernah disimpan di tabel aplikasi; perubahan diproses melalui Supabase Authentication.</span></div>
          <div className="settings-actions"><Button type="submit" loading={savingPassword}><KeyRound size={16}/> Update Password</Button></div>
        </form>
      </Card>
    </div>
  </div>;
}
