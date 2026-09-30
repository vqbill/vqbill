import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
  Sparkles,
  RotateCcw,
} from 'lucide-react';

// ============================================================================
// VIETNAMESE LUNAR CALENDAR ALGORITHM (Hồ Ngọc Đức - GMT+7)
// ============================================================================

const PI = Math.PI;

function INT(d: number): number {
  return Math.floor(d);
}

function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd =
    dd +
    INT((153 * m + 2) / 5) +
    365 * y +
    INT(y / 4) -
    INT(y / 100) +
    INT(y / 400) -
    32045;
  if (jd < 2299161) {
    jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  }
  return jd;
}

function getNewMoonDay(k: number, timeZone: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 = Jd1 + 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 =
    (0.1734 - 0.000393 * T) * Math.sin(M * dr) +
    0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 =
    C1 -
    0.0074 * Math.sin(dr * (M - Mpr)) +
    0.0004 * Math.sin(dr * (2 * F + M));
  C1 =
    C1 -
    0.0004 * Math.sin(dr * (2 * F - M)) -
    0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 =
    C1 +
    0.001 * Math.sin(dr * (2 * F - Mpr)) +
    0.0005 * Math.sin(dr * (2 * Mpr + M));
  let deltat: number;
  if (T < -11) {
    deltat =
      0.001 +
      0.000839 * T +
      0.0002261 * T2 -
      0.00000845 * T3 -
      0.000000081 * T * T3;
  } else {
    deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
  }
  const JdNew = Jd1 + C1 - deltat;
  return INT(JdNew + 0.5 + timeZone / 24);
}

function getSunLongitude(jdn: number, timeZone: number): number {
  const T = (jdn - 2451545.5 - timeZone / 24) / 36525;
  const T2 = T * T;
  const dr = PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL =
    DL +
    (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) +
    0.00029 * Math.sin(dr * 3 * M);
  let L = L0 + DL;
  L = L * dr;
  L = L - PI * 2 * INT(L / (PI * 2));
  return INT((L / PI) * 6);
}

function getLunarMonth11(yy: number, timeZone: number): number {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  const sunLong = getSunLongitude(nm, timeZone);
  if (sunLong >= 9) {
    nm = getNewMoonDay(k - 1, timeZone);
  }
  return nm;
}

function getLeapMonthOffset(a11: number, timeZone: number): number {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  do {
    last = arc;
    i++;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  } while (arc !== last && i < 14);
  return i - 1;
}

export interface LunarDateInfo {
  lunarDay: number;
  lunarMonth: number;
  lunarYear: number;
  lunarLeap: boolean;
  jd: number;
  yearCanChi: string;
  monthCanChi: string;
  dayCanChi: string;
  hourCanChi: string;
  tietKhi: string;
  auspiciousHours: string;
  holidayLabel?: string;
}

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const CHI = [
  'Tý',
  'Sửu',
  'Dần',
  'Mão',
  'Thìn',
  'Tỵ',
  'Ngọ',
  'Mùi',
  'Thân',
  'Dậu',
  'Tuất',
  'Hợi',
];

const TIET_KHI = [
  'Xuân phân',
  'Thanh minh',
  'Cốc vũ',
  'Lập hạ',
  'Tiểu mãn',
  'Mang chủng',
  'Hạ chí',
  'Tiểu thử',
  'Đại thử',
  'Lập thu',
  'Xử thử',
  'Bạch lộ',
  'Thu phân',
  'Hàn lộ',
  'Sương giáng',
  'Lập đông',
  'Tiểu tuyết',
  'Đại tuyết',
  'Đông chí',
  'Tiểu hàn',
  'Đại hàn',
  'Lập xuân',
  'Vũ thủy',
  'Kinh trập',
];

const GIO_HOANG_DAO_PATTERNS: Record<number, number[]> = {
  0: [0, 1, 3, 6, 8, 9], // Tý, Ngọ
  1: [2, 3, 5, 8, 10, 11], // Sửu, Mùi
  2: [0, 1, 4, 5, 7, 10], // Dần, Thân
  3: [0, 2, 3, 6, 7, 9], // Mão, Dậu
  4: [2, 4, 5, 8, 9, 11], // Thìn, Tuất
  5: [1, 4, 6, 7, 10, 11], // Tỵ, Hợi
};

const HOUR_RANGES = [
  '23h-01h',
  '01h-03h',
  '03h-05h',
  '05h-07h',
  '07h-09h',
  '09h-11h',
  '11h-13h',
  '13h-15h',
  '15h-17h',
  '17h-19h',
  '19h-21h',
  '21h-23h',
];

export function convertSolar2Lunar(
  dd: number,
  mm: number,
  yy: number,
  currentHour = 12,
  timeZone = 7
): LunarDateInfo {
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, timeZone);
  if (monthStart > dayNumber) {
    monthStart = getNewMoonDay(k, timeZone);
  }
  let a11 = getLunarMonth11(yy, timeZone);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = yy;
    a11 = getLunarMonth11(yy - 1, timeZone);
  } else {
    lunarYear = yy + 1;
    b11 = getLunarMonth11(yy + 1, timeZone);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11) / 29);
  let lunarLeap = false;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, timeZone);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) {
        lunarLeap = true;
      }
    }
  }
  if (lunarMonth > 12) {
    lunarMonth = lunarMonth - 12;
  }
  if (lunarMonth >= 11 && diff < 4) {
    lunarYear -= 1;
  }

  const yearCan = CAN[(lunarYear + 6) % 10];
  const yearChi = CHI[(lunarYear + 8) % 12];
  const yearCanChi = `${yearCan} ${yearChi}`;

  const monthCan = CAN[(lunarYear * 12 + lunarMonth + 3) % 10];
  const monthChi = CHI[(lunarMonth + 1) % 12];
  const monthCanChi = `${monthCan} ${monthChi}${lunarLeap ? ' (Nhuận)' : ''}`;

  const dayCanIdx = (dayNumber + 9) % 10;
  const dayChiIdx = (dayNumber + 1) % 12;
  const dayCanChi = `${CAN[dayCanIdx]} ${CHI[dayChiIdx]}`;

  // Hour Can Chi
  const hourBranchIdx = Math.floor(((currentHour + 1) % 24) / 2);
  const tyStemIdx = (dayCanIdx % 5) * 2;
  const hourStemIdx = (tyStemIdx + hourBranchIdx) % 10;
  const hourCanChi = `${CAN[hourStemIdx]} ${CHI[hourBranchIdx]}`;

  // Tiết khí (24 solar terms approx from sun longitude)
  const T = (dayNumber - 2451545.5 - timeZone / 24) / 36525;
  const dr = PI / 180;
  const M = 357.5291 + 35999.0503 * T;
  const L0 = 280.46645 + 36000.76983 * T;
  const DL = 1.9146 * Math.sin(dr * M) + 0.019993 * Math.sin(dr * 2 * M);
  let L = (L0 + DL) * dr;
  L = L - PI * 2 * INT(L / (PI * 2));
  const tietKhiIdx = INT((L / (PI * 2)) * 24) % 24;
  const tietKhi = TIET_KHI[(tietKhiIdx + 24) % 24];

  // Giờ Hoàng Đạo
  const hdBranches = GIO_HOANG_DAO_PATTERNS[dayChiIdx % 6] || [0, 1, 3, 6, 8, 9];
  const auspiciousHours = hdBranches
    .map((idx) => `${CHI[idx]} (${HOUR_RANGES[idx]})`)
    .join(', ');

  // Holiday label
  let holidayLabel: string | undefined;
  if (lunarDay === 1 && lunarMonth === 1) holidayLabel = 'Mùng 1 Tết Nguyên Đán';
  else if (lunarDay === 2 && lunarMonth === 1) holidayLabel = 'Mùng 2 Tết Nguyên Đán';
  else if (lunarDay === 3 && lunarMonth === 1) holidayLabel = 'Mùng 3 Tết Nguyên Đán';
  else if (lunarDay === 15 && lunarMonth === 1) holidayLabel = 'Rằm Tháng Giêng (Tết Nguyên Tiêu)';
  else if (lunarDay === 10 && lunarMonth === 3) holidayLabel = 'Giỗ Tổ Hùng Vương (10/3 ÂL)';
  else if (lunarDay === 15 && lunarMonth === 4) holidayLabel = 'Đại Lễ Phật Đản (15/4 ÂL)';
  else if (lunarDay === 5 && lunarMonth === 5) holidayLabel = 'Tết Đoan Ngọ (5/5 ÂL)';
  else if (lunarDay === 15 && lunarMonth === 7) holidayLabel = 'Lễ Vu Lan (Rằm Tháng 7)';
  else if (lunarDay === 15 && lunarMonth === 8) holidayLabel = 'Tết Trung Thu (Rằm Tháng 8)';
  else if (lunarDay === 23 && lunarMonth === 12) holidayLabel = 'Ông Công Ông Táo (23/12 ÂL)';
  else if (lunarDay === 1) holidayLabel = `Mùng 1 đầu tháng (${lunarDay}/${lunarMonth} ÂL)`;
  else if (lunarDay === 15) holidayLabel = `Ngày Rằm (${lunarDay}/${lunarMonth} ÂL)`;
  else if (dd === 1 && mm === 1) holidayLabel = 'Tết Dương Lịch (01/01)';
  else if (dd === 30 && mm === 4) holidayLabel = 'Ngày Giải phóng miền Nam (30/04)';
  else if (dd === 1 && mm === 5) holidayLabel = 'Quốc tế Lao động (01/05)';
  else if (dd === 2 && mm === 9) holidayLabel = 'Quốc khánh Việt Nam (02/09)';

  return {
    lunarDay,
    lunarMonth,
    lunarYear,
    lunarLeap,
    jd: dayNumber,
    yearCanChi,
    monthCanChi,
    dayCanChi,
    hourCanChi,
    tietKhi,
    auspiciousHours,
    holidayLabel,
  };
}

const WEEKDAY_NAMES = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

const SHORT_WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export const LunarCalendarFloatingWidget: React.FC = () => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const [viewYear, setViewYear] = useState<number>(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => new Date().getMonth() + 1); // 1..12
  const [selectedDate, setSelectedDate] = useState<{
    d: number;
    m: number;
    y: number;
  }>(() => {
    const cur = new Date();
    return {
      d: cur.getDate(),
      m: cur.getMonth() + 1,
      y: cur.getFullYear(),
    };
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const curDay = now.getDate();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  const curHour = now.getHours();

  const liveTimeStr = now.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const liveSolarStr = `${String(curDay).padStart(2, '0')}/${String(curMonth).padStart(
    2,
    '0'
  )}/${curYear}`;

  const currentLunar = useMemo(
    () => convertSolar2Lunar(curDay, curMonth, curYear, curHour),
    [curDay, curMonth, curYear, curHour]
  );

  const selectedLunar = useMemo(
    () =>
      convertSolar2Lunar(
        selectedDate.d,
        selectedDate.m,
        selectedDate.y,
        curHour
      ),
    [selectedDate, curHour]
  );

  const selectedWeekday = useMemo(() => {
    const dt = new Date(selectedDate.y, selectedDate.m - 1, selectedDate.d);
    return WEEKDAY_NAMES[dt.getDay()];
  }, [selectedDate]);

  // Build calendar cells for viewMonth / viewYear (Monday-first grid)
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    // Convert JS getDay() (0=Sun..6=Sat) to Monday-first index (0=Mon..6=Sun)
    const startOffset = (firstDay.getDay() + 6) % 7;

    const prevMonthDate = new Date(viewYear, viewMonth - 1, 0);
    const prevMonthDays = prevMonthDate.getDate();
    const prevMonth = prevMonthDate.getMonth() + 1;
    const prevYear = prevMonthDate.getFullYear();

    const cells: {
      d: number;
      m: number;
      y: number;
      inCurrentMonth: boolean;
      lunar: LunarDateInfo;
    }[] = [];

    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      cells.push({
        d,
        m: prevMonth,
        y: prevYear,
        inCurrentMonth: false,
        lunar: convertSolar2Lunar(d, prevMonth, prevYear, 12),
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        d,
        m: viewMonth,
        y: viewYear,
        inCurrentMonth: true,
        lunar: convertSolar2Lunar(d, viewMonth, viewYear, 12),
      });
    }

    const nextDate = new Date(viewYear, viewMonth, 1);
    const nextMonth = nextDate.getMonth() + 1;
    const nextYear = nextDate.getFullYear();
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      cells.push({
        d,
        m: nextMonth,
        y: nextYear,
        inCurrentMonth: false,
        lunar: convertSolar2Lunar(d, nextMonth, nextYear, 12),
      });
    }

    return cells;
  }, [viewMonth, viewYear]);

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleJumpToday = () => {
    const dt = new Date();
    const d = dt.getDate();
    const m = dt.getMonth() + 1;
    const y = dt.getFullYear();
    setViewMonth(m);
    setViewYear(y);
    setSelectedDate({ d, m, y });
  };

  return (
    <>
      {/* Floating Button fixed at bottom-right even when scrolling */}
      <button
        id="lunar-calendar-floating-btn"
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-[#1c1c1a]/95 dark:bg-[#fbfbfa]/95 text-white dark:text-[#1c1c1a] shadow-lg border border-[#e4e4db] dark:border-[#2c2c28] cursor-pointer select-none backdrop-blur-md transition-all hover:scale-105 active:scale-95 group"
        title="Xem Lịch Âm Dương"
        aria-label="Xem Lịch Âm Dương"
      >
        <Clock className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0 group-hover:rotate-6 transition-transform" />
        <div className="text-[11px] font-mono leading-tight text-left">
          <div className="font-bold tabular-nums">
            {liveTimeStr} · {liveSolarStr}
          </div>
          <div className="text-[10px] opacity-80">
            Âm lịch: {currentLunar.lunarDay}/{currentLunar.lunarMonth} ({currentLunar.yearCanChi})
          </div>
        </div>
      </button>

      {/* Popup Lịch Âm Dương Chi Tiết */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-2 sm:p-6 bg-slate-950/40 backdrop-blur-xs"
          onClick={() => setIsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[430px] sm:mb-14 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Top Header: Live Clock & Selected Solar/Lunar Date */}
            <div className="p-4 bg-[#1c1c1a] text-white space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="font-bold tabular-nums">{liveTimeStr}</span>
                  <span>·</span>
                  <span>Hôm nay: {liveSolarStr}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleJumpToday}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white inline-flex items-center gap-1 cursor-pointer"
                    title="Về ngày hôm nay"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Hôm nay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                    aria-label="Đóng lịch"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Dual Solar & Lunar Highlight Card */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                  <div className="text-[11px] text-slate-300">Dương Lịch</div>
                  <div className="mt-0.5 text-2xl font-extrabold font-mono tabular-nums text-white">
                    {String(selectedDate.d).padStart(2, '0')}
                  </div>
                  <div className="text-xs font-semibold text-emerald-300">
                    {selectedWeekday}
                  </div>
                  <div className="text-[11px] font-mono text-slate-300 mt-0.5">
                    Tháng {String(selectedDate.m).padStart(2, '0')} / {selectedDate.y}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-400/30">
                  <div className="text-[11px] text-amber-200">
                    Âm Lịch Việt Nam
                  </div>
                  <div className="mt-0.5 text-2xl font-extrabold font-mono tabular-nums text-amber-300">
                    {String(selectedLunar.lunarDay).padStart(2, '0')}
                  </div>
                  <div className="text-xs font-semibold text-amber-200">
                    Tháng {selectedLunar.lunarMonth}
                    {selectedLunar.lunarLeap ? ' (Nhuận)' : ''}
                  </div>
                  <div className="text-[11px] font-mono text-amber-100/90 mt-0.5">
                    Năm {selectedLunar.yearCanChi} ({selectedLunar.lunarYear})
                  </div>
                </div>
              </div>

              {/* Can Chi & Tiết Khí Details */}
              <div className="pt-2 border-t border-white/10 text-[11px] space-y-1 text-slate-300">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span>
                    Ngày <strong className="text-white">{selectedLunar.dayCanChi}</strong> · Tháng{' '}
                    <strong className="text-white">{selectedLunar.monthCanChi}</strong>
                  </span>
                  <span>
                    Giờ hiện tại: <strong className="text-emerald-300">{selectedLunar.hourCanChi}</strong>
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Tiết khí: {selectedLunar.tietKhi}</span>
                  {selectedLunar.holidayLabel && (
                    <span className="text-amber-300 font-semibold inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      {selectedLunar.holidayLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Month Navigator */}
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                title="Tháng trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <select
                  value={viewMonth}
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold cursor-pointer"
                >
                  {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => (
                    <option key={m} value={m}>
                      Tháng {m}
                    </option>
                  ))}
                </select>

                <select
                  value={viewYear}
                  onChange={(e) => setViewYear(Number(e.target.value))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold font-mono cursor-pointer"
                >
                  {Array.from({ length: 21 }, (_, idx) => curYear - 10 + idx).map(
                    (y) => (
                      <option key={y} value={y}>
                        Năm {y}
                      </option>
                    )
                  )}
                </select>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                title="Tháng sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="p-3">
              <div className="grid grid-cols-7 gap-1 mb-1 text-center">
                {SHORT_WEEKDAYS.map((wd, idx) => (
                  <div
                    key={wd}
                    className={`py-1 text-[11px] font-bold ${
                      idx === 6
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {wd}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((cell, idx) => {
                  const isToday =
                    cell.d === curDay &&
                    cell.m === curMonth &&
                    cell.y === curYear;
                  const isSelected =
                    cell.d === selectedDate.d &&
                    cell.m === selectedDate.m &&
                    cell.y === selectedDate.y;
                  const isMung1OrRam =
                    cell.lunar.lunarDay === 1 || cell.lunar.lunarDay === 15;
                  const isSunday = idx % 7 === 6;

                  const lunarDisplay =
                    cell.lunar.lunarDay === 1 || cell.d === 1
                      ? `${cell.lunar.lunarDay}/${cell.lunar.lunarMonth}`
                      : String(cell.lunar.lunarDay);

                  return (
                    <button
                      key={`${cell.y}-${cell.m}-${cell.d}`}
                      type="button"
                      onClick={() => {
                        setSelectedDate({ d: cell.d, m: cell.m, y: cell.y });
                        if (!cell.inCurrentMonth) {
                          setViewMonth(cell.m);
                          setViewYear(cell.y);
                        }
                      }}
                      className={`h-12 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : isToday
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                          : cell.inCurrentMonth
                          ? 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800'
                          : 'bg-slate-50/50 dark:bg-slate-950/30 border-transparent opacity-45 hover:opacity-80'
                      }`}
                    >
                      <span
                        className={`text-xs font-bold font-mono leading-none ${
                          isSelected
                            ? 'text-white'
                            : isSunday && cell.inCurrentMonth
                            ? 'text-rose-600 dark:text-rose-400'
                            : ''
                        }`}
                      >
                        {cell.d}
                      </span>
                      <span
                        className={`mt-1 text-[10px] font-mono leading-none ${
                          isSelected
                            ? 'text-emerald-100 font-semibold'
                            : isMung1OrRam
                            ? 'text-rose-600 dark:text-rose-400 font-bold'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {lunarDisplay}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer: Auspicious Hours (Giờ Hoàng Đạo) */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Giờ Hoàng Đạo (Ngày {String(selectedDate.d).padStart(2, '0')}/
                {String(selectedDate.m).padStart(2, '0')}):
              </div>
              <div className="font-mono text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">
                {selectedLunar.auspiciousHours}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
