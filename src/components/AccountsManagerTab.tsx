import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  Plus,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  Save,
  X,
  UserCheck,
  KeyRound,
  Layers,
  CheckSquare,
  RotateCcw,
  Lock,
  Filter,
} from 'lucide-react';
import {
  StaffAccount,
  UserRole,
  ROLE_LABELS,
  ConfirmRequestOptions,
  MANAGEMENT_TABS,
  ManagementTabId,
  RolePermissionsMap,
  DEFAULT_ROLE_PERMISSIONS,
  STANDARD_CATEGORIES,
  getEffectiveRolePermissions,
} from '../types';

interface AccountsManagerTabProps {
  staffAccounts: StaffAccount[];
  currentAccount: StaffAccount;
  rolePermissions: RolePermissionsMap;
  productCategories?: string[];
  onSaveRolePermissions: (
    updatedMap: RolePermissionsMap,
    syncAccountsOfRoles: boolean
  ) => Promise<void>;
  onCreateAccount: (acc: Omit<StaffAccount, 'id'>) => Promise<void>;
  onUpdateAccount: (acc: StaffAccount) => Promise<void>;
  onDeleteAccount: (id: string) => Promise<void>;
  onDeleteAllNonAdminAccounts: () => Promise<void>;
  onSwitchAccount: (acc: StaffAccount) => void;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

const ROLE_ORDER: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CASHIER,
  UserRole.VIEWER,
  UserRole.INVENTORY,
];

const NON_ADMIN_ROLES: UserRole[] = [
  UserRole.MANAGER,
  UserRole.CASHIER,
  UserRole.VIEWER,
  UserRole.INVENTORY,
];

export const AccountsManagerTab: React.FC<AccountsManagerTabProps> = ({
  staffAccounts,
  currentAccount,
  rolePermissions,
  productCategories,
  onSaveRolePermissions,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
  onDeleteAllNonAdminAccounts,
  onSwitchAccount,
  requestConfirm,
}) => {
  const allProductCategories = useMemo(() => {
    const source =
      productCategories && productCategories.length > 0
        ? productCategories
        : Array.from(STANDARD_CATEGORIES);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const c of source) {
      const clean = (c || '').trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        result.push(clean);
      }
    }
    return result;
  }, [productCategories]);

  const [draftRolePerms, setDraftRolePerms] = useState<RolePermissionsMap>(() => ({
    ...DEFAULT_ROLE_PERMISSIONS,
    ...rolePermissions,
  }));
  const [syncRoleToAccounts, setSyncRoleToAccounts] = useState<boolean>(true);

  useEffect(() => {
    setDraftRolePerms({
      ...DEFAULT_ROLE_PERMISSIONS,
      ...rolePermissions,
    });
  }, [rolePermissions]);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newInfo, setNewInfo] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.CASHIER);
  const [newUseCustomTabs, setNewUseCustomTabs] = useState<boolean>(false);
  const [newAllowedTabs, setNewAllowedTabs] = useState<ManagementTabId[]>(
    rolePermissions[UserRole.CASHIER]?.allowedTabs ||
      DEFAULT_ROLE_PERMISSIONS[UserRole.CASHIER].allowedTabs
  );
  const [newUseCustomProdCats, setNewUseCustomProdCats] = useState<boolean>(false);
  const [newRestrictProdCats, setNewRestrictProdCats] = useState<boolean>(false);
  const [newAllowedProdCats, setNewAllowedProdCats] = useState<string[]>([]);

  useEffect(() => {
    const roleCfg =
      rolePermissions[newRole] || DEFAULT_ROLE_PERMISSIONS[newRole];
    if (!newUseCustomTabs) {
      setNewAllowedTabs(roleCfg.allowedTabs);
    }
    if (!newUseCustomProdCats) {
      setNewRestrictProdCats(Boolean(roleCfg.restrictProductCategories));
      setNewAllowedProdCats(roleCfg.allowedProductCategories || []);
    }
  }, [newRole, newUseCustomTabs, newUseCustomProdCats, rolePermissions]);

  const [editingAcc, setEditingAcc] = useState<StaffAccount | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showEditPassword, setShowEditPassword] = useState<boolean>(false);

  const toggleShowPassword = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggleRoleTab = (role: UserRole, tabId: ManagementTabId) => {
    if (role === UserRole.ADMIN && tabId === 'accounts') return;

    setDraftRolePerms((prev) => {
      const currentRoleCfg = prev[role] || DEFAULT_ROLE_PERMISSIONS[role];
      const exists = currentRoleCfg.allowedTabs.includes(tabId);
      let nextTabs = exists
        ? currentRoleCfg.allowedTabs.filter((t) => t !== tabId)
        : [...currentRoleCfg.allowedTabs, tabId];

      if (nextTabs.length === 0) {
        nextTabs = ['dashboard'];
      }
      if (role === UserRole.ADMIN && !nextTabs.includes('accounts')) {
        nextTabs.push('accounts');
      }

      const ordered = MANAGEMENT_TABS.map((m) => m.id).filter((id) =>
        nextTabs.includes(id)
      );

      return {
        ...prev,
        [role]: {
          ...currentRoleCfg,
          allowedTabs: ordered,
        },
      };
    });
  };

  const handleToggleRoleCapability = (
    role: UserRole,
    field: 'canWrite' | 'canDelete',
    value: boolean
  ) => {
    if (role === UserRole.ADMIN) return;
    setDraftRolePerms((prev) => ({
      ...prev,
      [role]: {
        ...(prev[role] || DEFAULT_ROLE_PERMISSIONS[role]),
        [field]: value,
      },
    }));
  };

  // Toggle or set product categories allowed in "Số lượng theo Danh mục" for a Role
  const handleSetRoleCategoryMode = (
    role: UserRole,
    restrict: boolean,
    initialCats?: string[]
  ) => {
    if (role === UserRole.ADMIN) return;
    setDraftRolePerms((prev) => {
      const currentRoleCfg = prev[role] || DEFAULT_ROLE_PERMISSIONS[role];
      const nextTabs = currentRoleCfg.allowedTabs.includes('categories')
        ? currentRoleCfg.allowedTabs
        : MANAGEMENT_TABS.map((m) => m.id).filter(
            (id) => currentRoleCfg.allowedTabs.includes(id) || id === 'categories'
          );
      return {
        ...prev,
        [role]: {
          ...currentRoleCfg,
          allowedTabs: nextTabs,
          restrictProductCategories: restrict,
          allowedProductCategories:
            initialCats !== undefined
              ? initialCats
              : restrict
              ? currentRoleCfg.allowedProductCategories || []
              : [],
        },
      };
    });
  };

  const handleToggleRoleProductCategory = (role: UserRole, categoryName: string) => {
    if (role === UserRole.ADMIN) return;
    setDraftRolePerms((prev) => {
      const currentRoleCfg = prev[role] || DEFAULT_ROLE_PERMISSIONS[role];
      const wasRestricted = Boolean(currentRoleCfg.restrictProductCategories);
      const currentCats = currentRoleCfg.allowedProductCategories || [];

      let nextCats: string[];
      if (!wasRestricted) {
        // When switching from "Xem tất cả" by clicking a category, start with just that category selected
        nextCats = [categoryName];
      } else {
        const exists = currentCats.some(
          (c) => c.toLowerCase() === categoryName.toLowerCase()
        );
        nextCats = exists
          ? currentCats.filter(
              (c) => c.toLowerCase() !== categoryName.toLowerCase()
            )
          : [...currentCats, categoryName];
      }

      // Ensure 'categories' tab is enabled for this role when configuring its categories
      const nextTabs = currentRoleCfg.allowedTabs.includes('categories')
        ? currentRoleCfg.allowedTabs
        : MANAGEMENT_TABS.map((m) => m.id).filter(
            (id) => currentRoleCfg.allowedTabs.includes(id) || id === 'categories'
          );

      return {
        ...prev,
        [role]: {
          ...currentRoleCfg,
          allowedTabs: nextTabs,
          restrictProductCategories: true,
          allowedProductCategories: nextCats,
        },
      };
    });
  };

  const handleSaveRoleMatrixClick = () => {
    requestConfirm({
      title: 'Xác nhận Lưu Phân Quyền Role & Danh Mục Món Ăn',
      message: `Bạn có chắc chắn muốn lưu cấu hình phân quyền các Tab quản lý và quyền xem Danh mục món ăn trong tab "Số lượng theo Danh mục" cho các Role (${
        syncRoleToAccounts
          ? 'đồng thời áp dụng cho các tài khoản thuộc Role tương ứng'
          : 'chỉ áp dụng cho các tài khoản mặc định theo Role'
      }) lên Cloud/Firebase không?`,
      confirmLabel: 'Lưu phân quyền Role',
      variant: 'primary',
      onConfirm: async () => {
        await onSaveRolePermissions(draftRolePerms, syncRoleToAccounts);
      },
    });
  };

  const handleResetRoleMatrixClick = () => {
    requestConfirm({
      title: 'Xác nhận Khôi Phục Phân Quyền Role Mặc Định',
      message:
        'Bạn có chắc chắn muốn khôi phục cấu hình danh mục quản lý mặc định cho tất cả các Role không?',
      confirmLabel: 'Khôi phục mặc định',
      variant: 'warning',
      onConfirm: async () => {
        setDraftRolePerms(DEFAULT_ROLE_PERMISSIONS);
        await onSaveRolePermissions(DEFAULT_ROLE_PERMISSIONS, true);
      },
    });
  };

  const handleToggleNewAccountTab = (tabId: ManagementTabId) => {
    if (newRole === UserRole.ADMIN && tabId === 'accounts') return;
    setNewUseCustomTabs(true);
    setNewAllowedTabs((prev) => {
      const exists = prev.includes(tabId);
      const next = exists ? prev.filter((t) => t !== tabId) : [...prev, tabId];
      if (next.length === 0) return ['dashboard'];
      return MANAGEMENT_TABS.map((m) => m.id).filter((id) => next.includes(id));
    });
  };

  const handleToggleNewAccountProdCat = (catName: string) => {
    setNewUseCustomProdCats(true);
    if (!newRestrictProdCats) {
      setNewRestrictProdCats(true);
      setNewAllowedProdCats([catName]);
      return;
    }
    setNewAllowedProdCats((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === catName.toLowerCase());
      return exists
        ? prev.filter((c) => c.toLowerCase() !== catName.toLowerCase())
        : [...prev, catName];
    });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = newUsername.trim().toLowerCase();
    const p = u === 'admin' ? 'admin123' : newPassword.trim();
    const d = newDisplayName.trim();
    if (!u || !p || !d) return;

    const assignedTabs =
      newAllowedTabs.length > 0
        ? newAllowedTabs
        : rolePermissions[newRole]?.allowedTabs || ['dashboard'];

    const tabLabels = MANAGEMENT_TABS.filter((t) => assignedTabs.includes(t.id))
      .map((t) => t.shortLabel)
      .join(', ');

    requestConfirm({
      title: 'Xác nhận Thêm Tài Khoản & Phân Danh Mục Quản Lý',
      message: `Bạn có chắc chắn muốn tạo tài khoản "@${u}" (${d}) — Role "${ROLE_LABELS[newRole]}" với quyền truy cập ${assignedTabs.length} danh mục quản lý (${tabLabels}) và lưu vào Firebase không?`,
      confirmLabel: 'Xác nhận Tạo tài khoản',
      variant: 'primary',
      onConfirm: async () => {
        await onCreateAccount({
          username: u,
          password: p,
          displayName: d,
          info: newInfo.trim() || 'Nhân sự cửa hàng',
          role: newRole,
          active: true,
          allowedTabs: assignedTabs,
          useCustomTabs: newUseCustomTabs,
          useCustomProductCategories: newUseCustomProdCats,
          restrictProductCategories: newUseCustomProdCats
            ? newRestrictProdCats
            : rolePermissions[newRole]?.restrictProductCategories || false,
          allowedProductCategories: newUseCustomProdCats
            ? newAllowedProdCats
            : rolePermissions[newRole]?.allowedProductCategories || [],
        });
        setNewUsername('');
        setNewPassword('');
        setNewDisplayName('');
        setNewInfo('');
        setNewUseCustomTabs(false);
        setNewUseCustomProdCats(false);
        setNewAllowedTabs(
          rolePermissions[newRole]?.allowedTabs ||
            DEFAULT_ROLE_PERMISSIONS[newRole].allowedTabs
        );
      },
    });
  };

  const handleOpenEditAccount = (acc: StaffAccount) => {
    const eff = getEffectiveRolePermissions(acc, rolePermissions);
    setEditingAcc({
      ...acc,
      password: acc.username.toLowerCase() === 'admin' ? 'admin123' : acc.password,
      allowedTabs: eff.allowedTabs,
      useCustomTabs: Boolean(acc.useCustomTabs),
      useCustomProductCategories: Boolean(acc.useCustomProductCategories),
      restrictProductCategories: eff.restrictProductCategories,
      allowedProductCategories: eff.allowedProductCategories,
    });
  };

  const handleToggleEditingAccountTab = (tabId: ManagementTabId) => {
    if (!editingAcc) return;
    if (
      (editingAcc.username === 'admin' || editingAcc.role === UserRole.ADMIN) &&
      tabId === 'accounts'
    ) {
      return;
    }

    const currentTabs =
      editingAcc.allowedTabs && editingAcc.allowedTabs.length > 0
        ? editingAcc.allowedTabs
        : rolePermissions[editingAcc.role]?.allowedTabs || ['dashboard'];

    const exists = currentTabs.includes(tabId);
    let next = exists
      ? currentTabs.filter((t) => t !== tabId)
      : [...currentTabs, tabId];

    if (next.length === 0) {
      next = ['dashboard'];
    }
    if (
      (editingAcc.username === 'admin' || editingAcc.role === UserRole.ADMIN) &&
      !next.includes('accounts')
    ) {
      next.push('accounts');
    }

    const ordered = MANAGEMENT_TABS.map((m) => m.id).filter((id) =>
      next.includes(id)
    );

    setEditingAcc({
      ...editingAcc,
      allowedTabs: ordered,
      useCustomTabs: true,
    });
  };

  const handleToggleEditingAccountProdCat = (catName: string) => {
    if (!editingAcc) return;
    const wasRestricted = Boolean(editingAcc.restrictProductCategories);
    const currentCats = editingAcc.allowedProductCategories || [];

    let nextCats: string[];
    if (!wasRestricted) {
      nextCats = [catName];
    } else {
      const exists = currentCats.some(
        (c) => c.toLowerCase() === catName.toLowerCase()
      );
      nextCats = exists
        ? currentCats.filter((c) => c.toLowerCase() !== catName.toLowerCase())
        : [...currentCats, catName];
    }

    setEditingAcc({
      ...editingAcc,
      useCustomProductCategories: true,
      restrictProductCategories: true,
      allowedProductCategories: nextCats,
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAcc) return;
    const u = editingAcc.username.trim().toLowerCase();
    const p = u === 'admin' ? 'admin123' : editingAcc.password.trim();
    const d = editingAcc.displayName.trim();
    if (!u || !p || !d) return;

    const finalTabs =
      editingAcc.useCustomTabs &&
      editingAcc.allowedTabs &&
      editingAcc.allowedTabs.length > 0
        ? editingAcc.allowedTabs
        : rolePermissions[editingAcc.role]?.allowedTabs ||
          DEFAULT_ROLE_PERMISSIONS[editingAcc.role].allowedTabs;

    const tabLabels = MANAGEMENT_TABS.filter((t) => finalTabs.includes(t.id))
      .map((t) => t.shortLabel)
      .join(', ');

    requestConfirm({
      title: 'Xác nhận Cập Nhật Tài Khoản & Danh Mục Quản Lý',
      message: `Bạn có chắc chắn muốn lưu thay đổi cho tài khoản "@${u}" (${d}) — Role "${
        ROLE_LABELS[editingAcc.role]
      }", được phép truy cập ${finalTabs.length} danh mục quản lý (${tabLabels}) lên Firebase không?`,
      confirmLabel: 'Lưu thay đổi',
      variant: 'warning',
      onConfirm: async () => {
        await onUpdateAccount({
          ...editingAcc,
          username: u,
          password: p,
          displayName: d,
          info: editingAcc.info.trim(),
          allowedTabs: finalTabs,
          useCustomTabs: Boolean(editingAcc.useCustomTabs),
          useCustomProductCategories: Boolean(
            editingAcc.useCustomProductCategories
          ),
          restrictProductCategories: Boolean(
            editingAcc.restrictProductCategories
          ),
          allowedProductCategories: editingAcc.allowedProductCategories || [],
        });
        setEditingAcc(null);
      },
    });
  };

  const handleDeleteClick = (acc: StaffAccount) => {
    requestConfirm({
      title: 'Xác nhận Xóa Tài Khoản',
      message: `Bạn có chắc chắn muốn xóa tài khoản "@${acc.username}" (${acc.displayName}) khỏi hệ thống Firebase không?`,
      confirmLabel: 'Xóa tài khoản',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteAccount(acc.id);
      },
    });
  };

  const handleDeleteAllStaffClick = () => {
    const nonAdminCount = staffAccounts.filter(
      (a) => a.username !== 'admin' && a.id !== currentAccount.id
    ).length;
    if (nonAdminCount === 0) return;

    requestConfirm({
      title: 'Xác nhận Xóa Tất Cả Tài Khoản Nhân Viên Phụ',
      message: `Bạn có chắc chắn muốn xóa toàn bộ ${nonAdminCount} tài khoản nhân viên phụ (chỉ giữ lại tài khoản Admin đang đăng nhập) khỏi Firebase không?`,
      confirmLabel: 'Xóa tất cả nhân viên phụ',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteAllNonAdminAccounts();
      },
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Quản Lý Tài Khoản & Phân Quyền Danh Mục
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Phân phối các Tab quản lý và phân quyền chi tiết từng Danh mục món ăn được phép xem trong tab <strong>Số lượng theo Danh mục</strong> cho từng Role hoặc tài khoản.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDeleteAllStaffClick}
          className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer self-start sm:self-auto"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Xóa tài khoản phụ</span>
        </button>
      </div>

      {/* SECTION 1: ROLE-BASED MANAGEMENT TABS & PRODUCT CATEGORIES PERMISSION MATRIX */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-2.5">
            <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                1. Phân Quyền Theo Loại Tài Khoản (Role)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chọn các mục quản lý được truy cập và giới hạn danh mục món ăn được phép xem trong tab <strong>Số lượng theo Danh mục</strong> cho từng Role (Quản lý, Thu ngân, Kế toán, Kiểm kho).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 mr-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncRoleToAccounts}
                onChange={(e) => setSyncRoleToAccounts(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600"
              />
              <span>Đồng bộ ngay cho tài khoản cùng Role</span>
            </label>

            <button
              type="button"
              onClick={handleResetRoleMatrixClick}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Mặc định</span>
            </button>

            <button
              type="button"
              onClick={handleSaveRoleMatrixClick}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu Phân Quyền Role</span>
            </button>
          </div>
        </div>

        {/* Mobile Role Cards (< lg) */}
        <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ROLE_ORDER.map((roleKey) => {
            const cfg =
              draftRolePerms[roleKey] || DEFAULT_ROLE_PERMISSIONS[roleKey];
            const isAdminRole = roleKey === UserRole.ADMIN;
            return (
              <div
                key={roleKey}
                className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800 pb-2">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {ROLE_LABELS[roleKey]}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {cfg.allowedTabs.length}/{MANAGEMENT_TABS.length} mục quản lý
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isAdminRole ? true : cfg.canWrite}
                        disabled={isAdminRole}
                        onChange={(e) =>
                          handleToggleRoleCapability(
                            roleKey,
                            'canWrite',
                            e.target.checked
                          )
                        }
                        className="w-3.5 h-3.5 rounded text-emerald-600"
                      />
                      <span>Ghi/Sửa</span>
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isAdminRole ? true : cfg.canDelete}
                        disabled={isAdminRole}
                        onChange={(e) =>
                          handleToggleRoleCapability(
                            roleKey,
                            'canDelete',
                            e.target.checked
                          )
                        }
                        className="w-3.5 h-3.5 rounded text-rose-600"
                      />
                      <span>Xóa</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {MANAGEMENT_TABS.map((tab) => {
                    const checked = cfg.allowedTabs.includes(tab.id);
                    const isLockedAdminTab =
                      isAdminRole && tab.id === 'accounts';
                    return (
                      <label
                        key={tab.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors ${
                          checked
                            ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 text-slate-900 dark:text-white font-medium'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400'
                        } ${
                          isLockedAdminTab
                            ? 'opacity-80 cursor-not-allowed'
                            : 'cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isLockedAdminTab}
                          onChange={() => handleToggleRoleTab(roleKey, tab.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 shrink-0"
                        />
                        <span className="truncate text-[11px]">{tab.shortLabel}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Matrix Table (>= lg) */}
        <div className="hidden lg:block border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3 w-44">Loại tài khoản (Role)</th>
                {MANAGEMENT_TABS.map((tab) => (
                  <th key={tab.id} className="py-2.5 px-2 text-center">
                    <div className="text-slate-800 dark:text-slate-200 font-semibold">
                      {tab.shortLabel}
                    </div>
                  </th>
                ))}
                <th className="py-2.5 px-3 text-center">Quyền Dữ Liệu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {ROLE_ORDER.map((roleKey) => {
                const cfg =
                  draftRolePerms[roleKey] || DEFAULT_ROLE_PERMISSIONS[roleKey];
                const isAdminRole = roleKey === UserRole.ADMIN;
                return (
                  <tr
                    key={roleKey}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {ROLE_LABELS[roleKey]}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {cfg.allowedTabs.length}/{MANAGEMENT_TABS.length} mục
                      </div>
                    </td>

                    {MANAGEMENT_TABS.map((tab) => {
                      const checked = cfg.allowedTabs.includes(tab.id);
                      const isLockedAdminTab =
                        isAdminRole && tab.id === 'accounts';
                      return (
                        <td
                          key={tab.id}
                          className="py-3 px-2 text-center align-middle"
                        >
                          <label
                            className={`inline-flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl border transition-colors ${
                              checked
                                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900 text-slate-400'
                            } ${
                              isLockedAdminTab
                                ? 'opacity-80 cursor-not-allowed'
                                : 'cursor-pointer'
                            }`}
                            title={tab.description}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isLockedAdminTab}
                              onChange={() => handleToggleRoleTab(roleKey, tab.id)}
                              className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                            />
                            <span className="text-[10px] font-semibold">
                              {checked ? 'Mở' : 'Khóa'}
                            </span>
                          </label>
                        </td>
                      );
                    })}

                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-col items-start gap-1.5 text-[11px]">
                        <label
                          className={`inline-flex items-center gap-1.5 ${
                            isAdminRole ? 'opacity-80' : 'cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isAdminRole ? true : cfg.canWrite}
                            disabled={isAdminRole}
                            onChange={(e) =>
                              handleToggleRoleCapability(
                                roleKey,
                                'canWrite',
                                e.target.checked
                              )
                            }
                            className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600"
                          />
                          <span>Thêm / Sửa</span>
                        </label>
                        <label
                          className={`inline-flex items-center gap-1.5 ${
                            isAdminRole ? 'opacity-80' : 'cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isAdminRole ? true : cfg.canDelete}
                            disabled={isAdminRole}
                            onChange={(e) =>
                              handleToggleRoleCapability(
                                roleKey,
                                'canDelete',
                                e.target.checked
                              )
                            }
                            className="w-3.5 h-3.5 rounded border-slate-300 text-rose-600"
                          />
                          <span>Xóa</span>
                        </label>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* SUB-PANEL: GRANULAR PRODUCT CATEGORY PERMISSIONS FOR "SỐ LƯỢNG THEO DANH MỤC" TAB */}
        <div className="p-4 rounded-2xl border border-emerald-200/90 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-emerald-200/70 dark:border-emerald-900/50">
            <div className="flex items-start gap-2">
              <Filter className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                  Phân Quyền Xem Danh Mục Món Ăn Trong Tab &ldquo;Số Lượng Theo Danh Mục&rdquo; (Theo Role)
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Chọn cụ thể từng danh mục món ăn ({allProductCategories.length} nhóm hiện có: {allProductCategories.join(', ')}) mà mỗi Role được phép xem. Ví dụ: Role <strong>Kiểm kho</strong> chỉ tích chọn <strong>Nước ngọt</strong> và <strong>Bia / Đồ uống</strong> thì khi đăng nhập chỉ thấy đúng các danh mục đó.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveRoleMatrixClick}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto shadow-2xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu Phân Quyền Danh Mục</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {NON_ADMIN_ROLES.map((roleKey) => {
              const cfg =
                draftRolePerms[roleKey] || DEFAULT_ROLE_PERMISSIONS[roleKey];
              const isRestricted = Boolean(cfg.restrictProductCategories);
              const selectedCats = cfg.allowedProductCategories || [];
              const hasCategoryTabAccess = cfg.allowedTabs.includes('categories');

              return (
                <div
                  key={roleKey}
                  className="p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Role: {ROLE_LABELS[roleKey]}
                        </span>
                        {!hasCategoryTabAccess && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                            Tab Danh mục đang khóa
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {!isRestricted ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            Đang cho phép xem tất cả ({allProductCategories.length} danh mục)
                          </span>
                        ) : selectedCats.length > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            Giới hạn chỉ xem {selectedCats.length}/{allProductCategories.length} danh mục: {selectedCats.join(', ')}
                          </span>
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">
                            Đang giới hạn (Chưa tích chọn danh mục nào)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSetRoleCategoryMode(roleKey, false)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                          !isRestricted
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        Xem tất cả ({allProductCategories.length})
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleSetRoleCategoryMode(roleKey, true, [])
                        }
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                          isRestricted
                            ? 'border-amber-500 bg-amber-500 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                        }`}
                        title="Bấm để bỏ tích tất cả và chỉ chọn các danh mục cho phép Role này xem"
                      >
                        Chỉ chọn riêng
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {allProductCategories.map((catName) => {
                      const isChecked = !isRestricted
                        ? true
                        : selectedCats.some(
                            (c) => c.toLowerCase() === catName.toLowerCase()
                          );

                      return (
                        <label
                          key={catName}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all cursor-pointer select-none ${
                            isRestricted
                              ? isChecked
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-semibold shadow-2xs'
                                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-slate-400 hover:border-slate-300'
                              : 'border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/20 text-slate-700 dark:text-slate-200 hover:border-emerald-400'
                          }`}
                          title={
                            !isRestricted
                              ? `Bấm vào "${catName}" để chuyển sang chế độ chỉ xem riêng "${catName}"`
                              : `Bật/tắt quyền xem danh mục "${catName}" cho Role ${ROLE_LABELS[roleKey]}`
                          }
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              handleToggleRoleProductCategory(roleKey, catName)
                            }
                            className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600"
                          />
                          <span>{catName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 2: ADD NEW ACCOUNT WITH ROLE & MANAGEMENT TABS ASSIGNMENT */}
      <form
        onSubmit={handleAddSubmit}
        className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            2. Thêm Tài Khoản Nhân Sự Mới & Phân Danh Mục
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Username đăng nhập *
            </label>
            <input
              type="text"
              required
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Ví dụ: kiemkho_ca1"
              className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Mật khẩu *
              </label>
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                {showNewPassword ? (
                  <>
                    <EyeOff className="w-3 h-3" />
                    <span>Ẩn</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>Hiện</span>
                  </>
                )}
              </button>
            </div>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                value={
                  newUsername.trim().toLowerCase() === 'admin'
                    ? 'admin123'
                    : newPassword
                }
                readOnly={newUsername.trim().toLowerCase() === 'admin'}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nhập mật khẩu..."
                className="w-full pl-3 pr-9 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                title={
                  showNewPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu để kiểm tra'
                }
              >
                {showNewPassword ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tên hiển thị *
            </label>
            <input
              type="text"
              required
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Ví dụ: Nguyễn Văn A"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Thông tin (SĐT, Ca trực)
            </label>
            <input
              type="text"
              value={newInfo}
              onChange={(e) => setNewInfo(e.target.value)}
              placeholder="SĐT: 0909... - Ca tối"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Vai trò (Role)
            </label>
            <select
              value={newRole}
              onChange={(e) => {
                const selectedRole = e.target.value as UserRole;
                const roleCfg =
                  rolePermissions[selectedRole] ||
                  DEFAULT_ROLE_PERMISSIONS[selectedRole];
                setNewRole(selectedRole);
                setNewUseCustomTabs(false);
                setNewAllowedTabs(roleCfg.allowedTabs);
                setNewUseCustomProdCats(false);
                setNewRestrictProdCats(Boolean(roleCfg.restrictProductCategories));
                setNewAllowedProdCats(roleCfg.allowedProductCategories || []);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value={UserRole.ADMIN}>Chủ quán (Admin)</option>
              <option value={UserRole.MANAGER}>Quản lý</option>
              <option value={UserRole.CASHIER}>Thu ngân</option>
              <option value={UserRole.VIEWER}>Kế toán (Chỉ xem)</option>
              <option value={UserRole.INVENTORY}>Kiểm kho</option>
            </select>
          </div>
        </div>

        {/* Selectable Management Tabs for the New Account */}
        <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>
                Mục quản lý được phép truy cập ({newAllowedTabs.length}/{MANAGEMENT_TABS.length}):
              </span>
            </div>

            {newUseCustomTabs && (
              <button
                type="button"
                onClick={() => {
                  setNewUseCustomTabs(false);
                  setNewAllowedTabs(
                    rolePermissions[newRole]?.allowedTabs ||
                      DEFAULT_ROLE_PERMISSIONS[newRole].allowedTabs
                  );
                }}
                className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Đặt lại mặc định theo Role ({ROLE_LABELS[newRole]})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {MANAGEMENT_TABS.map((tab) => {
              const checked = newAllowedTabs.includes(tab.id);
              const locked =
                newRole === UserRole.ADMIN && tab.id === 'accounts';
              return (
                <label
                  key={tab.id}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs transition-colors ${
                    checked
                      ? 'border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/40 text-slate-400'
                  } ${locked ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={() => handleToggleNewAccountTab(tab.id)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                  />
                  <span className="truncate">{tab.label}</span>
                </label>
              );
            })}
          </div>

          {/* Per-Account Product Category Filter when 'categories' tab is enabled */}
          {newRole !== UserRole.ADMIN && newAllowedTabs.includes('categories') && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Danh mục món được xem trong tab &ldquo;Số lượng theo Danh mục&rdquo;:
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const roleCfg =
                        rolePermissions[newRole] ||
                        DEFAULT_ROLE_PERMISSIONS[newRole];
                      setNewUseCustomProdCats(false);
                      setNewRestrictProdCats(
                        Boolean(roleCfg.restrictProductCategories)
                      );
                      setNewAllowedProdCats(
                        roleCfg.allowedProductCategories || []
                      );
                    }}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                      !newUseCustomProdCats
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Theo Role ({ROLE_LABELS[newRole]})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewUseCustomProdCats(true);
                      setNewRestrictProdCats(false);
                      setNewAllowedProdCats([]);
                    }}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                      newUseCustomProdCats && !newRestrictProdCats
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Xem tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewUseCustomProdCats(true);
                      setNewRestrictProdCats(true);
                      setNewAllowedProdCats([]);
                    }}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                      newUseCustomProdCats && newRestrictProdCats
                        ? 'border-amber-500 bg-amber-500 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Chỉ chọn riêng
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {allProductCategories.map((catName) => {
                  const checked = !newRestrictProdCats
                    ? true
                    : newAllowedProdCats.some(
                        (c) => c.toLowerCase() === catName.toLowerCase()
                      );
                  return (
                    <label
                      key={catName}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer ${
                        newRestrictProdCats
                          ? checked
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-semibold'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400'
                          : 'border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleNewAccountProdCat(catName)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600"
                      />
                      <span>{catName}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="w-full sm:w-auto justify-center px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm tài khoản mới</span>
          </button>
        </div>
      </form>

      {/* Edit Account Modal / Drawer */}
      {editingAcc && (
        <div className="p-4 sm:p-5 border-2 border-emerald-500/60 rounded-2xl bg-emerald-50/20 dark:bg-emerald-950/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Sửa Tài khoản & Phân quyền Danh mục: @{editingAcc.username}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setEditingAcc(null)}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tên đăng nhập (Username)
                </label>
                <input
                  type="text"
                  required
                  disabled={editingAcc.username.toLowerCase() === 'admin'}
                  value={editingAcc.username}
                  onChange={(e) =>
                    setEditingAcc({ ...editingAcc, username: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white disabled:opacity-60"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {editingAcc.username.toLowerCase() === 'admin'
                      ? 'Mật khẩu Admin (Cố định)'
                      : 'Mật khẩu (Password)'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowEditPassword((prev) => !prev)}
                    className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    {showEditPassword ? (
                      <>
                        <EyeOff className="w-3 h-3" />
                        <span>Ẩn</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" />
                        <span>Hiện</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    required
                    disabled={editingAcc.username.toLowerCase() === 'admin'}
                    value={
                      editingAcc.username.toLowerCase() === 'admin'
                        ? 'admin123'
                        : editingAcc.password
                    }
                    onChange={(e) =>
                      setEditingAcc({
                        ...editingAcc,
                        password:
                          editingAcc.username.toLowerCase() === 'admin'
                            ? 'admin123'
                            : e.target.value,
                      })
                    }
                    className="w-full pl-3 pr-9 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    title={
                      showEditPassword
                        ? 'Ẩn mật khẩu'
                        : 'Hiện mật khẩu để kiểm tra'
                    }
                  >
                    {showEditPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tên hiển thị
                </label>
                <input
                  type="text"
                  required
                  value={editingAcc.displayName}
                  onChange={(e) =>
                    setEditingAcc({ ...editingAcc, displayName: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Thông tin tài khoản (SĐT, Ca trực, Ghi chú)
                </label>
                <input
                  type="text"
                  value={editingAcc.info || ''}
                  onChange={(e) =>
                    setEditingAcc({ ...editingAcc, info: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Vai trò (Role)
                </label>
                <select
                  value={editingAcc.role}
                  onChange={(e) => {
                    const nextRole = e.target.value as UserRole;
                    const roleCfg =
                      rolePermissions[nextRole] ||
                      DEFAULT_ROLE_PERMISSIONS[nextRole];
                    setEditingAcc({
                      ...editingAcc,
                      role: nextRole,
                      allowedTabs: editingAcc.useCustomTabs
                        ? editingAcc.allowedTabs
                        : roleCfg.allowedTabs,
                      restrictProductCategories:
                        editingAcc.useCustomProductCategories
                          ? editingAcc.restrictProductCategories
                          : Boolean(roleCfg.restrictProductCategories),
                      allowedProductCategories:
                        editingAcc.useCustomProductCategories
                          ? editingAcc.allowedProductCategories
                          : roleCfg.allowedProductCategories || [],
                    });
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value={UserRole.ADMIN}>Chủ quán (Admin)</option>
                  <option value={UserRole.MANAGER}>Quản lý</option>
                  <option value={UserRole.CASHIER}>Thu ngân</option>
                  <option value={UserRole.VIEWER}>Kế toán (Chỉ xem)</option>
                  <option value={UserRole.INVENTORY}>Kiểm kho</option>
                </select>
              </div>
            </div>

            {/* Per-Account Management Tabs Assignment */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Mục quản lý được phép truy cập cho @{editingAcc.username}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const roleTabs =
                        rolePermissions[editingAcc.role]?.allowedTabs ||
                        DEFAULT_ROLE_PERMISSIONS[editingAcc.role].allowedTabs;
                      setEditingAcc({
                        ...editingAcc,
                        allowedTabs: roleTabs,
                        useCustomTabs: false,
                      });
                    }}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                      !editingAcc.useCustomTabs
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Theo mặc định Role ({ROLE_LABELS[editingAcc.role]})
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditingAcc({
                        ...editingAcc,
                        allowedTabs: MANAGEMENT_TABS.map((t) => t.id),
                        useCustomTabs: true,
                      })
                    }
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Chọn tất cả
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {MANAGEMENT_TABS.map((tab) => {
                  const activeList =
                    editingAcc.useCustomTabs &&
                    editingAcc.allowedTabs &&
                    editingAcc.allowedTabs.length > 0
                      ? editingAcc.allowedTabs
                      : rolePermissions[editingAcc.role]?.allowedTabs ||
                        DEFAULT_ROLE_PERMISSIONS[editingAcc.role].allowedTabs;
                  const checked = activeList.includes(tab.id);
                  const locked =
                    (editingAcc.username === 'admin' ||
                      editingAcc.role === UserRole.ADMIN) &&
                    tab.id === 'accounts';

                  return (
                    <label
                      key={tab.id}
                      className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs transition-colors ${
                        checked
                          ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/30 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-slate-400'
                      } ${
                        locked ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        onChange={() => handleToggleEditingAccountTab(tab.id)}
                        className="w-4 h-4 mt-0.5 rounded border-slate-300 text-emerald-600"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{tab.label}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Per-account Product Category Permissions in Edit Drawer */}
              {editingAcc.username.toLowerCase() !== 'admin' &&
                editingAcc.role !== UserRole.ADMIN && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          Phân quyền xem Danh mục món trong tab &ldquo;Số lượng theo Danh mục&rdquo;
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {!editingAcc.restrictProductCategories
                            ? `Đang xem tất cả (${allProductCategories.length} danh mục)`
                            : `Chỉ xem ${(editingAcc.allowedProductCategories || []).length}/${allProductCategories.length} danh mục đã chọn`}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const roleCfg =
                              rolePermissions[editingAcc.role] ||
                              DEFAULT_ROLE_PERMISSIONS[editingAcc.role];
                            setEditingAcc({
                              ...editingAcc,
                              useCustomProductCategories: false,
                              restrictProductCategories: Boolean(
                                roleCfg.restrictProductCategories
                              ),
                              allowedProductCategories:
                                roleCfg.allowedProductCategories || [],
                            });
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                            !editingAcc.useCustomProductCategories
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Theo Role ({ROLE_LABELS[editingAcc.role]})
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingAcc({
                              ...editingAcc,
                              useCustomProductCategories: true,
                              restrictProductCategories: false,
                              allowedProductCategories: [],
                            })
                          }
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                            editingAcc.useCustomProductCategories &&
                            !editingAcc.restrictProductCategories
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Xem tất cả
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingAcc({
                              ...editingAcc,
                              useCustomProductCategories: true,
                              restrictProductCategories: true,
                              allowedProductCategories: [],
                            })
                          }
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                            editingAcc.useCustomProductCategories &&
                            editingAcc.restrictProductCategories
                              ? 'border-amber-500 bg-amber-500 text-white'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Chỉ chọn riêng
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {allProductCategories.map((catName) => {
                        const checked = !editingAcc.restrictProductCategories
                          ? true
                          : (editingAcc.allowedProductCategories || []).some(
                              (c) => c.toLowerCase() === catName.toLowerCase()
                            );
                        return (
                          <label
                            key={catName}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                              editingAcc.restrictProductCategories
                                ? checked
                                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-semibold'
                                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900 text-slate-400'
                                : 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/20 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                handleToggleEditingAccountProdCat(catName)
                              }
                              className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600"
                            />
                            <span>{catName}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingAcc.active}
                  onChange={(e) =>
                    setEditingAcc({ ...editingAcc, active: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                />
                <span>Cho phép tài khoản này hoạt động</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAcc(null)}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu thay đổi</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* SECTION 3: ACCOUNTS LIST */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            3. Danh Sách Tài Khoản & Quyền Danh Mục Hiện Tại ({staffAccounts.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mật khẩu tài khoản <strong>admin</strong> được cố định là{' '}
            <code className="font-mono font-bold text-emerald-600">admin123</code>.
          </p>
        </div>

        {/* Mobile Account Cards (< md) */}
        <div className="md:hidden space-y-3">
          {staffAccounts.map((acc) => {
            const isCurrent = acc.id === currentAccount.id;
            const isPrimaryAdmin = acc.username.toLowerCase() === 'admin';
            const showPw = isPrimaryAdmin ? true : !!visiblePasswords[acc.id];
            const eff = getEffectiveRolePermissions(acc, rolePermissions);
            const allowedMetas = MANAGEMENT_TABS.filter((t) =>
              eff.allowedTabs.includes(t.id)
            );

            return (
              <div
                key={acc.id}
                className={`p-3.5 rounded-xl border space-y-2.5 text-xs ${
                  isCurrent
                    ? 'border-emerald-500/60 bg-emerald-50/30 dark:bg-emerald-950/20'
                    : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{acc.displayName}</span>
                      {isCurrent && (
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          (Đang dùng)
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-slate-500">
                      @{acc.username} · {ROLE_LABELS[acc.role]}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 font-mono bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-700 dark:text-slate-200">
                      {isPrimaryAdmin
                        ? 'admin123'
                        : showPw
                        ? acc.password
                        : '••••••••'}
                    </span>
                    {!isPrimaryAdmin && (
                      <button
                        type="button"
                        onClick={() => toggleShowPassword(acc.id)}
                        className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        {showPw ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 space-y-1">
                  <div>
                    <strong className="text-slate-700 dark:text-slate-300">
                      Mục quản lý ({allowedMetas.length}/{MANAGEMENT_TABS.length}):
                    </strong>{' '}
                    {allowedMetas.map((m) => m.shortLabel).join(' · ')}
                  </div>
                  {eff.allowedTabs.includes('categories') && (
                    <div>
                      <strong className="text-slate-700 dark:text-slate-300">
                        Tab SL theo Danh mục:
                      </strong>{' '}
                      {eff.restrictProductCategories ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          Chỉ xem {eff.allowedProductCategories.length} nhóm (
                          {eff.allowedProductCategories.length > 0
                            ? eff.allowedProductCategories.join(', ')
                            : 'Chưa chọn'}
                          )
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Xem tất cả ({allProductCategories.length} nhóm)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => onSwitchAccount(acc)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Đổi sang</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenEditAccount(acc)}
                    className="px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Phân mục & Sửa</span>
                  </button>
                  {!isPrimaryAdmin && !isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(acc)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3">Tài khoản</th>
                <th className="py-2.5 px-3">Mật khẩu</th>
                <th className="py-2.5 px-3">Role & Quyền</th>
                <th className="py-2.5 px-3">Các Mục & Danh Mục Món Được Xem</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {staffAccounts.map((acc) => {
                const isCurrent = acc.id === currentAccount.id;
                const isPrimaryAdmin = acc.username.toLowerCase() === 'admin';
                const showPw = isPrimaryAdmin ? true : !!visiblePasswords[acc.id];
                const eff = getEffectiveRolePermissions(acc, rolePermissions);
                const allowedMetas = MANAGEMENT_TABS.filter((t) =>
                  eff.allowedTabs.includes(t.id)
                );

                return (
                  <tr
                    key={acc.id}
                    className={
                      isCurrent
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }
                  >
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{acc.displayName}</span>
                        {isCurrent && (
                          <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                            (Đang dùng)
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-slate-500">@{acc.username}</div>
                    </td>

                    <td className="py-3 px-3 font-mono">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="text-slate-800 dark:text-slate-200">
                          {isPrimaryAdmin
                            ? 'admin123'
                            : showPw
                            ? acc.password
                            : '••••••••'}
                        </span>
                        {isPrimaryAdmin ? (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans font-medium inline-flex items-center gap-0.5">
                            <Lock className="w-3 h-3" />
                            Cố định
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleShowPassword(acc.id)}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                          >
                            {showPw ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {ROLE_LABELS[acc.role]}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {eff.canWrite ? 'Được Ghi/Sửa' : 'Chỉ xem'} ·{' '}
                        {eff.canDelete ? 'Được Xóa' : 'Không xóa'}
                      </div>
                    </td>

                    <td className="py-3 px-3 max-w-md space-y-1">
                      <div>
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          {allowedMetas.length}/{MANAGEMENT_TABS.length} mục quản lý
                          {eff.isCustomAccountTabs ? ' (Tùy chỉnh)' : ' (Theo Role)'}:
                        </span>{' '}
                        <span className="text-[11px] text-slate-600 dark:text-slate-300">
                          {allowedMetas.map((m) => m.shortLabel).join(' · ')}
                        </span>
                      </div>
                      {eff.allowedTabs.includes('categories') && (
                        <div className="text-[11px]">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            Xem SL theo Danh mục:
                          </span>{' '}
                          {eff.restrictProductCategories ? (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                              Chỉ xem {eff.allowedProductCategories.length} nhóm (
                              {eff.allowedProductCategories.length > 0
                                ? eff.allowedProductCategories.join(', ')
                                : 'Chưa chọn nhóm nào'}
                              )
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Tất cả ({allProductCategories.length} nhóm)
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => onSwitchAccount(acc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Đổi sang</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenEditAccount(acc)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Phân mục & Sửa</span>
                      </button>

                      {!isPrimaryAdmin && !isCurrent && (
                        <button
                          type="button"
                          onClick={() => handleDeleteClick(acc)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
