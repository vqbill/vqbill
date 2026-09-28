export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  CASHIER = 'cashier',
  VIEWER = 'viewer',
  INVENTORY = 'inventory',
}

export type ManagementTabId =
  | 'dashboard'
  | 'ocr'
  | 'categories'
  | 'inventory'
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
    id: 'inventory',
    label: 'Kho Đồ Uống & Tồn Kho',
    shortLabel: 'Kho đồ uống',
    description:
      'Quản lý tồn đầu, nhập thêm bia/nước ngọt trong ngày, tự động trừ lượng thực bán (đã trừ hoàn trả), kiểm thực tế cuối ca & cảnh báo sắp hết hàng',
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
      'Xem theo ngày/hôm qua/hôm nay/tuần/tháng các khoản chi trong ngày và tiền hoàn trả khách (tính chung 1 dòng tiền duy nhất)',
  },
  {
    id: 'returns',
    label: 'Hoàn trả (Trả bia / món thừa)',
    shortLabel: 'Hoàn trả',
    description:
      'Chọn hóa đơn theo Ngày tháng - Số bàn, ghi nhận trả bia/món thừa và tự động tính vào Khoản trừ trong ngày (1 dòng tiền duy nhất)',
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
  restrictProductCategories?: boolean;
  allowedProductCategories?: string[];
}

export type RolePermissionsMap = Record<UserRole, RolePermissionConfig>;

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionsMap = {
  [UserRole.ADMIN]: {
    role: UserRole.ADMIN,
    allowedTabs: [
      'dashboard',
      'ocr',
      'categories',
      'inventory',
      'debts',
      'deductions',
      'returns',
      'products',
      'accounts',
    ],
    canWrite: true,
    canDelete: true,
    restrictProductCategories: false,
    allowedProductCategories: [],
  },
  [UserRole.MANAGER]: {
    role: UserRole.MANAGER,
    allowedTabs: [
      'dashboard',
      'ocr',
      'categories',
      'inventory',
      'debts',
      'deductions',
      'returns',
      'products',
    ],
    canWrite: true,
    canDelete: true,
    restrictProductCategories: false,
    allowedProductCategories: [],
  },
  [UserRole.CASHIER]: {
    role: UserRole.CASHIER,
    allowedTabs: ['dashboard', 'ocr', 'inventory', 'debts', 'deductions', 'returns'],
    canWrite: true,
    canDelete: false,
    restrictProductCategories: false,
    allowedProductCategories: [],
  },
  [UserRole.VIEWER]: {
    role: UserRole.VIEWER,
    allowedTabs: ['dashboard', 'categories', 'inventory', 'debts', 'deductions', 'returns'],
    canWrite: false,
    canDelete: false,
    restrictProductCategories: false,
    allowedProductCategories: [],
  },
  [UserRole.INVENTORY]: {
    role: UserRole.INVENTORY,
    allowedTabs: ['categories', 'inventory'],
    canWrite: true,
    canDelete: false,
    restrictProductCategories: false,
    allowedProductCategories: [],
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

export interface InventoryItemConfig {
  productName: string;
  category: string;
  unit: string;
  packSize: number; // Số lon/chai trên 1 thùng/két (mặc định 24 cho Bia/Nước ngọt)
  minStockThreshold: number; // Định mức cảnh báo sắp hết hàng (mặc định 24)
  costPrice?: number; // Giá vốn nhập 1 lon/chai (tùy chọn)
}

export interface DailyInventoryEntry {
  openingStock: number; // Tồn đầu ngày / đầu ca
  importedQty: number; // Nhập thêm trong ngày
  damagedQty: number; // Xuất hủy / vỡ / nội bộ
  actualClosingStock?: number | null; // Kiểm đếm thực tế cuối ca (null nếu chưa kiểm)
  note?: string;
  updatedAtMs: number;
  updatedBy?: string;
}

export interface InventoryImportLog {
  id: string;
  date: string; // YYYY-MM-DD
  createdAtMs: number;
  productName: string;
  category: string;
  type: 'import' | 'damaged' | 'adjust_opening';
  quantity: number; // Tổng số lượng đơn vị lẻ (lon/chai)
  packCount?: number; // Số thùng/két
  packSize?: number; // Quy cách thùng
  unitCost?: number;
  totalCost?: number;
  supplierOrNote: string;
  createdBy: string;
}

export interface WorkspaceInventoryData {
  trackedCategories: string[]; // Mặc định ['Bia', 'Nước ngọt']
  itemConfigs: Record<string, InventoryItemConfig>; // key = lowercase productName
  dailyEntries: Record<string, Record<string, DailyInventoryEntry>>; // date -> lowercase productName
  importLogs: InventoryImportLog[];
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
  restrictProductCategories?: boolean;
  allowedProductCategories?: string[];
  useCustomProductCategories?: boolean;
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
  [UserRole.INVENTORY]: 'Kiểm kho',
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

export function sanitizeCategoryList(cats?: unknown): string[] {
  if (!Array.isArray(cats)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const c of cats) {
    if (typeof c !== 'string') continue;
    const trimmed = c.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(trimmed);
    }
  }
  return result;
}

export function getEffectiveRolePermissions(
  account: StaffAccount | null,
  rolePermissions: RolePermissionsMap
): {
  allowedTabs: ManagementTabId[];
  canWrite: boolean;
  canDelete: boolean;
  isCustomAccountTabs: boolean;
  restrictProductCategories: boolean;
  allowedProductCategories: string[];
  isCustomProductCategories: boolean;
} {
  if (!account) {
    return {
      allowedTabs: ['dashboard'],
      canWrite: false,
      canDelete: false,
      isCustomAccountTabs: false,
      restrictProductCategories: false,
      allowedProductCategories: [],
      isCustomProductCategories: false,
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

  // Primary admin account always retains access to 'accounts' and 'inventory' tabs so Admin cannot lock themselves out
  const isAdminAccount =
    account.username === 'admin' || account.role === UserRole.ADMIN;

  if (isAdminAccount) {
    if (!tabs.includes('accounts')) {
      tabs = [...tabs, 'accounts'];
    }
    if (!tabs.includes('inventory')) {
      tabs = [...tabs, 'inventory'];
    }
  } else if (
    !useCustom &&
    (tabs.includes('categories') ||
      account.role === UserRole.MANAGER ||
      account.role === UserRole.CASHIER ||
      account.role === UserRole.INVENTORY ||
      account.role === UserRole.VIEWER) &&
    !tabs.includes('inventory')
  ) {
    // Ensure existing cached roles automatically receive the new 'inventory' tab
    tabs = [...tabs, 'inventory'];
  }

  if (tabs.length === 0) {
    tabs = ['dashboard'];
  }

  // Sort tabs in canonical navigation order
  const orderedTabs = MANAGEMENT_TABS.map((t) => t.id).filter((id) =>
    tabs.includes(id)
  );

  // Resolve Product Categories restriction for "Số lượng theo Danh mục" tab
  let restrictProductCategories = false;
  let allowedProductCategories: string[] = [];
  let isCustomProductCategories = false;

  if (!isAdminAccount) {
    if (account.useCustomProductCategories) {
      isCustomProductCategories = true;
      restrictProductCategories = Boolean(
        account.restrictProductCategories ?? true
      );
      allowedProductCategories = sanitizeCategoryList(
        account.allowedProductCategories
      );
    } else {
      restrictProductCategories = Boolean(roleConfig.restrictProductCategories);
      allowedProductCategories = sanitizeCategoryList(
        roleConfig.allowedProductCategories
      );
    }
  }

  return {
    allowedTabs: orderedTabs,
    canWrite: isAdminAccount
      ? true
      : typeof roleConfig.canWrite === 'boolean'
      ? roleConfig.canWrite
      : account.role !== UserRole.VIEWER && account.role !== UserRole.INVENTORY,
    canDelete: isAdminAccount
      ? true
      : typeof roleConfig.canDelete === 'boolean'
      ? roleConfig.canDelete
      : account.role === UserRole.MANAGER,
    isCustomAccountTabs: useCustom,
    restrictProductCategories,
    allowedProductCategories,
    isCustomProductCategories,
  };
}
