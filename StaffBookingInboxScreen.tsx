import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

export default function StaffBookingInboxScreen({ navigation }: any) {
  const user = useQuery(api.users.me);
  const allBookings = useQuery(api.bookings.listAllStaffBookings);
  const allStaff = useQuery(api.staff.publicAvailableStaff);
  const createBooking = useMutation(api.bookings.create);
  
  const acceptBooking = useMutation(api.bookings.acceptBooking);
  const assignBooking = useMutation(api.bookings.assignBooking);

  const [refreshing, setRefreshing] = useState(false);
  const [selectedBookingForAssign, setSelectedBookingForAssign] = useState<any>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all'); // 'all', 'pending', 'confirmed', 'in-progress', 'completed'
  const [guestCustomerName, setGuestCustomerName] = useState('');
  const [guestCustomerPhone, setGuestCustomerPhone] = useState('');
  const [guestCustomerEmail, setGuestCustomerEmail] = useState('');
  const [guestVehicleMake, setGuestVehicleMake] = useState('');
  const [guestVehicleModel, setGuestVehicleModel] = useState('');
  const [guestVehicleYear, setGuestVehicleYear] = useState('');
  const [guestVehicleRegistration, setGuestVehicleRegistration] = useState('');
  const [guestVehicleColor, setGuestVehicleColor] = useState('');
  const [guestServiceType, setGuestServiceType] = useState('Major Service');
  const [guestDate, setGuestDate] = useState('');
  const [guestTimeSlot, setGuestTimeSlot] = useState('07:00');
  const [guestNotes, setGuestNotes] = useState('');

  const role = String(user?.staffRole ?? user?.role ?? '').trim().toLowerCase();
  const isAdmin = Boolean(user?.isOwner || String(user?.email ?? '').toLowerCase() === 'vincentmm@hyundai.co.za' || user?.staffRole === 'dp');
  const isSalesExec = ['sales', 'sales_executive', 'sales_manager'].includes(role);
  const isServiceStaff = Boolean(
    isAdmin ||
    isSalesExec ||
    user?.staffRole === 'service_advisor' ||
    user?.staffRole === 'service_manager' ||
    user?.staffRole === 'service_controller'
  );
  const canAssignServiceAdvisor = Boolean(isAdmin || isSalesExec || role === "service_manager" || role === "workshop_manager");
  // Modified the assignableServiceStaff filter as per comment
  const assignableServiceStaff = (allStaff ?? []).filter((staff: any) => {
    const staffRole = String(staff.role ?? staff.staffRole ?? '').trim().toLowerCase();
    if (isSalesExec) return staffRole === 'service_advisor';
    return ['service_advisor', 'service_manager', 'workshop_manager'].includes(staffRole);
  });
  
  const handleCreateGuestBooking = async () => {
    if (!guestCustomerName.trim() || !guestVehicleMake.trim() || !guestVehicleModel.trim() || !guestVehicleYear.trim() || !guestVehicleRegistration.trim()) {
      Alert.alert('Missing details', 'Please add the customer and vehicle details.');
      return;
    }
    const yearNumber = Number(guestVehicleYear);
    if (Number.isNaN(yearNumber)) {
      Alert.alert('Missing details', 'Please enter a valid vehicle year.');
      return;
    }
    try {
      setRefreshing(true);
      await createBooking({
        customerName: guestCustomerName.trim(),
        customerPhone: guestCustomerPhone.trim() || undefined,
        customerEmail: guestCustomerEmail.trim() || undefined,
        vehicleMake: guestVehicleMake.trim(),
        vehicleModel: guestVehicleModel.trim(),
        vehicleYear: yearNumber,
        vehicleRegistration: guestVehicleRegistration.trim(),
        vehicleColor: guestVehicleColor.trim() || undefined,
        serviceType: guestServiceType,
        date: guestDate || new Date().toISOString().split('T')[0],
        timeSlot: guestTimeSlot,
        notes: guestNotes.trim() || undefined,
      });
      setCreateModalVisible(false);
      setGuestCustomerName('');
      setGuestCustomerPhone('');
      setGuestCustomerEmail('');
      setGuestVehicleMake('');
      setGuestVehicleModel('');
      setGuestVehicleYear('');
      setGuestVehicleRegistration('');
      setGuestVehicleColor('');
      setGuestServiceType('Major Service');
      setGuestDate('');
      setGuestTimeSlot('07:00');
      setGuestNotes('');
      Alert.alert('Success', 'Walk-in service booking created.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setRefreshing(false);
    }
  };

  if (user === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading your account...</Text>
      </View>
    );
  }

  if (user === null) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Not authenticated</Text>
      </View>
    );
  }

  const bookingsArray = allBookings ?? [];
  const visibleBookings = isServiceStaff ? bookingsArray : [];

  // Filter by status
  const filteredBookings = statusFilter === 'all' 
    ? visibleBookings 
    : visibleBookings.filter((b: any) => b.status === statusFilter);

  const unassignedBookings = filteredBookings.filter((b: any) => !b.assignedTo);
  const myBookings = filteredBookings.filter((b: any) => b.assignedTo === user._id);
  const otherStaffBookings = filteredBookings.filter((b: any) => b.assignedTo && b.assignedTo !== user._id);

  // Stats for all statuses
  const pendingCount = visibleBookings.filter((b: any) => b.status === 'pending').length;
  const confirmedCount = visibleBookings.filter((b: any) => b.status === 'confirmed').length;
  const inProgressCount = visibleBookings.filter((b: any) => b.status === 'in-progress').length;
  const completedCount = visibleBookings.filter((b: any) => b.status === 'completed').length;

  const handleAccept = async (bookingId: string) => {
    try {
      setRefreshing(true);
      await acceptBooking({ bookingId });
      Alert.alert('Success', 'Booking accepted!');
      if (navigation?.replace) {
        navigation.replace('StaffBookingInbox');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleAssignToStaff = async (booking: any, staffMember: any) => {
    const assignedTo = staffMember?.staffId ?? staffMember?.userId;
    if (!assignedTo) return;

    try {
      setRefreshing(true);
      await assignBooking({ bookingId: booking._id, assignedTo, assignedToName: staffMember.name ?? staffMember.email });
      Alert.alert('Success', `Assigned to ${staffMember.name ?? staffMember.email}`);
      setAssignModalVisible(false);
      setSelectedBookingForAssign(null);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const openAssignModal = (booking: any) => {
    setSelectedBookingForAssign(booking);
    setAssignModalVisible(true);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.headerLabel}>BOOKINGS</Text>
              <Text style={styles.headerTitle}>Inbox</Text>
            </View>
            <TouchableOpacity style={styles.heroAction} onPress={() => navigation.navigate('StaffAnalytics')}>
              <Ionicons name="analytics-outline" size={16} color={colors.white} />
              <Text style={styles.heroActionText}>Analytics</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroStatsRow}>
            <View style={styles.badge}><Text style={styles.badgeNumber}>{unassignedBookings.length}</Text><Text style={styles.badgeLabel}>Unassigned</Text></View>
            <View style={styles.badge}><Text style={styles.badgeNumber}>{myBookings.length}</Text><Text style={styles.badgeLabel}>Mine</Text></View>
            <View style={styles.badge}><Text style={styles.badgeNumber}>{otherStaffBookings.length}</Text><Text style={styles.badgeLabel}>Team</Text></View>
          </View>

          <View style={styles.heroActionsRow}>
            <TouchableOpacity style={styles.heroSecondaryBtn} onPress={() => setCreateModalVisible(true)}>
              <Ionicons name="add-circle-outline" size={16} color={colors.white} />
              <Text style={styles.heroActionText}>New Walk-in Service Booking</Text>
            </TouchableOpacity>
          </View>

          {/* STATUS FILTER TABS */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterTabs} contentContainerStyle={styles.filterTabsContent}>
            <TouchableOpacity style={[styles.filterTab, statusFilter === 'all' && styles.filterTabActive]} onPress={() => setStatusFilter('all')}>
              <Text style={[styles.filterTabText, statusFilter === 'all' && styles.filterTabTextActive]}>All ({visibleBookings.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterTab, statusFilter === 'pending' && styles.filterTabActive]} onPress={() => setStatusFilter('pending')}>
              <Text style={[styles.filterTabText, statusFilter === 'pending' && styles.filterTabTextActive]}>Pending ({pendingCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterTab, statusFilter === 'confirmed' && styles.filterTabActive]} onPress={() => setStatusFilter('confirmed')}>
              <Text style={[styles.filterTabText, statusFilter === 'confirmed' && styles.filterTabTextActive]}>Confirmed ({confirmedCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterTab, statusFilter === 'in-progress' && styles.filterTabActive]} onPress={() => setStatusFilter('in-progress')}>
              <Text style={[styles.filterTabText, statusFilter === 'in-progress' && styles.filterTabTextActive]}>In Progress ({inProgressCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterTab, statusFilter === 'completed' && styles.filterTabActive]} onPress={() => setStatusFilter('completed')}>
              <Text style={[styles.filterTabText, statusFilter === 'completed' && styles.filterTabTextActive]}>Completed ({completedCount})</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="inbox" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Unassigned</Text>
            <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>{unassignedBookings.length}</Text></View>
          </View>

          {unassignedBookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              <Text style={styles.emptyText}>All caught up!</Text>
            </View>
          ) : unassignedBookings.map((booking: any) => (
            <BookingCard
              key={booking._id}
              booking={booking}
              onPress={() => navigation.navigate('StaffBookingDetail', { bookingId: booking._id })}
              onAccept={() => handleAccept(booking._id)}
              onAssign={() => openAssignModal(booking)}
              onChat={() => navigation.navigate('StaffChat', { bookingId: booking._id, customerName: booking.customerName })}
              showAssignButton={canAssignServiceAdvisor}
            />
          ))}
        </View>

        {myBookings.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-circle" size={18} color={colors.primaryLight} />
              <Text style={styles.sectionTitle}>My Active Work</Text>
              <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>{myBookings.length}</Text></View>
            </View>
            {myBookings.map((booking: any) => (
              <BookingCard key={booking._id} booking={booking} onPress={() => navigation.navigate('StaffBookingDetail', { bookingId: booking._id })} onChat={() => navigation.navigate('StaffChat', { bookingId: booking._id, customerName: booking.customerName })} isMyWork />
            ))}
          </View>
        )}

        {isAdmin && otherStaffBookings.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="people" size={18} color={colors.textSecondary} />
              <Text style={styles.sectionTitle}>Team Work</Text>
              <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>{otherStaffBookings.length}</Text></View>
            </View>
            {otherStaffBookings.map((booking: any) => (
              <BookingCard
                key={booking._id}
                booking={booking}
                onPress={() => navigation.navigate('StaffBookingDetail', { bookingId: booking._id })}
                onAssign={() => openAssignModal(booking)}
                isTeamWork
                showAssignButton={canAssignServiceAdvisor}
              />
            ))}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal visible={assignModalVisible} animationType="slide" transparent>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isSalesExec ? 'Assign Service Advisor' : 'Assign to Staff'}</Text>
            <TouchableOpacity onPress={() => setAssignModalVisible(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          {isSalesExec ? (
            <Text style={styles.assignHint}>Sales executives assign an available service advisor first.</Text>
          ) : null}
 
           <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.staffListContent}>
             {assignableServiceStaff.map((staff: any) => (
               <TouchableOpacity
                 key={staff.userId ?? staff.staffId ?? staff.email}
                 style={styles.staffOption}
                 onPress={() => { if (selectedBookingForAssign) handleAssignToStaff(selectedBookingForAssign, staff); }}
               >
                 <View style={styles.staffAvatar}><Ionicons name="person" size={18} color={colors.primary} /></View>
                 <View style={{ flex: 1 }}>
                   <Text style={styles.staffName}>{staff.name ?? staff.email}</Text>
                   <Text style={styles.staffRole}>{staff.staffRole ?? staff.role}</Text>
                 </View>
                 {staff.isOnline && <View style={styles.onlineIndicator} />}
               </TouchableOpacity>
             ))}
           </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={createModalVisible} animationType="slide" transparent>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Walk-in Service Booking</Text>
            <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.createFormContent}>
            <TextInput style={styles.formInput} placeholder="Customer name" value={guestCustomerName} onChangeText={setGuestCustomerName} placeholderTextColor={colors.textLight} />
            <TextInput style={styles.formInput} placeholder="Customer phone" value={guestCustomerPhone} onChangeText={setGuestCustomerPhone} placeholderTextColor={colors.textLight} keyboardType="phone-pad" />
            <TextInput style={styles.formInput} placeholder="Customer email" value={guestCustomerEmail} onChangeText={setGuestCustomerEmail} placeholderTextColor={colors.textLight} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.formInput} placeholder="Vehicle make" value={guestVehicleMake} onChangeText={setGuestVehicleMake} placeholderTextColor={colors.textLight} />
            <TextInput style={styles.formInput} placeholder="Vehicle model" value={guestVehicleModel} onChangeText={setGuestVehicleModel} placeholderTextColor={colors.textLight} />
            <TextInput style={styles.formInput} placeholder="Vehicle year" value={guestVehicleYear} onChangeText={setGuestVehicleYear} placeholderTextColor={colors.textLight} keyboardType="number-pad" />
            <TextInput style={styles.formInput} placeholder="Vehicle registration" value={guestVehicleRegistration} onChangeText={setGuestVehicleRegistration} placeholderTextColor={colors.textLight} />
            <TextInput style={styles.formInput} placeholder="Vehicle color (optional)" value={guestVehicleColor} onChangeText={setGuestVehicleColor} placeholderTextColor={colors.textLight} />
            <TextInput style={styles.formInput} placeholder="Service type" value={guestServiceType} onChangeText={setGuestServiceType} placeholderTextColor={colors.textLight} />
            <TextInput style={styles.formInput} placeholder="Date (YYYY-MM-DD)" value={guestDate} onChangeText={setGuestDate} placeholderTextColor={colors.textLight} />
            <TextInput style={styles.formInput} placeholder="Time slot (07:00-09:00)" value={guestTimeSlot} onChangeText={setGuestTimeSlot} placeholderTextColor={colors.textLight} />
            <TextInput style={[styles.formInput, styles.formTextArea]} placeholder="Notes" value={guestNotes} onChangeText={setGuestNotes} placeholderTextColor={colors.textLight} multiline />
            <TouchableOpacity style={styles.createBtn} onPress={handleCreateGuestBooking}>
              <Text style={styles.createBtnText}>Create Booking</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function BookingCard({ booking, onPress, onAccept, onAssign, onChat, showAssignButton, isMyWork, isTeamWork }: any) {
  return (
    <TouchableOpacity style={[styles.card, isMyWork && styles.cardMyWork, isTeamWork && styles.cardTeamWork]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardAccent} />
      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName}>{booking.customerName ?? 'Customer'}</Text>
            <Text style={styles.serviceType}>{booking.serviceType}</Text>
          </View>
          <View style={styles.statusBadge}><Text style={styles.statusText}>{booking.status}</Text></View>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.metaItem}><Ionicons name="calendar" size={12} color={colors.textSecondary} /><Text style={styles.metaText}>{booking.date}</Text></View>
          <View style={styles.metaItem}><Ionicons name="time" size={12} color={colors.textSecondary} /><Text style={styles.metaText}>{booking.timeSlot}</Text></View>
        </View>

        {booking.notes && <Text style={styles.notes} numberOfLines={1}>{booking.notes}</Text>}
      </View>

      <View style={styles.cardActions}>
        {onAccept && <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}><Ionicons name="checkmark" size={18} color={colors.white} /></TouchableOpacity>}
        {showAssignButton && onAssign && <TouchableOpacity style={styles.assignBtn} onPress={onAssign}><Ionicons name="person-add" size={16} color={colors.primary} /></TouchableOpacity>}
        {onChat && <TouchableOpacity style={styles.chatBtn} onPress={onChat}><Ionicons name="chatbubble-outline" size={16} color={colors.primary} /></TouchableOpacity>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: { backgroundColor: colors.background },
  hero: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  headerLabel: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.74)', textTransform: 'uppercase', letterSpacing: 0.8 },
  headerTitle: { fontSize: 28, fontWeight: '900', color: colors.white, marginTop: 2 },
  heroAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  heroActionText: { fontSize: 12, fontWeight: '800', color: colors.white },
  heroStatsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  heroActionsRow: { marginTop: spacing.md },
  heroSecondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  badge: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.lg, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  badgeNumber: { fontSize: 18, fontWeight: '900', color: colors.white },
  badgeLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.75)', marginTop: 2, textTransform: 'uppercase' },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  section: { marginVertical: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: colors.text, flex: 1 },
  sectionBadge: { backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
  sectionBadgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  emptyState: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm, backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.borderLight },
  emptyText: { fontSize: 15, fontWeight: '700', color: colors.text },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.md, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  cardAccent: { width: 4, alignSelf: 'stretch', borderRadius: 999, backgroundColor: colors.primary },
  cardMyWork: { borderLeftColor: colors.primary, backgroundColor: colors.surfaceElevated },
  cardTeamWork: { backgroundColor: colors.surfaceSoft, opacity: 1 },
  cardContent: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  customerName: { fontSize: 15, fontWeight: '900', color: colors.text },
  serviceType: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.primary + '15', borderRadius: radius.full },
  statusText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  cardMeta: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  notes: { fontSize: 11, color: colors.textSecondary, marginTop: spacing.sm, fontStyle: 'italic' },
  cardActions: { flexDirection: 'column', gap: 8 },
  acceptBtn: { width: 40, height: 40, backgroundColor: colors.success, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  assignBtn: { width: 40, height: 40, borderWidth: 2, borderColor: colors.primary, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '10' },
  chatBtn: { width: 40, height: 40, backgroundColor: colors.primary + '15', borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  modalContainer: { flex: 1, backgroundColor: colors.surfaceSoft },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight, backgroundColor: colors.surface },
  modalTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  assignHint: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  staffOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight, gap: spacing.md, backgroundColor: colors.surface },
  staffAvatar: { width: 40, height: 40, backgroundColor: colors.primary + '15', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  staffName: { fontSize: 14, fontWeight: '800', color: colors.text },
  staffRole: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  staffListContent: { paddingBottom: spacing.lg },
  staffOptionDisabled: { opacity: 0.5 },
  onlineIndicator: { width: 10, height: 10, backgroundColor: colors.success, borderRadius: 5 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    padding: spacing.lg,
  },
  filterTabs: {
    marginTop: spacing.md,
  },
  filterTabsContent: {
    paddingHorizontal: spacing.lg,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  filterTabActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderColor: 'rgba(255,255,255,0.30)',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    whiteSpace: 'nowrap',
  },
  filterTabTextActive: {
    color: colors.white,
    fontWeight: '800',
  },
  createFormContent: { padding: spacing.lg, gap: 10 },
  formInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 12, color: colors.text },
  formTextArea: { minHeight: 90, textAlignVertical: 'top' },
  createBtn: { marginTop: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.lg, alignItems: 'center', paddingVertical: 14 },
  createBtnText: { color: colors.white, fontSize: 15, fontWeight: '800' },
});
