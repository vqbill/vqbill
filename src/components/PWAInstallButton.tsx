import React, { useEffect, useState } from 'react';
import { Smartphone, Download, Share, PlusSquare, ExternalLink, X, CheckCircle2 } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

interface PWAInstallButtonProps {
  variant?: 'header' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <div className="p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/30 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
              Đang chạy chế độ Ứng Dụng (PWA Standalone)
            </div>
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
              VQBill đã được cài đặt trên thiết bị của bạn.
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  const handleTriggerClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (!ok) {
        setShowGuideModal(true);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      {variant === 'header' ? (
        <button
          type="button"
          onClick={handleTriggerClick}
          className="px-2.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
          title="Cài đặt ứng dụng VQBill ra màn hình chính điện thoại / máy tính"
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden md:inline">Cài đặt App</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleTriggerClick}
          className="w-full text-left p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/80 dark:bg-emerald-950/30 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 transition-all flex items-center justify-between gap-3 cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Cài Đặt App VQBill Ra Màn Hình Chính (iPhone / Android)
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                Mở full màn hình như ứng dụng thật, không có thanh địa chỉ trình duyệt, thao tác nhanh tại quầy
              </div>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold whitespace-nowrap shrink-0">
            Cài đặt ngay
          </span>
        </button>
      )}

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold">
                  Cài Đặt Ứng Dụng VQBill (PWA)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 text-xs">
              {isInstallable && (
                <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 space-y-2.5">
                  <div className="font-bold text-emerald-900 dark:text-emerald-200">
                    Thiết bị của bạn hỗ trợ cài đặt trực tiếp 1 chạm:
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await install();
                      if (ok) setShowGuideModal(false);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Cài Đặt Ứng Dụng VQBill Ngay</span>
                  </button>
                </div>
              )}

              {/* iPhone / iPad Safari Guide */}
              <div
                className={`p-3.5 rounded-xl border space-y-2 ${
                  isIOS
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50'
                }`}
              >
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>📱 Trên iPhone / iPad (Trình duyệt Safari):</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300 leading-relaxed">
                  <li>
                    Mở đường dẫn website bằng trình duyệt <strong>Safari</strong>.
                  </li>
                  <li>
                    Bấm nút <strong>Chia sẻ (Share)</strong>{' '}
                    <Share className="w-3.5 h-3.5 inline text-blue-500 mx-0.5" /> ở thanh công cụ dưới cùng.
                  </li>
                  <li>
                    Cuộn xuống và chọn{' '}
                    <strong>"Thêm vào MH chính" (Add to Home Screen)</strong>{' '}
                    <PlusSquare className="w-3.5 h-3.5 inline text-emerald-600 mx-0.5" />.
                  </li>
                  <li>
                    Bấm <strong>Thêm (Add)</strong> ở góc trên bên phải để hoàn tất.
                  </li>
                </ol>
              </div>

              {/* Android Chrome & Desktop Guide */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2">
                <div className="font-bold text-slate-900 dark:text-white">
                  🤖 Trên Điện thoại Android (Chrome) & Máy tính:
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300 leading-relaxed">
                  <li>
                    Bấm biểu tượng <strong>⋮ (Menu 3 chấm)</strong> ở góc trên bên phải trình duyệt Chrome.
                  </li>
                  <li>
                    Chọn <strong>"Cài đặt ứng dụng" (Install App)</strong> hoặc{' '}
                    <strong>"Thêm vào màn hình chính"</strong>.
                  </li>
                </ol>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Mở trong tab trình duyệt riêng</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold cursor-pointer"
                >
                  Đã hiểu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
