import { api } from "@/lib/api";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Alert,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=100&h=100&fit=crop";

// Helper to generate the next 30 days for the calendar strip
const generateDateRange = () => {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + i);
    dates.push({
      fullDate: nextDate.toISOString().split("T")[0], // YYYY-MM-DD
      dayName: nextDate.toLocaleDateString("en-US", { weekday: "short" }), // Mon, Tue
      dayNum: nextDate.getDate(), // 1, 2, 3
      isToday: i === 0,
    });
  }
  return dates;
};

export default function CalendarScreen() {
  const { width } = useWindowDimensions();
  const pad = width < 380 ? 16 : 24;

  const dates = useMemo(() => generateDateRange(), []);
  
  // --- STATES ---
  const [selectedDate, setSelectedDate] = useState(dates[0].fullDate);
  const [appointments, setAppointments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
const hasFetched = useRef(false);
  // --- API FETCH ---
  const fetchAppointments = async (date: string) => {
    try {
      // Pass the selected date to the backend to filter appointments
      const { data } = await api.get("/doctor/appointments/date", {
        params: { date },
      });
      setAppointments(data);
    } catch (error) {
      console.error("Calendar fetch error:", error);
      Alert.alert("Error", "Could not load appointments for this date.");
      
      // Fallback empty data on error to prevent infinite spinners
      setAppointments([]); 
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  // Re-fetch when the selected date changes
  useEffect(() => {
    setIsLoading(true);
     if (hasFetched.current) return;
  hasFetched.current = true;
    fetchAppointments(selectedDate);
  }, [selectedDate]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAppointments(selectedDate);
  }, [selectedDate]);

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={[styles.header, { paddingHorizontal: pad }]}>
        <View>
          <Text style={styles.headerTitle}>Schedule</Text>
          <Text style={styles.headerSub}>የቀጠሮ ማስታወሻ</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => Alert.alert("Coming Soon", "Add manual appointment")}
        >
          <Feather name="plus" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* HORIZONTAL CALENDAR STRIP */}
      <View style={styles.calendarStripContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: pad, gap: 12 }}
        >
          {dates.map((dateObj) => {
            const isSelected = selectedDate === dateObj.fullDate;
            return (
              <TouchableOpacity
                key={dateObj.fullDate}
                style={[
                  styles.dateCard,
                  isSelected && styles.dateCardActive,
                ]}
                onPress={() => setSelectedDate(dateObj.fullDate)}
              >
                <Text
                  style={[
                    styles.dateDayName,
                    isSelected && styles.dateTextActive,
                  ]}
                >
                  {dateObj.dayName}
                </Text>
                <Text
                  style={[
                    styles.dateDayNum,
                    isSelected && styles.dateTextActive,
                  ]}
                >
                  {dateObj.dayNum}
                </Text>
                {dateObj.isToday && (
                  <View
                    style={[
                      styles.todayDot,
                      isSelected && { backgroundColor: "#FFF" },
                    ]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* APPOINTMENTS LIST */}
      {isLoading ? (
        <ActivityIndicator size="large" color="#111827" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={[styles.listContainer, { paddingHorizontal: pad }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#111827" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="calendar" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>No appointments for this day.</Text>
              <Text style={styles.emptySubText}>በዚህ ቀን ምንም ቀጠሮ የሎትም።</Text>
            </View>
          }
          renderItem={({ item: appt }) => (
            <View style={styles.appointmentCard}>
              <View style={styles.appointmentTop}>
                <Image
                  source={{ uri: appt.avatar || DEFAULT_AVATAR }}
                  style={styles.patientAvatar}
                />
                <View style={styles.appointmentInfo}>
                  <Text style={styles.patientName}>{appt.patientName}</Text>
                  <Text style={styles.appointmentType}>
                    <Feather
                      name={appt.type === "Video Call" ? "video" : "map-pin"}
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

              {appt.notes && (
                <View style={styles.notesBox}>
                  <Text style={styles.notesText} numberOfLines={2}>
                    <Text style={{ fontWeight: "600" }}>Note: </Text>
                    {appt.notes}
                  </Text>
                </View>
              )}

              <View style={styles.appointmentActions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.push(`/(tabs)/(psychiatrist-tabs)/users/${appt.patientId}` as any)}
                >
                  <Text style={styles.secondaryButtonText}>Profile</Text>
                </TouchableOpacity>
               <TouchableOpacity
  style={[
    styles.primaryButton,
    appt.type !== "Video Call" && {
      backgroundColor: "#10B981",
    },
  ]}
  onPress={() => {
    if (appt.type === "Video Call") {
      router.push({
        pathname:
          "/(tabs)/(psychiatrist-tabs)/chats/[peer]",
        params: {
          peer: appt.patientId,
          startCall: "true",
        },
      });
    } else {
      Alert.alert("Patient marked as arrived");
    }
  }}
>
  <Text style={styles.primaryButtonText}>
    {appt.type === "Video Call"
      ? "Start Call"
      : "Mark Arrived"}
  </Text>
</TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
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
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#111827" },
  headerSub: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  addBtn: {
    backgroundColor: "#111827",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },

  calendarStripContainer: {
    backgroundColor: "#FFFFFF",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dateCard: {
    width: 60,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  dateCardActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  dateDayName: { fontSize: 13, color: "#6B7280", marginBottom: 4 },
  dateDayNum: { fontSize: 18, fontWeight: "700", color: "#111827" },
  dateTextActive: { color: "#FFFFFF" },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#EF4444",
    marginTop: 6,
  },

  listContainer: { paddingTop: 20, paddingBottom: 40 },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 4,
  },

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
  
  notesBox: {
    marginTop: 12,
    backgroundColor: "#FFFBEB",
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
  },
  notesText: { fontSize: 13, color: "#92400E", lineHeight: 18 },

  appointmentActions: { flexDirection: "row", gap: 12, marginTop: 16 },
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
});