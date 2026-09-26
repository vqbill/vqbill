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
} from './types';
import {
  formatVND,
  sanitizeId,
  truncateStr,
} from './utils/parser';
import {
  DEFAULT_STAFF_ACCOUNTS,
  buildInitialSeedDataset,
  loadLocalMirror,
  saveLocalMirror,
  fetchRtdbWorkspaceOnce,
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

type ActiveTab =
  | 'dashboard'
  | 'ocr'
  | 'categories'
  | 'debts'
  | 'returns'
  | 'products'
  | 'accounts';

type PeriodPreset = 'today' | 'week' | 'month' | 'all' | 'custom';

export default function App() {
  const todayStr = new Date().toISOString().slice(0, 10);

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
        products: cached.products || [],
        bills: cached.bills || [],
        billItems: cached.billItems || [],
        deductions: cached.deductions || [],
        staffAccounts:
          cached.staffAccounts && cached.staffAccounts.length > 0
            ? cached.staffAccounts
            : DEFAULT_STAFF_ACCOUNTS,
      };
    }
    const seed = buildInitialSeedDataset(ownerId);
    return {
      initialized: false,
      products: seed.products,
      bills: seed.bills,
      billItems: seed.billItems,
      deductions: seed.deductions,
      staffAccounts: DEFAULT_STAFF_ACCOUNTS,
    };
  }, [ownerId]);

  const [workspaceInitialized, setWorkspaceInitialized] = useState<boolean>(
    initialWorkspaceData.initialized
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

  // Keep local mirror synced whenever data changes
  useEffect(() => {
    saveLocalMirror(ownerId, {
      initialized: workspaceInitialized,
      products,
      bills,
      billItems,
      deductions,
      staffAccounts,
    });
  }, [ownerId, workspaceInitialized, products, bills, billItems, deductions, staffAccounts]);

  // Fetch from Firebase Realtime Database on boot
  useEffect(() => {
    let mounted = true;
    fetchRtdbWorkspaceOnce(ownerId).then((cloudSnap) => {
      if (!mounted || !cloudSnap) return;
      if (cloudSnap.initialized) {
        setWorkspaceInitialized(true);
        if (cloudSnap.products) setProducts(cloudSnap.products);
        if (cloudSnap.bills) setBills(cloudSnap.bills);
        if (cloudSnap.billItems) setBillItems(cloudSnap.billItems);
        if (cloudSnap.deductions) setDeductions(cloudSnap.deductions);
      }
      if (cloudSnap.staffAccounts && cloudSnap.staffAccounts.length > 0) {
        setStaffAccounts(cloudSnap.staffAccounts);
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
              paymentType: data.paymentType,
              debtorName: data.debtorName || '',
              debtStatus: data.debtStatus || 'none',
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
          const loaded: StaffAccount[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerId: data.ownerId,
              username: data.username,
              password: data.password,
              displayName: data.displayName,
              info: data.info || '',
              role: (data.role as UserRole) || UserRole.CASHIER,
              active: Boolean(data.active),
              createdAtMs: data.createdAt?.toMillis?.() || Date.now(),
              updatedAtMs: data.updatedAt?.toMillis?.() || Date.now(),
            };
          });
          setStaffAccounts(loaded);
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

  // Role Permissions
  const activeRole = loggedInStaff?.role || UserRole.VIEWER;
  const isAdminUser = activeRole === UserRole.ADMIN;
  const canWrite =
    activeRole === UserRole.ADMIN ||
    activeRole === UserRole.MANAGER ||
    activeRole === UserRole.CASHIER;
  const canDelete = activeRole === UserRole.ADMIN || activeRole === UserRole.MANAGER;

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

  // Staff Accounts CRUD (Admin Tab)
  const handleCreateStaffAccount = async (newAcc: Omit<StaffAccount, 'id'>) => {
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
    showToast(`Đã tạo tài khoản @${created.username} (${created.displayName}) trên Firebase!`);
  };

  const handleUpdateStaffAccount = async (updatedAcc: StaffAccount) => {
    setStaffAccounts((prev) =>
      prev.map((a) => (a.id === updatedAcc.id ? updatedAcc : a))
    );
    if (loggedInStaff && loggedInStaff.id === updatedAcc.id) {
      setLoggedInStaff(updatedAcc);
      localStorage.setItem('vqbill_active_staff', JSON.stringify(updatedAcc));
    }
    await saveStaffAccountToFirebase(ownerId, updatedAcc, false);
    showToast(`Đã lưu thay đổi tài khoản @${updatedAcc.username} lên Firebase!`);
  };

  const handleDeleteStaffAccount = async (accountId: string) => {
    setStaffAccounts((prev) => prev.filter((a) => a.id !== accountId));
    await deleteStaffAccountsFromFirebase(ownerId, [accountId]);
    showToast('Đã xóa tài khoản khỏi hệ thống Firebase.');
  };

  const handleDeleteAllNonAdminAccounts = async () => {
    const toRemove = staffAccounts.filter(
      (a) => a.username !== 'admin' && a.id !== loggedInStaff?.id
    );
    const ids = toRemove.map((a) => a.id);
    setStaffAccounts((prev) => prev.filter((a) => !ids.includes(a.id)));
    await deleteStaffAccountsFromFirebase(ownerId, ids);
    showToast(`Đã xóa ${ids.length} tài khoản nhân viên phụ khỏi Firebase.`);
  };

  // Bill & Item Handlers
  const handleSaveExtractedBill = async (params: {
    billDate: string;
    paymentType: PaymentType;
    debtorName: string;
    note: string;
    items: ExtractedBillItem[];
  }) => {
    setWorkspaceInitialized(true);
    const res = await saveNewBillToCloud({
      ownerId,
      billDate: params.billDate,
      paymentType: params.paymentType,
      debtorName: params.debtorName,
      note: params.note,
      items: params.items,
      existingProducts: products,
      autoAddProducts,
    });

    setBills((prev) => [res.bill, ...prev]);
    setBillItems((prev) => [...res.billItems, ...prev]);
    setProducts(res.updatedProducts);
    showToast(
      `Đã lưu Bill ${res.bill.billCode} (${formatVND(res.bill.totalAmount)}) vào Firebase!`
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
    showToast(`Đã cập nhật hóa đơn ${updatedBill.billCode} lên Firebase!`);
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
    const now = Date.now();
    const existing = products.find(
      (p) =>
        (prodInput.id && p.id === prodInput.id) ||
        p.productName.toLowerCase().trim() === prodInput.productName.toLowerCase().trim()
    );

    if (existing) {
      const updated: ProductRecord = {
        ...existing,
        productName: prodInput.productName,
        category: prodInput.category,
        unitPrice: prodInput.unitPrice,
        unit: prodInput.unit,
        updatedAtMs: now,
      };
      setProducts((prev) => prev.map((p) => (p.id === existing.id ? updated : p)));
      await createOrUpdateProductInFirestore(ownerId, updated, true);
    } else {
      const created: ProductRecord = {
        id: sanitizeId(`prod_${now}_${Math.random().toString(36).slice(2, 6)}`),
        ownerId,
        productName: prodInput.productName,
        category: prodInput.category,
        unitPrice: prodInput.unitPrice,
        unit: prodInput.unit,
        totalSold: 0,
        totalReturned: 0,
        totalRevenue: 0,
        createdAtMs: now,
        updatedAtMs: now,
      };
      setProducts((prev) => [created, ...prev]);
      await createOrUpdateProductInFirestore(ownerId, created, false);
    }
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
        setWorkspaceInitialized(true);
        setProducts(fresh.products);
        setBills(fresh.bills);
        setBillItems(fresh.billItems);
        setDeductions(fresh.deductions);
        for (const p of fresh.products) {
          await createOrUpdateProductInFirestore(ownerId, p, false);
        }
        showToast('Đã khôi phục bộ dữ liệu mẫu chuẩn lên hệ thống!');
      },
    });
  };

  // If not logged in, render AuthScreen (without any sample quick-fill buttons)
  if (!loggedInStaff) {
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

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'dashboard',
      label: 'Tổng quan & Doanh thu',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'ocr',
      label: 'Chụp / Nhập Bill OCR',
      icon: <Camera className="w-4 h-4" />,
    },
    {
      id: 'categories',
      label: 'Số lượng theo Danh mục',
      icon: <Layers className="w-4 h-4" />,
    },
    {
      id: 'debts',
      label: 'Quản lý Công nợ',
      icon: <CreditCard className="w-4 h-4" />,
    },
    {
      id: 'returns',
      label: 'Hoàn trả & Khoản trừ',
      icon: <RotateCcw className="w-4 h-4" />,
    },
    {
      id: 'products',
      label: 'Upload Sản phẩm / Menu',
      icon: <Package className="w-4 h-4" />,
    },
    ...(isAdminUser
      ? [
          {
            id: 'accounts' as ActiveTab,
            label: 'Tài khoản & Phân quyền',
            icon: <Shield className="w-4 h-4" />,
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar Contract: Zone 1 Brand — Zone 2 Navigation — Zone 3 Primary Actions */}
      <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
            aria-label="Mở menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('dashboard');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap"
          >
            VQBill
          </a>
        </div>

        {/* Zone 2: Clean Typography Nav Links */}
        <nav className="hidden lg:flex items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-400 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`py-1 transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
                activeTab === item.id
                  ? 'border-emerald-600 text-slate-900 dark:text-white font-semibold'
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('ocr')}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>+ Chụp / Tạo Bill</span>
          </button>

          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            title={darkMode ? 'Chuyển sang Chế độ Sáng' : 'Chuyển sang Chế độ Tối'}
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium ${
                activeTab === item.id
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Workspace Layout: Sidebar + Main Viewport */}
      <div className="flex-1 flex">
        {/* Desktop Sidebar (256px) */}
        <aside className="hidden lg:flex w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-col justify-between p-4">
          <div className="space-y-6">
            <div className="space-y-1">
              <p className="px-3 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                Danh mục quản lý
              </p>
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === item.id
                      ? 'bg-slate-900 dark:bg-emerald-600 text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {/* Quick Summary Sidebar Box */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2.5 text-xs">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Tóm tắt kỳ đang chọn
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-500">Số lượng Bill:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {periodBills.length}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-500">Sản phẩm Menu:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {products.length}
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
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Tổng ngày:
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatVND(financialSummary.netDayTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* User Profile & Logout */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="px-2 py-1.5">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {loggedInStaff.displayName}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {ROLE_LABELS[loggedInStaff.role]} · @{loggedInStaff.username}
              </div>
              {loggedInStaff.info && (
                <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                  {loggedInStaff.info}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              {isAdminUser && (
                <button
                  type="button"
                  onClick={() => setActiveTab('accounts')}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Quản lý Tài khoản & Quyền</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đăng xuất</span>
              </button>
            </div>

            {!firebaseUser && (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full py-1.5 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Database className="w-3 h-3 text-emerald-500" />
                <span>Liên kết Google Cloud</span>
              </button>
            )}
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-[1360px] mx-auto w-full space-y-6">
          {/* Toast Notification */}
          {toastBanner && (
            <div className="p-3.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-between text-xs font-medium text-emerald-800 dark:text-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{toastBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastBanner(null)}
                className="text-emerald-600 hover:underline ml-4"
              >
                Đóng
              </button>
            </div>
          )}

          {/* Global Time Period & Quick Menu Actions Bar (Visible on Dashboard & Categories) */}
          {(activeTab === 'dashboard' || activeTab === 'categories') && (
            <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-3">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                {/* Period Filter Buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">
                    Thời gian xem:
                  </span>
                  {(
                    [
                      { id: 'today', label: 'Hôm nay' },
                      { id: 'week', label: 'Theo Tuần' },
                      { id: 'month', label: 'Theo Tháng' },
                      { id: 'all', label: 'Tất cả (Gồm 20/08/2026)' },
                      { id: 'custom', label: 'Tự chọn ngày' },
                    ] as { id: PeriodPreset; label: string }[]
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPeriodPreset(p.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        periodPreset === p.id
                          ? 'bg-emerald-600 text-white font-semibold'
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
                      className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <span>Đến:</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {canWrite && products.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRequestDeleteAllMenuProducts}
                      className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa tất cả sản phẩm trong Menu ({products.length})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleRequestRestoreSeedData}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer"
                  >
                    Khôi phục dữ liệu mẫu
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: DASHBOARD & FINANCIAL LEDGER */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Row 1: 4 Primary Gross Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    1. Doanh thu Tiền mặt (Gross)
                  </div>
                  <div className="mt-1.5 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatVND(financialSummary.grossCash)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {periodBills.filter((b) => b.paymentType === 'cash').length} hóa đơn tiền mặt
                  </div>
                </div>

                <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    2. Doanh thu Chuyển khoản
                  </div>
                  <div className="mt-1.5 text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                    {formatVND(financialSummary.grossTransfer)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {periodBills.filter((b) => b.paymentType === 'transfer').length} hóa đơn CK / VietQR
                  </div>
                </div>

                <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    3. Tổng Khoản trừ (Hoàn trả)
                  </div>
                  <div className="mt-1.5 text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
                    -{formatVND(financialSummary.totalDeductions)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {periodDeductions.length} lượt hoàn trả món
                  </div>
                </div>

                <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    4. Tổng Công nợ (Chưa thanh toán)
                  </div>
                  <div className="mt-1.5 text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                    {formatVND(financialSummary.totalDebt)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {
                      periodBills.filter(
                        (b) => b.paymentType === 'debt' && b.debtStatus !== 'paid'
                      ).length
                    }{' '}
                    hóa đơn ghi nợ
                  </div>
                </div>
              </div>

              {/* Row 2: Dedicated Sub-tab for Net Cash, Net Transfer, and Net Day Total Formula */}
              <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Bảng Đối Soát Doanh Thu Thực Nhận & Tổng Ngày
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Tự động tính Tổng doanh thu tiền mặt sau khoản trừ và Tổng ngày theo công thức chuẩn
                    </p>
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
                    <button
                      type="button"
                      onClick={() => setNetFormulaTab('net_summary')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        netFormulaTab === 'net_summary'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Tổng Thực Thu (Sau Khoản Trừ)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNetFormulaTab('formula_explain')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        netFormulaTab === 'formula_explain'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Chi Tiết Phép Tính Đối Soát
                    </button>
                  </div>
                </div>

                {netFormulaTab === 'net_summary' ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Tổng Doanh Thu Tiền Mặt (Thực nhận)
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        = Doanh thu tiền mặt - Tổng khoản trừ
                      </div>
                      <div className="mt-2 text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatVND(financialSummary.netCashRevenue)}
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-slate-500">
                        ({formatVND(financialSummary.grossCash)} -{' '}
                        {formatVND(financialSummary.totalDeductions)})
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Tổng Doanh Thu Chuyển Khoản
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        = Toàn bộ bill thanh toán CK / VietQR
                      </div>
                      <div className="mt-2 text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
                        {formatVND(financialSummary.netTransferRevenue)}
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-slate-500">
                        Đã vào tài khoản ngân hàng
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border-2 border-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-950/20">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        TỔNG NGÀY (Tiền mặt + CK - Khoản trừ - Công nợ)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Công thức: Tiền mặt + Chuyển khoản - Khoản trừ - Công nợ
                      </div>
                      <div className="mt-2 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatVND(financialSummary.netDayTotal)}
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        Tổng gộp cả quán (gồm nợ): {formatVND(financialSummary.totalAllBillsGross)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-xs space-y-2">
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
              <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
                <RevenueColumnChart data={chartData} />
              </div>

              {/* Row 4: Advanced Search & Bills List Table */}
              <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Danh Sách Hóa Đơn Bán Hàng ({displayedBills.length} bill)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Tìm kiếm nâng cao theo từ khóa, hình thức thanh toán, trạng thái hoàn trả và danh mục món ăn
                    </p>
                  </div>

                  {/* Advanced Filter Controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="Tìm món ăn, người nợ, mã bill..."
                        className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white w-56"
                      />
                    </div>

                    <select
                      value={paymentFilter}
                      onChange={(e) => setPaymentFilter(e.target.value as any)}
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="all">Tất cả hình thức</option>
                      <option value="cash">Bill Tiền mặt</option>
                      <option value="transfer">Bill Chuyển khoản</option>
                      <option value="debt">Bill Công nợ</option>
                      <option value="has_return">Bill có Hoàn trả</option>
                    </select>

                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="all">Tất cả danh mục</option>
                      {STANDARD_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          Có món nhóm: {c}
                        </option>
                      ))}
                    </select>

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
                        className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa tất cả Bill ({displayedBills.length})</span>
                      </button>
                    )}
                  </div>
                </div>

                {displayedBills.length === 0 ? (
                  <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
                    Không tìm thấy hóa đơn nào khớp với điều kiện lọc.
                  </div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[760px] text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          <th className="py-2.5 px-3">Mã Bill / Ngày</th>
                          <th className="py-2.5 px-3">Hình thức & Khách</th>
                          <th className="py-2.5 px-3">Chi tiết các món trong Bill</th>
                          <th className="py-2.5 px-3 text-right">Tổng tiền Bill</th>
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
                                  {bill.billDate}
                                </div>
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
                                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                                      title="Chỉnh sửa Bill"
                                    >
                                      Sửa
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPreselectedReturnBillId(bill.id);
                                        setActiveTab('returns');
                                      }}
                                      className="px-2 py-1 rounded border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-medium text-rose-600 dark:text-rose-400 cursor-pointer"
                                      title="Hoàn trả món trong Bill này"
                                    >
                                      Hoàn trả
                                    </button>
                                  </>
                                )}
                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmDeleteBill(bill)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer align-middle"
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
                )}
              </div>
            </div>
          )}

          {/* TAB 2: AI OCR & TEXT BILL SCANNER */}
          {activeTab === 'ocr' && (
            <OcrScannerTab
              canWrite={canWrite}
              autoAddProducts={autoAddProducts}
              onToggleAutoAddProducts={setAutoAddProducts}
              onSaveExtractedBill={handleSaveExtractedBill}
              onDeleteAllMenuProducts={handleRequestDeleteAllMenuProducts}
              menuProductsCount={products.length}
              requestConfirm={requestConfirm}
            />
          )}

          {/* TAB 3: CATEGORY & ITEM QUANTITY ANALYTICS */}
          {activeTab === 'categories' && (
            <CategoryAnalyticsTab
              billItems={periodBillItems}
              products={products}
              periodLabel={periodLabel}
              canWrite={canWrite}
              onDeleteAllMenuProducts={handleRequestDeleteAllMenuProducts}
              onDeleteCategoryMenuProducts={handleRequestDeleteCategoryMenuProducts}
            />
          )}

          {/* TAB 4: DEBT MANAGEMENT & SCROLL INSPECTOR */}
          {activeTab === 'debts' && (
            <DebtManagerTab
              bills={bills}
              billItems={billItems}
              canWrite={canWrite}
              canDelete={canDelete}
              onEditBill={(bill) => setEditingBill(bill)}
              onJumpToReturnForBill={(bill) => {
                setPreselectedReturnBillId(bill.id);
                setActiveTab('returns');
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
          {activeTab === 'returns' && (
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
          {activeTab === 'products' && (
            <ProductCatalogTab
              products={products}
              canWrite={canWrite}
              autoAddProducts={autoAddProducts}
              onToggleAutoAddProducts={setAutoAddProducts}
              onAddOrUpdateProduct={handleAddOrUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              onDeleteProductsBatch={handleDeleteProductsBatch}
              requestConfirm={requestConfirm}
            />
          )}

          {/* TAB 7: ADMIN ACCOUNTS & PERMISSIONS MANAGER */}
          {activeTab === 'accounts' && isAdminUser && (
            <AccountsManagerTab
              staffAccounts={staffAccounts}
              currentAccount={loggedInStaff}
              onCreateAccount={handleCreateStaffAccount}
              onUpdateAccount={handleUpdateStaffAccount}
              onDeleteAccount={handleDeleteStaffAccount}
              onDeleteAllNonAdminAccounts={handleDeleteAllNonAdminAccounts}
              onSwitchAccount={(acc) => {
                setLoggedInStaff(acc);
                localStorage.setItem('vqbill_active_staff', JSON.stringify(acc));
                showToast(
                  `Đã chuyển sang tài khoản ${acc.displayName} (${ROLE_LABELS[acc.role]})`
                );
              }}
              requestConfirm={requestConfirm}
            />
          )}
        </main>
      </div>

      {/* Edit Bill Modal */}
      {editingBill && (
        <BillEditModal
          bill={editingBill}
          items={billItems.filter((it) => it.billId === editingBill.id)}
          onClose={() => setEditingBill(null)}
          onSaveEdit={handleSaveEditedBill}
          requestConfirm={requestConfirm}
        />
      )}

      {/* Global Confirmation Popup Modal for all Add / Edit / Delete operations */}
      <ConfirmDialogModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </div>
  );
}
