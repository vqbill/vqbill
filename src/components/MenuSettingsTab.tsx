import React, { useState } from 'react';
import {
  CheckSquare,
  Square,
  SlidersHorizontal,
  ExternalLink,
  ChevronDown,
  RotateCcw,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  LayoutGrid,
  FolderKanban,
  Lock,
  Unlock,
  Zap,
  ShieldAlert,
} from 'lucide-react';
import {
  ManagementTabId,
  MANAGEMENT_TABS,
  ExternalLinkItem,
  DEFAULT_EXTERNAL_LINKS,
  DEFAULT_VISIBLE_PRIMARY_TABS,
} from '../types';

interface MenuSettingsTabProps {
  allowedTabs: ManagementTabId[];
  visiblePrimaryTabs: ManagementTabId[];
  onChangeVisiblePrimaryTabs: (nextTabs: ManagementTabId[]) => void;
  externalLinks: ExternalLinkItem[];
  onChangeExternalLinks: (nextLinks: ExternalLinkItem[]) => void;
  onSelectTab: (tabId: ManagementTabId) => void;
  tabIcons: Record<ManagementTabId, React.ReactNode>;
  kiotvietSyncLocked?: boolean;
  onToggleKiotvietSyncLock?: (locked?: boolean) => void;
}

export const MenuSettingsTab: React.FC<MenuSettingsTabProps> = ({
  allowedTabs,
  visiblePrimaryTabs,
  onChangeVisiblePrimaryTabs,
  externalLinks,
  onChangeExternalLinks,
  onSelectTab,
  tabIcons,
  kiotvietSyncLocked = false,
  onToggleKiotvietSyncLock,
}) => {
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkDesc, setNewLinkDesc] = useState('');
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [previewDropdownOpen, setPreviewDropdownOpen] = useState(false);

  const availableTabMetas = MANAGEMENT_TABS.filter((t) =>
    allowedTabs.includes(t.id)
  );

  const primaryTabMetas = availableTabMetas.filter((t) =>
    visiblePrimaryTabs.includes(t.id)
  );
  const dropdownTabMetas = availableTabMetas.filter(
    (t) => !visiblePrimaryTabs.includes(t.id)
  );

  const handleToggleTabVisibility = (tabId: ManagementTabId) => {
    const isCurrentlyVisible = visiblePrimaryTabs.includes(tabId);
    if (isCurrentlyVisible) {
      // Ensure at least 1 tab stays visible on main screen
      if (visiblePrimaryTabs.length <= 1) return;
      onChangeVisiblePrimaryTabs(
        visiblePrimaryTabs.filter((id) => id !== tabId)
      );
    } else {
      const next = MANAGEMENT_TABS.map((t) => t.id).filter(
        (id) => visiblePrimaryTabs.includes(id) || id === tabId
      );
      onChangeVisiblePrimaryTabs(next);
    }
  };

  const handleSelectAllMainScreen = () => {
    onChangeVisiblePrimaryTabs([...allowedTabs]);
  };

  const handleResetDefaultVisibility = () => {
    const filteredDefaults = DEFAULT_VISIBLE_PRIMARY_TABS.filter((id) =>
      allowedTabs.includes(id)
    );
    onChangeVisiblePrimaryTabs(
      filteredDefaults.length > 0 ? filteredDefaults : [allowedTabs[0] || 'home']
    );
  };

  const handleAddExternalLink = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel = newLinkLabel.trim();
    let cleanUrl = newLinkUrl.trim();
    if (!cleanLabel || !cleanUrl) return;
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }
    const newItem: ExternalLinkItem = {
      id: `ext_${Date.now()}`,
      label: cleanLabel,
      url: cleanUrl,
      description: newLinkDesc.trim() || undefined,
    };
    onChangeExternalLinks([...externalLinks, newItem]);
    setNewLinkLabel('');
    setNewLinkUrl('');
    setNewLinkDesc('');
  };

  const handleStartEditLink = (item: ExternalLinkItem) => {
    setEditingLinkId(item.id);
    setEditLabel(item.label);
    setEditUrl(item.url);
    setEditDesc(item.description || '');
  };

  const handleSaveEditLink = (id: string) => {
    const cleanLabel = editLabel.trim();
    let cleanUrl = editUrl.trim();
    if (!cleanLabel || !cleanUrl) return;
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }
    onChangeExternalLinks(
      externalLinks.map((item) =>
        item.id === id
          ? {
              ...item,
              label: cleanLabel,
              url: cleanUrl,
              description: editDesc.trim() || undefined,
            }
          : item
      )
    );
    setEditingLinkId(null);
  };

  const handleDeleteLink = (id: string) => {
    onChangeExternalLinks(externalLinks.filter((item) => item.id !== id));
  };

  const handleResetDefaultLinks = () => {
    onChangeExternalLinks(DEFAULT_EXTERNAL_LINKS);
  };

  return (
    <div className="space-y-6">
      {/* SECTION 0: KHÓA / MỞ KHÓA SYNC KIOTVIET POS ĐỂ GIẢM TẢI HỆ THỐNG */}
      <div className={`p-4 sm:p-6 border rounded-2xl shadow-xs space-y-4 transition-colors ${
        kiotvietSyncLocked
          ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/40 dark:bg-amber-950/20'
          : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                kiotvietSyncLocked
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}>
                {kiotvietSyncLocked ? <Lock className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Đồng Bộ KiotViet POS & Giảm Tải Hệ Thống</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  kiotvietSyncLocked
                    ? 'bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
                    : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                }`}>
                  {kiotvietSyncLocked ? 'ĐÃ KHÓA SYNC' : 'ĐANG MỞ KHÓA'}
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
              {kiotvietSyncLocked ? (
                <span>
                  🔒 <strong className="text-amber-800 dark:text-amber-300">Tính năng đồng bộ KiotViet POS đang được KHÓA:</strong> Hệ thống tạm ngừng lắng nghe và chặn các yêu cầu gửi bill từ KiotViet POS, giúp <strong>giảm tải tối đa cho máy chủ, tiết kiệm RAM/băng thông</strong> và giúp ứng dụng chạy siêu mượt.
                </span>
              ) : (
                <span>
                  ⚡ <strong className="text-emerald-700 dark:text-emerald-300">Tính năng đồng bộ KiotViet POS đang MỞ KHÓA:</strong> Sẵn sàng tự động nhận bill tức thì mỗi khi thu ngân nhấn phím <strong>F9 (Thanh toán)</strong> bên màn hình KiotViet. Khi quán đông hoặc không cần sync tự động, bạn có thể <strong>Khóa lại</strong> để hệ thống nhẹ nhất.
                </span>
              )}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {onToggleKiotvietSyncLock && (
              <button
                type="button"
                onClick={() => onToggleKiotvietSyncLock(!kiotvietSyncLocked)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer ${
                  kiotvietSyncLocked
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                }`}
              >
                {kiotvietSyncLocked ? (
                  <>
                    <Unlock className="w-4 h-4" />
                    <span>Mở Khóa Sync KiotViet</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Khóa Sync (Giảm tải hệ thống)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 1: CÀI ĐẶT TÍNH NĂNG HIỂN THỊ TRONG DANH MỤC QUẢN LÝ */}
      <div className="p-4 sm:p-6 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-4 h-4" />
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Cài Đặt Hiển Thị Danh Mục Quản Lý & Cột Dropdown
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <strong>Tích chọn</strong> các tính năng bạn muốn{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">
                hiển thị trực tiếp ra màn hình chính
              </strong>
              . Các tính năng còn lại (bỏ tích) sẽ tự động được{' '}
              <strong className="text-amber-600 dark:text-amber-400">
                gộp vào 1 cột Dropdown ("Tính năng khác")
              </strong>{' '}
              để bấm xổ xuống chọn gọn gàng.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSelectAllMainScreen}
              className="px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Hiện tất cả ra màn hình chính</span>
            </button>
            <button
              type="button"
              onClick={handleResetDefaultVisibility}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Mặc định (Gộp gọn vào Dropdown)</span>
            </button>
          </div>
        </div>

        {/* Live Summary Split: Main Screen vs Dropdown Column */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Column 1: Displayed on Main Screen */}
          <div className="p-4 rounded-2xl border border-emerald-200/90 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  Hiển thị trực tiếp trên màn hình chính ({primaryTabMetas.length})
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-mono text-[10px] font-bold">
                Đã tích chọn
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {primaryTabMetas.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTab(t.id)}
                  className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/80 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-emerald-500 inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Nhấn để chuyển tới tính năng này"
                >
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {tabIcons[t.id]}
                  </span>
                  <span>{t.shortLabel}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Column 2: Grouped into 1 Dropdown Column */}
          <div className="p-4 rounded-2xl border border-amber-200/90 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Cột gộp Dropdown "Tính năng khác" ({dropdownTabMetas.length})
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-amber-600 text-white font-mono text-[10px] font-bold">
                Gộp Dropdown
              </span>
            </div>

            {dropdownTabMetas.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                Tất cả tính năng đang được hiển thị trực tiếp. Bỏ tích các tính năng bên dưới nếu muốn gộp gọn vào cột Dropdown.
              </p>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPreviewDropdownOpen((v) => !v)}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-xs font-bold text-slate-800 dark:text-slate-100 inline-flex items-center justify-between gap-2.5 shadow-2xs cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <FolderKanban className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>
                      Tính năng khác ({dropdownTabMetas.length} mục) — Bấm để xổ xuống chọn
                    </span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-500 transition-transform ${
                      previewDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {previewDropdownOpen && (
                  <div className="mt-2 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {dropdownTabMetas.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setPreviewDropdownOpen(false);
                          onSelectTab(t.id);
                        }}
                        className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-2 cursor-pointer"
                      >
                        <span className="text-amber-600 dark:text-amber-400">
                          {tabIcons[t.id]}
                        </span>
                        <span className="truncate">{t.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Checklist Grid to Tick / Untick Features */}
        <div className="space-y-2.5">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Danh sách tích chọn các tính năng hiển thị ({availableTabMetas.length} danh mục):
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {availableTabMetas.map((tab) => {
              const isChecked = visiblePrimaryTabs.includes(tab.id);
              return (
                <div
                  key={tab.id}
                  onClick={() => handleToggleTabVisibility(tab.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none flex flex-col justify-between gap-2.5 ${
                    isChecked
                      ? 'border-emerald-500/80 bg-emerald-50/40 dark:bg-emerald-950/25 shadow-2xs'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 hover:border-amber-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className={`mt-0.5 shrink-0 ${
                          isChecked
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                          <span className="text-slate-500 dark:text-slate-400 shrink-0">
                            {tabIcons[tab.id]}
                          </span>
                          <span className="truncate">{tab.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                          {tab.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800/80 text-[11px]">
                    <span
                      className={`px-2 py-0.5 rounded-md font-semibold ${
                        isChecked
                          ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {isChecked
                        ? '✓ Hiển thị màn hình chính'
                        : '▾ Gộp vào cột Dropdown'}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTab(tab.id);
                      }}
                      className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
                    >
                      Mở tab →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 2: TAB & DROPDOWN LIÊN KẾT BÊN NGOÀI (THU NGÂN, SỔ QUỸ, NDS) */}
      <div className="p-4 sm:p-6 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <ExternalLink className="w-4 h-4" />
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Liên Kết Bên Ngoài (Nhấn Mở Tab Mới)
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Các liên kết bên dưới hiển thị trong nút <strong>"Liên kết ngoài ▾"</strong> trên thanh điều hướng & Danh mục quản lý. Khi nhấn chọn sẽ tự động mở trang tương ứng trong <strong>tab trình duyệt mới</strong>.
            </p>
          </div>

          <button
            type="button"
            onClick={handleResetDefaultLinks}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer self-start shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Khôi phục 3 link mặc định (Thu ngân, Sổ quỹ, NDS)</span>
          </button>
        </div>

        {/* Cards of Configured External Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {externalLinks.map((link) => {
            const isEditing = editingLinkId === link.id;
            return (
              <div
                key={link.id}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col justify-between gap-3 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
              >
                {isEditing ? (
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Tên chức năng / Liên kết
                      </label>
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Đường dẫn URL
                      </label>
                      <input
                        type="text"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Mô tả ngắn
                      </label>
                      <input
                        type="text"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingLinkId(null)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Hủy</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEditLink(link.id)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Lưu</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <ExternalLink className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                          <span>{link.label}</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEditLink(link)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 cursor-pointer"
                            title="Sửa liên kết"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLink(link.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            title="Xóa liên kết"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {link.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {link.description}
                        </p>
                      )}
                      <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400 break-all bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-800">
                        {link.url}
                      </div>
                    </div>

                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                    >
                      <span>Mở {link.label} (Tab mới)</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Form to Add New External Link */}
        <form
          onSubmit={handleAddExternalLink}
          className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
        >
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tên liên kết mới *
            </label>
            <input
              type="text"
              value={newLinkLabel}
              onChange={(e) => setNewLinkLabel(e.target.value)}
              placeholder="VD: Thu ngân, Sổ quỹ, NDS..."
              className="w-full h-10 px-3 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <div className="sm:col-span-5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Đường dẫn URL (Mở tab mới) *
            </label>
            <input
              type="text"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              placeholder="https://..."
              className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Mô tả (Tùy chọn)
            </label>
            <input
              type="text"
              value={newLinkDesc}
              onChange={(e) => setNewLinkDesc(e.target.value)}
              placeholder="Ghi chú ngắn..."
              className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="w-full h-10 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm liên kết</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
