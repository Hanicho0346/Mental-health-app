import { create } from "zustand";
import axios from 'axios';
import { API_URL } from "@/lib/api";

export type ChatUser = {
  _id: string;
  userId?: string;
  username?: string;
  full_name: string;
  email?: string;
  avatar_url?: string;
  is_online?: boolean;
  socket_id?: string;
};

export type ChatMessage = {
  _id?: string;
  from: string;
  to: string;
  type: "text" | "voice";
  content?: string;
  fileUrl?: string;
  timestamp: string;
  status?: "sending" | "sent" | "read" | "error";
};

export type CallLog = {
  _id?: string;
  caller: string;
  recipient: string;
  status: "completed" | "missed" | "declined";
  duration: number;
  startedAt: string;
  endedAt?: string;
};

export type Conversation = {
  peerId: string;
  peerName: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  isOnline?: boolean;
};

export type TimelineItem =
  | (ChatMessage & { _kind: "msg" })
  | (CallLog & { _kind: "call" });

type ChatState = {
   me: ChatUser | null;
   users: ChatUser[];
   conversations: Conversation[];
   peer: string | null;
   timeline: TimelineItem[];
   loading: boolean;
   
   setMe: (me: ChatUser | null) => void;
   setUsers: (users: ChatUser[]) => void;
   setConversations: (items: Conversation[]) => void;
   setPeer: (peer: string | null) => void;
   setTimeline: (items: TimelineItem[]) => void;
   appendMessage: (msg: ChatMessage) => void;
   appendCallLog: (log: CallLog) => void;
   loadConversations: (token: string) => Promise<void>;
   clear: () => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  me: null,
  users: [],
  conversations: [],
  peer: null,
  timeline: [],
  loading: false,

  setMe: (me) => set({ me }),
  setUsers: (users) => set({ users }),
  setConversations: (items) => set({ conversations: items }),
  setPeer: (peer) => set({ peer }),
  setTimeline: (timeline) => set({ timeline }),

  appendMessage: (msg) =>
    set((s) => ({
      timeline: [
        ...s.timeline,
        { ...msg, _kind: "msg" as const },
      ].sort(
        (a, b) =>
          new Date(
            a._kind === "msg" ? a.timestamp : a.startedAt
          ).getTime() -
          new Date(
            b._kind === "msg" ? b.timestamp : b.startedAt
          ).getTime()
      ),
    })),

  appendCallLog: (log) =>
    set((s) => ({
      timeline: [
        ...s.timeline,
        { ...log, _kind: "call" as const },
      ].sort(
        (a, b) =>
          new Date(
            a._kind === "msg" ? a.timestamp : a.startedAt
          ).getTime() -
          new Date(
            b._kind === "msg" ? b.timestamp : b.startedAt
          ).getTime()
      ),
    })),

  loadConversations: async (token: string) => {
  try {
    set({ loading: true });
    
    const response = await axios.get(`${API_URL}/api/messages/conversations`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data && Array.isArray(response.data)) {
      const conversations: Conversation[] = response.data.map((conv: any) => ({
        peerId:          conv.peerId          || conv.userId || conv._id,
        peerName:        conv.peerName        || conv.full_name || conv.name || "User", // ← peerName first
        lastMessage:     conv.lastMessage     || conv.last_message || "No messages yet",
        lastMessageTime: conv.lastMessageTime || conv.last_message_time,
        unreadCount:     conv.unreadCount     || conv.unread_count || 0,
        isOnline:        conv.isOnline        || conv.is_online || false,
      }));
      
      set({ conversations });

      const users: ChatUser[] = response.data.map((conv: any) => ({
        _id:        conv.peerId    || conv.userId || conv._id,
        full_name:  conv.peerName  || conv.full_name || conv.name || "User", // ← peerName first
        is_online:  conv.isOnline  || conv.is_online || false,
        avatar_url: conv.peerAvatar || conv.avatar || "",
      }));
      
      set({ users });
    }
  } catch (error) {
    console.error("Error loading conversations:", error);
  } finally {
    set({ loading: false });
  }
},

  clear: () =>
    set({
      me: null,
      users: [],
      conversations: [],
      peer: null,
      timeline: [],
      loading: false,
    }),
}));