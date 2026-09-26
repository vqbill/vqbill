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
  FolderPlus,
  Sparkles,
  Tag,
} from 'lucide-react';
import {
  ProductRecord,
  ConfirmRequestOptions,
  GeminiKeyStatus,
} from '../types';
import {
  formatVND,
  formatNumber,
  inferCategory,
  inferUnit,
  parseBulkProductsByLogic,
} from '../utils/parser';
import { GeminiKeyBar } from './GeminiKeyBar';

interface ProductCatalogTabProps {
  products: ProductRecord[];
  categories: string[];
  canWrite: boolean;
  geminiApiKey: string;
  geminiStatus: GeminiKeyStatus;
  onSaveGeminiKey: (newKey: string) => Promise<void>;
  onCheckGeminiKey: (keyToTest?: string) => Promise<{ ok: boolean; message: string }>;
  onClearGeminiKey: () => Promise<void>;
  autoAddProducts: boolean;
  onToggleAutoAddProducts: (val: boolean) => void;
  onAddCategory: (categoryName: string) => Promise<void>;
  onRenameCategory: (oldName: string, newName: string) => Promise<void>;
  onDeleteCategory: (categoryName: string) => Promise<void>;
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
  categories,
  canWrite,
  geminiApiKey,
  geminiStatus,
  onSaveGeminiKey,
  onCheckGeminiKey,
  onClearGeminiKey,
  autoAddProducts,
  onToggleAutoAddProducts,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onAddOrUpdateProduct,
  onDeleteProduct,
  onDeleteProductsBatch,
  requestConfirm,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Category CRUD State
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryOldName, setEditingCategoryOldName] = useState<string | null>(
    null
  );
  const [editingCategoryNewName, setEditingCategoryNewName] = useState<string>('');

  // Single Product Add State
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState<string>(categories[0] || 'Bia');
  const [unitPrice, setUnitPrice] = useState<number>(22000);
  const [unit, setUnit] = useState<string>('Lon');

  // Editing Product State
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);

  // Bulk Upload Text State (Logic: Tên sản phẩm, Danh mục, Giá bán)
  const [bulkText, setBulkText] = useState(
    `Bia Tiger Lùn, Bia, 22000\nNước ngọt Redbull, Nước ngọt, 18000\nẾch sapo, Ếch, 135000\nGà chiên mắm, Gà, 165000`
  );
  const [isParsingBulk, setIsParsingBulk] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const menuImageInputRef = React.useRef<HTMLInputElement | null>(null);

  // Live preview of bulk text parsed by logic: Tên sản phẩm, Danh mục, Giá bán
  const bulkPreviewItems = useMemo(() => {
    if (!bulkText.trim()) return [];
    return parseBulkProductsByLogic(bulkText, categories);
  }, [bulkText, categories]);

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setFeedback({
        type: 'err',
        text: `Danh mục "${trimmed}" đã tồn tại trong hệ thống.`,
      });
      return;
    }

    requestConfirm({
      title: 'Xác nhận Thêm Danh Mục Sản Phẩm Mới',
      message: `Bạn có chắc chắn muốn thêm danh mục "${trimmed}" vào hệ thống và lưu lên Firebase không?`,
      confirmLabel: 'Thêm danh mục',
      variant: 'primary',
      onConfirm: async () => {
        await onAddCategory(trimmed);
        setNewCategoryName('');
        setCategory(trimmed);
        setFeedback({
          type: 'ok',
          text: `Đã thêm danh mục "${trimmed}" thành công!`,
        });
      },
    });
  };

  const handleSaveCategoryRename = (oldName: string) => {
    if (!canWrite) return;
    const trimmed = editingCategoryNewName.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingCategoryOldName(null);
      return;
    }
    if (
      categories.some(
        (c) =>
          c.toLowerCase() !== oldName.toLowerCase() &&
          c.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      setFeedback({
        type: 'err',
        text: `Tên danh mục "${trimmed}" đã tồn tại.`,
      });
      return;
    }

    requestConfirm({
      title: 'Xác nhận Đổi Tên Danh Mục Sản Phẩm',
      message: `Bạn có chắc chắn muốn đổi tên danh mục "${oldName}" thành "${trimmed}" và tự động cập nhật toàn bộ sản phẩm thuộc nhóm này trên Firebase không?`,
      confirmLabel: 'Lưu tên danh mục mới',
      variant: 'warning',
      onConfirm: async () => {
        await onRenameCategory(oldName, trimmed);
        if (categoryFilter === oldName) setCategoryFilter(trimmed);
        if (category === oldName) setCategory(trimmed);
        setEditingCategoryOldName(null);
        setFeedback({
          type: 'ok',
          text: `Đã đổi tên danh mục "${oldName}" thành "${trimmed}".`,
        });
      },
    });
  };

  const handleDeleteCategoryClick = (catName: string) => {
    if (!canWrite) return;
    if (categories.length <= 1) {
      setFeedback({
        type: 'err',
        text: 'Hệ thống cần giữ lại ít nhất 1 danh mục sản phẩm.',
      });
      return;
    }
    const countInCat = products.filter((p) => p.category === catName).length;
    requestConfirm({
      title: 'Xác nhận Xóa Danh Mục Sản Phẩm',
      message: `Bạn có chắc chắn muốn xóa danh mục "${catName}" khỏi hệ thống không? ${
        countInCat > 0
          ? `(${countInCat} sản phẩm đang thuộc nhóm "${catName}" sẽ được chuyển sang danh mục "Khác").`
          : ''
      }`,
      confirmLabel: 'Xóa danh mục',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteCategory(catName);
        if (categoryFilter === catName) setCategoryFilter('all');
        setFeedback({
          type: 'ok',
          text: `Đã xóa danh mục "${catName}".`,
        });
      },
    });
  };

  const handleMenuImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canWrite) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = String(reader.result || '');
      requestConfirm({
        title: 'Xác nhận Dùng Gemini Quét Ảnh Menu / Bill Để Thêm Món',
        message: `Bạn có chắc chắn muốn dùng Gemini AI quét ảnh "${file.name}" để tự động nhận diện (Tên sản phẩm, Danh mục, Giá bán) và lưu vào Menu trên Firebase không?`,
        confirmLabel: 'Xác nhận Quét & Lưu Menu',
        variant: 'primary',
        onConfirm: async () => {
          setIsParsingBulk(true);
          setFeedback(null);
          try {
            const res = await fetch('/api/parse-products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageBase64: base64Data,
                mimeType: file.type || 'image/jpeg',
                apiKey: geminiApiKey || undefined,
                categories,
              }),
            });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || 'Không thể đọc ảnh menu bằng Gemini.');
            }
            const data = await res.json();
            const items = Array.isArray(data?.products) ? data.products : [];
            if (items.length === 0) {
              setFeedback({
                type: 'err',
                text: 'Không tìm thấy sản phẩm nào trong ảnh vừa tải lên.',
              });
              return;
            }
            for (const it of items) {
              const cat = it.category || inferCategory(it.productName, categories);
              if (
                cat &&
                !categories.some((c) => c.toLowerCase() === cat.toLowerCase())
              ) {
                await onAddCategory(cat);
              }
              await onAddOrUpdateProduct({
                productName: it.productName,
                category: cat,
                unitPrice: Number(it.unitPrice) || 0,
                unit: it.unit || inferUnit(it.productName, cat),
              });
            }
            setFeedback({
              type: 'ok',
              text: `Gemini AI đã quét ảnh và lưu ${items.length} sản phẩm vào Menu Firebase thành công!`,
            });
          } catch (err: any) {
            setFeedback({
              type: 'err',
              text: err?.message || 'Lỗi khi quét ảnh menu bằng Gemini.',
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
      .sort(
        (a, b) => a.category.localeCompare(b.category) || b.totalSold - a.totalSold
      );
  }, [products, categoryFilter, searchQuery]);

  const handleAddSingle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    const cleanName = productName.trim();
    if (!cleanName) return;

    requestConfirm({
      title: 'Xác nhận Thêm Sản Phẩm Mới',
      message: `Bạn có chắc chắn muốn thêm sản phẩm "${cleanName}" (Danh mục: ${category}, Giá bán mặc định: ${formatVND(
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
      title: 'Xác nhận Cập Nhật Sản Phẩm Mặc Định',
      message: `Bạn có chắc chắn muốn lưu thay đổi cho sản phẩm "${cleanName}" (Danh mục: ${
        editingProduct.category
      }, Giá bán mặc định: ${formatVND(editingProduct.unitPrice)}) lên Firebase không?`,
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

  // Upload hàng loạt theo đúng logic: Tên sản phẩm, Danh mục, Giá bán
  const handleBulkImportByLogic = () => {
    if (!canWrite || !bulkText.trim()) return;
    const parsedList = parseBulkProductsByLogic(bulkText, categories);
    if (parsedList.length === 0) {
      setFeedback({
        type: 'err',
        text: 'Không tìm thấy dòng hợp lệ. Vui lòng nhập theo cấu trúc: Tên sản phẩm, Danh mục, Giá bán (mỗi dòng 1 món).',
      });
      return;
    }

    requestConfirm({
      title: 'Xác nhận Upload Hàng Loạt (Tên sản phẩm, Danh mục, Giá bán)',
      message: `Hệ thống đã phân tích được ${parsedList.length} sản phẩm theo logic (Tên sản phẩm, Danh mục, Giá bán). Bạn có chắc chắn muốn lưu toàn bộ ${parsedList.length} sản phẩm này vào Menu Firebase không?`,
      confirmLabel: `Upload ${parsedList.length} sản phẩm`,
      variant: 'primary',
      onConfirm: async () => {
        setIsParsingBulk(true);
        setFeedback(null);
        try {
          const seenNewCats = new Set<string>();
          for (const item of parsedList) {
            const cat = item.category.trim() || 'Khác';
            if (
              !categories.some((c) => c.toLowerCase() === cat.toLowerCase()) &&
              !seenNewCats.has(cat.toLowerCase())
            ) {
              seenNewCats.add(cat.toLowerCase());
              await onAddCategory(cat);
            }
            await onAddOrUpdateProduct({
              productName: item.productName,
              category: cat,
              unitPrice: item.unitPrice,
              unit: item.unit,
            });
          }
          setFeedback({
            type: 'ok',
            text: `Đã upload hàng loạt thành công ${parsedList.length} sản phẩm theo chuẩn (Tên sản phẩm, Danh mục, Giá bán) lên Firebase!`,
          });
          setBulkText('');
        } catch (err: any) {
          setFeedback({
            type: 'err',
            text: err?.message || 'Lỗi khi upload hàng loạt sản phẩm.',
          });
        } finally {
          setIsParsingBulk(false);
        }
      },
    });
  };

  // Upload hàng loạt bằng Gemini AI
  const handleBulkImportWithGemini = () => {
    if (!canWrite || !bulkText.trim()) return;

    requestConfirm({
      title: 'Xác nhận Dùng Gemini AI Phân Tích & Thêm Món Hàng Loạt',
      message:
        'Bạn có chắc chắn muốn sử dụng Gemini AI để trích xuất (Tên sản phẩm, Danh mục, Giá bán) từ đoạn văn bản và lưu vào Menu trên Firebase không?',
      confirmLabel: 'Xác nhận Gemini Upload',
      variant: 'primary',
      onConfirm: async () => {
        setIsParsingBulk(true);
        setFeedback(null);

        try {
          const res = await fetch('/api/parse-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rawText: bulkText,
              apiKey: geminiApiKey || undefined,
              categories,
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Lỗi gọi Gemini AI.');
          }

          const data = await res.json();
          const extracted = data.products || [];
          if (extracted.length === 0) {
            throw new Error('Gemini không tìm thấy sản phẩm nào từ văn bản.');
          }
          for (const p of extracted) {
            const cat = p.category || inferCategory(p.productName, categories);
            if (
              cat &&
              !categories.some((c) => c.toLowerCase() === cat.toLowerCase())
            ) {
              await onAddCategory(cat);
            }
            await onAddOrUpdateProduct({
              productName: p.productName,
              category: cat,
              unitPrice: Number(p.unitPrice) || 0,
              unit: p.unit || inferUnit(p.productName, cat),
            });
          }
          setFeedback({
            type: 'ok',
            text: `Gemini AI đã nhận diện và thêm thành công ${extracted.length} sản phẩm vào Menu!`,
          });
          setBulkText('');
        } catch (err: any) {
          setFeedback({
            type: 'err',
            text:
              err?.message ||
              'Không thể kết nối Gemini AI. Hãy kiểm tra Gemini Key hoặc dùng nút Upload theo logic chuẩn.',
          });
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
      {/* Gemini API Key Bar */}
      <GeminiKeyBar
        geminiApiKey={geminiApiKey}
        geminiStatus={geminiStatus}
        onSaveGeminiKey={onSaveGeminiKey}
        onCheckGeminiKey={onCheckGeminiKey}
        onClearGeminiKey={onClearGeminiKey}
        requestConfirm={requestConfirm}
        contextLabel="Cấu hình & Check Gemini Key để dùng Gemini quét ảnh Menu hoặc nhận diện thêm món tự động."
      />

      {/* Header & Auto-detect Toggle + Delete All Menu Button */}
      <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Quản Lý Thực Đơn, Danh Mục & Upload Sản Phẩm Hàng Loạt
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Thêm/sửa/xóa danh mục sản phẩm, upload hàng loạt theo chuẩn <strong>Tên sản phẩm, Danh mục, Giá bán</strong> và quản lý giá mặc định của từng món.
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

      {/* SECTION: Category Manager (Thêm / Sửa / Xóa Danh mục sản phẩm) */}
      <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Quản Lý Danh Mục Sản Phẩm (Thêm / Sửa / Xóa Danh Mục)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hiện có {categories.length} danh mục. Khi sửa tên danh mục, toàn bộ sản phẩm thuộc danh mục đó sẽ tự động cập nhật theo.
              </p>
            </div>
          </div>

          {canWrite && (
            <form onSubmit={handleCreateCategory} className="flex items-center gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Nhập tên danh mục mới (VD: Đồ nướng)..."
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white w-56"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Thêm danh mục</span>
              </button>
            </form>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {categories.map((cat) => {
            const count = products.filter((p) => p.category === cat).length;
            const isEditingThis = editingCategoryOldName === cat;

            return (
              <div
                key={cat}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-2"
              >
                {isEditingThis ? (
                  <div className="flex items-center gap-1.5 w-full">
                    <input
                      type="text"
                      value={editingCategoryNewName}
                      onChange={(e) => setEditingCategoryNewName(e.target.value)}
                      className="flex-1 px-2 py-1 text-xs rounded border border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveCategoryRename(cat)}
                      className="px-2 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      Lưu
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCategoryOldName(null)}
                      className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {cat}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {count} sản phẩm
                      </div>
                    </div>

                    {canWrite && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategoryOldName(cat);
                            setEditingCategoryNewName(cat);
                          }}
                          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                          title="Sửa tên danh mục"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategoryClick(cat)}
                          className="p-1.5 rounded border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 cursor-pointer"
                          title="Xóa danh mục"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Product Drawer if active */}
      {editingProduct && canWrite && (
        <div className="p-5 border-2 border-emerald-500/60 rounded-xl bg-emerald-50/20 dark:bg-emerald-950/20 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Chỉnh sửa sản phẩm mặc định trong Menu: {editingProduct.productName}
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
                Tên sản phẩm
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
                {Array.from(new Set([...categories, editingProduct.category])).map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Giá bán mặc định (₫)
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
            className="lg:col-span-5 p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 flex flex-col justify-between space-y-4"
          >
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Thêm 1 sản phẩm mới vào Menu
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    1. Tên sản phẩm
                  </label>
                  <input
                    type="text"
                    required
                    value={productName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setProductName(val);
                      const guessedCat = inferCategory(val, categories);
                      setCategory(guessedCat);
                      setUnit(inferUnit(val, guessedCat));
                    }}
                    placeholder="Ví dụ: Bia Tiger Lùn, Ếch sapo, Gà chiên mắm..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    2. Danh mục sản phẩm
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      3. Giá bán mặc định (₫)
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
                      Đơn vị tính
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
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm vào Danh mục Sản phẩm</span>
            </button>
          </form>

          {/* Bulk Upload via Logic: Tên sản phẩm, Danh mục, Giá bán */}
          <div className="lg:col-span-7 p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 flex flex-col justify-between space-y-3">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Upload Hàng Loạt theo logic: Tên sản phẩm, Danh mục, Giá bán
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Nhập mỗi dòng 1 món theo đúng thứ tự: <code className="font-mono text-emerald-600 dark:text-emerald-400">Tên sản phẩm, Danh mục, Giá bán</code> (ngăn cách bằng dấu phẩy <code className="font-mono">,</code> hoặc <code className="font-mono">|</code>).
                  </p>
                </div>
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
                  className="px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Gemini Quét Ảnh Menu</span>
                </button>
              </div>

              <textarea
                rows={4}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={`Tên sản phẩm, Danh mục, Giá bán\nBia Tiger Lùn, Bia, 22000\nNước ngọt Redbull, Nước ngọt, 18000\nẾch sapo, Ếch, 135000\nGà chiên mắm, Gà, 165000`}
                className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />

              {/* Live Preview of Bulk Upload Logic */}
              {bulkPreviewItems.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-between">
                    <span>
                      Xem trước kết quả tách tự động ({bulkPreviewItems.length} sản phẩm):
                    </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      Tên sản phẩm · Danh mục · Giá bán
                    </span>
                  </div>
                  <div className="max-h-28 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {bulkPreviewItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-1.5 flex items-center justify-between gap-2"
                      >
                        <span className="font-medium text-slate-900 dark:text-white truncate">
                          {item.productName}
                        </span>
                        <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                          <span className="text-slate-600 dark:text-slate-400">
                            {item.category}
                          </span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 w-20 text-right">
                            {formatVND(item.unitPrice)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                disabled={isParsingBulk || !bulkText.trim()}
                onClick={handleBulkImportByLogic}
                className="py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>
                  Upload Chuẩn (Tên SP, Danh mục, Giá bán) ({bulkPreviewItems.length})
                </span>
              </button>

              <button
                type="button"
                disabled={isParsingBulk || !bulkText.trim()}
                onClick={handleBulkImportWithGemini}
                className="py-2.5 px-3 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold text-xs flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
              >
                {isParsingBulk ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>
                  {isParsingBulk
                    ? 'Đang xử lý...'
                    : 'Dùng Gemini AI Nhận diện & Thêm món'}
                </span>
              </button>
            </div>
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
            {categories.map((cat) => {
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
                  <th className="py-2.5 px-3">Tên sản phẩm</th>
                  <th className="py-2.5 px-3">Danh mục (Category)</th>
                  <th className="py-2.5 px-3">Đơn vị</th>
                  <th className="py-2.5 px-3 text-right">Giá bán mặc định</th>
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
