import { useState, useRef, useEffect } from "react";

export function useMicTest(inputDeviceId) {
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);

  const toggleMicTest = async () => {
    if (isTestingMic) {
      stopTest();
    } else {
      setIsTestingMic(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: inputDeviceId
            ? { deviceId: { exact: inputDeviceId } }
            : true,
          video: false,
        });
        streamRef.current = stream;

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioCtx;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const average = sum / dataArray.length;
          const percent = Math.min(100, Math.round((average / 128) * 100));
          setMicLevel(percent);
          animationFrameRef.current = requestAnimationFrame(checkLevel);
        };
        checkLevel();
      } catch (err) {
        console.error("Error starting mic test hook:", err);
        setIsTestingMic(false);
      }
    }
  };

  const stopTest = () => {
    setIsTestingMic(false);
    setMicLevel(0);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Stop test if input device ID changes
  useEffect(() => {
    if (isTestingMic) {
      stopTest();
    }
  }, [inputDeviceId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return { isTestingMic, micLevel, toggleMicTest, stopTest };
}
