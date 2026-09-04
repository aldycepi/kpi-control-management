import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AlertTriangle, CloudCog, RefreshCw } from 'lucide-react';
import { Toaster } from 'sonner';
import { App } from './app/App';
import { AuthProvider } from './contexts/AuthContext';
import { loadRuntimeConfig, RuntimeConfigurationError } from './lib/runtime';
import { configureSupabase } from './lib/supabase';
import './styles.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

function ConfigurationScreen({ error }: { error: RuntimeConfigurationError }) {
  return <div className="bootstrap-page">
    <div className="bootstrap-orb bootstrap-orb-one" />
    <div className="bootstrap-orb bootstrap-orb-two" />
    <section className="bootstrap-card fluent-glass">
      <img src="/brand/banshu-logo.png" alt="Banshu" className="bootstrap-logo" />
      <div className="bootstrap-icon"><CloudCog size={28}/></div>
      <span className="eyebrow">RUNTIME CONFIGURATION</span>
      <h1>Cloudflare belum terhubung ke Supabase</h1>
      <p>{error.message}</p>
      {error.missing.length > 0 && <div className="config-missing-list">
        <strong>Tambahkan runtime variables berikut:</strong>
        {error.missing.map((item) => <code key={item}>{item}</code>)}
      </div>}
      <div className="bootstrap-help">
        <AlertTriangle size={18}/>
        <span>Masukkan variables di Cloudflare Worker → Settings → Variables and Secrets, lalu klik Save and Deploy. Tidak perlu build ulang frontend.</span>
      </div>
      <button className="btn btn-primary" onClick={() => window.location.reload()}><RefreshCw size={16}/> Coba Lagi</button>
    </section>
  </div>;
}

async function bootstrap() {
  try {
    const config = await loadRuntimeConfig();
    configureSupabase(config);
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <AuthProvider>
            <App />
            <Toaster richColors position="top-right" closeButton />
          </AuthProvider>
        </BrowserRouter>
      </React.StrictMode>
    );
  } catch (error) {
    const runtimeError = error instanceof RuntimeConfigurationError
      ? error
      : new RuntimeConfigurationError(error instanceof Error ? error.message : 'Bootstrap aplikasi gagal.');
    root.render(<ConfigurationScreen error={runtimeError}/>);
  }
}

bootstrap();
