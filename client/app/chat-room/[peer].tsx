import {
  apiLoadTimeline,
  apiUploadVoice,
  CHAT_SERVER,
  emitCallAccepted,
  emitCallDeclined,
  emitCallEnded,
  emitCallUser,
  emitSendMessage,
  emitSendVoice,
  emitSpSignal,
  getSocket,
} from '@/lib/chatService';
import { useChatStore, CallLog, ChatMessage } from '@/stores/chatStore';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  RTCView,
} from 'react-native-webrtc';
import { router, useLocalSearchParams } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── helpers ────────────────────────────────────────────────────────────────
function fmt(ts: string | Date): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
function fmtS(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m}m ${sec % 60}s` : `${sec}s`;
}

type RecState = 'idle' | 'recording' | 'recorded' | 'uploading';
type CallState = 'idle' | 'calling' | 'incoming' | 'in-call';


// ── VoicePlayer ──────────────────────────────────────────────────────────────
function VoicePlayer({ fileUrl, mine }: { fileUrl: string; mine: boolean }) {
  const [sound, setSound] = React.useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => { return () => { sound?.unloadAsync(); }; }, [sound]);

  async function togglePlay(): Promise<void> {
    if (loading) return;
    if (playing && sound) { await sound.pauseAsync(); setPlaying(false); return; }
    if (sound) { await sound.playAsync(); setPlaying(true); return; }
    setLoading(true);
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
      const { sound: ns } = await Audio.Sound.createAsync(
        { uri: fileUrl },
        { shouldPlay: true },
        (st) => { if ('didJustFinish' in st && st.didJustFinish) { setPlaying(false); ns.unloadAsync(); setSound(null); } }
      );
      setSound(ns); setPlaying(true);
    } catch { Alert.alert('Playback error', 'Could not play voice message.'); }
    finally { setLoading(false); }
  }

  const ic = mine ? 'rgba(255,255,255,0.9)' : '#2563eb';
  const bg = mine ? 'rgba(255,255,255,0.2)' : '#eff6ff';
  return (
    <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 }} onPress={() => void togglePlay()} activeOpacity={0.8}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: bg, justifyContent: 'center', alignItems: 'center' }}>
        {loading ? <ActivityIndicator size="small" color={ic} /> : <Feather name={playing ? 'pause' : 'play'} size={16} color={ic} />}
      </View>
      <Text style={{ fontSize: 13, color: mine ? 'rgba(255,255,255,0.85)' : '#2563eb', fontWeight: '600' }}>
        {playing ? 'Playing…' : 'Voice message'}
      </Text>
    </TouchableOpacity>
  );
}

export default function PeerChatScreen() {
  const { peer } = useLocalSearchParams<{ peer: string }>();
  const me = useChatStore((s) => s.me);
  const users = useChatStore((s) => s.users);
  const timeline = useChatStore((s) => s.timeline);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const appendCallLog = useChatStore((s) => s.appendCallLog);
  const setPeer = useChatStore((s) => s.setPeer);

  const [txt, setTxt] = useState('');
  const [recState, setRecState] = useState<RecState>('idle');
  const [recSec, setRecSec] = useState(0);
  const [recUri, setRecUri] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [callState, setCallState] = useState<CallState>('idle');
  const [callSec, setCallSec] = useState(0);
  const [muted, setMuted] = useState(false);
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);

  // WebRTC
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<any>(null);
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);

  const recRef = useRef<Audio.Recording | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartRef = useRef<number>(0);
  const listRef = useRef<FlatList>(null);

  const peerUser = users.find((u) => u.username === peer);

  // ── set active peer & load history ──────────────────────────────────────
  useEffect(() => {
    if (!me || !peer) return;
    setPeer(peer);
    void apiLoadTimeline(me.username, peer);
    return () => setPeer(null);
  }, [me, peer, setPeer]);

  // ── socket listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !me) return;

    const onIncoming = ({ from }: { from: string }) => {
      setIncomingFrom(from);
      setCallState('incoming');
    };
    const onAccepted = async () => {
      enterCall();
      // Caller creates and sends offer
      if (pcRef.current) {
        const offer = await pcRef.current.createOffer({});
        await pcRef.current.setLocalDescription(offer);
        emitSpSignal(peer ?? '', offer);
      }
    };
    const onDeclined = () => {
      setCallState('idle');
      Alert.alert('Call declined');
    };
    const onEnded = () => endCall(false);

    const onSpSignal = async ({ signal }: { signal: any }) => {
      if (!pcRef.current) return;
      if (signal.type === 'offer') {
        const stream = localStreamRef.current || await startLocalStream();
        if (!pcRef.current) {
          const pc = createPC();
          pcRef.current = pc;
          stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));
        }
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        emitSpSignal(peer ?? '', answer);
      } else if (signal.type === 'answer') {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.type === 'ice' && signal.candidate) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    };

    socket.on('incoming-call', onIncoming);
    socket.on('sp-signal', onSpSignal);
    socket.on('call-accepted', onAccepted);
    socket.on('call-declined', onDeclined);
    socket.on('call-ended', onEnded);

    return () => {
      socket.off('incoming-call', onIncoming);
      socket.off('sp-signal', onSpSignal);
      socket.off('call-accepted', onAccepted);
      socket.off('call-declined', onDeclined);
      socket.off('call-ended', onEnded);
    };
  }, [me]);

  // ── scroll to bottom on new messages ────────────────────────────────────
  useEffect(() => {
    if (timeline.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [timeline.length]);

  // ── text send ────────────────────────────────────────────────────────────
  function sendText(): void {
    if (!txt.trim() || !me || !peer) return;
    emitSendMessage(me.username, peer, txt.trim());
    setTxt('');
  }

  // ── voice recording ──────────────────────────────────────────────────────
  async function startRec(): Promise<void> {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert('Microphone permission denied'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recRef.current = recording;
      setRecState('recording');
      setRecSec(0);
      recTimerRef.current = setInterval(() => setRecSec((s) => s + 1), 1000);
    } catch { Alert.alert('Could not start recording'); }
  }

  async function stopRec(): Promise<void> {
    clearInterval(recTimerRef.current!);
    await recRef.current?.stopAndUnloadAsync();
    const uri = recRef.current?.getURI() ?? null;
    recRef.current = null;
    setRecUri(uri);
    setRecState('recorded');
  }

  function cancelRec(): void {
    clearInterval(recTimerRef.current!);
    void recRef.current?.stopAndUnloadAsync();
    recRef.current = null;
    setRecUri(null);
    setRecState('idle');
    setRecSec(0);
  }

  async function sendVoice(): Promise<void> {
    if (!recUri || !me || !peer) return;
    setRecState('uploading');
    setStatusMsg('Uploading voice…');
    try {
      const fileUrl = await apiUploadVoice(recUri);
      emitSendVoice(me.username, peer, fileUrl);
    } catch (e: unknown) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRecState('idle');
      setRecUri(null);
      setRecSec(0);
      setStatusMsg('');
    }
  }

  // ── call helpers ─────────────────────────────────────────────────────────
  // ── WebRTC helpers ─────────────────────────────────────────────────────────
  const TURN_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.relay.metered.ca:80' },
      {
        urls: 'turn:standard.relay.metered.ca:80',
        username: process.env.EXPO_PUBLIC_TURN_USERNAME ?? '',
        credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL ?? '',
      },
      {
        urls: 'turn:standard.relay.metered.ca:443',
        username: process.env.EXPO_PUBLIC_TURN_USERNAME ?? '',
        credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL ?? '',
      },
    ],
  };

  function createPC(): RTCPeerConnection {
    const pc = new RTCPeerConnection(TURN_SERVERS) as any;

    pc.addEventListener("icecandidate", (e: any) => {
      if (e.candidate) {
        emitSpSignal(peer ?? '', { type: 'ice', candidate: e.candidate });
      }
    });

    pc.addEventListener('track', (e: any) => {
      if (e.streams && e.streams[0]) {
        setRemoteStream(e.streams[0]);
      }
    });

    return pc;
  }

  async function startLocalStream(): Promise<any> {
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: 'user', width: 640, height: 480 },
    });
    setLocalStream(stream);
    localStreamRef.current = stream;
    return stream;
  }

  function stopStreams(): void {
    localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    pcRef.current?.close();
    pcRef.current = null;
  }

  function startCall(): void {
    if (!me || !peer) return;
    emitCallUser(me.username, peer);
    setCallState('calling');
    // Start local stream immediately so caller sees themselves
    void startLocalStream().then(async (stream) => {
      const pc = createPC();
      pcRef.current = pc;
      stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));
    });
  }

  function acceptCall(): void {
    if (!me || !incomingFrom) return;
    emitCallAccepted(me.username, incomingFrom);
    setIncomingFrom(null);
    enterCall();
    // Start local stream for callee
    void startLocalStream();
  }

  function declineCall(): void {
    if (!me || !incomingFrom) return;
    emitCallDeclined(me.username, incomingFrom);
    setIncomingFrom(null);
    setCallState('idle');
  }

  function enterCall(): void {
    setCallState('in-call');
    callStartRef.current = Date.now();
    setCallSec(0);
    callTimerRef.current = setInterval(
      () => setCallSec(Math.floor((Date.now() - callStartRef.current) / 1000)),
      1000,
    );
  }

  const endCall = useCallback(
    (emit = true) => {
      clearInterval(callTimerRef.current!);
      const dur = Math.floor((Date.now() - (callStartRef.current || Date.now())) / 1000);
      const callPeer = peer ?? incomingFrom;
      if (emit && callPeer && me) {
        emitCallEnded(me.username, callPeer, dur);
        const log: CallLog = {
          caller: me.username,
          recipient: callPeer,
          status: 'completed',
          duration: dur,
          startedAt: new Date(Date.now() - dur * 1000).toISOString(),
          endedAt: new Date().toISOString(),
        };
        appendCallLog(log);
      }
      stopStreams();
    stopStreams();
    setCallState('idle');
      setCallSec(0);
      setMuted(false);
      setIncomingFrom(null);
    },
    [peer, incomingFrom, me, appendCallLog],
  );

  // ── render timeline item ─────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: (typeof timeline)[number] }) => {
      if (item._kind === 'call') {
        const isCaller = item.caller === me?.username;
        return (
          <View style={s.callBub}>
            <Feather name="video" size={14} color="#2563eb" />
            <Text style={s.callBubTxt}>
              {isCaller ? 'You called' : 'Incoming call'}
            </Text>
            <Text style={s.callBubDur}>
              {item.status === 'completed' ? fmtDur(item.duration) : item.status}
            </Text>
            <Text style={s.callBubTime}>{fmt(item.startedAt)}</Text>
          </View>
        );
      }
      const mine = item.from === me?.username;
      return (
        <View style={[s.mrow, mine && s.mrowMe]}>
          <View style={[s.bub, mine ? s.bubMe : s.bubThem]}>
            {item.type === 'text' && (
              <Text style={[s.bubTxt, mine && s.bubTxtMe]}>{item.content}</Text>
            )}
            {item.type === 'voice' && (
              <VoicePlayer fileUrl={item.fileUrl ?? ''} mine={mine} />
            )}
            <Text style={[s.ts, mine && s.tsMe]}>{fmt(item.timestamp)}</Text>
          </View>
        </View>
      );
    },
    [me],
  );

  const keyExtractor = useCallback(
    (_: unknown, i: number) => String(i),
    [],
  );

  if (!me) return null;

  return (
    <SafeAreaView style={s.container}>
      {/* TOP BAR */}
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="chevron-left" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={s.topInfo}>
          <Text style={s.topName}>{peer}</Text>
          <Text style={s.topSt}>{peerUser?.isOnline ? '● online' : '○ offline'}</Text>
        </View>
        <TouchableOpacity
          style={[s.callBtn, (!peerUser?.isOnline || callState !== 'idle') && s.callBtnDis]}
          disabled={!peerUser?.isOnline || callState !== 'idle'}
          onPress={startCall}
        >
          <Feather name="video" size={16} color={peerUser?.isOnline && callState === 'idle' ? '#2563eb' : '#9ca3af'} />
          <Text style={[s.callBtnTxt, (!peerUser?.isOnline || callState !== 'idle') && s.callBtnTxtDis]}>
            Video Call
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* MESSAGES */}
        <FlatList
          ref={listRef}
          data={timeline}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={s.chatContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={s.emptyTxt}>No messages yet. Say hello!</Text>
          }
        />

        {/* STATUS BAR */}
        {!!statusMsg && <View style={s.stbar}><Text style={s.stbarTxt}>{statusMsg}</Text></View>}

        {/* RECORDING BAR */}
        {recState === 'recording' && (
          <View style={s.rbar}>
            <View style={s.rdot} />
            <Text style={s.rtim}>{fmtS(recSec)}</Text>
            <Text style={s.rlbl}>Recording…</Text>
            <TouchableOpacity style={s.rcnl} onPress={cancelRec}><Text style={s.rcnlTxt}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={s.rstp} onPress={() => void stopRec()}><Text style={s.rstpTxt}>Stop</Text></TouchableOpacity>
          </View>
        )}
        {recState === 'recorded' && (
          <View style={s.rbar}>
            <Text style={{ fontSize: 20 }}>🎤</Text>
            <Text style={s.rlbl}>Ready · {fmtS(recSec)}</Text>
            <TouchableOpacity style={s.rcnl} onPress={cancelRec}><Text style={s.rcnlTxt}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={s.rsnd} onPress={() => void sendVoice()}><Text style={s.rsndTxt}>Send</Text></TouchableOpacity>
          </View>
        )}
        {recState === 'uploading' && (
          <View style={s.rbar}>
            <ActivityIndicator color="#2563eb" size="small" />
            <Text style={s.rlbl}>Uploading voice message…</Text>
          </View>
        )}

        {/* INPUT BAR */}
        {recState === 'idle' && (
          <View style={s.ibar}>
            <TouchableOpacity style={s.micBtn} onPress={() => void startRec()}>
              <Text style={{ fontSize: 20 }}>🎤</Text>
            </TouchableOpacity>
            <TextInput
              style={s.minput}
              placeholder={peer ? 'Type a message…' : 'Select someone first'}
              placeholderTextColor="#9ca3af"
              value={txt}
              onChangeText={setTxt}
              onSubmitEditing={sendText}
              returnKeyType="send"
              editable={!!peer}
            />
            <TouchableOpacity style={s.sndBtn} onPress={sendText}>
              <Ionicons name="arrow-up" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* INCOMING CALL MODAL */}
      <Modal visible={callState === 'incoming'} transparent animationType="slide">
        <View style={s.ovl}>
          <View style={s.ocard}>
            <Text style={s.ocardTitle}>📹 Incoming Call</Text>
            <Text style={s.ocardSub}>{incomingFrom} is calling you…</Text>
            <View style={s.cact}>
              <TouchableOpacity style={s.abtn} onPress={acceptCall}>
                <Feather name="phone" size={28} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={s.dbtn} onPress={declineCall}>
                <Feather name="phone-off" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* OUTGOING CALL MODAL */}
      <Modal visible={callState === 'calling'} transparent animationType="slide">
        <View style={s.ovl}>
          <View style={s.ocard}>
            <Text style={s.ocardTitle}>Calling {peer}…</Text>
            <Text style={s.ocardSub}>Waiting for them to answer</Text>
            <View style={s.cact}>
              <TouchableOpacity style={s.dbtn} onPress={() => endCall()}>
                <Feather name="phone-off" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ACTIVE CALL MODAL */}
      <Modal visible={callState === 'in-call'} transparent animationType="fade">
        <View style={s.vscr}>
          <Text style={s.clbl}>{peer} · {fmtS(callSec)}</Text>
          <View style={s.videoWrap}>
            {remoteStream ? (
              <RTCView
                streamURL={remoteStream.toURL()}
                style={s.remoteVideo}
                objectFit="cover"
                mirror={false}
              />
            ) : (
              <View style={s.remoteVideo}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 12, fontSize: 13 }}>
                  Connecting video…
                </Text>
              </View>
            )}
            {localStream && (
              <RTCView
                streamURL={localStream.toURL()}
                style={s.localVideo}
                objectFit="cover"
                mirror={true}
                zOrder={1}
              />
            )}
          </View>
          <View style={s.cctrl}>
            <TouchableOpacity
              style={[s.ctbtn, s.ctmute]}
              onPress={() => {
                setMuted((m) => {
                  const next = !m;
                  localStreamRef.current?.getAudioTracks().forEach((t: any) => { t.enabled = !next; });
                  return next;
                });
              }}
            >
              <Feather name={muted ? 'mic-off' : 'mic'} size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[s.ctbtn, s.ctend]} onPress={() => endCall()}>
              <Feather name="phone-off" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },

  // top bar
  topbar: { backgroundColor: '#2563eb', height: 60, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  backBtn: { padding: 6 },
  topInfo: { flex: 1 },
  topName: { fontSize: 17, fontWeight: '700', color: '#fff' },
  topSt: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  callBtnDis: { backgroundColor: 'rgba(255,255,255,0.25)' },
  callBtnTxt: { color: '#2563eb', fontWeight: '700', fontSize: 13 },
  callBtnTxtDis: { color: 'rgba(255,255,255,0.6)' },

  // chat
  chatContent: { padding: 14, paddingBottom: 8, gap: 7, flexGrow: 1 },
  emptyTxt: { textAlign: 'center', color: '#ccc', marginTop: 40, fontSize: 14 },

  // bubbles
  mrow: { flexDirection: 'row' },
  mrowMe: { justifyContent: 'flex-end' },
  bub: { maxWidth: '80%', padding: 12, borderRadius: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  bubThem: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  bubMe: { backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
  bubTxt: { fontSize: 15, color: '#111', lineHeight: 22 },
  bubTxtMe: { color: '#fff' },
  voiceMsg: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceLbl: { fontSize: 13, color: '#2563eb' },
  voiceLblMe: { color: 'rgba(255,255,255,0.85)' },
  ts: { fontSize: 11, color: '#9ca3af', marginTop: 5 },
  tsMe: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },

  // call bubble
  callBub: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#dbeafe', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'center', marginVertical: 4 },
  callBubTxt: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  callBubDur: { fontSize: 11, color: '#888' },
  callBubTime: { fontSize: 11, color: '#aaa' },

  // status bar
  stbar: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', padding: 10, alignItems: 'center' },
  stbarTxt: { fontSize: 13, color: '#9ca3af' },

  // recording bar
  rbar: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rdot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' },
  rtim: { fontSize: 17, fontWeight: '700', color: '#ef4444', minWidth: 44 },
  rlbl: { flex: 1, fontSize: 13, color: '#aaa' },
  rcnl: { backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  rcnlTxt: { fontSize: 13, color: '#888' },
  rstp: { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  rstpTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  rsnd: { backgroundColor: '#22c55e', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  rsndTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // input bar
  ibar: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  micBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  minput: { flex: 1, borderWidth: 1.5, borderColor: '#eee', borderRadius: 24, paddingHorizontal: 18, paddingVertical: 10, fontSize: 15, backgroundColor: '#fafafa', color: '#111' },
  sndBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center' },

  // call overlays
  ovl: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 50 },
  ocard: { backgroundColor: '#fff', borderRadius: 24, padding: 32, width: '90%', maxWidth: 340, alignItems: 'center' },
  ocardTitle: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8 },
  ocardSub: { fontSize: 14, color: '#9ca3af', marginBottom: 28 },
  cact: { flexDirection: 'row', gap: 24 },
  abtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#22c55e', justifyContent: 'center', alignItems: 'center', shadowColor: '#22c55e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  dbtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', shadowColor: '#ef4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },

  // active call screen
  vscr: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center', gap: 24, padding: 24 },
  clbl: { color: 'rgba(255,255,255,0.65)', fontSize: 16, letterSpacing: 0.3 },
  videoWrap: { width: '100%', aspectRatio: 3 / 4, position: 'relative', borderRadius: 16, overflow: 'hidden', backgroundColor: '#1a1a1a' },
  remoteVideo: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  localVideo: { position: 'absolute', bottom: 12, right: 12, width: 90, height: 130, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  videoNote: { color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  cctrl: { flexDirection: 'row', gap: 18 },
  ctbtn: { width: 58, height: 58, borderRadius: 29, justifyContent: 'center', alignItems: 'center' },
  ctmute: { backgroundColor: 'rgba(255,255,255,0.15)' },
  ctend: { backgroundColor: '#ef4444', shadowColor: '#ef4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
});
