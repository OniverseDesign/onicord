/**
 * VoiceBitrateAdapter.js
 * Adaptive bitrate computation and WebRTC statistics monitoring.
 */

export function getAdaptiveVideoBitrate(peerCount = 1, isRealStream = true) {
  if (peerCount <= 2) {
    return isRealStream ? 2500000 : 1500000;
  } else if (peerCount <= 4) {
    return isRealStream ? 1800000 : 1000000;
  } else if (peerCount <= 8) {
    return isRealStream ? 1200000 : 700000;
  } else {
    return isRealStream ? 800000 : 500000;
  }
}

export class VoiceStatsMonitor {
  constructor() {
    this._statsInterval = null;
    this.latestStats = new Map();
  }

  start(peersMap, intervalMs = 3000) {
    this.stop();
    this._statsInterval = setInterval(async () => {
      if (!peersMap || peersMap.size === 0) return;

      for (const [peerId, peer] of peersMap.entries()) {
        if (!peer || peer.destroyed || !peer._pc) continue;

        try {
          const stats = await peer._pc.getStats();
          let inboundAudioBytes = 0;
          let inboundAudioPackets = 0;
          let outboundAudioBytes = 0;
          let packetsLost = 0;
          let roundTripTime = 0;

          stats.forEach((report) => {
            if (report.type === "inbound-rtp" && report.kind === "audio") {
              inboundAudioBytes = report.bytesReceived || 0;
              inboundAudioPackets = report.packetsReceived || 0;
              packetsLost = report.packetsLost || 0;
            } else if (report.type === "outbound-rtp" && report.kind === "audio") {
              outboundAudioBytes = report.bytesSent || 0;
            } else if (report.type === "candidate-pair" && report.state === "succeeded") {
              roundTripTime = report.currentRoundTripTime || 0;
            }
          });

          this.latestStats.set(peerId, {
            inboundAudioBytes,
            inboundAudioPackets,
            outboundAudioBytes,
            packetsLost,
            roundTripTime,
            timestamp: Date.now(),
          });
        } catch {
          // Ignore stats errors during peer renegotiation
        }
      }
    }, intervalMs);
  }

  stop() {
    if (this._statsInterval) {
      clearInterval(this._statsInterval);
      this._statsInterval = null;
    }
    this.latestStats.clear();
  }

  getPeerStats(peerId) {
    return this.latestStats.get(peerId) || null;
  }
}
