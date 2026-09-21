import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Animated, Alert, ActivityIndicator, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

const LEVEL_COLORS: Record<string, string> = {
  Bronze: '#CD7F32',
  Silver: '#C0C0C0',
  Gold: '#FFD700',
  Platinum: '#E5E4E2',
  Diamond: '#B9F2FF',
};

const LEVEL_ICONS: Record<string, string> = {
  Bronze: 'shield-outline',
  Silver: 'shield-half-outline',
  Gold: 'shield',
  Platinum: 'diamond-outline',
  Diamond: 'diamond',
};

const REDEEM_OPTIONS = [
  { id: 'service_10', name: '10% Service Discount', cost: 200, icon: 'construct' },
  { id: 'wash', name: 'Free Car Wash', cost: 50, icon: 'water' },
  { id: 'accessory', name: 'Accessory Voucher R500', cost: 500, icon: 'gift' },
  { id: 'parts', name: 'Parts Credit R1,000', cost: 1000, icon: 'cog' },
  { id: 'priority', name: 'Priority Booking', cost: 150, icon: 'flash' },
  { id: 'lounge', name: 'VIP Lounge Access', cost: 75, icon: 'cafe' },
];

export default function RewardsScreen({ navigation }: any) {
  const wallet = useQuery(api.rewards.getWallet);
  const dashboard = useQuery(api.referrals.getDashboardSummary);
  const initWallet = useMutation(api.rewards.initWallet);
  const logDrive = useMutation(api.rewards.logDrive);
  const logBonus = useMutation(api.rewards.logBonus);
  const redeemTokens = useMutation(api.rewards.redeem);

  const [initializing, setInitializing] = useState(false);
  const [logging, setLogging] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Glow animation for balance
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: Platform.OS !== 'web' }),
      ])
    ).start();
  }, [glowAnim]);

  const handleInit = async () => {
    setInitializing(true);
    try {
      await initWallet({});
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setInitializing(false);
  };

  const handleLogDrive = async () => {
    setLogging(true);
    try {
      // Simulate a drive (in real app, this would come from GPS/OBD)
      const km = Math.round(Math.random() * 50 + 5);
      const isEco = Math.random() > 0.5;
      const result = await logDrive({ km, isEcoDrive: isEco });
      Alert.alert(
        'Drive Logged!',
        `+${result.earned} ${wallet?.tokenType ?? 'tokens'} earned for ${km}km${isEco ? ' (Eco driving bonus!)' : ''}\nBalance: ${result.newBalance} tokens`,
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLogging(false);
  };

  const handleDailyCheckIn = async () => {
    try {
      const result = await logBonus({ type: 'check_in', description: 'Daily check-in bonus' });
      Alert.alert('Checked In!', `+${result.earned} ${wallet?.tokenType ?? 'tokens'}!`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleRedeem = async (option: (typeof REDEEM_OPTIONS)[number]) => {
    if (!wallet || wallet.balance < option.cost) {
      Alert.alert('Insufficient Balance', `You need ${option.cost} tokens. Current: ${wallet?.balance ?? 0}`);
      return;
    }
    Alert.alert(
      'Redeem Tokens',
      `Redeem ${option.cost} ${wallet.tokenType} for ${option.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            try {
              await redeemTokens({ amount: option.cost, description: option.name });
              Alert.alert('Redeemed!', `${option.name} has been applied to your account.`);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const handleGenerateStatement = async () => {
    const summary = dashboard;
    const lines = [
      'REFERRAL WALLET STATEMENT',
      `Generated for: ${String((dashboard as any)?.code ?? userLabelFromDashboard(summary) ?? 'Customer')}`,
      '',
      `Referral shares: ${summary?.totalShares ?? 0}`,
      `Successful in-app referrals: ${summary?.totalRegistered ?? 0}`,
      `Referral wallet total: ${summary?.totalTokensEarned ?? 0}`,
      `Service bookings completed in app: ${summary?.serviceBookings?.filter((item: any) => item.status === 'completed').length ?? 0}`,
      `Finance applications delivered in app: ${summary?.financeApplications?.filter((item: any) => item.status === 'approved' || item.dealStatus === 'delivered' || item.closedDeal).length ?? 0}`,
      `Reviews logged: ${summary?.reviews?.length ?? 0}`,
      '',
      'Important: only app-created referrals can be claimed.',
      'Claims must come from successful in-app service bookings or finance applications.',
      'Print this statement and attach supporting documents for approval where required.',
      'This screen is the source of truth for your referral activity and analytics.',
    ].join('\n');

    try {
      await Share.share({ title: 'Referral wallet statement', message: lines });
    } catch {
      Alert.alert('Statement ready', lines);
    }
  };

  function userLabelFromDashboard(summary: any) {
    return summary?.recentActivity?.[0]?.title ?? null;
  }

  // No wallet yet - show init screen
  if (wallet === null) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={styles.safe}>
          <View style={styles.initContainer}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.initContent}>
              <View style={styles.hederaLogo}>
                <Ionicons name="pulse" size={60} color="#8B5CF6" />
              </View>
              <Text style={styles.initTitle}>Drive-to-Earn</Text>
              <Text style={styles.initSub}>Powered by Hedera Hashgraph</Text>
              <Text style={styles.initDesc}>
                Earn tokens every kilometre you drive. Redeem for service discounts, accessories, and more.
                Built on Hedera's carbon-neutral blockchain — the same network Hyundai & Kia use for their global carbon tracking.
              </Text>

              <View style={styles.initFeatures}>
                <View style={styles.initFeature}>
                  <Ionicons name="car" size={24} color="#22C55E" />
                  <Text style={styles.initFeatureText}>1 Token per KM</Text>
                </View>
                <View style={styles.initFeature}>
                  <Ionicons name="leaf" size={24} color="#22C55E" />
                  <Text style={styles.initFeatureText}>Eco Driving Bonus</Text>
                </View>
                <View style={styles.initFeature}>
                  <Ionicons name="gift" size={24} color="#F59E0B" />
                  <Text style={styles.initFeatureText}>Redeem for Rewards</Text>
                </View>
                <View style={styles.initFeature}>
                  <Ionicons name="shield-checkmark" size={24} color="#8B5CF6" />
                  <Text style={styles.initFeatureText}>Hedera Secured</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.initBtn} onPress={handleInit} disabled={initializing}>
                {initializing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.initBtnText}>Activate My Wallet</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (wallet === undefined) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  const levelColor = LEVEL_COLORS[wallet.level] ?? '#CD7F32';
  const levelIcon = LEVEL_ICONS[wallet.level] ?? 'shield-outline';
  const progressToNext = wallet.nextLevel
    ? Math.min(100, ((wallet.lifetimeKm) / (wallet.lifetimeKm + wallet.nextLevel.kmNeeded)) * 100)
    : 100;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>Referral Dashboard</Text>
              <Text style={styles.headerSub}>Wallet, claims, reviews, and activity analytics</Text>
            </View>
            <TouchableOpacity onPress={handleGenerateStatement} style={styles.checkInBtn}>
              <Ionicons name="document-text" size={20} color="#F59E0B" />
            </TouchableOpacity>
          </View>

          <View style={styles.dashboardNotice}>
            <Ionicons name="shield-checkmark" size={18} color="#8B5CF6" />
            <Text style={styles.dashboardNoticeText}>
              Only in-app service bookings and finance applications can be claimed. If it wasn't created in the app, it is not claimable.
            </Text>
          </View>

          <View style={styles.dashboardStatsRow}>
            <View style={styles.dashboardStatCard}>
              <Text style={styles.dashboardStatValue}>{dashboard?.totalShares ?? 0}</Text>
              <Text style={styles.dashboardStatLabel}>Shares</Text>
            </View>
            <View style={styles.dashboardStatCard}>
              <Text style={styles.dashboardStatValue}>{dashboard?.totalRegistered ?? 0}</Text>
              <Text style={styles.dashboardStatLabel}>Successful referrals</Text>
            </View>
            <View style={styles.dashboardStatCard}>
              <Text style={styles.dashboardStatValue}>{dashboard?.reviews?.length ?? 0}</Text>
              <Text style={styles.dashboardStatLabel}>Reviews</Text>
            </View>
          </View>

          <View style={styles.dashboardStatsRow}>
            <View style={styles.dashboardStatCard}>
              <Text style={styles.dashboardStatValue}>{dashboard?.serviceBookings?.filter((item: any) => item.status === 'completed').length ?? 0}</Text>
              <Text style={styles.dashboardStatLabel}>Completed services</Text>
            </View>
            <View style={styles.dashboardStatCard}>
              <Text style={styles.dashboardStatValue}>{dashboard?.financeApplications?.filter((item: any) => item.status === 'approved' || item.dealStatus === 'delivered' || item.closedDeal).length ?? 0}</Text>
              <Text style={styles.dashboardStatLabel}>Delivered finance</Text>
            </View>
            <View style={styles.dashboardStatCard}>
              <Text style={styles.dashboardStatValue}>{dashboard?.totalTokensEarned ?? 0}</Text>
              <Text style={styles.dashboardStatLabel}>Wallet total</Text>
            </View>
          </View>

          {/* Balance Card */}
          <Animated.View style={[styles.balanceCard, { opacity: Animated.add(0.85, Animated.multiply(glowAnim, 0.15)) }]}>
            <View style={styles.balanceTop}>
              <View style={[styles.levelBadge, { backgroundColor: levelColor + '30' }]}>
                <Ionicons name={levelIcon as any} size={18} color={levelColor} />
                <Text style={[styles.levelText, { color: levelColor }]}>{wallet.level}</Text>
              </View>
              <Text style={styles.tokenLabel}>{wallet.tokenType}</Text>
            </View>

            <Text style={styles.balanceAmount}>{wallet.balance.toLocaleString()}</Text>
            <Text style={styles.balanceSub}>Available Tokens</Text>

            <View style={styles.balanceStats}>
              <View style={styles.balanceStat}>
                <Text style={styles.statValue}>{wallet.lifetimeKm.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Lifetime KM</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.balanceStat}>
                <Text style={styles.statValue}>{wallet.carbonSaved.toFixed(1)}</Text>
                <Text style={styles.statLabel}>kg CO₂ Tracked</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.balanceStat}>
                <Text style={styles.statValue}>{wallet.streak}🔥</Text>
                <Text style={styles.statLabel}>Day Streak</Text>
              </View>
            </View>

            {dashboard?.recentActivity?.length ? (
              <TouchableOpacity style={styles.dashboardStatementBtn} onPress={handleGenerateStatement}>
                <Ionicons name="print-outline" size={18} color="#fff" />
                <Text style={styles.dashboardStatementText}>Generate withdrawal statement</Text>
              </TouchableOpacity>
            ) : null}

            {/* Level Progress */}
            {wallet.nextLevel && (
              <View style={styles.progressSection}>
                <View style={styles.progressRow}>
                  <Text style={styles.progressLabel}>Next: {wallet.nextLevel.name}</Text>
                  <Text style={styles.progressKm}>{wallet.nextLevel.kmNeeded.toLocaleString()} km to go</Text>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progressToNext}%`, backgroundColor: levelColor }]} />
                </View>
              </View>
            )}
          </Animated.View>

          <Text style={styles.sectionTitle}>Referral activity</Text>
          <View style={styles.referralListCard}>
            {(dashboard?.recentActivity ?? []).length === 0 ? (
              <Text style={styles.noActivity}>Your activity will appear here once referrals and applications are created in-app.</Text>
            ) : (
              (dashboard?.recentActivity ?? []).slice(0, 6).map((item: any) => (
                <View key={item._id} style={styles.activityRow}>
                  <View style={styles.activityDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle}>{item.title}</Text>
                    <Text style={styles.activityDesc}>{item.description}</Text>
                  </View>
                  <Text style={styles.activityTime}>{new Date(item.timestamp).toLocaleDateString()}</Text>
                </View>
              ))
            )}
          </View>

          <Text style={styles.sectionTitle}>Recent referrals</Text>
          <View style={styles.referralListCard}>
            {(dashboard?.recentReferrals ?? []).length === 0 ? (
              <Text style={styles.noActivity}>No referrals yet.</Text>
            ) : (
              (dashboard?.recentReferrals ?? []).slice(0, 5).map((r: any) => (
                <View key={r._id} style={styles.activityRow}>
                  <View style={styles.activityDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle}>{r.platform}</Text>
                    <Text style={styles.activityDesc}>{r.referredUserName ?? 'Pending referral conversion'}</Text>
                  </View>
                  <Text style={styles.activityTime}>{r.status}</Text>
                </View>
              ))
            )}
          </View>

          {/* Quick Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleLogDrive} disabled={logging}>
              {logging ? (
                <ActivityIndicator color="#8B5CF6" />
              ) : (
                <Ionicons name="speedometer" size={28} color="#8B5CF6" />
              )}
              <Text style={styles.actionLabel}>Log Drive</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleDailyCheckIn}>
              <Ionicons name="sunny" size={28} color="#F59E0B" />
              <Text style={styles.actionLabel}>Check In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('AIChat')}>
              <Ionicons name="sparkles" size={28} color="#EC4899" />
              <Text style={styles.actionLabel}>Ask Kira</Text>
            </TouchableOpacity>
          </View>

          {/* Hedera Info */}
          <View style={styles.hederaCard}>
            <View style={styles.hederaHeader}>
              <Ionicons name="pulse" size={20} color="#8B5CF6" />
              <Text style={styles.hederaTitle}>Claims & source of truth</Text>
            </View>
            <Text style={styles.hederaText}>
              Service-booking claims only count when the booking is confirmed and completed in the app.
              Finance claims only count when the application is successfully delivered and marked delivered.
            </Text>
            <Text style={styles.hederaText}>
              This dashboard links your activity, reviews, and referral wallet in one place so the records stay auditable.
            </Text>
          </View>

          {/* Redeem */}
          <Text style={styles.sectionTitle}>Redeem Tokens</Text>
          <View style={styles.redeemGrid}>
            {REDEEM_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.redeemCard, wallet.balance < opt.cost && styles.redeemDisabled]}
                onPress={() => handleRedeem(opt)}
              >
                <Ionicons name={opt.icon as any} size={24} color={wallet.balance >= opt.cost ? '#8B5CF6' : '#666'} />
                <Text style={styles.redeemName}>{opt.name}</Text>
                <Text style={[styles.redeemCost, wallet.balance < opt.cost && { color: '#666' }]}>
                  {opt.cost} {wallet.tokenType}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Earnings History */}
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {(wallet.recentEarnings ?? []).length === 0 ? (
            <Text style={styles.noActivity}>Start driving to earn tokens!</Text>
          ) : (
            (wallet.recentEarnings ?? []).map((e: any, i: number) => (
              <View key={i} style={styles.earningRow}>
                <View style={[styles.earningIcon, { backgroundColor: e.amount > 0 ? '#22C55E20' : '#EF444420' }]}>
                  <Ionicons
                    name={e.type === 'drive' ? 'car' : e.type === 'redeem' ? 'cart' : 'star'}
                    size={18}
                    color={e.amount > 0 ? '#22C55E' : '#EF4444'}
                  />
                </View>
                <View style={styles.earningInfo}>
                  <Text style={styles.earningDesc}>{e.description}</Text>
                  <Text style={styles.earningTime}>{new Date(e.timestamp).toLocaleDateString()}</Text>
                </View>
                <Text style={[styles.earningAmount, { color: e.amount > 0 ? '#22C55E' : '#EF4444' }]}>
                  {e.amount > 0 ? '+' : ''}{e.amount}
                </Text>
              </View>
            ))
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A1A' },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: spacing.lg, marginBottom: spacing.xl,
  },
  headerBack: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1A1A2E', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: '#8B5CF6', fontWeight: '600' },
  checkInBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1A1A2E', justifyContent: 'center', alignItems: 'center' },
  dashboardNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#8B5CF610',
    borderRadius: 18,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#8B5CF630',
  },
  dashboardNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '600',
  },
  dashboardStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dashboardStatCard: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#2A2A3E',
  },
  dashboardStatValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
  },
  dashboardStatLabel: {
    marginTop: 4,
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '700',
  },
  // Balance
  balanceCard: {
    backgroundColor: '#1A1A2E', borderRadius: 24, padding: spacing.xxl,
    borderWidth: 1, borderColor: '#8B5CF620', marginBottom: spacing.xl,
  },
  balanceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  levelBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  levelText: { fontSize: 13, fontWeight: '700' },
  tokenLabel: { fontSize: 14, fontWeight: '700', color: '#8B5CF6', letterSpacing: 2 },
  balanceAmount: { fontSize: 48, fontWeight: '800', color: '#fff', textAlign: 'center' },
  balanceSub: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: spacing.xl },
  balanceStats: { flexDirection: 'row', justifyContent: 'space-around' },
  balanceStat: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)', height: '100%' },
  progressSection: { marginTop: spacing.xl },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  progressKm: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  progressBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3 },
  progressFill: { height: '100%', borderRadius: 3 },
  dashboardStatementBtn: {
    marginTop: spacing.lg,
    backgroundColor: '#8B5CF6',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dashboardStatementText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  // Actions
  actionsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  actionBtn: {
    flex: 1, backgroundColor: '#1A1A2E', borderRadius: 16, padding: spacing.lg,
    alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#2A2A3E',
  },
  actionLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  // Hedera
  hederaCard: {
    backgroundColor: '#1A1A2E', borderRadius: 16, padding: spacing.xl,
    borderWidth: 1, borderColor: '#8B5CF630', marginBottom: spacing.xl,
  },
  hederaHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  hederaTitle: { fontSize: 16, fontWeight: '700', color: '#8B5CF6' },
  hederaText: { fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 20, marginBottom: spacing.lg },
  hederaStats: { flexDirection: 'row', justifyContent: 'space-around' },
  hederaStat: { alignItems: 'center' },
  hederaStatVal: { fontSize: 16, fontWeight: '700', color: '#8B5CF6' },
  hederaStatLbl: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  // Redeem
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: spacing.md },
  redeemGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  redeemCard: {
    width: '47%', backgroundColor: '#1A1A2E', borderRadius: 14, padding: spacing.lg,
    alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#2A2A3E',
  },
  redeemDisabled: { opacity: 0.4 },
  redeemName: { fontSize: 12, fontWeight: '600', color: '#fff', textAlign: 'center' },
  redeemCost: { fontSize: 11, color: '#8B5CF6', fontWeight: '700' },
  // Earnings
  noActivity: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingVertical: 20 },
  earningRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: '#1A1A2E', borderRadius: 12, padding: spacing.lg,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: '#2A2A3E',
  },
  earningIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  earningInfo: { flex: 1 },
  earningDesc: { fontSize: 14, color: '#fff', fontWeight: '500' },
  earningTime: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  earningAmount: { fontSize: 16, fontWeight: '700' },
  // Init
  initContainer: { flex: 1, padding: spacing.xl },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1A1A2E', justifyContent: 'center', alignItems: 'center' },
  initContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hederaLogo: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#8B5CF620', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.xl },
  initTitle: { fontSize: 32, fontWeight: '800', color: '#fff', marginBottom: 4 },
  initSub: { fontSize: 14, color: '#8B5CF6', fontWeight: '600', marginBottom: spacing.xl },
  initDesc: { fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 22, marginBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  initFeatures: { width: '100%', gap: spacing.md, marginBottom: spacing.xxl },
  initFeature: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  initFeatureText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  initBtn: { backgroundColor: '#8B5CF6', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48, width: '100%', alignItems: 'center' },
  initBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  referralListCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#2A2A3E',
    marginBottom: spacing.xl,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3E',
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#8B5CF6',
    marginTop: 5,
  },
  activityTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  activityDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  activityTime: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});