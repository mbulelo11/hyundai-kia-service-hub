"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";

const PUSH_API_URL = "https://api2.a0.dev/api/notifications/send";

async function sendPush(to: string | string[], title: string, body: string, data?: Record<string, string | number | boolean | null>) {
  const serverKey = (globalThis as any)?.process?.env?.A0_SERVER_KEY;
  if (!serverKey) {
    throw new Error("Missing A0_SERVER_KEY in Convex environment variables.");
  }

  const response = await (globalThis as any).fetch(PUSH_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverKey}`,
    },
    body: JSON.stringify({ to, title, body, data }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Push API error (${response.status}): ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { data: text };
  }
}

export const sendSecurePushToUser = internalAction({
  args: {
    userId: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId as any);
    const pushToken = String(user?.pushToken ?? "").trim();
    if (!pushToken) return null;

    return await sendPush(pushToken, args.title, args.body, args.data ?? undefined);
  },
});

export const sendSecurePushToUsers = internalAction({
  args: {
    userIds: v.array(v.string()),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const tokens: string[] = [];
    for (const userId of args.userIds) {
      const user = await ctx.db.get(userId as any);
      const pushToken = String(user?.pushToken ?? "").trim();
      if (pushToken) tokens.push(pushToken);
    }

    if (!tokens.length) return null;
    return await sendPush(tokens, args.title, args.body, args.data ?? undefined);
  },
});
