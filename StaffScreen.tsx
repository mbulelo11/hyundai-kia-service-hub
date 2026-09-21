import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

const ROLES = [
  { value: 'dealership_principal', label: 'Dealership Principal', icon: 'shield-checkmark' },
  { value: 'sales_executive', label: 'Sales Executive', icon: 'briefcase' },
  { value: 'service_advisor', label: 'Service Advisor', icon: 'construct' },
  { value: 'driver', label: 'Driver', icon: 'car' },
];

const ACCESS_LEVELS = [
  { value: 'full_access', label: 'Full Access' },
  { value: 'limited_access', label: 'Limited Access' },
];

function SectionPill({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <View style={styles.pillStat}>
      <Text style={[styles.pillValue, { color: tint }]}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

export default function StaffScreen({ navigation, route }: any) {
  const staffQuery = useQuery(api.staff.listActiveWithUsers);
  const dealershipsQuery = useQuery(api.dealerships.listAll);
  const publicStaffQuery = useQuery(api.staff.publicAvailableStaff);
  const me = useQuery(api.users.me);
  const staff = useMemo(() => staffQuery ?? [], [staffQuery]);
  const dealerships = useMemo(() => dealershipsQuery ?? [], [dealershipsQuery]);
  const publicStaff = useMemo(() => publicStaffQuery ?? [], [publicStaffQuery]);
  const isCustomerPublicView = String(route?.name ?? '').trim() === 'CustomerStaff' || String(me?.role ?? '').trim().toLowerCase() === 'customer';
  const addStaff = useMutation(api.staff.add);
  const addDealership = useMutation(api.dealerships.add);
  const updateDealership = useMutation(api.dealerships.update);
  const assignStaff = useMutation(api.dealerships.assignStaff);
  const toggleActive = useMutation(api.staff.toggleActive);
  const removeStaff = useMutation(api.staff.remove);
  const adminUpdateUserProfile = useMutation(api.users.adminUpdateUserProfile);
  const generateProfileUploadUrl = useMutation(api.users.generateProfileUploadUrl);
  const openProfileSettings = () => navigation.navigate('StaffProfile');
  const openPartsOrders = () => navigation.navigate('PartsOrders');

  const [showAdd, setShowAdd] = useState(false);
  const [showAddActionSheet, setShowAddActionSheet] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('service_advisor');
  const [accessLevel, setAccessLevel] = useState('limited_access');
  const [dealershipId, setDealershipId] = useState('');
  const [showDealerships, setShowDealerships] = useState(false);
  const [dealershipName, setDealershipName] = useState('');
  const [dealershipBrand, setDealershipBrand] = useState('Hyundai');
  const [dealershipLocation, setDealershipLocation] = useState('');
  const [dealershipCity, setDealershipCity] = useState('');
  const [dealershipProvince, setDealershipProvince] = useState('');
  const [dealershipAddress, setDealershipAddress] = useState('');
  const [dealershipPhone, setDealershipPhone] = useState('');
  const [dealershipEmail, setDealershipEmail] = useState('');
  const [editingDealershipId, setEditingDealershipId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [assignmentDealershipId, setAssignmentDealershipId] = useState('');
  const [assigningStaffId, setAssigningStaffId] = useState<string | null>(null);
  const [staffSearch, setStaffSearch] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showDealershipForm, setShowDealershipForm] = useState(false);
  const [dealershipFormStaffId, setDealershipFormStaffId] = useState<string | null>(null);

  const handlePickStaffPhoto = async (member: any) => {
    try {
      const picker: any = await import('expo-document-picker');
      const result = await picker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setUploadingPhoto(true);
      const uploadUrl = await generateProfileUploadUrl();
      if (Platform.OS === 'web') {
        const response = await globalThis.fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': asset.mimeType || 'image/jpeg' },
          body: asset.file ?? asset.uri,
        });
        const body = await response.text();
        const parsed = JSON.parse(body || '{}');
        const storageId = String(parsed.storageId || parsed.id || body || '').trim();
        if (storageId) {
          await adminUpdateUserProfile({ userId: member._id, profileImageStorageId: storageId as any });
        }
        return;
      }
      const FileSystem = await import('expo-file-system');
      const upload = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': asset.mimeType || 'image/jpeg' },
      });
      const body = upload.body || '';
      let storageId = '';
      try {
        const parsed = JSON.parse(body);
        storageId = String(parsed.storageId || parsed.id || '').trim();
      } catch {
        storageId = body.trim();
      }
      if (storageId) {
        await adminUpdateUserProfile({ userId: member._id, profileImageStorageId: storageId as any });
      }
    } catch (error: any) {
      Alert.alert('Photo upload', error?.message || 'Could not update staff photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const openStaffDetail = (member: any) => setSelectedStaff(member);

  const openAddStaffModal = () => {
    setShowAddActionSheet(false);
    setShowAdd(true);
  };

  const openCreateDealershipModal = () => {
    resetDealershipForm();
    setShowAddActionSheet(false);
    setShowDealerships(true);
  };

  const normalizedSearch = staffSearch.trim().toLowerCase();
  const filteredStaff = useMemo(
    () => normalizedSearch
      ? staff.filter((member: any) => {
          const haystack = [member.name, member.email, member.role, member.dealershipName, member.dealershipLocation, member.accessLevel]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalizedSearch);
        })
      : staff,
    [staff, normalizedSearch]
  );
  const filteredDealerships = useMemo(
    () => normalizedSearch
      ? dealerships.filter((dealership: any) => {
          const haystack = [dealership.name, dealership.brand, dealership.location, dealership.city, dealership.province]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalizedSearch);
        })
      : dealerships,
    [dealerships, normalizedSearch]
  );

  const advisors = filteredStaff.filter((s: any) => s.role === 'service_advisor');
  const salesExecs = filteredStaff.filter((s: any) => s.role === 'sales_executive');
  const drivers = filteredStaff.filter((s: any) => s.role === 'driver');
  const active = filteredStaff.filter((s: any) => s.isOnline || s.isActive !== false);

  const handleAdd = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    if (!cleanName || !cleanEmail || saving) return;
    setSaving(true);
    try {
      await addStaff({
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone || undefined,
        role,
        accessLevel,
        dealershipId: dealershipId || undefined,
        dealershipName: dealerships.find((d: any) => String(d._id) === dealershipId)?.name,
        dealershipBrand: dealerships.find((d: any) => String(d._id) === dealershipId)?.brand,
        dealershipLocation: dealerships.find((d: any) => String(d._id) === dealershipId)?.location,
      });
      setName('');
      setEmail('');
      setPhone('');
      setRole('service_advisor');
      setAccessLevel('limited_access');
      setDealershipId('');
      setShowAdd(false);
    } catch (e) {
    } finally {
      setSaving(false);
    }
  };

  const handleAddDealership = async () => {
    const name = dealershipName.trim();
    const location = dealershipLocation.trim();
    if (!name || !location || saving) return;
    setSaving(true);
    try {
      const payload = {
        name,
        brand: dealershipBrand.trim() || 'Hyundai',
        location,
        city: dealershipCity.trim() || undefined,
        province: dealershipProvince.trim() || undefined,
        address: dealershipAddress.trim() || undefined,
        phone: dealershipPhone.trim() || undefined,
        contactEmail: dealershipEmail.trim() || undefined,
      };

      if (editingDealershipId) {
        await updateDealership({
          dealershipId: editingDealershipId as any,
          ...payload,
        });
      } else {
        const createdDealershipId = await addDealership(payload);
        setAssignmentDealershipId(String(createdDealershipId));
      }
      setDealershipName('');
      setDealershipBrand('Hyundai');
      setDealershipLocation('');
      setDealershipCity('');
      setDealershipProvince('');
      setDealershipAddress('');
      setDealershipPhone('');
      setDealershipEmail('');
      setEditingDealershipId(null);
      setShowDealerships(false);
    } catch (error: any) {
      Alert.alert('Unable to save dealership', error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openDealershipEditor = (dealership: any) => {
    setEditingDealershipId(String(dealership._id));
    setDealershipName(String(dealership.name ?? ''));
    setDealershipBrand(String(dealership.brand ?? 'Hyundai'));
    setDealershipLocation(String(dealership.location ?? ''));
    setDealershipCity(String(dealership.city ?? ''));
    setDealershipProvince(String(dealership.province ?? ''));
    setDealershipAddress(String(dealership.address ?? ''));
    setDealershipPhone(String(dealership.phone ?? ''));
    setDealershipEmail(String(dealership.contactEmail ?? ''));
    setShowDealerships(true);
  };

  const resetDealershipForm = () => {
    setEditingDealershipId(null);
    setDealershipName('');
    setDealershipBrand('Hyundai');
    setDealershipLocation('');
    setDealershipCity('');
    setDealershipProvince('');
    setDealershipAddress('');
    setDealershipPhone('');
    setDealershipEmail('');
  };

  const handleAssignStaff = async (staffId: any, destinationDealershipId: string) => {
    if (!destinationDealershipId) {
      Alert.alert('Select a dealership', 'Choose the dealership before assigning staff.');
      return;
    }
    try {
      setAssigningStaffId(String(staffId));
      await assignStaff({ staffId, dealershipId: destinationDealershipId as any });
    } catch (error: any) {
      Alert.alert('Unable to assign staff', error?.message ?? 'Please try again.');
    } finally {
      setAssigningStaffId(null);
    }
  };

  const handleRemove = async (staffId: any) => {
    try {
      await removeStaff({ staffId });
    } catch (e) {
    }
  };

  const openDealershipForm = (staffMember?: any) => {
    if (staffMember) {
      setDealershipFormStaffId(String(staffMember._id));
      setDealershipId(String(staffMember.dealershipId ?? ''));
    } else {
      setDealershipFormStaffId(null);
      setDealershipId('');
    }
    setShowDealershipForm(true);
  };

  const saveStaffDealership = async () => {
    if (!dealershipId) {
      Alert.alert('Select a dealership', 'Choose a dealership first.');
      return;
    }
    if (!dealershipFormStaffId) {
      Alert.alert('Select staff', 'Choose a staff member first.');
      return;
    }

    try {
      const staffMember = staff.find((member: any) => String(member._id) === String(dealershipFormStaffId));
      const targetDealership = dealerships.find((dealership: any) => String(dealership._id) === dealershipId);
      if (!staffMember || !targetDealership) {
        Alert.alert('Unable to assign', 'Staff member or dealership could not be found.');
        return;
      }

      await assignStaff({
        staffId: staffMember._id,
        dealershipId: targetDealership._id,
      });
      setShowDealershipForm(false);
      setDealershipFormStaffId(null);
      setDealershipId('');
      Alert.alert('Saved', `${staffMember.name} assigned to ${targetDealership.name}.`);
    } catch (error: any) {
      Alert.alert('Unable to assign dealership', error?.message ?? 'Please try again.');
    }
  };

  const renderStaffCard = (member: any) => {
    const roleInfo = ROLES.find((r) => r.value === member.role);
    const roleTint = member.role === 'sales_executive' ? colors.primaryLight : member.role === 'driver' ? colors.success : colors.primary;

    return (
      <TouchableOpacity key={member._id} style={[styles.staffCard, !member.isActive && styles.staffInactive]} onPress={() => openStaffDetail(member)} activeOpacity={0.9}>
        <View style={[styles.avatar, { backgroundColor: roleTint + '14' }]}>
          {member.profileImage ? (
            <Image source={{ uri: member.profileImage }} style={styles.avatarImage} />
          ) : (
            <Ionicons
              name={(roleInfo?.icon || 'person') as any}
              size={20}
              color={roleTint}
            />
          )}
        </View>
        <View style={styles.staffInfo}>
          <View style={styles.staffTopRow}>
            <Text style={[styles.staffName, !member.isActive && styles.textInactive]}>{member.name}</Text>
            <View style={[styles.statusChip, { backgroundColor: member.isActive ? colors.success + '12' : colors.warning + '12' }]}>
              <Text style={[styles.statusChipText, { color: member.isActive ? colors.success : colors.warning }]}>
                {member.isActive ? 'Active' : 'Paused'}
              </Text>
            </View>
          </View>
          <Text style={styles.staffEmail}>{member.email}</Text>
          {member.phone ? <Text style={styles.staffPhone}>{member.phone}</Text> : null}
          <View style={styles.staffMetaRow}>
            <Text style={styles.staffAccess}>{member.accessLevel || 'limited_access'}</Text>
            <Text style={styles.staffDot}>•</Text>
            <Text style={styles.staffRole}>{roleInfo?.label ?? 'Staff'}</Text>
          </View>
        </View>
        <View style={styles.staffActions}>
          <TouchableOpacity
            style={[styles.actionBtn, member.isActive ? styles.activeBtn : styles.inactiveBtn]}
            onPress={() => toggleActive({ staffId: member._id })}
          >
            <Ionicons
              name={member.isActive ? 'checkmark-circle' : 'pause-circle'}
              size={16}
              color={member.isActive ? colors.success : colors.warning}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(member._id)}>
            <Ionicons name="trash-outline" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (isCustomerPublicView) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safe}>
          <View style={styles.hero}>
            <View style={styles.heroHeader}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={22} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.logBtn}>
                <Ionicons name="notifications-outline" size={18} color={colors.white} />
                <Text style={styles.logBtnText}>Alerts</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.heroTitle}>Available staff</Text>
            <Text style={styles.heroSub}>Choose a staff member to help with sales, service, or support. You will only see active staff members here.</Text>
          </View>

          <ScrollView contentContainerStyle={styles.scroll}>
            {publicStaff.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionText}>No staff are available right now.</Text>
              </View>
            ) : publicStaff.map((member: any) => {
              const staffRecipientId = String(member.userId ?? member.staffId ?? member._id ?? '');
              const canChat = Boolean(staffRecipientId);

              return (
                <View key={member.staffId ?? member.userId ?? member.name} style={styles.staffCard}>
                  <View style={[styles.avatar, { backgroundColor: colors.primary + '14' }]}>
                    <Ionicons name="person" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.staffInfo}>
                    <View style={styles.staffTopRow}>
                      <Text style={styles.staffName}>{member.name}</Text>
                      <View style={[styles.statusChip, { backgroundColor: member.isOnline ? colors.success + '12' : colors.warning + '12' }]}>
                        <Text style={[styles.statusChipText, { color: member.isOnline ? colors.success : colors.warning }]}>{member.isOnline ? 'Online' : 'Available'}</Text>
                      </View>
                    </View>
                    <Text style={styles.staffEmail}>{(member.role ?? 'staff').replace(/_/g, ' ')}</Text>
                    <Text style={styles.staffPhone}>{member.dealershipName || 'No dealership assigned'}</Text>
                    {member.phone ? <Text style={styles.staffPhone}>Phone: {member.phone}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={[styles.customerChatBtn, !canChat && styles.customerChatBtnDisabled]}
                    onPress={() => {
                      if (!canChat) {
                        Alert.alert('Chat unavailable', 'This staff member does not have a linked chat account yet.');
                        return;
                      }
                      navigation.navigate('StaffChat', {
                        recipientId: staffRecipientId,
                        recipientName: member.name,
                        chatType: 'staff',
                      });
                    }}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.white} />
                    <Text style={styles.customerChatBtnText}>Chat</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.hero}>
          <View style={styles.heroHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.white} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('ActivityFeed')} style={styles.logBtn}>
              <Ionicons name="pulse-outline" size={18} color={colors.white} />
              <Text style={styles.logBtnText}>Logbook</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.heroTitle}>Staff management</Text>
          <Text style={styles.heroSub}>A cleaner command surface for assignments, teams, dealership structure, and branch allocation.</Text>
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCard}><Text style={styles.heroStatValue}>{active.length}</Text><Text style={styles.heroStatLabel}>Active</Text></View>
            <View style={styles.heroStatCard}><Text style={styles.heroStatValue}>{advisors.length}</Text><Text style={styles.heroStatLabel}>Service</Text></View>
            <View style={styles.heroStatCard}><Text style={styles.heroStatValue}>{salesExecs.length}</Text><Text style={styles.heroStatLabel}>Sales</Text></View>
            <View style={styles.heroStatCard}><Text style={styles.heroStatValue}>{drivers.length}</Text><Text style={styles.heroStatLabel}>Drivers</Text></View>
          </View>
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('StaffProfile')}>
              <Ionicons name="person-circle-outline" size={16} color={colors.white} />
              <Text style={styles.heroActionText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroActionBtn} onPress={() => navigation.navigate('SocialFeed')}>
              <Ionicons name="newspaper-outline" size={16} color={colors.white} />
              <Text style={styles.heroActionText}>Feed</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroActionBtn} onPress={openPartsOrders}>
              <Ionicons name="cube-outline" size={16} color={colors.white} />
              <Text style={styles.heroActionText}>Parts & Accessories</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.assignmentBanner}>
            <View style={styles.bannerIcon}><Ionicons name="git-compare-outline" size={18} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.assignmentTitle}>Dealership hub</Text>
              <Text style={styles.assignmentSub}>Route service bookings, sales enquiries, test drives, and parts orders to the right staff member and dealership.</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('StaffInbox')}>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={colors.textLight} />
            <TextInput style={styles.searchInput} placeholder="Search staff or dealerships" placeholderTextColor={colors.textLight} value={staffSearch} onChangeText={setStaffSearch} />
            {staffSearch ? <TouchableOpacity onPress={() => setStaffSearch('')}><Ionicons name="close-circle" size={18} color={colors.textLight} /></TouchableOpacity> : null}
          </View>

          <View style={styles.groupSection}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>Dealerships</Text>
              <Text style={styles.groupCount}>{dealerships.length} locations</Text>
            </View>
            <TouchableOpacity style={styles.addDealershipBtn} onPress={() => openDealershipForm()}>
              <Ionicons name="business-outline" size={18} color={colors.primary} />
              <Text style={styles.addDealershipBtnText}>Create dealership</Text>
            </TouchableOpacity>
            {dealerships.length === 0 ? (
              <View style={styles.emptySection}><Text style={styles.emptySectionText}>No dealerships added yet</Text></View>
            ) : dealerships.map((dealership: any) => (
              <TouchableOpacity key={dealership._id} style={styles.dealershipHeroCard} activeOpacity={0.88} onPress={() => openDealershipEditor(dealership)}>
                {dealership.backgroundImageUrl ? (
                  <ImageBackground
                    source={{ uri: dealership.backgroundImageUrl }}
                    style={styles.dealershipHeroImage}
                    imageStyle={styles.dealershipHeroImageStyle}
                  >
                    <View style={styles.dealershipHeroOverlay} />
                    <View style={styles.dealershipHeroTopRow}>
                      <View style={styles.dealershipHeroBadge}>
                        <Ionicons name="business-outline" size={14} color={colors.white} />
                        <Text style={styles.dealershipHeroBadgeText}>{dealership.brand}</Text>
                      </View>
                      <View style={styles.dealershipHeroCountBadge}>
                        <Text style={styles.dealershipHeroCountText}>{dealership.onlineStaffCount} online</Text>
                      </View>
                    </View>
                    <View style={styles.dealershipHeroFooter}>
                      <Text style={styles.dealershipHeroTitle} numberOfLines={1}>{dealership.name}</Text>
                      <Text style={styles.dealershipHeroSub} numberOfLines={1}>{dealership.location}{[dealership.city, dealership.province].filter(Boolean).length ? ` • ${[dealership.city, dealership.province].filter(Boolean).join(', ')}` : ''}</Text>
                    </View>
                  </ImageBackground>
                ) : (
                  <View style={styles.dealershipHeroFallback}>
                    <View style={styles.dealershipHeroTopRow}>
                      <View style={styles.dealershipHeroBadge}>
                        <Ionicons name="business-outline" size={14} color={colors.white} />
                        <Text style={styles.dealershipHeroBadgeText}>{dealership.brand}</Text>
                      </View>
                      <View style={styles.dealershipHeroCountBadge}>
                        <Text style={styles.dealershipHeroCountText}>{dealership.onlineStaffCount} online</Text>
                      </View>
                    </View>
                    <View style={styles.dealershipHeroFooter}>
                      <Text style={styles.dealershipHeroTitle} numberOfLines={1}>{dealership.name}</Text>
                      <Text style={styles.dealershipHeroSub} numberOfLines={1}>{dealership.location}{[dealership.city, dealership.province].filter(Boolean).length ? ` • ${[dealership.city, dealership.province].filter(Boolean).join(', ')}` : ''}</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.groupSection}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>Service team</Text>
              <Text style={styles.groupCount}>{advisors.length} people</Text>
            </View>
            {advisors.length === 0 ? <View style={styles.emptySection}><Text style={styles.emptySectionText}>No service advisors added yet</Text></View> : advisors.map(renderStaffCard)}
          </View>

          <View style={styles.groupSection}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>Sales team</Text>
              <Text style={styles.groupCount}>{salesExecs.length} people</Text>
            </View>
            {salesExecs.length === 0 ? <View style={styles.emptySection}><Text style={styles.emptySectionText}>No sales executives added yet</Text></View> : salesExecs.map(renderStaffCard)}
          </View>

          <View style={styles.groupSection}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>Drivers</Text>
              <Text style={styles.groupCount}>{drivers.length} people</Text>
            </View>
            {drivers.length === 0 ? <View style={styles.emptySection}><Text style={styles.emptySectionText}>No drivers added yet</Text></View> : drivers.map(renderStaffCard)}
          </View>

          <View style={styles.groupSection}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>Allocate staff</Text>
              <Text style={styles.groupCount}>Assign by dealership</Text>
            </View>
            <TouchableOpacity style={styles.addDealershipBtn} onPress={() => openDealershipForm()}>
              <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
              <Text style={styles.addDealershipBtnText}>Allocate staff to dealership</Text>
            </TouchableOpacity>
            {filteredStaff.map((member: any) => (
              <TouchableOpacity key={member._id} style={styles.staffCard} activeOpacity={0.85} onPress={() => openDealershipForm(member)}>
                <View style={[styles.avatar, { backgroundColor: colors.primary + '14' }]}>
                  <Ionicons name="person" size={20} color={colors.primary} />
                </View>
                <View style={styles.staffInfo}>
                  <Text style={styles.staffName}>{member.name}</Text>
                  <Text style={styles.staffEmail}>{member.email}</Text>
                  <Text style={styles.staffPhone}>{member.dealershipName || 'No dealership assigned'}</Text>
                </View>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openDealershipForm(member)}>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <TouchableOpacity style={styles.fab} onPress={() => setShowAddActionSheet(true)}>
          <Ionicons name="add" size={28} color={colors.white} />
        </TouchableOpacity>

        <Modal visible={showAddActionSheet} transparent animationType="fade" onRequestClose={() => setShowAddActionSheet(false)}>
          <View style={styles.actionSheetOverlay}>
            <View style={styles.actionSheetCard}>
              <View style={styles.actionSheetHandle} />
              <Text style={styles.actionSheetTitle}>What do you want to add?</Text>
              <Text style={styles.actionSheetSub}>Create a staff member or create a dealership location first.</Text>

              <TouchableOpacity style={styles.actionSheetButton} onPress={openAddStaffModal}>
                <Ionicons name="person-add-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionSheetButtonTitle}>Add staff member</Text>
                  <Text style={styles.actionSheetButtonSub}>Invite or register a new staff record</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetButton} onPress={openCreateDealershipModal}>
                <Ionicons name="business-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionSheetButtonTitle}>Create dealership</Text>
                  <Text style={styles.actionSheetButtonSub}>Add a location so it appears in staff signup</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetCancelBtn} onPress={() => setShowAddActionSheet(false)}>
                <Text style={styles.actionSheetCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Add staff member</Text>
              <View style={{ width: 60 }} />
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.fieldLabel}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. John Smith"
                placeholderTextColor={colors.textLight}
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.fieldLabel}>Email Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. john@hyundai.com"
                placeholderTextColor={colors.textLight}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. +27 81 234 5678"
                placeholderTextColor={colors.textLight}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Role *</Text>
              <View style={styles.roleOptions}>
                {ROLES.map((r) => (
                  <TouchableOpacity
                    key={r.value}
                    style={[styles.roleOption, role === r.value && styles.roleSelected]}
                    onPress={() => setRole(r.value)}
                  >
                    <Ionicons
                      name={r.icon as any}
                      size={24}
                      color={role === r.value ? colors.white : colors.primary}
                    />
                    <Text style={[styles.roleLabel, role === r.value && styles.roleLabelSelected]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Access Level *</Text>
              <View style={styles.roleOptions}>
                {ACCESS_LEVELS.map((a) => (
                  <TouchableOpacity
                    key={a.value}
                    style={[styles.roleOption, accessLevel === a.value && styles.roleSelected]}
                    onPress={() => setAccessLevel(a.value)}
                  >
                    <Text style={[styles.roleLabel, accessLevel === a.value && styles.roleLabelSelected]}>
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Dealership</Text>
              <View style={styles.roleOptions}>
                <TouchableOpacity
                  style={[styles.roleOption, !dealershipId && styles.roleSelected]}
                  onPress={() => setDealershipId('')}
                >
                  <Text style={[styles.roleLabel, !dealershipId && styles.roleLabelSelected]}>No assignment</Text>
                </TouchableOpacity>
                {dealerships.map((dealership: any) => (
                  <TouchableOpacity
                    key={dealership._id}
                    style={[styles.roleOption, dealershipId === String(dealership._id) && styles.roleSelected]}
                    onPress={() => setDealershipId(String(dealership._id))}
                  >
                    <Text style={[styles.roleLabel, dealershipId === String(dealership._id) && styles.roleLabelSelected]}>{dealership.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.addBtn, (!name.trim() || !email.trim()) && styles.addBtnDisabled]}
                onPress={handleAdd}
                disabled={saving || !name.trim() || !email.trim()}
              >
                <Text style={styles.addBtnText}>{saving ? 'Adding...' : 'Add Staff Member'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        <Modal visible={showDealerships} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowDealerships(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editingDealershipId ? 'Edit dealership' : 'Add dealership'}</Text>
              <View style={{ width: 60 }} />
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.fieldLabel}>Dealership Name *</Text>
              <TextInput style={styles.input} value={dealershipName} onChangeText={setDealershipName} placeholder="e.g. Motus Hyundai Sandton" placeholderTextColor={colors.textLight} />
              <Text style={styles.fieldLabel}>Brand *</Text>
              <TextInput style={styles.input} value={dealershipBrand} onChangeText={setDealershipBrand} placeholder="Hyundai or Kia" placeholderTextColor={colors.textLight} />
              <Text style={styles.fieldLabel}>Location *</Text>
              <TextInput style={styles.input} value={dealershipLocation} onChangeText={setDealershipLocation} placeholder="e.g. Sandton" placeholderTextColor={colors.textLight} />
              <Text style={styles.fieldLabel}>City</Text>
              <TextInput style={styles.input} value={dealershipCity} onChangeText={setDealershipCity} placeholder="City" placeholderTextColor={colors.textLight} />
              <Text style={styles.fieldLabel}>Province</Text>
              <TextInput style={styles.input} value={dealershipProvince} onChangeText={setDealershipProvince} placeholder="Province" placeholderTextColor={colors.textLight} />
              <Text style={styles.fieldLabel}>Address</Text>
              <TextInput style={styles.input} value={dealershipAddress} onChangeText={setDealershipAddress} placeholder="Street address" placeholderTextColor={colors.textLight} />
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput style={styles.input} value={dealershipPhone} onChangeText={setDealershipPhone} placeholder="Contact number" placeholderTextColor={colors.textLight} keyboardType="phone-pad" />
              <Text style={styles.fieldLabel}>Contact Email</Text>
              <TextInput style={styles.input} value={dealershipEmail} onChangeText={setDealershipEmail} placeholder="dealership@email.com" placeholderTextColor={colors.textLight} autoCapitalize="none" />

              <TouchableOpacity style={styles.addBtn} onPress={handleAddDealership} disabled={saving || !dealershipName.trim() || !dealershipLocation.trim()}>
                <Text style={styles.addBtnText}>{saving ? 'Saving...' : editingDealershipId ? 'Update Dealership' : 'Save Dealership'}</Text>
              </TouchableOpacity>

              {editingDealershipId ? (
                <TouchableOpacity 
                  style={[styles.addBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, marginTop: spacing.md }]}
                  onPress={() => resetDealershipForm()}
                  disabled={saving}
                >
                  <Text style={[styles.addBtnText, { color: colors.text }]}>Clear Edit</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={styles.fieldLabel}>Assign staff to dealership</Text>
              <View style={styles.roleOptions}>
                {filteredDealerships.map((dealership: any) => (
                  <TouchableOpacity
                    key={dealership._id}
                    style={[styles.roleOption, assignmentDealershipId === String(dealership._id) && styles.roleSelected]}
                    onPress={() => setAssignmentDealershipId(String(dealership._id))}
                  >
                    <Text style={[styles.roleLabel, assignmentDealershipId === String(dealership._id) && styles.roleLabelSelected]}>
                      {dealership.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!assignmentDealershipId ? (
                <Text style={styles.assignmentHint}>Select a dealership first, then assign staff below.</Text>
              ) : null}

              {filteredStaff.filter((s: any) => s.isActive !== false).map((member: any) => (
                <View key={member._id} style={styles.staffCard}>
                  <View style={[styles.avatar, { backgroundColor: colors.primary + '14' }]}>
                    <Ionicons name="person" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.staffInfo}>
                    <Text style={styles.staffName}>{member.name}</Text>
                    <Text style={styles.staffEmail}>{member.role}</Text>
                    <Text style={styles.staffPhone}>{member.dealershipName || 'No dealership assigned'}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleAssignStaff(member._id, assignmentDealershipId)}
                    disabled={!assignmentDealershipId || assigningStaffId === String(member._id)}
                  >
                    <Ionicons name={assigningStaffId === String(member._id) ? 'time-outline' : 'swap-horizontal'} size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        </Modal>

        <Modal visible={showDealershipForm} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowDealershipForm(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Allocate dealership</Text>
              <View style={{ width: 60 }} />
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.fieldLabel}>Staff member</Text>
              <View style={styles.roleOptions}>
                {filteredStaff.map((member: any) => (
                  <TouchableOpacity
                    key={member._id}
                    style={[styles.roleOption, dealershipFormStaffId === String(member._id) && styles.roleSelected]}
                    onPress={() => setDealershipFormStaffId(String(member._id))}
                  >
                    <Text style={[styles.roleLabel, dealershipFormStaffId === String(member._id) && styles.roleLabelSelected]}>{member.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Dealership</Text>
              <View style={styles.roleOptions}>
                {dealerships.map((dealership: any) => (
                  <TouchableOpacity
                    key={dealership._id}
                    style={[styles.roleOption, dealershipId === String(dealership._id) && styles.roleSelected]}
                    onPress={() => setDealershipId(String(dealership._id))}
                  >
                    <Text style={[styles.roleLabel, dealershipId === String(dealership._id) && styles.roleLabelSelected]}>{dealership.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.addBtn} onPress={saveStaffDealership} disabled={!dealershipFormStaffId || !dealershipId}>
                <Text style={styles.addBtnText}>Save allocation</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        <Modal visible={!!selectedStaff} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedStaff(null)}>
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelectedStaff(null)}>
                <Text style={styles.cancelText}>Close</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Staff detail</Text>
              <View style={{ width: 60 }} />
            </View>

            {selectedStaff ? (
              <ScrollView contentContainerStyle={styles.modalContent}>
                <View style={styles.staffPhotoHero}>
                  <TouchableOpacity style={styles.staffPhotoWrap} onPress={() => handlePickStaffPhoto(selectedStaff)} disabled={uploadingPhoto}>
                    <View style={styles.avatarLarge}>
                      {selectedStaff.profileImage ? (
                        <Image source={{ uri: selectedStaff.profileImage }} style={styles.avatarImage} />
                      ) : (
                        <Ionicons name="person" size={34} color={colors.primary} />
                      )}
                    </View>
                    <View style={styles.photoPill}>
                      {uploadingPhoto ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="camera-outline" size={12} color={colors.primary} />}
                      <Text style={styles.photoPillText}>Edit photo</Text>
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.staffPhotoName}>{selectedStaff.name}</Text>
                  <Text style={styles.staffPhotoMeta}>{selectedStaff.email}</Text>
                </View>

                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>Phone</Text>
                  <Text style={styles.detailValue}>{selectedStaff.phone || 'No phone'}</Text>
                  <Text style={styles.detailLabel}>Role</Text>
                  <Text style={styles.detailValue}>{selectedStaff.role || 'Staff'}</Text>
                  <Text style={styles.detailLabel}>Access level</Text>
                  <Text style={styles.detailValue}>{selectedStaff.accessLevel || 'limited_access'}</Text>
                  <Text style={styles.detailLabel}>Dealership</Text>
                  <Text style={styles.detailValue}>{selectedStaff.dealershipName || 'Unassigned'}</Text>
                </View>
              </ScrollView>
            ) : null}
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1 },
  hero: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  logBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  logBtnText: { fontSize: 12, fontWeight: '800', color: colors.white },
  heroTitle: { fontSize: 28, fontWeight: '900', color: colors.white, marginTop: spacing.lg },
  heroSub: { fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.8)', marginTop: 8, fontWeight: '500' },
  heroStatsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  heroStatCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: radius.lg, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  heroStatValue: { fontSize: 18, fontWeight: '900', color: colors.white },
  heroStatLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.74)', marginTop: 2, textTransform: 'uppercase' },
  heroActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, flexWrap: 'wrap' },
  heroActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full },
  heroActionText: { fontSize: 12, fontWeight: '800', color: colors.white },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120 },
  assignmentBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.primary + '10', borderRadius: 24, padding: 14, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.primary + '25' },
  bannerIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  assignmentTitle: { fontSize: 15, fontWeight: '900', color: colors.primary },
  assignmentSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3, lineHeight: 17, fontWeight: '500' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.borderLight, marginBottom: spacing.lg },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, borderWidth: 0 },
  groupSection: { marginTop: spacing.xl },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  groupTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  groupCount: { fontSize: 12, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase' },
  emptySection: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, alignItems: 'center' },
  emptySectionText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  staffCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, padding: 14, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.borderLight, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  staffInactive: { opacity: 0.7 },
  avatar: { width: 42, height: 42, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarLarge: { width: 88, height: 88, borderRadius: 28, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: colors.surface },
  dealershipHeroCard: { marginBottom: spacing.md, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  dealershipHeroImage: { minHeight: 180, padding: spacing.lg, justifyContent: 'space-between' },
  dealershipHeroImageStyle: { borderRadius: 28 },
  dealershipHeroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  dealershipHeroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  dealershipHeroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.full, backgroundColor: 'rgba(0,0,0,0.26)' },
  dealershipHeroBadgeText: { fontSize: 11, fontWeight: '900', color: colors.white },
  dealershipHeroCountBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  dealershipHeroCountText: { fontSize: 11, fontWeight: '900', color: colors.white },
  dealershipHeroFooter: { alignSelf: 'stretch' },
  dealershipHeroTitle: { fontSize: 22, fontWeight: '900', color: colors.white },
  dealershipHeroSub: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.94)', marginTop: 4 },
  dealershipHeroFallback: { minHeight: 180, padding: spacing.lg, justifyContent: 'space-between', borderRadius: 28, backgroundColor: colors.primary + '10' },
  staffPhotoHero: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.xl },
  staffPhotoWrap: { alignItems: 'center' },
  staffPhotoName: { fontSize: 20, fontWeight: '900', color: colors.text, marginTop: spacing.md },
  staffPhotoMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  staffInfo: { flex: 1 },
  staffTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  staffName: { fontSize: 15, fontWeight: '800', color: colors.text, flex: 1 },
  textInactive: { color: colors.textLight },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
  statusChipText: { fontSize: 10, fontWeight: '900' },
  staffEmail: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  staffPhone: { fontSize: 12, color: colors.textLight, marginTop: 1, fontWeight: '500' },
  staffMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  staffAccess: { fontSize: 11, color: colors.primary, fontWeight: '900', textTransform: 'uppercase' },
  staffDot: { fontSize: 12, color: colors.textLight },
  staffRole: { fontSize: 11, color: colors.textSecondary, fontWeight: '700' },
  staffActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionBtn: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  activeBtn: { backgroundColor: colors.success + '12' },
  inactiveBtn: { backgroundColor: colors.warning + '12' },
  removeBtn: { width: 38, height: 38, borderRadius: 14, backgroundColor: colors.error + '10', justifyContent: 'center', alignItems: 'center' },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, width: 56, height: 56, borderRadius: 18, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  actionSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  actionSheetCard: { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, borderTopWidth: 1, borderColor: colors.borderLight },
  actionSheetHandle: { width: 44, height: 5, borderRadius: 999, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.md },
  actionSheetTitle: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'center' },
  actionSheetSub: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: spacing.lg },
  actionSheetButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: 20, padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.borderLight },
  actionSheetButtonTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  actionSheetButtonSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  actionSheetCancelBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  actionSheetCancelText: { fontSize: 15, fontWeight: '800', color: colors.textLight },
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight, backgroundColor: colors.surface },
  modalTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  cancelText: { fontSize: 15, color: colors.primaryLight, fontWeight: '700' },
  modalContent: { padding: spacing.lg, paddingBottom: 40 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  roleOption: {
    width: '48%',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleLabel: { fontSize: 12, fontWeight: '600', color: colors.text, textAlign: 'center' },
  roleLabelSelected: { color: colors.white },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xxl,
    alignItems: 'center',
  },
  addDealershipBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  addDealershipBtnText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { fontSize: 16, fontWeight: '900', color: colors.white },
  assignmentHint: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
  photoPill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '20' },
  photoPillText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  detailBlock: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, marginHorizontal: spacing.lg, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  detailLabel: { fontSize: 11, fontWeight: '900', color: colors.textLight, textTransform: 'uppercase', marginBottom: 4, marginTop: spacing.md },
  detailValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  customerAssignmentFootnote: {
    marginTop: 12,
    fontSize: 12,
    color: colors.textLight,
    textAlign: 'center',
  },
  customerChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  customerChatBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '900',
  },
  customerChatBtnDisabled: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
});