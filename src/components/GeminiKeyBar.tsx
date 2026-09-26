import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { ConfirmRequestOptions, GeminiKeyStatus } from '../types';

interface GeminiKeyBarProps {
  geminiApiKey: string;
  geminiStatus?: GeminiKeyStatus;
  onSaveGeminiKey: (newKey: string) => Promise<void>;
  onCheckGeminiKey: (keyToTest?: string) => Promise<{
    ok: boolean;
    message: string;
  }>;
  onClearGeminiKey?: () => Promise<void>;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
  contextLabel?: string;
}

export const GeminiKeyBar: React.FC<GeminiKeyBarProps> = ({
  geminiApiKey,
  geminiStatus,
  onSaveGeminiKey,
  onCheckGeminiKey,
  onClearGeminiKey,
  requestConfirm,
  contextLabel = 'Kết nối Gemini AI để quét ảnh hóa đơn OCR, nhận diện bill và tự động thêm món vào Menu',
}) => {
  const safeStatus: GeminiKeyStatus = geminiStatus || {
    configured: Boolean(geminiApiKey),
    source: geminiApiKey ? 'custom' : 'none',
    maskedKey: geminiApiKey
      ? `${geminiApiKey.slice(0, 6)}...${geminiApiKey.slice(-4)}`
      : '',
  };

  const [inputKey, setInputKey] = useState<string>(geminiApiKey || '');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [localFeedback, setLocalFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  useEffect(() => {
    setInputKey(geminiApiKey || '');
  }, [geminiApiKey]);

  const handleAddKeyClick = () => {
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setLocalFeedback({
        type: 'err',
        text: 'Vui lòng nhập Gemini API Key (bắt đầu bằng AIza...) trước khi bấm Add Gemini Key.',
      });
      return;
    }

    requestConfirm({
      title: 'Xác nhận Thêm / Cập Nhật Gemini API Key',
      message:
        'Bạn có chắc chắn muốn lưu Gemini API Key này để sử dụng cho tính năng Gemini quét hóa đơn, nhận diện bill và thêm món tự động không?',
      confirmLabel: 'Lưu Gemini Key',
      variant: 'primary',
      onConfirm: async () => {
        setIsSaving(true);
        setLocalFeedback(null);
        try {
          await onSaveGeminiKey(trimmed);
          const checkRes = await onCheckGeminiKey(trimmed);
          if (checkRes) {
            setLocalFeedback({
              type: checkRes.ok ? 'ok' : 'err',
              text:
                checkRes.message ||
                (checkRes.ok
                  ? 'Đã lưu và xác thực Gemini API Key thành công!'
                  : 'Đã lưu Gemini Key nhưng kiểm tra kết nối chưa thành công.'),
            });
          } else {
            setLocalFeedback({
              type: 'ok',
              text: 'Đã lưu Gemini API Key thành công!',
            });
          }
        } catch (err: any) {
          setLocalFeedback({
            type: 'err',
            text: err?.message || 'Không thể lưu Gemini API Key.',
          });
        } finally {
          setIsSaving(false);
        }
      },
    });
  };

  const handleCheckKeyClick = async () => {
    const trimmed = inputKey.trim();
    setIsChecking(true);
    setLocalFeedback(null);
    try {
      const res = await onCheckGeminiKey(trimmed || undefined);
      if (res) {
        setLocalFeedback({
          type: res.ok ? 'ok' : 'err',
          text:
            res.message ||
            (res.ok
              ? 'Gemini API Key hoạt động tốt!'
              : 'Gemini API Key không hợp lệ hoặc chưa cấu hình.'),
        });
      }
    } catch (err: any) {
      setLocalFeedback({
        type: 'err',
        text: err?.message || 'Lỗi khi kiểm tra Gemini API Key.',
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleClearKeyClick = () => {
    requestConfirm({
      title: 'Xác nhận Xóa Gemini API Key Tùy Chỉnh',
      message:
        'Bạn có chắc chắn muốn xóa Gemini API Key đã nhập và quay về cấu hình mặc định của hệ thống không?',
      confirmLabel: 'Xóa Gemini Key',
      variant: 'danger',
      onConfirm: async () => {
        if (onClearGeminiKey) {
          await onClearGeminiKey();
        } else {
          await onSaveGeminiKey('');
        }
        setInputKey('');
        setLocalFeedback({
          type: 'ok',
          text: 'Đã xóa Gemini API Key tùy chỉnh.',
        });
      },
    });
  };

  const activeFeedback =
    localFeedback ||
    (safeStatus.error
      ? { type: 'err' as const, text: safeStatus.error }
      : safeStatus.message
      ? { type: 'ok' as const, text: safeStatus.message }
      : null);

  return (
    <div className="p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xs space-y-3.5">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Left: Status & Context */}
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Cấu hình Gemini API Key
              </h3>
              <span className="text-xs font-mono text-slate-400">·</span>
              {safeStatus.configured ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Đang kích hoạt ({safeStatus.maskedKey || 'Đã lưu'})
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Chưa cấu hình Key</span>
                </span>
              )}
              {safeStatus.verified && safeStatus.latencyMs ? (
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                  · OK ({safeStatus.latencyMs}ms)
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              {contextLabel}
            </p>
          </div>
        </div>

        {/* Right: Input + Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full xl:w-auto">
          <div className="relative flex-1 sm:w-72">
            <input
              type={showKey ? 'text' : 'password'}
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder={
                safeStatus.configured
                  ? `Key: ${safeStatus.maskedKey || 'Đã lưu'} (Nhập để đổi)`
                  : 'Dán Gemini API Key (AIzaSy...)'
              }
              className="w-full h-10 pl-3.5 pr-16 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowKey((prev) => !prev)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 inline-flex items-center gap-1 cursor-pointer"
              title={showKey ? 'Ẩn API Key' : 'Hiện API Key'}
            >
              {showKey ? (
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleAddKeyClick}
              className="flex-1 sm:flex-initial h-10 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5 shrink-0" />
              <span>{isSaving ? 'Đang lưu...' : 'Add Gemini Key'}</span>
            </button>

            <button
              type="button"
              disabled={isChecking}
              onClick={handleCheckKeyClick}
              className="flex-1 sm:flex-initial h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {isChecking ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-500 shrink-0" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              )}
              <span>{isChecking ? 'Đang Check...' : 'Check Key'}</span>
            </button>

            {(geminiApiKey || inputKey) && (
              <button
                type="button"
                onClick={handleClearKeyClick}
                className="h-10 w-10 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center justify-center shrink-0 cursor-pointer"
                title="Xóa Gemini Key tùy chỉnh"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {activeFeedback && (
        <div
          className={`px-3.5 py-2.5 rounded-xl border flex items-start sm:items-center gap-2 text-xs ${
            activeFeedback.type === 'ok'
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
              : 'border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300'
          }`}
        >
          {activeFeedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-rose-600 dark:text-rose-400" />
          )}
          <span className="leading-relaxed">{activeFeedback.text}</span>
        </div>
      )}
    </div>
  );
};
