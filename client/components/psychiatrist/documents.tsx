import {
  uploadPsychiatristDocument,
  fetchPsychiatristVerificationStatus,
  DocumentType,
} from "@/lib/psychiatristApi";
import { getApiErrorMessage } from "@/lib/log";
import { useRemoteData } from "@/lib/useRemoteData";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  DocumentUploadCard,
  DocumentList,
} from "@/components/psychiatrist/DocumentUploadCard";
import { StatusBadge } from "@/components/psychiatrist/StatusBadge";

type UploadingDocType = DocumentType | null;

// ─── Required docs info ────────────────────────────────────────────────────────
const REQUIRED_DOCS = [
  {
    icon: "file-text",
    label: "Medical License",
    desc: "Valid license from your country or region",
  },
  {
    icon: "user",
    label: "National ID",
    desc: "Government-issued photo identification",
  },
  {
    icon: "award",
    label: "Professional Certificate",
    desc: "Evidence of professional credentials",
  },
];

// ─── Screen ────────────────────────────────────────────────────────────────────
export default function DocumentsScreen() {
  const {
    data: status,
    loading,
    error,
    reload,
  } = useRemoteData(fetchPsychiatristVerificationStatus, []);
  const [uploading, setUploading] = useState<UploadingDocType>(null);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const handleUploadDocument = async (docType: DocumentType) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        setUploading(docType);

        try {
          await uploadPsychiatristDocument(
            {
              uri: asset.uri,
              type: asset.mimeType || "application/octet-stream",
              name:
                asset.name ||
                `document.${asset.mimeType?.split("/")[1] || "bin"}`,
            },
            docType,
          );
          Alert.alert("Success", "Document uploaded successfully");
          await reload();
        } catch (err) {
          Alert.alert("Upload failed", getApiErrorMessage(err));
        } finally {
          setUploading(null);
        }
      }
    } catch (err) {
      Alert.alert("Error", getApiErrorMessage(err));
    }
  };

  const vStatus = status?.verification_status;

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={reload}
            tintColor="#1D9E75"
          />
        }
      >
        {/* ── Top bar ── */}
        <View style={s.topbar}>
          <Text style={s.topbarTitle}>Documents</Text>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={reload}
            accessibilityLabel="Refresh"
          >
            <Feather name="refresh-cw" size={16} color="#374151" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={s.loader} size="large" color="#1D9E75" />
        ) : error ? (
          <View style={s.errorBox}>
            <Feather name="alert-circle" size={28} color="#B91C1C" />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : (
          <>
            {/* ── Verification status card ── */}
            {vStatus && (
              <View style={s.card}>
                <View style={s.cardHeaderRow}>
                  <Text style={s.cardTitle}>Verification Status</Text>
                  <StatusBadge status={vStatus as any} size="sm" />
                </View>

                {vStatus === "pending" && (
                  <View style={[s.alertBox, s.alertInfo]}>
                    <Feather name="clock" size={15} color="#185FA5" />
                    <Text style={[s.alertText, { color: "#185FA5" }]}>
                      Under review — usually takes 1–3 business days.
                    </Text>
                  </View>
                )}

                {vStatus === "approved" && (
                  <View style={[s.alertBox, s.alertSuccess]}>
                    <Feather name="check-circle" size={15} color="#0F6E56" />
                    <Text style={[s.alertText, { color: "#0F6E56" }]}>
                      Your profile has been verified!
                    </Text>
                  </View>
                )}

                {vStatus === "rejected" && (
                  <View style={[s.alertBox, s.alertDanger]}>
                    <Feather
                      name="x-circle"
                      size={15}
                      color="#A32D2D"
                      style={{ marginTop: 1 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          s.alertText,
                          { color: "#A32D2D", fontWeight: "600" },
                        ]}
                      >
                        Application rejected
                      </Text>
                      {status?.admin_feedback && (
                        <Text
                          style={[
                            s.alertText,
                            { color: "#7F1D1D", marginTop: 4 },
                          ]}
                        >
                          {status.admin_feedback}
                        </Text>
                      )}
                      <Text
                        style={[
                          s.alertText,
                          { color: "#A32D2D", marginTop: 6, fontWeight: "500" },
                        ]}
                      >
                        Upload corrected documents to reapply.
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ── Upload card (hidden when approved) ── */}
            {vStatus !== "approved" && (
              <View style={s.section}>
                <DocumentUploadCard
                  documents={status?.profile?.uploaded_documents}
                  onUpload={handleUploadDocument}
                  loading={uploading !== null}
                />
              </View>
            )}

            {/* ── Uploaded documents list ── */}
            <View style={s.section}>
              <DocumentList documents={status?.profile?.uploaded_documents} />
            </View>

            {/* ── Required docs info ── */}
            <View style={[s.card, s.infoCard]}>
              <View style={s.cardHeaderRow}>
                <Feather name="info" size={15} color="#185FA5" />
                <Text style={[s.cardTitle, { color: "#185FA5" }]}>
                  Required Documents
                </Text>
              </View>
              {REQUIRED_DOCS.map((doc, i) => (
                <View
                  key={i}
                  style={[
                    s.infoRow,
                    i < REQUIRED_DOCS.length - 1 && s.infoRowBorder,
                  ]}
                >
                  <View style={s.infoRowIcon}>
                    <Feather name={doc.icon as any} size={14} color="#185FA5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.infoRowLabel}>{doc.label}</Text>
                    <Text style={s.infoRowDesc}>{doc.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* ── Upload progress indicator ── */}
            {uploading && (
              <View style={s.uploadingBar}>
                <ActivityIndicator size="small" color="#1D9E75" />
                <Text style={s.uploadingText}>
                  Uploading {uploading.replace("_", " ")}…
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F3F4F6" },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  // Topbar
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    marginBottom: 4,
  },
  topbarTitle: { fontSize: 22, fontWeight: "700", color: "#111827" },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },

  loader: { marginTop: 40 },
  errorBox: { marginTop: 40, alignItems: "center", gap: 12 },
  errorText: { color: "#B91C1C", fontSize: 14, textAlign: "center" },

  section: { marginBottom: 12 },

  // Card
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },

  // Alert boxes
  alertBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 10,
    padding: 12,
  },
  alertInfo: { backgroundColor: "#E6F1FB" },
  alertSuccess: { backgroundColor: "#E1F5EE" },
  alertDanger: { backgroundColor: "#FCEBEB" },
  alertText: { fontSize: 13, lineHeight: 18, flex: 1 },

  // Info card (required docs)
  infoCard: { backgroundColor: "#F0F7FF", borderColor: "#BFDBFE" },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#BFDBFE",
  },
  infoRowIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: "rgba(24, 95, 165, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoRowLabel: { fontSize: 13, fontWeight: "600", color: "#1E40AF" },
  infoRowDesc: { fontSize: 12, color: "#3B82F6", marginTop: 2, lineHeight: 16 },

  // Upload progress
  uploadingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  uploadingText: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
});
