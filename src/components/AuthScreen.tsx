import React, { useState } from 'react';
import {
  Lock,
  User,
  LogIn,
  ShieldCheck,
  Sun,
  Moon,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Receipt,
} from 'lucide-react';
import { StaffAccount, UserRole, DEFAULT_ROLE_PERMISSIONS } from '../types';
import {
  FIXED_ADMIN_USERNAME,
  FIXED_ADMIN_PASSWORD,
} from '../services/dataService';

interface AuthScreenProps {
  staffAccounts: StaffAccount[];
  onLoginSuccess: (account: StaffAccount) => void;
  onGoogleLogin: () => Promise<void>;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  authError: string | null;
  onSwitchToGamification?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  staffAccounts,
  onLoginSuccess,
  onGoogleLogin,
  darkMode,
  onToggleDarkMode,
  authError,
  onSwitchToGamification,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const trimmedUser = username.trim().toLowerCase();

    // Admin account has a permanently fixed password: admin123
    if (trimmedUser === FIXED_ADMIN_USERNAME) {
      if (password !== FIXED_ADMIN_PASSWORD) {
        setLocalError(
          'Mật khẩu tài khoản Admin không chính xác. Vui lòng bấm nút "Hiện" để kiểm tra lại mật khẩu vừa nhập.'
        );
        return;
      }

      const existingAdmin = staffAccounts.find(
        (acc) =>
          acc.username.toLowerCase() === FIXED_ADMIN_USERNAME ||
          acc.id === 'staff_admin'
      );

      const adminAccount: StaffAccount = existingAdmin
        ? {
            ...existingAdmin,
            username: FIXED_ADMIN_USERNAME,
            password: FIXED_ADMIN_PASSWORD,
            role: UserRole.ADMIN,
            active: true,
            allowedTabs:
              existingAdmin.allowedTabs && existingAdmin.allowedTabs.length > 0
                ? Array.from(
                    new Set([
                      ...existingAdmin.allowedTabs,
                      ...DEFAULT_ROLE_PERMISSIONS[UserRole.ADMIN].allowedTabs,
                    ])
                  )
                : DEFAULT_ROLE_PERMISSIONS[UserRole.ADMIN].allowedTabs,
          }
        : {
            id: 'staff_admin',
            username: FIXED_ADMIN_USERNAME,
            password: FIXED_ADMIN_PASSWORD,
            displayName: 'Chủ Quán (Admin)',
            info: 'Quản trị viên cao nhất — Toàn quyền hệ thống',
            role: UserRole.ADMIN,
            active: true,
            allowedTabs: DEFAULT_ROLE_PERMISSIONS[UserRole.ADMIN].allowedTabs,
            useCustomTabs: false,
          };

      onLoginSuccess(adminAccount);
      return;
    }

    const matched = staffAccounts.find(
      (acc) =>
        acc.active &&
        acc.username.toLowerCase() === trimmedUser &&
        acc.password === password
    );

    if (!matched) {
      setLocalError(
        'Tên đăng nhập hoặc mật khẩu không chính xác. Bạn có thể bấm nút "Hiện" ở ô mật khẩu để kiểm tra lại.'
      );
      return;
    }

    onLoginSuccess(matched);
  };

  const handleGoogleClick = async () => {
    setLocalError(null);
    setIsSubmitting(true);
    try {
      await onGoogleLogin();
    } catch (err: any) {
      setLocalError(err?.message || 'Đăng nhập Google thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 flex flex-col justify-between">
      {/* Top Bar Contract */}
      <header className="h-16 px-4 sm:px-8 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <Receipt className="w-5 h-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            VQBill
          </span>
        </div>

        <div className="hidden md:flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>Quét Bill AI OCR</span>
          <span>·</span>
          <span>Đối soát Doanh thu & Danh mục</span>
          <span>·</span>
          <span>Quản lý Công nợ & Phân quyền</span>
        </div>

        <div className="flex items-center gap-2">
          {onSwitchToGamification && (
            <button
              type="button"
              onClick={onSwitchToGamification}
              className="h-10 px-3.5 sm:px-4 text-xs font-black rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 text-white shadow-md inline-flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
              title="Mở Mini Game, Vòng Quay May Mắn & Mẹo Phong Thủy Vịnh Quán"
            >
              <span className="text-sm">🎡</span>
              <span className="hidden sm:inline">Chơi Mini Game & Phong Thủy</span>
              <span className="sm:hidden">Mini Game</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleDarkMode}
            className="h-10 px-3.5 text-xs font-medium border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
            <span className="hidden sm:inline">
              {darkMode ? 'Giao diện Sáng' : 'Giao diện Tối'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 border border-slate-200/90 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          {/* Left Panel: Login Form (First on Mobile for immediate thumb reach) */}
          <div className="lg:col-span-6 p-6 sm:p-10 flex flex-col justify-center order-1 lg:order-2">
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Hệ thống Quản lý & Đối soát Hóa đơn</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Đăng nhập VQBill
              </h1>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Nhập tài khoản được Admin phân quyền hoặc đăng nhập qua Google Cloud.
              </p>
            </div>

            {(localError || authError) && (
              <div className="mb-5 p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{localError || authError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên đăng nhập (Username)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Nhập username (VD: admin)..."
                    className="w-full h-11 pl-10 pr-4 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Mật khẩu (Password)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    {showPassword ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Ẩn mật khẩu</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>Hiện mật khẩu</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu..."
                    className="w-full h-11 pl-10 pr-20 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-slate-200/70 dark:bg-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-700 inline-flex items-center gap-1 transition-colors cursor-pointer"
                    title={
                      showPassword
                        ? 'Ẩn mật khẩu'
                        : 'Hiển thị mật khẩu để kiểm tra xem đã nhập đúng chưa'
                    }
                  >
                    {showPassword ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Ẩn</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>Hiện</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
              >
                <LogIn className="w-4 h-4" />
                <span>Đăng nhập vào hệ thống</span>
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span className="text-[11px] font-medium text-slate-400">
                HOẶC ĐỒNG BỘ GOOGLE CLOUD
              </span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleGoogleClick}
              className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                {isSubmitting
                  ? 'Đang kết nối Firebase...'
                  : 'Đăng nhập với Google (Firebase Auth)'}
              </span>
            </button>

            {onSwitchToGamification && (
              <div
                onClick={onSwitchToGamification}
                className="mt-5 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 hover:border-amber-300 transition-all cursor-pointer shadow-xs flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl group-hover:scale-110 transition-transform">🎡</span>
                  <div>
                    <div className="text-xs font-black text-amber-900 dark:text-amber-200">
                      Ghé Khu Vui Chơi & Vòng Quay May Mắn
                    </div>
                    <div className="text-[11px] text-amber-700 dark:text-amber-400">
                      Mẹo phong thủy, câu chúc ngày mới & sơ đồ bàn 2D
                    </div>
                  </div>
                </div>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0 group-hover:translate-x-1 transition-transform">
                  Vào chơi →
                </span>
              </div>
            )}
          </div>

          {/* Right Panel: Brand Overview */}
          <div className="lg:col-span-6 p-6 sm:p-10 bg-slate-900 text-slate-100 flex flex-col justify-between border-t lg:border-t-0 lg:border-r border-slate-800 order-2 lg:order-1">
            <div className="space-y-6">
              <div>
                <span className="text-xs font-mono text-emerald-400">
                  01. NỀN TẢNG QUẢN TRỊ DOANH THU & BILL OCR
                </span>
                <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-white leading-snug">
                  Tự động hóa quy trình nhập Bill, thống kê Danh mục & kiểm soát Công nợ
                </h2>
                <p className="mt-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Thiết kế tối ưu cho cả máy tính và điện thoại di động. Chụp ảnh hóa đơn bằng camera điện thoại, nhận diện món ăn tự động bằng Gemini AI và đối soát dòng tiền thực nhận theo thời gian thực.
                </p>
              </div>

              <div className="space-y-3.5 pt-4 border-t border-slate-800/90 text-xs sm:text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Quét ảnh hóa đơn & văn bản sang cấu trúc JSON chuẩn, tự động cộng lũy kế số lượng bán theo từng nhóm hàng.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Tự động tính <strong>Tổng ngày = Tiền mặt + Chuyển khoản - Khoản trừ - Công nợ</strong> chính xác tuyệt đối.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    Phân quyền chi tiết danh mục quản lý theo từng Role (Admin, Quản lý, Thu ngân, Kế toán) và từng tài khoản nhân sự.
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Đồng bộ thời gian thực trên Firebase Cloud</span>
              </span>
              <span className="font-mono text-slate-500">Responsive Mobile & Desktop</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-4 sm:px-8 py-4 border-t border-slate-200/80 dark:border-slate-800/80 text-center text-xs text-slate-500 dark:text-slate-400">
        VQBill — Hệ thống quản lý hóa đơn bán hàng, phân loại danh mục & đối soát doanh thu.
      </footer>
    </div>
  );
};
