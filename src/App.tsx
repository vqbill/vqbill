import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  LayoutDashboard,
  Camera,
  Layers,
  CreditCard,
  RotateCcw,
  Package,
  Search,
  Sun,
  Moon,
  LogOut,
  Shield,
  Trash2,
  Database,
  Menu,
  X,
  CheckCircle2,
  KeyRound,
  Lock,
  Receipt,
  Cloud,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  Eye,
  EyeOff,
  Home,
  Boxes,
  UserCheck,
  Scissors,
  Wallet,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  BillRecord,
  BillItemRecord,
  ProductRecord,
  DeductionRecord,
  ReturnRecord,
  PeriodPreset,
  StaffAccount,
  UserRole,
  ROLE_LABELS,
  PAYMENT_LABELS,
  STANDARD_CATEGORIES,
  ExtractedBillItem,
  PaymentType,
  ConfirmRequestOptions,
  GeminiKeyStatus,
  ManagementTabId,
  MANAGEMENT_TABS,
  RolePermissionsMap,
  DEFAULT_ROLE_PERMISSIONS,
  getEffectiveRolePermissions,
  sanitizeTabList,
  WorkspaceInventoryData,
  DEFAULT_DEDUCTION_CATEGORIES,
  DebtPaymentRecord,
  CalendarEventNote,
  EmployeeRecord,
  SalaryAdvanceRecord,
} from './types';
import {
  formatVND,
  getPrivacyMaskMode,
  setPrivacyMaskMode,
  sanitizeId,
  truncateStr,
  getCurrentBusinessDate,
  getYesterdayBusinessDate,
  reconstructBillItemsFromSummary,
  extractBillTableName,
  extractReturnTableName,
  formatReturnDeductionTitle,
  isOwnerUseBill,
} from './utils/parser';
import {
  fetchGeminiStatus,
  saveGeminiKeyRequest,
  checkGeminiKeyRequest,
} from './services/geminiService';
import {
  DEFAULT_STAFF_ACCOUNTS,
  FIXED_ADMIN_USERNAME,
  FIXED_ADMIN_PASSWORD,
  SHARED_WORKSPACE_ID,
  WorkspaceCacheSnapshot,
  normalizeStaffAccountsWithFixedAdmin,
  buildInitialSeedDataset,
  loadLocalMirror,
  saveLocalMirror,
  fetchServerWorkspace,
  fetchServerWorkspaceVersion,
  pushWorkspaceToServer,
  fetchFirestoreWorkspaceOnce,
  syncFullSnapshotToFirestore,
  fetchRtdbWorkspaceOnce,
  saveCategoriesToCloud,
  saveDebtorsToCloud,
  saveRolePermissionsToCloud,
  saveInventoryDataToCloud,
  buildInitialInventoryData,
  renameOrReassignCategoryInCloud,
  saveStaffAccountToFirebase,
  deleteStaffAccountsFromFirebase,
  createOrUpdateProductInFirestore,
  deleteProductsBatchFromFirestore,
  saveNewBillToCloud,
  updateBillAndItemsInCloud,
  deleteBillsBatchFromCloud,
  saveExpenseDeductionToCloud,
  updateExpenseDeductionInCloud,
  deleteDeductionsBatchFromCloud,
  recordItemReturnToCloud,
  deleteReturnsBatchFromCloud,
  getDeletedBillIds,
  markBillsDeletedLocally,
  getDeletedDebtors,
  markDebtorsDeletedLocally,
  unmarkDebtorDeletedLocally,
  getDeletedEmployeeIds,
  markEmployeesDeletedLocally,
  unmarkEmployeeDeletedLocally,
  getDeletedStaffAccountIds,
  markStaffAccountsDeletedLocally,
  unmarkStaffAccountDeletedLocally,
  dedupeRecordsById,
} from './services/dataService';
import { AuthScreen } from './components/AuthScreen';
import { HomeLaunchpadTab } from './components/HomeLaunchpadTab';
import { LunarCalendarFloatingWidget } from './components/LunarCalendarFloatingWidget';
import { RevenueColumnChart, DailyRevenuePoint } from './components/RevenueCharts';
import { OcrScannerTab } from './components/OcrScannerTab';
import { CategoryAnalyticsTab } from './components/CategoryAnalyticsTab';
import { BeverageInventoryTab } from './components/BeverageInventoryTab';
import { OwnerConsumptionTab } from './components/OwnerConsumptionTab';
import { DebtManagerTab } from './components/DebtManagerTab';
import { ReturnsDeductionsTab } from './components/ReturnsDeductionsTab';
import { SalaryAdvanceTab, EmployeeUpsertInput } from './components/SalaryAdvanceTab';
import { ProductCatalogTab } from './components/ProductCatalogTab';
import { AccountsManagerTab } from './components/AccountsManagerTab';
import { BillEditModal } from './components/BillEditModal';
import { BillCheckModal } from './components/BillCheckModal';
import { BillSplitMergeModal } from './components/BillSplitMergeModal';
import { ConfirmDialogModal } from './components/ConfirmDialogModal';
import { GeminiKeyBar } from './components/GeminiKeyBar';
import { PWAInstallButton } from './components/PWAInstallButton';

type ActiveTab = ManagementTabId;

export default function App() {
  const todayStr = getCurrentBusinessDate();
  const yesterdayStr = getYesterdayBusinessDate();

  // Theme State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('vqbill_theme');
    return saved ? saved === 'dark' : false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('vqbill_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('vqbill_theme', 'light');
    }
  }, [darkMode]);

  // Auth & RBAC State
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Unified restaurant workspace ID so all devices, browsers, staff accounts, and Google Auth share the same cloud data
  const ownerId = SHARED_WORKSPACE_ID;

  // Load initial snapshot from local mirror or seed dataset
  const initialWorkspaceData = useMemo(() => {
    const cached = loadLocalMirror(ownerId);
    if (cached && cached.initialized) {
      return {
        version: Number(cached.version) || 0,
        updatedAtMs: Number(cached.updatedAtMs) || 0,
        cloudSyncedOnce: Boolean(cached.cloudSyncedOnce),
        initialized: true,
        categories:
          cached.categories && cached.categories.length > 0
            ? cached.categories
            : Array.from(STANDARD_CATEGORIES),
        rolePermissions: cached.rolePermissions || DEFAULT_ROLE_PERMISSIONS,
        inventoryData:
          cached.inventoryData ||
          buildInitialInventoryData(todayStr, yesterdayStr),
        products: cached.products || [],
        bills: cached.bills || [],
        billItems: cached.billItems || [],
        deductions: cached.deductions || [],
        returns: cached.returns || [],
        debtors: cached.debtors || [],
        staffAccounts: normalizeStaffAccountsWithFixedAdmin(
          cached.staffAccounts
        ),
      };
    }
    const seed = buildInitialSeedDataset(ownerId);
    return {
      version: 0,
      updatedAtMs: 0,
      cloudSyncedOnce: false,
      initialized: false,
      categories: Array.from(STANDARD_CATEGORIES),
      rolePermissions: DEFAULT_ROLE_PERMISSIONS,
      inventoryData: buildInitialInventoryData(todayStr, yesterdayStr),
      products: seed.products,
      bills: seed.bills,
      billItems: seed.billItems,
      deductions: seed.deductions,
      returns: seed.returns,
      debtors: seed.debtors,
      staffAccounts: normalizeStaffAccountsWithFixedAdmin(DEFAULT_STAFF_ACCOUNTS),
    };
  }, [ownerId]);

  const [workspaceInitialized, setWorkspaceInitialized] = useState<boolean>(
    initialWorkspaceData.initialized
  );
  const [cloudSyncedOnce, setCloudSyncedOnce] = useState<boolean>(
    initialWorkspaceData.cloudSyncedOnce
  );
  const [cloudSyncStatus, setCloudSyncStatus] = useState<
    'connecting' | 'synced' | 'syncing' | 'offline'
  >('connecting');
  const [cloudVersion, setCloudVersion] = useState<number>(
    initialWorkspaceData.version
  );
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<number | null>(
    initialWorkspaceData.updatedAtMs || null
  );
  const [showCloudSyncModal, setShowCloudSyncModal] = useState<boolean>(false);

  const lastKnownServerVersionRef = useRef<number>(initialWorkspaceData.version);
  const isApplyingRemoteSnapshotRef = useRef<boolean>(false);
  const initialCloudHandshakeDoneRef = useRef<boolean>(false);
  const isPushingToServerRef = useRef<boolean>(false);
  const [categories, setCategories] = useState<string[]>(
    initialWorkspaceData.categories
  );
  const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap>(
    initialWorkspaceData.rolePermissions
  );
  const [inventoryData, setInventoryData] = useState<WorkspaceInventoryData>(
    initialWorkspaceData.inventoryData
  );
  const [products, setProducts] = useState<ProductRecord[]>(
    initialWorkspaceData.products
  );
  const [bills, setBills] = useState<BillRecord[]>(initialWorkspaceData.bills);
  const [billItems, setBillItems] = useState<BillItemRecord[]>(
    initialWorkspaceData.billItems
  );
  const [deductions, setDeductions] = useState<DeductionRecord[]>(
    initialWorkspaceData.deductions
  );
  const [returns, setReturns] = useState<ReturnRecord[]>(
    initialWorkspaceData.returns
  );
  const [debtors, setDebtors] = useState<string[]>(
    initialWorkspaceData.debtors
  );
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>(
    initialWorkspaceData.staffAccounts
  );

  const [loggedInStaff, setLoggedInStaff] = useState<StaffAccount | null>(() => {
    try {
      const saved = localStorage.getItem('vqbill_active_staff');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return null;
  });

  // Gemini API Key State & Status
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem('vqbill_gemini_api_key') || '';
  });
  const [geminiKeyStatus, setGeminiKeyStatus] = useState<GeminiKeyStatus>({
    configured: false,
    source: 'none',
    maskedKey: '',
  });
  const [isCheckingGeminiKey, setIsCheckingGeminiKey] = useState<boolean>(false);
  const [showGeminiKeyModal, setShowGeminiKeyModal] = useState<boolean>(false);

  // Confirm Dialog State (Global Popup Confirm for all Add/Edit/Delete actions)
  const [confirmConfig, setConfirmConfig] = useState<ConfirmRequestOptions | null>(
    null
  );

  const requestConfirm = (opts: ConfirmRequestOptions) => {
    setConfirmConfig(opts);
  };

  // Active Navigation Tab with URL Path & Refresh (F5) Persistence
  const TAB_TO_PATH: Record<ActiveTab, string> = useMemo(
    () => ({
      home: '/trang-chu',
      dashboard: '/tong-quan',
      ocr: '/nhap-bill',
      categories: '/danh-muc',
      inventory: '/kho-do-uong',
      owner_use: '/chu-quan-su-dung',
      debts: '/cong-no',
      deductions: '/khoan-tru',
      returns: '/hoan-tra',
      salary_advances: '/ung-luong',
      products: '/thuc-don',
      accounts: '/tai-khoan',
    }),
    []
  );

  const resolveTabFromLocation = useCallback((): ActiveTab => {
    const validTabs: ActiveTab[] = [
      'home',
      'dashboard',
      'ocr',
      'categories',
      'inventory',
      'owner_use',
      'debts',
      'deductions',
      'returns',
      'salary_advances',
      'products',
      'accounts',
    ];
    try {
      const cleanPath = window.location.pathname.replace(/\/+$/, '') || '/';
      for (const [tabId, pathStr] of Object.entries(TAB_TO_PATH)) {
        if (cleanPath === pathStr || cleanPath === `/${tabId}`) {
          return tabId as ActiveTab;
        }
      }
      const hashVal = window.location.hash.replace(/^#\/?/, '').trim();
      if (validTabs.includes(hashVal as ActiveTab)) {
        return hashVal as ActiveTab;
      }
      const savedTab = localStorage.getItem('vqbill_active_tab');
      if (savedTab && validTabs.includes(savedTab as ActiveTab)) {
        return savedTab as ActiveTab;
      }
    } catch {
      // ignore
    }
    return 'home';
  }, [TAB_TO_PATH]);

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => resolveTabFromLocation());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hideMoney, setHideMoney] = useState<boolean>(() => getPrivacyMaskMode());

  const handleToggleHideMoney = useCallback(() => {
    setHideMoney((prev) => {
      const next = !prev;
      setPrivacyMaskMode(next);
      return next;
    });
  }, []);

  // Sync activeTab to URL path and localStorage so F5/Refresh stays on the current tab
  useEffect(() => {
    try {
      localStorage.setItem('vqbill_active_tab', activeTab);
      const targetPath = TAB_TO_PATH[activeTab] || '/trang-chu';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tab: activeTab }, '', targetPath);
      }
    } catch {
      // ignore
    }
  }, [activeTab, TAB_TO_PATH]);

  // Listen to browser Back / Forward buttons
  useEffect(() => {
    const onPopState = () => {
      const nextTab = resolveTabFromLocation();
      setActiveTab(nextTab);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [resolveTabFromLocation]);

  // Settings
  const [autoAddProducts, setAutoAddProducts] = useState<boolean>(true);

  // Filter & Search State on Dashboard
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('2026-08-01');
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);
  const [paymentFilter, setPaymentFilter] = useState<
    'all' | 'cash' | 'transfer' | 'debt' | 'has_return'
  >('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Sub-tab inside Financial Summary
  const [netFormulaTab, setNetFormulaTab] = useState<'net_summary' | 'formula_explain'>(
    'net_summary'
  );

  // Modals & Cross-tab selections
  const [inspectingBill, setInspectingBill] = useState<BillRecord | null>(null);
  const [editingBill, setEditingBill] = useState<BillRecord | null>(null);
  const [splitMergeBill, setSplitMergeBill] = useState<BillRecord | null>(null);
  const [preselectedReturnBillId, setPreselectedReturnBillId] = useState<string | null>(
    null
  );
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastBanner(msg);
    setTimeout(() => setToastBanner(null), 4000);
  };

  // Resolve live staff account object so permission updates apply immediately
  const currentStaffAccount = useMemo<StaffAccount | null>(() => {
    if (!loggedInStaff) return null;
    const found = staffAccounts.find(
      (a) =>
        a.id === loggedInStaff.id ||
        a.username.toLowerCase() === loggedInStaff.username.toLowerCase()
    );
    return found || loggedInStaff;
  }, [loggedInStaff, staffAccounts]);

  // Effective Role & Account Permissions (strictly controls which management tabs can be accessed)
  const effectivePermissions = useMemo(() => {
    return getEffectiveRolePermissions(currentStaffAccount, rolePermissions);
  }, [currentStaffAccount, rolePermissions]);

  const allowedTabs = effectivePermissions.allowedTabs;
  const activeRole = currentStaffAccount?.role || UserRole.VIEWER;
  const isAdminUser =
    activeRole === UserRole.ADMIN || allowedTabs.includes('accounts');
  const isCurrentTabReadOnly =
    !isAdminUser && effectivePermissions.readOnlyTabs.includes(activeTab);
  const canWrite =
    isAdminUser || (!isCurrentTabReadOnly && effectivePermissions.canWrite);
  const canDelete =
    isAdminUser || (!isCurrentTabReadOnly && effectivePermissions.canDelete);

  // Enforce activeTab to always be within allowedTabs for the logged-in account
  useEffect(() => {
    if (!currentStaffAccount) return;
    if (!allowedTabs.includes(activeTab)) {
      const fallbackTab = allowedTabs[0] || 'dashboard';
      setActiveTab(fallbackTab);
    }
  }, [currentStaffAccount, allowedTabs, activeTab]);

  // Safe tab navigation helper that checks allowedTabs
  const handleSelectTab = (targetTab: ActiveTab) => {
    if (!allowedTabs.includes(targetTab)) {
      const tabMeta = MANAGEMENT_TABS.find((t) => t.id === targetTab);
      showToast(
        `Tài khoản @${currentStaffAccount?.username} không được phân quyền truy cập mục "${
          tabMeta?.label || targetTab
        }".`
      );
      return;
    }
    setActiveTab(targetTab);
  };

  // Sync Gemini Key on boot with backend or static fallback (Netlify / Vercel safe)
  useEffect(() => {
    const syncInitialGeminiKey = async () => {
      try {
        const status = await fetchGeminiStatus(geminiApiKey);
        setGeminiKeyStatus(status);
      } catch {
        // Ignore network errors on initial status check
      }
    };
    syncInitialGeminiKey();
  }, []);

  const handleSaveGeminiKey = async (newKey: string) => {
    const clean = newKey.trim();
    setGeminiApiKey(clean);
    try {
      if (clean) {
        localStorage.setItem('vqbill_gemini_api_key', clean);
      } else {
        localStorage.removeItem('vqbill_gemini_api_key');
      }
      const status = await saveGeminiKeyRequest(clean);
      setGeminiKeyStatus(status);
      showToast(
        clean
          ? 'Đã lưu Gemini API Key! Bạn có thể bấm Check Gemini Key để xác thực.'
          : 'Đã xóa Gemini API Key tùy chỉnh.'
      );
    } catch (err: any) {
      showToast(err?.message || 'Lỗi khi lưu Gemini Key.');
    }
  };

  const handleCheckGeminiKey = async (
    keyToTest?: string
  ): Promise<{ ok: boolean; message: string }> => {
    const candidate =
      typeof keyToTest === 'string' ? keyToTest.trim() : geminiApiKey.trim();
    setIsCheckingGeminiKey(true);
    try {
      const result = await checkGeminiKeyRequest(candidate);
      setGeminiKeyStatus(result.status);
      if (result.ok && candidate) {
        setGeminiApiKey(candidate);
        localStorage.setItem('vqbill_gemini_api_key', candidate);
      }
      if (result.ok) {
        showToast(result.message);
      }
      return { ok: result.ok, message: result.message };
    } catch (err: any) {
      const errMsg = err?.message || 'Không thể kiểm tra Gemini Key lúc này.';
      setGeminiKeyStatus((prev) => ({
        ...prev,
        verified: false,
        error: errMsg,
      }));
      return { ok: false, message: errMsg };
    } finally {
      setIsCheckingGeminiKey(false);
    }
  };

  const handleClearGeminiKey = async () => {
    await handleSaveGeminiKey('');
  };

  const markRemoteStateUpdate = useCallback(() => {
    isApplyingRemoteSnapshotRef.current = true;
    setTimeout(() => {
      isApplyingRemoteSnapshotRef.current = false;
    }, 250);
  }, []);

  // Apply a remote Cloud Workspace snapshot cleanly without triggering a push loop
  const applyRemoteWorkspaceSnapshot = useCallback(
    (remoteSnap: Partial<WorkspaceCacheSnapshot>, markSyncedOnce = true) => {
      markRemoteStateUpdate();
      const nextVersion =
        Number(remoteSnap.version) || lastKnownServerVersionRef.current || 1;
      const nextUpdatedAt = Number(remoteSnap.updatedAtMs) || Date.now();
      lastKnownServerVersionRef.current = Math.max(
        lastKnownServerVersionRef.current,
        nextVersion
      );
      setCloudVersion(lastKnownServerVersionRef.current);
      setLastCloudSyncAt(nextUpdatedAt);
      if (markSyncedOnce) {
        setCloudSyncedOnce(true);
      }

      const nextInit = Boolean(remoteSnap.initialized ?? true);
      const nextCats =
        remoteSnap.categories && remoteSnap.categories.length > 0
          ? remoteSnap.categories
          : Array.from(STANDARD_CATEGORIES);
      const nextRoles = {
        ...DEFAULT_ROLE_PERMISSIONS,
        ...(remoteSnap.rolePermissions || {}),
      };
      const nextProducts = dedupeRecordsById(
        Array.isArray(remoteSnap.products) ? remoteSnap.products : []
      );
      const nextBills = dedupeRecordsById(
        Array.isArray(remoteSnap.bills) ? remoteSnap.bills : []
      );
      const nextBillItems = dedupeRecordsById(
        Array.isArray(remoteSnap.billItems) ? remoteSnap.billItems : []
      );
      const nextDeductions = dedupeRecordsById(
        Array.isArray(remoteSnap.deductions) ? remoteSnap.deductions : []
      );
      const nextReturns = dedupeRecordsById(
        Array.isArray(remoteSnap.returns) ? remoteSnap.returns : []
      );
      const nextDebtors = Array.isArray(remoteSnap.debtors)
        ? remoteSnap.debtors
        : [];
      const nextStaff = normalizeStaffAccountsWithFixedAdmin(
        remoteSnap.staffAccounts
      );

      setWorkspaceInitialized(nextInit);
      setCategories(nextCats);
      setRolePermissions(nextRoles);
      if (remoteSnap.inventoryData) {
        const incomingInv = remoteSnap.inventoryData;
        if (
          Array.isArray(incomingInv.deletedEmployeeIds) &&
          incomingInv.deletedEmployeeIds.length > 0
        ) {
          markEmployeesDeletedLocally(incomingInv.deletedEmployeeIds);
        }
        const delEmpSet = getDeletedEmployeeIds();
        setInventoryData((prev) => {
          if ((prev.updatedAtMs || 0) > (incomingInv.updatedAtMs || 0)) {
            return prev;
          }
          return {
            ...incomingInv,
            deletedEmployeeIds: Array.from(delEmpSet),
            employees: Array.isArray(incomingInv.employees)
              ? incomingInv.employees.filter(
                  (e) => !delEmpSet.has(e.id) && !delEmpSet.has(sanitizeId(e.id))
                )
              : prev.employees,
          };
        });
      }
      setProducts(nextProducts);
      setBills(nextBills);
      setBillItems(nextBillItems);
      setDeductions(nextDeductions);
      setReturns(nextReturns);
      setDebtors(nextDebtors);
      setStaffAccounts(nextStaff);

      saveLocalMirror(ownerId, {
        version: lastKnownServerVersionRef.current,
        updatedAtMs: nextUpdatedAt,
        cloudSyncedOnce: markSyncedOnce,
        initialized: nextInit,
        categories: nextCats,
        rolePermissions: nextRoles,
        inventoryData: remoteSnap.inventoryData || inventoryData,
        products: nextProducts,
        bills: nextBills,
        billItems: nextBillItems,
        deductions: nextDeductions,
        returns: nextReturns,
        debtors: nextDebtors,
        staffAccounts: nextStaff,
      });
    },
    [ownerId, markRemoteStateUpdate]
  );

  // Initial Cloud Handshake on Boot (syncs across all browsers & devices via Firebase Firestore + Cloud Server)
  useEffect(() => {
    let mounted = true;
    const performInitialCloudSync = async () => {
      setCloudSyncStatus('connecting');
      const localCached = loadLocalMirror(ownerId);
      const [firestoreSnap, serverSnap] = await Promise.all([
        fetchFirestoreWorkspaceOnce(),
        fetchServerWorkspace(),
      ]);

      if (!mounted) return;

      // Determine if localCached has unsynced real bills that aren't in Firestore yet
      const deletedBillsSet = getDeletedBillIds();
      const fsBillIds = new Set((firestoreSnap?.bills || []).map((b) => b.id));
      const srvBillIds = new Set((serverSnap?.bills || []).map((b) => b.id));
      const localUnsyncedBills = localCached?.cloudSyncedOnce
        ? []
        : (localCached?.bills || []).filter(
            (b) =>
              !b.id.startsWith('bill_seed_') &&
              !fsBillIds.has(b.id) &&
              !srvBillIds.has(b.id) &&
              !deletedBillsSet.has(b.id)
          );

      // Pick the best remote source based on latest version / updatedAtMs
      const fsVer = Number(firestoreSnap?.version) || 0;
      const srvVer = Number(serverSnap?.version) || 0;
      const rawBestRemote =
        firestoreSnap && serverSnap?.initialized
          ? srvVer > fsVer
            ? serverSnap
            : firestoreSnap
          : firestoreSnap || serverSnap;

      // Ensure deductions take the freshest updatedAtMs between Firestore and Server
      const bestRemote = rawBestRemote
        ? (() => {
            if (firestoreSnap?.deductions && serverSnap?.deductions) {
              const fsDedMap = new Map(
                firestoreSnap.deductions.map((d) => [d.id, d])
              );
              const srvDedMap = new Map(
                serverSnap.deductions.map((d) => [d.id, d])
              );
              const baseDeds = rawBestRemote.deductions || [];
              const mergedDeds = baseDeds.map((d) => {
                const f = fsDedMap.get(d.id);
                const s = srvDedMap.get(d.id);
                if (f && s) {
                  if ((f.updatedAtMs || 0) > (s.updatedAtMs || 0)) return f;
                  if ((s.updatedAtMs || 0) > (f.updatedAtMs || 0)) return s;
                  if ((f.quantity || 1) > 1 && (s.quantity || 1) === 1) return f;
                  if ((s.quantity || 1) > 1 && (f.quantity || 1) === 1) return s;
                }
                return d;
              });
              return { ...rawBestRemote, deductions: mergedDeds };
            }
            return rawBestRemote;
          })()
        : null;

      if (bestRemote && bestRemote.initialized) {
        if (localCached?.initialized && localUnsyncedBills.length > 0) {
          // Merge local unsynced bills into remote snapshot and push to both Firestore & Server
          const mergedBillsMap = new Map<string, BillRecord>();
          for (const b of bestRemote.bills || []) mergedBillsMap.set(b.id, b);
          for (const b of localCached.bills || []) {
            if (!b.id.startsWith('bill_seed_') || mergedBillsMap.size === 0) {
              mergedBillsMap.set(b.id, b);
            }
          }

          const mergedItemsMap = new Map<string, BillItemRecord>();
          for (const it of bestRemote.billItems || []) mergedItemsMap.set(it.id, it);
          for (const it of localCached.billItems || []) {
            if (mergedBillsMap.has(it.billId)) {
              mergedItemsMap.set(it.id, it);
            }
          }

          const mergedProdsMap = new Map<string, ProductRecord>();
          for (const p of bestRemote.products || []) mergedProdsMap.set(p.id, p);
          for (const p of localCached.products || []) {
            if (!mergedProdsMap.has(p.id)) mergedProdsMap.set(p.id, p);
          }

          const mergedDedsMap = new Map<string, DeductionRecord>();
          for (const d of bestRemote.deductions || []) mergedDedsMap.set(d.id, d);
          for (const d of localCached.deductions || []) mergedDedsMap.set(d.id, d);

          const mergedRetsMap = new Map<string, ReturnRecord>();
          for (const r of bestRemote.returns || []) mergedRetsMap.set(r.id, r);
          for (const r of localCached.returns || []) mergedRetsMap.set(r.id, r);

          const mergedSnapshot: WorkspaceCacheSnapshot = {
            version: Math.max(bestRemote.version || 1, localCached.version || 1) + 1,
            updatedAtMs: Date.now(),
            cloudSyncedOnce: true,
            initialized: true,
            categories: Array.from(
              new Set([
                ...(bestRemote.categories || STANDARD_CATEGORIES),
                ...(localCached.categories || []),
              ])
            ),
            debtors: Array.from(
              new Set([
                ...(bestRemote.debtors || []),
                ...(localCached.debtors || []),
              ])
            ),
            rolePermissions:
              localCached.rolePermissions ||
              bestRemote.rolePermissions ||
              DEFAULT_ROLE_PERMISSIONS,
            inventoryData:
              localCached.inventoryData ||
              bestRemote.inventoryData ||
              buildInitialInventoryData(todayStr, yesterdayStr),
            products: Array.from(mergedProdsMap.values()),
            bills: Array.from(mergedBillsMap.values()),
            billItems: Array.from(mergedItemsMap.values()),
            deductions: Array.from(mergedDedsMap.values()),
            returns: Array.from(mergedRetsMap.values()),
            staffAccounts: normalizeStaffAccountsWithFixedAdmin(
              localCached.staffAccounts || bestRemote.staffAccounts
            ),
          };

          applyRemoteWorkspaceSnapshot(mergedSnapshot, true);
          await Promise.all([
            syncFullSnapshotToFirestore(
              mergedSnapshot,
              loggedInStaff?.username || 'migration'
            ),
            pushWorkspaceToServer(
              mergedSnapshot,
              'replace',
              loggedInStaff?.username || 'migration'
            ),
          ]);
        } else {
          applyRemoteWorkspaceSnapshot(bestRemote, true);
          // Ensure Firestore has the data if bestRemote came from serverSnap while firestoreSnap was empty
          if (!firestoreSnap && bestRemote.bills.length > 0) {
            await syncFullSnapshotToFirestore(bestRemote, 'server_to_firestore');
          }
          // Ensure Server has the data if bestRemote came from Firestore
          if (firestoreSnap && (!serverSnap || !serverSnap.initialized)) {
            await pushWorkspaceToServer(bestRemote, 'replace', 'firestore_to_server');
          }
        }

        if (mounted) {
          initialCloudHandshakeDoneRef.current = true;
          setCloudSyncStatus('synced');
          if (!lastCloudSyncAt) {
            setLastCloudSyncAt(Date.now());
          }
        }
      } else if (localCached?.initialized) {
        // Neither Firestore nor Server had initialized data yet, push local data up to both
        await Promise.all([
          syncFullSnapshotToFirestore(
            localCached,
            loggedInStaff?.username || 'initial_push'
          ),
          pushWorkspaceToServer(
            localCached,
            'replace',
            loggedInStaff?.username || 'initial_push'
          ),
        ]);
        if (mounted) {
          applyRemoteWorkspaceSnapshot(
            { ...localCached, version: (localCached.version || 0) + 1 },
            true
          );
          initialCloudHandshakeDoneRef.current = true;
          setCloudSyncStatus('synced');
        }
      } else {
        // Check RTDB fallback or initialize seed data to Firestore & Server
        const rtdbSnap = await fetchRtdbWorkspaceOnce(ownerId);
        if (mounted && rtdbSnap?.initialized) {
          const fullRtdb: WorkspaceCacheSnapshot = {
            version: 1,
            updatedAtMs: Date.now(),
            cloudSyncedOnce: true,
            initialized: true,
            categories: rtdbSnap.categories || Array.from(STANDARD_CATEGORIES),
            rolePermissions: {
              ...DEFAULT_ROLE_PERMISSIONS,
              ...(rtdbSnap.rolePermissions || {}),
            },
            products: rtdbSnap.products || [],
            bills: rtdbSnap.bills || [],
            billItems: rtdbSnap.billItems || [],
            deductions: rtdbSnap.deductions || [],
            returns: rtdbSnap.returns || [],
            debtors: rtdbSnap.debtors || [],
            staffAccounts: normalizeStaffAccountsWithFixedAdmin(
              rtdbSnap.staffAccounts
            ),
          };
          applyRemoteWorkspaceSnapshot(fullRtdb, true);
          await Promise.all([
            syncFullSnapshotToFirestore(fullRtdb, 'rtdb_migration'),
            pushWorkspaceToServer(fullRtdb, 'replace', 'rtdb_migration'),
          ]);
        }
        if (mounted) {
          initialCloudHandshakeDoneRef.current = true;
          setCloudSyncStatus('synced');
        }
      }
    };

    performInitialCloudSync();
    return () => {
      mounted = false;
    };
  }, [ownerId, applyRemoteWorkspaceSnapshot]);

  // Keep local mirror AND Cloud Server synced whenever data changes locally
  useEffect(() => {
    const currentSnapshot: WorkspaceCacheSnapshot = {
      version: lastKnownServerVersionRef.current,
      updatedAtMs: Date.now(),
      cloudSyncedOnce,
      initialized: workspaceInitialized,
      categories,
      rolePermissions,
      inventoryData,
      products,
      bills,
      billItems,
      deductions,
      returns,
      debtors,
      staffAccounts,
    };

    saveLocalMirror(ownerId, currentSnapshot);

    if (isApplyingRemoteSnapshotRef.current) {
      return;
    }

    if (!initialCloudHandshakeDoneRef.current || !workspaceInitialized) {
      return;
    }

    let cancelled = false;
    isPushingToServerRef.current = true;
    setCloudSyncStatus('syncing');

    pushWorkspaceToServer(
      currentSnapshot,
      'replace',
      currentStaffAccount?.username || 'user'
    )
      .then((res) => {
        if (cancelled) return;
        if (res && res.ok) {
          lastKnownServerVersionRef.current = Math.max(
            lastKnownServerVersionRef.current,
            res.version
          );
          setCloudVersion(res.version);
          setLastCloudSyncAt(res.updatedAtMs || Date.now());
          setCloudSyncedOnce(true);
          setCloudSyncStatus('synced');
          saveLocalMirror(ownerId, {
            ...currentSnapshot,
            version: res.version,
            updatedAtMs: res.updatedAtMs || Date.now(),
            cloudSyncedOnce: true,
          });
        } else {
          setCloudSyncStatus('offline');
        }
      })
      .finally(() => {
        isPushingToServerRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [
    ownerId,
    workspaceInitialized,
    categories,
    rolePermissions,
    inventoryData,
    products,
    bills,
    billItems,
    deductions,
    returns,
    debtors,
    staffAccounts,
  ]);

  // Real-Time Multi-Device & Multi-Browser Sync (Firestore + Server)
  const handlePullFromCloud = useCallback(
    async (manualNotify = false) => {
      if (isPushingToServerRef.current && !manualNotify) return;
      if (manualNotify) {
        setCloudSyncStatus('syncing');
      }

      if (manualNotify) {
        const [fsSnap, srvSnap] = await Promise.all([
          fetchFirestoreWorkspaceOnce(),
          fetchServerWorkspace(),
        ]);
        const fsVer = Number(fsSnap?.version) || 0;
        const srvVer = Number(srvSnap?.version) || 0;
        const bestSnap =
          fsSnap && srvSnap?.initialized
            ? srvVer > fsVer
              ? srvSnap
              : fsSnap
            : srvSnap?.initialized
            ? srvSnap
            : fsSnap;

        if (bestSnap && bestSnap.initialized) {
          applyRemoteWorkspaceSnapshot(bestSnap, true);
          setCloudSyncStatus('synced');
          showToast(
            `Đã đồng bộ dữ liệu Cloud mới nhất (${
              bestSnap.bills?.length || 0
            } bill, ${bestSnap.products?.length || 0} món)!`
          );
          return;
        }
      }

      const verInfo = await fetchServerWorkspaceVersion();
      if (!verInfo) {
        if (manualNotify) {
          setCloudSyncStatus('synced');
          showToast('Đã đồng bộ trực tiếp với Firebase Cloud!');
        }
        return;
      }

      if (
        verInfo.initialized &&
        (verInfo.version > lastKnownServerVersionRef.current || manualNotify)
      ) {
        const remoteSnap = await fetchServerWorkspace();
        if (remoteSnap && remoteSnap.initialized) {
          applyRemoteWorkspaceSnapshot(remoteSnap, true);
          setCloudSyncStatus('synced');
          if (manualNotify) {
            showToast(
              `Đã đồng bộ dữ liệu Cloud mới nhất (${
                remoteSnap.bills?.length || 0
              } bill, ${remoteSnap.products?.length || 0} món)!`
            );
          }
          return;
        }
      }

      setCloudSyncStatus('synced');
      if (manualNotify) {
        showToast('Thiết bị này đã có dữ liệu mới nhất trên Cloud!');
      }
    },
    [applyRemoteWorkspaceSnapshot]
  );

  const handleForcePushToCloud = async () => {
    setCloudSyncStatus('syncing');
    setWorkspaceInitialized(true);
    const nextVer = lastKnownServerVersionRef.current + 1;
    const snapshotToPush: WorkspaceCacheSnapshot = {
      version: nextVer,
      updatedAtMs: Date.now(),
      cloudSyncedOnce: true,
      initialized: true,
      categories,
      rolePermissions,
      inventoryData,
      products,
      bills,
      billItems,
      deductions,
      returns,
      debtors,
      staffAccounts,
    };
    const [fsOk, srvRes] = await Promise.all([
      syncFullSnapshotToFirestore(
        snapshotToPush,
        currentStaffAccount?.username || 'manual_push'
      ),
      pushWorkspaceToServer(
        snapshotToPush,
        'replace',
        currentStaffAccount?.username || 'manual_push'
      ),
    ]);
    const finalVersion = srvRes?.version || nextVer;
    if (fsOk || (srvRes && srvRes.ok)) {
      lastKnownServerVersionRef.current = finalVersion;
      setCloudVersion(finalVersion);
      setLastCloudSyncAt(Date.now());
      setCloudSyncedOnce(true);
      setCloudSyncStatus('synced');
      saveLocalMirror(ownerId, {
        ...snapshotToPush,
        version: finalVersion,
        updatedAtMs: Date.now(),
      });
      showToast(
        `Đã đồng bộ toàn bộ dữ liệu máy này (${bills.length} bill, ${products.length} món) lên Firebase Cloud! Mọi máy tính và điện thoại khác đều xem được ngay.`
      );
    } else {
      setCloudSyncStatus('offline');
      showToast('Lỗi khi đẩy dữ liệu lên Cloud.');
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (initialCloudHandshakeDoneRef.current) {
        handlePullFromCloud(false);
      }
    }, 3000);

    const onFocus = () => {
      if (initialCloudHandshakeDoneRef.current) {
        handlePullFromCloud(false);
      }
    };

    const onVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        initialCloudHandshakeDoneRef.current
      ) {
        handlePullFromCloud(false);
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [handlePullFromCloud]);

  // Track Firebase Auth State
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);

      if (user) {
        const defaultRole =
          user.email === 'toannq06034@gmail.com' ? UserRole.ADMIN : UserRole.MANAGER;
        const staffObj: StaffAccount = {
          id: user.uid,
          username: (user.email?.split('@')[0] || 'admin').slice(0, 60),
          password: '••••••••',
          displayName: user.displayName || user.email || 'Quản trị viên',
          info: `Firebase Auth (${user.email || 'Google'})`,
          role: loggedInStaff?.role || defaultRole,
          active: true,
          allowedTabs:
            loggedInStaff?.allowedTabs ||
            DEFAULT_ROLE_PERMISSIONS[loggedInStaff?.role || defaultRole].allowedTabs,
          useCustomTabs: Boolean(loggedInStaff?.useCustomTabs),
        };
        setLoggedInStaff(staffObj);
        localStorage.setItem('vqbill_active_staff', JSON.stringify(staffObj));

        if (user.emailVerified) {
          try {
            await setDoc(
              doc(db, 'users', user.uid),
              {
                uid: user.uid,
                username: truncateStr(staffObj.username, 64, 'user'),
                displayName: truncateStr(staffObj.displayName, 100, 'User'),
                role:
                  user.email === 'toannq06034@gmail.com' ? 'admin' : 'manager',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          } catch {
            // Ignore if already exists with immutable createdAt
          }
        }
      }
    });
    return () => unsub();
  }, []);

  // Attach Firestore Real-Time Listeners for the shared restaurant workspace across ALL accounts and devices
  useEffect(() => {
    const wsId = SHARED_WORKSPACE_ID;
    const qMeta = doc(db, 'workspace_meta', wsId);
    const qBills = query(collection(db, 'bills'), where('ownerId', '==', wsId));
    const qItems = query(collection(db, 'bill_items'), where('ownerId', '==', wsId));
    const qProducts = query(collection(db, 'products'), where('ownerId', '==', wsId));
    const qDeductions = query(collection(db, 'deductions'), where('ownerId', '==', wsId));
    const qReturns = query(collection(db, 'returns'), where('ownerId', '==', wsId));
    const qStaff = query(collection(db, 'staff_accounts'), where('ownerId', '==', wsId));

    const unsubMeta = onSnapshot(
      qMeta,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        markRemoteStateUpdate();
        setWorkspaceInitialized(true);
        setCloudSyncedOnce(true);
        setCloudSyncStatus('synced');
        if (data.version) {
          const v = Number(data.version) || 1;
          lastKnownServerVersionRef.current = Math.max(
            lastKnownServerVersionRef.current,
            v
          );
          setCloudVersion(lastKnownServerVersionRef.current);
        }
        setLastCloudSyncAt(data.updatedAt?.toMillis?.() || Date.now());

        if (data.categoriesJson) {
          try {
            const parsed = JSON.parse(data.categoriesJson);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setCategories(parsed);
            }
          } catch {
            // ignore
          }
        }
        if (data.debtorsJson) {
          try {
            const parsed = JSON.parse(data.debtorsJson);
            if (Array.isArray(parsed)) {
              const delDebtors = getDeletedDebtors();
              setDebtors(
                parsed.filter((d) => !delDebtors.has(String(d || '').trim().toLowerCase()))
              );
            }
          } catch {
            // ignore
          }
        }
        if (data.rolePermissionsJson) {
          try {
            const parsed = JSON.parse(data.rolePermissionsJson);
            if (parsed && typeof parsed === 'object') {
              const { _inventoryData, ...restRoles } = parsed;
              setRolePermissions((prev) => ({
                ...DEFAULT_ROLE_PERMISSIONS,
                ...prev,
                ...restRoles,
              }));
              if (_inventoryData && typeof _inventoryData === 'object') {
                const incomingInv = _inventoryData as WorkspaceInventoryData;
                if (
                  Array.isArray(incomingInv.deletedEmployeeIds) &&
                  incomingInv.deletedEmployeeIds.length > 0
                ) {
                  markEmployeesDeletedLocally(incomingInv.deletedEmployeeIds);
                }
                const delEmpSet = getDeletedEmployeeIds();
                setInventoryData((prev) => {
                  if ((prev.updatedAtMs || 0) > (incomingInv.updatedAtMs || 0)) {
                    return prev;
                  }
                  return {
                    ...incomingInv,
                    deletedEmployeeIds: Array.from(delEmpSet),
                    employees: Array.isArray(incomingInv.employees)
                      ? incomingInv.employees.filter(
                          (e) =>
                            !delEmpSet.has(e.id) &&
                            !delEmpSet.has(sanitizeId(e.id))
                        )
                      : prev.employees,
                  };
                });
              }
            }
          } catch {
            // ignore
          }
        }
      },
      () => {
        // Ignore transient listener error
      }
    );

    const unsubBills = onSnapshot(
      qBills,
      (snap) => {
        if (!snap.empty || initialCloudHandshakeDoneRef.current) {
          if (snap.empty && !workspaceInitialized) return;
          markRemoteStateUpdate();
          setWorkspaceInitialized(true);
          setCloudSyncedOnce(true);
          setCloudSyncStatus('synced');
          setLastCloudSyncAt(Date.now());
          const deletedBills = getDeletedBillIds();
          const loaded: BillRecord[] = snap.docs
            .filter((d) => !deletedBills.has(d.id) && !deletedBills.has(sanitizeId(d.id)))
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                ownerId: data.ownerId || wsId,
                billCode: data.billCode || 'HD',
                billDate: data.billDate || todayStr,
                rawDate: data.rawDate || data.billDate || todayStr,
                checkInTime: data.checkInTime || '',
                checkOutTime: data.checkOutTime || '',
                paymentType: data.paymentType || 'cash',
                debtorName: data.debtorName || '',
                debtStatus: data.debtStatus || 'none',
                subtotalAmount: Number(data.subtotalAmount) || Number(data.totalAmount) || 0,
                discountAmount: Number(data.discountAmount) || 0,
                totalAmount: Number(data.totalAmount) || 0,
                deductedAmount: Number(data.deductedAmount) || 0,
                itemsSummary: data.itemsSummary || '',
                note: data.note || '',
                status: data.status || 'active',
                createdAtMs: data.createdAt?.toMillis?.() || Date.now(),
                updatedAtMs: data.updatedAt?.toMillis?.() || Date.now(),
              };
            });
          setBills(dedupeRecordsById(loaded));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bills')
    );

    const unsubItems = onSnapshot(
      qItems,
      (snap) => {
        if (!snap.empty || initialCloudHandshakeDoneRef.current) {
          if (snap.empty && !workspaceInitialized) return;
          markRemoteStateUpdate();
          const deletedBills = getDeletedBillIds();
          const loaded: BillItemRecord[] = snap.docs
            .filter((d) => {
              const bId = String(d.data()?.billId || '');
              return !deletedBills.has(bId) && !deletedBills.has(sanitizeId(bId));
            })
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                ownerId: data.ownerId,
                billId: data.billId,
                billDate: data.billDate,
                productName: data.productName,
                category: data.category,
                note: data.note || '',
                quantity: Number(data.quantity) || 1,
                returnedQuantity: Number(data.returnedQuantity) || 0,
                unitPrice: Number(data.unitPrice) || 0,
                subtotal: Number(data.subtotal) || 0,
                createdAtMs: data.createdAt?.toMillis?.() || Date.now(),
                updatedAtMs: data.updatedAt?.toMillis?.() || Date.now(),
              };
            });
          setBillItems(dedupeRecordsById(loaded));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bill_items')
    );

    const unsubProducts = onSnapshot(
      qProducts,
      (snap) => {
        if (!snap.empty || initialCloudHandshakeDoneRef.current) {
          if (snap.empty && !workspaceInitialized) return;
          markRemoteStateUpdate();
          const loaded: ProductRecord[] = snap.docs.map((d) => {
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
          setProducts(dedupeRecordsById(loaded));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'products')
    );

    const unsubDeductions = onSnapshot(
      qDeductions,
      (snap) => {
        if (!snap.empty || initialCloudHandshakeDoneRef.current) {
          if (snap.empty && !workspaceInitialized) return;
          if (!snap.metadata.hasPendingWrites) {
            markRemoteStateUpdate();
          }
          const loaded: DeductionRecord[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerId: data.ownerId || wsId,
              billId: data.billId || '',
              billCode: data.billCode || '',
              billDate: data.billDate || data.deductionDate || todayStr,
              deductionDate: data.deductionDate || data.billDate || todayStr,
              productName: data.productName || '',
              category: data.category || 'Khác',
              quantity: Number(data.quantity) || 1,
              unitPrice: Number(data.unitPrice) || 0,
              amount: Number(data.amount) || 0,
              note: data.note || '',
              createdAtMs: data.createdAt?.toMillis?.() || Date.now(),
              updatedAtMs: data.updatedAt?.toMillis?.() || Date.now(),
            };
          });
          setDeductions(dedupeRecordsById(loaded));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'deductions')
    );

    const unsubReturns = onSnapshot(
      qReturns,
      (snap) => {
        if (!snap.empty || initialCloudHandshakeDoneRef.current) {
          if (snap.empty && !workspaceInitialized) return;
          markRemoteStateUpdate();
          const loaded: ReturnRecord[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerId: data.ownerId || wsId,
              billId: data.billId || '',
              billCode: data.billCode || '',
              billDate: data.billDate || data.returnDate || todayStr,
              returnDate: data.returnDate || data.billDate || todayStr,
              productName: data.productName || '',
              category: data.category || 'Khác',
              quantity: Number(data.quantity) || 1,
              unitPrice: Number(data.unitPrice) || 0,
              amount: Number(data.amount) || 0,
              note: data.note || '',
              createdAtMs: data.createdAt?.toMillis?.() || Date.now(),
              updatedAtMs: data.updatedAt?.toMillis?.() || Date.now(),
            };
          });
          setReturns(dedupeRecordsById(loaded));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'returns')
    );

    const unsubStaff = onSnapshot(
      qStaff,
      (snap) => {
        if (!snap.empty) {
          markRemoteStateUpdate();
          setStaffAccounts((prev) => {
            const prevMap = new Map<string, StaffAccount>(
              prev.map((p) => [p.id, p])
            );
            const mapped = snap.docs.map((d) => {
              const data = d.data();
              const existingLocal = prevMap.get(d.id);
              const role = (data.role as UserRole) || UserRole.CASHIER;
              const fromFirestoreTabs = sanitizeTabList(data.allowedTabs);
              return {
                id: d.id,
                ownerId: data.ownerId,
                username: data.username,
                password:
                  String(data.username || '').toLowerCase() === FIXED_ADMIN_USERNAME
                    ? FIXED_ADMIN_PASSWORD
                    : data.password,
                displayName: data.displayName,
                info: data.info || '',
                role:
                  String(data.username || '').toLowerCase() === FIXED_ADMIN_USERNAME
                    ? UserRole.ADMIN
                    : role,
                active:
                  String(data.username || '').toLowerCase() === FIXED_ADMIN_USERNAME
                    ? true
                    : Boolean(data.active),
                allowedTabs:
                  fromFirestoreTabs.length > 0
                    ? fromFirestoreTabs
                    : existingLocal?.allowedTabs ||
                      DEFAULT_ROLE_PERMISSIONS[role]?.allowedTabs,
                useCustomTabs:
                  typeof data.useCustomTabs === 'boolean'
                    ? data.useCustomTabs
                    : Boolean(existingLocal?.useCustomTabs),
                useCustomProductCategories:
                  typeof data.useCustomProductCategories === 'boolean'
                    ? data.useCustomProductCategories
                    : Boolean(existingLocal?.useCustomProductCategories),
                restrictProductCategories:
                  typeof data.restrictProductCategories === 'boolean'
                    ? data.restrictProductCategories
                    : Boolean(existingLocal?.restrictProductCategories),
                allowedProductCategories: Array.isArray(
                  data.allowedProductCategories
                )
                  ? data.allowedProductCategories
                  : existingLocal?.allowedProductCategories || [],
                createdAtMs: data.createdAt?.toMillis?.() || Date.now(),
                updatedAtMs: data.updatedAt?.toMillis?.() || Date.now(),
              };
            });
            return normalizeStaffAccountsWithFixedAdmin(mapped);
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'staff_accounts')
    );

    return () => {
      unsubMeta();
      unsubBills();
      unsubItems();
      unsubProducts();
      unsubDeductions();
      unsubReturns();
      unsubStaff();
    };
  }, [workspaceInitialized, markRemoteStateUpdate]);

  // Date Range Helper
  const isDateInPeriod = (dateStr?: string): boolean => {
    const safeDate = String(dateStr || '');
    if (periodPreset === 'all') return true;
    if (!safeDate) return false;
    if (periodPreset === 'today') return safeDate === todayStr;
    if (periodPreset === 'yesterday') return safeDate === yesterdayStr;
    if (periodPreset === 'week') {
      const target = new Date(safeDate + 'T00:00:00').getTime();
      const now = new Date(todayStr + 'T00:00:00').getTime();
      const diffDays = (now - target) / 86400000;
      return diffDays >= -1 && diffDays <= 7;
    }
    if (periodPreset === 'month') {
      return safeDate.slice(0, 7) === todayStr.slice(0, 7);
    }
    if (periodPreset === 'custom') {
      const start = customStartDate || '2000-01-01';
      const end = customEndDate || '2099-12-31';
      return safeDate >= start && safeDate <= end;
    }
    return true;
  };

  const periodLabel = useMemo(() => {
    if (periodPreset === 'today') return `Hôm nay (${todayStr})`;
    if (periodPreset === 'yesterday') return `Hôm qua (${yesterdayStr})`;
    if (periodPreset === 'week') return '7 ngày gần nhất';
    if (periodPreset === 'month') return `Tháng ${todayStr.slice(5, 7)}/${todayStr.slice(0, 4)}`;
    if (periodPreset === 'custom') return `Từ ${customStartDate} đến ${customEndDate}`;
    return 'Toàn bộ thời gian';
  }, [periodPreset, todayStr, yesterdayStr, customStartDate, customEndDate]);

  // Ensure every bill has its billItems (auto-reconstructing from itemsSummary if any older bill had 0 items saved)
  // Also auto-sync each billItem's category with its matching product in Menu (`products`)
  const effectiveBillItems = useMemo<BillItemRecord[]>(() => {
    const productCatMap = new Map<string, string>();
    for (const p of products) {
      const pName = (p.productName || '').trim().toLowerCase();
      const pCat = (p.category || '').trim();
      if (pName && pCat) {
        productCatMap.set(pName, pCat);
      }
    }

    const existingBillIds = new Set(billItems.map((it) => it.billId));
    const missingItems: BillItemRecord[] = [];
    for (const b of bills) {
      if (!existingBillIds.has(b.id) && b.itemsSummary) {
        missingItems.push(...reconstructBillItemsFromSummary(b, products));
      }
    }
    const baseItems =
      missingItems.length === 0 ? billItems : [...billItems, ...missingItems];

    return baseItems.map((it) => {
      const mappedCat = productCatMap.get((it.productName || '').trim().toLowerCase());
      if (mappedCat && mappedCat !== it.category) {
        return { ...it, category: mappedCat };
      }
      return it;
    });
  }, [bills, billItems, products]);

  // Filtered Bills & Deductions for Active Period + Search + Category + Payment
  const periodBills = useMemo(() => {
    return bills.filter((b) => isDateInPeriod(b.billDate));
  }, [bills, periodPreset, customStartDate, customEndDate, todayStr, yesterdayStr]);

  const periodBillIds = useMemo(() => new Set(periodBills.map((b) => b.id)), [periodBills]);

  const periodBillItems = useMemo(() => {
    return effectiveBillItems.filter((it) => periodBillIds.has(it.billId));
  }, [effectiveBillItems, periodBillIds]);

  // Ensure every return (hoàn bia / món thừa) is synced as a single unified cashflow line in Deductions (Khoản trừ)
  const effectiveDeductions = useMemo<DeductionRecord[]>(() => {
    const billMap = new Map(bills.map((b) => [b.id, b]));
    const uniqueDeductions = dedupeRecordsById(deductions);
    const uniqueReturns = dedupeRecordsById(returns);
    const result: DeductionRecord[] = uniqueDeductions.map((d) => {
      const codeStr = String(d.billCode || '');
      const safeAmt = Math.max(0, Math.round(Number(d.amount) || 0));
      const safeQty = Math.max(1, Math.round(Number(d.quantity) || 1));
      const safeUnitPrice =
        safeQty === 1
          ? safeAmt
          : Number(d.unitPrice) > 0 &&
            Math.abs(safeQty * Number(d.unitPrice) - safeAmt) <= safeQty * 2
          ? Math.max(0, Math.round(Number(d.unitPrice)))
          : Math.max(0, Math.round(safeAmt / safeQty));
      return {
        ...d,
        deductionDate: d.deductionDate || d.billDate || todayStr,
        billDate: d.billDate || d.deductionDate || todayStr,
        productName: d.productName || '',
        billCode: codeStr,
        category: d.category || 'Khác',
        quantity: safeQty,
        unitPrice: safeUnitPrice,
        amount: safeAmt,
        note: d.note || '',
      };
    });

    for (const r of uniqueReturns) {
      const expectedDedId = sanitizeId(`ded_${r.id}`);
      const rProdLower = String(r.productName || '').toLowerCase();
      const alreadyLinkedIdx = result.findIndex(
        (d) =>
          d.id === expectedDedId ||
          d.id === `ded_${r.id}` ||
          (d.billId === r.billId &&
            (String(d.id || '').startsWith('ded_ret_') ||
              d.billCode === 'HOAN-TRA' ||
              /\bsl hoàn trả\s*:/i.test(String(d.productName || '')) ||
              (d.amount === r.amount &&
                rProdLower &&
                String(d.productName || '')
                  .toLowerCase()
                  .includes(rProdLower))))
      );

      const parentBill = billMap.get(r.billId);
      const tableName = extractReturnTableName(r.note, parentBill);
      const formattedTitle = formatReturnDeductionTitle(
        tableName,
        r.productName || 'Món hoàn trả',
        r.quantity
      );
      const rDate = r.returnDate || r.billDate || todayStr;
      const rAmt = Math.max(0, Math.round(Number(r.amount) || 0));

      if (alreadyLinkedIdx >= 0) {
        const existing = result[alreadyLinkedIdx];
        const wasManuallyEdited =
          (existing.updatedAtMs || 0) > (r.createdAtMs || 0) + 1000;
        if (!wasManuallyEdited) {
          const exQty = Math.max(1, Math.round(Number(existing.quantity) || 1));
          result[alreadyLinkedIdx] = {
            ...existing,
            deductionDate: existing.deductionDate || rDate,
            billDate: existing.billDate || rDate,
            billCode: existing.billCode || r.billCode || 'HOAN-TRA',
            productName: formattedTitle,
            category: 'Hoàn bia / món thừa',
            quantity: exQty,
            unitPrice: Math.round(rAmt / exQty),
            amount: rAmt,
          };
        }
      } else {
        const ts = r.createdAtMs || Date.now();
        result.push({
          id: expectedDedId,
          ownerId: r.ownerId || ownerId,
          billId: r.billId || '',
          billCode: r.billCode || 'HOAN-TRA',
          billDate: rDate,
          deductionDate: rDate,
          productName: formattedTitle,
          category: 'Hoàn bia / món thừa',
          quantity: 1,
          unitPrice: rAmt,
          amount: rAmt,
          note: r.note || '',
          createdAtMs: ts,
          updatedAtMs: ts,
        });
      }
    }

    // Ensure every SalaryAdvanceRecord is synchronized into effectiveDeductions (1 dòng tiền duy nhất)
    const uniqueSalaryAdvances = dedupeRecordsById(
      inventoryData.salaryAdvances || []
    );
    for (const adv of uniqueSalaryAdvances) {
      const expectedDedId = sanitizeId(
        adv.linkedDeductionId || `ded_${adv.id}`
      );
      const alreadyLinkedIdx = result.findIndex(
        (d) =>
          d.id === expectedDedId ||
          d.id === adv.linkedDeductionId ||
          d.id === `ded_${adv.id}` ||
          d.billId === adv.id
      );
      const advTitle = `Ứng lương: ${adv.employeeName}${
        adv.employeeRole ? ` (${adv.employeeRole})` : ''
      }`;
      const advDate = adv.advanceDate || todayStr;
      const advAmt = Math.max(0, Math.round(Number(adv.amount) || 0));

      if (alreadyLinkedIdx >= 0) {
        const existing = result[alreadyLinkedIdx];
        const advNewer = (adv.updatedAtMs || 0) >= (existing.updatedAtMs || 0);
        if (advNewer) {
          result[alreadyLinkedIdx] = {
            ...existing,
            deductionDate: advDate,
            billDate: advDate,
            billCode: 'UNG-LUONG',
            productName: advTitle,
            category: 'Ứng lương nhân viên',
            quantity: 1,
            unitPrice: advAmt,
            amount: advAmt,
            note: adv.note || existing.note || '',
          };
        }
      } else {
        const ts = adv.createdAtMs || Date.now();
        result.push({
          id: expectedDedId,
          ownerId: adv.ownerId || ownerId,
          billId: adv.id,
          billCode: 'UNG-LUONG',
          billDate: advDate,
          deductionDate: advDate,
          productName: advTitle,
          category: 'Ứng lương nhân viên',
          quantity: 1,
          unitPrice: advAmt,
          amount: advAmt,
          note: adv.note || '',
          createdAtMs: ts,
          updatedAtMs: adv.updatedAtMs || ts,
        });
      }
    }

    return result.sort(
      (a, b) =>
        String(b.deductionDate || b.billDate || '').localeCompare(
          String(a.deductionDate || a.billDate || '')
        ) || (b.createdAtMs || 0) - (a.createdAtMs || 0)
    );
  }, [deductions, returns, bills, ownerId, todayStr, inventoryData.salaryAdvances]);

  const periodDeductions = useMemo(() => {
    return effectiveDeductions.filter((d) => isDateInPeriod(d.deductionDate));
  }, [
    effectiveDeductions,
    periodPreset,
    customStartDate,
    customEndDate,
    todayStr,
    yesterdayStr,
  ]);

  // Advanced Filtered Bills for Table Display
  const displayedBills = useMemo(() => {
    return periodBills
      .filter((b) => {
        if (paymentFilter === 'cash') return b.paymentType === 'cash' && !isOwnerUseBill(b);
        if (paymentFilter === 'transfer') return b.paymentType === 'transfer';
        if (paymentFilter === 'debt') return b.paymentType === 'debt';
        if (paymentFilter === 'has_return') return (b.deductedAmount || 0) > 0;
        if ((paymentFilter as string) === 'owner_use') return isOwnerUseBill(b);
        return true;
      })
      .filter((b) => {
        if (categoryFilter === 'all') return true;
        return effectiveBillItems.some(
          (it) => it.billId === b.id && it.category === categoryFilter
        );
      })
      .filter((b) => {
        if (!searchKeyword.trim()) return true;
        const q = searchKeyword.toLowerCase();
        return (
          String(b.billCode || '').toLowerCase().includes(q) ||
          String(b.billDate || '').includes(q) ||
          String(b.debtorName || '').toLowerCase().includes(q) ||
          String(b.itemsSummary || '').toLowerCase().includes(q) ||
          String(b.note || '').toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          String(b.billDate || '').localeCompare(String(a.billDate || '')) ||
          (b.createdAtMs || 0) - (a.createdAtMs || 0)
      );
  }, [periodBills, paymentFilter, categoryFilter, searchKeyword, effectiveBillItems]);

  // Financial Metrics
  // Note: Beer/item returns are included in periodDeductions (1 dòng tiền duy nhất),
  // so grossCash & grossTransfer use b.totalAmount and subtract totalDeductions once.
  const financialSummary = useMemo(() => {
    const debtPaymentsList = inventoryData.debtPayments || [];
    const paidByBillMap = new Map<string, number>();
    for (const p of debtPaymentsList) {
      if (!p || !p.billId) continue;
      paidByBillMap.set(
        p.billId,
        (paidByBillMap.get(p.billId) || 0) + (Number(p.amount) || 0)
      );
    }

    const unpaidDebtBillIds = new Set(
      bills
        .filter((b) => b.paymentType === 'debt' && b.debtStatus !== 'paid')
        .map((b) => b.id)
    );

    const periodCashInstallments = debtPaymentsList
      .filter(
        (p) =>
          p.paymentMethod === 'cash' &&
          unpaidDebtBillIds.has(p.billId) &&
          isDateInPeriod(p.paidDate)
      )
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const periodTransferInstallments = debtPaymentsList
      .filter(
        (p) =>
          p.paymentMethod === 'transfer' &&
          unpaidDebtBillIds.has(p.billId) &&
          isDateInPeriod(p.paidDate)
      )
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const grossCash =
      periodBills
        .filter((b) => b.paymentType === 'cash')
        .reduce((s, b) => s + (Number(b.totalAmount) || 0), 0) +
      periodCashInstallments;

    const grossTransfer =
      periodBills
        .filter((b) => b.paymentType === 'transfer')
        .reduce((s, b) => s + (Number(b.totalAmount) || 0), 0) +
      periodTransferInstallments;

    const totalDeductions = periodDeductions.reduce((s, d) => s + d.amount, 0);

    const totalDebt = periodBills
      .filter((b) => b.paymentType === 'debt' && b.debtStatus !== 'paid')
      .reduce((s, b) => {
        const netOrig = Math.max(
          0,
          (Number(b.totalAmount) || 0) - (Number(b.deductedAmount) || 0)
        );
        const paidSoFar = paidByBillMap.get(b.id) || 0;
        return s + Math.max(0, netOrig - paidSoFar);
      }, 0);

    const netCashRevenue = grossCash - totalDeductions;
    const netTransferRevenue = grossTransfer;
    // Doanh thu tổng ngày = Tiền mặt + Chuyển khoản - Khoản trừ (Công nợ tính riêng)
    const netDayTotal = grossCash + grossTransfer - totalDeductions;
    const totalAllBillsGross = grossCash + grossTransfer + totalDebt;

    return {
      grossCash,
      grossTransfer,
      totalDeductions,
      totalDebt,
      netCashRevenue,
      netTransferRevenue,
      netDayTotal,
      totalAllBillsGross,
    };
  }, [periodBills, periodDeductions, inventoryData.debtPayments, bills]);

  // Daily Chart Data Points
  const chartData = useMemo<DailyRevenuePoint[]>(() => {
    const dateMap = new Map<
      string,
      { cash: number; transfer: number; deduction: number; debt: number }
    >();

    for (const b of periodBills) {
      const cur = dateMap.get(b.billDate) || {
        cash: 0,
        transfer: 0,
        deduction: 0,
        debt: 0,
      };
      if (b.paymentType === 'cash') cur.cash += Number(b.totalAmount) || 0;
      else if (b.paymentType === 'transfer') cur.transfer += Number(b.totalAmount) || 0;
      else if (b.paymentType === 'debt' && b.debtStatus !== 'paid')
        cur.debt += Math.max(
          0,
          (Number(b.totalAmount) || 0) - (Number(b.deductedAmount) || 0)
        );
      dateMap.set(b.billDate, cur);
    }

    for (const d of periodDeductions) {
      const key = d.deductionDate || d.billDate;
      const cur = dateMap.get(key) || {
        cash: 0,
        transfer: 0,
        deduction: 0,
        debt: 0,
      };
      cur.deduction += d.amount;
      dateMap.set(key, cur);
    }

    return Array.from(dateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, vals]) => {
        const parts = date.split('-');
        const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : date;
        return {
          date,
          label,
          cash: vals.cash,
          transfer: vals.transfer,
          deduction: vals.deduction,
          debt: vals.debt,
          netCash: vals.cash - vals.deduction,
          netDayTotal: vals.cash + vals.transfer - vals.deduction,
        };
      });
  }, [periodBills, periodDeductions]);

  // Auth Handlers
  const handleStaffLoginSuccess = (acc: StaffAccount) => {
    setLoggedInStaff(acc);
    localStorage.setItem('vqbill_active_staff', JSON.stringify(acc));
    setAuthError(null);
    const eff = getEffectiveRolePermissions(acc, rolePermissions);
    setActiveTab(eff.allowedTabs[0] || 'dashboard');
    // Immediately synchronize latest bills & workspace from Firebase Cloud upon login
    setTimeout(() => {
      handlePullFromCloud(false);
    }, 50);
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    await signInWithPopup(auth, googleProvider);
  };

  const handleLogout = async () => {
    setLoggedInStaff(null);
    localStorage.removeItem('vqbill_active_staff');
    if (firebaseUser) {
      await signOut(auth);
    }
  };

  // Save Role-based Management Tabs Permissions Matrix (Admin Tab)
  const handleSaveRolePermissions = async (
    updatedMap: RolePermissionsMap,
    syncAccountsOfRoles: boolean
  ) => {
    setWorkspaceInitialized(true);
    setRolePermissions(updatedMap);
    await saveRolePermissionsToCloud(ownerId, updatedMap);

    if (syncAccountsOfRoles) {
      const updatedStaffList = staffAccounts.map((acc) => {
        const roleCfg = updatedMap[acc.role] || DEFAULT_ROLE_PERMISSIONS[acc.role];
        const isAccAdmin =
          acc.username.toLowerCase() === 'admin' || acc.role === UserRole.ADMIN;
        return {
          ...acc,
          allowedTabs: roleCfg.allowedTabs,
          useCustomTabs: false,
          actionMode: isAccAdmin
            ? ('full_crud' as const)
            : ('role_default' as const),
          useCustomProductCategories: false,
          restrictProductCategories: Boolean(roleCfg.restrictProductCategories),
          allowedProductCategories: roleCfg.allowedProductCategories || [],
          updatedAtMs: Date.now(),
        };
      });
      setStaffAccounts(updatedStaffList);

      if (currentStaffAccount) {
        const syncedCurrent = updatedStaffList.find(
          (a) => a.id === currentStaffAccount.id
        );
        if (syncedCurrent) {
          setLoggedInStaff(syncedCurrent);
          localStorage.setItem(
            'vqbill_active_staff',
            JSON.stringify(syncedCurrent)
          );
        }
      }

      for (const acc of updatedStaffList) {
        await saveStaffAccountToFirebase(ownerId, acc, false);
      }
      showToast(
        'Đã lưu bảng phân phối Danh mục quản lý theo Role và đồng bộ toàn bộ tài khoản lên Firebase!'
      );
    } else {
      showToast('Đã lưu bảng phân phối Danh mục quản lý theo Role lên Firebase!');
    }
  };

  // Staff Accounts CRUD (Admin Tab)
  const handleCreateStaffAccount = async (newAcc: Omit<StaffAccount, 'id'>) => {
    setWorkspaceInitialized(true);
    const now = Date.now();
    const created: StaffAccount = {
      ...newAcc,
      id: sanitizeId(`staff_${now}_${Math.random().toString(36).slice(2, 6)}`),
      ownerId,
      createdAtMs: now,
      updatedAtMs: now,
    };
    setStaffAccounts((prev) => [...prev, created]);
    await saveStaffAccountToFirebase(ownerId, created, true);
    showToast(
      `Đã tạo tài khoản @${created.username} (${created.displayName}) với phân quyền danh mục quản lý trên Firebase!`
    );
  };

  const handleUpdateStaffAccount = async (updatedAcc: StaffAccount) => {
    setWorkspaceInitialized(true);
    setStaffAccounts((prev) =>
      prev.map((a) => (a.id === updatedAcc.id ? updatedAcc : a))
    );
    if (
      currentStaffAccount &&
      (currentStaffAccount.id === updatedAcc.id ||
        currentStaffAccount.username === updatedAcc.username)
    ) {
      setLoggedInStaff(updatedAcc);
      localStorage.setItem('vqbill_active_staff', JSON.stringify(updatedAcc));
    }
    await saveStaffAccountToFirebase(ownerId, updatedAcc, false);
    showToast(
      `Đã lưu phân phối danh mục quản lý và thông tin tài khoản @${updatedAcc.username} lên Firebase!`
    );
  };

  const handleDeleteStaffAccount = async (accountId: string) => {
    setWorkspaceInitialized(true);
    isApplyingRemoteSnapshotRef.current = false;
    markStaffAccountsDeletedLocally([accountId]);
    const removedAcc = staffAccounts.find((a) => a.id === accountId);
    setStaffAccounts((prev) => prev.filter((a) => a.id !== accountId));

    // Also unlink any employee that was using this staff account so they revert to default Nhân viên phục vụ (no login account)
    if (Array.isArray(inventoryData.employees)) {
      const now = Date.now();
      let changedEmp = false;
      const nextEmps = inventoryData.employees.map((e) => {
        if (
          e.linkedStaffAccountId === accountId ||
          (removedAcc &&
            e.username &&
            e.username.toLowerCase() === removedAcc.username.toLowerCase())
        ) {
          changedEmp = true;
          return {
            ...e,
            hasLoginAccount: false,
            systemRole: undefined,
            username: undefined,
            password: undefined,
            linkedStaffAccountId: undefined,
            roleOrPosition: 'Nhân viên phục vụ',
            updatedAtMs: now,
          };
        }
        return e;
      });
      if (changedEmp) {
        const nextInv: WorkspaceInventoryData = {
          ...inventoryData,
          employees: nextEmps,
          updatedAtMs: now,
        };
        setInventoryData(nextInv);
        saveInventoryDataToCloud(ownerId, nextInv, rolePermissions).catch(() => {});
      }
    }

    await deleteStaffAccountsFromFirebase(ownerId, [accountId]);
    showToast('Đã xóa tài khoản khỏi hệ thống Firebase.');
  };

  const handleDeleteAllNonAdminAccounts = async () => {
    setWorkspaceInitialized(true);
    isApplyingRemoteSnapshotRef.current = false;
    const toRemove = staffAccounts.filter(
      (a) => a.username !== 'admin' && a.id !== currentStaffAccount?.id
    );
    const ids = toRemove.map((a) => a.id);
    markStaffAccountsDeletedLocally(ids);
    setStaffAccounts((prev) => prev.filter((a) => !ids.includes(a.id)));
    await deleteStaffAccountsFromFirebase(ownerId, ids);
    showToast(`Đã xóa ${ids.length} tài khoản nhân viên phụ khỏi Firebase.`);
  };

  // Effective Debtors list (combined from saved debtors and any debtorName on bills)
  const effectiveDebtors = useMemo(() => {
    const result: string[] = [];
    const seen = new Set<string>();
    const addDebtor = (name?: string) => {
      const clean = (name || '').trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push(clean);
      }
    };
    debtors.forEach(addDebtor);
    bills.forEach((b) => addDebtor(b.debtorName));
    return result;
  }, [debtors, bills]);

  const handleAddDebtor = async (newDebtorName: string) => {
    const clean = newDebtorName.trim();
    if (!clean) return;
    unmarkDebtorDeletedLocally(clean);
    setWorkspaceInitialized(true);
    if (!effectiveDebtors.some((d) => d.toLowerCase() === clean.toLowerCase())) {
      const next = [...effectiveDebtors, clean];
      setDebtors(next);
      await saveDebtorsToCloud(ownerId, next);
      showToast(`Đã thêm khách nợ "${clean}" vào Quản lý Công nợ!`);
    }
  };

  const handleDeleteDebtor = async (debtorNameToDelete: string) => {
    const clean = debtorNameToDelete.trim();
    if (!clean) return;
    setWorkspaceInitialized(true);
    const targetLower = clean.toLowerCase();
    markDebtorsDeletedLocally([clean]);

    const nextDebtors = effectiveDebtors.filter(
      (d) => d.trim().toLowerCase() !== targetLower
    );
    setDebtors(nextDebtors);

    const matchingBills = bills.filter(
      (b) => (b.debtorName || '').trim().toLowerCase() === targetLower
    );

    if (matchingBills.length > 0) {
      await handleDeleteMultipleBills(matchingBills, nextDebtors);
      showToast(
        `Đã xóa khách nợ "${clean}" và ${matchingBills.length} hóa đơn công nợ liên quan!`
      );
    } else {
      saveDebtorsToCloud(ownerId, nextDebtors).catch(() => {});
      showToast(`Đã xóa khách nợ "${clean}" khỏi danh sách Công nợ!`);
    }
  };

  // Always ensure categories include any category present in products or billItems
  const effectiveCategories = useMemo(() => {
    const result: string[] = [];
    const seen = new Set<string>();
    const addCat = (c?: string) => {
      const trimmed = (c || '').trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push(trimmed);
      }
    };
    categories.forEach(addCat);
    products.forEach((p) => addCat(p.category));
    effectiveBillItems.forEach((it) => addCat(it.category));
    if (result.length === 0) {
      STANDARD_CATEGORIES.forEach(addCat);
    }
    return result;
  }, [categories, products, effectiveBillItems]);

  // Filtered categories, products, and billItems for "Số lượng theo Danh mục" tab based on Role/Account permissions
  const isProductCategoryRestricted = Boolean(
    effectivePermissions.restrictProductCategories && !isAdminUser
  );

  const allowedProductCategoriesSet = useMemo(() => {
    if (!isProductCategoryRestricted) return null;
    return new Set(
      (effectivePermissions.allowedProductCategories || []).map((c) =>
        c.trim().toLowerCase()
      )
    );
  }, [isProductCategoryRestricted, effectivePermissions.allowedProductCategories]);

  const permittedCategoriesForTab = useMemo(() => {
    if (!allowedProductCategoriesSet) return effectiveCategories;
    return effectiveCategories.filter((c) =>
      allowedProductCategoriesSet.has(c.trim().toLowerCase())
    );
  }, [effectiveCategories, allowedProductCategoriesSet]);

  const permittedProductsForTab = useMemo(() => {
    if (!allowedProductCategoriesSet) return products;
    return products.filter((p) =>
      allowedProductCategoriesSet.has((p.category || 'Khác').trim().toLowerCase())
    );
  }, [products, allowedProductCategoriesSet]);

  const permittedPeriodBillItemsForTab = useMemo(() => {
    if (!allowedProductCategoriesSet) return periodBillItems;
    return periodBillItems.filter((it) =>
      allowedProductCategoriesSet.has((it.category || 'Khác').trim().toLowerCase())
    );
  }, [periodBillItems, allowedProductCategoriesSet]);

  // Automatically sync any newly discovered categories from products into categories state
  useEffect(() => {
    if (effectiveCategories.length > categories.length) {
      setCategories(effectiveCategories);
      saveCategoriesToCloud(ownerId, effectiveCategories).catch(() => {});
    }
  }, [effectiveCategories, categories.length, ownerId]);

  // Category CRUD Handlers
  const handleAddCategory = async (newCatName: string) => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    setWorkspaceInitialized(true);
    let updatedList: string[] | null = null;
    setCategories((prev) => {
      if (prev.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      updatedList = [...prev, trimmed];
      return updatedList;
    });
    if (updatedList) {
      await saveCategoriesToCloud(ownerId, updatedList);
      showToast(`Đã thêm danh mục "${trimmed}" vào hệ thống!`);
    }
  };

  const handleRenameCategory = async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed) return;
    setWorkspaceInitialized(true);

    const nextCategories = categories.map((c) => (c === oldName ? trimmed : c));
    const uniqueCategories = Array.from(new Set(nextCategories));
    setCategories(uniqueCategories);

    const affectedProducts = products
      .filter((p) => p.category === oldName)
      .map((p) => ({ ...p, category: trimmed }));
    const affectedBillItems = billItems
      .filter((it) => it.category === oldName)
      .map((it) => ({ ...it, category: trimmed }));
    const affectedDeductions = deductions
      .filter((d) => d.category === oldName)
      .map((d) => ({ ...d, category: trimmed }));
    const affectedReturns = returns
      .filter((r) => r.category === oldName)
      .map((r) => ({ ...r, category: trimmed }));

    setProducts((prev) =>
      prev.map((p) => (p.category === oldName ? { ...p, category: trimmed } : p))
    );
    setBillItems((prev) =>
      prev.map((it) => (it.category === oldName ? { ...it, category: trimmed } : it))
    );
    setDeductions((prev) =>
      prev.map((d) => (d.category === oldName ? { ...d, category: trimmed } : d))
    );
    setReturns((prev) =>
      prev.map((r) => (r.category === oldName ? { ...r, category: trimmed } : r))
    );

    await renameOrReassignCategoryInCloud({
      ownerId,
      categories: uniqueCategories,
      affectedProducts,
      affectedBillItems,
      affectedDeductions,
      affectedReturns,
    });
    showToast(`Đã đổi tên danh mục "${oldName}" thành "${trimmed}" trên toàn hệ thống!`);
  };

  const handleDeleteCategory = async (
    catName: string,
    mode: 'move_to_other' | 'delete_products' = 'move_to_other'
  ) => {
    setWorkspaceInitialized(true);
    const fallbackCategory = 'Khác';
    let nextCategories = categories.filter((c) => c !== catName);
    if (mode === 'move_to_other' && !nextCategories.includes(fallbackCategory)) {
      nextCategories = [...nextCategories, fallbackCategory];
    }
    if (nextCategories.length === 0) {
      nextCategories = [fallbackCategory];
    }
    setCategories(nextCategories);

    const affectedBillItems = billItems
      .filter((it) => it.category === catName)
      .map((it) => ({ ...it, category: fallbackCategory }));
    const affectedDeductions = deductions
      .filter((d) => d.category === catName)
      .map((d) => ({ ...d, category: fallbackCategory }));

    if (mode === 'delete_products') {
      const catProdIds = products
        .filter((p) => p.category === catName)
        .map((p) => p.id);
      if (catProdIds.length > 0) {
        const idSet = new Set(catProdIds);
        setProducts((prev) => prev.filter((p) => !idSet.has(p.id)));
        await deleteProductsBatchFromFirestore(ownerId, catProdIds);
      }
      setBillItems((prev) =>
        prev.map((it) =>
          it.category === catName ? { ...it, category: fallbackCategory } : it
        )
      );
      setDeductions((prev) =>
        prev.map((d) =>
          d.category === catName ? { ...d, category: fallbackCategory } : d
        )
      );
      await renameOrReassignCategoryInCloud({
        ownerId,
        categories: nextCategories,
        affectedProducts: [],
        affectedBillItems,
        affectedDeductions,
      });
      showToast(
        `Đã xóa danh mục "${catName}" và xóa ${catProdIds.length} sản phẩm thuộc danh mục này!`
      );
    } else {
      const affectedProducts = products
        .filter((p) => p.category === catName)
        .map((p) => ({ ...p, category: fallbackCategory }));

      setProducts((prev) =>
        prev.map((p) =>
          p.category === catName ? { ...p, category: fallbackCategory } : p
        )
      );
      setBillItems((prev) =>
        prev.map((it) =>
          it.category === catName ? { ...it, category: fallbackCategory } : it
        )
      );
      setDeductions((prev) =>
        prev.map((d) =>
          d.category === catName ? { ...d, category: fallbackCategory } : d
        )
      );
      await renameOrReassignCategoryInCloud({
        ownerId,
        categories: nextCategories,
        affectedProducts,
        affectedBillItems,
        affectedDeductions,
      });
      showToast(
        `Đã xóa danh mục "${catName}" và chuyển sản phẩm sang nhóm "${fallbackCategory}"!`
      );
    }
  };

  // Bill & Item Handlers
  const handleSaveExtractedBill = async (params: {
    billDate: string;
    rawDate?: string;
    checkInTime?: string;
    checkOutTime?: string;
    paymentType: PaymentType;
    debtorName: string;
    note: string;
    subtotalAmount?: number;
    discountAmount?: number;
    items: ExtractedBillItem[];
  }) => {
    setWorkspaceInitialized(true);
    const itemCats = params.items
      .map((it) => it.category?.trim())
      .filter(Boolean);

    let mergedCatsToSave: string[] | null = null;
    setCategories((prev) => {
      const next = [...prev];
      let added = false;
      for (const c of itemCats) {
        if (!next.some((existing) => existing.toLowerCase() === c.toLowerCase())) {
          next.push(c);
          added = true;
        }
      }
      if (added) {
        mergedCatsToSave = next;
        return next;
      }
      return prev;
    });
    if (mergedCatsToSave) {
      saveCategoriesToCloud(ownerId, mergedCatsToSave).catch(() => {});
    }

    if (params.paymentType === 'debt' && params.debtorName.trim()) {
      const cleanDebtor = params.debtorName.trim();
      unmarkDebtorDeletedLocally(cleanDebtor);
      if (
        !effectiveDebtors.some(
          (d) => d.toLowerCase() === cleanDebtor.toLowerCase()
        )
      ) {
        const nextDebtors = [...effectiveDebtors, cleanDebtor];
        setDebtors(nextDebtors);
        saveDebtorsToCloud(ownerId, nextDebtors).catch(() => {});
      }
    }

    const res = await saveNewBillToCloud({
      ownerId,
      billDate: params.billDate,
      rawDate: params.rawDate,
      checkInTime: params.checkInTime,
      checkOutTime: params.checkOutTime,
      paymentType: params.paymentType,
      debtorName: params.debtorName,
      note: params.note,
      subtotalAmount: params.subtotalAmount,
      discountAmount: params.discountAmount,
      items: params.items,
      existingProducts: products,
      autoAddProducts,
    });

    setBills((prev) =>
      dedupeRecordsById([res.bill, ...prev.filter((b) => b.id !== res.bill.id)])
    );
    const newItemIds = new Set(res.billItems.map((it) => it.id));
    setBillItems((prev) =>
      dedupeRecordsById([
        ...res.billItems,
        ...prev.filter((it) => !newItemIds.has(it.id)),
      ])
    );
    setProducts(dedupeRecordsById(res.updatedProducts));
    showToast(
      `Đã lưu Bill ${res.bill.billCode} (Ca ngày ${res.bill.billDate} · ${formatVND(
        res.bill.totalAmount
      )}) vào hệ thống!`
    );
    return res.bill;
  };

  const handleSaveOwnerUseBill = async (payload: {
    billDate: string;
    targetUser: string;
    note: string;
    items: ExtractedBillItem[];
  }) => {
    setWorkspaceInitialized(true);
    const zeroItems: ExtractedBillItem[] = payload.items.map((it) => ({
      ...it,
      unitPrice: 0,
      subtotal: 0,
    }));

    const res = await saveNewBillToCloud({
      ownerId,
      billDate: payload.billDate,
      paymentType: 'cash',
      debtorName: payload.targetUser || 'Chủ / Quản lý',
      note: payload.note || `[CHỦ/QL SỬ DỤNG] ${payload.targetUser || 'Chủ / Quản lý'}`,
      customBillCodePrefix: 'CHU-QL',
      subtotalAmount: 0,
      discountAmount: 0,
      items: zeroItems,
      existingProducts: products,
      autoAddProducts,
    });

    setBills((prev) =>
      dedupeRecordsById([res.bill, ...prev.filter((b) => b.id !== res.bill.id)])
    );
    const newItemIds = new Set(res.billItems.map((it) => it.id));
    setBillItems((prev) =>
      dedupeRecordsById([
        ...res.billItems,
        ...prev.filter((it) => !newItemIds.has(it.id)),
      ])
    );
    setProducts(dedupeRecordsById(res.updatedProducts));
    const totalQty = zeroItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    showToast(
      `Đã lưu phiếu Chủ/QL sử dụng ${res.bill.billCode} (+${totalQty} SL bán · Thành tiền: 0đ)!`
    );
  };

  const handleSaveEditedBill = async (
    updatedBill: BillRecord,
    updatedItems: BillItemRecord[]
  ) => {
    setWorkspaceInitialized(true);
    const oldItems = billItems.filter((it) => it.billId === updatedBill.id);
    await updateBillAndItemsInCloud({
      ownerId,
      bill: updatedBill,
      oldItems,
      newItems: updatedItems,
    });

    setBills((prev) => prev.map((b) => (b.id === updatedBill.id ? updatedBill : b)));
    setBillItems((prev) => [
      ...prev.filter((it) => it.billId !== updatedBill.id),
      ...updatedItems,
    ]);
    showToast(
      `Đã cập nhật hóa đơn ${updatedBill.billCode} lên Firebase (giá mặc định Menu được giữ nguyên)!`
    );
  };

  const handleUpdateBillItemPriceInline = async (
    bill: BillRecord,
    targetItem: BillItemRecord,
    newUnitPrice: number,
    newNote?: string
  ) => {
    const cleanPrice = Math.max(0, Math.round(Number(newUnitPrice) || 0));
    const currentItems = billItems.filter((it) => it.billId === bill.id);
    const updatedItems = currentItems.map((it) =>
      it.id === targetItem.id
        ? {
            ...it,
            unitPrice: cleanPrice,
            note: newNote !== undefined ? newNote : it.note,
            subtotal: it.quantity * cleanPrice,
            updatedAtMs: Date.now(),
          }
        : it
    );
    const newSubtotal = updatedItems.reduce(
      (sum, it) => sum + Math.round(it.quantity * it.unitPrice),
      0
    );
    const newTotal = Math.max(0, newSubtotal - (bill.discountAmount || 0));
    const summaryStr = truncateStr(
      updatedItems
        .map((it) => `${it.productName}${it.note ? ` (${it.note})` : ''} x${it.quantity}`)
        .join(', '),
      1000,
      ''
    );
    const updatedBill: BillRecord = {
      ...bill,
      subtotalAmount: newSubtotal,
      totalAmount: newTotal,
      itemsSummary: summaryStr,
      updatedAtMs: Date.now(),
    };
    await handleSaveEditedBill(updatedBill, updatedItems);
  };

  const handleDeleteBillDirect = async (bill: BillRecord) => {
    if (!canDelete && !canWrite) {
      showToast('Tài khoản hiện tại không có quyền xóa hóa đơn / công nợ.');
      return;
    }
    await handleDeleteMultipleBills([bill]);
  };

  const handleConfirmDeleteBill = (bill: BillRecord) => {
    if (!canDelete && !canWrite) {
      showToast('Tài khoản hiện tại không có quyền xóa hóa đơn.');
      return;
    }
    requestConfirm({
      title: 'Xác nhận Xóa Hóa Đơn',
      message: `Bạn có chắc chắn muốn xóa hóa đơn "${bill.billCode}" (Ngày ${
        bill.billDate
      }, Tổng tiền: ${formatVND(bill.totalAmount)}) khỏi hệ thống Firebase không?`,
      confirmLabel: 'Xóa hóa đơn',
      variant: 'danger',
      onConfirm: async () => {
        await handleDeleteBillDirect(bill);
      },
    });
  };

  const handleDeleteMultipleBills = async (
    billsToDelete: BillRecord[],
    overrideNextDebtors?: string[]
  ) => {
    if ((!canDelete && !canWrite) || billsToDelete.length === 0) return;
    setWorkspaceInitialized(true);

    const ids = new Set(billsToDelete.map((b) => b.id));
    markBillsDeletedLocally(Array.from(ids));

    if (inspectingBill && ids.has(inspectingBill.id)) {
      setInspectingBill(null);
    }
    if (editingBill && ids.has(editingBill.id)) {
      setEditingBill(null);
    }

    const bItems = effectiveBillItems.filter((it) => ids.has(it.billId));
    const bDeds = deductions.filter((d) => ids.has(d.billId));
    const bRets = returns.filter((r) => ids.has(r.billId));

    // Subtract deleted bill item quantities & revenue from products
    const touchedProducts: ProductRecord[] = [];
    const nextProducts = products.map((p) => {
      const matchingItems = bItems.filter(
        (it) =>
          it.productName.trim().toLowerCase() ===
          p.productName.trim().toLowerCase()
      );
      if (matchingItems.length === 0) return p;
      const qtyRemoved = matchingItems.reduce((s, it) => s + (it.quantity || 0), 0);
      const retRemoved = matchingItems.reduce(
        (s, it) => s + (it.returnedQuantity || 0),
        0
      );
      const revRemoved = matchingItems.reduce(
        (s, it) =>
          s +
          Math.max(0, (it.quantity - (it.returnedQuantity || 0)) * it.unitPrice),
        0
      );
      const updatedProd: ProductRecord = {
        ...p,
        totalSold: Math.max(0, (p.totalSold || 0) - qtyRemoved),
        totalReturned: Math.max(0, (p.totalReturned || 0) - retRemoved),
        totalRevenue: Math.max(0, (p.totalRevenue || 0) - revRemoved),
        updatedAtMs: Date.now(),
      };
      touchedProducts.push(updatedProd);
      return updatedProd;
    });

    const remainingBills = bills.filter((b) => !ids.has(b.id));

    // Clean up debtor names from debtors list if all bills for that debtor were deleted
    let nextDebtors = overrideNextDebtors ?? debtors;
    if (!overrideNextDebtors) {
      const deletedDebtorNames = Array.from(
        new Set(
          billsToDelete
            .map((b) => (b.debtorName || '').trim())
            .filter(Boolean)
        )
      );
      if (deletedDebtorNames.length > 0) {
        const remainingDebtorSet = new Set(
          remainingBills
            .map((b) => (b.debtorName || '').trim().toLowerCase())
            .filter(Boolean)
        );
        const debtorsToRemove = deletedDebtorNames.filter(
          (dName) => !remainingDebtorSet.has(dName.toLowerCase())
        );
        if (debtorsToRemove.length > 0) {
          markDebtorsDeletedLocally(debtorsToRemove);
          const removeLowerSet = new Set(
            debtorsToRemove.map((d) => d.toLowerCase())
          );
          nextDebtors = effectiveDebtors.filter(
            (d) => !removeLowerSet.has(d.trim().toLowerCase())
          );
        }
      }
    }

    setBills(remainingBills);
    setBillItems((prev) => prev.filter((it) => !ids.has(it.billId)));
    setDeductions((prev) => prev.filter((d) => !ids.has(d.billId)));
    setReturns((prev) => prev.filter((r) => !ids.has(r.billId)));
    if (touchedProducts.length > 0) {
      setProducts(nextProducts);
    }
    setDebtors(nextDebtors);

    if (billsToDelete.length === 1) {
      showToast(`Đã xóa hóa đơn ${billsToDelete[0].billCode} khỏi hệ thống!`);
    } else {
      showToast(`Đã xóa ${billsToDelete.length} hóa đơn khỏi hệ thống!`);
    }

    // Perform cloud deletion with timeout protection so UI never blocks
    await Promise.race([
      deleteBillsBatchFromCloud(
        ownerId,
        Array.from(ids),
        bItems,
        bDeds,
        bRets,
        touchedProducts,
        nextDebtors
      ),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
  };

  const handleSettleDebt = async (
    bill: BillRecord,
    settledVia: 'cash' | 'transfer'
  ) => {
    setWorkspaceInitialized(true);
    const updatedBill: BillRecord = {
      ...bill,
      paymentType: settledVia,
      debtStatus: 'paid',
      note: `${bill.note ? bill.note + ' · ' : ''}Đã thu nợ (${
        PAYMENT_LABELS[settledVia]
      }) từ ${bill.debtorName}`,
      updatedAtMs: Date.now(),
    };
    const items = billItems.filter((it) => it.billId === bill.id);
    await updateBillAndItemsInCloud({
      ownerId,
      bill: updatedBill,
      oldItems: items,
      newItems: items,
    });
    setBills((prev) => prev.map((b) => (b.id === bill.id ? updatedBill : b)));
    showToast(
      `Đã tất toán công nợ của ${bill.debtorName} sang ${PAYMENT_LABELS[settledVia]} trên Firebase!`
    );
  };

  const handleRecordPartialDebtPayment = async (params: {
    bill: BillRecord;
    amount: number;
    paymentMethod: 'cash' | 'transfer';
    paidDate: string;
    note: string;
  }) => {
    setWorkspaceInitialized(true);
    const now = Date.now();
    const newPayment: DebtPaymentRecord = {
      id: sanitizeId(`dpay_${now}_${Math.random().toString(36).slice(2, 6)}`),
      billId: params.bill.id,
      billCode: params.bill.billCode,
      debtorName: params.bill.debtorName || 'Khách nợ',
      amount: Math.max(0, Math.round(Number(params.amount) || 0)),
      paymentMethod: params.paymentMethod,
      paidDate: params.paidDate || todayStr,
      note: params.note,
      createdAtMs: now,
      createdBy: currentStaffAccount?.username || 'admin',
    };

    const existingPayments = inventoryData.debtPayments || [];
    const nextPayments = [...existingPayments, newPayment];
    const nextInventoryData: WorkspaceInventoryData = {
      ...inventoryData,
      debtPayments: nextPayments,
      updatedAtMs: now,
    };
    setInventoryData(nextInventoryData);
    await saveInventoryDataToCloud(ownerId, nextInventoryData, rolePermissions);

    // Check if cumulative installments cover 100% of the net bill amount
    const netOrig = Math.max(
      0,
      (Number(params.bill.totalAmount) || 0) - (Number(params.bill.deductedAmount) || 0)
    );
    const totalPaidForBill = nextPayments
      .filter((p) => p.billId === params.bill.id)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    if (netOrig > 0 && totalPaidForBill >= netOrig) {
      const updatedBill: BillRecord = {
        ...params.bill,
        paymentType: params.paymentMethod,
        debtStatus: 'paid',
        note: `${params.bill.note ? params.bill.note + ' · ' : ''}Đã thu đủ công nợ (${nextPayments.filter((p) => p.billId === params.bill.id).length} đợt) từ ${params.bill.debtorName}`,
        updatedAtMs: now,
      };
      const items = billItems.filter((it) => it.billId === params.bill.id);
      await updateBillAndItemsInCloud({
        ownerId,
        bill: updatedBill,
        oldItems: items,
        newItems: items,
      });
      setBills((prev) =>
        prev.map((b) => (b.id === params.bill.id ? updatedBill : b))
      );
      showToast(
        `Khách ${params.bill.debtorName} đã trả đủ 100% công nợ (${formatVND(
          netOrig
        )}) — Hóa đơn ${params.bill.billCode} đã tự động tất toán!`
      );
    } else {
      const remainingAfter = Math.max(0, netOrig - totalPaidForBill);
      showToast(
        `Đã ghi nhận trả nợ đợt này ${formatVND(newPayment.amount)} (${
          PAYMENT_LABELS[params.paymentMethod]
        }) — Dư nợ còn lại của ${params.bill.debtorName}: ${formatVND(remainingAfter)}!`
      );
    }
  };

  const handleDeletePartialDebtPayment = async (payment: DebtPaymentRecord) => {
    setWorkspaceInitialized(true);
    const now = Date.now();
    const nextPayments = (inventoryData.debtPayments || []).filter(
      (p) => p.id !== payment.id
    );
    const nextInventoryData: WorkspaceInventoryData = {
      ...inventoryData,
      debtPayments: nextPayments,
      updatedAtMs: now,
    };
    setInventoryData(nextInventoryData);
    await saveInventoryDataToCloud(ownerId, nextInventoryData, rolePermissions);

    // If bill was marked paid via installments, revert to unpaid debt if remaining > 0
    const parentBill = bills.find((b) => b.id === payment.billId);
    if (parentBill && parentBill.debtStatus === 'paid') {
      const netOrig = Math.max(
        0,
        (Number(parentBill.totalAmount) || 0) - (Number(parentBill.deductedAmount) || 0)
      );
      const paidRemaining = nextPayments
        .filter((p) => p.billId === parentBill.id)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (paidRemaining < netOrig) {
        const revertedBill: BillRecord = {
          ...parentBill,
          paymentType: 'debt',
          debtStatus: 'unpaid',
          updatedAtMs: now,
        };
        const items = billItems.filter((it) => it.billId === parentBill.id);
        await updateBillAndItemsInCloud({
          ownerId,
          bill: revertedBill,
          oldItems: items,
          newItems: items,
        });
        setBills((prev) =>
          prev.map((b) => (b.id === parentBill.id ? revertedBill : b))
        );
      }
    }
    showToast(
      `Đã xóa đợt trả nợ ${formatVND(payment.amount)} của khách ${payment.debtorName}.`
    );
  };

  // Split Bill / Merge Bills / Move Table Handlers
  const handleMoveTable = async (
    bill: BillRecord,
    newTableName: string,
    extraNote: string
  ) => {
    const cleanTable = newTableName.trim();
    const cleanExtra = extraNote.trim();
    const updatedNote = cleanExtra ? `${cleanTable} · ${cleanExtra}` : cleanTable;
    const currentItems = effectiveBillItems.filter((it) => it.billId === bill.id);
    const updatedBill: BillRecord = {
      ...bill,
      note: updatedNote,
      updatedAtMs: Date.now(),
    };
    await handleSaveEditedBill(updatedBill, currentItems);
    showToast(`Đã chuyển hóa đơn ${bill.billCode} sang ${cleanTable}!`);
  };

  const handleSplitBill = async (params: {
    sourceBill: BillRecord;
    remainingItems: BillItemRecord[];
    splitItems: { item: BillItemRecord; splitQty: number }[];
    newBillTableName: string;
    newBillPaymentType: PaymentType;
    newBillDebtorName: string;
    newBillNote: string;
  }) => {
    setWorkspaceInitialized(true);
    const now = Date.now();

    // 1. Update sourceBill with remainingItems
    const remSubtotal = params.remainingItems.reduce(
      (sum, it) => sum + Math.round(it.quantity * it.unitPrice),
      0
    );
    const remSummary = truncateStr(
      params.remainingItems
        .map(
          (it) =>
            `${it.productName}${it.note ? ` (${it.note})` : ''} x${it.quantity}`
        )
        .join(', '),
      1000,
      ''
    );
    const updatedSourceBill: BillRecord = {
      ...params.sourceBill,
      subtotalAmount: remSubtotal,
      totalAmount: Math.max(0, remSubtotal - (params.sourceBill.discountAmount || 0)),
      itemsSummary: remSummary,
      updatedAtMs: now,
    };
    const oldSourceItems = effectiveBillItems.filter(
      (it) => it.billId === params.sourceBill.id
    );
    await updateBillAndItemsInCloud({
      ownerId,
      bill: updatedSourceBill,
      oldItems: oldSourceItems,
      newItems: params.remainingItems,
    });
    setBills((prev) =>
      prev.map((b) => (b.id === updatedSourceBill.id ? updatedSourceBill : b))
    );
    setBillItems((prev) => [
      ...prev.filter((it) => it.billId !== updatedSourceBill.id),
      ...params.remainingItems,
    ]);

    // 2. Create the new split bill
    const extractedForNewBill: ExtractedBillItem[] = params.splitItems.map(
      ({ item, splitQty }) => ({
        productName: item.productName,
        note: item.note,
        category: item.category,
        quantity: splitQty,
        unitPrice: item.unitPrice,
        subtotal: splitQty * item.unitPrice,
        originalUnitPrice: item.originalUnitPrice,
      })
    );
    const combinedNewNote = params.newBillNote
      ? `${params.newBillTableName} · ${params.newBillNote}`
      : params.newBillTableName;

    const newBill = await handleSaveExtractedBill({
      billDate: params.sourceBill.billDate,
      rawDate: params.sourceBill.rawDate,
      checkInTime: params.sourceBill.checkInTime,
      checkOutTime: params.sourceBill.checkOutTime,
      paymentType: params.newBillPaymentType,
      debtorName: params.newBillDebtorName,
      note: combinedNewNote,
      subtotalAmount: extractedForNewBill.reduce((s, it) => s + it.subtotal, 0),
      discountAmount: 0,
      items: extractedForNewBill,
    });

    showToast(
      `Đã tách thành công từ ${params.sourceBill.billCode} sang Bill mới ${
        newBill?.billCode || ''
      } (${params.newBillTableName})!`
    );
  };

  const handleMergeBills = async (params: {
    targetBill: BillRecord;
    sourceBillsToMerge: BillRecord[];
    mergedTableName: string;
    mergedPaymentType: PaymentType;
    mergedDebtorName: string;
  }) => {
    setWorkspaceInitialized(true);
    const now = Date.now();
    const mergeIds = new Set(params.sourceBillsToMerge.map((b) => b.id));

    const targetItems = effectiveBillItems.filter(
      (it) => it.billId === params.targetBill.id
    );
    const sourceItems = effectiveBillItems.filter((it) =>
      mergeIds.has(it.billId)
    );

    // Combine items (merge identical productName + unitPrice + note, or append)
    const combinedItems: BillItemRecord[] = targetItems.map((it) => ({ ...it }));
    for (const sItem of sourceItems) {
      const existingIdx = combinedItems.findIndex(
        (c) =>
          c.productName.trim().toLowerCase() ===
            sItem.productName.trim().toLowerCase() &&
          c.unitPrice === sItem.unitPrice &&
          (c.note || '').trim().toLowerCase() ===
            (sItem.note || '').trim().toLowerCase()
      );
      if (existingIdx >= 0) {
        const cur = combinedItems[existingIdx];
        const nextQty = (cur.quantity || 0) + (sItem.quantity || 0);
        const nextRet = (cur.returnedQuantity || 0) + (sItem.returnedQuantity || 0);
        combinedItems[existingIdx] = {
          ...cur,
          quantity: nextQty,
          returnedQuantity: nextRet,
          subtotal: nextQty * cur.unitPrice,
          updatedAtMs: now,
        };
      } else {
        combinedItems.push({
          ...sItem,
          id: sanitizeId(
            `item_${params.targetBill.id}_${now}_${Math.random()
              .toString(36)
              .slice(2, 6)}`
          ),
          billId: params.targetBill.id,
          billDate: params.targetBill.billDate,
          updatedAtMs: now,
        });
      }
    }

    const mergedSubtotal = combinedItems.reduce(
      (s, it) => s + Math.round(it.quantity * it.unitPrice),
      0
    );
    const mergedDiscount =
      (params.targetBill.discountAmount || 0) +
      params.sourceBillsToMerge.reduce((s, b) => s + (b.discountAmount || 0), 0);
    const mergedDeducted =
      (params.targetBill.deductedAmount || 0) +
      params.sourceBillsToMerge.reduce((s, b) => s + (b.deductedAmount || 0), 0);
    const mergedTotal = Math.max(0, mergedSubtotal - mergedDiscount);
    const mergedSummary = truncateStr(
      combinedItems
        .map(
          (it) =>
            `${it.productName}${it.note ? ` (${it.note})` : ''} x${it.quantity}`
        )
        .join(', '),
      1000,
      ''
    );

    const updatedTargetBill: BillRecord = {
      ...params.targetBill,
      paymentType: params.mergedPaymentType,
      debtorName:
        params.mergedPaymentType === 'debt' ? params.mergedDebtorName : '',
      debtStatus: params.mergedPaymentType === 'debt' ? 'unpaid' : 'none',
      subtotalAmount: mergedSubtotal,
      discountAmount: mergedDiscount,
      totalAmount: mergedTotal,
      deductedAmount: mergedDeducted,
      itemsSummary: mergedSummary,
      note: `${params.mergedTableName} · Đã gộp từ ${params.sourceBillsToMerge
        .map((b) => b.billCode)
        .join(', ')}`,
      updatedAtMs: now,
    };

    await updateBillAndItemsInCloud({
      ownerId,
      bill: updatedTargetBill,
      oldItems: targetItems,
      newItems: combinedItems,
    });

    setBills((prev) =>
      prev.map((b) => (b.id === updatedTargetBill.id ? updatedTargetBill : b))
    );
    setBillItems((prev) => [
      ...prev.filter((it) => it.billId !== updatedTargetBill.id),
      ...combinedItems,
    ]);

    // Remove the merged source bills cleanly
    await handleDeleteMultipleBills(params.sourceBillsToMerge);

    showToast(
      `Đã gộp ${params.sourceBillsToMerge.length + 1} bàn vào hóa đơn ${
        updatedTargetBill.billCode
      } (${params.mergedTableName} · Tổng: ${formatVND(mergedTotal)})!`
    );
  };

  const handleSaveCalendarEvents = async (events: CalendarEventNote[]) => {
    setWorkspaceInitialized(true);
    const nextInventoryData: WorkspaceInventoryData = {
      ...inventoryData,
      calendarEvents: events,
      updatedAtMs: Date.now(),
    };
    setInventoryData(nextInventoryData);
    await saveInventoryDataToCloud(ownerId, nextInventoryData, rolePermissions);
  };

  const effectiveDeductionCategories = useMemo(() => {
    const result: string[] = [];
    const seen = new Set<string>();
    const addCat = (c?: string) => {
      const clean = String(c || '').trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push(clean);
      }
    };
    DEFAULT_DEDUCTION_CATEGORIES.forEach(addCat);
    (inventoryData.deductionCategories || []).forEach(addCat);
    deductions.forEach((d) => addCat(d.category));
    return result;
  }, [inventoryData.deductionCategories, deductions]);

  const handleAddDeductionCategory = async (categoryName: string) => {
    const clean = categoryName.trim();
    if (!clean) return;
    setWorkspaceInitialized(true);
    const currentList = effectiveDeductionCategories;
    if (currentList.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      return;
    }
    const nextList = [...currentList, clean];
    const nextInventoryData: WorkspaceInventoryData = {
      ...inventoryData,
      deductionCategories: nextList,
      updatedAtMs: Date.now(),
    };
    setInventoryData(nextInventoryData);
    await saveInventoryDataToCloud(ownerId, nextInventoryData, rolePermissions);
    showToast(`Đã tạo nhóm khoản trừ mới "${clean}"!`);
  };

  const handleDeleteDeductionCategory = async (categoryName: string) => {
    const clean = categoryName.trim();
    if (!clean) return;
    setWorkspaceInitialized(true);
    const nextList = effectiveDeductionCategories.filter(
      (c) => c.toLowerCase() !== clean.toLowerCase()
    );
    const nextInventoryData: WorkspaceInventoryData = {
      ...inventoryData,
      deductionCategories: nextList,
      updatedAtMs: Date.now(),
    };
    setInventoryData(nextInventoryData);
    await saveInventoryDataToCloud(ownerId, nextInventoryData, rolePermissions);
    showToast(`Đã xóa nhóm khoản trừ "${clean}".`);
  };

  const handleAddExpenseDeduction = async (params: {
    deductionDate: string;
    expenseTitle: string;
    category: string;
    quantity?: number;
    unitPrice?: number;
    amount: number;
    note: string;
  }) => {
    setWorkspaceInitialized(true);
    const cleanCat = (params.category || 'Khác').trim() || 'Khác';
    if (
      !effectiveDeductionCategories.some(
        (c) => c.toLowerCase() === cleanCat.toLowerCase()
      )
    ) {
      const nextList = [...effectiveDeductionCategories, cleanCat];
      const nextInv: WorkspaceInventoryData = {
        ...inventoryData,
        deductionCategories: nextList,
        updatedAtMs: Date.now(),
      };
      setInventoryData(nextInv);
      saveInventoryDataToCloud(ownerId, nextInv, rolePermissions).catch(() => {});
    }
    const ded = await saveExpenseDeductionToCloud({
      ownerId,
      deductionDate: params.deductionDate,
      expenseTitle: params.expenseTitle,
      category: cleanCat,
      quantity: params.quantity ?? 1,
      unitPrice: params.unitPrice ?? params.amount,
      amount: params.amount,
      note: params.note,
    });
    isApplyingRemoteSnapshotRef.current = false;
    setDeductions((prev) =>
      dedupeRecordsById([ded, ...prev.filter((d) => d.id !== ded.id)])
    );
    showToast(
      `Đã lưu khoản trừ "${params.expenseTitle}" (-${formatVND(
        params.amount
      )}) vào ngày ${params.deductionDate}!`
    );
  };

  const handleUpdateExpenseDeduction = async (params: {
    deduction: DeductionRecord;
    deductionDate: string;
    expenseTitle: string;
    category: string;
    quantity?: number;
    unitPrice?: number;
    amount: number;
    note: string;
  }) => {
    setWorkspaceInitialized(true);
    const linkedReturn = returns.find(
      (r) =>
        sanitizeId(`ded_${r.id}`) === params.deduction.id ||
        `ded_${r.id}` === params.deduction.id
    );
    const res = await updateExpenseDeductionInCloud({
      ownerId,
      deduction: params.deduction,
      updates: {
        deductionDate: params.deductionDate,
        expenseTitle: params.expenseTitle,
        category: params.category,
        quantity: params.quantity,
        unitPrice: params.unitPrice,
        amount: params.amount,
        note: params.note,
      },
      linkedReturn,
    });

    isApplyingRemoteSnapshotRef.current = false;
    setDeductions((prev) => {
      const exists = prev.some((d) => d.id === res.updatedDeduction.id);
      if (exists) {
        return prev.map((d) =>
          d.id === res.updatedDeduction.id ? res.updatedDeduction : d
        );
      }
      return [res.updatedDeduction, ...prev];
    });

    if (res.updatedReturn) {
      setReturns((prev) =>
        prev.map((r) =>
          r.id === res.updatedReturn!.id ? res.updatedReturn! : r
        )
      );
    }

    // Two-way sync: If this deduction is linked to a SalaryAdvanceRecord, update the salary advance too
    const currentAdvances = inventoryData.salaryAdvances || [];
    const linkedAdvIdx = currentAdvances.findIndex(
      (adv) =>
        adv.linkedDeductionId === params.deduction.id ||
        sanitizeId(`ded_${adv.id}`) === params.deduction.id ||
        adv.id === params.deduction.billId
    );
    if (linkedAdvIdx >= 0) {
      const nextAdvances = currentAdvances.map((adv, idx) =>
        idx === linkedAdvIdx
          ? {
              ...adv,
              advanceDate: params.deductionDate,
              amount: Math.max(0, Math.round(Number(params.amount) || 0)),
              note: params.note,
              updatedAtMs: Date.now(),
            }
          : adv
      );
      const nextInv: WorkspaceInventoryData = {
        ...inventoryData,
        salaryAdvances: nextAdvances,
        updatedAtMs: Date.now(),
      };
      setInventoryData(nextInv);
      saveInventoryDataToCloud(ownerId, nextInv, rolePermissions).catch(() => {});
    }

    showToast(
      `Đã cập nhật khoản trừ "${params.expenseTitle}" (-${formatVND(
        params.amount
      )}, ngày ${params.deductionDate})!`
    );
  };

  const handleRecordReturn = async (params: {
    bill: BillRecord;
    billItem: BillItemRecord;
    returnQty: number;
    returnDate: string;
    note: string;
  }) => {
    setWorkspaceInitialized(true);
    const matchingProd = products.find(
      (p) =>
        p.productName.toLowerCase().trim() ===
        params.billItem.productName.toLowerCase().trim()
    );

    const res = await recordItemReturnToCloud({
      ownerId,
      bill: params.bill,
      billItem: params.billItem,
      returnQty: params.returnQty,
      returnDate: params.returnDate,
      note: params.note,
      existingProduct: matchingProd,
    });

    setReturns((prev) =>
      dedupeRecordsById([
        res.returnRecord,
        ...prev.filter((r) => r.id !== res.returnRecord.id),
      ])
    );
    setDeductions((prev) =>
      dedupeRecordsById([
        res.linkedDeduction,
        ...prev.filter((d) => d.id !== res.linkedDeduction.id),
      ])
    );
    setBills((prev) =>
      prev.map((b) => (b.id === res.updatedBill.id ? res.updatedBill : b))
    );
    setBillItems((prev) =>
      prev.map((it) => (it.id === res.updatedBillItem.id ? res.updatedBillItem : it))
    );
    if (res.updatedProduct) {
      setProducts((prev) =>
        prev.map((p) => (p.id === res.updatedProduct!.id ? res.updatedProduct! : p))
      );
    }
    const tableName = extractBillTableName(params.bill);
    showToast(
      `Đã hoàn trả ${params.returnQty} ${params.billItem.productName} (${tableName}) và tự động tính vào Khoản trừ ngày ${params.returnDate} (-${formatVND(
        res.returnRecord.amount
      )} · 1 dòng tiền duy nhất)!`
    );
  };

  const handleDeleteDeductionsBatch = async (deductionIds: string[]) => {
    if (!canDelete || deductionIds.length === 0) return;
    setWorkspaceInitialized(true);
    const idSet = new Set(deductionIds);

    // Check if any deleted deduction is explicitly linked to a legacy customer return
    const linkedReturnIds = new Set<string>();
    for (const dId of deductionIds) {
      if (dId.startsWith('ded_ret_')) {
        linkedReturnIds.add(dId.slice(4));
      }
    }
    for (const r of returns) {
      if (idSet.has(sanitizeId(`ded_${r.id}`)) || idSet.has(`ded_${r.id}`)) {
        linkedReturnIds.add(r.id);
      }
    }

    if (linkedReturnIds.size > 0) {
      const removedReturns = returns.filter((r) => linkedReturnIds.has(r.id));
      setReturns((prev) => prev.filter((r) => !linkedReturnIds.has(r.id)));
      setBills((prev) =>
        prev.map((b) => {
          const bRets = removedReturns.filter((r) => r.billId === b.id);
          if (bRets.length === 0) return b;
          const totalRestored = bRets.reduce((s, r) => s + (Number(r.amount) || 0), 0);
          return {
            ...b,
            deductedAmount: Math.max(0, (b.deductedAmount || 0) - totalRestored),
          };
        })
      );
      setBillItems((prev) =>
        prev.map((it) => {
          const itRets = removedReturns.filter(
            (r) =>
              r.billId === it.billId &&
              r.productName.toLowerCase().trim() ===
                it.productName.toLowerCase().trim()
          );
          if (itRets.length === 0) return it;
          const restoredQty = itRets.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
          return {
            ...it,
            returnedQuantity: Math.max(0, (it.returnedQuantity || 0) - restoredQty),
          };
        })
      );
    }

    // Check if any deleted deduction is linked to a SalaryAdvanceRecord
    const currentAdvances = inventoryData.salaryAdvances || [];
    const remainingAdvances = currentAdvances.filter(
      (adv) =>
        !idSet.has(adv.linkedDeductionId) &&
        !idSet.has(sanitizeId(`ded_${adv.id}`)) &&
        !idSet.has(`ded_${adv.id}`) &&
        !idSet.has(adv.id)
    );
    if (remainingAdvances.length !== currentAdvances.length) {
      const nextInv: WorkspaceInventoryData = {
        ...inventoryData,
        salaryAdvances: remainingAdvances,
        updatedAtMs: Date.now(),
      };
      setInventoryData(nextInv);
      saveInventoryDataToCloud(ownerId, nextInv, rolePermissions).catch(() => {});
    }

    setDeductions((prev) => prev.filter((d) => !idSet.has(d.id)));
    await deleteDeductionsBatchFromCloud(ownerId, deductionIds);
    showToast(`Đã xóa ${deductionIds.length} khoản trừ khỏi hệ thống.`);
  };

  // ============================================================================
  // EMPLOYEE & SALARY ADVANCE HANDLERS (AUTO-SYNCED WITH KHOẢN TRỪ & STAFF ACCOUNTS)
  // ============================================================================
  const effectiveEmployees = useMemo<EmployeeRecord[]>(() => {
    const deletedSet = new Set<string>([
      ...Array.from(getDeletedEmployeeIds()),
      ...(inventoryData.deletedEmployeeIds || []),
    ]);
    const baseList = Array.isArray(inventoryData.employees)
      ? inventoryData.employees
      : buildInitialInventoryData(todayStr, yesterdayStr).employees || [];
    return baseList.filter(
      (emp) => !deletedSet.has(emp.id) && !deletedSet.has(sanitizeId(emp.id))
    );
  }, [
    inventoryData.employees,
    inventoryData.deletedEmployeeIds,
    todayStr,
    yesterdayStr,
  ]);

  const effectiveSalaryAdvances = useMemo<SalaryAdvanceRecord[]>(() => {
    return dedupeRecordsById(inventoryData.salaryAdvances || []);
  }, [inventoryData.salaryAdvances]);

  const handleAddEmployee = async (
    empInput: EmployeeUpsertInput
  ): Promise<EmployeeRecord> => {
    setWorkspaceInitialized(true);
    isApplyingRemoteSnapshotRef.current = false;
    const now = Date.now();
    const empId = sanitizeId(
      `emp_${now}_${Math.random().toString(36).slice(2, 6)}`
    );
    unmarkEmployeeDeletedLocally(empId);

    const hasLogin = Boolean(
      empInput.hasLoginAccount && empInput.systemRole && empInput.username
    );
    const cleanRolePos =
      empInput.roleOrPosition.trim() || 'Nhân viên phục vụ';

    let linkedStaffId: string | undefined;
    let resolvedTabs: ManagementTabId[] | undefined;

    if (hasLogin && empInput.systemRole && empInput.username) {
      const cleanUname = empInput.username.trim().toLowerCase();
      const cleanPass = empInput.password?.trim() || '123456';
      const defaultTabs =
        rolePermissions[empInput.systemRole]?.allowedTabs ||
        DEFAULT_ROLE_PERMISSIONS[empInput.systemRole].allowedTabs;
      resolvedTabs =
        empInput.useCustomTabs && empInput.allowedTabs?.length
          ? empInput.allowedTabs
          : defaultTabs;

      const existingAcc = staffAccounts.find(
        (a) => a.username.trim().toLowerCase() === cleanUname
      );
      const staffAccId =
        existingAcc?.id ||
        sanitizeId(`staff_${now}_${Math.random().toString(36).slice(2, 6)}`);
      linkedStaffId = staffAccId;
      unmarkStaffAccountDeletedLocally(staffAccId);

      const staffAccObj: StaffAccount = {
        id: staffAccId,
        ownerId,
        username: cleanUname,
        password: cleanPass,
        displayName: `${empInput.fullName.trim()} (${cleanRolePos})`,
        info: empInput.note?.trim() || `Nhân viên ${cleanRolePos}`,
        role: empInput.systemRole,
        active: true,
        allowedTabs: resolvedTabs,
        useCustomTabs: Boolean(empInput.useCustomTabs),
        createdAtMs: existingAcc?.createdAtMs || now,
        updatedAtMs: now,
      };

      setStaffAccounts((prev) =>
        existingAcc
          ? prev.map((a) => (a.id === staffAccId ? staffAccObj : a))
          : [...prev, staffAccObj]
      );
      await saveStaffAccountToFirebase(ownerId, staffAccObj, !existingAcc);
    }

    const newEmp: EmployeeRecord = {
      id: empId,
      fullName: empInput.fullName.trim(),
      roleOrPosition: cleanRolePos,
      phone: empInput.phone?.trim() || '',
      baseSalary: Math.max(0, Math.round(Number(empInput.baseSalary) || 0)),
      note: empInput.note?.trim() || '',
      active: true,
      hasLoginAccount: hasLogin,
      systemRole: hasLogin ? empInput.systemRole : undefined,
      username: hasLogin ? empInput.username?.trim().toLowerCase() : undefined,
      password: hasLogin ? empInput.password?.trim() || '123456' : undefined,
      linkedStaffAccountId: linkedStaffId,
      useCustomTabs: hasLogin ? Boolean(empInput.useCustomTabs) : false,
      allowedTabs: hasLogin ? resolvedTabs : undefined,
      createdAtMs: now,
      updatedAtMs: now,
    };

    const nextEmployees = [...effectiveEmployees, newEmp];
    const nextInventoryData: WorkspaceInventoryData = {
      ...inventoryData,
      employees: nextEmployees,
      deletedEmployeeIds: Array.from(getDeletedEmployeeIds()),
      updatedAtMs: now,
    };
    isApplyingRemoteSnapshotRef.current = false;
    setInventoryData(nextInventoryData);
    await saveInventoryDataToCloud(ownerId, nextInventoryData, rolePermissions);
    showToast(
      hasLogin
        ? `Đã thêm nhân viên "${newEmp.fullName}" với Role "${
            ROLE_LABELS[newEmp.systemRole!]
          }" (TK: @${newEmp.username})!`
        : `Đã thêm nhân viên "${newEmp.fullName}" (Mặc định: ${newEmp.roleOrPosition} — Không cần TK đăng nhập)!`
    );
    return newEmp;
  };

  const handleUpdateEmployee = async (
    empId: string,
    updates: EmployeeUpsertInput
  ) => {
    setWorkspaceInitialized(true);
    isApplyingRemoteSnapshotRef.current = false;
    const now = Date.now();
    const cleanName = updates.fullName.trim();
    const cleanRole = updates.roleOrPosition.trim() || 'Nhân viên phục vụ';
    const targetEmp = effectiveEmployees.find((e) => e.id === empId);

    const hasLogin = Boolean(
      updates.hasLoginAccount && updates.systemRole && updates.username
    );
    let linkedStaffId = targetEmp?.linkedStaffAccountId;
    let resolvedTabs: ManagementTabId[] | undefined;

    if (hasLogin && updates.systemRole && updates.username) {
      const cleanUname = updates.username.trim().toLowerCase();
      const cleanPass = updates.password?.trim() || '123456';
      const defaultTabs =
        rolePermissions[updates.systemRole]?.allowedTabs ||
        DEFAULT_ROLE_PERMISSIONS[updates.systemRole].allowedTabs;
      resolvedTabs =
        updates.useCustomTabs && updates.allowedTabs?.length
          ? updates.allowedTabs
          : defaultTabs;

      const existingAcc = staffAccounts.find(
        (a) =>
          (linkedStaffId && a.id === linkedStaffId) ||
          (targetEmp?.username &&
            a.username.trim().toLowerCase() ===
              targetEmp.username.trim().toLowerCase()) ||
          a.username.trim().toLowerCase() === cleanUname
      );
      const staffAccId =
        existingAcc?.id ||
        linkedStaffId ||
        sanitizeId(`staff_${now}_${Math.random().toString(36).slice(2, 6)}`);
      linkedStaffId = staffAccId;
      unmarkStaffAccountDeletedLocally(staffAccId);

      const staffAccObj: StaffAccount = {
        id: staffAccId,
        ownerId,
        username: cleanUname,
        password: cleanPass,
        displayName: `${cleanName} (${cleanRole})`,
        info: updates.note?.trim() || `Nhân viên ${cleanRole}`,
        role: updates.systemRole,
        active: true,
        allowedTabs: resolvedTabs,
        useCustomTabs: Boolean(updates.useCustomTabs),
        createdAtMs: existingAcc?.createdAtMs || now,
        updatedAtMs: now,
      };

      setStaffAccounts((prev) => {
        const exists = prev.some((a) => a.id === staffAccId);
        return exists
          ? prev.map((a) => (a.id === staffAccId ? staffAccObj : a))
          : [...prev, staffAccObj];
      });
      await saveStaffAccountToFirebase(ownerId, staffAccObj, !existingAcc);
    } else {
      // If switched back to default (no login account), remove any previously linked non-admin StaffAccount
      const oldLinkedAcc = staffAccounts.find(
        (a) =>
          a.username !== 'admin' &&
          a.id !== 'staff_admin' &&
          ((linkedStaffId && a.id === linkedStaffId) ||
            (targetEmp?.username &&
              a.username.trim().toLowerCase() ===
                targetEmp.username.trim().toLowerCase()))
      );
      if (oldLinkedAcc) {
        markStaffAccountsDeletedLocally([oldLinkedAcc.id]);
        setStaffAccounts((prev) => prev.filter((a) => a.id !== oldLinkedAcc.id));
        await deleteStaffAccountsFromFirebase(ownerId, [oldLinkedAcc.id]);
      }
      linkedStaffId = undefined;
    }

    const nextEmployees = effectiveEmployees.map((emp) =>
      emp.id === empId
        ? {
            ...emp,
            fullName: cleanName,
            roleOrPosition: cleanRole,
            phone: updates.phone?.trim() || '',
            baseSalary: Math.max(0, Math.round(Number(updates.baseSalary) || 0)),
            note: updates.note?.trim() || '',
            hasLoginAccount: hasLogin,
            systemRole: hasLogin ? updates.systemRole : undefined,
            username: hasLogin
              ? updates.username?.trim().toLowerCase()
              : undefined,
            password: hasLogin
              ? updates.password?.trim() || '123456'
              : undefined,
            linkedStaffAccountId: linkedStaffId,
            useCustomTabs: hasLogin ? Boolean(updates.useCustomTabs) : false,
            allowedTabs: hasLogin ? resolvedTabs : undefined,
            updatedAtMs: now,
          }
        : emp
    );

    // Sync employeeName & employeeRole to any existing salary advances of this employee
    const updatedAdvancesToSync: SalaryAdvanceRecord[] = [];
    const nextSalaryAdvances = effectiveSalaryAdvances.map((adv) => {
      if (adv.employeeId === empId) {
        const updatedAdv: SalaryAdvanceRecord = {
          ...adv,
          employeeName: cleanName,
          employeeRole: cleanRole,
          updatedAtMs: now,
        };
        updatedAdvancesToSync.push(updatedAdv);
        return updatedAdv;
      }
      return adv;
    });

    const nextInventoryData: WorkspaceInventoryData = {
      ...inventoryData,
      employees: nextEmployees,
      deletedEmployeeIds: Array.from(getDeletedEmployeeIds()),
      salaryAdvances: nextSalaryAdvances,
      updatedAtMs: now,
    };
    isApplyingRemoteSnapshotRef.current = false;
    setInventoryData(nextInventoryData);
    await saveInventoryDataToCloud(ownerId, nextInventoryData, rolePermissions);

    // Also update linked deductions in Firestore if employee name/role changed
    for (const adv of updatedAdvancesToSync) {
      const targetDed = effectiveDeductions.find(
        (d) =>
          d.id === adv.linkedDeductionId ||
          d.id === sanitizeId(`ded_${adv.id}`) ||
          d.billId === adv.id
      );
      if (targetDed) {
        const newTitle = `Ứng lương: ${cleanName}${
          cleanRole ? ` (${cleanRole})` : ''
        }`;
        const res = await updateExpenseDeductionInCloud({
          ownerId,
          deduction: targetDed,
          updates: {
            deductionDate: adv.advanceDate,
            expenseTitle: newTitle,
            category: 'Ứng lương nhân viên',
            quantity: 1,
            unitPrice: adv.amount,
            amount: adv.amount,
            note: adv.note,
          },
        });
        setDeductions((prev) =>
          prev.map((d) =>
            d.id === res.updatedDeduction.id ? res.updatedDeduction : d
          )
        );
      }
    }

    showToast(`Đã cập nhật thông tin nhân viên "${cleanName}"!`);
  };

  const handleDeleteEmployee = async (
    emp: EmployeeRecord,
    deleteAdvancesToo: boolean
  ) => {
    setWorkspaceInitialized(true);
    isApplyingRemoteSnapshotRef.current = false;
    const now = Date.now();

    // 1. Mark tombstone so this employee never resurrects from stale remote mirrors
    markEmployeesDeletedLocally([emp.id]);
    const allDeletedEmpIds = Array.from(
      new Set([
        ...Array.from(getDeletedEmployeeIds()),
        ...(inventoryData.deletedEmployeeIds || []),
        emp.id,
        sanitizeId(emp.id),
      ])
    );

    const nextEmployees = effectiveEmployees.filter(
      (e) => e.id !== emp.id && sanitizeId(e.id) !== sanitizeId(emp.id)
    );

    let nextAdvances = effectiveSalaryAdvances;
    const dedIdsToDelete: string[] = [];

    if (deleteAdvancesToo) {
      const removedAdvances = effectiveSalaryAdvances.filter(
        (a) =>
          a.employeeId === emp.id ||
          a.employeeName.trim().toLowerCase() ===
            emp.fullName.trim().toLowerCase()
      );
      const removedAdvIds = new Set(removedAdvances.map((a) => a.id));
      nextAdvances = effectiveSalaryAdvances.filter(
        (a) => !removedAdvIds.has(a.id)
      );
      for (const adv of removedAdvances) {
        if (adv.linkedDeductionId) dedIdsToDelete.push(adv.linkedDeductionId);
        dedIdsToDelete.push(sanitizeId(`ded_${adv.id}`));
      }
    }

    // 2. Also remove any linked non-admin login account from staffAccounts
    const linkedAccToRemove = staffAccounts.find(
      (a) =>
        a.username !== 'admin' &&
        a.id !== 'staff_admin' &&
        ((emp.linkedStaffAccountId && a.id === emp.linkedStaffAccountId) ||
          (emp.username &&
            a.username.trim().toLowerCase() ===
              emp.username.trim().toLowerCase()))
    );
    let nextStaffList = staffAccounts;
    if (linkedAccToRemove) {
      markStaffAccountsDeletedLocally([linkedAccToRemove.id]);
      nextStaffList = staffAccounts.filter((a) => a.id !== linkedAccToRemove.id);
      setStaffAccounts(nextStaffList);
      deleteStaffAccountsFromFirebase(ownerId, [linkedAccToRemove.id]).catch(
        () => {}
      );
    }

    const nextInventoryData: WorkspaceInventoryData = {
      ...inventoryData,
      employees: nextEmployees,
      deletedEmployeeIds: allDeletedEmpIds,
      salaryAdvances: nextAdvances,
      updatedAtMs: now,
    };

    const dedIdSet = new Set(dedIdsToDelete);
    const nextDedsList =
      dedIdsToDelete.length > 0
        ? deductions.filter((d) => !dedIdSet.has(d.id))
        : deductions;

    if (dedIdsToDelete.length > 0) {
      setDeductions(nextDedsList);
    }

    isApplyingRemoteSnapshotRef.current = false;
    setInventoryData(nextInventoryData);

    // 3. Immediately persist to LocalStorage mirror AND Express Cloud Server AND Firestore
    const updatedSnapshot: WorkspaceCacheSnapshot = {
      version: lastKnownServerVersionRef.current + 1,
      updatedAtMs: now,
      cloudSyncedOnce: true,
      initialized: true,
      categories,
      rolePermissions,
      inventoryData: nextInventoryData,
      products,
      bills,
      billItems,
      deductions: nextDedsList,
      returns,
      debtors,
      staffAccounts: nextStaffList,
    };
    saveLocalMirror(ownerId, updatedSnapshot);

    await Promise.all([
      pushWorkspaceToServer(
        updatedSnapshot,
        'replace',
        currentStaffAccount?.username || 'admin'
      ).then((res) => {
        if (res && res.ok) {
          lastKnownServerVersionRef.current = Math.max(
            lastKnownServerVersionRef.current,
            res.version
          );
          setCloudVersion(lastKnownServerVersionRef.current);
        }
      }),
      saveInventoryDataToCloud(ownerId, nextInventoryData, rolePermissions),
      dedIdsToDelete.length > 0
        ? deleteDeductionsBatchFromCloud(ownerId, dedIdsToDelete)
        : Promise.resolve(),
    ]);

    showToast(`Đã xóa nhân viên "${emp.fullName}" khỏi hệ thống thành công!`);
  };

  const handleAddSalaryAdvance = async (params: {
    employeeId: string;
    employeeName: string;
    employeeRole?: string;
    amount: number;
    advanceDate: string;
    note: string;
  }) => {
    setWorkspaceInitialized(true);
    const now = Date.now();
    const safeAmount = Math.max(0, Math.round(Number(params.amount) || 0));
    const effDate = params.advanceDate || todayStr;
    const salId = sanitizeId(
      `sal_${now}_${Math.random().toString(36).slice(2, 6)}`
    );
    const linkedDeductionId = sanitizeId(`ded_${salId}`);
    const dedTitle = `Ứng lương: ${params.employeeName}${
      params.employeeRole ? ` (${params.employeeRole})` : ''
    }`;

    const newAdvance: SalaryAdvanceRecord = {
      id: salId,
      ownerId,
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      employeeRole: params.employeeRole || '',
      amount: safeAmount,
      advanceDate: effDate,
      note: params.note,
      linkedDeductionId,
      createdAtMs: now,
      updatedAtMs: now,
      createdBy: currentStaffAccount?.username || 'admin',
    };

    const nextAdvances = [newAdvance, ...effectiveSalaryAdvances];
    const nextInventoryData: WorkspaceInventoryData = {
      ...inventoryData,
      employees: effectiveEmployees,
      salaryAdvances: nextAdvances,
      updatedAtMs: now,
    };
    setInventoryData(nextInventoryData);
    await saveInventoryDataToCloud(ownerId, nextInventoryData, rolePermissions);

    // Automatically record linked DeductionRecord in Khoản trừ (Chi trong ngày)
    const createdDed = await saveExpenseDeductionToCloud({
      ownerId,
      deductionDate: effDate,
      billDate: effDate,
      billCode: 'UNG-LUONG',
      customId: linkedDeductionId,
      customBillId: salId,
      expenseTitle: dedTitle,
      category: 'Ứng lương nhân viên',
      quantity: 1,
      unitPrice: safeAmount,
      amount: safeAmount,
      note: params.note,
    });

    isApplyingRemoteSnapshotRef.current = false;
    setDeductions((prev) =>
      dedupeRecordsById([
        createdDed,
        ...prev.filter((d) => d.id !== createdDed.id),
      ])
    );

    showToast(
      `Đã ghi nhận "${params.employeeName}" ứng lương -${formatVND(
        safeAmount
      )} (Ngày ${effDate}) và tự động trừ qua Khoản trừ!`
    );
  };

  const handleUpdateSalaryAdvance = async (params: {
    advance: SalaryAdvanceRecord;
    employeeId: string;
    employeeName: string;
    employeeRole?: string;
    amount: number;
    advanceDate: string;
    note: string;
  }) => {
    setWorkspaceInitialized(true);
    const now = Date.now();
    const safeAmount = Math.max(0, Math.round(Number(params.amount) || 0));
    const effDate = params.advanceDate || todayStr;
    const linkedDedId = sanitizeId(
      params.advance.linkedDeductionId || `ded_${params.advance.id}`
    );

    const updatedAdvance: SalaryAdvanceRecord = {
      ...params.advance,
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      employeeRole: params.employeeRole || '',
      amount: safeAmount,
      advanceDate: effDate,
      note: params.note,
      linkedDeductionId: linkedDedId,
      updatedAtMs: now,
    };

    const nextAdvances = effectiveSalaryAdvances.map((a) =>
      a.id === updatedAdvance.id ? updatedAdvance : a
    );
    const nextInventoryData: WorkspaceInventoryData = {
      ...inventoryData,
      employees: effectiveEmployees,
      salaryAdvances: nextAdvances,
      updatedAtMs: now,
    };
    setInventoryData(nextInventoryData);
    await saveInventoryDataToCloud(ownerId, nextInventoryData, rolePermissions);

    const dedTitle = `Ứng lương: ${params.employeeName}${
      params.employeeRole ? ` (${params.employeeRole})` : ''
    }`;
    const existingDed = effectiveDeductions.find(
      (d) =>
        d.id === linkedDedId ||
        d.id === params.advance.linkedDeductionId ||
        d.billId === params.advance.id
    );

    if (existingDed) {
      const res = await updateExpenseDeductionInCloud({
        ownerId,
        deduction: existingDed,
        updates: {
          deductionDate: effDate,
          expenseTitle: dedTitle,
          category: 'Ứng lương nhân viên',
          quantity: 1,
          unitPrice: safeAmount,
          amount: safeAmount,
          note: params.note,
        },
      });
      setDeductions((prev) => {
        const exists = prev.some((d) => d.id === res.updatedDeduction.id);
        return exists
          ? prev.map((d) =>
              d.id === res.updatedDeduction.id ? res.updatedDeduction : d
            )
          : [res.updatedDeduction, ...prev];
      });
    } else {
      const createdDed = await saveExpenseDeductionToCloud({
        ownerId,
        deductionDate: effDate,
        billDate: effDate,
        billCode: 'UNG-LUONG',
        customId: linkedDedId,
        customBillId: updatedAdvance.id,
        expenseTitle: dedTitle,
        category: 'Ứng lương nhân viên',
        quantity: 1,
        unitPrice: safeAmount,
        amount: safeAmount,
        note: params.note,
      });
      setDeductions((prev) =>
        dedupeRecordsById([
          createdDed,
          ...prev.filter((d) => d.id !== createdDed.id),
        ])
      );
    }

    showToast(
      `Đã cập nhật phiếu ứng lương của "${params.employeeName}" (-${formatVND(
        safeAmount
      )}, ngày ${effDate}) và đồng bộ sang Khoản trừ!`
    );
  };

  const handleDeleteSalaryAdvancesBatch = async (advanceIds: string[]) => {
    if ((!canDelete && !canWrite) || advanceIds.length === 0) return;
    setWorkspaceInitialized(true);
    const advIdSet = new Set(advanceIds);
    const removedAdvances = effectiveSalaryAdvances.filter((a) =>
      advIdSet.has(a.id)
    );
    const nextAdvances = effectiveSalaryAdvances.filter(
      (a) => !advIdSet.has(a.id)
    );

    const nextInventoryData: WorkspaceInventoryData = {
      ...inventoryData,
      employees: effectiveEmployees,
      salaryAdvances: nextAdvances,
      updatedAtMs: Date.now(),
    };
    setInventoryData(nextInventoryData);
    await saveInventoryDataToCloud(ownerId, nextInventoryData, rolePermissions);

    const linkedDedIds = Array.from(
      new Set(
        removedAdvances.flatMap((a) => [
          a.linkedDeductionId,
          sanitizeId(`ded_${a.id}`),
          `ded_${a.id}`,
        ])
      )
    ).filter(Boolean);

    if (linkedDedIds.length > 0) {
      const dedSet = new Set(linkedDedIds);
      setDeductions((prev) =>
        prev.filter((d) => !dedSet.has(d.id) && !advIdSet.has(d.billId))
      );
      await deleteDeductionsBatchFromCloud(ownerId, linkedDedIds);
    }

    showToast(
      `Đã xóa ${advanceIds.length} phiếu ứng lương và xóa khoản trừ đi kèm khỏi hệ thống.`
    );
  };

  const handleDeleteReturnsBatch = async (returnIds: string[]) => {
    if (!canDelete || returnIds.length === 0) return;
    setWorkspaceInitialized(true);
    const idSet = new Set(returnIds);
    const removedReturns = returns.filter((r) => idSet.has(r.id));
    const linkedDedIds = new Set(
      returnIds.flatMap((id) => [`ded_${id}`, sanitizeId(`ded_${id}`)])
    );

    setReturns((prev) => prev.filter((r) => !idSet.has(r.id)));
    setDeductions((prev) =>
      prev.filter((d) => {
        if (linkedDedIds.has(d.id)) return false;
        return !removedReturns.some(
          (r) =>
            d.billId === r.billId &&
            d.amount === r.amount &&
            (d.billCode === 'HOAN-TRA' ||
              d.productName.toLowerCase().includes(r.productName.toLowerCase()))
        );
      })
    );
    setBills((prev) =>
      prev.map((b) => {
        const bRets = removedReturns.filter((r) => r.billId === b.id);
        if (bRets.length === 0) return b;
        const totalRestored = bRets.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        return {
          ...b,
          deductedAmount: Math.max(0, (b.deductedAmount || 0) - totalRestored),
        };
      })
    );
    setBillItems((prev) =>
      prev.map((it) => {
        const itRets = removedReturns.filter(
          (r) =>
            r.billId === it.billId &&
            r.productName.toLowerCase().trim() ===
              it.productName.toLowerCase().trim()
        );
        if (itRets.length === 0) return it;
        const restoredQty = itRets.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        return {
          ...it,
          returnedQuantity: Math.max(0, (it.returnedQuantity || 0) - restoredQty),
        };
      })
    );

    await deleteReturnsBatchFromCloud(ownerId, returnIds);
    showToast(
      `Đã xóa ${returnIds.length} bản ghi hoàn trả và khoản trừ đi kèm khỏi hệ thống.`
    );
  };

  // Product Catalog Handlers
  const handleAddOrUpdateProduct = async (prodInput: {
    id?: string;
    productName: string;
    category: string;
    unitPrice: number;
    unit: string;
    totalSold?: number;
    totalReturned?: number;
    totalRevenue?: number;
  }) => {
    setWorkspaceInitialized(true);
    const cleanCat = prodInput.category.trim() || 'Khác';
    const cleanProdName = prodInput.productName.trim();

    let nextCatsToSave: string[] | null = null;
    setCategories((prev) => {
      if (prev.some((c) => c.toLowerCase() === cleanCat.toLowerCase())) {
        return prev;
      }
      nextCatsToSave = [...prev, cleanCat];
      return nextCatsToSave;
    });
    if (nextCatsToSave) {
      await saveCategoriesToCloud(ownerId, nextCatsToSave);
    }

    const now = Date.now();
    const existingProd = products.find(
      (p) =>
        (prodInput.id && p.id === prodInput.id) ||
        p.productName.toLowerCase().trim() === cleanProdName.toLowerCase()
    );

    const matchNamesLower = new Set<string>([cleanProdName.toLowerCase()]);
    if (existingProd?.productName) {
      matchNamesLower.add(existingProd.productName.trim().toLowerCase());
    }

    // Calculate cumulative sold/returned/revenue from matching billItems if product had 0 stats
    const matchingBillItems = effectiveBillItems.filter((it) =>
      matchNamesLower.has((it.productName || '').trim().toLowerCase())
    );
    const calcSold = matchingBillItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    const calcRet = matchingBillItems.reduce(
      (s, it) => s + (Number(it.returnedQuantity) || 0),
      0
    );
    const calcRev = matchingBillItems.reduce(
      (s, it) =>
        s +
        Math.max(0, (Number(it.quantity) || 0) - (Number(it.returnedQuantity) || 0)) *
          (Number(it.unitPrice) || 0),
      0
    );

    let productToSave: ProductRecord;
    const isUpdatingExisting = Boolean(existingProd);

    if (existingProd) {
      const nextSold =
        typeof prodInput.totalSold === 'number'
          ? Math.max(0, Math.round(prodInput.totalSold))
          : Math.max(existingProd.totalSold || 0, calcSold);
      const nextRet =
        typeof prodInput.totalReturned === 'number'
          ? Math.max(0, Math.round(prodInput.totalReturned))
          : Math.max(existingProd.totalReturned || 0, calcRet);
      const nextRev =
        typeof prodInput.totalRevenue === 'number'
          ? Math.max(0, Math.round(prodInput.totalRevenue))
          : Math.max(existingProd.totalRevenue || 0, calcRev);

      productToSave = {
        ...existingProd,
        productName: cleanProdName,
        category: cleanCat,
        unitPrice: prodInput.unitPrice,
        unit: prodInput.unit || existingProd.unit || 'Phần',
        totalSold: nextSold,
        totalReturned: nextRet,
        totalRevenue: nextRev,
        updatedAtMs: now,
      };
      setProducts((prev) =>
        dedupeRecordsById(
          prev.map((p) => (p.id === existingProd.id ? productToSave : p))
        )
      );
    } else {
      productToSave = {
        id: sanitizeId(`prod_${now}_${Math.random().toString(36).slice(2, 7)}`),
        ownerId,
        productName: cleanProdName,
        category: cleanCat,
        unitPrice: prodInput.unitPrice,
        unit: prodInput.unit || 'Phần',
        totalSold:
          typeof prodInput.totalSold === 'number'
            ? Math.max(0, Math.round(prodInput.totalSold))
            : calcSold,
        totalReturned:
          typeof prodInput.totalReturned === 'number'
            ? Math.max(0, Math.round(prodInput.totalReturned))
            : calcRet,
        totalRevenue:
          typeof prodInput.totalRevenue === 'number'
            ? Math.max(0, Math.round(prodInput.totalRevenue))
            : calcRev,
        createdAtMs: now,
        updatedAtMs: now,
      };
      setProducts((prev) =>
        dedupeRecordsById([
          productToSave,
          ...prev.filter((p) => p.id !== productToSave.id),
        ])
      );
    }

    // Sync category & productName to all matching billItems, returns, and inventoryData across the entire system
    const affectedBillItems: BillItemRecord[] = [];
    const nextBillItems = billItems.map((it) => {
      if (matchNamesLower.has((it.productName || '').trim().toLowerCase())) {
        if (it.category !== cleanCat || it.productName.trim() !== cleanProdName) {
          const updatedItem: BillItemRecord = {
            ...it,
            productName: cleanProdName,
            category: cleanCat,
            updatedAtMs: now,
          };
          affectedBillItems.push(updatedItem);
          return updatedItem;
        }
      }
      return it;
    });
    if (affectedBillItems.length > 0) {
      setBillItems(nextBillItems);
    }

    const affectedReturns: ReturnRecord[] = [];
    const nextReturns = returns.map((r) => {
      if (matchNamesLower.has((r.productName || '').trim().toLowerCase())) {
        if (r.category !== cleanCat || r.productName.trim() !== cleanProdName) {
          const updatedRet: ReturnRecord = {
            ...r,
            productName: cleanProdName,
            category: cleanCat,
            updatedAtMs: now,
          };
          affectedReturns.push(updatedRet);
          return updatedRet;
        }
      }
      return r;
    });
    if (affectedReturns.length > 0) {
      setReturns(nextReturns);
    }

    // Also sync inventoryData itemConfigs if product name or category changed
    if (existingProd) {
      const oldKey = existingProd.productName.trim().toLowerCase();
      const newKey = cleanProdName.toLowerCase();
      const existingCfg =
        inventoryData.itemConfigs?.[oldKey] || inventoryData.itemConfigs?.[newKey];
      if (existingCfg || oldKey !== newKey) {
        const nextConfigs = { ...(inventoryData.itemConfigs || {}) };
        if (oldKey !== newKey && nextConfigs[oldKey]) {
          delete nextConfigs[oldKey];
        }
        if (existingCfg) {
          nextConfigs[newKey] = {
            ...existingCfg,
            productName: cleanProdName,
            category: cleanCat,
            unit: prodInput.unit || existingCfg.unit || 'Lon',
          };
        }
        const nextDailyEntries = { ...(inventoryData.dailyEntries || {}) };
        if (oldKey !== newKey) {
          for (const dKey of Object.keys(nextDailyEntries)) {
            const dayMap = { ...(nextDailyEntries[dKey] || {}) };
            if (dayMap[oldKey]) {
              dayMap[newKey] = {
                ...dayMap[oldKey],
              };
              delete dayMap[oldKey];
              nextDailyEntries[dKey] = dayMap;
            }
          }
        }
        const nextInv: WorkspaceInventoryData = {
          ...inventoryData,
          itemConfigs: nextConfigs,
          dailyEntries: nextDailyEntries,
          updatedAtMs: now,
        };
        setInventoryData(nextInv);
        saveInventoryDataToCloud(ownerId, nextInv, rolePermissions).catch(() => {});
      }
    }

    await createOrUpdateProductInFirestore(
      ownerId,
      productToSave,
      isUpdatingExisting
    );

    if (affectedBillItems.length > 0 || affectedReturns.length > 0) {
      await renameOrReassignCategoryInCloud({
        ownerId,
        categories: nextCatsToSave || effectiveCategories,
        affectedProducts: [],
        affectedBillItems,
        affectedDeductions: [],
        affectedReturns,
      });
    }
  };

  const handleBulkUpsertProductsAndCategories = async (
    items: {
      productName: string;
      category: string;
      unitPrice: number;
      unit: string;
    }[]
  ): Promise<{ addedProductsCount: number; addedCategories: string[] }> => {
    if (!items || items.length === 0) {
      return { addedProductsCount: 0, addedCategories: [] };
    }
    setWorkspaceInitialized(true);

    // 1. Collect all unique categories from existing + bulk items
    const nextCategories = [...effectiveCategories];
    const addedCategories: string[] = [];
    for (const item of items) {
      const cleanCat = (item.category || 'Khác').trim() || 'Khác';
      const existingCat = nextCategories.find(
        (c) => c.toLowerCase() === cleanCat.toLowerCase()
      );
      if (!existingCat) {
        nextCategories.push(cleanCat);
        addedCategories.push(cleanCat);
      }
    }

    if (addedCategories.length > 0) {
      setCategories(nextCategories);
      await saveCategoriesToCloud(ownerId, nextCategories);
    }

    // 2. Batch upsert all products cleanly without stale closure
    const now = Date.now();
    const nextProducts = [...products];
    const toSyncCloud: { prod: ProductRecord; isUpdate: boolean }[] = [];
    const prodNameCatMap = new Map<string, string>();

    items.forEach((item, idx) => {
      const cleanName = item.productName.trim();
      if (!cleanName) return;
      const rawCat = (item.category || 'Khác').trim() || 'Khác';
      const canonicalCat =
        nextCategories.find((c) => c.toLowerCase() === rawCat.toLowerCase()) ||
        rawCat;

      prodNameCatMap.set(cleanName.toLowerCase(), canonicalCat);

      const existingIdx = nextProducts.findIndex(
        (p) => p.productName.toLowerCase().trim() === cleanName.toLowerCase()
      );

      if (existingIdx >= 0) {
        const updated: ProductRecord = {
          ...nextProducts[existingIdx],
          productName: cleanName,
          category: canonicalCat,
          unitPrice: Math.max(0, Math.round(Number(item.unitPrice) || 0)),
          unit: item.unit || nextProducts[existingIdx].unit || 'Phần',
          updatedAtMs: now + idx,
        };
        nextProducts[existingIdx] = updated;
        toSyncCloud.push({ prod: updated, isUpdate: true });
      } else {
        const created: ProductRecord = {
          id: sanitizeId(
            `prod_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`
          ),
          ownerId,
          productName: cleanName,
          category: canonicalCat,
          unitPrice: Math.max(0, Math.round(Number(item.unitPrice) || 0)),
          unit: item.unit || 'Phần',
          totalSold: 0,
          totalReturned: 0,
          totalRevenue: 0,
          createdAtMs: now + idx,
          updatedAtMs: now + idx,
        };
        nextProducts.unshift(created);
        toSyncCloud.push({ prod: created, isUpdate: false });
      }
    });

    setProducts(nextProducts);

    // Sync categories to matching billItems as well
    const affectedBillItems: BillItemRecord[] = [];
    const nextBillItems = billItems.map((it) => {
      const targetCat = prodNameCatMap.get(
        (it.productName || '').trim().toLowerCase()
      );
      if (targetCat && it.category !== targetCat) {
        const updatedItem: BillItemRecord = {
          ...it,
          category: targetCat,
          updatedAtMs: now,
        };
        affectedBillItems.push(updatedItem);
        return updatedItem;
      }
      return it;
    });
    if (affectedBillItems.length > 0) {
      setBillItems(nextBillItems);
    }

    for (const entry of toSyncCloud) {
      await createOrUpdateProductInFirestore(
        ownerId,
        entry.prod,
        entry.isUpdate
      );
    }

    if (affectedBillItems.length > 0) {
      await renameOrReassignCategoryInCloud({
        ownerId,
        categories: nextCategories,
        affectedProducts: [],
        affectedBillItems,
        affectedDeductions: [],
      });
    }

    return {
      addedProductsCount: toSyncCloud.length,
      addedCategories,
    };
  };

  const handleDeleteProduct = async (productId: string) => {
    setWorkspaceInitialized(true);
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    await deleteProductsBatchFromFirestore(ownerId, [productId]);
    showToast('Đã xóa sản phẩm khỏi Menu Firebase.');
  };

  const handleDeleteProductsBatch = async (productIds: string[]) => {
    if (productIds.length === 0) return;
    setWorkspaceInitialized(true);
    const idSet = new Set(productIds);
    setProducts((prev) => prev.filter((p) => !idSet.has(p.id)));
    await deleteProductsBatchFromFirestore(ownerId, productIds);
    showToast(`Đã xóa ${productIds.length} sản phẩm khỏi Menu Firebase!`);
  };

  const handleRequestDeleteAllMenuProducts = () => {
    if (!canWrite || products.length === 0) return;
    const allIds = products.map((p) => p.id);
    requestConfirm({
      title: 'Xác nhận Xóa Tất Cả Sản Phẩm Trong Menu',
      message: `Bạn có chắc chắn muốn xóa toàn bộ ${allIds.length} sản phẩm trong Menu khỏi hệ thống Firebase không? Hành động này không thể hoàn tác.`,
      confirmLabel: 'Xóa tất cả sản phẩm Menu',
      variant: 'danger',
      onConfirm: async () => {
        await handleDeleteProductsBatch(allIds);
      },
    });
  };

  const handleRequestDeleteCategoryMenuProducts = (category: string) => {
    if (!canWrite) return;
    const catProds = products.filter((p) => p.category === category);
    if (catProds.length === 0) return;
    const ids = catProds.map((p) => p.id);
    requestConfirm({
      title: `Xác nhận Xóa Sản Phẩm Nhóm "${category}"`,
      message: `Bạn có chắc chắn muốn xóa toàn bộ ${ids.length} sản phẩm thuộc danh mục "${category}" trong Menu khỏi Firebase không?`,
      confirmLabel: `Xóa tất cả nhóm ${category}`,
      variant: 'danger',
      onConfirm: async () => {
        await handleDeleteProductsBatch(ids);
      },
    });
  };

  const handleRequestRestoreSeedData = () => {
    requestConfirm({
      title: 'Xác nhận Khôi Phục Bộ Dữ Liệu Mẫu Chuẩn',
      message:
        'Bạn có chắc chắn muốn nạp lại bộ dữ liệu hóa đơn & thực đơn mẫu (gồm các Bill hôm nay và Bill ngày 20/08/2026) không?',
      confirmLabel: 'Xác nhận Khôi phục',
      variant: 'warning',
      onConfirm: async () => {
        const fresh = buildInitialSeedDataset(ownerId);
        const stdCats = Array.from(STANDARD_CATEGORIES);
        setWorkspaceInitialized(true);
        setCategories(stdCats);
        setProducts(fresh.products);
        setBills(fresh.bills);
        setBillItems(fresh.billItems);
        setDeductions(fresh.deductions);
        setReturns(fresh.returns);
        setDebtors(fresh.debtors);
        await saveCategoriesToCloud(ownerId, stdCats);
        await saveDebtorsToCloud(ownerId, fresh.debtors);
        for (const p of fresh.products) {
          await createOrUpdateProductInFirestore(ownerId, p, false);
        }
        showToast('Đã khôi phục bộ dữ liệu mẫu chuẩn lên hệ thống!');
      },
    });
  };

  const handleSaveInventoryData = async (
    nextData: WorkspaceInventoryData,
    toastMsg?: string
  ) => {
    setWorkspaceInitialized(true);
    setInventoryData(nextData);
    await saveInventoryDataToCloud(ownerId, nextData, rolePermissions);
    if (toastMsg) {
      showToast(toastMsg);
    }
  };

  // If not logged in, render AuthScreen (without any sample quick-fill buttons)
  if (!currentStaffAccount) {
    return (
      <>
        <AuthScreen
          staffAccounts={staffAccounts}
          onLoginSuccess={handleStaffLoginSuccess}
          onGoogleLogin={handleGoogleSignIn}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          authError={authError}
        />
        <LunarCalendarFloatingWidget
          calendarEvents={inventoryData.calendarEvents || []}
          onSaveCalendarEvents={handleSaveCalendarEvents}
          currentUsername="admin"
        />
      </>
    );
  }

  const allNavItems: {
    id: ActiveTab;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'home',
      label: 'Trang chủ (Sảnh điều hướng)',
      shortLabel: 'Trang chủ',
      icon: <Home className="w-4 h-4" />,
    },
    {
      id: 'dashboard',
      label: 'Tổng quan & Doanh thu',
      shortLabel: 'Tổng quan',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'ocr',
      label: 'Chụp / Nhập Bill OCR',
      shortLabel: 'Nhập Bill',
      icon: <Camera className="w-4 h-4" />,
    },
    {
      id: 'categories',
      label: 'Số lượng theo Danh mục',
      shortLabel: 'Danh mục',
      icon: <Layers className="w-4 h-4" />,
    },
    {
      id: 'inventory',
      label: 'Kho Đồ Uống & Tồn Kho',
      shortLabel: 'Kho đồ uống',
      icon: <Boxes className="w-4 h-4" />,
    },
    {
      id: 'owner_use',
      label: 'Chủ / Quản lý Sử dụng (0đ)',
      shortLabel: 'Chủ / QL dùng',
      icon: <UserCheck className="w-4 h-4" />,
    },
    {
      id: 'debts',
      label: 'Quản lý Công nợ',
      shortLabel: 'Công nợ',
      icon: <CreditCard className="w-4 h-4" />,
    },
    {
      id: 'deductions',
      label: 'Khoản trừ (Chi trong ngày)',
      shortLabel: 'Khoản trừ',
      icon: <Receipt className="w-4 h-4" />,
    },
    {
      id: 'returns',
      label: 'Hoàn trả (Bia / Món thừa)',
      shortLabel: 'Hoàn trả',
      icon: <RotateCcw className="w-4 h-4" />,
    },
    {
      id: 'salary_advances',
      label: 'Nhân viên Ứng lương',
      shortLabel: 'Ứng lương NV',
      icon: <Wallet className="w-4 h-4" />,
    },
    {
      id: 'products',
      label: 'Upload Sản phẩm / Menu',
      shortLabel: 'Thực đơn',
      icon: <Package className="w-4 h-4" />,
    },
    {
      id: 'accounts',
      label: 'Tài khoản & Phân quyền',
      shortLabel: 'Tài khoản',
      icon: <Shield className="w-4 h-4" />,
    },
  ];

  // Strictly filter navigation items to ONLY the management categories assigned by Admin
  const navItems = allNavItems.filter((item) => allowedTabs.includes(item.id));
  const isCurrentTabAllowed = allowedTabs.includes(activeTab);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col pb-16 lg:pb-0">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 h-14 px-3 sm:px-6 border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Mở menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <a
            href="/trang-chu"
            onClick={(e) => {
              e.preventDefault();
              handleSelectTab('home');
            }}
            className="flex items-center gap-2 text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap"
          >
            <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
              VQ
            </span>
            <span>VQBill</span>
          </a>
        </div>

        {/* Desktop Compact Horizontal Nav Links */}
        <nav className="hidden xl:flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectTab(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === item.id
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {item.icon}
              <span>{item.shortLabel}</span>
            </button>
          ))}
        </nav>

        {/* Primary Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <PWAInstallButton variant="header" />

          <button
            type="button"
            onClick={handleToggleHideMoney}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              hideMoney
                ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
            }`}
            title={
              hideMoney
                ? 'Đang bật Chế độ riêng tư (****** ₫) — Bấm để hiện số tiền'
                : 'Bấm để ẩn toàn bộ số tiền nhạy cảm (****** ₫)'
            }
          >
            {hideMoney ? (
              <>
                <EyeOff className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="hidden md:inline">Đang ẩn: ****** ₫</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                <span className="hidden md:inline">Ẩn số tiền</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowCloudSyncModal(true)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              cloudSyncStatus === 'synced'
                ? 'border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : cloudSyncStatus === 'syncing' || cloudSyncStatus === 'connecting'
                ? 'border-blue-200 dark:border-blue-800/80 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'border-amber-200 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
            }`}
            title="Trạng thái Đồng bộ Cloud đa thiết bị & trình duyệt"
          >
            {cloudSyncStatus === 'syncing' || cloudSyncStatus === 'connecting' ? (
              <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
            ) : (
              <Cloud className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="hidden md:inline">
              {cloudSyncStatus === 'synced'
                ? 'Cloud: Đồng bộ'
                : cloudSyncStatus === 'syncing' || cloudSyncStatus === 'connecting'
                ? 'Đang đồng bộ...'
                : 'Cloud: Offline'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowGeminiKeyModal(true)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              geminiKeyStatus.verified
                ? 'border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : geminiKeyStatus.configured
                ? 'border-blue-200 dark:border-blue-800/80 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'border-amber-200 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
            }`}
            title="Cấu hình & Check Gemini API Key"
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">
              {geminiKeyStatus.verified
                ? 'Gemini: OK'
                : geminiKeyStatus.configured
                ? 'Gemini: Đã lưu'
                : 'Gemini Key'}
            </span>
          </button>

          {allowedTabs.includes('ocr') && (
            <button
              type="button"
              onClick={() => handleSelectTab('ocr')}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shadow-xs"
            >
              <Camera className="w-3.5 h-3.5 shrink-0" />
              <span>+ Tạo Bill</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            title={darkMode ? 'Chế độ Sáng' : 'Chế độ Tối'}
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Slide-down Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-3 shadow-lg z-20">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {currentStaffAccount.displayName} (@{currentStaffAccount.username})
              </div>
              <div className="text-[11px] text-slate-500">
                {ROLE_LABELS[currentStaffAccount.role]} · {navItems.length}/{MANAGEMENT_TABS.length} danh mục
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đăng xuất</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  handleSelectTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Workspace Layout: Sidebar + Main Viewport */}
      <div className="flex-1 flex">
        {/* Desktop Sidebar (256px) */}
        <aside className="hidden lg:flex w-64 shrink-0 border-r border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex-col justify-between p-4">
          <div className="space-y-6">
            <div className="space-y-1">
              <div className="px-3 pb-1 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Danh mục quản lý
                </p>
                <span className="text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {navItems.length}/{MANAGEMENT_TABS.length}
                </span>
              </div>
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === item.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {/* Quick Summary Sidebar Box */}
            <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Tóm tắt kỳ đang xem
                </span>
                <button
                  type="button"
                  onClick={handleToggleHideMoney}
                  className="text-[11px] font-semibold text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 inline-flex items-center gap-1 cursor-pointer"
                  title="Ẩn/Hiện số tiền nhạy cảm"
                >
                  {hideMoney ? (
                    <>
                      <Eye className="w-3 h-3" />
                      <span>Hiện</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3 h-3" />
                      <span>Ẩn</span>
                    </>
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-500">Số Bill:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {periodBills.length} bill
                </span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-500">Thực đơn:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {effectiveCategories.length} nhóm / {products.length} món
                </span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-500">Tiền mặt thực:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatVND(financialSummary.netCashRevenue)}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-500">Chuyển khoản:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {formatVND(financialSummary.netTransferRevenue)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between font-mono">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Tổng ngày:
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatVND(financialSummary.netDayTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* User Profile & Logout */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="px-2 py-1">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {currentStaffAccount.displayName}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {ROLE_LABELS[currentStaffAccount.role]} · @{currentStaffAccount.username}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {allowedTabs.includes('accounts') && (
                <button
                  type="button"
                  onClick={() => handleSelectTab('accounts')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Phân quyền & Tài khoản</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đăng xuất</span>
              </button>
            </div>

            {!firebaseUser && (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full py-1.5 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Database className="w-3 h-3 text-emerald-500" />
                <span>Đồng bộ Google Cloud</span>
              </button>
            )}
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main
          key={hideMoney ? 'privacy-masked' : 'privacy-visible'}
          className="flex-1 min-w-0 p-3 sm:p-5 lg:p-6 max-w-[1360px] mx-auto w-full space-y-4 sm:space-y-6"
        >
          {/* Toast Notification */}
          {toastBanner && (
            <div className="p-3.5 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-between text-xs font-medium text-emerald-800 dark:text-emerald-200 shadow-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{toastBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastBanner(null)}
                className="text-emerald-600 font-semibold hover:underline ml-4 shrink-0 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          )}

          {/* Guard: If activeTab is not in allowedTabs */}
          {!isCurrentTabAllowed && (
            <div className="p-6 sm:p-8 border border-amber-300 dark:border-amber-800 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 text-center space-y-3">
              <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto" />
              <div className="text-base font-bold text-slate-900 dark:text-white">
                Danh mục này không nằm trong quyền truy cập của tài khoản @{currentStaffAccount.username}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                Tài khoản của bạn ({ROLE_LABELS[currentStaffAccount.role]}) chỉ được phép truy cập các danh mục quản lý mà Admin đã cấp quyền.
              </p>
              <button
                type="button"
                onClick={() => handleSelectTab(allowedTabs[0] || 'dashboard')}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                Về danh mục được cấp quyền
              </button>
            </div>
          )}

          {/* Read-Only Mode Banner when Role or Account is set to "Chỉ xem (Không được Thêm / Sửa / Xóa)" */}
          {isCurrentTabAllowed && !canWrite && !canDelete && (
            <div className="p-3 sm:p-3.5 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  <strong>Chế độ Chỉ xem (Không được Thêm / Sửa / Xóa):</strong>{' '}
                  Tài khoản <strong>@{currentStaffAccount.username}</strong> (
                  {ROLE_LABELS[currentStaffAccount.role]}) hiện chỉ được phép xem dữ liệu và báo cáo, không được phép thêm mới, chỉnh sửa hoặc xóa.
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-lg bg-amber-200/80 dark:bg-amber-900/70 text-[11px] font-bold text-amber-900 dark:text-amber-200 shrink-0">
                Chỉ xem
              </span>
            </div>
          )}

          {/* Global Time Period & Quick Menu Actions Bar (Visible on Dashboard & Categories) */}
          {isCurrentTabAllowed &&
            (activeTab === 'dashboard' || activeTab === 'categories') && (
              <div className="p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Period Filter Buttons */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 sm:pb-0">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1 shrink-0">
                      Kỳ xem:
                    </span>
                    {(
                      [
                        { id: 'today', label: 'Hôm nay' },
                        { id: 'yesterday', label: 'Hôm qua' },
                        { id: 'week', label: 'Theo Tuần' },
                        { id: 'month', label: 'Theo Tháng' },
                        { id: 'all', label: 'Tất cả' },
                        { id: 'custom', label: 'Chọn ngày' },
                      ] as { id: PeriodPreset; label: string }[]
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPeriodPreset(p.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                          periodPreset === p.id
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom Date Range Inputs */}
                  {periodPreset === 'custom' && (
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span>Từ:</span>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      />
                      <span>Đến:</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* TAB 0: HOME LAUNCHPAD (SẢNH ĐIỀU HƯỚNG CA LÀM VIỆC) */}
          {activeTab === 'home' && (
            <HomeLaunchpadTab
              todayStr={todayStr}
              currentStaffAccount={currentStaffAccount}
              allowedTabs={allowedTabs}
              bills={bills}
              deductions={effectiveDeductions}
              returns={returns}
              products={products}
              hideMoney={hideMoney}
              onToggleHideMoney={handleToggleHideMoney}
              onSelectTab={handleSelectTab}
              onInspectBill={(b) => setInspectingBill(b)}
            />
          )}

          {/* TAB 1: DASHBOARD & FINANCIAL LEDGER */}
          {activeTab === 'dashboard' && allowedTabs.includes('dashboard') && (
            <div className="space-y-4 sm:space-y-6">
              {/* Row 1: 4 Primary Gross Metrics (2x2 on mobile, 4 cols on desktop) */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                <div className="p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
                  <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
                    1. Tiền mặt (Gross)
                  </div>
                  <div className="mt-1 text-base sm:text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 truncate">
                    {formatVND(financialSummary.grossCash)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {
                      periodBills.filter(
                        (b) => b.paymentType === 'cash' && !isOwnerUseBill(b)
                      ).length
                    }{' '}
                    hóa đơn
                  </div>
                </div>

                <div className="p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
                  <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
                    2. Chuyển khoản
                  </div>
                  <div className="mt-1 text-base sm:text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 truncate">
                    {formatVND(financialSummary.grossTransfer)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {periodBills.filter((b) => b.paymentType === 'transfer').length} hóa đơn CK
                  </div>
                </div>

                <div className="p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
                  <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
                    3. Khoản trừ (Chi trong ngày)
                  </div>
                  <div className="mt-1 text-base sm:text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 truncate">
                    -{formatVND(financialSummary.totalDeductions)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {periodDeductions.length} khoản chi tiêu ngày
                  </div>
                </div>

                <div className="p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
                  <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
                    4. Công nợ (Tính riêng)
                  </div>
                  <div className="mt-1 text-base sm:text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 truncate">
                    {formatVND(financialSummary.totalDebt)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {
                      periodBills.filter(
                        (b) => b.paymentType === 'debt' && b.debtStatus !== 'paid'
                      ).length
                    }{' '}
                    bill ghi nợ (SL món vẫn tính vào TK ngày)
                  </div>
                </div>
              </div>

              {/* Row 2: Dedicated Sub-tab for Net Cash, Net Transfer, and Net Day Total Formula */}
              <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      Đối Soát Doanh Thu Thực Nhận & Tổng Ngày
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Công thức: Doanh thu tổng ngày = Tiền mặt + Chuyển khoản - Khoản trừ (Công nợ tính thành phần riêng)
                    </p>
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start">
                    <button
                      type="button"
                      onClick={() => setNetFormulaTab('net_summary')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        netFormulaTab === 'net_summary'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Tổng Thực Thu
                    </button>
                    <button
                      type="button"
                      onClick={() => setNetFormulaTab('formula_explain')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        netFormulaTab === 'formula_explain'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Chi Tiết Phép Tính
                    </button>
                  </div>
                </div>

                {netFormulaTab === 'net_summary' ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                    <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Tiền Mặt Thực Nhận (Sau Khoản Trừ)
                      </div>
                      <div className="mt-1.5 text-lg sm:text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatVND(financialSummary.netCashRevenue)}
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-slate-500">
                        ({formatVND(financialSummary.grossCash)} -{' '}
                        {formatVND(financialSummary.totalDeductions)})
                      </div>
                    </div>

                    <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Doanh Thu Chuyển Khoản
                      </div>
                      <div className="mt-1.5 text-lg sm:text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
                        {formatVND(financialSummary.netTransferRevenue)}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Toàn bộ bill CK / VietQR
                      </div>
                    </div>

                    <div className="p-3.5 sm:p-4 rounded-xl border-2 border-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-950/20">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        TỔNG NGÀY THỰC THU
                      </div>
                      <div className="mt-1.5 text-xl sm:text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatVND(financialSummary.netDayTotal)}
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        Tổng gộp cả quán (gồm nợ): {formatVND(financialSummary.totalAllBillsGross)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-xs space-y-2">
                    <div className="flex items-center justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                      <span>(+) Doanh thu Tiền mặt:</span>
                      <span className="font-semibold text-emerald-600">
                        {formatVND(financialSummary.grossCash)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                      <span>(+) Doanh thu Chuyển khoản:</span>
                      <span className="font-semibold text-blue-600">
                        {formatVND(financialSummary.grossTransfer)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                      <span>(-) Tổng Khoản trừ (Chi tiêu trong ngày):</span>
                      <span className="font-semibold text-rose-600">
                        -{formatVND(financialSummary.totalDeductions)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 text-sm font-bold text-slate-900 dark:text-white">
                      <span>(=) DOANH THU TỔNG NGÀY (Tiền mặt + CK - Khoản trừ):</span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {formatVND(financialSummary.netDayTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-dashed border-slate-200 dark:border-slate-800 text-xs text-amber-600 dark:text-amber-400">
                      <span>(Thành phần riêng) Công nợ trong kỳ:</span>
                      <span className="font-semibold">
                        {formatVND(financialSummary.totalDebt)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Row 3: Interactive Column Chart */}
              <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
                <RevenueColumnChart data={chartData} />
              </div>

              {/* Row 4: Advanced Search & Bills List */}
              <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      Danh Sách Hóa Đơn Bán Hàng ({displayedBills.length} bill)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Bấm trực tiếp vào từng hóa đơn để mở xem chi tiết các món trên bill và đối soát
                    </p>
                  </div>

                  {/* Advanced Filter Controls */}
                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-52">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="Tìm món, khách nợ, mã bill..."
                        className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:flex items-center gap-2">
                      <select
                        value={paymentFilter}
                        onChange={(e) => setPaymentFilter(e.target.value as any)}
                        className="px-2.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value="all">Mọi hình thức</option>
                        <option value="cash">Tiền mặt</option>
                        <option value="transfer">Chuyển khoản</option>
                        <option value="debt">Công nợ</option>
                        <option value="has_return">Có hoàn trả</option>
                        <option value="owner_use">Chủ / QL dùng (0đ)</option>
                      </select>

                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="px-2.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value="all">Mọi danh mục</option>
                        {effectiveCategories.map((c) => (
                          <option key={c} value={c}>
                            Nhóm: {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    {canDelete && displayedBills.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          requestConfirm({
                            title: 'Xác nhận Xóa Tất Cả Hóa Đơn Đang Hiển Thị',
                            message: `Bạn có chắc chắn muốn xóa toàn bộ ${displayedBills.length} hóa đơn đang lọc khỏi hệ thống Firebase không?`,
                            confirmLabel: 'Xóa tất cả hóa đơn',
                            variant: 'danger',
                            onConfirm: async () => {
                              await handleDeleteMultipleBills(displayedBills);
                            },
                          })
                        }
                        className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa tất cả ({displayedBills.length})</span>
                      </button>
                    )}
                  </div>
                </div>

                {displayedBills.length === 0 ? (
                  <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-500">
                    Không tìm thấy hóa đơn nào khớp với điều kiện lọc.
                  </div>
                ) : (
                  <>
                    {/* Mobile Bill Cards (< md) */}
                    <div className="md:hidden space-y-2.5">
                      {displayedBills.map((bill) => {
                        const netBill = Math.max(
                          0,
                          bill.totalAmount - (bill.deductedAmount || 0)
                        );
                        const billItemCount = effectiveBillItems.filter(
                          (it) => it.billId === bill.id
                        ).length;
                        return (
                          <div
                            key={bill.id}
                            onClick={() => setInspectingBill(bill)}
                            className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 hover:border-emerald-500/60 dark:hover:border-emerald-500/60 transition-colors space-y-2 text-xs cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <span>
                                    {bill.billCode} · {bill.billDate}
                                  </span>
                                  <span className="text-[11px] font-normal text-emerald-600 dark:text-emerald-400">
                                    ({billItemCount} món)
                                  </span>
                                </div>
                                {(bill.checkInTime || bill.checkOutTime) && (
                                  <div className="text-[11px] font-mono text-slate-500">
                                    Giờ: {bill.checkInTime || '--:--'} → {bill.checkOutTime || '--:--'}
                                    {bill.rawDate && bill.rawDate !== bill.billDate
                                      ? ` (In ${bill.rawDate})`
                                      : ''}
                                  </div>
                                )}
                                <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
                                  {isOwnerUseBill(bill)
                                    ? `Chủ / QL dùng (0đ)${
                                        bill.debtorName ? ` — ${bill.debtorName}` : ''
                                      }`
                                    : `${PAYMENT_LABELS[bill.paymentType]}${
                                        bill.debtorName ? ` — Nợ: ${bill.debtorName}` : ''
                                      }`}
                                  {(bill.discountAmount || 0) > 0
                                    ? ` · CK: -${formatVND(bill.discountAmount || 0)}`
                                    : ''}
                                </div>
                              </div>
                              <div className="text-right font-mono">
                                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                  {formatVND(netBill)}
                                </div>
                                {bill.deductedAmount > 0 && (
                                  <div className="text-[10px] text-rose-500">
                                    Trừ: -{formatVND(bill.deductedAmount)}
                                  </div>
                                )}
                              </div>
                            </div>

                            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                              {bill.itemsSummary}
                            </p>

                            <div
                              className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-800"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => setInspectingBill(bill)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Xem Bill</span>
                              </button>

                              <div className="flex items-center gap-1.5">
                                {canWrite && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setSplitMergeBill(bill)}
                                      className="px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-[11px] font-semibold text-blue-700 dark:text-blue-300 inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Scissors className="w-3 h-3" />
                                      <span>Tách/Gộp</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingBill(bill)}
                                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                                    >
                                      Sửa Bill
                                    </button>
                                    {allowedTabs.includes('returns') && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPreselectedReturnBillId(bill.id);
                                          handleSelectTab('returns');
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-[11px] font-semibold text-rose-600 dark:text-rose-400 cursor-pointer"
                                      >
                                        Hoàn trả
                                      </button>
                                    )}
                                  </>
                                )}
                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmDeleteBill(bill)}
                                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-[11px] font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Xóa</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop Table (>= md) */}
                    <div className="hidden md:block border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            <th className="py-2.5 px-3">Mã Bill / Ngày</th>
                            <th className="py-2.5 px-3">Hình thức & Khách</th>
                            <th className="py-2.5 px-3">Chi tiết các món (Bấm vào dòng để xem bill)</th>
                            <th className="py-2.5 px-3 text-right">Tổng gốc</th>
                            <th className="py-2.5 px-3 text-right">Khoản trừ</th>
                            <th className="py-2.5 px-3 text-right">Thực thu</th>
                            <th className="py-2.5 px-3 text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {displayedBills.map((bill) => {
                            const netBill = Math.max(
                              0,
                              bill.totalAmount - (bill.deductedAmount || 0)
                            );
                            const billItemCount = effectiveBillItems.filter(
                              (it) => it.billId === bill.id
                            ).length;
                            return (
                              <tr
                                key={bill.id}
                                onClick={() => setInspectingBill(bill)}
                                className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors cursor-pointer group"
                              >
                                <td className="py-3 px-3 font-mono">
                                  <div className="font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                    {bill.billCode}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Ca ngày: {bill.billDate}
                                  </div>
                                  {(bill.checkInTime || bill.checkOutTime) && (
                                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                      {bill.checkInTime || '--:--'} → {bill.checkOutTime || '--:--'}
                                      {bill.rawDate && bill.rawDate !== bill.billDate
                                        ? ` (${bill.rawDate})`
                                        : ''}
                                    </div>
                                  )}
                                </td>

                                <td className="py-3 px-3">
                                  <div className="font-semibold text-slate-900 dark:text-white">
                                    {isOwnerUseBill(bill)
                                      ? 'Chủ / QL dùng (0đ)'
                                      : PAYMENT_LABELS[bill.paymentType]}
                                  </div>
                                  {bill.debtorName && (
                                    <div
                                      className={`text-[11px] font-medium ${
                                        isOwnerUseBill(bill)
                                          ? 'text-indigo-600 dark:text-indigo-400'
                                          : 'text-amber-600 dark:text-amber-400'
                                      }`}
                                    >
                                      {isOwnerUseBill(bill)
                                        ? `Người dùng: ${bill.debtorName}`
                                        : `Nợ: ${bill.debtorName}`}
                                    </div>
                                  )}
                                  {bill.note && (
                                    <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                                      {bill.note}
                                    </div>
                                  )}
                                </td>

                                <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-xs">
                                  <div className="line-clamp-2">{bill.itemsSummary}</div>
                                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                                    {billItemCount} mặt hàng · Bấm để xem chi tiết bill
                                  </div>
                                </td>

                                <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                                  {formatVND(bill.totalAmount)}
                                </td>

                                <td className="py-3 px-3 text-right font-mono text-rose-600 dark:text-rose-400">
                                  {bill.deductedAmount > 0
                                    ? `-${formatVND(bill.deductedAmount)}`
                                    : '0 ₫'}
                                </td>

                                <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  {formatVND(netBill)}
                                </td>

                                <td
                                  className="py-3 px-3 text-right whitespace-nowrap space-x-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => setInspectingBill(bill)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 hover:bg-emerald-100 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1 cursor-pointer align-middle"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>Xem Bill</span>
                                  </button>
                                  {canWrite && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setSplitMergeBill(bill)}
                                        className="px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-[11px] font-semibold text-blue-700 dark:text-blue-300 inline-flex items-center gap-1 cursor-pointer align-middle"
                                        title="Chia Bill / Gộp Bàn / Chuyển Bàn"
                                      >
                                        <Scissors className="w-3 h-3" />
                                        <span>Tách/Gộp</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingBill(bill)}
                                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer align-middle"
                                      >
                                        Sửa Bill
                                      </button>
                                      {allowedTabs.includes('returns') && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setPreselectedReturnBillId(bill.id);
                                            handleSelectTab('returns');
                                          }}
                                          className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-semibold text-rose-600 dark:text-rose-400 cursor-pointer align-middle"
                                        >
                                          Hoàn trả
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => handleConfirmDeleteBill(bill)}
                                      className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-[11px] font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer align-middle"
                                      title="Xóa Bill"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>Xóa</span>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: AI OCR & TEXT BILL SCANNER */}
          {activeTab === 'ocr' && allowedTabs.includes('ocr') && (
            <OcrScannerTab
              canWrite={canWrite}
              categories={effectiveCategories}
              products={products}
              existingBills={bills}
              existingDebtors={effectiveDebtors}
              onDeleteDebtor={handleDeleteDebtor}
              autoAddProducts={autoAddProducts}
              onToggleAutoAddProducts={setAutoAddProducts}
              onSaveExtractedBill={handleSaveExtractedBill}
              onDeleteAllMenuProducts={handleRequestDeleteAllMenuProducts}
              menuProductsCount={products.length}
              geminiApiKey={geminiApiKey}
              geminiStatus={geminiKeyStatus}
              onSaveGeminiKey={handleSaveGeminiKey}
              onCheckGeminiKey={handleCheckGeminiKey}
              onClearGeminiKey={handleClearGeminiKey}
              requestConfirm={requestConfirm}
            />
          )}

          {/* TAB 3: CATEGORY & ITEM QUANTITY ANALYTICS */}
          {activeTab === 'categories' && allowedTabs.includes('categories') && (
            <CategoryAnalyticsTab
              billItems={permittedPeriodBillItemsForTab}
              products={permittedProductsForTab}
              categories={permittedCategoriesForTab}
              isCategoryRestricted={isProductCategoryRestricted}
              totalSystemCategoriesCount={effectiveCategories.length}
              roleLabel={ROLE_LABELS[activeRole]}
              periodLabel={periodLabel}
              periodType={
                periodPreset === 'today'
                  ? 'day'
                  : periodPreset === 'yesterday'
                  ? 'yesterday'
                  : periodPreset === 'week'
                  ? 'week'
                  : periodPreset === 'month'
                  ? 'month'
                  : 'all'
              }
              selectedDate={
                periodPreset === 'today'
                  ? todayStr
                  : periodPreset === 'yesterday'
                  ? yesterdayStr
                  : customStartDate
              }
              todayBusinessStr={todayStr}
              yesterdayBusinessStr={yesterdayStr}
              onChangePeriod={(type) => {
                if (type === 'day') setPeriodPreset('today');
                else if (type === 'yesterday') setPeriodPreset('yesterday');
                else if (type === 'week') setPeriodPreset('week');
                else if (type === 'month') setPeriodPreset('month');
                else setPeriodPreset('all');
              }}
              canWrite={canWrite}
              onDeleteAllMenuProducts={handleRequestDeleteAllMenuProducts}
              onDeleteCategoryMenuProducts={handleRequestDeleteCategoryMenuProducts}
              onAddCategory={handleAddCategory}
              onRenameCategory={handleRenameCategory}
              onDeleteCategory={handleDeleteCategory}
              onOpenInventoryTab={
                allowedTabs.includes('inventory')
                  ? () => handleSelectTab('inventory')
                  : undefined
              }
              requestConfirm={requestConfirm}
            />
          )}

          {/* TAB 3B: BEVERAGE & BASIC INVENTORY MANAGEMENT */}
          {activeTab === 'inventory' && allowedTabs.includes('inventory') && (
            <BeverageInventoryTab
              bills={bills}
              billItems={effectiveBillItems}
              products={products}
              returns={returns}
              categories={effectiveCategories}
              inventoryData={inventoryData}
              todayBusinessStr={todayStr}
              yesterdayBusinessStr={yesterdayStr}
              canWrite={canWrite}
              canDelete={canDelete}
              currentUsername={currentStaffAccount.username}
              onSaveInventoryData={handleSaveInventoryData}
              onAddOrUpdateProduct={handleAddOrUpdateProduct}
              onAddExpenseDeduction={(payload) =>
                handleAddExpenseDeduction({
                  ...payload,
                  expenseTitle: payload.productName,
                })
              }
              requestConfirm={requestConfirm}
            />
          )}

          {/* TAB 3C: OWNER & MANAGER CONSUMPTION (COUNTS QUANTITY SOLD, 0 REVENUE) */}
          {activeTab === 'owner_use' && allowedTabs.includes('owner_use') && (
            <OwnerConsumptionTab
              bills={bills}
              billItems={effectiveBillItems}
              products={products}
              categories={effectiveCategories}
              canWrite={canWrite}
              canDelete={canDelete}
              onSaveOwnerUseBill={handleSaveOwnerUseBill}
              onInspectBill={(b) => setInspectingBill(b)}
              onDeleteBill={handleDeleteBillDirect}
              requestConfirm={requestConfirm}
            />
          )}

          {/* TAB 4: DEBT MANAGEMENT & SCROLL INSPECTOR */}
          {activeTab === 'debts' && allowedTabs.includes('debts') && (
            <DebtManagerTab
              bills={bills}
              billItems={effectiveBillItems}
              products={products}
              debtors={effectiveDebtors}
              debtPayments={inventoryData.debtPayments || []}
              onAddDebtor={handleAddDebtor}
              onDeleteDebtor={handleDeleteDebtor}
              canWrite={canWrite}
              canDelete={canDelete}
              onEditBill={(bill) => setEditingBill(bill)}
              onUpdateBillItemPriceInline={handleUpdateBillItemPriceInline}
              onJumpToReturnForBill={(bill) => {
                setPreselectedReturnBillId(bill.id);
                handleSelectTab('returns');
              }}
              onSettleDebt={handleSettleDebt}
              onRecordPartialDebtPayment={handleRecordPartialDebtPayment}
              onDeletePartialDebtPayment={handleDeletePartialDebtPayment}
              onDeleteBill={handleDeleteBillDirect}
              onDeleteAllDebtBills={handleDeleteMultipleBills}
              onDeleteAllMenuProducts={handleRequestDeleteAllMenuProducts}
              menuProductsCount={products.length}
              requestConfirm={requestConfirm}
            />
          )}

          {/* TAB 5A: DEDUCTIONS (DAILY EXPENSES) */}
          {activeTab === 'deductions' && allowedTabs.includes('deductions') && (
            <ReturnsDeductionsTab
              mode="deductions"
              bills={bills}
              billItems={effectiveBillItems}
              deductions={effectiveDeductions}
              returns={returns}
              canWrite={canWrite}
              canDelete={canDelete}
              preselectedBillId={preselectedReturnBillId}
              deductionCategories={effectiveDeductionCategories}
              onAddDeductionCategory={handleAddDeductionCategory}
              onDeleteDeductionCategory={handleDeleteDeductionCategory}
              onAddExpenseDeduction={handleAddExpenseDeduction}
              onUpdateExpenseDeduction={handleUpdateExpenseDeduction}
              onRecordReturn={handleRecordReturn}
              onDeleteDeductionsBatch={handleDeleteDeductionsBatch}
              onDeleteReturnsBatch={handleDeleteReturnsBatch}
              onDeleteAllMenuProducts={handleRequestDeleteAllMenuProducts}
              menuProductsCount={products.length}
              requestConfirm={requestConfirm}
            />
          )}

          {/* TAB 5B: RETURNS (CUSTOMER BEER / DISH RETURNS) */}
          {activeTab === 'returns' && allowedTabs.includes('returns') && (
            <ReturnsDeductionsTab
              mode="returns"
              bills={bills}
              billItems={effectiveBillItems}
              deductions={effectiveDeductions}
              returns={returns}
              canWrite={canWrite}
              canDelete={canDelete}
              preselectedBillId={preselectedReturnBillId}
              deductionCategories={effectiveDeductionCategories}
              onAddDeductionCategory={handleAddDeductionCategory}
              onDeleteDeductionCategory={handleDeleteDeductionCategory}
              onAddExpenseDeduction={handleAddExpenseDeduction}
              onUpdateExpenseDeduction={handleUpdateExpenseDeduction}
              onRecordReturn={handleRecordReturn}
              onDeleteDeductionsBatch={handleDeleteDeductionsBatch}
              onDeleteReturnsBatch={handleDeleteReturnsBatch}
              onDeleteAllMenuProducts={handleRequestDeleteAllMenuProducts}
              menuProductsCount={products.length}
              requestConfirm={requestConfirm}
            />
          )}

          {/* TAB 5C: EMPLOYEE SALARY ADVANCES (AUTO-SYNCED TO DEDUCTIONS) */}
          {activeTab === 'salary_advances' &&
            allowedTabs.includes('salary_advances') && (
              <SalaryAdvanceTab
                employees={effectiveEmployees}
                salaryAdvances={effectiveSalaryAdvances}
                staffAccounts={staffAccounts}
                rolePermissions={rolePermissions}
                isAdminUser={isAdminUser}
                canWrite={canWrite}
                canDelete={canDelete}
                onAddEmployee={handleAddEmployee}
                onUpdateEmployee={handleUpdateEmployee}
                onDeleteEmployee={handleDeleteEmployee}
                onAddSalaryAdvance={handleAddSalaryAdvance}
                onUpdateSalaryAdvance={handleUpdateSalaryAdvance}
                onDeleteSalaryAdvancesBatch={handleDeleteSalaryAdvancesBatch}
                onOpenDeductionsTab={
                  allowedTabs.includes('deductions')
                    ? () => handleSelectTab('deductions')
                    : undefined
                }
                requestConfirm={requestConfirm}
              />
            )}

          {/* TAB 6: PRODUCT CATALOG & MENU UPLOAD */}
          {activeTab === 'products' && allowedTabs.includes('products') && (
            <ProductCatalogTab
              products={products}
              categories={effectiveCategories}
              canWrite={canWrite}
              autoAddProducts={autoAddProducts}
              onToggleAutoAddProducts={setAutoAddProducts}
              onAddOrUpdateProduct={handleAddOrUpdateProduct}
              onBulkUpsertProducts={handleBulkUpsertProductsAndCategories}
              onDeleteProduct={handleDeleteProduct}
              onDeleteProductsBatch={handleDeleteProductsBatch}
              onAddCategory={handleAddCategory}
              onRenameCategory={handleRenameCategory}
              onDeleteCategory={handleDeleteCategory}
              geminiApiKey={geminiApiKey}
              geminiStatus={geminiKeyStatus}
              onSaveGeminiKey={handleSaveGeminiKey}
              onCheckGeminiKey={handleCheckGeminiKey}
              onClearGeminiKey={handleClearGeminiKey}
              requestConfirm={requestConfirm}
            />
          )}

          {/* TAB 7: ADMIN ACCOUNTS & PERMISSIONS MANAGER */}
          {activeTab === 'accounts' &&
            isAdminUser &&
            allowedTabs.includes('accounts') && (
              <AccountsManagerTab
                staffAccounts={staffAccounts}
                currentAccount={currentStaffAccount}
                rolePermissions={rolePermissions}
                productCategories={effectiveCategories}
                onSaveRolePermissions={handleSaveRolePermissions}
                onCreateAccount={handleCreateStaffAccount}
                onUpdateAccount={handleUpdateStaffAccount}
                onDeleteAccount={handleDeleteStaffAccount}
                onDeleteAllNonAdminAccounts={handleDeleteAllNonAdminAccounts}
                onSwitchAccount={(acc) => {
                  setLoggedInStaff(acc);
                  localStorage.setItem('vqbill_active_staff', JSON.stringify(acc));
                  const eff = getEffectiveRolePermissions(acc, rolePermissions);
                  if (!eff.allowedTabs.includes(activeTab)) {
                    setActiveTab(eff.allowedTabs[0] || 'dashboard');
                  }
                  showToast(
                    `Đã chuyển sang tài khoản ${acc.displayName} (${ROLE_LABELS[acc.role]}) — Được phép truy cập ${eff.allowedTabs.length} danh mục quản lý.`
                  );
                }}
                requestConfirm={requestConfirm}
              />
            )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (< lg) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 px-1 py-1 flex items-center justify-around overflow-x-auto no-scrollbar">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                handleSelectTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl min-w-[60px] transition-colors cursor-pointer ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50/70 dark:bg-emerald-950/40'
                  : 'text-slate-500 dark:text-slate-400 font-medium'
              }`}
            >
              {item.icon}
              <span className="text-[10px] mt-0.5 whitespace-nowrap">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Multi-Device Cloud Sync Status & Control Modal */}
      {showCloudSyncModal && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-xl rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Đồng Bộ Dữ Liệu Cloud Đa Thiết Bị & Đa Trình Duyệt
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCloudSyncModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      {cloudSyncStatus === 'synced'
                        ? 'Đã kết nối & Đồng bộ Cloud Thời Gian Thực'
                        : cloudSyncStatus === 'syncing' || cloudSyncStatus === 'connecting'
                        ? 'Đang đồng bộ dữ liệu với Cloud...'
                        : 'Đang dùng bộ nhớ đệm (Chờ kết nối mạng)'}
                    </span>
                  </span>
                  <span className="font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[11px]">
                    Trực tuyến
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Mọi hóa đơn, thực đơn, danh mục, công nợ, hoàn trả và tài khoản nhân sự đều được lưu trực tiếp trên Cloud chung của quán. Dù bạn đăng nhập bằng tài khoản{' '}
                  <strong>@admin</strong>, tài khoản nhân viên hay Google trên bất kỳ trình duyệt hoặc điện thoại/máy tính nào cũng sẽ tự động thấy cùng một dữ liệu.
                </p>
                {lastCloudSyncAt && (
                  <div className="text-[11px] font-mono text-slate-500 pt-1">
                    Cập nhật lần cuối:{' '}
                    {new Date(lastCloudSyncAt).toLocaleTimeString('vi-VN')} · Tự động kiểm tra mỗi 3 giây
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-[11px] text-slate-500">Hóa đơn đã lưu</div>
                  <div className="mt-0.5 text-base font-bold font-mono text-slate-900 dark:text-white">
                    {bills.length} bill
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-[11px] text-slate-500">Món trong Menu</div>
                  <div className="mt-0.5 text-base font-bold font-mono text-slate-900 dark:text-white">
                    {products.length} món
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-[11px] text-slate-500">Danh mục nhóm</div>
                  <div className="mt-0.5 text-base font-bold font-mono text-slate-900 dark:text-white">
                    {effectiveCategories.length} nhóm
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-[11px] text-slate-500">Tài khoản NS</div>
                  <div className="mt-0.5 text-base font-bold font-mono text-slate-900 dark:text-white">
                    {staffAccounts.length} TK
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handlePullFromCloud(true)}
                  className="p-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <DownloadCloud className="w-4 h-4 shrink-0" />
                  <span>Tải dữ liệu mới nhất từ Cloud</span>
                </button>

                <button
                  type="button"
                  onClick={handleForcePushToCloud}
                  className="p-3 rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-800 dark:text-blue-200 font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4 shrink-0" />
                  <span>Đẩy dữ liệu máy này lên Cloud</span>
                </button>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">
                  {firebaseUser
                    ? `Đã liên kết Google Firestore (${firebaseUser.email})`
                    : 'Đang dùng Cloud Server trung tâm (Hỗ trợ mọi tài khoản @admin / nhân viên)'}
                </div>
                <button
                  type="button"
                  onClick={() => setShowCloudSyncModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gemini API Key Popup Modal */}
      {showGeminiKeyModal && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-2xl rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Cấu Hình & Kiểm Tra Gemini API Key
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGeminiKeyModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              <GeminiKeyBar
                geminiApiKey={geminiApiKey}
                geminiStatus={geminiKeyStatus}
                onSaveGeminiKey={handleSaveGeminiKey}
                onCheckGeminiKey={handleCheckGeminiKey}
                onClearGeminiKey={handleClearGeminiKey}
                requestConfirm={requestConfirm}
                contextLabel="Nhập Gemini API Key (AIza...) rồi bấm Lưu Key hoặc Kiểm tra để sử dụng AI quét hóa đơn OCR và nhận diện thực đơn tự động."
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  {allowedTabs.includes('ocr') && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowGeminiKeyModal(false);
                        handleSelectTab('ocr');
                      }}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                    >
                      Mở tab Chụp / Nhập Bill OCR
                    </button>
                  )}
                  {allowedTabs.includes('products') && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowGeminiKeyModal(false);
                        handleSelectTab('products');
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                    >
                      Mở tab Upload Thực đơn
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowGeminiKeyModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bill Check / Receipt Inspection Modal */}
      {inspectingBill &&
        (() => {
          const liveBill =
            bills.find((b) => b.id === inspectingBill.id) || inspectingBill;
          const currentIdx = displayedBills.findIndex(
            (b) => b.id === liveBill.id
          );
          const hasPrev = currentIdx > 0;
          const hasNext =
            currentIdx >= 0 && currentIdx < displayedBills.length - 1;
          return (
            <BillCheckModal
              bill={liveBill}
              items={effectiveBillItems.filter((it) => it.billId === liveBill.id)}
              products={products}
              billReturns={returns.filter((r) => r.billId === liveBill.id)}
              billDeductions={effectiveDeductions.filter((d) => d.billId === liveBill.id)}
              canWrite={canWrite}
              canDelete={canDelete}
              canAccessReturns={allowedTabs.includes('returns')}
              currentIndex={currentIdx >= 0 ? currentIdx : 0}
              totalBills={displayedBills.length}
              onPrevBill={
                hasPrev
                  ? () => setInspectingBill(displayedBills[currentIdx - 1])
                  : undefined
              }
              onNextBill={
                hasNext
                  ? () => setInspectingBill(displayedBills[currentIdx + 1])
                  : undefined
              }
              onClose={() => setInspectingBill(null)}
              onEditBill={(b) => setEditingBill(b)}
              onReturnBill={(b) => {
                setPreselectedReturnBillId(b.id);
                handleSelectTab('returns');
              }}
              onDeleteBill={(b) => handleConfirmDeleteBill(b)}
              onOpenSplitMerge={
                canWrite ? (b) => setSplitMergeBill(b) : undefined
              }
            />
          );
        })()}

      {/* Split Bill / Merge Bills / Move Table Modal */}
      {splitMergeBill && (
        <BillSplitMergeModal
          bill={splitMergeBill}
          billItems={effectiveBillItems.filter(
            (it) => it.billId === splitMergeBill.id
          )}
          allBills={bills}
          allBillItems={effectiveBillItems}
          debtors={effectiveDebtors}
          onClose={() => setSplitMergeBill(null)}
          onMoveTable={handleMoveTable}
          onSplitBill={handleSplitBill}
          onMergeBills={handleMergeBills}
        />
      )}

      {/* Edit Bill Modal */}
      {editingBill && (
        <BillEditModal
          bill={editingBill}
          items={effectiveBillItems.filter((it) => it.billId === editingBill.id)}
          categories={effectiveCategories}
          products={products}
          debtors={effectiveDebtors}
          onClose={() => setEditingBill(null)}
          onSaveEdit={handleSaveEditedBill}
          onDeleteBill={
            canDelete
              ? (b) => {
                  setEditingBill(null);
                  handleConfirmDeleteBill(b);
                }
              : undefined
          }
          requestConfirm={requestConfirm}
        />
      )}

      {/* Global Confirmation Popup Modal */}
      <ConfirmDialogModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />

      {/* Fixed Bottom-Right Solar & Lunar Calendar Widget */}
      <LunarCalendarFloatingWidget
        calendarEvents={inventoryData.calendarEvents || []}
        onSaveCalendarEvents={handleSaveCalendarEvents}
        currentUsername={currentStaffAccount.username}
      />
    </div>
  );
}
