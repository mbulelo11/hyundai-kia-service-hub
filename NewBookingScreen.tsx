import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { PUBLIC_LANDING_URL } from '../lib/shareUtils';
import ShareSheetModal from './ShareSheetModal';
import { trackAnalyticsEvent } from '../lib/analytics';

const SERVICES = [
  { name: 'Minor Service', icon: 'construct-outline', desc: 'Oil change, filters, basic check' },
  { name: 'Major Service', icon: 'build-outline', desc: 'Full inspection & replacement' },
  { name: 'Annual / Yearly Service', icon: 'calendar-outline', desc: 'Scheduled yearly maintenance and inspection' },
  { name: 'Diagnostics', icon: 'analytics-outline', desc: 'Computer diagnostics scan' },
  { name: 'Brake Service', icon: 'disc-outline', desc: 'Brake pads, discs, fluid' },
  { name: 'Custom Request', icon: 'chatbox-ellipses-outline', desc: 'Describe your needs' },
];

const MINOR_SERVICE_AMOUNTS = [15000, 45000, 75000, 105000];
const MAJOR_SERVICE_AMOUNTS = [30000, 60000, 90000, 120000];
const ANNUAL_SERVICE_AMOUNTS = [12000, 24000, 36000, 48000];

const SERVICE_AMOUNT_OPTIONS: Record<string, number[]> = {
  'Minor Service': MINOR_SERVICE_AMOUNTS,
  'Major Service': MAJOR_SERVICE_AMOUNTS,
  'Annual / Yearly Service': ANNUAL_SERVICE_AMOUNTS,
};

function formatAmount(value: number) {
  return `KM${value.toLocaleString('en-ZA')}`;
}

const TIME_SLOTS = ['07:00', '07:30', '08:00', '08:30', '09:00'];

function isToday(value: string) {
  return value === new Date().toISOString().split('T')[0];
}

function isAfterMorningCutoff() {
  const now = new Date();
  return now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 0);
}

function getNext14Days(): { label: string; value: string; dayName: string }[] {
  const days: { label: string; value: string; dayName: string }[] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const startOffset = isAfterMorningCutoff() ? 1 : 0;
  for (let i = startOffset; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (d.getDay() === 0) continue; // skip Sundays
    const value = d.toISOString().split('T')[0];
    const label = `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
    days.push({ label, value, dayName: dayNames[d.getDay()] });
  }
  return days;
}

export default function NewBookingScreen({ navigation, route }: any) {
  const me = useQuery(api.users.me);
  const vehiclesResult = useQuery(api.vehicles.list);
  const vehicles = React.useMemo(() => vehiclesResult ?? [], [vehiclesResult]);
  const createBooking = useMutation(api.bookings.create);
  const voiceDraft = route?.params?.voiceDraft ?? null;
  const autoSubmit = route?.params?.autoSubmit ?? false;

  const [step, setStep] = useState(0);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState('');
  const [serviceAmount, setServiceAmount] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [showShareSheet, setShowShareSheet] = useState(false);
  const autoSubmittedRef = useRef(false);

  // Auto-select default vehicle
  React.useEffect(() => {
    if (!vehicleId && vehicles.length > 0) {
      const def = vehicles.find((v: any) => v.isDefault);
      if (def) setVehicleId(def._id);
    }
  }, [vehicles, vehicleId]);

  React.useEffect(() => {
    if (!voiceDraft) return;
    if (voiceDraft.serviceType) setServiceType(voiceDraft.serviceType);
    if (!voiceDraft.serviceType && voiceDraft.notes) setServiceType('Custom Request');
    if (voiceDraft.date) setDate(voiceDraft.date);
    if (voiceDraft.timeSlot) setTimeSlot(voiceDraft.timeSlot);
    if (voiceDraft.notes) setNotes(voiceDraft.notes);
    if (voiceDraft.serviceType || voiceDraft.notes) setStep((s: number) => Math.max(s, 1));
    if (voiceDraft.date || voiceDraft.timeSlot) setStep((s: number) => Math.max(s, 2));
  }, [voiceDraft]);

  const dates = getNext14Days();
  const selectedVehicle = vehicles.find((v: any) => v._id === vehicleId);
  const selectedCustomerLabel = me?.name ?? me?.email ?? 'Customer';
  const serviceAmountOptions = SERVICE_AMOUNT_OPTIONS[serviceType] ?? [];
  const selectedServiceAmount = serviceAmount;

  const canProceed = () => {
    switch (step) {
      case 0: return !!vehicleId;
      case 1: return !!serviceType && (serviceAmountOptions.length === 0 || !!serviceAmount);
      case 2: return !!date && !!timeSlot && (!isToday(date) || !isAfterMorningCutoff());
      case 3: return true;
      default: return false;
    }
  };

  const handleSubmitWithDefaults = async (submitDate = date, submitTime = timeSlot) => {
    if (!vehicleId || !serviceType || !submitDate || !submitTime) return;
    if (serviceAmountOptions.length > 0 && !serviceAmount) {
      setBookingError('Please select a service amount before confirming.');
      return;
    }
    if (!TIME_SLOTS.includes(submitTime)) {
      setBookingError('Please choose a booking time between 07:00 and 09:00.');
      return;
    }
    if (isToday(submitDate) && isAfterMorningCutoff()) {
      setBookingError('Same-day bookings are closed after 09:00. Please select tomorrow.');
      return;
    }
    setSubmitting(true);
    setBookingError('');
    try {
      await createBooking({
        vehicleId: vehicleId as any,
        serviceType,
        serviceAmount: serviceAmount ?? undefined,
        date: submitDate,
        timeSlot: submitTime,
        notes: notes.trim() || undefined,
      });
      void trackAnalyticsEvent('booking_submit', {
        booking_type: 'service',
        service_type: serviceType,
        service_amount: serviceAmount ?? undefined,
        vehicle_id: String(vehicleId),
        date: submitDate,
        time_slot: submitTime,
        route: 'NewBookingScreen',
      });
      setBookingSuccess(true);
    } catch (e: any) {
      setBookingError(e?.message || 'Failed to create booking. Please try again.');
    }
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!vehicleId || !serviceType || !date || !timeSlot) return;
    if (serviceAmountOptions.length > 0 && !serviceAmount) {
      setBookingError('Please select a service amount before confirming.');
      return;
    }
    if (!TIME_SLOTS.includes(timeSlot)) {
      setBookingError('Please choose a booking time between 07:00 and 09:00.');
      return;
    }
    if (isToday(date) && isAfterMorningCutoff()) {
      setBookingError('Same-day bookings are closed after 09:00. Please select tomorrow.');
      return;
    }
    setSubmitting(true);
    setBookingError('');
    try {
      await createBooking({
        vehicleId: vehicleId as any,
        serviceType,
        serviceAmount: serviceAmount ?? undefined,
        date,
        timeSlot,
        notes: notes.trim() || undefined,
      });
      void trackAnalyticsEvent('booking_submit', {
        booking_type: 'service',
        service_type: serviceType,
        service_amount: serviceAmount ?? undefined,
        vehicle_id: String(vehicleId),
        date,
        time_slot: timeSlot,
        route: 'NewBookingScreen',
      });
      setBookingSuccess(true);
    } catch (e: any) {
      setBookingError(e?.message || 'Failed to create booking. Please try again.');
    }
    setSubmitting(false);
  };

  useEffect(() => {
    if (!autoSubmit || autoSubmittedRef.current || submitting || bookingSuccess) return;
    if (!vehicleId || !serviceType) return;
    if (!date) setDate(dates[0]?.value ?? '');
    if (!timeSlot) setTimeSlot(TIME_SLOTS[0]);
    if (!date || !timeSlot) return;
    autoSubmittedRef.current = true;
    const run = async () => {
      setSubmitting(true);
      setBookingError('');
      try {
        await createBooking({
          vehicleId: vehicleId as any,
          serviceType,
          serviceAmount: serviceAmount ?? undefined,
          date,
          timeSlot,
          notes: notes.trim() || undefined,
        });
        void trackAnalyticsEvent('booking_submit', {
          booking_type: 'service',
          service_type: serviceType,
          service_amount: serviceAmount ?? undefined,
          vehicle_id: String(vehicleId),
          date,
          time_slot: timeSlot,
          route: 'NewBookingScreen',
          auto_submit: true,
        });
        setBookingSuccess(true);
      } catch (e: any) {
        setBookingError(e?.message || 'Failed to create booking. Please try again.');
      }
      setSubmitting(false);
    };
    void run();
  }, [autoSubmit, vehicleId, serviceType, date, timeSlot, submitting, bookingSuccess, createBooking, serviceAmount, notes, dates]);

  const stepTitles = ['Select Vehicle', 'Choose Service', 'Pick Date & Time', 'Review & Confirm'];

  // Success screen
  if (bookingSuccess) {
    const shareMessage = `Just booked my ${serviceType}${selectedServiceAmount ? ` for ${formatAmount(selectedServiceAmount)}` : ''} in seconds! Fast, easy, and reliable car service booking. 🚗⚡ #CarCare\n\nTry it: ${PUBLIC_LANDING_URL}`;

    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView edges={['top']} style={styles.safe}>
          <View style={styles.successContainer}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark" size={56} color={colors.white} />
            </View>
            <Text style={styles.successTitle}>Booking Confirmed!</Text>
            <Text style={styles.successSubtitle}>
              Your service has been successfully booked
            </Text>

            <View style={styles.successCard}>
              <View style={styles.successRow}>
                <Ionicons name="people" size={18} color={colors.primary} />
                <Text style={styles.successLabel}>Customer</Text>
                <Text style={styles.successValue}>{selectedCustomerLabel}</Text>
              </View>
              <View style={styles.successDivider} />
              <View style={styles.successRow}>
                <Ionicons name="car" size={18} color={colors.primary} />
                <Text style={styles.successLabel}>Vehicle</Text>
                <Text style={styles.successValue}>
                  {selectedVehicle
                    ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`
                    : 'N/A'}
                </Text>
              </View>
              <View style={styles.successDivider} />
              <View style={styles.successRow}>
                <Ionicons name="construct" size={18} color={colors.primary} />
                <Text style={styles.successLabel}>Service</Text>
                <Text style={styles.successValue}>{serviceType}</Text>
              </View>
              {selectedServiceAmount ? (
                <>
                  <View style={styles.successDivider} />
                  <View style={styles.successRow}>
                    <Ionicons name="pricetag" size={18} color={colors.primary} />
                    <Text style={styles.successLabel}>Amount</Text>
                    <Text style={styles.successValue}>{formatAmount(selectedServiceAmount)}</Text>
                  </View>
                </>
              ) : null}
              <View style={styles.successDivider} />
              <View style={styles.successRow}>
                <Ionicons name="calendar" size={18} color={colors.primary} />
                <Text style={styles.successLabel}>Date</Text>
                <Text style={styles.successValue}>{date}</Text>
              </View>
              <View style={styles.successDivider} />
              <View style={styles.successRow}>
                <Ionicons name="time" size={18} color={colors.primary} />
                <Text style={styles.successLabel}>Time</Text>
                <Text style={styles.successValue}>{timeSlot}</Text>
              </View>
            </View>

            <Text style={styles.successNote}>
              You'll receive status updates as your booking is processed.
            </Text>

            {/* Share Booking Button */}
            <TouchableOpacity
              style={styles.shareBookingBtn}
              onPress={() => setShowShareSheet(true)}
            >
              <Ionicons name="share-social" size={18} color={colors.primary} />
              <Text style={styles.shareBookingText}>Share Booking</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.successDoneBtn}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.successDoneBtnText}>Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.successViewBtn}
              onPress={() => {
                navigation.navigate('Main', { screen: 'BookingsTab' });
              }}
            >
              <Text style={styles.successViewBtnText}>View My Bookings</Text>
            </TouchableOpacity>
          </View>

          <ShareSheetModal
            visible={showShareSheet}
            onClose={() => setShowShareSheet(false)}
            message={shareMessage}
            title="Share Your Booking"
          />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => step > 0 ? setStep(step - 1) : navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{stepTitles[step]}</Text>
          <Text style={styles.stepIndicator}>{step + 1}/4</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((step + 1) / 4) * 100}%` }]} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Step 0: Vehicle */}
          {step === 0 && (
            <View style={styles.stepContent}>
              {vehicles.length === 0 ? (
                <View style={styles.noVehicles}>
                  <Ionicons name="car-outline" size={48} color={colors.textLight} />
                  <Text style={styles.noVehiclesText}>No vehicles added yet</Text>
                  <TouchableOpacity
                    style={styles.addVehicleBtn}
                    onPress={() => navigation.navigate('Vehicles')}
                  >
                    <Text style={styles.addVehicleBtnText}>Add Vehicle</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {vehicles.map((v: any) => (
                    <TouchableOpacity
                      key={v._id}
                      style={[styles.selectCard, vehicleId === v._id && styles.selectedCard]}
                      onPress={() => setVehicleId(v._id)}
                    >
                      <Ionicons
                        name="car"
                        size={24}
                        color={vehicleId === v._id ? colors.primary : colors.textSecondary}
                      />
                      <View style={styles.selectInfo}>
                        <Text style={styles.selectTitle}>
                          {v.year} {v.make} {v.model}
                        </Text>
                        <Text style={styles.selectSub}>{v.registration}</Text>
                      </View>
                      {vehicleId === v._id && (
                        <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </View>
          )}

          {/* Step 1: Service Type */}
          {step === 1 && (
            <View style={styles.stepContent}>
              {SERVICES.map((s) => (
                <TouchableOpacity
                  key={s.name}
                  style={[styles.serviceCard, serviceType === s.name && styles.selectedCard]}
                  onPress={() => {
                    setServiceType(s.name);
                    setServiceAmount(null);
                  }}
                >
                  <View style={[styles.serviceIcon, serviceType === s.name && styles.serviceIconActive]}>
                    <Ionicons
                      name={s.icon as any}
                      size={24}
                      color={serviceType === s.name ? colors.white : colors.primary}
                    />
                  </View>
                  <View style={styles.selectInfo}>
                    <Text style={styles.selectTitle}>{s.name}</Text>
                    <Text style={styles.selectSub}>{s.desc}</Text>
                  </View>
                  {serviceType === s.name && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}

              {serviceAmountOptions.length > 0 && (
                <View style={styles.amountGroup}>
                  <Text style={styles.subLabel}>Select Amount</Text>
                  <View style={styles.amountGrid}>
                    {serviceAmountOptions.map((amount) => (
                      <TouchableOpacity
                        key={amount}
                        style={[styles.amountChip, serviceAmount === amount && styles.amountChipActive]}
                        onPress={() => setServiceAmount(amount)}
                      >
                        <Text style={[styles.amountText, serviceAmount === amount && styles.amountTextActive]}>
                          {formatAmount(amount)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Step 2: Date & Time */}
          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.subLabel}>Select Date</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.datePicker}>
                {dates.map((d) => (
                  <TouchableOpacity
                    key={d.value}
                    style={[styles.dateChip, date === d.value && styles.dateChipActive]}
                    onPress={() => setDate(d.value)}
                  >
                    <Text style={[styles.dateDayName, date === d.value && styles.dateTextActive]}>
                      {d.dayName}
                    </Text>
                    <Text style={[styles.dateLabel, date === d.value && styles.dateTextActive]}>
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.subLabel, { marginTop: spacing.xl }]}>Select Time</Text>
              <View style={styles.timeGrid}>
                {TIME_SLOTS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.timeChip, timeSlot === t && styles.timeChipActive]}
                    onPress={() => setTimeSlot(t)}
                  >
                    <Text style={[styles.timeText, timeSlot === t && styles.timeTextActive]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.dropoffCard}>
                <View style={styles.dropoffHeaderRow}>
                  <View style={styles.dropoffIconWrap}>
                    <Ionicons name="location-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dropoffTitle}>Drop-off only</Text>
                    <Text style={styles.dropoffDesc}>
                      Customers may drop off vehicles within a 15 km radius of the dealership. Pickup is not available.
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <View style={styles.stepContent}>
              {bookingError ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={20} color="#D32F2F" />
                  <Text style={styles.errorText}>{bookingError}</Text>
                </View>
              ) : null}

              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Customer</Text>
                <Text style={styles.reviewValue}>{selectedCustomerLabel}</Text>

                <Text style={styles.reviewLabel}>Vehicle</Text>
                <Text style={styles.reviewValue}>
                  {selectedVehicle
                    ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`
                    : 'N/A'}
                </Text>

                <Text style={styles.reviewLabel}>Service</Text>
                <Text style={styles.reviewValue}>{serviceType}</Text>

                {selectedServiceAmount ? (
                  <>
                    <Text style={styles.reviewLabel}>Amount</Text>
                    <Text style={styles.reviewValue}>{formatAmount(selectedServiceAmount)}</Text>
                  </>
                ) : null}

                <Text style={styles.reviewLabel}>Date</Text>
                <Text style={styles.reviewValue}>{date}</Text>

                <Text style={styles.reviewLabel}>Time</Text>
                <Text style={styles.reviewValue}>{timeSlot}</Text>
              </View>

              <Text style={[styles.subLabel, { marginTop: spacing.xl }]}>
                Notes (optional)
              </Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Any special requests or issues..."
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          )}
        </ScrollView>

        {/* Bottom Button */}
        <View style={styles.bottomBar}>
          {step < 3 ? (
            <TouchableOpacity
              style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
              disabled={!canProceed()}
              onPress={() => setStep(step + 1)}
            >
              <Text style={styles.nextBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextBtn, (submitting || !canProceed()) && styles.nextBtnDisabled]}
              disabled={submitting || !canProceed()}
              onPress={() => handleSubmit()}
            >
              <Ionicons name="checkmark-circle" size={20} color={colors.white} />
              <Text style={styles.nextBtnText}>
                {submitting ? 'Booking...' : 'Confirm Booking'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  stepIndicator: { fontSize: 14, fontWeight: '600', color: colors.primaryLight },
  progressBar: {
    height: 3,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  scroll: { paddingBottom: 120 },
  stepContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  noVehicles: { alignItems: 'center', paddingVertical: 48 },
  noVehiclesText: { fontSize: 16, color: colors.textSecondary, marginTop: spacing.md },
  addVehicleBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  addVehicleBtnText: { fontSize: 15, fontWeight: '600', color: colors.white },
  selectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.borderLight,
  },
  selectedCard: { borderColor: colors.primary },
  selectInfo: { flex: 1 },
  selectTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  selectSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.borderLight,
  },
  serviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceIconActive: { backgroundColor: colors.primary },
  amountGroup: { marginTop: spacing.lg },
  amountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  amountChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amountChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  amountText: { fontSize: 14, fontWeight: '600', color: colors.text },
  amountTextActive: { color: colors.white },
  subLabel: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.md },
  memberGroup: { marginBottom: spacing.lg },
  memberRow: { gap: spacing.sm, paddingBottom: spacing.xs },
  memberChip: {
    minWidth: 150,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  memberChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  memberChipText: { fontSize: 14, fontWeight: '700', color: colors.text },
  memberChipTextActive: { color: colors.white },
  memberChipSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  memberChipSubActive: { color: 'rgba(255,255,255,0.82)' },
  memberEmptyChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  memberEmptyText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  datePicker: { marginBottom: spacing.md },
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
  dateDayName: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  dateLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 },
  dateTextActive: { color: colors.white },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  timeText: { fontSize: 14, fontWeight: '500', color: colors.text },
  timeTextActive: { color: colors.white },
  pickupCard: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickupCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pickupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pickupIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickupTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  pickupTitleActive: { color: colors.white },
  pickupDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  pickupDescActive: { color: 'rgba(255,255,255,0.85)' },
  pickupSwitch: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  pickupSwitchActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
  pickupSwitchText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  pickupSwitchTextActive: { color: colors.white },
  pickupToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickupToggleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pickupToggleText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  pickupToggleTextActive: { color: colors.white },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginTop: spacing.md,
  },
  reviewValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 2,
  },
  notesInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 100,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radius.lg,
  },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFEBEE',
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  errorText: { fontSize: 14, color: '#D32F2F', flex: 1 },
  // Success screen styles
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  successIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  successSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  successLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    width: 70,
  },
  successValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  successDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  successNote: {
    fontSize: 13,
    color: colors.textLight,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  successDoneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: radius.lg,
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  successDoneBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  successViewBtn: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  successViewBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  shareBookingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.lg,
    width: '100%',
    borderWidth: 1.5,
    borderColor: colors.primary,
    marginBottom: spacing.md,
  },
  shareBookingText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  dropoffCard: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dropoffHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dropoffIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropoffTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  dropoffDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
});