/**
 * soundEngine.js
 * Centralized sound engine for Onicord using uisfx with gradual sound levels.
 */

import { createUISFX } from "uisfx";

export const SFX_LEVEL = {
  MUTED: 0,
  ESSENTIAL: 1,
  COMMUNICATION: 2,
  ALL: 3,
};

const CUE_MIN_LEVEL = {
  // Nivel 1: Esenciales (Voz, Stream, Llamadas, Alertas críticas)
  connect: 1,
  disconnect: 1,
  "toggle-on": 1,
  "toggle-off": 1,
  lock: 1,
  unlock: 1,
  start: 1,
  stop: 1,
  notification: 1,
  mention: 1,

  // Nivel 2: Comunicación (Chat, Mensajes, Escritura, Reacciones)
  send: 2,
  receive: 2,
  typing: 2,
  reaction: 2,
  delete: 2,
  drop: 2,

  // Nivel 3: Completo (Navegación, Widgets, Acciones y Feedback de UI)
  open: 3,
  close: 3,
  select: 3,
  expand: 3,
  collapse: 3,
  snap: 3,
  "volume-change": 3,
  copy: 3,
  reward: 3,
  success: 3,
  warning: 3,
  undo: 3,
};

class SoundEngine {
  constructor() {
    this.pack = "minimal";
    this.volume = 1.0;
    this.level = SFX_LEVEL.COMMUNICATION;
    this.enabled = true;
    this.typingSoundsEnabled = true;
    this.widgetSoundsEnabled = false;
    this.navSoundsEnabled = false;

    this._unlocked = false;
    this._lastTypingPlay = 0;
    this._lastSnapPlay = 0;
    this._lastVolumePlay = 0;

    // Load persisted settings
    this._loadSettings();

    // Create uisfx instance
    try {
      this.player = createUISFX({
        pack: this.pack,
        volume: this.volume,
        enabled: this.enabled,
        maxVoices: 8,
      });
    } catch (err) {
      console.warn("[SoundEngine] Error initializing uisfx:", err);
      this.player = null;
    }

    this._setupUnlockListeners();
  }

  _loadSettings() {
    try {
      const savedVolume = localStorage.getItem("onicord_sfx_volume");
      if (savedVolume !== null) {
        const parsed = parseFloat(savedVolume);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          this.volume = parsed;
        }
      }

      const savedPack = localStorage.getItem("onicord_sfx_pack");
      if (savedPack) {
        this.pack = savedPack;
      }

      const savedLevel = localStorage.getItem("onicord_sfx_level");
      if (savedLevel !== null) {
        const parsed = parseInt(savedLevel, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 3) {
          this.level = parsed;
        }
      } else {
        // Migración inteligente retroactiva
        const savedEnabled = localStorage.getItem("onicord_sfx_enabled");
        if (savedEnabled === "false") {
          this.level = SFX_LEVEL.MUTED;
        } else {
          const savedNav = localStorage.getItem("onicord_sfx_nav");
          if (savedNav === "true") {
            this.level = SFX_LEVEL.ALL;
          } else {
            this.level = SFX_LEVEL.COMMUNICATION;
          }
        }
      }

      this.enabled = this.level > 0;
    } catch { }
  }

  _setupUnlockListeners() {
    if (typeof window === "undefined") return;

    const unlockHandler = async () => {
      if (this._unlocked) return;
      try {
        if (this.player && typeof this.player.unlock === "function") {
          const ok = await this.player.unlock();
          if (ok) this._unlocked = true;
        } else {
          this._unlocked = true;
        }
      } catch (err) {
        console.warn("[SoundEngine] Error unlocking audio context:", err);
      }

      window.removeEventListener("pointerdown", unlockHandler);
      window.removeEventListener("click", unlockHandler);
      window.removeEventListener("keydown", unlockHandler);
    };

    window.addEventListener("pointerdown", unlockHandler, { once: true });
    window.addEventListener("click", unlockHandler, { once: true });
    window.addEventListener("keydown", unlockHandler, { once: true });
  }

  async unlock() {
    if (this._unlocked) return true;
    try {
      if (this.player?.unlock) {
        const ok = await this.player.unlock();
        if (ok) this._unlocked = true;
        return ok;
      }
    } catch { }
    this._unlocked = true;
    return true;
  }

  setLevel(newLevel, playPreview = false) {
    const clamped = Math.max(0, Math.min(3, parseInt(newLevel, 10) || 0));
    this.level = clamped;
    this.enabled = clamped > 0;

    try {
      localStorage.setItem("onicord_sfx_level", String(clamped));
      localStorage.setItem("onicord_sfx_enabled", String(this.enabled));
    } catch { }

    if (this.player) {
      this.player.setEnabled(this.enabled);
    }

    if (playPreview && this.enabled && this.player) {
      try {
        if (clamped === 1) {
          this.player.play("toggle-on", { volume: this.volume });
        } else if (clamped === 2) {
          this.player.play("receive", { volume: this.volume });
        } else if (clamped === 3) {
          this.player.play("select", { volume: this.volume });
        }
      } catch (_) { }
    }
  }

  getLevel() {
    return this.level;
  }

  setVolume(newVol) {
    const clamped = Math.max(0, Math.min(1, newVol));
    this.volume = clamped;
    try {
      localStorage.setItem("onicord_sfx_volume", String(clamped));
    } catch { }
    if (this.player) {
      this.player.setVolume(clamped);
    }
  }

  getVolume() {
    return this.volume;
  }

  setPack(packName) {
    this.pack = packName;
    try {
      localStorage.setItem("onicord_sfx_pack", packName);
    } catch { }
    if (this.player && typeof this.player.setPack === "function") {
      this.player.setPack(packName);
    }
  }

  getPack() {
    return this.pack;
  }

  // Compatibilidad legacy
  setEnabled(enabled) {
    if (!enabled) {
      this.setLevel(SFX_LEVEL.MUTED);
    } else if (this.level === SFX_LEVEL.MUTED) {
      this.setLevel(SFX_LEVEL.COMMUNICATION);
    }
  }

  isEnabled() {
    return this.level > 0;
  }

  setTypingEnabled(enabled) {
    this.typingSoundsEnabled = Boolean(enabled);
  }

  isTypingEnabled() {
    return this.level >= SFX_LEVEL.COMMUNICATION;
  }

  setWidgetSoundsEnabled(enabled) {
    this.widgetSoundsEnabled = Boolean(enabled);
  }

  isWidgetSoundsEnabled() {
    return this.level >= SFX_LEVEL.ALL;
  }

  setNavSoundsEnabled(enabled) {
    this.navSoundsEnabled = Boolean(enabled);
  }

  isNavSoundsEnabled() {
    return this.level >= SFX_LEVEL.ALL;
  }

  playCue(cueName, options = {}) {
    if (this.level <= 0 || !this.player) return null;

    const minLevel = CUE_MIN_LEVEL[cueName] ?? 3;
    if (this.level < minLevel) return null;

    try {
      return this.player.play(cueName, options);
    } catch (err) {
      console.warn(`[SoundEngine] Failed to play cue "${cueName}":`, err);
      return null;
    }
  }

  // Rate-limited typing sound for chat
  playTyping() {
    if (this.level < SFX_LEVEL.COMMUNICATION || !this.player) return;

    // Suppress if window is not focused
    if (typeof document !== "undefined" && !document.hasFocus()) return;

    const now = Date.now();
    if (now - this._lastTypingPlay < 1800) return;
    this._lastTypingPlay = now;

    this.playCue("typing", { volume: 0.35 });
  }

  // Rate-limited snap sound for widget grid movement
  playWidgetSnap() {
    if (this.level < SFX_LEVEL.ALL || !this.player) return;

    const now = Date.now();
    if (now - this._lastSnapPlay < 120) return;
    this._lastSnapPlay = now;

    this.playCue("snap", { volume: 0.4 });
  }

  // Rate-limited volume slider change
  playVolumeChange() {
    if (this.level < SFX_LEVEL.ALL || !this.player) return;

    const now = Date.now();
    if (now - this._lastVolumePlay < 60) return;
    this._lastVolumePlay = now;

    this.playCue("volume-change", { volume: 0.3 });
  }

  playNav(cueName, options = {}) {
    if (this.level < SFX_LEVEL.ALL || !this.player) return;
    this.playCue(cueName, options);
  }

  stopAll() {
    this.player?.stopAll?.();
  }
}

export const soundEngine = new SoundEngine();
