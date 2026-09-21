import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Pressable,
  Image,
  Modal,
  Animated,
  ImageBackground,
  Alert,
  Linking,
} from 'react-native';
declare const require: (path: string) => any;
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import UserAvatar from '../lib/UserAvatar';
import { getMessageCategoryRoute } from '../lib/messageCategories';

const appBackgroundImage = require('../assets/WhatsApp Image 2026-05-06 at 10.25.35 AM.jpeg');

const STATUS_COLORS: Record<string, string> = {
  pending: colors.statusPending,
  confirmed: colors.statusConfirmed,
  'in-progress': colors.statusInProgress,
  in_progress: colors.statusInProgress,
  completed: colors.statusCompleted,
};

const EMPTY_ARRAY: any[] = [];

const STAFF_ROLE_LABELS: Record<string, string> = {
  sales_executive: 'Sales executive',
  service_advisor: 'Service advisor',
  dealership_principal: 'Dealership principal',
  moderator: 'Admin',
  driver: 'Driver',
};

const STAFF_ROLE_DESCRIPTIONS: Record<string, string> = {
  sales_executive: 'Vehicle stock, pricing, test drives, and sales support.',
  service_advisor: 'Service bookings, status updates, and workshop support.',
  dealership_principal: 'Escalations, approvals, and dealership-level help.',
  moderator: 'Platform support and chat oversight.',
  driver: 'Courtesy pickup and delivery coordination.',
};

function getStaffRoleLabel(role?: string) {
  if (!role) return 'Dealership support';
  return STAFF_ROLE_LABELS[role] ?? role.replace(/_/g, ' ');
}

function getStaffRoleDescription(role?: string) {
  if (!role) return 'Available to help with dealership queries.';
  return STAFF_ROLE_DESCRIPTIONS[role] ?? 'Available to help with dealership queries.';
}

export default function HomeScreen({ navigation }: any) {
  const [staffPickerVisible, setStaffPickerVisible] = useState(false);
  const [dealershipPickerVisible, setDealershipPickerVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [shuffleMerchandise, setShuffleMerchandise] = useState(false);

  const user = useQuery(api.users.me);
  const upcoming = useQuery(api.bookings.getUpcoming);
  const bookings = useQuery(api.bookings.listMine);
  const vehicles = useQuery(api.vehicles.list);
  const notificationUnread = useQuery(api.notifications.getUnreadCount) ?? 0;
  const reviewStats = useQuery(api.reviews.getStats);
  const latestBrochure = useQuery(api.brochures.getLatest);
  const testDrives = useQuery(api.testDrives.listMine) ?? EMPTY_ARRAY;
  const isStaff = Boolean(user?.role === 'staff' || user?.staffRole);
  const onlineStaff = useQuery(api.staff.publicAvailableStaff) ?? EMPTY_ARRAY;
  const dealerships = useQuery(api.dealerships.listPublicAvailable) ?? EMPTY_ARRAY;
  const directThreads = useQuery(api.messages.listMyConversations) ?? EMPTY_ARRAY;
  const featuredMerchandise = useQuery(api.merchandise.getFeaturedMerchandiseFeed, { shuffle: shuffleMerchandise }) ?? EMPTY_ARRAY;
  const unreadCount = Math.max(
    notificationUnread,
    directThreads.reduce((total: number, thread: any) => total + (thread.unreadCount ?? 0), 0)
  );
  const userDealershipLine = [user?.dealershipName, user?.dealershipLocation].filter(Boolean).join(' • ');
  const isStaffUser = Boolean(user?.role === 'staff' || user?.staffRole);

  const screenEnter = useRef(new Animated.Value(0)).current;
  const headerLift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(screenEnter, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [screenEnter]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(headerLift, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(headerLift, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, [headerLift]);

  const screenTranslateY = screenEnter.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  const recentBookings = (bookings ?? []).slice(0, 3);
  const defaultVehicle = (vehicles ?? []).find((v: any) => v.isDefault);
  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const upcomingTestDrive = testDrives.find((td: any) => td.status === 'pending' || td.status === 'confirmed');
  const upcomingPickupBooking = (bookings ?? []).find((b: any) => b.pickupRequested && (b.status === 'pending' || b.status === 'confirmed' || b.status === 'in-progress'));
  const completedUnreviewed = (bookings ?? []).find(
    (b: any) => b.status === 'completed' && !b.ratingId
  );

  const openStaffCall = async (staff: any) => {
    const phone = String(staff.phone ?? '').trim();
    if (!phone) {
      Alert.alert('No phone number', 'This staff member does not have a phone number saved.');
      return;
    }

    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      Alert.alert('Call failed', 'Unable to open the phone app.');
    }
  };

  const availableStaff = useMemo(() => {
    return onlineStaff
      .map((staff: any) => {
        const thread = directThreads.find((item: any) => item.counterpartId === String(staff.userId ?? staff._id));
        return {
          key: String(staff.userId ?? staff._id ?? staff.email ?? staff.name),
          name: staff.name ?? 'Staff member',
          subtitle: getStaffRoleDescription(staff.role),
          roleLabel: getStaffRoleLabel(staff.role),
          dealershipLabel: [staff.dealershipName, staff.dealershipLocation].filter(Boolean).join(' • '),
          isOnline: Boolean(staff.isOnline),
          profileImage: staff.profileImage,
          recipientId: String(staff.userId ?? staff._id),
          unreadCount: thread?.unreadCount ?? 0,
        };
      });
  }, [directThreads, onlineStaff]);

  const availableStaffCount = availableStaff.length;

  const availableDealerships = useMemo(() => {
    return dealerships.map((dealership: any) => ({
      key: String(dealership._id),
      name: dealership.name,
      label: `${dealership.brand} • ${dealership.location}`,
      location: [dealership.city, dealership.province].filter(Boolean).join(', '),
      onlineStaffCount: dealership.onlineStaffCount ?? 0,
      contactPhone: dealership.phone,
    }));
  }, [dealerships]);

  const openStaffChat = (staff: any) => {
    setStaffPickerVisible(false);
    navigation.navigate('StaffChat', {
      recipientId: staff.recipientId,
      recipientName: staff.name,
      chatType: 'staff',
    });
  };

  const openCustomerMessages = () => {
    navigation.navigate('Messages');
  };

  const openTradeIn = () => {
    navigation.navigate('TradeIn');
  };

  const openBrochure = async () => {
    if (!latestBrochure?.fileUrl) {
      Alert.alert('Brochure unavailable', 'The dealership brochure has not been uploaded yet.');
      return;
    }
    try {
      await Linking.openURL(latestBrochure.fileUrl);
    } catch {
      Alert.alert('Download failed', 'Unable to open the brochure link right now.');
    }
  };

  const openMessageCategory = (categoryKey: 'serviceBookings' | 'testDriveBookings' | 'partsOrders' | 'merchandiseOrders' | 'financeApplications' | 'referralWallet') => {
    const categoryRoute = getMessageCategoryRoute(categoryKey, isStaffUser);
    setMenuVisible(false);
    navigation.navigate(categoryRoute.route as never, categoryRoute.params as never);
  };

  return (
    <View style={styles.container}>
      <ImageBackground source={appBackgroundImage} style={styles.homeWallpaper} resizeMode="cover">
        <View style={styles.homeBackdrop} />
        <StatusBar barStyle="light-content" />
        <SafeAreaView edges={['top']} style={styles.safe}>
          <Animated.View style={[styles.motionWrap, { opacity: screenEnter, transform: [{ translateY: screenTranslateY }] }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
              {/* Header */}
              <Animated.View style={[styles.header, { transform: [{ translateY: headerLift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }] }]}>
                <View>
                  <Text style={styles.greeting}>Hello, {firstName}</Text>
                  <Text style={styles.subGreeting}>What would you like to do today?</Text>
                </View>
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.staffAvailabilityBtn}
                    onPress={() => setStaffPickerVisible(true)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`View available staff, ${availableStaffCount} online`}
                    accessibilityHint="Opens the list of online staff members"
                  >
                    <Ionicons name="people-outline" size={18} color={colors.primary} />
                    <View style={styles.staffAvailabilityTextWrap}>
                      <Text style={styles.staffAvailabilityBtnText}>Available staff</Text>
                      <Text style={styles.staffAvailabilitySubtext}>{availableStaffCount} online now</Text>
                    </View>
                    <View style={styles.staffAvailabilityCountBadge}>
                      <Text style={styles.staffAvailabilityCountText}>{availableStaffCount}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.notifBtn}
                    onPress={() => navigation.navigate('AIChat')}
                  >
                    <Ionicons name="sparkles" size={20} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.notifBtn}
                    onPress={() => setStaffPickerVisible(true)}
                  >
                    <Ionicons name="chatbubbles-outline" size={20} color={colors.text} />
                    {unreadCount > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.notifBtn}
                    onPress={() => setMenuVisible(true)}
                  >
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.carModeBtn}
                    onPress={() => setDealershipPickerVisible(true)}
                  >
                    <Ionicons name="car-sport" size={22} color={colors.white} />
                  </TouchableOpacity>
                </View>
              </Animated.View>

              <Animated.View style={[styles.availableStaffCard, { opacity: screenEnter, transform: [{ translateY: screenEnter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
                <View style={styles.availableStaffTopRow}>
                  <View style={styles.availableStaffIcon}>
                    <Ionicons name="business-outline" size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.availableStaffTitle}>
                      {isStaff ? 'Your dealership team' : 'Available online staff'}
                    </Text>
                    <Text style={styles.availableStaffSubtitle}>
                      {isStaff
                        ? `Chat with colleagues, service advisors, and managers tied to ${userDealershipLine || 'your dealership'}.`
                        : 'Tap the message button to choose an online staff member and start a private chat.'}
                    </Text>
                    {isStaff && userDealershipLine ? (
                      <Text style={styles.availableStaffDealership}>{userDealershipLine}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={styles.availableStaffActionBtn}
                    onPress={() => setStaffPickerVisible(true)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Open available staff list"
                  >
                    <Text style={styles.availableStaffAction}>Open staff list</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.staffPillsRow}>
                  {availableStaff.slice(0, 4).map((staff: any) => (
                    <TouchableOpacity
                      key={staff.key}
                      style={styles.staffPill}
                      onPress={() => openStaffChat(staff)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.staffPillAvatarWrap}>
                        <UserAvatar uri={staff.profileImage} name={staff.name} size={44} backgroundColor="#E5F4F0" textColor={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.staffPillName}>{staff.name}</Text>
                        <Text style={styles.staffPillMeta}>{staff.roleLabel}</Text>
                        {staff.dealershipLabel ? <Text style={styles.staffPillDealer}>{staff.dealershipLabel}</Text> : null}
                      </View>
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={16}
                        color={colors.primary}
                      />
                      <TouchableOpacity onPress={() => void openStaffCall(staff)} style={{ marginLeft: 8 }}>
                        <Ionicons name="call-outline" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </Animated.View>

              {/* Primary Actions */}
              <View style={styles.primaryActions}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => navigation.navigate('NewBooking')}
                >
                  <View style={styles.primaryIcon}>
                    <Ionicons name="construct" size={28} color={colors.white} />
                  </View>
                  <Text style={styles.primaryLabel}>Book{'\n'}Service</Text>
                  <Ionicons name="arrow-forward-circle" size={24} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primaryLight }]}
                  onPress={() => navigation.navigate('FinanceApplication')}
                >
                  <View style={[styles.primaryIcon, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                    <Ionicons name="document-text" size={28} color={colors.white} />
                  </View>
                  <Text style={styles.primaryLabel}>Finance{'\n'}Application</Text>
                  <Ionicons name="arrow-forward-circle" size={24} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              </View>

              <View style={styles.merchandiseQuickRow}>
                <TouchableOpacity style={styles.merchandiseQuickCard} onPress={openTradeIn}>
                  <Ionicons name="swap-horizontal-outline" size={22} color={colors.primary} />
                  <Text style={styles.merchandiseQuickTitle}>Trade-In</Text>
                  <Text style={styles.merchandiseQuickText}>Get a value for your current vehicle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.merchandiseQuickCard} onPress={openBrochure}>
                  <Ionicons name="download-outline" size={22} color={colors.primary} />
                  <Text style={styles.merchandiseQuickTitle}>Brochure</Text>
                  <Text style={styles.merchandiseQuickText}>Download the latest brochure</Text>
                </TouchableOpacity>
              </View>

              {featuredMerchandise.length > 0 ? (
                <View style={styles.featuredMainBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <View>
                      <Text style={styles.sectionTitle}>Featured merchandise</Text>
                      <Text style={styles.sectionSub}>Live from stock</Text>
                    </View>
                    <TouchableOpacity 
                      onPress={() => setShuffleMerchandise(!shuffleMerchandise)}
                      style={[styles.shuffleBtn, shuffleMerchandise && styles.shuffleBtnActive]}
                    >
                      <Ionicons 
                        name="shuffle" 
                        size={18} 
                        color={shuffleMerchandise ? colors.primary : colors.textLight} 
                      />
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredMainRow}>
                    {featuredMerchandise.map((item: any) => {
                      const imageUrl = Array.isArray(item.imageUrls) ? item.imageUrls[0] : undefined;
                      return (
                        <TouchableOpacity
                          key={String(item._id)}
                          style={styles.featuredMainCard}
                          activeOpacity={0.9}
                          onPress={() => navigation.navigate(item.brand === 'Kia' ? 'KiaMerchandise' : 'HyundaiMerchandise', { itemId: String(item._id), brand: item.brand })}
                        >
                          {imageUrl ? (
                            <Image source={{ uri: imageUrl }} style={styles.featuredMainImage} resizeMode="cover" />
                          ) : (
                            <View style={[styles.featuredMainImage, styles.featuredMainPlaceholder]}>
                              <Ionicons name="pricetag-outline" size={28} color={colors.primary} />
                              <Text style={styles.featuredMainPlaceholderText}>No photo yet</Text>
                            </View>
                          )}
                          <View style={styles.featuredMainBody}>
                            <Text style={styles.featuredMainBrand}>{item.brand}</Text>
                            <Text style={styles.featuredMainTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.featuredMainPrice}>R {Number(item.price ?? 0).toLocaleString()}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              {/* Upcoming Booking */}
              {upcoming && (
                <Animated.View style={[styles.upcomingCard, styles.animatedCard, { opacity: screenEnter, transform: [{ translateY: screenEnter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
                  <View style={styles.upcomingHeader}>
                    <Ionicons name="calendar" size={18} color={colors.primary} />
                    <Text style={styles.upcomingLabel}>UPCOMING SERVICE</Text>
                  </View>
                  <Text style={styles.upcomingService}>{upcoming.serviceType}</Text>
                  <View style={styles.upcomingDetails}>
                    <View style={styles.upcomingDetail}>
                      <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.upcomingText}>{upcoming.date}</Text>
                    </View>
                    <View style={styles.upcomingDetail}>
                      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.upcomingText}>{upcoming.timeSlot}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[upcoming.status] ?? colors.textLight) + '15' }]}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[upcoming.status] ?? colors.textLight }]} />
                    <Text style={[styles.statusText, { color: STATUS_COLORS[upcoming.status] ?? colors.textLight }]}>
                      {String(upcoming.status ?? 'pending').replace('_', ' ').replace(/^\w/, (c: string) => c.toUpperCase())}
                    </Text>
                  </View>
                </Animated.View>
              )}

              {/* Upcoming Test Drive */}
              {upcomingTestDrive && (
                <Animated.View style={[styles.upcomingCard, styles.animatedCard, { opacity: screenEnter, transform: [{ translateY: screenEnter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
                  <View style={styles.upcomingHeader}>
                    <Ionicons name="speedometer" size={18} color={colors.success} />
                    <Text style={styles.upcomingLabel}>UPCOMING TEST DRIVE</Text>
                  </View>
                  <Text style={styles.upcomingService}>{upcomingTestDrive.vehicleDescription}</Text>
                  <View style={styles.upcomingDetails}>
                    <View style={styles.upcomingDetail}>
                      <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.upcomingText}>{upcomingTestDrive.preferredDate}</Text>
                    </View>
                    <View style={styles.upcomingDetail}>
                      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.upcomingText}>{upcomingTestDrive.preferredTime}</Text>
                    </View>
                  </View>
                  {(upcomingTestDrive.pickupLocation || upcomingTestDrive.pickupTime) && (
                    <Text style={styles.upcomingText}>
                      Pickup: {upcomingTestDrive.pickupLocation || 'TBC'}{upcomingTestDrive.pickupTime ? ` at ${upcomingTestDrive.pickupTime}` : ''}
                    </Text>
                  )}
                  <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[upcomingTestDrive.status] ?? colors.textLight) + '15' }]}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[upcomingTestDrive.status] ?? colors.textLight }]} />
                    <Text style={[styles.statusText, { color: STATUS_COLORS[upcomingTestDrive.status] ?? colors.textLight }]}>
                      {upcomingTestDrive.assignedDriverName ? `Driver: ${upcomingTestDrive.assignedDriverName}` : 'Driver not assigned yet'}
                    </Text>
                  </View>
                </Animated.View>
              )}

              {upcomingPickupBooking && (
                <Animated.View style={[styles.upcomingCard, styles.animatedCard, { opacity: screenEnter, transform: [{ translateY: screenEnter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
                  <View style={styles.upcomingHeader}>
                    <Ionicons name="locate" size={18} color={colors.primaryLight} />
                    <Text style={styles.upcomingLabel}>COURTESY PICKUP</Text>
                  </View>
                  <Text style={styles.upcomingService}>{upcomingPickupBooking.serviceType}</Text>
                  <Text style={styles.upcomingText}>
                    {upcomingPickupBooking.pickupLocation || 'Pickup location pending'}
                  </Text>
                  <Text style={styles.upcomingText}>
                    {upcomingPickupBooking.assignedDriverName ? `Driver: ${upcomingPickupBooking.assignedDriverName}` : 'Driver not assigned yet'}
                  </Text>
                </Animated.View>
              )}

              {/* Review Prompt for completed services */}
              {completedUnreviewed && (
                <TouchableOpacity
                  style={styles.reviewPrompt}
                  onPress={() => navigation.navigate('Review', {
                    bookingId: completedUnreviewed._id,
                    serviceType: completedUnreviewed.serviceType,
                    staffName: completedUnreviewed.assignedToName,
                  })}
                  activeOpacity={0.8}
                >
                  <View style={styles.reviewPromptIcon}>
                    <Ionicons name="star" size={24} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reviewPromptTitle}>Rate Your Recent Service</Text>
                    <Text style={styles.reviewPromptDesc}>
                      How was your {completedUnreviewed.serviceType}? Share your experience!
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#F59E0B" />
                </TouchableOpacity>
              )}

              {/* Quick Links */}
              <Text style={styles.sectionTitle}>Quick Links</Text>
              <View style={styles.quickLinks}>
                <Pressable style={({ pressed }: { pressed: boolean }) => [styles.quickLink, pressed && styles.quickLinkPressed]} onPress={() => navigation.navigate('Vehicles')}>
                  <Ionicons name="car-outline" size={22} color={colors.primary} />
                  <Text style={styles.quickLinkText}>My Vehicles</Text>
                  <Text style={styles.quickLinkCount}>{(vehicles ?? []).length}</Text>
                </Pressable>
                <Pressable style={({ pressed }: { pressed: boolean }) => [styles.quickLink, pressed && styles.quickLinkPressed]} onPress={() => navigation.navigate('Main', { screen: 'BookingsTab' })}>
                  <Ionicons name="calendar-outline" size={22} color={colors.primaryLight} />
                  <Text style={styles.quickLinkText}>My Bookings</Text>
                  <Text style={styles.quickLinkCount}>{(bookings ?? []).length}</Text>
                </Pressable>
                <Pressable style={({ pressed }: { pressed: boolean }) => [styles.quickLink, pressed && styles.quickLinkPressed]} onPress={openTradeIn}>
                  <Ionicons name="swap-horizontal-outline" size={22} color={colors.primary} />
                  <Text style={styles.quickLinkText}>Trade-In</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                </Pressable>
                <Pressable style={({ pressed }: { pressed: boolean }) => [styles.quickLink, pressed && styles.quickLinkPressed]} onPress={() => navigation.navigate('TestDriveBooking')}>
                  <Ionicons name="speedometer-outline" size={22} color={colors.success} />
                  <Text style={styles.quickLinkText}>Test Drive Bookings</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                </Pressable>
                <Pressable style={({ pressed }: { pressed: boolean }) => [styles.quickLink, pressed && styles.quickLinkPressed]} onPress={openCustomerMessages}>
                 <Ionicons name="chatbubbles-outline" size={22} color={colors.success} />
                 <Text style={styles.quickLinkText}>Messages</Text>
                 {unreadCount > 0 && <Text style={styles.quickLinkBadge}>{unreadCount}</Text>}
               </Pressable>
                <Pressable style={({ pressed }: { pressed: boolean }) => [styles.quickLink, pressed && styles.quickLinkPressed]} onPress={() => navigation.navigate('PartsOrders')}>
                  <Ionicons name="cube-outline" size={22} color="#EA580C" />
                  <Text style={styles.quickLinkText}>Parts &amp; accessories</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                </Pressable>
                <Pressable style={({ pressed }: { pressed: boolean }) => [styles.quickLink, pressed && styles.quickLinkPressed]} onPress={() => navigation.navigate('Calendar')}>
                  <Ionicons name="calendar-outline" size={22} color={colors.primary} />
                  <Text style={styles.quickLinkText}>Calendar &amp; notes</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                </Pressable>
                <Pressable style={({ pressed }: { pressed: boolean }) => [styles.quickLink, pressed && styles.quickLinkPressed]} onPress={() => navigation.navigate('Rewards')}>
                  <Ionicons name="pulse" size={22} color="#8B5CF6" />
                  <Text style={styles.quickLinkText}>Rewards</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                </Pressable>
                <Pressable style={({ pressed }: { pressed: boolean }) => [styles.quickLink, pressed && styles.quickLinkPressed]} onPress={openBrochure}>
                  <Ionicons name="download-outline" size={22} color={colors.primaryLight} />
                  <Text style={styles.quickLinkText}>Brochure</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                </Pressable>
                <Pressable style={({ pressed }: { pressed: boolean }) => [styles.quickLink, pressed && styles.quickLinkPressed]} onPress={() => navigation.navigate('ShareApp')}>
                  <Ionicons name="gift-outline" size={22} color="#10B981" />
                  <Text style={styles.quickLinkText}>Share &amp; earn</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                </Pressable>
                <Pressable style={({ pressed }: { pressed: boolean }) => [styles.quickLink, pressed && styles.quickLinkPressed]} onPress={() => navigation.navigate('Review', {})}>
                  <Ionicons name="star-outline" size={22} color="#F59E0B" />
                  <Text style={styles.quickLinkText}>Reviews</Text>
                  {reviewStats ? (
                    <Text style={styles.quickLinkCount}>{reviewStats.averageRating} ★</Text>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={styles.textLight} />
                  )}
                </Pressable>
              </View>

              {/* Default Vehicle */}
              {defaultVehicle && (
                <>
                  <Text style={styles.sectionTitle}>Default Vehicle</Text>
                  <TouchableOpacity style={styles.vehicleCard} onPress={() => navigation.navigate('Vehicles')}>
                    <View style={styles.vehicleIcon}>
                      <Ionicons name="car" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.vehicleInfo}>
                      <Text style={styles.vehicleName}>
                        {defaultVehicle.year} {defaultVehicle.make} {defaultVehicle.model}
                      </Text>
                      <Text style={styles.vehicleReg}>{defaultVehicle.registration}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                  </TouchableOpacity>
                </>
              )}

              {/* Recent Bookings */}
              {recentBookings.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Recent Bookings</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'BookingsTab' })}>
                      <Text style={styles.seeAll}>See All</Text>
                    </TouchableOpacity>
                  </View>
                  {recentBookings.map((b: any) => (
                    <View key={b._id} style={styles.bookingRow}>
                      <View style={[styles.bookingDot, { backgroundColor: STATUS_COLORS[b.status] ?? colors.textLight }]} />
                      <View style={styles.bookingInfo}>
                        <Text style={styles.bookingService}>{b.serviceType}</Text>
                        <Text style={styles.bookingDate}>{b.date} at {b.timeSlot}</Text>
                      </View>
                      <Text style={[styles.bookingStatus, { color: STATUS_COLORS[b.status] ?? colors.textLight }]}>
                        {String(b.status ?? 'pending').replace('_', ' ')}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {!upcoming && recentBookings.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={48} color={colors.textLight} />
                  <Text style={styles.emptyTitle}>No bookings yet</Text>
                  <Text style={styles.emptyText}>
                    Book your first service or browse our stock
                  </Text>
                </View>
              )}
            </ScrollView>
          </Animated.View>

          <Modal
            visible={staffPickerVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setStaffPickerVisible(false)}
          >
            <View style={styles.staffPickerOverlay}>
              <TouchableOpacity style={styles.staffPickerBackdrop} activeOpacity={1} onPress={() => setStaffPickerVisible(false)} />
              <View style={styles.staffPickerSheet}>
                <View style={styles.staffPickerHandle} />
                <View style={styles.staffPickerHeader}>
                  <View>
                    <Text style={styles.staffPickerTitle}>Online staff</Text>
                    <Text style={styles.staffPickerSubtitle}>Pick who you want to message. Chat stays private between you, that staff member, and admin.</Text>
                  </View>
                  <TouchableOpacity style={styles.staffPickerClose} onPress={() => setStaffPickerVisible(false)}>
                    <Ionicons name="close" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.staffPickerList}>
                  {availableStaff.length > 0 ? availableStaff.map((staff: any) => (
                    <TouchableOpacity
                      key={staff.key}
                      style={styles.staffPickerRow}
                      activeOpacity={0.9}
                      onPress={() => openStaffChat(staff)}
                    >
                      <View style={styles.staffPickerAvatarWrap}>
                        <UserAvatar uri={staff.profileImage} name={staff.name} size={48} backgroundColor="#E5F4F0" textColor={colors.primary} />
                        <View style={styles.staffPickerOnlineDot} />
                      </View>
                      <View style={styles.staffPickerInfo}>
                        <Text style={styles.staffPickerName}>{staff.name}</Text>
                        <Text style={styles.staffPickerRole}>{staff.roleLabel}</Text>
                        <Text style={styles.staffPickerDescription}>{staff.subtitle}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                    </TouchableOpacity>
                  )) : (
                    <View style={styles.staffPickerEmpty}>
                      <Ionicons name="alert-circle-outline" size={24} color={colors.textLight} />
                      <Text style={styles.staffPickerEmptyText}>No online staff are available right now.</Text>
                    </View>
                  )}
                </ScrollView>

                <TouchableOpacity
                  style={styles.staffPickerFooterBtn}
                  onPress={() => {
                    setStaffPickerVisible(false);
                    openCustomerMessages();
                  }}
                >
                  <Text style={styles.staffPickerFooterText}>Open messages</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal
            visible={dealershipPickerVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setDealershipPickerVisible(false)}
          >
            <View style={styles.staffPickerOverlay}>
              <TouchableOpacity style={styles.staffPickerBackdrop} activeOpacity={1} onPress={() => setDealershipPickerVisible(false)} />
              <View style={styles.staffPickerSheet}>
                <View style={styles.staffPickerHandle} />
                <View style={styles.staffPickerHeader}>
                  <View>
                    <Text style={styles.staffPickerTitle}>Available dealerships</Text>
                    <Text style={styles.staffPickerSubtitle}>Choose a dealership to see online staff and direct contact options.</Text>
                  </View>
                  <TouchableOpacity style={styles.staffPickerClose} onPress={() => setDealershipPickerVisible(false)}>
                    <Ionicons name="close" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.staffPickerList}>
                  {availableDealerships.length > 0 ? availableDealerships.map((dealership: any) => (
                    <TouchableOpacity key={dealership.key} style={styles.staffPickerRow} activeOpacity={0.9} onPress={() => {
                      setDealershipPickerVisible(false);
                      openCustomerMessages();
                    }}>
                      <View style={styles.staffPickerAvatarWrap}>
                        <View style={styles.staffPickerAvatar}>
                          <Ionicons name="business-outline" size={18} color={colors.primary} />
                        </View>
                      </View>
                      <View style={styles.staffPickerInfo}>
                        <Text style={styles.staffPickerName}>{dealership.name}</Text>
                        <Text style={styles.staffPickerRole}>{dealership.label}</Text>
                        <Text style={styles.staffPickerDescription}>{dealership.location}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                    </TouchableOpacity>
                  )) : (
                    <View style={styles.staffPickerEmpty}>
                      <Ionicons name="alert-circle-outline" size={24} color={colors.textLight} />
                      <Text style={styles.staffPickerEmptyText}>No dealerships are available right now.</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>

          <Modal
            visible={menuVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setMenuVisible(false)}
          >
            <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
              <View style={styles.menuSheet}>
                <Text style={styles.menuTitle}>Menu</Text>
                <View style={styles.menuGrid}>
                  <TouchableOpacity style={styles.menuCard} onPress={() => { setMenuVisible(false); navigation.navigate('Vehicles'); }}>
                    <Ionicons name="car-outline" size={18} color={colors.primary} />
                    <Text style={styles.menuCardText}>My Vehicles</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuCard} onPress={() => { setMenuVisible(false); navigation.navigate('Messages'); }}>
                    <Ionicons name="chatbubbles-outline" size={18} color={colors.success} />
                    <Text style={styles.menuCardText}>Direct messages</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuCard} onPress={() => openMessageCategory('serviceBookings')}>
                    <Ionicons name="construct-outline" size={18} color={colors.primary} />
                    <Text style={styles.menuCardText}>Service updates</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuCard} onPress={() => openMessageCategory('testDriveBookings')}>
                    <Ionicons name="speedometer-outline" size={18} color={colors.success} />
                    <Text style={styles.menuCardText}>Test drives</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuCard} onPress={() => { setMenuVisible(false); navigation.navigate('PartsOrders'); }}>
                    <Ionicons name="cube-outline" size={18} color="#EA580C" />
                    <Text style={styles.menuCardText}>Parts & accessories</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuCard} onPress={() => { setMenuVisible(false); navigation.navigate('MerchandiseHub'); }}>
                    <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
                    <Text style={styles.menuCardText}>Merchandise</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuCard} onPress={() => openMessageCategory('merchandiseOrders')}>
                    <Ionicons name="pricetag-outline" size={18} color={colors.primaryLight} />
                    <Text style={styles.menuCardText}>Merchandise orders</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuCard} onPress={() => openMessageCategory('financeApplications')}>
                    <Ionicons name="document-text-outline" size={18} color={colors.statusInProgress} />
                    <Text style={styles.menuCardText}>Finance updates</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuCard} onPress={() => { setMenuVisible(false); navigation.navigate('Calendar'); }}>
                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                    <Text style={styles.menuCardText}>Calendar & notes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuCard} onPress={() => openMessageCategory('referralWallet')}>
                    <Ionicons name="pulse" size={18} color="#8B5CF6" />
                    <Text style={styles.menuCardText}>Referral wallet</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuCard} onPress={() => { setMenuVisible(false); navigation.navigate('TestDriveBooking'); }}>
                    <Ionicons name="speedometer-outline" size={18} color={colors.success} />
                    <Text style={styles.menuCardText}>Test Drive Bookings</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuCard} onPress={() => { setMenuVisible(false); navigation.navigate('Rewards'); }}>
                    <Ionicons name="gift-outline" size={18} color="#10B981" />
                    <Text style={styles.menuCardText}>Rewards</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Modal>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  homeWallpaper: { flex: 1 },
  homeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 8, 20, 0.22)',
  },
  safe: { flex: 1, backgroundColor: 'transparent' },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  motionWrap: { flex: 1 },
  cardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  greeting: { fontSize: 24, fontWeight: '800', color: colors.text },
  subGreeting: { fontSize: 14, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  staffAvailabilityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 23,
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '25',
  },
  staffAvailabilityTextWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  staffAvailabilityBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
  },
  staffAvailabilitySubtext: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  staffAvailabilityCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  staffAvailabilityCountText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.white,
  },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: colors.white },
  carModeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Available staff card
  availableStaffCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 24,
    padding: 18,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  availableStaffTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  availableStaffIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  availableStaffTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  availableStaffSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 3, lineHeight: 18, fontWeight: '500' },
  availableStaffDealership: { fontSize: 11, color: colors.primary, marginTop: 4, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  availableStaffActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '14',
    borderWidth: 1,
    borderColor: colors.primary + '20',
  },
  availableStaffAction: { fontSize: 13, fontWeight: '900', color: colors.primary },
  // Primary actions
  primaryActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 84,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  primaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 20,
  },
  merchandiseQuickRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  merchandiseQuickCard: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  merchandiseQuickTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },
  merchandiseQuickText: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  featuredMainBlock: {
    marginBottom: spacing.xl,
  },
  featuredMainRow: {
    gap: 12,
    paddingRight: spacing.lg,
  },
  featuredMainCard: {
    width: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  featuredMainImage: {
    width: '100%',
    height: 110,
  },
  featuredMainPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    gap: 6,
  },
  featuredMainPlaceholderText: {
    fontSize: 11,
    color: colors.textLight,
  },
  featuredMainBody: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  featuredMainBrand: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  featuredMainTitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  featuredMainPrice: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
  },
  // Staff availability
  staffAvailabilityCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  staffCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  staffCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffCardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  staffCardSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  staffCardAction: { fontSize: 13, fontWeight: '700', color: colors.primaryLight },
  staffPillsRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  staffPill: {
    width: 260,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  staffPillAvatarWrap: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  staffPillAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E5F4F0',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  staffPillAvatarImage: {
    width: '100%',
    height: '100%',
  },
  staffPillAvatarText: { fontSize: 16, fontWeight: '800', color: colors.primary },
  staffUnreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  staffUnreadBadgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  staffPillName: { fontSize: 14, fontWeight: '800', color: colors.text },
  staffPillMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  staffPillDealer: { fontSize: 10, color: colors.primary, marginTop: 2, fontWeight: '700' },
  staffPickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  staffPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  staffPickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    maxHeight: '78%',
    borderTopWidth: 1,
    borderColor: colors.borderLight,
  },
  staffPickerHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.borderLight,
    marginBottom: spacing.md,
  },
  staffPickerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  staffPickerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  staffPickerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  staffPickerClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffPickerList: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  staffPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.sm,
  },
  staffPickerAvatarWrap: {
    width: 48,
    height: 48,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffPickerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E5F4F0',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  staffPickerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  staffPickerOnlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  staffPickerInfo: {
    flex: 1,
  },
  staffPickerName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  staffPickerRole: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryLight,
  },
  staffPickerDescription: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  staffPickerEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: 8,
  },
  staffPickerEmptyText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  staffPickerFooterBtn: {
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  staffPickerFooterText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  menuOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
    paddingTop: 92,
    paddingRight: spacing.lg,
  },
  menuSheet: {
    width: 280,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  menuTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  menuCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  menuCardText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  // Upcoming
  upcomingCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  upcomingLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
  },
  upcomingService: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  upcomingDetails: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  upcomingDetail: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  upcomingText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  // Quick links
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  quickLinks: {
    gap: spacing.sm,
    marginBottom: spacing.xxl,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  quickLink: {
    width: '48%',
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  quickLinkPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  quickLinkText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  quickLinkCount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  quickLinkBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
    backgroundColor: colors.error,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  // Vehicle
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  vehicleIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleInfo: { flex: 1 },
  vehicleName: { fontSize: 15, fontWeight: '700', color: colors.text },
  vehicleReg: { fontSize: 13, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  // Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  seeAll: { fontSize: 14, fontWeight: '600', color: colors.primaryLight },
  // Bookings
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  bookingDot: { width: 10, height: 10, borderRadius: 5 },
  bookingInfo: { flex: 1 },
  bookingService: { fontSize: 14, fontWeight: '700', color: colors.text },
  bookingDate: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  bookingStatus: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: spacing.lg },
  emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', fontWeight: '500' },
  reviewPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FEF3C7', borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: '#F59E0B' + '30',
  },
  reviewPromptIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#F59E0B' + '20',
    justifyContent: 'center', alignItems: 'center',
  },
  reviewPromptTitle: { fontSize: 15, fontWeight: '800', color: '#92400E' },
  reviewPromptDesc: { fontSize: 12, color: '#B45309', marginTop: 2, fontWeight: '500' },
  loadingCard: {
    width: '84%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  animatedCard: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  shuffleBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  shuffleBtnActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary + '30',
  },
});