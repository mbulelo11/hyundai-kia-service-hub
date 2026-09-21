import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Easing,
  Pressable,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import UserAvatar from '../lib/UserAvatar';

function getRoleLabel(user: any) {
  switch (user?.staffRole || user?.role) {
    case 'dp':
    case 'dealership_principal':
      return 'Administrator';
    case 'sales':
    case 'sales_executive':
      return 'Sales Executive';
    case 'service_advisor':
      return 'Service Advisor';
    case 'service_manager':
      return 'Service Manager';
    case 'workshop_manager':
      return 'Workshop Manager';
    case 'parts_manager':
      return 'Parts Manager';
    case 'accessories_manager':
      return 'Accessories Manager';
    case 'merchandise_manager':
      return 'Merchandise Manager';
    case 'technician':
    case 'motor_technician':
      return 'Technician';
    case 'driver':
      return 'Driver';
    default:
      return 'Staff';
  }
}

function canAccessPartsMenu(user: any) {
  const role = String(user?.staffRole ?? user?.role ?? '').trim().toLowerCase();
  const department = String(user?.department ?? '').trim().toLowerCase();
  return Boolean(
    user?.isOwner ||
    user?.role === 'admin' ||
    user?.accessLevel === 'full_access' ||
    role === 'dp' ||
    role === 'regional' ||
    role === 'regional_manager' ||
    role === 'service_manager' ||
    role === 'parts_manager' ||
    role === 'parts_accessories_manager' ||
    department === 'parts' ||
    [
      'parts',
      'accessories',
      'parts_manager',
      'accessories_manager',
      'parts_accessories_manager',
      'parts_and_accessories_manager',
      'parts_accessory_manager',
      'parts_accessories',
      'parts_service',
      'service_parts',
    ].includes(role)
  );
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isModeratorUser(user: any) {
  const email = String(user?.email ?? '').trim().toLowerCase();
  return Boolean(
    user?.isOwner ||
    String(user?.role ?? '').trim().toLowerCase() === 'admin' ||
    email === 'vincentmm@hyundai.co.za' ||
    email === 'vincentmmm@hyundai.co.za' ||
    user?.staffRole === 'dp' ||
    user?.staffRole === 'regional' ||
    user?.staffRole === 'regional_manager' ||
    user?.accessLevel === 'full_access'
  );
}

export default function StaffDashboardScreen({ navigation }: any) {
  const user = useQuery(api.users.me);
  const allBookings = useQuery(api.bookings.listAllBookingsForStaffSimple) ?? [];
  const myBookings = useQuery(api.bookings.listForStaff) ?? [];
  const recentActivity = useQuery(api.activityLog.list, { limit: 3 }) ?? [];
  const unread = useQuery(api.notifications.getUnreadCount) ?? 0;
  const notificationsQuery = useQuery(api.notifications.listMine);
  const notifications = React.useMemo(() => notificationsQuery ?? [], [notificationsQuery]);
  const performanceBoard = useQuery(api.analytics.getPerformanceBoard, { limit: 6 }) ?? { staff: [], users: [] };
  const salesWalletSummary = useQuery(api.bookings.getSalesExecutiveWalletSummary) ?? null;
  const salesWalletBalance = Number(salesWalletSummary?.balance ?? 0);
  const acceptBooking = useMutation(api.bookings.acceptBooking);
  const [refreshing, setRefreshing] = React.useState(false);
  const [technicianQueueFilter, setTechnicianQueueFilter] = React.useState<'assigned' | 'waiting_for_parts' | 'in_progress' | 'ready_for_service_manager_sign_off'>('assigned');

  const role = String(user?.staffRole ?? user?.role ?? '').trim().toLowerCase();
  const isSales = ['sales', 'sales_executive', 'sales_manager'].includes(role);
  const isService = ['service_advisor', 'service_manager', 'workshop_manager'].includes(role);
  const isTechnician = ['technician', 'motor_technician', 'diagnostic_technician'].includes(role);
  const isAdmin = Boolean(
    user?.isOwner ||
    user?.role === 'admin' ||
    String(user?.email ?? '').toLowerCase() === 'vincentmm@hyundai.co.za' ||
    String(user?.email ?? '').toLowerCase() === 'vincentmmm@hyundai.co.za' ||
    user?.staffRole === 'dp' ||
    user?.staffRole === 'regional' ||
    user?.staffRole === 'regional_manager' ||
    user?.accessLevel === 'full_access'
  );

  const performanceRows = isSales ? performanceBoard.staff : isService ? performanceBoard.staff : performanceBoard.staff;
  const customerRows = performanceBoard.users;
  const technicianJobs = isTechnician
    ? myBookings.filter((b: any) => String(b.assignedTechnicianUserId ?? b.assignedTechnicianId ?? '') === String(user?._id))
    : [];
  const workshopJobs = isService || isTechnician ? myBookings : [];
  const technicianQueueBuckets = [
    {
      key: 'assigned',
      label: 'Assigned to me',
      items: workshopJobs.filter((b: any) => !b.technicianProgressStatus || b.technicianProgressStatus === 'assigned'),
    },
    {
      key: 'waiting_for_parts',
      label: 'Waiting for parts',
      items: workshopJobs.filter((b: any) => b.technicianProgressStatus === 'waiting_for_parts'),
    },
    {
      key: 'in_progress',
      label: 'In progress',
      items: workshopJobs.filter((b: any) => b.technicianProgressStatus === 'in_progress'),
    },
    {
      key: 'ready_for_service_manager_sign_off',
      label: 'Ready for service manager sign-off',
      items: workshopJobs.filter((b: any) => b.technicianProgressStatus === 'ready_for_service_manager_sign_off'),
    },
  ];
  const activeTechnicianQueueBucket = technicianQueueBuckets.find((bucket) => bucket.key === technicianQueueFilter) ?? technicianQueueBuckets[0];

  const todayStr = new Date().toISOString().split('T')[0];
  const todayBookings = myBookings.filter((b: any) => b.date === todayStr);
  const activeBookings = myBookings.filter((b: any) => b.status === 'confirmed' || b.status === 'in_progress');
  const unassignedBookings = allBookings.filter((b: any) => !b.assignedTo);

  const menuItems = [
    { key: 'staffMain', title: 'Staff Main', subtitle: 'Dashboard and overview', icon: 'grid-outline', color: colors.primary, onPress: () => navigation.navigate('StaffMain') },
    { key: 'tradeIn', title: 'Submitted Trade-Ins', subtitle: 'Review customer trade-ins and values', icon: 'swap-horizontal-outline', color: colors.primary, onPress: () => navigation.navigate('TradeInSubmissions') },
    { key: 'brochure', title: 'Brochure Upload', subtitle: 'Upload brochure for customers', icon: 'download-outline', color: colors.success, onPress: () => navigation.navigate('BrochureManager') },
    { key: 'staffProfile', title: 'Staff Profile', subtitle: 'Your staff profile', icon: 'person-circle-outline', color: colors.primaryLight, onPress: () => navigation.navigate('StaffProfile') },
    { key: 'messages', title: 'Messages', subtitle: 'Direct messages and chats', icon: 'chatbubble-ellipses-outline', color: colors.primaryLight, onPress: () => navigation.navigate('StaffMessages') },
    { key: 'notifications', title: 'Notifications', subtitle: 'Alerts and attention items', icon: 'notifications-outline', color: colors.success, onPress: () => navigation.navigate('Notifications') },
    { key: 'socialFeed', title: 'Social Feed', subtitle: 'Feed posts and moderation', icon: 'newspaper-outline', color: colors.primaryLight, onPress: () => navigation.navigate('SocialFeed') },
    { key: 'customerManagement', title: 'Customer Database', subtitle: 'Search customer records fast', icon: 'people-circle-outline', color: colors.primary, onPress: () => navigation.navigate('CustomerManagement') },
    { key: 'financeApplications', title: 'Finance Applications', subtitle: 'View submitted finance applications', icon: 'document-text-outline', color: colors.warning, onPress: () => navigation.navigate('FinanceApplications') },
    { key: 'inventory', title: 'Inventory', subtitle: 'Vehicle stock and details', icon: 'car-sport-outline', color: colors.primaryLight, onPress: () => navigation.navigate('InventoryScreen') },
    { key: 'partsOrders', title: 'Parts & Accessories', subtitle: 'Parts and accessory requests', icon: 'cube-outline', color: colors.primary, onPress: () => navigation.navigate('PartsOrders') },
    { key: 'serviceBookings', title: 'Service Bookings', subtitle: 'Track service appointments', icon: 'calendar-outline', color: colors.statusInProgress, onPress: () => navigation.navigate('StaffInbox') },
    { key: 'calendarNotes', title: 'Calendar & Notes', subtitle: 'Reminders and tasks', icon: 'calendar-number-outline', color: colors.primaryLight, onPress: () => navigation.navigate('Calendar') },
    { key: 'events', title: 'Events', subtitle: 'Live customer and staff events', icon: 'sparkles-outline', color: colors.warning, onPress: () => navigation.navigate('Events') },
    { key: 'groups', title: 'Groups', subtitle: 'Staff and customer group feeds', icon: 'people-outline', color: colors.success, onPress: () => navigation.navigate('Groups') },
    { key: 'socialDevelopment', title: 'Social Development Programmes', subtitle: 'Community initiatives and programmes', icon: 'leaf-outline', color: colors.primary, onPress: () => navigation.navigate('Initiatives') },
    { key: 'merchandise', title: 'Merchandise Upload', subtitle: 'Upload and manage Hyundai and Kia merchandise', icon: 'pricetag-outline', color: colors.warning, onPress: () => navigation.navigate('MerchandiseHub') },
    { key: 'testDriveBookings', title: 'Test Drive Bookings', subtitle: 'Manage test drive slots', icon: 'car-outline', color: colors.primary, onPress: () => navigation.navigate('StaffTestDriveBookings') },
    { key: 'enquiries', title: 'Enquiries', subtitle: 'Review new sales leads', icon: 'help-circle-outline', color: colors.statusPending, onPress: () => navigation.navigate('ActivityFeed') },
    { key: 'analytics', title: 'Analytics', subtitle: 'Activity and performance', icon: 'stats-chart-outline', color: colors.success, onPress: () => navigation.navigate('StaffAnalytics') },
    { key: 'users', title: 'Users', subtitle: 'Admin-only user records', icon: 'people-outline', color: colors.error, onPress: () => navigation.navigate('Users'), moderatorOnly: true },
  ];

  const menuItemsWithAccess = menuItems.filter((item) => !item.moderatorOnly || isAdmin).map((item) => ({
    ...item,
    enabled: true,
  }));

  const visibleMenuItems = menuItemsWithAccess;
  const quickCards = [
    { label: 'Due today', value: todayBookings.length, icon: 'calendar', color: colors.primary, onPress: () => navigation.navigate('StaffInbox') },
    { label: 'Active jobs', value: activeBookings.length, icon: 'checkmark-circle', color: colors.statusInProgress, onPress: () => navigation.navigate('StaffInbox') },
    { label: 'Unassigned', value: unassignedBookings.length, icon: 'inbox', color: colors.statusPending, onPress: () => navigation.navigate('StaffInbox') },
    { label: 'Sales Wallet', value: `R${salesWalletBalance.toFixed(2)}`, icon: 'wallet', color: colors.success, onPress: () => navigation.navigate('StaffWallet') },
  ];

  const socialPills = [
    { label: 'Live', value: unread > 0 ? `${unread} unread` : 'No unread', icon: 'pulse-outline', color: colors.success },
    { label: 'Workshop', value: `${activeBookings.length} active`, icon: 'construct-outline', color: colors.statusInProgress },
    { label: 'Stock', value: `${unassignedBookings.length} queued`, icon: 'car-sport-outline', color: colors.warning },
  ];

  const performanceSummary = isSales
    ? [
        { label: 'Leads', value: performanceRows.find((row: any) => row.userId === user?._id)?.customers ?? 0 },
        { label: 'Test drives', value: performanceRows.find((row: any) => row.userId === user?._id)?.testDrives ?? 0 },
        { label: 'Finance apps', value: performanceRows.find((row: any) => row.userId === user?._id)?.financeApps ?? 0 },
        { label: 'Customers', value: performanceRows.find((row: any) => row.userId === user?._id)?.customers ?? 0 },
      ]
    : isService
      ? [
          { label: 'Bookings', value: performanceRows.find((row: any) => row.userId === user?._id)?.bookings ?? 0 },
          { label: 'Completion rate', value: `${Math.round(((myBookings.filter((b: any) => b.status === 'completed').length || 0) / Math.max(myBookings.length, 1)) * 100)}%` },
          { label: 'Turnaround', value: `${Math.max(Math.round((myBookings.filter((b: any) => b.status === 'completed').length || 0) / Math.max(myBookings.length, 1) * 10), 0)}h` },
          { label: 'Active jobs', value: activeBookings.length },
        ]
      : isTechnician
        ? [
            { label: 'Assigned jobs', value: myBookings.length },
            { label: 'In progress', value: myBookings.filter((b: any) => b.technicianProgressStatus === 'in_progress' || b.status === 'in_progress').length },
            { label: 'Completed', value: myBookings.filter((b: any) => b.status === 'completed').length },
            { label: 'Notes added', value: myBookings.filter((b: any) => Boolean(b.technicianProgressNote)).length },
          ]
        : [
          { label: 'Top team score', value: performanceRows[0]?.score ?? 0 },
          { label: 'Tracked customers', value: customerRows.length },
          { label: 'Tracked staff', value: performanceRows.length },
          { label: 'Unread alerts', value: unread },
        ];

  const feedTabs = [
    { key: 'main_feed', label: 'Main feed', icon: 'document-text-outline', active: true, onPress: () => navigation.navigate('SocialFeed') },
    { key: 'events', label: 'Events', icon: 'calendar-outline', active: false, onPress: () => navigation.navigate('Events') },
    { key: 'social_dev', label: 'Social dev', icon: 'leaf-outline', active: false, onPress: () => navigation.navigate('SocialFeed') },
  ];

  const STAFF_MENU_KEYS = [
    { key: 'customers', label: 'Customers' },
    { key: 'staff', label: 'Staff' },
    { key: 'inbox', label: 'Inbox' },
    { key: 'finance_applications', label: 'Finance Applications' },
    { key: 'test_drives', label: 'Test Drives' },
    { key: 'service_bookings', label: 'Service Bookings' },
    { key: 'parts_orders', label: 'Parts Orders' },
    { key: 'accessory_orders', label: 'Accessory Orders' },
    { key: 'groups', label: 'Groups' },
    { key: 'social_development', label: 'Social Development Programmes' },
    { key: 'merchandise', label: 'Merchandise' },
    { key: 'activity_feed', label: 'Activity Feed' },
    { key: 'social_feed', label: 'Feed' },
    { key: 'users', label: 'Users' },
    { key: 'analytics', label: 'Analytics' },
  ];

  const attentionSources = React.useMemo(() => {
    const unreadNotifications = notifications.filter((notification: any) => !notification.isRead);
    const buckets = [
      {
        key: 'messages',
        label: 'Direct messages',
        icon: 'chatbubble-ellipses-outline',
        color: colors.primary,
        route: 'StaffMessages',
      },
      {
        key: 'bookings',
        label: 'Bookings',
        icon: 'calendar-outline',
        color: colors.statusPending,
        route: 'StaffInbox',
      },
      {
        key: 'finance',
        label: 'Finance',
        icon: 'document-text-outline',
        color: colors.primaryLight,
        route: 'FinanceApplications',
      },
      {
        key: 'feed',
        label: 'Feed',
        icon: 'newspaper-outline',
        color: colors.success,
        route: 'SocialFeed',
      },
    ];

    const classify = (notification: any) => {
      const type = String(notification?.type ?? '').toLowerCase();
      if (type === 'new_message') return 'messages';
      if (notification?.financeApplicationId || type.startsWith('finance') || notification?.targetRoute === 'FinanceApplicationDetail') return 'finance';
      if (notification?.targetRoute === 'BookingDetail' || notification?.targetRoute === 'StaffBookingDetail' || notification?.bookingId || type.startsWith('booking')) return 'bookings';
      if (notification?.targetRoute === 'SocialFeed' || notification?.postId) return 'feed';
      return 'other';
    };

    return buckets.map((bucket: { key: string; label: string; icon: string; color: string; route: string }) => ({
      ...bucket,
      count: unreadNotifications.filter((notification: any) => classify(notification) === bucket.key).length,
    }));
  }, [notifications]);

  const animatedValues = React.useRef(menuItems.map(() => new Animated.Value(0))).current;

  React.useEffect(() => {
    Animated.stagger(
      70,
      animatedValues.map((value: any) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        })
      )
    ).start();
  }, [animatedValues]);

  const handleAccept = async (bookingId: any) => {
    try {
      await acceptBooking({ bookingId });
      setRefreshing(true);
      setTimeout(() => setRefreshing(false), 500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setRefreshing(false);
  };

  const profileImage = user?.profileImage ?? user?.image ?? '';
  const initials = String(user?.displayName ?? user?.name ?? user?.email ?? 'S').trim().charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.heroContainer}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroIdentity}>
              <UserAvatar uri={profileImage} name={user?.displayName ?? user?.name ?? user?.email} size={52} borderRadius={18} />
              <View style={{ flex: 1 }}>
                <Text style={styles.heroWelcome}>Welcome back</Text>
                <Text style={styles.heroName}>{user?.name ?? 'Staff'}</Text>
                <Text style={styles.heroRole}>{getRoleLabel(user)}</Text>
              </View>
            </View>
            <View style={styles.heroBadgeWrap}>
              {unread > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{unread}</Text>
                </View>
              )}
              <View style={styles.roleChip}>
                <Ionicons name={isAdmin ? 'shield-checkmark' : 'person'} size={12} color={colors.white} />
                <Text style={styles.roleChipText}>{isAdmin ? 'Admin' : 'Staff'}</Text>
              </View>
            </View>
          </View>
          <View style={styles.heroActions}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heroActionsScroll}>
              <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('CustomerManagement')}>
                <Ionicons name="people-outline" size={16} color={colors.white} />
                <Text style={styles.heroActionText}>Customers</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('SalesWallet')}>
                <Ionicons name="wallet-outline" size={16} color={colors.white} />
                <Text style={styles.heroActionText}>Sales Wallet</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('MerchandiseHub')}>
                <Ionicons name="pricetag-outline" size={16} color={colors.white} />
                <Text style={styles.heroActionText}>Merchandise</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('Staff')}>
                <Ionicons name="briefcase-outline" size={16} color={colors.white} />
                <Text style={styles.heroActionText}>Staff</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('ProfileEdit')}>
                <Ionicons name="person-circle-outline" size={16} color={colors.white} />
                <Text style={styles.heroActionText}>Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('Notifications')}>
                <Ionicons name="notifications-outline" size={16} color={colors.white} />
                <Text style={styles.heroActionText}>Alerts</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('SocialFeed')}>
                <Ionicons name="newspaper-outline" size={16} color={colors.white} />
                <Text style={styles.heroActionText}>Feed</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('StaffMessages')}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.white} />
                <Text style={styles.heroActionText}>Inbox</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('FinanceApplications')}>
                <Ionicons name="document-text-outline" size={16} color={colors.white} />
                <Text style={styles.heroActionText}>Finance</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('TradeIn')}>
                <Ionicons name="swap-horizontal-outline" size={16} color={colors.white} />
                <Text style={styles.heroActionText}>Trade-In</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('BrochureManager')}>
                <Ionicons name="download-outline" size={16} color={colors.white} />
                <Text style={styles.heroActionText}>Brochure</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('StaffWallet')}>
                <Ionicons name="wallet-outline" size={16} color={colors.white} />
                <Text style={styles.heroActionText}>Staff Wallet</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
          <View style={styles.heroMetricsRow}>
            <View style={styles.heroMetricCard}>
              <Text style={styles.heroMetricValue}>{todayBookings.length}</Text>
              <Text style={styles.heroMetricLabel}>Today</Text>
            </View>
            <View style={styles.heroMetricCard}>
              <Text style={styles.heroMetricValue}>{activeBookings.length}</Text>
              <Text style={styles.heroMetricLabel}>Active</Text>
            </View>
            <View style={styles.heroMetricCard}>
              <Text style={styles.heroMetricValue}>{unassignedBookings.length}</Text>
              <Text style={styles.heroMetricLabel}>Waiting</Text>
            </View>
            <TouchableOpacity style={styles.heroMetricCard} onPress={() => navigation.navigate('StaffWallet')}>
              <Text style={styles.heroMetricValue}>R{salesWalletBalance.toFixed(0)}</Text>
              <Text style={styles.heroMetricLabel}>Wallet</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.socialPillRow}>
            {socialPills.map((pill) => (
              <View key={pill.label} style={styles.socialPillCard}>
                <View style={[styles.socialPillIcon, { backgroundColor: pill.color + '18' }]}>
                  <Ionicons name={pill.icon as any} size={14} color={pill.color} />
                </View>
                <View>
                  <Text style={styles.socialPillLabel}>{pill.label}</Text>
                  <Text style={styles.socialPillValue}>{pill.value}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.heroFootnote}>
            <Ionicons name="flash-outline" size={14} color={colors.primaryLight} />
            <Text style={styles.heroFootnoteText}>Tap a lane, jump straight in, keep the day moving.</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.quickSectionHeader}>
          <Text style={styles.sectionTitle}>Fast lanes</Text>
          <Text style={styles.sectionSub}>Open the tools your team uses most</Text>
        </View>
        <View style={styles.quickGrid}>
          {quickCards.map((card) => (
            <Pressable
              key={card.label}
              style={({ hovered, pressed }: any) => [
                styles.statCard,
                hovered && styles.statCardHovered,
                pressed && styles.statCardPressed,
              ]}
              onPress={card.onPress}
            >
              <View style={[styles.statIcon, { backgroundColor: card.color + '15' }]}>
                <Ionicons name={card.icon as any} size={18} color={card.color} />
              </View>
              <Text style={styles.statValue}>{card.value}</Text>
              <Text style={styles.statLabel}>{card.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Navigate</Text>
          <Text style={styles.sectionSub}>Tap a card to open the section</Text>
        </View>

        <View style={styles.menuGrid}>
          {visibleMenuItems.map((item, index) => {
            const animatedStyle = {
              opacity: animatedValues[index].interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
              transform: [
                {
                  translateY: animatedValues[index].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
                },
              ],
            };

            return (
              <Animated.View key={item.key} style={[styles.menuCardWrap, animatedStyle]}>
                <Pressable
                  style={({ hovered, pressed }: any) => [
                    styles.menuCard,
                    !item.enabled && styles.menuCardDisabled,
                    hovered && styles.menuCardHovered,
                    pressed && styles.menuCardPressed,
                  ]}
                  onPress={item.enabled ? item.onPress : undefined}
                >
                  <View style={[styles.menuItemIcon, { backgroundColor: item.enabled ? item.color + '18' : colors.borderLight }]}>
                    <Ionicons name={item.enabled ? (item.icon as any) : 'lock-closed-outline'} size={18} color={item.enabled ? item.color : colors.textLight} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemTitle}>{item.title}</Text>
                    <Text style={styles.menuItemSubtitle}>{item.enabled ? item.subtitle : 'Disabled by admin'}</Text>
                  </View>
                  <Ionicons name={item.enabled ? 'chevron-forward' : 'lock-closed-outline'} size={16} color={colors.textLight} />
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My performance</Text>
            <Text style={styles.sectionSub}>{isSales ? 'Sales activity' : isService ? 'Service activity' : isTechnician ? 'Technician activity' : 'Team activity'}</Text>
          </View>
          <View style={styles.performanceGrid}>
            {performanceSummary.map((item) => (
              <View key={item.label} style={styles.performanceCard}>
                <Text style={styles.performanceValue}>{item.value}</Text>
                <Text style={styles.performanceLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.leaderboardCard}>
            <Text style={styles.leaderboardTitle}>{isTechnician ? 'My technician queue' : 'Top staff'}</Text>
            {(isTechnician ? technicianJobs : performanceRows).slice(0, 4).map((row: any, index: number) => (
              <View key={row.userId ?? row._id} style={styles.leaderboardRow}>
                <Text style={styles.leaderboardRank}>#{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaderboardName}>{row.name ?? row.customerName ?? 'Item'}</Text>
                  <Text style={styles.leaderboardMeta}>{isTechnician ? `${row.serviceType} · ${row.status}` : `${row.role} · ${row.dealershipName ?? 'No dealership'}`}</Text>
                </View>
                <Text style={styles.leaderboardScore}>{isTechnician ? (row.technicianProgressStatus ?? row.status) : row.score}</Text>
              </View>
            ))}
          </View>

          {(isTechnician || isService) && (
            <View style={styles.leaderboardCard}>
              <Text style={styles.leaderboardTitle}>Workshop queue</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.queuePillRow}>
                {technicianQueueBuckets.map((bucket) => {
                  const isActive = technicianQueueFilter === bucket.key;
                  return (
                    <TouchableOpacity
                      key={bucket.key}
                      style={[styles.queuePill, isActive && styles.queuePillActive]}
                      onPress={() => setTechnicianQueueFilter(bucket.key as any)}
                    >
                      <Text style={[styles.queuePillText, isActive && styles.queuePillTextActive]}>{bucket.label}</Text>
                      <Text style={[styles.queuePillCount, isActive && styles.queuePillTextActive]}>{bucket.items.length}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {activeTechnicianQueueBucket.items.slice(0, 6).map((booking: any) => (
                <View key={booking._id} style={styles.leaderboardRow}>
                  <Text style={styles.leaderboardRank}>#</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.leaderboardName}>{booking.customerName ?? 'Customer'}</Text>
                    <Text style={styles.leaderboardMeta}>{booking.serviceType} · {String(booking.technicianProgressStatus ?? booking.status ?? 'assigned').replace(/_/g, ' ')}</Text>
                  </View>
                  <Text style={styles.leaderboardScore}>{booking.timeSlot}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.leaderboardCard}>
            <Text style={styles.leaderboardTitle}>Top customers</Text>
            {customerRows.slice(0, 4).map((row: any, index: number) => (
              <View key={row.userId} style={styles.leaderboardRow}>
                <Text style={styles.leaderboardRank}>#{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaderboardName}>{row.name}</Text>
                  <Text style={styles.leaderboardMeta}>Assigned to {row.assignedStaffName ?? 'Staff'} · {row.messages} messages</Text>
                </View>
                <Text style={styles.leaderboardScore}>{row.score}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Where attention goes</Text>
          <Text style={styles.sectionSub}>Tap a card to open the section</Text>
        </View>

        <View style={styles.attentionGrid}>
          {attentionSources.map((source: { key: string; label: string; icon: string; color: string; route: string; count: number }) => (
            <TouchableOpacity
              key={source.key}
              style={styles.attentionCard}
              onPress={() => navigation.navigate(source.route)}
              activeOpacity={0.85}
            >
              <View style={[styles.attentionIconWrap, { backgroundColor: source.color + '14' }]}>
                <Ionicons name={source.icon as any} size={18} color={source.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.attentionLabel}>{source.label}</Text>
                <Text style={styles.attentionCount}>{source.count} unread</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {isAdmin && unassignedBookings.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Incoming Bookings</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{unassignedBookings.length}</Text>
              </View>
            </View>

            {unassignedBookings.slice(0, 4).map((booking: any) => (
              <TouchableOpacity
                key={booking._id}
                style={styles.bookingCard}
                onPress={() => navigation.navigate('StaffBookingDetail', { bookingId: booking._id })}
                activeOpacity={0.7}
              >
                <View style={styles.bookingAccent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bookingName}>{booking.customerName ?? 'Customer'}</Text>
                  <Text style={styles.bookingService}>{booking.serviceType}</Text>
                  <View style={styles.bookingMeta}>
                    <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.bookingMetaText}>{booking.date}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(booking._id)}>
                  <Ionicons name="checkmark" size={18} color={colors.white} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {recentActivity.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
            </View>

            {recentActivity.slice(0, 3).map((item: any) => (
              <View key={item._id} style={styles.activityItem}>
                <View style={[styles.activityIcon, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name={(item.icon ?? 'pulse-outline') as any} size={14} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityTitle}>{item.title}</Text>
                  <Text style={styles.activityDesc} numberOfLines={1}>{item.description}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  heroContainer: { backgroundColor: colors.primary },
  heroCard: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 18,
    backgroundColor: '#0E2F62',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  heroIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroAvatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroAvatarImage: { width: '100%', height: '100%' },
  heroAvatarText: { fontSize: 18, fontWeight: '900', color: colors.white },
  heroWelcome: { fontSize: 12, fontWeight: '800', color: colors.primaryLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroName: { fontSize: 26, fontWeight: '900', color: colors.white, marginTop: 2 },
  heroRole: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4, fontWeight: '600' },
  heroBadgeWrap: { alignItems: 'flex-end', gap: 8 },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.14)' },
  roleChipText: { fontSize: 11, fontWeight: '800', color: colors.white },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  heroActionsScroll: { gap: 8, marginTop: spacing.md, paddingRight: spacing.lg },
  heroActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.14)' },
  heroActionText: { fontSize: 11, fontWeight: '800', color: colors.white },
  heroMetricsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  heroMetricCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: radius.lg, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  heroMetricValue: { fontSize: 18, fontWeight: '900', color: colors.white },
  heroMetricLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.74)', marginTop: 2 },
  unreadBadge: { minWidth: 44, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.full, alignItems: 'center' },
  unreadText: { fontSize: 16, fontWeight: '800', color: colors.white },
  socialPillRow: { gap: spacing.sm, marginTop: spacing.md, paddingRight: spacing.sm },
  socialPillCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginRight: 8 },
  socialPillIcon: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  socialPillLabel: { fontSize: 10, fontWeight: '800', color: colors.primaryLight, textTransform: 'uppercase', letterSpacing: 0.4 },
  socialPillValue: { fontSize: 12, fontWeight: '700', color: colors.white, marginTop: 1 },
  heroFootnote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  heroFootnoteText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  quickSectionHeader: { marginTop: spacing.lg, marginBottom: spacing.sm },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 0 },
  statCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  statCardHovered: { transform: [{ translateY: -2 }], shadowOpacity: 0.12 },
  statCardPressed: { transform: [{ scale: 0.985 }] },
  statIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 22, fontWeight: '900', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontWeight: '700' },
  sectionHeaderRow: { marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  performanceGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  performanceCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  performanceValue: { fontSize: 20, fontWeight: '900', color: colors.text },
  performanceLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 4, fontWeight: '700' },
  leaderboardCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, marginTop: spacing.md },
  leaderboardTitle: { fontSize: 14, fontWeight: '900', color: colors.text, marginBottom: spacing.sm },
  leaderboardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.borderLight },
  leaderboardRank: { width: 28, fontSize: 12, fontWeight: '900', color: colors.primary },
  leaderboardName: { fontSize: 13, fontWeight: '800', color: colors.text },
  leaderboardMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  leaderboardScore: { fontSize: 14, fontWeight: '900', color: colors.primary },
  queuePillRow: { gap: 8, paddingBottom: spacing.sm },
  queuePill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight, marginRight: 8 },
  queuePillActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary },
  queuePillText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },
  queuePillCount: { fontSize: 11, fontWeight: '900', color: colors.text },
  queuePillTextActive: { color: colors.primary },
  menuGrid: { gap: spacing.sm },
  menuCardWrap: { width: '100%' },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  menuCardDisabled: { opacity: 0.55 },
  menuCardHovered: { transform: [{ translateY: -2 }], shadowOpacity: 0.12 },
  menuCardPressed: { transform: [{ scale: 0.99 }] },
  menuItemIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  menuItemTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  menuItemSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  section: { marginVertical: spacing.lg },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionBadge: { backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  sectionBadgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  attentionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  attentionCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  attentionIconWrap: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  attentionLabel: { fontSize: 13, fontWeight: '800', color: colors.text },
  attentionCount: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  bookingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
  },
  bookingAccent: { width: 4, alignSelf: 'stretch', borderRadius: 999, backgroundColor: colors.primary },
  bookingName: { fontSize: 14, fontWeight: '800', color: colors.text },
  bookingService: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  bookingMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  bookingMetaText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  acceptBtn: { width: 40, height: 40, backgroundColor: colors.success, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  activityItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  activityIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  activityTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  activityDesc: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  emptyMenuState: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyMenuText: { fontSize: 14, color: colors.textLight, textAlign: 'center', marginTop: 8 },
  feedPostCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  feedPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  feedPostAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  feedPostAuthorName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  feedPostMeta: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  feedPostTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  feedPostBody: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 14,
  },
  feedPostMedia: {
    width: '100%',
    aspectRatio: 1.18,
    borderRadius: 18,
    overflow: 'hidden',
  },
  feedPostActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  feedPostActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
});