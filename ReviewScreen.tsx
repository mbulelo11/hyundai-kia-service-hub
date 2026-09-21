import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Linking, Animated, StatusBar, Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import UserAvatar from '../lib/UserAvatar';

const GOOGLE_REVIEW_URL = 'https://www.google.com/maps/search/Hyundai+Germiston+4+Dakota+Cres+Airport+Park/@-26.2416,28.1517,17z';
const GOOGLE_MAPS_URL = 'https://www.google.com/search?q=hyundai+germiston+reviews';

const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

export default function ReviewScreen({ navigation, route }: any) {
  const params = route.params ?? {};
  const { bookingId, testDriveId, serviceType, vehicleDescription, staffName } = params;

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [shareToGoogle, setShareToGoogle] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [staffResponse, setStaffResponse] = useState('');
  const reviewLoadLock = useRef(false);

  const submitReview = useMutation(api.reviews.submit);
  const respondToReview = useMutation(api.reviews.respondToReview);
  const stats = useQuery(api.reviews.getStats);
  const allReviewsPage = usePaginatedQuery(api.reviews.listAllPaged, {}, { initialNumItems: 8 });
  const publicReviews = allReviewsPage.results ?? [];
  const me = useQuery(api.users.me);
  const isStaffUser = Boolean(me && (me.role === 'staff' || me.staffRole || me.accessLevel === 'full_access' || me.isOwner));

  useEffect(() => {
    setStaffResponse(selectedReview?.staffResponse ?? '');
  }, [selectedReview]);

  const handleReviewScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 240;
    if (!nearBottom) return;
    if (allReviewsPage.status !== 'CanLoadMore') return;
    if (reviewLoadLock.current) return;
    reviewLoadLock.current = true;
    Promise.resolve(allReviewsPage.loadMore(8)).finally(() => {
      reviewLoadLock.current = false;
    });
  };

  const handleSaveStaffResponse = async () => {
    if (!selectedReview) return;
    if (!staffResponse.trim()) {
      Alert.alert('Response required', 'Please write a staff response before saving.');
      return;
    }

    try {
      await respondToReview({ reviewId: selectedReview._id, staffResponse: staffResponse.trim() });
      Alert.alert('Saved', 'Staff response saved successfully.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not save staff response.');
    }
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Rating Required', 'Please select a star rating before submitting.');
      return;
    }
    if (!comment.trim()) {
      Alert.alert('Review Required', 'Please write a few words about your experience.');
      return;
    }

    setSubmitting(true);
    try {
      await submitReview({
        bookingId: bookingId || undefined,
        testDriveId: testDriveId || undefined,
        serviceType: serviceType || 'General Service',
        vehicleDescription: vehicleDescription || undefined,
        rating,
        title: title.trim() || undefined,
        comment: comment.trim(),
        staffName: staffName || undefined,
        sharedToGoogle: shareToGoogle,
      });
      setSubmitted(true);

      // If user wants to share on Google, open the link after a short delay
      if (shareToGoogle) {
        setTimeout(() => {
          Linking.openURL(GOOGLE_REVIEW_URL).catch(() => {
            Linking.openURL(GOOGLE_MAPS_URL).catch(() => {});
          });
        }, 1500);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={styles.safe}>
          <View style={styles.successContainer}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={80} color={colors.success} />
            </View>
            <Text style={styles.successTitle}>Thank You!</Text>
            <Text style={styles.successSubtitle}>
              Your {rating}-star review has been submitted successfully.
            </Text>
            {shareToGoogle && (
              <View style={styles.googleBanner}>
                <Ionicons name="logo-google" size={20} color="#4285F4" />
                <Text style={styles.googleBannerText}>
                  Opening Google Reviews — please paste your review there too!
                </Text>
              </View>
            )}
            <Text style={styles.tokenReward}>+25 Tokens Earned!</Text>

            {!shareToGoogle && (
              <TouchableOpacity
                style={styles.googleBtn}
                onPress={() => {
                  Linking.openURL(GOOGLE_REVIEW_URL).catch(() => {
                    Linking.openURL(GOOGLE_MAPS_URL).catch(() => {});
                  });
                }}
              >
                <Ionicons name="logo-google" size={18} color="#fff" />
                <Text style={styles.googleBtnText}>Share on Google Reviews</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.doneBtnText}>Done</Text>
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
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rate Your Service</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} onScroll={handleReviewScroll} scrollEventThrottle={16}>
          {/* Service Info */}
          {serviceType && (
            <View style={styles.serviceCard}>
              <Ionicons name="construct" size={24} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceType}>{serviceType}</Text>
                {vehicleDescription && (
                  <Text style={styles.serviceVehicle}>{vehicleDescription}</Text>
                )}
                {staffName && (
                  <Text style={styles.serviceStaff}>Advisor: {staffName}</Text>
                )}
              </View>
              <View style={styles.completedBadge}>
                <Text style={styles.completedText}>Completed</Text>
              </View>
            </View>
          )}

          {/* Star Rating */}
          <Text style={styles.sectionLabel}>How was your experience?</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={44}
                  color={star <= rating ? '#F59E0B' : colors.textLight}
                />
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && (
            <Text style={styles.ratingLabel}>{STAR_LABELS[rating]}</Text>
          )}

          {/* Title */}
          <Text style={styles.inputLabel}>Review Title (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Summarise your experience"
            placeholderTextColor={colors.textLight}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />

          {/* Comment */}
          <Text style={styles.inputLabel}>Your Review</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Tell us about your service experience..."
            placeholderTextColor={colors.textLight}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>{comment.length}/500</Text>

          {/* Google Share Toggle */}
          <TouchableOpacity
            style={[styles.googleToggle, shareToGoogle && styles.googleToggleActive]}
            onPress={() => setShareToGoogle(!shareToGoogle)}
            activeOpacity={0.8}
          >
            <View style={styles.googleToggleLeft}>
              <Ionicons name="logo-google" size={22} color={shareToGoogle ? '#4285F4' : colors.textLight} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.googleToggleTitle, shareToGoogle && { color: colors.text }]}>
                  Also share on Google Reviews
                </Text>
                <Text style={styles.googleToggleDesc}>
                  Help other customers find us — opens Google after submission
                </Text>
              </View>
            </View>
            <View style={[styles.toggle, shareToGoogle && styles.toggleActive]}>
              <View style={[styles.toggleDot, shareToGoogle && styles.toggleDotActive]} />
            </View>
          </TouchableOpacity>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, (rating === 0 || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={rating === 0 || submitting}
          >
            <Ionicons name="send" size={20} color="#fff" />
            <Text style={styles.submitBtnText}>
              {submitting ? 'Submitting...' : 'Submit Review'}
            </Text>
          </TouchableOpacity>

          {/* Existing Reviews */}
          {stats && stats.totalReviews > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats.averageRating}</Text>
                  <View style={styles.miniStars}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons
                        key={s}
                        name={s <= Math.round(stats.averageRating) ? 'star' : 'star-outline'}
                        size={12}
                        color="#F59E0B"
                      />
                    ))}
                  </View>
                  <Text style={styles.statLabel}>Average</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats.totalReviews}</Text>
                  <Text style={styles.statLabel}>Total Reviews</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats.googleShared}</Text>
                  <Text style={styles.statLabel}>On Google</Text>
                </View>
              </View>
            </>
          )}

          {publicReviews.length > 0 && (
            <>
              <Text style={styles.reviewsTitle}>Recent Reviews</Text>
              {publicReviews.map((r: any) => (
                <TouchableOpacity
                  key={r._id}
                  style={styles.reviewCard}
                  activeOpacity={0.85}
                  onPress={() => setSelectedReview(r)}
                >
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewAvatar}>
                      <UserAvatar uri={r.userImage} name={r.userName} size={36} backgroundColor={colors.primary + '15'} textColor={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewName}>{r.userName}</Text>
                      <View style={styles.reviewStars}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Ionicons
                            key={s}
                            name={s <= r.rating ? 'star' : 'star-outline'}
                            size={14}
                            color="#F59E0B"
                          />
                        ))}
                        <Text style={styles.reviewDate}>
                          {new Date(r._creationTime).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                    {r.sharedToGoogle && (
                      <Ionicons name="logo-google" size={16} color="#4285F4" />
                    )}
                  </View>
                  {r.title && <Text style={styles.reviewTitle}>{r.title}</Text>}
                  <Text style={styles.reviewComment} numberOfLines={3}>{r.comment}</Text>
                  <Text style={styles.reviewTapHint}>Tap to view full review thread</Text>
                  <Text style={styles.reviewService}>{r.serviceType}</Text>
                  {r.staffResponse && (
                    <View style={styles.staffResponse}>
                      <Text style={styles.staffResponseLabel}>Dealer Response:</Text>
                      <Text style={styles.staffResponseText} numberOfLines={2}>{r.staffResponse}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
              {allReviewsPage.status === 'LoadingMore' && (
                <View style={{ paddingVertical: spacing.lg }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              )}
            </>
          )}

          {allReviewsPage.status === 'CanLoadMore' && publicReviews.length > 0 && (
            <TouchableOpacity
              style={[styles.submitBtn, { marginTop: spacing.sm }]}
              onPress={() => allReviewsPage.loadMore(8)}
            >
              <Text style={styles.submitBtnText}>Load more reviews</Text>
            </TouchableOpacity>
          )}

          <Modal
            visible={Boolean(selectedReview)}
            animationType="slide"
            transparent
            onRequestClose={() => setSelectedReview(null)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalEyebrow}>Full review thread</Text>
                    <Text style={styles.modalTitle}>{selectedReview?.userName}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedReview(null)} style={styles.modalCloseBtn}>
                    <Ionicons name="close" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {selectedReview && (
                  <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
                    <View style={styles.modalMetaRow}>
                      <Text style={styles.modalMetaText}>{selectedReview.serviceType}</Text>
                      <Text style={styles.modalMetaText}>{new Date(selectedReview._creationTime).toLocaleDateString()}</Text>
                    </View>
                    <View style={styles.modalMetaRow}>
                      {selectedReview.bookingId ? <Text style={styles.modalMetaText}>Booking #{String(selectedReview.bookingId)}</Text> : null}
                      {selectedReview.testDriveId ? <Text style={styles.modalMetaText}>Test drive #{String(selectedReview.testDriveId)}</Text> : null}
                      {selectedReview.staffName ? <Text style={styles.modalMetaText}>Advisor: {selectedReview.staffName}</Text> : null}
                      <Text style={styles.modalMetaText}>{selectedReview.sharedToGoogle ? 'Shared on Google' : 'Not shared on Google'}</Text>
                    </View>
                    <View style={styles.modalStars}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Ionicons
                          key={s}
                          name={s <= selectedReview.rating ? 'star' : 'star-outline'}
                          size={18}
                          color="#F59E0B"
                        />
                      ))}
                    </View>
                    {selectedReview.title && <Text style={styles.modalReviewTitle}>{selectedReview.title}</Text>}
                    <Text style={styles.modalReviewComment}>{selectedReview.comment}</Text>

                    {selectedReview.staffResponse ? (
                      <View style={styles.modalResponseBox}>
                        <Text style={styles.modalResponseLabel}>Staff response</Text>
                        <Text style={styles.modalResponseText}>{selectedReview.staffResponse}</Text>
                      </View>
                    ) : (
                      <View style={styles.modalResponseBox}>
                        <Text style={styles.modalResponseLabel}>Staff response</Text>
                        <Text style={styles.modalResponseText}>No staff response yet.</Text>
                      </View>
                    )}

                    {isStaffUser ? (
                      <View style={styles.modalResponseBox}>
                        <Text style={styles.modalResponseLabel}>Reply as staff</Text>
                        <TextInput
                          value={staffResponse}
                          onChangeText={setStaffResponse}
                          placeholder="Write a reply to this review"
                          placeholderTextColor={colors.textLight}
                          style={[styles.input, styles.staffResponseInput]}
                          multiline
                        />
                        <TouchableOpacity style={styles.staffResponseBtn} onPress={handleSaveStaffResponse}>
                          <Text style={styles.staffResponseBtnText}>Save staff reply</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </ScrollView>
                )}
              </View>
            </View>
          </Modal>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  serviceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  serviceType: { fontSize: 16, fontWeight: '700', color: colors.text },
  serviceVehicle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  serviceStaff: { fontSize: 12, color: colors.primaryLight, marginTop: 2 },
  completedBadge: {
    backgroundColor: colors.success + '15', paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: radius.full,
  },
  completedText: { fontSize: 11, fontWeight: '700', color: colors.success },
  sectionLabel: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: spacing.md },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  ratingLabel: { textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#F59E0B', marginBottom: spacing.xl },
  inputLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, color: colors.text,
    borderWidth: 1, borderColor: colors.borderLight, marginBottom: spacing.md,
  },
  textArea: { minHeight: 120, paddingTop: spacing.md },
  charCount: { fontSize: 12, color: colors.textLight, textAlign: 'right', marginTop: -8, marginBottom: spacing.md },
  googleToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  googleToggleActive: { borderColor: '#4285F4' + '40', backgroundColor: '#4285F4' + '08' },
  googleToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  googleToggleTitle: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  googleToggleDesc: { fontSize: 12, color: colors.textLight, marginTop: 2 },
  toggle: {
    width: 48, height: 28, borderRadius: 14, backgroundColor: colors.surfaceAlt,
    justifyContent: 'center', paddingHorizontal: 3,
  },
  toggleActive: { backgroundColor: '#4285F4' },
  toggleDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  toggleDotActive: { alignSelf: 'flex-end' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 16, marginBottom: spacing.xl,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.lg },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.xl },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  miniStars: { flexDirection: 'row', gap: 2, marginTop: 2 },
  reviewsTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  reviewCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  reviewAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '15',
    justifyContent: 'center', alignItems: 'center',
  },
  reviewName: { fontSize: 14, fontWeight: '600', color: colors.text },
  reviewStars: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  reviewDate: { fontSize: 11, color: colors.textLight, marginLeft: 8 },
  reviewTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
  reviewComment: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  reviewTapHint: { fontSize: 11, color: colors.primary, fontWeight: '700', marginTop: 6 },
  reviewService: { fontSize: 12, color: colors.primaryLight, marginTop: 6 },
  staffResponse: {
    marginTop: 10, backgroundColor: colors.primary + '08', borderRadius: radius.md,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  staffResponseLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  staffResponseText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  staffResponseInput: { minHeight: 100, marginTop: spacing.sm },
  staffResponseBtn: { marginTop: spacing.sm, alignSelf: 'flex-start', backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.full },
  staffResponseBtnText: { color: colors.white, fontWeight: '800', fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: colors.borderLight,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.md },
  modalEyebrow: { fontSize: 11, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.7 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  modalBody: { flexGrow: 0 },
  modalMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  modalMetaText: { fontSize: 12, fontWeight: '700', color: colors.textLight },
  modalStars: { flexDirection: 'row', gap: 4, marginBottom: spacing.md },
  modalReviewTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 8 },
  modalReviewComment: { fontSize: 15, color: colors.textSecondary, lineHeight: 22 },
  modalResponseBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary + '08',
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  modalResponseLabel: { fontSize: 12, fontWeight: '800', color: colors.primary, marginBottom: 6 },
  modalResponseText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  // Success
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  successIcon: { marginBottom: spacing.lg },
  successTitle: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 8 },
  successSubtitle: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  googleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#4285F4' + '10', borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  googleBannerText: { fontSize: 14, color: '#4285F4', flex: 1 },
  tokenReward: { fontSize: 18, fontWeight: '700', color: '#F59E0B', marginBottom: spacing.xl },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#4285F4', borderRadius: radius.lg,
    paddingVertical: 14, paddingHorizontal: 24, marginBottom: spacing.md,
  },
  googleBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  doneBtn: {
    paddingVertical: 14, paddingHorizontal: 40,
    borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.borderLight,
  },
  doneBtnText: { fontSize: 15, fontWeight: '600', color: colors.text },
});