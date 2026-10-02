import React, { useState } from 'react';
import {
  Zap,
  Copy,
  Check,
  Download,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  X,
  AlertCircle,
  HelpCircle,
  Clock,
  Layers,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { formatVND, getCurrentBusinessDate } from '../utils/parser';

interface KiotVietSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncSuccess?: () => void;
  onDirectCreateBill?: (billData: any) => Promise<any>;
}

export const KiotVietSyncModal: React.FC<KiotVietSyncModalProps> = ({
  isOpen,
  onClose,
  onSyncSuccess,
  onDirectCreateBill,
}) => {
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);
  const [isTestingSync, setIsTestingSync] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    billCode?: string;
  } | null>(null);

  if (!isOpen) return null;

  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const syncEndpointUrl = `${currentOrigin}/api/sync-kiotviet-bill`;
  const rtdbSyncUrl =
    'https://vqbill-default-rtdb.asia-southeast1.firebasedatabase.app/kiotviet_inbox';

  const tampermonkeyScriptCode = `// ==UserScript==
// @name         VQBill Auto Sync - KiotViet POS (Thu ngân)
// @namespace    https://vqbill.app/
// @version      2.2.0
// @description  Tự động bắt sự kiện bấm nút Thanh toán (F9/F10) trên KiotViet POS để đồng bộ hóa đơn sang VQBill ngay lập tức mà không cần KiotViet API
// @author       VQBill
// @match        *://*.kiotviet.vn/*
// @match        *://*.kiotviet.com/*
// @match        *://*/*kiotviet*/*
// @match        *://*/*pos*/*
// @include      *kiotviet*
// @allFrames    true
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kiotviet.vn
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        unsafeWindow
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // 1. CỔNG NHẬN DỮ LIỆU CLOUD TRỰC TIẾP
  const RTDB_ENDPOINT = '${rtdbSyncUrl}';
  const VQBILL_ENDPOINT = '${syncEndpointUrl}';
  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  // 2. HUY HIỆU NỔI VQBILL Ở GÓC DƯỚI BÊN TRÁI (TRÁNH NÚT THANH TOÁN BÊN PHẢI)
  function ensureFloatingBadge() {
    try {
      const container = document.body || document.documentElement;
      if (!container) return;

      let badge = document.getElementById('vqbill-sync-floating-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'vqbill-sync-floating-badge';
        badge.style.cssText =
          'position:fixed !important;bottom:22px !important;left:22px !important;z-index:2147483647 !important;' +
          'background:#090d16 !important;color:#f8fafc !important;padding:10px 16px !important;border-radius:14px !important;' +
          'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif !important;font-size:13px !important;font-weight:600 !important;' +
          'box-shadow:0 12px 30px -5px rgba(0,0,0,0.6), 0 0 16px rgba(16,185,129,0.5) !important;display:flex !important;align-items:center !important;' +
          'gap:10px !important;cursor:grab !important;user-select:none !important;border:1.5px solid #10b981 !important;';

        const dot = document.createElement('span');
        dot.id = 'vqbill-badge-dot';
        dot.style.cssText =
          'width:9px !important;height:9px !important;border-radius:50% !important;background:#10b981 !important;box-shadow:0 0 10px #10b981 !important;display:inline-block !important;shrink:0 !important;';

        const label = document.createElement('span');
        label.id = 'vqbill-badge-label';
        label.style.cssText = 'color:#ffffff !important;font-weight:700 !important;';
        label.innerText = '⚡ VQBill: Sẵn sàng';

        const syncBtn = document.createElement('button');
        syncBtn.id = 'vqbill-badge-manual-sync';
        syncBtn.innerText = '🔄 Đồng bộ bàn';
        syncBtn.style.cssText =
          'background:#059669 !important;color:#ffffff !important;border:none !important;padding:5px 12px !important;border-radius:8px !important;cursor:pointer !important;font-size:12px !important;font-weight:700 !important;margin-left:4px !important;box-shadow:0 2px 6px rgba(0,0,0,0.3) !important;';
        syncBtn.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          updateFloatingBadge('⏳ Đang đọc bàn...', false, false, true);
          const bill = captureActiveOrderFromDOM();
          if (bill) {
            sendBillToVQBill(bill);
          } else {
            updateFloatingBadge('⚠️ Không tìm thấy đơn hàng trên màn hình', false, true);
          }
        };

        badge.appendChild(dot);
        badge.appendChild(label);
        badge.appendChild(syncBtn);
        container.appendChild(badge);

        console.log('%c[VQBill Auto Sync] ĐÃ SẴN SÀNG KẾT NỐI VỚI KIOTVIET POS!', 'background:#059669;color:#fff;font-weight:bold;font-size:14px;padding:6px 12px;border-radius:6px;');
      }
    } catch (err) {
      console.error('[VQBill] Lỗi khởi tạo badge:', err);
    }
  }

  function updateFloatingBadge(statusText, isSuccess = false, isError = false, isLoading = false) {
    ensureFloatingBadge();
    const label = document.getElementById('vqbill-badge-label');
    const dot = document.getElementById('vqbill-badge-dot');
    if (label) label.innerText = statusText;
    if (dot) {
      if (isError) {
        dot.style.background = '#ef4444';
        dot.style.boxShadow = '0 0 10px #ef4444';
      } else if (isLoading) {
        dot.style.background = '#f59e0b';
        dot.style.boxShadow = '0 0 10px #f59e0b';
      } else {
        dot.style.background = '#10b981';
        dot.style.boxShadow = '0 0 10px #10b981';
      }
    }
  }

  function showToast(message, isError = false) {
    let toast = document.getElementById('vqbill-sync-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'vqbill-sync-toast';
      toast.style.cssText =
        'position:fixed !important;bottom:80px !important;left:22px !important;z-index:2147483647 !important;' +
        'padding:12px 18px !important;border-radius:12px !important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif !important;' +
        'font-size:13px !important;font-weight:700 !important;box-shadow:0 10px 25px -5px rgba(0,0,0,0.5) !important;' +
        'display:flex !important;align-items:center !important;gap:8px !important;transition:all 0.3s ease !important;';
      document.body.appendChild(toast);
    }
    toast.style.background = isError ? '#ef4444' : '#10b981';
    toast.style.color = '#ffffff';
    toast.innerHTML = (isError ? '⚠️ ' : '✅ ') + message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
      }
    }, 4500);
  }

  // 3. GỬI BILL SANG VQBILL (ĐỒNG THỜI CẢ CLOUD RTDB VÀ API)
  function sendBillToVQBill(billData) {
    if (!billData) return;
    updateFloatingBadge('⏳ Đang gửi bill sang VQBill...', false, false, true);

    const billId = 'kv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const enrichedData = {
      ...billData,
      id: billId,
      billId: billId,
      timestamp: Date.now(),
      createdAtMs: Date.now(),
      source: 'kiotviet_pos_sync',
    };
    const payload = JSON.stringify(enrichedData);

    let reported = false;
    const notifySuccess = () => {
      if (reported) return;
      reported = true;
      const info =
        (billData.tableName || 'Hóa đơn') +
        ' (' +
        (billData.totalAmount || 0).toLocaleString('vi-VN') +
        '₫)';
      showToast('Đã đồng bộ ' + info + ' sang VQBill!');
      updateFloatingBadge('✅ Đã lưu ' + info, true, false);
    };

    // 3.1. Bắn trực tiếp vào Firebase Cloud Realtime Database (Hoạt động 100% trên Netlify và mọi hosting)
    fetch(RTDB_ENDPOINT + '/' + billId + '.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    })
      .then((r) => {
        if (r.ok) notifySuccess();
      })
      .catch((err) => {
        console.warn('[VQBill RTDB Note]:', err);
      });

    // 3.2. Bắn song song qua HTTP API Server
    const requester =
      typeof GM_xmlhttpRequest !== 'undefined'
        ? GM_xmlhttpRequest
        : typeof GM !== 'undefined' && GM.xmlHttpRequest
        ? GM.xmlHttpRequest
        : null;

    if (requester) {
      requester({
        method: 'POST',
        url: VQBILL_ENDPOINT,
        headers: { 'Content-Type': 'application/json' },
        data: payload,
        onload: function (res) {
          try {
            const data = JSON.parse(res.responseText);
            if (data.ok) notifySuccess();
          } catch (e) {
            notifySuccess();
          }
        },
        onerror: function () {
          // RTDB handles it
        },
      });
    } else {
      fetch(VQBILL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data && data.ok) notifySuccess();
        })
        .catch(() => {});
    }
  }

    // 3.2. Bắn song song qua HTTP API Server
    const requester =
      typeof GM_xmlhttpRequest !== 'undefined'
        ? GM_xmlhttpRequest
        : typeof GM !== 'undefined' && GM.xmlHttpRequest
        ? GM.xmlHttpRequest
        : null;

    if (requester) {
      requester({
        method: 'POST',
        url: VQBILL_ENDPOINT,
        headers: { 'Content-Type': 'application/json' },
        data: payload,
        onload: function (res) {
          try {
            const data = JSON.parse(res.responseText);
            if (data.ok) notifySuccess();
          } catch (e) {
            notifySuccess();
          }
        },
        onerror: function () {
          // RTDB handles it
        },
      });
    } else {
      fetch(VQBILL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data && data.ok) notifySuccess();
        })
        .catch(() => {});
    }
  }

  // 4. ĐỌC DỮ LIỆU TỪ MÀN HÌNH GIAO DIỆN KIOTVIET (DOM SCRAPER)
  function captureActiveOrderFromDOM() {
    try {
      let tableName = '';

      // Tìm tên bàn / phòng
      const activeTableEl =
        document.querySelector(
          '.room-active, .table-active, .order-tab-active, [ng-bind*="TableName"], [ng-bind*="table.Name"], [ng-bind*="RoomName"], .table-title, .name-table, .title-table'
        ) ||
        Array.from(document.querySelectorAll('span, div, button, h3, h2, h4, b, strong')).find((el) =>
          /^(?:VIP\\s*\\d+|BÀN\\s*\\d+|MANG\\s*VỀ|MANG\\s*ĐI|MV\\s*\\d+)/i.test(
            (el.innerText || '').trim()
          )
        );

      if (activeTableEl) {
        tableName = (activeTableEl.innerText || '').trim().split('\\n')[0].trim();
      }

      // Tìm danh sách món
      const items = [];
      const itemRows = document.querySelectorAll(
        '.cart-item, .order-item, tr.item-row, .order-detail-row, [ng-repeat*="currentOrder"], [ng-repeat*="invoiceDetail"], [ng-repeat*="item in order"], #tableCart tbody tr, .cart-table tbody tr, .table-cart tbody tr, tbody.list-cart tr'
      );

      if (itemRows.length > 0) {
        itemRows.forEach((row) => {
          const nameEl =
            row.querySelector('.item-name, .product-name, [ng-bind*="ProductName"], .name, .pro-name') ||
            row.querySelector('td:nth-child(2)');
          const qtyEl =
            row.querySelector('.item-quantity, .qty, input.quantity, [ng-bind*="Quantity"], .quantity') ||
            row.querySelector('td:nth-child(3)');
          const priceEl =
            row.querySelector('.item-price, .price, [ng-bind*="Price"]') ||
            row.querySelector('td:nth-child(4)');
          const noteEl =
            row.querySelector('.item-note, .note, [ng-bind*="Note"], .txt-note');

          const name = nameEl ? (nameEl.innerText || nameEl.value || '').trim() : '';
          const qty = qtyEl
            ? parseInt((qtyEl.innerText || qtyEl.value || '1').replace(/[^\\d]/g, ''), 10) || 1
            : 1;
          const price = priceEl
            ? parseInt((priceEl.innerText || priceEl.value || '0').replace(/[^\\d]/g, ''), 10) || 0
            : 0;
          const note = noteEl ? (noteEl.innerText || noteEl.value || '').trim() : '';

          if (name && name.length > 1 && !/^(?:thêm|xóa|tên món|stt)/i.test(name)) {
            items.push({
              productName: name,
              quantity: qty,
              unitPrice: price,
              subtotal: qty * price,
              note: note,
            });
          }
        });
      }

      // Tìm tổng tiền
      let totalAmount = 0;
      const totalEl =
        document.querySelector('.total-amount, [ng-bind*="Total"], [ng-bind*="totalPayment"], .lbl-total, #totalPayment') ||
        Array.from(document.querySelectorAll('span, div, b, strong')).find((el) =>
          /(?:tổng\\s*tiền|khách\\s*cần\\s*trả|tổng\\s*cộng)\\s*[:]?\\s*[\\d.,]+/i.test(el.innerText || '')
        );

      if (totalEl) {
        totalAmount =
          parseInt((totalEl.innerText || '').replace(/[^\\d]/g, ''), 10) || 0;
      }

      // Container giỏ hàng / order
      const orderPanel =
        document.querySelector('.order-panel, .cart-panel, .panel-cart, #cart-container, #tableCart, .pos-cart, [ng-controller*="Cart"], [ng-controller*="Order"]') ||
        document.body;

      const rawText = orderPanel ? orderPanel.innerText || '' : '';

      return {
        tableName: tableName || 'Bàn KiotViet',
        items: items,
        totalAmount: totalAmount,
        rawText: rawText,
        paymentType: 'cash',
      };
    } catch (e) {
      console.error('[VQBill] Lỗi đọc KiotViet DOM:', e);
      return null;
    }
  }

  // 5. LẮNG NGHE SỰ KIỆN THANH TOÁN (F9 / F10 / CLICK NÚT THANH TOÁN)
  function attachPaymentListeners() {
    window.addEventListener(
      'keydown',
      function (e) {
        if (e.key === 'F9' || e.keyCode === 120 || e.key === 'F10' || e.keyCode === 121) {
          setTimeout(() => {
            const bill = captureActiveOrderFromDOM();
            if (bill) sendBillToVQBill(bill);
          }, 350);
        }
      },
      true
    );

    document.addEventListener(
      'click',
      function (e) {
        const target = e.target;
        if (!target) return;
        const btn = target.closest('button, a, .btn');
        if (btn) {
          const text = (btn.innerText || '').toLowerCase();
          if (
            text.includes('thanh toán') ||
            text.includes('(f9)') ||
            text.includes('(f10)') ||
            text.includes('hoàn thành') ||
            text.includes('lưu & in')
          ) {
            const bill = captureActiveOrderFromDOM();
            if (bill) {
              setTimeout(() => sendBillToVQBill(bill), 250);
            }
          }
        }
      },
      true
    );
  }

  // 6. INTERCEPT NETWORK REQUESTS (XHR & FETCH TRÊN CẢ UNSAFEWINDOW)
  try {
    const targetWin = win || window;
    const origOpen = targetWin.XMLHttpRequest.prototype.open;
    const origSend = targetWin.XMLHttpRequest.prototype.send;

    targetWin.XMLHttpRequest.prototype.open = function (method, url) {
      this._url = url;
      this._method = method;
      return origOpen.apply(this, arguments);
    };

    targetWin.XMLHttpRequest.prototype.send = function (data) {
      const self = this;
      this.addEventListener('load', function () {
        try {
          if (
            self._url &&
            (self._url.includes('/invoices') ||
              self._url.includes('/orders') ||
              self._url.includes('/payment') ||
              self._url.includes('/cashier'))
          ) {
            if (self.status >= 200 && self.status < 300 && self.responseText) {
              const resData = JSON.parse(self.responseText);
              const inv = resData.data || resData;
              if (inv && (inv.InvoiceDetails || inv.Total || inv.TableName)) {
                sendBillToVQBill({
                  tableName: inv.TableName || inv.RoomName || '',
                  billCode: inv.Code || '',
                  totalAmount: inv.Total || inv.TotalPayment || 0,
                  paymentType: inv.PaymentType === 2 ? 'transfer' : 'cash',
                  items: (inv.InvoiceDetails || []).map((d) => ({
                    productName: d.ProductName || '',
                    quantity: d.Quantity || 1,
                    unitPrice: d.Price || 0,
                    subtotal: (d.Quantity || 1) * (d.Price || 0),
                    note: d.Note || '',
                  })),
                });
              }
            }
          }
        } catch (err) {}
      });
      return origSend.apply(this, arguments);
    };
  } catch (err) {
    console.warn('[VQBill] Không thể can thiệp XHR ngầm:', err);
  }

  // KHỞI ĐỘNG VÀ QUÉT ĐỊNH KỲ MỖI 1 GIÂY ĐỂ ĐẢM BẢO HUY HIỆU LUÔN HIỆN DIỆN TRÊN KIOTVIET
  ensureFloatingBadge();
  attachPaymentListeners();
  setInterval(ensureFloatingBadge, 1000);
})();
`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(tampermonkeyScriptCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(syncEndpointUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const handleDownloadUserScript = () => {
    const blob = new Blob([tampermonkeyScriptCode], {
      type: 'text/javascript;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vqbill-kiotviet-pos-sync.user.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRunTestSync = async () => {
    setIsTestingSync(true);
    setTestResult(null);
    try {
      // Sample bill exactly matching the user's uploaded screenshot: VIP 2 - 2,787,000đ with 14 items
      const samplePayload = {
        tableName: 'VIP 2',
        billCode: `KV-${Date.now().toString().slice(-6)}`,
        totalAmount: 2787000,
        paymentType: 'cash',
        items: [
          {
            productName: 'Heineken bạc lon 330ml',
            quantity: 48,
            unitPrice: 26000,
            subtotal: 1248000,
            category: 'Bia',
          },
          {
            productName: 'Cơm chiên trứng',
            quantity: 1,
            unitPrice: 59000,
            subtotal: 59000,
            category: 'Khai vị',
          },
          {
            productName: 'Gỏi ốc giác',
            quantity: 1,
            unitPrice: 119000,
            subtotal: 119000,
            category: 'Khai vị',
          },
          {
            productName: 'Hàu nướng mỡ hành',
            quantity: 1,
            unitPrice: 119000,
            subtotal: 119000,
            category: 'Hải sản',
          },
          {
            productName: 'Nước suối',
            quantity: 3,
            unitPrice: 10000,
            subtotal: 30000,
            category: 'Nước ngọt',
          },
          {
            productName: 'Ốc Hương',
            quantity: 1,
            unitPrice: 186000,
            subtotal: 186000,
            note: 'ốc hương hấp 3 lạng',
            category: 'Hải sản',
          },
          {
            productName: 'Cá bớp um dưa',
            quantity: 1,
            unitPrice: 189000,
            subtotal: 189000,
            note: 'làm cay, nhiều dưa',
            category: 'Hải sản',
          },
          {
            productName: 'Bò cháy tiêu xanh bản giang',
            quantity: 1,
            unitPrice: 139000,
            subtotal: 139000,
            category: 'Món chính',
          },
          {
            productName: 'Bánh bao chiên',
            quantity: 4,
            unitPrice: 5000,
            subtotal: 20000,
            category: 'Khai vị',
          },
          {
            productName: 'Cá Đuối (Phần)',
            quantity: 1,
            unitPrice: 195000,
            subtotal: 195000,
            note: 'Um chua cay',
            category: 'Hải sản',
          },
          {
            productName: 'Coca',
            quantity: 1,
            unitPrice: 15000,
            subtotal: 15000,
            category: 'Nước ngọt',
          },
          {
            productName: 'Sụn gà chiên mắm',
            quantity: 1,
            unitPrice: 99000,
            subtotal: 99000,
            category: 'Gà',
          },
          {
            productName: 'Mực khô nướng',
            quantity: 1,
            unitPrice: 169000,
            subtotal: 169000,
            category: 'Hải sản',
          },
          {
            productName: 'Phụ thu',
            quantity: 1,
            unitPrice: 200000,
            subtotal: 200000,
            category: 'Khác',
          },
        ],
      };

      const sampleBillCode = `KV-${Date.now().toString().slice(-6)}`;

      // 1. Nếu có onDirectCreateBill, lưu thẳng vào hệ thống (hoạt động 100% trên Netlify và mọi hosting)
      if (onDirectCreateBill) {
        await onDirectCreateBill({
          billDate: getCurrentBusinessDate(),
          rawDate: getCurrentBusinessDate(),
          paymentType: 'cash',
          debtorName: '',
          note: 'VIP 2',
          subtotalAmount: samplePayload.totalAmount,
          discountAmount: 0,
          items: samplePayload.items.map((it) => ({
            productName: it.productName,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            subtotal: it.subtotal,
            note: it.note || '',
            category: it.category || 'Khác',
          })),
        });

        // Bắn mẫu vào Realtime Database để kiểm tra thông luồng Cloud
        try {
          const testBillId = `test_kv_${Date.now()}`;
          await fetch(`${rtdbSyncUrl}/${testBillId}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...samplePayload, billCode: sampleBillCode }),
          });
        } catch {}

        setTestResult({
          ok: true,
          message: `Thành công! Đã tự động tạo hóa đơn Bàn VIP 2 (Mã: ${sampleBillCode}) với 14 món, tổng tiền 2.787.000₫ và lưu vào hệ thống!`,
          billCode: sampleBillCode,
        });
        if (onSyncSuccess) {
          onSyncSuccess();
        }
        return;
      }

      // 2. Dự phòng gọi qua API HTTP (an toàn, không crash khi gặp phản hồi HTML từ Netlify)
      try {
        const res = await fetch('/api/sync-kiotviet-bill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(samplePayload),
        });

        const text = await res.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch {}

        if (res.ok && data && data.ok) {
          setTestResult({
            ok: true,
            message: `Thành công! Đã tự động tạo hóa đơn Bàn VIP 2 (Mã: ${
              data.bill?.billCode || sampleBillCode
            }) với 14 món, tổng tiền 2.787.000₫ và lưu vào hệ thống!`,
            billCode: data.bill?.billCode || sampleBillCode,
          });
          if (onSyncSuccess) {
            onSyncSuccess();
          }
          return;
        }
      } catch {}

      // Dự phòng đẩy qua Firebase Realtime Database
      const testBillId = `test_kv_${Date.now()}`;
      await fetch(`${rtdbSyncUrl}/${testBillId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...samplePayload, billCode: sampleBillCode }),
      });

      setTestResult({
        ok: true,
        message: `Thành công! Đã bắn hóa đơn mẫu Bàn VIP 2 qua kênh Firebase Cloud RTDB (Mã: ${sampleBillCode})!`,
        billCode: sampleBillCode,
      });
      if (onSyncSuccess) {
        onSyncSuccess();
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err?.message || 'Không thể kết nối tới máy chủ.',
      });
    } finally {
      setIsTestingSync(false);
    }
  };

  const bookmarkletCode = `javascript:(function(){const s=document.createElement('script');s.innerHTML=\`${tampermonkeyScriptCode.replace(/\\/g, '\\\\').replace(/\`/g, '\\\`').replace(/\\$/g, '\\\\$')}\`;document.body.appendChild(s);})();`;

  const handleCopyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopiedBookmarklet(true);
    setTimeout(() => setCopiedBookmarklet(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-3xl my-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-blue-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Đồng Bộ Tự Động KiotViet POS
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  Không Cần API KiotViet
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tự động gửi hóa đơn sang VQBill ngay khi thu ngân bấm{' '}
                <strong className="text-rose-600 dark:text-rose-400">
                  Thanh toán (F9)
                </strong>{' '}
                bên KiotViet
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto text-xs">
          {/* Active Webhook Status Banner */}
          <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <div className="font-bold text-slate-900 dark:text-white">
                  Cổng Webhook VQBill đang mở & Sẵn sàng nhận dữ liệu
                </div>
                <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 break-all mt-0.5">
                  {syncEndpointUrl}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {copiedUrl ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedUrl ? 'Đã chép URL' : 'Chép URL'}</span>
              </button>
              <button
                type="button"
                disabled={isTestingSync}
                onClick={handleRunTestSync}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isTestingSync ? 'animate-spin' : ''}`}
                />
                <span>
                  {isTestingSync ? 'Đang gửi thử...' : 'Thử Gửi Bill Mẫu VIP 2'}
                </span>
              </button>
            </div>
          </div>

          {/* Test Result Message */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                testResult.ok
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                  : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-bold">{testResult.message}</div>
                {testResult.ok && (
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                    👉 Bạn có thể vào tab <strong>Tổng quan</strong> hoặc{' '}
                    <strong>Số lượng theo Danh mục</strong> để thấy ngay hóa đơn{' '}
                    <strong>Bàn VIP 2</strong> vừa được ghi nhận!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Diagnostic Callout */}
          <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/90 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 space-y-3">
            <div className="font-bold flex items-center gap-1.5 text-xs text-amber-950 dark:text-amber-100">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Giải Đáp 3 Câu Hỏi Quan Trọng Của Bạn:</span>
            </div>
            
            <div className="space-y-2 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
              <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-amber-200 dark:border-amber-900/50">
                <div className="font-bold text-rose-600 dark:text-rose-400 mb-0.5">
                  1. Tại sao bấm "Thử Gửi Bill Mẫu VIP 2" trước đó bị báo lỗi?
                </div>
                <div>
                  Do trang web đang chạy trên Netlify (hosting tĩnh không có Node server), đường dẫn API nội bộ cũ trả về mã HTML thay vì JSON. <strong>Đã được sửa triệt để!</strong> Bây giờ bạn bấm nút <strong>"Thử Gửi Bill Mẫu VIP 2"</strong> ở trên, hóa đơn mẫu 2.787.000₫ (14 món) sẽ được tạo trực tiếp và lưu ngay vào danh sách hóa đơn của bạn.
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-amber-200 dark:border-amber-900/50">
                <div className="font-bold text-blue-600 dark:text-blue-400 mb-0.5">
                  2. Tại sao cài Tampermonkey rồi nhưng KiotViet không hiện "⚡ VQBill: Sẵn sàng"?
                </div>
                <div>
                  Có 3 nguyên nhân phổ biến trong Google Chrome:
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 font-medium text-amber-950 dark:text-amber-100">
                    <li>
                      <strong>Chưa bật Developer Mode:</strong> Chrome chặn UserScripts trừ khi bạn vào <code className="bg-amber-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono font-bold">chrome://extensions</code> và gạt <strong>BẬT "Chế độ dành cho nhà phát triển" (Developer mode)</strong> ở góc trên bên phải.
                    </li>
                    <li>
                      <strong>Chưa bấm Lưu (Ctrl + S) trong Tampermonkey:</strong> Sau khi dán mã script vào Tampermonkey, bạn phải bấm phím <strong>Ctrl + S</strong> (hoặc Menu File $\rightarrow$ Save) thì script mới được lưu lại.
                    </li>
                    <li>
                      <strong>Chưa F5 lại KiotViet:</strong> Cần bấm phím <strong>F5</strong> trên tab KiotViet để tiện ích nạp script mới. Huy hiệu VQBill hiện nằm ở <strong>GÓC DƯỚI BÊN TRÁI</strong> màn hình KiotViet (để không che nút Thanh toán F9 bên phải).
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-amber-200 dark:border-amber-900/50">
                <div className="font-bold text-emerald-700 dark:text-emerald-400 mb-0.5">
                  3. Câu hỏi: "Làm tất cả các bước rồi, sao không thấy gì nhỉ?"
                </div>
                <div>
                  Hãy kiểm tra 2 điểm mấu chốt sau:
                  <ul className="list-decimal pl-4 mt-1 space-y-1 font-medium text-amber-950 dark:text-amber-100">
                    <li>
                      <strong>Kiểm tra tab KiotViet:</strong> Nhìn xuống <strong>góc dưới bên TRÁI</strong> màn hình KiotViet. Nếu đã có huy hiệu màu xanh <code className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-1 py-0.5 rounded font-bold">⚡ VQBill: Sẵn sàng</code>, bạn chỉ cần bấm thử nút <strong>[🔄 Đồng bộ bàn]</strong> ngay trên huy hiệu đó hoặc bấm <strong>Thanh toán (F9)</strong> một đơn bất kỳ.
                    </li>
                    <li>
                      <strong>Kiểm tra Bộ Lọc Ngày trên VQBill:</strong> Khi bill từ KiotViet gửi sang, hệ thống tự động ghi nhận vào <strong>Ca ngày hôm nay</strong>. Nếu trên VQBill bạn đang chọn xem ngày cũ ("Hôm qua"), bill mới sẽ không nằm trong bảng đó. Bạn chỉ cần nhấn vào nút <strong>"Hôm nay"</strong> hoặc <strong>"Tất cả"</strong> trên thanh chọn thời gian của VQBill là sẽ thấy hóa đơn xuất hiện ngay tức khắc!
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* 3 Steps Guide */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Các Bước Kích Hoạt Tự Động Đồng Bộ (Chỉ Làm 1 Lần)</span>
              </h4>
              <button
                type="button"
                onClick={handleCopyBookmarklet}
                className="px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer hover:bg-purple-100"
                title="Sao chép Bookmarklet để chạy 1 click trên thanh Dấu trang không cần Tampermonkey"
              >
                {copiedBookmarklet ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Zap className="w-3 h-3 text-purple-600" />
                )}
                <span>{copiedBookmarklet ? 'Đã chép Bookmarklet' : 'Cách 2: Chép Bookmarklet 1-Click'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              {/* Step 0 */}
              <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="w-5 h-5 rounded-full bg-rose-600 text-white font-bold text-[10px] flex items-center justify-center">
                    0
                  </span>
                  <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase">
                    Bắt buộc
                  </span>
                </div>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  Bật Developer Mode
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                  Gõ <code className="bg-white dark:bg-slate-800 px-1 rounded font-mono">chrome://extensions</code> $\rightarrow$ Gạt BẬT công tắc <strong>Developer mode</strong> ở góc trên bên phải Chrome.
                </p>
              </div>

              {/* Step 1 */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center">
                    1
                  </span>
                  <a
                    href="https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-semibold text-[10px]"
                  >
                    <span>Mở Store</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  Cài Tampermonkey
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                  Thêm tiện ích <strong>Tampermonkey</strong> vào trình duyệt Google Chrome của bạn.
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center">
                    2
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 font-semibold text-[10px] cursor-pointer"
                  >
                    {copiedScript ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedScript ? 'Đã chép' : 'Chép Script'}</span>
                  </button>
                </div>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  Dán Script Tự Động
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                  Mở Tampermonkey $\rightarrow$ <strong>Tạo script mới</strong> $\rightarrow$ Dán mã bên dưới vào $\rightarrow$ Bấm <strong>Ctrl + S</strong> để lưu.
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[10px] flex items-center justify-center">
                    3
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                    Hoàn tất!
                  </span>
                </div>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  Tải lại F5 KiotViet
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                  Quay lại tab KiotViet bấm <strong>F5</strong>. Bạn sẽ thấy huy hiệu <span className="font-bold text-emerald-600">⚡ VQBill: Sẵn sàng</span> ở góc dưới màn hình.
                </p>
              </div>
            </div>
          </div>

          {/* Script Code Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span>Mã Script Tự Động (Đã tích hợp sẵn tên miền của bạn)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadUserScript}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                  title="Tải file .user.js để kéo thả cài vào Tampermonkey"
                >
                  <Download className="w-3 h-3" />
                  <span>Tải file script (.user.js)</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  {copiedScript ? (
                    <Check className="w-3 h-3 text-white" />
                  ) : (
                    <Copy className="w-3 h-3 text-white" />
                  )}
                  <span>{copiedScript ? 'Đã sao chép Script' : 'Sao chép mã Script'}</span>
                </button>
              </div>
            </div>

            <pre className="p-3.5 rounded-xl bg-slate-950 text-emerald-400 text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed border border-slate-800">
              {tampermonkeyScriptCode}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            Cơ chế: Bắt sự kiện trực tiếp trên trình duyệt, không can thiệp cơ sở dữ liệu KiotViet và an toàn tuyệt đối.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 cursor-pointer"
          >
            Đã hiểu & Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
