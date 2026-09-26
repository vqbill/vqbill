import React, { useState } from 'react';
import { Lock, User, LogIn, ShieldCheck, Sun, Moon, AlertCircle, CheckCircle2 } from 'lucide-react';
import { StaffAccount } from '../types';

interface AuthScreenProps {
  staffAccounts: StaffAccount[];
  onLoginSuccess: (account: StaffAccount) => void;
  onGoogleLogin: () => Promise<void>;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  authError: string | null;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  staffAccounts,
  onLoginSuccess,
  onGoogleLogin,
  darkMode,
  onToggleDarkMode,
  authError,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const trimmedUser = username.trim().toLowerCase();
    const matched = staffAccounts.find(
      (acc) =>
        acc.active &&
        acc.username.toLowerCase() === trimmedUser &&
        acc.password === password
    );

    if (!matched) {
      setLocalError('Tên đăng nhập hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.');
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
          VQBill
        </span>
        <div className="hidden md:flex items-center gap-6 text-sm text-slate-500 dark:text-slate-400">
          <span>Trích xuất Bill AI OCR</span>
          <span>·</span>
          <span>Quản lý Doanh thu & Danh mục</span>
          <span>·</span>
          <span>Công nợ & Khoản trừ</span>
        </div>
        <button
          type="button"
          onClick={onToggleDarkMode}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
        >
          {darkMode ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
          <span>{darkMode ? 'Giao diện Sáng' : 'Giao diện Tối'}</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          {/* Left Panel: System Overview */}
          <div className="lg:col-span-6 p-6 sm:p-8 bg-slate-900 text-slate-100 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-mono text-emerald-400 tracking-wider">
                  HỆ THỐNG QUẢN LÝ BÁN HÀNG & OCR
                </p>
                <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Quản lý Hóa Đơn, Danh Mục & Dòng Tiền Thời Gian Thực
                </h1>
                <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                  Tự động nhận diện món ăn từ ảnh chụp bill hoặc văn bản, phân loại danh mục thông minh, theo dõi công nợ, hoàn trả món và đối soát doanh thu thực nhận.
                </p>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-800 text-xs text-slate-300">
                <div className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span>
                    Trích xuất hóa đơn bằng AI OCR sang cấu trúc JSON chuẩn và tự động cộng số lượng bán theo thời gian thực.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span>
                    Phân tích biểu đồ cột doanh thu và thống kê chi tiết từng mặt hàng trong mỗi danh mục.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span>
                    Quản lý công nợ theo khách hàng, theo dõi hoàn trả món và lưu trữ dữ liệu đồng bộ trên Firebase.
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Đồng bộ Firebase Cloud (vqbill)</span>
              </span>
              <span className="font-mono">Bảo mật phân quyền</span>
            </div>
          </div>

          {/* Right Panel: Login Form */}
          <div className="lg:col-span-6 p-6 sm:p-8 flex flex-col justify-center">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Đăng nhập hệ thống
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Nhập tên đăng nhập và mật khẩu được cấp hoặc xác thực qua tài khoản Google Firebase.
              </p>
            </div>

            {(localError || authError) && (
              <div className="mb-4 p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{localError || authError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên đăng nhập (Username)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Nhập tên đăng nhập..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Mật khẩu (Password)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Đăng nhập</span>
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span className="text-xs text-slate-400">HOẶC ĐỒNG BỘ CLOUD FIRESTORE</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleGoogleClick}
              className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                {isSubmitting
                  ? 'Đang kết nối Firebase...'
                  : 'Đăng nhập với Google (Firebase Auth)'}
              </span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
        VQBill — Hệ thống quản lý hóa đơn bán hàng, phân loại danh mục & đối soát doanh thu.
      </footer>
    </div>
  );
};
