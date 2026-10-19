import React, { useState, useMemo } from 'react';
import {
  X,
  Receipt,
  Search,
  Filter,
  Plus,
  ExternalLink,
  Calendar,
  Layers,
  ArrowUpDown,
  Tag,
  CheckCircle2,
} from 'lucide-react';
import { DeductionRecord } from '../types';

interface PeriodDeductionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  periodLabel: string;
  deductions: DeductionRecord[];
  formatVND: (n: number) => string;
  onOpenAddDeduction: () => void;
  onNavigateToDeductionsTab: () => void;
}

export const PeriodDeductionsModal: React.FC<PeriodDeductionsModalProps> = ({
  isOpen,
  onClose,
  periodLabel,
  deductions,
  formatVND,
  onOpenAddDeduction,
  onNavigateToDeductionsTab,
}) => {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc');

  // Category breakdown
  const categoryStats = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const d of deductions) {
      const cat = (d.category || 'Khác').trim() || 'Khác';
      const prev = map.get(cat) || { count: 0, total: 0 };
      map.set(cat, {
        count: prev.count + 1,
        total: prev.total + Math.max(0, Number(d.amount) || 0),
      });
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [deductions]);

  const totalPeriodAmount = useMemo(() => {
    return deductions.reduce((sum, d) => sum + Math.max(0, Number(d.amount) || 0), 0);
  }, [deductions]);

  // Filtered & sorted deductions
  const filteredDeductions = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();
    let list = deductions.filter((d) => {
      if (selectedCategory !== 'all' && d.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const title = (d.productName || '').toLowerCase();
      const note = (d.note || '').toLowerCase();
      const code = (d.billCode || '').toLowerCase();
      const cat = (d.category || '').toLowerCase();
      return title.includes(q) || note.includes(q) || code.includes(q) || cat.includes(q);
    });

    list = [...list].sort((a, b) => {
      if (sortBy === 'date_desc') {
        const da = a.deductionDate || a.billDate || '';
        const db = b.deductionDate || b.billDate || '';
        if (da !== db) return db.localeCompare(da);
        return (b.createdAtMs || 0) - (a.createdAtMs || 0);
      }
      if (sortBy === 'date_asc') {
        const da = a.deductionDate || a.billDate || '';
        const db = b.deductionDate || b.billDate || '';
        if (da !== db) return da.localeCompare(db);
        return (a.createdAtMs || 0) - (b.createdAtMs || 0);
      }
      if (sortBy === 'amount_desc') {
        return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      }
      if (sortBy === 'amount_asc') {
        return (Number(a.amount) || 0) - (Number(b.amount) || 0);
      }
      return 0;
    });

    return list;
  }, [deductions, searchKeyword, selectedCategory, sortBy]);

  const filteredTotal = useMemo(() => {
    return filteredDeductions.reduce((sum, d) => sum + Math.max(0, Number(d.amount) || 0), 0);
  }, [filteredDeductions]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-md shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Khoản Trừ Theo Kỳ Đang Xem
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                  {periodLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tổng cộng <strong className="text-slate-800 dark:text-slate-200 font-mono">{deductions.length}</strong> khoản chi · Tổng tiền:{' '}
                <strong className="text-rose-600 dark:text-rose-400 font-mono font-bold">
                  -{formatVND(totalPeriodAmount)}
                </strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Breakdown Chips Carousel */}
        {categoryStats.length > 0 && (
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/30 overflow-x-auto shrink-0 flex items-center gap-2 no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              Tất cả ({deductions.length} khoản · -{formatVND(totalPeriodAmount)})
            </button>
            {categoryStats.map((cat) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setSelectedCategory(cat.name)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedCategory === cat.name
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-rose-300'
                }`}
              >
                <span>{cat.name}</span>
                <span className="font-mono text-[11px] opacity-90 font-bold">
                  ({cat.count} · -{formatVND(cat.total)})
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Tìm theo tên khoản chi, người nhận, ghi chú, mã..."
              className="w-full h-9 pl-9 pr-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-9 px-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="date_desc">Ngày: Mới nhất</option>
              <option value="date_asc">Ngày: Cũ nhất</option>
              <option value="amount_desc">Số tiền: Lớn nhất</option>
              <option value="amount_asc">Số tiền: Nhỏ nhất</option>
            </select>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAddDeduction();
              }}
              className="h-9 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors shrink-0"
              title="Nhập thêm khoản trừ mới vào ngày hôm nay"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">+ Nhập Khoản Trừ</span>
            </button>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredDeductions.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Receipt className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-sm font-semibold">Không tìm thấy khoản trừ nào trong kỳ này.</p>
              {searchKeyword && (
                <button
                  type="button"
                  onClick={() => setSearchKeyword('')}
                  className="mt-2 text-xs text-rose-600 dark:text-rose-400 font-semibold hover:underline cursor-pointer"
                >
                  Xóa từ khóa tìm kiếm
                </button>
              )}
            </div>
          ) : (
            filteredDeductions.map((d, index) => {
              const displayDate = d.deductionDate || d.billDate || 'Hôm nay';
              const isCommission =
                (d.category || '').includes('đặt bàn') ||
                (d.productName || '').includes('đặt bàn') ||
                (d.productName || '').includes('hoa hồng');
              const isReturn = (d.category || '').includes('Hoàn bia') || d.billCode === 'HOAN-TRA';
              const isSalaryAdvance = (d.category || '').includes('Ứng lương') || d.billCode === 'UNG-LUONG';

              return (
                <div
                  key={d.id || index}
                  className="p-3 sm:p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 hover:border-rose-300 dark:hover:border-rose-800/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{displayDate}</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono ${
                          isCommission
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300'
                            : isReturn
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300'
                            : isSalaryAdvance
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {d.category || 'Khoản chi'}
                      </span>
                      {d.billCode && d.billCode !== 'CHI-TRONG-NGAY' && (
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.2 rounded border border-slate-200/60 dark:border-slate-700/60">
                          {d.billCode}
                        </span>
                      )}
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                      {d.productName || 'Khoản chi không tên'}
                    </div>
                    {d.note && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 italic">
                        {d.note}
                      </p>
                    )}
                  </div>

                  <div className="text-right sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800">
                    <div className="text-sm sm:text-base font-extrabold font-mono text-rose-600 dark:text-rose-400">
                      -{formatVND(Number(d.amount) || 0)}
                    </div>
                    {d.quantity && d.quantity > 1 && d.unitPrice ? (
                      <span className="text-[10px] font-mono text-slate-400">
                        {d.quantity} x {formatVND(d.unitPrice)}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            Hiển thị <strong>{filteredDeductions.length}/{deductions.length}</strong> khoản chi
            {filteredDeductions.length !== deductions.length && (
              <span> · Lọc được: <strong className="text-rose-600 font-mono">-{formatVND(filteredTotal)}</strong></span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToDeductionsTab();
              }}
              className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Mở Sổ Quỹ Đầy Đủ</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial h-9 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold transition-colors cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
