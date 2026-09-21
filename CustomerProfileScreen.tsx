import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Image,
  Platform,
  Linking,
  Alert,
  Modal,
  Animated,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import * as FileSystem from 'expo-file-system';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { showSuccessToast } from '../lib/toast';
import UserAvatar from '../lib/UserAvatar';

export default function CustomerProfileScreen({ route, navigation }: any) {
  const rawUserId = route?.params?.userId;
  const userId = rawUserId ? String(rawUserId) : '';
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('bookings');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const screenEnter = useRef(new Animated.Value(0)).current;
  const modalEnter = useRef(new Animated.Value(0)).current;

  const user = useQuery(api.users.getUserById, userId ? { userId } : 'skip');
  const bookings = useQuery(api.bookings.listByUser, userId ? { userId } : 'skip') ?? [];
  const profileTimeline = useQuery(api.activityLog.getCustomerTimeline, userId ? { userId, limit: 300 } : 'skip') ?? [];
  const messages = useQuery(api.messages.listDirectMessages, userId ? { customerId: userId } : 'skip');
  const customerGalleryPosts = useQuery(api.posts.listPostsByUser, userId ? { userId, limit: 100 } : 'skip') ?? [];
  const activity = useQuery(api.activityLog.list, { limit: 100 }) ?? [];
  const adminUpdateUserProfile = useMutation(api.users.adminUpdateUserProfile);
  const generateProfileUploadUrl = useMutation(api.users.generateProfileUploadUrl);
  const updatePost = useMutation(api.posts.updatePost);
  const removePost = useMutation(api.posts.removePost);
  const permanentlyDeletePost = useMutation(api.posts.permanentlyDeletePost);
  const restoreAllMyPosts = useMutation(api.posts.restoreAllMyPosts);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [savingPost, setSavingPost] = useState(false);

  useEffect(() => {
    Animated.timing(screenEnter, {
      toValue: 1,
      duration: 360,
      useNativeDriver: true,
    }).start();
  }, [screenEnter]);

  useEffect(() => {
    Animated.timing(modalEnter, {
      toValue: showPhotoModal ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [modalEnter, showPhotoModal]);

  const screenMotion = {
    opacity: screenEnter,
    transform: [{ translateY: screenEnter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  const photoModalMotion = {
    opacity: modalEnter,
    transform: [{ scale: modalEnter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
  };

  if (!userId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={42} color={colors.textLight} />
          <Text style={styles.emptyText}>Customer profile is unavailable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user || !bookings) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

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
      name: asset.name || undefined,
      fileName: asset.name || undefined,
      mimeType: asset.mimeType || 'image/jpeg',
    } as any;
  };

  const handlePickPhoto = async () => {
    try {
      const asset = await pickImageAsset();
      if (!asset) return;

      setUploadingPhoto(true);
      const uploadUrl = await generateProfileUploadUrl();
      const response = Platform.OS === 'web'
        ? await globalThis.fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': asset.mimeType || 'image/jpeg' },
            body: asset.file instanceof (globalThis as any).Blob ? asset.file : await globalThis.fetch(asset.uri).then((res: any) => res.blob()),
          })
        : await FileSystem.uploadAsync(uploadUrl, asset.uri, {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { 'Content-Type': asset.mimeType || 'image/jpeg' },
          });
      const responseText = Platform.OS === 'web'
        ? await (response as Response).text()
        : String((response as any).body ?? '');
      let storageId = '';
      try {
        const parsed = JSON.parse(responseText);
        storageId = String(parsed.storageId || parsed.id || '').trim();
      } catch {
        storageId = responseText.trim();
      }
      if (storageId) {
        await adminUpdateUserProfile({ userId, profileImageStorageId: storageId as any });
        showSuccessToast('Profile picture updated', 'Customer photo uploaded successfully.');
        return;
      }
      throw new Error('Could not save profile picture');
    } catch (err: any) {
      Alert.alert('Profile picture', err?.message || 'Could not update profile picture');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const openPhotoModal = () => {
    setShowPhotoModal(true);
  };

  const runPhotoPicker = async () => {
    setShowPhotoModal(false);
    await handlePickPhoto();
  };

  const customerMessages = messages || [];
  const customerActivity = profileTimeline.length > 0
    ? profileTimeline
    : activity.filter((a: any) => a.triggeredBy === userId || a.ownerUserId === userId || a.customerUserId === userId);
  const completedBookings = (bookings || []).filter((b: any) => b.status === 'completed');
  const pendingBookings = (bookings || []).filter((b: any) => b.status === 'pending' || b.status === 'confirmed');
  const latestPartsOrderMessage = [...customerMessages].reverse().find((message: any) => Boolean(message.partsOrderId));
  const latestPartsOrderId = latestPartsOrderMessage?.partsOrderId ? String(latestPartsOrderMessage.partsOrderId) : '';
  const latestPartsOrderTitle = String(latestPartsOrderMessage?.content ?? '').trim() || undefined;
  const initials = String(user.displayName ?? user.name ?? user.email ?? '?').trim().charAt(0).toUpperCase();
  const profileImage = user.profileImage ?? user.image ?? '';
  const customerName = String(user.displayName ?? user.name ?? user.email ?? 'Customer').trim();
  const dialableNumber = String(user.whatsappNumber ?? user.phone ?? user.alternatePhone ?? '').trim();
  const whatsappDigits = dialableNumber.replace(/\D/g, '');
  const whatsappNumber = whatsappDigits.length === 10 && whatsappDigits.startsWith('0')
    ? `27${whatsappDigits.slice(1)}`
    : whatsappDigits;

  const openCustomerChat = () => {
    const chatParams = {
      customerId: userId,
      customerName,
    } as const;

    if (latestPartsOrderId) {
      navigation.navigate('StaffChat', {
        ...chatParams,
        recipientId: userId,
        recipientName: customerName,
        chatType: 'parts_order',
        partsOrderId: latestPartsOrderId,
        partsOrderTitle: latestPartsOrderTitle,
      });
      return;
    }

    navigation.navigate('StaffChat', {
      ...chatParams,
      recipientId: userId,
      recipientName: customerName,
      chatType: 'direct',
    });
  };

  const openCustomerCall = async () => {
    if (!dialableNumber) {
      Alert.alert('No phone number', 'This customer does not have a call number saved.');
      return;
    }
    try {
      await Linking.openURL(`tel:${dialableNumber}`);
    } catch {
      Alert.alert('Call failed', 'Unable to open the phone app.');
    }
  };

  const openCustomerWhatsApp = async () => {
    if (!whatsappNumber) {
      Alert.alert('No WhatsApp number', 'This customer does not have a WhatsApp number saved.');
      return;
    }
    const message = `Hi ${customerName},`;
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('WhatsApp failed', 'Unable to open WhatsApp for this customer.');
    }
  };

  const openCustomerOptions = () => {
    Alert.alert(customerName, 'Choose an action', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Message', onPress: openCustomerChat },
      { text: 'Call', onPress: openCustomerCall },
      { text: 'WhatsApp', onPress: openCustomerWhatsApp },
      { text: 'Pick Photo', onPress: openPhotoModal },
      { text: 'Follow-up reminder', onPress: () => openFollowUpReminder(user.profileNotes) },
    ]);
  };

  const openFollowUpReminder = (noteBody?: string) => {
    const today = new Date().toISOString().split('T')[0];
    navigation.navigate('Calendar', {
      voiceDraft: {
        title: `Follow-up with ${customerName}`,
        details: noteBody?.trim() || `Follow up after call with ${customerName}`,
        date: today,
        allDay: true,
        source: 'manual',
      },
    });
  };

  const renderBookingCard = ({ item }: any) => (
    <TouchableOpacity
      style={styles.bookingCard}
      onPress={() => navigation.navigate('BookingDetail', { bookingId: item._id })}
    >
      <View style={styles.bookingHeader}>
        <Text style={styles.bookingService}>{item.serviceType}</Text>
        <View style={[styles.statusBadge, { backgroundColor: item.status === 'pending' ? '#FF9800' : '#4CAF50' }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.bookingDate}>{item.date} {item.timeSlot}</Text>
      {item.assignedToName && (
        <Text style={styles.bookingAssigned}>Assigned to: {item.assignedToName}</Text>
      )}
    </TouchableOpacity>
  );

  const renderMessageItem = ({ item }: any) => (
    <TouchableOpacity style={styles.messageItem} activeOpacity={0.85} onPress={() => {
      if (item.partsOrderId) {
        navigation.navigate('StaffChat', {
          customerId: userId,
          customerName,
          recipientId: userId,
          recipientName: customerName,
          chatType: 'parts_order',
          partsOrderId: String(item.partsOrderId),
          partsOrderTitle: item.content,
        });
        return;
      }
      openCustomerChat();
    }}>
      <View style={styles.messageMeta}>
        <Text style={styles.messageSender}>{item.senderName}</Text>
        <View style={styles.messageMetaRight}>
          <Text style={styles.messageTime}>{new Date(item._creationTime).toLocaleDateString()}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
        </View>
      </View>
      <Text style={styles.messageContent} numberOfLines={2}>{item.content}</Text>
      {item.attachmentUrls?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.messageAttachmentsRow} contentContainerStyle={styles.messageAttachmentsContent}>
          {item.attachmentUrls.map((url: string, idx: number) => (
            <View key={`${item._id}-asset-${idx}`} style={styles.messageAttachmentThumb}>
              <Image source={{ uri: url }} style={styles.messageAttachmentImage} />
            </View>
          ))}
        </ScrollView>
      ) : null}
    </TouchableOpacity>
  );

  const renderActivityItem = ({ item }: any) => (
    <View style={styles.activityItem}>
      <Ionicons name="information-circle" size={16} color={colors.primary} />
      <View style={styles.activityContent}>
        <Text style={styles.activityTitle}>{item.title}</Text>
        <Text style={styles.activityTime}>{new Date(item._creationTime).toLocaleDateString()}</Text>
      </View>
    </View>
  );

  const openPostActions = (post: any) => {
    Alert.alert('Post options', post.title || post.content || 'Manage this post', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Edit',
        onPress: () => {
          setEditingPost(post);
          setEditTitle(post.title ?? '');
          setEditContent(post.content ?? '');
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete post?', 'This will permanently remove the post.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await removePost({ postId: post.postId });
                  showSuccessToast('Post deleted', 'The post was removed successfully.');
                } catch (error: any) {
                  Alert.alert('Post', error?.message || 'Could not delete post');
                }
              },
            },
          ]);
        },
      },
      {
        text: 'Delete permanently',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete permanently?', 'This removes the post from the backend.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete permanently',
              style: 'destructive',
              onPress: async () => {
                try {
                  await permanentlyDeletePost({ postId: post.postId });
                  showSuccessToast('Post deleted permanently', 'The post was removed from the backend.');
                } catch (error: any) {
                  Alert.alert('Post', error?.message || 'Could not permanently delete post');
                }
              },
            },
          ]);
        },
      },
    ]);
  };

  const savePostEdit = async () => {
    if (!editingPost) return;
    setSavingPost(true);
    try {
      const payload: any = {
        postId: editingPost.postId,
      };
      const nextTitle = editTitle.trim();
      const nextContent = editContent.trim();
      if (nextTitle) payload.title = nextTitle;
      if (nextContent) payload.content = nextContent;
      await updatePost(payload);
      setEditingPost(null);
      setEditTitle('');
      setEditContent('');
      showSuccessToast('Post updated', 'Your changes were saved successfully.');
    } catch (error: any) {
      Alert.alert('Post', error?.message || 'Could not update post');
    } finally {
      setSavingPost(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.header, screenMotion]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerEyebrow}>STAFF PROFILE</Text>
            <Text style={styles.headerTitle}>Customer Profile</Text>
          </View>
          <TouchableOpacity onPress={openCustomerOptions} style={styles.iconButton}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={[styles.profileCard, screenMotion]}>
          <View style={styles.profileHeader}>
            <TouchableOpacity style={styles.avatarButton} activeOpacity={0.85} onPress={openPhotoModal}>
              <UserAvatar
                uri={profileImage}
                name={user.displayName ?? user.name ?? user.email}
                size={72}
                borderRadius={22}
                backgroundColor={colors.surfaceAlt}
                textColor={colors.primary}
                style={styles.avatarFrame}
              />
              <View style={styles.avatarBadge}>
                <Ionicons name="camera" size={14} color={colors.white} />
              </View>
            </TouchableOpacity>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user.displayName ?? user.name}</Text>
              <Text style={styles.profileEmail}>{user.email}</Text>
              <View style={styles.profilePillsRow}>
                <View style={styles.profilePill}><Ionicons name="calendar-outline" size={12} color={colors.primary} /><Text style={styles.profilePillText}>{bookings.length} bookings</Text></View>
                <View style={styles.profilePill}><Ionicons name="chatbubble-outline" size={12} color={colors.primary} /><Text style={styles.profilePillText}>{customerMessages.length} messages</Text></View>
              </View>
            </View>
          </View>

          <View style={styles.contactSection}>
            {user.phone && <TouchableOpacity style={styles.contactItem} onPress={openCustomerCall}><Ionicons name="call" size={18} color={colors.primary} /><Text style={styles.contactText}>{user.phone}</Text></TouchableOpacity>}
            {user.email && <TouchableOpacity style={styles.contactItem}><Ionicons name="mail" size={18} color={colors.primary} /><Text style={styles.contactText}>{user.email}</Text></TouchableOpacity>}
            {user.address && <View style={styles.contactItem}><Ionicons name="location" size={18} color={colors.primary} /><Text style={styles.contactText}>{user.address}</Text></View>}
            {user.preferredContactMethod && <View style={styles.contactItem}><Ionicons name="chatbubbles" size={18} color={colors.primary} /><Text style={styles.contactText}>{user.preferredContactMethod}</Text></View>}
            {user.birthday && <View style={styles.contactItem}><Ionicons name="gift" size={18} color={colors.primary} /><Text style={styles.contactText}>{user.birthday}</Text></View>}
            {user.profileNotes && <View style={styles.contactItem}><Ionicons name="document-text" size={18} color={colors.primary} /><Text style={styles.contactText}>{user.profileNotes}</Text></View>}
            {user.bio && <View style={styles.contactItem}><Ionicons name="person-circle" size={18} color={colors.primary} /><Text style={styles.contactText}>{user.bio}</Text></View>}
          </View>
        </Animated.View>

        <Animated.View style={[styles.galleryCard, screenMotion]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Gallery</Text>
            <Text style={styles.sectionHint}>{customerGalleryPosts.length} posts</Text>
          </View>
          {customerGalleryPosts.length > 0 ? (
            <View style={styles.galleryGrid}>
              {customerGalleryPosts.map((post: any) => {
                const coverUri = post.image || post.imageUrls?.[0] || post.video || '';
                const isVideo = Boolean(post.video || post.videoStorageId);
                return (
                  <TouchableOpacity key={post.postId} style={styles.galleryTile} activeOpacity={0.85} onPress={() => openPostActions(post)}>
                    {coverUri && !isVideo ? (
                      <Image source={{ uri: coverUri }} style={styles.galleryImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.galleryVideoTile}>
                        <Ionicons name="play-circle" size={28} color={colors.primary} />
                        <Text style={styles.galleryVideoText}>{isVideo ? 'Video' : 'Post'}</Text>
                      </View>
                    )}
                    <Text style={styles.galleryCaption} numberOfLines={1}>{post.title || post.content || 'Shared post'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.galleryEmpty}>
              <Ionicons name="images-outline" size={22} color={colors.textLight} />
              <Text style={styles.galleryEmptyText}>No gallery posts yet</Text>
            </View>
          )}
        </Animated.View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}><Text style={styles.statNumber}>{bookings.length}</Text><Text style={styles.statLabel}>Total</Text></View>
          <View style={styles.statCard}><Text style={styles.statNumber}>{completedBookings.length}</Text><Text style={styles.statLabel}>Completed</Text></View>
          <View style={styles.statCard}><Text style={styles.statNumber}>{pendingBookings.length}</Text><Text style={styles.statLabel}>Active</Text></View>
          <View style={styles.statCard}><Text style={styles.statNumber}>{customerMessages.length}</Text><Text style={styles.statLabel}>Messages</Text></View>
        </View>

        <View style={styles.tabContainer}>
          {['bookings', 'messages', 'activity'].map((tab) => (
            <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'bookings' && (
          <View style={styles.content}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Bookings</Text>
              <Text style={styles.sectionHint}>Tap to open details</Text>
            </View>
            {bookings.length > 0 ? <FlatList data={bookings} renderItem={renderBookingCard} keyExtractor={(item: any) => item._id} scrollEnabled={false} /> : <View style={styles.emptyState}><Ionicons name="calendar-outline" size={48} color={colors.text} /><Text style={styles.emptyText}>No bookings yet</Text></View>}
          </View>
        )}

        {activeTab === 'messages' && (
          <View style={styles.content}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Messages</Text>
              <Text style={styles.sectionHint}>Latest communication</Text>
            </View>
            {customerMessages.length > 0 ? <FlatList data={customerMessages} renderItem={renderMessageItem} keyExtractor={(item: any) => item._id} scrollEnabled={false} /> : <View style={styles.emptyState}><Ionicons name="chatbubble-outline" size={48} color={colors.text} /><Text style={styles.emptyText}>No messages</Text></View>}
          </View>
        )}

        {activeTab === 'activity' && (
          <View style={styles.content}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Activity</Text>
              <Text style={styles.sectionHint}>Customer timeline</Text>
            </View>
            {customerActivity.length > 0 ? <FlatList data={customerActivity} renderItem={renderActivityItem} keyExtractor={(item: any) => item._id} scrollEnabled={false} /> : <View style={styles.emptyState}><Ionicons name="timeline-outline" size={48} color={colors.text} /><Text style={styles.emptyText}>No activity</Text></View>}
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.actionButton} onPress={openCustomerChat} activeOpacity={0.85}>
          <Ionicons name="chatbubble-outline" size={20} color="white" />
          <Text style={styles.actionButtonText}>Message</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { marginLeft: spacing.md }]} onPress={openCustomerCall} activeOpacity={0.85}>
          <Ionicons name="call-outline" size={20} color="white" />
          <Text style={styles.actionButtonText}>Call</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showPhotoModal} transparent animationType="fade">
        <View style={styles.photoModalOverlay}>
          <Animated.View style={[styles.photoModalCard, photoModalMotion]}>
            <View style={styles.photoModalHeader}>
              <Text style={styles.photoModalTitle}>Profile Photo</Text>
              <TouchableOpacity onPress={() => setShowPhotoModal(false)} style={styles.photoModalClose}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.photoPreviewWrap}>
              <UserAvatar
                uri={profileImage}
                name={user.displayName ?? user.name ?? user.email}
                size={112}
                borderRadius={28}
                backgroundColor={colors.surfaceAlt}
                textColor={colors.primary}
                style={styles.photoPreviewAvatar}
              />
              <Text style={styles.photoPreviewName}>{customerName}</Text>
              <Text style={styles.photoPreviewHint}>Choose a clean, centered image for the best fit.</Text>
            </View>

            <TouchableOpacity
              style={[styles.photoActionBtn, uploadingPhoto && { opacity: 0.7 }]}
              onPress={runPhotoPicker}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="cloud-upload-outline" size={18} color={colors.white} />
              )}
              <Text style={styles.photoActionText}>{uploadingPhoto ? 'Uploading...' : 'Choose New Photo'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.photoSecondaryBtn} onPress={() => setShowPhotoModal(false)}>
              <Text style={styles.photoSecondaryText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.photoSecondaryBtn, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '24' }]}
              onPress={() => openFollowUpReminder(user.profileNotes)}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={[styles.photoSecondaryText, { color: colors.primary }]}>Create follow-up reminder</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={!!editingPost} transparent animationType="slide" onRequestClose={() => setEditingPost(null)}>
        <View style={styles.editOverlay}>
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>Edit post</Text>
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Title"
              placeholderTextColor={colors.textLight}
              style={styles.editInput}
            />
            <TextInput
              value={editContent}
              onChangeText={setEditContent}
              placeholder="Write something"
              placeholderTextColor={colors.textLight}
              style={[styles.editInput, { minHeight: 120 }]}
              multiline
            />
            <TouchableOpacity style={styles.editSaveBtn} onPress={savePostEdit} disabled={savingPost}>
              <Text style={styles.editSaveText}>{savingPost ? 'Saving...' : 'Save changes'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editCancelBtn} onPress={() => setEditingPost(null)}>
              <Text style={styles.editCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  iconButton: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderLight },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.md },
  headerEyebrow: { fontSize: 10, fontWeight: '800', color: colors.textLight, letterSpacing: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  profileCard: { backgroundColor: colors.surface, marginHorizontal: spacing.lg, marginVertical: spacing.md, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  avatarButton: { alignItems: 'center', justifyContent: 'center', marginRight: spacing.lg },
  avatarFrame: { borderWidth: 1, borderColor: colors.borderLight, overflow: 'hidden' },
  avatar: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 24, fontWeight: '900', color: colors.white },
  photoPill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '20' },
  photoPillText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  avatarBadge: { position: 'absolute', right: 0, top: 0, backgroundColor: colors.primary, borderRadius: 20, padding: 4, alignItems: 'center' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '800', color: colors.text },
  profileEmail: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
  profilePillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  profilePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight },
  profilePillText: { fontSize: 11, fontWeight: '700', color: colors.text },
  contactSection: { borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: spacing.md },
  contactItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.background, marginBottom: spacing.xs },
  contactText: { marginLeft: spacing.md, fontSize: 14, color: colors.text },
  galleryCard: { backgroundColor: colors.surface, marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  galleryTile: { width: '31%', minHeight: 118, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight },
  galleryOptionsBadge: { position: 'absolute', top: 8, right: 8, zIndex: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.text + 'AA', alignItems: 'center', justifyContent: 'center' },
  galleryImage: { width: '100%', height: 86, backgroundColor: colors.surfaceAlt },
  galleryVideoTile: { minHeight: 86, alignItems: 'center', justifyContent: 'center', gap: 6, padding: spacing.sm, backgroundColor: colors.surfaceAlt },
  galleryVideoText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  galleryCaption: { paddingHorizontal: 8, paddingVertical: 8, fontSize: 10, fontWeight: '700', color: colors.textSecondary },
  galleryEmpty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: spacing.md },
  galleryEmptyText: { fontSize: 12, fontWeight: '700', color: colors.textLight },
  statsContainer: { flexDirection: 'row', marginHorizontal: spacing.lg, marginVertical: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.surface, marginHorizontal: spacing.xs, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight },
  statNumber: { fontSize: 20, fontWeight: '900', color: colors.primary },
  statLabel: { fontSize: 11, color: colors.text, marginTop: spacing.xs, fontWeight: '600' },
  tabContainer: { flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.borderLight, marginTop: spacing.md, marginHorizontal: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: 'hidden' },
  tab: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: colors.primary },
  tabText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  tabTextActive: { color: colors.primary, fontWeight: '800' },
  content: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  sectionHint: { fontSize: 11, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase' },
  bookingCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderLight, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  bookingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  bookingService: { fontSize: 14, fontWeight: '800', color: colors.text },
  statusBadge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: colors.primary + '12' },
  statusText: { color: colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  bookingDate: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.xs },
  bookingAssigned: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  messageItem: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  messageMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  messageMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  messageSender: { fontSize: 13, fontWeight: '800', color: colors.text },
  messageTime: { fontSize: 12, color: colors.textSecondary },
  messageContent: { fontSize: 13, color: colors.text, lineHeight: 18 },
  messageAttachmentsRow: { marginTop: spacing.sm },
  messageAttachmentsContent: { gap: spacing.sm },
  messageAttachmentThumb: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  messageAttachmentImage: { width: '100%', height: '100%' },
  activityItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  activityContent: { marginLeft: spacing.md, flex: 1 },
  activityTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  activityTime: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.text, marginTop: spacing.md },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.borderLight },
  actionButton: { flex: 1, minWidth: 100, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.md, backgroundColor: colors.primary, borderRadius: radius.lg },
  actionButtonText: { marginLeft: spacing.sm, color: colors.white, fontWeight: '700' },
  editOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  editCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, borderTopWidth: 1, borderColor: colors.borderLight },
  editTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  editInput: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, color: colors.text, marginBottom: spacing.sm, textAlignVertical: 'top' },
  editSaveBtn: { alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.primary, marginTop: spacing.sm },
  editSaveText: { color: colors.white, fontWeight: '800' },
  editCancelBtn: { alignItems: 'center', paddingVertical: spacing.md },
  editCancelText: { color: colors.textSecondary, fontWeight: '700' },
  photoModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.56)',
    paddingHorizontal: spacing.lg,
  },
  photoModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  photoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  photoModalClose: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  photoPreviewWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  photoPreviewAvatar: {
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  photoPreviewName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm,
  },
  photoPreviewHint: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  photoActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  photoActionText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },
  photoSecondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  photoSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});