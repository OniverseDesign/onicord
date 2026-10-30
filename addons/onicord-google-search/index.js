// Complemento oficial de Onicord: Google AI Search (/g)

function decodeEntities(text) {
  if (!text) return "";
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evaluateSafeMath(expr) {
  // Evaluador aritmético seguro basado en tokens (sin new Function ni eval)
  const tokens = expr.match(/\d+(?:\.\d+)?|[+\-*/%()]/g);
  if (!tokens) return null;

  let pos = 0;
  function peek() { return tokens[pos]; }
  function consume(expected) {
    const t = tokens[pos];
    if (expected && t !== expected) throw new Error("Unexpected token");
    pos++;
    return t;
  }

  function parseFactor() {
    const t = peek();
    if (t === "(") {
      consume("(");
      const val = parseExpression();
      consume(")");
      return val;
    }
    if (t === "-") {
      consume("-");
      return -parseFactor();
    }
    if (t === "+") {
      consume("+");
      return parseFactor();
    }
    if (/^\d+(?:\.\d+)?$/.test(t)) {
      consume();
      return parseFloat(t);
    }
    throw new Error("Invalid factor");
  }

  function parseTerm() {
    let left = parseFactor();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = consume();
      const right = parseFactor();
      if (op === "*") left *= right;
      else if (op === "/") left = right === 0 ? NaN : left / right;
      else if (op === "%") left = left % right;
    }
    return left;
  }

  function parseExpression() {
    let left = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const right = parseTerm();
      if (op === "+") left += right;
      else if (op === "-") left -= right;
    }
    return left;
  }

  const result = parseExpression();
  if (pos !== tokens.length || isNaN(result) || !isFinite(result)) return null;
  return result;
}

function tryEvaluateMathQuery(query) {
  if (!query) return null;

  const percMatch = query.match(/(\d+(?:\.\d+)?)\s*%\s*(?:de|of)\s*(\d+(?:\.\d+)?)/i);
  if (percMatch) {
    const p = parseFloat(percMatch[1]);
    const total = parseFloat(percMatch[2]);
    const res = (p / 100) * total;
    return `${query.trim()} = ${res}`;
  }

  let cleaned = query
    .toLowerCase()
    .replace(/^cu[aá]nto\s+es\s+/i, "")
    .replace(/^qu[eé]\s+es\s+/i, "")
    .replace(/^what\s+is\s+/i, "")
    .replace(/^quanto\s+[eé]\s+/i, "")
    .replace(/^calcula\s+/i, "")
    .replace(/^calc\s+/i, "")
    .replace(/\?/g, "")
    .trim();

  cleaned = cleaned.replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, ".");

  if (/^[0-9+\-*/%().\s]+$/.test(cleaned) && /[0-9]/.test(cleaned)) {
    try {
      const expr = cleaned.replace(/\s+/g, "");
      const val = evaluateSafeMath(expr);
      if (val !== null) {
        return `${query.trim()} = ${val}`;
      }
    } catch (_) {}
  }

  return null;
}

const CLEAR_NOTICES = {
  es: "Historial de mensajes de búsqueda limpiado para esta sesión.",
  en: "Search message history cleared for this session.",
  pt: "Histórico de mensagens de pesquisa limpo para esta sessão.",
};

Onicord.chat.onCommand("g", async (args) => {
  const query = args.join(" ").trim();
  if (!query) return;

  const currentLang = (Onicord.language || Onicord.getLanguage?.() || "es").split("-")[0].toLowerCase();

  // COMANDO SUBORDINADO: /g clear o /g limpiar
  if (query.toLowerCase() === "clear" || query.toLowerCase() === "limpiar" || query.toLowerCase() === "limpar") {
    if (Onicord.chat.clearPluginMessages) {
      Onicord.chat.clearPluginMessages();
      const clearNotice = CLEAR_NOTICES[currentLang] || CLEAR_NOTICES.es;
      if (Onicord.ui?.showToast) {
        Onicord.ui.showToast(clearNotice, "info");
      }
    }
    return;
  }

  try {
    let answerText = "";
    let firstLink = "";

    // 1. Evaluador Matemático
    const mathResult = tryEvaluateMathQuery(query);
    if (mathResult) {
      answerText = mathResult;
    }

    // 2. Búsqueda en Google
    try {
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=${currentLang}`;
      const res = await fetch(googleUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
          "Accept-Language": `${currentLang}-${currentLang.toUpperCase()},${currentLang};q=0.9`,
          "Cookie": "CONSENT=YES+shp.gws-20210601-0-RC2.es+FX+999; SOCS=CAESHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzEaAmVzIAEaBgiAo_CgBg"
        }
      });

      if (res.ok) {
        const html = await res.text();

        if (!answerText) {
          const calcMatches = [...html.matchAll(/<div class="[^"]*(?:BNeawe|vk_bk|zVV9h|c2d44|KCRwy)[^"]*">(.*?)<\/div>/gs)];
          if (calcMatches.length > 0) {
            const validTexts = calcMatches
              .map((m) => decodeEntities(m[1]))
              .filter((txt) => 
                txt.length > 0 && 
                !txt.includes("Google") && 
                !txt.includes("Buscar") && 
                !txt.includes("Search") &&
                !txt.includes("Imágenes") && 
                !txt.includes("Preferencias")
              );

            if (validTexts.length > 0) {
              answerText = validTexts.slice(0, 2).join(" - ");
            }
          }
        }

        const gLinks = [...html.matchAll(/href="\/url\?q=(https?:\/\/[^&"]+)/gi)];
        for (const gl of gLinks) {
          const cleanUrl = decodeURIComponent(gl[1]);
          if (cleanUrl.startsWith("http") && !cleanUrl.includes("google.com") && !cleanUrl.includes("google.es")) {
            firstLink = cleanUrl;
            break;
          }
        }
      }
    } catch (_) {}

    // 3. Fallback a DuckDuckGo HTML
    if (!firstLink) {
      try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const ddgRes = await fetch(ddgUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });

        if (ddgRes.ok) {
          const ddgHtml = await ddgRes.text();
          if (!answerText) {
            const snippets = [...ddgHtml.matchAll(/<a class="result__snippet"[^>]*>(.*?)<\/a>/gs)];
            if (snippets.length > 0) {
              const cleanSnippets = snippets
                .slice(0, 2)
                .map((s) => decodeEntities(s[1]))
                .filter((t) => t.length > 15);

              if (cleanSnippets.length > 0) {
                answerText = cleanSnippets.join(" ");
              }
            }
          }

          const ddgLinks = [...ddgHtml.matchAll(/href="([^"]*)"/gi)];
          for (const l of ddgLinks) {
            let rawUrl = l[1];
            if (rawUrl.includes("uddg=")) {
              const urlParam = rawUrl.split("uddg=")[1]?.split("&")[0];
              if (urlParam) rawUrl = decodeURIComponent(urlParam);
            }
            if (rawUrl.startsWith("http") && !rawUrl.includes("duckduckgo.com")) {
              firstLink = rawUrl;
              break;
            }
          }
        }
      } catch (_) {}
    }

    if (!firstLink) {
      firstLink = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }

    let responseText = "";
    if (answerText) {
      responseText = `*${answerText}*\n[LINK]: ${firstLink}`;
    } else {
      responseText = `[LINK]: ${firstLink}`;
    }

    const responsePayload = {
      isComplement: true,
      complementName: Onicord.manifest.name,
      complementId: Onicord.manifest.id,
      text: responseText,
      linkUrl: firstLink,
      metaUrl: firstLink
    };

    Onicord.chat.sendMessage(responsePayload);
  } catch (_) {
    const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    Onicord.chat.sendMessage({
      isComplement: true,
      complementName: Onicord.manifest.name,
      complementId: Onicord.manifest.id,
      text: `[LINK]: ${fallbackUrl}`,
      linkUrl: fallbackUrl,
      metaUrl: fallbackUrl
    });
  }
});
