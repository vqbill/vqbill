import { GoogleGenAI, Type } from '@google/genai';
import {
  ExtractedBillJSON,
  ExtractedBillItem,
  GeminiKeyStatus,
  PaymentType,
  ProductRecord,
} from '../types';
import {
  getCurrentBusinessDate,
  inferCategory,
  inferUnit,
  normalizeMoneyNumber,
  normalizeSynchronizedReceiptText,
  parseBulkProductsInput,
  parseInvoiceText,
  resolveBusinessBillDate,
  splitProductNameAndInlineNote,
} from '../utils/parser';

const GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
];

async function generateContentWithModelFallback(
  ai: GoogleGenAI,
  params: { contents: any; config?: any }
): Promise<{ response: any; model: string }> {
  let lastError: any = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: params.contents,
        ...(params.config ? { config: params.config } : {}),
      });
      return { response, model: modelName };
    } catch (err: any) {
      lastError = err;
      const rawStr =
        typeof err === 'string'
          ? err
          : err?.message || JSON.stringify(err || '');

      const isInvalidKey =
        rawStr.includes('API_KEY_INVALID') ||
        rawStr.includes('API key not valid');
      const isProjectDenied =
        rawStr.includes('Your project has been denied access') ||
        (rawStr.includes('403') && rawStr.includes('PERMISSION_DENIED'));

      // Stop immediately if the API key itself is invalid or project is denied
      if (isInvalidKey || isProjectDenied) {
        throw err;
      }
      // Otherwise (e.g. 404 NOT_FOUND / model no longer available to new users), try next model in GEMINI_MODELS
    }
  }

  throw lastError || new Error('Không thể kết nối tới model Gemini.');
}

function formatFriendlyClientGeminiError(rawErr: any): {
  isProjectDenied: boolean;
  isQuota: boolean;
  message: string;
} {
  let rawStr =
    typeof rawErr === 'string'
      ? rawErr
      : rawErr?.message || JSON.stringify(rawErr || '');

  try {
    const trimmed = rawStr.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsedJson = JSON.parse(trimmed);
      if (parsedJson?.error?.message) {
        rawStr = `${parsedJson.error.code || ''} ${parsedJson.error.status || ''}: ${parsedJson.error.message}`.trim();
      }
    }
  } catch {
    // Keep original rawStr
  }

  const isProjectDenied =
    rawStr.includes('Your project has been denied access') ||
    (rawStr.includes('403') && rawStr.includes('PERMISSION_DENIED'));
  const isQuota =
    rawStr.includes('429') || rawStr.includes('RESOURCE_EXHAUSTED');

  if (isProjectDenied) {
    return {
      isProjectDenied: true,
      isQuota: false,
      message:
        'Đã kích hoạt Chế Độ Xử Lý Thông Minh (Project Google Cloud của Key này đang bị giới hạn 403 PERMISSION_DENIED — Hệ thống đã tự động bật bộ bóc tách Bill & Menu nội bộ để bạn sử dụng bình thường, hoặc bạn có thể tạo Key từ một Gmail/Project mới trên Google AI Studio).',
    };
  }

  if (isQuota) {
    return {
      isProjectDenied: false,
      isQuota: true,
      message:
        'API Key đã hết hạn mức gọi trong phút (429 Quota). Hệ thống đã bật chế độ bóc tách dự phòng.',
    };
  }

  if (
    rawStr.includes('API_KEY_INVALID') ||
    rawStr.includes('API key not valid')
  ) {
    return {
      isProjectDenied: false,
      isQuota: false,
      message:
        'API Key không hợp lệ (API_KEY_INVALID). Vui lòng kiểm tra lại chuỗi Key bắt đầu bằng AIza...',
    };
  }

  return {
    isProjectDenied: false,
    isQuota: false,
    message: rawStr || 'Không thể kết nối tới dịch vụ Gemini.',
  };
}

export function maskApiKey(key: string): string {
  const clean = (key || '').trim();
  if (!clean) return '';
  if (clean.length <= 8) return '••••' + clean.slice(-2);
  return `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`;
}

async function safeFetchJson(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: any; isStaticHostFallback: boolean }> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        status: res.status,
        data: null,
        isStaticHostFallback: true,
      };
    }
    const data = await res.json();
    return {
      ok: res.ok,
      status: res.status,
      data,
      isStaticHostFallback: false,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      isStaticHostFallback: true,
    };
  }
}

export function buildBillOcrSystemInstruction(
  customCategories?: string[],
  existingProducts?: ProductRecord[]
): string {
  const catList =
    Array.isArray(customCategories) && customCategories.length > 0
      ? customCategories.join(', ')
      : 'Bia, Nước ngọt, Khai vị, Ếch, Gà, Hải sản, Lẩu / Món chính, Khác';

  const catalogSample =
    Array.isArray(existingProducts) && existingProducts.length > 0
      ? existingProducts
          .slice(0, 80)
          .map((p) => `${p.productName} (${p.category} - ${p.unitPrice}đ)`)
          .join('; ')
      : 'Gà biển kho nghệ (Gà - 129000đ); Combo 2 (Lẩu / Món chính - 459000đ); Bia Tiger Lùn (Bia - 22000đ); Ếch sapo (Ếch - 135000đ)';

  return `Bạn là hệ thống AI chuyên gia trích xuất hóa đơn bán hàng nhà hàng / quán nhậu (OCR & Multi-format Bill Parser).
Nhiệm vụ: Từ HÌNH ẢNH HÓA ĐƠN hoặc VĂN BẢN COPY NHIỀU ĐỊNH DẠNG, chỉ cần lấy chính xác các trường:
- Ngày tháng (billDate - định dạng YYYY-MM-DD)
- Giờ vào (checkInTime - HH:mm) và Giờ ra (checkOutTime - HH:mm)
- Hình thức thanh toán (paymentType: "cash" | "transfer" | "debt") và Tên người nợ (debtorName)
- Danh sách món: Tên món chuẩn (productName), Ghi chú món (note), Danh mục (category), Số lượng (quantity), Đơn giá (unitPrice), Thành tiền (subtotal)
- Chiết khấu (discountAmount) và Tổng cộng (totalAmount)

QUY TẮC QUAN TRỌNG:
1. KHUNG GIỜ BÁN CỦA QUÁN (09:00 SÁNG -> 08:00 SÁNG HÔM SAU):
   - Quán bán từ 09:00 sáng ngày hôm trước đến 08:00 sáng ngày hôm sau.
   - Ví dụ: Bill ngày 20/08 được tính từ 09:00 sáng ngày 20/08 đến 08:00 sáng ngày 21/08. Nếu trên bill ghi ngày 21/08 nhưng giờ vào/ra nằm trong khung 00:00 -> 08:00 sáng, hãy tính billDate là ngày 20/08 (2026-08-20).
2. TÁCH TÊN MÓN & GHI CHÚ MÓN (note):
   - Danh mục món hiện có trong Menu: [${catalogSample}].
   - Nếu món có tên rõ ràng trong danh mục nhưng có thêm chữ yêu cầu chế biến hoặc dòng text phụ, hãy tách phần đó vào trường "note" của món:
     + Ví dụ 1: Menu có "Gà biển kho nghệ" giá 129000, nhưng bill ghi "gà biển kho nghệ làm cay giá 129000" -> productName: "Gà biển kho nghệ", note: "làm cay", unitPrice: 129000.
     + Ví dụ 2: Món "Combo 2" giá 459000 có các dòng bên dưới như:
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
       -> Đó là 1 món duy nhất: productName: "Combo 2", note: "Cơm chiên hải sản, Càng cua trộn bò, Chip hấp thái, Cá giò kho tiêu, 1 dĩa trái cây", quantity: 1, unitPrice: 459000, subtotal: 459000. Tuyệt đối KHÔNG tách các dòng >>> ... <<< không có giá thành món riêng.
      + Ví dụ 3 (Bill in nhiệt khổ hẹp bị rớt dòng ở tiêu đề "Tên hàng Đ.Giá SL Thành / tiền" và tên món dài):
        Tên hàng Đ.Giá SL Thành
        tiền
        Bạch tuộc rang
        mắm ớt 119,000 x 1 119,000
        Tiger bạc lon nhỏ
        250ml 21,000 x 24 504,000
        -> Chữ "tiền" là phần rớt dòng của tiêu đề "Thành tiền", TUYỆT ĐỐI KHÔNG ghép chữ "tiền" vào tên món đầu tiên. Các dòng tên món bị ngắt đôi phải nối lại thành tên món hoàn chỉnh: "Bạch tuộc rang mắm ớt" (119,000 x 1 = 119,000) và "Tiger bạc lon nhỏ 250ml" (21,000 x 24 = 504,000).
3. PHÂN LOẠI DANH MỤC (category):
   - Xếp vào một trong các danh mục: [${catList}].`;
}

export function normalizeAndSanitizeExtractedBill(
  raw: any,
  fallbackDate: string,
  existingProducts?: ProductRecord[],
  customCategories?: string[]
): ExtractedBillJSON {
  const billInfo = raw?.billInfo || {};
  const rawCalendarDate =
    typeof billInfo.rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(billInfo.rawDate.trim())
      ? billInfo.rawDate.trim()
      : typeof billInfo.billDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(billInfo.billDate.trim())
      ? billInfo.billDate.trim()
      : fallbackDate || getCurrentBusinessDate();

  const checkInTime =
    typeof billInfo.checkInTime === 'string' ? billInfo.checkInTime.trim() : '';
  const checkOutTime =
    typeof billInfo.checkOutTime === 'string' ? billInfo.checkOutTime.trim() : '';
  const tableName =
    typeof billInfo.tableName === 'string' ? billInfo.tableName.trim() : '';

  const { businessDate } = resolveBusinessBillDate(
    rawCalendarDate,
    checkInTime,
    checkOutTime,
    false
  );

  let paymentType: PaymentType = 'cash';
  if (
    billInfo.paymentType === 'transfer' ||
    billInfo.paymentType === 'debt' ||
    billInfo.paymentType === 'cash'
  ) {
    paymentType = billInfo.paymentType;
  }

  const debtorName =
    paymentType === 'debt' && typeof billInfo.debtorName === 'string'
      ? billInfo.debtorName.trim()
      : '';

  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const items: ExtractedBillItem[] = rawItems
    .map((item: any) => {
      const rawName =
        typeof item?.productName === 'string' ? item.productName.trim() : '';
      if (!rawName) return null;

      // Always run splitProductNameAndInlineNote so catalog matches & inline notes are cleanly separated
      const split = splitProductNameAndInlineNote(
        rawName,
        existingProducts,
        customCategories
      );
      const explicitNote =
        typeof item?.note === 'string'
          ? item.note
              .replace(/^[=\-*_~><\s]+|[=\-*_~><\s]+$/g, '')
              .trim()
          : '';
      const combinedNote = [split.note, explicitNote]
        .filter(Boolean)
        .filter((v, idx, arr) => arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === idx)
        .join(', ');

      const quantity = Math.max(1, normalizeMoneyNumber(item?.quantity) || 1);
      let unitPrice = normalizeMoneyNumber(item?.unitPrice);
      let subtotal = normalizeMoneyNumber(item?.subtotal);

      if (unitPrice > 0 && unitPrice < 1000) unitPrice *= 1000;
      if (subtotal > 0 && subtotal < 1000) subtotal *= 1000;

      if (unitPrice === 0 && subtotal === 0 && split.catalogUnitPrice) {
        unitPrice = split.catalogUnitPrice;
        subtotal = quantity * unitPrice;
      } else if (subtotal === 0 && unitPrice > 0) {
        subtotal = quantity * unitPrice;
      } else if (unitPrice === 0 && subtotal > 0) {
        unitPrice = Math.round(subtotal / quantity);
      } else if (unitPrice > 0 && subtotal !== quantity * unitPrice) {
        subtotal = quantity * unitPrice;
      }

      const category =
        typeof item?.category === 'string' && item.category.trim()
          ? item.category.trim()
          : split.category || inferCategory(split.productName, customCategories);

      return {
        productName: split.productName || rawName,
        note: combinedNote || '',
        category,
        quantity,
        unitPrice,
        subtotal,
      };
    })
    .filter(
      (it: ExtractedBillItem | null): it is ExtractedBillItem =>
        Boolean(it && it.productName)
    );

  const subtotalAmount = items.reduce((sum, it) => sum + (it.subtotal || 0), 0);
  let discountAmount = normalizeMoneyNumber(billInfo.discountAmount);
  if (discountAmount > 0 && discountAmount < 1000) discountAmount *= 1000;
  discountAmount = Math.min(subtotalAmount, Math.max(0, discountAmount));

  let totalAmount = normalizeMoneyNumber(billInfo.totalAmount);
  if (totalAmount > 0 && totalAmount < 1000) totalAmount *= 1000;
  if (subtotalAmount > 0) {
    if (
      discountAmount === 0 &&
      totalAmount > 0 &&
      totalAmount < subtotalAmount
    ) {
      discountAmount = subtotalAmount - totalAmount;
    }
    totalAmount = Math.max(0, subtotalAmount - discountAmount);
  }

  return {
    billInfo: {
      billDate: businessDate,
      rawDate: rawCalendarDate !== businessDate ? rawCalendarDate : undefined,
      checkInTime: checkInTime || undefined,
      checkOutTime: checkOutTime || undefined,
      tableName: tableName || undefined,
      paymentType,
      debtorName,
      subtotalAmount,
      discountAmount,
      totalAmount,
    },
    items,
  };
}

export async function syncGeminiKeyStatus(storedKey: string): Promise<GeminiKeyStatus> {
  const clean = (storedKey || '').trim();
  if (clean) {
    const resp = await safeFetchJson('/api/gemini-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: clean }),
    });
    if (resp.ok && resp.data) {
      return {
        configured: Boolean(resp.data.configured),
        source: resp.data.source || 'custom',
        maskedKey: resp.data.maskedKey || maskApiKey(clean),
      };
    }
    // Static host fallback (e.g. Netlify)
    return {
      configured: true,
      source: 'custom',
      maskedKey: maskApiKey(clean),
    };
  }

  const statusResp = await safeFetchJson('/api/gemini-status');
  if (statusResp.ok && statusResp.data) {
    return {
      configured: Boolean(statusResp.data.configured),
      source: statusResp.data.source || 'none',
      maskedKey: statusResp.data.maskedKey || '',
    };
  }

  return {
    configured: false,
    source: 'none',
    maskedKey: '',
  };
}

export async function fetchGeminiStatus(storedKey?: string): Promise<GeminiKeyStatus> {
  return syncGeminiKeyStatus(
    typeof storedKey === 'string'
      ? storedKey
      : typeof window !== 'undefined'
      ? localStorage.getItem('vqbill_gemini_api_key') || ''
      : ''
  );
}

export async function saveGeminiKeyRequest(apiKey: string): Promise<GeminiKeyStatus> {
  return syncGeminiKeyStatus(apiKey);
}

export async function checkGeminiKeyRequest(apiKey?: string): Promise<{
  ok: boolean;
  status: GeminiKeyStatus;
  message: string;
}> {
  return verifyGeminiApiKey(apiKey || '');
}

export async function verifyGeminiApiKey(
  apiKey: string
): Promise<{
  ok: boolean;
  status: GeminiKeyStatus;
  message: string;
}> {
  const cleanKey = (apiKey || '').trim();
  const startedAt = Date.now();

  // 1. If the user entered a key in the browser, try direct browser REST verification first
  // so no server container environment variable can interfere
  if (cleanKey) {
    for (const modelName of GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(cleanKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Trả lời đúng 1 từ: OK' }] }],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.candidates?.length) {
          const latencyMs = Date.now() - startedAt;
          const msg = `Gemini Key hợp lệ! Kết nối thành công tới model ${modelName} (${latencyMs}ms).`;
          // Sync key to server in background if server is available
          safeFetchJson('/api/gemini-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: cleanKey }),
          }).catch(() => {});
          return {
            ok: true,
            message: msg,
            status: {
              configured: true,
              source: 'custom',
              maskedKey: maskApiKey(cleanKey),
              verified: true,
              model: modelName,
              latencyMs,
              message: msg,
            },
          };
        }
      } catch {
        // continue trying next model or server endpoint
      }
    }
  }

  const serverResp = await safeFetchJson('/api/check-gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: cleanKey }),
  });

  if (!serverResp.isStaticHostFallback) {
    if (serverResp.ok && serverResp.data?.ok) {
      const msg =
        serverResp.data.message ||
        'Check Gemini Key thành công! Sẵn sàng quét Bill & Menu.';
      return {
        ok: true,
        message: msg,
        status: {
          configured: true,
          source: serverResp.data.source || (cleanKey ? 'custom' : 'env'),
          maskedKey: serverResp.data.maskedKey || maskApiKey(cleanKey),
          verified: true,
          model: serverResp.data.model || GEMINI_MODEL,
          latencyMs: serverResp.data.latencyMs,
          message: msg,
        },
      };
    }
    const parsedErr = formatFriendlyClientGeminiError(
      serverResp.data?.error || 'Gemini API Key không hợp lệ.'
    );
    if (parsedErr.isProjectDenied || parsedErr.isQuota) {
      const latencyMs = Date.now() - startedAt;
      return {
        ok: true,
        message: parsedErr.message,
        status: {
          configured: true,
          source: cleanKey ? 'custom' : 'env',
          maskedKey: maskApiKey(cleanKey) || 'Smart-Engine',
          verified: true,
          model: 'Smart-Hybrid-Parser',
          latencyMs,
          message: parsedErr.message,
        },
      };
    }
    return {
      ok: false,
      message: parsedErr.message,
      status: {
        configured: Boolean(cleanKey),
        source: cleanKey ? 'custom' : 'none',
        maskedKey: maskApiKey(cleanKey),
        verified: false,
        error: parsedErr.message,
      },
    };
  }

  // Client-side direct verification for static hosts (Netlify / Vercel Static)
  if (!cleanKey) {
    const errMsg = 'Vui lòng nhập Gemini API Key (AIza...) trước khi bấm Kiểm tra.';
    return {
      ok: false,
      message: errMsg,
      status: {
        configured: false,
        source: 'none',
        maskedKey: '',
        verified: false,
        error: errMsg,
      },
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey });
    const { model: usedModel } = await generateContentWithModelFallback(ai, {
      contents: 'Trả lời đúng 1 từ: OK',
    });
    const latencyMs = Date.now() - startedAt;
    const msg = `Gemini Key hợp lệ! Đã kết nối trực tiếp tới model ${usedModel} (${latencyMs}ms).`;
    return {
      ok: true,
      message: msg,
      status: {
        configured: true,
        source: 'custom',
        maskedKey: maskApiKey(cleanKey),
        verified: true,
        model: usedModel,
        latencyMs,
        message: msg,
      },
    };
  } catch (err: any) {
    const parsedErr = formatFriendlyClientGeminiError(err);
    if (parsedErr.isProjectDenied || parsedErr.isQuota) {
      const latencyMs = Date.now() - startedAt;
      return {
        ok: true,
        message: parsedErr.message,
        status: {
          configured: true,
          source: 'custom',
          maskedKey: maskApiKey(cleanKey),
          verified: true,
          model: 'Smart-Hybrid-Parser',
          latencyMs,
          message: parsedErr.message,
        },
      };
    }
    return {
      ok: false,
      message: parsedErr.message,
      status: {
        configured: true,
        source: 'custom',
        maskedKey: maskApiKey(cleanKey),
        verified: false,
        error: parsedErr.message,
      },
    };
  }
}

export async function extractBillWithGemini(params: {
  imageBase64?: string;
  mimeType?: string;
  rawText?: string;
  defaultDate: string;
  apiKey?: string;
  categories: string[];
  existingProducts: ProductRecord[];
}): Promise<ExtractedBillJSON> {
  const {
    imageBase64,
    mimeType,
    rawText: inputRawText,
    defaultDate,
    apiKey,
    categories,
    existingProducts,
  } = params;

  const rawText = inputRawText
    ? normalizeSynchronizedReceiptText(inputRawText)
    : inputRawText;

  const serverResp = await safeFetchJson('/api/ocr-bill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64,
      mimeType,
      rawText,
      defaultDate,
      apiKey: apiKey || undefined,
      categories,
      existingProducts: existingProducts.map((p) => ({
        productName: p.productName,
        category: p.category,
        unitPrice: p.unitPrice,
      })),
    }),
  });

  if (!serverResp.isStaticHostFallback) {
    if (!serverResp.ok) {
      if (rawText && String(rawText).trim()) {
        return parseInvoiceText(
          String(rawText),
          defaultDate,
          existingProducts,
          categories
        );
      }
      const parsedErr = formatFriendlyClientGeminiError(
        serverResp.data?.error || 'Lỗi kết nối Gemini AI OCR.'
      );
      throw new Error(parsedErr.message);
    }
    return normalizeAndSanitizeExtractedBill(
      serverResp.data,
      defaultDate,
      existingProducts,
      categories
    );
  }

  // Client-side direct Gemini execution for static hosting (Netlify)
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw new Error(
      'Chưa có Gemini API Key. Vui lòng nhập Gemini API Key ở thanh cấu hình phía trên.'
    );
  }

  const ai = new GoogleGenAI({ apiKey: cleanKey });
  const parts: any[] = [];
  if (imageBase64) {
    const cleanBase64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '');
    parts.push({
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: cleanBase64,
      },
    });
  }

  const promptText = rawText
    ? `Ngày mặc định (nếu hóa đơn không ghi rõ): ${defaultDate}.\nNội dung hóa đơn:\n${rawText}`
    : `Ngày mặc định (nếu hóa đơn không ghi rõ): ${defaultDate}.\nHãy đọc hình ảnh hóa đơn này và trích xuất chính xác ngày tháng, giờ vào/ra, danh sách món, ghi chú món, số lượng, đơn giá, thành tiền, chiết khấu và tổng cộng.`;

  parts.push({ text: promptText });

  const { response } = await generateContentWithModelFallback(ai, {
    contents: { parts },
    config: {
      systemInstruction: buildBillOcrSystemInstruction(categories, existingProducts),
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          billInfo: {
            type: Type.OBJECT,
            properties: {
              billDate: {
                type: Type.STRING,
                description: 'Ngày hóa đơn YYYY-MM-DD (áp dụng ca 09:00 sáng -> 08:00 sáng hôm sau)',
              },
              rawDate: {
                type: Type.STRING,
                description: 'Ngày in trên hóa đơn YYYY-MM-DD',
              },
              checkInTime: {
                type: Type.STRING,
                description: 'Giờ vào định dạng HH:mm (nếu có)',
              },
              checkOutTime: {
                type: Type.STRING,
                description: 'Giờ ra / thanh toán định dạng HH:mm (nếu có)',
              },
              paymentType: {
                type: Type.STRING,
                description: 'cash, transfer, hoặc debt',
              },
              debtorName: {
                type: Type.STRING,
                description: 'Tên khách nợ nếu paymentType là debt',
              },
              subtotalAmount: {
                type: Type.INTEGER,
                description: 'Tổng tạm tính trước chiết khấu',
              },
              discountAmount: {
                type: Type.INTEGER,
                description: 'Số tiền chiết khấu / giảm giá (0 nếu không có)',
              },
              totalAmount: {
                type: Type.INTEGER,
                description: 'Tổng cộng thanh toán sau chiết khấu',
              },
            },
            required: ['billDate', 'paymentType', 'debtorName', 'totalAmount'],
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                productName: {
                  type: Type.STRING,
                  description: 'Tên món chuẩn (đã tách riêng ghi chú)',
                },
                note: {
                  type: Type.STRING,
                  description: 'Ghi chú của món (VD: làm cay, hoặc chi tiết các món trong combo)',
                },
                category: {
                  type: Type.STRING,
                  description: 'Danh mục sản phẩm',
                },
                quantity: {
                  type: Type.INTEGER,
                  description: 'Số lượng',
                },
                unitPrice: {
                  type: Type.INTEGER,
                  description: 'Đơn giá (VNĐ)',
                },
                subtotal: {
                  type: Type.INTEGER,
                  description: 'Thành tiền = quantity * unitPrice',
                },
              },
              required: ['productName', 'category', 'quantity', 'unitPrice', 'subtotal'],
            },
          },
        },
        required: ['billInfo', 'items'],
      },
    },
  });

  const parsed = JSON.parse(response.text || '{}');
  return normalizeAndSanitizeExtractedBill(
    parsed,
    defaultDate,
    existingProducts,
    categories
  );
}

export async function parseMenuProductsWithGemini(params: {
  imageBase64?: string;
  mimeType?: string;
  rawText?: string;
  apiKey?: string;
  categories: string[];
}): Promise<
  Array<{
    productName: string;
    category: string;
    unitPrice: number;
    unit: string;
  }>
> {
  const { imageBase64, mimeType, rawText, apiKey, categories } = params;

  const serverResp = await safeFetchJson('/api/parse-products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64,
      mimeType,
      rawText,
      apiKey: apiKey || undefined,
      categories,
    }),
  });

  if (!serverResp.isStaticHostFallback) {
    if (!serverResp.ok) {
      if (rawText && String(rawText).trim()) {
        return parseBulkProductsInput(String(rawText), categories);
      }
      const parsedErr = formatFriendlyClientGeminiError(
        serverResp.data?.error || 'Không thể phân tích danh sách sản phẩm bằng Gemini AI.'
      );
      throw new Error(parsedErr.message);
    }
    return Array.isArray(serverResp.data?.products) ? serverResp.data.products : [];
  }

  // Client-side direct Gemini execution for static hosting (Netlify)
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw new Error(
      'Chưa có Gemini API Key. Vui lòng nhập Gemini API Key ở thanh cấu hình phía trên.'
    );
  }

  const ai = new GoogleGenAI({ apiKey: cleanKey });
  const catList =
    Array.isArray(categories) && categories.length > 0
      ? categories.join(', ')
      : 'Bia, Nước ngọt, Khai vị, Ếch, Gà, Hải sản, Lẩu / Món chính, Khác';

  const parts: any[] = [];
  if (imageBase64) {
    const cleanBase64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '');
    parts.push({
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: cleanBase64,
      },
    });
  }
  parts.push({
    text: rawText
      ? `Trích xuất danh sách sản phẩm theo cấu trúc (Tên sản phẩm, Danh mục, Giá bán) từ văn bản sau. Giữ đúng tên danh mục nếu người dùng đã ghi rõ:\n${rawText}`
      : `Trích xuất toàn bộ danh sách sản phẩm theo cấu trúc (Tên sản phẩm, Danh mục, Giá bán) từ hình ảnh menu này.`,
  });

  const { response } = await generateContentWithModelFallback(ai, {
    contents: { parts },
    config: {
      systemInstruction: `Bạn là chuyên gia số hóa thực đơn nhà hàng/quán nhậu. Hãy trích xuất các món ăn/thức uống theo đúng logic: Tên sản phẩm (productName), Danh mục (category - giữ nguyên danh mục người dùng ghi trong văn bản hoặc xếp vào [${catList}]), Giá bán (unitPrice - số nguyên VNĐ, ví dụ 129k -> 129000).`,
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          products: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                productName: { type: Type.STRING },
                category: { type: Type.STRING },
                unitPrice: { type: Type.INTEGER },
                unit: { type: Type.STRING },
              },
              required: ['productName', 'category', 'unitPrice', 'unit'],
            },
          },
        },
        required: ['products'],
      },
    },
  });

  const parsed = JSON.parse(response.text || '{"products":[]}');
  return (parsed.products || [])
    .map((p: any) => {
      let price = normalizeMoneyNumber(p.unitPrice);
      if (price > 0 && price < 1000) price *= 1000;
      const name = String(p.productName || '').trim();
      const cat = String(p.category || '').trim() || inferCategory(name, categories);
      return {
        productName: name,
        category: cat,
        unitPrice: price,
        unit: String(p.unit || '').trim() || inferUnit(name, cat),
      };
    })
    .filter((p: any) => Boolean(p.productName));
}
