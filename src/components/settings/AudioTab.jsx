import React, { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import Select from "../ui/Select";
import { DEFAULT_AUDIO } from "../../lib/audioSettings";
import { acquireWebcamStream } from "../../lib/voice/webcamCompositor";

function buildDeviceOptions(devices, selectedId, selectedLabel, defaultLabel, fallbackPrefix, disconnectedText) {
  const opts = [{ value: "", label: defaultLabel }];
  let foundSelected = !selectedId || selectedId === "default";

  (devices || [])
    .filter((d) => d.deviceId && d.deviceId !== "default")
    .forEach((d, idx) => {
      if (d.deviceId === selectedId) foundSelected = true;
      opts.push({
        value: d.deviceId,
        label: d.label || `${fallbackPrefix} ${idx + 1} (${d.deviceId.slice(0, 8)})`,
      });
    });

  if (!foundSelected && selectedId && selectedId !== "default") {
    opts.push({
      value: selectedId,
      label: selectedLabel
        ? `${selectedLabel} (${disconnectedText})`
        : `${fallbackPrefix} (${selectedId.slice(0, 8)}...) [${disconnectedText}]`,
    });
  }

  return opts;
}

export default function AudioTab({
  audio,
  setAudio,
  inputs,
  outputs,
  videoInputs = [],
  refreshDevices,
  isTestingMic,
  micLevel,
  toggleMicTest,
}) {
  const { t } = useTranslation();
  const [isTestingCamera, setIsTestingCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const previewVideoRef = useRef(null);
  const previewStreamRef = useRef(null);

  const stopCameraPreview = useCallback(() => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((tr) => {
        try {
          tr.enabled = false;
          tr.stop();
        } catch {}
      });
      previewStreamRef.current = null;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    setIsTestingCamera(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCameraPreview();
    };
  }, [stopCameraPreview]);

  const startCameraPreview = useCallback(
    async (deviceId = audio.videoDeviceId) => {
      stopCameraPreview();
      setCameraError(null);
      try {
        const stream = await acquireWebcamStream({
          deviceId,
          resolution: "720",
          gameMode: false,
          isPipOverlay: true,
        });
        previewStreamRef.current = stream;
        setIsTestingCamera(true);
        refreshDevices?.();
        requestAnimationFrame(() => {
          if (previewVideoRef.current && previewStreamRef.current === stream) {
            previewVideoRef.current.srcObject = stream;
            previewVideoRef.current.play().catch(() => {});
          }
        });
      } catch (err) {
        setCameraError(
          err?.message || t("screenShare.cameraPermissionError", "No se pudo acceder a la cámara.")
        );
        setIsTestingCamera(false);
      }
    },
    [audio.videoDeviceId, refreshDevices, stopCameraPreview, t]
  );

  const toggleCameraTest = () => {
    if (isTestingCamera) {
      stopCameraPreview();
    } else {
      startCameraPreview(audio.videoDeviceId);
    }
  };

  // Auto-healing: if deviceId changed hash in Chromium, rebind using the label
  useEffect(() => {
    if (!inputs || inputs.length === 0) return;

    if (audio.inputDeviceId && audio.inputDeviceId !== "default") {
      const existsById = inputs.some((d) => d.deviceId === audio.inputDeviceId);
      if (!existsById && audio.inputDeviceLabel) {
        const matchByLabel = inputs.find(
          (d) => d.label && d.label.trim() === audio.inputDeviceLabel.trim()
        );
        if (matchByLabel) {
          console.log(
            `[AudioTab] Auto-healing input deviceId from label "${audio.inputDeviceLabel}": ${audio.inputDeviceId} -> ${matchByLabel.deviceId}`
          );
          setAudio((a) => ({
            ...a,
            inputDeviceId: matchByLabel.deviceId,
          }));
        }
      } else if (existsById && !audio.inputDeviceLabel) {
        const match = inputs.find((d) => d.deviceId === audio.inputDeviceId);
        if (match?.label) {
          setAudio((a) => ({ ...a, inputDeviceLabel: match.label }));
        }
      }
    }
  }, [inputs, audio.inputDeviceId, audio.inputDeviceLabel, setAudio]);

  useEffect(() => {
    if (!outputs || outputs.length === 0) return;

    if (audio.outputDeviceId && audio.outputDeviceId !== "default") {
      const existsById = outputs.some((d) => d.deviceId === audio.outputDeviceId);
      if (!existsById && audio.outputDeviceLabel) {
        const matchByLabel = outputs.find(
          (d) => d.label && d.label.trim() === audio.outputDeviceLabel.trim()
        );
        if (matchByLabel) {
          console.log(
            `[AudioTab] Auto-healing output deviceId from label "${audio.outputDeviceLabel}": ${audio.outputDeviceId} -> ${matchByLabel.deviceId}`
          );
          setAudio((a) => ({
            ...a,
            outputDeviceId: matchByLabel.deviceId,
          }));
        }
      } else if (existsById && !audio.outputDeviceLabel) {
        const match = outputs.find((d) => d.deviceId === audio.outputDeviceId);
        if (match?.label) {
          setAudio((a) => ({ ...a, outputDeviceLabel: match.label }));
        }
      }
    }
  }, [outputs, audio.outputDeviceId, audio.outputDeviceLabel, setAudio]);

  // Auto-healing for camera deviceId hash changes
  useEffect(() => {
    if (!videoInputs || videoInputs.length === 0) return;

    if (audio.videoDeviceId && audio.videoDeviceId !== "default") {
      const existsById = videoInputs.some((d) => d.deviceId === audio.videoDeviceId);
      if (!existsById && audio.videoDeviceLabel) {
        const matchByLabel = videoInputs.find(
          (d) => d.label && d.label.trim() === audio.videoDeviceLabel.trim()
        );
        if (matchByLabel) {
          setAudio((a) => ({
            ...a,
            videoDeviceId: matchByLabel.deviceId,
          }));
        }
      } else if (existsById && !audio.videoDeviceLabel) {
        const match = videoInputs.find((d) => d.deviceId === audio.videoDeviceId);
        if (match?.label) {
          setAudio((a) => ({ ...a, videoDeviceLabel: match.label }));
        }
      }
    }
  }, [videoInputs, audio.videoDeviceId, audio.videoDeviceLabel, setAudio]);

  // Build input options preserving saved device even if disconnected
  const inputOptions = useMemo(
    () =>
      buildDeviceOptions(
        inputs,
        audio.inputDeviceId,
        audio.inputDeviceLabel,
        t("settings.voiceVideo.defaultSystem", "Predeterminado del sistema"),
        "Mic",
        t("settings.voiceVideo.disconnected", "Desconectado")
      ),
    [inputs, audio.inputDeviceId, audio.inputDeviceLabel, t]
  );

  // Build output options preserving saved device even if disconnected
  const outputOptions = useMemo(
    () =>
      buildDeviceOptions(
        outputs,
        audio.outputDeviceId,
        audio.outputDeviceLabel,
        t("settings.voiceVideo.defaultSystem", "Predeterminado del sistema"),
        "Speaker",
        t("settings.voiceVideo.disconnected", "Desconectado")
      ),
    [outputs, audio.outputDeviceId, audio.outputDeviceLabel, t]
  );

  const videoOptions = useMemo(
    () =>
      buildDeviceOptions(
        videoInputs,
        audio.videoDeviceId,
        audio.videoDeviceLabel,
        t("settings.voiceVideo.defaultSystem", "Predeterminado del sistema"),
        t("settings.voiceVideo.cameraLabelFallback", "Cámara"),
        t("settings.voiceVideo.disconnected", "Desconectado")
      ),
    [videoInputs, audio.videoDeviceId, audio.videoDeviceLabel, t]
  );

  return (
    <div className="onicord-settings-container">
      {/* Audio input and output devices */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.tabs.voiceVideo", "Voz y Video — Dispositivos")}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
          {/* Inputs (Microphone) */}
          <div data-setting-id="inputDevice" className="space-y-3 bg-onicord-base/40 p-4 rounded-xl border border-onicord-border transition-all">
            <label className="text-xs font-semibold text-onicord-text flex items-center justify-between">
              <span>{t("settings.voiceVideo.inputDevice", "Dispositivo de Entrada")}</span>
              <MaterialIcon name="mic" size={16} className="text-onicord-muted" />
            </label>
            <Select
              value={audio.inputDeviceId === "default" ? "" : (audio.inputDeviceId || "")}
              onChange={(e) => {
                const val = e.target.value;
                const match = inputs.find((d) => d.deviceId === val);
                setAudio((a) => ({
                  ...a,
                  inputDeviceId: val,
                  inputDeviceLabel: match?.label || (val === "" ? "" : a.inputDeviceLabel),
                }));
              }}
              options={inputOptions}
              className="w-full"
            />

            <div data-setting-id="inputVolume" className="pt-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-semibold text-onicord-muted">
                  {t("settings.voiceVideo.inputVolume", "Volumen de Entrada")}
                </span>
                <span className="text-[11px] font-mono font-bold text-onicord-accent">
                  {audio.inputVolume ?? 100}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={audio.inputVolume ?? 100}
                onChange={(e) =>
                  setAudio({
                    ...audio,
                    inputVolume: parseInt(e.target.value),
                  })
                }
                className="onicord-range-input"
              />
            </div>
          </div>

          {/* Salidas (Altavoces) */}
          <div data-setting-id="outputDevice" className="space-y-3 bg-onicord-base/40 p-4 rounded-xl border border-onicord-border transition-all">
            <label className="text-xs font-semibold text-onicord-text flex items-center justify-between">
              <span>{t("settings.voiceVideo.outputDevice", "Dispositivo de Salida")}</span>
              <MaterialIcon name="volume_up" size={16} className="text-onicord-muted" />
            </label>
            <Select
              value={audio.outputDeviceId === "default" ? "" : (audio.outputDeviceId || "")}
              onChange={(e) => {
                const val = e.target.value;
                const match = outputs.find((d) => d.deviceId === val);
                setAudio((a) => ({
                  ...a,
                  outputDeviceId: val,
                  outputDeviceLabel: match?.label || (val === "" ? "" : a.outputDeviceLabel),
                }));
              }}
              options={outputOptions}
              className="w-full"
            />

            <div data-setting-id="outputVolume" className="pt-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-semibold text-onicord-muted">
                  {t("settings.voiceVideo.outputVolume", "Volumen de Salida")}
                </span>
                <span className="text-[11px] font-mono font-bold text-onicord-accent">
                  {audio.outputVolume ?? 100}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={audio.outputVolume ?? 100}
                onChange={(e) =>
                  setAudio({
                    ...audio,
                    outputVolume: parseInt(e.target.value),
                  })
                }
                className="onicord-range-input"
              />
            </div>
          </div>
        </div>

        {/* Camera (Webcam) */}
        <div
          data-setting-id="videoDevice"
          className="mt-5 space-y-3 bg-onicord-base/40 p-4 rounded-xl border border-onicord-border transition-all"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <label className="text-xs font-semibold text-onicord-text flex items-center justify-between">
                <span>{t("settings.voiceVideo.cameraDevice", "Cámara de Video (Webcam)")}</span>
                <MaterialIcon name="videocam" size={16} className="text-onicord-muted" />
              </label>
              <Select
                value={audio.videoDeviceId === "default" ? "" : (audio.videoDeviceId || "")}
                onChange={(e) => {
                  const val = e.target.value;
                  const match = videoInputs.find((d) => d.deviceId === val);
                  setAudio((a) => ({
                    ...a,
                    videoDeviceId: val,
                    videoDeviceLabel: match?.label || (val === "" ? "" : a.videoDeviceLabel),
                  }));
                  if (isTestingCamera) {
                    startCameraPreview(val);
                  }
                }}
                options={videoOptions}
                className="w-full"
              />
            </div>

            <button
              type="button"
              onClick={toggleCameraTest}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shrink-0 cursor-pointer sm:self-end ${
                isTestingCamera
                  ? "bg-onicord-danger/20 text-onicord-danger border border-onicord-danger/30 hover:bg-onicord-danger/30"
                  : "bg-onicord-accent text-onicord-on-accent font-semibold hover:opacity-90 shadow-sm"
              }`}
            >
              {isTestingCamera
                ? t("settings.voiceVideo.stopTestCamera", "Detener Cámara")
                : t("settings.voiceVideo.testCamera", "Probar Cámara")}
            </button>
          </div>

          {cameraError && (
            <p className="text-[11px] text-onicord-danger font-medium">{cameraError}</p>
          )}

          {isTestingCamera && (
            <div className="pt-2 flex justify-center">
              <div className="w-full max-w-[320px] aspect-video rounded-xl overflow-hidden bg-black border border-onicord-tint/10 shadow-lg relative">
                <video
                  ref={previewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Voice input mode (Voice Activity vs Push-to-Talk) */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.voiceVideo.inputModeTitle", "Modo de Entrada")}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Voice Activity */}
          <button
            type="button"
            onClick={() => setAudio((a) => ({ ...a, inputMode: "vad" }))}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              audio.inputMode === "vad"
                ? "bg-onicord-accent/10 border-onicord-accent/50 text-onicord-text"
                : "bg-onicord-base/40 border-onicord-border text-onicord-muted hover:border-onicord-tint/10"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <MaterialIcon
                name={audio.inputMode === "vad" ? "radio_button_checked" : "radio_button_unchecked"}
                size={18}
                className={audio.inputMode === "vad" ? "text-onicord-accent" : "text-onicord-muted"}
              />
              <span className="font-bold text-sm text-onicord-text">
                {t("settings.voiceVideo.voiceActivity", "Actividad de Voz")}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed">
              {t("settings.voiceVideo.voiceActivityDesc", "El micrófono se activará automáticamente cuando detecte sonido por encima del umbral.")}
            </p>
          </button>

          {/* Push-to-Talk */}
          <button
            type="button"
            onClick={() => setAudio((a) => ({ ...a, inputMode: "ptt" }))}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              audio.inputMode === "ptt"
                ? "bg-onicord-accent/10 border-onicord-accent/50 text-onicord-text"
                : "bg-onicord-base/40 border-onicord-border text-onicord-muted hover:border-onicord-tint/10"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <MaterialIcon
                name={audio.inputMode === "ptt" ? "radio_button_checked" : "radio_button_unchecked"}
                size={18}
                className={audio.inputMode === "ptt" ? "text-onicord-accent" : "text-onicord-muted"}
              />
              <span className="font-bold text-sm text-onicord-text">
                {t("settings.voiceVideo.pushToTalk", "Apretar para Hablar (PTT)")}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed">
              {t("settings.voiceVideo.pushToTalkDesc", "Tu micrófono permanecerá silenciado hasta que presiones y mantengas tu atajo grabado.")}
            </p>
          </button>
        </div>

        {audio.inputMode === "ptt" && (
          <div className="mt-4 p-3.5 rounded-xl bg-onicord-base/40 border border-onicord-border flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-onicord-accent/10 border border-onicord-accent/20 flex items-center justify-center text-onicord-accent shrink-0">
                <MaterialIcon name="keyboard" size={18} />
              </div>
              <div>
                <p className="text-xs font-semibold text-onicord-text">
                  {t("settings.voiceVideo.keybindingConfigHint", "Configuración de atajos de teclado y mouse")}
                </p>
                <p className="text-[11px] text-onicord-muted mt-0.5">
                  {t("settings.voiceVideo.keybindingConfigDesc", "Los atajos y botones para Apretar para Hablar (PTT) se configuran en la pestaña Atajos de Teclado.")}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Microphone sensitivity and test */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.voiceVideo.sensitivityLabel", "Prueba y Sensibilidad del Micrófono")}</span>
        </h3>

        <div>
          {/* Microphone Test */}
          <div data-setting-id="micTest" className="pb-3 border-b border-onicord-border space-y-2 transition-all">
            <p className="onicord-settings-row-desc">
              {t("settings.voiceVideo.micTestHint", "¿Tienes problemas? Prueba hablar en tu micrófono para verificar la señal.")}
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
              <button
                type="button"
                onClick={toggleMicTest}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all w-full sm:w-auto shrink-0 cursor-pointer ${
                  isTestingMic
                    ? "bg-onicord-danger/20 text-onicord-danger border border-onicord-danger/30 hover:bg-onicord-danger/30"
                    : "bg-onicord-accent text-onicord-on-accent font-semibold hover:opacity-90 shadow-sm"
                }`}
              >
                {isTestingMic ? t("settings.voiceVideo.stopTest", "Detener Prueba") : t("settings.voiceVideo.testMic", "Probar Micrófono")}
              </button>
              <div className="flex-1 w-full h-3 bg-onicord-base/60 rounded-full overflow-hidden relative border border-onicord-border shadow-inner">
                <div
                  className="absolute top-0 left-0 h-full bg-onicord-accent transition-all duration-75 ease-out rounded-full"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
            </div>
          </div>

          {/* Automatic Sensitivity & VAD Slider */}
          <div data-setting-id="vadSensitivity" className="onicord-settings-row transition-all">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.voiceVideo.determineAutoSensitivity", "Determinar sensibilidad de entrada automáticamente")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.voiceVideo.sensitivityHint", "Onicord ajustará la sensibilidad basándose en el ruido ambiental.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={audio.autoVad ?? true}
                onChange={(e) =>
                  setAudio({ ...audio, autoVad: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          {!audio.autoVad && (
            <div className="py-3">
              <div className="flex justify-between text-[11px] text-onicord-muted mb-1 font-mono">
                <span>0dB</span>
                <span className="text-onicord-accent font-bold">Umbral: {audio.vadThreshold || 50}%</span>
                <span>100dB</span>
              </div>
              <div className="relative w-full h-4 bg-onicord-base/60 rounded-full overflow-hidden border border-onicord-border shadow-inner group">
                <div
                  className={`absolute top-0 left-0 h-full transition-all duration-75 ${
                    micLevel > (audio.vadThreshold || 50) ? "bg-onicord-accent" : "bg-amber-500"
                  }`}
                  style={{ width: `${micLevel}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white shadow-md z-10 pointer-events-none"
                  style={{ left: `${audio.vadThreshold || 50}%` }}
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audio.vadThreshold || 50}
                  onChange={(e) =>
                    setAudio({
                      ...audio,
                      vadThreshold: parseInt(e.target.value),
                    })
                  }
                  className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Advanced voice processing */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.voiceVideo.advancedProcessing", "Procesamiento Avanzado de Audio")}</span>
        </h3>

        <div>
          <div data-setting-id="noiseSuppression" className="onicord-settings-row transition-all">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.voiceVideo.noiseSuppression", "Supresión de Ruido")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.voiceVideo.noiseSuppressionDesc", "Filtra el ruido de fondo innecesario como teclados o ventiladores.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={audio.noiseSuppression ?? true}
                onChange={(e) =>
                  setAudio({ ...audio, noiseSuppression: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          <div data-setting-id="echoCancellation" className="onicord-settings-row transition-all">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.voiceVideo.echoCancellation", "Cancelación de Eco")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.voiceVideo.echoCancellationDesc", "Evita la retroalimentación si el sonido sale por altavoces.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={audio.echoCancellation ?? true}
                onChange={(e) =>
                  setAudio({ ...audio, echoCancellation: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          <div data-setting-id="autoGainControl" className="onicord-settings-row transition-all">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.voiceVideo.autoGainControl", "Control Automático de Ganancia")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.voiceVideo.autoGainControlDesc", "Nivela automáticamente el volumen de tu voz si hablas bajo o fuerte.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={audio.autoGainControl ?? true}
                onChange={(e) =>
                  setAudio({ ...audio, autoGainControl: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          <div data-setting-id="dynamicsCompression" className="onicord-settings-row transition-all">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.voiceVideo.dynamicsCompression", "Compresión Dinámica Master")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.voiceVideo.dynamicsCompressionDesc", "Evita distorsión y saturación brusca amortiguando picos de volumen cuando varios usuarios hablan o gritan a la vez.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={audio.dynamicsCompression ?? true}
                onChange={(e) =>
                  setAudio({ ...audio, dynamicsCompression: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          <div data-setting-id="autoDucking" className="onicord-settings-row transition-all">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.voiceVideo.autoDucking", "Atenuación Automática (Auto-Ducking)")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.voiceVideo.autoDuckingDesc", "Atenúa suavemente el audio del juego o pantalla compartida mientras algún compañero esté hablando.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={audio.autoDucking ?? true}
                onChange={(e) =>
                  setAudio({ ...audio, autoDucking: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          {(audio.autoDucking ?? true) && (
            <div className="py-2.5 px-4 bg-onicord-base/30 rounded-lg mt-2 mb-1 border border-onicord-border">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-semibold text-onicord-muted">
                  {t("settings.voiceVideo.autoDuckingAmount", "Nivel de atenuación")}
                </span>
                <span className="text-[11px] font-mono font-bold text-onicord-accent">
                  {audio.autoDuckingAmount ?? 50}%
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={audio.autoDuckingAmount ?? 50}
                onChange={(e) =>
                  setAudio({
                    ...audio,
                    autoDuckingAmount: parseInt(e.target.value, 10),
                  })
                }
                className="onicord-range-input"
              />
            </div>
          )}
        </div>
      </div>

      {/* RESET BUTTON */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setAudio({ ...DEFAULT_AUDIO })}
          className="onicord-btn-danger-soft block w-full text-center py-2.5"
        >
          {t("settings.voiceVideo.resetAudio", "Restablecer ajustes de audio por defecto")}
        </button>
      </div>
    </div>
  );
}
