"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";

const A0_NOTIFICATIONS_API_URL = "https://api2.a0.dev/api/notifications/send";

export const sendNotification = internalAction({
  args: {
    to: v.union(v.string(), v.array(v.string())),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
    badge: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (_ctx, args) => {
    const serverKey = (globalThis as any)?.process?.env?.A0_SERVER_KEY;
    if (!serverKey) {
      throw new Error("Missing A0_SERVER_KEY in Convex environment variables.");
    }

    const response = await (globalThis as any).fetch(A0_NOTIFICATIONS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverKey}`,
      },
      body: JSON.stringify(args),
    });

    const responseBody = await response.text();
    if (!response.ok) {
      throw new Error(`a0 notifications API error (${response.status}): ${responseBody}`);
    }

    try {
      return JSON.parse(responseBody);
    } catch {
      return { data: responseBody };
    }
  },
});
