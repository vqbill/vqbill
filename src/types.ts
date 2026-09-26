export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  CASHIER = 'cashier',
  VIEWER = 'viewer',
}

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
  category: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface ExtractedBillJSON {
  billInfo: {
    billDate: string;
    paymentType: PaymentType;
    debtorName: string;
    totalAmount: number;
  };
  items: ExtractedBillItem[];
}

export interface BillRecord {
  id: string;
  ownerId: string;
  billCode: string;
  billDate: string; // YYYY-MM-DD
  paymentType: PaymentType;
  debtorName: string;
  debtStatus: DebtStatus;
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
  category: string;
  quantity: number;
  returnedQuantity: number;
  unitPrice: number;
  subtotal: number;
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

export interface StaffAccount {
  id: string;
  ownerId?: string;
  username: string;
  password: string;
  displayName: string;
  info: string;
  role: UserRole;
  active: boolean;
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
