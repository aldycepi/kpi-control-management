import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Factory, Fingerprint, Gauge, LockKeyhole,
  ShieldCheck, Sparkles, UserRound
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { loginWithIdentifier } from '../lib/api';
import { Button, Field, Input } from '../components/UI';

export function LoginPage() {
  const { session, refreshProfile } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);

  useEffect(() => {
    fetch('/api/setup/status', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) throw new Error(payload?.message || 'Setup status gagal diperiksa.');
        setNeedsSetup(Boolean(payload.needsSetup));
      })
      .catch((error) => toast.error(error.message))
      .finally(() => setSetupChecked(true));
  }, []);

  if (session) return <Navigate to="/" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await loginWithIdentifier(identifier.trim(), password);
      await refreshProfile();
      toast.success('Login berhasil. Selamat datang di KPI Control Center.');
    } catch (error: any) {
      toast.error(error.message || 'Login gagal.');
    } finally {
      setLoading(false);
    }
  };

  return <div className="login-page fluent-login">
    <section className="login-visual">
      <div className="visual-grid" />
      <div className="login-aurora login-aurora-one" />
      <div className="login-aurora login-aurora-two" />
      <div className="visual-content">
        <div className="industrial-chip"><Factory size={17}/> MANUFACTURING PERFORMANCE OS <span>V2</span></div>
        <div className="hero-kicker"><Sparkles size={16}/> Fluent Executive Industrial</div>
        <h1>Executive KPI<br/><span>Control Center</span></h1>
        <p>Satu pusat kendali untuk target, aktual, approval, evidence, dan visibilitas eksekutif. Bersih untuk manajemen, padat untuk operasi.</p>
        <div className="login-feature-grid">
          <div><ShieldCheck/><strong>Governed</strong><span>Role, scope, audit, RLS</span></div>
          <div><Gauge/><strong>Operational</strong><span>Queue, KPI, bottleneck</span></div>
          <div><BarChart3/><strong>Executive</strong><span>Power BI-style visibility</span></div>
        </div>
        <div className="plant-pulse">
          <div><i className="pulse-dot"/><span>Cloudflare Edge</span><b>Ready</b></div>
          <div><i className="pulse-dot"/><span>Supabase Core</span><b>Connected at runtime</b></div>
          <div><i className="pulse-dot amber"/><span>Manufacturing Flow</span><b>Controlled</b></div>
        </div>
      </div>
      <div className="assembly-line"><span/><span/><span/><span/><span/></div>
    </section>

    <section className="login-panel">
      <div className="login-panel-orb" />
      <form className="login-card fluent-glass" onSubmit={submit}>
        <div className="login-brand">
          <div className="logo-shell"><img src="/brand/banshu-logo.png" alt="Banshu"/></div>
          <div><strong>PT BANSHU ELECTRIC INDONESIA</strong><span>Executive KPI Manufacturing</span></div>
        </div>

        <div className="login-heading">
          <span><Fingerprint size={14}/> SECURE ACCESS</span>
          <h2>Masuk ke Control Center</h2>
          <p>Gunakan username, employee code, atau email.</p>
        </div>

        {setupChecked && needsSetup && <a className="setup-link" href="/setup">
          Database baru terdeteksi. Buat administrator pertama <ArrowRight size={16}/>
        </a>}

        <Field label="User Identifier">
          <div className="input-icon"><UserRound size={18}/><Input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="username / employee code / email" required/></div>
        </Field>
        <Field label="Password">
          <div className="input-icon"><LockKeyhole size={18}/><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6}/></div>
        </Field>
        <Button type="submit" loading={loading} className="login-submit">Sign In <ArrowRight size={17}/></Button>
        <div className="login-footnote"><i/> Supabase Auth · PostgreSQL RLS · Cloudflare Worker</div>
      </form>
    </section>
  </div>;
}
