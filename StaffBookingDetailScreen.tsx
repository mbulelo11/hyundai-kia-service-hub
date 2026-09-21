import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

const STATUS_ORDER = ['pending', 'confirmed', 'in_progress', 'completed'];

export default function StaffBookingDetailScreen({ route, navigation }: any) {
  const { bookingId } = route.params;
  const bookingDetail = useQuery(api.bookings.getById, { bookingId }) as any;
  const booking = bookingDetail?.booking;
  const vehicle = bookingDetail?.vehicle;
  const customerProfile = bookingDetail?.customerProfile;
  const messages = useQuery(api.messages.listByBooking, { bookingId }) ?? [];
  const updateStatus = useMutation(api.bookings.updateStatus);
  const sendMessage = useMutation(api.messages.send);
  const user = useQuery(api.users.me);

  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);

  if (!booking) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </SafeAreaView>
      </View>
    );
  }

  const handleAdvanceStatus = async (nextStatus: string) => {
    try {
      setUpdating(true);
      await updateStatus({
        bookingId,
        status: nextStatus,
        assignedTo: String(user?._id ?? ''),
        assignedToName: user?.name,
      });
      Alert.alert('Updated', `Booking marked as ${nextStatus.replace(/_/g, ' ')}.`);
      setRefreshSeed((seed) => seed + 1);
      if (navigation?.replace) {
        navigation.replace('StaffBookingDetail', { bookingId, refreshSeed: Date.now() });
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Unable to update booking.');
    } finally {
      setUpdating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;
    try {
      setSending(true);
      await sendMessage({
        bookingId,
        recipientId: booking.userId,
        content: messageText.trim(),
      });
      setMessageText('');
    } catch (error: any) {
      Alert.alert('Message failed', error?.message ?? 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const currentStatusIndex = Math.max(0, STATUS_ORDER.indexOf(String(booking.status ?? 'pending')));
  const nextStatus = currentStatusIndex < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentStatusIndex + 1] : null;

  return (
    <View key={refreshSeed} style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.topSafe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Booking Details</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Reference</Text>
          <Text style={styles.cardValue}>#{booking.referenceNumber ?? booking._id.toString().slice(-6).toUpperCase()}</Text>
          <Text style={styles.cardSubvalue}>{booking.serviceType}</Text>
          <Text style={styles.cardSubvalue}>{booking.date} · {booking.timeSlot}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Assigned Service Advisor</Text>
          <Text style={styles.cardValue}>{booking.assignedToName ?? 'Not assigned yet'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Status</Text>
          <View style={styles.statusRow}>
            {STATUS_ORDER.map((status) => {
              const active = String(booking.status ?? 'pending') === status;
              return (
                <View key={status} style={[styles.statusChip, active && styles.statusChipActive]}>
                  <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>{status.replace(/_/g, ' ')}</Text>
                </View>
              );
            })}
          </View>
          {nextStatus ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => handleAdvanceStatus(nextStatus)}
              disabled={updating}
            >
              <Text style={styles.primaryBtnText}>
                {updating ? 'Updating...' : `Mark as ${nextStatus.replace(/_/g, ' ')}`}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Customer</Text>
          <Text style={styles.cardValue}>{booking.customerName ?? customerProfile?.fullName ?? 'Customer'}</Text>
          {booking.customerPhone ? <Text style={styles.cardSubvalue}>Phone: {booking.customerPhone}</Text> : null}
          {vehicle ? (
            <Text style={styles.cardSubvalue}>
              Vehicle: {vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.registration})
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Messages</Text>
          {messages.length === 0 ? (
            <Text style={styles.emptyText}>No messages yet.</Text>
          ) : (
            messages.map((msg: any) => (
              <View key={msg._id} style={styles.messageItem}>
                <Text style={styles.messageSender}>{msg.senderName}</Text>
                <Text style={styles.messageContent}>{msg.content}</Text>
              </View>
            ))
          )}
          <View style={styles.messageComposer}>
            <TextInput
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Message customer..."
              placeholderTextColor={colors.textLight}
              style={styles.messageInput}
              multiline
            />
            <TouchableOpacity style={styles.sendBtn} onPress={handleSendMessage} disabled={sending}>
              <Ionicons name="send" size={18} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topSafe: { backgroundColor: colors.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.white },
  body: { flex: 1 },
  bodyContent: { padding: spacing.lg, paddingBottom: 36 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  cardValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  cardSubvalue: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statusChipActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary },
  statusChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'capitalize' },
  statusChipTextActive: { color: colors.primary },
  primaryBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryBtnText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  emptyText: { fontSize: 13, color: colors.textLight },
  messageItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  messageSender: { fontSize: 13, fontWeight: '800', color: colors.text },
  messageContent: { fontSize: 14, color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
  messageComposer: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'flex-end' },
  messageInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 100,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});