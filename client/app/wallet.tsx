import { api } from '@/lib/api';
import { getApiErrorMessage, logClientError } from '@/lib/log';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TransactionType =
  | 'session_earning'
  | 'platform_commission'
  | 'payment_received'
  | 'withdrawal'
  | 'refund';

type WalletTx = {
  id: string;
  amount: number;
  transaction_type: TransactionType;
  payment_reference: string;
  status: string;
  description: string;
  booking_id: string | null;
  created_at: string;
};

type WalletData = {
  balance: number;
  transactions: WalletTx[];
};

const TYPE_META: Record<TransactionType, { label: string; icon: string; color: string; bg: string; sign: '+' | '-' }> = {
  session_earning:    { label: 'Session Earning',    icon: 'trending-up',   color: '#16A34A', bg: '#DCFCE7', sign: '+' },
  platform_commission:{ label: 'Platform Commission',icon: 'percent',       color: '#2563EB', bg: '#DBEAFE', sign: '+' },
  payment_received:   { label: 'Payment',            icon: 'credit-card',   color: '#D97706', bg: '#FEF3C7', sign: '-' },
  withdrawal:         { label: 'Withdrawal',         icon: 'arrow-up-right',color: '#EF4444', bg: '#FEE2E2', sign: '-' },
  refund:             { label: 'Refund',             icon: 'rotate-ccw',    color: '#7C3AED', bg: '#EDE9FE', sign: '+' },
};

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

export default function WalletScreen() {
  const [data, setData]         = useState<WalletData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data: res } = await api.get<WalletData>('/bookings/wallet');
      setData(res);
    } catch (e: unknown) {
      logClientError('wallet.load', e);
      Alert.alert('Could not load wallet', getApiErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const renderTx = useCallback(({ item }: { item: WalletTx }) => {
    const meta = TYPE_META[item.transaction_type] ?? TYPE_META.payment_received;
    return (
      <View style={s.txRow}>
        <View style={[s.txIcon, { backgroundColor: meta.bg }]}>
          <Feather name={meta.icon as any} size={18} color={meta.color} />
        </View>
        <View style={s.txInfo}>
          <Text style={s.txLabel}>{meta.label}</Text>
          <Text style={s.txDesc} numberOfLines={1}>{item.description}</Text>
          <Text style={s.txDate}>{fmt(item.created_at)}</Text>
        </View>
        <View style={s.txRight}>
          <Text style={[s.txAmount, { color: meta.sign === '+' ? '#16A34A' : '#EF4444' }]}>
            {meta.sign}ETB {item.amount}
          </Text>
          <View style={[s.txStatus, item.status === 'completed' ? s.txStatusOk : s.txStatusPending]}>
            <Text style={[s.txStatusTxt, { color: item.status === 'completed' ? '#16A34A' : '#D97706' }]}>
              {item.status}
            </Text>
          </View>
        </View>
      </View>
    );
  }, []);

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Wallet</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color="#16A34A" />
      ) : (
        <FlatList
          data={data?.transactions ?? []}
          keyExtractor={(t) => t.id}
          renderItem={renderTx}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#16A34A" />}
          ListHeaderComponent={
            <>
              {/* Balance card */}
              <View style={s.balanceCard}>
                <Text style={s.balanceLabel}>Available Balance</Text>
                <Text style={s.balanceAmount}>ETB {(data?.balance ?? 0).toLocaleString()}</Text>
                <View style={s.balanceRow}>
                  <Feather name="shield" size={13} color="rgba(255,255,255,0.7)" />
                  <Text style={s.balanceSub}>Secured & verified</Text>
                </View>
              </View>

              {/* Section header */}
              <View style={s.sectionRow}>
                <Text style={s.sectionTitle}>Transaction History</Text>
                <Text style={s.sectionCount}>{data?.transactions.length ?? 0} records</Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="inbox" size={40} color="#D1D5DB" />
              <Text style={s.emptyTxt}>No transactions yet</Text>
            </View>
          }
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingBottom: 40 },

  balanceCard: {
    margin: 16, borderRadius: 24, padding: 28,
    backgroundColor: '#16A34A',
    shadowColor: '#16A34A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  balanceLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
  balanceAmount: { fontSize: 38, fontWeight: '800', color: '#FFFFFF', marginBottom: 12 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  balanceSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sectionCount: { fontSize: 13, color: '#9CA3AF' },

  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 10,
    borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  txIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  txInfo: { flex: 1 },
  txLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  txDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  txDate: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  txRight: { alignItems: 'flex-end', gap: 4 },
  txAmount: { fontSize: 15, fontWeight: '800' },
  txStatus: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  txStatusOk: { backgroundColor: '#DCFCE7' },
  txStatusPending: { backgroundColor: '#FEF3C7' },
  txStatusTxt: { fontSize: 10, fontWeight: '700' },

  empty: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyTxt: { fontSize: 14, color: '#9CA3AF' },
});
