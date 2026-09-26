import 'dotenv/config';
import express from 'express';
import path from 'path';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '25mb' }));

function getGeminiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const SYSTEM_INSTRUCTION_BILL_OCR = `Bạn là một hệ thống AI chuyên gia trích xuất và xử lý dữ liệu hóa đơn (OCR & Text Parser) cho ứng dụng quản lý bán hàng.

Nhiệm vụ của bạn là tiếp nhận dữ liệu đầu vào (có thể là HÌNH ẢNH HÓA ĐƠN hoặc ĐOẠN VĂN BẢN COPY/DÁN) và trích xuất thành định dạng JSON chuẩn xác 100%, không kèm lời giải thích hay định dạng Markdown ngoài JSON.

---
### QUY TẮC XỬ LÝ DỮ LIỆU:

1. PHÂN LOẠI DANH MỤC (category):
   Dựa vào tên món ăn/nước uống, hãy tự động xếp vào một trong các danh mục sau (nếu chưa có thì tự định nghĩa ngắn gọn, chính xác):
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
  const rawDate = typeof billInfo.billDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(billInfo.billDate.trim())
    ? billInfo.billDate.trim()
    : fallbackDate;

  let paymentType: 'cash' | 'transfer' | 'debt' = 'cash';
  if (billInfo.paymentType === 'transfer' || billInfo.paymentType === 'debt' || billInfo.paymentType === 'cash') {
    paymentType = billInfo.paymentType;
  }

  const debtorName = paymentType === 'debt' && typeof billInfo.debtorName === 'string'
    ? billInfo.debtorName.trim()
    : '';

  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const items = rawItems
    .map((item: any) => {
      const productName = typeof item?.productName === 'string' ? item.productName.trim() : '';
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

      const category = typeof item?.category === 'string' && item.category.trim()
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

  const computedTotal = items.reduce((sum: number, it: any) => sum + (it?.subtotal || 0), 0);
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

app.post('/api/ocr-bill', async (req, res) => {
  try {
    const { imageBase64, mimeType, rawText, defaultDate } = req.body || {};
    const fallbackDate = typeof defaultDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(defaultDate)
      ? defaultDate
      : new Date().toISOString().slice(0, 10);

    if (!imageBase64 && (!rawText || !String(rawText).trim())) {
      res.status(400).json({ error: 'Vui lòng cung cấp hình ảnh hóa đơn hoặc văn bản hóa đơn.' });
      return;
    }

    const ai = getGeminiClient();
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
        systemInstruction: SYSTEM_INSTRUCTION_BILL_OCR,
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
                  description: 'Tên người nợ nếu paymentType là debt, ngược lại là chuỗi rỗng',
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
                    description: 'Danh mục phân loại: Bia, Nước ngọt, Khai vị, Ếch, Gà, Hải sản, Lẩu / Món chính, Khác',
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
                required: ['productName', 'category', 'quantity', 'unitPrice', 'subtotal'],
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

app.post('/api/parse-products', async (req, res) => {
  try {
    const { imageBase64, mimeType, rawText } = req.body || {};
    if (!imageBase64 && (!rawText || !String(rawText).trim())) {
      res.status(400).json({ error: 'Vui lòng cung cấp ảnh thực đơn hoặc danh sách món.' });
      return;
    }

    const ai = getGeminiClient();
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
        ? `Trích xuất danh sách món ăn/đồ uống từ văn bản sau:\n${rawText}`
        : `Trích xuất toàn bộ danh sách món ăn/đồ uống và đơn giá từ hình ảnh menu/hóa đơn này.`,
    });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts },
      config: {
        systemInstruction: `Bạn là chuyên gia số hóa thực đơn nhà hàng/quán nhậu. Hãy trích xuất các món ăn/thức uống và tự động xếp vào danh mục: "Bia", "Nước ngọt", "Khai vị", "Ếch", "Gà", "Hải sản", "Lẩu / Món chính", "Khác". Chuẩn hóa đơn giá về số nguyên VNĐ (ví dụ 20k -> 20000).`,
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
    const products = (parsed.products || []).map((p: any) => {
      let price = normalizePriceNumber(p.unitPrice);
      if (price > 0 && price < 1000) price *= 1000;
      const name = String(p.productName || '').trim();
      return {
        productName: name,
        category: p.category || inferCategoryFromName(name),
        unitPrice: price,
        unit: p.unit || 'Phần',
      };
    }).filter((p: any) => p.productName);

    res.json({ products });
  } catch (error: any) {
    console.error('Error in /api/parse-products:', error);
    res.status(500).json({
      error: error?.message || 'Không thể phân tích danh sách sản phẩm.',
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
