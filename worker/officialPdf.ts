import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { createQrMatrix } from './qrMatrix';

export type PdfActor = {
  full_name?: string | null;
  role_code?: string | null;
};

export type OfficialPdfDetail = {
  form?: Record<string, any>;
  points?: Array<Record<string, any>>;
  history?: Array<Record<string, any>>;
  profile?: { academic?: string | null; join_date?: string | null } | null;
};

export type OfficialPdfOptions = {
  logoBytes?: Uint8Array | null;
};

type Signer = {
  name: string;
  role: string;
  action: string;
  createdAt: string | null;
  signatureToken: string | null;
};

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN_X = 27;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const MAX_POINTS = 22;

const BLACK = rgb(0.03, 0.03, 0.035);
const WHITE = rgb(1, 1, 1);
const TEXT = rgb(0.08, 0.09, 0.1);
const MUTED = rgb(0.34, 0.36, 0.39);
const BORDER = rgb(0.43, 0.45, 0.47);
const LIGHT_BORDER = rgb(0.72, 0.74, 0.76);
const LIGHT_BLUE = rgb(0.70, 0.87, 0.96);
const SOFT_GREY = rgb(0.965, 0.968, 0.972);
const SIGNED_GREY = rgb(0.92, 0.93, 0.94);
const DRAFT_RED = rgb(0.68, 0.08, 0.08);

function safeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

function isoDate(value: unknown, short = false): string {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: short ? '2-digit' : 'short', year: 'numeric', timeZone: 'UTC'
  }).format(parsed);
}

function monthLabel(periodKey: unknown): string {
  const raw = String(periodKey || '').trim();
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) return raw || '-';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function numberText(value: unknown, digits = 2): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : '-';
}

function topY(top: number, height = 0): number {
  return PAGE_HEIGHT - top - height;
}

function drawTopRect(
  page: PDFPage,
  x: number,
  top: number,
  width: number,
  height: number,
  options: { color?: ReturnType<typeof rgb>; borderColor?: ReturnType<typeof rgb>; borderWidth?: number; opacity?: number } = {}
) {
  page.drawRectangle({
    x,
    y: topY(top, height),
    width,
    height,
    color: options.color,
    borderColor: options.borderColor,
    borderWidth: options.borderWidth,
    opacity: options.opacity
  });
}

function wrapText(font: PDFFont, raw: unknown, width: number, fontSize: number, maxLines = 3): string[] {
  const text = safeText(raw) || '-';
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= width || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && lines.join(' ').length < text.length) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && font.widthOfTextAtSize(`${last}...`, fontSize) > width) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}...`;
  }
  return lines.length ? lines : ['-'];
}

function drawCellText(
  page: PDFPage,
  font: PDFFont,
  raw: unknown,
  x: number,
  top: number,
  width: number,
  height: number,
  options: {
    fontSize?: number;
    minFontSize?: number;
    maxLines?: number;
    align?: 'left' | 'center' | 'right';
    color?: ReturnType<typeof rgb>;
    padding?: number;
  } = {}
) {
  const padding = options.padding ?? 3;
  const minSize = options.minFontSize ?? 4.1;
  let size = options.fontSize ?? 6;
  const maxLines = options.maxLines ?? 2;
  let lines = wrapText(font, raw, width - padding * 2, size, maxLines);
  const maxHeight = height - 2;
  while (size > minSize && lines.length * (size + 1.15) > maxHeight) {
    size -= 0.2;
    lines = wrapText(font, raw, width - padding * 2, size, maxLines);
  }
  const lineHeight = size + 1.15;
  const blockHeight = lines.length * lineHeight;
  const firstTop = top + Math.max(1.2, (height - blockHeight) / 2);
  lines.forEach((line, index) => {
    const textWidth = font.widthOfTextAtSize(line, size);
    const align = options.align ?? 'left';
    const tx = align === 'center'
      ? x + (width - textWidth) / 2
      : align === 'right'
        ? x + width - padding - textWidth
        : x + padding;
    page.drawText(line, {
      x: Math.max(x + padding, tx),
      y: PAGE_HEIGHT - firstTop - size - index * lineHeight,
      size,
      font,
      color: options.color ?? TEXT
    });
  });
}

function drawInfoLine(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  label: string,
  value: unknown,
  x: number,
  top: number,
  width: number,
  height: number
) {
  const labelWidth = Math.min(82, width * 0.31);
  page.drawText(label, { x, y: PAGE_HEIGHT - top - 11, size: 6.2, font: regular, color: TEXT });
  page.drawText(':', { x: x + labelWidth - 8, y: PAGE_HEIGHT - top - 11, size: 6.2, font: regular, color: TEXT });
  drawCellText(page, bold, value, x + labelWidth, top, width - labelWidth, height, {
    fontSize: 6.5,
    minFontSize: 4.8,
    maxLines: 1,
    padding: 0
  });
  page.drawLine({
    start: { x: x + labelWidth, y: PAGE_HEIGHT - top - height + 2 },
    end: { x: x + width, y: PAGE_HEIGHT - top - height + 2 },
    thickness: 0.35,
    color: LIGHT_BORDER
  });
}

function findStageSigner(history: Array<Record<string, any>>, stage: string): Signer | null {
  const allowed = new Set(['SUBMIT', 'CHECKED', 'APPROVED']);
  const entry = [...history].reverse().find((item) =>
    String(item.stage_name || '').toUpperCase() === stage.toUpperCase() &&
    allowed.has(String(item.action || '').toUpperCase())
  );
  if (!entry) return null;
  return {
    name: safeText(entry.actor_name) || '-',
    role: safeText(entry.actor_role_code) || '-',
    action: safeText(entry.action) || 'SIGNED',
    createdAt: entry.created_at || null,
    signatureToken: entry.signature_token || null
  };
}


function findRoleSigner(history: Array<Record<string, any>>, role: string): Signer | null {
  const allowed = new Set(['SUBMIT', 'CHECKED', 'APPROVED']);
  const entry = [...history].reverse().find((item) =>
    String(item.actor_role_code || '').toUpperCase() === role.toUpperCase() &&
    allowed.has(String(item.action || '').toUpperCase())
  );
  if (!entry) return null;
  return {
    name: safeText(entry.actor_name) || '-', role: safeText(entry.actor_role_code) || role,
    action: safeText(entry.action) || 'SIGNED', createdAt: entry.created_at || null,
    signatureToken: entry.signature_token || null
  };
}

function submitterSigner(detail: OfficialPdfDetail): Signer {
  const history = Array.isArray(detail.history) ? detail.history : [];
  const form = detail.form || {};
  const entry = [...history].reverse().find((item) => String(item.action || '').toUpperCase() === 'SUBMIT');
  return {
    name: safeText(entry?.actor_name || form.full_name) || '-',
    role: safeText(entry?.actor_role_code || form.role_code || 'STAFF'),
    action: safeText(entry?.action || 'SUBMIT'),
    createdAt: entry?.created_at || form.submitted_at || null,
    signatureToken: entry?.signature_token || null
  };
}

function initials(name: unknown): string {
  const parts = safeText(name).split(' ').filter(Boolean);
  if (!parts.length) return '--';
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
}

function roleLabel(role: unknown): string {
  const raw = safeText(role).toUpperCase();
  const labels: Record<string, string> = {
    STAFF: 'Staff',
    LEADER: 'Leader',
    ASSMAN: 'Asst. Manager',
    PLANT_MANAGER: 'Plant Manager',
    GENERAL_MANAGER: 'General Manager',
    BOD_KI: 'BOD KI',
    BOD_BEI: 'BOD BEI',
    ADMIN: 'Administrator'
  };
  return labels[raw] || raw.replaceAll('_', ' ') || '-';
}

function drawQrCode(
  page: PDFPage,
  payload: string,
  x: number,
  top: number,
  size: number
) {
  const matrix = createQrMatrix(payload);
  const quiet = 4;
  const moduleSize = size / (matrix.length + quiet * 2);
  drawTopRect(page, x, top, size, size, { color: WHITE, borderColor: LIGHT_BORDER, borderWidth: 0.35 });
  matrix.forEach((row, rowIndex) => {
    row.forEach((dark, colIndex) => {
      if (!dark) return;
      page.drawRectangle({
        x: x + (colIndex + quiet) * moduleSize,
        y: PAGE_HEIGHT - top - (rowIndex + quiet + 1) * moduleSize,
        width: moduleSize + 0.03,
        height: moduleSize + 0.03,
        color: BLACK
      });
    });
  });
}

function qrPayload(stage: string, signer: Signer): string {
  const token = safeText(signer.signatureToken || '').slice(0, 48);
  return `BKI|${safeText(stage).slice(0, 14)}|${token || 'NO-TOKEN'}`;
}

function drawCheckedBy(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  label: string,
  signer: Signer | null,
  x: number,
  top: number,
  width: number,
  height: number
) {
  drawTopRect(page, x, top, width, height, { color: WHITE, borderColor: LIGHT_BORDER, borderWidth: 0.45 });
  page.drawText(label, { x: x + 6, y: PAGE_HEIGHT - top - 11, size: 5.2, font: bold, color: MUTED });
  if (!signer) {
    page.drawText('PENDING', { x: x + width - 48, y: PAGE_HEIGHT - top - 11, size: 5, font: bold, color: MUTED });
    return;
  }
  const paraf = initials(signer.name);
  drawTopRect(page, x + width - 42, top + 3, 18, height - 6, { color: SIGNED_GREY, borderColor: BORDER, borderWidth: 0.45 });
  drawCellText(page, bold, paraf, x + width - 42, top + 3, 18, height - 6, { fontSize: 6.2, maxLines: 1, align: 'center' });
  drawCellText(page, regular, `${signer.name} | ${isoDate(signer.createdAt, true)}`, x + 54, top, width - 102, height, {
    fontSize: 5.1,
    minFontSize: 4,
    maxLines: 1,
    align: 'left'
  });
}

function drawSingleSignature(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  heading: string,
  stage: string,
  signer: Signer | null,
  x: number,
  top: number,
  width: number,
  height: number
) {
  drawTopRect(page, x, top, width, height, { color: WHITE, borderColor: BORDER, borderWidth: 0.65 });
  drawTopRect(page, x, top, width, 18, { color: SOFT_GREY, borderColor: BORDER, borderWidth: 0.65 });
  drawCellText(page, bold, heading, x, top + 1, width, 16, { fontSize: 7.1, maxLines: 1, align: 'center' });
  if (!signer) {
    drawCellText(page, bold, 'PENDING', x, top + 43, width, 30, { fontSize: 7.4, maxLines: 1, align: 'center', color: MUTED });
    drawCellText(page, regular, 'No digital approval', x, top + 71, width, 18, { fontSize: 5.2, maxLines: 1, align: 'center', color: MUTED });
    return;
  }

  const qrSize = Math.max(38, Math.min(54, height - 82));
  const qrX = x + (width - qrSize) / 2;
  const qrTop = top + 25;
  drawQrCode(page, qrPayload(stage, signer), qrX, qrTop, qrSize);
  const nameTop = qrTop + qrSize + 4;
  drawCellText(page, bold, signer.name, x + 5, nameTop, width - 10, 20, { fontSize: 6.6, minFontSize: 5.0, maxLines: 2, align: 'center' });
  drawCellText(page, regular, roleLabel(signer.role), x + 5, nameTop + 20, width - 10, 12, { fontSize: 5.4, minFontSize: 4.5, maxLines: 1, align: 'center', color: MUTED });
  drawCellText(page, regular, isoDate(signer.createdAt), x + 5, nameTop + 32, width - 10, 11, { fontSize: 4.9, maxLines: 1, align: 'center', color: MUTED });
  drawCellText(page, regular, `QR ${safeText(signer.signatureToken || '').slice(0, 10)}`, x + 5, nameTop + 43, width - 10, Math.max(9, height - (nameTop - top) - 44), {
    fontSize: 4.1, minFontSize: 3.6, maxLines: 1, align: 'center', color: MUTED
  });
}


type ApprovalColumnMode = 'qr' | 'initials';

function drawApprovalRouteColumn(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  heading: string,
  stageLabel: string,
  stage: string,
  signer: Signer | null,
  mode: ApprovalColumnMode,
  x: number,
  top: number,
  width: number,
  height: number
) {
  drawTopRect(page, x, top, width, height, { color: WHITE, borderColor: BORDER, borderWidth: 0.65 });
  drawTopRect(page, x, top, width, 20, { color: SOFT_GREY, borderColor: BORDER, borderWidth: 0.65 });
  drawCellText(page, bold, heading, x + 2, top + 1, width - 4, 13, {
    fontSize: 6.8,
    minFontSize: 5.6,
    maxLines: 1,
    align: 'center'
  });
  drawCellText(page, regular, stageLabel, x + 2, top + 12, width - 4, 8, {
    fontSize: 4.4,
    minFontSize: 3.8,
    maxLines: 1,
    align: 'center',
    color: MUTED
  });

  if (!signer) {
    drawCellText(page, bold, 'PENDING', x + 3, top + 50, width - 6, 20, {
      fontSize: 6.3,
      maxLines: 1,
      align: 'center',
      color: MUTED
    });
    drawCellText(page, regular, mode === 'initials' ? 'Paraf / nama belum tersedia' : 'Digital approval belum tersedia', x + 5, top + 73, width - 10, 22, {
      fontSize: 4.5,
      minFontSize: 3.8,
      maxLines: 2,
      align: 'center',
      color: MUTED
    });
    return;
  }

  if (mode === 'initials') {
    const parafWidth = Math.min(38, Math.max(30, width * 0.34));
    const parafHeight = 28;
    const parafX = x + (width - parafWidth) / 2;
    const parafTop = top + 35;
    drawTopRect(page, parafX, parafTop, parafWidth, parafHeight, {
      color: SIGNED_GREY,
      borderColor: BORDER,
      borderWidth: 0.55
    });
    drawCellText(page, bold, initials(signer.name), parafX, parafTop, parafWidth, parafHeight, {
      fontSize: 10.5,
      minFontSize: 8,
      maxLines: 1,
      align: 'center'
    });
    const nameTop = parafTop + parafHeight + 5;
    drawCellText(page, bold, signer.name, x + 4, nameTop, width - 8, 24, {
      fontSize: 5.6,
      minFontSize: 4.2,
      maxLines: 2,
      align: 'center'
    });
    drawCellText(page, regular, roleLabel(signer.role), x + 4, nameTop + 24, width - 8, 11, {
      fontSize: 4.5,
      minFontSize: 3.8,
      maxLines: 1,
      align: 'center',
      color: MUTED
    });
    drawCellText(page, regular, isoDate(signer.createdAt), x + 4, nameTop + 35, width - 8, 10, {
      fontSize: 4.3,
      minFontSize: 3.7,
      maxLines: 1,
      align: 'center',
      color: MUTED
    });
    return;
  }

  const qrSize = Math.max(37, Math.min(46, width - 30, height - 88));
  const qrX = x + (width - qrSize) / 2;
  const qrTop = top + 27;
  drawQrCode(page, qrPayload(stage, signer), qrX, qrTop, qrSize);
  const nameTop = qrTop + qrSize + 4;
  drawCellText(page, bold, signer.name, x + 4, nameTop, width - 8, 22, {
    fontSize: 5.6,
    minFontSize: 4.2,
    maxLines: 2,
    align: 'center'
  });
  drawCellText(page, regular, roleLabel(signer.role), x + 4, nameTop + 22, width - 8, 11, {
    fontSize: 4.5,
    minFontSize: 3.8,
    maxLines: 1,
    align: 'center',
    color: MUTED
  });
  drawCellText(page, regular, isoDate(signer.createdAt), x + 4, nameTop + 33, width - 8, 10, {
    fontSize: 4.3,
    minFontSize: 3.7,
    maxLines: 1,
    align: 'center',
    color: MUTED
  });
}

function drawApprovalGroup(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  approvals: Array<{ stage: string; label: string; signer: Signer | null }>,
  x: number,
  top: number,
  width: number,
  height: number
) {
  drawTopRect(page, x, top, width, height, { color: WHITE, borderColor: BORDER, borderWidth: 0.65 });
  drawTopRect(page, x, top, width, 16, { color: SOFT_GREY, borderColor: BORDER, borderWidth: 0.65 });
  drawCellText(page, bold, 'Approved / Disetujui', x, top + 1, width, 16, { fontSize: 7.1, maxLines: 1, align: 'center' });
  const gap = 4;
  const cellWidth = (width - gap * 4) / 3;
  approvals.forEach((approval, index) => {
    const cx = x + gap + index * (cellWidth + gap);
    const signer = approval.signer;
    drawCellText(page, bold, approval.label, cx, top + 20, cellWidth, 10, { fontSize: 5.0, maxLines: 1, align: 'center', color: MUTED });
    if (!signer) {
      drawCellText(page, regular, 'PENDING', cx, top + 34, cellWidth, 28, { fontSize: 5, maxLines: 1, align: 'center', color: MUTED });
      return;
    }
    const qrSize = Math.max(31, Math.min(43, height - 73));
    drawQrCode(page, qrPayload(approval.stage, signer), cx + (cellWidth - qrSize) / 2, top + 31, qrSize);
    drawCellText(page, bold, signer.name, cx, top + 31 + qrSize + 4, cellWidth, 15, { fontSize: 5.0, minFontSize: 4.0, maxLines: 2, align: 'center' });
    drawCellText(page, regular, roleLabel(signer.role), cx, top + 31 + qrSize + 20, cellWidth, 10, { fontSize: 4.3, minFontSize: 3.7, maxLines: 1, align: 'center', color: MUTED });
  });
}

/**
 * One-page KPI form inspired by the user's FRM-HRD-030 Rev.02 spreadsheet.
 * It is drawn natively so rows shrink/expand with actual data and signature QR
 * blocks never get clipped. No approval-journey section is included.
 */
export async function buildOfficialKpiPdf(
  detail: OfficialPdfDetail,
  generatedBy: PdfActor,
  options: OfficialPdfOptions = {}
): Promise<Uint8Array> {
  const form = detail.form || {};
  const points = Array.isArray(detail.points) ? detail.points : [];
  const history = Array.isArray(detail.history) ? detail.history : [];
  const profile = detail.profile || {};

  if (points.length > MAX_POINTS) {
    throw new Error(`Form KPI satu halaman mendukung maksimal ${MAX_POINTS} KPI point. Form ini memiliki ${points.length} point.`);
  }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  if (options.logoBytes?.length) {
    try {
      const logo = await pdf.embedPng(options.logoBytes);
      const scale = Math.min(86 / logo.width, 44 / logo.height);
      page.drawImage(logo, {
        x: MARGIN_X,
        y: PAGE_HEIGHT - 15 - logo.height * scale,
        width: logo.width * scale,
        height: logo.height * scale
      });
    } catch {
      page.drawText('BANSHU', { x: MARGIN_X, y: PAGE_HEIGHT - 39, size: 13, font: bold, color: TEXT });
    }
  } else {
    page.drawText('BANSHU', { x: MARGIN_X, y: PAGE_HEIGHT - 39, size: 13, font: bold, color: TEXT });
  }

  page.drawText('FRM-HRD-030 Rev.02', {
    x: PAGE_WIDTH - MARGIN_X - 88,
    y: PAGE_HEIGHT - 24,
    size: 6.3,
    font: bold,
    color: TEXT
  });
  page.drawText(`${safeText(form.form_no || '-')} | ${safeText(form.period_key || '-')} | ${safeText(form.status || 'DRAFT').toUpperCase()}`, {
    x: PAGE_WIDTH - MARGIN_X - 180,
    y: PAGE_HEIGHT - 42,
    size: 5,
    font: regular,
    color: MUTED
  });

  drawTopRect(page, MARGIN_X, 58, CONTENT_WIDTH, 36, { color: LIGHT_BLUE, borderColor: LIGHT_BORDER, borderWidth: 0.55 });
  drawCellText(page, bold, 'Key Performance Indicator', MARGIN_X, 60, CONTENT_WIDTH, 32, {
    fontSize: 17,
    minFontSize: 15,
    maxLines: 1,
    align: 'center',
    color: BLACK
  });

  const metaTop = 104;
  const metaRow = 20;
  const metaGap = 2;
  const halfGap = 26;
  const halfWidth = (CONTENT_WIDTH - halfGap) / 2;
  const rightX = MARGIN_X + halfWidth + halfGap;
  drawInfoLine(page, regular, bold, 'Nama', form.full_name, MARGIN_X, metaTop, halfWidth, metaRow);
  drawInfoLine(page, regular, bold, 'Tanggal Masuk', profile.join_date ? isoDate(profile.join_date) : '-', rightX, metaTop, halfWidth, metaRow);
  drawInfoLine(page, regular, bold, 'NIK', form.employee_code, MARGIN_X, metaTop + (metaRow + metaGap), halfWidth, metaRow);
  drawInfoLine(page, regular, bold, 'Academic', profile.academic || '-', rightX, metaTop + (metaRow + metaGap), halfWidth, metaRow);
  drawInfoLine(page, regular, bold, 'Jabatan', form.position_name, MARGIN_X, metaTop + (metaRow + metaGap) * 2, halfWidth, metaRow);
  drawInfoLine(page, regular, bold, 'Periode', monthLabel(form.period_key), rightX, metaTop + (metaRow + metaGap) * 2, halfWidth, metaRow);
  drawInfoLine(page, regular, bold, 'Department', form.department_name, MARGIN_X, metaTop + (metaRow + metaGap) * 3, halfWidth, metaRow);

  const tableTop = 196;
  const headerHeight = 22;
  const totalHeight = 20;
  const pointCount = Math.max(points.length, 1);
  const signatureTop = pointCount <= 10 ? 442 : pointCount <= 16 ? 456 : 470;
  const checkedHeight = 20;
  const checkedTop = signatureTop - checkedHeight - 8;
  const totalTop = checkedTop - totalHeight - 7;
  const rowHeight = Math.max(8.9, (totalTop - tableTop - headerHeight) / pointCount);

  const columns = [
    { key: 'point_no', label: 'No.', width: 31, align: 'center' as const },
    { key: 'subject', label: 'Subject', width: 80, align: 'left' as const },
    { key: 'kpi_objective', label: 'KPI (Objective)', width: 250, align: 'left' as const },
    { key: 'uom', label: 'UOM', width: 42, align: 'center' as const },
    { key: 'weight_percent', label: 'Bobot', width: 51, align: 'center' as const },
    { key: 'source_data', label: 'Sumber Data', width: 143, align: 'left' as const },
    { key: 'target', label: 'Target', width: 55, align: 'center' as const },
    { key: 'actual', label: 'Actual', width: 55, align: 'center' as const },
    { key: 'score_percent', label: 'Score', width: CONTENT_WIDTH - 707, align: 'center' as const }
  ];

  let x = MARGIN_X;
  columns.forEach((column) => {
    drawTopRect(page, x, tableTop, column.width, headerHeight, { color: BLACK, borderColor: WHITE, borderWidth: 0.3 });
    drawCellText(page, bold, column.label, x, tableTop + 1, column.width, headerHeight - 2, {
      fontSize: 5.8,
      minFontSize: 4.4,
      maxLines: 2,
      align: 'center',
      color: WHITE
    });
    x += column.width;
  });

  if (points.length) {
    points.forEach((point, index) => {
      const top = tableTop + headerHeight + index * rowHeight;
      x = MARGIN_X;
      columns.forEach((column) => {
        drawTopRect(page, x, top, column.width, rowHeight, {
          color: index % 2 === 0 ? WHITE : SOFT_GREY,
          borderColor: LIGHT_BORDER,
          borderWidth: 0.38
        });
        let value: unknown = point[column.key];
        if (column.key === 'point_no') value = point.point_no ?? index + 1;
        if (column.key === 'weight_percent') value = `${numberText(point.weight_percent)}%`;
        if (column.key === 'target' || column.key === 'actual') value = point[column.key] == null ? '-' : numberText(point[column.key]);
        if (column.key === 'score_percent') value = numberText(point.score_percent);
        drawCellText(page, column.key === 'score_percent' ? bold : regular, value, x, top, column.width, rowHeight, {
          fontSize: rowHeight < 12 ? 4.4 : rowHeight < 17 ? 5.1 : 5.9,
          minFontSize: 3.6,
          maxLines: column.key === 'kpi_objective' || column.key === 'source_data' ? 3 : 2,
          align: column.align,
          color: TEXT,
          padding: 2.4
        });
        x += column.width;
      });
    });
  } else {
    drawTopRect(page, MARGIN_X, tableTop + headerHeight, CONTENT_WIDTH, rowHeight, { color: WHITE, borderColor: LIGHT_BORDER, borderWidth: 0.4 });
    drawCellText(page, regular, 'No KPI points available', MARGIN_X, tableTop + headerHeight, CONTENT_WIDTH, rowHeight, {
      fontSize: 6,
      maxLines: 1,
      align: 'center',
      color: MUTED
    });
  }

  drawTopRect(page, MARGIN_X, totalTop, CONTENT_WIDTH, totalHeight, { color: rgb(0.34, 0.34, 0.34), borderColor: BORDER, borderWidth: 0.55 });
  drawCellText(page, bold, 'Total', MARGIN_X + 3, totalTop, 160, totalHeight, { fontSize: 6.3, maxLines: 1, align: 'center', color: WHITE });
  drawCellText(page, bold, `Bobot ${numberText(form.total_weight)}%`, MARGIN_X + 470, totalTop, 150, totalHeight, { fontSize: 6.2, maxLines: 1, align: 'right', color: WHITE });
  drawCellText(page, bold, `Final Score ${numberText(form.final_score)}`, MARGIN_X + 620, totalTop, CONTENT_WIDTH - 620, totalHeight, { fontSize: 6.4, maxLines: 1, align: 'right', color: WHITE });

  // Approval route is intentionally rendered in the same order as the legacy KPI form.
  // BUSINESS FLOW (RIGHT -> LEFT):
  // Dibuat -> Checked 1 -> Diperiksa (Approval 1) -> Diketahui (Approval 2)
  // -> Disetujui (Approval 3) -> Checked 2 -> Disetujui (Approval 4).
  // VISUAL COLUMNS (LEFT -> RIGHT) are therefore the exact reverse order.
  const approvalTop = checkedTop;
  const signatureHeight = PAGE_HEIGHT - approvalTop - 24;
  const prepared = submitterSigner(detail);
  const approvalColumns: Array<{
    heading: string;
    stageLabel: string;
    stage: string;
    signer: Signer | null;
    mode: ApprovalColumnMode;
  }> = [
    { heading: 'Disetujui', stageLabel: 'Approval 4', stage: 'Approval4', signer: findStageSigner(history, 'Approval4'), mode: 'qr' },
    { heading: 'Checked 2', stageLabel: 'Paraf / Nama', stage: 'Checked2', signer: findStageSigner(history, 'Checked2'), mode: 'initials' },
    { heading: 'Disetujui', stageLabel: 'Approval 3', stage: 'Approval3', signer: findStageSigner(history, 'Approval3'), mode: 'qr' },
    { heading: 'Diketahui', stageLabel: 'Approval 2', stage: 'Approval2', signer: findStageSigner(history, 'Approval2'), mode: 'qr' },
    { heading: 'Diperiksa', stageLabel: 'Approval 1', stage: 'Approval1', signer: findStageSigner(history, 'Approval1'), mode: 'qr' },
    { heading: 'Checked 1', stageLabel: 'Paraf / Nama', stage: 'Checked1', signer: findStageSigner(history, 'Checked1'), mode: 'initials' },
    { heading: 'Dibuat', stageLabel: 'Staff / Leader', stage: 'Submitter', signer: prepared, mode: 'qr' }
  ];
  const approvalGap = 4;
  const approvalWidth = (CONTENT_WIDTH - approvalGap * (approvalColumns.length - 1)) / approvalColumns.length;
  approvalColumns.forEach((column, index) => {
    const columnX = MARGIN_X + index * (approvalWidth + approvalGap);
    drawApprovalRouteColumn(
      page, regular, bold, column.heading, column.stageLabel, column.stage, column.signer, column.mode,
      columnX, approvalTop, approvalWidth, signatureHeight
    );
  });

  page.drawText(`Generated by ${safeText(generatedBy.full_name || '-')}`, { x: MARGIN_X, y: 8, size: 3.7, font: regular, color: MUTED });
  page.drawText('PT Banshu Electric Indonesia - Digital approval QR is the document verification mark.', {
    x: PAGE_WIDTH - MARGIN_X - 326,
    y: 8,
    size: 3.7,
    font: regular,
    color: MUTED
  });

  const statusText = safeText(form.status || 'DRAFT').toUpperCase();
  if (statusText !== 'APPROVED') {
    page.drawText(`PREVIEW - ${statusText}`, {
      x: 292,
      y: 288,
      size: 28,
      font: bold,
      color: DRAFT_RED,
      rotate: degrees(32),
      opacity: 0.11
    });
  }

  pdf.setTitle(`KPI ${safeText(form.form_no || '')}`);
  pdf.setAuthor('PT Banshu Electric Indonesia');
  pdf.setSubject('Key Performance Indicator - FRM-HRD-030 Rev.02 layout reference');
  pdf.setCreator(`KPI Executive Manufacturing Control Center | ${safeText(generatedBy.full_name || '-')}`);
  pdf.setProducer('Cloudflare Worker + pdf-lib');
  return pdf.save();
}
