/**
 * VoiceSfuRouter.js
 * Selective Forwarding Unit (SFU) router and stream resolver.
 */

export class VoiceSfuRouter {
  constructor({ localPeerId, peersMap, onRemoteStream, attachRemoteAudioFn }) {
    this.localPeerId = localPeerId;
    this.peers = peersMap;
    this.onRemoteStream = onRemoteStream;
    this.attachRemoteAudio = attachRemoteAudioFn;

    this.networkTopology = "mesh";
    this.sfuHostId = null;
    this.isLocalHost = false;

    this._forwardedTracks = new Map();
    this._pendingSfuStreams = new Map();
    this.voiceMembers = [];
  }

  setTopology(topology, sfuHostId, disconnectPeerFn) {
    if (topology === this.networkTopology && sfuHostId === this.sfuHostId) return;
    console.log(`[VoiceSfuRouter] Changing topology from ${this.networkTopology} to ${topology}. Host ID: ${sfuHostId}`);
    const oldTopology = this.networkTopology;
    this.networkTopology = topology;
    this.sfuHostId = sfuHostId;
    this.isLocalHost = (sfuHostId === this.localPeerId);

    if (topology === "sfu") {
      if (!this.isLocalHost) {
        console.log(`[SFU Client] Disconnecting all peers except the host (${sfuHostId})`);
        for (const peerId of [...this.peers.keys()]) {
          if (peerId !== sfuHostId) {
            disconnectPeerFn?.(peerId, true);
          }
        }
      }
    } else if (topology === "mesh" && oldTopology === "sfu") {
      console.log(`[SFU Fallback] Reverted to mesh. Clearing SFU states...`);
      this._forwardedTracks.clear();
      this._pendingSfuStreams.clear();
    }
  }

  updateMembers(members) {
    this.voiceMembers = members;
    this.resolvePendingSfuStreams();
  }

  resolvePeerIdFromStreamId(streamId) {
    if (!streamId || !this.voiceMembers) return null;
    for (const member of this.voiceMembers) {
      if (member.audioStreamId === streamId || member.videoStreamId === streamId) {
        return member.peerId;
      }
    }
    return null;
  }

  registerPendingSfuStream(stream, remotePeerId) {
    if (this._pendingSfuStreams.has(stream.id)) return;
    console.log(`[SFU Client] Stream ${stream.id} from host connection (${remotePeerId}) is pending resolution...`);
    this._pendingSfuStreams.set(stream.id, { stream, remotePeerId });

    setTimeout(() => {
      if (this._pendingSfuStreams.has(stream.id)) {
        console.warn(`[SFU Client] Unresolved stream ${stream.id} timed out after 30s. Releasing tracks.`);
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {}
        this._pendingSfuStreams.delete(stream.id);
      }
    }, 30000);
  }

  resolvePendingSfuStreams() {
    if (this._pendingSfuStreams.size === 0) return;
    for (const [streamId, { stream, remotePeerId }] of this._pendingSfuStreams.entries()) {
      const realOwnerId = this.resolvePeerIdFromStreamId(streamId);
      if (realOwnerId) {
        console.log(`[SFU Client] Resolved pending stream ${streamId} to owner ${realOwnerId}`);
        this._pendingSfuStreams.delete(streamId);
        this.attachRemoteAudio?.(realOwnerId, stream);
        this.onRemoteStream?.(realOwnerId, stream);
        if (stream.getVideoTracks().length > 0) {
          window.dispatchEvent(
            new CustomEvent("peer-video-update", {
              detail: { peerId: realOwnerId },
            }),
          );
        }
      }
    }
  }

  forwardTrackToPeers(incomingTrack, incomingStream, fromPeerId) {
    if (!this.isLocalHost) return;
    if (!this._forwardedTracks.has(fromPeerId)) {
      this._forwardedTracks.set(fromPeerId, []);
    }
    const list = this._forwardedTracks.get(fromPeerId);
    if (!list.some(item => item.track.id === incomingTrack.id)) {
      list.push({ track: incomingTrack, stream: incomingStream });
    }
    for (const [peerId, peer] of this.peers.entries()) {
      if (peerId !== fromPeerId && !peer.destroyed) {
        try {
          const senders = peer._pc?.getSenders() || [];
          const existingSender = senders.find(
            (s) => s.track?.id === incomingTrack.id
          );
          if (existingSender) {
            continue;
          }

          const kindSender = senders.find(
            (s) => s.track?.kind === incomingTrack.kind && s.track?.id !== incomingTrack.id
          );
          if (kindSender && incomingTrack.kind === "audio") {
            kindSender.replaceTrack(incomingTrack);
          } else {
            peer.addTrack(incomingTrack, incomingStream);
          }
        } catch (err) {
          console.warn(`[SFU Host] Error forwarding track to ${peerId}:`, err.message);
        }
      }
    }
  }

  cleanupForwardedTracksOfPeer(fromPeerId) {
    const tracks = this._forwardedTracks.get(fromPeerId);
    if (tracks) {
      for (const { track, stream } of tracks) {
        for (const [peerId, peer] of this.peers.entries()) {
          if (peerId !== fromPeerId && !peer.destroyed) {
            try {
              peer.removeTrack(track, stream);
            } catch (err) {
              console.warn(`[SFU Host] Error removing forwarded track from ${peerId}:`, err.message);
            }
          }
        }
      }
      this._forwardedTracks.delete(fromPeerId);
    }
  }

  destroy() {
    this._forwardedTracks.clear();
    this._pendingSfuStreams.clear();
    this.voiceMembers = [];
  }
}
