import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Image,
  Modal,
  TextInput,
  Alert,
  ImageBackground,
} from 'react-native';
declare const require: (path: string) => any;
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { a0 } from 'a0-sdk';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { showSuccessToast } from '../lib/toast';
import { PUBLIC_LANDING_URL } from '../lib/shareUtils';
import UserAvatar from '../lib/UserAvatar';

const appBackgroundImage = require('../assets/WhatsApp Image 2026-05-06 at 10.25.35 AM.jpeg');

const SUPPORT_EMAIL = 'vincenta@hyundai.co.za';
const DELETE_REQUEST_SUBJECT = 'Account and Data Deletion Request';
const DELETE_REQUEST_BODY = 'Hello,\n\nPlease delete my account and all associated data.\n\nName: \nEmail: \nPhone: \n\nThank you.';
const VINCENT_ADMIN_EMAILS = ['vincentmm@hyundai.co.za', 'vincentmmm@hyundai.co.za'];

export default function ProfileScreen({ navigation }: any) {
  const user = useQuery(api.users.me);
  const vehicles = useQuery(api.vehicles.list) ?? [];
  const bookings = useQuery(api.bookings.listMine) ?? [];
  const myGalleryPosts = useQuery(api.posts.listPostsByUser, user?._id ? { userId: user._id, limit: 100 } : 'skip') ?? [];
  const onlineStaffQuery = useQuery(api.staff.publicOnlineServiceStaff, {});
  const onlineStaff = onlineStaffQuery ?? [];
  const { signOut } = useAuthActions();
  const updatePost = useMutation(api.posts.updatePost);
  const removePost = useMutation(api.posts.removePost);
  const permanentlyDeletePost = useMutation(api.posts.permanentlyDeletePost);
  const restoreAllMyPosts = useMutation(api.posts.restoreAllMyPosts);
  const isStaff = user?.role === 'staff';
  const canAccessAdmin = Boolean(
    user?.isOwner ||
    String(user?.role ?? '').trim().toLowerCase() === 'admin' ||
    VINCENT_ADMIN_EMAILS.includes(String(user?.email ?? '').trim().toLowerCase()) ||
    user?.staffRole === 'dp' ||
    user?.accessLevel === 'full_access'
  );
  const userDealershipLine = [user?.dealershipName, user?.dealershipLocation].filter(Boolean).join(' • ');

  const [editingPost, setEditingPost] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [savingPost, setSavingPost] = useState(false);

  const availableStaff = onlineStaff
    .map((staff: any) => ({
      key: staff.userId ?? staff._id,
      ...staff,
      subtitle: staff.isOnline ? 'Online now' : 'Recently active',
      isVirtual: false,
    }))
    .filter((staff: any) => Boolean(String(staff.key ?? '').trim()));

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (e) {
      // fallback
    }
    try {
      await a0.auth.signOut();
    } catch (e) {
      // fallback
    }
  };

  const handleDeleteRequest = () => {
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(DELETE_REQUEST_SUBJECT)}&body=${encodeURIComponent(DELETE_REQUEST_BODY)}`;
    Linking.openURL(mailto).catch(() => {});
  };

  const openStaffChat = (staff: any) => {
    if (staff.isVirtual) {
      navigation.navigate('AIChat');
      return;
    }

    const recipientId = String(staff.userId ?? staff._id ?? '').trim();
    if (!recipientId) {
      return;
    }

    navigation.navigate('StaffChat', {
      recipientId,
      recipientName: staff.name,
      chatType: 'staff',
    });
  };

  const openStaffCall = async (staff: any) => {
    const phone = String(staff.phone ?? '').trim();
    if (!phone) {
      Alert.alert('No phone number', 'This staff member does not have a phone number saved.');
      return;
    }

    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      Alert.alert('Call failed', 'Unable to open the phone app.');
    }
  };

  const openMyPostActions = (post: any) => {
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

  const customerMenuItems = [
    {
      icon: 'newspaper-outline',
      label: 'Car Community Feed',
      value: 'Photos, stories, news, specials, competitions, and recommendations',
      onPress: () => navigation.navigate('SocialFeed'),
    },
    {
      icon: 'create-outline',
      label: 'Edit Profile',
      value: 'Picture, phone number, and vehicle details',
      onPress: () => navigation.navigate('ProfileEdit'),
    },
  ];

  const socialMenuItems = [
    {
      icon: 'globe-outline',
      label: 'App Website',
      value: 'Open the web home URL',
      onPress: () => {
        Linking.openURL(PUBLIC_LANDING_URL).catch(() => {});
      },
    },
    {
      icon: 'wallet-outline',
      label: 'Staff Wallet',
      value: 'Sales booking commissions and PDF invoices',
      onPress: () => navigation.navigate('StaffWallet'),
    },
    {
      icon: 'call-outline',
      label: 'Contact Us',
      value: 'Support and dealership contact page',
      onPress: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {}),
    },
    {
      icon: 'shield-checkmark-outline',
      label: 'Privacy Policy',
      value: 'Public policy link for app stores and web',
      onPress: () => navigation.navigate('PrivacyPolicy'),
    },
    {
      icon: 'document-text-outline',
      label: 'Terms of Service',
      value: 'Public terms link for app stores and web',
      onPress: () => navigation.navigate('TermsOfService'),
    },
  ];

  const adminMenuItems = canAccessAdmin
    ? [
        {
          icon: 'shield-checkmark-outline',
          label: 'Admin Panel',
          value: 'Open customer-side admin access',
          onPress: () => navigation.navigate('AdminConsole'),
        },
      ]
    : [];

  const staffMenuItems = [
    {
      icon: 'newspaper-outline',
      label: 'Car Community Feed',
      value: 'Publish updates, specials, and recommendations',
      onPress: () => navigation.navigate('SocialFeed'),
    },
    {
      icon: 'chatbubbles-outline',
      label: 'Team Messages',
      value: 'Message colleagues in your dealership network',
      onPress: () => navigation.navigate('StaffMessages'),
    },
    {
      icon: 'sparkles-outline',
      label: 'KiRA Assistant',
      value: 'Open your AI assistant',
      onPress: () => navigation.navigate('AIChat'),
    },
    {
      icon: 'settings-outline',
      label: 'Edit Profile',
      value: 'Picture, phone number, and vehicle details',
      onPress: () => navigation.navigate('ProfileEdit'),
    },
  ];

  const menuItems = isStaff ? staffMenuItems : customerMenuItems;

  const displayName = user?.displayName ?? user?.name ?? 'User';
  const profileImage = user?.profileImage ?? user?.image ?? '';
  const phone = user?.phone ?? '';
  const alternatePhone = user?.alternatePhone ?? '';
  const birthday = user?.birthday ?? '';
  const address = user?.address ?? '';
  const preferredContactMethod = user?.preferredContactMethod ?? '';
  const profileNotes = user?.profileNotes ?? '';
  const bio = user?.bio ?? '';

  const roleBadge = isStaff
    ? user?.staffRole === 'sales_executive'
      ? 'Sales Executive'
      : 'Service Advisor'
    : 'Customer';

  return (
    <View style={styles.container}>
      <ImageBackground source={appBackgroundImage} style={styles.wallpaper} resizeMode="cover">
        <View style={styles.wallpaperOverlay} />
        <SafeAreaView edges={['top']} style={styles.safe}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.screenTitle}>Profile</Text>

            {/* User Card */}
            <View style={styles.userCard}>
              <UserAvatar uri={profileImage} name={displayName} size={56} style={{ marginRight: spacing.lg }} />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{displayName}</Text>
                <Text style={styles.userEmail}>{user?.email ?? ''}</Text>
                <View style={[styles.roleBadge, isStaff && { backgroundColor: '#059669' + '15' }]}>
                  <View style={[styles.roleDot, isStaff && { backgroundColor: '#059669' }]} />
                  <Text style={[styles.roleText, isStaff && { color: '#059669' }]}>
                    {roleBadge}
                  </Text>
                </View>
                {isStaff && userDealershipLine ? <Text style={styles.dealershipLine}>{userDealershipLine}</Text> : null}
                <Text style={styles.detailLine}>{phone || 'No phone number added yet'}</Text>
                <Text style={styles.detailLine}>{alternatePhone || 'No alternate phone added yet'}</Text>
                <Text style={styles.detailLine}>{birthday || 'Birthday not added yet'}</Text>
                <Text style={styles.detailLine}>{address || 'Address not added yet'}</Text>
                <Text style={styles.detailLine}>{preferredContactMethod || 'Preferred contact method not set'}</Text>
                {profileNotes ? <Text style={styles.detailLine}>{profileNotes}</Text> : null}
                {bio ? <Text style={styles.detailLine}>{bio}</Text> : null}
              </View>
              <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('ProfileEdit')}>
                <Ionicons name="settings-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Stats (only for customers) */}
            {!isStaff && (
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{vehicles.length}</Text>
                  <Text style={styles.statLabel}>Vehicles</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{bookings.length}</Text>
                  <Text style={styles.statLabel}>Bookings</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statNum}>
                    {bookings.filter((b: any) => b.status === 'completed').length}
                  </Text>
                  <Text style={styles.statLabel}>Completed</Text>
                </View>
              </View>
            )}

            <Text style={styles.sectionLabel}>Gallery</Text>
            <View style={styles.gallerySection}>
              {myGalleryPosts.length > 0 ? (
                <View style={styles.galleryGrid}>
                  {myGalleryPosts.map((post: any) => {
                    const coverUri = post.image || post.imageUrls?.[0] || post.video || '';
                    const isVideo = Boolean(post.video || post.videoStorageId);
                    return (
                      <TouchableOpacity key={post.postId} style={styles.galleryTile} activeOpacity={0.85} onPress={() => openMyPostActions(post)}>
                        <View style={styles.galleryOptionsBadge}>
                          <Ionicons name="ellipsis-horizontal" size={16} color={colors.white} />
                        </View>
                        {coverUri && !isVideo ? (
                          <Image source={{ uri: coverUri }} style={styles.galleryImage} />
                        ) : (
                          <View style={styles.galleryVideoTile}>
                            <Ionicons name="play-circle" size={28} color={colors.primary} />
                            <Text style={styles.galleryVideoText}>{isVideo ? 'Video' : 'Post'}</Text>
                          </View>
                        )}
                        <Text style={styles.galleryCaption} numberOfLines={1}>
                          {post.title || post.content || 'Shared post'}
                        </Text>
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
            </View>

            {/* Menu */}
            <View style={styles.menuSection}>
              {menuItems.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.menuItem}
                  onPress={item.onPress}
                >
                  <Ionicons name={item.icon as any} size={22} color={colors.primary} />
                  <View style={styles.menuText}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Text style={styles.menuValue}>{item.value}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                </TouchableOpacity>
              ))}
              {adminMenuItems.map((item, idx) => (
                <TouchableOpacity
                  key={`admin-${idx}`}
                  style={styles.menuItem}
                  onPress={item.onPress}
                >
                  <Ionicons name={item.icon as any} size={22} color={colors.primary} />
                  <View style={styles.menuText}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Text style={styles.menuValue}>{item.value}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                </TouchableOpacity>
              ))}
            </View>

            {!isStaff ? (
              <>
                <Text style={styles.sectionLabel}>Available Staff</Text>
                <View style={styles.menuSection}>
                  {availableStaff.length > 0 ? (
                    availableStaff.map((staff: any) => (
                      <TouchableOpacity key={String(staff.key)} style={styles.menuItem} onPress={() => openStaffChat(staff)}>
                        <UserAvatar uri={staff.profileImage} name={staff.name} size={34} backgroundColor={colors.primary + '15'} textColor={colors.primary} />
                        <View style={styles.menuText}>
                          <Text style={styles.menuLabel}>{staff.name}</Text>
                          <Text style={styles.menuValue}>{staff.subtitle ?? `${String(staff.role || 'staff').replace('_', ' ')} · ${staff.isOnline ? 'Online now' : 'Recently active'}`}</Text>
                        </View>
                        <TouchableOpacity onPress={() => openStaffChat(staff)} style={{ marginRight: 8 }}>
                          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => void openStaffCall(staff)}>
                          <Ionicons name="call-outline" size={18} color={colors.primary} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))
                  ) : null}
                </View>
              </>
            ) : null}

            {/* Social & Sharing */}
            <Text style={styles.sectionLabel}>Social & Sharing</Text>
            <View style={styles.menuSection}>
              {socialMenuItems.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.menuItem}
                  onPress={item.onPress}
                >
                  <Ionicons name={item.icon as any} size={22} color={colors.accent} />
                  <View style={styles.menuText}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Text style={styles.menuValue}>{item.value}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Sign Out */}
            <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.signOutBtn, { marginTop: spacing.md }]} onPress={handleDeleteRequest}>
              <Ionicons name="trash-outline" size={20} color={colors.primary} />
              <Text style={[styles.signOutText, { color: colors.primary }]}>Request Account & Data Deletion</Text>
            </TouchableOpacity>

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
          </ScrollView>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  wallpaper: { flex: 1 },
  wallpaperOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3, 8, 20, 0.22)' },
  safe: { flex: 1, backgroundColor: 'transparent' },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    paddingTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: { width: 56, height: 56, borderRadius: 28 },
  avatarText: { fontSize: 22, fontWeight: '700', color: colors.white },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: '600', color: colors.text },
  userEmail: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  detailLine: { fontSize: 12, color: colors.textLight, marginTop: 5 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    backgroundColor: colors.primary + '10',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  dealershipLine: { fontSize: 11, fontWeight: '800', color: colors.primary, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '700', color: colors.primary },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
  menuSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.xxl,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  menuText: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: '500', color: colors.text },
  menuValue: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  staffAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  staffAvatarImage: { width: '100%', height: '100%' },
  staffAvatarText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  gallerySection: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.xxl,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  galleryTile: {
    width: '31%',
    minHeight: 118,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.sm,
  },
  galleryImage: { width: '100%', height: 86, backgroundColor: colors.surfaceAlt },
  galleryVideoTile: { flex: 1, minHeight: 86, alignItems: 'center', justifyContent: 'center', gap: 6, padding: spacing.sm },
  galleryVideoText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  galleryCaption: { paddingHorizontal: 8, paddingVertical: 8, fontSize: 10, fontWeight: '700', color: colors.textSecondary },
  galleryEmpty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: spacing.md },
  galleryEmptyText: { fontSize: 12, fontWeight: '700', color: colors.textLight },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.error + '30',
  },
  signOutText: { fontSize: 16, fontWeight: '600', color: colors.error },
  editOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  editCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, borderTopWidth: 1, borderColor: colors.borderLight },
  editTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  editInput: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, color: colors.text, marginBottom: spacing.sm, textAlignVertical: 'top' },
  editSaveBtn: { alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.primary, marginTop: spacing.sm },
  editSaveText: { color: colors.white, fontWeight: '800' },
  editCancelBtn: { alignItems: 'center', paddingVertical: spacing.md },
  editCancelText: { color: colors.textSecondary, fontWeight: '700' },
  galleryOptionsBadge: { position: 'absolute', top: 8, right: 8, zIndex: 10, backgroundColor: colors.primary, borderRadius: 8, padding: 2, alignItems: 'center' },
});