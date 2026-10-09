import {
  WorkspaceInventoryData,
  ProductRecord,
  BillRecord,
  BillItemRecord,
  ReturnRecord,
  KitchenSupplyItem,
} from '../types';
import { sanitizeId } from './parser';

export interface LiveBeverageStockInfo {
  productName: string;
  category: string;
  unit: string;
  currentStock: number;
  costPrice: number;
  unitPrice: number;
  packSize: number;
  minStockAlert: number;
  isBeer: boolean;
  sourceDate: string;
}

/**
 * Checks if a category name represents a beverage / beer / soft drink
 */
export function isBeverageCategory(category: string = ''): boolean {
  const c = category.toLowerCase().trim();
  return (
    c === 'bia' ||
    c === 'nước ngọt' ||
    c.includes('bia') ||
    c.includes('nước ngọt') ||
    c.includes('beer') ||
    c === 'đồ uống' ||
    c.includes('đồ uống') ||
    c.includes('nước suối') ||
    c.includes('nước khoáng')
  );
}

/**
 * Compute sales and net returned per product for any given date
 */
export function computeSalesForDate(
  bills: BillRecord[],
  billItems: BillItemRecord[],
  returns: ReturnRecord[] = [],
  targetDate: string
): Map<string, { netSold: number; grossSold: number; returnedQty: number }> {
  const dateBillIds = new Set(
    bills.filter((b) => b.billDate === targetDate).map((b) => b.id)
  );
  const soldMap = new Map<string, { grossSold: number; returnedQty: number }>();

  for (const item of billItems) {
    if (!dateBillIds.has(item.billId) && item.billDate !== targetDate) continue;
    const cleanName = (item.productName || '').trim().toLowerCase();
    if (!cleanName) continue;

    const cur = soldMap.get(cleanName) || { grossSold: 0, returnedQty: 0 };
    cur.grossSold += Number(item.quantity) || 0;
    cur.returnedQty += Number(item.returnedQuantity) || 0;
    soldMap.set(cleanName, cur);
  }

  // Explicit return records
  for (const ret of returns) {
    if (ret.billDate === targetDate || ret.returnDate === targetDate) {
      const pKey = (ret.productName || '').trim().toLowerCase();
      if (!pKey) continue;
      const cur = soldMap.get(pKey) || { grossSold: 0, returnedQty: 0 };
      cur.returnedQty += Number(ret.quantity) || 0;
      soldMap.set(pKey, cur);
    }
  }

  const result = new Map<string, { netSold: number; grossSold: number; returnedQty: number }>();
  for (const [pKey, val] of soldMap.entries()) {
    const netSold = Math.max(0, val.grossSold - val.returnedQty);
    result.set(pKey, {
      netSold,
      grossSold: val.grossSold,
      returnedQty: val.returnedQty,
    });
  }

  return result;
}

/**
 * Compute LIVE beverage stock for all beverage products.
 * Handles:
 * 1. Current day's explicit actualClosingStock or openingStock + imported - netSold - damaged
 * 2. Auto-inheritance from previous day's closing stock if current day is not yet finalized
 * 3. Most recent recorded date in inventoryData.dailyEntries minus intervening sales
 * 4. Total import logs & sales fallback if no daily entry exists
 */
export function computeLiveBeverageStockMap(params: {
  inventoryData: WorkspaceInventoryData;
  products: ProductRecord[];
  bills: BillRecord[];
  billItems: BillItemRecord[];
  returns?: ReturnRecord[];
  referenceDate?: string;
}): Map<string, LiveBeverageStockInfo> {
  const {
    inventoryData,
    products,
    bills,
    billItems,
    returns = [],
    referenceDate = new Date().toISOString().split('T')[0],
  } = params;

  const stockMap = new Map<string, LiveBeverageStockInfo>();
  const configMap = inventoryData.itemConfigs || {};
  const dailyEntries = inventoryData.dailyEntries || {};
  const importLogs = inventoryData.importLogs || [];

  // Filter products that belong to beverage / beer / soft drink categories
  const beverageProducts = products.filter((p) => isBeverageCategory(p.category));

  // Also include any items configured in inventoryData.itemConfigs or tracked in dailyEntries
  const candidateProductKeys = new Set<string>();
  beverageProducts.forEach((p) => {
    candidateProductKeys.add(p.productName.toLowerCase().trim());
  });
  Object.keys(configMap).forEach((k) => candidateProductKeys.add(k));

  // Pre-sort all available dates descending
  const allRecordedDates = Object.keys(dailyEntries).sort().reverse();

  // Helper to compute sales on demand
  const salesCache = new Map<string, Map<string, { netSold: number }>>();
  const getSalesForDate = (d: string) => {
    if (!salesCache.has(d)) {
      salesCache.set(d, computeSalesForDate(bills, billItems, returns, d));
    }
    return salesCache.get(d)!;
  };

  for (const pKey of candidateProductKeys) {
    const prod = products.find((p) => p.productName.toLowerCase().trim() === pKey);
    const cfg = configMap[pKey];

    const productName = prod?.productName || cfg?.productName || pKey;
    const category = prod?.category || (pKey.includes('bia') ? 'Bia' : 'Nước ngọt');
    const unitPrice = prod?.unitPrice || 0;
    const isBeer = (category || '').toLowerCase().includes('bia') || (category || '').toLowerCase().includes('beer');
    const packSize = Math.max(1, Number(cfg?.packSize) || (isBeer ? 24 : 24));
    const minStockAlert = cfg?.minStockThreshold !== undefined ? Number(cfg.minStockThreshold) : packSize;
    const costPrice = Math.max(
      0,
      Number(cfg?.costPrice) || Math.round((unitPrice || 20000) * 0.72)
    );
    const unit = prod?.unit || cfg?.unit || (isBeer ? 'Lon' : 'Lon');

    let effectiveStock = 0;
    let sourceDate = referenceDate;

    // Check entry on referenceDate
    const todayEntry = dailyEntries[referenceDate]?.[pKey];

    if (
      todayEntry?.actualClosingStock !== undefined &&
      todayEntry?.actualClosingStock !== null
    ) {
      // User physically counted closing stock today
      effectiveStock = Math.max(0, Number(todayEntry.actualClosingStock));
      sourceDate = referenceDate;
    } else {
      // Check if referenceDate has openingStock or importedQty
      let openingStock = -1;
      if (
        todayEntry?.openingStock !== undefined &&
        todayEntry?.openingStock !== null &&
        Number(todayEntry.openingStock) > 0
      ) {
        openingStock = Math.max(0, Number(todayEntry.openingStock));
      }

      // If no positive opening stock today, look backward to find the latest prior date with data
      if (openingStock < 0) {
        const priorDates = allRecordedDates.filter((d) => d <= referenceDate);
        let foundPriorDate: string | null = null;
        let inheritedClosing = -1;

        for (const pDate of priorDates) {
          const pe = dailyEntries[pDate]?.[pKey];
          if (
            pe &&
            ((pe.openingStock !== undefined && pe.openingStock !== null) ||
              (pe.importedQty !== undefined && pe.importedQty !== null && Number(pe.importedQty) > 0) ||
              (pe.actualClosingStock !== undefined && pe.actualClosingStock !== null))
          ) {
            foundPriorDate = pDate;
            if (pe.actualClosingStock !== null && pe.actualClosingStock !== undefined) {
              inheritedClosing = Math.max(0, Number(pe.actualClosingStock));
            } else {
              const peOpen = Math.max(0, Number(pe.openingStock) || 0);
              const peImp = Math.max(0, Number(pe.importedQty) || 0);
              const peDmg = Math.max(0, Number(pe.damagedQty) || 0);
              const peSale = getSalesForDate(pDate).get(pKey)?.netSold || 0;
              inheritedClosing = Math.max(0, peOpen + peImp - peSale - peDmg);
            }
            break;
          }
        }

        if (inheritedClosing >= 0 && foundPriorDate) {
          // Deduct intervening sales between foundPriorDate and referenceDate
          let intermediateSold = 0;
          for (const d of allRecordedDates) {
            if (d > foundPriorDate && d <= referenceDate) {
              intermediateSold += getSalesForDate(d).get(pKey)?.netSold || 0;
            }
          }
          openingStock = Math.max(0, inheritedClosing - intermediateSold);
          sourceDate = foundPriorDate;
        } else {
          // If no daily entry was ever recorded for this product, fallback to importLogs & total sales
          const prodLogs = importLogs.filter(
            (l) => l.productName.toLowerCase().trim() === pKey && l.date <= referenceDate
          );
          let sumImp = 0;
          let sumDmg = 0;
          for (const l of prodLogs) {
            if (l.type === 'import' || l.type === 'adjust_opening') sumImp += l.quantity || 0;
            if (l.type === 'damaged') sumDmg += l.quantity || 0;
          }
          let allSold = 0;
          for (const d of allRecordedDates) {
            if (d <= referenceDate) {
              allSold += getSalesForDate(d).get(pKey)?.netSold || 0;
            }
          }
          openingStock = Math.max(0, sumImp - allSold - sumDmg);
        }
      }

      const importedToday = Math.max(0, Number(todayEntry?.importedQty) || 0);
      const damagedToday = Math.max(0, Number(todayEntry?.damagedQty) || 0);
      const soldToday = getSalesForDate(referenceDate).get(pKey)?.netSold || 0;

      const expectedClosing = Math.max(0, openingStock + importedToday - soldToday - damagedToday);
      effectiveStock = expectedClosing;
    }

    stockMap.set(pKey, {
      productName,
      category,
      unit,
      currentStock: effectiveStock,
      costPrice,
      unitPrice,
      packSize,
      minStockAlert,
      isBeer,
      sourceDate,
    });
  }

  return stockMap;
}

/**
 * Synchronize beverage items into KitchenSupplyItem list.
 * Updates currentStock of linked items and creates new supply items for any unlinked beverages.
 */
export function syncBeveragesToKitchenSupplyItems(
  existingSupplyItems: KitchenSupplyItem[],
  liveStockMap: Map<string, LiveBeverageStockInfo>,
  products: ProductRecord[],
  kitchenCategories: string[]
): {
  updatedSupplyItems: KitchenSupplyItem[];
  newCount: number;
  updatedCount: number;
  syncedDetails: { name: string; stock: number; unit: string }[];
} {
  const now = Date.now();
  const updatedItems = [...existingSupplyItems];
  const existingMap = new Map<string, KitchenSupplyItem>();

  existingSupplyItems.forEach((it) => {
    if (it.beverageProductName) {
      existingMap.set(it.beverageProductName.toLowerCase().trim(), it);
    }
    existingMap.set(it.name.toLowerCase().trim(), it);
  });

  let newCount = 0;
  let updatedCount = 0;
  const syncedDetails: { name: string; stock: number; unit: string }[] = [];

  for (const [pKey, info] of liveStockMap.entries()) {
    const existing = existingMap.get(pKey);
    const catName = info.isBeer ? 'Bia' : 'Nước ngọt';

    if (existing) {
      const idx = updatedItems.findIndex((it) => it.id === existing.id);
      if (idx !== -1) {
        updatedItems[idx] = {
          ...existing,
          currentStock: info.currentStock,
          defaultUnitPrice: info.costPrice > 0 ? info.costPrice : existing.defaultUnitPrice,
          minStockAlert: info.minStockAlert || existing.minStockAlert,
          unit: existing.unit || info.unit,
          category: existing.category || catName,
          isBeverageLinked: true,
          beverageProductName: info.productName,
          updatedAtMs: now,
        };
        updatedCount++;
        syncedDetails.push({
          name: info.productName,
          stock: info.currentStock,
          unit: existing.unit || info.unit,
        });
      }
    } else {
      const newItem: KitchenSupplyItem = {
        id: sanitizeId(`kbev_${now}_${Math.random().toString(36).slice(2, 6)}`),
        name: info.productName,
        category: catName,
        unit: info.unit,
        currentStock: info.currentStock,
        minStockAlert: info.minStockAlert,
        defaultUnitPrice: info.costPrice,
        isBeverageLinked: true,
        beverageProductName: info.productName,
        note: `Đồng bộ tự động từ kho Đồ uống (${info.category})`,
        createdAtMs: now,
        updatedAtMs: now,
      };
      updatedItems.push(newItem);
      existingMap.set(pKey, newItem);
      newCount++;
      syncedDetails.push({
        name: info.productName,
        stock: info.currentStock,
        unit: info.unit,
      });
    }
  }

  return {
    updatedSupplyItems: updatedItems,
    newCount,
    updatedCount,
    syncedDetails,
  };
}
