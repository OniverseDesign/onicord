// Complemento oficial de Onicord: Encuestas Rápidas (/p)

function parsePollInput(rawInput) {
  if (!rawInput || typeof rawInput !== "string") return null;

  let text = rawInput.trim();
  if (text.toLowerCase().startsWith("/p")) {
    text = text.substring(2).trim();
  }

  if (!text) return null;

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

if (typeof Onicord !== "undefined" && Onicord.chat?.onCommand) {
  Onicord.chat.onCommand("p", (args) => {
    const rawInput = args.join(" ");
    const parsed = parsePollInput(rawInput.startsWith("/p") ? rawInput : `/p ${rawInput}`);

    if (!parsed) {
      if (Onicord.ui?.showToast) {
        Onicord.ui.showToast("⚠️ Uso: /p ¿Qué cenamos hoy? -Pizza -Tacos");
      }
      return;
    }

    const embedPayload = {
      pluginId: "onicord-polls",
      type: "poll",
      data: {
        pollId: `poll_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        question: parsed.question,
        options: parsed.options,
        createdAt: Date.now(),
      },
    };

    Onicord.chat.sendMessage({
      text: `[PLUGIN_EMBED]:${JSON.stringify(embedPayload)}`,
    });
  });
}
