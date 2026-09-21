import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Platform, Linking, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

const appBackgroundImage: any = undefined;

export default function BrochureManagerScreen({ navigation }: any) {
  const me = useQuery(api.users.me);
  const brochure = useQuery(api.brochures.getLatest);
  const brochuresPage = usePaginatedQuery(api.brochures.listPaged, {}, { initialNumItems: 8 });
  const allBrochures = brochuresPage.results ?? [];
  const generateUploadUrl = useMutation(api.inventory.generateUploadUrl);
  const uploadAndResolve = useMutation(api.inventory.uploadAndResolve);
  const uploadBrochure = useMutation(api.brochures.uploadBrochure);

  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');

  const canUpload = Boolean(me?.role === 'staff' || me?.role === 'admin' || me?.isOwner || me?.accessLevel === 'full_access' || ['dp', 'regional', 'regional_manager'].includes(String(me?.staffRole ?? '').toLowerCase()));

  useEffect(() => {
    if (!title && brochure?.title) setTitle(brochure.title);
  }, [brochure?.title, title]);

  const uploadFile = useCallback(async () => {
    if (!canUpload) return;
    try {
      setUploading(true);
      const DocumentPicker: any = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const uploadUrl = await generateUploadUrl({});
      let responseBody = '';
      if (Platform.OS === 'web') {
        const fetched = await fetch(asset.uri).then((r) => r.blob());
        const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': asset.mimeType ?? 'application/pdf' }, body: fetched });
        responseBody = await response.text();
      } else {
        const FileSystem = await import('expo-file-system');
        const response = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': asset.mimeType ?? 'application/pdf' },
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
      if (!storageId) throw new Error('Failed to upload brochure');
      const resolvedUrl = await uploadAndResolve({ storageId: storageId as any });
      setFileName(asset.name ?? 'Brochure.pdf');
      setFileUrl(resolvedUrl);
      Alert.alert('Uploaded', 'Brochure file ready to publish.');
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Could not upload brochure');
    } finally {
      setUploading(false);
    }
  }, [canUpload, generateUploadUrl, uploadAndResolve]);

  const handleBrochureScroll = useCallback((event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 220;
    if (!nearBottom) return;
    if (brochuresPage.status !== 'CanLoadMore') return;
    void brochuresPage.loadMore(8);
  }, [brochuresPage]);

  const publishBrochure = async () => {
    if (!title.trim() || !fileUrl || !fileName) {
      Alert.alert('Missing information', 'Please upload a brochure and add a title before publishing.');
      return;
    }
    try {
      setUploading(true);
      await uploadBrochure({
        title: title.trim(),
        fileName,
        fileUrl,
        storageId: fileUrl,
        mimeType: 'application/pdf',
      });
      Alert.alert('Published', 'Customers can now download the latest brochure from the main screen.');
    } catch (e: any) {
      Alert.alert('Publish failed', e?.message ?? 'Could not publish brochure');
    } finally {
      setUploading(false);
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
              <Text style={styles.headerTitle}>Brochure Manager</Text>
              <Text style={styles.headerSubtitle}>Upload the latest brochure for customers to download on the main screen.</Text>
            </View>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} onScroll={handleBrochureScroll} scrollEventThrottle={16}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Current brochure</Text>
            {brochure ? (
              <>
                <Text style={styles.summaryValue}>{brochure.title}</Text>
                <Text style={styles.summaryMeta}>{brochure.fileName}</Text>
                <TouchableOpacity style={styles.downloadBtn} onPress={() => Linking.openURL(brochure.fileUrl).catch(() => Alert.alert('Unavailable', 'Unable to open brochure link.'))}>
                  <Ionicons name="download-outline" size={18} color={colors.white} />
                  <Text style={styles.downloadBtnText}>Open brochure</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.summaryMeta}>No brochure has been published yet.</Text>
            )}
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Publish brochure</Text>
            <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Brochure title" placeholderTextColor={colors.textLight} />
            <TouchableOpacity style={styles.uploadBtn} onPress={uploadFile} disabled={uploading || !canUpload}>
              <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
              <Text style={styles.uploadBtnText}>{uploading ? 'Uploading...' : 'Upload brochure PDF'}</Text>
            </TouchableOpacity>
            {fileName ? <Text style={styles.fileMeta}>{fileName}</Text> : null}
            <TouchableOpacity style={styles.primaryBtn} onPress={publishBrochure} disabled={uploading || !canUpload}>
              <Text style={styles.primaryBtnText}>{uploading ? 'Publishing...' : 'Publish brochure'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.listCard}>
            <Text style={styles.sectionTitle}>Previous uploads</Text>
            {allBrochures.length ? allBrochures.map((item: any) => (
              <View key={item._id} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{item.title}</Text>
                  <Text style={styles.listMeta}>{item.fileName}</Text>
                </View>
                <View style={[styles.statusPill, item.isActive && styles.statusPillActive]}>
                  <Text style={[styles.statusText, item.isActive && styles.statusTextActive]}>{item.isActive ? 'Active' : 'Archived'}</Text>
                </View>
              </View>
            )) : <Text style={styles.summaryMeta}>No uploads yet.</Text>}
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
  summaryCard: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, marginBottom: spacing.md },
  summaryTitle: { fontSize: 12, fontWeight: '900', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.8 },
  summaryValue: { fontSize: 18, fontWeight: '900', color: colors.text, marginTop: 6 },
  summaryMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 19 },
  downloadBtn: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14 },
  downloadBtnText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  formCard: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, marginBottom: spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: colors.text, marginBottom: spacing.sm },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 14, marginBottom: spacing.md },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary + '12', borderRadius: 16, paddingVertical: 14, borderWidth: 1, borderColor: colors.primary + '24', marginBottom: spacing.md },
  uploadBtnText: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  fileMeta: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.md },
  primaryBtn: { backgroundColor: colors.success, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  listCard: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.borderLight },
  listTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  listMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceAlt },
  statusPillActive: { backgroundColor: colors.primary + '12' },
  statusText: { fontSize: 11, fontWeight: '900', color: colors.textSecondary },
  statusTextActive: { color: colors.primary },
});