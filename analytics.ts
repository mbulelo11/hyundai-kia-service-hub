const DEFAULT_MEASUREMENT_ID = 'G-7WW7GJY3PJ';
const runtimeConfig = globalThis as any;
const GA_MEASUREMENT_ID = String(runtimeConfig?.__GA_MEASUREMENT_ID__ ?? DEFAULT_MEASUREMENT_ID).trim();
const GA_API_SECRET = String(runtimeConfig?.__GA_API_SECRET__ ?? '').trim();
let clientId: string | null = null;

function getGtag(): ((...args: any[]) => void) | null {
  return typeof runtimeConfig?.gtag === 'function' ? runtimeConfig.gtag : null;
}

function getClientId() {
  if (clientId) return clientId;
  clientId = `a0.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  return clientId;
}

async function sendMeasurementProtocolEvent(name: string, params: Record<string, any>) {
  if (!GA_MEASUREMENT_ID || !GA_API_SECRET) return;

  try {
    await globalThis.fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(GA_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(GA_API_SECRET)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: getClientId(),
        events: [
          {
            name,
            params: {
              ...params,
              engagement_time_msec: 1,
            },
          },
        ],
      }),
    });
  } catch {
    // ignore analytics delivery failures
  }
}

export async function trackAnalyticsEvent(name: string, params: Record<string, any> = {}) {
  const gtag = getGtag();
  if (gtag) {
    gtag('event', name, params);
    return;
  }

  await sendMeasurementProtocolEvent(name, params);
}

export async function trackScreenView(screenName: string, params: Record<string, any> = {}) {
  await trackAnalyticsEvent('screen_view', {
    screen_name: screenName,
    page_title: screenName,
    page_location: String(runtimeConfig?.location?.href ?? ''),
    measurement_id: GA_MEASUREMENT_ID,
    ...params,
  });
}