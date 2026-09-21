import { Share, Linking, Alert, Platform } from 'react-native';

const DEFAULT_PUBLIC_BASE_URL = 'https://hyundaikiahub.app.a0.dev';
const APP_SCHEME = 'hyundaikiahub';

function getPublicBaseUrl() {
  const origin =
    typeof globalThis !== 'undefined'
      ? (globalThis as any)?.location?.origin
      : undefined;
  return origin ? String(origin).replace(/\/$/, '') : DEFAULT_PUBLIC_BASE_URL;
}

export const PUBLIC_BASE_URL = getPublicBaseUrl();

export function buildPublicUrl(path = '/', params?: Record<string, string | undefined>) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const query = Object.entries(params ?? {})
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  const base = normalizedPath === '/' ? `${PUBLIC_BASE_URL}/` : `${PUBLIC_BASE_URL}${normalizedPath}`;
  return query ? `${base}${base.includes('?') ? '&' : '?'}${query}` : base;
}

function buildQueryString(params?: Record<string, string | undefined>) {
  const pairs: string[] = [];
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  });
  return pairs.join('&');
}

function buildAppDeepLink(path = '/', params?: Record<string, string | undefined>) {
  const normalizedPath = path.replace(/^\/+/, '');
  const queryString = buildQueryString(params);
  return `${APP_SCHEME}://${normalizedPath}${queryString ? `?${queryString}` : ''}`;
}

export const PUBLIC_LANDING_URL = buildPublicUrl('/');
export const PUBLIC_LOGIN_URL = buildPublicUrl('/login');
export const PUBLIC_SIGNUP_URL = buildPublicUrl('/signup');
export const PUBLIC_CONTACT_URL = buildPublicUrl('/#contact');
export const PUBLIC_PRIVACY_URL = buildPublicUrl('/#privacy-policy');
export const PUBLIC_TERMS_URL = buildPublicUrl('/#terms');

export type ShareContext =
  | { type: 'booking'; serviceType: string; date?: string }
  | { type: 'experience'; serviceType: string; rating?: number }
  | { type: 'invite'; referralCode?: string; inviterName?: string; inviterType?: 'customer' | 'staff'; dealershipName?: string; occupation?: string }
  | { type: 'post'; postId: string; title?: string; authorName?: string; description?: string };

export type SocialPlatformId = 'whatsapp' | 'facebook' | 'instagram' | 'tiktok' | 'native';

export const SOCIAL_PLATFORMS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366' },
  { id: 'facebook', label: 'Facebook', icon: 'logo-facebook', color: '#1877F2' },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E4405F' },
  { id: 'tiktok', label: 'TikTok', icon: 'musical-notes', color: '#000000' },
  { id: 'native', label: 'More', icon: 'share-social', color: '#002C5F' },
] as const;

function buildAppUrl(referralCode?: string) {
  return referralCode ? buildAppDeepLink('/', { ref: referralCode }) : buildAppDeepLink('/');
}

export function getInviteShareUrl(referralCode?: string) {
  return buildAppUrl(referralCode);
}

export function getPostShareUrl(postId: string) {
  return buildAppDeepLink('/post', { postId });
}

export function getVehicleShareUrl(vehicleId: string) {
  return buildAppDeepLink('/stock', { vehicle: vehicleId });
}

export function getMerchandiseShareUrl(itemId: string) {
  return buildPublicUrl('/login', { merchandiseItemId: itemId });
}

function ellipsize(text?: string, max = 120) {
  const value = String(text ?? '').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}

function getWebNavigator() {
  return typeof globalThis !== 'undefined' ? (globalThis as any)?.navigator : undefined;
}

function buildInviteLead(context: Extract<ShareContext, { type: 'invite' }>) {
  const inviterName = String(context.inviterName ?? '').trim();
  const referralUrl = getInviteShareUrl(context.referralCode);

  if (context.inviterType === 'staff') {
    const dealership = String(context.dealershipName ?? '').trim();
    const occupation = String(context.occupation ?? '').trim();
    const dealershipPart = dealership ? ` from ${dealership}` : '';
    const occupationPart = occupation ? ` (${occupation})` : '';
    return `${inviterName || 'A staff member'}${dealershipPart}${occupationPart} invited you to Hyundai/Kia Service Connect.`;
  }

  return `${inviterName || 'A customer'} invited you to join Hyundai/Kia Service Connect.`;
}

export async function openExternalUrl(url: string) {
  if (Platform.OS === 'web') {
    const opened = typeof globalThis !== 'undefined' ? (globalThis as any)?.open?.(url, '_blank', 'noopener,noreferrer') : null;
    if (opened !== null) return true;
  }
  await Linking.openURL(url);
  return true;
}

export async function sharePayload(payload: { message: string; url?: string; title?: string }) {
  if (Platform.OS === 'web') {
    const navigator = getWebNavigator();
    if (navigator?.share) {
      await navigator.share(payload);
      return;
    }

    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText([payload.title, payload.message, payload.url].filter(Boolean).join('\n\n'));
      Alert.alert('Copied', 'Share text copied to clipboard.');
      return;
    }

    Alert.alert('Share', payload.url ?? payload.message);
    return;
  }

  await Share.share(payload);
}

export function buildMessage(context: ShareContext, referralCode?: string): string {
  const openAppLine = referralCode
    ? `\n\nOpen in the app: ${buildAppUrl(referralCode)}`
    : `\n\nOpen in the app: ${buildAppUrl()}`;

  switch (context.type) {
    case 'booking':
      return `Just booked my ${context.serviceType} in seconds! Fast, easy, and reliable car service booking.${openAppLine}`;
    case 'experience': {
      const stars = context.rating ? ' ' + '⭐'.repeat(context.rating) : '';
      return `Just had my ${context.serviceType} done — great experience!${stars}\n\nBook your next service easily:${openAppLine}`;
    }
    case 'invite': {
      const lead = buildInviteLead(context);
      return `${lead}\n\nJoin now using this app link: ${getInviteShareUrl(referralCode)}${openAppLine}`;
    }
    case 'post': {
      const title = context.title ? `“${context.title}”` : 'a post';
      const author = context.authorName ? ` by ${context.authorName}` : '';
      const snippet = ellipsize(context.description, 110);
      return [`Check out ${title}${author} on Hyundai/Kia Service Connect.`, snippet, `Open the post in the app: ${getPostShareUrl(context.postId)}`].filter(Boolean).join('\n\n');
    }
  }
}

export function buildWhatsAppInviteUrl(message: string, phoneNumber?: string) {
  const cleanPhone = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildFacebookShareUrl(shareUrl: string, message: string) {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(message)}`;
}

export async function shareToWhatsApp(context: ShareContext, referralCode?: string, phoneNumber?: string) {
  const message = buildMessage(context, referralCode);
  const url = buildWhatsAppInviteUrl(message, phoneNumber);
  try {
    await openExternalUrl(url);
  } catch {
    await sharePayload({ message });
  }
}

export async function shareToFacebook(context: ShareContext, referralCode?: string) {
  const message = buildMessage(context, referralCode);
  const shareUrl = context.type === 'post' ? getPostShareUrl(context.postId) : getInviteShareUrl(referralCode);
  const url = buildFacebookShareUrl(shareUrl, message);
  try {
    await openExternalUrl(url);
  } catch {
    await sharePayload({ message, url: shareUrl, title: 'Hyundai/Kia Service Connect' });
  }
}

export async function shareToTikTok(context: ShareContext, referralCode?: string) {
  const message = buildMessage(context, referralCode);
  const shareUrl = context.type === 'post' ? getPostShareUrl(context.postId) : getInviteShareUrl(referralCode);
  await sharePayload({ message, url: shareUrl, title: 'Hyundai/Kia Service Connect' });
}

export async function shareNative(context: ShareContext, referralCode?: string) {
  const message = buildMessage(context, referralCode);
  const shareUrl = context.type === 'post' ? getPostShareUrl(context.postId) : getInviteShareUrl(referralCode);
  try {
    await sharePayload({
      message,
      url: shareUrl,
      title: 'Hyundai/Kia Service Connect',
    });
  } catch (e: any) {
    if (e?.message !== 'User did not share') {
      Alert.alert('Error', 'Could not share. Please try again.');
    }
  }
}

export async function shareOnPlatform(platformId: SocialPlatformId, context: ShareContext, referralCode?: string) {
  switch (platformId) {
    case 'whatsapp':
      return shareToWhatsApp(context, referralCode);
    case 'facebook':
      return shareToFacebook(context, referralCode);
    case 'instagram':
    case 'tiktok':
      return shareToTikTok(context, referralCode);
    default:
      return shareNative(context, referralCode);
  }
}

export function getShareMessage(context: ShareContext, referralCode?: string): string {
  return buildMessage(context, referralCode);
}

export function getPostShareMessage(post: { postId: string; title?: string; authorName?: string; description?: string }) {
  return buildMessage({ type: 'post', postId: post.postId, title: post.title, authorName: post.authorName, description: post.description });
}