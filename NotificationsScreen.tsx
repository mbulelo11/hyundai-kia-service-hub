import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
  ScrollView,
  Image,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { Alert } from 'react-native';
import UserAvatar from '../lib/UserAvatar';
import { MESSAGE_CATEGORY_ITEMS, getNotificationMessageCategoryKey, getMessageCategoryRoute } from '../lib/messageCategories';

const DATE_FILTERS = [
  { key: 'all', label: 'All time' },
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
] as const;

type DateFilterKey = (typeof DATE_FILTERS)[number]['key'];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const typeIcons: Record<string, string> = {
  booking_created: 'calendar-outline',
  booking_confirmed: 'checkmark-circle',
  booking_updated: 'sync',
  new_message: 'chatbubble',
  new_booking: 'notifications',
  staff_assigned: 'person',
  finance_new: 'document-text-outline',
  finance_submitted: 'document-text-outline',
  finance_update: 'document-text-outline',
};

const typeColors: Record<string, string> = {
  booking_created: colors.primaryLight,
  booking_confirmed: colors.success,
  booking_updated: colors.statusInProgress,
  new_message: colors.primary,
  new_booking: colors.warning,
  staff_assigned: colors.primaryLight,
  finance_new: colors.primary,
  finance_submitted: colors.primary,
  finance_update: colors.primary,
};

function getNotificationDestination(notif: any, isStaffUser: boolean) {
  const type = String(notif?.type ?? '').toLowerCase();
  const categoryKey = getNotificationMessageCategoryKey(notif, isStaffUser);
  if (categoryKey) {
    const category = MESSAGE_CATEGORY_ITEMS.find((item) => item.key === categoryKey);
    return {
      key: categoryKey,
      label: category?.label ?? 'Messages',
      icon: category?.icon ?? 'chatbubble-ellipses-outline',
      color: colors.primary,
      route: getMessageCategoryRoute(categoryKey, isStaffUser).route,
    };
  }
  if (notif?.customerUserId || type === 'enquiry_sent' || type === 'customer_enquiry') return { key: 'customers', label: 'Customer lead', icon: 'person-circle-outline', color: colors.success, route: 'CustomerProfile' };
  if (notif?.financeApplicationId || type.startsWith('finance') || notif?.targetRoute === 'FinanceApplicationDetail') return { key: 'finance', label: 'Finance', icon: 'document-text-outline', color: colors.primaryLight, route: 'FinanceApplications' };
  if (notif?.targetRoute === 'CustomerProfile') return { key: 'customers', label: 'Customers', icon: 'people-outline', color: colors.statusInProgress, route: 'CustomerManagement' };
  if (notif?.targetRoute === 'ActivityFeed') return { key: 'activity', label: 'Activity', icon: 'pulse-outline', color: colors.warning, route: 'ActivityFeed' };
  return { key: 'other', label: 'Other', icon: 'notifications-outline', color: colors.textLight, route: 'Notifications' };
}

const INBOX_NOTIFICATION_TYPES = new Set([
  'new_message',
  'booking_confirmed',
  'booking_updated',
  'booking_assigned',
  'finance_update',
  'finance_assigned',
  'rating_prompt',
]);

export default function NotificationsScreen({ navigation }: any) {
  const me = useQuery(api.users.me);
  const [showArchived, setShowArchived] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterKey>('all');
  const [showExporting, setShowExporting] = useState(false);
  const historyArgs = useMemo(() => {
    const now = Date.now();
    const fromTime = dateFilter === '24h' ? now - 24 * 60 * 60 * 1000 : dateFilter === '7d' ? now - 7 * 24 * 60 * 60 * 1000 : dateFilter === '30d' ? now - 30 * 24 * 60 * 60 * 1000 : undefined;
    return {
      includeArchived: showArchived,
      onlyUnread,
      search: searchText.trim() || undefined,
      fromTime,
    };
  }, [showArchived, onlyUnread, searchText, dateFilter]);
  const notificationPage = usePaginatedQuery(api.notifications.listMinePaged, { ...historyArgs }, { initialNumItems: 25 });
  const visibleNotifications = notificationPage.results;
  const allHistory = notificationPage.results;
  const markAllRead = useMutation(api.notifications.markAllRead);
  const markNotificationRead = useMutation(api.notifications.markRead);
  const archiveNotification = useMutation(api.notifications.archiveNotification);
  const unarchiveNotification = useMutation(api.notifications.unarchiveNotification);

  const [selectedNotification, setSelectedNotification] = useState<any>(null);
  const isStaffUser = Boolean(
    me?.role === 'staff' ||
    me?.staffRole ||
    me?.accessLevel === 'full_access' ||
    me?.isOwner
  );
  const currentStaffRole = String(me?.staffRole ?? '').toLowerCase();
  const isAdminViewer = Boolean(
    me?.isOwner ||
    String(me?.email ?? '').trim().toLowerCase() === 'vincentmm@hyundai.co.za' ||
    currentStaffRole === 'dp' ||
    me?.accessLevel === 'full_access'
  );
  const directMessageRoute = isStaffUser ? 'StaffMessages' : 'Messages';
  const bookingsRoute = isStaffUser ? 'StaffInbox' : 'BookingsTab';
  const unreadNotifications = visibleNotifications.filter((n: any) => !n.isRead).length;
  const unread = unreadNotifications;
  const sourceCards = useMemo(() => {
    const unreadOnly = visibleNotifications.filter((n: any) => !n.isRead);
    const items = [
      { key: 'serviceBookings', label: 'Service bookings', icon: 'construct-outline', color: colors.primary, route: isStaffUser ? 'StaffInbox' : 'Main' },
      { key: 'testDriveBookings', label: 'Test drives', icon: 'speedometer-outline', color: colors.success, route: isStaffUser ? 'StaffTestDriveBookings' : 'TestDriveBooking' },
      { key: 'partsOrders', label: 'Parts & accessories', icon: 'cube-outline', color: '#EA580C', route: 'PartsOrders' },
      { key: 'merchandiseOrders', label: 'Merchandise', icon: 'pricetag-outline', color: colors.primaryLight, route: 'MerchandiseOrders' },
      { key: 'financeApplications', label: 'Finance', icon: 'document-text-outline', color: colors.statusInProgress, route: 'FinanceApplications' },
      { key: 'referralWallet', label: 'Referral wallet', icon: 'wallet-outline', color: '#8B5CF6', route: isStaffUser ? 'StaffWallet' : 'Rewards' },
    ];

    return items.map((item: { key: string; label: string; icon: string; color: string; route: string }) => ({
      ...item,
      count: unreadOnly.filter((notif: any) => getNotificationMessageCategoryKey(notif, isStaffUser) === item.key).length,
    }));
  }, [visibleNotifications, isStaffUser]);

  const openDestination = (route: string) => {
    if (route === 'BookingsTab') {
      navigation.navigate('Main', { screen: 'BookingsTab' });
      return;
    }
    navigation.navigate(route);
  };

  const openMessageCategory = (categoryKey: 'serviceBookings' | 'testDriveBookings' | 'partsOrders' | 'merchandiseOrders' | 'financeApplications' | 'referralWallet') => {
    const categoryRoute = getMessageCategoryRoute(categoryKey, isStaffUser);
    navigation.navigate(categoryRoute.route as never, categoryRoute.params as never);
  };

  const openNotificationDetails = async (notif: any) => {
    if (!notif.isRead) {
      await markNotificationRead({ notificationId: notif._id });
    }
    setSelectedNotification(notif);
  };

  const archiveSelectedNotification = async () => {
    if (!selectedNotification) return;
    if (selectedNotification.isArchived) {
      await unarchiveNotification({ notificationId: selectedNotification._id });
    } else {
      await archiveNotification({ notificationId: selectedNotification._id });
    }
    setSelectedNotification(null);
  };

  const closeNotificationDetails = () => {
    setSelectedNotification(null);
  };

  const openNotificationTarget = async (notif: any) => {
    if (!notif) return;

    const directPeerId = String(notif.senderId ?? notif.targetId ?? '').trim();
    const categoryKey = getNotificationMessageCategoryKey(notif, isStaffUser);
    if (categoryKey) {
      const categoryRoute = getMessageCategoryRoute(categoryKey, isStaffUser);
      navigation.navigate(categoryRoute.route as never, categoryRoute.params as never);
      return;
    }

    if (notif.customerUserId || notif.type === 'enquiry_sent' || notif.type === 'customer_enquiry' || notif.targetRoute === 'CustomerProfile') {
      const userId = String(notif.customerUserId ?? notif.targetId ?? directPeerId ?? '').trim();
      if (userId) {
        navigation.navigate('StaffChat', {
          customerId: userId,
          recipientId: userId,
          customerName: notif.customerName ?? notif.title,
          recipientName: notif.customerName ?? notif.title,
          customerPhone: notif.customerPhone,
          customerEmail: notif.customerEmail,
          chatType: 'stock_enquiry',
          vehicleInventoryItemId: notif.vehicleInventoryItemId,
          vehicleDescription: notif.vehicleDescription,
          vehicleImageUrl: notif.vehicleImageUrl,
          vehicleYear: notif.vehicleYear,
          vehicleMake: notif.vehicleMake,
          vehicleModel: notif.vehicleModel,
          vehicleVariant: notif.vehicleVariant,
          vehiclePrice: notif.vehiclePrice,
          vehicleColor: notif.vehicleColor,
        });
        return;
      }
    }

    if (notif.type === 'new_message' || notif.targetRoute === 'Messages' || notif.targetRoute === 'StaffChat') {
      if (notif.bookingId) {
        navigation.navigate(isStaffUser ? 'StaffBookingDetail' : 'BookingDetail', { bookingId: notif.bookingId });
        return;
      }
      if (directPeerId) {
        navigation.navigate('StaffChat', {
          customerId: directPeerId,
          recipientId: directPeerId,
          recipientName: notif.title,
          customerName: notif.title,
          chatType: 'staff',
        });
        return;
      }
      navigation.navigate(directMessageRoute as never);
      return;
    }

    if (notif.targetRoute === 'PartsOrders' || notif.type === 'parts_order_received' || notif.type === 'parts_order_quote' || notif.type === 'parts_order_available' || notif.type === 'parts_order_payment_proof_submitted' || notif.type === 'parts_order_payment_confirmed' || notif.type === 'parts_order_completed' || notif.type === 'parts_order_assigned' || notif.targetId && String(notif.targetRoute ?? '').toLowerCase() === 'partsorders') {
      const partsOrderId = notif.targetId ?? notif.partsOrderId;
      navigation.navigate('PartsOrders', partsOrderId ? { partsOrderId: String(partsOrderId) } : undefined);
      return;
    }

    if (notif.targetRoute === 'CustomerProfile') {
      const userId = notif.customerUserId ?? notif.targetId;
      if (userId) {
        navigation.navigate('CustomerProfile', { userId });
        return;
      }
    }

    if (notif.targetRoute === 'FinanceApplicationDetail' || notif.financeApplicationId || notif.type === 'finance_new' || notif.type === 'finance_submitted' || notif.type === 'finance_update') {
      const applicationId = notif.financeApplicationId ?? notif.targetId;
      if (applicationId) {
        navigation.navigate('FinanceApplicationDetail', { applicationId, isStaff: isStaffUser });
        return;
      }
      navigation.navigate('FinanceApplications');
      return;
    }

    if (notif.targetRoute === 'BookingDetail') {
      if (notif.bookingId) {
        navigation.navigate('BookingDetail', { bookingId: notif.bookingId });
        return;
      }
    }

    if (notif.targetRoute === 'StaffBookingDetail') {
      if (notif.bookingId) {
        navigation.navigate('StaffBookingDetail', { bookingId: notif.bookingId });
        return;
      }
    }

    if (notif.targetRoute === 'ActivityFeed') {
      navigation.navigate('ActivityFeed');
      return;
    }

    if (notif.targetRoute === 'SocialFeed' || notif.postId) {
      navigation.navigate('SocialFeed');
      return;
    }

    if (notif.bookingId) {
      navigation.navigate(isStaffUser ? 'StaffBookingDetail' : 'BookingDetail', { bookingId: notif.bookingId });
    }
  };

  const handleNotificationPress = async (notif: any) => {
    if (!notif.isRead) {
      await markNotificationRead({ notificationId: notif._id });
    }
    setSelectedNotification(null);
    await openNotificationTarget(notif);
  };

  const exportHistory = async () => {
    try {
      setShowExporting(true);
      const rows = allHistory.map((item: any) => [
        new Date(item._creationTime).toISOString(),
        item.isArchived ? 'archived' : 'active',
        item.isRead ? 'read' : 'unread',
        item.type,
        item.title,
        item.message.replace(/\s+/g, ' ').trim(),
        item.customerPhone ?? '',
        item.customerEmail ?? '',
        item.bookingId ? String(item.bookingId) : '',
        item.financeApplicationId ? String(item.financeApplicationId) : '',
        item.targetRoute ?? '',
      ]);
      const csv = ['createdAt,state,read,type,title,message,customerPhone,customerEmail,bookingId,financeApplicationId,targetRoute', ...rows.map((row: string[]) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))].join('\n');
      await Share.share({ message: csv, title: 'Full notification history export' });
    } finally {
      setShowExporting(false);
    }
  };

  const openSelectedNotificationTarget = async () => {
    if (!selectedNotification) return;
    const target = selectedNotification;
    setSelectedNotification(null);
    await openNotificationTarget(target);
  };

  const renderNotification = ({ item }: any) => {
    const source = getNotificationDestination(item, isStaffUser);
    const icon = typeIcons[item.type] ?? 'notifications';
    const iconColor = typeColors[item.type] ?? colors.primary;
    const isFinanceNotification =
      item.type === 'finance_new' || item.type === 'finance_submitted' || item.type === 'finance_update';
    const avatarLabel = String(item.title ?? item.type ?? '?').trim().charAt(0).toUpperCase();

    return (
      <TouchableOpacity
        style={[styles.notifCard, !item.isRead && styles.notifUnread]}
        onPress={() => { void handleNotificationPress(item); }}
        onLongPress={() => { void openNotificationDetails(item); }}
      >
        <View style={[styles.notifAvatar, { backgroundColor: iconColor + '14' }]}>
          <Text style={[styles.notifAvatarText, { color: iconColor }]}>{avatarLabel}</Text>
          <View style={[styles.notifAvatarBadge, { backgroundColor: iconColor }]}>
            <Ionicons name={icon as any} size={10} color={colors.white} />
          </View>
        </View>
        <View style={styles.notifContent}>
          <View style={styles.notifTop}>
            <Text style={[styles.notifTitle, !item.isRead && styles.notifTitleUnread]}>{item.title}</Text>
            <Text style={styles.notifTime}>{timeAgo(item._creationTime)}</Text>
          </View>
          <View style={[styles.sourceChip, { backgroundColor: source.color + '14' }]}>
            <Ionicons name={source.icon as any} size={12} color={source.color} />
            <Text style={[styles.sourceChipText, { color: source.color }]}>{source.label}</Text>
          </View>
          <Text style={styles.notifMessage} numberOfLines={3}>{item.message}</Text>
          <View style={styles.notificationMetaRow}>
            {item.customerPhone ? (
              <View style={styles.replyHint}>
                <Ionicons name="call-outline" size={12} color={colors.primary} />
                <Text style={styles.replyHintText}>{item.customerPhone}</Text>
              </View>
            ) : null}
            {isFinanceNotification ? (
              <View style={styles.financeBadge}>
                <Text style={styles.financeBadgeText}>Finance</Text>
              </View>
            ) : null}
          </View>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    return (
      <View style={styles.endNote}>
        <Text style={styles.endNoteText}>Full history is loaded directly. Use search, date filters, and archived history to narrow it down.</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.primary }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Notifications</Text>
            <View style={styles.headerBadgeRow}>
              <View style={styles.headerAvatarBadge}>
                <Ionicons name="notifications" size={12} color={colors.primary} />
              </View>
              {unread > 0 ? <Text style={styles.headerBadgeText}>{unread} unread</Text> : <Text style={styles.headerBadgeText}>All caught up</Text>}
            </View>
          </View>
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>

      <FlatList
        data={visibleNotifications}
        keyExtractor={(item: any) => item._id}
        renderItem={renderNotification}
        contentContainerStyle={styles.list}
        onEndReached={() => {
          if (notificationPage.status === 'CanLoadMore') {
            notificationPage.loadMore(25);
          }
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View>
            <View style={styles.searchBarRow}>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={16} color={colors.textLight} />
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search notifications"
                  placeholderTextColor={colors.textLight}
                  style={styles.searchInput}
                />
              </View>
              <TouchableOpacity style={styles.archiveToggle} onPress={() => setShowArchived(!showArchived)}>
                <Text style={styles.archiveToggleText}>{showArchived ? 'Showing archived' : 'Hide archived'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.exportToggle} onPress={() => void exportHistory()}>
                {showExporting ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="download-outline" size={16} color={colors.primary} />}
                <Text style={styles.exportToggleText}>Export</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.filterChipsRow}>
              {DATE_FILTERS.map((filter) => (
                <TouchableOpacity
                  key={filter.key}
                  style={[styles.filterChip, dateFilter === filter.key && styles.filterChipActive]}
                  onPress={() => setDateFilter(filter.key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.filterChipText, dateFilter === filter.key && styles.filterChipTextActive]}>{filter.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.filterChip, onlyUnread && styles.filterChipActive]}
                onPress={() => setOnlyUnread(!onlyUnread)}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterChipText, onlyUnread && styles.filterChipTextActive]}>Unread only</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.attentionHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyTitle}>Where attention goes</Text>
                <Text style={styles.historySubtitle}>Alerts are grouped by source so you can jump straight to the right screen.</Text>
              </View>
            </View>

            <View style={styles.attentionGrid}>
              {sourceCards.map((item: { key: string; label: string; icon: string; color: string; route: string; count: number }) => (
                <TouchableOpacity key={item.key} style={styles.attentionCard} onPress={() => openMessageCategory(item.key as any)} activeOpacity={0.85}>
                  <View style={[styles.attentionIconWrap, { backgroundColor: item.color + '14' }]}>
                    <Ionicons name={item.icon as any} size={18} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attentionLabel}>{item.label}</Text>
                    <Text style={styles.attentionCount}>{item.count} unread</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inboxIntro}>
              <Text style={styles.inboxIntroTitle}>Direct message categories</Text>
              <Text style={styles.inboxIntroText}>Open the exact conversation type from here: service, test drive, parts, merchandise, finance, or referral wallet.</Text>
            </View>

            <View style={styles.historyHeaderRow}>
              <Text style={styles.historyTitle}>Full history</Text>
              <Text style={styles.historySubtitle}>Every item stays available unless you archive it. Tap any card for full detail.</Text>
            </View>
          </View>
        }
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color={colors.textLight} />
            <Text style={styles.emptyTitle}>No alerts</Text>
            <Text style={styles.emptyDesc}>You currently have no notifications.</Text>
          </View>
        }
      />

      <Modal visible={!!selectedNotification} transparent animationType="fade" onRequestClose={closeNotificationDetails}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModal}>
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailEyebrow}>Notification detail</Text>
                <Text style={styles.detailTitle}>{selectedNotification?.title ?? 'Notification'}</Text>
                <Text style={styles.detailTime}>{selectedNotification ? timeAgo(selectedNotification._creationTime) : ''}</Text>
              </View>
              <TouchableOpacity onPress={closeNotificationDetails}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailScroll}>
              <Text style={styles.detailMessage}>{selectedNotification?.message}</Text>

              {selectedNotification?.customerPhone || selectedNotification?.customerEmail ? (
                <View style={styles.detailMetaCard}>
                  <Text style={styles.detailSectionTitle}>Customer contact</Text>
                  {selectedNotification?.customerPhone ? (
                    <Text style={styles.detailMetaText}>Phone: {selectedNotification.customerPhone}</Text>
                  ) : null}
                  {selectedNotification?.customerEmail ? (
                    <Text style={styles.detailMetaText}>Email: {selectedNotification.customerEmail}</Text>
                  ) : null}
                </View>
              ) : null}

              {selectedNotification?.vehicleDescription || selectedNotification?.vehicleImageUrl ? (
                <View style={styles.detailMetaCard}>
                  <Text style={styles.detailSectionTitle}>Vehicle enquiry</Text>
                  {selectedNotification?.vehicleImageUrl ? (
                    <Image source={{ uri: selectedNotification.vehicleImageUrl }} style={styles.detailVehicleImage} resizeMode="cover" />
                  ) : null}
                  {selectedNotification?.vehicleDescription ? <Text style={styles.detailMetaText}>{selectedNotification.vehicleDescription}</Text> : null}
                  {selectedNotification?.vehicleColor ? <Text style={styles.detailMetaText}>Color: {selectedNotification.vehicleColor}</Text> : null}
                  {selectedNotification?.vehiclePrice ? <Text style={styles.detailMetaText}>Price: R {Number(selectedNotification.vehiclePrice).toLocaleString()}</Text> : null}
                </View>
              ) : null}

              {selectedNotification?.bookingId || selectedNotification?.financeApplicationId || selectedNotification?.targetRoute ? (
                <View style={styles.detailMetaCard}>
                  <Text style={styles.detailSectionTitle}>Linked item</Text>
                  {selectedNotification?.bookingId ? <Text style={styles.detailMetaText}>Booking ID: {String(selectedNotification.bookingId)}</Text> : null}
                  {selectedNotification?.financeApplicationId ? <Text style={styles.detailMetaText}>Application ID: {String(selectedNotification.financeApplicationId)}</Text> : null}
                  {selectedNotification?.targetRoute ? <Text style={styles.detailMetaText}>Route: {String(selectedNotification.targetRoute)}</Text> : null}
                </View>
              ) : null}

              {selectedNotification?.customerUserId || selectedNotification?.customerPhone || selectedNotification?.customerEmail ? (
                <View style={styles.detailMetaCard}>
                  <Text style={styles.detailSectionTitle}>Customer lead</Text>
                  {selectedNotification?.customerPhone ? <Text style={styles.detailMetaText}>Phone: {selectedNotification.customerPhone}</Text> : null}
                  {selectedNotification?.customerEmail ? <Text style={styles.detailMetaText}>Email: {selectedNotification.customerEmail}</Text> : null}
                  {selectedNotification?.customerUserId ? <Text style={styles.detailMetaText}>User ID: {String(selectedNotification.customerUserId)}</Text> : null}
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.detailActions}>
              <TouchableOpacity style={styles.detailActionBtnSecondary} onPress={() => { void archiveSelectedNotification(); }}>
                <Ionicons name={selectedNotification?.isArchived ? 'refresh-outline' : 'archive-outline'} size={16} color={colors.primary} />
                <Text style={styles.detailActionBtnSecondaryText}>{selectedNotification?.isArchived ? 'Restore' : 'Archive'}</Text>
              </TouchableOpacity>
              {selectedNotification?.customerUserId || selectedNotification?.type === 'enquiry_sent' || selectedNotification?.type === 'customer_enquiry' ? (
                <TouchableOpacity style={styles.detailActionBtnSecondary} onPress={() => navigation.navigate('CustomerProfile', { userId: String(selectedNotification?.customerUserId ?? selectedNotification?.targetId ?? selectedNotification?.senderId ?? '') })}>
                  <Ionicons name="person-circle-outline" size={16} color={colors.primary} />
                  <Text style={styles.detailActionBtnSecondaryText}>Open customer</Text>
                </TouchableOpacity>
              ) : null}
              {(selectedNotification?.targetRoute || selectedNotification?.bookingId || selectedNotification?.financeApplicationId || selectedNotification?.postId) ? (
                <TouchableOpacity style={styles.detailActionBtn} onPress={() => void openSelectedNotificationTarget()}>
                  <Text style={styles.detailActionBtnText}>Open linked screen</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    backgroundColor: colors.primary,
  },
  backBtn: {
    marginRight: 12,
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.md },
  headerEyebrow: { fontSize: 10, fontWeight: '800', color: colors.textLight, letterSpacing: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.white, marginTop: 2 },
  headerBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  headerAvatarBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white, justifyContent: 'center', alignItems: 'center' },
  headerBadgeText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  markAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
  },
  markAllText: { fontSize: 12, fontWeight: '600', color: colors.white },
  list: { padding: spacing.lg },
  searchBarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.borderLight, minHeight: 44 },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  archiveToggle: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  archiveToggleText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  exportToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  exportToggleText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  filterChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  filterChipTextActive: { color: colors.white },
  historyHeaderRow: { marginBottom: spacing.md },
  historyTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  historySubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  attentionHeaderRow: { marginBottom: spacing.md },
  attentionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
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
  inboxIntro: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  inboxIntroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  inboxIntroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inboxIntroTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  inboxIntroText: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  staffScroll: { gap: spacing.sm, paddingRight: spacing.sm },
  staffChip: {
    width: 260,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  staffChipAvatarWrap: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  staffChipAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  staffChipAvatarImage: {
    width: '100%',
    height: '100%',
  },
  staffChipAvatarText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  staffChipUnreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  staffChipUnreadBadgeText: { fontSize: 9, fontWeight: '800', color: colors.white },
  staffChipName: { fontSize: 14, fontWeight: '700', color: colors.text },
  staffChipMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  notifUnread: {
    backgroundColor: '#F0F7FF',
    borderColor: colors.primaryLight + '30',
  },
  notifAvatar: {
    width: 42,
    height: 42,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  notifAvatarText: { fontSize: 15, fontWeight: '900' },
  notifAvatarBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  notifContent: { flex: 1 },
  notifTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  notifTitle: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 },
  notifTitleUnread: { fontWeight: '700' },
  notifTime: { fontSize: 11, color: colors.textLight, marginLeft: 8 },
  notifMessage: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  notificationMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 6,
  },
  financeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '20',
  },
  financeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  replyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  financeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  financeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
  },
  replyHintText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: 8,
    marginTop: 4,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  emptyDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  chatContainer: { flex: 1, backgroundColor: colors.background },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  chatTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  msgList: { padding: spacing.lg, paddingBottom: 8 },
  msgBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: radius.md,
    marginBottom: 8,
  },
  msgRight: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  msgLeft: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  msgSender: { fontSize: 11, fontWeight: '700', color: colors.textLight, marginBottom: 2 },
  msgText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  msgTime: { fontSize: 10, color: colors.textLight, marginTop: 4, textAlign: 'right' },
  chatEmpty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  chatEmptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  chatInput: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: 8,
  },
  chatTextInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  composeModal: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    margin: spacing.lg,
    maxHeight: '80%',
  },
  composeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  composeTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  composeSubtitle: { fontSize: 14, color: colors.textSecondary },
  recipientLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  recipientList: { marginBottom: spacing.lg },
  recipientListContent: { gap: spacing.md },
  recipientSection: { gap: spacing.sm },
  recipientSectionTitle: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  recipientSectionItems: { gap: spacing.sm },
  recipientEmpty: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  recipientCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  recipientAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  recipientOnlineDot: { position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.surfaceAlt },
  recipientAvatarImage: {
    width: '100%',
    height: '100%',
  },
  recipientName: { fontSize: 14, fontWeight: '700', color: colors.text },
  recipientSubtitle: { fontSize: 12, color: colors.textSecondary },
  composeInput: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  composeSendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  composeSendBtnDisabled: {
    backgroundColor: colors.surface,
    borderColor: colors.borderLight,
  },
  composeSendText: { fontSize: 14, fontWeight: '700', color: colors.white },
  newMessageBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  newMessageText: { fontSize: 12, fontWeight: '600', color: colors.white },
  shortcutHero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    margin: spacing.lg,
    marginBottom: spacing.md,
  },
  shortcutHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  shortcutHeroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shortcutHeroBadgeText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  shortcutHeroTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  shortcutHeroSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  threadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  threadAvatarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  threadAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  threadAvatarImage: {
    width: '100%',
    height: '100%',
  },
  threadUnreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  threadUnreadBadgeText: { fontSize: 9, fontWeight: '800', color: colors.white },
  threadContent: { flex: 1 },
  threadTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  threadName: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 },
  threadTime: { fontSize: 11, color: colors.textLight, marginLeft: 8 },
  threadMessage: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  detailModal: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    margin: spacing.lg,
    maxHeight: '88%',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  detailEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textLight,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  detailTime: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: 4,
  },
  detailScroll: {
    paddingBottom: spacing.md,
  },
  detailMessage: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  detailMetaCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  detailSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  detailMetaText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  detailVehicleImage: { width: '100%', height: 160, borderRadius: radius.lg, marginBottom: spacing.sm, backgroundColor: colors.surfaceAlt },
  detailActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  detailActionBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  detailActionBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  detailActionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  detailActionBtnSecondaryText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  loadingMore: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  loadMoreBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  endNote: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  endNoteText: {
    fontSize: 12,
    color: colors.textLight,
    textAlign: 'center',
    lineHeight: 18,
  },
  headerSpacer: { flex: 1 },
});