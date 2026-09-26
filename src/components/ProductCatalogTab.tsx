import React, { useState, useMemo } from 'react';
import {
  Plus,
  Upload,
  Trash2,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Edit3,
  Save,
  X,
} from 'lucide-react';
import {
  ProductRecord,
  STANDARD_CATEGORIES,
  ConfirmRequestOptions,
} from '../types';
import { formatVND, formatNumber, inferCategory, inferUnit } from '../utils/parser';

interface ProductCatalogTabProps {
  products: ProductRecord[];
  canWrite: boolean;
  autoAddProducts: boolean;
  onToggleAutoAddProducts: (val: boolean) => void;
  onAddOrUpdateProduct: (prod: {
    id?: string;
    productName: string;
    category: string;
    unitPrice: number;
    unit: string;
  }) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  onDeleteProductsBatch: (productIds: string[]) => Promise<void>;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

export const ProductCatalogTab: React.FC<ProductCatalogTabProps> = ({
  products,
  canWrite,
  autoAddProducts,
  onToggleAutoAddProducts,
  onAddOrUpdateProduct,
  onDeleteProduct,
  onDeleteProductsBatch,
  requestConfirm,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Single Product Add State
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState<string>('Bia');
  const [unitPrice, setUnitPrice] = useState<number>(22000);
  const [unit, setUnit] = useState<string>('Lon');

  // Editing Product State
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);

  // Bulk Upload Text State
  const [bulkText, setBulkText] = useState('');
  const [isParsingBulk, setIsParsingBulk] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const menuImageInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleMenuImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canWrite) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = String(reader.result || '');
      requestConfirm({
        title: 'Xác nhận Upload Sản Phẩm Từ Ảnh Menu / Bill',
        message: `Bạn có chắc chắn muốn dùng AI quét ảnh "${file.name}" để tự động nhận diện món ăn, phân loại danh mục và lưu vào Menu trên Firebase không?`,
        confirmLabel: 'Xác nhận Quét & Lưu Menu',
        variant: 'primary',
        onConfirm: async () => {
          setIsParsingBulk(true);
          setFeedback(null);
          try {
            const res = await fetch('/api/ocr-bill', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageBase64: base64Data,
                mimeType: file.type || 'image/jpeg',
              }),
            });
            if (!res.ok) throw new Error('Không thể đọc ảnh menu.');
            const data = await res.json();
            const items = Array.isArray(data?.items) ? data.items : [];
            if (items.length === 0) {
              setFeedback({
                type: 'err',
                text: 'Không tìm thấy sản phẩm nào trong ảnh vừa tải lên.',
              });
              return;
            }
            for (const it of items) {
              const cat = it.category || inferCategory(it.productName);
              await onAddOrUpdateProduct({
                productName: it.productName,
                category: cat,
                unitPrice: Number(it.unitPrice) || 0,
                unit: inferUnit(it.productName, cat),
              });
            }
            setFeedback({
              type: 'ok',
              text: `Đã quét ảnh và lưu ${items.length} sản phẩm vào Menu Firebase thành công!`,
            });
          } catch (err: any) {
            setFeedback({
              type: 'err',
              text: err?.message || 'Lỗi khi quét ảnh menu.',
            });
          } finally {
            setIsParsingBulk(false);
          }
        },
      });
    };
    reader.readAsDataURL(file);
  };

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => (categoryFilter === 'all' ? true : p.category === categoryFilter))
      .filter((p) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          p.productName.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.category.localeCompare(b.category) || b.totalSold - a.totalSold);
  }, [products, categoryFilter, searchQuery]);

  const handleAddSingle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    const cleanName = productName.trim();
    if (!cleanName) return;

    requestConfirm({
      title: 'Xác nhận Thêm Sản Phẩm Mới',
      message: `Bạn có chắc chắn muốn thêm sản phẩm "${cleanName}" (Danh mục: ${category}, Đơn giá: ${formatVND(
        unitPrice
      )}) vào Menu trên Firebase không?`,
      confirmLabel: 'Xác nhận Thêm',
      variant: 'primary',
      onConfirm: async () => {
        await onAddOrUpdateProduct({
          productName: cleanName,
          category,
          unitPrice: Math.max(0, Math.round(unitPrice || 0)),
          unit: unit.trim() || inferUnit(cleanName, category),
        });
        setFeedback({
          type: 'ok',
          text: `Đã thêm/cập nhật món "${cleanName}" vào danh mục ${category}.`,
        });
        setProductName('');
      },
    });
  };

  const handleSaveEditedProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || !editingProduct) return;
    const cleanName = editingProduct.productName.trim();
    if (!cleanName) return;

    requestConfirm({
      title: 'Xác nhận Cập Nhật Sản Phẩm',
      message: `Bạn có chắc chắn muốn lưu thay đổi cho sản phẩm "${cleanName}" (Nhóm: ${
        editingProduct.category
      }, Đơn giá: ${formatVND(editingProduct.unitPrice)}) lên Firebase không?`,
      confirmLabel: 'Lưu cập nhật',
      variant: 'warning',
      onConfirm: async () => {
        await onAddOrUpdateProduct({
          id: editingProduct.id,
          productName: cleanName,
          category: editingProduct.category,
          unitPrice: Math.max(0, Math.round(editingProduct.unitPrice || 0)),
          unit: editingProduct.unit.trim() || 'Phần',
        });
        setFeedback({
          type: 'ok',
          text: `Đã cập nhật sản phẩm "${cleanName}" thành công.`,
        });
        setEditingProduct(null);
      },
    });
  };

  const handleBulkImport = () => {
    if (!canWrite || !bulkText.trim()) return;

    requestConfirm({
      title: 'Xác nhận Upload Hàng Loạt Sản Phẩm',
      message:
        'Bạn có chắc chắn muốn phân tích và thêm danh sách sản phẩm vừa nhập vào Menu trên Firebase không?',
      confirmLabel: 'Xác nhận Upload',
      variant: 'primary',
      onConfirm: async () => {
        setIsParsingBulk(true);
        setFeedback(null);

        try {
          const res = await fetch('/api/parse-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawText: bulkText }),
          });

          if (res.ok) {
            const data = await res.json();
            const extracted = data.products || [];
            for (const p of extracted) {
              await onAddOrUpdateProduct({
                productName: p.productName,
                category: p.category || inferCategory(p.productName),
                unitPrice: Number(p.unitPrice) || 0,
                unit: p.unit || inferUnit(p.productName, p.category || 'Khác'),
              });
            }
            setFeedback({
              type: 'ok',
              text: `Đã import thành công ${extracted.length} sản phẩm bằng AI!`,
            });
            setBulkText('');
            return;
          }
          throw new Error('Fallback local');
        } catch {
          const lines = bulkText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          let count = 0;
          for (const line of lines) {
            const m = line.match(/^(.+?)\s+[\-|:]?\s*(\d[\d.,]*)\s*(k|đ|vnđ)?$/i);
            if (m) {
              const name = m[1].trim();
              let price = parseInt(m[2].replace(/[^\d]/g, ''), 10) || 0;
              if (m[3]?.toLowerCase() === 'k' || (price > 0 && price < 1000)) price *= 1000;
              const cat = inferCategory(name);
              await onAddOrUpdateProduct({
                productName: name,
                category: cat,
                unitPrice: price,
                unit: inferUnit(name, cat),
              });
              count++;
            }
          }
          setFeedback({
            type: 'ok',
            text: `Đã thêm nhanh ${count} sản phẩm vào danh mục thực đơn.`,
          });
          setBulkText('');
        } finally {
          setIsParsingBulk(false);
        }
      },
    });
  };

  const handleDeleteOneClick = (prod: ProductRecord) => {
    if (!canWrite) return;
    requestConfirm({
      title: 'Xác nhận Xóa Sản Phẩm',
      message: `Bạn có chắc chắn muốn xóa sản phẩm "${prod.productName}" (Danh mục: ${prod.category}) khỏi Menu và Firebase không?`,
      confirmLabel: 'Xóa sản phẩm',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteProduct(prod.id);
        setFeedback({
          type: 'ok',
          text: `Đã xóa sản phẩm "${prod.productName}" khỏi Menu.`,
        });
      },
    });
  };

  const handleDeleteCategoryTabProducts = () => {
    if (!canWrite || filteredProducts.length === 0) return;
    const ids = filteredProducts.map((p) => p.id);
    const label =
      categoryFilter === 'all'
        ? `toàn bộ ${ids.length} sản phẩm trong Menu`
        : `tất cả ${ids.length} sản phẩm thuộc tab danh mục "${categoryFilter}"`;

    requestConfirm({
      title: 'Xác nhận Xóa Tất Cả Sản Phẩm',
      message: `Bạn có chắc chắn muốn xóa ${label} khỏi hệ thống Firebase không? Dữ liệu sau khi xóa sẽ không thể khôi phục.`,
      confirmLabel: 'Xác nhận Xóa tất cả',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteProductsBatch(ids);
        setFeedback({
          type: 'ok',
          text: `Đã xóa thành công ${label} khỏi Menu.`,
        });
      },
    });
  };

  const handleDeleteEntireMenu = () => {
    if (!canWrite || products.length === 0) return;
    const allIds = products.map((p) => p.id);
    requestConfirm({
      title: 'Xác nhận Xóa Tất Cả Sản Phẩm Trong Toàn Bộ Menu',
      message: `Bạn có chắc chắn muốn xóa sạch toàn bộ ${allIds.length} sản phẩm trong tất cả các danh mục của Menu trên Firebase không?`,
      confirmLabel: 'Xóa sạch toàn bộ Menu',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteProductsBatch(allIds);
        setFeedback({
          type: 'ok',
          text: `Đã xóa toàn bộ ${allIds.length} sản phẩm trong Menu.`,
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Auto-detect Toggle + Delete All Menu Button */}
      <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Quản Lý Thực Đơn & Upload Sản Phẩm Theo Danh Mục
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Thêm/sửa/xóa món có xác nhận bảo mật, upload danh sách thực đơn hàng loạt hoặc xóa tất cả sản phẩm theo từng tab danh mục.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 cursor-pointer">
            <input
              type="checkbox"
              checked={autoAddProducts}
              onChange={(e) => onToggleAutoAddProducts(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Tự nhận diện & thêm sản phẩm mới từ Bill</span>
          </label>

          {canWrite && products.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteEntireMenu}
              className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa tất cả sản phẩm trong Menu ({products.length})</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg border flex items-center gap-2.5 text-xs ${
            feedback.type === 'ok'
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              : 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Edit Product Drawer if active */}
      {editingProduct && canWrite && (
        <div className="p-5 border-2 border-emerald-500/60 rounded-xl bg-emerald-50/20 dark:bg-emerald-950/20 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Chỉnh sửa sản phẩm: {editingProduct.productName}
            </h3>
            <button
              type="button"
              onClick={() => setEditingProduct(null)}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form
            onSubmit={handleSaveEditedProduct}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
          >
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tên món ăn / Nước uống
              </label>
              <input
                type="text"
                required
                value={editingProduct.productName}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, productName: e.target.value })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Danh mục
              </label>
              <select
                value={editingProduct.category}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, category: e.target.value })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                {STANDARD_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Đơn giá chuẩn (₫)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={editingProduct.unitPrice}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    unitPrice: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Lưu sửa</span>
              </button>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Single Product & Bulk Upload Grid */}
      {canWrite && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Add Single Product */}
          <form
            onSubmit={handleAddSingle}
            className="lg:col-span-6 p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-4"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Thêm sản phẩm / món mới vào Menu
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tên món ăn / Nước uống
                </label>
                <input
                  type="text"
                  required
                  value={productName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setProductName(val);
                    const guessedCat = inferCategory(val);
                    setCategory(guessedCat);
                    setUnit(inferUnit(val, guessedCat));
                  }}
                  placeholder="Ví dụ: Bia Tiger Lùn, Ếch sapo, Gà chiên mắm..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Danh mục (Category)
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {STANDARD_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Đơn giá (₫)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Đơn vị
                  </label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm vào Danh mục Sản phẩm</span>
            </button>
          </form>

          {/* Bulk Upload via AI / Text / Image */}
          <div className="lg:col-span-6 p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Upload hàng loạt (Ảnh Menu hoặc Dán danh sách)
                </h3>
                <input
                  ref={menuImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleMenuImageUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isParsingBulk}
                  onClick={() => menuImageInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Ảnh Menu / Bill</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tải ảnh chụp thực đơn hoặc dán mỗi dòng 1 món kèm giá (ví dụ: `Bia Sài Gòn 18k`, `Ếch xào lăn 135k`). Hệ thống tự động chia vào đúng nhóm Bia, Nước ngọt, Ếch, Gà...
              </p>
              <textarea
                rows={4}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={`Bia Sài Gòn Lùn 18k\nẾch xào sả ớt 130k\nChân gà nướng 85k`}
                className="mt-2 w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="button"
              disabled={isParsingBulk || !bulkText.trim()}
              onClick={handleBulkImport}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {isParsingBulk ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>
                {isParsingBulk
                  ? 'Đang phân loại & import...'
                  : 'Tự động Phân loại & Thêm hàng loạt'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Catalog List Table with Category Tabs & Delete All in Active Tab */}
      <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              Tất cả ({products.length})
            </button>
            {STANDARD_CATEGORIES.map((cat) => {
              const countInCat = products.filter((p) => p.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {cat} ({countInCat})
                </button>
              );
            })}
          </div>

          {/* Search & Delete All in Current Tab */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên sản phẩm..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            {canWrite && filteredProducts.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteCategoryTabProducts}
                className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {categoryFilter === 'all'
                    ? `Xóa tất cả sản phẩm trong Menu (${filteredProducts.length})`
                    : `Xóa tất cả sản phẩm tab "${categoryFilter}" (${filteredProducts.length})`}
                </span>
              </button>
            )}
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
            Không có sản phẩm nào trong mục này. Bạn có thể thêm món mới hoặc upload danh sách thực đơn ở trên.
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[680px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3">Tên mặt hàng</th>
                  <th className="py-2.5 px-3">Danh mục (Category)</th>
                  <th className="py-2.5 px-3">Đơn vị</th>
                  <th className="py-2.5 px-3 text-right">Đơn giá chuẩn</th>
                  <th className="py-2.5 px-3 text-right">Lũy kế đã bán</th>
                  <th className="py-2.5 px-3 text-right">Đã hoàn trả</th>
                  <th className="py-2.5 px-3 text-right">Doanh thu lũy kế</th>
                  {canWrite && <th className="py-2.5 px-3 text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredProducts.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                      {prod.productName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                      {prod.category}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{prod.unit}</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatVND(prod.unitPrice)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatNumber(prod.totalSold)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-rose-600 dark:text-rose-400">
                      {prod.totalReturned > 0 ? `-${formatNumber(prod.totalReturned)}` : '0'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatVND(prod.totalRevenue)}
                    </td>
                    {canWrite && (
                      <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingProduct({ ...prod })}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3 text-emerald-600" />
                          <span>Sửa</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteOneClick(prod)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-medium text-rose-600 dark:text-rose-400 cursor-pointer"
                          title="Xóa sản phẩm"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Xóa</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
