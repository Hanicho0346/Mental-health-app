import { fetchWalletInfo, fetchWalletTransactions } from '@/lib/psychiatristApi';
import { useRemoteData } from '@/lib/useRemoteData';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Transaction type config ───────────────────────────────────────────────────
const TX_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  credit:  { icon: 'arrow-down-left', color: '#0F6E56', bg: '#E1F5EE', label: 'Credit' },
  debit:   { icon: 'arrow-up-right',  color: '#A32D2D', bg: '#FCEBEB', label: 'Debit' },
  payout:  { icon: 'send',            color: '#185FA5', bg: '#E6F1FB', label: 'Payout' },
  refund:  { icon: 'rotate-ccw',      color: '#854F0B', bg: '#FAEEDA', label: 'Refund' },
  fee:     { icon: 'minus',           color: '#5F5E5A', bg: '#F1EFE8', label: 'Fee' },
};

// ─── Transaction row ───────────────────────────────────────────────────────────
function TransactionItem({ item }: { item: any }) {
  const cfg = TX_CONFIG[item.type] ?? TX_CONFIG.credit;
  const isPositive = item.type === 'credit' || item.type === 'refund';

  return (
    <View style={s.txRow}>
      <View style={[s.txIconWrap, { backgroundColor: cfg.bg }]}>
        <Feather name={cfg.icon as any} size={15} color={cfg.color} />
      </View>
      <View style={s.txBody}>
        <Text style={s.txLabel} numberOfLines={1}>
          {item.description || cfg.label}
        </Text>
        <Text style={s.txDate}>
          {new Date(item.created_at).toLocaleDateString(undefined, {
            day: 'numeric', month: 'short', year: 'numeric',
          })}
        </Text>
      </View>
      <Text style={[s.txAmount, { color: isPositive ? '#0F6E56' : '#A32D2D' }]}>
        {isPositive ? '+' : '−'}{item.currency} {item.amount.toFixed(2)}
      </Text>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────
export default function WalletScreen() {
  const { data: wallet, loading: walletLoading, reload: reloadWallet } = useRemoteData(fetchWalletInfo, []);
  const { data: transactions, loading: txLoading, reload: reloadTx } = useRemoteData(
    () => fetchWalletTransactions(1, 50),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void reloadWallet();
      void reloadTx();
    }, [reloadWallet, reloadTx]),
  );

  const refreshing = walletLoading || txLoading;

  const ListHeader = (
    <>
      {/* ── Top bar ── */}
      <View style={s.topbar}>
        <Text style={s.topbarTitle}>Wallet</Text>
        <TouchableOpacity
          style={s.iconBtn}
          onPress={() => { void reloadWallet(); void reloadTx(); }}
          accessibilityLabel="Refresh"
        >
          <Feather name="refresh-cw" size={16} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* ── Balance card ── */}
      {walletLoading ? (
        <ActivityIndicator style={s.loader} size="large" color="#1D9E75" />
      ) : (
        <View style={s.balanceCard}>
          <View style={s.balanceTop}>
            <View style={s.balanceIconWrap}>
              <Feather name="credit-card" size={20} color="#0F6E56" />
            </View>
            <Text style={s.balanceLabel}>Available Balance</Text>
          </View>
          <Text style={s.balanceAmount}>
            {wallet?.currency ?? 'USD'} {(wallet?.balance ?? 0).toFixed(2)}
          </Text>
          <TouchableOpacity
            style={s.withdrawBtn}
            onPress={() => Alert.alert('Request Payout', 'Payout feature coming soon')}
          >
            <Feather name="send" size={15} color="#0F6E56" />
            <Text style={s.withdrawBtnText}>Request Payout</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Stats ── */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <View style={[s.statIcon, { backgroundColor: '#E1F5EE' }]}>
            <Feather name="arrow-down-left" size={16} color="#0F6E56" />
          </View>
          <Text style={s.statLabel}>Total Credits</Text>
          <Text style={s.statValue}>
            {wallet?.currency ?? 'USD'} {(wallet?.total_credits ?? wallet?.balance ?? 0).toFixed(2)}
          </Text>
        </View>
        <View style={s.statCard}>
          <View style={[s.statIcon, { backgroundColor: '#E6F1FB' }]}>
            <Feather name="activity" size={16} color="#185FA5" />
          </View>
          <Text style={s.statLabel}>Transactions</Text>
          <Text style={s.statValue}>{transactions?.total ?? 0}</Text>
        </View>
      </View>

      {/* ── Section header ── */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Recent Transactions</Text>
      </View>
    </>
  );

  const ListEmpty = !txLoading ? (
    <View style={s.emptyState}>
      <View style={s.emptyIcon}>
        <Feather name="inbox" size={24} color="#9CA3AF" />
      </View>
      <Text style={s.emptyTitle}>No transactions yet</Text>
      <Text style={s.emptySubtitle}>Your transaction history will appear here</Text>
    </View>
  ) : null;

  return (
    <SafeAreaView style={s.root}>
      <FlatList
        data={transactions?.transactions ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TransactionItem item={item} />}
        contentContainerStyle={s.listContent}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { void reloadWallet(); void reloadTx(); }}
            tintColor="#1D9E75"
          />
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },

  // Topbar
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    marginBottom: 4,
  },
  topbarTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },

  loader: { marginTop: 32 },

  // Balance card
  balanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  balanceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  balanceIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#E1F5EE',
    alignItems: 'center', justifyContent: 'center',
  },
  balanceLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  balanceAmount: {
    fontSize: 32, fontWeight: '700', color: '#111827',
    letterSpacing: -0.5, marginBottom: 16,
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E1F5EE',
    borderRadius: 10,
    paddingVertical: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#9FE1CB',
  },
  withdrawBtnText: { fontSize: 14, fontWeight: '600', color: '#0F6E56' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  statIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  statLabel: { fontSize: 11, color: '#9CA3AF', marginBottom: 3 },
  statValue: { fontSize: 15, fontWeight: '700', color: '#111827' },

  // Section header
  sectionHeader: { marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },

  // Transaction row
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  txIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, flexShrink: 0,
  },
  txBody: { flex: 1, minWidth: 0 },
  txLabel: { fontSize: 13, fontWeight: '600', color: '#111827' },
  txDate: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  txAmount: { fontSize: 13, fontWeight: '700', marginLeft: 8 },

  separator: { height: 8 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#374151' },
  emptySubtitle: { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
});