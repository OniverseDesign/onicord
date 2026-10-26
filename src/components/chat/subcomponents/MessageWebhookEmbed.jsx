import React, { memo } from "react";
import MaterialIcon from "../../icons/MaterialIcon";

function formatEmbedColor(color) {
  if (!color) return null;
  if (typeof color === "string") {
    return color.startsWith("#") ? color : `#${color}`;
  }
  if (typeof color === "number") {
    return `#${color.toString(16).padStart(6, "0")}`;
  }
  return null;
}

function SingleWebhookEmbed({ embed }) {
  if (!embed) return null;

  const accentColor = formatEmbedColor(embed.color);
  const author = embed.author;
  const title = embed.title;
  const description = embed.description;
  const fields = Array.isArray(embed.fields) ? embed.fields : [];
  const thumbnail = embed.thumbnail?.url || (typeof embed.thumbnail === "string" ? embed.thumbnail : null);
  const image = embed.image?.url || (typeof embed.image === "string" ? embed.image : null);

  return (
    <div
      className="flex flex-col max-w-[500px] mt-2 rounded-onicord-inner overflow-hidden bg-onicord-mantle border border-onicord-island hover:border-onicord-accent/40 p-3.5 gap-2 text-left transition-all duration-200 select-none shadow-none"
      style={
        accentColor
          ? { borderLeftWidth: "3px", borderLeftColor: accentColor }
          : undefined
      }
    >
      {/* 1. Header: Author / Site Label */}
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-onicord-muted truncate">
        {author?.icon_url ? (
          <img
            src={author.icon_url}
            alt=""
            className="w-4 h-4 rounded-full object-cover shrink-0"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <MaterialIcon name="hub" size={13} className="text-onicord-accent shrink-0" />
        )}

        {author?.url ? (
          <a
            href={author.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-onicord-muted hover:underline hover:text-onicord-text truncate"
          >
            {author.name || "Webhook"}
          </a>
        ) : (
          <span className="truncate">{author?.name || "Webhook"}</span>
        )}
      </div>

      {/* 2. Title & Thumbnail Grid */}
      <div className="flex justify-between items-start gap-3">
        <div className="flex flex-col min-w-0 flex-1 gap-1">
          {title && (
            <h4 className="text-[14px] font-bold text-onicord-text leading-snug line-clamp-2">
              {embed.url ? (
                <a
                  href={embed.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:underline hover:text-onicord-accent inline-flex items-center gap-1 text-onicord-text"
                >
                  <span>{title}</span>
                  <MaterialIcon name="open_in_new" size={13} className="opacity-60 shrink-0" />
                </a>
              ) : (
                title
              )}
            </h4>
          )}

          {description && (
            <p className="text-[12px] text-onicord-subtext leading-relaxed whitespace-pre-wrap break-words -mt-0.5">
              {description}
            </p>
          )}
        </div>

        {/* Thumbnail fijo con estilo OpenGraph */}
        {thumbnail && (
          <div className="w-16 h-16 shrink-0 bg-black/20 overflow-hidden rounded-onicord-button border border-white/5 flex items-center justify-center">
            <img
              src={thumbnail}
              alt=""
              className="w-full h-full object-cover animate-fade-in"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
        )}
      </div>

      {/* 3. Fields Matrix */}
      {fields.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-onicord-island/60">
          {fields.map((field, idx) => (
            <div key={idx} className={field.inline ? "min-w-0" : "col-span-full min-w-0"}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-onicord-muted block truncate">
                {field.name}
              </span>
              <p className="text-[12px] text-onicord-text leading-relaxed whitespace-pre-wrap break-words mt-0.5">
                {field.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 4. Large Image Box */}
      {image && (
        <div className="w-full relative bg-black/40 overflow-hidden rounded-xl border border-white/5 flex items-center justify-center max-h-[360px] mt-1">
          <img
            src={image}
            alt=""
            className="w-full max-h-[360px] object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
            onClick={() => window.open(image, "_blank")}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>
      )}
    </div>
  );
}

const MessageWebhookEmbed = memo(function MessageWebhookEmbed({ embeds }) {
  if (!Array.isArray(embeds) || embeds.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {embeds.map((embed, idx) => (
        <SingleWebhookEmbed key={embed.id || idx} embed={embed} />
      ))}
    </div>
  );
});

export default MessageWebhookEmbed;
