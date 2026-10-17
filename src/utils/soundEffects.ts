/**
 * soundEffects.ts
 * Web Audio API synthesized sound generator & Confetti Celebration Engine.
 * 100% reliable, zero network latency, no external mp3 dependencies.
 */
import confetti from 'canvas-confetti';

const SOUND_STORAGE_KEY = 'vq_sound_muted';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function isSoundMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SOUND_STORAGE_KEY) === 'true';
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SOUND_STORAGE_KEY, muted ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('vq_sound_mute_changed', { detail: { muted } }));
}

export function toggleSoundMute(): boolean {
  const current = isSoundMuted();
  const next = !current;
  setSoundMuted(next);
  return next;
}

/**
 * 💰 "Kaching!" - Cash Register & Coin Chime
 * Used when saving a bill.
 */
export function playKachingSound(): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Part 1: Cash drawer slide click
    const oscClick = ctx.createOscillator();
    const gainClick = ctx.createGain();
    oscClick.type = 'triangle';
    oscClick.frequency.setValueAtTime(300, now);
    oscClick.frequency.exponentialRampToValueAtTime(80, now + 0.08);
    gainClick.gain.setValueAtTime(0.3, now);
    gainClick.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    oscClick.connect(gainClick);
    gainClick.connect(ctx.destination);
    oscClick.start(now);
    oscClick.stop(now + 0.08);

    // Part 2: Metallic cash register bell 1 (high chime)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1760, now + 0.05); // A6
    osc1.frequency.exponentialRampToValueAtTime(1750, now + 0.4);
    gain1.gain.setValueAtTime(0.35, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now + 0.05);
    osc1.stop(now + 0.45);

    // Part 3: Secondary harmonic bell 2 (sparkling kaching finish)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2637, now + 0.12); // E7
    gain2.gain.setValueAtTime(0.4, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);

    // Part 4: Gentle coin shimmer
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(3520, now + 0.18); // A7
    gain3.gain.setValueAtTime(0.25, now + 0.18);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.18);
    osc3.stop(now + 0.5);
  } catch {
    // ignore
  }
}

/**
 * 🔔 "Chime" - Sweet Ascending Celestial Bells
 * Used when settling debt or recording payment.
 */
export function playChimeSound(): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [1046.5, 1318.5, 1567.98, 2093.0]; // C6, E6, G6, C7
    notes.forEach((freq, i) => {
      const startTime = now + i * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.35);
    });
  } catch {
    // ignore
  }
}

/**
 * 🔔 "Kitchen Order Bell / Ding-Dong" - Clear kitchen service call bell
 * Played when sending order to kitchen.
 */
export function playOrderBellSound(): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2093, now); // C7
    osc1.frequency.exponentialRampToValueAtTime(2080, now + 0.5);
    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.6);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(2637, now + 0.08); // E7
    gain2.gain.setValueAtTime(0.3, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.7);
  } catch {
    // ignore
  }
}

/**
 * 🎡 "Tick" - Mechanical Wheel Flapper Click
 * Played as wheel pegs pass the flapper.
 */
export function playWheelTickSound(): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.025);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.025);
  } catch {
    // ignore
  }
}

/**
 * 🎺 "Ta-Da / Fanfare" - Celebratory Victory Brass Chords
 * Played on winning lucky wheel prize or reaching record sales.
 */
export function playFanfareSound(): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    // Chords: G4 -> C5 -> E5 -> G5, then triumphant hold on C6
    const chord1 = [392.0, 523.25, 659.25]; // G4, C5, E5
    const chord2 = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    chord1.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    });

    chord2.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + 0.24);
      gain.gain.setValueAtTime(0.25, now + 0.24);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + 0.24);
      osc.stop(now + 0.85);
    });
  } catch {
    // ignore
  }
}

/**
 * 🎉 Confetti Celebration Effect
 * Fires multi-stage confetti fireworks on screen + plays fanfare!
 */
export function triggerConfettiCelebration(options?: {
  title?: string;
  message?: string;
  durationMs?: number;
}): void {
  playFanfareSound();

  // Burst 1: Center blast
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'],
  });

  // Burst 2: Left cannon
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors: ['#ffd700', '#ff4500', '#00fa9a', '#1e90ff'],
    });
  }, 200);

  // Burst 3: Right cannon
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors: ['#ffd700', '#ff4500', '#00fa9a', '#1e90ff'],
    });
  }, 350);

  // Burst 4: Golden stars shower
  setTimeout(() => {
    confetti({
      particleCount: 40,
      spread: 100,
      origin: { y: 0.4 },
      shapes: ['star'],
      colors: ['#ffd700', '#ffb703', '#ffffff'],
    });
  }, 600);

  // If a banner title is provided, display celebratory toast in DOM
  if (options?.title) {
    showCelebrationToast(options.title, options.message, options.durationMs || 5000);
  }
}

function showCelebrationToast(title: string, message?: string, durationMs = 5000): void {
  if (typeof document === 'undefined') return;

  const existing = document.getElementById('vq-celebration-toast');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'vq-celebration-toast';
  container.className =
    'fixed top-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-auto transition-all duration-300 animate-bounce';
  container.innerHTML = `
    <div class="px-5 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 text-white shadow-2xl border-2 border-amber-300 flex items-center gap-3 max-w-md text-center">
      <span class="text-2xl">🏆</span>
      <div class="text-left">
        <div class="font-extrabold text-sm sm:text-base tracking-wide">${title}</div>
        ${message ? `<div class="text-xs text-amber-100 font-medium mt-0.5">${message}</div>` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(container);

  setTimeout(() => {
    container.style.opacity = '0';
    container.style.transform = 'translate(-50%, -20px)';
    setTimeout(() => container.remove(), 400);
  }, durationMs);
}
