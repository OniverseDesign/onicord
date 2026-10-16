import { useState, useEffect } from "react";
import { ensureMicPermission, listAudioDevices } from "../lib/audioDevices";

export function useAudioDevices(active = true) {
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  const refreshDevices = async () => {
    if (!active) return;
    setDevicesLoading(true);
    try {
      await ensureMicPermission();
      const { inputs: ins, outputs: outs } = await listAudioDevices();
      setInputs(ins);
      setOutputs(outs);
    } catch (e) {
      console.error("Error refreshing devices:", e);
    } finally {
      setDevicesLoading(false);
    }
  };

  useEffect(() => {
    if (active) {
      refreshDevices();
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const onChange = () => {
      refreshDevices();
    };

    navigator.mediaDevices?.addEventListener("devicechange", onChange);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", onChange);
    };
  }, [active]);

  return { inputs, outputs, devicesLoading, refreshDevices };
}
