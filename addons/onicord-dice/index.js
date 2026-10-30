// Complemento Oficial Onicord: Dados / Dices (/roll)

function parseDiceExpression(expr) {
  if (!expr) return null;
  const clean = String(expr).trim().toLowerCase();

  // Pattern: XdY or dY (e.g., 2d6, d20, 1d100) with optional modifier (+3, -1)
  const match = clean.match(/^(\d*)d(\d+)(?:([+-])(\d+))?$/i);
  if (match) {
    const count = match[1] ? parseInt(match[1], 10) : 1;
    const faces = parseInt(match[2], 10);
    const modSign = match[3];
    const modifier = match[4] ? parseInt(match[4], 10) * (modSign === "-" ? -1 : 1) : 0;
    return {
      count: Math.min(Math.max(count, 1), 10),
      faces: Math.min(Math.max(faces, 2), 1000),
      modifier,
    };
  }

  // Single number like "/roll 20" -> 1d20
  if (/^\d+$/.test(clean)) {
    const faces = parseInt(clean, 10);
    if (faces >= 2) {
      return { count: 1, faces: Math.min(faces, 1000), modifier: 0 };
    }
  }

  return null;
}

const DICE_I18N = {
  es: {
    title: "Dados",
    rolled: "lanzó",
    critSuccess: " [ÉXITO CRÍTICO (20)]",
    critFail: " [PIFIA NATURAL (1)]",
    total: "Total",
  },
  en: {
    title: "Dices",
    rolled: "rolled",
    critSuccess: " [CRITICAL SUCCESS (20)]",
    critFail: " [NATURAL FAILURE (1)]",
    total: "Total",
  },
  pt: {
    title: "Dados",
    rolled: "lançou",
    critSuccess: " [SUCESSO CRÍTICO (20)]",
    critFail: " [FALHA NATURAL (1)]",
    total: "Total",
  },
};

function getDiceI18n() {
  const code = String(Onicord.language || Onicord.getLanguage?.() || "es").split("-")[0].toLowerCase();
  return DICE_I18N[code] || DICE_I18N.es;
}

// 1. Registro del Widget en la Isla de Complementos (Panel Lateral Derecho)
if (typeof Onicord !== "undefined" && Onicord.ui?.registerPluginIslandWidget) {
  const i18n = getDiceI18n();
  Onicord.ui.registerPluginIslandWidget({
    id: "dice-island-widget",
    title: i18n.title,
    entryPoint: "widgets/dice_island.html",
    height: 275,
  });
}

// 2. Registro del comando de chat /roll
if (typeof Onicord !== "undefined" && Onicord.chat?.onCommand) {
  Onicord.chat.onCommand("roll", async (args, context) => {
    const authorName = context?.author?.nickname || "Usuario";
    const authorId = context?.author?.id || "local";
    const rawArg = Array.isArray(args) ? args.join(" ").trim() : "";
    const L = getDiceI18n();

    let diceSpec = parseDiceExpression(rawArg);
    if (!diceSpec) {
      // Intentar leer la configuración guardada por el widget en storage
      let configuredCount = 2;
      let configuredFaces = 6;
      try {
        if (Onicord.storage?.get) {
          const stored = await Onicord.storage.get("dice_config");
          if (stored) {
            const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
            if (parsed.count) configuredCount = parsed.count;
            if (parsed.faces) configuredFaces = parsed.faces;
          }
        }
      } catch (_) {}
      diceSpec = { count: configuredCount, faces: configuredFaces, modifier: 0 };
    }

    const { count, faces, modifier } = diceSpec;
    const rolls = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * faces) + 1);
    }
    const sum = rolls.reduce((a, b) => a + b, 0);
    const total = sum + modifier;

    let critText = "";
    if (faces === 20 && count === 1) {
      if (rolls[0] === 20) critText = L.critSuccess;
      else if (rolls[0] === 1) critText = L.critFail;
    }

    let resultMsg = "";
    const specStr = count === 1 ? `d${faces}` : `${count}d${faces}`;
    if (count === 1) {
      resultMsg = `**${authorName}** ${L.rolled} **d${faces}** -> **${total}**${critText}`;
    } else {
      const rollsStr = `[${rolls.join(", ")}]`;
      const modStr = modifier !== 0 ? ` ${modifier > 0 ? "+" : ""}${modifier}` : "";
      resultMsg = `**${authorName}** ${L.rolled} **${count}d${faces}**: ${rollsStr}${modStr} -> ${L.total}: **${total}**${critText}`;
    }

    // Publicar en el chat de la sala
    if (Onicord.chat?.sendMessage) {
      Onicord.chat.sendMessage({ text: resultMsg });
    }

    // Transmitir al widget de la Isla de Complementos vía P2P
    if (Onicord.p2p?.broadcast) {
      Onicord.p2p.broadcast({
        type: "DICE_ROLL_START",
        authorId,
        authorName,
        count,
        faces,
        rolls,
        total,
        summary: `${authorName} ${L.rolled} ${specStr} -> ${total}`,
        timestamp: Date.now(),
      });
    }
  });
}
