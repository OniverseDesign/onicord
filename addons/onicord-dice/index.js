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

// 1. Registro del Widget en la Isla de Complementos (Panel Lateral Derecho)
if (typeof Onicord !== "undefined" && Onicord.ui?.registerPluginIslandWidget) {
  const isEs = (Onicord.language || "es").startsWith("es");
  Onicord.ui.registerPluginIslandWidget({
    id: "dice-island-widget",
    title: isEs ? "Dados" : "Dices",
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

    let diceSpec = parseDiceExpression(rawArg);
    if (!diceSpec) {
      // Default: 1d6 si no se especifica argumento
      diceSpec = { count: 1, faces: 6, modifier: 0 };
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
      if (rolls[0] === 20) critText = " [ÉXITO CRÍTICO (20)]";
      else if (rolls[0] === 1) critText = " [PIFIA NATURAL (1)]";
    }

    let resultMsg = "";
    const specStr = count === 1 ? `d${faces}` : `${count}d${faces}`;
    if (count === 1) {
      resultMsg = `**${authorName}** lanzó **d${faces}** -> **${total}**${critText}`;
    } else {
      const rollsStr = `[${rolls.join(", ")}]`;
      const modStr = modifier !== 0 ? ` ${modifier > 0 ? "+" : ""}${modifier}` : "";
      resultMsg = `**${authorName}** lanzó **${count}d${faces}**: ${rollsStr}${modStr} -> Total: **${total}**${critText}`;
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
        summary: `${authorName} lanzó ${specStr} -> ${total}`,
        timestamp: Date.now(),
      });
    }
  });
}
