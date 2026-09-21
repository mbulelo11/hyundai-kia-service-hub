import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { PUBLIC_CONTACT_URL, PUBLIC_LANDING_URL } from '../lib/shareUtils';

const CONTACT_EMAIL = 'vincenta@hyundai.co.za';
const CONTACT_PHONE = '0113 831 300';
const CONTACT_WHATSAPP = 'https://wa.me/27615276436';

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}

export default function ContactUsScreen({ navigation, route }: any) {
  const sendEnquiry = useMutation(api.messages.send);
  const staffQuery = useQuery(api.staff.publicAvailableStaff);
  const staffMembers = useMemo(() => staffQuery ?? [], [staffQuery]);
  const autoSentRef = useRef(false);
  const voiceDraft = route?.params?.voiceDraft;

  useEffect(() => {
    if (!voiceDraft || autoSentRef.current) return;
    const subject = typeof voiceDraft === 'string' ? 'General enquiry' : (voiceDraft.subject || 'General enquiry');
    const message = typeof voiceDraft === 'string' ? voiceDraft : (voiceDraft.message || voiceDraft.subject || 'General enquiry');
    const content = [subject, message].filter(Boolean).join(' — ');
    if (!content.trim()) return;
    autoSentRef.current = true;
    const staffRecipient = staffMembers.find((member: any) => member.userId);
    sendEnquiry({
      content,
      bookingId: undefined,
      recipientId: staffRecipient?.userId,
    }).catch(() => {
      autoSentRef.current = false;
    });
  }, [voiceDraft, sendEnquiry, staffMembers]);

  const copyText = async (text: string) => {
    const clipboard = (globalThis as any)?.navigator?.clipboard;
    if (Platform.OS === 'web' && clipboard?.writeText) {
      await clipboard.writeText(text);
      return true;
    }
    return false;
  };

  const copyEmail = async () => {
    try {
      const copied = await copyText(CONTACT_EMAIL);
      if (!copied) throw new Error('Clipboard unavailable');
      Alert.alert('Copied', 'Email copied to clipboard.');
    } catch {
      Alert.alert('Email', CONTACT_EMAIL);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {navigation?.canGoBack?.() ? (
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.backBtn} onPress={() => openUrl(PUBLIC_LANDING_URL)}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
          )}

          <View style={styles.hero}>
            <View style={styles.iconWrap}>
              <Ionicons name="call" size={30} color={colors.primary} />
            </View>
            <Text style={styles.title}>Contact Us</Text>
            <Text style={styles.subtitle}>
              Reach the dealership team for support, bookings, app help, and account questions.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Support Channels</Text>
            <TouchableOpacity style={styles.rowBtn} onPress={() => openUrl(CONTACT_WHATSAPP)}>
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>WhatsApp Business</Text>
                <Text style={styles.rowValue}>{CONTACT_PHONE}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.rowBtn} onPress={() => Linking.openURL(`tel:${CONTACT_PHONE.replace(/\s+/g, '')}`).catch(() => {})}>
              <Ionicons name="call-outline" size={20} color={colors.primary} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Call</Text>
                <Text style={styles.rowValue}>{CONTACT_PHONE}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.rowBtn} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => {})}>
              <Ionicons name="mail-outline" size={20} color={colors.primaryLight} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Email</Text>
                <Text style={styles.rowValue}>{CONTACT_EMAIL}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.textLight} />
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Public Web Link</Text>
            <Text style={styles.webLink}>{PUBLIC_CONTACT_URL}</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => openUrl(PUBLIC_CONTACT_URL)}>
                <Ionicons name="open-outline" size={18} color={colors.white} />
                <Text style={styles.primaryBtnText}>Open Contact Page</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={copyEmail}>
                <Ionicons name="copy-outline" size={18} color={colors.primary} />
                <Text style={styles.secondaryBtnText}>Copy Email</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Hours</Text>
            <Text style={styles.cardText}>Update these business hours before publishing if needed.</Text>
            <Text style={styles.hours}>Monday - Friday: 08:00 - 17:00</Text>
            <Text style={styles.hours}>Saturday: 08:00 - 13:00</Text>
            <Text style={styles.hours}>Sunday: Closed</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Available Staff</Text>
            <Text style={styles.cardText}>Tap a staff member to start a direct chat.</Text>
            {staffMembers.length === 0 ? (
              <Text style={styles.rowValue}>No staff members are currently available.</Text>
            ) : (
              staffMembers.map((member: any) => (
                <TouchableOpacity
                  key={`${member.userId ?? member.name}-${member.role}`}
                  style={styles.staffRow}
                  onPress={() => member.userId ? navigation.navigate('StaffChat', { recipientId: member.userId, recipientName: member.name, chatType: 'staff' }) : undefined}
                  disabled={!member.userId}
                >
                  <View style={styles.staffAvatar}>
                    <Text style={styles.rowLabel}>{String(member.name ?? '?').trim().charAt(0).toUpperCase()}</Text>
                    {member.isOnline ? <View style={styles.staffOnlineBadge} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{member.name}</Text>
                    <Text style={styles.rowValue}>{String(member.role ?? '').replace(/_/g, ' ')} {member.isOnline ? '(online)' : member.isActive ? '(available)' : '(offline)'}</Text>
                  </View>
                  <View style={[styles.smallBtn, !member.userId && styles.smallBtnDisabled]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={member.userId ? colors.white : colors.textLight} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  hero: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.xl },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowValue: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  webLink: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md },
  actions: { gap: spacing.sm },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    paddingVertical: 14,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  cardText: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  hours: { fontSize: 13, color: colors.text, marginTop: 4 },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  staffAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary + '12', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  staffAvatarImg: { width: '100%', height: '100%' },
  smallBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  smallBtnDisabled: { backgroundColor: colors.surface, opacity: 0.5 },
  staffOnlineBadge: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
});