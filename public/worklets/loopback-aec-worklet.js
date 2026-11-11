/**
 * loopback-aec-worklet.js
 * Adaptive Digital Loopback Echo Canceller for Screen Share Audio on Windows.
 *
 * Input 0: Desktop / system loopback capture (contains desktop audio + Onicord's own playback)
 * Input 1: VoiceAudioEngine master output reference (exact audio Onicord sends to speakers)
 * Output 0: Cleaned desktop audio with Onicord's voice loopback suppressed
 */

const RING_SIZE = 16384; // ~341ms at 48kHz (must be power of 2)
const RING_MASK = RING_SIZE - 1;
const DS_FACTOR = 8; // 48kHz -> 6kHz for fast coarse delay search
const DS_SIZE = RING_SIZE / DS_FACTOR; // 2048
const DS_MASK = DS_SIZE - 1;
const TAPS = 64; // ~1.33ms FIR window centered around locked delay

class LoopbackAecProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.refL = new Float32Array(RING_SIZE);
    this.refR = new Float32Array(RING_SIZE);
    this.writeIdx = 0;

    this.refDs = new Float32Array(DS_SIZE);
    this.capDs = new Float32Array(DS_SIZE);
    this.dsWriteIdx = 0;
    this.dsAccumRef = 0;
    this.dsAccumCap = 0;
    this.dsCounter = 0;
    this.samplesSinceSearch = 0;

    this.wL = new Float32Array(TAPS);
    this.wR = new Float32Array(TAPS);
    this.delaySamples = 0;
    this.delayLocked = false;
    this.badFrameCount = 0;

    this.refEnv = 0;
    this.alignedRefEnv = 0;
    this.echoEnv = 0;
    this.capEnv = 0;
    this.errEnv = 0;
  }

  _estimateDelay() {
    const WIN = 96; // 96 * 8 = 768 samples window (~16ms at 48kHz? 96 ds samples = 16ms at 6kHz -> actually 16ms of coarse texture)
    const MAX_LAG_DS = 1600; // up to ~266ms at 48kHz
    const startLag = this.delayLocked
      ? Math.max(0, Math.floor(this.delaySamples / DS_FACTOR) - 10)
      : 0;
    const endLag = this.delayLocked
      ? Math.min(MAX_LAG_DS, Math.floor(this.delaySamples / DS_FACTOR) + 10)
      : MAX_LAG_DS;

    let capEnergy = 0;
    for (let i = 0; i < WIN; i++) {
      const c = this.capDs[(this.dsWriteIdx - 1 - i) & DS_MASK];
      capEnergy += c * c;
    }
    if (capEnergy < 1e-6) return;

    let bestCorr = 0;
    let bestLag = -1;

    for (let lag = startLag; lag <= endLag; lag++) {
      let dot = 0;
      let refEnergy = 0;
      for (let i = 0; i < WIN; i++) {
        const c = this.capDs[(this.dsWriteIdx - 1 - i) & DS_MASK];
        const r = this.refDs[(this.dsWriteIdx - 1 - i - lag) & DS_MASK];
        dot += c * r;
        refEnergy += r * r;
      }
      if (refEnergy > 1e-6) {
        const normCorr = dot / Math.sqrt(capEnergy * refEnergy + 1e-12);
        if (normCorr > bestCorr) {
          bestCorr = normCorr;
          bestLag = lag;
        }
      }
    }

    const lockThreshold = this.delayLocked ? 0.72 : 0.42;
    if (bestLag >= 0 && bestCorr > lockThreshold) {
      const newDelay = bestLag * DS_FACTOR;
      if (!this.delayLocked || Math.abs(newDelay - this.delaySamples) > 16) {
        if (this.delayLocked && Math.abs(newDelay - this.delaySamples) > 48) {
          this.wL.fill(0);
          this.wR.fill(0);
        }
        this.delaySamples = newDelay;
        this.delayLocked = true;
      }
    }
  }

  process(inputs, outputs) {
    const capInput = inputs[0];
    const refInput = inputs[1];
    const output = outputs[0];

    if (!output || output.length === 0) return true;
    const outL = output[0];
    const outR = output[1] || output[0];
    const blockLen = outL.length;

    if (!capInput || capInput.length === 0 || !capInput[0]) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      return true;
    }

    const capL = capInput[0];
    const capR = capInput[1] || capInput[0];

    const hasRef = Boolean(refInput && refInput.length > 0 && refInput[0]);
    if (!hasRef) {
      outL.set(capL);
      if (outR !== outL) outR.set(capR);
      return true;
    }

    const refInL = refInput[0];
    const refInR = refInput[1] || refInput[0];

    for (let i = 0; i < blockLen; i++) {
      const xL = refInL[i];
      const xR = refInR[i];
      const yL = capL[i];
      const yR = capR[i];

      this.refL[this.writeIdx] = xL;
      this.refR[this.writeIdx] = xR;

      this.dsAccumRef += 0.5 * (xL + xR);
      this.dsAccumCap += 0.5 * (yL + yR);
      this.dsCounter++;
      if (this.dsCounter >= DS_FACTOR) {
        this.refDs[this.dsWriteIdx] = this.dsAccumRef / DS_FACTOR;
        this.capDs[this.dsWriteIdx] = this.dsAccumCap / DS_FACTOR;
        this.dsWriteIdx = (this.dsWriteIdx + 1) & DS_MASK;
        this.dsAccumRef = 0;
        this.dsAccumCap = 0;
        this.dsCounter = 0;
      }

      const xPowInst = 0.5 * (xL * xL + xR * xR);
      const yPowInst = 0.5 * (yL * yL + yR * yR);
      this.refEnv = 0.995 * this.refEnv + 0.005 * xPowInst;
      this.capEnv = 0.995 * this.capEnv + 0.005 * yPowInst;

      // Fast path when no voice reference has been active recently
      if (!this.delayLocked || (this.alignedRefEnv < 1e-8 && this.refEnv < 1e-8)) {
        outL[i] = yL;
        if (outR !== outL) outR[i] = yR;
      } else {
        const startTap = Math.max(0, this.delaySamples - 24);
        let echoL = 0;
        let echoR = 0;
        let normL = 0;
        let normR = 0;

        for (let k = 0; k < TAPS; k++) {
          const idx = (this.writeIdx - startTap - k) & RING_MASK;
          const rl = this.refL[idx];
          const rr = this.refR[idx];
          echoL += this.wL[k] * rl;
          echoR += this.wR[k] * rr;
          normL += rl * rl;
          normR += rr * rr;
        }

        const alignedIdx = (this.writeIdx - this.delaySamples) & RING_MASK;
        const alignedPowInst =
          0.5 *
          (this.refL[alignedIdx] * this.refL[alignedIdx] +
            this.refR[alignedIdx] * this.refR[alignedIdx]);
        this.alignedRefEnv = 0.995 * this.alignedRefEnv + 0.005 * alignedPowInst;

        const eL = yL - echoL;
        const eR = yR - echoR;
        const ePowInst = 0.5 * (eL * eL + eR * eR);
        const echoPowInst = 0.5 * (echoL * echoL + echoR * echoR);
        this.errEnv = 0.995 * this.errEnv + 0.005 * ePowInst;
        this.echoEnv = 0.995 * this.echoEnv + 0.005 * echoPowInst;

        // Safety guard: never amplify signal if loopback source doesn't contain Onicord output
        if (this.errEnv > this.capEnv * 1.18 + 1e-5) {
          this.badFrameCount++;
          if (this.badFrameCount > 512) {
            for (let k = 0; k < TAPS; k++) {
              this.wL[k] *= 0.9;
              this.wR[k] *= 0.9;
            }
          }
          outL[i] = yL;
          if (outR !== outL) outR[i] = yR;
        } else {
          this.badFrameCount = 0;
          outL[i] = eL;
          if (outR !== outL) outR[i] = eR;
        }

        // Adapt NLMS weights only during voice activity and freeze during heavy double-talk
        if (this.alignedRefEnv > 1e-6) {
          const isConverged = this.echoEnv > 1e-6;
          const isDoubleTalk = isConverged
            ? this.errEnv > 0.25 * this.echoEnv && this.capEnv > 1.25 * this.echoEnv
            : this.capEnv > 3.5 * this.alignedRefEnv;

          if (!isDoubleTalk) {
            const mu = 0.32;
            const stepL = (mu * eL) / (normL + 0.05 + eL * eL * 4);
            const stepR = (mu * eR) / (normR + 0.05 + eR * eR * 4);
            for (let k = 0; k < TAPS; k++) {
              const idx = (this.writeIdx - startTap - k) & RING_MASK;
              this.wL[k] += stepL * this.refL[idx];
              this.wR[k] += stepR * this.refR[idx];
            }
          }
        }
      }

      this.writeIdx = (this.writeIdx + 1) & RING_MASK;
      this.samplesSinceSearch++;
      if (this.samplesSinceSearch >= 2048) {
        this.samplesSinceSearch = 0;
        if (this.refEnv > 1e-6) {
          this._estimateDelay();
        }
      }
    }

    return true;
  }
}

registerProcessor("loopback-aec-processor", LoopbackAecProcessor);
