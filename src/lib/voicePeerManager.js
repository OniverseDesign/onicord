/**
 * voicePeerManager.js
 * Backwards-compatibility façade re-exporting VoicePeerManager from modularized /voice/ engine.
 */

export { VoicePeerManager } from "./voice/VoicePeerManager";
export { createNativePeer } from "./voice/WebRtcPeerWrapper";
export { VoiceAudioEngine } from "./voice/VoiceAudioEngine";
export { VoiceSfuRouter } from "./voice/VoiceSfuRouter";
export { VoiceStatsMonitor, getAdaptiveVideoBitrate } from "./voice/VoiceBitrateAdapter";

import { VoicePeerManager } from "./voice/VoicePeerManager";
export default VoicePeerManager;
