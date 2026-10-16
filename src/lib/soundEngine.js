/**
 * soundEngine.js
 * Centralized sound engine for Onicord using uisfx with the Zen sound pack.
 */

import { createUISFX } from "uisfx";

class SoundEngine {
  constructor() {
    this.pack = "minimal";
    this.volume = 1.0;
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

      const savedEnabled = localStorage.getItem("onicord_sfx_enabled");
      if (savedEnabled !== null) {
        this.enabled = savedEnabled === "true";
      }

      const savedTyping = localStorage.getItem("onicord_sfx_typing");
      if (savedTyping !== null) {
        this.typingSoundsEnabled = savedTyping === "true";
      }

      const savedWidget = localStorage.getItem("onicord_sfx_widgets");
      if (savedWidget !== null) {
        this.widgetSoundsEnabled = savedWidget === "true";
      }

      const savedNav = localStorage.getItem("onicord_sfx_nav");
      if (savedNav !== null) {
        this.navSoundsEnabled = savedNav === "true";
      }
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

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    try {
      localStorage.setItem("onicord_sfx_enabled", String(this.enabled));
    } catch { }
    if (this.player) {
      this.player.setEnabled(this.enabled);
    }
  }

  isEnabled() {
    return this.enabled;
  }

  setTypingEnabled(enabled) {
    this.typingSoundsEnabled = Boolean(enabled);
    try {
      localStorage.setItem("onicord_sfx_typing", String(this.typingSoundsEnabled));
    } catch { }
  }

  isTypingEnabled() {
    return this.typingSoundsEnabled;
  }

  setWidgetSoundsEnabled(enabled) {
    this.widgetSoundsEnabled = Boolean(enabled);
    try {
      localStorage.setItem("onicord_sfx_widgets", String(this.widgetSoundsEnabled));
    } catch { }
  }

  isWidgetSoundsEnabled() {
    return this.widgetSoundsEnabled;
  }

  setNavSoundsEnabled(enabled) {
    this.navSoundsEnabled = Boolean(enabled);
    try {
      localStorage.setItem("onicord_sfx_nav", String(this.navSoundsEnabled));
    } catch { }
  }

  isNavSoundsEnabled() {
    return this.navSoundsEnabled;
  }

  playCue(cueName, options = {}) {
    if (!this.enabled || !this.player) return null;

    try {
      return this.player.play(cueName, options);
    } catch (err) {
      console.warn(`[SoundEngine] Failed to play cue "${cueName}":`, err);
      return null;
    }
  }

  // Rate-limited typing sound for chat
  playTyping() {
    if (!this.enabled || !this.typingSoundsEnabled) return;

    // Suppress if window is not focused
    if (typeof document !== "undefined" && !document.hasFocus()) return;

    const now = Date.now();
    if (now - this._lastTypingPlay < 1800) return;
    this._lastTypingPlay = now;

    this.playCue("typing", { volume: 0.35 });
  }

  // Rate-limited snap sound for widget grid movement
  playWidgetSnap() {
    if (!this.enabled || !this.widgetSoundsEnabled) return;

    const now = Date.now();
    if (now - this._lastSnapPlay < 120) return;
    this._lastSnapPlay = now;

    this.playCue("snap", { volume: 0.4 });
  }

  // Rate-limited volume slider change
  playVolumeChange() {
    if (!this.enabled) return;

    const now = Date.now();
    if (now - this._lastVolumePlay < 60) return;
    this._lastVolumePlay = now;

    this.playCue("volume-change", { volume: 0.3 });
  }

  playNav(cueName, options = {}) {
    if (!this.enabled || !this.navSoundsEnabled) return;
    this.playCue(cueName, options);
  }

  stopAll() {
    this.player?.stopAll?.();
  }
}

export const soundEngine = new SoundEngine();
