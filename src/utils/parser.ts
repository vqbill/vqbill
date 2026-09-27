import {
  ExtractedBillJSON,
  ExtractedBillItem,
  PaymentType,
  ProductRecord,
  BillRecord,
  BillItemRecord,
} from '../types';

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
  return cleaned || `id_${Date.now()}`;
}

export function truncateStr(str: string, maxLen: number, fallback = ''): string {
  const val = (str ?? '').trim() || fallback;
  return val.slice(0, maxLen);
}

export function formatVND(amount: number): string {
  const num = Math.round(Number(amount) || 0);
  return num.toLocaleString('vi-VN') + ' ₫';
}

export function formatNumber(amount: number): string {
  const num = Math.round(Number(amount) || 0);
  return num.toLocaleString('vi-VN');
}

export function formatReceiptMoney(amount: number): string {
  const num = Math.round(Number(amount) || 0);
  return num.toLocaleString('en-US');
}

export function formatDateDMY(ymd?: string): string {
  if (!ymd) return '';
  const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatLocalYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftDateByDays(ymd: string, deltaDays: number): string {
  const m = (ymd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  dt.setDate(dt.getDate() + deltaDays);
  return formatLocalYMD(dt);
}

/**
 * Quán bán từ 09:00 sáng ngày D đến 08:00 sáng ngày D+1.
 * Nếu thời gian hiện tại nằm trong khung 00:00 -> 08:00 sáng, ca bán hiện tại thuộc về ngày hôm trước.
 */
export function getCurrentBusinessDate(now: Date = new Date()): string {
  const hour = now.getHours();
  const minute = now.getMinutes();
  const todayYmd = formatLocalYMD(now);
  if (hour < 8 || (hour === 8 && minute === 0)) {
    return shiftDateByDays(todayYmd, -1);
  }
  return todayYmd;
}

export function getYesterdayBusinessDate(now: Date = new Date()): string {
  return shiftDateByDays(getCurrentBusinessDate(now), -1);
}

export function parseTimeHourMinute(timeStr?: string): { hour: number; minute: number; formatted: string } | null {
  if (!timeStr || !timeStr.trim()) return null;
  const m = timeStr.trim().match(/\b([01]?\d|2[0-3])\s*[:hH]\s*([0-5]\d)?\b/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const formatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { hour, minute, formatted };
}

/**
 * Quy tắc ca bán 09:00 sáng -> 08:00 sáng hôm sau:
 * Ví dụ bill ngày 20/8 được tính từ 09:00 sáng 20/8 đến 08:00 sáng 21/8.
 * Nếu ngày trên bill là 21/8 nhưng giờ bill nằm trong khoảng 00:00 -> 08:00 sáng,
 * thì billDate được tính vào ngày 20/8.
 */
export function resolveBusinessBillDate(
  calendarDateYmd: string,
  checkInTime?: string,
  checkOutTime?: string,
  dateIsCheckoutDate = false
): { businessDate: string; shiftedFromNextMorning: boolean } {
  if (!calendarDateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(calendarDateYmd)) {
    return { businessDate: calendarDateYmd, shiftedFromNextMorning: false };
  }

  const inParsed = parseTimeHourMinute(checkInTime);
  const outParsed = parseTimeHourMinute(checkOutTime);

  const isMorningShiftTime = (t: { hour: number; minute: number } | null) =>
    Boolean(t && (t.hour < 8 || (t.hour === 8 && t.minute === 0)));

  if (inParsed && isMorningShiftTime(inParsed)) {
    return {
      businessDate: shiftDateByDays(calendarDateYmd, -1),
      shiftedFromNextMorning: true,
    };
  }

  if (!inParsed && outParsed && isMorningShiftTime(outParsed)) {
    return {
      businessDate: shiftDateByDays(calendarDateYmd, -1),
      shiftedFromNextMorning: true,
    };
  }

  if (dateIsCheckoutDate && outParsed && isMorningShiftTime(outParsed)) {
    return {
      businessDate: shiftDateByDays(calendarDateYmd, -1),
      shiftedFromNextMorning: true,
    };
  }

  return { businessDate: calendarDateYmd, shiftedFromNextMorning: false };
}

export function inferCategory(productName: string, customCategories?: string[]): string {
  const lower = productName.toLowerCase();
  if (Array.isArray(customCategories) && customCategories.length > 0) {
    for (const c of customCategories) {
      const cLow = c.toLowerCase().trim();
      if (cLow && cLow !== 'khác' && lower.includes(cLow)) {
        return c;
      }
    }
  }
  if (
    /(bia|tiger|heineken|sài gòn|sai gon|larue|budweiser|333|ken|sapporo|huda|ruby|tháp bia)/i.test(
      lower
    )
  ) {
    return 'Bia';
  }
  if (
    /(nước ngọt|nuoc ngot|nước suối|nuoc suoi|nước lọc|aquafina|dasani|redbull|red bull|bò húc|coca|pepsi|7up|sting|soda|trà đá|tra da|khăn lạnh|khan lanh|mirinda|sprite|fanta|revive|trà ô long|olong)/i.test(
      lower
    )
  ) {
    return 'Nước ngọt';
  }
  if (/(ếch|ech)/i.test(lower)) {
    return 'Ếch';
  }
  if (/(gà|ga\b|cánh gà|chân gà|đùi gà|lẩu gà|mề gà|sụn gà)/i.test(lower)) {
    return 'Gà';
  }
  if (/(?:^|\s)(?:tôm|mực|cá|cá giò|cua|càng cua|ốc|nghêu|sò|hàu|bạch tuộc|ghẹ|hải sản|chíp hấp|chip hấp)(?:\s|$)/i.test(lower) && !/thuốc/i.test(lower)) {
    return 'Hải sản';
  }
  if (
    /(đậu hũ|đậu khuôn|khoai tây|gỏi|chả giò|đậu lạc|đậu phộng|lạc rang|nem chua|khai vị|dưa leo|cà chua|bắp xào|xúc xích|phô mai que|bánh đa|phồng tôm|trái cây)/i.test(
      lower
    )
  ) {
    return 'Khai vị';
  }
  if (
    /(combo|set\b|lẩu|cơm|mì\b|miến|bún|phở|bò|heo|lợn|dê|vịt|sườn|ba chỉ|dồi|nầm|cháo)/i.test(
      lower
    )
  ) {
    return 'Lẩu / Món chính';
  }
  return 'Khác';
}

export function inferUnit(productName: string, category: string): string {
  const lower = productName.toLowerCase();
  if (lower.includes('khăn lạnh')) return 'Cái';
  if (lower.includes('trà đá')) return 'Ca';
  if (lower.includes('tháp')) return 'Tháp';
  if (lower.includes('combo') || lower.includes('set ')) return 'Combo';
  if (lower.includes('kết') || lower.includes('thùng')) return 'Thùng';
  if (category === 'Bia' || category === 'Nước ngọt') return 'Lon';
  if (lower.includes('lẩu')) return 'Nồi';
  return 'Phần';
}

export function normalizeMoneyNumber(raw: string | number): number {
  if (typeof raw === 'number') {
    return Math.max(0, Math.round(raw));
  }
  const str = String(raw || '').trim().toLowerCase();
  if (!str) return 0;
  const hasK = /\d+\s*k\b/.test(str) || str.endsWith('k');
  const hasTr = /\d+\s*(tr|triệu)\b/.test(str);
  const digits = str.replace(/[^\d]/g, '');
  if (!digits) return 0;
  const val = parseInt(digits, 10);
  if (hasTr && val < 1000) return val * 1000000;
  if (hasK && val < 100000) return val * 1000;
  return val;
}

export interface BulkParsedProduct {
  productName: string;
  category: string;
  unitPrice: number;
  unit: string;
}

/**
 * Parses bulk product lines strictly following the logic:
 * Tên sản phẩm, Danh mục, Giá bán (supports comma ',', pipe '|', semicolon ';', tab '\t', or ' - ')
 * Preserves user-defined categories so they are all added to Category Management.
 */
export function parseBulkProductsByLogic(
  rawText: string,
  availableCategories?: string[]
): BulkParsedProduct[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const results: BulkParsedProduct[] = [];

  for (const rawLine of lines) {
    // Strip leading bullet or numbering like "1. " or "- "
    let line = rawLine.replace(/^(?:\d+[\.\)]\s*|\-\s*|\*\s*|•\s*)/, '').trim();
    if (!line) continue;

    // Skip decorative separator lines
    if (/^[=\-*_~><\s]+$/.test(line)) continue;

    // Skip header row if pasted from Excel/CSV
    if (
      /^(tên sản phẩm|ten san pham|tên món|sản phẩm|product|stt)/i.test(line) &&
      /(danh mục|category|nhóm|giá bán|đơn giá|price)/i.test(line)
    ) {
      continue;
    }

    // Normalize thousand-separator commas inside numbers (e.g., "129,000" -> "129000") before splitting by comma
    line = line
      .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
      .replace(/(\d),(\d{3})(?!\d)/g, '$1$2');

    // Split by tab, pipe, semicolon, or comma first
    let parts = line
      .split(/\t|\||;|,/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length < 2 && line.includes(' - ')) {
      parts = line
        .split(' - ')
        .map((p) => p.trim())
        .filter(Boolean);
    }

    if (parts.length >= 3) {
      const productName = parts[0].replace(/^["']|["']$/g, '').trim();
      let rawCategory = parts[1]
        .replace(/^(?:danh mục|nhóm|loại)\s*[:\-]?\s*/i, '')
        .replace(/^["']|["']$/g, '')
        .trim();
      let rawPricePart = parts[2];

      // Handle case where user accidentally put (Tên sản phẩm, Giá bán, Danh mục)
      const p1IsPurePrice = /^(?:giá\s*)?\d[\d.,]*\s*(?:k|đ|vnđ|d)?$/i.test(rawCategory);
      const p2IsPurePrice = /^(?:giá\s*)?\d[\d.,]*\s*(?:k|đ|vnđ|d)?$/i.test(rawPricePart);
      if (p1IsPurePrice && !p2IsPurePrice) {
        const tmp = rawCategory;
        rawCategory = rawPricePart.replace(/^["']|["']$/g, '').trim();
        rawPricePart = tmp;
      }

      let unitPrice = normalizeMoneyNumber(rawPricePart);
      if (unitPrice > 0 && unitPrice < 1000) {
        unitPrice *= 1000;
      }

      // Keep exact user category (or match case-insensitively to existing category if same name)
      let matchedCategory = rawCategory || inferCategory(productName, availableCategories);
      if (Array.isArray(availableCategories) && rawCategory) {
        const found = availableCategories.find(
          (c) => c.toLowerCase().trim() === rawCategory.toLowerCase().trim()
        );
        if (found) matchedCategory = found;
      }

      const unit = parts[3] ? parts[3].trim() : inferUnit(productName, matchedCategory);

      if (productName) {
        results.push({
          productName,
          category: matchedCategory,
          unitPrice,
          unit,
        });
        continue;
      }
    }

    if (parts.length === 2) {
      const p0 = parts[0].trim();
      const p1 = parts[1].trim();
      const isP1Price = /^(?:giá\s*)?\d[\d.,]*\s*(?:k|đ|vnđ|d)?$/i.test(p1);
      if (isP1Price) {
        let uPrice = normalizeMoneyNumber(p1);
        if (uPrice > 0 && uPrice < 1000) uPrice *= 1000;
        const cat = inferCategory(p0, availableCategories);
        results.push({
          productName: p0,
          category: cat,
          unitPrice: uPrice,
          unit: inferUnit(p0, cat),
        });
        continue;
      } else {
        let matchedCat = p1 || inferCategory(p0, availableCategories);
        if (Array.isArray(availableCategories) && p1) {
          const found = availableCategories.find(
            (c) => c.toLowerCase().trim() === p1.toLowerCase().trim()
          );
          if (found) matchedCat = found;
        }
        results.push({
          productName: p0,
          category: matchedCat,
          unitPrice: 0,
          unit: inferUnit(p0, matchedCat),
        });
        continue;
      }
    }

    // Fallback single-string pattern: "Tên sản phẩm ... Giá bán"
    const m = line.match(/^(.+?)\s+(?:giá\s*[:\-]?\s*|[\-|:]\s*)?(\d[\d.,]*)\s*(k|đ|vnđ|d)?$/i);
    if (m) {
      const name = m[1].trim();
      let price = normalizeMoneyNumber(m[2] + (m[3] || ''));
      if (price > 0 && price < 1000) price *= 1000;
      const cat = inferCategory(name, availableCategories);
      results.push({
        productName: name,
        category: cat,
        unitPrice: price,
        unit: inferUnit(name, cat),
      });
    }
  }

  return results;
}

export const DEFAULT_CATALOG_PRODUCTS = [
  { productName: 'Gà biển kho nghệ', category: 'Gà', unitPrice: 129000, unit: 'Phần' },
  { productName: 'Combo 2', category: 'Lẩu / Món chính', unitPrice: 459000, unit: 'Combo' },
  { productName: 'Bia Tiger Lùn', category: 'Bia', unitPrice: 22000, unit: 'Lon' },
  { productName: 'Bia Sài Gòn Special', category: 'Bia', unitPrice: 18000, unit: 'Lon' },
  { productName: 'Bia Heineken Silver', category: 'Bia', unitPrice: 25000, unit: 'Lon' },
  { productName: 'Bia Budweiser', category: 'Bia', unitPrice: 26000, unit: 'Lon' },
  { productName: 'Bia Larue', category: 'Bia', unitPrice: 16000, unit: 'Lon' },
  { productName: 'Nước ngọt Redbull', category: 'Nước ngọt', unitPrice: 18000, unit: 'Lon' },
  { productName: 'Coca Cola', category: 'Nước ngọt', unitPrice: 15000, unit: 'Lon' },
  { productName: 'Nước ngọt Pepsi', category: 'Nước ngọt', unitPrice: 15000, unit: 'Lon' },
  { productName: 'Nước suối Aquafina', category: 'Nước ngọt', unitPrice: 10000, unit: 'Chai' },
  { productName: 'Khăn lạnh', category: 'Nước ngọt', unitPrice: 3000, unit: 'Cái' },
  { productName: 'Đậu hũ chiên giòn', category: 'Khai vị', unitPrice: 45000, unit: 'Đĩa' },
  { productName: 'Khoai tây chiên bơ', category: 'Khai vị', unitPrice: 55000, unit: 'Đĩa' },
  { productName: 'Đậu lạc rang muối', category: 'Khai vị', unitPrice: 30000, unit: 'Đĩa' },
  { productName: 'Gỏi ngó sen tôm thịt', category: 'Khai vị', unitPrice: 120000, unit: 'Phần' },
  { productName: 'Ếch sapo', category: 'Ếch', unitPrice: 135000, unit: 'Phần' },
  { productName: 'Ếch chiên bơ', category: 'Ếch', unitPrice: 125000, unit: 'Phần' },
  { productName: 'Ếch rơm', category: 'Ếch', unitPrice: 140000, unit: 'Phần' },
  { productName: 'Ếch xào sa tế', category: 'Ếch', unitPrice: 130000, unit: 'Phần' },
  { productName: 'Gà chiên mắm', category: 'Gà', unitPrice: 165000, unit: 'Đĩa' },
  { productName: 'Gà hấp lá chanh', category: 'Gà', unitPrice: 290000, unit: 'Con' },
  { productName: 'Lẩu gà lá é', category: 'Gà', unitPrice: 260000, unit: 'Nồi' },
  { productName: 'Cánh gà chiên mắm', category: 'Gà', unitPrice: 145000, unit: 'Phần' },
  { productName: 'Mực nướng sa tế', category: 'Hải sản', unitPrice: 185000, unit: 'Đĩa' },
  { productName: 'Tôm sú hấp bia', category: 'Hải sản', unitPrice: 250000, unit: 'Phần' },
  { productName: 'Ốc hương xào bơ tỏi', category: 'Hải sản', unitPrice: 190000, unit: 'Đĩa' },
  { productName: 'Lẩu thái hải sản', category: 'Lẩu / Món chính', unitPrice: 280000, unit: 'Nồi' },
  { productName: 'Bò lúc lắc khoai tây', category: 'Lẩu / Món chính', unitPrice: 195000, unit: 'Đĩa' },
  { productName: 'Mì xào hải sản', category: 'Lẩu / Món chính', unitPrice: 110000, unit: 'Đĩa' },
];

const COMMON_NOTE_MODIFIERS_REGEX =
  /\s+(?:[\(\-\|:]\s*)?((?:làm|ít|không|ko|thêm|nhiều|bỏ|để|chặt|nấu|chiên|nướng|hấp|xào|luộc|gói|đem|mang)\s+(?:cay|cay nhiều|cay ít|vừa cay|hành|tỏi|tiêu|ớt|đá|đường|mặn|ngọt|nhạt|chua|giòn|mềm|kỹ|tái|chín|nhỏ|to|nguyên con|riêng|về|mang về|đem về|nước mắm|muối ớt|sa tế|bơ|mỡ).*)$/i;

/**
 * Tách tên món chuẩn (đối chiếu với Menu Catalog nếu có) và phần ghi chú đi kèm trên cùng 1 dòng.
 * Ví dụ: Menu có "Gà biển kho nghệ" (129000), text là "gà biển kho nghệ làm cay"
 * -> productName: "Gà biển kho nghệ", note: "làm cay"
 */
export function formatItemDiscountNote(
  originalPrice: number,
  sellPrice: number,
  explicitPct?: number
): {
  originalUnitPrice: number;
  discountAmount: number;
  discountPercent: number;
  discountNote: string;
} | null {
  const orig = Math.round(Number(originalPrice) || 0);
  const sell = Math.round(Number(sellPrice) || 0);
  if (orig <= sell || sell <= 0) return null;
  const discAmt = orig - sell;
  const pct =
    explicitPct !== undefined && explicitPct > 0
      ? Number(Number(explicitPct).toFixed(2))
      : Number(((discAmt / orig) * 100).toFixed(2));
  const discountNote = `Giá gốc ${orig.toLocaleString('vi-VN')}đ, giảm ${pct}% (-${discAmt.toLocaleString(
    'vi-VN'
  )}đ), giá bán còn lại ${sell.toLocaleString('vi-VN')}đ`;
  return {
    originalUnitPrice: orig,
    discountAmount: discAmt,
    discountPercent: pct,
    discountNote,
  };
}

export function extractReceiptOriginalPrice(item: {
  productName: string;
  note?: string;
  unitPrice: number;
  originalUnitPrice?: number;
}): number | undefined {
  if (item.originalUnitPrice && item.originalUnitPrice > item.unitPrice) {
    return Math.round(item.originalUnitPrice);
  }
  const noteStr = item.note || '';
  const m = noteStr.match(/giá\s*gốc\s*[:\-]?\s*(\d[\d.,]*)/i);
  if (m) {
    const val = normalizeMoneyNumber(m[1]);
    if (val > item.unitPrice) {
      return val;
    }
  }
  const combinedName = `${item.productName} ${noteStr}`.toLowerCase();
  if (
    combinedName.includes('gà hấp hành nửa con') &&
    item.unitPrice === 179000
  ) {
    return 319000;
  }
  return undefined;
}

const KNOWN_VINH_QUAN_ITEM_PRICES: Record<string, number> = {
  'cơm chiên hải sản': 109000,
  'sụn gà chiên mắm': 89000,
  'đậu khuôn tẩm hành': 49000,
  'đậu khuôn mỡ hành': 49000,
  'tôm đất rang mắm ớt': 129000,
  'hàu nướng mỡ hành': 119000,
  'bò nướng cuốn cải': 139000,
  'heiniken bạc lon nhỏ 250ml': 22000,
  'heineken bạc lon nhỏ 250ml': 22000,
  'heineken bạc lon 330ml': 26000,
  'bia corona (nhỏ)': 32000,
  'bia corona': 32000,
  'coca': 15000,
  'coca cola': 15000,
  'bò húc': 20000,
  'nước suối aqua': 10000,
  'nước suối': 10000,
  'gỏi ốc giác': 119000,
  'tôm sú bơ tỏi': 139000,
  'tôm sú hấp': 129000,
  'ba chỉ giòn da': 109000,
  'cá đuối': 584000,
  'bánh mì': 5000,
  'fanta': 15000,
  'rau thêm': 20000,
  'lẩu hải sản (lớn)': 269000,
  'lẩu hải sản': 249000,
  'tiger bạc lon 330ml': 24000,
  'tiger bạc lon nhỏ 250ml': 21000,
  'ếch xào sả ớt': 109000,
  'bò cháy tiêu xanh bản giang': 159000,
  'huda lon': 18000,
  'larue lon': 18000,
  'bia larue': 18000,
  'combo 2': 559000,
  'bạch tuộc rang mắm ớt': 129000,
  'sườn heo nướng': 169000,
  'bê non xào sả ớt': 139000,
  'gà biển kho nghệ': 129000,
  'bánh bao chiên': 20000,
  'nghêu đen hấp': 119000,
  'lẩu riêu cua bắp bò (nhỏ)': 169000,
  'lẩu riêu cua bắp bò': 169000,
  'rau rừng xào bò': 119000,
  'rau rừng': 69000,
  'gà hấp hành nửa con': 179000,
  'thuốc 555 dẹt (vàng)': 25000,
  'thuốc 555 dẹt': 25000,
  'thuốc con ngựa': 35000,
  'thuốc jet': 35000,
  'thuốc esse': 45000,
  'lẩu thái': 189000,
  'táo mèo nhỏ': 169000,
  'bánh tráng': 15000,
  'khăn lạnh': 5000,
  'mực cơm chiên mắm': 165000,
  'mực cơm hấp': 165000,
  'cá dìa nấu khế': 280000,
  'cánh gà chiên mắm': 99000,
  'cơm chiên trứng': 59000,
  'chíp hấp sả': 109000,
  'chíp xào lá quế': 109000,
  'cá mú': 744000,
  'ốc hương': 248000,
  'mì xào hải sản': 99000,
  'hàu đút lò phô mai': 119000,
  'sting': 15000,
};

export function reconstructBillItemsFromSummary(
  bill: BillRecord,
  existingProducts?: ProductRecord[]
): BillItemRecord[] {
  const summary = (bill.itemsSummary || '').trim();
  if (!summary) return [];

  // Split by comma outside parentheses
  const segments: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < summary.length; i++) {
    const ch = summary[i];
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    if (ch === ',' && depth === 0) {
      if (current.trim()) segments.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) segments.push(current.trim());

  const catalogMap = new Map<string, { unitPrice: number; category: string }>();
  for (const dp of DEFAULT_CATALOG_PRODUCTS) {
    catalogMap.set(dp.productName.toLowerCase().trim(), {
      unitPrice: dp.unitPrice,
      category: dp.category,
    });
  }
  if (Array.isArray(existingProducts)) {
    for (const p of existingProducts) {
      const k = p.productName.toLowerCase().trim();
      if (p.unitPrice > 0 || !catalogMap.has(k)) {
        catalogMap.set(k, {
          unitPrice: p.unitPrice,
          category: p.category,
        });
      }
    }
  }

  const draftItems: Array<{
    productName: string;
    note: string;
    category: string;
    quantity: number;
    unitPrice: number;
    originalUnitPrice?: number;
  }> = [];

  for (const seg of segments) {
    // Match trailing "x<qty>"
    const m = seg.match(/^(.+?)\s+x(\d+)$/i);
    const rawNameAndNote = m ? m[1].trim() : seg.trim();
    const qty = m ? Math.max(1, parseInt(m[2], 10) || 1) : 1;

    // Check if there is a trailing "(...)" note
    let productName = rawNameAndNote;
    let note = '';
    const lastOpenParen = rawNameAndNote.indexOf('(');
    if (lastOpenParen > 0 && rawNameAndNote.endsWith(')')) {
      const candidateBase = rawNameAndNote.slice(0, lastOpenParen).trim();
      const candidateInner = rawNameAndNote.slice(lastOpenParen + 1, -1).trim();
      const isShortVariant =
        /^(?:nhỏ|lớn|vừa|vàng|bạc)$/i.test(candidateInner) &&
        KNOWN_VINH_QUAN_ITEM_PRICES[rawNameAndNote.toLowerCase()] !== undefined;
      if (!isShortVariant) {
        productName = candidateBase;
        note = candidateInner;
      }
    }

    const fullLower = rawNameAndNote.toLowerCase().trim();
    const baseLower = productName.toLowerCase().trim();

    let uPrice = 0;
    let cat = inferCategory(productName);

    const catEntryFull = catalogMap.get(fullLower);
    const catEntryBase = catalogMap.get(baseLower);

    if (catEntryFull && catEntryFull.unitPrice > 0) {
      uPrice = catEntryFull.unitPrice;
      cat = catEntryFull.category || cat;
    } else if (KNOWN_VINH_QUAN_ITEM_PRICES[fullLower] !== undefined) {
      uPrice = KNOWN_VINH_QUAN_ITEM_PRICES[fullLower];
      if (catEntryFull?.category) cat = catEntryFull.category;
    } else if (catEntryBase && catEntryBase.unitPrice > 0) {
      uPrice = catEntryBase.unitPrice;
      cat = catEntryBase.category || cat;
    } else if (KNOWN_VINH_QUAN_ITEM_PRICES[baseLower] !== undefined) {
      uPrice = KNOWN_VINH_QUAN_ITEM_PRICES[baseLower];
      if (catEntryBase?.category) cat = catEntryBase.category;
    } else if (note) {
      const mPriceInNote = note.match(/(\d+)\s*k\b/i);
      if (mPriceInNote) {
        uPrice = parseInt(mPriceInNote[1], 10) * 1000;
      }
    }

    const origPrice = extractReceiptOriginalPrice({
      productName,
      note,
      unitPrice: uPrice,
    });

    draftItems.push({
      productName,
      note,
      category: cat,
      quantity: qty,
      unitPrice: uPrice,
      originalUnitPrice: origPrice,
    });
  }

  // Reconcile total with bill.subtotalAmount || bill.totalAmount if needed
  const targetTotal = bill.subtotalAmount || bill.totalAmount || 0;
  const currentTotal = draftItems.reduce(
    (s, it) => s + it.quantity * it.unitPrice,
    0
  );
  if (targetTotal > 0 && currentTotal !== targetTotal && draftItems.length > 0) {
    const zeroPriceItems = draftItems.filter((it) => it.unitPrice === 0);
    const diff = targetTotal - currentTotal;
    if (zeroPriceItems.length === 1 && diff > 0) {
      zeroPriceItems[0].unitPrice = Math.round(diff / zeroPriceItems[0].quantity);
    } else if (zeroPriceItems.length === 0 && diff !== 0) {
      // Adjust the highest-value item or combo item if there's a slight custom bill price difference
      const adjustable = draftItems.find(
        (it) =>
          it.quantity === 1 &&
          (it.productName.toLowerCase().includes('cá') ||
            it.productName.toLowerCase().includes('lẩu') ||
            it.productName.toLowerCase().includes('combo')) &&
          it.unitPrice + diff > 0
      );
      if (adjustable) {
        adjustable.unitPrice += diff;
      }
    }
  }

  return draftItems.map((it, idx) => ({
    id: `${bill.id}_reconstructed_${idx + 1}`,
    ownerId: bill.ownerId,
    billId: bill.id,
    billDate: bill.billDate,
    productName: it.productName,
    note: it.note,
    category: it.category,
    quantity: it.quantity,
    returnedQuantity: 0,
    unitPrice: it.unitPrice,
    subtotal: it.quantity * it.unitPrice,
    originalUnitPrice: it.originalUnitPrice,
    createdAtMs: bill.createdAtMs || Date.now(),
    updatedAtMs: bill.updatedAtMs || Date.now(),
  }));
}

export function splitProductNameAndInlineNote(
  rawDishText: string,
  existingProducts?: ProductRecord[],
  customCategories?: string[]
): {
  productName: string;
  note: string;
  category: string;
  catalogUnitPrice?: number;
} {
  let cleaned = (rawDishText || '')
    .replace(/^[=\-*_~><\s]+|[=\-*_~><\s]+$/g, '')
    .replace(/^(?:\d+[\.\)]\s*)/, '')
    .replace(/\s+(?:giá|đơn giá|đg)\s*[:\-=]?\s*$/i, '')
    .trim();

  const noteParts: string[] = [];

  // Build combined lookup catalog (user's products + default catalog fallback)
  const catalogList: Array<{
    productName: string;
    category: string;
    unitPrice: number;
  }> = [];
  const seenLower = new Set<string>();

  if (Array.isArray(existingProducts)) {
    for (const p of existingProducts) {
      const k = p.productName.trim().toLowerCase();
      if (k && !seenLower.has(k)) {
        seenLower.add(k);
        catalogList.push({
          productName: p.productName.trim(),
          category: p.category,
          unitPrice: p.unitPrice,
        });
      }
    }
  }
  for (const dp of DEFAULT_CATALOG_PRODUCTS) {
    const k = dp.productName.trim().toLowerCase();
    if (k && !seenLower.has(k)) {
      seenLower.add(k);
      catalogList.push(dp);
    }
  }

  // Sort by productName length descending so longest match wins
  catalogList.sort((a, b) => b.productName.length - a.productName.length);

  // 1. Extract explicit parentheses / brackets note only if it's a cooking modifier OR base name is in catalog
  // Keep variant descriptors like "(nhỏ)", "(lớn)", "(vàng)" in "Lẩu riêu cua bắp bò (nhỏ)" or "Thuốc 555 dẹt (vàng)"
  const isVariantParen = (txt: string) =>
    /^(?:nhỏ|lớn|vừa|to|đại|vàng|bạc|xanh|đỏ|đen|trắng|lon|chai|nửa\s*con|1\s*con|\d+\s*ml|\d+\s*l)$/i.test(
      txt.trim()
    );

  const strippedCandidate = cleaned
    .replace(/\(([^)]+)\)|\[([^\]]+)\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const baseMatchesCatalog = catalogList.some(
    (c) => c.productName.toLowerCase() === strippedCandidate
  );
  const fullMatchesCatalog = catalogList.some(
    (c) => c.productName.toLowerCase() === cleaned.toLowerCase()
  );

  if (!fullMatchesCatalog) {
    cleaned = cleaned
      .replace(/\(([^)]+)\)|\[([^\]]+)\]/g, (fullMatch, g1, g2) => {
        const inner = (g1 || g2 || '').trim();
        if (!inner) return ' ';
        if (!baseMatchesCatalog && isVariantParen(inner)) {
          return fullMatch;
        }
        noteParts.push(inner);
        return ' ';
      })
      .replace(/\s+/g, ' ')
      .trim();
  }

  const lowerCleaned = cleaned.toLowerCase();

  for (const catProd of catalogList) {
    const pLow = catProd.productName.toLowerCase();
    if (lowerCleaned === pLow) {
      return {
        productName: catProd.productName,
        note: noteParts.join(', '),
        category: catProd.category,
        catalogUnitPrice: catProd.unitPrice,
      };
    }

    if (lowerCleaned.startsWith(pLow + ' ') || lowerCleaned.startsWith(pLow + '-') || lowerCleaned.startsWith(pLow + ':')) {
      const remainder = cleaned
        .slice(catProd.productName.length)
        .replace(/^[\s\-:,|]+|[\s\-:,|]+$/g, '')
        .replace(/\b(?:giá|đơn giá)\b$/i, '')
        .trim();

      if (remainder) {
        noteParts.unshift(remainder);
      }

      return {
        productName: catProd.productName,
        note: noteParts.join(', '),
        category: catProd.category,
        catalogUnitPrice: catProd.unitPrice,
      };
    }
  }

  // 2. Fallback heuristic modifier extraction even when dish is not yet in catalog
  const modMatch = cleaned.match(COMMON_NOTE_MODIFIERS_REGEX);
  if (modMatch && modMatch.index && modMatch.index > 2) {
    const baseName = cleaned.slice(0, modMatch.index).replace(/[\s\-:,|]+$/, '').trim();
    const modNote = modMatch[1].replace(/[\s\-:,|]+$/, '').trim();
    if (baseName && modNote) {
      noteParts.unshift(modNote);
      return {
        productName: baseName,
        note: noteParts.join(', '),
        category: inferCategory(baseName, customCategories),
      };
    }
  }

  return {
    productName: cleaned,
    note: noteParts.join(', '),
    category: inferCategory(cleaned, customCategories),
  };
}

function cleanDecorativeLine(raw: string): string {
  return raw
    .replace(/^[=\-*_~><\s]+|[=\-*_~><\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPureDecorativeLine(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  return /^[=\-*_~><\s]+$/.test(trimmed);
}

/**
 * Checks if a line is ONLY a price or quantity + price line (without a dish name),
 * such as:
 * - "giá 459000"
 * - "Giá: 459.000đ"
 * - "459.000đ"
 * - "1 x 459.000 = 459.000"
 * - "SL: 2   129.000   258.000"
 */
function parsePriceOnlyLine(
  line: string
): { quantity: number; unitPrice: number; subtotal: number } | null {
  const cleaned = cleanDecorativeLine(line);
  if (!cleaned) return null;

  // Pattern 1: "giá 459000" / "Đơn giá: 459.000đ" / "459000đ"
  const mSinglePrice = cleaned.match(
    /^(?:giá(?:\s*bán)?|đơn\s*giá|thành\s*tiền|đg|tt)?\s*[:=\-]?\s*(\d[\d.,]*)\s*(k|đ|vnđ|d)?$/i
  );
  if (mSinglePrice) {
    let price = normalizeMoneyNumber(mSinglePrice[1] + (mSinglePrice[2] || ''));
    if (price > 0 && price < 1000) price *= 1000;
    if (price >= 1000) {
      return { quantity: 1, unitPrice: price, subtotal: price };
    }
  }

  // Pattern 2: "1 x 459.000 = 459.000" or "SL: 2 x 129.000 = 258.000" or "2   129,000   258,000"
  const mQtyPrice = cleaned.match(
    /^(?:(?:số\s*lượng|sl)\s*[:\-]?\s*|x\s*)?(\d{1,4})\s*(?:lon|chai|phần|đĩa|dĩa|nồi|cái|ly|ca|suất|combo|con)?\s*(?:[x*×\-|:]|\s+)\s*(?:(?:đơn\s*giá|giá(?:\s*bán)?|đg)\s*[:\-]?\s*)?(\d[\d.,]*\s*(?:k|đ|vnđ|d)?)(?:\s*(?:[=\-|:]|\s+)\s*(?:(?:thành\s*tiền|tt)\s*[:\-]?\s*)?(\d[\d.,]*\s*(?:k|đ|vnđ|d)?))?$/i
  );
  if (mQtyPrice) {
    const qty = Math.max(1, parseInt(mQtyPrice[1], 10) || 1);
    let uPrice = normalizeMoneyNumber(mQtyPrice[2]);
    let sub = mQtyPrice[3] ? normalizeMoneyNumber(mQtyPrice[3]) : 0;
    if (uPrice > 0 && uPrice < 1000) uPrice *= 1000;
    if (sub > 0 && sub < 1000) sub *= 1000;
    if (uPrice >= 1000) {
      if (sub === 0) sub = qty * uPrice;
      else if (uPrice > sub && qty > 1) {
        const tmp = sub;
        sub = uPrice;
        uPrice = tmp;
      } else {
        sub = qty * uPrice;
      }
      return { quantity: qty, unitPrice: uPrice, subtotal: sub };
    }
  }

  return null;
}

/**
 * Parses a single line that contains BOTH a dish name AND a price (with optional quantity).
 * Carefully avoids treating numbers in dish names like "Combo 2" or "Bia 333" as quantities!
 */
function parseFullItemLine(
  line: string,
  existingProducts?: ProductRecord[],
  customCategories?: string[]
): ExtractedBillItem | null {
  const cleaned = cleanDecorativeLine(line);
  if (!cleaned) return null;

  // Reject lines wrapped in >>> ... <<< if they don't have a valid price at the end (>= 1000)
  const wasChevronWrapped = /^>{2,}.*<{2,}$/.test(line.trim());

  // 0A. Format 1 with Discounted Item Price (2 unit prices before "x SL Thành tiền"):
  // Example: "Gà hấp hành nửa con 179,000 319,000 x 1 179,000"
  // or "Gà hấp hành nửa con 319,000 179,000 x 1 179,000"
  // Meaning: originalPrice = 319,000, discount = 43.89% (-140,000), qty = 1, unitPrice (remaining sell price) = 179,000, subtotal = 179,000
  const regexDiscountedPriceTimesQty =
    /^(.+?)\s+(\d[\d.,]*\s*(?:k|đ|vnđ|d)?)\s+(?:(?:\-?\d{1,2}(?:[.,]\d+)?%\s+)?)?(\d[\d.,]*\s*(?:k|đ|vnđ|d)?)\s*[x×*]\s*(\d{1,4})\s*(?:lon|chai|phần|đĩa|dĩa|nồi|cái|ly|ca|suất|bịch|gói|con|combo)?\s+(\d[\d.,]*\s*(?:k|đ|vnđ|d)?)$/i;
  const m0a = cleaned.match(regexDiscountedPriceTimesQty);
  if (m0a && !wasChevronWrapped) {
    const rawPrefixName = m0a[1].replace(/^[\d]+[\.\)]\s*/, '').replace(/[\-|:]$/, '').trim();
    let price1 = normalizeMoneyNumber(m0a[2]);
    let price2 = normalizeMoneyNumber(m0a[3]);
    const qtyCandidate = parseInt(m0a[4], 10) || 1;
    let subMoney = normalizeMoneyNumber(m0a[5]);
    if (price1 > 0 && price1 < 1000 && /k\b/i.test(m0a[2])) price1 *= 1000;
    if (price2 > 0 && price2 < 1000 && /k\b/i.test(m0a[3])) price2 *= 1000;
    if (subMoney > 0 && subMoney < 1000 && /k\b/i.test(m0a[5])) subMoney *= 1000;

    if (rawPrefixName && price1 >= 1000 && price2 >= 1000 && qtyCandidate >= 1) {
      const qty = Math.max(1, qtyCandidate);
      const originalPrice = Math.max(price1, price2);
      const sellPrice = Math.min(price1, price2);
      const sub = subMoney >= sellPrice ? subMoney : qty * sellPrice;
      const discInfo = formatItemDiscountNote(originalPrice, sellPrice);

      const split = splitProductNameAndInlineNote(
        rawPrefixName,
        existingProducts,
        customCategories
      );
      if (split.productName) {
        const noteText = [split.note, discInfo?.discountNote]
          .filter(Boolean)
          .join(' · ');
        return {
          productName: split.productName,
          note: noteText,
          category: split.category,
          quantity: qty,
          unitPrice: sellPrice,
          subtotal: sub,
          originalUnitPrice: discInfo?.originalUnitPrice,
          discountAmount: discInfo?.discountAmount,
          discountPercent: discInfo?.discountPercent,
        };
      }
    }
  }

  // 0. Format 1 (VỊNH QUÁN / Thermal Receipt): "Tên hàng   Đ.Giá x SL   Thành tiền"
  // Examples:
  // - "Heineken bạc lon 330ml 26,000 x 72 1,872,000"
  // - "Chíp hấp sả 109,000 x 2 218,000"
  // - "Bê 89,000 x 1 89,000"
  const regexPriceTimesQty =
    /^(.+?)\s+(\d[\d.,]*\s*(?:k|đ|vnđ|d)?)\s*[x×*]\s*(\d{1,4})\s*(?:lon|chai|phần|đĩa|dĩa|nồi|cái|ly|ca|suất|bịch|gói|con|combo)?\s+(\d[\d.,]*\s*(?:k|đ|vnđ|d)?)$/i;
  const m0 = cleaned.match(regexPriceTimesQty);
  if (m0 && !wasChevronWrapped) {
    const rawPrefixName = m0[1].replace(/^[\d]+[\.\)]\s*/, '').replace(/[\-|:]$/, '').trim();
    let firstMoney = normalizeMoneyNumber(m0[2]);
    const qtyCandidate = parseInt(m0[3], 10) || 1;
    let subMoney = normalizeMoneyNumber(m0[4]);
    if (firstMoney > 0 && firstMoney < 1000 && /k\b/i.test(m0[2])) firstMoney *= 1000;
    if (subMoney > 0 && subMoney < 1000 && /k\b/i.test(m0[4])) subMoney *= 1000;

    // If firstMoney >= 1000, this is UnitPrice x Qty = Subtotal (Format 1)
    if (rawPrefixName && firstMoney >= 1000 && qtyCandidate >= 1) {
      const qty = Math.max(1, qtyCandidate);
      const uPrice = firstMoney;
      const sub = subMoney >= uPrice ? subMoney : qty * uPrice;
      const split = splitProductNameAndInlineNote(
        rawPrefixName,
        existingProducts,
        customCategories
      );
      if (split.productName) {
        return {
          productName: split.productName,
          note: split.note || '',
          category: split.category,
          quantity: qty,
          unitPrice: uPrice,
          subtotal: sub,
        };
      }
    }
  }

  // 1. Try matching: Name + explicit Qty + UnitPrice + (optional Subtotal)
  // Example: "1. Bia Tiger Lùn x24 lon 22.000đ 528.000đ" or "Gà biển kho nghệ 2 129000 258000"
  const regexQtyAndPrice =
    /^(.+?)\s+(?:(?:SL|sl)\s*[:\-]?\s*|[x×]\s*)?(\d{1,4})\s*(?:lon|chai|phần|đĩa|dĩa|nồi|cái|ly|ca|suất|bịch|gói|con|combo)?\s*(?:[\-x×|:@]|\s+)\s*(?:giá\s*[:\-]?\s*)?(\d[\d.,]*\s*(?:k|đ|vnđ|d)?)(?:\s*(?:[\-=|:]|\s+)\s*(\d[\d.,]*\s*(?:k|đ|vnđ|d)?))?$/i;

  const m1 = cleaned.match(regexQtyAndPrice);
  if (m1) {
    const rawPrefixName = m1[1].replace(/^[\d]+[\.\)]\s*/, '').replace(/[\-|:]$/, '').trim();
    const qtyCandidate = parseInt(m1[2], 10) || 1;
    const hasExplicitQtyPrefix = /(?:^|\s)(?:sl\s*[:\-]?|[x×])\s*\d{1,4}\b/i.test(
      cleaned.slice(m1[1].length)
    );
    const hasTwoMoneyNumbers = Boolean(m1[4]);
    const isNumberPartOfProductName =
      !hasExplicitQtyPrefix &&
      !hasTwoMoneyNumbers &&
      /(?:^|\s)(?:combo|set|mẫu|bàn|bia)\s*$/i.test(rawPrefixName);

    if (!isNumberPartOfProductName) {
      let uPrice = normalizeMoneyNumber(m1[3]);
      let sub = m1[4] ? normalizeMoneyNumber(m1[4]) : 0;
      if (uPrice > 0 && uPrice < 1000) uPrice *= 1000;
      if (sub > 0 && sub < 1000) sub *= 1000;

      if (uPrice >= 1000) {
        const qty = Math.max(1, qtyCandidate);
        if (sub === 0) {
          sub = qty * uPrice;
        } else if (uPrice > sub && qty > 1) {
          const tmp = sub;
          sub = uPrice;
          uPrice = tmp;
        } else {
          sub = qty * uPrice;
        }

        const split = splitProductNameAndInlineNote(
          rawPrefixName,
          existingProducts,
          customCategories
        );
        if (split.productName) {
          return {
            productName: split.productName,
            note: split.note || '',
            category: split.category,
            quantity: qty,
            unitPrice: uPrice,
            subtotal: sub,
          };
        }
      }
    }
  }

  // 2. Leading quantity pattern: "15 lon Bia Tiger Lùn 22k" or "2 Gà biển kho nghệ làm cay 129000"
  const regexLeadingQty =
    /^(\d{1,4})\s*(?:lon|chai|phần|đĩa|dĩa|nồi|cái|ly|ca|con|suất)?\s+(.+?)\s+(?:giá\s*[:\-]?\s*|[\-x×|:@]\s*)?(\d[\d.,]*\s*(?:k|đ|vnđ|d)?)(?:\s+(\d[\d.,]*\s*(?:k|đ|vnđ|d)?))?$/i;
  const m2 = cleaned.match(regexLeadingQty);
  if (m2 && !wasChevronWrapped) {
    const qty = Math.max(1, parseInt(m2[1], 10) || 1);
    const rawMiddleName = m2[2].replace(/[\-|:]$/, '').trim();
    let uPrice = normalizeMoneyNumber(m2[3]);
    let sub = m2[4] ? normalizeMoneyNumber(m2[4]) : 0;
    if (uPrice > 0 && uPrice < 1000) uPrice *= 1000;
    if (sub > 0 && sub < 1000) sub *= 1000;

    if (rawMiddleName && uPrice >= 1000) {
      if (sub === 0) sub = qty * uPrice;
      else if (uPrice > sub && qty > 1) {
        const tmp = sub;
        sub = uPrice;
        uPrice = tmp;
      } else {
        sub = qty * uPrice;
      }

      const split = splitProductNameAndInlineNote(
        rawMiddleName,
        existingProducts,
        customCategories
      );
      if (split.productName) {
        return {
          productName: split.productName,
          note: split.note || '',
          category: split.category,
          quantity: qty,
          unitPrice: uPrice,
          subtotal: sub,
        };
      }
    }
  }

  // 3. Single-line Name + Price (Quantity = 1 implicitly):
  const regexNameAndSinglePrice =
    /^(.+?)\s+(?:giá(?:\s*bán)?\s*[:\-=]?\s*|[\-|:=]\s*)?(\d[\d.,]*)\s*(k|đ|vnđ|d)?$/i;
  const m3 = cleaned.match(regexNameAndSinglePrice);
  if (m3 && !wasChevronWrapped) {
    const rawNamePart = m3[1]
      .replace(/^[\d]+[\.\)]\s*/, '')
      .replace(/\s+(?:giá|đơn giá|thành tiền)\s*[:\-=]?\s*$/i, '')
      .replace(/[\-|:=]$/, '')
      .trim();
    let uPrice = normalizeMoneyNumber(m3[2] + (m3[3] || ''));
    if (uPrice > 0 && uPrice < 1000) uPrice *= 1000;

    if (rawNamePart && /[a-zA-ZÀ-ỹ]/.test(rawNamePart) && uPrice >= 1000) {
      const split = splitProductNameAndInlineNote(
        rawNamePart,
        existingProducts,
        customCategories
      );
      if (split.productName) {
        return {
          productName: split.productName,
          note: split.note || '',
          category: split.category,
          quantity: 1,
          unitPrice: uPrice,
          subtotal: uPrice,
        };
      }
    }
  }

  return null;
}

function normalizeTableName(rawTable: string): string {
  const cleaned = rawTable
    .replace(/\b(?:phiếu\s*tính\s*tiền|phiếu\s*thanh\s*toán|hóa\s*đơn\s*bán\s*hàng|hóa\s*đơn\s*thanh\s*toán|hóa\s*đơn)\b.*$/i, '')
    .replace(/^[=\-*_~><:\s]+|[=\-*_~><:\s]+$/g, '')
    .trim();
  if (!cleaned) return '';
  if (/^bàn\b/i.test(cleaned)) {
    return 'Bàn ' + cleaned.replace(/^bàn\s*/i, '').trim();
  }
  return cleaned;
}

function isNumericOrPercentPosLine(s: string): boolean {
  const t = (s || '').trim();
  if (!t) return false;
  return /^\d[\d.,]*$/.test(t) || /^\-?\d+(?:[.,]\d+)?\s*%$/.test(t);
}

/**
 * Parses a multi-line POS item block (with or without SPxxxxxx code):
 * Supports:
 * - 6 numeric/percent lines: [qty, originalPrice, discountAmt, discountPct%, sellPrice, subtotal]
 *   e.g.:
 *   Gà hấp hành nửa con
 *   1
 *   319,000
 *   140,000
 *   43.89%
 *   179,000
 *   179,000
 * - 5 numeric/percent lines: [qty, originalPrice, discountAmtOrPct, sellPrice, subtotal]
 * - 4 numeric lines: [qty, originalPrice, sellPrice, subtotal]
 * - 3 numeric lines: [qty, sellPrice, subtotal]
 */
function parseMultiLinePosItemBlock(
  blockLines: string[],
  existingProducts?: ProductRecord[],
  customCategories?: string[]
): ExtractedBillItem | null {
  if (blockLines.length < 2) return null;
  const rawDishName = blockLines[0].trim();
  const rest = blockLines.slice(1);

  let numericTailCount = 0;
  for (let r = rest.length - 1; r >= 0; r--) {
    if (isNumericOrPercentPosLine(rest[r])) {
      numericTailCount++;
    } else {
      break;
    }
  }

  if (numericTailCount === 0) return null;

  const tailLen =
    numericTailCount >= 6
      ? 6
      : numericTailCount === 5
      ? 5
      : numericTailCount === 4
      ? 4
      : numericTailCount === 3
      ? 3
      : numericTailCount;

  const noteLines = rest.slice(0, Math.max(0, rest.length - tailLen));
  const numLines = rest.slice(Math.max(0, rest.length - tailLen));

  let qty = 1;
  let origPrice = 0;
  let explicitPct: number | undefined;
  let uPrice = 0;
  let sub = 0;

  const extractPctValue = (str: string): number | undefined => {
    const m = str.trim().match(/^\-?(\d+(?:[.,]\d+)?)\s*%$/);
    if (!m) return undefined;
    return parseFloat(m[1].replace(',', '.'));
  };

  if (numLines.length >= 6) {
    qty = Math.max(1, parseInt(numLines[0].replace(/[^\d]/g, ''), 10) || 1);
    origPrice = normalizeMoneyNumber(numLines[1]);
    const pct2 = extractPctValue(numLines[2]);
    const pct3 = extractPctValue(numLines[3]);
    explicitPct = pct3 !== undefined ? pct3 : pct2;
    uPrice = normalizeMoneyNumber(numLines[4]);
    sub = normalizeMoneyNumber(numLines[5]);
  } else if (numLines.length === 5) {
    qty = Math.max(1, parseInt(numLines[0].replace(/[^\d]/g, ''), 10) || 1);
    origPrice = normalizeMoneyNumber(numLines[1]);
    explicitPct = extractPctValue(numLines[2]);
    uPrice = normalizeMoneyNumber(numLines[3]);
    sub = normalizeMoneyNumber(numLines[4]);
  } else if (numLines.length === 4) {
    qty = Math.max(1, parseInt(numLines[0].replace(/[^\d]/g, ''), 10) || 1);
    origPrice = normalizeMoneyNumber(numLines[1]);
    uPrice = normalizeMoneyNumber(numLines[2]) || origPrice;
    sub = normalizeMoneyNumber(numLines[3]);
  } else if (numLines.length === 3) {
    qty = Math.max(1, parseInt(numLines[0].replace(/[^\d]/g, ''), 10) || 1);
    uPrice = normalizeMoneyNumber(numLines[1]);
    sub = normalizeMoneyNumber(numLines[2]);
  } else if (numLines.length === 2) {
    qty = Math.max(1, parseInt(numLines[0].replace(/[^\d]/g, ''), 10) || 1);
    uPrice = normalizeMoneyNumber(numLines[1]);
    sub = qty * uPrice;
  } else if (numLines.length === 1) {
    uPrice = normalizeMoneyNumber(numLines[0]);
    sub = uPrice;
  }

  if (origPrice > 0 && origPrice < 1000) origPrice *= 1000;
  if (uPrice > 0 && uPrice < 1000) uPrice *= 1000;
  if (sub > 0 && sub < 1000) sub *= 1000;
  if (sub === 0 && uPrice > 0) sub = qty * uPrice;
  if (uPrice > 0 && sub !== qty * uPrice) sub = qty * uPrice;

  if (uPrice <= 0) return null;

  const discInfo =
    origPrice > uPrice
      ? formatItemDiscountNote(origPrice, uPrice, explicitPct)
      : null;

  const split = splitProductNameAndInlineNote(
    rawDishName,
    existingProducts,
    customCategories
  );
  const combinedNote = [
    split.note,
    ...noteLines.map((n) => n.trim()),
    discInfo?.discountNote,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!split.productName) return null;

  return {
    productName: split.productName,
    note: combinedNote,
    category: split.category,
    quantity: qty,
    unitPrice: uPrice,
    subtotal: sub,
    originalUnitPrice: discInfo?.originalUnitPrice,
    discountAmount: discInfo?.discountAmount,
    discountPercent: discInfo?.discountPercent,
  };
}

/**
 * Multi-format & Multi-line Bill Text Parser:
 * Supports:
 * - Format 1 (VỊNH QUÁN / Bill in nhiệt): Bắt đầu từ "Tên hàng Đ.Giá SL Thành tiền", đọc "Đ.Giá x SL Thành tiền", chiết khấu, tổng cộng, số bàn (VD: Bàn 24)
 * - Format 2 (KiotViet / POS copy): Bắt đầu từ "Phòng/bàn: BÀN 30" và các mã SP (SP010124...), tách tên món, ghi chú dòng dưới (VD: "3 lạng", "5lạng nấu thơm cà", "20k"), SL, đơn giá, thành tiền
 * - Format 3 (Bill Combo >>> ... <<< và ghi chú món trên cùng 1 dòng)
 * - Mặc định hình thức thanh toán là Tiền mặt ("cash") để người dùng chọn thủ công (Tiền mặt / Chuyển khoản / Công nợ)
 */
export function parseRawTextToBillJSON(
  rawText: string,
  defaultDate: string,
  existingProducts?: ProductRecord[],
  customCategories?: string[]
): ExtractedBillJSON {
  const rawLines = (rawText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const fallbackYear =
    (defaultDate && defaultDate.slice(0, 4)) || String(new Date().getFullYear());

  let calendarDate = defaultDate || getCurrentBusinessDate();
  let checkInTime = '';
  let checkOutTime = '';
  let dateIsCheckoutDate = false;
  let tableName = '';
  // Mặc định là tiền mặt ('cash'); người dùng tự chọn Tiền mặt / Chuyển khoản / Công nợ trên giao diện
  let paymentType: PaymentType = 'cash';
  let debtorName = '';
  let explicitDiscountAmount = 0;
  let explicitDiscountPercent = 0;
  let explicitTotalAmount = 0;

  const fullText = rawText || '';

  // 1. Extract Table Name (e.g., "BÀN 24 PHIẾU TÍNH TIỀN" -> "Bàn 24", or "Phòng/bàn:\nBÀN 30" -> "Bàn 30")
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (/^(?:phòng\s*\/\s*bàn|số\s*bàn|bàn\s*số)\s*[:\-]?\s*$/i.test(line) && rawLines[i + 1]) {
      tableName = normalizeTableName(rawLines[i + 1]);
      break;
    }
    const kvTable = line.match(/^(?:phòng\s*\/\s*bàn|số\s*bàn|bàn)\s*[:\-]\s*(.+)$/i);
    if (kvTable) {
      tableName = normalizeTableName('Bàn ' + kvTable[1]);
      break;
    }
    const inlineTable = line.match(/\b(BÀN\s+(?:VIP\s*)?[A-Z0-9À-ỹ]+)\b/i);
    if (inlineTable) {
      tableName = normalizeTableName(inlineTable[1]);
      break;
    }
  }

  // 2. Extract Date (YYYY-MM-DD, DD/MM/YYYY, or short DD/MM)
  const ymdMatch = fullText.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  const dmyFullMatch = fullText.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/);
  const dmyShortMatch = fullText.match(
    /(?:ngày|date|bill ngày|hđ ngày)\s*[:\-]?\s*(\d{1,2})[\/\-](\d{1,2})(?![\/\-]\d)/i
  );

  if (ymdMatch) {
    calendarDate = `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  } else if (dmyFullMatch) {
    const d = dmyFullMatch[1].padStart(2, '0');
    const m = dmyFullMatch[2].padStart(2, '0');
    calendarDate = `${dmyFullMatch[3]}-${m}-${d}`;
  } else if (dmyShortMatch) {
    const d = dmyShortMatch[1].padStart(2, '0');
    const m = dmyShortMatch[2].padStart(2, '0');
    calendarDate = `${fallbackYear}-${m}-${d}`;
  }

  // 3. Extract Check-in / Check-out Times (supports same-line and next-line like "Giờ đến:\n26/09/2026 16:41")
  const checkInMatch = fullText.match(
    /(?:giờ\s*vào|giờ\s*đến|vào\s*lúc|tg\s*vào|check\s*in|mở\s*bàn)\s*[:\-]?\s*(?:(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](20\d{2}))?\s+)?([01]?\d|2[0-3])\s*[:hH]\s*([0-5]\d)?/i
  );
  if (checkInMatch) {
    const hh = String(checkInMatch[4]).padStart(2, '0');
    const mm = String(checkInMatch[5] || '00').padStart(2, '0');
    checkInTime = `${hh}:${mm}`;
    if (checkInMatch[1] && checkInMatch[2]) {
      const yr = checkInMatch[3] || fallbackYear;
      calendarDate = `${yr}-${checkInMatch[2].padStart(2, '0')}-${checkInMatch[1].padStart(2, '0')}`;
      dateIsCheckoutDate = false;
    }
  }

  const checkOutMatch = fullText.match(
    /(?:giờ\s*ra|thời\s*gian\s*\(\s*giờ\s*đi\s*\)|giờ\s*đi|ra\s*lúc|tg\s*ra|check\s*out|giờ\s*thanh\s*toán|giờ\s*in)\s*[:\-]?\s*(?:(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](20\d{2}))?\s+)?([01]?\d|2[0-3])\s*[:hH]\s*([0-5]\d)?/i
  );
  if (checkOutMatch) {
    const hh = String(checkOutMatch[4]).padStart(2, '0');
    const mm = String(checkOutMatch[5] || '00').padStart(2, '0');
    checkOutTime = `${hh}:${mm}`;
    if (checkOutMatch[1] && checkOutMatch[2] && !checkInMatch?.[1]) {
      const yr = checkOutMatch[3] || fallbackYear;
      calendarDate = `${yr}-${checkOutMatch[2].padStart(2, '0')}-${checkOutMatch[1].padStart(2, '0')}`;
      dateIsCheckoutDate = true;
    }
  }

  if (!checkInTime && !checkOutTime) {
    const rangeTimeMatch = fullText.match(
      /(?:giờ(?:\s*ra\s*vào|\s*vào\s*ra)?|thời\s*gian|time)\s*[:\-]?\s*([01]?\d|2[0-3])\s*[:hH]\s*([0-5]\d)?\s*(?:\-|–|->|~|đến|tới)\s*([01]?\d|2[0-3])\s*[:hH]\s*([0-5]\d)?/i
    );
    if (rangeTimeMatch) {
      checkInTime = `${String(rangeTimeMatch[1]).padStart(2, '0')}:${String(rangeTimeMatch[2] || '00').padStart(2, '0')}`;
      checkOutTime = `${String(rangeTimeMatch[3]).padStart(2, '0')}:${String(rangeTimeMatch[4] || '00').padStart(2, '0')}`;
    } else {
      const singleTimeMatch =
        fullText.match(
          /(?:giờ|lúc|time)\s*[:\-]?\s*([01]?\d|2[0-3])\s*[:hH]\s*([0-5]\d)\b/i
        ) ||
        fullText.match(
          /\b(?:\d{1,2}[\/\-]\d{1,2}(?:[\/\-]20\d{2})?|20\d{2}-\d{2}-\d{2})\s+(?:lúc\s*)?([01]?\d|2[0-3])\s*[:hH]\s*([0-5]\d)\b/i
        );
      if (singleTimeMatch) {
        checkInTime = `${String(singleTimeMatch[1]).padStart(2, '0')}:${String(singleTimeMatch[2] || '00').padStart(2, '0')}`;
      }
    }
  }

  // Apply 09:00 AM -> 08:00 AM next day shift rule!
  const { businessDate: billDate } = resolveBusinessBillDate(
    calendarDate,
    checkInTime,
    checkOutTime,
    dateIsCheckoutDate
  );

  // Only set paymentType if there is an explicit "Hình thức:" or "Thanh toán:" header line,
  // otherwise always default to 'cash' (Tiền mặt) as requested by user!
  for (const l of rawLines) {
    if (/^(?:hình\s*thức|thanh\s*toán)\s*[:\-]/i.test(l)) {
      if (/(chuyển\s*khoản|\bck\b|vietqr|banking)/i.test(l)) {
        paymentType = 'transfer';
      } else if (/(công\s*nợ|ghi\s*nợ|ký\s*nợ|khách\s*nợ)/i.test(l)) {
        paymentType = 'debt';
        const cleanedDebtor = l
          .replace(/(hình\s*thức|thanh\s*toán|công\s*nợ|ghi\s*nợ|ký\s*nợ|khách\s*nợ|nợ)\s*[:\-]?\s*/gi, '')
          .trim();
        if (cleanedDebtor && cleanedDebtor.length <= 80) {
          debtorName = cleanedDebtor;
        }
      }
    }
  }

  // 4. Check if this bill is Format 2 (POS / KiotViet multi-line blocks with SP codes like SP010124)
  const hasSpCodes = rawLines.some((l) => /^SP\d{3,}$/i.test(l));
  if (hasSpCodes) {
    const spItems: ExtractedBillItem[] = [];

    // Extract multi-line totals & discount in Format 2
    for (let i = 0; i < rawLines.length; i++) {
      const l = rawLines[i];
      if (/^(?:giảm\s*giá|chiết\s*khấu)\b/i.test(l)) {
        const sameLineVal = normalizeMoneyNumber(l);
        if (sameLineVal > 0) {
          explicitDiscountAmount = sameLineVal < 1000 ? sameLineVal * 1000 : sameLineVal;
        } else if (rawLines[i + 1] && /^\d[\d.,]*$/.test(rawLines[i + 1])) {
          const nextVal = normalizeMoneyNumber(rawLines[i + 1]);
          explicitDiscountAmount = nextVal > 0 && nextVal < 1000 ? nextVal * 1000 : nextVal;
        }
      }
      if (/^(?:khách\s*cần\s*trả|tổng\s*cộng|tổng\s*tiền\s*hàng)\b/i.test(l)) {
        const cleanedNoParens = l.replace(/\(\d+\)/g, '');
        const sameLineVal = normalizeMoneyNumber(cleanedNoParens);
        if (sameLineVal >= 1000) {
          explicitTotalAmount = sameLineVal;
        } else if (rawLines[i + 1] && /^\d[\d.,]*$/.test(rawLines[i + 1])) {
          const nextVal = normalizeMoneyNumber(rawLines[i + 1]);
          if (nextVal >= 1000) {
            explicitTotalAmount = nextVal;
          }
        }
      }
    }

    // Parse each SPxxxxxx block
    const isFooterStartLine = (s: string) =>
      /^(?:chưa\s*có\s*ghi\s*chú|hàng\s*đã\s*hủy|tổng\s*tiền\s*hàng|giảm\s*giá|chiết\s*khấu|khách\s*cần\s*trả|khách\s*đã\s*trả|tổng\s*cộng)\b/i.test(
        s
      );

    let idx = 0;
    while (idx < rawLines.length) {
      if (!/^SP\d{3,}$/i.test(rawLines[idx])) {
        idx++;
        continue;
      }
      // Found SP code at idx
      const blockLines: string[] = [];
      let k = idx + 1;
      while (k < rawLines.length && !/^SP\d{3,}$/i.test(rawLines[k]) && !isFooterStartLine(rawLines[k])) {
        blockLines.push(rawLines[k]);
        k++;
      }
      idx = k;

      if (blockLines.length >= 2) {
        const parsedSpItem = parseMultiLinePosItemBlock(
          blockLines,
          existingProducts,
          customCategories
        );
        if (parsedSpItem) {
          spItems.push(parsedSpItem);
        }
      }
    }

    if (spItems.length > 0) {
      const subtotalAmount = spItems.reduce((acc, it) => acc + it.subtotal, 0);
      const discountAmount = Math.min(subtotalAmount, Math.max(0, explicitDiscountAmount));
      const totalAmount = Math.max(0, subtotalAmount - discountAmount);
      return {
        billInfo: {
          billDate,
          rawDate: calendarDate !== billDate ? calendarDate : undefined,
          checkInTime: checkInTime || undefined,
          checkOutTime: checkOutTime || undefined,
          tableName: tableName || undefined,
          paymentType,
          debtorName: paymentType === 'debt' ? debtorName : '',
          subtotalAmount,
          discountAmount,
          totalAmount: totalAmount || explicitTotalAmount,
        },
        items: spItems,
      };
    }
  }

  // 5. Find if there is an explicit table header like "Tên hàng Đ.Giá SL Thành tiền" (Format 1)
  // If present, start extracting items strictly AFTER that header line!
  let bodyStartIdx = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const cleaned = cleanDecorativeLine(rawLines[i]);
    if (
      /^(?:stt\s+)?(?:tên\s*hàng|tên\s*món|mặt\s*hàng|sản\s*phẩm)\b.*(?:đ\.?\s*giá|đơn\s*giá|sl|số\s*lượng|thành\s*tiền)/i.test(
        cleaned
      )
    ) {
      bodyStartIdx = i + 1;
      break;
    }
  }

  const items: ExtractedBillItem[] = [];
  let unpricedBuffer: Array<{ text: string; isExplicitNote: boolean }> = [];

  const flushBufferToLastItemAsNote = () => {
    if (unpricedBuffer.length === 0) return;
    if (items.length > 0) {
      const lastItem = items[items.length - 1];
      const extraNotes = unpricedBuffer.map((b) => b.text).filter(Boolean);
      if (extraNotes.length > 0) {
        lastItem.note = [lastItem.note, ...extraNotes].filter(Boolean).join(', ');
      }
    }
    unpricedBuffer = [];
  };

  for (let i = bodyStartIdx; i < rawLines.length; i++) {
    const rawLine = rawLines[i];

    // Skip pure decorative lines like "======================" or "----------"
    if (isPureDecorativeLine(rawLine)) {
      continue;
    }

    const cleanedLine = cleanDecorativeLine(rawLine);
    if (!cleanedLine) continue;

    // Check if it's a Discount / Chiết khấu line
    if (/^(?:chiết\s*khấu|giảm\s*giá|khuyến\s*mãi|giảm\s*bill|voucher|discount)\b/i.test(cleanedLine)) {
      flushBufferToLastItemAsNote();
      const pctMatch = cleanedLine.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
      if (pctMatch) {
        explicitDiscountPercent = parseFloat(pctMatch[1]) || 0;
      }
      const withoutPct = cleanedLine.replace(/\d{1,2}(?:\.\d+)?\s*%/g, '');
      let discMoney = normalizeMoneyNumber(withoutPct);
      if (discMoney > 0 && discMoney < 1000) discMoney *= 1000;
      if (discMoney >= 1000) {
        explicitDiscountAmount = discMoney;
      }
      continue;
    }

    // Check if it's a Grand Total / Subtotal line
    if (/^(?:tổng\s*cộng|tổng\s*tiền|tổng\s*thanh\s*toán|khách\s*phải\s*trả|khách\s*cần\s*trả|thực\s*thu|tổng\s*bill|total)\b/i.test(cleanedLine)) {
      flushBufferToLastItemAsNote();
      let tot = normalizeMoneyNumber(cleanedLine);
      if (tot > 0 && tot < 1000) tot *= 1000;
      if (tot >= 1000) {
        explicitTotalAmount = tot;
      }
      continue;
    }

    if (/^(?:tạm\s*tính|cộng\s*tiền\s*hàng|tổng\s*tạm\s*tính|tổng\s*tiền\s*hàng|khách\s*đã\s*trả|hàng\s*đã\s*hủy|chưa\s*có\s*ghi\s*chú)\b/i.test(cleanedLine)) {
      flushBufferToLastItemAsNote();
      continue;
    }

    // Skip metadata / header lines (including store name, address ĐC:, phone ĐT:, order code 110-88, BÀN 24 PHIẾU TÍNH TIỀN)
    if (
      /^(?:vịnh\s*quán|hóa\s*đơn|phiếu\s*tính\s*tiền|phiếu\s*thanh\s*toán|bill\b|ngày(?:\s*bán|\s*in|\s*thanh\s*toán)?\s*[:\-]|giờ\s*(?:vào|ra|đến|đi|in|thanh\s*toán)?\s*[:\-]|thời\s*gian|bàn\s+\d+|phòng\s*\/\s*bàn|bàn\s*[:\-]|khu\s*vực\s*[:\-]|thu\s*ngân|nhân\s*viên|người\s*tạo|người\s*nhận|kênh\s*bán|bảng\s*giá|số\s*khách|mã\s*đặt\s*hàng|phục\s*vụ|thanh\s*toán\s*[:\-]|hình\s*thức\s*[:\-]|chuyển\s*khoản\s*[:\-]?$|tiền\s*mặt\s*[:\-]?$|công\s*nợ\s*[:\-]|ghi\s*nợ\s*[:\-]|ký\s*nợ\s*[:\-]|khách\s*hàng\s*[:\-]|khách\s*lẻ$|hoàn\s*thành$|chi\s*nhánh|đc\s*[:\-]|địa\s*chỉ\s*[:\-]|sđt\s*[:\-]|đt\s*[:\-]|điện\s*thoại|cảm\s*ơn|hẹn\s*gặp\s*lại|stt\s+tên\s*món|tên\s*món\s+sl|tên\s*hàng\s+đ\.?\s*giá)/i.test(
        cleanedLine
      ) ||
      /^\d{2,4}\-\d{1,4}$/.test(cleanedLine) ||
      /^HD\d{4,}$/i.test(cleanedLine)
    ) {
      continue;
    }

    // Check if this line is a PRICE-ONLY line (e.g., "giá 459000" or "1 x 459.000 = 459.000")
    const priceOnly = parsePriceOnlyLine(rawLine);
    if (priceOnly) {
      if (unpricedBuffer.length > 0) {
        const firstLine = unpricedBuffer[0].text;
        const extraNoteLines = unpricedBuffer.slice(1).map((b) => b.text).filter(Boolean);
        const split = splitProductNameAndInlineNote(
          firstLine,
          existingProducts,
          customCategories
        );
        const combinedNotes = [split.note, ...extraNoteLines].filter(Boolean).join(', ');
        items.push({
          productName: split.productName || firstLine,
          note: combinedNotes,
          category: split.category,
          quantity: priceOnly.quantity,
          unitPrice: priceOnly.unitPrice,
          subtotal: priceOnly.subtotal,
        });
        unpricedBuffer = [];
      } else if (items.length > 0 && items[items.length - 1].unitPrice === 0) {
        const last = items[items.length - 1];
        last.quantity = priceOnly.quantity;
        last.unitPrice = priceOnly.unitPrice;
        last.subtotal = priceOnly.subtotal;
      }
      continue;
    }

    // Check if this line is an explicit note line: e.g. ">>> Cơm chiên hải sản <<<" or "Ghi chú: làm cay"
    const isChevronNote = /^>{2,}.*<{2,}$/.test(rawLine.trim()) || /^>{2,}/.test(rawLine.trim());
    const isExplicitNotePrefix = /^(?:ghi\s*chú|note|yêu\s*cầu|yc)\s*[:\-]\s*/i.test(cleanedLine);

    if (isChevronNote || isExplicitNotePrefix) {
      const noteContent = cleanedLine
        .replace(/^(?:ghi\s*chú|note|yêu\s*cầu|yc)\s*[:\-]\s*/i, '')
        .trim();
      if (noteContent) {
        unpricedBuffer.push({ text: noteContent, isExplicitNote: true });
      }
      continue;
    }

    // Check if this line is a Key-Value dish name or quantity line
    const kvDishMatch = cleanedLine.match(/^(?:tên\s*món|món\s*ăn|món|sản\s*phẩm)\s*[:\-]\s*(.+)$/i);
    if (kvDishMatch) {
      flushBufferToLastItemAsNote();
      const dishRaw = kvDishMatch[1].trim();
      const asFull = parseFullItemLine(dishRaw, existingProducts, customCategories);
      if (asFull) {
        items.push(asFull);
      } else if (dishRaw) {
        unpricedBuffer.push({ text: dishRaw, isExplicitNote: false });
      }
      continue;
    }

    const kvQtyOnlyMatch = cleanedLine.match(/^(?:số\s*lượng|sl)\s*[:\-]\s*(\d{1,4})\b$/i);
    if (kvQtyOnlyMatch) {
      const qVal = Math.max(1, parseInt(kvQtyOnlyMatch[1], 10) || 1);
      if (unpricedBuffer.length === 0 && items.length > 0) {
        const last = items[items.length - 1];
        last.quantity = qVal;
        last.subtotal = last.quantity * last.unitPrice;
      }
      continue;
    }

    // Check if this line is a FULL ITEM LINE (contains both dish name and price)
    const fullItem = parseFullItemLine(rawLine, existingProducts, customCategories);
    if (fullItem) {
      // Check if unpricedBuffer has wrapped dish name lines (non-explicit notes, e.g. "Gỏi bò bóp thấu" before "Bê 89,000 x 1 89,000")
      const explicitNotes = unpricedBuffer.filter((b) => b.isExplicitNote);
      const wrappedNameLines = unpricedBuffer.filter((b) => !b.isExplicitNote);

      if (explicitNotes.length > 0 && items.length > 0) {
        const lastItem = items[items.length - 1];
        lastItem.note = [lastItem.note, ...explicitNotes.map((b) => b.text)]
          .filter(Boolean)
          .join(', ');
      }

      if (wrappedNameLines.length > 0) {
        const prefixDish = wrappedNameLines.map((b) => b.text).join(' ').trim();
        const lowerFull = fullItem.productName.toLowerCase().trim();
        const lowerPrefix = prefixDish.toLowerCase().trim();

        // If fullItem.productName already starts with prefixDish (e.g., "Rau rừng" -> "Rau rừng xào bò" or "Gà hấp" -> "Gà hấp hành nửa con"),
        // then fullItem.productName is already the complete specific dish name! Do not overwrite it with the short prefix.
        if (!lowerFull.startsWith(lowerPrefix)) {
          const splitPrefix = splitProductNameAndInlineNote(
            prefixDish,
            existingProducts,
            customCategories
          );
          // E.g. prefixDish = "Gỏi bò bóp thấu", fullItem.productName = "Bê" -> productName: "Gỏi bò bóp thấu", note: "Bê"
          const mergedNote = [splitPrefix.note, fullItem.productName, fullItem.note]
            .filter(Boolean)
            .join(', ');
          fullItem.productName = splitPrefix.productName || prefixDish;
          fullItem.note = mergedNote;
          fullItem.category =
            splitPrefix.category || inferCategory(fullItem.productName, customCategories);
        }
      }

      unpricedBuffer = [];
      items.push(fullItem);
      continue;
    }

    // Check if this line is the start of a multi-line POS block WITHOUT SPxxxxxx code:
    // e.g.
    // Gà hấp hành nửa con
    // 1
    // 319,000
    // 140,000
    // 43.89%
    // 179,000
    // 179,000
    if (!isNumericOrPercentPosLine(cleanedLine) && /[a-zA-ZÀ-ỹ]/.test(cleanedLine)) {
      let scanIdx = i + 1;
      const optionalNotes: string[] = [];
      // Allow up to 1 non-numeric note line before the numeric tail if that line is followed by >= 3 numeric/percent lines
      if (
        scanIdx < rawLines.length &&
        !isNumericOrPercentPosLine(rawLines[scanIdx]) &&
        !parseFullItemLine(rawLines[scanIdx], existingProducts, customCategories) &&
        scanIdx + 1 < rawLines.length &&
        isNumericOrPercentPosLine(rawLines[scanIdx + 1])
      ) {
        optionalNotes.push(rawLines[scanIdx]);
        scanIdx++;
      }

      const numTail: string[] = [];
      while (
        scanIdx < rawLines.length &&
        numTail.length < 6 &&
        isNumericOrPercentPosLine(rawLines[scanIdx])
      ) {
        numTail.push(rawLines[scanIdx]);
        scanIdx++;
      }

      if (numTail.length >= 3 && /^\d{1,4}$/.test(numTail[0].trim())) {
        const blockCandidate = [cleanedLine, ...optionalNotes, ...numTail];
        const multiItem = parseMultiLinePosItemBlock(
          blockCandidate,
          existingProducts,
          customCategories
        );
        if (multiItem) {
          flushBufferToLastItemAsNote();
          items.push(multiItem);
          i = scanIdx - 1;
          continue;
        }
      }
    }

    // Check if this line is a standalone cooking modifier right after a full item (e.g. "làm cay", "ít hành")
    const isStandaloneCookingModifier =
      /^(?:làm|ít|không|ko|thêm|nhiều|bỏ|để|chặt|nấu|chiên|nướng|hấp|xào|luộc|mang|đem)\s+(?:cay|cay nhiều|cay ít|vừa cay|hành|tỏi|tiêu|ớt|đá|đường|mặn|ngọt|nhạt|chua|giòn|mềm|kỹ|tái|chín|nhỏ|to|nguyên con|riêng|về|mang về|đem về|nước mắm|muối ớt|sa tế|bơ|mỡ)/i.test(
        cleanedLine
      );
    if (isStandaloneCookingModifier && unpricedBuffer.length === 0 && items.length > 0) {
      const lastItem = items[items.length - 1];
      lastItem.note = [lastItem.note, cleanedLine].filter(Boolean).join(', ');
      continue;
    }

    // Check if this line starts a new multi-line block (e.g. "combo 2 ======================")
    const hasTrailingEqualsOrDashes = /[=\-]{4,}\s*$/.test(rawLine.trim());
    if (hasTrailingEqualsOrDashes && unpricedBuffer.length > 0 && items.length > 0) {
      flushBufferToLastItemAsNote();
    }

    unpricedBuffer.push({ text: cleanedLine, isExplicitNote: false });
  }

  if (unpricedBuffer.length > 0) {
    flushBufferToLastItemAsNote();
  }

  const subtotalAmount = items.reduce((acc, it) => acc + it.subtotal, 0);
  let discountAmount = explicitDiscountAmount;
  if (discountAmount === 0 && explicitDiscountPercent > 0 && subtotalAmount > 0) {
    discountAmount = Math.round((subtotalAmount * explicitDiscountPercent) / 100);
  }
  discountAmount = Math.min(subtotalAmount, Math.max(0, discountAmount));

  let totalAmount = Math.max(0, subtotalAmount - discountAmount);
  if (subtotalAmount === 0 && explicitTotalAmount > 0) {
    totalAmount = explicitTotalAmount;
  } else if (
    explicitTotalAmount > 0 &&
    discountAmount === 0 &&
    subtotalAmount > explicitTotalAmount
  ) {
    discountAmount = subtotalAmount - explicitTotalAmount;
    totalAmount = explicitTotalAmount;
  }

  return {
    billInfo: {
      billDate,
      rawDate: calendarDate !== billDate ? calendarDate : undefined,
      checkInTime: checkInTime || undefined,
      checkOutTime: checkOutTime || undefined,
      tableName: tableName || undefined,
      paymentType,
      debtorName: paymentType === 'debt' ? debtorName : '',
      subtotalAmount,
      discountAmount,
      totalAmount,
    },
    items,
  };
}

export const parseInvoiceText = parseRawTextToBillJSON;
export const parseBulkProductsInput = parseBulkProductsByLogic;

export const SAMPLE_BILL_TEMPLATES = [
  {
    id: 'sample_vinh_quan_ban18_discount',
    label: 'Mẫu Bill Vịnh Quán (Bàn 18 - Có Món Giảm Giá 43.89%)',
    description:
      'Tự nhận diện Gà hấp hành nửa con (Giá gốc 319.000đ, giảm 43.89%, giá bán 179.000đ), Tổng: 2.289.000đ',
    rawText: `VỊNH QUÁN
ĐC: 131 Chu Huy Mân, Đà nẵng
ĐT: 0702.444.449
BÀN 18 PHIẾU TÍNH TIỀN
HD004940
Giờ vào: 26/09/2026 17:49 Giờ in: 22:40
Tên hàng Đ.Giá SL Thành tiền
Heiniken bạc lon nhỏ 250ml 22,000 x 65 1,430,000
Nghêu đen hấp 119,000 x 1 119,000
Coca 15,000 x 1 15,000
Lẩu riêu cua bắp bò (nhỏ) 169,000 x 1 169,000
Rau rừng
Rau rừng xào bò 119,000 x 1 119,000
Gà hấp
Gà hấp hành nửa con 179,000 319,000 x 1 179,000
Tôm sú hấp 129,000 x 1 129,000
Thuốc 555 dẹt (vàng) 25,000 x 1 25,000
Thuốc con ngựa 35,000 x 1 35,000
Rau rừng 69,000 x 1 69,000
Chiết khấu: 0
Tổng Cộng: 2,289,000`,
  },
  {
    id: 'sample_vinh_quan_ban24',
    label: 'Mẫu Bill Vịnh Quán (Bàn 24)',
    description: 'Bắt đầu từ "Tên hàng Đ.Giá SL Thành tiền", tách Chíp hấp sả, Gỏi bò bóp thấu (Bê), Tổng: 3.039.000đ',
    rawText: `VỊNH QUÁN
ĐC: 131 Chu Huy Mân, Đà nẵng
ĐT: 0702.444.449
BÀN 24 PHIẾU TÍNH TIỀN
110-88
Giờ vào: 26/09/2026 20:20 Giờ in: 22:47
Tên hàng Đ.Giá SL Thành tiền
Heineken bạc lon 330ml 26,000 x 72 1,872,000
Gỏi bò bóp thấu 89,000 x 1 89,000
Tiger bạc lon 330ml 24,000 x 4 96,000
Sườn heo nướng 169,000 x 2 338,000
Hàu nướng mỡ hành 119,000 x 2 238,000
Sụn gà chiên mắm 89,000 x 1 89,000
Gỏi bò bóp thấu
Bê 89,000 x 1 89,000
Nước suối Aqua 10,000 x 1 10,000
Chíp hấp sả 109,000 x 2 218,000
Tổng tiền hàng: 3,039,000
Chiết khấu: 0
Tổng Cộng: 3,039,000`,
  },
  {
    id: 'sample_pos_ban30',
    label: 'Mẫu Bill POS KiotViet (Bàn 30)',
    description: 'Bắt đầu từ Bàn 30 & mã SP, tự tách ghi chú "3 lạng", "5lạng nấu thơm cà", Tổng: 2.008.000đ',
    rawText: `Khách lẻ
HD004935
Hoàn thành
Chi nhánh trung tâm
Người tạo:
Chủ
Người nhận đơn:
Quyên
Giờ đến:
26/09/2026 16:41
Thời gian (giờ đi):
26/09/2026 19:04
Mã đặt hàng
110-86
Kênh bán:
Khách đến trực tiếp
Bảng giá:
Bảng giá chung
Phòng/bàn:
BÀN 30
Số khách:
1
SP010124
Tiger bạc lon nhỏ 250ml
59
21,000
21,000
1,239,000
SP000238
Khăn lạnh
3
5,000
5,000
15,000
SP010016
Gỏi ốc giác
1
119,000
119,000
119,000
SP010067
Mực cơm chiên mắm
3 lạng
1
165,000
165,000
165,000
SP010101
Cá dìa nấu khế
5lạng nấu thơm cà
1
280,000
280,000
280,000
SP010123
Huda lon
2
18,000
18,000
36,000
SP010038
Cánh gà chiên mắm
1
99,000
99,000
99,000
SP000241
Thuốc con ngựa
1
35,000
35,000
35,000
SP010211
Khách mượn tiền
20k
1
20,000
20,000
20,000
Chưa có ghi chú
Hàng đã hủy sau khi báo bếp: 3 Huda lon, 13 Tiger bạc lon nhỏ 250ml, 3 Khăn lạnh
Tổng tiền hàng (70)
2,008,000
Giảm giá
0
Khách cần trả
2,008,000
Khách đã trả
2,008,000`,
  },
  {
    id: 'sample_combo_and_note',
    label: 'Mẫu Bill Có Ghi Chú Món & Combo (20/08)',
    description: 'Tự động tách ghi chú "làm cay", gộp ghi chú Combo 2 & tính ca bán 9h sáng → 8h sáng hôm sau',
    rawText: `HÓA ĐƠN BÁN HÀNG - BÀN VIP 02
Ngày: 21/08/2026
Giờ vào: 22:15 - Giờ ra: 01:30
Thanh toán: Tiền mặt
gà biển kho nghệ làm cay giá 129000
combo 2 ======================
>>> Cơm chiên hải sản <<<
======================
>>> Càng cua trộn bò <<<
======================
>>> Chip hấp thái <<<
======================
>>> Cá giò kho tiêu <<<
======================
>>> 1 dĩa trái cây <<<
======================
giá 459000
Bia Tiger Lùn x10 lon 22.000đ 220.000đ
Chiết khấu: 28.000đ
Tổng cộng: 780.000đ`,
  },
  {
    id: 'sample_debt_customer',
    label: 'Mẫu Bill Công Nợ (Ghi nợ Khách)',
    description: 'Tự nhận diện từ khóa Ghi nợ & trích xuất tên người nợ -> paymentType: "debt"',
    rawText: `HÓA ĐƠN BÁN HÀNG - BÀN VIP 3
Ngày: ${getCurrentBusinessDate()}
Giờ vào: 20:00 - Giờ ra: 23:30
Hình thức: Ghi nợ: Anh Hoàng (Công ty Xây dựng Minh Phát)
1. Bia Budweiser x36 lon 26.000đ 936.000đ
2. Nước ngọt Pepsi x6 lon 15.000đ 90.000đ
3. Gỏi ngó sen tôm thịt x2 phần 120.000đ 240.000đ
4. Ếch xào sa tế x2 phần 130.000đ 260.000đ
5. Gà hấp lá chanh x2 con 290.000đ 580.000đ
6. Tôm sú hấp bia x2 phần 250.000đ 500.000đ
7. Bò lúc lắc khoai tây x2 đĩa 195.000đ 390.000đ
Tổng cộng: 2.996.000đ`,
  },
];
