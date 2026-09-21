import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const SERVICE_REFERRAL_REWARD = 50;
const FINANCE_REFERRAL_REWARD = 50;

async function resolveCurrentUserId(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  let userId = identity.subject;
  try {
    const doc: any = await ctx.db.get(identity.subject as any);
    if (doc?.userId) userId = doc.userId.toString();
    else if (doc?.email) userId = doc._id.toString();
  } catch {}

  return { identity, userId };
}

async function upsertReferralWallet(ctx: any, userId: string, amount: number) {
  const existing = await ctx.db
    .query("referralWallets")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .first();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      balance: (existing.balance ?? 0) + amount,
      totalEarned: (existing.totalEarned ?? 0) + amount,
      lastUpdatedAt: now,
    });
  } else {
    await ctx.db.insert("referralWallets", {
      userId,
      balance: amount,
      totalEarned: amount,
      totalWithdrawn: 0,
      lastUpdatedAt: now,
      createdAt: now,
    });
  }
}

async function creditReferralWallet(ctx: any, args: { userId: string; sourceType: string; sourceId: string; amount: number; description: string; metadata?: string; }) {
  const existing = await ctx.db
    .query("referralWalletTransactions")
    .withIndex("by_sourceType_and_sourceId", (q: any) => q.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId))
    .first();
  if (existing) return false;

  const now = Date.now();
  await upsertReferralWallet(ctx, args.userId, args.amount);
  await ctx.db.insert("referralWalletTransactions", {
    userId: args.userId,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    transactionType: "credit",
    amount: args.amount,
    description: args.description,
    metadata: args.metadata,
    createdAt: now,
  });

  await ctx.runMutation(internal.activityLog.logInternal, {
    ownerUserId: args.userId,
    type: "referral_wallet_credit",
    title: "Referral wallet credited",
    description: args.description,
    metadata: JSON.stringify({ sourceType: args.sourceType, sourceId: args.sourceId, amount: args.amount }),
    triggeredBy: args.userId,
  });

  return true;
}

const referralActivityItem = v.object({
  _id: v.string(),
  type: v.string(),
  title: v.string(),
  description: v.string(),
  timestamp: v.number(),
});

const referralVehicleItem = v.object({
  _id: v.string(),
  serviceType: v.string(),
  status: v.string(),
  date: v.string(),
  timeSlot: v.string(),
  walletCreditAmount: v.optional(v.number()),
  walletCreditedAt: v.optional(v.number()),
  _creationTime: v.number(),
});

const referralFinanceItem = v.object({
  _id: v.string(),
  vehicleDescription: v.optional(v.string()),
  status: v.string(),
  dealStatus: v.optional(v.string()),
  closedDeal: v.optional(v.boolean()),
  _creationTime: v.number(),
});

const referralReviewItem = v.object({
  _id: v.string(),
  rating: v.number(),
  serviceType: v.string(),
  comment: v.string(),
  staffResponse: v.optional(v.string()),
  _creationTime: v.number(),
});

const referralSummaryValidator = v.object({
  code: v.string(),
  totalShares: v.number(),
  totalRegistered: v.number(),
  totalTokensEarned: v.number(),
  walletBalance: v.number(),
  walletTotalEarned: v.number(),
  successfulServiceBookings: v.number(),
  successfulFinanceApplications: v.number(),
  recentReferrals: v.array(v.object({
    _id: v.string(),
    platform: v.string(),
    status: v.string(),
    referredUserName: v.optional(v.string()),
    tokenReward: v.optional(v.number()),
    _creationTime: v.number(),
  })),
  serviceBookings: v.array(referralVehicleItem),
  financeApplications: v.array(referralFinanceItem),
  reviews: v.array(referralReviewItem),
  recentActivity: v.array(referralActivityItem),
});

// Generate or get existing referral code for a user
export const getMyCode = query({
  args: {},
  returns: v.object({
    code: v.string(),
    totalShares: v.number(),
    totalRegistered: v.number(),
    totalTokensEarned: v.number(),
  }),
  handler: async (ctx) => {
    const { identity, userId } = await resolveCurrentUserId(ctx);

    // Check if user already has referrals
    const existing = await ctx.db
      .query("referrals")
      .withIndex("by_referrerId", (q: any) => q.eq("referrerId", userId))
      .first();

    // Get user name for code generation
    let userName = identity.name ?? identity.email ?? "USER";
    try {
      const userDoc: any = await ctx.db.get(userId as any);
      if (userDoc?.name) userName = userDoc.name;
    } catch {}

    const code = existing?.referralCode ??
      userName.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase() +
      Math.floor(1000 + Math.random() * 9000).toString();

    // Stats
    const allReferrals = await ctx.db
      .query("referrals")
      .withIndex("by_referrerId", (q: any) => q.eq("referrerId", userId))
      .collect();

    const totalShares = allReferrals.length;
    const totalRegistered = allReferrals.filter((r: any) => r.status === "registered" || r.status === "rewarded").length;
    const totalTokensEarned = allReferrals.reduce((sum: number, r: any) => sum + (r.tokenReward ?? 0), 0);

    return { code, totalShares, totalRegistered, totalTokensEarned };
  },
});

export const getDashboardSummary = query({
  args: {},
  returns: referralSummaryValidator,
  handler: async (ctx) => {
    const { identity, userId } = await resolveCurrentUserId(ctx);

    let userName = identity.name ?? identity.email ?? "Customer";
    try {
      const userDoc: any = await ctx.db.get(userId as any);
      if (userDoc?.name) userName = userDoc.name;
    } catch {}

    const referrals = await ctx.db
      .query("referrals")
      .withIndex("by_referrerId", (q: any) => q.eq("referrerId", userId))
      .order("desc")
      .take(25);

    const serviceBookings = await ctx.db
      .query("bookings")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(25);

    const financeApplications = await ctx.db
      .query("financeApplications")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(25);

    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(25);

    const recentActivity = await ctx.db
      .query("activityLog")
      .withIndex("by_ownerUserId", (q: any) => q.eq("ownerUserId", userId))
      .order("desc")
      .take(25);

    const wallet = await ctx.db
      .query("referralWallets")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .first();

    const totalShares = referrals.length;
    const totalRegistered = referrals.filter((r: any) => r.status === "registered" || r.status === "rewarded").length;
    const totalTokensEarned = referrals.reduce((sum: number, r: any) => sum + (r.tokenReward ?? 0), 0);
    const successfulServiceBookings = serviceBookings.filter((b: any) => String(b.status ?? "") === "completed").length;
    const successfulFinanceApplications = financeApplications.filter((app: any) => ["approved", "pre_approved", "contract_ready"].includes(String(app.status ?? "")) || String(app.dealStatus ?? "") === "delivered" || Boolean(app.closedDeal)).length;

    return {
      code: referrals[0]?.referralCode ?? userName.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase() + Math.floor(1000 + Math.random() * 9000).toString(),
      totalShares,
      totalRegistered,
      totalTokensEarned,
      walletBalance: wallet?.balance ?? 0,
      walletTotalEarned: wallet?.totalEarned ?? 0,
      successfulServiceBookings,
      successfulFinanceApplications,
      recentReferrals: referrals.map((r: any) => ({
        _id: r._id.toString(),
        platform: r.platform,
        status: r.status,
        referredUserName: r.referredUserName,
        tokenReward: r.tokenReward,
        _creationTime: r._creationTime,
      })),
      serviceBookings: serviceBookings.map((b: any) => ({
        _id: b._id.toString(),
        serviceType: b.serviceType,
        status: b.status,
        date: b.date,
        timeSlot: b.timeSlot,
        walletCreditAmount: b.walletCreditAmount,
        walletCreditedAt: b.walletCreditedAt,
        _creationTime: b._creationTime,
      })),
      financeApplications: financeApplications.map((app: any) => ({
        _id: app._id.toString(),
        vehicleDescription: app.vehicleDescription,
        status: app.status,
        dealStatus: app.dealStatus,
        closedDeal: app.closedDeal,
        _creationTime: app._creationTime,
      })),
      reviews: reviews.map((review: any) => ({
        _id: review._id.toString(),
        rating: review.rating,
        serviceType: review.serviceType,
        comment: review.comment,
        staffResponse: review.staffResponse,
        _creationTime: review._creationTime,
      })),
      recentActivity: recentActivity.map((item: any) => ({
        _id: item._id.toString(),
        type: item.type,
        title: item.title,
        description: item.description,
        timestamp: item._creationTime,
      })),
    };
  },
});

// Track when a user shares the app
export const trackShare = mutation({
  args: {
    platform: v.string(),
    referralCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    let userId = identity.subject;
    let userName = identity.name ?? "User";
    try {
      const doc: any = await ctx.db.get(identity.subject as any);
      if (doc?.userId) {
        userId = doc.userId.toString();
        const user: any = await ctx.db.get(doc.userId);
        if (user?.name) userName = user.name;
      } else if (doc?.name) {
        userName = doc.name;
        userId = doc._id.toString();
      }
    } catch {}

    await ctx.db.insert("referrals", {
      referrerId: userId,
      referrerName: userName,
      referralCode: args.referralCode,
      platform: args.platform,
      status: "sent",
    });

    return null;
  },
});

// List my referral history
export const listMine = query({
  args: {},
  returns: v.array(v.object({
    _id: v.string(),
    platform: v.string(),
    status: v.string(),
    referredUserName: v.optional(v.string()),
    tokenReward: v.optional(v.number()),
    _creationTime: v.number(),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    let userId = identity.subject;
    try {
      const doc: any = await ctx.db.get(identity.subject as any);
      if (doc?.userId) userId = doc.userId.toString();
      else if (doc?.email) userId = doc._id.toString();
    } catch {}

    const referrals = await ctx.db
      .query("referrals")
      .withIndex("by_referrerId", (q: any) => q.eq("referrerId", userId))
      .order("desc")
      .take(50);

    return referrals.map((r: any) => ({
      _id: r._id.toString(),
      platform: r.platform,
      status: r.status,
      referredUserName: r.referredUserName,
      tokenReward: r.tokenReward,
      _creationTime: r._creationTime,
    }));
  },
});

export const getInviteByCode = query({
  args: { referralCode: v.string() },
  returns: v.union(v.object({
    referrerId: v.string(),
    referrerName: v.string(),
    referralCode: v.string(),
  }), v.null()),
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("referrals")
      .withIndex("by_referralCode", (q: any) => q.eq("referralCode", args.referralCode))
      .first();
    if (!invite) return null;
    return {
      referrerId: invite.referrerId,
      referrerName: invite.referrerName,
      referralCode: invite.referralCode,
    };
  },
});

export const creditReferralEvent = internalMutation({
  args: {
    userId: v.string(),
    sourceType: v.string(),
    sourceId: v.string(),
    amount: v.number(),
    description: v.string(),
    metadata: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await creditReferralWallet(ctx, args);
    return null;
  },
});

export const backfillReferralWallets = mutation({
  args: {},
  returns: v.object({ serviceCredits: v.number(), financeCredits: v.number() }),
  handler: async (ctx) => {
    const { userId } = await resolveCurrentUserId(ctx);
    const user = await ctx.db.get(userId as any);
    const role = String(user?.role ?? user?.staffRole ?? "").trim().toLowerCase();
    const canRun = Boolean(user?.isOwner || role === "admin" || role === "dp" || String(user?.email ?? "").trim().toLowerCase() === "vincentmm@hyundai.co.za");
    if (!canRun) throw new Error("Not authorized");

    const bookings = await ctx.db.query("bookings").order("desc").collect();
    let serviceCredits = 0;
    for (const booking of bookings) {
      if (String(booking.status ?? "") !== "completed") continue;
      const ownerUserId = String(booking.ownerUserId ?? booking.userId ?? "");
      if (!ownerUserId) continue;
      const credited = await creditReferralWallet(ctx, {
        userId: ownerUserId,
        sourceType: "service_booking",
        sourceId: String(booking._id),
        amount: SERVICE_REFERRAL_REWARD,
        description: `Referral reward for completed service booking ${booking.serviceType}`,
        metadata: JSON.stringify({ bookingId: String(booking._id), serviceType: booking.serviceType }),
      });
      if (credited) serviceCredits++;
    }

    const financeApplications = await ctx.db.query("financeApplications").order("desc").collect();
    let financeCredits = 0;
    for (const app of financeApplications) {
      const successful = String(app.dealStatus ?? "") === "delivered" || Boolean(app.closedDeal) || ["approved", "pre_approved", "contract_ready"].includes(String(app.status ?? ""));
      if (!successful) continue;
      if (String(app.dealStatus ?? "") !== "delivered") continue;
      const ownerUserId = String(app.ownerUserId ?? app.userId ?? "");
      if (!ownerUserId) continue;
      const credited = await creditReferralWallet(ctx, {
        userId: ownerUserId,
        sourceType: "finance_application",
        sourceId: String(app._id),
        amount: FINANCE_REFERRAL_REWARD,
        description: `Referral reward for delivered finance application ${app.vehicleDescription ?? app.firstName + " " + app.surname}`,
        metadata: JSON.stringify({ financeApplicationId: String(app._id), dealStatus: app.dealStatus, status: app.status }),
      });
      if (credited) financeCredits++;
    }

    return { serviceCredits, financeCredits };
  },
});