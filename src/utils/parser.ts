import { ExtractedBillJSON, ExtractedBillItem, PaymentType, ProductRecord } from '../types';

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
  if (/(tôm|mực|cá\b|cá giò|cua|càng cua|ốc|nghêu|sò|hàu|bạch tuộc|ghẹ|hải sản|chip hấp)/i.test(lower)) {
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

  // 1. Extract explicit parentheses / brackets note: e.g. "Gà biển kho nghệ (làm cay)"
  cleaned = cleaned
    .replace(/\(([^)]+)\)|\[([^\]]+)\]/g, (_m, g1, g2) => {
      const inner = (g1 || g2 || '').trim();
      if (inner) noteParts.push(inner);
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

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

  // 1. Try matching: Name + explicit Qty + UnitPrice + (optional Subtotal)
  // Example: "1. Bia Tiger Lùn x24 lon 22.000đ 528.000đ" or "Gà biển kho nghệ 2 129000 258000"
  // Notice: to avoid "Combo 2 459000" matching "Combo" + qty 2 + price 459000,
  // if the word right before the number is "combo" / "set" / "bàn" / "mẫu" AND there is only ONE price after it,
  // we skip Pattern 1 and let Pattern 3 ("Name + Single Price") handle "Combo 2" as the full name!
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
  // Make sure it's not a sub-item note like "1 dĩa trái cây" (which has NO price at the end!)
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
  // Examples:
  // - "gà biển kho nghệ làm cay giá 129000"
  // - "gà biển kho nghệ làm cay 129.000đ"
  // - "combo 2 giá 459000"
  // - "Combo 2: 459,000"
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

/**
 * Multi-format & Multi-line Bill Text Parser:
 * Extracts:
 * - Ngày tháng (billDate) áp dụng khung giờ bán 09:00 sáng ngày D -> 08:00 sáng ngày D+1
 * - Giờ vào (checkInTime) & Giờ ra (checkOutTime)
 * - Tên món (productName), Ghi chú món (note), Số lượng (quantity), Đơn giá (unitPrice), Thành tiền (subtotal)
 * - Chiết khấu (discountAmount) & Tổng cộng (totalAmount)
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
  let paymentType: PaymentType = 'cash';
  let debtorName = '';
  let explicitDiscountAmount = 0;
  let explicitDiscountPercent = 0;
  let explicitTotalAmount = 0;

  const fullText = rawText || '';

  // 1. Extract Date (YYYY-MM-DD, DD/MM/YYYY, or short DD/MM)
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

  // 2. Extract Check-in / Check-out Times (Giờ vào / Giờ ra)
  const checkInMatch = fullText.match(
    /(?:giờ\s*vào|vào\s*lúc|tg\s*vào|check\s*in|mở\s*bàn)\s*[:\-]?\s*(?:(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](20\d{2}))?\s+)?([01]?\d|2[0-3])\s*[:hH]\s*([0-5]\d)?/i
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
    /(?:giờ\s*ra|ra\s*lúc|tg\s*ra|check\s*out|giờ\s*thanh\s*toán|giờ\s*in)\s*[:\-]?\s*(?:(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](20\d{2}))?\s+)?([01]?\d|2[0-3])\s*[:hH]\s*([0-5]\d)?/i
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

  // Combined time range on one line: e.g. "Giờ: 19:30 - 22:45" or "Thời gian: 21h00 -> 01h30"
  if (!checkInTime && !checkOutTime) {
    const rangeTimeMatch = fullText.match(
      /(?:giờ(?:\s*ra\s*vào|\s*vào\s*ra)?|thời\s*gian|time)\s*[:\-]?\s*([01]?\d|2[0-3])\s*[:hH]\s*([0-5]\d)?\s*(?:\-|–|->|~|đến|tới)\s*([01]?\d|2[0-3])\s*[:hH]\s*([0-5]\d)?/i
    );
    if (rangeTimeMatch) {
      checkInTime = `${String(rangeTimeMatch[1]).padStart(2, '0')}:${String(rangeTimeMatch[2] || '00').padStart(2, '0')}`;
      checkOutTime = `${String(rangeTimeMatch[3]).padStart(2, '0')}:${String(rangeTimeMatch[4] || '00').padStart(2, '0')}`;
    } else {
      // Single time on date/time line: e.g. "Ngày: 21/08/2026 01:30" or "Giờ: 01:30"
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

  // 3. Payment Type & Debtor Name
  if (/(chuyển khoản|\bck\b|mã qr|vietqr|banking)/i.test(fullText)) {
    paymentType = 'transfer';
  }
  if (/(công nợ|ghi nợ|ký nợ|\bnợ\b|khách nợ)/i.test(fullText)) {
    paymentType = 'debt';
    const debtLine = rawLines.find((l) =>
      /(công nợ|ghi nợ|ký nợ|\bnợ\b|khách nợ)/i.test(l)
    );
    if (debtLine) {
      const cleanedDebtor = debtLine
        .replace(/(hình thức|thanh toán|công nợ|ghi nợ|ký nợ|khách nợ|nợ)\s*[:\-]?\s*/gi, '')
        .trim();
      if (cleanedDebtor && cleanedDebtor.length <= 80) {
        debtorName = cleanedDebtor;
      }
    }
  }

  // 4. Filter & Classify Body Lines for Multi-line & Multi-format Item Extraction
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

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];

    // Skip pure decorative lines like "======================" or "----------"
    if (isPureDecorativeLine(rawLine)) {
      continue;
    }

    const cleanedLine = cleanDecorativeLine(rawLine);
    if (!cleanedLine) continue;

    // Check if it's a Discount / Chiết khấu line
    if (/^(?:chiết\s*khấu|giảm\s*giá|khuyến\s*mãi|giảm\s*bill|voucher|discount)\b/i.test(cleanedLine)) {
      const pctMatch = cleanedLine.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
      if (pctMatch) {
        explicitDiscountPercent = parseFloat(pctMatch[1]) || 0;
      }
      // Remove percentage token before extracting money amount
      const withoutPct = cleanedLine.replace(/\d{1,2}(?:\.\d+)?\s*%/g, '');
      let discMoney = normalizeMoneyNumber(withoutPct);
      if (discMoney > 0 && discMoney < 1000) discMoney *= 1000;
      if (discMoney >= 1000) {
        explicitDiscountAmount = discMoney;
      }
      continue;
    }

    // Check if it's a Grand Total / Subtotal line
    if (/^(?:tổng\s*cộng|tổng\s*tiền|tổng\s*thanh\s*toán|khách\s*phải\s*trả|thực\s*thu|tổng\s*bill|total)\b/i.test(cleanedLine)) {
      let tot = normalizeMoneyNumber(cleanedLine);
      if (tot > 0 && tot < 1000) tot *= 1000;
      if (tot >= 1000) {
        explicitTotalAmount = tot;
      }
      continue;
    }

    if (/^(?:tạm\s*tính|cộng\s*tiền\s*hàng|tổng\s*tạm\s*tính)\b/i.test(cleanedLine)) {
      continue;
    }

    // Skip metadata / header lines
    if (
      /^(?:hóa\s*đơn|phiếu\s*thanh\s*toán|bill\b|ngày(?:\s*bán|\s*in|\s*thanh\s*toán)?\s*[:\-]|giờ\s*(?:vào|ra|in|thanh\s*toán)?\s*[:\-]|thời\s*gian\s*[:\-]|bàn\s*[:\-]|khu\s*vực\s*[:\-]|thu\s*ngân|nhân\s*viên|phục\s*vụ|thanh\s*toán\s*[:\-]|hình\s*thức\s*[:\-]|chuyển\s*khoản\s*[:\-]?$|tiền\s*mặt\s*[:\-]?$|công\s*nợ\s*[:\-]|ghi\s*nợ\s*[:\-]|ký\s*nợ\s*[:\-]|khách\s*hàng\s*[:\-]|địa\s*chỉ\s*[:\-]|sđt\s*[:\-]|điện\s*thoại|cảm\s*ơn|hẹn\s*gặp\s*lại|stt\s+tên\s*món|tên\s*món\s+sl)/i.test(
        cleanedLine
      )
    ) {
      continue;
    }

    // Check if this line is a PRICE-ONLY line (e.g., "giá 459000" or "1 x 459.000 = 459.000")
    const priceOnly = parsePriceOnlyLine(rawLine);
    if (priceOnly) {
      if (unpricedBuffer.length > 0) {
        // The first buffered line is the dish name (e.g. "combo 2"), and remaining buffered lines are notes!
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

    // Check if this line is a Key-Value dish name or quantity line (e.g. "Tên món: Gà biển kho nghệ" or "Số lượng: 2")
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
      // Flush any previous unpriced buffer as notes to the preceding item
      flushBufferToLastItemAsNote();
      items.push(fullItem);
      continue;
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

    // Check if this line starts a new multi-line block (e.g. "combo 2 ======================" or matches a catalog product)
    const hasTrailingEqualsOrDashes = /[=\-]{4,}\s*$/.test(rawLine.trim());
    if (hasTrailingEqualsOrDashes && unpricedBuffer.length > 0 && items.length > 0) {
      flushBufferToLastItemAsNote();
    }

    // Otherwise, this line is an unpriced text line (could be a dish name waiting for its price on a lower line,
    // like "combo 2 ======================", OR a note line like "làm cay"!)
    unpricedBuffer.push({ text: cleanedLine, isExplicitNote: false });
  }

  // If any unpriced lines remain at the end of the bill:
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
    // If bill had an explicit total lower than sum of items, infer discountAmount
    discountAmount = subtotalAmount - explicitTotalAmount;
    totalAmount = explicitTotalAmount;
  }

  return {
    billInfo: {
      billDate,
      rawDate: calendarDate !== billDate ? calendarDate : undefined,
      checkInTime: checkInTime || undefined,
      checkOutTime: checkOutTime || undefined,
      paymentType,
      debtorName: paymentType === 'debt' ? debtorName : '',
      subtotalAmount,
      discountAmount,
      totalAmount,
    },
    items,
  };
}

export const SAMPLE_BILL_TEMPLATES = [
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
    id: 'sample_cash_today',
    label: 'Mẫu Bill Tiền Mặt (Bàn VIP 1)',
    description: 'Bill tiền mặt gồm Bia Tiger Lùn, Ếch sapo, Gà chiên mắm, Khai vị',
    rawText: `HÓA ĐƠN BÁN HÀNG - BÀN VIP 1
Ngày: ${getCurrentBusinessDate()}
Giờ vào: 18:30 - Giờ ra: 21:45
Thanh toán: Tiền mặt
1. Bia Tiger Lùn x24 lon 22.000đ 528.000đ
2. Bia Sài Gòn Special x12 lon 18.000đ 216.000đ
3. Nước ngọt Redbull x4 lon 18.000đ 72.000đ
4. Khăn lạnh x10 cái 3.000đ 30.000đ
5. Ếch sapo làm cay x2 phần 135.000đ 270.000đ
6. Ếch chiên bơ x2 phần 125.000đ 250.000đ
7. Gà chiên mắm x2 đĩa 165.000đ 330.000đ
8. Đậu hũ chiên giòn x2 đĩa 45.000đ 90.000đ
9. Lẩu thái hải sản x1 nồi 280.000đ 280.000đ
Tổng cộng: 2.066.000đ`,
  },
  {
    id: 'sample_transfer_qr',
    label: 'Mẫu Bill Chuyển Khoản (VietQR)',
    description: 'Tự nhận diện từ khóa VietQR / Chuyển khoản -> paymentType: "transfer"',
    rawText: `HÓA ĐƠN THANH TOÁN - BÀN SÂN VƯỜN 05
Ngày: ${getCurrentBusinessDate()}
Giờ vào: 19:00 - Giờ ra: 22:30
Hình thức: Chuyển khoản VietQR
1. Bia Heineken Silver x30 lon 25k 750k
2. Nước suối Aquafina x6 chai 10k 60k
3. Coca Cola x5 lon 15k 75k
4. Khoai tây chiên bơ x2 đĩa 55k 110k
5. Ếch rơm x3 phần 140k 420k
6. Lẩu gà lá é x2 nồi 260k 520k
7. Mực nướng sa tế x2 đĩa 185k 370k
Tổng cộng: 2.305.000đ`,
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
