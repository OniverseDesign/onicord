import { create } from "zustand";

/**
 * Global application store replacing dispersed DOM CustomEvents and local state coupling.
 */
export const useAppStore = create((set, get) => ({
  isPinnedModalOpen: false,
  setPinnedModalOpen: (open) => set({ isPinnedModalOpen: Boolean(open) }),

  searchFocusTrigger: 0,
  triggerFocusSearch: () => set((state) => ({ searchFocusTrigger: state.searchFocusTrigger + 1 })),

  // Muted channels map: { [channelId]: boolean }
  channelMutes: {},
  setChannelMute: (channelId, isMuted) => {
    if (!channelId) return;
    set((state) => ({
      channelMutes: {
        ...state.channelMutes,
        [channelId]: Boolean(isMuted),
      },
    }));
    try {
      if (isMuted) {
        localStorage.setItem(`channel_notif_mode_${channelId}`, "nothing");
      } else {
        localStorage.removeItem(`channel_notif_mode_${channelId}`);
      }
    } catch (_) {}
  },
  isChannelMuted: (channelId) => {
    if (!channelId) return false;
    const storeVal = get().channelMutes[channelId];
    if (storeVal !== undefined) return storeVal;
    try {
      return localStorage.getItem(`channel_notif_mode_${channelId}`) === "nothing";
    } catch (_) {
      return false;
    }
  },

  // Streamer Mode
  isStreamerMode: false,
  setStreamerMode: (enabled) => set({ isStreamerMode: Boolean(enabled) }),
}));
