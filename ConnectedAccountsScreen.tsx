import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { SOCIAL_PLATFORMS } from '../lib/shareUtils';

const PLATFORMS = [
  {
    id: 'facebook',
    label: 'Facebook',
    icon: 'logo-facebook',
    color: '#1877F2',
    description: 'Share bookings and reviews on Facebook',
    connectHint: 'Enter your Facebook profile name',
    openUrl: 'https://www.facebook.com',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: 'logo-instagram',
    color: '#E4405F',
    description: 'Share service experiences on Instagram',
    connectHint: 'Enter your Instagram username',
    openUrl: 'https://www.instagram.com',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: 'logo-whatsapp',
    color: '#25D366',
    description: 'Share via WhatsApp status and contacts',
    connectHint: 'Enter your WhatsApp display name',
    openUrl: 'https://wa.me',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: 'musical-notes',
    color: '#000000',
    description: 'Share service content on TikTok',
    connectHint: 'Enter your TikTok username',
    openUrl: 'https://www.tiktok.com',
  },
];

const HEDERA_PLATFORMS = [
  {
    id: 'hedera-native',
    label: 'Hedera In-App Wallet',
    icon: 'wallet',
    color: colors.primary,
    description: 'Secure local Hedera wallet surface inside the app',
    connectHint: 'Enter account ID and public key for your local Hedera wallet',
    openUrl: 'https://hedera.com',
  },
  {
    id: 'hedera-external',
    label: 'Hedera External Wallet',
    icon: 'link',
    color: colors.success,
    description: 'Connect HashPack or another external Hedera wallet',
    connectHint: 'Enter account ID and wallet label for the external connection',
    openUrl: 'https://hashpack.app/',
  },
];

export default function ConnectedAccountsScreen({ navigation }: any) {
  const connectionStatus = useQuery(api.socialAccounts.getConnectionStatus);
  const connectedAccounts = useQuery(api.socialAccounts.listMine) ?? [];
  const hederaWallets = useQuery(api.hederaWallets.listMine) ?? [];
  const connectAccount = useMutation(api.socialAccounts.connect);
  const disconnectAccount = useMutation(api.socialAccounts.disconnect);
  const connectNativeWallet = useMutation(api.hederaWallets.connectNative);
  const connectExternalWallet = useMutation(api.hederaWallets.connectExternal);
  const disconnectHederaWallet = useMutation(api.hederaWallets.disconnect);

  const [connectModal, setConnectModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<(typeof PLATFORMS)[number] | null>(null);
  const [selectedHederaPlatform, setSelectedHederaPlatform] = useState<(typeof HEDERA_PLATFORMS)[number] | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [hederaAccountId, setHederaAccountId] = useState('');
  const [hederaPublicKey, setHederaPublicKey] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleConnect = (platform: (typeof PLATFORMS)[number]) => {
    setSelectedPlatform(platform);
    setDisplayName('');
    setConnectModal(true);
  };

  const openPlatform = async (platformId: string) => {
    const platform = PLATFORMS.find((p) => p.id === platformId);
    if (!platform) return;
    try {
      await Linking.openURL(platform.openUrl);
    } catch {
      Alert.alert('Unavailable', `Could not open ${platform.label}.`);
    }
  };

  const handleDisconnect = (platformId: string) => {
    const platform = PLATFORMS.find(p => p.id === platformId);
    Alert.alert(
      `Disconnect ${platform?.label}?`,
      'You can reconnect anytime. No data will be shared after disconnecting.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectAccount({ platform: platformId });
            } catch (e) {
              Alert.alert('Error', 'Failed to disconnect. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleConfirmConnect = async () => {
    if (!selectedPlatform || !displayName.trim()) return;
    setConnecting(true);
    try {
      await connectAccount({
        platform: selectedPlatform.id,
        displayName: displayName.trim(),
      });
      setConnectModal(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to connect. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const handleConnectHedera = async () => {
    if (!selectedHederaPlatform || !hederaAccountId.trim()) return;
    if (selectedHederaPlatform.id === 'hedera-native' && !hederaPublicKey.trim()) return;
    setConnecting(true);
    try {
      if (selectedHederaPlatform.id === 'hedera-native') {
        await connectNativeWallet({
          walletName: selectedHederaPlatform.label,
          network: 'testnet',
          accountId: hederaAccountId.trim(),
          publicKey: hederaPublicKey.trim(),
        });
      } else {
        await connectExternalWallet({
          walletName: selectedHederaPlatform.label,
          network: 'testnet',
          accountId: hederaAccountId.trim(),
          publicKey: hederaPublicKey.trim() || undefined,
        });
      }
      setConnectModal(false);
      setSelectedHederaPlatform(null);
      setHederaAccountId('');
      setHederaPublicKey('');
    } catch (e) {
      Alert.alert('Error', 'Failed to connect Hedera wallet. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const getAccountInfo = (platformId: string) => {
    return connectedAccounts.find((a: any) => a.platform === platformId);
  };

  const isConnected = (platformId: string): boolean => {
    if (!connectionStatus) return false;
    return (connectionStatus as any)[platformId] ?? false;
  };

  const connectedCount = connectionStatus
    ? Object.values(connectionStatus).filter(Boolean).length
    : 0;
  const connectedHederaCount = hederaWallets.filter((wallet: any) => wallet.isConnected).length;

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={s.safe}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Connected Accounts</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          {/* Info Card */}
          <View style={s.infoCard}>
            <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
            <View style={s.infoText}>
              <Text style={s.infoTitle}>Your Privacy Matters</Text>
              <Text style={s.infoDesc}>
                We never post automatically. You always choose what to share and when.
              </Text>
            </View>
          </View>

          {/* Connection Stats */}
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statNum}>{connectedCount}</Text>
              <Text style={s.statLabel}>Connected</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statNum}>{4 - connectedCount}</Text>
              <Text style={s.statLabel}>Available</Text>
            </View>
          </View>

          <Text style={s.sectionTitle}>Hedera Wallets</Text>
          <View style={s.walletPanel}>
            <View style={s.walletStatsRow}>
              <View style={s.walletStatBox}>
                <Text style={s.statNum}>{connectedHederaCount}</Text>
                <Text style={s.statLabel}>Active</Text>
              </View>
              <View style={s.walletStatBox}>
                <Text style={s.statNum}>{HEDERA_PLATFORMS.length - connectedHederaCount}</Text>
                <Text style={s.statLabel}>Available</Text>
              </View>
            </View>
            <TouchableOpacity style={s.walletLaunchBtn} onPress={() => navigation.navigate('StaffWallet')}>
              <Ionicons name="wallet-outline" size={18} color={colors.white} />
              <Text style={s.walletLaunchText}>Open Staff Wallet</Text>
            </TouchableOpacity>
          </View>

          {HEDERA_PLATFORMS.map((platform) => {
            const connected = hederaWallets.some((wallet: any) => wallet.isConnected && wallet.connectionMode === (platform.id === 'hedera-native' ? 'native' : 'external'));
            const account = hederaWallets.find((wallet: any) => wallet.connectionMode === (platform.id === 'hedera-native' ? 'native' : 'external'));

            return (
              <View key={platform.id} style={s.platformCard}>
                <View style={s.platformHeader}>
                  <View style={[s.platformIcon, { backgroundColor: platform.color + '15' }]}>
                    <Ionicons name={platform.icon as any} size={24} color={platform.color} />
                  </View>
                  <View style={s.platformInfo}>
                    <Text style={s.platformName}>{platform.label}</Text>
                    {connected && account?.accountId ? (
                      <Text style={s.platformUsername}>Account {account.accountId}</Text>
                    ) : (
                      <Text style={s.platformDesc}>{platform.description}</Text>
                    )}
                  </View>
                  <View style={[s.statusBadge, connected ? s.statusConnected : s.statusDisconnected]}>
                    <View style={[s.statusDot, { backgroundColor: connected ? colors.success : colors.textLight }]} />
                    <Text style={[s.statusText, { color: connected ? colors.success : colors.textLight }]}>
                      {connected ? 'Connected' : 'Not linked'}
                    </Text>
                  </View>
                </View>

                <View style={s.platformActions}>
                  {connected ? (
                    <TouchableOpacity
                      style={s.disconnectBtn}
                      onPress={() => account && disconnectHederaWallet({ connectionId: account._id })}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={colors.error} />
                      <Text style={s.disconnectText}>Disconnect</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[s.connectBtn, { borderColor: platform.color }]}
                      onPress={() => {
                        setSelectedHederaPlatform(platform);
                        setHederaAccountId('');
                        setHederaPublicKey('');
                        setConnectModal(true);
                      }}
                    >
                      <Ionicons name="link-outline" size={16} color={platform.color} />
                      <Text style={[s.connectText, { color: platform.color }]}>Connect</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={s.openBtn} onPress={() => Linking.openURL(platform.openUrl).catch(() => {})}>
                    <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
                    <Text style={s.openText}>Open</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {/* Platform List */}
          <Text style={s.sectionTitle}>Social Platforms</Text>
          {PLATFORMS.map((platform) => {
            const connected = isConnected(platform.id);
            const account = getAccountInfo(platform.id);

            return (
              <View key={platform.id} style={s.platformCard}>
                <View style={s.platformHeader}>
                  <View style={[s.platformIcon, { backgroundColor: platform.color + '15' }]}>
                    <Ionicons name={platform.icon as any} size={24} color={platform.color} />
                  </View>
                  <View style={s.platformInfo}>
                    <Text style={s.platformName}>{platform.label}</Text>
                    {connected && account?.displayName ? (
                      <Text style={s.platformUsername}>@{account.displayName}</Text>
                    ) : (
                      <Text style={s.platformDesc}>{platform.description}</Text>
                    )}
                  </View>
                  <View style={[s.statusBadge, connected ? s.statusConnected : s.statusDisconnected]}>
                    <View style={[s.statusDot, { backgroundColor: connected ? colors.success : colors.textLight }]} />
                    <Text style={[s.statusText, { color: connected ? colors.success : colors.textLight }]}>
                      {connected ? 'Connected' : 'Not linked'}
                    </Text>
                  </View>
                </View>

                {connected && account && (
                  <View style={s.connectedInfo}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <Text style={s.connectedSince}>
                      Connected {new Date(account.connectedAt).toLocaleDateString('en-ZA', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                )}

                <View style={s.platformActions}>
                  {connected ? (
                    <TouchableOpacity
                      style={s.disconnectBtn}
                      onPress={() => handleDisconnect(platform.id)}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={colors.error} />
                      <Text style={s.disconnectText}>Disconnect</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[s.connectBtn, { borderColor: platform.color }]}
                      onPress={() => handleConnect(platform)}
                    >
                      <Ionicons name="link-outline" size={16} color={platform.color} />
                      <Text style={[s.connectText, { color: platform.color }]}>Connect</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={s.openBtn}
                    onPress={() => openPlatform(platform.id)}
                  >
                    <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
                    <Text style={s.openText}>Open</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {/* Privacy Notice */}
          <View style={s.privacyCard}>
            <Ionicons name="lock-closed" size={20} color={colors.primary} />
            <Text style={s.privacyTitle}>Data & Security</Text>
            <Text style={s.privacyText}>
              • No automatic posting — you control every share{'\n'}
              • Disconnect anytime to revoke access{'\n'}
              • Your connection data is stored securely{'\n'}
              • We comply with platform sharing policies
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Connect Modal */}
      <Modal visible={connectModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                Connect {selectedPlatform?.label}
              </Text>
              <TouchableOpacity onPress={() => setConnectModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedPlatform && (
              <View style={[s.modalIconWrap, { backgroundColor: selectedPlatform.color + '15' }]}>
                <Ionicons
                  name={selectedPlatform.icon as any}
                  size={40}
                  color={selectedPlatform.color}
                />
              </View>
            )}

            <Text style={s.modalDesc}>
              {selectedPlatform?.connectHint}
            </Text>

            <TextInput
              style={s.modalInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={`Your ${selectedPlatform?.label} name`}
              placeholderTextColor={colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={s.modalNote}>
              This helps personalize your sharing experience. We won't access your account without permission.
            </Text>

            <TouchableOpacity
              style={[
                s.modalConnectBtn,
                { backgroundColor: selectedPlatform?.color ?? colors.primary },
                !displayName.trim() && { opacity: 0.5 },
              ]}
              onPress={handleConfirmConnect}
              disabled={!displayName.trim() || connecting}
            >
              {connecting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="link" size={18} color="#fff" />
                  <Text style={s.modalConnectText}>Connect Account</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.borderLight,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },

  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary + '08',
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary + '20',
  },
  infoText: { flex: 1 },
  infoTitle: { fontSize: 14, fontWeight: '800', color: colors.primary },
  infoDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  statNum: { fontSize: 28, fontWeight: '900', color: colors.primary },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontWeight: '700' },

  sectionTitle: { fontSize: 18, fontWeight: '900', color: colors.text, marginBottom: spacing.md },

  platformCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  platformHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  platformIcon: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
  },
  platformInfo: { flex: 1 },
  platformName: { fontSize: 16, fontWeight: '800', color: colors.text },
  platformDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  platformUsername: { fontSize: 13, color: colors.primary, marginTop: 2, fontWeight: '700' },

  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full,
  },
  statusConnected: { backgroundColor: colors.success + '12' },
  statusDisconnected: { backgroundColor: colors.surfaceAlt },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '800' },

  connectedInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.sm, paddingLeft: 60,
  },
  connectedSince: { fontSize: 12, color: colors.textSecondary },

  platformActions: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  connectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1.5,
    backgroundColor: colors.background,
  },
  connectText: { fontSize: 13, fontWeight: '800' },
  disconnectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.error + '10',
  },
  disconnectText: { fontSize: 13, fontWeight: '800', color: colors.error },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  openText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },

  privacyCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 24,
    padding: spacing.lg,
    marginTop: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  privacyTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  privacyText: {
    fontSize: 13, color: colors.textSecondary, lineHeight: 22,
    marginTop: spacing.sm, textAlign: 'left', width: '100%',
  },

  walletPanel: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.lg,
  },
  walletStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  walletStatBox: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  walletLaunchBtn: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 12,
  },
  walletLaunchText: { color: colors.white, fontSize: 13, fontWeight: '800' },

  // Modal
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xxl,
    paddingBottom: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', marginBottom: spacing.xl,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  modalIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalDesc: {
    fontSize: 15, color: colors.textSecondary, textAlign: 'center',
    marginBottom: spacing.lg,
  },
  modalInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    marginBottom: spacing.md,
  },
  modalNote: {
    fontSize: 12, color: colors.textLight, textAlign: 'center',
    marginBottom: spacing.xl, paddingHorizontal: spacing.lg,
  },
  modalConnectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: radius.md, width: '100%',
  },
  modalConnectText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});