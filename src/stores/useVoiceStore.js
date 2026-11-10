import { create } from "zustand";

/**
 * Atomic voice store for real-time speech telemetry and peripheral audio states.
 * Replaces monolithic VoiceContext re-renders with granular selectors.
 */
export const useVoiceStore = create((set, get) => ({
  // Map of peerId -> { isSpeaking: boolean, volume: number }
  speakingPeers: {},
  activeVoiceChannelId: null,
  isMuted: false,
  isDeafened: false,
  isScreenSharing: false,

  setPeerSpeaking: (peerId, isSpeaking, volume = 0) => {
    if (!peerId) return;
    set((state) => {
      const prev = state.speakingPeers[peerId];
      if (prev && prev.isSpeaking === isSpeaking && Math.abs((prev.volume || 0) - volume) < 5) {
        return state; // No state change, avoid allocation
      }
      return {
        speakingPeers: {
          ...state.speakingPeers,
          [peerId]: { isSpeaking, volume },
        },
      };
    });
  },

  clearPeerSpeaking: (peerId) => {
    if (!peerId) return;
    set((state) => {
      if (!state.speakingPeers[peerId]) return state;
      const next = { ...state.speakingPeers };
      delete next[peerId];
      return { speakingPeers: next };
    });
  },

  setVoiceState: (patch) => {
    set((state) => ({ ...state, ...patch }));
  },

  resetVoice: () => {
    set({
      speakingPeers: {},
      activeVoiceChannelId: null,
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false,
    });
  },
}));

/**
 * Selective hook for a single peer's speaking state.
 * Only the specific avatar subscribing to this peerId re-renders when they speak.
 */
export const usePeerIsSpeaking = (peerId) => {
  return useVoiceStore((s) => Boolean(s.speakingPeers[peerId]?.isSpeaking));
};
