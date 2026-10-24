import { soundEngine } from "./soundEngine";
import i18n from "../i18n/config";

class NotificationManager {
  constructor() {
    this.settings = {
      enableNotifications: true,
      enableSoundEffects: true,
    };
    this._lastJoinTime = 0;
    this._lastToastTime = {};
  }

  setSettings(general) {
    this.settings = {
      enableNotifications: general?.enableNotifications ?? true,
      enableSoundEffects: general?.enableSoundEffects ?? true,
    };
    if (general?.sfxLevel !== undefined) {
      soundEngine.setLevel(general.sfxLevel);
    } else if (general?.enableSoundEffects !== undefined) {
      soundEngine.setEnabled(general.enableSoundEffects);
    }
  }

  playSound(soundName) {
    if (soundEngine.getLevel() <= 0) return;

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

  showToast(title, message, type = "info", duration = 7500, action = null, avatar = null, senderName = null) {
    if (this.settings && this.settings.enableNotifications === false) return;
    this.playSound("notification");
    const safeId =
      Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

    let finalAction = action;
    let finalAvatar = avatar;
    let finalSenderName = senderName;

    if (action && typeof action === "object" && (action.avatar || action.senderName) && !action.type) {
      finalAction = action.action || null;
      finalAvatar = action.avatar || null;
      finalSenderName = action.senderName || null;
    }

    window.dispatchEvent(
      new CustomEvent("onicord:toast", {
        detail: {
          id: safeId,
          title,
          message,
          type,
          duration,
          action: finalAction,
          avatar: finalAvatar,
          senderName: finalSenderName,
        },
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
      defaultValue: `Hay una nueva versión de Onicord disponible (v${version}). Haz clic para ver los detalles y actualizar.`,
    });

    this.showToast(title, message, "info", 15000, {
      type: "open_settings",
      section: "about",
    });

    if (this.settings && this.settings.enableNotifications !== false) {
      try {
        await this.notifySystem(title, message);
      } catch (err) {
        console.warn("[NotificationManager] Error sending system update notification:", err);
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
          if (this.settings?.enableNotifications !== false) {
            const sender = data.nickname || "Onicord";
            const preview = data.text
              ? data.text.length > 120
                ? data.text.substring(0, 117) + "..."
                : data.text
              : i18n.t("notifications.newMessageReceived", "Nuevo mensaje recibido");

            const toastKey = `${data.roomCode || ""}_${data.channelId || ""}`;
            const now = Date.now();
            if (!this._lastToastTime[toastKey] || now - this._lastToastTime[toastKey] >= 3500) {
              this._lastToastTime[toastKey] = now;

              const contextParts = [];
              if (data.channelName) contextParts.push(`#${data.channelName}`);
              if (data.serverName) contextParts.push(data.serverName);
              const context = contextParts.join(" • ");
              const title = context ? `${sender} (${context})` : sender;

              this.showToast(
                title,
                preview,
                "info",
                7000,
                (data.roomCode || data.serverId)
                  ? {
                      type: "navigate_channel",
                      roomCode: data.roomCode,
                      channelId: data.channelId || "general",
                      serverId: data.serverId,
                    }
                  : null,
                data.avatar || null,
                sender,
              );
            }

            if (!document.hasFocus()) {
              const contextParts = [];
              if (data.channelName) contextParts.push(`#${data.channelName}`);
              if (data.serverName) contextParts.push(data.serverName);
              const context = contextParts.join(" • ");
              const notifTitle = context ? `Onicord • ${sender} (${context})` : `Onicord • ${sender}`;

              window.electronAPI?.sendOSNotification?.(
                notifTitle,
                preview,
              );
            }
          }
        } else {
          soundEngine.playCue("receive");
        }
        break;
      case "MENTION":
        soundEngine.playCue("mention");
        {
          const sender = data.nickname || "alguien";
          const preview = data.text
            ? data.text.length > 120
              ? data.text.substring(0, 117) + "..."
              : data.text
            : i18n.t("notifications.userMentionedYouFallback", "Te mencionaron en el chat.");

          const contextParts = [];
          if (data.channelName) contextParts.push(`#${data.channelName}`);
          if (data.serverName) contextParts.push(data.serverName);
          const context = contextParts.join(" • ");

          const title = context
            ? `@${sender} (${context})`
            : i18n.t("notifications.userMentionedYou", {
                name: sender,
                defaultValue: `@${sender} te mencionó`,
              });

          this.showToast(
            title,
            preview,
            "warning",
            8500,
            (data.roomCode || data.serverId)
              ? {
                  type: "navigate_channel",
                  roomCode: data.roomCode,
                  channelId: data.channelId || "general",
                  serverId: data.serverId,
                }
              : null,
            data.avatar || null,
            sender,
          );

          if (!document.hasFocus() && (this.settings?.enableNotifications !== false)) {
            window.electronAPI?.sendOSNotification?.(
              `Onicord • ${title}`,
              preview,
            );
          }
        }
        break;
      default:
        break;
    }
  }
}

export const notificationManager = new NotificationManager();
