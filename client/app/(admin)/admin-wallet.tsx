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

type RevenueSummary = {
  total_revenue: number;
  platform_revenue: number;
  psychiatrist_revenue: number;
  total_bookings: number;
};

type AdminTx = {
  id: string;
  user: { full_name: string; email: string; role: string } | null;
  booking_id: string | null;
  amount: number;
  transaction_type: string;
  payment_reference: string;
  status: string;
  description: string;
  created_at: string;
};

type Tab = 'overview' | 'transactions' | 'bookings';

type BookingRow = {
  id: string;
  user: { full_name: string } | null;
  psychiatrist: { full_name: string } | null;
  amount: number;
  platform_fee: number;
  psychiatrist_share: number;
  payment_status: string;
  booking_status: string;
  time_label?: string;
  createdAt: string;
};

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return ''; }
}

const STATUS_COLOR: Record<string, string> = {
  paid: '#16A34A', pending_payment: '#D97706', failed: '#EF4444', refunded: '#7C3AED',
  completed: '#16A34A', pending: '#D97706', cancelled: '#EF4444',
};

export default function AdminWalletScreen() {
  const [tab, setTab]               = useState<Tab>('overview');
  const [revenue, setRevenue]       = useState<RevenueSummary | null>(null);
  const [transactions, setTxns]     = useState<AdminTx[]>([]);
  const [bookings, setBookings]     = useState<BookingRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [revRes, txRes, bkRes] = await Promise.all([
        api.get<RevenueSummary>('/admin/revenue'),
        api.get<{ transactions: AdminTx[] }>('/bookings/admin/transactions'),
        api.get<{ bookings: BookingRow[] }>('/bookings/admin/all'),
      ]);
      setRevenue(revRes.data);
      setTxns(txRes.data.transactions);
      setBookings(bkRes.data.bookings);
    } catch (e: unknown) {
      logClientError('adminWallet.load', e);
      Alert.alert('Could not load data', getApiErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const StatCard = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) => (
    <View style={[s.statCard, { borderLeftColor: color }]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );

  const renderTx = useCallback(({ item }: { item: AdminTx }) => (
    <View style={s.row}>
      <View style={s.rowLeft}>
        <Text style={s.rowTitle}>{item.transaction_type.replace(/_/g, ' ')}</Text>
        <Text style={s.rowSub}>{item.user?.full_name ?? '—'} · {item.user?.role ?? ''}</Text>
        <Text style={s.rowDate}>{fmt(item.created_at)}</Text>
      </View>
      <View style={s.rowRight}>
        <Text style={[s.rowAmount, { color: '#16A34A' }]}>+ETB {item.amount}</Text>
        <View style={[s.badge, { backgroundColor: item.status === 'completed' ? '#DCFCE7' : '#FEF3C7' }]}>
          <Text style={[s.badgeTxt, { color: item.status === 'completed' ? '#16A34A' : '#D97706' }]}>
            {item.status}
          </Text>
        </View>
      </View>
    </View>
  ), []);

  const renderBooking = useCallback(({ item }: { item: BookingRow }) => (
    <View style={s.row}>
      <View style={s.rowLeft}>
        <Text style={s.rowTitle}>{item.user?.full_name ?? '—'}</Text>
        <Text style={s.rowSub}>Dr. {item.psychiatrist?.full_name ?? '—'}</Text>
        <Text style={s.rowDate}>{item.time_label ?? fmt(item.createdAt)}</Text>
      </View>
      <View style={s.rowRight}>
        <Text style={s.rowAmount}>ETB {item.amount}</Text>
        <View style={[s.badge, { backgroundColor: '#F3F4F6' }]}>
          <Text style={[s.badgeTxt, { color: STATUS_COLOR[item.payment_status] ?? '#6B7280' }]}>
            {item.payment_status}
          </Text>
        </View>
        <Text style={s.splitTxt}>
          P: {item.psychiatrist_share} · A: {item.platform_fee}
        </Text>
      </View>
    </View>
  ), []);

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Platform Wallet</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {(['overview', 'transactions', 'bookings'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color="#2563EB" />
      ) : (
        <FlatList
          data={tab === 'transactions' ? transactions : tab === 'bookings' ? bookings : []}
          keyExtractor={(item: any) => item.id}
          renderItem={tab === 'transactions' ? renderTx : renderBooking}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#2563EB" />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.listContent}
          ListHeaderComponent={
            tab === 'overview' ? (
              <View style={s.overviewWrap}>
                <View style={s.revenueCard}>
                  <Text style={s.revenueLabel}>Total Platform Revenue</Text>
                  <Text style={s.revenueAmount}>ETB {(revenue?.total_revenue ?? 0).toLocaleString()}</Text>
                  <Text style={s.revenueSub}>{revenue?.total_bookings ?? 0} paid bookings</Text>
                </View>
                <View style={s.statsGrid}>
                  <StatCard
                    label="Platform (30%)"
                    value={`ETB ${revenue?.platform_revenue ?? 0}`}
                    sub="Admin commission"
                    color="#2563EB"
                  />
                  <StatCard
                    label="Psychiatrists (70%)"
                    value={`ETB ${revenue?.psychiatrist_revenue ?? 0}`}
                    sub="Session earnings"
                    color="#16A34A"
                  />
                </View>
                <View style={s.infoBox}>
                  <Feather name="info" size={14} color="#2563EB" />
                  <Text style={s.infoTxt}>
                    Each ETB 300 session: ETB 210 → psychiatrist, ETB 90 → platform.
                    All splits are processed atomically via MongoDB transactions.
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={s.listHeader}>
                {tab === 'transactions' ? `${transactions.length} transactions` : `${bookings.length} bookings`}
              </Text>
            )
          }
          ListEmptyComponent={
            tab !== 'overview' ? (
              <View style={s.empty}>
                <Feather name="inbox" size={40} color="#D1D5DB" />
                <Text style={s.emptyTxt}>No records found</Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },

  tabBar: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#2563EB' },
  tabTxt: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  tabTxtActive: { color: '#2563EB' },

  listContent: { paddingBottom: 40 },
  listHeader: { fontSize: 13, color: '#9CA3AF', paddingHorizontal: 16, paddingVertical: 12 },

  overviewWrap: { padding: 16 },
  revenueCard: {
    borderRadius: 24, padding: 28, backgroundColor: '#1E40AF',
    marginBottom: 16,
    shadowColor: '#1E40AF', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  revenueLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
  revenueAmount: { fontSize: 38, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  revenueSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },

  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  statLabel: { fontSize: 12, color: '#6B7280', marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statSub: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },

  infoBox: {
    flexDirection: 'row', gap: 10, backgroundColor: '#EFF6FF',
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BFDBFE',
  },
  infoTxt: { flex: 1, fontSize: 12, color: '#1E40AF', lineHeight: 18 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 10,
    borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  rowLeft: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  rowSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  rowDate: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowAmount: { fontSize: 15, fontWeight: '800', color: '#111827' },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeTxt: { fontSize: 10, fontWeight: '700' },
  splitTxt: { fontSize: 10, color: '#9CA3AF' },

  empty: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyTxt: { fontSize: 14, color: '#9CA3AF' },
});
