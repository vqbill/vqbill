import React, { useState, useRef } from 'react';
import {
  Camera,
  FileText,
  Upload,
  Plus,
  Trash2,
  Copy,
  Check,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Code2,
  Clock,
  MessageSquareText,
  Percent,
} from 'lucide-react';
import {
  ExtractedBillItem,
  ExtractedBillJSON,
  PaymentType,
  PAYMENT_LABELS,
  ConfirmRequestOptions,
  ProductRecord,
  GeminiKeyStatus,
} from '../types';
import {
  formatVND,
  getCurrentBusinessDate,
  inferCategory,
  parseRawTextToBillJSON,
  resolveBusinessBillDate,
  SAMPLE_BILL_TEMPLATES,
  splitProductNameAndInlineNote,
} from '../utils/parser';
import { extractBillWithGemini } from '../services/geminiService';
import { GeminiKeyBar } from './GeminiKeyBar';

interface OcrScannerTabProps {
  canWrite: boolean;
  categories: string[];
  products: ProductRecord[];
  geminiApiKey: string;
  geminiStatus: GeminiKeyStatus;
  onSaveGeminiKey: (newKey: string) => Promise<void>;
  onCheckGeminiKey: (keyToTest?: string) => Promise<{ ok: boolean; message: string }>;
  onClearGeminiKey: () => Promise<void>;
  autoAddProducts: boolean;
  onToggleAutoAddProducts: (val: boolean) => void;
  onSaveExtractedBill: (params: {
    billDate: string;
    rawDate?: string;
    checkInTime?: string;
    checkOutTime?: string;
    discountAmount?: number;
    paymentType: PaymentType;
    debtorName: string;
    note: string;
    items: ExtractedBillItem[];
  }) => Promise<void>;
  onDeleteAllMenuProducts: () => void;
  menuProductsCount: number;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

export const OcrScannerTab: React.FC<OcrScannerTabProps> = ({
  canWrite,
  categories,
  products,
  geminiApiKey,
  geminiStatus,
  onSaveGeminiKey,
  onCheckGeminiKey,
  onClearGeminiKey,
  autoAddProducts,
  onToggleAutoAddProducts,
  onSaveExtractedBill,
  onDeleteAllMenuProducts,
  menuProductsCount,
  requestConfirm,
}) => {
  const todayBusinessStr = getCurrentBusinessDate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [inputMode, setInputMode] = useState<'image' | 'text'>('text');
  const [rawText, setRawText] = useState<string>(SAMPLE_BILL_TEMPLATES[0].rawText);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [quickAiItemPrompt, setQuickAiItemPrompt] = useState<string>('');
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Editable Bill State
  const initialParsed = useRef<ExtractedBillJSON | null>(null);
  if (!initialParsed.current) {
    initialParsed.current = parseRawTextToBillJSON(
      SAMPLE_BILL_TEMPLATES[0].rawText,
      todayBusinessStr,
      products,
      categories
    );
  }

  const [billDate, setBillDate] = useState<string>(
    initialParsed.current.billInfo.billDate || todayBusinessStr
  );
  const [rawCalendarDate, setRawCalendarDate] = useState<string | undefined>(
    initialParsed.current.billInfo.rawDate
  );
  const [checkInTime, setCheckInTime] = useState<string>(
    initialParsed.current.billInfo.checkInTime || ''
  );
  const [checkOutTime, setCheckOutTime] = useState<string>(
    initialParsed.current.billInfo.checkOutTime || ''
  );
  const [discountAmount, setDiscountAmount] = useState<number>(
    initialParsed.current.billInfo.discountAmount || 0
  );
  const [paymentType, setPaymentType] = useState<PaymentType>(
    initialParsed.current.billInfo.paymentType || 'cash'
  );
  const [debtorName, setDebtorName] = useState<string>(
    initialParsed.current.billInfo.debtorName || ''
  );
  const [note, setNote] = useState<string>('');
  const [items, setItems] = useState<ExtractedBillItem[]>(
    initialParsed.current.items
  );

  const subtotalAmount = items.reduce(
    (sum, it) => sum + Math.round((it.quantity || 0) * (it.unitPrice || 0)),
    0
  );
  const safeDiscount = Math.min(
    subtotalAmount,
    Math.max(0, Math.round(Number(discountAmount) || 0))
  );
  const totalAmount = Math.max(0, subtotalAmount - safeDiscount);

  // Strict JSON output structure including all requested fields
  const strictJsonOutput: ExtractedBillJSON = {
    billInfo: {
      billDate,
      ...(rawCalendarDate && rawCalendarDate !== billDate
        ? { rawDate: rawCalendarDate }
        : {}),
      checkInTime: checkInTime || '',
      checkOutTime: checkOutTime || '',
      paymentType,
      debtorName: paymentType === 'debt' ? debtorName : '',
      subtotalAmount,
      discountAmount: safeDiscount,
      totalAmount,
    },
    items: items.map((it) => ({
      productName: it.productName,
      note: it.note || '',
      category: it.category,
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitPrice) || 0,
      subtotal: (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0),
    })),
  };

  const applyExtractedResult = (result: ExtractedBillJSON) => {
    setBillDate(result.billInfo.billDate || todayBusinessStr);
    setRawCalendarDate(result.billInfo.rawDate);
    setCheckInTime(result.billInfo.checkInTime || '');
    setCheckOutTime(result.billInfo.checkOutTime || '');
    setDiscountAmount(Math.max(0, Math.round(result.billInfo.discountAmount || 0)));
    setPaymentType(result.billInfo.paymentType || 'cash');
    setDebtorName(
      result.billInfo.paymentType === 'debt' ? result.billInfo.debtorName || '' : ''
    );
    setItems(
      result.items.map((it) => {
        const split = splitProductNameAndInlineNote(
          it.productName,
          products,
          categories
        );
        const mergedNote = [split.note, it.note]
          .filter(Boolean)
          .filter(
            (v, i, arr) =>
              arr.findIndex((x) => x!.toLowerCase() === v!.toLowerCase()) === i
          )
          .join(', ');
        const qty = Math.max(1, Math.round(it.quantity || 1));
        const uPrice = Math.max(
          0,
          Math.round(it.unitPrice || split.catalogUnitPrice || 0)
        );
        return {
          productName: split.productName || it.productName,
          note: mergedNote || '',
          category:
            it.category ||
            split.category ||
            inferCategory(split.productName || it.productName, categories),
          quantity: qty,
          unitPrice: uPrice,
          subtotal: qty * uPrice,
        };
      })
    );
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setImageMimeType(file.type || 'image/jpeg');

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = String(reader.result || '');
      setImagePreview(base64Data);
      await runAiExtraction({
        imageBase64: base64Data,
        mimeType: file.type || 'image/jpeg',
      });
    };
    reader.readAsDataURL(file);
  };

  const runAiExtraction = async (payload: {
    imageBase64?: string;
    mimeType?: string;
    text?: string;
    appendMode?: boolean;
  }) => {
    setIsProcessing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const data = await extractBillWithGemini({
        imageBase64: payload.imageBase64,
        mimeType: payload.mimeType,
        rawText: payload.text,
        defaultDate: billDate || todayBusinessStr,
        apiKey: geminiApiKey || undefined,
        categories,
        existingProducts: products,
      });

      if (data && Array.isArray(data.items) && data.items.length > 0) {
        if (payload.appendMode) {
          const newItems = data.items.map((it) => {
            const split = splitProductNameAndInlineNote(
              it.productName,
              products,
              categories
            );
            const mergedNote = [split.note, it.note]
              .filter(Boolean)
              .filter(
                (v, i, arr) =>
                  arr.findIndex((x) => x!.toLowerCase() === v!.toLowerCase()) === i
              )
              .join(', ');
            const qty = Math.max(1, Math.round(it.quantity || 1));
            const uPrice = Math.max(
              0,
              Math.round(it.unitPrice || split.catalogUnitPrice || 0)
            );
            return {
              productName: split.productName || it.productName,
              note: mergedNote || '',
              category:
                it.category ||
                split.category ||
                inferCategory(split.productName || it.productName, categories),
              quantity: qty,
              unitPrice: uPrice,
              subtotal: qty * uPrice,
            };
          });
          setItems((prev) => [...prev, ...newItems]);
          setSuccessMsg(
            `Gemini đã nhận diện và thêm ${newItems.length} món mới vào hóa đơn hiện tại!`
          );
          setQuickAiItemPrompt('');
        } else {
          applyExtractedResult(data);
          setSuccessMsg(
            `Gemini AI đã trích xuất thành công ${data.items.length} món (Tổng cộng: ${formatVND(
              data.billInfo.totalAmount
            )}, Ca ngày: ${data.billInfo.billDate}).`
          );
        }
      } else if (payload.text && !payload.appendMode) {
        const fallback = parseRawTextToBillJSON(
          payload.text,
          billDate || todayBusinessStr,
          products,
          categories
        );
        applyExtractedResult(fallback);
        setSuccessMsg(
          `Đã phân tích văn bản hóa đơn: ${fallback.items.length} món (${formatVND(
            fallback.billInfo.totalAmount
          )}).`
        );
      } else {
        setErrorMsg(
          'Không tìm thấy món ăn nào. Bạn có thể kiểm tra lại Gemini Key hoặc nhập trực tiếp bên dưới.'
        );
      }
    } catch (err: any) {
      if (payload.text && !payload.appendMode) {
        const fallback = parseRawTextToBillJSON(
          payload.text,
          billDate || todayBusinessStr,
          products,
          categories
        );
        applyExtractedResult(fallback);
        setSuccessMsg(
          `Đã tách chuẩn ${fallback.items.length} món từ văn bản (Tổng cộng: ${formatVND(
            fallback.billInfo.totalAmount
          )}, Ca ngày: ${fallback.billInfo.billDate}).`
        );
      } else if (payload.text && payload.appendMode) {
        const fallback = parseRawTextToBillJSON(
          payload.text,
          billDate || todayBusinessStr,
          products,
          categories
        );
        if (fallback.items.length > 0) {
          setItems((prev) => [...prev, ...fallback.items]);
          setSuccessMsg(`Đã tách nhanh và thêm ${fallback.items.length} món vào hóa đơn!`);
          setQuickAiItemPrompt('');
        } else {
          setErrorMsg(
            err?.message ||
              'Không thể trích xuất tự động bằng Gemini. Vui lòng kiểm tra Gemini Key.'
          );
        }
      } else {
        setErrorMsg(
          err?.message ||
            'Không thể trích xuất tự động bằng Gemini. Vui lòng kiểm tra Gemini Key.'
        );
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectSampleTemplate = (templateId: string) => {
    const found = SAMPLE_BILL_TEMPLATES.find((t) => t.id === templateId);
    if (!found) return;
    setInputMode('text');
    setRawText(found.rawText);
    setErrorMsg(null);
    const localParsed = parseRawTextToBillJSON(
      found.rawText,
      todayBusinessStr,
      products,
      categories
    );
    applyExtractedResult(localParsed);
    setSuccessMsg(
      `Đã nạp mẫu "${found.label}" — Tách tự động tên món, ghi chú món, giờ ra/vào, chiết khấu và tính ca 09:00 sáng → 08:00 sáng hôm sau.`
    );
  };

  const handleItemChange = (
    index: number,
    field: keyof ExtractedBillItem,
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item };
        if (field === 'productName') {
          const nameVal = String(value);
          updated.productName = nameVal;
          const matchedProd = products.find(
            (p) => p.productName.toLowerCase().trim() === nameVal.toLowerCase().trim()
          );
          if (matchedProd) {
            updated.category = matchedProd.category;
            if (updated.unitPrice === 0 || item.productName !== nameVal) {
              updated.unitPrice = matchedProd.unitPrice;
              updated.subtotal = updated.quantity * updated.unitPrice;
            }
          } else {
            updated.category = inferCategory(updated.productName, categories);
          }
        } else if (field === 'note') {
          updated.note = String(value);
        } else if (field === 'category') {
          updated.category = String(value);
        } else if (field === 'quantity') {
          updated.quantity = Math.max(1, Math.round(Number(value) || 1));
          updated.subtotal = updated.quantity * updated.unitPrice;
        } else if (field === 'unitPrice') {
          updated.unitPrice = Math.max(0, Math.round(Number(value) || 0));
          updated.subtotal = updated.quantity * updated.unitPrice;
        }
        return updated;
      })
    );
  };

  // When user finishes typing a product name like "gà biển kho nghệ làm cay", automatically split out "làm cay" into item.note if it matches a catalog product
  const handleProductNameBlur = (index: number) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const split = splitProductNameAndInlineNote(
          item.productName,
          products,
          categories
        );
        if (split.productName && split.note && split.productName !== item.productName) {
          const newNote = [item.note, split.note]
            .filter(Boolean)
            .filter(
              (v, i, arr) =>
                arr.findIndex((x) => x!.toLowerCase() === v!.toLowerCase()) === i
            )
            .join(', ');
          const uPrice =
            item.unitPrice > 0
              ? item.unitPrice
              : split.catalogUnitPrice || item.unitPrice;
          return {
            ...item,
            productName: split.productName,
            note: newNote,
            category: split.category || item.category,
            unitPrice: uPrice,
            subtotal: item.quantity * uPrice,
          };
        }
        return item;
      })
    );
  };

  const handleApplyShiftDateFromTime = () => {
    const base = rawCalendarDate || billDate;
    const { businessDate, shiftedFromNextMorning } = resolveBusinessBillDate(
      base,
      checkInTime,
      checkOutTime,
      false
    );
    if (shiftedFromNextMorning && businessDate !== billDate) {
      setRawCalendarDate(base);
      setBillDate(businessDate);
      setSuccessMsg(
        `Áp dụng khung giờ bán 09:00 sáng → 08:00 sáng hôm sau: Bill lúc ${
          checkInTime || checkOutTime
        } ngày ${base} được tính vào ca bán ngày ${businessDate}.`
      );
    }
  };

  const handleAddEmptyItem = () => {
    requestConfirm({
      title: 'Xác nhận Thêm Dòng Món Mới',
      message: 'Bạn có muốn thêm 1 dòng món mới vào hóa đơn đang soạn không?',
      confirmLabel: 'Thêm dòng món',
      variant: 'primary',
      onConfirm: () => {
        const defaultProd = products[0];
        const defaultName = defaultProd ? defaultProd.productName : 'Bia Tiger Lùn';
        const defaultCat = defaultProd ? defaultProd.category : categories[0] || 'Bia';
        const defaultPrice = defaultProd ? defaultProd.unitPrice : 22000;
        setItems((prev) => [
          ...prev,
          {
            productName: defaultName,
            note: '',
            category: defaultCat,
            quantity: 1,
            unitPrice: defaultPrice,
            subtotal: defaultPrice,
          },
        ]);
      },
    });
  };

  const handleGeminiAddItemsToBill = () => {
    const trimmed = quickAiItemPrompt.trim();
    if (!trimmed) return;
    requestConfirm({
      title: 'Xác nhận Dùng Gemini Nhận Diện & Thêm Món Vào Bill',
      message: `Bạn có muốn phân tích "${trimmed}" và tự động thêm món (kèm ghi chú nếu có) vào hóa đơn hiện tại không?`,
      confirmLabel: 'Thêm Món',
      variant: 'primary',
      onConfirm: async () => {
        await runAiExtraction({ text: trimmed, appendMode: true });
      },
    });
  };

  const handleRemoveItem = (index: number) => {
    const target = items[index];
    requestConfirm({
      title: 'Xác nhận Xóa Món Khỏi Bill',
      message: `Bạn có chắc chắn muốn xóa món "${target?.productName || ''}" khỏi danh sách đang soạn không?`,
      confirmLabel: 'Xóa món',
      variant: 'danger',
      onConfirm: () => {
        setItems((prev) => prev.filter((_, idx) => idx !== index));
      },
    });
  };

  const handleClearAllDraftItems = () => {
    if (items.length === 0) return;
    requestConfirm({
      title: 'Xác nhận Xóa Tất Cả Món Đang Soạn',
      message: `Bạn có chắc chắn muốn xóa toàn bộ ${items.length} món đang soạn trong hóa đơn này không?`,
      confirmLabel: 'Xóa tất cả món',
      variant: 'danger',
      onConfirm: () => {
        setItems([]);
      },
    });
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(strictJsonOutput, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleSaveBill = () => {
    if (!canWrite) {
      setErrorMsg('Tài khoản của bạn ở chế độ Chỉ xem, không có quyền lưu hóa đơn.');
      return;
    }
    const validItems = items.filter((it) => it.productName.trim() !== '');
    if (validItems.length === 0) {
      setErrorMsg('Vui lòng thêm ít nhất 1 món ăn/nước uống trong hóa đơn.');
      return;
    }
    if (paymentType === 'debt' && !debtorName.trim()) {
      setErrorMsg('Vui lòng nhập Tên người nợ đối với hóa đơn Công nợ.');
      return;
    }

    requestConfirm({
      title: 'Xác nhận Lưu Hóa Đơn Vào Hệ Thống',
      message: `Bạn có chắc chắn muốn lưu hóa đơn ca ngày ${billDate} (${
        validItems.length
      } món, Chiết khấu: ${formatVND(safeDiscount)}, Tổng cộng: ${formatVND(
        totalAmount
      )}, Hình thức: ${
        PAYMENT_LABELS[paymentType]
      }) vào Firebase và cộng số lượng bán theo thời gian thực không?`,
      confirmLabel: 'Xác nhận Lưu Bill',
      variant: 'primary',
      onConfirm: async () => {
        setIsSaving(true);
        setErrorMsg(null);
        try {
          await onSaveExtractedBill({
            billDate,
            rawDate: rawCalendarDate,
            checkInTime: checkInTime.trim() || undefined,
            checkOutTime: checkOutTime.trim() || undefined,
            discountAmount: safeDiscount,
            paymentType,
            debtorName: paymentType === 'debt' ? debtorName.trim() : '',
            note,
            items: validItems,
          });
          setSuccessMsg(
            `Đã lưu hóa đơn ca ngày ${billDate} (Tổng cộng: ${formatVND(
              totalAmount
            )}) vào Firebase và cộng số lượng bán theo thời gian thực!`
          );
        } catch (err: any) {
          setErrorMsg(err?.message || 'Lỗi khi lưu hóa đơn.');
        } finally {
          setIsSaving(false);
        }
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Gemini API Key Configuration & Check Bar */}
      <GeminiKeyBar
        geminiApiKey={geminiApiKey}
        geminiStatus={geminiStatus}
        onSaveGeminiKey={onSaveGeminiKey}
        onCheckGeminiKey={onCheckGeminiKey}
        onClearGeminiKey={onClearGeminiKey}
        requestConfirm={requestConfirm}
        contextLabel="Nhập Gemini API Key và bấm Kiểm tra để kích hoạt AI quét ảnh hóa đơn, nhận diện văn bản bill nhiều định dạng và tách ghi chú tự động."
      />

      {/* Header & Quick Templates */}
      <div className="p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Chụp / Nhập Bill OCR & Trích Xuất Hóa Đơn Đa Định Dạng
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              Tự động lấy <strong>Ngày tháng, Giờ ra vào, Tên món, Ghi chú món, Số lượng, Đơn giá, Thành tiền, Chiết khấu, Tổng cộng</strong>. Ca bán tính từ <strong>09:00 sáng hôm nay đến 08:00 sáng hôm sau</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoAddProducts}
                onChange={(e) => onToggleAutoAddProducts(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Tự thêm món mới vào Menu theo Bill</span>
            </label>

            {canWrite && menuProductsCount > 0 && (
              <button
                type="button"
                onClick={onDeleteAllMenuProducts}
                className="h-9 px-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa Menu ({menuProductsCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Sample Templates Bar */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Mẫu hóa đơn thực tế (Bấm để nạp & kiểm thử tách ghi chú món / Combo / Ca 9h sáng → 8h sáng hôm sau):
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            {SAMPLE_BILL_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleSelectSampleTemplate(tpl.id)}
                className="text-left p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50/70 dark:bg-slate-800/40 transition-colors cursor-pointer"
              >
                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {tpl.label}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {tpl.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status Alerts */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 flex items-start sm:items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 flex items-start sm:items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Grid: Input Area + Bill Editor */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left Column: Image/Camera or Raw Text Input */}
        <div className="xl:col-span-5 p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={`flex-1 h-9 px-3 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                  inputMode === 'text'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Copy / Dán Văn Bản</span>
              </button>
              <button
                type="button"
                onClick={() => setInputMode('image')}
                className={`flex-1 h-9 px-3 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                  inputMode === 'image'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Chụp / Tải Ảnh Bill</span>
              </button>
            </div>

            {inputMode === 'image' ? (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageFileChange}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-5 sm:p-6 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-950/40"
                >
                  {imagePreview ? (
                    <div className="space-y-3">
                      <img
                        src={imagePreview}
                        alt="Hóa đơn vừa tải lên"
                        referrerPolicy="no-referrer"
                        className="max-h-52 mx-auto rounded-xl object-contain border border-slate-200 dark:border-slate-700"
                      />
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                        Chạm để chụp lại hoặc chọn ảnh hóa đơn khác
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 py-5">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                        <Upload className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        Chụp ảnh Bill hoặc chọn ảnh từ máy
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                        Hỗ trợ camera điện thoại, ảnh chụp bill in nhiệt, bill viết tay (JPG, PNG, WEBP)
                      </p>
                    </div>
                  )}
                </div>

                {imagePreview && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() =>
                      runAiExtraction({
                        imageBase64: imagePreview,
                        mimeType: imageMimeType,
                      })
                    }
                    className="w-full h-10 px-4 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                    <span>
                      {isProcessing
                        ? 'Gemini AI đang đọc hóa đơn...'
                        : 'Quét lại ảnh bằng Gemini AI OCR'}
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Dán nội dung hóa đơn (Hỗ trợ nhiều kiểu form, tự tách ghi chú món & combo):
                </label>
                <textarea
                  rows={10}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`Ví dụ:\nNgày: 20/08/2026\nGiờ vào: 21:00 - Giờ ra: 01:30\ngà biển kho nghệ làm cay giá 129000\ncombo 2 ======================\n>>> Cơm chiên hải sản <<<\n======================\ngiá 459000`}
                  className="w-full p-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const parsed = parseRawTextToBillJSON(
                        rawText,
                        billDate || todayBusinessStr,
                        products,
                        categories
                      );
                      applyExtractedResult(parsed);
                      setSuccessMsg(
                        `Đã tách chuẩn ${parsed.items.length} món (Tổng cộng: ${formatVND(
                          parsed.billInfo.totalAmount
                        )}, Ca ngày: ${parsed.billInfo.billDate}).`
                      );
                    }}
                    className="h-10 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Tách nhanh chuẩn (Mọi định dạng)
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => runAiExtraction({ text: rawText })}
                    className="h-10 px-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`}
                    />
                    <span>
                      {isProcessing ? 'Gemini đang xử lý...' : 'Nhận diện bằng Gemini AI'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Collapsible / Clean JSON Output Preview Box */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowJsonPreview((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <Code2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{showJsonPreview ? 'Ẩn cấu trúc JSON' : 'Xem cấu trúc JSON chuẩn'}</span>
              </button>
              <button
                type="button"
                onClick={handleCopyJson}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {copiedJson ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedJson ? 'Đã copy' : 'Copy JSON'}</span>
              </button>
            </div>
            {showJsonPreview && (
              <pre className="mt-2.5 p-3 rounded-xl bg-slate-950 text-emerald-400 text-[11px] font-mono overflow-x-auto max-h-52 leading-relaxed border border-slate-800">
                {JSON.stringify(strictJsonOutput, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* Right Area: Interactive Bill Review & Save */}
        <div className="xl:col-span-7 p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Kiểm tra & Chỉnh sửa Hóa Đơn trước khi lưu
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ca bán hàng tính từ <strong>09:00 sáng ngày D đến 08:00 sáng ngày D+1</strong>.
                </p>
              </div>
              <div className="sm:text-right flex sm:block items-center justify-between pt-1 sm:pt-0">
                <span className="text-xs text-slate-500 dark:text-slate-400 block">
                  Tổng cộng thanh toán
                </span>
                <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatVND(totalAmount)}
                </span>
              </div>
            </div>

            {/* Shift Date Notice Banner if shifted from early morning */}
            {rawCalendarDate && rawCalendarDate !== billDate && (
              <div className="p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 flex items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    Bill ghi ngày <strong>{rawCalendarDate}</strong> trong khung giờ trước 08:00 sáng nên được tự động tính vào ca bán ngày <strong>{billDate}</strong> (09:00 sáng → 08:00 sáng hôm sau).
                  </span>
                </div>
              </div>
            )}

            {/* Bill Info Controls: Date, CheckIn, CheckOut, Discount, Payment, Debtor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Ngày tính Bill (Ca 9h → 8h sáng hôm sau)
                </label>
                <input
                  type="date"
                  value={billDate}
                  onChange={(e) => {
                    setBillDate(e.target.value);
                    setRawCalendarDate(e.target.value);
                  }}
                  className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Giờ vào
                  </label>
                  <input
                    type="text"
                    value={checkInTime}
                    onChange={(e) => setCheckInTime(e.target.value)}
                    onBlur={handleApplyShiftDateFromTime}
                    placeholder="VD: 19:30"
                    className="w-full h-10 px-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Giờ ra
                  </label>
                  <input
                    type="text"
                    value={checkOutTime}
                    onChange={(e) => setCheckOutTime(e.target.value)}
                    onBlur={handleApplyShiftDateFromTime}
                    placeholder="VD: 01:30"
                    className="w-full h-10 px-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Chiết khấu / Giảm giá (₫)
                </label>
                <div className="relative">
                  <Percent className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={discountAmount}
                    onChange={(e) =>
                      setDiscountAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))
                    }
                    placeholder="0"
                    className="w-full h-10 pl-8 pr-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Hình thức thanh toán
                </label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as PaymentType)}
                  className="w-full h-10 px-3 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="cash">Tiền mặt (Mặc định)</option>
                  <option value="transfer">Chuyển khoản (CK)</option>
                  <option value="debt">Công nợ / Ghi nợ</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Người nợ (Nếu ghi nợ)
                </label>
                <input
                  type="text"
                  disabled={paymentType !== 'debt'}
                  value={paymentType === 'debt' ? debtorName : ''}
                  onChange={(e) => setDebtorName(e.target.value)}
                  placeholder={
                    paymentType === 'debt'
                      ? 'Nhập tên khách nợ...'
                      : 'Không áp dụng (Tiền mặt/CK)'
                  }
                  className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú chung của Bill
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="VD: Bàn VIP 2, khách quen..."
                  className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Quick Gemini AI Add Item to Bill Bar */}
            <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={quickAiItemPrompt}
                onChange={(e) => setQuickAiItemPrompt(e.target.value)}
                placeholder="Nhập nhanh món (VD: gà biển kho nghệ làm cay giá 129000, 10 Tiger Lùn 22k)..."
                className="flex-1 h-9 px-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
              <button
                type="button"
                disabled={isProcessing || !quickAiItemPrompt.trim()}
                onClick={handleGeminiAddItemsToBill}
                className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Tách & Thêm Món</span>
              </button>
            </div>

            {/* Datalist for autocomplete from Menu Catalog */}
            <datalist id="vqbill-menu-products-list">
              {products.map((p) => (
                <option key={p.id} value={p.productName}>
                  {p.category} — Giá chuẩn: {formatVND(p.unitPrice)}
                </option>
              ))}
            </datalist>

            {/* Items Section */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Danh sách món & Ghi chú từng món ({items.length} món)
                </span>
                <div className="flex items-center gap-2">
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllDraftItems}
                      className="h-8 px-2.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa hết</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddEmptyItem}
                    className="h-8 px-3 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm món</span>
                  </button>
                </div>
              </div>

              {/* Mobile Cards (< md) */}
              <div className="md:hidden space-y-2.5">
                {items.map((item, idx) => {
                  const catalogMatch = products.find(
                    (p) =>
                      p.productName.toLowerCase().trim() ===
                      item.productName.toLowerCase().trim()
                  );
                  const categoryOptions = Array.from(
                    new Set([...categories, item.category].filter(Boolean))
                  );

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          list="vqbill-menu-products-list"
                          value={item.productName}
                          onChange={(e) =>
                            handleItemChange(idx, 'productName', e.target.value)
                          }
                          onBlur={() => handleProductNameBlur(idx)}
                          placeholder="Tên món ăn / đồ uống..."
                          className="flex-1 h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="w-9 h-9 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 flex items-center justify-center shrink-0 cursor-pointer"
                          title="Xóa món"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="relative">
                        <MessageSquareText className="w-3.5 h-3.5 text-amber-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={item.note || ''}
                          onChange={(e) =>
                            handleItemChange(idx, 'note', e.target.value)
                          }
                          placeholder="Ghi chú món (VD: làm cay, hoặc chi tiết món trong Combo)..."
                          className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 text-slate-800 dark:text-amber-200 text-[11px]"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            Danh mục
                          </label>
                          <select
                            value={item.category}
                            onChange={(e) =>
                              handleItemChange(idx, 'category', e.target.value)
                            }
                            className="w-full h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                          >
                            {categoryOptions.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            Số lượng
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(idx, 'quantity', e.target.value)
                            }
                            className="w-full h-9 px-2 text-right font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            Đơn giá (₫)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            value={item.unitPrice}
                            onChange={(e) =>
                              handleItemChange(idx, 'unitPrice', e.target.value)
                            }
                            className="w-full h-9 px-2 text-right font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 dark:border-slate-800 text-xs font-mono">
                        <span className="text-[11px] text-slate-500">
                          {catalogMatch
                            ? `Giá Menu: ${formatVND(catalogMatch.unitPrice)}`
                            : 'Món mới / Tùy chỉnh'}
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          = {formatVND(item.quantity * item.unitPrice)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table (>= md) */}
              <div className="hidden md:block border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3">Tên món & Ghi chú món (Combo / Yêu cầu)</th>
                      <th className="py-2.5 px-2 w-32">Danh mục</th>
                      <th className="py-2.5 px-2 w-20 text-right">SL</th>
                      <th className="py-2.5 px-2 w-36 text-right">
                        Đơn giá (₫)
                      </th>
                      <th className="py-2.5 px-3 w-28 text-right">Thành tiền</th>
                      <th className="py-2.5 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {items.map((item, idx) => {
                      const catalogMatch = products.find(
                        (p) =>
                          p.productName.toLowerCase().trim() ===
                          item.productName.toLowerCase().trim()
                      );
                      const isCustomBillPrice =
                        catalogMatch &&
                        catalogMatch.unitPrice > 0 &&
                        catalogMatch.unitPrice !== item.unitPrice;

                      const categoryOptions = Array.from(
                        new Set([...categories, item.category].filter(Boolean))
                      );

                      return (
                        <tr
                          key={idx}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                        >
                          <td className="p-2 align-top space-y-1.5">
                            <input
                              type="text"
                              list="vqbill-menu-products-list"
                              value={item.productName}
                              onChange={(e) =>
                                handleItemChange(idx, 'productName', e.target.value)
                              }
                              onBlur={() => handleProductNameBlur(idx)}
                              placeholder="Tên món ăn / nước uống..."
                              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold"
                            />
                            <div className="relative">
                              <MessageSquareText className="w-3.5 h-3.5 text-amber-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={item.note || ''}
                                onChange={(e) =>
                                  handleItemChange(idx, 'note', e.target.value)
                                }
                                placeholder="Ghi chú món (VD: làm cay, hoặc các món trong Combo)..."
                                className="w-full h-7 pl-8 pr-2.5 rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 text-slate-700 dark:text-amber-200 text-[11px]"
                              />
                            </div>
                          </td>
                          <td className="p-2 align-top">
                            <select
                              value={item.category}
                              onChange={(e) =>
                                handleItemChange(idx, 'category', e.target.value)
                              }
                              className="w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                            >
                              {categoryOptions.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 align-top">
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) =>
                                handleItemChange(idx, 'quantity', e.target.value)
                              }
                              className="w-full h-9 px-2 text-right font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                            />
                          </td>
                          <td className="p-2 align-top">
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={item.unitPrice}
                              onChange={(e) =>
                                handleItemChange(idx, 'unitPrice', e.target.value)
                              }
                              className="w-full h-9 px-2 text-right font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                            />
                            {catalogMatch && (
                              <div className="text-[10px] text-right mt-0.5 font-mono text-slate-400">
                                {isCustomBillPrice ? (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    Giá gốc: {formatVND(catalogMatch.unitPrice)}
                                  </span>
                                ) : (
                                  <span>Giá chuẩn: {formatVND(catalogMatch.unitPrice)}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-2 align-top text-right font-mono font-semibold text-slate-900 dark:text-white pt-3.5">
                            {formatVND(item.quantity * item.unitPrice)}
                          </td>
                          <td className="p-2 align-top text-center pt-3">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                              title="Xóa món"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Summary & Save Button Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-xs font-mono">
              <div>
                <span className="text-slate-500 block font-sans text-[11px]">Tạm tính</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {formatVND(subtotalAmount)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block font-sans text-[11px]">Chiết khấu</span>
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  {safeDiscount > 0 ? `-${formatVND(safeDiscount)}` : '0 ₫'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block font-sans text-[11px]">Tổng cộng</span>
                <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                  {formatVND(totalAmount)}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Ca ngày:{' '}
                <strong className="font-mono text-slate-800 dark:text-slate-200">
                  {billDate}
                </strong>
                {(checkInTime || checkOutTime) && (
                  <>
                    {' '}
                    · Giờ:{' '}
                    <strong className="font-mono text-slate-800 dark:text-slate-200">
                      {checkInTime || '--:--'} → {checkOutTime || '--:--'}
                    </strong>
                  </>
                )}{' '}
                · Hình thức:{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {PAYMENT_LABELS[paymentType]}
                </strong>
              </div>
              <button
                type="button"
                disabled={isSaving || !canWrite}
                onClick={handleSaveBill}
                className="h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Save className="w-4 h-4 shrink-0" />
                <span>
                  {isSaving
                    ? 'Đang lưu vào Firebase...'
                    : 'Lưu Bill & Cộng Số Lượng Thời Gian Thực'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
