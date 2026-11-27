import { createContext, useContext } from "react";

const WidgetLayoutContext = createContext({
  cols: 2,
  rows: 2,
  area: 4,
  widthPx: 260,
  heightPx: 240,
  aspectRatio: 1,
  fontWdth: 92,
  sizeMode: "compact",
  surface: "dark",
  isDarkSurface: true,
  isCustomizing: false,
  customizeButtons: null,
});

export function WidgetLayoutProvider({ value, children }) {
  return (
    <WidgetLayoutContext.Provider value={value}>
      {children}
    </WidgetLayoutContext.Provider>
  );
}

export function useWidgetLayout() {
  return useContext(WidgetLayoutContext);
}
