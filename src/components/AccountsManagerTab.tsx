import React, { useState } from 'react';
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
} from 'lucide-react';
import {
  StaffAccount,
  UserRole,
  ROLE_LABELS,
  ConfirmRequestOptions,
} from '../types';

interface AccountsManagerTabProps {
  staffAccounts: StaffAccount[];
  currentAccount: StaffAccount;
  onCreateAccount: (acc: Omit<StaffAccount, 'id'>) => Promise<void>;
  onUpdateAccount: (acc: StaffAccount) => Promise<void>;
  onDeleteAccount: (id: string) => Promise<void>;
  onDeleteAllNonAdminAccounts: () => Promise<void>;
  onSwitchAccount: (acc: StaffAccount) => void;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

export const AccountsManagerTab: React.FC<AccountsManagerTabProps> = ({
  staffAccounts,
  currentAccount,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
  onDeleteAllNonAdminAccounts,
  onSwitchAccount,
  requestConfirm,
}) => {
  // New Account Form State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newInfo, setNewInfo] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.CASHIER);

  // Edit Account State
  const [editingAcc, setEditingAcc] = useState<StaffAccount | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  const toggleShowPassword = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = newUsername.trim().toLowerCase();
    const p = newPassword.trim();
    const d = newDisplayName.trim();
    if (!u || !p || !d) return;

    requestConfirm({
      title: 'Xác nhận Thêm Tài Khoản Mới',
      message: `Bạn có chắc chắn muốn tạo tài khoản mới "@${u}" (${d}) với quyền "${ROLE_LABELS[newRole]}" và lưu vào Firebase không?`,
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
        });
        setNewUsername('');
        setNewPassword('');
        setNewDisplayName('');
        setNewInfo('');
      },
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAcc) return;
    const u = editingAcc.username.trim().toLowerCase();
    const p = editingAcc.password.trim();
    const d = editingAcc.displayName.trim();
    if (!u || !p || !d) return;

    requestConfirm({
      title: 'Xác nhận Cập Nhật Tài Khoản',
      message: `Bạn có chắc chắn muốn lưu thay đổi thông tin, tên hiển thị và mật khẩu cho tài khoản "@${u}" (${d}) lên Firebase không?`,
      confirmLabel: 'Lưu thay đổi',
      variant: 'warning',
      onConfirm: async () => {
        await onUpdateAccount({
          ...editingAcc,
          username: u,
          password: p,
          displayName: d,
          info: editingAcc.info.trim(),
        });
        setEditingAcc(null);
      },
    });
  };

  const handleDeleteClick = (acc: StaffAccount) => {
    requestConfirm({
      title: 'Xác nhận Xóa Tài Khoản',
      message: `Bạn có chắc chắn muốn xóa tài khoản "@${acc.username}" (${acc.displayName}) khỏi hệ thống Firebase không? Hành động này không thể hoàn tác.`,
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
    <div className="space-y-6">
      {/* Header */}
      <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Quản Lý Tài Khoản & Phân Quyền Hệ Thống (Admin)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tùy chỉnh mật khẩu (Password), tên hiển thị, thông tin liên hệ và vai trò phân quyền cho từng tài khoản. Dữ liệu đồng bộ trực tiếp lên Firebase.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDeleteAllStaffClick}
          className="px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer self-start sm:self-auto"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Xóa tất cả tài khoản phụ</span>
        </button>
      </div>

      {/* Add New Account Card */}
      <form
        onSubmit={handleAddSubmit}
        className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-4"
      >
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Thêm tài khoản nhân sự / phân quyền mới
          </h3>
          <span className="text-xs text-slate-500">
            Yêu cầu xác nhận trước khi lưu vào Firebase
          </span>
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
              placeholder="Ví dụ: thungan_ca1"
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Mật khẩu (Password) *
            </label>
            <input
              type="text"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
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
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Thông tin (SĐT, Ca, Ghi chú)
            </label>
            <input
              type="text"
              value={newInfo}
              onChange={(e) => setNewInfo(e.target.value)}
              placeholder="SĐT: 0909... - Ca tối"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Vai trò phân quyền
            </label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value={UserRole.ADMIN}>Chủ quán (Admin)</option>
              <option value={UserRole.MANAGER}>Quản lý</option>
              <option value={UserRole.CASHIER}>Thu ngân</option>
              <option value={UserRole.VIEWER}>Kế toán (Chỉ xem)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm tài khoản mới</span>
          </button>
        </div>
      </form>

      {/* Edit Account Modal / Drawer if an account is being edited */}
      {editingAcc && (
        <div className="p-5 border-2 border-emerald-500/60 rounded-xl bg-emerald-50/20 dark:bg-emerald-950/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Tùy chỉnh Tài khoản: @{editingAcc.username}
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
                  value={editingAcc.username}
                  onChange={(e) =>
                    setEditingAcc({ ...editingAcc, username: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Mật khẩu mới (Password)
                </label>
                <input
                  type="text"
                  required
                  value={editingAcc.password}
                  onChange={(e) =>
                    setEditingAcc({ ...editingAcc, password: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tên hiển thị (Display Name)
                </label>
                <input
                  type="text"
                  required
                  value={editingAcc.displayName}
                  onChange={(e) =>
                    setEditingAcc({ ...editingAcc, displayName: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Thông tin tài khoản (Số điện thoại, Ca trực, Ghi chú)
                </label>
                <input
                  type="text"
                  value={editingAcc.info || ''}
                  onChange={(e) =>
                    setEditingAcc({ ...editingAcc, info: e.target.value })
                  }
                  placeholder="Nhập số điện thoại, ca làm việc, địa chỉ hoặc ghi chú..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Vai trò phân quyền
                </label>
                <select
                  value={editingAcc.role}
                  onChange={(e) =>
                    setEditingAcc({
                      ...editingAcc,
                      role: e.target.value as UserRole,
                    })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value={UserRole.ADMIN}>Chủ quán (Admin)</option>
                  <option value={UserRole.MANAGER}>Quản lý</option>
                  <option value={UserRole.CASHIER}>Thu ngân</option>
                  <option value={UserRole.VIEWER}>Kế toán (Chỉ xem)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingAcc.active}
                  onChange={(e) =>
                    setEditingAcc({ ...editingAcc, active: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                />
                <span>Cho phép tài khoản này đăng nhập hoạt động</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAcc(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu thay đổi tài khoản</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Accounts List Table */}
      <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Danh Sách Tài Khoản Trên Hệ Thống ({staffAccounts.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Bấm "Tùy chỉnh" để đổi mật khẩu, tên hiển thị, thông tin hoặc quyền hạn cho bất kỳ tài khoản nào
          </p>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px] text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3">Username</th>
                <th className="py-2.5 px-3">Mật khẩu (Password)</th>
                <th className="py-2.5 px-3">Tên hiển thị</th>
                <th className="py-2.5 px-3">Thông tin chi tiết</th>
                <th className="py-2.5 px-3">Vai trò phân quyền</th>
                <th className="py-2.5 px-3">Trạng thái</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {staffAccounts.map((acc) => {
                const isShown = Boolean(visiblePasswords[acc.id]);
                const isCurrent = acc.username === currentAccount.username;
                return (
                  <tr
                    key={acc.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                      @{acc.username}
                    </td>
                    <td className="py-3 px-3 font-mono">
                      <div className="inline-flex items-center gap-2">
                        <span className="text-slate-800 dark:text-slate-200">
                          {isShown ? acc.password : '••••••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleShowPassword(acc.id)}
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                          title={isShown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        >
                          {isShown ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                      {acc.displayName}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-xs">
                      {acc.info || '—'}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700 dark:text-slate-300">
                      {ROLE_LABELS[acc.role]}
                    </td>
                    <td className="py-3 px-3">
                      {acc.active ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Hoạt động
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400 font-medium">
                          Đã khóa
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingAcc({ ...acc })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Tùy chỉnh / Sửa</span>
                      </button>

                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => onSwitchAccount(acc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                          title="Chuyển phiên làm việc sang tài khoản này"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Chuyển</span>
                        </button>
                      )}

                      {acc.username !== 'admin' && !isCurrent && (
                        <button
                          type="button"
                          onClick={() => handleDeleteClick(acc)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer align-middle"
                          title="Xóa tài khoản"
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
