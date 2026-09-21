import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import UserAvatar from '../lib/UserAvatar';
import { MESSAGE_CATEGORY_ITEMS, getMessageCategoryRoute } from '../lib/messageCategories';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function matchesCategory(thread: any, categoryKey: string): boolean {
  const text = normalize(thread?.lastMessage);
  const vehicleText = normalize([
    thread?.vehicleDescription,
    thread?.vehicleMake,
    thread?.vehicleModel,
    thread?.vehicleVariant,
  ].filter(Boolean).join(' '));

  if (categoryKey === 'serviceBookings') {
    return Boolean(thread?.bookingId || normalize(thread?.serviceType) || text.includes('service'));
  }
  if (categoryKey === 'vehicleEnquiries') {
    return Boolean(thread?.isDirectEnquiry || vehicleText || text.includes('enquiry') || text.includes('vehicle'));
  }
  if (categoryKey === 'testDriveBookings') {
    return Boolean(text.includes('test drive') || text.includes('testdrive'));
  }
  if (categoryKey === 'events') {
    return Boolean(text.includes('event') || text.includes('invite') || text.includes('rsvp'));
  }
  if (categoryKey === 'partsOrders') {
    return Boolean(text.includes('parts') || text.includes('accessor') || vehicleText.includes('parts'));
  }
  if (categoryKey === 'merchandiseOrders') {
    return Boolean(text.includes('merchandise') || text.includes('order'));
  }
  if (categoryKey === 'financeApplications') {
    return Boolean(text.includes('finance') || text.includes('approval') || text.includes('application'));
  }
  if (categoryKey === 'warrantyClaims') {
    return Boolean(text.includes('warranty') || text.includes('claim') || text.includes('repair') || text.includes('service history'));
  }
  return false;
}

type ScreenMenuItem = {
  key: string;
  label: string;
  description: string;
  route: string;
  icon: string;
  moderatorOnly?: boolean;
};

export default function StaffMessagesScreen({ navigation, route }: any) {
  const me = useQuery(api.users.me);
  const staffMenuConfig = useQuery(api.staff.publicStaffMenuConfig);
  const markRead = useMutation(api.messages.markRead);
  const markDirectRead = useMutation(api.messages.markDirectRead);
  const isStaffUser = Boolean(
    me?.role === 'staff' ||
    me?.role === 'admin' ||
    me?.isOwner ||
    me?.staffRole ||
    me?.accessLevel
  );
  const threadsData = useQuery(isStaffUser ? api.messages.listStaffConversations : api.messages.listMyConversations);
  const contactsData = useQuery(api.messages.listInboxContacts);
  const threads = useMemo(() => threadsData ?? [], [threadsData]);
  const contacts = useMemo(() => contactsData ?? [], [contactsData]);
  const screenMenuItems = useMemo(() => staffMenuConfig ?? [], [staffMenuConfig]);
  const groupedScreenMenuItems = useMemo(() => {
    const order: Array<'My tools' | 'Sales' | 'Service' | 'Admin'> = ['My tools', 'Sales', 'Service', 'Admin'];
    return order
      .map((group) => ({
        group,
        items: screenMenuItems.filter((item: any) => String(item?.group ?? '') === group),
      }))
      .filter((section: { group: 'My tools' | 'Sales' | 'Service' | 'Admin'; items: any[] }) => section.items.length > 0);
  }, [screenMenuItems]);
  const [searchText, setSearchText] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [recipientPickerVisible, setRecipientPickerVisible] = useState(false);
  const [screenMenuVisible, setScreenMenuVisible] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const activeCategoryKey = String(route?.params?.categoryKey ?? '').trim();
  const isModerator = Boolean(
    me?.isOwner ||
    String(me?.role ?? '').trim().toLowerCase() === 'admin' ||
    String(me?.staffRole ?? '').trim().toLowerCase() === 'dp' ||
    String(me?.accessLevel ?? '').trim().toLowerCase() === 'full_access'
  );
  const screenMenuCount = screenMenuItems.length;

  const query = searchText.trim().toLowerCase();
  const visibleThreads = useMemo(() => {
    return threads.filter((thread: any) => {
      if (isStaffUser && !showArchived && Boolean(thread?.isArchived)) return false;
      if (activeCategoryKey && !matchesCategory(thread, activeCategoryKey)) return false;
      if (!query) return true;
      return `${thread?.customerName ?? ''} ${thread?.lastMessage ?? ''} ${thread?.serviceType ?? ''}`.toLowerCase().includes(query);
    });
  }, [activeCategoryKey, isStaffUser, query, showArchived, threads]);

  const categoryChips = useMemo(() => {
    return MESSAGE_CATEGORY_ITEMS.map((item) => ({
      ...item,
      count: threads.filter((thread: any) => matchesCategory(thread, item.key)).length,
    }));
  }, [threads]);

  const filteredContacts = useMemo(() => {
    const term = recipientSearch.trim().toLowerCase();
    return contacts.filter((contact: any) => {
      if (!term) return true;
      return `${contact?.name ?? ''} ${contact?.subtitle ?? ''} ${contact?.kind ?? ''}`.toLowerCase().includes(term);
    });
  }, [contacts, recipientSearch]);

  const unreadCount = useMemo(() => {
    return visibleThreads.reduce((total: number, thread: any) => total + Number(thread?.unreadCount ?? 0), 0);
  }, [visibleThreads]);

  const openScreen = (item: any) => {
    setScreenMenuVisible(false);
    navigation.navigate(item.route as never);
  };

  const openThread = (thread: any) => {
    const customerId = String(thread?.customerId ?? '');

    if (thread?.bookingId) {
      markRead({ bookingId: thread.bookingId }).catch(() => {});
    } else if (customerId) {
      markDirectRead({ customerId }).catch(() => {});
    }

    if (thread?.bookingId) {
      navigation.navigate('StaffChat', {
        bookingId: thread.bookingId,
        customerId,
        customerName: thread.customerName,
        customerPhone: thread.customerPhone,
        customerEmail: thread.customerEmail,
      });
      return;
    }

    navigation.navigate('StaffChat', {
      customerId,
      recipientId: customerId,
      customerName: thread.customerName,
      recipientName: thread.customerName,
      customerPhone: thread.customerPhone,
      customerEmail: thread.customerEmail,
      chatType: thread.isDirectEnquiry ? 'vehicle_enquiry' : 'direct',
      hideLeadSummary: Boolean(thread.isDirectEnquiry),
      vehicleInventoryItemId: thread.vehicleInventoryItemId,
      vehicleDescription: thread.vehicleDescription,
      vehicleImageUrl: thread.vehicleImageUrl,
      vehicleYear: thread.vehicleYear,
      vehicleMake: thread.vehicleMake,
      vehicleModel: thread.vehicleModel,
      vehicleVariant: thread.vehicleVariant,
      vehiclePrice: thread.vehiclePrice,
      vehicleColor: thread.vehicleColor,
    });
  };

  const openCategory = (item: any) => {
    const route = getMessageCategoryRoute(item.key, isStaffUser);
    navigation.navigate(route.route as never, route.params as never);
  };

  const openContact = (contact: any) => {
    setRecipientPickerVisible(false);
    setRecipientSearch('');
    navigation.navigate('StaffChat', {
      customerId: contact.recipientId,
      recipientId: contact.recipientId,
      customerName: contact.name,
      recipientName: contact.name,
      chatType: contact.kind === 'staff' ? 'staff' : 'direct',
    });
  };

  const renderThread = ({ item }: { item: any }) => {
    const title = String(item?.customerName ?? 'Conversation').trim();
    const leadContact = String(item?.customerPhone ?? '').trim();
    const subtitleParts = [
      item?.serviceType,
      item?.isDirectEnquiry ? 'Customer enquiry' : null,
      leadContact ? `Phone: ${leadContact}` : null,
      item?.vehicleDescription,
    ].filter(Boolean);
    const subtitle = subtitleParts.join(' • ');
    const isArchived = Boolean(item?.isArchived);

    return (
      <TouchableOpacity style={styles.threadCard} onPress={() => openThread(item)} activeOpacity={0.85}>
        <View style={styles.avatarWrap}>
          <UserAvatar
            uri={item?.customerAvatar}
            name={title}
            size={42}
            backgroundColor={colors.primary + '12'}
            textColor={colors.primary}
          />
          {Number(item?.unreadCount ?? 0) > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{Number(item.unreadCount) > 9 ? '9+' : item.unreadCount}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.threadContent}>
          <View style={styles.threadTopRow}>
            <Text style={styles.threadName} numberOfLines={1}>{title}</Text>
            <Text style={styles.threadTime}>{timeAgo(Number(item?.lastMessageTime ?? Date.now()))}</Text>
          </View>
          {subtitle ? <Text style={styles.threadMeta} numberOfLines={1}>{subtitle}</Text> : null}
          <Text style={styles.threadMessage} numberOfLines={2}>{item?.lastMessage}</Text>
          {isArchived ? <Text style={styles.archivedTag}>Archived</Text> : null}
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.textLight} style={{ marginLeft: 6 }} />
      </TouchableOpacity>
    );
  };

  const renderContact = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.contactRow} onPress={() => openContact(item)} activeOpacity={0.85}>
      <UserAvatar uri={item?.avatar} name={item?.name} size={34} backgroundColor={colors.primary + '12'} textColor={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.contactName}>{item?.name}</Text>
        <Text style={styles.contactSubtitle} numberOfLines={1}>{item?.subtitle}</Text>
      </View>
      <View style={styles.contactKindPill}>
        <Text style={styles.contactKindText}>{String(item?.kind ?? 'contact').replace(/_/g, ' ')}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.primary }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconButton}>
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Messages</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {isStaffUser
                ? activeCategoryKey === 'vehicleEnquiries'
                  ? 'Vehicle enquiries only'
                  : activeCategoryKey === 'warrantyClaims'
                    ? 'Warranty claims only'
                    : 'Customer enquiries, bookings, test drives, and staff chats'
                : activeCategoryKey === 'vehicleEnquiries'
                  ? 'Vehicle enquiries only'
                  : activeCategoryKey === 'warrantyClaims'
                    ? 'Warranty claims only'
                    : 'Talk to your dealership team in one place'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => setScreenMenuVisible(true)} style={styles.meDropdownButton} activeOpacity={0.85}>
              <Text style={styles.meDropdownText}>Me</Text>
              <Ionicons name="chevron-down" size={16} color={colors.white} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRecipientPickerVisible(true)} style={styles.headerIconButton}>
              <Ionicons name="add" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={visibleThreads}
        keyExtractor={(item: any) => String(item?.bookingId ?? item?.customerId ?? item?._id)}
        renderItem={renderThread}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <View style={styles.heroCard}>
              <Text style={styles.heroTitle}>{isStaffUser ? 'Workspace inbox' : 'Your inbox'}</Text>
              <Text style={styles.heroText}>
                {isStaffUser
                  ? activeCategoryKey === 'vehicleEnquiries'
                    ? 'This view is filtered to vehicle enquiries only so the thread list stays clean.'
                    : activeCategoryKey === 'warrantyClaims'
                      ? 'This view is filtered to warranty claims only so the thread list stays clean.'
                      : 'Customer enquiries now flow into staff messages and notifications, while staff can message each other directly.'
                  : activeCategoryKey === 'vehicleEnquiries'
                    ? 'This view is filtered to vehicle enquiries only.'
                    : activeCategoryKey === 'warrantyClaims'
                      ? 'This view is filtered to warranty claims only.'
                      : 'Your messages stay connected to the staff member handling your enquiry or booking.'}
              </Text>
              <View style={styles.heroStatsRow}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>{visibleThreads.length}</Text>
                  <Text style={styles.heroStatLabel}>Threads</Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>{unreadCount}</Text>
                  <Text style={styles.heroStatLabel}>Unread</Text>
                </View>
                <TouchableOpacity style={[styles.heroStat, styles.heroActionStat]} onPress={() => navigation.navigate('Notifications')}>
                  <Ionicons name="notifications-outline" size={18} color={colors.primary} />
                  <Text style={[styles.heroStatLabel, { marginTop: 6 }]}>Notifications</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.heroMenuButton} onPress={() => setScreenMenuVisible(true)} activeOpacity={0.85}>
                <Ionicons name="apps-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroMenuTitle}>Me</Text>
                  <Text style={styles.heroMenuSubtitle} numberOfLines={1}>
                    {screenMenuCount} screens available
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={16} color={colors.textLight} />
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search conversations"
                  placeholderTextColor={colors.textLight}
                  style={styles.searchInput}
                />
              </View>
              {isStaffUser ? (
                <TouchableOpacity style={styles.archiveToggle} onPress={() => setShowArchived((value: boolean) => !value)}>
                  <Text style={styles.archiveToggleText}>{showArchived ? 'Showing archived' : 'Hide archived'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {categoryChips.map((item: any) => (
                <TouchableOpacity key={item.key} style={styles.categoryChip} onPress={() => openCategory(item)} activeOpacity={0.85}>
                  <Ionicons name={item.icon as any} size={16} color={colors.primary} />
                  <Text style={styles.categoryChipText}>{item.label}</Text>
                  <View style={styles.categoryChipBadge}>
                    <Text style={styles.categoryChipBadgeText}>{Number(item.count ?? 0)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.textLight} />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyText}>
              {isStaffUser
                ? 'Customer enquiries and staff chats will appear here as soon as messages come in.'
                : 'Your dealership conversations will appear here once a staff member replies.'}
            </Text>
          </View>
        }
      />

      <Modal visible={recipientPickerVisible} transparent animationType="fade" onRequestClose={() => setRecipientPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setRecipientPickerVisible(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>New chat</Text>
                <Text style={styles.modalSubtitle}>Choose a staff member, customer, or teammate.</Text>
              </View>
              <TouchableOpacity onPress={() => setRecipientPickerVisible(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBar}>
              <Ionicons name="search" size={16} color={colors.textLight} />
              <TextInput
                value={recipientSearch}
                onChangeText={setRecipientSearch}
                placeholder="Search contacts"
                placeholderTextColor={colors.textLight}
                style={styles.searchInput}
              />
            </View>

            <FlatList
              data={filteredContacts}
              keyExtractor={(item: any) => String(item?.recipientId)}
              renderItem={renderContact}
              style={styles.contactList}
              ListEmptyComponent={<Text style={styles.contactEmpty}>No matching contacts.</Text>}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={screenMenuVisible} transparent animationType="fade" onRequestClose={() => setScreenMenuVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setScreenMenuVisible(false)} />
          <View style={[styles.modalCard, styles.screenMenuCard]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Me</Text>
                <Text style={styles.modalSubtitle}>Choose any visible staff screen from the dropdown.</Text>
              </View>
              <TouchableOpacity onPress={() => setScreenMenuVisible(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.screenMenuScroll} contentContainerStyle={styles.screenMenuScrollContent} showsVerticalScrollIndicator={false}>
              {groupedScreenMenuItems.map((section: { group: 'My tools' | 'Sales' | 'Service' | 'Admin'; items: any[] }) => (
                <View key={section.group} style={styles.screenMenuSection}>
                  <Text style={styles.screenMenuSectionTitle}>{section.group}</Text>
                  {section.items.map((item: any) => (
                    <TouchableOpacity key={String(item.key)} style={styles.screenMenuRow} onPress={() => openScreen(item)} activeOpacity={0.85}>
                      <View style={styles.screenMenuIconWrap}>
                        <Ionicons name={item.icon as any} size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.screenMenuLabel}>{item.label}</Text>
                        <Text style={styles.screenMenuDescription} numberOfLines={2}>{item.description}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.primary,
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  meDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  meDropdownText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 0.4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: colors.white },
  headerSubtitle: { marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.82)', fontWeight: '700' },
  list: { padding: spacing.md, paddingBottom: 36 },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  heroTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  heroText: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.textSecondary, fontWeight: '500' },
  heroStatsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  heroStat: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  heroActionStat: {
    backgroundColor: colors.primary + '10',
    borderColor: colors.primary + '20',
  },
  heroStatValue: { fontSize: 17, fontWeight: '900', color: colors.text },
  heroStatLabel: { fontSize: 10, fontWeight: '900', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroMenuButton: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  heroMenuTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
  },
  heroMenuSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  searchBar: {
    flex: 1,
    minWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 13 },
  archiveToggle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  archiveToggleText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  categoryChipText: { fontSize: 12, fontWeight: '800', color: colors.text },
  categoryChipBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  categoryChipBadgeText: { fontSize: 10, fontWeight: '900', color: colors.white },
  threadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 14,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  avatarWrap: { width: 42, height: 42, marginRight: 12, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  unreadBadgeText: { fontSize: 9, fontWeight: '900', color: colors.white },
  threadContent: { flex: 1 },
  threadTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  threadName: { flex: 1, fontSize: 15, fontWeight: '900', color: colors.text },
  threadTime: { fontSize: 11, fontWeight: '700', color: colors.textLight },
  threadMeta: { marginTop: 3, fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.4 },
  threadMessage: { marginTop: 4, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  archivedTag: { marginTop: 4, fontSize: 11, fontWeight: '900', color: colors.textLight, textTransform: 'uppercase' },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 56,
    paddingHorizontal: 28,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginTop: spacing.md,
  },
  emptyTitle: { marginTop: 10, fontSize: 17, fontWeight: '800', color: colors.text },
  emptyText: { marginTop: 6, fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'center', padding: spacing.lg },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    maxHeight: '82%',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  modalSubtitle: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  modalCloseButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  screenMenuCard: {
    maxHeight: '86%',
  },
  screenMenuScroll: {
    flex: 1,
  },
  screenMenuScrollContent: {
    paddingBottom: 8,
  },
  screenMenuSection: {
    marginBottom: 12,
  },
  screenMenuSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textLight,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  screenMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 8,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  screenMenuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '10',
  },
  screenMenuLabel: { fontSize: 14, fontWeight: '900', color: colors.text },
  screenMenuDescription: { marginTop: 2, fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
  contactList: { marginTop: spacing.md, maxHeight: 360 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 8,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  contactName: { fontSize: 14, fontWeight: '900', color: colors.text },
  contactSubtitle: { marginTop: 2, fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  contactKindPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '18',
  },
  contactKindText: { fontSize: 10, fontWeight: '900', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.4 },
  contactEmpty: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingVertical: 14 },
});