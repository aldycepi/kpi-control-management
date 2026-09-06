import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ensureValidSession } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button, Field, Input } from '../components/UI';

export function ChangePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const { refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) { toast.error('Password minimal 8 karakter.'); return; }
    if (password !== confirm) { toast.error('Konfirmasi password tidak sama.'); return; }

    setSaving(true);
    try {
      await ensureValidSession(false);

      // Password is changed by the signed-in user, which is the supported
      // Supabase flow. The Worker only clears the application-side flag.
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) {
        if (passwordError.code === 'reauthentication_needed') {
          throw new Error('Supabase meminta login ulang sebelum password dapat diubah. Silakan logout, login kembali memakai password sementara, lalu ulangi perubahan password.');
        }
        throw new Error(passwordError.message || 'Gagal mengubah password Supabase Auth.');
      }

      // Refresh when possible so the next Worker request uses a fresh JWT.
      await supabase.auth.refreshSession().catch(() => undefined);
      await api('/api/me/password-complete', { method: 'POST', body: JSON.stringify({}) });
      await refreshProfile();

      toast.success('Password berhasil diperbarui.');
      navigate('/', { replace: true });
    } catch (error: any) {
      const message = error?.message || 'Gagal mengubah password.';
      toast.error(message);
      if (message.toLowerCase().includes('session tidak valid') || message.toLowerCase().includes('login kembali')) {
        await signOut().catch(() => undefined);
        navigate('/login', { replace: true });
      }
    } finally {
      setSaving(false);
    }
  };

  return <div className="password-reset-page">
    <form className="password-reset-card" onSubmit={submit}>
      <div className="brand-emblem large"><KeyRound/></div>
      <span className="eyebrow">OPTIONAL SECURITY</span>
      <h1>Change Your Password</h1>
      <p>Ubah password kapan saja sesuai kebutuhan keamanan akun Anda.</p>
      <Field label="New Password"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required/></Field>
      <Field label="Confirm Password"><Input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={8} autoComplete="new-password" required/></Field>
      <Button type="submit" loading={saving}><ShieldCheck size={17}/> Update Password</Button>
    </form>
  </div>;
}
