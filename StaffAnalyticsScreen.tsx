import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_HEIGHT = 180;

const CHART_COLORS = ['#00AAD2', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#EC4899', '#06B6D4'];

// ============================================
// BAR CHART COMPONENT (pure View-based)
// ============================================
function BarChart({ data, height = CHART_HEIGHT, color = '#00AAD2', showLabels = true }: {
  data: { label: string; value: number; secondary?: number }[];
  height?: number;
  color?: string;
  showLabels?: boolean;
}) {
  if (!data.length) return <Text style={{ fontSize: 13, color: colors.textLight, textAlign: 'center', paddingVertical: 20 }}>No data yet</Text>;
  const maxVal = Math.max(...data.map(d => d.value), 1);

  return (
    <View>
      {/* Y-axis labels */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, paddingHorizontal: 4 }}>
        <Text style={{ fontSize: 9, color: colors.textLight }}>{maxVal}</Text>
        <Text style={{ fontSize: 9, color: colors.textLight }}>{Math.round(maxVal / 2)}</Text>
        <Text style={{ fontSize: 9, color: colors.textLight }}>0</Text>
      </View>
      {/* Bars */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, borderBottomWidth: 1, borderBottomColor: colors.borderLight, paddingHorizontal: 2 }}>
        {data.map((d, i) => {
          const barH = Math.max((d.value / maxVal) * height, 2);
          const secH = d.secondary ? Math.max((d.secondary / maxVal) * height, 2) : 0;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 1 }}>
              {d.value > 0 && (
                <Text style={{ fontSize: 8, color: colors.textSecondary, marginBottom: 2 }}>{d.value}</Text>
              )}
              <View style={{ width: '70%', position: 'relative' }}>
                <View style={{
                  height: barH,
                  backgroundColor: color,
                  borderTopLeftRadius: 3,
                  borderTopRightRadius: 3,
                  opacity: 0.9,
                }} />
                {secH > 0 && (
                  <View style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: secH,
                    backgroundColor: '#10B981',
                    borderTopLeftRadius: 3,
                    borderTopRightRadius: 3,
                    opacity: 0.7,
                  }} />
                )}
              </View>
            </View>
          );
        })}
      </View>
      {/* X labels */}
      {showLabels && (
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          {data.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 8, color: colors.textLight }} numberOfLines={1}>{d.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ============================================
// STAR DISTRIBUTION
// ============================================
function StarDistribution({ distribution }: { distribution: { stars: number; count: number }[] }) {
  const maxCount = Math.max(...distribution.map(d => d.count), 1);
  return (
    <View>
      {distribution.map(d => (
        <View key={d.stars} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text, width: 20 }}>{d.stars}</Text>
          <Ionicons name="star" size={12} color="#F59E0B" />
          <View style={{ flex: 1, height: 8, backgroundColor: colors.borderLight, borderRadius: 4, marginHorizontal: 8 }}>
            <View style={{
              height: 8, borderRadius: 4, backgroundColor: '#F59E0B',
              width: `${Math.max((d.count / maxCount) * 100, 2)}%`,
            }} />
          </View>
          <Text style={{ fontSize: 11, color: colors.textSecondary, width: 24, textAlign: 'right' }}>{d.count}</Text>
        </View>
      ))}
    </View>
  );
}

// ============================================
// KPI CARD
// ============================================
function KpiCard({ icon, label, value, subValue, color, bgColor }: {
  icon: string; label: string; value: string | number; subValue?: string; color: string; bgColor: string;
}) {
  return (
    <View style={[styles.kpiCard, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <View style={[styles.kpiIcon, { backgroundColor: bgColor }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {subValue && <Text style={styles.kpiSub}>{subValue}</Text>}
    </View>
  );
}

// ============================================
// HORIZONTAL BAR COMPONENT (for breakdowns)
// ============================================
function HorizontalBar({ label, value, maxValue, color, percentage }: {
  label: string; value: number; maxValue: number; color: string; percentage?: number;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <View style={hStyles.row}>
      <View style={hStyles.labelRow}>
        <Text style={hStyles.label} numberOfLines={1}>{label}</Text>
        <Text style={hStyles.value}>{value} {percentage !== undefined ? `(${percentage}%)` : ''}</Text>
      </View>
      <View style={hStyles.barBg}>
        <View style={[hStyles.barFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const hStyles = StyleSheet.create({
  row: { marginBottom: 10 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '600', color: colors.text, flex: 1 },
  value: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  barBg: { height: 8, backgroundColor: colors.borderLight, borderRadius: 4 },
  barFill: { height: 8, borderRadius: 4 },
});

// ============================================
// MAIN SCREEN
// ============================================
export default function StaffAnalyticsScreen({ navigation }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'services' | 'stock' | 'tokens'>('overview');
  const pulse = useState(() => new Animated.Value(0))[0];

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  const me = useQuery(api.users.me);
  const isVincentAdmin = String(me?.email ?? '').trim().toLowerCase() === 'vincentmm@hyundai.co.za';
  const isModerator = Boolean(me?.isOwner || isVincentAdmin || String(me?.role ?? '').toLowerCase() === 'admin' || me?.staffRole === 'dp' || me?.accessLevel === 'full_access');

  const stats = useQuery(api.analytics.getDashboardStats);
  const financeFeed = useQuery(api.analytics.getFinanceApplicationFeed) ?? [];
  const postEngagementQuery = useQuery(api.analytics.getPostEngagementStats) ?? null;
  const postEngagement = isModerator ? postEngagementQuery : null;
  const serviceTrend = useQuery(api.analytics.getServiceTrend) ?? [];
  const tokenTrend = useQuery(api.analytics.getTokenTrend) ?? [];
  const serviceBreakdown = useQuery(api.analytics.getServiceBreakdown) ?? [];
  const stockBreakdown = useQuery(api.analytics.getStockBreakdown);
  const stockEngagement = useQuery(api.analytics.getStockEngagementStats);
  const testDriveStats = useQuery(api.analytics.getTestDriveStats);
  const reviewStats = useQuery(api.analytics.getReviewStats);
  const merchandiseSales = useQuery(api.analytics.getMerchandiseSalesStats);
  const performanceBoard = useQuery(api.analytics.getPerformanceBoard, { limit: 6 }) ?? { staff: [], users: [] };

  const hasLiveStats = Boolean(stats && (stats.totalBookings > 0 || stats.totalUsers > 0 || stats.totalFinanceApps > 0 || stats.totalMessages > 0 || stats.totalPostLikes > 0 || stats.totalPostViews > 0));
  const noLinkedLiveData = !hasLiveStats;
  const emptyStateTitle = isVincentAdmin ? 'Vincent admin view has no linked live data yet' : 'Staff-scoped analytics has no linked live data yet';
  const emptyStateText = isVincentAdmin 
    ? 'Vincent can only see live records that are actually linked to the backend scope. If this shows up, the database currently has no accessible bookings, finance applications, messages, posts, reviews, or stock activity tied to the Vincent admin identity yet.'
    : 'This staff view shows live dealership progress for all accessible staff accounts in the assigned brand/dealership scope. If this shows up, the backend currently has no linked live records available for your access level.';
  const displayStats = stats ?? {
    totalBookings: 0,
    pendingBookings: 0,
    confirmedBookings: 0,
    inProgressBookings: 0,
    completedBookings: 0,
    totalUsers: 0,
    customerCount: 0,
    staffCount: 0,
    totalStock: 0,
    availableStock: 0,
    soldStock: 0,
    totalTestDrives: 0,
    pendingTestDrives: 0,
    totalFinanceApps: 0,
    pendingFinanceApps: 0,
    totalReviews: 0,
    avgRating: 0,
    totalTokensCirculating: 0,
    totalMessages: 0,
    unreadMessages: 0,
    financeClosedDeals: 0,
    totalPostLikes: 0,
    totalPostViews: 0,
  };

  const showMetric = (value: number | string) => (noLinkedLiveData ? '' : value);

  if (!stats) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.primary }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={20} color={colors.white} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerEyebrow}>STAFF INTELLIGENCE</Text>
              <Text style={styles.headerTitle}>Analytics</Text>
            </View>
            <View style={styles.headerIcon}><Ionicons name="analytics" size={20} color={colors.white} /></View>
          </View>
        </SafeAreaView>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.primary }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerEyebrow}>STAFF INTELLIGENCE</Text>
            <Text style={styles.headerTitle}>Analytics Dashboard</Text>
          </View>
          <View style={styles.headerIcon}><Ionicons name="analytics" size={20} color={colors.white} /></View>
        </View>
      </SafeAreaView>

      <View style={styles.heroStrip}>
        <View style={styles.heroStat}><Text style={styles.heroStatValue}>{showMetric(displayStats.totalBookings)}</Text><Text style={styles.heroStatLabel}>Bookings</Text></View>
        <View style={styles.heroStat}><Text style={styles.heroStatValue}>{showMetric(displayStats.pendingBookings)}</Text><Text style={styles.heroStatLabel}>Pending</Text></View>
        <View style={styles.heroStat}><Text style={styles.heroStatValue}>{showMetric(displayStats.totalFinanceApps)}</Text><Text style={styles.heroStatLabel}>Finance</Text></View>
        <View style={styles.heroStat}><Text style={styles.heroStatValue}>{showMetric(displayStats.totalMessages)}</Text><Text style={styles.heroStatLabel}>Messages</Text></View>
      </View>

      {noLinkedLiveData && (
        <View style={styles.emptyStateCard}>
          <View style={styles.emptyStateIconWrap}>
            <Ionicons name="cloud-offline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.emptyStateTitle}>{emptyStateTitle}</Text>
            <Text style={styles.emptyStateText}>
              {emptyStateText}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Ionicons name="document-text" size={18} color={colors.primary} />
          <Text style={styles.chartTitle}>Live Finance Applications</Text>
        </View>
        <Text style={styles.chartSubtitle}>{financeFeed.length > 0 ? `${financeFeed.length} authorized apps streaming from the backend in real time` : (isVincentAdmin ? 'Vincent admin access is live, but no finance applications are linked to this account yet.' : 'Staff access is live, but no finance applications are assigned to your department or role yet.')}</Text>
        {financeFeed.length > 0 ? financeFeed.slice(0, 8).map((app: any) => (
          <View key={app._id} style={styles.topPostRow}>
            <View style={styles.topPostRank}><Text style={styles.topPostRankText}>F</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.topPostTitle} numberOfLines={1}>{app.firstName} {app.surname}</Text>
              <Text style={styles.topPostMeta}>{app.vehicleDescription || 'No vehicle selected'} " {String(app.status).replace(/_/g, ' ')}</Text>
            </View>
            <View style={styles.topPostStats}>
              <Text style={styles.topPostStat}>{app.assignedToName || 'Unassigned'}</Text>
            </View>
          </View>
        )) : (
          <Text style={styles.emptyText}>No linked live finance applications to display.</Text>
        )}
      </View>

      <View style={styles.premiumHero}>
        <View style={styles.premiumHeroTextWrap}>
          <View style={styles.heroBadge}>
            <Animated.View style={[styles.heroPulseDot, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]} />
            <Text style={styles.heroBadgeText}>Live telemetry</Text>
          </View>
          <Text style={styles.premiumHeroTitle}>Automotive command center</Text>
          <Text style={styles.premiumHeroSub}>A premium analytics board for bookings, stock, rewards, and post engagement.</Text>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetricPill}><Text style={styles.heroMetricValue}>{showMetric(displayStats.totalPostLikes)}</Text><Text style={styles.heroMetricLabel}>Post likes</Text></View>
            <View style={styles.heroMetricPill}><Text style={styles.heroMetricValue}>{showMetric(displayStats.totalPostViews)}</Text><Text style={styles.heroMetricLabel}>Unique views</Text></View>
          </View>
        </View>
        <TechIllustration />
      </View>

      <View style={styles.tabRow}>
        {(['overview', 'services', 'stock', 'tokens'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.activeTab]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 180 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(false)} />}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <>
            {/* KPI Grid */}
            <View style={styles.kpiGrid}>
              <KpiCard icon="car" label="Total Bookings" value={showMetric(displayStats.totalBookings)} subValue={noLinkedLiveData ? 'No linked data' : `${displayStats.pendingBookings} pending`} color="#3B82F6" bgColor="#DBEAFE" />
              <KpiCard icon="people" label={isModerator ? "Total Users" : "My Customers"} value={showMetric(isModerator ? displayStats.totalUsers : displayStats.customerCount)} subValue={noLinkedLiveData ? 'No linked data' : isModerator ? `${displayStats.customerCount} customers` : `${displayStats.customerCount} assigned`} color="#10B981" bgColor="#D1FAE5" />
              <KpiCard icon="cube" label="Stock" value={showMetric(displayStats.totalStock)} subValue={noLinkedLiveData ? 'No linked data' : `${displayStats.availableStock} available`} color="#8B5CF6" bgColor="#EDE9FE" />
              <KpiCard icon="speedometer" label="Test Drives" value={showMetric(displayStats.totalTestDrives)} subValue={noLinkedLiveData ? 'No linked data' : `${displayStats.pendingTestDrives} pending`} color="#F59E0B" bgColor="#FEF3C7" />
              <KpiCard icon="document-text" label="Finance Apps" value={showMetric(displayStats.totalFinanceApps)} subValue={noLinkedLiveData ? 'No linked data' : `${displayStats.pendingFinanceApps} pending`} color="#EC4899" bgColor="#FCE7F3" />
              <KpiCard icon="star" label="Avg Rating" value={showMetric(displayStats.avgRating)} subValue={noLinkedLiveData ? 'No linked data' : `${displayStats.totalReviews} reviews`} color="#F59E0B" bgColor="#FEF3C7" />
              <KpiCard icon="diamond" label="Tokens" value={showMetric(displayStats.totalTokensCirculating.toLocaleString())} subValue={noLinkedLiveData ? 'No linked data' : 'Circulating'} color="#06B6D4" bgColor="#CFFAFE" />
              <KpiCard icon="chatbubbles" label="Messages" value={showMetric(displayStats.totalMessages)} subValue={noLinkedLiveData ? 'No linked data' : `${displayStats.unreadMessages} unread`} color="#6366F1" bgColor="#E0E7FF" />
            </View>

            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Ionicons name="trophy" size={18} color={colors.primary} />
                <Text style={styles.chartTitle}>Sales Staff Performance</Text>
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingBadgeText}>{performanceBoard.staff.length} leaders</Text>
                </View>
              </View>
              <Text style={styles.chartSubtitle}>Ranked by customer activity, deals handled, and live app usage.</Text>
              {performanceBoard.staff.length > 0 ? performanceBoard.staff.map((row: any, index: number) => (
                <View key={row.userId} style={styles.performanceRow}>
                  <View style={styles.performanceRank}><Text style={styles.performanceRankText}>{index + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.performanceName} numberOfLines={1}>{row.name}</Text>
                    <Text style={styles.performanceMeta} numberOfLines={1}>{row.dealershipName || 'Unassigned'}{row.dealershipLocation ? ` " ${row.dealershipLocation}` : ''}</Text>
                    <View style={styles.performancePills}>
                      <View style={styles.performancePill}><Text style={styles.performancePillText}>{row.customers} customers</Text></View>
                      <View style={styles.performancePill}><Text style={styles.performancePillText}>{row.bookings} bookings</Text></View>
                      <View style={styles.performancePill}><Text style={styles.performancePillText}>{row.testDrives} test drives</Text></View>
                      <View style={styles.performancePill}><Text style={styles.performancePillText}>{row.financeApps} finance</Text></View>
                    </View>
                  </View>
                  <View style={styles.performanceScoreCol}>
                    <Text style={styles.performanceScore}>{row.score}</Text>
                    <Text style={[styles.performanceState, { color: row.isOnline ? '#10B981' : colors.textLight }]}>{row.isOnline ? 'Online' : 'Offline'}</Text>
                  </View>
                </View>
              )) : <Text style={styles.emptyText}>No staff performance data yet.</Text>}
            </View>

            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Ionicons name="person-circle" size={18} color="#06B6D4" />
                <Text style={styles.chartTitle}>User Activity Board</Text>
              </View>
              <Text style={styles.chartSubtitle}>Customers ranked by the activity they generate inside the app.</Text>
              {performanceBoard.users.length > 0 ? performanceBoard.users.map((row: any, index: number) => (
                <View key={row.userId} style={styles.performanceRow}>
                  <View style={[styles.performanceRank, { backgroundColor: '#06B6D4' + '12' }]}><Text style={[styles.performanceRankText, { color: '#06B6D4' }]}>{index + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.performanceName} numberOfLines={1}>{row.name}</Text>
                    <Text style={styles.performanceMeta} numberOfLines={1}>Assigned to {row.assignedStaffName || 'Unassigned'}</Text>
                    <View style={styles.performancePills}>
                      <View style={styles.performancePill}><Text style={styles.performancePillText}>{row.bookings} bookings</Text></View>
                      <View style={styles.performancePill}><Text style={styles.performancePillText}>{row.testDrives} test drives</Text></View>
                      <View style={styles.performancePill}><Text style={styles.performancePillText}>{row.financeApps} finance</Text></View>
                      <View style={styles.performancePill}><Text style={styles.performancePillText}>{row.messages} messages</Text></View>
                    </View>
                  </View>
                  <View style={styles.performanceScoreCol}>
                    <Text style={styles.performanceScore}>{row.score}</Text>
                    <Text style={[styles.performanceState, { color: row.lastSeenAt ? '#10B981' : colors.textLight }]}>{row.lastSeenAt ? 'Active' : 'Quiet'}</Text>
                  </View>
                </View>
              )) : <Text style={styles.emptyText}>No user activity yet.</Text>}
            </View>

            {/* Service Trend Chart */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Ionicons name="trending-up" size={18} color={colors.primary} />
                <Text style={styles.chartTitle}>Service Bookings Trend</Text>
              </View>
              <Text style={styles.chartSubtitle}>Last 12 weeks  Blue: Total, Green: Completed</Text>
              <BarChart
                data={serviceTrend.map((w: any) => ({ label: w.label, value: w.total, secondary: w.completed }))}
                color="#3B82F6"
              />
            </View>

            {postEngagement && (
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <Ionicons name="pulse" size={18} color="#06B6D4" />
                  <Text style={styles.chartTitle}>Post Engagement</Text>
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingBadgeText}>{postEngagement.totalPosts} posts</Text>
                  </View>
                </View>
                <Text style={styles.chartSubtitle}>{postEngagement.totalLikes} likes " {postEngagement.totalViews} unique views " {postEngagement.totalComments} comments</Text>
                <BarChart
                  data={postEngagement.weekly.map((w: any) => ({ label: w.label, value: w.views, secondary: w.likes }))}
                  color="#06B6D4"
                />
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#06B6D4' }]} /><Text style={styles.legendText}>Views</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#10B981' }]} /><Text style={styles.legendText}>Likes</Text></View>
                </View>
                {postEngagement.topPosts.length > 0 && (
                  <>
                    <Text style={styles.subSectionTitle}>Top Posts</Text>
                    {postEngagement.topPosts.map((post: any, i: number) => (
                      <View key={post.postId} style={styles.topPostRow}>
                        <View style={styles.topPostRank}><Text style={styles.topPostRankText}>{i + 1}</Text></View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.topPostTitle} numberOfLines={1}>{post.title || 'Untitled post'}</Text>
                          <Text style={styles.topPostMeta}>{post.authorDisplayName}</Text>
                        </View>
                        <View style={styles.topPostStats}>
                          <Text style={styles.topPostStat}>{post.views} views</Text>
                          <Text style={styles.topPostStat}>{post.likes} likes</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </View>
            )}

            {/* Review Stats */}
            {reviewStats && (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.chartCard}
                onPress={() => navigation.navigate('Review')}
              >
                <View style={styles.chartHeader}>
                  <Ionicons name="star" size={18} color="#F59E0B" />
                  <Text style={styles.chartTitle}>Customer Reviews</Text>
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingBadgeText}>{reviewStats.avgRating} / 5</Text>
                  </View>
                </View>
                <Text style={styles.chartSubtitle}>{reviewStats.total} reviews  {reviewStats.googleShared} shared to Google</Text>
                <Text style={styles.reviewScopeNote}>
                  {isVincentAdmin ? 'Vincent sees only reviews linked to the live backend; if this is empty, there are no accessible review records yet.' : 'Staff sees only reviews explicitly allowed by role, department, or admin grant; if this is empty, there are no accessible review records yet.'}
                </Text>
                <StarDistribution distribution={reviewStats.distribution} />
                <View style={styles.reviewLinkRow}>
                  <Text style={styles.reviewLinkText}>Tap to open full review thread view</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </View>
              </TouchableOpacity>
            )}

            {merchandiseSales && (
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <Ionicons name="pricetag" size={18} color={colors.primary} />
                  <Text style={styles.chartTitle}>Merchandise Sales</Text>
                </View>
                <Text style={styles.chartSubtitle}>{merchandiseSales.totalOrders} orders " R {merchandiseSales.totalRevenue.toLocaleString()} revenue</Text>
                <View style={styles.miniStatsRow}>
                  {[
                    { label: 'Open', value: merchandiseSales.openOrders, color: colors.statusPending },
                    { label: 'Complete', value: merchandiseSales.completedOrders, color: colors.statusCompleted },
                    { label: 'Brands', value: merchandiseSales.byBrand.length, color: colors.primaryLight },
                  ].map((s) => (
                    <View key={s.label} style={styles.miniStat}>
                      <Text style={[styles.miniStatNum, { color: s.color }]}>{s.value}</Text>
                      <Text style={styles.miniStatLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>
                {merchandiseSales.byBrand.map((brand: any) => (
                  <View key={brand.brand}>
                    <HorizontalBar
                      label={brand.brand}
                      value={brand.orders}
                      maxValue={Math.max(...merchandiseSales.byBrand.map((b: any) => b.orders), 1)}
                      color={brand.brand === 'Kia' ? '#7C3AED' : colors.primary}
                    />
                  </View>
                ))}
                {merchandiseSales.recentOrders.length > 0 ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <Text style={styles.subSectionTitle}>Recent orders</Text>
                    {merchandiseSales.recentOrders.slice(0, 5).map((order: any) => (
                      <View key={order.orderId} style={styles.topPostRow}>
                        <View style={styles.topPostRank}><Text style={styles.topPostRankText}>$</Text></View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.topPostTitle} numberOfLines={1}>{order.title}</Text>
                          <Text style={styles.topPostMeta}>{order.brand} " {String(order.status).replace(/_/g, ' ')}</Text>
                        </View>
                        <View style={styles.topPostStats}>
                          <Text style={styles.topPostStat}>R {order.totalAmount.toLocaleString()}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            )}
          </>
        )}

        {/* SERVICES TAB */}
        {activeTab === 'services' && (
          <>
            {/* Booking Status Cards */}
            <View style={styles.statusRow}>
              {[
                { label: 'Pending', value: displayStats.pendingBookings, color: colors.statusPending },
                { label: 'Confirmed', value: displayStats.confirmedBookings, color: colors.statusConfirmed },
                { label: 'In Progress', value: displayStats.inProgressBookings, color: colors.statusInProgress },
                { label: 'Completed', value: displayStats.completedBookings, color: colors.statusCompleted },
              ].map(s => (
                <View key={s.label} style={[styles.statusCard, { borderTopColor: s.color, borderTopWidth: 3 }]}>
                  <Text style={[styles.statusNum, { color: s.color }]}>{s.value}</Text>
                  <Text style={styles.statusLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Service Type Breakdown */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Ionicons name="pie-chart" size={18} color={colors.primary} />
                <Text style={styles.chartTitle}>Service Type Breakdown</Text>
              </View>
              {serviceBreakdown.map((s: any, i: number) => (
                <View key={s.serviceType}>
                  <HorizontalBar
                    label={s.serviceType}
                    value={s.count}
                    maxValue={serviceBreakdown[0]?.count ?? 1}
                    color={CHART_COLORS[i % CHART_COLORS.length]}
                    percentage={s.percentage}
                  />
                </View>
              ))}
              {serviceBreakdown.length === 0 && (
                <Text style={styles.emptyText}>No bookings yet</Text>
              )}
            </View>

            {/* Service Trend */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Ionicons name="bar-chart" size={18} color={colors.primary} />
                <Text style={styles.chartTitle}>Weekly Trend</Text>
              </View>
              <BarChart data={serviceTrend.map((w: any) => ({ label: w.label, value: w.total, secondary: w.completed }))} color="#3B82F6" />
            </View>

            {/* Test Drive Stats */}
            {testDriveStats && (
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <Ionicons name="speedometer" size={18} color="#F59E0B" />
                  <Text style={styles.chartTitle}>Test Drives</Text>
                  <View style={[styles.ratingBadge, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[styles.ratingBadgeText, { color: '#F59E0B' }]}>{testDriveStats.conversionRate}% conv.</Text>
                  </View>
                </View>
                <View style={styles.miniStatsRow}>
                  {[
                    { label: 'Total', value: testDriveStats.total, color: colors.text },
                    { label: 'Pending', value: testDriveStats.pending, color: '#F59E0B' },
                    { label: 'Confirmed', value: testDriveStats.confirmed, color: '#3B82F6' },
                    { label: 'Completed', value: testDriveStats.completed, color: '#10B981' },
                  ].map(s => (
                    <View key={s.label} style={styles.miniStat}>
                      <Text style={[styles.miniStatNum, { color: s.color }]}>{s.value}</Text>
                      <Text style={styles.miniStatLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>
                {testDriveStats.topVehicles.length > 0 && (
                  <>
                    <Text style={styles.subSectionTitle}>Most Requested</Text>
                    {testDriveStats.topVehicles.map((v: any, i: number) => (
                      <View key={v.vehicle}>
                        <HorizontalBar
                          label={v.vehicle}
                          value={v.count}
                          maxValue={testDriveStats.topVehicles[0]?.count ?? 1}
                          color={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      </View>
                    ))}
                  </>
                )}
              </View>
            )}
          </>
        )}

        {/* STOCK TAB */}
        {activeTab === 'stock' && (
          <>
            {stockEngagement && (
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <Ionicons name="eye" size={18} color="#10B981" />
                  <Text style={styles.chartTitle}>Stock Engagement</Text>
                </View>
                <View style={styles.miniStatsRow}>
                  {[
                    { label: 'Views', value: stockEngagement.views, color: '#10B981' },
                    { label: 'Shares', value: stockEngagement.shares, color: '#3B82F6' },
                    { label: 'Visits', value: stockEngagement.visits, color: '#8B5CF6' },
                  ].map(s => (
                    <View key={s.label} style={styles.miniStat}>
                      <Text style={[styles.miniStatNum, { color: s.color }]}>{s.value}</Text>
                      <Text style={styles.miniStatLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>
                {stockEngagement.topItems.length > 0 && (
                  <>
                    <Text style={styles.subSectionTitle}>Top Vehicles</Text>
                    {stockEngagement.topItems.map((item: any, i: number) => (
                      <View key={`${item.itemId ?? item.itemName}-${i}`}>
                        <HorizontalBar
                          label={item.itemName}
                          value={item.views + item.shares + item.visits}
                          maxValue={Math.max(...stockEngagement.topItems.map((x: any) => x.views + x.shares + x.visits), 1)}
                          color={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      </View>
                    ))}
                  </>
                )}
              </View>
            )}

            {stockBreakdown && (
              <>
                <View style={styles.chartCard}>
                  <View style={styles.chartHeader}>
                    <Ionicons name="cube" size={18} color="#8B5CF6" />
                    <Text style={styles.chartTitle}>Stock by Status</Text>
                  </View>
                  {stockBreakdown.byStatus.map((s: any, i: number) => (
                    <View key={s.status}>
                      <HorizontalBar
                        label={s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                        value={s.count}
                        maxValue={Math.max(...stockBreakdown.byStatus.map((x: any) => x.count), 1)}
                        color={s.status === 'available' ? '#10B981' : s.status === 'sold' ? '#EF4444' : s.status === 'reserved' ? '#F59E0B' : '#8B5CF6'}
                      />
                    </View>
                  ))}
                </View>

                <View style={styles.chartCard}>
                  <View style={styles.chartHeader}>
                    <Ionicons name="car-sport" size={18} color="#00AAD2" />
                    <Text style={styles.chartTitle}>Stock by Make</Text>
                  </View>
                  {stockBreakdown.byMake.map((m: any, i: number) => (
                    <View key={m.make}>
                      <HorizontalBar
                        label={m.make}
                        value={m.count}
                        maxValue={Math.max(...stockBreakdown.byMake.map((x: any) => x.count), 1)}
                        color={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    </View>
                  ))}
                </View>

                <View style={styles.chartCard}>
                  <View style={styles.chartHeader}>
                    <Ionicons name="layers" size={18} color="#EC4899" />
                    <Text style={styles.chartTitle}>Stock by Category</Text>
                  </View>
                  {stockBreakdown.byCategory.map((c: any, i: number) => (
                    <View key={c.category}>
                      <HorizontalBar
                        label={c.category}
                        value={c.count}
                        maxValue={Math.max(...stockBreakdown.byCategory.map((x: any) => x.count), 1)}
                        color={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* TOKENS TAB */}
        {activeTab === 'tokens' && (
          <>
            <View style={styles.tokenHero}>
              <View style={styles.tokenIcon}>
                <Ionicons name="diamond" size={32} color="#00AAD2" />
              </View>
              <Text style={styles.tokenBalance}>{displayStats.totalTokensCirculating.toLocaleString()}</Text>
              <Text style={styles.tokenLabel}>Total Tokens Circulating</Text>
              <Text style={styles.tokenSub}>HMT + KMT across all user wallets</Text>
            </View>

            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Ionicons name="trending-up" size={18} color="#06B6D4" />
                <Text style={styles.chartTitle}>Token Accumulation</Text>
              </View>
              <Text style={styles.chartSubtitle}>Weekly earned vs redeemed</Text>
              <BarChart
                data={tokenTrend.map((t: any) => ({ label: t.label, value: t.totalEarned, secondary: t.totalRedeemed }))}
                color="#06B6D4"
              />
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#06B6D4' }]} />
                  <Text style={styles.legendText}>Earned</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.legendText}>Redeemed</Text>
                </View>
              </View>
            </View>

            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Ionicons name="people" size={18} color="#8B5CF6" />
                <Text style={styles.chartTitle}>Active Wallets</Text>
              </View>
              <BarChart
                data={tokenTrend.map((t: any) => ({ label: t.label, value: t.activeWallets }))}
                color="#8B5CF6"
                height={120}
              />
            </View>

            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Ionicons name="information-circle" size={18} color={colors.textSecondary} />
                <Text style={styles.chartTitle}>Hedera Network</Text>
              </View>
              <View style={styles.hederaInfo}>
                <View style={styles.hederaRow}>
                  <Text style={styles.hederaLabel}>Network</Text>
                  <Text style={styles.hederaValue}>Hedera Hashgraph (HBAR)</Text>
                </View>
                <View style={styles.hederaRow}>
                  <Text style={styles.hederaLabel}>Token Types</Text>
                  <Text style={styles.hederaValue}>HMT (Hyundai) + KMT (Kia)</Text>
                </View>
                <View style={styles.hederaRow}>
                  <Text style={styles.hederaLabel}>Earn Rate</Text>
                  <Text style={styles.hederaValue}>1 token/km driven</Text>
                </View>
                <View style={styles.hederaRow}>
                  <Text style={styles.hederaLabel}>Eco Bonus</Text>
                  <Text style={styles.hederaValue}>1.5x for efficient driving</Text>
                </View>
                <View style={styles.hederaRow}>
                  <Text style={styles.hederaLabel}>Transaction Cost</Text>
                  <Text style={styles.hederaValue}>$0.001 per transaction</Text>
                </View>
                <View style={styles.hederaRow}>
                  <Text style={styles.hederaLabel}>Carbon Status</Text>
                  <Text style={[styles.hederaValue, { color: '#10B981' }]}>Carbon Negative</Text>
                </View>
              </View>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function TechIllustration() {
  return (
    <View style={styles.techIllustration}>
      <View style={styles.techRingOuter}>
        <View style={styles.techRingInner}>
          <Ionicons name="car-sport" size={30} color={colors.primary} />
        </View>
      </View>
      <View style={styles.techDashRow}>
        <View style={styles.techDashBar} />
        <View style={[styles.techDashBar, { width: '48%' }]} />
        <View style={[styles.techDashBar, { width: '28%' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
  },
  iconButton: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.md },
  headerEyebrow: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.white, marginTop: 2 },
  headerIcon: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: colors.textSecondary },
  heroStrip: { flexDirection: 'row', gap: 8, marginHorizontal: spacing.lg, marginTop: spacing.lg },
  heroStat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight },
  heroStatValue: { fontSize: 18, fontWeight: '900', color: colors.text },
  heroStatLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, marginTop: 2 },
  premiumHero: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  premiumHeroTextWrap: { flex: 1, gap: 10 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.primary + '12' },
  heroPulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  heroBadgeText: { fontSize: 11, fontWeight: '900', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  premiumHeroTitle: { fontSize: 22, fontWeight: '900', color: colors.text, lineHeight: 28 },
  premiumHeroSub: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  heroMetricRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  heroMetricPill: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.borderLight },
  heroMetricValue: { fontSize: 18, fontWeight: '900', color: colors.text },
  heroMetricLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
  techIllustration: { width: 122, alignItems: 'center', justifyContent: 'center' },
  techRingOuter: { width: 110, height: 110, borderRadius: 55, borderWidth: 1, borderColor: colors.primary + '30', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '08' },
  techRingInner: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center', justifyContent: 'center' },
  techDashRow: { width: '100%', marginTop: 12, gap: 6 },
  techDashBar: { height: 8, borderRadius: 8, backgroundColor: colors.primary + '22', width: '100%' },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    marginTop: spacing.md,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm },
  activeTab: { backgroundColor: colors.primary + '15' },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textLight },
  activeTabText: { color: colors.primary },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: spacing.lg,
  },
  kpiCard: {
    width: (SCREEN_WIDTH - 50) / 2,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  kpiIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  kpiLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  kpiSub: { fontSize: 11, color: colors.textLight, marginTop: 2 },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  chartTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  chartSubtitle: { fontSize: 11, color: colors.textLight, marginBottom: 12 },
  ratingBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  ratingBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  reviewScopeNote: { fontSize: 11, color: colors.textSecondary, marginBottom: 10 },
  reviewLinkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  reviewLinkText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.lg,
  },
  statusCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statusNum: { fontSize: 20, fontWeight: '800' },
  statusLabel: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  miniStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  miniStat: { flex: 1, alignItems: 'center' },
  miniStatNum: { fontSize: 18, fontWeight: '800' },
  miniStatLabel: { fontSize: 10, color: colors.textSecondary },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
    marginBottom: 8,
  },
  topPostRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderLight },
  topPostRank: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '12' },
  topPostRankText: { color: colors.primary, fontWeight: '900', fontSize: 12 },
  topPostTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  topPostMeta: { fontSize: 11, color: colors.textLight, marginTop: 2, fontWeight: '600' },
  topPostStats: { alignItems: 'flex-end' },
  topPostStat: { fontSize: 11, color: colors.textSecondary, fontWeight: '700' },
  tokenHero: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: 24,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  tokenIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  tokenBalance: { fontSize: 36, fontWeight: '900', color: colors.white },
  tokenLabel: { fontSize: 14, fontWeight: '600', color: colors.primaryLight, marginTop: 4 },
  tokenSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 8, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.textSecondary },
  hederaInfo: { marginTop: 8 },
  hederaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  hederaLabel: { fontSize: 13, color: colors.textSecondary },
  hederaValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  emptyText: { fontSize: 13, color: colors.textLight, textAlign: 'center', paddingVertical: 20 },
  emptyStateCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  emptyStateIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '15',
    marginTop: 2,
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  emptyStateText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  performanceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.borderLight },
  performanceRank: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center' },
  performanceRankText: { fontSize: 12, fontWeight: '900', color: colors.primary },
  performanceName: { fontSize: 14, fontWeight: '800', color: colors.text },
  performanceMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  performancePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  performancePill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight },
  performancePillText: { fontSize: 10, fontWeight: '800', color: colors.textSecondary },
  performanceScoreCol: { alignItems: 'flex-end', minWidth: 48 },
  performanceScore: { fontSize: 18, fontWeight: '900', color: colors.text },
  performanceState: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginTop: 2 },
});

// ============================================
// STAR DISTRIBUTION
// ============================================
