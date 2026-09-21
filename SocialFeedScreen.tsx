import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  Pressable,
  Animated,
  StatusBar,
  ImageBackground,
  KeyboardAvoidingView,
} from 'react-native';
declare const require: (path: string) => any;
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, usePaginatedQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { a0 } from 'a0-sdk';
import { api } from '../lib/api';
import { colors, spacing, radius, shadows } from '../lib/theme';
import { showSuccessToast } from '../lib/toast';
import ShareSheetModal from './ShareSheetModal';
import { getPostShareMessage, getPostShareUrl } from '../lib/shareUtils';
import UserAvatar from '../lib/UserAvatar';
import { trackAnalyticsEvent } from '../lib/analytics';

const appBackgroundImage = require('../assets/WhatsApp Image 2026-05-06 at 10.25.35 AM.jpeg');

const REACTIONS = [
  { key: 'like', label: 'Like', icon: 'heart-outline' },
  { key: 'love', label: 'Love', icon: 'heart' },
  { key: 'celebrate', label: 'Celebrate', icon: 'sparkles' },
  { key: 'laugh', label: 'Laugh', icon: 'happy-outline' },
  { key: 'wow', label: 'Wow', icon: 'star-outline' },
  { key: 'sad', label: 'Sad', icon: 'sad-outline' },
  { key: 'angry', label: 'Angry', icon: 'fire-outline' },
] as const;

function goBackOrHome(navigation: any, fallbackRoute = 'Main') {
  if (navigation?.canGoBack?.()) {
    navigation.goBack();
  } else {
    navigation.navigate(fallbackRoute);
  }
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getStaffContactLabel(staffRole?: string) {
  const role = String(staffRole ?? '').toLowerCase();
  if (role.includes('service')) return 'Contact Service';
  if (role.includes('sales')) return 'Contact Sales';
  if (role.includes('principal') || role === 'dp' || role.includes('dealer')) return 'Contact Dealer Principal';
  return 'Tap to contact';
}

function inferMimeType(name?: string, fallback: 'image' | 'video' = 'image') {
  const ext = String(name ?? '').split('.').pop()?.trim().toLowerCase();
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'm4v') return 'video/x-m4v';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  return fallback === 'video' ? 'video/mp4' : 'image/jpeg';
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const MEDIA_GALLERY_WIDTH = SCREEN_WIDTH - spacing.lg * 2 - spacing.md * 2;
const DEFAULT_MEDIA_ASPECT_RATIO = 4 / 5;
const FEATURED_RAIL_ITEM_WIDTH = 180;
const FEATURED_RAIL_STEP = FEATURED_RAIL_ITEM_WIDTH + spacing.sm;
const MIN_MEDIA_HEIGHT = 210;
const MAX_MEDIA_HEIGHT = 460;
const DEFAULT_VIDEO_ASPECT_RATIO = 4 / 5;
const WIDE_SIDEBAR_WIDTH = 420;
const isWideLayout = SCREEN_WIDTH >= 1000;

type ComposerImage = {
  uri: string;
  name?: string;
  mimeType?: string;
  storageId?: string;
  file?: any;
};

function clampMediaHeight(aspectRatio: number) {
  return Math.max(MIN_MEDIA_HEIGHT, Math.min(MAX_MEDIA_HEIGHT, MEDIA_GALLERY_WIDTH / aspectRatio));
}

function useRemoteImageSizes(uris: string[]) {
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});

  useEffect(() => {
    let cancelled = false;
    setSizes({});

    uris.forEach((uri) => {
      Image.getSize(
        uri,
        (width: number, height: number) => {
          if (cancelled) return;
          setSizes((current: Record<string, { width: number; height: number }>) => {
            if (current[uri]?.width === width && current[uri]?.height === height) return current;
            return { ...current, [uri]: { width, height } };
          });
        },
        () => {
          if (cancelled) return;
          setSizes((current: Record<string, { width: number; height: number }>) => {
            if (current[uri]) return current;
            return current;
          });
        }
      );
    });

    return () => {
      cancelled = true;
    };
  }, [uris]);

  return sizes;
}

function MediaGallery({ uris }: { uris: string[] }) {
  const listRef = useRef<any>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentUri = uris[currentIndex] ?? uris[0];
  // Use default aspect ratio - don't block on calculating every image
  const aspectRatio = DEFAULT_MEDIA_ASPECT_RATIO;
  const currentHeight = clampMediaHeight(aspectRatio);

  if (!uris.length) return null;

  const scrollToIndex = (nextIndex: number) => {
    const bounded = Math.max(0, Math.min(nextIndex, uris.length - 1));
    listRef.current?.scrollToIndex({ index: bounded, animated: true });
    setCurrentIndex(bounded);
  };

  return (
    <View style={styles.galleryWrap}>
      <View style={[styles.galleryStage, { height: currentHeight }]}>
        <FlatList
          ref={listRef}
          data={uris}
          keyExtractor={(uri: string, idx: number) => `${uri}-${idx}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={MEDIA_GALLERY_WIDTH}
          snapToAlignment="start"
          disableIntervalMomentum
          getItemLayout={(_: ArrayLike<string> | null | undefined, index: number) => ({
            length: MEDIA_GALLERY_WIDTH,
            offset: MEDIA_GALLERY_WIDTH * index,
            index,
          })}
          onMomentumScrollEnd={(event: any) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / MEDIA_GALLERY_WIDTH);
            setCurrentIndex(Math.max(0, Math.min(nextIndex, uris.length - 1)));
          }}
          renderItem={({ item: uri }: { item: string }) => (
            <View style={[styles.gallerySlide, { height: currentHeight, width: MEDIA_GALLERY_WIDTH }]}>
              <Image
                source={{ uri }}
                style={[styles.mediaFill, { width: MEDIA_GALLERY_WIDTH, height: currentHeight }]}
                resizeMode="contain"
              />
            </View>
          )}
        />

        {uris.length > 1 ? (
          <View style={styles.galleryControls} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.galleryNavBtn, currentIndex === 0 && styles.galleryNavBtnDisabled]}
              onPress={() => scrollToIndex(currentIndex - 1)}
              disabled={currentIndex === 0}
            >
              <Ionicons name="chevron-back" size={18} color={colors.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.galleryNavBtn, currentIndex === uris.length - 1 && styles.galleryNavBtnDisabled]}
              onPress={() => scrollToIndex(currentIndex + 1)}
              disabled={currentIndex === uris.length - 1}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.white} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {uris.length > 1 ? (
        <>
          <View style={styles.galleryDots}>
            {uris.map((_, idx) => (
              <View key={idx} style={[styles.galleryDot, currentIndex === idx && styles.galleryDotActive]} />
            ))}
          </View>
          <View style={styles.galleryHintWrap}>
            <Text style={styles.galleryHintText}>Swipe or use the arrows to browse photos</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

function FeedImage({ sourceUri }: { sourceUri: string }) {
  // Use default aspect ratio - don't block on Image.getSize
  const height = clampMediaHeight(DEFAULT_MEDIA_ASPECT_RATIO);

  return (
    <View style={[styles.mediaFrame, { height }]}>
      <Image source={{ uri: sourceUri }} style={styles.mediaFill} resizeMode="contain" />
    </View>
  );
}

function FeedVideo({ sourceUri }: { sourceUri: string }) {
  const height = clampMediaHeight(DEFAULT_VIDEO_ASPECT_RATIO);
  const [loadError, setLoadError] = useState(false);
  const player = useVideoPlayer(sourceUri, (videoPlayer: any) => {
    videoPlayer.loop = false;
    videoPlayer.muted = false;
  });

  useEffect(() => {
    setLoadError(false);
  }, [sourceUri]);

  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }: any) => {
      if (status === 'error') {
        setLoadError(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [player]);

  if (loadError) {
    return (
      <View style={[styles.mediaFrame, styles.videoFrame, { height }]}>
        <View style={styles.videoFallback}>
          <View style={styles.videoPlayButton}>
            <Ionicons name="videocam" size={18} color={colors.white} />
          </View>
          <Text style={styles.videoFallbackText} numberOfLines={1}>
            Video unavailable
          </Text>
          <Text style={styles.videoFallbackMeta} numberOfLines={1}>
            {sourceUri}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.mediaFrame, styles.videoFrame, { height }]}>
      <VideoView
        player={player}
        style={styles.videoPlayer}
        contentFit="contain"
        nativeControls
      />
    </View>
  );
}

function ReadMoreText({ text, expanded, onToggle }: { text: string; expanded: boolean; onToggle: () => void }) {
  const shouldCollapse = text.length > 180;
  const visibleText = expanded || !shouldCollapse ? text : `${text.slice(0, 180).trimEnd()}...`;

  return (
    <View>
      <Text style={styles.content}>{visibleText}</Text>
      {shouldCollapse ? (
        <TouchableOpacity onPress={onToggle} style={styles.readMoreBtn}>
          <Text style={styles.readMoreText}>{expanded ? 'Show less' : 'Read more'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function AdaptivePostMedia({ item }: { item: any }) {
  const mediaUri = item.video || item.image;
  if (!mediaUri) return null;

  const isVideo = item.mediaType === 'video' || Boolean(item.video && !item.image);
  if (isVideo) {
    return <FeedVideo sourceUri={mediaUri} />;
  }

  if (item.imageUrls?.length > 1) {
    return <MediaGallery uris={item.imageUrls} />;
  }

  return <FeedImage sourceUri={mediaUri} />;
}

type PostType = 'community' | 'news' | 'special' | 'competition' | 'initiative' | 'club' | 'recommendation' | 'advert' | 'promotion' | 'cars';

const POST_TYPES: Array<{ key: PostType; label: string }> = [
  { key: 'advert', label: 'Adverts' },
  { key: 'special', label: 'Specials' },
  { key: 'promotion', label: 'Promotions' },
  { key: 'cars', label: 'Cars' },
  { key: 'initiative', label: 'Initiatives' },
  { key: 'club', label: 'Clubs' },
  { key: 'community', label: 'Stories' },
];

const POST_REACTION_LABELS: Record<string, string> = {
  like: 'Liked',
  love: 'Loved',
  celebrate: 'Celebrated',
  laugh: 'Laugh',
  wow: 'Wow',
  sad: 'Sad',
  angry: 'Angry',
};

type ReactionKey = keyof typeof POST_REACTION_LABELS;

type ReactionUiOverride = {
  myReaction?: ReactionKey;
  reactionCount?: number;
  hasLiked?: boolean;
};

type LiveWeatherState = {
  temperature: number | null;
  condition: string;
  location: string;
  updatedAt: number | null;
};

type LiveMarketState = {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  updatedAt: number | null;
};

type FeedWidgetKey = 'news' | 'weather' | 'markets' | 'suggested' | 'events' | 'competition' | 'initiative';

const MAIN_FEED_MENU = [
  { key: 'feed', label: 'Main feed', icon: 'newspaper-outline' },
  { key: 'events', label: 'Events', icon: 'calendar-outline' },
  { key: 'initiative', label: 'Social development initiatives', icon: 'leaf-outline' },
  { key: 'club', label: 'Car clubs', icon: 'people-outline' },
  { key: 'groups', label: 'Groups', icon: 'layers-outline' },
] as const;

const STAFF_MENU_ITEMS = [
  { key: 'staffMain', label: 'Staff Main', description: 'Dashboard and overview', icon: 'grid-outline', route: 'StaffMain' },
  { key: 'adminPanel', label: 'Admin Panel', description: 'Bookings management and admin tools', icon: 'shield-checkmark-outline', route: 'AdminConsole' },
  { key: 'staffProfile', label: 'Staff Profile', description: 'Staff profile and settings', icon: 'person-circle-outline', route: 'StaffProfile' },
  { key: 'messages', label: 'Messages', description: 'Direct messages and chats', icon: 'chatbubble-ellipses-outline', route: 'StaffMessages' },
  { key: 'notifications', label: 'Notifications', description: 'Alerts and attention items', icon: 'notifications-outline', route: 'Notifications' },
  { key: 'socialFeed', label: 'Social Feed', description: 'Staff feed and moderation', icon: 'newspaper-outline', route: 'SocialFeed' },
  { key: 'customerManagement', label: 'Customer Database', description: 'Search customer records fast', icon: 'people-circle-outline', route: 'CustomerManagement' },
  { key: 'users', label: 'Users', description: 'User moderation and account management', icon: 'person-remove-outline', route: 'Users' },
  { key: 'financeApplications', label: 'Finance Applications', description: 'View submitted finance applications', icon: 'document-text-outline', route: 'FinanceApplications' },
  { key: 'inventory', label: 'Inventory', description: 'Vehicle stock and details', icon: 'car-sport-outline', route: 'InventoryScreen' },
  { key: 'partsOrders', label: 'Parts & Accessories', description: 'Parts and accessory requests', icon: 'cube-outline', route: 'PartsOrders' },
  { key: 'serviceBookings', label: 'Service Bookings', description: 'Track service appointments', icon: 'calendar-outline', route: 'StaffInbox' },
  { key: 'calendarNotes', label: 'Calendar & Notes', description: 'Reminders and tasks', icon: 'calendar-number-outline', route: 'Calendar' },
  { key: 'events', label: 'Events', description: 'Live customer and staff events', icon: 'sparkles-outline', route: 'Events' },
  { key: 'groups', label: 'Groups', description: 'Group feeds and posts', icon: 'people-outline', route: 'Groups' },
  { key: 'socialDevelopment', label: 'Social Development Programmes', description: 'Initiatives and community programmes', icon: 'leaf-outline', route: 'Initiatives' },
  { key: 'testDriveBookings', label: 'Test Drive Bookings', description: 'Manage test drive slots', icon: 'car-outline', route: 'StaffTestDriveBookings' },
  { key: 'enquiries', label: 'Enquiries', description: 'Review new sales leads', icon: 'help-circle-outline', route: 'ActivityFeed' },
  { key: 'analytics', label: 'Analytics', description: 'Activity and performance', icon: 'stats-chart-outline', route: 'StaffAnalytics' },
] as const;

const CUSTOMER_MENU_ITEMS = [
  { key: 'availableStaff', label: 'Available Staff', description: 'See staff who can help', icon: 'people-outline', route: 'CustomerStaff' },
  { key: 'messages', label: 'Messages', description: 'Customer inbox and chats', icon: 'chatbubble-ellipses-outline', route: 'Messages' },
  { key: 'groups', label: 'Groups', description: 'Club and community feeds', icon: 'layers-outline', route: 'Groups' },
  { key: 'events', label: 'Events', description: 'Customer and staff events', icon: 'calendar-outline', route: 'Events' },
  { key: 'socialDevelopment', label: 'Social Development Programmes', description: 'Feeds and programmes', icon: 'leaf-outline', route: 'Initiatives' },
] as const;

const VINCENT_ADMIN_EMAILS = ['vincentmm@hyundai.co.za', 'vincentmmm@hyundai.co.za'];

function canUserSeeAdminPanel(user: any) {
  const email = String(user?.email ?? '').trim().toLowerCase();
  return Boolean(
    user?.isOwner ||
    String(user?.role ?? '').trim().toLowerCase() === 'admin' ||
    VINCENT_ADMIN_EMAILS.includes(email) ||
    user?.staffRole === 'dp' ||
    user?.accessLevel === 'full_access'
  );
}

function formatCompactPrice(value: number | null) {
  if (value === null || Number.isNaN(value)) return '—';
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toFixed(2);
}

function formatSigned(value: number | null, fractionDigits = 2) {
  if (value === null || Number.isNaN(value)) return '—';
  const fixed = value.toFixed(fractionDigits);
  return value > 0 ? `+${fixed}` : fixed;
}

export default function SocialFeedScreen({ navigation, route }: any) {
  const { signOut } = useAuthActions();
  const isWeb = Platform.OS === 'web';
  const isInitiativesRoute =
    route?.name === 'Initiatives' ||
    String(route?.params?.feedSection ?? '').trim().toLowerCase() === 'social';
  const me = useQuery(api.users.me);
  const unreadNotifications = useQuery(api.notifications.getUnreadCount) ?? 0;
  const widgetVisibilityQuery = useQuery(api.widgetVisibility.listAll);
  const hiddenWidgetKeys = useMemo(
    () => new Set((widgetVisibilityQuery ?? []).filter((widget: any) => widget.hidden).map((widget: any) => String(widget.key))),
    [widgetVisibilityQuery]
  );
  const isAdmin = Boolean(
    me?.isOwner ||
    String(me?.email ?? '').toLowerCase() === 'vincentmm@hyundai.co.za' ||
    me?.staffRole === 'dp' ||
    me?.accessLevel === 'full_access'
  );
  const normalizedRole = String(me?.role ?? '').trim().toLowerCase();
  const isCustomerUser = normalizedRole === 'customer';
  const isStaffUser = Boolean(
    !isCustomerUser && (
      normalizedRole === 'staff' ||
      normalizedRole === 'admin' ||
      me?.staffRole !== undefined ||
      me?.isOwner ||
      me?.accessLevel === 'full_access'
    )
  );
  const canSeeAdminPanel = canUserSeeAdminPanel(me);
  const profileRoute = isStaffUser ? 'StaffProfile' : 'ProfileEdit';
  const profileTitle = isStaffUser ? 'Staff profile' : 'Customer profile';
  const profileSubtitle = isStaffUser ? 'Staff-side access and settings' : 'Customer-side access and settings';
  const profileMenuItems = isStaffUser ? STAFF_MENU_ITEMS : CUSTOMER_MENU_ITEMS;
  const [mode, setMode] = useState<'global' | 'following' | 'moderation'>('global');
  const [feedSection, setFeedSection] = useState<'main' | 'events' | 'social'>(isInitiativesRoute ? 'social' : 'main');
  const [composerHint, setComposerHint] = useState<'community' | 'initiative' | 'club'>('community');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const feedPage = usePaginatedQuery(api.posts.listFeedPaged, {
    mode: mode === 'following' ? 'following' : 'global',
    includeUnapproved: mode === 'moderation' && isAdmin,
  }, { initialNumItems: Platform.OS === 'web' ? 100 : 12 });
  const feed = useMemo(
    () => feedPage.results ?? [],
    [feedPage.results]
  );
  const followingIdsQuery = useQuery(api.posts.listFollowingIds);
  const followingIds = useMemo(() => followingIdsQuery ?? [], [followingIdsQuery]);
  const createPost = useMutation(api.posts.createPost);
  const createSocialProgramme = useMutation(api.posts.createPost);
  const updatePost = useMutation(api.posts.updatePost);
  const removePost = useMutation(api.posts.removePost);
  const restorePost = useMutation(api.posts.restorePost);
  const permanentlyDeletePost = useMutation(api.posts.permanentlyDeletePost);
  const toggleReaction = useMutation(api.posts.toggleReaction);
  const toggleCommentLike = useMutation(api.posts.toggleCommentLike);
  const followUser = useMutation(api.posts.followUser);
  const unfollowUser = useMutation(api.posts.unfollowUser);
  const removePostMedia = useMutation(api.posts.removePostMedia);
  const toggleLike = useMutation(api.posts.toggleLike);
  const addComment = useMutation(api.posts.addComment);
  const approvePost = useMutation(api.posts.approvePost);
  const removePostViewTracker = useMutation(api.posts.trackPostView);
  const logActivity = useMutation(api.activityLog.log);
  const generateUploadUrl = useMutation(api.posts.generateUploadUrl);
  const viewedPostIdsRef = useRef(new Set<string>());
  // keep the ref for now, but stop live view tracking during scroll to avoid jank

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<PostType>(isInitiativesRoute ? 'initiative' : 'community');
  const [programmeTitle, setProgrammeTitle] = useState('');
  const [programmeDescription, setProgrammeDescription] = useState('');
  const [programmeBudget, setProgrammeBudget] = useState('');
  const [programmeLocation, setProgrammeLocation] = useState('');
  const [programmeBeneficiaries, setProgrammeBeneficiaries] = useState('');
  const [programmeTimeline, setProgrammeTimeline] = useState('');
  const [posting, setPosting] = useState(false);
  const [mediaUploadCount, setMediaUploadCount] = useState(0);
  const mediaUploading = mediaUploadCount > 0;
  const [pickingMedia, setPickingMedia] = useState(false);
  const [composerModalOpen, setComposerModalOpen] = useState(false);
  const [composerDraftCreatedAt, setComposerDraftCreatedAt] = useState<number | null>(null);
  const [selectedImages, setSelectedImages] = useState<ComposerImage[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<{
    uri: string;
    name?: string;
    mimeType?: string;
    storageId?: string;
  } | null>(null);
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>({});
  const [selectedMedia, setSelectedMedia] = useState<{
    uri: string;
    name?: string;
    mimeType?: string;
    storageId?: string;
    mediaType?: 'image' | 'video';
    uploadState: 'uploading' | 'ready' | 'failed';
    uploadError?: string;
  } | null>(null);
  type SelectedMedia = NonNullable<typeof selectedMedia>;
  type SelectedImage = ComposerImage;
  const [commentPost, setCommentPost] = useState<any>(null);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyToComment, setReplyToComment] = useState<any>(null);
  const [editPostItem, setEditPostItem] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editPostType, setEditPostType] = useState<PostType>('community');
  const [editImages, setEditImages] = useState<ComposerImage[]>([]);
  const [editImageStorageIds, setEditImageStorageIds] = useState<string[]>([]);
  const [editVideo, setEditVideo] = useState<{ uri: string; name?: string; mimeType?: string; storageId?: string } | null>(null);
  const [editMode, setEditMode] = useState<'details' | 'media'>('details');
  const [editMediaUploadCount, setEditMediaUploadCount] = useState(0);
  const editMediaUploading = editMediaUploadCount > 0;
  const [editMediaPicking, setEditMediaPicking] = useState(false);
  const [editUploading, setEditUploading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [sharePostItem, setSharePostItem] = useState<any>(null);
  const [reactionMenuPostId, setReactionMenuPostId] = useState<string | null>(null);
  const [postOptionsPostItem, setPostOptionsPostItem] = useState<any>(null);
  const [reactionOverrides, setReactionOverrides] = useState<Record<string, ReactionUiOverride>>({});
  const [followOverrides, setFollowOverrides] = useState<Record<string, boolean>>({});
  const [activeWidget, setActiveWidget] = useState<FeedWidgetKey | null>(null);
  const widgetRailRef = useRef<any>(null);
  const [widgetRailOffset, setWidgetRailOffset] = useState(0);
  const featuredRailRefs = useRef<Record<string, any>>({});
  const [featuredRailOffsets, setFeaturedRailOffsets] = useState<Record<string, number>>({});

  const scrollWidgetRail = useCallback((direction: 'back' | 'forward') => {
    const nextOffset = Math.max(0, widgetRailOffset + (direction === 'forward' ? 260 : -260));
    widgetRailRef.current?.scrollTo?.({ x: nextOffset, animated: true });
    setWidgetRailOffset(nextOffset);
  }, [widgetRailOffset]);

  const scrollFeaturedRail = useCallback((railType: 'stockRail' | 'merchRail', direction: 'back' | 'forward') => {
    const nextOffset = Math.max(0, (featuredRailOffsets[railType] ?? 0) + (direction === 'forward' ? FEATURED_RAIL_STEP : -FEATURED_RAIL_STEP));
    featuredRailRefs.current[railType]?.scrollTo?.({ x: nextOffset, animated: true });
    setFeaturedRailOffsets((current: Record<string, number>) => ({ ...current, [railType]: nextOffset }));
  }, [featuredRailOffsets]);

  const [weather, setWeather] = useState<LiveWeatherState>({
    temperature: null,
    condition: 'Loading weather',
    location: 'Johannesburg',
    updatedAt: null,
  });
  const [market, setMarket] = useState<LiveMarketState>({
    symbol: '^GSPC',
    price: null,
    change: null,
    changePercent: null,
    updatedAt: null,
  });
  const staffAccountsQuery = useQuery(api.staff.publicOnlineSalesAndServiceStaff);
  const appAccountsQuery = useQuery(api.users.listAppAccounts, { limit: 40 });
  const calendarEntriesQuery = useQuery(api.bookings.listCalendarEntries);
  const competitionPostsQuery = useQuery(api.posts.listPostsByType, { postType: 'competition', limit: 4 });
  const initiativePostsQuery = useQuery(api.posts.listPostsByType, { postType: 'initiative', limit: 4 });
  const staffAccounts = useMemo(() => staffAccountsQuery ?? [], [staffAccountsQuery]);
  const appAccounts = useMemo(() => appAccountsQuery ?? [], [appAccountsQuery]);
  const calendarEntries = useMemo(() => calendarEntriesQuery ?? [], [calendarEntriesQuery]);
  const competitionPosts = useMemo(() => competitionPostsQuery ?? [], [competitionPostsQuery]);
  const initiativePosts = useMemo(() => initiativePostsQuery ?? [], [initiativePostsQuery]);
  const items = useMemo(() => (feed ?? []), [feed]);
  const visibleItems = useMemo(
    () => (isInitiativesRoute ? items.filter((item: any) => String(item.postType) === 'initiative') : items),
    [items, isInitiativesRoute]
  );
  const initiativePortalStats = useMemo(() => {
    const total = initiativePosts.length;
    const withBudget = initiativePosts.filter((item: any) => String(item.content ?? '').toLowerCase().includes('sponsorship target')).length;
    const recent = initiativePosts[0];
    return {
      total,
      withBudget,
      recentTitle: recent?.title || 'No programme yet',
      recentAuthor: recent?.authorDisplayName || '—',
    };
  }, [initiativePosts]);
  const stockFeedResults = usePaginatedQuery(api.inventory.listPaged, { categoryFilter: undefined }, { initialNumItems: 12 });
  const stockFeedItems = useMemo(() => stockFeedResults.results ?? [], [stockFeedResults.results]);
  const hyundaiMerchandiseItemsQuery = useQuery(api.merchandise.listItemsByBrand, { brand: 'Hyundai' });
  const kiaMerchandiseItemsQuery = useQuery(api.merchandise.listItemsByBrand, { brand: 'Kia' });
  const hyundaiMerchandiseItems = useMemo(() => hyundaiMerchandiseItemsQuery ?? [], [hyundaiMerchandiseItemsQuery]);
  const kiaMerchandiseItems = useMemo(() => kiaMerchandiseItemsQuery ?? [], [kiaMerchandiseItemsQuery]);
  const merchandiseFeedItems = useMemo(
    () => [...hyundaiMerchandiseItems, ...kiaMerchandiseItems],
    [hyundaiMerchandiseItems, kiaMerchandiseItems]
  );
  const pendingComposerEntry = useMemo(() => {
    if (!composerDraftCreatedAt) return null;
    const hasMedia = Boolean(selectedMedia || selectedImages.length > 0 || selectedVideo);
    const hasText = Boolean(title.trim() || content.trim());
    if (!composerModalOpen && !hasMedia && !hasText) return null;
    if (!hasMedia && !hasText) return null;

    const localMediaType = selectedVideo?.storageId || selectedMedia?.mediaType === 'video' ? 'video' : hasMedia ? 'image' : undefined;
    const localImageUri = selectedImages[0]?.uri || (selectedMedia?.mediaType === 'image' ? selectedMedia.uri : undefined);
    const localVideoUri = selectedVideo?.uri || (selectedMedia?.mediaType === 'video' ? selectedMedia.uri : undefined);
    const pendingState = posting ? 'publishing' : mediaUploading || selectedMedia?.uploadState === 'uploading' ? 'uploading' : selectedMedia?.uploadState === 'failed' ? 'failed' : 'draft';

    return {
      entryType: 'composerDraft',
      feedKey: `composer-draft-${composerDraftCreatedAt}`,
      postId: `composer-draft-${composerDraftCreatedAt}`,
      userId: me?._id ?? 'me',
      role: me?.role ?? 'user',
      postType,
      title: title.trim() || undefined,
      content: content.trim() || (pendingState === 'uploading' ? 'Uploading media…' : 'Draft post'),
      image: localImageUri,
      imageUrls: localImageUri ? [localImageUri] : [],
      imageStorageIds: [],
      video: localVideoUri,
      videoStorageId: undefined,
      mediaType: localMediaType,
      publicPreviewEnabled: false,
      isSharedToMainFeed: true,
      isApproved: true,
      isDeleted: false,
      likeCount: 0,
      commentCount: 0,
      reactionCount: 0,
      reactionSummary: { like: 0, love: 0, celebrate: 0, laugh: 0, wow: 0, sad: 0, angry: 0 },
      myReaction: undefined,
      createdAt: composerDraftCreatedAt,
      updatedAt: composerDraftCreatedAt,
      authorDisplayName: me?.displayName ?? me?.name ?? me?.email ?? 'You',
      authorProfileImage: me?.profileImage ?? me?.image,
      authorPhone: me?.phone,
      authorStaffRole: me?.staffRole,
      authorDealershipId: me?.dealershipId,
      authorDealershipName: me?.dealershipName,
      authorDealershipBrand: me?.dealershipBrand,
      authorDealershipLocation: me?.dealershipLocation,
      hasLiked: false,
      isPendingComposer: true,
      pendingState,
    };
  }, [composerDraftCreatedAt, composerModalOpen, content, mediaUploading, me?._id, me?.dealershipBrand, me?.dealershipId, me?.dealershipLocation, me?.dealershipName, me?.displayName, me?.email, me?.image, me?.name, me?.phone, me?.profileImage, me?.role, me?.staffRole, postType, posting, selectedImages, selectedMedia, selectedVideo, title]);

  const feedEntries = useMemo(() => {
    const nextEntries: any[] = [];
    let insertIndex = 0;

    if (pendingComposerEntry) {
      nextEntries.push(pendingComposerEntry);
    }

    visibleItems.forEach((post: any, index: number) => {
      nextEntries.push({
        ...post,
        entryType: 'post',
        feedKey: post.postId,
      });

      if (!isInitiativesRoute && (index + 1) % 3 === 0) {
        const railType = insertIndex % 2 === 0 ? 'stockRail' : 'merchRail';
        nextEntries.push({
          entryType: railType,
          feedKey: `${railType}-${insertIndex}`,
        });
        insertIndex += 1;
      }
    });

    return nextEntries;
  }, [isInitiativesRoute, pendingComposerEntry, visibleItems]);

  const openStockRailItem = useCallback((stockItem: any) => {
    if (isStaffUser) {
      navigation.navigate('InventoryScreen');
      return;
    }
    navigation.navigate('Main', {
      screen: 'StockTab',
      params: { sharedVehicleId: String(stockItem._id) },
    });
  }, [isStaffUser, navigation]);

  const openMerchandiseRailItem = useCallback((merchItem: any) => {
    navigation.navigate('MerchandiseHub', {
      brand: merchItem.brand,
      itemId: String(merchItem._id),
    });
  }, [navigation]);

  const renderFeedRail = useCallback((railType: 'stockRail' | 'merchRail') => {
    const railItems = railType === 'stockRail' ? stockFeedItems : merchandiseFeedItems;
    const title = railType === 'stockRail' ? 'Featured stock' : 'Merchandise';
    const subtitle = railType === 'stockRail'
      ? 'Swipe left to right for available cars, test drives, and enquiries.'
      : 'Swipe left to right for available Hyundai and Kia merchandise.';

    if (railType === 'merchRail' && !isStaffUser) {
      return null;
    }

    return (
      <View style={styles.feedInsertCard}>
        <View style={styles.feedInsertHeader}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.feedInsertTitle}>{title}</Text>
            <Text style={styles.feedInsertSubtitle}>{subtitle}</Text>
          </View>
        </View>

        <View style={styles.feedInsertRailWrap}>
          {railItems.length > 1 ? (
            <>
              <TouchableOpacity
                style={[styles.feedInsertRailNavBtn, styles.feedInsertRailNavBtnLeft]}
                onPress={() => scrollFeaturedRail(railType, 'back')}
              >
                <Ionicons name="chevron-back" size={18} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.feedInsertRailNavBtn, styles.feedInsertRailNavBtnRight]}
                onPress={() => scrollFeaturedRail(railType, 'forward')}
              >
                <Ionicons name="chevron-forward" size={18} color={colors.white} />
              </TouchableOpacity>
            </>
          ) : null}

          <ScrollView
            ref={(node: any) => {
              featuredRailRefs.current[railType] = node;
            }}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.feedInsertRail}
          >
            {railItems.length > 0 ? railItems.slice(0, 8).map((entry: any) => {
              const imageUri = entry.imageUrls?.[0];
              const isStockItem = railType === 'stockRail';
              const railName = isStockItem
                ? `${entry.year} ${entry.make} ${entry.model}${entry.variant ? ` ${entry.variant}` : ''}`.trim()
                : entry.title;
              const railPrice = typeof entry.price === 'number' ? `R ${Number(entry.price).toLocaleString()}` : 'Price on request';

              return (
                <TouchableOpacity
                  key={String(entry._id)}
                  style={styles.feedInsertItemCard}
                  activeOpacity={0.9}
                  onPress={() => (isStockItem ? openStockRailItem(entry) : openMerchandiseRailItem(entry))}
                >
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={styles.feedInsertImage} resizeMode="contain" />
                  ) : (
                    <View style={styles.feedInsertImagePlaceholder}>
                      <Ionicons name={isStockItem ? 'car-sport-outline' : 'pricetag-outline'} size={30} color={colors.primary} />
                    </View>
                  )}
                  <Text style={styles.feedInsertItemTitle} numberOfLines={2}>{railName}</Text>
                  <Text style={styles.feedInsertItemMeta} numberOfLines={1}>{railPrice}</Text>
                  <View style={styles.feedInsertActionRow}>
                    {isStockItem ? (
                      <TouchableOpacity
                        style={[styles.feedInsertActionBtn, styles.feedInsertActionBtnPrimary]}
                        onPress={() => {
                          if (isStaffUser) {
                            navigation.navigate('InventoryScreen');
                          } else {
                            navigation.navigate('TestDriveBooking', { inventoryItemId: String(entry._id) });
                          }
                        }}
                      >
                        <Text style={[styles.feedInsertActionText, styles.feedInsertActionTextPrimary]}>Book test drive</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.feedInsertActionBtn, styles.feedInsertActionBtnPrimary]}
                        onPress={() => openMerchandiseRailItem(entry)}
                      >
                        <Text style={[styles.feedInsertActionText, styles.feedInsertActionTextPrimary]}>Order</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.feedInsertActionBtn}
                      onPress={() => {
                        if (isStockItem) {
                          navigation.navigate(isStaffUser ? 'StaffMessages' : 'Messages');
                        } else {
                          openMerchandiseRailItem(entry);
                        }
                      }}
                    >
                      <Text style={styles.feedInsertActionText}>{isStockItem ? 'Enquire' : 'View'}</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            }) : (
              <View style={styles.feedInsertEmptyCard}>
                <Ionicons name={railType === 'stockRail' ? 'car-outline' : 'pricetag-outline'} size={22} color={colors.textLight} />
                <Text style={styles.feedInsertEmptyText}>{railType === 'stockRail' ? 'Stock is loading…' : 'Merchandise is loading…'}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    );
  }, [isStaffUser, merchandiseFeedItems, navigation, stockFeedItems, openMerchandiseRailItem, openStockRailItem, scrollFeaturedRail]);

  useEffect(() => {
    let alive = true;

    const loadLiveSnapshot = async () => {
      try {
        const weatherResponse = await globalThis.fetch('https://api.open-meteo.com/v1/forecast?latitude=-26.2041&longitude=28.0473&current=temperature_2m,weather_code&timezone=Africa%2FJohannesburg');
        const weatherJson: any = await weatherResponse.json();
        if (alive && weatherJson?.current) {
          const temp = typeof weatherJson.current.temperature_2m === 'number' ? weatherJson.current.temperature_2m : null;
          const code = String(weatherJson.current.weather_code ?? '');
          const label = code === '0' ? 'Clear' : code === '1' || code === '2' ? 'Partly cloudy' : code === '3' ? 'Cloudy' : code === '61' || code === '63' ? 'Rain' : 'Live weather';
          setWeather({
            temperature: temp,
            condition: label,
            location: 'Johannesburg',
            updatedAt: Date.now(),
          });
        }
      } catch {
        if (alive) {
          setWeather((current: LiveWeatherState) => ({ ...current, condition: 'Weather unavailable', updatedAt: Date.now() }));
        }
      }

      try {
        const marketResponse = await globalThis.fetch('https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EGSPC,MSFT,AAPL,TSLA');
        const marketJson: any = await marketResponse.json();
        const firstQuote = marketJson?.quoteResponse?.result?.[0];
        if (alive && firstQuote) {
          setMarket({
            symbol: String(firstQuote.symbol ?? '^GSPC'),
            price: typeof firstQuote.regularMarketPrice === 'number' ? firstQuote.regularMarketPrice : null,
            change: typeof firstQuote.regularMarketChange === 'number' ? firstQuote.regularMarketChange : null,
            changePercent: typeof firstQuote.regularMarketChangePercent === 'number' ? firstQuote.regularMarketChangePercent : null,
            updatedAt: Date.now(),
          });
        }
      } catch {
        if (alive) {
          setMarket((current: LiveMarketState) => ({ ...current, symbol: 'MARKETS', updatedAt: Date.now() }));
        }
      }
    };

    void loadLiveSnapshot();
    const timer = setInterval(() => {
      void loadLiveSnapshot();
    }, 5 * 60 * 1000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const featuredNews = useMemo(() => items.filter((item: any) => ['news', 'special', 'promotion', 'advert'].includes(String(item.postType))).slice(0, 3), [items]);
  const upcomingEvents = useMemo(() => calendarEntries.filter((entry: any) => !entry.isCompleted).slice(0, 3), [calendarEntries]);
  const suggestedAccounts = useMemo(() => appAccounts, [appAccounts]);
  const widgetUpdatedLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const inviteShareContext = useMemo(() => ({
    type: 'invite' as const,
    inviterName: me?.displayName || me?.name || me?.email || 'A team member',
    inviterType: isStaffUser ? 'staff' as const : 'customer' as const,
    dealershipName: me?.dealershipName,
    occupation: me?.staffRole || me?.role,
  }), [isStaffUser, me?.dealershipName, me?.displayName, me?.email, me?.name, me?.role, me?.staffRole]);

  const widgetCards = [
    {
      key: 'news' as const,
      title: 'News',
      subtitle: featuredNews[0]?.title || 'Latest feed updates',
      detail: featuredNews[0]?.content || 'Fresh dealership stories and announcements.',
      icon: 'newspaper',
      tint: colors.primary,
      route: 'NewsWidget',
    },
    {
      key: 'weather' as const,
      title: 'Weather',
      subtitle: `${weather.location} • ${weather.condition}`,
      detail: weather.temperature === null ? 'Live forecast loading…' : `${weather.temperature.toFixed(0)}°C • updated ${widgetUpdatedLabel}`,
      icon: 'partly-sunny',
      tint: colors.statusConfirmed,
      route: 'WeatherWidget',
    },
    {
      key: 'markets' as const,
      title: 'Markets',
      subtitle: market.symbol,
      detail: market.price === null ? 'Live market feed loading…' : `${formatCompactPrice(market.price)} · ${formatSigned(market.change)} (${formatSigned(market.changePercent)}%)`,
      icon: 'trending-up',
      tint: colors.statusInProgress,
      route: 'MarketsWidget',
    },
    {
      key: 'suggested' as const,
      title: 'Suggested accounts',
      subtitle: suggestedAccounts[0]?.displayName || suggestedAccounts[0]?.name || 'All app members',
      detail: suggestedAccounts[0]?.accountType ? `${suggestedAccounts[0].accountType === 'staff' ? (suggestedAccounts[0].staffRole || 'staff') : 'customer'} · ${suggestedAccounts[0].isOnline ? 'Online' : 'Available'}` : 'People you may want to follow or invite.',
      icon: 'people',
      tint: colors.success,
      route: 'SuggestedAccounts',
    },
    {
      key: 'events' as const,
      title: 'Events',
      subtitle: upcomingEvents[0]?.title || 'Upcoming moments',
      detail: upcomingEvents[0] ? `${upcomingEvents[0].date}${upcomingEvents[0].time ? ` · ${upcomingEvents[0].time}` : ''}` : 'Bookings and reminders in one place.',
      icon: 'calendar',
      tint: colors.warning,
      route: 'Events',
    },
    {
      key: 'competition' as const,
      title: 'Competition',
      subtitle: competitionPostsQuery ? 'Live competitions and entries' : 'Competition activity',
      detail: competitionPostsQuery ? 'Tap for live entries, winners, and campaign updates.' : 'Competition entries and campaign updates.',
      icon: 'trophy',
      tint: colors.error,
      route: 'Competition',
    },
    {
      key: 'initiative' as const,
      title: 'Social initiative',
      subtitle: initiativePostsQuery ? 'Community impact and CSR' : 'Social development',
      detail: initiativePostsQuery ? 'Tap for community updates and social development projects.' : 'Community and social development updates.',
      icon: 'leaf',
      tint: colors.statusConfirmed,
      route: 'Initiatives',
    },
  ].filter((widget) => !hiddenWidgetKeys.has(String(widget.key)));

  const openWidget = (key: FeedWidgetKey) => setActiveWidget(key);

  const activeWidgetData = useMemo(() => {
    if (!activeWidget) return null;
    if (activeWidget === 'news') {
      return {
        title: 'Latest News',
        body: featuredNews,
        empty: 'No live news posts yet.',
      };
    }
    if (activeWidget === 'weather') {
      return {
        title: 'Weather',
        body: [weather],
        empty: 'Weather data is not available right now.',
      };
    }
    if (activeWidget === 'markets') {
      return {
        title: 'Financial Markets',
        body: [market],
        empty: 'Market data is not available right now.',
      };
    }
    if (activeWidget === 'suggested') {
      return {
        title: 'Suggested Accounts',
        body: suggestedAccounts,
        empty: 'No suggested accounts available yet.',
      };
    }
    if (activeWidget === 'competition') {
      return {
        title: 'Competition',
        body: competitionPostsQuery ?? [],
        empty: 'No competition updates yet.',
      };
    }
    if (activeWidget === 'initiative') {
      return {
        title: 'Social Development Initiative',
        body: initiativePostsQuery ?? [],
        empty: 'No initiative updates yet.',
      };
    }
    return (
      <View style={styles.feedInsertCard}>
        <View style={styles.feedInsertHeader}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.feedInsertTitle}>Upcoming Events</Text>
            <Text style={styles.feedInsertSubtitle}>No upcoming events yet.</Text>
          </View>
        </View>
        <View style={styles.feedInsertRail}>
          {upcomingEvents.length > 0 ? upcomingEvents.map((event: any) => (
            <TouchableOpacity key={event._id} style={styles.feedInsertItemCard} activeOpacity={0.9} onPress={() => navigation.navigate('Events', { eventId: event._id })}>
              <View style={styles.feedInsertImagePlaceholder}>
                <Ionicons name="calendar-outline" size={30} color={colors.primary} />
              </View>
              <Text style={styles.feedInsertItemTitle} numberOfLines={2}>{event.title}</Text>
              <Text style={styles.feedInsertItemMeta} numberOfLines={1}>{event.date} · {event.time}</Text>
              <View style={styles.feedInsertActionRow}>
                <TouchableOpacity style={[styles.feedInsertActionBtn, styles.feedInsertActionBtnPrimary]}>
                  <Text style={[styles.feedInsertActionText, styles.feedInsertActionTextPrimary]}>View</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )) : (
            <View style={styles.feedInsertEmptyCard}>
              <Ionicons name="calendar-outline" size={22} color={colors.textLight} />
              <Text style={styles.feedInsertEmptyText}>No upcoming events yet.</Text>
            </View>
          )}
        </View>
      </View>
    );
  }, [activeWidget, competitionPostsQuery, featuredNews, initiativePostsQuery, market, navigation, suggestedAccounts, upcomingEvents, weather]);

  const canPost = Boolean(me);
  const canInteract = Boolean(me);
  const isFeedLoading = feedPage.status === 'LoadingFirstPage';
  const showEmptyState = !isFeedLoading && visibleItems.length === 0;
  const commentsQuery = useQuery(api.posts.listComments, commentPost ? { postId: commentPost.postId } : 'skip');
  const comments = useMemo(() => commentsQuery ?? [], [commentsQuery]);
  const commentThreads = useMemo(() => {
    const topLevel: any[] = [];
    const repliesByParent = new Map<string, any[]>();

    for (const comment of comments) {
      if (comment.parentCommentId) {
        const key = String(comment.parentCommentId);
        const existing = repliesByParent.get(key) ?? [];
        existing.push(comment);
        repliesByParent.set(key, existing);
      } else {
        topLevel.push(comment);
      }
    }

    return { topLevel, repliesByParent };
  }, [comments]);

  const moderationTabs = isAdmin
    ? [
        { key: 'global', label: 'Feed', icon: 'newspaper-outline' },
        { key: 'following', label: 'Following', icon: 'people-outline' },
        { key: 'moderation', label: 'Moderation', icon: 'shield-checkmark-outline' },
      ]
    : [
        { key: 'global', label: 'Global', icon: 'globe-outline' },
        { key: 'following', label: 'Following', icon: 'people-outline' },
      ];

  const handleStaffSignOut = async () => {
    try {
      await signOut();
    } catch {
      if (a0?.auth?.signOut) {
        await a0.auth.signOut();
      }
    }
  };

  const handleModerationAction = useCallback(async (item: any, action: 'approve' | 'delete') => {
    const prompt = action === 'delete' ? 'Delete this post permanently?' : item.isApproved ? 'Remove approval for this post?' : 'Approve this post?';
    Alert.alert(
      'Post moderation',
      prompt,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'delete' ? 'Delete permanently' : item.isApproved ? 'Unapprove' : 'Approve',
          style: action === 'delete' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              if (action === 'delete') {
                await permanentlyDeletePost({ postId: item.postId });
              } else {
                await approvePost({ postId: item.postId, isApproved: !item.isApproved });
              }
            } catch (err: any) {
              Alert.alert('Moderation', err?.message || 'Could not update post');
            }
          },
        },
      ]
    );
  }, [approvePost, permanentlyDeletePost]);

  const openComposer = useCallback(() => {
    setComposerDraftCreatedAt((current: number | null) => current ?? Date.now());
    setComposerModalOpen(true);
  }, []);

  const closeComposer = useCallback(() => {
    setComposerModalOpen(false);
  }, []);

  const resetComposer = useCallback(() => {
    setTitle('');
    setContent('');
    setPostType(isInitiativesRoute ? 'initiative' : 'community');
    setSelectedImages([]);
    setSelectedVideo(null);
    setSelectedMedia(null);
    setMediaUploadCount(0);
    setPickingMedia(false);
    setComposerDraftCreatedAt(null);
  }, [isInitiativesRoute]);

  const selectFeedMediaAssets = useCallback(async (kind: 'image' | 'video') => {
    const picker: any = await import('expo-document-picker');
    const result = await picker.getDocumentAsync({
      type: kind === 'image' ? 'image/*' : 'video/*',
      multiple: kind === 'image',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) return [];

    return result.assets
      .map((asset: any) => {
        const mimeType = asset.mimeType || inferMimeType(asset.name, kind);
        return {
          uri: asset.uri,
          name: asset.name || undefined,
          mimeType,
          type: String(mimeType).startsWith('video/') ? 'video' : kind,
        };
      })
      .filter((asset: any) => (kind === 'image' ? !String(asset.mimeType ?? '').startsWith('video/') : String(asset.mimeType ?? '').startsWith('video/')) || !asset.mimeType);
  }, []);

  const uploadSelectedMedia = useCallback(async (asset: { uri: string; name?: string; mimeType?: string; type?: 'image' | 'video'; file?: any }) => {
    const inferredMediaType = asset.type || (asset.mimeType?.startsWith('video/') ? 'video' : 'image');
    const mimeType = asset.mimeType || inferMimeType(asset.name, inferredMediaType);
    const mediaType = String(mimeType).startsWith('video/') ? 'video' : 'image';
    const uploadUrl = await generateUploadUrl({});
    const uploadResult = Platform.OS === 'web'
      ? await globalThis.fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': mimeType,
          },
          body: asset.file instanceof (globalThis as any).Blob ? asset.file : await globalThis.fetch(asset.uri).then((response: any) => response.blob()),
        })
      : await FileSystem.uploadAsync(uploadUrl, asset.uri, {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            'Content-Type': mimeType,
          },
        });
    const responseBody = Platform.OS === 'web'
      ? await (uploadResult as Response).text()
      : String((uploadResult as any).body ?? '');
    let storageId = '';
    try {
      const parsed = JSON.parse(responseBody);
      storageId = String(parsed.storageId || parsed.id || '').trim();
    } catch {
      storageId = responseBody.trim();
    }
    if (!storageId) throw new Error('Failed to upload media');
    return { storageId, mediaType: mediaType as 'image' | 'video', mimeType };
  }, [generateUploadUrl]);

  const attachMediaAsset = useCallback(async (asset: { uri: string; name?: string; mimeType?: string; type?: 'image' | 'video'; file?: any }, target: 'composer' | 'edit') => {
    const pickedMimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const mediaType = String(pickedMimeType).startsWith('video/') || asset.type === 'video' ? 'video' : 'image';
    const uploaded = await uploadSelectedMedia({ uri: asset.uri, name: asset.name, mimeType: pickedMimeType, type: mediaType, file: asset.file });

    if (target === 'composer') {
      if (uploaded.mediaType === 'video') {
        setSelectedVideo({ uri: asset.uri, name: asset.name, mimeType: uploaded.mimeType, storageId: uploaded.storageId });
        setSelectedImages([]);
      } else {
        setSelectedImages((current: SelectedImage[]) => {
          if (current.some((image) => image.storageId === uploaded.storageId || image.uri === asset.uri)) return current;
          return [...current, { uri: asset.uri, name: asset.name, mimeType: uploaded.mimeType, storageId: uploaded.storageId }];
        });
        setSelectedVideo(null);
      }
    } else {
      if (uploaded.mediaType === 'video') {
        setEditImages([]);
        setEditImageStorageIds([]);
        setEditVideo({ uri: asset.uri, name: asset.name, mimeType: uploaded.mimeType, storageId: uploaded.storageId });
      } else {
        setEditVideo(null);
        setEditImages((current: ComposerImage[]) => {
          if (current.some((image) => image.storageId === uploaded.storageId || image.uri === asset.uri)) return current;
          return [...current, { uri: asset.uri, name: asset.name, mimeType: uploaded.mimeType, storageId: uploaded.storageId }];
        });
        setEditImageStorageIds((current: string[]) => (current.includes(uploaded.storageId) ? current : [...current, uploaded.storageId]));
      }
    }

    return uploaded;
  }, [uploadSelectedMedia]);

  const beginMediaUpload = useCallback(async (asset: { uri: string; name?: string; mimeType?: string; type?: 'image' | 'video'; file?: any }) => {
    const pickedMimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const mediaType = String(pickedMimeType).startsWith('video/') || asset.type === 'video' ? 'video' : 'image';
    if (!composerDraftCreatedAt) {
      setComposerDraftCreatedAt(Date.now());
    }
    setSelectedMedia({
      uri: asset.uri,
      name: asset.name,
      mimeType: pickedMimeType,
      mediaType,
      uploadState: 'uploading',
    });
    setMediaUploadCount((prev: number) => prev + 1);
    try {
      const uploaded = await attachMediaAsset({ uri: asset.uri, name: asset.name, mimeType: pickedMimeType, type: mediaType, file: asset.file }, 'composer');
      setSelectedMedia((current: SelectedMedia | null) => {
        if (!current || current.uri !== asset.uri) return current;
        return {
          ...current,
          storageId: uploaded.storageId,
          mediaType: uploaded.mediaType,
          mimeType: uploaded.mimeType,
          uploadState: 'ready',
          uploadError: undefined,
        };
      });
    } catch (err: any) {
      const message = err?.message || 'Could not add media';
      setSelectedMedia((current: SelectedMedia | null) => {
        if (!current || current.uri !== asset.uri) return current;
        return {
          ...current,
          uploadState: 'failed',
          uploadError: message,
        };
      });
      Alert.alert('Media', message);
    } finally {
      setMediaUploadCount((prev: number) => Math.max(0, prev - 1));
    }
  }, [attachMediaAsset, composerDraftCreatedAt]);

  const removeComposerImage = useCallback((uri: string) => {
    setSelectedImages((current: SelectedImage[]) => current.filter((image) => image.uri !== uri));
    setSelectedMedia((current: SelectedMedia | null) => (current && current.uri === uri ? null : current));
  }, []);

  const removeComposerVideo = useCallback(() => {
    setSelectedVideo(null);
    setSelectedMedia((current: SelectedMedia | null) => (current?.mediaType === 'video' ? null : current));
  }, []);

  const pickMedia = useCallback(async (kind: 'image' | 'video') => {
    if (posting) return;
    setPickingMedia(true);
    try {
      const assets = await selectFeedMediaAssets(kind);
      if (!assets.length) return;
      for (const asset of assets) {
        await beginMediaUpload(asset);
      }
    } catch (err: any) {
      Alert.alert('Media', err?.message || 'Could not add media');
    } finally {
      setPickingMedia(false);
    }
  }, [beginMediaUpload, posting, selectFeedMediaAssets]);

  const handlePost = async () => {
    if (posting || mediaUploading) return;
    const cleanContent = content.trim();
    const cleanTitle = title.trim();
    const imageStorageIds = selectedImages.map((image: SelectedImage) => image.storageId).filter(Boolean) as string[];
    if (!cleanContent && !cleanTitle && imageStorageIds.length === 0 && !selectedVideo?.storageId) {
      Alert.alert('Post', 'Add text or media before posting.');
      return;
    }

    setPosting(true);
    try {
      await createPost({
        content: cleanContent || cleanTitle || (selectedVideo?.storageId ? 'Video update' : 'Photo update'),
        title: cleanTitle || undefined,
        authorUserId: me?._id,
        imageStorageIds: imageStorageIds.length > 0 ? (imageStorageIds as any) : undefined,
        imageStorageId: imageStorageIds[0] as any,
        videoStorageId: selectedVideo?.storageId as any,
        postType,
        mediaType: selectedVideo?.storageId ? 'video' : imageStorageIds.length > 0 ? 'image' : undefined,
        isSharedToMainFeed: true,
      });
      void trackAnalyticsEvent('post_create', {
        post_type: postType,
        has_title: Boolean(cleanTitle),
        has_content: Boolean(cleanContent),
        media_type: selectedVideo?.storageId ? 'video' : imageStorageIds.length > 0 ? 'image' : 'none',
        route: 'SocialFeedScreen',
      });
      showSuccessToast('Post created', 'Your post was published successfully.');
      resetComposer();
      setComposerModalOpen(false);
    } catch (err: any) {
      Alert.alert('Post', err?.message || 'Could not create post');
    } finally {
      setPosting(false);
    }
  };

  const renderComposer = () => (
    <TouchableOpacity style={styles.composeLauncher} activeOpacity={0.92} onPress={openComposer}>
      <View style={styles.composeAvatarWrap}>
        <UserAvatar
          uri={me?.profileImage ?? me?.image ?? ''}
          name={me?.displayName ?? me?.name ?? me?.email}
          size={50}
          borderRadius={25}
        />
      </View>
      <View style={styles.composePromptWrap}>
        <Text style={styles.composePromptText} numberOfLines={1}>What's in your mind?</Text>
        <Text style={styles.composePromptMeta} numberOfLines={1}>
          {isInitiativesRoute ? 'Share a programme update' : 'Tap to create a post'}
        </Text>
      </View>
      <View style={styles.composeEditBtn}>
        <Ionicons name="pencil" size={16} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );

  const renderComposerModal = () => (
    <Modal visible={composerModalOpen} transparent animationType="fade" onRequestClose={closeComposer} presentationStyle="overFullScreen">
      <View style={styles.composerModalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeComposer} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
          style={styles.composerModalKeyboardWrap}
        >
          <View style={styles.composerModalSheet}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.composerModalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.composerHeadRow}>
                <View style={styles.composerAvatarRing}>
                  <UserAvatar
                    uri={me?.profileImage ?? me?.image ?? ''}
                    name={me?.displayName ?? me?.name ?? me?.email}
                    size={56}
                    borderRadius={28}
                  />
                </View>
                <TextInput
                  value={content}
                  onChangeText={setContent}
                  placeholder="What's in your mind?"
                  placeholderTextColor={colors.textLight}
                  style={styles.composerInput}
                  multiline
                />
              </View>

              <View style={styles.mediaRow}>
                <TouchableOpacity style={styles.mediaBtn} onPress={() => void pickMedia('image')} disabled={posting}>
                  <Ionicons name="image-outline" size={16} color={colors.primary} />
                  <Text style={styles.mediaBtnText}>{mediaUploading ? 'Uploading...' : 'Picture Upload'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mediaBtn} onPress={() => void pickMedia('video')} disabled={posting}>
                  <Ionicons name="videocam-outline" size={16} color={colors.primary} />
                  <Text style={styles.mediaBtnText}>{mediaUploading ? 'Uploading...' : 'Video Upload'}</Text>
                </TouchableOpacity>
              </View>

              {selectedImages.length > 0 || selectedVideo || selectedMedia ? (
                <View style={styles.composerDraftCard}>
                  <View style={styles.composerDraftHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.composeLabel}>Draft preview</Text>
                      <Text style={styles.composerDraftTitle} numberOfLines={1}>
                        {selectedMedia?.name || selectedVideo?.name || selectedImages[0]?.name || (selectedImages.length > 1 ? `${selectedImages.length} photos selected` : selectedVideo ? 'Video selected' : 'Selected media')}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.composerDraftBadge,
                        selectedMedia?.uploadState === 'uploading' && styles.composerDraftBadgeUploading,
                        selectedMedia?.uploadState === 'failed' && styles.composerDraftBadgeFailed,
                        (!selectedMedia || selectedMedia.uploadState === 'ready') && styles.composerDraftBadgeReady,
                      ]}
                    >
                      <Text
                        style={[
                          styles.composerDraftBadgeText,
                          selectedMedia?.uploadState === 'failed' && styles.composerDraftBadgeTextDanger,
                        ]}
                      >
                        {selectedMedia?.uploadState === 'failed'
                          ? 'Upload failed'
                          : selectedMedia?.uploadState === 'uploading' || mediaUploading
                            ? 'Uploading'
                            : 'Ready'}
                      </Text>
                    </View>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.composerDraftScroll}>
                    {selectedImages.length > 0 ? selectedImages.map((image: SelectedImage, index: number) => (
                      <View key={`${image.uri}-${index}`} style={styles.composerDraftTile}>
                        <View style={styles.composerDraftMediaFrame}>
                          <Image source={{ uri: image.uri }} style={styles.composerDraftMediaImage} resizeMode="cover" />
                          <TouchableOpacity style={styles.composerDraftRemoveBtn} onPress={() => removeComposerImage(image.uri)}>
                            <Ionicons name="close" size={14} color={colors.white} />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.composerDraftMediaName} numberOfLines={1}>
                          {image.name || `Photo ${index + 1}`}
                        </Text>
                      </View>
                    )) : selectedVideo ? (
                      <View style={styles.composerDraftTileWide}>
                        <View style={styles.composerDraftMediaFrame}>
                          <FeedVideo sourceUri={selectedVideo.uri} />
                          <TouchableOpacity style={styles.composerDraftRemoveBtn} onPress={removeComposerVideo}>
                            <Ionicons name="close" size={14} color={colors.white} />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.composerDraftMediaName} numberOfLines={1}>
                          {selectedVideo.name || 'Video'}
                        </Text>
                      </View>
                    ) : selectedMedia ? (
                      <View style={styles.composerDraftTileWide}>
                        <View style={styles.composerDraftMediaFrame}>
                          {selectedMedia.mediaType === 'video' ? (
                            <FeedVideo sourceUri={selectedMedia.uri} />
                          ) : (
                            <Image source={{ uri: selectedMedia.uri }} style={styles.composerDraftMediaImage} resizeMode="cover" />
                          )}
                          <TouchableOpacity
                            style={styles.composerDraftRemoveBtn}
                            onPress={() => (selectedMedia.mediaType === 'video' ? removeComposerVideo() : removeComposerImage(selectedMedia.uri))}
                          >
                            <Ionicons name="close" size={14} color={colors.white} />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.composerDraftMediaName} numberOfLines={1}>
                          {selectedMedia.name || (selectedMedia.mediaType === 'video' ? 'Video draft' : 'Photo draft')}
                        </Text>
                      </View>
                    ) : null}
                  </ScrollView>

                  {selectedMedia?.uploadState === 'failed' && selectedMedia.uploadError ? (
                    <Text style={styles.composerDraftError}>{selectedMedia.uploadError}</Text>
                  ) : null}
                </View>
              ) : null}

              <TouchableOpacity style={styles.postBtn} onPress={handlePost} disabled={posting || mediaUploading}>
                <Text style={styles.postBtnText}>{posting ? 'Posting...' : isInitiativesRoute ? 'Publish update' : 'Publish Post'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  closeComposer();
                  resetComposer();
                }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  const renderProgrammeComposer = () => (
    <View style={styles.composeCard}>
      <Text style={styles.composeLabel}>Create a social development programme</Text>
      <Text style={styles.composeHelperText}>
        Add the core programme details here so people can understand the purpose, location, and sponsorship needs.
      </Text>
      <TextInput
        value={programmeTitle}
        onChangeText={setProgrammeTitle}
        placeholder="Programme title"
        placeholderTextColor={colors.textLight}
        style={styles.titleInput}
      />
      <TextInput
        value={programmeDescription}
        onChangeText={setProgrammeDescription}
        placeholder="Programme description"
        placeholderTextColor={colors.textLight}
        style={styles.input}
        multiline
      />
      <TextInput
        value={programmeLocation}
        onChangeText={setProgrammeLocation}
        placeholder="Location / community"
        placeholderTextColor={colors.textLight}
        style={styles.titleInput}
      />
      <TextInput
        value={programmeBeneficiaries}
        onChangeText={setProgrammeBeneficiaries}
        placeholder="Target beneficiaries"
        placeholderTextColor={colors.textLight}
        style={styles.titleInput}
      />
      <TextInput
        value={programmeTimeline}
        onChangeText={setProgrammeTimeline}
        placeholder="Date or programme period"
        placeholderTextColor={colors.textLight}
        style={styles.titleInput}
      />
      <TextInput
        value={programmeBudget}
        onChangeText={setProgrammeBudget}
        placeholder="Sponsorship target / budget"
        placeholderTextColor={colors.textLight}
        style={styles.titleInput}
      />
      <TouchableOpacity
        style={styles.postBtn}
        onPress={async () => {
          const cleanTitle = programmeTitle.trim();
          const cleanDescription = programmeDescription.trim();
          const cleanBudget = programmeBudget.trim();
          const cleanLocation = programmeLocation.trim();
          const cleanBeneficiaries = programmeBeneficiaries.trim();
          const cleanTimeline = programmeTimeline.trim();
          if (!cleanTitle || !cleanDescription) {
            Alert.alert('Programme', 'Add a title and description.');
            return;
          }
          try {
            const programmeContent = [
              cleanDescription,
              cleanLocation ? `Location: ${cleanLocation}` : '',
              cleanBeneficiaries ? `Target beneficiaries: ${cleanBeneficiaries}` : '',
              cleanTimeline ? `Timeline: ${cleanTimeline}` : '',
              cleanBudget ? `Sponsorship target: ${cleanBudget}` : '',
            ].filter(Boolean).join('\n\n');
            await createSocialProgramme({
              title: cleanTitle,
              content: programmeContent,
              postType: 'initiative',
              tag: 'blog',
              isSharedToMainFeed: true,
            });
            void trackAnalyticsEvent('post_create', {
              post_type: 'initiative',
              tag: 'blog',
              route: 'SocialFeedScreen',
              subtype: 'programme',
            });
            setProgrammeTitle('');
            setProgrammeDescription('');
            setProgrammeBudget('');
            setProgrammeLocation('');
            setProgrammeBeneficiaries('');
            setProgrammeTimeline('');
            showSuccessToast('Programme created', 'Your social development programme is live.');
          } catch (err: any) {
            Alert.alert('Programme', err?.message || 'Could not create programme');
          }
        }}
      >
        <Text style={styles.postBtnText}>Publish programme</Text>
      </TouchableOpacity>
    </View>
  );

  const handleComment = async () => {
    if (!canInteract) {
      Alert.alert('Sign in required', 'Please sign in to like or comment on posts.');
      return;
    }
    if (!commentPost || !commentText.trim()) return;
    setCommentSubmitting(true);
    try {
      await addComment({
        postId: commentPost.postId,
        text: commentText.trim(),
        parentCommentId: replyToComment?.commentId,
      });
      setCommentText('');
      setReplyToComment(null);
    } catch (err: any) {
      Alert.alert('Comment', err?.message || 'Could not add comment');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleToggleCommentLike = async (comment: any) => {
    if (!canInteract) {
      Alert.alert('Sign in required', 'Please sign in to like comments.');
      return;
    }

    try {
      await toggleCommentLike({ commentId: comment.commentId });
    } catch (err: any) {
      Alert.alert('Comment', err?.message || 'Could not like comment');
    }
  };

  const openEdit = (item: any, mode: 'details' | 'media' = 'details') => {
    if (!canInteract) {
      Alert.alert('Sign in required', 'Please sign in to edit your posts.');
      return;
    }
    setEditPostItem(item);
    setEditMode(mode);
    setEditTitle(item.title ?? '');
    setEditContent(item.content ?? '');
    setEditPostType((item.postType ?? 'community') as PostType);
    setEditImages((item.imageUrls ?? []).map((uri: string) => ({ uri, storageId: undefined })));
    setEditImageStorageIds((item.imageStorageIds ?? []).map((id: string) => String(id)));
    setEditVideo(item.video ? { uri: item.video, storageId: item.videoStorageId } : null);
    setEditMediaUploadCount(0);
    setEditMediaPicking(false);
  };

  const beginEditMediaUpload = useCallback(async (asset: { uri: string; name?: string; mimeType?: string; type?: 'image' | 'video'; file?: any }) => {
    if (!editPostItem || editSaving) return;
    const pickedMimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const mediaType = String(pickedMimeType).startsWith('video/') || asset.type === 'video' ? 'video' : 'image';
    setEditMediaUploadCount((prev: number) => prev + 1);
    try {
      const uploaded = await uploadSelectedMedia({ uri: asset.uri, name: asset.name, mimeType: pickedMimeType, type: mediaType, file: asset.file });
      if (uploaded.mediaType === 'video') {
        setEditImages([]);
        setEditImageStorageIds([]);
        setEditVideo({ uri: asset.uri, name: asset.name, mimeType: uploaded.mimeType, storageId: uploaded.storageId });
      } else {
        setEditVideo(null);
        setEditImages((current: ComposerImage[]) => {
          if (current.some((image) => image.storageId === uploaded.storageId || image.uri === asset.uri)) return current;
          return [...current, { uri: asset.uri, name: asset.name, mimeType: uploaded.mimeType, storageId: uploaded.storageId }];
        });
        setEditImageStorageIds((current: string[]) => (current.includes(uploaded.storageId) ? current : [...current, uploaded.storageId]));
      }
    } catch (err: any) {
      Alert.alert('Media', err?.message || 'Could not add media');
    } finally {
      setEditMediaUploadCount((prev: number) => Math.max(0, prev - 1));
    }
  }, [editPostItem, editSaving, uploadSelectedMedia]);

  const pickEditMedia = useCallback(async (kind: 'image' | 'video') => {
    if (!editPostItem || editSaving) return;
    setEditMediaPicking(true);
    try {
      const assets = await selectFeedMediaAssets(kind);
      if (!assets.length) return;

      // Reset the current edit media so the replacement is visually obvious.
      setEditImages([]);
      setEditImageStorageIds([]);
      setEditVideo(null);

      if (kind === 'video') {
        const firstAsset = assets[0];
        setEditVideo({ uri: firstAsset.uri, name: firstAsset.name, mimeType: firstAsset.mimeType });
      } else {
        setEditImages(assets.map((asset: any) => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType })));
      }

      for (const asset of assets) {
        await beginEditMediaUpload(asset);
      }
    } catch (err: any) {
      Alert.alert('Media', err?.message || 'Could not add media');
    } finally {
      setEditMediaPicking(false);
    }
  }, [beginEditMediaUpload, editPostItem, editSaving, selectFeedMediaAssets]);

  const handleRemoveEditMedia = async () => {
    if (!editPostItem) return;
    Alert.alert(
      'Remove media?',
      'This will delete the attached media from the post.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removePostMedia({ postId: editPostItem.postId });
              setEditImages([]);
              setEditImageStorageIds([]);
              setEditVideo(null);
            } catch (err: any) {
              Alert.alert('Media', err?.message || 'Could not remove media');
            }
          },
        },
      ]
    );
  };

  const handleDeletePost = async (item: any) => {
    Alert.alert(
      'Remove from feed?',
      'This will hide the post from the feed. You can restore it later from your posts.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removePost({ postId: item.postId });
            } catch (err: any) {
              Alert.alert('Post', err?.message || 'Could not remove post');
            }
          },
        },
      ]
    );
  };

  const handleSaveEdit = async () => {
    if (!canInteract) {
      Alert.alert('Sign in required', 'Please sign in to edit your posts.');
      return;
    }
    if (!editPostItem) return;
    setEditSaving(true);
    try {
      const nextImageStorageIds = editVideo?.storageId ? [] : editImageStorageIds;
      const payload: any = {
        postId: editPostItem.postId,
        title: editTitle.trim(),
        content: editContent.trim(),
        postType: editPostType,
      };
      if (editVideo?.storageId) {
        payload.imageStorageIds = [];
        payload.videoStorageId = editVideo.storageId;
        payload.mediaType = 'video';
      } else if (nextImageStorageIds.length > 0) {
        payload.imageStorageIds = nextImageStorageIds;
        payload.mediaType = 'image';
      }
      await updatePost(payload);
      setEditPostItem(null);
      setEditTitle('');
      setEditContent('');
      setEditImages([]);
      setEditImageStorageIds([]);
      setEditVideo(null);
    } catch (err: any) {
      Alert.alert('Edit post', err?.message || 'Could not update post');
    } finally {
      setEditSaving(false);
    }
  };

  const handleRemoveMedia = async (item: any) => {
    if (!canInteract) {
      Alert.alert('Sign in required', 'Please sign in to manage post media.');
      return;
    }
    try {
      await removePostMedia({ postId: item.postId });
    } catch (err: any) {
      Alert.alert('Media', err?.message || 'Could not remove media');
    }
  };

  const handleChatPoster = (item: any) => {
    const chatRouteParams = {
      recipientId: item.userId,
      recipientName: item.authorDisplayName,
      chatType: 'staff',
    };

    const parentNavigation = navigation.getParent?.();
    if (parentNavigation?.navigate) {
      parentNavigation.navigate('StaffChat', chatRouteParams);
      return;
    }

    navigation.navigate('StaffChat', chatRouteParams);
  };

  const openShare = (item: any) => {
    void logActivity({
      type: 'post_shared',
      title: 'Post shared',
      description: `${item.authorDisplayName} shared a post${item.title ? `: ${item.title}` : ''}.`,
      customerName: item.authorDisplayName,
      customerPhone: item.authorPhone,
      metadata: JSON.stringify({ postId: item.postId, title: item.title }),
      triggeredBy: me?._id,
    }).catch(() => {});
    setSharePostItem(item);
  };

  const openPostOptions = (item: any) => {
    setPostOptionsPostItem(item);
  };

  const handleReaction = async (item: any, reactionType: ReactionKey) => {
    if (!canInteract) {
      Alert.alert('Sign in required', 'Please sign in to react to posts.');
      return;
    }
    const currentReaction = (reactionOverrides[item.postId]?.myReaction ?? item.myReaction) as ReactionKey | undefined;
    const currentCount = reactionOverrides[item.postId]?.reactionCount ?? item.reactionCount ?? item.likeCount ?? 0;
    const nextCount = currentReaction
      ? (currentReaction === reactionType ? Math.max(0, currentCount - 1) : currentCount)
      : currentCount + 1;

    setReactionOverrides((prev: Record<string, ReactionUiOverride>) => ({
      ...prev,
      [item.postId]: {
        myReaction: reactionType,
        reactionCount: nextCount,
        hasLiked: reactionType === 'like',
      },
    }));

    try {
      await toggleReaction({ postId: item.postId, reactionType });
      setReactionMenuPostId(null);
    } catch (err: any) {
      setReactionOverrides((prev: Record<string, ReactionUiOverride>) => {
        const next = { ...prev };
        delete next[item.postId];
        return next;
      });
      Alert.alert('Reaction', err?.message || 'Could not update reaction');
    }
  };

  const handleLike = async (item: any) => {
    if (!canInteract) {
      Alert.alert('Sign in required', 'Please sign in to like posts.');
      return;
    }
    const currentReaction = (reactionOverrides[item.postId]?.myReaction ?? item.myReaction) as ReactionKey | undefined;
    const currentCount = reactionOverrides[item.postId]?.reactionCount ?? item.reactionCount ?? item.likeCount ?? 0;
    const nextReaction = currentReaction === 'like' ? undefined : 'like';
    const nextCount = currentReaction === 'like' ? Math.max(0, currentCount - 1) : currentCount + (currentReaction ? 0 : 1);

    setReactionOverrides((prev: Record<string, ReactionUiOverride>) => ({
      ...prev,
      [item.postId]: {
        myReaction: nextReaction,
        reactionCount: nextCount,
        hasLiked: nextReaction === 'like',
      },
    }));

    try {
      await toggleLike({ postId: item.postId });
    } catch (err: any) {
      setReactionOverrides((prev: Record<string, ReactionUiOverride>) => {
        const next = { ...prev };
        delete next[item.postId];
        return next;
      });
      Alert.alert('Like', err?.message || 'Could not like post');
    }
  };

  const handleArchiveOwnPost = async (item: any) => {
    try {
      await removePost({ postId: item.postId });
    } catch (err: any) {
      Alert.alert('Post', err?.message || 'Could not archive post');
    }
  };

  const handleRestoreOwnPost = async (item: any) => {
    try {
      await restorePost({ postId: item.postId });
      void trackAnalyticsEvent('post_restore', {
        post_id: item.postId,
        post_type: item.postType,
        route: 'SocialFeedScreen',
      });
    } catch (err: any) {
      Alert.alert('Post', err?.message || 'Could not restore post');
    }
  };

  const handlePermanentDeleteOwnPost = async (item: any) => {
    Alert.alert('Permanent delete?', 'This removes the post and its archive snapshot.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await permanentlyDeletePost({ postId: item.postId });
          } catch (err: any) {
            Alert.alert('Post', err?.message || 'Could not permanently delete post');
          }
        },
      },
    ]);
  };

  const handleToggleFollow = async (item: any) => {
    if (!canInteract) {
      Alert.alert('Sign in required', 'Please sign in to follow users.');
      return;
    }
    const isFollowing = followOverrides[item.userId] ?? followingIds.includes(item.userId);
    setFollowOverrides((prev: Record<string, boolean>) => ({ ...prev, [item.userId]: !isFollowing }));
    try {
      if (isFollowing) {
        await unfollowUser({ followingId: item.userId });
      } else {
        await followUser({ followingId: item.userId });
      }
    } catch (err: any) {
      setFollowOverrides((prev: Record<string, boolean>) => {
        const next = { ...prev };
        delete next[item.userId];
        return next;
      });
      Alert.alert('Follow', err?.message || 'Could not update follow status');
    }
  };

  const openUserProfile = useCallback((userId: string) => {
    navigation.navigate('CustomerProfile', { userId });
  }, [navigation]);

  const openDirectMessage = useCallback((userId: string, recipientName: string) => {
    navigation.navigate('StaffChat', {
      recipientId: userId,
      recipientName,
      chatType: 'direct',
    });
  }, [navigation]);

  const handleFollowAndMessage = useCallback(async (item: any) => {
    const isFollowing = followOverrides[item.userId] ?? followingIds.includes(item.userId);
    if (!isFollowing) {
      try {
        await followUser({ followingId: item.userId });
        setFollowOverrides((prev: Record<string, boolean>) => ({ ...prev, [item.userId]: true }));
      } catch (err: any) {
        Alert.alert('Follow', err?.message || 'Could not follow this user');
        return;
      }
    }
    openDirectMessage(String(item.userId), String(item.authorDisplayName || 'User'));
  }, [followOverrides, followingIds, followUser, openDirectMessage]);

  const renderFeedHeader = () => (
    <>
      <View style={styles.legacyTopBar}>
        <TouchableOpacity style={styles.legacyTopIconBtn} onPress={() => goBackOrHome(navigation, isStaffUser ? 'StaffMain' : 'Main')}>
          <Ionicons name="home" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.legacyTopTitle}>{isInitiativesRoute ? 'Initiatives' : 'Feed'}</Text>
        <View style={styles.legacyTopActions}>
          <TouchableOpacity style={styles.legacyTopIconBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications" size={22} color={colors.white} />
            {unreadNotifications > 0 ? (
              <View style={styles.legacyTopBadge}>
                <Text style={styles.legacyTopBadgeText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.legacyTopIconBtn}
            onPress={() => setProfileMenuOpen((value: boolean) => !value)}
          >
            <Ionicons name="person-circle-outline" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {profileMenuOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setProfileMenuOpen(false)}>
          <View style={styles.profileMenuOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setProfileMenuOpen(false)} />
            <View style={styles.profileDropdown}>
              <TouchableOpacity
                style={styles.profileDropdownHeader}
                activeOpacity={0.9}
                onPress={() => {
                  setProfileMenuOpen(false);
                  navigation.navigate(profileRoute);
                }}
              >
                <View style={styles.profileDropdownAvatar}>
                  <UserAvatar
                    uri={me?.profileImage ?? me?.image ?? ''}
                    name={me?.displayName ?? me?.name ?? me?.email}
                    size={44}
                    borderRadius={15}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.profileDropdownLabel}>{profileTitle}</Text>
                  <Text style={styles.profileDropdownName} numberOfLines={1}>
                    {me?.displayName ?? me?.name ?? me?.email ?? (isStaffUser ? 'Staff' : 'Customer')}
                  </Text>
                  <Text style={styles.profileDropdownMeta} numberOfLines={2}>
                    {profileSubtitle}
                  </Text>
                </View>
                <View style={styles.profileDropdownOpenPill}>
                  <Text style={styles.profileDropdownOpenText}>Open</Text>
                </View>
              </TouchableOpacity>

              <ScrollView style={styles.profileDropdownList} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {profileMenuItems.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.profileDropdownRow}
                    onPress={() => {
                      setProfileMenuOpen(false);
                      navigation.navigate(item.route);
                    }}
                  >
                    <View style={styles.profileDropdownRowIcon}>
                      <Ionicons name={item.icon as any} size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.profileDropdownRowText} numberOfLines={1}>{item.label}</Text>
                      <Text style={styles.profileDropdownRowDesc} numberOfLines={2}>{item.description}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}

      {isInitiativesRoute ? (
        <View style={styles.initiativesPortalCard}>
          <View style={styles.initiativesHeroTopRow}>
            <Ionicons name="leaf-outline" size={20} color={colors.primary} />
            <Text style={styles.initiativesHeroTitle}>Social Development Feed</Text>
          </View>
          <Text style={styles.initiativesHeroText}>
            Browse community-impact programmes, review sponsorship requests, and publish updates for customers and staff.
          </Text>
          <View style={styles.initiativesStatRow}>
            <View style={styles.initiativesStatPill}>
              <Text style={styles.initiativesStatValue}>{initiativePortalStats.total}</Text>
              <Text style={styles.initiativesStatLabel}>Programmes</Text>
            </View>
            <View style={styles.initiativesStatPill}>
              <Text style={styles.initiativesStatValue}>{initiativePortalStats.withBudget}</Text>
              <Text style={styles.initiativesStatLabel}>With targets</Text>
            </View>
            <View style={styles.initiativesStatPill}>
              <Text style={styles.initiativesStatValue} numberOfLines={1}>{initiativePortalStats.recentAuthor}</Text>
              <Text style={styles.initiativesStatLabel} numberOfLines={1}>{initiativePortalStats.recentTitle}</Text>
            </View>
          </View>
          <View style={styles.initiativesPortalActions}>
            <TouchableOpacity style={styles.initiativesPortalActionBtn} onPress={() => setMode('global')}>
              <Ionicons name="bookmark-outline" size={16} color={colors.primary} />
              <Text style={styles.initiativesPortalActionText}>Browse programmes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.initiativesPortalActionBtn, styles.initiativesPortalActionBtnPrimary]} onPress={openComposer}>
              <Ionicons name="add-circle-outline" size={16} color={colors.white} />
              <Text style={[styles.initiativesPortalActionText, styles.initiativesPortalActionTextPrimary]}>Create update</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {false ? (
        <View style={styles.staffMenuBlock}>
          <View style={styles.staffMenuCompactGrid}>
            {(isStaffUser ? STAFF_MENU_ITEMS : CUSTOMER_MENU_ITEMS).map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.staffMenuCompactItem}
                onPress={() => navigation.navigate(item.route)}
              >
                <View style={styles.staffMenuCompactIcon}>
                  <Ionicons name={item.icon as any} size={16} color={colors.primary} />
                </View>
                <View style={styles.staffMenuCompactBody}>
                  <Text style={styles.staffMenuCompactTitle} numberOfLines={1}>{item.label}</Text>
                  <Text style={styles.staffMenuCompactMeta} numberOfLines={2}>{item.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.container}>
      <ImageBackground source={appBackgroundImage} style={styles.wallpaper} resizeMode="cover">
        <View style={styles.wallpaperOverlay} />
        <StatusBar barStyle="light-content" />
        {renderComposerModal()}
        <SafeAreaView edges={['top']} style={styles.safe}>
          {isWideLayout ? (
            <View pointerEvents="box-none" style={styles.wideSidebar}>
              <TouchableOpacity
                style={styles.profileRailCard}
                activeOpacity={0.9}
                onPress={() => navigation.navigate(profileRoute)}
              >
                <View style={styles.profileRailAvatarWrap}>
                  <UserAvatar
                    uri={me?.profileImage ?? me?.image ?? ''}
                    name={me?.displayName ?? me?.name ?? me?.email}
                    size={52}
                    borderRadius={18}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.profileRailLabel}>{profileTitle}</Text>
                  <Text style={styles.profileRailName} numberOfLines={1}>
                    {me?.displayName ?? me?.name ?? me?.email ?? (isStaffUser ? 'Staff' : 'Customer')}
                  </Text>
                  <Text style={styles.profileRailMeta} numberOfLines={2}>
                    {profileSubtitle}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </TouchableOpacity>

              <View style={[styles.staffMenuBlock, styles.staffMenuBlockWide]}>
                <View style={styles.staffMenuHeader}>
                  <Ionicons name="grid-outline" size={16} color={colors.primary} />
                  <Text style={styles.staffMenuTitle}>{isStaffUser ? 'Staff menu' : 'Customer menu'}</Text>
                  <TouchableOpacity onPress={() => setProfileMenuOpen((value: boolean) => !value)} style={styles.staffMenuBadge}>
                    <Text style={styles.staffMenuBadgeText}>{profileMenuOpen ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
                {profileMenuOpen ? (
                  <ScrollView
                    style={styles.staffMenuDropdown}
                    contentContainerStyle={{ paddingBottom: 4 }}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                  >
                    {(isStaffUser ? STAFF_MENU_ITEMS : CUSTOMER_MENU_ITEMS).map((item) => (
                      <TouchableOpacity
                        key={item.key}
                        style={styles.staffMenuDropdownRow}
                        onPress={() => navigation.navigate(item.route)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
                          <Ionicons name={item.icon as any} size={18} color={colors.primary} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.staffMenuName}>{item.label}</Text>
                            <Text style={styles.staffMenuMeta} numberOfLines={1}>{item.description}</Text>
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            </View>
          ) : null}

          <FlatList
            data={feedEntries}
            keyExtractor={(item: any) => String(item.feedKey ?? item.postId)}
            contentContainerStyle={styles.list}
            initialNumToRender={isWideLayout ? 3 : 2}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews={false}
            updateCellsBatchingPeriod={50}
            scrollEventThrottle={16}
            scrollIndicatorInsets={{ right: 1 }}
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
            ListHeaderComponent={
              <>
                {renderFeedHeader()}
                {renderComposer()}
              </>
            }
            ListEmptyComponent={
              showEmptyState ? (
                <View style={styles.empty}>
                  <Ionicons name="newspaper-outline" size={44} color={colors.textLight} />
                  <Text style={styles.emptyTitle}>No posts yet</Text>
                  <Text style={styles.emptyText}>{isInitiativesRoute ? 'No social development posts yet. Check back for community updates and programme stories.' : isAdmin ? 'No posts match this view yet.' : 'Be the first to share a car story, advert, special, promotion, or competition.'}</Text>
                </View>
              ) : null
            }
            onEndReached={() => {
              if (feedPage.status === 'CanLoadMore') {
                feedPage.loadMore(Platform.OS === 'web' ? 100 : 12);
              }
            }}
            onEndReachedThreshold={0.75}
            renderItem={({ item }: { item: any }) => {
              if (item.entryType === 'composerDraft') {
                const draftMediaUri = item.video || item.image;
                return (
                  <View style={[styles.card, styles.pendingComposerCard]}>
                    <View style={styles.cardHeader}>
                      <UserAvatar
                        uri={item.authorProfileImage}
                        name={item.authorDisplayName}
                        size={44}
                        borderRadius={22}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{item.authorDisplayName}</Text>
                        <Text style={styles.meta}>{item.pendingState === 'publishing' ? 'Publishing…' : item.pendingState === 'uploading' ? 'Uploading media…' : 'Draft ready'}</Text>
                      </View>
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingBadgeText}>{item.pendingState === 'failed' ? 'Failed' : 'Pending'}</Text>
                      </View>
                    </View>
                    {item.title ? <Text style={styles.postTitle}>{item.title}</Text> : null}
                    <Text style={styles.content}>{item.content}</Text>
                    {draftMediaUri ? <AdaptivePostMedia item={item} /> : null}
                  </View>
                );
              }

              if (item.entryType === 'stockRail' || item.entryType === 'merchRail') {
                return renderFeedRail(item.entryType);
              }

              const mediaUri = item.video || item.image;
              const isStaffPost = item.role === 'staff';
              const isMine = me?._id === item.userId;
              const canOpenPostOptions = isMine || isAdmin;
              const dealershipLine = [item.authorDealershipName, item.authorDealershipLocation].filter(Boolean).join(' · ');
              const shareMessage = getPostShareMessage({
                postId: item.postId,
                title: item.title,
                authorName: item.authorDisplayName,
                description: item.content,
              });
              const shareUrl = getPostShareUrl(item.postId);
              const isFollowingAuthor = followOverrides[item.userId] ?? followingIds.includes(item.userId);
              const reactionOverride = reactionOverrides[item.postId];
              const selectedReaction = reactionOverride?.myReaction ?? item.myReaction;
              const reactionCount = reactionOverride?.reactionCount ?? item.reactionCount ?? item.likeCount ?? 0;
              const reactionSummary = item.reactionSummary ?? {};
              return (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    {canOpenPostOptions ? (
                      <TouchableOpacity style={styles.postSettingsBtn} onPress={() => openPostOptions(item)}>
                        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    ) : null}
                    {item.authorProfileImage ? (
                      <UserAvatar uri={item.authorProfileImage} name={item.authorDisplayName} size={44} borderRadius={22} />
                    ) : (
                      <UserAvatar uri={item.authorProfileImage} name={item.authorDisplayName} size={44} borderRadius={22} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{item.authorDisplayName}</Text>
                      <Text style={styles.meta}>
                        {timeAgo(item.createdAt)}{item.postType ? ` · ${String(item.postType).replace(/^./, (c: string) => c.toUpperCase())}` : ''}{item.tag ? ` · ${item.tag}` : ''}
                      </Text>
                      {isStaffPost ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.primary + '14', borderWidth: 1, borderColor: colors.primary + '24' }}>
                            <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>Staff</Text>
                          </View>
                          {dealershipLine ? (
                            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
                              {dealershipLine}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                      {isAdmin && mode === 'moderation' ? (
                        <View style={styles.postStatusRow}>
                          <View style={[styles.postStatusPill, item.isApproved ? styles.postStatusApproved : styles.postStatusPending]}>
                            <Text style={styles.postStatusText}>{item.isApproved ? 'Approved' : 'Pending'}</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.postActionRow}>
                    {item.userId !== me?._id ? (
                      <TouchableOpacity
                        style={[styles.postActionBtn, isFollowingAuthor && styles.postActionBtnFollowing]}
                        onPress={() => void handleToggleFollow(item)}
                      >
                        <Ionicons name={isFollowingAuthor ? 'checkmark-circle-outline' : 'person-add-outline'} size={16} color={isFollowingAuthor ? colors.primary : colors.primary} />
                        <Text style={[styles.postActionText, isFollowingAuthor && styles.postActionTextFollowing]}>{isFollowingAuthor ? 'Following' : 'Follow'}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {item.userId !== me?._id && isFollowingAuthor ? (
                      <TouchableOpacity
                        style={styles.postActionBtn}
                        onPress={() => openUserProfile(String(item.userId))}
                      >
                        <Ionicons name="person-outline" size={16} color={colors.primary} />
                        <Text style={[styles.postActionText, { color: colors.primary }]}>Profile</Text>
                      </TouchableOpacity>
                    ) : null}
                    {item.userId !== me?._id && (isFollowingAuthor || isStaffPost) ? (
                      <TouchableOpacity
                        style={styles.postActionBtn}
                        onPress={() => openDirectMessage(String(item.userId), String(item.authorDisplayName || 'User'))}
                      >
                        <Ionicons name="chatbubble-outline" size={16} color={colors.primary} />
                        <Text style={[styles.postActionText, { color: colors.primary }]}>Message</Text>
                      </TouchableOpacity>
                    ) : null}
                    {item.userId !== me?._id && !isFollowingAuthor ? (
                      <TouchableOpacity
                        style={styles.postActionBtn}
                        onPress={() => void handleFollowAndMessage(item)}
                      >
                        <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
                        <Text style={[styles.postActionText, { color: colors.primary }]}>Follow & Message</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {item.title ? <Text style={styles.postTitle}>{item.title}</Text> : null}
                  <ReadMoreText
                    text={String(item.content ?? '')}
                    expanded={Boolean(expandedPosts[item.postId])}
                    onToggle={() => setExpandedPosts((current: Record<string, boolean>) => ({ ...current, [item.postId]: !current[item.postId] }))}
                  />
                  {item.carMake || item.carModel || item.carYear ? (
                    <Text style={styles.carMeta}>
                      {[item.carYear, item.carMake, item.carModel].filter(Boolean).join(' ')}
                    </Text>
                  ) : null}

                  {isAdmin && mode === 'moderation' ? (
                    <View style={styles.moderationActions}>
                      <TouchableOpacity
                        style={[styles.moderationBtn, item.isApproved ? styles.moderationBtnNeutral : styles.moderationBtnPrimary]}
                        onPress={() => handleModerationAction(item, 'approve')}
                      >
                        <Ionicons name={item.isApproved ? 'remove-circle-outline' : 'checkmark-circle-outline'} size={16} color={item.isApproved ? colors.text : colors.white} />
                        <Text style={[styles.moderationBtnText, item.isApproved && styles.moderationBtnTextDark]}>
                          {item.isApproved ? 'Unapprove' : 'Approve'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.moderationBtn, styles.moderationBtnDanger]}
                        onPress={() => handleModerationAction(item, 'delete')}
                      >
                        <Ionicons name="archive-outline" size={16} color={colors.white} />
                        <Text style={styles.moderationBtnText}>Archive</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {mediaUri ? (
                    <AdaptivePostMedia item={item} />
                  ) : null}

                  {reactionCount > 0 ? (
                    <View style={styles.reactionRow}>
                      {REACTIONS.map((reaction) => {
                        const count = Number((reactionSummary as any)[reaction.key] ?? 0);
                        if (!count) return null;
                        const active = selectedReaction === reaction.key;
                        return (
                          <View key={reaction.key} style={[styles.reactionBadge, active && styles.reactionBadgeActive]}>
                            <Ionicons name={reaction.icon as any} size={12} color={active ? colors.primary : colors.textSecondary} />
                            <Text style={[styles.reactionBadgeText, active && styles.reactionBadgeTextActive]}>{count}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}

                  <View style={styles.actions}>
                    <View style={styles.reactionTriggerWrap}>
                      {reactionMenuPostId === item.postId ? (
                        <View style={styles.reactionPopover}>
                          {REACTIONS.map((reaction) => {
                            const active = selectedReaction === reaction.key;
                            return (
                              <TouchableOpacity
                                key={reaction.key}
                                style={[styles.reactionPopoverBtn, active && styles.reactionPopoverBtnActive]}
                                onPress={() => handleReaction(item, reaction.key)}
                              >
                                <Ionicons name={reaction.icon as any} size={14} color={active ? colors.primary : colors.textSecondary} />
                                <Text style={[styles.reactionPopoverText, active && styles.reactionPopoverTextActive]}>{reaction.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : null}
                      <Pressable
                        style={styles.iconBtn}
                        onPress={() => void handleLike(item)}
                        onLongPress={() => setReactionMenuPostId(item.postId)}
                        delayLongPress={250}
                        onHoverIn={() => {
                          if (Platform.OS === 'web') setReactionMenuPostId(item.postId);
                        }}
                      >
                        <Ionicons name={selectedReaction ? 'heart' : 'heart-outline'} size={18} color={selectedReaction ? colors.error : colors.textSecondary} />
                        <Text style={styles.iconText}>
                          {reactionCount > 0
                            ? `${reactionCount} · ${POST_REACTION_LABELS[selectedReaction ?? 'like'] ?? 'Like'}`
                            : 'Like'}
                        </Text>
                      </Pressable>
                    </View>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => setCommentPost(item)}>
                      <Ionicons name="chatbubble-outline" size={18} color={colors.textSecondary} />
                      <Text style={styles.iconText}>{item.commentCount}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => openShare(item)}>
                      <Ionicons name="share-social-outline" size={18} color={colors.textSecondary} />
                      <Text style={styles.iconText}>Share</Text>
                    </TouchableOpacity>
                    {isMine && item.isDeleted ? (
                      <TouchableOpacity style={styles.iconBtn} onPress={() => handleRestoreOwnPost(item)}>
                        <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                        <Text style={[styles.iconText, { color: colors.primary }]}>Restore</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            }}
          />

          <ShareSheetModal
            visible={!!sharePostItem}
            title={sharePostItem?.shareContext?.type === 'invite' ? 'Invite to app' : 'Share Post'}
            message={sharePostItem ? (sharePostItem.shareContext?.type === 'invite'
              ? `Invite ${sharePostItem.title?.replace(/^Invite\s+/i, '') || 'this account'} to a test drive, event, or competition participation.`
              : getPostShareMessage({
                  postId: sharePostItem.postId,
                  title: sharePostItem.title,
                  authorName: sharePostItem.authorDisplayName,
                  description: sharePostItem.content,
                })) : ''}
            shareUrl={sharePostItem ? (sharePostItem.shareContext?.type === 'invite' ? undefined : getPostShareUrl(sharePostItem.postId)) : undefined}
            shareContext={sharePostItem?.shareContext ?? (sharePostItem ? {
              type: 'post',
              postId: sharePostItem.postId,
              title: sharePostItem.title,
              authorName: sharePostItem.authorDisplayName,
              description: sharePostItem.content,
            } : { type: 'invite' })}
            onClose={() => setSharePostItem(null)}
          />

          <Modal visible={!!editPostItem} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <View style={styles.modalTopRow}>
                  <Text style={styles.modalTitle}>Edit Post</Text>
                  <View style={styles.modalSegmentRow}>
                    <TouchableOpacity style={[styles.modalSegment, editMode === 'details' && styles.modalSegmentActive]} onPress={() => setEditMode('details')}>
                      <Text style={[styles.modalSegmentText, editMode === 'details' && styles.modalSegmentTextActive]}>Details</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.modalSegment, editMode === 'media' && styles.modalSegmentActive]} onPress={() => setEditMode('media')}>
                      <Text style={[styles.modalSegmentText, editMode === 'media' && styles.modalSegmentTextActive]}>Media</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {editMode === 'details' ? (
                  <>
                    <TextInput value={editTitle} onChangeText={setEditTitle} placeholder="Title" placeholderTextColor={colors.textLight} style={styles.commentInput} />
                    <TextInput value={editContent} onChangeText={setEditContent} placeholder="Write something" placeholderTextColor={colors.textLight} style={[styles.commentInput, { marginTop: spacing.sm, minHeight: 120 }]} multiline />
                    <View style={styles.typeRow}>
                      {POST_TYPES.map((type) => (
                        <TouchableOpacity key={type.key} style={[styles.typeChip, editPostType === type.key && styles.typeChipActive]} onPress={() => setEditPostType(type.key)}>
                          <Text style={[styles.typeChipText, editPostType === type.key && styles.typeChipTextActive]}>{type.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    {editImages.length > 0 ? (
                      <View style={styles.mediaPreview}>
                        <MediaGallery uris={editImages.map((image: ComposerImage) => image.uri)} />
                      </View>
                    ) : editVideo ? (
                      <View style={styles.mediaPreview}>
                        <FeedVideo sourceUri={editVideo.uri} />
                      </View>
                    ) : (
                      <View style={styles.emptyMediaBox}>
                        <Ionicons name="image-outline" size={24} color={colors.textLight} />
                        <Text style={styles.emptyMediaText}>No media attached.</Text>
                      </View>
                    )}
                    <View style={styles.mediaRow}>
                      <TouchableOpacity style={styles.mediaBtn} onPress={() => void pickEditMedia('image')} disabled={editMediaPicking || editSaving}>
                        <Ionicons name="image-outline" size={16} color={colors.primary} />
                        <Text style={styles.mediaBtnText}>{editMediaPicking ? 'Selecting...' : editMediaUploading ? 'Uploading...' : 'Add Photo'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.mediaBtn} onPress={() => void pickEditMedia('video')} disabled={editMediaPicking || editSaving}>
                        <Ionicons name="videocam-outline" size={16} color={colors.primary} />
                        <Text style={styles.mediaBtnText}>{editMediaPicking ? 'Selecting...' : editMediaUploading ? 'Uploading...' : 'Add Video'}</Text>
                      </TouchableOpacity>
                      {(editImages.length > 0 || editVideo) ? (
                        <TouchableOpacity style={styles.mediaClearBtn} onPress={() => void handleRemoveEditMedia()} disabled={editMediaPicking || editSaving}>
                          <Text style={styles.mediaClearText}>Remove Media</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {editMediaUploading ? (
                      <Text style={styles.editMediaStatus}>Uploading media...</Text>
                    ) : null}
                  </>
                )}

                <TouchableOpacity style={styles.postBtn} onPress={handleSaveEdit} disabled={editSaving || editMediaUploading || editMediaPicking}>
                  <Text style={styles.postBtnText}>{editSaving ? 'Saving...' : 'Save Changes'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditPostItem(null)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal visible={!!postOptionsPostItem} transparent animationType="fade" onRequestClose={() => setPostOptionsPostItem(null)}>
            <View style={styles.modalOverlayHigh}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setPostOptionsPostItem(null)} />
              <View style={styles.optionsSheet}>
                <Text style={styles.modalTitle}>Post options</Text>
                <Text style={styles.optionsSubtitle}>{postOptionsPostItem?.title || postOptionsPostItem?.content || 'Manage this post'}</Text>
                <TouchableOpacity style={styles.optionRowBtn} onPress={() => { const item = postOptionsPostItem; setPostOptionsPostItem(null); if (item) openEdit(item, 'details'); }}>
                  <Ionicons name="create-outline" size={18} color={colors.text} />
                  <Text style={styles.optionRowBtnText}>Edit details</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.optionRowBtn} onPress={() => { const item = postOptionsPostItem; setPostOptionsPostItem(null); if (item) openEdit(item, 'media'); }}>
                  <Ionicons name="image-outline" size={18} color={colors.primary} />
                  <Text style={[styles.optionRowBtnText, { color: colors.primary }]}>Change media</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.optionRowBtn, styles.optionRowBtnDanger]} onPress={() => { const item = postOptionsPostItem; setPostOptionsPostItem(null); if (item) void handleDeletePost(item); }}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                  <Text style={[styles.optionRowBtnText, { color: colors.error }]}>Remove from feed</Text>
                </TouchableOpacity>
                {postOptionsPostItem?.isDeleted ? (
                  <TouchableOpacity style={styles.optionRowBtn} onPress={() => { const item = postOptionsPostItem; setPostOptionsPostItem(null); if (item) void handleRestoreOwnPost(item); }}>
                    <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                    <Text style={[styles.optionRowBtnText, { color: colors.primary }]}>Restore post</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setPostOptionsPostItem(null)}>
                  <Text style={styles.cancelText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal visible={!!commentPost} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Add Comment</Text>
                <Text style={styles.commentPostTitle} numberOfLines={2}>
                  {commentPost?.title || commentPost?.content || 'Post comments'}
                </Text>

                <View style={styles.commentList}>
                  {commentThreads.topLevel.length > 0 ? commentThreads.topLevel.map((comment: any) => {
                    const replies = commentThreads.repliesByParent.get(comment.commentId) ?? [];
                    const isLiked = comment.myReaction === 'like';
                    return (
                      <View key={comment.commentId} style={styles.commentThread}>
                        <View style={styles.commentRow}>
                          <View style={styles.commentAvatar}>
                            <Text style={styles.commentAvatarText}>{(comment.authorDisplayName || 'U').charAt(0).toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.commentAuthor}>{comment.authorDisplayName}</Text>
                            <Text style={styles.commentBody}>{comment.text}</Text>
                            <View style={styles.commentActionRow}>
                              <TouchableOpacity style={styles.commentActionBtn} onPress={() => { setReplyToComment(comment); setCommentText(''); }}>
                                <Text style={styles.commentActionText}>Reply</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[styles.commentActionBtn, isLiked && styles.commentActionBtnActive]} onPress={() => void handleToggleCommentLike(comment)}>
                                <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={12} color={isLiked ? colors.error : colors.textSecondary} />
                                <Text style={[styles.commentActionText, isLiked && styles.commentActionTextActive]}>{comment.likeCount || 0}</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                        {replies.length > 0 ? replies.map((reply: any) => {
                          const replyLiked = reply.myReaction === 'like';
                          return (
                            <View key={reply.commentId} style={styles.commentReplyRow}>
                              <View style={styles.commentReplyLine} />
                              <View style={{ flex: 1 }}>
                                <View style={styles.commentRow}>
                                  <View style={styles.commentAvatar}>
                                    <Text style={styles.commentAvatarText}>{(reply.authorDisplayName || 'U').charAt(0).toUpperCase()}</Text>
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.commentAuthor}>{reply.authorDisplayName}</Text>
                                    <Text style={styles.commentBody}>{reply.text}</Text>
                                    <View style={styles.commentActionRow}>
                                      <TouchableOpacity style={styles.commentActionBtn} onPress={() => { setReplyToComment(reply); setCommentText(''); }}>
                                        <Text style={styles.commentActionText}>Reply</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity style={[styles.commentActionBtn, replyLiked && styles.commentActionBtnActive]} onPress={() => void handleToggleCommentLike(reply)}>
                                        <Ionicons name={replyLiked ? 'heart' : 'heart-outline'} size={12} color={replyLiked ? colors.error : colors.textSecondary} />
                                        <Text style={[styles.commentActionText, replyLiked && styles.commentActionTextActive]}>{reply.likeCount || 0}</Text>
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                </View>
                              </View>
                            </View>
                          );
                        }) : null}
                      </View>
                    );
                  }) : (
                    <Text style={styles.commentEmpty}>No comments yet. Be the first to reply.</Text>
                  )}
                </View>

                {replyToComment ? (
                  <View style={styles.replyingBanner}>
                    <Text style={styles.replyingBannerText}>Replying to {replyToComment.authorDisplayName}</Text>
                    <TouchableOpacity onPress={() => setReplyToComment(null)}>
                      <Text style={styles.replyingBannerCancel}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <TextInput value={commentText} onChangeText={setCommentText} placeholder="Write a simple comment" placeholderTextColor={colors.textLight} style={styles.commentInput} multiline />
                <TouchableOpacity style={styles.postBtn} onPress={handleComment} disabled={commentSubmitting}><Text style={styles.postBtnText}>{commentSubmitting ? 'Sending...' : 'Send'}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setCommentPost(null)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1, backgroundColor: 'transparent' },
  wallpaper: { ...StyleSheet.absoluteFillObject },
  wallpaperOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3, 8, 20, 0.22)' },
  legacyTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    position: 'relative',
    zIndex: 20,
  },
  legacyTopIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  legacyTopTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  legacyTopActions: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
  },
  legacyTopBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  legacyTopBadgeText: { color: colors.white, fontSize: 9, fontWeight: '900' },
  legacyFeedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  legacyBackBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  legacyFeedTitleWrap: { alignItems: 'center', flex: 1 },
  legacyFeedTitle: { fontSize: 26, fontWeight: '900', color: colors.text },
  legacyFeedSubtitle: {
    marginTop: 4,
    fontSize: 11,
    color: colors.textLight,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  legacyChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  legacyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  legacyChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  legacyChipText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 12,
  },
  legacyChipTextActive: {
    color: colors.white,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  headerSubtitle: { marginTop: 2, fontSize: 11, color: colors.textLight, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, paddingRight: spacing.sm },
  listWide: {
    paddingRight: 0,
  },
  moderationBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.primary + '10', borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.primary + '25', marginBottom: spacing.md },
  moderationBannerTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  moderationBannerText: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  widgetRailControls: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: spacing.sm },
  widgetRailNavBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center', justifyContent: 'center' },
  widgetRailNavBtnDisabled: { opacity: 0.45 },
  widgetRail: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.md, paddingRight: spacing.lg },
  widgetCard: {
    width: 188,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  widgetIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  widgetTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  widgetSubtitle: { marginTop: 4, fontSize: 11, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase' },
  widgetDetail: { marginTop: 8, fontSize: 12, lineHeight: 17, color: colors.textSecondary, minHeight: 34 },
  widgetFooter: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  widgetFooterText: { fontSize: 11, fontWeight: '900' },
  widgetModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2,6,23,0.5)' },
  widgetSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.lg, borderTopWidth: 1, borderColor: colors.borderLight },
  widgetSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  widgetSheetTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  widgetSheetSubtitle: { marginTop: 2, fontSize: 12, color: colors.textLight, fontWeight: '700' },
  widgetCloseBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  widgetSheetContent: { gap: spacing.sm, paddingBottom: spacing.md },
  widgetEmpty: { color: colors.textSecondary, fontSize: 13, paddingVertical: spacing.sm },
  widgetLargeStat: { padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight, marginBottom: spacing.sm },
  widgetLargeStatValue: { fontSize: 28, fontWeight: '900', color: colors.text },
  widgetLargeStatLabel: { marginTop: 4, fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  suggestedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: 18, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  suggestedAvatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center' },
  suggestedAvatarText: { color: colors.primary, fontWeight: '900' },
  suggestedName: { fontSize: 14, fontWeight: '800', color: colors.text },
  suggestedMeta: { marginTop: 2, fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  followMiniBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '24' },
  followMiniBtnActive: { backgroundColor: colors.surface, borderColor: colors.borderLight },
  followMiniText: { fontSize: 11, fontWeight: '900', color: colors.primary },
  followMiniTextActive: { color: colors.textSecondary },
  sheetItemCard: { padding: spacing.md, borderRadius: 18, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  sheetItemTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  sheetItemBody: { marginTop: 4, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  sheetItemMeta: { marginTop: 8, fontSize: 11, color: colors.textLight, fontWeight: '700' },
  openFullScreenBtn: { marginTop: spacing.sm, alignItems: 'center', paddingVertical: 12, borderRadius: radius.full, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '24' },
  openFullScreenText: { color: colors.primary, fontWeight: '900', fontSize: 13 },
  composeCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  composeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, gap: spacing.sm },
  composeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '20' },
  composeBadgeText: { fontSize: 11, fontWeight: '900', color: colors.primary, letterSpacing: 0.4 },
  composeHeaderHint: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.textSecondary, fontWeight: '600', textAlign: 'right' },
  composeHelperText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: spacing.sm },
  initiativesComposerStack: { gap: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md },
  initiativesComposerIntro: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '20' },
  initiativesComposerIntroText: { flex: 1, color: colors.primary, fontSize: 12, fontWeight: '700' },
  mineCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  mineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  mineTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  mineSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  mineEmpty: { color: colors.textSecondary, fontSize: 13, paddingVertical: spacing.sm },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight },
  mineRowTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  mineRowMeta: { fontSize: 11, color: colors.textLight, marginTop: 2 },
  mineActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  mineActionBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.primary + '10' },
  mineActionBtnDanger: { backgroundColor: colors.error + '12' },
  mineActionText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  mineActionTextDanger: { color: colors.error },
  composeLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.sm, fontWeight: '600' },
  composerDraftCard: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  composerDraftHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  composerDraftTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 2 },
  composerDraftBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface },
  composerDraftBadgeUploading: { backgroundColor: colors.warning + '18', borderColor: colors.warning + '28' },
  composerDraftBadgeReady: { backgroundColor: colors.success + '16', borderColor: colors.success + '26' },
  composerDraftBadgeFailed: { backgroundColor: colors.error + '12', borderColor: colors.error + '22' },
  composerDraftBadgeText: { color: colors.textSecondary, fontSize: 11, fontWeight: '900' },
  composerDraftBadgeTextDanger: { color: colors.error },
  composerDraftScroll: { gap: spacing.sm, paddingBottom: 2 },
  composerDraftTile: { width: 132 },
  composerDraftTileWide: { width: 180 },
  composerDraftMediaFrame: { position: 'relative', overflow: 'hidden', borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  composerDraftMediaImage: { width: '100%', height: 160, backgroundColor: colors.surfaceAlt },
  composerDraftRemoveBtn: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  composerDraftMediaName: { marginTop: 6, color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  composerDraftError: { marginTop: spacing.sm, color: colors.error, fontSize: 12, fontWeight: '700' },
  titleInput: { minHeight: 48, color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  input: { minHeight: 96, color: colors.text, textAlignVertical: 'top', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  typeChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.surfaceAlt },
  typeChipActive: { backgroundColor: colors.primary },
  typeChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  typeChipTextActive: { color: colors.white },
  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  mediaBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '20' },
  mediaBtnText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  mediaClearBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  mediaClearText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  mediaPreview: { marginTop: spacing.sm },
  previewImage: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  previewVideo: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  previewStatusOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  previewStatusText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  previewErrorText: { marginTop: 8, color: colors.error, fontWeight: '600', fontSize: 12 },
  postBtn: { marginTop: spacing.md, alignSelf: 'flex-end', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.primary },
  postBtnText: { color: colors.white, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: '800' },
  name: { fontSize: 16, lineHeight: 20, fontWeight: '800', color: colors.text },
  meta: { fontSize: 11.5, color: colors.textLight, marginTop: 2, lineHeight: 16 },
  postStatusRow: { marginTop: 6, alignSelf: 'flex-start' },
  postStatusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  postStatusApproved: { backgroundColor: colors.success + '18' },
  postStatusPending: { backgroundColor: colors.warning + '18' },
  postStatusText: { fontSize: 11, fontWeight: '800', color: colors.text },
  postTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: colors.text, marginBottom: 8 },
  content: { color: colors.text, fontSize: 14.5, lineHeight: 21 },
  readMoreBtn: { marginTop: 6, alignSelf: 'flex-start' },
  readMoreText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  carMeta: { marginTop: spacing.sm, color: colors.primary, fontWeight: '700' },
  postImage: { width: '100%', height: 240, borderRadius: 18, marginTop: 12, backgroundColor: colors.surfaceAlt },
  postVideo: { width: '100%', height: 240, borderRadius: 18, marginTop: 12, backgroundColor: colors.surfaceAlt },
  videoFrame: { minHeight: MIN_MEDIA_HEIGHT, backgroundColor: colors.surfaceAlt },
  videoFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.surfaceAlt },
  videoPlayButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  videoFallbackText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  videoFallbackMeta: { color: colors.textLight, fontSize: 10, fontWeight: '600', paddingHorizontal: spacing.md, textAlign: 'center' },
  mediaFill: { width: '100%', height: '100%' },
  videoPlayer: { width: '100%', height: '100%', backgroundColor: colors.surfaceAlt },
  videoModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: spacing.lg },
  videoModalSheet: { backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderLight },
  videoModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight, backgroundColor: colors.surface },
  videoModalTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  videoModalCloseBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  videoModalPlayerWrap: { backgroundColor: '#000', aspectRatio: 16 / 9 },
  videoModalPlayer: { width: '100%', height: '100%' },
  moderationActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm, flexWrap: 'wrap' },
  moderationBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  moderationBtnPrimary: { backgroundColor: colors.primary },
  moderationBtnNeutral: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  moderationBtnDanger: { backgroundColor: colors.error },
  moderationBtnText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  moderationBtnTextDark: { color: colors.text },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' },
  sidebarToggle: { position: 'relative', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  sidebarBadge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.error, borderWidth: 1.5, borderColor: colors.surface },
  sidebarBadgeText: { color: colors.white, fontSize: 9, fontWeight: '900' },
  sidebarOverlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-start', backgroundColor: 'rgba(0,0,0,0.35)' },
  sidebarBackdrop: { flex: 1 },
  sidebarSheet: { width: '84%', maxWidth: 340, backgroundColor: colors.surface, padding: spacing.lg, borderTopRightRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden', borderRightWidth: 1, borderRightColor: colors.borderLight },
  sidebarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sidebarTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  sidebarList: { gap: spacing.sm, paddingBottom: spacing.md },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  sidebarItemIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '14' },
  sidebarItemText: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  sidebarItemTextActive: { color: colors.primary },
  reactionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  reactionBtnActive: { backgroundColor: colors.primary + '12', borderColor: colors.primary + '24' },
  reactionText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  reactionTextActive: { color: colors.primary },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12, flexWrap: 'wrap' },
  reactionTriggerWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  reactionPopover: {
    position: 'absolute',
    bottom: 34,
    left: -6,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    zIndex: 20,
  },
  reactionPopoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reactionPopoverBtnActive: {
    backgroundColor: colors.primary + '10',
    borderColor: colors.primary + '20',
  },
  reactionPopoverText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  reactionPopoverTextActive: { color: colors.primary },
  iconBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconText: { color: colors.textSecondary, fontWeight: '600' },
  empty: { paddingVertical: 64, alignItems: 'center' },
  emptyTitle: { marginTop: spacing.md, fontSize: 18, fontWeight: '700', color: colors.textSecondary },
  emptyText: { marginTop: spacing.sm, color: colors.textLight, textAlign: 'center' },
  loadingWrap: { paddingVertical: spacing.xl, alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalOverlayHigh: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', zIndex: 1000, elevation: 1000 },
  profileMenuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'flex-start', zIndex: 2000, elevation: 2000 },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  commentInput: { minHeight: 100, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, color: colors.text, textAlignVertical: 'top' },
  commentPostTitle: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm, fontWeight: '600' },
  commentList: { maxHeight: 240, gap: 10, marginBottom: spacing.md },
  commentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentThread: { gap: 8 },
  commentReplyRow: { flexDirection: 'row', gap: 8, paddingLeft: 12 },
  commentReplyLine: { width: 2, borderRadius: 2, backgroundColor: colors.borderLight, marginLeft: 14, marginTop: 4, marginBottom: 4 },
  commentAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center' },
  commentAvatarText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  commentAuthor: { fontSize: 13, fontWeight: '800', color: colors.text },
  commentBody: { fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  commentActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  commentActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  commentActionBtnActive: { backgroundColor: colors.error + '10', borderColor: colors.error + '20' },
  commentActionText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  commentActionTextActive: { color: colors.error },
  replyingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '20', marginBottom: spacing.sm },
  replyingBannerText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  replyingBannerCancel: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
  commentEmpty: { fontSize: 13, color: colors.textSecondary, paddingVertical: 8 },
  cancelBtn: { alignItems: 'center', marginTop: spacing.md, paddingVertical: spacing.sm },
  cancelText: { color: colors.textSecondary, fontWeight: '600' },
  galleryWrap: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, marginBottom: spacing.md },
  galleryStage: { width: '100%', position: 'relative', overflow: 'hidden', borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  gallerySlide: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  galleryImage: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  galleryControls: { position: 'absolute', left: spacing.md, right: spacing.md, top: '50%', marginTop: -18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  galleryNavBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primary + '20' },
  galleryNavBtnDisabled: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderLight },
  galleryDots: { flexDirection: 'row', justifyContent: 'center', padding: spacing.md },
  galleryDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.borderLight, borderWidth: 1, borderColor: colors.borderLight },
  galleryDotActive: { backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primary },
  galleryHintWrap: { paddingBottom: spacing.md },
  galleryHintText: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
  postActionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  postSettingsBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight, marginRight: 6 },
  postActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  postActionBtnFollowing: { backgroundColor: colors.primary + '12', borderColor: colors.primary + '24' },
  postActionBtnDanger: { backgroundColor: colors.error + '12', borderColor: colors.error + '18' },
  postActionText: { color: colors.textSecondary, fontWeight: '600' },
  postActionTextFollowing: { color: colors.primary },
  optionsSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, borderTopWidth: 1, borderColor: colors.borderLight },
  optionsSubtitle: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.md },
  optionRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight, marginBottom: spacing.sm },
  optionRowBtnDanger: { backgroundColor: colors.error + '10', borderColor: colors.error + '20' },
  optionRowBtnText: { fontSize: 14, fontWeight: '800', color: colors.text },
  modalTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  modalSegmentRow: { flexDirection: 'row', gap: 8 },
  modalSegment: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  modalSegmentActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modalSegmentText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  modalSegmentTextActive: { color: colors.white },
  emptyMediaBox: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: spacing.xl, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight },
  emptyMediaText: { color: colors.textSecondary, fontWeight: '700' },
  editMediaStatus: { marginTop: spacing.sm, color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  reactionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.primary + '14', borderWidth: 1, borderColor: colors.primary + '24' },
  reactionBadgeActive: { backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primary, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  reactionBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  reactionBadgeTextActive: { color: colors.white, fontWeight: '900' },
  suggestedProfile: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: 18, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  suggestedProfileAvatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center' },
  suggestedProfileInitial: { color: colors.primary, fontWeight: '900' },
  suggestedProfileName: { fontSize: 14, fontWeight: '800', color: colors.text },
  suggestedProfileMeta: { marginTop: 2, fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  suggestedProfileBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '24' },
  suggestedProfileBtnText: { fontSize: 11, fontWeight: '900', color: colors.primary },
  staffMenuBlock: { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  staffMenuBlockWide: { width: WIDE_SIDEBAR_WIDTH, marginHorizontal: 0, marginBottom: 0 },
  staffMenuHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  staffMenuTitle: { fontSize: 14, fontWeight: '900', color: colors.text, flex: 1 },
  staffMenuBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '24' },
  staffMenuBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  staffMenuDropdown: { maxHeight: 320 },
  staffMenuDropdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight, marginBottom: 8 },
  staffMenuName: { fontSize: 14, fontWeight: '800', color: colors.text },
  staffMenuMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  staffMenuCompactGrid: { gap: spacing.sm },
  staffMenuCompactItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  staffMenuCompactIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '14' },
  staffMenuCompactBody: { flex: 1 },
  staffMenuCompactTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  staffMenuCompactMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  profileDropdown: { position: 'absolute', top: 60, right: spacing.lg, width: 320, maxWidth: '90%', backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, zIndex: 1001, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 16 },
  profileDropdownFront: { position: 'absolute', top: 60, right: spacing.lg, width: 320, maxWidth: '90%', backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, zIndex: 1000, elevation: 1000, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  profileDropdownHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight, marginBottom: spacing.sm },
  profileDropdownAvatar: { width: 44, height: 44, borderRadius: 15, overflow: 'hidden' },
  profileDropdownLabel: { fontSize: 11, fontWeight: '900', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.8 },
  profileDropdownName: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 },
  profileDropdownMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  profileDropdownOpenPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '24' },
  profileDropdownOpenText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  profileDropdownList: { maxHeight: 340 },
  profileDropdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight, marginBottom: 8 },
  profileDropdownRowIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '14' },
  profileDropdownRowText: { fontSize: 14, fontWeight: '800', color: colors.text },
  profileDropdownRowDesc: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  profileRailCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, marginBottom: spacing.md },
  profileRailAvatarWrap: { width: 52, height: 52, borderRadius: 18, overflow: 'hidden' },
  profileRailLabel: { fontSize: 11, fontWeight: '900', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.8 },
  profileRailName: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 },
  profileRailMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  feedInsertCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, marginBottom: spacing.md },
  feedInsertHeader: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.sm },
  feedInsertTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  feedInsertSubtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  feedInsertRail: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.xs },
  feedInsertRailWrap: { position: 'relative' },
  feedInsertRailNavBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    zIndex: 4,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  feedInsertRailNavBtnLeft: { left: -4 },
  feedInsertRailNavBtnRight: { right: -4 },
  feedInsertItemCard: { width: 180, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.sm },
  feedInsertImage: { width: '100%', height: 110, borderRadius: radius.md, backgroundColor: colors.surface },
  feedInsertImagePlaceholder: { width: '100%', height: 110, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  feedInsertItemTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  feedInsertItemMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  feedInsertActionRow: { flexDirection: 'row', gap: 8, marginTop: spacing.sm, flexWrap: 'wrap' },
  feedInsertActionBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  feedInsertActionBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  feedInsertActionText: { fontSize: 11, fontWeight: '800', color: colors.text },
  feedInsertActionTextPrimary: { color: colors.white },
  feedInsertEmptyCard: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight },
  feedInsertEmptyText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  initiativesPortalCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  initiativesHeroTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  initiativesHeroTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  initiativesHeroText: { marginTop: spacing.sm, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  initiativesStatRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  initiativesStatPill: { flex: 1, padding: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  initiativesStatValue: { fontSize: 14, fontWeight: '900', color: colors.text },
  initiativesStatLabel: { marginTop: 2, fontSize: 11, color: colors.textSecondary, fontWeight: '700' },
  initiativesPortalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  initiativesPortalActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  initiativesPortalActionBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  initiativesPortalActionText: { fontSize: 12, fontWeight: '900', color: colors.text },
  initiativesPortalActionTextPrimary: { color: colors.white },
  wideSidebar: { position: 'absolute', left: spacing.lg, top: spacing.lg, bottom: spacing.lg, width: WIDE_SIDEBAR_WIDTH, zIndex: 5 },
  composeLauncher: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, marginHorizontal: spacing.lg, marginBottom: spacing.md },
  composeAvatarWrap: { width: 50, height: 50, borderRadius: 25, overflow: 'hidden' },
  composePromptWrap: { flex: 1 },
  composePromptText: { fontSize: 15, fontWeight: '800', color: colors.text },
  composePromptMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  composeEditBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '24' },
  composerModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  composerModalKeyboardWrap: { width: '100%', justifyContent: 'flex-end' },
  composerModalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xl, maxHeight: '92%' },
  composerModalScroll: { paddingBottom: spacing.sm },
  composerHeadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  composerAvatarRing: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden' },
  composerInput: { flex: 1, minHeight: 96, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, color: colors.text, textAlignVertical: 'top' },
  pendingComposerCard: { borderStyle: 'dashed', borderColor: colors.primary + '34', backgroundColor: colors.primary + '06' },
  pendingBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.warning + '16', borderWidth: 1, borderColor: colors.warning + '22' },
  pendingBadgeText: { color: colors.warning, fontSize: 11, fontWeight: '900' },
  restoreAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight },
  restoreAllBtnText: { fontSize: 12, fontWeight: '800', color: colors.text },
});