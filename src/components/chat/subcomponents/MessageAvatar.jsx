import React from "react";
import SmartAnimatedImage from "../../ui/SmartAnimatedImage";
import IconEstrella from "../../icons/Estrella.svg?react";

export default function MessageAvatar({ src, name, nameColor, timestamp, isComplement }) {
  if (src === "bot-star" || (isComplement && !src)) {
    return (
      <div className="mt-0.5 h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-onicord-accent text-white">
        <IconEstrella
          className="w-5 h-5"
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            animation: "estrella-gira 8s linear infinite",
          }}
        />
      </div>
    );
  }

  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <div
      className="onicord-message-avatar"
      style={src ? { backgroundColor: "transparent" } : {}}
    >
      {src ? (
        <SmartAnimatedImage
          src={src}
          alt=""
          className="h-full w-full object-cover rounded-full"
          timestamp={timestamp}
          isAvatar={true}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-sm font-semibold text-white"
          style={nameColor ? { color: nameColor } : {}}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
