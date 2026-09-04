import type { ApprovalHistory, KpiForm, KpiPoint } from './types';
import { ensureValidSession } from './api';

export type OfficialPrintDetail = {
  form: KpiForm;
  points: KpiPoint[];
  history: ApprovalHistory[];
  profile?: { academic?: string | null; join_date?: string | null } | null;
};

async function fetchPreviewPdf(formId: string, forceRefresh = false): Promise<Blob> {
  const session = await ensureValidSession(forceRefresh);
  const response = await fetch(`/api/forms/${encodeURIComponent(formId)}/print-preview`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${session.access_token}` }
  });

  if (response.status === 401 && !forceRefresh) {
    return fetchPreviewPdf(formId, true);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || `Browser Print gagal. HTTP ${response.status}`);
  }

  return response.blob();
}

/**
 * Print the compact one-page KPI layout without using window.open().
 * A hidden same-origin PDF iframe avoids popup blockers and guarantees that
 * Browser Print uses the same compact one-page layout as Official PDF.
 */
export async function printOfficialKpi(formId: string): Promise<void> {
  if (!formId) throw new Error('Form ID tidak tersedia.');

  const blob = await fetchPreviewPdf(formId);
  const objectUrl = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.src = objectUrl;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    URL.revokeObjectURL(objectUrl);
    iframe.remove();
  };

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Dokumen print terlalu lama dimuat. Coba ulangi Browser Print.'));
    }, 30000);

    iframe.onload = () => {
      window.clearTimeout(timeout);
      window.setTimeout(() => {
        try {
          const frameWindow = iframe.contentWindow;
          if (!frameWindow) throw new Error('Print frame tidak tersedia.');
          frameWindow.focus();
          frameWindow.print();
          resolve();
          window.setTimeout(cleanup, 120000);
        } catch (error) {
          cleanup();
          reject(error);
        }
      }, 900);
    };

    iframe.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(new Error('PDF preview tidak dapat dimuat.'));
    };

    document.body.appendChild(iframe);
  });
}
