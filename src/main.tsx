import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.error('RootErrorBoundary caught error:', error, errorInfo);
  }

  handleResetCacheAndReload = () => {
    try {
      const staff = localStorage.getItem('vqbill_active_staff');
      const theme = localStorage.getItem('vqbill_theme');
      const gKey = localStorage.getItem('vqbill_gemini_api_key');
      localStorage.clear();
      if (staff) localStorage.setItem('vqbill_active_staff', staff);
      if (theme) localStorage.setItem('vqbill_theme', theme);
      if (gKey) localStorage.setItem('vqbill_gemini_api_key', gKey);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 text-center">
            <div className="text-base font-bold text-slate-900">
              Đang làm mới dữ liệu giao diện...
            </div>
            <p className="text-xs text-slate-600">
              Phát hiện dữ liệu bộ nhớ đệm cũ không tương thích. Bấm nút bên dưới để đồng bộ lại giao diện ngay.
            </p>
            {this.state.errorMessage && (
              <div className="p-2.5 rounded-xl bg-slate-100 text-[11px] font-mono text-slate-600 break-all text-left">
                {this.state.errorMessage}
              </div>
            )}
            <button
              type="button"
              onClick={this.handleResetCacheAndReload}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
            >
              Làm mới & Mở lại ứng dụng
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>
);

