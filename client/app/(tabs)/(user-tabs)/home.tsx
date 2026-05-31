import { api } from "@/lib/api";
import { getApiErrorMessage, logClientError } from "@/lib/log";
import { isPsychiatrist } from "@/lib/tabNavigation";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { connectSocket } from "@/lib/chatService";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Video, ResizeMode } from "expo-av";
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
import image1 from "../../../assets/images/image.png";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  is_premier?: boolean;
  ai_chats_used_today?: number;
  ai_chats_daily_limit?: number | null;
};

type NextAppointment = {
  id: string;
  counselor_name: string;
  specialization?: string;
  scheduled_at: string;
};

type SupportVideo = {
  id: string;
  title: string;
  category: string;
  amharic_title: string;
  tag: string;
  listens: number;
  thumbnail: string;
  video_url: string;
  isFavorite?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAppointmentDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function formatAppointmentTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const psychiatrist = isPsychiatrist(useAuthStore((s) => s.user));

  const [me, setMe] = useState<MeResponse | null>(null);
  const [feeling, setFeeling] = useState<Feeling>("happy");
  const [moodSaving, setMoodSaving] = useState(false);
  const [hasSubmittedFeeling, setHasSubmittedFeeling] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [playingVideo, setPlayingVideo] = useState<SupportVideo | null>(null);
  // 2. Add setIsPremier selector at the top of HomeScreen()
  const setIsPremier = useAuthStore((s) => s.setIsPremier);
  const [nextAppointment, setNextAppointment] =
    useState<NextAppointment | null>(null);
  const [appointmentLoading, setAppointmentLoading] = useState(true);

  const [videos, setVideos] = useState<SupportVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [showVideoModal, setShowVideoModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const fetchProfile = async () => {
        try {
          const { data } = await api.get<MeResponse>("/users/me");
          if (!cancelled) {
            setMe(data);
            setIsPremier(data.is_premier ?? false);
            setFeeling(feelingFromMoodStatus(data.mood_status));
            try {
              const username = data.full_name?.trim() || data.id;
              useChatStore.getState().setMe({
                _id: data.id,
                userId: data.id,
                username: data.full_name,
                full_name: data.full_name,
              });
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

      const fetchNextAppointment = async () => {
        setAppointmentLoading(true);
        try {
          // Returns array sorted by date asc; take first upcoming one
          const { data } = await api.get<NextAppointment[]>(
            "/appointments?limit=1&status=upcoming",
          );
          if (!cancelled) {
            setNextAppointment(data?.[0] ?? null);
          }
        } catch (e) {
          logClientError("home.loadNextAppointment", e);
          if (!cancelled) setNextAppointment(null);
        } finally {
          if (!cancelled) setAppointmentLoading(false);
        }
      };

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
      void fetchNextAppointment();
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
      setHasSubmittedFeeling(true);
    } catch (e) {
      logClientError("home.saveFeeling", e, { next });
      Alert.alert("Could not save check-in", getApiErrorMessage(e));
      if (me) setFeeling(feelingFromMoodStatus(me.mood_status));
    } finally {
      setMoodSaving(false);
    }
  }

  const toggleFavorite = async (id: string) => {
    setVideos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, isFavorite: !v.isFavorite } : v)),
    );
    try {
      await api.post(`/doctor/videos/${id}/toggle-favorite`);
    } catch {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === id ? { ...v, isFavorite: !v.isFavorite } : v,
        ),
      );
      Alert.alert("Error", "Could not update favorites. Please try again.");
    }
  };

  const handlePlayVideo = (video: SupportVideo) => {
    setPlayingVideo(video);
    setVideos((prev) =>
      prev.map((v) =>
        v.id === video.id ? { ...v, listens: (v.listens ?? 0) + 1 } : v,
      ),
    );
    api.post(`/doctor/videos/${video.id}/listen`).catch((e) => {
      logClientError("home.incrementListen", e);
    });
  };

  const firstName = me?.full_name?.trim()?.split(/\s+/)[0] ?? "there";
  const avatarUri = me?.avatar_url?.trim() ? me.avatar_url.trim() : image1;
  const isPremier = me?.is_premier ?? false;
  const aiChatsUsed = me?.ai_chats_used_today ?? 0;
  const aiChatsLimit = me?.ai_chats_daily_limit ?? null;
  const aiRemaining = aiChatsLimit != null ? aiChatsLimit - aiChatsUsed : null;

  // 4. Fix renderVideoCard to use the correct field names
  const renderVideoCard = (video: SupportVideo, isStandalone = false) => {
    const isFav = !!video.isFavorite;

    // Auto-generate thumbnail from Cloudinary video URL
    const thumbnailUri = video.video_url
      .replace("/video/upload/", "/video/upload/so_0,w_400,h_225,c_fill/")
      .replace(/\.(mp4|mov|avi|mkv)$/, ".jpg");

    return (
      <View
        style={[styles.videoCard, !isStandalone && { marginBottom: 16 }]}
        key={video.id}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => handlePlayVideo(video)}
        >
          <Image source={{ uri: thumbnailUri }} style={styles.videoImage} />
          <View style={styles.playButtonOverlay}>
            <Ionicons name="play-circle" size={48} color="#FFF" />
          </View>
          <View style={styles.videoTag}>
            <Text style={styles.videoTagText}>{video.category}</Text>{" "}
            {/* was video.tag */}
          </View>
        </TouchableOpacity>
        <View style={styles.videoInfo}>
          <View style={{ flex: 1 }}>
            <Text style={styles.videoTitle}>{video.title}</Text>
            <Text style={styles.amharicVideoTitle}>
              {video.amharic_title}
            </Text>{" "}
            {/* was video.amharicTitle */}
            <Text style={styles.videoMeta}>
              <Feather name="headphones" size={12} color="#4ADE80" />{" "}
              {video.listens ?? 0} listens
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
        <View style={styles.logoRow}>
          <Image
            source={image1}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <View style={styles.logoTextWrap}>
            <Text style={styles.logoTitle}>TefasMind</Text>
            <Text style={styles.logoSubtitle}>Mental Wellness Platform</Text>
            <Text style={styles.logoAmharic}>የአእምሮ ጤና መድረክ</Text>
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

        {/* FEELINGS CARD */}
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
              {(["happy", "neutral", "sad"] as Feeling[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[
                    styles.feelingBox,
                    feeling === f ? styles.feelingBoxActive : undefined,
                  ]}
                  onPress={() => void saveFeeling(f)}
                  disabled={moodSaving}
                >
                  <Feather
                    name={
                      f === "happy"
                        ? "smile"
                        : f === "neutral"
                          ? "meh"
                          : "frown"
                    }
                    size={32}
                    color={feeling === f ? "#4ADE80" : "#6B7280"}
                  />
                  <Text
                    style={
                      feeling === f
                        ? styles.feelingTextActive
                        : styles.feelingText
                    }
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                  <Text
                    style={
                      feeling === f
                        ? styles.amharicFeelingTextActive
                        : styles.amharicFeelingText
                    }
                  >
                    {f === "happy"
                      ? "ደስተኛ"
                      : f === "neutral"
                        ? "መካከለኛ"
                        : "የተከፋ"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* QUICK ACTIONS */}
        <Text style={styles.sectionTitle}>
          Quick Actions{" "}
          <Text style={styles.amharicSectionTitle}>/ ፈጣን እርምጃዎች</Text>
        </Text>

        {psychiatrist ? (
          <View style={styles.quickActionsRow}>
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
          </View>
        ) : (
          <>
            {/* Row 1: Book + Talk */}
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => router.push("/(tabs)/(user-tabs)/book")}
              >
                <View
                  style={[
                    styles.actionIconWrap,
                    { backgroundColor: "#F0FDF4" },
                  ]}
                >
                  <Feather name="calendar" size={22} color="#16A34A" />
                </View>
                <View style={{ marginTop: 12 }}>
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
                <View
                  style={[
                    styles.actionIconWrap,
                    { backgroundColor: "#EFF6FF" },
                  ]}
                >
                  <Feather name="message-square" size={22} color="#2563EB" />
                </View>
                <View style={{ marginTop: 12 }}>
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
            </View>

            {/* Row 2: AI Chat — premier only */}
            {isPremier ? (
              <TouchableOpacity
                style={styles.aiChatCard}
                onPress={() => router.push("/(tabs)/(user-tabs)/aichat")}
                activeOpacity={0.85}
              >
                <View style={styles.aiChatLeft}>
                  <View style={styles.aiChatAvatarWrap}>
                    <View style={styles.aiChatAvatar}>
                      <Text style={styles.aiChatAvatarText}>Dr</Text>
                    </View>
                    <View style={styles.aiChatOnlineDot} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.aiChatNameRow}>
                      <Text style={styles.aiChatName}>Dr. Selam</Text>
                      <View style={styles.aiChatBadge}>
                        <Text style={styles.aiChatBadgeText}>AI</Text>
                      </View>
                    </View>
                    <Text style={styles.aiChatSub}>
                      Mental Wellness AI · Always here
                    </Text>
                    {aiChatsLimit !== null && (
                      <View style={styles.aiUsageRow}>
                        <View style={styles.aiUsageTrack}>
                          <View
                            style={[
                              styles.aiUsageFill,
                              {
                                width: `${Math.min((aiChatsUsed / aiChatsLimit!) * 100, 100)}%`,
                                backgroundColor:
                                  (aiRemaining ?? 0) <= 2
                                    ? "#EF4444"
                                    : GREEN_DARK,
                              },
                            ]}
                          />
                        </View>
                        <Text
                          style={[
                            styles.aiUsageLabel,
                            (aiRemaining ?? 0) <= 2 && { color: "#EF4444" },
                          ]}
                        >
                          {aiRemaining} left
                        </Text>
                      </View>
                    )}
                    {aiChatsLimit === null && (
                      <Text style={styles.aiUnlimitedLabel}>
                        Unlimited chats ✨
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.aiChatArrow}>
                  <Feather name="chevron-right" size={18} color={GREEN_DARK} />
                </View>
              </TouchableOpacity>
            ) : (
              /* Free users — upgrade CTA */
              <TouchableOpacity
                style={styles.aiChatLockedCard}
                onPress={() => router.push("/(tabs)/(user-tabs)/profile")}
                activeOpacity={0.85}
              >
                <View style={styles.aiChatLockedLeft}>
                  <View style={styles.aiChatLockedIcon}>
                    <Feather name="lock" size={18} color="#B45309" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.aiChatLockedTitle}>
                      Dr. Selam AI Chat
                    </Text>
                    <Text style={styles.aiChatLockedSub}>
                      Upgrade to Premier to unlock 24/7 AI support
                    </Text>
                  </View>
                </View>
                <View style={styles.aiChatUpgradeBtn}>
                  <Feather name="star" size={12} color="#fff" />
                  <Text style={styles.aiChatUpgradeBtnText}>Upgrade</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* NEXT APPOINTMENT CARD (users only) */}
        {!psychiatrist && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 8 }]}>
              Next Appointment{" "}
              <Text style={styles.amharicSectionTitle}>/ ቀጣይ ቀጠሮ</Text>
            </Text>

            {appointmentLoading ? (
              <View style={styles.appointmentCard}>
                <ActivityIndicator color="#16A34A" size="small" />
              </View>
            ) : nextAppointment ? (
              <TouchableOpacity
                style={styles.appointmentCard}
                onPress={() => router.push("/(tabs)/(user-tabs)/book")}
                activeOpacity={0.85}
              >
                {/* Left accent bar */}
                <View style={styles.appointmentAccent} />

                <View style={styles.appointmentAvatarWrap}>
                  <View style={styles.appointmentAvatar}>
                    <Feather name="user" size={22} color="#16A34A" />
                  </View>
                  <View style={styles.appointmentOnlineDot} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.appointmentName}>
                    {nextAppointment.counselor_name}
                  </Text>
                  {nextAppointment.specialization ? (
                    <Text style={styles.appointmentSpec}>
                      {nextAppointment.specialization}
                    </Text>
                  ) : null}
                  <View style={styles.appointmentMetaRow}>
                    <View style={styles.appointmentMetaChip}>
                      <Feather name="calendar" size={11} color="#16A34A" />
                      <Text style={styles.appointmentMetaText}>
                        {formatAppointmentDate(nextAppointment.scheduled_at)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.appointmentMetaChip,
                        { backgroundColor: "#EFF6FF" },
                      ]}
                    >
                      <Feather name="clock" size={11} color="#2563EB" />
                      <Text
                        style={[
                          styles.appointmentMetaText,
                          { color: "#2563EB" },
                        ]}
                      >
                        {formatAppointmentTime(nextAppointment.scheduled_at)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.appointmentVerified}>
                  <Feather name="shield" size={11} color="#16A34A" />
                  <Text style={styles.appointmentVerifiedText}>Verified</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.appointmentEmptyCard}
                onPress={() => router.push("/(tabs)/(user-tabs)/book")}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.actionIconWrap,
                    {
                      backgroundColor: "#F0FDF4",
                      marginBottom: 0,
                      marginRight: 14,
                    },
                  ]}
                >
                  <Feather name="calendar" size={20} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.appointmentEmptyTitle}>
                    No upcoming sessions
                  </Text>
                  <Text style={styles.appointmentEmptySub}>
                    Book your first session today
                  </Text>
                </View>
                <Feather name="arrow-right" size={16} color="#16A34A" />
              </TouchableOpacity>
            )}
          </>
        )}

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
      {/* VIDEO PLAYER MODAL */}
      <Modal
        visible={!!playingVideo}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPlayingVideo(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 12,
              backgroundColor: "#111827",
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text
                numberOfLines={1}
                style={{ color: "#FFF", fontWeight: "700", fontSize: 15 }}
              >
                {playingVideo?.title}
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}
              >
                {playingVideo?.amharic_title}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setPlayingVideo(null)}
              style={{
                backgroundColor: "#374151",
                borderRadius: 20,
                padding: 8,
              }}
            >
              <Feather name="x" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Player */}
          {playingVideo && (
            <Video
              source={{ uri: playingVideo.video_url }}
              style={{ width: "100%", aspectRatio: 16 / 9 }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              onError={(error) => {
                console.warn("Video error", error);
                Alert.alert("Playback Error", "Could not play this video.");
                setPlayingVideo(null);
              }}
            />
          )}

          {/* Info below player */}
          <View style={{ padding: 20 }}>
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: "#4ADE80",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 12 }}>
                {playingVideo?.category}
              </Text>
            </View>
            <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 18 }}>
              {playingVideo?.title}
            </Text>
            <Text style={{ color: "#9CA3AF", fontSize: 14, marginTop: 6 }}>
              {playingVideo?.amharic_title}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 12,
              }}
            >
              <Feather name="headphones" size={14} color="#4ADE80" />
              <Text style={{ color: "#6B7280", fontSize: 13 }}>
                {playingVideo?.listens ?? 0} listens
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const GREEN = "#4ADE80";
const GREEN_DARK = "#16A34A";

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
    backgroundColor: GREEN,
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
    borderColor: GREEN,
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

  // Quick Actions
  quickActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
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
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  actionTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  amharicActionTitle: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  actionArrow: { position: "absolute", bottom: 16, right: 16 },

  // AI Chat Card
  aiChatCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  aiChatLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  aiChatAvatarWrap: { position: "relative" },
  aiChatAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  aiChatAvatarText: { fontSize: 13, fontWeight: "800", color: GREEN_DARK },
  aiChatOnlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: GREEN,
    borderWidth: 2,
    borderColor: "#fff",
  },
  aiChatNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  aiChatName: { fontSize: 15, fontWeight: "800", color: "#111827" },
  aiChatBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  aiChatBadgeText: { fontSize: 10, fontWeight: "800", color: GREEN_DARK },
  premierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  premierBadgeText: { fontSize: 10, fontWeight: "700", color: "#B45309" },
  aiChatSub: { fontSize: 12, color: "#6B7280" },
  aiUsageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  aiUsageTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    overflow: "hidden",
  },
  aiUsageFill: { height: "100%", borderRadius: 2 },
  aiUsageLabel: { fontSize: 10, fontWeight: "600", color: "#6B7280" },
  aiUnlimitedLabel: {
    fontSize: 11,
    color: GREEN_DARK,
    fontWeight: "600",
    marginTop: 4,
  },
  aiChatArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F0FDF4",
    justifyContent: "center",
    alignItems: "center",
  },

  // Locked AI chat card (free users)
  aiChatLockedCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFBEB",
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  aiChatLockedLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  aiChatLockedIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
  },
  aiChatLockedTitle: { fontSize: 14, fontWeight: "800", color: "#92400E" },
  aiChatLockedSub: { fontSize: 12, color: "#B45309", marginTop: 2 },
  aiChatUpgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#B45309",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  aiChatUpgradeBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  // Next Appointment Card
  appointmentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    overflow: "hidden",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },

  logoImage: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  logoTextWrap: {
    alignItems: "flex-end", // ← text aligns to the right edge
    justifyContent: "center",
  },
  logoTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.3,
  },
  logoSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  logoAmharic: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 1,
  },
  appointmentAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: GREEN_DARK,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  appointmentAvatarWrap: { position: "relative" },
  appointmentAvatar: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  appointmentOnlineDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: GREEN_DARK,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  appointmentName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  appointmentSpec: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 1,
    marginBottom: 6,
  },
  appointmentMetaRow: { flexDirection: "row", gap: 6 },
  appointmentMetaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  appointmentMetaText: { fontSize: 11, fontWeight: "600", color: GREEN_DARK },
  appointmentVerified: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#BBF7D0",
    alignSelf: "flex-start",
  },
  appointmentVerifiedText: {
    fontSize: 10,
    fontWeight: "700",
    color: GREEN_DARK,
  },

  appointmentEmptyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderStyle: "dashed",
  },
  appointmentEmptyTitle: { fontSize: 14, fontWeight: "700", color: "#374151" },
  appointmentEmptySub: { fontSize: 12, color: "#6B7280", marginTop: 2 },

  // Emergency
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
    color: GREEN,
    fontWeight: "600",
    fontSize: 14,
    marginBottom: 16,
  },

  // Videos
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
    backgroundColor: GREEN,
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

  // Modal
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
