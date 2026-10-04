// Speech and chimes. Browsers only allow audio after a click, so unlock() has
// to run from one (the "Start" overlay does it).

let ctx = null;

export function unlock() {
  ctx ??= new AudioContext();
  ctx.resume();
  speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}

export const unlocked = () => ctx?.state === 'running';

// Urgent speech jumps the queue.
export function say(text, urgent = false) {
  if (urgent) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  speechSynthesis.speak(u);
}

// step: a soft two-note rise (the procedure changed something)
// event: one soft note (something was marked)
// alarm: a harsh triple beep
const CHIMES = {
  step: [
    [660, 0, 0.12],
    [880, 0.13, 0.18],
  ],
  event: [[740, 0, 0.2]],
  alarm: [
    [1000, 0, 0.12],
    [1000, 0.18, 0.12],
    [1000, 0.36, 0.12],
  ],
};

export function chime(kind) {
  if (!ctx) return;
  const notes = CHIMES[kind] ?? CHIMES.event;
  const t0 = ctx.currentTime + 0.01;
  for (const [freq, start, dur] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = kind === 'alarm' ? 'square' : 'sine';
    osc.frequency.value = freq;
    const peak = kind === 'alarm' ? 0.25 : 0.12;
    gain.gain.setValueAtTime(0, t0 + start);
    gain.gain.linearRampToValueAtTime(peak, t0 + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + dur + 0.02);
  }
}
