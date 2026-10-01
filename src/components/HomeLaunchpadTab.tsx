import React, { useState, useEffect, useMemo } from 'react';
import {
  Camera,
  Receipt,
  RotateCcw,
  Boxes,
  CreditCard,
  LayoutDashboard,
  Layers,
  Package,
  UserCheck,
  Shield,
  Eye,
  EyeOff,
  Clock,
  ArrowRight,
  FileText,
  CheckCircle2,
  Wallet,
} from 'lucide-react';
import {
  ManagementTabId,
  BillRecord,
  DeductionRecord,
  ReturnRecord,
  ProductRecord,
  StaffAccount,
  ROLE_LABELS,
} from '../types';
import {
  formatVND,
  formatDateDMY,
  extractBillTableName,
  isOwnerUseBill,
} from '../utils/parser';
import { PWAInstallButton } from './PWAInstallButton';

interface HomeLaunchpadTabProps {
  todayStr: string;
  currentStaffAccount: StaffAccount;
  allowedTabs: ManagementTabId[];
  bills: BillRecord[];
  deductions: DeductionRecord[];
  returns: ReturnRecord[];
  products: ProductRecord[];
  hideMoney: boolean;
  onToggleHideMoney: () => void;
  onSelectTab: (tab: ManagementTabId) => void;
  onInspectBill: (bill: BillRecord) => void;
}

export const HomeLaunchpadTab: React.FC<HomeLaunchpadTabProps> = ({
  todayStr,
  currentStaffAccount,
  allowedTabs,
  bills,
  deductions,
  returns,
  products,
  hideMoney,
  onToggleHideMoney,
  onSelectTab,
  onInspectBill,
}) => {
  const [nowTimeStr, setNowTimeStr] = useState<string>(() =>
    new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTimeStr(
        new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const todayStats = useMemo(() => {
    const todayBills = bills.filter((b) => b.billDate === todayStr);
    const todayDeductions = deductions.filter(
      (d) => (d.deductionDate || d.billDate) === todayStr
    );
    const todayReturns = returns.filter(
      (r) => (r.returnDate || r.billDate) === todayStr
    );
    const unpaidDebtBills = bills.filter(
      (b) => b.paymentType === 'debt' && b.debtStatus !== 'paid'
    );

    let grossCash = 0;
    let grossTransfer = 0;
    let todayDebt = 0;
    let cashCount = 0;
    let transferCount = 0;
    let debtCount = 0;

    for (const b of todayBills) {
      if (isOwnerUseBill(b)) continue;
      const amt = Number(b.totalAmount) || 0;
      if (b.paymentType === 'cash') {
        grossCash += amt;
        cashCount += 1;
      } else if (b.paymentType === 'transfer') {
        grossTransfer += amt;
        transferCount += 1;
      } else if (b.paymentType === 'debt' && b.debtStatus !== 'paid') {
        todayDebt += amt;
        debtCount += 1;
      }
    }

    const totalDed = todayDeductions.reduce(
      (sum, d) => sum + (Number(d.amount) || 0),
      0
    );
    const netCash = grossCash - totalDed;
    const netDayTotal = grossCash + grossTransfer - totalDed;

    const recentBills = [...bills]
      .sort(
        (a, b) =>
          String(b.billDate || '').localeCompare(String(a.billDate || '')) ||
          (b.createdAtMs || 0) - (a.createdAtMs || 0)
      )
      .slice(0, 6);

    return {
      todayBillsCount: todayBills.length,
      cashCount,
      transferCount,
      debtCount,
      grossCash,
      grossTransfer,
      totalDed,
      netCash,
      netDayTotal,
      todayDebt,
      todayDeductionsCount: todayDeductions.length,
      todayReturnsCount: todayReturns.length,
      unpaidDebtBillsCount: unpaidDebtBills.length,
      recentBills,
    };
  }, [bills, deductions, returns, todayStr]);

  const quickActions: {
    id: ManagementTabId;
    title: string;
    pathLabel: string;
    desc: string;
    statText: string;
    icon: React.ReactNode;
    accentClass: string;
    btnClass: string;
  }[] = [
    {
      id: 'ocr',
      title: 'Chụp / Nhập Bill OCR',
      pathLabel: '/nhap-bill',
      desc: 'Quét ảnh hóa đơn hoặc dán nội dung bill để nhận diện bằng Gemini AI và lưu vào sổ.',
      statText: `${todayStats.todayBillsCount} bill hôm nay · Tổng ${bills.length} bill`,
      icon: <Camera className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
      accentClass:
        'border-emerald-200/90 dark:border-emerald-900/60 hover:border-emerald-500 dark:hover:border-emerald-500',
      btnClass: 'text-emerald-700 dark:text-emerald-300',
    },
    {
      id: 'deductions',
      title: 'Khoản Trừ (Chi Tiêu Trong Ngày)',
      pathLabel: '/khoan-tru',
      desc: 'Ghi nhận chi mua nguyên liệu, đá, thuốc lá, vật tư (tự tính Số lượng × Số tiền chi = Tổng chi).',
      statText: `${todayStats.todayDeductionsCount} khoản chi hôm nay · Tổng ${deductions.length} khoản`,
      icon: <Receipt className="w-5 h-5 text-rose-600 dark:text-rose-400" />,
      accentClass:
        'border-rose-200/90 dark:border-rose-900/60 hover:border-rose-500 dark:hover:border-rose-500',
      btnClass: 'text-rose-700 dark:text-rose-300',
    },
    {
      id: 'returns',
      title: 'Hoàn Trả Bia / Món Thừa',
      pathLabel: '/hoan-tra',
      desc: 'Chọn hóa đơn khách trả lại bia hoặc món thừa, tự động hoàn tồn kho và ghi vào Khoản trừ.',
      statText: `${todayStats.todayReturnsCount} lượt hoàn hôm nay · Tổng ${returns.length} lượt`,
      icon: <RotateCcw className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />,
      accentClass:
        'border-indigo-200/90 dark:border-indigo-900/60 hover:border-indigo-500 dark:hover:border-indigo-500',
      btnClass: 'text-indigo-700 dark:text-indigo-300',
    },
    {
      id: 'salary_advances',
      title: 'Nhân Viên Ứng Lương',
      pathLabel: '/ung-luong',
      desc: 'Quản lý danh sách nhân viên (thêm/sửa/xóa), nhập tiền ứng & ngày ứng, tự động trừ qua Khoản trừ trong ngày.',
      statText: `Đồng bộ trực tiếp sang Khoản trừ (1 dòng tiền duy nhất)`,
      icon: <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
      accentClass:
        'border-emerald-200/90 dark:border-emerald-900/60 hover:border-emerald-500 dark:hover:border-emerald-500',
      btnClass: 'text-emerald-700 dark:text-emerald-300',
    },
    {
      id: 'inventory',
      title: 'Kho Đồ Uống & Tồn Kho',
      pathLabel: '/kho-do-uong',
      desc: 'Quản lý tồn đầu, nhập thêm trong ngày, tự động trừ lượng thực bán và kiểm thực tế cuối ca.',
      statText: `Đồng bộ trực tiếp với danh mục Bia & Nước ngọt trên Menu`,
      icon: <Boxes className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />,
      accentClass:
        'border-cyan-200/90 dark:border-cyan-900/60 hover:border-cyan-500 dark:hover:border-cyan-500',
      btnClass: 'text-cyan-700 dark:text-cyan-300',
    },
    {
      id: 'debts',
      title: 'Quản Lý Công Nợ Khách',
      pathLabel: '/cong-no',
      desc: 'Theo dõi danh sách khách nợ, xem chi tiết từng hóa đơn nợ và xác nhận tất toán.',
      statText: `${todayStats.unpaidDebtBillsCount} hóa đơn đang ghi nợ chưa tất toán`,
      icon: <CreditCard className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
      accentClass:
        'border-amber-200/90 dark:border-amber-900/60 hover:border-amber-500 dark:hover:border-amber-500',
      btnClass: 'text-amber-700 dark:text-amber-300',
    },
    {
      id: 'dashboard',
      title: 'Tổng Quan & Đối Soát Doanh Thu',
      pathLabel: '/tong-quan',
      desc: 'Bảng đối soát chi tiết Tiền mặt, Chuyển khoản, Khoản trừ, biểu đồ doanh thu và lịch sử hóa đơn.',
      statText: `Xem báo cáo theo Ngày, Tuần, Tháng hoặc Khoảng ngày`,
      icon: <LayoutDashboard className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
      accentClass:
        'border-blue-200/90 dark:border-blue-900/60 hover:border-blue-500 dark:hover:border-blue-500',
      btnClass: 'text-blue-700 dark:text-blue-300',
    },
    {
      id: 'categories',
      title: 'Số Lượng Bán Theo Danh Mục',
      pathLabel: '/danh-muc',
      desc: 'Thống kê chi tiết số lượng từng món đã bán, hoàn trả và doanh thu theo từng nhóm thực đơn.',
      statText: `Phân tích sản lượng bán theo từng nhóm món`,
      icon: <Layers className="w-5 h-5 text-violet-600 dark:text-violet-400" />,
      accentClass:
        'border-violet-200/90 dark:border-violet-900/60 hover:border-violet-500 dark:hover:border-violet-500',
      btnClass: 'text-violet-700 dark:text-violet-300',
    },
    {
      id: 'products',
      title: 'Upload Sản Phẩm / Menu',
      pathLabel: '/thuc-don',
      desc: 'Thêm/sửa tên món, đơn vị tính, đơn giá, đổi danh mục đồng bộ toàn hệ thống và chuẩn hóa kho.',
      statText: `${products.length} sản phẩm trong thực đơn hiện tại`,
      icon: <Package className="w-5 h-5 text-teal-600 dark:text-teal-400" />,
      accentClass:
        'border-teal-200/90 dark:border-teal-900/60 hover:border-teal-500 dark:hover:border-teal-500',
      btnClass: 'text-teal-700 dark:text-teal-300',
    },
    {
      id: 'owner_use',
      title: 'Chủ / Quản Lý Sử Dụng (0đ)',
      pathLabel: '/chu-quan-su-dung',
      desc: 'Ghi nhận bia, nước ngọt, món ăn do Chủ quán hoặc Quản lý sử dụng (vẫn trừ kho nhưng tính 0đ).',
      statText: `Tự động tính vào sản lượng xuất kho trong ngày`,
      icon: <UserCheck className="w-5 h-5 text-fuchsia-600 dark:text-fuchsia-400" />,
      accentClass:
        'border-fuchsia-200/90 dark:border-fuchsia-900/60 hover:border-fuchsia-500 dark:hover:border-fuchsia-500',
      btnClass: 'text-fuchsia-700 dark:text-fuchsia-300',
    },
    {
      id: 'accounts',
      title: 'Tài Khoản & Phân Quyền',
      pathLabel: '/tai-khoan',
      desc: 'Quản lý tài khoản nhân sự, mật khẩu và phân quyền truy cập từng mục quản lý.',
      statText: `Quản trị viên & phân quyền truy cập`,
      icon: <Shield className="w-5 h-5 text-slate-700 dark:text-slate-300" />,
      accentClass:
        'border-slate-200/90 dark:border-slate-800 hover:border-slate-500 dark:hover:border-slate-500',
      btnClass: 'text-slate-700 dark:text-slate-300',
    },
  ];

  const visibleActions = quickActions.filter((a) => allowedTabs.includes(a.id));

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 1. Hero Workspace Launchpad Banner */}
      <div className="p-5 sm:p-6 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
              <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Ca ngày {formatDateDMY(todayStr)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                {nowTimeStr}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {currentStaffAccount.displayName} ({ROLE_LABELS[currentStaffAccount.role]})
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Sảnh Điều Hướng Ca Làm Việc — VQBill
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
              Chọn nhanh nghiệp vụ cần thao tác bên dưới. Khi mở máy tại quầy thu ngân hoặc trước mặt khách, bạn có thể bật{' '}
              <strong>Chế độ riêng tư (****** ₫)</strong> để che toàn bộ số tiền nhạy cảm trên mọi màn hình.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onToggleHideMoney}
              className={`px-4 py-2.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer ${
                hideMoney
                  ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}
              title="Ẩn hoặc hiện toàn bộ số tiền nhạy cảm trên hệ thống"
            >
              {hideMoney ? (
                <>
                  <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Hiện số tiền (Đang ẩn ****** ₫)</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4 text-slate-500" />
                  <span>Ẩn số tiền nhạy cảm (****** ₫)</span>
                </>
              )}
            </button>

            {allowedTabs.includes('ocr') && (
              <button
                type="button"
                onClick={() => onSelectTab('ocr')}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                <Camera className="w-4 h-4" />
                <span>+ Nhập Bill OCR Mới</span>
              </button>
            )}
          </div>
        </div>

        {/* Today's Compact Status Strip */}
        <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/80">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Số Hóa Đơn Hôm Nay ({formatDateDMY(todayStr).slice(0, 5)})
            </div>
            <div className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {todayStats.todayBillsCount} bill
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
              TM: {todayStats.cashCount} · CK: {todayStats.transferCount} · Nợ:{' '}
              {todayStats.debtCount}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/80">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Tiền Mặt Thực Nhận Hôm Nay
            </div>
            <div className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatVND(todayStats.netCash)}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
              Đã trừ {todayStats.todayDeductionsCount} khoản chi
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/80">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Chuyển Khoản Hôm Nay
            </div>
            <div className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
              {formatVND(todayStats.grossTransfer)}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
              {todayStats.transferCount} hóa đơn chuyển khoản
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/80">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Doanh Thu Tổng Ngày Hôm Nay
            </div>
            <div className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatVND(todayStats.netDayTotal)}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
              Tiền mặt + CK - Khoản trừ
            </div>
          </div>
        </div>
      </div>

      {/* PWA Home Screen Installation Card */}
      <PWAInstallButton variant="card" />

      {/* 2. Quick Navigation Launchpad Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Danh Mục Nghiệp Vụ Quản Lý ({visibleActions.length} mục)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bấm vào mục bất kỳ để mở đường dẫn tương ứng (khi F5/Refresh sẽ giữ nguyên tại trang bạn đang mở)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
          {visibleActions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`group text-left p-4 sm:p-5 rounded-2xl border bg-white dark:bg-slate-900 transition-all cursor-pointer flex flex-col justify-between gap-3 shadow-2xs ${item.accentClass}`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {item.title}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        Đường dẫn: {item.pathLabel}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.desc}
                </p>
              </div>

              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-500 dark:text-slate-400 truncate">
                  {item.statText}
                </span>
                <span className={`font-semibold shrink-0 ml-2 ${item.btnClass}`}>
                  Mở ngay →
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Recent Activity Table (Quick Bill Check without entering full Dashboard) */}
      {todayStats.recentBills.length > 0 && (
        <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Hóa Đơn Vừa Lưu Gần Nhất
              </h3>
            </div>
            {allowedTabs.includes('dashboard') && (
              <button
                type="button"
                onClick={() => onSelectTab('dashboard')}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                <span>Xem toàn bộ sổ hóa đơn (/tong-quan)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3">Ngày / Giờ</th>
                  <th className="py-2.5 px-3">Số bàn / Ghi chú</th>
                  <th className="py-2.5 px-3">Mã Bill</th>
                  <th className="py-2.5 px-3">Hình thức</th>
                  <th className="py-2.5 px-3 text-right">Thanh toán</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {todayStats.recentBills.map((b) => {
                  const tableName = extractBillTableName(b, 'Bàn lẻ');
                  const ownerUse = isOwnerUseBill(b);
                  return (
                    <tr
                      key={b.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDateDMY(b.billDate)}
                        {b.checkOutTime ? ` · ${b.checkOutTime}` : ''}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {tableName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                        {b.billCode}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {ownerUse
                          ? 'Chủ / QL dùng (0đ)'
                          : b.paymentType === 'cash'
                          ? 'Tiền mặt'
                          : b.paymentType === 'transfer'
                          ? 'Chuyển khoản'
                          : `Công nợ (${b.debtorName || 'Khách nợ'})`}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {ownerUse ? '0 ₫' : formatVND(b.totalAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onInspectBill(b)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          Xem chi tiết
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
