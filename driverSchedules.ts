import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";

async function safeDbGet(ctx: any, id: string | undefined | null) {
  if (!id) return null;
  try {
    return await ctx.db.get(id as any);
  } catch {
    return null;
  }
}

async function getCurrentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  let userId = String(identity.subject);
  let user: any = null;

  try {
    const subjectDoc: any = await safeDbGet(ctx, identity.subject);
    if (subjectDoc?.userId) {
      const nestedUser = await safeDbGet(ctx, subjectDoc.userId);
      if (nestedUser) {
        userId = String(nestedUser._id);
        user = nestedUser;
      }
    } else if (subjectDoc?.email || subjectDoc?.role) {
      userId = String(subjectDoc._id);
      user = subjectDoc;
    }
  } catch {}

  if (!user && identity.email) {
    user = await ctx.db.query("users").withIndex("email", (q: any) => q.eq("email", identity.email)).first();
    if (user) userId = String(user._id);
  }

  const email = String(user?.email ?? identity.email ?? "").trim().toLowerCase();
  const isModerator = Boolean(
    user?.isOwner ||
    email === VINCENT_ADMIN_EMAIL ||
    user?.staffRole === "dp"
  );

  return { identity, userId, user, isModerator };
}

function mapSchedule(schedule: any) {
  return {
    _id: schedule._id,
    _creationTime: schedule._creationTime,
    ownerUserId: schedule.ownerUserId,
    driverUserId: schedule.driverUserId,
    driverName: schedule.driverName,
    sourceType: schedule.sourceType,
    bookingId: schedule.bookingId,
    partsOrderId: schedule.partsOrderId,
    customerName: schedule.customerName,
    contactDetails: schedule.contactDetails,
    address: schedule.address,
    scheduleDate: schedule.scheduleDate,
    scheduleTime: schedule.scheduleTime,
    status: schedule.status,
    notes: schedule.notes,
    receivedByUserId: schedule.receivedByUserId,
    receivedByName: schedule.receivedByName,
    completedByUserId: schedule.completedByUserId,
    completedByName: schedule.completedByName,
    completedAt: schedule.completedAt,
  };
}

const scheduleReturn = v.object({
  _id: v.id("driverSchedules"),
  _creationTime: v.number(),
  ownerUserId: v.optional(v.string()),
  driverUserId: v.optional(v.string()),
  driverName: v.optional(v.string()),
  sourceType: v.string(),
  bookingId: v.optional(v.id("bookings")),
  partsOrderId: v.optional(v.id("partsOrders")),
  customerName: v.string(),
  contactDetails: v.optional(v.string()),
  address: v.optional(v.string()),
  scheduleDate: v.string(),
  scheduleTime: v.optional(v.string()),
  status: v.string(),
  notes: v.optional(v.string()),
  receivedByUserId: v.optional(v.string()),
  receivedByName: v.optional(v.string()),
  completedByUserId: v.optional(v.string()),
  completedByName: v.optional(v.string()),
  completedAt: v.optional(v.number()),
});

export const listMine = query({
  args: {},
  returns: v.array(scheduleReturn),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (current.isModerator) {
      const all = await ctx.db.query("driverSchedules").order("desc").collect();
      return all.map(mapSchedule);
    }

    const schedules = await ctx.db
      .query("driverSchedules")
      .withIndex("by_driverUserId", (q: any) => q.eq("driverUserId", current.userId))
      .order("desc")
      .collect();
    return schedules.map(mapSchedule);
  },
});

export const completeSchedule = mutation({
  args: { scheduleId: v.id("driverSchedules") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current.isModerator && current.user?.role !== "staff") {
      throw new Error("Not authorized");
    }

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");

    const now = Date.now();
    const completedByName = current.user?.name ?? current.identity.name ?? current.identity.email ?? "Driver";

    await ctx.db.patch(args.scheduleId, {
      status: "completed",
      completedByUserId: current.userId,
      completedByName,
      completedAt: now,
    });

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: current.userId,
      type: "driver_schedule_completed",
      title: "Driver schedule completed",
      description: `${schedule.customerName}'s ${schedule.sourceType.replace('_', ' ')} delivery was completed.`,
      customerName: schedule.customerName,
      metadata: JSON.stringify({ scheduleId: String(schedule._id), bookingId: schedule.bookingId ? String(schedule.bookingId) : undefined, partsOrderId: schedule.partsOrderId ? String(schedule.partsOrderId) : undefined, sourceType: schedule.sourceType, completedAt: now }),
      triggeredBy: current.userId,
    });

    if (schedule.bookingId) {
      const booking = await ctx.db.get(schedule.bookingId);
      if (booking) {
        await ctx.db.patch(schedule.bookingId, { status: "completed" });
      }
    }

    if (schedule.partsOrderId) {
      const order = await ctx.db.get(schedule.partsOrderId);
      if (order) {
        await ctx.db.patch(schedule.partsOrderId, { status: "completed", completedAt: now, updatedAt: now });
      }
    }

    return null;
  },
});