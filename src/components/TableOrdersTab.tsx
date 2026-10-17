import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  UtensilsCrossed,
  Printer,
  Bell,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Clock,
  User,
  ArrowRight,
  Layers,
  FileText,
  RotateCcw,
  Sparkles,
  Send,
  SlidersHorizontal,
  ChevronDown,
  X,
  MessageSquare,
  Receipt,
  AlertCircle,
  Copy,
  Check,
  XCircle,
  Ban,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import {
  ProductRecord,
  StaffAccount,
  EmployeeRecord,
  TableOrderRecord,
  OrderItem,
  WorkspaceInventoryData,
} from '../types';
import { formatVND } from '../utils/parser';
import { playOrderBellSound, playChimeSound } from '../utils/soundEffects';

export interface TableOrdersTabProps {
  products: ProductRecord[];
  currentStaffAccount: StaffAccount | null;
  employees?: EmployeeRecord[];
  tableOrders?: TableOrderRecord[];
  onSaveOrders: (orders: TableOrderRecord[]) => Promise<void> | void;
  onConvertToBill?: (orderData: {
    tableName: string;
    items: { productName: string; quantity: number; price: number; category: string; note?: string }[];
    totalAmount: number;
    staffName: string;
  }) => void;
  initialSelectedTable?: string;
}

const PRESET_TABLES = [
  // Sân Trước / Quầy Bar
  'Bàn 01', 'Bàn 02', 'Bàn 03', 'Bàn 04', 'Bàn 05', 'Bàn 06',
  // Sảnh Trong Nhà
  'Bàn 10', 'Bàn 11', 'Bàn 12', 'Bàn 14', 'Bàn 15', 'Bàn 16',
  'Bàn 18', 'Bàn 20', 'Bàn 21', 'Bàn 22', 'Bàn 25', 'Bàn 26',
  'Bàn 28', 'Bàn 30', 'Bàn 32', 'Bàn 35',
  // Sân Vườn
  'Bàn V1', 'Bàn V2', 'Bàn V3', 'Bàn V4', 'Bàn V5', 'Bàn V6', 'Bàn V7', 'Bàn V8',
  // Phòng VIP
  'VIP 1', 'VIP 2', 'VIP 3', 'VIP 5',
];

const QUICK_DISH_NOTES = [
  'Ít cay',
  'Không cay',
  'Không hành',
  'Ướp đá lạnh',
  'Mang ra sau',
  'Làm nóng lại',
  'Gắp dĩa riêng',
  'Chấm muối ớt xanh',
];

export function generateThermalReceiptHtml(
  order: TableOrderRecord,
  paperSize: '80mm' | '58mm' = '80mm',
  headerText: string = 'VỊNH QUÁN F&B'
): string {
  const isCancelled = order.status === 'cancelled';
  const widthMm = paperSize === '58mm' ? '54mm' : '76mm';
  const totalQty = order.items.reduce((s, it) => s + it.quantity, 0);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Phiếu In ${order.orderCode} - Bàn ${order.tableName}</title>
  <style>
    @page {
      size: ${paperSize === '58mm' ? '58mm' : '80mm'} auto;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: 'Courier New', Courier, monospace, 'Consolas', monospace;
    }
    body {
      width: ${widthMm};
      margin: 0 auto;
      padding: 4mm 2mm;
      font-size: 12px;
      line-height: 1.35;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: bold; }
    .header-title { font-size: 15px; font-weight: 900; text-transform: uppercase; margin-bottom: 2px; }
    .header-sub { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
    .cancelled-banner {
      border: 2px solid #000;
      padding: 4px;
      margin: 5px 0;
      font-size: 13px;
      font-weight: 900;
      text-align: center;
      background: #f0f0f0;
      text-transform: uppercase;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .double-divider {
      border-top: 2px dashed #000;
      margin: 6px 0;
    }
    .table-badge {
      font-size: 16px;
      font-weight: 900;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .meta-line {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0;
    }
    th {
      border-bottom: 1px dashed #000;
      padding: 3px 0;
      font-size: 11px;
      text-align: left;
    }
    td {
      padding: 4px 0;
      vertical-align: top;
      font-size: 12px;
    }
    .col-qty {
      width: 32px;
      font-weight: 900;
      font-size: 13px;
    }
    .col-name {
      font-weight: 700;
    }
    .dish-note {
      font-size: 10px;
      font-style: italic;
      padding-left: 4px;
      margin-top: 1px;
    }
    .total-box {
      font-size: 12px;
      font-weight: 900;
      display: flex;
      justify-content: space-between;
      margin-top: 4px;
    }
    .note-box {
      font-size: 11px;
      font-style: italic;
      margin-top: 4px;
      padding: 3px;
      border: 1px dashed #000;
    }
    .footer {
      text-align: center;
      font-size: 10px;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="text-center">
    <div class="header-title">${headerText}</div>
    <div class="header-sub">*** ${isCancelled ? 'PHIẾU BÁO HỦY MÓN / VOID TICKET' : 'PHIẾU BÁO BẾP / BAR'} ***</div>
  </div>

  ${isCancelled ? '<div class="cancelled-banner">⚠️ ĐÃ HỦY PHIẾU GỌI MÓN NÀY ⚠️</div>' : ''}

  <div class="double-divider"></div>
  <div class="table-badge">BÀN: ${order.tableName.toUpperCase()}</div>
  <div class="meta-line">
    <span>NV: ${order.staffName}</span>
    <span>Mã: ${order.orderCode}</span>
  </div>
  <div class="meta-line">
    <span>Giờ: ${order.orderTime}</span>
    <span>Ngày: ${order.orderDate}</span>
  </div>
  <div class="divider"></div>

  <table>
    <thead>
      <tr>
        <th class="col-qty">SL</th>
        <th class="col-name">TÊN MÓN GỌI</th>
      </tr>
    </thead>
    <tbody>
      ${order.items
        .map(
          (it) => `
        <tr>
          <td class="col-qty">${it.quantity}</td>
          <td class="col-name">
            <div>${it.productName}</div>
            ${it.note ? `<div class="dish-note">→ Ghi chú: ${it.note}</div>` : ''}
          </td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <div class="double-divider"></div>
  <div class="total-box">
    <span>TỔNG SỐ LƯỢNG MÓN:</span>
    <span>${totalQty} món</span>
  </div>

  ${
    order.note
      ? `<div class="note-box">Ghi chú: ${order.note}</div>`
      : ''
  }

  <div class="divider"></div>
  <div class="footer">
    ${isCancelled ? '-- ĐƠN NÀY ĐÃ BỊ HỦY --' : '-- VQBill POS Thermal Print --'}
  </div>
</body>
</html>`;
}

export const TableOrdersTab: React.FC<TableOrdersTabProps> = ({
  products,
  currentStaffAccount,
  employees = [],
  tableOrders = [],
  onSaveOrders,
  onConvertToBill,
  initialSelectedTable = '',
}) => {
  // Navigation inside Orders Tab
  type SubTabId = 'new_order' | 'active_orders' | 'settings';
  const [subTab, setSubTab] = useState<SubTabId>('new_order');

  // Form State for Current Order Pad
  const [selectedTable, setSelectedTable] = useState<string>(initialSelectedTable || 'Bàn 10');
  const [customTableInput, setCustomTableInput] = useState<string>('');
  const [selectedStaff, setSelectedStaff] = useState<string>(
    currentStaffAccount?.displayName || currentStaffAccount?.username || 'Nhân viên phục vụ'
  );
  const [generalOrderNote, setGeneralOrderNote] = useState<string>('');

  // Cart of Items currently being ordered
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Printing & Preview State
  const [previewOrder, setPreviewOrder] = useState<TableOrderRecord | null>(null);
  const [printerPaperSize, setPrinterPaperSize] = useState<'80mm' | '58mm'>(() => {
    return (localStorage.getItem('vq_printer_paper_size') as '80mm' | '58mm') || '80mm';
  });
  const [restaurantHeader, setRestaurantHeader] = useState<string>(() => {
    return localStorage.getItem('vq_printer_header') || 'VỊNH QUÁN F&B';
  });
  const [autoPrintOnSubmit, setAutoPrintOnSubmit] = useState<boolean>(() => {
    const saved = localStorage.getItem('vq_auto_print_order');
    return saved !== null ? saved === 'true' : true;
  });

  const [copiedTelegram, setCopiedTelegram] = useState<boolean>(false);

  // Active Orders Filtering State
  type OrderFilterType = 'all' | 'pending' | 'cooking' | 'served' | 'billed' | 'cancelled';
  const [activeOrdersFilter, setActiveOrdersFilter] = useState<OrderFilterType>('all');

  const filteredActiveOrders = useMemo(() => {
    if (activeOrdersFilter === 'all') return tableOrders;
    return tableOrders.filter((o) => o.status === activeOrdersFilter);
  }, [tableOrders, activeOrdersFilter]);

  const orderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: tableOrders.length,
      pending: 0,
      cooking: 0,
      served: 0,
      billed: 0,
      cancelled: 0,
    };
    tableOrders.forEach((o) => {
      if (counts[o.status] !== undefined) {
        counts[o.status]++;
      }
    });
    return counts;
  }, [tableOrders]);

  // Categories extracted from products
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  // Filtered menu products
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (!query) return true;
      return (
        p.productName.toLowerCase().includes(query) ||
        (p.category && p.category.toLowerCase().includes(query))
      );
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart Calculations
  const cartTotalAmount = useMemo(() => {
    return cartItems.reduce((acc, it) => acc + (it.unitPrice || 0) * it.quantity, 0);
  }, [cartItems]);

  const cartTotalQty = useMemo(() => {
    return cartItems.reduce((acc, it) => acc + it.quantity, 0);
  }, [cartItems]);

  // Add item to cart
  const handleAddToCart = (product: ProductRecord) => {
    setCartItems((prev) => {
      const existing = prev.find((it) => it.productName.toLowerCase() === product.productName.toLowerCase());
      if (existing) {
        return prev.map((it) =>
          it.id === existing.id ? { ...it, quantity: it.quantity + 1 } : it
        );
      }
      const newItem: OrderItem = {
        id: `orditem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        productId: product.id,
        productName: product.productName,
        category: product.category || 'Món ăn',
        unitPrice: product.unitPrice || 0,
        quantity: 1,
        note: '',
      };
      return [...prev, newItem];
    });
  };

  // Adjust item quantity
  const handleUpdateItemQty = (itemId: string, delta: number) => {
    setCartItems((prev) => {
      return prev
        .map((it) => {
          if (it.id === itemId) {
            const nextQty = it.quantity + delta;
            return nextQty > 0 ? { ...it, quantity: nextQty } : null;
          }
          return it;
        })
        .filter((it): it is OrderItem => it !== null);
    });
  };

  // Set item custom note
  const handleUpdateItemNote = (itemId: string, noteText: string) => {
    setCartItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, note: noteText } : it))
    );
  };

  // Quick append note tag
  const handleAppendNoteTag = (itemId: string, tag: string) => {
    setCartItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const current = (it.note || '').trim();
        if (current.includes(tag)) return it;
        const next = current ? `${current}, ${tag}` : tag;
        return { ...it, note: next };
      })
    );
  };

  // Remove single item
  const handleRemoveItem = (itemId: string) => {
    setCartItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  // Clear cart
  const handleClearCart = () => {
    setCartItems([]);
    setGeneralOrderNote('');
  };

  // Final Table Name
  const effectiveTableName = (customTableInput.trim() || selectedTable || 'Bàn lẻ').trim();

  // Print & Receipt States
  const [activePrintReceipt, setActivePrintReceipt] = useState<TableOrderRecord | null>(null);
  const [printToast, setPrintToast] = useState<string | null>(null);
  const [autoPrintVoidTicket, setAutoPrintVoidTicket] = useState<boolean>(true);

  // Print execution helper using isolated hidden iframe + media print for 100% reliable thermal POS printing
  const executeBrowserPrint = (targetOrder?: TableOrderRecord | unknown) => {
    // Guard against React SyntheticEvent or non-order argument passed from onClick
    const orderToPrint: TableOrderRecord | null =
      targetOrder && typeof targetOrder === 'object' && 'items' in targetOrder && Array.isArray((targetOrder as TableOrderRecord).items)
        ? (targetOrder as TableOrderRecord)
        : previewOrder;

    if (!orderToPrint) {
      setPrintToast('⚠️ Chưa chọn phiếu cần in!');
      setTimeout(() => setPrintToast(null), 3000);
      return;
    }

    // Set active print receipt to guarantee immediate DOM rendering in #thermal-print-area
    setActivePrintReceipt(orderToPrint);
    setPrintToast(
      orderToPrint.status === 'cancelled'
        ? '🖨️ Đang mở lệnh in PHIẾU BÁO HỦY BẾP (Void Ticket)...'
        : '🖨️ Đang gửi lệnh in tới máy in nhiệt (K80 / K58)...'
    );
    setTimeout(() => setPrintToast(null), 4500);

    const html = generateThermalReceiptHtml(orderToPrint, printerPaperSize, restaurantHeader);

    try {
      let iframe = document.getElementById('vq-thermal-print-iframe') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'vq-thermal-print-iframe';
        // Give it non-zero dimensions off-screen so browser layout engines can paginate and print properly
        iframe.style.position = 'fixed';
        iframe.style.right = '-9999px';
        iframe.style.bottom = '-9999px';
        iframe.style.width = '350px';
        iframe.style.height = '500px';
        iframe.style.border = '0';
        iframe.style.opacity = '0.01';
        iframe.style.pointerEvents = 'none';
        iframe.setAttribute('title', 'Thermal Print Frame');
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.warn('Iframe print failed, falling back to window.print', err);
            window.print();
          }
        }, 250);
        return;
      }
    } catch (err) {
      console.warn('Error in iframe thermal print', err);
    }

    // Direct fallback via window.print()
    setTimeout(() => {
      window.print();
    }, 120);
  };

  // Open Direct Print in New Tab (Fallback)
  const handleOpenPrintTab = (orderToPrint?: TableOrderRecord | unknown) => {
    const order =
      orderToPrint && typeof orderToPrint === 'object' && 'items' in orderToPrint
        ? (orderToPrint as TableOrderRecord)
        : previewOrder;
    if (!order) return;
    const html = generateThermalReceiptHtml(order, printerPaperSize, restaurantHeader);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const win = window.open(url, '_blank');
      if (win) {
        win.focus();
      } else {
        executeBrowserPrint(order);
      }
    } catch {
      executeBrowserPrint(order);
    }
  };

  // Copy Plain Text for Thermal Printer / Bluetooth App / Zalo
  const handleCopyPlainTextForThermal = (order: TableOrderRecord) => {
    const isCancelled = order.status === 'cancelled';
    const totalQty = order.items.reduce((s, it) => s + it.quantity, 0);
    const divider = '--------------------------------';
    const doubleDivider = '================================';

    const lines = [
      restaurantHeader.toUpperCase(),
      isCancelled ? '*** PHIẾU BÁO HỦY MÓN (VOID TICKET) ***' : '*** PHIẾU BÁO BẾP / BAR ***',
      isCancelled ? '⚠️ ĐÃ HỦY PHIẾU NÀY - BẾP KHÔNG LÀM ⚠️' : '',
      doubleDivider,
      `BÀN: ${order.tableName.toUpperCase()}`,
      `NV: ${order.staffName}    Mã: #${order.orderCode}`,
      `Giờ: ${order.orderTime}    Ngày: ${order.orderDate}`,
      divider,
      `SL   TÊN MÓN GỌI`,
      divider,
      ...order.items.map((it) => {
        let text = `${String(it.quantity).padEnd(4, ' ')} ${it.productName}`;
        if (it.note) text += `\n     -> [${it.note}]`;
        return text;
      }),
      divider,
      `Tổng: ${totalQty} món gọi · ${formatVND(order.totalAmount)}`,
      order.note ? `Ghi chú: ${order.note}` : '',
      divider,
      isCancelled ? '*** ĐÃ HỦY ***' : '*** VỊNH QUÁN F&B ***',
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedTelegram(true);
    setTimeout(() => setCopiedTelegram(false), 2000);
    setPrintToast('📋 Đã sao chép nội dung phiếu in! Bạn có thể dán vào Zalo hoặc App máy in Bluetooth.');
    setTimeout(() => setPrintToast(null), 4000);
  };

  // Keyboard shortcut Ctrl + P when print preview modal is open
  useEffect(() => {
    if (!previewOrder) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        executeBrowserPrint(previewOrder);
      } else if (e.key === 'Escape') {
        setPreviewOrder(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewOrder]);

  // Cancel Order State & Handlers
  const [cancellingOrder, setCancellingOrder] = useState<TableOrderRecord | null>(null);
  const [cancelReasonPreset, setCancelReasonPreset] = useState<string>('Khách đổi ý / Đổi món khác');
  const [cancelReasonCustom, setCancelReasonCustom] = useState<string>('');
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);

  const handleOpenCancelDialog = (order: TableOrderRecord) => {
    setCancellingOrder(order);
    setCancelReasonPreset('Khách đổi ý / Đổi món khác');
    setCancelReasonCustom('');
    setShowCancelModal(true);
  };

  const handleConfirmCancelOrder = async () => {
    if (!cancellingOrder) return;
    const finalReason = (cancelReasonCustom.trim() || cancelReasonPreset).trim();
    const reasonNote = `[HỦY PHIẾU]: ${finalReason}`;

    const cancelledOrder: TableOrderRecord = {
      ...cancellingOrder,
      status: 'cancelled',
      note: cancellingOrder.note ? `${cancellingOrder.note} · ${reasonNote}` : reasonNote,
      updatedAtMs: Date.now(),
    };

    const nextOrders = tableOrders.map((o) =>
      o.id === cancellingOrder.id ? cancelledOrder : o
    );

    await onSaveOrders(nextOrders);
    playChimeSound();

    // Auto print Void Ticket if enabled
    if (autoPrintVoidTicket) {
      setTimeout(() => {
        executeBrowserPrint(cancelledOrder);
      }, 250);
    }

    if (previewOrder?.id === cancellingOrder.id) {
      setPreviewOrder(cancelledOrder);
    }

    setShowCancelModal(false);
    setCancellingOrder(null);
    setPrintToast(`🚫 Đã hủy phiếu #${cancelledOrder.orderCode} (Bàn ${cancelledOrder.tableName})!`);
    setTimeout(() => setPrintToast(null), 4000);
  };

  // Restore a cancelled order
  const handleRestoreCancelledOrder = async (orderId: string) => {
    const nextOrders = tableOrders.map((o) =>
      o.id === orderId
        ? {
            ...o,
            status: 'pending' as const,
            updatedAtMs: Date.now(),
          }
        : o
    );
    await onSaveOrders(nextOrders);
    playChimeSound();
    if (previewOrder?.id === orderId) {
      setPreviewOrder((prev) => (prev ? { ...prev, status: 'pending' } : null));
    }
  };

  // Permanently delete order
  const handleDeleteOrderPermanent = async (orderId: string) => {
    const nextOrders = tableOrders.filter((o) => o.id !== orderId);
    await onSaveOrders(nextOrders);
    playChimeSound();
    if (previewOrder?.id === orderId) {
      setPreviewOrder(null);
    }
  };

  // Trigger Save Order & Notify Kitchen
  const handleSubmitOrderToKitchen = async () => {
    if (cartItems.length === 0) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const dateStr = now.toISOString().slice(0, 10);
    const orderNum = tableOrders.length + 1;
    const orderCode = `ORD-${now.getFullYear().toString().slice(2)}${(now.getMonth() + 1)
      .toString()
      .padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${orderNum.toString().padStart(3, '0')}`;

    const newOrder: TableOrderRecord = {
      id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      orderCode,
      tableName: effectiveTableName,
      staffName: selectedStaff,
      staffId: currentStaffAccount?.id,
      items: [...cartItems],
      totalAmount: cartTotalAmount,
      status: 'pending',
      orderTime: timeStr,
      orderDate: dateStr,
      note: generalOrderNote.trim() || undefined,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };

    // 1. Play sound
    playOrderBellSound();

    // 2. Save to orders list
    const updatedOrders = [newOrder, ...tableOrders];
    await onSaveOrders(updatedOrders);

    // 3. Set preview and open print window if auto-print enabled
    setPreviewOrder(newOrder);
    setCartItems([]);
    setGeneralOrderNote('');

    if (autoPrintOnSubmit) {
      setTimeout(() => {
        executeBrowserPrint(newOrder);
      }, 350);
    }
  };

  // Update order status in kitchen list
  const handleUpdateOrderStatus = async (
    orderId: string,
    status: TableOrderRecord['status']
  ) => {
    const nextOrders = tableOrders.map((o) =>
      o.id === orderId ? { ...o, status, updatedAtMs: Date.now() } : o
    );
    await onSaveOrders(nextOrders);
    playChimeSound();
  };

  // Convert table order(s) directly to Bill for payment
  const handleTriggerConvertToBill = (order: TableOrderRecord) => {
    if (!onConvertToBill) return;
    onConvertToBill({
      tableName: order.tableName,
      items: order.items.map((it) => ({
        productName: it.productName,
        quantity: it.quantity,
        price: it.unitPrice,
        category: it.category,
        note: it.note,
      })),
      totalAmount: order.totalAmount,
      staffName: order.staffName,
    });
  };

  // Copy Telegram notification text
  const handleCopyTelegramTicket = (order: TableOrderRecord) => {
    const lines = [
      `🔔 *PHIẾU ORDER BÁO BẾP / BAR*`,
      `📍 *${order.tableName.toUpperCase()}*`,
      `👤 NV: ${order.staffName}`,
      `⏰ Giờ: ${order.orderTime} (${order.orderDate})`,
      `🏷️ Mã: ${order.orderCode}`,
      `------------------------`,
      ...order.items.map(
        (it) => `• *${it.quantity}x* ${it.productName}${it.note ? ` _(${it.note})_` : ''}`
      ),
      `------------------------`,
      `📊 Tổng: ${order.items.reduce((s, x) => s + x.quantity, 0)} món · ${formatVND(order.totalAmount)}`,
      order.note ? `💬 Ghi chú: ${order.note}` : '',
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedTelegram(true);
    setTimeout(() => setCopiedTelegram(false), 2000);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Header Card */}
      <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center text-xl shadow-xs">
            📝
          </span>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>Order Món Theo Bàn (Báo Bếp & Bar)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                POS Touch
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ghi order món, in phiếu nhiệt K80/K57 báo bếp ngay tại bàn, phát chuông thông báo và chuyển thẳng sang bill
            </p>
          </div>
        </div>

        {/* Subtab Switches */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setSubTab('new_order')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'new_order'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <span>📝</span>
            <span>Gọi món mới</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('active_orders')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'active_orders'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <span>📋</span>
            <span>Phiếu Báo Bếp</span>
            {tableOrders.filter((o) => o.status === 'pending').length > 0 && (
              <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {tableOrders.filter((o) => o.status === 'pending').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('settings')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              subTab === 'settings'
                ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
            title="Cài đặt máy in phiếu nhiệt K80/K57"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Máy in</span>
          </button>
        </div>
      </div>

      {/* Realtime Toast Feedback for Printing & Order Cancellation */}
      {printToast && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white text-xs sm:text-sm font-bold flex items-center justify-between shadow-xl animate-in fade-in slide-in-from-top-2 border border-slate-700/80">
          <div className="flex items-center gap-2.5">
            <span>{printToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setPrintToast(null)}
            className="text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 cursor-pointer"
          >
            ✕ Đóng
          </button>
        </div>
      )}
      {/* 1. MÀN HÌNH GỌI MÓN MỚI (NEW ORDER PAD) */}
      {/* ===================================================================== */}
      {subTab === 'new_order' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
          {/* Left Column: Menu Catalog (7 cols on lg, 8 on xl) */}
          <div className="lg:col-span-7 xl:col-span-7 space-y-3.5">
            {/* Table & Staff Selection Bar */}
            <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Select Table */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Bàn Gọi Món:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedTable}
                      onChange={(e) => {
                        setSelectedTable(e.target.value);
                        setCustomTableInput('');
                      }}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {PRESET_TABLES.map((tbl) => (
                        <option key={tbl} value={tbl}>
                          {tbl}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      placeholder="Hoặc bàn ghép..."
                      value={customTableInput}
                      onChange={(e) => setCustomTableInput(e.target.value)}
                      className="w-32 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>
                </div>

                {/* Select Staff */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Nhân Viên Order:
                  </label>
                  <select
                    value={selectedStaff}
                    onChange={(e) => setSelectedStaff(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {currentStaffAccount && (
                      <option value={currentStaffAccount.displayName || currentStaffAccount.username}>
                        {currentStaffAccount.displayName} (Tài khoản này)
                      </option>
                    )}
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.fullName}>
                        {emp.fullName} ({emp.roleOrPosition || 'Phục vụ'})
                      </option>
                    ))}
                    <option value="Thu ngân">Thu ngân (Quầy)</option>
                    <option value="Quản lý ca">Quản lý ca</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Menu Search & Category Tabs */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Gõ tên món hoặc đồ uống để tìm nhanh..."
                  className="w-full pl-9.5 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                    selectedCategory === 'all'
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  Tất cả ({products.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 gap-2.5 max-h-[580px] overflow-y-auto pr-1">
              {filteredProducts.map((p) => {
                const inCart = cartItems.find(
                  (it) => it.productName.toLowerCase() === p.productName.toLowerCase()
                );

                return (
                  <div
                    key={p.id}
                    onClick={() => handleAddToCart(p)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer active:scale-95 flex flex-col justify-between min-h-[105px] ${
                      inCart
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 shadow-xs'
                        : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {p.category || 'Món ăn'}
                      </div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-2 mt-0.5">
                        {p.productName}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        {formatVND(p.unitPrice || 0)}
                      </span>

                      {inCart ? (
                        <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white text-xs font-black flex items-center justify-center shadow-xs">
                          {inCart.quantity}
                        </span>
                      ) : (
                        <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs flex items-center justify-center">
                          +
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Order Cart & Ticket Actions (5 cols on lg, 5 on xl) */}
          <div className="lg:col-span-5 xl:col-span-5 p-4 sm:p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between min-h-[580px]">
            <div>
              {/* Order Cart Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Phiếu Order Bàn
                  </div>
                  <h3 className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                    {effectiveTableName}
                  </h3>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500">NV: {selectedStaff}</div>
                  {cartItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearCart}
                      className="text-[11px] font-semibold text-rose-500 hover:underline cursor-pointer"
                    >
                      Xóa hết ({cartItems.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Cart Items List */}
              <div className="mt-3 space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {cartItems.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-400 space-y-2">
                    <span className="text-3xl block">🍲</span>
                    <div>Chưa có món nào được chọn.</div>
                    <div>Bấm vào các món ở menu bên trái để thêm vào bàn!</div>
                  </div>
                ) : (
                  cartItems.map((it) => (
                    <div
                      key={it.id}
                      className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h5 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                            {it.productName}
                          </h5>
                          <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            {formatVND(it.unitPrice)} · {formatVND(it.unitPrice * it.quantity)}
                          </div>
                        </div>

                        {/* Quantity Counter */}
                        <div className="flex items-center gap-1.5 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-0.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(it.id, -1)}
                            className="w-6 h-6 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold flex items-center justify-center cursor-pointer"
                          >
                            -
                          </button>
                          <span className="w-6 text-center text-xs font-black font-mono">
                            {it.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(it.id, 1)}
                            className="w-6 h-6 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold flex items-center justify-center cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Note Input & Tag Suggestions */}
                      <div>
                        <input
                          type="text"
                          placeholder="Ghi chú món (VD: ít cay, mang đá...)"
                          value={it.note || ''}
                          onChange={(e) => handleUpdateItemNote(it.id, e.target.value)}
                          className="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
                        />
                        {/* Quick tags */}
                        <div className="flex items-center gap-1 overflow-x-auto pt-1 no-scrollbar">
                          {QUICK_DISH_NOTES.slice(0, 5).map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => handleAppendNoteTag(it.id, tag)}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-300 hover:bg-slate-300 cursor-pointer whitespace-nowrap"
                            >
                              +{tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Cart Footer: General Note & Submit Button */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <input
                type="text"
                placeholder="Ghi chú chung cho toàn bàn (VD: Khách gọi món đợt 1)..."
                value={generalOrderNote}
                onChange={(e) => setGeneralOrderNote(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
              />

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">
                  Tổng {cartTotalQty} món gọi:
                </span>
                <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-mono">
                  {formatVND(cartTotalAmount)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={cartItems.length === 0}
                  onClick={handleSubmitOrderToKitchen}
                  className={`${
                    cartItems.length > 0 ? 'col-span-2 sm:col-span-1' : 'col-span-2'
                  } py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs sm:text-sm font-extrabold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 disabled:opacity-50`}
                >
                  <Bell className="w-4 h-4 animate-bounce" />
                  <span>BÁO BẾP & IN PHIẾU 🖨️</span>
                </button>

                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearCart}
                    className="col-span-2 sm:col-span-1 py-3 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Hủy chọn / Làm mới</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. DANH SÁCH CÁC PHIẾU ORDER BẾP ĐANG PHỤC VỤ (ACTIVE ORDERS) */}
      {/* ===================================================================== */}
      {subTab === 'active_orders' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Danh Sách Phiếu Order Bếp ({tableOrders.length} phiếu)</span>
              </h3>
              <span className="text-xs text-slate-400">Theo dõi, điều phối chế biến và hủy / in lại phiếu</span>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveOrdersFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeOrdersFilter === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Tất cả ({orderCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setActiveOrdersFilter('pending')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeOrdersFilter === 'pending'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                }`}
              >
                Chờ nấu ({orderCounts.pending})
              </button>
              <button
                type="button"
                onClick={() => setActiveOrdersFilter('cooking')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeOrdersFilter === 'cooking'
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                }`}
              >
                Đang nấu ({orderCounts.cooking})
              </button>
              <button
                type="button"
                onClick={() => setActiveOrdersFilter('served')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeOrdersFilter === 'served'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                }`}
              >
                Đã lên bàn ({orderCounts.served})
              </button>
              <button
                type="button"
                onClick={() => setActiveOrdersFilter('cancelled')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeOrdersFilter === 'cancelled'
                    ? 'bg-rose-700 text-white shadow-2xs'
                    : 'text-slate-500 hover:text-rose-600 dark:hover:text-rose-400'
                }`}
              >
                Đã hủy ({orderCounts.cancelled})
              </button>
            </div>
          </div>

          {filteredActiveOrders.length === 0 ? (
            <div className="p-12 text-center rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400 space-y-2">
              <span className="text-4xl block">
                {activeOrdersFilter === 'cancelled' ? '🗑️' : '📋'}
              </span>
              <div>
                {activeOrdersFilter === 'cancelled'
                  ? 'Không có phiếu order nào bị hủy.'
                  : 'Không tìm thấy phiếu order nào trong mục này.'}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredActiveOrders.map((ord) => {
                const isPending = ord.status === 'pending';
                const isCooking = ord.status === 'cooking';
                const isServed = ord.status === 'served';
                const isCancelled = ord.status === 'cancelled';

                return (
                  <div
                    key={ord.id}
                    className={`p-4 rounded-3xl border flex flex-col justify-between bg-white dark:bg-slate-900 shadow-sm transition-all ${
                      isCancelled
                        ? 'border-rose-200 dark:border-rose-900/60 opacity-80 bg-rose-50/20'
                        : isPending
                        ? 'border-rose-400 dark:border-rose-800 ring-2 ring-rose-400/20'
                        : isCooking
                        ? 'border-amber-400 dark:border-amber-800'
                        : isServed
                        ? 'border-emerald-300 dark:border-emerald-800/80'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div>
                      {/* Ticket Header */}
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono font-bold text-slate-400">
                              #{ord.orderCode}
                            </span>
                            {isCancelled && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-600 text-white uppercase">
                                Đã hủy
                              </span>
                            )}
                          </div>
                          <h4 className={`text-base font-black ${
                            isCancelled
                              ? 'text-slate-500 line-through'
                              : 'text-slate-900 dark:text-white'
                          }`}>
                            {ord.tableName}
                          </h4>
                        </div>

                        <div className="text-right">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              isCancelled
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : isPending
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : isCooking
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                : isServed
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                            }`}
                          >
                            {isCancelled
                              ? 'Đã Hủy Phiếu'
                              : isPending
                              ? 'Chờ nấu'
                              : isCooking
                              ? 'Đang nấu'
                              : isServed
                              ? 'Đã lên món'
                              : 'Đã tính tiền'}
                          </span>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1 justify-end">
                            <Clock className="w-3 h-3" />
                            <span>{ord.orderTime}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-slate-500 py-1.5 flex items-center justify-between">
                        <span>NV: {ord.staffName}</span>
                        {ord.note && (
                          <span className={`italic text-xs truncate max-w-[170px] ${
                            isCancelled ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-amber-600'
                          }`}>
                            "{ord.note}"
                          </span>
                        )}
                      </div>

                      {/* Items List */}
                      <div className="py-2 space-y-1.5 border-y border-slate-100 dark:border-slate-800 my-1">
                        {ord.items.map((it, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center justify-between text-xs ${
                              isCancelled ? 'line-through text-slate-400' : ''
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-black text-emerald-700 dark:text-emerald-300 font-mono w-6 inline-block">
                                {it.quantity}x
                              </span>
                              <span className="font-bold text-slate-800 dark:text-slate-200">
                                {it.productName}
                              </span>
                              {it.note && (
                                <span className="text-[10px] text-rose-500 ml-1.5 font-medium">
                                  [{it.note}]
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-slate-400 shrink-0">
                              {formatVND(it.unitPrice * it.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Ticket Actions */}
                    <div className="pt-3 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-500">Tổng tiền:</span>
                        <span className={`font-mono ${
                          isCancelled
                            ? 'line-through text-slate-400'
                            : 'text-slate-900 dark:text-white'
                        }`}>
                          {formatVND(ord.totalAmount)}
                        </span>
                      </div>

                      {isCancelled ? (
                        /* Actions for Cancelled Order */
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleRestoreCancelledOrder(ord.id)}
                            className="py-1.5 rounded-lg text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 cursor-pointer flex items-center justify-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Khôi phục</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewOrder(ord);
                              setTimeout(() => executeBrowserPrint(ord), 200);
                            }}
                            className="py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Printer className="w-3 h-3" />
                            <span>In báo hủy</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOrderPermanent(ord.id)}
                            className="py-1.5 rounded-lg text-[11px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-600 hover:bg-rose-100 cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Xóa</span>
                          </button>
                        </div>
                      ) : (
                        /* Actions for Active Order */
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(ord.id, 'cooking')}
                              className={`py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                                isCooking
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-amber-100'
                              }`}
                            >
                              Đang nấu
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(ord.id, 'served')}
                              className={`py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                                isServed
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-100'
                              }`}
                            >
                              Đã lên bàn
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewOrder(ord);
                                setTimeout(() => executeBrowserPrint(ord), 200);
                              }}
                              className="py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 cursor-pointer flex items-center justify-center gap-1"
                            >
                              <Printer className="w-3 h-3" />
                              <span>In lại</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenCancelDialog(ord)}
                              className="py-1.5 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Hủy phiếu này</span>
                            </button>

                            {onConvertToBill && (
                              <button
                                type="button"
                                onClick={() => handleTriggerConvertToBill(ord)}
                                className="py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                <span>Tạo Bill</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. CÀI ĐẶT MÁY IN & MẪU PHIẾU NHIỆT (SETTINGS) */}
      {/* ===================================================================== */}
      {subTab === 'settings' && (
        <div className="max-w-xl mx-auto p-5 sm:p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Printer className="w-5 h-5 text-emerald-600" />
            <span>Cài Đặt Máy In Phiếu Báo Bếp (K80 / K57)</span>
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tiêu đề quán in trên đầu phiếu:
              </label>
              <input
                type="text"
                value={restaurantHeader}
                onChange={(e) => {
                  setRestaurantHeader(e.target.value);
                  localStorage.setItem('vq_printer_header', e.target.value);
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Khổ giấy máy in nhiệt:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPrinterPaperSize('80mm');
                    localStorage.setItem('vq_printer_paper_size', '80mm');
                  }}
                  className={`p-3 rounded-xl border font-bold text-center cursor-pointer ${
                    printerPaperSize === '80mm'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  Khổ K80 (80mm - Phổ biến nhất)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrinterPaperSize('58mm');
                    localStorage.setItem('vq_printer_paper_size', '58mm');
                  }}
                  className={`p-3 rounded-xl border font-bold text-center cursor-pointer ${
                    printerPaperSize === '58mm'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  Khổ K57 (58mm - Máy in nhỏ mini)
                </button>
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={autoPrintOnSubmit}
                  onChange={(e) => {
                    setAutoPrintOnSubmit(e.target.checked);
                    localStorage.setItem('vq_auto_print_order', e.target.checked ? 'true' : 'false');
                  }}
                  className="rounded w-4 h-4 text-emerald-600 cursor-pointer"
                />
                <span>Tự động mở hộp thoại in phiếu ngay sau khi bấm Báo Bếp</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: HỦY PHIẾU IN ORDER / BÁO HỦY BẾP */}
      {/* ===================================================================== */}
      {showCancelModal && cancellingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <Ban className="w-5 h-5 shrink-0" />
                <h4 className="text-base font-black text-slate-900 dark:text-white">
                  Hủy Phiếu In Order - {cancellingOrder.tableName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  setCancellingOrder(null);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Order summary info */}
            <div className="p-3 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-xs space-y-1">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-700 dark:text-slate-300">
                  Mã phiếu: #{cancellingOrder.orderCode}
                </span>
                <span className="text-rose-700 dark:text-rose-300 font-mono font-extrabold">
                  {formatVND(cancellingOrder.totalAmount)}
                </span>
              </div>
              <div className="text-slate-500 text-[11px] flex items-center justify-between">
                <span>NV: {cancellingOrder.staffName} · Giờ gọi: {cancellingOrder.orderTime}</span>
                <span>{cancellingOrder.items.reduce((s, x) => s + x.quantity, 0)} món</span>
              </div>
            </div>

            {/* Preset reasons */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Chọn lý do hủy phiếu:
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  'Khách đổi ý / Đổi món khác',
                  'Đổi sang bàn khác',
                  'Nhầm số bàn / Bấm sai',
                  'Bếp hết nguyên liệu',
                  'Khách đợi lâu xin hủy',
                  'Trùng phiếu gọi món',
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => {
                      setCancelReasonPreset(reason);
                      setCancelReasonCustom('');
                    }}
                    className={`p-2 rounded-xl text-left text-xs font-medium border transition-all cursor-pointer ${
                      cancelReasonPreset === reason && !cancelReasonCustom
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    • {reason}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom reason */}
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-500">
                Hoặc nhập lý do chi tiết khác:
              </label>
              <input
                type="text"
                placeholder="Nhập ghi chú lý do hủy..."
                value={cancelReasonCustom}
                onChange={(e) => setCancelReasonCustom(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              />
            </div>

            {/* Print void ticket option */}
            <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={autoPrintVoidTicket}
                  onChange={(e) => setAutoPrintVoidTicket(e.target.checked)}
                  className="rounded w-4 h-4 text-rose-600 cursor-pointer"
                />
                <span className="flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5 text-rose-600" />
                  <span>In Phiếu Báo Hủy Bếp (Void Ticket) để Bếp/Bar ngừng nấu</span>
                </span>
              </label>
              <p className="text-[10px] text-slate-400 mt-1 pl-6">
                Máy in nhiệt sẽ tự động in phiếu có tiêu đề [ĐÃ HỦY PHIẾU] để nhân viên bếp bỏ món.
              </p>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  setCancellingOrder(null);
                }}
                className="py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 text-xs font-bold cursor-pointer"
              >
                Giữ nguyên, không hủy
              </button>

              <button
                type="button"
                onClick={handleConfirmCancelOrder}
                className="py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <XCircle className="w-4 h-4" />
                <span>Xác Nhận HỦY PHIẾU</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: PREVIEW & IN PHIẾU NHIỆT K80/K57 */}
      {/* ===================================================================== */}
      {previewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-emerald-600" />
                <span>{previewOrder.status === 'cancelled' ? 'Phiếu Báo Hủy Bếp (Void Ticket)' : 'Xem Trước Phiếu In Nhiệt'}</span>
              </h4>
              <button
                type="button"
                onClick={() => setPreviewOrder(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Thermal Ticket Visual Preview Container */}
            <div className={`p-4 rounded-xl border text-slate-900 font-mono text-xs shadow-inner space-y-2 ${
              previewOrder.status === 'cancelled' ? 'border-rose-300 bg-rose-50/30' : 'border-slate-300 bg-white'
            }`}>
              <div className="text-center">
                <div className="font-black text-sm uppercase">{restaurantHeader}</div>
                <div className="font-black text-xs uppercase tracking-wider">
                  {previewOrder.status === 'cancelled' ? '*** PHIẾU BÁO HỦY MÓN / VOID TICKET ***' : '*** PHIẾU BÁO BẾP / BAR ***'}
                </div>
              </div>

              {previewOrder.status === 'cancelled' && (
                <div className="p-2 border-2 border-rose-600 bg-rose-100 text-rose-800 font-black text-center text-xs rounded uppercase">
                  ⚠️ ĐÃ HỦY PHIẾU - BÁO BẾP KHÔNG LÀM ⚠️
                </div>
              )}

              <div className="border-t border-dashed border-slate-400 pt-1.5 space-y-0.5 text-[11px]">
                <div className="text-sm font-black text-black">
                  BÀN: {previewOrder.tableName.toUpperCase()}
                </div>
                <div>NV: {previewOrder.staffName}</div>
                <div>
                  Giờ: {previewOrder.orderTime} · {previewOrder.orderDate}
                </div>
                <div>Mã: #{previewOrder.orderCode}</div>
              </div>

              <div className="border-t border-dashed border-slate-400 pt-1.5">
                <div className="grid grid-cols-12 font-black text-[11px] pb-1 border-b border-slate-300">
                  <div className="col-span-2">SL</div>
                  <div className="col-span-10">TÊN MÓN</div>
                </div>

                <div className="space-y-1.5 pt-1">
                  {previewOrder.items.map((it, idx) => (
                    <div key={idx} className={`grid grid-cols-12 text-[11px] leading-tight ${
                      previewOrder.status === 'cancelled' ? 'line-through text-slate-400' : ''
                    }`}>
                      <div className="col-span-2 font-black text-sm">{it.quantity}</div>
                      <div className="col-span-10">
                        <div className="font-bold">{it.productName}</div>
                        {it.note && (
                          <div className="text-[10px] italic text-rose-600">
                            → {it.note}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-dashed border-slate-400 pt-1.5 text-right font-black text-[11px]">
                Tổng: {previewOrder.items.reduce((s, x) => s + x.quantity, 0)} món gọi
              </div>

              {previewOrder.note && (
                <div className="text-[10px] italic border-t border-dashed border-slate-300 pt-1 text-rose-600 font-bold">
                  Ghi chú: {previewOrder.note}
                </div>
              )}
            </div>

            {/* Print Modal Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => executeBrowserPrint(previewOrder)}
                className={`w-full py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
                  previewOrder.status === 'cancelled'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <Printer className="w-4 h-4" />
                <span>
                  {previewOrder.status === 'cancelled'
                    ? 'IN PHIẾU BÁO HỦY BẾP (VOID TICKET)'
                    : 'IN PHIẾU NGAY (Máy in nhiệt / Ctrl + P)'}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenPrintTab(previewOrder)}
                  className="py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Tab in riêng</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyPlainTextForThermal(previewOrder)}
                  className="py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                >
                  {copiedTelegram ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedTelegram ? 'Đã chép!' : 'Copy tin nhắn'}</span>
                </button>
              </div>

              {/* Cancel Button Inside Print Preview Modal */}
              {previewOrder.status !== 'cancelled' ? (
                <button
                  type="button"
                  onClick={() => {
                    handleOpenCancelDialog(previewOrder);
                  }}
                  className="w-full py-2 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5 text-rose-600" />
                  <span>Hủy Phiếu In Này (Báo Hủy Bếp)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRestoreCancelledOrder(previewOrder.id)}
                  className="w-full py-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                  <span>Khôi phục lại phiếu này</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* HIDDEN PRINT-ONLY CONTAINER FOR PHYSICAL THERMAL PRINTER (K80 / K57) */}
      {/* ===================================================================== */}
      {(() => {
        const printData = activePrintReceipt || previewOrder;
        if (!printData) return null;
        const isCancelled = printData.status === 'cancelled';

        return (
          <div id="thermal-print-area" className="hidden print:block text-black bg-white p-2 font-mono">
            <div style={{ maxWidth: printerPaperSize === '58mm' ? '54mm' : '76mm', margin: '0 auto' }}>
              <div className="text-center font-bold text-sm">{restaurantHeader}</div>
              <div className="text-center font-bold text-xs">
                {isCancelled ? '*** PHIẾU BÁO HỦY MÓN / VOID TICKET ***' : '*** PHIẾU BÁO BẾP / BAR ***'}
              </div>
              <div className="text-center text-[10px] mb-1">--------------------------------</div>

              {isCancelled && (
                <div style={{ border: '2px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '12px', margin: '4px 0' }}>
                  ⚠️ ĐÃ HỦY PHIẾU - BÁO BẾP KHÔNG LÀM ⚠️
                </div>
              )}

              <div className="text-base font-black">BÀN: {printData.tableName.toUpperCase()}</div>
              <div className="text-xs">NV: {printData.staffName}</div>
              <div className="text-xs">Giờ: {printData.orderTime} · {printData.orderDate}</div>
              <div className="text-xs">Mã: #{printData.orderCode}</div>
              <div className="text-[10px]">================================</div>

              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-black">
                    <th style={{ width: '20%' }} className="font-bold">SL</th>
                    <th className="font-bold">MÓN & GHI CHÚ</th>
                  </tr>
                </thead>
                <tbody>
                  {printData.items.map((it, idx) => (
                    <tr key={idx} className="border-b border-dashed border-gray-300">
                      <td className="font-black text-sm align-top py-1">{it.quantity}</td>
                      <td className="py-1">
                        <div className={`font-bold text-xs ${isCancelled ? 'line-through' : ''}`}>{it.productName}</div>
                        {it.note && <div className="text-[10px] italic">→ {it.note}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="text-[10px] mt-1">================================</div>
              <div className="text-right text-xs font-bold">
                Tổng: {printData.items.reduce((s, x) => s + x.quantity, 0)} món
              </div>
              {printData.note && (
                <div className="text-[10px] italic mt-0.5">Ghi chú: {printData.note}</div>
              )}
              <div className="text-center text-[10px] mt-2 mb-4">
                {isCancelled ? '*** ĐÃ HỦY ***' : '*** VỊNH QUÁN F&B ***'}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
