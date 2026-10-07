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
  BulkParsedProduct,
} from '../utils/parser';
import { parseMenuProductsWithGemini } from '../services/geminiService';
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
    totalSold?: number;
    totalReturned?: number;
    totalRevenue?: number;
  }) => Promise<void>;
  onBulkUpsertProducts?: (items: BulkParsedProduct[]) => Promise<{
    addedProductsCount: number;
    addedCategories: string[];
  }>;
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
  onBulkUpsertProducts,
  onDeleteProduct,
  onDeleteProductsBatch,
  requestConfirm,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryOldName, setEditingCategoryOldName] = useState<string | null>(
    null
  );
  const [editingCategoryNewName, setEditingCategoryNewName] = useState<string>('');

  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState<string>(categories[0] || 'Bia');
  const [unitPrice, setUnitPrice] = useState<number>(22000);
  const [unit, setUnit] = useState<string>('Lon');

  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [isCustomEditCategory, setIsCustomEditCategory] = useState<boolean>(false);

  const [bulkText, setBulkText] = useState(
    `Gà biển kho nghệ, Gà, 129000\nCombo 2, Lẩu / Món chính, 459000\nBia Tiger Lùn, Bia, 22000\nẾch sapo, Ếch, 135000`
  );
  const [isParsingBulk, setIsParsingBulk] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const menuImageInputRef = React.useRef<HTMLInputElement | null>(null);

  // Merge categories with any category present on products so Category Management never misses a category
  const effectiveCategories = useMemo(() => {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const c of categories) {
      const clean = (c || '').trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        result.push(clean);
      }
    }
    for (const p of products) {
      const clean = (p.category || '').trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        result.push(clean);
      }
    }
    return result;
  }, [categories, products]);

  const bulkPreviewItems = useMemo(() => {
    if (!bulkText.trim()) return [];
    return parseBulkProductsByLogic(bulkText, effectiveCategories);
  }, [bulkText, effectiveCategories]);

  const bulkNewCategories = useMemo(() => {
    const existingSet = new Set(effectiveCategories.map((c) => c.toLowerCase().trim()));
    const added: string[] = [];
    for (const it of bulkPreviewItems) {
      const cat = (it.category || '').trim();
      if (cat && !existingSet.has(cat.toLowerCase())) {
        existingSet.add(cat.toLowerCase());
        added.push(cat);
      }
    }
    return added;
  }, [bulkPreviewItems, effectiveCategories]);

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
            const items = await parseMenuProductsWithGemini({
              imageBase64: base64Data,
              mimeType: file.type || 'image/jpeg',
              apiKey: geminiApiKey || undefined,
              categories: effectiveCategories,
            });
            if (items.length === 0) {
              setFeedback({
                type: 'err',
                text: 'Không tìm thấy sản phẩm nào trong ảnh vừa tải lên.',
              });
              return;
            }
            if (onBulkUpsertProducts) {
              const res = await onBulkUpsertProducts(items);
              setFeedback({
                type: 'ok',
                text: `Gemini AI đã quét ảnh và lưu ${res.addedProductsCount} sản phẩm${
                  res.addedCategories.length > 0
                    ? ` (cùng ${res.addedCategories.length} danh mục mới: ${res.addedCategories.join(', ')})`
                    : ''
                } vào Menu & Quản lý danh mục thành công!`,
              });
            } else {
              for (const it of items) {
                const cat = it.category || inferCategory(it.productName, effectiveCategories);
                await onAddCategory(cat);
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
            }
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

  const handleSaveEditedProduct = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canWrite || !editingProduct) return;
    const cleanName = editingProduct.productName.trim();
    if (!cleanName) {
      setFeedback({
        type: 'err',
        text: 'Vui lòng nhập tên sản phẩm.',
      });
      return;
    }
    const cleanCat = (editingProduct.category || 'Khác').trim() || 'Khác';
    const cleanUnit = (editingProduct.unit || 'Phần').trim() || 'Phần';
    const cleanPrice = Math.max(0, Math.round(Number(editingProduct.unitPrice) || 0));
    const cleanSold = Math.max(0, Math.round(Number(editingProduct.totalSold) || 0));
    const cleanRet = Math.max(0, Math.round(Number(editingProduct.totalReturned) || 0));
    const cleanRev = Math.max(0, Math.round(Number(editingProduct.totalRevenue) || 0));

    await onAddOrUpdateProduct({
      id: editingProduct.id,
      productName: cleanName,
      category: cleanCat,
      unitPrice: cleanPrice,
      unit: cleanUnit,
      totalSold: cleanSold,
      totalReturned: cleanRet,
      totalRevenue: cleanRev,
    });
    setFeedback({
      type: 'ok',
      text: `Đã cập nhật toàn bộ thông tin món "${cleanName}" (Danh mục: ${cleanCat}, ĐVT: ${cleanUnit}, Giá: ${formatVND(
        cleanPrice
      )}) và đồng bộ danh mục trên toàn hệ thống!`,
    });
    setEditingProduct(null);
    setIsCustomEditCategory(false);
  };

  const handleInlineCategoryChange = async (
    prod: ProductRecord,
    newCategory: string
  ) => {
    if (!canWrite || !newCategory || newCategory === prod.category) return;
    if (newCategory === '__NEW_CATEGORY__') {
      setEditingProduct({ ...prod });
      setIsCustomEditCategory(true);
      return;
    }
    await onAddOrUpdateProduct({
      id: prod.id,
      productName: prod.productName,
      category: newCategory,
      unitPrice: prod.unitPrice,
      unit: prod.unit,
      totalSold: prod.totalSold,
      totalReturned: prod.totalReturned,
      totalRevenue: prod.totalRevenue,
    });
    setFeedback({
      type: 'ok',
      text: `Đã chuyển món "${prod.productName}" sang danh mục "${newCategory}" và tự động đồng bộ danh mục mới trên toàn bộ hệ thống!`,
    });
  };

  const handleBulkImportByLogic = () => {
    if (!canWrite || !bulkText.trim()) return;
    const parsedList = parseBulkProductsByLogic(bulkText, effectiveCategories);
    if (parsedList.length === 0) {
      setFeedback({
        type: 'err',
        text: 'Không tìm thấy dòng hợp lệ. Vui lòng nhập theo cấu trúc: Tên sản phẩm, Danh mục, Giá bán (mỗi dòng 1 món).',
      });
      return;
    }

    requestConfirm({
      title: 'Xác nhận Upload Hàng Loạt (Tên sản phẩm, Danh mục, Giá bán)',
      message: `Hệ thống đã phân tích được ${parsedList.length} sản phẩm${
        bulkNewCategories.length > 0
          ? ` và ${bulkNewCategories.length} danh mục mới (${bulkNewCategories.join(', ')})`
          : ''
      } theo logic (Tên sản phẩm, Danh mục, Giá bán). Bạn có chắc chắn muốn lưu toàn bộ vào Menu và Quản lý Danh mục không?`,
      confirmLabel: `Upload ${parsedList.length} sản phẩm`,
      variant: 'primary',
      onConfirm: async () => {
        setIsParsingBulk(true);
        setFeedback(null);
        try {
          if (onBulkUpsertProducts) {
            const res = await onBulkUpsertProducts(parsedList);
            setFeedback({
              type: 'ok',
              text: `Đã upload thành công ${res.addedProductsCount} sản phẩm${
                res.addedCategories.length > 0
                  ? ` và tự động thêm ${res.addedCategories.length} danh mục mới (${res.addedCategories.join(', ')}) vào Quản lý Danh mục`
                  : ''
              }!`,
            });
          } else {
            for (const item of parsedList) {
              const cat = item.category.trim() || 'Khác';
              await onAddCategory(cat);
              await onAddOrUpdateProduct({
                productName: item.productName,
                category: cat,
                unitPrice: item.unitPrice,
                unit: item.unit,
              });
            }
            setFeedback({
              type: 'ok',
              text: `Đã upload hàng loạt thành công ${parsedList.length} sản phẩm và cập nhật Quản lý Danh mục!`,
            });
          }
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

  const handleBulkImportWithGemini = () => {
    if (!canWrite || !bulkText.trim()) return;

    requestConfirm({
      title: 'Xác nhận Dùng Gemini AI Phân Tích & Thêm Món Hàng Loạt',
      message:
        'Bạn có chắc chắn muốn sử dụng Gemini AI để trích xuất (Tên sản phẩm, Danh mục, Giá bán) từ đoạn văn bản và lưu vào Menu & Quản lý Danh mục không?',
      confirmLabel: 'Xác nhận Gemini Upload',
      variant: 'primary',
      onConfirm: async () => {
        setIsParsingBulk(true);
        setFeedback(null);

        try {
          const extracted = await parseMenuProductsWithGemini({
            rawText: bulkText,
            apiKey: geminiApiKey || undefined,
            categories: effectiveCategories,
          });
          if (extracted.length === 0) {
            throw new Error('Gemini không tìm thấy sản phẩm nào từ văn bản.');
          }
          if (onBulkUpsertProducts) {
            const res = await onBulkUpsertProducts(extracted);
            setFeedback({
              type: 'ok',
              text: `Gemini AI đã nhận diện và thêm ${res.addedProductsCount} sản phẩm${
                res.addedCategories.length > 0
                  ? ` cùng ${res.addedCategories.length} danh mục mới (${res.addedCategories.join(', ')})`
                  : ''
              } vào Menu & Quản lý Danh mục!`,
            });
          } else {
            for (const p of extracted) {
              const cat = p.category || inferCategory(p.productName, effectiveCategories);
              await onAddCategory(cat);
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
          }
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
      title: 'Xác nhận Xóa Sản Phẩm Khỏi Menu',
      message: `Bạn có chắc chắn muốn xóa sản phẩm "${prod.productName}" (Danh mục: ${prod.category}) khỏi Menu không?\n\n💡 Lưu ý: Mọi hóa đơn đã bán trước đây sẽ hoàn toàn KHÔNG bị ảnh hưởng (tên món và giá bán trên các bill cũ vẫn giữ nguyên vẹn).`,
      confirmLabel: 'Xóa sản phẩm khỏi Menu',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteProduct(prod.id);
        setFeedback({
          type: 'ok',
          text: `Đã xóa sản phẩm "${prod.productName}" khỏi Menu (các bill cũ không bị ảnh hưởng).`,
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
      title: 'Xác nhận Xóa Tất Cả Sản Phẩm Khỏi Menu',
      message: `Bạn có chắc chắn muốn xóa ${label} khỏi Menu không?\n\n💡 Yên tâm: Mọi hóa đơn bán hàng đã thanh toán trước đây sẽ hoàn toàn KHÔNG bị ảnh hưởng.`,
      confirmLabel: 'Xác nhận Xóa khỏi Menu',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteProductsBatch(ids);
        setFeedback({
          type: 'ok',
          text: `Đã xóa thành công ${label} khỏi Menu (các bill cũ không bị ảnh hưởng).`,
        });
      },
    });
  };

  const handleDeleteEntireMenu = () => {
    if (!canWrite || products.length === 0) return;
    const allIds = products.map((p) => p.id);
    requestConfirm({
      title: 'Xác nhận Xóa Tất Cả Sản Phẩm Trong Toàn Bộ Menu',
      message: `Bạn có chắc chắn muốn xóa toàn bộ ${allIds.length} sản phẩm trong tất cả các danh mục của Menu không?\n\n💡 Yên tâm: Mọi hóa đơn đã bán trước đây sẽ hoàn toàn KHÔNG bị ảnh hưởng.`,
      confirmLabel: 'Xóa sạch Menu',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteProductsBatch(allIds);
        setFeedback({
          type: 'ok',
          text: `Đã xóa toàn bộ ${allIds.length} sản phẩm trong Menu (các bill cũ không bị ảnh hưởng).`,
        });
      },
    });
  };

  return (
    <div className="space-y-5">
      <GeminiKeyBar
        geminiApiKey={geminiApiKey}
        geminiStatus={geminiStatus}
        onSaveGeminiKey={onSaveGeminiKey}
        onCheckGeminiKey={onCheckGeminiKey}
        onClearGeminiKey={onClearGeminiKey}
        requestConfirm={requestConfirm}
        contextLabel="Cấu hình & Check Gemini Key để dùng Gemini quét ảnh Menu hoặc nhận diện thêm món tự động."
      />

      <div className="p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            Quản Lý Thực Đơn, Danh Mục & Upload Sản Phẩm
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            Thêm/sửa/xóa danh mục sản phẩm, upload hàng loạt theo chuẩn <strong>Tên sản phẩm, Danh mục, Giá bán</strong> và quản lý giá mặc định.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 cursor-pointer">
            <input
              type="checkbox"
              checked={autoAddProducts}
              onChange={(e) => onToggleAutoAddProducts(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Tự thêm sản phẩm mới từ Bill</span>
          </label>

          {canWrite && products.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteEntireMenu}
              className="h-9 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa toàn bộ Menu ({products.length})</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-start sm:items-center gap-2.5 text-xs ${
            feedback.type === 'ok'
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              : 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* SECTION: Category Manager */}
      <div className="p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Tag className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Quản Lý Danh Mục Sản Phẩm ({effectiveCategories.length} nhóm)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Khi upload hàng loạt hoặc thêm sản phẩm có danh mục mới, danh mục sẽ tự động được thêm vào đây.
              </p>
            </div>
          </div>

          {canWrite && (
            <form onSubmit={handleCreateCategory} className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Tên danh mục mới (VD: Đồ nướng)..."
                className="flex-1 sm:w-56 h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Thêm nhóm</span>
              </button>
            </form>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {effectiveCategories.map((cat) => {
            const count = products.filter(
              (p) => p.category.toLowerCase().trim() === cat.toLowerCase().trim()
            ).length;
            const isEditingThis = editingCategoryOldName === cat;

            return (
              <div
                key={cat}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-2"
              >
                {isEditingThis ? (
                  <div className="flex items-center gap-1 w-full">
                    <input
                      type="text"
                      value={editingCategoryNewName}
                      onChange={(e) => setEditingCategoryNewName(e.target.value)}
                      className="flex-1 min-w-0 h-8 px-2 text-xs rounded-lg border border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveCategoryRename(cat)}
                      className="h-8 px-2 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer"
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
                        {count} món
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
                          className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"
                          title="Sửa tên danh mục"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategoryClick(cat)}
                          className="w-7 h-7 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center cursor-pointer"
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
        <div className="p-4 sm:p-5 border-2 border-emerald-500/70 rounded-2xl bg-emerald-50/30 dark:bg-emerald-950/25 space-y-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Chỉnh sửa toàn bộ thông tin món: {editingProduct.productName}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Khi đổi tên hoặc đổi danh mục mới, hệ thống sẽ tự động đồng bộ trên toàn bộ Hóa đơn, Số lượng theo danh mục, Kho đồ uống và Báo cáo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingProduct(null);
                setIsCustomEditCategory(false);
              }}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form
            onSubmit={handleSaveEditedProduct}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end"
          >
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tên sản phẩm *
              </label>
              <input
                type="text"
                required
                value={editingProduct.productName}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    productName: e.target.value,
                  })
                }
                className="w-full h-10 px-3 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>

            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Danh mục *
                </label>
                <button
                  type="button"
                  onClick={() => setIsCustomEditCategory((v) => !v)}
                  className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  {isCustomEditCategory ? 'Chọn danh mục có sẵn' : '+ Nhập danh mục mới'}
                </button>
              </div>
              {isCustomEditCategory ? (
                <input
                  type="text"
                  required
                  value={editingProduct.category}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      category: e.target.value,
                    })
                  }
                  placeholder="Nhập tên danh mục mới..."
                  className="w-full h-10 px-3 text-xs font-semibold rounded-xl border border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              ) : (
                <select
                  value={editingProduct.category}
                  onChange={(e) => {
                    if (e.target.value === '__NEW_CATEGORY__') {
                      setIsCustomEditCategory(true);
                      return;
                    }
                    setEditingProduct({
                      ...editingProduct,
                      category: e.target.value,
                    });
                  }}
                  className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  {Array.from(
                    new Set([...effectiveCategories, editingProduct.category])
                  )
                    .filter(Boolean)
                    .map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  <option value="__NEW_CATEGORY__">+ Nhập danh mục mới...</option>
                </select>
              )}
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Đơn vị tính (ĐVT)
              </label>
              <input
                type="text"
                value={editingProduct.unit}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    unit: e.target.value,
                  })
                }
                placeholder="VD: Lon, Chai, Phần..."
                className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>

            <div className="lg:col-span-2">
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
                className="w-full h-10 px-3 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Lũy kế đã bán
              </label>
              <input
                type="number"
                min={0}
                value={editingProduct.totalSold}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    totalSold: Number(e.target.value),
                  })
                }
                className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                SL đã hoàn trả
              </label>
              <input
                type="number"
                min={0}
                value={editingProduct.totalReturned}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    totalReturned: Number(e.target.value),
                  })
                }
                className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Doanh thu lũy kế (₫)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={editingProduct.totalRevenue}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    totalRevenue: Number(e.target.value),
                  })
                }
                className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-7 flex items-center justify-end gap-2">
              <button
                type="submit"
                className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Lưu toàn bộ thông tin món</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingProduct(null);
                  setIsCustomEditCategory(false);
                }}
                className="h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium cursor-pointer"
              >
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Single Product & Bulk Upload Grid */}
      {canWrite && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form
            onSubmit={handleAddSingle}
            className="lg:col-span-5 p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xs flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3.5">
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
                    placeholder="Ví dụ: Bia Tiger Lùn, Ếch sapo..."
                    className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    2. Danh mục sản phẩm
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
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
                      className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
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
                      className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm vào Danh mục Sản phẩm</span>
            </button>
          </form>

          <div className="lg:col-span-7 p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xs flex flex-col justify-between space-y-3">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Upload Hàng Loạt: Tên sản phẩm, Danh mục, Giá bán
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Mỗi dòng 1 món: <code className="font-mono text-emerald-600 dark:text-emerald-400">Tên sản phẩm, Danh mục, Giá bán</code>
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
                  className="h-9 px-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Gemini Quét Ảnh Menu</span>
                </button>
              </div>

              <textarea
                rows={4}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={`Tên sản phẩm, Danh mục, Giá bán\nBia Tiger Lùn, Bia, 22000\nNước ngọt Redbull, Nước ngọt, 18000`}
                className="w-full p-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />

              {bulkPreviewItems.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Xem trước ({bulkPreviewItems.length} món
                      {bulkNewCategories.length > 0
                        ? ` · +${bulkNewCategories.length} danh mục mới: ${bulkNewCategories.join(', ')}`
                        : ''}
                      ):
                    </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      Tên SP · Danh mục · Giá
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
                          <span className="text-slate-500">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                disabled={isParsingBulk || !bulkText.trim()}
                onClick={handleBulkImportByLogic}
                className="h-10 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Upload Chuẩn ({bulkPreviewItems.length} món)
                </span>
              </button>

              <button
                type="button"
                disabled={isParsingBulk || !bulkText.trim()}
                onClick={handleBulkImportWithGemini}
                className="h-10 px-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold text-xs flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
              >
                {isParsingBulk ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {isParsingBulk
                    ? 'Đang xử lý...'
                    : 'Gemini AI Nhận diện & Thêm món'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Catalog List with Category Tabs & Responsive Cards/Table */}
      <div className="p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xs space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              Tất cả ({products.length})
            </button>
            {effectiveCategories.map((cat) => {
              const countInCat = products.filter(
                (p) => p.category.toLowerCase().trim() === cat.toLowerCase().trim()
              ).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
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

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên sản phẩm..."
                className="w-full sm:w-52 h-9 pl-8 pr-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            {canWrite && filteredProducts.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteCategoryTabProducts}
                className="h-9 px-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {categoryFilter === 'all'
                    ? `Xóa tất cả (${filteredProducts.length})`
                    : `Xóa nhóm "${categoryFilter}" (${filteredProducts.length})`}
                </span>
              </button>
            )}
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-500 dark:text-slate-400">
            Không có sản phẩm nào trong mục này. Bạn có thể thêm món mới hoặc upload danh sách thực đơn ở trên.
          </div>
        ) : (
          <>
            {/* Mobile Product Cards (< md) */}
            <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredProducts.map((prod) => (
                <div
                  key={prod.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col justify-between gap-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {prod.productName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                        {canWrite ? (
                          <select
                            value={prod.category}
                            onChange={(e) =>
                              handleInlineCategoryChange(prod, e.target.value)
                            }
                            className="px-2 py-0.5 text-[11px] font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            {Array.from(
                              new Set([...effectiveCategories, prod.category])
                            ).map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>{prod.category}</span>
                        )}
                        <span>· {prod.unit}</span>
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {formatVND(prod.unitPrice)}
                      </div>
                      <div className="text-[10px] text-slate-400">Giá mặc định</div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="text-slate-600 dark:text-slate-300">
                      Đã bán: <strong>{formatNumber(prod.totalSold)}</strong>
                      {prod.totalReturned > 0 && (
                        <span className="text-rose-500 ml-1">
                          (-{prod.totalReturned})
                        </span>
                      )}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      DT: {formatVND(prod.totalRevenue)}
                    </span>
                  </div>

                  {canWrite && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingProduct({ ...prod })}
                        className="flex-1 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3 text-emerald-600" />
                        <span>Sửa</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOneClick(prod)}
                        className="flex-1 h-8 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 text-xs font-medium text-rose-600 dark:text-rose-400 inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Xóa</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3">Tên sản phẩm</th>
                    <th className="py-2.5 px-3">Danh mục</th>
                    <th className="py-2.5 px-3">Đơn vị</th>
                    <th className="py-2.5 px-3 text-right">Giá bán mặc định</th>
                    <th className="py-2.5 px-3 text-right">Lũy kế đã bán</th>
                    <th className="py-2.5 px-3 text-right">Đã hoàn trả</th>
                    <th className="py-2.5 px-3 text-right">Doanh thu lũy kế</th>
                    {canWrite && <th className="py-2.5 px-3 text-right">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredProducts.map((prod) => {
                    const isRowEditing = editingProduct?.id === prod.id && canWrite;
                    if (isRowEditing && editingProduct) {
                      return (
                        <tr
                          key={prod.id}
                          className="bg-emerald-50/60 dark:bg-emerald-950/30"
                        >
                          <td className="py-2 px-2.5">
                            <input
                              type="text"
                              value={editingProduct.productName}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  productName: e.target.value,
                                })
                              }
                              className="w-full min-w-[140px] h-8 px-2 text-xs font-semibold rounded-lg border border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            />
                          </td>
                          <td className="py-2 px-2.5">
                            {isCustomEditCategory ? (
                              <input
                                type="text"
                                value={editingProduct.category}
                                onChange={(e) =>
                                  setEditingProduct({
                                    ...editingProduct,
                                    category: e.target.value,
                                  })
                                }
                                placeholder="Tên danh mục mới..."
                                className="w-full min-w-[120px] h-8 px-2 text-xs font-semibold rounded-lg border border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                              />
                            ) : (
                              <select
                                value={editingProduct.category}
                                onChange={(e) => {
                                  if (e.target.value === '__NEW_CATEGORY__') {
                                    setIsCustomEditCategory(true);
                                    return;
                                  }
                                  setEditingProduct({
                                    ...editingProduct,
                                    category: e.target.value,
                                  });
                                }}
                                className="w-full min-w-[120px] h-8 px-2 text-xs rounded-lg border border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                              >
                                {Array.from(
                                  new Set([
                                    ...effectiveCategories,
                                    editingProduct.category,
                                  ])
                                )
                                  .filter(Boolean)
                                  .map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                <option value="__NEW_CATEGORY__">
                                  + Danh mục mới...
                                </option>
                              </select>
                            )}
                          </td>
                          <td className="py-2 px-2.5">
                            <input
                              type="text"
                              value={editingProduct.unit}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  unit: e.target.value,
                                })
                              }
                              className="w-20 h-8 px-2 text-xs rounded-lg border border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            />
                          </td>
                          <td className="py-2 px-2.5 text-right">
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
                              className="w-24 h-8 px-2 text-right text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-500 bg-white dark:bg-slate-900"
                            />
                          </td>
                          <td className="py-2 px-2.5 text-right">
                            <input
                              type="number"
                              min={0}
                              value={editingProduct.totalSold}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  totalSold: Number(e.target.value),
                                })
                              }
                              className="w-20 h-8 px-2 text-right text-xs font-mono rounded-lg border border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            />
                          </td>
                          <td className="py-2 px-2.5 text-right">
                            <input
                              type="number"
                              min={0}
                              value={editingProduct.totalReturned}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  totalReturned: Number(e.target.value),
                                })
                              }
                              className="w-20 h-8 px-2 text-right text-xs font-mono rounded-lg border border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            />
                          </td>
                          <td className="py-2 px-2.5 text-right">
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={editingProduct.totalRevenue}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  totalRevenue: Number(e.target.value),
                                })
                              }
                              className="w-28 h-8 px-2 text-right text-xs font-mono font-bold rounded-lg border border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            />
                          </td>
                          <td className="py-2 px-2.5 text-right whitespace-nowrap space-x-1">
                            <button
                              type="button"
                              onClick={() => handleSaveEditedProduct()}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              <Save className="w-3 h-3" />
                              <span>Lưu</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProduct(null);
                                setIsCustomEditCategory(false);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                              <span>Hủy</span>
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                    <tr key={prod.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {prod.productName}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                        {canWrite ? (
                          <select
                            value={prod.category}
                            onChange={(e) =>
                              handleInlineCategoryChange(prod, e.target.value)
                            }
                            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                          >
                            {Array.from(
                              new Set([...effectiveCategories, prod.category])
                            ).map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                            <option value="__NEW_CATEGORY__">+ Danh mục mới...</option>
                          </select>
                        ) : (
                          prod.category
                        )}
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
                            onClick={() => {
                              setEditingProduct({ ...prod });
                              setIsCustomEditCategory(false);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3 text-emerald-600" />
                            <span>Sửa</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOneClick(prod)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-medium text-rose-600 dark:text-rose-400 cursor-pointer"
                            title="Xóa sản phẩm"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Xóa</span>
                          </button>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
