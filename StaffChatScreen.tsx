import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, radius, spacing } from '../lib/theme';
import { getGroupedMessageMenuItems, getMessageCategoryRoute } from '../lib/messageCategories';

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function timeLabel(ts: number): string {
  return new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
}

function dateLabel(ts: number): string {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';

  return new Intl.DateTimeFormat('en-ZA', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function statusLabel(status: unknown): string {
  const value = normalize(status);
  return value ? value.replace(/_/g, ' ') : 'Unknown';
}

function formatCurrency(value: unknown): string | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `R ${numeric.toLocaleString()}` : null;
}

export default function StaffChatScreen({ route, navigation }: any) {
  const {
    bookingId,
    customerId,
    customerName,
    recipientId,
    recipientName,
    chatType,
    partsOrderId,
    partsOrderTitle,
    vehicleDescription,
    vehicleYear,
    vehicleMake,
    vehicleModel,
    vehicleVariant,
    vehiclePrice,
    vehicleColor,
    customerPhone,
  } = route.params ?? {};

  const user = useQuery(api.users.me);
  const isStaffUser = Boolean(
    user?.role === 'staff' ||
    user?.role === 'admin' ||
    user?.isOwner ||
    user?.staffRole ||
    String(user?.accessLevel ?? '') === 'full_access'
  );
  const isBookingChat = Boolean(bookingId);
  const isPartsOrderChat = Boolean(partsOrderId);
  const isVehicleEnquiryChat = chatType === 'vehicle_enquiry';
  const isWarrantyClaimsChat = chatType === 'warranty_claims';
  const conversationRecipientId = normalize(recipientId ?? customerId ?? '');
  const hasValidParams = isBookingChat
    ? Boolean(bookingId)
    : isPartsOrderChat
      ? Boolean(partsOrderId || conversationRecipientId)
      : Boolean(conversationRecipientId);

  const booking = useQuery(api.bookings.getById, isBookingChat ? { bookingId } : 'skip')?.booking ?? null;
  const partsOrders = useQuery(api.partsOrders.listForStaff) ?? [];
  const partsOrder = isPartsOrderChat
    ? partsOrders.find((order: any) => String(order._id) === String(partsOrderId))
      ?? partsOrders.find((order: any) => String(order.userId).split('|')[0] === conversationRecipientId.split('|')[0])
    : null;

  const targetUserId = normalize(booking?.userId ?? conversationRecipientId);
  const threadUser = useQuery(api.users.getUserById, targetUserId ? { userId: targetUserId } : 'skip');
  const messagesQuery = useQuery(
    isBookingChat ? api.messages.listByBooking : isPartsOrderChat ? api.messages.listPartsOrderMessages : api.messages.listDirectMessages,
    hasValidParams
      ? (isBookingChat ? { bookingId } : isPartsOrderChat ? { partsOrderId } : { customerId: conversationRecipientId })
      : 'skip'
  );
  const messages = useMemo(() => messagesQuery ?? [], [messagesQuery]);

  const sendMessage = useMutation(api.messages.send);
  const markRead = useMutation(api.messages.markRead);
  const markDirectRead = useMutation(api.messages.markDirectRead);

  const [menuVisible, setMenuVisible] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<any>(null);

  const threadName = normalize(customerName ?? recipientName ?? booking?.customerName ?? partsOrder?.customerName ?? 'Conversation');
  const dealershipLine = [threadUser?.dealershipName, threadUser?.dealershipLocation].filter(Boolean).join(' • ');
  const bookingLine = isBookingChat ? [booking?.vehicleName, booking?.serviceType].filter(Boolean).join(' • ') : '';
  const partsLine = isPartsOrderChat ? [partsOrder?.orderType === 'parts_accessory' ? 'Parts + Accessories' : partsOrder?.orderType, partsOrder?.itemDescription].filter(Boolean).join(' • ') : '';
  const enquiryLine = [vehicleYear, vehicleMake, vehicleModel, vehicleVariant].filter(Boolean).join(' ');
  const callNumber = normalize(customerPhone ?? booking?.customerPhone ?? '');
  const enquiryMeta = [vehicleDescription, vehicleColor, formatCurrency(vehiclePrice), callNumber ? `Phone: ${callNumber}` : null].filter(Boolean).join(' • ');

  const threadContext = useMemo(() => {
    if (isBookingChat) {
      return {
        icon: 'calendar-outline',
        title: 'Service booking',
        subtitle: bookingLine || 'Booking thread',
        meta: dealershipLine || null,
        pill: statusLabel(booking?.status),
      };
    }

    if (isPartsOrderChat) {
      return {
        icon: 'cube-outline',
        title: 'Parts order',
        subtitle: partsLine || partsOrderTitle || 'Parts thread',
        meta: dealershipLine || null,
        pill: statusLabel(partsOrder?.status),
      };
    }

    if (isVehicleEnquiryChat) {
      return {
        icon: 'car-sport-outline',
        title: 'Vehicle enquiry',
        subtitle: enquiryLine || 'Customer enquiry',
        meta: enquiryMeta || null,
        pill: 'Lead',
      };
    }

    if (isWarrantyClaimsChat) {
      return {
        icon: 'shield-checkmark-outline',
        title: 'Warranty claims',
        subtitle: 'Claims-only conversation',
        meta: dealershipLine || null,
        pill: 'Claim',
      };
    }

    return {
      icon: 'chatbubble-outline',
      title: 'Direct conversation',
      subtitle: 'Customer and staff messages',
      meta: dealershipLine || null,
      pill: 'Chat',
    };
  }, [
    booking?.status,
    bookingLine,
    dealershipLine,
    enquiryLine,
    enquiryMeta,
    isBookingChat,
    isPartsOrderChat,
    isVehicleEnquiryChat,
    isWarrantyClaimsChat,
    partsLine,
    partsOrder?.status,
    partsOrderTitle,
  ]);

  useEffect(() => {
    if (isBookingChat && bookingId) {
      markRead({ bookingId }).catch(() => {});
      return;
    }
    if (conversationRecipientId) {
      markDirectRead({ customerId: conversationRecipientId }).catch(() => {});
    }
  }, [bookingId, conversationRecipientId, isBookingChat, markDirectRead, markRead]);

  const chatItems = useMemo(() => {
    const grouped: Array<any> = [];
    let lastDate = '';
    let lastSenderId = '';

    for (const message of messages) {
      const currentDate = dateLabel(Number(message._creationTime));
      const senderId = String(message.senderId ?? '');

      if (currentDate !== lastDate) {
        grouped.push({ type: 'date', id: `date-${currentDate}-${message._creationTime}`, label: currentDate });
        lastDate = currentDate;
      }

      grouped.push({
        type: 'message',
        ...message,
        isClusterStart: senderId !== lastSenderId,
      });

      lastSenderId = senderId;
    }

    return grouped;
  }, [messages]);

  const openMenuItem = (item: { route: string; params?: Record<string, any> }) => {
    setMenuVisible(false);
    navigation.navigate(item.route as never, item.params as never);
  };

  const openCategory = (categoryKey: string) => {
    const categoryRoute = getMessageCategoryRoute(categoryKey as any, true);
    setMenuVisible(false);
    navigation.navigate(categoryRoute.route as never, categoryRoute.params as never);
  };

  const openCall = async () => {
    if (!callNumber) {
      Alert.alert('No phone number', 'This customer does not have a phone number saved.');
      return;
    }
    try {
      await Linking.openURL(`tel:${callNumber}`);
    } catch {
      Alert.alert('Call failed', 'Unable to open the phone app.');
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    if (!isBookingChat && !isPartsOrderChat && !conversationRecipientId) {
      Alert.alert('Chat unavailable', 'No recipient is available for this conversation.');
      return;
    }

    setSending(true);
    try {
      await sendMessage({
        bookingId: isBookingChat ? bookingId : undefined,
        partsOrderId: isPartsOrderChat ? partsOrder?._id ?? partsOrderId : undefined,
        recipientId: isBookingChat
          ? String(booking?.userId ?? conversationRecipientId)
          : isPartsOrderChat
            ? String(partsOrder?.userId ?? conversationRecipientId)
            : conversationRecipientId,
        content: newMessage.trim(),
        attachmentStorageIds: [],
        attachmentNames: [],
      });
      setNewMessage('');
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (error: any) {
      Alert.alert('Chat', error?.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  if (!hasValidParams) {
    return (
      <View style={styles.screen}>
        <SafeAreaView edges={["top"]} style={styles.topSafe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={22} color={colors.white} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Conversation</Text>
              <Text style={styles.headerSubtitle}>Unable to load thread</Text>
            </View>
          </View>
        </SafeAreaView>
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textLight} />
          <Text style={styles.centerStateText}>This conversation could not be opened.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <SafeAreaView edges={["top"]} style={styles.topSafe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>{threadName}</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>{threadContext.title}</Text>
          </View>
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.iconButton}>
            <Ionicons name="ellipsis-vertical" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <View style={styles.menuOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setMenuVisible(false)} />
          <View style={styles.menuSheet}>
            <View style={styles.menuHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTitle}>Message menu</Text>
                <Text style={styles.menuSubtitle}>Open one clean screen at a time.</Text>
              </View>
              <TouchableOpacity onPress={() => setMenuVisible(false)} style={styles.menuCloseButton}>
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuContent}>
              {isStaffUser ? (
                <>
                  {getGroupedMessageMenuItems(true).map((section) => (
                    <View key={section.title} style={styles.menuSection}>
                      <Text style={styles.menuSectionTitle}>{section.title}</Text>
                      <View style={styles.menuSectionList}>
                        {section.items.map((item) => (
                          <TouchableOpacity key={item.key} style={styles.menuRow} onPress={() => openMenuItem(item)}>
                            <Ionicons name={item.icon as any} size={18} color={colors.primary} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.menuRowTitle}>{item.label}</Text>
                              {item.description ? <Text style={styles.menuRowText} numberOfLines={1}>{item.description}</Text> : null}
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ))}

                  <View style={styles.menuSection}>
                    <Text style={styles.menuSectionTitle}>Shortcuts</Text>
                    <View style={styles.menuSectionList}>
                      <TouchableOpacity style={styles.menuRow} onPress={() => openCategory('vehicleEnquiries')}>
                        <Ionicons name="car-sport-outline" size={18} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.menuRowTitle}>Vehicle enquiries</Text>
                          <Text style={styles.menuRowText} numberOfLines={1}>Open the enquiry-only inbox</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.menuRow} onPress={() => openCategory('warrantyClaims')}>
                        <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.menuRowTitle}>Warranty claims</Text>
                          <Text style={styles.menuRowText} numberOfLines={1}>Open the claims-only inbox</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {callNumber ? (
                    <TouchableOpacity
                      style={styles.menuPrimaryAction}
                      onPress={() => {
                        setMenuVisible(false);
                        void openCall();
                      }}
                    >
                      <Ionicons name="call-outline" size={18} color={colors.white} />
                      <Text style={styles.menuPrimaryActionText}>Call customer</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <View style={styles.menuSection}>
                  <Text style={styles.menuSectionTitle}>Customer view</Text>
                  <Text style={styles.menuRowText}>This conversation is kept clean and does not expose staff-only screens.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={styles.contextCard}>
        <Ionicons name={threadContext.icon as any} size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.contextTitle}>{threadContext.title}</Text>
          <Text style={styles.contextText} numberOfLines={1}>{threadContext.subtitle}</Text>
          {threadContext.meta ? <Text style={styles.contextMeta} numberOfLines={1}>{threadContext.meta}</Text> : null}
        </View>
        <View style={styles.contextPill}>
          <Text style={styles.contextPillText}>{threadContext.pill}</Text>
        </View>
      </View>

      <View style={styles.liveBanner}>
        <View style={styles.liveDot} />
        <View style={{ flex: 1 }}>
          <Text style={styles.liveTitle}>Live conversation</Text>
          <Text style={styles.liveText}>Messages update instantly for both sides.</Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={chatItems}
        keyExtractor={(item: any) => String(item._id ?? item.id)}
        contentContainerStyle={styles.messagesList}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubble-outline" size={40} color={colors.textLight} />
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyText}>Send the first reply below.</Text>
          </View>
        }
        renderItem={({ item }: any) => {
          if (item.type === 'date') {
            return (
              <View style={styles.dateWrap}>
                <View style={styles.datePill}>
                  <Text style={styles.dateText}>{item.label}</Text>
                </View>
              </View>
            );
          }

          const isMe = String(item.senderId ?? '') === String(user?._id ?? '');
          const isRead = Boolean(item.isRead);

          return (
            <View style={[styles.messageRow, isMe ? styles.messageRowRight : styles.messageRowLeft, !item.isClusterStart && styles.messageRowCompact]}>
              <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                {!isMe && item.isClusterStart ? <Text style={styles.senderName}>{item.senderName}</Text> : null}
                <Text style={[styles.messageText, isMe && { color: colors.white }]}>{item.content}</Text>
                <View style={styles.messageMetaRow}>
                  <Text style={[styles.messageTime, isMe && { color: 'rgba(255,255,255,0.75)' }]}>{timeLabel(Number(item._creationTime))}</Text>
                  {isMe ? (
                    <View style={styles.readWrap}>
                      <Ionicons name={isRead ? 'checkmark-done' : 'checkmark'} size={12} color={isRead ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.75)'} />
                      <Text style={[styles.readText, { color: isRead ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.75)' }]}>{isRead ? 'Read' : 'Sent'}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          );
        }}
      />

      <SafeAreaView edges={["bottom"]} style={styles.composerWrap}>
        <View style={styles.composerRow}>
          <TouchableOpacity style={styles.attachButton} onPress={() => Alert.alert('Attachments removed', 'This thread is intentionally kept clean for now.')}>
            <Ionicons name="add" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type your reply..."
            placeholderTextColor={colors.textLight}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="send" size={20} color={colors.white} />}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topSafe: { backgroundColor: colors.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.primary,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  headerTextWrap: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: colors.white },
  headerSubtitle: { marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.82)', fontWeight: '700' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-start', paddingTop: 80, paddingHorizontal: spacing.lg },
  menuSheet: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  menuHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: spacing.md },
  menuTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  menuSubtitle: { marginTop: 2, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  menuCloseButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  menuContent: { gap: 14, paddingBottom: 4 },
  menuSection: { gap: 8 },
  menuSectionTitle: { fontSize: 12, fontWeight: '900', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.7 },
  menuSectionList: { gap: 10 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  menuRowTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  menuRowText: { marginTop: 2, fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  menuPrimaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 2,
  },
  menuPrimaryActionText: { flex: 1, fontSize: 14, fontWeight: '900', color: colors.white },
  contextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  contextTitle: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, color: colors.textLight },
  contextText: { marginTop: 2, fontSize: 13, fontWeight: '800', color: colors.text },
  contextMeta: { marginTop: 2, fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  contextPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '24',
  },
  contextPillText: { fontSize: 11, fontWeight: '900', color: colors.primary, textTransform: 'capitalize' },
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceElevated,
  },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  liveTitle: { fontSize: 13, fontWeight: '900', color: colors.text },
  liveText: { marginTop: 2, fontSize: 11, fontWeight: '600', color: colors.textLight },
  messagesList: { padding: spacing.lg, paddingBottom: 12, flexGrow: 1 },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: '900', color: colors.text },
  emptyText: { marginTop: 4, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  centerStateText: { marginTop: 10, textAlign: 'center', color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  dateWrap: { alignItems: 'center', marginVertical: 10 },
  datePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  dateText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },
  messageRow: { marginBottom: 12, flexDirection: 'row', alignItems: 'flex-end' },
  messageRowCompact: { marginTop: -6 },
  messageRowLeft: { justifyContent: 'flex-start' },
  messageRowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', padding: 12, borderRadius: 18 },
  bubbleMe: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.borderLight },
  senderName: { fontSize: 11, fontWeight: '800', color: colors.primary, marginBottom: 4 },
  messageText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  messageMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  messageTime: { fontSize: 10, color: colors.textLight, fontWeight: '700' },
  readWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  readText: { fontSize: 10, fontWeight: '700' },
  composerWrap: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -6 },
    elevation: 8,
  },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
});