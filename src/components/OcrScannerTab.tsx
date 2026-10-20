import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Camera,
  FileText,
  Upload,
  Plus,
  Minus,
  Trash2,
  Copy,
  CopyPlus,
  Check,
  Save,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Code2,
  Clock,
  MessageSquareText,
  Percent,
  Zap,
  MinusCircle,
  Tag,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Banknote,
  Users,
  Layers,
  ArrowRight,
  Pin,
  PinOff,
  Utensils,
  UtensilsCrossed,
  Eye,
  Sun,
  SlidersHorizontal,
  Search,
  CheckSquare,
  Square,
  UserCheck,
} from 'lucide-react';
import {
  ExtractedBillItem,
  ExtractedBillJSON,
  PaymentType,
  PAYMENT_LABELS,
  ConfirmRequestOptions,
  ProductRecord,
  GeminiKeyStatus,
  BillRecord,
  DEFAULT_DEDUCTION_CATEGORIES,
} from '../types';
import {
  formatVND,
  getCurrentBusinessDate,
  inferCategory,
  normalizeSynchronizedReceiptText,
  normalizeTableName,
  parseRawTextToBillJSON,
  resolveBusinessBillDate,
  SAMPLE_BILL_TEMPLATES,
  splitProductNameAndInlineNote,
  recoverPosDishFromItem,
  extractBillTableName,
  isFoodDiscountEligible,
  calculateItemsDiscountSummary,
} from '../utils/parser';
import { extractBillWithGemini } from '../services/geminiService';
import { GeminiKeyBar } from './GeminiKeyBar';

interface OcrScannerTabProps {
  canWrite: boolean;
  categories: string[];
  products: ProductRecord[];
  existingBills?: BillRecord[];
  existingDebtors: string[];
  onDeleteDebtor?: (name: string) => Promise<void>;
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
    subtotalAmount?: number;
    discountAmount?: number;
    paymentType: PaymentType;
    debtorName: string;
    paidCashAmount?: number;
    paidTransferAmount?: number;
    note: string;
    items: ExtractedBillItem[];
    commissionPayout?: {
      enabled: boolean;
      recipientName: string;
      paymentMethod: 'cash' | 'transfer';
      amount: number;
    };
  }) => Promise<BillRecord | void>;
  onDeleteAllMenuProducts: () => void;
  menuProductsCount: number;
  deductionCategories?: string[];
  onAddExpenseDeduction?: (params: {
    deductionDate: string;
    expenseTitle: string;
    category: string;
    quantity?: number;
    unitPrice?: number;
    amount: number;
    note: string;
  }) => Promise<void>;
  onQuickPayCommission?: (bill: BillRecord) => void;
  isModal?: boolean;
  onCloseModal?: () => void;
  onOpenKiotVietSync?: () => void;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

export const OcrScannerTab: React.FC<OcrScannerTabProps> = ({
  isModal = false,
  onCloseModal,
  canWrite,
  categories,
  products,
  existingBills = [],
  existingDebtors,
  onDeleteDebtor,
  geminiApiKey,
  geminiStatus,
  onSaveGeminiKey,
  onCheckGeminiKey,
  onClearGeminiKey,
  autoAddProducts,
  onToggleAutoAddProducts,
  onQuickPayCommission,
  onSaveExtractedBill,
  onDeleteAllMenuProducts,
  menuProductsCount,
  deductionCategories,
  onAddExpenseDeduction,
  onOpenKiotVietSync,
  requestConfirm,
}) => {
  const todayBusinessStr = getCurrentBusinessDate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // States for Quick Deduction Popup Modal (Req 4)
  const [showQuickDeductionModal, setShowQuickDeductionModal] = useState<boolean>(false);
  const [quickDeductionDate, setQuickDeductionDate] = useState<string>(todayBusinessStr);
  const [quickExpenseTitle, setQuickExpenseTitle] = useState<string>('');
  const [quickCategory, setQuickCategory] = useState<string>(
    deductionCategories?.[0] || DEFAULT_DEDUCTION_CATEGORIES[0] || 'Khác'
  );
  const [quickQuantity, setQuickQuantity] = useState<number>(1);
  const [quickUnitPrice, setQuickUnitPrice] = useState<number>(0);
  const [quickAmount, setQuickAmount] = useState<number>(0);
  const [quickNote, setQuickNote] = useState<string>('');
  const [quickKeepOpen, setQuickKeepOpen] = useState<boolean>(false);
  const [isSavingDeduction, setIsSavingDeduction] = useState<boolean>(false);

  const availableDeductionCategories = useMemo(() => {
    const list =
      deductionCategories && deductionCategories.length > 0
        ? deductionCategories
        : DEFAULT_DEDUCTION_CATEGORIES;
    const s = new Set<string>();
    const res: string[] = [];
    for (const c of list) {
      const clean = (c || '').trim();
      if (clean && !s.has(clean.toLowerCase())) {
        s.add(clean.toLowerCase());
        res.push(clean);
      }
    }
    return res;
  }, [deductionCategories]);

  const [inputMode, setInputMode] = useState<'image' | 'text'>('text');
  const [rawText, setRawText] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [imageZoom, setImageZoom] = useState<number>(1);
  const [imageRotation, setImageRotation] = useState<number>(0);
  const [isReceiptFullscreen, setIsReceiptFullscreen] = useState<boolean>(false);
  const [isReceiptSticky, setIsReceiptSticky] = useState<boolean>(true);
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Mobile Inspection Switcher ('editor' | 'image')
  const [mobileViewTab, setMobileViewTab] = useState<'editor' | 'image'>('editor');

  // Menu Catalog Quick Picker Drawer/Modal
  const [showMenuPickerModal, setShowMenuPickerModal] = useState<boolean>(false);
  const [menuPickerSearch, setMenuPickerSearch] = useState<string>('');
  const [menuPickerCategory, setMenuPickerCategory] = useState<string>('all');

  const [showSampleTemplatesMenu, setShowSampleTemplatesMenu] = useState<boolean>(false);
  const [quickAiItemPrompt, setQuickAiItemPrompt] = useState<string>('');
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [dismissedDuplicateBillId, setDismissedDuplicateBillId] = useState<string | null>(null);
  const [savedBillPopup, setSavedBillPopup] = useState<{
    billCode: string;
    billDate: string;
    checkInTime?: string;
    checkOutTime?: string;
    tableName?: string;
    note?: string;
    itemCount: number;
    totalQuantity: number;
    subtotalAmount: number;
    discountAmount: number;
    totalAmount: number;
    paymentType: PaymentType;
    debtorName?: string;
    paidCashAmount?: number;
    paidTransferAmount?: number;
    commissionPaid?: boolean;
  } | null>(null);
  const [billDate, setBillDate] = useState<string>(todayBusinessStr);
  const [rawCalendarDate, setRawCalendarDate] = useState<string | undefined>(
    undefined
  );
  const [checkInTime, setCheckInTime] = useState<string>('');
  const [checkOutTime, setCheckOutTime] = useState<string>('');
  const [tableName, setTableName] = useState<string>('');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [autoPayCommission, setAutoPayCommission] = useState<boolean>(false);
  const [commissionRecipient, setCommissionRecipient] = useState<string>('');
  const [commissionPaymentMethod, setCommissionPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [splitCashInput, setSplitCashInput] = useState<string>('');
  const [splitTransferInput, setSplitTransferInput] = useState<string>('');
  const [debtorName, setDebtorName] = useState<string>('');
  const [debtorSelectMode, setDebtorSelectMode] = useState<'existing' | 'new'>('new');
  const [note, setNote] = useState<string>('');
  const [items, setItems] = useState<ExtractedBillItem[]>([]);

  // Smart Recent Tables computed from past bills + common presets
  const recentTables = useMemo(() => {
    const list = ['Bàn 1', 'Bàn 2', 'Bàn 3', 'Bàn 4', 'VIP 1', 'VIP 2', 'Mang về'];
    const s = new Set<string>(list);
    for (const b of (existingBills || []).slice(0, 40)) {
      const t = extractBillTableName(b);
      if (t && t.length <= 20) s.add(t);
    }
    return Array.from(s).slice(0, 10);
  }, [existingBills]);

  // Global Clipboard Paste Listener (Ctrl+V any receipt screenshot anywhere on page)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault();
          const blob = items[i].getAsFile();
          if (blob) {
            setInputMode('image');
            setImageMimeType(blob.type || 'image/jpeg');
            const reader = new FileReader();
            reader.onload = async () => {
              const base64Data = String(reader.result || '');
              setImagePreview(base64Data);
              setPanOffset({ x: 0, y: 0 });
              setImageZoom(1);
              setSuccessMsg('📸 Đã dán ảnh bill từ Clipboard! Đang bắt đầu quét OCR...');
              await runAiExtraction({
                imageBase64: base64Data,
                mimeType: blob.type || 'image/jpeg',
              });
            };
            reader.readAsDataURL(blob);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const clearAllBillInputs = () => {
    const freshToday = getCurrentBusinessDate();
    setRawText('');
    setImagePreview(null);
    setImageMimeType('image/jpeg');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setBillDate(freshToday);
    setRawCalendarDate(undefined);
    setCheckInTime('');
    setCheckOutTime('');
    setTableName('');
    setDiscountAmount(0);
    setDiscountPercent(0);
    setDiscountMode('percent');
    setAutoPayCommission(false);
    setCommissionRecipient('');
    setCommissionPaymentMethod('cash');
    setPaymentType('cash');
    setSplitCashInput('');
    setSplitTransferInput('');
    setDebtorName('');
    setDebtorSelectMode('new');
    setNote('');
    setQuickAiItemPrompt('');
    setItems([]);
    setImageZoom(1);
    setImageRotation(0);
    setPanOffset({ x: 0, y: 0 });
    setHighContrast(false);
    setDismissedDuplicateBillId(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    setShowJsonPreview(false);
  };

  const discountItemsSummary = useMemo(() => {
    return calculateItemsDiscountSummary(items, discountPercent);
  }, [items, discountPercent]);

  const subtotalAmount = items.reduce(
    (sum, it) => sum + Math.round((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)),
    0
  );

  const safeDiscount =
    discountMode === 'percent'
      ? discountItemsSummary.discountAmount
      : Math.min(subtotalAmount, Math.max(0, Math.round(Number(discountAmount) || 0)));

  const totalAmount = Math.max(0, subtotalAmount - safeDiscount);

  const handleSelectFoodOnlyForDiscount = () => {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        isDiscountEligible: isFoodDiscountEligible(it),
      }))
    );
  };

  const handleSelectAllForDiscount = () => {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        isDiscountEligible: true,
      }))
    );
  };

  const handleDeselectAllForDiscount = () => {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        isDiscountEligible: false,
      }))
    );
  };

  const handleToggleItemDiscount = (idx: number) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, isDiscountEligible: !(it.isDiscountEligible !== false) } : it
      )
    );
  };

  // Real-Time Duplicate Bill Detector (Phát hiện Bill trùng lặp)
  const duplicateBillWarning = useMemo(() => {
    const validItems = items.filter((it) => it.productName.trim() !== '');
    if (validItems.length === 0 || totalAmount <= 0) return null;

    const cleanTable = tableName.trim().toLowerCase();
    for (const b of existingBills) {
      if (dismissedDuplicateBillId && b.id === dismissedDuplicateBillId) continue;
      if (b.billDate !== billDate) continue;
      if (Math.abs((Number(b.totalAmount) || 0) - totalAmount) > 500) continue;

      const existingTable = (extractBillTableName(b) || '').trim().toLowerCase();
      const sameTable =
        cleanTable !== '' &&
        existingTable !== '' &&
        cleanTable === existingTable;
      const sameCheckIn =
        checkInTime.trim() !== '' &&
        (b.checkInTime || '').trim() === checkInTime.trim();

      const summaryLower = (b.itemsSummary || '').toLowerCase();
      let matchedItemCount = 0;
      for (const it of validItems) {
        const pLower = it.productName.trim().toLowerCase();
        if (pLower && summaryLower.includes(pLower)) {
          matchedItemCount += 1;
        }
      }
      const highItemOverlap =
        validItems.length > 0 && matchedItemCount / validItems.length >= 0.7;

      if (sameTable || sameCheckIn || highItemOverlap) {
        const diffMin = Math.max(
          1,
          Math.round((Date.now() - (b.createdAtMs || Date.now())) / 60000)
        );
        const timeAgoLabel =
          diffMin < 60
            ? `cách đây ${diffMin} phút`
            : diffMin < 1440
            ? `cách đây ${Math.round(diffMin / 60)} giờ`
            : `trong ca ngày ${b.billDate}`;
        return {
          bill: b,
          timeAgoLabel,
          matchedItemCount,
          totalDraftItems: validItems.length,
        };
      }
    }
    return null;
  }, [items, totalAmount, billDate, tableName, checkInTime, existingBills]);

  // Strict JSON output structure including all requested fields
  const strictJsonOutput: ExtractedBillJSON = {
    billInfo: {
      billDate,
      ...(rawCalendarDate && rawCalendarDate !== billDate
        ? { rawDate: rawCalendarDate }
        : {}),
      checkInTime: checkInTime || '',
      checkOutTime: checkOutTime || '',
      ...(tableName ? { tableName } : {}),
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
      ...(it.originalUnitPrice && it.originalUnitPrice > (Number(it.unitPrice) || 0)
        ? {
            originalUnitPrice: Number(it.originalUnitPrice),
            discountAmount:
              it.discountAmount ??
              Math.max(0, Number(it.originalUnitPrice) - (Number(it.unitPrice) || 0)),
            discountPercent:
              it.discountPercent ??
              Math.round(
                ((Number(it.originalUnitPrice) - (Number(it.unitPrice) || 0)) /
                  Number(it.originalUnitPrice)) *
                  10000
              ) / 100,
          }
        : {}),
    })),
  };

  const applyExtractedResult = (result: ExtractedBillJSON) => {
    setBillDate(result.billInfo.billDate || todayBusinessStr);
    setRawCalendarDate(result.billInfo.rawDate);
    setCheckInTime(result.billInfo.checkInTime || '');
    setCheckOutTime(result.billInfo.checkOutTime || '');
    setTableName(normalizeTableName(result.billInfo.tableName || ''));
    
    const parsedDisc = Math.max(0, Math.round(result.billInfo.discountAmount || 0));
    setDiscountAmount(parsedDisc);
    setPaymentType(result.billInfo.paymentType || 'cash');
    if (result.billInfo.paymentType === 'split') {
      if (result.billInfo.paidCashAmount !== undefined) {
        setSplitCashInput(String(result.billInfo.paidCashAmount));
      }
      if (result.billInfo.paidTransferAmount !== undefined) {
        setSplitTransferInput(String(result.billInfo.paidTransferAmount));
      }
    } else {
      setSplitCashInput('');
      setSplitTransferInput('');
    }
    setDebtorName(
      result.billInfo.paymentType === 'debt' ? result.billInfo.debtorName || '' : ''
    );

    const mappedItems: ExtractedBillItem[] = [];
    for (const it of result.items || []) {
      const recovered = recoverPosDishFromItem(it, products, categories);
      if (!recovered || !recovered.productName) continue;
      const cleanName = recovered.productName;
      const cleanCat = recovered.category || inferCategory(cleanName, categories);
      const qty = Math.max(1, Math.round(it.quantity || 1));
      const uPrice = Math.max(
        0,
        Math.round(it.unitPrice || 0)
      );
      const eligible =
        it.isDiscountEligible !== undefined
          ? it.isDiscountEligible
          : isFoodDiscountEligible({ productName: cleanName, category: cleanCat });

      mappedItems.push({
        productName: cleanName,
        note: recovered.note || '',
        category: cleanCat,
        quantity: qty,
        unitPrice: uPrice,
        subtotal: qty * uPrice,
        originalUnitPrice: it.originalUnitPrice,
        discountAmount: it.discountAmount,
        discountPercent: it.discountPercent,
        isDiscountEligible: eligible,
      });
    }

    setItems(mappedItems);

    if (parsedDisc > 0) {
      const foodTotal = mappedItems
        .filter((it) => it.isDiscountEligible !== false)
        .reduce((s, it) => s + (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0), 0);
      if (foodTotal > 0) {
        const pct = Math.round((parsedDisc / foodTotal) * 100);
        if (pct > 0 && Math.abs(Math.round((foodTotal * pct) / 100) - parsedDisc) <= 1000) {
          setDiscountPercent(pct);
          setDiscountMode('percent');
        } else {
          setDiscountMode('amount');
        }
      } else {
        setDiscountMode('amount');
      }
    }
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
    forceGemini?: boolean;
  }) => {
    setIsProcessing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let data: any = null;

      // 1. Nếu là văn bản và không yêu cầu ép gọi Gemini qua mạng: Sử dụng bộ bóc tách siêu tốc (0s delay, chuẩn xác 100% không nhầm món)
      if (payload.text && !payload.imageBase64 && !payload.forceGemini) {
        const localParsed = parseRawTextToBillJSON(
          payload.text,
          billDate || todayBusinessStr,
          products,
          categories
        );
        if (localParsed && Array.isArray(localParsed.items) && localParsed.items.length > 0) {
          data = localParsed;
        }
      }

      // 2. Nếu là hình ảnh hoặc chưa bóc tách được từ văn bản: Gọi Gemini AI
      if (!data) {
        data = await extractBillWithGemini({
          imageBase64: payload.imageBase64,
          mimeType: payload.mimeType,
          rawText: payload.text,
          defaultDate: billDate || todayBusinessStr,
          apiKey: geminiApiKey || undefined,
          categories,
          existingProducts: products,
        });
      }

      if (data && Array.isArray(data.items) && data.items.length > 0) {
        if (payload.appendMode) {
          const newItems: ExtractedBillItem[] = [];
          for (const it of data.items || []) {
            const recovered = recoverPosDishFromItem(it, products, categories);
            if (!recovered || !recovered.productName) continue;
            const cleanName = recovered.productName;
            const cleanCat = recovered.category || inferCategory(cleanName, categories);
            const qty = Math.max(1, Math.round(it.quantity || 1));
            const uPrice = Math.max(0, Math.round(it.unitPrice || 0));
            const eligible =
              it.isDiscountEligible !== undefined
                ? it.isDiscountEligible
                : isFoodDiscountEligible({ productName: cleanName, category: cleanCat });

            newItems.push({
              productName: cleanName,
              note: recovered.note || '',
              category: cleanCat,
              quantity: qty,
              unitPrice: uPrice,
              subtotal: qty * uPrice,
              originalUnitPrice: it.originalUnitPrice,
              discountAmount: it.discountAmount,
              discountPercent: it.discountPercent,
              isDiscountEligible: eligible,
            });
          }
          setItems((prev) => [...prev, ...newItems]);
          setSuccessMsg(
            `Đã nhận diện và thêm ${newItems.length} món mới vào hóa đơn hiện tại!`
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

  const handleAdjustQuantity = (index: number, delta: number) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const currentQty = Number(item.quantity) || 1;
        const nextQty = Math.max(1, currentQty + delta);
        return {
          ...item,
          quantity: nextQty,
          subtotal: nextQty * item.unitPrice,
        };
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
    const defaultProd = products[0];
    const defaultName = '';
    const defaultCat = defaultProd ? defaultProd.category : categories[0] || 'Món ăn';
    const defaultPrice = 0;
    setItems((prev) => [
      ...prev,
      {
        productName: defaultName,
        note: '',
        category: defaultCat,
        quantity: 1,
        unitPrice: defaultPrice,
        subtotal: 0,
        isDiscountEligible: true,
      },
    ]);
  };

  const handleDuplicateItem = (index: number) => {
    setItems((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const copy: ExtractedBillItem = {
        ...target,
        note: target.note ? `${target.note}` : '',
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setSuccessMsg('Đã nhân đôi dòng món!');
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  const handleAddProductFromCatalog = (prod: ProductRecord) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) => it.productName.toLowerCase().trim() === prod.productName.toLowerCase().trim()
      );
      if (existingIdx !== -1) {
        const next = [...prev];
        const cur = next[existingIdx];
        const nextQty = (Number(cur.quantity) || 1) + 1;
        next[existingIdx] = {
          ...cur,
          quantity: nextQty,
          subtotal: nextQty * cur.unitPrice,
        };
        return next;
      }
      return [
        ...prev,
        {
          productName: prod.productName,
          note: '',
          category: prod.category,
          quantity: 1,
          unitPrice: prod.unitPrice,
          subtotal: prod.unitPrice,
          isDiscountEligible: isFoodDiscountEligible({
            productName: prod.productName,
            category: prod.category,
          }),
        },
      ];
    });
    setSuccessMsg(`Đã thêm "${prod.productName}" (${formatVND(prod.unitPrice)}) vào bill!`);
    setTimeout(() => setSuccessMsg(null), 2000);
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

  const executeSaveBillNow = async () => {
    const validItems = items.filter((it) => it.productName.trim() !== '');
    const normalizedTable = normalizeTableName(tableName);
    let finalNote = [normalizedTable, note.trim()].filter(Boolean).join(' - ');
    const isSplit = paymentType === 'split';
    let finalPaidCash: number | undefined = undefined;
    let finalPaidTransfer: number | undefined = undefined;

    if (isSplit) {
      const parsedCash = Math.max(0, Math.round(Number(splitCashInput) || 0));
      const parsedTransfer = Math.max(0, Math.round(Number(splitTransferInput) || 0));

      if (parsedCash > 0 && parsedTransfer > 0) {
        finalPaidCash = parsedCash;
        finalPaidTransfer = parsedTransfer;
      } else if (parsedCash > 0) {
        finalPaidCash = Math.min(totalAmount, parsedCash);
        finalPaidTransfer = Math.max(0, totalAmount - finalPaidCash);
      } else if (parsedTransfer > 0) {
        finalPaidTransfer = Math.min(totalAmount, parsedTransfer);
        finalPaidCash = Math.max(0, totalAmount - finalPaidTransfer);
      } else {
        finalPaidCash = Math.round(totalAmount / 2);
        finalPaidTransfer = totalAmount - finalPaidCash;
      }

      const splitTag = `[TM: ${formatVND(finalPaidCash)} · CK: ${formatVND(finalPaidTransfer)}]`;
      if (!finalNote.includes('[TM:') && !finalNote.includes('TM:')) {
        finalNote = finalNote ? `${finalNote} · ${splitTag}` : splitTag;
      }
    }

    if (safeDiscount > 0) {
      const ckTag =
        discountMode === 'percent' && discountPercent > 0
          ? `[CK ${discountPercent}% món ăn: -${formatVND(safeDiscount)}]`
          : `[CK đặt bàn: -${formatVND(safeDiscount)}]`;
      if (/\[CK\s*.*?\]/i.test(finalNote)) {
        finalNote = finalNote.replace(/\[CK\s*.*?\]/i, ckTag);
      } else {
        finalNote = finalNote ? `${finalNote} · ${ckTag}` : ckTag;
      }
    }

    const commissionEnabled = autoPayCommission && safeDiscount > 0;
    const snapshotPopup = {
      billCode: `HD-${billDate.replace(/-/g, '').slice(2)}`,
      billDate,
      checkInTime: checkInTime.trim() || undefined,
      checkOutTime: checkOutTime.trim() || undefined,
      tableName: normalizedTable || undefined,
      note: finalNote || undefined,
      itemCount: validItems.length,
      totalQuantity: validItems.reduce((s, it) => s + (Number(it.quantity) || 1), 0),
      subtotalAmount,
      discountAmount: safeDiscount,
      totalAmount,
      paymentType,
      paidCashAmount: finalPaidCash,
      paidTransferAmount: finalPaidTransfer,
      debtorName: paymentType === 'debt' ? debtorName.trim() : undefined,
      commissionPaid: commissionEnabled,
    };

    setIsSaving(true);
    setErrorMsg(null);
    try {
      const savedBill = await onSaveExtractedBill({
        billDate,
        rawDate: rawCalendarDate,
        checkInTime: checkInTime.trim() || undefined,
        checkOutTime: checkOutTime.trim() || undefined,
        subtotalAmount,
        discountAmount: safeDiscount,
        paymentType,
        debtorName: paymentType === 'debt' ? debtorName.trim() : '',
        paidCashAmount: finalPaidCash,
        paidTransferAmount: finalPaidTransfer,
        note: finalNote,
        items: validItems.map((it) => ({
          ...it,
          isDiscountEligible: it.isDiscountEligible !== false,
        })),
        commissionPayout: commissionEnabled
          ? {
              enabled: true,
              recipientName: commissionRecipient.trim() || normalizedTable || 'Người đặt bàn',
              paymentMethod: commissionPaymentMethod,
              amount: safeDiscount,
            }
          : undefined,
      });

      // Clear all information of the bill entry section
      clearAllBillInputs();

      // Open the Save Success Popup Modal
      setSavedBillPopup({
        ...snapshotPopup,
        billCode: savedBill?.billCode || snapshotPopup.billCode,
        billDate: savedBill?.billDate || snapshotPopup.billDate,
        totalAmount: savedBill?.totalAmount ?? snapshotPopup.totalAmount,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi khi lưu hóa đơn.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveQuickDeduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddExpenseDeduction) return;
    const cleanTitle = quickExpenseTitle.trim();
    if (!cleanTitle) {
      setErrorMsg('Vui lòng nhập tên khoản trừ / khoản chi.');
      return;
    }
    const finalAmount = quickAmount > 0 ? quickAmount : (quickQuantity || 1) * (quickUnitPrice || 0);
    if (finalAmount <= 0) {
      setErrorMsg('Vui lòng nhập số tiền trừ hợp lệ (> 0 VNĐ).');
      return;
    }

    try {
      setIsSavingDeduction(true);
      await onAddExpenseDeduction({
        deductionDate: quickDeductionDate || todayBusinessStr,
        expenseTitle: cleanTitle,
        category: quickCategory || 'Khác',
        quantity: quickQuantity || 1,
        unitPrice: quickUnitPrice > 0 ? quickUnitPrice : finalAmount,
        amount: finalAmount,
        note: quickNote.trim(),
      });

      setSuccessMsg(`Đã lưu khoản trừ "${cleanTitle}" (-${formatVND(finalAmount)}) vào ngày ${quickDeductionDate}!`);
      setTimeout(() => setSuccessMsg(null), 4000);

      if (quickKeepOpen) {
        setQuickExpenseTitle('');
        setQuickAmount(0);
        setQuickUnitPrice(0);
        setQuickNote('');
      } else {
        setShowQuickDeductionModal(false);
        setQuickExpenseTitle('');
        setQuickAmount(0);
        setQuickUnitPrice(0);
        setQuickNote('');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi khi lưu khoản trừ.');
    } finally {
      setIsSavingDeduction(false);
    }
  };

  const handleSaveBill = async () => {
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
      setErrorMsg('Vui lòng chọn hoặc nhập Tên người nợ đối với hóa đơn Công nợ.');
      return;
    }

    if (duplicateBillWarning) {
      requestConfirm({
        title: 'Cảnh Báo: Phát Hiện Hóa Đơn Trùng Lặp!',
        message: `Hệ thống phát hiện Bill đang nhập có cùng tổng tiền ${formatVND(
          totalAmount
        )} và trùng món/bàn với hóa đơn "${
          duplicateBillWarning.bill.billCode
        }" (${duplicateBillWarning.bill.note || 'Không ghi chú'}) đã được nhập ${
          duplicateBillWarning.timeAgoLabel
        }. Bạn có chắc chắn vẫn muốn lưu thêm hóa đơn này không?`,
        confirmLabel: 'Vẫn Lưu Hóa Đơn Này',
        variant: 'warning',
        onConfirm: async () => {
          await executeSaveBillNow();
        },
      });
      return;
    }

    await executeSaveBillNow();
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

      {/* Top Header & Mode Navigation */}
      <div className="p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Chụp & Nhập Hóa Đơn (OCR Thông Minh)
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              Trích xuất tự động: <strong>Bàn, món, số lượng, đơn giá, chiết khấu, hình thức thanh toán & ca bán hàng (09:00 sáng → 08:00 sáng hôm sau)</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mode Segmented Controls */}
            <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setInputMode('image')}
                className={`h-8 px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                  inputMode === 'image'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Chụp / Ảnh Bill</span>
              </button>
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={`h-8 px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                  inputMode === 'text'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Dán Văn Bản</span>
              </button>
            </div>

            {/* Sample Templates Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSampleTemplatesMenu((prev) => !prev)}
                className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                title="Chọn mẫu hóa đơn mẫu để kiểm thử bóc tách nhanh"
              >
                <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Mẫu bill test</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showSampleTemplatesMenu && (
                <div className="absolute right-0 top-full mt-1.5 z-30 w-72 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-2 space-y-1 animate-in fade-in zoom-in-95 duration-100">
                  <div className="text-[11px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                    Chọn mẫu kiểm thử
                  </div>
                  {SAMPLE_BILL_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        handleSelectSampleTemplate(tpl.id);
                        setShowSampleTemplatesMenu(false);
                      }}
                      className="w-full text-left p-2 rounded-xl hover:bg-emerald-50/80 dark:hover:bg-emerald-950/40 text-xs transition-colors cursor-pointer group"
                    >
                      <div className="font-semibold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                        {tpl.label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {tpl.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Menu Auto-Add Checkbox */}
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoAddProducts}
                onChange={(e) => onToggleAutoAddProducts(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Tự lưu món mới vào Menu</span>
            </label>

            {/* KiotViet Sync F9 Button */}
            {onOpenKiotVietSync && (
              <button
                type="button"
                onClick={onOpenKiotVietSync}
                className="h-9 px-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-700 dark:text-rose-300 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-2xs"
                title="Cài đặt script bắt sự kiện nút Thanh toán (F9) bên KiotViet để tự đồng bộ"
              >
                <Zap className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Đồng bộ KiotViet (F9)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status Alerts */}
      {duplicateBillWarning && (
        <div className="p-4 rounded-2xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-extrabold text-amber-900 dark:text-amber-200">
                CẢNH BÁO PHÁT HIỆN BILL TRÙNG LẶP ({duplicateBillWarning.bill.billCode})!
              </div>
              <p className="leading-relaxed">
                Bill này có vẻ đã được nhập <strong>{duplicateBillWarning.timeAgoLabel}</strong>: Mã{' '}
                <strong className="font-mono">{duplicateBillWarning.bill.billCode}</strong> ·{' '}
                <strong>{duplicateBillWarning.bill.note || 'Bàn khách'}</strong> · Tổng cộng{' '}
                <strong className="font-mono">{formatVND(duplicateBillWarning.bill.totalAmount)}</strong>{' '}
                (Trùng {duplicateBillWarning.matchedItemCount}/{duplicateBillWarning.totalDraftItems} món).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDismissedDuplicateBillId(duplicateBillWarning.bill.id)}
              className="px-3 py-1.5 rounded-xl border border-amber-400 dark:border-amber-600 bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-200 font-bold whitespace-nowrap cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/40"
              title="Bỏ qua cảnh báo nếu đây là bill thật khác bàn"
            >
              Vẫn Giữ & Tiếp Tục
            </button>
            <button
              type="button"
              onClick={clearAllBillInputs}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold whitespace-nowrap cursor-pointer"
            >
              Hủy Bill Trùng Này
            </button>
          </div>
        </div>
      )}
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

      {/* Mobile Toggle Tabs: Soi Ảnh Bill vs Soạn Danh Sách Món (< lg) */}
      {imagePreview && (
        <div className="lg:hidden flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
          <button
            type="button"
            onClick={() => setMobileViewTab('editor')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              mobileViewTab === 'editor'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Soạn Món ({items.length}) · {formatVND(totalAmount)}</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileViewTab('image')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              mobileViewTab === 'image'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Soi Ảnh Bill ({Math.round(imageZoom * 100)}%)</span>
          </button>
        </div>
      )}

      {/* Main Split Grid: Left (Source/Receipt Inspector) - Right (Interactive Editor) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Image Inspector or Text Input Area */}
        <div
          className={`lg:col-span-4 xl:col-span-3.5 2xl:col-span-3 p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xs space-y-4 ${
            imagePreview && mobileViewTab === 'editor' ? 'hidden lg:block' : ''
          } ${isReceiptSticky && imagePreview ? 'lg:sticky lg:top-4' : ''}`}
        >
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

              {!imagePreview ? (
                /* Dropzone / Camera trigger with drag-and-drop & clipboard paste support */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith('image/')) {
                      setImageMimeType(file.type || 'image/jpeg');
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const base64Data = String(reader.result || '');
                        setImagePreview(base64Data);
                        setPanOffset({ x: 0, y: 0 });
                        setImageZoom(1);
                        await runAiExtraction({
                          imageBase64: base64Data,
                          mimeType: file.type || 'image/jpeg',
                        });
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all space-y-3 ${
                    isDragOver
                      ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/50 ring-4 ring-emerald-500/20 scale-[0.99]'
                      : 'border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50/50 dark:bg-slate-950/40'
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-xs">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      Chụp ảnh Hóa Đơn hoặc Kéo thả / Dán (Ctrl+V) ảnh vào đây
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto mt-1">
                      Hỗ trợ hóa đơn in nhiệt, phiếu tính tiền, bill viết tay. Tự động nhận diện chữ & số bằng Gemini AI.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Chọn file từ máy / Chụp ảnh</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono px-2 py-1 rounded bg-slate-200/60 dark:bg-slate-800">
                      phím tắt: Ctrl + V
                    </span>
                  </div>
                </div>
              ) : (
                /* Interactive Receipt Inspector (Soi Bill Trực Quan) */
                <div className="space-y-3">
                  {/* Inspector Toolbar */}
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setImageZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100));
                          if (imageZoom <= 1.25) setPanOffset({ x: 0, y: 0 });
                        }}
                        className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 flex items-center justify-center hover:bg-slate-50 cursor-pointer"
                        title="Thu nhỏ (-)"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300 w-12 text-center">
                        {Math.round(imageZoom * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => setImageZoom((z) => Math.min(3.5, Math.round((z + 0.25) * 100) / 100))}
                        className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 flex items-center justify-center hover:bg-slate-50 cursor-pointer"
                        title="Phóng to (+)"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageRotation((r) => (r + 90) % 360)}
                        className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 flex items-center justify-center hover:bg-slate-50 cursor-pointer"
                        title="Xoay ảnh 90 độ"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setHighContrast((v) => !v)}
                        className={`px-2 h-7 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                          highContrast
                            ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                        }`}
                        title="Bật/Tắt chế độ tăng độ tương phản để đọc rõ chữ in nhiệt mờ"
                      >
                        <Sun className="w-3 h-3" />
                        <span className="hidden sm:inline">{highContrast ? 'Nét đậm' : 'Độ nét'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setImageZoom(1);
                          setImageRotation(0);
                          setPanOffset({ x: 0, y: 0 });
                          setHighContrast(false);
                        }}
                        className="px-2 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                        title="Khôi phục kích thước ban đầu"
                      >
                        Gốc
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsReceiptFullscreen(true)}
                        className="px-2 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 hover:bg-slate-50 cursor-pointer"
                        title="Phóng to toàn màn hình để soi chi tiết"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Phóng to</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        title="Chụp lại hoặc chọn ảnh khác"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Đổi ảnh</span>
                      </button>
                    </div>
                  </div>

                  {/* Image Viewer Container with smooth zoom, rotation & draggable pan */}
                  <div
                    className={`relative border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-950 max-h-[480px] h-[380px] sm:h-[460px] flex items-center justify-center p-2 select-none ${
                      imageZoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                    }`}
                    onMouseDown={(e) => {
                      if (imageZoom > 1) {
                        setIsPanning(true);
                        panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
                      }
                    }}
                    onMouseMove={(e) => {
                      if (isPanning && imageZoom > 1) {
                        setPanOffset({
                          x: e.clientX - panStartRef.current.x,
                          y: e.clientY - panStartRef.current.y,
                        });
                      }
                    }}
                    onMouseUp={() => setIsPanning(false)}
                    onMouseLeave={() => setIsPanning(false)}
                    onTouchStart={(e) => {
                      if (imageZoom > 1 && e.touches.length === 1) {
                        setIsPanning(true);
                        panStartRef.current = {
                          x: e.touches[0].clientX - panOffset.x,
                          y: e.touches[0].clientY - panOffset.y,
                        };
                      }
                    }}
                    onTouchMove={(e) => {
                      if (isPanning && imageZoom > 1 && e.touches.length === 1) {
                        setPanOffset({
                          x: e.touches[0].clientX - panStartRef.current.x,
                          y: e.touches[0].clientY - panStartRef.current.y,
                        });
                      }
                    }}
                    onTouchEnd={() => setIsPanning(false)}
                  >
                    <div
                      className="transition-transform duration-75 origin-center max-w-full max-h-full flex items-center justify-center pointer-events-none"
                      style={{
                        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${imageZoom}) rotate(${imageRotation}deg)`,
                        filter: highContrast ? 'contrast(1.75) grayscale(1) brightness(1.08)' : 'none',
                      }}
                    >
                      <img
                        src={imagePreview}
                        alt="Ảnh hóa đơn đang soi"
                        referrerPolicy="no-referrer"
                        draggable={false}
                        className="max-h-[440px] max-w-full object-contain rounded-lg shadow-lg select-none"
                      />
                    </div>

                    {imageZoom > 1 && (
                      <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-[10px] text-white/80 backdrop-blur-xs font-mono pointer-events-none">
                        Kéo thả để di chuyển ảnh
                      </div>
                    )}

                    {isProcessing && (
                      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-2xs flex flex-col items-center justify-center gap-3 text-white">
                        <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
                        <div className="text-center">
                          <p className="text-sm font-bold">Gemini AI đang bóc tách hóa đơn...</p>
                          <p className="text-xs text-slate-300">Đang nhận diện món, số lượng, đơn giá và bàn...</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Rescan AI Action */}
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() =>
                      runAiExtraction({
                        imageBase64: imagePreview,
                        mimeType: imageMimeType,
                      })
                    }
                    className="w-full h-10 px-4 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                    <span>
                      {isProcessing
                        ? 'Gemini AI đang đọc hóa đơn...'
                        : 'Quét lại ảnh bằng Gemini AI OCR'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Text Mode */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Dán nội dung hóa đơn (Tự tách ghi chú & Combo):
                </label>
                {rawText && (
                  <button
                    type="button"
                    onClick={() => setRawText('')}
                    className="text-[11px] text-rose-500 hover:text-rose-700 cursor-pointer font-medium"
                  >
                    Xóa văn bản
                  </button>
                )}
              </div>

              <textarea
                rows={12}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`Ví dụ định dạng bill:\nNgày: ${billDate}\nBàn 24 - Giờ vào: 19:30 - Giờ ra: 22:30\n1. Bia Tiger Lùn x10 lon 22000 220000\n2. Gà biển kho nghệ (làm cay) x1 phần 129000\n3. Combo lẩu hải sản ======================\n>>> Cơm chiên hải sản <<<\n====================== giá 459000\nTổng cộng: 808.000đ`}
                className="w-full p-3.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const syncedText = normalizeSynchronizedReceiptText(rawText);
                    if (syncedText && syncedText !== rawText) {
                      setRawText(syncedText);
                    }
                    const parsed = parseRawTextToBillJSON(
                      syncedText || rawText,
                      billDate || todayBusinessStr,
                      products,
                      categories
                    );
                    applyExtractedResult(parsed);
                    setSuccessMsg(
                      `⚡ ĐÃ QUÉT TỨC THÌ (0s): ${parsed.items.length} món (Tổng: ${formatVND(
                        parsed.billInfo.totalAmount
                      )}, Bàn: ${parsed.billInfo.tableName || 'Chưa rõ'}).`
                    );
                  }}
                  className="h-10 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-4 h-4" />
                  <span>Quét Tức Thì (0s - Chuẩn xác)</span>
                </button>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => {
                    const syncedText = normalizeSynchronizedReceiptText(rawText);
                    if (syncedText && syncedText !== rawText) {
                      setRawText(syncedText);
                    }
                    const instantParsed = parseRawTextToBillJSON(
                      syncedText || rawText,
                      billDate || todayBusinessStr,
                      products,
                      categories
                    );
                    if (instantParsed.items.length > 0) {
                      applyExtractedResult(instantParsed);
                    }
                    runAiExtraction({ text: syncedText || rawText, forceGemini: true });
                  }}
                  className="h-10 px-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>{isProcessing ? 'Gemini đang phân tích...' : 'Quét sâu bằng Gemini AI'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Collapsible Clean JSON Output (Subtle & Quiet) */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setShowJsonPreview((v) => !v)}
                className="inline-flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>{showJsonPreview ? 'Ẩn JSON kỹ thuật' : 'Xem JSON kỹ thuật'}</span>
              </button>
              {showJsonPreview && (
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  {copiedJson ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedJson ? 'Đã copy' : 'Copy'}</span>
                </button>
              )}
            </div>
            {showJsonPreview && (
              <pre className="mt-2 p-3 rounded-xl bg-slate-950 text-emerald-400 text-[10px] font-mono overflow-x-auto max-h-40 leading-relaxed border border-slate-800">
                {JSON.stringify(strictJsonOutput, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* Right Area: Interactive Bill Review, Items Table & Fast Entry */}
        <div
          className={`lg:col-span-8 xl:col-span-8.5 2xl:col-span-9 p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xs space-y-4 ${
            imagePreview && mobileViewTab === 'image' ? 'hidden lg:block' : ''
          }`}
        >
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Hóa Đơn & Danh Sách Món</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {items.length} món
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Kiểm tra hoặc chỉnh sửa món, số lượng, hình thức thanh toán trước khi lưu
              </p>
            </div>

            <div className="flex flex-col items-end gap-1.5 sm:justify-end">
              <div className="flex items-center gap-2.5">
                <div className="text-right">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Tổng cộng thanh toán</span>
                  <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatVND(totalAmount)}
                  </span>
                </div>
                {onAddExpenseDeduction && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickDeductionDate(billDate || todayBusinessStr);
                      setShowQuickDeductionModal(true);
                    }}
                    className="h-8.5 px-3 rounded-xl border border-amber-400/90 dark:border-amber-700 bg-amber-50/90 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-900 dark:text-amber-200 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors shrink-0"
                    title="Nhập khoản chi/khoản trừ trong ngày"
                  >
                    <MinusCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Nhập Khoản Trừ</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                disabled={isSaving || !canWrite}
                onClick={handleSaveBill}
                className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs shrink-0"
              >
                <Save className="w-4 h-4 shrink-0" />
                <span>{isSaving ? 'Đang lưu...' : 'Lưu Bill'}</span>
              </button>
            </div>
          </div>

          {/* Shift Date Notice Banner */}
          {rawCalendarDate && rawCalendarDate !== billDate && (
            <div className="p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
              <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                Bill ghi ngày <strong>{rawCalendarDate}</strong> (khung giờ trước 08:00 sáng) nên tự động kết chuyển vào ca bán ngày <strong>{billDate}</strong> (09:00 sáng → 08:00 sáng hôm sau).
              </span>
            </div>
          )}

          {/* Bill Metadata Grid */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ngày tính Bill (Ca ngày)
                </label>
                <input
                  type="date"
                  value={billDate}
                  onChange={(e) => {
                    setBillDate(e.target.value);
                    setRawCalendarDate(e.target.value);
                  }}
                  className="w-full h-9 px-3 text-xs font-mono font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Giờ vào
                  </label>
                  <input
                    type="text"
                    value={checkInTime}
                    onChange={(e) => setCheckInTime(e.target.value)}
                    onBlur={handleApplyShiftDateFromTime}
                    placeholder="VD: 19:30"
                    className="w-full h-9 px-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Giờ ra
                  </label>
                  <input
                    type="text"
                    value={checkOutTime}
                    onChange={(e) => setCheckOutTime(e.target.value)}
                    onBlur={handleApplyShiftDateFromTime}
                    placeholder="VD: 01:30"
                    className="w-full h-9 px-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Phòng / Bàn
                  </label>
                  <div className="flex flex-wrap items-center gap-1">
                    {recentTables.slice(0, 5).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTableName(preset)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                          tableName === preset
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  list="vqbill-table-presets-list"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  onBlur={() => setTableName((prev) => normalizeTableName(prev))}
                  placeholder="VD: Bàn 24, VIP 1, Mang về..."
                  className="w-full h-9 px-3 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <datalist id="vqbill-table-presets-list">
                  {recentTables.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>

              {/* Chiết khấu cho người đặt bàn / Giảm giá theo món */}
              <div className="sm:col-span-2 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Percent className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Chiết khấu / Giảm giá (Cho người đặt bàn)
                    </span>
                  </div>

                  {/* Switch mode */}
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountMode('percent');
                        if (discountPercent === 0 && safeDiscount > 0) {
                          const base = discountItemsSummary.eligibleTotal || subtotalAmount || 1;
                          const approx = Math.min(100, Math.max(1, Math.round((safeDiscount / base) * 100)));
                          setDiscountPercent(approx);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        discountMode === 'percent'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      % Theo món đã chọn
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountMode('amount');
                        if (safeDiscount > 0 && (!discountAmount || discountAmount === 0)) {
                          setDiscountAmount(safeDiscount);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        discountMode === 'amount'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      Nhập số tiền VNĐ (₫)
                    </button>
                  </div>
                </div>

                {discountMode === 'percent' ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          Chọn món:
                        </span>
                        <button
                          type="button"
                          onClick={handleSelectFoodOnlyForDiscount}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 inline-flex items-center gap-1 cursor-pointer transition-colors"
                          title="Tự động chọn các món ăn, loại trừ Nước ngọt/Bia/Nước suối/Bún/Bánh mì/Khăn"
                        >
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          <span>Món ăn (Trừ Nước/Bia/Bún/Bánh mì)</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectAllForDiscount}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                        >
                          Tất cả ({items.length})
                        </button>
                        <button
                          type="button"
                          onClick={handleDeselectAllForDiscount}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Bỏ chọn
                        </button>
                      </div>

                      {/* Quick % buttons */}
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mr-1">
                          Mức %:
                        </span>
                        {[5, 10, 15, 20].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => {
                              setDiscountPercent(pct);
                              if (discountItemsSummary.eligibleCount === 0) {
                                handleSelectFoodOnlyForDiscount();
                              }
                            }}
                            className={`h-7 px-2 rounded-lg text-xs font-bold font-mono border transition-colors cursor-pointer ${
                              discountPercent === pct
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                        <div className="relative w-16">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={discountPercent || ''}
                            onChange={(e) => {
                              const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                              setDiscountPercent(val);
                              if (val > 0 && discountItemsSummary.eligibleCount === 0) {
                                handleSelectFoodOnlyForDiscount();
                              }
                            }}
                            placeholder="%"
                            className="w-full h-7 pl-2 pr-4 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                            %
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Realtime Breakdown Status Card */}
                    <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-emerald-200/70 dark:border-emerald-900/50 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
                        <span>
                          Đã chọn:{' '}
                          <strong className="text-emerald-700 dark:text-emerald-300">
                            {discountItemsSummary.eligibleCount}/{items.length} món
                          </strong>{' '}
                          ({formatVND(discountItemsSummary.eligibleTotal)})
                        </span>
                        {discountItemsSummary.nonEligibleTotal > 0 && (
                          <span className="text-slate-400">
                            Không CK (Bia/nước/khăn): {formatVND(discountItemsSummary.nonEligibleTotal)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono">
                          Giảm {discountPercent}%: -{formatVND(discountItemsSummary.discountAmount)}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <span className="font-bold text-slate-900 dark:text-white font-mono">
                          Tổng Bill: {formatVND(totalAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={discountAmount || ''}
                          onChange={(e) =>
                            setDiscountAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))
                          }
                          placeholder="Nhập số tiền giảm giá trực tiếp..."
                          className="w-full h-9 pl-3 pr-8 text-xs font-mono font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                          ₫
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        -{formatVND(safeDiscount)}
                      </span>
                    </div>
                    {/* Quick VND presets */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-slate-500">Mức nhanh:</span>
                      {[50000, 100000, 200000, 500000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setDiscountAmount(amt)}
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-semibold border transition-colors cursor-pointer ${
                            discountAmount === amt
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                          }`}
                        >
                          {formatVND(amt)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Commission Payout / Gửi tiền chiết khấu cho người đặt bàn */}
                {safeDiscount > 0 && (
                  <div className="pt-2.5 border-t border-emerald-200/60 dark:border-emerald-900/40 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoPayCommission}
                        onChange={(e) => setAutoPayCommission(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Ghi nhận khoản chi gửi tiền chiết khấu cho người đặt bàn vào Sổ quỹ
                      </span>
                    </label>

                    {autoPayCommission && (
                      <div className="p-2.5 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-emerald-300 dark:border-emerald-800 space-y-2 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-0.5">
                              Người nhận (Tên / SĐT người đặt bàn):
                            </span>
                            <input
                              type="text"
                              value={commissionRecipient}
                              onChange={(e) => setCommissionRecipient(e.target.value)}
                              placeholder={tableName ? `VD: Người đặt ${tableName}...` : 'VD: Anh Nam đặt bàn 0988xxx...'}
                              className="w-full h-8 px-2.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
                          </div>
                          <div>
                            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-0.5">
                              Hình thức chi tiền:
                            </span>
                            <div className="grid grid-cols-2 gap-1.5 h-8">
                              <button
                                type="button"
                                onClick={() => setCommissionPaymentMethod('cash')}
                                className={`px-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1 cursor-pointer ${
                                  commissionPaymentMethod === 'cash'
                                    ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                Tiền mặt
                              </button>
                              <button
                                type="button"
                                onClick={() => setCommissionPaymentMethod('transfer')}
                                className={`px-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1 cursor-pointer ${
                                  commissionPaymentMethod === 'transfer'
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                Chuyển khoản
                              </button>
                            </div>
                          </div>
                        </div>
                        <p className="text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Sau khi lưu bill, hệ thống sẽ tự động tạo khoản chi <strong>-{formatVND(safeDiscount)}</strong> (Nhóm: Hoa hồng / Chiết khấu đặt bàn) vào Sổ quỹ ngày.
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú hóa đơn
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="VD: Khách quen anh Hùng, lưu ý phục vụ..."
                  className="w-full h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Payment Selector: 4 Clean Segments */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700/80 space-y-2.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                Hình thức thanh toán của Bill:
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentType('cash')}
                  className={`h-9 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    paymentType === 'cash'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Banknote className="w-3.5 h-3.5" />
                  <span>Tiền mặt</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType('transfer')}
                  className={`h-9 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    paymentType === 'transfer'
                      ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Chuyển khoản</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentType('split');
                    if (!splitCashInput && !splitTransferInput && totalAmount > 0) {
                      const halfCash = Math.round(totalAmount / 2);
                      setSplitCashInput(String(halfCash));
                      setSplitTransferInput(String(totalAmount - halfCash));
                    }
                  }}
                  className={`h-9 px-2 sm:px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    paymentType === 'split'
                      ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>TM + CK (Kết hợp)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentType('debt');
                    if (existingDebtors.length > 0 && !debtorName) {
                      setDebtorSelectMode('existing');
                    }
                  }}
                  className={`h-9 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    paymentType === 'debt'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Công nợ</span>
                </button>
              </div>

              {/* Sub-panel: Split Payment (TM + CK) */}
              {paymentType === 'split' && (
                <div className="p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                    <span className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-purple-600"></span>
                      Chia tiền thanh toán (Tổng bill: {formatVND(totalAmount)})
                    </span>
                    <span className="text-[11px] text-purple-700 dark:text-purple-300">
                      VD: Bill 5 triệu → TM 1 triệu, CK 4 triệu
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          1. Tiền mặt khách trả (VNĐ):
                        </label>
                        {totalAmount > 0 && (
                          <div className="flex items-center gap-1">
                            {[1000000, 2000000, Math.round(totalAmount / 2)].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  const c = Math.min(totalAmount, preset);
                                  setSplitCashInput(String(c));
                                  setSplitTransferInput(String(Math.max(0, totalAmount - c)));
                                }}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-mono font-medium hover:bg-emerald-50 cursor-pointer"
                              >
                                {formatVND(preset)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={splitCashInput}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          setSplitCashInput(valStr);
                          if (valStr !== '' && !isNaN(Number(valStr))) {
                            const cashNum = Math.max(0, Number(valStr));
                            const remain = Math.max(0, totalAmount - cashNum);
                            setSplitTransferInput(String(remain));
                          }
                        }}
                        placeholder="Số tiền mặt..."
                        className="w-full h-10 px-3 text-xs font-mono font-bold rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-sky-700 dark:text-sky-400">
                          2. Chuyển khoản khách trả (VNĐ):
                        </label>
                        {totalAmount > 0 && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSplitTransferInput(String(totalAmount));
                                setSplitCashInput('0');
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 font-mono font-medium hover:bg-sky-50 cursor-pointer"
                            >
                              CK hết
                            </button>
                          </div>
                        )}
                      </div>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={splitTransferInput}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          setSplitTransferInput(valStr);
                          if (valStr !== '' && !isNaN(Number(valStr))) {
                            const trNum = Math.max(0, Number(valStr));
                            const remain = Math.max(0, totalAmount - trNum);
                            setSplitCashInput(String(remain));
                          }
                        }}
                        placeholder="Số tiền chuyển khoản..."
                        className="w-full h-10 px-3 text-xs font-mono font-bold rounded-xl border border-sky-300 dark:border-sky-700 bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  {/* Reconciliation live badge */}
                  {(() => {
                    const c = Number(splitCashInput) || 0;
                    const t = Number(splitTransferInput) || 0;
                    const sum = c + t;
                    const diff = totalAmount - sum;
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-1.5 border-t border-purple-200/60 dark:border-purple-900/40">
                        <span className="text-slate-600 dark:text-slate-300">
                          Tổng đã chia: <strong className="font-mono text-purple-700 dark:text-purple-300">{formatVND(sum)}</strong> / {formatVND(totalAmount)}
                        </span>
                        {diff === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Đã khớp 100% với bill
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            {diff > 0 ? `Còn thiếu ${formatVND(diff)}` : `Dư ${formatVND(-diff)}`}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Sub-panel: Debt (Công nợ) */}
              {paymentType === 'debt' && (
                <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                    <span className="font-bold text-amber-900 dark:text-amber-200">
                      Người nợ (Chọn khách quen hoặc nhập mới):
                    </span>
                    <span className="text-[11px] text-amber-700 dark:text-amber-300">
                      Tự động ghi nhận vào sổ theo dõi Công Nợ
                    </span>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="text"
                      list="vqbill-debtors-autocomplete-list"
                      value={debtorName}
                      onChange={(e) => setDebtorName(e.target.value)}
                      placeholder="Chọn hoặc nhập tên người nợ (VD: Anh Hoàng, Chị Lan, Công ty NDS...)"
                      className="w-full h-10 px-3 text-xs font-semibold rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                    <datalist id="vqbill-debtors-autocomplete-list">
                      {existingDebtors.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>

                    {existingDebtors.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                          Khách nợ đã lưu:
                        </span>
                        {existingDebtors.slice(0, 8).map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDebtorName(d)}
                            className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                              debtorName === d
                                ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-amber-200 dark:border-amber-800 hover:border-amber-400'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Item Add Bar */}
          <div className="p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={quickAiItemPrompt}
              onChange={(e) => setQuickAiItemPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleGeminiAddItemsToBill();
                }
              }}
              placeholder="Nhập nhanh món (VD: 2 gà hấp 290k, 10 tiger bạc 24k, gỏi ngó sen)..."
              className="flex-1 h-9 px-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isProcessing || !quickAiItemPrompt.trim()}
                onClick={handleGeminiAddItemsToBill}
                className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Thêm nhanh</span>
              </button>
              <button
                type="button"
                onClick={() => setShowMenuPickerModal(true)}
                className="h-9 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shadow-2xs"
                title="Mở bảng Thực đơn để bấm chọn món nhanh"
              >
                <Utensils className="w-3.5 h-3.5" />
                <span>Chọn từ Menu</span>
              </button>
              <button
                type="button"
                onClick={handleAddEmptyItem}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-600" />
                <span>+ Thêm dòng</span>
              </button>
              {onAddExpenseDeduction && (
                <button
                  type="button"
                  onClick={() => {
                    setQuickDeductionDate(billDate || todayBusinessStr);
                    setShowQuickDeductionModal(true);
                  }}
                  className="h-9 px-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-800 dark:text-amber-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shadow-2xs transition-colors"
                  title="Nhập khoản chi/khoản trừ trong ngày"
                >
                  <MinusCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>+ Khoản trừ</span>
                </button>
              )}
            </div>
          </div>

          {/* Datalist for autocomplete from Menu Catalog */}
          <datalist id="vqbill-menu-products-list">
            {products.map((p) => (
              <option key={p.id} value={p.productName}>
                {p.category} — Giá chuẩn: {formatVND(p.unitPrice)}
              </option>
            ))}
          </datalist>

          {/* Items Table & Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
              <span>Danh sách món trong hóa đơn ({items.length})</span>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllDraftItems}
                  className="text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Xóa hết món</span>
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-500 dark:text-slate-400 space-y-2">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Chưa có món nào trong hóa đơn
                </p>
                <p className="max-w-xs mx-auto">
                  Chụp/tải ảnh bill bên trái, dán văn bản, hoặc bấm <strong>+ Thêm dòng</strong> để bắt đầu soạn bill.
                </p>
                <button
                  type="button"
                  onClick={handleAddEmptyItem}
                  className="mt-2 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-semibold inline-flex items-center gap-1 text-xs cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm món đầu tiên</span>
                </button>
              </div>
            ) : (
              <>
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
                            placeholder="Tên món..."
                            className="flex-1 h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDuplicateItem(idx)}
                              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-emerald-600 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                              title="Nhân bản dòng món này"
                            >
                              <CopyPlus className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="w-9 h-9 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 flex items-center justify-center shrink-0 cursor-pointer"
                              title="Xóa món"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="relative">
                          <MessageSquareText className="w-3.5 h-3.5 text-amber-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={item.note || ''}
                            onChange={(e) =>
                              handleItemChange(idx, 'note', e.target.value)
                            }
                            placeholder="Ghi chú món (làm cay, không đá...)"
                            className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 text-slate-800 dark:text-amber-200 text-[11px]"
                          />
                        </div>

                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-5">
                            <select
                              value={item.category}
                              onChange={(e) =>
                                handleItemChange(idx, 'category', e.target.value)
                              }
                              className="w-full h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                            >
                              {categoryOptions.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Stepper buttons for Mobile */}
                          <div className="col-span-3 flex items-center border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 overflow-hidden h-8">
                            <button
                              type="button"
                              onClick={() => handleAdjustQuantity(idx, -1)}
                              className="w-6 h-full text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer border-r border-slate-200 dark:border-slate-800"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) =>
                                handleItemChange(idx, 'quantity', e.target.value)
                              }
                              className="flex-1 text-center font-mono font-bold text-xs bg-transparent focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleAdjustQuantity(idx, 1)}
                              className="w-6 h-full text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer border-l border-slate-200 dark:border-slate-800"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="col-span-4">
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={item.unitPrice || ''}
                              placeholder="0"
                              onChange={(e) =>
                                handleItemChange(idx, 'unitPrice', e.target.value)
                              }
                              className="w-full h-8 px-2 text-right font-mono font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 dark:border-slate-800 text-xs font-mono">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold">
                            <input
                              type="checkbox"
                              checked={item.isDiscountEligible !== false}
                              onChange={() => handleToggleItemDiscount(idx)}
                              className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                            <span className={item.isDiscountEligible !== false ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}>
                              {item.isDiscountEligible !== false ? 'Áp dụng CK' : 'Không CK'}
                            </span>
                          </label>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            = {formatVND((Number(item.quantity) || 1) * (Number(item.unitPrice) || 0))}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table (>= md) with Stepper */}
                <div className="hidden md:block border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-2xs">
                  <table className="w-full text-left border-collapse min-w-[700px] table-fixed">
                    <colgroup>
                      <col className="w-auto" style={{ minWidth: '240px' }} />
                      <col className="w-24 lg:w-28" />
                      <col className="w-24" />
                      <col className="w-16 lg:w-18" />
                      <col className="w-24 lg:w-28" />
                      <col className="w-24 lg:w-28" />
                      <col className="w-14" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        <th className="py-2.5 px-3">Tên món & Ghi chú (Yêu cầu làm món)</th>
                        <th className="py-2.5 px-2">Danh mục</th>
                        <th className="py-2.5 px-2 text-center" title="Áp dụng chiết khấu % cho món này">Áp dụng CK</th>
                        <th className="py-2.5 px-1 text-center" title="Số lượng món">SL</th>
                        <th className="py-2.5 px-2 text-right">Đơn giá (₫)</th>
                        <th className="py-2.5 px-2.5 text-right">Thành tiền</th>
                        <th className="py-2.5 px-1 text-center">Tác vụ</th>
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
                            className={`transition-colors ${
                              item.isDiscountEligible !== false
                                ? 'bg-emerald-50/20 dark:bg-emerald-950/10 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20'
                                : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                            }`}
                          >
                            <td className="p-2.5 align-top space-y-1.5">
                              <input
                                type="text"
                                list="vqbill-menu-products-list"
                                value={item.productName}
                                onChange={(e) =>
                                  handleItemChange(idx, 'productName', e.target.value)
                                }
                                onBlur={() => handleProductNameBlur(idx)}
                                placeholder="Tên món ăn / đồ uống..."
                                className="w-full h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-emerald-500"
                              />
                              <div className="relative">
                                <MessageSquareText className="w-3.5 h-3.5 text-amber-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                  type="text"
                                  value={item.note || ''}
                                  onChange={(e) =>
                                    handleItemChange(idx, 'note', e.target.value)
                                  }
                                  placeholder="Ghi chú món (làm cay, không đá, combo)..."
                                  className={`w-full h-6.5 pl-7 pr-2 rounded-md border text-[11px] transition-colors ${
                                    item.note
                                      ? 'border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-medium'
                                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900 text-slate-700 dark:text-slate-300 placeholder:text-slate-400'
                                  }`}
                                />
                              </div>
                            </td>

                            <td className="p-2.5 align-top">
                              <select
                                value={item.category}
                                onChange={(e) =>
                                  handleItemChange(idx, 'category', e.target.value)
                                }
                                className="w-full h-8 px-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                              >
                                {categoryOptions.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Discount Eligible Checkbox Button */}
                            <td className="p-2.5 align-top text-center pt-3">
                              <button
                                type="button"
                                onClick={() => handleToggleItemDiscount(idx)}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                                  item.isDiscountEligible !== false
                                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-400 hover:text-slate-600'
                                }`}
                                title={item.isDiscountEligible !== false ? 'Món này được tính chiết khấu' : 'Món này không tính chiết khấu'}
                              >
                                {item.isDiscountEligible !== false ? (
                                  <>
                                    <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Áp dụng</span>
                                  </>
                                ) : (
                                  <>
                                    <Square className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Không</span>
                                  </>
                                )}
                              </button>
                            </td>

                            {/* Stepper Quantity Control - Compact w-16 / w-18 */}
                            <td className="p-2.5 align-top text-center">
                              <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 overflow-hidden h-7.5 w-16 mx-auto shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => handleAdjustQuantity(idx, -1)}
                                  className="w-5 h-full text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer border-r border-slate-200 dark:border-slate-800 transition-colors"
                                  title="Giảm 1"
                                >
                                  <Minus className="w-2.5 h-2.5" />
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  value={item.quantity}
                                  onChange={(e) =>
                                    handleItemChange(idx, 'quantity', e.target.value)
                                  }
                                  className="w-6 text-center font-mono font-bold text-xs bg-transparent focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAdjustQuantity(idx, 1)}
                                  className="w-5 h-full text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer border-l border-slate-200 dark:border-slate-800 transition-colors"
                                  title="Tăng 1"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </td>

                            <td className="p-2.5 align-top">
                              <input
                                type="number"
                                min={0}
                                step={1000}
                                value={item.unitPrice || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  handleItemChange(idx, 'unitPrice', e.target.value)
                                }
                                className="w-full h-8 px-2 text-right font-mono font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                              />
                              {catalogMatch && (
                                <div className="text-[10px] text-right mt-1 font-mono text-slate-400 truncate">
                                  {isCustomBillPrice ? (
                                    <span className="text-amber-600 dark:text-amber-400">
                                      Menu: {formatVND(catalogMatch.unitPrice)}
                                    </span>
                                  ) : (
                                    <span>Chuẩn menu</span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="p-2.5 align-top w-28 text-right font-mono font-bold text-slate-900 dark:text-white pt-3.5">
                              {formatVND((Number(item.quantity) || 1) * (Number(item.unitPrice) || 0))}
                            </td>

                            <td className="p-2.5 align-top w-14 text-center pt-2.5">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateItem(idx)}
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors cursor-pointer"
                                  title="Nhân bản dòng món này"
                                >
                                  <CopyPlus className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(idx)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                  title="Xóa món"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Sticky Summary & Bottom Action Bar */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-3 gap-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 text-xs font-mono">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block font-sans text-[11px]">
                  Tạm tính ({items.reduce((s, it) => s + (Number(it.quantity) || 1), 0)} phần)
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {formatVND(subtotalAmount)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block font-sans text-[11px]">
                  Chiết khấu
                </span>
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  {safeDiscount > 0 ? `-${formatVND(safeDiscount)}` : '0 ₫'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 dark:text-slate-400 block font-sans text-[11px]">
                  Tổng thanh toán
                </span>
                <span className="font-bold text-sm sm:text-base text-emerald-600 dark:text-emerald-400">
                  {formatVND(totalAmount)}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Ca ngày: <strong className="font-mono text-slate-800 dark:text-slate-200">{billDate}</strong> · Bàn:{' '}
                <strong className="text-slate-800 dark:text-slate-200">{tableName || 'Chưa chọn'}</strong> · Hình thức:{' '}
                <strong className="text-slate-800 dark:text-slate-200">{PAYMENT_LABELS[paymentType]}</strong>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {onAddExpenseDeduction && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickDeductionDate(billDate || todayBusinessStr);
                      setShowQuickDeductionModal(true);
                    }}
                    className="h-11 px-3.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-900 dark:text-amber-200 font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors shrink-0"
                    title="Nhập khoản chi/khoản trừ trong ngày"
                  >
                    <MinusCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>+ Khoản Trừ Ngày</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSaving || !canWrite}
                  onClick={handleSaveBill}
                  className="h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <Save className="w-4 h-4 shrink-0" />
                  <span>{isSaving ? 'Đang lưu vào hệ thống...' : 'Lưu Bill & Cập Nhật Doanh Thu'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Receipt Inspector Modal */}
      {isReceiptFullscreen && imagePreview && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-between p-4"
          onClick={() => setIsReceiptFullscreen(false)}
        >
          {/* Top Modal Controls */}
          <div
            className="w-full max-w-4xl flex items-center justify-between p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-white shadow-2xl shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold">Soi Hóa Đơn Toàn Màn Hình</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setImageZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center cursor-pointer text-xs"
                title="Thu nhỏ"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono text-xs font-bold w-12 text-center text-emerald-400">
                {Math.round(imageZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setImageZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center cursor-pointer text-xs"
                title="Phóng to"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setImageRotation((r) => (r + 90) % 360)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center cursor-pointer text-xs"
                title="Xoay 90 độ"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setImageZoom(1);
                  setImageRotation(0);
                }}
                className="px-2.5 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold cursor-pointer"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setIsReceiptFullscreen(false)}
                className="w-8 h-8 rounded-lg bg-rose-600 hover:bg-rose-700 flex items-center justify-center cursor-pointer ml-2"
                title="Đóng xem toàn màn hình"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Large Canvas */}
          <div
            className="flex-1 w-full max-w-5xl flex items-center justify-center overflow-auto p-4 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="transition-transform duration-150 origin-center"
              style={{
                transform: `scale(${imageZoom}) rotate(${imageRotation}deg)`,
              }}
            >
              <img
                src={imagePreview}
                alt="Ảnh hóa đơn toàn màn hình"
                referrerPolicy="no-referrer"
                className="max-h-[82vh] max-w-full object-contain rounded-xl shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* Save Bill Success Popup Modal */}
      {savedBillPopup && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSavedBillPopup(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 sm:p-6 text-center space-y-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Lưu Hóa Đơn Thành Công!
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Hóa đơn đã được lưu lên hệ thống và toàn bộ thông tin phần nhập bill đã được làm mới để nhập bill tiếp theo.
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Mã hóa đơn:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {savedBillPopup.billCode}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Ca ngày:</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {savedBillPopup.billDate}
                    {savedBillPopup.checkInTime || savedBillPopup.checkOutTime
                      ? ` (${savedBillPopup.checkInTime || '--:--'} → ${
                          savedBillPopup.checkOutTime || '--:--'
                        })`
                      : ''}
                  </span>
                </div>
                {savedBillPopup.note && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400 shrink-0">
                      Phòng / Bàn & Ghi chú:
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-right truncate">
                      {savedBillPopup.note}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Hình thức:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {PAYMENT_LABELS[savedBillPopup.paymentType]}
                    {savedBillPopup.debtorName ? ` (${savedBillPopup.debtorName})` : ''}
                  </span>
                </div>
                {savedBillPopup.paymentType === 'split' && (
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Tách tiền:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      TM: {formatVND(savedBillPopup.paidCashAmount || 0)} · CK: {formatVND(savedBillPopup.paidTransferAmount || 0)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Số lượng món:</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {savedBillPopup.itemCount} món ({savedBillPopup.totalQuantity} phần/lon)
                  </span>
                </div>
                {savedBillPopup.discountAmount > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Chiết khấu bill:</span>
                      <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                        -{formatVND(savedBillPopup.discountAmount)}
                      </span>
                    </div>
                    {savedBillPopup.commissionPaid ? (
                      <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300 font-medium flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                        <span>Đã tự động ghi chi hoa hồng -{formatVND(savedBillPopup.discountAmount)} cho người đặt bàn vào Sổ quỹ ngày!</span>
                      </div>
                    ) : onQuickPayCommission ? (
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            const found = existingBills.find((b) => b.billCode === savedBillPopup.billCode) || {
                              id: '',
                              billCode: savedBillPopup.billCode,
                              billDate: savedBillPopup.billDate,
                              discountAmount: savedBillPopup.discountAmount,
                              totalAmount: savedBillPopup.totalAmount,
                              tableName: savedBillPopup.tableName,
                              note: savedBillPopup.note || '',
                            } as any;
                            setSavedBillPopup(null);
                            if (isModal && onCloseModal) onCloseModal();
                            onQuickPayCommission(found);
                          }}
                          className="w-full py-1.5 px-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-[11px] font-bold text-amber-800 dark:text-amber-200 inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <MinusCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>Chi hoa hồng đặt bàn ngay (-{formatVND(savedBillPopup.discountAmount)})</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Tổng tiền hóa đơn:
                  </span>
                  <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatVND(savedBillPopup.totalAmount)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isModal && onCloseModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setSavedBillPopup(null);
                      onCloseModal();
                    }}
                    className="flex-1 h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Đóng cửa sổ
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSavedBillPopup(null)}
                  className="flex-1 h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isModal ? 'Nhập Bill Tiếp' : 'Đóng & Nhập Bill Tiếp'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL: NHẬP KHOẢN TRỪ TRONG NGÀY (REQ 4) */}
      {showQuickDeductionModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => setShowQuickDeductionModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                  <MinusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Nhập Khoản Trừ Trong Ngày
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Thêm trực tiếp vào khoản chi ngày mà không cần chuyển sang tab Khoản trừ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickDeductionModal(false)}
                className="p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveQuickDeduction} noValidate className="p-5 space-y-4">
              {/* Date & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Ngày trừ / chi tiêu:
                  </label>
                  <input
                    type="date"
                    required
                    value={quickDeductionDate}
                    onChange={(e) => setQuickDeductionDate(e.target.value)}
                    className="w-full h-9 px-3 text-xs font-mono font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nhóm khoản trừ:
                  </label>
                  <select
                    value={quickCategory}
                    onChange={(e) => setQuickCategory(e.target.value)}
                    className="w-full h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium cursor-pointer"
                  >
                    {availableDeductionCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Expense Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tên khoản trừ / khoản chi (*):
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Mua bánh mì, Rau sống, Đá bi, Tiền gia vị..."
                  value={quickExpenseTitle}
                  onChange={(e) => setQuickExpenseTitle(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                />

                {/* Quick Chips */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-slate-400">Gợi ý nhanh:</span>
                  {[
                    'Mua bánh mì',
                    'Mua rau củ',
                    'Tiền đá lạnh',
                    'Gia vị / Hành tỏi',
                    'Gas phụ / Nhiên liệu',
                    'Vật tư quán',
                    'Hoàn trả món thừa',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setQuickExpenseTitle(chip)}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-medium border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 text-slate-600 dark:text-slate-300 hover:text-amber-800 dark:hover:text-amber-300 cursor-pointer transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity, Unit Price, Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Số lượng:
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={quickQuantity}
                    onChange={(e) => {
                      const q = Number(e.target.value) || 1;
                      setQuickQuantity(q);
                      if (quickUnitPrice > 0) setQuickAmount(q * quickUnitPrice);
                    }}
                    className="w-full h-9 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Đơn giá (VNĐ):
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={quickUnitPrice || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const p = Number(e.target.value) || 0;
                      setQuickUnitPrice(p);
                      setQuickAmount(p * (quickQuantity || 1));
                    }}
                    className="w-full h-9 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                    Tổng tiền trừ (*):
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="any"
                    value={quickAmount || ''}
                    placeholder="0"
                    onChange={(e) => setQuickAmount(Number(e.target.value) || 0)}
                    className="w-full h-9 px-3 text-xs font-mono font-bold rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
                  />
                </div>
              </div>

              {quickAmount > 0 && (
                <div className="text-right text-xs font-bold text-amber-600 dark:text-amber-400 font-mono">
                  Trừ: -{formatVND(quickAmount)}
                </div>
              )}

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú chi tiết (nếu có):
                </label>
                <input
                  type="text"
                  placeholder="Ghi chú người mua, ca trực hoặc lý do..."
                  value={quickNote}
                  onChange={(e) => setQuickNote(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              {/* Checkbox keep open */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={quickKeepOpen}
                    onChange={(e) => setQuickKeepOpen(e.target.checked)}
                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                  />
                  <span>Tiếp tục nhập khoản khác sau khi lưu</span>
                </label>
              </div>

              {/* Footer Buttons */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowQuickDeductionModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={isSavingDeduction || quickAmount <= 0 || !quickExpenseTitle.trim()}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <MinusCircle className="w-4 h-4" />
                  <span>{isSavingDeduction ? 'Đang lưu...' : 'Lưu Khoản Trừ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Menu Catalog Quick Picker Modal (Chọn Món Nhanh từ Menu) */}
      {showMenuPickerModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
          onClick={() => setShowMenuPickerModal(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Utensils className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Thực Đơn Quán</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">
                      {products.length} món
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Chạm hoặc click vào món để thêm ngay vào hóa đơn (tự động cộng dồn số lượng)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMenuPickerModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search & Category Filter Toolbar */}
            <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 space-y-2.5 bg-white dark:bg-slate-900 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={menuPickerSearch}
                  onChange={(e) => setMenuPickerSearch(e.target.value)}
                  placeholder="Tìm theo tên món (VD: lẩu, bia, gà, bò, nước suối...)"
                  className="w-full h-10 pl-9 pr-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                <button
                  type="button"
                  onClick={() => setMenuPickerCategory('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    menuPickerCategory === 'all'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Tất cả ({products.length})
                </button>
                {categories.map((cat) => {
                  const count = products.filter((p) => p.category === cat).length;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setMenuPickerCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                        menuPickerCategory === cat
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {cat} {count > 0 ? `(${count})` : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Menu Products Grid */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 divide-y divide-slate-100 dark:divide-slate-800/60">
              {(() => {
                const searchLower = menuPickerSearch.trim().toLowerCase();
                const filtered = products.filter((p) => {
                  if (menuPickerCategory !== 'all' && p.category !== menuPickerCategory) return false;
                  if (searchLower && !p.productName.toLowerCase().includes(searchLower)) return false;
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                      <p className="font-semibold text-slate-600 dark:text-slate-300">
                        Không tìm thấy món nào phù hợp
                      </p>
                      <p>Thử tìm với từ khóa khác hoặc chuyển sang danh mục Tất cả.</p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {filtered.map((prod) => {
                      const inBill = items.find(
                        (it) => it.productName.toLowerCase().trim() === prod.productName.toLowerCase().trim()
                      );
                      const inBillQty = inBill ? Number(inBill.quantity) || 1 : 0;

                      return (
                        <div
                          key={prod.id}
                          onClick={() => handleAddProductFromCatalog(prod)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between gap-3 ${
                            inBillQty > 0
                              ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 hover:border-emerald-500 shadow-2xs'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-bold text-slate-900 dark:text-white truncate">
                              {prod.productName}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-medium">
                                {prod.category}
                              </span>
                              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                {formatVND(prod.unitPrice)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {inBillQty > 0 && (
                              <span className="px-2 py-0.5 rounded-full font-mono text-[11px] font-bold bg-emerald-600 text-white">
                                x{inBillQty}
                              </span>
                            )}
                            <button
                              type="button"
                              className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-xs cursor-pointer"
                              title="Thêm vào bill"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Modal Bottom Sticky Summary */}
            <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs">
                <span className="text-slate-500">Hóa đơn đang có: </span>
                <strong className="text-slate-900 dark:text-white">{items.length} món</strong>
                <span className="mx-1 text-slate-300">·</span>
                <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                  {formatVND(totalAmount)}
                </strong>
              </div>
              <button
                type="button"
                onClick={() => setShowMenuPickerModal(false)}
                className="h-9 px-4 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold cursor-pointer hover:opacity-90"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
