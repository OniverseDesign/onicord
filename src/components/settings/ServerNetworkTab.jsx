import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalInput } from "../ui/ModalShell";
import MaterialIcon from "../icons/MaterialIcon";
import Select from "../ui/Select";
import { copyTextToClipboard } from "../../lib/clipboard";
import { getWebDirectInviteUrl } from "../../lib/inviteUtils";

export default function ServerNetworkTab({
  iceServers = [],
  setIceServers,
  directConnectionEnabled,
  setDirectConnectionEnabled,
  directIP,
  setDirectIP,
  directPort,
  setDirectPort,
  roomCode = "",
}) {
  const { t } = useTranslation();
  const [newUrl, setNewUrl] = useState("");
  const [newType, setNewType] = useState("stun");
  const [newUsername, setNewUsername] = useState("");
  const [newCredential, setNewCredential] = useState("");
  const [error, setError] = useState(null);

  const [portStatus, setPortStatus] = useState("unchecked"); // "unchecked" | "checking" | "open" | "closed"
  const [checkingError, setCheckingError] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const directInviteLink = directIP && directPort && roomCode
    ? getWebDirectInviteUrl(directIP, directPort, roomCode)
    : null;

  const handleCheckPort = async () => {
    if (!directPort) return;
    setPortStatus("checking");
    setCheckingError(null);
    try {
      const res = await window.electronAPI.checkDirectPort(directPort);
      if (res && res.open) {
        setPortStatus("open");
      } else {
        setPortStatus("closed");
        if (res.error) setCheckingError(res.error);
      }
    } catch (err) {
      setPortStatus("closed");
      setCheckingError(err.message);
    }
  };

  const handleAdd = () => {
    setError(null);
    const urlStr = newUrl.trim();
    if (!urlStr) {
      setError(t("serverSettings.network.errorEmptyUrl", "La URL no puede estar vacía"));
      return;
    }

    if (newType === "stun" && !urlStr.startsWith("stun:")) {
      setError(t("serverSettings.network.errorStunPrefix", "Las URLs de STUN deben comenzar con 'stun:'"));
      return;
    }
    if (newType === "turn" && !urlStr.startsWith("turn:") && !urlStr.startsWith("turns:")) {
      setError(t("serverSettings.network.errorTurnPrefix", "Las URLs de TURN deben comenzar con 'turn:' o 'turns:'"));
      return;
    }

    const newEntry = { urls: urlStr };
    if (newType === "turn") {
      if (newUsername.trim()) newEntry.username = newUsername.trim();
      if (newCredential.trim()) newEntry.credential = newCredential.trim();
    }

    setIceServers([...iceServers, newEntry]);
    setNewUrl("");
    setNewUsername("");
    setNewCredential("");
  };

  const handleRemove = (index) => {
    setIceServers(iceServers.filter((_, idx) => idx !== index));
  };

  // Helper validation for privileged ports
  const isPrivilegedPort = directPort && parseInt(directPort, 10) < 1024;

  return (
    <div className="onicord-settings-container space-y-4">
      
      {/* CARD 1: DIRECT CONNECTION (TCP / PORT FORWARDING) */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between pb-2">
          <h3 className="onicord-settings-section-title flex items-center gap-1.5 m-0">
            <span>{t("serverSettings.network.directTitle", "Conexión Directa (TCP)")}</span>
          </h3>
          
          <label className="relative inline-flex items-center select-none shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={directConnectionEnabled}
              onChange={(e) => {
                setDirectConnectionEnabled(e.target.checked);
                setPortStatus("unchecked");
              }}
              className="sr-only peer"
            />
            <div className="onicord-toggle-slider" />
          </label>
        </div>

        <p className="onicord-settings-row-desc pb-2">
          {t("serverSettings.network.directDesc", "Permite la conexión punto a punto por socket TCP directo. Al saltarse la DHT de Hyperswarm y los servidores de relay intermedios, reduce la latencia de voz a su mínimo físico absoluto.")}
        </p>

        {/* DIRECT CONNECTION BENEFITS */}
        <div className="bg-onicord-base/50 border border-onicord-border rounded-xl p-3.5 mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
          <div className="space-y-1">
            <span className="text-2xs font-bold text-onicord-success uppercase tracking-wider flex items-center justify-center gap-1">
              <MaterialIcon name="speed" size={12} />
              {t("serverSettings.network.benefit1Title", "Latencia <1ms")}
            </span>
            <p className="text-2xs text-onicord-muted leading-relaxed text-center">
              {t("serverSettings.network.benefit1Desc", "Ideal para redes LAN o si el host tiene fibra directa.")}
            </p>
          </div>
          <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-onicord-border sm:pl-3">
            <span className="text-2xs font-bold text-onicord-warning uppercase tracking-wider flex items-center justify-center gap-1">
              <MaterialIcon name="router" size={12} />
              {t("serverSettings.network.benefit2Title", "Port Forwarding")}
            </span>
            <p className="text-2xs text-onicord-muted leading-relaxed text-center">
              {t("serverSettings.network.benefit2Desc", "Solo el host del servidor necesita abrir el puerto.")}
            </p>
          </div>
          <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-onicord-border sm:pl-3">
            <span className="text-2xs font-bold text-onicord-info uppercase tracking-wider flex items-center justify-center gap-1">
              <MaterialIcon name="device_hub" size={12} />
              {t("serverSettings.network.benefit3Title", "LAN Automático")}
            </span>
            <p className="text-2xs text-onicord-muted leading-relaxed text-center">
              {t("serverSettings.network.benefit3Desc", "Bypass automático de mDNS para audio local.")}
            </p>
          </div>
        </div>

        {/* CONFIGURATION FIELDS (When enabled) */}
        {directConnectionEnabled && (
          <div className="space-y-4 pt-4 border-t border-onicord-border mt-4 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between px-2 mb-1.5">
                  <label className="text-xs font-semibold text-onicord-text">
                    {t("serverSettings.network.directIpLabel", "IP Pública o Hostname")}
                  </label>
                  <span className="text-2xs text-onicord-muted font-mono">
                    {t("serverSettings.network.ipHint", "IP pública actual")}
                  </span>
                </div>
                <ModalInput
                  value={directIP}
                  onChange={(e) => {
                    setDirectIP(e.target.value);
                    setPortStatus("unchecked");
                  }}
                  placeholder={t("settings.network.ipPlaceholder", "e.g. 201.242.10.15 o miservidor.ddns.net")}
                  className="h-10 text-xs font-mono bg-onicord-base/50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-onicord-text block mb-1.5 px-2">
                  {t("serverSettings.network.directPortLabel", "Puerto TCP")}
                </label>
                <ModalInput
                  value={directPort}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setDirectPort(isNaN(val) ? "" : val);
                    setPortStatus("unchecked");
                  }}
                  placeholder="7777"
                  type="number"
                  className="h-10 text-xs font-mono bg-onicord-base/50"
                />
              </div>
            </div>

            {isPrivilegedPort && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-onicord-warning/10 border border-onicord-warning/20 text-onicord-warning text-2xs">
                <MaterialIcon name="warning" size={16} className="shrink-0 mt-0.5" />
                <p>
                  {t("serverSettings.network.privilegedPortWarning", "Los puertos inferiores a 1024 son reservados y pueden requerir privilegios de administrador del sistema. Recomendamos usar un puerto entre 1024 y 65535.")}
                </p>
              </div>
            )}

            {/* NETWORK DIAGNOSTIC / CONNECTIVITY CHECK */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-onicord-base/50 border border-onicord-border rounded-xl gap-3">
              <div className="space-y-1">
                <span className="text-2xs uppercase font-bold text-onicord-muted tracking-wider block">
                  {t("serverSettings.network.diagnosticTitle", "Prueba de Conectividad")}
                </span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    portStatus === "open" ? "bg-onicord-success shadow-onicord-glow-success animate-pulse" :
                    portStatus === "closed" ? "bg-onicord-danger shadow-onicord-glow-danger" :
                    portStatus === "checking" ? "bg-onicord-warning animate-ping" : "bg-onicord-tint/20"
                  }`} />
                  <span className="text-xs font-semibold text-onicord-text">
                    {portStatus === "open" && t("serverSettings.network.portOpen", "Puerto abierto y listo")}
                    {portStatus === "closed" && t("serverSettings.network.portClosed", "Puerto cerrado / No responde")}
                    {portStatus === "checking" && t("serverSettings.network.checking", "Escaneando puerto...")}
                    {portStatus === "unchecked" && t("serverSettings.network.notChecked", "Sin verificar")}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCheckPort}
                disabled={portStatus === "checking" || !directPort}
                className="ionicord-btn-primary h-9 px-4 rounded-xl bg-onicord-accent hover:opacity-90 disabled:opacity-50 text-onicord-on-accent text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {portStatus === "checking" ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-onicord-dark border-t-transparent rounded-full animate-spin" />
                    <span>{t("serverSettings.network.checkingBtn", "Comprobando...")}</span>
                  </>
                ) : (
                  <>
                    <MaterialIcon name="network_check" size={16} />
                    <span>{t("serverSettings.network.checkPortBtn", "Escanear Puerto")}</span>
                  </>
                )}
              </button>
            </div>

            {checkingError && (
              <div className="p-3 bg-onicord-danger/10 border border-onicord-danger/20 rounded-xl text-2xs text-onicord-danger font-mono whitespace-pre-wrap leading-relaxed animate-fade-in">
                <span className="font-bold block mb-1">{t("serverSettings.network.errorLabel", "Detalle del error:")}</span>
                {checkingError}
              </div>
            )}

            {/* IF PORT IS OPEN: DIRECT INVITATION LINK */}
            {portStatus === "open" && directInviteLink && (
              <div className="pt-3 border-t border-onicord-border space-y-2 animate-slide-up">
                <div className="flex items-center gap-1">
                  <MaterialIcon name="share" className="text-onicord-success" size={14} />
                  <label className="text-xs font-semibold text-onicord-text">
                    {t("serverSettings.network.directLinkLabel", "Enlace de Invitación Directa")}
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-onicord-base/50 border border-onicord-success/20 hover:border-onicord-success/40 rounded-xl px-3 py-2.5 font-mono text-2xs text-onicord-success truncate select-all transition-colors duration-normal">
                    {directInviteLink}
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => {
                      copyTextToClipboard(directInviteLink);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className={`shrink-0 h-9 px-4 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                      copiedLink 
                        ? "bg-onicord-success text-white" 
                        : "bg-onicord-success/20 hover:bg-onicord-success/30 border border-onicord-success/30 text-onicord-success"
                    }`}
                  >
                    <MaterialIcon name={copiedLink ? "check" : "content_copy"} size={14} />
                    <span>{copiedLink ? t("common.copied", "¡Copiado!") : t("common.copy", "Copiar")}</span>
                  </button>
                </div>

                <p className="text-2xs text-onicord-muted leading-relaxed">
                  {t("serverSettings.network.directLinkHint", "Comparte este enlace directo con tus amigos. Cuando lo abran, Onicord configurará la IP y el puerto automáticamente para conectarse directamente por TCP sin pasar por la red pública DHT.")}
                </p>
              </div>
            )}

            {/* QUICK TROUBLESHOOTING GUIDE IF PORT IS CLOSED */}
            {portStatus === "closed" && (
              <div className="p-3 bg-onicord-tint/5 border border-onicord-border rounded-xl space-y-2 text-2xs text-onicord-muted animate-fade-in leading-relaxed">
                <span className="font-semibold text-onicord-text flex items-center gap-1">
                  <MaterialIcon name="info" className="text-onicord-warning" size={14} />
                  {t("serverSettings.network.howToFixPort", "¿Cómo solucionar el puerto inaccesible?")}
                </span>
                <ul className="list-disc pl-4 space-y-1">
                  <li>{t("serverSettings.network.fixStep1", "Asegúrate de haber creado la regla de Port Forwarding en tu router ruteando el puerto seleccionado a la IP privada de tu PC.")}</li>
                  <li>{t("serverSettings.network.fixStep2", "Verifica que el firewall de tu sistema operativo (ej. Firewall de Windows Defender) esté permitiendo conexiones TCP entrantes en ese puerto para Onicord.")}</li>
                  <li>{t("serverSettings.network.fixStep3", "Confirma que no estés detrás de un NAT simétrico restrictivo o CGNAT de tu proveedor de internet.")}</li>
                </ul>
              </div>
            )}

          </div>
        )}
      </div>

      {/* CARD 2: BACKUP ICE SERVERS (STUN/TURN) */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title flex items-center gap-1.5">
          <span>{t("serverSettings.network.iceBackupTitle", "Servidores ICE de Respaldo (STUN/TURN)")}</span>
        </h3>
        <p className="onicord-settings-row-desc">
          {t("serverSettings.network.iceBackupDesc", "Si los miembros del servidor no logran conectarse a las salas de voz (por cortafuegos restrictivos o NAT simétrico), configura aquí servidores STUN/TURN de relay. De lo contrario, Onicord usará los nodos públicos por defecto.")}
        </p>

        {/* Form and server list subsections within the card */}
        <div className="space-y-4 pt-2 pb-4">
          <h4 className="text-xs font-bold text-onicord-text">
            {t("serverSettings.network.addIceServer", "Nuevo Servidor de Respaldo")}
          </h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-2xs font-bold text-onicord-muted uppercase block mb-1">
                {t("serverSettings.network.type", "Tipo de Servidor")}
              </label>
              <Select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full"
                options={[
                  { value: "stun", label: t("serverSettings.network.optionStun", "STUN (Solo Detección de IP)") },
                  { value: "turn", label: t("serverSettings.network.optionTurn", "TURN / TURNS (Puente de Voz)") },
                ]}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-2xs font-bold text-onicord-muted uppercase block mb-1">
                {t("serverSettings.network.url", "URL de Conexión")}
              </label>
              <ModalInput
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder={newType === "stun" ? t("settings.network.stunPlaceholder", "stun:stun.l.google.com:19302") : t("settings.network.turnPlaceholder", "turn:relay.myserver.com:3478")}
                className="h-9 text-xs font-mono bg-onicord-base/50"
              />
            </div>
          </div>

          {newType === "turn" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-fade-in">
              <div>
                <label className="text-2xs font-bold text-onicord-muted uppercase block mb-1">
                  {t("serverSettings.network.username", "Usuario TURN")}
                </label>
                <ModalInput
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder={t("settings.network.userPlaceholder", "mi_usuario")}
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="text-2xs font-bold text-onicord-muted uppercase block mb-1">
                  {t("serverSettings.network.credential", "Contraseña / Token")}
                </label>
                <ModalInput
                  value={newCredential}
                  onChange={(e) => setNewCredential(e.target.value)}
                  placeholder="••••••••"
                  type="password"
                  className="h-9 text-xs"
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-onicord-danger font-semibold pt-1">{error}</p>}

          <button
            type="button"
            onClick={handleAdd}
            className="ionicord-btn-primary h-9 px-4 rounded-xl bg-onicord-tint/10 hover:bg-onicord-tint/15 text-onicord-text text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <MaterialIcon name="add" size={16} />
            <span>{t("common.add", "Añadir Servidor")}</span>
          </button>
        </div>

        {/* Configured ICE servers list */}
        <div className="pt-4 border-t border-onicord-border mt-4 space-y-3">
          <h4 className="text-xs font-bold text-onicord-text uppercase tracking-wide flex items-center justify-between">
            <span>{t("serverSettings.network.configuredServers", "Servidores Configurados")}</span>
            <span className="text-2xs bg-onicord-tint/10 px-2 py-0.5 rounded-full font-mono font-bold text-onicord-muted">
              {iceServers.length}
            </span>
          </h4>

          {iceServers.length === 0 ? (
            <div className="p-5 rounded-xl bg-onicord-base/50 border border-dashed border-onicord-border flex flex-col items-center justify-center text-center space-y-1.5">
              <MaterialIcon name="dns" size={24} className="text-onicord-muted opacity-30" />
              <p className="text-2xs text-onicord-muted leading-relaxed">
                {t("serverSettings.network.noServers", "No hay servidores personalizados. Se usarán los relays públicos por defecto de Onicord.")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1 minimal-scrollbar pt-1">
              {iceServers.map((srv, idx) => {
                const isTurn = srv.urls.startsWith("turn:") || srv.urls.startsWith("turns:");
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 bg-onicord-base/50 border border-onicord-border rounded-xl hover:border-onicord-border-strong transition duration-normal gap-3"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span
                        className={`text-2xs font-black px-1.5 py-0.5 rounded uppercase shrink-0 ${
                          isTurn ? "bg-onicord-warning/10 text-onicord-warning border border-onicord-warning/20" : "bg-onicord-info/10 text-onicord-info border border-onicord-info/20"
                        }`}
                      >
                        {isTurn ? "TURN" : "STUN"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-2xs font-mono font-semibold text-onicord-text truncate" title={srv.urls}>
                          {srv.urls}
                        </p>
                        {isTurn && srv.username && (
                          <p className="text-2xs text-onicord-muted mt-0.5 truncate">
                            {t("serverSettings.network.user", "User")}: <span className="font-mono text-onicord-subtext">{srv.username}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(idx)}
                      className="bg-onicord-danger/10 hover:bg-onicord-danger/20 text-onicord-danger border border-onicord-danger/20 rounded-lg p-1.5 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                      title={t("common.delete", "Eliminar")}
                    >
                      <MaterialIcon name="delete" size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
