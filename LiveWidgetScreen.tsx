import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

const WIDGET_TITLES: Record<string, { title: string; subtitle: string; icon: string }> = {
  news: { title: 'News', subtitle: 'Latest stories and dealership updates', icon: 'newspaper' },
  weather: { title: 'Weather', subtitle: 'Live weather for the dealership area', icon: 'partly-sunny' },
  markets: { title: 'Financial Markets', subtitle: 'Live market pulse', icon: 'trending-up' },
  suggested: { title: 'Suggested Accounts', subtitle: 'Staff and customers in the app', icon: 'people' },
  competition: { title: 'Competition', subtitle: 'Live competition activity and entries', icon: 'trophy' },
  initiative: { title: 'Social Development Initiative', subtitle: 'Community and CSR activity', icon: 'leaf' },
};

type WidgetKey = keyof typeof WIDGET_TITLES;

function formatTime(ts: number | null) {
  if (!ts) return 'live';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSigned(value: number | null, fractionDigits = 2) {
  if (value === null || Number.isNaN(value)) return '—';
  const fixed = value.toFixed(fractionDigits);
  return value > 0 ? `+${fixed}` : fixed;
}

function formatPrice(value: number | null) {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function LiveWidgetScreen({ navigation, route }: any) {
  const widgetKey = (route?.params?.widgetKey ?? 'news') as WidgetKey;
  const widget = WIDGET_TITLES[widgetKey] ?? WIDGET_TITLES.news;

  const newsPosts = useQuery(api.posts.listPostsByType, widgetKey === 'news' ? { postType: 'news', limit: 30 } : 'skip');
  const competitionPosts = useQuery(api.posts.listPostsByType, widgetKey === 'competition' ? { postType: 'competition', limit: 30 } : 'skip');
  const initiativePosts = useQuery(api.posts.listPostsByType, widgetKey === 'initiative' ? { postType: 'initiative', limit: 30 } : 'skip');
  const suggestedAccountsQuery = useQuery(api.users.listAppAccounts, widgetKey === 'suggested' ? { limit: 100 } : 'skip');
  const followingIdsQuery = useQuery(api.posts.listFollowingIds);
  const followingIds = useMemo(() => followingIdsQuery ?? [], [followingIdsQuery]);
  const followUser = useMutation(api.posts.followUser);
  const unfollowUser = useMutation(api.posts.unfollowUser);
  const suggestedAccounts = useMemo(() => suggestedAccountsQuery ?? [], [suggestedAccountsQuery]);
  const posts = useMemo(() => (widgetKey === 'news' ? newsPosts : widgetKey === 'competition' ? competitionPosts : widgetKey === 'initiative' ? initiativePosts : []) ?? [], [competitionPosts, initiativePosts, newsPosts, widgetKey]);

  const [weather, setWeather] = useState({ temperature: null as number | null, condition: 'Loading weather', updatedAt: null as number | null, location: 'Johannesburg' });
  const [market, setMarket] = useState({ symbol: '^GSPC', price: null as number | null, change: null as number | null, changePercent: null as number | null, updatedAt: null as number | null });
  const [busy, setBusy] = useState(false);
  const [followOverrides, setFollowOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (widgetKey !== 'weather' && widgetKey !== 'markets') return;
    let active = true;

    const load = async () => {
      try {
        if (widgetKey === 'weather') {
          const response = await globalThis.fetch('https://api.open-meteo.com/v1/forecast?latitude=-26.2041&longitude=28.0473&current=temperature_2m,weather_code&timezone=Africa%2FJohannesburg');
          const json: any = await response.json();
          if (!active || !json?.current) return;
          const code = String(json.current.weather_code ?? '');
          const label = code === '0' ? 'Clear' : code === '1' || code === '2' ? 'Partly cloudy' : code === '3' ? 'Cloudy' : code === '61' || code === '63' ? 'Rain' : 'Live weather';
          setWeather({
            temperature: typeof json.current.temperature_2m === 'number' ? json.current.temperature_2m : null,
            condition: label,
            updatedAt: Date.now(),
            location: 'Johannesburg',
          });
        }
      } catch {}

      try {
        if (widgetKey === 'markets') {
          const response = await globalThis.fetch('https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EGSPC,MSFT,AAPL,TSLA');
          const json: any = await response.json();
          const quote = json?.quoteResponse?.result?.[0];
          if (!active || !quote) return;
          setMarket({
            symbol: String(quote.symbol ?? '^GSPC'),
            price: typeof quote.regularMarketPrice === 'number' ? quote.regularMarketPrice : null,
            change: typeof quote.regularMarketChange === 'number' ? quote.regularMarketChange : null,
            changePercent: typeof quote.regularMarketChangePercent === 'number' ? quote.regularMarketChangePercent : null,
            updatedAt: Date.now(),
          });
        }
      } catch {}
    };

    void load();
    const timer = setInterval(() => void load(), 120000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [widgetKey]);

  const handleToggleFollow = async (account: any) => {
    const accountId = String(account._id);
    const isFollowing = followOverrides[accountId] ?? followingIds.includes(accountId);
    setFollowOverrides((current: Record<string, boolean>) => ({ ...current, [accountId]: !isFollowing }));
    try {
      if (isFollowing) {
        await unfollowUser({ followingId: accountId });
      } else {
        await followUser({ followingId: accountId });
      }
    } catch (error: any) {
      setFollowOverrides((current: Record<string, boolean>) => {
        const next = { ...current };
        delete next[accountId];
        return next;
      });
      Alert.alert('Follow', error?.message ?? 'Could not update follow status.');
    }
  };

  const openInvite = async (account: any) => {
    setBusy(true);
    try {
      const displayName = account.displayName || account.name || account.email || 'this account';
      await Share.share({
        message: `Invite ${displayName} to a test drive, event, or competition participation.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const openProfile = (accountId: string) => {
    navigation.navigate('CustomerProfile', { userId: accountId });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{widget.title}</Text>
            <Text style={styles.subtitle}>{widget.subtitle}</Text>
          </View>
          <View style={styles.livePill}>
            <Text style={styles.liveText}>{formatTime(widgetKey === 'weather' ? weather.updatedAt : widgetKey === 'markets' ? market.updatedAt : Date.now())}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {widgetKey === 'weather' ? (
            <View style={styles.heroCard}>
              <Ionicons name="partly-sunny" size={28} color={colors.primary} />
              <Text style={styles.heroValue}>{weather.temperature === null ? '—' : `${weather.temperature.toFixed(0)}°C`}</Text>
              <Text style={styles.heroLabel}>{weather.condition}</Text>
              <Text style={styles.heroMeta}>{weather.location} · updated {formatTime(weather.updatedAt)}</Text>
            </View>
          ) : null}

          {widgetKey === 'markets' ? (
            <View style={styles.heroCard}>
              <Ionicons name="trending-up" size={28} color={colors.primary} />
              <Text style={styles.heroValue}>{market.price === null ? '—' : formatPrice(market.price)}</Text>
              <Text style={styles.heroLabel}>{market.symbol}</Text>
              <Text style={styles.heroMeta}>{formatSigned(market.change)} ({formatSigned(market.changePercent)}%) · updated {formatTime(market.updatedAt)}</Text>
            </View>
          ) : null}

          {widgetKey === 'suggested' ? (
            <View style={styles.section}>
              {suggestedAccounts.map((account: any) => {
                const accountId = String(account._id);
                const isFollowing = followOverrides[accountId] ?? followingIds.includes(accountId);
                const name = account.displayName || account.name || account.email || 'User';
                return (
                  <View key={accountId} style={styles.rowCard}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85} onPress={() => openProfile(accountId)}>
                      <Text style={styles.rowTitle}>{name}</Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {account.accountType === 'staff' ? `${account.staffRole || 'staff'} · ${account.dealershipName || 'App staff'}` : 'Customer · App member'}{account.isOnline ? ' · Online' : ''}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.rowActions}>
                      <TouchableOpacity style={[styles.actionBtn, isFollowing && styles.actionBtnActive]} onPress={() => void handleToggleFollow(account)}>
                        <Text style={[styles.actionText, isFollowing && styles.actionTextActive]}>{isFollowing ? 'Following' : 'Follow back'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionBtnGhost} onPress={() => void openInvite(account)} disabled={busy}>
                        <Text style={styles.actionTextGhost}>Invite</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {(widgetKey === 'news' || widgetKey === 'competition' || widgetKey === 'initiative') ? (
            <View style={styles.section}>
              {posts.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name={widget.icon as any} size={24} color={colors.textLight} />
                  <Text style={styles.emptyTitle}>Nothing live yet</Text>
                  <Text style={styles.emptyText}>This widget will update automatically as content is added.</Text>
                </View>
              ) : posts.map((post: any) => {
                if (widgetKey === 'initiative') {
                  const mediaUri = post.image || post.video;
                  return (
                    <TouchableOpacity
                      key={post.postId}
                      style={styles.feedCard}
                      activeOpacity={0.9}
                      onPress={() => navigation.navigate('SocialFeed', { postId: post.postId })}
                    >
                      <View style={styles.feedCardHeader}>
                        <View style={styles.feedCardBadge}>
                          <Ionicons name="leaf-outline" size={14} color={colors.primary} />
                          <Text style={styles.feedCardBadgeText}>Social development</Text>
                        </View>
                        <Text style={styles.feedCardTime}>{new Date(post.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      <Text style={styles.feedCardTitle}>{post.title || 'Initiative update'}</Text>
                      <Text style={styles.feedCardMeta}>{post.authorDisplayName}</Text>
                      <Text style={styles.feedCardBody} numberOfLines={6}>{post.content}</Text>
                      {mediaUri ? (
                        post.image ? (
                          <Image source={{ uri: post.image }} style={styles.feedCardImage} resizeMode="contain" />
                        ) : (
                          <View style={styles.feedCardMediaPlaceholder}>
                            <Ionicons name="videocam-outline" size={22} color={colors.primary} />
                            <Text style={styles.feedCardMediaText}>Video available in feed</Text>
                          </View>
                        )
                      ) : null}
                    </TouchableOpacity>
                  );
                }

                return (
                  <TouchableOpacity key={post.postId} style={styles.rowCard} activeOpacity={0.9} onPress={() => navigation.navigate('SocialFeed', { postId: post.postId })}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{post.title || 'Update'}</Text>
                      <Text style={styles.rowMeta} numberOfLines={2}>{post.content}</Text>
                      <Text style={styles.rowFoot}>{post.authorDisplayName} · {new Date(post.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <View style={styles.footerCard}>
            <Text style={styles.footerTitle}>Live panel</Text>
            <Text style={styles.footerText}>This screen refreshes from the app in real time where supported.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('Events')}>
              <Text style={styles.primaryBtnText}>Open Events</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  container: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderLight },
  title: { fontSize: 20, fontWeight: '900', color: colors.text },
  subtitle: { marginTop: 2, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  livePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '24' },
  liveText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  heroCard: { backgroundColor: colors.surface, borderRadius: 28, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center', gap: 6 },
  heroValue: { fontSize: 34, fontWeight: '900', color: colors.text },
  heroLabel: { fontSize: 16, fontWeight: '800', color: colors.textSecondary },
  heroMeta: { fontSize: 12, color: colors.textLight, fontWeight: '600' },
  section: { gap: spacing.sm },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.borderLight },
  rowTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  rowMeta: { marginTop: 4, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  rowFoot: { marginTop: 8, fontSize: 11, color: colors.textLight, fontWeight: '700' },
  rowActions: { gap: 8 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '24', alignItems: 'center' },
  actionBtnActive: { backgroundColor: colors.surface, borderColor: colors.borderLight },
  actionText: { fontSize: 12, fontWeight: '900', color: colors.primary },
  actionTextActive: { color: colors.textSecondary },
  actionBtnGhost: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center' },
  actionTextGhost: { fontSize: 12, fontWeight: '900', color: colors.textSecondary },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 20, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  emptyText: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  footerCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.sm, marginTop: spacing.sm },
  footerTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  footerText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.full, alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  primaryBtnText: { color: colors.white, fontWeight: '900', fontSize: 13 },
  feedCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, gap: 8 },
  feedCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  feedCardBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '20' },
  feedCardBadgeText: { fontSize: 11, fontWeight: '900', color: colors.primary },
  feedCardTime: { fontSize: 11, fontWeight: '700', color: colors.textLight },
  feedCardTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  feedCardMeta: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  feedCardBody: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  feedCardImage: { width: '100%', height: 220, borderRadius: 18, backgroundColor: colors.surfaceAlt },
  feedCardMediaPlaceholder: { width: '100%', minHeight: 120, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.borderLight },
  feedCardMediaText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
});