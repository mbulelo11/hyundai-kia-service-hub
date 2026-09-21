import React, { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, radius, spacing } from '../lib/theme';

const BRANDS = ['Hyundai', 'Kia'] as const;

type Brand = (typeof BRANDS)[number];

function formatStatus(status?: string) {
  return String(status ?? 'submitted').replace(/_/g, ' ');
}

function formatMoney(value?: number) {
  const amount = Number(value ?? 0);
  return `R ${amount.toLocaleString()}`;
}

function isCompleted(status?: string) {
  return ['completed', 'fulfilled'].includes(String(status ?? '').toLowerCase());
}

const ORDER_STAGES = [
  'Order received',
  'Quote + banking details',
  'Proof of payment uploaded',
  'Payment confirmed',
  'Delivery or collection completed',
] as const;

export default function MerchandiseOrdersScreen({ navigation }: any) {
  const me = useQuery(api.users.me);
  const isStaff = Boolean(me?.role === 'staff' || me?.role === 'admin' || me?.isOwner || String(me?.accessLevel ?? '') === 'full_access');
  const [brand, setBrand] = useState<Brand>('Hyundai');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [proofOrderId, setProofOrderId] = useState<string | null>(null);
  const [quoteOrderId, setQuoteOrderId] = useState<string | null>(null);
  const [quoteText, setQuoteText] = useState('');
  const [quoteFiles, setQuoteFiles] = useState<Array<{ uri: string; name: string; mimeType: string }>>([]);

  const orders = useQuery(api.merchandise.listOrdersByBrand, { brand }) ?? [];
  const receiveOrder = useMutation(api.merchandise.receiveOrder);
  const confirmAvailability = useMutation(api.merchandise.confirmAvailability);
  const submitPaymentProof = useMutation(api.merchandise.submitPaymentProof);
  const confirmPayment = useMutation(api.merchandise.confirmPayment);
  const completeOrder = useMutation(api.merchandise.completeOrder);
  const markUnavailable = useMutation(api.merchandise.markUnavailable);
  const generateUploadUrl = useMutation(api.merchandise.generateUploadUrl);

  const pendingCount = orders.filter((order: any) => !isCompleted(order.status)).length;
  const completedCount = orders.filter((order: any) => isCompleted(order.status)).length;

  const openThread = (order: any) => {
    const customerId = String(order?.userId ?? '').trim();
    if (!customerId) {
      Alert.alert('Thread unavailable', 'This order is missing a linked customer account.');
      return;
    }
    navigation.navigate('StaffChat', {
      customerId,
      recipientId: customerId,
    });
  };

  const pickQuoteFiles = async () => {
    try {
      const DocumentPicker: any = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
      if (result.canceled || !result.assets?.length) return;
      setQuoteFiles(result.assets.map((asset: any) => ({
        uri: asset.uri,
        name: asset.name ?? 'Quote document',
        mimeType: asset.mimeType ?? 'application/octet-stream',
      })));
    } catch (error: any) {
      Alert.alert('Upload failed', error?.message ?? 'Could not attach quote document');
    }
  };

  const sendQuote = async (order: any) => {
    if (!quoteFiles.length) {
      Alert.alert('Quote required', 'Please upload the quote or invoice before sending it.');
      return;
    }
    setQuoteOrderId(order._id);
    try {
      const uploadIds: string[] = [];
      for (const file of quoteFiles) {
        const uploadUrl = await generateUploadUrl({});
        const fileBlob = await globalThis.fetch(file.uri).then((res) => res.blob());
        const response = await globalThis.fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.mimeType }, body: fileBlob });
        const body = await response.text();
        const storageId = (() => { try { return JSON.parse(body).storageId || JSON.parse(body).id || ''; } catch { return body.trim(); } })();
        if (!storageId) throw new Error('Failed to upload quote file');
        uploadIds.push(storageId);
      }
      await confirmAvailability({ orderId: order._id, bankingDetails: order.bankingDetails || 'Banking details pending', deliveryFee: Number(order.deliveryFee ?? 0), quoteAttachmentStorageIds: uploadIds as any, quoteAttachmentNames: quoteFiles.map((file: { name: string }) => file.name) });
      setQuoteFiles([]);
      setQuoteText('');
    } catch (error: any) {
      Alert.alert('Quote send failed', error?.message ?? 'Could not send the quote');
    } finally {
      setQuoteOrderId(null);
    }
  };

  const submitProof = async (order: any) => {
    const storageIds = Array.isArray(order?.paymentProofStorageIds) ? order.paymentProofStorageIds : [];
    if (!storageIds.length) {
      Alert.alert('Proof required', 'Upload proof of payment in the customer app first.');
      return;
    }
    setProofOrderId(order._id);
    try {
      await submitPaymentProof({
        orderId: order._id,
        storageIds,
        names: order.paymentProofNames,
        mimeTypes: order.paymentProofTypes,
      });
    } catch (error: any) {
      Alert.alert('Proof update failed', error?.message ?? 'Could not record payment proof');
    } finally {
      setProofOrderId(null);
    }
  };

  const handleTel = async (phone?: string) => {
    const target = String(phone ?? '').trim();
    if (!target) {
      Alert.alert('No phone number', 'This order does not have a customer phone number yet.');
      return;
    }
    try {
      await Linking.openURL(`tel:${target}`);
    } catch {
      Alert.alert('Call unavailable', target);
    }
  };

  const handleText = async (phone?: string) => {
    const target = String(phone ?? '').trim();
    if (!target) {
      Alert.alert('No phone number', 'This order does not have a customer phone number yet.');
      return;
    }
    try {
      await Linking.openURL(`sms:${target}`);
    } catch {
      Alert.alert('SMS unavailable', target);
    }
  };

  const runOrderAction = async (order: any, action: () => Promise<void>) => {
    setBusyOrderId(order._id);
    try {
      await action();
    } catch (error: any) {
      Alert.alert('Action failed', error?.message ?? 'Could not update order');
    } finally {
      setBusyOrderId((current: string | null) => (current === order._id ? null : current));
    }
  };

  const renderOrder = (order: any) => {
    const status = String(order.status ?? 'submitted').toLowerCase();
    const completed = isCompleted(status);
    const canReceive = status === 'submitted';
    const canInvoice = status === 'received';
    const canAwaitProof = status === 'availability_confirmed';
    const canConfirmPayment = status === 'payment_proof_submitted';
    const canComplete = status === 'payment_confirmed';

    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.cardHeader} onPress={() => setExpandedOrderId((current: string | null) => (current === order._id ? null : order._id))} activeOpacity={0.85}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{order.itemTitle}</Text>
            <Text style={styles.subtitle}>{order.brand} • {formatMoney(order.totalAmount)}</Text>
          </View>
          <View style={[styles.statusChip, completed && styles.statusChipDone]}>
            <Text style={[styles.statusText, completed && styles.statusTextDone]}>{formatStatus(order.status)}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.workflowRow}>
          {ORDER_STAGES.map((stage, index) => {
            const done = index === 0 ? true : index === 1 ? ['received', 'availability_confirmed', 'payment_proof_submitted', 'payment_confirmed', 'completed', 'fulfilled'].includes(status) : index === 2 ? ['payment_proof_submitted', 'payment_confirmed', 'completed', 'fulfilled'].includes(status) : index === 3 ? ['payment_confirmed', 'completed', 'fulfilled'].includes(status) : completed;
            return (
              <View key={stage} style={[styles.stageChip, done && styles.stageChipDone]}>
                <Text style={[styles.stageText, done && styles.stageTextDone]}>{stage}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaChip}><Text style={styles.metaText}>Qty {order.quantity}</Text></View>
          <View style={styles.metaChip}><Text style={styles.metaText}>{order.fulfillmentType === 'delivery' ? 'Delivery' : 'Collection'}</Text></View>
          {order.invoiceNumber ? <View style={styles.metaChip}><Text style={styles.metaText}>Invoice {order.invoiceNumber}</Text></View> : null}
        </View>

        {expandedOrderId === order._id ? (
          <View style={styles.detailBlock}>
            <Text style={styles.label}>Customer</Text>
            <Text style={styles.value}>{order.customerName}</Text>
            <Text style={styles.value}>{order.customerPhone}</Text>

            <Text style={styles.label}>Merchandise</Text>
            <Text style={styles.value}>{order.itemDescription || order.itemTitle}</Text>
            <Text style={styles.value}>Total: {formatMoney(order.totalAmount)}</Text>

            {order.deliveryAddress ? (
              <>
                <Text style={styles.label}>Delivery address</Text>
                <Text style={styles.value}>{order.deliveryAddress}</Text>
              </>
            ) : null}

            <Text style={styles.label}>Banking details</Text>
            <Text style={styles.value}>{order.bankingDetails || 'Pending invoice'}</Text>

            {order.paymentProofSubmittedAt ? (
              <>
                <Text style={styles.label}>Proof of payment</Text>
                <Text style={styles.value}>Submitted {new Date(order.paymentProofSubmittedAt).toLocaleString()}</Text>
              </>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actionRow}>
          {canReceive ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void runOrderAction(order, () => receiveOrder({ orderId: order._id }))} disabled={busyOrderId === order._id}>
              <Text style={styles.primaryBtnText}>Receive order</Text>
            </TouchableOpacity>
          ) : null}
          {canInvoice ? (
            <View style={styles.actionPanel}>
              <Text style={styles.actionPanelTitle}>Quote / invoice</Text>
              <Text style={styles.actionPanelText}>Upload the invoice or quote document first, then send it with banking details.</Text>
              <View style={styles.actionButtonRow}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={pickQuoteFiles} disabled={busyOrderId === order._id}>
                  <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                  <Text style={styles.secondaryBtnText}>Upload document</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => void sendQuote(order)} disabled={busyOrderId === order._id || quoteOrderId === order._id || !quoteFiles.length}>
                  <Ionicons name="paper-plane-outline" size={16} color={colors.white} />
                  <Text style={styles.primaryBtnText}>{quoteOrderId === order._id ? 'Sending...' : 'Send quote + banking details'}</Text>
                </TouchableOpacity>
              </View>
              {quoteOrderId === order._id && quoteFiles.length ? <Text style={styles.actionPanelHint}>{quoteFiles.length} file(s) ready to send</Text> : null}
            </View>
          ) : null}
          {canAwaitProof ? (
            <View style={styles.actionPanel}>
              <Text style={styles.actionPanelTitle}>Proof of payment step</Text>
              <Text style={styles.actionPanelText}>Use this button to ask the customer to upload proof of payment before confirmation.</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => void openThread(order)} disabled={busyOrderId === order._id}>
                <Ionicons name="mail-unread-outline" size={16} color={colors.primary} />
                <Text style={styles.secondaryBtnText}>Request proof of payment</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {canConfirmPayment ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void runOrderAction(order, () => confirmPayment({ orderId: order._id }))} disabled={busyOrderId === order._id}>
              <Text style={styles.primaryBtnText}>Confirm payment</Text>
            </TouchableOpacity>
          ) : null}
          {canComplete ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void runOrderAction(order, () => completeOrder({ orderId: order._id }))} disabled={busyOrderId === order._id}>
              <Text style={styles.primaryBtnText}>Mark delivered / collected</Text>
            </TouchableOpacity>
          ) : null}
          {!completed ? (
            <TouchableOpacity style={styles.dangerBtn} onPress={() => void runOrderAction(order, () => markUnavailable({ orderId: order._id }))} disabled={busyOrderId === order._id}>
              <Text style={styles.dangerBtnText}>Unavailable</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => openThread(order)}>
            <Text style={styles.secondaryBtnText}>Open thread</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => void handleTel(order.customerPhone)}>
            <Text style={styles.secondaryBtnText}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => void handleText(order.customerPhone)}>
            <Text style={styles.secondaryBtnText}>Text</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (!isStaff) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Merchandise Receiving</Text>
          </View>
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Staff access only</Text>
            <Text style={styles.emptyText}>This screen is for receiving, quoting, and closing merchandise orders submitted by customers.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Merchandise Orders</Text>
            <Text style={styles.headerSub}>{pendingCount} open • {completedCount} completed</Text>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.brandRow}>
        {BRANDS.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.brandChip, brand === item && styles.brandChipActive]}
            onPress={() => setBrand(item)}
          >
            <Text style={[styles.brandChipText, brand === item && styles.brandChipTextActive]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {orders.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No merchandise orders</Text>
            <Text style={styles.emptyText}>Orders will appear here once customers submit them.</Text>
          </View>
        ) : (
          orders.map((order: any) => (
            <React.Fragment key={String(order?._id ?? Math.random())}>
              {renderOrder(order)}
            </React.Fragment>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  backBtn: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  headerSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  brandRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.background },
  brandChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface },
  brandChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  brandChipText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  brandChipTextActive: { color: colors.white },
  content: { padding: spacing.lg, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  title: { fontSize: 16, fontWeight: '900', color: colors.text },
  subtitle: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  statusChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.primary + '12' },
  statusChipDone: { backgroundColor: colors.success + '12' },
  statusText: { fontSize: 11, fontWeight: '900', color: colors.primary, textTransform: 'capitalize' },
  statusTextDone: { color: colors.success },
  workflowRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  stageChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  stageChipDone: { backgroundColor: colors.primary + '12', borderColor: colors.primary + '24' },
  stageText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  stageTextDone: { color: colors.primary },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  metaChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceAlt },
  metaText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  detailBlock: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  label: { marginTop: spacing.sm, fontSize: 11, fontWeight: '900', color: colors.textLight, textTransform: 'uppercase' },
  value: { marginTop: 4, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  primaryBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.primary },
  primaryBtnText: { fontSize: 12, fontWeight: '900', color: colors.white },
  secondaryBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  secondaryBtnText: { fontSize: 12, fontWeight: '800', color: colors.text },
  dangerBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.error + '10', borderWidth: 1, borderColor: colors.error + '20' },
  dangerBtnText: { fontSize: 12, fontWeight: '800', color: colors.error },
  actionPanel: { width: '100%', gap: 8, padding: spacing.md, borderRadius: 18, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  actionPanelTitle: { fontSize: 12, fontWeight: '900', color: colors.text, textTransform: 'uppercase' },
  actionPanelText: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  actionPanelHint: { fontSize: 11, fontWeight: '700', color: colors.textLight },
  actionButtonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emptyWrap: { padding: spacing.xl, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  emptyText: { marginTop: 6, fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
});