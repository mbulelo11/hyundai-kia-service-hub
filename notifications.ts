import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";
const NOTIFICATION_BATCH_SIZE = 500;
const NOTIFICATION_COUNT_CAP = 1000;

function canSeeAllWorkspace(user: any) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  return Boolean(user?.role === "admin" || email === VINCENT_ADMIN_EMAIL);
}

async function processArchivedReadNotificationsBatch(ctx: any, userId: string) {
  const readItems = await ctx.db
    .query("notifications")
    .withIndex("by_userId_read_isArchived", (q: any) =>
      q.eq("userId", userId).eq("isRead", true).eq("isArchived", false)
    )
    .take(NOTIFICATION_BATCH_SIZE);

  for (const notification of readItems) {
    await ctx.db.patch(notification._id, {
      isArchived: true,
      archivedAt: Date.now(),
    });
  }

  return readItems.length === NOTIFICATION_BATCH_SIZE;
}

async function processUnreadNotificationsBatch(ctx: any, userId: string) {
  const unread = await ctx.db
    .query("notifications")
    .withIndex("by_userId_read", (q: any) =>
      q.eq("userId", userId).eq("isRead", false)
    )
    .take(NOTIFICATION_BATCH_SIZE);

  for (const notification of unread) {
    await ctx.db.patch(notification._id, { isRead: true });
  }

  return unread.length === NOTIFICATION_BATCH_SIZE;
}

function matchesNotificationFilters(notification: any, args: { includeArchived?: boolean; onlyUnread?: boolean; search?: string; fromTime?: number; toTime?: number }) {
  if (!args.includeArchived && notification.isArchived) return false;
  if (args.onlyUnread && notification.isRead) return false;
  if (typeof args.fromTime === "number" && notification._creationTime < args.fromTime) return false;
  if (typeof args.toTime === "number" && notification._creationTime > args.toTime) return false;
  const search = String(args.search ?? "").trim().toLowerCase();
  if (!search) return true;
  const haystack = `${notification.type} ${notification.title} ${notification.message} ${notification.customerPhone ?? ""} ${notification.customerEmail ?? ""}`.toLowerCase();
  return haystack.includes(search);
}

async function safeDbGet(ctx: any, id: string | undefined | null) {
  if (!id) return null;
  try {
    return await ctx.db.get(id as any);
  } catch {
    return null;
  }
}

async function findUserByIdentity(ctx: any, identity: any) {
  if (identity?.subject) {
    const subjectDoc: any = await safeDbGet(ctx, identity.subject);
    if (subjectDoc?.userId) {
      const nested = await safeDbGet(ctx, subjectDoc.userId);
      if (nested) return nested;
    }
    if (subjectDoc?.email || subjectDoc?.role) return subjectDoc;
  }

  if (identity?.email) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", identity.email))
      .first();
    if (user) return user;
  }

  if (identity?.tokenIdentifier) {
    const possibleId = String(identity.tokenIdentifier).split("|").pop();
    if (possibleId) {
      const tokenDoc: any = await safeDbGet(ctx, possibleId);
      if (tokenDoc?.userId) {
        const nested = await safeDbGet(ctx, tokenDoc.userId);
        if (nested) return nested;
      }
      if (tokenDoc?.email || tokenDoc?.role) return tokenDoc;
    }
  }

  return null;
}

async function getUserId(ctx: any): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await findUserByIdentity(ctx, identity);
  return user ? String(user._id) : null;
}

async function getVincentUserId(ctx: any): Promise<string | null> {
  const vincent = await ctx.db
    .query("users")
    .withIndex("email", (q: any) => q.eq("email", VINCENT_ADMIN_EMAIL))
    .first();
  return vincent ? String(vincent._id) : null;
}

async function getOperationalNotificationRecipients(ctx: any) {
  const vincentUserId = await getVincentUserId(ctx);
  return vincentUserId ? [vincentUserId] : [];
}

async function notifyVincent(ctx: any, payload: { type: string; title: string; message: string; bookingId?: any }) {
  const vincentUserId = await getVincentUserId(ctx);
  if (!vincentUserId) return;
  await ctx.db.insert("notifications", {
    userId: vincentUserId,
    type: "activity_alert",
    title: payload.title,
    message: payload.message.slice(0, 180),
    bookingId: payload.bookingId,
    isRead: false,
  });
}

export const notifyActivity = internalMutation({
  args: {
    type: v.union(
      v.literal('stock_visit'),
      v.literal('new_user'),
      v.literal('post_created'),
      v.literal('post_updated'),
      v.literal('post_reacted'),
      v.literal('post_commented'),
      v.literal('post_shared_to_main_feed'),
      v.literal('event_created'),
      v.literal('competition_created'),
      v.literal('group_feed_created'),
      v.literal('group_created'),
      v.literal('group_join_requested'),
      v.literal('group_join_reviewed'),
      v.literal('group_reported'),
      v.literal('group_closed'),
      v.literal('technician_progress'),
      v.literal('technician_assigned')
    ),
    title: v.string(),
    message: v.string(),
    bookingId: v.optional(v.id('bookings')),
    customerUserId: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    postId: v.optional(v.string()),
    targetRoute: v.optional(v.string()),
    targetId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const recipients = await getOperationalNotificationRecipients(ctx);
    for (const userId of recipients) {
      await ctx.db.insert('notifications', {
        userId,
        type: args.type,
        title: args.title,
        message: args.message.slice(0, 180),
        bookingId: args.bookingId,
        customerUserId: args.customerUserId,
        customerPhone: args.customerPhone,
        customerEmail: args.customerEmail,
        postId: args.postId,
        targetRoute: args.targetRoute,
        targetId: args.targetId,
        isRead: false,
      });
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationDelivery, {
        userId,
        type: args.type,
        title: args.title,
        message: args.message,
      });
    }
    return null;
  },
});

const notificationReturnValidator = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  userId: v.string(),
  type: v.string(),
  title: v.string(),
  message: v.string(),
  senderId: v.optional(v.string()),
  bookingId: v.optional(v.id("bookings")),
  financeApplicationId: v.optional(v.id("financeApplications")),
  testDriveId: v.optional(v.id("testDrives")),
  customerUserId: v.optional(v.string()),
  customerName: v.optional(v.string()),
  customerPhone: v.optional(v.string()),
  customerEmail: v.optional(v.string()),
  vehicleInventoryItemId: v.optional(v.id("inventory")),
  vehicleDescription: v.optional(v.string()),
  vehicleImageUrl: v.optional(v.string()),
  vehicleYear: v.optional(v.number()),
  vehicleMake: v.optional(v.string()),
  vehicleModel: v.optional(v.string()),
  vehicleVariant: v.optional(v.string()),
  vehiclePrice: v.optional(v.number()),
  vehicleColor: v.optional(v.string()),
  postId: v.optional(v.string()),
  targetRoute: v.optional(v.string()),
  targetId: v.optional(v.string()),
  isRead: v.boolean(),
  isArchived: v.optional(v.boolean()),
  archivedAt: v.optional(v.number()),
});

function mapNotification(n: any) {
  return {
    _id: n._id,
    _creationTime: n._creationTime,
    userId: n.userId,
    type: n.type,
    title: n.title,
    message: n.message,
    senderId: n.senderId,
    bookingId: n.bookingId,
    financeApplicationId: n.financeApplicationId,
    testDriveId: n.testDriveId,
    customerUserId: n.customerUserId,
    customerName: n.customerName,
    customerPhone: n.customerPhone,
    customerEmail: n.customerEmail,
    vehicleInventoryItemId: n.vehicleInventoryItemId,
    vehicleDescription: n.vehicleDescription,
    vehicleImageUrl: n.vehicleImageUrl,
    vehicleYear: n.vehicleYear,
    vehicleMake: n.vehicleMake,
    vehicleModel: n.vehicleModel,
    vehicleVariant: n.vehicleVariant,
    vehiclePrice: n.vehiclePrice,
    vehicleColor: n.vehicleColor,
    postId: n.postId,
    targetRoute: n.targetRoute,
    targetId: n.targetId,
    isRead: n.isRead,
    isArchived: n.isArchived,
    archivedAt: n.archivedAt,
  };
}

export const createInternal = internalMutation({
  args: {
    userId: v.string(),
    type: v.string(),
    title: v.string(),
    message: v.string(),
    bookingId: v.optional(v.id("bookings")),
  },
  returns: v.id("notifications"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      bookingId: args.bookingId,
      isRead: false,
    });
    await ctx.scheduler.runAfter(0, internal.emails.sendNotificationDelivery, {
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
    });
    return id;
  },
});

export const createActivityAlert = internalMutation({
  args: {
    type: v.string(),
    title: v.string(),
    message: v.string(),
    bookingId: v.optional(v.id("bookings")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const recipients = await getOperationalNotificationRecipients(ctx);
    for (const userId of recipients) {
      await ctx.db.insert("notifications", {
        userId,
        type: args.type,
        title: args.title,
        message: args.message.slice(0, 180),
        bookingId: args.bookingId,
        isRead: false,
      });
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationDelivery, {
        userId,
        type: args.type,
        title: args.title,
        message: args.message,
      });
    }
    return null;
  },
});

export const listMine = query({
  args: {
    includeArchived: v.optional(v.boolean()),
    onlyUnread: v.optional(v.boolean()),
    search: v.optional(v.string()),
    fromTime: v.optional(v.number()),
    toTime: v.optional(v.number()),
  },
  returns: v.array(notificationReturnValidator),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(250);

    return notifications.filter((n: any) => matchesNotificationFilters(n, args)).map(mapNotification);
  },
});

export const listMineHistory = query({
  args: {
    includeArchived: v.optional(v.boolean()),
    onlyUnread: v.optional(v.boolean()),
    search: v.optional(v.string()),
    fromTime: v.optional(v.number()),
    toTime: v.optional(v.number()),
  },
  returns: v.array(notificationReturnValidator),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(500);

    return notifications.filter((n: any) => matchesNotificationFilters(n, args)).map(mapNotification);
  },
});

export const listMinePaged = query({
  args: {
    includeArchived: v.optional(v.boolean()),
    onlyUnread: v.optional(v.boolean()),
    search: v.optional(v.string()),
    fromTime: v.optional(v.number()),
    toTime: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(notificationReturnValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const paged = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = paged.page
      .filter((n: any) => matchesNotificationFilters(n, args))
      .map(mapNotification);

    return {
      page,
      isDone: paged.isDone,
      continueCursor: paged.continueCursor,
    };
  },
});

export const archiveNotification = mutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.notificationId, {
      isArchived: true,
      archivedAt: Date.now(),
    });
    return null;
  },
});

export const unarchiveNotification = mutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.notificationId, {
      isArchived: false,
      archivedAt: undefined,
    });
    return null;
  },
});

export const archiveAllRead = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await ctx.runMutation(internal.notifications.archiveAllReadBatch, { userId });
    return null;
  },
});

export const getUnreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return 0;

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_read_isArchived", (q: any) =>
        q.eq("userId", userId).eq("isRead", false).eq("isArchived", false)
      )
      .take(NOTIFICATION_COUNT_CAP);

    return unread.length;
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.notificationId, { isRead: true });
    return null;
  },
});

export const markAllRead = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await ctx.runMutation(internal.notifications.markAllReadBatch, { userId });
    return null;
  },
});

export const archiveAllReadBatch = internalMutation({
  args: {
    userId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hasMore = await processArchivedReadNotificationsBatch(ctx, args.userId);
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.notifications.archiveAllReadBatch, {
        userId: args.userId,
      });
    }
    return null;
  },
});

export const markAllReadBatch = internalMutation({
  args: {
    userId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hasMore = await processUnreadNotificationsBatch(ctx, args.userId);
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.notifications.markAllReadBatch, {
        userId: args.userId,
      });
    }
    return null;
  },
});