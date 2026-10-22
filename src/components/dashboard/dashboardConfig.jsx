import ConexionWidget from "./widgets/ConexionWidget";
import FilesWidget from "./widgets/FilesWidget";
import HardwareWidget from "./widgets/HardwareWidget";
import HoraWidget from "./widgets/HoraWidget"; 
import WeatherWidget from "./widgets/WeatherWidget"; 
import MusicPlayerWidget from "./widgets/MusicPlayerWidget";
import SketchpadWidget from "./widgets/SketchpadWidget";
import ActivityWidget from "./widgets/ActivityWidget";
import PluginWidgetAdapter from "./widgets/PluginWidgetAdapter";

const ACTIVE_WIDGETS = [
  ConexionWidget,
  FilesWidget,
  HardwareWidget,
  HoraWidget,
  WeatherWidget, 
  MusicPlayerWidget,
  SketchpadWidget,
  ActivityWidget,
];

export const WIDGET_COMPONENTS = ACTIVE_WIDGETS.reduce((acc, Comp) => {
  acc[Comp.widgetId] = Comp;
  return acc;
}, {});

export const getWidgetComponent = (widgetId) => {
  if (WIDGET_COMPONENTS[widgetId]) return WIDGET_COMPONENTS[widgetId];
  if (widgetId.includes(":")) return PluginWidgetAdapter;
  return null;
};

export const CONFIG_ISLAS = ACTIVE_WIDGETS.map((Comp) => ({
  id: Comp.widgetId,
  badgeText: Comp.badgeText || "Onicord Module",
  bgVariant: Comp.bgVariant || "dark",
  defaultGeo: Comp.defaultGeo || { x: 1, y: 1, w: 2, h: 2 },
}));

let dynamicPluginConfigs = [];

export const setDynamicPluginConfigs = (configs) => {
  dynamicPluginConfigs = configs.map((pw) => ({
    id: pw.fullId,
    title: pw.title,
    badgeText: pw.badgeText || "Addon",
    bgVariant: pw.bgVariant || "dark",
    defaultGeo: pw.defaultGeo || { x: 1, y: 1, w: 2, h: 2 },
    isPlugin: true,
    pluginMeta: pw,
  }));
};

export const getCombinedConfigs = () => {
  return [...CONFIG_ISLAS, ...dynamicPluginConfigs];
};

export const STORAGE_KEY = "onicord_dashboard_layout_v3";
