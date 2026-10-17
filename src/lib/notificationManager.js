import { soundEngine } from "./soundEngine";
import i18n from "../i18n/config";

class NotificationManager {
  constructor() {
    this.settings = {
      enableNotifications: true,
      enableSoundEffects: true,
    };
    this._lastJoinTime = 0;
  }

  setSettings(general) {
    this.settings = {
      enableNotifications: general?.enableNotifications ?? true,
      enableSoundEffects: general?.enableSoundEffects ?? true,
    };
    if (general?.enableSoundEffects !== undefined) {
      soundEngine.setEnabled(general.enableSoundEffects);
    }
  }

  playSound(soundName) {
    if (this.settings && this.settings.enableSoundEffects === false) return;

    const cueMap = {
      join: "connect",
      leave: "disconnect",
      mute: "toggle-off",
      unmute: "toggle-on",
      deaf: "lock",
      undeaf: "unlock",
      message: "receive",
      notification: "notification",
    };

    const cue = cueMap[soundName] || soundName;
    soundEngine.playCue(cue);
  }

  showToast(title, message, type = "info") {
    if (this.settings && this.settings.enableNotifications === false) return;
    this.playSound("notification");
    const safeId =
      Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    window.dispatchEvent(
      new CustomEvent("onicord:toast", {
        detail: { id: safeId, title, message, type },
      }),
    );
  }

  notifySystem(title, body) {
    if (window.electronAPI?.testOSNotification) {
      return window.electronAPI.testOSNotification(title, body);
    }
    if (window.electronAPI?.sendOSNotification) {
      window.electronAPI.sendOSNotification(title, body);
      return Promise.resolve({ success: true });
    }
    return Promise.resolve({ success: false, reason: "NOT_SUPPORTED" });
  }

  async notifyUpdateAvailable(version) {
    const title = i18n.t("notifications.updateAvailableTitle", "Actualización disponible");
    const message = i18n.t("notifications.updateAvailableMsg", {
      version,
      defaultValue: `Hay una nueva versión de Onicord disponible (v${version}).`,
    });

    this.showToast(title, message, "info");

    if (this.settings && this.settings.enableNotifications !== false) {
      let isMinimized = false;
      try {
        if (window.electronAPI?.isWindowMinimized) {
          isMinimized = await window.electronAPI.isWindowMinimized();
        }
      } catch (err) {
        console.warn("[NotificationManager] Error checking window minimized state:", err);
      }

      const isHiddenOrUnfocused = isMinimized || document.hidden || !document.hasFocus();
      if (isHiddenOrUnfocused) {
        this.notifySystem(title, message);
      }
    }
  }

  trigger(actionType, data = {}) {
    switch (actionType) {
      case "LOCAL_JOIN_VOICE":
        this._lastJoinTime = Date.now();
        soundEngine.playCue("connect");
        break;
      case "LOCAL_LEFT_VOICE":
        soundEngine.playCue("disconnect");
        break;
      case "USER_JOIN_VOICE":
        if (this._lastJoinTime && Date.now() - this._lastJoinTime < 4000)
          return;
        this._lastJoinTime = Date.now();
        soundEngine.playCue("connect");
        break;
      case "USER_LEFT_VOICE":
        soundEngine.playCue("disconnect");
        break;
      case "LOCAL_MUTE":
        soundEngine.playCue(data.isMuted ? "toggle-off" : "toggle-on");
        break;
      case "LOCAL_DEAFEN":
        soundEngine.playCue(data.isDeafened ? "lock" : "unlock");
        break;
      case "RECEIVE_MESSAGE":
        if (!data.isCurrentChannel) {
          soundEngine.playCue("notification");
          if (!document.hasFocus() && (this.settings?.enableNotifications !== false)) {
            const sender = data.nickname || "Onicord";
            const preview = data.text
              ? data.text.length > 120
                ? data.text.substring(0, 117) + "..."
                : data.text
              : i18n.t("notifications.newMessageReceived", "New message received");
            window.electronAPI?.sendOSNotification?.(
              `Onicord • ${sender}`,
              preview,
            );
          }
        } else {
          soundEngine.playCue("receive");
        }
        break;
      case "MENTION":
        soundEngine.playCue("mention");
        this.showToast(
          "Mention",
          i18n.t("notifications.userMentionedYouChat", {
            name: data.nickname || "someone",
            defaultValue: `${data.nickname || "someone"} mentioned you in chat.`,
          }),
          "warning",
        );
        if (!document.hasFocus() && (this.settings?.enableNotifications !== false)) {
          const sender = data.nickname || "someone";
          const preview = data.text
            ? data.text.length > 120
              ? data.text.substring(0, 117) + "..."
              : data.text
            : i18n.t("notifications.userMentionedYouFallback", "You were mentioned in the Onicord chat.");
          window.electronAPI?.sendOSNotification?.(
            i18n.t("notifications.userMentionedYou", {
              name: sender,
              defaultValue: `@${sender} mentioned you`,
            }),
            preview,
          );
        }
        break;
      default:
        break;
    }
  }
}

export const notificationManager = new NotificationManager();
