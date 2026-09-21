import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../lib/theme';
import { PUBLIC_LANDING_URL, PUBLIC_TERMS_URL } from '../lib/shareUtils';

const COPYRIGHT_NAME = 'Mbulelo Vincent Mayoyo';

const sections = [
  {
    title: '1. Use of the App',
    body:
      'Hyundai/Kia Service Connect is provided to help customers and staff manage service bookings, messaging, customer records, and related convenience features.',
  },
  {
    title: '2. User Accounts',
    body:
      'You are responsible for maintaining accurate account information and for keeping your login or device access secure.',
  },
  {
    title: '3. Consent and Communication',
    body:
      'Any WhatsApp sharing, social linking, marketing suggestions, or outreach tools must be used with user consent. The app does not send marketing automatically without approval.',
  },
  {
    title: '4. Customer Data',
    body:
      'Staff may manage customer names, phone numbers, vehicles, booking data, and notes to provide service support, reminders, and assistance. Data should only be used for legitimate dealership purposes.',
  },
  {
    title: '5. KiRA Assistant',
    body:
      'KiRA is an AI assistant that helps with questions, service guidance, messaging drafts, and convenience tasks. Responses may be generated automatically and should be reviewed before sending sensitive or external communications.',
  },
  {
    title: '6. Prohibited Use',
    body:
      'You may not use the app to spam, harass, impersonate others, or send unauthorized marketing or abusive content.',
  },
  {
    title: '7. Availability and Changes',
    body:
      'We may update, suspend, or improve the app at any time. Some features may depend on third-party services such as WhatsApp, cloud databases, or device permissions.',
  },
  {
    title: '8. Limitation of Liability',
    body:
      'The app is provided for operational convenience. To the fullest extent allowed by law, we are not liable for indirect losses resulting from app usage, service interruptions, or third-party service failures.',
  },
  {
    title: '9. Termination',
    body:
      'We may restrict access to the app or certain features if misuse, fraud, or policy violations are detected.',
  },
  {
    title: '10. Contact',
    body:
      'For support, contact the dealership team through the app or update this section with your official support email before publishing to Google Play.',
  },
];

export default function TermsOfServiceScreen({ navigation, policyUrl }: any) {
  const webOrigin =
    Platform.OS === 'web' && typeof globalThis !== 'undefined'
      ? (globalThis as any)?.location?.origin ?? ''
      : '';
  const publicUrl = policyUrl ?? (webOrigin ? `${webOrigin}/#terms` : PUBLIC_TERMS_URL);

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
      Alert.alert('Copied', 'Terms of Service link copied to clipboard.');
    } catch {
      Alert.alert('Link', publicUrl);
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
            <TouchableOpacity style={styles.backBtn} onPress={() => Linking.openURL(PUBLIC_LANDING_URL).catch(() => {})}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
          )}

          <View style={styles.hero}>
            <View style={styles.iconWrap}>
              <Ionicons name="document-text" size={30} color={colors.primary} />
            </View>
            <Text style={styles.title}>Terms of Service</Text>
            <Text style={styles.subtitle}>
              These terms describe how the app should be used and how KiRA, customer data, and sharing features are handled.
            </Text>
            <View style={styles.urlCard}>
              <Text style={styles.urlLabel}>Public terms link</Text>
              <Text style={styles.urlValue}>{publicUrl}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Summary</Text>
            <Text style={styles.cardText}>
              By using the app, you agree to use it responsibly, respect customer privacy, and follow dealership and platform policies.
            </Text>
          </View>

          {sections.map((section) => (
            <View key={section.title} style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}

          <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
            <Ionicons name="copy-outline" size={18} color={colors.white} />
            <Text style={styles.copyBtnText}>Copy Terms Link</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.copyBtn, styles.secondaryBtn]}
            onPress={() => Linking.openURL(publicUrl).catch(() => {})}
          >
            <Ionicons name="open-outline" size={18} color={colors.primary} />
            <Text style={styles.secondaryBtnText}>Open Terms Link</Text>
          </TouchableOpacity>
          <Text style={[styles.cardText, { textAlign: 'center', marginTop: 8 }]}>
            Copyright © {new Date().getFullYear()} {COPYRIGHT_NAME}
          </Text>
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