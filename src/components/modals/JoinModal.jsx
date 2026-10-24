import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { useInternalClose } from "../../hooks/useAnimatedMount";

export default function JoinModal({ onClose, onJoin, busy }) {
  const { t } = useTranslation();
  const { isClosing, triggerClose } = useInternalClose(onClose, 140);
  const [code, setCode] = useState("");
  const inputRef = useRef(null);

  const normalized = code
    .replace(/[^a-fA-F0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  const valid = normalized.length === 8;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (valid && !busy) {
      onJoin(normalized);
    }
  };

  return (
    <div
      className={cn("onicord-modal-backdrop", isClosing && "onicord-animate-backdrop-out")}
      onClick={triggerClose}
    >
      <form
        onSubmit={handleSubmit}
        className={cn("onicord-modal-card-action", isClosing && "onicord-animate-modal-out")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-white">{t("serverSettings.joinModalTitle")}</h3>
        <p className="mt-1 text-sm text-onicord-muted">
          Paste the 8-character code shared by the host.
        </p>

        <input
          type="text"
          ref={inputRef}
          placeholder="A1B2C3D4"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="onicord-input-code mt-4"
        />
        <p className="mt-2 text-center text-xs text-onicord-muted">
          {normalized.length}/8 caracteres
        </p>

        <div className="mt-6 flex gap-3">
          {}
          <button
            type="button"
            onClick={triggerClose}
            className="onicord-btn-secondary-outline"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valid || busy}
            className="onicord-btn-primary-lg"
          >
            {busy ? "Conectando enjambre…" : "Confirmar ingreso"}
          </button>
        </div>
      </form>
    </div>
  );
}
