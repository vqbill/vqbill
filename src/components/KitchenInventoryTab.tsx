import React, { useState, useMemo } from 'react';
import {
  UtensilsCrossed,
  Truck,
  Package,
  Receipt,
  Plus,
  Trash2,
  Edit3,
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Boxes,
  ArrowRight,
  TrendingDown,
  DollarSign,
  ChevronDown,
  ChevronUp,
  X,
  FileText,
  CreditCard,
  Building,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Info,
  Layers,
  Settings2,
  Tag,
  FolderPlus,
  Check,
} from 'lucide-react';
import {
  KitchenSupplier,
  KitchenSupplyItem,
  KitchenReceipt,
  KitchenReceiptItem,
  KitchenSupplierPayment,
  KitchenStockUsageLog,
  WorkspaceInventoryData,
  ProductRecord,
  BillRecord,
  BillItemRecord,
  ReturnRecord,
  ConfirmRequestOptions,
} from '../types';
import { formatVND, sanitizeId } from '../utils/parser';
import {
  computeLiveBeverageStockMap,
  syncBeveragesToKitchenSupplyItems,
  isBeverageCategory,
} from '../utils/beverageInventorySync';

interface KitchenInventoryTabProps {
  inventoryData: WorkspaceInventoryData;
  onSaveInventoryData: (nextData: WorkspaceInventoryData, toastMsg?: string) => Promise<void>;
  products: ProductRecord[];
  bills: BillRecord[];
  billItems: BillItemRecord[];
  returns?: ReturnRecord[];
  categories?: string[];
  canWrite: boolean;
  canDelete: boolean;
  currentUsername: string;
  todayBusinessStr: string;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
  onOpenBeverageInventory?: () => void;
}

// Default categories for kitchen & supplies (Hàng tươi sống, Hải sản, Rau, Gia vị...)
export const DEFAULT_KITCHEN_CATEGORIES = [
  'Hàng tươi sống',
  'Hải sản',
  'Rau',
  'Gia vị',
  'Bia',
  'Nước ngọt',
  'Tạp vụ & Vệ sinh',
  'Nhiên liệu & Gas',
  'Bao bì & Dụng cụ',
  'Khác',
];

export const KITCHEN_ITEM_CATEGORIES = DEFAULT_KITCHEN_CATEGORIES;

const DEFAULT_SUPPLIERS_SEED: KitchenSupplier[] = [
  {
    id: 'supp_seed_1',
    name: 'NPP Thực Phẩm Tươi Sống Đại Phát',
    phone: '0908 123 456',
    address: 'Chợ Đầu Mối Bình Điền, TP.HCM',
    contactPerson: 'Anh Phát',
    note: 'Chuyên cung cấp thịt bò phi lê, thịt heo, cá điêu hồng tươi mỗi sáng 6h',
    createdAtMs: Date.now() - 86400000 * 10,
  },
  {
    id: 'supp_seed_2',
    name: 'Đại Lý Nông Sản & Gia Vị Kim Ngân',
    phone: '0912 345 678',
    address: '45 đường số 8, Phường Linh Tây, Thủ Đức',
    contactPerson: 'Chị Ngân',
    note: 'Cung cấp gia vị (hạt nêm, dầu ăn, nước mắm), rau củ quả số lượng lớn',
    createdAtMs: Date.now() - 86400000 * 9,
  },
  {
    id: 'supp_seed_3',
    name: 'Đại Lý Gas & Tạp Vụ Minh Thành',
    phone: '0933 888 999',
    address: '112 Kha Vạn Cân, Thủ Đức',
    contactPerson: 'Anh Thành',
    note: 'Giao bình gas công nghiệp 45kg, nước rửa chén, cồn khô, túi rác tận nơi',
    createdAtMs: Date.now() - 86400000 * 8,
  },
];

const DEFAULT_SUPPLY_ITEMS_SEED: KitchenSupplyItem[] = [
  {
    id: 'item_seed_1',
    name: 'Thịt bò phi lê',
    category: 'Hàng tươi sống',
    unit: 'kg',
    currentStock: 12.5,
    minStockAlert: 5,
    defaultUnitPrice: 240000,
    defaultSupplierId: 'supp_seed_1',
    note: 'Bò tươi loại 1 mềm thái xào, nướng',
    createdAtMs: Date.now() - 86400000 * 10,
  },
  {
    id: 'item_seed_2',
    name: 'Cá điêu hồng tươi',
    category: 'Hải sản',
    unit: 'con',
    currentStock: 18,
    minStockAlert: 8,
    defaultUnitPrice: 48000,
    defaultSupplierId: 'supp_seed_1',
    note: 'Size 800g - 1kg/con hấp xì dầu hoặc chiên xù',
    createdAtMs: Date.now() - 86400000 * 10,
  },
  {
    id: 'item_seed_2b',
    name: 'Rau muống cọng & Xà lách',
    category: 'Rau',
    unit: 'kg',
    currentStock: 25,
    minStockAlert: 10,
    defaultUnitPrice: 18000,
    defaultSupplierId: 'supp_seed_2',
    note: 'Rau tươi nhúng lẩu & xào tỏi',
    createdAtMs: Date.now() - 86400000 * 10,
  },
  {
    id: 'item_seed_3',
    name: 'Hạt nêm Knorr 1kg',
    category: 'Gia vị',
    unit: 'gói',
    currentStock: 8,
    minStockAlert: 3,
    defaultUnitPrice: 38000,
    defaultSupplierId: 'supp_seed_2',
    note: 'Gia vị nấu nước lèo & ướp đồ ăn',
    createdAtMs: Date.now() - 86400000 * 9,
  },
  {
    id: 'item_seed_4',
    name: 'Dầu ăn Cái Lân 5L',
    category: 'Gia vị',
    unit: 'can',
    currentStock: 5,
    minStockAlert: 2,
    defaultUnitPrice: 165000,
    defaultSupplierId: 'supp_seed_2',
    note: 'Can 5 lít chiên rán',
    createdAtMs: Date.now() - 86400000 * 9,
  },
  {
    id: 'item_seed_5',
    name: 'Nước rửa chén Sunlight 3.8kg',
    category: 'Tạp vụ & Vệ sinh',
    unit: 'can',
    currentStock: 4,
    minStockAlert: 2,
    defaultUnitPrice: 95000,
    defaultSupplierId: 'supp_seed_3',
    note: 'Dùng cho khu vực rửa chén bát nhà hàng',
    createdAtMs: Date.now() - 86400000 * 8,
  },
  {
    id: 'item_seed_6',
    name: 'Bình gas công nghiệp 45kg',
    category: 'Nhiên liệu & Gas',
    unit: 'bình',
    currentStock: 2,
    minStockAlert: 1,
    defaultUnitPrice: 1450000,
    defaultSupplierId: 'supp_seed_3',
    note: 'Bình lớn bếp khè đôi',
    createdAtMs: Date.now() - 86400000 * 8,
  },
  {
    id: 'item_seed_7',
    name: 'Bia Tiger Lon 330ml (Liên kết)',
    category: 'Bia',
    unit: 'lon',
    currentStock: 120,
    minStockAlert: 48,
    defaultUnitPrice: 18000,
    defaultSupplierId: 'supp_seed_1',
    isBeverageLinked: true,
    beverageProductName: 'Tiger Nâu',
    note: 'Liên kết theo dõi kho bia',
    createdAtMs: Date.now() - 86400000 * 7,
  },
];

type SubView = 'debts' | 'receipts' | 'items' | 'suppliers' | 'beverage_link';

export const KitchenInventoryTab: React.FC<KitchenInventoryTabProps> = ({
  inventoryData,
  onSaveInventoryData,
  products,
  bills,
  billItems,
  returns = [],
  categories = [],
  canWrite,
  canDelete,
  currentUsername,
  todayBusinessStr,
  requestConfirm,
  onOpenBeverageInventory,
}) => {
  const [activeSubView, setActiveSubView] = useState<SubView>('items');

  // Load suppliers and items (with default seeds if completely empty)
  const suppliers: KitchenSupplier[] = useMemo(() => {
    if (inventoryData.kitchenSuppliers && inventoryData.kitchenSuppliers.length > 0) {
      return inventoryData.kitchenSuppliers;
    }
    return DEFAULT_SUPPLIERS_SEED;
  }, [inventoryData.kitchenSuppliers]);

  // Live computed beverage stock map (always in sync with beverage inventory)
  const liveBeverageStockMap = useMemo(() => {
    return computeLiveBeverageStockMap({
      inventoryData,
      products,
      bills,
      billItems,
      returns,
      referenceDate: todayBusinessStr,
    });
  }, [inventoryData, products, bills, billItems, returns, todayBusinessStr]);

  const rawSupplyItems: KitchenSupplyItem[] = useMemo(() => {
    if (inventoryData.kitchenSupplyItems && inventoryData.kitchenSupplyItems.length > 0) {
      return inventoryData.kitchenSupplyItems;
    }
    return DEFAULT_SUPPLY_ITEMS_SEED;
  }, [inventoryData.kitchenSupplyItems]);

  // Dynamically ensure that all linked beverage items ALWAYS reflect live current stock in real time
  const supplyItems: KitchenSupplyItem[] = useMemo(() => {
    return rawSupplyItems.map((item) => {
      const key = (item.beverageProductName || item.name || '').toLowerCase().trim();
      const liveInfo =
        liveBeverageStockMap.get(key) ||
        (item.isBeverageLinked ? liveBeverageStockMap.get(item.name.toLowerCase().trim()) : undefined);

      if (liveInfo) {
        return {
          ...item,
          currentStock: liveInfo.currentStock,
          defaultUnitPrice: liveInfo.costPrice > 0 ? liveInfo.costPrice : item.defaultUnitPrice,
          isBeverageLinked: true,
          beverageProductName: item.beverageProductName || liveInfo.productName,
        };
      }
      return item;
    });
  }, [rawSupplyItems, liveBeverageStockMap]);

  const receipts: KitchenReceipt[] = useMemo(() => {
    return inventoryData.kitchenReceipts || [];
  }, [inventoryData.kitchenReceipts]);

  const supplierPayments: KitchenSupplierPayment[] = useMemo(() => {
    return inventoryData.kitchenSupplierPayments || [];
  }, [inventoryData.kitchenSupplierPayments]);

  const stockUsages: KitchenStockUsageLog[] = useMemo(() => {
    return inventoryData.kitchenStockUsages || [];
  }, [inventoryData.kitchenStockUsages]);

  // Dynamic kitchen categories (Hàng tươi sống, Hải sản, Rau, Gia vị...)
  const kitchenCategories = useMemo(() => {
    const list =
      inventoryData.kitchenCategories && inventoryData.kitchenCategories.length > 0
        ? inventoryData.kitchenCategories
        : DEFAULT_KITCHEN_CATEGORIES;
    const seen = new Set<string>();
    const res: string[] = [];
    for (const c of list) {
      const clean = (c || '').trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        res.push(clean);
      }
    }
    for (const it of supplyItems) {
      const clean = (it.category || '').trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        res.push(clean);
      }
    }
    return res;
  }, [inventoryData.kitchenCategories, supplyItems]);

  // States for Items Sub-view (Phân phối & Quản lý nhóm hàng)
  const [itemCategoryFilter, setItemCategoryFilter] = useState<string>('ALL');
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [selectedSupplyItemIds, setSelectedSupplyItemIds] = useState<Set<string>>(new Set());
  const [showGroupManagerModal, setShowGroupManagerModal] = useState<boolean>(false);
  const [groupManagerInitialTab, setGroupManagerInitialTab] = useState<'distribute' | 'groups'>('distribute');

  // Filtered supply items based on itemCategoryFilter and itemSearchQuery
  const filteredSupplyItems = useMemo(() => {
    return supplyItems.filter((item) => {
      if (itemCategoryFilter !== 'ALL' && (item.category || '').toLowerCase() !== itemCategoryFilter.toLowerCase()) {
        return false;
      }
      if (itemSearchQuery.trim()) {
        const q = itemSearchQuery.trim().toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          (item.category || '').toLowerCase().includes(q) ||
          (item.note || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [supplyItems, itemCategoryFilter, itemSearchQuery]);

  // Total stock value of filtered items
  const totalFilteredStockValue = useMemo(() => {
    return filteredSupplyItems.reduce(
      (sum, it) => sum + (it.currentStock || 0) * (it.defaultUnitPrice || 0),
      0
    );
  }, [filteredSupplyItems]);

  // Overall category stats (count, totalValue) for quick chips
  const categoryStats = useMemo(() => {
    const stats: Record<string, { count: number; totalValue: number }> = {};
    for (const c of kitchenCategories) {
      stats[c] = { count: 0, totalValue: 0 };
    }
    for (const it of supplyItems) {
      const c = it.category || 'Khác';
      if (!stats[c]) stats[c] = { count: 0, totalValue: 0 };
      stats[c].count++;
      stats[c].totalValue += (it.currentStock || 0) * (it.defaultUnitPrice || 0);
    }
    return stats;
  }, [kitchenCategories, supplyItems]);

  // ---------- DEBT AUDIT STATES & LOGIC ----------
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('ALL');
  const [dateFilterMode, setDateFilterMode] = useState<'all' | 'single' | 'range'>('all');
  const [singleDate, setSingleDate] = useState<string>(todayBusinessStr);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(todayBusinessStr);

  // Selected specific products for the chosen supplier (empty array = all products)
  const [selectedProductNames, setSelectedProductNames] = useState<string[]>([]);
  const [productSearchTerm, setProductSearchTerm] = useState<string>('');
  const [isProductFilterCustom, setIsProductFilterCustom] = useState<boolean>(false);

  // Filter receipts by supplier and date
  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      // 1. Supplier Filter
      if (selectedSupplierId !== 'ALL' && r.supplierId !== selectedSupplierId) {
        return false;
      }
      // 2. Date Filter
      if (dateFilterMode === 'single') {
        if (r.receiptDate !== singleDate) return false;
      } else if (dateFilterMode === 'range') {
        if (startDate && r.receiptDate < startDate) return false;
        if (endDate && r.receiptDate > endDate) return false;
      }
      return true;
    });
  }, [receipts, selectedSupplierId, dateFilterMode, singleDate, startDate, endDate]);

  // Distinct products imported from this supplier (or all) within the filtered receipts
  const availableSupplierProducts = useMemo(() => {
    const set = new Set<string>();
    filteredReceipts.forEach((r) => {
      r.items.forEach((it) => {
        if (it.supplyItemName) set.add(it.supplyItemName);
      });
    });
    return Array.from(set).sort();
  }, [filteredReceipts]);

  // Financial calculations for supplier debts
  const debtAnalytics = useMemo(() => {
    let totalImportValue = 0;
    let totalPaidValue = 0;
    let totalDebtValue = 0;

    let selectedProductsValue = 0;
    let selectedProductsQty = 0;

    const receiptsWithSelectedItems: {
      receipt: KitchenReceipt;
      selectedItems: KitchenReceiptItem[];
      selectedSubtotal: number;
    }[] = [];

    filteredReceipts.forEach((r) => {
      totalImportValue += r.totalAmount || 0;
      totalPaidValue += r.paidAmount || 0;
      totalDebtValue += r.debtAmount || 0;

      const matchingItems = isProductFilterCustom && selectedProductNames.length > 0
        ? r.items.filter((it) => selectedProductNames.includes(it.supplyItemName))
        : r.items;

      const itemsTotal = matchingItems.reduce((sum, it) => sum + (it.totalPrice || 0), 0);
      const itemsQty = matchingItems.reduce((sum, it) => sum + (it.quantity || 0), 0);

      if (matchingItems.length > 0) {
        selectedProductsValue += itemsTotal;
        selectedProductsQty += itemsQty;
        receiptsWithSelectedItems.push({
          receipt: r,
          selectedItems: matchingItems,
          selectedSubtotal: itemsTotal,
        });
      }
    });

    // Ratio of selected products value compared to total supplier import value in the period
    const ratioToTotalImports = totalImportValue > 0
      ? (selectedProductsValue / totalImportValue) * 100
      : 0;

    // Estimated share of debt attributed to selected products based on value ratio
    const estimatedSelectedDebt = totalDebtValue > 0 && totalImportValue > 0
      ? Math.round(totalDebtValue * (selectedProductsValue / totalImportValue))
      : 0;

    return {
      totalImportValue,
      totalPaidValue,
      totalDebtValue,
      selectedProductsValue,
      selectedProductsQty,
      ratioToTotalImports,
      estimatedSelectedDebt,
      receiptsWithSelectedItems,
    };
  }, [filteredReceipts, isProductFilterCustom, selectedProductNames]);

  // ---------- MODALS & EDIT STATES ----------
  const [showNewReceiptModal, setShowNewReceiptModal] = useState(false);
  const [showPaySupplierModal, setShowPaySupplierModal] = useState(false);
  const [payTargetSupplierId, setPayTargetSupplierId] = useState<string>('');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer'>('cash');
  const [payDate, setPayDate] = useState<string>(todayBusinessStr);
  const [payNote, setPayNote] = useState<string>('');

  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<KitchenSupplyItem | null>(null);

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<KitchenSupplier | null>(null);

  const [showUsageModal, setShowUsageModal] = useState(false);
  const [usageItem, setUsageItem] = useState<KitchenSupplyItem | null>(null);
  const [usageQty, setUsageQty] = useState<number>(1);
  const [usageReason, setUsageReason] = useState<string>('');

  const [inspectReceipt, setInspectReceipt] = useState<KitchenReceipt | null>(null);

  // Helper to persist data changes
  const saveAllKitchenData = async (
    partial: Partial<WorkspaceInventoryData>,
    toastMsg?: string
  ) => {
    const nextInv: WorkspaceInventoryData = {
      ...inventoryData,
      kitchenCategories: partial.kitchenCategories ?? kitchenCategories,
      kitchenSuppliers: partial.kitchenSuppliers ?? suppliers,
      kitchenSupplyItems: partial.kitchenSupplyItems ?? supplyItems,
      kitchenReceipts: partial.kitchenReceipts ?? receipts,
      kitchenSupplierPayments: partial.kitchenSupplierPayments ?? supplierPayments,
      kitchenStockUsages: partial.kitchenStockUsages ?? stockUsages,
      updatedAtMs: Date.now(),
    };
    await onSaveInventoryData(nextInv, toastMsg);
  };

  // Category group handlers: Add, Rename, Delete, Bulk Assign, Single Assign
  const handleAddCategory = async (newCatName: string) => {
    const clean = newCatName.trim();
    if (!clean) return;
    if (kitchenCategories.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      return;
    }
    const nextCategories = [...kitchenCategories, clean];
    await saveAllKitchenData(
      { kitchenCategories: nextCategories },
      `Đã thêm nhóm hàng "${clean}"!`
    );
  };

  const handleRenameCategory = async (oldName: string, newName: string) => {
    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    if (!cleanOld || !cleanNew || cleanOld.toLowerCase() === cleanNew.toLowerCase()) return;
    const nextCategories = kitchenCategories.map((c) =>
      c.toLowerCase() === cleanOld.toLowerCase() ? cleanNew : c
    );
    const nextItems = supplyItems.map((it) =>
      (it.category || '').toLowerCase() === cleanOld.toLowerCase()
        ? { ...it, category: cleanNew, updatedAtMs: Date.now() }
        : it
    );
    await saveAllKitchenData(
      {
        kitchenCategories: nextCategories,
        kitchenSupplyItems: nextItems,
      },
      `Đã đổi tên nhóm hàng "${cleanOld}" thành "${cleanNew}"!`
    );
  };

  const handleDeleteCategory = (catToDelete: string) => {
    requestConfirm({
      title: 'Xác nhận xóa nhóm hàng',
      message: `Bạn có chắc muốn xóa nhóm hàng "${catToDelete}"? Các mặt hàng thuộc nhóm này sẽ được chuyển sang nhóm "Khác".`,
      confirmLabel: 'Xóa nhóm hàng',
      variant: 'danger',
      onConfirm: async () => {
        const nextCategories = kitchenCategories.filter(
          (c) => c.toLowerCase() !== catToDelete.toLowerCase()
        );
        const fallback = nextCategories[0] || 'Khác';
        const nextItems = supplyItems.map((it) =>
          (it.category || '').toLowerCase() === catToDelete.toLowerCase()
            ? { ...it, category: fallback, updatedAtMs: Date.now() }
            : it
        );
        await saveAllKitchenData(
          {
            kitchenCategories: nextCategories.length > 0 ? nextCategories : ['Khác'],
            kitchenSupplyItems: nextItems,
          },
          `Đã xóa nhóm hàng "${catToDelete}"!`
        );
      },
    });
  };

  const handleQuickAssignItemCategory = async (itemId: string, newCategory: string) => {
    const nextItems = supplyItems.map((it) =>
      it.id === itemId ? { ...it, category: newCategory, updatedAtMs: Date.now() } : it
    );
    await saveAllKitchenData(
      { kitchenSupplyItems: nextItems },
      `Đã chuyển mặt hàng sang nhóm "${newCategory}"!`
    );
  };

  const handleBulkAssignCategory = async (itemIds: string[], targetCategory: string) => {
    if (!itemIds.length || !targetCategory) return;
    const idSet = new Set(itemIds);
    const nextItems = supplyItems.map((it) =>
      idSet.has(it.id) ? { ...it, category: targetCategory, updatedAtMs: Date.now() } : it
    );
    setSelectedSupplyItemIds(new Set());
    await saveAllKitchenData(
      { kitchenSupplyItems: nextItems },
      `Đã phân phối ${itemIds.length} mặt hàng sang nhóm "${targetCategory}"!`
    );
  };

  // Distribute all products in a menu category to a kitchen category group (Req 1)
  const handleDistributeMenuCategoryToKitchen = async (
    menuCategory: string,
    targetKitchenCategory: string
  ) => {
    const cleanMenuCat = menuCategory.trim().toLowerCase();
    const matchingProducts = products.filter(
      (p) => (p.category || '').trim().toLowerCase() === cleanMenuCat
    );
    if (matchingProducts.length === 0) return;

    const existingMap = new Map<string, KitchenSupplyItem>();
    supplyItems.forEach((it) => {
      existingMap.set(it.name.toLowerCase().trim(), it);
    });

    const now = Date.now();
    const updatedItems = [...supplyItems];
    let newCount = 0;
    let updateCount = 0;

    matchingProducts.forEach((p) => {
      const key = p.productName.toLowerCase().trim();
      const existing = existingMap.get(key);
      if (existing) {
        const idx = updatedItems.findIndex((it) => it.id === existing.id);
        if (idx !== -1) {
          updatedItems[idx] = {
            ...existing,
            category: targetKitchenCategory,
            updatedAtMs: now,
          };
          updateCount++;
        }
      } else {
        const newItem: KitchenSupplyItem = {
          id: sanitizeId(`kmenu_${now}_${Math.random().toString(36).slice(2, 6)}`),
          name: p.productName,
          category: targetKitchenCategory,
          unit: p.unit || 'Phần',
          currentStock: 0,
          minStockAlert: 5,
          defaultUnitPrice: Math.round(p.unitPrice * 0.7),
          note: `Phân phối từ thực đơn (${p.category})`,
          createdAtMs: now,
          updatedAtMs: now,
        };
        updatedItems.push(newItem);
        existingMap.set(key, newItem);
        newCount++;
      }
    });

    await saveAllKitchenData(
      {
        kitchenSupplyItems: updatedItems,
      },
      `Đã phân phối ${matchingProducts.length} món từ thực đơn "${menuCategory}" vào nhóm "${targetKitchenCategory}" (+${newCount} mới, cập nhật ${updateCount})!`
    );
  };

  // Sync Bia and Nước ngọt from Beverage Inventory to Kitchen Supply Items
  const handleSyncBeveragesToKitchen = async () => {
    const syncRes = syncBeveragesToKitchenSupplyItems(
      rawSupplyItems,
      liveBeverageStockMap,
      products,
      kitchenCategories
    );

    const currentCats = [...kitchenCategories];
    if (!currentCats.some((c) => c.toLowerCase() === 'bia')) currentCats.push('Bia');
    if (!currentCats.some((c) => c.toLowerCase() === 'nước ngọt')) currentCats.push('Nước ngọt');

    await saveAllKitchenData(
      {
        kitchenSupplyItems: syncRes.updatedSupplyItems,
        kitchenCategories: currentCats,
      },
      `Đã đồng bộ thành công số lượng tồn kho cho ${syncRes.syncedDetails.length} mặt hàng Bia & Nước ngọt sang cột "Tồn hiện tại" (+${syncRes.newCount} mới, cập nhật ${syncRes.updatedCount})!`
    );
  };

  // Record supplier payment / debt paydown
  const handleConfirmPaySupplier = async () => {
    if (!payTargetSupplierId || payAmount <= 0) return;
    const supp = suppliers.find((s) => s.id === payTargetSupplierId);
    if (!supp) return;

    requestConfirm({
      title: 'Xác nhận Trả Nợ Nhà Phân Phối',
      message: `Bạn có chắc muốn thanh toán ${formatVND(payAmount)} (${payMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}) cho nhà phân phối "${supp.name}" vào ngày ${payDate}?`,
      confirmLabel: 'Xác nhận trả nợ',
      variant: 'primary',
      onConfirm: async () => {
        const now = Date.now();
        const paymentRecord: KitchenSupplierPayment = {
          id: sanitizeId(`kpay_${now}_${Math.random().toString(36).slice(2, 6)}`),
          supplierId: supp.id,
          supplierName: supp.name,
          amount: payAmount,
          paymentMethod: payMethod,
          paidDate: payDate,
          note: payNote.trim(),
          createdAtMs: now,
          createdBy: currentUsername,
        };

        // Reduce debt on pending receipts of this supplier (oldest first)
        let remainingToDeduct = payAmount;
        const nextReceipts = receipts.map((r) => {
          if (r.supplierId !== supp.id || r.debtAmount <= 0 || remainingToDeduct <= 0) {
            return r;
          }
          const canPay = Math.min(r.debtAmount, remainingToDeduct);
          const nextPaid = (r.paidAmount || 0) + canPay;
          const nextDebt = Math.max(0, (r.totalAmount || 0) - nextPaid);
          remainingToDeduct -= canPay;
          return {
            ...r,
            paidAmount: nextPaid,
            debtAmount: nextDebt,
            paymentStatus: (nextDebt === 0 ? 'paid' : 'partial') as 'paid' | 'partial',
            updatedAtMs: now,
          };
        });

        const nextPayments = [paymentRecord, ...supplierPayments];
        await saveAllKitchenData(
          {
            kitchenReceipts: nextReceipts,
            kitchenSupplierPayments: nextPayments,
          },
          `Đã ghi nhận trả nợ ${formatVND(payAmount)} cho ${supp.name}!`
        );
        setShowPaySupplierModal(false);
        setPayAmount(0);
        setPayNote('');
      },
    });
  };

  // Delete Receipt and revert stock
  const handleDeleteReceipt = (receipt: KitchenReceipt) => {
    requestConfirm({
      title: 'Xác nhận Xóa Phiếu Nhập Hàng',
      message: `Xóa phiếu ${receipt.receiptCode} (${formatVND(receipt.totalAmount)})? Số lượng tồn kho của các sản phẩm trong phiếu sẽ tự động giảm trừ tương ứng.`,
      confirmLabel: 'Xóa phiếu',
      variant: 'danger',
      onConfirm: async () => {
        // Revert stock
        const itemDeltas = new Map<string, number>();
        receipt.items.forEach((it) => {
          itemDeltas.set(it.supplyItemId, (itemDeltas.get(it.supplyItemId) || 0) + it.quantity);
        });

        const nextSupplyItems = supplyItems.map((item) => {
          const delta = itemDeltas.get(item.id) || 0;
          if (delta > 0) {
            return {
              ...item,
              currentStock: Math.max(0, item.currentStock - delta),
              updatedAtMs: Date.now(),
            };
          }
          return item;
        });

        const nextReceipts = receipts.filter((r) => r.id !== receipt.id);
        await saveAllKitchenData(
          {
            kitchenReceipts: nextReceipts,
            kitchenSupplyItems: nextSupplyItems,
          },
          `Đã xóa phiếu nhập ${receipt.receiptCode} và hoàn tồn kho!`
        );
        if (inspectReceipt?.id === receipt.id) setInspectReceipt(null);
      },
    });
  };

  // Usage record (bếp nấu, tạp vụ dọn)
  const handleConfirmStockUsage = async () => {
    if (!usageItem || usageQty <= 0) return;
    requestConfirm({
      title: 'Xác nhận Xuất Kho / Sử Dụng',
      message: `Xuất ${usageQty} ${usageItem.unit} "${usageItem.name}"? Tồn kho sẽ giảm từ ${usageItem.currentStock} xuống ${Math.max(0, usageItem.currentStock - usageQty)}.`,
      confirmLabel: 'Xuất kho',
      variant: 'primary',
      onConfirm: async () => {
        const now = Date.now();
        const log: KitchenStockUsageLog = {
          id: sanitizeId(`kuse_${now}_${Math.random().toString(36).slice(2, 6)}`),
          usageDate: todayBusinessStr,
          supplyItemId: usageItem.id,
          supplyItemName: usageItem.name,
          quantity: usageQty,
          unit: usageItem.unit,
          reason: usageReason.trim() || 'Sử dụng nấu nướng / tạp vụ ca làm việc',
          usedBy: currentUsername,
          createdAtMs: now,
        };

        const nextSupplyItems = supplyItems.map((it) => {
          if (it.id === usageItem.id) {
            return {
              ...it,
              currentStock: Math.max(0, it.currentStock - usageQty),
              updatedAtMs: now,
            };
          }
          return it;
        });

        await saveAllKitchenData(
          {
            kitchenSupplyItems: nextSupplyItems,
            kitchenStockUsages: [log, ...stockUsages],
          },
          `Đã xuất kho ${usageQty} ${usageItem.unit} ${usageItem.name}!`
        );
        setShowUsageModal(false);
        setUsageItem(null);
        setUsageQty(1);
        setUsageReason('');
      },
    });
  };

  // Calculate Beverage linkage data for the 5th view
  const beverageMetrics = useMemo(() => {
    // Total sold today from billItems (filtered by beverage/beer)
    const beverageCatSet = new Set(['bia', 'nước ngọt', 'đồ uống', 'beer']);
    const todayBills = bills.filter((b) => b.billDate === todayBusinessStr);
    const todayBillIds = new Set(todayBills.map((b) => b.id));

    const todayItems = billItems.filter((it) => todayBillIds.has(it.billId));
    const soldMap = new Map<string, number>();
    todayItems.forEach((it) => {
      const lowerCat = (it.category || '').toLowerCase();
      if (beverageCatSet.has(lowerCat) || lowerCat.includes('bia') || lowerCat.includes('nước ngọt')) {
        const key = it.productName.toLowerCase().trim();
        soldMap.set(key, (soldMap.get(key) || 0) + (Number(it.quantity) || 0));
      }
    });

    const entriesToday = inventoryData.dailyEntries?.[todayBusinessStr] || {};
    const importLogsToday = (inventoryData.importLogs || []).filter(
      (l) => l.date === todayBusinessStr
    );

    return {
      soldMap,
      entriesToday,
      importLogsToday,
    };
  }, [bills, billItems, inventoryData, todayBusinessStr]);

  return (
    <div className="space-y-4">
      {/* Top Banner & Sub-Navigation Header */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white shadow-lg border border-emerald-700/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                <UtensilsCrossed className="w-5 h-5" />
              </span>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                Kho Bếp, Tạp Vụ & Đối Soát Nhà Phân Phối
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-emerald-100/80 max-w-2xl">
              Quản lý nguyên vật liệu (thịt, cá, gia vị...), vật tư tạp vụ (ga, nước rửa chén...), theo dõi công nợ độc lập theo từng nhà phân phối và liên kết kho đồ uống.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {canWrite && (
              <button
                type="button"
                onClick={() => setShowNewReceiptModal(true)}
                className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>+ Nhập Hàng Mới</span>
              </button>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setPayTargetSupplierId(selectedSupplierId !== 'ALL' ? selectedSupplierId : (suppliers[0]?.id || ''));
                  setShowPaySupplierModal(true);
                }}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
              >
                <DollarSign className="w-4 h-4" />
                <span>Trả Nợ NPP</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-view navigation tabs */}
        <div className="mt-4 pt-3 border-t border-emerald-700/50 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveSubView('items')}
            className={`px-3 py-1.5 rounded-xl transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeSubView === 'items'
                ? 'bg-white text-emerald-950 font-bold shadow-xs'
                : 'text-emerald-100 hover:bg-emerald-800/60'
            }`}
          >
            <Package className="w-3.5 h-3.5 text-emerald-400" />
            <span>Hàng Hóa & Tồn Kho ({supplyItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView('receipts')}
            className={`px-3 py-1.5 rounded-xl transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeSubView === 'receipts'
                ? 'bg-white text-emerald-950 font-bold shadow-xs'
                : 'text-emerald-100 hover:bg-emerald-800/60'
            }`}
          >
            <Receipt className="w-3.5 h-3.5 text-blue-400" />
            <span>Phiếu Nhập Hàng ({receipts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView('debts')}
            className={`px-3 py-1.5 rounded-xl transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeSubView === 'debts'
                ? 'bg-white text-emerald-950 font-bold shadow-xs'
                : 'text-emerald-100 hover:bg-emerald-800/60'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-amber-500" />
            <span>Đối Soát Công Nợ NPP</span>
            {debtAnalytics.totalDebtValue > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px]">
                {formatVND(debtAnalytics.totalDebtValue)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView('suppliers')}
            className={`px-3 py-1.5 rounded-xl transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeSubView === 'suppliers'
                ? 'bg-white text-emerald-950 font-bold shadow-xs'
                : 'text-emerald-100 hover:bg-emerald-800/60'
            }`}
          >
            <Truck className="w-3.5 h-3.5 text-yellow-300" />
            <span>Nhà Phân Phối ({suppliers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView('beverage_link')}
            className={`px-3 py-1.5 rounded-xl transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeSubView === 'beverage_link'
                ? 'bg-white text-emerald-950 font-bold shadow-xs'
                : 'text-emerald-100 hover:bg-emerald-800/60'
            }`}
          >
            <Boxes className="w-3.5 h-3.5 text-amber-300" />
            <span>Liên Hệ Tồn Bia & Nước Ngọt</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 1. SUB-VIEW: ĐỐI SOÁT CÔNG NỢ NHÀ PHÂN PHỐI                  */}
      {/* ============================================================ */}
      {activeSubView === 'debts' && (
        <div className="space-y-4">
          {/* Controls Bar: Chọn NPP, Chọn Thời Gian & Chọn Sản Phẩm */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3.5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Chọn Nhà Phân Phối */}
              <div className="flex-1 min-w-[240px]">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-amber-600" />
                  <span>Chọn Nhà Phân Phối (NPP) cần đối soát:</span>
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => {
                    setSelectedSupplierId(e.target.value);
                    setSelectedProductNames([]);
                    setIsProductFilterCustom(false);
                  }}
                  className="w-full h-10 px-3 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="ALL">-- Tất Cả Nhà Phân Phối --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.phone ? `(${s.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Bộ lọc ngày / khoảng ngày */}
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>Khoảng thời gian đối soát công nợ:</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-xl border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setDateFilterMode('all')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                        dateFilterMode === 'all'
                          ? 'bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-white'
                          : 'text-slate-500'
                      }`}
                    >
                      Tất cả
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateFilterMode('single')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                        dateFilterMode === 'single'
                          ? 'bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-white'
                          : 'text-slate-500'
                      }`}
                    >
                      1 Ngày
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateFilterMode('range')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                        dateFilterMode === 'range'
                          ? 'bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-white'
                          : 'text-slate-500'
                      }`}
                    >
                      Khoảng ngày
                    </button>
                  </div>

                  {dateFilterMode === 'single' && (
                    <input
                      type="date"
                      value={singleDate}
                      onChange={(e) => setSingleDate(e.target.value)}
                      className="h-9 px-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  )}

                  {dateFilterMode === 'range' && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-9 px-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                      <span className="text-xs text-slate-400">→</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="h-9 px-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* PRODUCT SELECTION FILTER (Tất cả sản phẩm vs 1 vài sản phẩm) */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Lọc sản phẩm đối soát:</span>
                  </span>
                  <div className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setIsProductFilterCustom(false);
                        setSelectedProductNames([]);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                        !isProductFilterCustom
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Tất cả sản phẩm ({availableSupplierProducts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsProductFilterCustom(true)}
                      className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                        isProductFilterCustom
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Chọn 1 vài sản phẩm ({selectedProductNames.length})
                    </button>
                  </div>
                </div>

                {isProductFilterCustom && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedProductNames([...availableSupplierProducts])}
                      className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer"
                    >
                      Chọn tất cả
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedProductNames([])}
                      className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                )}
              </div>

              {/* Multi-select chips for products */}
              {isProductFilterCustom && (
                <div className="p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Tìm nhanh mặt hàng để chọn..."
                      value={productSearchTerm}
                      onChange={(e) => setProductSearchTerm(e.target.value)}
                      className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                    {availableSupplierProducts
                      .filter((name) =>
                        name.toLowerCase().includes(productSearchTerm.toLowerCase().trim())
                      )
                      .map((pName) => {
                        const isChecked = selectedProductNames.includes(pName);
                        return (
                          <button
                            key={pName}
                            type="button"
                            onClick={() => {
                              setSelectedProductNames((prev) =>
                                isChecked ? prev.filter((n) => n !== pName) : [...prev, pName]
                              );
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                              isChecked
                                ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span>{isChecked ? '✓' : '+'}</span>
                            <span>{pName}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ANALYTICS COMPARISON DASHBOARD CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Tổng Tiền Nhập ({filteredReceipts.length} phiếu)
              </span>
              <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-1">
                {formatVND(debtAnalytics.totalImportValue)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {selectedSupplierId === 'ALL'
                  ? 'Toàn bộ nhà phân phối'
                  : suppliers.find((s) => s.id === selectedSupplierId)?.name}
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs">
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider block">
                Đã Thanh Toán
              </span>
              <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {formatVND(debtAnalytics.totalPaidValue)}
              </div>
              <div className="text-[11px] text-emerald-700/80 mt-1">
                Tiền mặt & Chuyển khoản đã thanh toán
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 shadow-xs">
              <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 uppercase tracking-wider block">
                Tổng Còn Nợ NPP
              </span>
              <div className="text-lg sm:text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                {formatVND(debtAnalytics.totalDebtValue)}
              </div>
              <div className="text-[11px] text-rose-700/80 mt-1">
                Chưa thanh toán dứt điểm
              </div>
            </div>

            {/* PRODUCT SPECIFIC RATIO CARD */}
            <div className="p-4 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
                  SP Đã Chọn Đối Soát
                </span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                  {debtAnalytics.ratioToTotalImports.toFixed(1)}%
                </span>
              </div>
              <div className="text-lg sm:text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">
                {formatVND(debtAnalytics.selectedProductsValue)}
              </div>
              <div className="text-[11px] text-amber-800/80 mt-1">
                {isProductFilterCustom && selectedProductNames.length > 0
                  ? `${selectedProductNames.length} món đã chọn (SL: ${debtAnalytics.selectedProductsQty})`
                  : `Tất cả sản phẩm (SL: ${debtAnalytics.selectedProductsQty})`}
              </div>
            </div>
          </div>

          {/* COMPARISON PROGRESS BAR */}
          {debtAnalytics.totalImportValue > 0 && (
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>
                    So sánh giá trị các sản phẩm được chọn so với Tổng giá trị hàng nhập từ NPP:
                  </span>
                </span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {formatVND(debtAnalytics.selectedProductsValue)} / {formatVND(debtAnalytics.totalImportValue)} ({debtAnalytics.ratioToTotalImports.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                  style={{ width: `${Math.min(100, debtAnalytics.ratioToTotalImports)}%` }}
                  title={`Sản phẩm chọn: ${debtAnalytics.ratioToTotalImports.toFixed(1)}%`}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Ước tính công nợ tương ứng của các mặt hàng đã chọn: ~<strong>{formatVND(debtAnalytics.estimatedSelectedDebt)}</strong> (dựa trên tỷ lệ tiền hàng trong kỳ).
              </p>
            </div>
          )}

          {/* TABLE OF RECEIPTS MATCHING SELECTED PRODUCTS */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <span>Chi tiết Phiếu Nhập & Mặt Hàng Liên Quan ({debtAnalytics.receiptsWithSelectedItems.length})</span>
              </h3>
              {canWrite && debtAnalytics.totalDebtValue > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPayTargetSupplierId(selectedSupplierId !== 'ALL' ? selectedSupplierId : (suppliers[0]?.id || ''));
                    setPayAmount(debtAnalytics.totalDebtValue);
                    setShowPaySupplierModal(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 cursor-pointer"
                >
                  Tất toán nợ đợt này
                </button>
              )}
            </div>

            {debtAnalytics.receiptsWithSelectedItems.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Không tìm thấy phiếu nhập hoặc mặt hàng nào phù hợp với bộ lọc đã chọn.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/80 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3">Mã Phiếu & Ngày</th>
                      <th className="py-2.5 px-3">Nhà Phân Phối</th>
                      <th className="py-2.5 px-3">Sản phẩm đối soát trong phiếu</th>
                      <th className="py-2.5 px-3 text-right">Tiền món chọn</th>
                      <th className="py-2.5 px-3 text-right">Tổng phiếu</th>
                      <th className="py-2.5 px-3 text-right">Còn nợ phiếu</th>
                      <th className="py-2.5 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {debtAnalytics.receiptsWithSelectedItems.map(({ receipt, selectedItems, selectedSubtotal }) => (
                      <tr key={receipt.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-3">
                          <div className="font-mono font-bold text-slate-900 dark:text-white">
                            {receipt.receiptCode}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {receipt.receiptDate}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                          {receipt.supplierName}
                        </td>
                        <td className="py-3 px-3 max-w-sm">
                          <div className="space-y-1">
                            {selectedItems.map((it, idx) => (
                              <div key={idx} className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-700 dark:text-slate-300">
                                  • {it.supplyItemName} ({it.quantity} {it.unit} × {formatVND(it.unitPrice)})
                                </span>
                                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 ml-2">
                                  {formatVND(it.totalPrice)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                          {formatVND(selectedSubtotal)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          {formatVND(receipt.totalAmount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {receipt.debtAmount > 0 ? (
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              {formatVND(receipt.debtAmount)}
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              Đã trả đủ
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setInspectReceipt(receipt)}
                            className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 cursor-pointer"
                          >
                            Chi tiết
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteReceipt(receipt)}
                              className="px-2 py-1 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              Xóa
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* LỊCH SỬ THANH TOÁN TRẢ NỢ NPP GẦN NHẤT */}
          {supplierPayments.length > 0 && (
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>Lịch sử Thanh Toán Trả Nợ Cho NPP ({supplierPayments.length})</span>
                </h4>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {supplierPayments.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {p.supplierName}
                      </span>
                      <span className="text-[11px] text-slate-500 ml-2">
                        Ngày {p.paidDate} · {p.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                      </span>
                      {p.note && (
                        <p className="text-[11px] text-slate-400 italic mt-0.5">"{p.note}"</p>
                      )}
                    </div>
                    <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{formatVND(p.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. SUB-VIEW: QUẢN LÝ PHIẾU NHẬP HÀNG (RECEIPTS)             */}
      {/* ============================================================ */}
      {activeSubView === 'receipts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-600" />
              <span>Danh Sách Phiếu Nhập Hàng Kho Bếp & Tạp Vụ ({receipts.length})</span>
            </h3>
            {canWrite && (
              <button
                type="button"
                onClick={() => setShowNewReceiptModal(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Tạo Phiếu Nhập Mới</span>
              </button>
            )}
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
            {receipts.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Chưa có phiếu nhập hàng nào. Nhấn "+ Tạo Phiếu Nhập Mới" để bắt đầu nhập thịt, cá, gia vị, ga, nước rửa chén...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500">
                      <th className="py-2.5 px-3">Mã Phiếu</th>
                      <th className="py-2.5 px-3">Ngày nhập</th>
                      <th className="py-2.5 px-3">Nhà phân phối</th>
                      <th className="py-2.5 px-3">Số mặt hàng</th>
                      <th className="py-2.5 px-3 text-right">Tổng tiền</th>
                      <th className="py-2.5 px-3 text-right">Đã thanh toán</th>
                      <th className="py-2.5 px-3 text-right">Còn nợ</th>
                      <th className="py-2.5 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {receipts.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                          {r.receiptCode}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300">
                          {r.receiptDate}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                          {r.supplierName}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                          {r.items.length} món ({r.items.map((i) => i.supplyItemName).slice(0, 2).join(', ')}...)
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatVND(r.totalAmount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                          {formatVND(r.paidAmount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                          {r.debtAmount > 0 ? formatVND(r.debtAmount) : '0đ'}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setInspectReceipt(r)}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 cursor-pointer"
                          >
                            Xem chi tiết
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteReceipt(r)}
                              className="px-2 py-1 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              Xóa
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. SUB-VIEW: DANH MỤC HÀNG HÓA & TỒN KHO                     */}
      {/* ============================================================ */}
      {activeSubView === 'items' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-600" />
                <span>Danh Mục Hàng Hóa Kho Bếp & Tạp Vụ ({filteredSupplyItems.length}/{supplyItems.length})</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Giá trị tồn kho: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{formatVND(totalFilteredStockValue)}</strong>
                {itemCategoryFilter !== 'ALL' && ` · Đang lọc theo nhóm: "${itemCategoryFilter}"`}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {canWrite && (
                <button
                  type="button"
                  onClick={handleSyncBeveragesToKitchen}
                  className="px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-900 dark:text-amber-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  title="Đồng bộ số lượng tồn kho Bia & Nước ngọt từ kho Đồ Uống sang Hàng Hóa Tồn Kho"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Đồng Bộ Kho Bia & Nước Ngọt</span>
                </button>
              )}

              {canWrite && (
                <button
                  type="button"
                  onClick={() => {
                    setGroupManagerInitialTab('distribute');
                    setShowGroupManagerModal(true);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  title="Phân phối các mặt hàng vào nhóm hàng (Hàng tươi sống, Hải sản, Rau, Gia vị...)"
                >
                  <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>⚙️ Phân Phối Nhóm Hàng</span>
                </button>
              )}

              {canWrite && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    setShowItemModal(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer shadow-2xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Thêm Hàng Mới</span>
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setItemCategoryFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
                itemCategoryFilter === 'ALL'
                  ? 'bg-emerald-600 text-white font-bold shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <span>Tất cả</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-700/40 text-emerald-100">
                {supplyItems.length}
              </span>
            </button>

            {kitchenCategories.map((cat) => {
              const count = categoryStats[cat]?.count || 0;
              const isSelected = itemCategoryFilter.toLowerCase() === cat.toLowerCase();
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setItemCategoryFilter(isSelected ? 'ALL' : cat)}
                  className={`px-3 py-1.5 rounded-xl transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white font-bold shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <span>{cat}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      isSelected
                        ? 'bg-emerald-700/50 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}

            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setGroupManagerInitialTab('groups');
                  setShowGroupManagerModal(true);
                }}
                className="px-2.5 py-1.5 rounded-xl border border-dashed border-emerald-400 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 shrink-0 text-xs inline-flex items-center gap-1 cursor-pointer"
                title="Quản lý và thêm nhóm hàng mới"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Nhóm</span>
              </button>
            )}
          </div>

          {/* Search bar */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={itemSearchQuery}
              onChange={(e) => setItemSearchQuery(e.target.value)}
              placeholder="Tìm kiếm thịt, cá, rau, gia vị, bia, nước ngọt, tạp vụ, gas..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
            {itemSearchQuery && (
              <button
                type="button"
                onClick={() => setItemSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500">
                    {canWrite && (
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            filteredSupplyItems.length > 0 &&
                            filteredSupplyItems.every((it) => selectedSupplyItemIds.has(it.id))
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSupplyItemIds(new Set(filteredSupplyItems.map((it) => it.id)));
                            } else {
                              setSelectedSupplyItemIds(new Set());
                            }
                          }}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="py-2.5 px-3">Tên Hàng Hóa</th>
                    <th className="py-2.5 px-3 min-w-[140px]">Phân loại & Nhóm hàng</th>
                    <th className="py-2.5 px-3">Đơn vị</th>
                    <th className="py-2.5 px-3 text-right">Tồn hiện tại</th>
                    <th className="py-2.5 px-3 text-right">Giá tham khảo</th>
                    <th className="py-2.5 px-3 text-right">Giá trị tồn</th>
                    <th className="py-2.5 px-3">Nhà phân phối</th>
                    <th className="py-2.5 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSupplyItems.map((item) => {
                    const supp = suppliers.find((s) => s.id === item.defaultSupplierId);
                    const isLowStock =
                      item.minStockAlert && item.currentStock <= item.minStockAlert;
                    const isChecked = selectedSupplyItemIds.has(item.id);
                    const itemStockVal = (item.currentStock || 0) * (item.defaultUnitPrice || 0);

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                          isChecked ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
                        }`}
                      >
                        {canWrite && (
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = new Set(selectedSupplyItemIds);
                                if (e.target.checked) next.add(item.id);
                                else next.delete(item.id);
                                setSelectedSupplyItemIds(next);
                              }}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{item.name}</span>
                            {item.isBeverageLinked && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 text-[10px]">
                                Kho bia/nước
                              </span>
                            )}
                          </div>
                          {item.note && (
                            <p className="text-[11px] text-slate-400 mt-0.5">{item.note}</p>
                          )}
                        </td>

                        {/* Inline quick-assign group select */}
                        <td className="py-3 px-3">
                          {canWrite ? (
                            <select
                              value={item.category}
                              onChange={(e) => handleQuickAssignItemCategory(item.id, e.target.value)}
                              className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer"
                              title="Chuyển sang nhóm hàng khác"
                            >
                              {kitchenCategories.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                              {item.category}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">
                          {item.unit}
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold">
                          <span
                            className={
                              isLowStock
                                ? 'text-rose-600 dark:text-rose-400 flex items-center justify-end gap-1'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }
                          >
                            {isLowStock && <AlertTriangle className="w-3.5 h-3.5" />}
                            <span>{item.currentStock} {item.unit}</span>
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          {item.defaultUnitPrice ? formatVND(item.defaultUnitPrice) : '—'}
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {itemStockVal > 0 ? formatVND(itemStockVal) : '0đ'}
                        </td>

                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                          {supp?.name || (item.isBeverageLinked ? 'Kho Đồ Uống' : 'Chưa gán NPP')}
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => {
                                setUsageItem(item);
                                setUsageQty(1);
                                setShowUsageModal(true);
                              }}
                              className="px-2 py-1 rounded-lg border border-teal-200 text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 text-xs font-semibold cursor-pointer"
                              title="Xuất kho sử dụng"
                            >
                              Xuất dùng
                            </button>
                          )}
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingItem(item);
                                setShowItemModal(true);
                              }}
                              className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              Sửa
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                requestConfirm({
                                  title: 'Xóa Hàng Hóa',
                                  message: `Xóa mặt hàng "${item.name}" khỏi danh mục kho bếp & tạp vụ?`,
                                  confirmLabel: 'Xóa',
                                  variant: 'danger',
                                  onConfirm: async () => {
                                    const next = supplyItems.filter((i) => i.id !== item.id);
                                    await saveAllKitchenData(
                                      { kitchenSupplyItems: next },
                                      `Đã xóa hàng hóa "${item.name}"!`
                                    );
                                  },
                                });
                              }}
                              className="px-2 py-1 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              Xóa
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sticky Bulk Action Toolbar */}
          {canWrite && selectedSupplyItemIds.size > 0 && (
            <div className="p-3 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl border border-slate-700">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-bold flex items-center justify-center text-xs">
                  {selectedSupplyItemIds.size}
                </span>
                <span>Đang chọn {selectedSupplyItemIds.size} mặt hàng</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-300">Phân phối sang nhóm:</span>
                <select
                  id="bulk-category-select-kitchen"
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 text-white border border-slate-600 cursor-pointer"
                  defaultValue={kitchenCategories[0]}
                >
                  {kitchenCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('bulk-category-select-kitchen') as HTMLSelectElement;
                    if (el) {
                      handleBulkAssignCategory(Array.from(selectedSupplyItemIds), el.value);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  Áp dụng phân phối
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSupplyItemIds(new Set())}
                  className="px-2 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-800 text-slate-400 text-xs cursor-pointer"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. SUB-VIEW: DANH SÁCH NHÀ PHÂN PHỐI (SUPPLIERS)            */}
      {/* ============================================================ */}
      {activeSubView === 'suppliers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="w-4 h-4 text-amber-600" />
              <span>Danh Sách Nhà Phân Phối / Đối Tác Cung Cấp ({suppliers.length})</span>
            </h3>
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setEditingSupplier(null);
                  setShowSupplierModal(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Thêm Nhà Phân Phối</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {suppliers.map((supp) => {
              // Calculate supplier total receipts & debt
              const suppReceipts = receipts.filter((r) => r.supplierId === supp.id);
              const totalVal = suppReceipts.reduce((s, r) => s + (r.totalAmount || 0), 0);
              const totalDebt = suppReceipts.reduce((s, r) => s + (r.debtAmount || 0), 0);

              return (
                <div
                  key={supp.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {supp.name}
                      </h4>
                      {supp.contactPerson && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Liên hệ: {supp.contactPerson} {supp.phone ? `(${supp.phone})` : ''}
                        </p>
                      )}
                    </div>
                    {totalDebt > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                        Nợ {formatVND(totalDebt)}
                      </span>
                    )}
                  </div>

                  {supp.address && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      📍 {supp.address}
                    </p>
                  )}
                  {supp.note && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                      "{supp.note}"
                    </p>
                  )}

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold">
                    <div>
                      <span className="text-slate-500">Đã nhập: </span>
                      <span className="font-mono">{formatVND(totalVal)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSupplier(supp);
                            setShowSupplierModal(true);
                          }}
                          className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          Sửa
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            requestConfirm({
                              title: 'Xóa Nhà Phân Phối',
                              message: `Xóa nhà phân phối "${supp.name}"?`,
                              confirmLabel: 'Xóa',
                              variant: 'danger',
                              onConfirm: async () => {
                                const next = suppliers.filter((s) => s.id !== supp.id);
                                await saveAllKitchenData(
                                  { kitchenSuppliers: next },
                                  `Đã xóa nhà phân phối "${supp.name}"!`
                                );
                              },
                            });
                          }}
                          className="px-2 py-1 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. SUB-VIEW: LIÊN HỆ TỒN KHO BIA & NƯỚC NGỌT (BEVERAGE LINK)  */}
      {/* ============================================================ */}
      {activeSubView === 'beverage_link' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-amber-600" />
                <span>Liên Hệ Số Lượng Với Bia & Nước Ngọt (Tồn Kho & Nhập Mới)</span>
              </h3>
              {onOpenBeverageInventory && (
                <button
                  type="button"
                  onClick={onOpenBeverageInventory}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Chuyển Sang Kho Đồ Uống</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
              Bảng này đối chiếu trực tiếp dữ liệu tồn kho đầu ca, số lượng nhập mới trong ngày và số lượng thực bán của quầy Bia & Nước ngọt để quản lý kho nắm bắt toàn diện.
            </p>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-3">Sản phẩm Đồ Uống</th>
                    <th className="py-2.5 px-3">Danh mục</th>
                    <th className="py-2.5 px-3 text-right">Tồn đầu ca</th>
                    <th className="py-2.5 px-3 text-right">Nhập mới hôm nay</th>
                    <th className="py-2.5 px-3 text-right">Thực bán</th>
                    <th className="py-2.5 px-3 text-right">Tồn cuối dự kiến</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {products
                    .filter((p) => isBeverageCategory(p.category))
                    .map((prod) => {
                      const key = prod.productName.toLowerCase().trim();
                      const live = liveBeverageStockMap.get(key);
                      const entry = beverageMetrics.entriesToday[key];
                      const startStock = entry?.openingStock !== undefined ? entry.openingStock : (live?.currentStock ?? 0);
                      const addedStock = entry?.importedQty ?? 0;
                      const soldQty = beverageMetrics.soldMap.get(key) || 0;
                      const finalStock = live ? live.currentStock : Math.max(0, startStock + addedStock - soldQty);

                      return (
                        <tr key={prod.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                            {prod.productName}
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                            {prod.category}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {startStock} {prod.unit || 'Lon'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                            +{addedStock} {prod.unit || 'Lon'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                            {soldQty} {prod.unit || 'Lon'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {finalStock} {prod.unit || 'Lon'}
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

      {/* ============================================================ */}
      {/* MODAL: TẠO PHIẾU NHẬP HÀNG MỚI                              */}
      {/* ============================================================ */}
      {showNewReceiptModal && (
        <NewKitchenReceiptModal
          suppliers={suppliers}
          supplyItems={supplyItems}
          todayStr={todayBusinessStr}
          onClose={() => setShowNewReceiptModal(false)}
          onSave={async (newReceipt, updatedSupplyItems) => {
            const nextReceipts = [newReceipt, ...receipts];
            await saveAllKitchenData(
              {
                kitchenReceipts: nextReceipts,
                kitchenSupplyItems: updatedSupplyItems,
              },
              `Đã tạo phiếu nhập ${newReceipt.receiptCode} và cập nhật tồn kho!`
            );
            setShowNewReceiptModal(false);
          }}
          onQuickAddSupplier={async (name) => {
            const now = Date.now();
            const supp: KitchenSupplier = {
              id: sanitizeId(`supp_${now}_${Math.random().toString(36).slice(2, 6)}`),
              name: name.trim(),
              createdAtMs: now,
            };
            const next = [...suppliers, supp];
            await saveAllKitchenData({ kitchenSuppliers: next });
            return supp;
          }}
        />
      )}

      {/* ============================================================ */}
      {/* MODAL: TRẢ NỢ NHÀ PHÂN PHỐI                                  */}
      {/* ============================================================ */}
      {showPaySupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span>Ghi Nhận Trả Nợ Cho Nhà Phân Phối</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPaySupplierModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nhà phân phối:
                </label>
                <select
                  value={payTargetSupplierId}
                  onChange={(e) => setPayTargetSupplierId(e.target.value)}
                  className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Số tiền thanh toán trả nợ:
                </label>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={payAmount || ''}
                  onChange={(e) => setPayAmount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="Nhập số tiền..."
                  className="w-full h-10 px-3 text-xs font-mono font-bold rounded-xl border border-emerald-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Ngày trả:
                  </label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Hình thức:
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as 'cash' | 'transfer')}
                    className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="cash">Tiền mặt</option>
                    <option value="transfer">Chuyển khoản</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú thanh toán:
                </label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Ghi chú đợt trả tiền, số tài khoản..."
                  className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowPaySupplierModal(false)}
                className="px-3 py-2 rounded-xl border border-slate-300 text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={payAmount <= 0}
                onClick={handleConfirmPaySupplier}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
              >
                Xác nhận trả nợ ({formatVND(payAmount)})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: THÊM / SỬA HÀNG HÓA KHO BẾP & TẠP VỤ                 */}
      {/* ============================================================ */}
      {showItemModal && (
        <ItemEditModal
          item={editingItem}
          categories={kitchenCategories}
          suppliers={suppliers}
          onClose={() => {
            setShowItemModal(false);
            setEditingItem(null);
          }}
          onSave={async (savedItem) => {
            const next = editingItem
              ? supplyItems.map((i) => (i.id === savedItem.id ? savedItem : i))
              : [...supplyItems, savedItem];
            await saveAllKitchenData(
              { kitchenSupplyItems: next },
              `Đã lưu mặt hàng "${savedItem.name}"!`
            );
            setShowItemModal(false);
            setEditingItem(null);
          }}
          onAddCategory={handleAddCategory}
        />
      )}

      {/* ============================================================ */}
      {/* MODAL: QUẢN LÝ & PHÂN PHỐI NHÓM HÀNG                         */}
      {/* ============================================================ */}
      {showGroupManagerModal && (
        <GroupManagerModal
          categories={kitchenCategories}
          supplyItems={supplyItems}
          menuCategories={categories}
          products={products}
          initialTab={groupManagerInitialTab}
          onClose={() => setShowGroupManagerModal(false)}
          onAddCategory={handleAddCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          onBulkAssignCategory={handleBulkAssignCategory}
          onSingleAssignCategory={handleQuickAssignItemCategory}
          onDistributeMenuCategory={handleDistributeMenuCategoryToKitchen}
        />
      )}

      {/* ============================================================ */}
      {/* MODAL: THÊM / SỬA NHÀ PHÂN PHỐI                              */}
      {/* ============================================================ */}
      {showSupplierModal && (
        <SupplierEditModal
          supplier={editingSupplier}
          onClose={() => {
            setShowSupplierModal(false);
            setEditingSupplier(null);
          }}
          onSave={async (savedSupp) => {
            const next = editingSupplier
              ? suppliers.map((s) => (s.id === savedSupp.id ? savedSupp : s))
              : [...suppliers, savedSupp];
            await saveAllKitchenData(
              { kitchenSuppliers: next },
              `Đã lưu nhà phân phối "${savedSupp.name}"!`
            );
            setShowSupplierModal(false);
            setEditingSupplier(null);
          }}
        />
      )}

      {/* ============================================================ */}
      {/* MODAL: XUẤT KHO / SỬ DỤNG NỘI BỘ                            */}
      {/* ============================================================ */}
      {showUsageModal && usageItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-amber-600" />
                <span>Xuất Kho / Sử Dụng Nội Bộ</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowUsageModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-xs text-slate-500">Mặt hàng:</span>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {usageItem.name} (Tồn hiện tại: {usageItem.currentStock} {usageItem.unit})
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Số lượng xuất ({usageItem.unit}):
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={usageQty}
                  onChange={(e) => setUsageQty(Math.max(0.1, Number(e.target.value) || 0))}
                  className="w-full h-10 px-3 text-xs font-mono font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Lý do / Bộ phận sử dụng:
                </label>
                <input
                  type="text"
                  value={usageReason}
                  onChange={(e) => setUsageReason(e.target.value)}
                  placeholder="VD: Bếp nấu ca trưa, Tạp vụ rửa chén sảnh..."
                  className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowUsageModal(false)}
                className="px-3 py-2 rounded-xl border border-slate-300 text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmStockUsage}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
              >
                Xác nhận xuất kho
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: XEM CHI TIẾT PHIẾU NHẬP HÀNG                          */}
      {/* ============================================================ */}
      {inspectReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  <span>Chi tiết Phiếu Nhập {inspectReceipt.receiptCode}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  NPP: {inspectReceipt.supplierName} · Ngày {inspectReceipt.receiptDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectReceipt(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3">
              <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500">
                      <th className="py-2 px-3">Mặt hàng</th>
                      <th className="py-2 px-3 text-right">SL</th>
                      <th className="py-2 px-3 text-right">Đơn giá</th>
                      <th className="py-2 px-3 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {inspectReceipt.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                          {it.supplyItemName}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {it.quantity} {it.unit}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                          {formatVND(it.unitPrice)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatVND(it.totalPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Tổng tiền phiếu:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {formatVND(inspectReceipt.totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>Đã thanh toán:</span>
                  <span className="font-mono font-bold">{formatVND(inspectReceipt.paidAmount)}</span>
                </div>
                <div className="flex justify-between text-rose-600">
                  <span>Còn nợ NPP:</span>
                  <span className="font-mono font-bold">{formatVND(inspectReceipt.debtAmount)}</span>
                </div>
                {inspectReceipt.note && (
                  <div className="pt-1 border-t border-slate-200 dark:border-slate-700 text-slate-500 text-[11px]">
                    Ghi chú: {inspectReceipt.note}
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectReceipt(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: MODAL TẠO PHIẾU NHẬP HÀNG MỚI
// =========================================================================
interface NewKitchenReceiptModalProps {
  suppliers: KitchenSupplier[];
  supplyItems: KitchenSupplyItem[];
  todayStr: string;
  onClose: () => void;
  onSave: (receipt: KitchenReceipt, updatedSupplyItems: KitchenSupplyItem[]) => Promise<void>;
  onQuickAddSupplier: (name: string) => Promise<KitchenSupplier>;
}

const NewKitchenReceiptModal: React.FC<NewKitchenReceiptModalProps> = ({
  suppliers,
  supplyItems,
  todayStr,
  onClose,
  onSave,
  onQuickAddSupplier,
}) => {
  const [receiptDate, setReceiptDate] = useState<string>(todayStr);
  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id || '');
  const [newSupplierName, setNewSupplierName] = useState<string>('');
  const [showQuickAddSupplier, setShowQuickAddSupplier] = useState(false);

  // Items in receipt
  interface DraftReceiptItem {
    supplyItemId: string;
    supplyItemName: string;
    category: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }

  const [items, setItems] = useState<DraftReceiptItem[]>(() => {
    const firstItem = supplyItems[0];
    if (firstItem) {
      return [
        {
          supplyItemId: firstItem.id,
          supplyItemName: firstItem.name,
          category: firstItem.category,
          unit: firstItem.unit,
          quantity: 1,
          unitPrice: firstItem.defaultUnitPrice || 100000,
          totalPrice: firstItem.defaultUnitPrice || 100000,
        },
      ];
    }
    return [];
  });

  const [paymentOption, setPaymentOption] = useState<'debt' | 'paid_cash' | 'paid_transfer' | 'partial'>('debt');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [note, setNote] = useState<string>('');

  const subtotal = useMemo(() => {
    return items.reduce((s, it) => s + (it.totalPrice || 0), 0);
  }, [items]);

  const effectivePaid = useMemo(() => {
    if (paymentOption === 'paid_cash' || paymentOption === 'paid_transfer') {
      return subtotal;
    }
    if (paymentOption === 'debt') {
      return 0;
    }
    return Math.min(subtotal, Math.max(0, paidAmount));
  }, [paymentOption, subtotal, paidAmount]);

  const remainingDebt = Math.max(0, subtotal - effectivePaid);

  const handleAddItemRow = () => {
    const defaultItem = supplyItems[0];
    if (defaultItem) {
      setItems((prev) => [
        ...prev,
        {
          supplyItemId: defaultItem.id,
          supplyItemName: defaultItem.name,
          category: defaultItem.category,
          unit: defaultItem.unit,
          quantity: 1,
          unitPrice: defaultItem.defaultUnitPrice || 50000,
          totalPrice: defaultItem.defaultUnitPrice || 50000,
        },
      ]);
    }
  };

  const handleUpdateItem = (
    idx: number,
    field: 'supplyItemId' | 'quantity' | 'unitPrice',
    val: string | number
  ) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const copy = { ...it };
        if (field === 'supplyItemId') {
          const found = supplyItems.find((s) => s.id === String(val));
          if (found) {
            copy.supplyItemId = found.id;
            copy.supplyItemName = found.name;
            copy.category = found.category;
            copy.unit = found.unit;
            copy.unitPrice = found.defaultUnitPrice || copy.unitPrice;
            copy.totalPrice = copy.quantity * copy.unitPrice;
          }
        } else if (field === 'quantity') {
          copy.quantity = Math.max(0.1, Number(val) || 0);
          copy.totalPrice = copy.quantity * copy.unitPrice;
        } else if (field === 'unitPrice') {
          copy.unitPrice = Math.max(0, Number(val) || 0);
          copy.totalPrice = copy.quantity * copy.unitPrice;
        }
        return copy;
      })
    );
  };

  const handleRemoveRow = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    let targetSupplier = suppliers.find((s) => s.id === supplierId);
    if (!targetSupplier && suppliers.length > 0) {
      targetSupplier = suppliers[0];
    }
    if (!targetSupplier) return;

    const now = Date.now();
    const dateCompact = receiptDate.replace(/-/g, '');
    const randCode = Math.random().toString(36).substring(2, 5).toUpperCase();
    const receiptCode = `PN-${dateCompact}-${randCode}`;

    const receiptItems: KitchenReceiptItem[] = items.map((it) => ({
      supplyItemId: it.supplyItemId,
      supplyItemName: it.supplyItemName,
      category: it.category,
      unit: it.unit,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
    }));

    const paymentStatus: 'paid' | 'partial' | 'debt' =
      remainingDebt === 0 ? 'paid' : effectivePaid > 0 ? 'partial' : 'debt';

    const paymentMethod: 'cash' | 'transfer' | 'debt' =
      paymentOption === 'paid_transfer' ? 'transfer' : paymentOption === 'paid_cash' ? 'cash' : 'debt';

    const newReceipt: KitchenReceipt = {
      id: sanitizeId(`krec_${now}_${Math.random().toString(36).slice(2, 6)}`),
      receiptCode,
      receiptDate,
      supplierId: targetSupplier.id,
      supplierName: targetSupplier.name,
      items: receiptItems,
      totalAmount: subtotal,
      paidAmount: effectivePaid,
      debtAmount: remainingDebt,
      paymentStatus,
      paymentMethod,
      note: note.trim(),
      createdAtMs: now,
    };

    // Update stock levels
    const itemDeltas = new Map<string, number>();
    receiptItems.forEach((it) => {
      itemDeltas.set(it.supplyItemId, (itemDeltas.get(it.supplyItemId) || 0) + it.quantity);
    });

    const nextSupplyItems = supplyItems.map((sItem) => {
      const delta = itemDeltas.get(sItem.id);
      if (delta) {
        return {
          ...sItem,
          currentStock: sItem.currentStock + delta,
          defaultUnitPrice: items.find((it) => it.supplyItemId === sItem.id)?.unitPrice || sItem.defaultUnitPrice,
          updatedAtMs: now,
        };
      }
      return sItem;
    });

    await onSave(newReceipt, nextSupplyItems);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-600" />
            <span>Tạo Phiếu Nhập Hàng Kho Bếp & Tạp Vụ</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Top row: Ngày nhập & Chọn NPP */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Ngày nhập hàng:
              </label>
              <input
                type="date"
                required
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nhà phân phối:
                </label>
                <button
                  type="button"
                  onClick={() => setShowQuickAddSupplier((v) => !v)}
                  className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer"
                >
                  {showQuickAddSupplier ? 'Hủy thêm nhanh' : '+ Thêm nhanh NPP'}
                </button>
              </div>

              {showQuickAddSupplier ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Nhập tên NPP mới..."
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    className="flex-1 h-10 px-3 text-xs rounded-xl border border-emerald-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newSupplierName.trim()) return;
                      const supp = await onQuickAddSupplier(newSupplierName.trim());
                      setSupplierId(supp.id);
                      setNewSupplierName('');
                      setShowQuickAddSupplier(false);
                    }}
                    className="px-3 h-10 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                  >
                    Lưu
                  </button>
                </div>
              ) : (
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* List of imported items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Danh sách hàng hóa nhập vào kho ({items.length})
              </span>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Thêm dòng</span>
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {items.map((row, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                >
                  <div className="flex-1">
                    <select
                      value={row.supplyItemId}
                      onChange={(e) => handleUpdateItem(idx, 'supplyItemId', e.target.value)}
                      className="w-full h-9 px-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                    >
                      {supplyItems.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.unit}) - {s.category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-24">
                      <input
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={row.quantity}
                        onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                        placeholder="SL"
                        className="w-full h-9 px-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center font-bold"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 w-8">{row.unit}</span>

                    <div className="w-28">
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={row.unitPrice}
                        onChange={(e) => handleUpdateItem(idx, 'unitPrice', e.target.value)}
                        placeholder="Đơn giá"
                        className="w-full h-9 px-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-right font-medium"
                      />
                    </div>

                    <div className="w-28 text-right font-mono font-bold text-slate-900 dark:text-white text-xs">
                      {formatVND(row.totalPrice)}
                    </div>

                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment options & Debt computation */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300">Tổng giá trị phiếu nhập:</span>
              <span className="text-base font-mono font-bold text-slate-900 dark:text-white">
                {formatVND(subtotal)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Hình thức thanh toán tiền hàng:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setPaymentOption('debt')}
                  className={`p-2 rounded-xl border text-center transition-colors cursor-pointer ${
                    paymentOption === 'debt'
                      ? 'border-rose-500 bg-rose-500 text-white shadow-xs'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Ghi Nợ 100%
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentOption('paid_cash')}
                  className={`p-2 rounded-xl border text-center transition-colors cursor-pointer ${
                    paymentOption === 'paid_cash'
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Trả Đủ (Tiền mặt)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentOption('paid_transfer')}
                  className={`p-2 rounded-xl border text-center transition-colors cursor-pointer ${
                    paymentOption === 'paid_transfer'
                      ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Trả Đủ (Chuyển khoản)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentOption('partial')}
                  className={`p-2 rounded-xl border text-center transition-colors cursor-pointer ${
                    paymentOption === 'partial'
                      ? 'border-amber-600 bg-amber-600 text-white shadow-xs'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Trả Một Phần
                </button>
              </div>
            </div>

            {paymentOption === 'partial' && (
              <div>
                <label className="block text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">
                  Số tiền trả trước đợt này:
                </label>
                <input
                  type="number"
                  min="0"
                  max={subtotal}
                  step="10000"
                  value={paidAmount || ''}
                  onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="Nhập số tiền trả trước..."
                  className="w-full h-9 px-3 text-xs font-mono font-bold rounded-lg border border-amber-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500">Đã trả: </span>
                <span className="font-mono font-bold text-emerald-600">{formatVND(effectivePaid)}</span>
              </div>
              <div>
                <span className="text-slate-500">Còn nợ lại NPP: </span>
                <span className="font-mono font-bold text-rose-600">{formatVND(remainingDebt)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú phiếu nhập:
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú người nhận hàng, chất lượng nguyên liệu..."
              className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl border border-slate-300 text-slate-600 text-xs font-semibold cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={items.length === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
            >
              Lưu Phiếu Nhập ({formatVND(subtotal)})
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: MODAL THÊM / SỬA HÀNG HÓA
// =========================================================================
interface ItemEditModalProps {
  item: KitchenSupplyItem | null;
  categories: string[];
  suppliers: KitchenSupplier[];
  onClose: () => void;
  onSave: (item: KitchenSupplyItem) => Promise<void>;
  onAddCategory?: (name: string) => Promise<void>;
}

const ItemEditModal: React.FC<ItemEditModalProps> = ({
  item,
  categories,
  suppliers,
  onClose,
  onSave,
  onAddCategory,
}) => {
  const [name, setName] = useState(item?.name || '');
  const [category, setCategory] = useState(item?.category || categories[0] || 'Hàng tươi sống');
  const [showInlineNewCat, setShowInlineNewCat] = useState(false);
  const [inlineCatInput, setInlineCatInput] = useState('');
  const [unit, setUnit] = useState(item?.unit || 'kg');
  const [currentStock, setCurrentStock] = useState<number>(item?.currentStock ?? 10);
  const [minStockAlert, setMinStockAlert] = useState<number>(item?.minStockAlert ?? 2);
  const [defaultUnitPrice, setDefaultUnitPrice] = useState<number>(item?.defaultUnitPrice ?? 50000);
  const [defaultSupplierId, setDefaultSupplierId] = useState<string>(item?.defaultSupplierId || suppliers[0]?.id || '');
  const [isBeverageLinked, setIsBeverageLinked] = useState<boolean>(item?.isBeverageLinked ?? false);
  const [note, setNote] = useState(item?.note || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const now = Date.now();
    const result: KitchenSupplyItem = {
      id: item?.id || sanitizeId(`kitem_${now}_${Math.random().toString(36).slice(2, 6)}`),
      name: name.trim(),
      category,
      unit: unit.trim() || 'kg',
      currentStock: Math.max(0, currentStock),
      minStockAlert: Math.max(0, minStockAlert),
      defaultUnitPrice: Math.max(0, defaultUnitPrice),
      defaultSupplierId: defaultSupplierId || undefined,
      isBeverageLinked,
      note: note.trim(),
      createdAtMs: item?.createdAtMs || now,
      updatedAtMs: now,
    };
    onSave(result);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {item ? 'Chỉnh Sửa Mặt Hàng' : 'Thêm Hàng Hóa Kho Bếp & Tạp Vụ'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Tên mặt hàng:
            </label>
            <input
              type="text"
              required
              placeholder="VD: Thịt ba chỉ, Hạt nêm, Nước rửa chén, Ga..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Phân loại:
                </label>
                {onAddCategory && (
                  <button
                    type="button"
                    onClick={() => setShowInlineNewCat(!showInlineNewCat)}
                    className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    {showInlineNewCat ? 'Hủy' : '+ Nhóm mới'}
                  </button>
                )}
              </div>
              {showInlineNewCat ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="Tên nhóm mới..."
                    value={inlineCatInput}
                    onChange={(e) => setInlineCatInput(e.target.value)}
                    className="flex-1 h-10 px-2 text-xs rounded-xl border border-emerald-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (inlineCatInput.trim() && onAddCategory) {
                        const clean = inlineCatInput.trim();
                        await onAddCategory(clean);
                        setCategory(clean);
                        setShowInlineNewCat(false);
                        setInlineCatInput('');
                      }
                    }}
                    className="h-10 px-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer shrink-0"
                  >
                    Tạo
                  </button>
                </div>
              ) : (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 px-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Đơn vị tính:
              </label>
              <input
                type="text"
                required
                placeholder="kg, con, can, bình, gói..."
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tồn kho ban đầu:
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={currentStock}
                onChange={(e) => setCurrentStock(Number(e.target.value) || 0)}
                className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Cảnh báo tồn tối thiểu:
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={minStockAlert}
                onChange={(e) => setMinStockAlert(Number(e.target.value) || 0)}
                className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Đơn giá tham khảo:
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={defaultUnitPrice}
                onChange={(e) => setDefaultUnitPrice(Number(e.target.value) || 0)}
                className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                NPP mặc định:
              </label>
              <select
                value={defaultSupplierId}
                onChange={(e) => setDefaultSupplierId(e.target.value)}
                className="w-full h-10 px-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="">-- Chưa gán --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="beverage-link-checkbox"
              checked={isBeverageLinked}
              onChange={(e) => setIsBeverageLinked(e.target.checked)}
              className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
            />
            <label htmlFor="beverage-link-checkbox" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              Liên kết số lượng tồn kho với danh mục Bia / Nước ngọt
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú:
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Quy cách đóng gói, xuất xứ..."
              className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl border border-slate-300 text-slate-600 text-xs font-semibold cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
            >
              Lưu Hàng Hóa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: MODAL THÊM / SỬA NHÀ PHÂN PHỐI
// =========================================================================
interface SupplierEditModalProps {
  supplier: KitchenSupplier | null;
  onClose: () => void;
  onSave: (supplier: KitchenSupplier) => Promise<void>;
}

const SupplierEditModal: React.FC<SupplierEditModalProps> = ({
  supplier,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(supplier?.name || '');
  const [phone, setPhone] = useState(supplier?.phone || '');
  const [address, setAddress] = useState(supplier?.address || '');
  const [contactPerson, setContactPerson] = useState(supplier?.contactPerson || '');
  const [note, setNote] = useState(supplier?.note || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const now = Date.now();
    const result: KitchenSupplier = {
      id: supplier?.id || sanitizeId(`supp_${now}_${Math.random().toString(36).slice(2, 6)}`),
      name: name.trim(),
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      contactPerson: contactPerson.trim() || undefined,
      note: note.trim() || undefined,
      createdAtMs: supplier?.createdAtMs || now,
      updatedAtMs: now,
    };
    onSave(result);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {supplier ? 'Chỉnh Sửa Nhà Phân Phối' : 'Thêm Nhà Phân Phối Mới'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Tên nhà phân phối / Đại lý:
            </label>
            <input
              type="text"
              required
              placeholder="VD: NPP Thịt Cá Minh Phát, Đại Lý Gas Bình Minh..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Số điện thoại:
              </label>
              <input
                type="text"
                placeholder="0908 xxx xxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Người liên hệ:
              </label>
              <input
                type="text"
                placeholder="Anh / Chị..."
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Địa chỉ:
            </label>
            <input
              type="text"
              placeholder="Địa chỉ chợ đầu mối / kho bãi..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú hợp tác:
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Giờ giao hàng, chính sách công nợ..."
              className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl border border-slate-300 text-slate-600 text-xs font-semibold cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
            >
              Lưu Nhà Phân Phối
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: DÒNG PHÂN PHỐI THEO DANH MỤC THỰC ĐƠN
// =========================================================================
interface MenuCategoryDistributeRowProps {
  menuCategory: string;
  matchingProducts: ProductRecord[];
  categories: string[];
  onDistribute?: (menuCategory: string, targetKitchenCategory: string) => Promise<void>;
}

const MenuCategoryDistributeRow: React.FC<MenuCategoryDistributeRowProps> = ({
  menuCategory,
  matchingProducts,
  categories,
  onDistribute,
}) => {
  const defaultTarget = useMemo(() => {
    const lower = menuCategory.toLowerCase();
    if (lower.includes('hải sản') || lower.includes('tôm') || lower.includes('cua') || lower.includes('cá')) {
      return categories.find((c) => c.toLowerCase().includes('hải sản')) || categories[0];
    }
    if (lower.includes('rau') || lower.includes('nấm') || lower.includes('xào')) {
      return categories.find((c) => c.toLowerCase().includes('rau')) || categories[0];
    }
    if (lower.includes('gia vị') || lower.includes('sốt') || lower.includes('chấm')) {
      return categories.find((c) => c.toLowerCase().includes('gia vị')) || categories[0];
    }
    if (lower.includes('tươi sống') || lower.includes('bò') || lower.includes('heo') || lower.includes('gà') || lower.includes('thịt')) {
      return categories.find((c) => c.toLowerCase().includes('tươi sống')) || categories[0];
    }
    if (lower.includes('bia') || lower.includes('beer')) {
      return categories.find((c) => c.toLowerCase() === 'bia') || categories[0];
    }
    if (lower.includes('nước ngọt') || lower.includes('nước suối') || lower.includes('đồ uống')) {
      return categories.find((c) => c.toLowerCase().includes('nước ngọt')) || categories[0];
    }
    return categories[0] || 'Khác';
  }, [menuCategory, categories]);

  const [targetCategory, setTargetCategory] = useState<string>(defaultTarget);
  const [isDistributing, setIsDistributing] = useState<boolean>(false);
  const [isDone, setIsDone] = useState<boolean>(false);

  const handleApply = async () => {
    if (!onDistribute || matchingProducts.length === 0) return;
    try {
      setIsDistributing(true);
      await onDistribute(menuCategory, targetCategory);
      setIsDone(true);
      setTimeout(() => setIsDone(false), 3000);
    } finally {
      setIsDistributing(false);
    }
  };

  return (
    <div className="p-3.5 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900 dark:text-white text-xs">{menuCategory}</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
            {matchingProducts.length} món
          </span>
        </div>
        {matchingProducts.length > 0 && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
            Gồm:{' '}
            {matchingProducts
              .slice(0, 4)
              .map((p) => p.productName)
              .join(', ')}
            {matchingProducts.length > 4 ? ` và +${matchingProducts.length - 4} món khác` : ''}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <span className="text-[11px] text-slate-500">Gán vào nhóm:</span>
        <select
          value={targetCategory}
          onChange={(e) => setTargetCategory(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium cursor-pointer"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isDistributing || matchingProducts.length === 0}
          onClick={handleApply}
          className={`px-3 py-1.5 rounded-xl font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs ${
            isDone
              ? 'bg-emerald-700 text-white'
              : 'bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white'
          }`}
        >
          {isDone ? <Check className="w-3.5 h-3.5" /> : null}
          <span>{isDone ? 'Đã phân phối' : isDistributing ? 'Đang gán...' : 'Phân phối ngay'}</span>
        </button>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: MODAL QUẢN LÝ & PHÂN PHỐI NHÓM HÀNG
// =========================================================================
interface GroupManagerModalProps {
  categories: string[];
  supplyItems: KitchenSupplyItem[];
  menuCategories?: string[];
  products?: ProductRecord[];
  initialTab?: 'distribute' | 'menu_categories' | 'groups';
  onClose: () => void;
  onAddCategory: (name: string) => Promise<void>;
  onRenameCategory: (oldName: string, newName: string) => Promise<void>;
  onDeleteCategory: (name: string) => void;
  onBulkAssignCategory: (itemIds: string[], targetCategory: string) => Promise<void>;
  onSingleAssignCategory: (itemId: string, targetCategory: string) => Promise<void>;
  onDistributeMenuCategory?: (menuCategory: string, targetKitchenCategory: string) => Promise<void>;
}

const GroupManagerModal: React.FC<GroupManagerModalProps> = ({
  categories,
  supplyItems,
  menuCategories = [],
  products = [],
  initialTab = 'distribute',
  onClose,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onBulkAssignCategory,
  onSingleAssignCategory,
  onDistributeMenuCategory,
}) => {
  const [activeTab, setActiveTab] = useState<'distribute' | 'menu_categories' | 'groups'>(initialTab);
  const [newCatName, setNewCatName] = useState('');
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [editingCatNewName, setEditingCatNewName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCat, setFilterCat] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetBulkCat, setTargetBulkCat] = useState<string>(categories[0] || 'Khác');

  const filteredItems = useMemo(() => {
    return supplyItems.filter((it) => {
      if (filterCat !== 'ALL' && (it.category || '').toLowerCase() !== filterCat.toLowerCase()) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        return (it.name || '').toLowerCase().includes(q) || (it.category || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [supplyItems, filterCat, searchTerm]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, { count: number; totalValue: number }> = {};
    for (const c of categories) {
      stats[c] = { count: 0, totalValue: 0 };
    }
    for (const it of supplyItems) {
      const c = it.category || 'Khác';
      if (!stats[c]) stats[c] = { count: 0, totalValue: 0 };
      stats[c].count++;
      stats[c].totalValue += (it.currentStock || 0) * (it.defaultUnitPrice || 0);
    }
    return stats;
  }, [categories, supplyItems]);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCatName.trim();
    if (!clean) return;
    await onAddCategory(clean);
    setNewCatName('');
  };

  const handleSaveRename = async (oldName: string) => {
    const clean = editingCatNewName.trim();
    if (!clean || clean.toLowerCase() === oldName.toLowerCase()) {
      setEditingCatName(null);
      return;
    }
    await onRenameCategory(oldName, clean);
    setEditingCatName(null);
    setEditingCatNewName('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-3xl max-h-[90vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <Layers className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Quản Lý & Phân Phối Nhóm Hàng Hóa Kho Bếp
              </h3>
              <p className="text-[11px] text-slate-500">
                Phân loại mặt hàng vào các nhóm như Hàng tươi sống, Hải sản, Rau, Gia vị, Bia, Nước ngọt...
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center gap-2 shrink-0 text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('distribute')}
            className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'distribute'
                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>1. Phân Phối Từng Mặt Hàng ({supplyItems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('menu_categories')}
            className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'menu_categories'
                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2. Phân Phối Từ Danh Mục Thực Đơn ({menuCategories.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('groups')}
            className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'groups'
                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>3. Danh Sách & Thêm Nhóm Hàng ({categories.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'distribute' ? (
            <div className="space-y-3">
              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm mặt hàng để phân phối..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 whitespace-nowrap">Lọc nhóm:</span>
                  <select
                    value={filterCat}
                    onChange={(e) => setFilterCat(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="ALL">Tất cả ({supplyItems.length})</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c} ({categoryStats[c]?.count || 0})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bulk action toolbar */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={
                      filteredItems.length > 0 &&
                      filteredItems.every((it) => selectedIds.has(it.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(filteredItems.map((it) => it.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Đã chọn {selectedIds.size}/{filteredItems.length} món
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Chuyển sang nhóm:</span>
                  <select
                    value={targetBulkCat}
                    onChange={(e) => setTargetBulkCat(e.target.value)}
                    className="px-2 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 font-semibold text-slate-900 dark:text-white"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={selectedIds.size === 0}
                    onClick={async () => {
                      await onBulkAssignCategory(Array.from(selectedIds), targetBulkCat);
                      setSelectedIds(new Set());
                    }}
                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs cursor-pointer"
                  >
                    Phân phối ({selectedIds.size})
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0 border-b border-slate-200 dark:border-slate-700 text-[11px] text-slate-500">
                    <tr>
                      <th className="py-2 px-3 w-8"></th>
                      <th className="py-2 px-3">Tên mặt hàng</th>
                      <th className="py-2 px-3">Đơn vị</th>
                      <th className="py-2 px-3 text-right">Tồn hiện tại</th>
                      <th className="py-2 px-3">Nhóm hàng hiện tại</th>
                      <th className="py-2 px-3 text-right">Đổi sang nhóm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredItems.map((item) => {
                      const isChecked = selectedIds.has(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                            isChecked ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
                          }`}
                        >
                          <td className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = new Set(selectedIds);
                                if (e.target.checked) next.add(item.id);
                                else next.delete(item.id);
                                setSelectedIds(next);
                              }}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900 dark:text-white">
                            {item.name}
                          </td>
                          <td className="py-2 px-3 text-slate-500">{item.unit}</td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-600">
                            {item.currentStock} {item.unit}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                              {item.category}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <select
                              value={item.category}
                              onChange={(e) => onSingleAssignCategory(item.id, e.target.value)}
                              className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold cursor-pointer"
                            >
                              {categories.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'menu_categories' ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Phân Phối Toàn Bộ Món Theo Danh Mục Thực Đơn Vào Nhóm Hàng</span>
                </div>
                <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                  Phân loại nhanh danh mục thực đơn (như Hải sản, Món rau, Món nướng, Bia, Nước ngọt...) sang các Nhóm hàng kho (Hàng tươi sống, Hải sản, Rau, Gia vị...). Toàn bộ món ăn trong danh mục sẽ được tự động liên kết vào nhóm đã chọn.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Danh mục thực đơn hiện có ({menuCategories.length}):
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                  {menuCategories.map((mCat) => {
                    const matchingProds = products.filter(
                      (p) => (p.category || '').toLowerCase() === mCat.toLowerCase()
                    );
                    return (
                      <MenuCategoryDistributeRow
                        key={mCat}
                        menuCategory={mCat}
                        matchingProducts={matchingProds}
                        categories={categories}
                        onDistribute={onDistributeMenuCategory}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Form add new category group */}
              <form onSubmit={handleCreateCategory} className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  required
                  placeholder="Nhập tên nhóm hàng mới (VD: Hàng tươi sống, Hải sản, Rau, Gia vị...)"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="flex-1 h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium"
                />
                <button
                  type="submit"
                  className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center justify-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Thêm Nhóm</span>
                </button>
              </form>

              {/* Existing categories list */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Danh sách {categories.length} nhóm hàng hiện có:
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {categories.map((cat) => {
                    const stats = categoryStats[cat] || { count: 0, totalValue: 0 };
                    const isEditing = editingCatName === cat;

                    return (
                      <div
                        key={cat}
                        className="p-3 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={editingCatNewName}
                              onChange={(e) => setEditingCatNewName(e.target.value)}
                              className="flex-1 h-8 px-2.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveRename(cat)}
                              className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                            >
                              Lưu
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCatName(null)}
                              className="h-8 px-2.5 rounded-lg border border-slate-300 text-slate-600 text-xs cursor-pointer"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-2">
                              <span>{cat}</span>
                              <span className="px-2 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                                {stats.count} mặt hàng
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Tổng giá trị tồn: <strong className="text-slate-700 dark:text-slate-300 font-mono">{formatVND(stats.totalValue)}</strong>
                            </div>
                          </div>
                        )}

                        {!isEditing && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCatName(cat);
                                setEditingCatNewName(cat);
                              }}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer inline-flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Sửa tên</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteCategory(cat)}
                              className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 text-xs font-semibold cursor-pointer inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Xóa</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-xs cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
