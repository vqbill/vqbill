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
  SlidersHorizontal,
  UtensilsCrossed,
  LayoutGrid,
  List,
  Monitor,
  Check,
  X,
  Sparkles,
  CheckSquare,
  Square,
  Settings,
  BarChart3,
  TrendingUp,
  Users,
  Flame,
  Trophy,
  PieChart,
  Award,
  Star,
  AlertTriangle,
} from 'lucide-react';
import {
  ManagementTabId,
  BillRecord,
  BillItemRecord,
  DeductionRecord,
  ReturnRecord,
  ProductRecord,
  DebtPaymentRecord,
  StaffAccount,
  ROLE_LABELS,
} from '../types';
import {
  formatVND,
  formatDateDMY,
  extractBillTableName,
  isOwnerUseBill,
  getBillPaymentBreakdown,
} from '../utils/parser';
import { PWAInstallButton } from './PWAInstallButton';

export type HomeLayoutStyle = 'detailed_grid' | 'pos_quick' | 'compact_list';

export interface HomeCustomSettings {
  layoutStyle: HomeLayoutStyle;
  showHeroBanner: boolean;
  showStatsStrip: boolean;
  showRecentBills: boolean;
  showPwaBanner: boolean;
  pinnedTabIds: ManagementTabId[];
  showRevenueChart: boolean;
  showTrafficAnalytics: boolean;
  showMenuEfficiency: boolean;
}

const STORAGE_KEY_HOME_SETTINGS = 'vqbill_home_custom_settings';

interface HomeLaunchpadTabProps {
  todayStr: string;
  currentStaffAccount: StaffAccount;
  allowedTabs: ManagementTabId[];
  bills: BillRecord[];
  billItems?: BillItemRecord[];
  deductions: DeductionRecord[];
  returns: ReturnRecord[];
  products: ProductRecord[];
  debtPayments?: DebtPaymentRecord[];
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
  billItems = [],
  deductions,
  returns,
  products,
  debtPayments = [],
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

  // Customization Settings for Homepage (Persisted to localStorage)
  const [customSettings, setCustomSettings] = useState<HomeCustomSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HOME_SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          layoutStyle: parsed.layoutStyle || 'detailed_grid',
          showHeroBanner: parsed.showHeroBanner !== false,
          showStatsStrip: parsed.showStatsStrip !== false,
          showRecentBills: parsed.showRecentBills !== false,
          showPwaBanner: parsed.showPwaBanner !== false,
          pinnedTabIds: Array.isArray(parsed.pinnedTabIds) && parsed.pinnedTabIds.length > 0
            ? parsed.pinnedTabIds
            : allowedTabs,
          showRevenueChart: parsed.showRevenueChart !== false,
          showTrafficAnalytics: parsed.showTrafficAnalytics !== false,
          showMenuEfficiency: parsed.showMenuEfficiency !== false,
        };
      }
    } catch {
      // ignore
    }
    return {
      layoutStyle: 'detailed_grid',
      showHeroBanner: true,
      showStatsStrip: true,
      showRecentBills: true,
      showPwaBanner: true,
      pinnedTabIds: allowedTabs,
      showRevenueChart: true,
      showTrafficAnalytics: true,
      showMenuEfficiency: true,
    };
  });

  const [analyticsPeriod, setAnalyticsPeriod] = useState<'today' | '7days' | '30days'>('today');
  const [menuRankMetric, setMenuRankMetric] = useState<'qty' | 'revenue'>('qty');

  const [showCustomizeModal, setShowCustomizeModal] = useState<boolean>(false);

  const updateSettings = (partial: Partial<HomeCustomSettings>) => {
    setCustomSettings((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(STORAGE_KEY_HOME_SETTINGS, JSON.stringify(next));
      } catch (err) {
        console.error('Failed to save home settings', err);
      }
      return next;
    });
  };

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
      const bd = getBillPaymentBreakdown(b);
      grossCash += bd.cash;
      grossTransfer += bd.transfer;
      todayDebt += bd.debt;

      if (b.paymentType === 'cash') {
        cashCount += 1;
      } else if (b.paymentType === 'transfer') {
        transferCount += 1;
      } else if (b.paymentType === 'debt') {
        debtCount += 1;
      } else if (b.paymentType === 'split') {
        if (bd.cash > 0) cashCount += 1;
        if (bd.transfer > 0) transferCount += 1;
      }
    }

    const totalDed = todayDeductions.reduce(
      (sum, d) => sum + (Number(d.amount) || 0),
      0
    );

    // Công nợ thu được hôm nay
    const todayDebtPayments = (debtPayments || []).filter(
      (p) => p && p.paidDate === todayStr
    );
    const todayDebtCash = todayDebtPayments
      .filter((p) => p.paymentMethod === 'cash')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const todayDebtTransfer = todayDebtPayments
      .filter((p) => p.paymentMethod === 'transfer')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const todaySettledDebt = todayDebtCash + todayDebtTransfer;

    // Tiền mặt bán hàng ca ngày (sau khoản trừ)
    const netCash = grossCash - totalDed;
    // Tổng tiền mặt thực nhận sau khi thu công nợ
    const totalCashAfterDebt = netCash + todayDebtCash;
    // Tổng ngày thực thu (gồm cả thu nợ TM & CK)
    const netDayTotal = totalCashAfterDebt + grossTransfer + todayDebtTransfer;

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
      grossTransfer: grossTransfer + todayDebtTransfer,
      grossTransferFromBills: grossTransfer,
      totalDed,
      netCash,
      todayDebtCash,
      todayDebtTransfer,
      todaySettledDebt,
      todayDebtPaymentsCount: todayDebtPayments.length,
      totalCashAfterDebt,
      netDayTotal,
      todayDebt,
      todayDeductionsCount: todayDeductions.length,
      todayReturnsCount: todayReturns.length,
      unpaidDebtBillsCount: unpaidDebtBills.length,
      recentBills,
    };
  }, [bills, deductions, returns, debtPayments, todayStr]);

  // Executive Business & Menu Performance Analytics
  const executiveAnalytics = useMemo(() => {
    const now = new Date();
    const periodDays = analyticsPeriod === 'today' ? 1 : analyticsPeriod === '7days' ? 7 : 30;

    const dateList: string[] = [];
    for (let i = periodDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dateList.push(d.toISOString().slice(0, 10));
    }

    const filteredBills = bills.filter((b) => {
      if (isOwnerUseBill(b)) return false;
      if (analyticsPeriod === 'today') return b.billDate === todayStr;
      return dateList.includes(b.billDate);
    });

    const totalBills = filteredBills.length;
    const totalSales = filteredBills.reduce(
      (s, b) => s + (Number(b.totalAmount) || 0),
      0
    );
    const avgOrderValue = totalBills > 0 ? Math.round(totalSales / totalBills) : 0;

    // Time Slots (Lượt khách / Bàn theo khung giờ)
    const slotStats = {
      morning: { id: 'morning', label: 'Ca Sáng (07:00 - 11:30)', shortLabel: 'Ca Sáng', icon: '🌅', count: 0, revenue: 0 },
      lunch: { id: 'lunch', label: 'Trưa Cao Điểm (11:30 - 14:00)', shortLabel: 'Trưa (Cao điểm)', icon: '☀️', count: 0, revenue: 0 },
      afternoon: { id: 'afternoon', label: 'Ca Chiều (14:00 - 17:30)', shortLabel: 'Ca Chiều', icon: '☕', count: 0, revenue: 0 },
      dinner: { id: 'dinner', label: 'Tối Cao Điểm (17:30 - 21:30)', shortLabel: 'Tối (Cao điểm)', icon: '🌙', count: 0, revenue: 0 },
      night: { id: 'night', label: 'Ca Khuya (21:30 - 04:00)', shortLabel: 'Ca Khuya', icon: '🍻', count: 0, revenue: 0 },
    };

    filteredBills.forEach((b) => {
      let hour = 19;
      const timeStr = b.checkInTime || b.checkOutTime;
      if (timeStr && timeStr.includes(':')) {
        const [h, m] = timeStr.split(':').map(Number);
        if (!isNaN(h)) hour = h + (m || 0) / 60;
      } else if (b.createdAtMs) {
        hour = new Date(b.createdAtMs).getHours();
      }

      const rev = Number(b.totalAmount) || 0;
      if (hour >= 7 && hour < 11.5) {
        slotStats.morning.count += 1;
        slotStats.morning.revenue += rev;
      } else if (hour >= 11.5 && hour < 14) {
        slotStats.lunch.count += 1;
        slotStats.lunch.revenue += rev;
      } else if (hour >= 14 && hour < 17.5) {
        slotStats.afternoon.count += 1;
        slotStats.afternoon.revenue += rev;
      } else if (hour >= 17.5 && hour < 21.5) {
        slotStats.dinner.count += 1;
        slotStats.dinner.revenue += rev;
      } else {
        slotStats.night.count += 1;
        slotStats.night.revenue += rev;
      }
    });

    const slotsArray = Object.values(slotStats);
    const maxSlotCount = Math.max(1, ...slotsArray.map((s) => s.count));
    const peakSlot = [...slotsArray].sort((a, b) => b.count - a.count)[0] || slotsArray[3];

    // Daily 7-day Revenue Trend Points
    const trendDays = 7;
    const trendDates: string[] = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      trendDates.push(d.toISOString().slice(0, 10));
    }

    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const trendPoints = trendDates.map((dt) => {
      const dayBills = bills.filter((b) => b.billDate === dt && !isOwnerUseBill(b));
      const dateObj = new Date(dt + 'T12:00:00');
      const dayLabel = dayNames[dateObj.getDay()] || '';
      const dayCash = dayBills
        .filter((b) => b.paymentType === 'cash')
        .reduce((s, b) => s + (Number(b.totalAmount) || 0), 0);
      const dayTransfer = dayBills
        .filter((b) => b.paymentType === 'transfer')
        .reduce((s, b) => s + (Number(b.totalAmount) || 0), 0);
      const dayTotal = dayBills.reduce((s, b) => s + (Number(b.totalAmount) || 0), 0);

      return {
        date: dt,
        displayDate: formatDateDMY(dt).slice(0, 5),
        dayLabel,
        total: dayTotal,
        cash: dayCash,
        transfer: dayTransfer,
        billsCount: dayBills.length,
        isToday: dt === todayStr,
      };
    });

    const maxTrendTotal = Math.max(200000, ...trendPoints.map((p) => p.total));
    const totalTrendRevenue = trendPoints.reduce((s, p) => s + p.total, 0);

    // Menu Efficiency & Bestsellers
    const itemMap = new Map<
      string,
      {
        productName: string;
        category: string;
        quantity: number;
        revenue: number;
        unitPrice: number;
      }
    >();

    const filteredBillIds = new Set(filteredBills.map((b) => b.id));
    const matchingItems = billItems.filter((it) => filteredBillIds.has(it.billId));

    matchingItems.forEach((it) => {
      const key = (it.productName || '').trim().toLowerCase();
      if (!key) return;
      const existing = itemMap.get(key) || {
        productName: it.productName.trim(),
        category: it.category || 'Món khác',
        quantity: 0,
        revenue: 0,
        unitPrice: Number(it.unitPrice) || 0,
      };
      const qty = Number(it.quantity) || 1;
      const sub =
        Number(it.subtotal) || qty * (Number(it.unitPrice) || 0);
      existing.quantity += qty;
      existing.revenue += sub;
      if (it.unitPrice > 0) existing.unitPrice = it.unitPrice;
      itemMap.set(key, existing);
    });

    const allDishes = Array.from(itemMap.values());
    const totalDishesQty = allDishes.reduce((s, d) => s + d.quantity, 0);
    const totalDishesRevenue = allDishes.reduce((s, d) => s + d.revenue, 0);

    const topByQty = [...allDishes].sort((a, b) => b.quantity - a.quantity).slice(0, 8);
    const topByRevenue = [...allDishes].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    const topDishes = menuRankMetric === 'qty' ? topByQty : topByRevenue;

    // Category Sales Distribution
    const catMap = new Map<string, { category: string; quantity: number; revenue: number }>();
    allDishes.forEach((d) => {
      const c = d.category || 'Món khác';
      const existing = catMap.get(c) || { category: c, quantity: 0, revenue: 0 };
      existing.quantity += d.quantity;
      existing.revenue += d.revenue;
      catMap.set(c, existing);
    });

    const categoryShares = Array.from(catMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((c) => ({
        ...c,
        percent:
          totalDishesRevenue > 0
            ? Math.round((c.revenue / totalDishesRevenue) * 100)
            : 0,
      }));

    return {
      filteredBillsCount: totalBills,
      totalSales,
      avgOrderValue,
      slotsArray,
      maxSlotCount,
      peakSlot,
      trendPoints,
      maxTrendTotal,
      totalTrendRevenue,
      topDishes,
      totalDishesQty,
      totalDishesRevenue,
      categoryShares,
    };
  }, [bills, billItems, todayStr, analyticsPeriod, menuRankMetric]);

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
      id: 'table_orders',
      title: 'Order Món Theo Bàn (Báo Bếp & In Bill)',
      pathLabel: '/order-ban',
      desc: 'Gọi món nhanh theo bàn, ghi chú món ăn (ít cay, không hành...), chuông báo âm thanh và in phiếu order trực tiếp ra máy in bill.',
      statText: 'Order món bàn, chuông báo & in phiếu bếp',
      icon: <UtensilsCrossed className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />,
      accentClass:
        'border-indigo-200/90 dark:border-indigo-900/60 hover:border-indigo-500 dark:hover:border-indigo-500 bg-gradient-to-br from-indigo-50/20 to-blue-50/20',
      btnClass: 'text-indigo-700 dark:text-indigo-300',
    },
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
      id: 'kitchen_inventory',
      title: 'Kho Bếp, Tạp Vụ & NPP',
      pathLabel: '/kho-bep-npp',
      desc: 'Quản lý nguyên vật liệu bếp (thịt, cá, gia vị...), vật tư tạp vụ (ga, nước rửa chén...), phiếu nhập và đối soát công nợ NPP.',
      statText: 'Theo dõi tồn kho, nhập mới và đối soát công nợ chi tiết theo từng sản phẩm',
      icon: <UtensilsCrossed className="w-5 h-5 text-teal-600 dark:text-teal-400" />,
      accentClass:
        'border-teal-200/90 dark:border-teal-900/60 hover:border-teal-500 dark:hover:border-teal-500',
      btnClass: 'text-teal-700 dark:text-teal-300',
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
    {
      id: 'menu_settings',
      title: 'Cài Đặt Hiển Thị Danh Mục & Liên Kết',
      pathLabel: '/cai-dat-danh-muc',
      desc: 'Tích chọn các tính năng hiển thị ra màn hình chính, gom các mục còn lại vào cột dropdown và quản lý Liên kết ngoài (Thu ngân, Sổ quỹ, NDS).',
      statText: `Tùy biến thanh điều hướng & liên kết ngoài`,
      icon: <SlidersHorizontal className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
      accentClass:
        'border-emerald-200/90 dark:border-emerald-900/60 hover:border-emerald-500 dark:hover:border-emerald-500',
      btnClass: 'text-emerald-700 dark:text-emerald-300',
    },
    {
      id: 'gamification',
      title: 'Khu Vui Chơi, Vòng Quay & Sơ Đồ Bàn',
      pathLabel: '/vui-choi',
      desc: 'Vòng quay may mắn trúng thưởng (Lucky Wheel), Sơ đồ bàn 2D trực quan, Bảng vàng món ngôi sao và mẹo phong thủy ngày mới.',
      statText: 'Minigame giải trí & sơ đồ bàn trực quan',
      icon: <Sparkles className="w-5 h-5 text-amber-500" />,
      accentClass:
        'border-amber-200/90 dark:border-amber-900/60 hover:border-amber-500 dark:hover:border-amber-500 bg-gradient-to-br from-amber-50/20 to-rose-50/20',
      btnClass: 'text-amber-700 dark:text-amber-300',
    },
  ];

  const visibleActions = quickActions.filter(
    (a) =>
      allowedTabs.includes(a.id) &&
      (customSettings.pinnedTabIds.length === 0 ||
        customSettings.pinnedTabIds.includes(a.id))
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 1. Header Toolbar & Hero Workspace Launchpad */}
      {customSettings.showHeroBanner ? (
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
                Tùy biến các nút nghiệp vụ theo thói quen sử dụng của bạn. Hỗ trợ chế độ{' '}
                <strong>POS Nhanh</strong> (màn hình cảm ứng thu ngân) hoặc <strong>Lưới Chi Tiết</strong>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Quick Layout Mode Switcher */}
              <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => updateSettings({ layoutStyle: 'detailed_grid' })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    customSettings.layoutStyle === 'detailed_grid'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                  title="Bố cục Lưới Chi Tiết (3 cột)"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Chi tiết</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ layoutStyle: 'pos_quick' })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    customSettings.layoutStyle === 'pos_quick'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                  title="Bố cục POS Nhanh (Nút vuông lớn thu ngân)"
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">POS Nhanh</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ layoutStyle: 'compact_list' })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    customSettings.layoutStyle === 'compact_list'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                  title="Bố cục Danh Sách Gọn"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Gọn</span>
                </button>
              </div>

              {/* Nút Tùy Biến Trang Chủ */}
              <button
                type="button"
                onClick={() => setShowCustomizeModal(true)}
                className="px-3 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/80 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                title="Tùy biến Trang Chủ (Chọn các mục ghim, bố cục & số liệu)"
              >
                <SlidersHorizontal className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Tùy Biến Trang Chủ</span>
              </button>

              <button
                type="button"
                onClick={onToggleHideMoney}
                className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  hideMoney
                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
                title="Ẩn hoặc hiện toàn bộ số tiền nhạy cảm trên hệ thống"
              >
                {hideMoney ? (
                  <>
                    <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="hidden sm:inline">Hiện số tiền</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4 text-slate-500" />
                    <span className="hidden sm:inline">Ẩn số tiền</span>
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
                  <span>+ Nhập Bill OCR</span>
                </button>
              )}
            </div>
          </div>

          {/* Today's Compact Status Strip */}
          {customSettings.showStatsStrip && (
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

              <div
                className={`p-3.5 rounded-xl transition-all ${
                  todayStats.netCash < 0
                    ? 'bg-rose-50/90 dark:bg-rose-950/50 border-2 border-rose-500/80 shadow-xs ring-1 ring-rose-500/20'
                    : 'bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/80'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div
                    className={`text-xs ${
                      todayStats.netCash < 0
                        ? 'text-rose-900 dark:text-rose-200 font-bold flex items-center gap-1.5'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {todayStats.netCash < 0 && (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                    )}
                    <span>Tiền Mặt Bán Ngày (Sau Khoản Trừ)</span>
                  </div>
                  {todayStats.netCash < 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white animate-pulse">
                      ÂM TIỀN
                    </span>
                  )}
                </div>
                <div
                  className={`mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums ${
                    todayStats.netCash < 0
                      ? 'text-rose-600 dark:text-rose-400 font-black'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {formatVND(todayStats.netCash)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
                  Đã trừ {todayStats.todayDeductionsCount} khoản chi
                </div>
                {todayStats.netCash < 0 && (
                  <div className="mt-1.5 p-1.5 rounded-lg bg-rose-100 dark:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-[10px] text-rose-800 dark:text-rose-200 font-medium leading-tight">
                    ⚠️ Khoản chi vượt tiền bán {formatVND(Math.abs(todayStats.netCash))}! Két tiền âm.
                  </div>
                )}
              </div>

              {todayStats.todaySettledDebt > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800">
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    Công Nợ Đã Thu Hôm Nay
                  </div>
                  <div className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                    +{formatVND(todayStats.todaySettledDebt)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                    TM: {formatVND(todayStats.todayDebtCash)} · CK: {formatVND(todayStats.todayDebtTransfer)}
                  </div>
                </div>
              )}

              <div
                className={`p-3.5 rounded-xl border-2 shadow-xs ${
                  todayStats.totalCashAfterDebt < 0
                    ? 'bg-rose-50/90 dark:bg-rose-950/50 border-rose-500/80 ring-1 ring-rose-500/20'
                    : 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-500/70'
                }`}
              >
                <div className="text-xs font-bold flex items-center justify-between">
                  <span
                    className={
                      todayStats.totalCashAfterDebt < 0
                        ? 'text-rose-900 dark:text-rose-200 flex items-center gap-1.5'
                        : 'text-emerald-900 dark:text-emerald-200'
                    }
                  >
                    {todayStats.totalCashAfterDebt < 0 && (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                    )}
                    <span>Tiền Mặt Thực Nhận (Két Cuối Ca)</span>
                  </span>
                  {todayStats.totalCashAfterDebt < 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-600 text-white">
                      Két Đang Âm
                    </span>
                  )}
                </div>
                <div
                  className={`mt-1 text-lg sm:text-xl font-black font-mono tabular-nums ${
                    todayStats.totalCashAfterDebt < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {formatVND(todayStats.totalCashAfterDebt)}
                </div>
                <div
                  className={`mt-0.5 text-[11px] font-mono ${
                    todayStats.totalCashAfterDebt < 0
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {todayStats.todayDebtCash > 0
                    ? `${formatVND(todayStats.netCash)} bán + ${formatVND(todayStats.todayDebtCash)} thu nợ`
                    : 'Tiền mặt bán ca ngày sau khoản trừ'}
                </div>
                {todayStats.totalCashAfterDebt < 0 && (
                  <div className="mt-1.5 p-1 rounded bg-rose-100 dark:bg-rose-900/50 text-[10px] text-rose-800 dark:text-rose-200 font-semibold">
                    ⚠️ Két tiền mặt hiện tại bị thiếu hụt {formatVND(Math.abs(todayStats.totalCashAfterDebt))}
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/80">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Chuyển Khoản Hôm Nay
                </div>
                <div className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
                  {formatVND(todayStats.grossTransfer)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
                  {todayStats.transferCount} hóa đơn CK {todayStats.todayDebtTransfer > 0 ? `+ ${formatVND(todayStats.todayDebtTransfer)} thu nợ CK` : ''}
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
                  Tiền mặt sau nợ + CK
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Compact Top Bar when Hero Banner is hidden */
        <div className="p-3 sm:p-4 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-300">
            <Clock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Ca {formatDateDMY(todayStr)}</span>
            <span>· {nowTimeStr}</span>
            <span>· {currentStaffAccount.displayName}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCustomizeModal(true)}
              className="px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tùy Biến Trang Chủ</span>
            </button>
            <button
              type="button"
              onClick={onToggleHideMoney}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-200"
            >
              {hideMoney ? <Eye className="w-3.5 h-3.5 text-amber-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
              <span>{hideMoney ? 'Hiện tiền' : 'Ẩn tiền'}</span>
            </button>
            {allowedTabs.includes('ocr') && (
              <button
                type="button"
                onClick={() => onSelectTab('ocr')}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>+ Nhập Bill</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* PWA Home Screen Installation Card */}
      {customSettings.showPwaBanner && <PWAInstallButton variant="card" />}

      {/* 2. Quick Navigation Launchpad Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Nghiệp Vụ Quản Lý ({visibleActions.length} mục)</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-normal bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {customSettings.layoutStyle === 'pos_quick'
                  ? 'Giao diện POS Nhanh'
                  : customSettings.layoutStyle === 'compact_list'
                  ? 'Giao diện Danh Sách'
                  : 'Giao diện Lưới Chi Tiết'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bấm vào mục bất kỳ để thao tác. Bạn có thể bấm <strong>Tùy Biến Trang Chủ</strong> để ghim các nút mong muốn.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCustomizeModal(true)}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer hidden sm:inline-flex items-center gap-1"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Tùy chỉnh các nút</span>
          </button>
        </div>

        {/* Layout 1: POS QUICK MODE (Touchscreen POS Tiles) */}
        {customSettings.layoutStyle === 'pos_quick' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3.5 sm:gap-4">
            {visibleActions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`group p-4 sm:p-5 rounded-2xl border bg-white dark:bg-slate-900 shadow-xs hover:shadow-md transition-all flex flex-col items-center text-center justify-between gap-3 cursor-pointer active:scale-95 ${item.accentClass}`}
              >
                <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-xs">
                  {item.icon}
                </div>
                <div className="space-y-1">
                  <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-2">
                    {item.title}
                  </div>
                  <div className="text-[10px] sm:text-[11px] font-mono text-slate-400">
                    {item.pathLabel}
                  </div>
                </div>
                <div className="w-full pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                  <span>Mở ngay</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Layout 2: COMPACT LIST MODE */}
        {customSettings.layoutStyle === 'compact_list' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {visibleActions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`p-3 sm:p-3.5 rounded-xl border bg-white dark:bg-slate-900 hover:shadow-xs transition-all flex items-center justify-between gap-3 cursor-pointer group ${item.accentClass}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    {item.icon}
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-emerald-600 transition-colors">
                      {item.title}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 truncate">
                      {item.pathLabel}
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Layout 3: DETAILED GRID MODE (Default Rich Cards) */}
        {customSettings.layoutStyle === 'detailed_grid' && (
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
        )}
      </div>

      {/* 3. Executive Business Analytics: Charts, Traffic, Menu Performance */}
      {(customSettings.showRevenueChart ||
        customSettings.showTrafficAnalytics ||
        customSettings.showMenuEfficiency) && (
        <div className="space-y-4">
          {/* Analytics Section Header & Period Filters */}
          <div className="p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-xs">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      Biểu Đồ Doanh Thu & Hiệu Quả Kinh Doanh
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                      Live Data
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Theo dõi lượt khách theo khung giờ, biểu đồ doanh thu và xếp hạng hiệu quả thực đơn
                  </p>
                </div>
              </div>

              {/* Time Period Filter Switcher */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start md:self-auto border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setAnalyticsPeriod('today')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    analyticsPeriod === 'today'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Hôm nay
                </button>
                <button
                  type="button"
                  onClick={() => setAnalyticsPeriod('7days')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    analyticsPeriod === '7days'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  7 ngày gần nhất
                </button>
                <button
                  type="button"
                  onClick={() => setAnalyticsPeriod('30days')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    analyticsPeriod === '30days'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  30 ngày
                </button>
              </div>
            </div>

            {/* KPI Cards Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Doanh thu kỳ chọn</span>
                </div>
                <div className="mt-1 text-base sm:text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatVND(executiveAnalytics.totalSales)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {analyticsPeriod === 'today'
                    ? 'Doanh thu bill trong ngày'
                    : `${analyticsPeriod === '7days' ? '7' : '30'} ngày gần nhất`}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Users className="w-3.5 h-3.5 text-blue-500" />
                  <span>Lượt khách / Hóa đơn</span>
                </div>
                <div className="mt-1 text-base sm:text-lg font-bold font-mono text-blue-600 dark:text-blue-400 tabular-nums">
                  {executiveAnalytics.filteredBillsCount} bill
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Hóa đơn đã phục vụ
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  <span>Giá trị bill TB (AOV)</span>
                </div>
                <div className="mt-1 text-base sm:text-lg font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                  {formatVND(executiveAnalytics.avgOrderValue)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Trung bình mỗi bàn / bill
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Flame className="w-3.5 h-3.5 text-rose-500" />
                  <span>Giờ cao điểm đông khách</span>
                </div>
                <div className="mt-1 text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  {executiveAnalytics.peakSlot.shortLabel}
                </div>
                <div className="text-[10px] text-rose-600 dark:text-rose-400 font-medium font-mono">
                  {executiveAnalytics.peakSlot.count} bill · {formatVND(executiveAnalytics.peakSlot.revenue)}
                </div>
              </div>
            </div>
          </div>

          {/* Row: Biểu đồ doanh thu 7 ngày & Phân bổ lượt khách */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* 1. Biểu đồ cột xu hướng 7 ngày */}
            {customSettings.showRevenueChart && (
              <div
                className={`p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-3.5 ${
                  customSettings.showTrafficAnalytics ? 'lg:col-span-7' : 'lg:col-span-12'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Biểu Đồ Doanh Thu 7 Ngày Gần Nhất
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 font-mono text-emerald-600">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                      <span>Tiền mặt</span>
                    </span>
                    <span className="flex items-center gap-1 font-mono text-blue-600">
                      <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
                      <span>Chuyển khoản</span>
                    </span>
                  </div>
                </div>

                {/* Bar Chart Visualization */}
                <div className="pt-2">
                  <div className="h-48 sm:h-52 flex items-end justify-between gap-2 sm:gap-3 px-1 sm:px-2 border-b border-slate-100 dark:border-slate-800">
                    {executiveAnalytics.trendPoints.map((point) => {
                      const totalHeightPct = Math.min(
                        100,
                        Math.max(
                          8,
                          Math.round((point.total / executiveAnalytics.maxTrendTotal) * 100)
                        )
                      );
                      const cashHeightPct =
                        point.total > 0 ? Math.round((point.cash / point.total) * 100) : 50;
                      const transferHeightPct = 100 - cashHeightPct;

                      return (
                        <div
                          key={point.date}
                          className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer"
                        >
                          {/* Tooltip on hover */}
                          <div className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity mb-1 tabular-nums whitespace-nowrap">
                            {point.total > 0 ? formatVND(point.total) : '0đ'}
                          </div>

                          {/* Stacked bar */}
                          <div
                            className={`w-full max-w-[36px] sm:max-w-[44px] rounded-t-lg overflow-hidden flex flex-col justify-end transition-all group-hover:brightness-110 shadow-2xs ${
                              point.isToday ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
                            }`}
                            style={{ height: `${totalHeightPct}%` }}
                          >
                            {/* Transfer portion */}
                            {point.transfer > 0 && (
                              <div
                                className="w-full bg-blue-500 hover:bg-blue-400 transition-colors"
                                style={{ height: `${transferHeightPct}%` }}
                                title={`CK: ${formatVND(point.transfer)}`}
                              />
                            )}
                            {/* Cash portion */}
                            <div
                              className="w-full bg-emerald-500 hover:bg-emerald-400 transition-colors"
                              style={{
                                height: `${point.transfer > 0 ? cashHeightPct : 100}%`,
                              }}
                              title={`TM: ${formatVND(point.cash)}`}
                            />
                          </div>

                          {/* X-axis labels */}
                          <div className="mt-2 text-center">
                            <div
                              className={`text-xs font-bold ${
                                point.isToday
                                  ? 'text-emerald-600 font-extrabold'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {point.dayLabel}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {point.displayDate}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 2. Lượt khách & Giờ cao điểm */}
            {customSettings.showTrafficAnalytics && (
              <div
                className={`p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-3.5 ${
                  customSettings.showRevenueChart ? 'lg:col-span-5' : 'lg:col-span-12'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Lượt Khách Theo Khung Giờ
                    </h3>
                  </div>
                  <span className="text-xs font-mono text-slate-500">
                    Tổng {executiveAnalytics.filteredBillsCount} bill
                  </span>
                </div>

                <div className="space-y-2.5">
                  {executiveAnalytics.slotsArray.map((slot) => {
                    const isPeak =
                      slot.count === executiveAnalytics.maxSlotCount && slot.count > 0;
                    const barPercent = Math.min(
                      100,
                      Math.max(
                        6,
                        Math.round((slot.count / executiveAnalytics.maxSlotCount) * 100)
                      )
                    );

                    return (
                      <div
                        key={slot.id}
                        className={`p-2.5 rounded-xl border transition-colors ${
                          isPeak
                            ? 'border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20'
                            : 'border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-800/20'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span>{slot.icon}</span>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {slot.shortLabel}
                            </span>
                            {isPeak && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
                                Đông nhất 🔥
                              </span>
                            )}
                          </div>
                          <div className="font-mono font-bold text-slate-700 dark:text-slate-300">
                            {slot.count} bill ({formatVND(slot.revenue)})
                          </div>
                        </div>

                        {/* Horizontal Bar */}
                        <div className="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-700 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isPeak
                                ? 'bg-gradient-to-r from-rose-500 to-amber-500'
                                : 'bg-gradient-to-r from-blue-500 to-teal-400'
                            }`}
                            style={{ width: `${barPercent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Row: Hiệu quả thực đơn & Top Món Bán Chạy */}
          {customSettings.showMenuEfficiency && (
            <div className="p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Hiệu Quả Thực Đơn & Top Món Bán Chạy</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-normal bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                        {executiveAnalytics.totalDishesQty} phần đã xuất
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Thống kê số lượng xuất bán và tỷ lệ doanh thu đóng góp của từng món
                    </p>
                  </div>
                </div>

                {/* Metric Switcher: Quantity vs Revenue */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start sm:self-auto border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setMenuRankMetric('qty')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      menuRankMetric === 'qty'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Xếp theo Số lượng bán
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuRankMetric('revenue')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      menuRankMetric === 'revenue'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Xếp theo Doanh thu
                  </button>
                </div>
              </div>

              {/* Top Dishes Cards Grid */}
              {executiveAnalytics.topDishes.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {executiveAnalytics.topDishes.map((dish, idx) => {
                    const maxVal =
                      menuRankMetric === 'qty'
                        ? executiveAnalytics.topDishes[0]?.quantity || 1
                        : executiveAnalytics.topDishes[0]?.revenue || 1;
                    const curVal =
                      menuRankMetric === 'qty' ? dish.quantity : dish.revenue;
                    const fillPct = Math.min(
                      100,
                      Math.max(10, Math.round((curVal / maxVal) * 100))
                    );

                    const medalBadge =
                      idx === 0
                        ? '🥇 #1'
                        : idx === 1
                        ? '🥈 #2'
                        : idx === 2
                        ? '🥉 #3'
                        : `#${idx + 1}`;
                    const badgeClass =
                      idx === 0
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300'
                        : idx === 1
                        ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300'
                        : idx === 2
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border-orange-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200';

                    return (
                      <div
                        key={dish.productName}
                        className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs hover:shadow-xs transition-shadow space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border font-mono ${badgeClass}`}
                          >
                            {medalBadge}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 truncate max-w-[100px]">
                            {dish.category}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <div
                            className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate"
                            title={dish.productName}
                          >
                            {dish.productName}
                          </div>
                          <div className="mt-0.5 flex items-center justify-between text-xs font-mono">
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {dish.quantity} phần
                            </span>
                            <span className="text-slate-600 dark:text-slate-300">
                              {formatVND(dish.revenue)}
                            </span>
                          </div>
                        </div>

                        {/* Progress bar relative to #1 */}
                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                  Chưa có dữ liệu món bán trong kỳ lọc này.
                </div>
              )}

              {/* Category Share Distribution Bar */}
              {executiveAnalytics.categoryShares.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      Tỷ trọng doanh thu theo nhóm thực đơn:
                    </span>
                    <span className="text-[11px] font-mono">
                      {executiveAnalytics.categoryShares.length} danh mục chính
                    </span>
                  </div>

                  {/* Segmented bar */}
                  <div className="w-full h-3 rounded-lg overflow-hidden flex bg-slate-100 dark:bg-slate-800">
                    {executiveAnalytics.categoryShares.map((cat, i) => {
                      const colors = [
                        'bg-emerald-500',
                        'bg-blue-500',
                        'bg-amber-500',
                        'bg-purple-500',
                        'bg-rose-500',
                      ];
                      return (
                        <div
                          key={cat.category}
                          className={`${colors[i % colors.length]} h-full transition-all`}
                          style={{ width: `${cat.percent}%` }}
                          title={`${cat.category}: ${cat.percent}% (${formatVND(cat.revenue)})`}
                        />
                      );
                    })}
                  </div>

                  {/* Category legend */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                    {executiveAnalytics.categoryShares.map((cat, i) => {
                      const dotColors = [
                        'bg-emerald-500',
                        'bg-blue-500',
                        'bg-amber-500',
                        'bg-purple-500',
                        'bg-rose-500',
                      ];
                      return (
                        <div key={cat.category} className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${dotColors[i % dotColors.length]}`}
                          />
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {cat.category}
                          </span>
                          <span className="font-mono text-slate-500 text-[11px]">
                            ({cat.percent}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. Recent Activity Table (Quick Bill Check) */}
      {customSettings.showRecentBills && todayStats.recentBills.length > 0 && (
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
                  const bd = getBillPaymentBreakdown(b);
                  const isSplit = b.paymentType === 'split';
                  const isDebt = b.paymentType === 'debt';

                  const rowBg = isSplit
                    ? 'bg-purple-50/40 dark:bg-purple-950/20 hover:bg-purple-50/70 border-l-4 border-l-purple-500'
                    : isDebt
                    ? 'bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50/80 border-l-4 border-l-amber-500'
                    : ownerUse
                    ? 'bg-slate-50/40 dark:bg-slate-800/20 border-l-4 border-l-slate-400'
                    : b.paymentType === 'transfer'
                    ? 'hover:bg-blue-50/30 border-l-4 border-l-blue-400'
                    : 'hover:bg-emerald-50/30 border-l-4 border-l-emerald-500';

                  return (
                    <tr
                      key={b.id}
                      className={`transition-colors ${rowBg}`}
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
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {ownerUse ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            Chủ / QL dùng (0đ)
                          </span>
                        ) : isSplit ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300 border border-purple-200">
                              <CreditCard className="w-3 h-3 text-purple-600" />
                              <span>Tiền mặt + CK</span>
                            </span>
                            <div className="text-[10px] font-mono mt-0.5 text-slate-500">
                              TM: {formatVND(bd.cash)} · CK: {formatVND(bd.transfer)}
                            </div>
                          </div>
                        ) : isDebt ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300">
                            ⚠️ Công nợ ({b.debtorName || 'Khách nợ'})
                          </span>
                        ) : b.paymentType === 'transfer' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            Chuyển khoản
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Tiền mặt
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                        <span
                          className={
                            ownerUse
                              ? 'text-slate-400'
                              : isDebt
                              ? 'text-amber-600 dark:text-amber-400'
                              : isSplit
                              ? 'text-purple-700 dark:text-purple-300'
                              : b.paymentType === 'transfer'
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {ownerUse ? '0 ₫' : formatVND(b.totalAmount)}
                        </span>
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

      {/* POPUP MODAL: TÙY BIẾN GIAO DIỆN TRANG CHỦ */}
      {showCustomizeModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => setShowCustomizeModal(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Tùy Biến Giao Diện Trang Chủ
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cá nhân hóa bố cục hiển thị và chọn các nút nghiệp vụ theo ý muốn
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomizeModal(false)}
                className="p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-6 text-xs">
              {/* 1. Chọn kiểu bố cục (Layout Style) */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  1. Chọn kiểu bố cục giao diện
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => updateSettings({ layoutStyle: 'detailed_grid' })}
                    className={`p-3.5 rounded-xl border text-left space-y-1.5 transition-all cursor-pointer ${
                      customSettings.layoutStyle === 'detailed_grid'
                        ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <LayoutGrid className="w-5 h-5 text-emerald-600" />
                      {customSettings.layoutStyle === 'detailed_grid' && (
                        <Check className="w-4 h-4 text-emerald-600 font-bold" />
                      )}
                    </div>
                    <div className="font-bold text-xs text-slate-900 dark:text-white">
                      Lưới Chi Tiết (3 cột)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Hiện thẻ đầy đủ thông tin, mô tả nghiệp vụ và số lượng thống kê.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSettings({ layoutStyle: 'pos_quick' })}
                    className={`p-3.5 rounded-xl border text-left space-y-1.5 transition-all cursor-pointer ${
                      customSettings.layoutStyle === 'pos_quick'
                        ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Monitor className="w-5 h-5 text-teal-600" />
                      {customSettings.layoutStyle === 'pos_quick' && (
                        <Check className="w-4 h-4 text-emerald-600 font-bold" />
                      )}
                    </div>
                    <div className="font-bold text-xs text-slate-900 dark:text-white">
                      Màn Hình POS Nhanh
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Nút vuông lớn trực quan, tối ưu cho quầy thu ngân & màn hình cảm ứng.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSettings({ layoutStyle: 'compact_list' })}
                    className={`p-3.5 rounded-xl border text-left space-y-1.5 transition-all cursor-pointer ${
                      customSettings.layoutStyle === 'compact_list'
                        ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <List className="w-5 h-5 text-indigo-600" />
                      {customSettings.layoutStyle === 'compact_list' && (
                        <Check className="w-4 h-4 text-emerald-600 font-bold" />
                      )}
                    </div>
                    <div className="font-bold text-xs text-slate-900 dark:text-white">
                      Danh Sách Gọn Gàng
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Dạng hàng ngang nhỏ gọn, tiết kiệm diện tích tối đa.
                    </div>
                  </button>
                </div>
              </div>

              {/* 2. Bật / Tắt các khối hiển thị */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  2. Khối nội dung trên Trang Chủ
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={customSettings.showStatsStrip}
                      onChange={(e) => updateSettings({ showStatsStrip: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Dải thống kê doanh thu ca ngày
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Hiển thị số bill, tiền mặt thực nhận, chuyển khoản và tổng thu
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={customSettings.showRecentBills}
                      onChange={(e) => updateSettings({ showRecentBills: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Bảng hóa đơn vừa lưu gần nhất
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Kiểm tra nhanh các bill mới xuất mà không cần vào tab Tổng quan
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={customSettings.showRevenueChart}
                      onChange={(e) => updateSettings({ showRevenueChart: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Biểu đồ doanh thu 7 ngày
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Cột phân bổ tiền mặt & chuyển khoản theo từng ngày trong tuần
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={customSettings.showTrafficAnalytics}
                      onChange={(e) => updateSettings({ showTrafficAnalytics: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Lượt khách & Phân bổ ca
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Thống kê lượng bill và giờ cao điểm đông khách nhất
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={customSettings.showMenuEfficiency}
                      onChange={(e) => updateSettings({ showMenuEfficiency: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Hiệu quả thực đơn & Top món
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Xếp hạng món bán chạy và tỷ trọng doanh thu theo nhóm món
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={customSettings.showHeroBanner}
                      onChange={(e) => updateSettings({ showHeroBanner: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Banner chào ca làm việc
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Khung chào ca lớn với ngày giờ và tên nhân viên trực
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={customSettings.showPwaBanner}
                      onChange={(e) => updateSettings({ showPwaBanner: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Khối cài đặt ứng dụng (PWA)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Thẻ hướng dẫn cài app ra màn hình chính điện thoại / máy tính
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* 3. Chọn các nghiệp vụ ghim lên Trang Chủ */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    3. Chọn các nút nghiệp vụ ghim lên Trang Chủ ({customSettings.pinnedTabIds.length}/{allowedTabs.length})
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const coreTabIds: ManagementTabId[] = [
                          'ocr',
                          'deductions',
                          'returns',
                          'debts',
                          'dashboard',
                          'inventory',
                        ].filter((id) => allowedTabs.includes(id as ManagementTabId)) as ManagementTabId[];
                        updateSettings({ pinnedTabIds: coreTabIds });
                      }}
                      className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      ⭐ Chỉ mục trọng tâm (POS)
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => updateSettings({ pinnedTabIds: [...allowedTabs] })}
                      className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                    >
                      Chọn tất cả
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        updateSettings({
                          layoutStyle: 'detailed_grid',
                          showHeroBanner: true,
                          showStatsStrip: true,
                          showRecentBills: true,
                          showPwaBanner: true,
                          showRevenueChart: true,
                          showTrafficAnalytics: true,
                          showMenuEfficiency: true,
                          pinnedTabIds: allowedTabs,
                        });
                      }}
                      className="text-[11px] font-semibold text-rose-500 hover:underline cursor-pointer"
                    >
                      Đặt lại mặc định
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {quickActions
                    .filter((a) => allowedTabs.includes(a.id))
                    .map((action) => {
                      const isPinned = customSettings.pinnedTabIds.includes(action.id);
                      return (
                        <div
                          key={action.id}
                          onClick={() => {
                            let next: ManagementTabId[];
                            if (isPinned) {
                              if (customSettings.pinnedTabIds.length <= 1) return;
                              next = customSettings.pinnedTabIds.filter((id) => id !== action.id);
                            } else {
                              next = [...customSettings.pinnedTabIds, action.id];
                            }
                            updateSettings({ pinnedTabIds: next });
                          }}
                          className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-colors ${
                            isPinned
                              ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-60'
                          }`}
                        >
                          <div className="shrink-0 text-emerald-600">
                            {isPinned ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="w-6 h-6 flex items-center justify-center shrink-0">
                            {action.icon}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">
                              {action.title}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {action.pathLabel}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">
                Cài đặt tự động lưu vào trình duyệt
              </span>
              <button
                type="button"
                onClick={() => setShowCustomizeModal(false)}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-xs transition-colors inline-flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Hoàn Tất & Áp Dụng</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
