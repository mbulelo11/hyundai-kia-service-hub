import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

async function safeDbGet(ctx: any, id: string | undefined | null) {
  if (!id) return null;
  try {
    return await ctx.db.get(id as any);
  } catch {
    return null;
  }
}

async function getStableUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  let userId = String(identity.subject);
  const subjectDoc: any = await safeDbGet(ctx, identity.subject);
  if (subjectDoc?.userId) {
    const user = await safeDbGet(ctx, subjectDoc.userId);
    if (user) userId = String(user._id);
  } else if (subjectDoc?.email || subjectDoc?.role) {
    userId = String(subjectDoc._id);
  } else if (identity.email) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", identity.email))
      .first();
    if (user) userId = String(user._id);
  }

  return userId;
}

// List all connected social accounts for current user
export const listMine = query({
  args: {},
  returns: v.array(v.object({
    _id: v.string(),
    platform: v.string(),
    displayName: v.optional(v.string()),
    profileUrl: v.optional(v.string()),
    isConnected: v.boolean(),
    connectedAt: v.number(),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = await getStableUserId(ctx);
    const accounts = await ctx.db
      .query("socialAccounts")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .collect();

    return accounts
      .filter((a: any) => a.isConnected)
      .map((a: any) => ({
        _id: a._id.toString(),
        platform: a.platform,
        displayName: a.displayName,
        profileUrl: a.profileUrl,
        isConnected: a.isConnected,
        connectedAt: a.connectedAt,
      }));
  },
});

// Connect a social account
export const connect = mutation({
  args: {
    platform: v.string(),
    displayName: v.optional(v.string()),
    profileUrl: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await getStableUserId(ctx);

    // Check if already connected
    const existing = await ctx.db
      .query("socialAccounts")
      .withIndex("by_userId_platform", (q: any) =>
        q.eq("userId", userId).eq("platform", args.platform)
      )
      .first();

    if (existing && existing.isConnected) {
      return existing._id.toString();
    }

    if (existing) {
      // Re-connect previously disconnected account
      await ctx.db.patch(existing._id, {
        isConnected: true,
        connectedAt: Date.now(),
        displayName: args.displayName ?? existing.displayName,
        profileUrl: args.profileUrl ?? existing.profileUrl,
        disconnectedAt: undefined,
      });
      return existing._id.toString();
    }

    const id = await ctx.db.insert("socialAccounts", {
      userId,
      platform: args.platform,
      displayName: args.displayName,
      profileUrl: args.profileUrl,
      isConnected: true,
      connectedAt: Date.now(),
    });

    return id.toString();
  },
});

// Disconnect a social account
export const disconnect = mutation({
  args: {
    platform: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getStableUserId(ctx);

    const existing = await ctx.db
      .query("socialAccounts")
      .withIndex("by_userId_platform", (q: any) =>
        q.eq("userId", userId).eq("platform", args.platform)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isConnected: false,
        disconnectedAt: Date.now(),
      });
    }

    return null;
  },
});

// Get connection status for all platforms
export const getConnectionStatus = query({
  args: {},
  returns: v.object({
    instagram: v.boolean(),
    facebook: v.boolean(),
    whatsapp: v.boolean(),
    tiktok: v.boolean(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return {
      instagram: false,
      facebook: false,
      whatsapp: false,
      tiktok: false,
    };

    const userId = await getStableUserId(ctx);
    const accounts = await ctx.db
      .query("socialAccounts")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .collect();

    const connected = new Set(
      accounts.filter((a: any) => a.isConnected).map((a: any) => a.platform)
    );

    return {
      instagram: connected.has("instagram"),
      facebook: connected.has("facebook"),
      whatsapp: connected.has("whatsapp"),
      tiktok: connected.has("tiktok"),
    };
  },
});