import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  FlatList,
  Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { showSuccessToast } from '../lib/toast';

const GROUP_CATEGORIES = [
  { key: 'club', label: 'Car clubs' },
  { key: 'event', label: 'Events' },
  { key: 'initiative', label: 'Initiatives' },
] as const;

export default function GroupsScreen({ navigation }: any) {
  const me = useQuery(api.users.me);
  const allGroupsQuery = useQuery(api.groups.listAll);
  const allGroups = useMemo(() => allGroupsQuery ?? [], [allGroupsQuery]);
  const myGroups = useQuery(api.groups.listMine) ?? [];
  const pendingRequests = useQuery(api.groups.listPendingRequests) ?? [];
  const createGroup = useMutation(api.groups.createGroup);
  const createPost = useMutation(api.posts.createPost);
  const requestJoin = useMutation(api.groups.requestJoin);
  const reviewJoinRequest = useMutation(api.groups.reviewJoinRequest);
  const closeGroup = useMutation(api.groups.closeGroup);
  const reportGroup = useMutation(api.groups.reportGroup);
  const generateUploadUrl = useMutation(api.posts.generateUploadUrl);
  const listPostsByContext = useQuery(api.posts.listByContext, myGroups[0]?.groupId ? { groupId: String(myGroups[0].groupId), limit: 10 } : 'skip');
  const [category, setCategory] = useState<(typeof GROUP_CATEGORIES)[number]['key']>('club');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [criteriaText, setCriteriaText] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [questionOne, setQuestionOne] = useState('');
  const [questionTwo, setQuestionTwo] = useState('');
  const [avatarImage, setAvatarImage] = useState<{ uri: string; storageId?: string; mimeType?: string } | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<{ uri: string; storageId?: string; mimeType?: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});

  const currentCategoryGroups = useMemo(() => allGroups.filter((group: any) => group.category === category), [allGroups, category]);
  const isAdminViewer = Boolean(me?.isOwner || me?.staffRole === 'dp' || me?.accessLevel === 'full_access');
  const avatarPreviewUrl = avatarImage?.uri ?? null;
  const backgroundPreviewUrl = backgroundImage?.uri ?? null;

  const handleImageLoad = useCallback((key: string, width?: number, height?: number) => {
    const ratio = Number(width ?? 0) > 0 && Number(height ?? 0) > 0 ? Number(width) / Number(height) : 1;
    setImageRatios((prev: Record<string, number>) => (prev[key] === ratio ? prev : { ...prev, [key]: ratio }));
  }, []);

  const uploadMedia = useCallback(async (asset: { uri: string; name?: string; mimeType?: string; file?: any }) => {
    const mimeType = asset.mimeType || 'image/jpeg';
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
    return { storageId, mimeType };
  }, [generateUploadUrl]);

  const pickMedia = useCallback(async (kind: 'avatar' | 'background') => {
    try {
      if (Platform.OS === 'web') {
        const file = await new Promise<File | null>((resolve) => {
          const input = (globalThis as any).document?.createElement('input');
          if (!input) {
            resolve(null);
            return;
          }
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = () => resolve(input.files?.[0] ?? null);
          input.click();
        });
        if (!file) return;
        const mimeType = file.type || 'image/jpeg';
        const uploaded = await uploadMedia({ uri: globalThis.URL.createObjectURL(file), name: file.name, mimeType, file });
        const next = { uri: globalThis.URL.createObjectURL(file), storageId: uploaded.storageId, mimeType: uploaded.mimeType };
        if (kind === 'avatar') setAvatarImage(next);
        else setBackgroundImage(next);
        return;
      }

      const DocumentPicker: any = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const uploaded = await uploadMedia({
        uri: asset.uri,
        name: asset.name || undefined,
        mimeType: asset.mimeType || 'image/jpeg',
      });
      const next = { uri: asset.uri, storageId: uploaded.storageId, mimeType: uploaded.mimeType };
      if (kind === 'avatar') setAvatarImage(next);
      else setBackgroundImage(next);
    } catch (error: any) {
      Alert.alert('Media', error?.message ?? 'Could not add media');
    }
  }, [uploadMedia]);

  const handleCreate = async () => {
    if (!name.trim() || !description.trim()) {
      Alert.alert('Missing details', 'Add a group name and description.');
      return;
    }
    setCreating(true);
    try {
      const groupId = await createGroup({
        name: name.trim(),
        description: description.trim(),
        category,
        criteriaText: criteriaText.trim() || undefined,
        rulesText: rulesText.trim() || undefined,
        joinQuestions: [questionOne, questionTwo].map((q) => q.trim()).filter(Boolean),
        avatarImageStorageId: avatarImage?.storageId as any,
        backgroundImageStorageId: backgroundImage?.storageId as any,
      });
      await createPost({
        content: description.trim(),
        title: name.trim(),
        postType: 'group',
        groupId,
        mediaType: avatarImage ? 'image' : undefined,
        imageStorageId: avatarImage?.storageId as any,
        isSharedToMainFeed: true,
      });
      setName('');
      setDescription('');
      setCriteriaText('');
      setRulesText('');
      setQuestionOne('');
      setQuestionTwo('');
      setAvatarImage(null);
      setBackgroundImage(null);
      showSuccessToast('Group created', 'Your feed group is ready.');
      navigation.navigate('SocialFeed', { groupId });
    } catch (error: any) {
      Alert.alert('Unable to create group', error?.message ?? 'Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Groups</Text>
            <Text style={styles.subtitle}>Create club, event, and initiative feeds with approvals.</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Feed groups</Text>
            <Text style={styles.heroTitle}>Your group becomes a postable feed</Text>
            <Text style={styles.heroCopy}>Groups can be shared back into the main feed, styled with avatars and backgrounds, and moderated with join questions and admin review.</Text>
          </View>

          <View style={styles.segmentRow}>
            {GROUP_CATEGORIES.map((item) => (
              <TouchableOpacity key={item.key} style={[styles.segment, category === item.key && styles.segmentActive]} onPress={() => setCategory(item.key)}>
                <Text style={[styles.segmentText, category === item.key && styles.segmentTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Create a new group feed</Text>
            <View style={styles.mediaRow}>
              <TouchableOpacity style={styles.mediaBtn} onPress={() => void pickMedia('avatar')}>
                <Ionicons name="person-circle-outline" size={16} color={colors.primary} />
                <Text style={styles.mediaBtnText}>{avatarImage ? 'Avatar added' : 'Add avatar'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mediaBtn} onPress={() => void pickMedia('background')}>
                <Ionicons name="image-outline" size={16} color={colors.primary} />
                <Text style={styles.mediaBtnText}>{backgroundImage ? 'Background added' : 'Add background'}</Text>
              </TouchableOpacity>
            </View>
            {avatarImage || backgroundImage ? (
              <View style={styles.mediaPreview}>
                <Text style={styles.mediaPreviewText}>Styled media ready for your new feed</Text>
                {backgroundPreviewUrl ? <Image source={{ uri: backgroundPreviewUrl }} style={styles.previewBannerImage} /> : null}
                {avatarPreviewUrl ? <Image source={{ uri: avatarPreviewUrl }} style={styles.previewAvatarImage} /> : null}
              </View>
            ) : null}
            <TextInput value={name} onChangeText={setName} placeholder="Group name" placeholderTextColor={colors.textLight} style={styles.input} />
            <TextInput value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={colors.textLight} style={[styles.input, styles.textArea]} multiline />
            <TextInput value={criteriaText} onChangeText={setCriteriaText} placeholder="Join criteria" placeholderTextColor={colors.textLight} style={styles.input} />
            <TextInput value={rulesText} onChangeText={setRulesText} placeholder="Rules and standards" placeholderTextColor={colors.textLight} style={styles.input} />
            <TextInput value={questionOne} onChangeText={setQuestionOne} placeholder="Join question 1" placeholderTextColor={colors.textLight} style={styles.input} />
            <TextInput value={questionTwo} onChangeText={setQuestionTwo} placeholder="Join question 2" placeholderTextColor={colors.textLight} style={styles.input} />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleCreate} disabled={creating}>
              <Text style={styles.primaryBtnText}>{creating ? 'Creating...' : 'Create group feed'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active groups</Text>
            <Text style={styles.sectionSub}>Tap to view the feed, request to join, or report a problem.</Text>
          </View>

          <FlatList
            scrollEnabled={false}
            data={currentCategoryGroups}
            keyExtractor={(item: any) => String(item.groupId)}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            ListEmptyComponent={<Text style={styles.emptyText}>No groups in this category yet.</Text>}
            renderItem={({ item }: { item: any }) => (
              <View style={styles.groupCard}>
                <View style={styles.groupMedia}>
                  {item.backgroundImageUrl ? <Image source={{ uri: item.backgroundImageUrl }} style={[styles.backgroundImage, { aspectRatio: imageRatios[item.backgroundImageUrl] ?? 1.5 }]} resizeMode="contain" onLoad={(event: any) => {
                    const source = event?.nativeEvent?.source;
                    handleImageLoad(String(item.backgroundImageUrl), source?.width, source?.height);
                  }} /> : <View style={styles.backgroundFallback} />}
                  <View style={styles.avatarWrap}>
                    {item.avatarImageUrl ? <Image source={{ uri: item.avatarImageUrl }} style={styles.avatar} resizeMode="contain" onLoad={(event: any) => {
                      const source = event?.nativeEvent?.source;
                      handleImageLoad(String(item.avatarImageUrl), source?.width, source?.height);
                    }} /> : <View style={styles.avatarFallback}><Text style={styles.avatarFallbackText}>{String(item.name ?? 'G').charAt(0).toUpperCase()}</Text></View>}
                  </View>
                </View>
                <Text style={styles.groupName}>{item.name}</Text>
                <Text style={styles.groupMeta}>{item.memberCount} members · {item.isClosed ? 'Closed' : 'Open'}</Text>
                <Text style={styles.groupBody}>{item.description}</Text>
                {item.criteriaText ? <Text style={styles.groupHint}>Criteria: {item.criteriaText}</Text> : null}
                {item.joinQuestions?.length ? <Text style={styles.groupHint}>Join questions: {item.joinQuestions.length}</Text> : null}
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('SocialFeed', { groupId: item.groupId })}>
                    <Text style={styles.actionBtnText}>Open feed</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => void createPost({
                      content: `Welcome to ${item.name}`,
                      title: item.name,
                      postType: item.category === 'club' ? 'club' : item.category === 'event' ? 'event' : 'initiative',
                      groupId: String(item.groupId),
                      isSharedToMainFeed: false,
                    })}
                  >
                    <Text style={styles.actionBtnText}>New post</Text>
                  </TouchableOpacity>
                  {!item.isMember && !item.isPending ? (
                    <TouchableOpacity
                      style={styles.actionBtnPrimary}
                      onPress={() => void requestJoin({
                        groupId: String(item.groupId),
                        answers: (item.joinQuestions ?? []).map((question: string) => ({ question, answer: 'I agree to the standards.' })),
                      })}
                    >
                      <Text style={styles.actionBtnPrimaryText}>Request join</Text>
                    </TouchableOpacity>
                  ) : null}
                  {(me?.isOwner || me?.staffRole === 'dp') ? (
                    <TouchableOpacity style={styles.actionBtnDanger} onPress={() => void closeGroup({ groupId: String(item.groupId) })}>
                      <Text style={styles.actionBtnDangerText}>Close</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.actionBtn} onPress={() => void reportGroup({ groupId: String(item.groupId), reason: 'Standards review requested' })}>
                    <Text style={styles.actionBtnText}>Report</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />

          {(me?.isOwner || me?.staffRole === 'dp') ? (
            <View style={styles.adminReviewCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Join request review</Text>
                <Text style={styles.sectionSub}>Accept or reject pending requests for groups you can manage.</Text>
              </View>
              {pendingRequests.length === 0 ? (
                <Text style={styles.emptyText}>No pending requests.</Text>
              ) : (
                pendingRequests.map((request: any) => (
                  <View key={request.requestId} style={styles.reviewCard}>
                    <View style={styles.reviewTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.groupName}>{request.userName}</Text>
                        <Text style={styles.groupMeta}>{request.groupName} · {request.groupCategory}</Text>
                      </View>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('SocialFeed', { groupId: request.groupId })}>
                        <Text style={styles.actionBtnText}>Open</Text>
                      </TouchableOpacity>
                    </View>
                    {request.note ? <Text style={styles.groupHint}>Note: {request.note}</Text> : null}
                    {request.answers?.length ? request.answers.map((item: any, idx: number) => (
                      <View key={`${request.requestId}-${idx}`} style={styles.answerBlock}>
                        <Text style={styles.answerQuestion}>{item.question}</Text>
                        <Text style={styles.answerValue}>{item.answer}</Text>
                      </View>
                    )) : null}
                    <View style={styles.actionRow}>
                      <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => void reviewJoinRequest({ requestId: request.requestId, status: 'accepted' })}>
                        <Text style={styles.actionBtnPrimaryText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionBtnDanger} onPress={() => void reviewJoinRequest({ requestId: request.requestId, status: 'rejected' })}>
                        <Text style={styles.actionBtnDangerText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {isAdminViewer ? (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Admin review</Text>
              <Text style={styles.sectionSub}>Pending requests are listed above for moderation.</Text>
            </View>
          ) : null}

          {myGroups.length > 0 ? (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My groups feed</Text>
              <Text style={styles.sectionSub}>Your groups can be posted into the main feed too.</Text>
            </View>
          ) : null}
          {listPostsByContext?.length ? listPostsByContext.map((post: any) => (
            <View key={post.postId} style={styles.postCard}>
              <Text style={styles.groupName}>{post.title || 'Group post'}</Text>
              <Text style={styles.groupBody}>{post.content}</Text>
            </View>
          )) : null}
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
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 2, fontSize: 12, color: colors.textSecondary },
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.lg },
  heroCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight },
  heroLabel: { fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { marginTop: 4, fontSize: 20, fontWeight: '900', color: colors.text },
  heroCopy: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  segmentRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  segment: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  segmentActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  segmentTextActive: { color: colors.white },
  formCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.sm },
  mediaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  mediaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '24' },
  mediaBtnText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  mediaPreview: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  mediaPreviewText: { fontSize: 12, color: colors.textSecondary, fontWeight: '700' },
  previewBannerImage: { width: '100%', height: 120, borderRadius: radius.md, marginTop: 10 },
  previewAvatarImage: { width: 48, height: 48, borderRadius: 16, marginTop: 10, alignSelf: 'flex-start' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  sectionHeader: { gap: 2 },
  sectionSub: { fontSize: 12, color: colors.textSecondary },
  input: { borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight, paddingHorizontal: spacing.md, paddingVertical: 12, color: colors.text },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  primaryBtnText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  emptyText: { color: colors.textSecondary, fontSize: 13, paddingVertical: spacing.md },
  groupCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.sm },
  groupMedia: { height: 160, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  backgroundImage: { width: '100%', minHeight: 160, backgroundColor: colors.surfaceAlt },
  backgroundFallback: { minHeight: 160, backgroundColor: colors.primary + '12' },
  avatarWrap: { position: 'absolute', left: 16, bottom: 16 },
  avatar: { width: 56, height: 56, borderRadius: 18, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.surface },
  avatarFallback: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  avatarFallbackText: { color: colors.primary, fontWeight: '900', fontSize: 20 },
  groupName: { fontSize: 17, fontWeight: '900', color: colors.text },
  groupMeta: { fontSize: 12, color: colors.textLight, fontWeight: '700' },
  groupBody: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  groupHint: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, fontStyle: 'italic' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  actionBtnText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  actionBtnPrimary: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primary },
  actionBtnPrimaryText: { fontSize: 12, fontWeight: '800', color: colors.white },
  actionBtnDanger: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.error + '12', borderWidth: 1, borderColor: colors.error + '20' },
  actionBtnDangerText: { fontSize: 12, fontWeight: '800', color: colors.error },
  adminReviewCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.sm },
  reviewCard: { backgroundColor: colors.surfaceAlt, borderRadius: 20, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.sm },
  reviewTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  answerBlock: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, gap: 2 },
  answerQuestion: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase' },
  answerValue: { fontSize: 13, color: colors.text, fontWeight: '700' },
  postCard: { backgroundColor: colors.surface, borderRadius: 20, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, gap: 4 },
});