import { soundEngine } from "./soundEngine";

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
            window.electronAPI?.sendOSNotification?.(
              `Message from ${data.nickname || "someone"}`,
              "Te han enviado un mensaje.",
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
          `${data.nickname} te mencionó en el chat.`,
          "warning",
        );
        if (!document.hasFocus() && (this.settings?.enableNotifications !== false)) {
          window.electronAPI?.sendOSNotification?.(
            `@${data.nickname} mentioned you`,
            data.text || "Check the Onicord chat!",
          );
        }
        break;
      default:
        break;
    }
  }
}

export const notificationManager = new NotificationManager();
