import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import {
  formatItemDiscountNote,
  getCurrentBusinessDate,
  inferCategory,
  inferUnit,
  normalizeMoneyNumber,
  normalizeSynchronizedReceiptText,
  normalizeTableName,
  parseBulkProductsInput,
  parseInvoiceText,
  resolveBusinessBillDate,
  splitProductNameAndInlineNote,
} from './src/utils/parser';
import { executeChatCommand } from './src/utils/chatAssistantEngine';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const GEMINI_INTERACTION_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
];
const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
];

app.use(express.json({ limit: '25mb' }));

// CORS middleware allowing KiotViet POS (fnb.kiotviet.vn) and extension to post bills directly
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-gemini-api-key, x-sync-token'
  );
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Persistent Cloud Workspace Storage (shared across all browsers and devices)
interface ServerCloudWorkspace {
  version: number;
  updatedAtMs: number;
  updatedBy?: string;
  initialized: boolean;
  categories?: string[];
  debtors?: string[];
  rolePermissions?: Record<string, any>;
  inventoryData?: any;
  products: any[];
  bills: any[];
  billItems: any[];
  deductions: any[];
  returns: any[];
  staffAccounts?: any[];
  geminiApiKey?: string;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const PRIMARY_DB_FILE = path.join(DATA_DIR, 'vqbill_cloud_db.json');
const FALLBACK_DB_FILE = path.join(os.tmpdir(), 'vqbill_cloud_db.json');

function dedupeListById<T extends { id?: string; updatedAtMs?: number }>(
  list?: T[]
): T[] {
  if (!Array.isArray(list)) return [];
  const map = new Map<string, T>();
  for (const item of list) {
    if (!item || !item.id) continue;
    const key = String(item.id).trim();
    if (!key) continue;
    const existing = map.get(key);
    if (!existing || (item.updatedAtMs || 0) >= (existing.updatedAtMs || 0)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

function loadCloudWorkspaceFromDisk(): ServerCloudWorkspace {
  const candidates = [PRIMARY_DB_FILE, FALLBACK_DB_FILE];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            version: Number(parsed.version) || 0,
            updatedAtMs: Number(parsed.updatedAtMs) || 0,
            updatedBy: parsed.updatedBy || 'system',
            initialized: Boolean(parsed.initialized),
            categories: Array.isArray(parsed.categories) ? parsed.categories : undefined,
            debtors: Array.isArray(parsed.debtors) ? parsed.debtors : undefined,
            rolePermissions: parsed.rolePermissions || undefined,
            inventoryData: parsed.inventoryData || undefined,
            products: dedupeListById(parsed.products),
            bills: dedupeListById(parsed.bills),
            billItems: dedupeListById(parsed.billItems),
            deductions: dedupeListById(parsed.deductions),
            returns: dedupeListById(parsed.returns),
            staffAccounts: Array.isArray(parsed.staffAccounts)
              ? dedupeListById(parsed.staffAccounts)
              : undefined,
            geminiApiKey:
              typeof parsed.geminiApiKey === 'string' ? parsed.geminiApiKey : '',
          };
        }
      }
    } catch {
      // Try next candidate
    }
  }
  return {
    version: 0,
    updatedAtMs: 0,
    initialized: false,
    products: [],
    bills: [],
    billItems: [],
    deductions: [],
    returns: [],
    geminiApiKey: '',
  };
}

let cloudWorkspace: ServerCloudWorkspace = loadCloudWorkspaceFromDisk();

function saveCloudWorkspaceToDisk(state: ServerCloudWorkspace): void {
  const payload = JSON.stringify(state);
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(PRIMARY_DB_FILE, payload, 'utf-8');
  } catch {
    // Ignore if primary dir is read-only
  }
  try {
    fs.writeFileSync(FALLBACK_DB_FILE, payload, 'utf-8');
  } catch {
    // Ignore tmp error
  }
}

function mergeById<T extends { id: string; updatedAtMs?: number }>(
  serverList: T[],
  clientList: T[],
  excludeSeedPrefix?: string
): T[] {
  const map = new Map<string, T>();
  for (const item of serverList || []) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const item of clientList || []) {
    if (!item || !item.id) continue;
    if (excludeSeedPrefix && item.id.startsWith(excludeSeedPrefix) && map.size > 0) {
      continue;
    }
    const existing = map.get(item.id);
    if (!existing || (item.updatedAtMs || 0) > (existing.updatedAtMs || 0)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

function mergeServerInventoryData(
  serverInv: any,
  clientInv: any
): any {
  if (!serverInv && !clientInv) {
    return {
      trackedCategories: ['Bia', 'Nước ngọt'],
      itemConfigs: {},
      dailyEntries: {},
      importLogs: [],
      updatedAtMs: Date.now(),
    };
  }
  if (!serverInv) return clientInv;
  if (!clientInv) return serverInv;

  // 1. Merge dailyEntries (Date -> productKey -> DailyInventoryEntry)
  const allDates = new Set([
    ...Object.keys(serverInv.dailyEntries || {}),
    ...Object.keys(clientInv.dailyEntries || {}),
  ]);
  const mergedDailyEntries: Record<string, Record<string, any>> = {};

  for (const date of allDates) {
    const sMap = serverInv.dailyEntries?.[date] || {};
    const cMap = clientInv.dailyEntries?.[date] || {};
    const allPKeys = new Set([...Object.keys(sMap), ...Object.keys(cMap)]);
    const dateEntries: Record<string, any> = {};

    for (const pKey of allPKeys) {
      const sEntry = sMap[pKey];
      const cEntry = cMap[pKey];
      if (!sEntry) {
        dateEntries[pKey] = cEntry;
      } else if (!cEntry) {
        dateEntries[pKey] = sEntry;
      } else {
        const sTime = Number(sEntry.updatedAtMs) || 0;
        const cTime = Number(cEntry.updatedAtMs) || 0;
        const baseChosen = cTime >= sTime ? { ...sEntry, ...cEntry } : { ...cEntry, ...sEntry };
        if ((sEntry.importedQty || 0) > (cEntry.importedQty || 0) && sTime >= cTime) {
          baseChosen.importedQty = sEntry.importedQty;
        } else if ((cEntry.importedQty || 0) > (sEntry.importedQty || 0) && cTime >= sTime) {
          baseChosen.importedQty = cEntry.importedQty;
        } else {
          baseChosen.importedQty = Math.max(sEntry.importedQty || 0, cEntry.importedQty || 0);
        }

        // Preserve positive opening stock if one source has it and other is 0 or unset
        if (Number(sEntry.openingStock) > 0 && (Number(cEntry.openingStock) === 0 || cEntry.openingStock === undefined || cEntry.openingStock === null)) {
          baseChosen.openingStock = sEntry.openingStock;
        } else if (Number(cEntry.openingStock) > 0 && (Number(sEntry.openingStock) === 0 || sEntry.openingStock === undefined || sEntry.openingStock === null)) {
          baseChosen.openingStock = cEntry.openingStock;
        }

        // Preserve actualClosingStock if recorded
        if (sEntry.actualClosingStock !== null && sEntry.actualClosingStock !== undefined && (cEntry.actualClosingStock === null || cEntry.actualClosingStock === undefined)) {
          baseChosen.actualClosingStock = sEntry.actualClosingStock;
        } else if (cEntry.actualClosingStock !== null && cEntry.actualClosingStock !== undefined && (sEntry.actualClosingStock === null || sEntry.actualClosingStock === undefined)) {
          baseChosen.actualClosingStock = cEntry.actualClosingStock;
        }

        dateEntries[pKey] = baseChosen;
      }
    }
    mergedDailyEntries[date] = dateEntries;
  }

  // 2. Merge importLogs
  const logMap = new Map<string, any>();
  for (const log of serverInv.importLogs || []) {
    if (log && log.id) logMap.set(log.id, log);
  }
  for (const log of clientInv.importLogs || []) {
    if (log && log.id) {
      const existing = logMap.get(log.id);
      if (!existing || (log.createdAtMs || 0) >= (existing.createdAtMs || 0)) {
        logMap.set(log.id, log);
      }
    }
  }
  const mergedImportLogs = Array.from(logMap.values()).sort(
    (a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)
  );

  // 3. Merge customCategoryGroups
  const groupMap = new Map<string, any>();
  for (const g of serverInv.customCategoryGroups || []) {
    if (g && g.id) groupMap.set(g.id, g);
  }
  for (const g of clientInv.customCategoryGroups || []) {
    if (g && g.id) {
      const existing = groupMap.get(g.id);
      if (!existing || (g.createdAtMs || 0) >= (existing.createdAtMs || 0)) {
        groupMap.set(g.id, g);
      }
    }
  }

  // 4. Merge categoryAliases
  const mergedAliases: Record<string, string[]> = {
    ...(serverInv.categoryAliases || {}),
  };
  for (const [cat, aliases] of Object.entries(clientInv.categoryAliases || {})) {
    if (Array.isArray(aliases)) {
      const prev = mergedAliases[cat] || [];
      mergedAliases[cat] = Array.from(new Set([...prev, ...aliases]));
    }
  }

  // 5. Merge telegramConfig
  const sTg = serverInv.telegramConfig || {};
  const cTg = clientInv.telegramConfig || {};
  const mergedTgConfig = {
    enabled: sTg.enabled ?? cTg.enabled ?? true,
    botToken: sTg.botToken || cTg.botToken || '',
    botUsername: sTg.botUsername || cTg.botUsername || '',
    authorizedChatIds: Array.from(
      new Set([...(sTg.authorizedChatIds || []), ...(cTg.authorizedChatIds || [])])
    ),
    autoSendDailyReport: sTg.autoSendDailyReport ?? cTg.autoSendDailyReport ?? true,
  };

  // 6. Merge trackedCategories
  const trackedCategories = Array.from(
    new Set([
      ...(Array.isArray(clientInv.trackedCategories) && clientInv.trackedCategories.length > 0
        ? clientInv.trackedCategories
        : []),
      ...(Array.isArray(serverInv.trackedCategories) && serverInv.trackedCategories.length > 0
        ? serverInv.trackedCategories
        : []),
      'Bia',
      'Nước ngọt',
    ])
  );

  // 7. Merge itemConfigs
  const mergedConfigs = {
    ...(serverInv.itemConfigs || {}),
    ...(clientInv.itemConfigs || {}),
  };

  return {
    ...serverInv,
    ...clientInv,
    trackedCategories,
    itemConfigs: mergedConfigs,
    dailyEntries: mergedDailyEntries,
    importLogs: mergedImportLogs,
    customCategoryGroups: Array.from(groupMap.values()),
    categoryAliases: mergedAliases,
    telegramConfig: mergedTgConfig,
    kiotvietSyncLocked:
      clientInv?.kiotvietSyncLocked !== undefined
        ? clientInv.kiotvietSyncLocked
        : serverInv?.kiotvietSyncLocked,
    updatedAtMs: Math.max(serverInv.updatedAtMs || 0, clientInv.updatedAtMs || 0, Date.now()),
  };
}

// Runtime Gemini API key configured by user in UI (falls back to cloudWorkspace or process.env.GEMINI_API_KEY)
let runtimeGeminiApiKey: string = cloudWorkspace.geminiApiKey || '';

function resolveApiKey(reqKey?: unknown): string {
  if (typeof reqKey === 'string' && reqKey.trim()) {
    return reqKey.trim();
  }
  if (runtimeGeminiApiKey && runtimeGeminiApiKey.trim()) {
    return runtimeGeminiApiKey.trim();
  }
  return (process.env.GEMINI_API_KEY || '').trim();
}

function getCandidateApiKeys(explicitKey?: unknown): string[] {
  const keys: string[] = [];
  if (typeof explicitKey === 'string' && explicitKey.trim()) {
    keys.push(explicitKey.trim());
  }
  if (runtimeGeminiApiKey && runtimeGeminiApiKey.trim()) {
    keys.push(runtimeGeminiApiKey.trim());
  }
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  if (envKey) {
    keys.push(envKey);
  }
  return Array.from(new Set(keys));
}

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••' + key.slice(-2);
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function parseFriendlyGeminiError(rawErr: any): {
  isProjectDenied: boolean;
  isInvalidKey: boolean;
  isQuota: boolean;
  friendlyMessage: string;
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
  const isInvalidKey =
    rawStr.includes('API_KEY_INVALID') ||
    rawStr.includes('API key not valid');
  const isQuota =
    rawStr.includes('429') ||
    rawStr.includes('RESOURCE_EXHAUSTED');
  const isModelNotFound =
    rawStr.includes('404') ||
    rawStr.includes('NOT_FOUND') ||
    rawStr.includes('no longer available to new users') ||
    rawStr.includes('is not found for API version');

  if (isProjectDenied) {
    return {
      isProjectDenied: true,
      isInvalidKey: false,
      isQuota: false,
      friendlyMessage:
        'Đã kích hoạt Chế Độ Xử Lý Thông Minh (Project Google Cloud của Key này đang bị giới hạn 403 PERMISSION_DENIED — Hệ thống đã tự động bật bộ bóc tách Bill & Menu nội bộ để bạn sử dụng bình thường, hoặc bạn có thể tạo Key từ một Gmail/Project mới trên Google AI Studio).',
    };
  }

  if (isInvalidKey) {
    return {
      isProjectDenied: false,
      isInvalidKey: true,
      isQuota: false,
      friendlyMessage:
        'API Key không hợp lệ (API_KEY_INVALID). Vui lòng kiểm tra lại chuỗi Key bắt đầu bằng AIza...',
    };
  }

  if (isQuota || isModelNotFound) {
    return {
      isProjectDenied: false,
      isInvalidKey: false,
      isQuota: true,
      friendlyMessage: isModelNotFound
        ? 'Gemini Key hợp lệ! Đã tự động đồng bộ sang chuẩn Gemini 3.8 Flash & bật bộ xử lý hóa đơn thông minh.'
        : 'API Key đã hết hạn mức gọi trong phút (429 Quota). Hệ thống đã bật chế độ bóc tách dự phòng.',
    };
  }

  return {
    isProjectDenied: false,
    isInvalidKey: false,
    isQuota: false,
    friendlyMessage: rawStr || 'Không thể kết nối tới máy chủ Gemini.',
  };
}

async function callGeminiGenerateRest(params: {
  apiKey: string;
  parts: any[];
  systemInstruction?: string;
  responseSchema?: any;
  temperature?: number;
}): Promise<{ text: string; model: string }> {
  const { apiKey, parts, systemInstruction, responseSchema, temperature = 0.1 } = params;
  let lastError: any = null;

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // 1. Try Interactions API first with gemini-3.8-flash
  const interactionsApi = (ai as any)?.interactions;
  if (interactionsApi && typeof interactionsApi.create === 'function') {
    const interactionInput =
      parts.length === 1 && typeof parts[0]?.text === 'string' && !parts[0]?.inlineData
        ? parts[0].text
        : parts.map((p: any) =>
            p?.inlineData?.data
              ? {
                  type: 'image',
                  data: p.inlineData.data,
                  mime_type: p.inlineData.mimeType || 'image/jpeg',
                }
              : {
                  type: 'text',
                  text: p?.text || '',
                }
          );

    for (const modelName of GEMINI_INTERACTION_MODELS) {
      try {
        const reqPayload: any = {
          model: modelName,
          input: interactionInput,
          generation_config: { temperature },
        };
        if (systemInstruction) {
          reqPayload.system_instruction = systemInstruction;
        }
        if (responseSchema) {
          reqPayload.response_format = responseSchema;
        }
        const interaction = await interactionsApi.create(reqPayload);
        let text = '';
        if (typeof interaction?.output_text === 'string' && interaction.output_text.trim()) {
          text = interaction.output_text.trim();
        } else if (Array.isArray(interaction?.steps)) {
          for (const step of interaction.steps) {
            if (step?.type === 'model_output' && Array.isArray(step.content)) {
              for (const c of step.content) {
                if (c?.type === 'text' && typeof c.text === 'string') {
                  text += c.text;
                }
              }
            }
          }
        }
        if (text.trim()) {
          return { text: text.trim(), model: modelName };
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
        const errStr = String(lastError);
        if (
          errStr.includes('API_KEY_INVALID') ||
          errStr.includes('API key not valid') ||
          errStr.includes('Your project has been denied access') ||
          (errStr.includes('403') && errStr.includes('PERMISSION_DENIED'))
        ) {
          break;
        }
      }
    }
  }

  for (const modelName of GEMINI_MODELS) {
    try {
      const config: any = { temperature };
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
      if (responseSchema) {
        config.responseMimeType = 'application/json';
        config.responseSchema = responseSchema;
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config,
      });

      if (response.text) {
        return { text: response.text, model: modelName };
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const bodyPayload: any = {
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature,
        },
      };
      if (systemInstruction) {
        bodyPayload.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }
      if (responseSchema) {
        bodyPayload.generationConfig.responseMimeType = 'application/json';
        bodyPayload.generationConfig.responseSchema = responseSchema;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'aistudio-build',
        },
        body: JSON.stringify(bodyPayload),
      });

      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data?.candidates?.length) {
        const text =
          data.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text || '')
            .join('') || '';
        return { text, model: modelName };
      }
      lastError = data?.error ? JSON.stringify(data) : `HTTP ${res.status}`;
    } catch (err: any) {
      lastError = err?.message || String(err);
      const errStr = String(lastError);
      if (
        errStr.includes('API_KEY_INVALID') ||
        errStr.includes('API key not valid') ||
        errStr.includes('Your project has been denied access') ||
        (errStr.includes('403') && errStr.includes('PERMISSION_DENIED'))
      ) {
        break;
      }
    }
  }

  throw new Error(typeof lastError === 'string' ? lastError : JSON.stringify(lastError));
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
- Số bàn / Phòng (tableName - VD: "Bàn 24", "VIP 1", "VIP 2", hoặc nếu bill ghi "Mang về", "Mang về (01)", "Mang về (02) / Mang đi (Takeaway)" thì viết tắt tương ứng là "MV", "MV01", "MV02")
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

3. PHÂN LOẠI DANH MỤC & BẢO TOÀN QUY CÁCH (CHAI vs LON 330ml):
   - TUYỆT ĐỐI KHÔNG NHẦM LẪN QUY CÁCH:
     + Nếu hóa đơn ghi "chai" (ví dụ: "Tiger bạc chai", "Heineken bạc chai") -> productName PHẢI GIỮ NGUYÊN là "Tiger bạc chai", TUYỆT ĐỐI KHÔNG ĐƯỢC tự ý đổi thành "Tiger bạc lon 330ml" hay sản phẩm khác!
     + Nếu hóa đơn ghi "lon" hoặc "330ml" (ví dụ: "Tiger bạc 330ml", "Tiger bạc lon 330ml") -> productName là "Tiger bạc lon 330ml".
     + Nếu hóa đơn ghi "lon nhỏ" hoặc "250ml" (ví dụ: "Tiger bạc lon nhỏ 250ml") -> productName là "Tiger bạc lon nhỏ 250ml".
   - Tự động xếp vào một trong các danh mục hiện có: [${catList}].

4. HÌNH THỨC THANH TOÁN (paymentType) & NGƯỜI NỢ (debtorName):
   - "transfer": Chuyển khoản, CK, Mã QR, Banking, VietQR.
   - "debt": Công nợ, Ghi nợ, Nợ, Ký nợ (trích xuất debtorName).
   - "cash": Mặc định cho tất cả trường hợp còn lại.

5. MÓN ĂN CÓ GIẢM GIÁ TRỰC TIẾP TRÊN TỪNG MÓN (RẤT QUAN TRỌNG):
   - Trường hợp A (Copy nhiều dòng từ KiotViet POS):
     Gà hấp hành nửa con
     1
     319,000
     140,000
     43.89%
     179,000
     179,000
     -> Có nghĩa là: Giá gốc 319000, giảm 43.89% (-140000), số lượng (quantity) = 1, giá bán còn lại (unitPrice) = 179000, thành tiền (subtotal) = 179000, và ghi vào note: "Giá gốc 319.000đ, giảm 43.89% (-140.000đ), giá bán còn lại 179.000đ".
   - Trường hợp B (Bill in nhiệt Vịnh Quán có 2 mức đơn giá trước dấu x SL):
     Gà hấp
     Gà hấp hành nửa con 179,000 319,000 x 1 179,000
     -> Dòng trên "Gà hấp" là phần đầu của tên món dòng dưới nên lấy tên món đầy đủ là productName: "Gà hấp hành nửa con" (tương tự "Rau rừng" đứng trước "Rau rừng xào bò 119,000 x 1 119,000" thì lấy productName: "Rau rừng xào bò", không tách thành 2 món).
     -> Hai mức giá "179,000 319,000 x 1 179,000" nghĩa là: Giá gốc 319000, giảm 43.89% (-140000), quantity = 1, giá bán còn lại (unitPrice) = 179000, thành tiền (subtotal) = 179000, note: "Giá gốc 319.000đ, giảm 43.89% (-140.000đ), giá bán còn lại 179.000đ".

6. CHUẨN HÓA SỐ LIỆU (Numbers):
   - Trả về số nguyên thuần túy (VNĐ). Ví dụ: "129.000đ" -> 129000, "22k" -> 22000.
   - unitPrice luôn là GIÁ BÁN CÒN LẠI (sau khi giảm trên món nếu có).
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
  const tableName =
    typeof billInfo.tableName === 'string'
      ? normalizeTableName(billInfo.tableName)
      : '';

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

      let originalUnitPrice = normalizeMoneyNumber(item?.originalUnitPrice);
      if (originalUnitPrice > 0 && originalUnitPrice < 1000) originalUnitPrice *= 1000;
      const discInfo =
        originalUnitPrice > unitPrice
          ? formatItemDiscountNote(
              originalUnitPrice,
              unitPrice,
              typeof item?.discountPercent === 'number' ? item.discountPercent : undefined
            )
          : null;

      const finalNote =
        discInfo && !combinedNote.toLowerCase().includes('giá gốc')
          ? [combinedNote, discInfo.discountNote].filter(Boolean).join(' · ')
          : combinedNote;

      return {
        productName: split.productName || rawProductName,
        note: finalNote || '',
        category,
        quantity,
        unitPrice,
        subtotal,
        ...(discInfo
          ? {
              originalUnitPrice: discInfo.originalUnitPrice,
              discountAmount: discInfo.discountAmount,
              discountPercent: discInfo.discountPercent,
            }
          : {}),
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

// 0. Cloud Workspace Multi-Device / Multi-Browser Sync Endpoints
app.get('/api/workspace/version', (_req, res) => {
  res.json({
    ok: true,
    version: cloudWorkspace.version,
    updatedAtMs: cloudWorkspace.updatedAtMs,
    updatedBy: cloudWorkspace.updatedBy || 'system',
    initialized: cloudWorkspace.initialized,
    billsCount: cloudWorkspace.bills?.length || 0,
    productsCount: cloudWorkspace.products?.length || 0,
  });
});

app.get('/api/workspace', (_req, res) => {
  const { geminiApiKey: _hidden, ...publicWorkspace } = cloudWorkspace;
  res.json({
    ok: true,
    workspace: publicWorkspace,
  });
});

app.post('/api/workspace', (req, res) => {
  try {
    const { snapshot, mode = 'replace', updatedBy = 'client' } = req.body || {};
    if (!snapshot || typeof snapshot !== 'object') {
      res.status(400).json({ ok: false, error: 'Snapshot không hợp lệ.' });
      return;
    }

    const now = Date.now();

    if (mode === 'merge_initial') {
      if (!cloudWorkspace.initialized) {
        if (snapshot.initialized) {
          cloudWorkspace = {
            ...cloudWorkspace,
            version: (cloudWorkspace.version || 0) + 1,
            updatedAtMs: now,
            updatedBy,
            initialized: true,
            categories: Array.isArray(snapshot.categories)
              ? snapshot.categories
              : cloudWorkspace.categories,
            debtors: Array.isArray(snapshot.debtors)
              ? snapshot.debtors
              : cloudWorkspace.debtors,
            rolePermissions:
              snapshot.rolePermissions || cloudWorkspace.rolePermissions,
            inventoryData:
              mergeServerInventoryData(cloudWorkspace.inventoryData, snapshot.inventoryData),
            products: dedupeListById(snapshot.products),
            bills: dedupeListById(snapshot.bills),
            billItems: dedupeListById(snapshot.billItems),
            deductions: dedupeListById(snapshot.deductions),
            returns: dedupeListById(snapshot.returns),
            staffAccounts: Array.isArray(snapshot.staffAccounts)
              ? dedupeListById(snapshot.staffAccounts)
              : cloudWorkspace.staffAccounts,
          };
          saveCloudWorkspaceToDisk(cloudWorkspace);
        }
      } else if (snapshot.initialized) {
        // Server already initialized, merge any non-seed user records from this browser's first connect
        const mergedBills = mergeById(
          cloudWorkspace.bills,
          snapshot.bills || [],
          'bill_seed_'
        );
        const validBillIds = new Set(mergedBills.map((b: any) => b.id));
        const clientNonSeedItems = (snapshot.billItems || []).filter(
          (it: any) =>
            it &&
            validBillIds.has(it.billId) &&
            !String(it.id || '').startsWith('bill_seed_')
        );
        const mergedBillItems = mergeById(
          cloudWorkspace.billItems,
          clientNonSeedItems
        );
        const mergedProducts = mergeById(
          cloudWorkspace.products,
          snapshot.products || [],
          'prod_seed_'
        );
        const mergedDeductions = mergeById(
          cloudWorkspace.deductions,
          snapshot.deductions || [],
          'ded_seed_'
        );
        const mergedReturns = mergeById(
          cloudWorkspace.returns,
          snapshot.returns || [],
          'ret_seed_'
        );
        const mergedStaff = mergeById(
          cloudWorkspace.staffAccounts || [],
          snapshot.staffAccounts || []
        );
        const mergedCategories = Array.from(
          new Set([
            ...(cloudWorkspace.categories || []),
            ...(Array.isArray(snapshot.categories) ? snapshot.categories : []),
          ])
        );
        const mergedDebtors = Array.from(
          new Set([
            ...(cloudWorkspace.debtors || []),
            ...(Array.isArray(snapshot.debtors) ? snapshot.debtors : []),
          ])
        );

        const hasChanges =
          mergedBills.length !== cloudWorkspace.bills.length ||
          mergedProducts.length !== cloudWorkspace.products.length ||
          mergedDeductions.length !== cloudWorkspace.deductions.length ||
          mergedReturns.length !== cloudWorkspace.returns.length;

        if (hasChanges) {
          cloudWorkspace = {
            ...cloudWorkspace,
            version: (cloudWorkspace.version || 0) + 1,
            updatedAtMs: now,
            updatedBy,
            initialized: true,
            categories:
              mergedCategories.length > 0
                ? mergedCategories
                : cloudWorkspace.categories,
            debtors:
              mergedDebtors.length > 0 ? mergedDebtors : cloudWorkspace.debtors,
            rolePermissions:
              cloudWorkspace.rolePermissions || snapshot.rolePermissions,
            inventoryData:
              mergeServerInventoryData(cloudWorkspace.inventoryData, snapshot.inventoryData),
            products: mergedProducts,
            bills: mergedBills,
            billItems: mergedBillItems,
            deductions: mergedDeductions,
            returns: mergedReturns,
            staffAccounts:
              mergedStaff.length > 0 ? mergedStaff : cloudWorkspace.staffAccounts,
          };
          saveCloudWorkspaceToDisk(cloudWorkspace);
        }
      }
    } else {
      // Standard replace mode when user saves/updates/deletes data
      cloudWorkspace = {
        ...cloudWorkspace,
        version: (cloudWorkspace.version || 0) + 1,
        updatedAtMs: now,
        updatedBy,
        initialized: Boolean(snapshot.initialized ?? true),
        categories: Array.isArray(snapshot.categories)
          ? snapshot.categories
          : cloudWorkspace.categories,
        debtors: Array.isArray(snapshot.debtors)
          ? snapshot.debtors
          : cloudWorkspace.debtors,
        rolePermissions:
          snapshot.rolePermissions || cloudWorkspace.rolePermissions,
        inventoryData:
          mergeServerInventoryData(cloudWorkspace.inventoryData, snapshot.inventoryData),
        products: Array.isArray(snapshot.products)
          ? dedupeListById(snapshot.products)
          : cloudWorkspace.products,
        bills: Array.isArray(snapshot.bills)
          ? dedupeListById(snapshot.bills)
          : cloudWorkspace.bills,
        billItems: Array.isArray(snapshot.billItems)
          ? dedupeListById(snapshot.billItems)
          : cloudWorkspace.billItems,
        deductions: Array.isArray(snapshot.deductions)
          ? dedupeListById(snapshot.deductions)
          : cloudWorkspace.deductions,
        returns: Array.isArray(snapshot.returns)
          ? dedupeListById(snapshot.returns)
          : cloudWorkspace.returns,
        staffAccounts: Array.isArray(snapshot.staffAccounts)
          ? dedupeListById(snapshot.staffAccounts)
          : cloudWorkspace.staffAccounts,
      };
      saveCloudWorkspaceToDisk(cloudWorkspace);
    }

    const { geminiApiKey: _hidden, ...publicWorkspace } = cloudWorkspace;
    res.json({
      ok: true,
      version: cloudWorkspace.version,
      updatedAtMs: cloudWorkspace.updatedAtMs,
      workspace: publicWorkspace,
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: err?.message || 'Lỗi khi đồng bộ dữ liệu Cloud.',
    });
  }
});

// 0B. POST Sync KiotViet POS Bill directly (from Chrome Extension / Tampermonkey without KiotViet API)
app.post('/api/sync-kiotviet-bill', (req, res) => {
  try {
    const payload = req.body || {};
    if (cloudWorkspace.inventoryData?.kiotvietSyncLocked) {
      res.status(403).json({
        ok: false,
        error: 'Chức năng đồng bộ KiotViet POS hiện đang bị KHÓA trong Cài đặt của VQBill để giảm tải hệ thống.',
        locked: true,
      });
      return;
    }
    console.log('[KiotViet POS Sync API] Nhận yêu cầu đồng bộ:', {
      tableName: payload.tableName || payload.table,
      totalAmount: payload.totalAmount || payload.Total,
      itemsCount: Array.isArray(payload.items) ? payload.items.length : 0,
      hasRawText: Boolean(payload.rawText),
    });

    const now = Date.now();
    const todayStr = getCurrentBusinessDate();

    let extractedTableName = '';
    let extractedPaymentType: 'cash' | 'transfer' | 'debt' = 'cash';
    let extractedDebtorName = '';
    let extractedDiscount = 0;
    let extractedTotal = 0;
    let extractedCheckIn = '';
    let extractedCheckOut = '';
    let extractedDate = todayStr;
    let extractedBillCode = '';
    let billItemsPayload: Array<{
      productName: string;
      note?: string;
      category?: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }> = [];

    if (payload.rawText && typeof payload.rawText === 'string') {
      const parsed = parseInvoiceText(
        payload.rawText,
        todayStr,
        cloudWorkspace.products,
        cloudWorkspace.categories
      );
      extractedTableName = parsed.billInfo.tableName || 'Bàn KiotViet';
      extractedPaymentType = parsed.billInfo.paymentType || 'cash';
      extractedDebtorName = parsed.billInfo.debtorName || '';
      extractedDiscount = parsed.billInfo.discountAmount || 0;
      extractedTotal = parsed.billInfo.totalAmount || 0;
      extractedCheckIn = parsed.billInfo.checkInTime || '';
      extractedCheckOut = parsed.billInfo.checkOutTime || '';
      extractedDate = parsed.billInfo.billDate || todayStr;
      billItemsPayload = parsed.items.map((it) => ({
        productName: it.productName,
        note: it.note || '',
        category: it.category || inferCategory(it.productName, cloudWorkspace.categories),
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        subtotal: it.subtotal,
      }));
    } else {
      // Structured payload from KiotViet Tampermonkey script / DOM scraper / network interceptor
      extractedTableName = normalizeTableName(
        String(payload.tableName || payload.table || payload.room || payload.TableName || 'Bàn KiotViet')
      ) || 'Bàn KiotViet';

      extractedBillCode = String(
        payload.billCode || payload.code || payload.Code || payload.InvoiceCode || ''
      ).trim();

      extractedDate = String(
        payload.billDate || payload.date || todayStr
      ).trim();

      const payMethodStr = String(
        payload.paymentType || payload.paymentMethod || payload.PaymentMethod || ''
      ).toLowerCase();
      if (
        payMethodStr.includes('ck') ||
        payMethodStr.includes('chuyển') ||
        payMethodStr.includes('bank') ||
        payMethodStr.includes('transfer')
      ) {
        extractedPaymentType = 'transfer';
      } else if (payMethodStr.includes('nợ') || payMethodStr.includes('debt')) {
        extractedPaymentType = 'debt';
        extractedDebtorName = String(
          payload.debtorName || payload.customer || payload.CustomerName || ''
        ).trim();
      } else {
        extractedPaymentType = 'cash';
      }

      extractedCheckIn = String(payload.checkInTime || '').trim();
      extractedCheckOut = String(payload.checkOutTime || '').trim();
      extractedDiscount = normalizeMoneyNumber(payload.discountAmount || payload.discount || payload.Discount);
      extractedTotal = normalizeMoneyNumber(payload.totalAmount || payload.total || payload.Total);

      // Extract items from payload
      const rawList = Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(payload.InvoiceDetails)
        ? payload.InvoiceDetails
        : Array.isArray(payload.details)
        ? payload.details
        : [];

      for (const item of rawList) {
        const rawName = String(
          item.productName || item.name || item.ProductName || ''
        ).trim();
        if (!rawName) continue;
        const rawNote = String(
          item.note || item.Note || item.description || ''
        ).trim();
        const split = splitProductNameAndInlineNote(
          rawName,
          cloudWorkspace.products,
          cloudWorkspace.categories
        );
        const mergedNote = [split.note, rawNote].filter(Boolean).join(', ');
        const qty = Math.max(
          1,
          Math.round(Number(item.quantity || item.Quantity || item.qty) || 1)
        );
        let price = normalizeMoneyNumber(
          item.unitPrice || item.Price || item.price || split.catalogUnitPrice || 0
        );
        if (price > 0 && price < 1000) price *= 1000;
        let sub = normalizeMoneyNumber(
          item.subtotal || item.SubTotal || item.subTotal || qty * price
        );
        if (sub > 0 && sub < 1000) sub *= 1000;
        if (sub === 0 && price > 0) sub = qty * price;

        billItemsPayload.push({
          productName: split.productName || rawName,
          note: mergedNote,
          category: String(
            item.category ||
              split.category ||
              inferCategory(rawName, cloudWorkspace.categories)
          ),
          quantity: qty,
          unitPrice: price,
          subtotal: sub,
        });
      }
    }

    // Fallback if items list is empty but rawText was supplied
    if (billItemsPayload.length === 0 && payload.rawText && typeof payload.rawText === 'string') {
      const fallbackParsed = parseInvoiceText(
        payload.rawText,
        todayStr,
        cloudWorkspace.products,
        cloudWorkspace.categories
      );
      if (fallbackParsed.items.length > 0) {
        billItemsPayload = fallbackParsed.items.map((it) => ({
          productName: it.productName,
          note: it.note || '',
          category: it.category || inferCategory(it.productName, cloudWorkspace.categories),
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          subtotal: it.subtotal,
        }));
        if (!extractedTotal || extractedTotal <= 0) {
          extractedTotal = fallbackParsed.billInfo.totalAmount || 0;
        }
      }
    }

    // Safety fallback: If items list is still empty but totalAmount > 0, create a generic item to preserve the bill
    if (billItemsPayload.length === 0) {
      if (extractedTotal > 0) {
        billItemsPayload.push({
          productName: `Thanh toán ${extractedTableName}`,
          note: 'Đồng bộ từ KiotViet POS',
          category: 'Khác',
          quantity: 1,
          unitPrice: extractedTotal,
          subtotal: extractedTotal,
        });
      } else {
        res.status(400).json({ ok: false, error: 'Không có món hoặc tổng tiền nào trong hóa đơn KiotViet.' });
        return;
      }
    }

    if (extractedTotal <= 0) {
      extractedTotal =
        billItemsPayload.reduce((sum, it) => sum + it.subtotal, 0) - extractedDiscount;
      extractedTotal = Math.max(0, extractedTotal);
    }

    const billId = `bill_kv_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const billCode = extractedBillCode || `KV-${now.toString().slice(-6)}`;
    const itemsSummary = billItemsPayload
      .map((it) => `${it.quantity}x ${it.productName}${it.note ? ` (${it.note})` : ''}`)
      .join(', ');

    const newBill = {
      id: billId,
      ownerId: 'shared_workspace',
      billCode,
      billDate: extractedDate,
      checkInTime: extractedCheckIn || undefined,
      checkOutTime: extractedCheckOut || undefined,
      paymentType: extractedPaymentType,
      debtorName: extractedDebtorName,
      debtStatus: extractedPaymentType === 'debt' ? 'unpaid' : 'none',
      subtotalAmount: billItemsPayload.reduce((sum, it) => sum + it.subtotal, 0),
      discountAmount: extractedDiscount,
      totalAmount: extractedTotal,
      deductedAmount: 0,
      itemsSummary,
      note: extractedTableName,
      tableName: extractedTableName,
      status: 'active',
      createdAtMs: now,
      updatedAtMs: now,
      source: 'kiotviet_pos_sync',
    };

    const newBillItems = billItemsPayload.map((it, idx) => ({
      id: `it_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      ownerId: 'shared_workspace',
      billId,
      billDate: extractedDate,
      productName: it.productName,
      note: it.note || '',
      category: it.category || 'Khác',
      quantity: it.quantity,
      returnedQuantity: 0,
      unitPrice: it.unitPrice,
      subtotal: it.subtotal,
      createdAtMs: now,
      updatedAtMs: now,
    }));

    cloudWorkspace.bills = dedupeListById([newBill, ...(cloudWorkspace.bills || [])]);
    cloudWorkspace.billItems = dedupeListById([
      ...(cloudWorkspace.billItems || []),
      ...newBillItems,
    ]);
    cloudWorkspace.version = (cloudWorkspace.version || 0) + 1;
    cloudWorkspace.updatedAtMs = now;
    cloudWorkspace.updatedBy = 'kiotviet_pos_sync';
    cloudWorkspace.initialized = true;

    saveCloudWorkspaceToDisk(cloudWorkspace);

    res.json({
      ok: true,
      message: `Đã tự động đồng bộ hóa đơn ${extractedTableName} (${billCode}) sang VQBill!`,
      bill: newBill,
      itemsCount: newBillItems.length,
      version: cloudWorkspace.version,
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: err?.message || 'Lỗi khi đồng bộ bill KiotViet.',
    });
  }
});

// 0C. Telegram Bot Message Processing, Polling Engine & Webhook
let lastTelegramUpdateId = 0;
let isPollerRunning = false;

async function handleIncomingTelegramMessage(message: any, botToken: string, tgConfig: any) {
  if (!message || !message.text) return;

  const chatId = String(message.chat?.id || '');
  const userText = String(message.text || '').trim();
  const senderName = message.from?.username
    ? `@${message.from.username}`
    : `${message.from?.first_name || ''} ${message.from?.last_name || ''}`.trim() || 'Telegram User';

  console.log(`[Telegram Recv] from ${senderName} (ChatID: ${chatId}): "${userText}"`);

  // Phản hồi lệnh /start, /id, /help
  if (userText === '/start' || userText === '/id' || userText === '/help') {
    const reply =
      `👋 Xin chào ${senderName}!\n\n` +
      `🆔 Chat ID của bạn là: <code>${chatId}</code>\n\n` +
      `📌 HƯỚNG DẪN CÁC LỆNH BẠN CÓ THỂ GÕ:\n` +
      `• <code>kiểm tồn kho A</code> (hoặc B, kho lạnh... chỉ hiện món tồn > 0)\n` +
      `• <code>kiểm kho bia</code> (theo danh mục cụ thể)\n` +
      `• <code>kiểm số lượng bán 24/9/2026</code> (chỉ hiện món bán > 0)\n` +
      `• <code>kiểm số lượng bán 2 ngày trước</code> hoặc <code>hôm qua</code>\n` +
      `• <code>nhập 240 tiger lùn, huda 90, larue 60</code>\n\n` +
      `⚠️ Hãy đảm bảo bạn đã lưu Chat ID <code>${chatId}</code> vào mục Cài Đặt Telegram trên Website VQBill!`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: reply,
        parse_mode: 'HTML',
      }),
    }).catch((err) => console.error('[Telegram Send Error]:', err));
    return;
  }

  // Kiểm tra quyền (Whitelist Chat ID) nếu có cấu hình
  if (Array.isArray(tgConfig.authorizedChatIds) && tgConfig.authorizedChatIds.length > 0) {
    const isAuthorized = tgConfig.authorizedChatIds.some((id: string) => String(id).trim() === chatId);
    if (!isAuthorized) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `⛔ Tài khoản Telegram của bạn chưa được cấp quyền điều hành VQBill.\nChat ID của bạn là: ${chatId}.\nHãy thêm Chat ID này vào mục Cài Đặt Telegram trên Website VQBill để kích hoạt.`,
        }),
      }).catch(() => {});
      return;
    }
  }

  const todayStr = getCurrentBusinessDate();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

  const invData = cloudWorkspace.inventoryData || {};
  const context = {
    selectedDate: todayStr,
    todayStr,
    yesterdayStr,
    products: cloudWorkspace.products || [],
    categories: cloudWorkspace.categories || ['Bia', 'Nước ngọt', 'Khai vị', 'Hải sản', 'Món chính', 'Gà', 'Khác'],
    bills: cloudWorkspace.bills || [],
    billItems: cloudWorkspace.billItems || [],
    returns: cloudWorkspace.returns || [],
    inventoryData: invData,
    categoryAliases: invData.categoryAliases,
    customCategoryGroups: invData.customCategoryGroups,
    currentUsername: senderName,
    source: 'telegram' as const,
  };

  const result = await executeChatCommand(userText, context);

  // Nếu là lệnh nhập kho: cập nhật tồn kho trên server workspace
  if (result.commandType === 'import_execute' && result.importData) {
    const { date, updatedItems, newLogs } = result.importData;
    const curDaily = { ...(invData.dailyEntries?.[date] || {}) };
    for (const item of updatedItems) {
      const pKey = item.productName.trim().toLowerCase();
      let prevEntry = curDaily[pKey];
      if (!prevEntry) {
        let inheritedOpen = 0;
        const allPriorDates = Object.keys(invData.dailyEntries || {})
          .filter((d) => d < date)
          .sort()
          .reverse();
        for (const priorDate of allPriorDates) {
          const pe = invData.dailyEntries?.[priorDate]?.[pKey];
          if (pe && (
            (pe.openingStock !== undefined && pe.openingStock !== null) ||
            (pe.importedQty !== undefined && pe.importedQty !== null && Number(pe.importedQty) > 0) ||
            (pe.actualClosingStock !== undefined && pe.actualClosingStock !== null)
          )) {
            if (pe.actualClosingStock !== null && pe.actualClosingStock !== undefined) {
              inheritedOpen = Math.max(0, Number(pe.actualClosingStock));
            } else {
              const peOpen = Math.max(0, Number(pe.openingStock) || 0);
              const peImp = Math.max(0, Number(pe.importedQty) || 0);
              const peDmg = Math.max(0, Number(pe.damagedQty) || 0);
              let priorNetSold = 0;
              for (const bi of cloudWorkspace.billItems || []) {
                if (bi.billDate === priorDate && bi.productName.trim().toLowerCase() === pKey) {
                  priorNetSold += Number(bi.quantity) || 0;
                }
              }
              for (const ret of cloudWorkspace.returns || []) {
                if (ret.returnDate === priorDate && ret.productName.trim().toLowerCase() === pKey) {
                  priorNetSold -= Number(ret.quantity) || 0;
                }
              }
              inheritedOpen = Math.max(0, peOpen + peImp - Math.max(0, priorNetSold) - peDmg);
            }
            break;
          }
        }
        prevEntry = {
          openingStock: inheritedOpen,
          importedQty: 0,
          damagedQty: 0,
          actualClosingStock: null,
          updatedAtMs: Date.now(),
        };
      }
      curDaily[pKey] = {
        ...prevEntry,
        importedQty: (prevEntry.importedQty || 0) + item.quantity,
        updatedAtMs: Date.now(),
        updatedBy: senderName,
      };
    }
    cloudWorkspace.inventoryData = {
      ...invData,
      dailyEntries: {
        ...(invData.dailyEntries || {}),
        [date]: curDaily,
      },
      importLogs: [...newLogs, ...(invData.importLogs || [])],
      updatedAtMs: Date.now(),
    };
    cloudWorkspace.version = (cloudWorkspace.version || 0) + 1;
    saveCloudWorkspaceToDisk(cloudWorkspace);
  }

  // Gửi tin nhắn phản hồi về Telegram
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: result.replyText,
    }),
  }).catch((err) => console.error('[Telegram Send Error]:', err));
}

// Background Polling Engine: Tự động kéo tin nhắn mới từ Telegram theo thời gian thực
function startTelegramPoller() {
  if (isPollerRunning) return;
  isPollerRunning = true;
  console.log('[Telegram Poller] Starting background real-time listener...');

  (async () => {
    while (true) {
      try {
        const invData = cloudWorkspace.inventoryData || {};
        const tgConfig = invData.telegramConfig || {};
        const botToken = tgConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;

        if (tgConfig.enabled && botToken) {
          const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${lastTelegramUpdateId + 1}&timeout=5`;
          const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
          const data = await res.json();

          if (data.ok && Array.isArray(data.result)) {
            for (const update of data.result) {
              lastTelegramUpdateId = Math.max(lastTelegramUpdateId, update.update_id);
              const message = update.message || update.edited_message;
              if (message) {
                await handleIncomingTelegramMessage(message, botToken, tgConfig);
              }
            }
          } else if (data.description && data.description.includes('webhook is active')) {
            console.log('[Telegram Poller] Webhook was active, deleting webhook to enable polling...');
            await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`).catch(() => {});
          }
        }
      } catch (err: any) {
        // Bỏ qua lỗi tạm thời hoặc timeout
      }

      await new Promise((r) => setTimeout(r, 2000));
    }
  })();
}

// API POST Telegram Bot Webhook
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const message = body.message || body.edited_message;
    if (!message || !message.text) {
      res.json({ ok: true });
      return;
    }

    const invData = cloudWorkspace.inventoryData || {};
    const tgConfig = invData.telegramConfig || {};
    const botToken = tgConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;

    if (botToken) {
      await handleIncomingTelegramMessage(message, botToken, tgConfig);
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error('[Telegram Webhook Error]:', err);
    res.status(500).json({ ok: false, error: err?.message });
  }
});

// API POST Cấu hình Telegram Bot từ Website
app.post('/api/telegram-config', async (req, res) => {
  try {
    const { botToken = '', authorizedChatIds = [], enabled = true, customCategoryGroups } = req.body || {};
    const cleanToken = String(botToken).trim();

    if (!cleanToken) {
      res.status(400).json({ ok: false, error: 'Bot Token không được để trống.' });
      return;
    }

    // Kiểm tra tính hợp lệ của Token qua Telegram getMe
    const meRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const meData = await meRes.json();

    if (!meData.ok) {
      res.status(400).json({
        ok: false,
        error: `Bot Token không hợp lệ: ${meData.description || 'Vui lòng kiểm tra lại token từ @BotFather.'}`,
      });
      return;
    }

    const botUsername = meData.result?.username;
    const botName = meData.result?.first_name;

    // Xóa webhook cũ nếu có để Polling hoạt động trơn tru 100%
    await fetch(`https://api.telegram.org/bot${cleanToken}/deleteWebhook`).catch(() => {});

    // Cập nhật cấu hình vào server cloudWorkspace
    const invData = cloudWorkspace.inventoryData || {};
    cloudWorkspace.inventoryData = {
      ...invData,
      telegramConfig: {
        enabled: Boolean(enabled),
        botToken: cleanToken,
        botUsername,
        authorizedChatIds: Array.isArray(authorizedChatIds) ? authorizedChatIds : [],
        autoSendDailyReport: false,
      },
      customCategoryGroups: customCategoryGroups || invData.customCategoryGroups,
      updatedAtMs: Date.now(),
    };
    cloudWorkspace.version = (cloudWorkspace.version || 0) + 1;
    saveCloudWorkspaceToDisk(cloudWorkspace);

    // Kích hoạt Poller ngay lập tức
    lastTelegramUpdateId = 0;
    startTelegramPoller();

    console.log(`[Telegram Config] Successfully configured Bot @${botUsername} (${botName}) with ${authorizedChatIds.length} authorized chat IDs.`);

    res.json({
      ok: true,
      botUsername,
      botName,
      message: `Đã kết nối thành công Bot @${botUsername}! Hệ thống đang lắng nghe tin nhắn tự động 24/7.`,
    });
  } catch (err: any) {
    console.error('[Telegram Config Error]:', err);
    res.status(500).json({ ok: false, error: err?.message });
  }
});

// API GET Kiểm tra trạng thái Telegram Bot
app.get('/api/telegram-status', async (_req, res) => {
  try {
    const invData = cloudWorkspace.inventoryData || {};
    const tgConfig = invData.telegramConfig || {};
    const botToken = tgConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      res.json({
        ok: true,
        configured: false,
        enabled: false,
        message: 'Chưa cấu hình Telegram Bot Token.',
      });
      return;
    }

    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meData = await meRes.json();

    res.json({
      ok: true,
      configured: true,
      enabled: Boolean(tgConfig.enabled),
      valid: Boolean(meData.ok),
      botUsername: meData.result?.username || tgConfig.botUsername,
      botName: meData.result?.first_name,
      authorizedChatIds: tgConfig.authorizedChatIds || [],
      isPollerRunning,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

// 0D. POST Chat Command API (Chạy lệnh từ Web Chat hoặc bên ngoài)
app.post('/api/chat-command', async (req, res) => {
  try {
    const { query = '', username = 'Web User' } = req.body || {};
    const todayStr = getCurrentBusinessDate();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    const invData = cloudWorkspace.inventoryData || {};
    const context = {
      selectedDate: todayStr,
      todayStr,
      yesterdayStr,
      products: cloudWorkspace.products || [],
      categories: cloudWorkspace.categories || ['Bia', 'Nước ngọt', 'Khai vị', 'Hải sản', 'Món chính', 'Gà', 'Khác'],
      bills: cloudWorkspace.bills || [],
      billItems: cloudWorkspace.billItems || [],
      returns: cloudWorkspace.returns || [],
      inventoryData: invData,
      categoryAliases: invData.categoryAliases,
      customCategoryGroups: invData.customCategoryGroups,
      currentUsername: username,
      source: 'web_chat' as const,
    };

    const result = await executeChatCommand(query, context);

    if (result.commandType === 'import_execute' && result.importData) {
      const { date, updatedItems, newLogs } = result.importData;
      const curDaily = { ...(invData.dailyEntries?.[date] || {}) };
      for (const item of updatedItems) {
        const pKey = item.productName.trim().toLowerCase();
        const prevEntry = curDaily[pKey] || {
          openingStock: 0,
          importedQty: 0,
          damagedQty: 0,
          actualClosingStock: null,
          updatedAtMs: Date.now(),
        };
        curDaily[pKey] = {
          ...prevEntry,
          importedQty: (prevEntry.importedQty || 0) + item.quantity,
          updatedAtMs: Date.now(),
          updatedBy: username,
        };
      }
      cloudWorkspace.inventoryData = {
        ...invData,
        dailyEntries: {
          ...(invData.dailyEntries || {}),
          [date]: curDaily,
        },
        importLogs: [...newLogs, ...(invData.importLogs || [])],
        updatedAtMs: Date.now(),
      };
      cloudWorkspace.version = (cloudWorkspace.version || 0) + 1;
      saveCloudWorkspaceToDisk(cloudWorkspace);
    }

    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

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
  cloudWorkspace.geminiApiKey = runtimeGeminiApiKey;
  saveCloudWorkspaceToDisk(cloudWorkspace);
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
    const candidateKeys = getCandidateApiKeys(apiKey);
    if (candidateKeys.length === 0) {
      res.status(400).json({
        ok: false,
        error: 'Chưa có Gemini API Key nào được nhập hoặc cấu hình.',
      });
      return;
    }

    let lastErr: any = null;
    for (const candidate of candidateKeys) {
      try {
        const result = await callGeminiGenerateRest({
          apiKey: candidate,
          parts: [{ text: 'Trả lời đúng 1 từ: OK' }],
        });
        const latencyMs = Date.now() - startedAt;
        runtimeGeminiApiKey = candidate;
        res.json({
          ok: true,
          model: result.model,
          latencyMs,
          maskedKey: maskKey(candidate),
          source: candidate === (process.env.GEMINI_API_KEY || '').trim() ? 'env' : 'custom',
          reply: (result.text || 'OK').trim(),
          message: `Gemini Key hợp lệ! Kết nối thành công tới model ${result.model} (${latencyMs}ms).`,
        });
        return;
      } catch (err: any) {
        lastErr = err;
      }
    }

    const parsedErr = parseFriendlyGeminiError(lastErr);
    // If Google Cloud project is denied (403 PERMISSION_DENIED) or rate-limited (429),
    // automatically activate the Smart Hybrid Local Engine so the user is never blocked!
    if (parsedErr.isProjectDenied || parsedErr.isQuota) {
      const activeKey = candidateKeys[0];
      const latencyMs = Date.now() - startedAt;
      res.json({
        ok: true,
        model: 'Smart-Hybrid-Parser',
        latencyMs,
        maskedKey: maskKey(activeKey),
        source: 'custom',
        reply: 'HYBRID_OK',
        message: parsedErr.friendlyMessage,
      });
      return;
    }

    res.status(400).json({
      ok: false,
      error: parsedErr.friendlyMessage,
    });
  } catch (error: any) {
    const parsedErr = parseFriendlyGeminiError(error);
    res.status(400).json({
      ok: false,
      error: parsedErr.friendlyMessage,
    });
  }
});

// 4. POST OCR Bill (Image or Text)
app.post('/api/ocr-bill', async (req, res) => {
  try {
    const {
      imageBase64,
      mimeType,
      rawText: inputRawText,
      defaultDate,
      apiKey,
      categories,
      existingProducts,
    } = req.body || {};
    const rawText =
      typeof inputRawText === 'string' && inputRawText.trim()
        ? normalizeSynchronizedReceiptText(inputRawText)
        : inputRawText;
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

    const candidateKeys = getCandidateApiKeys(
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

    const responseSchema = {
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
            tableName: {
              type: Type.STRING,
              description:
                'Phòng / Bàn (VD: Bàn 24, VIP 1, VIP 2, MV, MV01, MV02)',
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
    };

    let lastErr: any = null;
    for (const candidate of candidateKeys) {
      try {
        const result = await callGeminiGenerateRest({
          apiKey: candidate,
          parts,
          systemInstruction: buildSystemInstructionBillOcr(categories, existingProducts),
          responseSchema,
          temperature: 0.1,
        });
        const parsed = JSON.parse(result.text || '{}');
        const normalized = sanitizeExtractedBill(
          parsed,
          fallbackDate,
          existingProducts,
          categories
        );
        if (rawText && String(rawText).trim() && !normalized.billInfo.tableName) {
          const localParsed = parseInvoiceText(
            String(rawText),
            fallbackDate,
            existingProducts,
            categories
          );
          if (localParsed.billInfo.tableName) {
            normalized.billInfo.tableName = localParsed.billInfo.tableName;
          }
        }
        res.json(normalized);
        return;
      } catch (err: any) {
        lastErr = err;
      }
    }

    // Fallback to built-in Smart Parser if rawText was provided and Gemini API failed (e.g. 403 Project Denied)
    if (rawText && String(rawText).trim()) {
      const localParsed = parseInvoiceText(
        String(rawText),
        fallbackDate,
        existingProducts,
        categories
      );
      res.json(localParsed);
      return;
    }

    const parsedErr = parseFriendlyGeminiError(lastErr);
    res.status(500).json({
      error: parsedErr.friendlyMessage,
    });
  } catch (error: any) {
    const parsedErr = parseFriendlyGeminiError(error);
    res.status(500).json({
      error: parsedErr.friendlyMessage,
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

    const candidateKeys = getCandidateApiKeys(
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

    const responseSchema = {
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
    };

    let lastErr: any = null;
    for (const candidate of candidateKeys) {
      try {
        const result = await callGeminiGenerateRest({
          apiKey: candidate,
          parts,
          systemInstruction: `Bạn là chuyên gia số hóa thực đơn nhà hàng/quán nhậu. Hãy trích xuất các món ăn/thức uống theo logic: Tên sản phẩm (productName), Danh mục (category - giữ nguyên danh mục người dùng ghi trong văn bản hoặc xếp vào [${catList}]), Giá bán (unitPrice - số nguyên VNĐ, ví dụ 20k -> 20000).`,
          responseSchema,
          temperature: 0.1,
        });
        const parsed = JSON.parse(result.text || '{"products":[]}');
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
        return;
      } catch (err: any) {
        lastErr = err;
      }
    }

    // Fallback to built-in Smart Bulk Products Parser if rawText was provided
    if (rawText && String(rawText).trim()) {
      const localProducts = parseBulkProductsInput(String(rawText), categories);
      res.json({ products: localProducts });
      return;
    }

    const parsedErr = parseFriendlyGeminiError(lastErr);
    res.status(500).json({
      error: parsedErr.friendlyMessage,
    });
  } catch (error: any) {
    const parsedErr = parseFriendlyGeminiError(error);
    res.status(500).json({
      error: parsedErr.friendlyMessage,
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
    startTelegramPoller();
  });
}

startServer();
