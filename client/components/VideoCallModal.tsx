/**
 * VideoCallModal — fast, resilient real-time video & audio call UI with WebRTC signaling.
 * Supports Web browsers (Chrome, Edge, Safari, Firefox) and Native react-native-webrtc.
 * Features automated camera-in-use fallbacks (vital for multi-tab testing on Windows).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather, MaterialIcons } from "@expo/vector-icons";
import { getSocket } from "@/lib/socket";

// Dynamically resolve WebRTC primitives for Web vs Native
let RTCPeerConnection: any;
let RTCIceCandidate: any;
let RTCSessionDescription: any;
let mediaDevices: any;
let RTCView: any;

if (Platform.OS === "web") {
  if (typeof window !== "undefined") {
    RTCPeerConnection =
      window.RTCPeerConnection || (window as any).webkitRTCPeerConnection;
    RTCIceCandidate = window.RTCIceCandidate;
    RTCSessionDescription = window.RTCSessionDescription;
    mediaDevices = window.navigator?.mediaDevices;
  }
} else {
  try {
    const webrtc = require("react-native-webrtc");
    RTCPeerConnection = webrtc.RTCPeerConnection;
    RTCIceCandidate = webrtc.RTCIceCandidate;
    RTCSessionDescription = webrtc.RTCSessionDescription;
    mediaDevices = webrtc.mediaDevices;
    RTCView = webrtc.RTCView;
  } catch {
    // react-native-webrtc not installed on native
  }
}

// Fast multi-region STUN configuration
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
  iceCandidatePoolSize: 10,
};

export type CallState = "idle" | "calling" | "ringing" | "incall";

interface Props {
  callState: CallState;
  peerId: string | null;
  peerName: string;
  incomingCaller: string | null;
  callRoomId: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
}

// Generates a mock canvas video track if hardware webcam is busy (e.g., Windows multi-tab testing)
function createFallbackCanvasStream(label: string = "User"): any {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    let hue = 210;
    const render = () => {
      ctx.fillStyle = `hsl(${hue}, 30%, 15%)`;
      ctx.fillRect(0, 0, 640, 480);

      // Avatar circle
      ctx.fillStyle = `hsl(${hue}, 70%, 45%)`;
      ctx.beginPath();
      ctx.arc(320, 200, 70, 0, Math.PI * 2);
      ctx.fill();

      // Avatar body
      ctx.beginPath();
      ctx.arc(320, 380, 120, 0, Math.PI);
      ctx.fill();

      // Label text
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, 320, 320);
    };

    render();
    const interval = setInterval(render, 500);

    const stream = (canvas as any).captureStream
      ? (canvas as any).captureStream(10)
      : null;

    if (stream) {
      stream.__cleanupCanvas = () => clearInterval(interval);
    }
    return stream;
  } catch (e) {
    console.warn("[WebRTC] Fallback canvas creation failed:", e);
    return null;
  }
}

function WebVideoView({
  stream,
  mirror = false,
  muted = false,
}: {
  stream: any;
  mirror?: boolean;
  muted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream) {
      el.srcObject = stream;
      el.play().catch(() => {
        if (el) {
          el.muted = true;
          el.play().catch(() => {});
        }
      });
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transform: mirror ? "scaleX(-1)" : "none",
      }}
    />
  );
}

export default function VideoCallModal({
  callState,
  peerId,
  peerName,
  incomingCaller,
  callRoomId,
  onAccept,
  onDecline,
  onEnd,
}: Props) {
  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [connStatus, setConnStatus] = useState<string>("Connecting…");
  const targetPeerIdRef = useRef<string | null>(null);
  const iceCandidatesQueue = useRef<any[]>([]);

  // Acquires local media with multi-tier fallback for webcams in use
  const getLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!mediaDevices && Platform.OS === "web") {
      console.warn("[WebRTC] mediaDevices not supported in this browser context");
      return null;
    }

    let stream: any = null;

    // 1. Try real camera + mic
    try {
      const constraints =
        Platform.OS === "web"
          ? { audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 } } }
          : { audio: true, video: { facingMode: "user" } };
      stream = await mediaDevices.getUserMedia(constraints);
      console.log("[WebRTC] Got camera + mic stream");
    } catch (camErr) {
      console.warn("[WebRTC] Standard getUserMedia failed, attempting fallback:", camErr);

      // 2. Try basic audio + video
      try {
        stream = await mediaDevices.getUserMedia({ audio: true, video: true });
        console.log("[WebRTC] Got basic video stream");
      } catch (basicErr) {
        console.warn("[WebRTC] Basic video failed, falling back to audio + canvas avatar:", basicErr);

        // 3. Camera busy or denied — acquire audio and synthetic video track so WebRTC connects
        try {
          const audioStream = await mediaDevices.getUserMedia({ audio: true, video: false });
          const canvasStream = createFallbackCanvasStream(peerName || "Me");
          if (canvasStream && typeof window !== "undefined" && (window as any).MediaStream) {
            const tracks = [
              ...audioStream.getAudioTracks(),
              ...canvasStream.getVideoTracks(),
            ];
            stream = new (window as any).MediaStream(tracks);
            console.log("[WebRTC] Created composite audio + canvas stream");
          } else {
            stream = audioStream;
          }
        } catch (audioErr) {
          console.warn("[WebRTC] Audio acquisition failed:", audioErr);
          // 4. Last resort: canvas only
          stream = createFallbackCanvasStream(peerName || "Me");
        }
      }
    }

    if (stream) {
      localStreamRef.current = stream;
      setLocalStream(stream);
    }
    return stream;
  }, [peerName]);

  const cleanup = useCallback(() => {
    console.log("[WebRTC] Cleaning up WebRTC call session");
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks?.().forEach((t: any) => t.stop());
        if (localStreamRef.current.__cleanupCanvas) {
          localStreamRef.current.__cleanupCanvas();
        }
      } catch {}
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);

    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }

    targetPeerIdRef.current = null;
    iceCandidatesQueue.current = [];
    setConnStatus("Connecting…");
  }, []);

  // Flush queued candidates
  const processQueuedCandidates = useCallback(async (pc: any) => {
    while (iceCandidatesQueue.current.length > 0) {
      const cand = iceCandidatesQueue.current.shift();
      try {
        await pc.addIceCandidate(cand);
      } catch (err) {
        console.warn("[WebRTC] Queued ICE candidate failed:", err);
      }
    }
  }, []);

  // Creates and sets up the RTCPeerConnection instance
  const createPeerConnection = useCallback(
    (targetId: string, stream: any) => {
      if (pcRef.current) return pcRef.current;
      if (!RTCPeerConnection) return null;

      console.log("[WebRTC] Initializing RTCPeerConnection for target:", targetId);
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      targetPeerIdRef.current = targetId;

      // Add local tracks
      if (stream?.getTracks) {
        stream.getTracks().forEach((track: any) => {
          try {
            if (pc.addTrack) {
              pc.addTrack(track, stream);
            } else if (pc.addStream) {
              pc.addStream(stream);
            }
          } catch (e) {
            console.warn("[WebRTC] Error adding local track:", e);
          }
        });
      }

      // Handle remote incoming tracks
      pc.ontrack = (event: any) => {
        console.log("[WebRTC] ontrack received:", event.track?.kind);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          setConnStatus("Connected");
        } else if (event.track) {
          setRemoteStream((prev: any) => {
            let ms = prev;
            if (!ms) {
              ms =
                typeof window !== "undefined" && (window as any).MediaStream
                  ? new (window as any).MediaStream()
                  : new mediaDevices.MediaStream();
            }
            if (ms?.addTrack) ms.addTrack(event.track);
            setConnStatus("Connected");
            return typeof window !== "undefined" && (window as any).MediaStream
              ? new (window as any).MediaStream(ms.getTracks())
              : ms;
          });
        }
      };

      // Candidate exchange
      pc.onicecandidate = (e: any) => {
        if (e.candidate) {
          const candJson = e.candidate.toJSON
            ? e.candidate.toJSON()
            : {
                candidate: e.candidate.candidate,
                sdpMid: e.candidate.sdpMid,
                sdpMLineIndex: e.candidate.sdpMLineIndex,
              };
          getSocket()?.emit("webrtc-signal", {
            to: targetId,
            signal: { type: "candidate", candidate: candJson },
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log("[WebRTC] ICE Connection State:", state);
        if (state === "connected" || state === "completed") {
          setConnStatus("Connected");
        } else if (state === "disconnected" || state === "failed") {
          setConnStatus("Reconnecting…");
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log("[WebRTC] Peer Connection State:", state);
        if (state === "connected") {
          setConnStatus("Connected");
        }
      };

      return pc;
    },
    []
  );

  // Starts call negotiation
  const startCallWebRTC = useCallback(
    async (targetId: string, isInitiator: boolean) => {
      console.log(`[WebRTC] startCallWebRTC target=${targetId} isInitiator=${isInitiator}`);
      targetPeerIdRef.current = targetId;

      const stream = await getLocalMedia();
      const pc = createPeerConnection(targetId, stream);
      if (!pc) return;

      if (isInitiator) {
        try {
          console.log("[WebRTC] Creating offer…");
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          const sdpStr = typeof offer.sdp === "string" ? offer.sdp : (offer as any).sdp?.sdp;

          console.log("[WebRTC] Emitting offer signal to", targetId);
          getSocket()?.emit("webrtc-signal", {
            to: targetId,
            signal: { type: "offer", sdp: sdpStr },
          });
        } catch (err) {
          console.error("[WebRTC] Offer creation error:", err);
        }
      }
    },
    [getLocalMedia, createPeerConnection]
  );

  // Socket signaling listener for incoming offer, answer, candidates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onSignal = async ({
      from,
      signal,
    }: {
      from: string;
      signal: any;
    }) => {
      if (!RTCPeerConnection || !signal) return;
      console.log("[WebRTC] Received signal:", signal.type, "from:", from);

      try {
        if (signal.type === "offer") {
          targetPeerIdRef.current = from;
          const stream = await getLocalMedia();
          const pc = createPeerConnection(from, stream);
          if (!pc) return;

          const sdpStr = typeof signal.sdp === "string" ? signal.sdp : signal.sdp?.sdp;
          if (!sdpStr) return;

          const desc = RTCSessionDescription
            ? new RTCSessionDescription({ type: "offer", sdp: sdpStr })
            : { type: "offer", sdp: sdpStr };

          await pc.setRemoteDescription(desc);
          console.log("[WebRTC] Remote offer applied, processing queued candidates");
          await processQueuedCandidates(pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          const answerSdpStr =
            typeof answer.sdp === "string" ? answer.sdp : (answer as any).sdp?.sdp;

          console.log("[WebRTC] Emitting answer signal to", from);
          socket.emit("webrtc-signal", {
            to: from,
            signal: { type: "answer", sdp: answerSdpStr },
          });
        } else if (signal.type === "answer") {
          const pc = pcRef.current;
          if (pc) {
            const sdpStr = typeof signal.sdp === "string" ? signal.sdp : signal.sdp?.sdp;
            if (!sdpStr) return;

            const desc = RTCSessionDescription
              ? new RTCSessionDescription({ type: "answer", sdp: sdpStr })
              : { type: "answer", sdp: sdpStr };

            await pc.setRemoteDescription(desc);
            console.log("[WebRTC] Remote answer applied, processing queued candidates");
            await processQueuedCandidates(pc);
          }
        } else if (signal.type === "candidate") {
          const pc = pcRef.current;
          const rawCand = signal.candidate;
          if (!rawCand) return;

          const candidateInit =
            typeof rawCand === "string"
              ? { candidate: rawCand }
              : {
                  candidate: rawCand.candidate,
                  sdpMid: rawCand.sdpMid,
                  sdpMLineIndex: rawCand.sdpMLineIndex,
                };

          const cand = RTCIceCandidate
            ? new RTCIceCandidate(candidateInit)
            : candidateInit;

          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(cand);
            } catch (err) {
              console.warn("[WebRTC] addIceCandidate error:", err);
            }
          } else {
            iceCandidatesQueue.current.push(cand);
          }
        }
      } catch (err) {
        console.error("[WebRTC] Signal handling error:", err);
      }
    };

    socket.on("webrtc-signal", onSignal);
    return () => {
      socket.off("webrtc-signal", onSignal);
    };
  }, [getLocalMedia, createPeerConnection, processQueuedCandidates]);

  // Handle callState transitions
  useEffect(() => {
    if (callState === "calling") {
      void getLocalMedia();
    } else if (callState === "incall") {
      const target = incomingCaller ?? peerId;
      if (target) {
        const isInitiator = !incomingCaller;
        void startCallWebRTC(target, isInitiator);
      }
    } else if (callState === "idle") {
      cleanup();
    }
  }, [callState, incomingCaller, peerId, getLocalMedia, startCallWebRTC, cleanup]);

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks?.().forEach((t: any) => {
      t.enabled = !t.enabled;
    });
    setMuted((m) => !m);
  };

  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks?.().forEach((t: any) => {
      t.enabled = !t.enabled;
    });
    setCamOff((c) => !c);
  };

  const webrtcAvailable =
    Platform.OS === "web"
      ? Boolean(RTCPeerConnection && (mediaDevices || typeof document !== "undefined"))
      : Boolean(RTCView);

  return (
    <>
      {/* Incoming call modal */}
      <Modal
        visible={callState === "ringing"}
        animationType="slide"
        transparent
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.title}>Incoming Video Call</Text>
            <Text style={s.name}>{peerName || "Unknown"}</Text>
            <View style={s.actionRow}>
              <TouchableOpacity
                style={[s.btn, { backgroundColor: "#ef4444" }]}
                onPress={onDecline}
              >
                <MaterialIcons name="call-end" size={28} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btn, { backgroundColor: "#22c55e" }]}
                onPress={onAccept}
              >
                <MaterialIcons name="videocam" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Calling / In-call full-screen modal */}
      <Modal
        visible={callState === "incall" || callState === "calling"}
        animationType="fade"
        transparent={false}
        statusBarTranslucent
      >
        <View style={s.fullScreen}>
          {/* Remote video */}
          {webrtcAvailable && remoteStream ? (
            Platform.OS === "web" ? (
              <WebVideoView stream={remoteStream} />
            ) : (
              <RTCView
                streamURL={
                  remoteStream.toURL ? remoteStream.toURL() : remoteStream
                }
                style={StyleSheet.absoluteFill}
                objectFit="cover"
              />
            )
          ) : (
            <View style={[StyleSheet.absoluteFill, s.noVideo]}>
              {callState === "calling" ? (
                <>
                  <ActivityIndicator size="large" color="#3B82F6" />
                  <Text style={s.callingText}>Calling {peerName}…</Text>
                </>
              ) : (
                <>
                  <ActivityIndicator size="large" color="#10B981" />
                  <Text style={{ color: "#E5E7EB", marginTop: 14, fontSize: 16 }}>
                    {connStatus}
                  </Text>
                </>
              )}
            </View>
          )}

          {/* Local video (Picture in Picture) */}
          {webrtcAvailable && localStream && !camOff && (
            <View style={s.localVideoContainer}>
              {Platform.OS === "web" ? (
                <WebVideoView stream={localStream} mirror muted />
              ) : (
                <RTCView
                  streamURL={
                    localStream.toURL ? localStream.toURL() : localStream
                  }
                  style={StyleSheet.absoluteFill}
                  objectFit="cover"
                  zOrder={1}
                />
              )}
            </View>
          )}

          {/* Controls */}
          <View style={s.controls}>
            <TouchableOpacity
              style={[s.controlBtn, muted && s.controlBtnActive]}
              onPress={toggleMute}
            >
              <Feather
                name={muted ? "mic-off" : "mic"}
                size={24}
                color="#fff"
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.controlBtn, s.endBtn]}
              onPress={onEnd}
            >
              <MaterialIcons name="call-end" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.controlBtn, camOff && s.controlBtnActive]}
              onPress={toggleCam}
            >
              <Feather
                name={camOff ? "video-off" : "video"}
                size={24}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    width: "85%",
  },
  title: { fontSize: 16, color: "#9ca3af", marginBottom: 8 },
  name: { fontSize: 28, fontWeight: "bold", color: "#fff", marginBottom: 36 },
  actionRow: { flexDirection: "row", gap: 40 },
  btn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  fullScreen: { flex: 1, backgroundColor: "#000", position: "relative" },
  noVideo: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111827",
  },
  callingText: {
    color: "#fff",
    fontSize: 20,
    marginTop: 16,
    fontWeight: "600",
  },
  localVideoContainer: {
    position: "absolute",
    top: 60,
    right: 16,
    width: 110,
    height: 155,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#1f2937",
    zIndex: 10,
  },
  controls: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
    zIndex: 10,
  },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  controlBtnActive: {
    backgroundColor: "#ef4444",
  },
  endBtn: { backgroundColor: "#ef4444", width: 68, height: 68, borderRadius: 34 },
});
