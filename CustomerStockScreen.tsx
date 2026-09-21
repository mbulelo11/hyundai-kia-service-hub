import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  Pressable,
  Alert,
  Animated,
  ImageBackground,
} from 'react-native';
declare const require: (path: string) => any;
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import ShareSheetModal from './ShareSheetModal';
import { PUBLIC_LANDING_URL, buildPublicUrl, getVehicleShareUrl } from '../lib/shareUtils';

var styles: any;

const STOCK_FILTERS = [
  { key: 'all', label: 'All stock' },
  { key: 'hyundaiCars', label: 'Hyundai cars' },
  { key: 'kiaCars', label: 'Kia cars' },
  { key: 'demoStock', label: 'Demo stock' },
  { key: 'usedCars', label: 'Used cars' },
  { key: 'accessories', label: 'Accessories' },
  { key: 'parts', label: 'Parts' },
] as const;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - spacing.lg * 2;

const formatPrice = (price?: number) => {
  if (!price) return 'Price on request';
  return `R ${price.toLocaleString()}`;
};

export default function CustomerStockScreen({ navigation, sharedVehicleId }: any) {
  const [stockFilter, setStockFilter] = useState<(typeof STOCK_FILTERS)[number]['key']>('all');
  const [shuffleMode, setShuffleMode] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showStockMenu, setShowStockMenu] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [shareItem, setShareItem] = useState<any>(null);
  const [enquiryText, setEnquiryText] = useState('');
  const [showEnquiry, setShowEnquiry] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [detailGalleryIndex, setDetailGalleryIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [cardImageIndices, setCardImageIndices] = useState<Record<string, number>>({});
  const [showShareSheet, setShowShareSheet] = useState(false);
  const cardScrollRefs = useRef<Record<string, any>>({});
  const galleryScrollRef = useRef<any>(null);
  const detailGalleryScrollRef = useRef<any>(null);
  const featuredGalleryRefs = useRef<Record<string, any>>({});
  const featuredGalleryOffsets = useRef<Record<string, number>>({});
  const user = useQuery(api.users.me);
  const authReady = user !== undefined;
  // Test Drive state
  const [showTestDrive, setShowTestDrive] = useState(false);
  const [tdDate, setTdDate] = useState('');
  const [tdTime, setTdTime] = useState('');
  const [tdPhone, setTdPhone] = useState('');
  const [tdNotes, setTdNotes] = useState('');
  const [tdSuccess, setTdSuccess] = useState(false);
  const [tdBooking, setTdBooking] = useState(false);
  const [tdError, setTdError] = useState('');
  const autoEnquirySentRef = useRef<string | null>(null);
  const screenEnter = useRef(new Animated.Value(0)).current;
  const [featuredRotationSeed, setFeaturedRotationSeed] = useState(() => Date.now());

  useEffect(() => {
    Animated.timing(screenEnter, {
      toValue: 1,
      duration: 360,
      useNativeDriver: true,
    }).start();
  }, [screenEnter]);

  const screenMotion = {
    opacity: screenEnter,
    transform: [{ translateY: screenEnter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  const inventoryItems = usePaginatedQuery(api.inventory.listPaged, {
    categoryFilter: undefined,
  }, {
    initialNumItems: Platform.OS === 'web' ? 100 : 5,
  });

  const allStockItems = useMemo(() => inventoryItems.results ?? [], [inventoryItems.results]);
  const visibleItems = useMemo(() => {
    return allStockItems.filter((item: any) => matchesStockFilter(item, stockFilter));
  }, [allStockItems, stockFilter]);

  const availableItems = visibleItems.filter((i: any) => i.status === 'available');
  const customerItems = useMemo(() => {
    const items = [...visibleItems];
    if (!shuffleMode) return items;
    return items.sort((a: any, b: any) => {
      const aScore = String(a._id).split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 997;
      const bScore = String(b._id).split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 997;
      return aScore - bScore;
    });
  }, [visibleItems, shuffleMode]);

  const sendMessage = useMutation(api.messages.send);
  const bookTestDrive = useMutation(api.testDrives.book);
  const trackStockEngagement = useMutation(api.activityLog.trackStockEngagement);

  const featuredItems = useMemo(() => {
    const sorted = [...availableItems].sort((a: any, b: any) => {
      const aScore = String(a._id).split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 997;
      const bScore = String(b._id).split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 997;
      return aScore - bScore;
    });
    return sorted.slice(0, 6);
  }, [availableItems]);

  const shareMessage = useMemo(() => {
    const featuredItemsText = featuredItems.slice(0, 3).map((item: any) => {
      const name = `${item.year} ${item.make} ${item.model}${item.variant ? ` ${item.variant}` : ''}`.trim();
      const price = item.price ? ` — R ${Number(item.price).toLocaleString()}` : '';
      return `• ${name}${price}`;
    });

    return [
      'Browse our available stock at Hyundai/Kia Service Connect.',
      '',
      featuredItemsText.length > 0 ? featuredItemsText.join('\n') : 'See the latest vehicles, parts, and accessories.',
      '',
      'Open the public page to register in the app and enquire:',
      PUBLIC_LANDING_URL,
    ].join('\n');
  }, [featuredItems]);

  const shareSelectedMessage = useMemo(() => {
    if (!shareItem) return shareMessage;

    const name = `${shareItem.year} ${shareItem.make} ${shareItem.model}${shareItem.variant ? ` ${shareItem.variant}` : ''}`.trim();
    const basePrice = Number(shareItem.price ?? 0);
    const salePrice = typeof shareItem.specialPrice === 'number'
      ? shareItem.specialPrice
      : typeof shareItem.discountAmount === 'number'
        ? Math.max(0, basePrice - shareItem.discountAmount)
        : basePrice;
    const priceLine = salePrice ? ` — R ${salePrice.toLocaleString()}` : '';
    const specialLine = shareItem.specialLabel ? `• Special: ${shareItem.specialLabel}` : null;
    const cashbackLine = shareItem.cashbackAmount ? `• Cashback: R ${Number(shareItem.cashbackAmount).toLocaleString()}` : null;
    const offerLine = shareItem.discountAmount ? `• Discount: R ${Number(shareItem.discountAmount).toLocaleString()}` : null;
    const shareUrl = getVehicleShareUrl(String(shareItem._id));

    return [
      'Available vehicle on Hyundai/Kia Service Connect:',
      '',
      `• ${name}${priceLine}`,
      specialLine,
      offerLine,
      cashbackLine,
      shareItem.specialNotes ? `• Details: ${shareItem.specialNotes}` : null,
      shareItem.color ? `• Color: ${shareItem.color}` : null,
      shareItem.notes ? `• Details: ${shareItem.notes}` : null,
      '',
      'Open the link to view the full vehicle details and photos:',
      shareUrl,
    ].filter(Boolean).join('\n');
  }, [shareItem, shareMessage]);

  useEffect(() => {
    void trackStockEngagement({
      event: 'visit',
      source: 'customer_stock',
      customerName: user?.name ?? undefined,
      customerPhone: user?.phone ?? undefined,
      customerEmail: user?.email ?? undefined,
    });
  }, [trackStockEngagement, user?.name, user?.phone, user?.email]);

  useEffect(() => {
    if (!sharedVehicleId || autoEnquirySentRef.current === sharedVehicleId) return;

    const sharedItem = allStockItems.find((item: any) => String(item._id) === String(sharedVehicleId));
    if (!sharedItem) return;

    setSelectedItem(sharedItem);
    setShowDetail(true);

    autoEnquirySentRef.current = sharedVehicleId;

    const vehicleDescription = `${sharedItem.year} ${sharedItem.make} ${sharedItem.model}${sharedItem.variant ? ' ' + sharedItem.variant : ''}`.trim();
    const enquiryBody = [
      'Automatic enquiry from shared vehicle link:',
      '',
      vehicleDescription,
      sharedItem.color ? `Color: ${sharedItem.color}` : null,
      sharedItem.price ? `Price: R ${Number(sharedItem.price).toLocaleString()}` : null,
      '',
      'Please send me the full details and availability for this vehicle.',
    ].filter(Boolean).join('\n');

    sendMessage({
      content: enquiryBody,
      customerName: user?.name ?? user?.displayName ?? 'Customer',
      customerPhone: user?.phone ?? user?.alternatePhone ?? undefined,
      customerEmail: user?.email ?? undefined,
      vehicleInventoryItemId: sharedItem._id,
      vehicleDescription,
      vehicleImageUrl: sharedItem.imageUrls?.[0] ?? sharedItem.imageUrl ?? undefined,
      vehicleYear: sharedItem.year,
      vehicleMake: sharedItem.make,
      vehicleModel: sharedItem.model,
      vehicleVariant: sharedItem.variant ?? undefined,
      vehiclePrice: sharedItem.price ?? undefined,
      vehicleColor: sharedItem.color ?? undefined,
    }).catch(() => {});
  }, [
    allStockItems,
    sendMessage,
    sharedVehicleId,
    user?.name,
    user?.displayName,
    user?.phone,
    user?.alternatePhone,
    user?.email,
  ]);

  const handleEnquire = async () => {
    if (!enquiryText.trim() || !selectedItem) return;
    setSending(true);
    try {
      const vehicleDescription = `${selectedItem.year} ${selectedItem.make} ${selectedItem.model}${selectedItem.variant ? ' ' + selectedItem.variant : ''}`.trim();
      await sendMessage({
        content: `Enquiry about: ${vehicleDescription}\n\n${enquiryText.trim()}`,
        customerName: user?.name ?? user?.displayName ?? 'Customer',
        customerPhone: user?.phone ?? user?.alternatePhone ?? undefined,
        customerEmail: user?.email ?? undefined,
        vehicleInventoryItemId: selectedItem._id,
        vehicleDescription,
        vehicleImageUrl: selectedItem.imageUrls?.[0] ?? selectedItem.imageUrl ?? undefined,
        vehicleYear: selectedItem.year,
        vehicleMake: selectedItem.make,
        vehicleModel: selectedItem.model,
        vehicleVariant: selectedItem.variant ?? undefined,
        vehiclePrice: selectedItem.price ?? undefined,
        vehicleColor: selectedItem.color ?? undefined,
      });
      setShowEnquiry(false);
      setEnquiryText('');
    } catch (e) {
    }
    setSending(false);
  };

  const openDetail = (item: any) => {
    setSelectedItem(item);
    setShowDetail(true);
  };

  const openGallery = (images: string[], startIndex: number) => {
    setGalleryImages(images);
    setGalleryIndex(startIndex);
    setShowGallery(true);
  };

  const scrollGallery = (direction: number, totalImages: number) => {
    if (totalImages <= 1) return;
    const nextIndex = Math.max(0, Math.min(totalImages - 1, galleryIndex + direction));
    galleryScrollRef.current?.scrollToIndex?.({ index: nextIndex, animated: true });
    setGalleryIndex(nextIndex);
  };

  const scrollDetailGallery = (direction: number, totalImages: number) => {
    if (totalImages <= 1 || !selectedItem?.imageUrls?.length) return;
    const nextIndex = Math.max(0, Math.min(totalImages - 1, detailGalleryIndex + direction));
    detailGalleryScrollRef.current?.scrollToIndex?.({ index: nextIndex, animated: true });
    setDetailGalleryIndex(nextIndex);
  };

  useEffect(() => {
    if (!showDetail || !selectedItem?.imageUrls?.length) return;
    setDetailGalleryIndex(0);
  }, [showDetail, selectedItem?._id, selectedItem?.imageUrls?.length]);

  const openEnquiryFromDetail = () => {
    setShowDetail(false);
    setEnquiryText('');
    setShowEnquiry(true);
  };

  const openFinanceApplication = () => {
    if (!selectedItem) return;
    setShowDetail(false);
    navigation.navigate('FinanceApplication', { vehicle: selectedItem });
  };

  const openTestDrive = (item: any) => {
    setSelectedItem(item);
    setShowDetail(false);
    setTdDate('');
    setTdTime('');
    setTdPhone('');
    setTdNotes('');
    setTdSuccess(false);
    setTdError('');
    setShowTestDrive(true);
  };

  const handleBookTestDrive = async () => {
    if (!authReady) {
      setTdError('Please wait while we confirm your account.');
      return;
    }
    if (!user) {
      setTdError('Please sign in before booking a test drive.');
      return;
    }
    if (!tdDate || !tdTime || !selectedItem) return;
    setTdBooking(true);
    setTdError('');
    try {
      await bookTestDrive({
        inventoryItemId: selectedItem._id,
        vehicleDescription: `${selectedItem.year} ${selectedItem.make} ${selectedItem.model}${selectedItem.variant ? ' ' + selectedItem.variant : ''}`,
        preferredDate: tdDate,
        preferredTime: tdTime,
        phone: tdPhone || undefined,
        notes: tdNotes || undefined,
      });
      setTdSuccess(true);
    } catch (e: any) {
      const message = e?.message || 'Failed to book test drive.';
      setTdError(message);
      Alert.alert('Test drive booking failed', message);
    }
    setTdBooking(false);
  };

  const TD_TIMES = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];

  const handleCardScroll = (itemId: string, e: any, cardWidth: number) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
    setCardImageIndices((prev: Record<string, number>) => ({ ...prev, [itemId]: idx }));
  };

  const scrollCardImages = (itemId: string, direction: number, totalImages: number, cardWidth: number) => {
    if (totalImages <= 1) return;
    const currentIdx = cardImageIndices[itemId] ?? 0;
    const nextIdx = Math.max(0, Math.min(totalImages - 1, currentIdx + direction));
    const scrollView = cardScrollRefs.current[itemId];
    scrollView?.scrollTo({ x: cardWidth * nextIdx, animated: true });
    setCardImageIndices((prev: Record<string, number>) => ({ ...prev, [itemId]: nextIdx }));
  };

  const scrollFeaturedGallery = (itemId: string, direction: number, totalImages: number, cardWidth: number) => {
    if (totalImages <= 1) return;
    const currentIdx = featuredGalleryOffsets.current[itemId] ?? 0;
    const nextIdx = Math.max(0, Math.min(totalImages - 1, currentIdx + direction));
    const scrollView = featuredGalleryRefs.current[itemId];
    scrollView?.scrollTo({ x: cardWidth * nextIdx, animated: true });
    featuredGalleryOffsets.current[itemId] = nextIdx;
  };

  const displayedFeaturedItems = featuredItems.length > 0 ? featuredItems : availableItems.slice(0, 6);

  const renderCard = (item: any) => {
    const isGrid = viewMode === 'grid';
    const cardWidth = isGrid ? (SCREEN_WIDTH - spacing.lg * 3) / 2 : CARD_WIDTH;
    const isCar = item.category?.includes('Car');
    const statusColor = item.status === 'available' ? colors.success
      : item.status === 'reserved' ? colors.warning
      : colors.textLight;
    const statusLabel = formatStatusLabel(item.status);
    const hasImages = item.imageUrls && item.imageUrls.length > 0;
    const currentIdx = cardImageIndices[item._id] ?? 0;
    const basePrice = Number(item.price ?? 0);
    const salePrice = typeof item.specialPrice === 'number'
      ? item.specialPrice
      : typeof item.discountAmount === 'number'
        ? Math.max(0, basePrice - item.discountAmount)
        : basePrice;
    const hasOffer = Boolean(item.specialLabel || item.discountAmount || item.cashbackAmount || item.specialNotes || item.specialPrice);

    return (
      <Pressable
        key={item._id}
        style={({ pressed }: { pressed: boolean }) => [styles.card, isGrid ? styles.cardGridItem : styles.cardListItem, pressed && styles.cardPressed]}
        onPress={() => openDetail(item)}
      >
        {hasImages ? (
          <View style={styles.imageScrollWrap}>
            {item.imageUrls.length > 1 && (
              <>
                <TouchableOpacity
                  style={[styles.carouselArrow, styles.carouselArrowLeft]}
                  onPress={() => scrollCardImages(item._id, -1, item.imageUrls.length, cardWidth)}
                >
                  <Ionicons name="chevron-back" size={18} color={colors.white} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.carouselArrow, styles.carouselArrowRight]}
                  onPress={() => scrollCardImages(item._id, 1, item.imageUrls.length, cardWidth)}
                >
                  <Ionicons name="chevron-forward" size={18} color={colors.white} />
                </TouchableOpacity>
              </>
            )}
            <ScrollView
              ref={(ref: any) => {
                cardScrollRefs.current[item._id] = ref;
              }}
              horizontal
              pagingEnabled
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              style={styles.cardImageScroll}
              contentContainerStyle={styles.cardImageScrollContent}
              onMomentumScrollEnd={(e: any) => handleCardScroll(item._id, e, cardWidth)}
            >
              {(item.imageUrls ?? []).map((url: string, idx: number) => (
                <Image
                  key={idx}
                  source={{ uri: url }}
                  style={[styles.cardImage, { width: cardWidth, backgroundColor: colors.surfaceAlt }]}
                  resizeMode={Platform.OS === 'web' ? 'contain' : 'cover'}
                />
              ))}
            </ScrollView>
          </View>
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Ionicons
              name={isCar ? 'car-sport' : item.category === 'Parts' ? 'construct' : 'diamond'}
              size={48}
              color={colors.textLight}
            />
            <Text style={{ fontSize: 12, color: colors.textLight, marginTop: 6 }}>
              No photos yet
            </Text>
          </View>
        )}

        {/* Status badge */}
        <View style={[styles.statusTag, { backgroundColor: statusColor + '20' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusLabel, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardCategory}>{item.category}</Text>
          {hasOffer && (
            <View style={[styles.statusTag, { position: 'relative', top: 0, height: 'auto', borderRadius: 999, marginBottom: 8, backgroundColor: colors.primary + '12' }]}>
              <Text style={[styles.statusLabel, { color: colors.primary }]} numberOfLines={1}>
                {item.specialLabel ?? (item.discountAmount ? 'Discount Offer' : item.cashbackAmount ? 'Cashback Offer' : 'Special Offer')}
              </Text>
            </View>
          )}
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.year} {item.make} {item.model}
          </Text>
          {item.variant && (
            <Text style={styles.cardVariant} numberOfLines={1}>{item.variant}</Text>
          )}
          {hasOffer && (
            <View style={{ marginBottom: 8 }}>
              <Text style={[styles.cardPrice, { color: colors.primary }]}>{salePrice ? `R ${salePrice.toLocaleString()}` : formatPrice(item.price)}</Text>
              {item.price && salePrice !== item.price && (
                <Text style={{ fontSize: 11, color: colors.textLight, textDecorationLine: 'line-through' }}>
                  {formatPrice(item.price)}
                </Text>
              )}
              {item.cashbackAmount ? (
                <Text style={{ fontSize: 11, color: colors.success, marginTop: 2 }}>
                  Cashback: R {Number(item.cashbackAmount).toLocaleString()}
                </Text>
              ) : null}
            </View>
          )}
          <View style={styles.cardChips}>
            {item.color && (
              <View style={styles.chip}>
                <View style={[styles.colorSwatch, { backgroundColor: getColorHex(item.color) }]} />
                <Text style={styles.chipText}>{item.color}</Text>
              </View>
            )}
          </View>
          <View style={styles.cardFooter}>
            <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.shareCardBtn}
                onPress={() => {
                  setShareItem(item);
                  setShowShareSheet(true);
                }}
              >
                <Ionicons name="share-social-outline" size={14} color={colors.primary} />
                <Text style={styles.shareCardBtnText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.shareCardBtn}
                onPress={() => navigation.navigate('CompareVehicles', { initialVehicleIds: [String(item._id)] })}
              >
                <Ionicons name="git-compare-outline" size={14} color={colors.primary} />
                <Text style={styles.shareCardBtnText}>Compare</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {isCar && (
                  <TouchableOpacity
                    style={[styles.enquireBtn, { backgroundColor: colors.success }]}
                    onPress={() => openTestDrive(item)}
                  >
                    <Ionicons name="speedometer-outline" size={14} color={colors.white} />
                    <Text style={styles.enquireBtnText}>Test Drive</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.enquireBtn}
                  onPress={() => { setSelectedItem(item); setEnquiryText(''); setShowEnquiry(true); }}
                >
                  <Ionicons name="chatbubble-outline" size={14} color={colors.white} />
                  <Text style={styles.enquireBtnText}>Enquire</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const appBackgroundImage = require('../assets/WhatsApp Image 2026-05-06 at 10.25.35 AM.jpeg');

  styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    wallpaper: { ...StyleSheet.absoluteFillObject },
    wallpaperOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3, 8, 20, 0.22)' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    headerSub: {
      fontSize: 14,
      color: colors.textLight,
      marginTop: 4,
    },
    shareBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
    },
    shareBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.white,
    },
    stockNavigatorWrap: {
      position: 'relative',
      zIndex: 50,
      overflow: 'visible',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    stockNavigatorHeader: {
      marginBottom: spacing.lg,
    },
    stockNavigatorTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    stockNavigatorSubtitle: {
      fontSize: 12,
      color: colors.textLight,
    },
    stockHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    stockHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stockActiveChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.primary,
    },
    stockActiveChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.white,
    },
    stockMenuBtn: {
      padding: 8,
    },
    stockViewToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    stockViewToggleText: { fontSize: 12, fontWeight: '700', color: colors.text },
    stockMenu: {
      position: 'relative',
      marginTop: spacing.sm,
      backgroundColor: colors.background,
      borderRadius: 16,
      elevation: 10,
      shadowColor: colors.text,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.14,
      shadowRadius: 12,
      zIndex: 100,
      borderWidth: 1,
      borderColor: colors.borderLight,
      paddingVertical: 6,
    },
    stockMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.surface,
      marginVertical: 4,
    },
    stockMenuItemActive: {
      backgroundColor: colors.primary,
    },
    stockMenuItemText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
    stockMenuItemTextActive: {
      color: colors.white,
    },
    grid: {
      padding: spacing.lg,
    },
    empty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    emptyDesc: {
      fontSize: 14,
      color: colors.textLight,
      textAlign: 'center',
    },
    cardGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.lg,
    },
    cardList: {
      flexDirection: 'column',
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      overflow: 'hidden',
      elevation: 2,
      shadowColor: colors.text,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    cardGridItem: { width: '48%' },
    cardListItem: { width: '100%' },
    cardPressed: {
      opacity: 0.95,
    },
    cardImage: {
      position: 'relative',
      height: 220,
    },
    imageScrollWrap: { position: 'relative' },
    cardImageScroll: {
      height: 220,
      width: '100%',
    },
    cardImageScrollContent: {
      alignItems: 'center',
    },
    cardImagePlaceholder: {
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      height: 220,
    },
    cardBody: {
      padding: spacing.lg,
    },
    cardCategory: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textLight,
      marginBottom: 4,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    cardVariant: {
      fontSize: 12,
      color: colors.textLight,
      marginBottom: 8,
    },
    cardChips: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    chipText: {
      fontSize: 10,
      color: colors.textLight,
    },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    cardPrice: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    cardActions: {
      flexDirection: 'row',
      gap: 6,
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      flexShrink: 1,
    },
    shareCardBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    shareCardBtnText: {
      fontSize: 10,
      color: colors.text,
    },
    enquireBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    enquireBtnText: {
      fontSize: 10,
      color: colors.text,
    },
    statusTag: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.text,
    },
    carouselArrow: {
      position: 'absolute',
      top: '50%',
      marginTop: -18,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      zIndex: 3,
      shadowColor: '#000',
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    carouselArrowLeft: { left: 10 },
    carouselArrowRight: { right: 10 },
    paginationRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 4,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.textLight,
    },
    dotActive: {
      backgroundColor: colors.primary,
    },
    imgCount: {
      position: 'absolute',
      top: 0,
      right: 0,
      zIndex: 1,
      padding: 4,
      backgroundColor: colors.surface,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    imgCountText: {
      fontSize: 10,
      color: colors.text,
    },
    tapHint: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 1,
      padding: 4,
      backgroundColor: colors.surface,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadMoreBtn: {
      backgroundColor: colors.primary,
      padding: 12,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 16,
    },
    loadMoreBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.white,
    },
    featuredSection: {
      marginTop: spacing.xl,
      gap: spacing.md,
      width: '100%',
    },
    galleryOverlay: {
      flex: 1,
      backgroundColor: 'rgba(3, 8, 20, 0.95)',
    },
    galleryContainer: {
      flex: 1,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
    },
    galleryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    galleryCounter: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.white,
      opacity: 0.9,
    },
    galleryClose: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    galleryControlsWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    galleryArrowBtn: {
      width: 42,
      height: 42,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.14)',
      zIndex: 2,
    },
    galleryArrowBtnDisabled: {
      opacity: 0.35,
    },
    gallerySlide: {
      width: SCREEN_WIDTH - spacing.md * 2 - 84,
      justifyContent: 'center',
      alignItems: 'center',
    },
    galleryImage: {
      width: '100%',
      height: '100%',
      minHeight: 320,
    },
    galleryDots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      marginTop: spacing.md,
    },
    galleryDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: 'rgba(255,255,255,0.28)',
    },
    galleryDotActive: {
      backgroundColor: colors.white,
      width: 22,
    },
    galleryHint: {
      marginTop: spacing.sm,
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 12,
    },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    detailHeaderTitle: {
      flex: 1,
      marginHorizontal: spacing.md,
      fontSize: 17,
      fontWeight: '700',
      color: colors.white,
      textAlign: 'center',
    },
    detailGalleryWrap: {
      position: 'relative',
      height: 300,
      backgroundColor: colors.surface,
    },
    detailArrowLeft: {
      position: 'absolute',
      left: spacing.sm,
      top: '50%',
      marginTop: -21,
      zIndex: 3,
    },
    detailArrowRight: {
      position: 'absolute',
      right: spacing.sm,
      top: '50%',
      marginTop: -21,
      zIndex: 3,
    },
    detailGalleryImage: {
      width: SCREEN_WIDTH,
      height: 300,
      backgroundColor: colors.surface,
    },
    detailPagination: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      marginTop: spacing.md,
    },
    detailPhotoInfo: {
      paddingHorizontal: spacing.lg,
      marginTop: spacing.sm,
    },
    detailPhotoCount: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: colors.primary + '12',
    },
    detailPhotoCountText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    thumbStrip: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: 8,
    },
    thumb: {
      width: 64,
      height: 64,
      borderRadius: radius.md,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: 'transparent',
      backgroundColor: colors.surfaceAlt,
    },
    thumbActive: {
      borderColor: colors.primary,
    },
    thumbImg: {
      width: '100%',
      height: '100%',
    },
    detailPlaceholder: {
      height: 260,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    detailBody: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    detailStatus: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.full,
      marginBottom: spacing.md,
    },
    detailCategory: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: colors.primaryLight,
    },
    detailTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.text,
      marginTop: 4,
      lineHeight: 31,
    },
    detailVariant: {
      fontSize: 15,
      color: colors.textSecondary,
      marginTop: 6,
    },
    detailPriceRow: {
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    detailPrice: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.white,
    },
    detailPriceSubtext: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
    },
    detailQuickStats: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    detailStatCard: {
      flex: 1,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailStatLabel: {
      fontSize: 11,
      color: colors.textLight,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 6,
    },
    detailStatValue: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    detailSection: {
      marginTop: spacing.lg,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailSectionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 8,
    },
    detailSectionText: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    detailActionRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    detailActionBtn: {
      minHeight: 52,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    detailActionBtnPrimary: {
      backgroundColor: colors.primary,
      marginTop: spacing.sm,
    },
    detailActionBtnSecondary: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    detailActionBtnText: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.white,
    },
    specsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    specItem: {
      width: '31%',
      minWidth: 96,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    specIcon: {
      width: 34,
      height: 34,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    specLabel: {
      fontSize: 11,
      color: colors.textLight,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 4,
    },
    specValue: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(3, 8, 20, 0.56)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
      maxHeight: '92%',
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    modalHandle: {
      width: 44,
      height: 5,
      borderRadius: radius.full,
      backgroundColor: colors.borderLight,
      alignSelf: 'center',
      marginVertical: spacing.sm,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: spacing.md,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
    },
    enquiryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: spacing.md,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.lg,
    },
    enquiryItemTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    enquiryItemSub: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    enquiryItemPrice: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primaryLight,
      marginTop: 4,
    },
    enquiryLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    enquiryInput: {
      minHeight: 112,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      color: colors.text,
      fontSize: 14,
      marginBottom: spacing.lg,
    },
    sendEnquiryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 15,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
    },
    sendEnquiryText: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.white,
    },
    testDriveErrorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.error + '10',
      padding: spacing.md,
      borderRadius: radius.lg,
      marginBottom: spacing.md,
    },
    testDriveErrorText: {
      flex: 1,
      fontSize: 13,
      color: colors.error,
    },
  });

  return (
    <View style={styles.container}>
      <ImageBackground source={appBackgroundImage} style={styles.wallpaper} resizeMode="cover">
        <View style={styles.wallpaperOverlay} />
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.primary }}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Stock & Vehicles</Text>
              <Text style={styles.headerSub}>{availableItems.length} available items</Text>
            </View>
            <TouchableOpacity
              style={[styles.shareBtn, availableItems.length === 0 && { opacity: 0.55 }]}
              onPress={() => {
                setShareItem(null);
                setShowShareSheet(true);
              }}
              disabled={availableItems.length === 0}
            >
              <Ionicons name="share-social-outline" size={16} color={colors.white} />
              <Text style={styles.shareBtnText}>Share Stock</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
              onPress={() => navigation.navigate('CompareVehicles')}
            >
              <Ionicons name="git-compare-outline" size={16} color={colors.white} />
              <Text style={styles.shareBtnText}>Compare</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <Animated.View style={[styles.stockNavigatorWrap, screenMotion]}>
          <View style={styles.stockNavigatorHeader}>
            <Text style={styles.stockNavigatorTitle}>Stock menu</Text>
            <Text style={styles.stockNavigatorSubtitle}>Use the menu bar to switch between Hyundai cars, Kia cars, demo stock, used cars, accessories, and parts.</Text>
          </View>

          <View style={styles.stockHeaderRow}>
            <View style={styles.stockActiveChip}>
              <Ionicons name="layers-outline" size={14} color={colors.primary} />
              <Text style={styles.stockActiveChipText}>{STOCK_FILTERS.find((option) => option.key === stockFilter)?.label ?? 'All stock'}</Text>
            </View>
            <View style={styles.stockHeaderActions}>
              <TouchableOpacity style={styles.stockViewToggle} onPress={() => navigation.navigate('BrochureManager')}>
                <Ionicons name="download-outline" size={16} color={colors.primary} />
                <Text style={styles.stockViewToggleText}>Brochures</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stockViewToggle} onPress={() => setViewMode((current: 'grid' | 'list') => (current === 'grid' ? 'list' : 'grid'))}>
                <Ionicons name={viewMode === 'grid' ? 'list' : 'grid-outline'} size={16} color={colors.primary} />
                <Text style={styles.stockViewToggleText}>{viewMode === 'grid' ? 'List' : 'Grid'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.stockViewToggle, shuffleMode && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setShuffleMode((value: boolean) => !value)}
              >
                <Ionicons name="shuffle" size={16} color={shuffleMode ? colors.white : colors.primary} />
                <Text style={[styles.stockViewToggleText, shuffleMode && { color: colors.white }]}>{shuffleMode ? 'Shuffle On' : 'Shuffle Off'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stockMenuBtn} onPress={() => setShowStockMenu((value: boolean) => !value)}>
                <Ionicons name="chevron-down" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {showStockMenu && (
            <View style={styles.stockMenu}>
              {STOCK_FILTERS.map((option) => {
                const active = stockFilter === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.stockMenuItem, active && styles.stockMenuItemActive]}
                    onPress={() => {
                      setStockFilter(option.key);
                      setShowStockMenu(false);
                    }}
                  >
                    <Text style={[styles.stockMenuItemText, active && styles.stockMenuItemTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Animated.View>

        {/* Items */}
        <Animated.ScrollView contentContainerStyle={styles.grid} style={screenMotion}>
          {customerItems.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="car-outline" size={56} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No stock available</Text>
              <Text style={styles.emptyDesc}>
                Check back soon for Hyundai cars, Kia cars, demo stock, used cars, parts, and accessories.
              </Text>
            </View>
          ) : (
            <View style={[styles.cardGrid, viewMode === 'list' && styles.cardList]}>
              {customerItems.map(renderCard)}
              {displayedFeaturedItems.length > 0 ? (
                <View style={styles.featuredSection}>
                  <Text style={styles.stockNavigatorTitle}>Featured stock</Text>
                  <Text style={styles.stockNavigatorSubtitle}>Rotates automatically so different vehicles are highlighted each visit.</Text>
                  <View style={[styles.cardGrid, viewMode === 'list' && styles.cardList]}>
                    {displayedFeaturedItems.map(renderCard)}
                  </View>
                </View>
              ) : null}
            </View>
          )}

          {inventoryItems.status !== 'Exhausted' && (
            <TouchableOpacity
              style={[styles.loadMoreBtn, inventoryItems.status === 'LoadingMore' && { opacity: 0.6 }]}
              onPress={() => inventoryItems.loadMore(Platform.OS === 'web' ? 100 : 5)}
              disabled={inventoryItems.status === 'LoadingMore'}
            >
              <Text style={styles.loadMoreBtnText}>
                {inventoryItems.status === 'LoadingMore' ? 'Loading more...' : 'Load more stock'}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.ScrollView>

        {/* ========== FULL SCREEN IMAGE GALLERY ========== */}
        <Modal visible={showGallery} animationType="fade" transparent statusBarTranslucent>
          <View style={styles.galleryOverlay}>
            <SafeAreaView style={styles.galleryContainer}>
              <View style={styles.galleryHeader}>
                <Text style={styles.galleryCounter}>
                  {galleryIndex + 1} / {galleryImages.length}
                </Text>
                <TouchableOpacity style={styles.galleryClose} onPress={() => setShowGallery(false)}>
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={styles.galleryControlsWrap}>
                <TouchableOpacity
                  style={[styles.galleryArrowBtn, galleryIndex === 0 && styles.galleryArrowBtnDisabled]}
                  onPress={() => scrollGallery(-1, galleryImages.length)}
                  disabled={galleryIndex === 0}
                >
                  <Ionicons name="chevron-back" size={22} color={galleryIndex === 0 ? 'rgba(255,255,255,0.35)' : colors.white} />
                </TouchableOpacity>

                <FlatList
                  ref={galleryScrollRef}
                  data={galleryImages}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  initialScrollIndex={galleryIndex}
                  keyExtractor={(_: string, idx: number) => idx.toString()}
                  getItemLayout={(_: ArrayLike<string> | null | undefined, index: number) => ({
                    length: SCREEN_WIDTH,
                    offset: SCREEN_WIDTH * index,
                    index,
                  })}
                  onMomentumScrollEnd={(e: { nativeEvent: { contentOffset: { x: number } } }) => {
                    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                    setGalleryIndex(idx);
                  }}
                  renderItem={({ item: url }: { item: string }) => (
                    <View style={styles.gallerySlide}>
                      <Image source={{ uri: url }} style={styles.galleryImage} resizeMode="contain" />
                    </View>
                  )}
                />

                <TouchableOpacity
                  style={[styles.galleryArrowBtn, galleryIndex >= galleryImages.length - 1 && styles.galleryArrowBtnDisabled]}
                  onPress={() => scrollGallery(1, galleryImages.length)}
                  disabled={galleryIndex >= galleryImages.length - 1}
                >
                  <Ionicons name="chevron-forward" size={22} color={galleryIndex >= galleryImages.length - 1 ? 'rgba(255,255,255,0.35)' : colors.white} />
                </TouchableOpacity>
              </View>

              {galleryImages.length > 1 && (
                <View style={styles.galleryDots}>
                  {galleryImages.map((_: string, idx: number) => (
                    <View key={idx} style={[styles.galleryDot, idx === galleryIndex && styles.galleryDotActive]} />
                  ))}
                </View>
              )}

              {galleryImages.length > 1 && <Text style={styles.galleryHint}>Swipe or use the arrows to browse photos</Text>}
            </SafeAreaView>
          </View>
        </Modal>

        {/* ========== ITEM DETAIL MODAL ========== */}
        <Modal visible={showDetail} animationType="slide" transparent={false}>
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <SafeAreaView edges={['top']} style={{ backgroundColor: colors.primary }}>
              <View style={styles.detailHeader}>
                <TouchableOpacity onPress={() => setShowDetail(false)}>
                  <Ionicons name="arrow-back" size={24} color={colors.white} />
                </TouchableOpacity>
                <Text style={styles.detailHeaderTitle} numberOfLines={1}>
                  {selectedItem?.year} {selectedItem?.make} {selectedItem?.model}
                </Text>
                <View style={{ width: 24 }} />
              </View>
            </SafeAreaView>

            <ScrollView>
              {/* Photo gallery */}
              {selectedItem?.imageUrls?.length > 0 ? (
                <View>
                  <View style={styles.detailGalleryWrap}>
                    <TouchableOpacity
                      style={[styles.galleryArrowBtn, styles.detailArrowLeft, detailGalleryIndex === 0 && styles.galleryArrowBtnDisabled]}
                      onPress={() => scrollDetailGallery(-1, selectedItem.imageUrls.length)}
                      disabled={detailGalleryIndex === 0}
                    >
                      <Ionicons name="chevron-back" size={22} color={detailGalleryIndex === 0 ? 'rgba(255,255,255,0.35)' : colors.white} />
                    </TouchableOpacity>

                    <FlatList
                      ref={detailGalleryScrollRef}
                      data={selectedItem.imageUrls}
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(_: string, idx: number) => idx.toString()}
                      initialScrollIndex={0}
                      getItemLayout={(_: ArrayLike<string> | null | undefined, index: number) => ({
                        length: SCREEN_WIDTH,
                        offset: SCREEN_WIDTH * index,
                        index,
                      })}
                      onMomentumScrollEnd={(e: { nativeEvent: { contentOffset: { x: number } } }) => {
                        const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                        setDetailGalleryIndex(idx);
                      }}
                      renderItem={({ item: url }: { item: string }) => (
                        <TouchableOpacity activeOpacity={0.95} onPress={() => openGallery(selectedItem.imageUrls, detailGalleryIndex)}>
                          <Image source={{ uri: url }} style={styles.detailGalleryImage} resizeMode="contain" />
                        </TouchableOpacity>
                      )}
                    />

                    <TouchableOpacity
                      style={[styles.galleryArrowBtn, styles.detailArrowRight, detailGalleryIndex >= selectedItem.imageUrls.length - 1 && styles.galleryArrowBtnDisabled]}
                      onPress={() => scrollDetailGallery(1, selectedItem.imageUrls.length)}
                      disabled={detailGalleryIndex >= selectedItem.imageUrls.length - 1}
                    >
                      <Ionicons name="chevron-forward" size={22} color={detailGalleryIndex >= selectedItem.imageUrls.length - 1 ? 'rgba(255,255,255,0.35)' : colors.white} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.detailPagination}>
                    {selectedItem.imageUrls.map((_: string, idx: number) => (
                      <View key={idx} style={[styles.dot, idx === detailGalleryIndex && styles.dotActive]} />
                    ))}
                  </View>

                  <View style={styles.detailPhotoInfo}>
                    <View style={styles.detailPhotoCount}>
                      <Ionicons name="images" size={14} color={colors.primary} />
                      <Text style={styles.detailPhotoCountText}>
                        {selectedItem.imageUrls.length} photo{selectedItem.imageUrls.length > 1 ? 's' : ''} — tap to open full-screen gallery
                      </Text>
                    </View>
                  </View>

                  {selectedItem.imageUrls.length > 1 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbStrip}>
                      {selectedItem.imageUrls.map((url: string, idx: number) => (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => {
                            setDetailGalleryIndex(idx);
                            detailGalleryScrollRef.current?.scrollToIndex?.({ index: idx, animated: true });
                          }}
                          style={[styles.thumb, idx === detailGalleryIndex && styles.thumbActive]}
                        >
                          <Image source={{ uri: url }} style={styles.thumbImg} resizeMode="contain" />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              ) : (
                <View style={[styles.detailPlaceholder]}>
                  <Ionicons name="camera-outline" size={48} color={colors.textLight} />
                  <Text style={{ color: colors.textLight, marginTop: 8 }}>No photos available</Text>
                </View>
              )}

              {/* Item details */}
              <View style={styles.detailBody}>
                {/* Status badge */}
                {selectedItem && (
                  <View style={[
                    styles.detailStatus,
                    {
                      backgroundColor:
                        selectedItem.status === 'available' ? colors.success + '15'
                        : selectedItem.status === 'reserved' ? colors.warning + '15'
                        : colors.textLight + '15'
                    },
                  ]}>
                    <View style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          selectedItem.status === 'available' ? colors.success
                          : selectedItem.status === 'reserved' ? colors.warning
                          : colors.textLight
                      },
                    ]} />
                    <Text style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color:
                        selectedItem.status === 'available' ? colors.success
                        : selectedItem.status === 'reserved' ? colors.warning
                        : colors.textLight,
                    }}>
                      {selectedItem.status?.charAt(0).toUpperCase() + selectedItem.status?.slice(1)}
                    </Text>
                  </View>
                )}

                <Text style={styles.detailCategory}>{selectedItem?.category}</Text>
                <Text style={styles.detailTitle}>
                  {selectedItem?.year} {selectedItem?.make} {selectedItem?.model}
                </Text>
                {selectedItem?.variant && (
                  <Text style={styles.detailVariant}>{selectedItem.variant}</Text>
                )}
                <View style={styles.detailPriceRow}>
                  <Text style={styles.detailPrice}>
                    {(() => {
                      const base = Number(selectedItem?.price ?? 0);
                      const sale = typeof selectedItem?.specialPrice === 'number'
                        ? selectedItem.specialPrice
                        : typeof selectedItem?.discountAmount === 'number'
                          ? Math.max(0, base - selectedItem.discountAmount)
                          : base;
                      return sale ? `R ${sale.toLocaleString()}` : formatPrice(selectedItem?.price);
                    })()}
                  </Text>
                  <Text style={styles.detailPriceSubtext}>
                    {selectedItem?.specialLabel ?? (selectedItem?.discountAmount ? 'Discount offer available' : selectedItem?.cashbackAmount ? 'Cashback offer available' : selectedItem?.status === 'available' ? 'Ready to enquire' : 'Speak to the team for availability')}
                  </Text>
                  {selectedItem?.price && (selectedItem?.specialPrice || selectedItem?.discountAmount) && (
                    <Text style={{ fontSize: 12, color: colors.textLight, textDecorationLine: 'line-through', marginTop: 4 }}>
                      {formatPrice(selectedItem?.price)}
                    </Text>
                  )}
                  {selectedItem?.cashbackAmount ? (
                    <Text style={{ fontSize: 12, color: colors.success, marginTop: 4 }}>
                      Cashback: R {Number(selectedItem.cashbackAmount).toLocaleString()}
                    </Text>
                  ) : null}
                  {selectedItem?.specialNotes ? (
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                      {selectedItem.specialNotes}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.detailQuickStats}>
                  <View style={styles.detailStatCard}>
                    <Text style={styles.detailStatLabel}>Year</Text>
                    <Text style={styles.detailStatValue}>{selectedItem?.year ?? '—'}</Text>
                  </View>
                  <View style={styles.detailStatCard}>
                    <Text style={styles.detailStatLabel}>Category</Text>
                    <Text style={styles.detailStatValue} numberOfLines={1}>{selectedItem?.category ?? 'Stock'}</Text>
                  </View>
                  <View style={styles.detailStatCard}>
                    <Text style={styles.detailStatLabel}>Photos</Text>
                    <Text style={styles.detailStatValue}>{selectedItem?.imageUrls?.length ?? 0}</Text>
                  </View>
                </View>

                {/* Specs */}
                <View style={styles.specsGrid}>
                  {selectedItem?.color && (
                    <View style={styles.specItem}>
                      <View style={[styles.specIcon, { backgroundColor: getColorHex(selectedItem.color) + '20' }]}>
                        <View style={[styles.colorSwatch, { backgroundColor: getColorHex(selectedItem.color), width: 14, height: 14, borderRadius: 7 }]} />
                      </View>
                      <Text style={styles.specLabel}>Color</Text>
                      <Text style={styles.specValue}>{selectedItem.color}</Text>
                    </View>
                  )}
                  {selectedItem?.year && (
                    <View style={styles.specItem}>
                      <View style={[styles.specIcon, { backgroundColor: colors.primary + '15' }]}>
                        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                      </View>
                      <Text style={styles.specLabel}>Year</Text>
                      <Text style={styles.specValue}>{selectedItem.year}</Text>
                    </View>
                  )}
                  <View style={styles.specItem}>
                    <View style={[styles.specIcon, { backgroundColor: colors.primaryLight + '15' }]}>
                      <Ionicons name="pricetag-outline" size={16} color={colors.primaryLight} />
                    </View>
                    <Text style={styles.specLabel}>Category</Text>
                    <Text style={styles.specValue}>{selectedItem?.category}</Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Special offer</Text>
                  <Text style={styles.detailSectionText}>
                    {selectedItem?.specialLabel ?? 'This car has a staff-managed special offer.'}
                  </Text>
                  {selectedItem?.specialNotes ? (
                    <Text style={[styles.detailSectionText, { marginTop: 8 }]}>{selectedItem.specialNotes}</Text>
                  ) : null}
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Why this listing stands out</Text>
                  <Text style={styles.detailSectionText}>
                    Tap enquire for an instant response, book a test drive to reserve a slot, or apply for finance to start your purchase journey.
                  </Text>
                </View>

                <View style={styles.detailActionRow}>
                  <TouchableOpacity
                    style={[styles.detailActionBtn, styles.detailActionBtnSecondary]}
                    onPress={openEnquiryFromDetail}
                  >
                    <Ionicons name="chatbubble-outline" size={18} color={colors.primary} />
                    <Text style={[styles.detailActionBtnText, { color: colors.primary }]}>Enquire</Text>
                  </TouchableOpacity>

                  {selectedItem?.category?.includes('Car') && (
                    <TouchableOpacity
                      style={[styles.detailActionBtn, styles.detailActionBtnSecondary]}
                      onPress={() => openTestDrive(selectedItem)}
                    >
                      <Ionicons name="speedometer-outline" size={18} color={colors.success} />
                      <Text style={[styles.detailActionBtnText, { color: colors.success }]}>Test Drive</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.detailActionBtn, styles.detailActionBtnPrimary]}
                  onPress={openFinanceApplication}
                >
                  <Ionicons name="card-outline" size={18} color={colors.white} />
                  <Text style={styles.detailActionBtnText}>Apply for Finance</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Modal>

        {/* ========== ENQUIRY MODAL ========== */}
        <Modal visible={showEnquiry} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalContent}
            >
              <SafeAreaView edges={['bottom']}>
                <View style={styles.modalHandle} />
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Enquire Now</Text>
                  <TouchableOpacity onPress={() => setShowEnquiry(false)}>
                    <Ionicons name="close" size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {selectedItem && (
                  <View style={styles.enquiryItem}>
                    {selectedItem.imageUrls?.length > 0 ? (
                      <Image
                        source={{ uri: selectedItem.imageUrls[0] }}
                        style={{ width: 48, height: 48, borderRadius: 8 }}
                        resizeMode="contain"
                      />
                    ) : (
                      <Ionicons
                        name={selectedItem.category?.includes('Car') ? 'car-sport' : 'cube'}
                        size={24}
                        color={colors.primary}
                      />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.enquiryItemTitle}>
                        {selectedItem.year} {selectedItem.make} {selectedItem.model}
                      </Text>
                      {selectedItem.variant && (
                        <Text style={styles.enquiryItemSub}>{selectedItem.variant}</Text>
                      )}
                      <Text style={styles.enquiryItemPrice}>
                        {formatPrice(selectedItem.price)}
                      </Text>
                    </View>
                  </View>
                )}

                <Text style={styles.enquiryLabel}>Your message</Text>
                <TextInput
                  style={styles.enquiryInput}
                  placeholder="I'm interested in this vehicle. Please provide more details..."
                  placeholderTextColor={colors.textLight}
                  value={enquiryText}
                  onChangeText={setEnquiryText}
                  multiline
                  textAlignVertical="top"
                />

                <TouchableOpacity
                  style={[styles.sendEnquiryBtn, !enquiryText.trim() && { opacity: 0.5 }]}
                  onPress={handleEnquire}
                  disabled={sending || !enquiryText.trim()}
                >
                  <Ionicons name="send" size={18} color={colors.white} />
                  <Text style={styles.sendEnquiryText}>
                    {sending ? 'Sending...' : 'Send Enquiry'}
                  </Text>
                </TouchableOpacity>
              </SafeAreaView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* ========== TEST DRIVE MODAL ========== */}
        <Modal visible={showTestDrive} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={[styles.modalContent, { maxHeight: '85%' }]}
            >
              <SafeAreaView edges={['bottom']}>
                <View style={styles.modalHandle} />

                {tdSuccess ? (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                      <Ionicons name="checkmark-circle" size={40} color={colors.success} />
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>Test Drive Booked!</Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8, paddingHorizontal: 20 }}>
                      Your test drive for {selectedItem?.year} {selectedItem?.make} {selectedItem?.model} has been requested. We'll confirm your slot soon!
                    </Text>
                    <TouchableOpacity
                      style={[styles.sendEnquiryBtn, { marginTop: 24, paddingHorizontal: 40 }]}
                      onPress={() => setShowTestDrive(false)}
                    >
                      <Text style={styles.sendEnquiryText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Book Test Drive</Text>
                      <TouchableOpacity onPress={() => setShowTestDrive(false)}>
                        <Ionicons name="close" size={24} color={colors.text} />
                      </TouchableOpacity>
                    </View>

                    {selectedItem && (
                      <View style={styles.enquiryItem}>
                        <Ionicons name="speedometer" size={24} color={colors.success} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.enquiryItemTitle}>
                            {selectedItem.year} {selectedItem.make} {selectedItem.model}
                          </Text>
                          {selectedItem.variant && (
                            <Text style={styles.enquiryItemSub}>{selectedItem.variant}</Text>
                          )}
                        </View>
                      </View>
                    )}

                    {tdError ? (
                      <View style={styles.testDriveErrorBanner}>
                        <Ionicons name="alert-circle" size={18} color={colors.error} />
                        <Text style={styles.testDriveErrorText}>{tdError}</Text>
                      </View>
                    ) : null}

                    <ScrollView showsVerticalScrollIndicator={false}>
                      <Text style={styles.enquiryLabel}>Preferred Date *</Text>
                      <TextInput
                        style={[styles.enquiryInput, { minHeight: 48 }]}
                        placeholder="e.g. 2025-02-15 or 15 Feb 2025"
                        placeholderTextColor={colors.textLight}
                        value={tdDate}
                        onChangeText={setTdDate}
                      />

                      <Text style={styles.enquiryLabel}>Preferred Time *</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                        {TD_TIMES.map((t: string) => (
                          <TouchableOpacity
                            key={t}
                            style={{
                              paddingHorizontal: 16,
                              paddingVertical: 10,
                              borderRadius: 20,
                              backgroundColor: tdTime === t ? colors.primary : colors.surfaceAlt,
                              borderWidth: 1,
                              borderColor: tdTime === t ? colors.primary : colors.border,
                            }}
                            onPress={() => setTdTime(t)}
                          >
                            <Text style={{
                              fontSize: 14,
                              fontWeight: '600',
                              color: tdTime === t ? colors.white : colors.text,
                            }}>{t}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={styles.enquiryLabel}>Phone Number (optional)</Text>
                      <TextInput
                        style={[styles.enquiryInput, { minHeight: 48 }]}
                        placeholder="Your contact number"
                        placeholderTextColor={colors.textLight}
                        value={tdPhone}
                        onChangeText={setTdPhone}
                        keyboardType="phone-pad"
                      />

                      <Text style={styles.enquiryLabel}>Notes (optional)</Text>
                      <TextInput
                        style={styles.enquiryInput}
                        placeholder="Anything we should know?"
                        placeholderTextColor={colors.textLight}
                        value={tdNotes}
                        onChangeText={setTdNotes}
                        multiline
                        textAlignVertical="top"
                      />
                    </ScrollView>

                    <TouchableOpacity
                      style={[styles.sendEnquiryBtn, { backgroundColor: colors.success }, (!authReady || !tdDate || !tdTime) && { opacity: 0.5 }]}
                      onPress={handleBookTestDrive}
                      disabled={tdBooking || !authReady || !tdDate || !tdTime}
                    >
                      <Ionicons name="speedometer-outline" size={18} color={colors.white} />
                      <Text style={styles.sendEnquiryText}>
                        {!authReady ? 'Checking account...' : tdBooking ? 'Booking...' : 'Confirm Test Drive'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </SafeAreaView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <ShareSheetModal
          visible={showShareSheet}
          onClose={() => setShowShareSheet(false)}
          message={shareSelectedMessage}
          title={shareItem ? 'Share Vehicle' : 'Share Available Stock'}
          shareUrl={shareItem ? getVehicleShareUrl(String(shareItem._id)) : PUBLIC_LANDING_URL}
        />
      </ImageBackground>
    </View>
  );
}

function matchesStockFilter(item: any, filter: (typeof STOCK_FILTERS)[number]['key']) {
  const category = String(item.category ?? '').trim().toLowerCase();
  const normalizedCategory = category.replace(/\s+/g, ' ');
  const searchable = `${item.make ?? ''} ${item.model ?? ''} ${item.variant ?? ''} ${item.notes ?? ''}`.toLowerCase();
  if (filter === 'all') return true;
  if (filter === 'hyundaiCars') return String(item.make ?? '').toLowerCase() === 'hyundai';
  if (filter === 'kiaCars') return String(item.make ?? '').toLowerCase() === 'kia';
  if (filter === 'demoStock') return searchable.includes('demo');
  if (filter === 'usedCars') return normalizedCategory === 'used cars' || searchable.includes('pre-used') || searchable.includes('pre used');
  if (filter === 'accessories') return normalizedCategory === 'accessories' || normalizedCategory === 'accessory';
  if (filter === 'parts') return normalizedCategory === 'parts' || normalizedCategory === 'part' || searchable.includes('spare part');
  return true;
}

function getColorHex(colorName: string): string {
  const map: Record<string, string> = {
    'black': '#1a1a1a', 'white': '#f5f5f5', 'red': '#EF4444',
    'blue': '#3B82F6', 'silver': '#94A3B8', 'grey': '#6B7280', 'gray': '#6B7280',
    'green': '#10B981', 'phantom black': '#1a1a1a', 'polar white': '#f5f5f5',
    'typhoon silver': '#94A3B8', 'atlas white': '#f5f5f5', 'abyss black': '#1a1a1a',
  };
  return map[colorName.toLowerCase()] ?? colors.primary;
}

function formatStatusLabel(status: unknown): string {
  const value = String(status ?? 'unknown').trim();
  if (!value) return 'Unknown';
  return value.charAt(0).toUpperCase() + value.slice(1);
}