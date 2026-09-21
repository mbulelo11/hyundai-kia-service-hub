import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

export default function DriverSchedulesScreen({ navigation }: any) {
  const me = useQuery(api.users.me);
  const schedules = useQuery(api.driverSchedules.listMine) ?? [];
  const completeSchedule = useMutation(api.driverSchedules.completeSchedule);
  const isStaff = me?.role === 'staff';
  const [selectedSchedule, setSelectedSchedule] = React.useState<any>(null);

  const handleComplete = async (scheduleId: string) => {
    try {
      await completeSchedule({ scheduleId: scheduleId as any });
    } catch (error) {
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.hero}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Driver schedules</Text>
            <Text style={styles.heroSub}>{isStaff ? 'Received runs and completed deliveries.' : 'Your delivery schedules and completions.'}</Text>
          </View>
          <View style={styles.heroBadge}><Text style={styles.heroBadgeValue}>{schedules.length}</Text><Text style={styles.heroBadgeLabel}>Jobs</Text></View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {schedules.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="car-outline" size={40} color={colors.textLight} />
              <Text style={styles.emptyText}>No schedules assigned yet.</Text>
            </View>
          ) : (
            schedules.map((schedule: any) => (
              <TouchableOpacity key={schedule._id} style={styles.card} onPress={() => setSelectedSchedule(schedule)} activeOpacity={0.86}>
                <View style={styles.cardTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{schedule.customerName}</Text>
                    <Text style={styles.cardMeta}>{schedule.sourceType.replace('_', ' ')}</Text>
                    <Text style={styles.cardMeta}>{schedule.scheduleDate}{schedule.scheduleTime ? ` · ${schedule.scheduleTime}` : ''}</Text>
                  </View>
                  <View style={styles.statusPill}><Text style={styles.statusText}>{schedule.status.replace('_', ' ')}</Text></View>
                </View>

                {schedule.address ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={16} color={colors.primary} />
                    <Text style={styles.infoText}>{schedule.address}</Text>
                  </View>
                ) : null}
                {schedule.contactDetails ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="call-outline" size={16} color={colors.primary} />
                    <Text style={styles.infoText}>{schedule.contactDetails}</Text>
                  </View>
                ) : null}
                {schedule.notes ? <Text style={styles.notes}>{schedule.notes}</Text> : null}

                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.completeBtn} onPress={() => handleComplete(schedule._id)}>
                    <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
                    <Text style={styles.completeBtnText}>Mark complete</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={Boolean(selectedSchedule)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedSchedule(null)}
      >
        <View style={styles.detailOverlay}>
          <View style={styles.detailCardModal}>
            <View style={styles.detailModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailModalEyebrow}>Full schedule history</Text>
                <Text style={styles.detailModalTitle}>{selectedSchedule?.customerName}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedSchedule(null)} style={styles.detailModalClose}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {selectedSchedule && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalMetaRow}>
                  <View style={styles.modalMetaChip}><Text style={styles.modalMetaText}>{selectedSchedule.sourceType.replace('_', ' ')}</Text></View>
                  <View style={styles.modalMetaChip}><Text style={styles.modalMetaText}>{selectedSchedule.status.replace('_', ' ')}</Text></View>
                </View>
                <Text style={styles.detailModalLabel}>Schedule date</Text>
                <Text style={styles.detailModalValue}>{selectedSchedule.scheduleDate}{selectedSchedule.scheduleTime ? ` · ${selectedSchedule.scheduleTime}` : ''}</Text>
                {selectedSchedule.address ? (
                  <>
                    <Text style={styles.detailModalLabel}>Address</Text>
                    <Text style={styles.detailModalValue}>{selectedSchedule.address}</Text>
                  </>
                ) : null}
                {selectedSchedule.contactDetails ? (
                  <>
                    <Text style={styles.detailModalLabel}>Contact details</Text>
                    <Text style={styles.detailModalValue}>{selectedSchedule.contactDetails}</Text>
                  </>
                ) : null}
                {selectedSchedule.notes ? (
                  <>
                    <Text style={styles.detailModalLabel}>Notes</Text>
                    <Text style={styles.detailModalValue}>{selectedSchedule.notes}</Text>
                  </>
                ) : null}
                {selectedSchedule.partsOrderId ? (
                  <>
                    <Text style={styles.detailModalLabel}>Parts order reference</Text>
                    <Text style={styles.detailModalValue}>{String(selectedSchedule.partsOrderId)}</Text>
                  </>
                ) : null}
                {selectedSchedule.bookingId ? (
                  <>
                    <Text style={styles.detailModalLabel}>Booking reference</Text>
                    <Text style={styles.detailModalValue}>{String(selectedSchedule.bookingId)}</Text>
                  </>
                ) : null}
                {selectedSchedule.completedAt ? (
                  <>
                    <Text style={styles.detailModalLabel}>Completed</Text>
                    <Text style={styles.detailModalValue}>{new Date(selectedSchedule.completedAt).toLocaleString()}</Text>
                  </>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: colors.white },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4, lineHeight: 17 },
  heroBadge: {
    minWidth: 68,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroBadgeValue: { color: colors.white, fontSize: 20, fontWeight: '800' },
  heroBadgeLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700' },
  content: { padding: spacing.lg, paddingBottom: 120 },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  emptyText: { fontSize: 14, color: colors.textSecondary },
  card: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, marginBottom: spacing.md, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  statusPill: { backgroundColor: colors.primary + '10', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  statusText: { fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'capitalize' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: spacing.sm },
  infoText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  notes: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm, fontStyle: 'italic', lineHeight: 18 },
  actionRow: { marginTop: spacing.md },
  completeBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  completeBtnText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  detailCardModal: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '85%', borderTopWidth: 1, borderColor: colors.borderLight },
  detailModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.md },
  detailModalEyebrow: { fontSize: 11, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase' },
  detailModalTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  detailModalClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  modalMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  modalMetaChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight },
  modalMetaText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, textTransform: 'capitalize' },
  detailModalLabel: { fontSize: 11, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase', marginTop: spacing.sm },
  detailModalValue: { fontSize: 14, color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
});