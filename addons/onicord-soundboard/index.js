// Onicord Soundboard Addon - Plugin Island
console.log("[Soundboard] Complemento inicializado.");

if (typeof Onicord !== "undefined" && Onicord.ui?.registerPluginIslandWidget) {
  Onicord.ui.registerPluginIslandWidget({
    id: "soundboard_widget",
    title: "Soundboard",
    entryPoint: "widgets/island.html",
    height: 275,
  });
}
