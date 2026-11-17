import { useState, useEffect, useCallback } from "react";
import { ensureMicPermission, listAudioDevices } from "../lib/audioDevices";

export function useAudioDevices(active = true) {
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [videoInputs, setVideoInputs] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  const refreshDevices = useCallback(async () => {
    if (!active) return;
    setDevicesLoading(true);
    try {
      await ensureMicPermission();
      const { inputs: ins, outputs: outs, videoInputs: cams } = await listAudioDevices();
      setInputs(ins);
      setOutputs(outs);
      setVideoInputs(cams || []);
    } catch (e) {
      console.error("Error refreshing devices:", e);
    } finally {
      setDevicesLoading(false);
    }
  }, [active]);

  useEffect(() => {
    if (active) {
      refreshDevices();
    }
  }, [active, refreshDevices]);

  useEffect(() => {
    if (!active) return;

    const onChange = () => {
      refreshDevices();
    };

    navigator.mediaDevices?.addEventListener("devicechange", onChange);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", onChange);
    };
  }, [active, refreshDevices]);

  return { inputs, outputs, videoInputs, devicesLoading, refreshDevices };
}
