export const PUBLIC_LANDING_URL = 'https://example.com';

export const buildPublicUrl = (path = '/') => `${PUBLIC_LANDING_URL}${path.startsWith('/') ? path : `/${path}`}`;

export const SOCIAL_PLATFORMS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366' },
  { id: 'facebook', label: 'Facebook', icon: 'logo-facebook', color: '#1877F2' },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E1306C' },
  { id: 'copy', label: 'Copy Link', icon: 'copy', color: '#00AAD2' },
] as const;

export function getInviteShareUrl(code: string) {
  return buildPublicUrl(`/?ref=${encodeURIComponent(code)}`);
}

export function getShareMessage() {
  return 'Check out the app.';
}

export async function shareOnPlatform() {
  return true;
}

export const sharePayload = {};
