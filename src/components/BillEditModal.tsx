import React, { useState } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  ProductRecord,
  PaymentType,
  ConfirmRequestOptions,
} from '../types';
import { formatVND, inferCategory, sanitizeId, truncateStr } from '../utils/parser';

interface BillEditModalProps {
  bill: BillRecord;
  items: BillItemRecord[];
  categories: string[];
  products: ProductRecord[];
  onClose: () => void;
  onSaveEdit: (updatedBill: BillRecord, updatedItems: BillItemRecord[]) => Promise<void>;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

export const BillEditModal: React.FC<BillEditModalProps> = ({
  bill,
  items,
  categories,
  products,
  onClose,
  onSaveEdit,
  requestConfirm,
}) => {
  const [billDate, setBillDate] = useState(bill.billDate);
  const [paymentType, setPaymentType] = useState<PaymentType>(bill.paymentType);
  const [debtorName, setDebtorName] = useState(bill.debtorName);
  const [debtStatus, setDebtStatus] = useState<'none' | 'unpaid' | 'paid'>(bill.debtStatus);
  const [note, setNote] = useState(bill.note);
  const [editItems, setEditItems] = useState<BillItemRecord[]>(() =>
    items.map((it) => ({ ...it }))
  );
  const [isSaving, setIsSaving] = useState(false);

  const computedTotal = editItems.reduce(
    (sum, it) => sum + Math.round(it.quantity * it.unitPrice),
    0
  );

  const handleItemChange = (
    idx: number,
    field: 'productName' | 'category' | 'quantity' | 'unitPrice',
    val: string | number
  ) => {
    setEditItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const copy = { ...it };
        if (field === 'productName') {
          const nameStr = String(val);
          copy.productName = nameStr;
          const catalogProd = products.find(
            (p) => p.productName.toLowerCase().trim() === nameStr.toLowerCase().trim()
          );
          if (catalogProd) {
            copy.category = catalogProd.category;
            if (copy.unitPrice === 0 || it.productName !== nameStr) {
              copy.unitPrice = catalogProd.unitPrice;
              copy.subtotal = copy.quantity * copy.unitPrice;
            }
          } else {
            copy.category = inferCategory(copy.productName, categories);
          }
        } else if (field === 'category') {
          copy.category = String(val);
        } else if (field === 'quantity') {
          copy.quantity = Math.max(1, Math.round(Number(val) || 1));
          copy.subtotal = copy.quantity * copy.unitPrice;
        } else if (field === 'unitPrice') {
          // Chỉnh giá trực tiếp trong bill, giữ nguyên giá mặc định của sản phẩm trong Menu
          copy.unitPrice = Math.max(0, Math.round(Number(val) || 0));
          copy.subtotal = copy.quantity * copy.unitPrice;
        }
        return copy;
      })
    );
  };

  const handleAddRow = () => {
    requestConfirm({
      title: 'Xác nhận Thêm Món Vào Hóa Đơn',
      message: `Bạn có muốn thêm 1 dòng món mới vào hóa đơn ${bill.billCode} không?`,
      confirmLabel: 'Thêm món',
      variant: 'primary',
      onConfirm: () => {
        const now = Date.now();
        const defaultProd = products[0];
        setEditItems((prev) => [
          ...prev,
          {
            id: sanitizeId(`item_${now}_${Math.random().toString(36).slice(2, 6)}`),
            ownerId: bill.ownerId,
            billId: bill.id,
            billDate,
            productName: defaultProd ? defaultProd.productName : 'Bia Tiger Lùn',
            category: defaultProd ? defaultProd.category : categories[0] || 'Bia',
            quantity: 1,
            returnedQuantity: 0,
            unitPrice: defaultProd ? defaultProd.unitPrice : 22000,
            subtotal: defaultProd ? defaultProd.unitPrice : 22000,
            createdAtMs: now,
            updatedAtMs: now,
          },
        ]);
      },
    });
  };

  const handleRemoveRow = (idx: number) => {
    const target = editItems[idx];
    requestConfirm({
      title: 'Xác nhận Xóa Món Trong Hóa Đơn',
      message: `Bạn có chắc chắn muốn xóa món "${target?.productName || ''}" khỏi hóa đơn ${
        bill.billCode
      } không?`,
      confirmLabel: 'Xóa món',
      variant: 'danger',
      onConfirm: () => {
        setEditItems((prev) => prev.filter((_, i) => i !== idx));
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = editItems.filter((it) => it.productName.trim() !== '');
    if (valid.length === 0) return;

    requestConfirm({
      title: 'Xác nhận Cập Nhật Hóa Đơn & Giá Món Trong Bill',
      message: `Bạn có chắc chắn muốn lưu thay đổi cho hóa đơn ${bill.billCode} (Tổng mới: ${formatVND(
        computedTotal
      )}) lên Firebase không? (Lưu ý: Giá chỉnh sửa trong bill này không làm thay đổi giá mặc định của sản phẩm trong Menu).`,
      confirmLabel: 'Lưu thay đổi Bill',
      variant: 'warning',
      onConfirm: async () => {
        setIsSaving(true);
        try {
          const now = Date.now();
          const summaryStr = truncateStr(
            valid.map((it) => `${it.productName} (x${it.quantity})`).join(', '),
            1000,
            ''
          );
          const updatedBill: BillRecord = {
            ...bill,
            billDate,
            paymentType,
            debtorName: paymentType === 'debt' ? debtorName.trim() : bill.debtorName,
            debtStatus:
              paymentType === 'debt'
                ? debtStatus === 'none'
                  ? 'unpaid'
                  : debtStatus
                : bill.debtStatus === 'paid'
                ? 'paid'
                : 'none',
            totalAmount: computedTotal,
            itemsSummary: summaryStr,
            note: note.trim(),
            updatedAtMs: now,
          };

          const normalizedItems = valid.map((it) => ({
            ...it,
            billDate,
            subtotal: it.quantity * it.unitPrice,
            updatedAtMs: now,
          }));

          await onSaveEdit(updatedBill, normalizedItems);
          onClose();
        } finally {
          setIsSaving(false);
        }
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Chỉnh sửa Hóa Đơn & Giá Sản Phẩm Trong Bill ({bill.billCode})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bạn có thể chỉnh trực tiếp đơn giá của từng món trong bill này mà không làm thay đổi giá mặc định trong Menu.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ngày Bill
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
                Hình thức thanh toán
              </label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as PaymentType)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="cash">Tiền mặt (cash)</option>
                <option value="transfer">Chuyển khoản (transfer)</option>
                <option value="debt">Công nợ (debt)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tên người nợ
              </label>
              <input
                type="text"
                disabled={paymentType !== 'debt'}
                value={paymentType === 'debt' ? debtorName : ''}
                onChange={(e) => setDebtorName(e.target.value)}
                placeholder="Nhập tên khách nợ..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Các món trong hóa đơn ({editItems.length})
              </span>
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm món</span>
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[560px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500">
                    <th className="py-2 px-3">Tên món</th>
                    <th className="py-2 px-2 w-36">Danh mục</th>
                    <th className="py-2 px-2 w-20 text-right">SL</th>
                    <th className="py-2 px-2 w-36 text-right">
                      Đơn giá trong Bill (₫)
                    </th>
                    <th className="py-2 px-3 w-28 text-right">Thành tiền</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {editItems.map((it, idx) => {
                    const catalogMatch = products.find(
                      (p) =>
                        p.productName.toLowerCase().trim() ===
                        it.productName.toLowerCase().trim()
                    );
                    const isCustomPrice =
                      catalogMatch &&
                      catalogMatch.unitPrice > 0 &&
                      catalogMatch.unitPrice !== it.unitPrice;
                    const categoryOptions = Array.from(
                      new Set([...categories, it.category].filter(Boolean))
                    );

                    return (
                      <tr key={it.id}>
                        <td className="p-2 align-top">
                          <input
                            type="text"
                            list="vqbill-menu-products-list"
                            value={it.productName}
                            onChange={(e) =>
                              handleItemChange(idx, 'productName', e.target.value)
                            }
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <select
                            value={it.category}
                            onChange={(e) =>
                              handleItemChange(idx, 'category', e.target.value)
                            }
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          >
                            {categoryOptions.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 align-top">
                          <input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) =>
                              handleItemChange(idx, 'quantity', e.target.value)
                            }
                            className="w-full px-2 py-1 text-right font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            value={it.unitPrice}
                            onChange={(e) =>
                              handleItemChange(idx, 'unitPrice', e.target.value)
                            }
                            className="w-full px-2 py-1 text-right font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                          {catalogMatch && (
                            <div className="text-[10px] text-right mt-0.5 font-mono text-slate-400">
                              {isCustomPrice ? (
                                <span className="text-amber-600 dark:text-amber-400">
                                  Giá gốc Menu: {formatVND(catalogMatch.unitPrice)} (Giữ nguyên)
                                </span>
                              ) : (
                                <span>Giá gốc Menu: {formatVND(catalogMatch.unitPrice)}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-2 align-top text-right font-mono font-semibold pt-2.5">
                          {formatVND(it.quantity * it.unitPrice)}
                        </td>
                        <td className="p-2 align-top text-center pt-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="font-mono text-sm">
              Tổng cộng mới:{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">
                {formatVND(computedTotal)}
              </strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Đang lưu...' : 'Lưu thay đổi Bill'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
