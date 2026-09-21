import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Animated, StyleSheet, View, Text, Platform, TouchableOpacity, ScrollView, Linking, Image, ImageBackground } from 'react-native';
declare const require: (path: string) => any;
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Authenticated, Unauthenticated, AuthLoading, useQuery, useMutation } from 'convex/react';
import { Ionicons } from '@expo/vector-icons';
const Notifications = Platform.OS === 'web'
  ? null
  : (() => {
      try {
        return require('expo-notifications');
      } catch {
        return null;
      }
    })();
const splashLogo = require('./assets/pasted-image-2026-06-13T16-39-59-899Z.png');
const appBackgroundImage = require('./assets/WhatsApp Image 2026-05-06 at 10.25.35 AM.jpeg');
const hyundaiSplashLogo = require('./assets/hyunda service hub (1) (1).png');
const kiaSplashLogo = require('./assets/kia connet (1).png');

import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import BookingsListScreen from './screens/BookingsListScreen';
import ProfileScreen from './screens/ProfileScreen';
import ProfileEditScreen from './screens/ProfileEditScreen';
import SocialFeedScreen from './screens/SocialFeedScreen';
import NewBookingScreen from './screens/NewBookingScreen';
import TestDriveBookingScreen from './screens/TestDriveBookingScreen';
import VehiclesScreen from './screens/VehiclesScreen';
import CarModeScreen from './screens/CarModeScreen';
import InventoryScreen from './screens/InventoryScreen';
import CustomerStockScreen from './screens/CustomerStockScreen';
import StaffScreen from './screens/StaffScreen';
import StaffDashboardScreen from './screens/StaffDashboardScreen';
import StaffBookingDetailScreen from './screens/StaffBookingDetailScreen';
import StaffMessagesScreen from './screens/StaffMessagesScreen';
import StaffBookingInboxScreen from './screens/StaffBookingInboxScreen';
import StaffChatScreen from './screens/StaffChatScreen';
import PartsOrdersScreen from './screens/PartsOrdersScreen';
import DriverSchedulesScreen from './screens/DriverSchedulesScreen';
import AdminScreen from './screens/AdminScreen';
import AIChatScreen from './screens/AIChatScreen';
import FinanceApplicationScreen from './screens/FinanceApplicationScreen';
import FinanceApplicationDetailScreen from './screens/FinanceApplicationDetailScreen';
import FinanceApplicationsScreen from './screens/FinanceApplicationsScreen';
import RewardsScreen from './screens/RewardsScreen';
import ShareScreen from './screens/ShareScreen';
import ReviewScreen from './screens/ReviewScreen';
import StaffAnalyticsScreen from './screens/StaffAnalyticsScreen';
import ConnectedAccountsScreen from './screens/ConnectedAccountsScreen';
import StaffWalletScreen from './screens/StaffWalletScreen';
import CustomerManagementScreen from './screens/CustomerManagementScreen';
import UsersScreen from './screens/UsersScreen';
import ActivityFeedScreen from './screens/ActivityFeedScreen';
import CompareVehiclesScreen from './screens/CompareVehiclesScreen';
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen';
import BookingDetailScreen from './screens/BookingDetailScreen';
import CustomerProfileScreen from './screens/CustomerProfileScreen';
import TermsOfServiceScreen from './screens/TermsOfServiceScreen';
import LandingScreen from './screens/LandingScreen';
import ContactUsScreen from './screens/ContactUsScreen';
import CalendarScreen from './screens/CalendarScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import EventsScreen from './screens/EventsScreen';
import GroupsScreen from './screens/GroupsScreen';
import LiveWidgetScreen from './screens/LiveWidgetScreen';
import StaffProfileScreen from './screens/StaffProfileScreen';
import HyundaiMerchandiseScreen from './screens/HyundaiMerchandiseScreen';
import KiaMerchandiseScreen from './screens/KiaMerchandiseScreen';
import MerchandiseScreen from './screens/MerchandiseScreen';
import MerchandiseOrdersScreen from './screens/MerchandiseOrdersScreen';
import BrochureManagerScreen from './screens/BrochureManagerScreen';
import TradeInScreen from './screens/TradeInScreen';
import { api } from './lib/api';
import { colors, radius, fonts } from './lib/theme';
import { buildPublicUrl } from './lib/shareUtils';
import { subscribeToast, type ToastPayload } from './lib/toast';
import { trackScreenView } from './lib/analytics';
import { getNotificationMessageCategoryKey, getMessageCategoryRoute } from './lib/messageCategories';

function parseAppLink(rawUrl?: string | null) {
  if (!rawUrl) {
    return { vehicleId: null as string | null, postId: null as string | null, merchandiseItemId: null as string | null };
  }

  const vehicleId = rawUrl.match(/[?&](?:vehicle|sharedVehicleId)=([^&#]+)/)?.[1] ?? null;
  const postId = rawUrl.match(/[?&]postId=([^&#]+)/)?.[1] ?? null;
  const merchandiseItemId = rawUrl.match(/[?&]merchandiseItemId=([^&#]+)/)?.[1] ?? null;
  return {
    vehicleId: vehicleId ? decodeURIComponent(vehicleId) : null,
    postId: postId ? decodeURIComponent(postId) : null,
    merchandiseItemId: merchandiseItemId ? decodeURIComponent(merchandiseItemId) : null,
  };
}

function getRouteFromNotificationData(data: any) {
  const targetRoute = String(data?.targetRoute ?? data?.screen ?? '').trim();
  const directPeerId = String(data?.senderId ?? '').trim();
  const targetId = String(data?.targetId ?? data?.partsOrderId ?? data?.bookingId ?? data?.financeApplicationId ?? '').trim();
  const isStaffUser = String(data?.targetAudience ?? '').toLowerCase() === 'staff' || Boolean(data?.isStaffUser);
  const categoryKey = getNotificationMessageCategoryKey(data, isStaffUser);

  if (categoryKey === 'merchandiseOrders') {
    const categoryRoute = getMessageCategoryRoute(categoryKey, isStaffUser);
    return { route: categoryRoute.route, params: categoryRoute.params };
  }

  if (data?.type === 'new_message' || targetRoute === 'Messages' || targetRoute === 'StaffChat') {
    if (categoryKey) {
      const categoryRoute = getMessageCategoryRoute(categoryKey, isStaffUser);
      return { route: categoryRoute.route, params: categoryRoute.params };
    }

    if (data?.bookingId || targetRoute === 'StaffBookingDetail') {
      return { route: 'StaffBookingDetail', params: data?.bookingId ? { bookingId: String(data.bookingId) } : targetId ? { bookingId: targetId } : undefined };
    }

    if (directPeerId) {
      return { route: 'StaffChat', params: { customerId: directPeerId, recipientId: directPeerId } };
    }
  }

  if (
    targetRoute === 'PartsOrders' ||
    targetRoute === 'PartsOrder' ||
    data?.type === 'parts_order_received' ||
    data?.type === 'parts_order_quote' ||
    data?.type === 'parts_order_available' ||
    data?.type === 'parts_order_payment_proof_submitted' ||
    data?.type === 'parts_order_payment_confirmed' ||
    data?.type === 'parts_order_completed' ||
    data?.type === 'parts_order_assigned'
  ) {
    return { route: 'PartsOrders', params: targetId ? { partsOrderId: targetId } : undefined };
  }

  if (targetRoute === 'StaffChat' && targetId) {
    return { route: 'StaffChat', params: { customerId: targetId, recipientId: targetId } };
  }

  if (targetRoute === 'Messages') {
    return { route: 'Messages', params: undefined };
  }

  if (targetRoute === 'StaffInbox' || targetRoute === 'BookingDetail' || data?.bookingId) {
    return { route: targetRoute === 'StaffInbox' ? 'StaffInbox' : 'BookingDetail', params: data?.bookingId ? { bookingId: String(data.bookingId) } : targetId ? { bookingId: targetId } : undefined };
  }

  if (targetRoute === 'FinanceApplicationDetail' || data?.financeApplicationId) {
    const applicationId = String(data?.financeApplicationId ?? targetId ?? '').trim();
    return { route: applicationId ? 'FinanceApplicationDetail' : 'FinanceApplications', params: applicationId ? { applicationId, isStaff: true } : undefined };
  }

  if (targetRoute === 'CustomerProfile' && targetId) {
    return { route: 'CustomerProfile', params: { userId: targetId } };
  }

  if (targetRoute === 'ActivityFeed') return { route: 'ActivityFeed', params: undefined };
  if (targetRoute === 'SocialFeed' || data?.postId) return { route: 'SocialFeed', params: undefined };
  return null;
}

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

type SharedMerchandiseRouteProps = {
  sharedMerchandiseItemId?: string | null;
  navigation: any;
  route: any;
};

function CustomerMerchandiseRoute(props: any) {
  return <MerchandiseScreen {...props} mode="customer" />;
}

function StaffMerchandiseRoute({ sharedMerchandiseItemId, ...props }: SharedMerchandiseRouteProps) {
  return (
    <MerchandiseScreen
      {...props}
      mode="staff"
      route={{
        ...(props.route ?? {}),
        params: {
          ...(props.route?.params ?? {}),
          itemId: sharedMerchandiseItemId ?? props.route?.params?.itemId ?? null,
        },
      }}
    />
  );
}

function CustomerPartsOrdersRoute(props: any) {
  return <PartsOrdersScreen {...props} mode="customer" />;
}

function StaffPartsOrdersRoute(props: any) {
  return <PartsOrdersScreen {...props} mode="staff" />;
}

type StaffSectionKey =
  | 'inbox'
  | 'dealership'
  | 'customerDatabase'
  | 'inventory'
  | 'financeApplication'
  | 'financeApplications'
  | 'serviceBookings'
  | 'calendarNotes'
  | 'events'
  | 'testDriveBookings'
  | 'enquiries'
  | 'analytics'
  | 'staffManagement'
  | 'userModeration'
  | 'staffProfile'
  | 'notifications'
  | 'adminConsole'
  | 'socialFeed'
  | 'socialDevelopment'
  | 'partsOrders'
  | 'groups'
  | 'merchandise'
  | 'merchandiseOrders'
  | 'staffMain';

type StaffMenuItem = {
  key: StaffSectionKey;
  label: string;
  description: string;
  icon: string;
  route: string;
  moderatorOnly?: boolean;
};

const STAFF_MENU_ITEMS: StaffMenuItem[] = [
  {
    key: 'staffMain' as StaffSectionKey,
    label: 'Staff Main',
    description: 'Dashboard and overview',
    icon: 'grid-outline',
    route: 'StaffMain',
  },
  {
    key: 'adminConsole',
    label: 'Admin Panel',
    description: 'Bookings management and admin tools',
    icon: 'shield-checkmark',
    route: 'AdminConsole',
    moderatorOnly: true,
  },
  {
    key: 'staffProfile',
    label: 'Staff Profile',
    description: 'Staff profile and settings',
    icon: 'person-circle',
    route: 'StaffProfile',
  },
  {
    key: 'inbox',
    label: 'Messages',
    description: 'Messages from staff and customers',
    icon: 'chatbubble-ellipses-outline',
    route: 'StaffMessages',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    description: 'Activity alerts across the app',
    icon: 'notifications',
    route: 'Notifications',
  },
  {
    key: 'socialFeed' as StaffSectionKey,
    label: 'Social Feed',
    description: 'Open staff and customer feed posts',
    icon: 'newspaper-outline',
    route: 'SocialFeed',
  },
  {
    key: 'customerDatabase',
    label: 'Customer Database',
    description: 'Search customer records fast',
    icon: 'people-circle',
    route: 'CustomerManagement',
  },
  {
    key: 'userModeration',
    label: 'Users',
    description: 'Moderate users and reports',
    icon: 'person-remove',
    route: 'Users',
    moderatorOnly: true,
  },
  {
    key: 'financeApplications',
    label: 'Finance Applications',
    description: 'View submitted finance applications',
    icon: 'document-text',
    route: 'FinanceApplications',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    description: 'View and load vehicle stock',
    icon: 'car-sport',
    route: 'InventoryScreen',
  },
  {
    key: 'partsOrders' as StaffSectionKey,
    label: 'Parts & Accessories',
    description: 'Manage parts and accessory orders',
    icon: 'cube-outline',
    route: 'PartsOrders',
  },
  {
    key: 'serviceBookings',
    label: 'Service Bookings',
    description: 'Track service appointments',
    icon: 'calendar',
    route: 'StaffInbox',
  },
  {
    key: 'calendarNotes',
    label: 'Calendar & Notes',
    description: 'Manage notes, reminders, and tasks',
    icon: 'calendar-outline',
    route: 'Calendar',
  },
  {
    key: 'events',
    label: 'Events',
    description: 'Live customer and staff events',
    icon: 'sparkles',
    route: 'Events',
  },
  {
    key: 'groups' as StaffSectionKey,
    label: 'Groups',
    description: 'Staff and customer group feeds',
    icon: 'people-outline',
    route: 'Groups',
  },
  {
    key: 'socialDevelopment' as StaffSectionKey,
    label: 'Social Development Programmes',
    description: 'Community initiatives and programmes',
    icon: 'leaf-outline',
    route: 'Initiatives',
  },
  {
    key: 'merchandise' as StaffSectionKey,
    label: 'Merchandise Upload',
    description: 'Upload and manage Hyundai and Kia merchandise',
    icon: 'pricetag-outline',
    route: 'MerchandiseHub',
  },
  {
    key: 'merchandiseOrders' as StaffSectionKey,
    label: 'Merchandise Orders',
    description: 'Review and manage merchandise orders',
    icon: 'receipt-outline',
    route: 'MerchandiseOrders',
  },
  {
    key: 'testDriveBookings',
    label: 'Test Drive Bookings',
    description: 'Manage test drive slots',
    icon: 'car-sport',
    route: 'StaffTestDriveBookings',
  },
  {
    key: 'enquiries',
    label: 'Enquiries',
    description: 'Review new sales leads',
    icon: 'help-circle',
    route: 'ActivityFeed',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    description: 'See activity and performance',
    icon: 'stats-chart',
    route: 'StaffAnalytics',
    moderatorOnly: true,
  },
];

const STAFF_QUICK_ACTIONS: StaffMenuItem[] = [
  {
    key: 'staffManagement',
    label: 'Staff Management',
    description: 'Manage staff members only',
    icon: 'shield-checkmark',
    route: 'Staff',
  },
  {
    key: 'customerDatabase',
    label: 'Customer Database',
    description: 'Search customer records fast',
    icon: 'people-circle',
    route: 'CustomerManagement',
  },
  {
    key: 'merchandise' as StaffSectionKey,
    label: 'Merchandise Upload',
    description: 'Upload and manage Hyundai and Kia merchandise',
    icon: 'pricetag-outline',
    route: 'MerchandiseHub',
  },
  {
    key: 'merchandiseOrders' as StaffSectionKey,
    label: 'Merchandise Orders',
    description: 'Review and manage merchandise orders',
    icon: 'receipt-outline',
    route: 'MerchandiseOrders',
  },
  {
    key: 'userModeration',
    label: 'User Moderation',
    description: 'Moderate users and reports',
    icon: 'person-remove',
    route: 'Users',
    moderatorOnly: true,
  },
];

function isModeratorUser(user: any) {
  return Boolean(
    user?.isOwner ||
    String(user?.role ?? '').trim().toLowerCase() === 'admin' ||
    String(user?.email ?? '').toLowerCase() === 'vincentmm@hyundai.co.za' ||
    user?.staffRole === 'dp' ||
    user?.staffRole === 'moderator' ||
    user?.staffRole === 'regional' ||
    user?.staffRole === 'regional_manager' ||
    user?.accessLevel === 'full_access'
  );
}

function getStaffRoleKey(user: any) {
  return String(user?.staffRole ?? user?.role ?? '').trim().toLowerCase();
}

function getStaffMenuItems(user: any) {
  const isModerator = isModeratorUser(user);
  const roleKey = getStaffRoleKey(user);

  if (isModerator) {
    return STAFF_MENU_ITEMS.filter((item) => !item.moderatorOnly || isModerator);
  }

  if (roleKey === 'sales' || roleKey === 'sales_executive') {
    const allowedKeys = new Set<StaffSectionKey>([
      'staffMain',
      'staffProfile',
      'inbox',
      'notifications',
      'socialFeed',
      'customerDatabase',
      'financeApplications',
      'testDriveBookings',
      'enquiries',
    ]);
    return STAFF_MENU_ITEMS.filter((item) => allowedKeys.has(item.key) && !item.moderatorOnly);
  }

  const allowedKeys = new Set<StaffSectionKey>([
    'staffMain',
    'staffProfile',
    'inbox',
    'notifications',
    'socialFeed',
    'customerDatabase',
    'financeApplications',
    'serviceBookings',
    'calendarNotes',
    'events',
    'partsOrders',
    'testDriveBookings',
    'enquiries',
    'groups',
    'merchandise',
    'merchandiseOrders',
  ]);

  return STAFF_MENU_ITEMS.filter((item) => allowedKeys.has(item.key) && !item.moderatorOnly);
}

function getStaffQuickActions(user: any) {
  const isModerator = isModeratorUser(user);
  const roleKey = getStaffRoleKey(user);

  if (isModerator) {
    return STAFF_QUICK_ACTIONS.filter((item) => !item.moderatorOnly || isModerator);
  }

  if (roleKey === 'sales' || roleKey === 'sales_executive') {
    return STAFF_QUICK_ACTIONS.filter((item) => item.key === 'customerDatabase');
  }

  return STAFF_QUICK_ACTIONS.filter((item) => item.key === 'staffManagement' || item.key === 'customerDatabase' || !item.moderatorOnly);
}

function useUnifiedUnreadCount() {
  const notificationUnread = useQuery(api.notifications.getUnreadCount) ?? 0;
  const conversations = useQuery(api.messages.listMyConversations) ?? [];
  const conversationUnread = conversations.reduce((total: number, thread: any) => total + (thread.unreadCount ?? 0), 0);
  return Math.max(notificationUnread, conversationUnread);
}

// ---- BADGE COMPONENT ----
function BadgeIcon({ name, color, size, count }: { name: string; color: string; size: number; count: number }) {
  return (
    <View>
      <Ionicons name={name as any} size={size} color={color} />
      {count > 0 && (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </View>
  );
}

function SkeletonBlock({ width = '100%', height = 16, radius: r = 12, style }: { width?: number | string; height?: number; radius?: number; style?: any }) {
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.95, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: colors.borderLight, opacity: pulse }, style]} />;
}

function createStackScreenOptions(homeRoute: string, unreadCount: number) {
  return ({ navigation }: any) => ({
    headerShown: true,
    headerTitleAlign: 'center',
    headerShadowVisible: false,
    contentStyle: {
      backgroundColor: 'transparent',
    },
    headerStyle: {
      backgroundColor: colors.surface,
    },
    headerTintColor: colors.text,
    headerTitleStyle: {
      fontWeight: '800',
      fontSize: 16,
    },
    headerLeft: () => (
      <TouchableOpacity
        onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate(homeRoute))}
        style={styles.headerNavButton}
      >
        <Ionicons name={navigation.canGoBack() ? 'arrow-back' : 'home'} size={22} color={colors.text} />
      </TouchableOpacity>
    ),
    headerRight: () => (
      <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.headerNavButton}>
        <BadgeIcon name="notifications" color={colors.text} size={22} count={unreadCount} />
      </TouchableOpacity>
    ),
    headerBackground: () => <Animated.View style={styles.headerMotionBg} />,
  });
}

// ---- CUSTOMER TABS ----
function CustomerTabs({ sharedVehicleId, sharedMerchandiseItemId }: { sharedVehicleId: string | null; sharedMerchandiseItemId: string | null }) {
  const unread = useUnifiedUnreadCount();
  const tabBarEnter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(tabBarEnter, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [tabBarEnter]);

  return (
    <Animated.View style={{ flex: 1, opacity: tabBarEnter, transform: [{ translateY: tabBarEnter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
      <Tab.Navigator
        initialRouteName={sharedMerchandiseItemId ? 'MerchandiseTab' : sharedVehicleId ? 'StockTab' : 'FeedTab'}
        screenOptions={{
          headerShown: false,
          lazy: true,
          detachInactiveScreens: true,
          freezeOnBlur: true,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textLight,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.borderLight,
            paddingBottom: 6,
            paddingTop: 6,
            height: 62,
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: -6 },
            elevation: 12,
          },
          tabBarItemStyle: { paddingVertical: 4 },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
          sceneContainerStyle: {
            backgroundColor: 'transparent',
          },
        }}
      >
        <Tab.Screen
          name="FeedTab"
          component={SocialFeedScreen}
          options={{
            tabBarLabel: 'Feed',
            tabBarIcon: (props: { color: string; size: number }) => (
              <Ionicons name="newspaper" size={props.size} color={props.color} />
            ),
          }}
        />
        <Tab.Screen
          name="HomeTab"
          component={HomeScreen}
          options={{
            tabBarLabel: 'Home',
            tabBarIcon: (props: { color: string; size: number }) => (
              <Ionicons name="home" size={props.size} color={props.color} />
            ),
          }}
        />
        <Tab.Screen
          name="StockTab"
          component={(props: any) => <CustomerStockScreen {...props} sharedVehicleId={props.route?.params?.sharedVehicleId ?? sharedVehicleId} />}
          options={{
            tabBarLabel: 'Stock',
            tabBarIcon: (props: { color: string; size: number }) => (
              <Ionicons name="car-sport" size={props.size} color={props.color} />
            ),
          }}
        />
        <Tab.Screen
          name="MerchandiseTab"
          component={CustomerMerchandiseRoute}
          initialParams={{ brand: 'Hyundai' }}
          options={{
            tabBarLabel: 'Merchandise',
            tabBarIcon: (props: { color: string; size: number }) => (
              <Ionicons name="pricetag-outline" size={props.size} color={props.color} />
            ),
          }}
        />
        <Tab.Screen
          name="PartsOrdersTab"
          component={CustomerPartsOrdersRoute}
          options={{
            tabBarLabel: 'Parts & Accessories',
            tabBarIcon: (props: { color: string; size: number }) => (
              <Ionicons name="cube-outline" size={props.size} color={props.color} />
            ),
          }}
        />
        <Tab.Screen
          name="BookingsTab"
          component={BookingsListScreen}
          options={{
            tabBarLabel: 'Bookings',
            tabBarIcon: (props: { color: string; size: number }) => (
              <Ionicons name="calendar" size={props.size} color={props.color} />
            ),
          }}
        />
        <Tab.Screen
          name="ProfileTab"
          component={ProfileScreen}
          options={{
            tabBarLabel: 'Profile',
            tabBarIcon: (props: { color: string; size: number }) => (
              <BadgeIcon name="person" color={props.color} size={props.size} count={unread} />
            ),
          }}
        />
      </Tab.Navigator>
    </Animated.View>
  );
}

function CustomerStack({ sharedVehicleId, sharedMerchandiseItemId }: { sharedVehicleId: string | null; sharedMerchandiseItemId: string | null }) {
  const unread = useUnifiedUnreadCount();
  const notificationUnread = useQuery(api.notifications.getUnreadCount) ?? 0;

  return (
    <Stack.Navigator screenOptions={createStackScreenOptions('Main', notificationUnread)}>
      <Stack.Screen name="Main">{() => <CustomerTabs sharedVehicleId={sharedVehicleId} sharedMerchandiseItemId={sharedMerchandiseItemId} />}</Stack.Screen>
      <Stack.Screen name="CustomerStaff" component={StaffScreen} />
      <Stack.Screen name="SocialFeed" component={SocialFeedScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NewBooking" component={NewBookingScreen} />
      <Stack.Screen name="TestDriveBooking" component={TestDriveBookingScreen} />
      <Stack.Screen name="Vehicles" component={VehiclesScreen} />
      <Stack.Screen name="CarMode" component={CarModeScreen} options={{ animation: 'fade' }} />
      <Stack.Screen
        name="Notifications"
        options={{ presentation: 'modal' }}
      >
        {(props: any) => <NotificationsScreen {...props} />}
      </Stack.Screen>
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
      <Stack.Screen
        name="Messages"
        options={{
          presentation: 'modal',
        }}
      >
        {(props: any) => <StaffMessagesScreen {...props} />}
      </Stack.Screen>
      <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} />
      <Stack.Screen name="AIChat" component={AIChatScreen} />
      <Stack.Screen name="StaffChat" component={StaffChatScreen} />
      <Stack.Screen name="FinanceApplication" component={FinanceApplicationScreen} />
      <Stack.Screen name="FinanceApplicationDetail" component={FinanceApplicationDetailScreen} />
      <Stack.Screen name="FinanceApplications" component={FinanceApplicationsScreen} />
      <Stack.Screen name="AdminConsole" component={AdminScreen} />
      <Stack.Screen name="Rewards" component={RewardsScreen} />
      <Stack.Screen name="ShareApp" component={ShareScreen} />
      <Stack.Screen name="Review" component={ReviewScreen} />
      <Stack.Screen name="StaffAnalytics" component={StaffAnalyticsScreen} />
      <Stack.Screen name="ConnectedAccounts" component={ConnectedAccountsScreen} />
      <Stack.Screen name="StaffWallet" component={StaffWalletScreen} />
      <Stack.Screen name="BrochureManager" component={BrochureManagerScreen} />
      <Stack.Screen name="TradeIn" component={TradeInScreen} />
      <Stack.Screen name="TradeInSubmissions" component={TradeInScreen} options={{ title: 'Submitted Trade-Ins' }} />
      <Stack.Screen name="CustomerManagement" component={CustomerManagementScreen} />
      <Stack.Screen name="Users" component={UsersScreen} />
      <Stack.Screen name="CompareVehicles" component={CompareVehiclesScreen} />
      <Stack.Screen name="ContactUs" component={ContactUsScreen} />
      <Stack.Screen name="Calendar" component={CalendarScreen} />
      <Stack.Screen name="Events" component={EventsScreen} />
      <Stack.Screen name="Groups" component={GroupsScreen} />
      <Stack.Screen name="MerchandiseHub" component={CustomerMerchandiseRoute} options={{ title: 'Merchandise Hub' }} />
      <Stack.Screen name="MerchandiseOrders" component={MerchandiseOrdersScreen} options={{ title: 'Merchandise Orders' }} />
      <Stack.Screen name="HyundaiMerchandise" component={HyundaiMerchandiseScreen} options={{ title: 'Hyundai Merchandise' }} />
      <Stack.Screen name="KiaMerchandise" component={KiaMerchandiseScreen} options={{ title: 'Kia Merchandise' }} />
      <Stack.Screen name="NewsWidget" component={LiveWidgetScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WeatherWidget" component={LiveWidgetScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MarketsWidget" component={LiveWidgetScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SuggestedAccounts" component={LiveWidgetScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Competition" component={LiveWidgetScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Initiatives" component={SocialFeedScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ActivityFeed" component={ActivityFeedScreen} />
      <Stack.Screen name="PartsOrders" component={CustomerPartsOrdersRoute} />
      <Stack.Screen name="DriverSchedules" component={DriverSchedulesScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
    </Stack.Navigator>
  );
}

function StaffHubScreen({ navigation }: any) {
  const me = useQuery(api.users.me);
  const [expanded, setExpanded] = useState(true);
  const drawerAnim = useRef(new Animated.Value(1)).current;
  const isModerator = isModeratorUser(me);
  const dealershipLabel = me?.dealershipName ? `${me.dealershipName}${me.dealershipLocation ? ` • ${me.dealershipLocation}` : ''}` : 'No dealership assigned';

  useEffect(() => {
    Animated.timing(drawerAnim, {
      toValue: expanded ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [expanded, drawerAnim]);

  const drawerWidth = expanded ? 300 : 84;

  const contentOpacity = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });

  const drawerShift = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, 0],
  });

  const renderAction = (item: StaffMenuItem) => {
    if (item.moderatorOnly && !isModerator) return null;
    const isFeaturedMerchandise = item.key === 'merchandise';

    return (
      <TouchableOpacity
        key={item.key}
        style={[styles.staffMenuItem, isFeaturedMerchandise && styles.staffMenuItemFeatured]}
        onPress={() => navigation.navigate(item.route)}
      >
        <View style={[styles.staffMenuIconWrap, isFeaturedMerchandise && styles.staffMenuIconWrapFeatured]}>
          <Ionicons name={item.icon as any} size={20} color={isFeaturedMerchandise ? colors.warning : colors.primary} />
        </View>
        {expanded ? (
          <View style={styles.staffMenuTextWrap}>
            <Text style={styles.staffMenuLabel}>{item.label}</Text>
            <Text style={styles.staffMenuDescription} numberOfLines={1}>
              {item.description}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.staffShellContainer}>
      <SafeAreaView edges={['top']} style={styles.staffShellSafe}>
        <View style={styles.staffShellHeader}>
          <TouchableOpacity onPress={() => setExpanded((value: boolean) => !value)} style={styles.staffShellIconBtn}>
            <Ionicons name={expanded ? 'chevron-back' : 'menu'} size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.staffShellTitle}>Staff</Text>
            <Text style={styles.staffShellSubtitle} numberOfLines={1}>
              {me?.displayName || me?.name || me?.email || 'Staff'} • {dealershipLabel}
            </Text>
          </View>
          <View style={styles.staffShellRolePill}>
            <Text style={styles.staffShellRoleText}>{isModerator ? 'Moderator' : 'Staff'}</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.staffShellBodyScroll}
        contentContainerStyle={styles.staffShellBody}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <Animated.View style={[styles.staffDrawer, { width: drawerWidth, opacity: contentOpacity, transform: [{ translateX: drawerShift }] }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.staffDrawerContent}>
            <Text style={styles.staffDrawerHeading}>{expanded ? 'Dealership' : ' '}</Text>
            <TouchableOpacity style={styles.staffMenuItem} onPress={() => navigation.navigate('Staff')}>
              <View style={styles.staffMenuIconWrap}>
                <Ionicons name="business" size={20} color={colors.primary} />
              </View>
              {expanded ? (
                <View style={styles.staffMenuTextWrap}>
                  <Text style={styles.staffMenuLabel}>Dealership</Text>
                  <Text style={styles.staffMenuDescription} numberOfLines={1}>
                    Staff, allocation, and branch structure
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>

            <View style={styles.staffDivider} />
            <Text style={styles.staffDrawerHeading}>{expanded ? 'Navigate' : ' '}</Text>
            {getStaffMenuItems(me).map(renderAction)}

            <View style={styles.staffDivider} />
            <Text style={styles.staffDrawerHeading}>{expanded ? 'Moderation' : ' '}</Text>
            {getStaffQuickActions(me).map(renderAction)}
          </ScrollView>
        </Animated.View>

        <Animated.View style={[styles.staffShellContent, { opacity: contentOpacity }]}>
          <View style={styles.staffShellCard}>
            <View style={styles.staffShellCardTop}>
              <View style={styles.staffShellCardIcon}>
                <Ionicons name="layers-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.staffShellCardTitle}>Pick a section</Text>
                <Text style={styles.staffShellCardText}>Quick access to staff tools, customer work, and moderation.</Text>
              </View>
            </View>
            <View style={styles.staffShellHintsRow}>
              <View style={styles.staffHintPill}>
                <Text style={styles.staffHintText}>Fast access</Text>
              </View>
              <View style={styles.staffHintPill}>
                <Text style={styles.staffHintText}>Simple layout</Text>
              </View>
              <View style={styles.staffHintPill}>
                <Text style={styles.staffHintText}>Role-safe</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function StaffStack({ sharedMerchandiseItemId }: { sharedMerchandiseItemId: string | null }) {
  const unread = useUnifiedUnreadCount();
  const notificationUnread = useQuery(api.notifications.getUnreadCount) ?? 0;

  return (
    <Stack.Navigator initialRouteName={sharedMerchandiseItemId ? 'MerchandiseHub' : 'SocialFeed'} screenOptions={createStackScreenOptions('SocialFeed', notificationUnread)}>
      <Stack.Screen name="StaffMain">
        {(props: any) => <StaffDashboardScreen {...props} />}
      </Stack.Screen>
      <Stack.Screen name="SocialFeed" component={SocialFeedScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Staff" component={StaffScreen} />
      <Stack.Screen name="StaffManagement" component={StaffScreen} />
      <Stack.Screen name="StaffMessages" component={StaffMessagesScreen} />
      <Stack.Screen name="StaffInbox" component={StaffBookingInboxScreen} />
      <Stack.Screen name="StaffChat" component={StaffChatScreen} />
      <Stack.Screen
        name="Notifications"
        options={{ presentation: 'modal' }}
      >
        {(props: any) => <NotificationsScreen {...props} />}
      </Stack.Screen>
      <Stack.Screen name="StaffTestDriveBookings" component={TestDriveBookingScreen} options={{ title: 'Test Drive Bookings' }} />
      <Stack.Screen name="InventoryScreen" component={InventoryScreen} />
      <Stack.Screen name="FinanceApplications" component={FinanceApplicationsScreen} />
      <Stack.Screen name="StaffBookingDetail" component={StaffBookingDetailScreen} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
      <Stack.Screen name="CustomerProfile" component={CustomerProfileScreen} />
      <Stack.Screen name="TestDriveBooking" component={TestDriveBookingScreen} />
      <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} />
      <Stack.Screen name="StaffProfile" component={StaffProfileScreen} />
      <Stack.Screen name="Users" component={UsersScreen} />
      <Stack.Screen name="AdminBookings" component={AdminScreen} />
      <Stack.Screen name="AdminConsole" component={AdminScreen} options={{ title: 'Bookings Management' }} />
      <Stack.Screen name="AIChat" component={AIChatScreen} />
      <Stack.Screen name="FinanceApplication" component={FinanceApplicationScreen} />
      <Stack.Screen name="FinanceApplicationDetail" component={FinanceApplicationDetailScreen} />
      <Stack.Screen name="Review" component={ReviewScreen} />
      <Stack.Screen name="StaffAnalytics" component={StaffAnalyticsScreen} />
      <Stack.Screen name="ConnectedAccounts" component={ConnectedAccountsScreen} />
      <Stack.Screen name="StaffWallet" component={StaffWalletScreen} />
      <Stack.Screen name="BrochureManager" component={BrochureManagerScreen} />
      <Stack.Screen name="TradeIn" component={TradeInScreen} />
      <Stack.Screen name="TradeInSubmissions" component={TradeInScreen} options={{ title: 'Submitted Trade-Ins' }} />
      <Stack.Screen name="ShareApp" component={ShareScreen} />
      <Stack.Screen name="CustomerManagement" component={CustomerManagementScreen} />
      <Stack.Screen name="ContactUs" component={ContactUsScreen} />
      <Stack.Screen name="CompareVehicles" component={CompareVehiclesScreen} />
      <Stack.Screen name="Calendar" component={CalendarScreen} />
      <Stack.Screen name="Events" component={EventsScreen} />
      <Stack.Screen name="Groups" component={GroupsScreen} />
      <Stack.Screen
        name="MerchandiseHub"
        component={StaffMerchandiseRoute}
        initialParams={{ itemId: sharedMerchandiseItemId ?? undefined }}
        options={{ title: 'Merchandise Hub' }}
      />
      <Stack.Screen name="MerchandiseOrders" component={MerchandiseOrdersScreen} options={{ title: 'Merchandise Orders' }} />
      <Stack.Screen name="HyundaiMerchandise" component={HyundaiMerchandiseScreen} options={{ title: 'Hyundai Merchandise' }} />
      <Stack.Screen name="KiaMerchandise" component={KiaMerchandiseScreen} options={{ title: 'Kia Merchandise' }} />
      <Stack.Screen name="NewsWidget" component={LiveWidgetScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WeatherWidget" component={LiveWidgetScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MarketsWidget" component={LiveWidgetScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SuggestedAccounts" component={LiveWidgetScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Competition" component={LiveWidgetScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Initiatives" component={SocialFeedScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ActivityFeed" component={ActivityFeedScreen} />
      <Stack.Screen name="PartsOrders" component={StaffPartsOrdersRoute} />
      <Stack.Screen name="DriverSchedules" component={DriverSchedulesScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
    </Stack.Navigator>
  );
}

// ---- ROLE ROUTER ----
function RoleRouter({ sharedVehicleId, sharedMerchandiseItemId }: { sharedVehicleId: string | null; sharedMerchandiseItemId: string | null }) {
  const user = useQuery(api.users.me);
  const ensureRole = useMutation(api.users.ensureRole);
  const autoLinkCustomer = useMutation(api.customerProfiles.autoLink);
  const touchPresence = useMutation(api.users.touchPresence);
  const [settingUp, setSettingUp] = useState(false);
  const [error, setError] = useState('');
  const didSetup = useRef(false);
  const didAutoLink = useRef(false);

  useEffect(() => {
    const needsSetup = (user && !user.role) || (user === null && !didSetup.current);
    if (needsSetup && !settingUp) {
      didSetup.current = true;
      setSettingUp(true);
      setError('');
      ensureRole({})
        .then(() => {
          setSettingUp(false);
        })
        .catch((err: any) => {
          console.error('ensureRole failed:', err);
          setError(String(err?.message || err));
          setSettingUp(false);
          setTimeout(() => { didSetup.current = false; }, 3000);
        });
    }
  }, [user, ensureRole, settingUp]);

  useEffect(() => {
    if (!user?._id) return;
    touchPresence().catch(() => {});
    const timer = setInterval(() => {
      touchPresence().catch(() => {});
    }, 60000);
    return () => clearInterval(timer);
  }, [user?._id, touchPresence]);

  useEffect(() => {
    if (!user || user === null || user === undefined) return;
    if (user.role !== 'customer') return;
    if (didAutoLink.current) return;
    didAutoLink.current = true;
    autoLinkCustomer({
      userName: user.name ?? user.email ?? undefined,
      userPhone: user.phone ?? undefined,
    }).catch(() => {});
  }, [user, autoLinkCustomer]);

  const isStaffUser = Boolean(
    user?.role === 'staff' ||
    user?.role === 'admin'
  );

  // Still loading query
  if (user === undefined) {
    return <LoadingScreen />;
  }

  // Setting up role
  if (settingUp || (user && !user.role)) {
    return <LoadingScreen />;
  }

  // Account setup error - allow retry
  if (user === null && error) {
    return (
      <View style={styles.loading}>
        <Ionicons name="warning-outline" size={48} color={colors.warning} />
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 12 }}>
          Account Setup Issue
        </Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 8, paddingHorizontal: 32 }}>
          We're having trouble setting up your account. Please try again.
        </Text>
        <Text
          style={{ marginTop: 20, color: colors.primary, fontSize: 15, fontWeight: '600' }}
          onPress={() => { didSetup.current = false; setError(''); }}
        >
          Tap to Retry
        </Text>
      </View>
    );
  }

  // User is null but no error - still resolving
  if (user === null) {
    return <LoadingScreen />;
  }

  if (isStaffUser && user.staffApprovalStatus === 'pending') {
    return <PendingApprovalScreen />;
  }

  // Route based on role
  if (isStaffUser) {
    return <StaffStack sharedMerchandiseItemId={sharedMerchandiseItemId} />;
  }

  return <CustomerStack sharedVehicleId={sharedVehicleId} sharedMerchandiseItemId={sharedMerchandiseItemId} />;
}

// ---- MAIN APP ----
function LoadingScreen() {
  return (
    <ImageBackground source={appBackgroundImage} style={styles.loadingSplash} resizeMode="cover">
      <View style={styles.loadingSplashBackdrop} />
      <View style={styles.loadingSplashCard}>
        <View style={styles.loadingSplashLogoFrame}>
          <Image source={splashLogo} style={styles.loadingSplashLogo} resizeMode="cover" />
        </View>
        <Text style={styles.loadingSplashBrand}>Online Multiverse Productions</Text>
        <Text style={styles.loadingSplashTagline}>Created by the founder • brand statement loading</Text>

        <View style={styles.loadingSplashBrandRow}>
          <View style={styles.loadingSplashBrandTile}>
            <Image source={hyundaiSplashLogo} style={styles.loadingSplashBrandTileImage} resizeMode="contain" />
            <Text style={styles.loadingSplashBrandTileText}>Hyundai</Text>
          </View>
          <View style={styles.loadingSplashBrandTile}>
            <Image source={kiaSplashLogo} style={styles.loadingSplashBrandTileImage} resizeMode="contain" />
            <Text style={styles.loadingSplashBrandTileText}>Kia</Text>
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

function PendingApprovalScreen() {
  return <LoadingScreen />;
}

function CustomerStaffAssignmentScreen({ onAssigned }: { onAssigned: () => void }) {
  const me = useQuery(api.users.me);
  const staff = useQuery(api.staff.publicAvailableStaff) ?? [];
  const setAssignedStaff = useMutation(api.users.setAssignedStaff);
  const [selectedStaffUserId, setSelectedStaffUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const activeStaff = staff.filter((member: any) => member.isActive !== false && String(member.userId ?? '').trim());

  const handleContinue = async () => {
    if (!selectedStaffUserId || saving) return;
    setSaving(true);
    try {
      await setAssignedStaff({ staffUserId: selectedStaffUserId as any });
      onAssigned();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.customerAssignmentScreen}>
      <SafeAreaView style={styles.customerAssignmentSafe}>
        <View style={styles.customerAssignmentCard}>
          <Text style={styles.customerAssignmentTitle}>Choose your staff member</Text>
          <Text style={styles.customerAssignmentText}>
            Select the staff member who helped you register so your bookings, test drives, and finance applications stay attached to the right person.
          </Text>

          <ScrollView contentContainerStyle={styles.customerAssignmentList}>
            {activeStaff.map((member: any) => (
              <TouchableOpacity
                key={member.userId ?? member._id}
                style={[styles.customerAssignmentItem, selectedStaffUserId === String(member.userId) && styles.customerAssignmentItemActive]}
                onPress={() => setSelectedStaffUserId(String(member.userId))}
              >
                <Text style={[styles.customerAssignmentName, selectedStaffUserId === String(member.userId) && styles.customerAssignmentNameActive]}>
                  {member.name}
                </Text>
                <Text style={[styles.customerAssignmentMeta, selectedStaffUserId === String(member.userId) && styles.customerAssignmentMetaActive]}>
                  {(member.role ?? 'staff').replace(/_/g, ' ')}{member.dealershipName ? ` • ${member.dealershipName}` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.customerAssignmentButton, (!selectedStaffUserId || saving) && { opacity: 0.6 }]}
            onPress={handleContinue}
            disabled={!selectedStaffUserId || saving}
          >
            <Text style={styles.customerAssignmentButtonText}>{saving ? 'Saving...' : 'Continue'}</Text>
          </TouchableOpacity>

          <Text style={styles.customerAssignmentFootnote}>
            {me?.name ? `Signed in as ${me.name}` : 'Please choose one staff member to continue.'}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

function ToastHost() {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [visible, setVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeToast((nextToast) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast(nextToast);
      setVisible(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();

      timerRef.current = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }).start(() => {
          setVisible(false);
          setToast(null);
        });
      }, nextToast.duration ?? 2400);
    });
  }, [fadeAnim]);

  if (!visible || !toast) return null;

  return (
    <View pointerEvents="box-none" style={styles.toastHostWrap}>
      <Animated.View style={[styles.toastCard, { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        <View style={[styles.toastAccent, toast.type === 'error' ? styles.toastAccentError : styles.toastAccentSuccess]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.toastTitle}>{toast.title}</Text>
          {toast.message ? <Text style={styles.toastMessage}>{toast.message}</Text> : null}
        </View>
      </Animated.View>
    </View>
  );
}

class AppErrorBoundary extends React.Component<any, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.loading}>
          <Ionicons name="warning-outline" size={42} color={colors.warning} />
          <Text style={[styles.loadingText, { textAlign: 'center', paddingHorizontal: 24 }]}>The app hit an error. Tap retry to recover the screen or refresh if it keeps happening.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => this.setState({ hasError: false })}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const isWeb = Platform.OS === 'web';
  const location = isWeb && typeof globalThis !== 'undefined' ? (globalThis as any)?.location : undefined;
  const navigationRef = React.useRef<any>(null);
  const pendingNotificationNavRef = React.useRef<{ route: string; params?: any } | null>(null);
  const [incomingUrl, setIncomingUrl] = useState<string | null>(isWeb ? String(location?.href ?? '') : null);
  const [splashReady, setSplashReady] = useState(false);

  useEffect(() => {
    const trackCurrentRoute = () => {
      const route = navigationRef.current?.getCurrentRoute?.();
      if (route?.name) {
        trackScreenView(route.name, { route_name: route.name });
      }
    };

    const timer = setTimeout(trackCurrentRoute, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSplashReady(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    if (!Notifications) return;

    const applyPendingNavigation = () => {
      const pending = pendingNotificationNavRef.current;
      if (!pending) return;
      const route = navigationRef.current?.getCurrentRoute?.();
      if (!route?.name) return;
      navigationRef.current?.navigate?.(pending.route as never, pending.params as never);
      pendingNotificationNavRef.current = null;
    };

    const responseListener = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const navTarget = getRouteFromNotificationData(response.notification.request.content.data);
      if (!navTarget) return;
      const isReady = Boolean(navigationRef.current?.getCurrentRoute?.());
      if (isReady) {
        navigationRef.current?.navigate?.(navTarget.route as never, navTarget.params as never);
      } else {
        pendingNotificationNavRef.current = navTarget;
      }
    });

    Notifications.getLastNotificationResponseAsync()
      .then((response: any) => {
        if (!response) return;
        const navTarget = getRouteFromNotificationData(response.notification.request.content.data);
        if (!navTarget) return;
        const isReady = Boolean(navigationRef.current?.getCurrentRoute?.());
        if (isReady) {
          navigationRef.current?.navigate?.(navTarget.route as never, navTarget.params as never);
        } else {
          pendingNotificationNavRef.current = navTarget;
        }
      })
      .catch(() => {});

    const timer = setInterval(applyPendingNavigation, 500);
    return () => {
      responseListener.remove();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (isWeb) {
      setIncomingUrl(String(location?.href ?? ''));
      return;
    }

    let active = true;
    Linking.getInitialURL().then((url: string | null) => {
      if (active) setIncomingUrl(url ?? null);
    });

    const subscription = Linking.addEventListener('url', (event: { url: string }) => {
      setIncomingUrl(event.url ?? null);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [isWeb, location?.href]);

  const appLink = incomingUrl ?? (isWeb && typeof globalThis !== 'undefined' ? String((globalThis as any)?.location?.href ?? '') : null);
  const { vehicleId: deepVehicleId, postId: deepPostId } = parseAppLink(appLink);
  const search = String(location?.search ?? '');
  const sharedVehicleId = deepVehicleId ?? (isWeb ? search.match(/[?&](?:vehicle|sharedVehicleId)=([^&]+)/)?.[1] ?? null : null);
  const sharedPostId = deepPostId ?? (isWeb ? search.match(/[?&]postId=([^&]+)/)?.[1] ?? null : null);
  const sharedMerchandiseItemId = parseAppLink(appLink).merchandiseItemId ?? (isWeb ? search.match(/[?&]merchandiseItemId=([^&]+)/)?.[1] ?? null : null);
  const hashRoute = String(location?.hash ?? '').replace(/^#\/?/, '/');
  const pathname = String(location?.pathname ?? '');
  const cleanPath = (hashRoute && hashRoute !== '/' ? hashRoute : pathname).replace(/\/+$/, '') || '/';
  const isContactRoute = isWeb && (cleanPath === '/contact' || cleanPath === '/#contact');
  const isPrivacyRoute = isWeb && (cleanPath === '/privacy-policy' || cleanPath === '/#privacy-policy');
  const isTermsRoute = isWeb && (cleanPath === '/terms' || cleanPath === '/#terms');
  const isLoginRoute = isWeb && (cleanPath === '/login' || cleanPath === '/sign-in');
  const isSignupRoute = isWeb && (cleanPath === '/signup' || cleanPath === '/register');
  const publicHomeUrl = buildPublicUrl('/');
  const publicPolicyUrl = buildPublicUrl('/#privacy-policy');
  const publicTermsUrl = buildPublicUrl('/#terms');

  if (!splashReady) {
    return (
      <SafeAreaProvider style={styles.container}>
        <AppErrorBoundary>
          <ToastHost />
          <LoadingScreen />
        </AppErrorBoundary>
      </SafeAreaProvider>
    );
  }

  if (sharedPostId) {
    return (
      <SafeAreaProvider style={styles.container}>
        <LandingScreen route={{ params: { postId: sharedPostId } }} />
      </SafeAreaProvider>
    );
  }

  const publicAuthShell = (
    <SafeAreaProvider style={styles.container}>
      <AppErrorBoundary>
        <ToastHost />
        <View style={styles.appShell}>
          <ImageBackground source={appBackgroundImage} style={styles.appBackground} resizeMode="cover">
            <View style={styles.appBackgroundOverlay} />
          </ImageBackground>
          <NavigationContainer
            ref={navigationRef}
            onReady={() => {
              const route = navigationRef.current?.getCurrentRoute?.();
              if (route?.name) {
                trackScreenView(route.name, { route_name: route.name });
              }
            }}
            onStateChange={() => {
              const route = navigationRef.current?.getCurrentRoute?.();
              if (route?.name) {
                trackScreenView(route.name, { route_name: route.name });
              }
            }}
            theme={{
              ...DarkTheme,
              colors: {
                ...DarkTheme.colors,
                primary: colors.primary,
                background: 'transparent',
                card: colors.surface,
                text: colors.text,
                border: colors.borderLight,
                notification: colors.error,
              },
            }}
          >
            <AuthLoading>
              <LoadingScreen />
            </AuthLoading>
            <Unauthenticated>
              <LoginScreen />
            </Unauthenticated>
            <Authenticated>
              <RoleRouter sharedVehicleId={sharedVehicleId} sharedMerchandiseItemId={sharedMerchandiseItemId} />
            </Authenticated>
          </NavigationContainer>
        </View>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );

  const webPreviewShell = (
    <SafeAreaProvider style={styles.container}>
      <AppErrorBoundary>
        <ToastHost />
        <View style={styles.appShell}>
          <ImageBackground source={appBackgroundImage} style={styles.appBackground} resizeMode="cover">
            <View style={styles.appBackgroundOverlay} />
          </ImageBackground>
          <NavigationContainer
            ref={navigationRef}
            onReady={() => {
              const route = navigationRef.current?.getCurrentRoute?.();
              if (route?.name) {
                trackScreenView(route.name, { route_name: route.name });
              }
            }}
            onStateChange={() => {
              const route = navigationRef.current?.getCurrentRoute?.();
              if (route?.name) {
                trackScreenView(route.name, { route_name: route.name });
              }
            }}
            theme={{
              ...DarkTheme,
              colors: {
                ...DarkTheme.colors,
                primary: colors.primary,
                background: 'transparent',
                card: colors.surface,
                text: colors.text,
                border: colors.borderLight,
                notification: colors.error,
              },
            }}
          >
            <CustomerStack sharedVehicleId={sharedVehicleId} sharedMerchandiseItemId={sharedMerchandiseItemId} />
          </NavigationContainer>
        </View>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );

  if (isContactRoute) {
    return (
      <SafeAreaProvider style={styles.container}>
        <ContactUsScreen homeUrl={publicHomeUrl} />
      </SafeAreaProvider>
    );
  }

  if (isPrivacyRoute) {
    return (
      <SafeAreaProvider style={styles.container}>
        <PrivacyPolicyScreen policyUrl={publicPolicyUrl} homeUrl={publicHomeUrl} />
      </SafeAreaProvider>
    );
  }

  if (isTermsRoute) {
    return (
      <SafeAreaProvider style={styles.container}>
        <TermsOfServiceScreen policyUrl={publicTermsUrl} homeUrl={publicHomeUrl} />
      </SafeAreaProvider>
    );
  }

  if (isLoginRoute || isSignupRoute) {
    return publicAuthShell;
  }

  if (isWeb) {
    return publicAuthShell;
  }

  return publicAuthShell;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  appShell: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  appBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  appBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 8, 20, 0.64)',
  },
  appShellWallpaper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  loadingSplash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 24,
  },
  loadingSplashBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 8, 20, 0.50)',
  },
  loadingSplashCard: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.78)',
    borderRadius: 30,
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  loadingSplashLogoFrame: {
    width: 188,
    height: 188,
    borderRadius: 94,
    overflow: 'hidden',
    backgroundColor: 'rgba(11, 18, 32, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  loadingSplashLogo: {
    width: 238,
    height: 238,
    marginTop: -22,
    marginLeft: -10,
  },
  loadingSplashBrandRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    width: '100%',
  },
  loadingSplashBrandTile: {
    flex: 1,
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 10,
  },
  loadingSplashBrandTileImage: {
    width: 68,
    height: 52,
    marginBottom: 8,
  },
  loadingSplashBrandTileText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  loadingCard: {
    width: '84%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  headerMotionBg: {
    flex: 1,
    backgroundColor: colors.surface,
    opacity: 0.98,
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  tabBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.white,
  },
  retryBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  retryBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  staffShellContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  staffShellSafe: {
    flex: 1,
  },
  staffShellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  staffShellIconBtn: {
    padding: 8,
  },
  staffShellTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  staffShellSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  staffShellRolePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  staffShellRoleText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
  },
  staffShellBody: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flexGrow: 1,
  },
  staffShellBodyScroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  staffDrawer: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    alignSelf: 'flex-start',
    marginTop: -10,
  },
  staffDrawerContent: {
    paddingTop: 0,
    paddingBottom: 14,
    paddingHorizontal: 12,
  },
  staffDrawerHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textLight,
    marginBottom: 8,
    marginTop: 0,
    paddingHorizontal: 8,
  },
  staffDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 10,
    marginHorizontal: 8,
  },
  staffMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  staffMenuItemFeatured: {
    backgroundColor: colors.warning + '10',
    borderColor: colors.warning + '55',
    shadowColor: colors.warning,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  staffMenuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffMenuIconWrapFeatured: {
    backgroundColor: colors.warning + '20',
  },
  staffMenuTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  staffMenuLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  staffMenuDescription: {
    marginTop: 2,
    fontSize: 11,
    color: colors.textSecondary,
  },
  staffShellContent: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  staffShellCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  staffShellCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  staffShellCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  staffShellCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  staffShellCardText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  staffShellHintsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  staffHintPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  staffHintText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  headerNavButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginLeft: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  toastHostWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    width: '88%',
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  toastAccent: {
    width: 6,
    borderRadius: 999,
    alignSelf: 'stretch',
  },
  toastAccentSuccess: {
    backgroundColor: colors.success,
  },
  toastAccentError: {
    backgroundColor: colors.error,
  },
  toastTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
  },
  toastMessage: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  customerAssignmentScreen: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  customerAssignmentSafe: {
    flex: 1,
    justifyContent: 'center',
  },
  customerAssignmentCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 20,
  },
  customerAssignmentTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
  },
  customerAssignmentText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  customerAssignmentList: {
    gap: 10,
    paddingVertical: 18,
  },
  customerAssignmentItem: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceAlt,
  },
  customerAssignmentItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  customerAssignmentName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  customerAssignmentNameActive: {
    color: colors.white,
  },
  customerAssignmentMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
  },
  customerAssignmentMetaActive: {
    color: 'rgba(255,255,255,0.85)',
  },
  customerAssignmentButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  customerAssignmentButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '900',
  },
  customerAssignmentFootnote: {
    marginTop: 12,
    fontSize: 12,
    color: colors.textLight,
    textAlign: 'center',
  },
});