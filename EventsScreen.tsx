import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, TextInput, Image, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import * as FileSystem from 'expo-file-system';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { showSuccessToast } from '../lib/toast';

function formatDateTime(date: string, time?: string) {
  const base = new Date(`${date}T12:00:00`);
  const dateLabel = base.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return time ? `${dateLabel} · ${time}` : dateLabel;
}

export default function EventsScreen({ navigation }: any) {
  const me = useQuery(api.users.me);
  const allUsersQuery = useQuery(api.users.listAppAccounts, { limit: 100 });
  const allUsers = useMemo(() => allUsersQuery ?? [], [allUsersQuery]);
  const events = useQuery(api.events.listAll) ?? [];
  const isStaff = Boolean(me?.role === 'staff' || me?.staffRole || me?.isOwner || me?.accessLevel === 'full_access');
  const createEvent = useMutation(api.events.createEvent);
  const inviteUsers = useMutation(api.events.inviteUsers);
  const toggleInterest = useMutation(api.events.toggleInterest);
  const generateUploadUrl = useMutation(api.posts.generateUploadUrl);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [fees, setFees] = useState('');
  const [location, setLocation] = useState('');
  const [selectedInvitees, setSelectedInvitees] = useState<string[]>([]);
  const [media, setMedia] = useState<{ uri: string; storageId?: string; mediaType?: 'image' | 'video'; mimeType?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const inviteableUsers = useMemo(() => allUsers.filter((user: any) => String(user._id) !== String(me?._id)), [allUsers, me?._id]);

  const uploadMedia = useCallback(async (asset: { uri: string; name?: string; mimeType?: string; file?: any }) => {
    const mimeType = asset.mimeType || 'image/jpeg';
    const mediaType: 'image' | 'video' = mimeType.startsWith('video/') ? 'video' : 'image';
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const uploadResult = Platform.OS === 'web'
        ? await globalThis.fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': mimeType },
            body: asset.file instanceof (globalThis as any).Blob ? asset.file : await globalThis.fetch(asset.uri).then((response: any) => response.blob()),
          })
        : await FileSystem.uploadAsync(uploadUrl, asset.uri, {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { 'Content-Type': mimeType },
          });
      const responseText = Platform.OS === 'web'
        ? await (uploadResult as Response).text()
        : String((uploadResult as any).body ?? '');
      let storageId = '';
      try {
        const parsed = JSON.parse(responseText);
        storageId = String(parsed.storageId || parsed.id || '').trim();
      } catch {
        storageId = responseText.trim();
      }
      if (!storageId) throw new Error('Upload failed');
      setMedia({ uri: asset.uri, storageId, mediaType, mimeType });
    } finally {
      setUploading(false);
    }
  }, [generateUploadUrl]);

  const pickMedia = useCallback(async (kind: 'image' | 'video') => {
    try {
      if (Platform.OS === 'web') {
        const file = await new Promise<File | null>((resolve) => {
          const input = (globalThis as any).document?.createElement('input');
          if (!input) {
            resolve(null);
            return;
          }
          input.type = 'file';
          input.accept = kind === 'image' ? 'image/*' : 'video/*';
          input.onchange = () => resolve(input.files?.[0] ?? null);
          input.click();
        });
        if (!file) return;
        await uploadMedia({
          uri: globalThis.URL.createObjectURL(file),
          name: file.name,
          mimeType: file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
          file,
        });
        return;
      }

      const DocumentPicker: any = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: kind === 'image' ? 'image/*' : 'video/*',
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg');
      if (kind === 'image' && String(mimeType).startsWith('video/')) return;
      if (kind === 'video' && !String(mimeType).startsWith('video/')) return;
      await uploadMedia({
        uri: asset.uri,
        name: asset.name || undefined,
        mimeType,
      });
    } catch (error: any) {
      Alert.alert('Media', error?.message ?? 'Could not add media');
    }
  }, [uploadMedia]);

  const handleCreateEvent = async () => {
    if (!title.trim() || !description.trim() || !date.trim() || !location.trim()) {
      Alert.alert('Missing details', 'Please add title, description, date, and location.');
      return;
    }

    try {
      setSaving(true);
      const eventId = await createEvent({
        title,
        description,
        date,
        time: time || undefined,
        endTime: endTime || undefined,
        fees: fees || undefined,
        location,
        mediaStorageId: media?.storageId as any,
        mediaType: media?.mediaType,
      });
      if (selectedInvitees.length > 0) {
        await inviteUsers({ eventId, inviteeUserIds: selectedInvitees as any });
      }
      setTitle('');
      setDescription('');
      setDate('');
      setTime('');
      setEndTime('');
      setFees('');
      setLocation('');
      setSelectedInvitees([]);
      setMedia(null);
      showSuccessToast('Event created', 'The event was created and invites were sent.');
    } catch (error: any) {
      Alert.alert('Unable to create event', error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleInvitee = (userId: string) => {
    setSelectedInvitees((current: string[]) => current.includes(userId) ? current.filter((id: string) => id !== userId) : [...current, userId]);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Events</Text>
            <Text style={styles.subtitle}>{isStaff ? 'Create, invite, and manage event activity' : 'View events, show interest, and keep them in your inbox'}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Live events</Text>
            <Text style={styles.heroTitle}>Everything in one event stream</Text>
            <Text style={styles.heroCopy}>Create events with media, invite app users, and let interested users receive the details directly in their inbox.</Text>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Create event</Text>
            <Text style={styles.sectionSub}>Add the details, media, fees, and location</Text>
          </View>

          <View style={styles.formCard}>
            <TextInput value={title} onChangeText={setTitle} placeholder="Event title" placeholderTextColor={colors.textLight} style={styles.input} />
            <TextInput value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={colors.textLight} style={[styles.input, styles.textArea]} multiline />
            <View style={styles.row}>
              <TextInput value={date} onChangeText={setDate} placeholder="Date (YYYY-MM-DD)" placeholderTextColor={colors.textLight} style={[styles.input, styles.rowInput]} />
              <TextInput value={time} onChangeText={setTime} placeholder="Time" placeholderTextColor={colors.textLight} style={[styles.input, styles.rowInput]} />
            </View>
            <View style={styles.row}>
              <TextInput value={endTime} onChangeText={setEndTime} placeholder="End time" placeholderTextColor={colors.textLight} style={[styles.input, styles.rowInput]} />
              <TextInput value={fees} onChangeText={setFees} placeholder="Fees" placeholderTextColor={colors.textLight} style={[styles.input, styles.rowInput]} />
            </View>
            <TextInput value={location} onChangeText={setLocation} placeholder="Location" placeholderTextColor={colors.textLight} style={styles.input} />

            <View style={styles.mediaActionsRow}>
              <TouchableOpacity
                style={styles.mediaBtn}
                onPress={() => void pickMedia('image')}
                disabled={uploading}
              >
                <Ionicons name="image-outline" size={16} color={colors.primary} />
                <Text style={styles.mediaBtnText}>{uploading ? 'Uploading...' : 'Add Image'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.mediaBtn}
                onPress={() => void pickMedia('video')}
                disabled={uploading}
              >
                <Ionicons name="videocam-outline" size={16} color={colors.primary} />
                <Text style={styles.mediaBtnText}>{uploading ? 'Uploading...' : 'Add Video'}</Text>
              </TouchableOpacity>
              {media ? (
                <TouchableOpacity style={styles.mediaBtnGhost} onPress={() => setMedia(null)}>
                  <Text style={styles.mediaBtnGhostText}>Remove media</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {media ? (
              <View style={styles.mediaPreview}>
                <View style={styles.mediaPreviewIcon}>
                  <Ionicons name={media.mediaType === 'video' ? 'videocam' : 'image'} size={18} color={colors.primary} />
                </View>
                <Text style={styles.mediaPreviewText}>{media.mediaType === 'video' ? 'Video attached' : 'Image attached'}</Text>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Invite users</Text>
            <View style={styles.inviteList}>
              {inviteableUsers.map((user: any) => {
                const active = selectedInvitees.includes(String(user._id));
                return (
                  <TouchableOpacity key={String(user._id)} style={[styles.inviteRow, active && styles.inviteRowActive]} onPress={() => handleToggleInvitee(String(user._id))}>
                    <View style={styles.inviteAvatar}><Text style={styles.inviteAvatarText}>{String(user.displayName || user.name || user.email || 'U').charAt(0).toUpperCase()}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inviteName}>{user.displayName || user.name || user.email}</Text>
                      <Text style={styles.inviteMeta}>{user.accountType === 'staff' ? 'Staff' : 'Customer'}</Text>
                    </View>
                    <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={active ? colors.primary : colors.textLight} />
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleCreateEvent} disabled={saving || uploading}>
              <Text style={styles.saveBtnText}>{saving ? 'Creating...' : 'Create event'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Live events</Text>
            <Text style={styles.sectionSub}>Tap interested to save it and send details to your inbox</Text>
          </View>

          <FlatList
            scrollEnabled={false}
            data={events}
            keyExtractor={(item: any) => String(item._id)}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            ListEmptyComponent={<Text style={styles.emptyText}>No events yet.</Text>}
            renderItem={({ item }: { item: any }) => (
              <View style={styles.eventCard}>
                {item.mediaUrl ? <Image source={{ uri: item.mediaUrl }} style={styles.eventImage} /> : null}
                <View style={styles.eventHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle}>{item.title}</Text>
                    <Text style={styles.eventMeta}>{item.creatorName} · {formatDateTime(item.date, item.time)}</Text>
                  </View>
                  <View style={styles.pill}><Text style={styles.pillText}>{item.isInterested ? 'Interested' : 'Open'}</Text></View>
                </View>
                <Text style={styles.eventBody}>{item.description}</Text>
                <Text style={styles.eventMeta}>{item.location}{item.fees ? ` · ${item.fees}` : ''}</Text>
                <View style={styles.eventActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, item.isInterested && styles.actionBtnActive]}
                    onPress={() => void toggleInterest({ eventId: item._id, interested: !item.isInterested })}
                  >
                    <Ionicons name={item.isInterested ? 'heart' : 'heart-outline'} size={16} color={item.isInterested ? colors.white : colors.primary} />
                    <Text style={[styles.actionText, item.isInterested && styles.actionTextActive]}>{item.isInterested ? 'Interested' : 'Interested'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('SocialFeed')}>
                    <Ionicons name="share-outline" size={16} color={colors.primary} />
                    <Text style={styles.actionText}>Share in feed</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  title: { fontSize: 20, fontWeight: '900', color: colors.text },
  subtitle: { marginTop: 2, fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.lg },
  heroCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  heroLabel: { fontSize: 11, fontWeight: '900', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { marginTop: 4, fontSize: 20, fontWeight: '900', color: colors.text },
  heroCopy: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.textSecondary, fontWeight: '500' },
  sectionHeader: { gap: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  sectionSub: { fontSize: 12, color: colors.textSecondary },
  formCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.sm, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  input: { borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight, paddingHorizontal: spacing.md, paddingVertical: 12, color: colors.text },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowInput: { flex: 1 },
  mediaActionsRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  mediaBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '24' },
  mediaBtnText: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  mediaBtnGhost: { paddingHorizontal: spacing.md, paddingVertical: 10 },
  mediaBtnGhostText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  mediaPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '20' },
  mediaPreviewIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  mediaPreviewText: { color: colors.primary, fontWeight: '900' },
  inviteList: { gap: spacing.sm, marginTop: spacing.sm },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: 18, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  inviteRowActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  inviteAvatar: { width: 38, height: 38, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  inviteAvatarText: { color: colors.primary, fontWeight: '900' },
  inviteName: { fontSize: 14, fontWeight: '800', color: colors.text },
  inviteMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center', marginTop: spacing.sm, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  saveBtnText: { color: colors.white, fontSize: 15, fontWeight: '900' },
  emptyText: { color: colors.textSecondary, fontSize: 13, paddingVertical: spacing.md },
  eventCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.sm, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  eventImage: { width: '100%', height: 180, borderRadius: 18, backgroundColor: colors.surfaceAlt },
  eventHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  eventTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  eventMeta: { marginTop: 4, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  eventBody: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.primary + '12' },
  pillText: { fontSize: 10, fontWeight: '900', color: colors.primary, textTransform: 'uppercase' },
  eventActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '24' },
  actionBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  actionTextActive: { color: colors.white },
});