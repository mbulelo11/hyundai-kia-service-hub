import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Image, ActivityIndicator, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { showSuccessToast } from '../lib/toast';

export default function ProfileEditScreen({ navigation }: any) {
  const me = useQuery(api.users.me);
  const myCustomerProfile = useQuery(api.customerProfiles.getMyProfile);
  const updateProfile = useMutation(api.users.updateProfile);
  const syncCustomerProfile = useMutation(api.customerProfiles.syncMyProfile);
  const generateProfileUploadUrl = useMutation(api.users.generateProfileUploadUrl);
  const hydratedUserIdRef = React.useRef<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [address, setAddress] = useState('');
  const [preferredContactMethod, setPreferredContactMethod] = useState('');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [bio, setBio] = useState('');
  const [profileNotes, setProfileNotes] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    const currentUserId = me?._id ? String(me._id) : null;
    if (!me || !currentUserId || hydratedUserIdRef.current === currentUserId) return;

    setDisplayName(me.displayName ?? me.name ?? '');
    setPhone(me.phone ?? myCustomerProfile?.phone ?? '');
    setAlternatePhone(me.alternatePhone ?? '');
    setBirthday(me.birthday ?? '');
    setAddress(me.address ?? '');
    setPreferredContactMethod(me.preferredContactMethod ?? '');
    setBio(me.bio ?? '');
    setProfileNotes(me.profileNotes ?? '');
    setVehicleDescription(myCustomerProfile?.vehicleDescription ?? '');
    setProfileImage(me.profileImage ?? me.image ?? '');
    hydratedUserIdRef.current = currentUserId;
  }, [me, myCustomerProfile]);

  React.useEffect(() => {
    setProfileImage(me?.profileImage ?? me?.image ?? '');
  }, [me?.profileImage, me?.image]);

  React.useEffect(() => {
    if (hydratedUserIdRef.current && myCustomerProfile && !vehicleDescription) {
      setVehicleDescription(myCustomerProfile.vehicleDescription ?? '');
    }
  }, [myCustomerProfile, vehicleDescription]);

  const initial = useMemo(() => (displayName || me?.name || 'U').charAt(0).toUpperCase(), [displayName, me?.name]);

  const pickImageAsset = async () => {
    if (Platform.OS === 'web') {
      return await new Promise<any>((resolve) => {
        const g: any = globalThis as any;
        const input = g?.document?.createElement?.('input');
        if (!input) {
          resolve(null);
          return;
        }
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          resolve({
            uri: g.URL.createObjectURL(file),
            file,
            mimeType: file.type || 'image/jpeg',
          });
        };
        input.click();
      });
    }

    const DocumentPicker: any = await import('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) {
      return null;
    }

    const asset = result.assets[0];
    return {
      uri: asset.uri,
      file: asset.file,
      mimeType: asset.mimeType || 'image/jpeg',
    } as any;
  };

  const uriToBlob = async (uri: string) => {
    const response = await globalThis.fetch(uri);
    return await response.blob();
  };

  const uploadProfileImage = async () => {
    try {
      setUploadingPhoto(true);
      const asset = await pickImageAsset();
      if (!asset) return;

      const uploadUrl = await generateProfileUploadUrl();
      const body = asset.file ?? await uriToBlob(asset.uri);
      const response = await globalThis.fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': asset.mimeType || 'image/jpeg' },
        body,
      });
      const responseText = await response.text();
      let storageId = '';
      try {
        const parsed = JSON.parse(responseText);
        storageId = String(parsed.storageId || parsed.id || '').trim();
      } catch {
        storageId = responseText.trim();
      }

      if (!storageId) {
        throw new Error('Could not save profile picture');
      }

      await updateProfile({ profileImageStorageId: storageId as any });
      try {
        await syncCustomerProfile({
          displayName: displayName.trim() || me?.displayName || me?.name || undefined,
          phone: phone.trim() || me?.phone || myCustomerProfile?.phone || undefined,
          vehicleDescription: vehicleDescription.trim() || myCustomerProfile?.vehicleDescription || undefined,
        });
      } catch {
        // profile image is saved even if customer profile sync cannot complete
      }
      setPhotoModalVisible(false);
      showSuccessToast('Profile picture updated', 'Your new profile photo is live now.');
    } catch (err: any) {
      Alert.alert('Profile picture', err?.message || 'Could not update profile picture');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removeProfileImage = async () => {
    try {
      setUploadingPhoto(true);
      await updateProfile({ profileImage: '', profileImageStorageId: undefined as any });
      try {
        await syncCustomerProfile({
          displayName: displayName.trim() || me?.displayName || me?.name || undefined,
          phone: phone.trim() || me?.phone || myCustomerProfile?.phone || undefined,
          vehicleDescription: vehicleDescription.trim() || myCustomerProfile?.vehicleDescription || undefined,
        });
      } catch {
        // profile image is removed even if customer profile sync cannot complete
      }
      setPhotoModalVisible(false);
      showSuccessToast('Profile picture removed', 'The photo was removed successfully.');
    } catch (err: any) {
      Alert.alert('Profile picture', err?.message || 'Could not remove profile picture');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const cleanDisplayName = displayName.trim() || me?.displayName || me?.name || undefined;
      const cleanPhone = phone.trim() || me?.phone || myCustomerProfile?.phone || undefined;
      const cleanAlternatePhone = alternatePhone.trim() || me?.alternatePhone || undefined;
      const cleanBirthday = birthday.trim() || me?.birthday || undefined;
      const cleanAddress = address.trim() || me?.address || undefined;
      const cleanPreferredContactMethod = preferredContactMethod.trim() || me?.preferredContactMethod || undefined;
      const cleanVehicle = vehicleDescription.trim() || myCustomerProfile?.vehicleDescription || undefined;
      const cleanProfileNotes = profileNotes.trim() || me?.profileNotes || undefined;
      const cleanBio = bio.trim() || undefined;
      await updateProfile({
        displayName: cleanDisplayName,
        bio: cleanBio,
        phone: cleanPhone,
        alternatePhone: cleanAlternatePhone,
        birthday: cleanBirthday,
        address: cleanAddress,
        preferredContactMethod: cleanPreferredContactMethod,
        profileNotes: cleanProfileNotes,
      });
      await syncCustomerProfile({
        displayName: cleanDisplayName,
        phone: cleanPhone,
        vehicleDescription: cleanVehicle,
      });
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message || 'Could not save profile');
      Alert.alert('Profile', err?.message || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Profile Settings</Text>
            <View style={{ width: 40 }} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={styles.avatarWrap} activeOpacity={0.85} onPress={() => setPhotoModalVisible(true)}>
            <View style={styles.avatarShell}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{initial}</Text>
                </View>
              )}
              <View style={styles.avatarOverlay}>
                <Ionicons name="camera" size={20} color={colors.white} />
              </View>
            </View>
            <Text style={styles.avatarAction}>{profileImage ? 'Change profile picture' : 'Add profile picture'}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Display Name</Text>
          <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Your display name" placeholderTextColor={colors.textLight} />

          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Your phone number"
            placeholderTextColor={colors.textLight}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Alternate Phone</Text>
          <TextInput
            style={styles.input}
            value={alternatePhone}
            onChangeText={setAlternatePhone}
            placeholder="Another number staff can use"
            placeholderTextColor={colors.textLight}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Birthday</Text>
          <TextInput
            style={styles.input}
            value={birthday}
            onChangeText={setBirthday}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textLight}
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Home or work address"
            placeholderTextColor={colors.textLight}
            multiline
          />

          <Text style={styles.label}>Preferred Contact Method</Text>
          <TextInput
            style={styles.input}
            value={preferredContactMethod}
            onChangeText={setPreferredContactMethod}
            placeholder="WhatsApp, call, email"
            placeholderTextColor={colors.textLight}
          />

          <Text style={styles.label}>Vehicle You're Driving</Text>
          <TextInput
            style={styles.input}
            value={vehicleDescription}
            onChangeText={setVehicleDescription}
            placeholder="e.g. 2024 Hyundai Tucson"
            placeholderTextColor={colors.textLight}
          />

          <Text style={styles.label}>Staff Notes</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={profileNotes}
            onChangeText={setProfileNotes}
            placeholder="Anything staff should know"
            placeholderTextColor={colors.textLight}
            multiline
          />

          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="A short bio"
            placeholderTextColor={colors.textLight}
            multiline
          />

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>Save Changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={photoModalVisible} transparent animationType="fade" onRequestClose={() => setPhotoModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.photoModal}>
            <Text style={styles.photoModalTitle}>Profile picture</Text>
            <Text style={styles.photoModalText}>Choose a new picture to use everywhere in the app.</Text>

            <TouchableOpacity style={styles.photoModalAction} onPress={uploadProfileImage} disabled={uploadingPhoto}>
              {uploadingPhoto ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="image-outline" size={18} color={colors.primary} />}
              <Text style={styles.photoModalActionText}>{uploadingPhoto ? 'Uploading...' : 'Choose photo'}</Text>
            </TouchableOpacity>

            {profileImage ? (
              <TouchableOpacity style={styles.photoModalAction} onPress={removeProfileImage} disabled={uploadingPhoto}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
                <Text style={[styles.photoModalActionText, { color: colors.error }]}>Remove photo</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.photoModalCancel} onPress={() => setPhotoModalVisible(false)}>
              <Text style={styles.photoModalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  avatarWrap: { alignItems: 'center', marginBottom: spacing.xl },
  avatarShell: { width: 110, height: 110, borderRadius: 55, overflow: 'hidden', marginBottom: 10, position: 'relative' },
  avatar: { width: '100%', height: '100%', borderRadius: 55, backgroundColor: colors.surface },
  avatarFallback: { width: '100%', height: '100%', borderRadius: 55, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  avatarFallbackText: { color: colors.white, fontSize: 36, fontWeight: '800' },
  avatarOverlay: { position: 'absolute', right: 8, bottom: 8, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.68)' },
  avatarAction: { marginTop: spacing.sm, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '20', color: colors.primary, fontSize: 13, fontWeight: '800' },
  error: { color: colors.error, marginBottom: spacing.md },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8, marginTop: spacing.md },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, color: colors.text, fontSize: 16 },
  bioInput: { minHeight: 110, textAlignVertical: 'top' },
  saveBtn: { marginTop: spacing.xl, backgroundColor: colors.primary, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg },
  saveText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: spacing.lg },
  photoModal: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight },
  photoModalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  photoModalText: { fontSize: 13, color: colors.textSecondary, marginTop: 6, marginBottom: spacing.lg, lineHeight: 18 },
  photoModalAction: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight, marginBottom: spacing.sm },
  photoModalActionText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  photoModalCancel: { alignItems: 'center', paddingVertical: 14, borderRadius: radius.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight, marginTop: spacing.xs },
  photoModalCancelText: { fontSize: 14, fontWeight: '800', color: colors.textSecondary },
});