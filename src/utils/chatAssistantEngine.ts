import {
  ProductRecord,
  BillRecord,
  BillItemRecord,
  ReturnRecord,
  WorkspaceInventoryData,
  InventoryImportLog,
  DailyInventoryEntry,
  CustomCategoryGroup,
} from '../types';
import { formatVND, formatNumber, formatDateDMY } from './parser';

export function removeVietnameseAccents(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

export interface ChatAssistantContext {
  selectedDate: string;
  todayStr: string;
  yesterdayStr: string;
  products: ProductRecord[];
  categories: string[];
  bills: BillRecord[];
  billItems: BillItemRecord[];
  returns: ReturnRecord[];
  inventoryData: WorkspaceInventoryData;
  categoryAliases?: Record<string, string[]>;
  customCategoryGroups?: CustomCategoryGroup[];
  currentUsername?: string;
  source?: 'web_chat' | 'telegram';
}

export interface ChatImportItemResult {
  productName: string;
  category: string;
  quantity: number;
  oldStock: number;
  newStock: number;
  unit: string;
}

export interface ChatCommandExecutionResult {
  replyText: string;
  commandType: 'stock_check' | 'import_execute' | 'sales_report' | 'help' | 'unknown';
  importData?: {
    date: string;
    updatedItems: ChatImportItemResult[];
    newLogs: InventoryImportLog[];
  };
}

export interface CategoryResolutionResult {
  matchedCategories: string[];
  matchedGroups: CustomCategoryGroup[];
  matchedDirectCategories: string[];
}

// 1. Phân giải danh mục từ Nhóm tự tạo (Custom Groups), Bí danh (Alias) hoặc Tên danh mục trực tiếp
export function resolveCategoriesAndGroupsFromQuery(
  query: string,
  categories: string[],
  categoryAliases?: Record<string, string[]>,
  customGroups?: CustomCategoryGroup[]
): CategoryResolutionResult {
  const normQuery = removeVietnameseAccents(query);
  const matchedCategories = new Set<string>();
  const matchedGroups: CustomCategoryGroup[] = [];
  const matchedDirectCategories = new Set<string>();

  // Loại bỏ các từ khóa kiểm tra kho để tách phần tên nhóm / tên danh mục cần kiểm
  const cleanParam = normQuery
    .replace(/(?:kiem tra ton kho|kiem tra kho|kiem ton kho|kiem ton|kiem kho|bao so luong ton kho|bao so luong ton|bao so luong|ton kho|kho con|kho|ton)/gi, ' ')
    .replace(/[^a-z0-9\s,;-]/g, ' ')
    .trim();

  // A. KIỂM TRA CÁC NHÓM DANH MỤC DO NGƯỜI DÙNG TỰ TẠO (Custom Category Groups)
  if (customGroups && customGroups.length > 0) {
    for (const group of customGroups) {
      const cleanGroupName = removeVietnameseAccents(group.name || '').trim();
      if (!cleanGroupName) continue;

      let isMatch = false;

      // 1. Khớp chính xác phần tham số (VD: query "kiểm tồn kho A" -> cleanParam "a" === "a")
      if (cleanParam === cleanGroupName) {
        isMatch = true;
      }

      // 2. Khớp cụm "nhóm [tên]", "nhom [tên]", "kho [tên]"
      if (!isMatch) {
        const phraseRegex = new RegExp(`(?:nhom|nhóm|kho)\\s+${cleanGroupName}(?:\\b|$|\\s|[.,;])`, 'i');
        if (phraseRegex.test(normQuery)) {
          isMatch = true;
        }
      }

      // 3. Khớp từ độc lập hoặc danh sách phân cách bởi dấu phẩy (VD: "A, B" hoặc "tồn kho A")
      if (!isMatch) {
        const tokenRegex = new RegExp(`(^|\\s|[.,;])${cleanGroupName}(\\s|[.,;]|$)`, 'i');
        if (tokenRegex.test(cleanParam) || (cleanGroupName.length > 1 && normQuery.includes(cleanGroupName))) {
          isMatch = true;
        }
      }

      // 4. Khớp các bí danh khác của nhóm nếu có
      if (!isMatch && Array.isArray(group.aliases)) {
        for (const al of group.aliases) {
          const cleanAl = removeVietnameseAccents(al).trim();
          if (!cleanAl) continue;
          const alRegex = new RegExp(`(^|\\s|[.,;])${cleanAl}(\\s|[.,;]|$)`, 'i');
          if (alRegex.test(cleanParam) || normQuery.includes(cleanAl)) {
            isMatch = true;
            break;
          }
        }
      }

      if (isMatch) {
        matchedGroups.push(group);
        if (Array.isArray(group.categories)) {
          for (const cat of group.categories) {
            if (cat && typeof cat === 'string') {
              matchedCategories.add(cat);
            }
          }
        }
      }
    }
  }

  // B. KIỂM TRA TÊN DANH MỤC TRỰC TIẾP TRÊN WEBSITE (Direct Categories on website)
  for (const cat of categories) {
    const cleanCat = removeVietnameseAccents(cat).trim();
    if (!cleanCat) continue;
    const catRegex = new RegExp(`(^|\\s|[.,;])${cleanCat}(\\s|[.,;]|$)`, 'i');
    if (catRegex.test(normQuery) || (cleanCat.length > 2 && normQuery.includes(cleanCat))) {
      matchedCategories.add(cat);
      matchedDirectCategories.add(cat);
    }
  }

  // C. KIỂM TRA BẢNG BÍ DANH CŨ NẾU CÓ (Category Aliases)
  if (categoryAliases) {
    for (const [catName, aliases] of Object.entries(categoryAliases)) {
      if (!Array.isArray(aliases)) continue;
      for (const alias of aliases) {
        const cleanAlias = removeVietnameseAccents(alias).trim();
        if (!cleanAlias) continue;
        const regex = new RegExp(`(^|\\s|[.,;])${cleanAlias}(\\s|[.,;]|$)`, 'i');
        if (regex.test(normQuery) || normQuery.includes(cleanAlias)) {
          matchedCategories.add(catName);
        }
      }
    }
  }

  // D. TỪ KHÓA MẶC ĐỊNH BỔ SUNG (NẾU CHƯA KHỚP GÌ VÀ CÓ NHẮC ĐẾN BIA, NƯỚC...)
  if (matchedCategories.size === 0) {
    if (normQuery.includes('bia') || normQuery.includes('beer')) {
      const beerCat = categories.find((c) => removeVietnameseAccents(c).includes('bia'));
      if (beerCat) matchedCategories.add(beerCat);
    }
    if (normQuery.includes('nuoc') || normQuery.includes('ngot') || normQuery.includes('suoi')) {
      const softCat = categories.find((c) => {
        const nc = removeVietnameseAccents(c);
        return nc.includes('nuoc') || nc.includes('ngot');
      });
      if (softCat) matchedCategories.add(softCat);
    }
    if (normQuery.includes('do uong') || normQuery.includes('thuc uong')) {
      categories.forEach((c) => {
        const nc = removeVietnameseAccents(c);
        if (nc.includes('bia') || nc.includes('nuoc') || nc.includes('uong')) {
          matchedCategories.add(c);
        }
      });
    }
  }

  return {
    matchedCategories: Array.from(matchedCategories),
    matchedGroups,
    matchedDirectCategories: Array.from(matchedDirectCategories),
  };
}

export function resolveCategoriesFromQuery(
  query: string,
  categories: string[],
  categoryAliases?: Record<string, string[]>,
  customGroups?: CustomCategoryGroup[]
): string[] {
  return resolveCategoriesAndGroupsFromQuery(query, categories, categoryAliases, customGroups).matchedCategories;
}

// 2. Tìm sản phẩm trong danh mục menu khớp nhất với từ khóa
export function findMatchingProduct(
  query: string,
  products: ProductRecord[]
): ProductRecord | null {
  const normQuery = removeVietnameseAccents(query).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normQuery) return null;

  const isChai = /\bchai\b/i.test(query);
  const isLon = /\b(?:lon|330ml|330|250ml)\b/i.test(query);
  const is330 = /\b(?:330ml|330)\b/i.test(query);
  const is250 = /\b(?:250ml|250|nho)\b/i.test(normQuery);

  // Exact full name match
  for (const p of products) {
    const pNorm = removeVietnameseAccents(p.productName).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (pNorm === normQuery) return p;
  }

  // Substring match
  const matches: { product: ProductRecord; score: number }[] = [];
  const queryTokens = normQuery.split(' ').filter(Boolean);

  for (const p of products) {
    const pNorm = removeVietnameseAccents(p.productName).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const prodIsChai = /\bchai\b/i.test(p.productName);
    const prodIsLon = /\b(?:lon|330ml|250ml)\b/i.test(p.productName);
    const prodIs330 = /\b(?:330ml|330)\b/i.test(p.productName);
    const prodIs250 = /\b(?:250ml|250|nho)\b/i.test(pNorm);

    // Strict specification conflict prevention
    if (isChai && !prodIsChai) continue;
    if ((isLon || is330) && prodIsChai) continue;
    if (is250 && !prodIs250 && (prodIs330 || prodIsChai)) continue;
    if (is330 && !prodIs330 && (prodIs250 || prodIsChai)) continue;

    let bonus = 0;
    if (isChai && prodIsChai) bonus += 20;
    if (is330 && prodIs330) bonus += 20;
    if (is250 && prodIs250) bonus += 20;

    if (pNorm.includes(normQuery)) {
      matches.push({ product: p, score: 100 - (pNorm.length - normQuery.length) + bonus });
      continue;
    }
    if (normQuery.includes(pNorm)) {
      matches.push({ product: p, score: 90 + bonus });
      continue;
    }

    // Token overlap match
    let matchCount = 0;
    for (const t of queryTokens) {
      if (pNorm.includes(t)) matchCount++;
    }
    if (matchCount === queryTokens.length) {
      matches.push({ product: p, score: 80 + bonus });
    } else if (matchCount > 0 && matchCount >= queryTokens.length * 0.6) {
      matches.push({ product: p, score: 50 + matchCount * 10 + bonus });
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => b.score - a.score);
    return matches[0].product;
  }

  return null;
}

// 3. Tính toán số tồn kho thực tế của một món trong ca ngày
export function calculateItemStock(
  productName: string,
  targetDate: string,
  context: ChatAssistantContext
): {
  openingStock: number;
  importedQty: number;
  netSoldQty: number;
  damagedQty: number;
  expectedClosingStock: number;
  unit: string;
} {
  const pKey = productName.trim().toLowerCase();
  const dailyMap = context.inventoryData?.dailyEntries?.[targetDate] || {};
  const entry = dailyMap[pKey] as DailyInventoryEntry | undefined;
  const cfg = context.inventoryData?.itemConfigs?.[pKey];
  const prod = context.products.find((p) => p.productName.trim().toLowerCase() === pKey);

  const unit = prod?.unit || cfg?.unit || 'lon';
  let openingStock = -1;

  if (
    entry?.openingStock !== undefined &&
    entry?.openingStock !== null &&
    Number(entry.openingStock) > 0
  ) {
    openingStock = Math.max(0, Number(entry.openingStock));
  }

  if (openingStock < 0) {
    const allPriorDates = Object.keys(context.inventoryData?.dailyEntries || {})
      .filter((d) => d < targetDate)
      .sort()
      .reverse();

    let foundPriorDate: string | null = null;
    let inheritedClosing = -1;

    for (const pDate of allPriorDates) {
      const pe = context.inventoryData?.dailyEntries?.[pDate]?.[pKey];
      if (
        pe &&
        ((pe.openingStock !== undefined && pe.openingStock !== null) ||
          (pe.importedQty !== undefined &&
            pe.importedQty !== null &&
            Number(pe.importedQty) > 0) ||
          (pe.actualClosingStock !== undefined && pe.actualClosingStock !== null))
      ) {
        foundPriorDate = pDate;
        if (pe.actualClosingStock !== null && pe.actualClosingStock !== undefined) {
          inheritedClosing = Math.max(0, Number(pe.actualClosingStock));
        } else {
          const peOpen = Math.max(0, Number(pe.openingStock) || 0);
          const peImp = Math.max(0, Number(pe.importedQty) || 0);
          const peDmg = Math.max(0, Number(pe.damagedQty) || 0);
          
          let pGrossSold = 0;
          for (const bi of context.billItems) {
            if (bi.billDate === pDate && bi.productName.trim().toLowerCase() === pKey) {
              pGrossSold += Number(bi.quantity) || 0;
            }
          }
          let pRetQty = 0;
          for (const ret of context.returns) {
            if (ret.returnDate === pDate && ret.productName.trim().toLowerCase() === pKey) {
              pRetQty += Number(ret.quantity) || 0;
            }
          }
          const pNetSold = Math.max(0, pGrossSold - pRetQty);
          inheritedClosing = Math.max(0, peOpen + peImp - pNetSold - peDmg);
        }
        break;
      }
    }

    if (inheritedClosing >= 0 && foundPriorDate) {
      // Deduct net sales on intermediate days
      let intermediateSold = 0;
      for (const d of allPriorDates) {
        if (d > foundPriorDate && d < targetDate) {
          let iGross = 0;
          for (const bi of context.billItems) {
            if (bi.billDate === d && bi.productName.trim().toLowerCase() === pKey) {
              iGross += Number(bi.quantity) || 0;
            }
          }
          let iRet = 0;
          for (const ret of context.returns) {
            if (ret.returnDate === d && ret.productName.trim().toLowerCase() === pKey) {
              iRet += Number(ret.quantity) || 0;
            }
          }
          intermediateSold += Math.max(0, iGross - iRet);
        }
      }
      const finalInherited = Math.max(0, inheritedClosing - intermediateSold);

      if (
        entry?.openingStock !== undefined &&
        entry?.openingStock !== null &&
        Number(entry.openingStock) === 0 &&
        finalInherited > 0 &&
        entry.updatedBy === 'Telegram User'
      ) {
        openingStock = finalInherited;
      } else if (entry?.openingStock !== undefined && entry?.openingStock !== null) {
        openingStock = Math.max(0, Number(entry.openingStock));
      } else {
        openingStock = finalInherited;
      }
    } else if (entry?.openingStock !== undefined && entry?.openingStock !== null) {
      openingStock = Math.max(0, Number(entry.openingStock));
    } else {
      openingStock = 0;
    }
  }

  const importedQty = Math.max(0, Number(entry?.importedQty) || 0);
  const damagedQty = Math.max(0, Number(entry?.damagedQty) || 0);

  // Tính số bán thực (Gross sold - Returns) trong ngày
  let grossSold = 0;
  for (const bi of context.billItems) {
    if (bi.billDate === targetDate && bi.productName.trim().toLowerCase() === pKey) {
      grossSold += Number(bi.quantity) || 0;
    }
  }

  let returnedQty = 0;
  for (const ret of context.returns) {
    if (ret.returnDate === targetDate && ret.productName.trim().toLowerCase() === pKey) {
      returnedQty += Number(ret.quantity) || 0;
    }
  }

  const netSoldQty = Math.max(0, grossSold - returnedQty);
  const expectedClosingStock = openingStock + importedQty - netSoldQty - damagedQty;

  return {
    openingStock,
    importedQty,
    netSoldQty,
    damagedQty,
    expectedClosingStock,
    unit,
  };
}

// 4. Bóc tách ngày tháng từ văn bản (Hỗ trợ: hôm nay, hôm qua, X ngày trước, DD/MM/YYYY, DD/MM, YYYY-MM-DD...)
export function parseDateFromQuery(
  query: string,
  todayStr: string,
  yesterdayStr: string
): { dateStr: string; label: string } {
  const norm = removeVietnameseAccents(query);

  // Khớp "hôm kia" / "hom kia" / "2 ngay truoc" (2 ngày trước)
  if (norm.includes('hom kia') || norm.includes('ngay kia')) {
    const targetDate = new Date(todayStr + 'T00:00:00');
    targetDate.setDate(targetDate.getDate() - 2);
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const isoDate = `${yyyy}-${mm}-${dd}`;
    return { dateStr: isoDate, label: `Hôm kia (${dd}/${mm}/${yyyy})` };
  }

  // Khớp "X ngày trước", "X ngay truoc", "X ngày trước đây", "X ngay truoc day" (VD: "2 ngày trước", "3 ngày trước", "7 ngày trước")
  const daysAgoMatch = norm.match(/(\d+)\s*(?:ngay|ngày)\s*(?:truoc|trước)/);
  if (daysAgoMatch) {
    const daysAgo = parseInt(daysAgoMatch[1], 10);
    if (!isNaN(daysAgo) && daysAgo > 0) {
      const targetDate = new Date(todayStr + 'T00:00:00');
      targetDate.setDate(targetDate.getDate() - daysAgo);
      const yyyy = targetDate.getFullYear();
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getDate()).padStart(2, '0');
      const isoDate = `${yyyy}-${mm}-${dd}`;
      const prefix = daysAgo === 1 ? 'Hôm qua' : daysAgo === 2 ? '2 ngày trước (Hôm kia)' : `${daysAgo} ngày trước`;
      return {
        dateStr: isoDate,
        label: `${prefix} (${dd}/${mm}/${yyyy})`,
      };
    }
  }

  // Khớp "hôm qua", "hom qua", "ngày qua", "hom trc"
  if (norm.includes('hom qua') || norm.includes('hom trc') || norm.includes('ngay qua')) {
    return { dateStr: yesterdayStr, label: `Hôm qua (${formatDateDMY(yesterdayStr)})` };
  }

  // Khớp "hôm nay", "hom nay", "ngày hôm nay", "ca nay", "ngay nay"
  if (norm.includes('hom nay') || norm.includes('ngay nay') || norm.includes('ca nay')) {
    return { dateStr: todayStr, label: `Hôm nay (${formatDateDMY(todayStr)})` };
  }

  // Khớp dạng chữ "ngày 24 tháng 9 năm 2026" hoặc "24 thang 9"
  const textDateMatch = norm.match(/(\d{1,2})\s*(?:thang|tháng)\s*(\d{1,2})(?:\s*(?:nam|năm)\s*(\d{2,4}))?/);
  if (textDateMatch) {
    const day = textDateMatch[1].padStart(2, '0');
    const month = textDateMatch[2].padStart(2, '0');
    let year = textDateMatch[3] || new Date(todayStr + 'T00:00:00').getFullYear().toString();
    if (year.length === 2) year = `20${year}`;
    const isoDate = `${year}-${month}-${day}`;
    return { dateStr: isoDate, label: `Ngày ${day}/${month}/${year}` };
  }

  // Khớp định dạng DD/MM/YYYY hoặc DD-MM-YYYY hoặc DD/MM hoặc DD-MM (Ví dụ: 24/9/2026, 24/09/2026, 24/9...)
  const dmyMatch = query.match(/(\b\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3] || new Date(todayStr + 'T00:00:00').getFullYear().toString();
    if (year.length === 2) year = `20${year}`;
    const isoDate = `${year}-${month}-${day}`;
    return { dateStr: isoDate, label: `Ngày ${day}/${month}/${year}` };
  }

  // Khớp định dạng YYYY-MM-DD
  const isoMatch = query.match(/(\b\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;
    return { dateStr: isoDate, label: `Ngày ${day}/${month}/${year}` };
  }

  // Mặc định là ngày hôm nay
  return { dateStr: todayStr, label: `Hôm nay (${formatDateDMY(todayStr)})` };
}

// 5. BỘ NÃO XỬ LÝ LỆNH CHAT CHÍNH (CHAT ASSISTANT ENGINE)
export async function executeChatCommand(
  rawQuery: string,
  context: ChatAssistantContext
): Promise<ChatCommandExecutionResult> {
  const query = (rawQuery || '').trim();
  const norm = removeVietnameseAccents(query);

  if (!query) {
    return {
      replyText: 'Xin chào! Tôi là Trợ lý Kho & Báo Cáo VQBill. Bạn có thể gõ câu lệnh kiểm kho, nhập kho hoặc xem báo cáo bán hàng.',
      commandType: 'help',
    };
  }

  // A. LỆNH NHẬP KHO (INVENTORY IMPORT)
  // Khớp các từ khóa bắt đầu bằng "nhập", "nhap", "nhập kho", "thêm kho", "nhap kho"
  if (
    /^(?:nhap|nhập|them|bổ sung|nhập kho|nhap kho|them vao kho)\b/i.test(norm) ||
    norm.startsWith('nhap ') ||
    norm.startsWith('nhập ')
  ) {
    return handleNaturalLanguageImport(query, context);
  }

  // B. LỆNH BÁO CÁO BÁN HÀNG / KIỂM SỐ LƯỢNG BÁN / DOANH THU (SALES & REVENUE REPORT)
  // Ưu tiên kiểm tra Sales trước để "kiểm số lượng bán [ngày]" không bị rơi nhầm vào kiểm tồn kho
  const isSalesQuery =
    norm.includes('so luong ban') ||
    norm.includes('kiem so luong ban') ||
    norm.includes('kiem ban') ||
    norm.includes('da ban') ||
    norm.includes('ban duoc') ||
    norm.includes('ban hom nay') ||
    norm.includes('ban hom qua') ||
    norm.includes('doanh thu') ||
    (norm.includes('bao cao') && (norm.includes('ban') || norm.includes('bán') || !norm.includes('ton')));

  if (isSalesQuery) {
    return handleSalesReport(query, context);
  }

  // C. LỆNH KIỂM TỒN KHO (STOCK CHECK)
  if (
    norm.includes('ton kho') ||
    norm.includes('tồn kho') ||
    norm.includes('kiem kho') ||
    norm.includes('kiểm kho') ||
    norm.includes('bao so luong ton') ||
    norm.includes('báo số lượng tồn') ||
    norm.includes('bao so luong') ||
    norm.includes('báo số lượng') ||
    norm.includes('kho con') ||
    norm.includes('kho còn') ||
    norm.includes('kiem ton') ||
    norm.includes('kiểm tồn')
  ) {
    return handleStockCheck(query, context);
  }

  // D. TRỢ GIÚP / HƯỚNG DẪN (HELP)
  if (norm.includes('help') || norm.includes('huong dan') || norm.includes('hướng dẫn') || norm.includes('lenh')) {
    return getHelpMessage();
  }

  // E. Fallback: Thử xem có phải tên món cụ thể muốn hỏi tồn kho không
  const matchedProd = findMatchingProduct(query, context.products);
  if (matchedProd) {
    const stock = calculateItemStock(matchedProd.productName, context.selectedDate, context);
    return {
      replyText: `📦 TỒN KHO: ${matchedProd.productName} (${matchedProd.category})\n` +
        `• Số lượng tồn hiện tại: ${formatNumber(stock.expectedClosingStock)} ${stock.unit}\n` +
        `• Chi tiết ca: Tồn đầu (${stock.openingStock}) + Nhập (${stock.importedQty}) - Bán (${stock.netSoldQty}) = Còn ${stock.expectedClosingStock} ${stock.unit}.`,
      commandType: 'stock_check',
    };
  }

  return {
    replyText: `❓ Tôi chưa hiểu rõ câu lệnh: "${query}".\n\n` +
      `💡 Bạn có thể thử các mẫu câu sau:\n` +
      `• "kiểm tồn kho A" hoặc "tồn kho bia" (chỉ hiện món còn tồn > 0)\n` +
      `• "kiểm số lượng bán 24/9/2026" hoặc "kiểm số lượng bán 2 ngày trước"\n` +
      `• "nhập 240 tiger lùn, huda 90, larue 60"\n` +
      `• Hoặc gõ "hướng dẫn" để xem danh sách lệnh đầy đủ.`,
    commandType: 'unknown',
  };
}

// Xử lý Kiểm tồn kho
function handleStockCheck(
  query: string,
  context: ChatAssistantContext
): ChatCommandExecutionResult {
  const norm = removeVietnameseAccents(query);
  const { dateStr, label } = parseDateFromQuery(query, context.todayStr, context.yesterdayStr);

  // 1. Kiểm tra xem có kiểm tra một món cụ thể không (ví dụ: "tồn kho tiger lùn")
  const queryWithoutKeyword = query
    .replace(/(?:kiểm tồn kho|tồn kho|kiểm kho|báo số lượng|báo số lượng tồn kho|kho còn|kiểm tồn)/gi, '')
    .trim();

  // 2. Tìm danh mục khớp từ Custom Category Groups hoặc Tên danh mục trực tiếp hoặc Alias
  const customGroups = context.customCategoryGroups || context.inventoryData?.customCategoryGroups;
  const resolution = resolveCategoriesAndGroupsFromQuery(
    queryWithoutKeyword || query,
    context.categories,
    context.categoryAliases,
    customGroups
  );
  const targetCategories = resolution.matchedCategories;

  let targetProducts: ProductRecord[] = [];
  let headerTitle = `📦 BÁO CÁO TỒN KHO (${label}):`;
  let subHeaderInfo = '';

  if (norm.includes('tat ca') || norm.includes('tất cả')) {
    // Lấy toàn bộ sản phẩm đang theo dõi kho (Bia, Nước ngọt...)
    const tracked = context.inventoryData.trackedCategories || ['Bia', 'Nước ngọt'];
    targetProducts = context.products.filter((p) => tracked.includes(p.category));
    headerTitle = `📦 BÁO CÁO TỒN KHO TOÀN BỘ SẢN PHẨM (${label}):`;
  } else if (targetCategories.length > 0) {
    // Lấy các sản phẩm thuộc các danh mục khớp
    targetProducts = context.products.filter((p) => targetCategories.includes(p.category));

    if (resolution.matchedGroups.length > 0) {
      const groupNames = resolution.matchedGroups.map((g) => `"${g.name}"`).join(', ');
      headerTitle = `📦 BÁO CÁO TỒN KHO [NHÓM ${groupNames}] (${label}):`;
      subHeaderInfo = `📋 Danh mục xem: ${targetCategories.join(', ')}`;
    } else if (resolution.matchedDirectCategories.length > 0) {
      headerTitle = `📦 BÁO CÁO TỒN KHO [DANH MỤC: ${resolution.matchedDirectCategories.join(', ').toUpperCase()}] (${label}):`;
    }
  } else if (queryWithoutKeyword) {
    // Thử tìm sản phẩm đơn lẻ khớp tên
    const singleProd = findMatchingProduct(queryWithoutKeyword, context.products);
    if (singleProd) {
      targetProducts = [singleProd];
      headerTitle = `📦 BÁO CÁO TỒN KHO [${singleProd.productName}] (${label}):`;
    }
  }

  // Mặc định nếu không chỉ định danh mục nào, lấy danh mục Bia & Nước ngọt
  if (targetProducts.length === 0) {
    const defaultTracked = context.inventoryData.trackedCategories || ['Bia', 'Nước ngọt'];
    targetProducts = context.products.filter((p) => defaultTracked.includes(p.category));
  }

  if (targetProducts.length === 0) {
    return {
      replyText: `⚠️ Không tìm thấy sản phẩm hoặc danh mục nào phù hợp với yêu cầu: "${queryWithoutKeyword || query}".\n\n` +
        `💡 Bạn hãy kiểm tra lại:\n` +
        `• Tên nhóm danh mục trong mục "Nhóm Danh Mục" (VD: "A", "B")\n` +
        `• Tên danh mục trên website (VD: ${context.categories.slice(0, 4).join(', ')})\n` +
        `• Hoặc gõ "kiểm tồn kho tất cả".`,
      commandType: 'stock_check',
    };
  }

  // Nhóm theo danh mục để in ra đẹp mắt - CHỈ LẤY CÁC MÓN CÓ SỐ LƯỢNG TỒN KHO > 0 (theo yêu cầu người dùng)
  const catMap = new Map<string, { prod: ProductRecord; stock: ReturnType<typeof calculateItemStock> }[]>();
  let totalPositiveStockItems = 0;

  for (const prod of targetProducts) {
    const stock = calculateItemStock(prod.productName, dateStr, context);

    // Yêu cầu: "khi tôi nhập kiểm tồn kho thì chỉ hiển thị những sản phẩm còn số lượng > 0 trong kho"
    // Nếu kiểm tra danh sách nhóm/danh mục (nhiều sản phẩm), chỉ hiển thị những món còn số lượng > 0
    if (targetProducts.length > 1 && stock.expectedClosingStock <= 0) {
      continue;
    }

    if (!catMap.has(prod.category)) {
      catMap.set(prod.category, []);
    }
    catMap.get(prod.category)!.push({ prod, stock });
    if (stock.expectedClosingStock > 0) {
      totalPositiveStockItems++;
    }
  }

  // Trường hợp tất cả sản phẩm trong nhóm/danh mục đều có số lượng tồn kho <= 0
  if (catMap.size === 0 || (targetProducts.length > 1 && totalPositiveStockItems === 0)) {
    return {
      replyText: `${headerTitle}\n` +
        (subHeaderInfo ? `${subHeaderInfo}\n` : '') +
        `───────────────────────────────\n` +
        `⚠️ Hiện tại không có sản phẩm nào còn tồn kho > 0 trong nhóm này (toàn bộ sản phẩm đều có số lượng tồn = 0).\n\n` +
        `💡 Bạn có thể nhập hàng nhanh bằng cách gõ: "nhập [số lượng] [tên món]" (VD: "nhập 240 tiger lùn, huda 90").`,
      commandType: 'stock_check',
    };
  }

  const lines: string[] = [];
  lines.push(headerTitle);
  if (subHeaderInfo) {
    lines.push(subHeaderInfo);
  }
  lines.push(`───────────────────────────────`);

  let totalItemsCount = 0;
  for (const [cat, items] of catMap.entries()) {
    lines.push(`🔹 [${cat.toUpperCase()}]:`);
    for (const { prod, stock } of items) {
      totalItemsCount++;
      const packConfig = context.inventoryData.itemConfigs?.[prod.productName.trim().toLowerCase()]?.packSize || 24;
      const packs = Math.floor(stock.expectedClosingStock / packConfig);
      const loose = stock.expectedClosingStock % packConfig;
      const packText =
        packs > 0
          ? ` (~${packs} thùng${loose > 0 ? ` + ${loose} ${stock.unit}` : ''})`
          : '';

      lines.push(
        `  • ${prod.productName}: ${formatNumber(stock.expectedClosingStock)} ${stock.unit}${packText}`
      );
    }
  }

  lines.push(`───────────────────────────────`);
  lines.push(`💡 Chỉ hiển thị các mặt hàng còn tồn kho > 0.`);
  lines.push(`Gõ "nhập [số lượng] [tên món]" để nhập kho tự động.`);

  return {
    replyText: lines.join('\n'),
    commandType: 'stock_check',
  };
}

// Xử lý Nhập kho tự nhiên (Natural Language Import)
function handleNaturalLanguageImport(
  query: string,
  context: ChatAssistantContext
): ChatCommandExecutionResult {
  // Loại bỏ tiền tố "nhập", "nhap kho", "nhập kho", "thêm vào kho"...
  const rawClean = query
    .replace(/^(?:nhap kho|nhập kho|nhap|nhập|them vao kho|thêm vào kho|bổ sung kho|bo sung kho)\s*[:=-]?\s*/i, '')
    .trim();

  if (!rawClean) {
    return {
      replyText: `⚠️ Cú pháp nhập kho chưa chính xác.\n` +
        `👉 Mẫu hợp lệ: "nhập 240 tiger lùn, huda 90, larue 60" hoặc "nhập 10 coca, 20 bò húc".`,
      commandType: 'unknown',
    };
  }

  // Tách từng món theo dấu phẩy, chấm phẩy, dấu cộng hoặc từ "và"
  const tokens = rawClean
    .split(/[,;\n+]|\bvà\b|\bva\b/i)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return {
      replyText: '⚠️ Không tìm thấy món hàng nào trong lệnh nhập kho.',
      commandType: 'unknown',
    };
  }

  const updatedItems: ChatImportItemResult[] = [];
  const unrecognizedTokens: string[] = [];
  const now = Date.now();
  const effectiveDate = context.selectedDate;

  for (const token of tokens) {
    // Regex nhận dạng:
    // Kiểu 1: Số lượng trước -> "240 tiger lùn", "5 thùng tiger lùn", "10 lon coca"
    // Kiểu 2: Tên trước số lượng sau -> "tiger lùn 240", "huda: 90", "larue 60"
    let qty = 0;
    let isPack = false;
    let queryProdName = '';

    const qtyFirstMatch = token.match(/^(\d+)\s*(thùng|thung|két|ket|lon|chai|hộp|hop|gói|goi)?\s*(.+)$/i);
    const qtyLastMatch = token.match(/^(.+?)\s*[:=-]?\s*(\d+)\s*(thùng|thung|két|ket|lon|chai|hộp|hop|gói|goi)?$/i);

    if (qtyFirstMatch) {
      qty = parseInt(qtyFirstMatch[1], 10);
      const unitWord = (qtyFirstMatch[2] || '').toLowerCase();
      isPack = unitWord.includes('thung') || unitWord.includes('thùng') || unitWord.includes('ket') || unitWord.includes('két');
      queryProdName = qtyFirstMatch[3].trim();
    } else if (qtyLastMatch) {
      queryProdName = qtyLastMatch[1].trim();
      qty = parseInt(qtyLastMatch[2], 10);
      const unitWord = (qtyLastMatch[3] || '').toLowerCase();
      isPack = unitWord.includes('thung') || unitWord.includes('thùng') || unitWord.includes('ket') || unitWord.includes('két');
    }

    if (!qty || qty <= 0 || !queryProdName) {
      unrecognizedTokens.push(token);
      continue;
    }

    const matchedProd = findMatchingProduct(queryProdName, context.products);
    if (!matchedProd) {
      unrecognizedTokens.push(token);
      continue;
    }

    const pKey = matchedProd.productName.trim().toLowerCase();
    const cfg = context.inventoryData.itemConfigs?.[pKey];
    const packSize = Math.max(1, Number(cfg?.packSize) || (matchedProd.category === 'Bia' || matchedProd.category === 'Nước ngọt' ? 24 : 1));
    const totalUnits = isPack ? qty * packSize : qty;

    const currentStockInfo = calculateItemStock(matchedProd.productName, effectiveDate, context);
    const oldStock = currentStockInfo.expectedClosingStock;
    const newStock = oldStock + totalUnits;

    updatedItems.push({
      productName: matchedProd.productName,
      category: matchedProd.category,
      quantity: totalUnits,
      oldStock,
      newStock,
      unit: matchedProd.unit || cfg?.unit || 'lon',
    });
  }

  if (updatedItems.length === 0) {
    return {
      replyText: `❌ Không nhận diện được sản phẩm nào từ câu lệnh: "${rawClean}".\n` +
        `👉 Hãy đảm bảo tên món tương tự như trong Thực đơn (Ví dụ: "tiger lùn", "huda", "larue", "coca", "bò húc").`,
      commandType: 'unknown',
    };
  }

  // Tạo các bản ghi nhật ký nhập kho (InventoryImportLog)
  const sourceLabel = context.source === 'telegram' ? 'Telegram Bot' : 'Chat Trợ Lý Web';
  const newLogs: InventoryImportLog[] = updatedItems.map((item, idx) => ({
    id: `log_chat_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    date: effectiveDate,
    createdAtMs: now + idx,
    productName: item.productName,
    category: item.category,
    type: 'import',
    quantity: item.quantity,
    supplierOrNote: `Nhập tự động qua ${sourceLabel}`,
    createdBy: context.currentUsername ? `${context.currentUsername} (${sourceLabel})` : sourceLabel,
  }));

  const lines: string[] = [];
  lines.push(`✅ ĐÃ GHI NHẬN NHẬP KHO THÀNH CÔNG!`);
  lines.push(`📅 Ca ngày: ${formatDateDMY(effectiveDate)} · Nguồn: ${sourceLabel}`);
  lines.push(`───────────────────────────────`);

  updatedItems.forEach((it, idx) => {
    lines.push(
      `${idx + 1}. ${it.productName}: ${formatNumber(it.oldStock)} + ${formatNumber(it.quantity)} ➔ ${formatNumber(it.newStock)} ${it.unit}`
    );
  });

  if (unrecognizedTokens.length > 0) {
    lines.push(`───────────────────────────────`);
    lines.push(`⚠️ Không rõ mặt hàng: ${unrecognizedTokens.join(', ')}`);
  }

  lines.push(`───────────────────────────────`);
  lines.push(`📋 Đã lưu vào Nhật ký nhập kho & tự động đồng bộ Cloud trên toàn hệ thống!`);

  return {
    replyText: lines.join('\n'),
    commandType: 'import_execute',
    importData: {
      date: effectiveDate,
      updatedItems,
      newLogs,
    },
  };
}

// Xử lý Báo cáo bán hàng / Doanh thu theo ngày
function handleSalesReport(
  query: string,
  context: ChatAssistantContext
): ChatCommandExecutionResult {
  const { dateStr, label } = parseDateFromQuery(query, context.todayStr, context.yesterdayStr);
  const customGroups = context.customCategoryGroups || context.inventoryData?.customCategoryGroups;
  const targetCategories = resolveCategoriesFromQuery(
    query,
    context.categories,
    context.categoryAliases,
    customGroups
  );

  // Lọc billItems cho ngày này
  let matchingItems = context.billItems.filter((bi) => bi.billDate === dateStr);
  if (targetCategories.length > 0) {
    matchingItems = matchingItems.filter((bi) => targetCategories.includes(bi.category));
  }

  if (matchingItems.length === 0) {
    const catLabel = targetCategories.length > 0 ? ` nhóm [${targetCategories.join(', ')}]` : '';
    return {
      replyText: `📊 Báo cáo bán hàng (${label}):\nChưa ghi nhận món${catLabel} nào được bán trong ca ngày này.`,
      commandType: 'sales_report',
    };
  }

  // Nhóm theo tên sản phẩm
  const itemMap = new Map<string, { productName: string; category: string; quantity: number; revenue: number }>();

  for (const bi of matchingItems) {
    const pKey = bi.productName.trim().toLowerCase();
    const qty = Number(bi.quantity) || 0;
    const rev = Number(bi.subtotal) || qty * (Number(bi.unitPrice) || 0);

    const existing = itemMap.get(pKey);
    if (existing) {
      existing.quantity += qty;
      existing.revenue += rev;
    } else {
      itemMap.set(pKey, {
        productName: bi.productName,
        category: bi.category,
        quantity: qty,
        revenue: rev,
      });
    }
  }

  // Trừ các món đổi trả / hủy trong ngày nếu có để có số bán thực
  for (const ret of context.returns) {
    if (ret.returnDate === dateStr) {
      const pKey = ret.productName.trim().toLowerCase();
      const existing = itemMap.get(pKey);
      if (existing) {
        existing.quantity -= Number(ret.quantity) || 0;
        existing.revenue -= Number(ret.amount) || 0;
      }
    }
  }

  // Yêu cầu: CHỈ HIỂN THỊ CÁC MÓN CÓ SỐ LƯỢNG BÁN > 0 TRONG NGÀY
  const positiveSoldList = Array.from(itemMap.values())
    .filter((it) => it.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity);

  if (positiveSoldList.length === 0) {
    const catLabel = targetCategories.length > 0 ? ` nhóm [${targetCategories.join(', ')}]` : '';
    return {
      replyText: `📊 BÁO CÁO SỐ LƯỢNG BÁN (${label}):\nChưa ghi nhận món${catLabel} nào có số lượng bán > 0 trong ngày này.`,
      commandType: 'sales_report',
    };
  }

  let totalRevenue = 0;
  let totalQuantity = 0;
  for (const it of positiveSoldList) {
    totalRevenue += it.revenue;
    totalQuantity += it.quantity;
  }

  const lines: string[] = [];
  lines.push(`📊 BÁO CÁO SỐ LƯỢNG BÁN (${label}):`);
  if (targetCategories.length > 0) {
    lines.push(`🏷️ Danh mục: ${targetCategories.join(', ')}`);
  }
  lines.push(`───────────────────────────────`);

  positiveSoldList.forEach((it, idx) => {
    lines.push(
      `${idx + 1}. ${it.productName}: ${formatNumber(it.quantity)} (${formatVND(it.revenue)})`
    );
  });

  lines.push(`───────────────────────────────`);
  lines.push(`📈 TỔNG SỐ LƯỢNG: ${formatNumber(totalQuantity)} phần/lon/chai`);
  lines.push(`💰 TỔNG DOANH THU: ${formatVND(totalRevenue)}`);
  lines.push(`💡 Chỉ hiển thị các món có số lượng bán > 0 trong ngày.`);

  return {
    replyText: lines.join('\n'),
    commandType: 'sales_report',
  };
}

function getHelpMessage(): ChatCommandExecutionResult {
  return {
    replyText: `🤖 TRỢ LÝ KHO & BÁO CÁO VQBILL\n` +
      `───────────────────────────────\n` +
      `💡 CÁC MẪU CÂU LỆNH BẠN CÓ THỂ CHAT:\n\n` +
      `1. KIỂM TỒN KHO (TỰ ĐỘNG CHỈ HIỆN MÓN TỒN > 0):\n` +
      `• "kiểm tồn kho A" hoặc "tồn kho B" (theo nhóm bạn tự tạo)\n` +
      `• "báo số lượng bia tồn kho" hoặc "kiểm tồn kho bia"\n` +
      `• "kiểm kho nước ngọt" hoặc "tồn kho đồ uống"\n` +
      `• "tồn kho tiger lùn" (tra cứu cụ thể 1 món)\n` +
      `• "kiểm tồn kho tất cả"\n\n` +
      `2. KIỂM SỐ LƯỢNG BÁN & DOANH THU (CHỈ HIỆN MÓN BÁN > 0):\n` +
      `• "kiểm số lượng bán 24/9/2026"\n` +
      `• "kiểm số lượng bán 2 ngày trước" (hoặc 3 ngày trước, 5 ngày trước...)\n` +
      `• "kiểm số lượng bán hôm qua" hoặc "kiểm số lượng bán hôm nay"\n` +
      `• "báo cáo số lượng bia hôm nay"\n` +
      `• "doanh thu hôm nay"\n\n` +
      `3. NHẬP KHO TỰ NHIÊN (CẬP NHẬT TỨC THÌ):\n` +
      `• "nhập 240 tiger lùn, huda 90, larue 60"\n` +
      `• "nhập 10 coca, 20 bò húc, 5 nước suối"\n` +
      `• "nhập 5 thùng tiger lùn" (tự quy đổi x24)`,
    commandType: 'help',
  };
}
