import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Linking,
  Switch,
  Alert,
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

function QuickActionButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickActionButton} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={styles.quickActionLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
    </TouchableOpacity>
  );
}

const FINANCE_ACCESS = ['full_access', 'limited_access'];
const ROLES = ['dealer_principal', 'workshop_manager', 'sales_executive', 'service_advisor', 'driver'];
const VINCENT_ADMIN_EMAILS = ['vincentmm@hyundai.co.za', 'vincentmmm@hyundai.co.za'];

function isAdminLikeUser(user: any) {
  const email = String(user?.email ?? '').trim().toLowerCase();
  const role = String(user?.role ?? '').trim().toLowerCase();
  const staffRole = String(user?.staffRole ?? '').trim().toLowerCase();

  return Boolean(
    user?.isOwner ||
    role === 'admin' ||
    VINCENT_ADMIN_EMAILS.includes(email) ||
    staffRole === 'dp'
  );
}

function canOpenAdminPanelClient(user: any) {
  return isAdminLikeUser(user);
}

export default function AdminScreen({ navigation, route }: any) {
  const me = useQuery(api.users.me);
  const screenEnter = useRef(new Animated.Value(0)).current;
  const headerFloat = useRef(new Animated.Value(0)).current;
  const screenTitle = 'Admin Control Panel';
  const isVincentAdmin = Boolean(me?.isOwner || VINCENT_ADMIN_EMAILS.includes(String(me?.email ?? '').trim().toLowerCase()) || String(me?.role ?? '').trim().toLowerCase() === 'admin' || String(me?.accessLevel ?? '').trim().toLowerCase() === 'full_access');
  const canViewAdmin = canOpenAdminPanelClient(me);
  const canEditAdmin = Boolean(isVincentAdmin);
  const canAccessWorkshop = false;
  const [showStaffRolePanel, setShowStaffRolePanel] = useState(false);
  const [showDealershipPanel, setShowDealershipPanel] = useState(false);
  const [showLead, setShowLead] = useState(false);
  const [showCustomerAssign, setShowCustomerAssign] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [selectedFinance, setSelectedFinance] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState('sales_executive');
  const [selectedAccess, setSelectedAccess] = useState('limited_access');
  const [selectedDealershipId, setSelectedDealershipId] = useState('');
  const [selectedAssignmentDealershipId, setSelectedAssignmentDealershipId] = useState('');
  const [leadStatus, setLeadStatus] = useState('under_review');
  const [selectedCustomerAssignee, setSelectedCustomerAssignee] = useState<string | null>(null);
  const [broadcastAudience, setBroadcastAudience] = useState<'customers' | 'users'>('customers');
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [assigningStaffId, setAssigningStaffId] = useState<string | null>(null);
  const [openStaffMenuUserId, setOpenStaffMenuUserId] = useState<string | null>(null);
  const [editingDealershipId, setEditingDealershipId] = useState<string | null>(null);
  const [dealershipName, setDealershipName] = useState('');
  const [dealershipBrand, setDealershipBrand] = useState('Hyundai');
  const [dealershipLocation, setDealershipLocation] = useState('');
  const [dealershipCity, setDealershipCity] = useState('');
  const [dealershipProvince, setDealershipProvince] = useState('');
  const [dealershipAddress, setDealershipAddress] = useState('');
  const [dealershipPhone, setDealershipPhone] = useState('');
  const [dealershipEmail, setDealershipEmail] = useState('');
  const [dealershipBackground, setDealershipBackground] = useState<{ uri: string; storageId?: string; mimeType?: string } | null>(null);
  const [savingDealership, setSavingDealership] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);

  const users = useQuery(api.users.listAdminOnly) ?? [];
  const staff = useQuery(api.staff.list) ?? [];
  const dealerships = useQuery(api.dealerships.listAll) ?? [];
  const recentPosts = useQuery(api.posts.listFeed, { mode: 'global', limit: 100, includeUnapproved: true }) ?? [];
  const financeApps = useQuery(api.finance.listAdmin, {}) ?? [];
  const analytics = useQuery(api.analytics.getFinanceApplicationFeed) ?? [];
  const bookings = useQuery(api.bookings.listAll, {}) ?? [];
  const customerProfiles = useQuery(api.customerProfiles.list) ?? [];
  const rewardSettings = useQuery(api.rewards.getSettings);
  const widgetVisibility = useQuery(api.widgetVisibility.listAll) ?? [];
  const staffMenuOverrides = useQuery(api.widgetVisibility.listStaffMenuOverrides) ?? [];
  const updateWidgetVisibility = useMutation(api.widgetVisibility.setVisibility);
  const updateStaffMenuVisibility = useMutation(api.widgetVisibility.setStaffMenuVisibility);
  const updateRoleAccess = useMutation(api.users.adminSetRoleAccess);
  const removeUser = useMutation(api.users.removeUser);
  const removeStaff = useMutation(api.staff.remove);
  const addDealership = useMutation(api.dealerships.add);
  const updateDealership = useMutation(api.dealerships.update);
  const assignStaffToDealership = useMutation(api.dealerships.assignStaff);
  const assignLead = useMutation(api.finance.assignLead);
  const setTokenEarningEnabled = useMutation(api.rewards.setTokenEarningEnabled);
  const assignCustomer = useMutation(api.customerProfiles.assignToStaff);
  const broadcastMessage = useMutation(api.messages.broadcast);
  const permanentlyDeletePost = useMutation(api.posts.permanentlyDeletePost);
  const restoreAllArchivedPosts = useMutation(api.posts.restoreAllArchivedPosts);
  const generateDealershipBackgroundUploadUrl = useMutation(api.dealerships.generateBackgroundUploadUrl);

  const fullAccessUsers = users.filter((u: any) => u.accessLevel === 'full_access' || u.isOwner);
  const limitedUsers = users.filter((u: any) => u.accessLevel === 'limited_access' && !u.isDeleted);
  const tokenEarningEnabled = rewardSettings?.tokenEarningEnabled ?? true;

  const staffUsers = users.filter((u: any) => u.role === 'staff' && !u.isDeleted);
  const selectedDealership = dealerships.find((dealership: any) => String(dealership._id) === selectedDealershipId) ?? null;

  useEffect(() => {
    Animated.timing(screenEnter, {
      toValue: 1,
      duration: 360,
      useNativeDriver: true,
    }).start();
  }, [screenEnter]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(headerFloat, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(headerFloat, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    ).start();
  }, [headerFloat]);

  const screenMotion = {
    opacity: screenEnter,
    transform: [{ translateY: screenEnter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  const adminMenu = [
    { key: 'feed', label: 'Feed', icon: 'newspaper-outline', onPress: () => navigation.navigate('SocialFeed') },
    { key: 'activity', label: 'Activity', icon: 'pulse-outline', onPress: () => navigation.navigate('ActivityFeed') },
    { key: 'users', label: 'Users', icon: 'people-outline', onPress: () => navigation.navigate('Users') },
    { key: 'staff', label: 'Staff', icon: 'shield-checkmark-outline', onPress: () => navigation.navigate('Staff') },
    { key: 'dealerships', label: 'Dealerships', icon: 'business-outline', onPress: () => openDealershipEditor() },
    { key: 'bookings', label: 'Bookings', icon: 'calendar-outline', onPress: () => navigation.navigate('AdminBookings') },
    { key: 'calendar', label: 'Calendar & Notes', icon: 'create-outline', onPress: () => navigation.navigate('Calendar') },
    { key: 'inventory', label: 'Inventory', icon: 'car-sport-outline', onPress: () => navigation.navigate('InventoryScreen') },
    { key: 'parts', label: 'Parts', icon: 'cube-outline', onPress: () => navigation.navigate('PartsOrders') },
  ];

  if (me === undefined) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safe}>
          <View style={styles.lockedWrap}>
            <View style={styles.skeletonCard}>
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, { width: '72%', marginTop: 10 }]} />
              <View style={[styles.skeletonLine, { width: '88%', marginTop: 18, height: 56, borderRadius: 16 }]} />
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!canViewAdmin && !canAccessWorkshop) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safe}>
          <Animated.View style={[styles.header, { transform: [{ translateY: headerFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }] }]}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Admin Control Panel</Text>
            <View style={{ width: 24 }} />
          </Animated.View>
          <View style={styles.lockedWrap}>
            <Ionicons name="lock-closed" size={40} color={colors.primary} />
            <Text style={styles.lockedTitle}>Restricted Access</Text>
            <Text style={styles.lockedText}>This panel is reserved for Vincent and admin users.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const isWorkshopOnly = false;

  const requireEditAccess = () => {
    if (canEditAdmin) return true;
    Alert.alert('Restricted access', 'Only Vincent can change admin settings.');
    return false;
  };

  const openUser = (user: any) => {
    if (!requireEditAccess()) return;
    setSelectedUser(user);
    setSelectedRole(user.staffRole || 'sales_executive');
    setSelectedAccess(user.accessLevel || 'limited_access');
    setSelectedDealershipId(user.dealershipId || '');
    setShowStaffRolePanel(true);
  };

  const openCustomerAssignment = (customer: any) => {
    if (!requireEditAccess()) return;
    setSelectedCustomer(customer);
    setSelectedCustomerAssignee(customer.assignedToUserId || null);
    setShowCustomerAssign(true);
  };

  const openDealershipEditor = (dealership?: any) => {
    if (!requireEditAccess()) return;
    if (dealership) {
      setEditingDealershipId(String(dealership._id));
      setDealershipName(String(dealership.name ?? ''));
      setDealershipBrand(String(dealership.brand ?? 'Hyundai'));
      setDealershipLocation(String(dealership.location ?? ''));
      setDealershipCity(String(dealership.city ?? ''));
      setDealershipProvince(String(dealership.province ?? ''));
      setDealershipAddress(String(dealership.address ?? ''));
      setDealershipPhone(String(dealership.phone ?? ''));
      setDealershipEmail(String(dealership.contactEmail ?? ''));
      setDealershipBackground(dealership.backgroundImageUrl ? { uri: String(dealership.backgroundImageUrl) } : null);
      setSelectedAssignmentDealershipId(String(dealership._id));
    } else {
      setEditingDealershipId(null);
      setDealershipName('');
      setDealershipBrand('Hyundai');
      setDealershipLocation('');
      setDealershipCity('');
      setDealershipProvince('');
      setDealershipAddress('');
      setDealershipPhone('');
      setDealershipEmail('');
      setDealershipBackground(null);
    }
    setShowDealershipPanel(true);
  };

  const pickDealershipBackground = async () => {
    if (!requireEditAccess()) return;

    try {
      let asset: any = null;
      if (Platform.OS === 'web') {
        asset = await new Promise<any>((resolve) => {
          const input = (globalThis as any).document?.createElement?.('input');
          if (!input) {
            resolve(null);
            return;
          }
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) {
              resolve(null);
              return;
            }
            resolve({
              uri: (globalThis as any).URL.createObjectURL(file),
              file,
              mimeType: file.type || 'image/jpeg',
            });
          };
          input.click();
        });
      } else {
        const DocumentPicker: any = await import('expo-document-picker');
        const result = await DocumentPicker.getDocumentAsync({
          type: 'image/*',
          multiple: false,
          copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets?.length) {
          return;
        }

        const pickedAsset = result.assets[0];
        asset = {
          uri: pickedAsset.uri,
          mimeType: pickedAsset.mimeType || 'image/jpeg',
          fileName: pickedAsset.name || 'background-image.jpg',
        };
      }

      if (!asset) return;

      setUploadingBackground(true);
      const uploadUrl = await generateDealershipBackgroundUploadUrl({});
      const uploadResult = Platform.OS === 'web'
        ? await globalThis.fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': asset.mimeType || 'image/jpeg' },
            body: asset.file instanceof (globalThis as any).Blob ? asset.file : await globalThis.fetch(asset.uri).then((res: any) => res.blob()),
          })
        : await FileSystem.uploadAsync(uploadUrl, asset.uri, {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { 'Content-Type': asset.mimeType || 'image/jpeg' },
          });

      const responseText = Platform.OS === 'web'
        ? await (uploadResult as Response).text()
        : String((uploadResult as any).body ?? '');
      let storageId = '';
      try {
        const parsed = JSON.parse(responseText);
        storageId = String(parsed.storageId || parsed.id || '').trim();
      } catch {
        storageId = responseText.trim();
      }
      if (!storageId) throw new Error('Upload failed');

      setDealershipBackground({ uri: asset.uri, storageId, mimeType: asset.mimeType });
    } catch (error: any) {
      Alert.alert('Background upload failed', error?.message ?? 'Please try again.');
    } finally {
      setUploadingBackground(false);
    }
  };

  const saveDealership = async () => {
    if (!requireEditAccess()) return;
    const cleanName = dealershipName.trim();
    const cleanBrand = dealershipBrand.trim() || 'Hyundai';
    const cleanLocation = dealershipLocation.trim();
    if (!cleanName || !cleanLocation) {
      Alert.alert('Missing information', 'Please enter a dealership name and location.');
      return;
    }

    try {
      setSavingDealership(true);
      const payload = {
        name: cleanName,
        brand: cleanBrand,
        location: cleanLocation,
        city: dealershipCity.trim() || undefined,
        province: dealershipProvince.trim() || undefined,
        address: dealershipAddress.trim() || undefined,
        phone: dealershipPhone.trim() || undefined,
        contactEmail: dealershipEmail.trim() || undefined,
        backgroundImageStorageId: dealershipBackground?.storageId ? (dealershipBackground.storageId as any) : undefined,
      };

      let dealershipId = editingDealershipId;
      if (editingDealershipId) {
        await updateDealership({ dealershipId: editingDealershipId as any, ...payload });
      } else {
        dealershipId = String(await addDealership(payload));
      }

      setSelectedAssignmentDealershipId(String(dealershipId));
      Alert.alert('Saved', 'Dealership location is now available for staff signup.');
      setEditingDealershipId(null);
      setDealershipName('');
      setDealershipBrand('Hyundai');
      setDealershipLocation('');
      setDealershipCity('');
      setDealershipProvince('');
      setDealershipAddress('');
      setDealershipPhone('');
      setDealershipEmail('');
      setDealershipBackground(null);
    } catch (error: any) {
      Alert.alert('Unable to save dealership', error?.message ?? 'Please try again.');
    } finally {
      setSavingDealership(false);
    }
  };

  const assignStaffMemberToDealership = async (staffMember: any, dealershipId: string) => {
    if (!requireEditAccess()) return;
    if (!dealershipId) {
      Alert.alert('Select a dealership', 'Please choose a dealership first.');
      return;
    }

    const targetDealership = dealerships.find((dealership: any) => String(dealership._id) === dealershipId);
    if (!targetDealership) {
      Alert.alert('Dealership not found', 'Please select a valid dealership.');
      return;
    }

    try {
      setAssigningStaffId(String(staffMember._id));
      await assignStaffToDealership({ staffId: staffMember._id, dealershipId: targetDealership._id });

      Alert.alert('Assigned', `${staffMember.name || staffMember.email} is now linked to ${targetDealership.name}.`);
    } catch (error: any) {
      Alert.alert('Unable to assign staff', error?.message ?? 'Please try again.');
    } finally {
      setAssigningStaffId(null);
    }
  };

  const saveUserAccess = async () => {
    if (!requireEditAccess()) return;
    if (!selectedUser) return;
    await updateRoleAccess({
      userId: selectedUser._id,
      role: 'staff',
      staffRole: selectedRole,
      accessLevel: selectedAccess,
      staffApprovalStatus: selectedUser.staffApprovalStatus || 'approved',
      dealershipId: selectedDealership ? String(selectedDealership._id) : undefined,
      dealershipName: selectedDealership?.name,
      dealershipBrand: selectedDealership?.brand,
      dealershipLocation: selectedDealership?.location,
    });

    const matchedStaff = staff.find((member: any) => String(member.email ?? '').trim().toLowerCase() === String(selectedUser.email ?? '').trim().toLowerCase());
    if (matchedStaff && selectedDealership) {
      await assignStaffToDealership({ staffId: matchedStaff._id, dealershipId: selectedDealership._id });
    }

    setShowStaffRolePanel(false);
    setSelectedUser(null);
    setSelectedDealershipId('');
  };

  const saveCustomerAssignment = async () => {
    if (!requireEditAccess()) return;
    if (!selectedCustomer || !selectedCustomerAssignee) return;
    await assignCustomer({
      profileId: selectedCustomer._id,
      staffUserId: selectedCustomerAssignee as any,
    });
    setShowCustomerAssign(false);
    setSelectedCustomer(null);
    setSelectedCustomerAssignee(null);
  };

  const deleteUser = async (user: any) => {
    if (!requireEditAccess()) return;
    await removeUser({ userId: user._id });
  };

  const saveLead = async () => {
    if (!requireEditAccess()) return;
    if (!selectedFinance) return;
    await assignLead({
      id: selectedFinance._id,
      assignedToUserId: selectedFinance.assignedToUserId ?? undefined,
      assignedToName: selectedFinance.assignedToName ?? undefined,
      status: leadStatus,
    });
    setShowLead(false);
    setSelectedFinance(null);
  };

  const sendBroadcast = async () => {
    if (!requireEditAccess()) return;
    const content = broadcastText.trim();
    if (!content) {
      Alert.alert('Message required', 'Please type the broadcast message first.');
      return;
    }

    try {
      setBroadcasting(true);
      const result = await broadcastMessage({ audience: broadcastAudience, content });
      Alert.alert('Broadcast sent', `Delivered to ${result.sentCount} recipient${result.sentCount === 1 ? '' : 's'}.`);
      setBroadcastText('');
      setShowBroadcast(false);
    } catch (error: any) {
      Alert.alert('Broadcast failed', error?.message ?? 'Please try again.');
    } finally {
      setBroadcasting(false);
    }
  };

  const deleteAdminPost = (post: any) => {
    Alert.alert(
      'Delete post permanently?',
      'This will remove the post and its stored media.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              await permanentlyDeletePost({ postId: post.postId });
            } catch (error: any) {
              Alert.alert('Delete failed', error?.message ?? 'Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <Animated.View style={[styles.header, { transform: [{ translateY: headerFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }] }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>{screenTitle}</Text>
            <Text style={styles.headerSub}>{isWorkshopOnly ? 'Workshop and bookings' : 'Operations, moderation, and team management'}</Text>
          </View>
          <View style={{ width: 24 }} />
        </Animated.View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Animated.View style={[styles.heroCard, screenMotion]}>
            <View style={styles.heroTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroLabel}>Admin control</Text>
                <Text style={styles.heroTitle}>Run the dealership from one place</Text>
                <Text style={styles.heroSubCopy}>Control staff access, manage users, review bookings, and keep finance moving.</Text>
              </View>
              <View style={styles.heroBadge}>
                <Ionicons name="shield-checkmark" size={16} color={colors.white} />
                <Text style={styles.heroBadgeText}>Protected</Text>
              </View>
            </View>

            {canViewAdmin && (
              <View style={styles.heroStatsRow}>
                <View style={styles.heroStat}><Text style={styles.heroStatValue}>{fullAccessUsers.length}</Text><Text style={styles.heroStatLabel}>Full access</Text></View>
                <View style={styles.heroStat}><Text style={styles.heroStatValue}>{limitedUsers.length}</Text><Text style={styles.heroStatLabel}>Limited</Text></View>
                <View style={styles.heroStat}><Text style={styles.heroStatValue}>{staff.length}</Text><Text style={styles.heroStatLabel}>Staff</Text></View>
                <View style={styles.heroStat}><Text style={styles.heroStatValue}>{financeApps.filter((f: any) => f.closedDeal).length}</Text><Text style={styles.heroStatLabel}>Closed</Text></View>
              </View>
            )}
          </Animated.View>

          {canViewAdmin && (
            <Animated.View style={screenMotion}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuBar}>
                {adminMenu.map((item) => (
                  <TouchableOpacity key={item.key} style={styles.menuPill} onPress={item.onPress} activeOpacity={0.85}>
                    <Ionicons name={item.icon as any} size={16} color={colors.primary} />
                    <Text style={styles.menuPillText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {canViewAdmin && (
            <>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Widget Visibility</Text>
                <Text style={styles.sectionSub}>Hide or reveal each feed widget separately</Text>
              </View>
              <Animated.View style={[styles.widgetToggleList, screenMotion]}>
                {widgetVisibility.map((widget: any) => (
                  <View key={widget.key} style={styles.widgetToggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.widgetToggleTitle}>{String(widget.key).replace(/^(.)/, (c) => c.toUpperCase())}</Text>
                      <Text style={styles.widgetToggleSub}>{widget.hidden ? 'Hidden from the feed' : 'Visible in the feed'}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.widgetToggleBtn, widget.hidden && styles.widgetToggleBtnActive]}
                      onPress={() => void updateWidgetVisibility({ key: widget.key, hidden: !widget.hidden })}
                    >
                      <Text style={[styles.widgetToggleBtnText, widget.hidden && styles.widgetToggleBtnTextActive]}>
                        {widget.hidden ? 'Show widget' : 'Hide widget'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </Animated.View>

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Staff Menu Access</Text>
                <Text style={styles.sectionSub}>Turn each staff menu on or off per staff member. Disabled menus stay hidden and cannot be opened.</Text>
              </View>
              <Animated.View style={[styles.widgetToggleList, screenMotion]}>
                {staffUsers.map((staffUser: any) => {
                  const overrideMap = new Map<string, { hidden: boolean }>(
                    staffMenuOverrides
                      .filter((entry: any) => entry.staffUserId === String(staffUser._id))
                      .map((entry: any) => [entry.menuKey, { hidden: Boolean(entry.hidden) }])
                  );
                  const enabledCount = STAFF_MENU_KEYS.reduce((count, menu) => count + (overrideMap.get(menu.key)?.hidden ? 0 : 1), 0);
                  const isOpen = openStaffMenuUserId === String(staffUser._id);

                  return (
                    <View key={staffUser._id} style={styles.staffMenuBlock}>
                      <TouchableOpacity
                        style={styles.staffMenuHeader}
                        onPress={() => setOpenStaffMenuUserId(isOpen ? null : String(staffUser._id))}
                        activeOpacity={0.85}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.staffMenuName}>{staffUser.name || staffUser.email}</Text>
                          <Text style={styles.staffMenuMeta}>{staffUser.staffRole || staffUser.role || 'staff'} · {staffUser.accessLevel || 'limited_access'}</Text>
                        </View>
                        <View style={styles.staffMenuBadge}>
                          <Text style={styles.staffMenuBadgeText}>{enabledCount}/{STAFF_MENU_KEYS.length}</Text>
                        </View>
                        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textLight} />
                      </TouchableOpacity>

                      {isOpen ? (
                        <View style={styles.staffMenuDropdown}>
                          {STAFF_MENU_KEYS.map((menu) => {
                            const currentOverride = overrideMap.get(menu.key);
                            const enabled = currentOverride ? !currentOverride.hidden : true;
                            return (
                              <TouchableOpacity
                                key={menu.key}
                                style={styles.staffMenuDropdownRow}
                                onPress={() => void updateStaffMenuVisibility({
                                  staffUserId: String(staffUser._id),
                                  menuKey: menu.key,
                                  hidden: enabled,
                                })}
                              >
                                <Text style={styles.staffMenuChipText}>{menu.label}</Text>
                                <Text style={[styles.staffMenuChipText, enabled ? styles.staffMenuChipTextOn : styles.staffMenuChipTextOff]}>
                                  {enabled ? 'On' : 'Off'}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </Animated.View>

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Administrator Settings</Text>
                <Text style={styles.sectionSub}>Quick access to the tools used most</Text>
              </View>
              <Animated.View style={[styles.adminQuickRow, screenMotion]}>
                <TouchableOpacity style={styles.adminQuickCard} onPress={() => navigation.navigate('ActivityFeed')}>
                  <Ionicons name="pulse-outline" size={20} color={colors.primary} />
                  <Text style={styles.adminQuickTitle}>App Activity</Text>
                  <Text style={styles.adminQuickSub}>Audit log and notifications</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.adminQuickCard} onPress={() => navigation.navigate('SocialFeed')}>
                  <Ionicons name="newspaper-outline" size={20} color={colors.primary} />
                  <Text style={styles.adminQuickTitle}>Feed Moderation</Text>
                  <Text style={styles.adminQuickSub}>Approve or remove posts</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.adminQuickCard} onPress={() => navigation.navigate('Users')}>
                  <Ionicons name="people-outline" size={20} color={colors.primary} />
                  <Text style={styles.adminQuickTitle}>Users</Text>
                  <Text style={styles.adminQuickSub}>All customers and staff</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.adminQuickCard} onPress={() => setShowStaffRolePanel(true)}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
                  <Text style={styles.adminQuickTitle}>Staff Roles</Text>
                  <Text style={styles.adminQuickSub}>Role selection for staff only</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.adminQuickCard} onPress={() => openDealershipEditor()}>
                  <Ionicons name="business-outline" size={20} color={colors.primary} />
                  <Text style={styles.adminQuickTitle}>Dealerships</Text>
                  <Text style={styles.adminQuickSub}>Create locations and assign staff</Text>
                </TouchableOpacity>
              </Animated.View>

              <QuickActionButton
                icon="cube-outline"
                label="Parts"
                onPress={() => navigation.navigate('InventoryScreen')}
              />

              <View style={styles.staffLink}>
                <Ionicons name="document-text" size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.staffLinkText}>Token Rewards</Text>
                  <Text style={styles.staffLinkSub}>Turn rewards on or off for drive, service, and bonus earning</Text>
                </View>
                <Switch
                  value={tokenEarningEnabled}
                  onValueChange={async (value: boolean) => {
                    if (!requireEditAccess()) return;
                    try {
                      await setTokenEarningEnabled({ enabled: value });
                    } catch (error: any) {
                      Alert.alert('Unable to update reward settings', error?.message ?? 'Please try again.');
                    }
                  }}
                  trackColor={{ false: colors.borderLight, true: colors.primary + '55' }}
                  thumbColor={tokenEarningEnabled ? colors.primary : colors.surface}
                />
              </View>

              <TouchableOpacity
                style={styles.broadcastCard}
                onPress={() => {
                  Alert.alert(
                    'Restore archived posts?',
                    'This will restore every archived post visible to admin moderation.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Restore all archived posts',
                        onPress: async () => {
                          try {
                            const restored = await restoreAllArchivedPosts({});
                            Alert.alert(
                              'Restore complete',
                              restored > 0
                                ? `${restored} post${restored === 1 ? '' : 's'} restored.`
                                : 'No archived posts were found to restore.'
                            );
                          } catch (error: any) {
                            Alert.alert('Restore failed', error?.message ?? 'Please try again.');
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <Ionicons name="refresh-outline" size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.broadcastTitle}>Restore Archived Posts</Text>
                  <Text style={styles.broadcastSub}>Bring back soft-deleted posts from the backend</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
              </TouchableOpacity>

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Post Management</Text>
                <Text style={styles.sectionSub}>Delete controls are visible here for admins</Text>
              </View>
              {recentPosts.map((post: any) => (
                <View key={post.postId} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.cardAccent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName} numberOfLines={1}>{post.title || post.content}</Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>{post.authorDisplayName} · {String(post.postType || 'community')}</Text>
                      <Text style={styles.cardMeta}>{post.likeCount} likes · {post.commentCount} comments</Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteAdminPost(post)}>
                      <Ionicons name="trash-outline" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Bookings Management</Text>
            <Text style={styles.sectionSub}>Live booking queue and moderation access</Text>
          </View>
          {bookings.slice(0, 8).map((booking: any) => (
            <TouchableOpacity key={booking._id} style={styles.card} onPress={() => navigation.navigate('StaffBookingDetail', { bookingId: booking._id })} activeOpacity={0.85}>
              <View style={styles.cardTop}>
                <View style={styles.cardAccent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{booking.referenceNumber || 'Booking ref pending'}</Text>
                  <Text style={styles.cardMeta}>{booking.customerName || 'Customer'} · {booking.customerEmail || 'No email'}</Text>
                  <Text style={styles.cardMeta}>{booking.serviceType} · {booking.date} · {booking.timeSlot}</Text>
                </View>
                <Text style={styles.cardStatus}>{booking.status.replace('_', ' ')}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {canViewAdmin && (
            <>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Staff Role Selection</Text>
                <Text style={styles.sectionSub}>Role selection applies only to staff members</Text>
              </View>
              {staffUsers.map((user: any) => (
                <TouchableOpacity key={user._id} style={styles.card} onPress={() => openUser(user)} activeOpacity={0.85}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{user.name || 'Unnamed staff member'}</Text>
                      <Text style={styles.cardMeta}>{user.email || 'No email'}</Text>
                      <Text style={styles.cardMeta}>{user.staffRole || 'staff'} · {user.accessLevel || 'limited_access'}</Text>
                      <Text style={styles.cardMeta}>{user.dealershipName || 'No dealership assigned'}{user.dealershipLocation ? ` · ${user.dealershipLocation}` : ''}</Text>
                      <Text style={styles.cardMeta}>{user.phone || 'No phone'}{user.lastSeenAt ? ` · ${Date.now() - user.lastSeenAt < 120000 ? 'online' : 'offline'}` : ''}</Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteUser(user)}>
                      <Ionicons name="trash-outline" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Staff</Text>
                <Text style={styles.sectionSub}>Current internal team members</Text>
              </View>
              {staff.map((member: any) => (
                <TouchableOpacity key={member._id} style={styles.card} onPress={() => navigation.navigate('Staff')} activeOpacity={0.85}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{member.name}</Text>
                      <Text style={styles.cardMeta}>{member.email}</Text>
                      <Text style={styles.cardMeta}>{member.role} · {member.accessLevel || 'limited_access'}</Text>
                      <Text style={styles.cardMeta}>{member.dealershipName || 'No dealership assigned'}{member.dealershipLocation ? ` · ${member.dealershipLocation}` : ''}</Text>
                    </View>
                    <TouchableOpacity onPress={async () => { await removeStaff({ staffId: member._id }); }}>
                      <Ionicons name="trash-outline" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Dealership Locations</Text>
            <Text style={styles.sectionSub}>Create a location first, then staff can register against it</Text>
          </View>
          <View style={styles.dealershipActionCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dealershipActionTitle}>Create dealership location</Text>
              <Text style={styles.dealershipActionSub}>If a dealership is not created here, it will not show on staff sign up.</Text>
            </View>
            <TouchableOpacity style={styles.dealershipActionBtn} onPress={() => openDealershipEditor()}>
              <Text style={styles.dealershipActionBtnText}>Add dealership</Text>
            </TouchableOpacity>
          </View>

          {dealerships.map((dealership: any) => (
            <TouchableOpacity key={dealership._id} style={styles.card} activeOpacity={0.85} onPress={() => openDealershipEditor(dealership)}>
              <View style={styles.dealershipCardHero}>
                {dealership.backgroundImageUrl ? (
                  <ImageBackground
                    source={{ uri: dealership.backgroundImageUrl }}
                    style={styles.dealershipCardHeroImage}
                    imageStyle={styles.dealershipCardHeroImageStyle}
                  >
                    <View style={styles.dealershipCardHeroOverlay} />
                    <View style={styles.dealershipCardHeroBadge}>
                      <Ionicons name="business-outline" size={14} color={colors.white} />
                      <Text style={styles.dealershipCardHeroBadgeText}>{dealership.brand}</Text>
                    </View>
                    <Text style={styles.dealershipCardHeroTitle} numberOfLines={1}>{dealership.name}</Text>
                    <Text style={styles.dealershipCardHeroSub} numberOfLines={1}>{dealership.location}</Text>
                  </ImageBackground>
                ) : (
                  <View style={styles.dealershipCardHeroFallback}>
                    <Ionicons name="business-outline" size={18} color={colors.primary} />
                    <Text style={styles.dealershipCardHeroFallbackText}>{dealership.name}</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardTop}>
                <View style={styles.cardAccent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardMeta}>{[dealership.city, dealership.province].filter(Boolean).join(', ') || 'No city / province set'}</Text>
                  <Text style={styles.cardMeta}>{dealership.staffCount} staff · {dealership.onlineStaffCount} online</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </View>
            </TouchableOpacity>
          ))}

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Allocate Staff to Dealership</Text>
            <Text style={styles.sectionSub}>Pick a dealership and assign any staff member to it</Text>
          </View>
          <View style={styles.optionRow}>
            {dealerships.map((dealership: any) => (
              <TouchableOpacity
                key={dealership._id}
                style={[styles.optionChip, selectedAssignmentDealershipId === String(dealership._id) && styles.optionChipActive]}
                onPress={() => setSelectedAssignmentDealershipId(String(dealership._id))}
              >
                <Text style={[styles.optionChipText, selectedAssignmentDealershipId === String(dealership._id) && styles.optionChipTextActive]}>
                  {dealership.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {!dealerships.length ? (
            <Text style={styles.assignmentHint}>Create a dealership first, then assign staff here.</Text>
          ) : null}
          {staff.filter((member: any) => member.isActive).map((member: any) => (
            <View key={member._id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{member.name}</Text>
                  <Text style={styles.cardMeta}>{member.email}</Text>
                  <Text style={styles.cardMeta}>{member.role} · {member.dealershipName || 'No dealership assigned'}</Text>
                </View>
                <TouchableOpacity
                  style={styles.dealershipAssignBtn}
                  onPress={() => void assignStaffMemberToDealership(member, selectedAssignmentDealershipId)}
                  disabled={!selectedAssignmentDealershipId || assigningStaffId === String(member._id)}
                >
                  <Text style={styles.dealershipAssignBtnText}>{assigningStaffId === String(member._id) ? 'Assigning...' : 'Assign'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>

        <Modal visible={showStaffRolePanel} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Role & Access</Text>
                <TouchableOpacity onPress={() => setShowStaffRolePanel(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
              </View>
              <Text style={styles.modalLabel}>Role</Text>
              <View style={styles.optionRow}>{ROLES.map((r) => <TouchableOpacity key={r} style={[styles.optionChip, selectedRole === r && styles.optionChipActive]} onPress={() => setSelectedRole(r)}><Text style={[styles.optionChipText, selectedRole === r && styles.optionChipTextActive]}>{r.replace('_', ' ')}</Text></TouchableOpacity>)}</View>
              <Text style={styles.modalLabel}>Access</Text>
              <View style={styles.optionRow}>{FINANCE_ACCESS.map((a) => <TouchableOpacity key={a} style={[styles.optionChip, selectedAccess === a && styles.optionChipActive]} onPress={() => setSelectedAccess(a)}><Text style={[styles.optionChipText, selectedAccess === a && styles.optionChipTextActive]}>{a.replace('_', ' ')}</Text></TouchableOpacity>)}</View>
              <Text style={styles.modalLabel}>Dealership</Text>
              <View style={styles.optionRow}>
                <TouchableOpacity
                  style={[styles.optionChip, !selectedDealershipId && styles.optionChipActive]}
                  onPress={() => setSelectedDealershipId('')}
                >
                  <Text style={[styles.optionChipText, !selectedDealershipId && styles.optionChipTextActive]}>Unassigned</Text>
                </TouchableOpacity>
                {dealerships.map((dealership: any) => (
                  <TouchableOpacity
                    key={dealership._id}
                    style={[styles.optionChip, selectedDealershipId === String(dealership._id) && styles.optionChipActive]}
                    onPress={() => setSelectedDealershipId(String(dealership._id))}
                  >
                    <Text style={[styles.optionChipText, selectedDealershipId === String(dealership._id) && styles.optionChipTextActive]}>
                      {dealership.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {selectedDealership ? (
                <Text style={styles.modalLabel}>{selectedDealership.brand} · {selectedDealership.location}{selectedDealership.city || selectedDealership.province ? ` · ${[selectedDealership.city, selectedDealership.province].filter(Boolean).join(', ')}` : ''}</Text>
              ) : null}
              <TouchableOpacity style={styles.saveBtn} onPress={saveUserAccess}><Text style={styles.saveBtnText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={showLead} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Finance Lead</Text>
                <TouchableOpacity onPress={() => setShowLead(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
              </View>
              <Text style={styles.modalLabel}>Status</Text>
              <View style={styles.optionRow}>{['under_review', 'approved', 'declined', 'more_info_needed'].map((s) => <TouchableOpacity key={s} style={[styles.optionChip, leadStatus === s && styles.optionChipActive]} onPress={() => setLeadStatus(s)}><Text style={[styles.optionChipText, leadStatus === s && styles.optionChipTextActive]}>{s.replace('_', ' ')}</Text></TouchableOpacity>)}</View>
              <TouchableOpacity style={styles.saveBtn} onPress={saveLead}><Text style={styles.saveBtnText}>Save Lead Update</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={showCustomerAssign} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Assign Customer</Text>
                <TouchableOpacity onPress={() => setShowCustomerAssign(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
              </View>
              <Text style={styles.modalLabel}>Assign to staff member</Text>
              <View style={styles.optionRow}>
                {users.map((member: any) => (
                  <TouchableOpacity
                    key={member._id}
                    style={[styles.optionChip, selectedCustomerAssignee === member._id && styles.optionChipActive]}
                    onPress={() => setSelectedCustomerAssignee(member._id)}
                  >
                    <Text style={[styles.optionChipText, selectedCustomerAssignee === member._id && styles.optionChipTextActive]}>
                      {member.name || member.email}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.saveBtn} onPress={saveCustomerAssignment}><Text style={styles.saveBtnText}>Save Assignment</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={showBroadcast} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Broadcast Message</Text>
                <TouchableOpacity onPress={() => setShowBroadcast(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
              </View>
              <Text style={styles.modalLabel}>Audience</Text>
              <View style={styles.optionRow}>
                {(['customers', 'users'] as const).map((audience) => (
                  <TouchableOpacity
                    key={audience}
                    style={[styles.optionChip, broadcastAudience === audience && styles.optionChipActive]}
                    onPress={() => setBroadcastAudience(audience)}
                  >
                    <Text style={[styles.optionChipText, broadcastAudience === audience && styles.optionChipTextActive]}>
                      {audience === 'customers' ? 'Customers' : 'All Users'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.modalLabel}>Message</Text>
              <TextInput
                value={broadcastText}
                onChangeText={setBroadcastText}
                placeholder="Type the announcement..."
                placeholderTextColor={colors.textLight}
                style={styles.broadcastInput}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={sendBroadcast} disabled={broadcasting}>
                <Text style={styles.saveBtnText}>{broadcasting ? 'Sending...' : 'Send Broadcast'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={showDealershipPanel} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingDealershipId ? 'Edit Dealership' : 'Create Dealership'}</Text>
                <TouchableOpacity onPress={() => setShowDealershipPanel(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }}>
                <Text style={styles.modalLabel}>Dealership Name</Text>
                <TextInput value={dealershipName} onChangeText={setDealershipName} placeholder="e.g. Motus Hyundai Sandton" placeholderTextColor={colors.textLight} style={styles.broadcastInput} />
                <Text style={styles.modalLabel}>Brand</Text>
                <TextInput value={dealershipBrand} onChangeText={setDealershipBrand} placeholder="Hyundai or Kia" placeholderTextColor={colors.textLight} style={styles.broadcastInput} />
                <Text style={styles.modalLabel}>Location</Text>
                <TextInput value={dealershipLocation} onChangeText={setDealershipLocation} placeholder="e.g. Sandton" placeholderTextColor={colors.textLight} style={styles.broadcastInput} />
                <Text style={styles.modalLabel}>Background Image</Text>
                <TouchableOpacity style={styles.backgroundUploadBtn} onPress={() => void pickDealershipBackground()} disabled={uploadingBackground}>
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                  <Text style={styles.backgroundUploadBtnText}>
                    {uploadingBackground
                      ? 'Uploading...'
                      : editingDealershipId
                        ? 'Replace background image'
                        : 'Upload background image'}
                  </Text>
                </TouchableOpacity>
                {editingDealershipId ? (
                  <Text style={styles.backgroundHintText}>
                    Uploading a new image here will replace the current dealership background when you save.
                  </Text>
                ) : null}
                {dealershipBackground?.uri ? (
                  <View style={styles.backgroundPreviewCard}>
                    <Image source={{ uri: dealershipBackground.uri }} style={styles.backgroundPreviewImage} />
                    <Text style={styles.backgroundPreviewText}>
                      {editingDealershipId ? 'New background selected' : 'Background selected'}
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.modalLabel}>City</Text>
                <TextInput value={dealershipCity} onChangeText={setDealershipCity} placeholder="City" placeholderTextColor={colors.textLight} style={styles.broadcastInput} />
                <Text style={styles.modalLabel}>Province</Text>
                <TextInput value={dealershipProvince} onChangeText={setDealershipProvince} placeholder="Province" placeholderTextColor={colors.textLight} style={styles.broadcastInput} />
                <Text style={styles.modalLabel}>Address</Text>
                <TextInput value={dealershipAddress} onChangeText={setDealershipAddress} placeholder="Street address" placeholderTextColor={colors.textLight} style={styles.broadcastInput} />
                <Text style={styles.modalLabel}>Phone</Text>
                <TextInput value={dealershipPhone} onChangeText={setDealershipPhone} placeholder="Contact number" placeholderTextColor={colors.textLight} style={styles.broadcastInput} keyboardType="phone-pad" />
                <Text style={styles.modalLabel}>Contact Email</Text>
                <TextInput value={dealershipEmail} onChangeText={setDealershipEmail} placeholder="dealership@email.com" placeholderTextColor={colors.textLight} style={styles.broadcastInput} autoCapitalize="none" />

                <TouchableOpacity style={styles.saveBtn} onPress={saveDealership} disabled={savingDealership}>
                  <Text style={styles.saveBtnText}>{savingDealership ? 'Saving...' : 'Save Dealership'}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const STAFF_MENU_KEYS = [
  { key: 'customers', label: 'Customers' },
  { key: 'staff', label: 'Staff' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'finance_applications', label: 'Finance Applications' },
  { key: 'test_drives', label: 'Test Drives' },
  { key: 'service_bookings', label: 'Service Bookings' },
  { key: 'parts_orders', label: 'Parts Orders' },
  { key: 'accessory_orders', label: 'Accessory Orders' },
  { key: 'activity_feed', label: 'Activity Feed' },
  { key: 'social_feed', label: 'Feed' },
  { key: 'users', label: 'Users' },
  { key: 'analytics', label: 'Analytics' },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 11, color: colors.textSecondary, marginTop: 3, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  heroCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight, marginTop: spacing.md },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroLabel: { fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { fontSize: 20, fontWeight: '900', color: colors.text, marginTop: 4 },
  heroSubCopy: { fontSize: 13, color: colors.textSecondary, marginTop: 6, lineHeight: 19 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.primary },
  heroBadgeText: { fontSize: 11, fontWeight: '700', color: colors.white },
  heroStatsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  heroStat: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight },
  heroStatValue: { fontSize: 18, fontWeight: '900', color: colors.text },
  heroStatLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, marginTop: 2 },
  menuBar: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.md },
  menuPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  menuPillText: { fontSize: 12, fontWeight: '800', color: colors.text },
  sectionHeaderRow: { marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  sectionSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  staffLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primary + '10', borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.primary + '25' },
  staffLinkText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  staffLinkSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  broadcastCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.borderLight },
  broadcastTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  broadcastSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  broadcastInput: { minHeight: 120, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, color: colors.text, fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  statNumber: { fontSize: 20, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.borderLight },
  dealershipCardHero: { marginBottom: spacing.md },
  dealershipCardHeroImage: { minHeight: 150, justifyContent: 'flex-end', padding: spacing.md },
  dealershipCardHeroImageStyle: { borderRadius: radius.lg },
  dealershipCardHeroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.32)', borderRadius: radius.lg },
  dealershipCardHeroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: 'rgba(0,0,0,0.26)', marginBottom: 8 },
  dealershipCardHeroBadgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  dealershipCardHeroTitle: { color: colors.white, fontSize: 18, fontWeight: '900' },
  dealershipCardHeroSub: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  dealershipCardHeroFallback: { minHeight: 150, borderRadius: radius.lg, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dealershipCardHeroFallbackText: { fontSize: 16, fontWeight: '900', color: colors.text },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardAccent: { width: 4, alignSelf: 'stretch', borderRadius: 999, backgroundColor: colors.primary },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  cardStatus: { fontSize: 12, color: colors.primary, fontWeight: '700', textTransform: 'capitalize' },
  toggleCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.borderLight, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: spacing.sm, marginTop: spacing.md },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  optionChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  optionChipTextActive: { color: colors.white },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center', marginTop: spacing.xl },
  saveBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  lockedWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl, gap: 12 },
  lockedTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  lockedText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  adminQuickRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  adminQuickCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, gap: 6 },
  adminQuickTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  adminQuickSub: { fontSize: 11, color: colors.textSecondary },
  dealershipActionCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  dealershipActionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  dealershipActionSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  dealershipActionBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.full },
  dealershipActionBtnText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  backgroundUploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '24' },
  backgroundUploadBtnText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  backgroundPreviewCard: { marginTop: spacing.sm, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface },
  backgroundPreviewImage: { width: '100%', height: 140, backgroundColor: colors.surfaceAlt },
  backgroundPreviewText: { padding: spacing.sm, fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  backgroundHintText: { marginTop: 8, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  dealershipAssignBtn: { backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '24', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.full },
  dealershipAssignBtnText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  readOnlyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary + '10', borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.primary + '22', marginTop: spacing.sm, marginBottom: spacing.md },
  readOnlyBannerText: { flex: 1, color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  quickActionButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, marginBottom: spacing.sm },
  quickActionLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  widgetToggleList: { gap: spacing.sm, marginBottom: spacing.lg },
  widgetToggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  widgetToggleTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  widgetToggleSub: { marginTop: 2, fontSize: 11, color: colors.textSecondary },
  widgetToggleBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.full, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '24' },
  widgetToggleBtnActive: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderLight },
  widgetToggleBtnText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  widgetToggleBtnTextActive: { color: colors.textSecondary },
  skeletonCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  skeletonLine: {
    width: '100%',
    height: 16,
    borderRadius: 999,
    backgroundColor: colors.borderLight,
    opacity: 0.55,
  },
  staffMenuBlock: { flexDirection: 'column', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  staffMenuHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  staffMenuBadge: { backgroundColor: colors.primary + '12', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
  staffMenuBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  staffMenuDropdown: { gap: 8, marginTop: 4 },
  staffMenuDropdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight },
  staffMenuName: { fontSize: 15, fontWeight: '700', color: colors.text },
  staffMenuMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  staffMenuChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  staffMenuChipTextOn: { color: colors.primary },
  staffMenuChipTextOff: { color: colors.textLight },
  assignmentHint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
});

// ... existing code ...