/**
 * WebRtcPeerWrapper.js
 * Native RTCPeerConnection wrapper implementing W3C Perfect Negotiation,
 * ICE batching, and LAN mDNS candidate rewriting.
 */

export function createNativePeer({
  localPeerId,
  remotePeerId,
  initiator,
  iceServers,
  isLan = false,
  lanPeerIPs,
  onRemoteVideoUpdate,
}) {
  const pc = new RTCPeerConnection({ iceServers });
  const listeners = {};
  let destroyed = false;
  let makingOffer = false;
  let ignoreOffer = false;
  let isSettingRemoteAnswerPending = false;
  let isRemoteDescriptionSet = false;
  let remoteCandidateQueue = [];
  let hasConnected = false;
  let signalQueue = Promise.resolve();
  let negotiationAllowed = Boolean(initiator);
  let skippedNegotiation = false;

  // Deterministic politeness: peer with higher lexicographical ID is polite and yields on offer collisions
  const isPolite = localPeerId ? localPeerId > remotePeerId : !initiator;

  const emit = (event, ...args) => {
    if (!listeners[event]) return;
    for (const handler of listeners[event]) {
      try {
        handler(...args);
      } catch (e) {
        console.error(`[WebRTC peer] Error in '${event}' handler:`, e);
      }
    }
  };

  const wrapper = {
    _pc: pc,
    get destroyed() {
      return destroyed;
    },

    on(event, handler) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
      return wrapper;
    },

    removeAllListeners() {
      for (const key of Object.keys(listeners)) {
        listeners[key] = [];
      }
    },

    signal(data) {
      if (destroyed || !data) return;
      signalQueue = signalQueue
        .then(async () => {
          if (destroyed) return;
          await handleSignal(data);
        })
        .catch((err) => {
          console.error(
            `[WebRTC] signal() processing error from ${remotePeerId}:`,
            err.message,
          );
        });
    },

    _rewriteRemoteSdp(sdpObj) {
      if (!sdpObj || !sdpObj.sdp) return sdpObj;
      const ips = lanPeerIPs?.get(remotePeerId) || [];
      if (ips.length === 0) return sdpObj;

      let newSdp = sdpObj.sdp;
      const mdnsRegex = /[a-zA-Z0-9-]+\.local/gi;
      if (mdnsRegex.test(newSdp)) {
        newSdp = newSdp.replace(mdnsRegex, ips[0]);
        console.log(
          `[WebRTC LAN SDP Rewriter] Swapped mDNS hostnames in remote SDP with IP: ${ips[0]} for peer ${remotePeerId}`,
        );
      }
      return { type: sdpObj.type, sdp: newSdp };
    },

    _rewriteRemoteCandidate(candObj) {
      if (!candObj) return [];
      let candidateStr = "";
      let sdpMid = candObj.sdpMid ?? undefined;
      let sdpMLineIndex = candObj.sdpMLineIndex ?? undefined;
      let usernameFragment = candObj.usernameFragment ?? undefined;

      if (typeof candObj === "string") {
        candidateStr = candObj;
      } else if (typeof candObj.candidate === "string") {
        candidateStr = candObj.candidate;
      } else if (candObj.candidate && typeof candObj.candidate.candidate === "string") {
        candidateStr = candObj.candidate.candidate;
        sdpMid = candObj.candidate.sdpMid ?? sdpMid;
        sdpMLineIndex = candObj.candidate.sdpMLineIndex ?? sdpMLineIndex;
      }

      if (!candidateStr) {
        return [candObj];
      }

      const baseCandidate = {
        candidate: candidateStr,
        sdpMid,
        sdpMLineIndex,
        usernameFragment,
      };

      const ips = lanPeerIPs?.get(remotePeerId) || [];
      const mdnsRegex = /[a-zA-Z0-9-]+\.local/gi;

      if (!mdnsRegex.test(candidateStr)) {
        return [baseCandidate];
      }

      const targetIPs = [...new Set([...ips, "127.0.0.1"])];
      const results = [baseCandidate];
      for (const ip of targetIPs) {
        const rewrittenStr = candidateStr.replace(mdnsRegex, ip);
        results.push({
          ...baseCandidate,
          candidate: rewrittenStr,
        });
      }
      return results;
    },

    addTrack(track, stream) {
      if (destroyed || !track) return null;
      try {
        const senders = pc.getSenders();
        const alreadyExists = senders.some((s) => s.track === track);
        if (alreadyExists) return null;
        return pc.addTrack(track, stream);
      } catch (err) {
        console.warn(
          `[WebRTC] addTrack error for ${remotePeerId}:`,
          err.message,
        );
        return null;
      }
    },

    removeTrack(track, stream) {
      if (destroyed) return;
      try {
        const senders = pc.getSenders();
        const sender = senders.find(
          (s) =>
            s.track === track ||
            (track && s.track?.id === track.id) ||
            (track === "video" && s.track?.kind === "video"),
        );
        if (sender) pc.removeTrack(sender);
      } catch (err) {
        console.warn(
          `[WebRTC] removeTrack error for ${remotePeerId}:`,
          err.message,
        );
      }
    },

    replaceTrack(oldTrack, newTrack, stream) {
      if (destroyed) return;
      try {
        const senders = pc.getSenders();
        const sender = senders.find((s) => s.track === oldTrack);
        if (sender) sender.replaceTrack(newTrack);
      } catch (err) {
        console.warn(
          `[WebRTC] replaceTrack error for ${remotePeerId}:`,
          err.message,
        );
      }
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        pc.close();
      } catch {}
    },
  };

  // Bind the SDP transform method onto the wrapper for use in signal()
  wrapper._transformSdp = (sessionDesc) => {
    if (!sessionDesc?.sdp) return sessionDesc;
    let sdp = sessionDesc.sdp;
    const isGame = Boolean(wrapper.isGameMode);
    const targetBitrate = isGame ? 192000 : (isLan ? 128000 : 64000);
    const targetLabel = isGame ? "GAMING STEREO" : (isLan ? "LAN" : "WAN");
    const stereoParams = isGame ? "stereo=1;sprop-stereo=1" : "stereo=0";

    const opusMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
    if (opusMatch) {
      const pt = opusMatch[1];
      const fmtpRegex = new RegExp(`a=fmtp:${pt}\\s+(.*)`, "g");
      if (sdp.match(fmtpRegex)) {
        sdp = sdp.replace(
          fmtpRegex,
          `a=fmtp:${pt} $1;usedtx=0;maxaveragebitrate=${targetBitrate};${stereoParams}`,
        );
      } else {
        const rtpmapRegex = new RegExp(
          `(a=rtpmap:${pt}\\s+opus/48000(?:/2)?)`,
          "gi",
        );
        sdp = sdp.replace(
          rtpmapRegex,
          `$1\r\na=fmtp:${pt} usedtx=0;maxaveragebitrate=${targetBitrate};${stereoParams}`,
        );
      }
      console.log(
        `[WebRTC SDP] Opus bitrate set to ${targetBitrate}bps (${targetLabel} mode, DTX=0) for ${remotePeerId}`,
      );
    }
    return new RTCSessionDescription({ type: sessionDesc.type, sdp });
  };

  // — ICE candidate gathering with debounced batching —
  let iceCandidateQueue = [];
  let iceBatchTimer = null;

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      const candObj = candidate.toJSON
        ? candidate.toJSON()
        : {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            usernameFragment: candidate.usernameFragment,
          };
      iceCandidateQueue.push(candObj);
      if (!iceBatchTimer) {
        iceBatchTimer = setTimeout(() => {
          if (iceCandidateQueue.length > 0) {
            emit("signal", {
              type: "ice-batch",
              candidates: [...iceCandidateQueue],
            });
            iceCandidateQueue = [];
          }
          iceBatchTimer = null;
        }, 80);
      }
    }
  };

  let gatheringTimeout = null;
  pc.onicegatheringstatechange = () => {
    console.log(
      `[WebRTC] ICE gathering state with ${remotePeerId}: ${pc.iceGatheringState}`,
    );
    if (pc.iceGatheringState === "gathering" && !gatheringTimeout) {
      gatheringTimeout = setTimeout(() => {
        gatheringTimeout = null;
        if (pc.iceGatheringState === "gathering") {
          console.warn(
            `[WebRTC] ICE gathering timeout (10s) for ${remotePeerId}. Proceeding with available candidates.`,
          );
          emit("signal", { candidate: null });
        }
      }, 10000);
    } else if (pc.iceGatheringState === "complete") {
      if (gatheringTimeout) {
        clearTimeout(gatheringTimeout);
        gatheringTimeout = null;
      }
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(
      `[WebRTC] ICE connection state with ${remotePeerId}: ${pc.iceConnectionState}`,
    );
    if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
      negotiationAllowed = true;
    }
    if (pc.iceConnectionState === "failed") {
      console.warn(
        `[WebRTC] ICE failed for ${remotePeerId}, triggering restart...`,
      );
      try {
        pc.restartIce();
      } catch {}
    } else if (pc.iceConnectionState === "disconnected") {
      console.warn(`[WebRTC] ICE disconnected for ${remotePeerId}`);
    }
  };

  // — Connection state —
  pc.onconnectionstatechange = () => {
    console.log(
      `[WebRTC] Connection state with ${remotePeerId}: ${pc.connectionState}`,
    );
    if (pc.connectionState === "connected") {
      negotiationAllowed = true;
      if (!hasConnected) {
        hasConnected = true;
        emit("connect");
      }
      const hasUnnegotiatedTracks = pc.getTransceivers().some(
        (t) => t.mid === null && t.sender.track,
      );
      if (skippedNegotiation || hasUnnegotiatedTracks) {
        console.log(`[WebRTC] Renegociacion diferida ejecutada al conectar con ${remotePeerId}`);
        skippedNegotiation = false;
        queueMicrotask(() => {
          makeOffer();
        });
      }
    } else if (
      pc.connectionState === "failed" ||
      pc.connectionState === "closed"
    ) {
      if (!destroyed) {
        emit("close");
      }
    }
  };

  // — Remote tracks / streams —
  pc.ontrack = ({ track, streams }) => {
    const allReceiverTracks = pc
      .getReceivers()
      .map((r) => r.track)
      .filter(Boolean);
    const remoteStream = streams[0] || new MediaStream(allReceiverTracks);

    const notifyVideoUpdate = (targetStream) => {
      if (track.kind === "video") {
        onRemoteVideoUpdate?.(remotePeerId, targetStream || null);
        window.dispatchEvent(
          new CustomEvent("peer-video-update", {
            detail: { peerId: remotePeerId, stream: targetStream || null },
          }),
        );
      }
    };

    track.onunmute = () => {
      console.log(
        `[WebRTC] Track unmuted from ${remotePeerId}: ${track.kind}`,
      );
      notifyVideoUpdate(remoteStream);
      emit("track-unmuted", track, remoteStream);
    };

    track.onended = () => {
      console.log(
        `[WebRTC] Track ended from ${remotePeerId}: ${track.kind}`,
      );
      notifyVideoUpdate(null);
      emit("track-ended", track, remoteStream);
    };

    if (track.kind === "video") {
      notifyVideoUpdate(remoteStream);
    }
    emit("track", track, remoteStream);
    emit("stream", remoteStream);
  };

  async function handleSignal(data) {
    if (destroyed || !data) return;

    if (data.type === "offer") {
      const offerCollision = makingOffer || pc.signalingState !== "stable";
      ignoreOffer = !isPolite && offerCollision;

      if (ignoreOffer) {
        console.warn(`[WebRTC] Offer collision with ${remotePeerId} - ignoring as impolite peer`);
        return;
      }

      if (offerCollision && pc.signalingState !== "stable") {
        console.log(`[WebRTC] Offer collision with ${remotePeerId} - applying rollback as polite peer`);
        try {
          await pc.setLocalDescription({ type: "rollback" });
        } catch (e) {
          // Benign rollback error if state already rolled back
        }
      }

      isRemoteDescriptionSet = false;
      const remoteSdp = wrapper._rewriteRemoteSdp(data);
      await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));
      isRemoteDescriptionSet = true;

      while (remoteCandidateQueue.length > 0) {
        const cand = remoteCandidateQueue.shift();
        await pc.addIceCandidate(cand).catch(() => {});
      }

      if (pc.signalingState !== "have-remote-offer") {
        console.warn(
          `[WebRTC] Unexpected signaling state (${pc.signalingState}) after setRemoteDescription from ${remotePeerId}`,
        );
        return;
      }

      const answer = await pc.createAnswer();
      const sdp = wrapper._transformSdp(answer);
      await pc.setLocalDescription(sdp);

      const localDesc = {
        type: pc.localDescription.type,
        sdp: pc.localDescription.sdp,
      };
      emit("signal", localDesc);
    } else if (data.type === "answer") {
      if (pc.signalingState !== "have-local-offer") {
        console.warn(
          `[WebRTC] Received answer in unexpected state (${pc.signalingState}) from ${remotePeerId}`,
        );
        return;
      }
      isSettingRemoteAnswerPending = true;
      isRemoteDescriptionSet = false;
      const remoteSdp = wrapper._rewriteRemoteSdp(data);
      await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));
      isSettingRemoteAnswerPending = false;
      isRemoteDescriptionSet = true;

      while (remoteCandidateQueue.length > 0) {
        const cand = remoteCandidateQueue.shift();
        await pc.addIceCandidate(cand).catch(() => {});
      }
    } else if (data.type === "ice-batch" && Array.isArray(data.candidates)) {
      for (const cand of data.candidates) {
        if (!cand) continue;
        try {
          const candidates = wrapper._rewriteRemoteCandidate(cand);
          for (const c of candidates) {
            const rtcCand = new RTCIceCandidate(c);
            if (!isRemoteDescriptionSet) {
              remoteCandidateQueue.push(rtcCand);
            } else {
              await pc.addIceCandidate(rtcCand);
            }
          }
        } catch (e) {
          // Benign ICE candidate timing
        }
      }
    } else if (data.candidate) {
      try {
        const candidates = wrapper._rewriteRemoteCandidate(data);
        for (const cand of candidates) {
          const rtcCand = new RTCIceCandidate(cand);
          if (!isRemoteDescriptionSet) {
            remoteCandidateQueue.push(rtcCand);
          } else {
            await pc.addIceCandidate(rtcCand);
          }
        }
      } catch (e) {
        if (!e.message?.includes("ICE")) {
          console.warn(
            `[WebRTC] addIceCandidate error for ${remotePeerId}:`,
            e.message,
          );
        }
      }
    }
  }

  // — W3C Perfect Negotiation offer generator —
  async function makeOffer() {
    if (!negotiationAllowed) {
      skippedNegotiation = true;
      return;
    }
    if (makingOffer || pc.signalingState !== "stable") return;
    try {
      makingOffer = true;
      const rawOffer = await pc.createOffer();
      if (pc.signalingState !== "stable") return;
      const offer = wrapper._transformSdp(rawOffer);
      if (pc.signalingState !== "stable") return;
      await pc.setLocalDescription(offer);
      const localDesc = {
        type: pc.localDescription.type,
        sdp: pc.localDescription.sdp,
      };
      emit("signal", localDesc);
    } catch (err) {
      if (
        err.message?.includes("wrong state") ||
        err.message?.includes("have-remote-offer")
      ) {
        console.warn(
          `[WebRTC] Negotiation glare absorbed gracefully for ${remotePeerId}: ${err.message}`,
        );
      } else {
        console.error(
          `[WebRTC] onnegotiationneeded offer error for ${remotePeerId}:`,
          err.message,
        );
        emit("error", err);
      }
    } finally {
      makingOffer = false;
    }
  }

  pc.onnegotiationneeded = () => {
    makeOffer();
  };

  return wrapper;
}
