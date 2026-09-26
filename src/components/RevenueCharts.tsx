import React, { useState } from 'react';
import { formatVND, formatNumber } from '../utils/parser';

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
                    {formatNumber(Math.round(point.netDayTotal / 1000))}k
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
