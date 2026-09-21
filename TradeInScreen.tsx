import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, ImageBackground, Image, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

const appBackgroundImage: any = undefined;
const IMAGE_SLOTS = [
  { key: 'front', label: 'Front' },
  { key: 'back', label: 'Back' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
  { key: 'engine', label: 'Engine' },
  { key: 'interior', label: 'Interior' },
] as const;
const yesNo = ['Yes', 'No'] as const;
const STAFF_REVIEW_STATUSES = ['submitted', 'under_review', 'valued', 'contacted', 'closed'] as const;
const MAX_IMAGE_WIDTH = 1024;
const IMAGE_QUALITY = 0.55;

type PickedAsset = { uri: string; name?: string; mimeType?: string };
type SlotKey = (typeof IMAGE_SLOTS)[number]['key'];
type SlotUploadState = 'idle' | 'uploading' | 'done' | 'failed';

async function compressPickedImage(asset: PickedAsset): Promise<{ uri: string; mimeType: string; blob?: Blob }> {
  const normalizedMimeType = asset.mimeType && asset.mimeType.startsWith('image/') ? asset.mimeType : 'image/jpeg';
  if (Platform.OS === 'web') {
    const webFetch = (globalThis as any).fetch;
    const createObjectURL = (globalThis as any).URL?.createObjectURL;
    const revokeObjectURL = (globalThis as any).URL?.revokeObjectURL;
    const documentRef = (globalThis as any).document;
    const inputBlob = await webFetch(asset.uri).then((response: any) => response.blob());
    const objectUrl = createObjectURL(inputBlob);
    try {
      const image = await new Promise<any>((resolve, reject) => {
        const img = new (globalThis as any).Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = objectUrl;
      });
      const width = image.naturalWidth || image.width || MAX_IMAGE_WIDTH;
      const height = image.naturalHeight || image.height || MAX_IMAGE_WIDTH;
      const targetWidth = width > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH : width;
      const targetHeight = width > MAX_IMAGE_WIDTH ? Math.round((height * MAX_IMAGE_WIDTH) / width) : height;
      const canvas = documentRef.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Unable to compress image');
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
      const compressedBlob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((blob: Blob | null) => {
          if (!blob) return reject(new Error('Unable to compress image'));
          resolve(blob);
        }, 'image/jpeg', IMAGE_QUALITY);
      });
      return { uri: asset.uri, mimeType: 'image/jpeg', blob: compressedBlob };
    } finally {
      if (revokeObjectURL) revokeObjectURL(objectUrl);
    }
  }
  const ImageManipulator = await import('expo-image-manipulator');
  const manipulateAsync = (ImageManipulator as any).manipulateAsync ?? (ImageManipulator as any).default?.manipulateAsync;
  const SaveFormat = (ImageManipulator as any).SaveFormat ?? (ImageManipulator as any).default?.SaveFormat;
  if (typeof manipulateAsync !== 'function' || !SaveFormat) return { uri: asset.uri, mimeType: normalizedMimeType };
  const result = await manipulateAsync(asset.uri, [{ resize: { width: MAX_IMAGE_WIDTH } }], { compress: IMAGE_QUALITY, format: SaveFormat.JPEG });
  return { uri: result.uri, mimeType: 'image/jpeg' };
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount);
}

export default function TradeInScreen({ navigation, route }: any) {
  const me = useQuery(api.users.me);
  const profile = useQuery(api.customerProfiles.getMyProfile);
  const tradeInsQuery = useQuery(api.tradeIns.listMine);
  const staffTradeInsQuery = useQuery(api.tradeIns.listStaffInbox, { limit: 100 });
  const createTradeIn = useMutation(api.tradeIns.create);
  const updateTradeIn = useMutation(api.tradeIns.update);
  const emailToDepartment = useMutation(api.tradeIns.emailToDepartment);
  const generateUploadUrl = useMutation(api.tradeIns.generateUploadUrl);
  const uploadAndResolve = useMutation(api.tradeIns.uploadAndResolve);

  const tradeIns = useMemo(() => tradeInsQuery ?? [], [tradeInsQuery]);
  const staffTradeIns = useMemo(() => staffTradeInsQuery ?? [], [staffTradeInsQuery]);
  const role = String(me?.staffRole ?? me?.role ?? '').trim().toLowerCase();
  const isStaff = Boolean(me?.isOwner || me?.role === 'admin' || me?.accessLevel === 'full_access' || ['dp', 'regional', 'regional_manager', 'sales', 'sales_executive', 'sales_manager', 'service_advisor', 'service_manager'].includes(role));
  const staffMode = isStaff && (route?.name === 'TradeInSubmissions' || Boolean(route?.params?.staffInbox));

  const [busy, setBusy] = useState(false);
  const [emailingTradeInId, setEmailingTradeInId] = useState<string | null>(null);
  const [savingTradeInId, setSavingTradeInId] = useState<string | null>(null);
  const [selectedStaffTradeInId, setSelectedStaffTradeInId] = useState<string | null>(null);
  const [recentTradeInId, setRecentTradeInId] = useState<string | null>(null);
  const [purchaseIntent, setPurchaseIntent] = useState<'cash' | 'finance'>('cash');
  const [staffEdits, setStaffEdits] = useState<Record<string, { finalOfferAmount: string; status: string; staffNotes: string }>>({});
  const [form, setForm] = useState({
    firstName: '',
    surname: '',
    idNumber: '',
    contactDetails: '',
    vehicleName: '',
    yearModel: '',
    colour: '',
    spareKey: 'Yes',
    serviceHistory: 'Yes',
    reg: '',
    mileage: '',
    vin: '',
    engineNumber: '',
    underFinance: 'No',
    financedByBank: '',
    expectedValue: '',
  });
  const [imageSlots, setImageSlots] = useState<Record<SlotKey, { name: string; url: string; previewUrl?: string } | null>>({ front: null, back: null, left: null, right: null, engine: null, interior: null });
  const [slotUploadState, setSlotUploadState] = useState<Record<SlotKey, SlotUploadState>>({ front: 'idle', back: 'idle', left: 'idle', right: 'idle', engine: 'idle', interior: 'idle' });

  useEffect(() => {
    if (profile?.firstName && !form.firstName) setForm((prev) => ({ ...prev, firstName: profile.firstName ?? '' }));
    if (profile?.surname && !form.surname) setForm((prev) => ({ ...prev, surname: profile.surname ?? '' }));
    if (profile?.phone && !form.contactDetails) setForm((prev) => ({ ...prev, contactDetails: profile.phone ?? '' }));
  }, [profile, form.firstName, form.surname, form.contactDetails]);

  useEffect(() => {
    if (!selectedStaffTradeInId && staffTradeIns.length) setSelectedStaffTradeInId(String(staffTradeIns[0]._id));
  }, [staffTradeIns, selectedStaffTradeInId]);

  const latestValuedTradeIn = useMemo(() => tradeIns.find((item: any) => item.status === 'valued' && typeof item.finalOfferAmount === 'number') ?? null, [tradeIns]);
  const selectedStaffTradeIn = useMemo(() => {
    if (!staffTradeIns.length) return null;
    return staffTradeIns.find((item: any) => String(item._id) === String(selectedStaffTradeInId)) ?? staffTradeIns[0];
  }, [staffTradeIns, selectedStaffTradeInId]);
  const selectedDraft = selectedStaffTradeIn
    ? staffEdits[String(selectedStaffTradeIn._id)] ?? {
        finalOfferAmount: selectedStaffTradeIn.finalOfferAmount ? String(selectedStaffTradeIn.finalOfferAmount) : '',
        status: selectedStaffTradeIn.status ?? 'submitted',
        staffNotes: selectedStaffTradeIn.staffNotes ?? '',
      }
    : null;
  const visibleTradeIns = staffMode
    ? staffTradeIns
    : recentTradeInId
      ? [...tradeIns.filter((item: any) => String(item._id) !== String(recentTradeInId)), tradeIns.find((item: any) => String(item._id) === String(recentTradeInId))].filter(Boolean)
      : tradeIns;
  const completedImageCount = useMemo(() => Object.values(imageSlots).filter(Boolean).length, [imageSlots]);

  const uploadImageForSlot = useCallback(async (slot: SlotKey) => {
    try {
      setBusy(true);
      setSlotUploadState((prev) => ({ ...prev, [slot]: 'uploading' }));
      const DocumentPicker: any = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.length) {
        setSlotUploadState((prev) => ({ ...prev, [slot]: 'idle' }));
        return;
      }
      const asset = result.assets[0] as PickedAsset;
      setImageSlots((prev) => ({ ...prev, [slot]: { name: asset.name ?? `${slot}.jpg`, url: '', previewUrl: asset.uri } }));
      const compressed = await compressPickedImage(asset);
      const uploadUrl = await generateUploadUrl({});
      let responseBody = '';
      if (Platform.OS === 'web') {
        const body = compressed.blob ?? await (globalThis as any).fetch(asset.uri).then((response: any) => response.blob());
        const response = await (globalThis as any).fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': compressed.mimeType ?? asset.mimeType ?? 'image/jpeg' }, body });
        responseBody = await response.text();
      } else {
        const FileSystem = await import('expo-file-system');
        const response = await FileSystem.uploadAsync(uploadUrl, compressed.uri, { httpMethod: 'POST', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { 'Content-Type': compressed.mimeType ?? asset.mimeType ?? 'image/jpeg' } });
        responseBody = String((response as any).body ?? '');
      }
      let storageId = '';
      try {
        const parsed = JSON.parse(responseBody);
        storageId = parsed.storageId || parsed.id || '';
      } catch {
        storageId = responseBody.trim();
      }
      if (!storageId) throw new Error('Upload failed');
      const url = await uploadAndResolve({ storageId: storageId as any });
      setImageSlots((prev) => ({ ...prev, [slot]: { name: asset.name ?? `${slot}.jpg`, url, previewUrl: url } }));
      setSlotUploadState((prev) => ({ ...prev, [slot]: 'done' }));
    } catch (e: any) {
      setSlotUploadState((prev) => ({ ...prev, [slot]: 'failed' }));
      Alert.alert('Upload failed', e?.message ?? 'Could not upload vehicle image');
    } finally {
      setBusy(false);
    }
  }, [generateUploadUrl, uploadAndResolve]);

  const submitTradeIn = async () => {
    if (!form.firstName.trim() || !form.surname.trim() || !form.contactDetails.trim() || !form.vehicleName.trim() || !form.yearModel.trim() || !form.reg.trim() || !form.expectedValue.trim()) {
      Alert.alert('Missing details', 'Please complete the required trade-in details.');
      return;
    }
    if (Object.values(slotUploadState).some((status) => status === 'uploading')) {
      Alert.alert('Please wait', 'One or more photos are still uploading.');
      return;
    }
    const uploadedImages = IMAGE_SLOTS.map((slot) => imageSlots[slot.key]).filter((item): item is { name: string; url: string; previewUrl: string } => Boolean(item?.url));
    if (!uploadedImages.length) {
      Alert.alert('Photos required', 'Please upload at least one photo before submitting.');
      return;
    }
    try {
      setBusy(true);
      const result = await createTradeIn({
        customerProfileId: profile?._id ? String(profile._id) : undefined,
        firstName: form.firstName.trim(),
        surname: form.surname.trim(),
        idNumber: form.idNumber.trim(),
        contactDetails: form.contactDetails.trim(),
        vehicleName: form.vehicleName.trim(),
        yearModel: form.yearModel.trim(),
        colour: form.colour.trim(),
        spareKey: form.spareKey,
        serviceHistory: form.serviceHistory,
        reg: form.reg.trim(),
        mileage: form.mileage.trim(),
        vin: form.vin.trim(),
        engineNumber: form.engineNumber.trim(),
        underFinance: form.underFinance,
        financedByBank: form.underFinance === 'Yes' ? form.financedByBank.trim() || undefined : undefined,
        expectedValue: form.expectedValue.trim(),
        purchaseIntent,
        imageUrls: uploadedImages.map((img) => img.url),
        imageNames: uploadedImages.map((img) => img.name),
      });
      const tradeInId = String((result as any)?.tradeInId ?? '');
      if (tradeInId) setRecentTradeInId(tradeInId);
      Alert.alert('Submitted', 'Your trade-in has been submitted. Staff will review it and reply with a value.');
      if (purchaseIntent === 'finance' && tradeInId) navigation.navigate('FinanceApplication', { tradeInId });
    } catch (e: any) {
      Alert.alert('Trade-in failed', e?.message ?? 'Could not submit trade-in');
    } finally {
      setBusy(false);
    }
  };

  const saveTradeInReview = async (tradeInId: string) => {
    const draft = staffEdits[tradeInId];
    try {
      setSavingTradeInId(tradeInId);
      await updateTradeIn({
        tradeInId: tradeInId as any,
        status: draft?.finalOfferAmount ? 'valued' : (draft?.status as any) ?? 'under_review',
        finalOfferAmount: draft?.finalOfferAmount ? Number(draft.finalOfferAmount) : undefined,
        staffNotes: draft?.staffNotes?.trim() ? draft.staffNotes.trim() : undefined,
      });
      Alert.alert('Saved', 'The trade-in reply was sent to the customer.');
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Could not update the trade-in review');
    } finally {
      setSavingTradeInId(null);
    }
  };

  return (
    <View style={styles.container}>
      <ImageBackground source={appBackgroundImage} style={styles.wallpaper} resizeMode="cover">
        <View style={styles.wallpaperOverlay} />
        <SafeAreaView edges={['top']} style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color={colors.white} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{staffMode ? 'Submitted Trade-Ins' : 'Trade-In'}</Text>
              <Text style={styles.headerSubtitle}>{staffMode ? 'Review trade-ins and reply with a value.' : 'Submit your trade-in and get a staff valuation.'}</Text>
            </View>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>{staffMode ? 'Staff review' : 'Customer submit'}</Text>
            {!staffMode ? (
              <>
                {latestValuedTradeIn ? (
                  <View style={styles.valuationBubble}>
                    <View style={styles.valuationBubbleTopRow}>
                      <View style={styles.valuationBubbleIcon}><Ionicons name="pricetag" size={18} color={colors.primary} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.valuationBubbleLabel}>Trade-in value ready</Text>
                        <Text style={styles.valuationBubbleTitle}>{formatCurrency(latestValuedTradeIn.finalOfferAmount ?? 0)} for {latestValuedTradeIn.vehicleName}</Text>
                      </View>
                    </View>
                    <Text style={styles.valuationBubbleText}>Staff have reviewed your trade-in. You can now continue with finance or browse stock.</Text>
                    {latestValuedTradeIn.staffNotes ? <Text style={styles.valuationBubbleNote}>{latestValuedTradeIn.staffNotes}</Text> : null}
                    <View style={styles.valuationActionRow}>
                      <TouchableOpacity style={[styles.valuationActionBtn, styles.valuationActionBtnPrimary]} onPress={() => navigation.navigate('FinanceApplication', { tradeInId: String(latestValuedTradeIn._id) })}>
                        <Ionicons name="card-outline" size={16} color={colors.white} />
                        <Text style={styles.valuationActionBtnText}>Finance option</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.valuationActionBtn, styles.valuationActionBtnSecondary]} onPress={() => navigation.navigate('InventoryScreen')}>
                        <Ionicons name="car-sport-outline" size={16} color={colors.primary} />
                        <Text style={styles.valuationActionBtnSecondaryText}>Browse stock</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
                <Text style={styles.heroTitle}>Load your trade-in and request a valuation.</Text>
                <Text style={styles.heroText}>Fill in the form, upload vehicle photos, and staff will receive the submission to review and reply with a trade-in value.</Text>
              </>
            ) : (
              <>
                <Text style={styles.heroTitle}>Review submitted trade-ins and send an offer.</Text>
                <Text style={styles.heroText}>Open a submission, inspect the photos and details, then save the trade-in value so the customer can continue.</Text>
              </>
            )}
          </View>

          {!staffMode ? (
            <>
              {recentTradeInId ? (
                <View style={styles.submissionBanner}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.submissionBannerTitle}>Trade-in submitted</Text>
                    <Text style={styles.submissionBannerText}>Staff can now review the submission and send you an offer.</Text>
                  </View>
                </View>
              ) : null}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Customer submit</Text>
                <Text style={styles.helper}>Complete the form, upload the photos, then submit the trade-in.</Text>
                <View style={styles.segmentRow}>
                  {['cash', 'finance'].map((intent) => (
                    <TouchableOpacity key={intent} style={[styles.segmentBtn, purchaseIntent === intent && styles.segmentBtnActive]} onPress={() => setPurchaseIntent(intent as 'cash' | 'finance')}>
                      <Text style={[styles.segmentText, purchaseIntent === intent && styles.segmentTextActive]}>{intent === 'cash' ? 'Cash' : 'Finance'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.twoCol}>
                  <TextInput style={styles.input} value={form.firstName} onChangeText={(text) => setForm((prev) => ({ ...prev, firstName: text }))} placeholder="Name" placeholderTextColor={colors.textLight} />
                  <TextInput style={styles.input} value={form.surname} onChangeText={(text) => setForm((prev) => ({ ...prev, surname: text }))} placeholder="Surname" placeholderTextColor={colors.textLight} />
                </View>
                <TextInput style={styles.input} value={form.idNumber} onChangeText={(text) => setForm((prev) => ({ ...prev, idNumber: text }))} placeholder="ID No." placeholderTextColor={colors.textLight} />
                <TextInput style={styles.input} value={form.contactDetails} onChangeText={(text) => setForm((prev) => ({ ...prev, contactDetails: text }))} placeholder="Contact details" placeholderTextColor={colors.textLight} />
                <TextInput style={styles.input} value={form.vehicleName} onChangeText={(text) => setForm((prev) => ({ ...prev, vehicleName: text }))} placeholder="Vehicle name" placeholderTextColor={colors.textLight} />
                <View style={styles.twoCol}>
                  <TextInput style={styles.input} value={form.yearModel} onChangeText={(text) => setForm((prev) => ({ ...prev, yearModel: text }))} placeholder="Year model" placeholderTextColor={colors.textLight} />
                  <TextInput style={styles.input} value={form.colour} onChangeText={(text) => setForm((prev) => ({ ...prev, colour: text }))} placeholder="Colour" placeholderTextColor={colors.textLight} />
                </View>
                <View style={styles.twoCol}>
                  <View style={styles.choiceBox}>
                    <Text style={styles.choiceLabel}>Spare key</Text>
                    <View style={styles.choiceRow}>{yesNo.map((option) => <TouchableOpacity key={option} style={[styles.choiceBtn, form.spareKey === option && styles.choiceBtnActive]} onPress={() => setForm((prev) => ({ ...prev, spareKey: option }))}><Text style={[styles.choiceText, form.spareKey === option && styles.choiceTextActive]}>{option}</Text></TouchableOpacity>)}</View>
                  </View>
                  <View style={styles.choiceBox}>
                    <Text style={styles.choiceLabel}>Service history</Text>
                    <View style={styles.choiceRow}>{yesNo.map((option) => <TouchableOpacity key={option} style={[styles.choiceBtn, form.serviceHistory === option && styles.choiceBtnActive]} onPress={() => setForm((prev) => ({ ...prev, serviceHistory: option }))}><Text style={[styles.choiceText, form.serviceHistory === option && styles.choiceTextActive]}>{option}</Text></TouchableOpacity>)}</View>
                  </View>
                </View>
                <TextInput style={styles.input} value={form.reg} onChangeText={(text) => setForm((prev) => ({ ...prev, reg: text }))} placeholder="REG" placeholderTextColor={colors.textLight} />
                <TextInput style={styles.input} value={form.mileage} onChangeText={(text) => setForm((prev) => ({ ...prev, mileage: text }))} placeholder="Mileage" placeholderTextColor={colors.textLight} keyboardType="numeric" />
                <TextInput style={styles.input} value={form.vin} onChangeText={(text) => setForm((prev) => ({ ...prev, vin: text }))} placeholder="VIN" placeholderTextColor={colors.textLight} />
                <TextInput style={styles.input} value={form.engineNumber} onChangeText={(text) => setForm((prev) => ({ ...prev, engineNumber: text }))} placeholder="Engine no." placeholderTextColor={colors.textLight} />
                <View style={styles.choiceBox}>
                  <Text style={styles.choiceLabel}>Still under finance</Text>
                  <View style={styles.choiceRow}>{yesNo.map((option) => <TouchableOpacity key={option} style={[styles.choiceBtn, form.underFinance === option && styles.choiceBtnActive]} onPress={() => setForm((prev) => ({ ...prev, underFinance: option }))}><Text style={[styles.choiceText, form.underFinance === option && styles.choiceTextActive]}>{option}</Text></TouchableOpacity>)}</View>
                </View>
                {form.underFinance === 'Yes' ? <TextInput style={styles.input} value={form.financedByBank} onChangeText={(text) => setForm((prev) => ({ ...prev, financedByBank: text }))} placeholder="Financed by which bank?" placeholderTextColor={colors.textLight} /> : null}
                <TextInput style={styles.input} value={form.expectedValue} onChangeText={(text) => setForm((prev) => ({ ...prev, expectedValue: text }))} placeholder="Expected value" placeholderTextColor={colors.textLight} keyboardType="numeric" />
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Uploaded photos</Text>
                <Text style={styles.helper}>Use the photo slots so staff can review the vehicle properly.</Text>
                <View style={styles.slotGrid}>
                  {IMAGE_SLOTS.map((slot) => {
                    const uploaded = imageSlots[slot.key];
                    const uploadState = slotUploadState[slot.key];
                    const isUploading = uploadState === 'uploading';
                    const hasFailed = uploadState === 'failed';
                    const isDone = uploadState === 'done' && Boolean(uploaded);
                    return (
                      <TouchableOpacity key={slot.key} style={styles.slotCard} onPress={() => void uploadImageForSlot(slot.key)}>
                        {uploaded ? <Image source={{ uri: uploaded.previewUrl || uploaded.url }} style={styles.slotImage} resizeMode="cover" /> : <Ionicons name="camera-outline" size={24} color={colors.primary} />}
                        <View style={[styles.slotStateBadge, isDone && styles.slotStateBadgeSuccess, hasFailed && styles.slotStateBadgeFailure, isUploading && styles.slotStateBadgeUploading]}>
                          {isUploading ? <><ActivityIndicator size="small" color={colors.white} /><Text style={styles.slotStateText}>Uploading</Text></> : hasFailed ? <Text style={styles.slotStateText}>Retry</Text> : isDone ? <Text style={styles.slotStateText}>Uploaded</Text> : <Text style={styles.slotStateText}>Add photo</Text>}
                        </View>
                        <Text style={styles.slotLabel}>{slot.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.helper}>{completedImageCount}/6 photos uploaded</Text>
                {Object.values(slotUploadState).some((status) => status === 'failed') ? <Text style={[styles.helper, { color: colors.error, marginTop: 6 }]}>One or more uploads failed. Tap the photo slot again to retry.</Text> : null}
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={submitTradeIn} disabled={busy}>
                <Text style={styles.primaryBtnText}>{busy ? 'Submitting...' : 'Submit trade in'}</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {staffMode ? (
            <>
              <View style={styles.staffSectionCard}>
                <Text style={styles.sectionTitle}>Submitted Trade-Ins</Text>
                <Text style={styles.helper}>Choose a submitted trade-in, inspect the details and photos, and send a reply with value.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.staffPickerRow}>
                  {staffTradeIns.map((item: any) => {
                    const active = String(item._id) === String(selectedStaffTradeIn?._id);
                    const thumb = Array.isArray(item.imageUrls) ? item.imageUrls[0] : null;
                    return (
                      <TouchableOpacity key={item._id} style={[styles.staffPickerCard, active && styles.staffPickerCardActive]} onPress={() => setSelectedStaffTradeInId(String(item._id))}>
                        {thumb ? <Image source={{ uri: thumb }} style={styles.staffPickerThumb} /> : <View style={[styles.staffPickerThumb, styles.tradeInThumbPlaceholder]}><Ionicons name="image-outline" size={18} color={colors.textLight} /></View>}
                        <Text style={styles.staffPickerTitle} numberOfLines={1}>{item.firstName} {item.surname}</Text>
                        <Text style={styles.staffPickerMeta} numberOfLines={1}>{item.vehicleName}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {selectedStaffTradeIn && selectedDraft ? (
                <View style={styles.staffSectionCard}>
                  <Text style={styles.sectionTitle}>Selected submission</Text>
                  <Text style={styles.helper}>{selectedStaffTradeIn.firstName} {selectedStaffTradeIn.surname} � {selectedStaffTradeIn.contactDetails}</Text>
                  <Text style={styles.listMeta}>{selectedStaffTradeIn.vehicleName} � {selectedStaffTradeIn.yearModel} � Expected {selectedStaffTradeIn.expectedValue}</Text>
                  <View style={styles.staffDetailGrid}>
                    <View style={styles.staffDetailItem}><Text style={styles.staffDetailLabel}>ID number</Text><Text style={styles.staffDetailValue}>{selectedStaffTradeIn.idNumber || ''}</Text></View>
                    <View style={styles.staffDetailItem}><Text style={styles.staffDetailLabel}>Colour</Text><Text style={styles.staffDetailValue}>{selectedStaffTradeIn.colour || ''}</Text></View>
                    <View style={styles.staffDetailItem}><Text style={styles.staffDetailLabel}>Registration</Text><Text style={styles.staffDetailValue}>{selectedStaffTradeIn.reg || ''}</Text></View>
                    <View style={styles.staffDetailItem}><Text style={styles.staffDetailLabel}>Mileage</Text><Text style={styles.staffDetailValue}>{selectedStaffTradeIn.mileage || ''}</Text></View>
                    <View style={styles.staffDetailItem}><Text style={styles.staffDetailLabel}>VIN</Text><Text style={styles.staffDetailValue}>{selectedStaffTradeIn.vin || ''}</Text></View>
                    <View style={styles.staffDetailItem}><Text style={styles.staffDetailLabel}>Engine number</Text><Text style={styles.staffDetailValue}>{selectedStaffTradeIn.engineNumber || ''}</Text></View>
                    <View style={styles.staffDetailItem}><Text style={styles.staffDetailLabel}>Spare key</Text><Text style={styles.staffDetailValue}>{selectedStaffTradeIn.spareKey || ''}</Text></View>
                    <View style={styles.staffDetailItem}><Text style={styles.staffDetailLabel}>Service history</Text><Text style={styles.staffDetailValue}>{selectedStaffTradeIn.serviceHistory || ''}</Text></View>
                    <View style={styles.staffDetailItem}><Text style={styles.staffDetailLabel}>Under finance</Text><Text style={styles.staffDetailValue}>{selectedStaffTradeIn.underFinance || ''}</Text></View>
                    <View style={styles.staffDetailItem}><Text style={styles.staffDetailLabel}>Finance bank</Text><Text style={styles.staffDetailValue}>{selectedStaffTradeIn.financedByBank || ''}</Text></View>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbStrip}>
                    {(Array.isArray(selectedStaffTradeIn.imageUrls) ? selectedStaffTradeIn.imageUrls : []).map((url: string, index: number) => <Image key={`${selectedStaffTradeIn._id}-${index}`} source={{ uri: url }} style={styles.thumbStripImage} />)}
                  </ScrollView>
                  <Text style={[styles.helper, { marginTop: 8 }]}>Status: {selectedStaffTradeIn.status}</Text>
                </View>
              ) : null}

              {selectedStaffTradeIn && selectedDraft ? (
                <View style={styles.staffSectionCard}>
                  <Text style={styles.sectionTitle}>Staff valuation screen</Text>
                  <Text style={styles.helper}>Set the trade-in value, write notes, update status, and send the reply to the customer.</Text>
                  <View style={styles.reviewStatusRow}>
                    {STAFF_REVIEW_STATUSES.map((status) => {
                      const active = selectedDraft.status === status;
                      return (
                        <TouchableOpacity key={status} style={[styles.reviewStatusPill, active && styles.reviewStatusPillActive]} onPress={() => setStaffEdits((prev) => ({ ...prev, [String(selectedStaffTradeIn._id)]: { ...selectedDraft, status } }))}>
                          <Text style={[styles.reviewStatusText, active && styles.reviewStatusTextActive]}>{String(status).replace(/_/g, ' ')}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput style={styles.reviewInput} value={selectedDraft.finalOfferAmount} onChangeText={(text) => setStaffEdits((prev) => ({ ...prev, [String(selectedStaffTradeIn._id)]: { ...selectedDraft, finalOfferAmount: text } }))} placeholder="Trade-in value" placeholderTextColor={colors.textLight} keyboardType="numeric" />
                  <TextInput style={[styles.reviewInput, styles.reviewNotesInput]} value={selectedDraft.staffNotes} onChangeText={(text) => setStaffEdits((prev) => ({ ...prev, [String(selectedStaffTradeIn._id)]: { ...prev[String(selectedStaffTradeIn._id)], staffNotes: text, finalOfferAmount: prev[String(selectedStaffTradeIn._id)]?.finalOfferAmount ?? selectedDraft.finalOfferAmount, status: prev[String(selectedStaffTradeIn._id)]?.status ?? selectedDraft.status } }))} placeholder="Staff notes" placeholderTextColor={colors.textLight} multiline />
                  <View style={styles.reviewActionRow}>
                    <TouchableOpacity style={[styles.reviewActionBtn, styles.reviewActionBtnSecondary, emailingTradeInId === String(selectedStaffTradeIn._id) && styles.emailDeptBtnDisabled]} disabled={emailingTradeInId === String(selectedStaffTradeIn._id)} onPress={async () => {
                      try {
                        setEmailingTradeInId(String(selectedStaffTradeIn._id));
                        await emailToDepartment({ tradeInId: selectedStaffTradeIn._id });
                        Alert.alert('Email sent', 'The trade-in submission was sent to the sales department.');
                      } catch (e: any) {
                        Alert.alert('Email failed', e?.message ?? 'Could not email the department');
                      } finally {
                        setEmailingTradeInId(null);
                      }
                    }}>
                      <Ionicons name="mail-outline" size={14} color={colors.primary} />
                      <Text style={styles.reviewActionBtnSecondaryText}>{emailingTradeInId === String(selectedStaffTradeIn._id) ? 'Sending...' : 'Email department'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.reviewActionBtn, savingTradeInId === String(selectedStaffTradeIn._id) && styles.emailDeptBtnDisabled]} disabled={savingTradeInId === String(selectedStaffTradeIn._id)} onPress={() => void saveTradeInReview(String(selectedStaffTradeIn._id))}>
                      <Ionicons name="save-outline" size={14} color={colors.white} />
                      <Text style={styles.reviewActionBtnText}>{savingTradeInId === String(selectedStaffTradeIn._id) ? 'Saving...' : 'Reply with value'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          <View style={styles.listCard}>
            <View style={styles.listHeaderRow}>
              <Text style={styles.sectionTitle}>{staffMode ? 'Submitted Trade-Ins' : 'My trade-ins'}</Text>
              <Text style={styles.listHeaderMeta}>{visibleTradeIns.length} total</Text>
            </View>
            {visibleTradeIns.length ? visibleTradeIns.map((item: any) => {
              const images = Array.isArray(item.imageUrls) ? item.imageUrls : [];
              const firstImage = images[0];
              const isRecent = recentTradeInId === String(item._id);
              return (
                <View key={item._id} style={[styles.listRow, isRecent && styles.listRowRecent]}>
                  <View style={styles.tradeInThumbWrap}>{firstImage ? <Image source={{ uri: firstImage }} style={styles.tradeInThumb} /> : <View style={[styles.tradeInThumb, styles.tradeInThumbPlaceholder]}><Ionicons name="image-outline" size={18} color={colors.textLight} /></View>}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{item.firstName} {item.surname}</Text>
                    <Text style={styles.listMeta}>{item.vehicleName} � {item.yearModel}</Text>
                    <Text style={styles.listMeta}>Expected: {item.expectedValue} � {item.status}</Text>
                    <Text style={styles.listMeta}>Contact: {item.contactDetails}</Text>
                    {item.status === 'submitted' || isRecent ? <View style={styles.submittedNotice}><Ionicons name="checkmark-circle" size={14} color={colors.success} /><Text style={styles.submittedNoticeText}>Submitted and waiting for staff review</Text></View> : null}
                  </View>
                  <View style={[styles.statusPill, item.status === 'submitted' && styles.statusPillActive]}>
                    <Text style={[styles.statusText, item.status === 'submitted' && styles.statusTextActive]}>{item.status}</Text>
                  </View>
                </View>
              );
            }) : <Text style={styles.helper}>No submissions yet.</Text>}
          </View>
        </ScrollView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  wallpaper: { flex: 1 },
  wallpaperOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3, 8, 20, 0.22)' },
  safe: { backgroundColor: colors.primary },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, backgroundColor: colors.primary },
  backBtn: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: colors.white },
  headerSubtitle: { marginTop: 2, fontSize: 12, color: colors.primaryLight, fontWeight: '600', lineHeight: 18 },
  content: { padding: spacing.lg, paddingBottom: 120 },
  heroCard: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, marginBottom: spacing.md },
  heroLabel: { fontSize: 11, fontWeight: '900', color: colors.textLight, textTransform: 'uppercase' },
  heroTitle: { fontSize: 19, fontWeight: '900', color: colors.text, marginTop: 6 },
  heroText: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 6 },
  valuationBubble: { backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '22', borderRadius: 22, padding: 16, marginBottom: spacing.md },
  valuationBubbleTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  valuationBubbleIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary + '18' },
  valuationBubbleLabel: { fontSize: 11, fontWeight: '900', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  valuationBubbleTitle: { fontSize: 16, fontWeight: '900', color: colors.text, marginTop: 2 },
  valuationBubbleText: { marginTop: 10, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  valuationBubbleNote: { marginTop: 10, fontSize: 12, lineHeight: 18, color: colors.text, fontStyle: 'italic' },
  valuationActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  valuationActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 11 },
  valuationActionBtnPrimary: { backgroundColor: colors.primary },
  valuationActionBtnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary + '22' },
  valuationActionBtnText: { fontSize: 12, fontWeight: '900', color: colors.white },
  valuationActionBtnSecondaryText: { fontSize: 12, fontWeight: '900', color: colors.primary },
  submissionBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.success + '12', borderColor: colors.success + '22', borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: spacing.md },
  submissionBannerTitle: { fontSize: 14, fontWeight: '900', color: colors.success },
  submissionBannerText: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  card: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, marginBottom: spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: colors.text, marginBottom: spacing.sm },
  helper: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  segmentBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  segmentBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  segmentTextActive: { color: colors.white },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 14, marginBottom: spacing.md, flex: 1 },
  twoCol: { flexDirection: 'row', gap: 10 },
  choiceBox: { flex: 1, marginBottom: spacing.lg, minHeight: 92 },
  choiceLabel: { fontSize: 12, fontWeight: '900', color: colors.textLight, marginBottom: 8, textTransform: 'uppercase' },
  choiceRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  choiceBtn: { flex: 1, paddingVertical: 12, minHeight: 44, alignItems: 'center', borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  choiceBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { fontSize: 12, fontWeight: '900', color: colors.textSecondary },
  choiceTextActive: { color: colors.white },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: spacing.sm },
  slotCard: { width: '31.5%', aspectRatio: 0.88, borderRadius: 18, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', padding: 10, overflow: 'hidden' },
  slotImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  slotStateBadge: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 8, borderRadius: radius.full, backgroundColor: 'rgba(0,0,0,0.42)' },
  slotStateBadgeUploading: { backgroundColor: 'rgba(14, 105, 255, 0.82)' },
  slotStateBadgeSuccess: { backgroundColor: 'rgba(16, 185, 129, 0.82)' },
  slotStateBadgeFailure: { backgroundColor: 'rgba(220, 38, 38, 0.82)' },
  slotStateText: { fontSize: 10, fontWeight: '900', color: colors.white },
  slotLabel: { position: 'absolute', bottom: 8, left: 8, right: 8, fontSize: 10, fontWeight: '900', color: colors.white, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: radius.full, paddingVertical: 3 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 15, alignItems: 'center', marginBottom: spacing.md },
  primaryBtnText: { color: colors.white, fontSize: 15, fontWeight: '900' },
  uploadPreviewCard: { marginTop: spacing.md, padding: spacing.md, borderRadius: 18, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight },
  uploadPreviewTitle: { fontSize: 13, fontWeight: '900', color: colors.text, marginBottom: 10 },
  uploadPreviewRow: { gap: 10, paddingRight: 8 },
  uploadPreviewItem: { width: 86, alignItems: 'center' },
  uploadPreviewImage: { width: 86, height: 68, borderRadius: 16, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  uploadPreviewLabel: { marginTop: 6, fontSize: 10, fontWeight: '800', color: colors.textSecondary, textAlign: 'center' },
  listCard: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg },
  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  listHeaderMeta: { fontSize: 12, color: colors.textLight, fontWeight: '800' },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.borderLight },
  listRowRecent: { backgroundColor: colors.success + '08', borderRadius: 18, paddingHorizontal: 10, marginHorizontal: -10 },
  tradeInThumbWrap: { width: 56, height: 56 },
  tradeInThumb: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.surfaceAlt },
  tradeInThumbPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderLight },
  thumbStrip: { gap: 6, marginTop: 8, paddingRight: 8 },
  thumbStripImage: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  listTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  listMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 3, lineHeight: 17 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceAlt },
  statusPillActive: { backgroundColor: colors.primary + '12' },
  statusText: { fontSize: 11, fontWeight: '900', color: colors.textSecondary },
  statusTextActive: { color: colors.primary },
  submittedNotice: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.success + '12', alignSelf: 'flex-start' },
  submittedNoticeText: { fontSize: 11, fontWeight: '900', color: colors.success },
  staffSectionCard: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, marginBottom: spacing.md },
  staffPickerRow: { gap: 10, paddingVertical: 4 },
  staffPickerCard: { width: 150, borderRadius: 18, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight, padding: 10 },
  staffPickerCardActive: { backgroundColor: colors.primary + '10', borderColor: colors.primary },
  staffPickerThumb: { width: '100%', height: 86, borderRadius: 14, backgroundColor: colors.surfaceAlt, marginBottom: 8 },
  staffPickerTitle: { fontSize: 12, fontWeight: '900', color: colors.text },
  staffPickerMeta: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  staffDetailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: spacing.md, marginBottom: spacing.md },
  staffDetailItem: { width: '48%', padding: 12, borderRadius: 16, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight },
  staffDetailLabel: { fontSize: 10, fontWeight: '900', color: colors.textLight, textTransform: 'uppercase' },
  staffDetailValue: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 4 },
  reviewStatusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  reviewStatusPill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface },
  reviewStatusPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  reviewStatusText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },
  reviewStatusTextActive: { color: colors.white },
  reviewInput: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 13, marginBottom: 10 },
  reviewNotesInput: { minHeight: 72, textAlignVertical: 'top' },
  reviewActionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  reviewActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.primary },
  reviewActionBtnText: { fontSize: 12, fontWeight: '900', color: colors.white },
  reviewActionBtnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  reviewActionBtnSecondaryText: { fontSize: 12, fontWeight: '900', color: colors.primary },
  emailDeptBtnDisabled: { opacity: 0.7 },
  tradeInThumbPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderLight },
});

export type { SlotUploadState };
