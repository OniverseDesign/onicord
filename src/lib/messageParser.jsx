import React from "react";
import ServerInviteCard from "../components/chat/ServerInviteCard";

export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightText(text, query) {
  if (!query || !text) return text;

  let cleanQuery = query.toLowerCase().trim();
  cleanQuery = cleanQuery
    .replace(/(?:^|\s)from:\S+/gi, " ")
    .replace(/(?:^|\s)in:\S+/gi, " ")
    .replace(/(?:^|\s)has:\S+/gi, " ")
    .trim();

  const phrases = [];
  cleanQuery = cleanQuery.replace(/"([^"]+)"/g, (_, p) => {
    const trimmed = p.trim();
    if (trimmed) phrases.push(trimmed);
    return " ";
  });

  const terms = cleanQuery.split(/\s+/).filter(Boolean);
  const allPatterns = [...phrases, ...terms];
  if (allPatterns.length === 0) return text;

  allPatterns.sort((a, b) => b.length - a.length);
  const regexPattern = allPatterns.map(escapeRegExp).join("|");
  const regex = new RegExp(`(${regexPattern})`, "gi");

  const parts = text.split(regex);
  const matchSet = new Set(allPatterns.map((p) => p.toLowerCase()));

  return parts.map((part, i) =>
    matchSet.has(part.toLowerCase()) ? (
      <mark key={i} className="bg-amber-500/35 text-white rounded px-0.5 font-bold">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function parseRegexToken(tokens, regex, factory) {
  const result = [];
  for (const token of tokens) {
    if (token.type !== "text") {
      result.push(token);
      continue;
    }

    let lastIndex = 0;
    let match;
    regex.lastIndex = 0;

    const text = token.content;
    let hasMatch = false;

    while ((match = regex.exec(text)) !== null) {
      hasMatch = true;
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        result.push({ type: "text", content: text.substring(lastIndex, matchIndex) });
      }

      const newToken = factory(match);
      if (Array.isArray(newToken)) {
        result.push(...newToken);
      } else if (newToken) {
        result.push(newToken);
      } else {
        result.push({ type: "text", content: match[0] });
      }

      lastIndex = regex.lastIndex;
    }

    if (hasMatch) {
      if (lastIndex < text.length) {
        result.push({ type: "text", content: text.substring(lastIndex) });
      }
    } else {
      result.push(token);
    }
  }

  // Normalizar fusionando tokens de texto adyacentes
  const merged = [];
  for (const t of result) {
    if (t.type === "text" && merged.length > 0 && merged[merged.length - 1].type === "text") {
      merged[merged.length - 1].content += t.content;
    } else {
      merged.push(t);
    }
  }
  return merged;
}

const handleExternalLinkClick = (e, url) => {
  e.preventDefault();
  if (window.electronAPI?.openExternalLink) {
    window.electronAPI.openExternalLink(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

export function parseInlineStyles(
  text,
  allUsers = [],
  searchQuery = "",
  roles = [],
) {
  if (!text) return [];

  let tokens = [{ type: "text", content: text }];

  // 1. Inline code blocks (`...`) first to protect exact code literals
  tokens = parseRegexToken(tokens, /`([^`]+)`/g, (match) => ({
    type: "code",
    content: match[1],
  }));

  // 2. Onicord invite cards
  const inviteRegex = /(?:onicord:\/\/join\/([a-zA-Z0-9]+)|https?:\/\/(?:[a-zA-Z0-9-]+\.)?onicord\.(?:app|io|com)\/join\/([a-zA-Z0-9]+))/gi;
  tokens = parseRegexToken(tokens, inviteRegex, (match) => {
    const code = (match[1] || match[2] || "").trim().toUpperCase();
    if (!code) return null;
    return {
      type: "inviteCard",
      roomCode: code,
      fullUrl: match[0],
    };
  });

  // 3. Explicit markdown links [label](url)
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/gi;
  tokens = parseRegexToken(tokens, markdownLinkRegex, (match) => ({
    type: "markdownLink",
    label: match[1],
    url: match[2],
  }));

  // 4. Raw URLs (parsed BEFORE bold/italic markdown formatting
  // so that parameters containing underscores '_' or asterisks do not break URLs)
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  tokens = parseRegexToken(tokens, urlRegex, (match) => {
    let rawUrl = match[0];
    let trailing = "";

    // Strip trailing punctuation or unbalanced parentheses from URLs
    while (true) {
      if (/[.,!?;:]$/.test(rawUrl)) {
        trailing = rawUrl.slice(-1) + trailing;
        rawUrl = rawUrl.slice(0, -1);
        continue;
      }
      if (rawUrl.endsWith(")")) {
        const openCount = (rawUrl.match(/\(/g) || []).length;
        const closeCount = (rawUrl.match(/\)/g) || []).length;
        if (closeCount > openCount) {
          trailing = ")" + trailing;
          rawUrl = rawUrl.slice(0, -1);
          continue;
        }
      }
      if (rawUrl.endsWith("]")) {
        const openCount = (rawUrl.match(/\[/g) || []).length;
        const closeCount = (rawUrl.match(/\]/g) || []).length;
        if (closeCount > openCount) {
          trailing = "]" + trailing;
          rawUrl = rawUrl.slice(0, -1);
          continue;
        }
      }
      break;
    }

    const linkToken = {
      type: "link",
      content: rawUrl,
    };

    if (trailing) {
      return [linkToken, { type: "text", content: trailing }];
    }
    return linkToken;
  });

  // 5. Negrita + Cursiva (***...*** o ___...___)
  tokens = parseRegexToken(tokens, /\*\*\*([^*]+)\*\*\*/g, (match) => ({
    type: "bold",
    content: `*${match[1]}*`,
  }));

  tokens = parseRegexToken(tokens, /___([^_]+)___/g, (match) => ({
    type: "bold",
    content: `_${match[1]}_`,
  }));

  // 6. Negrita (**...** o __...__)
  tokens = parseRegexToken(tokens, /\*\*([^*]+)\*\*/g, (match) => ({
    type: "bold",
    content: match[1],
  }));

  tokens = parseRegexToken(tokens, /__([^_]+)__/g, (match) => ({
    type: "bold",
    content: match[1],
  }));

  // 6. Cursiva (*...* o _..._)
  tokens = parseRegexToken(tokens, /\*([^*]+)\*/g, (match) => ({
    type: "italic",
    content: match[1],
  }));

  tokens = parseRegexToken(tokens, /_([^_]+)_/g, (match) => ({
    type: "italic",
    content: match[1],
  }));

  // 7. Tachado (~~...~~)
  tokens = parseRegexToken(tokens, /~~([^~]+)~~/g, (match) => ({
    type: "strike",
    content: match[1],
  }));

  // 2. Match known Role names (sort longest names first for multi-word roles)
  const validRoles = (roles || [])
    .filter((r) => r && r.name && typeof r.name === "string" && r.name.trim())
    .sort((a, b) => b.name.length - a.name.length);

  for (const role of validRoles) {
    const escapedName = role.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    const roleRegex = new RegExp(`@(${escapedName})(?=[\\s,.!?;:]|$)`, "gi");
    tokens = parseRegexToken(tokens, roleRegex, (match) => ({
      type: "roleMention",
      content: role.name,
      roleId: role.id,
      color: role.color || "#5865F2",
    }));
  }

  // 3. Match known User nicknames (sort longest nicknames first)
  const validUsers = (allUsers || [])
    .filter((u) => u && u.nickname && typeof u.nickname === "string" && u.nickname.trim())
    .sort((a, b) => b.nickname.length - a.nickname.length);

  for (const user of validUsers) {
    const escapedNick = user.nickname.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    const userRegex = new RegExp(`@(${escapedNick})(?=[\\s,.!?;:]|$)`, "gi");
    tokens = parseRegexToken(tokens, userRegex, (match) => ({
      type: "mention",
      content: user.nickname,
      userId: user.id,
    }));
  }

  // 4. Fallback for generic single-word @mentions
  const fallbackMentionRegex = /@([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_.-]+)/g;
  tokens = parseRegexToken(tokens, fallbackMentionRegex, (match) => {
    const handle = match[1].toLowerCase();
    const userMatch = (allUsers || []).find(
      (u) => u.nickname?.toLowerCase() === handle
    );
    if (userMatch) {
      return {
        type: "mention",
        content: userMatch.nickname,
        userId: userMatch.id,
      };
    }

    const roleMatch = (roles || []).find(
      (r) => r.name?.toLowerCase() === handle
    );
    if (roleMatch) {
      return {
        type: "roleMention",
        content: roleMatch.name,
        roleId: roleMatch.id,
        color: roleMatch.color || "#5865F2",
      };
    }

    return null;
  });

  return tokens.map((token, i) => {
    switch (token.type) {
      case "code":
        return (
          <code
            key={i}
            className="bg-onicord-mantle/80 border border-onicord-island rounded px-1.5 py-0.5 font-mono text-[13px] text-onicord-accent font-semibold mx-0.5 select-all"
          >
            {token.content}
          </code>
        );
      case "bold":
        return (
          <strong key={i} className="font-extrabold text-white select-text">
            {parseInlineStyles(token.content, allUsers, searchQuery, roles)}
          </strong>
        );
      case "italic":
        return (
          <em key={i} className="italic text-onicord-text/95 select-text">
            {parseInlineStyles(token.content, allUsers, searchQuery, roles)}
          </em>
        );
      case "strike":
        return (
          <span key={i} className="line-through text-onicord-muted/70 select-text">
            {parseInlineStyles(token.content, allUsers, searchQuery, roles)}
          </span>
        );
      case "markdownLink":
        return (
          <a
            key={i}
            href={token.url}
            onClick={(e) => handleExternalLinkClick(e, token.url)}
            className="onicord-btn-link break-all inline-flex items-center gap-1 font-semibold underline hover:opacity-80"
            target="_blank"
            rel="noopener noreferrer"
            title={token.url}
          >
            {token.label}
          </a>
        );
      case "inviteCard":
        return (
          <ServerInviteCard
            key={i}
            roomCode={token.roomCode}
            fullUrl={token.fullUrl}
          />
        );
      case "link":
        return (
          <a
            key={i}
            href={token.content}
            onClick={(e) => handleExternalLinkClick(e, token.content)}
            className="onicord-btn-link break-all inline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {token.content}
          </a>
        );
      case "roleMention":
        return (
          <span
            key={i}
            className="onicord-mention text-[15px] select-all font-semibold"
            style={token.color ? { color: token.color } : {}}
          >
            @{token.content}
          </span>
        );
      case "mention":
        return (
          <span
            key={i}
            className="onicord-mention text-[15px] select-all font-semibold"
          >
            @{token.content}
          </span>
        );
      case "text":
      default:
        return highlightText(token.content, searchQuery);
    }
  });
}
