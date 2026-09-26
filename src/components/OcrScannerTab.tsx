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
} from 'lucide-react';
import {
  ExtractedBillItem,
  ExtractedBillJSON,
  PaymentType,
  STANDARD_CATEGORIES,
  PAYMENT_LABELS,
  ConfirmRequestOptions,
} from '../types';
import {
  formatVND,
  inferCategory,
  parseRawTextToBillJSON,
  SAMPLE_BILL_TEMPLATES,
} from '../utils/parser';

interface OcrScannerTabProps {
  canWrite: boolean;
  autoAddProducts: boolean;
  onToggleAutoAddProducts: (val: boolean) => void;
  onSaveExtractedBill: (params: {
    billDate: string;
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
  autoAddProducts,
  onToggleAutoAddProducts,
  onSaveExtractedBill,
  onDeleteAllMenuProducts,
  menuProductsCount,
  requestConfirm,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [inputMode, setInputMode] = useState<'image' | 'text'>('image');
  const [rawText, setRawText] = useState<string>(SAMPLE_BILL_TEMPLATES[0].rawText);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Editable Bill State
  const [billDate, setBillDate] = useState<string>(todayStr);
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [debtorName, setDebtorName] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [items, setItems] = useState<ExtractedBillItem[]>(() => {
    const initial = parseRawTextToBillJSON(SAMPLE_BILL_TEMPLATES[0].rawText, todayStr);
    return initial.items;
  });

  const totalAmount = items.reduce(
    (sum, it) => sum + Math.round((it.quantity || 0) * (it.unitPrice || 0)),
    0
  );

  // Strict JSON output structure required by prompt
  const strictJsonOutput: ExtractedBillJSON = {
    billInfo: {
      billDate,
      paymentType,
      debtorName: paymentType === 'debt' ? debtorName : '',
      totalAmount,
    },
    items: items.map((it) => ({
      productName: it.productName,
      category: it.category,
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitPrice) || 0,
      subtotal: (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0),
    })),
  };

  const applyExtractedResult = (result: ExtractedBillJSON) => {
    setBillDate(result.billInfo.billDate || todayStr);
    setPaymentType(result.billInfo.paymentType || 'cash');
    setDebtorName(
      result.billInfo.paymentType === 'debt' ? result.billInfo.debtorName || '' : ''
    );
    setItems(
      result.items.map((it) => ({
        productName: it.productName,
        category: it.category || inferCategory(it.productName),
        quantity: Math.max(1, Math.round(it.quantity || 1)),
        unitPrice: Math.max(0, Math.round(it.unitPrice || 0)),
        subtotal:
          Math.max(1, Math.round(it.quantity || 1)) *
          Math.max(0, Math.round(it.unitPrice || 0)),
      }))
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
      await runAiExtraction({ imageBase64: base64Data, mimeType: file.type || 'image/jpeg' });
    };
    reader.readAsDataURL(file);
  };

  const runAiExtraction = async (payload: {
    imageBase64?: string;
    mimeType?: string;
    text?: string;
  }) => {
    setIsProcessing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const response = await fetch('/api/ocr-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: payload.imageBase64,
          mimeType: payload.mimeType,
          rawText: payload.text,
          defaultDate: billDate || todayStr,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Lỗi kết nối AI OCR.');
      }

      const data: ExtractedBillJSON = await response.json();
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        applyExtractedResult(data);
        setSuccessMsg(
          `Đã trích xuất thành công ${data.items.length} món ăn/đồ uống (${formatVND(
            data.billInfo.totalAmount
          )}).`
        );
      } else if (payload.text) {
        const fallback = parseRawTextToBillJSON(payload.text, billDate || todayStr);
        applyExtractedResult(fallback);
        setSuccessMsg(
          `Đã phân tích văn bản hóa đơn: ${fallback.items.length} món (${formatVND(
            fallback.billInfo.totalAmount
          )}).`
        );
      } else {
        setErrorMsg('Không tìm thấy món ăn nào trên ảnh. Bạn có thể thêm hoặc chỉnh sửa trực tiếp bên dưới.');
      }
    } catch (err: any) {
      if (payload.text) {
        const fallback = parseRawTextToBillJSON(payload.text, billDate || todayStr);
        applyExtractedResult(fallback);
        setSuccessMsg(
          `Đã phân tích chuẩn hóa ${fallback.items.length} món từ văn bản (${formatVND(
            fallback.billInfo.totalAmount
          )}).`
        );
      } else {
        setErrorMsg(err?.message || 'Không thể trích xuất tự động từ ảnh.');
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
    const localParsed = parseRawTextToBillJSON(found.rawText, todayStr);
    applyExtractedResult(localParsed);
    setSuccessMsg(`Đã nạp mẫu "${found.label}" và trích xuất JSON chuẩn 100%.`);
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
          updated.productName = String(value);
          updated.category = inferCategory(updated.productName);
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

  const handleAddEmptyItem = () => {
    requestConfirm({
      title: 'Xác nhận Thêm Dòng Món Mới',
      message: 'Bạn có muốn thêm 1 dòng món mới vào hóa đơn đang soạn không?',
      confirmLabel: 'Thêm dòng món',
      variant: 'primary',
      onConfirm: () => {
        setItems((prev) => [
          ...prev,
          {
            productName: 'Bia Tiger Lùn',
            category: 'Bia',
            quantity: 1,
            unitPrice: 22000,
            subtotal: 22000,
          },
        ]);
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
      message: `Bạn có chắc chắn muốn lưu hóa đơn ngày ${billDate} (${
        validItems.length
      } món, Tổng tiền: ${formatVND(totalAmount)}, Hình thức: ${
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
            paymentType,
            debtorName: paymentType === 'debt' ? debtorName.trim() : '',
            note,
            items: validItems,
          });
          setSuccessMsg(
            `Đã lưu hóa đơn ngày ${billDate} (${formatVND(
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
    <div className="space-y-6">
      {/* Header & Quick Templates */}
      <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              AI OCR & Trích Xuất Hóa Đơn Chuẩn JSON
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Chụp ảnh hóa đơn hoặc dán văn bản để AI tự động tách món, phân loại danh mục (Bia, Nước ngọt, Khai vị, Ếch, Gà...) và cộng dồn doanh thu thời gian thực.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoAddProducts}
                onChange={(e) => onToggleAutoAddProducts(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Tự nhận diện & thêm sản phẩm mới vào Menu theo Bill</span>
            </label>

            {canWrite && menuProductsCount > 0 && (
              <button
                type="button"
                onClick={onDeleteAllMenuProducts}
                className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa tất cả sản phẩm trong Menu ({menuProductsCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Sample Templates Bar */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Mẫu hóa đơn thực tế (Bấm để nạp & kiểm thử nhanh):
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            {SAMPLE_BILL_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleSelectSampleTemplate(tpl.id)}
                className="text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50/70 dark:bg-slate-800/40 transition-colors cursor-pointer"
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
        <div className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Input Area: Image Upload/Camera OR Copy/Paste Text */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setInputMode('image')}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                  inputMode === 'image'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Chụp / Tải Ảnh Hóa Đơn</span>
              </button>
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                  inputMode === 'text'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Copy / Dán Văn Bản</span>
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
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-950/40"
                >
                  {imagePreview ? (
                    <div className="space-y-3">
                      <img
                        src={imagePreview}
                        alt="Hóa đơn vừa tải lên"
                        referrerPolicy="no-referrer"
                        className="max-h-52 mx-auto rounded-lg object-contain border border-slate-200 dark:border-slate-700"
                      />
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        Bấm để chụp lại hoặc chọn ảnh hóa đơn khác
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 py-6">
                      <div className="w-11 h-11 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                        <Upload className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Chụp ảnh Bill hoặc tải ảnh từ thiết bị
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Hỗ trợ ảnh chụp điện thoại, bill in nhiệt, bill viết tay rõ chữ (JPG, PNG, WEBP)
                      </p>
                    </div>
                  )}
                </div>

                {imagePreview && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() =>
                      runAiExtraction({ imageBase64: imagePreview, mimeType: imageMimeType })
                    }
                    className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                    <span>
                      {isProcessing ? 'AI đang đọc hóa đơn...' : 'Quét lại ảnh bằng Gemini AI OCR'}
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Dán nội dung hóa đơn (Copy từ Zalo, POS, ghi chú):
                </label>
                <textarea
                  rows={9}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Ví dụ:&#10;Ngày: 20/08/2026&#10;Thanh toán: Tiền mặt&#10;Bia Tiger Lùn x15 22k&#10;Ếch sapo x2 135k..."
                  className="w-full p-3 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const parsed = parseRawTextToBillJSON(rawText, billDate || todayStr);
                      applyExtractedResult(parsed);
                      setSuccessMsg(
                        `Trích xuất tức thì ${parsed.items.length} món (${formatVND(
                          parsed.billInfo.totalAmount
                        )}).`
                      );
                    }}
                    className="py-2.5 px-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    Tách nhanh quy tắc chuẩn
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => runAiExtraction({ text: rawText })}
                    className="py-2.5 px-3 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                    <span>{isProcessing ? 'AI đang xử lý...' : 'Phân tích bằng Gemini AI'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* JSON Output Preview Box */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Cấu trúc JSON đầu ra (Chuẩn 100%)
              </span>
              <button
                type="button"
                onClick={handleCopyJson}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {copiedJson ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedJson ? 'Đã copy JSON' : 'Copy JSON'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-slate-950 text-emerald-400 text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed border border-slate-800">
              {JSON.stringify(strictJsonOutput, null, 2)}
            </pre>
          </div>
        </div>

        {/* Right Area: Interactive Bill Review & Save */}
        <div className="lg:col-span-7 p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Kiểm tra & Chỉnh sửa Hóa Đơn trước khi lưu
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mặc định hình thức thanh toán là Tiền mặt (`cash`). Khi lưu sẽ hiển thị popup xác nhận và cộng vào Firebase.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 dark:text-slate-400 block">
                  Tổng tiền Bill
                </span>
                <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatVND(totalAmount)}
                </span>
              </div>
            </div>

            {/* Bill Info Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Ngày hóa đơn (billDate)
                </label>
                <input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Hình thức (paymentType)
                </label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as PaymentType)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="cash">Tiền mặt (cash - Mặc định)</option>
                  <option value="transfer">Chuyển khoản (transfer)</option>
                  <option value="debt">Công nợ / Ghi nợ (debt)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Người nợ (debtorName)
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
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ghi chú hóa đơn (Bàn, ca, khách hàng...)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: Bàn VIP 2 - Khách thanh toán lúc 21h30..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            {/* Items Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Danh sách món trong Bill ({items.length} món)
                </span>
                <div className="flex items-center gap-2">
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllDraftItems}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa tất cả món</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddEmptyItem}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-md transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm dòng món</span>
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[540px]">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <th className="py-2 px-3">Tên món ăn / Nước uống</th>
                      <th className="py-2 px-2 w-36">Danh mục (Category)</th>
                      <th className="py-2 px-2 w-20 text-right">SL</th>
                      <th className="py-2 px-2 w-28 text-right">Đơn giá (₫)</th>
                      <th className="py-2 px-3 w-32 text-right">Thành tiền</th>
                      <th className="py-2 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.productName}
                            onChange={(e) =>
                              handleItemChange(idx, 'productName', e.target.value)
                            }
                            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={item.category}
                            onChange={(e) =>
                              handleItemChange(idx, 'category', e.target.value)
                            }
                            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                          >
                            {STANDARD_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(idx, 'quantity', e.target.value)
                            }
                            className="w-full px-2 py-1.5 text-right font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            value={item.unitPrice}
                            onChange={(e) =>
                              handleItemChange(idx, 'unitPrice', e.target.value)
                            }
                            className="w-full px-2 py-1.5 text-right font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                          />
                        </td>
                        <td className="p-2 text-right font-mono font-semibold text-slate-900 dark:text-white">
                          {formatVND(item.quantity * item.unitPrice)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title="Xóa món"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Save Button Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Hình thức:{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {PAYMENT_LABELS[paymentType]}
              </strong>
              {paymentType === 'debt' && debtorName && (
                <>
                  {' '}
                  · Người nợ:{' '}
                  <strong className="text-amber-600 dark:text-amber-400">
                    {debtorName}
                  </strong>
                </>
              )}
            </div>
            <button
              type="button"
              disabled={isSaving || !canWrite}
              onClick={handleSaveBill}
              className="py-2.5 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>
                {isSaving
                  ? 'Đang lưu vào Firebase...'
                  : 'Lưu vào Bill Ngày & Cộng Số Lượng Thời Gian Thực'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
