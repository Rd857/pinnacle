let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function unlockAudio() {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function setMuted(v: boolean) {
  muted = v;
  if (master && ctx) master.gain.setTargetAtTime(v ? 0 : 0.28, ctx.currentTime, 0.03);
}

function beep(freq: number, dur: number, type: OscillatorType, gain = 0.12, slide = 0) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  place: () => {
    beep(420, 0.08, "triangle", 0.1);
    beep(620, 0.1, "sine", 0.06);
  },
  error: () => beep(140, 0.16, "square", 0.06, -40),
  ding: () => {
    beep(880, 0.09, "sine", 0.08);
    beep(1320, 0.12, "sine", 0.05);
  },
  cash: () => {
    beep(880, 0.07, "square", 0.05);
    beep(1174, 0.1, "square", 0.04);
  },
  star: () => {
    beep(523, 0.14, "sine", 0.08);
    setTimeout(() => beep(659, 0.14, "sine", 0.08), 90);
    setTimeout(() => beep(784, 0.22, "sine", 0.1), 180);
  },
  click: () => beep(700, 0.04, "triangle", 0.05),
};
