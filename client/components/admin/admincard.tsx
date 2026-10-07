import { shadowStyle } from "@/lib/shadow";
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface AdminCardProps {
  title: string;
  icon?: React.ReactNode;
  onPress?: () => void;
  children?: React.ReactNode;
}

export const AdminCard: React.FC<AdminCardProps> = ({ 
  title, 
  icon, 
  onPress, 
  children 
}) => {
  const CardComponent = onPress ? TouchableOpacity : View;
  
  return (
    <CardComponent 
      style={styles.card} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      {children}
    </CardComponent>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    margin: 8,
    ...shadowStyle({ color: '#000', offset: { width: 0, height: 2 }, opacity: 0.1, radius: 4, elevation: 3 }),
  },
  iconContainer: {
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
});