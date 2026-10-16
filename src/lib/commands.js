

export function parsePollInput(rawInput) {
  if (!rawInput || typeof rawInput !== "string") return null;

  let text = rawInput.trim();
  if (text.toLowerCase().startsWith("/p")) {
    text = text.substring(2).trim();
  }

  if (!text) return null;

  // Buscar el primer guion que separa la pregunta de las opciones
  const dashIndex = text.search(/(?<=\s|^)-(?=[^\s])/);
  if (dashIndex === -1) return null;

  let question = text.substring(0, dashIndex).trim();
  if (question.startsWith('"') && question.endsWith('"') && question.length > 1) {
    question = question.slice(1, -1).trim();
  }

  const optionsRaw = text.substring(dashIndex);
  const rawParts = optionsRaw
    .split(/(?<=\s|^)-(?=[^\s])/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const options = [];
  for (let part of rawParts) {
    let optText = part;
    if (optText.startsWith("-")) optText = optText.substring(1).trim();
    if (optText.startsWith('"') && optText.endsWith('"') && optText.length > 1) {
      optText = optText.slice(1, -1).trim();
    }
    if (optText) options.push(optText);
  }

  if (!question || options.length < 2) return null;

  return {
    question,
    options: options.map((textStr, idx) => ({
      id: `opt_${idx}`,
      text: textStr,
      voters: [],
    })),
  };
}

export const ONICORD_COMMANDS = {
  "/clear": {
    name: "clear",
    description: "Limpia los mensajes de la vista local actual.",
    execute: (args, { setMessages }) => {
      setMessages([]);
    },
  },
  "/help": {
    name: "help",
    description: "Muestra la lista de comandos disponibles.",
    execute: (args, { injectSystemMessage }) => {
      const lista = Object.entries(ONICORD_COMMANDS)
        .map(([cmd, info]) => `• **${cmd}**: ${info.description}`)
        .join("\n");
      injectSystemMessage(`🛰️ **Available Onicord Commands:**\n${lista}`);
    },
  },
  "/ping": {
    name: "ping",
    description: "Prueba la latencia del enjambre local.",
    execute: (args, { injectSystemMessage, currentPing }) => {
      injectSystemMessage(
        `🏓 **Pong!** La latencia actual es de **${currentPing || 0}ms**.`,
      );
    },
  },
  "/avatar": {
    name: "avatar",
    description: "Cambia tu apodo express en la sala. Uso: /avatar [Nombre]",
    execute: (args, { updateProfile }) => {
      if (!args.length) return;
      updateProfile(args.join(" "));
    },
  },
  "/tts": {
    name: "tts",
    description: "Envía un mensaje de texto que será leído en voz alta.",
    execute: (args, { sendP2PMessage, injectSystemMessage }) => {
      if (!args.length) {
        injectSystemMessage("⚠️ **Uso correcto:** `/tts [mensaje]`");
        return;
      }
      sendP2PMessage(`[TTS_MESSAGE]:${args.join(" ")}`);
    },
  },
  "/bzz": {
    name: "bzz",
    description: "Envía un zumbido de Messenger.",
    execute: (args, { sendP2PMessage, injectSystemMessage }) => {
      const target = args[0] ? args[0].trim() : "@everyone";
      if (target.toLowerCase() === "@everyone") {
        sendP2PMessage(`[NUDGE_MESSAGE]:ALL`);
      } else if (target.startsWith("@")) {
        sendP2PMessage(`[NUDGE_MESSAGE]:USER:${target.substring(1)}`);
      } else {
        injectSystemMessage("⚠️ **Uso:** `/bzz @everyone` o `/bzz @usuario`.");
      }
    },
  },


  "/play": {
    name: "play",
    description:
      "Limpia la cola e inicia una canción de inmediato. Uso: /play [Link]",
    execute: (args) => {
      if (args[0])
        window.dispatchEvent(
          new CustomEvent("onicord:broadcast-music", {
            detail: `PLAY_NOW:${args[0]}`,
          }),
        );
    },
  },
  "/add": {
    name: "add",
    description: "Encola una canción en la playlist. Uso: /add [Link]",
    execute: (args) => {
      if (args[0])
        window.dispatchEvent(
          new CustomEvent("onicord:broadcast-music", {
            detail: `QUEUE_ADD:${args[0]}`,
          }),
        );
    },
  },
  "/stop": {
    name: "stop",
    description: "Detiene la música por completo.",
    execute: () => {
      window.dispatchEvent(
        new CustomEvent("onicord:broadcast-music", { detail: `STOP_ALL` }),
      );
    },
  },
  "/pause": {
    name: "pause",
    description: "Pausa la música en toda la sala.",
    execute: () => {
      window.dispatchEvent(
        new CustomEvent("onicord:broadcast-music", { detail: `PAUSE` }),
      );
    },
  },
  "/resume": {
    name: "resume",
    description: "Reanuda la canción pausada.",
    execute: () => {
      window.dispatchEvent(
        new CustomEvent("onicord:broadcast-music", { detail: `RESUME` }),
      );
    },
  },
  "/skip": {
    name: "skip",
    description: "Salta a la siguiente canción.",
    execute: () => {
      window.dispatchEvent(
        new CustomEvent("onicord:broadcast-music", { detail: `SKIP` }),
      );
    },
  },
};
