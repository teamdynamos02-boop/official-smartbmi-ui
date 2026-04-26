const STORAGE_MUTE_KEY = "smartbmi.voice.muted";
const DEFAULT_COOLDOWN_MS = 5000;
const DEBUG_VOICE = String(import.meta.env.VITE_VOICE_DEBUG ?? "false").toLowerCase() === "true";
const DEFAULT_SETTINGS = {
  rate: 0.85,
  pitch: 1,
  volume: 1,
  lang: "en-US",
};

const FEMALE_HINTS = [
  "female",
  "woman",
  "zira",
  "samantha",
  "google uk english female",
  "microsoft zira",
  "microsoft hazel",
];

const normalizeText = (text) => String(text || "").replace(/\s+/g, " ").trim();
const debugInfo = (...args) => {
  if (DEBUG_VOICE) console.info(...args);
};
const debugWarn = (...args) => {
  if (DEBUG_VOICE) console.warn(...args);
};

function readStoredMute() {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(STORAGE_MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistMute(value) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_MUTE_KEY, value ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}

function pickPreferredVoice(voices) {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  const englishVoices = voices.filter((voice) => {
    const lang = String(voice?.lang || "").toLowerCase();
    const name = String(voice?.name || "").toLowerCase();
    return lang.startsWith("en") || name.includes("english");
  });
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  const femaleVoice = pool.find((voice) => {
    const name = String(voice?.name || "").toLowerCase();
    return FEMALE_HINTS.some((hint) => name.includes(hint));
  });

  if (femaleVoice) return femaleVoice;
  return pool[0] || voices[0] || null;
}

class VoiceGuideService {
  constructor() {
    this.supported = false;
    this.initialized = false;
    this.audioUnlocked = false;
    this.muted = readStoredMute();
    this.settings = { ...DEFAULT_SETTINGS };
    this.selectedVoice = null;
    this.audioContext = null;
    this.lastSpokenAt = new Map();
    this.lastInstruction = null;
    this.currentInstructionText = "";
    this.lastError = "";
    this.listeners = new Set();
    this.hasLoggedInit = false;
    this.hasLoggedUnlock = false;
    this.handleVoicesChanged = this.handleVoicesChanged.bind(this);
  }

  ensureInitialized() {
    if (this.initialized || typeof window === "undefined") return;

    this.supported = Boolean(
      "speechSynthesis" in window
      && typeof window.SpeechSynthesisUtterance === "function"
    );

    if (this.supported) {
      try {
        window.speechSynthesis.addEventListener("voiceschanged", this.handleVoicesChanged);
      } catch {
        window.speechSynthesis.onvoiceschanged = this.handleVoicesChanged;
      }
      this.loadVoices();
    }

    this.initialized = true;
    if (!this.hasLoggedInit) {
      debugInfo("[voice] initialized", { supported: this.supported });
      this.hasLoggedInit = true;
    }
    this.emit();
  }

  handleVoicesChanged() {
    this.loadVoices();
  }

  loadVoices() {
    if (!this.supported || typeof window === "undefined") return;
    try {
      const voices = window.speechSynthesis.getVoices() || [];
      this.selectedVoice = pickPreferredVoice(voices);
      this.emit();
    } catch (error) {
      this.lastError = String(error?.message || "Unable to load speech voices.");
      debugWarn("[voice] voice loading failed:", error);
      this.emit();
    }
  }

  getState() {
    this.ensureInitialized();
    return {
      supported: this.supported,
      audioUnlocked: this.audioUnlocked,
      muted: this.muted,
      settings: { ...this.settings },
      selectedVoiceName: this.selectedVoice?.name || "",
      currentInstructionText: this.currentInstructionText,
      lastInstructionText: this.lastInstruction?.text || "",
      lastError: this.lastError,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit() {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        if (DEBUG_VOICE) console.error("[voice] listener failed:", error);
      }
    });
  }

  setCurrentInstruction(text) {
    const normalized = normalizeText(text);
    if (this.currentInstructionText === normalized) return;
    this.currentInstructionText = normalized;
    this.emit();
  }

  setVoiceSettings(partial = {}) {
    this.settings = {
      ...this.settings,
      rate: Number.isFinite(partial.rate) ? partial.rate : this.settings.rate,
      pitch: Number.isFinite(partial.pitch) ? partial.pitch : this.settings.pitch,
      volume: Number.isFinite(partial.volume) ? partial.volume : this.settings.volume,
      lang: partial.lang || this.settings.lang,
    };
    this.emit();
  }

  setMuted(value) {
    this.muted = Boolean(value);
    persistMute(this.muted);
    if (this.muted) {
      this.stop();
    }
    this.emit();
  }

  initializeAudio() {
    this.ensureInitialized();

    if (typeof window === "undefined") return false;
    let unlocked = false;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass && !this.audioContext) {
        this.audioContext = new AudioContextClass();
      }
      if (this.audioContext && typeof this.audioContext.resume === "function") {
        void this.audioContext.resume().catch((error) => {
          debugWarn("[voice] audio resume failed:", error);
        });
        unlocked = this.audioContext.state !== "suspended";
      }
    } catch (error) {
      debugWarn("[voice] audio initialization failed:", error);
    }

    this.loadVoices();
    this.audioUnlocked = this.audioUnlocked || unlocked || this.supported;
    if (this.audioUnlocked && !this.hasLoggedUnlock) {
      debugInfo("[voice] audio unlocked");
      this.hasLoggedUnlock = true;
    }
    this.emit();
    return this.audioUnlocked;
  }

  playStartupSound() {
    this.ensureInitialized();
    if (this.muted) return false;
    this.initializeAudio();
    if (!this.audioContext) return false;

    try {
      const now = this.audioContext.currentTime;
      const gain = this.audioContext.createGain();
      const oscillator = this.audioContext.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, now);
      oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.28);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      oscillator.connect(gain);
      gain.connect(this.audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.55);
      return true;
    } catch (error) {
      debugWarn("[voice] startup chime failed:", error);
      this.lastError = String(error?.message || "Startup sound failed.");
      this.emit();
      return false;
    }
  }

  shouldSkip(key, cooldownMs) {
    if (!key || cooldownMs <= 0) return false;
    const now = Date.now();
    const last = this.lastSpokenAt.get(key);
    if (last != null && now - last < cooldownMs) return true;
    this.lastSpokenAt.set(key, now);
    return false;
  }

  speak(text, options = {}) {
    this.ensureInitialized();

    const normalized = normalizeText(text);
    if (!normalized) return false;

    const key = options.key || normalized.toLowerCase();
    const cooldownMs = Number.isFinite(options.cooldownMs) ? options.cooldownMs : DEFAULT_COOLDOWN_MS;
    const force = Boolean(options.force);

    this.lastInstruction = {
      text: normalized,
      options: {
        ...options,
        key,
      },
    };
    this.setCurrentInstruction(normalized);

    if (!force && this.shouldSkip(key, cooldownMs)) {
      return false;
    }

    if (!this.supported || typeof window === "undefined") return false;
    if (this.muted) return false;

    this.initializeAudio();

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(normalized);
      utterance.rate = Number.isFinite(options.rate) ? options.rate : this.settings.rate;
      utterance.pitch = Number.isFinite(options.pitch) ? options.pitch : this.settings.pitch;
      utterance.volume = Number.isFinite(options.volume) ? options.volume : this.settings.volume;
      utterance.lang = options.lang || this.selectedVoice?.lang || this.settings.lang;
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      utterance.onerror = (event) => {
        const errorMessage = String(event?.error || "Speech synthesis failed.");
        this.lastError = errorMessage;
        debugWarn("[voice] speech error:", errorMessage);
        this.emit();
      };
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      this.lastError = String(error?.message || "Speech synthesis failed.");
      debugWarn("[voice] speak failed:", error);
      this.emit();
      return false;
    }
  }

  repeat() {
    if (!this.lastInstruction?.text) return false;
    return this.speak(this.lastInstruction.text, {
      ...this.lastInstruction.options,
      cooldownMs: 0,
      force: true,
    });
  }

  stop() {
    this.ensureInitialized();
    if (!this.supported || typeof window === "undefined") return;
    try {
      window.speechSynthesis.cancel();
    } catch (error) {
      debugWarn("[voice] stop failed:", error);
    }
  }
}

export const voiceGuide = new VoiceGuideService();

export function speak(text, options) {
  return voiceGuide.speak(text, options);
}

export function stop() {
  return voiceGuide.stop();
}

export function repeat() {
  return voiceGuide.repeat();
}

export function initializeAudio() {
  return voiceGuide.initializeAudio();
}

export function setVoiceSettings(settings) {
  return voiceGuide.setVoiceSettings(settings);
}

export function setMuted(value) {
  return voiceGuide.setMuted(value);
}

export function playStartupSound() {
  return voiceGuide.playStartupSound();
}

export function subscribeVoiceState(listener) {
  return voiceGuide.subscribe(listener);
}

export function getVoiceState() {
  return voiceGuide.getState();
}

export function setCurrentInstruction(text) {
  return voiceGuide.setCurrentInstruction(text);
}
