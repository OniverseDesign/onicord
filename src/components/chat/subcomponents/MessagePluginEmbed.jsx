import React, { useMemo, useState } from "react";
import { resolveAuthorDisplay } from "../../../lib/profileUtils";
import MaterialIcon from "../../icons/MaterialIcon";

export default function MessagePluginEmbed({
  rawText,
  msgId,
  profile,
  peers,
  onPluginAction,
}) {
  const [copied, setCopied] = useState(false);

  const embedPayload = useMemo(() => {
    try {
      if (!rawText || !rawText.startsWith("[PLUGIN_EMBED]:")) return null;
      const jsonStr = rawText.substring("[PLUGIN_EMBED]:".length);
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }, [rawText]);

  if (!embedPayload || !embedPayload.type) return null;

  const currentUserId = profile?.id || "self";

  if (embedPayload.type === "game_lobby" && embedPayload.data) {
    const { gameTitle, gameIcon, roomCode, authorName, joinUrl, coverUrl, gameCover } = embedPayload.data;
    const cover = coverUrl || gameCover || null;

    const handleJoinLobby = () => {
      const userNick = profile?.nickname || profile?.username || "Jugador";
      const rawJoinUrl = typeof joinUrl === "string" ? joinUrl.trim() : "";
      if (!rawJoinUrl.startsWith("https://") && !rawJoinUrl.startsWith("http://")) {
        console.warn("[MessagePluginEmbed] URL de sala rechazada por protocolo no seguro:", rawJoinUrl);
        return;
      }

      window.dispatchEvent(
        new CustomEvent("onicord:open-stage", {
          detail: {
            pluginId: embedPayload.pluginId,
            title: typeof gameTitle === "string" ? gameTitle.trim().slice(0, 100) : "Juego Online",
            icon: typeof gameIcon === "string" ? gameIcon.trim().slice(0, 50) : "sports_esports",
            url: rawJoinUrl,
            roomCode: typeof roomCode === "string" ? roomCode.trim().slice(0, 50) : null,
            userNick: userNick,
            authorName: userNick,
            shareCapture: embedPayload.data?.shareCapture,
            // SEGURIDAD: Nunca propagar frameScripts ejecutables desde mensajes de red P2P
            activity: embedPayload.data?.activity,
          },
        })
      );
    };

    const [imgError, setImgError] = useState(false);

    return (
      <div className="w-full max-w-sm my-2 p-3.5 rounded-onicord-inner bg-onicord-mantle border border-onicord-island select-none text-onicord-text font-sans transition-all duration-200">
        <div className="flex items-center gap-3 mb-2.5">
          <div className="w-11 h-11 rounded-xl bg-onicord-accent/20 flex items-center justify-center text-onicord-accent shrink-0 border border-onicord-accent/30 overflow-hidden">
            {cover && !imgError ? (
              <img
                src={cover}
                alt={gameTitle || "Game Cover"}
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <MaterialIcon name={gameIcon || "sports_esports"} size={22} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-sm text-onicord-text truncate">
              {gameTitle || "Partida Multijugador"}
            </h4>
            <p className="text-xs text-onicord-muted truncate">
              {authorName ? `${authorName} te invita a jugar` : "Sala disponible"}
            </p>
          </div>
          <div
            className="w-8 h-8 rounded-lg bg-onicord-surface/80 border border-white/10 flex items-center justify-center shrink-0 text-onicord-accent"
            title={embedPayload.pluginName || embedPayload.pluginId || "Complemento"}
          >
            <MaterialIcon name={gameIcon || "sports_esports"} size={18} />
          </div>
        </div>

        {roomCode && (
          <div className="flex items-center justify-between bg-onicord-base/70 px-3 py-1.5 rounded-lg border border-white/5 mb-3">
            <span className="text-[11px] text-onicord-muted">Código de Sala</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-onicord-accent tracking-wider">
                #{roomCode}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(roomCode);
                  }
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="p-1 rounded-md bg-white/5 hover:bg-white/15 text-onicord-muted hover:text-white transition-all cursor-pointer flex items-center justify-center"
                title={copied ? "¡Copiado!" : "Copiar código"}
              >
                <MaterialIcon name={copied ? "check" : "content_copy"} size={14} className={copied ? "text-green-400" : ""} />
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleJoinLobby}
          className="w-full py-2 px-3 bg-onicord-accent hover:bg-onicord-accent/90 text-white rounded-lg font-semibold text-xs transition-all duration-150 flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
        >
          <MaterialIcon name="play_arrow" size={16} />
          Unirse a la partida
        </button>
      </div>
    );
  }

  if (embedPayload.type === "poll" && embedPayload.data) {
    const pollData = embedPayload.data;
    const totalVotes = (pollData.options || []).reduce(
      (acc, opt) => acc + (opt.voters ? opt.voters.length : 0),
      0
    );

    const myVotedOptionId = (() => {
      if (!pollData.options) return null;
      for (const opt of pollData.options) {
        if (
          opt.voters &&
          opt.voters.some(
            (v) =>
              v.id === currentUserId ||
              v.id === profile?.id ||
              v.id === "self"
          )
        ) {
          return opt.id;
        }
      }
      return null;
    })();

    const handleOptionClick = (optionId) => {
      onPluginAction?.(msgId, embedPayload.pluginId, "VOTE", {
        pollId: pollData.pollId,
        optionId,
      });
    };

    return (
      <div className="w-full max-w-md my-2 p-4 rounded-onicord-inner bg-onicord-mantle border border-onicord-island select-none text-onicord-text font-sans transition-all duration-200">
        <div className="text-[15px] font-bold text-onicord-text leading-snug mb-1 break-words">
          {pollData.question}
        </div>

        <div className="text-[11px] font-medium text-onicord-muted mb-3 uppercase tracking-wider">
          Selección única
        </div>

        <div className="flex flex-col gap-2.5">
          {pollData.options?.map((option) => {
            const isSelected = myVotedOptionId === option.id;
            const voters = option.voters || [];
            const voteCount = voters.length;
            const percentage =
              totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

            return (
              <div
                key={option.id}
                onClick={() => handleOptionClick(option.id)}
                className={`relative flex flex-col p-3 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden group ${
                  isSelected
                    ? "bg-onicord-accent/15 border-onicord-accent"
                    : "bg-white/[0.02] border border-onicord-island hover:bg-white/[0.05]"
                }`}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-onicord-accent/25 transition-all duration-500 ease-out pointer-events-none rounded-xl"
                  style={{ width: `${percentage}%` }}
                />

                <div className="relative z-10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all shrink-0 ${
                        isSelected
                          ? "border-onicord-accent bg-onicord-accent text-white"
                          : "border-onicord-muted/40 bg-transparent group-hover:border-onicord-subtext"
                      }`}
                    >
                      {isSelected && (
                        <svg
                          className="w-3.5 h-3.5 stroke-[3]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>

                    <span className="text-[14px] font-semibold text-onicord-text truncate">
                      {option.text}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {voters.length > 0 && (
                      <div className="flex items-center -space-x-1.5 overflow-hidden py-0.5">
                        {voters.slice(0, 3).map((v, i) => {
                          const display = resolveAuthorDisplay(v.id, profile, peers, {
                            authorNickname: v.name,
                            authorAvatar: v.avatar,
                          });
                          return (
                            <div
                              key={v.id || i}
                              className="w-5 h-5 rounded-full border border-onicord-base bg-onicord-island overflow-hidden shrink-0"
                              title={display.nickname || "Votante"}
                            >
                              {display.avatar ? (
                                <img
                                  src={display.avatar}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-onicord-text uppercase">
                                  {(display.nickname || "?").charAt(0)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <span className="text-xs font-mono font-bold text-onicord-subtext min-w-[16px] text-right">
                      {voteCount}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
