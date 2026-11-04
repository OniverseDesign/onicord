import React, { memo } from "react";
import { getEffectiveProfile } from "../../lib/profileUtils";

const MentionsPopover = memo(
  ({
    showMentionsPopup,
    input,
    setInput,
    peers,
    profile,
    server,
    roles = [],
    setShowMentionsPopup,
    tyrannyInputRef,
    t,
  }) => {
    if (!showMentionsPopup) return null;

    const partes = input.split(" ");
    const ultimaPalabra = partes[partes.length - 1];
    const busqueda = ultimaPalabra.startsWith("@")
      ? ultimaPalabra.substring(1).toLowerCase()
      : "";

    const serverKey = server?.roomCode || server?.id;
    const myEffectiveNick = (profile ? getEffectiveProfile(profile, serverKey)?.nickname : null) || profile?.nickname;

    const usersMap = new Map();
    if (profile && profile.id) {
      usersMap.set(profile.id, {
        id: profile.id,
        nickname: myEffectiveNick,
        isMe: true,
      });
    }

    const peerList = Array.isArray(peers) ? peers : Object.values(peers || {});
    for (const p of peerList) {
      const uId = p.id || p.userId;
      if (!uId) continue;
      const saved = server?.savedMembers?.[uId];
      usersMap.set(uId, {
        id: uId,
        nickname: saved?.nickname || p.nickname,
        isMe: false,
      });
    }

    if (server?.savedMembers) {
      const savedEntries = Array.isArray(server.savedMembers)
        ? server.savedMembers
        : Object.values(server.savedMembers);
      for (const sm of savedEntries) {
        if (!sm || !sm.id) continue;
        if (!usersMap.has(sm.id)) {
          usersMap.set(sm.id, {
            id: sm.id,
            nickname: sm.nickname,
            isMe: sm.id === profile?.id,
          });
        }
      }
    }

    const allUsers = Array.from(usersMap.values());

    const filteredUsers = allUsers
      .filter((u) => u.nickname?.toLowerCase().startsWith(busqueda))
      .map((u) => ({
        type: "user",
        id: u.id,
        name: u.nickname,
        isMe: u.isMe,
        subtitle: u.isMe ? t("contextMenu.localProfile") : t("contextMenu.peerConnected"),
      }));

    const filteredRoles = (roles || [])
      .filter((r) => r.name?.toLowerCase().startsWith(busqueda))
      .map((r) => ({
        type: "role",
        id: r.id,
        name: r.name,
        color: r.color || "#5865F2",
        subtitle: t("roles.role", "Rol"),
      }));

    const suggestions = [...filteredRoles, ...filteredUsers];

    if (suggestions.length === 0) return null;

    const handleSelect = (item) => {
      const partesInput = input.split(" ");
      partesInput.pop();

      const nuevoTexto =
        partesInput.length > 0
          ? partesInput.join(" ") + ` @${item.name} `
          : `@${item.name} `;

      setInput(nuevoTexto);
      setShowMentionsPopup(false);
      tyrannyInputRef.current?.focus();
    };

    return (
      <div className="onicord-floating-menu bottom-[calc(100%+8px)] left-2 w-[calc(100%-32px)] max-w-md">
        <div className="onicord-context-menu-title border-b border-white/[0.02] pb-1 mb-1 flex items-center justify-between text-xs text-onicord-muted">
          <span>{t("chat.mentionUser", "Menciones")}</span>
          {filteredRoles.length > 0 && (
            <span className="text-[10px] opacity-60 font-mono">
              {filteredRoles.length} {t("roles.roles", "roles")}
            </span>
          )}
        </div>
        <div className="space-y-0.5 max-h-48 overflow-y-auto minimal-scrollbar">
          {suggestions.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              onClick={() => handleSelect(item)}
              className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-onicord-accent hover:text-onicord-surface cursor-pointer transition-colors text-xs text-onicord-text group"
            >
              <div className="flex items-center gap-2">
                {item.type === "role" ? (
                  <>
                    <span
                      className="font-bold group-hover:text-inherit"
                      style={{ color: item.color }}
                    >
                      @{item.name}
                    </span>
                    <span className="text-[9px] bg-white/10 text-onicord-muted group-hover:text-onicord-surface px-1.5 py-0.5 rounded font-semibold uppercase">
                      Rol
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-[var(--onicord-lavender)] group-hover:text-inherit">
                      @{item.name}
                    </span>
                    {item.isMe && (
                      <span className="text-[9px] bg-white/5 text-onicord-muted group-hover:text-onicord-surface px-1.5 py-0.5 rounded uppercase font-semibold">
                        Vos
                      </span>
                    )}
                  </>
                )}
              </div>
              <span className="opacity-50 text-[10px] font-mono group-hover:text-onicord-surface">
                {item.subtitle}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
);

MentionsPopover.displayName = "MentionsPopover";
export default MentionsPopover;
