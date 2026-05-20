import { api } from "@/lib/api";
import { getApiErrorMessage, logClientError } from "@/lib/log";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type CounselorDto = {
  id: string;
  full_name: string;
  full_name_am: string;
  specialty: string;
  specialty_am: string;
  avatar_url: string;
  rating: number;
  reviews: number;
};

type TimeSlot = { label: string; hour: number; minute: number };

const TIME_SLOTS: TimeSlot[] = [
  { label: "09:00 AM", hour: 9, minute: 0 },
  { label: "10:30 AM", hour: 10, minute: 30 },
  { label: "01:00 PM", hour: 13, minute: 0 },
  { label: "02:30 PM", hour: 14, minute: 30 },
  { label: "04:00 PM", hour: 16, minute: 0 },
  { label: "05:30 PM", hour: 17, minute: 30 },
];

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function nextSevenDays(): {
  key: string;
  dayLabel: string;
  dayNum: number;
  date: Date;
}[] {
  const out: { key: string; dayLabel: string; dayNum: number; date: Date }[] =
    [];
  const base = startOfLocalDay(new Date());
  for (let i = 0; i < 7; i++) {
    const date = new Date(base);
    date.setDate(base.getDate() + i);
    out.push({
      key: date.toISOString().slice(0, 10),
      dayLabel: date
        .toLocaleDateString(undefined, { weekday: "short" })
        .toUpperCase(),
      dayNum: date.getDate(),
      date,
    });
  }
  return out;
}

function combineDateAndSlot(date: Date, slot: TimeSlot): Date {
  const when = new Date(date);
  when.setHours(slot.hour, slot.minute, 0, 0);
  return when;
}

export default function BookScreen() {
  const [counselors, setCounselors] = useState<CounselorDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCounselorId, setSelectedCounselorId] = useState<string | null>(
    null,
  );
  const days = useMemo(() => nextSevenDays(), []);
  const [selectedDayKey, setSelectedDayKey] = useState(
    () => days[0]?.key ?? "",
  );
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot>(TIME_SLOTS[1]!);
  const [confirming, setConfirming] = useState(false);

  const selectedDay = days.find((d) => d.key === selectedDayKey) ?? days[0];
  const selectedCounselor =
    counselors.find((c) => c.id === selectedCounselorId) ?? null;

  const loadCounselors = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<CounselorDto[]>(
        "/appointments/counselors",
      );
      setCounselors(data);
      setSelectedCounselorId((prev) => {
        if (prev && data.some((c) => c.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
    } catch (e) {
      logClientError("book.loadCounselors", e);
      Alert.alert("Could not load counselors", getApiErrorMessage(e));
      setCounselors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCounselors();
    }, [loadCounselors]),
  );

  async function confirmBooking(): Promise<void> {
    if (!selectedCounselorId || !selectedDay) {
      Alert.alert("Missing selection", "Choose a counselor, date, and time.");
      return;
    }
    if (confirming) return;
    setConfirming(true);
    try {
      const when = combineDateAndSlot(selectedDay.date, selectedSlot);
      await api.post("/appointments", {
        counselor_id: selectedCounselorId,
        scheduled_at: when.toISOString(),
        time_label: selectedSlot.label,
      });
      Alert.alert(
        "Booked",
        "Your session is saved. You will receive a confirmation in chat.",
        [{ text: "OK", onPress: () => router.push("/(tabs)/(user-tabs)/home") }],
      );
    } catch (e) {
      logClientError("book.confirmBooking", e, {
        counselor_id: selectedCounselorId,
        day: selectedDayKey,
        slot: selectedSlot.label,
      });
      Alert.alert("Booking failed", getApiErrorMessage(e));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book a Session / ቀጠሮ ...</Text>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Feather name="search" size={24} color="#4B5563" />
          <Feather name="filter" size={24} color="#4B5563" />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>Choose a Counselor</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {loading ? "…" : `${Math.max(counselors.length, 0)} Available`}
            </Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color="#4ADE80" />
        ) : (
          counselors.map((c) => {
            const active = c.id === selectedCounselorId;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.card, active && styles.cardSelected]}
                onPress={() => setSelectedCounselorId(c.id)}
                activeOpacity={0.9}
              >
                <View style={styles.counselorHeader}>
                  <Image source={{ uri: c.avatar_url }} style={styles.avatar} />
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{c.full_name}</Text>
                      <Text style={styles.rating}>
                        <Ionicons name="star" size={14} color="#F59E0B" />{" "}
                        {c.rating}
                      </Text>
                    </View>
                    <Text style={styles.amharicName}>{c.full_name_am}</Text>
                    <Text style={styles.specialty}>{c.specialty}</Text>
                    <Text style={styles.amharicSpecialty}>
                      {c.specialty_am}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.reviews}>{c.reviews} reviews</Text>
                  <Text style={styles.viewProfile}>
                    {active ? "Selected" : "Tap to select"}{" "}
                    <Feather name="chevron-right" size={14} />
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={styles.selectionSection}>
          <Text style={styles.sectionTitle}>
            <Feather name="calendar" size={16} color="#4ADE80" /> Select Date /
            ቀን ይምረጡ
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, marginTop: 12 }}
          >
            {days.map((d) => {
              const active = d.key === selectedDayKey;
              return (
                <TouchableOpacity
                  key={d.key}
                  style={[
                    styles.dateBox,
                    active ? styles.dateBoxActive : undefined,
                  ]}
                  onPress={() => setSelectedDayKey(d.key)}
                >
                  <Text style={active ? styles.dateDayActive : styles.dateDay}>
                    {d.dayLabel}
                  </Text>
                  <Text style={active ? styles.dateNumActive : styles.dateNum}>
                    {d.dayNum}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.selectionSection}>
          <Text style={styles.sectionTitle}>
            <Feather name="clock" size={16} color="#4ADE80" /> Available Slots /
            የሚገኙ ሰዓቶች
          </Text>
          <View style={styles.timeGrid}>
            {TIME_SLOTS.map((slot) => {
              const active = slot.label === selectedSlot.label;
              return (
                <TouchableOpacity
                  key={slot.label}
                  style={[
                    styles.timeBox,
                    active ? styles.timeBoxActive : undefined,
                  ]}
                  onPress={() => setSelectedSlot(slot)}
                >
                  {active ? (
                    <Feather
                      name="check-circle"
                      size={14}
                      color="#4ADE80"
                      style={{ marginRight: 6 }}
                    />
                  ) : null}
                  <Text
                    style={active ? styles.timeTextActive : styles.timeText}
                  >
                    {slot.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.infoBox}>
          <View style={styles.infoIcon}>
            <Feather name="calendar" size={20} color="#4ADE80" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.infoTitle}>Instant Booking</Text>
            <Text style={styles.infoDesc}>
              All sessions are confidential and end-to-end encrypted for your
              safety.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => void confirmBooking()}
          disabled={confirming || !selectedCounselor}
        >
          {confirming ? (
            <ActivityIndicator color="#111827" />
          ) : (
            <Text style={styles.buttonText}>
              Confirm Booking / ቀጠሮ አረጋግጥ{" "}
              <Feather name="chevron-right" size={18} />
            </Text>
          )}
        </TouchableOpacity>
        <Text style={styles.disclaimer}>
          {selectedCounselor
            ? `With ${selectedCounselor.full_name} • ${selectedSlot.label}`
            : "Select a counselor to continue."}
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#111827" },
  scrollContent: { paddingHorizontal: 20 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  pageTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  badge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { color: "#22C55E", fontSize: 12, fontWeight: "bold" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  cardSelected: { borderColor: "#4ADE80", backgroundColor: "#F0FDF4" },
  counselorHeader: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  nameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { fontSize: 16, fontWeight: "bold", color: "#111827" },
  rating: { fontSize: 14, fontWeight: "600", color: "#4B5563" },
  amharicName: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  specialty: {
    fontSize: 14,
    color: "#4ADE80",
    fontWeight: "600",
    marginTop: 6,
  },
  amharicSpecialty: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  reviews: { color: "#6B7280", fontSize: 13 },
  viewProfile: { color: "#4ADE80", fontSize: 14, fontWeight: "bold" },
  selectionSection: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
    marginBottom: 8,
  },
  dateBox: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    width: 70,
  },
  dateBoxActive: { backgroundColor: "#4ADE80", borderColor: "#4ADE80" },
  dateDay: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "bold",
    marginBottom: 4,
  },
  dateNum: { fontSize: 18, color: "#111827", fontWeight: "bold" },
  dateDayActive: {
    fontSize: 12,
    color: "#111827",
    fontWeight: "bold",
    marginBottom: 4,
  },
  dateNumActive: { fontSize: 18, color: "#111827", fontWeight: "bold" },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  timeBox: {
    width: "31%",
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  timeBoxActive: { backgroundColor: "#DCFCE7", borderColor: "#4ADE80" },
  timeText: { fontSize: 13, color: "#4B5563", fontWeight: "600" },
  timeTextActive: { fontSize: 13, color: "#22C55E", fontWeight: "bold" },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#ECFDF5",
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  infoIcon: {
    width: 40,
    height: 40,
    backgroundColor: "#DCFCE7",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
  },
  infoDesc: { fontSize: 13, color: "#4B5563", lineHeight: 20 },
  button: {
    backgroundColor: "#4ADE80",
    borderRadius: 16,
    height: 56,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: { color: "#111827", fontSize: 16, fontWeight: "700" },
  disclaimer: { textAlign: "center", fontSize: 12, color: "#9CA3AF" },
});
