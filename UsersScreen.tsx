import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

function formatPhone(phone?: string) {
  return String(phone ?? '').replace(/\s+/g, '').replace(/[^\d+]/g, '');
}

export default function UsersScreen({ navigation }: any) {
  const me = useQuery(api.users.me);
  const usersQuery = useQuery(api.users.listAll);
  const users = useMemo(() => usersQuery ?? [], [usersQuery]);
  const canAccessAdmin = Boolean(
    me?.isOwner ||
    String(me?.email ?? '').toLowerCase() === 'vincentmm@hyundai.co.za' ||
    me?.staffRole === 'dp' ||
    me?.accessLevel === 'full_access'
  );

  if (!canAccessAdmin) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Users</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.lockedWrap}>
            <Ionicons name="lock-closed-outline" size={44} color={colors.primary} />
            <Text style={styles.lockedTitle}>Admin only</Text>
            <Text style={styles.lockedText}>User records are restricted to the admin panel.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const rows = users
    .filter((user: any) => !user.isDeleted)
    .map((user: any) => ({
      ...user,
      isOnline: typeof user.lastSeenAt === 'number' && Date.now() - user.lastSeenAt < 120000,
    }))
    .sort((a: any, b: any) => Number(b.isOnline) - Number(a.isOnline) || String(a.name ?? a.email ?? '').localeCompare(String(b.name ?? b.email ?? '')));

  const renderContactLine = (icon: any, value?: string) => value ? (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={14} color={colors.primary} />
      <Text style={styles.detailText}>{value}</Text>
    </View>
  ) : null;

  const openWhatsApp = async (phone?: string) => {
    const cleaned = formatPhone(phone).replace(/^\+/, '');
    if (!cleaned) return;
    await Linking.openURL(`https://wa.me/${cleaned}`);
  };

  const openEmail = async (email?: string) => {
    if (!email) return;
    await Linking.openURL(`mailto:${email}`);
  };

  const openCall = async (phone?: string) => {
    const cleaned = formatPhone(phone);
    if (!cleaned) return;
    await Linking.openURL(`tel:${cleaned}`);
  };

  const openChat = (user: any) => {
    navigation.navigate('StaffChat', {
      recipientId: String(user._id),
      recipientName: user.displayName || user.name || user.email || 'User',
      chatType: 'staff',
    });
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Users</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.subtitle}>Every staff member and customer, organized by dealership and contact details.</Text>

          {rows.map((user: any) => (
            <View key={user._id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.avatarWrap}>
                  {user.profileImage ? (
                    <Image source={{ uri: user.profileImage }} style={styles.avatar} />
                  ) : (
                    <Text style={styles.avatarInitials}>{String(user.displayName || user.name || user.email || '?').trim().charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{user.displayName || user.name || user.email || 'Unnamed user'}</Text>
                  <Text style={styles.meta}>{user.email || 'No email'} · {user.phone || 'No phone'}</Text>
                  <Text style={styles.meta}>{String(user.role || 'customer').replace('_', ' ')} · {String(user.accessLevel || 'limited_access').replace('_', ' ')}</Text>
                  {user.dealershipName ? <Text style={styles.dealershipTag}>{user.dealershipName} · {user.dealershipLocation || user.dealershipBrand || 'Assigned dealership'}</Text> : null}
                </View>
                <View style={[styles.statusPill, user.isOnline ? styles.statusOnline : styles.statusOffline]}>
                  <Text style={styles.statusText}>{user.isOnline ? 'Online' : 'Offline'}</Text>
                </View>
              </View>

              <View style={styles.detailsBlock}>
                {renderContactLine('call-outline', user.phone)}
                {renderContactLine('call-outline', user.alternatePhone)}
                {renderContactLine('mail-outline', user.email)}
                {renderContactLine('location-outline', user.address)}
                {renderContactLine('chatbubbles-outline', user.preferredContactMethod)}
                {renderContactLine('gift-outline', user.birthday)}
                {renderContactLine('document-text-outline', user.profileNotes)}
                {renderContactLine('person-circle-outline', user.bio)}
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openChat(user)}>
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.white} />
                  <Text style={styles.actionText}>Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openWhatsApp(user.phone)}>
                  <Ionicons name="logo-whatsapp" size={16} color={colors.white} />
                  <Text style={styles.actionText}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openEmail(user.email)}>
                  <Ionicons name="mail-outline" size={16} color={colors.white} />
                  <Text style={styles.actionText}>Email</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openCall(user.phone)}>
                  <Ionicons name="call-outline" size={16} color={colors.white} />
                  <Text style={styles.actionText}>Call</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  adminBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full },
  adminBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  lockedWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl, gap: 12 },
  lockedTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  lockedText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  subtitle: { color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatarWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  avatarInitials: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  dealershipTag: { color: colors.primary, fontSize: 11, marginTop: 4, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  detailsBlock: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight, gap: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full },
  statusOnline: { backgroundColor: colors.success + '18' },
  statusOffline: { backgroundColor: colors.borderLight },
  statusText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full },
  actionText: { color: colors.white, fontWeight: '700', fontSize: 12 },
});