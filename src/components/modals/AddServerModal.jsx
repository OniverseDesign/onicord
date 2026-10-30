import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ModalShell, {
  ModalField,
  ModalInput,
  ModalButton,
} from "../ui/ModalShell";

export default function AddServerModal({ profile, onClose, onCreated }) {
  const { t } = useTranslation();
  const SECTIONS = useMemo(
    () => [
      { id: "create", label: t("addServerModal.createTab"), icon: "add_circle" },
      { id: "join", label: t("addServerModal.joinTab"), icon: "group_add" },
    ],
    [t],
  );

  const [tab, setTab] = useState("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const inputRef = useRef(null);

  const normalized = code
    .replace(/[^a-fA-F0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  const codeValid = normalized.length === 8;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [tab]);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const server = await window.electronAPI.createServer(
        name.trim() || "My Server",
        profile,
      );
      onCreated(server);
    } catch (err) {
      setError(err.message || "Could not create server");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!codeValid) return;
    setBusy(true);
    setError(null);
    try {
      const server = await window.electronAPI.joinServer(
        normalized,
        name.trim() || `Server ${normalized.slice(0, 4)}`,
        profile,
      );
      onCreated(server);
    } catch (err) {
      setError(err.message || "Could not join server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={t("addServerModal.title")}
      subtitle="P2P · Mesh"
      sections={SECTIONS}
      activeSection={tab}
      onSectionChange={setTab}
      onClose={onClose}
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </ModalButton>
          <ModalButton
            variant="primary"
            disabled={busy || (tab === "join" && !codeValid)}
            onClick={tab === "create" ? handleCreate : handleJoin}
          >
            {busy
              ? t("common.saving")
              : tab === "create"
                ? t("addServerModal.createButton")
                : t("addServerModal.joinButton")}
          </ModalButton>
        </>
      }
    >
      <ModalField
        label={t("addServerModal.serverNameLabel")}
        hint={t("addServerModal.serverNameHint")}
      >
        <ModalInput
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={48}
          placeholder={
            tab === "create"
              ? t("addServerModal.createPlaceholder")
              : t("addServerModal.joinPlaceholder")
          }
        />
      </ModalField>

      {tab === "join" && (
        <ModalField
          label={t("addServerModal.joinTab")}
          hint={t("addServerModal.inviteCodeHint")}
        >
          <ModalInput
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="A1B2C3D4"
            className="onicord-input-code text-xl tracking-[0.3em] pl-[0.3em]"
          />
          <p className="mt-1.5 text-right font-mono text-[11px] text-onicord-muted font-bold tracking-tight select-none">
            {normalized.length} <span className="text-white/20">/</span> 8
          </p>
        </ModalField>
      )}

      {tab === "create" && (
        <p className="text-sm font-medium text-onicord-muted leading-relaxed mt-2 select-none">
          {t("addServerModal.joinInviteInstruction")}
        </p>
      )}

      {error && (
        <p className="onicord-error-banner mt-4 animate-fade-in">
          {error}
        </p>
      )}
    </ModalShell>
  );
}
