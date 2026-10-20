import React, { useState, useMemo } from 'react';
import {
  Wallet,
  UserPlus,
  Users,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Search,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Receipt,
  Banknote,
  Phone,
  Briefcase,
  Shield,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Table,
  Image,
  FileText,
  Printer,
  Sparkles,
  Download,
} from 'lucide-react';
import {
  EmployeeRecord,
  SalaryAdvanceRecord,
  ConfirmRequestOptions,
  UserRole,
  ROLE_LABELS,
  RolePermissionsMap,
  DEFAULT_ROLE_PERMISSIONS,
  MANAGEMENT_TABS,
  ManagementTabId,
  StaffAccount,
} from '../types';
import {
  formatVND,
  formatNumber,
  formatDateDMY,
  getCurrentBusinessDate,
  getYesterdayBusinessDate,
  shiftDateByDays,
} from '../utils/parser';

export interface EmployeeUpsertInput {
  fullName: string;
  roleOrPosition: string;
  phone?: string;
  baseSalary?: number;
  note?: string;
  hasLoginAccount?: boolean;
  systemRole?: UserRole;
  username?: string;
  password?: string;
  useCustomTabs?: boolean;
  allowedTabs?: ManagementTabId[];
}

interface SalaryAdvanceTabProps {
  employees: EmployeeRecord[];
  salaryAdvances: SalaryAdvanceRecord[];
  staffAccounts?: StaffAccount[];
  rolePermissions?: RolePermissionsMap;
  isAdminUser?: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onAddEmployee: (emp: EmployeeUpsertInput) => Promise<EmployeeRecord>;
  onUpdateEmployee: (
    empId: string,
    updates: EmployeeUpsertInput
  ) => Promise<void>;
  onDeleteEmployee: (
    emp: EmployeeRecord,
    deleteAdvancesToo: boolean
  ) => Promise<void>;
  onAddSalaryAdvance: (params: {
    employeeId: string;
    employeeName: string;
    employeeRole?: string;
    amount: number;
    advanceDate: string;
    note: string;
  }) => Promise<void>;
  onUpdateSalaryAdvance: (params: {
    advance: SalaryAdvanceRecord;
    employeeId: string;
    employeeName: string;
    employeeRole?: string;
    amount: number;
    advanceDate: string;
    note: string;
  }) => Promise<void>;
  onDeleteSalaryAdvancesBatch: (advanceIds: string[]) => Promise<void>;
  onOpenDeductionsTab?: () => void;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

type AdvancePeriodMode =
  | 'today'
  | 'yesterday'
  | 'single_day'
  | 'week'
  | 'month'
  | 'custom'
  | 'all';

const QUICK_ADVANCE_AMOUNTS = [
  100000, 200000, 300000, 500000, 1000000, 2000000,
];

const POSITION_SUGGESTIONS = [
  'Nhân viên phục vụ',
  'Thu ngân',
  'Quản lý',
  'Bếp chính',
  'Phụ bếp',
  'Kiểm kho',
  'Pha chế',
  'Tạp vụ',
];

const ASSIGNABLE_ROLES: {
  role: UserRole;
  label: string;
  defaultPosition: string;
  desc: string;
}[] = [
  {
    role: UserRole.CASHIER,
    label: 'Thu ngân (Cashier)',
    defaultPosition: 'Thu ngân',
    desc: 'Tạo bill, Quét OCR, Công nợ, Khoản trừ, Hoàn trả, Ứng lương',
  },
  {
    role: UserRole.MANAGER,
    label: 'Quản lý (Manager)',
    defaultPosition: 'Quản lý',
    desc: 'Quản lý vận hành quán, Sửa/Xóa bill, Thực đơn, Kho, Ứng lương',
  },
  {
    role: UserRole.INVENTORY,
    label: 'Kiểm kho (Inventory)',
    defaultPosition: 'Kiểm kho',
    desc: 'Theo dõi Số lượng theo Danh mục, Kho đồ uống, Chủ/QL sử dụng',
  },
  {
    role: UserRole.VIEWER,
    label: 'Kế toán / Chỉ xem (Viewer)',
    defaultPosition: 'Kế toán',
    desc: 'Xem báo cáo doanh thu, đối soát số liệu, không có quyền sửa/xóa',
  },
  {
    role: UserRole.ADMIN,
    label: 'Quản trị viên (Admin)',
    defaultPosition: 'Quản trị viên',
    desc: 'Toàn quyền hệ thống và quản lý phân quyền tài khoản',
  },
];

function slugifyUsernameFromFullName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24);
}

export function formatNumberToVietnameseWords(amount: number): string {
  if (!amount || amount <= 0) return 'Không đồng';
  const units = ['', 'nghìn', 'triệu', 'tỷ'];
  const digits = [
    'không',
    'một',
    'hai',
    'ba',
    'bốn',
    'năm',
    'sáu',
    'bảy',
    'tám',
    'chín',
  ];

  function readGroup(n: number, showZeroHundred: boolean): string {
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    let res = '';
    if (h > 0 || showZeroHundred) {
      res += digits[h] + ' trăm ';
    }
    if (t > 1) {
      res += digits[t] + ' mươi ';
      if (u === 1) res += 'mốt';
      else if (u === 5) res += 'lăm';
      else if (u > 0) res += digits[u];
    } else if (t === 1) {
      res += 'mười ';
      if (u === 5) res += 'lăm';
      else if (u > 0) res += digits[u];
    } else if (u > 0) {
      if (h > 0 || showZeroHundred) res += 'lẻ ' + digits[u];
      else res += digits[u];
    }
    return res.trim();
  }

  const str = Math.round(amount).toString();
  const groups: number[] = [];
  for (let i = str.length; i > 0; i -= 3) {
    groups.unshift(parseInt(str.slice(Math.max(0, i - 3), i), 10));
  }

  const words: string[] = [];
  const len = groups.length;
  for (let i = 0; i < len; i++) {
    const g = groups[i];
    if (g > 0) {
      const gStr = readGroup(g, i > 0);
      const unitIdx = len - 1 - i;
      const unit = units[unitIdx % 4];
      words.push(gStr + (unit ? ' ' + unit : ''));
    }
  }
  const result = words.join(' ').replace(/\s+/g, ' ').trim() + ' đồng';
  return result.charAt(0).toUpperCase() + result.slice(1);
}

export function downloadAdvanceSlipAsImage(adv: SalaryAdvanceRecord) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Decorative border
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);

    // Header
    ctx.fillStyle = '#065f46';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PHIẾU XÁC NHẬN TẠM ỨNG LƯƠNG', canvas.width / 2, 70);

    ctx.fillStyle = '#64748b';
    ctx.font = '13px monospace';
    ctx.fillText(`Mã phiếu: ${adv.id}`, canvas.width / 2, 98);
    ctx.fillText(
      `Ngày tạm ứng: ${formatDateDMY(adv.advanceDate)}`,
      canvas.width / 2,
      118
    );

    // Divider line
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.moveTo(40, 138);
    ctx.lineTo(canvas.width - 40, 138);
    ctx.strokeStyle = '#cbd5e1';
    ctx.stroke();
    ctx.setLineDash([]);

    // Info rows
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#334155';
    ctx.fillText('Họ và tên nhân viên:', 44, 180);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(adv.employeeName, 220, 180);

    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#334155';
    ctx.fillText('Chức vụ / Bộ phận:', 44, 215);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(adv.employeeRole || 'Nhân viên phục vụ', 220, 215);

    // Amount box
    ctx.fillStyle = '#fff1f2';
    ctx.fillRect(40, 245, canvas.width - 80, 110);
    ctx.strokeStyle = '#fda4af';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 245, canvas.width - 80, 110);

    ctx.fillStyle = '#e11d48';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SỐ TIỀN TẠM ỨNG (VNĐ)', canvas.width / 2, 275);

    ctx.font = 'bold 32px monospace';
    ctx.fillText(`-${formatVND(adv.amount)}`, canvas.width / 2, 315);

    ctx.fillStyle = '#be123c';
    ctx.font = 'italic 13px system-ui, sans-serif';
    ctx.fillText(
      `Bằng chữ: ${formatNumberToVietnameseWords(adv.amount)}`,
      canvas.width / 2,
      342
    );

    // Note section
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(40, 380, canvas.width - 80, 75);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(40, 380, canvas.width - 80, 75);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('Ghi chú / Mục đích ứng:', 55, 405);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = '#1e293b';
    ctx.fillText(adv.note || 'Tạm ứng lương nhân viên trong kỳ', 55, 435);

    // Synchronized status badge
    ctx.fillStyle = '#ecfdf5';
    ctx.fillRect(40, 475, canvas.width - 80, 38);
    ctx.strokeStyle = '#a7f3d0';
    ctx.strokeRect(40, 475, canvas.width - 80, 38);

    ctx.fillStyle = '#047857';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      '✓ ĐÃ TỰ ĐỘNG KHẤU TRỪ VÀO KHOẢN TRỪ (CHI TRONG NGÀY)',
      canvas.width / 2,
      499
    );

    // Signatures
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText('Người Lập Phiếu / Kế Toán', 150, 560);
    ctx.fillText('Người Nhận Tiền Tạm Ứng', canvas.width - 150, 560);

    ctx.font = 'italic 12px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('(Ký & ghi rõ họ tên)', 150, 580);
    ctx.fillText('(Ký xác nhận đã nhận đủ tiền)', canvas.width - 150, 580);

    // Name under signature
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(adv.employeeName, canvas.width - 150, 680);

    // Footer note
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(
      'Hệ thống Quản lý VQ-Bill · Sổ Quản lý Nhân sự & Ứng Lương',
      canvas.width / 2,
      750
    );

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `Phieu_Ung_Luong_${adv.employeeName.replace(
      /\s+/g,
      '_'
    )}_${adv.advanceDate}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (e) {
    console.error('Failed to export advance slip image', e);
  }
}

export const SalaryAdvanceTab: React.FC<SalaryAdvanceTabProps> = ({
  employees,
  salaryAdvances,
  staffAccounts = [],
  rolePermissions = DEFAULT_ROLE_PERMISSIONS,
  isAdminUser = true,
  canWrite,
  canDelete,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onAddSalaryAdvance,
  onUpdateSalaryAdvance,
  onDeleteSalaryAdvancesBatch,
  onOpenDeductionsTab,
  requestConfirm,
}) => {
  const todayStr = getCurrentBusinessDate();
  const yesterdayStr = getYesterdayBusinessDate();

  // Sub-view toggle: 'advances' (Nhập & Sổ phiếu) | 'monthly_table' (Bảng theo dõi theo tháng) | 'employees' (Quản lý nhân viên & Phân Role)
  const [activeSubView, setActiveSubView] = useState<
    'advances' | 'monthly_table' | 'employees'
  >('advances');

  // Chế độ hiển thị: 'table' (Dạng bảng theo dõi theo tháng) | 'cards' (Dạng xem như ảnh/thẻ phiếu)
  const [advanceViewMode, setAdvanceViewMode] = useState<'table' | 'cards'>('table');

  // Modal xem chi tiết phiếu ứng dạng ảnh phiếu in / voucher
  const [viewSlipAdvance, setViewSlipAdvance] = useState<SalaryAdvanceRecord | null>(null);

  // Status banner
  const [statusMsg, setStatusMsg] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success Popup Modal (hiển thị popup thông báo thành công khi xóa nhân viên hoặc cập nhật phân quyền)
  const [successPopup, setSuccessPopup] = useState<{
    title: string;
    message: string;
    detail?: string;
  } | null>(null);

  // ============================================================================
  // 1. FORM STATE: ADD SALARY ADVANCE
  // ============================================================================
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    () => employees[0]?.id || ''
  );
  const [advanceDate, setAdvanceDate] = useState<string>(todayStr);
  const [advanceAmount, setAdvanceAmount] = useState<number>(200000);
  const [advanceNote, setAdvanceNote] = useState<string>('');

  // Quick inline add employee inside Advance Form (Mặc định: Nhân viên phục vụ, không cần TK đăng nhập)
  const [showQuickAddEmp, setShowQuickAddEmp] = useState(false);
  const [quickEmpName, setQuickEmpName] = useState('');
  const [quickEmpRole, setQuickEmpRole] = useState('Nhân viên phục vụ');

  // ============================================================================
  // 2. EDIT SALARY ADVANCE STATE
  // ============================================================================
  const [editingAdvance, setEditingAdvance] =
    useState<SalaryAdvanceRecord | null>(null);
  const [editAdvEmployeeId, setEditAdvEmployeeId] = useState<string>('');
  const [editAdvDate, setEditAdvDate] = useState<string>(todayStr);
  const [editAdvAmount, setEditAdvAmount] = useState<number>(0);
  const [editAdvNote, setEditAdvNote] = useState<string>('');

  // ============================================================================
  // 3. ADD / EDIT EMPLOYEE & ROLE PERMISSIONS STATE
  // ============================================================================
  // Add Employee form state (Default: Nhân viên phục vụ, hasLoginAccount = false)
  const [empFullName, setEmpFullName] = useState('');
  const [empRole, setEmpRole] = useState('Nhân viên phục vụ');
  const [empPhone, setEmpPhone] = useState('');
  const [empBaseSalary, setEmpBaseSalary] = useState<number>(0);
  const [empNote, setEmpNote] = useState('');
  const [empHasLogin, setEmpHasLogin] = useState<boolean>(false);
  const [empSystemRole, setEmpSystemRole] = useState<UserRole>(UserRole.CASHIER);
  const [empUsername, setEmpUsername] = useState('');
  const [empPassword, setEmpPassword] = useState('123456');
  const [showNewEmpPass, setShowNewEmpPass] = useState(false);

  // Edit Employee Modal state
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null>(
    null
  );
  const [editEmpName, setEditEmpName] = useState('');
  const [editEmpRole, setEditEmpRole] = useState('Nhân viên phục vụ');
  const [editEmpPhone, setEditEmpPhone] = useState('');
  const [editEmpBaseSalary, setEditEmpBaseSalary] = useState<number>(0);
  const [editEmpNote, setEditEmpNote] = useState('');
  const [editHasLogin, setEditHasLogin] = useState<boolean>(false);
  const [editSystemRole, setEditSystemRole] = useState<UserRole>(
    UserRole.CASHIER
  );
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('123456');
  const [editUseCustomTabs, setEditUseCustomTabs] = useState<boolean>(false);
  const [editAllowedTabs, setEditAllowedTabs] = useState<ManagementTabId[]>([]);
  const [showEditEmpPass, setShowEditEmpPass] = useState(false);

  // ============================================================================
  // 4. FILTER & PERIOD STATE
  // ============================================================================
  const [periodMode, setPeriodMode] = useState<AdvancePeriodMode>('all');
  const [singleDate, setSingleDate] = useState<string>(todayStr);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    todayStr.slice(0, 7)
  );
  const [customStart, setCustomStart] = useState<string>(
    shiftDateByDays(todayStr, -7)
  );
  const [customEnd, setCustomEnd] = useState<string>(todayStr);
  const [employeeFilter, setEmployeeFilter] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  const isDateInPeriod = (dStr: string): boolean => {
    if (!dStr) return false;
    if (periodMode === 'all') return true;
    if (periodMode === 'today') return dStr === todayStr;
    if (periodMode === 'yesterday') return dStr === yesterdayStr;
    if (periodMode === 'single_day') return dStr === singleDate;
    if (periodMode === 'week') {
      const startWeek = shiftDateByDays(todayStr, -6);
      return dStr >= startWeek && dStr <= todayStr;
    }
    if (periodMode === 'month') {
      return dStr.startsWith(selectedMonth);
    }
    if (periodMode === 'custom') {
      const s = customStart <= customEnd ? customStart : customEnd;
      const e = customStart <= customEnd ? customEnd : customStart;
      return dStr >= s && dStr <= e;
    }
    return true;
  };

  const periodLabel = useMemo(() => {
    if (periodMode === 'today') return `Hôm nay (${formatDateDMY(todayStr)})`;
    if (periodMode === 'yesterday')
      return `Hôm qua (${formatDateDMY(yesterdayStr)})`;
    if (periodMode === 'single_day')
      return `Ngày ${formatDateDMY(singleDate)}`;
    if (periodMode === 'week')
      return `7 ngày qua (${formatDateDMY(
        shiftDateByDays(todayStr, -6)
      )} → ${formatDateDMY(todayStr)})`;
    if (periodMode === 'month') {
      const [y, m] = selectedMonth.split('-');
      return `Tháng ${m}/${y}`;
    }
    if (periodMode === 'custom')
      return `${formatDateDMY(customStart)} → ${formatDateDMY(customEnd)}`;
    return 'Tất cả thời gian';
  }, [
    periodMode,
    todayStr,
    yesterdayStr,
    singleDate,
    selectedMonth,
    customStart,
    customEnd,
  ]);

  // Danh sách các tháng có dữ liệu ứng lương để bấm chuyển nhanh
  const availableAdvanceMonths = useMemo(() => {
    const monthCounts = new Map<string, number>();
    for (const a of salaryAdvances) {
      if (!a.advanceDate) continue;
      const m = a.advanceDate.slice(0, 7);
      monthCounts.set(m, (monthCounts.get(m) || 0) + 1);
    }
    return Array.from(monthCounts.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [salaryAdvances]);

  // Dữ liệu cho Chế độ Theo Dõi Theo Tháng (Table View & Tóm Tắt Tổng Ứng)
  const monthlyAdvancesList = useMemo(() => {
    return salaryAdvances
      .filter((adv) => {
        if (!adv.advanceDate || !adv.advanceDate.startsWith(selectedMonth)) return false;
        if (employeeFilter !== 'ALL' && adv.employeeId !== employeeFilter) {
          const matchEmp = employees.find((e) => e.id === employeeFilter);
          if (
            !matchEmp ||
            matchEmp.fullName.trim().toLowerCase() !== adv.employeeName.trim().toLowerCase()
          ) {
            return false;
          }
        }
        if (!searchKeyword.trim()) return true;
        const q = searchKeyword.toLowerCase();
        return (
          adv.employeeName.toLowerCase().includes(q) ||
          (adv.employeeRole || '').toLowerCase().includes(q) ||
          (adv.note || '').toLowerCase().includes(q) ||
          adv.advanceDate.includes(q) ||
          formatDateDMY(adv.advanceDate).includes(q)
        );
      })
      .sort((a, b) => b.advanceDate.localeCompare(a.advanceDate) || b.createdAtMs - a.createdAtMs);
  }, [salaryAdvances, selectedMonth, employeeFilter, searchKeyword, employees]);

  const monthlyTotalAdvance = useMemo(() => {
    return monthlyAdvancesList.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  }, [monthlyAdvancesList]);

  const monthlyEmployeeSummaryList = useMemo(() => {
    const map = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        employeeRole: string;
        baseSalary: number;
        count: number;
        totalAmount: number;
        advanceDates: string[];
      }
    >();

    for (const adv of monthlyAdvancesList) {
      const matchEmp =
        employees.find((e) => e.id === adv.employeeId) ||
        employees.find((e) => e.fullName.trim().toLowerCase() === adv.employeeName.trim().toLowerCase());
      const key = matchEmp ? matchEmp.id : adv.employeeName.trim().toLowerCase();
      const existing = map.get(key) || {
        employeeId: matchEmp?.id || adv.employeeId,
        employeeName: matchEmp?.fullName || adv.employeeName,
        employeeRole: matchEmp?.roleOrPosition || adv.employeeRole || 'Nhân viên phục vụ',
        baseSalary: matchEmp?.baseSalary || 0,
        count: 0,
        totalAmount: 0,
        advanceDates: [],
      };
      existing.count += 1;
      existing.totalAmount += Number(adv.amount) || 0;
      if (!existing.advanceDates.includes(adv.advanceDate)) {
        existing.advanceDates.push(adv.advanceDate);
      }
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [monthlyAdvancesList, employees]);

  // Helper to resolve linked StaffAccount for an employee if any
  const getEmployeeLoginInfo = (emp: EmployeeRecord) => {
    const linkedAcc = staffAccounts.find(
      (a) =>
        (emp.linkedStaffAccountId && a.id === emp.linkedStaffAccountId) ||
        (emp.username &&
          a.username.trim().toLowerCase() ===
            emp.username.trim().toLowerCase())
    );
    const hasLogin = Boolean(emp.hasLoginAccount || linkedAcc);
    const sysRole = emp.systemRole || linkedAcc?.role;
    const uname = emp.username || linkedAcc?.username || '';
    const pwd = emp.password || linkedAcc?.password || '123456';
    const roleTabs = sysRole
      ? rolePermissions[sysRole]?.allowedTabs ||
        DEFAULT_ROLE_PERMISSIONS[sysRole].allowedTabs
      : [];
    const effectiveTabs =
      (emp.useCustomTabs && emp.allowedTabs?.length
        ? emp.allowedTabs
        : linkedAcc?.useCustomTabs && linkedAcc?.allowedTabs?.length
        ? linkedAcc.allowedTabs
        : roleTabs) || [];
    return {
      hasLogin,
      sysRole,
      username: uname,
      password: pwd,
      effectiveTabs,
      linkedAcc,
    };
  };

  // Ensure selectedEmployeeId stays valid when employees list changes
  const effectiveSelectedEmployee = useMemo(() => {
    if (selectedEmployeeId) {
      const found = employees.find((e) => e.id === selectedEmployeeId);
      if (found) return found;
    }
    return employees[0] || null;
  }, [employees, selectedEmployeeId]);

  // Filtered salary advances
  const filteredAdvances = useMemo(() => {
    return salaryAdvances
      .filter((adv) => isDateInPeriod(adv.advanceDate))
      .filter((adv) => {
        if (employeeFilter === 'ALL') return true;
        return (
          adv.employeeId === employeeFilter ||
          adv.employeeName.trim().toLowerCase() ===
            employeeFilter.trim().toLowerCase()
        );
      })
      .filter((adv) => {
        if (!searchKeyword.trim()) return true;
        const q = searchKeyword.toLowerCase();
        return (
          adv.employeeName.toLowerCase().includes(q) ||
          (adv.employeeRole || '').toLowerCase().includes(q) ||
          (adv.note || '').toLowerCase().includes(q) ||
          adv.advanceDate.includes(q) ||
          formatDateDMY(adv.advanceDate).includes(q)
        );
      })
      .sort(
        (a, b) =>
          b.advanceDate.localeCompare(a.advanceDate) ||
          b.createdAtMs - a.createdAtMs
      );
  }, [
    salaryAdvances,
    periodMode,
    singleDate,
    selectedMonth,
    customStart,
    customEnd,
    employeeFilter,
    searchKeyword,
    todayStr,
    yesterdayStr,
  ]);

  const totalAdvanceInPeriod = useMemo(() => {
    return filteredAdvances.reduce(
      (sum, adv) => sum + (Number(adv.amount) || 0),
      0
    );
  }, [filteredAdvances]);

  const totalTodayAdvance = useMemo(() => {
    return salaryAdvances
      .filter((adv) => adv.advanceDate === todayStr)
      .reduce((sum, adv) => sum + (Number(adv.amount) || 0), 0);
  }, [salaryAdvances, todayStr]);

  // Per-employee advance statistics
  const employeeStatsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        periodTotal: number;
        periodCount: number;
        allTimeTotal: number;
        allTimeCount: number;
        currentMonthTotal: number;
      }
    >();
    const curMonthPrefix = todayStr.slice(0, 7);

    for (const emp of employees) {
      map.set(emp.id, {
        periodTotal: 0,
        periodCount: 0,
        allTimeTotal: 0,
        allTimeCount: 0,
        currentMonthTotal: 0,
      });
    }

    for (const adv of salaryAdvances) {
      const amt = Number(adv.amount) || 0;
      const matchEmp =
        employees.find((e) => e.id === adv.employeeId) ||
        employees.find(
          (e) =>
            e.fullName.trim().toLowerCase() ===
            adv.employeeName.trim().toLowerCase()
        );
      const key = matchEmp ? matchEmp.id : adv.employeeId;
      const cur = map.get(key) || {
        periodTotal: 0,
        periodCount: 0,
        allTimeTotal: 0,
        allTimeCount: 0,
        currentMonthTotal: 0,
      };
      cur.allTimeTotal += amt;
      cur.allTimeCount += 1;
      if (adv.advanceDate.startsWith(curMonthPrefix)) {
        cur.currentMonthTotal += amt;
      }
      if (isDateInPeriod(adv.advanceDate)) {
        cur.periodTotal += amt;
        cur.periodCount += 1;
      }
      map.set(key, cur);
    }

    return map;
  }, [
    employees,
    salaryAdvances,
    todayStr,
    periodMode,
    singleDate,
    selectedMonth,
    customStart,
    customEnd,
  ]);

  // ============================================================================
  // HANDLERS: QUICK ADD EMPLOYEE & FULL EMPLOYEE CRUD + ROLE ASSIGNMENT
  // ============================================================================
  const handleQuickAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    const cleanName = quickEmpName.trim();
    if (!cleanName) {
      setStatusMsg({
        type: 'err',
        text: 'Vui lòng nhập họ tên nhân viên mới.',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await onAddEmployee({
        fullName: cleanName,
        roleOrPosition: quickEmpRole.trim() || 'Nhân viên phục vụ',
        hasLoginAccount: false,
      });
      setSelectedEmployeeId(created.id);
      setQuickEmpName('');
      setQuickEmpRole('Nhân viên phục vụ');
      setShowQuickAddEmp(false);
      setStatusMsg({
        type: 'ok',
        text: `Đã thêm nhân viên "${created.fullName}" (Mặc định: ${created.roleOrPosition} — Không cần tài khoản đăng nhập) và chọn sẵn để ứng lương!`,
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'err',
        text: err?.message || 'Lỗi khi thêm nhân viên.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateEmployeeFull = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    const cleanName = empFullName.trim();
    if (!cleanName) {
      setStatusMsg({
        type: 'err',
        text: 'Vui lòng nhập Họ và tên nhân viên.',
      });
      return;
    }

    const finalHasLogin = Boolean(isAdminUser && empHasLogin);
    const cleanUsername = (
      empUsername.trim() || slugifyUsernameFromFullName(cleanName)
    ).toLowerCase();
    const cleanPassword = empPassword.trim() || '123456';

    if (finalHasLogin && !cleanUsername) {
      setStatusMsg({
        type: 'err',
        text: 'Vui lòng nhập Tên đăng nhập cho nhân viên được phân Role.',
      });
      return;
    }

    const defaultRoleTabs =
      rolePermissions[empSystemRole]?.allowedTabs ||
      DEFAULT_ROLE_PERMISSIONS[empSystemRole].allowedTabs;

    setIsSubmitting(true);
    try {
      const created = await onAddEmployee({
        fullName: cleanName,
        roleOrPosition:
          empRole.trim() ||
          (finalHasLogin
            ? ASSIGNABLE_ROLES.find((r) => r.role === empSystemRole)
                ?.defaultPosition || 'Nhân viên phục vụ'
            : 'Nhân viên phục vụ'),
        phone: empPhone.trim(),
        baseSalary: Math.max(0, Math.round(Number(empBaseSalary) || 0)),
        note: empNote.trim(),
        hasLoginAccount: finalHasLogin,
        systemRole: finalHasLogin ? empSystemRole : undefined,
        username: finalHasLogin ? cleanUsername : undefined,
        password: finalHasLogin ? cleanPassword : undefined,
        useCustomTabs: false,
        allowedTabs: finalHasLogin ? defaultRoleTabs : undefined,
      });
      setSelectedEmployeeId(created.id);
      setEmpFullName('');
      setEmpRole('Nhân viên phục vụ');
      setEmpPhone('');
      setEmpBaseSalary(0);
      setEmpNote('');
      setEmpHasLogin(false);
      setEmpUsername('');
      setEmpPassword('123456');
      setStatusMsg({
        type: 'ok',
        text: finalHasLogin
          ? `Đã thêm nhân viên "${created.fullName}" với Role "${ROLE_LABELS[empSystemRole]}" (Tài khoản: @${cleanUsername})!`
          : `Đã thêm nhân viên "${created.fullName}" (Mặc định: ${created.roleOrPosition} — Không cần tài khoản đăng nhập)!`,
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'err',
        text: err?.message || 'Lỗi khi thêm nhân viên.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditEmployee = (emp: EmployeeRecord) => {
    const loginInfo = getEmployeeLoginInfo(emp);
    setEditingEmployee(emp);
    setEditEmpName(emp.fullName);
    setEditEmpRole(emp.roleOrPosition || 'Nhân viên phục vụ');
    setEditEmpPhone(emp.phone || '');
    setEditEmpBaseSalary(emp.baseSalary || 0);
    setEditEmpNote(emp.note || '');
    setEditHasLogin(loginInfo.hasLogin);
    const initialSysRole = loginInfo.sysRole || UserRole.CASHIER;
    setEditSystemRole(initialSysRole);
    setEditUsername(
      loginInfo.username || slugifyUsernameFromFullName(emp.fullName)
    );
    setEditPassword(loginInfo.password || '123456');
    const roleDefaultTabs =
      rolePermissions[initialSysRole]?.allowedTabs ||
      DEFAULT_ROLE_PERMISSIONS[initialSysRole].allowedTabs;
    setEditUseCustomTabs(
      Boolean(emp.useCustomTabs || loginInfo.linkedAcc?.useCustomTabs)
    );
    setEditAllowedTabs(
      loginInfo.effectiveTabs.length > 0
        ? loginInfo.effectiveTabs
        : roleDefaultTabs
    );
  };

  const handleChangeEditSystemRole = (newRole: UserRole) => {
    setEditSystemRole(newRole);
    const roleMeta = ASSIGNABLE_ROLES.find((r) => r.role === newRole);
    if (
      roleMeta &&
      (!editEmpRole.trim() ||
        editEmpRole === 'Nhân viên phục vụ' ||
        editEmpRole === 'Phục vụ' ||
        ASSIGNABLE_ROLES.some((r) => r.defaultPosition === editEmpRole))
    ) {
      setEditEmpRole(roleMeta.defaultPosition);
    }
    if (!editUseCustomTabs) {
      setEditAllowedTabs(
        rolePermissions[newRole]?.allowedTabs ||
          DEFAULT_ROLE_PERMISSIONS[newRole].allowedTabs
      );
    }
  };

  const handleToggleEditAllowedTab = (tabId: ManagementTabId) => {
    setEditUseCustomTabs(true);
    setEditAllowedTabs((prev) =>
      prev.includes(tabId)
        ? prev.filter((id) => id !== tabId)
        : [...prev, tabId]
    );
  };

  const handleSaveEditedEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || !editingEmployee) return;
    const cleanName = editEmpName.trim();
    if (!cleanName) {
      setStatusMsg({
        type: 'err',
        text: 'Họ và tên nhân viên không được để trống.',
      });
      return;
    }

    const finalHasLogin = Boolean(editHasLogin);
    const cleanUsername = (
      editUsername.trim() || slugifyUsernameFromFullName(cleanName)
    ).toLowerCase();
    const cleanPassword = editPassword.trim() || '123456';

    if (finalHasLogin && !cleanUsername) {
      setStatusMsg({
        type: 'err',
        text: 'Vui lòng nhập Tên đăng nhập cho tài khoản nhân viên.',
      });
      return;
    }

    const roleDefaultTabs =
      rolePermissions[editSystemRole]?.allowedTabs ||
      DEFAULT_ROLE_PERMISSIONS[editSystemRole].allowedTabs;
    const finalTabs =
      editUseCustomTabs && editAllowedTabs.length > 0
        ? editAllowedTabs
        : roleDefaultTabs;

    const finalPosition = finalHasLogin
      ? editEmpRole.trim() ||
        ASSIGNABLE_ROLES.find((r) => r.role === editSystemRole)
          ?.defaultPosition ||
        'Nhân viên phục vụ'
      : editEmpRole.trim() || 'Nhân viên phục vụ';

    setIsSubmitting(true);
    try {
      await onUpdateEmployee(editingEmployee.id, {
        fullName: cleanName,
        roleOrPosition: finalPosition,
        phone: editEmpPhone.trim(),
        baseSalary: Math.max(0, Math.round(Number(editEmpBaseSalary) || 0)),
        note: editEmpNote.trim(),
        hasLoginAccount: finalHasLogin,
        systemRole: finalHasLogin ? editSystemRole : undefined,
        username: finalHasLogin ? cleanUsername : undefined,
        password: finalHasLogin ? cleanPassword : undefined,
        useCustomTabs: finalHasLogin ? editUseCustomTabs : false,
        allowedTabs: finalHasLogin ? finalTabs : undefined,
      });
      setEditingEmployee(null);
      setSuccessPopup({
        title: 'Cập Nhật Nhân Viên Thành Công!',
        message: finalHasLogin
          ? `Đã cập nhật nhân viên "${cleanName}" (${finalPosition}) và cấp quyền đăng nhập theo Role "${ROLE_LABELS[editSystemRole]}" (Tài khoản: @${cleanUsername}).`
          : `Đã cập nhật nhân viên "${cleanName}" (${finalPosition} — Không cần tài khoản đăng nhập).`,
        detail: finalHasLogin
          ? `Được phép truy cập ${finalTabs.length} mục quản lý trên hệ thống.`
          : 'Mặc định là nhân viên phục vụ, không sử dụng tài khoản đăng nhập.',
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'err',
        text: err?.message || 'Lỗi khi cập nhật nhân viên.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xóa nhân viên: Bước 1 hiện Popup xác nhận -> Đồng ý -> Xóa khỏi hệ thống -> Bước 2 hiện Popup xóa thành công
  const handleRequestDeleteEmployee = (emp: EmployeeRecord) => {
    const empAdvances = salaryAdvances.filter(
      (a) =>
        a.employeeId === emp.id ||
        a.employeeName.trim().toLowerCase() ===
          emp.fullName.trim().toLowerCase()
    );
    const loginInfo = getEmployeeLoginInfo(emp);

    const detailsLines: string[] = [
      `• Họ tên: ${emp.fullName}`,
      `• Chức vụ: ${emp.roleOrPosition || 'Nhân viên phục vụ'}`,
      loginInfo.hasLogin && loginInfo.sysRole
        ? `• Tài khoản đăng nhập: @${loginInfo.username} (Role: ${ROLE_LABELS[loginInfo.sysRole]}) — sẽ bị xóa khỏi hệ thống`
        : `• Tài khoản đăng nhập: Không có (Mặc định nhân viên phục vụ)`,
    ];
    if (empAdvances.length > 0) {
      detailsLines.push(
        `• Phiếu ứng lương liên kết: ${empAdvances.length} phiếu (-${formatVND(
          empAdvances.reduce((s, a) => s + a.amount, 0)
        )}) — sẽ được xóa cùng khoản trừ tương ứng`
      );
    }

    requestConfirm({
      title: `Xác nhận Xóa Nhân Viên "${emp.fullName}"`,
      message: `Bạn có chắc chắn muốn xóa nhân viên này khỏi hệ thống không?\n\n${detailsLines.join(
        '\n'
      )}`,
      confirmLabel: 'Đồng ý xóa nhân viên',
      cancelLabel: 'Hủy bỏ',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteEmployee(emp, true);
        if (editingEmployee?.id === emp.id) {
          setEditingEmployee(null);
        }
        if (employeeFilter === emp.id) {
          setEmployeeFilter('ALL');
        }
        setStatusMsg({
          type: 'ok',
          text: `Đã xóa nhân viên "${emp.fullName}" khỏi hệ thống thành công!`,
        });
        setSuccessPopup({
          title: 'Đã Xóa Nhân Viên Thành Công!',
          message: `Nhân viên "${emp.fullName}" (${
            emp.roleOrPosition || 'Nhân viên phục vụ'
          }) đã được xóa hoàn toàn khỏi hệ thống.`,
          detail:
            empAdvances.length > 0
              ? `Đã xóa đồng bộ ${empAdvances.length} phiếu ứng lương và khoản trừ liên kết.`
              : loginInfo.hasLogin
              ? `Tài khoản đăng nhập @${loginInfo.username} cũng đã được gỡ khỏi hệ thống.`
              : 'Danh sách nhân sự đã được cập nhật và đồng bộ lên Cloud.',
        });
      },
    });
  };

  // ============================================================================
  // HANDLERS: SALARY ADVANCE CRUD (AUTO-SYNCED WITH DEDUCTIONS)
  // ============================================================================
  const handleSubmitAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    setStatusMsg(null);

    if (!effectiveSelectedEmployee) {
      setStatusMsg({
        type: 'err',
        text: 'Vui lòng chọn hoặc thêm nhân viên trước khi ghi nhận ứng lương.',
      });
      return;
    }

    const safeAmount = Math.max(0, Math.round(Number(advanceAmount) || 0));
    if (safeAmount <= 0) {
      setStatusMsg({
        type: 'err',
        text: 'Vui lòng nhập số tiền ứng lương lớn hơn 0 ₫.',
      });
      return;
    }

    const cleanNote =
      advanceNote.trim() ||
      `Nhân viên ${effectiveSelectedEmployee.fullName} (${
        effectiveSelectedEmployee.roleOrPosition || 'Nhân viên phục vụ'
      }) ứng lương ngày ${formatDateDMY(advanceDate)}`;

    requestConfirm({
      title: 'Xác nhận Ghi Nhận Ứng Lương Nhân Viên',
      message: `Ghi nhận nhân viên "${effectiveSelectedEmployee.fullName}" (${
        effectiveSelectedEmployee.roleOrPosition || 'Nhân viên phục vụ'
      }) ứng lương số tiền -${formatVND(safeAmount)} vào ngày ${formatDateDMY(
        advanceDate
      )}? Hệ thống sẽ tự động trừ trực tiếp khoản này qua tab "Khoản trừ (Chi trong ngày)" giống như Hoàn trả bia.`,
      confirmLabel: 'Xác nhận Ứng lương & Trừ Khoản trừ',
      variant: 'warning',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await onAddSalaryAdvance({
            employeeId: effectiveSelectedEmployee.id,
            employeeName: effectiveSelectedEmployee.fullName,
            employeeRole:
              effectiveSelectedEmployee.roleOrPosition || 'Nhân viên phục vụ',
            amount: safeAmount,
            advanceDate,
            note: cleanNote,
          });
          setAdvanceNote('');
          setStatusMsg({
            type: 'ok',
            text: `Đã lưu phiếu ứng lương của "${
              effectiveSelectedEmployee.fullName
            }" (-${formatVND(safeAmount)}, ngày ${formatDateDMY(
              advanceDate
            )}) và tự động trừ qua Khoản trừ trong ngày!`,
          });
        } catch (err: any) {
          setStatusMsg({
            type: 'err',
            text: err?.message || 'Lỗi khi lưu phiếu ứng lương.',
          });
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  const handleStartEditAdvance = (adv: SalaryAdvanceRecord) => {
    if (!canWrite) return;
    setStatusMsg(null);
    setEditingAdvance(adv);
    const matchEmp =
      employees.find((e) => e.id === adv.employeeId) ||
      employees.find(
        (e) =>
          e.fullName.trim().toLowerCase() ===
          adv.employeeName.trim().toLowerCase()
      );
    setEditAdvEmployeeId(matchEmp?.id || adv.employeeId);
    setEditAdvDate(adv.advanceDate || todayStr);
    setEditAdvAmount(adv.amount || 0);
    setEditAdvNote(adv.note || '');
  };

  const handleSaveEditedAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || !editingAdvance) return;

    const safeAmount = Math.max(0, Math.round(Number(editAdvAmount) || 0));
    if (safeAmount <= 0) {
      setStatusMsg({
        type: 'err',
        text: 'Số tiền ứng lương phải lớn hơn 0 ₫.',
      });
      return;
    }

    const targetEmp = employees.find((emp) => emp.id === editAdvEmployeeId);
    const finalEmpId = targetEmp?.id || editingAdvance.employeeId;
    const finalEmpName = targetEmp?.fullName || editingAdvance.employeeName;
    const finalEmpRole =
      targetEmp?.roleOrPosition ||
      editingAdvance.employeeRole ||
      'Nhân viên phục vụ';

    requestConfirm({
      title: 'Xác nhận Cập Nhật Phiếu Ứng Lương',
      message: `Lưu thay đổi phiếu ứng lương của nhân viên "${finalEmpName}" thành -${formatVND(
        safeAmount
      )} (Ngày ứng: ${formatDateDMY(
        editAdvDate
      )})? Khoản trừ liên kết bên tab "Khoản trừ" cũng sẽ tự động cập nhật đồng bộ.`,
      confirmLabel: 'Lưu thay đổi',
      variant: 'warning',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await onUpdateSalaryAdvance({
            advance: editingAdvance,
            employeeId: finalEmpId,
            employeeName: finalEmpName,
            employeeRole: finalEmpRole,
            amount: safeAmount,
            advanceDate: editAdvDate,
            note: editAdvNote.trim(),
          });
          setEditingAdvance(null);
          setStatusMsg({
            type: 'ok',
            text: `Đã cập nhật phiếu ứng lương của "${finalEmpName}" (-${formatVND(
              safeAmount
            )}) và đồng bộ sang Khoản trừ!`,
          });
        } catch (err: any) {
          setStatusMsg({
            type: 'err',
            text: err?.message || 'Lỗi khi cập nhật phiếu ứng lương.',
          });
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  const handleRequestDeleteSingleAdvance = (adv: SalaryAdvanceRecord) => {
    if (!canDelete) return;
    requestConfirm({
      title: 'Xác nhận Xóa Phiếu Ứng Lương',
      message: `Bạn có chắc chắn muốn xóa phiếu ứng lương của "${
        adv.employeeName
      }" (-${formatVND(adv.amount)}, ngày ${formatDateDMY(
        adv.advanceDate
      )}) không? Khoản trừ liên kết bên tab "Khoản trừ" cũng sẽ được xóa tự động.`,
      confirmLabel: 'Đồng ý xóa phiếu ứng',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteSalaryAdvancesBatch([adv.id]);
        if (editingAdvance?.id === adv.id) {
          setEditingAdvance(null);
        }
        setStatusMsg({
          type: 'ok',
          text: `Đã xóa phiếu ứng lương của "${adv.employeeName}" và hoàn lại Khoản trừ.`,
        });
      },
    });
  };

  const handleRequestDeleteFilteredAdvances = () => {
    if (!canDelete || filteredAdvances.length === 0) return;
    const ids = filteredAdvances.map((a) => a.id);
    requestConfirm({
      title: 'Xác nhận Xóa Tất Cả Phiếu Ứng Lương Đang Lọc',
      message: `Bạn có chắc chắn muốn xóa toàn bộ ${
        ids.length
      } phiếu ứng lương đang hiển thị (tổng cộng -${formatVND(
        totalAdvanceInPeriod
      )}) và xóa các khoản trừ liên kết khỏi hệ thống không?`,
      confirmLabel: `Xóa tất cả (${ids.length} phiếu)`,
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteSalaryAdvancesBatch(ids);
        setEditingAdvance(null);
        setStatusMsg({
          type: 'ok',
          text: `Đã xóa ${ids.length} phiếu ứng lương và các khoản trừ liên kết.`,
        });
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Header & Sub-View Switcher */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Quản Lý Nhân Viên & Ứng Lương (Đồng Bộ Trực Tiếp Sang Khoản Trừ)
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Mặc định nhân viên mới là <strong>Nhân viên phục vụ (không cần tài khoản đăng nhập)</strong> cho đến khi Admin sửa thông tin để phân Role & cấp quyền đăng nhập. Khi nhập ứng lương, số tiền ứng sẽ{' '}
              <strong>tự động trừ qua Khoản trừ (Chi trong ngày)</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="p-1 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveSubView('advances')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubView === 'advances'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>1. Nhập & Phiếu Ứng ({salaryAdvances.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveSubView('monthly_table');
                  setPeriodMode('month');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubView === 'monthly_table'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                <span>2. Bảng Theo Dõi Theo Tháng</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubView('employees')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubView === 'employees'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>3. Quản Lý Nhân Viên ({employees.length})</span>
              </button>
            </div>

            {onOpenDeductionsTab && (
              <button
                type="button"
                onClick={onOpenDeductionsTab}
                className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Xem bên Khoản trừ</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs text-slate-500">Tổng nhân sự trong quán</div>
              <div className="mt-1 text-lg font-extrabold font-mono text-slate-900 dark:text-white">
                {employees.length} nhân viên
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {
                  employees.filter((e) => getEmployeeLoginInfo(e).hasLogin)
                    .length
                }{' '}
                có TK đăng nhập ·{' '}
                {
                  employees.filter((e) => !getEmployeeLoginInfo(e).hasLogin)
                    .length
                }{' '}
                NV phục vụ (không cần TK)
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveSubView('employees')}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold cursor-pointer shrink-0"
            >
              Quản lý NV
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/25 border border-rose-200/70 dark:border-rose-900/60">
            <div className="text-xs text-rose-700 dark:text-rose-300 font-medium">
              Tiền ứng lương hôm nay ({formatDateDMY(todayStr)})
            </div>
            <div className="mt-1 text-lg font-extrabold font-mono text-rose-600 dark:text-rose-400">
              -{formatVND(totalTodayAdvance)}
            </div>
            <div className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">
              Đã tự động trừ vào Khoản trừ ngày hôm nay
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-900/60">
            <div className="text-xs text-amber-800 dark:text-amber-300 font-medium">
              Tổng ứng lương kỳ đang lọc ({periodLabel})
            </div>
            <div className="mt-1 text-lg font-extrabold font-mono text-amber-600 dark:text-amber-400">
              -{formatVND(totalAdvanceInPeriod)}
            </div>
            <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
              {filteredAdvances.length} phiếu ứng lương trong kỳ
            </div>
          </div>
        </div>
      </div>

      {/* Status Alert */}
      {statusMsg && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 text-xs font-medium ${
            statusMsg.type === 'ok'
              ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200'
              : 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-xs font-bold underline cursor-pointer shrink-0"
          >
            Đóng
          </button>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 1: PHIẾU ỨNG LƯƠNG & LỊCH SỬ ỨNG LƯƠNG
         ===================================================================== */}
      {activeSubView === 'advances' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column (5 cols): Form Nhập Ứng Lương + Quick Employee Roster */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    1. Nhập Phiếu Nhân Viên Ứng Lương
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Tự động ghi vào Khoản trừ của ngày ứng lương
                  </p>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => setShowQuickAddEmp((v) => !v)}
                    className="px-2.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{showQuickAddEmp ? 'Đóng thêm NV' : '+ Thêm nhân viên'}</span>
                  </button>
                )}
              </div>

              {/* Inline Quick Add Employee Box */}
              {canWrite && showQuickAddEmp && (
                <form
                  onSubmit={handleQuickAddEmployee}
                  className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/60 dark:bg-emerald-950/30 space-y-2.5 text-xs"
                >
                  <div className="font-bold text-emerald-900 dark:text-emerald-200">
                    Thêm nhanh nhân viên mới (Mặc định: Nhân viên phục vụ — Không cần TK đăng nhập):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={quickEmpName}
                      onChange={(e) => setQuickEmpName(e.target.value)}
                      placeholder="Họ và tên nhân viên..."
                      className="h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                    />
                    <input
                      type="text"
                      list="quick-emp-roles"
                      value={quickEmpRole}
                      onChange={(e) => setQuickEmpRole(e.target.value)}
                      placeholder="Mặc định: Nhân viên phục vụ"
                      className="h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <datalist id="quick-emp-roles">
                      {POSITION_SUGGESTIONS.map((pos) => (
                        <option key={pos} value={pos} />
                      ))}
                    </datalist>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowQuickAddEmp(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Lưu nhân viên
                    </button>
                  </div>
                </form>
              )}

              {!canWrite ? (
                <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <Eye className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    Tài khoản của bạn đang ở chế độ <strong>Chỉ xem (Không được Thêm / Sửa / Xóa)</strong> — Bạn chỉ có thể xem danh sách nhân viên và lịch sử ứng lương.
                  </span>
                </div>
              ) : (
                <form onSubmit={handleSubmitAdvance} className="space-y-3.5 text-xs">
                {/* Select Employee */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Chọn nhân viên ứng lương:
                  </label>
                  {employees.length === 0 ? (
                    <div className="p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 text-amber-800 text-xs">
                      Chưa có nhân viên nào. Hãy bấm nút{' '}
                      <strong>"+ Thêm nhân viên"</strong> ở góc trên để tạo nhân viên mới.
                    </div>
                  ) : (
                    <select
                      value={effectiveSelectedEmployee?.id || ''}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                    >
                      {employees.map((emp) => {
                        const st = employeeStatsMap.get(emp.id);
                        const monthAdv = st?.currentMonthTotal || 0;
                        return (
                          <option key={emp.id} value={emp.id}>
                            {emp.fullName} ({emp.roleOrPosition || 'Nhân viên phục vụ'}) — Đã ứng tháng này:{' '}
                            {formatNumber(monthAdv)} ₫
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {/* Advance Date */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Ngày ứng lương (Ngày trừ vào Khoản trừ):
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setAdvanceDate(todayStr)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          advanceDate === todayStr
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Hôm nay
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdvanceDate(yesterdayStr)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          advanceDate === yesterdayStr
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Hôm qua
                      </button>
                    </div>
                  </div>
                  <input
                    type="date"
                    value={advanceDate}
                    onChange={(e) => setAdvanceDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-semibold"
                  />
                </div>

                {/* Advance Amount */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Số tiền ứng (VNĐ):
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    value={advanceAmount || ''}
                    onChange={(e) =>
                      setAdvanceAmount(
                        Math.max(0, Math.round(Number(e.target.value) || 0))
                      )
                    }
                    placeholder="Nhập số tiền ứng (VD: 300000)..."
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-sm font-extrabold text-rose-600 dark:text-rose-400"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {QUICK_ADVANCE_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAdvanceAmount(amt)}
                        className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                          advanceAmount === amt
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-emerald-400'
                        }`}
                      >
                        {formatNumber(amt)} ₫
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Ghi chú / Lý do ứng (Tùy chọn):
                  </label>
                  <input
                    type="text"
                    value={advanceNote}
                    onChange={(e) => setAdvanceNote(e.target.value)}
                    placeholder="VD: Ứng tiền xăng xe, ứng lương giữa tháng..."
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canWrite || isSubmitting || employees.length === 0}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    Lưu Phiếu Ứng Lương (-{formatVND(advanceAmount || 0)}) & Trừ Khoản Trừ
                  </span>
                </button>
                </form>
              )}
            </div>

            {/* Quick Employee Summary Box with Direct Edit / Delete Buttons */}
            <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                  Danh Sách Nhân Viên & Tổng Hợp Ứng Lương ({employees.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveSubView('employees')}
                  className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Mở bảng Quản lý & Phân Role →
                </button>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                {employees.map((emp) => {
                  const st = employeeStatsMap.get(emp.id);
                  const isSelected = effectiveSelectedEmployee?.id === emp.id;
                  const loginInfo = getEmployeeLoginInfo(emp);
                  return (
                    <div
                      key={emp.id}
                      className={`py-2.5 px-2.5 rounded-xl flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div
                        onClick={() => {
                          setSelectedEmployeeId(emp.id);
                          setEmployeeFilter(
                            employeeFilter === emp.id ? 'ALL' : emp.id
                          );
                        }}
                        className="min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-1.5">
                          <span className="truncate">{emp.fullName}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-600 dark:text-slate-300 shrink-0">
                            {emp.roleOrPosition || 'Nhân viên phục vụ'}
                          </span>
                          {loginInfo.hasLogin && loginInfo.sysRole ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                              Role: {ROLE_LABELS[loginInfo.sysRole]} (@
                              {loginInfo.username})
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500 shrink-0">
                              Không cần TK
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          Đã ứng {st?.periodCount || 0} lần (-
                          {formatVND(st?.periodTotal || 0)})
                          {emp.baseSalary && emp.baseSalary > 0
                            ? ` · Còn: ${formatNumber(
                                Math.max(
                                  0,
                                  emp.baseSalary - (st?.currentMonthTotal || 0)
                                )
                              )}đ`
                            : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {canWrite && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditEmployee(emp);
                            }}
                            title="Sửa thông tin & Phân Role nhân viên"
                            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Sửa</span>
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRequestDeleteEmployee(emp);
                            }}
                            title="Xóa nhân viên khỏi hệ thống"
                            className="px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-[11px] font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Xóa</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column (7 cols): Bảng Lịch Sử Ứng Lương & Chỉnh Sửa Trực Tiếp */}
          <div className="lg:col-span-7 space-y-4">
            <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
              {/* Filter Controls & View Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      2. Sổ Lịch Sử Nhân Viên Ứng Lương ({filteredAdvances.length} phiếu)
                    </h3>
                    <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setAdvanceViewMode('table')}
                        className={`px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors cursor-pointer ${
                          advanceViewMode === 'table'
                            ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                        }`}
                        title="Xem dạng bảng (table)"
                      >
                        <Table className="w-3 h-3" />
                        <span>Dạng Bảng</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdvanceViewMode('cards')}
                        className={`px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors cursor-pointer ${
                          advanceViewMode === 'cards'
                            ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                        }`}
                        title="Xem dạng thẻ / ảnh phiếu ứng lương"
                      >
                        <Image className="w-3 h-3" />
                        <span>Xem như ảnh</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Tùy chọn xem dạng bảng (table) hoặc xem dạng ảnh phiếu chi tiết kèm xuất ảnh/in phiếu.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSubView('monthly_table');
                      setPeriodMode('month');
                    }}
                    className="px-2.5 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Mở Bảng Theo Dõi Theo Tháng toàn màn hình"
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>Mở Bảng Theo Tháng →</span>
                  </button>

                  {canDelete && filteredAdvances.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRequestDeleteFilteredAdvances}
                      className="px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa ({filteredAdvances.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Period Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {(
                  [
                    { id: 'today', label: 'Hôm nay' },
                    { id: 'yesterday', label: 'Hôm qua' },
                    { id: 'single_day', label: 'Chọn 1 ngày' },
                    { id: 'week', label: '7 ngày qua' },
                    { id: 'month', label: 'Theo Tháng' },
                    { id: 'custom', label: 'Khoảng ngày' },
                    { id: 'all', label: 'Tất cả' },
                  ] as { id: AdvancePeriodMode; label: string }[]
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriodMode(p.id)}
                    className={`px-2.5 py-1.5 rounded-xl font-semibold cursor-pointer transition-colors ${
                      periodMode === p.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {periodMode === 'single_day' && (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Chọn ngày ứng:</span>
                  <input
                    type="date"
                    value={singleDate}
                    onChange={(e) => setSingleDate(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              )}

              {periodMode === 'month' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Chọn tháng:</span>
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-bold text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    {/* Stepper buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const [y, m] = selectedMonth.split('-').map(Number);
                          const prevDate = new Date(y, m - 2, 1);
                          const prevStr = `${prevDate.getFullYear()}-${String(
                            prevDate.getMonth() + 1
                          ).padStart(2, '0')}`;
                          setSelectedMonth(prevStr);
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                        title="Tháng trước"
                      >
                        ← Tháng trước
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedMonth(todayStr.slice(0, 7))}
                        className={`px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                          selectedMonth === todayStr.slice(0, 7)
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                        title="Về tháng hiện tại"
                      >
                        Tháng này
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const [y, m] = selectedMonth.split('-').map(Number);
                          const nextDate = new Date(y, m, 1);
                          const nextStr = `${nextDate.getFullYear()}-${String(
                            nextDate.getMonth() + 1
                          ).padStart(2, '0')}`;
                          setSelectedMonth(nextStr);
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                        title="Tháng sau"
                      >
                        Tháng sau →
                      </button>
                    </div>
                  </div>

                  {/* Quick month pills from available history */}
                  {availableAdvanceMonths.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="text-slate-500 text-[10px]">Tháng có dữ liệu ứng:</span>
                      {availableAdvanceMonths.map(([mStr, count]) => {
                        const [y, m] = mStr.split('-');
                        const isCur = selectedMonth === mStr;
                        return (
                          <button
                            key={mStr}
                            type="button"
                            onClick={() => setSelectedMonth(mStr)}
                            className={`px-2 py-0.5 rounded-lg border font-mono font-semibold transition-colors cursor-pointer ${
                              isCur
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            T{m}/{y} ({count} phiếu)
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {periodMode === 'custom' && (
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span>Từ:</span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                  <span>Đến:</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              )}

              {/* Employee & Keyword Filter */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <select
                  value={employeeFilter}
                  onChange={(e) => setEmployeeFilter(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                >
                  <option value="ALL">
                    Tất cả nhân viên ({employees.length})
                  </option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.roleOrPosition || 'Nhân viên phục vụ'})
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="Tìm tên nhân viên, ngày ứng, ghi chú..."
                    className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              {/* Inline Edit Advance Form */}
              {editingAdvance && (
                <form
                  onSubmit={handleSaveEditedAdvance}
                  className="p-4 rounded-2xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50/70 dark:bg-amber-950/30 space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <Edit3 className="w-4 h-4 text-amber-600" />
                      <span>
                        Chỉnh sửa phiếu ứng lương của:{' '}
                        {editingAdvance.employeeName}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingAdvance(null)}
                      className="p-1 rounded-lg text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold mb-1">
                        Nhân viên:
                      </label>
                      <select
                        value={editAdvEmployeeId}
                        onChange={(e) => setEditAdvEmployeeId(e.target.value)}
                        className="w-full h-9 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                      >
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.fullName} ({emp.roleOrPosition || 'Nhân viên phục vụ'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold mb-1">
                        Ngày ứng lương:
                      </label>
                      <input
                        type="date"
                        value={editAdvDate}
                        onChange={(e) => setEditAdvDate(e.target.value)}
                        className="w-full h-9 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold mb-1">
                        Số tiền ứng (VNĐ):
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        value={editAdvAmount || ''}
                        onChange={(e) =>
                          setEditAdvAmount(
                            Math.max(0, Math.round(Number(e.target.value) || 0))
                          )
                        }
                        className="w-full h-9 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-rose-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1">
                      Ghi chú:
                    </label>
                    <input
                      type="text"
                      value={editAdvNote}
                      onChange={(e) => setEditAdvNote(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingAdvance(null)}
                      className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Lưu & Đồng bộ Khoản trừ</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Advances Display: Table View OR Cards/Slips View */}
              {filteredAdvances.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-500 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div className="font-semibold text-slate-700 dark:text-slate-300">
                    Chưa có phiếu nhân viên ứng lương nào trong kỳ này.
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Sử dụng form bên trái để tạo phiếu ứng mới hoặc chọn kỳ thời gian khác.
                  </p>
                </div>
              ) : advanceViewMode === 'table' ? (
                /* OPTION 1: TABLE VIEW */
                <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-bold text-slate-500">
                        <th className="py-2.5 px-3 text-center w-10">STT</th>
                        <th className="py-2.5 px-3">Ngày ứng</th>
                        <th className="py-2.5 px-3">Tên nhân viên</th>
                        <th className="py-2.5 px-3">Ghi chú chi tiết</th>
                        <th className="py-2.5 px-3 text-right">Tiền ứng</th>
                        <th className="py-2.5 px-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredAdvances.map((adv, idx) => (
                        <tr
                          key={adv.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-3 text-center font-mono text-slate-400">
                            {idx + 1}
                          </td>

                          <td className="py-3 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            <div>{formatDateDMY(adv.advanceDate)}</div>
                          </td>

                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-[11px] shrink-0">
                                {adv.employeeName.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 dark:text-white truncate">
                                  {adv.employeeName}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {adv.employeeRole || 'Nhân viên phục vụ'}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <div className="text-slate-700 dark:text-slate-200 font-medium">
                              {adv.note || '(Không có ghi chú)'}
                            </div>
                            <div className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.2 rounded bg-rose-50 dark:bg-rose-950/50 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Đã trừ qua Khoản trừ (UNG-LUONG)</span>
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-extrabold text-rose-600 dark:text-rose-400 whitespace-nowrap text-xs sm:text-sm">
                            -{formatVND(adv.amount)}
                          </td>

                          <td className="py-3 px-3 text-right whitespace-nowrap space-x-1">
                            <button
                              type="button"
                              onClick={() => setViewSlipAdvance(adv)}
                              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                              title="Xem như ảnh phiếu / in phiếu"
                            >
                              <Image className="w-3 h-3 text-emerald-600" />
                              <span>Ảnh</span>
                            </button>
                            {canWrite && (
                              <button
                                type="button"
                                onClick={() => handleStartEditAdvance(adv)}
                                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                                title="Sửa thông tin phiếu ứng"
                              >
                                <Edit3 className="w-3 h-3 text-amber-600" />
                                <span>Sửa</span>
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRequestDeleteSingleAdvance(adv)
                                }
                                className="px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-[11px] font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
                                title="Xóa phiếu ứng lương"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Xóa</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800/80 font-bold">
                      <tr>
                        <td colSpan={3} className="py-3 px-3 text-slate-800 dark:text-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="uppercase text-[11px] tracking-wide text-slate-500">
                              TỔNG ỨNG TRONG KỲ:
                            </span>
                            <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                              {filteredAdvances.length} phiếu ứng
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-500 hidden sm:table-cell">
                          Đã tự động khấu trừ vào chi trong ngày
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-rose-600 dark:text-rose-400 text-sm sm:text-base whitespace-nowrap">
                          -{formatVND(totalAdvanceInPeriod)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSubView('monthly_table');
                              setPeriodMode('month');
                            }}
                            className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer"
                          >
                            Xem Sổ Tháng →
                          </button>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                /* OPTION 2: CARDS / SLIPS VIEW (XEM NHƯ ẢNH PHIẾU) */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredAdvances.map((adv) => (
                    <div
                      key={adv.id}
                      className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-800/40 shadow-xs hover:border-emerald-500/50 transition-all space-y-2.5 relative group"
                    >
                      <div className="flex items-center justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-[10px] font-mono font-bold text-slate-500">
                            PHIẾU #{adv.id.slice(-6).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                          {formatDateDMY(adv.advanceDate)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-extrabold text-xs shrink-0">
                          {adv.employeeName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {adv.employeeName}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {adv.employeeRole || 'Nhân viên phục vụ'}
                          </div>
                        </div>
                      </div>

                      {/* Amount Box */}
                      <div className="p-2.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-900/60 text-center">
                        <div className="text-[10px] uppercase font-bold text-rose-500">
                          Số tiền ứng
                        </div>
                        <div className="text-base font-black font-mono text-rose-600 dark:text-rose-400">
                          -{formatVND(adv.amount)}
                        </div>
                        <div className="text-[10px] italic text-rose-600/80 truncate mt-0.5">
                          {formatNumberToVietnameseWords(adv.amount)}
                        </div>
                      </div>

                      {/* Note */}
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg">
                        <strong>Lý do:</strong> {adv.note || 'Tạm ứng lương nhân viên'}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-1 gap-1">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewSlipAdvance(adv)}
                            className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer hover:bg-emerald-100"
                            title="Xem như ảnh phiếu / in phiếu"
                          >
                            <Image className="w-3 h-3" />
                            <span>Xem ảnh</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadAdvanceSlipAsImage(adv)}
                            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer hover:bg-slate-100"
                            title="Tải ảnh PNG về máy"
                          >
                            <Download className="w-3 h-3" />
                            <span>Tải ảnh</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => handleStartEditAdvance(adv)}
                              className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 cursor-pointer"
                              title="Sửa phiếu"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleRequestDeleteSingleAdvance(adv)}
                              className="p-1 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 cursor-pointer"
                              title="Xóa phiếu"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 2: SỔ THEO DÕI NHÂN VIÊN ỨNG LƯƠNG THEO THÁNG (DẠNG TABLE)
          Đáp ứng chính xác yêu cầu: Tên nhân viên, Ngày ứng, Tiền ứng, Ghi chú chi tiết, và TỔNG ỨNG
         ===================================================================== */}
      {activeSubView === 'monthly_table' && (
        <div className="space-y-4">
          {/* Main Container */}
          <div className="p-4 sm:p-6 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
            {/* Header with Title and Month Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                    <Table className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Bảng Theo Dõi Nhân Viên Ứng Lương Theo Tháng (Table View)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Theo dõi chi tiết: Tên nhân viên · Ngày ứng · Tiền ứng · Ghi chú chi tiết · Và Hàng Tổng Ứng
                    </p>
                  </div>
                </div>
              </div>

              {/* Month Selection Bar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-medium">Chọn tháng:</span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-2.5 py-0.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-bold text-xs text-slate-800 dark:text-slate-100 font-mono"
                  />
                </div>

                {/* Steppers */}
                <div className="flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const [y, m] = selectedMonth.split('-').map(Number);
                      const prevDate = new Date(y, m - 2, 1);
                      const prevStr = `${prevDate.getFullYear()}-${String(
                        prevDate.getMonth() + 1
                      ).padStart(2, '0')}`;
                      setSelectedMonth(prevStr);
                    }}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                  >
                    ← Tháng trước
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMonth(todayStr.slice(0, 7))}
                    className={`px-2.5 py-1.5 rounded-xl border font-semibold cursor-pointer ${
                      selectedMonth === todayStr.slice(0, 7)
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Tháng này
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const [y, m] = selectedMonth.split('-').map(Number);
                      const nextDate = new Date(y, m, 1);
                      const nextStr = `${nextDate.getFullYear()}-${String(
                        nextDate.getMonth() + 1
                      ).padStart(2, '0')}`;
                      setSelectedMonth(nextStr);
                    }}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                  >
                    Tháng sau →
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveSubView('advances')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs ml-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Nhập Phiếu Ứng</span>
                </button>
              </div>
            </div>

            {/* Quick Month Selector from available records */}
            {availableAdvanceMonths.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-500 text-[11px] font-medium">Tháng có dữ liệu ứng:</span>
                {availableAdvanceMonths.map(([mStr, count]) => {
                  const [y, m] = mStr.split('-');
                  const isCur = selectedMonth === mStr;
                  return (
                    <button
                      key={mStr}
                      type="button"
                      onClick={() => setSelectedMonth(mStr)}
                      className={`px-2.5 py-1 rounded-xl border font-mono font-semibold transition-colors cursor-pointer ${
                        isCur
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-bold'
                          : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Tháng {m}/{y} ({count} phiếu)
                    </button>
                  );
                })}
              </div>
            )}

            {/* Summary KPI Cards for the Selected Month */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
              <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60">
                <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wide">
                  TỔNG ỨNG TRONG THÁNG
                </div>
                <div className="mt-1 text-xl sm:text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
                  -{formatVND(monthlyTotalAdvance)}
                </div>
                <div className="text-[11px] text-rose-600/80 mt-0.5">
                  Tháng {selectedMonth.split('-').reverse().join('/')}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                  Tổng số phiếu ứng
                </div>
                <div className="mt-1 text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
                  {monthlyAdvancesList.length} phiếu
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Trong tháng đang lọc
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/60">
                <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                  Số nhân viên đã ứng
                </div>
                <div className="mt-1 text-xl sm:text-2xl font-extrabold font-mono text-emerald-700 dark:text-emerald-400">
                  {monthlyEmployeeSummaryList.length} nhân viên
                </div>
                <div className="text-[11px] text-emerald-600/80 mt-0.5">
                  Trên tổng {employees.length} nhân sự
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-900/60">
                <div className="text-[11px] font-bold text-teal-700 dark:text-teal-300 uppercase tracking-wide">
                  Trạng thái khấu trừ
                </div>
                <div className="mt-1 text-base font-extrabold text-teal-800 dark:text-teal-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>100% Khấu Trừ</span>
                </div>
                <div className="text-[11px] text-teal-600/80 mt-0.5">
                  Tự động đồng bộ Khoản trừ
                </div>
              </div>
            </div>

            {/* Filter inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Lọc theo nhân viên:
                </label>
                <select
                  value={employeeFilter}
                  onChange={(e) => setEmployeeFilter(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                >
                  <option value="ALL">Tất cả nhân viên ({employees.length})</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.roleOrPosition || 'Nhân viên phục vụ'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Tìm kiếm nhanh:
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="Tìm theo tên nhân viên, ngày ứng (DD/MM), ghi chú..."
                    className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* TABLE THEO THÁNG CHÍNH THỨC */}
            {monthlyAdvancesList.length === 0 ? (
              <div className="py-14 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-500 space-y-2">
                <Receipt className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="font-bold text-sm text-slate-700 dark:text-slate-300">
                  Không có phiếu ứng lương nào trong Tháng {selectedMonth.split('-').reverse().join('/')}.
                </div>
                <p className="text-slate-400">
                  Chọn tháng khác hoặc bấm "+ Nhập Phiếu Ứng" để ghi nhận phiếu ứng mới.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-800/80 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          <th className="py-3 px-3 text-center w-12">STT</th>
                          <th className="py-3 px-4">Tên Nhân Viên</th>
                          <th className="py-3 px-4">Ngày Ứng</th>
                          <th className="py-3 px-4 text-right">Tiền Ứng (VNĐ)</th>
                          <th className="py-3 px-4">Ghi Chú Chi Tiết</th>
                          <th className="py-3 px-4 text-right">Thao Tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {monthlyAdvancesList.map((adv, idx) => (
                          <tr
                            key={adv.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-3 px-3 text-center font-mono text-slate-400 font-semibold">
                              {idx + 1}
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-extrabold text-xs shrink-0">
                                  {adv.employeeName.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 dark:text-white">
                                    {adv.employeeName}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {adv.employeeRole || 'Nhân viên phục vụ'}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4 font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              <div className="font-bold">{formatDateDMY(adv.advanceDate)}</div>
                              <div className="text-[10px] text-slate-400">
                                {adv.createdAtMs
                                  ? new Date(adv.createdAtMs).toLocaleTimeString('vi-VN', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : ''}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right font-mono font-black text-rose-600 dark:text-rose-400 whitespace-nowrap text-sm sm:text-base">
                              -{formatVND(adv.amount)}
                            </td>

                            <td className="py-3 px-4">
                              <div className="text-slate-800 dark:text-slate-200 font-medium">
                                {adv.note || '(Không có ghi chú)'}
                              </div>
                              <div className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                <span>Đã trừ vào Khoản trừ (Chi trong ngày)</span>
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                              <button
                                type="button"
                                onClick={() => setViewSlipAdvance(adv)}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                                title="Xem như ảnh phiếu / in phiếu"
                              >
                                <Image className="w-3 h-3 text-emerald-600" />
                                <span>Xem ảnh</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadAdvanceSlipAsImage(adv)}
                                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-[11px] text-slate-600 cursor-pointer"
                                title="Tải ảnh PNG"
                              >
                                <Download className="w-3 h-3" />
                              </button>
                              {canWrite && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditAdvance(adv)}
                                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-[11px] font-semibold text-amber-600 cursor-pointer"
                                  title="Sửa phiếu"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleRequestDeleteSingleAdvance(adv)}
                                  className="px-2 py-1 rounded-lg border border-rose-200 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  title="Xóa phiếu"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>

                      {/* HÀNG TỔNG ỨNG THEO THÁNG */}
                      <tfoot className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800 font-bold">
                        <tr>
                          <td colSpan={3} className="py-4 px-4 text-slate-900 dark:text-white">
                            <div className="flex items-center gap-2">
                              <span className="text-xs uppercase tracking-wider text-slate-500 font-bold">
                                TỔNG CỘNG ỨNG LƯƠNG THÁNG {selectedMonth.split('-').reverse().join('/')}:
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[11px] font-extrabold">
                                {monthlyAdvancesList.length} phiếu ứng · {monthlyEmployeeSummaryList.length} nhân viên
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-right font-mono font-black text-rose-600 dark:text-rose-400 text-base sm:text-lg whitespace-nowrap">
                            -{formatVND(monthlyTotalAdvance)}
                          </td>
                          <td colSpan={2} className="py-4 px-4 text-[11px] text-slate-500">
                            Số tiền đã tự động cấn trừ vào báo cáo doanh thu & chi phí quán
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* BẢNG TỔNG HỢP THEO TỪNG NHÂN VIÊN TRONG THÁNG */}
                <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-emerald-600" />
                        <span>Tổng Hợp Tiền Ứng Chi Tiết Theo Từng Nhân Viên Trong Tháng ({monthlyEmployeeSummaryList.length})</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Thống kê tổng tiền mỗi nhân viên đã ứng và số dư lương cơ bản còn lại
                      </p>
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto bg-white dark:bg-slate-900">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-bold text-slate-500">
                          <th className="py-2.5 px-3 text-center w-10">STT</th>
                          <th className="py-2.5 px-3">Nhân viên</th>
                          <th className="py-2.5 px-3">Chức vụ / Bộ phận</th>
                          <th className="py-2.5 px-3 text-center">Số lần ứng</th>
                          <th className="py-2.5 px-3 text-right">Tổng tiền đã ứng</th>
                          <th className="py-2.5 px-3 text-right">Lương cơ bản</th>
                          <th className="py-2.5 px-3 text-right">Lương còn lại dự kiến</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {monthlyEmployeeSummaryList.map((empSum, sIdx) => {
                          const remainingSalary = empSum.baseSalary > 0
                            ? Math.max(0, empSum.baseSalary - empSum.totalAmount)
                            : null;
                          return (
                            <tr key={empSum.employeeId || sIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                                {sIdx + 1}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                                {empSum.employeeName}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                                {empSum.employeeRole}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-semibold">
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                                  {empSum.count} lần
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-extrabold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                -{formatVND(empSum.totalAmount)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                {empSum.baseSalary > 0 ? `${formatNumber(empSum.baseSalary)} ₫` : 'Chưa cài đặt'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                                {remainingSalary !== null ? (
                                  <span className="text-emerald-600 dark:text-emerald-400">
                                    {formatNumber(remainingSalary)} ₫
                                  </span>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 2: QUẢN LÝ DANH SÁCH NHÂN VIÊN & PHÂN ROLE ĐĂNG NHẬP
         ===================================================================== */}
      {activeSubView === 'employees' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Add Employee Form (Default: Nhân viên phục vụ, không cần TK đăng nhập) */}
          <div className="lg:col-span-4">
            <form
              onSubmit={handleCreateEmployeeFull}
              className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-3.5 text-xs"
            >
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-emerald-600" />
                  <span>Thêm Nhân Viên Mới</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Nếu không phân Role, mặc định là <strong>Nhân viên phục vụ</strong> và không cần tài khoản đăng nhập cho đến khi Admin sửa thông tin.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Họ và tên nhân viên *:
                </label>
                <input
                  type="text"
                  value={empFullName}
                  onChange={(e) => {
                    setEmpFullName(e.target.value);
                    if (empHasLogin && !empUsername) {
                      setEmpUsername(slugifyUsernameFromFullName(e.target.value));
                    }
                  }}
                  placeholder="VD: Nguyễn Văn An"
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Bộ phận / Chức vụ (Mặc định: Nhân viên phục vụ):
                </label>
                <input
                  type="text"
                  list="emp-positions-list"
                  value={empRole}
                  onChange={(e) => setEmpRole(e.target.value)}
                  placeholder="Mặc định: Nhân viên phục vụ"
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <datalist id="emp-positions-list">
                  {POSITION_SUGGESTIONS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Số điện thoại:
                  </label>
                  <input
                    type="text"
                    value={empPhone}
                    onChange={(e) => setEmpPhone(e.target.value)}
                    placeholder="VD: 0905..."
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Lương cơ bản / tháng:
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500000}
                    value={empBaseSalary || ''}
                    onChange={(e) =>
                      setEmpBaseSalary(
                        Math.max(0, Math.round(Number(e.target.value) || 0))
                      )
                    }
                    placeholder="VD: 6500000"
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú ca làm việc:
                </label>
                <input
                  type="text"
                  value={empNote}
                  onChange={(e) => setEmpNote(e.target.value)}
                  placeholder="VD: Ca tối, Phục vụ bàn..."
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              {/* Optional Role & Login Account Assignment for Admin */}
              {isAdminUser && (
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Phân Role & Quyền đăng nhập</span>
                    </span>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={empHasLogin}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEmpHasLogin(checked);
                          if (checked) {
                            if (!empUsername && empFullName) {
                              setEmpUsername(
                                slugifyUsernameFromFullName(empFullName)
                              );
                            }
                            if (
                              !empRole ||
                              empRole === 'Nhân viên phục vụ' ||
                              empRole === 'Phục vụ'
                            ) {
                              const rMeta = ASSIGNABLE_ROLES.find(
                                (r) => r.role === empSystemRole
                              );
                              if (rMeta) setEmpRole(rMeta.defaultPosition);
                            }
                          } else {
                            setEmpRole('Nhân viên phục vụ');
                          }
                        }}
                        className="w-3.5 h-3.5 rounded text-emerald-600"
                      />
                      <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        Cấp Role & TK đăng nhập
                      </span>
                    </label>
                  </div>

                  {!empHasLogin ? (
                    <div className="text-[11px] text-slate-500">
                      Đang để mặc định: <strong>Nhân viên phục vụ</strong> — Không cần tài khoản đăng nhập (Admin có thể bấm <strong>"Sửa"</strong> bất kỳ lúc nào để phân Role sau).
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1 border-t border-slate-200/70 dark:border-slate-800">
                      <div>
                        <label className="block text-[11px] font-semibold mb-1">
                          Chọn Role hệ thống:
                        </label>
                        <select
                          value={empSystemRole}
                          onChange={(e) => {
                            const r = e.target.value as UserRole;
                            setEmpSystemRole(r);
                            const rMeta = ASSIGNABLE_ROLES.find(
                              (item) => item.role === r
                            );
                            if (rMeta) setEmpRole(rMeta.defaultPosition);
                          }}
                          className="w-full h-9 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r.role} value={r.role}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold mb-1">
                            Tài khoản (Username):
                          </label>
                          <input
                            type="text"
                            value={empUsername}
                            onChange={(e) =>
                              setEmpUsername(e.target.value.toLowerCase())
                            }
                            placeholder="VD: nguyenvanan"
                            className="w-full h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold mb-1">
                            Mật khẩu:
                          </label>
                          <div className="relative">
                            <input
                              type={showNewEmpPass ? 'text' : 'password'}
                              value={empPassword}
                              onChange={(e) => setEmpPassword(e.target.value)}
                              className="w-full h-8 pl-2.5 pr-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewEmpPass((v) => !v)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                            >
                              {showNewEmpPass ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={!canWrite || isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Vào Danh Sách Nhân Viên</span>
              </button>
            </form>
          </div>

          {/* Right: Employee List Table */}
          <div className="lg:col-span-8 space-y-4">
            <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Danh Sách Nhân Viên Quán ({employees.length} nhân sự)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Bấm <strong>"Sửa / Phân Role"</strong> để chỉnh sửa thông tin, cấp Role & quyền đăng nhập hệ thống, hoặc bấm <strong>"Xóa"</strong> để xóa nhân viên.
                  </p>
                </div>
              </div>

              {employees.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-500">
                  Danh sách nhân viên đang trống. Hãy thêm nhân viên mới ở khung bên trái.
                </div>
              ) : (
                <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-bold text-slate-500">
                        <th className="py-2.5 px-3">Nhân viên & Chức vụ</th>
                        <th className="py-2.5 px-3">Role & Quyền đăng nhập</th>
                        <th className="py-2.5 px-3 text-right">Lương cơ bản</th>
                        <th className="py-2.5 px-3 text-right">Đã ứng tháng này</th>
                        <th className="py-2.5 px-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {employees.map((emp) => {
                        const st = employeeStatsMap.get(emp.id);
                        const monthAdv = st?.currentMonthTotal || 0;
                        const loginInfo = getEmployeeLoginInfo(emp);
                        return (
                          <tr
                            key={emp.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <td className="py-3 px-3">
                              <div className="font-bold text-slate-900 dark:text-white">
                                {emp.fullName}
                              </div>
                              <div className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                                <Briefcase className="w-3 h-3" />
                                <span>
                                  {emp.roleOrPosition || 'Nhân viên phục vụ'}
                                </span>
                              </div>
                              {emp.phone && (
                                <div className="font-mono text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span>{emp.phone}</span>
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3">
                              {loginInfo.hasLogin && loginInfo.sysRole ? (
                                <div className="space-y-1">
                                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                                    <Shield className="w-3 h-3" />
                                    <span>
                                      {ROLE_LABELS[loginInfo.sysRole]}
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                    <KeyRound className="w-3 h-3 text-amber-500" />
                                    <span>
                                      TK: <strong>@{loginInfo.username}</strong>
                                    </span>
                                    <span className="text-slate-400">
                                      ({loginInfo.effectiveTabs.length} mục quản lý)
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                    Mặc định: Nhân viên phục vụ
                                  </span>
                                  <div className="text-[10px] text-slate-400">
                                    Không cần tài khoản đăng nhập
                                  </div>
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {emp.baseSalary && emp.baseSalary > 0
                                ? formatVND(emp.baseSalary)
                                : '—'}
                            </td>

                            <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                              <div className="font-bold text-rose-600 dark:text-rose-400">
                                {monthAdv > 0 ? `-${formatVND(monthAdv)}` : '0 ₫'}
                              </div>
                              {emp.baseSalary && emp.baseSalary > 0 && (
                                <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                  Còn lại:{' '}
                                  {formatVND(
                                    Math.max(0, emp.baseSalary - monthAdv)
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                              {canWrite && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedEmployeeId(emp.id);
                                    setActiveSubView('advances');
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer"
                                >
                                  Ứng lương
                                </button>
                              )}
                              {canWrite && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditEmployee(emp)}
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Sửa / Phân Role</span>
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleRequestDeleteEmployee(emp)}
                                  className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-[11px] font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Xóa</span>
                                </button>
                              )}
                              {!canWrite && !canDelete && (
                                <span className="text-[11px] text-slate-400 italic">
                                  Chỉ xem
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL POPUP 1: CHỈNH SỬA THÔNG TIN & PHÂN ROLE NHÂN VIÊN
         ===================================================================== */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Chỉnh Sửa Nhân Viên & Phân Role: {editingEmployee.fullName}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Mặc định là Nhân viên phục vụ (không cần TK đăng nhập) hoặc Admin phân Role & quyền đăng nhập
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveEditedEmployee}
              className="p-5 overflow-y-auto space-y-4 text-xs"
            >
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Họ và tên nhân viên *:
                  </label>
                  <input
                    type="text"
                    value={editEmpName}
                    onChange={(e) => setEditEmpName(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Bộ phận / Chức vụ:
                  </label>
                  <input
                    type="text"
                    list="edit-emp-positions"
                    value={editEmpRole}
                    onChange={(e) => setEditEmpRole(e.target.value)}
                    placeholder="Mặc định: Nhân viên phục vụ"
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                  <datalist id="edit-emp-positions">
                    {POSITION_SUGGESTIONS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Số điện thoại:
                  </label>
                  <input
                    type="text"
                    value={editEmpPhone}
                    onChange={(e) => setEditEmpPhone(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Lương cơ bản / tháng (VNĐ):
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500000}
                    value={editEmpBaseSalary || ''}
                    onChange={(e) =>
                      setEditEmpBaseSalary(
                        Math.max(0, Math.round(Number(e.target.value) || 0))
                      )
                    }
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú ca làm việc:
                </label>
                <input
                  type="text"
                  value={editEmpNote}
                  onChange={(e) => setEditEmpNote(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              {/* Admin Role & Login Assignment Section */}
              <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 dark:border-emerald-800/60 pb-2.5">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-emerald-600" />
                      <span>Phân Role & Quyền Đăng Nhập Hệ Thống</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Nếu không phân Role thì mặc định là Nhân viên phục vụ và không cần tài khoản đăng nhập.
                    </p>
                  </div>
                </div>

                {/* 2 Mode Selector Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditHasLogin(false);
                      if (
                        ASSIGNABLE_ROLES.some(
                          (r) => r.defaultPosition === editEmpRole
                        )
                      ) {
                        setEditEmpRole('Nhân viên phục vụ');
                      }
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      !editHasLogin
                        ? 'border-emerald-600 bg-white dark:bg-slate-900 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 opacity-75'
                    }`}
                  >
                    <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                      <span>1. Không phân Role (Mặc định)</span>
                      {!editHasLogin && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Mặc định là <strong>Nhân viên phục vụ</strong>, chỉ chấm ứng lương, không cần tài khoản đăng nhập.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditHasLogin(true);
                      if (!editUsername) {
                        setEditUsername(
                          slugifyUsernameFromFullName(editEmpName)
                        );
                      }
                      const rMeta = ASSIGNABLE_ROLES.find(
                        (r) => r.role === editSystemRole
                      );
                      if (
                        rMeta &&
                        (!editEmpRole ||
                          editEmpRole === 'Nhân viên phục vụ' ||
                          editEmpRole === 'Phục vụ')
                      ) {
                        setEditEmpRole(rMeta.defaultPosition);
                      }
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      editHasLogin
                        ? 'border-emerald-600 bg-white dark:bg-slate-900 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 opacity-75'
                    }`}
                  >
                    <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                      <span>2. Admin Phân Role & Cấp TK</span>
                      {editHasLogin && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Phân Role (Thu ngân, Quản lý, Kiểm kho, Kế toán...) và cấp quyền đăng nhập tùy vào Role.
                    </div>
                  </button>
                </div>

                {editHasLogin && (
                  <div className="space-y-3 pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60">
                    {/* Role selection */}
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Chọn Role cho nhân viên:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ASSIGNABLE_ROLES.map((item) => {
                          const active = editSystemRole === item.role;
                          return (
                            <button
                              key={item.role}
                              type="button"
                              onClick={() =>
                                handleChangeEditSystemRole(item.role)
                              }
                              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                active
                                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200'
                                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-300'
                              }`}
                            >
                              <div className="font-bold flex items-center justify-between">
                                <span>{item.label}</span>
                                {active && (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {item.desc}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Username & Password */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Tài khoản đăng nhập (Username):</span>
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setEditUsername(
                                slugifyUsernameFromFullName(editEmpName)
                              )
                            }
                            className="text-[10px] font-bold text-emerald-600 hover:underline cursor-pointer"
                          >
                            Lấy theo tên
                          </button>
                        </div>
                        <input
                          type="text"
                          value={editUsername}
                          onChange={(e) =>
                            setEditUsername(e.target.value.toLowerCase())
                          }
                          placeholder="VD: lethuhavn"
                          className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                          <Lock className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Mật khẩu đăng nhập:</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showEditEmpPass ? 'text' : 'password'}
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            placeholder="Mặc định: 123456"
                            className="w-full h-9 pl-3 pr-8 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditEmpPass((v) => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                          >
                            {showEditEmpPass ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Permissions by Role */}
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          Quyền truy cập các mục quản lý theo Role ({ROLE_LABELS[editSystemRole]}):
                        </span>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px]">
                          <input
                            type="checkbox"
                            checked={editUseCustomTabs}
                            onChange={(e) => {
                              const custom = e.target.checked;
                              setEditUseCustomTabs(custom);
                              if (!custom) {
                                setEditAllowedTabs(
                                  rolePermissions[editSystemRole]
                                    ?.allowedTabs ||
                                    DEFAULT_ROLE_PERMISSIONS[editSystemRole]
                                      .allowedTabs
                                );
                              }
                            }}
                            className="w-3.5 h-3.5 rounded text-emerald-600"
                          />
                          <span>Tùy chỉnh riêng cho NV này</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {MANAGEMENT_TABS.map((tab) => {
                          const roleTabs =
                            rolePermissions[editSystemRole]?.allowedTabs ||
                            DEFAULT_ROLE_PERMISSIONS[editSystemRole]
                              .allowedTabs;
                          const activeTabs = editUseCustomTabs
                            ? editAllowedTabs
                            : roleTabs;
                          const checked = activeTabs.includes(tab.id);
                          return (
                            <label
                              key={tab.id}
                              className={`flex items-center gap-1.5 p-2 rounded-lg border text-[11px] cursor-pointer transition-colors ${
                                checked
                                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-slate-900 dark:text-white font-semibold'
                                  : 'border-slate-200 dark:border-slate-800 text-slate-400'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  handleToggleEditAllowedTab(tab.id)
                                }
                                className="w-3.5 h-3.5 rounded text-emerald-600 shrink-0"
                              />
                              <span className="truncate">{tab.shortLabel}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => handleRequestDeleteEmployee(editingEmployee)}
                    className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa nhân viên này</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingEmployee(null)}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Lưu Thông Tin & Phân Quyền</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL POPUP 2: POPUP THÔNG BÁO XÓA / CẬP NHẬT NHÂN VIÊN THÀNH CÔNG
         ===================================================================== */}
      {successPopup && (
        <div className="fixed inset-0 z-[110] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                {successPopup.title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {successPopup.message}
              </p>
              {successPopup.detail && (
                <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/70 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                  {successPopup.detail}
                </div>
              )}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setSuccessPopup(null)}
                  className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Đồng ý / Đóng thông báo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* =====================================================================
          MODAL POPUP 3: XEM CHI TIẾT PHIẾU ỨNG LƯƠNG DẠNG ẢNH / IN PHIẾU (RECEIPT SLIP)
         ===================================================================== */}
      {viewSlipAdvance && (
        <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Top Bar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  Xem Như Ảnh Phiếu Ứng Lương
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewSlipAdvance(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Receipt Voucher Card */}
            <div className="p-6 bg-slate-100/60 dark:bg-slate-950/60">
              <div className="p-6 rounded-2xl bg-white text-slate-900 border-2 border-dashed border-emerald-600/40 shadow-md space-y-4 font-sans select-none relative">
                {/* Watermark Logo/Text */}
                <div className="absolute right-4 bottom-14 opacity-5 pointer-events-none text-6xl font-black rotate-[-20deg]">
                  ĐÃ ỨNG
                </div>

                {/* Voucher Header */}
                <div className="text-center border-b border-dashed border-slate-300 pb-3">
                  <div className="text-[11px] font-bold tracking-widest text-emerald-700 uppercase">
                    HỆ THỐNG QUẢN LÝ VQ-BILL
                  </div>
                  <h3 className="text-lg font-black text-slate-900 uppercase mt-0.5 tracking-wide">
                    PHIẾU TẠM ỨNG LƯƠNG NHÂN VIÊN
                  </h3>
                  <div className="text-[11px] font-mono text-slate-500 mt-1 flex items-center justify-center gap-2">
                    <span>Mã số: <strong>{viewSlipAdvance.id}</strong></span>
                    <span>·</span>
                    <span>Ngày: <strong>{formatDateDMY(viewSlipAdvance.advanceDate)}</strong></span>
                  </div>
                </div>

                {/* Employee Info */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Họ và tên nhân viên:</span>
                    <strong className="text-sm font-bold text-slate-900">
                      {viewSlipAdvance.employeeName}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Bộ phận / Chức vụ:</span>
                    <span className="font-semibold text-slate-700">
                      {viewSlipAdvance.employeeRole || 'Nhân viên phục vụ'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Thời gian tạo phiếu:</span>
                    <span className="font-mono text-slate-600">
                      {viewSlipAdvance.createdAtMs
                        ? new Date(viewSlipAdvance.createdAtMs).toLocaleString('vi-VN')
                        : formatDateDMY(viewSlipAdvance.advanceDate)}
                    </span>
                  </div>
                </div>

                {/* Amount Box */}
                <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-center space-y-1">
                  <div className="text-[11px] uppercase tracking-wider font-extrabold text-rose-600">
                    SỐ TIỀN TẠM ỨNG
                  </div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-rose-600">
                    -{formatVND(viewSlipAdvance.amount)}
                  </div>
                  <div className="text-xs italic text-rose-700">
                    Bằng chữ: <strong>{formatNumberToVietnameseWords(viewSlipAdvance.amount)}</strong>
                  </div>
                </div>

                {/* Purpose Note */}
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-0.5">
                  <span className="font-bold text-slate-600">Lý do / Mục đích ứng:</span>
                  <div className="italic">
                    "{viewSlipAdvance.note || 'Tạm ứng lương nhân viên'}"
                  </div>
                </div>

                {/* Auto synced badge */}
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 font-semibold flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Đã khấu trừ trực tiếp vào Khoản trừ trong ngày</span>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-4 pt-4 text-center text-xs">
                  <div>
                    <div className="font-bold text-slate-800">Người Lập Phiếu / Thu Ngân</div>
                    <div className="text-[10px] text-slate-400 italic">(Ký & ghi rõ họ tên)</div>
                    <div className="h-12 flex items-end justify-center font-cursive text-slate-600 text-sm">
                      Đã duyệt
                    </div>
                  </div>

                  <div>
                    <div className="font-bold text-slate-800">Người Nhận Tiền Ứng</div>
                    <div className="text-[10px] text-slate-400 italic">(Ký xác nhận đã nhận đủ)</div>
                    <div className="h-12 flex items-end justify-center font-bold text-slate-900 text-xs">
                      {viewSlipAdvance.employeeName}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => downloadAdvanceSlipAsImage(viewSlipAdvance)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>Tải Ảnh Phiếu (PNG)</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 hover:bg-slate-100 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>In Phiếu</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewSlipAdvance(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
