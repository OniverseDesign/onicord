export const DEFAULT_V2_LAYOUT = {
  hora: { x: 1, y: 1, w: 3, h: 3 },
  weather: { x: 4, y: 1, w: 3, h: 2 },
  hardware: { x: 4, y: 3, w: 3, h: 1 },
  ares: { x: 7, y: 1, w: 3, h: 3 },
  sketchpad: { x: 10, y: 1, w: 3, h: 6 },
  "music-player": { x: 1, y: 4, w: 3, h: 3 },
  gaming_stats: { x: 4, y: 4, w: 3, h: 3 },
  conexion: { x: 7, y: 4, w: 3, h: 3 },
};

export const LAYOUT_PRESETS = [
  {
    id: "balanced",
    label: "Equilibrado",
    description: "Todo visible en 12×6 sin scroll",
    hiddenIds: [],
    layout: { ...DEFAULT_V2_LAYOUT },
  },
  {
    id: "monitoring",
    label: "Monitoreo & Studio",
    description: "Hardware y clima protagonistas",
    hiddenIds: [],
    layout: {
      hardware: { x: 1, y: 1, w: 6, h: 3 },
      weather: { x: 7, y: 1, w: 3, h: 3 },
      hora: { x: 10, y: 1, w: 3, h: 2 },
      conexion: { x: 10, y: 3, w: 3, h: 2 },
      "music-player": { x: 1, y: 4, w: 5, h: 3 },
      gaming_stats: { x: 6, y: 4, w: 4, h: 3 },
      ares: { x: 10, y: 5, w: 3, h: 2 },
      sketchpad: { x: 1, y: 7, w: 6, h: 3 },
    },
  },
  {
    id: "minimal",
    label: "Minimalista",
    description: "Solo lo esencial en formatos amplios",
    hiddenIds: ["conexion", "ares", "sketchpad"],
    layout: {
      hora: { x: 1, y: 1, w: 3, h: 3 },
      weather: { x: 4, y: 1, w: 5, h: 3 },
      hardware: { x: 9, y: 1, w: 4, h: 3 },
      "music-player": { x: 1, y: 4, w: 6, h: 3 },
      gaming_stats: { x: 7, y: 4, w: 6, h: 3 },
    },
  },
];
