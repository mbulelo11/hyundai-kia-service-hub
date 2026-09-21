import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";

const reviewReturn = v.object({
  _id: v.id("reviews"),
  _creationTime: v.number(),
  userId: v.string(),
  userName: v.string(),
  userEmail: v.optional(v.string()),
  userImage: v.optional(v.string()),
  bookingId: v.optional(v.id("bookings")),
  testDriveId: v.optional(v.id("testDrives")),
  partsOrderId: v.optional(v.id("partsOrders")),
  serviceType: v.string(),
  vehicleDescription: v.optional(v.string()),
  rating: v.number(),
  title: v.optional(v.string()),
  comment: v.string(),
  staffName: v.optional(v.string()),
  sharedToGoogle: v.boolean(),
  isPublic: v.boolean(),
  staffResponse: v.optional(v.string()),
  staffRespondedAt: v.optional(v.number()),
});

function mapReview(r: any) {
  return {
    _id: r._id,
    _creationTime: r._creationTime,
    userId: r.userId,
    userName: r.userName,
    userEmail: r.userEmail,
    userImage: r.userImage,
    bookingId: r.bookingId,
    serviceType: r.serviceType,
    vehicleDescription: r.vehicleDescription,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    staffName: r.staffName,
    sharedToGoogle: r.sharedToGoogle ?? false,
    isPublic: r.isPublic ?? true,
    staffResponse: r.staffResponse,
    staffRespondedAt: r.staffRespondedAt,
  };
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
  if (!identity) return null;
  if (identity.subject) {
    try {
      const doc: any = await ctx.db.get(identity.subject);
      if (doc?.userId) {
        const linked = await safeDbGet(ctx, doc.userId);
        if (linked) return linked;
      }
      if (doc?.email !== undefined || doc?.role !== undefined) return doc;
    } catch {}
  }
  if (identity.email) {
    const user = await ctx.db.query("users").withIndex("email", (q: any) => q.eq("email", identity.email)).first();
    if (user) return user;
  }
  return null;
}

async function getCurrentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await findUserByIdentity(ctx, identity);
  if (!user || user.isDeleted) return null;
  const scopeIds = Array.from(new Set([String(user._id), String(identity.subject)]));
  return { identity, user, userId: String(user._id), scopeIds };
}

export const getStats = query({
  args: {},
  returns: v.object({
    averageRating: v.number(),
    avgRating: v.number(),
    totalReviews: v.number(),
    total: v.number(),
    googleShared: v.number(),
    distribution: v.record(v.string(), v.number()),
    recentReviews: v.array(reviewReturn),
  }),
  handler: async (ctx) => {
    const reviews = await ctx.db.query("reviews").collect();
    const total = reviews.length;
    const sum = reviews.reduce((acc: number, review: any) => acc + review.rating, 0);
    const average = total > 0 ? Number((sum / total).toFixed(1)) : 0;
    const googleShared = reviews.filter((review: any) => review.sharedToGoogle).length;
    const distribution = {
      "1": reviews.filter((review: any) => review.rating === 1).length,
      "2": reviews.filter((review: any) => review.rating === 2).length,
      "3": reviews.filter((review: any) => review.rating === 3).length,
      "4": reviews.filter((review: any) => review.rating === 4).length,
      "5": reviews.filter((review: any) => review.rating === 5).length,
    };

    return {
      averageRating: average,
      avgRating: average,
      totalReviews: total,
      total,
      googleShared,
      distribution,
      recentReviews: reviews.slice(0, 5).map(mapReview),
    };
  },
});

export const listPublic = query({
  args: {},
  returns: v.array(reviewReturn),
  handler: async (ctx) => {
    const reviews = await ctx.db.query("reviews").order("desc").collect();
    return reviews
      .filter((review: any) => review.isPublic ?? true)
      .map(mapReview);
  },
});

export const listPublicPaged = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(reviewReturn),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("reviews").order("desc").paginate(args.paginationOpts);
    return {
      page: page.page.filter((review: any) => review.isPublic ?? true).map(mapReview),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const listAllPaged = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(reviewReturn),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("reviews").order("desc").paginate(args.paginationOpts);
    return {
      page: page.page.map(mapReview),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const submit = mutation({
  args: {
    bookingId: v.optional(v.id("bookings")),
    testDriveId: v.optional(v.id("testDrives")),
    partsOrderId: v.optional(v.id("partsOrders")),
    serviceType: v.string(),
    vehicleDescription: v.optional(v.string()),
    rating: v.number(),
    title: v.optional(v.string()),
    comment: v.string(),
    staffName: v.optional(v.string()),
    sharedToGoogle: v.boolean(),
  },
  returns: v.id("reviews"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("User record not found");
    const user = current.user;
    const userId = current.userId;
    const userName = user?.name || identity.name || identity.email?.split("@")[0] || "Customer";
    const userImage = user?.profileImage || user?.image;

    if (args.bookingId) {
      const existing = await ctx.db
        .query("reviews")
        .withIndex("by_bookingId", (q: any) => q.eq("bookingId", args.bookingId))
        .first();
      if (existing) throw new Error("You have already reviewed this service");
    }
    if (args.testDriveId) {
      const testDrive = await ctx.db.get(args.testDriveId);
      if (!testDrive) throw new Error("Test drive not found");
      if (testDrive.status !== "completed") throw new Error("You can only review a test drive after it has been completed");
      const existingTestDrive = await ctx.db
        .query("reviews")
        .withIndex("by_testDriveId", (q: any) => q.eq("testDriveId", args.testDriveId))
        .first();
      if (existingTestDrive) throw new Error("You have already reviewed this test drive");
    }
    if (args.partsOrderId) {
      const partsOrder = await ctx.db.get(args.partsOrderId);
      if (!partsOrder) throw new Error("Parts order not found");
      if (partsOrder.status !== "fulfilled") throw new Error("You can only review a parts order after it has been delivered or collected");
      const existingPartsOrder = await ctx.db
        .query("reviews")
        .withIndex("by_partsOrderId", (q: any) => q.eq("partsOrderId", args.partsOrderId))
        .first();
      if (existingPartsOrder) throw new Error("You have already reviewed this parts order");
    }

    const reviewId = await ctx.db.insert("reviews", {
      userId,
      userName,
      userEmail: identity.email,
      userImage,
      bookingId: args.bookingId,
      testDriveId: args.testDriveId,
      partsOrderId: args.partsOrderId,
      serviceType: args.serviceType,
      vehicleDescription: args.vehicleDescription,
      rating: args.rating,
      title: args.title,
      comment: args.comment,
      staffName: args.staffName,
      sharedToGoogle: args.sharedToGoogle,
      isPublic: true,
    });

    // Award review tokens
    const wallet = await ctx.db
      .query("rewards")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .first();
    if (wallet) {
      const log = wallet.earningsLog ?? [];
      await ctx.db.patch(wallet._id, {
        balance: wallet.balance + 25,
        totalEarned: wallet.totalEarned + 25,
        earningsLog: [...log.slice(-49), {
          type: "review",
          amount: 25,
          description: `Review for ${args.serviceType}`,
          timestamp: Date.now(),
        }],
      });
    }

    // Notify staff about new review
    const staffUsers = await ctx.db.query("users").collect();
    for (const su of staffUsers) {
      if (su.role === "staff") {
        await ctx.db.insert("notifications", {
          userId: su._id.toString(),
          type: "new_review",
          title: `New ${args.rating}-Star Review`,
          message: `${userName} left a ${args.rating}-star review for ${args.serviceType}: "${args.comment.substring(0, 80)}..."`,
          isRead: false,
        });
      }
    }

    // Activity log for owner notification
    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: userId,
      type: "review_submitted",
      title: `${args.rating}-Star Review`,
      description: `${userName} rated ${args.serviceType}: "${args.comment.substring(0, 100)}${args.comment.length > 100 ? '...' : ''}"`,
      customerName: userName,
      customerPhone: undefined,
      metadata: JSON.stringify({ reviewId: String(reviewId), bookingId: args.bookingId ? String(args.bookingId) : undefined, testDriveId: args.testDriveId ? String(args.testDriveId) : undefined, rating: args.rating, serviceType: args.serviceType, sharedToGoogle: args.sharedToGoogle }),
      triggeredBy: userId,
    });

    return reviewId;
  },
});

export const respondToReview = mutation({
  args: {
    reviewId: v.id("reviews"),
    staffResponse: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("User record not found");
    const user = current.user;
    const userName = user?.name || identity.email || "Staff";
    const email = String(user.email ?? identity.email ?? "").trim().toLowerCase();
    const isStaff = Boolean(
      user.isOwner ||
      email === "vincentmm@hyundai.co.za" ||
      user.staffRole === "dp" ||
      user.staffRole === "regional" ||
      user.staffRole === "regional_manager"
    );
    if (!isStaff) throw new Error("Not authorized");

    const review = await ctx.db.get(args.reviewId);
    if (!review) throw new Error("Review not found");

    const response = args.staffResponse.trim();
    if (!response) throw new Error("Response is required");

    const now = Date.now();
    await ctx.db.patch(review._id, {
      staffResponse: response,
      staffRespondedAt: now,
      staffName: user.name || user.displayName || review.staffName,
    });

    await ctx.db.insert("notifications", {
      userId: review.userId,
      type: "review_response",
      title: "Staff replied to your review",
      message: response.slice(0, 180),
      isRead: false,
    });

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: current.userId,
      type: "review_response",
      title: "Staff replied to review",
      description: `${user.name || user.displayName || 'Staff'} replied to ${review.userName}'s review.`,
      customerName: review.userName,
      customerEmail: review.userEmail,
      metadata: JSON.stringify({ reviewId: String(review._id), staffResponse: response }),
      triggeredBy: current.userId,
    });

    return null;
  },
});