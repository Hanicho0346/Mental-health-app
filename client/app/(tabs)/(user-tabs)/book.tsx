/**
 * book.tsx  (app/(tabs)/(user-tabs)/book.tsx)
 *
 * Changes vs original:
 *  - Slots are now fetched from GET /appointments/slots?psychiatrist_id=X&date=YYYY-MM-DD
 *    so booked times come back as available:false for ALL users.
 *  - counselorChip now uses full_name (was c.name which is undefined in CounselorDto).
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "@/lib/api";
import { getApiErrorMessage, logClientError } from "@/lib/log";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CounselorDto {
  id: string;
  full_name: string;
  specialization: string;
  rating?: number;
  sessions_count?: number;
}

interface TimeSlot {
  id: string;
  label: string;
  scheduled_at: string;
  available: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNextDays(
  count: number,
): { label: string; short: string; iso: string }[] {
  const days: { label: string; short: string; iso: string }[] = [];
  const now = new Date();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  for (let i = 1; i <= count; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push({
      label: `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]}`,
      short: `${dayNames[d.getDay()]}\n${d.getDate()}`,
      iso: d.toISOString().split("T")[0],
    });
  }
  return days;
}

// Fixed time options — backend decides which are booked
const TIME_OPTIONS = [
  { time: "09:00", label: "9:00 AM" },
  { time: "10:00", label: "10:00 AM" },
  { time: "11:00", label: "11:00 AM" },
  { time: "13:00", label: "1:00 PM" },
  { time: "14:00", label: "2:00 PM" },
  { time: "15:00", label: "3:00 PM" },
  { time: "16:00", label: "4:00 PM" },
  { time: "17:00", label: "5:00 PM" },
];

const GREEN = "#4ADE80";
const GREEN_DARK = "#16A34A";

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BookSessionScreen() {
  const [counselors, setCounselors] = useState<CounselorDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCounselorId, setSelectedCounselorId] = useState<string | null>(
    null,
  );

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const days = useMemo(() => getNextDays(7), []);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const selectedDay = days[selectedDayIndex];

  const selectedCounselor =
    counselors.find((c) => c.id === selectedCounselorId) ?? null;

  // ── Load counselors ──────────────────────────────────────────────────────
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

  // ── Fetch slots from backend whenever psychiatrist or date changes ────────
  //
  // Backend endpoint: GET /appointments/slots?psychiatrist_id=X&date=YYYY-MM-DD
  // Returns: { slots: { time: "09:00", booked: boolean }[] }
  //
  // If a slot is booked by ANY user for this psychiatrist on this date,
  // the backend returns booked:true → we mark it available:false.
  //
  useEffect(() => {
    if (!selectedCounselorId) return;

    let cancelled = false;
    setSlotsLoading(true);
    setSelectedSlot(null);

    void (async () => {
      try {
        const { data } = await api.get<{
          slots: { time: string; booked: boolean }[];
        }>(
          `/appointments/slots?psychiatrist_id=${selectedCounselorId}&date=${selectedDay.iso}`,
        );

        if (!cancelled) {
          // Map backend response → TimeSlot shape the UI already understands
          const mapped: TimeSlot[] = TIME_OPTIONS.map((opt) => {
            const fromServer = data.slots.find((s) => s.time === opt.time);
            return {
              id: `${selectedDay.iso}-${opt.time}`,
              label: opt.label,
              scheduled_at: `${selectedDay.iso}T${opt.time}:00.000Z`,
              // If backend didn't return this slot at all, treat as available
              available: fromServer ? !fromServer.booked : true,
            };
          });
          setSlots(mapped);
        }
      } catch (e) {
        logClientError("book.loadSlots", e);
        if (!cancelled) {
          // Fallback: show all slots as available so user isn't blocked
          const fallback: TimeSlot[] = TIME_OPTIONS.map((opt) => ({
            id: `${selectedDay.iso}-${opt.time}`,
            label: opt.label,
            scheduled_at: `${selectedDay.iso}T${opt.time}:00.000Z`,
            available: true,
          }));
          setSlots(fallback);
        }
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCounselorId, selectedDay.iso]);

  const handleDaySelect = useCallback((index: number) => {
    setSelectedDayIndex(index);
    setSelectedSlot(null);
  }, []);

  const handleContinue = useCallback(() => {
    if (!selectedSlot || !selectedCounselorId || !selectedCounselor) return;
    router.push({
      pathname: "/(tabs)/(user-tabs)/payment-confirmation",
      params: {
        psychiatrist_id: selectedCounselor.id,
        psychiatrist_name: selectedCounselor.full_name,
        specialization: selectedCounselor.specialization,
        rating: String(selectedCounselor.rating ?? "4.9"),
        sessions_count: String(selectedCounselor.sessions_count ?? "0"),
        scheduled_at: selectedSlot.scheduled_at,
        time_label: `${selectedDay.label} at ${selectedSlot.label}`,
        date_label: selectedDay.label,
        time_of_day: selectedSlot.label,
      },
    });
  }, [selectedSlot, selectedDay, selectedCounselor, selectedCounselorId]);

  // ── Loading / empty states ────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <Header />
        <View style={s.loadingCenter}>
          <ActivityIndicator size="large" color={GREEN_DARK} />
          <Text style={s.loadingText}>Loading psychiatrists…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (counselors.length === 0) {
    return (
      <SafeAreaView style={s.root}>
        <Header />
        <View style={s.loadingCenter}>
          <Feather name="alert-circle" size={36} color="#9CA3AF" />
          <Text style={s.loadingText}>No psychiatrists available.</Text>
          <TouchableOpacity
            style={s.retryBtn}
            onPress={() => void loadCounselors()}
          >
            <Text style={s.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const canContinue = !!selectedSlot && !!selectedCounselorId;

  return (
    <SafeAreaView style={s.root}>
      <Header />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Psychiatrist Selector */}
        {counselors.length > 1 && (
          <>
            <SectionLabel title="Select Psychiatrist" icon="users" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.counselorScroll}
              contentContainerStyle={s.counselorScrollContent}
            >
              {counselors.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    s.counselorChip,
                    selectedCounselorId === c.id && s.counselorChipActive,
                  ]}
                  onPress={() => {
                    setSelectedCounselorId(c.id);
                    setSelectedSlot(null);
                  }}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      s.counselorChipAvatar,
                      selectedCounselorId === c.id &&
                        s.counselorChipAvatarActive,
                    ]}
                  >
                    <Feather
                      name="user"
                      size={16}
                      color={
                        selectedCounselorId === c.id ? "#FFFFFF" : GREEN_DARK
                      }
                    />
                  </View>
                  <Text
                    style={[
                      s.counselorChipName,
                      selectedCounselorId === c.id && s.counselorChipNameActive,
                    ]}
                    numberOfLines={1}
                  >
                    {c.full_name}
                  </Text>
                  <Text
                    style={[
                      s.counselorChipSpec,
                      selectedCounselorId === c.id && { color: "#BBF7D0" },
                    ]}
                    numberOfLines={1}
                  >
                    {c.specialization}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Psychiatrist Card */}
        {selectedCounselor && (
          <View style={s.doctorCard}>
            <View style={s.doctorAvatarWrap}>
              <View style={s.doctorAvatar}>
                <Feather name="user" size={30} color="#16A34A" />
              </View>
              <View style={s.onlineDot} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.doctorName}>{selectedCounselor.full_name}</Text>
              <Text style={s.doctorSpec}>
                {selectedCounselor.specialization}
              </Text>
              <View style={s.doctorMeta}>
                <View style={s.metaChip}>
                  <Feather name="star" size={11} color="#F59E0B" />
                  <Text style={s.metaChipText}>
                    {selectedCounselor.rating ?? "4.9"}
                  </Text>
                </View>
                <View style={[s.metaChip, { backgroundColor: "#EFF6FF" }]}>
                  <Feather name="users" size={11} color="#2563EB" />
                  <Text style={[s.metaChipText, { color: "#2563EB" }]}>
                    {selectedCounselor.sessions_count ?? 0} sessions
                  </Text>
                </View>
              </View>
            </View>
            <View style={s.verifiedBadge}>
              <Feather name="shield" size={12} color="#16A34A" />
              <Text style={s.verifiedText}>Verified</Text>
            </View>
          </View>
        )}

        {/* Session Fee Banner */}
        <View style={s.feeBanner}>
          <View>
            <Text style={s.feeLabel}>Session Fee</Text>
            <Text style={s.feeNote}>One-time payment, full access</Text>
          </View>
          <Text style={s.feeAmount}>ETB 300</Text>
        </View>

        {/* Date Selection */}
        <SectionLabel title="Select Date" icon="calendar" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.dateScroll}
          contentContainerStyle={s.dateScrollContent}
        >
          {days.map((day, i) => (
            <TouchableOpacity
              key={day.iso}
              style={[s.dayChip, selectedDayIndex === i && s.dayChipActive]}
              onPress={() => handleDaySelect(i)}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  s.dayChipText,
                  selectedDayIndex === i && s.dayChipTextActive,
                ]}
              >
                {day.short}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Time Slot Selection */}
        <SectionLabel title="Select Time" icon="clock" />

        {slotsLoading ? (
          <View style={s.slotsLoading}>
            <ActivityIndicator size="small" color={GREEN_DARK} />
            <Text style={s.slotsLoadingText}>Checking availability…</Text>
          </View>
        ) : (
          <View style={s.slotsGrid}>
            {slots.map((slot) => {
              const isSelected = selectedSlot?.id === slot.id;
              const isBooked = !slot.available;
              return (
                <TouchableOpacity
                  key={slot.id}
                  style={[
                    s.slotChip,
                    isSelected && s.slotChipActive,
                    isBooked && s.slotChipBooked, // ← red-tinted "booked" style
                  ]}
                  onPress={() => slot.available && setSelectedSlot(slot)}
                  activeOpacity={slot.available ? 0.75 : 1}
                  disabled={isBooked}
                >
                  <Text
                    style={[
                      s.slotText,
                      isSelected && s.slotTextActive,
                      isBooked && s.slotTextBooked,
                    ]}
                  >
                    {slot.label}
                  </Text>
                  {/* Show "Booked" label instead of generic "Full" */}
                  {isBooked && <Text style={s.slotBookedLabel}>Booked</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Selected summary */}
        {selectedSlot && (
          <View style={s.selectionSummary}>
            <Feather name="check-circle" size={16} color="#16A34A" />
            <Text style={s.selectionText}>
              {selectedDay.label} · {selectedSlot.label}
            </Text>
          </View>
        )}

        {/* CTA */}
        <TouchableOpacity
          style={[s.ctaBtn, !canContinue && s.ctaBtnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.85}
        >
          <Text style={[s.ctaBtnText, !canContinue && { color: "#9CA3AF" }]}>
            Continue to Payment
          </Text>
          <Feather
            name="arrow-right"
            size={18}
            color={canContinue ? "#111827" : "#9CA3AF"}
          />
        </TouchableOpacity>

        <Text style={s.disclaimer}>
          Sessions are 50 minutes. Cancel 24 hours before for a full refund.
        </Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={s.header}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <Feather name="chevron-left" size={22} color="#111827" />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Book a Session</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

function SectionLabel({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={s.sectionLabel}>
      <Feather name={icon as any} size={14} color="#6B7280" />
      <Text style={s.sectionLabelText}>{title}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  loadingCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: "#6B7280" },
  retryBtn: {
    marginTop: 4,
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryBtnText: { fontSize: 14, fontWeight: "700", color: "#111827" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  scroll: { paddingHorizontal: 16, paddingTop: 20 },
  counselorScroll: { marginBottom: 16 },
  counselorScrollContent: { paddingRight: 16, gap: 10 },
  counselorChip: {
    width: 110,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    alignItems: "center",
    gap: 6,
  },
  counselorChipActive: { backgroundColor: GREEN_DARK, borderColor: GREEN_DARK },
  counselorChipAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  counselorChipAvatarActive: { backgroundColor: "rgba(255,255,255,0.2)" },
  counselorChipName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  counselorChipNameActive: { color: "#FFFFFF" },
  counselorChipSpec: { fontSize: 10, color: "#6B7280", textAlign: "center" },
  doctorCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  doctorAvatarWrap: { position: "relative" },
  doctorAvatar: {
    width: 58,
    height: 58,
    borderRadius: 15,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  onlineDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GREEN_DARK,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  doctorName: { fontSize: 16, fontWeight: "700", color: "#111827" },
  doctorSpec: { fontSize: 13, color: "#6B7280", marginTop: 2, marginBottom: 6 },
  doctorMeta: { flexDirection: "row", gap: 6 },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  metaChipText: { fontSize: 11, fontWeight: "600", color: "#92400E" },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#BBF7D0",
    alignSelf: "flex-start",
  },
  verifiedText: { fontSize: 11, fontWeight: "700", color: GREEN_DARK },
  feeBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F0FDF4",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  feeLabel: { fontSize: 13, fontWeight: "700", color: GREEN_DARK },
  feeNote: { fontSize: 11, color: "#6B7280", marginTop: 1 },
  feeAmount: { fontSize: 22, fontWeight: "800", color: GREEN_DARK },
  sectionLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  sectionLabelText: { fontSize: 13, fontWeight: "700", color: "#374151" },
  dateScroll: { marginBottom: 20 },
  dateScrollContent: { paddingRight: 16, gap: 8 },
  dayChip: {
    width: 56,
    height: 64,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  dayChipActive: { backgroundColor: GREEN_DARK, borderColor: GREEN_DARK },
  dayChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 16,
  },
  dayChipTextActive: { color: "#FFFFFF" },

  // Slots
  slotsLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 20,
    justifyContent: "center",
  },
  slotsLoadingText: { fontSize: 13, color: "#6B7280" },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  slotChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minWidth: "22%",
    alignItems: "center",
  },
  slotChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  // Booked slots get a soft red tint so it's obvious why they can't tap it
  slotChipBooked: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  slotText: { fontSize: 12, fontWeight: "600", color: "#374151" },
  slotTextActive: { color: "#111827" },
  slotTextBooked: { color: "#FCA5A5" },
  slotBookedLabel: {
    fontSize: 9,
    color: "#F87171",
    marginTop: 1,
    fontWeight: "700",
  },

  selectionSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FDF4",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  selectionText: { fontSize: 13, fontWeight: "600", color: GREEN_DARK },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: GREEN,
    borderRadius: 14,
    height: 56,
    marginBottom: 12,
  },
  ctaBtnDisabled: { backgroundColor: "#F3F4F6" },
  ctaBtnText: { fontSize: 16, fontWeight: "700", color: "#111827" },
  disclaimer: {
    textAlign: "center",
    fontSize: 11,
    color: "#9CA3AF",
    lineHeight: 16,
    paddingHorizontal: 8,
  },
});
