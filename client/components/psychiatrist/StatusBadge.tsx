import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type StatusType = 'pending' | 'approved' | 'rejected' | 'verified';

interface StatusBadgeProps {
  status: StatusType;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'approved':
      case 'verified':
        return { label: 'Approved', color: '#10b981', bg: '#d1fae5' };
      case 'pending':
        return { label: 'Pending', color: '#f59e0b', bg: '#fed7aa' };
      case 'rejected':
        return { label: 'Rejected', color: '#ef4444', bg: '#fee2e2' };
      default:
        return { label: status, color: '#6b7280', bg: '#f3f4f6' };
    }
  };

  const config = getStatusConfig();
  const fontSize = size === 'sm' ? 11 : 13;
  const paddingHorizontal = size === 'sm' ? 8 : 12;
  const paddingVertical = size === 'sm' ? 4 : 6;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg, paddingHorizontal, paddingVertical }]}>
      <Text style={[styles.text, { color: config.color, fontSize }]}>
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '600',
  },
});