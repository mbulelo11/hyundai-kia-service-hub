import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, Linking, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import UserAvatar from '../lib/UserAvatar';
import { trackAnalyticsEvent } from '../lib/analytics';

function goBackOrHome(navigation: any, fallbackRoute = 'StaffMain') {
  if (navigation?.canGoBack?.()) {
    navigation.goBack();
  } else {
    navigation.navigate(fallbackRoute);
  }
}

const OWNER_PHONE = '27615276436';

const STAFF_MENU_ITEMS = [
  { key: 'feed', label: 'Feed', icon: 'newspaper-outline', route: 'ActivityFeed' },
  { key: 'inbox', label: 'Inbox', icon: 'mail-outline', route: 'StaffMessages' },
  { key: 'customers', label: 'Customers', icon: 'people-outline', route: 'CustomerManagement' },
  { key: 'users', label: 'Users', icon: 'people-outline', route: 'Users' },
  { key: 'financeApplications', label: 'Finance Applications', icon: 'document-text-outline', route: 'FinanceApplications' },
  { key: 'service', label: 'Service', icon: 'calendar-outline', route: 'StaffInbox' },
  { key: 'testDrive', label: 'Test Drive', icon: 'car-sport-outline', route: 'StaffTestDriveBookings' },
  { key: 'merchandiseOrders', label: 'Merch Orders', icon: 'receipt-outline', route: 'MerchandiseOrders' },
  { key: 'enquiries', label: 'Enquiries', icon: 'chatbubble-ellipses-outline', route: 'ActivityFeed' },
  { key: 'analytics', label: 'Analytics', icon: 'stats-chart-outline', route: 'StaffAnalytics' },
  { key: 'profile', label: 'Profile', icon: 'person-circle-outline', route: 'ProfileEdit' },
  { key: 'alerts', label: 'Alerts', icon: 'notifications-outline', route: 'Notifications' },
];

// Enhanced activity type definitions including messages, bookings, enquiries
const ACTIVITY_ICONS: Record<string, { icon: string; color: string }> = {
  booking_created: { icon: 'calendar', color: '#2196F3' },
  booking_updated: { icon: 'calendar-outline', color: '#2196F3' },
  booking_confirmed: { icon: 'checkmark-circle', color: '#4CAF50' },
  booking_completed: { icon: 'checkmark-done-circle', color: '#00897B' },
  parts_order_received: { icon: 'cube', color: '#3F51B5' },
  parts_order_confirmed: { icon: 'cube-outline', color: '#3F51B5' },
  parts_order_unavailable: { icon: 'alert-circle', color: '#F44336' },
  parts_order_scheduled: { icon: 'car-sport', color: '#009688' },
  parts_order_completed: { icon: 'checkmark-done-circle', color: '#00897B' },
  driver_schedule_completed: { icon: 'car-outline', color: '#009688' },
  review_submitted: { icon: 'star', color: '#FFC107' },
  review_response: { icon: 'chatbubble-ellipses', color: '#7C3AED' },
  message_received: { icon: 'chatbubble', color: '#9C27B0' },
  message: { icon: 'chatbubble', color: '#9C27B0' },
  customer_enquiry: { icon: 'help-circle', color: '#E91E63' },
  enquiry_submitted: { icon: 'help-circle', color: '#E91E63' },
  enquiry_updated: { icon: 'document-text', color: '#FF9800' },
  enquiry: { icon: 'document-text', color: '#FF9800' },
  finance_applied: { icon: 'document-text', color: '#795548' },
  finance_submitted: { icon: 'document-text', color: '#795548' },
  finance_update: { icon: 'document-text', color: '#795548' },
  finance_assigned: { icon: 'document-text', color: '#795548' },
  booking: { icon: 'calendar', color: '#2196F3' },
  customer_added: { icon: 'person-add', color: '#009688' },
  welcome_sent: { icon: 'hand-left', color: '#FF5722' },
  post_created: { icon: 'create-outline', color: '#1565C0' },
  post_updated: { icon: 'create-outline', color: '#1565C0' },
  post_reacted: { icon: 'heart', color: '#E91E63' },
  post_commented: { icon: 'chatbubble-ellipses', color: '#9C27B0' },
  post_shared: { icon: 'share-social', color: '#00ACC1' },
  post_view: { icon: 'eye', color: '#607D8B' },
  test_drive_requested: { icon: 'car-sport', color: '#3F51B5' },
  test_drive_confirmed: { icon: 'checkmark-circle', color: '#4CAF50' },
  test_drive_rejected: { icon: 'close-circle', color: '#F44336' },
  test_drive_completed: { icon: 'checkmark-done-circle', color: '#00897B' },
};

function getActivityCategory(type: string) {
  if (!type) return 'other';
  if (type.includes('booking')) return 'booking';
  if (type.includes('test_drive')) return 'testDrive';
  if (type.includes('parts_order') || type.includes('driver_schedule')) return 'service';
  if (type.includes('finance') || type.includes('enquiry')) return 'finance';
  if (type.includes('message')) return 'message';
  if (type.includes('post')) return 'social';
  if (type.includes('review')) return 'review';
  return type;
}

function formatTimeAgo(ts: number) {
  if (!ts) return 'Unknown';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ActivityFeedScreen({ navigation }: any) {
  const me = useQuery(api.users.me);
  const staffMenuRef = useRef<any>(null);
  const scrollStaffMenu = (direction: 'left' | 'right') => {
    if (!staffMenuRef.current) return;
    if (direction === 'left') {
      staffMenuRef.current.scrollTo({ x: 0, animated: true });
    } else {
      staffMenuRef.current.scrollToEnd({ animated: true });
    }
  };
  const isAdmin = Boolean(
    me?.isOwner ||
    String(me?.email ?? '').toLowerCase() === 'vincentmm@hyundai.co.za' ||
    String(me?.role ?? '').toLowerCase() === 'admin' ||
    me?.staffRole === 'dp' ||
    me?.accessLevel === 'full_access'
  );

  const moderatorTimeline = useQuery(api.activityLog.getComprehensiveTimeline, isAdmin ? { limit: 500 } : 'skip') ?? [];
  const dashboardStats = useQuery(api.analytics.getDashboardStats);
  const postEngagementStats = useQuery(api.analytics.getPostEngagementStats) ?? null;
  const [filterType, setFilterType] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);

  const mergedTimeline = [...moderatorTimeline].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const heroStats = useMemo(() => {
    const socialActivity =
      (postEngagementStats?.totalPosts ?? 0) +
      (postEngagementStats?.totalLikes ?? 0) +
      (postEngagementStats?.totalComments ?? 0) +
      (postEngagementStats?.totalViews ?? 0);
    const bookings = dashboardStats?.totalBookings ?? 0;
    const messages = dashboardStats?.totalMessages ?? 0;
    const leads = dashboardStats?.totalFinanceApps ?? 0;
    const events = socialActivity + bookings + messages + leads + (dashboardStats?.totalTestDrives ?? 0) + (dashboardStats?.totalReviews ?? 0);
    return [
      { label: 'Events', value: events, icon: 'pulse-outline', tint: colors.primary },
      { label: 'Bookings', value: bookings, icon: 'calendar-outline', tint: colors.statusConfirmed },
      { label: 'Messages', value: messages, icon: 'chatbubbles-outline', tint: colors.success },
      { label: 'Leads', value: leads, icon: 'briefcase-outline', tint: colors.warning },
    ];
  }, [dashboardStats, postEngagementStats]);

  const filtered = useMemo(() => {
    if (!filterType) return mergedTimeline;
    return mergedTimeline.filter((a: any) => getActivityCategory(a.type) === filterType);
  }, [mergedTimeline, filterType]);

  const FILTER_OPTIONS = [
    { key: null, label: 'All', icon: 'grid' },
    { key: 'booking', label: 'Bookings', icon: 'calendar' },
    { key: 'testDrive', label: 'Test Drives', icon: 'car-sport' },
    { key: 'finance', label: 'Finance', icon: 'document-text' },
    { key: 'message', label: 'Messages', icon: 'chatbubble' },
    { key: 'social', label: 'Social', icon: 'heart' },
  ];

  const getActivityMeta = (item: any) => {
    try {
      return item.metadata ? JSON.parse(item.metadata) : {};
    } catch {
      return {};
    }
  };

  const openActivityTarget = () => {
    if (!selectedActivity) return;
    const meta = getActivityMeta(selectedActivity);
    const category = getActivityCategory(selectedActivity.type);
    void trackAnalyticsEvent('activity_open', {
      activity_type: selectedActivity.type,
      activity_title: selectedActivity.title,
      category,
      route: 'ActivityFeedScreen',
      open_type: 'full_thread',
    });

    if (meta.bookingId) {
      navigation.navigate('BookingDetail', { bookingId: meta.bookingId });
      return;
    }
    if (meta.testDriveId) {
      navigation.navigate('StaffTestDriveBookings');
      return;
    }
    if (meta.financeApplicationId) {
      navigation.navigate('FinanceApplicationDetail', { application: selectedActivity, isStaff: true });
      return;
    }
    if (meta.partsOrderId || category === 'service' || String(selectedActivity.type).includes('parts_order')) {
      navigation.navigate('PartsOrders');
      return;
    }
    if (meta.scheduleId || meta.driverScheduleId || String(selectedActivity.type).includes('driver_schedule')) {
      navigation.navigate('DriverSchedules');
      return;
    }
    if (meta.reviewId || category === 'review') {
      navigation.navigate('Review');
      return;
    }
    if (meta.postId || category === 'social') {
      navigation.navigate('SocialFeed');
      return;
    }
    if (selectedActivity.customerUserId) {
      navigation.navigate('CustomerProfile', { userId: selectedActivity.customerUserId });
    }
  };

  const handleCallCustomer = (phone: string | undefined) => {
    if (!phone) {
      Alert.alert('No phone number available');
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Unable to make call');
    });
  };

  const handleEmailCustomer = (email: string | undefined) => {
    if (!email) {
      Alert.alert('No email available');
      return;
    }
    Linking.openURL(`mailto:${email}`).catch(() => {
      Alert.alert('Unable to open email');
    });
  };

  const openCustomer = () => {
    if (!selectedActivity?.customerUserId) return;
    navigation.navigate('CustomerProfile', { userId: selectedActivity.customerUserId });
  };

  const renderActivity = ({ item }: any) => {
    const config = ACTIVITY_ICONS[item.type] || { icon: 'ellipse', color: colors.textLight };
    const time = formatTimeAgo(item.timestamp || item._creationTime);

    return (
      <TouchableOpacity
        style={styles.activityCard}
        onPress={() => {
          void trackAnalyticsEvent('activity_open', {
            activity_type: item.type,
            activity_title: item.title,
            route: 'ActivityFeedScreen',
            open_type: 'card',
          });
          setSelectedActivity(item);
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.activityIcon, { backgroundColor: config.color + '15' }]}>
          <Ionicons name={config.icon as any} size={22} color={config.color} />
        </View>
        <View style={styles.activityContent}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityTitle}>{item.title}</Text>
            <Text style={styles.activityTime}>{time}</Text>
          </View>
          <Text style={styles.activityDesc} numberOfLines={3}>{item.description}</Text>
          {item.customerName && (
            <View style={styles.activityMeta}>
              <UserAvatar uri={item.customerAvatar} name={item.customerName} size={18} backgroundColor={colors.primary + '12'} textColor={colors.primary} />
              <Text style={styles.activityMetaText}>{item.customerName}</Text>
              {item.customerPhone && (
                <>
                  <Text style={styles.activityMetaDot}>•</Text>
                  <Text style={styles.activityMetaText}>{item.customerPhone}</Text>
                </>
              )}
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
      </TouchableOpacity>
    );
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.emptyAccessWrap}>
          <Ionicons name="lock-closed-outline" size={44} color={colors.primary} />
          <Text style={styles.emptyText}>Admin only</Text>
          <Text style={styles.emptySubtext}>The activity feed is only visible to the admin. Use Inbox for direct messages.</Text>
          <TouchableOpacity style={styles.backHomeBtn} onPress={() => goBackOrHome(navigation)}>
            <Text style={styles.backHomeText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            goBackOrHome(navigation);
          }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Activity feed</Text>
          <Text style={styles.headerSub}>{mergedTimeline?.length ?? 0} live events • admin only</Text>
        </View>
        <View style={styles.headerPulse}>
          <Ionicons name="radio-outline" size={14} color={colors.white} />
          <Text style={styles.headerPulseText}>Live</Text>
        </View>
      </View>

      <View style={styles.staffMenuScrollerWrap}>
        <TouchableOpacity style={styles.staffMenuScrollBtn} onPress={() => scrollStaffMenu('left')}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <ScrollView ref={staffMenuRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.staffMenuRow}>
          {STAFF_MENU_ITEMS.map((item) => (
            <TouchableOpacity key={item.key} style={styles.staffMenuChip} onPress={() => navigation.navigate(item.route)}>
              <Ionicons name={item.icon as any} size={14} color={colors.primary} />
              <Text style={styles.staffMenuChipText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.staffMenuScrollBtn} onPress={() => scrollStaffMenu('right')}>
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heroStatsRow}>
        {heroStats.map((stat: { label: string; value: number; icon: string; tint: string }) => (
          <View key={stat.label} style={styles.heroStatCard}>
            <View style={[styles.heroStatIcon, { backgroundColor: stat.tint + '18' }]}>
              <Ionicons name={stat.icon as any} size={14} color={stat.tint} />
            </View>
            <Text style={styles.heroStatValue}>{stat.value}</Text>
            <Text style={styles.heroStatLabel}>{stat.label}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.feedHero}>
        <View style={styles.feedHeroTop}>
          <View style={styles.feedHeroBadge}>
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <Text style={styles.feedHeroBadgeText}>Automotive pulse</Text>
          </View>
          <Text style={styles.feedHeroTitle}>Fast-moving updates, clearly surfaced.</Text>
          <Text style={styles.feedHeroSub}>A social-style logbook for bookings, messages, enquiries, and admin action.</Text>
        </View>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        {FILTER_OPTIONS.map((f) => (
          <TouchableOpacity
            key={f.key ?? 'all'}
            style={[styles.filterChip, filterType === f.key && styles.filterChipActive]}
            onPress={() => setFilterType(f.key)}
          >
            <Ionicons name={f.icon as any} size={14} color={filterType === f.key ? '#fff' : colors.textSecondary} />
            <Text style={[styles.filterText, filterType === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Timeline List */}
      <FlatList
        data={filtered}
        keyExtractor={(item: any, idx: number) => item._id || `${item.type}-${idx}`}
        renderItem={renderActivity}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="pulse" size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>No activities yet</Text>
            <Text style={styles.emptySubtext}>All messages, bookings, enquiries, and activity will appear here</Text>
          </View>
        }
      />

      {/* Customer Detail Modal */}
      <Modal
        visible={!!selectedActivity}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedActivity(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelectedActivity(null)}>
              <Ionicons name="close" size={28} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Activity Details</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {selectedActivity && (
              <>
                {/* Activity Icon & Title */}
                <View style={styles.detailSection}>
                  <View style={styles.detailIconContainer}>
                    {(() => {
                      const config = ACTIVITY_ICONS[selectedActivity.type] || { icon: 'ellipse', color: colors.textLight };
                      return (
                        <View style={[styles.detailIcon, { backgroundColor: config.color }]}>
                          <Ionicons name={config.icon as any} size={32} color="#fff" />
                        </View>
                      );
                    })()}
                  </View>
                  <Text style={styles.detailTitle}>{selectedActivity.title}</Text>
                  <Text style={styles.detailTime}>
                    {formatTimeAgo(selectedActivity.timestamp)}
                  </Text>
                </View>

                {selectedActivity.customerName && (
                  <View style={styles.customerCard}>
                    <Text style={styles.sectionLabel}>Customer Information</Text>
                    <View style={styles.infoRow}>
                      <Ionicons name="person" size={20} color={colors.primary} />
                      <Text style={styles.infoText}>{selectedActivity.customerName}</Text>
                    </View>
                    {selectedActivity.customerPhone && (
                      <TouchableOpacity
                        style={styles.infoRow}
                        onPress={() => handleCallCustomer(selectedActivity.customerPhone)}
                      >
                        <Ionicons name="call" size={20} color="#4CAF50" />
                        <Text style={[styles.infoText, { color: colors.primary }]}>{selectedActivity.customerPhone}</Text>
                      </TouchableOpacity>
                    )}
                    {selectedActivity.customerEmail && (
                      <TouchableOpacity
                        style={styles.infoRow}
                        onPress={() => handleEmailCustomer(selectedActivity.customerEmail)}
                      >
                        <Ionicons name="mail" size={20} color="#2196F3" />
                        <Text style={[styles.infoText, { color: colors.primary }]}>{selectedActivity.customerEmail}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.customerProfileBtn} onPress={openCustomer}>
                      <Ionicons name="person-circle-outline" size={16} color={colors.white} />
                      <Text style={styles.customerProfileBtnText}>Open customer profile</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.detailCard}>
                  <Text style={styles.sectionLabel}>Details</Text>
                  <Text style={styles.detailDescription}>{selectedActivity.description}</Text>
                  {selectedActivity.status && (
                    <View style={[styles.statusBadge, { backgroundColor: colors.surface }]}>
                      <Text style={styles.statusText}>Status: {selectedActivity.status}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.actionButtons}>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={openActivityTarget}>
                    <Ionicons name="open-outline" size={20} color="#fff" />
                    <Text style={styles.actionBtnText}>Open full thread</Text>
                  </TouchableOpacity>
                  {selectedActivity.customerPhone && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#4CAF50' }]}
                      onPress={() => handleCallCustomer(selectedActivity.customerPhone)}
                    >
                      <Ionicons name="call" size={20} color="#fff" />
                      <Text style={styles.actionBtnText}>Call Customer</Text>
                    </TouchableOpacity>
                  )}
                  {selectedActivity.customerEmail && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#2196F3' }]}
                      onPress={() => handleEmailCustomer(selectedActivity.customerEmail)}
                    >
                      <Ionicons name="mail" size={20} color="#fff" />
                      <Text style={styles.actionBtnText}>Email Customer</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.background + 'E6', borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  headerTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  headerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  headerPulse: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.full },
  headerPulseText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  staffMenuRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  staffMenuScrollerWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  staffMenuScrollBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  staffMenuChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, marginRight: 8 },
  staffMenuChipText: { fontSize: 12, fontWeight: '800', color: colors.text },
  heroStatsRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  heroStatCard: { width: 108, backgroundColor: colors.surface, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: colors.borderLight },
  heroStatIcon: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  heroStatValue: { fontSize: 20, fontWeight: '900', color: colors.text },
  heroStatLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '800', textTransform: 'uppercase' },
  feedHero: { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.surface, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: colors.borderLight, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  feedHeroTop: { gap: 8 },
  feedHeroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.primary + '14', borderRadius: radius.full },
  feedHeroBadgeText: { fontSize: 11, fontWeight: '900', color: colors.primary },
  feedHeroTitle: { fontSize: 20, fontWeight: '900', color: colors.text, lineHeight: 26 },
  feedHeroSub: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, fontWeight: '500' },
  filterRow: { maxHeight: 52, backgroundColor: 'transparent' },
  filterRowContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: colors.surface, marginHorizontal: 0, marginVertical: 0,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  filterTextActive: { color: '#fff' },
  list: { padding: spacing.lg, paddingTop: 4, gap: 10 },
  activityCard: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 22,
    padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.borderLight,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  activityIcon: {
    width: 44, height: 44, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
  },
  activityContent: { flex: 1 },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  activityTitle: { fontSize: 15, fontWeight: '800', color: colors.text, flex: 1 },
  activityTime: { fontSize: 11, color: colors.textLight, marginLeft: 8, fontWeight: '700' },
  activityDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 6, fontWeight: '500' },
  activityMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  activityMetaText: { fontSize: 12, color: colors.textLight },
  activityMetaDot: { fontSize: 12, color: colors.textLight },
  empty: { alignItems: 'center', padding: spacing.xxl, marginTop: 60 },
  emptyText: { fontSize: 18, fontWeight: '800', color: colors.textSecondary, marginTop: spacing.lg },
  emptySubtext: { fontSize: 14, color: colors.textLight, textAlign: 'center', marginTop: spacing.sm, fontWeight: '500' },
  emptyAccessWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  backHomeBtn: { marginTop: spacing.md, backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.full },
  backHomeText: { color: colors.white, fontWeight: '800' },

  // Modal styles
  modalContainer: { flex: 1, backgroundColor: colors.background + 'E6' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface + 'E6', borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  modalTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  modalContent: { flex: 1, padding: spacing.lg },
  detailSection: { alignItems: 'center', marginBottom: spacing.lg },
  detailIconContainer: { marginBottom: spacing.md },
  detailIcon: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  detailTitle: { fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'center' },
  detailTime: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs, fontWeight: '600' },
  customerCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.borderLight },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, marginBottom: spacing.md, textTransform: 'uppercase' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  infoText: { fontSize: 15, color: colors.text, fontWeight: '600', flex: 1 },
  detailCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.borderLight },
  detailDescription: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md, fontWeight: '500' },
  statusBadge: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  statusText: { fontSize: 12, fontWeight: '700', color: colors.text },
  actionButtons: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, borderRadius: radius.lg, gap: spacing.sm },
  actionBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  customerProfileBtn: { marginTop: spacing.sm, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full },
  customerProfileBtnText: { color: colors.white, fontSize: 12, fontWeight: '800' },
});