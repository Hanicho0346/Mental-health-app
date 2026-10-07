/**
 * VideoCallModal — real-time video call UI using Socket.IO WebRTC signaling.
 * Uses react-native-webrtc for actual camera/mic streams.
 *
 * Install: npx expo install react-native-webrtc
 * (requires expo-dev-client / bare workflow build)
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather, MaterialIcons } from "@expo/vector-icons";
import { getSocket } from "@/lib/socket";

// Lazy-import so the app doesn't crash if react-native-webrtc isn't installed yet
let RTCPeerConnection: any;
let RTCIceCandidate: any;
let RTCSessionDescription: any;
let mediaDevices: any;
let RTCView: any;

try {
  const webrtc = require("react-native-webrtc");
  RTCPeerConnection = webrtc.RTCPeerConnection;
  RTCIceCandidate = webrtc.RTCIceCandidate;
  RTCSessionDescription = webrtc.RTCSessionDescription;
  mediaDevices = webrtc.mediaDevices;
  RTCView = webrtc.RTCView;
} catch {
  // react-native-webrtc not installed — video will show placeholder
}

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

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
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const signalTargetRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    localStream?.getTracks?.().forEach((t: any) => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    pcRef.current?.close();
    pcRef.current = null;
    signalTargetRef.current = null;
  }, [localStream]);

  // Start local media + create offer (caller side)
  const startWebRTC = useCallback(
    async (targetId: string, isInitiator: boolean) => {
      if (!RTCPeerConnection || !mediaDevices) return;
      signalTargetRef.current = targetId;

      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: "user" },
      });
      setLocalStream(stream);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));

      pc.ontrack = (e: any) => {
        if (e.streams?.[0]) setRemoteStream(e.streams[0]);
      };

      pc.onicecandidate = (e: any) => {
        if (e.candidate) {
          getSocket()?.emit("webrtc-signal", {
            to: targetId,
            signal: { type: "candidate", candidate: e.candidate },
          });
        }
      };

      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        getSocket()?.emit("webrtc-signal", {
          to: targetId,
          signal: { type: "offer", sdp: offer },
        });
      }
    },
    []
  );

  // Handle incoming WebRTC signals
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
      if (!RTCPeerConnection) return;
      const target = signalTargetRef.current;
      if (target && from !== target) return;

      let pc = pcRef.current;

      if (signal.type === "offer") {
        if (!pc) {
          // Answerer side — create PC on first offer
          const stream = await mediaDevices?.getUserMedia({
            audio: true,
            video: { facingMode: "user" },
          });
          if (stream) {
            setLocalStream(stream);
            pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            pcRef.current = pc;
            signalTargetRef.current = from;
            stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));
            pc.ontrack = (e: any) => {
              if (e.streams?.[0]) setRemoteStream(e.streams[0]);
            };
            pc.onicecandidate = (e: any) => {
              if (e.candidate) {
                socket.emit("webrtc-signal", {
                  to: from,
                  signal: { type: "candidate", candidate: e.candidate },
                });
              }
            };
          }
        }
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc-signal", {
          to: from,
          signal: { type: "answer", sdp: answer },
        });
      } else if (signal.type === "answer" && pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } else if (signal.type === "candidate" && pc) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    };

    socket.on("webrtc-signal", onSignal);
    return () => {
      socket.off("webrtc-signal", onSignal);
    };
  }, []);

  // When call becomes active, start WebRTC
  useEffect(() => {
    if (callState === "incall") {
      const target = incomingCaller ?? peerId;
      if (target) {
        const isInitiator = !incomingCaller; // caller creates offer
        void startWebRTC(target, isInitiator);
      }
    } else if (callState === "idle") {
      cleanup();
    }
  }, [callState]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = () => {
    localStream?.getAudioTracks?.().forEach((t: any) => {
      t.enabled = !t.enabled;
    });
    setMuted((m) => !m);
  };

  const toggleCam = () => {
    localStream?.getVideoTracks?.().forEach((t: any) => {
      t.enabled = !t.enabled;
    });
    setCamOff((c) => !c);
  };

  const webrtcAvailable = Boolean(RTCView);

  return (
    <>
      {/* Incoming call */}
      <Modal
        visible={callState === "ringing"}
        animationType="slide"
        transparent
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.title}>Incoming Video Call</Text>
            <Text style={s.name}>
              {peerName || "Unknown"}
            </Text>
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

      {/* Calling / In-call */}
      <Modal
        visible={callState === "incall" || callState === "calling"}
        animationType="fade"
        transparent={false}
        statusBarTranslucent
      >
        <View style={s.fullScreen}>
          {/* Remote video */}
          {webrtcAvailable && remoteStream ? (
            <RTCView
              streamURL={remoteStream.toURL()}
              style={StyleSheet.absoluteFill}
              objectFit="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, s.noVideo]}>
              {callState === "calling" ? (
                <>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={s.callingText}>Calling {peerName}…</Text>
                </>
              ) : (
                <>
                  <Feather name="video-off" size={48} color="#9ca3af" />
                  <Text style={{ color: "#9ca3af", marginTop: 12 }}>
                    {webrtcAvailable
                      ? "Waiting for video…"
                      : "Install react-native-webrtc for video"}
                  </Text>
                </>
              )}
            </View>
          )}

          {/* Local video (PiP) */}
          {webrtcAvailable && localStream && !camOff && (
            <RTCView
              streamURL={localStream.toURL()}
              style={s.localVideo}
              objectFit="cover"
              zOrder={1}
            />
          )}

          {/* Controls */}
          <View style={s.controls}>
            <TouchableOpacity style={s.controlBtn} onPress={toggleMute}>
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
            <TouchableOpacity style={s.controlBtn} onPress={toggleCam}>
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
  fullScreen: { flex: 1, backgroundColor: "#000" },
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
  localVideo: {
    position: "absolute",
    top: 60,
    right: 16,
    width: 100,
    height: 140,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff",
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
  },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  endBtn: { backgroundColor: "#ef4444", width: 68, height: 68, borderRadius: 34 },
});
