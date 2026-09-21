import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../lib/theme';
import { PUBLIC_LANDING_URL, PUBLIC_PRIVACY_URL } from '../lib/shareUtils';

const WHATSAPP_URL = 'https://wa.me/27615276436';
const SUPPORT_PHONE_1 = '061 5276436';
const SUPPORT_PHONE_2 = '0113 831 300';
const SUPPORT_EMAIL = 'vincenta@hyundai.co.za';
const DELETE_REQUEST_SUBJECT = 'Account and Data Deletion Request';
const DELETE_REQUEST_BODY = 'Hello,\n\nPlease delete my account and all associated data.\n\nName: \nEmail: \nPhone: \n\nThank you.';
const SUPPORT_NAME = 'Hyundai and KIA Germiston';
const COPYRIGHT_NAME = 'Mbulelo Vincent Mayoyo';

const sections = [
  {
    title: '1. Information We Collect',
    body:
      'We collect the information you choose to provide when using the app, including your name, contact details, vehicle details, service bookings, messages, reviews, referral data, and optional social account connection details.',
  },
  {
    title: '2. How We Use Your Information',
    body:
      'We use your data to manage service bookings, provide customer support, personalize KiRA assistant responses, send service updates, improve the app, and support optional marketing or referral features that you control.',
  },
  {
    title: '3. WhatsApp and Notifications',
    body:
      'When you choose to share information or receive updates, the app may open WhatsApp or show in-app notifications. We do not send marketing messages automatically without user consent.',
  },
  {
    title: '4. Customer and Vehicle Records',
    body:
      'Staff-approved customer records may include name, phone number, vehicle information, and service history so KiRA can assist with bookings, convenience, trade-in suggestions, and reminders.',
  },
  {
    title: '5. Data Sharing',
    body:
      'We do not sell personal information. We may share limited data with service providers needed to run the app, such as authentication, messaging, analytics, and cloud database services.',
  },
  {
    title: '6. Social and Sharing Features',
    body:
      'If you connect social accounts or use sharing tools, you control what is shared, when it is shared, and to whom it is sent. You can disconnect linked accounts at any time.',
  },
  {
    title: '7. Security',
    body:
      'We use access controls and secure storage practices to protect account data. No system is completely secure, but we take reasonable steps to protect your information.',
  },
  {
    title: '8. Your Choices',
    body:
      'You can update or delete your profile data where the app allows it, revoke connected accounts, opt out of optional sharing, and request support from the dealership team.',
  },
  {
    title: '9. Children',
    body:
      'This app is intended for adults and dealership customers. We do not knowingly collect information from children under 13.',
  },
  {
    title: '10. Changes',
    body:
      'We may update this policy as the app changes. Continued use of the app means you accept the updated policy.',
  },
];

export default function PrivacyPolicyScreen({ navigation, policyUrl, homeUrl }: any) {
  const webOrigin =
    Platform.OS === 'web' && typeof globalThis !== 'undefined'
      ? (globalThis as any)?.location?.origin ?? ''
      : '';
  const publicUrl = policyUrl ?? (webOrigin ? `${webOrigin}/#privacy-policy` : PUBLIC_PRIVACY_URL);
  const publicHomeUrl = homeUrl ?? (webOrigin ? `${webOrigin}/` : PUBLIC_LANDING_URL);

  const copyText = async (text: string) => {
    const clipboard = (globalThis as any)?.navigator?.clipboard;
    if (Platform.OS === 'web' && clipboard?.writeText) {
      await clipboard.writeText(text);
      return true;
    }
    return false;
  };

  const handleCopy = async () => {
    try {
      const copied = await copyText(publicUrl);
      if (!copied) throw new Error('Clipboard unavailable');
      Alert.alert('Copied', 'Privacy policy link copied to clipboard.');
    } catch {
      Alert.alert('Link', publicUrl);
    }
  };

  const handleDeleteRequest = () => {
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(DELETE_REQUEST_SUBJECT)}&body=${encodeURIComponent(DELETE_REQUEST_BODY)}`;
    Linking.openURL(mailto).catch(() => {});
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
            <TouchableOpacity style={styles.backBtn} onPress={() => Linking.openURL(publicHomeUrl).catch(() => {})}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
          )}

          <View style={styles.hero}>
            <View style={styles.iconWrap}>
              <Ionicons name="shield-checkmark" size={30} color={colors.primary} />
            </View>
            <Text style={styles.title}>Privacy Policy</Text>
            <Text style={styles.subtitle}>
              Hyundai/Kia Service Connect is designed to keep customer data private, secure, and user-controlled.
            </Text>
            <View style={styles.urlCard}>
              <Text style={styles.urlLabel}>Public policy link</Text>
              <Text style={styles.urlValue}>{publicUrl}</Text>
            </View>
            <View style={styles.urlCard}>
              <Text style={styles.urlLabel}>Web home URL</Text>
              <Text style={styles.urlValue}>{publicHomeUrl}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Overview</Text>
            <Text style={styles.cardText}>
              This policy explains how the app handles customer details, vehicle information, bookings, WhatsApp sharing, social connections, and KiRA assistant interactions.
            </Text>
          </View>

          {sections.map((section) => (
            <View key={section.title} style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Contact</Text>
            <Text style={styles.cardText}>Support: {SUPPORT_PHONE_1} · {SUPPORT_PHONE_2}</Text>
            <Text style={styles.cardText}>Email: {SUPPORT_EMAIL}</Text>
            <Text style={styles.cardText}>{SUPPORT_NAME}</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={() => Linking.openURL(WHATSAPP_URL).catch(() => {})}>
              <Ionicons name="logo-whatsapp" size={18} color={colors.white} />
              <Text style={styles.copyBtnText}>Open WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.copyBtn, styles.secondaryBtn]} onPress={handleDeleteRequest}>
              <Ionicons name="trash-outline" size={18} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>Request Account & Data Deletion</Text>
            </TouchableOpacity>
            <Text style={styles.cardText}>Copyright © {new Date().getFullYear()} {COPYRIGHT_NAME}</Text>
          </View>

          <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
            <Ionicons name="copy-outline" size={18} color={colors.white} />
            <Text style={styles.copyBtnText}>Copy Policy Link</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.copyBtn, styles.secondaryBtn]}
            onPress={() => Linking.openURL(publicUrl).catch(() => {})}
          >
            <Ionicons name="open-outline" size={18} color={colors.primary} />
            <Text style={styles.secondaryBtnText}>Open Policy Link</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
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
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  urlCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  urlLabel: { fontSize: 12, fontWeight: '700', color: colors.primaryLight, textTransform: 'uppercase' },
  urlValue: { fontSize: 13, color: colors.textSecondary, marginTop: 6 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  cardText: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 6 },
  sectionBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 14,
    marginTop: spacing.md,
  },
  copyBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },
});