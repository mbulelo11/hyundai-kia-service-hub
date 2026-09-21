import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { isAdminUser, getUserDepartment, canAccessDepartment, getViewer } from "./auth";

const OWNER_PHONE = "27615276436";
const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";

function isActivityModeratorUser(user: any) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  return Boolean(user?.isOwner || isAdminUser(user) || email === VINCENT_ADMIN_EMAIL);
}

async function safeDbGet(ctx: any, id: string | undefined | null) {
  if (!id) return null;
  try {
    return await ctx.db.get(id as any);
  } catch {
    return null;
  }
}

async function getVincentUserId(ctx: any) {
  const vincent = await ctx.db
    .query("users")
    .withIndex("email", (q: any) => q.eq("email", VINCENT_ADMIN_EMAIL))
    .first();
  return vincent ? String(vincent._id) : null;
}

async function getOperationalRecipientIds(ctx: any) {
  const vincentUserId = await getVincentUserId(ctx);
  return vincentUserId ? [vincentUserId] : [];
}

async function notifyVincent(ctx: any, activity: { type: string; title: string; description: string; customerName?: string; customerPhone?: string; metadata?: string; triggeredBy?: string; ownerUserId?: string; }) {
  const vincentUserId = await getVincentUserId(ctx);
  if (!vincentUserId) return;
  if (activity.triggeredBy && activity.triggeredBy === vincentUserId) return;

  await ctx.db.insert("notifications", {
    userId: vincentUserId,
    type: "activity_alert",
    title: activity.title,
    message: activity.description.slice(0, 180),
    isRead: false,
  });
  await ctx.scheduler.runAfter(0, internal.emails.sendNotificationDelivery, {
    userId: vincentUserId,
    type: activity.type,
    title: activity.title,
    message: activity.description,
  });
}

async function notifyOperationalTeam(ctx: any, activity: { type: string; title: string; description: string; customerName?: string; customerPhone?: string; customerEmail?: string; metadata?: string; triggeredBy?: string; ownerUserId?: string; }) {
  const recipients = await getOperationalRecipientIds(ctx);
  for (const userId of recipients) {
    if (activity.triggeredBy && userId === activity.triggeredBy) continue;
    await ctx.db.insert("notifications", {
      userId,
      type: "activity_alert",
      title: activity.title,
      message: activity.description.slice(0, 180),
      isRead: false,
    });
    await ctx.scheduler.runAfter(0, internal.emails.sendNotificationDelivery, {
      userId,
      type: activity.type,
      title: activity.title,
      message: activity.description,
    });
  }
}

async function getCurrentUser(ctx: any) {
  const viewer = await getViewer(ctx);
  if (!viewer) return null;

  const email = String(viewer.identity?.email ?? viewer.user?.email ?? "").trim().toLowerCase();
  const isModerator = Boolean(
    viewer.isElevated ||
    isActivityModeratorUser(viewer.user)
  );

  return {
    identity: viewer.identity,
    userId: String(viewer.userId),
    user: viewer.user,
    isModerator,
    isAdmin: isModerator,
    department: getUserDepartment(viewer.user),
  };
}

const activityReturn = v.object({
  _id: v.string(),
  _creationTime: v.number(),
  type: v.string(),
  title: v.string(),
  description: v.string(),
  customerName: v.optional(v.string()),
  customerPhone: v.optional(v.string()),
  customerEmail: v.optional(v.string()),
  customerUserId: v.optional(v.string()),
  actorName: v.optional(v.string()),
  metadata: v.optional(v.string()),
  isNotified: v.boolean(),
  triggeredBy: v.optional(v.string()),
});

export const trackStockEngagement = mutation({
  args: {
    event: v.union(v.literal("view"), v.literal("share"), v.literal("visit")),
    itemId: v.optional(v.string()),
    itemName: v.optional(v.string()),
    platform: v.optional(v.string()),
    source: v.optional(v.string()),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const activity = {
      type: `stock_${args.event}`,
      title: `Stock ${args.event}`,
      description: args.itemName ? `${args.itemName}${args.platform ? ` via ${args.platform}` : ""}` : `Stock ${args.event}`,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      customerEmail: args.customerEmail,
      actorName: args.customerName ?? args.customerEmail ?? "Visitor",
      metadata: JSON.stringify({ itemId: args.itemId, itemName: args.itemName, platform: args.platform, source: args.source }),
      isNotified: false,
      triggeredBy: identity?.subject ? String(identity.subject) : undefined,
    };
    await ctx.db.insert("activityLog", {
      ownerUserId: activity.triggeredBy,
      type: activity.type,
      title: activity.title,
      description: activity.description,
      customerName: activity.customerName,
      customerPhone: activity.customerPhone,
      customerEmail: activity.customerEmail,
      actorName: activity.actorName,
      metadata: activity.metadata,
      isNotified: true,
      triggeredBy: activity.triggeredBy,
    });
    await notifyVincent(ctx, activity);
    await notifyOperationalTeam(ctx, activity);
    await ctx.runMutation(internal.notifications.notifyActivity, {
      type: 'stock_visit',
      title: 'Stock visit',
      message: `${args.customerName ?? 'A customer'}${args.customerPhone ? ` · ${args.customerPhone}` : ''} viewed ${args.itemName ?? 'stock'}`.slice(0, 180),
      customerUserId: activity.triggeredBy,
      customerPhone: args.customerPhone,
      customerEmail: args.customerEmail,
      targetRoute: 'CustomerProfile',
      targetId: activity.triggeredBy,
    });
    const recipientId = await getVincentUserId(ctx);
    if (recipientId) {
      await ctx.db.insert("notifications", {
        userId: recipientId,
        type: 'stock_visit',
        title: 'Stock visit',
        message: `${args.customerName ?? 'A customer'}${args.customerPhone ? ` · ${args.customerPhone}` : ''} viewed ${args.itemName ?? 'stock'}`.slice(0, 180),
        customerUserId: activity.triggeredBy,
        customerPhone: args.customerPhone,
        customerEmail: args.customerEmail,
        targetRoute: 'CustomerProfile',
        targetId: activity.triggeredBy,
        isRead: false,
      });
    }
    return null;
  },
});

export const getRecentStockVisitors = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(activityReturn),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !current.isModerator) return [];
    const visits = await ctx.db.query("activityLog").withIndex("by_type", (q: any) => q.eq("type", "stock_visit")).order("desc").take(Math.min(args.limit ?? 20, 20));
    return visits.map((a: any) => ({
      _id: a._id.toString(),
      _creationTime: a._creationTime,
      type: a.type,
      title: a.title,
      description: a.description,
      customerName: a.customerName,
      customerPhone: a.customerPhone,
      customerEmail: a.customerEmail,
      metadata: a.metadata,
      isNotified: a.isNotified,
      triggeredBy: a.triggeredBy,
    }));
  },
});

export const log = mutation({
  args: {
    ownerUserId: v.optional(v.string()),
    type: v.string(),
    title: v.string(),
    description: v.string(),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    metadata: v.optional(v.string()),
    triggeredBy: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("activityLog", {
      ownerUserId: args.ownerUserId,
      type: args.type,
      title: args.title,
      description: args.description,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      actorName: (args as any).actorName,
      metadata: args.metadata,
      isNotified: false,
      triggeredBy: args.triggeredBy,
    });
    await notifyVincent(ctx, args);
    await notifyOperationalTeam(ctx, args);
    if (args.type === 'customer_added' || args.type === 'new_user') {
      await ctx.db.insert('notifications', {
        userId: String(args.ownerUserId ?? args.triggeredBy ?? 'system'),
        type: 'new_user',
        title: 'New user activity',
        message: `${args.customerName ?? 'A user'} joined the app.`,
        isRead: false,
      });
    }
    return id.toString();
  },
});

export const logInternal = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    type: v.string(),
    title: v.string(),
    description: v.string(),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    metadata: v.optional(v.string()),
    triggeredBy: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("activityLog", {
      ownerUserId: args.ownerUserId,
      type: args.type,
      title: args.title,
      description: args.description,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      customerEmail: args.customerEmail,
      actorName: (args as any).actorName,
      metadata: args.metadata,
      isNotified: false,
      triggeredBy: args.triggeredBy,
    });
    await notifyVincent(ctx, args);
    await notifyOperationalTeam(ctx, args);
    if (args.type === 'customer_added' || args.type === 'new_user') {
      await ctx.db.insert('notifications', {
        userId: String(args.ownerUserId ?? args.triggeredBy ?? 'system'),
        type: 'new_user',
        title: 'New user activity',
        message: `${args.customerName ?? 'A user'} joined the app.`,
        isRead: false,
      });
    }
    return null;
  },
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(activityReturn),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const limit = Math.min(args.limit ?? 100, 100);
    const mergeUnique = (items: any[]) => {
      const seen = new Set<string>();
      return items.filter((a: any) => {
        const key = String(a._id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const mapActivity = (a: any) => ({
      _id: a._id.toString(),
      _creationTime: a._creationTime,
      type: a.type,
      title: a.title,
      description: a.description,
      customerName: a.customerName,
      customerPhone: a.customerPhone,
      customerEmail: a.customerEmail,
      customerUserId: a.customerUserId,
      actorName: a.actorName,
      metadata: a.metadata,
      isNotified: a.isNotified,
      triggeredBy: a.triggeredBy,
    });

    if (current.isModerator) {
      const activities = await ctx.db.query("activityLog").order("desc").take(limit);
      return activities.map(mapActivity);
    }

    const ownByUserId = await ctx.db
      .query("activityLog")
      .withIndex("by_ownerUserId", (q: any) => q.eq("ownerUserId", current.userId))
      .order("desc")
      .take(limit);

    const ownByOwnerId = await ctx.db
      .query("activityLog")
      .withIndex("by_ownerId", (q: any) => q.eq("ownerId", current.userId))
      .order("desc")
      .take(limit);

    return mergeUnique([...ownByUserId, ...ownByOwnerId]).map(mapActivity);
  },
});

export const getUnnotified = query({
  args: {},
  returns: v.object({
    count: v.number(),
    activities: v.array(activityReturn),
    ownerPhone: v.string(),
  }),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current || !current.isModerator) return { count: 0, activities: [], ownerPhone: OWNER_PHONE };
    const unnotified = await ctx.db
      .query("activityLog")
      .withIndex("by_isNotified", (q: any) => q.eq("isNotified", false))
      .order("desc")
      .take(50);
    return {
      count: unnotified.length,
      activities: unnotified.map((a: any) => ({
        _id: a._id.toString(),
        _creationTime: a._creationTime,
        type: a.type,
        title: a.title,
        description: a.description,
        customerName: a.customerName,
        customerPhone: a.customerPhone,
        customerEmail: a.customerEmail,
        customerUserId: a.customerUserId,
        actorName: a.actorName,
        metadata: a.metadata,
        isNotified: a.isNotified,
        triggeredBy: a.triggeredBy,
      })),
      ownerPhone: OWNER_PHONE,
    };
  },
});

export const markNotified = mutation({
  args: {
    activityIds: v.array(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    let count = 0;
    for (const id of args.activityIds) {
      try {
        await ctx.db.patch(id as any, { isNotified: true });
        count++;
      } catch {}
    }
    return count;
  },
});

export const getRecentForKira = query({
  args: {},
  returns: v.array(v.object({
    type: v.string(),
    title: v.string(),
    description: v.string(),
    timestamp: v.number(),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    const recent = current.isModerator
      ? await ctx.db.query("activityLog").order("desc").take(10)
      : await ctx.db
          .query("activityLog")
          .withIndex("by_triggeredBy", (q: any) => q.eq("triggeredBy", current.userId))
          .order("desc")
          .take(10);
    return recent.map((a: any) => ({
      type: a.type,
      title: a.title,
      description: a.description,
      timestamp: a._creationTime,
    }));
  },
});

export const getOwnerPhone = query({
  args: {},
  returns: v.string(),
  handler: async () => {
    return OWNER_PHONE;
  },
});

export const getComprehensiveTimeline = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({
    _id: v.string(),
    type: v.string(),
    title: v.string(),
    description: v.string(),
    timestamp: v.number(),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerUserId: v.optional(v.string()),
    status: v.optional(v.string()),
    metadata: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !current.isModerator) return [];

    const limit = Math.min(args.limit ?? 500, 500);
    const timeline: any[] = [];

    const activities = await ctx.db.query("activityLog").order("desc").take(limit);
    activities.forEach((a: any) => {
      timeline.push({
        _id: String(a._id),
        type: a.type,
        title: a.title,
        description: a.description,
        timestamp: a._creationTime,
        customerName: a.customerName,
        customerPhone: a.customerPhone,
        customerEmail: a.customerEmail,
        customerUserId: a.customerUserId,
        metadata: a.metadata,
      });
    });

    const messages = await ctx.db.query("messages").order("desc").take(limit);
    messages.forEach((m: any) => {
      timeline.push({
        _id: String(m._id),
        type: m.bookingId ? "message_received" : "message",
        title: m.bookingId ? `Booking message from ${m.senderName}` : `Message from ${m.senderName}`,
        description: m.content.substring(0, 150),
        timestamp: m._creationTime,
        customerName: m.senderName,
        customerPhone: undefined,
        customerEmail: undefined,
        customerUserId: m.senderId,
        metadata: JSON.stringify({ messageId: String(m._id), bookingId: m.bookingId ? String(m.bookingId) : undefined, senderId: m.senderId, recipientId: m.recipientId }),
      });
    });

    const bookings = await ctx.db.query("bookings").order("desc").take(limit);
    bookings.forEach((b: any) => {
      timeline.push({
        _id: String(b._id),
        type: `booking_${String(b.status ?? 'created')}`,
        title: `Booking: ${b.serviceType}`,
        description: `${b.status} - ${b.customerName || "Unknown"} - ${b.date}`,
        timestamp: b._creationTime,
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        customerEmail: b.customerEmail,
        customerUserId: b.userId,
        status: b.status,
        metadata: JSON.stringify({ bookingId: String(b._id), serviceType: b.serviceType, status: b.status }),
      });
    });

    const testDrives = await ctx.db.query("testDrives").order("desc").take(limit);
    testDrives.forEach((td: any) => {
      timeline.push({
        _id: String(td._id),
        type: `test_drive_${String(td.status ?? 'requested')}`,
        title: `Test Drive: ${td.vehicleDescription}`,
        description: `${td.status} - ${td.userName} - ${td.preferredDate}`,
        timestamp: td._creationTime,
        customerName: td.userName,
        customerPhone: td.userPhone,
        customerEmail: td.userEmail,
        customerUserId: td.userId,
        status: td.status,
        metadata: JSON.stringify({ testDriveId: String(td._id), status: td.status, vehicleDescription: td.vehicleDescription }),
      });
    });

    const financeApps = await ctx.db.query("financeApplications").order("desc").take(limit);
    financeApps.forEach((f: any) => {
      timeline.push({
        _id: String(f._id),
        type: `finance_${String(f.status ?? 'submitted')}`,
        title: `Finance Application: ${f.vehicleDescription}`,
        description: `${f.status} - ${f.firstName} ${f.surname}`,
        timestamp: f._creationTime,
        customerName: `${f.firstName} ${f.surname}`,
        customerPhone: f.phone,
        customerEmail: f.email,
        customerUserId: f.userId,
        status: f.status,
        metadata: JSON.stringify({ financeApplicationId: String(f._id), status: f.status, vehicleDescription: f.vehicleDescription }),
      });
    });

    const partsOrders = await ctx.db.query("partsOrders").order("desc").take(limit);
    partsOrders.forEach((order: any) => {
      timeline.push({
        _id: String(order._id),
        type: `parts_order_${String(order.status ?? 'submitted')}`,
        title: `Parts order: ${order.customerName}`,
        description: `${order.status} - ${order.itemDescription}`,
        timestamp: order._creationTime,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerUserId: order.userId,
        status: order.status,
        metadata: JSON.stringify({ partsOrderId: String(order._id), orderType: order.orderType, fulfillmentType: order.fulfillfulmentType, status: order.status, driverScheduleId: order.driverScheduleId ? String(order.driverScheduleId) : undefined }),
      });
    });

    const driverSchedules = await ctx.db.query("driverSchedules").order("desc").take(limit);
    for (const schedule of driverSchedules as any[]) {
      let relatedCustomer: any = null;
      if (schedule.bookingId) {
        relatedCustomer = await ctx.db.get(schedule.bookingId);
      }
      if (!relatedCustomer && schedule.partsOrderId) {
        relatedCustomer = await ctx.db.get(schedule.partsOrderId);
      }
      timeline.push({
        _id: String(schedule._id),
        type: `driver_schedule_${String(schedule.status ?? 'received')}`,
        title: `Driver schedule: ${schedule.customerName}`,
        description: `${schedule.status} - ${schedule.scheduleDate}${schedule.scheduleTime ? ` ${schedule.scheduleTime}` : ''}`,
        timestamp: schedule._creationTime,
        customerName: schedule.customerName,
        customerPhone: relatedCustomer?.customerPhone ?? relatedCustomer?.contactDetails,
        customerEmail: relatedCustomer?.customerEmail,
        customerUserId: relatedCustomer?.userId ?? relatedCustomer?.ownerUserId,
        status: schedule.status,
        metadata: JSON.stringify({ scheduleId: String(schedule._id), bookingId: schedule.bookingId ? String(schedule.bookingId) : undefined, partsOrderId: schedule.partsOrderId ? String(schedule.partsOrderId) : undefined, sourceType: schedule.sourceType, completedAt: schedule.completedAt }),
      });
    }

    const reviews = await ctx.db.query("reviews").order("desc").take(limit);
    reviews.forEach((review: any) => {
      timeline.push({
        _id: String(review._id),
        type: "review_submitted",
        title: `Review: ${review.serviceType}`,
        description: `${review.rating}-star review - ${String(review.comment ?? '').substring(0, 120)}`,
        timestamp: review._creationTime,
        customerName: review.userName,
        customerEmail: review.userEmail,
        customerUserId: review.userId,
        status: review.isPublic ? 'public' : 'private',
        metadata: JSON.stringify({ reviewId: String(review._id), bookingId: review.bookingId ? String(review.bookingId) : undefined, testDriveId: review.testDriveId ? String(review.testDriveId) : undefined, serviceType: review.serviceType, rating: review.rating, sharedToGoogle: review.sharedToGoogle, staffResponse: review.staffResponse }),
      });
    });

    return timeline
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit)
      .map((item: any) => ({
        _id: item._id,
        type: item.type,
        title: item.title,
        description: item.description,
        timestamp: item.timestamp,
        customerName: item.customerName,
        customerPhone: item.customerPhone,
        customerEmail: item.customerEmail,
        customerUserId: item.customerUserId,
        status: item.status,
        metadata: item.metadata,
      }));
  },
});

export const getStaffTimeline = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({
    _id: v.string(),
    type: v.string(),
    title: v.string(),
    description: v.string(),
    timestamp: v.number(),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    status: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const limit = Math.min(args.limit ?? 200, 200);
    const timeline: any[] = [];

    const messages = await ctx.db.query("messages").order("desc").take(limit);
    messages.forEach((m: any) => {
      const isInvolved = m.senderId === current.userId || m.recipientId === current.userId;
      if (isInvolved) {
        timeline.push({
          _id: String(m._id),
          type: "message",
          title: `Message from ${m.senderName}`,
          description: m.content.substring(0, 150),
          timestamp: m._creationTime,
          customerName: m.senderName,
        });
      }
    });

    const bookings = await ctx.db.query("bookings").order("desc").take(limit);
    bookings.forEach((b: any) => {
      const isInvolved = b.assignedToUserId === current.userId || b.userId === current.userId;
      if (isInvolved) {
        timeline.push({
          _id: String(b._id),
          type: "booking",
          title: `Booking: ${b.serviceType}`,
          description: `${b.status} - ${b.customerName || "Unknown"} - ${b.date}`,
          timestamp: b._creationTime,
          customerName: b.customerName,
          customerPhone: b.customerPhone,
          customerEmail: b.customerEmail,
          status: b.status,
        });
      }
    });

    const financeApps = await ctx.db.query("financeApplications").order("desc").take(limit);
    financeApps.forEach((f: any) => {
      const isInvolved = f.assignedToUserId === current.userId || f.userId === current.userId;
      if (isInvolved) {
        timeline.push({
          _id: String(f._id),
          type: "enquiry",
          title: `Finance Application: ${f.vehicleDescription}`,
          description: `${f.status} - ${f.firstName} ${f.surname}`,
          timestamp: f._creationTime,
          customerName: `${f.firstName} ${f.surname}`,
          customerPhone: f.phone,
          customerEmail: f.email,
          status: f.status,
        });
      }
    });

    return timeline
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit)
      .map((item: any) => ({
        _id: item._id,
        type: item.type,
        title: item.title,
        description: item.description,
        timestamp: item.timestamp,
        customerName: item.customerName,
        customerPhone: item.customerPhone,
        customerEmail: item.customerEmail,
        status: item.status,
      }));
  },
});

export const getCustomerTimeline = query({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(v.object({
    _id: v.string(),
    type: v.string(),
    title: v.string(),
    description: v.string(),
    timestamp: v.number(),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    status: v.optional(v.string()),
    metadata: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !args.userId) return [];

    const targetUserId = String(args.userId);
    const currentRole = String(current.user?.role ?? "").trim().toLowerCase();
    const currentStaffRole = String(current.user?.staffRole ?? "").trim().toLowerCase();
    const canViewTimeline = Boolean(
      current.isModerator ||
      current.userId === targetUserId ||
      currentRole === "staff" ||
      currentStaffRole ||
      current.user?.accessLevel ||
      current.user?.department
    );
    if (!canViewTimeline) return [];

    const limit = Math.min(args.limit ?? 300, 300);
    const timeline: any[] = [];
    const matchesUser = (value?: string | null) => String(value ?? "") === targetUserId;

    const bookings = await ctx.db.query("bookings").order("desc").take(limit);
    bookings.forEach((b: any) => {
      if (!matchesUser(b.userId) && !matchesUser(b.ownerUserId) && !matchesUser(b.assignedToUserId) && !matchesUser(b.assignedTo) && !matchesUser(b.receivedByUserId)) return;
      timeline.push({
        _id: String(b._id),
        type: `booking_${String(b.status ?? 'created')}`,
        title: `Booking: ${b.serviceType}`,
        description: `${b.status} - ${b.date} ${b.timeSlot ?? ''}`.trim(),
        timestamp: b._creationTime,
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        customerEmail: b.customerEmail,
        status: b.status,
        metadata: JSON.stringify({ bookingId: String(b._id), serviceType: b.serviceType, status: b.status }),
      });
    });

    const partsOrders = await ctx.db.query("partsOrders").order("desc").take(limit);
    partsOrders.forEach((order: any) => {
      if (!matchesUser(order.userId) && !matchesUser(order.ownerUserId) && !matchesUser(order.assignedToUserId) && !matchesUser(order.receivedByUserId) && !matchesUser(order.paymentConfirmedByUserId)) return;
      timeline.push({
        _id: String(order._id),
        type: `parts_order_${String(order.status ?? 'submitted')}`,
        title: `Parts order: ${order.itemDescription}`,
        description: `${order.status} - ${order.orderType}`,
        timestamp: order._creationTime,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        status: order.status,
        metadata: JSON.stringify({ partsOrderId: String(order._id), status: order.status, orderType: order.orderType }),
      });
    });

    const posts = await ctx.db.query("posts").order("desc").take(limit);
    posts.forEach((post: any) => {
      if (!matchesUser(post.userId) && !matchesUser(post.ownerUserId) && !matchesUser(post.authorId) && !matchesUser(post.createdByUserId)) return;
      timeline.push({
        _id: String(post._id),
        type: post.video || post.videoStorageId ? "post_video" : "post",
        title: post.title || "Post",
        description: String(post.content ?? post.caption ?? "").substring(0, 150),
        timestamp: post._creationTime,
        customerName: post.authorName ?? post.userName,
        metadata: JSON.stringify({ postId: String(post._id) }),
      });
    });

    const messages = await ctx.db.query("messages").order("desc").take(limit);
    messages.forEach((msg: any) => {
      if (!matchesUser(msg.senderId) && !matchesUser(msg.recipientId) && !matchesUser(msg.bookingId)) return;
      timeline.push({
        _id: String(msg._id),
        type: msg.partsOrderId ? "message_parts_order" : msg.bookingId ? "message_booking" : "message",
        title: msg.partsOrderId ? `Parts message from ${msg.senderName}` : `Message from ${msg.senderName}`,
        description: String(msg.content ?? "").substring(0, 150),
        timestamp: msg._creationTime,
        customerName: msg.senderName,
        metadata: JSON.stringify({ messageId: String(msg._id), bookingId: msg.bookingId ? String(msg.bookingId) : undefined, partsOrderId: msg.partsOrderId ? String(msg.partsOrderId) : undefined }),
      });
    });

    const activities = await ctx.db.query("activityLog").order("desc").take(limit);
    activities.forEach((activity: any) => {
      if (!matchesUser(activity.triggeredBy) && !matchesUser(activity.ownerUserId) && !matchesUser(activity.customerUserId)) return;
      timeline.push({
        _id: String(activity._id),
        type: activity.type,
        title: activity.title,
        description: activity.description,
        timestamp: activity._creationTime,
        customerName: activity.customerName,
        customerPhone: activity.customerPhone,
        customerEmail: activity.customerEmail,
        metadata: activity.metadata,
      });
    });

    return timeline
      .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit)
      .map((item: any) => ({
        _id: item._id,
        type: item.type,
        title: item.title,
        description: item.description,
        timestamp: item.timestamp,
        customerName: item.customerName,
        customerPhone: item.customerPhone,
        customerEmail: item.customerEmail,
        status: item.status,
        metadata: item.metadata,
      }));
  },
});