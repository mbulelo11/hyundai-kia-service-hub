import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { PUBLIC_CONTACT_URL, PUBLIC_LANDING_URL, PUBLIC_LOGIN_URL, PUBLIC_PRIVACY_URL, PUBLIC_SIGNUP_URL, PUBLIC_TERMS_URL } from '../lib/shareUtils';

const features = [
  { icon: 'construct-outline', title: 'Book service', text: 'Schedule appointments and manage service history.' },
  { icon: 'sparkles-outline', title: 'KiRA assistant', text: 'Ask questions, get help, and draft customer messages.' },
  { icon: 'chatbubbles-outline', title: 'WhatsApp ready', text: 'Share updates with customers when you choose to.' },
  { icon: 'people-outline', title: 'Customer convenience', text: 'Keep records, preferences, and contact details organized.' },
];

export default function LandingScreen({ route }: any) {
  const trackStockEngagement = useMutation(api.activityLog.trackStockEngagement);
  const postId = route?.params?.postId ?? null;
  const preview = useQuery(api.posts.publicGetPostPreview, postId ? { postId } : 'skip');

  React.useEffect(() => {
    void trackStockEngagement({ event: 'visit', source: postId ? 'public_post_preview' : 'public_landing' });
  }, [trackStockEngagement, postId]);

  if (postId) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safe}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.previewHero}>
              <View style={styles.previewIconWrap}>
                <Ionicons name="car-sport" size={42} color={colors.white} />
              </View>
              <Text style={styles.kicker}>HYUNDAI / KIA SERVICE CONNECT</Text>
              <Text style={styles.previewTitle}>Shared post preview</Text>
              <Text style={styles.previewSubtitle}>Professional feed sharing with a clean, branded preview.</Text>
            </View>

            <View style={styles.previewCard}>
              <Text style={styles.previewCardTitle}>{preview?.title ?? 'Community post'}</Text>
              <Text style={styles.previewCardMeta}>{preview?.authorDisplayName ?? 'Community member'}</Text>
              <Text style={styles.previewCardBody}>{preview?.content ?? 'Open the app to view this post.'}</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => Linking.openURL(PUBLIC_LANDING_URL).catch(() => {})}>
                <Ionicons name="open-outline" size={18} color={colors.white} />
                <Text style={styles.primaryBtnText}>Open the App</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <Ionicons name="car-sport" size={40} color={colors.white} />
            </View>
            <Text style={styles.kicker}>HYUNDAI / KIA SERVICE CONNECT</Text>
            <Text style={styles.title}>Service, support, and assistant help in one place.</Text>
            <Text style={styles.subtitle}>
              Book service, manage customer convenience, and use KiRA as your AI assistant for dealership operations.
            </Text>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => Linking.openURL(PUBLIC_LOGIN_URL).catch(() => {})}>
            <Ionicons name="log-in-outline" size={20} color={colors.white} />
            <Text style={styles.primaryBtnText}>Log In</Text>
          </TouchableOpacity>

          <View style={styles.secondaryRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => Linking.openURL(PUBLIC_SIGNUP_URL).catch(() => {})}>
              <Ionicons name="person-add-outline" size={18} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>Sign Up</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => Linking.openURL(PUBLIC_CONTACT_URL).catch(() => {})}>
              <Ionicons name="call-outline" size={18} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>Contact Us</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => Linking.openURL(PUBLIC_PRIVACY_URL).catch(() => {})}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>Privacy</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.secondaryRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => Linking.openURL(PUBLIC_TERMS_URL).catch(() => {})}>
              <Ionicons name="document-text-outline" size={18} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>Terms</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => Linking.openURL(PUBLIC_LANDING_URL).catch(() => {})}>
              <Ionicons name="home-outline" size={18} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>Home</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>What you can do</Text>
          <View style={styles.featureGrid}>
            {features.map((item) => (
              <View key={item.title} style={styles.featureCard}>
                <View style={styles.featureIcon}>
                  <Ionicons name={item.icon as any} size={22} color={colors.primary} />
                </View>
                <Text style={styles.featureTitle}>{item.title}</Text>
                <Text style={styles.featureText}>{item.text}</Text>
              </View>
            ))}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Need access?</Text>
            <Text style={styles.infoText}>
              Open the app, create your account, and register to browse stock, enquire, and book a test drive.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  hero: { paddingTop: spacing.xl, paddingBottom: spacing.xl, alignItems: 'center' },
  logoWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.primaryLight,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: spacing.md,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    marginBottom: spacing.md,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  secondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  secondaryBtn: {
    flexGrow: 1,
    minWidth: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  featureGrid: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  featureCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  featureTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  featureText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginTop: 4 },
  infoCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  infoTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  infoText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginTop: 4 },
  previewHero: { paddingTop: spacing.xl, paddingBottom: spacing.xl, alignItems: 'center' },
  previewIconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  previewTitle: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  previewSubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 4 },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.xl,
  },
  previewCardTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  previewCardMeta: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  previewCardBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md },
});