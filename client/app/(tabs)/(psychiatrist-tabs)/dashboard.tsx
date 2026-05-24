import { useAuthStore } from "@/stores/authStore";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useState, useEffect, useCallback } from "react";
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { uploadSupportVideo } from "@/lib/uploadSupportVideo";
import { api } from "@/lib/api";

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=100&h=100&fit=crop";

function toStatNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Accepts current API shape or legacy keys from older responses. */
function normalizeDashboardStats(raw: unknown): {
  appointmentsToday: number;
  patientsCount: number;
  unreadMessagesCount: number;
  urgentAlertsCount: number;
} {
  const d =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    appointmentsToday: toStatNumber(d.appointmentsToday ?? d.appointments),
    patientsCount: toStatNumber(d.patientsCount ?? d.patients),
    unreadMessagesCount: toStatNumber(d.unreadMessagesCount ?? d.unreadMsgs),
    urgentAlertsCount: toStatNumber(d.urgentAlertsCount ?? d.urgentAlerts),
  };
}

export default function DashboardScreen() {
  const { width } = useWindowDimensions();
  const pad = width < 380 ? 16 : 24;

  // ✅ Stable auth slice selectors (avoid subscribing to entire store)
  const user = useAuthStore((s) => s.user);

  const doctorName = user?.full_name
    ? `Dr. ${user.full_name.split(" ")[0]}`
    : "Doctor";

  // --- API DATA STATES ---
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [alerts, setAlerts] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [statValues, setStatValues] = useState({
    appointmentsToday: 0,
    patientsCount: 0,
    unreadMessagesCount: 0,
    urgentAlertsCount: 0,
  });

  // --- UPLOAD MODAL STATES ---
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedVideo, setSelectedVideo] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [videoForm, setVideoForm] = useState({
    title: "",
    amharicTitle: "",
    tag: "",
  });

  // --- DATA FETCHING ---
  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);

      const [statsRes, alertsRes, apptsRes] = await Promise.all([
        api.get("/doctor/dashboard/stats"),
        api.get("/doctor/dashboard/alerts"),
        api.get("/doctor/appointments/today"),
      ]);

      setStatValues(normalizeDashboardStats(statsRes.data));
      setAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : []);
      setAppointments(Array.isArray(apptsRes.data) ? apptsRes.data : []);
    } catch (error) {
      console.error(error);

      Alert.alert("Error", "Could not load dashboard data");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboardData();
  }, []);

  const DASHBOARD_STATS = [
    {
      id: "1",
      title: "Today's Appts",
      amharic: "የዛሬ ቀጠሮዎች",
      value: String(statValues.appointmentsToday),
      icon: "calendar",
      color: "#3B82F6",
      bg: "#EFF6FF",
      route: "/(tabs)/(psychiatrist-tabs)/calender",
    },
    {
      id: "2",
      title: "My Patients",
      amharic: "የእኔ ታካሚዎች",
      value: String(statValues.patientsCount),
      icon: "users",
      color: "#10B981",
      bg: "#ECFDF5",
      route: "/(tabs)/(psychiatrist-tabs)/users",
    },
    {
      id: "3",
      title: "Unread Msgs",
      amharic: "ያልተነበቡ መልእክቶች",
      value: String(statValues.unreadMessagesCount),
      icon: "message-circle",
      color: "#F59E0B",
      bg: "#FFFBEB",
      route: "/(tabs)/(psychiatrist-tabs)/chats",
    },
    {
      id: "4",
      title: "Urgent Alerts",
      amharic: "አስቸኳይ",
      value: String(statValues.urgentAlertsCount),
      icon: "alert-triangle",
      color: "#EF4444",
      bg: "#FEF2F2",
      route: null,
    },
  ] as const;

  // --- VIDEO HANDLING ---
  const handlePickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets.length > 0) {
      setSelectedVideo(result.assets[0]);
    }
  };

  const handleUploadVideo = async () => {
    if (!selectedVideo) {
      Alert.alert("Please select a video");
      return;
    }

    try {
      setIsUploading(true);

      const filename = selectedVideo.uri.split("/").pop() || "video.mp4";

      const type = selectedVideo.mimeType || "video/mp4";

      await uploadSupportVideo({
        title: videoForm.title,
        amharicTitle: videoForm.amharicTitle,
        tag: videoForm.tag,

        video: {
          uri: selectedVideo.uri,
          name: filename,
          type,
        },

        onProgress(progress) {
          console.log("Upload:", Math.round(progress * 100), "%");
        },
      });

      Alert.alert("Success", "Video uploaded successfully");

      setSelectedVideo(null);

      setVideoForm({
        title: "",
        amharicTitle: "",
        tag: "",
      });

      setShowUploadModal(false);
    } catch (error) {
      console.error(error);

      let detail = "Please try again.";
      if (error && typeof error === "object" && "response" in error) {
        const r = error as { response?: { data?: unknown } };
        const data = r.response?.data;
        if (data && typeof data === "object") {
          const o = data as { message?: string; error?: string };
          detail =
            typeof o.message === "string"
              ? o.message
              : typeof o.error === "string"
                ? o.error
                : detail;
        }
      }

      Alert.alert("Upload failed", detail);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={[styles.header, { paddingHorizontal: pad }]}>
        <TouchableOpacity
          style={styles.profileHeader}
          onPress={() => router.push("/(tabs)/(psychiatrist-tabs)/profile")}
        >
          <Image
            source={{ uri: user?.avatar_url || DEFAULT_AVATAR }}
            style={styles.doctorAvatar}
          />
          <View>
            <Text style={styles.headerGreeting}>Welcome back,</Text>
            <Text style={styles.headerTitle}>{doctorName}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bellIcon}>
          <Feather name="bell" size={24} color="#111827" />
          {statValues.unreadMessagesCount > 0 && (
            <View style={styles.notificationDot} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#111827"
          />
        }
      >
        {isLoading ? (
          <ActivityIndicator
            size="large"
            color="#111827"
            style={{ marginTop: 40 }}
          />
        ) : (
          <>
            {/* QUICK ACTIONS */}
            <View style={styles.quickActionsContainer}>
              <TouchableOpacity
                style={[styles.quickActionBtn, { backgroundColor: "#111827" }]}
                onPress={() => setShowUploadModal(true)}
              >
                <Feather name="upload-cloud" size={20} color="#FFF" />
                <Text style={styles.quickActionTextActive}>Upload Video</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickActionBtn, { backgroundColor: "#F3F4F6" }]}
                onPress={() => router.push("/(tabs)/(psychiatrist-tabs)/users")}
              >
                <Feather name="users" size={20} color="#111827" />
                <Text style={styles.quickActionText}>View Patients</Text>
              </TouchableOpacity>
            </View>

            {/* STATS GRID */}
            <View style={styles.statsGrid}>
              {DASHBOARD_STATS.map((stat) => (
                <TouchableOpacity
                  key={stat.id}
                  style={[
                    styles.statCard,
                    { width: (width - pad * 2 - 16) / 2 },
                  ]}
                  onPress={() => stat.route && router.push(stat.route as any)}
                  activeOpacity={stat.route ? 0.7 : 1}
                >
                  <View
                    style={[
                      styles.statIconWrapper,
                      { backgroundColor: stat.bg },
                    ]}
                  >
                    <Feather name={stat.icon} size={20} color={stat.color} />
                  </View>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statTitle}>{stat.title}</Text>
                  <Text style={styles.statAmharic}>{stat.amharic}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* URGENT ALERTS SECTION */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Needs Attention{" "}
                <Text style={styles.sectionAmharic}>/ ትኩረት የሚሹ</Text>
              </Text>
            </View>

            {alerts.length === 0 ? (
              <Text style={styles.emptyText}>No urgent alerts right now.</Text>
            ) : (
              alerts.map((alert: any) => (
                <TouchableOpacity
                  key={alert.id}
                  style={styles.alertCard}
                  activeOpacity={0.8}
                  onPress={() =>
                    router.push(
                      `/(tabs)/(psychiatrist-tabs)/users/${alert.patientId}` as any,
                    )
                  }
                >
                  <View style={styles.alertLeft}>
                    <View style={styles.alertIcon}>
                      <Feather name="alert-circle" size={20} color="#EF4444" />
                    </View>
                    <View>
                      <Text style={styles.alertPatientName}>
                        {alert.patientName}
                      </Text>
                      <Text style={styles.alertStatus}>{alert.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.alertTime}>{alert.time}</Text>
                </TouchableOpacity>
              ))
            )}

            {/* TODAY'S APPOINTMENTS SECTION */}
            <View style={[styles.sectionHeader, { marginTop: 24 }]}>
              <Text style={styles.sectionTitle}>
                Todays Appointments{" "}
                <Text style={styles.sectionAmharic}>/ የዛሬ ቀጠሮዎች</Text>
              </Text>
              <TouchableOpacity
                onPress={() =>
                  router.push("/(tabs)/(psychiatrist-tabs)/calender")
                }
              >
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>

            {appointments.length === 0 ? (
              <Text style={styles.emptyText}>
                No appointments scheduled for today.
              </Text>
            ) : (
              appointments.map((appt: any) => (
                <View key={appt.id} style={styles.appointmentCard}>
                  <View style={styles.appointmentTop}>
                    <Image
                      source={{ uri: appt.avatar || DEFAULT_AVATAR }}
                      style={styles.patientAvatar}
                    />
                    <View style={styles.appointmentInfo}>
                      <Text style={styles.patientName}>{appt.patientName}</Text>
                      <Text style={styles.appointmentType}>
                        <Feather
                          name={appt.type === "Video Call" ? "video" : "phone"}
                          size={12}
                          color="#6B7280"
                        />{" "}
                        {appt.type}
                      </Text>
                    </View>
                    <View style={styles.timeBadge}>
                      <Text style={styles.timeText}>{appt.time}</Text>
                    </View>
                  </View>

                  <View style={styles.appointmentActions}>
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() =>
                        router.push(
                          `/(tabs)/(psychiatrist-tabs)/users/${appt.patientId}` as any,
                        )
                      }
                    >
                      <Text style={styles.secondaryButtonText}>Profile</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={() =>
                        router.push({
                          pathname: "/chats/[peer]",
                          params: {
                            peer: appt.patientId,
                            startCall: "true",
                          },
                        })
                      }
                    >
                      <Text style={styles.primaryButtonText}>Start Call</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* UPLOAD VIDEO MODAL */}
      <Modal
        visible={showUploadModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Upload Support Video</Text>
              <Text style={styles.amharicModalTitle}>የድጋፍ ቪዲዮ ይስቀሉ</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowUploadModal(false)}
              style={styles.closeButton}
            >
              <Feather name="x" size={24} color="#111827" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <TouchableOpacity
              style={styles.videoPickerBox}
              onPress={handlePickVideo}
            >
              {selectedVideo ? (
                <View style={styles.selectedVideoContainer}>
                  <Feather name="check-circle" size={32} color="#10B981" />
                  <Text style={styles.videoPickerText}>Video Selected</Text>
                  <Text style={styles.videoPickerSub} numberOfLines={1}>
                    {selectedVideo.uri.split("/").pop()}
                  </Text>
                </View>
              ) : (
                <>
                  <Feather name="video" size={32} color="#9CA3AF" />
                  <Text style={styles.videoPickerText}>
                    Tap to select video file
                  </Text>
                  <Text style={styles.videoPickerSub}>MP4, MOV (Max 50MB)</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Video Title</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 5-Minute Morning Calm"
                placeholderTextColor="#9CA3AF"
                value={videoForm.title}
                onChangeText={(t) => setVideoForm({ ...videoForm, title: t })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Amharic Title (የአማርኛ ርዕስ)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. የ5 ደቂቃ የጠዋት ማረጋጋት"
                placeholderTextColor="#9CA3AF"
                value={videoForm.amharicTitle}
                onChangeText={(t) =>
                  setVideoForm({ ...videoForm, amharicTitle: t })
                }
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Category / Tag</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Mindfulness, Anxiety"
                placeholderTextColor="#9CA3AF"
                value={videoForm.tag}
                onChangeText={(t) => setVideoForm({ ...videoForm, tag: t })}
              />
            </View>

            <TouchableOpacity
              style={[styles.uploadSubmitBtn, isUploading && { opacity: 0.7 }]}
              onPress={handleUploadVideo}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Feather name="upload" size={18} color="#FFF" />
                  <Text style={styles.uploadSubmitText}>Upload Video</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  profileHeader: { flexDirection: "row", alignItems: "center" },
  doctorAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  headerGreeting: { fontSize: 13, color: "#6B7280" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  bellIcon: { padding: 8, backgroundColor: "#F3F4F6", borderRadius: 20 },
  notificationDot: {
    position: "absolute",
    top: 8,
    right: 10,
    width: 8,
    height: 8,
    backgroundColor: "#EF4444",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#FFF",
  },

  scroll: { paddingTop: 20, paddingBottom: 32, flexGrow: 1 },

  quickActionsContainer: { flexDirection: "row", gap: 12, marginBottom: 24 },
  quickActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  quickActionTextActive: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  quickActionText: { color: "#111827", fontWeight: "700", fontSize: 15 },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  statValue: { fontSize: 24, fontWeight: "800", color: "#111827" },
  statTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
    marginTop: 4,
  },
  statAmharic: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  sectionAmharic: { fontSize: 14, color: "#6B7280", fontWeight: "normal" },
  seeAllText: { color: "#4ADE80", fontWeight: "600", fontSize: 14 },

  alertCard: {
    backgroundColor: "#FEF2F2",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  alertLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  alertIcon: {
    width: 36,
    height: 36,
    backgroundColor: "#FEE2E2",
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  alertPatientName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  alertStatus: { fontSize: 13, color: "#EF4444", marginTop: 2 },
  alertTime: { fontSize: 12, color: "#9CA3AF" },

  appointmentCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  appointmentTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  patientAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  appointmentInfo: { flex: 1 },
  patientName: { fontSize: 16, fontWeight: "700", color: "#111827" },
  appointmentType: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  timeBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  timeText: { fontSize: 12, fontWeight: "600", color: "#374151" },
  appointmentActions: { flexDirection: "row", gap: 12 },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  primaryButtonText: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },

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
  modalBody: { padding: 20 },
  videoPickerBox: {
    backgroundColor: "#F3F4F6",
    height: 160,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    overflow: "hidden",
  },
  videoPickerText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4B5563",
    marginTop: 12,
  },
  videoPickerSub: { fontSize: 13, color: "#9CA3AF", marginTop: 4 },
  inputGroup: { marginBottom: 20 },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#111827",
  },
  uploadSubmitBtn: {
    backgroundColor: "#4ADE80",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 10,
    gap: 8,
  },
  uploadSubmitText: { color: "#FFF", fontSize: 16, fontWeight: "bold" },

  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginVertical: 16,
    fontStyle: "italic",
  },
  selectedVideoContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
});
