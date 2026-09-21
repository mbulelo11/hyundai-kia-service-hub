import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
  Switch,
  ActivityIndicator,
  Dimensions,
  Pressable,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import ShareSheetModal from './ShareSheetModal';
import { PUBLIC_LANDING_URL } from '../lib/shareUtils';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - spacing.lg * 2;
const CATEGORIES = ['All', 'New Cars', 'Used Cars', 'Parts', 'Accessories'];
const STOCK_FILTERS = [
  { key: 'all', label: 'All stock' },
  { key: 'hyundaiCars', label: 'Hyundai cars' },
  { key: 'kiaCars', label: 'Kia cars' },
  { key: 'demoStock', label: 'Demo stock' },
  { key: 'usedCars', label: 'Used cars' },
  { key: 'accessories', label: 'Accessories' },
  { key: 'parts', label: 'Parts' },
] as const;
const MAKES = ['Hyundai', 'Kia', 'Other'];

// Compress image using canvas - returns base64 data URL
function compressImage(file: File, maxWidth = 800, quality = 0.6): Promise<string> {
  return new Promise((resolve, reject) => {
    const Reader = (globalThis as any).FileReader;
    const ImageClass = (globalThis as any).Image;
    const createDocument = (globalThis as any).document;
    const reader = new Reader();
    reader.onload = (e: any) => {
      const img = new ImageClass();
      img.onload = () => {
        const canvas = createDocument.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = (h * maxWidth) / w;
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('No canvas context')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function InventoryScreen() {
  const navigation = useNavigation<any>();
  const [category, setCategory] = useState('All');
  const [stockFilter, setStockFilter] = useState<(typeof STOCK_FILTERS)[number]['key']>('all');
  const [stockScope, setStockScope] = useState<'all' | 'mine'>('all');
  const [showStockMenu, setShowStockMenu] = useState(false);
  const allItemsQuery = usePaginatedQuery(api.inventory.listPaged, { categoryFilter: undefined }, { initialNumItems: 5 });
  const myUploadsQuery = useQuery(api.inventory.listMyUploads);
  const allItems = useMemo(() => allItemsQuery.results ?? [], [allItemsQuery.results]);
  const myUploadsLoading = myUploadsQuery === undefined;
  const myUploads = useMemo(() => myUploadsQuery ?? [], [myUploadsQuery]);
  const sourceItems = stockScope === 'mine' ? myUploads : allItems;
  const items = useMemo(
    () => (category === 'All' ? sourceItems : sourceItems.filter((item: any) => item.category === category)),
    [sourceItems, category]
  );
  const visibleItems = useMemo(() => items.filter((item: any) => matchesStockFilter(item, stockFilter)), [items, stockFilter]);
  const addItem = useMutation(api.inventory.add);
  const removeItem = useMutation(api.inventory.remove);
  const updateItem = useMutation(api.inventory.update);
  const toggleAvail = useMutation(api.inventory.toggleAvailability);
  const addImageUrl = useMutation(api.inventory.addImageUrl);
  const removeImageUrl = useMutation(api.inventory.removeImageUrl);
  const syncCatalogs = useMutation(api.inventory.syncApprovedCatalogs);
  const markAllAvailable = useMutation(api.inventory.markAllInventoryAvailable);
  const loadStockBulk = useMutation(api.inventory.loadStockBulk);
  const backfillLegacyOwnership = useMutation(api.inventory.backfillLegacyOwnership);
  const generateUploadUrl = useMutation(api.inventory.generateUploadUrl);
  const uploadAndResolve = useMutation(api.inventory.uploadAndResolve);

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showLoadStock, setShowLoadStock] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadStockText, setLoadStockText] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [addingPhotoTo, setAddingPhotoTo] = useState<string | null>(null);
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>([]);
  const [shareItem, setShareItem] = useState<any>(null);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const inventoryCardRefs = useRef<Record<string, any>>({});
  const inventoryCardOffsets = useRef<Record<string, number>>({});
  const [form, setForm] = useState({
    category: 'New Cars',
    make: '',
    model: '',
    year: String(new Date().getFullYear()),
    variant: '',
    color: '',
    vin: '',
    price: '',
    discountAmount: '',
    cashbackAmount: '',
    specialLabel: '',
    specialNotes: '',
    specialPrice: '',
    notes: '',
  });
  const [editForm, setEditForm] = useState({
    category: 'New Cars',
    make: '',
    model: '',
    year: String(new Date().getFullYear()),
    variant: '',
    color: '',
    vin: '',
    price: '',
    discountAmount: '',
    cashbackAmount: '',
    specialLabel: '',
    specialNotes: '',
    specialPrice: '',
    notes: '',
  });

  const available = allItems.filter((i: any) => i.isAvailable && i.status === 'available').length;
  const reserved = allItems.filter((i: any) => i.status === 'reserved').length;
  const sold = allItems.filter((i: any) => i.status === 'sold').length;

  // Pick and compress image from device - returns base64 data URL
  const pickImageFromDevice = (onComplete: (dataUrl: string) => void, onError?: (msg: string) => void) => {
    if (Platform.OS !== 'web') {
      onError?.('Device image upload is unavailable on this platform.');
      return;
    }
    const input = (globalThis as any).document?.createElement('input');
    if (!input) {
      onError?.('Browser file input is unavailable.');
      return;
    }
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = false;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressImage(file, 800, 0.6);
        onComplete(dataUrl);
      } catch (err: any) {
        onError?.(err.message || 'Failed to process image');
      }
    };
    input.click();
  };

  const parseLoadStockLine = (line: string) => {
    const separator = line.includes('|') ? '|' : ',';
    const parts = line.split(separator).map((part: string) => part.trim());
    const [category = 'New Cars', make, model, year, variant, color, vin, price, notes] = parts;
    if (!make || !model) {
      throw new Error('Each line needs at least make and model.');
    }

    return {
      category,
      make,
      model,
      year: parseInt(year, 10) || new Date().getFullYear(),
      variant: variant || undefined,
      color: color || undefined,
      vin: vin || undefined,
      price: price ? parseFloat(price) : undefined,
      notes: notes || undefined,
    };
  };

  const handleLoadStock = async () => {
    const lines = loadStockText
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    if (lines.length === 0) {
      Alert.alert('Load Stock', 'Paste at least one stock line first.');
      return;
    }

    setLoadingStock(true);
    try {
      const items = lines.map(parseLoadStockLine);
      const result = await loadStockBulk({ items });
      setShowLoadStock(false);
      setLoadStockText('');
      setCategory('All');
      setStockFilter('all');
      setStockScope('mine');
      Alert.alert('Load Stock', `Loaded ${result.inserted} stock item${result.inserted === 1 ? '' : 's'}.`);
    } catch (error: any) {
      Alert.alert('Load Stock failed', error?.message ?? 'Unable to load stock.');
    } finally {
      setLoadingStock(false);
    }
  };

  // Pick image for the new item form
  const handlePickForForm = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Unavailable', 'Device image upload in this screen is currently available on web only.');
      return;
    }
    setUploadingPhoto(true);
    setUploadError('');
    pickImageFromDevice(
      (dataUrl) => {
        setPendingImageUrls((prev: string[]) => [...prev, dataUrl]);
        setUploadingPhoto(false);
      },
      (errMsg) => {
        setUploadError(errMsg);
        setUploadingPhoto(false);
      }
    );
    // Safety timeout
    setTimeout(() => setUploadingPhoto(false), 15000);
  };

  const makePendingImageMain = (url: string) => {
    setPendingImageUrls((prev: string[]) => {
      const remaining = prev.filter((itemUrl: string) => itemUrl !== url);
      return [url, ...remaining];
    });
  };

  // Pick image for an existing item - saves directly to DB
  const handlePickForItem = (itemId: string) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Unavailable', 'Device image upload in this screen is currently available on web only.');
      return;
    }
    setAddingPhotoTo(itemId);
    pickImageFromDevice(
      async (dataUrl) => {
        try {
          await addImageUrl({ itemId: itemId as any, url: dataUrl });
        } catch (err) {
        }
        setAddingPhotoTo(null);
      },
      () => { setAddingPhotoTo(null); }
    );
    setTimeout(() => setAddingPhotoTo(null), 15000);
  };

  // Generate a stock photo using AI
  const generatePhoto = async (desc: string, itemId?: string) => {
    const imageUrl = `https://api.a0.dev/assets/image?text=${encodeURIComponent(desc)}&aspect=16:9&seed=${Date.now()}`;
    if (itemId) {
      setAddingPhotoTo(itemId);
      try {
        await addImageUrl({ itemId: itemId as any, url: imageUrl });
      } catch (e) {
      }
      setAddingPhotoTo(null);
    } else {
      setPendingImageUrls((prev: string[]) => [...prev, imageUrl]);
    }
  };

  const handleAdd = async () => {
    if (!form.make.trim() || !form.model.trim()) return;
    setLoading(true);
    try {
      const uploadedImageUrls = await Promise.all(
        pendingImageUrls.map(async (imageUrl: string) => {
          if (!imageUrl.startsWith('data:')) return imageUrl;
          const uploadUrl = await generateUploadUrl({});
          const webFetch = (globalThis as any).fetch;
          const response = await webFetch(imageUrl);
          const blob = await response.blob();
          const uploadResult = await webFetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'image/jpeg' },
            body: blob,
          });
          const responseBody = await uploadResult.text();
          const storageId = (() => {
            try {
              const parsed = JSON.parse(responseBody);
              return String(parsed.storageId || parsed.id || '').trim();
            } catch {
              return responseBody.trim();
            }
          })();
          if (!storageId) {
            throw new Error('Could not upload image');
          }
          return await uploadAndResolve({ storageId: storageId as any });
        })
      );

      await addItem({
        category: form.category,
        make: form.make.trim(),
        model: form.model.trim(),
        year: parseInt(form.year) || new Date().getFullYear(),
        variant: form.variant.trim() || undefined,
        color: form.color.trim() || undefined,
        vin: form.vin.trim() || undefined,
        price: form.price ? parseFloat(form.price) : undefined,
        discountAmount: form.discountAmount ? parseFloat(form.discountAmount) : undefined,
        cashbackAmount: form.cashbackAmount ? parseFloat(form.cashbackAmount) : undefined,
        specialLabel: form.specialLabel.trim() || undefined,
        specialNotes: form.specialNotes.trim() || undefined,
        specialPrice: form.specialPrice ? parseFloat(form.specialPrice) : undefined,
        status: 'available',
        isAvailable: true,
        imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
        notes: form.notes.trim() || undefined,
      });
      setShowAdd(false);
      setPendingImageUrls([]);
      setUploadError('');
      setCategory('All');
      setStockFilter('all');
      setStockScope('mine');
      setForm({ ...form, model: '', variant: '', color: '', vin: '', price: '', discountAmount: '', cashbackAmount: '', specialLabel: '', specialNotes: '', specialPrice: '', notes: '' });
    } catch (e: any) {
      Alert.alert('Add item failed', e?.message ?? 'Could not save this inventory item.');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price?: number) => {
    if (!price) return '—';
    return `R ${price.toLocaleString()}`;
  };

  const statusColor = (s: string) =>
    s === 'available' ? colors.success : s === 'reserved' ? colors.warning : colors.textLight;

  useEffect(() => {
    if (stockScope !== 'mine') return;
    void backfillLegacyOwnership({}).catch(() => {});
  }, [backfillLegacyOwnership, stockScope]);

  const cycleStatus = async (item: any) => {
    const next = item.status === 'available' ? 'reserved'
      : item.status === 'reserved' ? 'sold'
      : 'available';
    await updateItem({ itemId: item._id, status: next, isAvailable: next === 'available' });
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setEditForm({
      category: item.category ?? 'New Cars',
      make: item.make ?? '',
      model: item.model ?? '',
      year: String(item.year ?? new Date().getFullYear()),
      variant: item.variant ?? '',
      color: item.color ?? '',
      vin: item.vin ?? '',
      price: item.price != null ? String(item.price) : '',
      discountAmount: item.discountAmount != null ? String(item.discountAmount) : '',
      cashbackAmount: item.cashbackAmount != null ? String(item.cashbackAmount) : '',
      specialLabel: item.specialLabel ?? '',
      specialNotes: item.specialNotes ?? '',
      specialPrice: item.specialPrice != null ? String(item.specialPrice) : '',
      notes: item.notes ?? '',
    });
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!editingItem || !editForm.make.trim() || !editForm.model.trim()) return;
    setSavingEdit(true);
    try {
      await updateItem({
        itemId: editingItem._id,
        category: editForm.category,
        make: editForm.make.trim(),
        model: editForm.model.trim(),
        year: parseInt(editForm.year) || editingItem.year,
        variant: editForm.variant.trim() || undefined,
        color: editForm.color.trim() || undefined,
        vin: editForm.vin.trim() || undefined,
        price: editForm.price ? parseFloat(editForm.price) : undefined,
        discountAmount: editForm.discountAmount ? parseFloat(editForm.discountAmount) : undefined,
        cashbackAmount: editForm.cashbackAmount ? parseFloat(editForm.cashbackAmount) : undefined,
        specialLabel: editForm.specialLabel.trim() || undefined,
        specialNotes: editForm.specialNotes.trim() || undefined,
        specialPrice: editForm.specialPrice ? parseFloat(editForm.specialPrice) : undefined,
        notes: editForm.notes.trim() || undefined,
      });
      setShowEdit(false);
      setEditingItem(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const openShare = (item: any) => {
    setShareItem(item);
    setShowShareSheet(true);
  };

  const shareMessage = shareItem
    ? [
        `Available vehicle on Hyundai/Kia Service Connect:`,
        '',
        `• ${shareItem.year} ${shareItem.make} ${shareItem.model}${shareItem.variant ? ` ${shareItem.variant}` : ''}${shareItem.price ? ` — R ${Number(shareItem.price).toLocaleString()}` : ''}`,
        '',
        'Open the public page to register in the app and enquire:',
        PUBLIC_LANDING_URL,
      ].join('\n')
    : [
        'Browse our available stock at Hyundai/Kia Service Connect.',
        '',
        'Open the public page to register in the app and enquire:',
        PUBLIC_LANDING_URL,
      ].join('\n');

  const handleSyncCatalogs = async () => {
    setSyncing(true);
    try {
      await syncCatalogs({});
    } finally {
      setSyncing(false);
    }
  };

  const handleMakeAllAvailable = async () => {
    setSyncing(true);
    try {
      await markAllAvailable({});
    } finally {
      setSyncing(false);
    }
  };

  const autoLoadMoreLock = useRef(false);

  const handleInventoryScroll = (e: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 220;
    if (!nearBottom) return;
    if (allItemsQuery.status === 'LoadingMore' || allItemsQuery.status === 'Exhausted') return;
    if (autoLoadMoreLock.current) return;
    autoLoadMoreLock.current = true;
    Promise.resolve(allItemsQuery.loadMore(5)).catch(() => {}).finally(() => {
      autoLoadMoreLock.current = false;
    });
  };

  const scrollInventoryCard = (itemId: string, direction: number, totalImages: number, cardWidth: number) => {
    if (totalImages <= 1) return;
    const currentIdx = inventoryCardOffsets.current[itemId] ?? 0;
    const nextIdx = Math.max(0, Math.min(totalImages - 1, currentIdx + direction));
    const scrollView = inventoryCardRefs.current[itemId];
    scrollView?.scrollTo({ x: cardWidth * nextIdx, animated: true });
    inventoryCardOffsets.current[itemId] = nextIdx;
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.primary }}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Stock Management</Text>
            <Text style={styles.headerSub}>Upload photos & manage inventory</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[styles.addBtn, { width: 44, height: 44, marginBottom: 0, backgroundColor: 'rgba(255,255,255,0.14)' }]}
              onPress={() => navigation.navigate('CompareVehicles' as never)}
            >
              <Ionicons name="git-compare-outline" size={22} color={colors.white} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
              <Ionicons name="add" size={24} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity style={styles.syncBtn} onPress={handleSyncCatalogs} disabled={syncing}>
          <Ionicons name="refresh" size={16} color={colors.white} />
          <Text style={styles.syncText}>{syncing ? 'Syncing...' : 'Sync Catalogs'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.syncBtn, { marginTop: 8 }]} onPress={handleMakeAllAvailable} disabled={syncing}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
          <Text style={styles.syncText}>{syncing ? 'Updating...' : 'Make All Available'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.syncBtn, { marginTop: 8 }]} onPress={() => setShowLoadStock(true)} disabled={loadingStock}>
          <Ionicons name="cloud-download-outline" size={16} color={colors.white} />
          <Text style={styles.syncText}>{loadingStock ? 'Loading...' : 'Load Stock'}</Text>
        </TouchableOpacity>
        <View style={styles.stockHeaderRow}>
          <View style={styles.stockActiveChip}>
            <Ionicons name="layers-outline" size={14} color={colors.primary} />
            <Text style={styles.stockActiveChipText}>{STOCK_FILTERS.find((option) => option.key === stockFilter)?.label ?? 'All stock'}</Text>
          </View>
          <TouchableOpacity style={styles.stockMenuBtn} onPress={() => setShowStockMenu((value: boolean) => !value)}>
            <Ionicons name="chevron-down" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.scopeRow}>
          <TouchableOpacity
            style={[styles.scopeChip, stockScope === 'all' && styles.scopeChipActive]}
            onPress={() => setStockScope('all')}
          >
            <Text style={[styles.scopeChipText, stockScope === 'all' && styles.scopeChipTextActive]}>Dealership Stock</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scopeChip, stockScope === 'mine' && styles.scopeChipActive]}
            onPress={() => setStockScope('mine')}
          >
            <Text style={[styles.scopeChipText, stockScope === 'mine' && styles.scopeChipTextActive]}>My Uploads</Text>
          </TouchableOpacity>
        </View>
        {stockScope === 'mine' && (
          <Text style={styles.scopeNote}>Only stock you uploaded is shown here. New uploads open in this view automatically.</Text>
        )}
        {stockScope === 'mine' && myUploadsLoading && (
          <View style={styles.uploadsLoadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.uploadsLoadingText}>Loading your uploaded stock…</Text>
          </View>
        )}
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
      </SafeAreaView>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{allItems.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.success + '10' }]}>
          <Text style={[styles.statNum, { color: colors.success }]}>{available}</Text>
          <Text style={styles.statLabel}>Available</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.warning + '10' }]}>
          <Text style={[styles.statNum, { color: colors.warning }]}>{reserved}</Text>
          <Text style={styles.statLabel}>Reserved</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.textLight + '15' }]}>
          <Text style={[styles.statNum, { color: colors.textSecondary }]}>{sold}</Text>
          <Text style={styles.statLabel}>Sold</Text>
        </View>
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.catChip, category === c && styles.catActive]}
            onPress={() => setCategory(c)}
          >
            <Text style={[styles.catText, category === c && styles.catTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.list} onScroll={handleInventoryScroll} scrollEventThrottle={16}>
        {visibleItems.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>No items in {category === 'All' ? 'stock' : category.toLowerCase()}</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAdd(true)}>
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={styles.emptyBtnText}>Add Item</Text>
            </TouchableOpacity>
          </View>
        )}

        {visibleItems.map((item: any) => (
          <View key={item._id} style={styles.card}>
            {/* Image section */}
            {item.imageUrls && item.imageUrls.length > 0 ? (
              <View style={styles.imageScrollWrap}>
                {item.imageUrls.length > 1 ? (
                  <>
                    <TouchableOpacity
                      style={[styles.imageNavBtn, styles.imageNavBtnLeft]}
                      onPress={() => scrollInventoryCard(String(item._id), -1, item.imageUrls.length, CARD_WIDTH)}
                    >
                      <Ionicons name="chevron-back" size={18} color={colors.white} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.imageNavBtn, styles.imageNavBtnRight]}
                      onPress={() => scrollInventoryCard(String(item._id), 1, item.imageUrls.length, CARD_WIDTH)}
                    >
                      <Ionicons name="chevron-forward" size={18} color={colors.white} />
                    </TouchableOpacity>
                  </>
                ) : null}
                <ScrollView
                  ref={(ref: any) => {
                    inventoryCardRefs.current[String(item._id)] = ref;
                  }}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.imageScroll}
                >
                  {(item.imageUrls ?? []).map((url: string, idx: number) => (
                    <Image
                      key={idx}
                      source={{ uri: url }}
                      style={[styles.cardImage, { width: CARD_WIDTH, backgroundColor: colors.surfaceAlt }]}
                      resizeMode={Platform.OS === 'web' ? 'contain' : 'cover'}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : (
              <View style={styles.cardImagePlaceholder}>
                <Ionicons
                  name={getInventoryIcon(item.category)}
                  size={36}
                  color={colors.primary}
                />
                <Text style={styles.noPhotoText}>No photos yet</Text>
              </View>
            )}

            {/* Upload photo button on card */}
            <TouchableOpacity
              style={styles.addPhotoBtn}
              onPress={() => handlePickForItem(item._id)}
              disabled={addingPhotoTo === item._id}
            >
              {addingPhotoTo === item._id ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Ionicons name="camera" size={14} color={colors.white} />
                  <Text style={styles.addPhotoText}>
                    {item.imageUrls?.length > 0 ? 'Add More' : 'Upload Photo'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sharePhotoBtn}
              onPress={() => openShare(item)}
            >
              <Ionicons name="share-social-outline" size={14} color={colors.primary} />
              <Text style={styles.sharePhotoText}>Share</Text>
            </TouchableOpacity>

            {/* Image count badge */}
            {item.imageUrls && item.imageUrls.length > 1 && (
              <View style={styles.imgCountBadge}>
                <Text style={styles.imgCountText}>{item.imageUrls.length} photos</Text>
              </View>
            )}

            <View style={styles.cardContent}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>
                    {item.year} {item.make} {item.model}
                  </Text>
                  {item.variant && <Text style={styles.cardVariant}>{item.variant}</Text>}
                </View>
                <View style={styles.cardActionsRow}>
                  <TouchableOpacity onPress={() => navigation.navigate('CompareVehicles' as never, { initialVehicleIds: [item._id] } as never)} style={styles.editBtn}>
                    <Ionicons name="git-compare-outline" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openEdit(item)} style={styles.editBtn}>
                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removeItem({ itemId: item._id })}
                    style={styles.deleteBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.cardMeta}>
                {item.color && (
                  <View style={styles.metaChip}>
                    <Ionicons name="color-palette-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.metaText}>{item.color}</Text>
                  </View>
                )}
                <View style={styles.metaChip}>
                  <Ionicons name="pricetag-outline" size={12} color={colors.textSecondary} />
                  <Text style={styles.metaText}>{item.category}</Text>
                </View>
                {item.vin && (
                  <View style={styles.metaChip}>
                    <Ionicons name="barcode-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.metaText}>{item.vin}</Text>
                  </View>
                )}
                {item.sourceName && (
                  <View style={styles.metaChip}>
                    <Ionicons name="cloud-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.metaText}>{item.sourceName}</Text>
                  </View>
                )}
                {item.sourceLocation && (
                  <View style={styles.metaChip}>
                    <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.metaText}>{item.sourceLocation}</Text>
                  </View>
                )}
              </View>

              {(item.sourceName || item.lastSyncedAt) && (
                <Text style={styles.syncMeta}>
                  {item.sourceName ? `Synced from ${item.sourceName}` : 'Synced stock'}
                  {item.lastSyncedAt ? ` • ${new Date(item.lastSyncedAt).toLocaleString()}` : ''}
                </Text>
              )}

              {/* Availability toggle */}
              <View style={styles.availRow}>
                <Text style={styles.availLabel}>Available for sale</Text>
                <Switch
                  value={item.isAvailable !== false}
                  onValueChange={(val: boolean) => toggleAvail({ itemId: item._id, isAvailable: val })}
                  trackColor={{ false: colors.border, true: colors.success + '60' }}
                  thumbColor={item.isAvailable !== false ? colors.success : colors.textLight}
                />
              </View>

              <View style={styles.cardBottom}>
                <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
                <TouchableOpacity
                  style={[styles.statusBtn, { backgroundColor: statusColor(item.status) + '15', borderColor: statusColor(item.status) }]}
                  onPress={() => cycleStatus(item)}
                >
                  <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
                  <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                    {formatStatusLabel(item.status)}
                  </Text>
                  <Ionicons name="chevron-forward" size={12} color={statusColor(item.status)} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
        
        {allItemsQuery.status !== 'Exhausted' && (
          <TouchableOpacity
            style={[styles.loadMoreBtn, allItemsQuery.status === 'LoadingMore' && { opacity: 0.6 }]}
            onPress={() => allItemsQuery.loadMore(5)}
            disabled={allItemsQuery.status === 'LoadingMore'}
          >
            <Text style={styles.loadMoreBtnText}>
              {allItemsQuery.status === 'LoadingMore' ? 'Loading more...' : 'Load more stock'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <ShareSheetModal
        visible={showShareSheet}
        onClose={() => setShowShareSheet(false)}
        message={shareMessage}
        title={shareItem ? 'Share Vehicle' : 'Share Available Stock'}
      />

      {/* Load Stock Modal */}
      <Modal visible={showLoadStock} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalContainer}
        >
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setShowLoadStock(false); setLoadStockText(''); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Load Stock</Text>
              <TouchableOpacity onPress={handleLoadStock} disabled={loadingStock}>
                <Text style={[styles.saveText, loadingStock && { opacity: 0.5 }]}>
                  {loadingStock ? 'Loading...' : 'Load'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.form}>
              <Text style={styles.label}>Paste stock lines</Text>
              <Text style={styles.loadHint}>
                One stock item per line. Use either pipes or commas:{'\n'}
                Category|Make|Model|Year|Variant|Color|VIN|Price|Notes
              </Text>
              <TextInput
                style={[styles.input, { minHeight: 220 }]}
                value={loadStockText}
                onChangeText={setLoadStockText}
                placeholder="New Cars|Hyundai|Tucson|2024|2.0 Executive|Black|ABC123|450000|Demo unit"
                multiline
                textAlignVertical="top"
                placeholderTextColor={colors.textLight}
              />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Stock Modal */}
      <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalContainer}
        >
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setShowEdit(false); setEditingItem(null); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Edit Stock</Text>
              <TouchableOpacity onPress={saveEdit} disabled={savingEdit}>
                <Text style={[styles.saveText, savingEdit && { opacity: 0.5 }]}>
                  {savingEdit ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.form}>
              <Text style={styles.label}>Photos</Text>
              <View style={styles.photoSection}>
                {editingItem?.imageUrls?.length > 0 && (
                  <View style={styles.thumbRow}>
                    {editingItem.imageUrls.map((url: string, idx: number) => (
                      <View key={`${url}-${idx}`} style={styles.photoThumb}>
                        <Image source={{ uri: url }} style={styles.thumbImg} />
                        <TouchableOpacity
                          style={styles.removePhoto}
                          onPress={async () => {
                            try {
                              await removeImageUrl({ itemId: editingItem._id, url });
                              setEditingItem((prev: any) => prev ? {
                                ...prev,
                                imageUrls: (prev.imageUrls ?? []).filter((u: string) => u !== url),
                              } : prev);
                            } catch (error) {
                            }
                          }}
                        >
                          <Ionicons name="close-circle" size={20} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  style={styles.uploadDeviceBtn}
                  onPress={() => editingItem && handlePickForItem(editingItem._id)}
                  disabled={addingPhotoTo === editingItem?._id}
                >
                  {addingPhotoTo === editingItem?._id ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Ionicons name="camera" size={22} color={colors.white} />
                  )}
                  <Text style={styles.uploadDeviceBtnText}>
                    {addingPhotoTo === editingItem?._id ? 'Uploading...' : 'Add Photo from Device'}
                  </Text>
                  <Text style={styles.uploadDeviceHint}>Use the same device picker upload as stock add</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Category</Text>
              <View style={styles.optionRow}>
                {['New Cars', 'Used Cars', 'Parts', 'Accessories'].map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.optionChip, editForm.category === c && styles.optionActive]}
                    onPress={() => setEditForm({ ...editForm, category: c })}
                  >
                    <Text style={[styles.optionText, editForm.category === c && styles.optionTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Make</Text>
              <TextInput
                style={styles.input}
                value={editForm.make}
                onChangeText={(t: string) => setEditForm({ ...editForm, make: t })}
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Model</Text>
              <TextInput
                style={styles.input}
                value={editForm.model}
                onChangeText={(t: string) => setEditForm({ ...editForm, model: t })}
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Year</Text>
              <TextInput
                style={styles.input}
                value={editForm.year}
                onChangeText={(t: string) => setEditForm({ ...editForm, year: t })}
                keyboardType="number-pad"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Variant</Text>
              <TextInput
                style={styles.input}
                value={editForm.variant}
                onChangeText={(t: string) => setEditForm({ ...editForm, variant: t })}
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Color</Text>
              <TextInput
                style={styles.input}
                value={editForm.color}
                onChangeText={(t: string) => setEditForm({ ...editForm, color: t })}
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>VIN</Text>
              <TextInput
                style={styles.input}
                value={editForm.vin}
                onChangeText={(t: string) => setEditForm({ ...editForm, vin: t })}
                autoCapitalize="characters"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Price (Rands)</Text>
              <TextInput
                style={styles.input}
                value={editForm.price}
                onChangeText={(t: string) => setEditForm({ ...editForm, price: t })}
                keyboardType="numeric"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Discount Amount (Rands)</Text>
              <TextInput
                style={styles.input}
                value={editForm.discountAmount}
                onChangeText={(t: string) => setEditForm({ ...editForm, discountAmount: t })}
                keyboardType="numeric"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Cashback Amount (Rands)</Text>
              <TextInput
                style={styles.input}
                value={editForm.cashbackAmount}
                onChangeText={(t: string) => setEditForm({ ...editForm, cashbackAmount: t })}
                keyboardType="numeric"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Special Label</Text>
              <TextInput
                style={styles.input}
                value={editForm.specialLabel}
                onChangeText={(t: string) => setEditForm({ ...editForm, specialLabel: t })}
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Special Price (Rands)</Text>
              <TextInput
                style={styles.input}
                value={editForm.specialPrice}
                onChangeText={(t: string) => setEditForm({ ...editForm, specialPrice: t })}
                keyboardType="numeric"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Special Notes</Text>
              <TextInput
                style={[styles.input, { minHeight: 80 }]}
                value={editForm.specialNotes}
                onChangeText={(t: string) => setEditForm({ ...editForm, specialNotes: t })}
                multiline
                textAlignVertical="top"
                placeholderTextColor={colors.textLight}
              />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Stock Modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalContainer}
        >
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setShowAdd(false); setPendingImageUrls([]); setUploadError(''); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Upload Stock</Text>
              <TouchableOpacity onPress={handleAdd} disabled={loading}>
                <Text style={[styles.saveText, loading && { opacity: 0.5 }]}>
                  {loading ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.form}>
              {/* Photo section */}
              <Text style={styles.label}>Photos</Text>
              <View style={styles.photoSection}>
                {/* Show pending image previews */}
                {pendingImageUrls.length > 0 && (
                  <View style={styles.thumbRow}>
                    {pendingImageUrls.map((url: string, idx: number) => {
                      const isMain = idx === 0;
                      return (
                        <View key={idx} style={styles.photoThumb}>
                          <Image source={{ uri: url }} style={styles.thumbImg} />
                          <TouchableOpacity
                            style={styles.removePhoto}
                            onPress={() => setPendingImageUrls((prev: string[]) => prev.filter((_: string, i: number) => i !== idx))}
                          >
                            <Ionicons name="close-circle" size={20} color={colors.error} />
                          </TouchableOpacity>
                          {!isMain && (
                            <TouchableOpacity
                              style={styles.makeMainPhoto}
                              onPress={() => makePendingImageMain(url)}
                            >
                              <Text style={styles.makeMainPhotoText}>Make main</Text>
                            </TouchableOpacity>
                          )}
                          {isMain && (
                            <View style={styles.mainPhotoBadge}>
                              <Ionicons name="star" size={12} color={colors.white} />
                              <Text style={styles.mainPhotoBadgeText}>Main</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {pendingImageUrls.length > 0 && (
                  <View style={styles.photoCount}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={styles.photoCountText}>
                      {pendingImageUrls.length} photo{pendingImageUrls.length > 1 ? 's' : ''} ready
                    </Text>
                  </View>
                )}

                {uploadError ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={16} color={colors.error} />
                    <Text style={styles.errorText}>{uploadError}</Text>
                  </View>
                ) : null}

                {/* Upload from device button - PRIMARY */}
                <TouchableOpacity
                  style={styles.uploadDeviceBtn}
                  onPress={handlePickForForm}
                  disabled={uploadingPhoto || pendingImageUrls.length >= 10}
                >
                  {uploadingPhoto ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Ionicons name="camera" size={22} color={colors.white} />
                  )}
                  <Text style={styles.uploadDeviceBtnText}>
                    {uploadingPhoto ? 'Processing...' : pendingImageUrls.length >= 10 ? 'Max 10 Photos' : 'Upload from Device'}
                  </Text>
                  <Text style={styles.uploadDeviceHint}>
                    Take a photo or choose from gallery
                  </Text>
                </TouchableOpacity>

                {/* Generate AI photo button - SECONDARY */}
                <TouchableOpacity
                  style={styles.generateBtn}
                  onPress={() => {
                    const desc = `${form.year} ${form.make} ${form.model || 'car'} ${form.color || ''} professional dealership photo, showroom`;
                    generatePhoto(desc);
                  }}
                >
                  <Ionicons name="sparkles" size={18} color={colors.primary} />
                  <Text style={styles.generateBtnText}>Auto-Generate Photo</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Category</Text>
              <View style={styles.optionRow}>
                {['New Cars', 'Used Cars', 'Parts', 'Accessories'].map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.optionChip, form.category === c && styles.optionActive]}
                    onPress={() => setForm({ ...form, category: c })}
                  >
                    <Text style={[styles.optionText, form.category === c && styles.optionTextActive]}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Make</Text>
              <View style={styles.optionRow}>
                {MAKES.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.optionChip, form.make === m && styles.optionActive]}
                    onPress={() => setForm({ ...form, make: m === 'Other' ? '' : m })}
                  >
                    <Text style={[styles.optionText, form.make === m && styles.optionTextActive]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!MAKES.includes(form.make) && (
                <TextInput
                  style={styles.input}
                  value={form.make}
                  onChangeText={(t: string) => setForm({ ...form, make: t })}
                  placeholder="Enter make..."
                  placeholderTextColor={colors.textLight}
                />
              )}

              <Text style={styles.label}>Model *</Text>
              <TextInput
                style={styles.input}
                value={form.model}
                onChangeText={(t: string) => setForm({ ...form, model: t })}
                placeholder="e.g. Tucson, Sportage, i20"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Year</Text>
              <TextInput
                style={styles.input}
                value={form.year}
                onChangeText={(t: string) => setForm({ ...form, year: t })}
                keyboardType="number-pad"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Variant</Text>
              <TextInput
                style={styles.input}
                value={form.variant}
                onChangeText={(t: string) => setForm({ ...form, variant: t })}
                placeholder="e.g. 2.0 Executive, GT-Line"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Color</Text>
              <TextInput
                style={styles.input}
                value={form.color}
                onChangeText={(t: string) => setForm({ ...form, color: t })}
                placeholder="e.g. Phantom Black"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>VIN</Text>
              <TextInput
                style={styles.input}
                value={form.vin}
                onChangeText={(t: string) => setForm({ ...form, vin: t })}
                placeholder="Vehicle Identification Number"
                autoCapitalize="characters"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Price (Rands)</Text>
              <TextInput
                style={styles.input}
                value={form.price}
                onChangeText={(t: string) => setForm({ ...form, price: t })}
                placeholder="e.g. 450000"
                keyboardType="numeric"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Discount Amount (Rands)</Text>
              <TextInput
                style={styles.input}
                value={form.discountAmount}
                onChangeText={(t: string) => setForm({ ...form, discountAmount: t })}
                placeholder="e.g. 15000"
                keyboardType="numeric"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Cashback Amount (Rands)</Text>
              <TextInput
                style={styles.input}
                value={form.cashbackAmount}
                onChangeText={(t: string) => setForm({ ...form, cashbackAmount: t })}
                placeholder="e.g. 5000"
                keyboardType="numeric"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Special Label</Text>
              <TextInput
                style={styles.input}
                value={form.specialLabel}
                onChangeText={(t: string) => setForm({ ...form, specialLabel: t })}
                placeholder="e.g. Summer Special"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Special Price (Rands)</Text>
              <TextInput
                style={styles.input}
                value={form.specialPrice}
                onChangeText={(t: string) => setForm({ ...form, specialPrice: t })}
                placeholder="Optional override price"
                keyboardType="numeric"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Special Notes</Text>
              <TextInput
                style={[styles.input, { minHeight: 80 }]}
                value={form.specialNotes}
                onChangeText={(t: string) => setForm({ ...form, specialNotes: t })}
                placeholder="Notes shown on the listing"
                multiline
                textAlignVertical="top"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, { minHeight: 80 }]}
                value={form.notes}
                onChangeText={(t: string) => setForm({ ...form, notes: t })}
                placeholder="Additional details, features, etc."
                multiline
                textAlignVertical="top"
                placeholderTextColor={colors.textLight}
              />

              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.primary,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.white },
  headerSub: { fontSize: 12, color: colors.primaryLight, marginTop: 2 },
  stockHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    position: 'relative',
    zIndex: 50,
    overflow: 'visible',
  },
  stockActiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    flex: 1,
  },
  stockActiveChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  stockMenuBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  stockMenu: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    position: 'relative',
    zIndex: 100,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 8,
    elevation: 10,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
  stockMenuItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  stockMenuItemActive: {
    backgroundColor: colors.primary + '10',
  },
  stockMenuItemText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  stockMenuItemTextActive: {
    color: colors.primary,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    marginRight: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  syncText: { fontSize: 12, fontWeight: '700', color: colors.white },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  stat: {
    flex: 1,
    padding: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  statNum: { fontSize: 20, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  visitorCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  visitorName: { fontSize: 14, fontWeight: '700', color: colors.text },
  visitorMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  contactChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.primary + '10' },
  contactChipText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  inventoryMenuBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  inventoryMenuBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  inventoryMenuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inventoryMenuBarTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  inventoryMenuBarSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  inventoryMenuPanel: {
    marginHorizontal: spacing.lg,
    marginTop: 8,
    marginBottom: spacing.sm,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  inventoryMenuSection: {
    marginBottom: 14,
  },
  inventoryMenuSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 10,
  },
  inventoryMenuEmpty: {
    fontSize: 12,
    color: colors.textSecondary,
    paddingVertical: 6,
  },
  inventoryActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inventoryActionCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '08',
    borderWidth: 1,
    borderColor: colors.primary + '14',
  },
  inventoryActionText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  cats: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  catTextActive: { color: colors.white },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 15, color: colors.textSecondary },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginTop: 12,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: colors.white },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    position: 'relative',
  },
  imageScroll: { height: 200, backgroundColor: colors.surfaceAlt },
  imageScrollWrap: { position: 'relative' },
  imageNavBtn: {
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
  imageNavBtnLeft: { left: 10 },
  imageNavBtnRight: { right: 10 },
  cardImage: { height: 200, backgroundColor: colors.surfaceAlt },
  cardImagePlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary + '06',
    gap: 4,
  },
  noPhotoText: { fontSize: 12, color: colors.textLight },
  addPhotoBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    zIndex: 2,
  },
  addPhotoText: { fontSize: 12, fontWeight: '600', color: colors.white },
  sharePhotoBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    zIndex: 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sharePhotoText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  imgCountBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    zIndex: 2,
  },
  imgCountText: { fontSize: 11, color: colors.white, fontWeight: '600' },
  cardContent: { padding: spacing.lg },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardVariant: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.error + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: colors.textSecondary },
  syncMeta: { fontSize: 11, color: colors.textLight, marginTop: 8 },
  availRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
  availLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  cardPrice: { fontSize: 17, fontWeight: '700', color: colors.primary },
  statusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalSafe: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cancelText: { fontSize: 16, color: colors.textSecondary },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  saveText: { fontSize: 16, fontWeight: '600', color: colors.primary },
  form: { padding: spacing.lg, paddingBottom: 60 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  loadHint: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginBottom: spacing.sm },
  photoSection: { gap: 12 },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbImg: { width: 80, height: 80 },
  removePhoto: { position: 'absolute', top: -4, right: -4 },
  makeMainPhoto: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: radius.full,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  makeMainPhotoText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  mainPhotoBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  mainPhotoBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  photoCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.success + '10',
    borderRadius: radius.md,
  },
  photoCountText: { fontSize: 13, fontWeight: '600', color: colors.success },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.error + '10',
    borderRadius: radius.md,
  },
  errorText: { fontSize: 13, color: colors.error },
  uploadDeviceBtn: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
  },
  uploadDeviceBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  uploadDeviceHint: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.primary + '08',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary + '30',
    borderStyle: 'dashed',
  },
  generateBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  optionTextActive: { color: colors.white },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadMoreBtn: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  loadMoreBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  scopeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
  },
  scopeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  scopeChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  scopeChipTextActive: {
    color: colors.white,
  },
  scopeNote: {
    fontSize: 12,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  uploadsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  uploadsLoadingText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});

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

function getInventoryIcon(category: string) {
  const normalized = String(category ?? '').trim().toLowerCase();
  if (normalized.includes('car')) return 'car-sport';
  if (normalized === 'parts' || normalized === 'part') return 'construct';
  if (normalized === 'accessories' || normalized === 'accessory') return 'build-outline';
  return 'diamond';
}

function formatStatusLabel(status: unknown): string {
  const value = String(status ?? 'unknown').trim();
  if (!value) return 'Unknown';
  return value.charAt(0).toUpperCase() + value.slice(1);
}