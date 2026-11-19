/**
 * loopback-aec-worklet.js
 * Adaptive Digital Loopback Echo Canceller for Screen Share Audio on Windows.
 *
 * Input 0: Desktop / system loopback capture (contains desktop audio + Onicord's own playback)
 * Input 1: VoiceAudioEngine master output reference (exact audio Onicord sends to speakers)
 * Output 0: Cleaned desktop audio with Onicord's voice loopback suppressed
 */

const RING_SIZE = 32768; // ~682ms at 48kHz (must be power of 2)
const RING_MASK = RING_SIZE - 1;
const DS_FACTOR = 8; // 48kHz -> 6kHz for fast coarse delay search
const DS_SIZE = RING_SIZE / DS_FACTOR; // 4096
const DS_MASK = DS_SIZE - 1;
const TAPS = 160; // ~3.33ms FIR window centered around locked delay
const PRE_TAPS = 40; // ~0.83ms pre-delay taps to absorb coarse jitter
const MAX_LAG_DS = 2400; // up to 400ms at 48kHz

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
    this.lastCorr = 0;
    this.unlockStreak = 0;
    this.badFrameCount = 0;

    this.refEnv = 0;
    this.alignedRefEnv = 0;
    this.echoEnv = 0;
    this.capEnv = 0;
    this.errEnv = 0;
    this.nlpGain = 1.0;
  }

  _corrAtLag(lag, win) {
    let dot = 0;
    let refEnergy = 0;
    let capEnergy = 0;
    for (let i = 0; i < win; i++) {
      const c = this.capDs[(this.dsWriteIdx - 1 - i) & DS_MASK];
      const r = this.refDs[(this.dsWriteIdx - 1 - i - lag) & DS_MASK];
      dot += c * r;
      refEnergy += r * r;
      capEnergy += c * c;
    }
    if (refEnergy <= 1e-6 || capEnergy <= 1e-6) return 0;
    return Math.abs(dot) / Math.sqrt(capEnergy * refEnergy + 1e-12);
  }

  _estimateDelay() {
    const FINE_WIN = 256; // ~42.6ms at 6kHz
    let capEnergy = 0;
    for (let i = 0; i < FINE_WIN; i++) {
      const c = this.capDs[(this.dsWriteIdx - 1 - i) & DS_MASK];
      capEnergy += c * c;
    }
    if (capEnergy < 1e-6) return;

    let bestCorr = 0;
    let bestLag = -1;

    if (!this.delayLocked) {
      // Two-stage coarse + fine search across 0..400ms
      const COARSE_WIN = 160;
      let coarseBestLag = -1;
      let coarseBestCorr = 0;
      for (let lag = 0; lag <= MAX_LAG_DS; lag += 2) {
        const corr = this._corrAtLag(lag, COARSE_WIN);
        if (corr > coarseBestCorr) {
          coarseBestCorr = corr;
          coarseBestLag = lag;
        }
      }
      if (coarseBestLag >= 0) {
        const fineStart = Math.max(0, coarseBestLag - 3);
        const fineEnd = Math.min(MAX_LAG_DS, coarseBestLag + 3);
        for (let lag = fineStart; lag <= fineEnd; lag++) {
          const corr = this._corrAtLag(lag, FINE_WIN);
          if (corr > bestCorr) {
            bestCorr = corr;
            bestLag = lag;
          }
        }
      }
    } else {
      const centerLag = Math.floor(this.delaySamples / DS_FACTOR);
      const startLag = Math.max(0, centerLag - 12);
      const endLag = Math.min(MAX_LAG_DS, centerLag + 12);
      for (let lag = startLag; lag <= endLag; lag++) {
        const corr = this._corrAtLag(lag, FINE_WIN);
        if (corr > bestCorr) {
          bestCorr = corr;
          bestLag = lag;
        }
      }
    }

    this.lastCorr = bestCorr;

    // Detect if delay drifted outside the locked search window and recover automatically
    if (this.delayLocked) {
      const poorLock =
        this.alignedRefEnv > 1e-6 &&
        this.capEnv > 1e-6 &&
        bestCorr < 0.3 &&
        this.errEnv > 0.72 * this.capEnv;
      if (poorLock) {
        this.unlockStreak++;
        if (this.unlockStreak >= 12) {
          this.delayLocked = false;
          this.unlockStreak = 0;
          this.wL.fill(0);
          this.wR.fill(0);
        }
      } else {
        this.unlockStreak = 0;
      }
    }

    const lockThreshold = this.delayLocked ? 0.5 : 0.45;
    if (bestLag >= 0 && bestCorr > lockThreshold) {
      const newDelay = bestLag * DS_FACTOR;
      if (!this.delayLocked || Math.abs(newDelay - this.delaySamples) > 16) {
        if (this.delayLocked && Math.abs(newDelay - this.delaySamples) > 48) {
          this.wL.fill(0);
          this.wR.fill(0);
        }
        this.delaySamples = newDelay;
        this.delayLocked = true;
        this.unlockStreak = 0;
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
    const searchStride = this.delayLocked ? 2048 : 4096;

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

      const alignedIdx = (this.writeIdx - this.delaySamples) & RING_MASK;
      const alignedPowInst =
        0.5 *
        (this.refL[alignedIdx] * this.refL[alignedIdx] +
          this.refR[alignedIdx] * this.refR[alignedIdx]);
      this.alignedRefEnv = 0.995 * this.alignedRefEnv + 0.005 * alignedPowInst;

      // Fast transparent path when no voice reference has been active recently
      if (!this.delayLocked || (this.alignedRefEnv < 1e-8 && this.refEnv < 1e-8)) {
        this.nlpGain = 0.995 * this.nlpGain + 0.005 * 1.0;
        outL[i] = yL * this.nlpGain;
        if (outR !== outL) outR[i] = yR * this.nlpGain;
      } else {
        const startTap = Math.max(0, this.delaySamples - PRE_TAPS);
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

        const eL = yL - echoL;
        const eR = yR - echoR;
        const ePowInst = 0.5 * (eL * eL + eR * eR);
        const echoPowInst = 0.5 * (echoL * echoL + echoR * echoR);
        this.errEnv = 0.995 * this.errEnv + 0.005 * ePowInst;
        this.echoEnv = 0.995 * this.echoEnv + 0.005 * echoPowInst;

        let cleanL;
        let cleanR;
        // Safety guard: never amplify signal if loopback source doesn't contain Onicord output
        if (this.errEnv > this.capEnv * 1.18 + 1e-5) {
          this.badFrameCount++;
          if (this.badFrameCount > 512) {
            for (let k = 0; k < TAPS; k++) {
              this.wL[k] *= 0.9;
              this.wR[k] *= 0.9;
            }
          }
          cleanL = yL;
          cleanR = yR;
        } else {
          this.badFrameCount = 0;
          cleanL = eL;
          cleanR = eR;
        }

        // Smooth non-linear residual suppressor (NLP) when voice loopback dominates capture
        let targetNlp = 1.0;
        if (this.alignedRefEnv > 1e-7 && this.capEnv > 1e-8) {
          const cancelRatio = 1.0 - Math.min(1.0, this.errEnv / (this.capEnv + 1e-8));
          const hasConfirmedEcho =
            cancelRatio > 0.35 ||
            (this.lastCorr > 0.58 && this.capEnv < 2.0 * this.alignedRefEnv);
          if (hasConfirmedEcho) {
            if (cancelRatio > 0.55 && this.errEnv < 0.45 * this.capEnv) {
              targetNlp = 0.02;
            } else {
              const residualRatio = this.errEnv / (this.capEnv + 1e-8);
              targetNlp = Math.max(0.04, Math.min(1.0, residualRatio * 0.6));
            }
          }
        }
        const nlpCoeff = targetNlp < this.nlpGain ? 0.96 : 0.997;
        this.nlpGain = nlpCoeff * this.nlpGain + (1.0 - nlpCoeff) * targetNlp;

        outL[i] = cleanL * this.nlpGain;
        if (outR !== outL) outR[i] = cleanR * this.nlpGain;

        // Adapt NLMS weights only during voice activity; gently throttle during heavy desktop double-talk
        if (this.alignedRefEnv > 1e-7) {
          const isHeavyDoubleTalk =
            this.echoEnv > 1e-6 &&
            this.errEnv > 0.85 * this.capEnv &&
            this.capEnv > 2.2 * Math.max(this.alignedRefEnv, this.echoEnv);

          const mu = isHeavyDoubleTalk ? 0.04 : 0.38;
          const stepL = (mu * eL) / (normL + 0.02 + eL * eL * 4);
          const stepR = (mu * eR) / (normR + 0.02 + eR * eR * 4);
          for (let k = 0; k < TAPS; k++) {
            const idx = (this.writeIdx - startTap - k) & RING_MASK;
            const nextL = this.wL[k] + stepL * this.refL[idx];
            const nextR = this.wR[k] + stepR * this.refR[idx];
            this.wL[k] = nextL > 2 ? 2 : nextL < -2 ? -2 : nextL;
            this.wR[k] = nextR > 2 ? 2 : nextR < -2 ? -2 : nextR;
          }
        }
      }

      this.writeIdx = (this.writeIdx + 1) & RING_MASK;
      this.samplesSinceSearch++;
      if (this.samplesSinceSearch >= searchStride) {
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
