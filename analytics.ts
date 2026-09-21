import { query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { isAdminUser, canAccessDepartment, getUserDepartment, getViewer } from "./auth";

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";

function isOwnedByCurrentUser(record: any, userId: string) {
  return String(record?.ownerUserId ?? record?.addedBy ?? record?.createdBy ?? "") === userId;
}

function getWeekKey(ts: number): string {
  const d = new Date(ts);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
}

async function safeDbGet(ctx: any, id: string | undefined | null) {
  if (!id) return null;
  try {
    return await ctx.db.get(id as any);
  } catch {
    return null;
  }
}

async function collectAll(queryBuilder: any, limit = 25) {
  return await queryBuilder.take(limit);
}

async function countMatching(queryBuilder: any, predicate: (doc: any) => boolean, pageSize = 100) {
  let total = 0;
  let cursor: string | null = null;
  while (true) {
    const result: any = await queryBuilder.paginate({ numItems: pageSize, cursor });
    total += result.page.filter(predicate).length;
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  return total;
}

async function getCurrentUser(ctx: any) {
  const viewer = await getViewer(ctx);
  if (!viewer) return null;

  const identityEmail = String(viewer.identity?.email ?? viewer.user?.email ?? "").trim().toLowerCase();
  const email = String(viewer.user?.email ?? identityEmail ?? "").trim().toLowerCase();
  const isVincentAdmin = identityEmail === VINCENT_ADMIN_EMAIL || email === VINCENT_ADMIN_EMAIL;
  const isModerator = Boolean(
    viewer.isElevated ||
    isVincentAdmin ||
    viewer.user?.isOwner ||
    isAdminUser(viewer.user)
  );
  const isAdmin = Boolean(isVincentAdmin || viewer.user?.isOwner || isAdminUser(viewer.user));
  const userId = String(viewer.userId ?? viewer.user?._id ?? viewer.identity?.subject ?? identityEmail);
  const scopeIds = Array.from(new Set([userId, String(viewer.identity?.subject ?? ""), email].filter(Boolean)));
  const user = viewer.user;
  const department = getUserDepartment(user);

  return { identity: viewer.identity, userId, user, email, isModerator, isAdmin, department, scopeIds };
}

const DASHBOARD_SAMPLE_LIMIT = 5;
const FINANCE_SAMPLE_LIMIT = 5;
const ENGAGEMENT_SAMPLE_LIMIT = 10;

function isVincentAdminEmail(email: string) {
  return String(email ?? "").trim().toLowerCase() === VINCENT_ADMIN_EMAIL;
}

function isModeratorUser(user: any) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  return Boolean(user?.isOwner || isVincentAdminEmail(email) || isAdminUser(user));
}

function matchesScope(record: any, scopeIds: string[]) {
  return scopeIds.some((scopeId) => [record?.ownerUserId, record?.userId, record?.addedBy, record?.createdBy, record?.senderId, record?.recipientId, record?.triggeredBy].map((v) => String(v ?? "")).includes(scopeId));
}

function scopeBookings(bookings: any[], current: any) {
  if (current?.isAdmin || current?.isModerator) return bookings;
  return bookings.filter((b: any) => matchesScope(b, current.scopeIds) && canAccessDepartment(current.user, b.department ?? "service"));
}

function scopePosts(posts: any[], current: any) {
  if (current?.isModerator) return posts;
  return posts.filter((p: any) => matchesScope(p, current.scopeIds));
}

function scopeCustomerProfiles(profiles: any[], current: any) {
  if (current?.isModerator) return profiles;
  return profiles.filter((profile: any) => matchesScope(profile, current.scopeIds));
}

function scopeFinanceApps(apps: any[], current: any) {
  if (current?.isAdmin || current?.isModerator) return apps;
  return apps.filter((app: any) => matchesScope(app, current.scopeIds) && canAccessDepartment(current.user, app.department ?? ""));
}

function scopeMessages(messages: any[], current: any) {
  if (current?.isModerator) return messages;
  return messages.filter((message: any) => matchesScope(message, current.scopeIds));
}

function scopeReviews(reviews: any[], current: any) {
  if (current?.isModerator) return reviews;
  return reviews.filter((review: any) => matchesScope(review, current.scopeIds));
}

function buildEmptyPerformanceBoard() {
  return { staff: [], users: [] as any[] };
}

function scoreRow(row: any) {
  return Number(row.activities ?? 0) * 4 + Number(row.financeApps ?? 0) * 3 + Number(row.testDrives ?? 0) * 2 + Number(row.bookings ?? 0) * 2 + Number(row.customers ?? 0) + Number(row.messages ?? 0);
}

// ============================================
// MAIN DASHBOARD STATS
// ============================================
export const getDashboardStats = query({
  args: {},
  returns: v.object({
    totalBookings: v.number(),
    pendingBookings: v.number(),
    confirmedBookings: v.number(),
    inProgressBookings: v.number(),
    completedBookings: v.number(),
    totalUsers: v.number(),
    customerCount: v.number(),
    staffCount: v.number(),
    totalStock: v.number(),
    availableStock: v.number(),
    soldStock: v.number(),
    totalTestDrives: v.number(),
    pendingTestDrives: v.number(),
    totalFinanceApps: v.number(),
    pendingFinanceApps: v.number(),
    totalReviews: v.number(),
    avgRating: v.number(),
    totalTokensCirculating: v.number(),
    totalMessages: v.number(),
    unreadMessages: v.number(),
    financeClosedDeals: v.number(),
    totalPostLikes: v.number(),
    totalPostViews: v.number(),
  }),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return emptyDashboardStats();

    const [
      bookings,
      users,
      testDrives,
      financeApps,
      reviews,
      rewards,
      messages,
      posts,
      availableInventory,
      reservedInventory,
      soldInventory,
    ] = await Promise.all([
      collectAll(ctx.db.query("bookings").order("desc"), 25),
      collectAll(ctx.db.query("users").order("desc"), 25),
      collectAll(ctx.db.query("testDrives").order("desc"), 25),
      collectAll(ctx.db.query("financeApplications").order("desc"), 25),
      collectAll(ctx.db.query("reviews").order("desc"), 25),
      collectAll(ctx.db.query("rewards").withIndex("by_userId", (q: any) => q.eq("userId", current.userId)), 25),
      collectAll(ctx.db.query("messages").order("desc"), 25),
      collectAll(ctx.db.query("posts").order("desc"), 25),
      collectAll(ctx.db.query("inventory").withIndex("by_status", (q: any) => q.eq("status", "available")).order("desc"), 25),
      collectAll(ctx.db.query("inventory").withIndex("by_status", (q: any) => q.eq("status", "reserved")).order("desc"), 25),
      collectAll(ctx.db.query("inventory").withIndex("by_status", (q: any) => q.eq("status", "sold")).order("desc"), 25),
    ]);

    const totalUsers = users.length;
    const customerCount = users.filter((user: any) => String(user.role ?? "").toLowerCase() === "customer").length;
    const staffCount = users.filter((user: any) => String(user.role ?? "").toLowerCase() === "staff").length;
    const totalStock = availableInventory.length + reservedInventory.length + soldInventory.length;
    const totalReviews = reviews.length;
    const totalRating = reviews.reduce((sum: number, review: any) => sum + Number(review.rating ?? 0), 0);
    const totalTokensCirculating = rewards.reduce((sum: number, reward: any) => sum + Number(reward.balance ?? 0), 0);

    return {
      totalBookings: bookings.length,
      pendingBookings: bookings.filter((b: any) => b.status === "pending").length,
      confirmedBookings: bookings.filter((b: any) => b.status === "confirmed").length,
      inProgressBookings: bookings.filter((b: any) => b.status === "in_progress").length,
      completedBookings: bookings.filter((b: any) => b.status === "completed").length,
      totalUsers,
      customerCount,
      staffCount,
      totalStock,
      availableStock: availableInventory.length,
      soldStock: soldInventory.length,
      totalTestDrives: testDrives.length,
      pendingTestDrives: testDrives.filter((t: any) => t.status === "pending").length,
      totalFinanceApps: financeApps.length,
      pendingFinanceApps: financeApps.filter((f: any) => f.status === "submitted").length,
      totalReviews,
      avgRating: totalReviews > 0 ? Math.round((totalRating / totalReviews) * 10) / 10 : 0,
      totalTokensCirculating,
      totalMessages: messages.length,
      unreadMessages: messages.filter((message: any) => !message.isRead).length,
      financeClosedDeals: financeApps.filter((f: any) => f.closedDeal).length,
      totalPostLikes: posts.reduce((sum: number, post: any) => sum + Number(post.likeCount ?? 0), 0),
      totalPostViews: posts.reduce((sum: number, post: any) => sum + Number(post.viewCount ?? 0), 0),
    };
  },
});

export const getFinanceApplicationFeed = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("financeApplications"),
    _creationTime: v.number(),
    firstName: v.string(),
    surname: v.string(),
    email: v.string(),
    phone: v.string(),
    vehicleDescription: v.optional(v.string()),
    status: v.string(),
    department: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    dealStatus: v.optional(v.string()),
    closedDeal: v.optional(v.boolean()),
    staffNotes: v.optional(v.string()),
    attachmentNames: v.optional(v.array(v.string())),
    userId: v.string(),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const all = await collectAll(ctx.db.query("financeApplications").order("desc"));
    const scoped = current.isModerator ? all : scopeFinanceApps(all, current);
    return scoped.map((app: any) => ({
      _id: app._id,
      _creationTime: app._creationTime,
      firstName: app.firstName,
      surname: app.surname,
      email: app.email,
      phone: app.phone,
      vehicleDescription: app.vehicleDescription,
      status: app.status,
      department: app.department,
      assignedToName: app.assignedToName,
      dealStatus: app.dealStatus,
      closedDeal: app.closedDeal,
      staffNotes: app.staffNotes,
      attachmentNames: app.attachmentNames,
      userId: app.userId,
    }));
  },
});

function formatWeekLabel(weekKey: string) {
  const [year, month, day] = weekKey.split("-");
  return `${month}/${day}`;
}

function buildWeeklyBuckets(weeksBack = 8) {
  const buckets: Array<{ key: string; label: string; weekStart: number }> = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() - now.getDay());

  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() - i * 7);
    const key = getWeekKey(weekStart.getTime());
    buckets.push({ key, label: formatWeekLabel(key), weekStart: weekStart.getTime() });
  }
  return buckets;
}

function bucketByWeek<T>(items: T[], getTimestamp: (item: T) => number) {
  const map = new Map<string, { key: string; label: string; total: number; completed: number; likes: number; comments: number; views: number; earned: number; redeemed: number; activeWallets: number }>();
  for (const item of items) {
    const key = getWeekKey(getTimestamp(item));
    if (!map.has(key)) {
      map.set(key, { key, label: formatWeekLabel(key), total: 0, completed: 0, likes: 0, comments: 0, views: 0, earned: 0, redeemed: 0, activeWallets: 0 });
    }
  }
  return map;
}

function emptyDashboardStats() {
  return {
    totalBookings: 0,
    pendingBookings: 0,
    confirmedBookings: 0,
    inProgressBookings: 0,
    completedBookings: 0,
    totalUsers: 0,
    customerCount: 0,
    staffCount: 0,
    totalStock: 0,
    availableStock: 0,
    soldStock: 0,
    totalTestDrives: 0,
    pendingTestDrives: 0,
    totalFinanceApps: 0,
    pendingFinanceApps: 0,
    totalReviews: 0,
    avgRating: 0,
    totalTokensCirculating: 0,
    totalMessages: 0,
    unreadMessages: 0,
    financeClosedDeals: 0,
    totalPostLikes: 0,
    totalPostViews: 0,
  };
}

export const getPostEngagementStats = query({
  args: {},
  returns: v.object({
    totalPosts: v.number(),
    totalLikes: v.number(),
    totalViews: v.number(),
    totalComments: v.number(),
    weekly: v.array(v.object({
      label: v.string(),
      views: v.number(),
      likes: v.number(),
      comments: v.number(),
    })),
    topPosts: v.array(v.object({
      postId: v.string(),
      title: v.optional(v.string()),
      authorDisplayName: v.optional(v.string()),
      views: v.number(),
      likes: v.number(),
      comments: v.number(),
    })),
  }),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) {
      return { totalPosts: 0, totalLikes: 0, totalViews: 0, totalComments: 0, weekly: [], topPosts: [] };
    }

    const allPosts = await collectAll(ctx.db.query("posts").withIndex("by_isDeleted_and_isApproved_and_createdAt", (q: any) => q.eq("isDeleted", false).eq("isApproved", true)).order("desc"));
    const posts = current.isModerator ? allPosts : scopePosts(allPosts, current);
    const buckets = buildWeeklyBuckets(8);
    const weeklyMap = new Map(buckets.map((bucket) => [bucket.key, { label: bucket.label, views: 0, likes: 0, comments: 0 }]));

    const topPosts = posts
      .map((post: any) => ({
        postId: String(post.postId ?? post._id),
        title: post.title,
        authorDisplayName: post.authorDisplayName,
        views: Number(post.viewCount ?? 0),
        likes: Number(post.likeCount ?? 0),
        comments: Number(post.commentCount ?? 0),
        createdAt: Number(post.createdAt ?? post._creationTime ?? Date.now()),
      }))
      .sort((a: any, b: any) => (b.views + b.likes + b.comments) - (a.views + a.likes + a.comments));

    for (const post of topPosts) {
      const weekKey = getWeekKey(post.createdAt);
      const bucket = weeklyMap.get(weekKey);
      if (!bucket) continue;
      bucket.views += post.views;
      bucket.likes += post.likes;
      bucket.comments += post.comments;
    }

    return {
      totalPosts: posts.length,
      totalLikes: posts.reduce((sum: number, post: any) => sum + Number(post.likeCount ?? 0), 0),
      totalViews: posts.reduce((sum: number, post: any) => sum + Number(post.viewCount ?? 0), 0),
      totalComments: posts.reduce((sum: number, post: any) => sum + Number(post.commentCount ?? 0), 0),
      weekly: buckets.map((bucket) => {
        const currentBucket = weeklyMap.get(bucket.key);
        return {
          label: bucket.label,
          views: currentBucket?.views ?? 0,
          likes: currentBucket?.likes ?? 0,
          comments: currentBucket?.comments ?? 0,
        };
      }),
      topPosts: topPosts.slice(0, 5).map(({ createdAt, ...post }: any) => post),
    };
  },
});

export const getServiceTrend = query({
  args: {},
  returns: v.array(v.object({
    label: v.string(),
    total: v.number(),
    completed: v.number(),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const allBookings = await collectAll(ctx.db.query("bookings").order("desc"));
    const bookings = current.isModerator ? allBookings : scopeBookings(allBookings, current);
    const buckets = buildWeeklyBuckets(12);
    const weeklyMap = new Map(buckets.map((bucket) => [bucket.key, { label: bucket.label, total: 0, completed: 0 }]));

    for (const booking of bookings) {
      const createdAt = Number(booking._creationTime ?? Date.now());
      const weekKey = getWeekKey(createdAt);
      const bucket = weeklyMap.get(weekKey);
      if (!bucket) continue;
      bucket.total += 1;
      if (String(booking.status ?? "").toLowerCase() === "completed") {
        bucket.completed += 1;
      }
    }

    return buckets.map((bucket) => ({
      label: bucket.label,
      total: weeklyMap.get(bucket.key)?.total ?? 0,
      completed: weeklyMap.get(bucket.key)?.completed ?? 0,
    }));
  },
});

export const getServiceBreakdown = query({
  args: {},
  returns: v.array(v.object({
    serviceType: v.string(),
    count: v.number(),
    percentage: v.number(),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const allBookings = await collectAll(ctx.db.query("bookings").order("desc"));
    const bookings = current.isModerator ? allBookings : scopeBookings(allBookings, current);
    const counts = new Map<string, number>();
    for (const booking of bookings) {
      const key = String(booking.serviceType ?? "Unknown");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = bookings.length || 1;
    return [...counts.entries()]
      .map(([serviceType, count]) => ({ serviceType, count, percentage: Math.round((count / total) * 100) }))
      .sort((a: any, b: any) => b.count - a.count);
  },
});

export const getTokenTrend = query({
  args: {},
  returns: v.array(v.object({
    label: v.string(),
    totalEarned: v.number(),
    totalRedeemed: v.number(),
    activeWallets: v.number(),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const wallets = current.isModerator
      ? await collectAll(ctx.db.query("rewards").order("desc"))
      : await collectAll(ctx.db.query("rewards").withIndex("by_userId", (q: any) => q.eq("userId", current.userId)).order("desc"));

    const buckets = buildWeeklyBuckets(12);
    const weeklyMap = new Map(buckets.map((bucket) => [bucket.key, { label: bucket.label, totalEarned: 0, totalRedeemed: 0, activeWallets: 0 }]));

    for (const wallet of wallets) {
      const log = Array.isArray(wallet.earningsLog) ? wallet.earningsLog : [];
      const seenWeeks = new Set<string>();
      for (const entry of log) {
        const key = getWeekKey(Number(entry.timestamp ?? wallet._creationTime ?? Date.now()));
        const bucket = weeklyMap.get(key);
        if (!bucket) continue;
        const amount = Number(entry.amount ?? 0);
        if (amount >= 0) bucket.totalEarned += amount;
        else bucket.totalRedeemed += Math.abs(amount);
        seenWeeks.add(key);
      }
      for (const key of seenWeeks) {
        const bucket = weeklyMap.get(key);
        if (bucket) bucket.activeWallets += 1;
      }
    }

    return buckets.map((bucket) => {
      const value = weeklyMap.get(bucket.key);
      return {
        label: bucket.label,
        totalEarned: value?.totalEarned ?? 0,
        totalRedeemed: value?.totalRedeemed ?? 0,
        activeWallets: value?.activeWallets ?? 0,
      };
    });
  },
});

export const getStockBreakdown = query({
  args: {},
  returns: v.object({
    byMake: v.array(v.object({ make: v.string(), count: v.number() })),
    byStatus: v.array(v.object({ status: v.string(), count: v.number() })),
    byCategory: v.array(v.object({ category: v.string(), count: v.number() })),
    totalViews: v.number(),
  }),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) {
      return { byMake: [], byStatus: [], byCategory: [], totalViews: 0 };
    }

    const itemsAll = await collectAll(ctx.db.query("inventory").order("desc"));
    const items = current.isModerator ? itemsAll : itemsAll.filter((item: any) => matchesScope(item, current.scopeIds));
    const byMake = new Map<string, number>();
    const byStatus = new Map<string, number>();
    const byCategory = new Map<string, number>();

    for (const item of items) {
      byMake.set(String(item.make ?? "Unknown"), (byMake.get(String(item.make ?? "Unknown")) ?? 0) + 1);
      byStatus.set(String(item.status ?? "unknown"), (byStatus.get(String(item.status ?? "unknown")) ?? 0) + 1);
      byCategory.set(String(item.category ?? "uncategorized"), (byCategory.get(String(item.category ?? "uncategorized")) ?? 0) + 1);
    }

    const viewEvents = await collectAll(ctx.db.query("activityLog").withIndex("by_type", (q: any) => q.eq("type", "stock_view")).order("desc"));
    return {
      byMake: [...byMake.entries()].map(([make, count]) => ({ make, count })).sort((a: any, b: any) => b.count - a.count),
      byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })).sort((a: any, b: any) => b.count - a.count),
      byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })).sort((a: any, b: any) => b.count - a.count),
      totalViews: viewEvents.length,
    };
  },
});

export const getStockEngagementStats = query({
  args: {},
  returns: v.object({
    views: v.number(),
    shares: v.number(),
    visits: v.number(),
    topItems: v.array(v.object({
      itemId: v.optional(v.string()),
      itemName: v.string(),
      views: v.number(),
      shares: v.number(),
      visits: v.number(),
    })),
  }),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) {
      return { views: 0, shares: 0, visits: 0, topItems: [] };
    }

    const eventTypes = ["stock_view", "stock_share", "stock_visit"] as const;
    const eventsByType = await Promise.all(eventTypes.map(async (type) => ({
      type,
      events: await collectAll(ctx.db.query("activityLog").withIndex("by_type", (q: any) => q.eq("type", type)).order("desc")),
    })));

    const totals = { views: 0, shares: 0, visits: 0 };
    const itemMap = new Map<string, { itemId?: string; itemName: string; views: number; shares: number; visits: number }>();

    for (const { type, events } of eventsByType) {
      for (const event of events) {
        if (!current.isModerator && event.triggeredBy !== current.userId) continue;
        const metadata = (() => {
          try { return event.metadata ? JSON.parse(event.metadata) : {}; } catch { return {}; }
        })();
        const itemId = metadata.itemId ? String(metadata.itemId) : undefined;
        const itemName = String(metadata.itemName ?? event.description ?? 'Stock item');
        const key = itemId ?? itemName;
        const currentItem = itemMap.get(key) ?? { itemId, itemName, views: 0, shares: 0, visits: 0 };
        if (type === 'stock_view') {
          totals.views += 1;
          currentItem.views += 1;
        }
        if (type === 'stock_share') {
          totals.shares += 1;
          currentItem.shares += 1;
        }
        if (type === 'stock_visit') {
          totals.visits += 1;
          currentItem.visits += 1;
        }
        itemMap.set(key, currentItem);
      }
    }

    const topItems = [...itemMap.values()].sort((a: any, b: any) => (b.views + b.shares + b.visits) - (a.views + a.shares + a.visits)).slice(0, 6);
    return { views: totals.views, shares: totals.shares, visits: totals.visits, topItems };
  },
});

export const getTestDriveStats = query({
  args: {},
  returns: v.object({
    total: v.number(),
    pending: v.number(),
    confirmed: v.number(),
    completed: v.number(),
    conversionRate: v.number(),
    topVehicles: v.array(v.object({ vehicle: v.string(), count: v.number() })),
  }),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) {
      return { total: 0, pending: 0, confirmed: 0, completed: 0, conversionRate: 0, topVehicles: [] };
    }

    const allTestDrives = await collectAll(ctx.db.query("testDrives").order("desc"));
    const testDrives = current.isModerator ? allTestDrives : allTestDrives.filter((td: any) => matchesScope(td, current.scopeIds));
    const vehicleMap = new Map<string, number>();

    for (const td of testDrives) {
      const vehicle = String(td.vehicleDescription ?? 'Unknown vehicle');
      vehicleMap.set(vehicle, (vehicleMap.get(vehicle) ?? 0) + 1);
    }

    const total = testDrives.length;
    const completed = testDrives.filter((td: any) => String(td.status ?? '').toLowerCase() === 'completed').length;
    return {
      total,
      pending: testDrives.filter((td: any) => String(td.status ?? '').toLowerCase() === 'pending').length,
      confirmed: testDrives.filter((td: any) => String(td.status ?? '').toLowerCase() === 'confirmed').length,
      completed,
      conversionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      topVehicles: [...vehicleMap.entries()].map(([vehicle, count]) => ({ vehicle, count })).sort((a: any, b: any) => b.count - a.count).slice(0, 6),
    };
  },
});

export const getReviewStats = query({
  args: {},
  returns: v.object({
    avgRating: v.number(),
    total: v.number(),
    googleShared: v.number(),
    distribution: v.array(v.object({ stars: v.number(), count: v.number() })),
  }),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return { avgRating: 0, total: 0, googleShared: 0, distribution: [1, 2, 3, 4, 5].map((stars) => ({ stars, count: 0 })) };

    const allReviews = await collectAll(ctx.db.query("reviews").order("desc"));
    const reviews = current.isModerator ? allReviews : scopeReviews(allReviews, current);
    const total = reviews.length;
    const sum = reviews.reduce((acc: number, review: any) => acc + Number(review.rating ?? 0), 0);
    const googleShared = reviews.filter((review: any) => Boolean(review.sharedToGoogle)).length;
    const distribution = [1, 2, 3, 4, 5].map((stars) => ({
      stars,
      count: reviews.filter((review: any) => Number(review.rating ?? 0) === stars).length,
    }));

    return {
      avgRating: total > 0 ? Number((sum / total).toFixed(1)) : 0,
      total,
      googleShared,
      distribution,
    };
  },
});

export const getMerchandiseSalesStats = query({
  args: {},
  returns: v.object({
    totalOrders: v.number(),
    openOrders: v.number(),
    completedOrders: v.number(),
    totalRevenue: v.number(),
    byBrand: v.array(v.object({ brand: v.string(), orders: v.number(), revenue: v.number() })),
    byFulfillment: v.array(v.object({ fulfillmentType: v.string(), count: v.number() })),
    recentOrders: v.array(v.object({
      orderId: v.string(),
      brand: v.string(),
      title: v.string(),
      totalAmount: v.number(),
      status: v.string(),
      createdAt: v.number(),
    })),
  }),
  handler: async (ctx) => {
    return await ctx.runQuery(api.merchandise.getMerchandiseSalesStats, {});
  },
});

export const getPerformanceBoard = query({
  args: { limit: v.optional(v.number()) },
  returns: v.object({
    staff: v.array(v.object({
      userId: v.string(),
      name: v.string(),
      email: v.optional(v.string()),
      dealershipName: v.optional(v.string()),
      dealershipBrand: v.optional(v.string()),
      dealershipLocation: v.optional(v.string()),
      role: v.string(),
      customers: v.number(),
      bookings: v.number(),
      testDrives: v.number(),
      financeApps: v.number(),
      messages: v.number(),
      activities: v.number(),
      lastSeenAt: v.optional(v.number()),
      isOnline: v.boolean(),
      score: v.number(),
    })),
    users: v.array(v.object({
      userId: v.string(),
      name: v.string(),
      email: v.optional(v.string()),
      assignedStaffUserId: v.optional(v.string()),
      assignedStaffName: v.optional(v.string()),
      bookings: v.number(),
      testDrives: v.number(),
      financeApps: v.number(),
      messages: v.number(),
      activities: v.number(),
      lastSeenAt: v.optional(v.number()),
      score: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return { staff: [], users: [] };

    const limit = Math.min(args.limit ?? 6, 10);
    const [users, profiles, bookings, testDrives, financeApps, messages, activities] = await Promise.all([
      collectAll(ctx.db.query("users").order("desc")),
      collectAll(ctx.db.query("customerProfiles").order("desc")),
      collectAll(ctx.db.query("bookings").order("desc")),
      collectAll(ctx.db.query("testDrives").order("desc")),
      collectAll(ctx.db.query("financeApplications").order("desc")),
      collectAll(ctx.db.query("messages").order("desc")),
      collectAll(ctx.db.query("activityLog").order("desc")),
    ]);

    const now = Date.now();
    const staffRows = users
      .filter((user: any) => String(user.role ?? "").toLowerCase() === "staff" || user.isOwner || isVincentAdminEmail(user.email))
      .map((staff: any) => {
        const staffId = String(staff._id);
        const customers = profiles.filter((profile: any) => [profile.ownerUserId, profile.assignedToUserId, profile.assignedByUserId, profile.linkedUserId].map((value) => String(value ?? "")).includes(staffId)).length;
        const bookingsCount = bookings.filter((booking: any) => [booking.ownerUserId, booking.assignedToUserId, booking.userId].map((value) => String(value ?? "")).includes(staffId)).length;
        const testDrivesCount = testDrives.filter((td: any) => [td.ownerUserId, td.assignedToUserId, td.userId].map((value) => String(value ?? "")).includes(staffId)).length;
        const financeCount = financeApps.filter((app: any) => [app.ownerUserId, app.ownerId, app.owner_id, app.assignedToUserId, app.userId].map((value) => String(value ?? "")).includes(staffId)).length;
        const messagesCount = messages.filter((message: any) => [message.ownerUserId, message.senderId, message.recipientId].map((value) => String(value ?? "")).includes(staffId)).length;
        const activitiesCount = activities.filter((activity: any) => [activity.ownerUserId, activity.ownerId, activity.triggeredBy, activity.customerUserId].map((value) => String(value ?? "")).includes(staffId)).length;
        const lastSeenAt = staff.lastSeenAt;
        const score = Number(customers) * 4 + Number(bookingsCount) * 2 + Number(testDrivesCount) * 2 + Number(financeCount) * 3 + Number(messagesCount) + Number(activitiesCount);
        return {
          userId: staffId,
          name: staff.displayName ?? staff.name ?? staff.email ?? "Staff",
          email: staff.email,
          dealershipName: staff.dealershipName,
          dealershipBrand: staff.dealershipBrand,
          dealershipLocation: staff.dealershipLocation,
          role: String(staff.staffRole ?? staff.role ?? "staff").replace(/_/g, ' '),
          customers,
          bookings: bookingsCount,
          testDrives: testDrivesCount,
          financeApps: financeCount,
          messages: messagesCount,
          activities: activitiesCount,
          lastSeenAt,
          isOnline: typeof lastSeenAt === 'number' && now - lastSeenAt < 120000,
          score,
        };
      })
      .sort((a: any, b: any) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
      .slice(0, limit);

    const userRows = users
      .filter((user: any) => String(user.role ?? "").toLowerCase() === "customer")
      .map((customer: any) => {
        const customerId = String(customer._id);
        const profile = profiles.find((row: any) => String(row.linkedUserId ?? "") === customerId) ?? null;
        const bookingsCount = bookings.filter((booking: any) => [booking.userId, booking.ownerUserId, booking.assignedToUserId].map((value) => String(value ?? "")).includes(customerId)).length;
        const testDrivesCount = testDrives.filter((td: any) => [td.userId, td.ownerUserId, td.assignedToUserId].map((value) => String(value ?? "")).includes(customerId)).length;
        const financeCount = financeApps.filter((app: any) => [app.userId, app.ownerUserId, app.ownerId, app.owner_id, app.assignedToUserId].map((value) => String(value ?? "")).includes(customerId)).length;
        const messagesCount = messages.filter((message: any) => [message.senderId, message.recipientId].map((value) => String(value ?? "")).includes(customerId)).length;
        const activitiesCount = activities.filter((activity: any) => [activity.ownerUserId, activity.ownerId, activity.triggeredBy, activity.customerUserId].map((value) => String(value ?? "")).includes(customerId)).length;
        const lastSeenAt = customer.lastSeenAt;
        const score = Number(bookingsCount) + Number(testDrivesCount) * 2 + Number(financeCount) * 3 + Number(messagesCount) + Number(activitiesCount);
        return {
          userId: customerId,
          name: customer.displayName ?? customer.name ?? customer.email ?? "Customer",
          email: customer.email,
          assignedStaffUserId: profile?.assignedToUserId ?? profile?.ownerUserId ?? undefined,
          assignedStaffName: profile?.assignedToName ?? undefined,
          bookings: bookingsCount,
          testDrives: testDrivesCount,
          financeApps: financeCount,
          messages: messagesCount,
          activities: activitiesCount,
          lastSeenAt,
          score,
        };
      })
      .sort((a: any, b: any) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
      .slice(0, limit);

    return { staff: staffRows, users: userRows };
  },
});