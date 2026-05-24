import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface ProfileInfoCardProps {
  title: string;
  icon?: string;
  children: React.ReactNode;
}

export const ProfileInfoCard: React.FC<ProfileInfoCardProps> = ({ title, icon, children }) => {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {icon && <Feather name={icon as any} size={18} color="#1D9E75" />}
        <Text style={styles.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
};

interface InfoRowProps {
  label: string;
  value: string;
  icon?: string;
}

export const InfoRow: React.FC<InfoRowProps> = ({ label, value, icon }) => {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        {icon && <Feather name={icon as any} size={14} color="#9ca3af" />}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: '#6B7280',
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
});