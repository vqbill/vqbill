import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

export const ScrollToTopButton: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPos =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      setVisible(scrollPos > 160);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!visible) return null;

  return (
    <button
      id="scroll-to-top-btn"
      type="button"
      onClick={handleScrollToTop}
      className="fixed bottom-36 lg:bottom-24 right-3 sm:right-6 z-40 flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 shadow-md border border-slate-300/80 dark:border-slate-700/80 cursor-pointer select-none backdrop-blur-md transition-all hover:scale-105 active:scale-95 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 group animate-in fade-in slide-in-from-bottom-2 duration-150 whitespace-nowrap shrink-0"
      title="Cuộn lên đầu trang (Scroll to Top)"
      aria-label="Cuộn lên đầu trang"
    >
      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 group-hover:-translate-y-0.5 transition-transform" />
      <span className="text-[11px] font-bold hidden sm:inline leading-none whitespace-nowrap">Lên đầu</span>
    </button>
  );
};
