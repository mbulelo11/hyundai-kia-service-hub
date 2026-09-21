import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Linking,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

function formatDate(value: string) {
  const d = new Date(`${value}T12:00:00`);
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

function validateDate(dateStr: string): boolean {
  if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return false;
  const d = new Date(`${dateStr}T12:00:00`);
  return !isNaN(d.getTime());
}

function validateTime(timeStr: string): boolean {
  if (!timeStr.match(/^\d{2}:\d{2}$/)) return false;
  const [h, m] = timeStr.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function buildReminderAt(date: string, time: string | undefined, allDay: boolean, leadMinutes: number) {
  const baseTime = allDay ? '09:00' : (time || '09:00');
  const start = new Date(`${date}T${baseTime}:00`);
  if (Number.isNaN(start.getTime())) return undefined;
  const reminderAt = start.getTime() - Math.max(5, leadMinutes) * 60 * 1000;
  return reminderAt > Date.now() ? reminderAt : undefined;
}

function normalizeEntryText(value: any) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getEntryKey(entry: any) {
  return [
    normalizeEntryText(entry.title),
    normalizeEntryText(entry.details),
    normalizeEntryText(entry.date),
    normalizeEntryText(entry.time),
    String(Boolean(entry.allDay)),
  ].join('|');
}

function getVoiceDraftKey(voiceDraft: any) {
  if (!voiceDraft) return '';
  if (typeof voiceDraft === 'string') return `text:${voiceDraft.trim()}`;
  return [
    voiceDraft.title ?? '',
    voiceDraft.details ?? '',
    voiceDraft.date ?? '',
    voiceDraft.time ?? '',
    String(voiceDraft.allDay ?? ''),
    voiceDraft.source ?? '',
    String(voiceDraft.reminderAt ?? ''),
  ].join('|');
}

export default function CalendarScreen({ navigation, route }: any) {
  const entriesResult = useQuery(api.bookings.listCalendarEntries);
  const entries = useMemo(() => entriesResult ?? [], [entriesResult]);
  const addEntry = useMutation(api.bookings.addCalendarEntry);
  const completeEntry = useMutation(api.bookings.completeCalendarEntry);
  const autoCreatedRef = useRef(false);
  const autoCreatedKeyRef = useRef('');
  const saveLockRef = useRef(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('09:00');
  const [allDay, setAllDay] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderLeadMinutes, setReminderLeadMinutes] = useState(60);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  const reminderChoices = [
    { label: '15m', value: 15 },
    { label: '1h', value: 60 },
    { label: '3h', value: 180 },
    { label: '1d', value: 1440 },
  ];

  const today = new Date().toISOString().split('T')[0];
  const voiceDraft = route?.params?.voiceDraft;
  const voiceDraftKey = useMemo(() => getVoiceDraftKey(voiceDraft), [voiceDraft]);
  const quickText = typeof voiceDraft === 'string'
    ? voiceDraft
    : voiceDraft?.details || voiceDraft?.title || '';
  const upcoming = useMemo(
    () => entries.filter((entry: any) => entry.date > today).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [entries, today]
  );
  const todaysEntries = useMemo(
    () => entries.filter((entry: any) => entry.date === today).sort((a: any, b: any) => (a.time || '').localeCompare(b.time || '')),
    [entries, today]
  );

  const visibleTodayEntries = useMemo(() => {
    const seen = new Set<string>();
    return todaysEntries.filter((entry: any) => {
      const key = getEntryKey(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [todaysEntries]);

  const visibleUpcomingEntries = useMemo(() => {
    const seen = new Set<string>();
    return upcoming.filter((entry: any) => {
      const key = getEntryKey(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [upcoming]);

  const renderEntryTags = (entry: any) => (
    <View style={styles.entryTagsRow}>
      <View style={styles.tag}><Text style={styles.tagText}>{entry.source === 'booking' ? 'Booking' : entry.source === 'voice' ? 'Voice' : 'Manual'}</Text></View>
      {entry.allDay && <View style={styles.tag}><Text style={styles.tagText}>All day</Text></View>}
      {entry.reminderAt && <View style={styles.tag}><Text style={styles.tagText}>Reminder set</Text></View>}
      {entry.isCompleted && <View style={styles.tag}><Text style={styles.tagText}>✓ Done</Text></View>}
    </View>
  );

  const renderEntryCard = (entry: any) => (
    <View key={entry._id.toString()} style={styles.entryCard}>
      <View style={styles.entryTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.entryTitle}>{entry.title}</Text>
          <Text style={styles.entryMeta}>
            {formatDate(entry.date)}{entry.time ? ` · ${entry.time}` : ''}
          </Text>
        </View>
        <View style={styles.entryActions}>
          {entry.isCompleted ? (
            <View style={styles.doneBadge}>
              <Ionicons name="checkmark-done" size={12} color={colors.success} />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => handleDone(entry._id.toString())}
            >
              <Ionicons name="checkmark" size={14} color={colors.white} />
            </TouchableOpacity>
          )}
          {entry.googleCalendarUrl && (
            <TouchableOpacity
              style={styles.calendarLinkBtn}
              onPress={() => handleOpenCalendar(entry)}
            >
              <Ionicons name="open-outline" size={14} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      {entry.details ? <Text style={styles.entryDetails}>{entry.details}</Text> : null}
      {renderEntryTags(entry)}
    </View>
  );

  const renderEntrySection = (title: string, count: number, emptyText: string, data: any[]) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {title}
        {count > 0 && <Text style={styles.cardSubtitle}> ({count})</Text>}
      </Text>
      {data.length === 0 ? <Text style={styles.empty}>{emptyText}</Text> : data.map(renderEntryCard)}
    </View>
  );

  useEffect(() => {
    if (!voiceDraft || autoCreatedRef.current || saveLockRef.current) return;
    const text = typeof voiceDraft === 'string' ? voiceDraft : (voiceDraft.details || voiceDraft.title || '');
    if (!text.trim()) return;
    if (autoCreatedKeyRef.current === voiceDraftKey) return;
    autoCreatedKeyRef.current = voiceDraftKey;
    autoCreatedRef.current = true;
    saveLockRef.current = true;
    setSaving(true);
    setError('');
    (async () => {
      try {
        await addEntry({
          title: voiceDraft?.title || text,
          details: voiceDraft?.details || text,
          date: voiceDraft?.date || today,
          time: voiceDraft?.time || undefined,
          allDay: voiceDraft?.allDay ?? !voiceDraft?.time,
          source: voiceDraft?.source || 'voice',
          reminderAt: voiceDraft?.reminderAt,
        });
      } catch (err) {
        setError('Failed to save voice note');
      } finally {
        saveLockRef.current = false;
        setSaving(false);
      }
    })();
  }, [voiceDraft, voiceDraftKey, addEntry, today]);

  const handleAdd = async () => {
    if (saving || saveLockRef.current) return;
    setError('');
    
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    
    if (!validateDate(date)) {
      setError('Invalid date format (use YYYY-MM-DD)');
      return;
    }
    
    if (!allDay && !validateTime(time)) {
      setError('Invalid time format (use HH:MM)');
      return;
    }

    saveLockRef.current = true;
    setSaving(true);
    try {
      const reminderAt = reminderEnabled ? buildReminderAt(date, allDay ? undefined : time, allDay, reminderLeadMinutes) : undefined;
      await addEntry({
        title: title.trim(),
        details: details.trim() || undefined,
        date,
        time: allDay ? undefined : time,
        allDay,
        source: 'manual',
        reminderAt,
      });
      setTitle('');
      setDetails('');
      setDate(new Date().toISOString().split('T')[0]);
      setTime('09:00');
      setAllDay(false);
      setReminderEnabled(true);
      setReminderLeadMinutes(60);
      setError('');
    } catch (err) {
      setError('Failed to save entry');
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  };

  const handleQuickCreate = async () => {
    if (saving || saveLockRef.current || autoCreatedRef.current) return;
    const text = quickText.trim();
    if (!text) return;
    saveLockRef.current = true;
    setSaving(true);
    setError('');
    try {
      await addEntry({
        title: voiceDraft?.title || text,
        details: voiceDraft?.details || text,
        date: voiceDraft?.date || today,
        time: voiceDraft?.time || undefined,
        allDay: voiceDraft?.allDay ?? !voiceDraft?.time,
        source: voiceDraft?.source || 'voice',
        reminderAt: voiceDraft?.reminderAt ?? (reminderEnabled ? buildReminderAt(voiceDraft?.date || today, voiceDraft?.time || undefined, Boolean(voiceDraft?.allDay ?? !voiceDraft?.time), reminderLeadMinutes) : undefined),
      });
      autoCreatedRef.current = true;
    } catch (err) {
      setError('Failed to save spoken note');
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  };

  const handleDone = async (entryId: string) => {
    try {
      await completeEntry({ entryId: entryId as any });
    } catch (err) {
      Alert.alert('Error', 'Failed to mark as done');
    }
  };

  const handleOpenCalendar = (entry: any) => {
    if (entry.googleCalendarUrl) {
      Linking.openURL(entry.googleCalendarUrl).catch(() => {
        Alert.alert('Error', 'Could not open Google Calendar');
      });
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Calendar & Notes</Text>
            <Text style={styles.subtitle}>Save events and notes</Text>
          </View>
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={() => Linking.openURL('https://calendar.google.com/')}
          >
            <Ionicons name="logo-google" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError('')}>
              <Ionicons name="close" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        ) : null}

        <ScrollView contentContainerStyle={styles.content}>
          {quickText ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Create from speech</Text>
              <Text style={styles.quickText}>{quickText}</Text>
              <TouchableOpacity style={styles.saveBtn} onPress={handleQuickCreate} disabled={saving || saveLockRef.current || autoCreatedRef.current}>
                <Ionicons name="checkmark-done" size={16} color={colors.white} />
                <Text style={styles.saveBtnText}>{saving || saveLockRef.current ? 'Saving...' : autoCreatedRef.current ? 'Saved' : 'Save spoken note'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Add event or note</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Event title"
              placeholderTextColor={colors.textLight}
              value={title}
              onChangeText={setTitle}
              editable={!saving}
            />
            
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Details (optional)"
              placeholderTextColor={colors.textLight}
              value={details}
              onChangeText={setDetails}
              multiline
              editable={!saving}
            />

            <View style={styles.dateTimeContainer}>
              <TouchableOpacity 
                style={styles.dateButton} 
                onPress={() => setDatePickerOpen(true)}
                disabled={saving}
              >
                <Ionicons name="calendar" size={16} color={colors.primary} />
                <Text style={styles.dateButtonText}>{formatDate(date)}</Text>
              </TouchableOpacity>

              {!allDay && (
                <TouchableOpacity 
                  style={styles.dateButton} 
                  onPress={() => setTimePickerOpen(true)}
                  disabled={saving}
                >
                  <Ionicons name="time" size={16} color={colors.primary} />
                  <Text style={styles.dateButtonText}>{time}</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity 
              style={styles.allDayToggle}
              onPress={() => setAllDay(!allDay)}
              disabled={saving}
            >
              <View style={[styles.checkbox, allDay && styles.checkboxChecked]}>
                {allDay && <Ionicons name="checkmark" size={14} color={colors.white} />}
              </View>
              <Text style={styles.allDayText}>All-day event</Text>
            </TouchableOpacity>

            <View style={styles.reminderSection}>
              <View style={styles.reminderTopRow}>
                <Text style={styles.reminderTitle}>Reminder</Text>
                <TouchableOpacity onPress={() => setReminderEnabled((value: boolean) => !value)} style={[styles.reminderToggle, reminderEnabled && styles.reminderToggleActive]}>
                  <Text style={[styles.reminderToggleText, reminderEnabled && styles.reminderToggleTextActive]}>{reminderEnabled ? 'On' : 'Off'}</Text>
                </TouchableOpacity>
              </View>
              {reminderEnabled ? (
                <View style={styles.reminderChipsRow}>
                  {reminderChoices.map((choice) => (
                    <TouchableOpacity
                      key={choice.value}
                      style={[styles.reminderChip, reminderLeadMinutes === choice.value && styles.reminderChipActive]}
                      onPress={() => setReminderLeadMinutes(choice.value)}
                    >
                      <Text style={[styles.reminderChipText, reminderLeadMinutes === choice.value && styles.reminderChipTextActive]}>{choice.label} before</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={styles.reminderHint}>No reminder will be scheduled for this note.</Text>
              )}
            </View>

            <TouchableOpacity 
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]} 
              onPress={handleAdd} 
              disabled={saving}
            >
              <Ionicons name="cloud-upload" size={16} color={colors.white} />
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save to Calendar'}</Text>
            </TouchableOpacity>
          </View>

          {visibleTodayEntries.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Today's Notes
                {todaysEntries.length > 0 && <Text style={styles.cardSubtitle}> ({todaysEntries.length})</Text>}
              </Text>
              {todaysEntries.map((entry: any) => (
                <View key={entry._id} style={styles.entryCard}>
                  <View style={styles.entryTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.entryTitle}>{entry.title}</Text>
                      <Text style={styles.entryMeta}>
                        {formatDate(entry.date)}{entry.time ? ` · ${entry.time}` : ''}
                      </Text>
                    </View>
                    <View style={styles.entryActions}>
                      {entry.isCompleted ? (
                        <View style={styles.doneBadge}>
                          <Ionicons name="checkmark-done" size={12} color={colors.success} />
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.doneBtn}
                          onPress={() => handleDone(entry._id.toString())}
                        >
                          <Ionicons name="checkmark" size={14} color={colors.white} />
                        </TouchableOpacity>
                      )}
                      {entry.googleCalendarUrl && (
                        <TouchableOpacity
                          style={styles.calendarLinkBtn}
                          onPress={() => handleOpenCalendar(entry)}
                        >
                          <Ionicons name="open-outline" size={14} color={colors.primary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  {entry.details ? <Text style={styles.entryDetails}>{entry.details}</Text> : null}
                  <View style={styles.entryTagsRow}>
                    <View style={styles.tag}><Text style={styles.tagText}>{entry.source === 'booking' ? 'Booking' : entry.source === 'voice' ? 'Voice' : 'Manual'}</Text></View>
                    {entry.allDay && <View style={styles.tag}><Text style={styles.tagText}>All day</Text></View>}
                    {entry.reminderAt && <View style={styles.tag}><Text style={styles.tagText}>Reminder set</Text></View>}
                    {entry.isCompleted && <View style={styles.tag}><Text style={styles.tagText}>✓ Done</Text></View>}
                  </View>
                </View>
              ))}
            </View>
          )}

          {renderEntrySection('Upcoming entries', visibleUpcomingEntries.length, 'No upcoming entries yet.', visibleUpcomingEntries)}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={datePickerOpen} transparent animationType="slide">
        <View style={styles.pickerModal}>
          <View style={styles.pickerContent}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Date</Text>
              <TouchableOpacity onPress={() => setDatePickerOpen(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.pickerInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textLight}
              value={date}
              onChangeText={setDate}
            />
            <Text style={styles.pickerHint}>Example: 2024-12-25</Text>
            <TouchableOpacity 
              style={styles.pickerButton}
              onPress={() => setDatePickerOpen(false)}
            >
              <Text style={styles.pickerButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={timePickerOpen} transparent animationType="slide">
        <View style={styles.pickerModal}>
          <View style={styles.pickerContent}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Time</Text>
              <TouchableOpacity onPress={() => setTimePickerOpen(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.pickerInput}
              placeholder="HH:MM"
              placeholderTextColor={colors.textLight}
              value={time}
              onChangeText={setTime}
            />
            <Text style={styles.pickerHint}>Example: 14:30</Text>
            <TouchableOpacity 
              style={styles.pickerButton}
              onPress={() => setTimePickerOpen(false)}
            >
              <Text style={styles.pickerButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  title: { fontSize: 20, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  googleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error + '15',
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.md,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error, fontWeight: '700' },
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  cardSubtitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  quickText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  dateTimeContainer: { 
    flexDirection: 'row', 
    gap: spacing.sm,
    flexWrap: 'wrap'
  },
  dateButton: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  dateButtonText: { 
    color: colors.text, 
    fontSize: 14, 
    fontWeight: '600',
    flex: 1 
  },
  allDayToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  allDayText: { 
    color: colors.text, 
    fontSize: 14,
    fontWeight: '600'
  },
  reminderSection: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    gap: spacing.sm,
  },
  reminderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reminderTitle: { fontSize: 13, fontWeight: '900', color: colors.text },
  reminderToggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  reminderToggleActive: {
    backgroundColor: colors.primary + '12',
    borderColor: colors.primary + '25',
  },
  reminderToggleText: { fontSize: 11, fontWeight: '900', color: colors.textSecondary },
  reminderToggleTextActive: { color: colors.primary },
  reminderChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reminderChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  reminderChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  reminderChipText: { fontSize: 11, fontWeight: '900', color: colors.textSecondary },
  reminderChipTextActive: { color: colors.white },
  reminderHint: { fontSize: 12, color: colors.textSecondary },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  empty: { color: colors.textSecondary, fontSize: 13 },
  entryCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  entryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  entryActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  entryTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  entryMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  entryDetails: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  entryTagsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tag: {
    backgroundColor: colors.primary + '10',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  calendarLinkBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '18',
  },
  doneBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
  },
  doneBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success + '15',
  },
  pickerModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  pickerInput: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
  },
  pickerHint: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  pickerButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickerButtonText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 15,
  },
});