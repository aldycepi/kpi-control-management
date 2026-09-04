export const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const formatNumber = (value: number | null | undefined, digits = 0) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value || 0));

export const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};

export const monthLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
};

export const roleLabel = (role?: string | null) => ({
  STAFF: 'Staff', LEADER: 'Leader', ASSMAN: 'Assistant Manager', PLANT_MANAGER: 'Plant Manager',
  GENERAL_MANAGER: 'General Manager', BOD_KI: 'BOD KI', BOD_BEI: 'BOD BEI', ADMIN: 'Administrator'
}[role || ''] || role || '-');

export const statusTone = (status?: string | null) => {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  if (status === 'DRAFT') return 'neutral';
  if (status === 'NOT_SUBMITTED') return 'danger';
  return 'warning';
};

export const cn = (...items: Array<string | false | null | undefined>) => items.filter(Boolean).join(' ');
