import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { LoaderCircle, Search } from 'lucide-react';
import { cn, statusTone } from '../lib/utils';

export function Button({ className, variant = 'primary', loading, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'secondary'|'ghost'|'danger'|'success'; loading?: boolean }) {
  return <button className={cn('btn', `btn-${variant}`, className)} disabled={loading || props.disabled} {...props}>
    {loading && <LoaderCircle size={16} className="spin" />}{children}
  </button>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('input', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('input', className)} {...props}>{children}</select>;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('input textarea', className)} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

export function Card({ title, subtitle, action, className, children }: { title?: string; subtitle?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return <section className={cn('card', className)}>
    {(title || subtitle || action) && <header className="card-header"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</header>}
    <div className="card-body">{children}</div>
  </section>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div><div className="page-actions">{actions}</div></div>;
}

export function Badge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <span className={cn('badge', `badge-${tone || statusTone(String(children))}`)}>{children}</span>;
}

export function MetricCard({ label, value, detail, icon, tone = 'blue' }: { label: string; value: React.ReactNode; detail?: React.ReactNode; icon: React.ReactNode; tone?: 'blue'|'green'|'amber'|'red'|'steel' }) {
  return <div className={cn('metric-card', `metric-${tone}`)}><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div></div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-mark">◇</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function LoadingBlock({ label = 'Memuat data...' }: { label?: string }) {
  return <div className="loading-block"><LoaderCircle className="spin" /><span>{label}</span></div>;
}

export function SearchInput({ value, onChange, placeholder = 'Cari...' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="search-input"><Search size={17} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>;
}

export function Modal({ open, title, onClose, footer, children, wide = false }: { open: boolean; title: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={onClose}><div className={cn('modal', wide && 'modal-wide')} onMouseDown={(e) => e.stopPropagation()}>
    <div className="modal-header"><h2>{title}</h2><button className="icon-btn" onClick={onClose}>×</button></div>
    <div className="modal-body">{children}</div>
    {footer && <div className="modal-footer">{footer}</div>}
  </div></div>;
}

export function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="table-wrap"><table><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
