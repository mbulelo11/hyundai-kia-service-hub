import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePaginatedQuery, useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { showSuccessToast } from '../lib/toast';
import { trackAnalyticsEvent } from '../lib/analytics';

function getNext14Days(): { label: string; value: string; dayName: string }[] {
  const days: { label: string; value: string; dayName: string }[] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 1; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (d.getDay() === 0) continue;
    const value = d.toISOString().split('T')[0];
    const label = `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
    days.push({ label, value, dayName: dayNames[d.getDay()] });
  }
  return days;
}

export default function TestDriveBookingScreen({ navigation, route }: any) {
  const params = route?.params ?? {};
  const me = useQuery(api.users.me);
  const authReady = me !== undefined;
  const customerProfilesResult = useQuery(api.customerProfiles.list);
  const customerProfiles = useMemo(() => customerProfilesResult ?? [], [customerProfilesResult]);
  const isStaff = Boolean(
    me?.isOwner ||
    String(me?.email ?? '').toLowerCase() === 'vincentmm@hyundai.co.za' ||
    me?.staffRole === 'dp' ||
    me?.staffRole === 'sales_executive' ||
    me?.staffRole === 'sales' ||
    me?.staffRole === 'service_advisor' ||
    me?.role === 'staff'
  );
  const visibleStaffMenus = useQuery(
    api.widgetVisibility.getVisibleStaffMenuKeys,
    me?._id ? { staffUserId: String(me._id) } : 'skip'
  ) ?? [];
  const testDrivesEnabled = !isStaff || visibleStaffMenus.includes('test_drives');
  const inventoryResult = usePaginatedQuery(api.inventory.listPaged, { categoryFilter: undefined }, { initialNumItems: 20 });
  const myTestDrives = useQuery(api.testDrives.listMine) ?? [];
  const staffTestDrives = useQuery(api.testDrives.listAll) ?? [];
  const bookTestDrive = useMutation(api.testDrives.book);
  const acceptTestDrive = useMutation(api.testDrives.accept);
  const rejectTestDrive = useMutation(api.testDrives.reject);
  const rescheduleTestDrive = useMutation(api.testDrives.reschedule);
  const completeTestDrive = useMutation(api.testDrives.complete);
  const assignTestDrive = useMutation(api.testDrives.assign);
  const staffListResult = useQuery(api.staff.publicOnlineSalesAndServiceStaff);
  const staffList = useMemo(() => staffListResult ?? [], [staffListResult]);

  const inventory = useMemo(() => inventoryResult.results ?? [], [inventoryResult.results]);
  const vehicles = useMemo(
    () => inventory.filter((item: any) => item.category === 'New Cars' || item.category === 'Used Cars'),
    [inventory]
  );
  const dates = useMemo(() => getNext14Days(), []);
  const times = useMemo(() => ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'], []);
  const testDrives = isStaff ? staffTestDrives : myTestDrives;
  const customerCompletedTestDrives = myTestDrives.filter((td: any) => td.status === 'completed');

  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [voiceDraft, setVoiceDraft] = useState<any>(params.voiceDraft ?? null);
  const [selectedCustomerProfileId, setSelectedCustomerProfileId] = useState<string | null>(params.customerProfileId ? String(params.customerProfileId) : null);
  const [actionModal, setActionModal] = useState<{ mode: 'accept' | 'reject' | 'reschedule' | 'complete' | null; item: any | null }>({ mode: null, item: null });
  const [actionDate, setActionDate] = useState('');
  const [actionTime, setActionTime] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [assignModal, setAssignModal] = useState<any>(null);
  const autoSubmittedRef = useRef(false);

  const selectedVehicle = vehicles.find((v: any) => v._id === vehicleId);
  const selectedTestDrive = actionModal.item;

  useEffect(() => {
    if (params.voiceDraft) {
      setVoiceDraft(params.voiceDraft);
    }
  }, [params.voiceDraft]);

  useEffect(() => {
    if (selectedCustomerProfileId || customerProfiles.length === 0) return;
    const preferred = params.customerProfileId
      ? customerProfiles.find((profile: any) => String(profile._id) === String(params.customerProfileId))
      : customerProfiles.find((profile: any) => String(profile.linkedUserId ?? '') === String(me?._id ?? '')) ?? customerProfiles[0];
    if (preferred) setSelectedCustomerProfileId(String(preferred._id));
  }, [customerProfiles, me?._id, params.customerProfileId, selectedCustomerProfileId]);

  useEffect(() => {
    if (!voiceDraft) return;
    if (voiceDraft.date) setDate(voiceDraft.date);
    if (voiceDraft.timeSlot) setTimeSlot(voiceDraft.timeSlot);
    if (voiceDraft.notes) setNotes(voiceDraft.notes);
    if (voiceDraft.phone) setPhone(voiceDraft.phone);
    if (voiceDraft.inventoryItemId && vehicles.length > 0) {
      const match = vehicles.find((v: any) => String(v._id) === String(voiceDraft.inventoryItemId));
      if (match) setVehicleId(match._id);
    }
    if (!voiceDraft.date && dates[0]?.value) setDate(dates[0].value);
    if (!voiceDraft.timeSlot && times[0]) setTimeSlot(times[0]);
  }, [voiceDraft, vehicles, dates, times]);

  useEffect(() => {
    if (params.inventoryItemId && vehicles.length > 0) {
      const match = vehicles.find((v: any) => v._id === params.inventoryItemId);
      if (match) {
        setVehicleId(match._id);
        return;
      }
    }
    if (!vehicleId && vehicles.length > 0) {
      setVehicleId(vehicles[0]._id);
    }
  }, [params.inventoryItemId, vehicles, vehicleId]);

  const submitTestDrive = useCallback(async () => {
    if (!authReady) {
      setError('Please wait while we confirm your account.');
      return;
    }
    if (!me) {
      setError('Please sign in before booking a test drive.');
      return;
    }
    if (!vehicleId || !date || !timeSlot || !selectedVehicle || submitting || success) return;
    setSubmitting(true);
    setError('');
    try {
      await bookTestDrive({
        inventoryItemId: vehicleId as any,
        vehicleDescription: `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}${selectedVehicle.variant ? ` ${selectedVehicle.variant}` : ''}`,
        preferredDate: date,
        preferredTime: timeSlot,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
        customerProfileId: selectedCustomerProfileId ?? undefined,
      });
      void trackAnalyticsEvent('booking_submit', {
        booking_type: 'test_drive',
        vehicle_id: String(vehicleId),
        vehicle_description: `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}${selectedVehicle.variant ? ` ${selectedVehicle.variant}` : ''}`,
        date,
        time_slot: timeSlot,
        customer_profile_id: selectedCustomerProfileId ?? undefined,
        route: 'TestDriveBookingScreen',
      });
      setSuccess(true);
      showSuccessToast('Test drive booked', 'Your booking request was submitted successfully.');
    } catch (e: any) {
      setError(e?.message || 'Failed to book test drive.');
    }
    setSubmitting(false);
  }, [authReady, me, vehicleId, date, timeSlot, selectedVehicle, submitting, success, bookTestDrive, phone, notes, selectedCustomerProfileId]);

  useEffect(() => {
    const autoSubmit = Boolean(params.autoSubmit || voiceDraft);
    if (!autoSubmit || autoSubmittedRef.current || !vehicleId || !date || !timeSlot || !selectedVehicle) return;
    if (params.autoSubmit && !voiceDraft && !params.inventoryItemId) return;
    autoSubmittedRef.current = true;
    submitTestDrive();
  }, [params.autoSubmit, voiceDraft, vehicleId, date, timeSlot, selectedVehicle, params.inventoryItemId, submitTestDrive, selectedCustomerProfileId]);

  const canContinue = !!vehicleId;
  const canConfirm = !!vehicleId && !!date && !!timeSlot;

  const openAction = (mode: 'accept' | 'reject' | 'reschedule' | 'complete', item: any) => {
    setActionModal({ mode, item });
    setActionDate(item?.confirmedDate ?? item?.preferredDate ?? '');
    setActionTime(item?.confirmedTime ?? item?.preferredTime ?? '');
    setActionReason('');
  };

  const submitStaffAction = async () => {
    if (!selectedTestDrive || !actionModal.mode) return;
    try {
      if (actionModal.mode === 'accept') {
        await acceptTestDrive({
          testDriveId: selectedTestDrive._id,
          confirmedDate: actionDate.trim() || undefined,
          confirmedTime: actionTime.trim() || undefined,
        });
      } else if (actionModal.mode === 'reject') {
        await rejectTestDrive({
          testDriveId: selectedTestDrive._id,
          rejectionReason: actionReason.trim() || undefined,
        });
      } else if (actionModal.mode === 'reschedule') {
        await rescheduleTestDrive({
          testDriveId: selectedTestDrive._id,
          confirmedDate: actionDate.trim(),
          confirmedTime: actionTime.trim(),
        });
      } else if (actionModal.mode === 'complete') {
        await completeTestDrive({ testDriveId: selectedTestDrive._id });
      }
      setActionModal({ mode: null, item: null });
    } catch (e: any) {
      Alert.alert('Update failed', e?.message ?? 'Please try again.');
    }
  };

  const openAssignModal = (item: any) => {
    setAssignModal(item);
  };

  const handleAssignStaff = async (staff: any) => {
    if (!assignModal) return;
    try {
      await assignTestDrive({
        testDriveId: assignModal._id,
        assignedToUserId: staff.userId ?? undefined,
        assignedToName: staff.name ?? staff.email,
      });
      setAssignModal(null);
    } catch (e: any) {
      Alert.alert('Assignment failed', e?.message ?? 'Please try again.');
    }
  };

  const canReview = (td: any) => td.status === 'completed';

  const handleConfirm = async () => {
    await submitTestDrive();
  };

  if (success) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView edges={['top']} style={styles.safe}>
          <View style={styles.successWrap}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={72} color={colors.success} />
            </View>
            <Text style={styles.successTitle}>Test Drive Requested</Text>
            <Text style={styles.successText}>
              We received your request for {selectedVehicle?.year} {selectedVehicle?.make} {selectedVehicle?.model}. We'll confirm your slot shortly.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isStaff ? 'Test Drive Requests' : 'Book Test Drive'}</Text>
          <Text style={styles.stepText}>{canConfirm ? '3/3' : '1/3'}</Text>
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: canConfirm ? '100%' : '33%' }]} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>Choose a vehicle, pick a date and time, and come to the dealership for your test drive.</Text>
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {isStaff ? (
            <View style={styles.staffPanel}>
              {isStaff && !testDrivesEnabled ? (
                <View style={styles.empty}>
                  <Ionicons name="lock-closed-outline" size={48} color={colors.textLight} />
                  <Text style={styles.emptyTitle}>Test drives are turned off for your account</Text>
                  <Text style={styles.emptyText}>An admin can turn this feature back on from the staff access dropdown.</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.sectionLabel}>Incoming Requests</Text>
                  {testDrives.length === 0 ? (
                    <View style={styles.empty}>
                      <Ionicons name="car-outline" size={48} color={colors.textLight} />
                      <Text style={styles.emptyTitle}>No test drive requests yet</Text>
                      <Text style={styles.emptyText}>New requests will appear here with accept and reject actions.</Text>
                    </View>
                  ) : (
                    testDrives.map((td: any) => (
                      <View key={td._id} style={styles.staffCard}>
                        <View style={styles.staffCardTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.staffCardTitle}>{td.vehicleDescription}</Text>
                            <Text style={styles.staffCardMeta}>{td.userName} · {td.preferredDate} · {td.preferredTime}</Text>
                            <Text style={styles.staffCardMeta}>Assigned: {td.assignedToName || 'Unassigned'}</Text>
                            <Text style={styles.staffCardMeta}>Status: {td.status}</Text>
                            {td.confirmedDate || td.confirmedTime ? (
                              <Text style={styles.staffCardMeta}>Scheduled: {td.confirmedDate ?? td.preferredDate} · {td.confirmedTime ?? td.preferredTime}</Text>
                            ) : null}
                            {td.rejectionReason ? <Text style={styles.staffCardMeta}>Reason: {td.rejectionReason}</Text> : null}
                          </View>
                        </View>
                        <View style={styles.staffActionRow}>
                          <TouchableOpacity style={[styles.actionBtn, styles.assignBtn]} onPress={() => openAssignModal(td)}>
                            <Text style={styles.actionBtnText}>Assign staff</Text>
                          </TouchableOpacity>
                          {td.status === 'pending' && (
                            <>
                              <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => openAction('accept', td)}>
                                <Text style={styles.actionBtnText}>Accept</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => openAction('reject', td)}>
                                <Text style={styles.actionBtnText}>Reject</Text>
                              </TouchableOpacity>
                            </>
                          )}
                          {td.status === 'confirmed' && (
                            <>
                              <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => openAction('reschedule', td)}>
                                <Text style={styles.actionBtnText}>Change Schedule</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[styles.actionBtn, styles.completedBtn]} onPress={() => openAction('complete', td)}>
                                <Text style={styles.actionBtnText}>Mark Completed</Text>
                              </TouchableOpacity>
                            </>
                          )}
                          {td.status === 'completed' && !isStaff ? (
                            <TouchableOpacity
                              style={[styles.actionBtn, styles.completedBtn]}
                              onPress={() => navigation.navigate('Review', {
                                testDriveId: td._id,
                                serviceType: 'Test Drive',
                                vehicleDescription: td.vehicleDescription,
                                staffName: td.assignedToName,
                              })}
                            >
                              <Text style={styles.actionBtnText}>Leave a Review</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    ))
                  )}
                </>
              )}
            </View>
          ) : null}

          {!isStaff && (
            <>
              <Text style={styles.sectionLabel}>Select Member</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
                {customerProfiles.length === 0 ? (
                  <View style={styles.memberEmptyChip}><Text style={styles.memberEmptyText}>No member profile found</Text></View>
                ) : customerProfiles.map((profile: any) => (
                  <TouchableOpacity
                    key={profile._id}
                    style={[styles.memberChip, selectedCustomerProfileId === profile._id && styles.memberChipActive]}
                    onPress={() => setSelectedCustomerProfileId(String(profile._id))}
                  >
                    <Text style={[styles.memberChipText, selectedCustomerProfileId === profile._id && styles.memberChipTextActive]}>{profile.fullName}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.sectionLabel}>Select Vehicle</Text>

              {vehicles.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="car-outline" size={48} color={colors.textLight} />
                  <Text style={styles.emptyTitle}>No vehicles available</Text>
                  <Text style={styles.emptyText}>Please check back later for available stock.</Text>
                </View>
              ) : (
                vehicles.map((item: any) => (
                  <TouchableOpacity
                    key={item._id}
                    style={[styles.card, vehicleId === item._id && styles.cardActive]}
                    onPress={() => setVehicleId(item._id)}
                  >
                    <Ionicons name="car-sport" size={22} color={vehicleId === item._id ? colors.primary : colors.textSecondary} />
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle}>{item.year} {item.make} {item.model}</Text>
                      <Text style={styles.cardSub}>{item.variant || item.category}</Text>
                    </View>
                    {vehicleId === item._id && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                  </TouchableOpacity>
                ))
              )}

              {inventoryResult.status !== 'Exhausted' ? (
                <TouchableOpacity
                  style={[styles.loadMoreBtn, inventoryResult.status === 'LoadingMore' && styles.disabled]}
                  onPress={() => inventoryResult.loadMore(20)}
                  disabled={inventoryResult.status === 'LoadingMore'}
                >
                  <Text style={styles.loadMoreText}>{inventoryResult.status === 'LoadingMore' ? 'Loading more...' : 'Load more vehicles'}</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={styles.sectionLabel}>Select Date</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.xl }}>
                {dates.map((d: { label: string; value: string; dayName: string }) => (
                  <TouchableOpacity
                    key={d.value}
                    style={[styles.dateChip, date === d.value && styles.dateChipActive]}
                    onPress={() => setDate(d.value)}
                  >
                    <Text style={[styles.dateDay, date === d.value && styles.dateTextActive]}>{d.dayName}</Text>
                    <Text style={[styles.dateLabel, date === d.value && styles.dateTextActive]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.sectionLabel}>Select Time</Text>
              <View style={styles.timeWrap}>
                {times.map((t: string) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.timeChip, timeSlot === t && styles.timeChipActive]}
                    onPress={() => setTimeSlot(t)}
                  >
                    <Text style={[styles.timeText, timeSlot === t && styles.timeTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Phone Number (optional)</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Contact number"
                placeholderTextColor={colors.textLight}
                keyboardType="phone-pad"
              />

              <Text style={styles.sectionLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Anything we should know?"
                placeholderTextColor={colors.textLight}
                multiline
                textAlignVertical="top"
              />
            </>
          )}

          {!isStaff ? (
            <View style={styles.historySection}>
              <Text style={styles.sectionLabel}>My Test Drives</Text>
              {myTestDrives.length === 0 ? (
                <Text style={styles.emptyText}>No test drives booked yet.</Text>
              ) : (
                myTestDrives.map((td: any) => (
                  <View key={td._id} style={styles.historyCard}>
                    <Text style={styles.historyTitle}>{td.vehicleDescription}</Text>
                    <Text style={styles.historyMeta}>Requested: {td.preferredDate} · {td.preferredTime}</Text>
                    <Text style={styles.historyMeta}>Scheduled: {td.confirmedDate ?? td.preferredDate} · {td.confirmedTime ?? td.preferredTime}</Text>
                    <Text style={styles.historyMeta}>Sales executive: {td.assignedToName || 'Pending assignment'}</Text>
                    <Text style={styles.historyMeta}>Status: {td.status}</Text>
                    {td.status === 'confirmed' && (
                      <Text style={styles.historyHint}>You'll receive updates if the schedule changes.</Text>
                    )}
                    {td.status === 'completed' && (
                      <TouchableOpacity
                        style={[styles.primaryBtn, { marginTop: spacing.md }]}
                        onPress={() => navigation.navigate('Review', {
                          testDriveId: td._id,
                          serviceType: 'Test Drive',
                          vehicleDescription: td.vehicleDescription,
                          staffName: td.assignedToName,
                        })}
                      >
                        <Text style={styles.primaryBtnText}>Leave a Review</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>
          ) : null}
        </ScrollView>

        {!isStaff && (
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.primaryBtn, (!authReady || !canContinue || !canConfirm || submitting) && styles.disabled]}
              disabled={!authReady || !canContinue || !canConfirm || submitting}
              onPress={handleConfirm}
            >
              <Ionicons name="speedometer" size={18} color={colors.white} />
              <Text style={styles.primaryBtnText}>{!authReady ? 'Checking account...' : submitting ? 'Booking...' : 'Confirm Test Drive'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      <Modal visible={!!actionModal.mode} transparent animationType="slide" onRequestClose={() => setActionModal({ mode: null, item: null })}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{actionModal.mode === 'accept' ? 'Accept Test Drive' : actionModal.mode === 'reject' ? 'Reject Test Drive' : actionModal.mode === 'reschedule' ? 'Change Schedule' : 'Mark Completed'}</Text>
            {actionModal.mode !== 'complete' && (
              <>
                <TextInput style={styles.modalInput} value={actionDate} onChangeText={setActionDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textLight} />
                {actionModal.mode !== 'reject' && (
                  <TextInput style={styles.modalInput} value={actionTime} onChangeText={setActionTime} placeholder="HH:MM" placeholderTextColor={colors.textLight} />
                )}
              </>
            )}
            {actionModal.mode === 'reject' && (
              <TextInput style={[styles.modalInput, styles.modalTextArea]} value={actionReason} onChangeText={setActionReason} placeholder="Reason for rejection" placeholderTextColor={colors.textLight} multiline />
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => setActionModal({ mode: null, item: null })}>
                <Text style={styles.actionBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={submitStaffAction}>
                <Text style={styles.actionBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!assignModal} transparent animationType="slide" onRequestClose={() => setAssignModal(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Assign Staff</Text>
              <TouchableOpacity onPress={() => setAssignModal(null)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {staffList.map((staff: any) => (
                <TouchableOpacity key={staff.userId ?? staff.email} style={styles.staffAssignRow} onPress={() => void handleAssignStaff(staff)}>
                  <View style={styles.assignAvatar}><Ionicons name="person" size={18} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.staffAssignName}>{staff.name ?? staff.email}</Text>
                    <Text style={styles.staffAssignRole}>{staff.role}</Text>
                  </View>
                  {staff.isOnline ? <View style={styles.assignDot} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  stepText: { fontSize: 14, fontWeight: '600', color: colors.primaryLight },
  progressBar: { height: 3, backgroundColor: colors.border, marginHorizontal: spacing.lg, borderRadius: 99 },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 99 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: 120 },
  subtitle: { fontSize: 15, color: colors.textSecondary, marginBottom: spacing.lg },
  sectionLabel: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  memberChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm },
  memberChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  memberChipText: { fontSize: 14, fontWeight: '700', color: colors.text },
  memberChipTextActive: { color: colors.white },
  memberEmptyChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  memberEmptyText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  helpText: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md, marginTop: -spacing.sm, lineHeight: 18 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.error + '12',
    marginBottom: spacing.lg,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardActive: { borderColor: colors.primary },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  dateChip: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 70,
  },
  dateChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateDay: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  dateLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 },
  dateTextActive: { color: colors.white },
  timeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  timeText: { fontSize: 14, fontWeight: '600', color: colors.text },
  timeTextActive: { color: colors.white },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  textArea: { minHeight: 100 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radius.lg,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  disabled: { opacity: 0.5 },
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  successIcon: { marginBottom: spacing.lg },
  successTitle: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  successText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  loadMoreBtn: {
    alignSelf: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadMoreText: { color: colors.primary, fontWeight: '700' },
  staffPanel: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  staffCard: { marginBottom: spacing.lg },
  staffCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  staffCardTitle: { fontSize: 16, fontWeight: '600', color: colors.text, flex: 1 },
  staffCardMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  staffActionRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  actionBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  acceptBtn: { backgroundColor: colors.primary, borderColor: colors.primary },
  rejectBtn: { backgroundColor: colors.error, borderColor: colors.error },
  completedBtn: { backgroundColor: colors.success, borderColor: colors.success },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: colors.white },
  staffActionBtn: { backgroundColor: colors.primary + '10', paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary + '20' },
  assignBtn: { backgroundColor: colors.primaryLight + '20' },
  staffActionText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  historySection: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  historyCard: { marginBottom: spacing.lg },
  historyTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.md },
  historyMeta: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  historyHint: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' },
  modalWrap: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '90%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  modalInput: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  modalTextArea: { minHeight: 100 },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  assignAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center' },
  staffAssignRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  staffAssignName: { fontSize: 14, fontWeight: '700', color: colors.text },
  staffAssignRole: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  assignDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
});