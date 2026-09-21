import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator, Platform, Modal, Alert, ImageBackground, Share, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { getMerchandiseShareUrl, sharePayload } from '../lib/shareUtils';

const appBackgroundImage: any = undefined;

const EMPTY_ARRAY: any[] = [];

const DELIVERY_TYPES = [
  { value: 'delivery', label: 'Delivery' },
  { value: 'collection', label: 'Collect at dealership' },
] as const;

type SizeAllocationDraft = { size: string; quantity: string };

type MerchandiseScreenProps = {
  navigation: any;
  route: { params?: { brand?: 'Hyundai' | 'Kia'; itemId?: string } };
  mode?: 'customer' | 'staff';
};

type PendingImage = { uri: string; name: string; mimeType: string };
type UploadedImage = { storageId: string; url: string };
type UploadedProofFile = { storageId: string; url: string; name: string; mimeType: string };

type CartSection = 'merchandise' | 'parts';

function formatMoney(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'R 0';
  return `R ${value.toLocaleString()}`;
}

function isComplete(status?: string) {
  return ['completed', 'fulfilled'].includes(String(status ?? '').toLowerCase());
}

function parseSizeAllocations(input: string): Array<{ size: string; quantity: number }> {
  return String(input ?? '')
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [sizePart, quantityPart] = chunk.split(':').map((part) => part.trim());
      return {
        size: sizePart,
        quantity: Math.max(0, Number(quantityPart || '0')),
      };
    })
    .filter((entry) => Boolean(entry.size) && entry.quantity > 0);
}

function formatSizeAllocations(sizeAllocations?: Array<{ size: string; quantity: number }>) {
  return (sizeAllocations ?? []).map((entry) => `${entry.size}:${entry.quantity}`).join(', ');
}

function collectMerchandiseImageUrls(item: any) {
  return [
    ...(Array.isArray(item?.imageUrls) ? item.imageUrls : []),
    ...(Array.isArray(item?.storedImageUrls) ? item.storedImageUrls : []),
    item?.imageUrl,
  ].map((url) => String(url ?? '').trim()).filter(Boolean);
}

function getImageRatio(value: any) {
  const width = Number(value?.width ?? 0);
  const height = Number(value?.height ?? 0);
  if (!width || !height) return 1;
  return width / height;
}

const ORDER_STAGES = [
  'Order received',
  'Quote + banking details',
  'Proof of payment uploaded',
  'Payment confirmed',
  'Delivery or collection completed',
] as const;

function getWorkflowStageState(status: string | undefined, index: number) {
  const normalized = String(status ?? 'submitted').toLowerCase();
  if (index === 0) return ['submitted', 'received', 'availability_confirmed', 'payment_proof_submitted', 'payment_confirmed', 'completed', 'fulfilled'].includes(normalized);
  if (index === 1) return ['received', 'availability_confirmed', 'payment_proof_submitted', 'payment_confirmed', 'completed', 'fulfilled'].includes(normalized);
  if (index === 2) return ['payment_proof_submitted', 'payment_confirmed', 'completed', 'fulfilled'].includes(normalized);
  if (index === 3) return ['payment_confirmed', 'completed', 'fulfilled'].includes(normalized);
  return ['completed', 'fulfilled'].includes(normalized);
}

export default function MerchandiseScreen({ navigation, route, mode = 'customer' }: MerchandiseScreenProps) {
  const brand = route?.params?.brand === 'Kia' ? 'Kia' : 'Hyundai';
  const selectedItemId = route?.params?.itemId ? String(route.params.itemId) : null;
  const me = useQuery(api.users.me);
  const isStaffView = mode === 'staff';
  const canManageMerchandise = Boolean(me?.role === 'staff' || me?.role === 'admin' || me?.isOwner || String(me?.accessLevel ?? '') === 'full_access');
  const showStaffTools = isStaffView && canManageMerchandise;
  const items = useQuery(api.merchandise.listItemsByBrand, { brand }) ?? EMPTY_ARRAY;
  const categories = useQuery(api.merchandise.listCategoriesByBrand, { brand }) ?? EMPTY_ARRAY;
  const merchandiseCart = useQuery(api.merchandise.listCart, { cartType: 'merchandise' }) ?? EMPTY_ARRAY;
  const partsCart = useQuery(api.merchandise.listCart, { cartType: 'parts' }) ?? EMPTY_ARRAY;
  const mine = useQuery(api.merchandise.listMine, { brand }) ?? EMPTY_ARRAY;
  const staffOrders = useQuery(api.merchandise.listOrdersByBrand, { brand }) ?? EMPTY_ARRAY;
  const orders = isStaffView ? staffOrders : mine;
  const merchandiseStats = useQuery(api.analytics.getMerchandiseSalesStats);

  const addItem = useMutation(api.merchandise.addItem);
  const updateItem = useMutation(api.merchandise.updateItem);
  const removeItem = useMutation(api.merchandise.removeItem);
  const submitOrder = useMutation(api.merchandise.submitOrder);
  const checkoutCart = useMutation(api.merchandise.checkoutCart);
  const checkoutPartsCart = useMutation(api.merchandise.checkoutPartsCart);
  const receiveOrder = useMutation(api.merchandise.receiveOrder);
  const confirmAvailability = useMutation(api.merchandise.confirmAvailability);
  const submitPaymentProof = useMutation(api.merchandise.submitPaymentProof);
  const confirmPayment = useMutation(api.merchandise.confirmPayment);
  const completeOrder = useMutation(api.merchandise.completeOrder);
  const markUnavailable = useMutation(api.merchandise.markUnavailable);
  const generateUploadUrl = useMutation(api.merchandise.generateUploadUrl);
  const resolveUploadedImage = useMutation(api.merchandise.resolveUploadedImage);
  const addToCart = useMutation(api.merchandise.addToCart);
  const updateCartItem = useMutation(api.merchandise.updateCartItem);
  const removeCartItem = useMutation(api.merchandise.removeCartItem);
  const clearCart = useMutation(api.merchandise.clearCart);
  const createCategory = useMutation(api.merchandise.createCategory);

  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const [resolvedStorageUrls, setResolvedStorageUrls] = useState<Record<string, string>>({});
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofFiles, setProofFiles] = useState<UploadedProofFile[]>([]);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteFiles, setQuoteFiles] = useState<UploadedProofFile[]>([]);
  const [quoteOrderId, setQuoteOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'shop' | 'cart' | 'orders' | 'analytics'>('shop');
  const [selectedCartSection, setSelectedCartSection] = useState<CartSection>('merchandise');
  const [cartNote, setCartNote] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCategoryDraft, setSelectedCategoryDraft] = useState('');
  const [orderForm, setOrderForm] = useState({
    customerName: me?.displayName ?? me?.name ?? '',
    customerPhone: me?.phone ?? '',
    quantity: '1',
    fulfillmentType: 'collection',
    deliveryAddress: '',
    contactPreference: 'app_message',
    notes: '',
  });
  const [itemForm, setItemForm] = useState({
    title: '',
    description: '',
    category: '',
    sku: '',
    price: '',
    stockQuantity: '1',
  });
  const [itemVisibleToCustomers, setItemVisibleToCustomers] = useState(false);
  const [editingItemVisibleToCustomers, setEditingItemVisibleToCustomers] = useState(false);
  const [itemImages, setItemImages] = useState<string[]>([]);
  const [itemImageStorageIds, setItemImageStorageIds] = useState<string[]>([]);
  const [editingItemImages, setEditingItemImages] = useState<string[]>([]);
  const [editingItemImageStorageIds, setEditingItemImageStorageIds] = useState<string[]>([]);
  const [itemImageUrlInput, setItemImageUrlInput] = useState('');
  const [sizeAllocationsInput, setSizeAllocationsInput] = useState('');
  const [editSizeAllocationsInput, setEditSizeAllocationsInput] = useState('');
  const [cartQuantityDraft, setCartQuantityDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (me) {
      setOrderForm((prev) => ({
        ...prev,
        customerName: prev.customerName || me.displayName || me.name || '',
        customerPhone: prev.customerPhone || me.phone || '',
      }));
    }
  }, [me]);

  useEffect(() => {
    if (!selectedItemId || !items.length) return;
    const nextItem = items.find((item: any) => String(item._id) === selectedItemId);
    if (nextItem) {
      setSelectedItem(nextItem);
      setActiveTab('shop');
    }
  }, [items, selectedItemId]);

  const pendingCount = useMemo(() => orders.filter((o: any) => ['submitted', 'received', 'availability_confirmed', 'payment_proof_submitted', 'payment_confirmed'].includes(o.status)).length, [orders]);
  const cartTotal = useMemo(() => [...merchandiseCart, ...partsCart].reduce((sum: number, item: any) => sum + Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0), 0), [merchandiseCart, partsCart]);
  const itemTotals = useMemo(() => ({
    available: items.filter((item: any) => item.isAvailable).length,
    totalStock: items.reduce((sum: number, item: any) => sum + Number(item.stockQuantity ?? 0), 0),
  }), [items]);
  const filteredItems = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const categoryFilter = selectedCategory.trim().toLowerCase();
    return items.filter((item: any) => {
      const title = String(item.title ?? '').toLowerCase();
      const description = String(item.description ?? '').toLowerCase();
      const sku = String(item.sku ?? '').toLowerCase();
      const category = String(item.category ?? '').toLowerCase();
      const matchesQuery = !query || title.includes(query) || description.includes(query) || sku.includes(query) || category.includes(query);
      const matchesCategory = !categoryFilter || category === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [items, searchText, selectedCategory]);
  const availableMerchandise = useMemo(() => filteredItems.filter((item: any) => item.isAvailable), [filteredItems]);
  const invoiceOrders = useMemo(() => orders.filter((order: any) => order.invoiceNumber || order.invoiceSentAt), [orders]);

  const shareMerchandiseItem = useCallback(async (item: any) => {
    const shareUrl = getMerchandiseShareUrl(String(item?._id ?? ''));
    const message = `${item?.title ?? 'Merchandise item'}\n\nOpen in the app to view this item: ${shareUrl}`;
    try {
      await sharePayload({ title: item?.title ?? 'Merchandise', message, url: shareUrl });
    } catch {
      Alert.alert('Share', shareUrl);
    }
  }, []);

  const handleImageLoad = useCallback((key: string, width?: number, height?: number) => {
    const ratio = getImageRatio({ width, height });
    setImageRatios((prev) => (prev[key] === ratio ? prev : { ...prev, [key]: ratio }));
  }, []);

  const closeOpenPanels = useCallback(() => {
    setSelectedItem(null);
    setShowAdd(false);
    setShowEdit(false);
    setEditingItem(null);
    setEditSizeAllocationsInput('');
    setEditingItemImages([]);
    setEditingItemImageStorageIds([]);
  }, []);

  const handleBackPress = useCallback(() => {
    if (selectedItem) {
      setSelectedItem(null);
      return;
    }
    if (showAdd || showEdit) {
      closeOpenPanels();
      return;
    }
    navigation.goBack();
  }, [closeOpenPanels, navigation, selectedItem, showAdd, showEdit]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!selectedItem && !showAdd && !showEdit) return;
      e.preventDefault();
      closeOpenPanels();
    });
    return unsubscribe;
  }, [closeOpenPanels, navigation, selectedItem, showAdd, showEdit]);

  useEffect(() => {
    const storageIds = new Set<string>();
    for (const item of items as any[]) {
      for (const storageId of Array.isArray(item?.imageStorageIds) ? item.imageStorageIds : []) {
        if (storageId) storageIds.add(String(storageId));
      }
    }
    for (const storageId of Array.isArray(editingItem?.imageStorageIds) ? editingItem.imageStorageIds : []) {
      if (storageId) storageIds.add(String(storageId));
    }

    const unresolved = [...storageIds].filter((storageId) => !resolvedStorageUrls[storageId]);
    if (!unresolved.length) return;

    let cancelled = false;
    void Promise.all(unresolved.map(async (storageId) => {
      try {
        const url = await resolveUploadedImage({ storageId: storageId as any });
        if (!cancelled && url) {
          setResolvedStorageUrls((prev) => (prev[storageId] ? prev : { ...prev, [storageId]: url }));
        }
      } catch {
        // keep silent; item may already have resolved URLs
      }
    }));

    return () => {
      cancelled = true;
    };
  }, [items, editingItem, resolveUploadedImage, resolvedStorageUrls]);

  useEffect(() => {
    const imageUrls = new Set<string>();
    for (const item of items as any[]) {
      for (const url of collectMerchandiseImageUrls(item)) imageUrls.add(url);
    }
    for (const url of itemImages) imageUrls.add(url);
    for (const url of editingItemImages) imageUrls.add(url);
    if (selectedItem) {
      for (const url of collectMerchandiseImageUrls(selectedItem)) imageUrls.add(url);
    }

    const uncached = [...imageUrls].filter((url) => !imageRatios[url]);
    if (!uncached.length) return;

    let cancelled = false;
    uncached.forEach((url) => {
      Image.getSize(
        url,
        (width, height) => {
          if (!cancelled && width && height) {
            handleImageLoad(url, width, height);
          }
        },
        () => {
          if (!cancelled && !imageRatios[url]) {
            setImageRatios((prev) => (prev[url] ? prev : { ...prev, [url]: 1.25 }));
          }
        }
      );
    });

    return () => {
      cancelled = true;
    };
  }, [items, itemImages, editingItemImages, selectedItem, imageRatios, handleImageLoad]);

  const handleImageUpload = useCallback(async (picked: PendingImage): Promise<UploadedImage> => {
    const uploadUrl = await generateUploadUrl({});
    let responseBody = '';
    if (Platform.OS === 'web') {
      const file = await (globalThis as any).fetch(picked.uri).then((r: any) => r.blob());
      const response = await (globalThis as any).fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': picked.mimeType }, body: file });
      responseBody = await response.text();
    } else {
      const { uploadAsync, FileSystemUploadType } = await import('expo-file-system');
      const response = await uploadAsync(uploadUrl, picked.uri, {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': picked.mimeType },
      });
      responseBody = String((response as any).body ?? '');
    }

    let storageId = '';
    try {
      const parsed = JSON.parse(responseBody);
      storageId = parsed.storageId || parsed.id || '';
    } catch {
      storageId = responseBody.trim();
    }
    if (!storageId) throw new Error('Failed to upload image');
    const url = await resolveUploadedImage({ storageId: storageId as any });
    if (!url) throw new Error('Failed to resolve uploaded image');
    return { storageId, url };
  }, [generateUploadUrl, resolveUploadedImage]);

  const pickMerchandiseImages = useCallback(async () => {
    const pickedAssets: PendingImage[] = [];
    if (Platform.OS === 'web') {
      const files = await new Promise<File[] | null>((resolve) => {
        const input = (globalThis as any).document?.createElement('input');
        if (!input) {
          resolve(null);
          return;
        }
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = () => resolve(input.files ? Array.from(input.files) : []);
        input.click();
      });
      if (!files?.length) return [];
      files.forEach((file) => {
        pickedAssets.push({ uri: globalThis.URL.createObjectURL(file), name: file.name, mimeType: file.type || 'image/jpeg' });
      });
    } else {
      const DocumentPicker: any = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return [];
      result.assets.forEach((asset: any, index: number) => {
        pickedAssets.push({
          uri: asset.uri,
          name: asset.name || asset.fileName || `Image ${index + 1}`,
          mimeType: asset.mimeType || 'image/jpeg',
        });
      });
    }

    if (!pickedAssets.length) return [];
    setBusy(true);
    try {
      const uploaded = await Promise.all(pickedAssets.map(async (asset, index) => {
        return handleImageUpload({ ...asset, name: asset.name ?? `merch-${Date.now()}-${index}.jpg` });
      }));
      return uploaded.filter((entry) => Boolean(entry?.url));
    } finally {
      setBusy(false);
    }
  }, [handleImageUpload]);

  const pickItemImages = async () => {
    try {
      const uploaded = await pickMerchandiseImages();
      if (!uploaded.length) return;
      setItemImages((prev: string[]) => [...prev, ...uploaded.map((entry: UploadedImage) => entry.url)]);
      setItemImageStorageIds((prev: string[]) => [...prev, ...uploaded.map((entry: UploadedImage) => entry.storageId)]);
    } catch (error: any) {
      Alert.alert('Upload failed', error?.message ?? 'Could not upload images');
    }
  };

  const pickEditingItemImages = async () => {
    try {
      const uploaded = await pickMerchandiseImages();
      if (!uploaded.length) return;
      setEditingItemImages((prev: string[]) => [...prev, ...uploaded.map((entry: UploadedImage) => entry.url)]);
      setEditingItemImageStorageIds((prev: string[]) => [...prev, ...uploaded.map((entry: UploadedImage) => entry.storageId)]);
    } catch (error: any) {
      Alert.alert('Upload failed', error?.message ?? 'Could not upload images');
    }
  };

  const addImageFromUrl = () => {
    const url = itemImageUrlInput.trim();
    if (!url) return;
    setItemImages((prev) => [...prev, url]);
    setItemImageUrlInput('');
  };

  const pickProofFiles = async () => {
    try {
      setProofBusy(true);
      const DocumentPicker: any = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
      if (result.canceled || !result.assets?.length) return;
      const uploaded = await Promise.all(result.assets.map(async (asset: any) => {
        const mimeType = asset.mimeType ?? 'application/octet-stream';
        const uploadedFile = await handleImageUpload({ uri: asset.uri, name: asset.name ?? 'Proof', mimeType });
        return { ...uploadedFile, name: asset.name ?? 'Proof', mimeType };
      }));
      setProofFiles((prev) => [...prev, ...uploaded]);
    } catch (error: any) {
      Alert.alert('Proof upload failed', error?.message ?? 'Could not attach proof of payment');
    } finally {
      setProofBusy(false);
    }
  };

  const pickQuoteFiles = async (orderId: string) => {
    try {
      setBusy(true);
      setQuoteOrderId(orderId);
      const DocumentPicker: any = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return [];
      result.assets.forEach((asset: any, index: number) => {
        pickedAssets.push({
          uri: asset.uri,
          name: asset.name || `Image ${index + 1}`,
          mimeType: asset.mimeType || 'image/jpeg',
        });
      });
    } catch (error: any) {
      Alert.alert('Quote upload failed', error?.message ?? 'Could not attach quote or invoice');
    } finally {
      setBusy(false);
    }
  };

  const sendQuote = async (order: any) => {
    if (!quoteFiles.length) {
      Alert.alert('Quote required', 'Please upload the quote or invoice before sending it.');
      return;
    }
    try {
      setBusy(true);
      await confirmAvailability({
        orderId: order._id,
        bankingDetails: order.bankingDetails || 'Banking details pending',
        deliveryFee: Number(order.deliveryFee ?? 0),
        quoteAttachmentStorageIds: quoteFiles.map((file) => file.storageId as any),
        quoteAttachmentNames: quoteFiles.map((file) => file.name),
      });
      setQuoteFiles([]);
      setQuoteOrderId(null);
    } catch (error: any) {
      Alert.alert('Send failed', error?.message ?? 'Could not send the quote');
    } finally {
      setBusy(false);
    }
  };

  const createItem = async () => {
    if (!itemForm.title.trim() || !itemForm.price.trim()) return;
    setBusy(true);
    try {
      const sizeAllocations = parseSizeAllocations(sizeAllocationsInput);
      const stockQuantity = sizeAllocations.length > 0 ? sizeAllocations.reduce((sum, entry) => sum + entry.quantity, 0) : Number(itemForm.stockQuantity) || 1;
      if (selectedCategoryDraft.trim()) {
        await createCategory({ brand, name: selectedCategoryDraft.trim() });
      }
      await addItem({
        brand,
        title: itemForm.title.trim(),
        description: itemForm.description.trim() || undefined,
        category: itemForm.category.trim() || selectedCategoryDraft.trim() || undefined,
        sku: itemForm.sku.trim() || undefined,
        price: Number(itemForm.price),
        stockQuantity,
        isVisibleToCustomers: itemVisibleToCustomers,
        sizeAllocations: sizeAllocations.length > 0 ? sizeAllocations : undefined,
        imageUrls: itemImages.length ? itemImages : undefined,
        imageStorageIds: itemImageStorageIds.length ? (itemImageStorageIds as any) : undefined,
      });
      setShowAdd(false);
      setItemForm({ title: '', description: '', category: '', sku: '', price: '', stockQuantity: '1' });
      setSelectedCategoryDraft('');
      setItemImages([]);
      setItemImageStorageIds([]);
      setItemImageUrlInput('');
      setSizeAllocationsInput('');
      setItemVisibleToCustomers(false);
    } catch (error: any) {
      Alert.alert('Save failed', error?.message ?? 'Could not save merchandise item');
    } finally {
      setBusy(false);
    }
  };

  const saveItem = async () => {
    if (!editingItem) return;
    setBusy(true);
    try {
      const sizeAllocations = parseSizeAllocations(editSizeAllocationsInput);
      const stockQuantity = sizeAllocations.length > 0 ? sizeAllocations.reduce((sum, entry) => sum + entry.quantity, 0) : Number(editingItem.stockQuantity ?? 1);
      await updateItem({
        itemId: editingItem._id,
        brand,
        title: editingItem.title,
        description: editingItem.description ?? undefined,
        category: editingItem.category ?? undefined,
        sku: editingItem.sku ?? undefined,
        price: Number(editingItem.price ?? 0),
        stockQuantity,
        isVisibleToCustomers: editingItemVisibleToCustomers,
        sizeAllocations: sizeAllocations.length > 0 ? sizeAllocations : undefined,
        imageUrls: editingItemImages.length ? editingItemImages : (editingItem.imageUrls ?? []),
        imageStorageIds: editingItemImageStorageIds.length ? (editingItemImageStorageIds as any) : undefined,
      });
      setShowEdit(false);
      setEditingItem(null);
      setEditSizeAllocationsInput('');
      setEditingItemImages([]);
      setEditingItemImageStorageIds([]);
      setEditingItemVisibleToCustomers(false);
    } catch (error: any) {
      Alert.alert('Update failed', error?.message ?? 'Could not update merchandise item');
    } finally {
      setBusy(false);
    }
  };

  const addCurrentItemToCart = async (item: any) => {
    setBusy(true);
    try {
      await addToCart({
        cartType: 'merchandise',
        brand,
        merchandiseItemId: item._id,
        title: item.title,
        description: item.description,
        sku: item.sku,
        unitPrice: Number(item.price ?? 0),
        quantity: 1,
        fulfillmentType: orderForm.fulfillmentType,
        deliveryAddress: orderForm.deliveryAddress.trim() || undefined,
        contactPreference: orderForm.contactPreference,
        notes: orderForm.notes.trim() || undefined,
        imageUrls: item.imageUrls,
      });
      setActiveTab('cart');
    } catch (error: any) {
      Alert.alert('Cart failed', error?.message ?? 'Could not add item to cart');
    } finally {
      setBusy(false);
    }
  };

  const placeOrder = async () => {
    if (!selectedItem) return;
    if (orderForm.fulfillmentType === 'delivery' && !orderForm.deliveryAddress.trim()) {
      Alert.alert('Delivery address required', 'Please enter a delivery address.');
      return;
    }
    setBusy(true);
    try {
      await submitOrder({
        merchandiseItemId: selectedItem._id,
        quantity: Number(orderForm.quantity) || 1,
        fulfillmentType: orderForm.fulfillmentType,
        deliveryAddress: orderForm.fulfillmentType === 'delivery' ? orderForm.deliveryAddress.trim() : undefined,
        contactPreference: orderForm.contactPreference,
        notes: orderForm.notes.trim() || undefined,
        customerName: orderForm.customerName.trim(),
        customerPhone: orderForm.customerPhone.trim(),
      });
      setSelectedItem(null);
      setProofFiles([]);
      setOrderForm((prev) => ({ ...prev, quantity: '1', deliveryAddress: '', notes: '' }));
      Alert.alert('Order submitted', 'Your merchandise order has been sent to the dealership.');
    } catch (error: any) {
      Alert.alert('Order failed', error?.message ?? 'Could not place merchandise order');
    } finally {
      setBusy(false);
    }
  };

  const checkoutSelectedCart = async () => {
    setBusy(true);
    try {
      if (selectedCartSection === 'parts') {
        await checkoutPartsCart({
          customerName: orderForm.customerName.trim(),
          customerPhone: orderForm.customerPhone.trim(),
        });
      } else {
        await checkoutCart({
          cartType: 'merchandise',
          customerName: orderForm.customerName.trim(),
          customerPhone: orderForm.customerPhone.trim(),
        });
      }
      await clearCart({ cartType: selectedCartSection });
      Alert.alert('Checkout complete', 'Your order was submitted and will be invoiced after availability is confirmed.');
    } catch (error: any) {
      Alert.alert('Checkout failed', error?.message ?? 'Could not place order');
    } finally {
      setBusy(false);
    }
  };

  const updateCartQuantity = async (item: any, quantityText: string) => {
    setCartQuantityDraft((prev) => ({ ...prev, [String(item._id)]: quantityText }));
    const quantity = Number(quantityText);
    if (!Number.isFinite(quantity) || quantity < 1) return;
    await updateCartItem({ cartItemId: item._id, quantity });
  };

  const sendProof = async (order: any) => {
    if (!proofFiles.length) {
      Alert.alert('Proof required', 'Please attach proof of payment first.');
      return;
    }
    setBusy(true);
    try {
      await submitPaymentProof({
        orderId: order._id,
        storageIds: proofFiles.map((file) => file.storageId as any),
        names: proofFiles.map((file) => file.name),
        mimeTypes: proofFiles.map((file) => file.mimeType),
      });
      setProofFiles([]);
      Alert.alert('Sent', 'Payment proof uploaded.');
    } catch (error: any) {
      Alert.alert('Upload failed', error?.message ?? 'Could not submit proof');
    } finally {
      setBusy(false);
    }
  };

  const renderItem = (item: any) => {
    const imageUrls = collectMerchandiseImageUrls(item).concat(
      ...(Array.isArray(item?.imageStorageIds) ? item.imageStorageIds.map((storageId: string) => resolvedStorageUrls[String(storageId)]).filter(Boolean) : [])
    );
    const heroImageUrl = imageUrls[0];
    const heroRatio = heroImageUrl ? imageRatios[heroImageUrl] ?? 1.25 : 1.25;
    const isUnavailable = !item.isAvailable || Number(item.stockQuantity ?? 0) <= 0;
    return (
      <TouchableOpacity key={item._id} style={styles.card} onPress={() => setSelectedItem(item)} activeOpacity={0.9}>
        {heroImageUrl ? (
          <View style={[styles.imageFrame, { aspectRatio: heroRatio }]}> 
            <Image
              source={{ uri: heroImageUrl }}
              style={styles.image}
              resizeMode="contain"
              onLoad={(event: any) => {
                const source = event?.nativeEvent?.source;
                if (source?.width && source?.height) {
                  handleImageLoad(heroImageUrl, source.width, source.height);
                }
              }}
            />
          </View>
        ) : (
          <View style={[styles.imageFrame, styles.imagePlaceholder, { aspectRatio: 1.25 }]}> 
            <Ionicons name="pricetag-outline" size={36} color={colors.primary} />
            <Text style={styles.placeholderText}>No photo yet</Text>
          </View>
        )}
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardBrand}>{item.brand}</Text>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDesc} numberOfLines={2}>{item.description || 'No description added yet.'}</Text>
            </View>
            <View style={styles.cardStatusStack}>
              <View style={styles.priceChip}><Text style={styles.priceText}>{formatMoney(item.price)}</Text></View>
              {isUnavailable ? <View style={styles.outOfStockChip}><Text style={styles.outOfStockText}>Out of stock</Text></View> : null}
            </View>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaChip}><Text style={styles.metaText}>Stock {item.stockQuantity}</Text></View>
            {item.sku ? <View style={styles.metaChip}><Text style={styles.metaText}>{item.sku}</Text></View> : null}
            {item.category ? <View style={styles.metaChip}><Text style={styles.metaText}>{item.category}</Text></View> : null}
          </View>
          {item.sizeAllocations?.length ? (
            <View style={styles.sizeRow}>
              {item.sizeAllocations.map((entry: any) => (
                <View key={`${item._id}-${entry.size}`} style={styles.sizeChip}>
                  <Text style={styles.sizeChipText}>{entry.size} • {entry.quantity} in stock</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setSelectedItem(item)} disabled={isUnavailable}>
              <Text style={styles.primaryBtnText}>{isUnavailable ? 'Unavailable' : 'Buy now'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => void addCurrentItemToCart(item)} disabled={isUnavailable}>
              <Text style={styles.secondaryBtnText}>{isUnavailable ? 'Out of stock' : 'Add to cart'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => void shareMerchandiseItem(item)}>
              <Text style={styles.secondaryBtnText}>Share</Text>
            </TouchableOpacity>
            {showStaffTools ? (
              <>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => { setEditingItem(item); setEditSizeAllocationsInput(formatSizeAllocations(item.sizeAllocations)); setEditingItemImages(collectMerchandiseImageUrls(item)); setShowEdit(true); }}>
                  <Text style={styles.secondaryBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtnDanger} onPress={async () => { await removeItem({ itemId: item._id }); }}>
                  <Text style={styles.secondaryBtnDangerText}>Delete</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderOrder = (order: any) => {
    const canStaff = showStaffTools;
    return (
      <TouchableOpacity key={order._id} style={styles.orderCard} onPress={() => setExpandedOrderId(expandedOrderId === order._id ? null : order._id)}>
        <View style={styles.orderHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderTitle}>{order.itemTitle}</Text>
            <Text style={styles.orderSubtitle}>{order.brand} • {formatMoney(order.totalAmount)}</Text>
          </View>
          <View style={styles.orderStatusPill}><Text style={styles.orderStatusText}>{String(order.status ?? 'submitted').replace(/_/g, ' ')}</Text></View>
        </View>
        <View style={styles.orderMetaRow}>
          <View style={styles.metaChip}><Text style={styles.metaText}>Qty {order.quantity}</Text></View>
          <View style={styles.metaChip}><Text style={styles.metaText}>{order.fulfillmentType === 'delivery' ? 'Delivery' : 'Collection'}</Text></View>
          {order.invoiceNumber ? <View style={styles.metaChip}><Text style={styles.metaText}>Invoice {order.invoiceNumber}</Text></View> : null}
        </View>
        <View style={styles.workflowRow}>
          {ORDER_STAGES.map((stage, index) => {
            const done = getWorkflowStageState(order.status, index);
            return (
              <View key={stage} style={[styles.workflowChip, done && styles.workflowChipActive]}>
                <Text style={[styles.workflowText, done && styles.workflowTextActive]}>{stage}</Text>
              </View>
            );
          })}
        </View>
        {expandedOrderId === order._id ? (
          <View style={styles.orderDetailBlock}>
            <Text style={styles.orderLabel}>Customer</Text>
            <Text style={styles.orderValue}>{order.customerName}</Text>
            <Text style={styles.orderValue}>{order.customerPhone}</Text>
            <Text style={styles.orderLabel}>Banking details</Text>
            <Text style={styles.orderValue}>{order.bankingDetails || 'Pending staff invoice'}</Text>
            <Text style={styles.orderLabel}>Invoice</Text>
            <Text style={styles.orderValue}>{order.invoiceNumber || 'Not sent yet'}</Text>
            <Text style={styles.orderValue}>{order.companyDetails || 'Company details pending'}</Text>
            {order.subtotalAmount !== undefined ? <Text style={styles.orderValue}>Subtotal: {formatMoney(order.subtotalAmount)}</Text> : null}
            {order.deliveryFee !== undefined ? <Text style={styles.orderValue}>Delivery fee: {formatMoney(order.deliveryFee)}</Text> : null}
            <Text style={styles.orderValue}>Total: {formatMoney(order.totalAmount)}</Text>
            {order.deliveryAddress ? <Text style={styles.orderValue}>Deliver to: {order.deliveryAddress}</Text> : null}
            {order.paymentProofSubmittedAt ? <Text style={styles.orderValue}>Proof uploaded: {new Date(order.paymentProofSubmittedAt).toLocaleString()}</Text> : null}
          </View>
        ) : null}
        <View style={styles.orderActionRow}>
          {canStaff && order.status === 'submitted' ? <TouchableOpacity style={styles.staffBtn} onPress={() => receiveOrder({ orderId: order._id })}><Text style={styles.staffBtnText}>Receive</Text></TouchableOpacity> : null}
          {canStaff && order.status === 'received' ? (
            <View style={styles.actionPanel}>
              <Text style={styles.actionPanelTitle}>Quote / invoice</Text>
              <Text style={styles.actionPanelText}>Upload the quote or invoice first, then send it with banking details.</Text>
              <View style={styles.actionButtonRow}>
                <TouchableOpacity style={styles.staffBtnSecondary} onPress={() => void pickQuoteFiles(String(order._id))} disabled={busy && quoteOrderId === String(order._id)}>
                  <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                  <Text style={styles.staffBtnSecondaryText}>Upload document</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.staffBtn} onPress={() => void sendQuote(order)} disabled={busy || quoteOrderId !== String(order._id) || !quoteFiles.length}>
                  <Ionicons name="paper-plane-outline" size={16} color={colors.white} />
                  <Text style={styles.staffBtnText}>{busy ? 'Sending...' : 'Send quote + banking details'}</Text>
                </TouchableOpacity>
              </View>
              {quoteOrderId === String(order._id) && quoteFiles.length ? <Text style={styles.actionPanelHint}>{quoteFiles.length} file(s) ready to send</Text> : null}
            </View>
          ) : null}
          {!canStaff && order.status === 'availability_confirmed' ? (
            <View style={styles.actionPanel}>
              <Text style={styles.actionPanelTitle}>Proof of payment</Text>
              <Text style={styles.actionPanelText}>Upload your proof first, then send it to staff.</Text>
              <View style={styles.actionButtonRow}>
                <TouchableOpacity style={styles.staffBtnSecondary} onPress={pickProofFiles} disabled={proofBusy}>
                  <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                  <Text style={styles.staffBtnSecondaryText}>{proofBusy ? 'Uploading...' : 'Upload proof'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.staffBtn} onPress={() => void sendProof(order)} disabled={busy || proofBusy || !proofFiles.length}>
                  <Ionicons name="paper-plane-outline" size={16} color={colors.white} />
                  <Text style={styles.staffBtnText}>{busy ? 'Sending...' : 'Send proof of payment'}</Text>
                </TouchableOpacity>
              </View>
              {proofFiles.length ? <Text style={styles.actionPanelHint}>{proofFiles.length} proof file(s) ready</Text> : null}
            </View>
          ) : null}
          {canStaff && order.status === 'payment_confirmed' ? <TouchableOpacity style={styles.staffBtn} onPress={() => completeOrder({ orderId: order._id })}><Text style={styles.staffBtnText}>Mark complete</Text></TouchableOpacity> : null}
          {canStaff && order.status !== 'completed' ? <TouchableOpacity style={styles.staffBtnDanger} onPress={() => markUnavailable({ orderId: order._id })}><Text style={styles.staffBtnDangerText}>Unavailable</Text></TouchableOpacity> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderCartItem = (item: any) => (
    <View key={item._id} style={styles.cartCard}>
      <View style={styles.cartHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardDesc}>{formatMoney(item.unitPrice)} each</Text>
        </View>
        <TouchableOpacity style={styles.cartRemoveBtn} onPress={() => void removeCartItem({ cartItemId: item._id })}>
          <Ionicons name="trash-outline" size={16} color={colors.error} />
        </TouchableOpacity>
      </View>
      <View style={styles.cartMetaRow}>
        <View style={styles.metaChip}><Text style={styles.metaText}>{item.cartType}</Text></View>
        {item.fulfillmentType ? <View style={styles.metaChip}><Text style={styles.metaText}>{item.fulfillmentType}</Text></View> : null}
      </View>
      <TextInput
        value={cartQuantityDraft[item._id] ?? String(item.quantity ?? 1)}
        onChangeText={(text) => void updateCartQuantity(item, text)}
        style={styles.input}
        keyboardType="numeric"
        placeholder="Quantity"
        placeholderTextColor={colors.textLight}
      />
    </View>
  );

  const statsOrders = merchandiseStats?.recentOrders ?? [];
  const featuredImage = (item: any) => collectMerchandiseImageUrls(item)[0];

  return (
    <View style={styles.container}>
      <ImageBackground source={appBackgroundImage} style={styles.wallpaper} resizeMode="cover">
        <View style={styles.wallpaperOverlay} />
        <SafeAreaView edges={["top"]} style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackPress} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={colors.white} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{brand} Merchandise</Text>
              <Text style={styles.headerSubtitle}>{showStaffTools ? 'Manage stock, pricing, invoices, and customer orders' : 'Browse items, add to cart, and place customer orders'}</Text>
            </View>
            <View style={styles.headerBadge}><Text style={styles.headerBadgeValue}>{pendingCount}</Text><Text style={styles.headerBadgeLabel}>Open</Text></View>
          </View>
        </SafeAreaView>

        <View style={styles.tabRow}>
          {[
            { key: 'shop', label: 'Shop' },
            { key: 'cart', label: 'Cart' },
            { key: 'orders', label: 'Orders' },
            ...(showStaffTools ? [{ key: 'analytics', label: 'Analytics' }] : []),
          ].map((tab) => (
            <TouchableOpacity key={tab.key} style={[styles.tabChip, activeTab === tab.key && styles.tabChipActive]} onPress={() => setActiveTab(tab.key as any)}>
              <Text style={[styles.tabChipText, activeTab === tab.key && styles.tabChipTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {activeTab === 'shop' ? (
            <>
              <View style={styles.statsRow}>
                <View style={styles.statCard}><Text style={styles.statValue}>{items.length}</Text><Text style={styles.statLabel}>Items</Text></View>
                <View style={styles.statCard}><Text style={styles.statValue}>{itemTotals.available}</Text><Text style={styles.statLabel}>Available</Text></View>
                <View style={styles.statCard}><Text style={styles.statValue}>{itemTotals.totalStock}</Text><Text style={styles.statLabel}>Stock</Text></View>
                <View style={styles.statCard}><Text style={styles.statValue}>{orders.length}</Text><Text style={styles.statLabel}>Orders</Text></View>
              </View>

              <View style={styles.searchPanel}>
                <Text style={styles.orderLabel}>Search merchandise</Text>
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  style={styles.input}
                  placeholder="Search by name, SKU, category, or brand"
                  placeholderTextColor={colors.textLight}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                  <TouchableOpacity style={[styles.categoryChip, !selectedCategory && styles.categoryChipActive]} onPress={() => setSelectedCategory('')}>
                    <Text style={[styles.categoryChipText, !selectedCategory && styles.categoryChipTextActive]}>All</Text>
                  </TouchableOpacity>
                  {categories.map((category: any) => (
                    <TouchableOpacity key={category._id} style={[styles.categoryChip, selectedCategory === category.name && styles.categoryChipActive]} onPress={() => setSelectedCategory(category.name)}>
                      <Text style={[styles.categoryChipText, selectedCategory === category.name && styles.categoryChipTextActive]}>{category.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {!showStaffTools ? (
                <View style={styles.customerNotice}>
                  <Ionicons name="bag-outline" size={20} color={colors.primary} />
                  <Text style={styles.customerNoticeText}>Free nationwide shipping on orders above R700. Pay only after staff confirms availability and sends the invoice.</Text>
                </View>
              ) : null}

              <View style={styles.badgeStack}>
                <View style={styles.infoPill}><Text style={styles.infoPillText}>Easy 30 days returns</Text></View>
                <View style={styles.infoPill}><Text style={styles.infoPillText}>30 days money back guarantee</Text></View>
                <View style={styles.infoPill}><Text style={styles.infoPillText}>3-5 working days quick delivery nationwide</Text></View>
              </View>

              {showStaffTools ? (
                <TouchableOpacity style={styles.addBar} onPress={() => setShowAdd(true)}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <Text style={styles.addBarText}>Add merchandise item</Text>
                </TouchableOpacity>
              ) : null}

              {availableMerchandise.map(renderItem)}
            </>
          ) : null}

          {activeTab === 'cart' ? (
            <>
              <View style={styles.cartSwitchRow}>
                <TouchableOpacity style={[styles.segmentBtn, selectedCartSection === 'merchandise' && styles.segmentBtnActive]} onPress={() => setSelectedCartSection('merchandise')}>
                  <Text style={[styles.segmentText, selectedCartSection === 'merchandise' && styles.segmentTextActive]}>Merchandise cart</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.segmentBtn, selectedCartSection === 'parts' && styles.segmentBtnActive]} onPress={() => setSelectedCartSection('parts')}>
                  <Text style={[styles.segmentText, selectedCartSection === 'parts' && styles.segmentTextActive]}>Parts cart</Text>
                </TouchableOpacity>
              </View>

              {selectedCartSection === 'merchandise' ? merchandiseCart.map(renderCartItem) : partsCart.map(renderCartItem)}
              {!merchandiseCart.length && selectedCartSection === 'merchandise' ? <View style={styles.empty}><Text style={styles.emptyText}>No merchandise items in cart.</Text></View> : null}
              {!partsCart.length && selectedCartSection === 'parts' ? <View style={styles.empty}><Text style={styles.emptyText}>No parts items in cart.</Text></View> : null}

              <Text style={styles.orderLabel}>Customer name</Text>
              <TextInput value={orderForm.customerName} onChangeText={(text) => setOrderForm((prev) => ({ ...prev, customerName: text }))} style={styles.input} placeholder="Full name" placeholderTextColor={colors.textLight} />
              <Text style={styles.orderLabel}>Phone</Text>
              <TextInput value={orderForm.customerPhone} onChangeText={(text) => setOrderForm((prev) => ({ ...prev, customerPhone: text }))} style={styles.input} placeholder="Phone number" placeholderTextColor={colors.textLight} keyboardType="phone-pad" />
              {selectedCartSection === 'merchandise' ? (
                <>
                  <Text style={styles.orderLabel}>Fulfillment</Text>
                  <View style={styles.segmentRow}>{DELIVERY_TYPES.map((type) => <TouchableOpacity key={type.value} style={[styles.segmentBtn, orderForm.fulfillmentType === type.value && styles.segmentBtnActive]} onPress={() => setOrderForm((prev) => ({ ...prev, fulfillmentType: type.value }))}><Text style={[styles.segmentText, orderForm.fulfillmentType === type.value && styles.segmentTextActive]}>{type.label}</Text></TouchableOpacity>)}</View>
                  {orderForm.fulfillmentType === 'delivery' ? <TextInput value={orderForm.deliveryAddress} onChangeText={(text) => setOrderForm((prev) => ({ ...prev, deliveryAddress: text }))} style={styles.input} placeholder="Delivery address" placeholderTextColor={colors.textLight} /> : null}
                </>
              ) : null}
              <Text style={styles.orderLabel}>Notes</Text>
              <TextInput value={cartNote} onChangeText={setCartNote} style={[styles.input, styles.multilineInput]} placeholder="Optional notes for staff" placeholderTextColor={colors.textLight} multiline />
              <TouchableOpacity style={styles.primaryAction} onPress={() => void checkoutSelectedCart()} disabled={busy || ((selectedCartSection === 'merchandise' ? merchandiseCart : partsCart).length === 0)}>
                <Text style={styles.primaryActionText}>{busy ? 'Submitting...' : `Checkout ${selectedCartSection === 'parts' ? 'parts' : 'merchandise'} cart`}</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {activeTab === 'orders' ? (
            <>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>{showStaffTools ? 'Order management' : 'My orders'}</Text>
                <Text style={styles.sectionSub}>{orders.length} total</Text>
              </View>
              {orders.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>No orders yet.</Text></View> : orders.map(renderOrder)}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Invoice history</Text>
                <Text style={styles.sectionSub}>{invoiceOrders.length} sent</Text>
              </View>
              {invoiceOrders.map((order: any) => (
                <View key={`${order._id}-invoice`} style={styles.invoiceCard}>
                  <Text style={styles.orderTitle}>{order.itemTitle}</Text>
                  <Text style={styles.orderValue}>{order.invoiceNumber || 'Invoice sent'}</Text>
                  <Text style={styles.orderValue}>{order.companyDetails || 'Company details attached'}</Text>
                  <Text style={styles.orderValue}>Total {formatMoney(order.totalAmount)}</Text>
                </View>
              ))}
            </>
          ) : null}

          {activeTab === 'analytics' && showStaffTools ? (
            <View style={styles.invoiceCard}>
              <Text style={styles.sectionTitle}>Merchandise sales board</Text>
              <Text style={styles.orderValue}>{merchandiseStats?.totalOrders ?? 0} total orders • R {Number(merchandiseStats?.totalRevenue ?? 0).toLocaleString()}</Text>
              <Text style={styles.orderLabel}>Recent order history</Text>
              {statsOrders.map((order: any) => (
                <Text key={order.orderId} style={styles.orderValue}>{order.brand} • {order.title} • R {Number(order.totalAmount ?? 0).toLocaleString()}</Text>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <Modal visible={Boolean(selectedItem)} transparent animationType="slide" onRequestClose={() => setSelectedItem(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalEyebrow}>{selectedItem?.brand}</Text>
                  <Text style={styles.modalTitle}>{selectedItem?.title}</Text>
                  <Text style={styles.modalSub}>{formatMoney(selectedItem?.price ?? 0)}</Text>
                </View>
                <View style={styles.modalHeaderActions}>
                  <TouchableOpacity onPress={() => void shareMerchandiseItem(selectedItem)} style={styles.shareBtnSmall}>
                    <Ionicons name="share-social-outline" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSelectedItem(null)} style={styles.closeBtn}><Ionicons name="close" size={20} color={colors.text} /></TouchableOpacity>
                </View>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.orderLabel}>Order journey</Text>
                <View style={styles.workflowRow}>
                  {ORDER_STAGES.map((stage, index) => {
                    const done = getWorkflowStageState('submitted', index);
                    return (
                      <View key={stage} style={[styles.workflowChip, done && styles.workflowChipActive]}>
                        <Text style={[styles.workflowText, done && styles.workflowTextActive]}>{stage}</Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.workflowNote}>This is the exact same process used by staff: order received, quote with banking details, proof of payment, payment confirmation, then delivery or collection completed.</Text>
                {collectMerchandiseImageUrls(selectedItem).length ? (
                  <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.modalImageRow}>
                    {collectMerchandiseImageUrls(selectedItem).map((url: string, index: number) => {
                      const ratio = imageRatios[url] ?? 1.25;
                      return (
                        <View key={`${url}-${index}`} style={[styles.modalImageFrame, { aspectRatio: ratio }]}>
                          <Image
                            source={{ uri: url }}
                            style={styles.modalImage}
                            resizeMode="contain"
                            onLoad={(event: any) => {
                              const source = event?.nativeEvent?.source;
                              if (source?.width && source?.height) {
                                handleImageLoad(url, source.width, source.height);
                              }
                            }}
                          />
                        </View>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <View style={[styles.modalEmptyImage, styles.imagePlaceholder]}>
                    <Ionicons name="pricetag-outline" size={36} color={colors.primary} />
                    <Text style={styles.placeholderText}>No photo yet</Text>
                  </View>
                )}
                <Text style={styles.orderLabel}>Price</Text>
                <Text style={styles.modalPrice}>{formatMoney(selectedItem?.price ?? 0)}</Text>
                <Text style={styles.orderLabel}>Description</Text>
                <Text style={styles.orderValue}>{selectedItem?.description || 'No description available.'}</Text>
                <Text style={styles.orderLabel}>Quantity</Text>
                <TextInput value={orderForm.quantity} onChangeText={(text) => setOrderForm((prev) => ({ ...prev, quantity: text }))} style={styles.input} keyboardType="numeric" placeholder="1" placeholderTextColor={colors.textLight} />
                <Text style={styles.orderLabel}>Fulfillment</Text>
                <View style={styles.segmentRow}>{DELIVERY_TYPES.map((type) => <TouchableOpacity key={type.value} style={[styles.segmentBtn, orderForm.fulfillmentType === type.value && styles.segmentBtnActive]} onPress={() => setOrderForm((prev) => ({ ...prev, fulfillmentType: type.value }))}><Text style={[styles.segmentText, orderForm.fulfillmentType === type.value && styles.segmentTextActive]}>{type.label}</Text></TouchableOpacity>)}</View>
                {orderForm.fulfillmentType === 'delivery' ? <TextInput value={orderForm.deliveryAddress} onChangeText={(text) => setOrderForm((prev) => ({ ...prev, deliveryAddress: text }))} style={styles.input} placeholder="Delivery address" placeholderTextColor={colors.textLight} /> : null}
                <Text style={styles.orderLabel}>Customer name</Text>
                <TextInput value={orderForm.customerName} onChangeText={(text) => setOrderForm((prev) => ({ ...prev, customerName: text }))} style={styles.input} placeholder="Full name" placeholderTextColor={colors.textLight} />
                <Text style={styles.orderLabel}>Phone</Text>
                <TextInput value={orderForm.customerPhone} onChangeText={(text) => setOrderForm((prev) => ({ ...prev, customerPhone: text }))} style={styles.input} placeholder="Phone number" placeholderTextColor={colors.textLight} keyboardType="phone-pad" />
                <Text style={styles.orderLabel}>Preferred contact</Text>
                <TextInput value={orderForm.contactPreference} onChangeText={(text) => setOrderForm((prev) => ({ ...prev, contactPreference: text }))} style={styles.input} placeholder="App message" placeholderTextColor={colors.textLight} />
                <Text style={styles.orderLabel}>Notes</Text>
                <TextInput value={orderForm.notes} onChangeText={(text) => setOrderForm((prev) => ({ ...prev, notes: text }))} style={[styles.input, styles.multilineInput]} placeholder="Any extra notes" placeholderTextColor={colors.textLight} multiline />
                <TouchableOpacity style={[styles.primaryAction, busy && { opacity: 0.8 }]} onPress={() => void placeOrder()} disabled={busy}><Text style={styles.primaryActionText}>{busy ? 'Submitting...' : 'Place order'}</Text></TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add merchandise</Text>
                <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.closeBtn}><Ionicons name="close" size={20} color={colors.text} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.orderLabel}>Title</Text>
                <TextInput value={itemForm.title} onChangeText={(text) => setItemForm((prev) => ({ ...prev, title: text }))} style={styles.input} placeholder="Merchandise title" placeholderTextColor={colors.textLight} />
                <Text style={styles.orderLabel}>Description</Text>
                <TextInput value={itemForm.description} onChangeText={(text) => setItemForm((prev) => ({ ...prev, description: text }))} style={[styles.input, styles.multilineInput]} multiline placeholder="Describe the item" placeholderTextColor={colors.textLight} />
                <Text style={styles.orderLabel}>Category</Text>
                <TextInput value={itemForm.category} onChangeText={(text) => setItemForm((prev) => ({ ...prev, category: text }))} style={styles.input} placeholder="Apparel, accessories, collectibles..." placeholderTextColor={colors.textLight} />
                <Text style={styles.orderLabel}>Create category or brand label</Text>
                <TextInput value={selectedCategoryDraft} onChangeText={setSelectedCategoryDraft} style={styles.input} placeholder="e.g. Hoodies, Caps, Limited Edition" placeholderTextColor={colors.textLight} />
                <Text style={styles.orderLabel}>SKU</Text>
                <TextInput value={itemForm.sku} onChangeText={(text) => setItemForm((prev) => ({ ...prev, sku: text }))} style={styles.input} placeholder="SKU" placeholderTextColor={colors.textLight} />
                <Text style={styles.orderLabel}>Price</Text>
                <TextInput value={itemForm.price} onChangeText={(text) => setItemForm((prev) => ({ ...prev, price: text }))} style={styles.input} placeholder="0" placeholderTextColor={colors.textLight} keyboardType="numeric" />
                <Text style={styles.orderLabel}>Stock quantity</Text>
                <TextInput value={itemForm.stockQuantity} onChangeText={(text) => setItemForm((prev) => ({ ...prev, stockQuantity: text }))} style={styles.input} placeholder="1" placeholderTextColor={colors.textLight} keyboardType="numeric" />
                <View style={styles.publishRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderLabel}>Visible to customers</Text>
                    <Text style={styles.helperText}>Turn this on when the item is ready for the public shop.</Text>
                  </View>
                  <Switch value={itemVisibleToCustomers} onValueChange={setItemVisibleToCustomers} trackColor={{ false: colors.border, true: colors.primary + '60' }} thumbColor={itemVisibleToCustomers ? colors.primary : colors.textLight} />
                </View>
                <Text style={styles.orderLabel}>Size allocations</Text>
                <TextInput
                  value={sizeAllocationsInput}
                  onChangeText={setSizeAllocationsInput}
                  style={styles.input}
                  placeholder="S:2, M:3, L:1"
                  placeholderTextColor={colors.textLight}
                />
                <Text style={styles.helperText}>Use size:quantity pairs so staff and customers can see what is in stock.</Text>
                <Text style={styles.orderLabel}>Photos</Text>
                <View style={styles.imageActionRow}>
                  <TouchableOpacity style={styles.secondaryAction} onPress={pickItemImages}><Text style={styles.secondaryActionText}>Upload images</Text></TouchableOpacity>
                  <View style={styles.imageUrlRow}>
                    <TextInput value={itemImageUrlInput} onChangeText={setItemImageUrlInput} style={[styles.input, { flex: 1 }]} placeholder="Paste image URL" placeholderTextColor={colors.textLight} />
                    <TouchableOpacity style={styles.secondaryAction} onPress={addImageFromUrl}><Text style={styles.secondaryActionText}>Add</Text></TouchableOpacity>
                  </View>
                </View>
                {itemImages.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: spacing.sm }}>{itemImages.map((url, index) => <Image key={`${url}-${index}`} source={{ uri: url }} style={styles.thumb} />)}</ScrollView> : null}
                <TouchableOpacity style={styles.primaryAction} onPress={() => void createItem()} disabled={busy}><Text style={styles.primaryActionText}>{busy ? 'Saving...' : 'Save item'}</Text></TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={showEdit} transparent animationType="slide" onRequestClose={() => setShowEdit(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit merchandise</Text>
                <TouchableOpacity onPress={() => setShowEdit(false)} style={styles.closeBtn}><Ionicons name="close" size={20} color={colors.text} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.orderLabel}>Title</Text>
                <TextInput value={editingItem?.title ?? ''} onChangeText={(text) => setEditingItem((prev: any) => ({ ...prev, title: text }))} style={styles.input} placeholderTextColor={colors.textLight} />
                <Text style={styles.orderLabel}>Description</Text>
                <TextInput value={editingItem?.description ?? ''} onChangeText={(text) => setEditingItem((prev: any) => ({ ...prev, description: text }))} style={[styles.input, styles.multilineInput]} multiline placeholderTextColor={colors.textLight} />
                <Text style={styles.orderLabel}>Category</Text>
                <TextInput value={editingItem?.category ?? ''} onChangeText={(text) => setEditingItem((prev: any) => ({ ...prev, category: text }))} style={styles.input} placeholderTextColor={colors.textLight} />
                <Text style={styles.orderLabel}>SKU</Text>
                <TextInput value={editingItem?.sku ?? ''} onChangeText={(text) => setEditingItem((prev: any) => ({ ...prev, sku: text }))} style={styles.input} placeholderTextColor={colors.textLight} />
                <Text style={styles.orderLabel}>Price</Text>
                <TextInput value={String(editingItem?.price ?? '')} onChangeText={(text) => setEditingItem((prev: any) => ({ ...prev, price: text }))} style={styles.input} keyboardType="numeric" placeholderTextColor={colors.textLight} />
                <Text style={styles.orderLabel}>Stock quantity</Text>
                <TextInput value={String(editingItem?.stockQuantity ?? '')} onChangeText={(text) => setEditingItem((prev: any) => ({ ...prev, stockQuantity: text }))} style={styles.input} keyboardType="numeric" placeholderTextColor={colors.textLight} />
                <View style={styles.publishRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderLabel}>Visible to customers</Text>
                    <Text style={styles.helperText}>Hidden items stay in staff management only.</Text>
                  </View>
                  <Switch value={editingItemVisibleToCustomers} onValueChange={setEditingItemVisibleToCustomers} trackColor={{ false: colors.border, true: colors.primary + '60' }} thumbColor={editingItemVisibleToCustomers ? colors.primary : colors.textLight} />
                </View>
                <Text style={styles.orderLabel}>Size allocations</Text>
                <TextInput
                  value={editSizeAllocationsInput}
                  onChangeText={setEditSizeAllocationsInput}
                  style={styles.input}
                  placeholder="S:2, M:3, L:1"
                  placeholderTextColor={colors.textLight}
                />
                <Text style={styles.helperText}>Leave blank to use the stock quantity field only.</Text>
                <Text style={styles.orderLabel}>Photos</Text>
                <View style={styles.imageActionRow}>
                  <TouchableOpacity style={styles.secondaryAction} onPress={pickEditingItemImages}><Text style={styles.secondaryActionText}>Upload images</Text></TouchableOpacity>
                </View>
                {editingItemImages.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: spacing.sm }}>
                    {editingItemImages.map((url: string, index: number) => <Image key={`${url}-${index}`} source={{ uri: url }} style={styles.thumb} />)}
                  </ScrollView>
                ) : null}
                <TouchableOpacity style={styles.primaryAction} onPress={() => void saveItem()} disabled={busy}><Text style={styles.primaryActionText}>{busy ? 'Saving...' : 'Update item'}</Text></TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  wallpaper: { flex: 1 },
  wallpaperOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3, 8, 20, 0.22)' },
  safe: { flex: 1, backgroundColor: colors.primary },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, backgroundColor: colors.primary },
  backBtn: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.white },
  headerSubtitle: { marginTop: 2, fontSize: 12, color: colors.primaryLight, fontWeight: '500' },
  headerBadge: { minWidth: 72, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center' },
  headerBadgeValue: { color: colors.white, fontSize: 18, fontWeight: '900' },
  headerBadgeLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '700' },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.background },
  tabChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabChipText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  tabChipTextActive: { color: colors.white },
  content: { padding: spacing.lg, paddingBottom: 120 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 18, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight },
  statValue: { fontSize: 18, fontWeight: '900', color: colors.text },
  statLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '700', marginTop: 2 },
  customerNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceElevated, borderRadius: 20, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, marginBottom: spacing.md },
  customerNoticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  badgeStack: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  infoPill: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  infoPillText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  addBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.borderLight },
  addBarText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderLight, marginBottom: spacing.lg },
  imageScroll: { backgroundColor: colors.surfaceAlt },
  imageScrollContent: { alignItems: 'stretch' },
  imageFrame: { width: '100%', backgroundColor: colors.surfaceAlt },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surfaceAlt, gap: 8 },
  placeholderText: { fontSize: 12, color: colors.textLight },
  cardBody: { padding: spacing.lg },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardStatusStack: { alignItems: 'flex-end', gap: 8 },
  outOfStockChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.error + '10', borderColor: colors.error + '20' },
  outOfStockText: { fontSize: 11, fontWeight: '900', color: colors.error },
  cardBrand: { fontSize: 11, fontWeight: '900', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.7 },
  cardTitle: { fontSize: 18, fontWeight: '900', color: colors.text, marginTop: 3 },
  cardDesc: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  priceChip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.primary + '12', borderRadius: radius.full },
  priceText: { fontSize: 13, fontWeight: '900', color: colors.primary },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  sizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
  cartMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  metaChip: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.full },
  metaText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  sizeChip: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.primary + '12', borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary + '24' },
  sizeChipText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md, flexWrap: 'wrap' },
  primaryBtn: { flex: 1, minWidth: 110, backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 12, alignItems: 'center' },
  primaryBtnText: { fontSize: 13, fontWeight: '900', color: colors.white },
  secondaryBtn: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  secondaryBtnText: { fontSize: 12, fontWeight: '800', color: colors.text },
  secondaryBtnDanger: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: colors.error + '10', borderWidth: 1, borderColor: colors.error + '20' },
  secondaryBtnDangerText: { fontSize: 12, fontWeight: '800', color: colors.error },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  sectionSub: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 30 },
  emptyText: { fontSize: 13, color: colors.textSecondary },
  orderCard: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, marginBottom: spacing.md },
  orderHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  orderTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  orderSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontWeight: '700' },
  orderStatusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.primary + '12' },
  orderStatusText: { fontSize: 11, fontWeight: '900', color: colors.primary, textTransform: 'capitalize' },
  orderDetailBlock: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  orderLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', color: colors.textLight, marginTop: spacing.sm },
  orderValue: { marginTop: 4, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  helperText: { marginTop: 4, fontSize: 11, lineHeight: 16, color: colors.textLight },
  orderActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  staffBtn: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full },
  staffBtnText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  staffBtnDanger: { backgroundColor: colors.error + '10', borderWidth: 1, borderColor: colors.error + '20', paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full },
  staffBtnDangerText: { color: colors.error, fontSize: 12, fontWeight: '900' },
  actionPanel: { width: '100%', gap: 8, padding: spacing.md, borderRadius: 18, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  actionPanelTitle: { fontSize: 12, fontWeight: '900', color: colors.text, textTransform: 'uppercase' },
  actionPanelText: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  actionPanelHint: { fontSize: 11, fontWeight: '700', color: colors.textLight },
  actionButtonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  staffBtnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderLight },
  staffBtnSecondaryText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  cartCard: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, marginBottom: spacing.md },
  cartHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cartRemoveBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  cartSwitchRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  orderMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  workflowRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  workflowChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  workflowChipActive: { backgroundColor: colors.primary + '10', borderColor: colors.primary + '20' },
  workflowText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  workflowTextActive: { color: colors.primary },
  workflowNote: { marginTop: 12, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '88%' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  modalEyebrow: { fontSize: 11, fontWeight: '900', color: colors.textLight, textTransform: 'uppercase' },
  modalTitle: { fontSize: 20, fontWeight: '900', color: colors.text, marginTop: 2 },
  modalSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4, fontWeight: '700' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  modalImage: { width: '100%', height: '100%' },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 14, marginTop: 6 },
  multilineInput: { minHeight: 90, textAlignVertical: 'top' },
  segmentRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  segmentBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  segmentBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  segmentTextActive: { color: colors.white },
  primaryAction: { backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  primaryActionText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  secondaryAction: { backgroundColor: colors.surfaceAlt, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.borderLight },
  secondaryActionText: { color: colors.text, fontSize: 12, fontWeight: '900' },
  imageActionRow: { gap: 10, marginTop: 6 },
  imageUrlRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: 16, backgroundColor: colors.surfaceAlt },
  photoDraftCard: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  photoDraftLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  photoDraftRow: { gap: 8 },
  photoDraftThumb: {
    width: 104,
    height: 104,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  photoDraftImage: { width: '100%', height: '100%' },
  photoDraftRemoveBtn: { position: 'absolute', top: 6, right: 6 },
  photoDraftMainBtn: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: radius.full,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
  },
  photoDraftMainBtnText: { fontSize: 10, fontWeight: '900', color: colors.white },
  photoDraftMainBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  photoDraftMainBadgeText: { fontSize: 10, fontWeight: '900', color: colors.white },
  invoiceCard: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, marginBottom: spacing.md },
  searchPanel: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, marginBottom: spacing.md },
  categoryRow: { gap: 8, marginTop: spacing.sm },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },
  categoryChipTextActive: { color: colors.white },
  featuredBlock: { marginBottom: spacing.lg },
  featuredRow: { gap: 12, paddingRight: spacing.lg },
  featuredCard: { width: 160, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.borderLight, overflow: 'hidden' },
  featuredImage: { width: '100%', height: 110 },
  featuredBody: { paddingHorizontal: 10, paddingVertical: 10 },
  featuredBrand: { fontSize: 10, fontWeight: '900', color: colors.primary, textTransform: 'uppercase' },
  featuredTitle: { marginTop: 4, fontSize: 13, fontWeight: '800', color: colors.text },
  featuredPrice: { marginTop: 6, fontSize: 12, fontWeight: '900', color: colors.primary },
  modalPrice: { fontSize: 24, fontWeight: '900', color: colors.primary, marginTop: 2 },
  modalHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareBtnSmall: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '12' },
  modalEmptyImage: { height: 180, justifyContent: 'center', alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surfaceAlt, marginBottom: spacing.sm },
  modalImageRow: { alignItems: 'stretch' },
  publishRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: spacing.md },
});