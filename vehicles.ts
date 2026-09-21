import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getViewer } from "./auth";

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

async function getCurrentUserKey(ctx: any) {
  const viewer = await getViewer(ctx);
  if (!viewer) return null;
  const user = viewer.user ?? (await findUserByIdentity(ctx, viewer.identity));
  return {
    identity: viewer.identity,
    user,
    userKey: String(user?._id ?? viewer.userId ?? viewer.identity.subject),
  };
}

async function listUserVehicles(ctx: any, identity: any, userKey: string) {
  const byUserId = await ctx.db
    .query("vehicles")
    .withIndex("by_userId", (q: any) => q.eq("userId", userKey))
    .collect();
  if (identity?.subject === userKey) return byUserId;

  const bySubject = await ctx.db
    .query("vehicles")
    .withIndex("by_userId", (q: any) => q.eq("userId", String(identity.subject)))
    .collect();

  const merged = [...byUserId, ...bySubject].filter((vehicle: any, index: number, array: any[]) =>
    index === array.findIndex((candidate) => String(candidate._id) === String(vehicle._id))
  );
  return merged;
}

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("vehicles"),
      _creationTime: v.number(),
      userId: v.string(),
      make: v.string(),
      model: v.string(),
      year: v.number(),
      registration: v.string(),
      color: v.optional(v.string()),
      mileage: v.optional(v.number()),
      isDefault: v.boolean(),
    })
  ),
  handler: async (ctx) => {
    const current = await getCurrentUserKey(ctx);
    if (!current) return [];
    const vehicles = await listUserVehicles(ctx, current.identity, current.userKey);
    return vehicles
      .filter((vehicle: any) => !vehicle.isDeleted)
      .map((vehicle: any) => ({
        _id: vehicle._id,
        _creationTime: vehicle._creationTime,
        userId: vehicle.userId,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        registration: vehicle.registration,
        color: vehicle.color,
        mileage: vehicle.mileage,
        isDefault: vehicle.isDefault,
      }));
  },
});

// Get vehicle by ID (even if soft-deleted, for booking history display)
export const getById = query({
  args: { vehicleId: v.id("vehicles") },
  returns: v.union(
    v.object({
      _id: v.id("vehicles"),
      _creationTime: v.number(),
      userId: v.string(),
      make: v.string(),
      model: v.string(),
      year: v.number(),
      registration: v.string(),
      color: v.optional(v.string()),
      mileage: v.optional(v.number()),
      isDefault: v.boolean(),
      isDeleted: v.optional(v.boolean()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const vehicle = await ctx.db.get(args.vehicleId);
    if (!vehicle) return null;
    return {
      _id: vehicle._id,
      _creationTime: vehicle._creationTime,
      userId: vehicle.userId,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      registration: vehicle.registration,
      color: vehicle.color,
      mileage: vehicle.mileage,
      isDefault: vehicle.isDefault,
      isDeleted: vehicle.isDeleted,
    };
  },
});

export const add = mutation({
  args: {
    make: v.string(),
    model: v.string(),
    year: v.number(),
    registration: v.string(),
    color: v.optional(v.string()),
    mileage: v.optional(v.number()),
  },
  returns: v.id("vehicles"),
  handler: async (ctx, args) => {
    const current = await getCurrentUserKey(ctx);
    if (!current) throw new Error("Not authenticated");

    const existing = await listUserVehicles(ctx, current.identity, current.userKey);
    const activeCount = existing.filter((vehicle: any) => !vehicle.isDeleted).length;
    const isDefault = activeCount === 0;

    return await ctx.db.insert("vehicles", {
      userId: current.userKey,
      make: args.make,
      model: args.model,
      year: args.year,
      registration: args.registration,
      color: args.color,
      mileage: args.mileage,
      isDefault,
      isDeleted: false,
    });
  },
});

export const setDefault = mutation({
  args: { vehicleId: v.id("vehicles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUserKey(ctx);
    if (!current) throw new Error("Not authenticated");

    const vehicles = await listUserVehicles(ctx, current.identity, current.userKey);

    for (const vehicle of vehicles) {
      if (!vehicle.isDeleted) {
        await ctx.db.patch(vehicle._id, {
          isDefault: vehicle._id === args.vehicleId,
        });
      }
    }
    return null;
  },
});

// SOFT DELETE - vehicle data is NEVER destroyed
export const remove = mutation({
  args: { vehicleId: v.id("vehicles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUserKey(ctx);
    if (!current) throw new Error("Not authenticated");

    const vehicle = await ctx.db.get(args.vehicleId);
    if (!vehicle || String(vehicle.userId) !== String(current.userKey)) {
      throw new Error("Vehicle not found");
    }

    await ctx.db.patch(args.vehicleId, {
      isDeleted: true,
      isDefault: false,
    });

    if (vehicle.isDefault) {
      const remaining = await listUserVehicles(ctx, current.identity, current.userKey);
      const active = remaining.filter((vehicle: any) => !vehicle.isDeleted && vehicle._id !== args.vehicleId);
      if (active.length > 0) {
        await ctx.db.patch(active[0]._id, { isDefault: true });
      }
    }

    return null;
  },
});

// Restore a soft-deleted vehicle
export const restore = mutation({
  args: { vehicleId: v.id("vehicles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUserKey(ctx);
    if (!current) throw new Error("Not authenticated");

    const vehicle = await ctx.db.get(args.vehicleId);
    if (!vehicle || String(vehicle.userId) !== String(current.userKey)) {
      throw new Error("Vehicle not found");
    }

    await ctx.db.patch(args.vehicleId, { isDeleted: false });
    return null;
  },
});