import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const ratingReturnValidator = v.object({
  _id: v.id("ratings"),
  _creationTime: v.number(),
  bookingId: v.id("bookings"),
  userId: v.string(),
  staffId: v.optional(v.string()),
  staffName: v.optional(v.string()),
  serviceType: v.string(),
  rating: v.number(),
  comment: v.optional(v.string()),
});

// Submit a rating for a completed booking
export const submit = mutation({
  args: {
    bookingId: v.id("bookings"),
    rating: v.number(),
    comment: v.optional(v.string()),
  },
  returns: v.id("ratings"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    if (args.rating < 1 || args.rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.userId !== identity.subject) throw new Error("Not your booking");
    if (booking.status !== "completed") {
      throw new Error("Can only rate completed services");
    }

    // Check for existing rating
    const existing = await ctx.db
      .query("ratings")
      .withIndex("by_bookingId", (q: any) => q.eq("bookingId", args.bookingId))
      .first();
    if (existing) {
      throw new Error("You have already rated this service");
    }

    const ratingId = await ctx.db.insert("ratings", {
      bookingId: args.bookingId,
      userId: identity.subject,
      staffId: booking.assignedTo,
      staffName: booking.assignedToName,
      serviceType: booking.serviceType,
      rating: args.rating,
      comment: args.comment,
    });

    // Link rating to booking
    await ctx.db.patch(args.bookingId, { ratingId });

    // Notify staff about the rating
    if (booking.assignedTo) {
      const stars = "★".repeat(args.rating) + "☆".repeat(5 - args.rating);
      await ctx.db.insert("notifications", {
        userId: booking.assignedTo,
        type: "new_rating",
        title: "New Service Rating",
        message: `${booking.customerName ?? "Customer"} rated their ${booking.serviceType}: ${stars}${args.comment ? ` - "${args.comment}"` : ""}`,
        bookingId: args.bookingId,
        isRead: false,
      });
    }

    // Confirm to customer
    await ctx.db.insert("notifications", {
      userId: identity.subject,
      type: "rating_submitted",
      title: "Thank You for Your Feedback!",
      message: `Your rating for ${booking.serviceType} on ${booking.date} has been submitted. We appreciate your feedback!`,
      bookingId: args.bookingId,
      isRead: false,
    });

    return ratingId;
  },
});

// Get rating for a specific booking
export const getForBooking = query({
  args: { bookingId: v.id("bookings") },
  returns: v.union(ratingReturnValidator, v.null()),
  handler: async (ctx, args) => {
    const rating = await ctx.db
      .query("ratings")
      .withIndex("by_bookingId", (q: any) => q.eq("bookingId", args.bookingId))
      .first();
    if (!rating) return null;
    return {
      _id: rating._id,
      _creationTime: rating._creationTime,
      bookingId: rating.bookingId,
      userId: rating.userId,
      staffId: rating.staffId,
      staffName: rating.staffName,
      serviceType: rating.serviceType,
      rating: rating.rating,
      comment: rating.comment,
    };
  },
});

// List all ratings by the current user
export const listMine = query({
  args: {},
  returns: v.array(ratingReturnValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const ratings = await ctx.db
      .query("ratings")
      .withIndex("by_userId", (q: any) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();

    return ratings.map((r: any) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      bookingId: r.bookingId,
      userId: r.userId,
      staffId: r.staffId,
      staffName: r.staffName,
      serviceType: r.serviceType,
      rating: r.rating,
      comment: r.comment,
    }));
  },
});

// Get average rating and count for a staff member
export const getStaffStats = query({
  args: { staffId: v.string() },
  returns: v.object({
    averageRating: v.number(),
    totalRatings: v.number(),
    distribution: v.array(v.object({
      stars: v.number(),
      count: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    const ratings = await ctx.db
      .query("ratings")
      .withIndex("by_staffId", (q: any) => q.eq("staffId", args.staffId))
      .collect();

    if (ratings.length === 0) {
      return {
        averageRating: 0,
        totalRatings: 0,
        distribution: [1, 2, 3, 4, 5].map((s) => ({ stars: s, count: 0 })),
      };
    }

    const sum = ratings.reduce((acc: number, r: any) => acc + r.rating, 0);
    const distribution = [1, 2, 3, 4, 5].map((s) => ({
      stars: s,
      count: ratings.filter((r: any) => r.rating === s).length,
    }));

    return {
      averageRating: Math.round((sum / ratings.length) * 10) / 10,
      totalRatings: ratings.length,
      distribution,
    };
  },
});

// Get all ratings (for admin/staff view)
export const listAll = query({
  args: {},
  returns: v.array(ratingReturnValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return (await ctx.db.query("ratings").order("desc").collect()).map((r: any) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      bookingId: r.bookingId,
      userId: r.userId,
      staffId: r.staffId,
      staffName: r.staffName,
      serviceType: r.serviceType,
      rating: r.rating,
      comment: r.comment,
    }));
  },
});