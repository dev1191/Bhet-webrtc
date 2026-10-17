import {
  type ClientMessage,
  type ErrorCode,
  type Role,
  type ServerMessage,
  parseServerMessage,
} from "@bhet/shared";
import { onUnmounted, ref, shallowRef } from "vue";

export interface UseWebRTCOptions {
  token: string;
  roomId?: string;
  wsBaseUrl?: string;
  iceServers?: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
}

export type CallStatus =
  | "initializing"
  | "connecting-signaling"
  | "waiting-for-peer"
  | "connected"
  | "peer-left"
  | "error"
  | "closed";

export type ConnectionQuality = "good" | "fair" | "poor" | "unknown";

export interface QualityMetrics {
  rttMs: number;
  packetLossPct: number;
  jitterMs: number;
}

export interface ChatMessage {
  id: string;
  sender: "you" | "peer";
  text: string;
  timestamp: number;
}

export function useWebRTC(options: UseWebRTCOptions) {
  const status = ref<CallStatus>("initializing");
  const role = ref<Role | null>(null);
  const peerPresent = ref(false);
  const errorMessage = ref<string | null>(null);
  const errorCode = ref<ErrorCode | null>(null);

  const isMuted = ref(false);
  const isCameraOff = ref(false);
  const isAudioOnly = ref(false);

  const localStream = shallowRef<MediaStream | null>(null);
  const remoteStream = shallowRef<MediaStream | null>(null);

  // DataChannel & Chat
  const chatMessages = ref<ChatMessage[]>([]);
  const isChatReady = ref(false);
  const pendingChatQueue: string[] = [];
  let dataChannel: RTCDataChannel | null = null;

  // Connection Quality Metrics
  const quality = ref<ConnectionQuality>("unknown");
  const qualityMetrics = ref<QualityMetrics>({ rttMs: 0, packetLossPct: 0, jitterMs: 0 });
  let statsInterval: ReturnType<typeof setInterval> | null = null;
  let prevPacketsLost = 0;
  let prevPacketsReceived = 0;

  let ws: WebSocket | null = null;
  let pc: RTCPeerConnection | null = null;

  // Perfect Negotiation State
  let polite = true;
  let makingOffer = false;
  let ignoreOffer = false;

  function sendSignaling(msg: ClientMessage) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function setupDataChannel(channel: RTCDataChannel) {
    dataChannel = channel;

    if (channel.readyState === "open") {
      isChatReady.value = true;
    }

    channel.onopen = () => {
      console.log("WebRTC DataChannel chat opened!");
      isChatReady.value = true;
      while (pendingChatQueue.length > 0) {
        const text = pendingChatQueue.shift();
        if (text) sendChatMessage(text);
      }
    };

    channel.onclose = () => {
      console.log("WebRTC DataChannel chat closed");
      isChatReady.value = false;
    };

    channel.onerror = (err) => {
      console.error("WebRTC DataChannel error:", err);
      isChatReady.value = false;
    };

    channel.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed && typeof parsed.text === "string") {
          chatMessages.value.push({
            id: parsed.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            sender: "peer",
            text: parsed.text,
            timestamp: parsed.timestamp ?? Date.now(),
          });
        }
      } catch {
        chatMessages.value.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sender: "peer",
          text: String(event.data),
          timestamp: Date.now(),
        });
      }
    };
  }

  function sendChatMessage(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;

    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender: "you",
      text: trimmed,
      timestamp: Date.now(),
    };

    if (!dataChannel || dataChannel.readyState !== "open") {
      console.warn("DataChannel not open yet (readyState:", dataChannel?.readyState, "). Queuing message.");
      pendingChatQueue.push(trimmed);
      chatMessages.value.push(msg);
      return true;
    }

    try {
      dataChannel.send(JSON.stringify(msg));
      chatMessages.value.push(msg);
      return true;
    } catch (err) {
      console.error("Error sending message via DataChannel:", err);
      return false;
    }
  }

  async function pollStats() {
    if (!pc || (pc.iceConnectionState !== "connected" && pc.iceConnectionState !== "completed")) {
      quality.value = "unknown";
      return;
    }

    try {
      const stats = await pc.getStats();
      let rtt = 0;
      let packetsLostDelta = 0;
      let jitter = 0;

      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          if (typeof report.currentRoundTripTime === "number") {
            rtt = Math.round(report.currentRoundTripTime * 1000);
          } else if (typeof report.roundTripTime === "number") {
            rtt = Math.round(report.roundTripTime * 1000);
          }
        }

        if (report.type === "inbound-rtp") {
          if (typeof report.jitter === "number") {
            jitter = Math.max(jitter, Math.round(report.jitter * 1000));
          }
          if (typeof report.packetsLost === "number" && typeof report.packetsReceived === "number") {
            const lostDelta = Math.max(0, report.packetsLost - prevPacketsLost);
            const recvDelta = Math.max(0, report.packetsReceived - prevPacketsReceived);
            prevPacketsLost = report.packetsLost;
            prevPacketsReceived = report.packetsReceived;
            if (recvDelta + lostDelta > 0) {
              packetsLostDelta = (lostDelta / (recvDelta + lostDelta)) * 100;
            }
          }
        }
      });

      qualityMetrics.value = {
        rttMs: rtt,
        packetLossPct: Math.round(packetsLostDelta * 10) / 10,
        jitterMs: jitter,
      };

      // Quality mapping thresholds (spec Section 10)
      if (rtt > 300 || packetsLostDelta >= 8 || jitter >= 60) {
        quality.value = "poor";
      } else if (rtt > 150 || packetsLostDelta >= 2 || jitter >= 30) {
        quality.value = "fair";
      } else {
        quality.value = "good";
      }
    } catch {
      // Ignore polling errors during connection establishment
    }
  }

  async function initMedia(): Promise<MediaStream | null> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStream.value = stream;
      return stream;
    } catch (err: unknown) {
      console.warn("Full camera+mic access failed, attempting audio-only:", err);
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStream.value = audioOnly;
        isCameraOff.value = true;
        return audioOnly;
      } catch (audioErr: unknown) {
        console.error("No media devices available:", audioErr);
        errorMessage.value = "Camera and microphone access denied or unavailable.";
        return null;
      }
    }
  }

  function createPeerConnection(stream: MediaStream | null, iceServers: RTCIceServer[] = []) {
    const config: RTCConfiguration = {
      iceServers: iceServers.length > 0
        ? iceServers
        : [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
      iceTransportPolicy: options.iceTransportPolicy ?? "all",
    };

    pc = new RTCPeerConnection(config);

    // Host creates data channel
    if (role.value === "host" || (!role.value && !polite)) {
      const channel = pc.createDataChannel("chat", { ordered: true });
      setupDataChannel(channel);
    }

    // Guest listens for data channel
    pc.ondatachannel = (event) => {
      if (event.channel.label === "chat") {
        setupDataChannel(event.channel);
      }
    };

    if (stream) {
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
    }

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        remoteStream.value = event.streams[0];
      } else {
        const stream = remoteStream.value ?? new MediaStream();
        stream.addTrack(event.track);
        remoteStream.value = stream;
      }
      status.value = "connected";
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && candidate.candidate) {
        sendSignaling({
          type: "ice",
          candidate: {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            usernameFragment: candidate.usernameFragment,
          },
        });
      }
    };

    let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

    pc.oniceconnectionstatechange = () => {
      if (!pc) return;
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        status.value = "connected";
        if (disconnectTimer) {
          clearTimeout(disconnectTimer);
          disconnectTimer = null;
        }
      } else if (pc.iceConnectionState === "failed") {
        console.warn("ICE connection failed; triggering restart...");
        pc.restartIce();
      } else if (pc.iceConnectionState === "disconnected") {
        if (!peerPresent.value) {
          status.value = "peer-left";
        } else if (!disconnectTimer) {
          disconnectTimer = setTimeout(() => {
            if (pc && pc.iceConnectionState === "disconnected") {
              console.warn("Prolonged ICE disconnect; triggering restart...");
              pc.restartIce();
            }
          }, 4000);
        }
      }
    };

    // Auto-restart on network reconnection
    window.addEventListener("online", handleOnline);

    // Perfect Negotiation pattern
    pc.onnegotiationneeded = async () => {
      if (!pc) return;
      if (!peerPresent.value) {
        console.log("Peer not yet present in room; deferring offer until peer connects.");
        return;
      }
      try {
        makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription?.sdp) {
          sendSignaling({
            type: "offer",
            sdp: pc.localDescription.sdp,
          });
        }
      } catch (err) {
        console.error("Negotiation needed error:", err);
      } finally {
        makingOffer = false;
      }
    };

    return pc;
  }

  async function handleServerMessage(message: ServerMessage) {
    switch (message.type) {
      case "joined":
        role.value = message.role;
        polite = message.role === "guest";
        peerPresent.value = message.peerPresent;
        status.value = message.peerPresent ? "connected" : "waiting-for-peer";

        // If host joins, ensure data channel is created
        if (message.role === "host" && pc && !dataChannel) {
          const channel = pc.createDataChannel("chat", { ordered: true });
          setupDataChannel(channel);
        }

        // If host joins second (peer is already present), host initiates offer immediately
        if (message.role === "host" && message.peerPresent && pc) {
          try {
            makingOffer = true;
            await pc.setLocalDescription();
            if (pc.localDescription?.sdp) {
              sendSignaling({ type: "offer", sdp: pc.localDescription.sdp });
            }
          } catch (err) {
            console.error("Error creating offer on host join:", err);
          } finally {
            makingOffer = false;
          }
        }
        break;

      case "peer-joined":
        peerPresent.value = true;
        status.value = "connected";

        // Ensure host has data channel
        if (role.value === "host" && pc && !dataChannel) {
          const channel = pc.createDataChannel("chat", { ordered: true });
          setupDataChannel(channel);
        }

        // Host initiates offer to newly joined peer
        if (!polite && pc) {
          try {
            makingOffer = true;
            await pc.setLocalDescription();
            if (pc.localDescription?.sdp) {
              sendSignaling({ type: "offer", sdp: pc.localDescription.sdp });
            }
          } catch (err) {
            console.error("Error creating offer on peer-joined:", err);
          } finally {
            makingOffer = false;
          }
        }
        break;

      case "peer-left":
        peerPresent.value = false;
        remoteStream.value = null;
        quality.value = "unknown";
        status.value = "peer-left";
        isChatReady.value = false;
        break;

      case "offer":
        if (!pc) return;
        try {
          const offerCollision = makingOffer || pc.signalingState !== "stable";
          ignoreOffer = !polite && offerCollision;
          if (ignoreOffer) {
            console.warn("Offer collision detected; ignoring offer as impolite peer.");
            return;
          }

          await pc.setRemoteDescription({ type: "offer", sdp: message.sdp });
          await pc.setLocalDescription();
          if (pc.localDescription?.sdp) {
            sendSignaling({
              type: "answer",
              sdp: pc.localDescription.sdp,
            });
          }
        } catch (err) {
          console.error("Error handling offer:", err);
        }
        break;

      case "answer":
        if (!pc) return;
        try {
          await pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
        } catch (err) {
          console.error("Error handling answer:", err);
        }
        break;

      case "ice":
        if (!pc) return;
        try {
          await pc.addIceCandidate(message.candidate);
        } catch (err) {
          if (!ignoreOffer) {
            console.error("Error adding received ICE candidate:", err);
          }
        }
        break;

      case "error":
        errorCode.value = message.code;
        errorMessage.value = message.message ?? `Signaling error: ${message.code}`;
        status.value = "error";
        break;
    }
  }

  function connectSignaling() {
    status.value = "connecting-signaling";

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const defaultWsUrl = `${protocol}//${host}/ws`;
    const wsUrl = `${options.wsBaseUrl ?? defaultWsUrl}?token=${encodeURIComponent(options.token)}`;

    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        const parsed = parseServerMessage(event.data);
        if (parsed) {
          handleServerMessage(parsed);
        }
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket signaling error:", err);
    };

    ws.onclose = (event) => {
      if (event.code === 4001 || event.code === 4002) {
        status.value = "error";
        if (event.code === 4002) {
          errorCode.value = "ROOM_FULL";
          errorMessage.value = "Room is full. Maximum 2 peers allowed.";
        }
      } else if (status.value !== "closed") {
        console.log("WebSocket closed with code", event.code);
      }
    };
  }

  async function start(customIceServers?: RTCIceServer[]) {
    const stream = await initMedia();
    createPeerConnection(stream, customIceServers ?? options.iceServers);
    connectSignaling();

    // Start quality metrics polling every 2 seconds
    if (!statsInterval) {
      statsInterval = setInterval(pollStats, 2000);
    }
  }

  function toggleAudio() {
    if (localStream.value) {
      const audioTrack = localStream.value.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        isMuted.value = !audioTrack.enabled;
      }
    }
  }

  function toggleVideo() {
    if (localStream.value) {
      const videoTrack = localStream.value.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        isCameraOff.value = !videoTrack.enabled;
      }
    }
  }

  async function toggleAudioOnly() {
    if (!localStream.value) return;

    isAudioOnly.value = !isAudioOnly.value;
    const videoTrack = localStream.value.getVideoTracks()[0];

    if (videoTrack) {
      videoTrack.enabled = !isAudioOnly.value;
      isCameraOff.value = isAudioOnly.value;
    }

    // Lower sender bitrate on poor networks or when audio-only is toggled
    if (pc) {
      const videoSender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (videoSender) {
        try {
          const params = videoSender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          if (isAudioOnly.value) {
            params.encodings[0]!.maxBitrate = 32000; // 32 kbps cap
          } else {
            delete params.encodings[0]!.maxBitrate;
          }
          await videoSender.setParameters(params);
        } catch (err) {
          console.warn("Could not set sender parameters:", err);
        }
      }
    }
  }

  function handleOnline() {
    if (pc && (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed")) {
      console.log("Browser network back online; restarting ICE...");
      pc.restartIce();
    }
  }

  function leave() {
    status.value = "closed";
    sendSignaling({ type: "leave" });

    window.removeEventListener("online", handleOnline);

    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }

    if (dataChannel) {
      dataChannel.close();
      dataChannel = null;
    }

    if (localStream.value) {
      for (const track of localStream.value.getTracks()) {
        track.stop();
      }
      localStream.value = null;
    }

    if (pc) {
      pc.close();
      pc = null;
    }

    if (ws) {
      ws.close(1000, "Left call");
      ws = null;
    }
  }

  onUnmounted(() => {
    leave();
  });

  return {
    status,
    role,
    peerPresent,
    errorMessage,
    errorCode,
    isMuted,
    isCameraOff,
    isAudioOnly,
    localStream,
    remoteStream,
    chatMessages,
    isChatReady,
    quality,
    qualityMetrics,
    start,
    toggleAudio,
    toggleVideo,
    toggleAudioOnly,
    sendChatMessage,
    leave,
  };
}
