import React, { useState, useEffect, useMemo } from 'react';
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
} from './types';
import {
  formatVND,
  sanitizeId,
  truncateStr,
  getCurrentBusinessDate,
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
  normalizeStaffAccountsWithFixedAdmin,
  buildInitialSeedDataset,
  loadLocalMirror,
  saveLocalMirror,
  fetchRtdbWorkspaceOnce,
  saveCategoriesToCloud,
  saveRolePermissionsToCloud,
  renameOrReassignCategoryInCloud,
  saveStaffAccountToFirebase,
  deleteStaffAccountsFromFirebase,
  createOrUpdateProductInFirestore,
  deleteProductsBatchFromFirestore,
  saveNewBillToCloud,
  updateBillAndItemsInCloud,
  deleteBillsBatchFromCloud,
  deleteDeductionsBatchFromCloud,
  recordReturnDeductionToCloud,
} from './services/dataService';
import { AuthScreen } from './components/AuthScreen';
import { RevenueColumnChart, DailyRevenuePoint } from './components/RevenueCharts';
import { OcrScannerTab } from './components/OcrScannerTab';
import { CategoryAnalyticsTab } from './components/CategoryAnalyticsTab';
import { DebtManagerTab } from './components/DebtManagerTab';
import { ReturnsDeductionsTab } from './components/ReturnsDeductionsTab';
import { ProductCatalogTab } from './components/ProductCatalogTab';
import { AccountsManagerTab } from './components/AccountsManagerTab';
import { BillEditModal } from './components/BillEditModal';
import { ConfirmDialogModal } from './components/ConfirmDialogModal';
import { GeminiKeyBar } from './components/GeminiKeyBar';

type ActiveTab = ManagementTabId;

type PeriodPreset = 'today' | 'week' | 'month' | 'all' | 'custom';

export default function App() {
  const todayStr = getCurrentBusinessDate();

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

  const ownerId = firebaseUser?.uid || 'vqbill_default_workspace';

  // Load initial snapshot from local mirror or seed dataset
  const initialWorkspaceData = useMemo(() => {
    const cached = loadLocalMirror(ownerId);
    if (cached && cached.initialized) {
      return {
        initialized: true,
        categories:
          cached.categories && cached.categories.length > 0
            ? cached.categories
            : Array.from(STANDARD_CATEGORIES),
        rolePermissions: cached.rolePermissions || DEFAULT_ROLE_PERMISSIONS,
        products: cached.products || [],
        bills: cached.bills || [],
        billItems: cached.billItems || [],
        deductions: cached.deductions || [],
        staffAccounts: normalizeStaffAccountsWithFixedAdmin(
          cached.staffAccounts
        ),
      };
    }
    const seed = buildInitialSeedDataset(ownerId);
    return {
      initialized: false,
      categories: Array.from(STANDARD_CATEGORIES),
      rolePermissions: DEFAULT_ROLE_PERMISSIONS,
      products: seed.products,
      bills: seed.bills,
      billItems: seed.billItems,
      deductions: seed.deductions,
      staffAccounts: normalizeStaffAccountsWithFixedAdmin(DEFAULT_STAFF_ACCOUNTS),
    };
  }, [ownerId]);

  const [workspaceInitialized, setWorkspaceInitialized] = useState<boolean>(
    initialWorkspaceData.initialized
  );
  const [categories, setCategories] = useState<string[]>(
    initialWorkspaceData.categories
  );
  const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap>(
    initialWorkspaceData.rolePermissions
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

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
  const [editingBill, setEditingBill] = useState<BillRecord | null>(null);
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
  const canWrite = effectivePermissions.canWrite;
  const canDelete = effectivePermissions.canDelete;

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

  // Keep local mirror synced whenever data changes
  useEffect(() => {
    saveLocalMirror(ownerId, {
      initialized: workspaceInitialized,
      categories,
      rolePermissions,
      products,
      bills,
      billItems,
      deductions,
      staffAccounts,
    });
  }, [
    ownerId,
    workspaceInitialized,
    categories,
    rolePermissions,
    products,
    bills,
    billItems,
    deductions,
    staffAccounts,
  ]);

  // Fetch from Firebase Realtime Database on boot
  useEffect(() => {
    let mounted = true;
    fetchRtdbWorkspaceOnce(ownerId).then((cloudSnap) => {
      if (!mounted || !cloudSnap) return;
      if (cloudSnap.initialized) {
        setWorkspaceInitialized(true);
        if (cloudSnap.categories && cloudSnap.categories.length > 0) {
          setCategories(cloudSnap.categories);
        }
        if (cloudSnap.rolePermissions) {
          setRolePermissions({
            ...DEFAULT_ROLE_PERMISSIONS,
            ...cloudSnap.rolePermissions,
          });
        }
        if (cloudSnap.products) setProducts(cloudSnap.products);
        if (cloudSnap.bills) setBills(cloudSnap.bills);
        if (cloudSnap.billItems) setBillItems(cloudSnap.billItems);
        if (cloudSnap.deductions) setDeductions(cloudSnap.deductions);
      } else if (cloudSnap.rolePermissions) {
        setRolePermissions({
          ...DEFAULT_ROLE_PERMISSIONS,
          ...cloudSnap.rolePermissions,
        });
      }
      if (cloudSnap.staffAccounts && cloudSnap.staffAccounts.length > 0) {
        setStaffAccounts(
          normalizeStaffAccountsWithFixedAdmin(cloudSnap.staffAccounts)
        );
      }
    });
    return () => {
      mounted = false;
    };
  }, [ownerId]);

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

  // Attach Firestore Real-Time Listeners when authenticated with Firebase Auth
  useEffect(() => {
    if (!authReady || !firebaseUser?.uid) return;

    const uid = firebaseUser.uid;
    const qBills = query(collection(db, 'bills'), where('ownerId', '==', uid));
    const qItems = query(collection(db, 'bill_items'), where('ownerId', '==', uid));
    const qProducts = query(collection(db, 'products'), where('ownerId', '==', uid));
    const qDeductions = query(collection(db, 'deductions'), where('ownerId', '==', uid));
    const qStaff = query(collection(db, 'staff_accounts'), where('ownerId', '==', uid));

    const unsubBills = onSnapshot(
      qBills,
      (snap) => {
        if (!snap.empty || workspaceInitialized) {
          const loaded: BillRecord[] = snap.docs.map((d) => {
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
          setBills(loaded);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bills')
    );

    const unsubItems = onSnapshot(
      qItems,
      (snap) => {
        if (!snap.empty || workspaceInitialized) {
          const loaded: BillItemRecord[] = snap.docs.map((d) => {
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
          setBillItems(loaded);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bill_items')
    );

    const unsubProducts = onSnapshot(
      qProducts,
      (snap) => {
        if (!snap.empty || workspaceInitialized) {
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
          setProducts(loaded);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'products')
    );

    const unsubDeductions = onSnapshot(
      qDeductions,
      (snap) => {
        if (!snap.empty || workspaceInitialized) {
          const loaded: DeductionRecord[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerId: data.ownerId,
              billId: data.billId,
              billCode: data.billCode,
              billDate: data.billDate,
              deductionDate: data.deductionDate,
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
          setDeductions(loaded);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'deductions')
    );

    const unsubStaff = onSnapshot(
      qStaff,
      (snap) => {
        if (!snap.empty) {
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
      unsubBills();
      unsubItems();
      unsubProducts();
      unsubDeductions();
      unsubStaff();
    };
  }, [authReady, firebaseUser?.uid, workspaceInitialized]);

  // Date Range Helper
  const isDateInPeriod = (dateStr: string): boolean => {
    if (periodPreset === 'all') return true;
    if (periodPreset === 'today') return dateStr === todayStr;
    if (periodPreset === 'week') {
      const target = new Date(dateStr + 'T00:00:00').getTime();
      const now = new Date(todayStr + 'T00:00:00').getTime();
      const diffDays = (now - target) / 86400000;
      return diffDays >= -1 && diffDays <= 7;
    }
    if (periodPreset === 'month') {
      return dateStr.slice(0, 7) === todayStr.slice(0, 7);
    }
    if (periodPreset === 'custom') {
      const start = customStartDate || '2000-01-01';
      const end = customEndDate || '2099-12-31';
      return dateStr >= start && dateStr <= end;
    }
    return true;
  };

  const periodLabel = useMemo(() => {
    if (periodPreset === 'today') return `Hôm nay (${todayStr})`;
    if (periodPreset === 'week') return '7 ngày gần nhất';
    if (periodPreset === 'month') return `Tháng ${todayStr.slice(5, 7)}/${todayStr.slice(0, 4)}`;
    if (periodPreset === 'custom') return `Từ ${customStartDate} đến ${customEndDate}`;
    return 'Toàn bộ thời gian';
  }, [periodPreset, todayStr, customStartDate, customEndDate]);

  // Filtered Bills & Deductions for Active Period + Search + Category + Payment
  const periodBills = useMemo(() => {
    return bills.filter((b) => isDateInPeriod(b.billDate));
  }, [bills, periodPreset, customStartDate, customEndDate, todayStr]);

  const periodBillIds = useMemo(() => new Set(periodBills.map((b) => b.id)), [periodBills]);

  const periodBillItems = useMemo(() => {
    return billItems.filter((it) => periodBillIds.has(it.billId));
  }, [billItems, periodBillIds]);

  const periodDeductions = useMemo(() => {
    return deductions.filter(
      (d) => isDateInPeriod(d.deductionDate) || periodBillIds.has(d.billId)
    );
  }, [deductions, periodBillIds, periodPreset, customStartDate, customEndDate]);

  // Advanced Filtered Bills for Table Display
  const displayedBills = useMemo(() => {
    return periodBills
      .filter((b) => {
        if (paymentFilter === 'cash') return b.paymentType === 'cash';
        if (paymentFilter === 'transfer') return b.paymentType === 'transfer';
        if (paymentFilter === 'debt') return b.paymentType === 'debt';
        if (paymentFilter === 'has_return') return (b.deductedAmount || 0) > 0;
        return true;
      })
      .filter((b) => {
        if (categoryFilter === 'all') return true;
        return billItems.some(
          (it) => it.billId === b.id && it.category === categoryFilter
        );
      })
      .filter((b) => {
        if (!searchKeyword.trim()) return true;
        const q = searchKeyword.toLowerCase();
        return (
          b.billCode.toLowerCase().includes(q) ||
          b.billDate.includes(q) ||
          b.debtorName.toLowerCase().includes(q) ||
          b.itemsSummary.toLowerCase().includes(q) ||
          b.note.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.billDate.localeCompare(a.billDate) || b.createdAtMs - a.createdAtMs);
  }, [periodBills, paymentFilter, categoryFilter, searchKeyword, billItems]);

  // Financial Metrics
  const financialSummary = useMemo(() => {
    const grossCash = periodBills
      .filter((b) => b.paymentType === 'cash')
      .reduce((s, b) => s + b.totalAmount, 0);

    const grossTransfer = periodBills
      .filter((b) => b.paymentType === 'transfer')
      .reduce((s, b) => s + b.totalAmount, 0);

    const totalDeductions = periodDeductions.reduce((s, d) => s + d.amount, 0);

    const totalDebt = periodBills
      .filter((b) => b.paymentType === 'debt' && b.debtStatus !== 'paid')
      .reduce((s, b) => s + b.totalAmount, 0);

    const netCashRevenue = grossCash - totalDeductions;
    const netTransferRevenue = grossTransfer;
    const netDayTotal = grossCash + grossTransfer - totalDeductions - totalDebt;
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
  }, [periodBills, periodDeductions]);

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
      if (b.paymentType === 'cash') cur.cash += b.totalAmount;
      else if (b.paymentType === 'transfer') cur.transfer += b.totalAmount;
      else if (b.paymentType === 'debt' && b.debtStatus !== 'paid')
        cur.debt += b.totalAmount;
      dateMap.set(b.billDate, cur);
    }

    for (const d of periodDeductions) {
      const key = d.billDate || d.deductionDate;
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
          netDayTotal: vals.cash + vals.transfer - vals.deduction - vals.debt,
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
        return {
          ...acc,
          allowedTabs: roleCfg.allowedTabs,
          useCustomTabs: false,
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
    setStaffAccounts((prev) => prev.filter((a) => a.id !== accountId));
    await deleteStaffAccountsFromFirebase(ownerId, [accountId]);
    showToast('Đã xóa tài khoản khỏi hệ thống Firebase.');
  };

  const handleDeleteAllNonAdminAccounts = async () => {
    setWorkspaceInitialized(true);
    const toRemove = staffAccounts.filter(
      (a) => a.username !== 'admin' && a.id !== currentStaffAccount?.id
    );
    const ids = toRemove.map((a) => a.id);
    setStaffAccounts((prev) => prev.filter((a) => !ids.includes(a.id)));
    await deleteStaffAccountsFromFirebase(ownerId, ids);
    showToast(`Đã xóa ${ids.length} tài khoản nhân viên phụ khỏi Firebase.`);
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
    billItems.forEach((it) => addCat(it.category));
    if (result.length === 0) {
      STANDARD_CATEGORIES.forEach(addCat);
    }
    return result;
  }, [categories, products, billItems]);

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

    setProducts((prev) =>
      prev.map((p) => (p.category === oldName ? { ...p, category: trimmed } : p))
    );
    setBillItems((prev) =>
      prev.map((it) => (it.category === oldName ? { ...it, category: trimmed } : it))
    );
    setDeductions((prev) =>
      prev.map((d) => (d.category === oldName ? { ...d, category: trimmed } : d))
    );

    await renameOrReassignCategoryInCloud({
      ownerId,
      categories: uniqueCategories,
      affectedProducts,
      affectedBillItems,
      affectedDeductions,
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
      await saveCategoriesToCloud(ownerId, mergedCatsToSave);
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

    setBills((prev) => [res.bill, ...prev]);
    setBillItems((prev) => [...res.billItems, ...prev]);
    setProducts(res.updatedProducts);
    showToast(
      `Đã lưu Bill ${res.bill.billCode} (Ca ngày ${res.bill.billDate} · ${formatVND(
        res.bill.totalAmount
      )}) vào Firebase!`
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
    newUnitPrice: number
  ) => {
    const cleanPrice = Math.max(0, Math.round(Number(newUnitPrice) || 0));
    const currentItems = billItems.filter((it) => it.billId === bill.id);
    const updatedItems = currentItems.map((it) =>
      it.id === targetItem.id
        ? {
            ...it,
            unitPrice: cleanPrice,
            subtotal: it.quantity * cleanPrice,
            updatedAtMs: Date.now(),
          }
        : it
    );
    const newTotal = updatedItems.reduce(
      (sum, it) => sum + Math.round(it.quantity * it.unitPrice),
      0
    );
    const updatedBill: BillRecord = {
      ...bill,
      totalAmount: newTotal,
      updatedAtMs: Date.now(),
    };
    await handleSaveEditedBill(updatedBill, updatedItems);
  };

  const handleDeleteBillDirect = async (bill: BillRecord) => {
    if (!canDelete) return;
    setWorkspaceInitialized(true);
    const bItems = billItems.filter((it) => it.billId === bill.id);
    const bDeds = deductions.filter((d) => d.billId === bill.id);

    setBills((prev) => prev.filter((b) => b.id !== bill.id));
    setBillItems((prev) => prev.filter((it) => it.billId !== bill.id));
    setDeductions((prev) => prev.filter((d) => d.billId !== bill.id));

    await deleteBillsBatchFromCloud(ownerId, [bill.id], bItems, bDeds);
    showToast(`Đã xóa hóa đơn ${bill.billCode} khỏi Firebase.`);
  };

  const handleConfirmDeleteBill = (bill: BillRecord) => {
    if (!canDelete) return;
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

  const handleDeleteMultipleBills = async (billsToDelete: BillRecord[]) => {
    if (!canDelete || billsToDelete.length === 0) return;
    setWorkspaceInitialized(true);
    const ids = new Set(billsToDelete.map((b) => b.id));
    const bItems = billItems.filter((it) => ids.has(it.billId));
    const bDeds = deductions.filter((d) => ids.has(d.billId));

    setBills((prev) => prev.filter((b) => !ids.has(b.id)));
    setBillItems((prev) => prev.filter((it) => !ids.has(it.billId)));
    setDeductions((prev) => prev.filter((d) => !ids.has(d.billId)));

    await deleteBillsBatchFromCloud(ownerId, Array.from(ids), bItems, bDeds);
    showToast(`Đã xóa ${billsToDelete.length} hóa đơn khỏi Firebase.`);
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

  const handleRecordReturn = async (params: {
    bill: BillRecord;
    billItem: BillItemRecord;
    returnQty: number;
    deductionDate: string;
    note: string;
  }) => {
    setWorkspaceInitialized(true);
    const matchingProd = products.find(
      (p) =>
        p.productName.toLowerCase().trim() ===
        params.billItem.productName.toLowerCase().trim()
    );

    const res = await recordReturnDeductionToCloud({
      ownerId,
      bill: params.bill,
      billItem: params.billItem,
      returnQty: params.returnQty,
      deductionDate: params.deductionDate,
      note: params.note,
      existingProduct: matchingProd,
    });

    setDeductions((prev) => [res.deduction, ...prev]);
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
    showToast(
      `Đã ghi nhận hoàn trả ${params.returnQty} ${params.billItem.productName} (-${formatVND(
        res.deduction.amount
      )}) lên Firebase!`
    );
  };

  const handleDeleteDeductionsBatch = async (deductionIds: string[]) => {
    if (!canDelete || deductionIds.length === 0) return;
    setWorkspaceInitialized(true);
    const idSet = new Set(deductionIds);
    setDeductions((prev) => prev.filter((d) => !idSet.has(d.id)));
    await deleteDeductionsBatchFromCloud(ownerId, deductionIds);
    showToast(`Đã xóa ${deductionIds.length} khoản trừ khỏi Firebase.`);
  };

  // Product Catalog Handlers
  const handleAddOrUpdateProduct = async (prodInput: {
    id?: string;
    productName: string;
    category: string;
    unitPrice: number;
    unit: string;
  }) => {
    setWorkspaceInitialized(true);
    const cleanCat = prodInput.category.trim() || 'Khác';

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
    let productToSave: ProductRecord | null = null;
    let isUpdatingExisting = false;

    setProducts((prev) => {
      const existing = prev.find(
        (p) =>
          (prodInput.id && p.id === prodInput.id) ||
          p.productName.toLowerCase().trim() ===
            prodInput.productName.toLowerCase().trim()
      );
      if (existing) {
        isUpdatingExisting = true;
        const updated: ProductRecord = {
          ...existing,
          productName: prodInput.productName.trim(),
          category: cleanCat,
          unitPrice: prodInput.unitPrice,
          unit: prodInput.unit,
          updatedAtMs: now,
        };
        productToSave = updated;
        return prev.map((p) => (p.id === existing.id ? updated : p));
      } else {
        isUpdatingExisting = false;
        const created: ProductRecord = {
          id: sanitizeId(
            `prod_${now}_${Math.random().toString(36).slice(2, 7)}`
          ),
          ownerId,
          productName: prodInput.productName.trim(),
          category: cleanCat,
          unitPrice: prodInput.unitPrice,
          unit: prodInput.unit,
          totalSold: 0,
          totalReturned: 0,
          totalRevenue: 0,
          createdAtMs: now,
          updatedAtMs: now,
        };
        productToSave = created;
        return [created, ...prev];
      }
    });

    if (productToSave) {
      await createOrUpdateProductInFirestore(
        ownerId,
        productToSave,
        isUpdatingExisting
      );
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

    items.forEach((item, idx) => {
      const cleanName = item.productName.trim();
      if (!cleanName) return;
      const rawCat = (item.category || 'Khác').trim() || 'Khác';
      const canonicalCat =
        nextCategories.find((c) => c.toLowerCase() === rawCat.toLowerCase()) ||
        rawCat;

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

    for (const entry of toSyncCloud) {
      await createOrUpdateProductInFirestore(
        ownerId,
        entry.prod,
        entry.isUpdate
      );
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
        await saveCategoriesToCloud(ownerId, stdCats);
        for (const p of fresh.products) {
          await createOrUpdateProductInFirestore(ownerId, p, false);
        }
        showToast('Đã khôi phục bộ dữ liệu mẫu chuẩn lên hệ thống!');
      },
    });
  };

  // If not logged in, render AuthScreen (without any sample quick-fill buttons)
  if (!currentStaffAccount) {
    return (
      <AuthScreen
        staffAccounts={staffAccounts}
        onLoginSuccess={handleStaffLoginSuccess}
        onGoogleLogin={handleGoogleSignIn}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        authError={authError}
      />
    );
  }

  const allNavItems: {
    id: ActiveTab;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
  }[] = [
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
      id: 'debts',
      label: 'Quản lý Công nợ',
      shortLabel: 'Công nợ',
      icon: <CreditCard className="w-4 h-4" />,
    },
    {
      id: 'returns',
      label: 'Hoàn trả & Khoản trừ',
      shortLabel: 'Hoàn trả',
      icon: <RotateCcw className="w-4 h-4" />,
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
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              handleSelectTab(allowedTabs[0] || 'dashboard');
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
              <div className="font-bold text-slate-800 dark:text-slate-200">
                Tóm tắt kỳ đang xem
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
        <main className="flex-1 min-w-0 p-3 sm:p-5 lg:p-6 max-w-[1360px] mx-auto w-full space-y-4 sm:space-y-6">
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

                  <div className="flex flex-wrap items-center gap-2">
                    {canWrite && (
                      <button
                        type="button"
                        onClick={handleRequestRestoreSeedData}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer"
                      >
                        Khôi phục dữ liệu mẫu
                      </button>
                    )}
                  </div>
                </div>
              </div>
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
                    {periodBills.filter((b) => b.paymentType === 'cash').length} hóa đơn
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
                    3. Khoản trừ (Trả món)
                  </div>
                  <div className="mt-1 text-base sm:text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 truncate">
                    -{formatVND(financialSummary.totalDeductions)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {periodDeductions.length} lượt hoàn trả
                  </div>
                </div>

                <div className="p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
                  <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
                    4. Công nợ chưa thu
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
                    bill ghi nợ
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
                      Công thức: Tiền mặt + Chuyển khoản - Khoản trừ - Công nợ
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
                      <span>(-) Tổng Khoản trừ (Hoàn trả món):</span>
                      <span className="font-semibold text-rose-600">
                        -{formatVND(financialSummary.totalDeductions)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                      <span>(-) Tổng Công nợ chưa thu:</span>
                      <span className="font-semibold text-amber-600">
                        -{formatVND(financialSummary.totalDebt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 text-sm font-bold text-slate-900 dark:text-white">
                      <span>(=) TỔNG NGÀY:</span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {formatVND(financialSummary.netDayTotal)}
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
                      Tìm kiếm theo món ăn, khách hàng, hình thức thanh toán hoặc danh mục
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
                        return (
                          <div
                            key={bill.id}
                            className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 space-y-2 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-mono font-bold text-slate-900 dark:text-white">
                                  {bill.billCode} · {bill.billDate}
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
                                  {PAYMENT_LABELS[bill.paymentType]}
                                  {bill.debtorName ? ` — Nợ: ${bill.debtorName}` : ''}
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

                            <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                              {canWrite && (
                                <>
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
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
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
                            <th className="py-2.5 px-3">Chi tiết các món</th>
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
                            return (
                              <tr
                                key={bill.id}
                                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                              >
                                <td className="py-3 px-3 font-mono">
                                  <div className="font-bold text-slate-900 dark:text-white">
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
                                    {PAYMENT_LABELS[bill.paymentType]}
                                  </div>
                                  {bill.debtorName && (
                                    <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                      Nợ: {bill.debtorName}
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

                                <td className="py-3 px-3 text-right whitespace-nowrap space-x-1">
                                  {canWrite && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setEditingBill(bill)}
                                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
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
                                          className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-semibold text-rose-600 dark:text-rose-400 cursor-pointer"
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
                                      className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer align-middle"
                                      title="Xóa Bill"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 inline" />
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
              billItems={periodBillItems}
              products={products}
              categories={effectiveCategories}
              periodLabel={periodLabel}
              canWrite={canWrite}
              onDeleteAllMenuProducts={handleRequestDeleteAllMenuProducts}
              onDeleteCategoryMenuProducts={handleRequestDeleteCategoryMenuProducts}
              onAddCategory={handleAddCategory}
              onRenameCategory={handleRenameCategory}
              onDeleteCategory={handleDeleteCategory}
              requestConfirm={requestConfirm}
            />
          )}

          {/* TAB 4: DEBT MANAGEMENT & SCROLL INSPECTOR */}
          {activeTab === 'debts' && allowedTabs.includes('debts') && (
            <DebtManagerTab
              bills={bills}
              billItems={billItems}
              products={products}
              canWrite={canWrite}
              canDelete={canDelete}
              onEditBill={(bill) => setEditingBill(bill)}
              onUpdateBillItemPriceInline={handleUpdateBillItemPriceInline}
              onJumpToReturnForBill={(bill) => {
                setPreselectedReturnBillId(bill.id);
                handleSelectTab('returns');
              }}
              onSettleDebt={handleSettleDebt}
              onDeleteBill={handleDeleteBillDirect}
              onDeleteAllDebtBills={handleDeleteMultipleBills}
              onDeleteAllMenuProducts={handleRequestDeleteAllMenuProducts}
              menuProductsCount={products.length}
              requestConfirm={requestConfirm}
            />
          )}

          {/* TAB 5: RETURNS & DEDUCTIONS */}
          {activeTab === 'returns' && allowedTabs.includes('returns') && (
            <ReturnsDeductionsTab
              bills={bills}
              billItems={billItems}
              deductions={deductions}
              canWrite={canWrite}
              canDelete={canDelete}
              preselectedBillId={preselectedReturnBillId}
              onRecordReturn={handleRecordReturn}
              onDeleteDeductionsBatch={handleDeleteDeductionsBatch}
              onDeleteAllMenuProducts={handleRequestDeleteAllMenuProducts}
              menuProductsCount={products.length}
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

      {/* Edit Bill Modal */}
      {editingBill && (
        <BillEditModal
          bill={editingBill}
          items={billItems.filter((it) => it.billId === editingBill.id)}
          categories={effectiveCategories}
          products={products}
          onClose={() => setEditingBill(null)}
          onSaveEdit={handleSaveEditedBill}
          requestConfirm={requestConfirm}
        />
      )}

      {/* Global Confirmation Popup Modal */}
      <ConfirmDialogModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </div>
  );
}
