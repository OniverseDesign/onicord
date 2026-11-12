import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { notificationManager } from "../lib/notificationManager";
import { soundEngine } from "../lib/soundEngine";

/**
 * Minimum volume level to be considered intentional speech (filtering out ambient noise/fans/breathing)
 */
const SPEECH_NOISE_THRESHOLD = 18;

/**
 * Tracks inactivity for users connected to a voice channel.
 * Moves user to the designated AFK channel if they have neither spoken nor typed within the timeout.
 *
 * @param {Object} options
 * @param {Object|null} options.server - Current server object containing afkSettings and channels
 * @param {string|null} options.channelId - ID of the channel the user is currently connected to
 * @param {Object} options.voice - Voice connection state and controls (inVoice, muted, toggleMute, etc.)
 * @param {Function} options.onMoveToAfk - Callback to move user to AFK channel (e.g. joinVoiceChannel(server, afkChannelId))
 */
export function useVoiceAfkTracker({ server, channelId, voice, onMoveToAfk }) {
  const { t } = useTranslation();
  const lastActivityRef = useRef(Date.now());
  const hasWarnedRef = useRef(false);
  const onMoveRef = useRef(onMoveToAfk);
  const voiceToggleMuteRef = useRef(voice.toggleMute);
  const voiceMutedRef = useRef(voice.muted);

  useEffect(() => {
    onMoveRef.current = onMoveToAfk;
    voiceToggleMuteRef.current = voice.toggleMute;
    voiceMutedRef.current = voice.muted;
  }, [onMoveToAfk, voice.toggleMute, voice.muted]);

  const afkSettings = server?.afkSettings;
  const afkChannelId = afkSettings?.channelId;
  const timeoutSec = Math.max(30, Number(afkSettings?.timeout) || 300);

  useEffect(() => {
    // Only track if connected to voice, an AFK channel is designated, and current channel is NOT already the AFK channel
    if (!voice.inVoice || !channelId || !afkChannelId || channelId === afkChannelId) {
      hasWarnedRef.current = false;
      return;
    }

    // Reset activity on entering channel
    lastActivityRef.current = Date.now();
    hasWarnedRef.current = false;

    const resetActivity = () => {
      lastActivityRef.current = Date.now();
      hasWarnedRef.current = false;
    };

    // 1. Voice activity listener (filtering ambient noise)
    const handleSpeakingChange = (e) => {
      const { peerId, isSpeaking, volumeLevel } = e.detail || {};
      const isSelf = peerId === "self" || peerId === voice.localPeerId;
      if (!isSelf) return;

      // Only count as real speech if volume exceeds the noise threshold
      if (isSpeaking && (volumeLevel === undefined || volumeLevel >= SPEECH_NOISE_THRESHOLD)) {
        resetActivity();
      }
    };

    // 2. Text / Writing activity listeners
    const handleKeyDown = (e) => {
      // Activity counts if typing into an input/textarea/editor or typing regular keys
      const targetTag = e.target?.tagName?.toLowerCase();
      const isInput = targetTag === "input" || targetTag === "textarea" || e.target?.isContentEditable;
      if (isInput || e.key.length === 1) {
        resetActivity();
      }
    };

    const handleMessageSent = () => {
      resetActivity();
    };

    const handleAfkStay = () => {
      resetActivity();
      soundEngine.playNav("select");
    };

    window.addEventListener("peer-speaking-change", handleSpeakingChange);
    window.addEventListener("keydown", handleKeyDown, { passive: true });
    window.addEventListener("onicord:message-sent", handleMessageSent);
    window.addEventListener("onicord:afk-stay", handleAfkStay);

    // 3. Periodic evaluation loop
    const warningLeadSec = Math.min(30, Math.floor(timeoutSec / 2));
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedSec = (now - lastActivityRef.current) / 1000;
      const remainingSec = timeoutSec - elapsedSec;

      // Check if we should emit the pre-warning toast ("¿Sigues ahí?")
      if (remainingSec <= warningLeadSec && remainingSec > 0 && !hasWarnedRef.current) {
        hasWarnedRef.current = true;
        const secondsLeft = Math.max(1, Math.round(remainingSec));

        notificationManager.showToast(
          t("voice.afkWarningTitle", "¿Sigues ahí?"),
          t("voice.afkWarningDesc", {
            seconds: secondsLeft,
            defaultValue: `Has estado inactivo. Serás movido al canal AFK en ${secondsLeft} segundos.`,
          }),
          "warning",
          warningLeadSec * 1000,
          {
            type: "custom_event",
            eventName: "onicord:afk-stay",
          }
        );
      }

      // Check if timeout reached -> Auto-move to AFK channel
      if (elapsedSec >= timeoutSec) {
        clearInterval(interval);
        hasWarnedRef.current = false;
        lastActivityRef.current = Date.now();

        const targetAfkChannel = server?.channels?.find((c) => c.id === afkChannelId);
        const afkChannelName = targetAfkChannel?.name || "AFK";

        // Move to AFK channel
        onMoveRef.current?.(afkChannelId);

        // Ensure user is muted
        if (!voiceMutedRef.current) {
          voiceToggleMuteRef.current?.();
        }

        // Notification and sound
        notificationManager.showToast(
          t("voice.afkMovedTitle", "Canal AFK"),
          t("voice.afkMovedToast", {
            channel: afkChannelName,
            defaultValue: `Has sido movido a ${afkChannelName} por inactividad.`,
          }),
          "info"
        );
        soundEngine.playCue("toggle-off");
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("peer-speaking-change", handleSpeakingChange);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("onicord:message-sent", handleMessageSent);
      window.removeEventListener("onicord:afk-stay", handleAfkStay);
    };
  }, [voice.inVoice, channelId, afkChannelId, timeoutSec, server, voice.localPeerId, t]);
}
