import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Dimensions, Animated, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import {
  PUBLIC_LANDING_URL,
  SOCIAL_PLATFORMS,
  getInviteShareUrl,
  getShareMessage,
  shareOnPlatform,
  sharePayload,
  type ShareContext,
} from '../lib/shareUtils';

const { width } = Dimensions.get('window');
const APP_URL = PUBLIC_LANDING_URL;

const PLATFORMS = [
  ...SOCIAL_PLATFORMS,
  { id: 'copy', label: 'Copy Link', icon: 'copy', color: colors.primary },
] as const;

export default function ShareScreen({ navigation }: any) {
  const referralData = useQuery(api.referrals.getMyCode);
  const referralHistory = useQuery(api.referrals.listMine);
  const trackShare = useMutation(api.referrals.trackShare);
  const user = useQuery(api.users.me);
  const [copied, setCopied] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  const code = referralData?.code ?? '...';
  const inviterName = String(user?.displayName ?? user?.name ?? user?.email ?? 'Customer').trim();
  const inviterType: 'customer' | 'staff' = user?.role === 'staff' || user?.staffRole ? 'staff' : 'customer';
  const occupation = inviterType === 'staff'
    ? String(user?.staffRole ?? user?.accessLevel ?? 'staff').replace(/_/g, ' ')
    : undefined;
  const dealershipName = inviterType === 'staff'
    ? String(user?.dealershipName ?? '').trim() || undefined
    : undefined;
  const shareContext: ShareContext = {
    type: 'invite',
    referralCode: code,
    inviterName,
    inviterType,
    dealershipName,
    occupation,
  };
  const shareUrl = getInviteShareUrl(code);
  const shareMessage = getShareMessage(shareContext, code);

  const copyText = async (text: string) => {
    const clipboard = (globalThis as any)?.navigator?.clipboard;
    if (clipboard?.writeText) {
      await clipboard.writeText(text);
      return true;
    }
    return false;
  };

  const inviteViaWhatsApp = async () => {
    try {
      await trackShare({ platform: 'whatsapp', referralCode: code });
      await shareOnPlatform('whatsapp', shareContext, code);
    } catch (e: any) {
      if (e?.message !== 'User did not share') {
        Alert.alert('Error', 'Could not open WhatsApp. Please try again.');
      }
    }
  };

  const handleShare = async (platform: (typeof PLATFORMS)[number]) => {
    try {
      if (platform.id === 'copy') {
        try {
          const copiedLink = await copyText(shareUrl);
          if (!copiedLink) throw new Error('Clipboard unavailable');
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
        } catch {
          Alert.alert('Share Link', shareUrl);
        }
        return;
      }

      await trackShare({ platform: platform.id, referralCode: code });
      await shareOnPlatform(platform.id, shareContext, code);
    } catch (e: any) {
      if (e?.message !== 'User did not share') {
        Alert.alert('Error', 'Could not share. Please try again.');
      }
    }
  };

  const pulseCode = () => {
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.05, duration: 150, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  };

  const platformIcon = (id: string) => {
    switch (id) {
      case 'sent': return 'paper-plane';
      case 'clicked': return 'eye';
      case 'registered': return 'person-add';
      case 'rewarded': return 'gift';
      default: return 'ellipse';
    }
  };

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={s.safe}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Share & Earn</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          {/* Hero */}
          <View style={s.hero}>
            <View style={s.heroIconWrap}>
              <Ionicons name="gift" size={40} color="#fff" />
            </View>
            <Text style={s.heroTitle}>Invite Friends, Earn Tokens</Text>
            <Text style={s.heroSub}>
              Share the app with friends and family. When they join, you BOTH earn 100 tokens!
            </Text>
          </View>

          {/* Referral Code */}
          <Animated.View style={[s.codeCard, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={s.codeLabel}>YOUR REFERRAL CODE</Text>
            <TouchableOpacity onPress={() => { pulseCode(); handleShare(PLATFORMS[PLATFORMS.length - 1]); }}>
              <Text style={s.codeText}>{code}</Text>
            </TouchableOpacity>
            <Text style={s.codeTap}>Tap to copy</Text>
            {copied && (
              <View style={s.copiedBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#fff" />
                <Text style={s.copiedText}>Copied!</Text>
              </View>
            )}
          </Animated.View>

          {/* Stats */}
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statNum}>{referralData?.totalShares ?? 0}</Text>
              <Text style={s.statLabel}>Shared</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statNum}>{referralData?.totalRegistered ?? 0}</Text>
              <Text style={s.statLabel}>Joined</Text>
            </View>
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: '#10B981' }]}>
                {referralData?.totalTokensEarned ?? 0}
              </Text>
              <Text style={s.statLabel}>Tokens Earned</Text>
            </View>
          </View>

          {/* Share Buttons */}
          <Text style={s.sectionTitle}>Share via</Text>
          <View style={s.shareGrid}>
            {PLATFORMS.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[s.shareBtn, { borderColor: p.color + '30' }]}
                onPress={() => handleShare(p)}
                activeOpacity={0.7}
              >
                <View style={[s.shareBtnIcon, { backgroundColor: p.color + '15' }]}>
                  <Ionicons name={p.icon as any} size={24} color={p.color} />
                </View>
                <Text style={s.shareBtnLabel}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={s.contactsBtn} onPress={inviteViaWhatsApp}>
            <Ionicons name="logo-whatsapp" size={20} color={colors.white} />
            <Text style={s.bigShareText}>Invite via WhatsApp</Text>
          </TouchableOpacity>

          {/* Big Share Button */}
          <TouchableOpacity
            style={s.bigShareBtn}
            onPress={async () => {
              await trackShare({ platform: 'native', referralCode: code });
              await sharePayload({ message: shareMessage, title: 'Hyundai/Kia Service Connect', url: APP_URL });
            }}
          >
            <Ionicons name="share-social" size={20} color="#fff" />
            <Text style={s.bigShareText}>Share with Anyone</Text>
          </TouchableOpacity>

          {/* Referral Message Preview */}
          <View style={s.previewCard}>
            <Text style={s.previewLabel}>SHARE MESSAGE PREVIEW</Text>
            <Text style={s.previewText}>{shareMessage}</Text>
          </View>

          {/* How It Works */}
          <Text style={s.sectionTitle}>How It Works</Text>
          <View style={s.stepsCard}>
            {[
              { icon: 'share-social', text: 'Share your unique code with friends' },
              { icon: 'download', text: 'They download the app and sign up' },
              { icon: 'gift', text: 'You BOTH get 100 drive-to-earn tokens' },
              { icon: 'trending-up', text: 'The more you share, the more you earn' },
            ].map((step, i) => (
              <View key={i} style={s.step}>
                <View style={s.stepNum}>
                  <Text style={s.stepNumText}>{i + 1}</Text>
                </View>
                <Ionicons name={step.icon as any} size={20} color={colors.primary} />
                <Text style={s.stepText}>{step.text}</Text>
              </View>
            ))}
          </View>

          {/* History */}
          {(referralHistory ?? []).length > 0 && (
            <>
              <Text style={s.sectionTitle}>Referral History</Text>
              {(referralHistory ?? []).map((r: any) => (
                <View key={r._id} style={s.historyRow}>
                  <Ionicons
                    name={platformIcon(r.status) as any}
                    size={18}
                    color={r.status === 'rewarded' ? '#10B981' : colors.textSecondary}
                  />
                  <View style={s.historyInfo}>
                    <Text style={s.historyPlatform}>
                      {r.platform.charAt(0).toUpperCase() + r.platform.slice(1)}
                      {r.referredUserName ? ` → ${r.referredUserName}` : ''}
                    </Text>
                    <Text style={s.historyDate}>
                      {new Date(r._creationTime).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={[
                    s.historyStatus,
                    { color: r.status === 'rewarded' ? '#10B981' : r.status === 'registered' ? colors.primary : colors.textLight },
                  ]}>
                    {r.status}
                    {r.tokenReward ? ` +${r.tokenReward}` : ''}
                  </Text>
                </View>
              ))}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  hero: { alignItems: 'center', paddingVertical: spacing.xl },
  heroIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  heroSub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8, paddingHorizontal: 20 },
  codeCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.xl, alignItems: 'center',
    borderWidth: 2, borderColor: colors.primary + '30', borderStyle: 'dashed',
    marginBottom: spacing.lg,
  },
  codeLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1.5, marginBottom: 8 },
  codeText: { fontSize: 36, fontWeight: '900', color: colors.primary, letterSpacing: 4 },
  codeTap: { fontSize: 12, color: colors.textLight, marginTop: 4 },
  copiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#10B981', borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 4, marginTop: 8,
  },
  copiedText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  statBox: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
    borderWidth: 1, borderColor: colors.borderLight,
  },
  statNum: { fontSize: 24, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  shareGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  shareBtn: {
    width: (width - spacing.lg * 2 - spacing.sm * 2) / 3,
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
    borderWidth: 1,
  },
  shareBtnIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  shareBtnLabel: { fontSize: 11, fontWeight: '600', color: colors.text },
  contactsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.success, borderRadius: radius.md,
    paddingVertical: 16, marginBottom: spacing.md,
  },
  bigShareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 16, marginBottom: spacing.xl,
  },
  bigShareText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  previewCard: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.xl,
  },
  previewLabel: { fontSize: 10, fontWeight: '700', color: colors.textLight, letterSpacing: 1, marginBottom: 8 },
  previewText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  stepsCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.md, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center',
  },
  stepNumText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  stepText: { flex: 1, fontSize: 14, color: colors.text },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  historyInfo: { flex: 1 },
  historyPlatform: { fontSize: 14, fontWeight: '600', color: colors.text },
  historyDate: { fontSize: 11, color: colors.textSecondary },
  historyStatus: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
});