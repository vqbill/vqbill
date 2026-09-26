import 'dotenv/config';
import express from 'express';
import path from 'path';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

function buildSystemInstructionBillOcr(customCategories?: string[]) {
  const catList =
    Array.isArray(customCategories) && customCategories.length > 0
      ? customCategories.join(', ')
      : 'Bia, Nước ngọt, Khai vị, Ếch, Gà, Hải sản, Lẩu / Món chính, Khác';

  return `Bạn là một hệ thống AI chuyên gia trích xuất và xử lý dữ liệu hóa đơn (OCR & Text Parser) cho ứng dụng quản lý bán hàng.

Nhiệm vụ của bạn là tiếp nhận dữ liệu đầu vào (có thể là HÌNH ẢNH HÓA ĐƠN hoặc ĐOẠN VĂN BẢN COPY/DÁN) và trích xuất thành định dạng JSON chuẩn xác 100%, không kèm lời giải thích hay định dạng Markdown ngoài JSON.

---
### QUY TẮC XỬ LÝ DỮ LIỆU:

1. PHÂN LOẠI DANH MỤC (category):
   Dựa vào tên món ăn/nước uống, hãy tự động xếp vào một trong các danh mục hiện có sau: [${catList}].
   - "Bia": Tất cả các loại bia (Bia Sài Gòn, Tiger, Tiger Lùn, Heineken, Larue, Budweiser,...)
   - "Nước ngọt": Nước giải khát, nước lọc, Redbull, Coca, Pepsi, soda, trà đá, khăn lạnh...
   - "Khai vị": Đậu hũ, khoai tây chiên, gỏi, chả giò, đậu lạc, nem chua...
   - "Ếch": Các món chế biến từ ếch (Ếch sapo, ếch chiên bơ, ếch rơm, ếch xào sa tế...)
   - "Gà": Các món chế biến từ gà (Gà chiên mắm, gà hấp lá chanh, lẩu gà, cánh gà...)
   - "Hải sản": Tôm, mực, cá, cua, ốc, nghêu...
   - "Lẩu / Món chính": Các loại lẩu, cơm xào, mì xào, bò, heo...
   - "Khác": Thuốc lá, dịch vụ, hoặc các mục không thuộc nhóm trên.

2. HÌNH THỨC THANH TOÁN (paymentType):
   - Trả về "transfer": Nếu có từ khóa "Chuyển khoản", "CK", "Mã QR", "Banking", "VietQR".
   - Trả về "debt": Nếu có từ khóa "Công nợ", "Ghi nợ", "Nợ", "Ký nợ" hoặc có tên khách hàng được đánh dấu nợ.
   - Trả về "cash": Mặc định cho tất cả các trường hợp còn lại hoặc không ghi rõ.

3. TÊN NGƯỜI NỢ (debtorName):
   - Trích xuất tên người nợ nếu paymentType là "debt". Nếu không có hoặc là thanh toán tiền mặt/chuyển khoản, trả về chuỗi rỗng "".

4. CHUẨN HÓA SỐ LIỆU (Numbers):
   - Loại bỏ tất cả dấu chấm, dấu phẩy, chữ "đ", "k" trong số tiền để trả về số nguyên (number) thuần túy.
   - Ví dụ: "150.000đ" -> 150000, "15k" -> 15000.
   - Nếu đơn giá hoặc thành tiền thiếu, hãy dùng công thức: subtotal = quantity * unitPrice để tính lại.`;
}

export function inferCategoryFromName(name: string): string {
  const lower = name.toLowerCase();
  if (/(bia|tiger|heineken|sài gòn|sai gon|larue|budweiser|333|ken|saporo|sapporo|huda|ruby)/i.test(lower)) {
    return 'Bia';
  }
  if (/(nước ngọt|nuoc ngot|nước suối|nuoc suoi|nước lọc|aquafina|dasani|redbull|red bull|bò húc|coca|pepsi|7up|sting|soda|trà đá|tra da|khăn lạnh|khan lanh|mirinda|sprite|fanta|revive|오롱|olong)/i.test(lower)) {
    return 'Nước ngọt';
  }
  if (/(ếch|ech)/i.test(lower)) {
    return 'Ếch';
  }
  if (/(gà|ga\b|cánh gà|chân gà|đùi gà|lẩu gà)/i.test(lower)) {
    return 'Gà';
  }
  if (/(tôm|mực|cá\b|cua|ốc|nghêu|sò|hàu|bạch tuộc|ghẹ|hải sản)/i.test(lower)) {
    return 'Hải sản';
  }
  if (/(đậu hũ|đậu khuôn|khoai tây|gỏi|chả giò|đậu lạc|đậu phộng|lạc rang|nem chua|khai vị|dưa leo|cà chua|bắp xào|xúc xích|phô mai que)/i.test(lower)) {
    return 'Khai vị';
  }
  if (/(lẩu|cơm|mì\b|miến|bún|phở|bò|heo|lợn|dê|vịt|sườn|ba chỉ|dồi|nầm)/i.test(lower)) {
    return 'Lẩu / Món chính';
  }
  return 'Khác';
}

function normalizePriceNumber(val: unknown): number {
  if (typeof val === 'number' && !Number.isNaN(val)) {
    return Math.round(val);
  }
  if (typeof val === 'string') {
    const cleaned = val.trim().toLowerCase();
    const isK = cleaned.endsWith('k') || cleaned.includes('k ');
    const digitsOnly = cleaned.replace(/[^\d]/g, '');
    if (!digitsOnly) return 0;
    const num = parseInt(digitsOnly, 10);
    if (isK && num < 10000) return num * 1000;
    return num;
  }
  return 0;
}

function sanitizeExtractedBill(raw: any, fallbackDate: string) {
  const billInfo = raw?.billInfo || {};
  const rawDate =
    typeof billInfo.billDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(billInfo.billDate.trim())
      ? billInfo.billDate.trim()
      : fallbackDate;

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
      const productName =
        typeof item?.productName === 'string' ? item.productName.trim() : '';
      if (!productName) return null;
      const quantity = Math.max(1, normalizePriceNumber(item?.quantity) || 1);
      let unitPrice = normalizePriceNumber(item?.unitPrice);
      let subtotal = normalizePriceNumber(item?.subtotal);

      if (unitPrice > 0 && unitPrice < 1000) {
        unitPrice = unitPrice * 1000;
      }
      if (subtotal > 0 && subtotal < 1000) {
        subtotal = subtotal * 1000;
      }

      if (subtotal === 0 && unitPrice > 0) {
        subtotal = quantity * unitPrice;
      } else if (unitPrice === 0 && subtotal > 0) {
        unitPrice = Math.round(subtotal / quantity);
      } else if (unitPrice > 0 && subtotal !== quantity * unitPrice) {
        subtotal = quantity * unitPrice;
      }

      const category =
        typeof item?.category === 'string' && item.category.trim()
          ? item.category.trim()
          : inferCategoryFromName(productName);

      return {
        productName,
        category,
        quantity,
        unitPrice,
        subtotal,
      };
    })
    .filter(Boolean);

  const computedTotal = items.reduce(
    (sum: number, it: any) => sum + (it?.subtotal || 0),
    0
  );
  let totalAmount = normalizePriceNumber(billInfo.totalAmount);
  if (totalAmount > 0 && totalAmount < 1000) totalAmount *= 1000;
  if (computedTotal > 0) {
    totalAmount = computedTotal;
  }

  return {
    billInfo: {
      billDate: rawDate,
      paymentType,
      debtorName,
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
      model: 'gemini-3.8-flash',
      contents: 'Trả lời đúng 1 từ: OK',
    });

    const latencyMs = Date.now() - startedAt;
    res.json({
      ok: true,
      model: 'gemini-3.8-flash',
      latencyMs,
      maskedKey: maskKey(activeKey),
      source: runtimeGeminiApiKey ? 'custom' : 'env',
      reply: (response.text || 'OK').trim(),
      message: `Gemini Key hợp lệ! Kết nối thành công tới model gemini-3.8-flash (${latencyMs}ms).`,
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
    } = req.body || {};
    const headerKey = req.headers['x-gemini-api-key'];
    const fallbackDate =
      typeof defaultDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(defaultDate)
        ? defaultDate
        : new Date().toISOString().slice(0, 10);

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
      : `Ngày mặc định (nếu trên hóa đơn không ghi rõ năm/tháng/ngày): ${fallbackDate}.\nHãy đọc hình ảnh hóa đơn này và trích xuất chính xác toàn bộ món ăn/thức uống, số lượng, đơn giá, thành tiền, hình thức thanh toán và người nợ (nếu có).`;

    parts.push({ text: promptText });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts },
      config: {
        systemInstruction: buildSystemInstructionBillOcr(categories),
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
                  description: 'Ngày hóa đơn định dạng YYYY-MM-DD',
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
                totalAmount: {
                  type: Type.INTEGER,
                  description: 'Tổng tiền hóa đơn (số nguyên thuần túy)',
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
                    description: 'Tên món ăn / nước uống',
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
    const normalized = sanitizeExtractedBill(parsed, fallbackDate);
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
      model: 'gemini-3.8-flash',
      contents: { parts },
      config: {
        systemInstruction: `Bạn là chuyên gia số hóa thực đơn nhà hàng/quán nhậu. Hãy trích xuất các món ăn/thức uống theo logic: Tên sản phẩm (productName), Danh mục (category - ưu tiên thuộc [${catList}], hoặc giữ đúng danh mục người dùng ghi), Giá bán (unitPrice - số nguyên VNĐ, ví dụ 20k -> 20000).`,
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
        let price = normalizePriceNumber(p.unitPrice);
        if (price > 0 && price < 1000) price *= 1000;
        const name = String(p.productName || '').trim();
        return {
          productName: name,
          category: String(p.category || '').trim() || inferCategoryFromName(name),
          unitPrice: price,
          unit: String(p.unit || '').trim() || 'Phần',
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
