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
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-500 dark:text-slate-400">
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Biểu đồ cột theo dõi biến động doanh thu
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            So sánh trực quan Tiền mặt, Chuyển khoản, Khoản trừ, Công nợ và Tổng thực thu theo ngày
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setChartMode('breakdown')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              chartMode === 'breakdown'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Chi tiết 4 chỉ số & Thực thu
          </button>
          <button
            type="button"
            onClick={() => setChartMode('net')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              chartMode === 'net'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Tổng ngày (Thực thu)
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
        {chartMode === 'breakdown' ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" />
              <span>Tiền mặt</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-blue-500 inline-block" />
              <span>Chuyển khoản</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-rose-500 inline-block" />
              <span>Khoản trừ (Hoàn trả)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" />
              <span>Công nợ</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-indigo-600 dark:bg-indigo-400 inline-block" />
              <span>Tổng ngày (Thực thu)</span>
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
              <span>Tổng ngày = Tiền mặt + CK - Khoản trừ - Công nợ</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-slate-300 dark:bg-slate-700 inline-block" />
              <span>Tổng Tiền mặt + Chuyển khoản (Trước trừ)</span>
            </span>
          </>
        )}
      </div>

      {/* Column Chart Viewport */}
      <div className="pt-4 pb-2 px-2 sm:px-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-950/40 overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="h-64 flex items-end gap-3 sm:gap-6 border-b border-slate-200 dark:border-slate-800 pb-2 px-2">
            {data.map((point, idx) => {
              const cashH = Math.max(2, Math.round((point.cash / maxVal) * 210));
              const transH = Math.max(2, Math.round((point.transfer / maxVal) * 210));
              const dedH = Math.max(2, Math.round((point.deduction / maxVal) * 210));
              const debtH = Math.max(2, Math.round((point.debt / maxVal) * 210));
              const netVal = Math.max(0, point.netDayTotal);
              const netH = Math.max(2, Math.round((netVal / maxVal) * 210));
              const grossPaidH = Math.max(
                2,
                Math.round(((point.cash + point.transfer) / maxVal) * 210)
              );

              return (
                <div
                  key={point.date}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="flex-1 flex flex-col items-center group relative cursor-pointer"
                >
                  {/* Value label on top */}
                  <div className="mb-1.5 text-[11px] font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {formatNumber(Math.round(point.netDayTotal / 1000))}k
                  </div>

                  {/* Columns Group */}
                  <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-[215px]">
                    {chartMode === 'breakdown' ? (
                      <>
                        <div
                          style={{ height: `${point.cash > 0 ? cashH : 2}px` }}
                          title={`Tiền mặt: ${formatVND(point.cash)}`}
                          className="w-2.5 sm:w-3.5 bg-emerald-500 hover:bg-emerald-400 rounded-t-xs transition-opacity"
                        />
                        <div
                          style={{ height: `${point.transfer > 0 ? transH : 2}px` }}
                          title={`Chuyển khoản: ${formatVND(point.transfer)}`}
                          className="w-2.5 sm:w-3.5 bg-blue-500 hover:bg-blue-400 rounded-t-xs transition-opacity"
                        />
                        <div
                          style={{ height: `${point.deduction > 0 ? dedH : 2}px` }}
                          title={`Khoản trừ: ${formatVND(point.deduction)}`}
                          className="w-2.5 sm:w-3.5 bg-rose-500 hover:bg-rose-400 rounded-t-xs transition-opacity"
                        />
                        <div
                          style={{ height: `${point.debt > 0 ? debtH : 2}px` }}
                          title={`Công nợ: ${formatVND(point.debt)}`}
                          className="w-2.5 sm:w-3.5 bg-amber-500 hover:bg-amber-400 rounded-t-xs transition-opacity"
                        />
                        <div
                          style={{ height: `${netVal > 0 ? netH : 2}px` }}
                          title={`Tổng ngày (Thực thu): ${formatVND(point.netDayTotal)}`}
                          className="w-2.5 sm:w-3.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-xs transition-opacity"
                        />
                      </>
                    ) : (
                      <>
                        <div
                          style={{ height: `${point.cash + point.transfer > 0 ? grossPaidH : 2}px` }}
                          title={`Tiền mặt + CK: ${formatVND(point.cash + point.transfer)}`}
                          className="w-5 sm:w-7 bg-slate-300 dark:bg-slate-700 rounded-t-xs"
                        />
                        <div
                          style={{ height: `${netVal > 0 ? netH : 2}px` }}
                          title={`Tổng ngày (Thực thu): ${formatVND(point.netDayTotal)}`}
                          className="w-5 sm:w-7 bg-emerald-600 dark:bg-emerald-500 rounded-t-xs"
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-Axis Labels */}
          <div className="flex items-center gap-3 sm:gap-6 pt-2 px-2">
            {data.map((point) => (
              <div key={point.date} className="flex-1 text-center">
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                  {point.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hovered or Selected Day Detail Bar */}
      {hoveredIdx !== null && data[hoveredIdx] && (
        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <span className="font-semibold text-slate-900 dark:text-white">
            Ngày {data[hoveredIdx].date}:
          </span>
          <span className="text-emerald-600 dark:text-emerald-400">
            Tiền mặt: {formatVND(data[hoveredIdx].cash)}
          </span>
          <span className="text-blue-600 dark:text-blue-400">
            Chuyển khoản: {formatVND(data[hoveredIdx].transfer)}
          </span>
          <span className="text-rose-600 dark:text-rose-400">
            Khoản trừ: -{formatVND(data[hoveredIdx].deduction)}
          </span>
          <span className="text-amber-600 dark:text-amber-400">
            Công nợ: -{formatVND(data[hoveredIdx].debt)}
          </span>
          <span className="font-bold text-slate-900 dark:text-white">
            Tổng ngày = {formatVND(data[hoveredIdx].netDayTotal)}
          </span>
        </div>
      )}
    </div>
  );
};
