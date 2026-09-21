import React, { useMemo, useState, useEffect } from 'react';
declare const require: (path: string) => any;
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ImageBackground,
  ActivityIndicator,
  Platform,
  Modal,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

const ORDER_TYPES = [
  { value: 'parts', label: 'Parts' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'parts_accessory', label: 'Parts + Accessories' },
] as const;

const FULFILLMENT_TYPES = [
  { value: 'pickup', label: 'Collection' },
  { value: 'drop_off', label: 'Delivery' },
  { value: 'drone_delivery', label: 'Drone delivery' },
];

const CONTACT_METHODS = [
  { value: 'app_message', label: 'App message' },
  { value: 'phone_call', label: 'Phone call' },
  { value: 'both', label: 'Both' },
];

const ORDER_STAGES = [
  'Order received',
  'Quote + banking details',
  'Proof of payment uploaded',
  'Payment confirmed',
  'Delivery or collection completed',
] as const;

const REQUEST_STEPS = [
  'Order received',
  'Quote + banking details',
  'Proof of payment uploaded',
  'Payment confirmed',
  'Delivery or collection',
] as const;

const appBackgroundImage = require('../assets/WhatsApp Image 2026-05-06 at 10.25.35 AM.jpeg');

type SelectedImage = {
  uri: string;
  name: string;
  mimeType?: string;
  previewUrl?: string;
};

function formatOrderType(orderType: string) {
  if (orderType === 'parts_accessory') return 'Parts + Accessories';
  if (orderType === 'accessories' || orderType === 'accessory') return 'Accessories';
  return 'Parts';
}

function formatStatusLabel(status: string) {
  return String(status ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFulfillmentType(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.replace(/_/g, ' ') : 'Unknown';
}

function getWorkflowStepState(order: any, index: number) {
  if (index === 0) return ['submitted', 'received', 'availability_confirmed', 'payment_proof_submitted', 'payment_confirmed', 'scheduled_for_delivery', 'scheduled_for_collection', 'fulfilled', 'completed'].includes(order.status);
  if (index === 1) return ['availability_confirmed', 'payment_proof_submitted', 'payment_confirmed', 'scheduled_for_delivery', 'scheduled_for_collection', 'fulfilled', 'completed'].includes(order.status);
  if (index === 2) return ['payment_proof_submitted', 'payment_confirmed', 'scheduled_for_delivery', 'scheduled_for_collection', 'fulfilled', 'completed'].includes(order.status);
  if (index === 3) return ['payment_confirmed', 'scheduled_for_delivery', 'scheduled_for_collection', 'fulfilled', 'completed'].includes(order.status);
  return ['scheduled_for_delivery', 'scheduled_for_collection', 'fulfilled', 'completed'].includes(order.status) || Boolean(order.reviewId);
}

export default function PartsOrdersScreen({ navigation, route, mode = 'customer' }: any) {
  const me = useQuery(api.users.me);
  const isStaffView = mode === 'staff';
  const staffMenusQuery = useQuery(
    api.widgetVisibility.getVisibleStaffMenuKeys,
    me?._id ? { staffUserId: String(me._id) } : 'skip'
  );
  const visibleStaffMenus = staffMenusQuery ?? [];
  const isStaff = Boolean(
    me?.role === 'staff' ||
    me?.staffRole ||
    me?.accessLevel ||
    me?.department ||
    me?.isOwner ||
    String(me?.email ?? '').toLowerCase() === 'vincentmm@hyundai.co.za'
  );
  const isAdmin = Boolean(
    me?.isOwner ||
      String(me?.email ?? '').toLowerCase() === 'vincentmm@hyundai.co.za' ||
      me?.staffRole === 'dp' ||
      me?.accessLevel === 'full_access',
  );
  const hasPartsRole = Boolean(
    String(me?.staffRole ?? '').toLowerCase().includes('parts') ||
    String(me?.staffRole ?? '').toLowerCase().includes('accessor') ||
    String(me?.department ?? '').toLowerCase() === 'parts'
  );
  const partsEnabled = !isStaff || isAdmin || hasPartsRole || visibleStaffMenus.includes('parts_orders') || visibleStaffMenus.includes('accessory_orders');
  const customerOrders = useQuery(api.partsOrders.listMine) ?? [];
  const staffOrders = useQuery(api.partsOrders.listForStaff) ?? [];
  const orders = isStaffView ? staffOrders : customerOrders;

  const submitOrder = useMutation(api.partsOrders.submit);
  const receiveOrder = useMutation(api.partsOrders.receiveOrder);
  const completeOrder = useMutation(api.partsOrders.completeOrder);
  const updatePendingItems = useMutation(api.partsOrders.updatePendingItems);
  const sendMessage = useMutation(api.messages.send);
  const archiveDirectThread = useMutation(api.messages.archiveDirectThread);
  const unarchiveDirectThread = useMutation(api.messages.unarchiveDirectThread);
  const addToCart = useMutation(api.merchandise.addToCart);
  const generateUploadUrl = useMutation(api.merchandise.generateUploadUrl);
  const setQuote = useMutation(api.partsOrders.setQuote);
  const submitPaymentProof = useMutation(api.partsOrders.submitPaymentProof);
  const directThreadsData = useQuery(api.messages.listMyDirectThreads);
  const directThreads = useMemo(() => directThreadsData ?? [], [directThreadsData]);

  const [customerName, setCustomerName] = useState(me?.displayName ?? me?.name ?? '');
  const [customerPhone, setCustomerPhone] = useState(me?.phone ?? '');
  const [vehicleVin, setVehicleVin] = useState('');
  const [yearModel, setYearModel] = useState('');
  const [contactDetails, setContactDetails] = useState('');
  const [orderType, setOrderType] = useState('parts');
  const [itemDescription, setItemDescription] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState('pickup');
  const [dropOffAddress, setDropOffAddress] = useState('');
  const [contactPreference, setContactPreference] = useState('app_message');
  const [notes, setNotes] = useState('');
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [receiveCustomerMessage, setReceiveCustomerMessage] = useState('');
  const [pendingItemsDrafts, setPendingItemsDrafts] = useState<Record<string, string>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingReplyFor, setSendingReplyFor] = useState<string | null>(null);
  const [quoteFiles, setQuoteFiles] = useState<Record<string, Array<{ uri: string; name: string; mimeType: string }>>>({});
  const [sendingQuoteFor, setSendingQuoteFor] = useState<string | null>(null);
  const [proofFiles, setProofFiles] = useState<Record<string, Array<{ storageId: string; name: string; mimeType: string }>>>({});
  const [sendingProofFor, setSendingProofFor] = useState<string | null>(null);

  useEffect(() => {
    if (me) {
      setCustomerName((prev: string) => prev || me.displayName || me.name || '');
      setCustomerPhone((prev: string) => prev || me.phone || '');
    }
  }, [me]);

  useEffect(() => {
    const targetOrderId = String(route?.params?.partsOrderId ?? '');
    if (!targetOrderId) return;
    const match = orders.find((order: any) => String(order._id) === targetOrderId);
    if (match) {
      setSelectedOrder(match);
      setExpandedId(match._id);
    }
  }, [orders, route?.params?.partsOrderId]);

  const selectedOrderThread = useMemo(() => {
    if (!selectedOrder?.userId) return null;
    return directThreads.find((thread: any) => String(thread.counterpartId).split('|')[0] === String(selectedOrder.userId).split('|')[0]) ?? null;
  }, [directThreads, selectedOrder]);

  const pendingCount = useMemo(() => orders.filter((o: any) => o.status === 'submitted' || o.status === 'received').length, [orders]);

  const pickImages = async () => {
    if (Platform.OS !== 'web') {
      return;
    }
    try {
      const input = (globalThis as any).document?.createElement('input');
      if (!input) return;
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = async () => {
        const files = Array.from(input.files ?? []);
        if (!files.length) return;
        const loaded = await Promise.all(files.map((file: any, index: number) => new Promise<SelectedImage>((resolve, reject) => {
          const Reader = (globalThis as any).FileReader;
          const reader = new Reader();
          reader.onload = () => {
            resolve({
              uri: String(reader.result ?? ''),
              name: file.name ?? `image-${Date.now()}-${index}.jpg`,
              mimeType: file.type ?? 'image/jpeg',
              previewUrl: String(reader.result ?? ''),
            });
          };
          reader.onerror = () => reject(new Error('Failed to read image'));
          reader.readAsDataURL(file);
        })));
        setSelectedImages((prev: SelectedImage[]) => [...prev, ...loaded]);
      };
      input.click();
    } catch (error) {
    }
  };

  const addImageFromUrl = () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    setSelectedImages((prev: SelectedImage[]) => [
      ...prev,
      {
        uri: url,
        name: `image-${Date.now()}`,
        previewUrl: url,
      },
    ]);
    setImageUrlInput('');
  };

  const handleSubmit = async () => {
    if (!customerName.trim() || !customerPhone.trim() || !vehicleVin.trim() || !yearModel.trim() || !contactDetails.trim() || !itemDescription.trim()) {
      return;
    }
    if (fulfillmentType === 'drop_off' && !dropOffAddress.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      await submitOrder({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        vehicleVin: vehicleVin.trim(),
        yearModel: yearModel.trim(),
        contactDetails: contactDetails.trim(),
        orderType,
        itemDescription: itemDescription.trim(),
        referencePhotos: selectedImages.length > 0 ? selectedImages.map((img: SelectedImage) => img.uri) : undefined,
        fulfillmentType,
        dropOffAddress: fulfillmentType === 'drop_off' ? dropOffAddress.trim() : undefined,
        contactPreference,
        notes: notes.trim() || undefined,
      });
      setVehicleVin('');
      setYearModel('');
      setContactDetails('');
      setItemDescription('');
      setDropOffAddress('');
      setNotes('');
      setSelectedImages([]);
    } catch (error) {
    }
    setSubmitting(false);
  };

  const saveToCart = async () => {
    if (!customerName.trim() || !customerPhone.trim() || !vehicleVin.trim() || !itemDescription.trim()) {
      Alert.alert('Missing details', 'Please fill in your name, phone, VIN, and request details first.');
      return;
    }
    try {
      await addToCart({
        cartType: 'parts',
        title: `${orderType} request`,
        unitPrice: 0,
        quantity: 1,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        vehicleVin: vehicleVin.trim(),
        yearModel: yearModel.trim(),
        contactDetails: contactDetails.trim(),
        orderType,
        itemDescription: itemDescription.trim(),
        referencePhotos: selectedImages.length > 0 ? selectedImages.map((img: SelectedImage) => img.uri) : undefined,
        fulfillmentType,
        dropOffAddress: fulfillmentType === 'drop_off' ? dropOffAddress.trim() : undefined,
        contactPreference,
        notes: notes.trim() || undefined,
        imageUrls: selectedImages.map((img: SelectedImage) => img.previewUrl ?? img.uri),
      });
      Alert.alert('Saved', 'Your request has been saved to the parts cart.');
    } catch (error: any) {
      Alert.alert('Cart failed', error?.message ?? 'Could not save request to cart');
    }
  };

  const handleStaffAction = async (order: any, customerMessage?: string) => {
    try {
      await receiveOrder({ orderId: order._id, customerMessage: customerMessage?.trim() || undefined });
      setReceiveCustomerMessage('');
    } catch (error) {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const handleSavePendingItems = async (order: any) => {
    const pendingItems = String(pendingItemsDrafts[String(order._id)] ?? '').trim();
    if (!pendingItems) {
      Alert.alert('Pending items required', 'Please type the items that are still pending.');
      return;
    }

    try {
      await updatePendingItems({
        orderId: order._id,
        pendingItems,
      });
      setPendingItemsDrafts((prev: Record<string, string>) => ({ ...prev, [String(order._id)]: '' }));
    } catch (error: any) {
      Alert.alert('Pending items failed', error?.message ?? 'Could not save pending items.');
    }
  };

  const pickQuoteFiles = async (orderId: string) => {
    try {
      const DocumentPicker: any = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
      if (result.canceled || !result.assets?.length) return;
      setQuoteFiles((prev: Record<string, Array<{ uri: string; name: string; mimeType: string }>>) => ({
        ...prev,
        [orderId]: result.assets.map((asset: any) => ({
          uri: asset.uri,
          name: asset.name ?? 'Quote document',
          mimeType: asset.mimeType ?? 'application/octet-stream',
        })),
      }));
    } catch (error: any) {
      Alert.alert('Upload failed', error?.message ?? 'Could not attach quote document');
    }
  };

  const sendQuote = async (order: any) => {
    const files = quoteFiles[String(order._id)] ?? [];
    if (!files.length) {
      Alert.alert('Quote required', 'Please upload the quote or invoice before sending it.');
      return;
    }

    try {
      setSendingQuoteFor(String(order._id));
      const uploadIds: string[] = [];
      for (const file of files) {
        const uploadUrl = await generateUploadUrl({});
        const blob = await globalThis.fetch(file.uri).then((res) => res.blob());
        const response = await globalThis.fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.mimeType }, body: blob });
        const body = await response.text();
        let storageId = '';
        try { storageId = JSON.parse(body).storageId || JSON.parse(body).id || ''; } catch { storageId = body.trim(); }
        if (!storageId) throw new Error('Failed to upload quote file');
        uploadIds.push(storageId);
      }

      await setQuote({
        orderId: order._id,
        partCost: Number(order.partCost ?? 0),
        deliveryFee: Number(order.deliveryFee ?? 0),
        bankingDetails: order.bankingDetails,
        customerMessage: replyDrafts[String(order._id)]?.trim() || undefined,
        quoteAttachmentStorageIds: uploadIds as any,
        quoteAttachmentNames: files.map((file: { name: string }) => file.name),
      });
      setQuoteFiles((prev: Record<string, Array<{ uri: string; name: string; mimeType: string }>>) => ({ ...prev, [String(order._id)]: [] }));
      setReplyDrafts((prev: Record<string, string>) => ({ ...prev, [String(order._id)]: '' }));
    } catch (error: any) {
      Alert.alert('Quote send failed', error?.message ?? 'Could not send the quote');
    } finally {
      setSendingQuoteFor(null);
    }
  };

  const pickProofFiles = async (orderId: string) => {
    try {
      const DocumentPicker: any = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
      if (result.canceled || !result.assets?.length) return;
      const uploaded: Array<{ storageId: string; name: string; mimeType: string }> = [];
      for (const asset of result.assets as any[]) {
        const mimeType = asset.mimeType ?? 'application/octet-stream';
        const uploadUrl = await generateUploadUrl({});
        const blob = await globalThis.fetch(asset.uri).then((res) => res.blob());
        const response = await globalThis.fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': mimeType }, body: blob });
        const body = await response.text();
        let storageId = '';
        try { storageId = JSON.parse(body).storageId || JSON.parse(body).id || ''; } catch { storageId = body.trim(); }
        if (!storageId) throw new Error('Failed to upload proof file');
        uploaded.push({ storageId, name: asset.name ?? 'Proof of payment', mimeType });
      }
      setProofFiles((prev: Record<string, Array<{ storageId: string; name: string; mimeType: string }>>) => ({ ...prev, [orderId]: uploaded }));
    } catch (error: any) {
      Alert.alert('Upload failed', error?.message ?? 'Could not attach proof of payment');
    }
  };

  const sendProof = async (order: any) => {
    const files = proofFiles[String(order._id)] ?? [];
    if (!files.length) {
      Alert.alert('Proof required', 'Please upload proof of payment before sending it.');
      return;
    }

    setSendingProofFor(String(order._id));
    try {
      await submitPaymentProof({
        orderId: order._id,
        storageIds: files.map((file: { storageId: string }) => file.storageId as any),
        names: files.map((file: { name: string }) => file.name),
        mimeTypes: files.map((file: { mimeType: string }) => file.mimeType),
      });
      setProofFiles((prev: Record<string, Array<{ storageId: string; name: string; mimeType: string }>>) => ({ ...prev, [String(order._id)]: [] }));
    } catch (error: any) {
      Alert.alert('Proof send failed', error?.message ?? 'Could not send the proof of payment');
    } finally {
      setSendingProofFor(null);
    }
  };

  const handleCompleteOrder = async (order: any) => {
    const finalNote = String(replyDrafts[String(order._id)] ?? receiveCustomerMessage ?? '').trim();
    try {
      await completeOrder({
        orderId: order._id,
        customerMessage: finalNote || undefined,
      });
      setReplyDrafts((prev: Record<string, string>) => ({ ...prev, [String(order._id)]: '' }));
      setReceiveCustomerMessage('');
      setExpandedId((prev: string | null) => (String(prev) === String(order._id) ? null : prev));
      if (selectedOrder && String(selectedOrder._id) === String(order._id)) {
        setSelectedOrder(null);
      }
    } catch (error: any) {
      Alert.alert('Complete failed', error?.message ?? 'Could not mark this order complete.');
    }
  };

  const sendOrderReply = async (order: any) => {
    const message = String(replyDrafts[String(order._id)] ?? '').trim();
    if (!message) {
      Alert.alert('Message required', 'Please type a reply before sending.');
      return;
    }

    const recipientId = String(order.userId ?? order.customerId ?? '');
    if (!recipientId) {
      Alert.alert('Missing customer', 'This order does not have a linked customer to text.');
      return;
    }

    try {
      setSendingReplyFor(String(order._id));
      await sendMessage({
        partsOrderId: order._id,
        recipientId,
        content: message,
      });
      setReplyDrafts((prev: Record<string, string>) => ({ ...prev, [String(order._id)]: '' }));
    } catch (error: any) {
      Alert.alert('Send failed', error?.message ?? 'Could not send the text message.');
    } finally {
      setSendingReplyFor(null);
    }
  };

  const openOrderThread = (order: any) => {
    if (!order?.customerId && !order?.userId) {
      Alert.alert('Thread unavailable', 'No customer account is linked to this enquiry yet.');
      return;
    }
    const customerId = String(order.customerId ?? order.userId);
    navigation.navigate('StaffChat', {
      customerId,
      recipientId: customerId,
      customerName: order.customerName,
      recipientName: order.customerName,
      chatType: 'parts_order',
      partsOrderId: order.partsOrderId ?? order._id,
      partsOrderTitle: order.itemDescription,
    });
  };

  const openOrderPhone = async (phone?: string) => {
    if (!phone) {
      Alert.alert('No phone number available');
      return;
    }
    await Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const openOrderSms = async (phone?: string) => {
    if (!phone) {
      Alert.alert('No phone number available');
      return;
    }
    await Linking.openURL(`sms:${phone}`).catch(() => {});
  };

  const toggleOrderArchive = async (order: any) => {
    if (!order?.customerId && !order?.userId) return;
    try {
      if (selectedOrderThread?.isArchived) {
        await unarchiveDirectThread({ customerId: String(order.customerId ?? order.userId) });
      } else {
        await archiveDirectThread({ customerId: String(order.customerId ?? order.userId) });
      }
    } catch (error: any) {
      Alert.alert('Archive failed', error?.message ?? 'Could not update this thread');
    }
  };

  const renderOrder = (order: any) => {
    const isOpen = expandedId === order._id;
    const status = String(order.status ?? 'submitted').toLowerCase();
    const statusLabel = formatStatusLabel(order.status);
    const totalAmount = Number(order.totalAmount ?? 0);
    return (
      <View key={order._id} style={styles.orderCard}>
        <View style={styles.orderTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderTitle}>{order.customerName}</Text>
            <Text style={styles.orderMeta}>{order.itemDescription}</Text>
            <Text style={styles.orderMeta}>VIN {order.vehicleVin}</Text>
          </View>
          <View style={styles.orderHeaderActions}>
            <View style={styles.orderPill}><Text style={styles.orderPillText}>{statusLabel}</Text></View>
            <TouchableOpacity
              style={styles.orderExpandBtn}
              onPress={() => setExpandedId(isOpen ? null : order._id)}
              accessibilityRole="button"
              accessibilityLabel={isOpen ? 'Collapse order details' : 'Expand order details'}
            >
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Order total</Text>
            <Text style={styles.summaryValue}>{totalAmount > 0 ? `R${totalAmount.toFixed(2)}` : 'Quote pending'}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Fulfillment</Text>
            <Text style={styles.summaryValue}>{formatFulfillmentType(order.fulfillmentType)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Review</Text>
            <Text style={styles.summaryValue}>{order.reviewId ? 'Submitted' : order.reviewRequired ? 'Required' : 'Pending'}</Text>
          </View>
        </View>

        {isOpen && (
          <View style={styles.expandedCard}>
            <View style={styles.sectionBlock}>
              <Text style={styles.expandedLabel}>Order details</Text>
              <Text style={styles.expandedValue}>{order.customerPhone}</Text>
              <Text style={styles.expandedValue}>{order.contactDetails}</Text>
              <Text style={styles.expandedValue}>Year / model: {order.yearModel || 'Not supplied'}</Text>
              <Text style={styles.expandedValue}>Status: {statusLabel}</Text>
              <Text style={styles.expandedValue}>Request: {order.orderType}</Text>
              <Text style={styles.expandedValue}>Fulfillment: {formatFulfillmentType(order.fulfillmentType)}</Text>
            </View>

            {(isStaff || isAdmin) && (
              <View style={styles.staffActionsBlock}>
                <Text style={styles.expandedLabel}>Received order</Text>
                <TextInput style={[styles.input, styles.multilineInput]} value={receiveCustomerMessage} onChangeText={setReceiveCustomerMessage} placeholder="Short note when you acknowledge the order" placeholderTextColor={colors.textLight} multiline />
                <View style={styles.staffActionRow}>
                  <TouchableOpacity style={styles.staffActionBtn} onPress={() => void handleStaffAction(order, receiveCustomerMessage)}>
                    <Text style={styles.staffActionText}>Receive order</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {(isStaff || isAdmin) && (
              <View style={styles.paymentBlock}>
                <Text style={styles.expandedLabel}>Quote / invoice</Text>
                <Text style={styles.expandedValue}>Upload the quote or invoice document first, then send it with banking details.</Text>
                <TextInput style={[styles.input, styles.multilineInput, { marginTop: spacing.sm }]} value={replyDrafts[String(order._id)] ?? ''} onChangeText={(text: string) => setReplyDrafts((prev: Record<string, string>) => ({ ...prev, [String(order._id)]: text }))} placeholder="Type your quote note" placeholderTextColor={colors.textLight} multiline />
                <View style={styles.staffActionRow}>
                  <TouchableOpacity style={styles.staffActionBtn} onPress={() => void pickQuoteFiles(String(order._id))}>
                    <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                    <Text style={styles.staffActionText}>Upload quote / invoice</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.scheduleBtn}
                    onPress={() => void sendQuote(order)}
                    disabled={sendingReplyFor === String(order._id) || sendingQuoteFor === String(order._id)}
                  >
                    <Ionicons name="paper-plane-outline" size={16} color={colors.white} />
                    <Text style={styles.scheduleBtnText}>{sendingQuoteFor === String(order._id) ? 'Sending...' : 'Send quote + banking details'}</Text>
                  </TouchableOpacity>
                </View>
                {quoteFiles[String(order._id)]?.length ? (
                  <Text style={styles.expandedValue}>{quoteFiles[String(order._id)].length} file(s) ready to send</Text>
                ) : null}
              </View>
            )}

            {(isStaff || isAdmin) && (
              <View style={styles.staffActionsBlock}>
                <Text style={styles.expandedLabel}>Pending items</Text>
                <Text style={styles.expandedValue}>Save what is still outstanding so the customer reply stays separate from the parts list.</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput, { marginTop: spacing.sm }]}
                  value={pendingItemsDrafts[String(order._id)] ?? order.pendingItems ?? ''}
                  onChangeText={(text: string) => setPendingItemsDrafts((prev: Record<string, string>) => ({ ...prev, [String(order._id)]: text }))}
                  placeholder="e.g. Awaiting left mirror cover, trim clips, and delivery confirmation"
                  placeholderTextColor={colors.textLight}
                  multiline
                />
                <View style={styles.staffActionRow}>
                  <TouchableOpacity style={styles.staffActionBtn} onPress={() => void handleSavePendingItems(order)}>
                    <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                    <Text style={styles.staffActionText}>Save pending items</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {order.pendingItems ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.expandedLabel}>Outstanding items</Text>
                <Text style={styles.expandedValue}>{order.pendingItems}</Text>
              </View>
            ) : null}

            {(isStaff || isAdmin) && (
              <View style={styles.staffActionsBlock}>
                <Text style={styles.expandedLabel}>Close off order</Text>
                <Text style={styles.expandedValue}>Use this once the order is resolved and there is nothing else pending.</Text>
                <View style={styles.staffActionRow}>
                  <TouchableOpacity
                    style={styles.staffActionBtn}
                    onPress={() => void handleCompleteOrder(order)}
                  >
                    <Ionicons name="checkmark-done-outline" size={16} color={colors.primary} />
                    <Text style={styles.staffActionText}>Mark complete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!isStaff && ['availability_confirmed', 'payment_proof_submitted'].includes(status) ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.expandedLabel}>Proof of payment</Text>
                <Text style={styles.expandedValue}>Upload your proof document first, then send it to staff.</Text>
                <View style={styles.staffActionRow}>
                  <TouchableOpacity style={styles.staffActionBtn} onPress={() => void pickProofFiles(String(order._id))}>
                    <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                    <Text style={styles.staffActionText}>Upload proof</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.scheduleBtn}
                    onPress={() => void sendProof(order)}
                    disabled={sendingProofFor === String(order._id)}
                  >
                    <Ionicons name="paper-plane-outline" size={16} color={colors.white} />
                    <Text style={styles.scheduleBtnText}>{sendingProofFor === String(order._id) ? 'Sending...' : 'Send proof of payment'}</Text>
                  </TouchableOpacity>
                </View>
                {proofFiles[String(order._id)]?.length ? (
                  <Text style={styles.expandedValue}>{proofFiles[String(order._id)].length} proof file(s) ready</Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.orderActionRow}>
              <TouchableOpacity style={styles.orderActionBtn} onPress={() => openOrderThread(order)}>
                <Ionicons name="chatbubbles-outline" size={16} color={colors.primary} />
                <Text style={styles.orderActionText}>Open thread</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.orderActionBtn} onPress={() => void openOrderPhone(selectedOrder?.customerPhone ?? order.customerPhone)}>
                <Ionicons name="call-outline" size={16} color={colors.primary} />
                <Text style={styles.orderActionText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.orderActionBtn} onPress={() => void openOrderSms(selectedOrder?.customerPhone ?? order.customerPhone)}>
                <Ionicons name="chatbubble-outline" size={16} color={colors.primary} />
                <Text style={styles.orderActionText}>Text</Text>
              </TouchableOpacity>
              {isStaffView && (
                <TouchableOpacity style={styles.orderActionBtn} onPress={() => void handleCompleteOrder(order)}>
                  <Ionicons name="checkmark-done-outline" size={16} color={colors.primary} />
                  <Text style={styles.orderActionText}>Close off</Text>
                </TouchableOpacity>
              )}
              {isStaffView && (
                <TouchableOpacity style={styles.orderActionBtn} onPress={() => void toggleOrderArchive(selectedOrder)}>
                  <Ionicons name={selectedOrderThread?.isArchived ? 'refresh-outline' : 'archive-outline'} size={16} color={colors.primary} />
                  <Text style={styles.orderActionText}>{selectedOrderThread?.isArchived ? 'Restore' : 'Archive'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <ImageBackground source={appBackgroundImage} style={styles.wallpaper} resizeMode="cover">
      <View style={styles.wallpaperOverlay}>
        <View style={styles.container}>
          <SafeAreaView edges={['top']} style={styles.safe}>
            <View style={styles.hero}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={22} color={colors.white} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>Parts & accessories</Text>
                <Text style={styles.heroSub}>{isStaffView ? 'Receive, confirm, and schedule deliveries.' : 'Insert your VIN, request the exact part, and attach a sample for staff to review.'}</Text>
              </View>
              <View style={styles.heroBadge}><Text style={styles.heroBadgeValue}>{pendingCount}</Text><Text style={styles.heroBadgeLabel}>Open</Text></View>
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {isStaffView && !partsEnabled ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="lock-closed-outline" size={48} color={colors.textLight} />
                  <Text style={styles.emptyText}>Parts and accessory orders are turned off for your account.</Text>
                </View>
              ) : null}
              {!isStaffView && (
                <View style={styles.formCard}>
                  <Text style={styles.sectionTitle}>New order</Text>
                  <View style={styles.requestStageRow}>
                    {ORDER_STAGES.map((step, index) => (
                      <View key={step} style={[styles.requestStageChip, getWorkflowStepState({ status: 'submitted' }, index) && styles.requestStageChipActive]}>
                        <Text style={[styles.requestStageText, getWorkflowStepState({ status: 'submitted' }, index) && styles.requestStageTextActive]}>{step}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.workflowNote}>The order moves through a simple sequence: received, quote with banking details, proof of payment, payment confirmation, then delivery or collection completed.</Text>
                  <Text style={styles.fieldLabel}>Your name</Text>
                  <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="Full name" placeholderTextColor={colors.textLight} />
                  <Text style={styles.fieldLabel}>Contact number</Text>
                  <TextInput style={styles.input} value={customerPhone} onChangeText={setCustomerPhone} placeholder="Phone number" placeholderTextColor={colors.textLight} keyboardType="phone-pad" />
                  <Text style={styles.fieldLabel}>Vehicle VIN *</Text>
                  <TextInput style={styles.input} value={vehicleVin} onChangeText={setVehicleVin} placeholder="VIN required" placeholderTextColor={colors.textLight} autoCapitalize="characters" />
                  <Text style={styles.fieldLabel}>Year / model *</Text>
                  <TextInput style={styles.input} value={yearModel} onChangeText={setYearModel} placeholder="e.g. 2022 Tucson" placeholderTextColor={colors.textLight} />
                  <Text style={styles.fieldLabel}>Contact details *</Text>
                  <TextInput style={styles.input} value={contactDetails} onChangeText={setContactDetails} placeholder="WhatsApp, email, or alternate contact" placeholderTextColor={colors.textLight} />
                  <Text style={styles.fieldLabel}>Request type</Text>
                  <View style={styles.choiceRow}>
                    {ORDER_TYPES.map((type) => (
                      <TouchableOpacity key={type.value} style={[styles.choiceChip, orderType === type.value && styles.choiceChipActive]} onPress={() => setOrderType(type.value)}>
                        <Text style={[styles.choiceText, orderType === type.value && styles.choiceTextActive]}>{type.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.fieldLabel}>Desired part / accessory *</Text>
                  <TextInput style={[styles.input, styles.multilineInput]} value={itemDescription} onChangeText={setItemDescription} placeholder="Describe the exact part or accessory needed" placeholderTextColor={colors.textLight} multiline />
                  <Text style={styles.fieldLabel}>Fulfillment</Text>
                  <View style={styles.choiceRow}>
                    {FULFILLMENT_TYPES.map((type) => (
                      <TouchableOpacity key={type.value} style={[styles.choiceChip, fulfillmentType === type.value && styles.choiceChipActive]} onPress={() => setFulfillmentType(type.value)}>
                        <Text style={[styles.choiceText, fulfillmentType === type.value && styles.choiceTextActive]}>{type.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.fieldLabel}>Preferred contact method</Text>
                  <View style={styles.choiceRow}>
                    {CONTACT_METHODS.map((type) => (
                      <TouchableOpacity key={type.value} style={[styles.choiceChip, contactPreference === type.value && styles.choiceChipActive]} onPress={() => setContactPreference(type.value)}>
                        <Text style={[styles.choiceText, contactPreference === type.value && styles.choiceTextActive]}>{type.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {(fulfillmentType === 'drop_off' || fulfillmentType === 'drone_delivery') && (
                    <>
                      <Text style={styles.fieldLabel}>Delivery address *</Text>
                      <TextInput style={styles.input} value={dropOffAddress} onChangeText={setDropOffAddress} placeholder="Address if delivery or drone delivery is selected" placeholderTextColor={colors.textLight} />
                    </>
                  )}
                  <Text style={styles.fieldLabel}>Sample images</Text>
                  <View style={styles.attachChooserRow}>
                    {Platform.OS === 'web' ? (
                      <TouchableOpacity style={styles.attachBtn} onPress={pickImages}>
                        <Ionicons name="images-outline" size={18} color={colors.primary} />
                        <Text style={styles.attachBtnText}>Add sample images</Text>
                      </TouchableOpacity>
                    ) : null}
                    <View style={styles.urlAttachWrap}>
                      <TextInput
                        style={styles.urlInput}
                        value={imageUrlInput}
                        onChangeText={setImageUrlInput}
                        placeholder={Platform.OS === 'web' ? 'Or paste image URL' : 'Paste image URL from gallery/share'}
                        placeholderTextColor={colors.textLight}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity style={styles.urlAddBtn} onPress={addImageFromUrl}>
                        <Text style={styles.urlAddBtnText}>Add</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.attachHint}>Add sample photos or image links so staff can see the exact part or accessory needed.</Text>
                  {selectedImages.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }} contentContainerStyle={{ gap: spacing.sm }}>
                      {selectedImages.map((img: SelectedImage, idx: number) => (
                        <View key={`${img.uri}-${idx}`} style={styles.previewWrap}>
                          <Image source={{ uri: img.previewUrl ?? img.uri }} style={styles.previewImg} />
                          <TouchableOpacity style={styles.previewRemove} onPress={() => setSelectedImages((prev: SelectedImage[]) => prev.filter((_: SelectedImage, i: number) => i !== idx))}>
                            <Ionicons name="close" size={12} color={colors.white} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <TextInput style={[styles.input, styles.multilineInput]} value={notes} onChangeText={setNotes} placeholder="Any extra information" placeholderTextColor={colors.textLight} multiline />
                  <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.7 }]} onPress={handleSubmit} disabled={submitting}>
                    {submitting ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="paper-plane" size={18} color={colors.white} /><Text style={styles.submitBtnText}>Submit request</Text></>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.scheduleBtnSecondary, { marginTop: spacing.sm }]} onPress={() => void saveToCart()}>
                    <Text style={styles.scheduleBtnSecondaryText}>Save to parts cart</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.listHeader}>
                <Text style={styles.sectionTitle}>{isStaffView ? 'Incoming orders' : 'My orders'}</Text>
                <View style={styles.countChip}><Text style={styles.countChipText}>{orders.length}</Text></View>
              </View>
              {orders.length === 0 ? (
                <View style={styles.emptyCard}><Text style={styles.emptyText}>No orders yet.</Text></View>
              ) : (
                orders.map(renderOrder)
              )}
            </ScrollView>
          </SafeAreaView>

          <Modal
            visible={Boolean(selectedOrder)}
            animationType="slide"
            transparent
            onRequestClose={() => setSelectedOrder(null)}
          >
            <View style={styles.detailOverlay}>
              <View style={styles.detailCardModal}>
                <View style={styles.detailModalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailModalEyebrow}>Full order history</Text>
                    <Text style={styles.detailModalTitle}>{selectedOrder?.customerName}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedOrder(null)} style={styles.detailModalClose}>
                    <Ionicons name="close" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {selectedOrder && (
                  <>
                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                      <View style={styles.modalMetaRow}>
                        <View style={styles.modalMetaChip}><Text style={styles.modalMetaText}>{formatStatusLabel(selectedOrder.status)}</Text></View>
                        <View style={styles.modalMetaChip}><Text style={styles.modalMetaText}>{formatOrderType(selectedOrder.orderType)}</Text></View>
                        <View style={styles.modalMetaChip}><Text style={styles.modalMetaText}>{formatFulfillmentType(selectedOrder.fulfillmentType)}</Text></View>
                      </View>
                      <Text style={styles.detailModalLabel}>Customer phone</Text>
                      <Text style={styles.detailModalValue}>{selectedOrder.customerPhone}</Text>
                      <Text style={styles.detailModalLabel}>Vehicle VIN</Text>
                      <Text style={styles.detailModalValue}>{selectedOrder.vehicleVin}</Text>
                      <Text style={styles.detailModalLabel}>Contact details</Text>
                      <Text style={styles.detailModalValue}>{selectedOrder.contactDetails}</Text>
                      {selectedOrder.dropOffAddress ? (
                        <>
                          <Text style={styles.detailModalLabel}>Drop off address</Text>
                          <Text style={styles.detailModalValue}>{selectedOrder.dropOffAddress}</Text>
                        </>
                      ) : null}
                      {selectedOrder.notes ? (
                        <>
                          <Text style={styles.detailModalLabel}>Notes</Text>
                          <Text style={styles.detailModalValue}>{selectedOrder.notes}</Text>
                        </>
                      ) : null}
                      <Text style={styles.detailModalLabel}>Created</Text>
                      <Text style={styles.detailModalValue}>{new Date(selectedOrder.createdAt).toLocaleString()}</Text>
                      {selectedOrder.bankingDetailsSentAt ? (
                        <>
                          <Text style={styles.detailModalLabel}>Banking details sent</Text>
                          <Text style={styles.detailModalValue}>{new Date(selectedOrder.bankingDetailsSentAt).toLocaleString()}</Text>
                        </>
                      ) : null}
                      {selectedOrder.paymentConfirmedAt ? (
                        <>
                          <Text style={styles.detailModalLabel}>Payment confirmed</Text>
                          <Text style={styles.detailModalValue}>{new Date(selectedOrder.paymentConfirmedAt).toLocaleString()}</Text>
                        </>
                      ) : null}
                      {selectedOrder.updatedAt ? (
                        <>
                          <Text style={styles.detailModalLabel}>Last updated</Text>
                          <Text style={styles.detailModalValue}>{new Date(selectedOrder.updatedAt).toLocaleString()}</Text>
                        </>
                      ) : null}
                      {selectedOrder.completedAt ? (
                        <>
                          <Text style={styles.detailModalLabel}>Completed</Text>
                          <Text style={styles.detailModalValue}>{new Date(selectedOrder.completedAt).toLocaleString()}</Text>
                        </>
                      ) : null}
                    </ScrollView>
                    <View style={styles.orderActionRow}>
                      <TouchableOpacity style={styles.orderActionBtn} onPress={() => openOrderThread(selectedOrder)}>
                        <Ionicons name="chatbubbles-outline" size={16} color={colors.primary} />
                        <Text style={styles.orderActionText}>Open thread</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.orderActionBtn} onPress={() => void openOrderPhone(selectedOrder?.customerPhone)}>
                        <Ionicons name="call-outline" size={16} color={colors.primary} />
                        <Text style={styles.orderActionText}>Call</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.orderActionBtn} onPress={() => void openOrderSms(selectedOrder?.customerPhone)}>
                        <Ionicons name="chatbubble-outline" size={16} color={colors.primary} />
                        <Text style={styles.orderActionText}>Text</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.orderActionBtn} onPress={() => void toggleOrderArchive(selectedOrder)}>
                        <Ionicons name={selectedOrderThread?.isArchived ? 'refresh-outline' : 'archive-outline'} size={16} color={colors.primary} />
                        <Text style={styles.orderActionText}>{selectedOrderThread?.isArchived ? 'Restore' : 'Archive'}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </View>
          </Modal>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  wallpaper: { flex: 1 },
  wallpaperOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3, 8, 20, 0.22)' },
  safe: { flex: 1, backgroundColor: colors.primary },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: colors.white },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4, lineHeight: 17 },
  heroBadge: {
    minWidth: 68,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroBadgeValue: { color: colors.white, fontSize: 20, fontWeight: '800' },
  heroBadgeLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700' },
  content: { padding: spacing.lg, paddingBottom: 120 },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.md, marginBottom: 6 },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  multilineInput: { minHeight: 92, textAlignVertical: 'top' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choiceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  choiceChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { fontSize: 12, fontWeight: '700', color: colors.text },
  choiceTextActive: { color: colors.white },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '20',
    borderRadius: radius.lg,
    paddingVertical: 12,
  },
  attachBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  attachChooserRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  attachHint: { fontSize: 11, color: colors.textLight, marginTop: 8, lineHeight: 16 },
  previewWrap: { width: 78, height: 78, borderRadius: 18, overflow: 'hidden' },
  previewImg: { width: '100%', height: '100%' },
  previewRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  countChip: { backgroundColor: colors.primary + '12', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  countChipText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  orderTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  orderHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderExpandBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary + '10', alignItems: 'center', justifyContent: 'center' },
  orderTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  orderMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  orderPill: { backgroundColor: colors.primary + '10', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  orderPillText: { fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'capitalize' },
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md, flexWrap: 'wrap' },
  summaryCard: { flex: 1, minWidth: 96, backgroundColor: colors.background, borderRadius: 18, borderWidth: 1, borderColor: colors.borderLight, paddingHorizontal: 12, paddingVertical: 10 },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase' },
  summaryValue: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 4 },
  sectionBlock: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: 18, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  requestStageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
  requestStageChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  requestStageChipActive: { backgroundColor: colors.primary + '10', borderColor: colors.primary + '20' },
  requestStageText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  requestStageTextActive: { color: colors.primary },
  workflowNote: { fontSize: 12, color: colors.textSecondary, marginTop: 12, lineHeight: 17 },
  fulfillmentPrompt: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.primary + '08', borderWidth: 1, borderColor: colors.primary + '18' },
  fulfillmentPromptTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  fulfillmentPromptSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2, marginBottom: 10 },
  paymentBlock: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight },
  expandedCard: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  expandedLabel: { fontSize: 11, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase', marginTop: spacing.sm },
  expandedValue: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 19 },
  staffActionsBlock: { marginTop: spacing.lg, gap: spacing.md },
  staffActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  staffActionBtn: { backgroundColor: colors.primary + '10', paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary + '20' },
  staffActionText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  staffActionBtnDanger: { backgroundColor: colors.error + '10', paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, borderWidth: 1, borderColor: colors.error + '20' },
  staffActionTextDanger: { color: colors.error, fontSize: 12, fontWeight: '800' },
  scheduleCard: { backgroundColor: colors.background, borderRadius: 22, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  scheduleTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  scheduleInputsRow: { gap: spacing.sm },
  smallInput: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 13, marginBottom: 8 },
  scheduleBtn: { marginTop: 4, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  scheduleBtnText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  scheduleBtnSecondary: { marginTop: 8, borderRadius: radius.lg, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight },
  scheduleBtnSecondaryText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, alignItems: 'center' },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
  urlInput: { backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.borderLight, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 13, marginBottom: 8 },
  urlAddBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  urlAddBtnText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  fullThreadBtn: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '20' },
  fullThreadBtnText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  detailCardModal: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '85%', borderTopWidth: 1, borderColor: colors.borderLight },
  detailModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.md },
  detailModalEyebrow: { fontSize: 11, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase' },
  detailModalTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  detailModalClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  modalMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  modalMetaChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight },
  modalMetaText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, textTransform: 'capitalize' },
  detailModalLabel: { fontSize: 11, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase', marginTop: spacing.sm },
  detailModalValue: { fontSize: 14, color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
  orderActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  orderActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '20' },
  orderActionText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  photoThumb: { width: 84, height: 84, borderRadius: 18, backgroundColor: colors.background },
  assignRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  assignAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center' },
  assignName: { fontSize: 14, fontWeight: '700', color: colors.text },
  assignRole: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  assignDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
});