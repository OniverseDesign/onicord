import React from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import { IconTag, IconSearch, IconClose } from "../../icons/StreamIcons";

export default function RoomHeader({
  resolvedDmUser,
  activeTextChannel,
  inputValue,
  setInputValue,
  setSearchQuery,
  isSearchFocused,
  setIsSearchFocused,
  searchInputRef,
}) {
  const { t } = useTranslation();

  return (
    <div
      className="flex min-w-0"
      style={{ gap: "calc(var(--gap) + 3px)" }}
    >
      <header className="h-12 shrink-0 flex items-center justify-between gap-2 pl-3 pr-4 bg-onicord-base rounded-full border border-onicord-island select-none">
        <div className="flex items-center gap-2 min-w-0">
          {resolvedDmUser ? (
            <>
              <div className="h-6 w-6 rounded-full overflow-hidden bg-onicord-accent flex items-center justify-center shrink-0">
                {resolvedDmUser.avatar ? (
                  <img
                    src={resolvedDmUser.avatar}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] font-bold text-white uppercase select-none">
                    {(resolvedDmUser.nickname || "?").charAt(0)}
                  </span>
                )}
              </div>
              <h2 className="font-semibold text-onicord-text truncate max-w-[150px]">
                {resolvedDmUser.nickname}
              </h2>
            </>
          ) : (
            <>
              {activeTextChannel?.type === "forum" ? (
                <MaterialIcon name="forum" size={20} className="text-onicord-accent" />
              ) : (
                <IconTag size="lg" className="text-onicord-accent" />
              )}
              <h2 className="font-semibold text-onicord-text">
                {activeTextChannel?.name === "general"
                  ? t("serverSettings.channels.defaultTextChannelName", "general")
                  : activeTextChannel?.name || "general"}
              </h2>
            </>
          )}
        </div>
      </header>

      <div className="h-12 flex-1 min-w-0 flex items-center gap-4 px-4 bg-onicord-base rounded-full border border-onicord-island relative">
        <IconSearch size="lg" />
        <input
          ref={searchInputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setInputValue("");
              setSearchQuery("");
              e.target.blur();
            }
          }}
          placeholder={
            isSearchFocused
              ? t("chat.searchPlaceholderActive", "Prueba: from:usuario, has:file, has:image, in:canal...")
              : t("chat.searchPlaceholder", "Buscar mensajes o archivos...")
          }
          className="flex-1 min-w-0 bg-transparent text-sm text-onicord-text placeholder:text-onicord-muted outline-none border-none"
        />
        {inputValue && (
          <button
            type="button"
            onClick={() => {
              setInputValue("");
              setSearchQuery("");
            }}
            className="flex items-center justify-center text-onicord-muted hover:text-onicord-text transition-colors cursor-pointer"
          >
            <IconClose size="lg" />
          </button>
        )}

        {isSearchFocused && !inputValue && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="absolute top-full left-0 right-0 mt-2 p-3 bg-onicord-base/95 backdrop-blur-md rounded-2xl border border-onicord-island shadow-2xl z-50 onicord-animate-popup-in origin-top"
          >
            <div className="text-[11px] font-semibold text-onicord-muted uppercase tracking-wider px-2 mb-2">
              {t("chat.searchFilterOptions", "Filtros de búsqueda disponibles")}
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setInputValue("from:");
                  searchInputRef.current?.focus();
                }}
                className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors text-left group cursor-pointer"
              >
                <code className="text-onicord-accent font-semibold bg-onicord-accent/10 px-1.5 py-0.5 rounded text-[11px]">from:</code>
                <span className="text-onicord-text text-[11px] group-hover:text-white truncate">{t("chat.searchFilterFrom", "Filtrar por autor o apodo")}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInputValue("has:image ");
                  searchInputRef.current?.focus();
                }}
                className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors text-left group cursor-pointer"
              >
                <code className="text-onicord-accent font-semibold bg-onicord-accent/10 px-1.5 py-0.5 rounded text-[11px]">has:image</code>
                <span className="text-onicord-text text-[11px] group-hover:text-white truncate">{t("chat.searchFilterImage", "Solo fotos e imágenes")}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInputValue("has:file ");
                  searchInputRef.current?.focus();
                }}
                className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors text-left group cursor-pointer"
              >
                <code className="text-onicord-accent font-semibold bg-onicord-accent/10 px-1.5 py-0.5 rounded text-[11px]">has:file</code>
                <span className="text-onicord-text text-[11px] group-hover:text-white truncate">{t("chat.searchFilterFile", "Archivos y documentos")}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInputValue("has:link ");
                  searchInputRef.current?.focus();
                }}
                className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors text-left group cursor-pointer"
              >
                <code className="text-onicord-accent font-semibold bg-onicord-accent/10 px-1.5 py-0.5 rounded text-[11px]">has:link</code>
                <span className="text-onicord-text text-[11px] group-hover:text-white truncate">{t("chat.searchFilterLink", "Mensajes con enlaces web")}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInputValue("in:");
                  searchInputRef.current?.focus();
                }}
                className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors text-left group cursor-pointer"
              >
                <code className="text-onicord-accent font-semibold bg-onicord-accent/10 px-1.5 py-0.5 rounded text-[11px]">in:</code>
                <span className="text-onicord-text text-[11px] group-hover:text-white truncate">{t("chat.searchFilterIn", "Buscar en canal específico")}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInputValue('""');
                  searchInputRef.current?.focus();
                }}
                className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors text-left group cursor-pointer"
              >
                <code className="text-onicord-accent font-semibold bg-onicord-accent/10 px-1.5 py-0.5 rounded text-[11px]">"frase"</code>
                <span className="text-onicord-text text-[11px] group-hover:text-white truncate">{t("chat.searchFilterPhrase", "Coincidencia exacta")}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("onicord:open-pinned-modal"))}
        className="h-12 w-12 rounded-full bg-onicord-base border border-onicord-island hover:bg-white/10 text-onicord-muted hover:text-onicord-accent transition-colors cursor-pointer shrink-0 flex items-center justify-center"
        title={t("chat.pinnedMessages", "Mensajes Fijados")}
      >
        <MaterialIcon name="push_pin" size="lg" />
      </button>
    </div>
  );
}
