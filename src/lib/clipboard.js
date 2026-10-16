/**
 * Robust clipboard helper for Onicord.
 * Uses native Electron IPC if available (bypassing browser DOM permission checks),
 * falling back gracefully to navigator.clipboard.
 */

import { soundEngine } from "./soundEngine";

export async function copyTextToClipboard(text) {
  const str = String(text ?? "");
  if (window.electronAPI?.writeClipboard) {
    try {
      const res = await window.electronAPI.writeClipboard(str);
      if (res?.success) {
        soundEngine.playCue("copy");
        return true;
      }
    } catch (err) {
      console.warn("[Clipboard] Native Electron write failed, falling back:", err);
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(str);
      soundEngine.playCue("copy");
      return true;
    } catch (err) {
      console.error("[Clipboard] navigator.clipboard.writeText failed:", err);
    }
  }

  // Fallback for legacy scenarios
  try {
    const textArea = document.createElement("textarea");
    textArea.value = str;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textArea);
    return success;
  } catch (e) {
    console.error("[Clipboard] Fallback execCommand failed:", e);
    return false;
  }
}

export async function readTextFromClipboard() {
  if (window.electronAPI?.readClipboard) {
    try {
      const text = await window.electronAPI.readClipboard();
      if (typeof text === "string") return text;
    } catch (err) {
      console.warn("[Clipboard] Native Electron read failed, falling back:", err);
    }
  }

  if (navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch (err) {
      console.error("[Clipboard] navigator.clipboard.readText failed:", err);
    }
  }

  return "";
}
