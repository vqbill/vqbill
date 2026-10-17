import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Bot,
  User,
  Sparkles,
  Settings,
  HelpCircle,
  Copy,
  Check,
  Package,
  Layers,
  SendHorizontal,
  ChevronDown,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  FileText,
  Trash2,
  Plus,
  Pencil,
  CheckSquare,
  Square,
  Tag,
  FolderPlus,
  AlertCircle,
  Search,
} from 'lucide-react';
import {
  ProductRecord,
  BillRecord,
  BillItemRecord,
  ReturnRecord,
  WorkspaceInventoryData,
  ChatAssistantMessage,
  TelegramBotConfig,
  CustomCategoryGroup,
} from '../types';
import {
  executeChatCommand,
  ChatAssistantContext,
  ChatCommandExecutionResult,
} from '../utils/chatAssistantEngine';
import { formatDateDMY } from '../utils/parser';

interface ChatAssistantWidgetProps {
  isOpen: boolean;
  onToggle: () => void;
  selectedDate: string;
  todayStr: string;
  yesterdayStr: string;
  products: ProductRecord[];
  categories: string[];
  bills: BillRecord[];
  billItems: BillItemRecord[];
  returns: ReturnRecord[];
  inventoryData: WorkspaceInventoryData;
  onUpdateInventoryData: (nextData: WorkspaceInventoryData, toastMsg?: string) => Promise<void>;
  onNavigateToTab?: (tabId: string) => void;
  currentUsername?: string;
}

export const ChatAssistantWidget: React.FC<ChatAssistantWidgetProps> = ({
  isOpen,
  onToggle,
  selectedDate,
  todayStr,
  yesterdayStr,
  products,
  categories,
  bills,
  billItems,
  returns,
  inventoryData,
  onUpdateInventoryData,
  onNavigateToTab,
  currentUsername = 'admin',
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'groups' | 'telegram'>('chat');
  const [inputQuery, setInputQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Danh sách toàn bộ danh mục sản phẩm hiện có thực tế trên website
  const availableCategories = React.useMemo(() => {
    const set = new Set<string>();
    for (const cat of categories) {
      if (cat && cat.trim()) set.add(cat.trim());
    }
    for (const prod of products) {
      if (prod.category && prod.category.trim()) set.add(prod.category.trim());
    }
    return Array.from(set);
  }, [categories, products]);

  // Messages History
  const [messages, setMessages] = useState<ChatAssistantMessage[]>(() => {
    try {
      const cached = localStorage.getItem('vqbill_chat_assistant_messages');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      {
        id: 'msg_welcome',
        sender: 'assistant',
        text:
          '👋 Xin chào! Tôi là Trợ Lý Kho & Báo Cáo VQBill.\n\n' +
          'Bạn có thể gõ câu lệnh tự nhiên để kiểm tồn kho, nhập kho hoặc xem số lượng bán:\n' +
          '• "kiểm tồn kho A" hoặc "tồn kho B" (tự động chỉ hiện các món còn tồn > 0)\n' +
          '• "kiểm số lượng bán 24/9/2026" hoặc "kiểm số lượng bán 2 ngày trước" (chỉ hiện món bán > 0)\n' +
          '• "kiểm số lượng bán hôm nay" hoặc "hôm qua"\n' +
          '• "nhập 240 tiger lùn, huda 90, larue 60"\n\n' +
          'Bấm vào các nút gợi ý bên dưới hoặc chuyển sang tab "Nhóm Danh Mục" để tự cài nhóm nhé!',
        createdAtMs: Date.now(),
        type: 'text',
      },
    ];
  });

  // State Danh sách Nhóm Danh Mục Tự Tạo (Custom Category Groups)
  const [customGroups, setCustomGroups] = useState<CustomCategoryGroup[]>(() => {
    const existing = inventoryData.customCategoryGroups;
    if (Array.isArray(existing) && existing.length > 0) {
      return existing;
    }

    // Gợi ý mặc định nhóm A và B dựa trên các danh mục thực tế của website
    const initial: CustomCategoryGroup[] = [];
    const beerCat =
      availableCategories.find((c) => c.toLowerCase().includes('bia')) ||
      (availableCategories.includes('Bia') ? 'Bia' : '');
    const softCat =
      availableCategories.find((c) => c.toLowerCase().includes('nước') || c.toLowerCase().includes('nuoc')) ||
      (availableCategories.includes('Nước ngọt') ? 'Nước ngọt' : '');

    if (beerCat) {
      initial.push({
        id: 'grp_a',
        name: 'A',
        categories: [beerCat],
        aliases: ['a', 'nhom a'],
        createdAtMs: Date.now(),
      });
    }
    if (softCat) {
      initial.push({
        id: 'grp_b',
        name: 'B',
        categories: [softCat],
        aliases: ['b', 'nhom b'],
        createdAtMs: Date.now() + 1,
      });
    }
    if (initial.length === 0 && availableCategories.length > 0) {
      initial.push({
        id: 'grp_default',
        name: 'A',
        categories: [availableCategories[0]],
        aliases: ['a'],
        createdAtMs: Date.now(),
      });
    }
    return initial;
  });

  // Cập nhật customGroups nếu inventoryData từ props thay đổi
  useEffect(() => {
    if (Array.isArray(inventoryData.customCategoryGroups) && inventoryData.customCategoryGroups.length > 0) {
      setCustomGroups(inventoryData.customCategoryGroups);
    }
  }, [inventoryData.customCategoryGroups]);

  // Form Thêm / Sửa Nhóm Danh Mục State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [selectedCategoriesInForm, setSelectedCategoriesInForm] = useState<string[]>([]);
  const [formError, setFormError] = useState('');

  // Telegram Config State
  const [telegramConfig, setTelegramConfig] = useState<TelegramBotConfig>(() => {
    return (
      inventoryData.telegramConfig || {
        enabled: false,
        botToken: '',
        botUsername: '',
        authorizedChatIds: [],
        autoSendDailyReport: false,
      }
    );
  });
  const [telegramChatIdsInput, setTelegramChatIdsInput] = useState(() =>
    (inventoryData.telegramConfig?.authorizedChatIds || []).join(', ')
  );
  const [telegramTestStatus, setTelegramTestStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ loading: false });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, activeTab]);

  // Persist messages to local storage
  useEffect(() => {
    try {
      localStorage.setItem('vqbill_chat_assistant_messages', JSON.stringify(messages.slice(-50)));
    } catch {}
  }, [messages]);

  // Xử lý gửi tin nhắn
  const handleSendMessage = async (customText?: string) => {
    const query = (customText !== undefined ? customText : inputQuery).trim();
    if (!query || isProcessing) return;

    setInputQuery('');
    const userMsg: ChatAssistantMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: query,
      createdAtMs: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const context: ChatAssistantContext = {
        selectedDate,
        todayStr,
        yesterdayStr,
        products,
        categories: availableCategories,
        bills,
        billItems,
        returns,
        inventoryData,
        categoryAliases: inventoryData.categoryAliases,
        customCategoryGroups: customGroups,
        currentUsername,
        source: 'web_chat',
      };

      const result: ChatCommandExecutionResult = await executeChatCommand(query, context);

      // Nếu là lệnh nhập kho thành công: Thực hiện cập nhật dữ liệu kho
      if (result.commandType === 'import_execute' && result.importData) {
        const { date, updatedItems, newLogs } = result.importData;
        const curDaily = { ...(inventoryData.dailyEntries?.[date] || {}) };

        for (const item of updatedItems) {
          const pKey = item.productName.trim().toLowerCase();
          const prevEntry = curDaily[pKey] || {
            openingStock: 0,
            importedQty: 0,
            damagedQty: 0,
            actualClosingStock: null,
            updatedAtMs: Date.now(),
          };

          curDaily[pKey] = {
            ...prevEntry,
            importedQty: (prevEntry.importedQty || 0) + item.quantity,
            updatedAtMs: Date.now(),
            updatedBy: currentUsername,
          };
        }

        const nextInventoryData: WorkspaceInventoryData = {
          ...inventoryData,
          dailyEntries: {
            ...(inventoryData.dailyEntries || {}),
            [date]: curDaily,
          },
          importLogs: [...newLogs, ...(inventoryData.importLogs || [])],
          customCategoryGroups: customGroups,
          updatedAtMs: Date.now(),
        };

        await onUpdateInventoryData(
          nextInventoryData,
          `Đã nhập kho qua Trợ lý: ${updatedItems.map((i) => `+${i.quantity} ${i.productName}`).join(', ')}`
        );
      }

      const botMsg: ChatAssistantMessage = {
        id: `bot_${Date.now()}`,
        sender: 'assistant',
        text: result.replyText,
        createdAtMs: Date.now(),
        type: result.commandType,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot_err_${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ Lỗi xử lý lệnh: ${err?.message || 'Không thể thực thi.'}`,
          createdAtMs: Date.now(),
          type: 'error',
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Mở Form tạo nhóm mới
  const handleOpenCreateGroup = () => {
    setIsFormOpen(true);
    setEditingGroupId(null);
    setGroupNameInput('');
    setSelectedCategoriesInForm([]);
    setFormError('');
  };

  // Mở Form chỉnh sửa nhóm
  const handleOpenEditGroup = (group: CustomCategoryGroup) => {
    setIsFormOpen(true);
    setEditingGroupId(group.id);
    setGroupNameInput(group.name);
    setSelectedCategoriesInForm([...group.categories]);
    setFormError('');
  };

  // Lưu Nhóm Danh Mục từ Form
  const handleSaveGroupForm = async () => {
    const cleanName = groupNameInput.trim();
    if (!cleanName) {
      setFormError('Vui lòng nhập tên riêng cho nhóm (ví dụ: A, B, Kho Lạnh, Đồ Uống...)');
      return;
    }
    if (selectedCategoriesInForm.length === 0) {
      setFormError('Vui lòng tích chọn ít nhất 1 danh mục sản phẩm từ website để xem.');
      return;
    }

    let updatedGroups: CustomCategoryGroup[] = [];
    if (editingGroupId) {
      // Chỉnh sửa nhóm hiện có
      updatedGroups = customGroups.map((g) =>
        g.id === editingGroupId
          ? {
              ...g,
              name: cleanName,
              categories: selectedCategoriesInForm,
            }
          : g
      );
    } else {
      // Kiểm tra tên trùng lặp
      const isDup = customGroups.some((g) => g.name.trim().toLowerCase() === cleanName.toLowerCase());
      if (isDup) {
        setFormError(`Tên nhóm "${cleanName}" đã tồn tại. Vui lòng chọn tên khác.`);
        return;
      }
      const newGroup: CustomCategoryGroup = {
        id: `grp_${Date.now()}`,
        name: cleanName,
        categories: selectedCategoriesInForm,
        createdAtMs: Date.now(),
      };
      updatedGroups = [...customGroups, newGroup];
    }

    setCustomGroups(updatedGroups);
    setIsFormOpen(false);
    setEditingGroupId(null);
    setGroupNameInput('');
    setSelectedCategoriesInForm([]);
    setFormError('');

    // Đồng bộ sang categoryAliases để tương thích ngược
    const nextAliases: Record<string, string[]> = { ...(inventoryData.categoryAliases || {}) };
    for (const grp of updatedGroups) {
      for (const cat of grp.categories) {
        const curList = new Set(nextAliases[cat] || []);
        curList.add(grp.name.toLowerCase());
        nextAliases[cat] = Array.from(curList);
      }
    }

    const nextInv: WorkspaceInventoryData = {
      ...inventoryData,
      customCategoryGroups: updatedGroups,
      categoryAliases: nextAliases,
      updatedAtMs: Date.now(),
    };

    await onUpdateInventoryData(nextInv, `Đã lưu nhóm danh mục "${cleanName}"!`);

    setMessages((prev) => [
      ...prev,
      {
        id: `sys_${Date.now()}`,
        sender: 'system',
        text: `✅ Đã lưu nhóm "${cleanName}" gồm các danh mục: [${selectedCategoriesInForm.join(', ')}]. Giờ đây bạn có thể chat "kiểm tồn kho ${cleanName}"!`,
        createdAtMs: Date.now(),
      },
    ]);
  };

  // Xóa nhóm
  const handleDeleteGroup = async (groupId: string) => {
    const target = customGroups.find((g) => g.id === groupId);
    if (!target) return;
    if (!window.confirm(`Bạn có chắc muốn xóa nhóm danh mục "${target.name}" không?`)) return;

    const updatedGroups = customGroups.filter((g) => g.id !== groupId);
    setCustomGroups(updatedGroups);

    const nextInv: WorkspaceInventoryData = {
      ...inventoryData,
      customCategoryGroups: updatedGroups,
      updatedAtMs: Date.now(),
    };

    await onUpdateInventoryData(nextInv, `Đã xóa nhóm danh mục "${target.name}"!`);
  };

  // Toggle chọn danh mục trong form
  const handleToggleCategorySelection = (catName: string) => {
    setSelectedCategoriesInForm((prev) =>
      prev.includes(catName) ? prev.filter((c) => c !== catName) : [...prev, catName]
    );
  };

  // Chọn tất cả danh mục
  const handleSelectAllCategories = () => {
    setSelectedCategoriesInForm([...availableCategories]);
  };

  // Bỏ chọn tất cả danh mục
  const handleDeselectAllCategories = () => {
    setSelectedCategoriesInForm([]);
  };

  // Kiểm tồn kho nhanh một nhóm
  const handleQuickCheckGroup = (groupName: string) => {
    setActiveTab('chat');
    handleSendMessage(`kiểm tồn kho ${groupName}`);
  };

  // Kiểm tồn kho nhanh một danh mục cụ thể
  const handleQuickCheckCategory = (catName: string) => {
    setActiveTab('chat');
    handleSendMessage(`kiểm kho ${catName}`);
  };

  // Lưu cấu hình Telegram Bot và kích hoạt Poller tự động trên Server
  const handleSaveTelegram = async () => {
    const cleanChatIds = telegramChatIdsInput
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const updatedTelegramConfig: TelegramBotConfig = {
      ...telegramConfig,
      authorizedChatIds: cleanChatIds,
    };

    const nextInv: WorkspaceInventoryData = {
      ...inventoryData,
      telegramConfig: updatedTelegramConfig,
      customCategoryGroups: customGroups,
      updatedAtMs: Date.now(),
    };

    await onUpdateInventoryData(nextInv, 'Đã lưu cấu hình Bot Telegram!');

    // Gửi cấu hình về Express Server để kích hoạt Realtime Polling Engine 24/7
    try {
      setTelegramTestStatus({ loading: true, message: 'Đang kết nối và kích hoạt Bot trên hệ thống...' });
      const srvRes = await fetch('/api/telegram-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: telegramConfig.botToken,
          authorizedChatIds: cleanChatIds,
          enabled: telegramConfig.enabled,
          customCategoryGroups: customGroups,
        }),
      });

      const srvData = await srvRes.json();
      if (srvData.ok) {
        setTelegramConfig((prev) => ({
          ...prev,
          botUsername: srvData.botUsername,
        }));
        setTelegramTestStatus({
          loading: false,
          success: true,
          message: `✅ Thành công! Đã kết nối với Bot @${srvData.botUsername || 'Telegram'}. Hệ thống đang tự động lắng nghe và phản hồi tin nhắn của bạn 24/7. Hãy mở Telegram và nhắn tin kiểm tra ngay!`,
        });

        setMessages((prev) => [
          ...prev,
          {
            id: `sys_tg_${Date.now()}`,
            sender: 'system',
            text: `🤖 Đã kích hoạt Bot Telegram @${srvData.botUsername || 'bot'} thành công! Giờ đây bạn có thể mở Telegram trên điện thoại và nhắn "kiểm tồn kho A" hoặc "/start" để nhận phản hồi tức thì.`,
            createdAtMs: Date.now(),
          },
        ]);
      } else {
        setTelegramTestStatus({
          loading: false,
          success: false,
          message: `⚠️ Lỗi kích hoạt Bot trên Server: ${srvData.error || 'Vui lòng kiểm tra lại Bot Token.'}`,
        });
      }
    } catch (err: any) {
      setTelegramTestStatus({
        loading: false,
        success: true,
        message: 'Đã lưu cấu hình! Vui lòng gửi tin nhắn thử để kiểm tra.',
      });
    }
  };

  // Test gửi tin nhắn Telegram & đồng thời kích hoạt Poller
  const handleTestTelegram = async () => {
    if (!telegramConfig.botToken) {
      setTelegramTestStatus({
        loading: false,
        success: false,
        message: 'Vui lòng nhập Bot Token từ @BotFather trước.',
      });
      return;
    }

    const targetChatId = telegramChatIdsInput.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)[0];
    if (!targetChatId) {
      setTelegramTestStatus({
        loading: false,
        success: false,
        message: 'Vui lòng nhập ít nhất 1 Chat ID của bạn để nhận tin nhắn thử.',
      });
      return;
    }

    setTelegramTestStatus({ loading: true, message: 'Đang gửi tin nhắn thử...' });
    try {
      // Đảm bảo server đã lưu config và kích hoạt poller
      const cleanChatIds = telegramChatIdsInput.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
      await fetch('/api/telegram-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: telegramConfig.botToken,
          authorizedChatIds: cleanChatIds,
          enabled: true,
          customCategoryGroups: customGroups,
        }),
      }).catch(() => {});

      const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: `🤖 [VQBill Assistant] Xin chào! Kết nối Telegram Bot thành công lúc ${new Date().toLocaleTimeString('vi-VN')}!\n\n` +
            `Từ giờ bạn có thể chat trực tiếp với bot để ra lệnh:\n` +
            `• "kiểm tồn kho A" (hoặc B, kho lạnh...)\n` +
            `• "kiểm kho bia"\n` +
            `• "kiểm số lượng bán 24/9/2026"\n` +
            `• "nhập 240 tiger lùn, huda 90"\n\n` +
            `👉 Hãy thử nhắn lại ngay một câu để kiểm tra phản hồi tự động nhé!`,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setTelegramTestStatus({
          loading: false,
          success: true,
          message: '🎉 Thành công! Đã gửi tin nhắn thử tới Telegram. Hệ thống cũng đã kích hoạt lắng nghe tin nhắn tự động 24/7. Hãy mở Telegram nhắn "kiểm tồn kho A" hoặc "/start" để xem bot trả lời nhé!',
        });
      } else {
        setTelegramTestStatus({
          loading: false,
          success: false,
          message: `Lỗi Telegram: ${data.description || 'Bot Token hoặc Chat ID không đúng.'}`,
        });
      }
    } catch (err: any) {
      setTelegramTestStatus({
        loading: false,
        success: false,
        message: `Lỗi kết nối: ${err?.message || 'Không thể gọi Telegram API'}`,
      });
    }
  };

  const handleCopyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `msg_clear_${Date.now()}`,
        sender: 'assistant',
        text: 'Đã làm mới khung chat! Bạn muốn kiểm kho hay nhập món nào hôm nay?',
        createdAtMs: Date.now(),
        type: 'text',
      },
    ]);
  };

  return (
    <>
      {/* 1. NÚT NỔI MỞ CHAT ASSISTANT (FLOATING TRIGGER - COMPACT SIZE) */}
      {!isOpen && (
        <button
          type="button"
          onClick={onToggle}
          className="fixed bottom-26 lg:bottom-14 right-3 sm:right-6 z-40 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-full bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-[11px] sm:text-xs shadow-md flex items-center gap-1.5 sm:gap-2 transition-all transform hover:scale-105 active:scale-95 cursor-pointer border border-emerald-400/30"
          title="Mở Trợ Lý Ảo Kho & Báo Cáo (Hỗ trợ chat Web & Telegram)"
        >
          <div className="relative">
            <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full border border-white" />
          </div>
          <span className="hidden sm:inline">Trợ Lý Kho & Báo Cáo</span>
        </button>
      )}

      {/* 2. CỬA SỔ CHAT DRAWER / POPUP */}
      {isOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[490px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-emerald-600/10 via-teal-600/5 to-indigo-600/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-xs">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Trợ Lý Kho & Báo Cáo
                  </h3>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Chat-Ops Web & Telegram Bot
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClearHistory}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                title="Xóa lịch sử chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onToggle}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer transition-colors"
                title="Đóng khung chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sub-Header Tabs */}
          <div className="flex items-center px-3 pt-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 gap-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`px-3 py-2 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'chat'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-900 rounded-t-lg font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Khung Chat</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('groups')}
              className={`px-3 py-2 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'groups'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-900 rounded-t-lg font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Nhóm Danh Mục</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-mono">
                {customGroups.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('telegram')}
              className={`px-3 py-2 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'telegram'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-900 rounded-t-lg font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <SendHorizontal className="w-3.5 h-3.5" />
              <span>Telegram Bot</span>
            </button>
          </div>

          {/* TAB 1: KHUNG CHAT TRỰC TIẾP */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0 bg-slate-50/40 dark:bg-slate-950/20">
              {/* Message History */}
              <div className="flex-1 p-3.5 sm:p-4 overflow-y-auto space-y-3 text-xs leading-relaxed">
                {messages.map((msg, idx) => {
                  const isUser = msg.sender === 'user';
                  const isSystem = msg.sender === 'system';

                  if (isSystem) {
                    return (
                      <div
                        key={msg.id}
                        className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-[11px]"
                      >
                        {msg.text}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <div
                        className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold ${
                          isUser
                            ? 'bg-blue-600 text-white'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                      </div>

                      <div
                        className={`group relative max-w-[85%] p-3 rounded-2xl whitespace-pre-wrap font-sans text-xs ${
                          isUser
                            ? 'bg-blue-600 text-white rounded-tr-none'
                            : 'bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-none shadow-xs'
                        }`}
                      >
                        {msg.text}

                        {!isUser && (
                          <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-700/60 text-[10px] text-slate-400">
                            <span>{new Date(msg.createdAtMs).toLocaleTimeString('vi-VN')}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyText(msg.text, idx)}
                              className="inline-flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
                            >
                              {copiedIndex === idx ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{copiedIndex === idx ? 'Đã sao chép' : 'Sao chép'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isProcessing && (
                  <div className="flex items-center gap-2 text-slate-400 text-xs italic">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                    <span>Trợ lý đang phân tích dữ liệu kho...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Action Chips */}
              <div className="p-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-1.5 overflow-x-auto text-[11px] no-scrollbar">
                {/* Các nút bấm theo nhóm tự tạo */}
                {customGroups.map((grp) => (
                  <button
                    key={grp.id}
                    type="button"
                    onClick={() => handleSendMessage(`kiểm tồn kho ${grp.name}`)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-semibold shrink-0 cursor-pointer border border-emerald-200/60 dark:border-emerald-800 flex items-center gap-1"
                    title={`Kiểm tra tồn kho nhóm ${grp.name} (${grp.categories.join(', ')})`}
                  >
                    <Package className="w-3 h-3" />
                    <span>Tồn kho {grp.name}</span>
                  </button>
                ))}

                {/* Các nút kiểm tra theo danh mục cụ thể */}
                {availableCategories.slice(0, 3).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleSendMessage(`kiểm kho ${cat}`)}
                    className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 font-semibold shrink-0 cursor-pointer border border-teal-200/60 dark:border-teal-800"
                  >
                    Kho {cat}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => handleSendMessage('kiểm số lượng bán hôm nay')}
                  className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-semibold shrink-0 cursor-pointer border border-blue-200/60 dark:border-blue-800"
                >
                  📊 Bán hôm nay
                </button>

                <button
                  type="button"
                  onClick={() => handleSendMessage('kiểm số lượng bán hôm qua')}
                  className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-semibold shrink-0 cursor-pointer border border-blue-200/60 dark:border-blue-800"
                >
                  📊 Bán hôm qua
                </button>

                <button
                  type="button"
                  onClick={() => handleSendMessage('kiểm số lượng bán 2 ngày trước')}
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold shrink-0 cursor-pointer border border-indigo-200/60 dark:border-indigo-800"
                >
                  📊 Bán 2 ngày trước
                </button>

                <button
                  type="button"
                  onClick={() => handleSendMessage('kiểm số lượng bán 24/9/2026')}
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold shrink-0 cursor-pointer border border-indigo-200/60 dark:border-indigo-800"
                >
                  📅 Bán 24/9/2026
                </button>

                <button
                  type="button"
                  onClick={() => handleSendMessage('nhập 240 tiger lùn, huda 90, larue 60')}
                  className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-semibold shrink-0 cursor-pointer border border-purple-200/60 dark:border-purple-800"
                >
                  📥 Nhập 240 Tiger, 90 Huda
                </button>

                {onNavigateToTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateToTab('inventory')}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold shrink-0 cursor-pointer flex items-center gap-1"
                  >
                    <FileText className="w-3 h-3" />
                    <span>Xem Nhật ký kho</span>
                  </button>
                )}
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder="Gõ: kiểm tồn kho A, kiểm kho bia, nhập 240 tiger lùn..."
                  disabled={isProcessing}
                  className="flex-1 h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!inputQuery.trim() || isProcessing}
                  className="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 disabled:opacity-40 cursor-pointer shadow-xs transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: QUẢN LÝ NHÓM DANH MỤC TỰ TẠO (CUSTOM CATEGORY GROUPS) */}
          {activeTab === 'groups' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
              {/* Introduction Banner */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-100 space-y-1.5 leading-relaxed">
                <div className="font-bold flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-200">
                  <Tag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Tự Tạo Tên Nhóm & Chọn Danh Mục Sản Phẩm Để Xem</span>
                </div>
                <p className="text-[11px] text-emerald-800/90 dark:text-emerald-200/90">
                  Bạn có thể tự đặt tên riêng cho nhóm (ví dụ: nhóm <strong>A</strong>, nhóm <strong>B</strong>, nhóm <strong>Kho Lạnh</strong>, <strong>Đồ Uống</strong>...) và tích chọn các <strong>Danh mục sản phẩm hiện có trên website</strong>.
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                  👉 Sau khi lưu, bạn chỉ cần chat <em>"kiểm tồn kho A"</em> hoặc <em>"tồn kho B"</em>, hệ thống sẽ tự động quét chính xác toàn bộ sản phẩm trong các danh mục bạn đã chọn!
                </p>
              </div>

              {/* Form Thêm / Chỉnh Sửa Nhóm */}
              {isFormOpen ? (
                <div className="p-4 rounded-2xl border-2 border-emerald-500 bg-white dark:bg-slate-900 shadow-md space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                    <span className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                      <FolderPlus className="w-4 h-4 text-emerald-600" />
                      {editingGroupId ? `Chỉnh Sửa Nhóm Danh Mục` : `Tạo Nhóm Danh Mục Mới`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 1. Tên riêng nhóm */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200">
                      1. Tên riêng của nhóm (do bạn tự đặt): <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={groupNameInput}
                      onChange={(e) => {
                        setGroupNameInput(e.target.value);
                        setFormError('');
                      }}
                      placeholder="Ví dụ: A, B, Kho Lạnh, Bia & Nước, Đồ uống có cồn..."
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                    <div className="text-[10px] text-slate-400">
                      Gợi ý: Đặt tên ngắn gọn như <strong>A</strong>, <strong>B</strong> để chat nhanh: "kiểm tồn kho A".
                    </div>
                  </div>

                  {/* 2. Chọn Danh Mục Để Xem từ Category hiện có */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200">
                        2. Chọn các Danh Mục Để Xem trong nhóm category sản phẩm website:{' '}
                        <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-2 text-[10px]">
                        <button
                          type="button"
                          onClick={handleSelectAllCategories}
                          className="text-emerald-600 hover:underline font-semibold cursor-pointer"
                        >
                          Chọn tất cả
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={handleDeselectAllCategories}
                          className="text-slate-500 hover:underline cursor-pointer"
                        >
                          Bỏ chọn
                        </button>
                      </div>
                    </div>

                    {availableCategories.length === 0 ? (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-amber-800 text-xs">
                        Chưa có danh mục sản phẩm nào trên website.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                        {availableCategories.map((cat) => {
                          const isSelected = selectedCategoriesInForm.includes(cat);
                          const prodCount = products.filter((p) => p.category === cat).length;
                          const sampleProds = products
                            .filter((p) => p.category === cat)
                            .slice(0, 3)
                            .map((p) => p.productName);

                          return (
                            <div
                              key={cat}
                              onClick={() => handleToggleCategorySelection(cat)}
                              className={`p-2.5 rounded-xl border transition-all cursor-pointer select-none flex items-start gap-2.5 ${
                                isSelected
                                  ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100 shadow-xs'
                                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                              }`}
                            >
                              <div className="mt-0.5 shrink-0 text-emerald-600">
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-xs truncate">{cat}</span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                                    {prodCount} món
                                  </span>
                                </div>
                                {sampleProds.length > 0 && (
                                  <div className="text-[10px] text-slate-400 dark:text-slate-400 truncate mt-0.5">
                                    {sampleProds.join(', ')}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {formError && (
                    <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}

                  {/* Buttons Action */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveGroupForm}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>Lưu Nhóm Danh Mục</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenCreateGroup}
                  className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-emerald-400 dark:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Tạo Nhóm Danh Mục Mới (Đặt tên riêng & chọn Category)</span>
                </button>
              )}

              {/* Danh sách các nhóm đã tạo */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">
                  <span>Các nhóm danh mục hiện có ({customGroups.length})</span>
                  <span>Thao tác nhanh</span>
                </div>

                {customGroups.length === 0 ? (
                  <div className="p-6 text-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400 space-y-2">
                    <Layers className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="text-xs">Chưa có nhóm danh mục nào.</p>
                    <p className="text-[11px]">Bấm vào nút bên trên để tạo nhóm đầu tiên (Ví dụ: Nhóm A)!</p>
                  </div>
                ) : (
                  customGroups.map((group) => {
                    const totalProducts = products.filter((p) => group.categories.includes(p.category)).length;

                    return (
                      <div
                        key={group.id}
                        className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors space-y-2.5"
                      >
                        {/* Header của thẻ nhóm */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs shadow-xs tracking-wide">
                              Nhóm "{group.name}"
                            </span>
                            <span className="text-[11px] text-slate-500">
                              ({group.categories.length} danh mục • {totalProducts} món)
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditGroup(group)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                              title="Chỉnh sửa nhóm"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteGroup(group.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              title="Xóa nhóm này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Danh sách các category được chọn trong nhóm này */}
                        <div className="flex flex-wrap gap-1.5">
                          {group.categories.map((cat) => (
                            <span
                              key={cat}
                              className="px-2 py-0.8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium border border-slate-200 dark:border-slate-700 flex items-center gap-1"
                            >
                              <span>{cat}</span>
                              <span className="text-[10px] text-slate-400">
                                ({products.filter((p) => p.category === cat).length})
                              </span>
                            </span>
                          ))}
                        </div>

                        {/* Nút kiểm tra kho nhanh */}
                        <div className="pt-1 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 text-[11px]">
                          <span className="text-slate-400">
                            Cú pháp: <code className="text-emerald-600 font-mono">kiểm tồn kho {group.name}</code>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuickCheckGroup(group.name)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Search className="w-3 h-3" />
                            <span>Kiểm kho nhóm này</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Phần Tra Cứu Danh Mục Cụ Thể Trực Tiếp */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <HelpCircle className="w-4 h-4 text-blue-500" />
                  <span>Tra Cứu Trực Tiếp Theo Danh Mục Cụ Thể (Không Cần Nhóm):</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Bạn cũng có thể chat trực tiếp <em>"kiểm kho [tên danh mục]"</em> với bất kỳ danh mục nào hiện có:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {availableCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleQuickCheckCategory(cat)}
                      className="px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 hover:bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[11px] font-medium cursor-pointer transition-colors"
                    >
                      🔍 Kiểm kho: {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CẤU HÌNH TELEGRAM BOT */}
          {activeTab === 'telegram' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs leading-relaxed">
              <div className="p-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-950 dark:text-blue-100 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <SendHorizontal className="w-4 h-4 text-blue-600" />
                  <span>Kết Nối Telegram Bot (Chat 2 Chiều)</span>
                </div>
                <p className="text-[11px] text-blue-800 dark:text-blue-200">
                  Cho phép bạn nhắn tin trực tiếp trên ứng dụng Telegram điện thoại để kiểm tra kho theo tên nhóm (A, B...) và ra lệnh nhập hàng y hệt như khung chat trên web!
                </p>
              </div>

              {/* Live Bot Online Badge nếu đã cấu hình */}
              {telegramConfig.botUsername && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 flex items-center justify-between gap-2 shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <div>
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <span>Bot @{telegramConfig.botUsername}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold">
                          ĐANG TRỰC TUYẾN
                        </span>
                      </div>
                      <div className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                        Lắng nghe tin nhắn & phản hồi kiểm kho tự động 24/7
                      </div>
                    </div>
                  </div>
                  <a
                    href={`https://t.me/${telegramConfig.botUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1 shrink-0 shadow-xs"
                  >
                    <span>Mở Bot Telegram</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* 3 Steps Guide */}
              <div className="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 text-[11px]">
                <div className="font-bold text-slate-900 dark:text-white">
                  3 Bước Lấy Bot Token & Chat ID (Chỉ 1 phút):
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                  <li>
                    Mở Telegram tìm bot{' '}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 font-bold hover:underline inline-flex items-center gap-0.5"
                    >
                      @BotFather <ExternalLink className="w-2.5 h-2.5" />
                    </a>{' '}
                    $\rightarrow$ Nhắn <code className="bg-white dark:bg-slate-800 px-1 font-mono">/newbot</code> $\rightarrow$ Đặt tên bot $\rightarrow$ Chép mã <strong>HTTP API Token</strong>.
                  </li>
                  <li>
                    Tìm bot{' '}
                    <a
                      href="https://t.me/userinfobot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 font-bold hover:underline inline-flex items-center gap-0.5"
                    >
                      @userinfobot <ExternalLink className="w-2.5 h-2.5" />
                    </a>{' '}
                    $\rightarrow$ Nhắn <code className="bg-white dark:bg-slate-800 px-1 font-mono">/start</code> để lấy <strong>Id</strong> của bạn (Ví dụ: <code className="bg-white dark:bg-slate-800 px-1 font-mono">123456789</code>).
                  </li>
                  <li>
                    Dán Token và Chat ID vào 2 ô bên dưới và bấm <strong>Lưu & Kiểm Tra Thử</strong>.
                  </li>
                </ol>
              </div>

              {/* Input Forms */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Telegram Bot Token (từ @BotFather)
                  </label>
                  <input
                    type="password"
                    value={telegramConfig.botToken || ''}
                    onChange={(e) =>
                      setTelegramConfig((prev) => ({
                        ...prev,
                        botToken: e.target.value.trim(),
                      }))
                    }
                    placeholder="VD: 1234567890:ABCdefGHIjklMNOpqrs..."
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Danh Sách Telegram Chat ID Được Phép (Whitelist)
                  </label>
                  <input
                    type="text"
                    value={telegramChatIdsInput}
                    onChange={(e) => setTelegramChatIdsInput(e.target.value)}
                    placeholder="VD: 123456789, 987654321 (cách nhau bởi dấu phẩy)"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs"
                  />
                  <p className="text-[10px] text-slate-400">
                    Bảo mật tuyệt đối: Chỉ những tài khoản có Chat ID trên mới có quyền ra lệnh cho Bot.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="tg_enabled"
                    checked={telegramConfig.enabled}
                    onChange={(e) =>
                      setTelegramConfig((prev) => ({
                        ...prev,
                        enabled: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="tg_enabled" className="text-xs font-semibold cursor-pointer">
                    Bật kết nối Telegram Bot 2 chiều
                  </label>
                </div>
              </div>

              {/* Test Status Banner */}
              {telegramTestStatus.message && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    telegramTestStatus.success
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                  }`}
                >
                  {telegramTestStatus.message}
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={telegramTestStatus.loading}
                  onClick={handleTestTelegram}
                  className="h-10 rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${telegramTestStatus.loading ? 'animate-spin' : ''}`}
                  />
                  <span>Gửi Tin Nhắn Thử</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveTelegram}
                  className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>Lưu Cấu Hình</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
