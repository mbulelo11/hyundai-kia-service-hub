import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

const STATUS_OPTIONS = ['All', 'submitted', 'under_review', 'pre_approved', 'contract_ready', 'declined', 'more_info_needed'];
const PROGRESS_STEPS = ['submitted', 'under_review', 'pre_approved', 'contract_ready'];
const VINCENT_ADMIN_EMAIL = 'vincentmm@hyundai.co.za';

function formatStatus(status?: string) {
  const map: Record<string, string> = {
    submitted: 'Submitted',
    under_review: 'Under review',
    pre_approved: 'Pre-approved',
    contract_ready: 'Contract ready',
    approved: 'Contract ready',
    declined: 'Declined',
    more_info_needed: 'More info needed',
  };
  return map[status ?? 'submitted'] ?? (status ?? 'submitted').replace(/_/g, ' ');
}

function formatDealStatus(status?: string) {
  const map: Record<string, string> = {
    sold: 'Sold',
    delivered: 'Delivered',
    closed: 'Closed',
  };
  return map[status ?? ''] ?? 'Closed';
}

function getDealStatusMeta(status?: string) {
  const map: Record<string, { label: string, icon: string, color: string, bg: string }> = {
    sold: { label: 'Sold', icon: 'checkmark-circle', color: colors.success, bg: colors.success + '10' },
    delivered: { label: 'Delivered', icon: 'checkmark-circle', color: colors.success, bg: colors.success + '10' },
    closed: { label: 'Closed', icon: 'checkmark-circle', color: colors.success, bg: colors.success + '10' },
  };
  return map[status ?? ''] ?? { label: 'Unknown', icon: 'information-circle', color: colors.textSecondary, bg: colors.textSecondary + '10' };
}

function getCustomerStage(status?: string) {
  switch (status) {
    case 'contract_ready':
    case 'approved':
      return { label: 'Contract ready', color: colors.success, step: 3 };
    case 'pre_approved':
      return { label: 'Pre-approved', color: colors.statusInProgress, step: 2 };
    case 'declined':
      return { label: 'Declined', color: colors.error, step: 3 };
    case 'more_info_needed':
      return { label: 'Needs more info', color: colors.warning, step: 1 };
    case 'under_review':
      return { label: 'Under review', color: colors.statusInProgress, step: 1 };
    default:
      return { label: 'Submitted', color: colors.primary, step: 0 };
  }
}

export default function FinanceApplicationsScreen({ navigation }: any) {
  const user = useQuery(api.users.me);
  const headerRise = React.useRef(new Animated.Value(0)).current;
  const isAdmin = Boolean(user?.isOwner || String(user?.email ?? '').trim().toLowerCase() === VINCENT_ADMIN_EMAIL);
  const isStaff = Boolean(user?.role === 'staff' || user?.staffRole !== undefined || isAdmin);
  const adminApps = useQuery(api.finance.listAdmin, isAdmin ? {} : 'skip') ?? [];
  const staffApps = useQuery(api.finance.listAll, isStaff && !isAdmin ? {} : 'skip') ?? [];
  const myApps = useQuery(api.finance.listMine, {}) ?? [];
  const liveFeed = useQuery(api.analytics.getFinanceApplicationFeed) ?? [];
  const [filter, setFilter] = useState('All');

  const canSeeAll = Boolean(isAdmin);
  const adminLabel = canSeeAll ? 'Admin Console' : 'Limited Access';
  const staffScopeLabel = 'Scoped by department and assignment';

  const apps = isAdmin ? liveFeed : isStaff ? staffApps : myApps;
  const filtered = isStaff
    ? filter === 'All'
      ? apps
      : apps.filter((a: any) => a.status === filter)
    : apps;

  const openDetail = (app: any) => {
    navigation.navigate('FinanceApplicationDetail', { applicationId: app._id, application: app, isStaff: isAdmin || isStaff });
  };

  if (user === undefined) {
    return (
      <View style={styles.loadingWrap}>
        <View style={styles.loadingCard}>
          <View style={styles.loadingLine} />
          <View style={[styles.loadingLine, { width: '72%', marginTop: 10 }]} />
          <View style={[styles.loadingLine, { width: '88%', marginTop: 18, height: 82, borderRadius: 20 }]} />
        </View>
      </View>
    );
  }

  const totals = {
    total: apps.length,
    submitted: apps.filter((a: any) => a.status === 'submitted').length,
    review: apps.filter((a: any) => a.status === 'under_review').length,
    contract: apps.filter((a: any) => a.status === 'approved' || a.status === 'contract_ready').length,
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.primary }}>
        <Animated.View style={[styles.header, { transform: [{ translateY: headerRise.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }] }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}>
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{isStaff ? 'Finance Applications' : 'My Finance Applications'}</Text>
            <Text style={styles.headerSub}>{isStaff ? 'Premium review desk' : 'Track every step clearly'}</Text>
          </View>
          <View style={{ width: 40 }} />
        </Animated.View>
      </SafeAreaView>

      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>{isStaff ? 'Staff review desk' : 'My funding journey'}</Text>
            <Text style={styles.heroTitle}>{isStaff ? 'Review, assign, and close faster' : 'Track every step clearly'}</Text>
          </View>
          <View style={styles.heroBadge}>
            <Ionicons name={isStaff ? 'shield-checkmark' : 'document-text'} size={16} color={colors.white} />
            <Text style={styles.heroBadgeText}>{isStaff ? adminLabel : 'Customer view'}</Text>
          </View>
        </View>
        <View style={styles.heroStatsRow}>
          <View style={styles.heroStat}><Text style={styles.heroStatValue}>{totals.total}</Text><Text style={styles.heroStatLabel}>Total</Text></View>
          <View style={styles.heroStat}><Text style={styles.heroStatValue}>{totals.submitted}</Text><Text style={styles.heroStatLabel}>Submitted</Text></View>
          <View style={styles.heroStat}><Text style={styles.heroStatValue}>{totals.review}</Text><Text style={styles.heroStatLabel}>Review</Text></View>
          <View style={styles.heroStat}><Text style={styles.heroStatValue}>{totals.contract}</Text><Text style={styles.heroStatLabel}>Ready</Text></View>
        </View>
      </View>

      {isStaff && !isAdmin && (
        <TouchableOpacity style={styles.staffModeBanner} onPress={() => navigation.navigate('Staff')}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.staffModeTitle}>{adminLabel}</Text>
            <Text style={styles.staffModeText}>{staffScopeLabel}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
        </TouchableOpacity>
      )}

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNum}>{apps.length}</Text>
          <Text style={styles.summaryLabel}>{isStaff ? 'Total' : 'Applications'}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNum}>{apps.filter((a: any) => a.status === 'submitted').length}</Text>
          <Text style={styles.summaryLabel}>{isStaff ? 'Submitted' : 'Submitted'}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNum}>{apps.filter((a: any) => a.status === 'under_review').length}</Text>
          <Text style={styles.summaryLabel}>{isStaff ? 'Review' : 'In Progress'}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNum}>{apps.filter((a: any) => a.status === 'approved' || a.status === 'contract_ready').length}</Text>
          <Text style={styles.summaryLabel}>{isStaff ? 'Contract' : 'Contract Ready'}</Text>
        </View>
      </View>

      {isStaff && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {STATUS_OPTIONS.map((s) => (
            <TouchableOpacity key={s} style={[styles.filterChip, filter === s && styles.filterChipActive]} onPress={() => setFilter(s)}>
              <Text style={[styles.filterText, filter === s && styles.filterTextActive]}>{s === 'All' ? 'All' : formatStatus(s)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {!isStaff && apps.length > 0 && (
        <View style={styles.progressBanner}>
          <Ionicons name="time-outline" size={18} color={colors.primary} />
          <Text style={styles.progressBannerText}>Tap an application to review the submitted details and current progress.</Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item: any) => item._id}
        contentContainerStyle={styles.list}
        renderItem={({ item }: any) => {
          if (isStaff) {
            return (
              <TouchableOpacity style={styles.card} onPress={() => openDetail(item)} activeOpacity={0.85}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.firstName} {item.surname}</Text>
                    <Text style={styles.vehicle}>{item.vehicleDescription || 'No vehicle selected'}</Text>
                    <Text style={styles.meta}>{item.phone} · {item.email}</Text>
                  </View>
                  {item.dealStatus ? (() => {
                    const dealMeta = getDealStatusMeta(item.dealStatus);
                    return (
                      <View style={[styles.dealBadge, { backgroundColor: dealMeta.bg, borderColor: dealMeta.color + '22' }]}>
                        <Ionicons name={dealMeta.icon} size={12} color={dealMeta.color} />
                        <Text style={[styles.dealBadgeText, { color: dealMeta.color }]}>{dealMeta.label}</Text>
                      </View>
                    );
                  })() : (
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>{formatStatus(item.status)}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.meta}>{item.assignedToName ? `Assigned to ${item.assignedToName}` : 'Unassigned'}</Text>
                {item.closedDeal ? (
                  <Text style={styles.closedDeal}>{item.dealStatus ? `Closed as ${formatDealStatus(item.dealStatus)}` : 'Closed deal'}</Text>
                ) : null}
                {Array.isArray(item.attachmentNames) && item.attachmentNames.length > 0 ? (
                  <Text style={styles.attachmentMeta} numberOfLines={1}>Attachments: {item.attachmentNames.join(', ')}</Text>
                ) : null}
                <Text style={styles.tapHint}>Tap to view full application</Text>
              </TouchableOpacity>
            );
          }

          const stage = getCustomerStage(item.status);
          return (
            <TouchableOpacity style={styles.customerCard} onPress={() => openDetail(item)} activeOpacity={0.85}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.vehicleDescription || 'Vehicle finance application'}</Text>
                  <Text style={styles.vehicle}>Submitted on {new Date(item._creationTime).toLocaleDateString()}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: stage.color + '16' }]}>
                  <Text style={[styles.statusText, { color: stage.color }]}>{stage.label}</Text>
                </View>
              </View>

              <View style={styles.progressTrack}>
                {PROGRESS_STEPS.map((stepName, index) => {
                  const isDone = index <= stage.step;
                  const isFinal = index === PROGRESS_STEPS.length - 1;
                  return (
                    <View key={stepName} style={styles.progressStep}>
                      <View style={[styles.progressDot, { backgroundColor: isDone ? stage.color : colors.border }]} />
                      <Text style={[styles.progressLabel, isDone && { color: colors.text, fontWeight: '700' }]}>
                        {stepName === 'under_review' ? 'Under review' : stepName === 'pre_approved' ? 'Pre-approved' : stepName === 'contract_ready' ? 'Contract ready' : stepName.replace('_', ' ')}
                      </Text>
                      {!isFinal && <View style={[styles.progressLine, { backgroundColor: index < stage.step ? stage.color : colors.border }]} />}
                    </View>
                  );
                })}
              </View>

              {item.staffNotes ? (
                <Text style={styles.customerNotes} numberOfLines={2}>Update: {item.staffNotes}</Text>
              ) : null}

              <Text style={styles.tapHint}>Tap to view submitted details and status updates</Text>
            </TouchableOpacity>
          );
        }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          return;
        }}
        ListFooterComponent={null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={42} color={colors.textLight} />
            <Text style={styles.emptyTitle}>{isStaff ? 'No finance applications yet' : 'No finance applications yet'}</Text>
            <Text style={styles.emptyText}>{isStaff ? 'Submitted applications will appear here and stay retrievable.' : 'Your submitted applications and progress will appear here.'}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  loadingText: { fontSize: 14, color: colors.textSecondary },
  loadingCard: { width: '84%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight },
  loadingLine: { width: '100%', height: 16, borderRadius: 999, backgroundColor: colors.borderLight, opacity: 0.55 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.white },
  headerSub: { fontSize: 12, color: colors.primaryLight, marginTop: 2 },
  headerIcon: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.md },
  heroCard: { marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroLabel: { fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { fontSize: 18, fontWeight: '900', color: colors.text, marginTop: 4 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.primary },
  heroBadgeText: { fontSize: 11, fontWeight: '700', color: colors.white },
  heroStatsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.lg, flexWrap: 'wrap' },
  heroStat: { flexGrow: 1, flexBasis: '22%', backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, paddingVertical: 10, alignItems: 'center' },
  heroStatValue: { fontSize: 18, fontWeight: '900', color: colors.text },
  heroStatLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, marginTop: 2 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.lg },
  summaryCard: { flexGrow: 1, flexBasis: '22%', backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight },
  summaryNum: { fontSize: 20, fontWeight: '800', color: colors.text },
  summaryLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  filters: { paddingHorizontal: spacing.lg, gap: 8, paddingBottom: spacing.sm },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, color: colors.textSecondary, fontWeight: '700' },
  filterTextActive: { color: colors.white },
  progressBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.primary + '10', padding: spacing.md, borderRadius: radius.md },
  progressBannerText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  staffModeBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.primary + '10', padding: spacing.md, borderRadius: radius.md },
  staffModeTitle: { fontSize: 13, fontWeight: '800', color: colors.primary },
  staffModeText: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  list: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 40 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderLight, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  customerCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderLight, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  cardTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  name: { fontSize: 16, fontWeight: '800', color: colors.text },
  vehicle: { fontSize: 13, color: colors.primary, marginTop: 2 },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  attachmentMeta: { fontSize: 12, color: colors.primary, marginTop: 4 },
  closedDeal: { fontSize: 11, color: colors.success, fontWeight: '800', marginTop: 4 },
  statusBadge: { backgroundColor: colors.primary + '12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '800', color: colors.primary, textTransform: 'capitalize' },
  dealBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  dealBadgeText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  tapHint: { fontSize: 12, color: colors.textLight, fontStyle: 'italic', marginTop: spacing.sm },
  customerNotes: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.md, lineHeight: 18 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 32 },
  progressTrack: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'flex-start' },
  progressStep: { flex: 1, alignItems: 'center', position: 'relative' },
  progressDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 6 },
  progressLine: { position: 'absolute', top: 5, right: '-50%', width: '100%', height: 2, zIndex: -1 },
  progressLabel: { fontSize: 10, color: colors.textLight, textAlign: 'center' },
});