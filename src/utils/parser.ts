import { ExtractedBillJSON, PaymentType } from '../types';

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
  if (/(tôm|mực|cá\b|cua|ốc|nghêu|sò|hàu|bạch tuộc|ghẹ|hải sản)/i.test(lower)) {
    return 'Hải sản';
  }
  if (
    /(đậu hũ|đậu khuôn|khoai tây|gỏi|chả giò|đậu lạc|đậu phộng|lạc rang|nem chua|khai vị|dưa leo|cà chua|bắp xào|xúc xích|phô mai que|bánh đa|phồng tôm)/i.test(
      lower
    )
  ) {
    return 'Khai vị';
  }
  if (
    /(lẩu|cơm|mì\b|miến|bún|phở|bò|heo|lợn|dê|vịt|sườn|ba chỉ|dồi|nầm|cháo)/i.test(
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
    // Strip leading numbering like "1. " or "- "
    const line = rawLine.replace(/^(?:\d+[\.\)]\s*|\-\s*|\*\s*)/, '').trim();
    if (!line) continue;

    // Skip header row if pasted from Excel/CSV
    if (
      /^(tên sản phẩm|ten san pham|tên món|sản phẩm|product)/i.test(line) &&
      /(danh mục|category|giá bán|đơn giá|price)/i.test(line)
    ) {
      continue;
    }

    // Try splitting by comma, pipe, semicolon, or tab first (Tên sản phẩm, Danh mục, Giá bán)
    let parts = line
      .split(/\t|,|\||;/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length < 2 && line.includes(' - ')) {
      parts = line
        .split(' - ')
        .map((p) => p.trim())
        .filter(Boolean);
    }

    if (parts.length >= 3) {
      // Standard 3-part format: Tên sản phẩm, Danh mục, Giá bán (and optional 4th part: Đơn vị)
      const productName = parts[0];
      const rawCategory = parts[1];
      let unitPrice = normalizeMoneyNumber(parts[2]);
      if (unitPrice > 0 && unitPrice < 1000) {
        unitPrice *= 1000;
      }

      // Match existing category case-insensitively if available
      let matchedCategory = rawCategory || inferCategory(productName, availableCategories);
      if (Array.isArray(availableCategories) && rawCategory) {
        const found = availableCategories.find(
          (c) => c.toLowerCase().trim() === rawCategory.toLowerCase().trim()
        );
        if (found) matchedCategory = found;
      }

      const unit = parts[3] ? parts[3] : inferUnit(productName, matchedCategory);

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
      // 2-part format: could be "Tên sản phẩm, Giá bán" OR "Tên sản phẩm, Danh mục"
      const p0 = parts[0];
      const p1 = parts[1];
      const priceFromP1 = normalizeMoneyNumber(p1);
      if (priceFromP1 > 0 || /\d/.test(p1)) {
        let uPrice = priceFromP1;
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
        const cat = p1 || inferCategory(p0, availableCategories);
        results.push({
          productName: p0,
          category: cat,
          unitPrice: 0,
          unit: inferUnit(p0, cat),
        });
        continue;
      }
    }

    // Fallback single-string pattern: "Tên sản phẩm ... Giá bán"
    const m = line.match(/^(.+?)\s+[\-|:]?\s*(\d[\d.,]*)\s*(k|đ|vnđ|d)?$/i);
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

export function parseRawTextToBillJSON(
  rawText: string,
  defaultDate: string
): ExtractedBillJSON {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let billDate = defaultDate;
  let paymentType: PaymentType = 'cash';
  let debtorName = '';

  const fullText = rawText;

  // Check date in DD/MM/YYYY or YYYY-MM-DD
  const dmyMatch = fullText.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/);
  const ymdMatch = fullText.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (ymdMatch) {
    billDate = `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
  } else if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    billDate = `${dmyMatch[3]}-${m}-${d}`;
  }

  // Check payment type
  if (/(chuyển khoản|\bck\b|mã qr|vietqr|banking)/i.test(fullText)) {
    paymentType = 'transfer';
  }
  if (/(công nợ|ghi nợ|ký nợ|\bnợ\b|khách nợ)/i.test(fullText)) {
    paymentType = 'debt';
    const debtLine = lines.find((l) =>
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

  const items: ExtractedBillJSON['items'] = [];

  for (const line of lines) {
    // Skip metadata / header / total lines
    if (
      /^(hóa đơn|bill|ngày|bàn|thu ngân|tổng cộng|tổng tiền|thành tiền|thanh toán|chuyển khoản|tiền mặt|công nợ|ghi nợ|ký nợ|khách hàng|địa chỉ|sđt|cảm ơn|---)/i.test(
        line
      )
    ) {
      continue;
    }

    let matched = false;

    // Try matching: Name ... Qty ... UnitPrice ... (optional Subtotal)
    const regex1 =
      /^(.+?)\s+(?:SL[:\s]*|x\s*)?(\d{1,4})\s*(?:lon|chai|phần|đĩa|nồi|cái|ly|ca|suất|bịch|gói|con)?\s*[\-x|:@]?\s*([\d.,]+\s*(?:k|đ|vnđ|d)?)(?:\s*[\-=|:]?\s*([\d.,]+\s*(?:k|đ|vnđ|d)?))?$/i;
    const m1 = line.match(regex1);
    if (m1) {
      const name = m1[1].replace(/^[\d]+\.\s*/, '').replace(/[\-|:]$/, '').trim();
      const qty = Math.max(1, parseInt(m1[2], 10) || 1);
      let uPrice = normalizeMoneyNumber(m1[3]);
      let sub = m1[4] ? normalizeMoneyNumber(m1[4]) : 0;
      if (uPrice > 0 && uPrice < 1000) uPrice *= 1000;
      if (sub > 0 && sub < 1000) sub *= 1000;

      if (sub === 0) {
        sub = qty * uPrice;
      } else if (sub === qty * uPrice) {
        // exact match
      } else if (uPrice > sub && qty > 1) {
        const tmp = sub;
        sub = uPrice;
        uPrice = tmp;
      } else {
        sub = qty * uPrice;
      }

      if (name && uPrice > 0) {
        items.push({
          productName: name,
          category: inferCategory(name),
          quantity: qty,
          unitPrice: uPrice,
          subtotal: sub,
        });
        matched = true;
      }
    }

    if (!matched) {
      // Pattern C: Leading quantity: "15 lon Bia Tiger Lùn 22k"
      const regex2 =
        /^(\d{1,4})\s*(?:lon|chai|phần|đĩa|nồi|cái|ly|ca|con)?\s+(.+?)\s+[\-x|:@]?\s*([\d.,]+\s*(?:k|đ|vnđ|d)?)(?:\s+([\d.,]+\s*(?:k|đ|vnđ|d)?))?$/i;
      const m2 = line.match(regex2);
      if (m2) {
        const qty = Math.max(1, parseInt(m2[1], 10) || 1);
        const name = m2[2].replace(/[\-|:]$/, '').trim();
        let uPrice = normalizeMoneyNumber(m2[3]);
        if (uPrice > 0 && uPrice < 1000) uPrice *= 1000;
        const sub = qty * uPrice;
        if (name && uPrice > 0) {
          items.push({
            productName: name,
            category: inferCategory(name),
            quantity: qty,
            unitPrice: uPrice,
            subtotal: sub,
          });
        }
      }
    }
  }

  const totalAmount = items.reduce((acc, it) => acc + it.subtotal, 0);

  return {
    billInfo: {
      billDate,
      paymentType,
      debtorName: paymentType === 'debt' ? debtorName : '',
      totalAmount,
    },
    items,
  };
}

export const SAMPLE_BILL_TEMPLATES = [
  {
    id: 'sample_cash_today',
    label: 'Mẫu Bill Tiền Mặt (Bàn VIP 1)',
    description: 'Bill tiền mặt gồm Bia Tiger Lùn, Ếch sapo, Gà chiên mắm, Khai vị',
    rawText: `HÓA ĐƠN BÁN HÀNG - BÀN VIP 1
Ngày: ${new Date().toISOString().slice(0, 10)}
Thanh toán: Tiền mặt
1. Bia Tiger Lùn x24 lon 22.000đ 528.000đ
2. Bia Sài Gòn Special x12 lon 18.000đ 216.000đ
3. Nước ngọt Redbull x4 lon 18.000đ 72.000đ
4. Khăn lạnh x10 cái 3.000đ 30.000đ
5. Ếch sapo x2 phần 135.000đ 270.000đ
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
Ngày: ${new Date().toISOString().slice(0, 10)}
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
Ngày: ${new Date().toISOString().slice(0, 10)}
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
  {
    id: 'sample_20_08_2026',
    label: 'Mẫu Bill Ngày 20/08/2026 (15 Lon Bia)',
    description: 'Dùng để test tính năng Hoàn trả món trong bill ngày 20/08/2026',
    rawText: `HÓA ĐƠN BÁN HÀNG - BÀN 08
Ngày: 20/08/2026
Thanh toán: Tiền mặt
1. Bia Tiger Lùn x15 lon 22.000đ 330.000đ
2. Khăn lạnh x6 cái 3.000đ 18.000đ
3. Đậu lạc rang muối x2 đĩa 30.000đ 60.000đ
4. Ếch sapo x2 nồi 135.000đ 270.000đ
5. Cánh gà chiên mắm x1 phần 145.000đ 145.000đ
Tổng cộng: 823.000đ`,
  },
];

export const DEFAULT_CATALOG_PRODUCTS = [
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
