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
import { formatVND } from '../utils/parser';

interface KiotVietSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncSuccess?: () => void;
}

export const KiotVietSyncModal: React.FC<KiotVietSyncModalProps> = ({
  isOpen,
  onClose,
  onSyncSuccess,
}) => {
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
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

  const tampermonkeyScriptCode = `// ==UserScript==
// @name         VQBill Auto Sync - KiotViet POS (Thu ngân)
// @namespace    https://vqbill.app/
// @version      1.0.0
// @description  Tự động bắt sự kiện bấm nút Thanh toán (F9) trên KiotViet POS để đồng bộ hóa đơn sang VQBill ngay lập tức mà không cần KiotViet API
// @author       VQBill
// @match        https://fnb.kiotviet.vn/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kiotviet.vn
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // 1. CỔNG NHẬN DỮ LIỆU VQBILL CỦA BẠN
  const VQBILL_ENDPOINT = '${syncEndpointUrl}';

  function showToast(message, isError = false) {
    let toast = document.getElementById('vqbill-sync-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'vqbill-sync-toast';
      toast.style.cssText =
        'position:fixed;bottom:24px;right:24px;z-index:9999999;padding:12px 18px;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;font-weight:600;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);transition:all 0.3s ease;display:flex;align-items:center;gap:8px;';
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
    }, 4000);
  }

  // 2. GỬI BILL SANG VQBILL
  function sendBillToVQBill(billData) {
    if (!billData) return;
    const payload = JSON.stringify(billData);

    if (typeof GM_xmlhttpRequest !== 'undefined') {
      GM_xmlhttpRequest({
        method: 'POST',
        url: VQBILL_ENDPOINT,
        headers: { 'Content-Type': 'application/json' },
        data: payload,
        onload: function (res) {
          try {
            const data = JSON.parse(res.responseText);
            if (data.ok) {
              showToast(
                'Đã đồng bộ ' +
                  (billData.tableName || 'Bill') +
                  ' (' +
                  (billData.totalAmount || 0).toLocaleString('vi-VN') +
                  '₫) sang VQBill!'
              );
            } else {
              showToast('Lỗi: ' + (data.error || 'Không thể lưu'), true);
            }
          } catch (e) {
            showToast('Đã gửi hóa đơn sang VQBill!', false);
          }
        },
        onerror: function () {
          showToast('Không kết nối được tới VQBill.', true);
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
          if (data.ok) {
            showToast(
              'Đã đồng bộ ' +
                (billData.tableName || 'Bill') +
                ' (' +
                (billData.totalAmount || 0).toLocaleString('vi-VN') +
                '₫) sang VQBill!'
            );
          }
        })
        .catch(() => {
          showToast('Không kết nối được tới VQBill.', true);
        });
    }
  }

  // 3. ĐỌC DỮ LIỆU TỪ MÀN HÌNH GIAO DIỆN KIOTVIET (DOM SCRAPER)
  function captureActiveOrderFromDOM() {
    try {
      let tableName = '';
      const activeTableEl =
        document.querySelector(
          '.room-active, .table-active, .order-tab-active, [ng-bind*="TableName"], [ng-bind*="table.Name"]'
        ) ||
        Array.from(document.querySelectorAll('span, div, button, h3')).find((el) =>
          /^(?:VIP\\s*\\d+|BÀN\\s*\\d+|MANG\\s*VỀ|MANG\\s*ĐI|MV\\s*\\d+)/i.test(
            (el.innerText || '').trim()
          )
        );

      if (activeTableEl) {
        tableName = (activeTableEl.innerText || '').trim().split('\\n')[0].trim();
      }

      const items = [];
      const itemRows = document.querySelectorAll(
        '.cart-item, .order-item, tr.item-row, .order-detail-row, [ng-repeat*="item in currentOrder"]'
      );

      if (itemRows.length > 0) {
        itemRows.forEach((row) => {
          const nameEl =
            row.querySelector('.item-name, .product-name, [ng-bind*="ProductName"]') ||
            row.querySelector('td:nth-child(2)');
          const qtyEl =
            row.querySelector('.item-quantity, .qty, input.quantity, [ng-bind*="Quantity"]') ||
            row.querySelector('td:nth-child(3)');
          const priceEl =
            row.querySelector('.item-price, .price, [ng-bind*="Price"]') ||
            row.querySelector('td:nth-child(4)');
          const noteEl =
            row.querySelector('.item-note, .note, [ng-bind*="Note"]') ||
            row.querySelector('.txt-note');

          const name = nameEl ? (nameEl.innerText || nameEl.value || '').trim() : '';
          const qty = qtyEl
            ? parseInt((qtyEl.innerText || qtyEl.value || '1').replace(/[^\\d]/g, ''), 10) || 1
            : 1;
          const price = priceEl
            ? parseInt((priceEl.innerText || priceEl.value || '0').replace(/[^\\d]/g, ''), 10) || 0
            : 0;
          const note = noteEl ? (noteEl.innerText || noteEl.value || '').trim() : '';

          if (name) {
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

      let totalAmount = 0;
      const totalEl =
        document.querySelector('.total-amount, [ng-bind*="Total"], [ng-bind*="totalPayment"], .lbl-total') ||
        Array.from(document.querySelectorAll('span, div, b, strong')).find((el) =>
          /(?:tổng\\s*tiền|khách\\s*cần\\s*trả)\\s*[:]?\\s*[\\d.,]+/i.test(el.innerText || '')
        );

      if (totalEl) {
        totalAmount =
          parseInt((totalEl.innerText || '').replace(/[^\\d]/g, ''), 10) || 0;
      }

      if (items.length === 0 && totalAmount === 0) {
        const orderPanel =
          document.querySelector('.order-panel, .cart-panel, .panel-cart, #cart-container') ||
          document.body;
        return {
          rawText: orderPanel.innerText || '',
          tableName: tableName || 'Bàn KiotViet',
        };
      }

      return {
        tableName: tableName || 'Bàn KiotViet',
        items: items,
        totalAmount: totalAmount,
        paymentType: 'cash',
      };
    } catch (e) {
      console.error('[VQBill] Lỗi đọc KiotViet:', e);
      return null;
    }
  }

  // 4. LẮNG NGHE SỰ KIỆN THANH TOÁN (F9)
  function attachPaymentListeners() {
    window.addEventListener(
      'keydown',
      function (e) {
        if (e.key === 'F9' || e.keyCode === 120) {
          setTimeout(() => {
            const bill = captureActiveOrderFromDOM();
            if (bill) sendBillToVQBill(bill);
          }, 400);
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
            text.includes('hoàn thành')
          ) {
            const bill = captureActiveOrderFromDOM();
            if (bill) {
              setTimeout(() => sendBillToVQBill(bill), 300);
            }
          }
        }
      },
      true
    );
  }

  // 5. INTERCEPT NETWORK REQUESTS (XHR & FETCH)
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url;
    this._method = method;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        if (
          this._url &&
          (this._url.includes('/invoices') ||
            this._url.includes('/orders') ||
            this._url.includes('/payment'))
        ) {
          if (this.status === 200 && this.responseText) {
            const data = JSON.parse(this.responseText);
            const inv = data.data || data;
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

  attachPaymentListeners();
  showToast('Đã kết nối VQBill Auto-Sync. Bấm Thanh toán (F9) để tự đồng bộ!');
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

      const res = await fetch('/api/sync-kiotviet-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(samplePayload),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setTestResult({
          ok: true,
          message: `Thành công! Đã tự động tạo hóa đơn Bàn VIP 2 (Mã: ${
            data.bill?.billCode || 'KV'
          }) với 14 món, tổng tiền 2.787.000₫ và lưu vào hệ thống!`,
          billCode: data.bill?.billCode,
        });
        if (onSyncSuccess) {
          onSyncSuccess();
        }
      } else {
        setTestResult({
          ok: false,
          message: data.error || 'Lỗi khi gửi dữ liệu thử nghiệm.',
        });
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

          {/* 3 Steps Guide */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Hướng Dẫn Cài Đặt Trong 1 Phút (Chỉ Cần Làm 1 Lần)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Step 1 */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                    1
                  </span>
                  <a
                    href="https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-semibold text-[11px]"
                  >
                    <span>Cài Tampermonkey</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  Cài tiện ích Tampermonkey
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                  Bấm link trên để thêm tiện ích <strong>Tampermonkey</strong>{' '}
                  miễn phí vào trình duyệt Chrome của bạn.
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                    2
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 font-semibold text-[11px] cursor-pointer"
                  >
                    {copiedScript ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedScript ? 'Đã sao chép' : 'Sao chép Script'}</span>
                  </button>
                </div>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  Dán Script Tự Động
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                  Bấm vào biểu tượng Tampermonkey trên Chrome $\rightarrow${' '}
                  <strong>Tạo script mới</strong> $\rightarrow$ Dán toàn bộ mã
                  bên dưới vào $\rightarrow$ Bấm <strong>File $\rightarrow$ Save (Ctrl+S)</strong>.
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
                    3
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                    Hoàn tất!
                  </span>
                </div>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  Bán hàng & Tự đồng bộ
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                  Mở tab KiotViet Thu Ngân bán hàng bình thường. Mỗi khi bấm nút{' '}
                  <strong>Thanh toán (F9)</strong>, hóa đơn sẽ tự động nhảy sang
                  VQBill ngay lập tức!
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
