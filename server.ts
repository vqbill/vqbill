import 'dotenv/config';
import express from 'express';
import path from 'path';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import {
  getCurrentBusinessDate,
  inferCategory,
  inferUnit,
  normalizeMoneyNumber,
  resolveBusinessBillDate,
  splitProductNameAndInlineNote,
} from './src/utils/parser';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const GEMINI_MODEL = 'gemini-3-flash-preview';

app.use(express.json({ limit: '25mb' }));

// Runtime Gemini API key configured by user in UI (falls back to process.env.GEMINI_API_KEY)
let runtimeGeminiApiKey: string = '';

function resolveApiKey(reqKey?: unknown): string {
  if (typeof reqKey === 'string' && reqKey.trim()) {
    return reqKey.trim();
  }
  if (runtimeGeminiApiKey && runtimeGeminiApiKey.trim()) {
    return runtimeGeminiApiKey.trim();
  }
  return (process.env.GEMINI_API_KEY || '').trim();
}

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••' + key.slice(-2);
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function getGeminiClient(explicitKey?: string) {
  const activeKey = resolveApiKey(explicitKey);
  if (!activeKey) {
    throw new Error(
      'Chưa có Gemini API Key. Vui lòng nhập Gemini API Key ở mục Cấu hình Gemini Key và bấm Check Key.'
    );
  }
  return new GoogleGenAI({
    apiKey: activeKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildSystemInstructionBillOcr(
  customCategories?: string[],
  existingProducts?: any[]
) {
  const catList =
    Array.isArray(customCategories) && customCategories.length > 0
      ? customCategories.join(', ')
      : 'Bia, Nước ngọt, Khai vị, Ếch, Gà, Hải sản, Lẩu / Món chính, Khác';

  const catalogSample =
    Array.isArray(existingProducts) && existingProducts.length > 0
      ? existingProducts
          .slice(0, 80)
          .map((p: any) => `${p.productName} (${p.category} - ${p.unitPrice}đ)`)
          .join('; ')
      : 'Gà biển kho nghệ (Gà - 129000đ); Combo 2 (Lẩu / Món chính - 459000đ); Bia Tiger Lùn (Bia - 22000đ); Ếch sapo (Ếch - 135000đ)';

  return `Bạn là một hệ thống AI chuyên gia trích xuất và xử lý dữ liệu hóa đơn (OCR & Multi-format Text Parser) cho ứng dụng quản lý bán hàng nhà hàng/quán nhậu.

Nhiệm vụ của bạn là tiếp nhận dữ liệu đầu vào (HÌNH ẢNH HÓA ĐƠN hoặc ĐOẠN VĂN BẢN COPY/DÁN với nhiều định dạng khác nhau) và chỉ trích xuất chính xác các trường:
- Ngày tháng (billDate - định dạng YYYY-MM-DD)
- Giờ vào (checkInTime - HH:mm) và Giờ ra (checkOutTime - HH:mm)
- Hình thức thanh toán (paymentType: "cash" | "transfer" | "debt") và Tên người nợ (debtorName)
- Danh sách món: Tên món chuẩn (productName), Ghi chú món (note), Danh mục (category), Số lượng (quantity), Đơn giá (unitPrice), Thành tiền (subtotal)
- Chiết khấu (discountAmount) và Tổng cộng (totalAmount)

---
### QUY TẮC XỬ LÝ DỮ LIỆU:

1. KHUNG GIỜ BÁN CỦA QUÁN (09:00 SÁNG -> 08:00 SÁNG HÔM SAU):
   - Quán bán từ 09:00 sáng hôm trước đến 08:00 sáng hôm sau.
   - Ví dụ: Bill ngày 20/08 được tính từ 09:00 sáng ngày 20/08 đến 08:00 sáng ngày 21/08. Nếu ngày in trên bill là 21/08 nhưng giờ vào/ra nằm trong khung 00:00 -> 08:00 sáng, hãy trả về billDate là ngày hôm trước (2026-08-20) và rawDate là ngày in trên bill (2026-08-21).

2. TÁCH TÊN MÓN CHUẨN (productName) & GHI CHÚ MÓN (note):
   - Danh mục sản phẩm đã có trong Menu: [${catalogSample}].
   - Nếu món có tên rõ ràng trong danh mục, nhưng có thêm chữ yêu cầu chế biến hoặc thêm dòng text phụ bên dưới thì phần thêm đó là GHI CHÚ (note) của món đó:
     + Ví dụ 1: Món trong danh mục là "Gà biển kho nghệ" giá 129000, nhưng văn bản copy lên là "gà biển kho nghệ làm cay giá 129000" -> productName: "Gà biển kho nghệ", note: "làm cay", unitPrice: 129000.
     + Ví dụ 2: Có món "Combo 2" giá 459000, nhưng văn bản copy lên là:
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
       -> Đây là 1 món duy nhất: productName: "Combo 2", note: "Cơm chiên hải sản, Càng cua trộn bò, Chip hấp thái, Cá giò kho tiêu, 1 dĩa trái cây", quantity: 1, unitPrice: 459000, subtotal: 459000. Tuyệt đối KHÔNG tách các dòng >>> ... <<< thành các món riêng.

3. PHÂN LOẠI DANH MỤC (category):
   - Tự động xếp vào một trong các danh mục hiện có: [${catList}].

4. HÌNH THỨC THANH TOÁN (paymentType) & NGƯỜI NỢ (debtorName):
   - "transfer": Chuyển khoản, CK, Mã QR, Banking, VietQR.
   - "debt": Công nợ, Ghi nợ, Nợ, Ký nợ (trích xuất debtorName).
   - "cash": Mặc định cho tất cả trường hợp còn lại.

5. CHUẨN HÓA SỐ LIỆU (Numbers):
   - Trả về số nguyên thuần túy (VNĐ). Ví dụ: "129.000đ" -> 129000, "22k" -> 22000.
   - subtotal = quantity * unitPrice.
   - totalAmount = subtotalAmount - discountAmount.`;
}

function sanitizeExtractedBill(
  raw: any,
  fallbackDate: string,
  existingProducts?: any[],
  customCategories?: string[]
) {
  const billInfo = raw?.billInfo || {};
  const rawCalendarDate =
    typeof billInfo.rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(billInfo.rawDate.trim())
      ? billInfo.rawDate.trim()
      : typeof billInfo.billDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(billInfo.billDate.trim())
      ? billInfo.billDate.trim()
      : fallbackDate;

  const checkInTime =
    typeof billInfo.checkInTime === 'string' ? billInfo.checkInTime.trim() : '';
  const checkOutTime =
    typeof billInfo.checkOutTime === 'string' ? billInfo.checkOutTime.trim() : '';

  const { businessDate } = resolveBusinessBillDate(
    rawCalendarDate,
    checkInTime,
    checkOutTime,
    false
  );

  let paymentType: 'cash' | 'transfer' | 'debt' = 'cash';
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
  const items = rawItems
    .map((item: any) => {
      const rawProductName =
        typeof item?.productName === 'string' ? item.productName.trim() : '';
      if (!rawProductName) return null;

      const split = splitProductNameAndInlineNote(
        rawProductName,
        existingProducts as any,
        customCategories
      );
      const explicitNote =
        typeof item?.note === 'string'
          ? item.note.replace(/^[=\-*_~><\s]+|[=\-*_~><\s]+$/g, '').trim()
          : '';
      const combinedNote = [split.note, explicitNote]
        .filter(Boolean)
        .filter(
          (v, idx, arr) =>
            arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === idx
        )
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
        productName: split.productName || rawProductName,
        note: combinedNote || '',
        category,
        quantity,
        unitPrice,
        subtotal,
      };
    })
    .filter(Boolean);

  const subtotalAmount = items.reduce(
    (sum: number, it: any) => sum + (it?.subtotal || 0),
    0
  );
  let discountAmount = normalizeMoneyNumber(billInfo.discountAmount);
  if (discountAmount > 0 && discountAmount < 1000) discountAmount *= 1000;
  discountAmount = Math.min(subtotalAmount, Math.max(0, discountAmount));

  let totalAmount = normalizeMoneyNumber(billInfo.totalAmount);
  if (totalAmount > 0 && totalAmount < 1000) totalAmount *= 1000;
  if (subtotalAmount > 0) {
    if (discountAmount === 0 && totalAmount > 0 && totalAmount < subtotalAmount) {
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
      paymentType,
      debtorName,
      subtotalAmount,
      discountAmount,
      totalAmount,
    },
    items,
  };
}

// 1. GET Gemini Key Status
app.get('/api/gemini-status', (_req, res) => {
  const custom = runtimeGeminiApiKey.trim();
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  const active = custom || envKey;
  res.json({
    configured: Boolean(active),
    source: custom ? 'custom' : envKey ? 'env' : 'none',
    maskedKey: maskKey(active),
  });
});

// 2. POST Add / Update Gemini Key on Server
app.post('/api/gemini-key', (req, res) => {
  const { apiKey } = req.body || {};
  runtimeGeminiApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const active = resolveApiKey();
  res.json({
    ok: true,
    configured: Boolean(active),
    source: runtimeGeminiApiKey ? 'custom' : active ? 'env' : 'none',
    maskedKey: maskKey(active),
  });
});

// 3. POST Check / Verify Gemini Key with a live model call
app.post('/api/check-gemini', async (req, res) => {
  const startedAt = Date.now();
  try {
    const { apiKey } = req.body || {};
    if (typeof apiKey === 'string' && apiKey.trim()) {
      runtimeGeminiApiKey = apiKey.trim();
    }
    const activeKey = resolveApiKey(apiKey);
    if (!activeKey) {
      res.status(400).json({
        ok: false,
        error: 'Chưa có Gemini API Key nào được nhập hoặc cấu hình.',
      });
      return;
    }

    const ai = getGeminiClient(activeKey);
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: 'Trả lời đúng 1 từ: OK',
    });

    const latencyMs = Date.now() - startedAt;
    res.json({
      ok: true,
      model: GEMINI_MODEL,
      latencyMs,
      maskedKey: maskKey(activeKey),
      source: runtimeGeminiApiKey ? 'custom' : 'env',
      reply: (response.text || 'OK').trim(),
      message: `Gemini Key hợp lệ! Kết nối thành công tới model ${GEMINI_MODEL} (${latencyMs}ms).`,
    });
  } catch (error: any) {
    console.error('Error in /api/check-gemini:', error);
    res.status(400).json({
      ok: false,
      error:
        error?.message ||
        'Gemini API Key không hợp lệ hoặc không thể kết nối tới máy chủ Gemini.',
    });
  }
});

// 4. POST OCR Bill (Image or Text)
app.post('/api/ocr-bill', async (req, res) => {
  try {
    const {
      imageBase64,
      mimeType,
      rawText,
      defaultDate,
      apiKey,
      categories,
      existingProducts,
    } = req.body || {};
    const headerKey = req.headers['x-gemini-api-key'];
    const fallbackDate =
      typeof defaultDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(defaultDate)
        ? defaultDate
        : getCurrentBusinessDate();

    if (!imageBase64 && (!rawText || !String(rawText).trim())) {
      res
        .status(400)
        .json({ error: 'Vui lòng cung cấp hình ảnh hóa đơn hoặc văn bản hóa đơn.' });
      return;
    }

    const ai = getGeminiClient(
      typeof apiKey === 'string' && apiKey.trim()
        ? apiKey
        : typeof headerKey === 'string'
        ? headerKey
        : undefined
    );
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
      ? `Ngày mặc định (nếu trên hóa đơn không ghi rõ năm/tháng/ngày): ${fallbackDate}.\nNội dung hóa đơn:\n${rawText}`
      : `Ngày mặc định (nếu trên hóa đơn không ghi rõ năm/tháng/ngày): ${fallbackDate}.\nHãy đọc hình ảnh hóa đơn này và trích xuất chính xác ngày tháng, giờ ra vào, tên món, ghi chú, số lượng, đơn giá, thành tiền, chiết khấu và tổng cộng.`;

    parts.push({ text: promptText });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: { parts },
      config: {
        systemInstruction: buildSystemInstructionBillOcr(
          categories,
          existingProducts
        ),
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
                  description:
                    'Ngày hóa đơn định dạng YYYY-MM-DD (tính theo ca bán 09:00 sáng -> 08:00 sáng hôm sau)',
                },
                rawDate: {
                  type: Type.STRING,
                  description: 'Ngày in trên hóa đơn định dạng YYYY-MM-DD',
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
                  description: 'Hình thức thanh toán: cash, transfer, hoặc debt',
                },
                debtorName: {
                  type: Type.STRING,
                  description:
                    'Tên người nợ nếu paymentType là debt, ngược lại là chuỗi rỗng',
                },
                subtotalAmount: {
                  type: Type.INTEGER,
                  description: 'Tổng tạm tính trước chiết khấu (số nguyên)',
                },
                discountAmount: {
                  type: Type.INTEGER,
                  description: 'Chiết khấu / giảm giá (số nguyên, 0 nếu không có)',
                },
                totalAmount: {
                  type: Type.INTEGER,
                  description: 'Tổng cộng hóa đơn (số nguyên thuần túy)',
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
                    description: 'Tên món ăn / nước uống chuẩn (đã tách riêng ghi chú)',
                  },
                  note: {
                    type: Type.STRING,
                    description:
                      'Ghi chú món ăn (VD: làm cay, hoặc danh sách các món con trong combo)',
                  },
                  category: {
                    type: Type.STRING,
                    description: 'Danh mục phân loại sản phẩm',
                  },
                  quantity: {
                    type: Type.INTEGER,
                    description: 'Số lượng',
                  },
                  unitPrice: {
                    type: Type.INTEGER,
                    description: 'Đơn giá (số nguyên)',
                  },
                  subtotal: {
                    type: Type.INTEGER,
                    description: 'Thành tiền = quantity * unitPrice',
                  },
                },
                required: [
                  'productName',
                  'category',
                  'quantity',
                  'unitPrice',
                  'subtotal',
                ],
              },
            },
          },
          required: ['billInfo', 'items'],
        },
      },
    });

    const textOutput = response.text || '{}';
    const parsed = JSON.parse(textOutput);
    const normalized = sanitizeExtractedBill(
      parsed,
      fallbackDate,
      existingProducts,
      categories
    );
    res.json(normalized);
  } catch (error: any) {
    console.error('Error in /api/ocr-bill:', error);
    res.status(500).json({
      error: error?.message || 'Không thể xử lý hóa đơn bằng AI lúc này.',
    });
  }
});

// 5. POST Parse Products (Bulk Menu Upload / Gemini Product Recognition)
app.post('/api/parse-products', async (req, res) => {
  try {
    const { imageBase64, mimeType, rawText, apiKey, categories } = req.body || {};
    const headerKey = req.headers['x-gemini-api-key'];
    if (!imageBase64 && (!rawText || !String(rawText).trim())) {
      res
        .status(400)
        .json({ error: 'Vui lòng cung cấp ảnh thực đơn hoặc danh sách món.' });
      return;
    }

    const ai = getGeminiClient(
      typeof apiKey === 'string' && apiKey.trim()
        ? apiKey
        : typeof headerKey === 'string'
        ? headerKey
        : undefined
    );

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
        ? `Trích xuất danh sách sản phẩm theo cấu trúc (Tên sản phẩm, Danh mục, Giá bán) từ văn bản sau:\n${rawText}`
        : `Trích xuất toàn bộ danh sách sản phẩm theo cấu trúc (Tên sản phẩm, Danh mục, Giá bán) từ hình ảnh menu/hóa đơn này.`,
    });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: { parts },
      config: {
        systemInstruction: `Bạn là chuyên gia số hóa thực đơn nhà hàng/quán nhậu. Hãy trích xuất các món ăn/thức uống theo logic: Tên sản phẩm (productName), Danh mục (category - giữ nguyên danh mục người dùng ghi trong văn bản hoặc xếp vào [${catList}]), Giá bán (unitPrice - số nguyên VNĐ, ví dụ 20k -> 20000).`,
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
    const products = (parsed.products || [])
      .map((p: any) => {
        let price = normalizeMoneyNumber(p.unitPrice);
        if (price > 0 && price < 1000) price *= 1000;
        const name = String(p.productName || '').trim();
        const cat =
          String(p.category || '').trim() || inferCategory(name, categories);
        return {
          productName: name,
          category: cat,
          unitPrice: price,
          unit: String(p.unit || '').trim() || inferUnit(name, cat),
        };
      })
      .filter((p: any) => p.productName);

    res.json({ products });
  } catch (error: any) {
    console.error('Error in /api/parse-products:', error);
    res.status(500).json({
      error: error?.message || 'Không thể phân tích danh sách sản phẩm bằng Gemini AI.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VQBill server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
