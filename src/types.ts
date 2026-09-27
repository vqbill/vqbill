export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  CASHIER = 'cashier',
  VIEWER = 'viewer',
}

export type ManagementTabId =
  | 'dashboard'
  | 'ocr'
  | 'categories'
  | 'debts'
  | 'deductions'
  | 'returns'
  | 'products'
  | 'accounts';

export type PeriodPreset = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom';

export interface ManagementTabMeta {
  id: ManagementTabId;
  label: string;
  shortLabel: string;
  description: string;
}

export const MANAGEMENT_TABS: ManagementTabMeta[] = [
  {
    id: 'dashboard',
    label: 'Tổng quan & Doanh thu',
    shortLabel: 'Tổng quan',
    description:
      'Bảng đối soát doanh thu tiền mặt, chuyển khoản, khoản trừ, công nợ riêng và danh sách hóa đơn',
  },
  {
    id: 'ocr',
    label: 'Chụp / Nhập Bill OCR',
    shortLabel: 'Nhập Bill',
    description:
      'Quét ảnh hóa đơn bằng Gemini AI hoặc dán văn bản, tích chọn công nợ & người nợ để tạo bill mới',
  },
  {
    id: 'categories',
    label: 'Số lượng theo Danh mục',
    shortLabel: 'Danh mục',
    description:
      'Thống kê số lượng bán (bao gồm cả món trong bill công nợ), hoàn trả và doanh thu theo danh mục',
  },
  {
    id: 'debts',
    label: 'Quản lý Công nợ',
    shortLabel: 'Công nợ',
    description:
      'Theo dõi khách nợ, thêm người nợ, chỉnh giá & ghi chú món trong bill nợ, tất toán hoặc xóa công nợ',
  },
  {
    id: 'deductions',
    label: 'Khoản trừ (Chi trong ngày)',
    shortLabel: 'Khoản trừ',
    description:
      'Ghi nhận các khoản tiền chi ra trong ngày (mua bánh mì, mua rau, nguyên liệu, bồi hoàn khách...) trừ vào doanh thu ngày',
  },
  {
    id: 'returns',
    label: 'Hoàn trả (Trả bia / món thừa)',
    shortLabel: 'Hoàn trả',
    description:
      'Ghi nhận khách trả lại bia thừa, món thừa theo hóa đơn (không tự động cộng vào Khoản trừ chi tiêu ngày)',
  },
  {
    id: 'products',
    label: 'Upload Sản phẩm / Menu',
    shortLabel: 'Thực đơn',
    description:
      'Thêm/sửa/xóa sản phẩm, quản lý danh mục và upload thực đơn hàng loạt',
  },
  {
    id: 'accounts',
    label: 'Tài khoản & Phân quyền',
    shortLabel: 'Tài khoản',
    description:
      'Quản lý tài khoản, mật khẩu và phân phối danh mục quản lý cho từng Role & Tài khoản',
  },
];

export interface RolePermissionConfig {
  role: UserRole;
  allowedTabs: ManagementTabId[];
  canWrite: boolean;
  canDelete: boolean;
}

export type RolePermissionsMap = Record<UserRole, RolePermissionConfig>;

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionsMap = {
  [UserRole.ADMIN]: {
    role: UserRole.ADMIN,
    allowedTabs: [
      'dashboard',
      'ocr',
      'categories',
      'debts',
      'deductions',
      'returns',
      'products',
      'accounts',
    ],
    canWrite: true,
    canDelete: true,
  },
  [UserRole.MANAGER]: {
    role: UserRole.MANAGER,
    allowedTabs: [
      'dashboard',
      'ocr',
      'categories',
      'debts',
      'deductions',
      'returns',
      'products',
    ],
    canWrite: true,
    canDelete: true,
  },
  [UserRole.CASHIER]: {
    role: UserRole.CASHIER,
    allowedTabs: ['dashboard', 'ocr', 'debts', 'deductions', 'returns'],
    canWrite: true,
    canDelete: false,
  },
  [UserRole.VIEWER]: {
    role: UserRole.VIEWER,
    allowedTabs: ['dashboard', 'categories', 'debts', 'deductions', 'returns'],
    canWrite: false,
    canDelete: false,
  },
};

export type PaymentType = 'cash' | 'transfer' | 'debt';
export type DebtStatus = 'none' | 'unpaid' | 'paid';

export const STANDARD_CATEGORIES = [
  'Bia',
  'Nước ngọt',
  'Khai vị',
  'Ếch',
  'Gà',
  'Hải sản',
  'Lẩu / Món chính',
  'Khác',
] as const;

export type CategoryType = (typeof STANDARD_CATEGORIES)[number] | string;

export interface ExtractedBillItem {
  productName: string;
  note?: string;
  category: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  originalUnitPrice?: number;
  discountAmount?: number;
  discountPercent?: number;
}

export interface ExtractedBillJSON {
  billInfo: {
    billDate: string;
    rawDate?: string;
    checkInTime?: string;
    checkOutTime?: string;
    tableName?: string;
    paymentType: PaymentType;
    debtorName: string;
    subtotalAmount?: number;
    discountAmount?: number;
    totalAmount: number;
  };
  items: ExtractedBillItem[];
}

export interface BillRecord {
  id: string;
  ownerId: string;
  billCode: string;
  billDate: string; // YYYY-MM-DD (Ca bán 09:00 sáng ngày D -> 08:00 sáng ngày D+1)
  rawDate?: string;
  checkInTime?: string;
  checkOutTime?: string;
  paymentType: PaymentType;
  debtorName: string;
  debtStatus: DebtStatus;
  subtotalAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  deductedAmount: number;
  itemsSummary: string;
  note: string;
  status: 'active' | 'locked';
  createdAtMs: number;
  updatedAtMs: number;
}

export interface BillItemRecord {
  id: string;
  ownerId: string;
  billId: string;
  billDate: string;
  productName: string;
  note?: string;
  category: string;
  quantity: number;
  returnedQuantity: number;
  unitPrice: number;
  subtotal: number;
  originalUnitPrice?: number;
  discountAmount?: number;
  discountPercent?: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ProductRecord {
  id: string;
  ownerId: string;
  productName: string;
  category: string;
  unitPrice: number;
  unit: string;
  totalSold: number;
  totalReturned: number;
  totalRevenue: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface DeductionRecord {
  id: string;
  ownerId: string;
  billId: string;
  billCode: string;
  billDate: string;
  deductionDate: string;
  productName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  note: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ReturnRecord {
  id: string;
  ownerId: string;
  billId: string;
  billCode: string;
  billDate: string;
  returnDate: string;
  productName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  note: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface StaffAccount {
  id: string;
  ownerId?: string;
  username: string;
  password: string;
  displayName: string;
  info: string;
  role: UserRole;
  active: boolean;
  allowedTabs?: ManagementTabId[];
  useCustomTabs?: boolean;
  createdAtMs?: number;
  updatedAtMs?: number;
}

export interface ConfirmRequestOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'warning' | 'danger';
  onConfirm: () => Promise<void> | void;
}

export interface GeminiKeyStatus {
  configured: boolean;
  source: 'custom' | 'env' | 'none';
  maskedKey: string;
  verified?: boolean;
  model?: string;
  latencyMs?: number;
  message?: string;
  error?: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Chủ quán (Admin)',
  [UserRole.MANAGER]: 'Quản lý',
  [UserRole.CASHIER]: 'Thu ngân',
  [UserRole.VIEWER]: 'Kế toán (Chỉ xem)',
};

export const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  debt: 'Công nợ',
};

const VALID_TAB_IDS = new Set<ManagementTabId>(
  MANAGEMENT_TABS.map((t) => t.id)
);

export function sanitizeTabList(tabs?: unknown): ManagementTabId[] {
  if (!Array.isArray(tabs)) return [];
  const filtered = tabs.filter(
    (t): t is ManagementTabId => typeof t === 'string' && VALID_TAB_IDS.has(t as ManagementTabId)
  );
  return Array.from(new Set(filtered));
}

export function getEffectiveRolePermissions(
  account: StaffAccount | null,
  rolePermissions: RolePermissionsMap
): {
  allowedTabs: ManagementTabId[];
  canWrite: boolean;
  canDelete: boolean;
  isCustomAccountTabs: boolean;
} {
  if (!account) {
    return {
      allowedTabs: ['dashboard'],
      canWrite: false,
      canDelete: false,
      isCustomAccountTabs: false,
    };
  }

  const roleConfig =
    rolePermissions?.[account.role] ||
    DEFAULT_ROLE_PERMISSIONS[account.role] ||
    DEFAULT_ROLE_PERMISSIONS[UserRole.VIEWER];

  const customTabs = sanitizeTabList(account.allowedTabs);
  const useCustom = Boolean(account.useCustomTabs && customTabs.length > 0);

  let tabs: ManagementTabId[] = useCustom
    ? customTabs
    : sanitizeTabList(roleConfig.allowedTabs);

  if (tabs.length === 0 && customTabs.length > 0) {
    tabs = customTabs;
  }

  // Primary admin account always retains access to 'accounts' tab so Admin cannot lock themselves out
  if (account.username === 'admin' || account.role === UserRole.ADMIN) {
    if (!tabs.includes('accounts')) {
      tabs = [...tabs, 'accounts'];
    }
  }

  if (tabs.length === 0) {
    tabs = ['dashboard'];
  }

  // Sort tabs in canonical navigation order
  const orderedTabs = MANAGEMENT_TABS.map((t) => t.id).filter((id) =>
    tabs.includes(id)
  );

  return {
    allowedTabs: orderedTabs,
    canWrite:
      account.role === UserRole.ADMIN
        ? true
        : typeof roleConfig.canWrite === 'boolean'
        ? roleConfig.canWrite
        : account.role !== UserRole.VIEWER,
    canDelete:
      account.role === UserRole.ADMIN
        ? true
        : typeof roleConfig.canDelete === 'boolean'
        ? roleConfig.canDelete
        : account.role === UserRole.MANAGER,
    isCustomAccountTabs: useCustom,
  };
}
