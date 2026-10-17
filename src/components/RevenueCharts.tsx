import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  DollarSign,
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Clock,
  RotateCcw,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import {
  formatVND,
  formatNumber,
  getPrivacyMaskMode,
  isOwnerUseBill,
  getBillPaymentBreakdown,
  formatDateDMY,
} from '../utils/parser';
import {
  BillRecord,
  DeductionRecord,
  DebtPaymentRecord,
  PeriodPreset,
} from '../types';

export interface DailyRevenuePoint {
  date: string;
  label: string;
  cash: number;
  transfer: number;
  deduction: number;
  debt: number;
  netCash: number;
  netDayTotal: number; // Tiền mặt + Chuyển khoản - Khoản trừ - Công nợ
}

interface RevenueColumnChartProps {
  data: DailyRevenuePoint[];
}

export const RevenueColumnChart: React.FC<RevenueColumnChartProps> = ({ data }) => {
  const [chartMode, setChartMode] = useState<'breakdown' | 'net'>('breakdown');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        Chưa có dữ liệu hóa đơn trong khoảng thời gian đã chọn để hiển thị biểu đồ cột.
      </div>
    );
  }

  const maxVal = Math.max(
    100000,
    ...data.flatMap((d) =>
      chartMode === 'breakdown'
        ? [d.cash, d.transfer, d.deduction, d.debt, Math.max(0, d.netDayTotal)]
        : [Math.max(0, d.netDayTotal), d.cash + d.transfer]
    )
  );

  const activePoint =
    selectedIdx !== null && data[selectedIdx] ? data[selectedIdx] : data[data.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Biểu đồ cột theo dõi biến động doanh thu
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Chạm hoặc di chuột vào cột ngày để xem chi tiết Tiền mặt, Chuyển khoản, Khoản trừ, Công nợ
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start">
          <button
            type="button"
            onClick={() => setChartMode('breakdown')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              chartMode === 'breakdown'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Chi tiết 4 chỉ số
          </button>
          <button
            type="button"
            onClick={() => setChartMode('net')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              chartMode === 'net'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Tổng ngày (Thực thu)
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
        {chartMode === 'breakdown' ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
              <span>Tiền mặt</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 inline-block" />
              <span>Chuyển khoản</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
              <span>Khoản trừ</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
              <span>Công nợ</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-600 dark:bg-indigo-400 inline-block" />
              <span>Tổng ngày (Thực thu)</span>
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
              <span>Tổng ngày = Tiền mặt + CK - Khoản trừ - Công nợ</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 dark:bg-slate-700 inline-block" />
              <span>Tổng Tiền mặt + CK (Trước trừ)</span>
            </span>
          </>
        )}
      </div>

      {/* Column Chart Viewport */}
      <div className="pt-4 pb-2 px-2 sm:px-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/60 dark:bg-slate-950/40 overflow-x-auto">
        <div className="min-w-[320px]">
          <div className="h-56 sm:h-64 flex items-end gap-2 sm:gap-6 border-b border-slate-200 dark:border-slate-800 pb-2 px-1 sm:px-2">
            {data.map((point, idx) => {
              const maxBarPx = 180;
              const cashH = Math.max(3, Math.round((point.cash / maxVal) * maxBarPx));
              const transH = Math.max(3, Math.round((point.transfer / maxVal) * maxBarPx));
              const dedH = Math.max(3, Math.round((point.deduction / maxVal) * maxBarPx));
              const debtH = Math.max(3, Math.round((point.debt / maxVal) * maxBarPx));
              const netVal = Math.max(0, point.netDayTotal);
              const netH = Math.max(3, Math.round((netVal / maxVal) * maxBarPx));
              const grossPaidH = Math.max(
                3,
                Math.round(((point.cash + point.transfer) / maxVal) * maxBarPx)
              );
              const isSelected = activePoint?.date === point.date;

              return (
                <div
                  key={point.date}
                  onClick={() => setSelectedIdx(idx)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={`flex-1 min-w-[54px] flex flex-col items-center group relative cursor-pointer rounded-lg py-1 transition-colors ${
                    isSelected ? 'bg-emerald-500/5 dark:bg-emerald-500/10' : ''
                  }`}
                >
                  {/* Value label on top */}
                  <div className="mb-1.5 text-[10px] sm:text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {getPrivacyMaskMode()
                      ? '***k'
                      : `${formatNumber(Math.round(point.netDayTotal / 1000))}k`}
                  </div>

                  {/* Columns Group */}
                  <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1.5 h-[185px]">
                    {chartMode === 'breakdown' ? (
                      <>
                        <div
                          style={{ height: `${point.cash > 0 ? cashH : 3}px` }}
                          title={`Tiền mặt: ${formatVND(point.cash)}`}
                          className="w-2 sm:w-3.5 bg-emerald-500 rounded-t-xs"
                        />
                        <div
                          style={{ height: `${point.transfer > 0 ? transH : 3}px` }}
                          title={`Chuyển khoản: ${formatVND(point.transfer)}`}
                          className="w-2 sm:w-3.5 bg-blue-500 rounded-t-xs"
                        />
                        <div
                          style={{ height: `${point.deduction > 0 ? dedH : 3}px` }}
                          title={`Khoản trừ: ${formatVND(point.deduction)}`}
                          className="w-2 sm:w-3.5 bg-rose-500 rounded-t-xs"
                        />
                        <div
                          style={{ height: `${point.debt > 0 ? debtH : 3}px` }}
                          title={`Công nợ: ${formatVND(point.debt)}`}
                          className="w-2 sm:w-3.5 bg-amber-500 rounded-t-xs"
                        />
                        <div
                          style={{ height: `${netVal > 0 ? netH : 3}px` }}
                          title={`Tổng ngày (Thực thu): ${formatVND(point.netDayTotal)}`}
                          className="w-2 sm:w-3.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-xs"
                        />
                      </>
                    ) : (
                      <>
                        <div
                          style={{ height: `${point.cash + point.transfer > 0 ? grossPaidH : 3}px` }}
                          title={`Tiền mặt + CK: ${formatVND(point.cash + point.transfer)}`}
                          className="w-4 sm:w-7 bg-slate-300 dark:bg-slate-700 rounded-t-xs"
                        />
                        <div
                          style={{ height: `${netVal > 0 ? netH : 3}px` }}
                          title={`Tổng ngày (Thực thu): ${formatVND(point.netDayTotal)}`}
                          className="w-4 sm:w-7 bg-emerald-600 dark:bg-emerald-500 rounded-t-xs"
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-Axis Labels */}
          <div className="flex items-center gap-2 sm:gap-6 pt-2 px-1 sm:px-2">
            {data.map((point, idx) => {
              const isSelected = activePoint?.date === point.date;
              return (
                <button
                  key={point.date}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  className={`flex-1 min-w-[54px] text-center py-1 rounded-md text-xs font-mono cursor-pointer ${
                    isSelected
                      ? 'font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {point.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active Day Detail Summary Strip */}
      {activePoint && (
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs font-mono">
          <div>
            <span className="text-[11px] text-slate-500 block font-sans">Ngày chọn</span>
            <strong className="text-slate-900 dark:text-white">{activePoint.date}</strong>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block font-sans">Tiền mặt</span>
            <strong className="text-emerald-600 dark:text-emerald-400">
              {formatVND(activePoint.cash)}
            </strong>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block font-sans">Chuyển khoản</span>
            <strong className="text-blue-600 dark:text-blue-400">
              {formatVND(activePoint.transfer)}
            </strong>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block font-sans">Khoản trừ</span>
            <strong className="text-rose-600 dark:text-rose-400">
              -{formatVND(activePoint.deduction)}
            </strong>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block font-sans">Công nợ</span>
            <strong className="text-amber-600 dark:text-amber-400">
              -{formatVND(activePoint.debt)}
            </strong>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block font-sans">Tổng ngày</span>
            <strong className="text-emerald-600 dark:text-emerald-400">
              {formatVND(activePoint.netDayTotal)}
            </strong>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// REVENUE TREND LINE CHART (XU HƯỚNG DOANH THU: THEO TUẦN, THEO THÁNG, THEO KHOẢNG NGÀY)
// ============================================================================

export interface WeeklyTrendDayPoint {
  date: string; // YYYY-MM-DD
  dayLabel: string; // 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'
  shortDate: string; // '04/10'
  netRevenue: number; // Doanh thu thực thu sau khoản trừ & cộng thu nợ
  grossRevenue: number; // Doanh thu bán hàng (Tiền mặt + Chuyển khoản + Ghi nợ mới)
  cashRevenue: number; // Tiền mặt thực nhận (bán + thu nợ - chi tiêu)
  transferRevenue: number; // Chuyển khoản thực nhận (bán + thu nợ)
  debtCollected: number; // Công nợ đã thu trong ngày
  deductions: number; // Khoản trừ chi tiêu
  billsCount: number; // Số hóa đơn trong ngày
  growthRatePct?: number; // % Tăng trưởng so với ngày liền trước
}

export interface RevenueTrendChartProps {
  data?: WeeklyTrendDayPoint[];
  todayStr: string;
  bills?: BillRecord[];
  deductions?: DeductionRecord[];
  debtPayments?: DebtPaymentRecord[];
  dashboardPeriodPreset?: PeriodPreset;
  dashboardStartDate?: string;
  dashboardEndDate?: string;
  initialRangeMode?: 'week' | 'month' | 'custom' | 'last30';
}

export type WeeklyRevenueTrendChartProps = RevenueTrendChartProps;

/**
 * Generate smooth cubic Bezier curve SVG path string from points
 */
function getBezierCurvePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const prev = points[i - 1] || current;
    const afterNext = points[i + 2] || next;

    const tension = 0.18;
    const cp1x = current.x + (next.x - prev.x) * tension;
    const cp1y = current.y + (next.y - prev.y) * tension;
    const cp2x = next.x - (afterNext.x - current.x) * tension;
    const cp2y = next.y - (afterNext.y - current.y) * tension;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
  }
  return path;
}

export const RevenueTrendChart: React.FC<RevenueTrendChartProps> = ({
  data,
  todayStr,
  bills,
  deductions,
  debtPayments,
  dashboardPeriodPreset,
  dashboardStartDate,
  dashboardEndDate,
  initialRangeMode,
}) => {
  const [metricMode, setMetricMode] = useState<'net' | 'gross' | 'split'>('net');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Range viewing state: 'week' (7 days) | 'month' (theo tháng) | 'custom' (khoảng ngày đã chọn) | 'last30' (30 ngày)
  const [rangeMode, setRangeMode] = useState<'week' | 'month' | 'custom' | 'last30'>(() => {
    if (initialRangeMode) return initialRangeMode;
    if (dashboardPeriodPreset === 'month') return 'month';
    if (dashboardPeriodPreset === 'custom') return 'custom';
    return 'week';
  });

  const [selectedMonth, setSelectedMonth] = useState<string>(() => todayStr.slice(0, 7));
  const [customRangeStart, setCustomRangeStart] = useState<string>(
    () => dashboardStartDate || `${todayStr.slice(0, 7)}-01`
  );
  const [customRangeEnd, setCustomRangeEnd] = useState<string>(
    () => dashboardEndDate || todayStr
  );

  // Detect unique months from bills
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(todayStr.slice(0, 7));
    if (bills) {
      for (const b of bills) {
        if (b && b.billDate && b.billDate.length >= 7) {
          set.add(b.billDate.slice(0, 7));
        }
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [bills, todayStr]);

  // Handle month shifting
  const handlePrevMonth = () => {
    const parts = selectedMonth.split('-');
    let y = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10) - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const parts = selectedMonth.split('-');
    let y = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10) + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  };

  // Sync with dashboard filter
  const handleSyncDashboardFilter = () => {
    if (dashboardStartDate && dashboardEndDate) {
      setCustomRangeStart(dashboardStartDate);
      setCustomRangeEnd(dashboardEndDate);
    }
  };

  // Dynamic Trend Data Generation
  const { chartData, rangeTitle, rangeSubtitle } = useMemo(() => {
    // If no raw bills provided, fall back to props.data
    if (!bills || bills.length === 0) {
      const fallback = data || [];
      return {
        chartData: fallback,
        rangeTitle: 'Xu Hướng Doanh Thu (7 Ngày Gần Nhất)',
        rangeSubtitle: 'Theo dõi đà tăng trưởng doanh thu thực tế trong 7 ngày qua',
      };
    }

    const dayLabelsMap = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const dates: string[] = [];
    let title = 'Xu Hướng Doanh Thu 7 Ngày Gần Nhất';
    let subtitle = 'Theo dõi đà tăng trưởng doanh thu thực tế 7 ngày gần nhất';

    if (rangeMode === 'week') {
      const baseEnd = new Date(`${todayStr}T12:00:00`);
      for (let i = 6; i >= 0; i--) {
        const d = new Date(baseEnd);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
      }
      title = 'Xu Hướng Doanh Thu 7 Ngày Gần Nhất';
      subtitle = 'Theo dõi chi tiết từng ngày trong 7 ngày gần nhất';
    } else if (rangeMode === 'last30') {
      const baseEnd = new Date(`${todayStr}T12:00:00`);
      for (let i = 29; i >= 0; i--) {
        const d = new Date(baseEnd);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
      }
      title = 'Xu Hướng Doanh Thu 30 Ngày Gần Nhất';
      subtitle = 'Toàn cảnh doanh thu bán hàng & thực thu 30 ngày qua';
    } else if (rangeMode === 'month') {
      const parts = selectedMonth.split('-');
      const y = parseInt(parts[0], 10) || 2026;
      const m = parseInt(parts[1], 10) || 10;
      const daysInMonth = new Date(y, m, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = String(day).padStart(2, '0');
        dates.push(`${parts[0]}-${parts[1]}-${dayStr}`);
      }
      title = `Xu Hướng Doanh Thu Tháng ${parts[1]}/${parts[0]}`;
      subtitle = `Theo dõi toàn bộ ${daysInMonth} ngày trong tháng ${parts[1]}/${parts[0]}`;
    } else if (rangeMode === 'custom') {
      const start = new Date(`${customRangeStart}T12:00:00`);
      const end = new Date(`${customRangeEnd}T12:00:00`);
      if (start <= end) {
        const cur = new Date(start);
        let count = 0;
        while (cur <= end && count < 90) {
          dates.push(cur.toISOString().slice(0, 10));
          cur.setDate(cur.getDate() + 1);
          count++;
        }
      } else {
        dates.push(customRangeStart);
      }
      title = `Xu Hướng Doanh Thu (${formatDateDMY(customRangeStart)} → ${formatDateDMY(customRangeEnd)})`;
      subtitle = `Khoảng ${dates.length} ngày đã chọn từ ${formatDateDMY(customRangeStart)} đến ${formatDateDMY(customRangeEnd)}`;
    }

    // Map metrics for each date
    const dateMetrics = new Map<
      string,
      {
        cashBills: number;
        transferBills: number;
        debtBills: number;
        deductions: number;
        debtPaidCash: number;
        debtPaidTransfer: number;
        billsCount: number;
      }
    >();

    for (const d of dates) {
      dateMetrics.set(d, {
        cashBills: 0,
        transferBills: 0,
        debtBills: 0,
        deductions: 0,
        debtPaidCash: 0,
        debtPaidTransfer: 0,
        billsCount: 0,
      });
    }

    // Aggregate bills
    for (const b of bills) {
      if (!b || !b.billDate || !dateMetrics.has(b.billDate)) continue;
      const m = dateMetrics.get(b.billDate)!;
      m.billsCount += 1;
      if (!isOwnerUseBill(b)) {
        const bd = getBillPaymentBreakdown(b);
        m.cashBills += bd.cash;
        m.transferBills += bd.transfer;
        m.debtBills += bd.debt;
      }
    }

    // Aggregate deductions
    if (deductions) {
      for (const d of deductions) {
        const dateKey = d.deductionDate || d.billDate;
        if (!dateKey || !dateMetrics.has(dateKey)) continue;
        const m = dateMetrics.get(dateKey)!;
        m.deductions += Number(d.amount) || 0;
      }
    }

    // Aggregate debt payments
    if (debtPayments) {
      for (const p of debtPayments) {
        if (!p || !p.paidDate || !dateMetrics.has(p.paidDate)) continue;
        const m = dateMetrics.get(p.paidDate)!;
        const pAmt = Number(p.amount) || 0;
        if (p.paymentMethod === 'cash') {
          m.debtPaidCash += pAmt;
        } else if (p.paymentMethod === 'transfer') {
          m.debtPaidTransfer += pAmt;
        }
      }
    }

    // Build trend day points with growth rate
    let prevNet: number | null = null;
    const points: WeeklyTrendDayPoint[] = dates.map((dStr) => {
      const m = dateMetrics.get(dStr)!;
      const dt = new Date(`${dStr}T00:00:00`);
      const dayLabel = dayLabelsMap[dt.getDay()] || 'T?';
      const parts = dStr.split('-');
      const shortDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dStr;

      const cashRevenue = m.cashBills + m.debtPaidCash - m.deductions;
      const transferRevenue = m.transferBills + m.debtPaidTransfer;
      const debtCollected = m.debtPaidCash + m.debtPaidTransfer;
      const netRevenue = m.cashBills + m.transferBills + debtCollected - m.deductions;
      const grossRevenue = m.cashBills + m.transferBills + m.debtBills;

      let growthRatePct: number | undefined;
      if (prevNet !== null) {
        if (prevNet > 0) {
          growthRatePct = Math.round(((netRevenue - prevNet) / prevNet) * 100);
        } else if (netRevenue > 0) {
          growthRatePct = 100;
        } else {
          growthRatePct = 0;
        }
      }
      prevNet = netRevenue;

      return {
        date: dStr,
        dayLabel,
        shortDate,
        netRevenue,
        grossRevenue,
        cashRevenue,
        transferRevenue,
        debtCollected,
        deductions: m.deductions,
        billsCount: m.billsCount,
        growthRatePct,
      };
    });

    return {
      chartData: points,
      rangeTitle: title,
      rangeSubtitle: subtitle,
    };
  }, [
    bills,
    deductions,
    debtPayments,
    data,
    rangeMode,
    selectedMonth,
    customRangeStart,
    customRangeEnd,
    todayStr,
  ]);

  if (chartData.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        Chưa có dữ liệu để hiển thị biểu đồ xu hướng trong khoảng thời gian này.
      </div>
    );
  }

  // Summary metrics for the active range
  const totalPeriodNet = chartData.reduce((s, d) => s + Math.max(0, d.netRevenue), 0);
  const totalPeriodGross = chartData.reduce((s, d) => s + Math.max(0, d.grossRevenue), 0);
  const avgPerDayNet = Math.round(totalPeriodNet / (chartData.length || 1));
  const avgPerDayGross = Math.round(totalPeriodGross / (chartData.length || 1));

  // Peak day
  const peakDay = [...chartData].sort((a, b) => b.netRevenue - a.netRevenue)[0] || chartData[0];

  // Overall growth: compare first day with last day
  const firstDay = chartData[0];
  const lastDay = chartData[chartData.length - 1];
  let overallGrowthPct = 0;
  if (firstDay && lastDay && firstDay.netRevenue > 0) {
    overallGrowthPct = Math.round(
      ((lastDay.netRevenue - firstDay.netRevenue) / firstDay.netRevenue) * 100
    );
  }

  // Determine scale maximum
  const allValues = chartData.flatMap((d) => {
    if (metricMode === 'net') return [d.netRevenue];
    if (metricMode === 'gross') return [d.grossRevenue];
    return [d.cashRevenue, d.transferRevenue];
  });
  const maxVal = Math.max(100000, ...allValues.map((v) => Math.max(0, v))) * 1.15;

  // Dynamic SVG dimensions based on count of points
  const svgWidth = Math.max(720, chartData.length * 36);
  const svgHeight = 250;
  const padLeft = 65;
  const padRight = 35;
  const padTop = 30;
  const padBottom = 48;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;
  const bottomY = padTop + plotHeight;

  // Calculate coordinates for points
  const getCoordinates = (getValue: (d: WeeklyTrendDayPoint) => number) => {
    return chartData.map((d, i) => {
      const x = padLeft + (i / Math.max(1, chartData.length - 1)) * plotWidth;
      const val = Math.max(0, getValue(d));
      const y = padTop + (1 - val / maxVal) * plotHeight;
      return { x, y, data: d, val };
    });
  };

  const netPoints = getCoordinates((d) => d.netRevenue);
  const grossPoints = getCoordinates((d) => d.grossRevenue);
  const cashPoints = getCoordinates((d) => d.cashRevenue);
  const transferPoints = getCoordinates((d) => d.transferRevenue);

  const activePoints = metricMode === 'gross' ? grossPoints : netPoints;
  const activeHover =
    hoveredIdx !== null && chartData[hoveredIdx]
      ? chartData[hoveredIdx]
      : chartData[chartData.length - 1];

  // SVG grid lines (4 horizontal steps)
  const gridLevels = [0, 0.33, 0.66, 1];

  // Smart X-axis label filtering when many points exist
  const shouldShowLabel = (idx: number) => {
    if (chartData.length <= 14) return true;
    if (idx === 0 || idx === chartData.length - 1) return true;
    if (hoveredIdx === idx) return true;
    if (chartData[idx]?.date === todayStr) return true;
    if (chartData.length <= 31) return idx % 3 === 0;
    return idx % 5 === 0;
  };

  return (
    <div className="space-y-4">
      {/* Header with Title and Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </span>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              {rangeTitle}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
              Biểu đồ xu hướng ({chartData.length} ngày)
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {rangeSubtitle}
          </p>
        </div>

        {/* Controls: Time Range Selector & Metric Selector */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {/* Time Range Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setRangeMode('week');
                setHoveredIdx(null);
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                rangeMode === 'week'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>7 Ngày</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRangeMode('month');
                setHoveredIdx(null);
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                rangeMode === 'month'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Calendar className="w-3 h-3" />
              <span>Theo Tháng</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRangeMode('custom');
                setHoveredIdx(null);
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                rangeMode === 'custom'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Khoảng Ngày</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRangeMode('last30');
                setHoveredIdx(null);
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                rangeMode === 'last30'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              30 Ngày
            </button>
          </div>

          {/* Metric Selector Pills */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setMetricMode('net')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                metricMode === 'net'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Thực thu (Net)
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('gross')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                metricMode === 'gross'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Tổng bán (Gross)
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('split')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                metricMode === 'split'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Tiền mặt & CK
            </button>
          </div>
        </div>
      </div>

      {/* Sub-controls for Month Mode */}
      {rangeMode === 'month' && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Chọn Tháng Xem Xu Hướng:</span>
            </span>
            <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-l-lg text-slate-600 dark:text-slate-400 cursor-pointer"
                title="Tháng trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setHoveredIdx(null);
                }}
                className="px-2 py-1 font-mono font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none cursor-pointer"
              >
                {availableMonths.map((m) => {
                  const parts = m.split('-');
                  return (
                    <option key={m} value={m} className="dark:bg-slate-900">
                      Tháng {parts[1]}/{parts[0]}
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-r-lg text-slate-600 dark:text-slate-400 cursor-pointer"
                title="Tháng sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            {selectedMonth !== todayStr.slice(0, 7) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth(todayStr.slice(0, 7));
                  setHoveredIdx(null);
                }}
                className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Về Tháng Này
              </button>
            )}
          </div>

          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Tổng cộng: <strong className="text-slate-800 dark:text-slate-200">{chartData.length} ngày</strong> trong tháng
          </div>
        </div>
      )}

      {/* Sub-controls for Custom Range Mode */}
      {rangeMode === 'custom' && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Khoảng Ngày:</span>
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Từ</span>
              <input
                type="date"
                value={customRangeStart}
                onChange={(e) => {
                  if (e.target.value) {
                    setCustomRangeStart(e.target.value);
                    setHoveredIdx(null);
                  }
                }}
                className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-white cursor-pointer"
              />
              <span className="text-slate-500">Đến</span>
              <input
                type="date"
                value={customRangeEnd}
                onChange={(e) => {
                  if (e.target.value) {
                    setCustomRangeEnd(e.target.value);
                    setHoveredIdx(null);
                  }
                }}
                className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-white cursor-pointer"
              />
            </div>
            {dashboardStartDate && dashboardEndDate && (
              <button
                type="button"
                onClick={() => {
                  handleSyncDashboardFilter();
                  setHoveredIdx(null);
                }}
                className="px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-semibold cursor-pointer transition-colors flex items-center gap-1"
                title="Đồng bộ khoảng ngày theo bộ lọc của trang Báo Cáo"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Đồng bộ bộ lọc Báo Cáo</span>
              </button>
            )}
          </div>

          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Hiển thị <strong className="text-slate-800 dark:text-slate-200">{chartData.length} ngày</strong> liên tiếp
          </div>
        </div>
      )}

      {/* 4 Quick Stat Badges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 text-xs font-mono">
        <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20">
          <span className="text-[11px] font-sans text-emerald-800 dark:text-emerald-300 block font-medium">
            Tổng {metricMode === 'gross' ? 'tổng bán' : 'thực thu'} kỳ này:
          </span>
          <strong className="text-base sm:text-lg font-bold text-emerald-700 dark:text-emerald-300">
            {formatVND(metricMode === 'gross' ? totalPeriodGross : totalPeriodNet)}
          </strong>
        </div>

        <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20">
          <span className="text-[11px] font-sans text-blue-800 dark:text-blue-300 block font-medium">
            Trung bình mỗi ngày:
          </span>
          <strong className="text-base sm:text-lg font-bold text-blue-700 dark:text-blue-300">
            {formatVND(metricMode === 'gross' ? avgPerDayGross : avgPerDayNet)}
          </strong>
        </div>

        <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20">
          <span className="text-[11px] font-sans text-amber-800 dark:text-amber-300 block font-medium">
            Ngày cao nhất kỳ:
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <strong className="text-sm sm:text-base font-bold text-amber-700 dark:text-amber-300">
              {peakDay.dayLabel} ({peakDay.shortDate})
            </strong>
            <span className="text-xs text-amber-600 font-semibold">
              · {formatVND(peakDay.netRevenue)}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col justify-between">
          <span className="text-[11px] font-sans text-slate-500 dark:text-slate-400 block font-medium">
            Tăng trưởng đầu vs cuối kỳ:
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            {overallGrowthPct >= 0 ? (
              <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                <ArrowUpRight className="w-4 h-4" />
                <span>+{overallGrowthPct}%</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-bold text-sm">
                <ArrowDownRight className="w-4 h-4" />
                <span>{overallGrowthPct}%</span>
              </span>
            )}
            <span className="text-[11px] text-slate-400 font-sans">
              ({firstDay?.shortDate} → {lastDay?.shortDate})
            </span>
          </div>
        </div>
      </div>

      {/* SVG Line Chart Viewport with Smooth Horizontal Scroll */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-950 p-2 sm:p-4 shadow-2xs overflow-hidden">
        <div className="w-full overflow-x-auto custom-scrollbar">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="min-w-[640px] h-60 sm:h-72 select-none"
            style={{ width: `${Math.max(100, (svgWidth / 720) * 100)}%` }}
          >
            <defs>
              {/* Emerald Gradient for Net Revenue */}
              <linearGradient id="emeraldTrendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                <stop offset="85%" stopColor="#10b981" stopOpacity="0.04" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>

              {/* Blue Gradient for Gross / Transfer */}
              <linearGradient id="blueTrendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                <stop offset="85%" stopColor="#3b82f6" stopOpacity="0.04" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </linearGradient>

              <filter id="glowShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#10b981" floodOpacity="0.25" />
              </filter>
            </defs>

            {/* Background Horizontal Grid Lines & Y-Labels */}
            {gridLevels.map((lvl, idx) => {
              const y = padTop + (1 - lvl) * plotHeight;
              const lvlVal = Math.round((maxVal * lvl) / 1000);
              return (
                <g key={idx}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgWidth - padRight}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-100 dark:text-slate-800/80"
                    strokeWidth="1"
                    strokeDasharray={idx === 0 ? undefined : '4 4'}
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="text-[10px] font-mono fill-slate-400 dark:fill-slate-500"
                  >
                    {getPrivacyMaskMode() ? '***' : `${lvlVal}k`}
                  </text>
                </g>
              );
            })}

            {/* Render Curves Based on Mode */}
            {metricMode === 'split' ? (
              <>
                {/* Cash Area & Curve */}
                {(() => {
                  const cashCurve = getBezierCurvePath(cashPoints);
                  const cashArea = `${cashCurve} L ${cashPoints[cashPoints.length - 1].x.toFixed(1)} ${bottomY} L ${cashPoints[0].x.toFixed(1)} ${bottomY} Z`;
                  return (
                    <>
                      <path d={cashArea} fill="url(#emeraldTrendGrad)" />
                      <path
                        d={cashCurve}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  );
                })()}

                {/* Transfer Area & Curve */}
                {(() => {
                  const transCurve = getBezierCurvePath(transferPoints);
                  const transArea = `${transCurve} L ${transferPoints[transferPoints.length - 1].x.toFixed(1)} ${bottomY} L ${transferPoints[0].x.toFixed(1)} ${bottomY} Z`;
                  return (
                    <>
                      <path d={transArea} fill="url(#blueTrendGrad)" />
                      <path
                        d={transCurve}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  );
                })()}
              </>
            ) : (
              <>
                {/* Single Main Curve (Net or Gross) */}
                {(() => {
                  const curve = getBezierCurvePath(activePoints);
                  const area = `${curve} L ${activePoints[activePoints.length - 1].x.toFixed(1)} ${bottomY} L ${activePoints[0].x.toFixed(1)} ${bottomY} Z`;
                  const gradId = metricMode === 'gross' ? 'url(#blueTrendGrad)' : 'url(#emeraldTrendGrad)';
                  const strokeColor = metricMode === 'gross' ? '#3b82f6' : '#10b981';
                  return (
                    <>
                      <path d={area} fill={gradId} />
                      <path
                        d={curve}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="url(#glowShadow)"
                      />
                    </>
                  );
                })()}
              </>
            )}

            {/* Vertical Highlight Line for Hovered Point */}
            {hoveredIdx !== null && activePoints[hoveredIdx] && (
              <line
                x1={activePoints[hoveredIdx].x}
                y1={padTop}
                x2={activePoints[hoveredIdx].x}
                y2={bottomY}
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                className="opacity-70"
              />
            )}

            {/* Interactive Circles & Value Labels for Points */}
            {activePoints.map((pt, idx) => {
              const isHovered = hoveredIdx === idx;
              const isToday = pt.data.date === todayStr;
              const circleColor = metricMode === 'gross' ? '#3b82f6' : '#10b981';
              const showLabel = shouldShowLabel(idx);

              return (
                <g
                  key={pt.data.date}
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onClick={() => setHoveredIdx(idx)}
                >
                  {/* Invisible broad hitbox for easy touch/mouse hover */}
                  <rect
                    x={pt.x - 18}
                    y={padTop}
                    width={36}
                    height={plotHeight + 25}
                    fill="transparent"
                  />

                  {/* Outer Glow Halo on Hover */}
                  {isHovered && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="10"
                      fill={circleColor}
                      className="opacity-25 animate-ping"
                    />
                  )}

                  {/* Main Point Circle */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? 6 : chartData.length > 20 ? 3.5 : 4.5}
                    fill={circleColor}
                    stroke="#ffffff"
                    strokeWidth="2"
                    className="transition-transform duration-150"
                  />

                  {/* Value Above Circle (show for hovered, today, or when few points) */}
                  {(isHovered || showLabel || isToday) && (
                    <text
                      x={pt.x}
                      y={pt.y - 10}
                      textAnchor="middle"
                      className={`text-[10px] font-mono font-bold select-none ${
                        isHovered
                          ? 'fill-emerald-600 dark:fill-emerald-400 font-extrabold text-[11px]'
                          : 'fill-slate-600 dark:fill-slate-400'
                      }`}
                    >
                      {getPrivacyMaskMode()
                        ? '***k'
                        : `${formatNumber(Math.round(pt.val / 1000))}k`}
                    </text>
                  )}

                  {/* X-Axis Labels (Day name + Short date) */}
                  {showLabel && (
                    <>
                      <text
                        x={pt.x}
                        y={bottomY + 18}
                        textAnchor="middle"
                        className={`text-xs select-none ${
                          isHovered || isToday
                            ? 'font-bold fill-emerald-600 dark:fill-emerald-400'
                            : 'font-semibold fill-slate-700 dark:fill-slate-300'
                        }`}
                      >
                        {pt.data.dayLabel}
                      </text>
                      <text
                        x={pt.x}
                        y={bottomY + 32}
                        textAnchor="middle"
                        className={`text-[10px] font-mono select-none ${
                          isHovered || isToday
                            ? 'font-bold fill-emerald-600 dark:fill-emerald-400'
                            : 'fill-slate-400 dark:fill-slate-500'
                        }`}
                      >
                        {pt.data.shortDate}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Active Day Detail Inspector Card */}
      {activeHover && (
        <div className="p-3.5 sm:p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-200/60 dark:border-emerald-900/40">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Chi Tiết Doanh Thu: {activeHover.dayLabel} ({formatDateDMY(activeHover.date)})
              </span>
              {activeHover.date === todayStr && (
                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500 text-white">
                  Hôm nay
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-500">Tăng trưởng so ngày trước:</span>
              {activeHover.growthRatePct !== undefined ? (
                activeHover.growthRatePct >= 0 ? (
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold inline-flex items-center gap-0.5">
                    <TrendingUp className="w-3 h-3" />
                    +{activeHover.growthRatePct}%
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 font-bold inline-flex items-center gap-0.5">
                    <TrendingDown className="w-3 h-3" />
                    {activeHover.growthRatePct}%
                  </span>
                )
              ) : (
                <span className="text-slate-400">Ngày đầu kỳ</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-3 text-xs font-mono">
            <div>
              <span className="text-[11px] text-slate-500 block font-sans">Thực thu (Net)</span>
              <strong className="text-emerald-600 dark:text-emerald-400 text-sm sm:text-base font-bold">
                {formatVND(activeHover.netRevenue)}
              </strong>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block font-sans">Tổng bán (Gross)</span>
              <strong className="text-blue-600 dark:text-blue-400 text-sm sm:text-base font-bold">
                {formatVND(activeHover.grossRevenue)}
              </strong>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block font-sans">Tiền mặt</span>
              <strong
                className={`font-mono flex items-center gap-1 ${
                  activeHover.cashRevenue < 0
                    ? 'text-rose-600 dark:text-rose-400 font-bold'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {activeHover.cashRevenue < 0 && (
                  <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <span>{formatVND(activeHover.cashRevenue)}</span>
                {activeHover.cashRevenue < 0 && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300 font-bold">
                    Âm
                  </span>
                )}
              </strong>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block font-sans">Chuyển khoản</span>
              <strong className="text-blue-600 dark:text-blue-400">
                {formatVND(activeHover.transferRevenue)}
              </strong>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block font-sans">Thu công nợ</span>
              <strong className="text-amber-600 dark:text-amber-400">
                {activeHover.debtCollected > 0 ? `+${formatVND(activeHover.debtCollected)}` : '0đ'}
              </strong>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block font-sans">Khoản trừ ngày</span>
              <strong className="text-rose-600 dark:text-rose-400">
                {activeHover.deductions > 0 ? `-${formatVND(activeHover.deductions)}` : '0đ'}
              </strong>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block font-sans">Số lượng hóa đơn</span>
              <strong className="text-slate-900 dark:text-white">
                {activeHover.billsCount} bill
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Day Cards: Grid if <= 14 days, Horizontal Scrollable Strip if > 14 days */}
      {chartData.length <= 14 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {chartData.map((day, idx) => {
            const isSelected = activeHover?.date === day.date;
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setHoveredIdx(idx)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500/30'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    {day.dayLabel}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {day.shortDate}
                  </span>
                </div>
                <div className="mt-1 font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400 truncate">
                  {formatVND(day.netRevenue)}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500 font-mono flex items-center justify-between">
                  <span>{day.billsCount} bill</span>
                  {day.growthRatePct !== undefined && (
                    <span
                      className={
                        day.growthRatePct >= 0
                          ? 'text-emerald-600 font-semibold'
                          : 'text-rose-600 font-semibold'
                      }
                    >
                      {day.growthRatePct >= 0 ? `+${day.growthRatePct}%` : `${day.growthRatePct}%`}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Bấm vào từng ngày để xem nhanh (kéo ngang xem toàn bộ tháng/kỳ):</span>
            <span className="font-mono">{chartData.length} ngày</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 px-1 custom-scrollbar">
            {chartData.map((day, idx) => {
              const isSelected = activeHover?.date === day.date;
              const isPeak = day.date === peakDay.date;
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setHoveredIdx(idx)}
                  className={`min-w-[76px] p-2 rounded-xl border text-center transition-all cursor-pointer shrink-0 ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500/30'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1 text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {day.dayLabel}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {day.shortDate}
                    </span>
                    {isPeak && <span className="text-amber-500 text-[10px]">★</span>}
                  </div>
                  <div className="mt-1 font-mono font-bold text-[11px] text-emerald-600 dark:text-emerald-400 truncate">
                    {formatNumber(Math.round(day.netRevenue / 1000))}k
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {day.billsCount}b
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Backward-compatible alias for any existing imports
export const WeeklyRevenueTrendChart = RevenueTrendChart;

