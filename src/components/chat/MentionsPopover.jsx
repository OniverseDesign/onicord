import React, {
  memo,
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useMemo,
} from "react";
import { getEffectiveProfile } from "../../lib/profileUtils";
import {
  setSelectionOffsets,
  getSelectionCharacterOffsets,
  renderHTMLForInput,
} from "../../lib/inputFormatter";

const MentionsPopover = memo(
  forwardRef(function MentionsPopover(
    {
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
    },
    ref
  ) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const hasNavigatedRef = useRef(false);
    const itemRefs = useRef([]);

    useEffect(() => {
      setSelectedIndex(0);
      hasNavigatedRef.current = false;
    }, [input]);

    const serverKey = server?.roomCode || server?.id;
    const myEffectiveNick =
      (profile ? getEffectiveProfile(profile, serverKey)?.nickname : null) ||
      profile?.nickname;

    const usersMap = useMemo(() => {
      const map = new Map();
      if (profile && profile.id) {
        map.set(profile.id, {
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
        map.set(uId, {
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
          if (!map.has(sm.id)) {
            map.set(sm.id, {
              id: sm.id,
              nickname: sm.nickname,
              isMe: sm.id === profile?.id,
            });
          }
        }
      }

      return map;
    }, [profile, myEffectiveNick, peers, server?.savedMembers]);

    const allUsers = useMemo(() => Array.from(usersMap.values()), [usersMap]);

    const partes = (input || "").split(" ");
    const ultimaPalabra = partes[partes.length - 1] || "";
    const busqueda = ultimaPalabra.startsWith("@")
      ? ultimaPalabra.substring(1).toLowerCase()
      : "";

    const filteredUsers = useMemo(() => {
      return allUsers
        .filter((u) => u.nickname?.toLowerCase().startsWith(busqueda))
        .map((u) => ({
          type: "user",
          id: u.id,
          name: u.nickname,
          isMe: u.isMe,
          subtitle: u.isMe
            ? t?.("contextMenu.localProfile") || "Vos"
            : t?.("contextMenu.peerConnected") || "Conectado",
        }));
    }, [allUsers, busqueda, t]);

    const filteredRoles = useMemo(() => {
      return (roles || [])
        .filter((r) => r.name?.toLowerCase().startsWith(busqueda))
        .map((r) => ({
          type: "role",
          id: r.id,
          name: r.name,
          color: r.color || "#5865F2",
          subtitle: t ? t("roles.role", "Rol") : "Rol",
        }));
    }, [roles, busqueda, t]);

    const suggestions = useMemo(
      () => [...filteredRoles, ...filteredUsers],
      [filteredRoles, filteredUsers]
    );

    const validIndex =
      suggestions.length > 0
        ? Math.min(Math.max(0, selectedIndex), suggestions.length - 1)
        : 0;

    useEffect(() => {
      if (itemRefs.current[validIndex]) {
        itemRefs.current[validIndex].scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      }
    }, [validIndex]);

    const selectMention = useCallback(
      (item) => {
        if (!item) return;

        const el = tyrannyInputRef?.current;
        let newText = "";
        let newCursorPos = 0;

        const offsets = getSelectionCharacterOffsets(el);
        const currentText = input || el?.textContent || "";
        const cursor = offsets.start > 0 ? offsets.start : currentText.length;

        const textBeforeCursor = currentText.slice(0, cursor);
        const textAfterCursor = currentText.slice(cursor);

        const atIndex = textBeforeCursor.lastIndexOf("@");
        if (atIndex !== -1) {
          const prefix = textBeforeCursor.slice(0, atIndex);
          const mention = `@${item.name} `;
          const suffix = textAfterCursor.startsWith(" ")
            ? textAfterCursor.slice(1)
            : textAfterCursor;
          newText = prefix + mention + suffix;
          newCursorPos = prefix.length + mention.length;
        } else {
          const partesInput = currentText.split(" ");
          partesInput.pop();
          newText =
            partesInput.length > 0
              ? partesInput.join(" ") + ` @${item.name} `
              : `@${item.name} `;
          newCursorPos = newText.length;
        }

        setInput(newText);
        setShowMentionsPopup(false);

        if (el) {
          el.innerHTML = renderHTMLForInput(newText, allUsers);
          el.focus();
          setSelectionOffsets(el, newCursorPos, newCursorPos);
          requestAnimationFrame(() => {
            el.focus();
            setSelectionOffsets(el, newCursorPos, newCursorPos);
          });
        }
      },
      [input, tyrannyInputRef, setInput, setShowMentionsPopup, allUsers]
    );

    useImperativeHandle(
      ref,
      () => ({
        isOpen: Boolean(showMentionsPopup && suggestions.length > 0),
        handleKeyDown: (e) => {
          if (!showMentionsPopup || suggestions.length === 0) return false;

          if (
            e.key === "ArrowDown" &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey
          ) {
            e.preventDefault();
            e.stopPropagation();
            hasNavigatedRef.current = true;
            setSelectedIndex((prev) => (prev + 1) % suggestions.length);
            return true;
          }

          if (
            e.key === "ArrowUp" &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey
          ) {
            e.preventDefault();
            e.stopPropagation();
            hasNavigatedRef.current = true;
            setSelectedIndex(
              (prev) => (prev - 1 + suggestions.length) % suggestions.length
            );
            return true;
          }

          if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            selectMention(suggestions[validIndex]);
            return true;
          }

          if (e.key === "Enter" && !e.shiftKey && hasNavigatedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            selectMention(suggestions[validIndex]);
            return true;
          }

          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setShowMentionsPopup(false);
            return true;
          }

          return false;
        },
      }),
      [showMentionsPopup, suggestions, validIndex, selectMention, setShowMentionsPopup]
    );

    if (!showMentionsPopup || suggestions.length === 0) return null;

    return (
      <div
        onMouseDown={(e) => e.preventDefault()}
        className="onicord-floating-menu bottom-[calc(100%+8px)] left-2 w-[calc(100%-32px)] max-w-md"
      >
        <div className="onicord-context-menu-title border-b border-white/[0.02] pb-1 mb-1 flex items-center justify-between text-xs text-onicord-muted">
          <span>{t ? t("chat.mentionUser", "Menciones") : "Menciones"}</span>
          {filteredRoles.length > 0 && (
            <span className="text-[10px] opacity-60 font-mono">
              {filteredRoles.length} {t ? t("roles.roles", "roles") : "roles"}
            </span>
          )}
        </div>
        <div className="space-y-0.5 max-h-48 overflow-y-auto minimal-scrollbar">
          {suggestions.map((item, index) => {
            const isSelected = index === validIndex;
            return (
              <div
                key={`${item.type}-${item.id}`}
                ref={(el) => (itemRefs.current[index] = el)}
                onClick={() => selectMention(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors text-xs group ${
                  isSelected
                    ? "bg-onicord-accent text-onicord-surface"
                    : "hover:bg-onicord-accent/20 text-onicord-text"
                }`}
              >
                <div className="flex items-center gap-2">
                  {item.type === "role" ? (
                    <>
                      <span
                        className={`font-bold ${isSelected ? "text-inherit" : ""}`}
                        style={{ color: isSelected ? "inherit" : item.color }}
                      >
                        @{item.name}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                          isSelected
                            ? "bg-onicord-surface/20 text-onicord-surface"
                            : "bg-white/10 text-onicord-muted group-hover:text-onicord-surface"
                        }`}
                      >
                        Rol
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className={`font-bold ${
                          isSelected
                            ? "text-inherit"
                            : "text-[var(--onicord-lavender)] group-hover:text-inherit"
                        }`}
                      >
                        @{item.name}
                      </span>
                      {item.isMe && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold ${
                            isSelected
                              ? "bg-onicord-surface/20 text-onicord-surface"
                              : "bg-white/5 text-onicord-muted group-hover:text-onicord-surface"
                          }`}
                        >
                          Vos
                        </span>
                      )}
                    </>
                  )}
                </div>
                <span
                  className={`text-[10px] font-mono ${
                    isSelected
                      ? "text-inherit opacity-80"
                      : "opacity-50 group-hover:text-onicord-surface"
                  }`}
                >
                  {item.subtitle}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  })
);

MentionsPopover.displayName = "MentionsPopover";
export default MentionsPopover;
