export const DEFAULT_AUDIO = {
  inputDeviceId: '',
  outputDeviceId: '',
  peerVolumes: {},
  inputVolume: 100,
  outputVolume: 100,
  autoVad: true,
  vadThreshold: 50,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  inputMode: 'vad',
  pttHotkey: 'Control',
}

export function normalizeAudioSettings(audio) {
  return {
    inputDeviceId: audio?.inputDeviceId || '',
    outputDeviceId: audio?.outputDeviceId || '',
    peerVolumes: { ...(audio?.peerVolumes || {}) },
    inputVolume: audio?.inputVolume !== undefined ? Number(audio.inputVolume) : 100,
    outputVolume: audio?.outputVolume !== undefined ? Number(audio.outputVolume) : 100,
    autoVad: audio?.autoVad !== undefined ? Boolean(audio.autoVad) : true,
    vadThreshold: audio?.vadThreshold !== undefined ? Number(audio.vadThreshold) : 50,
    noiseSuppression: audio?.noiseSuppression !== undefined ? Boolean(audio.noiseSuppression) : true,
    echoCancellation: audio?.echoCancellation !== undefined ? Boolean(audio.echoCancellation) : true,
    autoGainControl: audio?.autoGainControl !== undefined ? Boolean(audio.autoGainControl) : true,
    inputMode: audio?.inputMode || 'vad',
    pttHotkey: audio?.pttHotkey || 'Control',
  }
}

export function getPeerVolumePercent(peerVolumes, peerId) {
  const v = peerVolumes?.[peerId]
  if (v === undefined || v === null) return 100
  return Math.min(200, Math.max(0, Number(v)))
}

export function peerVolumeToGain(percent) {
  return Math.min(2, Math.max(0, percent / 100))
}

