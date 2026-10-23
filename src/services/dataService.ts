import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  ref,
  set as rtdbSet,
  remove as rtdbRemove,
  get as rtdbGet,
  onChildAdded,
} from 'firebase/database';
import { db, rtdb, auth, handleFirestoreError, OperationType } from '../firebase';
import {
  BillRecord,
  BillItemRecord,
  ProductRecord,
  DeductionRecord,
  ReturnRecord,
  ExtractedBillItem,
  PaymentType,
  StaffAccount,
  UserRole,
  RolePermissionsMap,
  DEFAULT_ROLE_PERMISSIONS,
  sanitizeTabList,
  WorkspaceInventoryData,
  InventoryItemConfig,
  DailyInventoryEntry,
  InventoryImportLog,
  EmployeeRecord,
} from '../types';
import {
  sanitizeId,
  truncateStr,
  inferCategory,
  inferUnit,
  getCurrentBusinessDate,
  resolveBusinessBillDate,
  DEFAULT_CATALOG_PRODUCTS,
  extractReceiptOriginalPrice,
  reconstructBillItemsFromSummary,
  extractBillTableName,
  formatReturnDeductionTitle,
  buildDefaultReturnNote,
  formatDateDMY,
  isFoodDiscountEligible,
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
  {
    id: 'staff_inventory',
    username: 'kiemkho',
    password: '123456',
    displayName: 'Hoàng Văn Nam (Kiểm kho)',
    info: 'Bộ phận kiểm kho — Xem số lượng bán theo danh mục được cấp quyền',
    role: UserRole.INVENTORY,
    active: true,
    allowedTabs: DEFAULT_ROLE_PERMISSIONS[UserRole.INVENTORY].allowedTabs,
    useCustomTabs: false,
  },
];

export function normalizeStaffAccountsWithFixedAdmin(
  accounts?: StaffAccount[] | null
): StaffAccount[] {
  const deletedStaff = getDeletedStaffAccountIds();
  const rawList =
    Array.isArray(accounts) && accounts.length > 0
      ? accounts
      : DEFAULT_STAFF_ACCOUNTS;

  let hasAdmin = false;
  const filteredRaw = rawList.filter((acc) => {
    const isPrimaryAdmin =
      acc.username?.trim().toLowerCase() === FIXED_ADMIN_USERNAME ||
      acc.id === 'staff_admin';
    if (isPrimaryAdmin) return true;
    return !deletedStaff.has(acc.id) && !deletedStaff.has(sanitizeId(acc.id));
  });

  const normalized = filteredRaw.map((acc) => {
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
const DELETED_BILLS_KEY = 'vqbill_deleted_bills_v1';
const DELETED_DEBTORS_KEY = 'vqbill_deleted_debtors_v1';
const DELETED_EMPLOYEES_KEY = 'vqbill_deleted_employees_v1';
const DELETED_STAFF_ACCOUNTS_KEY = 'vqbill_deleted_staff_accounts_v1';
export const SHARED_WORKSPACE_ID = 'vqbill_shared_workspace';

export function getDeletedEmployeeIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_EMPLOYEES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function markEmployeesDeletedLocally(empIds: string[]): void {
  try {
    const set = getDeletedEmployeeIds();
    for (const id of empIds) {
      if (id) {
        set.add(id);
        set.add(sanitizeId(id));
      }
    }
    localStorage.setItem(DELETED_EMPLOYEES_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // Ignore storage errors
  }
}

export function unmarkEmployeeDeletedLocally(empId: string): void {
  try {
    const set = getDeletedEmployeeIds();
    set.delete(empId);
    set.delete(sanitizeId(empId));
    localStorage.setItem(DELETED_EMPLOYEES_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // Ignore storage errors
  }
}

export function getDeletedStaffAccountIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_STAFF_ACCOUNTS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function markStaffAccountsDeletedLocally(accountIds: string[]): void {
  try {
    const set = getDeletedStaffAccountIds();
    for (const id of accountIds) {
      if (id && id !== 'staff_admin') {
        set.add(id);
        set.add(sanitizeId(id));
      }
    }
    localStorage.setItem(
      DELETED_STAFF_ACCOUNTS_KEY,
      JSON.stringify(Array.from(set))
    );
  } catch {
    // Ignore storage errors
  }
}

export function unmarkStaffAccountDeletedLocally(accountId: string): void {
  try {
    const set = getDeletedStaffAccountIds();
    set.delete(accountId);
    set.delete(sanitizeId(accountId));
    localStorage.setItem(
      DELETED_STAFF_ACCOUNTS_KEY,
      JSON.stringify(Array.from(set))
    );
  } catch {
    // Ignore storage errors
  }
}

export function getDeletedBillIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_BILLS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function markBillsDeletedLocally(billIds: string[]): void {
  try {
    const set = getDeletedBillIds();
    for (const id of billIds) {
      if (id) {
        set.add(id);
        set.add(sanitizeId(id));
      }
    }
    const arr = Array.from(set).slice(-2000);
    localStorage.setItem(DELETED_BILLS_KEY, JSON.stringify(arr));
  } catch {
    // Ignore storage errors
  }
}

export function getDeletedDebtors(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_DEBTORS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.map((d) => String(d).trim().toLowerCase()).filter(Boolean))
      : new Set();
  } catch {
    return new Set();
  }
}

export function markDebtorsDeletedLocally(debtorNames: string[]): void {
  try {
    const set = getDeletedDebtors();
    for (const name of debtorNames) {
      const clean = (name || '').trim().toLowerCase();
      if (clean) set.add(clean);
    }
    localStorage.setItem(DELETED_DEBTORS_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // Ignore storage errors
  }
}

export function unmarkDebtorDeletedLocally(debtorName: string): void {
  try {
    const clean = (debtorName || '').trim().toLowerCase();
    if (!clean) return;
    const set = getDeletedDebtors();
    if (set.has(clean)) {
      set.delete(clean);
      localStorage.setItem(DELETED_DEBTORS_KEY, JSON.stringify(Array.from(set)));
    }
  } catch {
    // Ignore storage errors
  }
}

export function dedupeRecordsById<T extends { id: string; updatedAtMs?: number }>(
  list?: T[]
): T[] {
  if (!Array.isArray(list)) return [];
  const map = new Map<string, T>();
  for (const item of list) {
    if (!item || !item.id) continue;
    const key = sanitizeId(item.id) || item.id;
    const existing = map.get(key);
    if (!existing || (item.updatedAtMs || 0) >= (existing.updatedAtMs || 0)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

function filterSnapshotByTombstones(
  snap: WorkspaceCacheSnapshot
): WorkspaceCacheSnapshot {
  const deletedBills = getDeletedBillIds();
  const deletedDebtors = getDeletedDebtors();
  const filteredBills = dedupeRecordsById(snap.bills || []).filter(
    (b) => !deletedBills.has(b.id) && !deletedBills.has(sanitizeId(b.id))
  );
  const validBillIds = new Set(filteredBills.map((b) => b.id));
  const filteredBillItems = dedupeRecordsById(snap.billItems || []).filter(
    (it) =>
      !deletedBills.has(it.billId) &&
      !deletedBills.has(sanitizeId(it.billId)) &&
      (validBillIds.size === 0 || validBillIds.has(it.billId))
  );
  const filteredProducts = dedupeRecordsById(snap.products || []);
  const filteredDeductions = dedupeRecordsById(snap.deductions || []).filter(
    (d) => !deletedBills.has(d.billId) && !deletedBills.has(sanitizeId(d.billId))
  );
  const filteredReturns = dedupeRecordsById(snap.returns || []).filter(
    (r) => !deletedBills.has(r.billId) && !deletedBills.has(sanitizeId(r.billId))
  );
  const filteredDebtors = snap.debtors
    ? snap.debtors.filter((d) => !deletedDebtors.has((d || '').trim().toLowerCase()))
    : undefined;

  let filteredInventoryData = snap.inventoryData;
  if (filteredInventoryData) {
    if (
      Array.isArray(filteredInventoryData.deletedEmployeeIds) &&
      filteredInventoryData.deletedEmployeeIds.length > 0
    ) {
      markEmployeesDeletedLocally(filteredInventoryData.deletedEmployeeIds);
    }
    const deletedEmps = getDeletedEmployeeIds();
    const allDeletedEmpIds = Array.from(
      new Set([
        ...Array.from(deletedEmps),
        ...(filteredInventoryData.deletedEmployeeIds || []),
      ])
    );
    if (Array.isArray(filteredInventoryData.employees)) {
      filteredInventoryData = {
        ...filteredInventoryData,
        deletedEmployeeIds: allDeletedEmpIds,
        employees: filteredInventoryData.employees.filter(
          (e) =>
            !deletedEmps.has(e.id) &&
            !deletedEmps.has(sanitizeId(e.id))
        ),
      };
    } else if (allDeletedEmpIds.length > 0) {
      filteredInventoryData = {
        ...filteredInventoryData,
        deletedEmployeeIds: allDeletedEmpIds,
      };
    }
  }

  return {
    ...snap,
    inventoryData: filteredInventoryData,
    products: filteredProducts,
    bills: filteredBills,
    billItems: filteredBillItems,
    deductions: filteredDeductions,
    returns: filteredReturns,
    debtors: filteredDebtors,
    staffAccounts: normalizeStaffAccountsWithFixedAdmin(snap.staffAccounts),
  };
}

export interface WorkspaceCacheSnapshot {
  version?: number;
  updatedAtMs?: number;
  updatedBy?: string;
  cloudSyncedOnce?: boolean;
  initialized: boolean;
  categories?: string[];
  debtors?: string[];
  rolePermissions?: RolePermissionsMap;
  inventoryData?: WorkspaceInventoryData;
  products: ProductRecord[];
  bills: BillRecord[];
  billItems: BillItemRecord[];
  deductions: DeductionRecord[];
  returns?: ReturnRecord[];
  staffAccounts: StaffAccount[];
}

export function loadLocalMirror(ownerId: string): WorkspaceCacheSnapshot | null {
  try {
    const primaryKey = `${LOCAL_CACHE_KEY}_${sanitizeId(ownerId)}`;
    const fallbackKeys = [
      primaryKey,
      `${LOCAL_CACHE_KEY}_${SHARED_WORKSPACE_ID}`,
      `${LOCAL_CACHE_KEY}_vqbill_default_workspace`,
    ];

    // Also scan localStorage for any previous vqbill_cloud_mirror_v2_* key that was initialized
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LOCAL_CACHE_KEY) && !fallbackKeys.includes(k)) {
        fallbackKeys.push(k);
      }
    }

    let firstUninit: WorkspaceCacheSnapshot | null = null;
    for (const key of fallbackKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as WorkspaceCacheSnapshot;
        if (parsed && parsed.initialized) {
          return filterSnapshotByTombstones(parsed);
        }
        if (parsed && !firstUninit) {
          firstUninit = filterSnapshotByTombstones(parsed);
        }
      } catch {
        // continue
      }
    }
    return firstUninit;
  } catch {
    return null;
  }
}

export function saveLocalMirror(ownerId: string, snapshot: WorkspaceCacheSnapshot) {
  try {
    const cleanSnap = filterSnapshotByTombstones(snapshot);
    const payload = JSON.stringify(cleanSnap);
    const primaryKey = `${LOCAL_CACHE_KEY}_${sanitizeId(ownerId)}`;
    const sharedKey = `${LOCAL_CACHE_KEY}_${SHARED_WORKSPACE_ID}`;
    localStorage.setItem(primaryKey, payload);
    if (primaryKey !== sharedKey) {
      localStorage.setItem(sharedKey, payload);
    }
    // Sync any other legacy mirror keys so stale deleted bills cannot resurrect
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LOCAL_CACHE_KEY) && k !== primaryKey && k !== sharedKey) {
        localStorage.setItem(k, payload);
      }
    }
  } catch {
    // Ignore storage quota errors
  }
}

export interface ServerWorkspaceVersionInfo {
  ok: boolean;
  version: number;
  updatedAtMs: number;
  updatedBy?: string;
  initialized: boolean;
  billsCount: number;
  productsCount: number;
}

export async function fetchServerWorkspaceVersion(): Promise<ServerWorkspaceVersionInfo | null> {
  try {
    const res = await fetch('/api/workspace/version', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.ok) return null;
    return data as ServerWorkspaceVersionInfo;
  } catch {
    return null;
  }
}

export async function fetchServerWorkspace(): Promise<WorkspaceCacheSnapshot | null> {
  try {
    const res = await fetch('/api/workspace', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.ok || !data.workspace) return null;
    return filterSnapshotByTombstones(data.workspace as WorkspaceCacheSnapshot);
  } catch {
    return null;
  }
}

export async function pushWorkspaceToServer(
  snapshot: WorkspaceCacheSnapshot,
  mode: 'replace' | 'merge_initial' = 'replace',
  updatedBy = 'client'
): Promise<{
  ok: boolean;
  version: number;
  updatedAtMs: number;
  workspace?: WorkspaceCacheSnapshot;
} | null> {
  try {
    const res = await fetch('/api/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot, mode, updatedBy }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.ok) return null;
    return data;
  } catch {
    return null;
  }
}

function getFirestoreOwnerUid(_fallbackOwnerId: string): string {
  return SHARED_WORKSPACE_ID;
}

async function upsertFirestoreDoc(
  collectionName: string,
  docId: string,
  createData: Record<string, any>,
  updateData: Record<string, any>
): Promise<void> {
  const refDoc = doc(db, collectionName, docId);
  try {
    await updateDoc(refDoc, {
      ...updateData,
      updatedAt: serverTimestamp(),
    });
  } catch {
    await setDoc(refDoc, {
      ...createData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function saveWorkspaceMetaToFirestore(params: {
  ownerId?: string;
  version?: number;
  categories?: string[];
  debtors?: string[];
  rolePermissions?: RolePermissionsMap;
  inventoryData?: WorkspaceInventoryData;
  updatedBy?: string;
}): Promise<void> {
  const wsId = SHARED_WORKSPACE_ID;
  const refDoc = doc(db, 'workspace_meta', wsId);
  try {
    const existingSnap = await getDoc(refDoc);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;
    const nextVersion =
      params.version !== undefined
        ? Math.max(Number(params.version) || 1, (Number(existingData?.version) || 0) + 1)
        : (Number(existingData?.version) || 0) + 1;

    const categoriesJson = truncateStr(
      JSON.stringify(
        params.categories ??
          (existingData?.categoriesJson ? JSON.parse(existingData.categoriesJson) : [])
      ),
      20000,
      '[]'
    );
    const debtorsJson = truncateStr(
      JSON.stringify(
        params.debtors ??
          (existingData?.debtorsJson ? JSON.parse(existingData.debtorsJson) : [])
      ),
      50000,
      '[]'
    );

    let existingRoleObj: any = DEFAULT_ROLE_PERMISSIONS;
    if (existingData?.rolePermissionsJson) {
      try {
        existingRoleObj = JSON.parse(existingData.rolePermissionsJson);
      } catch {
        existingRoleObj = DEFAULT_ROLE_PERMISSIONS;
      }
    }
    const mergedRolePayload: any = {
      ...(params.rolePermissions ?? existingRoleObj),
    };
    const nextInv = params.inventoryData ?? existingRoleObj?._inventoryData;
    if (nextInv) {
      mergedRolePayload._inventoryData = nextInv;
    }

    const rolePermissionsJson = truncateStr(
      JSON.stringify(mergedRolePayload),
      50000,
      '{}'
    );
    const updatedBy = truncateStr(params.updatedBy || 'staff', 100, 'staff');

    if (existingSnap.exists()) {
      await updateDoc(refDoc, {
        initialized: true,
        version: nextVersion,
        categoriesJson,
        debtorsJson,
        rolePermissionsJson,
        updatedBy,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(refDoc, {
        ownerId: wsId,
        initialized: true,
        version: nextVersion,
        categoriesJson,
        debtorsJson,
        rolePermissionsJson,
        updatedBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Ignore transient network errors
  }
}

export async function fetchFirestoreWorkspaceOnce(): Promise<WorkspaceCacheSnapshot | null> {
  const wsId = SHARED_WORKSPACE_ID;
  const targetOwnerIds = [SHARED_WORKSPACE_ID, 'vqbill_default_workspace'];
  try {
    const [
      metaSnap,
      fallbackMetaSnap,
      billsSnap,
      itemsSnap,
      productsSnap,
      deductionsSnap,
      returnsSnap,
      staffSnap,
    ] = await Promise.all([
      getDoc(doc(db, 'workspace_meta', wsId)),
      getDoc(doc(db, 'workspace_meta', 'vqbill_default_workspace')),
      getDocs(query(collection(db, 'bills'), where('ownerId', 'in', targetOwnerIds))),
      getDocs(query(collection(db, 'bill_items'), where('ownerId', 'in', targetOwnerIds))),
      getDocs(query(collection(db, 'products'), where('ownerId', 'in', targetOwnerIds))),
      getDocs(query(collection(db, 'deductions'), where('ownerId', 'in', targetOwnerIds))),
      getDocs(query(collection(db, 'returns'), where('ownerId', 'in', targetOwnerIds))),
      getDocs(query(collection(db, 'staff_accounts'), where('ownerId', 'in', targetOwnerIds))),
    ]);

    const hasAnyDocs =
      metaSnap.exists() ||
      fallbackMetaSnap.exists() ||
      !billsSnap.empty ||
      !productsSnap.empty ||
      !deductionsSnap.empty ||
      !returnsSnap.empty;

    if (!hasAnyDocs) {
      return null;
    }

    const primaryMeta = metaSnap.exists() ? metaSnap.data() : null;
    const fallbackMeta = fallbackMetaSnap.exists() ? fallbackMetaSnap.data() : null;
    const metaData = primaryMeta || fallbackMeta;
    let categories: string[] | undefined;
    let debtors: string[] | undefined;
    let rolePermissions: RolePermissionsMap | undefined;
    let inventoryData: WorkspaceInventoryData | undefined;

    if (metaData?.categoriesJson) {
      try {
        const parsed = JSON.parse(metaData.categoriesJson);
        if (Array.isArray(parsed) && parsed.length > 0) categories = parsed;
      } catch {
        // ignore
      }
    }
    if (metaData?.debtorsJson) {
      try {
        const parsed = JSON.parse(metaData.debtorsJson);
        if (Array.isArray(parsed)) debtors = parsed;
      } catch {
        // ignore
      }
    }
    if (metaData?.rolePermissionsJson) {
      try {
        const parsed = JSON.parse(metaData.rolePermissionsJson);
        if (parsed && typeof parsed === 'object') {
          const { _inventoryData, ...restRoles } = parsed;
          rolePermissions = restRoles as RolePermissionsMap;
          if (_inventoryData && typeof _inventoryData === 'object') {
            inventoryData = _inventoryData as WorkspaceInventoryData;
          }
        }
      } catch {
        // ignore
      }
    }

    const bills: BillRecord[] = billsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ownerId: data.ownerId,
        billCode: data.billCode,
        billDate: data.billDate,
        rawDate: data.rawDate || data.billDate,
        checkInTime: data.checkInTime || '',
        checkOutTime: data.checkOutTime || '',
        paymentType: data.paymentType,
        debtorName: data.debtorName || '',
        debtStatus: data.debtStatus || 'none',
        settleDate: data.settleDate || '',
        settledMethod: data.settledMethod || undefined,
        paidCashAmount:
          data.paidCashAmount !== undefined && data.paidCashAmount !== null && Number(data.paidCashAmount) > 0
            ? Number(data.paidCashAmount)
            : (data.paymentType === 'split'
                ? (() => {
                    const match = String(data.note || '').match(/TM[:\s]*([\d.,]+)/i);
                    if (match) {
                      const val = Number(match[1].replace(/[.,\s]/g, ''));
                      if (!isNaN(val) && val > 0) return val;
                    }
                    return data.paidCashAmount !== undefined && data.paidCashAmount !== null
                      ? Number(data.paidCashAmount)
                      : undefined;
                  })()
                : (data.paidCashAmount !== undefined && data.paidCashAmount !== null ? Number(data.paidCashAmount) : undefined)),
        paidTransferAmount:
          data.paidTransferAmount !== undefined && data.paidTransferAmount !== null && Number(data.paidTransferAmount) > 0
            ? Number(data.paidTransferAmount)
            : (data.paymentType === 'split'
                ? (() => {
                    const match = String(data.note || '').match(/CK[:\s]*([\d.,]+)/i);
                    if (match) {
                      const val = Number(match[1].replace(/[.,\s]/g, ''));
                      if (!isNaN(val) && val > 0) return val;
                    }
                    return data.paidTransferAmount !== undefined && data.paidTransferAmount !== null
                      ? Number(data.paidTransferAmount)
                      : undefined;
                  })()
                : (data.paidTransferAmount !== undefined && data.paidTransferAmount !== null ? Number(data.paidTransferAmount) : undefined)),
        subtotalAmount: Number(data.subtotalAmount) || Number(data.totalAmount) || 0,
        discountAmount: Number(data.discountAmount) || 0,
        totalAmount: Number(data.totalAmount) || 0,
        deductedAmount: Number(data.deductedAmount) || 0,
        itemsSummary: data.itemsSummary || '',
        note: data.note || '',
        status: data.status || 'active',
        isArchived: Boolean(data.isArchived),
        createdAtMs: data.createdAt?.toMillis?.() || Date.now(),
        updatedAtMs: data.updatedAt?.toMillis?.() || Date.now(),
      };
    });

    const billItems: BillItemRecord[] = itemsSnap.docs.map((d) => {
      const data = d.data();
      const unitPrice = Number(data.unitPrice) || 0;
      const productName = data.productName || '';
      const note = data.note || '';
      const originalUnitPrice = extractReceiptOriginalPrice({
        productName,
        note,
        unitPrice,
        originalUnitPrice: Number(data.originalUnitPrice) || undefined,
      });
      return {
        id: d.id,
        ownerId: data.ownerId,
        billId: data.billId,
        billDate: data.billDate,
        productName,
        category: data.category,
        note,
        quantity: Number(data.quantity) || 1,
        returnedQuantity: Number(data.returnedQuantity) || 0,
        unitPrice,
        subtotal: Number(data.subtotal) || 0,
        originalUnitPrice,
        isDiscountEligible:
          data.isDiscountEligible !== undefined
            ? Boolean(data.isDiscountEligible)
            : isFoodDiscountEligible({ productName, category: data.category }),
        createdAtMs: data.createdAt?.toMillis?.() || Date.now(),
        updatedAtMs: data.updatedAt?.toMillis?.() || Date.now(),
      };
    });

    const products: ProductRecord[] = productsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ownerId: data.ownerId,
        productName: data.productName,
        category: data.category,
        unitPrice: Number(data.unitPrice) || 0,
        unit: data.unit || 'Phần',
        totalSold: Number(data.totalSold) || 0,
        totalReturned: Number(data.totalReturned) || 0,
        totalRevenue: Number(data.totalRevenue) || 0,
        createdAtMs: data.createdAt?.toMillis?.() || Date.now(),
        updatedAtMs: data.updatedAt?.toMillis?.() || Date.now(),
      };
    });

    // Ensure any bill whose bill_items were missing in Firestore is populated from itemsSummary
    const existingItemBillIds = new Set(billItems.map((it) => it.billId));
    for (const b of bills) {
      if (!existingItemBillIds.has(b.id) && b.itemsSummary) {
        const reconstructed = reconstructBillItemsFromSummary(b, products);
        billItems.push(...reconstructed);
      }
    }

    const deductions: DeductionRecord[] = deductionsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ownerId: data.ownerId,
        billId: data.billId,
        billCode: data.billCode,
        billDate: data.billDate,
        deductionDate: data.deductionDate || data.billDate,
        productName: data.productName,
        category: data.category,
        quantity: Number(data.quantity) || 1,
        unitPrice: Number(data.unitPrice) || 0,
        amount: Number(data.amount) || 0,
        note: data.note || '',
        createdAtMs: data.createdAt?.toMillis?.() || Date.now(),
        updatedAtMs: data.updatedAt?.toMillis?.() || Date.now(),
      };
    });

    const returns: ReturnRecord[] = returnsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ownerId: data.ownerId,
        billId: data.billId,
        billCode: data.billCode,
        billDate: data.billDate,
        returnDate: data.returnDate || data.billDate,
        productName: data.productName,
        category: data.category,
        quantity: Number(data.quantity) || 1,
        unitPrice: Number(data.unitPrice) || 0,
        amount: Number(data.amount) || 0,
        note: data.note || '',
        createdAtMs: data.createdAt?.toMillis?.() || Date.now(),
        updatedAtMs: data.updatedAt?.toMillis?.() || Date.now(),
      };
    });

    const staffAccounts: StaffAccount[] = staffSnap.docs.map((d) => {
      const data = d.data();
      const role = (data.role as UserRole) || UserRole.CASHIER;
      return {
        id: d.id,
        ownerId: data.ownerId,
        username: data.username,
        password: data.password,
        displayName: data.displayName,
        info: data.info || '',
        role,
        active: Boolean(data.active),
        allowedTabs:
          DEFAULT_ROLE_PERMISSIONS[role]?.allowedTabs || ['dashboard'],
        useCustomTabs: false,
        createdAtMs: data.createdAt?.toMillis?.() || Date.now(),
        updatedAtMs: data.updatedAt?.toMillis?.() || Date.now(),
      };
    });

    return filterSnapshotByTombstones({
      version: Number(metaData?.version) || Math.max(1, bills.length),
      updatedAtMs: metaData?.updatedAt?.toMillis?.() || Date.now(),
      updatedBy: metaData?.updatedBy || 'cloud',
      cloudSyncedOnce: true,
      initialized: true,
      categories,
      debtors,
      rolePermissions,
      inventoryData,
      products,
      bills,
      billItems,
      deductions,
      returns,
      staffAccounts: normalizeStaffAccountsWithFixedAdmin(
        staffAccounts.length > 0 ? staffAccounts : DEFAULT_STAFF_ACCOUNTS
      ),
    });
  } catch {
    return null;
  }
}

export async function syncFullSnapshotToFirestore(
  snapshot: WorkspaceCacheSnapshot,
  updatedBy = 'admin'
): Promise<boolean> {
  const fsOwner = SHARED_WORKSPACE_ID;
  try {
    const existingBillsSnap = await getDocs(
      query(collection(db, 'bills'), where('ownerId', '==', fsOwner))
    ).catch(() => null);
    const snapshotBillIds = new Set(
      (snapshot.bills || []).map((b) => sanitizeId(b.id))
    );
    if (existingBillsSnap) {
      for (const docSnap of existingBillsSnap.docs) {
        if (!snapshotBillIds.has(docSnap.id)) {
          await deleteDoc(doc(db, 'bills', docSnap.id)).catch(() => {});
        }
      }
    }

    const existingItemsSnap = await getDocs(
      query(collection(db, 'bill_items'), where('ownerId', '==', fsOwner))
    ).catch(() => null);
    const snapshotItemIds = new Set(
      (snapshot.billItems || []).map((bi) => sanitizeId(bi.id))
    );
    if (existingItemsSnap) {
      for (const docSnap of existingItemsSnap.docs) {
        if (!snapshotItemIds.has(docSnap.id)) {
          await deleteDoc(doc(db, 'bill_items', docSnap.id)).catch(() => {});
        }
      }
    }

    for (const b of snapshot.bills || []) {
      const bid = sanitizeId(b.id);
      const baseFields = {
        billCode: truncateStr(b.billCode, 64, 'HD-001'),
        billDate:
          b.billDate && /^\d{4}-\d{2}-\d{2}$/.test(b.billDate)
            ? b.billDate
            : getCurrentBusinessDate(),
        rawDate: truncateStr(b.rawDate || b.billDate || '', 20, ''),
        checkInTime: truncateStr(b.checkInTime || '', 20, ''),
        checkOutTime: truncateStr(b.checkOutTime || '', 20, ''),
        paymentType: b.paymentType || 'cash',
        debtorName: truncateStr(b.debtorName || '', 120, ''),
        debtStatus: b.debtStatus || 'none',
        settleDate: truncateStr(b.settleDate || '', 20, ''),
        settledMethod: b.settledMethod || '',
        paidCashAmount:
          b.paidCashAmount !== undefined && b.paidCashAmount !== null
            ? Math.max(0, Math.round(Number(b.paidCashAmount) || 0))
            : (b.paymentType === 'split' ? Math.round(Number(b.totalAmount || 0) / 2) : 0),
        paidTransferAmount:
          b.paidTransferAmount !== undefined && b.paidTransferAmount !== null
            ? Math.max(0, Math.round(Number(b.paidTransferAmount) || 0))
            : (b.paymentType === 'split' ? Math.max(0, Math.round(Number(b.totalAmount || 0)) - Math.round(Number(b.totalAmount || 0) / 2)) : 0),
        subtotalAmount: Math.max(0, Math.round(b.subtotalAmount ?? b.totalAmount ?? 0)),
        discountAmount: Math.max(0, Math.round(b.discountAmount || 0)),
        totalAmount: Math.max(0, Math.round(b.totalAmount || 0)),
        deductedAmount: Math.max(0, Math.round(b.deductedAmount || 0)),
        itemsSummary: truncateStr(b.itemsSummary || '', 1000, ''),
        note: truncateStr(b.note || '', 500, ''),
        status: b.status === 'locked' ? 'locked' : 'active',
        isArchived: Boolean(b.isArchived),
      };
      await upsertFirestoreDoc(
        'bills',
        bid,
        { ownerId: fsOwner, ...baseFields },
        baseFields
      );
    }

    for (const bi of snapshot.billItems || []) {
      const iid = sanitizeId(bi.id);
      const qty = Math.max(1, Math.round(bi.quantity || 1));
      const retQty = Math.min(qty, Math.max(0, Math.round(bi.returnedQuantity || 0)));
      const baseFields = {
        billDate:
          bi.billDate && /^\d{4}-\d{2}-\d{2}$/.test(bi.billDate)
            ? bi.billDate
            : getCurrentBusinessDate(),
        productName: truncateStr(bi.productName, 150, 'Món ăn'),
        note: truncateStr(bi.note || '', 400, ''),
        category: truncateStr(bi.category || 'Khác', 80, 'Khác'),
        quantity: qty,
        returnedQuantity: retQty,
        unitPrice: Math.max(0, Math.round(bi.unitPrice || 0)),
        subtotal: Math.max(0, Math.round(bi.subtotal || 0)),
      };
      await upsertFirestoreDoc(
        'bill_items',
        iid,
        { ownerId: fsOwner, billId: sanitizeId(bi.billId), ...baseFields },
        baseFields
      );
    }

    for (const p of snapshot.products || []) {
      const pid = sanitizeId(p.id);
      const baseFields = {
        productName: truncateStr(p.productName, 150, 'Sản phẩm'),
        category: truncateStr(p.category || 'Khác', 80, 'Khác'),
        unitPrice: Math.max(0, Math.round(p.unitPrice || 0)),
        unit: truncateStr(p.unit || 'Phần', 40, 'Phần'),
        totalSold: Math.max(0, Math.round(p.totalSold || 0)),
        totalReturned: Math.max(0, Math.round(p.totalReturned || 0)),
        totalRevenue: Math.round(p.totalRevenue || 0),
      };
      await upsertFirestoreDoc(
        'products',
        pid,
        { ownerId: fsOwner, ...baseFields },
        baseFields
      );
    }

    for (const d of snapshot.deductions || []) {
      const did = sanitizeId(d.id);
      const bDate =
        d.billDate && /^\d{4}-\d{2}-\d{2}$/.test(d.billDate)
          ? d.billDate
          : getCurrentBusinessDate();
      const dDate =
        d.deductionDate && /^\d{4}-\d{2}-\d{2}$/.test(d.deductionDate)
          ? d.deductionDate
          : bDate;
      const baseFields = {
        deductionDate: dDate,
        productName: truncateStr(d.productName, 150, 'Khoản chi'),
        category: truncateStr(d.category || 'Chi phí', 80, 'Chi phí'),
        quantity: Math.max(1, Math.round(d.quantity || 1)),
        unitPrice: Math.max(0, Math.round(d.unitPrice || 0)),
        amount: Math.max(0, Math.round(d.amount || 0)),
        note: truncateStr(d.note || '', 500, ''),
      };
      await upsertFirestoreDoc(
        'deductions',
        did,
        {
          ownerId: fsOwner,
          billId: sanitizeId(d.billId || `exp_${did}`),
          billCode: truncateStr(d.billCode || 'CHI-TRONG-NGAY', 64, 'CHI-TRONG-NGAY'),
          billDate: bDate,
          ...baseFields,
        },
        baseFields
      );
    }

    for (const r of snapshot.returns || []) {
      const rid = sanitizeId(r.id);
      const bDate =
        r.billDate && /^\d{4}-\d{2}-\d{2}$/.test(r.billDate)
          ? r.billDate
          : getCurrentBusinessDate();
      const rDate =
        r.returnDate && /^\d{4}-\d{2}-\d{2}$/.test(r.returnDate)
          ? r.returnDate
          : bDate;
      const baseFields = {
        returnDate: rDate,
        quantity: Math.max(1, Math.round(r.quantity || 1)),
        unitPrice: Math.max(0, Math.round(r.unitPrice || 0)),
        amount: Math.max(0, Math.round(r.amount || 0)),
        note: truncateStr(r.note || '', 500, ''),
      };
      await upsertFirestoreDoc(
        'returns',
        rid,
        {
          ownerId: fsOwner,
          billId: sanitizeId(r.billId || `bill_${rid}`),
          billCode: truncateStr(r.billCode || 'HD-001', 64, 'HD-001'),
          billDate: bDate,
          productName: truncateStr(r.productName, 150, 'Món hoàn trả'),
          category: truncateStr(r.category || 'Khác', 80, 'Khác'),
          ...baseFields,
        },
        baseFields
      );
    }

    for (const acc of snapshot.staffAccounts || []) {
      await saveStaffAccountToFirebase(fsOwner, acc, false);
    }

    await saveWorkspaceMetaToFirestore({
      ownerId: fsOwner,
      version: snapshot.version,
      categories: snapshot.categories,
      debtors: snapshot.debtors,
      rolePermissions: snapshot.rolePermissions,
      inventoryData: snapshot.inventoryData,
      updatedBy,
    });

    return true;
  } catch {
    return false;
  }
}

function syncToRtdbSafe(path: string, data: any): Promise<void> {
  try {
    // Non-blocking fire-and-forget so unreachable RTDB WebSocket never blocks Firestore or UI
    rtdbSet(ref(rtdb, path), data).catch(() => {});
  } catch {
    // Ignore RTDB permission error if locked; Firestore & local mirror remain active
  }
  return Promise.resolve();
}

function removeFromRtdbSafe(path: string): Promise<void> {
  try {
    rtdbRemove(ref(rtdb, path)).catch(() => {});
  } catch {
    // Ignore
  }
  return Promise.resolve();
}

export function listenToKiotVietInbox(
  onBillReceived: (payload: any) => Promise<void>
): () => void {
  try {
    const inboxRef = ref(rtdb, 'kiotviet_inbox');
    const unsub = onChildAdded(inboxRef, async (snap) => {
      if (!snap || !snap.exists()) return;
      const val = snap.val();
      const key = snap.key;
      if (!val || typeof val !== 'object') return;
      // Remove immediately from inbox so it won't be processed again
      if (key) {
        removeFromRtdbSafe(`kiotviet_inbox/${key}`).catch(() => {});
      }
      try {
        await onBillReceived(val);
      } catch (err) {
        console.error('[KiotViet Inbox Error]:', err);
      }
    });

    return () => {
      try {
        if (typeof unsub === 'function') unsub();
      } catch {}
    };
  } catch (err) {
    console.warn('[KiotViet Inbox Setup Warning]:', err);
    return () => {};
  }
}

export async function fetchRtdbWorkspaceOnce(
  ownerId: string
): Promise<Partial<WorkspaceCacheSnapshot> | null> {
  try {
    const snap = await Promise.race([
      rtdbGet(ref(rtdb, `workspaces/${sanitizeId(ownerId)}`)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
    ]);
    if (!snap || !snap.exists()) return null;
    const val = snap.val() || {};
    return {
      initialized: Boolean(val.meta?.initialized),
      categories: Array.isArray(val.categories) ? val.categories : undefined,
      debtors: Array.isArray(val.debtors) ? val.debtors : undefined,
      rolePermissions: val.role_permissions || undefined,
      inventoryData: val.inventory_data || undefined,
      products: val.products ? Object.values(val.products) : [],
      bills: val.bills ? Object.values(val.bills) : [],
      billItems: val.bill_items ? Object.values(val.bill_items) : [],
      deductions: val.deductions ? Object.values(val.deductions) : [],
      returns: val.returns ? Object.values(val.returns) : [],
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
  await saveWorkspaceMetaToFirestore({ ownerId: cleanOwner, categories });
}

export async function saveDebtorsToCloud(
  ownerId: string,
  debtors: string[]
): Promise<void> {
  const cleanOwner = sanitizeId(ownerId);
  await syncToRtdbSafe(`workspaces/${cleanOwner}/debtors`, debtors);
  await saveWorkspaceMetaToFirestore({ ownerId: cleanOwner, debtors });
}

export async function saveRolePermissionsToCloud(
  ownerId: string,
  rolePermissions: RolePermissionsMap
): Promise<void> {
  const cleanOwner = sanitizeId(ownerId);
  await syncToRtdbSafe(`workspaces/${cleanOwner}/role_permissions`, rolePermissions);
  await saveWorkspaceMetaToFirestore({ ownerId: cleanOwner, rolePermissions });
}

export async function saveInventoryDataToCloud(
  ownerId: string,
  inventoryData: WorkspaceInventoryData,
  rolePermissions?: RolePermissionsMap
): Promise<void> {
  const cleanOwner = sanitizeId(ownerId);
  await syncToRtdbSafe(`workspaces/${cleanOwner}/inventory_data`, inventoryData);
  await saveWorkspaceMetaToFirestore({
    ownerId: cleanOwner,
    inventoryData,
    rolePermissions,
  });
}

export function isFirestoreCloudActive(): boolean {
  return true;
}

export async function markWorkspaceInitializedInCloud(ownerId: string) {
  const cleanOwner = sanitizeId(ownerId);
  await syncToRtdbSafe(`workspaces/${cleanOwner}/meta`, {
    initialized: true,
    updatedAt: Date.now(),
  });
  await saveWorkspaceMetaToFirestore({ ownerId: cleanOwner });
}

// STAFF ACCOUNTS FIREBASE CRUD
export async function saveStaffAccountToFirebase(
  ownerId: string,
  account: StaffAccount,
  isNew: boolean
): Promise<void> {
  const cleanOwner = sanitizeId(ownerId);
  const accId = sanitizeId(account.id);
  unmarkStaffAccountDeletedLocally(accId);
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
  const fsOwner = getFirestoreOwnerUid(cleanOwner);

  try {
    if (isNew) {
      await setDoc(doc(db, 'staff_accounts', accId), {
        ownerId: fsOwner,
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
        ownerId: fsOwner,
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
  markStaffAccountsDeletedLocally(accountIds);
  for (const id of accountIds) {
    const cleanId = sanitizeId(id);
    await removeFromRtdbSafe(`workspaces/${cleanOwner}/staff_accounts/${cleanId}`);
  }

  if (!isFirestoreCloudActive()) return;

  try {
    for (const id of accountIds) {
      const cleanId = sanitizeId(id);
      await deleteDoc(doc(db, 'staff_accounts', cleanId)).catch(() => {});
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
  const fsOwner = getFirestoreOwnerUid(cleanOwner);

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
        ownerId: fsOwner,
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
        ownerId: fsOwner,
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
  affectedReturns?: ReturnRecord[];
}): Promise<void> {
  const {
    ownerId,
    categories,
    affectedProducts,
    affectedBillItems,
    affectedDeductions,
    affectedReturns = [],
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
  for (const r of affectedReturns) {
    await syncToRtdbSafe(`workspaces/${cleanOwner}/returns/${sanitizeId(r.id)}`, r);
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
      }).catch(() => {});
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
      }).catch(() => {});
    }
    for (const d of affectedDeductions) {
      await updateDoc(doc(db, 'deductions', sanitizeId(d.id)), {
        deductionDate: d.deductionDate || d.billDate,
        productName: truncateStr(d.productName, 150, 'Khoản chi'),
        category: truncateStr(d.category, 80, 'Khác'),
        quantity: Math.max(1, Math.round(d.quantity || 1)),
        unitPrice: Math.max(0, Math.round(d.unitPrice || 0)),
        amount: Math.max(0, Math.round(d.amount || 0)),
        note: truncateStr(d.note || '', 500, ''),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'categories_reassign');
  }
}

// BILLS FIREBASE CRUD
export async function saveNewBillToCloud(params: {
  ownerId: string;
  billCode?: string;
  billDate: string;
  rawDate?: string;
  checkInTime?: string;
  checkOutTime?: string;
  discountAmount?: number;
  paymentType: PaymentType;
  debtorName: string;
  paidCashAmount?: number;
  paidTransferAmount?: number;
  note: string;
  subtotalAmount?: number;
  customBillCodePrefix?: string;
  isArchived?: boolean;
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
    billCode,
    billDate,
    rawDate,
    checkInTime,
    checkOutTime,
    discountAmount = 0,
    paymentType,
    debtorName,
    paidCashAmount,
    paidTransferAmount,
    note,
    customBillCodePrefix,
    isArchived,
    items,
    existingProducts,
    autoAddProducts,
  } = params;

  const cleanOwnerId = sanitizeId(ownerId);
  const now = Date.now();
  const billId = sanitizeId(`bill_${now}_${Math.random().toString(36).slice(2, 7)}`);

  const baseDate = /^\d{4}-\d{2}-\d{2}$/.test(billDate)
    ? billDate
    : getCurrentBusinessDate();

  // If rawDate wasn't shifted yet, ensure 09:00 AM -> 08:00 AM shift rule is applied when rawDate == billDate
  const resolved =
    rawDate && rawDate !== baseDate
      ? { businessDate: baseDate }
      : resolveBusinessBillDate(baseDate, checkInTime, checkOutTime, false);
  const effectiveBillDate = resolved.businessDate || baseDate;

  const codePrefix = (customBillCodePrefix || 'HD').trim();
  const shortCode = `${codePrefix}-${effectiveBillDate.replace(/-/g, '').slice(2)}-${String(now).slice(-4)}`;
  const explicitBillCode = (billCode || '').trim();
  const resolvedBillCode = explicitBillCode || (customBillCodePrefix ? shortCode : 'UNKNOW');

  const validItems = items.map((it) => {
    const qty = Math.max(1, Math.round(it.quantity || 1));
    const uPrice = Math.max(0, Math.round(it.unitPrice || 0));
    const origPrice =
      it.originalUnitPrice && it.originalUnitPrice > uPrice
        ? Math.round(it.originalUnitPrice)
        : undefined;
    const sub = qty * uPrice;
    const pName = truncateStr(it.productName, 150, 'Món ăn');
    const itemNote = truncateStr(it.note || '', 400, '');
    const cat = truncateStr(it.category || inferCategory(pName), 80, 'Khác');
    const isEligible =
      it.isDiscountEligible !== undefined
        ? Boolean(it.isDiscountEligible)
        : isFoodDiscountEligible({ productName: pName, category: cat });
    return {
      productName: pName,
      note: itemNote,
      category: cat,
      quantity: qty,
      unitPrice: uPrice,
      originalUnitPrice: origPrice,
      subtotal: sub,
      isDiscountEligible: isEligible,
    };
  });

  const subtotalAmount = validItems.reduce((sum, it) => sum + it.subtotal, 0);
  const cleanDiscount = Math.min(
    subtotalAmount,
    Math.max(0, Math.round(Number(discountAmount) || 0))
  );
  const totalAmount = Math.max(0, subtotalAmount - cleanDiscount);
  const summaryStr = truncateStr(
    validItems
      .map(
        (it) =>
          `${it.productName}${it.note ? ` (${it.note})` : ''} x${it.quantity}`
      )
      .join(', '),
    1000,
    ''
  );

  const isOwnerSlip =
    codePrefix.toUpperCase().startsWith('CHU-QL') ||
    (note || '').toUpperCase().includes('[CHỦ/QL SỬ DỤNG]');
  const cleanDebtor =
    paymentType === 'debt'
      ? truncateStr(debtorName, 120, 'Khách nợ')
      : isOwnerSlip
      ? truncateStr(debtorName, 120, 'Chủ / Quản lý')
      : '';
  const debtStatus = paymentType === 'debt' ? 'unpaid' : 'none';

  const billRecord: BillRecord = {
    id: billId,
    ownerId: cleanOwnerId,
    billCode: truncateStr(resolvedBillCode, 64, 'UNKNOW'),
    billDate: effectiveBillDate,
    rawDate: rawDate || (baseDate !== effectiveBillDate ? baseDate : undefined),
    checkInTime: checkInTime ? truncateStr(checkInTime, 20, '') : undefined,
    checkOutTime: checkOutTime ? truncateStr(checkOutTime, 20, '') : undefined,
    paymentType,
    debtorName: cleanDebtor,
    debtStatus,
    paidCashAmount:
      paymentType === 'split'
        ? (paidCashAmount !== undefined && paidCashAmount !== null
            ? Math.max(0, Math.round(Number(paidCashAmount) || 0))
            : Math.round(totalAmount / 2))
        : (paidCashAmount !== undefined ? Math.max(0, Math.round(Number(paidCashAmount) || 0)) : undefined),
    paidTransferAmount:
      paymentType === 'split'
        ? (paidTransferAmount !== undefined && paidTransferAmount !== null
            ? Math.max(0, Math.round(Number(paidTransferAmount) || 0))
            : Math.max(
                0,
                totalAmount -
                  (paidCashAmount !== undefined && paidCashAmount !== null
                    ? Math.max(0, Math.round(Number(paidCashAmount) || 0))
                    : Math.round(totalAmount / 2))
              ))
        : (paidTransferAmount !== undefined ? Math.max(0, Math.round(Number(paidTransferAmount) || 0)) : undefined),
    subtotalAmount,
    discountAmount: cleanDiscount,
    totalAmount,
    deductedAmount: 0,
    itemsSummary: summaryStr,
    note: truncateStr(note, 500, ''),
    isArchived: Boolean(isArchived),
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
    note: it.note || '',
    category: it.category,
    quantity: it.quantity,
    returnedQuantity: 0,
    unitPrice: it.unitPrice,
    subtotal: it.subtotal,
    originalUnitPrice: it.originalUnitPrice,
    isDiscountEligible: it.isDiscountEligible !== false,
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
      if (!isArchived) {
        existing.totalSold += it.quantity;
        existing.totalRevenue += it.subtotal;
      }
      // Giữ nguyên giá mặc định (existing.unitPrice) của sản phẩm trong Menu khi chỉnh giá trong Bill
      if (existing.unitPrice <= 0 && (it.originalUnitPrice || it.unitPrice) > 0) {
        existing.unitPrice = it.originalUnitPrice || it.unitPrice;
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
        unitPrice: it.originalUnitPrice || it.unitPrice,
        unit: inferUnit(it.productName, it.category),
        totalSold: isArchived ? 0 : it.quantity,
        totalReturned: 0,
        totalRevenue: isArchived ? 0 : it.subtotal,
        createdAtMs: now,
        updatedAtMs: now,
      };
      productsMap.set(key, newProd);
      touchedProducts.push(newProd);
    }
  }

  markWorkspaceInitializedInCloud(cleanOwnerId).catch(() => {});
  syncToRtdbSafe(`workspaces/${cleanOwnerId}/bills/${billId}`, billRecord);
  for (const bi of billItemRecords) {
    syncToRtdbSafe(`workspaces/${cleanOwnerId}/bill_items/${bi.id}`, bi);
  }
  for (const tp of touchedProducts) {
    syncToRtdbSafe(`workspaces/${cleanOwnerId}/products/${tp.id}`, tp);
  }

  if (isFirestoreCloudActive()) {
    const fsOwner = getFirestoreOwnerUid(cleanOwnerId);
    const writeToFirestore = async () => {
      try {
        await setDoc(doc(db, 'bills', billId), {
          ownerId: fsOwner,
          billCode: truncateStr(billRecord.billCode, 64, 'HD-001'),
          billDate: billRecord.billDate,
          rawDate: truncateStr(billRecord.rawDate || billRecord.billDate, 100, ''),
          checkInTime: truncateStr(billRecord.checkInTime || '', 50, ''),
          checkOutTime: truncateStr(billRecord.checkOutTime || '', 50, ''),
          tableName: truncateStr(billRecord.tableName || '', 100, ''),
          paymentType: billRecord.paymentType,
          debtorName: truncateStr(billRecord.debtorName || '', 120, ''),
          debtStatus: billRecord.debtStatus,
          settleDate: truncateStr(billRecord.settleDate || '', 50, ''),
          settledMethod:
            billRecord.settledMethod === 'transfer'
              ? 'transfer'
              : billRecord.settledMethod === 'cash'
              ? 'cash'
              : '',
          paidCashAmount: billRecord.paidCashAmount || 0,
          paidTransferAmount: billRecord.paidTransferAmount || 0,
          subtotalAmount: billRecord.subtotalAmount || billRecord.totalAmount,
          discountAmount: billRecord.discountAmount || 0,
          totalAmount: billRecord.totalAmount,
          deductedAmount: billRecord.deductedAmount,
          itemsSummary: truncateStr(billRecord.itemsSummary || '', 5000, ''),
          note: truncateStr(billRecord.note || '', 2000, ''),
          isArchived: Boolean(billRecord.isArchived),
          status: billRecord.status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const batch = writeBatch(db);
        for (const bi of billItemRecords) {
          batch.set(doc(db, 'bill_items', bi.id), {
            ownerId: fsOwner,
            billId: bi.billId,
            billDate: bi.billDate,
            productName: truncateStr(bi.productName, 150, 'Món ăn'),
            note: truncateStr(bi.note || '', 500, ''),
            category: truncateStr(bi.category, 80, 'Khác'),
            quantity: Math.max(1, Math.round(bi.quantity)),
            returnedQuantity: Math.max(0, Math.round(bi.returnedQuantity)),
            unitPrice: Math.max(0, Math.round(bi.unitPrice)),
            subtotal: Math.max(0, Math.round(bi.subtotal)),
            originalUnitPrice:
              bi.originalUnitPrice !== undefined
                ? Math.max(0, Math.round(bi.originalUnitPrice))
                : Math.max(0, Math.round(bi.unitPrice)),
            discountAmount:
              bi.discountAmount !== undefined ? Math.max(0, Math.round(bi.discountAmount)) : 0,
            discountPercent:
              bi.discountPercent !== undefined ? Math.max(0, Math.round(bi.discountPercent)) : 0,
            isDiscountEligible: bi.isDiscountEligible !== false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();

        await Promise.all(
          touchedProducts.map((tp) => {
            const wasExisting = existingProducts.some((ep) => ep.id === tp.id);
            return createOrUpdateProductInFirestore(cleanOwnerId, tp, wasExisting).catch(
              () => {}
            );
          })
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `bills/${billId}`);
      }
    };

    await Promise.race([
      writeToFirestore(),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
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
    const cleanSettledMethod =
      bill.settledMethod === 'transfer'
        ? 'transfer'
        : bill.settledMethod === 'cash'
        ? 'cash'
        : '';
    const cleanTableName = truncateStr(bill.tableName || '', 100, '');

    await upsertFirestoreDoc(
      'bills',
      bill.id,
      {
        ownerId: getFirestoreOwnerUid(cleanOwnerId),
        billCode: truncateStr(bill.billCode, 64, 'HD-001'),
        billDate: bill.billDate,
        rawDate: truncateStr(bill.rawDate || bill.billDate || '', 100, ''),
        checkInTime: truncateStr(bill.checkInTime || '', 50, ''),
        checkOutTime: truncateStr(bill.checkOutTime || '', 50, ''),
        tableName: cleanTableName,
        paymentType: bill.paymentType,
        debtorName: truncateStr(bill.debtorName || '', 120, ''),
        debtStatus: bill.debtStatus,
        settleDate: truncateStr(bill.settleDate || '', 50, ''),
        settledMethod: cleanSettledMethod,
        paidCashAmount:
          bill.paymentType === 'split'
            ? (bill.paidCashAmount !== undefined && bill.paidCashAmount !== null
                ? Math.max(0, Math.round(Number(bill.paidCashAmount) || 0))
                : Math.round(bill.totalAmount / 2))
            : (bill.paidCashAmount !== undefined ? Number(bill.paidCashAmount) : 0),
        paidTransferAmount:
          bill.paymentType === 'split'
            ? (bill.paidTransferAmount !== undefined && bill.paidTransferAmount !== null
                ? Math.max(0, Math.round(Number(bill.paidTransferAmount) || 0))
                : Math.max(
                    0,
                    bill.totalAmount -
                      (bill.paidCashAmount !== undefined && bill.paidCashAmount !== null
                        ? Math.max(0, Math.round(Number(bill.paidCashAmount) || 0))
                        : Math.round(bill.totalAmount / 2))
                  ))
            : (bill.paidTransferAmount !== undefined ? Number(bill.paidTransferAmount) : 0),
        subtotalAmount: Math.max(0, Math.round(bill.subtotalAmount ?? bill.totalAmount)),
        discountAmount: Math.max(0, Math.round(bill.discountAmount || 0)),
        totalAmount: Math.max(0, Math.round(bill.totalAmount)),
        deductedAmount: Math.max(0, Math.round(bill.deductedAmount)),
        itemsSummary: truncateStr(bill.itemsSummary || '', 5000, ''),
        note: truncateStr(bill.note || '', 2000, ''),
        isArchived: Boolean(bill.isArchived),
        status: bill.status,
      },
      {
        billCode: truncateStr(bill.billCode, 64, 'HD-001'),
        billDate: bill.billDate,
        rawDate: truncateStr(bill.rawDate || bill.billDate || '', 100, ''),
        checkInTime: truncateStr(bill.checkInTime || '', 50, ''),
        checkOutTime: truncateStr(bill.checkOutTime || '', 50, ''),
        tableName: cleanTableName,
        paymentType: bill.paymentType,
        debtorName: truncateStr(bill.debtorName || '', 120, ''),
        debtStatus: bill.debtStatus,
        settleDate: truncateStr(bill.settleDate || '', 50, ''),
        settledMethod: cleanSettledMethod,
        paidCashAmount:
          bill.paymentType === 'split'
            ? (bill.paidCashAmount !== undefined && bill.paidCashAmount !== null
                ? Math.max(0, Math.round(Number(bill.paidCashAmount) || 0))
                : Math.round(bill.totalAmount / 2))
            : (bill.paidCashAmount !== undefined ? Number(bill.paidCashAmount) : 0),
        paidTransferAmount:
          bill.paymentType === 'split'
            ? (bill.paidTransferAmount !== undefined && bill.paidTransferAmount !== null
                ? Math.max(0, Math.round(Number(bill.paidTransferAmount) || 0))
                : Math.max(
                    0,
                    bill.totalAmount -
                      (bill.paidCashAmount !== undefined && bill.paidCashAmount !== null
                        ? Math.max(0, Math.round(Number(bill.paidCashAmount) || 0))
                        : Math.round(bill.totalAmount / 2))
                  ))
            : (bill.paidTransferAmount !== undefined ? Number(bill.paidTransferAmount) : 0),
        subtotalAmount: Math.max(0, Math.round(bill.subtotalAmount ?? bill.totalAmount)),
        discountAmount: Math.max(0, Math.round(bill.discountAmount || 0)),
        totalAmount: Math.max(0, Math.round(bill.totalAmount)),
        deductedAmount: Math.max(0, Math.round(bill.deductedAmount)),
        itemsSummary: truncateStr(bill.itemsSummary || '', 5000, ''),
        note: truncateStr(bill.note || '', 2000, ''),
        isArchived: Boolean(bill.isArchived),
        status: bill.status,
      }
    );

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
          note: truncateStr(ni.note || '', 500, ''),
          category: truncateStr(ni.category, 80, 'Khác'),
          quantity: Math.max(1, Math.round(ni.quantity)),
          returnedQuantity: Math.max(0, Math.round(ni.returnedQuantity)),
          unitPrice: Math.max(0, Math.round(ni.unitPrice)),
          subtotal: Math.max(0, Math.round(ni.subtotal)),
          originalUnitPrice:
            ni.originalUnitPrice !== undefined
              ? Math.max(0, Math.round(ni.originalUnitPrice))
              : Math.max(0, Math.round(ni.unitPrice)),
          discountAmount:
            ni.discountAmount !== undefined ? Math.max(0, Math.round(ni.discountAmount)) : 0,
          discountPercent:
            ni.discountPercent !== undefined ? Math.max(0, Math.round(ni.discountPercent)) : 0,
          isDiscountEligible: ni.isDiscountEligible !== false,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'bill_items', ni.id), {
          ownerId: getFirestoreOwnerUid(cleanOwnerId),
          billId: bill.id,
          billDate: ni.billDate,
          productName: truncateStr(ni.productName, 150, 'Món ăn'),
          note: truncateStr(ni.note || '', 500, ''),
          category: truncateStr(ni.category, 80, 'Khác'),
          quantity: Math.max(1, Math.round(ni.quantity)),
          returnedQuantity: Math.max(0, Math.round(ni.returnedQuantity)),
          unitPrice: Math.max(0, Math.round(ni.unitPrice)),
          subtotal: Math.max(0, Math.round(ni.subtotal)),
          originalUnitPrice:
            ni.originalUnitPrice !== undefined
              ? Math.max(0, Math.round(ni.originalUnitPrice))
              : Math.max(0, Math.round(ni.unitPrice)),
          discountAmount:
            ni.discountAmount !== undefined ? Math.max(0, Math.round(ni.discountAmount)) : 0,
          discountPercent:
            ni.discountPercent !== undefined ? Math.max(0, Math.round(ni.discountPercent)) : 0,
          isDiscountEligible: ni.isDiscountEligible !== false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bills/${bill.id}`);
  }
}

export async function toggleBillArchiveStatusInCloud(
  ownerId: string,
  bill: BillRecord,
  nextIsArchived: boolean
): Promise<BillRecord> {
  const cleanOwnerId = sanitizeId(ownerId);
  const now = Date.now();
  const updatedBill: BillRecord = {
    ...bill,
    isArchived: Boolean(nextIsArchived),
    updatedAtMs: now,
  };

  await syncToRtdbSafe(`workspaces/${cleanOwnerId}/bills/${bill.id}`, updatedBill);

  if (isFirestoreCloudActive()) {
    try {
      await updateDoc(doc(db, 'bills', bill.id), {
        isArchived: Boolean(nextIsArchived),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bills/${bill.id}`);
    }
  }

  return updatedBill;
}

export async function deleteBillsBatchFromCloud(
  ownerId: string,
  billIds: string[],
  billItemsToDelete: BillItemRecord[],
  deductionsToDelete: DeductionRecord[],
  returnsToDelete: ReturnRecord[] = [],
  updatedProducts?: ProductRecord[],
  updatedDebtors?: string[]
): Promise<void> {
  const cleanOwnerId = sanitizeId(ownerId);
  markBillsDeletedLocally(billIds);

  for (const bi of billItemsToDelete) {
    removeFromRtdbSafe(`workspaces/${cleanOwnerId}/bill_items/${bi.id}`);
  }
  for (const d of deductionsToDelete) {
    removeFromRtdbSafe(`workspaces/${cleanOwnerId}/deductions/${d.id}`);
  }
  for (const r of returnsToDelete) {
    removeFromRtdbSafe(`workspaces/${cleanOwnerId}/returns/${r.id}`);
  }
  for (const bId of billIds) {
    removeFromRtdbSafe(`workspaces/${cleanOwnerId}/bills/${bId}`);
    removeFromRtdbSafe(`workspaces/${cleanOwnerId}/bills/${sanitizeId(bId)}`);
  }
  if (updatedDebtors) {
    syncToRtdbSafe(`workspaces/${cleanOwnerId}/debtors`, updatedDebtors);
  }

  if (!isFirestoreCloudActive()) return;

  try {
    const ops: { col: string; id: string }[] = [];
    const seen = new Set<string>();
    const pushOp = (col: string, rawId: string) => {
      if (!rawId) return;
      for (const candidateId of [rawId, sanitizeId(rawId)]) {
        if (!candidateId) continue;
        const key = `${col}/${candidateId}`;
        if (!seen.has(key)) {
          seen.add(key);
          ops.push({ col, id: candidateId });
        }
      }
    };

    for (const bi of billItemsToDelete) pushOp('bill_items', bi.id);
    for (const d of deductionsToDelete) pushOp('deductions', d.id);
    for (const r of returnsToDelete) pushOp('returns', r.id);
    for (const bId of billIds) pushOp('bills', bId);

    // Commit in atomic batches of 400 operations
    const chunkSize = 400;
    for (let i = 0; i < ops.length; i += chunkSize) {
      const chunk = ops.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const op of chunk) {
        batch.delete(doc(db, op.col, op.id));
      }
      await batch.commit();
    }

    if (updatedProducts && updatedProducts.length > 0) {
      for (const tp of updatedProducts) {
        await createOrUpdateProductInFirestore(cleanOwnerId, tp, true).catch(() => {});
      }
    }

    await saveWorkspaceMetaToFirestore({
      ownerId: cleanOwnerId,
      debtors: updatedDebtors,
      updatedBy: 'delete_bill',
    });
  } catch (error) {
    // Fallback to individual deletes if batch fails
    for (const bId of billIds) {
      await deleteDoc(doc(db, 'bills', bId)).catch(() => {});
      await deleteDoc(doc(db, 'bills', sanitizeId(bId))).catch(() => {});
    }
    for (const bi of billItemsToDelete) {
      await deleteDoc(doc(db, 'bill_items', bi.id)).catch(() => {});
      await deleteDoc(doc(db, 'bill_items', sanitizeId(bi.id))).catch(() => {});
    }
    for (const d of deductionsToDelete) {
      await deleteDoc(doc(db, 'deductions', d.id)).catch(() => {});
    }
    for (const r of returnsToDelete) {
      await deleteDoc(doc(db, 'returns', r.id)).catch(() => {});
    }
  }
}

export async function saveExpenseDeductionToCloud(params: {
  ownerId: string;
  deductionDate: string;
  expenseTitle: string;
  category: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
  billCode?: string;
  billDate?: string;
  customId?: string;
  customBillId?: string;
  note: string;
}): Promise<DeductionRecord> {
  const {
    ownerId,
    deductionDate,
    expenseTitle,
    category,
    quantity = 1,
    unitPrice,
    amount,
    billCode = 'CHI-TRONG-NGAY-V2',
    billDate,
    customId,
    customBillId,
    note,
  } = params;

  const cleanOwnerId = sanitizeId(ownerId);
  const now = Date.now();
  const safeQty = Math.max(1, Math.round(Number(quantity) || 1));
  const safeAmount = Math.max(
    0,
    Math.round(
      Number(amount) ||
        (unitPrice !== undefined ? safeQty * Number(unitPrice) : 0)
    )
  );
  const safeUnitPrice =
    unitPrice !== undefined && Number(unitPrice) > 0
      ? Math.max(0, Math.round(Number(unitPrice)))
      : safeQty > 1
      ? Math.max(0, Math.round(safeAmount / safeQty))
      : safeAmount;
  const effDate = /^\d{4}-\d{2}-\d{2}$/.test(deductionDate)
    ? deductionDate
    : getCurrentBusinessDate();

  const deductionId = sanitizeId(
    customId || `ded_${now}_${Math.random().toString(36).slice(2, 6)}`
  );

  const deduction: DeductionRecord = {
    id: deductionId,
    ownerId: cleanOwnerId,
    billId: sanitizeId(customBillId || `expense_${now}`),
    billCode: truncateStr(billCode || 'CHI-TRONG-NGAY', 64, 'CHI-TRONG-NGAY'),
    billDate: billDate && /^\d{4}-\d{2}-\d{2}$/.test(billDate) ? billDate : effDate,
    deductionDate: effDate,
    productName: truncateStr(expenseTitle, 150, 'Khoản chi trong ngày'),
    category: truncateStr(category || 'Chi phí trong ngày', 80, 'Chi phí trong ngày'),
    quantity: safeQty,
    unitPrice: safeUnitPrice,
    amount: safeAmount,
    note: truncateStr(note || expenseTitle, 500, ''),
    createdAtMs: now,
    updatedAtMs: now,
  };

  await markWorkspaceInitializedInCloud(cleanOwnerId);
  await syncToRtdbSafe(`workspaces/${cleanOwnerId}/deductions/${deduction.id}`, deduction);

  if (isFirestoreCloudActive()) {
    try {
      await setDoc(doc(db, 'deductions', deduction.id), {
        ownerId: getFirestoreOwnerUid(deduction.ownerId),
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
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `deductions/${deduction.id}`);
    }
  }

  return deduction;
}

export async function updateExpenseDeductionInCloud(params: {
  ownerId: string;
  deduction: DeductionRecord;
  updates: {
    deductionDate: string;
    expenseTitle: string;
    category: string;
    quantity?: number;
    unitPrice?: number;
    amount: number;
    note: string;
  };
  linkedReturn?: ReturnRecord;
}): Promise<{
  updatedDeduction: DeductionRecord;
  updatedReturn?: ReturnRecord;
}> {
  const { ownerId, deduction, updates, linkedReturn } = params;
  const cleanOwnerId = sanitizeId(ownerId);
  const now = Date.now();

  const effDate = /^\d{4}-\d{2}-\d{2}$/.test(updates.deductionDate)
    ? updates.deductionDate
    : deduction.deductionDate || getCurrentBusinessDate();
  const safeQty = Math.max(
    1,
    Math.round(
      updates.quantity !== undefined ? updates.quantity : deduction.quantity || 1
    )
  );
  const safeAmount = Math.max(0, Math.round(updates.amount || 0));
  const safeUnitPrice =
    updates.unitPrice !== undefined && Number(updates.unitPrice) > 0
      ? Math.max(0, Math.round(Number(updates.unitPrice)))
      : safeQty > 1
      ? Math.max(0, Math.round(safeAmount / safeQty))
      : safeAmount;
  const cleanTitle = truncateStr(
    updates.expenseTitle,
    150,
    deduction.productName || 'Khoản chi trong ngày'
  );
  const cleanCategory = truncateStr(
    updates.category || deduction.category || 'Chi phí vận hành trong ngày',
    80,
    'Chi phí vận hành trong ngày'
  );
  const cleanNote = truncateStr(updates.note ?? '', 500, '');
  const rawBillCode = String(deduction.billCode || 'CHI-TRONG-NGAY');

  const updatedDeduction: DeductionRecord = {
    ...deduction,
    ownerId: cleanOwnerId,
    billId: sanitizeId(deduction.billId || `expense_${now}`),
    billCode: truncateStr(rawBillCode, 64, 'CHI-TRONG-NGAY'),
    billDate:
      deduction.billDate && /^\d{4}-\d{2}-\d{2}$/.test(deduction.billDate)
        ? deduction.billDate
        : effDate,
    deductionDate: effDate,
    productName: cleanTitle,
    category: cleanCategory,
    quantity: safeQty,
    unitPrice: safeUnitPrice,
    amount: safeAmount,
    note: cleanNote,
    updatedAtMs: now,
  };

  let updatedReturn: ReturnRecord | undefined;
  if (linkedReturn) {
    const retQty = Math.max(1, Math.round(linkedReturn.quantity || safeQty));
    updatedReturn = {
      ...linkedReturn,
      returnDate: effDate,
      quantity: retQty,
      unitPrice: Math.max(0, Math.round(safeAmount / retQty)),
      amount: safeAmount,
      note: cleanNote || linkedReturn.note,
      updatedAtMs: now,
    };
  }

  await markWorkspaceInitializedInCloud(cleanOwnerId);
  await syncToRtdbSafe(
    `workspaces/${cleanOwnerId}/deductions/${updatedDeduction.id}`,
    updatedDeduction
  );
  if (updatedReturn) {
    await syncToRtdbSafe(
      `workspaces/${cleanOwnerId}/returns/${updatedReturn.id}`,
      updatedReturn
    );
  }

  if (isFirestoreCloudActive()) {
    try {
      const fsOwner = getFirestoreOwnerUid(cleanOwnerId);
      await upsertFirestoreDoc(
        'deductions',
        updatedDeduction.id,
        {
          ownerId: fsOwner,
          billId: updatedDeduction.billId,
          billCode: updatedDeduction.billCode,
          billDate: updatedDeduction.billDate,
          deductionDate: updatedDeduction.deductionDate,
          productName: updatedDeduction.productName,
          category: updatedDeduction.category,
          quantity: updatedDeduction.quantity,
          unitPrice: updatedDeduction.unitPrice,
          amount: updatedDeduction.amount,
          note: updatedDeduction.note,
        },
        {
          deductionDate: updatedDeduction.deductionDate,
          productName: updatedDeduction.productName,
          category: updatedDeduction.category,
          quantity: updatedDeduction.quantity,
          unitPrice: updatedDeduction.unitPrice,
          amount: updatedDeduction.amount,
          note: updatedDeduction.note,
        }
      );

      if (updatedReturn) {
        await upsertFirestoreDoc(
          'returns',
          updatedReturn.id,
          {
            ownerId: fsOwner,
            billId: sanitizeId(updatedReturn.billId || updatedDeduction.billId),
            billCode: truncateStr(updatedReturn.billCode || 'HOAN-TRA', 64, 'HOAN-TRA'),
            billDate:
              updatedReturn.billDate && /^\d{4}-\d{2}-\d{2}$/.test(updatedReturn.billDate)
                ? updatedReturn.billDate
                : effDate,
            returnDate: updatedReturn.returnDate,
            productName: truncateStr(updatedReturn.productName, 150, 'Món hoàn trả'),
            category: truncateStr(updatedReturn.category || 'Hoàn trả khách', 80, 'Hoàn trả khách'),
            quantity: updatedReturn.quantity,
            unitPrice: updatedReturn.unitPrice,
            amount: updatedReturn.amount,
            note: updatedReturn.note,
          },
          {
            returnDate: updatedReturn.returnDate,
            quantity: updatedReturn.quantity,
            unitPrice: updatedReturn.unitPrice,
            amount: updatedReturn.amount,
            note: updatedReturn.note,
          }
        );
      }
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `deductions/${updatedDeduction.id}`
      );
    }
  }

  return { updatedDeduction, updatedReturn };
}

export async function deleteDeductionsBatchFromCloud(
  ownerId: string,
  deductionIds: string[]
): Promise<void> {
  const cleanOwnerId = sanitizeId(ownerId);
  await markWorkspaceInitializedInCloud(cleanOwnerId);

  const linkedReturnIds: string[] = [];
  for (const dId of deductionIds) {
    await removeFromRtdbSafe(`workspaces/${cleanOwnerId}/deductions/${dId}`);
    if (dId.startsWith('ded_ret_')) {
      const retId = dId.replace(/^ded_/, '');
      linkedReturnIds.push(retId);
      await removeFromRtdbSafe(`workspaces/${cleanOwnerId}/returns/${retId}`);
    }
  }

  if (!isFirestoreCloudActive()) return;

  try {
    for (const dId of deductionIds) {
      await deleteDoc(doc(db, 'deductions', dId)).catch(() => {});
    }
    for (const retId of linkedReturnIds) {
      await deleteDoc(doc(db, 'returns', retId)).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'deductions');
  }
}

export async function recordItemReturnToCloud(params: {
  ownerId: string;
  bill: BillRecord;
  billItem: BillItemRecord;
  returnQty: number;
  returnDate: string;
  tableName?: string;
  note: string;
  existingProduct?: ProductRecord;
}): Promise<{
  returnRecord: ReturnRecord;
  linkedDeduction: DeductionRecord;
  updatedBill: BillRecord;
  updatedBillItem: BillItemRecord;
  updatedProduct?: ProductRecord;
}> {
  const {
    ownerId,
    bill,
    billItem,
    returnQty,
    returnDate,
    tableName,
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
  const effReturnDate = /^\d{4}-\d{2}-\d{2}$/.test(returnDate)
    ? returnDate
    : getCurrentBusinessDate();

  const cleanTableName = (
    tableName?.trim() || extractBillTableName(bill, 'Bàn lẻ')
  ).trim();

  // Nội dung khoản trừ hoàn bia/món theo đúng định dạng: Số bàn - Tên món - SL hoàn trả
  const deductionTitle = formatReturnDeductionTitle(
    cleanTableName,
    billItem.productName,
    safeQty
  );

  const rawNoteBody = (note || '').trim() || buildDefaultReturnNote(billItem);
  const noteWithTable = rawNoteBody.startsWith('[')
    ? rawNoteBody
    : `[${cleanTableName}] ${rawNoteBody}`;

  const returnId = sanitizeId(`ret_${now}_${Math.random().toString(36).slice(2, 6)}`);
  const linkedDeductionId = sanitizeId(`ded_${returnId}`);

  const returnRecord: ReturnRecord = {
    id: returnId,
    ownerId: cleanOwnerId,
    billId: bill.id,
    billCode: bill.billCode,
    billDate: bill.billDate,
    returnDate: effReturnDate,
    productName: truncateStr(billItem.productName, 150, 'Món hoàn trả'),
    category: truncateStr(billItem.category, 80, 'Khác'),
    quantity: safeQty,
    unitPrice: billItem.unitPrice,
    amount: refundAmount,
    note: truncateStr(noteWithTable, 500, ''),
    createdAtMs: now,
    updatedAtMs: now,
  };

  // Đồng bộ tự động sang Khoản trừ trong ngày (tính chung 1 dòng tiền duy nhất)
  const linkedDeduction: DeductionRecord = {
    id: linkedDeductionId,
    ownerId: cleanOwnerId,
    billId: bill.id,
    billCode: truncateStr(bill.billCode || 'HOAN-TRA', 64, 'HOAN-TRA'),
    billDate: effReturnDate,
    deductionDate: effReturnDate,
    productName: truncateStr(deductionTitle, 150, 'Hoàn bia / món thừa'),
    category: 'Hoàn bia / món thừa',
    quantity: safeQty,
    unitPrice: billItem.unitPrice,
    amount: refundAmount,
    note: truncateStr(noteWithTable, 500, ''),
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
  await syncToRtdbSafe(`workspaces/${cleanOwnerId}/returns/${returnRecord.id}`, returnRecord);
  await syncToRtdbSafe(
    `workspaces/${cleanOwnerId}/deductions/${linkedDeduction.id}`,
    linkedDeduction
  );
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
      await setDoc(doc(db, 'returns', returnRecord.id), {
        ownerId: getFirestoreOwnerUid(returnRecord.ownerId),
        billId: returnRecord.billId,
        billCode: returnRecord.billCode,
        billDate: returnRecord.billDate,
        returnDate: returnRecord.returnDate,
        productName: returnRecord.productName,
        category: returnRecord.category,
        quantity: returnRecord.quantity,
        unitPrice: returnRecord.unitPrice,
        amount: returnRecord.amount,
        note: returnRecord.note,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'deductions', linkedDeduction.id), {
        ownerId: getFirestoreOwnerUid(linkedDeduction.ownerId),
        billId: linkedDeduction.billId,
        billCode: linkedDeduction.billCode,
        billDate: linkedDeduction.billDate,
        deductionDate: linkedDeduction.deductionDate,
        productName: linkedDeduction.productName,
        category: linkedDeduction.category,
        quantity: linkedDeduction.quantity,
        unitPrice: linkedDeduction.unitPrice,
        amount: linkedDeduction.amount,
        note: linkedDeduction.note,
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
      handleFirestoreError(error, OperationType.WRITE, `returns/${returnRecord.id}`);
    }
  }

  return {
    returnRecord,
    linkedDeduction,
    updatedBill,
    updatedBillItem,
    updatedProduct,
  };
}

export async function deleteReturnsBatchFromCloud(
  ownerId: string,
  returnIds: string[]
): Promise<void> {
  const cleanOwnerId = sanitizeId(ownerId);
  await markWorkspaceInitializedInCloud(cleanOwnerId);

  for (const rId of returnIds) {
    await removeFromRtdbSafe(`workspaces/${cleanOwnerId}/returns/${rId}`);
    await removeFromRtdbSafe(`workspaces/${cleanOwnerId}/deductions/ded_${rId}`);
  }

  if (!isFirestoreCloudActive()) return;

  try {
    for (const rId of returnIds) {
      await deleteDoc(doc(db, 'returns', rId)).catch(() => {});
      await deleteDoc(doc(db, 'deductions', `ded_${rId}`)).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'returns');
  }
}

export function buildInitialInventoryData(
  todayInput?: string,
  yesterdayInput?: string
): WorkspaceInventoryData {
  const now = Date.now();
  const today = todayInput || getCurrentBusinessDate();
  const yesterday =
    yesterdayInput || new Date(now - 86400000).toISOString().slice(0, 10);

  const itemConfigs: Record<string, InventoryItemConfig> = {
    'bia tiger lùn': {
      productName: 'Bia Tiger Lùn',
      category: 'Bia',
      unit: 'Lon',
      packSize: 24,
      minStockThreshold: 24,
      costPrice: 16500,
    },
    'bia sài gòn special': {
      productName: 'Bia Sài Gòn Special',
      category: 'Bia',
      unit: 'Lon',
      packSize: 24,
      minStockThreshold: 24,
      costPrice: 13500,
    },
    'bia heineken silver': {
      productName: 'Bia Heineken Silver',
      category: 'Bia',
      unit: 'Lon',
      packSize: 24,
      minStockThreshold: 24,
      costPrice: 19000,
    },
    'bia budweiser': {
      productName: 'Bia Budweiser',
      category: 'Bia',
      unit: 'Lon',
      packSize: 24,
      minStockThreshold: 24,
      costPrice: 19500,
    },
    'bia larue': {
      productName: 'Bia Larue',
      category: 'Bia',
      unit: 'Lon',
      packSize: 24,
      minStockThreshold: 24,
      costPrice: 11500,
    },
    'nước ngọt redbull': {
      productName: 'Nước ngọt Redbull',
      category: 'Nước ngọt',
      unit: 'Lon',
      packSize: 24,
      minStockThreshold: 24,
      costPrice: 11000,
    },
    'coca cola': {
      productName: 'Coca Cola',
      category: 'Nước ngọt',
      unit: 'Lon',
      packSize: 24,
      minStockThreshold: 24,
      costPrice: 9000,
    },
    'nước ngọt pepsi': {
      productName: 'Nước ngọt Pepsi',
      category: 'Nước ngọt',
      unit: 'Lon',
      packSize: 24,
      minStockThreshold: 24,
      costPrice: 9000,
    },
    'nước suối aquafina': {
      productName: 'Nước suối Aquafina',
      category: 'Nước ngọt',
      unit: 'Chai',
      packSize: 24,
      minStockThreshold: 24,
      costPrice: 4500,
    },
    'khăn lạnh': {
      productName: 'Khăn lạnh',
      category: 'Nước ngọt',
      unit: 'Cái',
      packSize: 50,
      minStockThreshold: 50,
      costPrice: 1000,
    },
  };

  const yesterdayEntries: Record<string, DailyInventoryEntry> = {
    'bia tiger lùn': {
      openingStock: 72,
      importedQty: 40,
      damagedQty: 0,
      actualClosingStock: 72,
      updatedAtMs: now - 86400000,
    },
    'bia sài gòn special': {
      openingStock: 48,
      importedQty: 30,
      damagedQty: 0,
      actualClosingStock: 48,
      updatedAtMs: now - 86400000,
    },
    'bia heineken silver': {
      openingStock: 48,
      importedQty: 24,
      damagedQty: 0,
      actualClosingStock: 48,
      updatedAtMs: now - 86400000,
    },
    'bia budweiser': {
      openingStock: 48,
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: 48,
      updatedAtMs: now - 86400000,
    },
    'bia larue': {
      openingStock: 48,
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: 48,
      updatedAtMs: now - 86400000,
    },
    'nước ngọt redbull': {
      openingStock: 48,
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: 48,
      updatedAtMs: now - 86400000,
    },
    'coca cola': {
      openingStock: 48,
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: 48,
      updatedAtMs: now - 86400000,
    },
    'nước ngọt pepsi': {
      openingStock: 48,
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: 48,
      updatedAtMs: now - 86400000,
    },
    'nước suối aquafina': {
      openingStock: 48,
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: 48,
      updatedAtMs: now - 86400000,
    },
    'khăn lạnh': {
      openingStock: 150,
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: 150,
      updatedAtMs: now - 86400000,
    },
  };

  const todayEntries: Record<string, DailyInventoryEntry> = {
    'bia tiger lùn': {
      openingStock: 72, // 3 thùng tồn đầu ca
      importedQty: 48, // Nhập thêm 2 thùng (48 lon)
      damagedQty: 0,
      actualClosingStock: null,
      updatedAtMs: now - 3600000,
    },
    'bia sài gòn special': {
      openingStock: 48, // 2 thùng tồn đầu
      importedQty: 24, // Nhập thêm 1 thùng (24 lon)
      damagedQty: 0,
      actualClosingStock: null,
      updatedAtMs: now - 3600000,
    },
    'bia heineken silver': {
      openingStock: 48, // 2 thùng tồn đầu
      importedQty: 48, // Nhập thêm 2 thùng (48 lon)
      damagedQty: 0,
      actualClosingStock: null,
      updatedAtMs: now - 3600000,
    },
    'bia budweiser': {
      openingStock: 48, // 2 thùng tồn đầu -> bán 30 lon còn 18 lon (Cảnh báo sắp hết < 24!)
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: null,
      updatedAtMs: now - 3600000,
    },
    'bia larue': {
      openingStock: 48, // 2 thùng tồn đầu
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: null,
      updatedAtMs: now - 3600000,
    },
    'nước ngọt redbull': {
      openingStock: 48,
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: null,
      updatedAtMs: now - 3600000,
    },
    'coca cola': {
      openingStock: 48,
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: null,
      updatedAtMs: now - 3600000,
    },
    'nước ngọt pepsi': {
      openingStock: 48,
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: null,
      updatedAtMs: now - 3600000,
    },
    'nước suối aquafina': {
      openingStock: 48,
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: null,
      updatedAtMs: now - 3600000,
    },
    'khăn lạnh': {
      openingStock: 150,
      importedQty: 0,
      damagedQty: 0,
      actualClosingStock: null,
      updatedAtMs: now - 3600000,
    },
  };

  const importLogs: InventoryImportLog[] = [
    {
      id: 'inv_log_seed_1',
      date: today,
      createdAtMs: now - 14400000,
      productName: 'Bia Tiger Lùn',
      category: 'Bia',
      type: 'import',
      quantity: 48,
      packCount: 2,
      packSize: 24,
      unitCost: 16500,
      totalCost: 792000,
      supplierOrNote: 'Đại lý Bia Minh Phát giao đầu ca trưa (2 thùng)',
      createdBy: 'quanly',
    },
    {
      id: 'inv_log_seed_2',
      date: today,
      createdAtMs: now - 14000000,
      productName: 'Bia Heineken Silver',
      category: 'Bia',
      type: 'import',
      quantity: 48,
      packCount: 2,
      packSize: 24,
      unitCost: 19000,
      totalCost: 912000,
      supplierOrNote: 'Đại lý Bia Minh Phát giao đầu ca trưa (2 thùng)',
      createdBy: 'quanly',
    },
    {
      id: 'inv_log_seed_3',
      date: today,
      createdAtMs: now - 13800000,
      productName: 'Bia Sài Gòn Special',
      category: 'Bia',
      type: 'import',
      quantity: 24,
      packCount: 1,
      packSize: 24,
      unitCost: 13500,
      totalCost: 324000,
      supplierOrNote: 'Nhập bổ sung 1 thùng Sài Gòn Special',
      createdBy: 'quanly',
    },
  ];

  const deletedEmps = getDeletedEmployeeIds();
  const defaultEmployees: EmployeeRecord[] = [
    {
      id: 'emp_seed_4',
      fullName: 'Phạm Thị Mai',
      roleOrPosition: 'Nhân viên phục vụ',
      phone: '0933456789',
      baseSalary: 6000000,
      note: 'Phục vụ khu Sân vườn & VIP',
      active: true,
      hasLoginAccount: false,
      createdAtMs: now - 86400000 * 10,
      updatedAtMs: now - 86400000 * 10,
    },
    {
      id: 'emp_seed_3',
      fullName: 'Nguyễn Văn Hùng',
      roleOrPosition: 'Nhân viên phục vụ',
      phone: '0987654321',
      baseSalary: 6500000,
      note: 'Phục vụ bàn & tiếp thực ca tối',
      active: true,
      hasLoginAccount: false,
      createdAtMs: now - 86400000 * 10,
      updatedAtMs: now - 86400000 * 10,
    },
    {
      id: 'emp_seed_1',
      fullName: 'Lê Thu Hà',
      roleOrPosition: 'Thu ngân',
      phone: '0905123456',
      baseSalary: 7500000,
      note: 'Ca chính sáng & tối',
      active: true,
      hasLoginAccount: true,
      systemRole: UserRole.CASHIER,
      username: 'thungan',
      password: '123456',
      linkedStaffAccountId: 'staff_cashier',
      allowedTabs: DEFAULT_ROLE_PERMISSIONS[UserRole.CASHIER].allowedTabs,
      createdAtMs: now - 86400000 * 10,
      updatedAtMs: now - 86400000 * 10,
    },
    {
      id: 'emp_seed_2',
      fullName: 'Trần Minh Quân',
      roleOrPosition: 'Quản lý',
      phone: '0918234567',
      baseSalary: 11000000,
      note: 'Quản lý chung',
      active: true,
      hasLoginAccount: true,
      systemRole: UserRole.MANAGER,
      username: 'quanly',
      password: '123456',
      linkedStaffAccountId: 'staff_manager',
      allowedTabs: DEFAULT_ROLE_PERMISSIONS[UserRole.MANAGER].allowedTabs,
      createdAtMs: now - 86400000 * 10,
      updatedAtMs: now - 86400000 * 10,
    },
    {
      id: 'emp_seed_5',
      fullName: 'Hoàng Văn Nam',
      roleOrPosition: 'Kiểm kho',
      phone: '0977112233',
      baseSalary: 6500000,
      note: 'Phụ trách kho bia & nước ngọt',
      active: true,
      hasLoginAccount: true,
      systemRole: UserRole.INVENTORY,
      username: 'kiemkho',
      password: '123456',
      linkedStaffAccountId: 'staff_inventory',
      allowedTabs: DEFAULT_ROLE_PERMISSIONS[UserRole.INVENTORY].allowedTabs,
      createdAtMs: now - 86400000 * 10,
      updatedAtMs: now - 86400000 * 10,
    },
  ].filter(
    (e) => !deletedEmps.has(e.id) && !deletedEmps.has(sanitizeId(e.id))
  );

  return {
    trackedCategories: ['Bia', 'Nước ngọt'],
    employees: defaultEmployees,
    deletedEmployeeIds: Array.from(deletedEmps),
    salaryAdvances: [],
    itemConfigs,
    dailyEntries: {
      [yesterday]: yesterdayEntries,
      [today]: todayEntries,
    },
    importLogs,
    updatedAtMs: now,
  };
}

export function buildInitialSeedDataset(ownerId: string): {
  products: ProductRecord[];
  bills: BillRecord[];
  billItems: BillItemRecord[];
  deductions: DeductionRecord[];
  returns: ReturnRecord[];
  debtors: string[];
} {
  const cleanOwner = sanitizeId(ownerId);
  const today = getCurrentBusinessDate();
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
  const returns: ReturnRecord[] = [];

  const rawSeedBills: {
    id: string;
    code: string;
    date: string;
    checkInTime?: string;
    checkOutTime?: string;
    paymentType: PaymentType;
    debtorName: string;
    debtStatus: 'none' | 'unpaid' | 'paid';
    note: string;
    items: { name: string; note?: string; qty: number; price: number }[];
  }[] = [
    {
      id: 'bill_seed_aug20',
      code: 'HD-260820-0815',
      date: specialAugDate,
      checkInTime: '22:15',
      checkOutTime: '01:30',
      paymentType: 'cash',
      debtorName: '',
      debtStatus: 'none',
      note: 'Bàn 08 - Ca bán 20/08 (09:00 sáng 20/08 → 08:00 sáng 21/08)',
      items: [
        { name: 'Gà biển kho nghệ', note: 'làm cay', qty: 1, price: 129000 },
        {
          name: 'Combo 2',
          note: 'Cơm chiên hải sản, Càng cua trộn bò, Chip hấp thái, Cá giò kho tiêu, 1 dĩa trái cây',
          qty: 1,
          price: 459000,
        },
        { name: 'Bia Tiger Lùn', qty: 15, price: 22000 },
        { name: 'Khăn lạnh', qty: 6, price: 3000 },
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
      note: 'Bàn 05 - Ghi nợ khách quen - Hẹn cuối tuần thanh toán',
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
      note: 'Bàn VIP 2 - Ký nợ tiếp khách đối tác',
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
      note: 'Bàn 06 - Chuyển khoản QR',
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
      note: 'Bàn 09 - Tiền mặt ca tối',
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
      summaryParts.push(
        `${it.name}${it.note ? ` (${it.note})` : ''} x${it.qty}`
      );

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
        note: it.note || '',
        category: cat,
        quantity: it.qty,
        returnedQuantity: returnedQty,
        unitPrice: it.price,
        subtotal: sub,
        createdAtMs: now - bIdx * 3600000,
        updatedAtMs: now - bIdx * 3600000,
      });
    });

    const isSampleReturned = rb.id === 'bill_seed_today_1';
    const deductedAmt = isSampleReturned ? 6 * 22000 : 0;

    bills.push({
      id: rb.id,
      ownerId: cleanOwner,
      billCode: rb.code,
      billDate: rb.date,
      checkInTime: rb.checkInTime,
      checkOutTime: rb.checkOutTime,
      paymentType: rb.paymentType,
      debtorName: rb.debtorName,
      debtStatus: rb.debtStatus,
      subtotalAmount: billTotal,
      discountAmount: 0,
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

  // Khoản trừ trong ngày (gồm các khoản chi tiêu trực tiếp tại quán + khoản hoàn bia/món thừa tính chung 1 dòng tiền duy nhất)
  deductions.push(
    {
      id: 'ded_seed_expense_1',
      ownerId: cleanOwner,
      billId: 'expense_seed_1',
      billCode: 'CHI-TRONG-NGAY',
      billDate: today,
      deductionDate: today,
      productName: 'Mua bánh mì, rau sống & gia vị bếp',
      category: 'Mua bánh mì / Rau / Gia vị',
      quantity: 1,
      unitPrice: 185000,
      amount: 185000,
      note: 'Chi tiền mặt mua bánh mì chấm, rau thơm, ớt chanh đầu ca sáng',
      createdAtMs: now - 2400000,
      updatedAtMs: now - 2400000,
    },
    {
      id: 'ded_seed_expense_2',
      ownerId: cleanOwner,
      billId: 'expense_seed_2',
      billCode: 'CHI-TRONG-NGAY',
      billDate: today,
      deductionDate: today,
      productName: 'Trả tiền đá viên & than hoa nướng',
      category: 'Vật tư / Đá / Gas',
      quantity: 1,
      unitPrice: 150000,
      amount: 150000,
      note: 'Thanh toán tiền giao 10 bao đá bi và than củi',
      createdAtMs: now - 1800000,
      updatedAtMs: now - 1800000,
    },
    {
      id: 'ded_ret_seed_today_1',
      ownerId: cleanOwner,
      billId: 'bill_seed_today_1',
      billCode: 'HD-HOMNAY-01',
      billDate: today,
      deductionDate: today,
      productName: 'Bàn VIP 1 & VIP 2 - Bia Tiger Lùn - SL hoàn trả: 6',
      category: 'Hoàn bia / món thừa',
      quantity: 1,
      unitPrice: 132000,
      amount: 132000,
      note: '[Bàn VIP 1 & VIP 2] Khách trả lại 6 lon Bia Tiger Lùn chưa khui cuối buổi',
      createdAtMs: now - 1500000,
      updatedAtMs: now - 1500000,
    }
  );

  // Hoàn trả (khách trả bia thừa / món thừa - liên kết 1-1 với ded_ret_seed_today_1 thành 1 dòng tiền duy nhất)
  returns.push({
    id: 'ret_seed_today_1',
    ownerId: cleanOwner,
    billId: 'bill_seed_today_1',
    billCode: 'HD-HOMNAY-01',
    billDate: today,
    returnDate: today,
    productName: 'Bia Tiger Lùn',
    category: 'Bia',
    quantity: 6,
    unitPrice: 22000,
    amount: 132000,
    note: '[Bàn VIP 1 & VIP 2] Khách trả lại 6 lon Bia Tiger Lùn chưa khui cuối buổi',
    createdAtMs: now - 1500000,
    updatedAtMs: now - 1500000,
  });

  return {
    products: Array.from(productsMap.values()),
    bills,
    billItems,
    deductions,
    returns,
    debtors: [
      'Anh Tuấn (Đội Công Trình Số 5)',
      'Chị Lan (Văn phòng BĐS Hùng Vương)',
    ],
  };
}
