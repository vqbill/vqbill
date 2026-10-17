import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Trophy,
  Flame,
  LayoutGrid,
  Volume2,
  VolumeX,
  Compass,
  Smile,
  Gift,
  RotateCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  ChevronRight,
  ArrowLeft,
  Crown,
  PartyPopper,
  Zap,
  Tag,
  Receipt,
  Eye,
  Plus,
  Trash2,
  Calendar,
  Layers,
  History,
  Info,
  UtensilsCrossed,
} from 'lucide-react';
import { BillRecord, BillItemRecord, StaffAccount } from '../types';
import { extractBillTableName, formatVND } from '../utils/parser';
import { convertSolar2Lunar } from './LunarCalendarFloatingWidget';
import {
  playWheelTickSound,
  playFanfareSound,
  playKachingSound,
  playChimeSound,
  triggerConfettiCelebration,
  isSoundMuted,
  toggleSoundMute,
} from '../utils/soundEffects';

export interface GamificationTabProps {
  bills: BillRecord[];
  billItems: BillItemRecord[];
  debts?: BillRecord[];
  todayStr?: string;
  isStandalone?: boolean;
  onBackToLogin?: () => void;
  onBackToWorkspace?: () => void;
  previousTabLabel?: string;
  onInspectBill?: (bill: BillRecord) => void;
  onOpenOcrWithTable?: (tableName: string) => void;
  onOpenOrderWithTable?: (tableName: string) => void;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
  currentStaffAccount?: StaffAccount | null;
}

interface WheelSlice {
  id: string;
  label: string;
  subLabel?: string;
  icon: string;
  color: string;
  textColor: string;
  probabilityWeight: number; // 1 = normal, higher = more frequent
}

interface WheelSpinRecord {
  id: string;
  timestamp: number;
  recipient: string;
  prize: string;
  mode: 'customer' | 'staff';
}

const DEFAULT_CUSTOMER_SLICES: WheelSlice[] = [
  { id: 'c1', label: 'Tặng 1 Dĩa Trái Cây', subLabel: 'Hoa quả tươi mát', icon: '🍉', color: '#10b981', textColor: '#ffffff', probabilityWeight: 2 },
  { id: 'c2', label: 'Tặng 2 Lon Bia', subLabel: 'Bia ướp lạnh', icon: '🍺', color: '#f59e0b', textColor: '#ffffff', probabilityWeight: 2 },
  { id: 'c3', label: 'Giảm 5% Tổng Bill', subLabel: 'Trừ trực tiếp', icon: '💸', color: '#3b82f6', textColor: '#ffffff', probabilityWeight: 1.5 },
  { id: 'c4', label: 'Tặng 1 Món Khai Vị', subLabel: 'Đậu phộng / chả ram', icon: '🥟', color: '#8b5cf6', textColor: '#ffffff', probabilityWeight: 2 },
  { id: 'c5', label: 'Giảm 10% Đồ Ăn', subLabel: 'Chỉ tính đồ ăn', icon: '🌟', color: '#ec4899', textColor: '#ffffff', probabilityWeight: 1 },
  { id: 'c6', label: 'Tặng 2 Lon Nước Ngọt', subLabel: 'Pepsi / 7Up / Redbull', icon: '🍹', color: '#06b6d4', textColor: '#ffffff', probabilityWeight: 2 },
  { id: 'c7', label: 'Chúc May Mắn Lần Sau', subLabel: 'Niềm vui nhân đôi', icon: '🍀', color: '#64748b', textColor: '#ffffff', probabilityWeight: 1.5 },
  { id: 'c8', label: 'Quà Bí Mật Chủ Quán', subLabel: 'Bất ngờ từ Vịnh Quán', icon: '🎁', color: '#e11d48', textColor: '#ffffff', probabilityWeight: 1 },
];

const DEFAULT_STAFF_SLICES: WheelSlice[] = [
  { id: 's1', label: 'Thưởng Nóng 100K', subLabel: 'Trao tay ngay', icon: '💵', color: '#10b981', textColor: '#ffffff', probabilityWeight: 1 },
  { id: 's2', label: '1 Ly Trà Sữa Full', subLabel: 'Uống tẹt ga', icon: '🥤', color: '#f59e0b', textColor: '#ffffff', probabilityWeight: 2 },
  { id: 's3', label: '1 Ngày Nghỉ Phép', subLabel: 'Nghỉ hưởng nguyên lương', icon: '🏖️', color: '#3b82f6', textColor: '#ffffff', probabilityWeight: 0.8 },
  { id: 's4', label: 'Cà Phê Sáng Tỉnh Táo', subLabel: 'Trọn tuần tràn trề', icon: '☕', color: '#8b5cf6', textColor: '#ffffff', probabilityWeight: 2 },
  { id: 's5', label: 'Lì Xì May Mắn 50K', subLabel: 'Lấy lộc đầu ca', icon: '🧧', color: '#e11d48', textColor: '#ffffff', probabilityWeight: 2 },
  { id: 's6', label: 'Ngôi Sao Phục Vụ Tuần', subLabel: 'Bảng vàng vinh danh', icon: '👑', color: '#f97316', textColor: '#ffffff', probabilityWeight: 1.5 },
  { id: 's7', label: 'Quà Bất Ngờ Quản Lý', subLabel: 'Niềm vui cuối ca', icon: '🎁', color: '#ec4899', textColor: '#ffffff', probabilityWeight: 1 },
  { id: 's8', label: 'Tuần Sau Rực Rỡ Hơn', subLabel: 'Cố lên bạn ơi!', icon: '🍀', color: '#64748b', textColor: '#ffffff', probabilityWeight: 1.5 },
];

const FUNNY_BAR_QUOTES = [
  'Hôm nay ngày tốt lành, chúc Vịnh Quán bia rót không kịp, khách vào nườm nượp, đĩa mồi vừa bưng ra đã hết sạch!',
  'Bia ngon phải có bạn hiền, Vịnh Quán đón khách tài tiền vô như nước!',
  'Trăm năm bia đá cũng mòn, ngàn năm bia lon tại Vịnh Quán vẫn luôn mát lạnh sảng khoái!',
  'Sáng mở hàng nụ cười rạng rỡ, chiều đếm tiền tay mỏi không ngừng!',
  'Khách vào như nước sông Đà, tài lộc cuồn cuộn đổ về Vịnh Quán!',
  'Bếp xào liền tay, Thu ngân kaching mỏi máy, Bàn nào cũng rôm rả nâng ly "Một Hai Ba Dô!"',
  'Có công mài sắt có ngày nên kim, có công phục vụ khách khen nức lòng!',
  'Mỗi vị khách đến là một niềm vui, mỗi nụ cười trao là vạn lộc tài!',
  'Rượu ngon ngàn chén không say, mồi ngon Vịnh Quán khách say vì tình!',
  'Ngày mới khí thế ngút trời, bill to nổ lớn tiếng cười giòn tan!',
];

const FENG_SHUI_TIPS = [
  {
    title: 'Xông Quán & Thắp Hương Thần Tài',
    desc: 'Đầu ca thay chén nước trắng tinh khiết, lau sạch đĩa hoa quả, thắp 3 nén hương thơm cầu mua may bán đắt.',
    icon: '🧧',
  },
  {
    title: 'Mèo Thần Tài Hướng Ra Cửa',
    desc: 'Đặt chú Mèo Thần Tài quay mặt thẳng ra lối cửa chính đón khách, kiểm tra pin để tay vẫy liên tục không bị vướng.',
    icon: '🐱',
  },
  {
    title: 'Đón Vị Khách Mở Hàng Niềm Nở',
    desc: 'Vị khách đầu tiên vào quán mang theo "vía mở hàng". Luôn chào đón bằng nụ cười tươi rói, phục vụ nhanh nhất có thể.',
    icon: '✨',
  },
  {
    title: 'Quầy Thu Ngân Gọn Gàng & Tươi Sáng',
    desc: 'Khu vực tính tiền là nơi tụ tài khí. Đặt một bình hoa cúc vàng hoặc cây kim tiền nhỏ để kích hoạt dòng tiền hanh thông.',
    icon: '💰',
  },
  {
    title: 'Lối Đi Thông Thoáng & Đầy Đủ Ánh Sáng',
    desc: 'Giữ các lối đi giữa các bàn luôn sạch sẽ, không để thùng rác hay chướng ngại vật chắn ngang dòng sinh khí lưu chuyển.',
    icon: '🏮',
  },
];

// Layout definition of tables for 2D Visual Floor Plan
interface FloorTableDef {
  id: string;
  name: string;
  area: 'garden' | 'indoor' | 'vip' | 'front';
  capacity: number;
  shape: 'circle' | 'rect';
}

const FLOOR_TABLES: FloorTableDef[] = [
  // Sân Trước / Quầy Bar
  { id: 'T01', name: 'Bàn 01', area: 'front', capacity: 4, shape: 'rect' },
  { id: 'T02', name: 'Bàn 02', area: 'front', capacity: 4, shape: 'rect' },
  { id: 'T03', name: 'Bàn 03', area: 'front', capacity: 4, shape: 'rect' },
  { id: 'T04', name: 'Bàn 04', area: 'front', capacity: 6, shape: 'rect' },
  { id: 'T05', name: 'Bàn 05', area: 'front', capacity: 6, shape: 'rect' },
  { id: 'T06', name: 'Bàn 06', area: 'front', capacity: 6, shape: 'rect' },

  // Sảnh Trong Nhà
  { id: 'T10', name: 'Bàn 10', area: 'indoor', capacity: 4, shape: 'rect' },
  { id: 'T11', name: 'Bàn 11', area: 'indoor', capacity: 4, shape: 'rect' },
  { id: 'T12', name: 'Bàn 12', area: 'indoor', capacity: 4, shape: 'rect' },
  { id: 'T14', name: 'Bàn 14', area: 'indoor', capacity: 6, shape: 'rect' },
  { id: 'T15', name: 'Bàn 15', area: 'indoor', capacity: 6, shape: 'rect' },
  { id: 'T16', name: 'Bàn 16', area: 'indoor', capacity: 6, shape: 'rect' },
  { id: 'T18', name: 'Bàn 18', area: 'indoor', capacity: 8, shape: 'rect' },
  { id: 'T20', name: 'Bàn 20', area: 'indoor', capacity: 8, shape: 'rect' },
  { id: 'T21', name: 'Bàn 21', area: 'indoor', capacity: 4, shape: 'rect' },
  { id: 'T22', name: 'Bàn 22', area: 'indoor', capacity: 4, shape: 'rect' },
  { id: 'T25', name: 'Bàn 25', area: 'indoor', capacity: 10, shape: 'rect' },
  { id: 'T26', name: 'Bàn 26', area: 'indoor', capacity: 8, shape: 'rect' },
  { id: 'T28', name: 'Bàn 28', area: 'indoor', capacity: 12, shape: 'rect' },
  { id: 'T30', name: 'Bàn 30', area: 'indoor', capacity: 8, shape: 'rect' },
  { id: 'T32', name: 'Bàn 32', area: 'indoor', capacity: 6, shape: 'rect' },
  { id: 'T35', name: 'Bàn 35', area: 'indoor', capacity: 10, shape: 'rect' },

  // Sân Vườn Ngoài Trời
  { id: 'V1', name: 'Bàn V1', area: 'garden', capacity: 6, shape: 'circle' },
  { id: 'V2', name: 'Bàn V2', area: 'garden', capacity: 6, shape: 'circle' },
  { id: 'V3', name: 'Bàn V3', area: 'garden', capacity: 6, shape: 'circle' },
  { id: 'V4', name: 'Bàn V4', area: 'garden', capacity: 8, shape: 'circle' },
  { id: 'V5', name: 'Bàn V5', area: 'garden', capacity: 8, shape: 'circle' },
  { id: 'V6', name: 'Bàn V6', area: 'garden', capacity: 10, shape: 'circle' },
  { id: 'V7', name: 'Bàn V7', area: 'garden', capacity: 10, shape: 'circle' },
  { id: 'V8', name: 'Bàn V8', area: 'garden', capacity: 12, shape: 'circle' },

  // Phòng VIP Máy Lạnh
  { id: 'VIP1', name: 'VIP 1', area: 'vip', capacity: 10, shape: 'rect' },
  { id: 'VIP2', name: 'VIP 2', area: 'vip', capacity: 12, shape: 'rect' },
  { id: 'VIP3', name: 'VIP 3', area: 'vip', capacity: 16, shape: 'rect' },
  { id: 'VIP5', name: 'VIP 5', area: 'vip', capacity: 20, shape: 'rect' },
];

export const GamificationTab: React.FC<GamificationTabProps> = ({
  bills,
  billItems,
  debts = [],
  todayStr,
  isStandalone = false,
  onBackToLogin,
  onBackToWorkspace,
  previousTabLabel,
  onInspectBill,
  onOpenOcrWithTable,
  onOpenOrderWithTable,
  darkMode = false,
  onToggleDarkMode,
  currentStaffAccount,
}) => {
  // Navigation inside this tab
  type SubTabId = 'wheel' | 'floor' | 'leaderboard' | 'fengshui';
  const [subTab, setSubTab] = useState<SubTabId>('wheel');

  // Global sound state
  const [soundMuted, setSoundMutedState] = useState<boolean>(() => isSoundMuted());

  useEffect(() => {
    const handleMuteChange = (e: CustomEvent) => {
      setSoundMutedState(Boolean(e.detail?.muted));
    };
    window.addEventListener('vq_sound_mute_changed' as any, handleMuteChange);
    return () => window.removeEventListener('vq_sound_mute_changed' as any, handleMuteChange);
  }, []);

  const handleToggleMute = () => {
    const next = toggleSoundMute();
    setSoundMutedState(next);
  };

  // --------------------------------------------------------------------------
  // 1. LUCKY WHEEL ENGINE (VÒNG QUAY MAY MẮN)
  // --------------------------------------------------------------------------
  const [wheelMode, setWheelMode] = useState<'customer' | 'staff'>('customer');
  const [customerSlices, setCustomerSlices] = useState<WheelSlice[]>(() => {
    try {
      const saved = localStorage.getItem('vq_wheel_customer_slices');
      return saved ? JSON.parse(saved) : DEFAULT_CUSTOMER_SLICES;
    } catch {
      return DEFAULT_CUSTOMER_SLICES;
    }
  });
  const [staffSlices, setStaffSlices] = useState<WheelSlice[]>(() => {
    try {
      const saved = localStorage.getItem('vq_wheel_staff_slices');
      return saved ? JSON.parse(saved) : DEFAULT_STAFF_SLICES;
    } catch {
      return DEFAULT_STAFF_SLICES;
    }
  });

  const activeSlices = wheelMode === 'customer' ? customerSlices : staffSlices;

  const [spinRecipient, setSpinRecipient] = useState<string>('');
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [winningSlice, setWinningSlice] = useState<WheelSlice | null>(null);
  const [winningRecipient, setWinningRecipient] = useState<string>('');
  const [showWinnerModal, setShowWinnerModal] = useState<boolean>(false);

  // Wheel history
  const [spinHistory, setSpinHistory] = useState<WheelSpinRecord[]>(() => {
    try {
      const saved = localStorage.getItem('vq_wheel_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const saveSpinHistory = (rec: WheelSpinRecord) => {
    setSpinHistory((prev) => {
      const next = [rec, ...prev].slice(0, 50);
      try {
        localStorage.setItem('vq_wheel_history', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const animFrameRef = useRef<number | null>(null);
  const lastPegRef = useRef<number>(-1);

  const handleSpinWheel = () => {
    if (isSpinning || activeSlices.length === 0) return;

    setIsSpinning(true);
    setWinningSlice(null);

    // Weighted random selection of winner
    const totalWeight = activeSlices.reduce((acc, s) => acc + (s.probabilityWeight || 1), 0);
    let rand = Math.random() * totalWeight;
    let selectedIdx = 0;
    for (let i = 0; i < activeSlices.length; i++) {
      rand -= activeSlices[i].probabilityWeight || 1;
      if (rand <= 0) {
        selectedIdx = i;
        break;
      }
    }

    const sliceAngle = 360 / activeSlices.length;
    // Angle needed so slice selectedIdx centers at top (0 or 360 deg)
    // Slices are drawn starting from 0 to 360. Pointer is at 90 deg or 270 deg or 0 deg (top).
    // Let's assume Pointer is at 270 deg (top: 12 o'clock).
    // Center of slice i is i * sliceAngle + sliceAngle / 2.
    // To land slice center at 270 deg:
    const targetSliceCenter = selectedIdx * sliceAngle + sliceAngle / 2;
    const offsetToTop = (270 - targetSliceCenter + 360) % 360;

    // Minimum 5 full spins (1800 deg) up to 8 full spins + offset
    const fullSpins = 360 * (5 + Math.floor(Math.random() * 3));
    const currentNorm = rotationAngle % 360;
    const finalAngle = rotationAngle + (360 - currentNorm) + fullSpins + offsetToTop;

    const startAngle = rotationAngle;
    const deltaAngle = finalAngle - startAngle;
    const duration = 5500; // 5.5 seconds of suspense
    const startTime = performance.now();

    lastPegRef.current = -1;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);

      // Ease-out cubic or quintic deceleration
      // 1 - Math.pow(1 - progress, 4)
      const ease = 1 - Math.pow(1 - progress, 4);
      const currentAngle = startAngle + deltaAngle * ease;
      setRotationAngle(currentAngle);

      // Sound ticking as pegs pass
      const currentSliceIdx = Math.floor((currentAngle % 360) / sliceAngle);
      if (currentSliceIdx !== lastPegRef.current) {
        lastPegRef.current = currentSliceIdx;
        playWheelTickSound();
      }

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setIsSpinning(false);
        const winner = activeSlices[selectedIdx];
        setWinningSlice(winner);
        const rec = spinRecipient.trim() || (wheelMode === 'customer' ? 'Bàn may mắn' : 'Nhân viên xuất sắc');
        setWinningRecipient(rec);
        setShowWinnerModal(true);

        // Celebrations!
        triggerConfettiCelebration({
          title: `🎉 TRÚNG THƯỞNG: ${winner.label}!`,
          message: `${rec} đã quay trúng "${winner.label}"`,
          durationMs: 5000,
        });

        saveSpinHistory({
          id: `spin_${Date.now()}`,
          timestamp: Date.now(),
          recipient: rec,
          prize: winner.label,
          mode: wheelMode,
        });
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // --------------------------------------------------------------------------
  // 2. VISUAL 2D FLOOR PLAN (SƠ ĐỒ BÀN TRỰC QUAN)
  // --------------------------------------------------------------------------
  const [selectedArea, setSelectedArea] = useState<string>('all');
  const [selectedTable, setSelectedTable] = useState<FloorTableDef | null>(null);
  const [manualTableStatus, setManualTableStatus] = useState<Record<string, 'occupied' | 'empty'>>({});

  // Compute table status from today's bills & debts
  const tableStatusMap = useMemo(() => {
    const map: Record<
      string,
      {
        status: 'occupied' | 'debt' | 'empty';
        bills: BillRecord[];
        totalAmount: number;
        debtAmount: number;
        debtorName?: string;
      }
    > = {};

    FLOOR_TABLES.forEach((tbl) => {
      map[tbl.id] = { status: 'empty', bills: [], totalAmount: 0, debtAmount: 0 };
    });

    // Check debts
    debts.forEach((b) => {
      if (b.debtStatus !== 'paid') {
        const tblName = extractBillTableName(b, '').toLowerCase();
        FLOOR_TABLES.forEach((tbl) => {
          const matchKey = tbl.name.toLowerCase();
          if (tblName.includes(matchKey) || tblName.includes(tbl.id.toLowerCase())) {
            map[tbl.id].status = 'debt';
            map[tbl.id].debtAmount += Math.max(0, b.totalAmount - (b.deductedAmount || 0));
            map[tbl.id].debtorName = b.debtorName;
            map[tbl.id].bills.push(b);
          }
        });
      }
    });

    // Check today's bills (if not in debt)
    bills.forEach((b) => {
      const tblName = extractBillTableName(b, '').toLowerCase();
      FLOOR_TABLES.forEach((tbl) => {
        const matchKey = tbl.name.toLowerCase();
        if (tblName.includes(matchKey) || tblName.includes(tbl.id.toLowerCase())) {
          if (map[tbl.id].status !== 'debt') {
            map[tbl.id].status = 'occupied';
          }
          map[tbl.id].totalAmount += b.totalAmount;
          if (!map[tbl.id].bills.some((x) => x.id === b.id)) {
            map[tbl.id].bills.push(b);
          }
        }
      });
    });

    // Apply manual overrides if toggled
    Object.entries(manualTableStatus).forEach(([tblId, st]) => {
      if (map[tblId]) {
        if (st === 'empty' && map[tblId].status === 'occupied') {
          map[tblId].status = 'empty';
        } else if (st === 'occupied' && map[tblId].status === 'empty') {
          map[tblId].status = 'occupied';
        }
      }
    });

    return map;
  }, [bills, debts, manualTableStatus]);

  const filteredTables = useMemo(() => {
    if (selectedArea === 'all') return FLOOR_TABLES;
    return FLOOR_TABLES.filter((t) => t.area === selectedArea);
  }, [selectedArea]);

  const floorStats = useMemo(() => {
    let occupied = 0;
    let debt = 0;
    let empty = 0;
    FLOOR_TABLES.forEach((tbl) => {
      const st = tableStatusMap[tbl.id]?.status || 'empty';
      if (st === 'occupied') occupied++;
      else if (st === 'debt') debt++;
      else empty++;
    });
    const occupancyRate = Math.round(((occupied + debt) / FLOOR_TABLES.length) * 100);
    return { occupied, debt, empty, total: FLOOR_TABLES.length, occupancyRate };
  }, [tableStatusMap]);

  // --------------------------------------------------------------------------
  // 3. LEADERBOARD & BEST SELLERS (BẢNG VÀNG DOANH SỐ)
  // --------------------------------------------------------------------------
  const topDishes = useMemo(() => {
    const map: Record<string, { name: string; category: string; quantity: number; revenue: number }> = {};

    billItems.forEach((it) => {
      if (!map[it.productName]) {
        map[it.productName] = {
          name: it.productName,
          category: it.category || 'Món ăn',
          quantity: 0,
          revenue: 0,
        };
      }
      const netQty = Math.max(0, it.quantity - (it.returnedQuantity || 0));
      map[it.productName].quantity += netQty;
      map[it.productName].revenue += netQty * (it.unitPrice || 0);
    });

    return Object.values(map)
      .filter((d) => d.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
  }, [billItems]);

  const topVipBills = useMemo(() => {
    return [...bills]
      .filter((b) => b.totalAmount > 0)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);
  }, [bills]);

  const totalTodaySales = useMemo(() => {
    return bills.reduce((acc, b) => acc + (b.totalAmount || 0), 0);
  }, [bills]);

  // Target milestones (5tr, 10tr, 15tr, 20tr, 25tr, 30tr)
  const milestones = [5000000, 10000000, 15000000, 20000000, 25000000, 30000000];
  const nextMilestone = milestones.find((m) => m > totalTodaySales) || 30000000;
  const milestoneProgress = Math.min(100, Math.round((totalTodaySales / nextMilestone) * 100));

  // --------------------------------------------------------------------------
  // 4. FENG SHUI & DAILY FUN QUOTE (MẸO PHONG THỦY & CÂU NÓI VUI)
  // --------------------------------------------------------------------------
  const now = new Date();
  const lunarInfo = useMemo(() => {
    return convertSolar2Lunar(now.getDate(), now.getMonth() + 1, now.getFullYear(), now.getHours());
  }, []);

  const [quoteIdx, setQuoteIdx] = useState<number>(() => {
    // Deterministic quote based on day of year, but changeable
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
    return dayOfYear % FUNNY_BAR_QUOTES.length;
  });

  const handleNextQuote = () => {
    setQuoteIdx((prev) => (prev + 1) % FUNNY_BAR_QUOTES.length);
    playChimeSound();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Standalone Header if unauthenticated */}
      {isStandalone && (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl shadow-inner">
              🎡
            </span>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-200">
                Vịnh Quán F&B · Minigame & Tiện Ích
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                Khu Vui Chơi, Vòng Quay & Phong Thủy
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleMute}
              className={`p-2.5 rounded-2xl border transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                soundMuted
                  ? 'bg-rose-500/20 border-rose-300/40 text-rose-200 hover:bg-rose-500/30'
                  : 'bg-white/15 border-white/20 text-white hover:bg-white/25'
              }`}
              title={soundMuted ? 'Đang Tắt Âm Thanh — Bấm để Bật' : 'Đang Bật Âm Thanh — Bấm để Tắt'}
            >
              {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{soundMuted ? 'Tắt âm' : 'Bật âm'}</span>
            </button>

            {onToggleDarkMode && (
              <button
                type="button"
                onClick={onToggleDarkMode}
                className="p-2.5 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 text-white transition-colors cursor-pointer"
                title="Đổi giao diện Sáng / Tối"
              >
                {darkMode ? '☀️ Sáng' : '🌙 Tối'}
              </button>
            )}

            {onBackToLogin && (
              <button
                type="button"
                onClick={onBackToLogin}
                className="px-4 py-2.5 rounded-2xl bg-white text-emerald-800 hover:bg-emerald-50 text-xs sm:text-sm font-extrabold shadow-md flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>🔐 Đăng Nhập Hệ Thống</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* If inside workspace (authenticated), show return button and quick sound toggle */}
      {!isStandalone && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white flex items-center justify-center text-lg shadow-xs">
              🎡
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Khu Vui Chơi & Sơ Đồ Bàn</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                  Interactive Hub
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Vòng quay may mắn, sơ đồ bàn 2D, bảng vàng bán chạy và mẹo phong thủy ngày mới
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleMute}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                soundMuted
                  ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                  : 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
              }`}
              title={soundMuted ? 'Đang Tắt Âm Thanh — Bấm để Mở lại' : 'Đang Bật Âm Thanh — Bấm để Tắt'}
            >
              {soundMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{soundMuted ? 'Âm thanh: Tắt' : 'Âm thanh: Bật'}</span>
            </button>

            {onBackToWorkspace && (
              <button
                type="button"
                onClick={onBackToWorkspace}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Về {previousTabLabel || 'Trang chủ'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sub navigation bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200/80 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setSubTab('wheel')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            subTab === 'wheel'
              ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <span>🎡</span>
          <span>Vòng Quay May Mắn</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('floor')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            subTab === 'floor'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <span>🗺️</span>
          <span>Sơ Đồ Bàn 2D</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {floorStats.occupied} có khách
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('leaderboard')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            subTab === 'leaderboard'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <span>🏆</span>
          <span>Bảng Vàng & Món Ngôi Sao</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('fengshui')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            subTab === 'fengshui'
              ? 'bg-rose-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <span>🧧</span>
          <span>Phong Thủy & Câu Nói Vui</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* 1. VÒNG QUAY MAY MẮN (LUCKY WHEEL) */}
      {/* ===================================================================== */}
      {subTab === 'wheel' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Wheel Display & Spin Button */}
          <div className="lg:col-span-7 xl:col-span-8 p-5 sm:p-7 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col items-center">
            {/* Mode Switcher */}
            <div className="w-full max-w-md flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 mb-6">
              <button
                type="button"
                onClick={() => {
                  setWheelMode('customer');
                  setWinningSlice(null);
                }}
                className={`flex-1 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  wheelMode === 'customer'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <span>🎁 Dành Cho Khách Hàng</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setWheelMode('staff');
                  setWinningSlice(null);
                }}
                className={`flex-1 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  wheelMode === 'staff'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <span>👑 Dành Cho Nhân Viên</span>
              </button>
            </div>

            {/* Recipient Input */}
            <div className="w-full max-w-sm mb-4">
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                {wheelMode === 'customer' ? 'Số Bàn / Tên Khách Quay Thưởng:' : 'Tên Nhân Viên Quay Thưởng:'}
              </label>
              <input
                type="text"
                value={spinRecipient}
                onChange={(e) => setSpinRecipient(e.target.value)}
                placeholder={wheelMode === 'customer' ? 'Ví dụ: Bàn 25, VIP 2, Anh Tuấn...' : 'Ví dụ: Em Lan, Bạn Hùng...'}
                disabled={isSpinning}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Canvas Wheel Outer Frame */}
            <div className="relative w-[310px] h-[310px] sm:w-[380px] sm:h-[380px] my-3 flex items-center justify-center">
              {/* Golden Pointer at 12 o'clock */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none drop-shadow-lg">
                <div className="w-7 h-9 bg-gradient-to-b from-amber-400 to-amber-600 rounded-b-full clip-path-triangle shadow-md border border-amber-200 animate-pulse" />
                <div className="w-3 h-3 rounded-full bg-red-600 border-2 border-white -mt-2 shadow-xs" />
              </div>

              {/* Outer Decorative Ring with LED Lights */}
              <div className="absolute inset-0 rounded-full border-8 border-amber-400 dark:border-amber-500 shadow-2xl p-2 bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-600">
                {/* SVG Rotating Slices */}
                <svg
                  className="w-full h-full rounded-full overflow-hidden"
                  viewBox="0 0 400 400"
                  style={{
                    transform: `rotate(${rotationAngle}deg)`,
                    transition: isSpinning ? 'none' : 'transform 0.2s ease-out',
                  }}
                >
                  {activeSlices.map((slice, i) => {
                    const sliceAngle = 360 / activeSlices.length;
                    const startAngle = i * sliceAngle;
                    const endAngle = startAngle + sliceAngle;

                    const r = 200;
                    const cx = 200;
                    const cy = 200;

                    const startRad = (startAngle * Math.PI) / 180;
                    const endRad = (endAngle * Math.PI) / 180;

                    const x1 = cx + r * Math.cos(startRad);
                    const y1 = cy + r * Math.sin(startRad);
                    const x2 = cx + r * Math.cos(endRad);
                    const y2 = cy + r * Math.sin(endRad);

                    const largeArc = sliceAngle > 180 ? 1 : 0;
                    const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

                    // Text rotation angle
                    const midAngle = startAngle + sliceAngle / 2;
                    const textRad = (midAngle * Math.PI) / 180;
                    const textDist = 125;
                    const tx = cx + textDist * Math.cos(textRad);
                    const ty = cy + textDist * Math.sin(textRad);

                    return (
                      <g key={slice.id}>
                        <path d={pathData} fill={slice.color} stroke="#ffffff" strokeWidth="2.5" />
                        <g transform={`translate(${tx}, ${ty}) rotate(${midAngle + 90})`}>
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill={slice.textColor}
                            fontSize="11"
                            fontWeight="800"
                            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                          >
                            {slice.icon} {slice.label.length > 15 ? slice.label.slice(0, 14) + '…' : slice.label}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </svg>

                {/* Center Hub */}
                <div
                  onClick={handleSpinWheel}
                  className={`absolute inset-0 m-auto w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 border-4 border-white shadow-xl flex flex-col items-center justify-center cursor-pointer transition-transform ${
                    isSpinning ? 'scale-95 opacity-90' : 'hover:scale-105 active:scale-95'
                  }`}
                >
                  <span className="text-xl sm:text-2xl">🎡</span>
                  <span className="text-[10px] sm:text-xs font-black uppercase text-amber-950 tracking-wider">
                    {isSpinning ? 'Đang quay...' : 'QUAY NGAY'}
                  </span>
                </div>
              </div>
            </div>

            {/* Spin CTA Button */}
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                disabled={isSpinning}
                onClick={handleSpinWheel}
                className="px-8 py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:from-amber-600 hover:to-purple-700 text-white font-extrabold text-sm sm:text-base shadow-lg transition-transform active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                <Sparkles className="w-5 h-5 text-yellow-200 animate-spin" />
                <span>{isSpinning ? 'Vòng Quay Đang Lăn...' : 'BẤM ĐỂ QUAY THƯỞNG!'}</span>
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 text-center max-w-md">
              💡 {wheelMode === 'customer'
                ? 'Dành cho bàn hóa đơn trên 1.000.000đ hoặc khách đặt tiệc trước. Thu ngân quay ngay tại bàn tạo không khí sôi động!'
                : 'Dành cho nhân viên xuất sắc cuối tuần hoặc dịp lễ, tạo động lực làm việc hứng khởi!'}
            </p>
          </div>

          {/* Right Column: Prizes List & Spin History */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-4">
            {/* Prizes List */}
            <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-amber-500" />
                  <span>Danh Sách Giải Thưởng ({activeSlices.length})</span>
                </h3>
                <span className="text-[10px] font-bold uppercase text-slate-400">
                  {wheelMode === 'customer' ? 'Khách Hàng' : 'Nhân Viên'}
                </span>
              </div>

              <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                {activeSlices.map((slice) => (
                  <div
                    key={slice.id}
                    className="flex items-center justify-between p-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">{slice.icon}</span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {slice.label}
                        </div>
                        {slice.subLabel && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {slice.subLabel}
                          </div>
                        )}
                      </div>
                    </div>
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs"
                      style={{ backgroundColor: slice.color }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Spin History */}
            <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <History className="w-4 h-4 text-emerald-500" />
                  <span>Lịch Sử Trúng Thưởng Gần Đây</span>
                </h3>
                {spinHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSpinHistory([]);
                      localStorage.removeItem('vq_wheel_history');
                    }}
                    className="text-[10px] text-slate-400 hover:text-rose-500 cursor-pointer"
                  >
                    Xóa lịch sử
                  </button>
                )}
              </div>

              {spinHistory.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  Chưa có lượt quay nào hôm nay. Hãy quay thử ngay!
                </div>
              ) : (
                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                  {spinHistory.slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {item.recipient}
                        </div>
                        <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          🎉 {item.prize}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {new Date(item.timestamp).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. SƠ ĐỒ BÀN TRỰC QUAN 2D (VISUAL FLOOR PLAN) */}
      {/* ===================================================================== */}
      {subTab === 'floor' && (
        <div className="space-y-4">
          {/* Floor Summary Metrics & Filter Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                <span>🟢 Đang phục vụ</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <div className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-300">
                {floorStats.occupied} bàn
              </div>
              <div className="text-[11px] text-emerald-600/80">Khách đang ngồi ăn</div>
            </div>

            <div className="p-3.5 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20">
              <div className="text-amber-700 dark:text-amber-300 text-xs font-bold">
                🟠 Đang ghi nợ
              </div>
              <div className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-300">
                {floorStats.debt} bàn
              </div>
              <div className="text-[11px] text-amber-600/80">Chưa tất toán bill</div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="text-slate-500 dark:text-slate-400 text-xs font-bold">
                ⚪ Bàn trống sẵn sàng
              </div>
              <div className="mt-1 text-2xl font-black text-slate-800 dark:text-slate-200">
                {floorStats.empty} bàn
              </div>
              <div className="text-[11px] text-slate-400">Sẵn sàng đón khách</div>
            </div>

            <div className="p-3.5 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/70 dark:bg-indigo-950/20">
              <div className="text-indigo-700 dark:text-indigo-300 text-xs font-bold">
                📊 Tỷ lệ lấp đầy
              </div>
              <div className="mt-1 text-2xl font-black text-indigo-700 dark:text-indigo-300">
                {floorStats.occupancyRate}%
              </div>
              <div className="text-[11px] text-indigo-600/80">{floorStats.total} bàn tất cả</div>
            </div>
          </div>

          {/* Area Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'all', label: `Tất cả (${FLOOR_TABLES.length})` },
              { id: 'front', label: 'Quầy bar / Sân trước (6)' },
              { id: 'indoor', label: 'Sảnh trong nhà (16)' },
              { id: 'garden', label: 'Sân vườn ngoài trời (8)' },
              { id: 'vip', label: 'Phòng VIP máy lạnh (4)' },
            ].map((area) => (
              <button
                key={area.id}
                type="button"
                onClick={() => setSelectedArea(area.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  selectedArea === area.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {area.label}
              </button>
            ))}
          </div>

          {/* Floor Plan Visual Grid */}
          <div className="p-4 sm:p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
              {filteredTables.map((tbl) => {
                const info = tableStatusMap[tbl.id] || { status: 'empty', bills: [], totalAmount: 0, debtAmount: 0 };
                const isOccupied = info.status === 'occupied';
                const isDebt = info.status === 'debt';
                const isEmpty = info.status === 'empty';

                return (
                  <div
                    key={tbl.id}
                    onClick={() => setSelectedTable(tbl)}
                    className={`relative p-3 rounded-2xl cursor-pointer transition-all hover:scale-105 active:scale-95 flex flex-col justify-between min-h-[110px] ${
                      isOccupied
                        ? 'border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 shadow-md ring-2 ring-emerald-400/30 animate-pulse'
                        : isDebt
                        ? 'border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 shadow-md'
                        : 'border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    {/* Header: Name & Shape Icon */}
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs sm:text-sm">{tbl.name}</span>
                      <span className="text-[10px] font-bold opacity-75">
                        {tbl.shape === 'circle' ? '⭕' : '🔲'} {tbl.capacity}c
                      </span>
                    </div>

                    {/* Middle: Status indicator & Badge */}
                    <div className="my-1.5">
                      {isOccupied && (
                        <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                          {info.totalAmount > 0 ? formatVND(info.totalAmount) : 'Có khách'}
                        </div>
                      )}
                      {isDebt && (
                        <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                          Nợ: {formatVND(info.debtAmount)}
                        </div>
                      )}
                      {isEmpty && (
                        <div className="text-[10px] text-slate-400 font-medium">Bàn trống</div>
                      )}
                    </div>

                    {/* Footer: Area tag */}
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      {tbl.area === 'garden'
                        ? 'Sân vườn'
                        : tbl.area === 'vip'
                        ? 'Phòng VIP'
                        : tbl.area === 'front'
                        ? 'Sân trước'
                        : 'Trong nhà'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. BẢNG VÀNG DOANH SỐ & MÓN NGÔI SAO (LEADERBOARD) */}
      {/* ===================================================================== */}
      {subTab === 'leaderboard' && (
        <div className="space-y-6">
          {/* Target Milestone Progress Card */}
          <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 text-white shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-amber-200">
                  🎯 Cột Mốc Doanh Số Ca Làm Việc
                </div>
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">
                  {formatVND(totalTodaySales)}{' '}
                  <span className="text-sm sm:text-base font-normal text-amber-100">
                    / Mục tiêu {formatVND(nextMilestone)}
                  </span>
                </h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerConfettiCelebration({
                    title: '🎉 CHÚC MỪNG KỶ LỤC DOANH SỐ MỚI! 🎉',
                    message: `Vịnh Quán đã đạt doanh số kỷ lục ấn tượng trong ngày hôm nay!`,
                  });
                }}
                className="px-4 py-2.5 rounded-2xl bg-white text-rose-600 hover:bg-rose-50 text-xs sm:text-sm font-extrabold shadow-md flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer whitespace-nowrap self-start sm:self-auto"
              >
                <PartyPopper className="w-4 h-4 text-amber-500" />
                <span>Bắn Pháo Hoa Ăn Mừng 🎊</span>
              </button>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                <span>Tiến độ ngày: {milestoneProgress}%</span>
                <span>
                  {milestoneProgress >= 100
                    ? '🏆 Đã vượt mốc thành công!'
                    : `Còn ${formatVND(nextMilestone - totalTodaySales)} để đạt mốc`}
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-white/20 overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-amber-200 transition-all duration-500"
                  style={{ width: `${milestoneProgress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Top 3 Best Seller Star Dishes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-rose-500" />
                <span>Top 3 Món "Ngôi Sao" Bán Chạy Nhất Hôm Nay</span>
              </h3>
              <span className="text-xs font-semibold text-slate-500">Bếp & Thu ngân chủ động đẩy món</span>
            </div>

            {topDishes.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                Chưa có dữ liệu món bán trong ngày. Khi nhập bill mới, top món bán chạy sẽ tự động vinh danh tại đây!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {topDishes.slice(0, 3).map((dish, idx) => {
                  const medals = [
                    { rank: 1, title: 'Hạng 1', icon: '🥇', bg: 'from-amber-400 to-yellow-500', border: 'border-amber-400 ring-2 ring-amber-300/40' },
                    { rank: 2, title: 'Hạng 2', icon: '🥈', bg: 'from-slate-300 to-slate-400', border: 'border-slate-300' },
                    { rank: 3, title: 'Hạng 3', icon: '🥉', bg: 'from-amber-600 to-orange-700', border: 'border-amber-600' },
                  ][idx];

                  return (
                    <div
                      key={dish.name}
                      className={`relative p-5 rounded-3xl border bg-white dark:bg-slate-900 shadow-md flex flex-col justify-between ${medals.border}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-3xl">{medals.icon}</span>
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <Flame className="w-3 h-3 text-rose-500" />
                          <span>Hot Trend</span>
                        </span>
                      </div>

                      <div className="my-3">
                        <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                          {dish.category}
                        </div>
                        <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-0.5 truncate">
                          {dish.name}
                        </h4>
                      </div>

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-slate-400">Số lượng bán:</div>
                          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                            {dish.quantity} phần
                          </div>
                        </div>
                        {dish.revenue > 0 && (
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400">Doanh thu món:</div>
                            <div className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                              {formatVND(dish.revenue)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top VIP Bills today */}
          {topVipBills.length > 0 && (
            <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-500" />
                  <span>Top Hóa Đơn "VIP Khủng" Trong Ngày</span>
                </h3>
                <span className="text-xs text-slate-400">Các bàn tiệc nổi bật</span>
              </div>

              <div className="space-y-2">
                {topVipBills.map((b, i) => (
                  <div
                    key={b.id}
                    onClick={() => onInspectBill && onInspectBill(b)}
                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-black text-xs flex items-center justify-center">
                        #{i + 1}
                      </span>
                      <div>
                        <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                          {extractBillTableName(b, 'Bàn lẻ')} · {b.billCode}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {b.checkInTime || b.checkOutTime || 'Hôm nay'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        {formatVND(b.totalAmount)}
                      </div>
                      <div className="text-[10px] text-slate-400">Bấm xem chi tiết bill</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 4. MẸO PHONG THỦY & CÂU NÓI VUI CHO NGÀY MỚI */}
      {/* ===================================================================== */}
      {subTab === 'fengshui' && (
        <div className="space-y-5">
          {/* Daily Fun Quote Banner */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-rose-500 via-pink-600 to-amber-500 text-white shadow-xl relative overflow-hidden">
            <div className="text-xs font-black uppercase tracking-wider text-rose-200 flex items-center gap-1.5">
              <Smile className="w-4 h-4 text-yellow-300" />
              <span>Châm Ngôn Quán Nhậu & Lời Chúc Ngày Mới</span>
            </div>

            <div className="my-4 text-base sm:text-xl font-bold leading-relaxed tracking-tight">
              "{FUNNY_BAR_QUOTES[quoteIdx]}"
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-rose-100">Vịnh Quán F&B · Năng lượng khởi đầu ca làm</span>
              <button
                type="button"
                onClick={handleNextQuote}
                className="px-3.5 py-1.5 rounded-xl bg-white text-rose-600 hover:bg-rose-50 text-xs font-extrabold shadow-xs flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Đổi câu vui khác 🎲</span>
              </button>
            </div>
          </div>

          {/* Auspicious Hours & Lunar Info */}
          <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-emerald-500" />
              <span>Giờ Hoàng Đạo Mở Hàng & Thông Tin Ngày Lành</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[11px] text-slate-400 font-bold uppercase">Ngày Âm Lịch</div>
                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                  Ngày {lunarInfo.lunarDay}/{lunarInfo.lunarMonth}
                </div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                  {lunarInfo.dayCanChi} ({lunarInfo.tietKhi})
                </div>
              </div>

              <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[11px] text-slate-400 font-bold uppercase">Hướng Xuất Hành Hút Lộc</div>
                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                  Đông Nam & Chính Nam
                </div>
                <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                  Hỷ Thần & Tài Thần chiếu rọi
                </div>
              </div>

              <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[11px] text-slate-400 font-bold uppercase">Giờ Hoàng Đạo Hôm Nay</div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 leading-relaxed">
                  {lunarInfo.auspiciousHours}
                </div>
              </div>
            </div>
          </div>

          {/* 5 Feng Shui Tips */}
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
              <Compass className="w-4 h-4 text-amber-500" />
              <span>5 Mẹo Phong Thủy Quán Nhậu Hút Khách & Chiêu Tài Lộc</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FENG_SHUI_TIPS.map((tip, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-start gap-3"
                >
                  <span className="text-2xl shrink-0 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40">
                    {tip.icon}
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      {idx + 1}. {tip.title}
                    </h4>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {tip.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: TABLE DETAIL POPUP FROM FLOOR PLAN */}
      {/* ===================================================================== */}
      {selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">
                  {selectedTable.shape === 'circle' ? '⭕' : '🔲'}
                </span>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {selectedTable.name}
                  </h3>
                  <div className="text-xs text-slate-500">
                    Khu vực:{' '}
                    {selectedTable.area === 'garden'
                      ? 'Sân Vườn Ngoài Trời'
                      : selectedTable.area === 'vip'
                      ? 'Phòng VIP Máy Lạnh'
                      : selectedTable.area === 'front'
                      ? 'Sân Trước / Quầy Bar'
                      : 'Sảnh Trong Nhà'}{' '}
                    · Sức chứa {selectedTable.capacity} người
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTable(null)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Current Status */}
            <div>
              <div className="text-xs font-bold text-slate-500 mb-1.5">Trạng thái hiện tại:</div>
              {(() => {
                const info = tableStatusMap[selectedTable.id];
                if (info?.status === 'occupied') {
                  return (
                    <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-xs">
                      <div className="font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span>Đang có khách ngồi ăn</span>
                      </div>
                      <div className="mt-1 font-mono font-bold text-sm">
                        Tổng tiền tạm tính: {formatVND(info.totalAmount)}
                      </div>
                    </div>
                  );
                }
                if (info?.status === 'debt') {
                  return (
                    <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        <span>Đang ghi nợ (Chưa tất toán)</span>
                      </div>
                      <div className="mt-1 font-mono font-bold text-sm">
                        Số tiền nợ: {formatVND(info.debtAmount)} ({info.debtorName || 'Khách nợ'})
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 text-xs">
                    ⚪ Bàn trống sẵn sàng đón khách
                  </div>
                );
              })()}
            </div>

            {/* Actions for this table */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {onOpenOrderWithTable && (
                <button
                  type="button"
                  onClick={() => {
                    const tbl = selectedTable;
                    setSelectedTable(null);
                    onOpenOrderWithTable(tbl.name);
                  }}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <UtensilsCrossed className="w-4 h-4" />
                  <span>Order Món Cho Bàn Này (Báo Bếp & In Bill)</span>
                </button>
              )}

              {onOpenOcrWithTable && (
                <button
                  type="button"
                  onClick={() => {
                    const tbl = selectedTable;
                    setSelectedTable(null);
                    onOpenOcrWithTable(tbl.name);
                  }}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Receipt className="w-4 h-4" />
                  <span>Nhập Bill Cho Bàn Này (+ Tạo Bill)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setSpinRecipient(selectedTable.name);
                  setSubTab('wheel');
                  setSelectedTable(null);
                }}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <span>🎡 Mở Vòng Quay May Mắn Cho Bàn Này</span>
              </button>

              {/* Quick toggle status */}
              <button
                type="button"
                onClick={() => {
                  const currentSt = tableStatusMap[selectedTable.id]?.status || 'empty';
                  setManualTableStatus((prev) => ({
                    ...prev,
                    [selectedTable.id]: currentSt === 'occupied' ? 'empty' : 'occupied',
                  }));
                }}
                className="w-full py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>
                  Đổi trạng thái:{' '}
                  {tableStatusMap[selectedTable.id]?.status === 'occupied'
                    ? 'Chuyển thành Bàn Trống'
                    : 'Đánh dấu Có Khách'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: WINNER CELEBRATION */}
      {/* ===================================================================== */}
      {showWinnerModal && winningSlice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl border-4 border-amber-300 bg-gradient-to-b from-white to-amber-50 dark:from-slate-900 dark:to-slate-800 shadow-2xl p-6 text-center space-y-4">
            <div className="text-5xl animate-bounce">
              {winningSlice.icon}
            </div>

            <div>
              <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                🎉 CHÚC MỪNG CHIẾN THẮNG! 🎉
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-2">
                {winningSlice.label}
              </h3>
              {winningSlice.subLabel && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {winningSlice.subLabel}
                </p>
              )}
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Trao giải cho:{' '}
              <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                {winningRecipient}
              </strong>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowWinnerModal(false)}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white font-extrabold text-sm shadow-lg cursor-pointer"
              >
                Tuyệt Vời, Tiếp Tục! ✨
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
