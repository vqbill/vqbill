import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { ref, set as rtdbSet, remove as rtdbRemove, get as rtdbGet } from 'firebase/database';
import { db, rtdb, auth, handleFirestoreError, OperationType } from '../firebase';
import {
  BillRecord,
  BillItemRecord,
  ProductRecord,
  DeductionRecord,
  ExtractedBillItem,
  PaymentType,
  StaffAccount,
  UserRole,
  RolePermissionsMap,
  DEFAULT_ROLE_PERMISSIONS,
  sanitizeTabList,
} from '../types';
import {
  sanitizeId,
  truncateStr,
  inferCategory,
  inferUnit,
  DEFAULT_CATALOG_PRODUCTS,
} from '../utils/parser';

export const FIXED_ADMIN_USERNAME = 'admin';
export const FIXED_ADMIN_PASSWORD = 'admin123';

export const DEFAULT_STAFF_ACCOUNTS: StaffAccount[] = [
  {
    id: 'staff_admin',
    username: FIXED_ADMIN_USERNAME,
    password: FIXED_ADMIN_PASSWORD,
    displayName: 'Chủ Quán (Admin)',
    info: 'Quản trị viên cao nhất — Toàn quyền hệ thống',
    role: UserRole.ADMIN,
    active: true,
    allowedTabs: DEFAULT_ROLE_PERMISSIONS[UserRole.ADMIN].allowedTabs,
    useCustomTabs: false,
  },
  {
    id: 'staff_manager',
    username: 'quanly',
    password: '123456',
    displayName: 'Trần Minh Quân (Quản lý)',
    info: 'Quản lý ca ngày & tối — Sửa bill, Hoàn trả, Menu',
    role: UserRole.MANAGER,
    active: true,
    allowedTabs: DEFAULT_ROLE_PERMISSIONS[UserRole.MANAGER].allowedTabs,
    useCustomTabs: false,
  },
  {
    id: 'staff_cashier',
    username: 'thungan',
    password: '123456',
    displayName: 'Lê Thu Hà (Thu ngân)',
    info: 'Thu ngân quầy chính — Tạo bill, Ghi nhận hoàn trả',
    role: UserRole.CASHIER,
    active: true,
    allowedTabs: DEFAULT_ROLE_PERMISSIONS[UserRole.CASHIER].allowedTabs,
    useCustomTabs: false,
  },
  {
    id: 'staff_viewer',
    username: 'ketoan',
    password: '123456',
    displayName: 'Phạm Hoàng Yến (Kế toán)',
    info: 'Bộ phận kế toán — Kiểm tra đối soát báo cáo',
    role: UserRole.VIEWER,
    active: true,
    allowedTabs: DEFAULT_ROLE_PERMISSIONS[UserRole.VIEWER].allowedTabs,
    useCustomTabs: false,
  },
];

export function normalizeStaffAccountsWithFixedAdmin(
  accounts?: StaffAccount[] | null
): StaffAccount[] {
  const rawList =
    Array.isArray(accounts) && accounts.length > 0
      ? accounts
      : DEFAULT_STAFF_ACCOUNTS;

  let hasAdmin = false;
  const normalized = rawList.map((acc) => {
    const isPrimaryAdmin =
      acc.username?.trim().toLowerCase() === FIXED_ADMIN_USERNAME ||
      acc.id === 'staff_admin';

    if (isPrimaryAdmin) {
      hasAdmin = true;
      return {
        ...acc,
        id: acc.id || 'staff_admin',
        username: FIXED_ADMIN_USERNAME,
        password: FIXED_ADMIN_PASSWORD,
        role: UserRole.ADMIN,
        active: true,
        allowedTabs:
          acc.allowedTabs && acc.allowedTabs.length > 0
            ? Array.from(
                new Set([
                  ...acc.allowedTabs,
                  ...DEFAULT_ROLE_PERMISSIONS[UserRole.ADMIN].allowedTabs,
                ])
              )
            : DEFAULT_ROLE_PERMISSIONS[UserRole.ADMIN].allowedTabs,
      };
    }
    return acc;
  });

  if (!hasAdmin) {
    return [DEFAULT_STAFF_ACCOUNTS[0], ...normalized];
  }

  return normalized;
}

const LOCAL_CACHE_KEY = 'vqbill_cloud_mirror_v2';

export interface WorkspaceCacheSnapshot {
  initialized: boolean;
  categories?: string[];
  rolePermissions?: RolePermissionsMap;
  products: ProductRecord[];
  bills: BillRecord[];
  billItems: BillItemRecord[];
  deductions: DeductionRecord[];
  staffAccounts: StaffAccount[];
}

export function loadLocalMirror(ownerId: string): WorkspaceCacheSnapshot | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_CACHE_KEY}_${sanitizeId(ownerId)}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveLocalMirror(ownerId: string, snapshot: WorkspaceCacheSnapshot) {
  try {
    localStorage.setItem(
      `${LOCAL_CACHE_KEY}_${sanitizeId(ownerId)}`,
      JSON.stringify(snapshot)
    );
  } catch {
    // Ignore storage quota errors
  }
}

async function syncToRtdbSafe(path: string, data: any) {
  try {
    await rtdbSet(ref(rtdb, path), data);
  } catch {
    // Ignore RTDB permission error if locked; Firestore & local mirror remain active
  }
}

async function removeFromRtdbSafe(path: string) {
  try {
    await rtdbRemove(ref(rtdb, path));
  } catch {
    // Ignore
  }
}

export async function fetchRtdbWorkspaceOnce(
  ownerId: string
): Promise<Partial<WorkspaceCacheSnapshot> | null> {
  try {
    const snap = await rtdbGet(ref(rtdb, `workspaces/${sanitizeId(ownerId)}`));
    if (!snap.exists()) return null;
    const val = snap.val() || {};
    return {
      initialized: Boolean(val.meta?.initialized),
      categories: Array.isArray(val.categories) ? val.categories : undefined,
      rolePermissions: val.role_permissions || undefined,
      products: val.products ? Object.values(val.products) : [],
      bills: val.bills ? Object.values(val.bills) : [],
      billItems: val.bill_items ? Object.values(val.bill_items) : [],
      deductions: val.deductions ? Object.values(val.deductions) : [],
      staffAccounts: val.staff_accounts ? Object.values(val.staff_accounts) : undefined,
    };
  } catch {
    return null;
  }
}

export async function saveCategoriesToCloud(
  ownerId: string,
  categories: string[]
): Promise<void> {
  const cleanOwner = sanitizeId(ownerId);
  await syncToRtdbSafe(`workspaces/${cleanOwner}/categories`, categories);
}

export async function saveRolePermissionsToCloud(
  ownerId: string,
  rolePermissions: RolePermissionsMap
): Promise<void> {
  const cleanOwner = sanitizeId(ownerId);
  await syncToRtdbSafe(`workspaces/${cleanOwner}/role_permissions`, rolePermissions);
}

export function isFirestoreCloudActive(): boolean {
  return Boolean(auth.currentUser?.uid && auth.currentUser?.emailVerified);
}

export async function markWorkspaceInitializedInCloud(ownerId: string) {
  const cleanOwner = sanitizeId(ownerId);
  await syncToRtdbSafe(`workspaces/${cleanOwner}/meta`, {
    initialized: true,
    updatedAt: Date.now(),
  });
}

// STAFF ACCOUNTS FIREBASE CRUD
export async function saveStaffAccountToFirebase(
  ownerId: string,
  account: StaffAccount,
  isNew: boolean
): Promise<void> {
  const cleanOwner = sanitizeId(ownerId);
  const accId = sanitizeId(account.id);
  const isPrimaryAdmin =
    account.username.trim().toLowerCase() === FIXED_ADMIN_USERNAME ||
    accId === 'staff_admin';
  const sanitizedTabs = sanitizeTabList(account.allowedTabs);
  const cleanAcc: StaffAccount = {
    id: accId,
    ownerId: cleanOwner,
    username: isPrimaryAdmin
      ? FIXED_ADMIN_USERNAME
      : truncateStr(account.username.toLowerCase(), 64, 'user'),
    password: isPrimaryAdmin
      ? FIXED_ADMIN_PASSWORD
      : truncateStr(account.password, 100, '123456'),
    displayName: truncateStr(account.displayName, 100, 'Nhân viên'),
    info: truncateStr(account.info || '', 500, ''),
    role: isPrimaryAdmin ? UserRole.ADMIN : account.role,
    active: isPrimaryAdmin ? true : Boolean(account.active),
    allowedTabs: isPrimaryAdmin
      ? DEFAULT_ROLE_PERMISSIONS[UserRole.ADMIN].allowedTabs
      : sanitizedTabs.length > 0
      ? sanitizedTabs
      : DEFAULT_ROLE_PERMISSIONS[account.role]?.allowedTabs || ['dashboard'],
    useCustomTabs: Boolean(account.useCustomTabs),
    createdAtMs: account.createdAtMs || Date.now(),
    updatedAtMs: Date.now(),
  };

  await syncToRtdbSafe(`workspaces/${cleanOwner}/staff_accounts/${accId}`, cleanAcc);

  if (!isFirestoreCloudActive()) return;

  try {
    if (isNew) {
      await setDoc(doc(db, 'staff_accounts', accId), {
        ownerId: cleanOwner,
        username: cleanAcc.username,
        password: cleanAcc.password,
        displayName: cleanAcc.displayName,
        info: cleanAcc.info,
        role: cleanAcc.role,
        active: cleanAcc.active,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'staff_accounts', accId), {
        username: cleanAcc.username,
        password: cleanAcc.password,
        displayName: cleanAcc.displayName,
        info: cleanAcc.info,
        role: cleanAcc.role,
        active: cleanAcc.active,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    // Fallback to setDoc if document did not exist in Firestore yet
    try {
      await setDoc(doc(db, 'staff_accounts', accId), {
        ownerId: cleanOwner,
        username: cleanAcc.username,
        password: cleanAcc.password,
        displayName: cleanAcc.displayName,
        info: cleanAcc.info,
        role: cleanAcc.role,
        active: cleanAcc.active,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (innerErr) {
      handleFirestoreError(innerErr, OperationType.WRITE, `staff_accounts/${accId}`);
    }
  }
}

export async function deleteStaffAccountsFromFirebase(
  ownerId: string,
  accountIds: string[]
): Promise<void> {
  const cleanOwner = sanitizeId(ownerId);
  for (const id of accountIds) {
    const cleanId = sanitizeId(id);
    await removeFromRtdbSafe(`workspaces/${cleanOwner}/staff_accounts/${cleanId}`);
  }

  if (!isFirestoreCloudActive()) return;

  try {
    for (const id of accountIds) {
      const cleanId = sanitizeId(id);
      await deleteDoc(doc(db, 'staff_accounts', cleanId));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'staff_accounts');
  }
}

// PRODUCTS FIREBASE CRUD
export async function createOrUpdateProductInFirestore(
  ownerId: string,
  product: ProductRecord,
  isExisting = false
): Promise<void> {
  const cleanOwner = sanitizeId(ownerId);
  const pid = sanitizeId(product.id);

  await syncToRtdbSafe(`workspaces/${cleanOwner}/products/${pid}`, {
    ...product,
    id: pid,
    ownerId: cleanOwner,
  });
  await markWorkspaceInitializedInCloud(cleanOwner);

  if (!isFirestoreCloudActive()) return;

  try {
    if (isExisting) {
      await updateDoc(doc(db, 'products', pid), {
        productName: truncateStr(product.productName, 150, 'Sản phẩm'),
        category: truncateStr(product.category, 80, 'Khác'),
        unitPrice: Math.max(0, Math.round(product.unitPrice || 0)),
        unit: truncateStr(product.unit, 40, 'Phần'),
        totalSold: Math.max(0, Math.round(product.totalSold || 0)),
        totalReturned: Math.max(0, Math.round(product.totalReturned || 0)),
        totalRevenue: Math.round(product.totalRevenue || 0),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'products', pid), {
        ownerId: cleanOwner,
        productName: truncateStr(product.productName, 150, 'Sản phẩm'),
        category: truncateStr(product.category, 80, 'Khác'),
        unitPrice: Math.max(0, Math.round(product.unitPrice || 0)),
        unit: truncateStr(product.unit, 40, 'Phần'),
        totalSold: Math.max(0, Math.round(product.totalSold || 0)),
        totalReturned: Math.max(0, Math.round(product.totalReturned || 0)),
        totalRevenue: Math.round(product.totalRevenue || 0),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    try {
      await setDoc(doc(db, 'products', pid), {
        ownerId: cleanOwner,
        productName: truncateStr(product.productName, 150, 'Sản phẩm'),
        category: truncateStr(product.category, 80, 'Khác'),
        unitPrice: Math.max(0, Math.round(product.unitPrice || 0)),
        unit: truncateStr(product.unit, 40, 'Phần'),
        totalSold: Math.max(0, Math.round(product.totalSold || 0)),
        totalReturned: Math.max(0, Math.round(product.totalReturned || 0)),
        totalRevenue: Math.round(product.totalRevenue || 0),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err2) {
      handleFirestoreError(err2, OperationType.WRITE, `products/${pid}`);
    }
  }
}

export async function deleteProductsBatchFromFirestore(
  ownerId: string,
  productIds: string[]
): Promise<void> {
  const cleanOwner = sanitizeId(ownerId);
  await markWorkspaceInitializedInCloud(cleanOwner);

  for (const rawId of productIds) {
    const pid = sanitizeId(rawId);
    await removeFromRtdbSafe(`workspaces/${cleanOwner}/products/${pid}`);
  }

  if (!isFirestoreCloudActive()) return;

  try {
    for (const rawId of productIds) {
      const pid = sanitizeId(rawId);
      await deleteDoc(doc(db, 'products', pid));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'products');
  }
}

export async function renameOrReassignCategoryInCloud(params: {
  ownerId: string;
  categories: string[];
  affectedProducts: ProductRecord[];
  affectedBillItems: BillItemRecord[];
  affectedDeductions: DeductionRecord[];
}): Promise<void> {
  const {
    ownerId,
    categories,
    affectedProducts,
    affectedBillItems,
    affectedDeductions,
  } = params;
  const cleanOwner = sanitizeId(ownerId);
  await saveCategoriesToCloud(cleanOwner, categories);

  for (const p of affectedProducts) {
    await syncToRtdbSafe(`workspaces/${cleanOwner}/products/${sanitizeId(p.id)}`, p);
  }
  for (const bi of affectedBillItems) {
    await syncToRtdbSafe(`workspaces/${cleanOwner}/bill_items/${sanitizeId(bi.id)}`, bi);
  }
  for (const d of affectedDeductions) {
    await syncToRtdbSafe(`workspaces/${cleanOwner}/deductions/${sanitizeId(d.id)}`, d);
  }

  if (!isFirestoreCloudActive()) return;

  try {
    for (const p of affectedProducts) {
      await updateDoc(doc(db, 'products', sanitizeId(p.id)), {
        productName: truncateStr(p.productName, 150, 'Sản phẩm'),
        category: truncateStr(p.category, 80, 'Khác'),
        unitPrice: Math.max(0, Math.round(p.unitPrice || 0)),
        unit: truncateStr(p.unit, 40, 'Phần'),
        updatedAt: serverTimestamp(),
      });
    }
    for (const bi of affectedBillItems) {
      await updateDoc(doc(db, 'bill_items', sanitizeId(bi.id)), {
        billDate: bi.billDate,
        productName: truncateStr(bi.productName, 150, 'Món ăn'),
        category: truncateStr(bi.category, 80, 'Khác'),
        quantity: Math.max(1, Math.round(bi.quantity)),
        returnedQuantity: Math.max(0, Math.round(bi.returnedQuantity)),
        unitPrice: Math.max(0, Math.round(bi.unitPrice)),
        subtotal: Math.max(0, Math.round(bi.subtotal)),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'categories_reassign');
  }
}

// BILLS FIREBASE CRUD
export async function saveNewBillToCloud(params: {
  ownerId: string;
  billDate: string;
  paymentType: PaymentType;
  debtorName: string;
  note: string;
  items: ExtractedBillItem[];
  existingProducts: ProductRecord[];
  autoAddProducts: boolean;
}): Promise<{
  bill: BillRecord;
  billItems: BillItemRecord[];
  updatedProducts: ProductRecord[];
}> {
  const {
    ownerId,
    billDate,
    paymentType,
    debtorName,
    note,
    items,
    existingProducts,
    autoAddProducts,
  } = params;

  const cleanOwnerId = sanitizeId(ownerId);
  const now = Date.now();
  const billId = sanitizeId(`bill_${now}_${Math.random().toString(36).slice(2, 7)}`);
  const shortCode = `HD-${billDate.replace(/-/g, '').slice(2)}-${String(now).slice(-4)}`;

  const validItems = items.map((it) => {
    const qty = Math.max(1, Math.round(it.quantity || 1));
    const uPrice = Math.max(0, Math.round(it.unitPrice || 0));
    const sub = qty * uPrice;
    const pName = truncateStr(it.productName, 150, 'Món ăn');
    const cat = truncateStr(it.category || inferCategory(pName), 80, 'Khác');
    return {
      productName: pName,
      category: cat,
      quantity: qty,
      unitPrice: uPrice,
      subtotal: sub,
    };
  });

  const totalAmount = validItems.reduce((sum, it) => sum + it.subtotal, 0);
  const summaryStr = truncateStr(
    validItems.map((it) => `${it.productName} (x${it.quantity})`).join(', '),
    1000,
    ''
  );

  const cleanDebtor =
    paymentType === 'debt' ? truncateStr(debtorName, 120, 'Khách nợ') : '';
  const debtStatus = paymentType === 'debt' ? 'unpaid' : 'none';

  const billRecord: BillRecord = {
    id: billId,
    ownerId: cleanOwnerId,
    billCode: truncateStr(shortCode, 64, 'HD-001'),
    billDate: /^\d{4}-\d{2}-\d{2}$/.test(billDate)
      ? billDate
      : new Date().toISOString().slice(0, 10),
    paymentType,
    debtorName: cleanDebtor,
    debtStatus,
    totalAmount,
    deductedAmount: 0,
    itemsSummary: summaryStr,
    note: truncateStr(note, 500, ''),
    status: 'active',
    createdAtMs: now,
    updatedAtMs: now,
  };

  const billItemRecords: BillItemRecord[] = validItems.map((it, idx) => ({
    id: sanitizeId(`item_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`),
    ownerId: cleanOwnerId,
    billId,
    billDate: billRecord.billDate,
    productName: it.productName,
    category: it.category,
    quantity: it.quantity,
    returnedQuantity: 0,
    unitPrice: it.unitPrice,
    subtotal: it.subtotal,
    createdAtMs: now,
    updatedAtMs: now,
  }));

  const productsMap = new Map<string, ProductRecord>();
  for (const p of existingProducts) {
    productsMap.set(p.productName.toLowerCase().trim(), { ...p });
  }

  const touchedProducts: ProductRecord[] = [];

  for (const it of validItems) {
    const key = it.productName.toLowerCase().trim();
    const existing = productsMap.get(key);
    if (existing) {
      existing.totalSold += it.quantity;
      existing.totalRevenue += it.subtotal;
      // Giữ nguyên giá mặc định (existing.unitPrice) của sản phẩm trong Menu khi chỉnh giá trong Bill
      if (existing.unitPrice <= 0 && it.unitPrice > 0) {
        existing.unitPrice = it.unitPrice;
      }
      existing.updatedAtMs = now;
      productsMap.set(key, existing);
      touchedProducts.push(existing);
    } else if (autoAddProducts) {
      const newProd: ProductRecord = {
        id: sanitizeId(`prod_${now}_${Math.random().toString(36).slice(2, 7)}`),
        ownerId: cleanOwnerId,
        productName: it.productName,
        category: it.category,
        unitPrice: it.unitPrice,
        unit: inferUnit(it.productName, it.category),
        totalSold: it.quantity,
        totalReturned: 0,
        totalRevenue: it.subtotal,
        createdAtMs: now,
        updatedAtMs: now,
      };
      productsMap.set(key, newProd);
      touchedProducts.push(newProd);
    }
  }

  await markWorkspaceInitializedInCloud(cleanOwnerId);
  await syncToRtdbSafe(`workspaces/${cleanOwnerId}/bills/${billId}`, billRecord);
  for (const bi of billItemRecords) {
    await syncToRtdbSafe(`workspaces/${cleanOwnerId}/bill_items/${bi.id}`, bi);
  }
  for (const tp of touchedProducts) {
    await syncToRtdbSafe(`workspaces/${cleanOwnerId}/products/${tp.id}`, tp);
  }

  if (isFirestoreCloudActive()) {
    try {
      await setDoc(doc(db, 'bills', billId), {
        ownerId: billRecord.ownerId,
        billCode: billRecord.billCode,
        billDate: billRecord.billDate,
        paymentType: billRecord.paymentType,
        debtorName: billRecord.debtorName,
        debtStatus: billRecord.debtStatus,
        totalAmount: billRecord.totalAmount,
        deductedAmount: billRecord.deductedAmount,
        itemsSummary: billRecord.itemsSummary,
        note: billRecord.note,
        status: billRecord.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const batch = writeBatch(db);
      for (const bi of billItemRecords) {
        batch.set(doc(db, 'bill_items', bi.id), {
          ownerId: bi.ownerId,
          billId: bi.billId,
          billDate: bi.billDate,
          productName: bi.productName,
          category: bi.category,
          quantity: bi.quantity,
          returnedQuantity: bi.returnedQuantity,
          unitPrice: bi.unitPrice,
          subtotal: bi.subtotal,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();

      for (const tp of touchedProducts) {
        const wasExisting = existingProducts.some((ep) => ep.id === tp.id);
        await createOrUpdateProductInFirestore(cleanOwnerId, tp, wasExisting);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bills/${billId}`);
    }
  }

  return {
    bill: billRecord,
    billItems: billItemRecords,
    updatedProducts: Array.from(productsMap.values()),
  };
}

export async function updateBillAndItemsInCloud(params: {
  ownerId: string;
  bill: BillRecord;
  oldItems: BillItemRecord[];
  newItems: BillItemRecord[];
}): Promise<void> {
  const { ownerId, bill, oldItems, newItems } = params;
  const cleanOwnerId = sanitizeId(ownerId);

  await markWorkspaceInitializedInCloud(cleanOwnerId);
  await syncToRtdbSafe(`workspaces/${cleanOwnerId}/bills/${bill.id}`, bill);
  for (const oi of oldItems) {
    if (!newItems.some((ni) => ni.id === oi.id)) {
      await removeFromRtdbSafe(`workspaces/${cleanOwnerId}/bill_items/${oi.id}`);
    }
  }
  for (const ni of newItems) {
    await syncToRtdbSafe(`workspaces/${cleanOwnerId}/bill_items/${ni.id}`, ni);
  }

  if (!isFirestoreCloudActive()) return;

  try {
    await updateDoc(doc(db, 'bills', bill.id), {
      billCode: truncateStr(bill.billCode, 64, 'HD-001'),
      billDate: bill.billDate,
      paymentType: bill.paymentType,
      debtorName: truncateStr(bill.debtorName, 120, ''),
      debtStatus: bill.debtStatus,
      totalAmount: Math.max(0, Math.round(bill.totalAmount)),
      deductedAmount: Math.max(0, Math.round(bill.deductedAmount)),
      itemsSummary: truncateStr(bill.itemsSummary, 1000, ''),
      note: truncateStr(bill.note, 500, ''),
      status: bill.status,
      updatedAt: serverTimestamp(),
    });

    for (const oi of oldItems) {
      if (!newItems.some((ni) => ni.id === oi.id)) {
        await deleteDoc(doc(db, 'bill_items', oi.id));
      }
    }

    for (const ni of newItems) {
      const existed = oldItems.some((oi) => oi.id === ni.id);
      if (existed) {
        await updateDoc(doc(db, 'bill_items', ni.id), {
          billDate: ni.billDate,
          productName: truncateStr(ni.productName, 150, 'Món ăn'),
          category: truncateStr(ni.category, 80, 'Khác'),
          quantity: Math.max(1, Math.round(ni.quantity)),
          returnedQuantity: Math.max(0, Math.round(ni.returnedQuantity)),
          unitPrice: Math.max(0, Math.round(ni.unitPrice)),
          subtotal: Math.max(0, Math.round(ni.subtotal)),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'bill_items', ni.id), {
          ownerId: cleanOwnerId,
          billId: bill.id,
          billDate: ni.billDate,
          productName: truncateStr(ni.productName, 150, 'Món ăn'),
          category: truncateStr(ni.category, 80, 'Khác'),
          quantity: Math.max(1, Math.round(ni.quantity)),
          returnedQuantity: Math.max(0, Math.round(ni.returnedQuantity)),
          unitPrice: Math.max(0, Math.round(ni.unitPrice)),
          subtotal: Math.max(0, Math.round(ni.subtotal)),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bills/${bill.id}`);
  }
}

export async function deleteBillsBatchFromCloud(
  ownerId: string,
  billIds: string[],
  billItemsToDelete: BillItemRecord[],
  deductionsToDelete: DeductionRecord[]
): Promise<void> {
  const cleanOwnerId = sanitizeId(ownerId);
  await markWorkspaceInitializedInCloud(cleanOwnerId);

  for (const bi of billItemsToDelete) {
    await removeFromRtdbSafe(`workspaces/${cleanOwnerId}/bill_items/${bi.id}`);
  }
  for (const d of deductionsToDelete) {
    await removeFromRtdbSafe(`workspaces/${cleanOwnerId}/deductions/${d.id}`);
  }
  for (const bId of billIds) {
    await removeFromRtdbSafe(`workspaces/${cleanOwnerId}/bills/${bId}`);
  }

  if (!isFirestoreCloudActive()) return;

  try {
    for (const bi of billItemsToDelete) {
      await deleteDoc(doc(db, 'bill_items', bi.id));
    }
    for (const d of deductionsToDelete) {
      await deleteDoc(doc(db, 'deductions', d.id));
    }
    for (const bId of billIds) {
      await deleteDoc(doc(db, 'bills', bId));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'bills');
  }
}

export async function deleteDeductionsBatchFromCloud(
  ownerId: string,
  deductionIds: string[]
): Promise<void> {
  const cleanOwnerId = sanitizeId(ownerId);
  await markWorkspaceInitializedInCloud(cleanOwnerId);

  for (const dId of deductionIds) {
    await removeFromRtdbSafe(`workspaces/${cleanOwnerId}/deductions/${dId}`);
  }

  if (!isFirestoreCloudActive()) return;

  try {
    for (const dId of deductionIds) {
      await deleteDoc(doc(db, 'deductions', dId));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'deductions');
  }
}

export async function recordReturnDeductionToCloud(params: {
  ownerId: string;
  bill: BillRecord;
  billItem: BillItemRecord;
  returnQty: number;
  deductionDate: string;
  note: string;
  existingProduct?: ProductRecord;
}): Promise<{
  deduction: DeductionRecord;
  updatedBill: BillRecord;
  updatedBillItem: BillItemRecord;
  updatedProduct?: ProductRecord;
}> {
  const {
    ownerId,
    bill,
    billItem,
    returnQty,
    deductionDate,
    note,
    existingProduct,
  } = params;

  const cleanOwnerId = sanitizeId(ownerId);
  const now = Date.now();
  const safeQty = Math.min(
    Math.max(1, Math.round(returnQty)),
    Math.max(1, billItem.quantity - billItem.returnedQuantity)
  );
  const refundAmount = safeQty * billItem.unitPrice;
  const deductionId = sanitizeId(`ded_${now}_${Math.random().toString(36).slice(2, 6)}`);

  const deduction: DeductionRecord = {
    id: deductionId,
    ownerId: cleanOwnerId,
    billId: bill.id,
    billCode: bill.billCode,
    billDate: bill.billDate,
    deductionDate: /^\d{4}-\d{2}-\d{2}$/.test(deductionDate)
      ? deductionDate
      : new Date().toISOString().slice(0, 10),
    productName: truncateStr(billItem.productName, 150, 'Món hoàn trả'),
    category: truncateStr(billItem.category, 80, 'Khác'),
    quantity: safeQty,
    unitPrice: billItem.unitPrice,
    amount: refundAmount,
    note: truncateStr(
      note || `Hoàn trả ${safeQty} ${billItem.productName} từ bill ${bill.billCode}`,
      500,
      ''
    ),
    createdAtMs: now,
    updatedAtMs: now,
  };

  const updatedBillItem: BillItemRecord = {
    ...billItem,
    returnedQuantity: billItem.returnedQuantity + safeQty,
    updatedAtMs: now,
  };

  const updatedBill: BillRecord = {
    ...bill,
    deductedAmount: (bill.deductedAmount || 0) + refundAmount,
    updatedAtMs: now,
  };

  let updatedProduct: ProductRecord | undefined;
  if (existingProduct) {
    updatedProduct = {
      ...existingProduct,
      totalReturned: (existingProduct.totalReturned || 0) + safeQty,
      totalRevenue: (existingProduct.totalRevenue || 0) - refundAmount,
      updatedAtMs: now,
    };
  }

  await markWorkspaceInitializedInCloud(cleanOwnerId);
  await syncToRtdbSafe(`workspaces/${cleanOwnerId}/deductions/${deduction.id}`, deduction);
  await syncToRtdbSafe(
    `workspaces/${cleanOwnerId}/bill_items/${updatedBillItem.id}`,
    updatedBillItem
  );
  await syncToRtdbSafe(`workspaces/${cleanOwnerId}/bills/${updatedBill.id}`, updatedBill);
  if (updatedProduct) {
    await syncToRtdbSafe(
      `workspaces/${cleanOwnerId}/products/${updatedProduct.id}`,
      updatedProduct
    );
  }

  if (isFirestoreCloudActive()) {
    try {
      await setDoc(doc(db, 'deductions', deduction.id), {
        ownerId: deduction.ownerId,
        billId: deduction.billId,
        billCode: deduction.billCode,
        billDate: deduction.billDate,
        deductionDate: deduction.deductionDate,
        productName: deduction.productName,
        category: deduction.category,
        quantity: deduction.quantity,
        unitPrice: deduction.unitPrice,
        amount: deduction.amount,
        note: deduction.note,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'bill_items', updatedBillItem.id), {
        returnedQuantity: updatedBillItem.returnedQuantity,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'bills', updatedBill.id), {
        deductedAmount: updatedBill.deductedAmount,
        itemsSummary: updatedBill.itemsSummary,
        note: updatedBill.note,
        updatedAt: serverTimestamp(),
      });

      if (updatedProduct) {
        await updateDoc(doc(db, 'products', updatedProduct.id), {
          totalSold: updatedProduct.totalSold,
          totalReturned: updatedProduct.totalReturned,
          totalRevenue: updatedProduct.totalRevenue,
          unitPrice: updatedProduct.unitPrice,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `deductions/${deduction.id}`);
    }
  }

  return {
    deduction,
    updatedBill,
    updatedBillItem,
    updatedProduct,
  };
}

export function buildInitialSeedDataset(ownerId: string): {
  products: ProductRecord[];
  bills: BillRecord[];
  billItems: BillItemRecord[];
  deductions: DeductionRecord[];
} {
  const cleanOwner = sanitizeId(ownerId);
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();

  const yesterdayDate = new Date(now - 86400000).toISOString().slice(0, 10);
  const twoDaysAgoDate = new Date(now - 2 * 86400000).toISOString().slice(0, 10);
  const threeDaysAgoDate = new Date(now - 3 * 86400000).toISOString().slice(0, 10);
  const specialAugDate = '2026-08-20';

  const productsMap = new Map<string, ProductRecord>();
  DEFAULT_CATALOG_PRODUCTS.forEach((p, idx) => {
    productsMap.set(p.productName.toLowerCase(), {
      id: `prod_seed_${idx + 1}`,
      ownerId: cleanOwner,
      productName: p.productName,
      category: p.category,
      unitPrice: p.unitPrice,
      unit: p.unit,
      totalSold: 0,
      totalReturned: 0,
      totalRevenue: 0,
      createdAtMs: now - 7 * 86400000,
      updatedAtMs: now,
    });
  });

  const bills: BillRecord[] = [];
  const billItems: BillItemRecord[] = [];
  const deductions: DeductionRecord[] = [];

  const rawSeedBills: {
    id: string;
    code: string;
    date: string;
    paymentType: PaymentType;
    debtorName: string;
    debtStatus: 'none' | 'unpaid' | 'paid';
    note: string;
    items: { name: string; qty: number; price: number }[];
  }[] = [
    {
      id: 'bill_seed_aug20',
      code: 'HD-260820-0815',
      date: specialAugDate,
      paymentType: 'cash',
      debtorName: '',
      debtStatus: 'none',
      note: 'Bàn 08 - Khách đặt tiệc sinh nhật (Bill ngày 20/08/2026 có 15 lon bia)',
      items: [
        { name: 'Bia Tiger Lùn', qty: 15, price: 22000 },
        { name: 'Khăn lạnh', qty: 6, price: 3000 },
        { name: 'Đậu lạc rang muối', qty: 2, price: 30000 },
        { name: 'Ếch sapo', qty: 2, price: 135000 },
        { name: 'Cánh gà chiên mắm', qty: 2, price: 145000 },
      ],
    },
    {
      id: 'bill_seed_today_1',
      code: 'HD-HOMNAY-01',
      date: today,
      paymentType: 'cash',
      debtorName: '',
      debtStatus: 'none',
      note: 'Bàn VIP 1 & VIP 2 - Liên hoan công ty buổi trưa',
      items: [
        { name: 'Bia Tiger Lùn', qty: 48, price: 22000 },
        { name: 'Bia Sài Gòn Special', qty: 36, price: 18000 },
        { name: 'Nước ngọt Redbull', qty: 12, price: 18000 },
        { name: 'Khăn lạnh', qty: 30, price: 3000 },
        { name: 'Đậu hũ chiên giòn', qty: 6, price: 45000 },
        { name: 'Khoai tây chiên bơ', qty: 5, price: 55000 },
        { name: 'Ếch sapo', qty: 6, price: 135000 },
        { name: 'Ếch chiên bơ', qty: 5, price: 125000 },
        { name: 'Gà chiên mắm', qty: 5, price: 165000 },
        { name: 'Lẩu thái hải sản', qty: 4, price: 280000 },
      ],
    },
    {
      id: 'bill_seed_today_2',
      code: 'HD-HOMNAY-02',
      date: today,
      paymentType: 'transfer',
      debtorName: '',
      debtStatus: 'none',
      note: 'Bàn Sân Vườn 04 - Chuyển khoản VietQR',
      items: [
        { name: 'Bia Heineken Silver', qty: 60, price: 25000 },
        { name: 'Coca Cola', qty: 15, price: 15000 },
        { name: 'Nước suối Aquafina', qty: 10, price: 10000 },
        { name: 'Gỏi ngó sen tôm thịt', qty: 4, price: 120000 },
        { name: 'Ếch rơm', qty: 5, price: 140000 },
        { name: 'Lẩu gà lá é', qty: 4, price: 260000 },
        { name: 'Mực nướng sa tế', qty: 4, price: 185000 },
        { name: 'Tôm sú hấp bia', qty: 3, price: 250000 },
      ],
    },
    {
      id: 'bill_seed_today_3',
      code: 'HD-HOMNAY-03',
      date: today,
      paymentType: 'debt',
      debtorName: 'Anh Tuấn (Đội Công Trình Số 5)',
      debtStatus: 'unpaid',
      note: 'Ghi nợ khách quen - Hẹn cuối tuần thanh toán',
      items: [
        { name: 'Bia Budweiser', qty: 30, price: 26000 },
        { name: 'Nước ngọt Pepsi', qty: 10, price: 15000 },
        { name: 'Ếch xào sa tế', qty: 3, price: 130000 },
        { name: 'Gà hấp lá chanh', qty: 2, price: 290000 },
        { name: 'Bò lúc lắc khoai tây', qty: 3, price: 195000 },
      ],
    },
    {
      id: 'bill_seed_today_4',
      code: 'HD-HOMNAY-04',
      date: today,
      paymentType: 'cash',
      debtorName: '',
      debtStatus: 'none',
      note: 'Bàn 12 - Khách đoàn du lịch thanh toán tiền mặt',
      items: [
        { name: 'Bia Tiger Lùn', qty: 30, price: 22000 },
        { name: 'Bia Larue', qty: 24, price: 16000 },
        { name: 'Ốc hương xào bơ tỏi', qty: 4, price: 190000 },
        { name: 'Mì xào hải sản', qty: 4, price: 110000 },
        { name: 'Cánh gà chiên mắm', qty: 3, price: 145000 },
      ],
    },
    {
      id: 'bill_seed_yesterday_1',
      code: 'HD-HOMQUA-01',
      date: yesterdayDate,
      paymentType: 'cash',
      debtorName: '',
      debtStatus: 'none',
      note: 'Bàn 02 & 03 - Ca tối hôm qua',
      items: [
        { name: 'Bia Tiger Lùn', qty: 40, price: 22000 },
        { name: 'Bia Sài Gòn Special', qty: 30, price: 18000 },
        { name: 'Ếch sapo', qty: 4, price: 135000 },
        { name: 'Gà chiên mắm', qty: 4, price: 165000 },
        { name: 'Lẩu thái hải sản', qty: 3, price: 280000 },
      ],
    },
    {
      id: 'bill_seed_yesterday_2',
      code: 'HD-HOMQUA-02',
      date: yesterdayDate,
      paymentType: 'debt',
      debtorName: 'Chị Lan (Văn phòng BĐS Hùng Vương)',
      debtStatus: 'unpaid',
      note: 'Ký nợ tiếp khách đối tác Bàn VIP 2',
      items: [
        { name: 'Bia Heineken Silver', qty: 24, price: 25000 },
        { name: 'Tôm sú hấp bia', qty: 3, price: 250000 },
        { name: 'Mực nướng sa tế', qty: 3, price: 185000 },
        { name: 'Lẩu gà lá é', qty: 2, price: 260000 },
      ],
    },
    {
      id: 'bill_seed_2days_1',
      code: 'HD-2NGAY-01',
      date: twoDaysAgoDate,
      paymentType: 'transfer',
      debtorName: '',
      debtStatus: 'none',
      note: 'Chuyển khoản QR',
      items: [
        { name: 'Bia Tiger Lùn', qty: 50, price: 22000 },
        { name: 'Ếch chiên bơ', qty: 5, price: 125000 },
        { name: 'Gà hấp lá chanh', qty: 3, price: 290000 },
        { name: 'Đậu hũ chiên giòn', qty: 5, price: 45000 },
      ],
    },
    {
      id: 'bill_seed_3days_1',
      code: 'HD-3NGAY-01',
      date: threeDaysAgoDate,
      paymentType: 'cash',
      debtorName: '',
      debtStatus: 'none',
      note: 'Tiền mặt ca tối',
      items: [
        { name: 'Bia Sài Gòn Special', qty: 45, price: 18000 },
        { name: 'Ếch rơm', qty: 4, price: 140000 },
        { name: 'Bò lúc lắc khoai tây', qty: 4, price: 195000 },
        { name: 'Lẩu thái hải sản', qty: 3, price: 280000 },
      ],
    },
  ];

  rawSeedBills.forEach((rb, bIdx) => {
    let billTotal = 0;
    const summaryParts: string[] = [];

    rb.items.forEach((it, iIdx) => {
      const sub = it.qty * it.price;
      billTotal += sub;
      summaryParts.push(`${it.name} (x${it.qty})`);

      const prodKey = it.name.toLowerCase();
      const prod = productsMap.get(prodKey);
      const cat = prod ? prod.category : inferCategory(it.name);

      if (prod) {
        prod.totalSold += it.qty;
        prod.totalRevenue += sub;
      }

      const returnedQty =
        rb.id === 'bill_seed_today_1' && it.name === 'Bia Tiger Lùn' ? 6 : 0;

      billItems.push({
        id: `${rb.id}_item_${iIdx + 1}`,
        ownerId: cleanOwner,
        billId: rb.id,
        billDate: rb.date,
        productName: it.name,
        category: cat,
        quantity: it.qty,
        returnedQuantity: returnedQty,
        unitPrice: it.price,
        subtotal: sub,
        createdAtMs: now - bIdx * 3600000,
        updatedAtMs: now - bIdx * 3600000,
      });
    });

    const isSampleDeducted = rb.id === 'bill_seed_today_1';
    const deductedAmt = isSampleDeducted ? 6 * 22000 : 0;

    bills.push({
      id: rb.id,
      ownerId: cleanOwner,
      billCode: rb.code,
      billDate: rb.date,
      paymentType: rb.paymentType,
      debtorName: rb.debtorName,
      debtStatus: rb.debtStatus,
      totalAmount: billTotal,
      deductedAmount: deductedAmt,
      itemsSummary: summaryParts.join(', '),
      note: rb.note,
      status: 'active',
      createdAtMs: now - bIdx * 3600000,
      updatedAtMs: now - bIdx * 3600000,
    });
  });

  const tigerProd = productsMap.get('bia tiger lùn');
  if (tigerProd) {
    tigerProd.totalReturned += 6;
    tigerProd.totalRevenue -= 6 * 22000;
  }

  deductions.push({
    id: 'ded_seed_today_1',
    ownerId: cleanOwner,
    billId: 'bill_seed_today_1',
    billCode: 'HD-HOMNAY-01',
    billDate: today,
    deductionDate: today,
    productName: 'Bia Tiger Lùn',
    category: 'Bia',
    quantity: 6,
    unitPrice: 22000,
    amount: 132000,
    note: 'Khách bàn VIP 1 trả lại 6 lon Bia Tiger Lùn chưa khui cuối buổi',
    createdAtMs: now - 1800000,
    updatedAtMs: now - 1800000,
  });

  return {
    products: Array.from(productsMap.values()),
    bills,
    billItems,
    deductions,
  };
}
