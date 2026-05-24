import { api } from "@/lib/api";
import { getApiErrorMessage, logClientError } from "@/lib/log";
import { isPsychiatrist } from "@/lib/tabNavigation";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { connectSocket } from "@/lib/chatService";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Modal,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Feeling = "happy" | "neutral" | "sad";

const MOOD_BY_FEELING: Record<Feeling, string> = {
  happy: "Happy / ደስተኛ",
  neutral: "Neutral / መካከለኛ",
  sad: "Sad / የተከፋ",
};

function feelingFromMoodStatus(mood?: string): Feeling {
  const m = mood?.trim() ?? "";
  if (m.includes("Sad") || m.includes("የተከፋ")) return "sad";
  if (m.includes("Neutral") || m.includes("መካከለኛ")) return "neutral";
  return "happy";
}

type MeResponse = {
  id: string;
  full_name: string;
  email: string;
  national_id: string;
  avatar_url?: string;
  mood_status?: string;
  createdAt?: string;
};

// Represents the Video Model from your Backend
type SupportVideo = {
  id: string;
  title: string;
  amharicTitle: string;
  tag: string;
  listens: number;
  thumbnail: string;
  video_url: string;
  isFavorite?: boolean; // Backend should return true if the current user favorited it
};

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1531123897727-8f129e1bf98c?w=100&h=100&fit=crop";

export default function HomeScreen() {
  const psychiatrist = isPsychiatrist(useAuthStore((s) => s.user));

  // Profile & Mood States
  const [me, setMe] = useState<MeResponse | null>(null);
  const [feeling, setFeeling] = useState<Feeling>("happy");
  const [moodSaving, setMoodSaving] = useState(false);
  const [hasSubmittedFeeling, setHasSubmittedFeeling] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  // Video States
  const [videos, setVideos] = useState<SupportVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [showVideoModal, setShowVideoModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      // 1. Fetch User Profile
      const fetchProfile = async () => {
        try {
          const { data } = await api.get<MeResponse>("/users/me");
          if (!cancelled) {
            setMe(data);
            setFeeling(feelingFromMoodStatus(data.mood_status));
            try {
              // Initialize global chat state and connect socket
              const username = data.full_name?.trim() || data.id;
              useChatStore.getState().setMe({ userId: data.id, username });
              // Pass access token if available to authenticate socket (optional)
              const token = useAuthStore.getState().accessToken ?? undefined;
              connectSocket(username, token);
            } catch (e) {
              console.warn("chat init failed", e);
            }
          }
        } catch (e) {
          logClientError("home.loadProfile", e);
          if (!cancelled)
            Alert.alert("Could not load profile", getApiErrorMessage(e));
        } finally {
          if (!cancelled) setProfileLoading(false);
        }
      };

      // 2. Fetch Support Videos
      const fetchVideos = async () => {
        setVideosLoading(true);
        try {
          const { data } = await api.get<SupportVideo[]>("/doctor/videos");
          if (!cancelled) setVideos(data);
        } catch (e) {
          logClientError("home.loadVideos", e);
        } finally {
          if (!cancelled) setVideosLoading(false);
        }
      };

      void fetchProfile();
      void fetchVideos();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  async function saveFeeling(next: Feeling): Promise<void> {
    if (moodSaving) return;
    setFeeling(next);
    setMoodSaving(true);
    try {
      const mood_status = MOOD_BY_FEELING[next];
      const { data } = await api.patch<MeResponse>("/users/me", {
        mood_status,
      });
      setMe(data);
      setHasSubmittedFeeling(true); // Shows Thank You message
    } catch (e) {
      logClientError("home.saveFeeling", e, { next });
      Alert.alert("Could not save check-in", getApiErrorMessage(e));
      if (me) setFeeling(feelingFromMoodStatus(me.mood_status));
    } finally {
      setMoodSaving(false);
    }
  }

  // Toggle favorite with Optimistic UI Update
  const toggleFavorite = async (id: string) => {
    // 1. Optimistically update local state
    setVideos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, isFavorite: !v.isFavorite } : v)),
    );

    // 2. Call backend
    try {
      await api.post(`/doctor/videos/${id}/toggle-favorite`);
    } catch (e) {
      // 3. Revert local state on failure
      setVideos((prev) =>
        prev.map((v) =>
          v.id === id ? { ...v, isFavorite: !v.isFavorite } : v,
        ),
      );
      Alert.alert("Error", "Could not update favorites. Please try again.");
    }
  };

  const handlePlayVideo = async (video: SupportVideo) => {
    // 1. Optimistically increment listen count locally
    setVideos((prev) =>
      prev.map((v) =>
        v.id === video.id ? { ...v, listens: v.listens + 1 } : v,
      ),
    );

    // 2. Increment in backend (fire and forget)
    api.post(`/doctor/videos/${video.id}/listen`).catch((e) => {
      logClientError("home.incrementListen", e);
    });

    // 3. Navigate to Video Player or open external URL
    // router.push({ pathname: '/video-player', params: { url: video.video_url } });
    Alert.alert("Playing Video", `Now playing: ${video.title}`);
  };

  const firstName = me?.full_name?.trim()?.split(/\s+/)[0] ?? "there";
  const avatarUri = me?.avatar_url?.trim()
    ? me.avatar_url.trim()
    : DEFAULT_AVATAR;

  // Reusable component for displaying videos
  const renderVideoCard = (video: SupportVideo, isStandalone = false) => {
    const isFav = !!video.isFavorite;

    return (
      <View
        style={[styles.videoCard, !isStandalone && { marginBottom: 16 }]}
        key={video.id}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => handlePlayVideo(video)}
        >
          <Image source={{ uri: video.thumbnail }} style={styles.videoImage} />
          <View style={styles.playButtonOverlay}>
            <Ionicons name="play-circle" size={48} color="#FFF" />
          </View>
          <View style={styles.videoTag}>
            <Text style={styles.videoTagText}>{video.tag}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.videoInfo}>
          <View style={{ flex: 1 }}>
            <Text style={styles.videoTitle}>{video.title}</Text>
            <Text style={styles.amharicVideoTitle}>{video.amharicTitle}</Text>
            <Text style={styles.videoMeta}>
              <Feather name="headphones" size={12} color="#4ADE80" />{" "}
              {video.listens} listens
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => toggleFavorite(video.id)}
            style={{ padding: 4 }}
          >
            <Ionicons
              name={isFav ? "heart" : "heart-outline"}
              size={24}
              color={isFav ? "#EF4444" : "#6B7280"}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Feather name="wind" size={20} color="#FFF" />
          </View>
          <View>
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
            <View style={styles.onlineDot} />
          </View>
        </View>

        {/* GREETING */}
        <View style={styles.greetingSection}>
          {profileLoading ? (
            <ActivityIndicator style={{ marginVertical: 8 }} color="#4ADE80" />
          ) : null}
          <Text style={styles.greeting}>
            Hi {firstName} 👋{" "}
            <Text style={styles.amharicGreeting}>/ ሰላም {firstName} 👋</Text>
          </Text>
          <Text style={styles.subGreeting}>
            We are glad to see you today. How is your heart?
          </Text>
        </View>

        {/* FEELINGS CARD / THANK YOU STATE */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.cardTitle}>How are you feeling?</Text>
              <Text style={styles.amharicCardTitle}>ምን አይነት ስሜት ይሰማዎታል?</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {moodSaving ? "Saving…" : "Daily Check-in"}
              </Text>
            </View>
          </View>

          {hasSubmittedFeeling ? (
            <View style={styles.thankYouContainer}>
              <Ionicons name="checkmark-circle" size={48} color="#4ADE80" />
              <Text style={styles.thankYouText}>Thank you for sharing!</Text>
              <Text style={styles.amharicThankYouText}>
                ስሜትዎን ስላካፈሉን እናመሰግናለን!
              </Text>
            </View>
          ) : (
            <View style={styles.feelingsRow}>
              <TouchableOpacity
                style={[
                  styles.feelingBox,
                  feeling === "happy" ? styles.feelingBoxActive : undefined,
                ]}
                onPress={() => void saveFeeling("happy")}
                disabled={moodSaving}
              >
                <Feather
                  name="smile"
                  size={32}
                  color={feeling === "happy" ? "#4ADE80" : "#6B7280"}
                />
                <Text
                  style={
                    feeling === "happy"
                      ? styles.feelingTextActive
                      : styles.feelingText
                  }
                >
                  Happy
                </Text>
                <Text
                  style={
                    feeling === "happy"
                      ? styles.amharicFeelingTextActive
                      : styles.amharicFeelingText
                  }
                >
                  ደስተኛ
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.feelingBox,
                  feeling === "neutral" ? styles.feelingBoxActive : undefined,
                ]}
                onPress={() => void saveFeeling("neutral")}
                disabled={moodSaving}
              >
                <Feather
                  name="meh"
                  size={32}
                  color={feeling === "neutral" ? "#4ADE80" : "#6B7280"}
                />
                <Text
                  style={
                    feeling === "neutral"
                      ? styles.feelingTextActive
                      : styles.feelingText
                  }
                >
                  Neutral
                </Text>
                <Text
                  style={
                    feeling === "neutral"
                      ? styles.amharicFeelingTextActive
                      : styles.amharicFeelingText
                  }
                >
                  መካከለኛ
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.feelingBox,
                  feeling === "sad" ? styles.feelingBoxActive : undefined,
                ]}
                onPress={() => void saveFeeling("sad")}
                disabled={moodSaving}
              >
                <Feather
                  name="frown"
                  size={32}
                  color={feeling === "sad" ? "#4ADE80" : "#6B7280"}
                />
                <Text
                  style={
                    feeling === "sad"
                      ? styles.feelingTextActive
                      : styles.feelingText
                  }
                >
                  Sad
                </Text>
                <Text
                  style={
                    feeling === "sad"
                      ? styles.amharicFeelingTextActive
                      : styles.amharicFeelingText
                  }
                >
                  የተከፋ
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* QUICK ACTIONS */}
        <Text style={styles.sectionTitle}>
          Quick Actions{" "}
          <Text style={styles.amharicSectionTitle}>/ ፈጣን እርምጃዎች</Text>
        </Text>
        <View style={styles.quickActionsRow}>
          {psychiatrist ? (
            <>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() =>
                  router.push("/(tabs)/(psychiatrist-tabs)/dashboard")
                }
              >
                <Feather name="grid" size={24} color="#111827" />
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.actionTitle}>Dashboard</Text>
                  <Text style={styles.amharicActionTitle}>ዳሽቦርድ</Text>
                </View>
                <Feather
                  name="arrow-right"
                  size={16}
                  color="#9CA3AF"
                  style={styles.actionArrow}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => router.push("/(tabs)/(psychiatrist-tabs)/users")}
              >
                <Feather name="users" size={24} color="#111827" />
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.actionTitle}>Users</Text>
                  <Text style={styles.amharicActionTitle}>ተጠቃሚዎች</Text>
                </View>
                <Feather
                  name="arrow-right"
                  size={16}
                  color="#9CA3AF"
                  style={styles.actionArrow}
                />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => router.push("/(tabs)/(user-tabs)/book")}
              >
                <Feather name="calendar" size={24} color="#111827" />
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.actionTitle}>Book Session</Text>
                  <Text style={styles.amharicActionTitle}>ቀጠሮ ይያዙ</Text>
                </View>
                <Feather
                  name="arrow-right"
                  size={16}
                  color="#9CA3AF"
                  style={styles.actionArrow}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => router.push("/(tabs)/(user-tabs)/chats")}
              >
                <Feather name="message-square" size={24} color="#111827" />
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.actionTitle}>Talk Now</Text>
                  <Text style={styles.amharicActionTitle}>አሁን ይነጋገሩ</Text>
                </View>
                <Feather
                  name="arrow-right"
                  size={16}
                  color="#9CA3AF"
                  style={styles.actionArrow}
                />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* EMERGENCY BUTTON */}
        <TouchableOpacity
          style={styles.emergencyCard}
          onPress={() => router.push("/emergency")}
        >
          <View style={styles.emergencyLeft}>
            <View style={styles.emergencyIcon}>
              <Feather name="phone-call" size={20} color="#EF4444" />
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.emergencyTitle}>Emergency Help</Text>
              <Text style={styles.amharicEmergencyTitle}>አስቸኳይ እገዛ</Text>
            </View>
          </View>
          <View style={styles.sosBadge}>
            <Text style={styles.sosText}>SOS</Text>
          </View>
        </TouchableOpacity>

        {/* DAILY SUPPORT */}
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>
            Daily Support{" "}
            <Text style={styles.amharicSectionTitle}>/ ዕለታዊ ድጋፍ</Text>
          </Text>
          <TouchableOpacity onPress={() => setShowVideoModal(true)}>
            <Text style={styles.seeAllText}>
              See all <Feather name="arrow-right" size={12} />
            </Text>
          </TouchableOpacity>
        </View>

        {/* Preview just the first video on Home screen or show loading state */}
        {videosLoading ? (
          <View
            style={[
              styles.videoCard,
              { height: 160, justifyContent: "center", alignItems: "center" },
            ]}
          >
            <ActivityIndicator color="#4ADE80" size="large" />
          </View>
        ) : videos.length > 0 ? (
          renderVideoCard(videos[0], true)
        ) : (
          <Text
            style={{
              color: "#6B7280",
              textAlign: "center",
              marginVertical: 20,
            }}
          >
            No videos available
          </Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ALL VIDEOS MODAL */}
      <Modal
        visible={showVideoModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Daily Support Videos</Text>
              <Text style={styles.amharicModalTitle}>ዕለታዊ የድጋፍ ቪዲዮዎች</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowVideoModal(false)}
              style={styles.closeButton}
            >
              <Feather name="x" size={24} color="#111827" />
            </TouchableOpacity>
          </View>

          {videosLoading ? (
            <ActivityIndicator
              style={{ marginTop: 40 }}
              color="#4ADE80"
              size="large"
            />
          ) : (
            <FlatList
              data={videos}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => renderVideoCard(item)}
              ListEmptyComponent={
                <Text
                  style={{
                    color: "#6B7280",
                    textAlign: "center",
                    marginTop: 40,
                  }}
                >
                  No videos uploaded yet.
                </Text>
              }
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  scrollContent: { padding: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  logoBox: {
    backgroundColor: "#111827",
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    backgroundColor: "#4ADE80",
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#F9FAFB",
  },
  greetingSection: { marginBottom: 24 },
  greeting: { fontSize: 24, fontWeight: "bold", color: "#111827" },
  amharicGreeting: { fontSize: 20, color: "#6B7280", fontWeight: "normal" },
  subGreeting: { fontSize: 14, color: "#6B7280", marginTop: 4 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  amharicCardTitle: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  badge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { color: "#22C55E", fontSize: 12, fontWeight: "600" },

  // Feelings UI
  feelingsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  feelingBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    marginHorizontal: 4,
  },
  feelingBoxActive: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#4ADE80",
  },
  feelingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
    marginTop: 8,
  },
  feelingTextActive: {
    fontSize: 14,
    fontWeight: "600",
    color: "#22C55E",
    marginTop: 8,
  },
  amharicFeelingText: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  amharicFeelingTextActive: { fontSize: 11, color: "#22C55E", marginTop: 2 },

  // Thank you UI
  thankYouContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    paddingBottom: 8,
  },
  thankYouText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginTop: 12,
  },
  amharicThankYouText: { fontSize: 14, color: "#6B7280", marginTop: 4 },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  amharicSectionTitle: { fontSize: 14, color: "#6B7280", fontWeight: "normal" },
  quickActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  actionCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 20,
    marginHorizontal: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  actionTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  amharicActionTitle: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  actionArrow: { position: "absolute", bottom: 16, right: 16 },
  emergencyCard: {
    backgroundColor: "#FEF2F2",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 20,
    marginBottom: 24,
  },
  emergencyLeft: { flexDirection: "row", alignItems: "center" },
  emergencyIcon: {
    width: 40,
    height: 40,
    backgroundColor: "#FEE2E2",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  emergencyTitle: { fontSize: 16, fontWeight: "700", color: "#EF4444" },
  amharicEmergencyTitle: { fontSize: 12, color: "#F87171", marginTop: 2 },
  sosBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  sosText: { color: "#EF4444", fontWeight: "bold", fontSize: 12 },
  seeAllText: {
    color: "#4ADE80",
    fontWeight: "600",
    fontSize: 14,
    marginBottom: 16,
  },

  // Video Shared UI
  videoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  videoImage: { width: "100%", height: 160, backgroundColor: "#F3F4F6" },
  playButtonOverlay: { position: "absolute", top: 56, alignSelf: "center" },
  videoTag: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "#4ADE80",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  videoTagText: { color: "#FFF", fontSize: 12, fontWeight: "bold" },
  videoInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    alignItems: "center",
  },
  videoTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  amharicVideoTitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    marginBottom: 8,
  },
  videoMeta: { fontSize: 12, color: "#9CA3AF" },

  // Video Modal Styles
  modalContainer: { flex: 1, backgroundColor: "#F9FAFB" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#111827" },
  amharicModalTitle: { fontSize: 14, color: "#6B7280", marginTop: 2 },
  closeButton: { padding: 4, backgroundColor: "#F3F4F6", borderRadius: 20 },
  modalScrollContent: { padding: 20, paddingBottom: 40 },
});
