import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Field, Input } from '../components/UI';

export function SetupPage() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    setupToken: '',
    email: '',
    password: '',
    employeeCode: 'ADMIN001',
    username: 'admin',
    fullName: 'System Administrator'
  });

  useEffect(() => {
    fetch('/api/setup/status', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) throw new Error(payload?.message || 'Status setup gagal diperiksa.');
        setNeedsSetup(Boolean(payload.needsSetup));
      })
      .catch((error) => {
        toast.error(error.message);
        setNeedsSetup(false);
      });
  }, []);

  if (needsSetup === false) return <Navigate to="/login" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/setup/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Setup-Token': form.setupToken },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Setup gagal.');
      toast.success('Administrator pertama berhasil dibuat.');
      setNeedsSetup(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return <div className="setup-page">
    <div className="bootstrap-orb bootstrap-orb-one" />
    <div className="bootstrap-orb bootstrap-orb-two" />
    <form className="setup-card" onSubmit={submit}>
      <img src="/brand/banshu-logo.png" alt="Banshu" className="bootstrap-logo"/>
      <div className="bootstrap-icon"><ShieldCheck/></div>
      <span className="eyebrow">INITIAL COMMISSIONING</span>
      <h1>Bootstrap First Administrator</h1>
      <p>Form ini hanya aktif ketika database user masih kosong. Setup token harus sama dengan secret <code>SETUP_TOKEN</code>. Cloudflare <code>SUPABASE_SERVICE_ROLE_KEY</code> wajib memakai Legacy service_role JWT yang diawali <code>eyJ</code>, bukan <code>sb_secret_</code>.</p>
      <div className="form-grid two">
        <Field label="Setup Token"><Input type="password" value={form.setupToken} onChange={(e) => setForm({ ...form, setupToken: e.target.value })} required/></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required/></Field>
        <Field label="Password"><Input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required/></Field>
        <Field label="Employee Code"><Input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} required/></Field>
        <Field label="Username"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required/></Field>
        <Field label="Full Name"><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required/></Field>
      </div>
      <Button type="submit" loading={loading}><KeyRound size={17}/> Create First Administrator</Button>
    </form>
  </div>;
}
