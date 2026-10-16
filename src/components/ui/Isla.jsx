import React from "react";

export default function Isla({
  children,
  isEditable = false,
  className = " silent-container",
  badgeText = "",
  badgeColor = "",
  bgVariant = "dark",
  customBackground = null, // NUEVA PROP: { type: 'image' | 'color', value: '...' }
  ...props
}) {
  const isDarkBase = bgVariant === "dark";

  const mapaFondos = {
    dark: "bg-onicord-base text-onicord-text border-onicord-island",
    lavender: "bg-onicord-accent text-onicord-dark border-transparent",
    danger: "bg-onicord-danger text-onicord-dark border-transparent",
    success: "bg-onicord-success text-onicord-dark border-transparent",
    pink: "bg-onicord-pink text-onicord-dark border-transparent",
    rosewater: "bg-onicord-rosewater text-onicord-dark border-transparent",
    flamingo: "bg-onicord-flamingo text-onicord-dark border-transparent",
    mauve: "bg-onicord-mauve text-onicord-dark border-transparent",
    maroon: "bg-onicord-maroon text-onicord-dark border-transparent",
    peach: "bg-onicord-peach text-onicord-dark border-transparent",
    yellow: "bg-onicord-yellow text-onicord-dark border-transparent",
    teal: "bg-onicord-teal text-onicord-dark border-transparent",
    sky: "bg-onicord-sky text-onicord-dark border-transparent",
    sapphire: "bg-onicord-sapphire text-onicord-dark border-transparent",
    blue: "bg-onicord-blue text-onicord-dark border-transparent",
  };

  const fondoClase = mapaFondos[bgVariant] || mapaFondos.dark;

  const tieneBlur = customBackground && customBackground.type === "image";

  return (
    <div
      className={`relative w-full h-full rounded-onicord-outer-p4 border flex flex-col overflow-hidden transition-all duration-300 ${fondoClase} p-0 ${
        tieneBlur ? "bg-black/90 backdrop-blur-md" : ""
      } ${
        isEditable
          ? "cursor-grab active:cursor-grabbing hover:shadow-lg bg-onicord-accent/5 bg-opacity-95"
          : ""
      } ${className}`}
      {...props}
    >
      {}
      {customBackground && customBackground.type === "image" && (
        <div
          className="absolute inset-0 z-0 pointer-events-none opacity-70 scale-110 blur-lg transition-all duration-500 transform-gpu"
          style={{
            backgroundImage: `url(${customBackground.value})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />
      )}

      {customBackground && customBackground.type === "color" && (
        <div
          className="absolute inset-0 z-0 transition-all duration-500 pointer-events-none"
          style={{
            backgroundColor: customBackground.value,
          }}
        />
      )}

      {}
      <div
        className={`absolute inset-0 border-2 border-transparent pointer-events-none transition-all duration-300 rounded-onicord-outer-p4 ${
          isEditable ? "!border-onicord-accent/40 animate-pulse" : ""
        }`}
      />

      {}
      <div
        style={{
          "--text-dinamico": isDarkBase
            ? "var(--onicord-text)"
            : "var(--onicord-text-dark)",
          "--subtext-dinamico": isDarkBase
            ? "var(--onicord-subtext)"
            : "var(--onicord-text-dark-sub)",
          "--muted-dinamico": isDarkBase
            ? "var(--onicord-muted)"
            : "var(--onicord-text-dark-muted)",
          "--accent-dinamico": "var(--onicord-accent)",
        }}
        className="flex-1 w-full h-full flex flex-col min-h-0 relative z-10"
      >
        {children}
      </div>
    </div>
  );
}
