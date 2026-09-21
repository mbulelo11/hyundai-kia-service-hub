"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { createHmac, randomBytes } from "crypto";

const BufferImpl = (globalThis as any).Buffer;

function resolveLiveKitConfig() {
  const env = (globalThis as any).process?.env ?? {};
  const url = String(env.LIVEKIT_URL ?? env.EXPO_PUBLIC_LIVEKIT_URL ?? "").trim();
  const apiKey = String(env.LIVEKIT_API_KEY ?? "").trim();
  const apiSecret = String(env.LIVEKIT_API_SECRET ?? "").trim();

  if (!url || !apiKey || !apiSecret) {
    throw new Error("LiveKit is not configured");
  }

  return { url, apiKey, apiSecret };
}

function base64Url(input: any) {
  const buffer = typeof input === 'string' ? BufferImpl.from(input, 'utf8') : input;
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createLiveKitJwt(apiKey: string, apiSecret: string, roomName: string, participantName: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: apiKey,
    sub: participantName,
    nbf: now - 10,
    exp: now + 6 * 60 * 60,
    jti: randomBytes(16).toString('hex'),
    name: participantName,
    video: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    },
  };

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', apiSecret).update(message).digest();
  return `${message}.${base64Url(signature)}`;
}

export const getCallToken = action({
  args: {
    roomName: v.string(),
    participantName: v.string(),
  },
  returns: v.object({
    url: v.string(),
    token: v.string(),
    roomName: v.string(),
    participantName: v.string(),
  }),
  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(api.users.me, {});
    if (!currentUser) {
      throw new Error("Not authenticated");
    }

    const config = resolveLiveKitConfig();
    return {
      url: config.url,
      token: createLiveKitJwt(config.apiKey, config.apiSecret, args.roomName, args.participantName),
      roomName: args.roomName,
      participantName: args.participantName,
    };
  },
});