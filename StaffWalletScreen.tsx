import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { colors, radius, spacing } from '../lib/theme';
import { api } from '../lib/api';

export default function StaffWalletScreen({ navigation }: any) {
  const user = useQuery(api.users.me);
  const walletSummary = useQuery(api.bookings.getSalesExecutiveWalletSummary);

  const role = String(user?.staffRole ?? user?.role ?? '').trim().toLowerCase();
  const isSalesExecutive = ['sales_executive', 'sales_manager', 'sales'].includes(role) || Boolean(user?.isOwner || user?.role === 'admin' || user?.accessLevel === 'full_access');

  const completedBookings = walletSummary?.completedBookings ?? [];
  const transactions = walletSummary?.transactions ?? [];
  const creditedCount = completedBookings.filter((booking: any) => booking.walletCreditedAt).length;
  const pendingCount = completedBookings.length - creditedCount;
  const totalEarned = walletSummary?.totalEarned ?? 0;
  const totalWithdrawn = walletSummary?.totalWithdrawn ?? 0;
  const balance = walletSummary?.balance ?? 0;

  const exportInvoice = async () => {
    const invoiceNumber = `WDL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(completedBookings.length).padStart(3, '0')}`;
    const issueDate = new Date().toLocaleDateString();
    const unitAmount = 50;
    const totalAmount = completedBookings.reduce((sum: number, booking: any) => sum + Number(booking.walletCreditAmount ?? unitAmount), 0);

    const lineItems = completedBookings.length > 0
      ? completedBookings.map((booking: any, index: number) => (
          `${index + 1}. ${booking.referenceNumber ?? booking._id} | ${booking.customerName ?? 'Customer'} | ${booking.serviceType ?? 'Service booking'} | ${booking.date ?? ''} ${booking.timeSlot ?? ''} | R${Number(booking.walletCreditAmount ?? unitAmount).toFixed(2)} | ${booking.walletCreditedAt ? 'Credited' : 'Pending'}`
        )).join('\n')
      : 'No completed bookings available';

    const textInvoice = [
      'WITHDRAWAL STATEMENT',
      'Sales commission statement for successful service bookings',
      `Statement No: ${invoiceNumber}`,
      `Issue Date: ${issueDate}`,
      `Prepared By: ${user?.name ?? user?.email ?? 'Sales Executive'}`,
      '',
      `Completed bookings: ${completedBookings.length}`,
      'Commission rate: R50.00 per completed service booking',
      `Total claimable: R${totalAmount.toFixed(2)}`,
      '',
      'LINE ITEMS',
      lineItems,
      '',
      `Wallet balance: R${balance.toFixed(2)}`,
      `Credited: ${creditedCount}`,
      `Pending: ${pendingCount}`,
      '',
      'Print this statement, have it signed, and submit it for claim processing.',
      'This app is the source of truth for booking completion and commission tracking.',
    ].join('\n');

    try {
      await Share.share({
        title: `Staff Wallet Statement ${invoiceNumber}`,
        message: textInvoice,
      });
    } catch {
      Alert.alert('Statement ready', textInvoice);
    }
  };

  if (!isSalesExecutive) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Staff Wallet</Text>
              <Text style={styles.subtitle}>Sales executives only</Text>
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Not available</Text>
            <Text style={styles.muted}>This wallet only shows the logged-in sales executive's own successful service bookings and commission balance.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Staff Wallet</Text>
              <Text style={styles.subtitle}>Only your successful service bookings are shown here</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Your commission wallet</Text>
            <Text style={styles.cardValue}>R{balance.toFixed(2)}</Text>
            <Text style={styles.muted}>R50 is added for each successful service booking assigned to you.</Text>
            <View style={styles.row}>
              <View style={styles.walletStat}>
                <Text style={styles.walletStatValue}>{completedBookings.length}</Text>
                <Text style={styles.walletStatLabel}>Your completed bookings</Text>
              </View>
              <View style={styles.walletStat}>
                <Text style={styles.walletStatValue}>R{totalEarned.toFixed(2)}</Text>
                <Text style={styles.walletStatLabel}>Total earned</Text>
              </View>
              <View style={styles.walletStat}>
                <Text style={styles.walletStatValue}>R{totalWithdrawn.toFixed(2)}</Text>
                <Text style={styles.walletStatLabel}>Withdrawn</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={exportInvoice}>
              <Text style={styles.primaryBtnText}>Generate withdrawal statement</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Wallet credit status</Text>
            <View style={styles.row}>
              <View style={styles.walletStat}>
                <Text style={styles.walletStatValue}>{creditedCount}</Text>
                <Text style={styles.walletStatLabel}>Credited</Text>
              </View>
              <View style={styles.walletStat}>
                <Text style={styles.walletStatValue}>{pendingCount}</Text>
                <Text style={styles.walletStatLabel}>Pending</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Your successful bookings</Text>
            {completedBookings.length === 0 ? (
              <Text style={styles.muted}>No completed bookings credited yet.</Text>
            ) : completedBookings.map((booking: any) => (
              <View key={booking._id} style={styles.listItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{booking.customerName ?? 'Customer'} • {booking.serviceType}</Text>
                  <Text style={styles.muted}>{booking.referenceNumber ?? booking._id} • {booking.date} • {booking.timeSlot}</Text>
                </View>
                <Text style={styles.smallMeta}>R{Number(booking.walletCreditAmount ?? 100).toFixed(2)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Wallet transactions</Text>
            {transactions.length === 0 ? (
              <Text style={styles.muted}>No transactions yet.</Text>
            ) : transactions.map((tx: any) => (
              <View key={tx._id} style={styles.listItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{tx.description}</Text>
                  <Text style={styles.muted}>{new Date(tx.createdAt).toLocaleString()}</Text>
                </View>
                <Text style={styles.smallMeta}>R{Number(tx.amount).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  cardLabel: { color: colors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  cardValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
  muted: { color: colors.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 18 },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  listTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  smallMeta: { color: colors.textLight, fontSize: 11 },
  walletStat: { flex: 1, minWidth: 92, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  walletStatValue: { fontSize: 16, fontWeight: '900', color: colors.text },
  walletStatLabel: { marginTop: 4, fontSize: 11, color: colors.textSecondary, fontWeight: '700' },
  primaryBtn: { marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: colors.white, fontSize: 15, fontWeight: '800' },
});