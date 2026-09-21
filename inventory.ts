import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getViewer } from "./auth";

const inventoryReturnValidator = v.object({
  _id: v.id("inventory"),
  _creationTime: v.number(),
  category: v.string(),
  make: v.string(),
  model: v.string(),
  year: v.number(),
  variant: v.optional(v.string()),
  color: v.optional(v.string()),
  vin: v.optional(v.string()),
  price: v.optional(v.number()),
  discountAmount: v.optional(v.number()),
  cashbackAmount: v.optional(v.number()),
  specialLabel: v.optional(v.string()),
  specialNotes: v.optional(v.string()),
  specialPrice: v.optional(v.number()),
  status: v.string(),
  imageUrls: v.array(v.string()),
  isAvailable: v.boolean(),
  notes: v.optional(v.string()),
  sourceName: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  sourceLocation: v.optional(v.string()),
  lastSyncedAt: v.optional(v.number()),
  ownerUserId: v.optional(v.string()),
});

function mapInventoryItem(item: any, urls: string[]) {
  return {
    _id: item._id,
    _creationTime: item._creationTime,
    category: item.category ?? "Uncategorized",
    make: item.make ?? "",
    model: item.model ?? "",
    year: typeof item.year === "number" ? item.year : new Date().getFullYear(),
    variant: item.variant,
    color: item.color,
    vin: item.vin,
    price: item.price,
    discountAmount: item.discountAmount,
    cashbackAmount: item.cashbackAmount,
    specialLabel: item.specialLabel,
    specialNotes: item.specialNotes,
    specialPrice: item.specialPrice,
    status: item.status ?? "available",
    imageUrls: urls,
    isAvailable: item.isAvailable ?? ((item.status ?? "available") === "available"),
    notes: item.notes,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    sourceLocation: item.sourceLocation,
    lastSyncedAt: item.lastSyncedAt,
    ownerUserId: item.ownerUserId,
  };
}

async function collectInventoryItems(ctx: any, items: any[]) {
  return await Promise.all(
    items.map(async (item) => {
      const urls: string[] = [...(item.storedImageUrls ?? [])];
      if (item.imageIds && item.imageIds.length > 0) {
        const resolvedUrls = await Promise.all(
          item.imageIds.slice(0, 10).map(async (id: any) => {
            try {
              return await ctx.storage.getUrl(id);
            } catch {
              return null;
            }
          })
        );
        for (const u of resolvedUrls) {
          if (u && !urls.includes(u)) urls.push(u);
        }
      }
      if (item.imageUrl && !urls.includes(item.imageUrl)) {
        urls.push(item.imageUrl);
      }
      return mapInventoryItem(item, urls);
    })
  );
}

function dedupeInventoryRows(rows: any[]) {
  return rows.filter((item, index, arr) => arr.findIndex((row) => String(row._id) === String(item._id)) === index);
}

export const listBookable = query({
  args: {},
  returns: v.array(inventoryReturnValidator),
  handler: async (ctx) => {
    const categories = ["New Cars", "Used Cars"];
    const rows: any[] = [];

    for (const category of categories) {
      const items = await ctx.db
        .query("inventory")
        .withIndex("by_category", (q) => q.eq("category", category))
        .order("desc")
        .take(100);
      rows.push(...items);
    }

    rows.sort((a, b) => b._creationTime - a._creationTime);
    return await collectInventoryItems(ctx, rows);
  },
});

export const list = query({
  args: {
    categoryFilter: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(inventoryReturnValidator),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 10);
    let items;
    if (args.categoryFilter) {
      items = await ctx.db
        .query("inventory")
        .withIndex("by_category", (q) => q.eq("category", args.categoryFilter!))
        .order("desc")
        .take(limit);
    } else {
      items = await ctx.db
        .query("inventory")
        .order("desc")
        .take(limit);
    }

    return await collectInventoryItems(ctx, items);
  },
});

export const listPaged = query({
  args: {
    categoryFilter: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(inventoryReturnValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const paged = args.categoryFilter
      ? await ctx.db
          .query("inventory")
          .withIndex("by_category", (q) => q.eq("category", args.categoryFilter!))
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("inventory")
          .order("desc")
          .paginate(args.paginationOpts);

    const page = await collectInventoryItems(ctx, paged.page);

    return {
      page,
      isDone: paged.isDone,
      continueCursor: paged.continueCursor,
    };
  },
});

async function getCurrentUser(ctx: any) {
  const viewer = await getViewer(ctx);
  if (!viewer) return null;
  return {
    identity: viewer.identity,
    userId: String(viewer.userId),
    user: viewer.user,
    scopeIds: Array.from(new Set([String(viewer.userId), String(viewer.identity.subject)])),
  };
}

function getScopeIds(current: any) {
  return Array.from(new Set([
    ...(Array.isArray(current?.scopeIds) ? current.scopeIds : []),
    ...(current?.userId ? [String(current.userId)] : []),
    ...(current?.identity?.subject ? [String(current.identity.subject)] : []),
  ].filter(Boolean)));
}

function canManageInventoryItem(current: any, item: any) {
  if (!current) return false;
  if (String(current.user?.email ?? "").trim().toLowerCase() === "vincentmm@hyundai.co.za" || current.user?.staffRole === "dp" || current.user?.staffRole === "regional" || current.user?.staffRole === "regional_manager") return true;
  const scopeIds = getScopeIds(current);
  return scopeIds.some((scopeId) => [item.ownerUserId, item.addedBy].map(String).includes(String(scopeId)));
}

function canWriteInventory(current: any) {
  const role = String(current?.user?.staffRole ?? current?.user?.role ?? "").trim().toLowerCase();
  return Boolean(current?.user && (String(current.user?.email ?? "").trim().toLowerCase() === "vincentmm@hyundai.co.za" || current.user.staffRole === "dp" || role === "inventory_controller"));
}

export const listMyUploads = query({
  args: {},
  returns: v.array(inventoryReturnValidator),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const scopeIds = getScopeIds(current);
    const owned = await Promise.all(scopeIds.map((scopeId) =>
      ctx.db.query("inventory").withIndex("by_ownerUserId", (q: any) => q.eq("ownerUserId", scopeId)).collect()
    ));
    const legacy = await Promise.all(scopeIds.map((scopeId) =>
      ctx.db.query("inventory").withIndex("by_addedBy", (q: any) => q.eq("addedBy", scopeId)).collect()
    ));

    const merged = [...owned.flat(), ...legacy.flat()]
      .filter((row: any, index: number, arr: any[]) => arr.findIndex((candidate: any) => String(candidate._id) === String(row._id)) === index)
      .sort((a: any, b: any) => b._creationTime - a._creationTime);

    return await collectInventoryItems(ctx, merged);
  },
});

export const backfillLegacyOwnership = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const scopeIds = getScopeIds(current);
    const all = await ctx.db.query("inventory").collect();
    let updated = 0;
    for (const item of all) {
      const currentOwner = String(item.ownerUserId ?? item.addedBy ?? "");
      if (currentOwner && scopeIds.includes(currentOwner) && !item.ownerUserId) {
        await ctx.db.patch(item._id, { ownerUserId: current.userId });
        updated++;
      }
    }
    return updated;
  },
});

export const listGrandI10 = query({
  args: {},
  returns: v.array(inventoryReturnValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query("inventory").withIndex("by_make", (q) => q.eq("make", "Hyundai")).take(500);
    const matches = rows.filter((item: any) => {
      const model = String(item.model ?? "").toUpperCase();
      const variant = String(item.variant ?? "").toUpperCase();
      return model.includes("GRAND I10") || model.includes("GRAND I-10") || variant.includes("GRAND I10") || variant.includes("GRAND I-10");
    });

    return await collectInventoryItems(ctx, matches);
  },
});

export const markAllInventoryAvailable = mutation({
  args: {},
  returns: v.object({ updated: v.number() }),
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    if (!canWriteInventory(viewer)) throw new Error("Not authorized");

    const rows = await ctx.db.query("inventory").take(1000);
    for (const item of rows) {
      await ctx.db.patch(item._id, {
        status: "available",
        isAvailable: true,
      });
    }

    return { updated: rows.length };
  },
});

export const syncApprovedCatalogs = mutation({
  args: {},
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    if (!canWriteInventory(viewer)) throw new Error("Not authorized");

    const rows = await ctx.db.query("inventory").take(1000);
    const now = Date.now();
    let updated = 0;
    for (const item of rows) {
      await ctx.db.patch(item._id, { lastSyncedAt: now });
      updated += 1;
    }

    return { inserted: 0, updated };
  },
});

export const syncPublicStock = mutation({
  args: {
    items: v.array(v.object({
      category: v.string(),
      make: v.string(),
      model: v.string(),
      year: v.number(),
      variant: v.optional(v.string()),
      color: v.optional(v.string()),
      vin: v.optional(v.string()),
      price: v.optional(v.number()),
      discountAmount: v.optional(v.number()),
      cashbackAmount: v.optional(v.number()),
      specialLabel: v.optional(v.string()),
      specialNotes: v.optional(v.string()),
      specialPrice: v.optional(v.number()),
      status: v.optional(v.string()),
      isAvailable: v.optional(v.boolean()),
      notes: v.optional(v.string()),
      sourceName: v.optional(v.string()),
      sourceUrl: v.optional(v.string()),
      sourceLocation: v.optional(v.string()),
    })),
  },
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    if (!canWriteInventory(viewer)) throw new Error("Not authorized");

    let inserted = 0;
    let updated = 0;

    for (const incoming of args.items) {
      const existing = incoming.sourceUrl
        ? await ctx.db
            .query("inventory")
            .withIndex("by_sourceUrl", (q) => q.eq("sourceUrl", incoming.sourceUrl!))
            .first()
        : null;

      const payload = {
        category: incoming.category,
        make: incoming.make,
        model: incoming.model,
        year: incoming.year,
        variant: incoming.variant,
        color: incoming.color,
        vin: incoming.vin,
        price: incoming.price,
        discountAmount: incoming.discountAmount,
        cashbackAmount: incoming.cashbackAmount,
        specialLabel: incoming.specialLabel,
        specialNotes: incoming.specialNotes,
        specialPrice: incoming.specialPrice,
        status: incoming.status ?? "available",
        sourceName: incoming.sourceName,
        sourceUrl: incoming.sourceUrl,
        sourceLocation: incoming.sourceLocation,
        lastSyncedAt: Date.now(),
        isAvailable: incoming.isAvailable ?? (incoming.status === "available"),
        notes: incoming.notes,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
        updated += 1;
      } else {
        await ctx.db.insert("inventory", {
          ...payload,
          ownerUserId: viewer.userId,
          storedImageUrls: [],
          addedBy: viewer.userId,
        });
        inserted += 1;
      }
    }

    return { inserted, updated };
  },
});

export const loadStockBulk = mutation({
  args: {
    items: v.array(
      v.object({
        category: v.string(),
        make: v.string(),
        model: v.string(),
        year: v.number(),
        variant: v.optional(v.string()),
        color: v.optional(v.string()),
        vin: v.optional(v.string()),
        price: v.optional(v.number()),
        discountAmount: v.optional(v.number()),
        cashbackAmount: v.optional(v.number()),
        specialLabel: v.optional(v.string()),
        specialNotes: v.optional(v.string()),
        specialPrice: v.optional(v.number()),
        notes: v.optional(v.string()),
      }),
    ),
  },
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    if (!canWriteInventory(viewer)) throw new Error("Not authorized");

    let inserted = 0;
    for (const item of args.items) {
      await ctx.db.insert("inventory", {
        ownerUserId: viewer.userId,
        category: item.category,
        make: item.make,
        model: item.model,
        year: item.year,
        variant: item.variant,
        color: item.color,
        vin: item.vin,
        price: item.price,
        discountAmount: item.discountAmount,
        cashbackAmount: item.cashbackAmount,
        specialLabel: item.specialLabel,
        specialNotes: item.specialNotes,
        specialPrice: item.specialPrice,
        status: "available",
        storedImageUrls: [],
        isAvailable: true,
        notes: item.notes,
        addedBy: viewer.userId,
      });
      inserted += 1;
    }

    return { inserted };
  },
});

export const add = mutation({
  args: {
    category: v.string(),
    make: v.string(),
    model: v.string(),
    year: v.number(),
    variant: v.optional(v.string()),
    color: v.optional(v.string()),
    vin: v.optional(v.string()),
    price: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    cashbackAmount: v.optional(v.number()),
    specialLabel: v.optional(v.string()),
    specialNotes: v.optional(v.string()),
    specialPrice: v.optional(v.number()),
    status: v.string(),
    imageUrls: v.optional(v.array(v.string())),
    isAvailable: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  returns: v.id("inventory"),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    if (!canWriteInventory(viewer)) throw new Error("Not authorized");

    return await ctx.db.insert("inventory", {
      ownerUserId: viewer.userId,
      category: args.category,
      make: args.make,
      model: args.model,
      year: args.year,
      variant: args.variant,
      color: args.color,
      vin: args.vin,
      price: args.price,
      discountAmount: args.discountAmount,
      cashbackAmount: args.cashbackAmount,
      specialLabel: args.specialLabel,
      specialNotes: args.specialNotes,
      specialPrice: args.specialPrice,
      status: args.status,
      storedImageUrls: args.imageUrls ?? [],
      isAvailable: args.isAvailable ?? true,
      notes: args.notes,
      addedBy: viewer.userId,
    });
  },
});

// Add a photo URL to an existing item
export const addImageUrl = mutation({
  args: {
    itemId: v.id("inventory"),
    url: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    if (!canManageInventoryItem(viewer, item) && !canWriteInventory(viewer)) throw new Error("Not authorized");
    const existing = item.storedImageUrls ?? [];
    if (existing.length >= 10) throw new Error("Maximum 10 images per item");
    await ctx.db.patch(args.itemId, {
      storedImageUrls: [...existing, args.url],
    });
    return null;
  },
});

// Remove a photo URL from an item
export const removeImageUrl = mutation({
  args: {
    itemId: v.id("inventory"),
    url: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    if (!canManageInventoryItem(viewer, item) && !canWriteInventory(viewer)) throw new Error("Not authorized");
    const remaining = (item.storedImageUrls ?? []).filter((u) => u !== args.url);
    await ctx.db.patch(args.itemId, { storedImageUrls: remaining });
    return null;
  },
});

export const promoteImageUrl = mutation({
  args: {
    itemId: v.id("inventory"),
    url: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    if (!canManageInventoryItem(viewer, item) && !canWriteInventory(viewer)) throw new Error("Not authorized");
    const urls = (item.storedImageUrls ?? []).filter((u) => u !== args.url);
    await ctx.db.patch(args.itemId, {
      storedImageUrls: [args.url, ...urls],
    });
    return null;
  },
});

export const update = mutation({
  args: {
    itemId: v.id("inventory"),
    category: v.optional(v.string()),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    year: v.optional(v.number()),
    variant: v.optional(v.string()),
    color: v.optional(v.string()),
    vin: v.optional(v.string()),
    price: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    cashbackAmount: v.optional(v.number()),
    specialLabel: v.optional(v.string()),
    specialNotes: v.optional(v.string()),
    specialPrice: v.optional(v.number()),
    status: v.optional(v.string()),
    isAvailable: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");

    const { itemId, ...updates } = args;
    const item = await ctx.db.get(itemId);
    if (!item) throw new Error("Item not found");
    if (!canManageInventoryItem(viewer, item) && !canWriteInventory(viewer)) throw new Error("Not authorized");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered: Record<string, any> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) {
        filtered[key] = val;
      }
    }
    await ctx.db.patch(itemId, filtered);
    return null;
  },
});

// Toggle availability
export const toggleAvailability = mutation({
  args: {
    itemId: v.id("inventory"),
    isAvailable: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    if (!canWriteInventory(viewer)) throw new Error("Not authorized");
    await ctx.db.patch(args.itemId, {
      isAvailable: args.isAvailable,
      status: args.isAvailable ? "available" : "reserved",
    });
    return null;
  },
});

export const remove = mutation({
  args: { itemId: v.id("inventory") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    if (!canManageInventoryItem(viewer, item) && !canWriteInventory(viewer)) throw new Error("Not authorized");
    // Clean up any legacy stored images
    if (item?.imageIds) {
      for (const id of item.imageIds) {
        try { await ctx.storage.delete(id); } catch { /* ignore */ }
      }
    }
    await ctx.db.delete(args.itemId);
    return null;
  },
});

// Generate upload URL for device file uploads
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    if (!canWriteInventory(viewer)) throw new Error("Not authorized");
    return await ctx.storage.generateUploadUrl();
  },
});

// After uploading a file to storage, resolve its URL and store it on the inventory item
export const storeUploadedImage = mutation({
  args: {
    itemId: v.id("inventory"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    if (!canManageInventoryItem(viewer, item) && !canWriteInventory(viewer)) throw new Error("Not authorized");
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Could not resolve storage URL");
    const existing = item.storedImageUrls ?? [];
    if (existing.length >= 10) throw new Error("Maximum 10 images per item");
    await ctx.db.patch(args.itemId, {
      storedImageUrls: [...existing, url],
    });
    return null;
  },
});

// Upload file to storage and return the resolved URL (for new items before they're created)
export const uploadAndResolve = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    if (!canWriteInventory(viewer)) throw new Error("Not authorized");
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Could not resolve storage URL");
    return url;
  },
});

// Featured inventory for home/customer display
export const getFeaturedInventory = query({
  args: {
    shuffle: v.optional(v.boolean()),
  },
  returns: v.array(inventoryReturnValidator),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("inventory")
      .withIndex("by_category", (q) => q.eq("category", "New Cars"))
      .order("desc")
      .take(12);

    let featured = items;
    
    // Shuffle if requested using Fisher-Yates algorithm
    if (args.shuffle) {
      const shuffled = [...featured];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      featured = shuffled;
    }
    
    return await collectInventoryItems(ctx, featured);
  },
});