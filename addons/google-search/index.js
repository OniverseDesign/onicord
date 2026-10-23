// Complemento oficial de Onicord: Google AI Search (/g)

function decodeEntities(text) {
  if (!text) return "";
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tryEvaluateMathQuery(query) {
  if (!query) return null;

  const percMatch = query.match(/(\d+(?:\.\d+)?)\s*%\s*de\s*(\d+(?:\.\d+)?)/i);
  if (percMatch) {
    const p = parseFloat(percMatch[1]);
    const total = parseFloat(percMatch[2]);
    const res = (p / 100) * total;
    return `${query.trim()} = ${res}`;
  }

  let cleaned = query
    .toLowerCase()
    .replace(/^cu[aá]nto\s+es\s+/i, '')
    .replace(/^qu[eé]\s+es\s+/i, '')
    .replace(/^calcula\s+/i, '')
    .replace(/\?/g, '')
    .trim();

  cleaned = cleaned.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.');

  if (/^[0-9+\-*/%().\s]+$/.test(cleaned) && /[0-9]/.test(cleaned)) {
    try {
      const expr = cleaned.replace(/\s+/g, '');
      const fn = new Function(`return (${expr});`);
      const val = fn();
      if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
        return `${query.trim()} = ${val}`;
      }
    } catch (e) {}
  }

  return null;
}

Onicord.chat.onCommand('g', async (args) => {
  const query = args.join(' ').trim();
  if (!query) return;

  const currentLang = (Onicord.language || Onicord.config?.language || 'es').toLowerCase();

  // COMANDO SUBORDINADO: /g clear o /g limpiar
  if (query.toLowerCase() === 'clear' || query.toLowerCase() === 'limpiar') {
    if (Onicord.chat.clearPluginMessages) {
      Onicord.chat.clearPluginMessages();
      const clearNotice = currentLang.startsWith('en')
        ? '*Plugin chat history cleared for this session.*'
        : '*Historial de mensajes del complemento limpiado para esta sesión.*';
      Onicord.ui.showToast(clearNotice);
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
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept-Language': `${currentLang}-${currentLang.toUpperCase()},${currentLang};q=0.9`,
          'Cookie': 'CONSENT=YES+shp.gws-20210601-0-RC2.es+FX+999; SOCS=CAESHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzEaAmVzIAEaBgiAo_CgBg'
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
    } catch (gErr) {}

    // 3. Fallback a DuckDuckGo HTML
    if (!firstLink) {
      try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const ddgRes = await fetch(ddgUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
      } catch (ddgErr) {}
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
  } catch (err) {
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
