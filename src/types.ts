export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  CASHIER = 'cashier',
  VIEWER = 'viewer',
  INVENTORY = 'inventory',
}

export type ManagementTabId =
  | 'home'
  | 'dashboard'
  | 'ocr'
  | 'categories'
  | 'inventory'
  | 'kitchen_inventory'
  | 'owner_use'
  | 'debts'
  | 'deductions'
  | 'returns'
  | 'salary_advances'
  | 'products'
  | 'accounts'
  | 'menu_settings'
  | 'gamification'
  | 'table_orders';

export interface ExternalLinkItem {
  id: string;
  label: string;
  url: string;
  description?: string;
}

export const DEFAULT_EXTERNAL_LINKS: ExternalLinkItem[] = [
  {
    id: 'ext_cashier',
    label: 'Thu ngân',
    url: 'https://fnb.kiotviet.vn/vinhquan/pos/#/cashier',
    description: 'KiotViet POS — Màn hình Thu ngân Vịnh Quán',
  },
  {
    id: 'ext_cashflow',
    label: 'Sổ quỹ',
    url: 'https://fnb.kiotviet.vn/vinhquan/man/#/CashFlow',
    description: 'KiotViet Quản lý — Sổ quỹ thu chi Vịnh Quán',
  },
  {
    id: 'ext_nds',
    label: 'NDS',
    url: 'https://ndsgroup.vn/my/projects/613/task/18877',
    description: 'Hệ thống quản lý dự án & công việc NDS Group',
  },
];

export const DEFAULT_VISIBLE_PRIMARY_TABS: ManagementTabId[] = [
  'home',
  'dashboard',
  'table_orders',
  'ocr',
  'categories',
  'deductions',
  'returns',
  'salary_advances',
  'menu_settings',
  'gamification',
];

export type PeriodPreset = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom';

export interface ManagementTabMeta {
  id: ManagementTabId;
  label: string;
  shortLabel: string;
  description: string;
}

export const MANAGEMENT_TABS: ManagementTabMeta[] = [
  {
    id: 'home',
    label: 'Trang chủ (Sảnh điều hướng)',
    shortLabel: 'Trang chủ',
    description:
      'Sảnh chờ ca làm việc, bảng lối tắt thao tác nhanh (Nhập Bill, Khoản trừ, Hoàn trả, Kiểm kho) và ẩn/hiện số tiền nhạy cảm',
  },
  {
    id: 'dashboard',
    label: 'Tổng quan & Doanh thu',
    shortLabel: 'Tổng quan',
    description:
      'Bảng đối soát doanh thu tiền mặt, chuyển khoản, khoản trừ, công nợ riêng và danh sách hóa đơn',
  },
  {
    id: 'table_orders',
    label: 'Order Món Theo Bàn (Báo Bếp & In Bill)',
    shortLabel: 'Order Bàn',
    description:
      'Ghi order món cho từng bàn, tự động in phiếu nhiệt K80/K57 báo bếp & quầy bar, phát chuông thông báo và chuyển thẳng sang bill thanh toán',
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
    id: 'kitchen_inventory',
    label: 'Hàng Hóa & Tồn Kho (Bếp, Tạp Vụ & NPP)',
    shortLabel: 'Hàng hóa & Tồn kho',
    description:
      'Quản lý hàng hóa, tồn kho thực phẩm (tươi sống, hải sản, rau, gia vị...), đồ tạp vụ, đồng bộ bia & nước ngọt, nhà phân phối và phiếu nhập',
  },
  {
    id: 'owner_use',
    label: 'Chủ / Quản lý Sử dụng (0đ)',
    shortLabel: 'Chủ / QL dùng',
    description:
      'Nhập bia, nước ngọt, món ăn do Chủ quán hoặc Quản lý sử dụng — vẫn tính vào Số lượng bán & trừ Tồn kho nhưng không thành giá tiền (0đ)',
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
      'Quản lý và chỉnh sửa các khoản chi tiêu trong ngày (mua bánh mì, rau, đá, nguyên liệu...) cùng các khoản hoàn bia / món thừa tự động đồng bộ sang Khoản trừ',
  },
  {
    id: 'returns',
    label: 'Hoàn trả (Trả bia / món thừa)',
    shortLabel: 'Hoàn trả',
    description:
      'Chọn hóa đơn theo Ngày tháng - Số bàn để ghi nhận trả bia/món thừa, tự động tính vào Khoản trừ trong ngày (1 dòng tiền duy nhất) và hoàn lại tồn kho',
  },
  {
    id: 'salary_advances',
    label: 'Nhân viên Ứng lương',
    shortLabel: 'Ứng lương NV',
    description:
      'Quản lý danh sách nhân viên (thêm/sửa/xóa), ghi nhận tiền ứng lương, ngày ứng và tự động trừ trực tiếp qua Khoản trừ trong ngày (1 dòng tiền duy nhất)',
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
  {
    id: 'menu_settings',
    label: 'Cài đặt Hiển thị Danh mục',
    shortLabel: 'Cài đặt Menu',
    description:
      'Tích chọn các tính năng được phép hiển thị trực tiếp ra màn hình chính, gộp các tính năng còn lại vào cột Dropdown và quản lý liên kết ngoài',
  },
  {
    id: 'gamification',
    label: 'Khu Vui Chơi & Sơ Đồ Bàn',
    shortLabel: 'Vui chơi & Bàn',
    description:
      'Vòng quay may mắn (Lucky Wheel), Sơ đồ bàn 2D trực quan, Bảng vàng doanh số & món ngôi sao, Mẹo phong thủy & câu chúc ngày mới, Hiệu ứng ăn mừng kỷ lục',
  },
];

export type RoleActionMode = 'read_only' | 'full_crud';
export type AccountActionMode = 'role_default' | 'read_only' | 'full_crud';

export interface RolePermissionConfig {
  role: UserRole;
  allowedTabs: ManagementTabId[];
  canWrite: boolean;
  canDelete: boolean;
  actionMode?: RoleActionMode; // 'read_only': Chỉ xem (Không được Thêm / Sửa / Xóa) | 'full_crud': Có thể Thêm / Sửa / Xóa
  readOnlyTabs?: ManagementTabId[]; // Danh sách các tab cụ thể chỉ cho phép Xem (nếu Role đang ở chế độ Có thể Thêm/Sửa/Xóa)
  restrictProductCategories?: boolean;
  allowedProductCategories?: string[];
}

export type RolePermissionsMap = Record<UserRole, RolePermissionConfig>;

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionsMap = {
  [UserRole.ADMIN]: {
    role: UserRole.ADMIN,
    allowedTabs: [
      'home',
      'dashboard',
      'table_orders',
      'ocr',
      'categories',
      'inventory',
      'kitchen_inventory',
      'owner_use',
      'debts',
      'deductions',
      'returns',
      'salary_advances',
      'products',
      'accounts',
      'menu_settings',
      'gamification',
    ],
    canWrite: true,
    canDelete: true,
    actionMode: 'full_crud',
    readOnlyTabs: [],
    restrictProductCategories: false,
    allowedProductCategories: [],
  },
  [UserRole.MANAGER]: {
    role: UserRole.MANAGER,
    allowedTabs: [
      'home',
      'dashboard',
      'table_orders',
      'ocr',
      'categories',
      'inventory',
      'kitchen_inventory',
      'owner_use',
      'debts',
      'deductions',
      'returns',
      'salary_advances',
      'products',
      'menu_settings',
      'gamification',
    ],
    canWrite: true,
    canDelete: true,
    actionMode: 'full_crud',
    readOnlyTabs: [],
    restrictProductCategories: false,
    allowedProductCategories: [],
  },
  [UserRole.CASHIER]: {
    role: UserRole.CASHIER,
    allowedTabs: [
      'home',
      'dashboard',
      'table_orders',
      'ocr',
      'inventory',
      'owner_use',
      'debts',
      'deductions',
      'returns',
      'salary_advances',
      'menu_settings',
      'gamification',
    ],
    canWrite: true,
    canDelete: true,
    actionMode: 'full_crud',
    readOnlyTabs: [],
    restrictProductCategories: false,
    allowedProductCategories: [],
  },
  [UserRole.VIEWER]: {
    role: UserRole.VIEWER,
    allowedTabs: [
      'home',
      'dashboard',
      'table_orders',
      'categories',
      'inventory',
      'owner_use',
      'debts',
      'deductions',
      'returns',
      'salary_advances',
      'gamification',
    ],
    canWrite: false,
    canDelete: false,
    actionMode: 'read_only',
    readOnlyTabs: [],
    restrictProductCategories: false,
    allowedProductCategories: [],
  },
  [UserRole.INVENTORY]: {
    role: UserRole.INVENTORY,
    allowedTabs: ['home', 'categories', 'inventory', 'kitchen_inventory', 'owner_use', 'gamification', 'table_orders'],
    canWrite: true,
    canDelete: true,
    actionMode: 'full_crud',
    readOnlyTabs: [],
    restrictProductCategories: false,
    allowedProductCategories: [],
  },
};

export type PaymentType = 'cash' | 'transfer' | 'debt' | 'split';
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
  isDiscountEligible?: boolean; // Áp dụng chiết khấu % cho món này (VD: món ăn được CK, bia/nước không CK)
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
    paidCashAmount?: number; // Số tiền thanh toán Tiền mặt (đặc biệt khi paymentType = 'split')
    paidTransferAmount?: number; // Số tiền thanh toán Chuyển khoản (đặc biệt khi paymentType = 'split')
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
  tableName?: string; // Tên bàn / phòng (ví dụ: Bàn 01, VIP 2, Sân Vườn 3...)
  paymentType: PaymentType;
  debtorName: string;
  debtStatus: DebtStatus;
  settleDate?: string; // Ngày tất toán công nợ (YYYY-MM-DD)
  settledMethod?: 'cash' | 'transfer'; // Hình thức thanh toán khi tất toán công nợ (Tiền mặt hoặc Chuyển khoản)
  paidCashAmount?: number; // Số tiền trả tiền mặt khi thanh toán kết hợp
  paidTransferAmount?: number; // Số tiền trả chuyển khoản khi thanh toán kết hợp
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
  isDiscountEligible?: boolean; // Áp dụng chiết khấu % cho món này
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

export const DEFAULT_DEDUCTION_CATEGORIES = [
  'Mua bánh mì / Rau / Gia vị',
  'Nguyên liệu / Thực phẩm',
  'Vật tư / Đá / Gas',
  'Vật tư / Tạp phẩm quán',
  'Chi phí vận hành trong ngày',
  'Hoa hồng / Chiết khấu đặt bàn',
  'Ứng lương nhân viên',
  'Hoàn bia / món thừa',
  'Khác',
] as const;

export interface EmployeeRecord {
  id: string;
  fullName: string;
  roleOrPosition: string; // Mặc định: 'Nhân viên phục vụ'
  phone?: string;
  baseSalary?: number;
  note?: string;
  active: boolean;
  // Phân role & Quyền đăng nhập hệ thống (nếu không phân role thì mặc định là Nhân viên phục vụ và không cần tài khoản đăng nhập)
  hasLoginAccount?: boolean;
  systemRole?: UserRole;
  username?: string;
  password?: string;
  linkedStaffAccountId?: string;
  useCustomTabs?: boolean;
  allowedTabs?: ManagementTabId[];
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SalaryAdvanceRecord {
  id: string;
  ownerId: string;
  employeeId: string;
  employeeName: string;
  employeeRole?: string;
  amount: number;
  advanceDate: string; // YYYY-MM-DD
  note: string;
  linkedDeductionId: string;
  createdAtMs: number;
  updatedAtMs: number;
  createdBy?: string;
}

export interface DebtPaymentRecord {
  id: string;
  billId: string;
  billCode: string;
  debtorName: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer';
  paidDate: string; // YYYY-MM-DD
  note?: string;
  createdAtMs: number;
  createdBy?: string;
}

export interface CalendarEventNote {
  id: string;
  solarDate: string; // YYYY-MM-DD
  lunarLabel: string; // VD: "15/8 ÂL"
  title: string;
  category: 'booking' | 'worship' | 'payment' | 'reminder';
  createdAtMs: number;
  createdBy?: string;
}

export interface TelegramBotConfig {
  enabled: boolean;
  botToken: string;
  botUsername?: string;
  authorizedChatIds: string[]; // Whitelist các Telegram Chat ID được phép ra lệnh
  autoSendDailyReport?: boolean;
}

export interface ChatAssistantMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  createdAtMs: number;
  type?: 'text' | 'stock_check' | 'import_result' | 'import_execute' | 'sales_report' | 'help' | 'unknown' | 'error';
  importSummary?: {
    totalItems: number;
    items: {
      productName: string;
      quantity: number;
      oldStock: number;
      newStock: number;
      unit: string;
    }[];
  };
}

export interface CustomCategoryGroup {
  id: string;
  name: string; // Tên riêng nhóm do người dùng tự đặt (Ví dụ: "A", "B", "Kho Lạnh", "Bia & Đồ uống"...)
  categories: string[]; // Danh sách các nhóm category của sản phẩm hiện có trên website được chọn để xem
  aliases?: string[]; // Các bí danh / từ khóa gọi tắt khác (tùy chọn)
  createdAtMs?: number;
}

export interface KitchenSupplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  contactPerson?: string;
  note?: string;
  createdAtMs: number;
  updatedAtMs?: number;
}

export interface KitchenSupplyItem {
  id: string;
  name: string;
  category: string; // 'Bếp - Thịt cá' | 'Bếp - Rau củ quả' | 'Gia vị & Chế biến' | 'Tạp vụ & Vệ sinh' | 'Nhiên liệu & Gas' | 'Bia & Nước ngọt' | 'Khác'
  unit: string; // kg, con, can, thùng, bình, gói, bao, lốc...
  currentStock: number; // Tồn kho hiện tại
  minStockAlert?: number; // Cảnh báo tồn kho tối thiểu
  defaultUnitPrice?: number; // Đơn giá tham khảo gần nhất
  defaultSupplierId?: string; // Nhà phân phối mặc định
  isBeverageLinked?: boolean; // Liên hệ với danh mục Bia / Nước ngọt
  beverageProductName?: string; // Tên sản phẩm bia/nước ngọt liên kết (nếu có)
  note?: string;
  createdAtMs: number;
  updatedAtMs?: number;
}

export interface KitchenReceiptItem {
  supplyItemId: string;
  supplyItemName: string;
  category: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  note?: string;
}

export interface KitchenReceipt {
  id: string;
  receiptCode: string; // PN-YYYYMMDD-XXX
  receiptDate: string; // YYYY-MM-DD
  supplierId: string;
  supplierName: string;
  items: KitchenReceiptItem[];
  totalAmount: number; // Tổng giá trị phiếu nhập
  paidAmount: number; // Số tiền đã thanh toán
  debtAmount: number; // Số tiền còn nợ nhà phân phối (= totalAmount - paidAmount)
  paymentStatus: 'paid' | 'partial' | 'debt'; // Đã thanh toán | Trả một phần | Chưa trả
  paymentMethod: 'cash' | 'transfer' | 'debt';
  note?: string;
  createdAtMs: number;
  updatedAtMs?: number;
  createdBy?: string;
}

export interface KitchenSupplierPayment {
  id: string;
  supplierId: string;
  supplierName: string;
  receiptId?: string; // Thanh toán theo phiếu cụ thể hoặc thanh toán tổng nợ
  receiptCode?: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer';
  paidDate: string; // YYYY-MM-DD
  note?: string;
  createdAtMs: number;
  createdBy?: string;
}

export interface KitchenStockUsageLog {
  id: string;
  usageDate: string; // YYYY-MM-DD
  supplyItemId: string;
  supplyItemName: string;
  quantity: number; // Số lượng xuất / sử dụng
  unit: string;
  reason?: string; // VD: "Bếp nấu ca trưa", "Tạp vụ dọn khu vực sảnh", "Hao hụt / hỏng"...
  usedBy?: string;
  createdAtMs: number;
}

export interface OrderItem {
  id: string;
  productId?: string;
  productName: string;
  category: string;
  unitPrice: number;
  quantity: number;
  note?: string; // Ghi chú: ít cay, không hành, ướp đá...
}

export interface TableOrderRecord {
  id: string;
  orderCode: string; // VD: ORD-261016-001
  tableName: string; // VD: Bàn 12, VIP 2...
  staffName: string; // Tên nhân viên order
  staffId?: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'pending' | 'cooking' | 'served' | 'billed' | 'cancelled';
  orderTime: string; // HH:mm:ss
  orderDate: string; // YYYY-MM-DD
  note?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface WorkspaceInventoryData {
  trackedCategories: string[]; // Mặc định ['Bia', 'Nước ngọt']
  deductionCategories?: string[]; // Danh sách nhóm khoản trừ tùy chỉnh & mặc định
  debtPayments?: DebtPaymentRecord[]; // Lịch sử trả nợ từng phần (trả góp công nợ)
  calendarEvents?: CalendarEventNote[]; // Ghi chú sự kiện trên Lịch Âm Dương
  employees?: EmployeeRecord[]; // Danh sách nhân viên của quán
  deletedEmployeeIds?: string[]; // Tombstone danh sách ID nhân viên đã xóa để không bị hồi sinh khi đồng bộ
  salaryAdvances?: SalaryAdvanceRecord[]; // Lịch sử ứng lương nhân viên (đồng bộ sang Khoản trừ)
  itemConfigs: Record<string, InventoryItemConfig>; // key = lowercase productName
  dailyEntries: Record<string, Record<string, DailyInventoryEntry>>; // date -> lowercase productName
  importLogs: InventoryImportLog[];
  categoryAliases?: Record<string, string[]>; // Danh mục -> Danh sách tên riêng / bí danh (ví dụ: "Bia" -> ["bia", "beer", "a", "tiger"])
  customCategoryGroups?: CustomCategoryGroup[]; // Danh sách nhóm danh mục do người dùng tự tạo tên & chọn category trên website để xem
  kitchenCategories?: string[]; // Danh sách nhóm hàng hóa kho bếp & tạp vụ ('Hàng tươi sống', 'Hải sản', 'Rau', 'Gia vị'...)
  kitchenSuppliers?: KitchenSupplier[]; // Nhà phân phối thực phẩm, bếp, tạp vụ
  kitchenSupplyItems?: KitchenSupplyItem[]; // Danh mục hàng hóa kho bếp & tạp vụ
  kitchenReceipts?: KitchenReceipt[]; // Phiếu nhập hàng kho bếp & tạp vụ
  kitchenSupplierPayments?: KitchenSupplierPayment[]; // Lịch sử trả nợ cho nhà phân phối
  kitchenStockUsages?: KitchenStockUsageLog[]; // Lịch sử xuất kho / sử dụng nguyên vật liệu
  tableOrders?: TableOrderRecord[]; // Lịch sử & danh sách order món theo bàn
  telegramConfig?: TelegramBotConfig; // Cấu hình kết nối Bot Telegram
  kiotvietSyncLocked?: boolean; // Khóa / Mở khóa chức năng sync KiotViet POS để giảm tải hệ thống
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
  actionMode?: AccountActionMode; // 'role_default' | 'read_only' (Chỉ xem) | 'full_crud' (Có thể Thêm/Sửa/Xóa)
  canWrite?: boolean;
  canDelete?: boolean;
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
  split: 'Tiền mặt + Chuyển khoản',
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
  actionMode: RoleActionMode;
  readOnlyTabs: ManagementTabId[];
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
      actionMode: 'read_only',
      readOnlyTabs: [],
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
    if (!tabs.includes('kitchen_inventory')) {
      tabs = [...tabs, 'kitchen_inventory'];
    }
    if (!tabs.includes('owner_use')) {
      tabs = [...tabs, 'owner_use'];
    }
    if (!tabs.includes('salary_advances')) {
      tabs = [...tabs, 'salary_advances'];
    }
  } else if (
    !useCustom &&
    (tabs.includes('categories') ||
      account.role === UserRole.MANAGER ||
      account.role === UserRole.CASHIER ||
      account.role === UserRole.INVENTORY ||
      account.role === UserRole.VIEWER)
  ) {
    // Ensure existing cached roles automatically receive the new 'inventory', 'kitchen_inventory', 'owner_use', and 'salary_advances' tabs
    if (!tabs.includes('inventory')) {
      tabs = [...tabs, 'inventory'];
    }
    if (!tabs.includes('kitchen_inventory')) {
      tabs = [...tabs, 'kitchen_inventory'];
    }
    if (!tabs.includes('owner_use')) {
      tabs = [...tabs, 'owner_use'];
    }
    if (account.role !== UserRole.INVENTORY && !tabs.includes('salary_advances')) {
      tabs = [...tabs, 'salary_advances'];
    }
  }

  if (!tabs.includes('table_orders')) {
    tabs = [...tabs, 'table_orders'];
  }

  if (!tabs.includes('gamification')) {
    tabs = [...tabs, 'gamification'];
  }

  if (!tabs.includes('home')) {
    tabs = ['home', ...tabs];
  }

  if (!tabs.includes('menu_settings')) {
    tabs = [...tabs, 'menu_settings'];
  }

  if (tabs.length === 0) {
    tabs = ['home', 'dashboard'];
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

  // Resolve Write / Delete / Action Mode (Chỉ xem vs Có thể Thêm / Sửa / Xóa)
  let resolvedWrite = true;
  let resolvedDelete = true;
  let resolvedActionMode: RoleActionMode = 'full_crud';
  let resolvedReadOnlyTabs: ManagementTabId[] = [];

  if (!isAdminAccount) {
    resolvedReadOnlyTabs = sanitizeTabList(roleConfig.readOnlyTabs);

    if (account.actionMode === 'read_only') {
      resolvedWrite = false;
      resolvedDelete = false;
      resolvedActionMode = 'read_only';
    } else if (account.actionMode === 'full_crud') {
      resolvedWrite = true;
      resolvedDelete = true;
      resolvedActionMode = 'full_crud';
    } else {
      // Follow Role's configured permission mode
      if (roleConfig.actionMode === 'read_only') {
        resolvedWrite = false;
        resolvedDelete = false;
        resolvedActionMode = 'read_only';
      } else if (roleConfig.actionMode === 'full_crud') {
        resolvedWrite =
          typeof roleConfig.canWrite === 'boolean' ? roleConfig.canWrite : true;
        resolvedDelete =
          typeof roleConfig.canDelete === 'boolean' ? roleConfig.canDelete : true;
        resolvedActionMode = resolvedWrite ? 'full_crud' : 'read_only';
      } else {
        resolvedWrite =
          typeof roleConfig.canWrite === 'boolean'
            ? roleConfig.canWrite
            : account.role !== UserRole.VIEWER;
        resolvedDelete =
          typeof roleConfig.canDelete === 'boolean'
            ? roleConfig.canDelete
            : resolvedWrite;
        resolvedActionMode = resolvedWrite ? 'full_crud' : 'read_only';
      }
    }
  }

  return {
    allowedTabs: orderedTabs,
    canWrite: resolvedWrite,
    canDelete: resolvedDelete,
    actionMode: resolvedActionMode,
    readOnlyTabs: resolvedReadOnlyTabs,
    isCustomAccountTabs: useCustom,
    restrictProductCategories,
    allowedProductCategories,
    isCustomProductCategories,
  };
}
