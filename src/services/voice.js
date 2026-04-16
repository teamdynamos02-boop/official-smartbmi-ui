const DEFAULT_COOLDOWN_MS = 3000;
const DEFAULT_RATE = 1;
const DEFAULT_PITCH = 1;
const DEFAULT_VOLUME = 1;

const normalizeText = (text) => String(text || "").replace(/\s+/g, " ").trim();

export function createVoiceGuide(options = {}) {
  const settings = {
    lang: options.lang,
    rate: Number.isFinite(options.rate) ? options.rate : DEFAULT_RATE,
    pitch: Number.isFinite(options.pitch) ? options.pitch : DEFAULT_PITCH,
    volume: Number.isFinite(options.volume) ? options.volume : DEFAULT_VOLUME,
  };

  const support = typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof window.SpeechSynthesisUtterance === "function";
  const lastSpokenAt = new Map();

  const shouldSkip = (key, cooldownMs) => {
    if (!key) return false;
    const now = Date.now();
    const last = lastSpokenAt.get(key);
    if (last != null && now - last < cooldownMs) return true;
    lastSpokenAt.set(key, now);
    return false;
  };

  const speak = (text, opts = {}) => {
    if (!support) return false;
    const normalized = normalizeText(text);
    if (!normalized) return false;
    const key = opts.key || normalized.toLowerCase();
    const cooldownMs = Number.isFinite(opts.cooldownMs) ? opts.cooldownMs : DEFAULT_COOLDOWN_MS;
    if (cooldownMs > 0 && shouldSkip(key, cooldownMs)) return false;

    if (opts.interrupt) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(normalized);
    utterance.rate = Number.isFinite(opts.rate) ? opts.rate : settings.rate;
    utterance.pitch = Number.isFinite(opts.pitch) ? opts.pitch : settings.pitch;
    utterance.volume = Number.isFinite(opts.volume) ? opts.volume : settings.volume;
    if (opts.lang || settings.lang) {
      utterance.lang = opts.lang || settings.lang;
    }

    window.speechSynthesis.speak(utterance);
    return true;
  };

  const cancel = () => {
    if (!support) return;
    window.speechSynthesis.cancel();
  };

  return {
    speak,
    cancel,
    isSupported: support,
  };
}
