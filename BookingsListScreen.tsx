import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Share,
  Animated,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { PUBLIC_LANDING_URL } from '../lib/shareUtils';
import ShareSheetModal from './ShareSheetModal';

const appBackgroundImage = require('../assets/WhatsApp Image 2026-05-06 at 10.25.35 AM.jpeg');

const SECTIONS = ['Upcoming', 'History'];

const STATUS_COLORS: Record<string, string> = {
  pending: colors.statusPending,
  confirmed: colors.statusConfirmed,
  'in-progress': colors.statusInProgress,
  completed: colors.statusCompleted,
};

const STATUS_ORDER = ['pending', 'confirmed', 'in-progress', 'completed'];

const SERVICE_ICONS: Record<string, string> = {
  'Minor Service': 'construct-outline',
  'Major Service': 'build-outline',
  'Annual / Yearly Service': 'calendar-outline',
  'Diagnostics': 'analytics-outline',
  'Brake Service': 'disc-outline',
  'Custom Request': 'chatbox-ellipses-outline',
};

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatAmount(value?: number) {
  return typeof value === 'number' ? `KM${value.toLocaleString('en-ZA')}` : '';
}

export default function BookingsListScreen({ navigation }: any) {
  const bookings = useQuery(api.bookings.listMine) ?? [];
  const vehicles = useQuery(api.vehicles.list) ?? [];
  const notifications = useQuery(api.notifications.listMine) ?? [];
  const submitRating = useMutation(api.ratings.submit);
  const [section, setSection] = useState<'Upcoming' | 'History'>('Upcoming');

  // Rating modal state
  const [ratingModal, setRatingModal] = useState(false);
  const [ratingBookingId, setRatingBookingId] = useState<string | null>(null);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  // Expanded booking detail
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const headerRise = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(headerRise, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(headerRise, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, [headerRise]);

  const upcomingBookings = bookings.filter((b: any) => b.status !== 'completed');
  const historyBookings = bookings.filter((b: any) => b.status === 'completed');
  const visibleBookings = section === 'Upcoming' ? upcomingBookings : historyBookings;
  const isHistoryView = section === 'History';

  const getVehicle = (id: string) => vehicles.find((v: any) => v._id === id);

  const completedUnrated = historyBookings.filter(
    (b: any) => b.status === 'completed' && !b.ratingId
  );

  const handleSubmitRating = async () => {
    if (!ratingBookingId || ratingStars === 0) return;
    setSubmittingRating(true);
    try {
      await submitRating({
        bookingId: ratingBookingId as any,
        rating: ratingStars,
        comment: ratingComment.trim() || undefined,
      });
      setRatingModal(false);
    } catch (e) {
      // Silent error handling for non-critical operation
    } finally {
      setSubmittingRating(false);
    }
  };

  // Count stats
  const stats = {
    total: bookings.length,
    upcoming: upcomingBookings.length,
    active: bookings.filter((b: any) => b.status === 'confirmed' || b.status === 'in-progress').length,
    history: historyBookings.length,
  };

  return (
    <View style={styles.container}>
      <ImageBackground source={appBackgroundImage} style={styles.wallpaper} resizeMode="cover">
        <View style={styles.wallpaperOverlay} />
        <SafeAreaView edges={['top']} style={styles.safe}>
          <Animated.View style={[styles.header, { transform: [{ translateY: headerRise.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }] }]}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>My bookings</Text>
            <TouchableOpacity onPress={() => navigation.navigate('NewBooking')}>
              <Ionicons name="add-circle" size={28} color={colors.primary} />
            </TouchableOpacity>
          </Animated.View>

          {/* Stats strip */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: colors.statusPending }]}>{stats.upcoming}</Text>
              <Text style={styles.statLabel}>Upcoming</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: colors.statusInProgress }]}>{stats.active}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: colors.statusCompleted }]}>{stats.history}</Text>
              <Text style={styles.statLabel}>History</Text>
            </View>
          </View>

          {/* Rating prompt banner */}
          {section === 'History' && completedUnrated.length > 0 && (
            <TouchableOpacity
              style={styles.ratingBanner}
              onPress={() => {
                const b = completedUnrated[0];
                const vehicle = getVehicle(b.vehicleId);
                navigation.navigate('Review', {
                  bookingId: b._id,
                  serviceType: b.serviceType,
                  vehicleDescription: vehicle
                    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
                    : undefined,
                  staffName: b.assignedToName,
                });
              }}
            >
              <Ionicons name="star" size={20} color="#F59E0B" />
              <Text style={styles.ratingBannerText}>
                You have {completedUnrated.length} completed service{completedUnrated.length > 1 ? 's' : ''} to rate
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}

          <View style={styles.sectionTabs}>
            {SECTIONS.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.sectionTab, section === item && styles.sectionTabActive]}
                onPress={() => setSection(item as 'Upcoming' | 'History')}
              >
                <Text style={[styles.sectionTabText, section === item && styles.sectionTabTextActive]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            {visibleBookings.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="document-outline" size={48} color={colors.textLight} />
                <Text style={styles.emptyText}>
                  {section === 'Upcoming' ? 'No upcoming or active bookings' : 'No completed bookings yet'}
                </Text>
                {section === 'Upcoming' ? (
                  <TouchableOpacity
                    style={styles.bookBtn}
                    onPress={() => navigation.navigate('NewBooking')}
                  >
                    <Text style={styles.bookBtnText}>Book service</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {visibleBookings.map((b: any) => {
              const vehicle = getVehicle(b.vehicleId);
              const statusColor = STATUS_COLORS[b.status] ?? colors.textLight;
              const isExpanded = expandedId === b._id;
              const needsRating = b.status === 'completed' && !b.ratingId;

              return (
                <TouchableOpacity
                  key={b._id}
                  style={[styles.card, isHistoryView && styles.historyCard]}
                  onPress={isHistoryView ? undefined : () => setExpandedId(isExpanded ? null : b._id)}
                  activeOpacity={isHistoryView ? 1 : 0.7}
                >
                  {/* Card header */}
                  <View style={styles.cardTop}>
                    <View style={styles.serviceRow}>
                      <View style={[styles.iconCircle, { backgroundColor: statusColor + '15' }, isHistoryView && styles.historyIconCircle]}>
                        <Ionicons
                          name={(SERVICE_ICONS[b.serviceType] ?? 'construct-outline') as any}
                          size={20}
                          color={statusColor}
                        />
                      </View>
                      <View style={styles.serviceInfo}>
                        <Text style={[styles.serviceName, isHistoryView && styles.historyServiceName]}>{b.serviceType}</Text>
                        {vehicle && (
                          <Text style={[styles.vehicleLabel, isHistoryView && styles.historyVehicleLabel]}>
                            {vehicle.year} {vehicle.make} {vehicle.model} - {vehicle.registration}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }, isHistoryView && styles.historyStatusPill]}>
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.statusLabel, { color: statusColor }, isHistoryView && styles.historyStatusLabel]}>
                          {String(b.status ?? 'pending').charAt(0).toUpperCase() + String(b.status ?? 'pending').slice(1).replace('-', ' ')}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Booking details */}
                  <View style={styles.cardBottom}>
                    <View style={styles.detailItem}>
                      <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                      <Text style={[styles.detailText, isHistoryView && styles.historyDetailText]}>{b.date}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                      <Text style={[styles.detailText, isHistoryView && styles.historyDetailText]}>{b.timeSlot}</Text>
                    </View>
                    {b.serviceAmount ? (
                      <View style={styles.detailItem}>
                        <Ionicons name="pricetag-outline" size={14} color={colors.textSecondary} />
                        <Text style={[styles.detailText, isHistoryView && styles.historyDetailText]}>{formatAmount(b.serviceAmount)}</Text>
                      </View>
                    ) : null}
                    <View style={styles.detailItem}>
                      <Ionicons name="pricetag-outline" size={14} color={colors.textSecondary} />
                      <Text style={[styles.detailText, isHistoryView && styles.historyDetailText]}>{b.referenceNumber}</Text>
                    </View>
                    {b.assignedToName && (
                      <View style={styles.detailItem}>
                        <Ionicons name="person-outline" size={14} color={colors.textSecondary} />
                        <Text style={[styles.detailText, isHistoryView && styles.historyDetailText]}>{b.assignedToName}</Text>
                      </View>
                    )}
                    {b.pickupRequested && (
                      <View style={styles.detailItem}>
                        <Ionicons name="locate-outline" size={14} color={colors.textSecondary} />
                        <Text style={[styles.detailText, isHistoryView && styles.historyDetailText]}>
                          Pickup{b.pickupLocation ? `: ${b.pickupLocation}` : ''}{b.pickupTime ? ` at ${b.pickupTime}` : ''}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Expanded: Progress timeline + rating */}
                  {!isHistoryView && isExpanded && (
                    <View style={styles.expandedSection}>
                      {/* Progress bar */}
                      <View style={styles.progressSection}>
                        <Text style={styles.progressTitle}>Booking progress</Text>
                        <View style={styles.progressBar}>
                          {STATUS_ORDER.map((s, i) => {
                            const currentIdx = STATUS_ORDER.indexOf(b.status);
                            const isDone = i <= currentIdx;
                            const sColor = isDone ? (STATUS_COLORS[s] ?? colors.textLight) : colors.borderLight;
                            return (
                              <View key={s} style={styles.progressStep}>
                                <View style={[styles.progressDot, { backgroundColor: sColor }]}>
                                  {isDone && <Ionicons name="checkmark" size={10} color={colors.white} />}
                                </View>
                                <Text style={[styles.progressLabel, isDone && { color: colors.text, fontWeight: '600' }]}>
                                  {String(s).charAt(0).toUpperCase() + String(s).slice(1).replace('-', ' ')}
                                </Text>
                                {i < STATUS_ORDER.length - 1 && (
                                  <View style={[styles.progressLine, { backgroundColor: i < currentIdx ? colors.statusCompleted : colors.borderLight }]} />
                                )}
                              </View>
                            );
                          })}
                        </View>
                      </View>

                      {/* Status history timeline */}
                      {b.statusHistory && (b.statusHistory ?? []).map((h: any, i: number) => (
                        <View key={i} style={styles.historyItem}>
                          <View style={styles.historyDot} />
                          {i < b.statusHistory.length - 1 && <View style={styles.historyLine} />}
                          <View style={styles.historyContent}>
                            <Text style={styles.historyStatus}>
                              {h.note || h.status}
                            </Text>
                            <Text style={styles.historyTime}>
                              {formatDate(h.timestamp)}
                              {h.updatedByName ? ` by ${h.updatedByName}` : ''}
                            </Text>
                          </View>
                        </View>
                      ))}
                      {/* Notes */}
                      {b.notes && (
                        <View style={styles.notesSection}>
                          <Text style={styles.notesLabel}>Notes</Text>
                          <Text style={styles.notesText}>{b.notes}</Text>
                        </View>
                      )}

                      {/* Pickup box */}
                      {b.pickupRequested && (
                        <View style={styles.pickupBox}>
                          <Text style={styles.pickupLabel}>Pickup</Text>
                          <Text style={styles.pickupText}>
                            {b.pickupLocation || 'Pickup requested'}
                            {b.pickupTime ? ` at ${b.pickupTime}` : ''}
                          </Text>
                          <Text style={styles.pickupText}>
                            Driver: {b.assignedDriverName || 'Not assigned yet'}
                          </Text>
                        </View>
                      )}

                      {/* Rating prompt for completed bookings */}
                      {needsRating && (
                        <TouchableOpacity
                          style={styles.rateBtn}
                          onPress={() => {
                            navigation.navigate('Review', {
                              bookingId: b._id,
                              serviceType: b.serviceType,
                              vehicleDescription: vehicle
                                ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
                                : undefined,
                              staffName: b.assignedToName,
                            });
                          }}
                        >
                          <Ionicons name="star" size={18} color={colors.white} />
                          <Text style={styles.rateBtnText}>Add a review</Text>
                        </TouchableOpacity>
                      )}

                      {/* Show existing rating */}
                      {b.ratingId && (
                        <View style={styles.ratedSection}>
                          <Ionicons name="star" size={16} color="#F59E0B" />
                          <Text style={styles.ratedText}>You rated this service</Text>
                        </View>
                      )}

                      {/* Share Experience for completed bookings */}
                      {b.status === 'completed' && (
                        <TouchableOpacity
                          style={styles.shareExpBtn}
                          onPress={() => {
                            const veh = vehicle
                              ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
                              : 'my car';
                            setShareMessage(
                              `Just had my ${b.serviceType} done on ${veh} — great experience! Book your next service easily:\n\n${PUBLIC_LANDING_URL}`
                            );
                            setShowShareSheet(true);
                          }}
                        >
                          <Ionicons name="share-social" size={16} color={colors.accent} />
                          <Text style={styles.shareExpText}>Share experience</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={styles.repeatBtn}
                        onPress={() => {
                          navigation.navigate('NewBooking', {
                            prefill: {
                              vehicleId: b.vehicleId,
                              serviceType: b.serviceType,
                              serviceAmount: b.serviceAmount,
                              date: b.date,
                              timeSlot: b.timeSlot,
                            },
                          });
                        }}
                      >
                        <Ionicons name="repeat" size={16} color={colors.primary} />
                        <Text style={styles.repeatText}>Book again</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </SafeAreaView>

        <ShareSheetModal
          visible={showShareSheet}
          onClose={() => setShowShareSheet(false)}
          message={shareMessage}
          title="Share Your Experience"
        />

        {/* Rating Modal */}
        <Modal visible={ratingModal} animationType="slide" transparent>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Rate your service</Text>
                <TouchableOpacity onPress={() => setRatingModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalSubtitle}>
                How was your experience?
              </Text>

              {/* Star rating */}
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setRatingStars(star)}>
                    <Ionicons
                      name={star <= ratingStars ? 'star' : 'star-outline'}
                      size={44}
                      color={star <= ratingStars ? '#F59E0B' : colors.borderLight}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.starsLabel}>
                {ratingStars === 0
                  ? 'Tap to rate'
                  : ratingStars <= 2
                  ? 'We\'re sorry to hear that'
                  : ratingStars <= 3
                  ? 'Thank you for your feedback'
                  : ratingStars <= 4
                  ? 'Great experience!'
                  : 'Excellent! Thank you!'}
              </Text>

              {/* Comment */}
              <TextInput
                style={styles.commentInput}
                value={ratingComment}
                onChangeText={setRatingComment}
                placeholder="Add a comment (optional)"
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.submitRatingBtn, ratingStars === 0 && styles.submitDisabled]}
                onPress={handleSubmitRating}
                disabled={ratingStars === 0 || submittingRating}
              >
                <Text style={styles.submitRatingText}>
                  {submittingRating ? 'Submitting...' : 'Submit rating'}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  wallpaper: { flex: 1 },
  wallpaperOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3, 8, 20, 0.22)' },
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  ratingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    backgroundColor: '#FEF3C7',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  ratingBannerText: { flex: 1, fontSize: 13, fontWeight: '500', color: '#92400E' },
  sectionTabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sectionTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  sectionTabActive: {
    backgroundColor: colors.primary,
  },
  sectionTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sectionTabTextActive: {
    color: colors.white,
  },
  filters: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.md, flexDirection: 'row' },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  filterTextActive: { color: colors.white },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingVertical: 64 },
  emptyText: { fontSize: 16, color: colors.textSecondary, marginTop: spacing.md },
  bookBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  bookBtnText: { color: colors.white, fontWeight: '600', fontSize: 15 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  historyCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 0,
  },
  cardTop: { padding: spacing.lg },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyIconCircle: {
    opacity: 0.75,
  },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: 15, fontWeight: '600', color: colors.text },
  historyServiceName: {
    color: colors.textSecondary,
  },
  vehicleLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  historyVehicleLabel: {
    color: colors.textLight,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  historyStatusPill: {
    backgroundColor: colors.borderLight,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: 11, fontWeight: '600' },
  historyStatusLabel: {
    opacity: 0.8,
  },
  cardBottom: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.surfaceAlt,
  },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailText: { fontSize: 12, color: colors.textSecondary },
  historyDetailText: {
    color: colors.textLight,
  },

  // Expanded section
  expandedSection: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  progressSection: { marginBottom: spacing.lg },
  progressTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  progressBar: { flexDirection: 'row', justifyContent: 'space-between' },
  progressStep: { alignItems: 'center', flex: 1, position: 'relative' },
  progressDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressLabel: { fontSize: 10, color: colors.textLight, textAlign: 'center' },
  progressLine: {
    position: 'absolute',
    top: 11,
    left: '60%',
    right: '-40%',
    height: 2,
    zIndex: -1,
  },
  historySection: { marginBottom: spacing.lg },
  historyItem: { flexDirection: 'row', marginBottom: spacing.md, position: 'relative' },
  historyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 4,
    marginRight: spacing.md,
  },
  historyLine: {
    position: 'absolute',
    left: 4,
    top: 16,
    bottom: -8,
    width: 2,
    backgroundColor: colors.borderLight,
  },
  historyContent: { flex: 1 },
  historyStatus: { fontSize: 13, fontWeight: '500', color: colors.text },
  historyTime: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  notesSection: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  notesLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  notesText: { fontSize: 13, color: colors.text },
  rateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#F59E0B',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  rateBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  ratedSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FEF3C7',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  ratedText: { fontSize: 13, fontWeight: '500', color: '#92400E' },
  shareExpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  shareExpText: { fontSize: 13, fontWeight: '600', color: colors.accent },
  repeatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  repeatText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  pickupBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  pickupLabel: { fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', marginBottom: 4 },
  pickupText: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  // Rating modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xxl,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: colors.borderLight,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  modalSubtitle: { fontSize: 15, color: colors.textSecondary, marginBottom: spacing.xl },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  starsLabel: {
    textAlign: 'center',
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  commentInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: 15,
    color: colors.text,
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  submitRatingBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.5 },
  submitRatingText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  loadingCard: { width: '84%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight },
  loadingLine: { width: '100%', height: 16, borderRadius: 999, backgroundColor: colors.borderLight, opacity: 0.55 },
});