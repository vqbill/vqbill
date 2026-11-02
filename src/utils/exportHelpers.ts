import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  DeductionRecord,
  ReturnRecord,
  BillRecord,
  BillItemRecord,
  SalaryAdvanceRecord,
  DebtPaymentRecord,
  EmployeeRecord,
} from '../types';
import { formatDateDMY, formatVND } from './parser';

/**
 * Common formatting helpers
 */
function cleanNum(val: unknown): number {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function formatMoney(amount: number): string {
  return formatVND(amount, true);
}

function getTodayFormatted(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

// ============================================================================
// CORE EXCEL EXPORT HELPER
// ============================================================================
export interface ExcelSheetConfig {
  sheetName: string;
  rows: (string | number | boolean | null | undefined)[][];
  colWidths?: number[];
}

export function exportToExcel(sheets: ExcelSheetConfig[], filename: string) {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);

    // Auto calculate column widths if not explicitly provided
    if (sheet.colWidths && sheet.colWidths.length > 0) {
      ws['!cols'] = sheet.colWidths.map((w) => ({ wch: w }));
    } else {
      // Calculate based on cell content
      const maxCols = Math.max(...sheet.rows.map((r) => r.length), 0);
      const colWidths: { wch: number }[] = [];
      for (let c = 0; c < maxCols; c++) {
        let maxLen = 10;
        for (const row of sheet.rows) {
          const cell = row[c];
          if (cell !== undefined && cell !== null) {
            const str = String(cell);
            if (str.length > maxLen) {
              maxLen = Math.min(str.length + 3, 50);
            }
          }
        }
        colWidths.push({ wch: maxLen });
      }
      ws['!cols'] = colWidths;
    }

    const safeSheetName = sheet.sheetName.slice(0, 31).replace(/[\\/?*[\]]/g, '_');
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  }

  const finalName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, finalName);
}

// ============================================================================
// CORE PDF EXPORT HELPER (html2canvas + jsPDF with full Vietnamese font support)
// ============================================================================
export interface PdfTableConfig {
  title?: string;
  headers: string[];
  rows: (string | number)[][];
  aligns?: ('left' | 'center' | 'right')[];
  footers?: (string | number)[];
}

export interface PdfExportOptions {
  filename: string;
  reportTitle: string;
  period?: string;
  brandTitle?: string;
  brandSubtitle?: string;
  kpis?: { label: string; value: string; color?: string }[];
  tables: PdfTableConfig[];
  notes?: string[];
  signatures?: string[];
  orientation?: 'portrait' | 'landscape';
}

export async function exportToPdf(options: PdfExportOptions): Promise<void> {
  const {
    filename,
    reportTitle,
    period = '',
    brandTitle = 'VỊNH QUÁN',
    brandSubtitle = 'Hệ Thống Quản Lý Bán Lẻ & Nhà Hàng',
    kpis = [],
    tables = [],
    notes = [],
    signatures = ['Người Lập Biểu', 'Kế Toán / Thủ Quỹ', 'Chủ Quán / Quản Lý'],
    orientation = 'portrait',
  } = options;

  const isLandscape = orientation === 'landscape';
  const containerWidthPx = isLandscape ? 1120 : 800;

  // Build the printable HTML markup
  const container = document.createElement('div');
  container.id = 'print-pdf-temp-container';
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '-9999px';
  container.style.width = `${containerWidthPx}px`;
  container.style.padding = '32px 36px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  container.style.zIndex = '-9999';

  let html = `
    <div style="width: 100%; box-sizing: border-box; background: #ffffff;">
      <!-- HEADER -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 2px solid #0f172a; margin-bottom: 20px;">
        <div>
          <div style="font-size: 22px; font-weight: 800; letter-spacing: 0.5px; color: #047857; text-transform: uppercase;">
            ${brandTitle}
          </div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px; font-weight: 500;">
            ${brandSubtitle}
          </div>
        </div>
        <div style="text-align: right; font-size: 11px; color: #475569;">
          <div><strong>Thời điểm xuất:</strong> ${getTodayFormatted()}</div>
          ${period ? `<div style="margin-top: 3px; font-weight: 600; color: #0f172a;">Kỳ báo cáo: <span style="color: #047857;">${period}</span></div>` : ''}
        </div>
      </div>

      <!-- TITLE -->
      <div style="text-align: center; margin-bottom: 22px;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 800; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px;">
          ${reportTitle}
        </h1>
        ${period ? `<div style="display: inline-block; margin-top: 6px; padding: 3px 12px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 9999px; font-size: 11px; font-weight: 700; color: #065f46;">${period}</div>` : ''}
      </div>
  `;

  // KPIS GRID
  if (kpis.length > 0) {
    const kpiCols = Math.min(kpis.length, 4);
    html += `
      <div style="display: grid; grid-template-columns: repeat(${kpiCols}, 1fr); gap: 12px; margin-bottom: 24px;">
        ${kpis
          .map(
            (k) => `
          <div style="padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc;">
            <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">${k.label}</div>
            <div style="font-size: 16px; font-weight: 800; color: ${k.color || '#0f172a'}; margin-top: 4px; font-family: monospace;">${k.value}</div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  // TABLES
  for (const tbl of tables) {
    if (tbl.title) {
      html += `
        <div style="font-size: 13px; font-weight: 700; color: #1e293b; margin-top: 16px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.3px;">
          ${tbl.title}
        </div>
      `;
    }

    html += `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px;">
        <thead>
          <tr style="background-color: #1e293b; color: #ffffff;">
            ${tbl.headers
              .map((h, idx) => {
                const align = tbl.aligns?.[idx] || (idx === 0 ? 'center' : 'left');
                return `<th style="padding: 8px 10px; text-align: ${align}; font-weight: 700; font-size: 10.5px; border: 1px solid #1e293b; letter-spacing: 0.3px;">${h}</th>`;
              })
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${
            tbl.rows.length === 0
              ? `<tr><td colspan="${tbl.headers.length}" style="padding: 16px; text-align: center; color: #64748b; border: 1px solid #e2e8f0;">Không có dữ liệu trong kỳ này</td></tr>`
              : tbl.rows
                  .map((row, rIdx) => {
                    const bg = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
                    return `
              <tr style="background-color: ${bg};">
                ${row
                  .map((cell, cIdx) => {
                    const align = tbl.aligns?.[cIdx] || (cIdx === 0 ? 'center' : 'left');
                    const isNum = typeof cell === 'number' || (typeof cell === 'string' && /^-?[\d.,]+(\s*₫)?$/.test(cell));
                    const cellAlign = tbl.aligns?.[cIdx] ? align : isNum ? 'right' : align;
                    return `<td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: ${cellAlign}; color: #334155; ${isNum ? 'font-family: monospace;' : ''}">${cell ?? ''}</td>`;
                  })
                  .join('')}
              </tr>
            `;
                  })
                  .join('')
          }
        </tbody>
        ${
          tbl.footers && tbl.footers.length > 0
            ? `
          <tfoot>
            <tr style="background-color: #f1f5f9; font-weight: 700; color: #0f172a;">
              ${tbl.footers
                .map((f, fIdx) => {
                  const align = tbl.aligns?.[fIdx] || (fIdx === 0 ? 'left' : 'right');
                  return `<td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: ${align}; font-family: monospace;">${f ?? ''}</td>`;
                })
                .join('')}
            </tr>
          </tfoot>
        `
            : ''
        }
      </table>
    `;
  }

  // NOTES
  if (notes.length > 0) {
    html += `
      <div style="margin-top: 10px; margin-bottom: 24px; padding: 10px 14px; background: #f8fafc; border-left: 3px solid #047857; font-size: 10.5px; color: #475569;">
        ${notes.map((n) => `<div style="margin-bottom: 3px;">• ${n}</div>`).join('')}
      </div>
    `;
  }

  // SIGNATURES
  if (signatures.length > 0) {
    html += `
      <div style="display: flex; justify-content: space-around; margin-top: 36px; padding-top: 10px; text-align: center; page-break-inside: avoid;">
        ${signatures
          .map(
            (sig) => `
          <div style="flex: 1; padding: 0 10px;">
            <div style="font-weight: 700; font-size: 12px; color: #0f172a; text-transform: uppercase;">${sig}</div>
            <div style="font-size: 10px; color: #64748b; font-style: italic; margin-top: 2px;">(Ký & ghi rõ họ tên)</div>
            <div style="height: 60px;"></div>
            <div style="border-bottom: 1px dotted #cbd5e1; width: 70%; margin: 0 auto;"></div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  html += `</div>`;
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF(isLandscape ? 'l' : 'p', 'mm', 'a4');
    const pdfWidth = isLandscape ? 297 : 210;
    const pdfHeight = isLandscape ? 210 : 297;

    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 5) {
      position -= pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    const finalName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(finalName);
  } finally {
    document.body.removeChild(container);
  }
}

// ============================================================================
// 1. KHOẢN TRỪ (DEDUCTIONS / EXPENSES)
// ============================================================================
export interface DeductionsExportPayload {
  deductions: DeductionRecord[];
  periodLabel: string;
  totals: {
    totalAmount: number;
    directAmount: number;
    returnLinkedAmount: number;
    count: number;
  };
  categoryBreakdown?: {
    category: string;
    count: number;
    amount: number;
    percentage: number;
  }[];
}

export function exportDeductionsExcel(payload: DeductionsExportPayload) {
  const { deductions, periodLabel, totals, categoryBreakdown = [] } = payload;
  const filename = `khoan_tru_${sanitizeFileName(periodLabel)}_${Date.now()}`;

  // Sheet 1: Danh sách chi tiết
  const rows: (string | number)[][] = [
    ['VỊNH QUÁN - BÁO CÁO KHOẢN TRỪ & CHI PHÍ HOẠT ĐỘNG'],
    [`Kỳ báo cáo: ${periodLabel}`, '', '', '', '', `Xuất lúc: ${getTodayFormatted()}`],
    [],
    ['TỔNG HỢP NHANH:'],
    ['Tổng khoản trừ', totals.totalAmount, 'VNĐ', `(${totals.count} phiếu)`],
    ['Chi mua hàng / Vật tư trực tiếp', totals.directAmount, 'VNĐ'],
    ['Khoản trừ hoàn bia / Món thừa', totals.returnLinkedAmount, 'VNĐ'],
    [],
    [
      'STT',
      'Ngày chi',
      'Danh mục / Nhóm chi',
      'Nội dung khoản trừ',
      'Số lượng',
      'Đơn giá (VNĐ)',
      'Thành tiền (VNĐ)',
      'Phân loại',
      'Người chi / Ghi chú',
    ],
  ];

  let totalSum = 0;
  deductions.forEach((d, idx) => {
    const isReturn =
      d.id.startsWith('ded_ret_') ||
      d.billCode === 'HOAN-TRA' ||
      Boolean((d as any).linkedReturnId);
    const amount = cleanNum(d.amount);
    totalSum += amount;
    rows.push([
      idx + 1,
      formatDateDMY(d.deductionDate || d.billDate),
      d.category || 'Khác',
      d.productName || (d as any).reason || '',
      d.quantity || 1,
      cleanNum(d.unitPrice) || amount,
      amount,
      isReturn ? 'Hoàn bia/món' : 'Chi trực tiếp',
      d.note || (d as any).createdBy || '',
    ]);
  });

  rows.push([
    'TỔNG CỘNG',
    '',
    '',
    '',
    '',
    '',
    totalSum,
    '',
    `${deductions.length} khoản chi`,
  ]);

  // Sheet 2: Cơ cấu theo nhóm khoản trừ
  const breakdownRows: (string | number)[][] = [
    ['CƠ CẤU CHI THEO NHÓM KHOẢN TRỪ'],
    [`Kỳ: ${periodLabel}`],
    [],
    ['STT', 'Nhóm khoản trừ', 'Số lần chi', 'Tổng tiền (VNĐ)', 'Tỷ trọng (%)'],
  ];

  categoryBreakdown.forEach((cat, idx) => {
    breakdownRows.push([
      idx + 1,
      cat.category,
      cat.count,
      cat.amount,
      `${cat.percentage.toFixed(1)}%`,
    ]);
  });

  breakdownRows.push(['TỔNG CỘNG', '', totals.count, totals.totalAmount, '100%']);

  exportToExcel(
    [
      { sheetName: 'Danh sách chi tiết', rows, colWidths: [6, 14, 25, 40, 10, 16, 18, 16, 20] },
      { sheetName: 'Cơ cấu theo nhóm', rows: breakdownRows, colWidths: [6, 30, 14, 20, 16] },
    ],
    filename
  );
}

export async function exportDeductionsPdf(payload: DeductionsExportPayload) {
  const { deductions, periodLabel, totals, categoryBreakdown = [] } = payload;
  const filename = `khoan_tru_${sanitizeFileName(periodLabel)}_${Date.now()}`;

  const tableRows: (string | number)[][] = deductions.map((d, idx) => {
    const isReturn =
      d.id.startsWith('ded_ret_') ||
      d.billCode === 'HOAN-TRA' ||
      Boolean((d as any).linkedReturnId);
    return [
      idx + 1,
      formatDateDMY(d.deductionDate || d.billDate),
      d.category || 'Khác',
      d.productName || (d as any).reason || '',
      d.quantity || 1,
      formatMoney(cleanNum(d.amount)),
      isReturn ? 'Hoàn bia/món' : 'Chi trực tiếp',
    ];
  });

  const breakdownRows: (string | number)[][] = categoryBreakdown.map((cat, idx) => [
    idx + 1,
    cat.category,
    `${cat.count} lần`,
    formatMoney(cat.amount),
    `${cat.percentage.toFixed(1)}%`,
  ]);

  await exportToPdf({
    filename,
    reportTitle: 'BÁO CÁO KHOẢN TRỪ & CHI TIÊU HOẠT ĐỘNG',
    period: periodLabel,
    orientation: 'landscape',
    kpis: [
      { label: 'Tổng khoản trừ', value: `-${formatMoney(totals.totalAmount)}`, color: '#e11d48' },
      { label: 'Chi trực tiếp', value: `-${formatMoney(totals.directAmount)}`, color: '#059669' },
      { label: 'Hoàn bia / Món thừa', value: `-${formatMoney(totals.returnLinkedAmount)}`, color: '#4f46e5' },
      { label: 'Số khoản trừ', value: `${totals.count} khoản`, color: '#0f172a' },
    ],
    tables: [
      {
        title: '1. Danh sách chi tiết các khoản trừ trong kỳ',
        headers: ['STT', 'Ngày chi', 'Nhóm chi', 'Nội dung khoản trừ', 'SL', 'Số tiền (VNĐ)', 'Phân loại'],
        aligns: ['center', 'center', 'left', 'left', 'center', 'right', 'center'],
        rows: tableRows,
        footers: ['TỔNG', '', '', `${deductions.length} khoản chi`, '', `-${formatMoney(totals.totalAmount)}`, ''],
      },
      ...(breakdownRows.length > 0
        ? [
            {
              title: '2. Bảng cơ cấu chi theo danh mục',
              headers: ['STT', 'Nhóm khoản trừ', 'Số lần', 'Tổng tiền', 'Tỷ trọng'],
              aligns: ['center', 'left', 'center', 'right', 'center'] as ('left' | 'center' | 'right')[],
              rows: breakdownRows,
              footers: ['TỔNG', '', `${totals.count} lần`, formatMoney(totals.totalAmount), '100%'],
            },
          ]
        : []),
    ],
    notes: [
      'Khoản trừ bao gồm chi mua hàng trực tiếp và khoản hoàn trả từ hóa đơn khách.',
      'Công thức tính doanh thu thực: Thực thu = Tiền mặt + Chuyển khoản - Khoản trừ.',
    ],
  });
}

// ============================================================================
// 2. TỔNG QUAN VÀ DOANH THU (DASHBOARD & REVENUE)
// ============================================================================
export interface DashboardExportPayload {
  bills: BillRecord[];
  billItems?: BillItemRecord[];
  periodLabel: string;
  summary: {
    grossCash: number;
    netTransferRevenue: number;
    totalDeductions: number;
    netRevenue: number;
    debtCreated: number;
    totalDiscounts: number;
    totalBills: number;
  };
}

export function exportDashboardExcel(payload: DashboardExportPayload) {
  const { bills, billItems = [], periodLabel, summary } = payload;
  const filename = `doanh_thu_${sanitizeFileName(periodLabel)}_${Date.now()}`;

  const rows: (string | number)[][] = [
    ['VỊNH QUÁN - BÁO CÁO TỔNG QUAN DOANH THU & KẾT QUẢ KINH DOANH'],
    [`Kỳ báo cáo: ${periodLabel}`, '', '', '', '', `Xuất lúc: ${getTodayFormatted()}`],
    [],
    ['CÁC CHỈ SỐ TÀI CHÍNH CHÍNH:'],
    ['1. Tiền mặt (Gross Cash)', summary.grossCash, 'VNĐ'],
    ['2. Chuyển khoản ngân hàng', summary.netTransferRevenue, 'VNĐ'],
    ['3. Khoản trừ (Chi trong ngày)', summary.totalDeductions, 'VNĐ'],
    ['4. DOANH THU THUẦN (THỰC THU)', summary.netRevenue, 'VNĐ', '(= Tiền mặt + Chuyển khoản - Khoản trừ)'],
    ['5. Phát sinh công nợ trong kỳ', summary.debtCreated, 'VNĐ'],
    ['6. Tổng giảm giá món cho khách', summary.totalDiscounts, 'VNĐ'],
    ['7. Tổng số hóa đơn', summary.totalBills, 'Hóa đơn'],
    [],
    [
      'STT',
      'Mã HĐ',
      'Bàn',
      'Ngày hóa đơn',
      'Giờ vào - ra',
      'Hình thức TT',
      'Tạm tính (VNĐ)',
      'Giảm giá (VNĐ)',
      'Thanh toán (VNĐ)',
      'Khách hàng / Công nợ',
      'Trạng thái',
    ],
  ];

  let sumSubtotal = 0;
  let sumDiscount = 0;
  let sumTotal = 0;

  bills.forEach((b, idx) => {
    const sub = cleanNum(b.subtotalAmount || b.totalAmount);
    const disc = cleanNum(b.discountAmount);
    const tot = cleanNum(b.totalAmount);
    sumSubtotal += sub;
    sumDiscount += disc;
    sumTotal += tot;

    const payTypeStr =
      b.paymentType === 'cash'
        ? 'Tiền mặt'
        : b.paymentType === 'transfer'
        ? 'Chuyển khoản'
        : b.paymentType === 'debt'
        ? 'Công nợ'
        : b.paymentType === 'split'
        ? 'Kết hợp'
        : 'Khác';

    rows.push([
      idx + 1,
      b.billCode || '',
      b.tableName || '',
      formatDateDMY(b.billDate),
      `${b.checkInTime || ''} - ${b.checkOutTime || ''}`,
      payTypeStr,
      sub,
      disc,
      tot,
      b.debtorName || '',
      b.isArchived ? 'Đã lưu trữ' : 'Hoàn tất',
    ]);
  });

  rows.push([
    'TỔNG CỘNG',
    '',
    '',
    '',
    '',
    `${bills.length} bill`,
    sumSubtotal,
    sumDiscount,
    sumTotal,
    '',
    '',
  ]);

  const sheets: ExcelSheetConfig[] = [
    {
      sheetName: 'Tổng quan doanh thu',
      rows,
      colWidths: [6, 16, 12, 14, 18, 16, 16, 14, 18, 20, 14],
    },
  ];

  // Optional Sheet 2: Chi tiết các món bán ra
  if (billItems.length > 0) {
    const itemRows: (string | number)[][] = [
      ['CHI TIẾT MÓN ĂN & SẢN PHẨM BÁN RA'],
      [`Kỳ báo cáo: ${periodLabel}`],
      [],
      ['STT', 'Mã hóa đơn', 'Tên món ăn / Đồ uống', 'Danh mục', 'Đơn giá (VNĐ)', 'Số lượng', 'Thành tiền (VNĐ)'],
    ];

    let sumItemAmount = 0;
    let sumItemQty = 0;
    billItems.forEach((it, idx) => {
      const q = cleanNum(it.quantity);
      const sub = cleanNum(it.subtotal || it.unitPrice * q);
      sumItemQty += q;
      sumItemAmount += sub;
      itemRows.push([
        idx + 1,
        it.billId || '',
        it.productName || '',
        it.category || 'Khác',
        cleanNum(it.unitPrice),
        q,
        sub,
      ]);
    });

    itemRows.push(['TỔNG CỘNG', '', '', '', '', sumItemQty, sumItemAmount]);

    sheets.push({
      sheetName: 'Chi tiết món bán',
      rows: itemRows,
      colWidths: [6, 16, 30, 20, 16, 10, 18],
    });
  }

  exportToExcel(sheets, filename);
}

export async function exportDashboardPdf(payload: DashboardExportPayload) {
  const { bills, periodLabel, summary } = payload;
  const filename = `doanh_thu_${sanitizeFileName(periodLabel)}_${Date.now()}`;

  const tableRows: (string | number)[][] = bills.map((b, idx) => {
    const payTypeStr =
      b.paymentType === 'cash'
        ? 'Tiền mặt'
        : b.paymentType === 'transfer'
        ? 'Chuyển khoản'
        : b.paymentType === 'debt'
        ? 'Công nợ'
        : 'Kết hợp';

    return [
      idx + 1,
      b.billCode || '',
      b.tableName || '',
      formatDateDMY(b.billDate),
      payTypeStr,
      formatMoney(cleanNum(b.subtotalAmount || b.totalAmount)),
      formatMoney(cleanNum(b.discountAmount)),
      formatMoney(cleanNum(b.totalAmount)),
    ];
  });

  await exportToPdf({
    filename,
    reportTitle: 'BÁO CÁO TỔNG QUAN DOANH THU & KẾT QUẢ KINH DOANH',
    period: periodLabel,
    orientation: 'landscape',
    kpis: [
      { label: 'Thực thu (Doanh thu thuần)', value: formatMoney(summary.netRevenue), color: '#047857' },
      { label: '1. Tiền mặt (Gross)', value: formatMoney(summary.grossCash), color: '#059669' },
      { label: '2. Chuyển khoản', value: formatMoney(summary.netTransferRevenue), color: '#2563eb' },
      { label: '3. Khoản trừ trong ngày', value: `-${formatMoney(summary.totalDeductions)}`, color: '#e11d48' },
    ],
    tables: [
      {
        title: `Danh sách hóa đơn trong kỳ (${bills.length} bill)`,
        headers: ['STT', 'Mã Bill', 'Bàn', 'Ngày', 'Hình thức TT', 'Tạm tính', 'Giảm giá', 'Thành tiền'],
        aligns: ['center', 'center', 'center', 'center', 'center', 'right', 'right', 'right'],
        rows: tableRows,
        footers: [
          'TỔNG CỘNG',
          '',
          '',
          '',
          `${bills.length} bill`,
          '',
          formatMoney(summary.totalDiscounts),
          formatMoney(summary.grossCash + summary.netTransferRevenue),
        ],
      },
    ],
    notes: [
      'Doanh thu thuần (Thực thu) = Tiền mặt + Chuyển khoản - Khoản trừ.',
      `Tổng giảm giá món cho khách trong kỳ: ${formatMoney(summary.totalDiscounts)}.`,
      `Công nợ phát sinh trong kỳ: ${formatMoney(summary.debtCreated)}.`,
    ],
  });
}

// ============================================================================
// 3. ỨNG LƯƠNG (SALARY ADVANCES)
// ============================================================================
export interface SalaryAdvancesExportPayload {
  advances: SalaryAdvanceRecord[];
  employees?: EmployeeRecord[];
  periodLabel: string;
  totals: {
    totalAmount: number;
    count: number;
  };
}

export function exportSalaryAdvancesExcel(payload: SalaryAdvancesExportPayload) {
  const { advances, employees = [], periodLabel, totals } = payload;
  const filename = `ung_luong_${sanitizeFileName(periodLabel)}_${Date.now()}`;

  // Sheet 1: Danh sách từng phiếu ứng lương
  const rows: (string | number)[][] = [
    ['VỊNH QUÁN - BẢNG KÊ CHI TIẾT NHÂN VIÊN ỨNG LƯƠNG'],
    [`Kỳ theo dõi: ${periodLabel}`, '', '', '', '', `Xuất lúc: ${getTodayFormatted()}`],
    [],
    ['TỔNG QUAN:'],
    ['Tổng tiền nhân viên đã ứng', totals.totalAmount, 'VNĐ'],
    ['Tổng số lượt phiếu ứng', totals.count, 'Lượt'],
    [],
    [
      'STT',
      'Ngày ứng',
      'Họ và tên nhân viên',
      'Bộ phận / Chức vụ',
      'Số tiền ứng (VNĐ)',
      'Lý do / Nội dung ứng',
      'Người tạo / Duyệt',
    ],
  ];

  let sumAdv = 0;
  advances.forEach((adv, idx) => {
    const amt = cleanNum(adv.amount);
    sumAdv += amt;
    rows.push([
      idx + 1,
      formatDateDMY(adv.advanceDate),
      adv.employeeName || '',
      adv.employeeRole || '',
      amt,
      adv.note || 'Ứng lương',
      adv.createdBy || '',
    ]);
  });

  rows.push(['TỔNG CỘNG', '', '', '', sumAdv, `${advances.length} phiếu ứng`, '']);

  // Sheet 2: Tổng hợp theo từng nhân viên
  const summaryByEmp = new Map<string, { name: string; role: string; total: number; count: number }>();
  advances.forEach((adv) => {
    const key = adv.employeeId || adv.employeeName;
    const cur = summaryByEmp.get(key) || {
      name: adv.employeeName,
      role: adv.employeeRole || '',
      total: 0,
      count: 0,
    };
    cur.total += cleanNum(adv.amount);
    cur.count += 1;
    summaryByEmp.set(key, cur);
  });

  const empRows: (string | number)[][] = [
    ['TỔNG HỢP TIỀN ỨNG THEO TỪNG NHÂN VIÊN'],
    [`Kỳ theo dõi: ${periodLabel}`],
    [],
    ['STT', 'Họ và tên nhân viên', 'Bộ phận / Chức vụ', 'Số lượt ứng', 'Tổng tiền đã ứng (VNĐ)'],
  ];

  let empIdx = 0;
  let sumEmpTotal = 0;
  for (const item of summaryByEmp.values()) {
    empIdx++;
    sumEmpTotal += item.total;
    empRows.push([empIdx, item.name, item.role, `${item.count} lần`, item.total]);
  }
  empRows.push(['TỔNG CỘNG', '', '', `${totals.count} lượt`, sumEmpTotal]);

  exportToExcel(
    [
      { sheetName: 'Danh sách phiếu ứng', rows, colWidths: [6, 14, 25, 20, 18, 30, 18] },
      { sheetName: 'Tổng hợp theo nhân viên', rows: empRows, colWidths: [6, 25, 20, 14, 22] },
    ],
    filename
  );
}

export async function exportSalaryAdvancesPdf(payload: SalaryAdvancesExportPayload) {
  const { advances, periodLabel, totals } = payload;
  const filename = `ung_luong_${sanitizeFileName(periodLabel)}_${Date.now()}`;

  const tableRows: (string | number)[][] = advances.map((adv, idx) => [
    idx + 1,
    formatDateDMY(adv.advanceDate),
    adv.employeeName || '',
    adv.employeeRole || '',
    formatMoney(cleanNum(adv.amount)),
    adv.note || 'Ứng lương',
    adv.createdBy || '',
  ]);

  // Aggregate by employee
  const summaryByEmp = new Map<string, { name: string; role: string; total: number; count: number }>();
  advances.forEach((adv) => {
    const key = adv.employeeId || adv.employeeName;
    const cur = summaryByEmp.get(key) || {
      name: adv.employeeName,
      role: adv.employeeRole || '',
      total: 0,
      count: 0,
    };
    cur.total += cleanNum(adv.amount);
    cur.count += 1;
    summaryByEmp.set(key, cur);
  });

  const empSummaryRows: (string | number)[][] = Array.from(summaryByEmp.values()).map((it, idx) => [
    idx + 1,
    it.name,
    it.role,
    `${it.count} lần`,
    formatMoney(it.total),
  ]);

  await exportToPdf({
    filename,
    reportTitle: 'BẢNG KÊ & TỔNG HỢP NHÂN VIÊN ỨNG LƯƠNG',
    period: periodLabel,
    orientation: 'portrait',
    kpis: [
      { label: 'Tổng tiền ứng lương', value: formatMoney(totals.totalAmount), color: '#e11d48' },
      { label: 'Số lượt phiếu ứng', value: `${totals.count} phiếu`, color: '#047857' },
      { label: 'Số nhân viên đã ứng', value: `${summaryByEmp.size} người`, color: '#2563eb' },
    ],
    tables: [
      {
        title: '1. Bảng tổng hợp số tiền ứng theo nhân viên',
        headers: ['STT', 'Họ và tên nhân viên', 'Chức vụ', 'Số lượt', 'Tổng tiền ứng'],
        aligns: ['center', 'left', 'left', 'center', 'right'],
        rows: empSummaryRows,
        footers: ['TỔNG', '', '', `${totals.count} lượt`, formatMoney(totals.totalAmount)],
      },
      {
        title: '2. Sổ chi tiết các phiếu ứng lương',
        headers: ['STT', 'Ngày ứng', 'Họ tên nhân viên', 'Chức vụ', 'Số tiền', 'Lý do / Nội dung', 'Người duyệt'],
        aligns: ['center', 'center', 'left', 'left', 'right', 'left', 'center'],
        rows: tableRows,
        footers: ['TỔNG', '', '', '', formatMoney(totals.totalAmount), `${advances.length} phiếu`, ''],
      },
    ],
    signatures: ['Nhân Viên Xác Nhận', 'Kế Toán / Thủ Quỹ', 'Chủ Quán / Quản Lý'],
  });
}

// ============================================================================
// 4. HOÀN TRẢ (CUSTOMER ITEM RETURNS)
// ============================================================================
export interface ReturnsExportPayload {
  returns: ReturnRecord[];
  periodLabel: string;
  totals: {
    totalAmount: number;
    totalQty: number;
    count: number;
  };
}

export function exportReturnsExcel(payload: ReturnsExportPayload) {
  const { returns, periodLabel, totals } = payload;
  const filename = `hoan_tra_${sanitizeFileName(periodLabel)}_${Date.now()}`;

  const rows: (string | number)[][] = [
    ['VỊNH QUÁN - BÁO CÁO HOÀN TRẢ BIA & MÓN THỪA CHO KHÁCH'],
    [`Kỳ báo cáo: ${periodLabel}`, '', '', '', '', `Xuất lúc: ${getTodayFormatted()}`],
    [],
    ['TỔNG QUAN HOÀN TRẢ:'],
    ['Tổng tiền hoàn trả cho khách', totals.totalAmount, 'VNĐ', '(Đã tính vào Khoản trừ)'],
    ['Tổng số lượng hoàn trả', totals.totalQty, 'Món / Lon / Chai'],
    ['Tổng số lượt phiếu hoàn', totals.count, 'Lượt'],
    [],
    [
      'STT',
      'Ngày hoàn trả',
      'Số bàn',
      'Tên món / Bia hoàn trả',
      'Danh mục',
      'Đơn giá (VNĐ)',
      'Số lượng',
      'Thành tiền hoàn (VNĐ)',
      'Mã bill gốc',
      'Lý do / Ghi chú',
    ],
  ];

  let sumAmount = 0;
  let sumQty = 0;
  returns.forEach((r, idx) => {
    const q = cleanNum(r.quantity);
    const amt = cleanNum(r.amount);
    sumQty += q;
    sumAmount += amt;

    rows.push([
      idx + 1,
      formatDateDMY(r.returnDate || r.billDate),
      r.billCode || '',
      r.productName || '',
      r.category || 'Khác',
      cleanNum(r.unitPrice),
      q,
      amt,
      r.billCode || '',
      r.note || '',
    ]);
  });

  rows.push([
    'TỔNG CỘNG',
    '',
    '',
    '',
    '',
    '',
    sumQty,
    sumAmount,
    `${returns.length} phiếu hoàn`,
    '',
  ]);

  exportToExcel(
    [
      {
        sheetName: 'Danh sách hoàn trả',
        rows,
        colWidths: [6, 14, 12, 30, 16, 16, 10, 20, 16, 25],
      },
    ],
    filename
  );
}

export async function exportReturnsPdf(payload: ReturnsExportPayload) {
  const { returns, periodLabel, totals } = payload;
  const filename = `hoan_tra_${sanitizeFileName(periodLabel)}_${Date.now()}`;

  const tableRows: (string | number)[][] = returns.map((r, idx) => [
    idx + 1,
    formatDateDMY(r.returnDate || r.billDate),
    r.productName || '',
    r.category || 'Khác',
    formatMoney(cleanNum(r.unitPrice)),
    cleanNum(r.quantity),
    formatMoney(cleanNum(r.amount)),
    r.billCode || '',
    r.note || '',
  ]);

  await exportToPdf({
    filename,
    reportTitle: 'BÁO CÁO HOÀN TRẢ BIA & MÓN THỪA',
    period: periodLabel,
    orientation: 'landscape',
    kpis: [
      { label: 'Tổng tiền hoàn trả', value: `-${formatMoney(totals.totalAmount)}`, color: '#e11d48' },
      { label: 'Số lượng hoàn', value: `${totals.totalQty} món/lon`, color: '#047857' },
      { label: 'Số lượt hoàn trả', value: `${totals.count} lượt`, color: '#2563eb' },
    ],
    tables: [
      {
        title: `Danh sách các khoản hoàn trả (${returns.length} phiếu)`,
        headers: ['STT', 'Ngày hoàn', 'Tên món / Bia hoàn', 'Danh mục', 'Đơn giá', 'SL', 'Tiền hoàn', 'Mã Bill', 'Ghi chú'],
        aligns: ['center', 'center', 'left', 'left', 'right', 'center', 'right', 'center', 'left'],
        rows: tableRows,
        footers: ['TỔNG', '', '', '', '', totals.totalQty, `-${formatMoney(totals.totalAmount)}`, '', ''],
      },
    ],
    notes: [
      'Khoản hoàn trả được tự động đồng bộ sang Khoản trừ trong ngày và hoàn lại số lượng vào tồn kho.',
      'Định dạng khoản trừ: Số bàn - Tên món - Số lượng hoàn trả.',
    ],
  });
}

// ============================================================================
// 5. CÔNG NỢ (DEBTS & RECEIVABLES)
// ============================================================================
export interface DebtsExportPayload {
  debtBills: BillRecord[];
  debtPayments: DebtPaymentRecord[];
  debtors: string[];
  totals: {
    totalUnpaid: number;
    totalPaid: number;
    totalBills: number;
    debtorsCount: number;
  };
}

export function exportDebtsExcel(payload: DebtsExportPayload) {
  const { debtBills, debtPayments, totals, debtors } = payload;
  const filename = `cong_no_${Date.now()}`;

  // Map billId -> payments
  const paymentsByBillId = new Map<string, DebtPaymentRecord[]>();
  debtPayments.forEach((p) => {
    if (!p || !p.billId) return;
    const list = paymentsByBillId.get(p.billId) || [];
    list.push(p);
    paymentsByBillId.set(p.billId, list);
  });

  // Aggregate by debtor
  const debtorMap = new Map<
    string,
    { name: string; billCount: number; original: number; paid: number; remaining: number }
  >();

  debtBills.forEach((b) => {
    const name = (b.debtorName || 'Khách nợ').trim();
    const netOriginal = Math.max(0, cleanNum(b.totalAmount) - cleanNum(b.deductedAmount));
    const list = paymentsByBillId.get(b.id) || [];
    const paidInst = list.reduce((s, p) => s + cleanNum(p.amount), 0);
    const isFullyPaid =
      b.debtStatus === 'paid' || b.paymentType !== 'debt' || (netOriginal > 0 && paidInst >= netOriginal);
    const remaining = isFullyPaid ? 0 : Math.max(0, netOriginal - paidInst);
    const effectivePaid = isFullyPaid ? netOriginal : Math.min(netOriginal, paidInst);

    const cur = debtorMap.get(name.toLowerCase()) || {
      name,
      billCount: 0,
      original: 0,
      paid: 0,
      remaining: 0,
    };
    cur.billCount += 1;
    cur.original += netOriginal;
    cur.paid += effectivePaid;
    cur.remaining += remaining;
    debtorMap.set(name.toLowerCase(), cur);
  });

  // Sheet 1: Tổng hợp khách nợ
  const debtorRows: (string | number)[][] = [
    ['VỊNH QUÁN - BÁO CÁO TỔNG HỢP CÔNG NỢ KHÁCH HÀNG'],
    [`Xuất lúc: ${getTodayFormatted()}`],
    [],
    ['TỔNG QUAN CÔNG NỢ:'],
    ['Đang ghi nợ (Chưa thu)', totals.totalUnpaid, 'VNĐ'],
    ['Đã hoàn tất (Đã thu)', totals.totalPaid, 'VNĐ'],
    ['Tổng số hóa đơn nợ', totals.totalBills, 'Hóa đơn'],
    ['Số khách hàng nợ', totals.debtorsCount, 'Khách hàng'],
    [],
    [
      'STT',
      'Tên khách hàng nợ',
      'Số hóa đơn nợ',
      'Tổng tiền nợ gốc (VNĐ)',
      'Đã thanh toán (VNĐ)',
      'Dư nợ còn lại (VNĐ)',
      'Tình trạng',
    ],
  ];

  let sumOrig = 0;
  let sumPaid = 0;
  let sumRem = 0;
  let dIdx = 0;

  for (const item of debtorMap.values()) {
    dIdx++;
    sumOrig += item.original;
    sumPaid += item.paid;
    sumRem += item.remaining;
    debtorRows.push([
      dIdx,
      item.name,
      item.billCount,
      item.original,
      item.paid,
      item.remaining,
      item.remaining === 0 ? 'Đã tất toán' : 'Đang nợ',
    ]);
  }

  debtorRows.push(['TỔNG CỘNG', '', totals.totalBills, sumOrig, sumPaid, sumRem, '']);

  // Sheet 2: Chi tiết từng hóa đơn nợ
  const billRows: (string | number)[][] = [
    ['DANH SÁCH CHI TIẾT HÓA ĐƠN CÔNG NỢ'],
    [`Xuất lúc: ${getTodayFormatted()}`],
    [],
    [
      'STT',
      'Khách ghi nợ',
      'Mã hóa đơn',
      'Bàn',
      'Ngày ghi nợ',
      'Tổng tiền nợ gốc (VNĐ)',
      'Đã trả (VNĐ)',
      'Còn nợ (VNĐ)',
      'Trạng thái',
      'Ghi chú',
    ],
  ];

  debtBills.forEach((b, idx) => {
    const netOriginal = Math.max(0, cleanNum(b.totalAmount) - cleanNum(b.deductedAmount));
    const list = paymentsByBillId.get(b.id) || [];
    const paidInst = list.reduce((s, p) => s + cleanNum(p.amount), 0);
    const isFullyPaid =
      b.debtStatus === 'paid' || b.paymentType !== 'debt' || (netOriginal > 0 && paidInst >= netOriginal);
    const remaining = isFullyPaid ? 0 : Math.max(0, netOriginal - paidInst);
    const effectivePaid = isFullyPaid ? netOriginal : Math.min(netOriginal, paidInst);

    billRows.push([
      idx + 1,
      b.debtorName || '',
      b.billCode || '',
      b.tableName || '',
      formatDateDMY(b.billDate),
      netOriginal,
      effectivePaid,
      remaining,
      isFullyPaid ? 'Đã tất toán' : 'Chưa tất toán',
      (b as any).debtPaymentNote || b.note || '',
    ]);
  });

  // Sheet 3: Lịch sử thanh toán thu nợ
  const paymentRows: (string | number)[][] = [
    ['LỊCH SỬ CÁC ĐỢT THANH TOÁN & THU NỢ'],
    [`Xuất lúc: ${getTodayFormatted()}`],
    [],
    ['STT', 'Ngày thu', 'Khách trả nợ', 'Mã hóa đơn', 'Số tiền thu (VNĐ)', 'Phương thức', 'Ghi chú'],
  ];

  let sumPay = 0;
  debtPayments.forEach((p, idx) => {
    const amt = cleanNum(p.amount);
    sumPay += amt;
    paymentRows.push([
      idx + 1,
      formatDateDMY(p.paidDate),
      p.debtorName || '',
      p.billCode || '',
      amt,
      p.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt',
      p.note || '',
    ]);
  });

  paymentRows.push(['TỔNG CỘNG', '', '', '', sumPay, '', '']);

  exportToExcel(
    [
      { sheetName: 'Tổng hợp khách nợ', rows: debtorRows, colWidths: [6, 25, 14, 22, 20, 20, 16] },
      { sheetName: 'Chi tiết hóa đơn nợ', rows: billRows, colWidths: [6, 25, 16, 12, 14, 20, 18, 18, 16, 25] },
      { sheetName: 'Lịch sử thu nợ', rows: paymentRows, colWidths: [6, 14, 25, 16, 18, 16, 30] },
    ],
    filename
  );
}

export async function exportDebtsPdf(payload: DebtsExportPayload) {
  const { debtBills, debtPayments, totals } = payload;
  const filename = `cong_no_${Date.now()}`;

  const paymentsByBillId = new Map<string, DebtPaymentRecord[]>();
  debtPayments.forEach((p) => {
    if (!p || !p.billId) return;
    const list = paymentsByBillId.get(p.billId) || [];
    list.push(p);
    paymentsByBillId.set(p.billId, list);
  });

  const debtorMap = new Map<
    string,
    { name: string; billCount: number; original: number; paid: number; remaining: number }
  >();

  debtBills.forEach((b) => {
    const name = (b.debtorName || 'Khách nợ').trim();
    const netOriginal = Math.max(0, cleanNum(b.totalAmount) - cleanNum(b.deductedAmount));
    const list = paymentsByBillId.get(b.id) || [];
    const paidInst = list.reduce((s, p) => s + cleanNum(p.amount), 0);
    const isFullyPaid =
      b.debtStatus === 'paid' || b.paymentType !== 'debt' || (netOriginal > 0 && paidInst >= netOriginal);
    const remaining = isFullyPaid ? 0 : Math.max(0, netOriginal - paidInst);
    const effectivePaid = isFullyPaid ? netOriginal : Math.min(netOriginal, paidInst);

    const cur = debtorMap.get(name.toLowerCase()) || {
      name,
      billCount: 0,
      original: 0,
      paid: 0,
      remaining: 0,
    };
    cur.billCount += 1;
    cur.original += netOriginal;
    cur.paid += effectivePaid;
    cur.remaining += remaining;
    debtorMap.set(name.toLowerCase(), cur);
  });

  const debtorTableRows: (string | number)[][] = Array.from(debtorMap.values()).map((it, idx) => [
    idx + 1,
    it.name,
    `${it.billCount} bill`,
    formatMoney(it.original),
    formatMoney(it.paid),
    formatMoney(it.remaining),
    it.remaining === 0 ? 'Đã tất toán' : 'Đang nợ',
  ]);

  const billTableRows: (string | number)[][] = debtBills.slice(0, 50).map((b, idx) => {
    const netOriginal = Math.max(0, cleanNum(b.totalAmount) - cleanNum(b.deductedAmount));
    const list = paymentsByBillId.get(b.id) || [];
    const paidInst = list.reduce((s, p) => s + cleanNum(p.amount), 0);
    const isFullyPaid =
      b.debtStatus === 'paid' || b.paymentType !== 'debt' || (netOriginal > 0 && paidInst >= netOriginal);
    const remaining = isFullyPaid ? 0 : Math.max(0, netOriginal - paidInst);
    const effectivePaid = isFullyPaid ? netOriginal : Math.min(netOriginal, paidInst);

    return [
      idx + 1,
      b.debtorName || '',
      b.billCode || '',
      formatDateDMY(b.billDate),
      formatMoney(netOriginal),
      formatMoney(effectivePaid),
      formatMoney(remaining),
      isFullyPaid ? 'Đã tất toán' : 'Chưa tất toán',
    ];
  });

  await exportToPdf({
    filename,
    reportTitle: 'BÁO CÁO THEO DÕI CÔNG NỢ KHÁCH HÀNG',
    orientation: 'landscape',
    kpis: [
      { label: 'Đang ghi nợ (Chưa thu)', value: formatMoney(totals.totalUnpaid), color: '#d97706' },
      { label: 'Đã hoàn tất (Đã thu)', value: formatMoney(totals.totalPaid), color: '#059669' },
      { label: 'Số khách nợ', value: `${totals.debtorsCount} khách`, color: '#0f172a' },
      { label: 'Số hóa đơn công nợ', value: `${totals.totalBills} bill`, color: '#2563eb' },
    ],
    tables: [
      {
        title: '1. Bảng tổng hợp công nợ theo từng khách hàng',
        headers: ['STT', 'Tên khách nợ', 'Số bill', 'Tiền nợ gốc', 'Đã thanh toán', 'Dư nợ còn lại', 'Tình trạng'],
        aligns: ['center', 'left', 'center', 'right', 'right', 'right', 'center'],
        rows: debtorTableRows,
        footers: [
          'TỔNG CỘNG',
          '',
          `${totals.totalBills} bill`,
          '',
          formatMoney(totals.totalPaid),
          formatMoney(totals.totalUnpaid),
          '',
        ],
      },
      {
        title: `2. Danh sách hóa đơn công nợ chi tiết ${debtBills.length > 50 ? '(50 hóa đơn gần nhất)' : ''}`,
        headers: ['STT', 'Khách nợ', 'Mã Bill', 'Ngày ghi nợ', 'Nợ gốc', 'Đã trả', 'Còn nợ', 'Trạng thái'],
        aligns: ['center', 'left', 'center', 'center', 'right', 'right', 'right', 'center'],
        rows: billTableRows,
      },
    ],
    notes: [
      'Công nợ khi được tất toán bằng tiền mặt hoặc chuyển khoản sẽ được tính vào doanh thu thực thu theo ngày thanh toán.',
    ],
  });
}
