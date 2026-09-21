import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getViewer, isAdminUser } from "./auth";
import { sendSMSToCustomer, sendWhatsAppToCustomer } from './emails';

const BRAND_VALUES = ["Hyundai", "Kia"] as const;
const CART_TYPES = ["merchandise", "parts"] as const;

type MerchandiseBrand = (typeof BRAND_VALUES)[number];

type CartType = (typeof CART_TYPES)[number];

function normalizeBrand(brand: string): MerchandiseBrand {
  return String(brand ?? "").trim().toLowerCase() === "kia" ? "Kia" : "Hyundai";
}

function normalizeCartType(cartType: string): CartType {
  return String(cartType ?? "merchandise").trim().toLowerCase() === "parts" ? "parts" : "merchandise";
}

function normalizeText(value: string) {
  return String(value ?? "").trim();
}

function normalizeSizeAllocations(value: Array<{ size?: string; quantity?: number }> | undefined) {
  return (value ?? [])
    .map((entry) => ({
      size: normalizeText(entry?.size ?? ""),
      quantity: Math.max(0, Math.floor(Number(entry?.quantity ?? 0))),
    }))
    .filter((entry) => Boolean(entry.size) && entry.quantity > 0);
}

function sumSizeAllocations(value: Array<{ size: string; quantity: number }> | undefined) {
  return (value ?? []).reduce((sum: number, entry: any) => sum + Math.max(0, Math.floor(Number(entry?.quantity ?? 0))), 0);
}

function canManageMerchandise(user: any) {
  const role = String(user?.role ?? user?.staffRole ?? "").trim().toLowerCase();
  return Boolean(
    user && (
      isAdminUser(user) ||
      user?.isOwner ||
      String(user?.email ?? "").trim().toLowerCase() === "vincentmm@hyundai.co.za" ||
      role === "staff" ||
      role === "admin" ||
      role === "sales" ||
      role === "sales_executive" ||
      role === "sales_manager" ||
      role === "service_advisor" ||
      role === "service_manager" ||
      role === "parts_manager" ||
      role === "accessories_manager" ||
      role === "parts_accessories_manager" ||
      Boolean(user?.staffRole)
    )
  );
}

async function safeGet(ctx: any, id: string | undefined | null) {
  if (!id) return null;
  try {
    return await ctx.db.get(id as any);
  } catch {
    return null;
  }
}

async function getCurrentUser(ctx: any) {
  const viewer = await getViewer(ctx);
  if (!viewer) return null;
  return viewer;
}

async function resolveUrls(ctx: any, storageIds?: Array<string | null | undefined>) {
  if (!storageIds?.length) return undefined;
  const urls = await Promise.all(
    storageIds.map(async (storageId) => {
      if (!storageId) return null;
      return await ctx.storage.getUrl(storageId as any);
    })
  );
  return urls.filter((url: string | null): url is string => Boolean(url));
}

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

export const resolveUploadedImage = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Could not resolve storage URL");
    return url;
  },
});

function mapItem(item: any, imageUrls: string[]) {
  return {
    _id: item._id,
    _creationTime: item._creationTime,
    brand: item.brand,
    title: item.title,
    description: item.description,
    category: item.category,
    sku: item.sku,
    price: item.price,
    stockQuantity: item.stockQuantity,
    isAvailable: item.isAvailable,
    isVisibleToCustomers: item.isVisibleToCustomers,
    imageUrls,
    imageStorageIds: item.imageStorageIds ?? [],
    sizeAllocations: item.sizeAllocations ?? [],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    createdByUserId: item.createdByUserId,
  };
}

function buildCompanyDetails(brand: MerchandiseBrand) {
  return brand === "Kia"
    ? "Kia dealership company details and banking details"
    : "Hyundai dealership company details and banking details";
}

function buildInvoiceNumber(prefix: MerchandiseBrand, id: string, createdAt: number) {
  const day = new Date(createdAt).toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix.slice(0, 1).toUpperCase()}-${day}-${String(id).slice(-6).toUpperCase()}`;
}

function mapOrder(order: any) {
  return {
    _id: order._id,
    _creationTime: order._creationTime,
    userId: order.userId,
    brand: order.brand,
    merchandiseItemId: order.merchandiseItemId,
    itemTitle: order.itemTitle,
    itemDescription: order.itemDescription,
    itemImageUrls: order.itemImageUrls,
    sku: order.sku,
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    subtotalAmount: order.subtotalAmount,
    deliveryFee: order.deliveryFee,
    totalAmount: order.totalAmount,
    invoiceNumber: order.invoiceNumber,
    invoiceSentAt: order.invoiceSentAt,
    companyDetails: order.companyDetails,
    fulfillmentType: order.fulfillmentType,
    deliveryAddress: order.deliveryAddress,
    contactPreference: order.contactPreference,
    notes: order.notes,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    bankingDetails: order.bankingDetails,
    status: order.status,
    paymentProofStorageIds: order.paymentProofStorageIds,
    paymentProofNames: order.paymentProofNames,
    paymentProofTypes: order.paymentProofTypes,
    paymentProofUrls: order.paymentProofUrls,
    paymentProofSubmittedAt: order.paymentProofSubmittedAt,
    paymentConfirmedAt: order.paymentConfirmedAt,
    receivedByUserId: order.receivedByUserId,
    receivedByName: order.receivedByName,
    availabilityConfirmedByUserId: order.availabilityConfirmedByUserId,
    availabilityConfirmedByName: order.availabilityConfirmedByName,
    completedAt: order.completedAt,
    fulfilledAt: order.fulfilledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    acknowledgedAt: order.acknowledgedAt,
  };
}

const itemReturn = v.object({
  _id: v.id("merchandiseItems"),
  _creationTime: v.number(),
  brand: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  category: v.optional(v.string()),
  sku: v.optional(v.string()),
  price: v.optional(v.number()),
  stockQuantity: v.number(),
  isAvailable: v.boolean(),
  isVisibleToCustomers: v.optional(v.boolean()),
  imageUrls: v.array(v.string()),
  imageStorageIds: v.optional(v.array(v.id("_storage"))),
  sizeAllocations: v.optional(v.array(v.object({
    size: v.string(),
    quantity: v.number(),
  }))),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
  createdByUserId: v.optional(v.string()),
});

const categoryReturn = v.object({
  _id: v.id("merchandiseCategories"),
  _creationTime: v.number(),
  brand: v.string(),
  name: v.string(),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
  createdByUserId: v.optional(v.string()),
});

const orderReturn = v.object({
  _id: v.id("merchandiseOrders"),
  _creationTime: v.number(),
  userId: v.string(),
  brand: v.string(),
  merchandiseItemId: v.id("merchandiseItems"),
  itemTitle: v.string(),
  itemDescription: v.optional(v.string()),
  itemImageUrls: v.optional(v.array(v.string())),
  sku: v.optional(v.string()),
  quantity: v.number(),
  unitPrice: v.number(),
  subtotalAmount: v.optional(v.number()),
  deliveryFee: v.optional(v.number()),
  totalAmount: v.number(),
  invoiceNumber: v.optional(v.string()),
  invoiceSentAt: v.optional(v.number()),
  companyDetails: v.optional(v.string()),
  fulfillmentType: v.string(),
  deliveryAddress: v.optional(v.string()),
  contactPreference: v.optional(v.string()),
  notes: v.optional(v.string()),
  customerName: v.string(),
  customerPhone: v.string(),
  bankingDetails: v.optional(v.string()),
  status: v.string(),
  paymentProofStorageIds: v.optional(v.array(v.id("_storage"))),
  paymentProofNames: v.optional(v.array(v.string())),
  paymentProofTypes: v.optional(v.array(v.string())),
  paymentProofUrls: v.optional(v.array(v.string())),
  paymentProofSubmittedAt: v.optional(v.number()),
  paymentConfirmedAt: v.optional(v.number()),
  receivedByUserId: v.optional(v.string()),
  receivedByName: v.optional(v.string()),
  availabilityConfirmedByUserId: v.optional(v.string()),
  availabilityConfirmedByName: v.optional(v.string()),
  fulfilledAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  acknowledgedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
});

const cartItemReturn = v.object({
  _id: v.id("shoppingCartItems"),
  _creationTime: v.number(),
  userId: v.string(),
  cartType: v.string(),
  brand: v.optional(v.string()),
  merchandiseItemId: v.optional(v.id("merchandiseItems")),
  title: v.string(),
  description: v.optional(v.string()),
  sku: v.optional(v.string()),
  unitPrice: v.number(),
  quantity: v.number(),
  customerName: v.optional(v.string()),
  customerPhone: v.optional(v.string()),
  vehicleVin: v.optional(v.string()),
  yearModel: v.optional(v.string()),
  contactDetails: v.optional(v.string()),
  orderType: v.optional(v.string()),
  itemDescription: v.optional(v.string()),
  referencePhotos: v.optional(v.array(v.string())),
  fulfillmentType: v.optional(v.string()),
  deliveryAddress: v.optional(v.string()),
  dropOffAddress: v.optional(v.string()),
  contactPreference: v.optional(v.string()),
  notes: v.optional(v.string()),
  imageUrls: v.optional(v.array(v.string())),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listCategoriesByBrand = query({
  args: { brand: v.string() },
  returns: v.array(categoryReturn),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    const brand = normalizeBrand(args.brand);
    const categories = await ctx.db
      .query("merchandiseCategories")
      .withIndex("by_brand", (q: any) => q.eq("brand", brand))
      .order("asc")
      .collect();
    return categories.map((category: any) => ({
      _id: category._id,
      _creationTime: category._creationTime,
      brand: category.brand,
      name: category.name,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      createdByUserId: category.createdByUserId,
    }));
  },
});

export const createCategory = mutation({
  args: {
    brand: v.string(),
    name: v.string(),
  },
  returns: v.id("merchandiseCategories"),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current?.user || !canManageMerchandise(current.user)) throw new Error("Not authorized");

    const brand = normalizeBrand(args.brand);
    const name = normalizeText(args.name);
    if (!name) throw new Error("Category name is required");

    const existing = await ctx.db
      .query("merchandiseCategories")
      .withIndex("by_brand_and_name", (q: any) => q.eq("brand", brand).eq("name", name))
      .unique();
    if (existing) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("merchandiseCategories", {
      brand,
      name,
      createdByUserId: current.userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listItemsByBrand = query({
  args: {
    brand: v.string(),
  },
  returns: v.array(itemReturn),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const brand = normalizeBrand(args.brand);
    const items = current?.user && canManageMerchandise(current.user)
      ? await ctx.db.query("merchandiseItems").withIndex("by_brand", (q: any) => q.eq("brand", brand)).order("desc").collect()
      : await ctx.db.query("merchandiseItems").withIndex("by_brand_and_isAvailable", (q: any) => q.eq("brand", brand).eq("isAvailable", true)).order("desc").collect();

    const rows = await Promise.all(items.map(async (item: any) => {
      const imageUrls = await resolveUrls(ctx, item.imageStorageIds);
      return mapItem(item, imageUrls ?? item.imageUrls ?? []);
    }));

    return current?.user && canManageMerchandise(current.user)
      ? rows
      : rows.filter((item: any) => item.isVisibleToCustomers !== false);
  },
});

export const listCart = query({
  args: {
    cartType: v.string(),
  },
  returns: v.array(cartItemReturn),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const cartType = normalizeCartType(args.cartType);
    const items = await ctx.db
      .query("shoppingCartItems")
      .withIndex("by_userId_and_cartType", (q: any) => q.eq("userId", current.userId).eq("cartType", cartType))
      .order("desc")
      .collect();

    return items.map((item: any) => ({
      _id: item._id,
      _creationTime: item._creationTime,
      userId: item.userId,
      cartType: item.cartType,
      brand: item.brand,
      merchandiseItemId: item.merchandiseItemId,
      title: item.title,
      description: item.description,
      sku: item.sku,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      customerName: item.customerName,
      customerPhone: item.customerPhone,
      vehicleVin: item.vehicleVin,
      yearModel: item.yearModel,
      contactDetails: item.contactDetails,
      orderType: item.orderType,
      itemDescription: item.itemDescription,
      referencePhotos: item.referencePhotos,
      fulfillmentType: item.fulfillmentType,
      deliveryAddress: item.deliveryAddress,
      dropOffAddress: item.dropOffAddress,
      contactPreference: item.contactPreference,
      notes: item.notes,
      imageUrls: item.imageUrls,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  },
});

export const searchItems = query({
  args: {
    brand: v.string(),
    query: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  returns: v.array(itemReturn),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const brand = normalizeBrand(args.brand);
    const queryText = normalizeText(args.query ?? "").toLowerCase();
    const categoryText = normalizeText(args.category ?? "").toLowerCase();

    const items = current?.user && canManageMerchandise(current.user)
      ? await ctx.db.query("merchandiseItems").withIndex("by_brand", (q: any) => q.eq("brand", brand)).order("desc").collect()
      : await ctx.db.query("merchandiseItems").withIndex("by_brand_and_isAvailable", (q: any) => q.eq("brand", brand).eq("isAvailable", true)).order("desc").collect();

    const filtered = items.filter((item: any) => {
      const title = String(item.title ?? "").toLowerCase();
      const description = String(item.description ?? "").toLowerCase();
      const sku = String(item.sku ?? "").toLowerCase();
      const itemCategory = String(item.category ?? "").toLowerCase();
      const matchesQuery = !queryText || title.includes(queryText) || description.includes(queryText) || sku.includes(queryText) || itemCategory.includes(queryText);
      const matchesCategory = !categoryText || itemCategory === categoryText;
      return matchesQuery && matchesCategory;
    });

    const rows = await Promise.all(filtered.map(async (item: any) => {
      const imageUrls = await resolveUrls(ctx, item.imageStorageIds);
      return mapItem(item, imageUrls ?? item.imageUrls ?? []);
    }));

    return current?.user && canManageMerchandise(current.user)
      ? rows
      : rows.filter((item: any) => item.isVisibleToCustomers !== false);
  },
});

export const listOrdersByBrand = query({
  args: {
    brand: v.string(),
  },
  returns: v.array(orderReturn),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    const brand = normalizeBrand(args.brand);
    const isStaff = canManageMerchandise(current.user);

    const orders = isStaff
      ? await ctx.db.query("merchandiseOrders").withIndex("by_brand", (q: any) => q.eq("brand", brand)).order("desc").collect()
      : await ctx.db.query("merchandiseOrders").withIndex("by_userId", (q: any) => q.eq("userId", current.userId)).order("desc").collect();

    return orders.map(mapOrder);
  },
});

export const addItem = mutation({
  args: {
    brand: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    sku: v.optional(v.string()),
    price: v.number(),
    stockQuantity: v.number(),
    isVisibleToCustomers: v.optional(v.boolean()),
    imageUrls: v.optional(v.array(v.string())),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
    sizeAllocations: v.optional(v.array(v.object({
      size: v.string(),
      quantity: v.number(),
    }))),
  },
  returns: v.id("merchandiseItems"),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current?.user || !canManageMerchandise(current.user)) throw new Error("Not authorized");

    const now = Date.now();
    const sizeAllocations = normalizeSizeAllocations(args.sizeAllocations);
    const stockQuantity = sizeAllocations.length > 0 ? sumSizeAllocations(sizeAllocations) : Math.max(0, Math.floor(args.stockQuantity));
    return await ctx.db.insert("merchandiseItems", {
      brand: normalizeBrand(args.brand),
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      category: args.category?.trim() || undefined,
      sku: args.sku?.trim() || undefined,
      price: args.price,
      stockQuantity,
      isAvailable: stockQuantity > 0,
      isVisibleToCustomers: args.isVisibleToCustomers ?? false,
      imageUrls: args.imageUrls ?? [],
      imageStorageIds: args.imageStorageIds,
      sizeAllocations: sizeAllocations.length > 0 ? sizeAllocations : undefined,
      createdByUserId: current.userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateItem = mutation({
  args: {
    itemId: v.id("merchandiseItems"),
    brand: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    sku: v.optional(v.string()),
    price: v.optional(v.number()),
    stockQuantity: v.optional(v.number()),
    isAvailable: v.optional(v.boolean()),
    isVisibleToCustomers: v.optional(v.boolean()),
    imageUrls: v.optional(v.array(v.string())),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
    sizeAllocations: v.optional(v.array(v.object({
      size: v.string(),
      quantity: v.number(),
    }))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current?.user || !canManageMerchandise(current.user)) throw new Error("Not authorized");

    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    const sizeAllocations = args.sizeAllocations !== undefined ? normalizeSizeAllocations(args.sizeAllocations) : item.sizeAllocations ?? [];
    const stockQuantity = sizeAllocations.length > 0 ? sumSizeAllocations(sizeAllocations) : (args.stockQuantity !== undefined ? Math.max(0, Math.floor(args.stockQuantity)) : item.stockQuantity);
 
     await ctx.db.patch(args.itemId, {
       brand: args.brand ? normalizeBrand(args.brand) : item.brand,
       title: args.title?.trim() ?? item.title,
       description: args.description !== undefined ? args.description?.trim() || undefined : item.description,
       category: args.category !== undefined ? args.category?.trim() || undefined : item.category,
       sku: args.sku !== undefined ? args.sku?.trim() || undefined : item.sku,
       price: args.price ?? item.price,
       stockQuantity,
       isAvailable: args.isAvailable ?? stockQuantity > 0,
       isVisibleToCustomers: args.isVisibleToCustomers ?? item.isVisibleToCustomers ?? false,
       imageUrls: args.imageUrls ?? item.imageUrls,
       imageStorageIds: args.imageStorageIds ?? item.imageStorageIds,
       sizeAllocations: sizeAllocations.length > 0 ? sizeAllocations : undefined,
       updatedAt: Date.now(),
     });
     return null;
   },
});

export const removeItem = mutation({
  args: {
    itemId: v.id("merchandiseItems"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current?.user || !canManageMerchandise(current.user)) throw new Error("Not authorized");
    await ctx.db.delete(args.itemId);
    return null;
  },
});

export const submitOrder = mutation({
  args: {
    merchandiseItemId: v.id("merchandiseItems"),
    quantity: v.number(),
    fulfillmentType: v.string(),
    deliveryAddress: v.optional(v.string()),
    contactPreference: v.optional(v.string()),
    notes: v.optional(v.string()),
    customerName: v.string(),
    customerPhone: v.string(),
  },
  returns: v.id("merchandiseOrders"),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const item = await ctx.db.get(args.merchandiseItemId);
    if (!item) throw new Error("Item not found");
    if (!item.isAvailable || item.stockQuantity <= 0) throw new Error("Item is not available");

    const quantity = Math.max(1, Math.floor(args.quantity));
    if (quantity > Number(item.stockQuantity ?? 0)) {
      throw new Error("Not enough stock available");
    }

    const unitPrice = Number(item.price ?? 0);
    const totalAmount = unitPrice * quantity;
    const now = Date.now();

    const orderId = await ctx.db.insert("merchandiseOrders", {
      userId: current.userId,
      brand: item.brand,
      merchandiseItemId: args.merchandiseItemId,
      itemTitle: item.title,
      itemDescription: item.description,
      itemImageUrls: item.imageUrls,
      sku: item.sku,
      quantity,
      unitPrice,
      totalAmount,
      fulfillmentType: args.fulfillmentType,
      deliveryAddress: args.fulfillmentType === 'delivery' ? args.deliveryAddress : undefined,
      contactPreference: args.contactPreference,
      notes: args.notes,
      customerName: args.customerName.trim(),
      customerPhone: args.customerPhone.trim(),
      status: 'submitted',
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('notifications', {
      userId: current.userId,
      type: 'merchandise_order_received',
      title: 'Merchandise order submitted',
      message: `Your order for ${item.title} was sent to the dealership.`,
      targetRoute: item.brand === 'Kia' ? 'KiaMerchandise' : 'HyundaiMerchandise',
      targetId: String(orderId),
      isRead: false,
    });

    for (const recipientId of await getOperationalRecipients(ctx)) {
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
        userId: recipientId,
        title: 'New Merchandise Order',
        message: `${args.customerName.trim()} ordered ${item.title}.`,
      });
    }

    await notifyMerchandiseDepartmentEmails(
      ctx,
      'New Merchandise Order',
      `${args.customerName.trim()} ordered ${item.title}.`
    );

    return orderId;
  },
});

export const listMine = query({
  args: {
    brand: v.string(),
  },
  returns: v.array(orderReturn),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    const brand = normalizeBrand(args.brand);
    const orders = await ctx.db.query("merchandiseOrders").withIndex("by_userId", (q: any) => q.eq("userId", current.userId)).order("desc").collect();
    return orders.filter((order: any) => order.brand === brand).map(mapOrder);
  },
});

async function getPartsCartItems(ctx: any, userId: string) {
  return await ctx.db
    .query("shoppingCartItems")
    .withIndex("by_userId_and_cartType", (q: any) => q.eq("userId", userId).eq("cartType", "parts"))
    .order("desc")
    .collect();
}

async function getMerchandiseCartItems(ctx: any, userId: string) {
  return await ctx.db
    .query("shoppingCartItems")
    .withIndex("by_userId_and_cartType", (q: any) => q.eq("userId", userId).eq("cartType", "merchandise"))
    .order("desc")
    .collect();
}

async function getOperationalRecipients(ctx: any) {
  const users = await ctx.db.query("users").collect();
  const recipients = new Set<string>();
  for (const user of users) {
    const email = String(user?.email ?? "").trim().toLowerCase();
    const role = String(user?.role ?? user?.staffRole ?? "").trim().toLowerCase();
    const isOperational = Boolean(
      user?.isOwner ||
      email === "vincentmm@hyundai.co.za" ||
      role.includes("merchandise") ||
      role.includes("parts") ||
      role === "staff" ||
      role === "admin" ||
      email === "vincentmm@hyundai.co.za"
    );
    if (isOperational && !user?.isDeleted) recipients.add(String(user._id));
  }
  return [...recipients];
}

async function notifyMerchandiseDepartmentEmails(ctx: any, title: string, message: string) {
  const recipients = await getOperationalRecipients(ctx);
  for (const userId of recipients) {
    await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
      userId,
      title,
      message,
    });
  }
}

function buildPartsOrderMessage(args: {
  customerName: string;
  customerPhone: string;
  vehicleVin: string;
  yearModel?: string;
  orderType: string;
  itemDescription: string;
  fulfillmentType: string;
  dropOffAddress?: string;
  contactPreference?: string;
  notes?: string;
}) {
  return [
    "New parts/accessories order",
    `Customer: ${args.customerName}`,
    `Phone: ${args.customerPhone}`,
    `VIN: ${args.vehicleVin}`,
    args.yearModel ? `Year/Model: ${args.yearModel}` : null,
    `Need: ${args.orderType}`,
    `Items: ${args.itemDescription}`,
    `Fulfillment: ${args.fulfillmentType}`,
    args.dropOffAddress ? `Delivery location: ${args.dropOffAddress}` : null,
    args.contactPreference ? `Preferred contact: ${args.contactPreference}` : null,
    args.notes ? `Notes: ${args.notes}` : null,
  ].filter(Boolean).join("\n");
}

export const addToCart = mutation({
  args: {
    cartType: v.string(),
    brand: v.optional(v.string()),
    merchandiseItemId: v.optional(v.id("merchandiseItems")),
    title: v.string(),
    description: v.optional(v.string()),
    sku: v.optional(v.string()),
    unitPrice: v.number(),
    quantity: v.number(),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    vehicleVin: v.optional(v.string()),
    yearModel: v.optional(v.string()),
    contactDetails: v.optional(v.string()),
    orderType: v.optional(v.string()),
    itemDescription: v.optional(v.string()),
    referencePhotos: v.optional(v.array(v.string())),
    fulfillmentType: v.optional(v.string()),
    deliveryAddress: v.optional(v.string()),
    dropOffAddress: v.optional(v.string()),
    contactPreference: v.optional(v.string()),
    notes: v.optional(v.string()),
    imageUrls: v.optional(v.array(v.string())),
  },
  returns: v.id("shoppingCartItems"),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const now = Date.now();
    return await ctx.db.insert("shoppingCartItems", {
      userId: current.userId,
      cartType: normalizeCartType(args.cartType),
      brand: args.brand ? normalizeBrand(args.brand) : undefined,
      merchandiseItemId: args.merchandiseItemId,
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      sku: args.sku?.trim() || undefined,
      unitPrice: args.unitPrice,
      quantity: Math.max(1, Math.floor(args.quantity)),
      customerName: args.customerName?.trim() || undefined,
      customerPhone: args.customerPhone?.trim() || undefined,
      vehicleVin: args.vehicleVin?.trim() || undefined,
      yearModel: args.yearModel?.trim() || undefined,
      contactDetails: args.contactDetails?.trim() || undefined,
      orderType: args.orderType?.trim() || undefined,
      itemDescription: args.itemDescription?.trim() || undefined,
      referencePhotos: args.referencePhotos,
      fulfillmentType: args.fulfillmentType,
      deliveryAddress: args.deliveryAddress?.trim() || undefined,
      dropOffAddress: args.dropOffAddress?.trim() || undefined,
      contactPreference: args.contactPreference,
      notes: args.notes?.trim() || undefined,
      imageUrls: args.imageUrls,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCartItem = mutation({
  args: {
    cartItemId: v.id("shoppingCartItems"),
    quantity: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    const item = await ctx.db.get(args.cartItemId);
    if (!item) throw new Error("Cart item not found");
    if (String(item.userId) !== String(current.userId)) throw new Error("Not authorized");
    await ctx.db.patch(args.cartItemId, {
      quantity: Math.max(1, Math.floor(args.quantity)),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const removeCartItem = mutation({
  args: {
    cartItemId: v.id("shoppingCartItems"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    const item = await ctx.db.get(args.cartItemId);
    if (!item) throw new Error("Cart item not found");
    if (String(item.userId) !== String(current.userId)) throw new Error("Not authorized");
    await ctx.db.delete(args.cartItemId);
    return null;
  },
});

export const clearCart = mutation({
  args: {
    cartType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    const cartType = normalizeCartType(args.cartType);
    const items = await ctx.db
      .query("shoppingCartItems")
      .withIndex("by_userId_and_cartType", (q: any) => q.eq("userId", current.userId).eq("cartType", cartType))
      .order("desc")
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }
    return null;
  },
});

export const checkoutCart = mutation({
  args: {
    cartType: v.string(),
    customerName: v.string(),
    customerPhone: v.string(),
  },
  returns: v.array(v.id("merchandiseOrders")),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    const cartType = normalizeCartType(args.cartType);
    if (cartType !== "merchandise") throw new Error("Use checkoutPartsCart for parts orders");

    const items = await getMerchandiseCartItems(ctx, current.userId);
    const createdOrderIds: Array<any> = [];
    const recipients = await getOperationalRecipients(ctx);

    for (const item of items) {
      const merchandiseItem = item.merchandiseItemId ? await ctx.db.get(item.merchandiseItemId) : null;
      if (!merchandiseItem) continue;
      const quantity = Math.max(1, Math.floor(Number(item.quantity ?? 1)));
      const totalAmount = Number(item.unitPrice ?? 0) * quantity;
      const orderId = await ctx.db.insert("merchandiseOrders", {
        userId: current.userId,
        brand: merchandiseItem.brand,
        merchandiseItemId: merchandiseItem._id,
        itemTitle: merchandiseItem.title,
        itemDescription: merchandiseItem.description,
        itemImageUrls: merchandiseItem.imageUrls,
        sku: merchandiseItem.sku,
        quantity,
        unitPrice: Number(item.unitPrice ?? 0),
        subtotalAmount: totalAmount,
        totalAmount,
        fulfillmentType: item.fulfillmentType ?? "collection",
        deliveryAddress: item.fulfillmentType === "delivery" ? item.deliveryAddress : undefined,
        contactPreference: item.contactPreference,
        notes: item.notes,
        customerName: args.customerName.trim(),
        customerPhone: args.customerPhone.trim(),
        status: "submitted",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      createdOrderIds.push(orderId);

      for (const recipientId of recipients) {
        await ctx.db.insert("notifications", {
          userId: recipientId,
          type: "merchandise_order_received",
          title: "New merchandise order",
          message: `${args.customerName} ordered ${merchandiseItem.title}.`,
          targetRoute: merchandiseItem.brand === "Kia" ? "KiaMerchandise" : "HyundaiMerchandise",
          targetId: String(orderId),
          isRead: false,
        });
      }

      await ctx.db.insert("notifications", {
        userId: current.userId,
        type: "merchandise_order_received",
        title: "Order submitted",
        message: `Your order for ${merchandiseItem.title} was sent to the dealership.`,
        targetRoute: merchandiseItem.brand === "Kia" ? "KiaMerchandise" : "HyundaiMerchandise",
        targetId: String(orderId),
        isRead: false,
      });
    }

    return createdOrderIds;
  },
});

export const checkoutPartsCart = mutation({
  args: {
    customerName: v.string(),
    customerPhone: v.string(),
  },
  returns: v.array(v.id("partsOrders")),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const items = await getPartsCartItems(ctx, current.userId);
    const createdOrderIds: Array<any> = [];
    const recipients = await getOperationalRecipients(ctx);

    for (const item of items) {
      const vehicleVin = String(item.vehicleVin ?? "").trim();
      const itemDescription = String(item.itemDescription ?? item.title ?? "").trim();
      if (!vehicleVin || !itemDescription) continue;

      const orderId = await ctx.db.insert("partsOrders", {
        ownerUserId: current.userId,
        userId: current.userId,
        customerName: args.customerName.trim(),
        customerPhone: args.customerPhone.trim(),
        vehicleVin,
        yearModel: item.yearModel,
        contactDetails: item.contactDetails ?? args.customerPhone.trim(),
        orderType: item.orderType ?? "parts",
        itemDescription,
        referencePhotos: item.referencePhotos,
        fulfillmentType: item.fulfillmentType ?? "pickup",
        dropOffAddress: item.fulfillmentType === "drop_off" ? item.dropOffAddress ?? item.deliveryAddress : undefined,
        contactPreference: item.contactPreference,
        notes: item.notes,
        status: "submitted",
        reviewRequired: false,
        department: "parts",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      createdOrderIds.push(orderId);

      const messageBody = buildPartsOrderMessage({
        customerName: args.customerName.trim(),
        customerPhone: args.customerPhone.trim(),
        vehicleVin,
        yearModel: item.yearModel ?? undefined,
        orderType: item.orderType ?? "parts",
        itemDescription,
        fulfillmentType: item.fulfillmentType ?? "pickup",
        dropOffAddress: item.fulfillmentType === "drop_off" ? item.dropOffAddress ?? item.deliveryAddress : undefined,
        contactPreference: item.contactPreference ?? undefined,
        notes: item.notes ?? undefined,
      });

      for (const recipientId of recipients) {
        await ctx.db.insert("messages", {
          senderId: current.userId,
          senderName: args.customerName.trim(),
          senderRole: "customer",
          recipientId,
          partsOrderId: orderId,
          content: messageBody,
          isRead: false,
        });

        await ctx.db.insert("notifications", {
          userId: recipientId,
          type: "parts_order_received",
          title: "New Parts / Accessories Order",
          message: `${args.customerName.trim()} requested ${itemDescription} for VIN ${vehicleVin}.`,
          targetRoute: "PartsOrders",
          targetId: String(orderId),
          isRead: false,
        });
      }

      await ctx.db.insert("notifications", {
        userId: current.userId,
        type: "parts_order_received",
        title: "Order submitted",
        message: "Your parts/accessories request was sent to the dealership.",
        targetRoute: "PartsOrders",
        targetId: String(orderId),
        isRead: false,
      });

      await ctx.runMutation(internal.activityLog.logInternal, {
        ownerUserId: current.userId,
        type: "parts_order_submitted",
        title: "Parts Order Submitted",
        description: `${args.customerName.trim()} submitted a parts/accessory order for VIN ${vehicleVin}.`,
        customerName: args.customerName.trim(),
        customerPhone: args.customerPhone.trim(),
        metadata: JSON.stringify({ orderId: String(orderId), fulfillmentType: item.fulfillmentType ?? "pickup", orderType: item.orderType ?? "parts", vehicleVin, yearModel: item.yearModel ?? undefined, contactPreference: item.contactPreference ?? undefined }),
        triggeredBy: current.userId,
      });
    }

    return createdOrderIds;
  },
});

export const receiveOrder = mutation({
  args: {
    orderId: v.id("merchandiseOrders"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current?.user || !canManageMerchandise(current.user)) throw new Error("Not authorized");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    await ctx.db.patch(args.orderId, {
      status: 'received',
      receivedByUserId: current.userId,
      receivedByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Staff',
      acknowledgedAt: order.acknowledgedAt ?? Date.now(),
      updatedAt: Date.now(),
    });

    const customerUser = await safeGet(ctx, order.userId);
    const customerMessage = `Your merchandise order for ${order.itemTitle} has been received by ${current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Staff'}.`;
    await ctx.db.insert('messages', {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Staff',
      senderRole: 'staff',
      recipientId: order.userId,
      content: customerMessage,
      isRead: false,
    });
    await notifyMerchandiseDepartmentEmails(
      ctx,
      'Merchandise order received',
      `${order.customerName}'s merchandise order for ${order.itemTitle} was received.`
    );
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, customerMessage);
      await sendWhatsAppToCustomer(customerUser.phone, customerMessage);
    }
    return null;
  },
});

export const confirmAvailability = mutation({
  args: {
    orderId: v.id("merchandiseOrders"),
    bankingDetails: v.optional(v.string()),
    deliveryFee: v.optional(v.number()),
    quoteAttachmentStorageIds: v.array(v.id("_storage")),
    quoteAttachmentNames: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current?.user || !canManageMerchandise(current.user)) throw new Error("Not authorized");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    const item = await safeGet(ctx, order.merchandiseItemId);
    if (!item) throw new Error("Item not found");

    const invoiceNumber = order.invoiceNumber ?? buildInvoiceNumber(order.brand, String(order._id), Date.now());
    const subtotalAmount = Number(order.unitPrice ?? 0) * Number(order.quantity ?? 1);
    const deliveryFee = order.fulfillmentType === 'delivery' ? Number(args.deliveryFee ?? order.deliveryFee ?? 0) : 0;
    const totalAmount = subtotalAmount + deliveryFee;

    await ctx.db.patch(args.orderId, {
      status: 'availability_confirmed',
      bankingDetails: args.bankingDetails ?? order.bankingDetails,
      quoteAttachmentStorageIds: args.quoteAttachmentStorageIds,
      quoteAttachmentNames: args.quoteAttachmentNames,
      subtotalAmount,
      deliveryFee,
      totalAmount,
      invoiceNumber,
      invoiceSentAt: Date.now(),
      companyDetails: order.companyDetails ?? buildCompanyDetails(order.brand),
      updatedAt: Date.now(),
      availabilityConfirmedByUserId: current.userId,
      availabilityConfirmedByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Staff',
      acknowledgedAt: order.acknowledgedAt ?? Date.now(),
    });

    await ctx.db.insert("merchandiseOrderLedger", {
      merchandiseOrderId: args.orderId,
      entryType: 'invoice_sent',
      description: `Invoice ${invoiceNumber} sent for ${order.itemTitle}`,
      amount: totalAmount,
      currency: 'ZAR',
      createdByUserId: current.userId,
      createdByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Staff',
      metadata: JSON.stringify({ invoiceNumber, subtotalAmount, deliveryFee, bankingDetails: Boolean(args.bankingDetails) }),
      createdAt: Date.now(),
    });

    const customerUser = await safeGet(ctx, order.userId);
    const customerMessage = `Your quote for ${order.itemTitle} is ready${deliveryFee ? ` with delivery fee R${deliveryFee}` : ''}. Please upload proof of payment once payment is made.`;
    await ctx.db.insert('messages', {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Staff',
      senderRole: 'staff',
      recipientId: order.userId,
      content: customerMessage,
      attachmentStorageIds: args.quoteAttachmentStorageIds,
      attachmentNames: args.quoteAttachmentNames,
      isRead: false,
    });
    await notifyMerchandiseDepartmentEmails(
      ctx,
      'Merchandise quote ready',
      `${order.customerName}'s quote for ${order.itemTitle} is ready.`
    );
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, customerMessage);
      await sendWhatsAppToCustomer(customerUser.phone, customerMessage);
    }

    return null;
  },
});

export const submitPaymentProof = mutation({
  args: {
    orderId: v.id("merchandiseOrders"),
    storageIds: v.array(v.id("_storage")),
    names: v.optional(v.array(v.string())),
    mimeTypes: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (String(order.userId) !== String(current.userId) && !canManageMerchandise(current.user)) throw new Error("Not authorized");
    if (!args.storageIds.length) throw new Error("At least one proof file is required");

    await ctx.db.patch(args.orderId, {
      paymentProofStorageIds: args.storageIds,
      paymentProofNames: args.names,
      paymentProofTypes: args.mimeTypes,
      paymentProofSubmittedAt: Date.now(),
      status: order.status === 'availability_confirmed' ? 'payment_proof_submitted' : order.status,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("merchandiseOrderLedger", {
      merchandiseOrderId: args.orderId,
      entryType: 'payment_proof_submitted',
      description: `Payment proof uploaded for ${order.itemTitle}`,
      amount: Number(order.totalAmount ?? 0),
      currency: 'ZAR',
      createdByUserId: current.userId,
      createdByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Customer',
      metadata: JSON.stringify({ storageIds: args.storageIds.map(String), names: args.names, mimeTypes: args.mimeTypes }),
      createdAt: Date.now(),
    });

    const customerUser = await safeGet(ctx, order.userId);
    const message = `We received your proof of payment for ${order.itemTitle}. Staff will confirm it shortly.`;
    await ctx.db.insert('messages', {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Customer',
      senderRole: 'customer',
      recipientId: order.userId,
      content: message,
      isRead: false,
    });
    await notifyMerchandiseDepartmentEmails(
      ctx,
      'Merchandise payment proof submitted',
      `${order.customerName}'s proof of payment for ${order.itemTitle} was submitted.`
    );
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, message);
      await sendWhatsAppToCustomer(customerUser.phone, message);
    }

    return null;
  },
});

export const confirmPayment = mutation({
  args: {
    orderId: v.id("merchandiseOrders"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current?.user || !canManageMerchandise(current.user)) throw new Error("Not authorized");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    await ctx.db.patch(args.orderId, {
      status: 'payment_confirmed',
      paymentConfirmedAt: Date.now(),
      updatedAt: Date.now(),
    });

    const customerUser = await safeGet(ctx, order.userId);
    const customerMessage = `Payment confirmed for ${order.itemTitle}. Assisted by ${current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Staff'}.`;
    await ctx.db.insert('messages', {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Staff',
      senderRole: 'staff',
      recipientId: order.userId,
      content: customerMessage,
      isRead: false,
    });
    await notifyMerchandiseDepartmentEmails(
      ctx,
      'Merchandise payment confirmed',
      `${order.customerName}'s payment for ${order.itemTitle} was confirmed.`
    );
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, customerMessage);
      await sendWhatsAppToCustomer(customerUser.phone, customerMessage);
    }

    return null;
  },
});

export const completeOrder = mutation({
  args: {
    orderId: v.id("merchandiseOrders"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current?.user || !canManageMerchandise(current.user)) throw new Error("Not authorized");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    const item = await ctx.db.get(order.merchandiseItemId);
    if (!item) throw new Error("Item not found");

    const remaining = Math.max(0, Number(item.stockQuantity ?? 0) - Number(order.quantity ?? 1));
    await ctx.db.patch(order.merchandiseItemId, {
      stockQuantity: remaining,
      isAvailable: remaining > 0 ? item.isAvailable : false,
      updatedAt: Date.now(),
    });

    await ctx.db.patch(args.orderId, {
      status: 'completed',
      fulfilledAt: Date.now(),
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("merchandiseOrderLedger", {
      merchandiseOrderId: args.orderId,
      entryType: 'completed',
      description: `Order completed for ${order.itemTitle}`,
      amount: Number(order.totalAmount ?? 0),
      currency: 'ZAR',
      createdByUserId: current.userId,
      createdByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Staff',
      metadata: JSON.stringify({ status: 'completed', fulfillmentType: order.fulfillmentType }),
      createdAt: Date.now(),
    });

    const customerUser = await safeGet(ctx, order.userId);
    const customerMessage = `Your merchandise order for ${order.itemTitle} is complete. Assisted by ${current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Staff'}.`;
    await ctx.db.insert('messages', {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Staff',
      senderRole: 'staff',
      recipientId: order.userId,
      content: customerMessage,
      isRead: false,
    });
    await notifyMerchandiseDepartmentEmails(
      ctx,
      'Merchandise order completed',
      `${order.customerName}'s merchandise order for ${order.itemTitle} is complete.`
    );
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, customerMessage);
      await sendWhatsAppToCustomer(customerUser.phone, customerMessage);
    }

    return null;
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
    const current = await getCurrentUser(ctx);
    if (!current?.user || !canManageMerchandise(current.user)) {
      return { totalOrders: 0, openOrders: 0, completedOrders: 0, totalRevenue: 0, byBrand: [], byFulfillment: [], recentOrders: [] };
    }

    const orders = await ctx.db.query("merchandiseOrders").order("desc").collect();
    const totalRevenue = orders.reduce((sum: number, order: any) => sum + Number(order.totalAmount ?? 0), 0);
    const brandMap: Record<string, { orders: number; revenue: number }> = {};
    const fulfillmentMap: Record<string, number> = {};

    for (const order of orders) {
      const brand = String(order.brand ?? 'Hyundai');
      if (!brandMap[brand]) brandMap[brand] = { orders: 0, revenue: 0 };
      brandMap[brand].orders += 1;
      brandMap[brand].revenue += Number(order.totalAmount ?? 0);

      const fulfillment = String(order.fulfillmentType ?? 'collection');
      fulfillmentMap[fulfillment] = (fulfillmentMap[fulfillment] ?? 0) + 1;
    }

    const recentOrders = orders.slice(0, 10).map((order: any) => ({
      orderId: String(order._id),
      brand: String(order.brand ?? 'Hyundai'),
      title: String(order.itemTitle ?? 'Merchandise'),
      totalAmount: Number(order.totalAmount ?? 0),
      status: String(order.status ?? 'submitted'),
      createdAt: order._creationTime ?? order.createdAt ?? Date.now(),
    }));

    return {
      totalOrders: orders.length,
      openOrders: orders.filter((order: any) => !['completed', 'fulfilled'].includes(String(order.status))).length,
      completedOrders: orders.filter((order: any) => ['completed', 'fulfilled'].includes(String(order.status))).length,
      totalRevenue,
      byBrand: Object.entries(brandMap).map(([brand, value]) => ({ brand, orders: value.orders, revenue: value.revenue })),
      byFulfillment: Object.entries(fulfillmentMap).map(([fulfillmentType, count]) => ({ fulfillmentType, count })),
      recentOrders,
    };
  },
});

export const getFeaturedMerchandiseFeed = query({
  args: {
    shuffle: v.optional(v.boolean()),
  },
  returns: v.array(v.object({
    _id: v.id("merchandiseItems"),
    brand: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    stockQuantity: v.number(),
    imageUrls: v.array(v.string()),
  })),
  handler: async (ctx, args) => {
    const [hyundaiItems, kiaItems] = await Promise.all([
      ctx.db
        .query("merchandiseItems")
        .withIndex("by_brand_and_isAvailable", (q: any) => q.eq("brand", "Hyundai").eq("isAvailable", true))
        .order("desc")
        .take(3),
      ctx.db
        .query("merchandiseItems")
        .withIndex("by_brand_and_isAvailable", (q: any) => q.eq("brand", "Kia").eq("isAvailable", true))
        .order("desc")
        .take(3),
    ]);

    let items = [...hyundaiItems, ...kiaItems].slice(0, 6);
    
    // Shuffle if requested using Fisher-Yates algorithm
    if (args.shuffle) {
      const shuffled = [...items];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      items = shuffled;
    }
    
    return Promise.all(items.map(async (item: any) => ({
      _id: item._id,
      brand: item.brand,
      title: item.title,
      description: item.description,
      price: item.price,
      stockQuantity: item.stockQuantity,
      imageUrls: await resolveUrls(ctx, item.imageStorageIds) ?? item.imageUrls ?? [],
    })));
  },
});

export const markUnavailable = mutation({
  args: {
    orderId: v.id("merchandiseOrders"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current?.user || !canManageMerchandise(current.user)) throw new Error("Not authorized");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    await ctx.db.patch(args.orderId, {
      status: 'unavailable',
      updatedAt: Date.now(),
    });
    await notifyMerchandiseDepartmentEmails(
      ctx,
      'Merchandise order unavailable',
      `${order.customerName}'s merchandise order for ${order.itemTitle} is unavailable.`
    );
    return null;
  },
});