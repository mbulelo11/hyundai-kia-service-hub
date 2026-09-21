import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, radius, spacing } from '../lib/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

function goBackOrHome(navigation: any, fallbackRoute = 'Main') {
  if (navigation?.canGoBack?.()) {
    navigation.goBack();
  } else {
    navigation.navigate(fallbackRoute);
  }
}

export default function BookingDetailScreen({ route, navigation }: any) {
  const { bookingId } = route.params;
  const [refreshing, setRefreshing] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [showStaffModal, setShowStaffModal] = useState(false);

  const booking = useQuery(api.bookings.getById, { bookingId });
  const messages = useQuery(api.messages.listByBooking, { bookingId });
  const activity = useQuery(api.activityLog.list, { limit: 50 });
  const staffList = useQuery(api.staff.publicOnlineServiceStaff) ?? [];
  const assignBooking = useMutation(api.bookings.assignBooking);

  if (!booking) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleAssign = async (staffId: string, staffName?: string) => {
    try {
      await assignBooking({ bookingId, assignedTo: staffId, assignedToName: staffName });
      Alert.alert('Success', 'Booking assigned');
      setShowAssign(false);
      goBackOrHome(navigation);
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Unable to assign booking.');
    }
  };

  const customerPhone = String(booking?.customerPhone ?? booking?.phone ?? booking?.userPhone ?? '').trim();

  const openCustomerCall = async () => {
    if (!customerPhone) {
      Alert.alert('No phone number', 'This customer does not have a phone number saved.');
      return;
    }

    try {
      await Linking.openURL(`tel:${customerPhone}`);
    } catch {
      Alert.alert('Call failed', 'Unable to open the phone app.');
    }
  };

  const statusColor: Record<string, string> = {
    pending: '#FF9800',
    confirmed: '#4CAF50',
    completed: '#2196F3',
    cancelled: '#F44336',
  };
  const bookingTone = statusColor[booking.status] || colors.primary;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => goBackOrHome(navigation)} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerEyebrow}>STAFF VIEW</Text>
            <Text style={styles.headerTitle}>Booking Details</Text>
          </View>
          <TouchableOpacity style={styles.menuButton}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.heroCard, { borderColor: bookingTone + '28' }]}>
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroEyebrow}>REFERENCE</Text>
              <Text style={styles.heroNumber}>#{booking.referenceNumber || bookingId.slice(0, 8)}</Text>
              <Text style={styles.heroSubtitle}>{booking.customerName}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: bookingTone }]}>
              <Text style={styles.statusText}>{booking.status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.heroPillsRow}>
            <View style={styles.heroPill}><Ionicons name="car" size={14} color={colors.primary} /><Text style={styles.heroPillText}>{booking.serviceType}</Text></View>
            <View style={styles.heroPill}><Ionicons name="calendar" size={14} color={colors.primary} /><Text style={styles.heroPillText}>{booking.date}</Text></View>
            <View style={styles.heroPill}><Ionicons name="time" size={14} color={colors.primary} /><Text style={styles.heroPillText}>{booking.timeSlot}</Text></View>
          </View>

          <View style={styles.heroActionsRow}>
            <TouchableOpacity style={styles.heroAction}>
              <Ionicons name="chatbubble-outline" size={16} color={colors.primary} />
              <Text style={styles.heroActionText}>Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroAction} onPress={openCustomerCall}>
              <Ionicons name="call-outline" size={16} color={colors.primary} />
              <Text style={styles.heroActionText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroAction} onPress={() => setShowAssign(true)}>
              <Ionicons name="person-add-outline" size={16} color={colors.primary} />
              <Text style={styles.heroActionText}>Assign</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.assignmentHeader}>
            <Text style={styles.cardTitle}>Assigned To</Text>
            <TouchableOpacity style={styles.reassignButton} onPress={() => setShowAssign(true)}>
              <Ionicons name="person-add" size={16} color={colors.primary} />
              <Text style={styles.reassignButtonText}>Change</Text>
            </TouchableOpacity>
          </View>
          {booking.assignedToName ? (
            <Text style={styles.assignedStaffName}>{booking.assignedToName}</Text>
          ) : (
            <Text style={styles.unassigned}>Unassigned</Text>
          )}
        </View>

        {booking.notes && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Notes</Text>
              <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>INTERNAL</Text></View>
            </View>
            <Text style={styles.notesText}>{booking.notes}</Text>
          </View>
        )}

        {messages && messages.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Messages ({messages.length})</Text>
              <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>THREAD</Text></View>
            </View>
            {messages.map((msg: any) => (
              <View key={msg._id} style={styles.messageItem}>
                <View style={styles.messageMeta}>
                  <Text style={styles.messageSender}>{msg.senderName} ({msg.senderRole})</Text>
                  <Text style={styles.messageTime}>{new Date(msg._creationTime).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.messageContent}>{msg.content}</Text>
              </View>
            ))}
          </View>
        )}

        {booking.statusHistory && booking.statusHistory.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Status History</Text>
              <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>TIMELINE</Text></View>
            </View>
            {booking.statusHistory.map((entry: any, idx: number) => (
              <View key={idx} style={styles.historyItem}>
                <Text style={styles.historyStatus}>{entry.status}</Text>
                <Text style={styles.historyDate}>{new Date(entry.timestamp).toLocaleDateString()}</Text>
                {entry.note && <Text style={styles.historyNote}>{entry.note}</Text>}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="chatbubble-outline" size={20} color="white" />
          <Text style={styles.actionButtonText}>Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { marginLeft: spacing.md }]} onPress={openCustomerCall}>
          <Ionicons name="call-outline" size={20} color="white" />
          <Text style={styles.actionButtonText}>Call customer</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showAssign} transparent animationType="slide" onRequestClose={() => setShowAssign(false)}>
        <View style={styles.assignOverlay}>
          <View style={styles.assignCard}>
            <View style={styles.assignHeader}>
              <Text style={styles.assignTitle}>Assign Staff</Text>
              <TouchableOpacity onPress={() => setShowAssign(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {(staffList ?? []).length > 0 ? (
                (staffList ?? []).map((staff: any) => {
                  const staffKey = staff.userId ?? staff.staffId;
                  if (!staffKey) return null;

                  return (
                    <TouchableOpacity
                      key={staffKey}
                      style={[styles.staffRow, selectedStaffId === staffKey && styles.staffRowActive]}
                      onPress={() => {
                        setSelectedStaffId(staffKey);
                        handleAssign(staffKey, staff.name ?? staff.email);
                      }}
                    >
                      <View style={styles.staffAvatar}><Ionicons name="person" size={18} color={colors.primary} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.staffName}>{staff.name ?? staff.email}</Text>
                        <Text style={styles.staffRole}>{staff.role}</Text>
                      </View>
                      {staff.isOnline ? <View style={styles.onlineDot} /> : null}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                  <Text style={{ color: colors.textLight, marginBottom: spacing.sm }}>
                    No staff with active accounts available
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textLight }}>
                    Staff must create a user account to be assigned
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textLight,
    letterSpacing: 1,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 2,
  },
  heroCard: {
    backgroundColor: colors.surfaceElevated,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textLight,
    letterSpacing: 0.8,
  },
  heroNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    marginTop: 2,
  },
  heroSubtitle: {
    fontSize: 14,
    color: colors.textLight,
    marginTop: 6,
  },
  heroPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  heroPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  heroActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  heroAction: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '12',
  },
  heroActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },
  assigneeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '18',
  },
  assigneeHintText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  sectionBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textLight,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  infoText: {
    marginLeft: spacing.md,
    fontSize: 14,
    color: colors.text,
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  reassignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  reassignButtonText: {
    marginLeft: spacing.sm,
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  assignedStaffName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  unassigned: {
    fontSize: 14,
    color: colors.textLight,
    fontStyle: 'italic',
  },
  notesText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  messageItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  messageMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  messageSender: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  messageTime: {
    fontSize: 12,
    color: colors.textLight,
  },
  messageContent: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  historyItem: {
    paddingVertical: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.md,
    marginBottom: spacing.md,
  },
  historyStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  historyDate: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  historyNote: {
    fontSize: 13,
    color: colors.text,
    marginTop: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  actionButtonText: {
    marginLeft: spacing.sm,
    color: 'white',
    fontWeight: '600',
  },
  assignOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  assignCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  assignHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  assignTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  staffRowActive: {
    backgroundColor: colors.primary + '10',
  },
  staffAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  staffRole: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    width: '90%',
    maxWidth: 500,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  emptyState: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
  },
  staffListContainer: {
    maxHeight: '80%',
  },
  staffItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  staffInfo: {
    flex: 1,
  },
  modalStatusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  modalStatusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});