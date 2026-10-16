import React from "react";
import { useTranslation } from "react-i18next";

export default function ChatDropZone({ isDragging }) {
  const { t } = useTranslation();

  if (!isDragging) return null;

  return (
    <div className="absolute inset-0 bg-onicord-accent/10 border-2 border-dashed border-onicord-accent m-2 rounded-onicord-outer-p4 flex flex-col items-center justify-center text-onicord-text pointer-events-none z-40 backdrop-blur-sm animate-fade-in">
      <div className="bg-onicord-surface p-4 rounded-full shadow-xl border border-white/5 mb-3">
        <svg
          className="w-8 h-8 text-onicord-accent animate-bounce"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
      </div>
      <p className="text-lg font-bold">{t("chat.dropFileHere")}</p>
      <p className="text-sm text-onicord-muted mt-1">
        Ready in the input bar to be sent
      </p>
    </div>
  );
}
