import React from "react";

/**
 * Primitiva de bloque con animación "breath" y soporte de desfase escalonado inmediato
 */
export function SkeletonBox({ className = "", stagger = 1 }) {
  const staggerClass = `onicord-skeleton-stagger-${Math.min(Math.max(stagger, 1), 8)}`;
  return (
    <div
      className={`onicord-skeleton-breath ${staggerClass} bg-white/[0.06] ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Skeleton para canales de estilo Foro (tarjetas ricas que respetan 1:1 las dimensiones de ForumPostCard)
 */
export function ForumChannelSkeleton() {
  return (
    <div className="py-4 px-2 sm:px-4 md:px-6 max-w-6xl mx-auto w-full flex flex-col select-none animate-fade-in">
      {/* Tarjeta 1: Posteo completo con título, texto y collage multimedia */}
      <div className="group relative bg-onicord-surface/40 border border-white/5 rounded-2xl p-4 sm:p-5 mb-3.5 text-left w-full shadow-xs flex flex-col">
        {/* Cabecera del autor: avatar h-11 w-11 (44px) y metadatos */}
        <div className="flex items-center gap-3 mb-2.5">
          <SkeletonBox className="h-11 w-11 rounded-full shrink-0 mt-0.5" stagger={1} />
          <div className="flex flex-col min-w-0 flex-1 leading-tight gap-1.5">
            <div className="flex items-center gap-2">
              <SkeletonBox className="h-4 w-32 rounded-md" stagger={1} />
              <SkeletonBox className="h-3 w-14 rounded-md" stagger={1} />
            </div>
          </div>
        </div>

        {/* Título destacado */}
        <SkeletonBox className="h-6 w-[70%] sm:w-[50%] rounded-lg mb-2 mt-0.5" stagger={2} />

        {/* Cuerpo del texto */}
        <div className="space-y-2 mb-3">
          <SkeletonBox className="h-4 w-full rounded-md" stagger={2} />
          <SkeletonBox className="h-4 w-[85%] rounded-md" stagger={3} />
        </div>

        {/* Mosaico multimedia simulado (16:9 con max-w-2xl) */}
        <SkeletonBox className="aspect-[16/9] max-h-56 w-full max-w-2xl rounded-xl mb-3" stagger={3} />

        {/* Barra inferior: Botones de Reaccionar y Responder */}
        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2.5 border-t border-white/5">
          <SkeletonBox className="h-8 w-24 rounded-full" stagger={4} />
          <SkeletonBox className="h-8 w-28 rounded-full" stagger={4} />
          <div className="ml-auto">
            <SkeletonBox className="h-8 w-24 rounded-full" stagger={5} />
          </div>
        </div>
      </div>

      {/* Tarjeta 2: Discusión con etiquetas (#tags) y texto extendido */}
      <div className="group relative bg-onicord-surface/40 border border-white/5 rounded-2xl p-4 sm:p-5 mb-3.5 text-left w-full shadow-xs flex flex-col">
        <div className="flex items-center gap-3 mb-2.5">
          <SkeletonBox className="h-11 w-11 rounded-full shrink-0 mt-0.5" stagger={2} />
          <div className="flex flex-col min-w-0 flex-1 leading-tight gap-1.5">
            <div className="flex items-center gap-2">
              <SkeletonBox className="h-4 w-28 rounded-md" stagger={2} />
              <SkeletonBox className="h-3 w-16 rounded-md" stagger={2} />
            </div>
          </div>
        </div>

        {/* Título */}
        <SkeletonBox className="h-6 w-[80%] sm:w-[65%] rounded-lg mb-2 mt-0.5" stagger={3} />

        {/* Cuerpo de 3 líneas */}
        <div className="space-y-2 mb-3">
          <SkeletonBox className="h-4 w-full rounded-md" stagger={3} />
          <SkeletonBox className="h-4 w-[90%] rounded-md" stagger={3} />
          <SkeletonBox className="h-4 w-[65%] rounded-md" stagger={4} />
        </div>

        {/* Píldoras de Tags */}
        <div className="flex flex-wrap items-center gap-1.5 my-2.5">
          <SkeletonBox className="h-6 w-16 rounded-full" stagger={4} />
          <SkeletonBox className="h-6 w-20 rounded-full" stagger={4} />
          <SkeletonBox className="h-6 w-14 rounded-full" stagger={5} />
        </div>

        {/* Barra inferior */}
        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2.5 border-t border-white/5">
          <SkeletonBox className="h-8 w-24 rounded-full" stagger={5} />
          <SkeletonBox className="h-8 w-28 rounded-full" stagger={5} />
        </div>
      </div>

      {/* Tarjeta 3: Pregunta o debate breve con reacciones */}
      <div className="group relative bg-onicord-surface/40 border border-white/5 rounded-2xl p-4 sm:p-5 mb-3.5 text-left w-full shadow-xs flex flex-col">
        <div className="flex items-center gap-3 mb-2.5">
          <SkeletonBox className="h-11 w-11 rounded-full shrink-0 mt-0.5" stagger={3} />
          <div className="flex flex-col min-w-0 flex-1 leading-tight gap-1.5">
            <div className="flex items-center gap-2">
              <SkeletonBox className="h-4 w-24 rounded-md" stagger={3} />
              <SkeletonBox className="h-3 w-14 rounded-md" stagger={3} />
            </div>
          </div>
        </div>

        <SkeletonBox className="h-6 w-[55%] rounded-lg mb-2 mt-0.5" stagger={4} />
        <SkeletonBox className="h-4 w-[78%] rounded-md mb-3" stagger={4} />

        {/* Reacciones */}
        <div className="flex flex-wrap items-center gap-1.5 my-2.5">
          <SkeletonBox className="h-7 w-12 rounded-full" stagger={4} />
          <SkeletonBox className="h-7 w-14 rounded-full" stagger={5} />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2.5 border-t border-white/5">
          <SkeletonBox className="h-8 w-24 rounded-full" stagger={5} />
          <SkeletonBox className="h-8 w-28 rounded-full" stagger={5} />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton para canales de texto tradicionales (Usa exactamente las clases .onicord-message-row y el avatar h-11 w-11)
 */
export function NormalChatSkeleton() {
  return (
    <div className="py-4 w-full flex flex-col select-none animate-fade-in">
      {/* Cluster 1: Mensaje normal con avatar h-11 w-11 + mensaje consecutivo agrupado */}
      <div className="flex flex-col w-full">
        <div className="onicord-message-row py-1 mt-2">
          <SkeletonBox className="h-11 w-11 rounded-full shrink-0 mt-0.5" stagger={1} />
          <div className="min-w-0 flex-1 mt-0.5 space-y-2">
            <div className="flex items-center gap-2">
              <SkeletonBox className="h-4 w-28 rounded-md" stagger={1} />
              <SkeletonBox className="h-3 w-16 rounded-md" stagger={1} />
            </div>
            <SkeletonBox className="h-4 w-[75%] rounded-md" stagger={1} />
          </div>
        </div>

        {/* Mensaje agrupado (mismo autor, sin avatar, con espaciador w-11 y py-0.5 idéntico a ChatMessageItem) */}
        <div className="onicord-message-row py-0.5">
          <div className="w-11 shrink-0" />
          <div className="min-w-0 flex-1 mt-0.5">
            <SkeletonBox className="h-4 w-[48%] rounded-md" stagger={2} />
          </div>
        </div>
      </div>

      {/* Cluster 2: Usuario B - Mensaje Breve */}
      <div className="onicord-message-row py-1 mt-2">
        <SkeletonBox className="h-11 w-11 rounded-full shrink-0 mt-0.5" stagger={2} />
        <div className="min-w-0 flex-1 mt-0.5 space-y-2">
          <div className="flex items-center gap-2">
            <SkeletonBox className="h-4 w-24 rounded-md" stagger={2} />
            <SkeletonBox className="h-3 w-14 rounded-md" stagger={2} />
          </div>
          <SkeletonBox className="h-4 w-[52%] rounded-md" stagger={3} />
        </div>
      </div>

      {/* Cluster 3: Usuario C - Mensaje con Imagen adjunta y Reacciones */}
      <div className="onicord-message-row py-1 mt-2">
        <SkeletonBox className="h-11 w-11 rounded-full shrink-0 mt-0.5" stagger={3} />
        <div className="min-w-0 flex-1 mt-0.5 space-y-2.5">
          <div className="flex items-center gap-2">
            <SkeletonBox className="h-4 w-28 rounded-md" stagger={3} />
            <SkeletonBox className="h-3 w-14 rounded-md" stagger={3} />
          </div>
          <SkeletonBox className="h-4 w-[60%] rounded-md" stagger={4} />

          {/* Bloque de imagen simulado (max-w-[400px] respetando .onicord-file-attachment-card) */}
          <SkeletonBox className="max-w-[400px] w-full h-44 rounded-onicord-inner" stagger={4} />

          {/* Píldoras de reacciones */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <SkeletonBox className="h-6 w-12 rounded-full" stagger={5} />
            <SkeletonBox className="h-6 w-11 rounded-full" stagger={5} />
          </div>
        </div>
      </div>

      {/* Divisor de fecha simulado (Idéntico al de ChatMessageList con border-t border-onicord-accent/20) */}
      <div className="relative flex items-center justify-center my-4 select-none">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-onicord-accent/20" />
        </div>
        <div className="relative bg-onicord-base px-3">
          <SkeletonBox className="h-3.5 w-28 rounded-full" stagger={4} />
        </div>
      </div>

      {/* Cluster 4: Usuario D - Mensaje con Tarjeta Embed / File Attachment */}
      <div className="onicord-message-row py-1 mt-2">
        <SkeletonBox className="h-11 w-11 rounded-full shrink-0 mt-0.5" stagger={4} />
        <div className="min-w-0 flex-1 mt-0.5 space-y-2.5">
          <div className="flex items-center gap-2">
            <SkeletonBox className="h-4 w-24 rounded-md" stagger={4} />
            <SkeletonBox className="h-3 w-12 rounded-md" stagger={4} />
          </div>
          <SkeletonBox className="h-4 w-[80%] rounded-md" stagger={5} />

          {/* Tarjeta de archivo/embed simulada idéntica a .onicord-file-attachment-card */}
          <div className="onicord-file-attachment-card flex items-center gap-3">
            <div className="flex-1 space-y-2">
              <SkeletonBox className="h-4 w-3/4 rounded-md" stagger={5} />
              <SkeletonBox className="h-3 w-1/2 rounded-md" stagger={5} />
            </div>
            <SkeletonBox className="h-12 w-12 rounded-lg shrink-0" stagger={6} />
          </div>
        </div>
      </div>

      {/* Cluster 5: Usuario A - Mensaje de 2 líneas con badge de respuestas */}
      <div className="flex flex-col w-full">
        <div className="onicord-message-row py-1 mt-2">
          <SkeletonBox className="h-11 w-11 rounded-full shrink-0 mt-0.5" stagger={5} />
          <div className="min-w-0 flex-1 mt-0.5 space-y-2">
            <div className="flex items-center gap-2">
              <SkeletonBox className="h-4 w-28 rounded-md" stagger={5} />
              <SkeletonBox className="h-3 w-14 rounded-md" stagger={5} />
            </div>
            <SkeletonBox className="h-4 w-[85%] rounded-md" stagger={6} />
            <SkeletonBox className="h-4 w-[55%] rounded-md" stagger={6} />

            {/* Badge de respuestas en hilo */}
            <div className="pt-1">
              <SkeletonBox className="h-6 w-28 rounded-md" stagger={6} />
            </div>
          </div>
        </div>

        {/* Mensaje agrupado de cierre */}
        <div className="onicord-message-row py-0.5">
          <div className="w-11 shrink-0" />
          <div className="min-w-0 flex-1 mt-0.5">
            <SkeletonBox className="h-4 w-[40%] rounded-md" stagger={7} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton para panel lateral de Hilos (ThreadSidePanel)
 */
export function ThreadLoadingSkeleton({ isForum = false, isFadingOut = false, className = "" }) {
  return (
    <div
      className={`w-full h-full select-none animate-fade-in transition-opacity duration-200 ease-out ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      } ${className}`}
    >
      {/* Mensaje raíz del hilo */}
      {isForum ? (
        <div className="px-3">
          <div className="group relative bg-onicord-surface/40 border border-white/5 rounded-2xl p-4 sm:p-5 mb-3.5 w-full shadow-xs flex flex-col">
            <div className="flex items-center gap-3 mb-2.5">
              <SkeletonBox className="h-11 w-11 rounded-full shrink-0 mt-0.5" stagger={1} />
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <SkeletonBox className="h-4 w-24 rounded-md" stagger={1} />
                <SkeletonBox className="h-3 w-14 rounded-md" stagger={1} />
              </div>
            </div>
            <SkeletonBox className="h-5 w-3/4 rounded-md mb-2 mt-0.5" stagger={2} />
            <SkeletonBox className="h-4 w-full rounded-md" stagger={2} />
          </div>
        </div>
      ) : (
        <div className="w-full">
          {/* Header de mensaje principal fijado */}
          <div className="text-[10px] uppercase tracking-wider font-bold text-onicord-accent mb-2 px-4 flex items-center gap-1.5">
            <SkeletonBox className="h-3 w-3 rounded-xs shrink-0" stagger={1} />
            <SkeletonBox className="h-3 w-28 rounded-md" stagger={1} />
          </div>
          <div className="onicord-message-row py-1 mt-1">
            <SkeletonBox className="h-11 w-11 rounded-full shrink-0 mt-0.5" stagger={1} />
            <div className="min-w-0 flex-1 mt-0.5 space-y-2">
              <div className="flex items-center gap-2">
                <SkeletonBox className="h-4 w-24 rounded-md" stagger={1} />
                <SkeletonBox className="h-3 w-14 rounded-md" stagger={1} />
              </div>
              <SkeletonBox className="h-4 w-[85%] rounded-md" stagger={2} />
            </div>
          </div>
        </div>
      )}

      {/* Divisor de respuestas */}
      <div className="relative flex items-center justify-center my-4 select-none">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-onicord-accent/20" />
        </div>
        <div className="relative bg-onicord-base px-3">
          <SkeletonBox className="h-3.5 w-24 rounded-full" stagger={2} />
        </div>
      </div>

      {/* Respuestas del hilo */}
      <div className="flex flex-col w-full">
        {[1, 2, 3].map((idx) => (
          <div key={idx} className="onicord-message-row py-1 mt-2">
            <SkeletonBox className="h-11 w-11 rounded-full shrink-0 mt-0.5" stagger={idx + 2} />
            <div className="min-w-0 flex-1 mt-0.5 space-y-2">
              <div className="flex items-center gap-2">
                <SkeletonBox className="h-4 w-20 rounded-md" stagger={idx + 2} />
                <SkeletonBox className="h-3 w-12 rounded-md" stagger={idx + 2} />
              </div>
              <SkeletonBox className="h-4 w-[70%] rounded-md" stagger={idx + 3} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton para scroll superior (carga de historial antiguo)
 */
export function TopHistoryLoadingSkeleton() {
  return (
    <div className="onicord-message-row py-1 mt-2 select-none opacity-70">
      <SkeletonBox className="h-11 w-11 rounded-full shrink-0 mt-0.5" stagger={1} />
      <div className="min-w-0 flex-1 mt-0.5 space-y-2">
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-4 w-24 rounded-md" stagger={1} />
          <SkeletonBox className="h-3 w-14 rounded-md" stagger={1} />
        </div>
        <SkeletonBox className="h-4 w-[65%] rounded-md" stagger={2} />
      </div>
    </div>
  );
}

/**
 * Componente principal unificado que selecciona el skeleton contextual con soporte de salida suave
 */
export default function ChatLoadingSkeleton({ isForum = false, isFadingOut = false, className = "" }) {
  return (
    <div
      className={`w-full h-full transition-opacity duration-200 ease-out ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      } ${className}`}
    >
      {isForum ? <ForumChannelSkeleton /> : <NormalChatSkeleton />}
    </div>
  );
}
