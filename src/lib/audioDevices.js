export async function ensureMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    stream.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    return false
  }
}

export async function listAudioDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices()
  const inputs = devices.filter((d) => d.kind === 'audioinput')
  const outputs = devices.filter((d) => d.kind === 'audiooutput')
  return { inputs, outputs }
}
