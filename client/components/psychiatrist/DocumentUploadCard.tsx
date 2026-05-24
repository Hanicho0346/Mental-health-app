import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

export type DocumentType = 'profile' | 'psychiatrist_doc' | 'wellness_video';

interface Document {
  id?: string;
  url: string;
  kind: DocumentType;
  name?: string;
  uploaded_at?: string;
  status?: 'pending' | 'approved' | 'rejected';
}

interface DocumentUploadCardProps {
  documents?: Document[];
  onUpload: (docType: DocumentType) => Promise<void>;
  loading?: boolean;
}

interface DocumentListProps {
  documents?: Document[];
}

const DOCUMENT_TYPES: { type: DocumentType; label: string; icon: string; color: string }[] = [
  { type: 'psychiatrist_doc', label: 'Medical License', icon: 'file-text', color: '#1D9E75' },
  { type: 'psychiatrist_doc', label: 'National ID', icon: 'user', color: '#1D9E75' },
  { type: 'psychiatrist_doc', label: 'Professional Certificate', icon: 'award', color: '#1D9E75' },
  { type: 'profile', label: 'Profile Photo', icon: 'camera', color: '#6366f1' },
  { type: 'wellness_video', label: 'Introduction Video', icon: 'video', color: '#f59e0b' },
];

export const DocumentUploadCard: React.FC<DocumentUploadCardProps> = ({
  documents,
  onUpload,
  loading = false,
}) => {
  // Get uploaded document kinds
  const uploadedKinds = documents?.map(doc => doc.kind) || [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Feather name="upload-cloud" size={20} color="#1D9E75" />
          <Text style={styles.title}>Upload Documents</Text>
        </View>
        <Text style={styles.subtitle}>
          Upload the required documents for verification
        </Text>
      </View>

      <View style={styles.documentGrid}>
        {DOCUMENT_TYPES.map((docType, index) => {
          const isUploaded = uploadedKinds.includes(docType.type);
          const isUploading = loading;

          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.documentCard,
                isUploaded && styles.documentCardUploaded,
                isUploading && styles.documentCardDisabled,
              ]}
              onPress={() => !isUploaded && !isUploading && onUpload(docType.type)}
              disabled={isUploaded || isUploading}
              activeOpacity={0.7}
            >
              <View style={[styles.documentIcon, { backgroundColor: `${docType.color}15` }]}>
                {isUploaded ? (
                  <Feather name="check-circle" size={24} color={docType.color} />
                ) : isUploading ? (
                  <ActivityIndicator size="small" color={docType.color} />
                ) : (
                  <Feather name={docType.icon as any} size={24} color={docType.color} />
                )}
              </View>
              <Text style={styles.documentLabel}>{docType.label}</Text>
              {isUploaded && (
                <View style={styles.uploadedBadge}>
                  <Text style={styles.uploadedBadgeText}>Uploaded</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.infoBox}>
        <Feather name="info" size={14} color="#6B7280" />
        <Text style={styles.infoText}>
          Accepted formats: PDF, JPG, PNG (Max 5MB per file)
        </Text>
      </View>
    </View>
  );
};

export const DocumentList: React.FC<DocumentListProps> = ({ documents = [] }) => {
  if (documents.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Feather name="folder" size={48} color="#D1D5DB" />
        <Text style={styles.emptyText}>No documents uploaded yet</Text>
        <Text style={styles.emptySubtext}>
          Upload documents to complete your verification
        </Text>
      </View>
    );
  }

  const getDocumentIcon = (kind: string) => {
    switch (kind) {
      case 'profile': return 'user';
      case 'psychiatrist_doc': return 'file-text';
      case 'wellness_video': return 'video';
      default: return 'file';
    }
  };

  const getDocumentLabel = (kind: string) => {
    switch (kind) {
      case 'psychiatrist_doc': return 'Professional Document';
      case 'profile': return 'Profile Photo';
      case 'wellness_video': return 'Introduction Video';
      default: return kind;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown date';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <View style={styles.listContainer}>
      <View style={styles.listHeader}>
        <Feather name="file-text" size={18} color="#1D9E75" />
        <Text style={styles.listTitle}>Uploaded Documents</Text>
      </View>

      {documents.map((doc, index) => (
        <View key={doc.id || index} style={styles.documentItem}>
          <View style={styles.documentItemIcon}>
            <Feather name={getDocumentIcon(doc.kind)} size={20} color="#1D9E75" />
          </View>
          <View style={styles.documentItemInfo}>
            <Text style={styles.documentItemName}>
              {doc.name || getDocumentLabel(doc.kind)}
            </Text>
            <Text style={styles.documentItemDate}>
              Uploaded: {formatDate(doc.uploaded_at)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.viewButton}
            onPress={() => {
              // You can add view functionality here
              console.log('View document:', doc.url);
            }}
          >
            <Feather name="eye" size={16} color="#6B7280" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  header: {
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  documentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  documentCard: {
    flex: 1,
    minWidth: '30%',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  documentCardUploaded: {
    backgroundColor: '#F0FDF4',
    borderColor: '#1D9E75',
  },
  documentCardDisabled: {
    opacity: 0.5,
  },
  documentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  documentLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'center',
    marginBottom: 4,
  },
  uploadedBadge: {
    backgroundColor: '#1D9E75',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  uploadedBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
  },
  // Document List Styles
  listContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  documentItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentItemInfo: {
    flex: 1,
  },
  documentItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  documentItemDate: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  viewButton: {
    padding: 8,
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#9CA3AF',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#D1D5DB',
    textAlign: 'center',
    marginTop: 4,
  },
});