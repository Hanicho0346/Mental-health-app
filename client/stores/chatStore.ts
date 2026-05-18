import { create } from 'zustand';

export type ChatUser = {
  username: string;
  isOnline: boolean;
};

export type ChatMessage = {
  _id?: string;
  from: string;
  to: string;
  type: 'text' | 'voice';
  content?: string;
  fileUrl?: string;
  timestamp: string;
};

export type CallLog = {
  _id?: string;
  caller: string;
  recipient: string;
  status: 'completed' | 'missed' | 'declined';
  duration: number;
  startedAt: string;
  endedAt?: string;
};

export type TimelineItem =
  | (ChatMessage & { _kind: 'msg' })
  | (CallLog & { _kind: 'call' });

type ChatState = {
  me: { userId: string; username: string } | null;
  users: ChatUser[];
  peer: string | null;
  timeline: TimelineItem[];
  setMe: (me: { userId: string; username: string } | null) => void;
  setUsers: (users: ChatUser[]) => void;
  setPeer: (peer: string | null) => void;
  setTimeline: (items: TimelineItem[]) => void;
  appendMessage: (msg: ChatMessage) => void;
  appendCallLog: (log: CallLog) => void;
  clear: () => void;
};

export const useChatStore = create<ChatState>((set) => ({
  me: null,
  users: [],
  peer: null,
  timeline: [],
  setMe: (me) => set({ me }),
  setUsers: (users) => set({ users }),
  setPeer: (peer) => set({ peer }),
  setTimeline: (timeline) => set({ timeline }),
  appendMessage: (msg) =>
    set((s) => ({
      timeline: [...s.timeline, { ...msg, _kind: 'msg' as const }].sort(
        (a, b) => new Date(a._kind === 'msg' ? a.timestamp : a.startedAt).getTime()
                - new Date(b._kind === 'msg' ? b.timestamp : b.startedAt).getTime()
      ),
    })),
  appendCallLog: (log) =>
    set((s) => ({
      timeline: [...s.timeline, { ...log, _kind: 'call' as const }].sort(
        (a, b) => new Date(a._kind === 'msg' ? a.timestamp : a.startedAt).getTime()
                - new Date(b._kind === 'msg' ? b.timestamp : b.startedAt).getTime()
      ),
    })),
  clear: () => set({ me: null, users: [], peer: null, timeline: [] }),
}));
