// Complemento oficial de Onicord: YouTube Search (/y)

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
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchYouTubeFirst(query) {
  // Método 1: Búsqueda directa en YouTube HTML
  try {
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(ytUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });

    if (res.ok) {
      const html = await res.text();
      
      const videoRendererMatches = [...html.matchAll(/"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"(.*?)"\}/gs)];
      if (videoRendererMatches.length > 0) {
        const vId = videoRendererMatches[0][1];
        if (vId) return `https://www.youtube.com/watch?v=${vId}`;
      }

      const simpleMatches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
      if (simpleMatches.length > 0) {
        const vId = simpleMatches[0][1];
        if (vId) return `https://www.youtube.com/watch?v=${vId}`;
      }
    }
  } catch (err) {}

  // Método 2: Fallback vía DuckDuckGo HTML
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + " site:youtube.com/watch")}`;
    const ddgRes = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (ddgRes.ok) {
      const ddgHtml = await ddgRes.text();
      const links = [...ddgHtml.matchAll(/href="([^"]*youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11}))[^"]*"/gi)];
      if (links.length > 0) {
        const vId = links[0][2];
        if (vId) return `https://www.youtube.com/watch?v=${vId}`;
      }
    }
  } catch (ddgErr) {}

  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

Onicord.chat.onCommand('y', async (args) => {
  const query = args.join(' ').trim();
  if (!query) return;

  const currentLang = (Onicord.language || Onicord.config?.language || 'es').toLowerCase();

  // COMANDO SUBORDINADO: /y clear o /y limpiar
  if (query.toLowerCase() === 'clear' || query.toLowerCase() === 'limpiar') {
    if (Onicord.chat.clearPluginMessages) {
      Onicord.chat.clearPluginMessages();
      const clearNotice = currentLang.startsWith('en')
        ? '*YouTube plugin chat history cleared.*'
        : '*Historial del complemento YouTube limpiado.*';
      Onicord.ui.showToast(clearNotice);
    }
    return;
  }

  try {
    const videoUrl = await searchYouTubeFirst(query);

    const payload = {
      isComplement: true,
      complementName: Onicord.manifest.name,
      complementId: Onicord.manifest.id,
      text: `[LINK]: ${videoUrl}`,
      linkUrl: videoUrl,
      metaUrl: videoUrl
    };

    Onicord.chat.sendMessage(payload);
  } catch (err) {
    const fallbackUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const payload = {
      isComplement: true,
      complementName: Onicord.manifest.name,
      complementId: Onicord.manifest.id,
      text: `[LINK]: ${fallbackUrl}`,
      linkUrl: fallbackUrl,
      metaUrl: fallbackUrl
    };
    Onicord.chat.sendMessage(payload);
  }
});
