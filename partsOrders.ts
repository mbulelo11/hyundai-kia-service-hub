import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { isVincentAdminUser, isPartsAccessoriesManagerUser, isAdminUser, canAccessDepartment, getUserDepartment, getViewer } from "./auth";
import { sendSMSToCustomer, sendWhatsAppToCustomer } from './emails';

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";

async function safeDbGet(ctx: any, id: string | undefined | null) {
  if (!id) return null;
  try {
    return await ctx.db.get(id as any);
  } catch {
    return null;
  }
}

function pickPreferredUserByEmail(users: any[]) {
  return users
    .filter((user: any) => user && !user.isDeleted)
    .sort((a: any, b: any) => {
      const aScore = (a?.role === "staff" || a?.staffRole || String(a?.email ?? "").trim().toLowerCase() === "vincentmm@hyundai.co.za" || a?.isOwner ? 100 : 0);
      const bScore = (b?.role === "staff" || b?.staffRole || String(b?.email ?? "").trim().toLowerCase() === "vincentmm@hyundai.co.za" || b?.isOwner ? 100 : 0);
      return bScore - aScore || Number(b._creationTime ?? 0) - Number(a._creationTime ?? 0);
    })[0] ?? null;
}

async function resolveStorageUrls(ctx: any, storageIds?: Array<string | null | undefined>) {
  if (!storageIds?.length) return undefined;
  const urls = await Promise.all(
    storageIds.map(async (storageId) => {
      if (!storageId) return null;
      return await ctx.storage.getUrl(storageId as any);
    }),
  );
  return urls.filter((url: string | null): url is string => Boolean(url));
}

async function getCurrentUser(ctx: any) {
  const viewer = await getViewer(ctx);
  if (!viewer) throw new Error("Not authenticated");

  const email = String(viewer.user?.email ?? viewer.identity?.email ?? "").trim().toLowerCase();
  const isModerator = Boolean(
    viewer.user?.isOwner ||
    email === VINCENT_ADMIN_EMAIL ||
    viewer.user?.staffRole === "dp"
  );

  return {
    identity: viewer.identity,
    userId: String(viewer.userId),
    user: viewer.user,
    isModerator,
    isAdmin: isAdminUser(viewer.user),
    department: getUserDepartment(viewer.user),
  };
}

function canManage(user: any) {
  return Boolean(isVincentAdminUser(user) || isAdminUser(user) || isPartsAccessoriesManagerUser(user));
}

function isPartsDepartmentStaff(user: any) {
  const role = String(user?.staffRole ?? user?.role ?? "").trim().toLowerCase();
  return [
    "parts_manager",
    "accessories_manager",
    "parts_accessories_manager",
    "parts_and_accessories_manager",
    "parts_accessory_manager",
    "parts_accessories",
    "parts",
    "accessories",
  ].includes(role);
}

function canReassignPartsOrder(user: any, order: any) {
  return Boolean((canManage(user) || isPartsDepartmentStaff(user)) && !order.acknowledgedAt);
}

async function hasPartsMenuAccess(ctx: any, user: any, userId: string) {
  if (!user || (!user?.role && !user?.staffRole)) return true;
  if (canManage(user)) return true;
  const department = getUserDepartment(user);
  if (department && !canAccessDepartment(user, "parts")) return false;
  const key = `staff:${userId}:menu:parts_orders`;
  const row = await ctx.db
    .query("widgetVisibility")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .first();
  return !row?.hidden;
}

function canViewOrderForStaff(current: any, order: any) {
  if (!current?.user || !order) return false;
  if (canManage(current.user)) return true;
  if (!canAccessDepartment(current.user, order.department ?? "parts")) return false;
  const currentUserId = String(current.userId ?? "");
  return Boolean(
    String(order.ownerUserId ?? order.ownerId ?? order.owner_id ?? order.userId ?? "") === currentUserId ||
    String(order.assignedToUserId ?? "") === currentUserId ||
    String(order.receivedByUserId ?? "") === currentUserId ||
    String(order.paymentConfirmedByUserId ?? "") === currentUserId
  );
}

function calculateTotalAmount(order: any) {
  const partCost = Number(order.partCost ?? 0);
  const deliveryFee = order.fulfillmentType === "drop_off" ? Number(order.deliveryFee ?? 0) : 0;
  return partCost + deliveryFee;
}

function buildOrderMessage(args: {
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

async function getOperationalRecipients(ctx: any) {
  const users = await ctx.db.query("users").collect();
  const recipients = new Set<string>();
  for (const user of users) {
    const email = String(user?.email ?? "").trim().toLowerCase();
    const role = String(user?.role ?? user?.staffRole ?? "").trim().toLowerCase();
    const isOperational = Boolean(
      user?.isOwner ||
      email === "vincentmm@hyundai.co.za" ||
      role.includes("parts") ||
      role.includes("accessor") ||
      role === "staff" ||
      role === "admin" ||
      email === "vincentmm@hyundai.co.za"
    );
    if (isOperational && !user?.isDeleted) recipients.add(String(user._id));
  }
  return [...recipients];
}

async function notifyPartsDepartmentEmails(ctx: any, title: string, message: string) {
  const recipients = await getOperationalRecipients(ctx);
  for (const userId of recipients) {
    await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
      userId,
      title,
      message,
    });
  }
}

async function getPartsDepartmentRecipients(ctx: any) {
  return (await getOperationalRecipients(ctx)).map((userId) => ({ userId }));
}

function mapOrder(order: any) {
  return {
    _id: order._id,
    _creationTime: order._creationTime,
    ownerUserId: order.ownerUserId,
    userId: order.userId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    vehicleVin: order.vehicleVin,
    yearModel: order.yearModel,
    contactDetails: order.contactDetails,
    orderType: order.orderType,
    itemDescription: order.itemDescription,
    referencePhotos: order.referencePhotos,
    fulfillmentType: order.fulfillmentType,
    dropOffAddress: order.dropOffAddress,
    contactPreference: order.contactPreference,
    notes: order.notes,
    pendingItems: order.pendingItems,
    partCost: order.partCost,
    deliveryFee: order.deliveryFee,
    totalAmount: order.totalAmount,
    bankingDetails: order.bankingDetails,
    paymentProofStorageIds: order.paymentProofStorageIds,
    paymentProofNames: order.paymentProofNames,
    paymentProofTypes: order.paymentProofTypes,
    paymentProofUrls: order.paymentProofUrls,
    paymentProofSubmittedAt: order.paymentProofSubmittedAt,
    paymentConfirmedByUserId: order.paymentConfirmedByUserId,
    paymentConfirmedByName: order.paymentConfirmedByName,
    reviewRequired: order.reviewRequired,
    reviewId: order.reviewId,
    reviewedAt: order.reviewedAt,
    fulfilledAt: order.fulfilledAt,
    acknowledgedAt: order.acknowledgedAt,
    assignedToUserId: order.assignedToUserId,
    assignedToName: order.assignedToName,
    receivedByUserId: order.receivedByUserId,
    receivedByName: order.receivedByName,
    availabilityConfirmedByUserId: order.availabilityConfirmedByUserId,
    availabilityConfirmedByName: order.availabilityConfirmedByName,
    bankingDetailsSentAt: order.bankingDetailsSentAt,
    paymentConfirmedAt: order.paymentConfirmedAt,
    driverScheduleId: order.driverScheduleId,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    completedAt: order.completedAt,
  };
}

const orderReturn = v.object({
  _id: v.id("partsOrders"),
  _creationTime: v.number(),
  ownerUserId: v.optional(v.string()),
  userId: v.string(),
  customerName: v.string(),
  customerPhone: v.string(),
  vehicleVin: v.string(),
  yearModel: v.optional(v.string()),
  contactDetails: v.string(),
  orderType: v.string(),
  itemDescription: v.string(),
  referencePhotos: v.optional(v.array(v.string())),
  fulfillmentType: v.string(),
  dropOffAddress: v.optional(v.string()),
  contactPreference: v.optional(v.string()),
  notes: v.optional(v.string()),
  pendingItems: v.optional(v.string()),
  partCost: v.optional(v.number()),
  deliveryFee: v.optional(v.number()),
  totalAmount: v.optional(v.number()),
  bankingDetails: v.optional(v.string()),
  paymentProofStorageIds: v.optional(v.array(v.id("_storage"))),
  paymentProofNames: v.optional(v.array(v.string())),
  paymentProofTypes: v.optional(v.array(v.string())),
  paymentProofUrls: v.optional(v.array(v.string())),
  paymentProofSubmittedAt: v.optional(v.number()),
  paymentConfirmedByUserId: v.optional(v.string()),
  paymentConfirmedByName: v.optional(v.string()),
  reviewRequired: v.optional(v.boolean()),
  reviewId: v.optional(v.id("reviews")),
  reviewedAt: v.optional(v.number()),
  fulfilledAt: v.optional(v.number()),
  acknowledgedAt: v.optional(v.number()),
  assignedToUserId: v.optional(v.string()),
  assignedToName: v.optional(v.string()),
  receivedByUserId: v.optional(v.string()),
  receivedByName: v.optional(v.string()),
  availabilityConfirmedByUserId: v.optional(v.string()),
  availabilityConfirmedByName: v.optional(v.string()),
  bankingDetailsSentAt: v.optional(v.number()),
  paymentConfirmedAt: v.optional(v.number()),
  driverScheduleId: v.optional(v.id("driverSchedules")),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
});

export const submit = mutation({
  args: {
    customerName: v.string(),
    customerPhone: v.string(),
    vehicleVin: v.string(),
    yearModel: v.optional(v.string()),
    contactDetails: v.string(),
    orderType: v.string(),
    itemDescription: v.string(),
    referencePhotos: v.optional(v.array(v.string())),
    fulfillmentType: v.string(),
    dropOffAddress: v.optional(v.string()),
    contactPreference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.id("partsOrders"),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const now = Date.now();

    const orderId = await ctx.db.insert("partsOrders", {
      ownerUserId: current.userId,
      userId: current.userId,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      vehicleVin: args.vehicleVin,
      yearModel: args.yearModel,
      contactDetails: args.contactDetails,
      orderType: args.orderType,
      itemDescription: args.itemDescription,
      referencePhotos: args.referencePhotos,
      fulfillmentType: args.fulfillmentType,
      dropOffAddress: args.fulfillmentType === "drop_off" ? args.dropOffAddress : undefined,
      contactPreference: args.contactPreference,
      status: "submitted",
      notes: args.notes,
      pendingItems: undefined,
      reviewRequired: false,
      department: "parts",
      createdAt: now,
      updatedAt: now,
    });

    const recipients = await getOperationalRecipients(ctx);
    const summary = buildOrderMessage(args);
    for (const recipientId of recipients) {
      await ctx.db.insert("messages", {
        senderId: current.userId,
        senderName: args.customerName,
        senderRole: "customer",
        recipientId,
        partsOrderId: orderId,
        content: summary,
        isRead: false,
      });
      await ctx.db.insert("notifications", {
        userId: recipientId,
        type: "parts_order_received",
        title: "New Parts / Accessories Order",
        message: `${args.customerName} requested ${args.itemDescription} for VIN ${args.vehicleVin}.`,
        targetRoute: "PartsOrders",
        targetId: String(orderId),
        isRead: false,
      });
    }
    await notifyPartsDepartmentEmails(
      ctx,
      "New Parts / Accessories Order",
      `${args.customerName.trim()} requested ${itemDescription} for VIN ${vehicleVin}.`
    );

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
      description: `${args.customerName} submitted a parts/accessory order for VIN ${args.vehicleVin}.`,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      metadata: JSON.stringify({ orderId: String(orderId), fulfillmentType: args.fulfillmentType, orderType: args.orderType, vehicleVin: args.vehicleVin, yearModel: args.yearModel, contactPreference: args.contactPreference }),
      triggeredBy: current.userId,
    });

    return orderId;
  },
});

export const listMine = query({
  args: {},
  returns: v.array(orderReturn),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const currentUserId = String(current.userId);
    const scopeIds = Array.from(new Set([
      currentUserId,
      String(current.identity?.subject ?? ''),
    ].filter(Boolean)));

    const buckets = await Promise.all([
      ...scopeIds.map((scopeId) => ctx.db.query("partsOrders").withIndex("by_userId", (q: any) => q.eq("userId", scopeId)).collect()),
      ...scopeIds.map((scopeId) => ctx.db.query("partsOrders").withIndex("by_ownerUserId", (q: any) => q.eq("ownerUserId", scopeId)).collect()),
      ...scopeIds.map((scopeId) => ctx.db.query("partsOrders").withIndex("by_ownerId", (q: any) => q.eq("ownerId", scopeId)).collect()),
    ]);

    const merged = buckets
      .flat()
      .filter((order: any, index: number, arr: any[]) => arr.findIndex((row: any) => String(row._id) === String(order._id)) === index)
      .sort((a: any, b: any) => Number(b._creationTime ?? 0) - Number(a._creationTime ?? 0));

    return merged.map(mapOrder);
  },
});

export const listForStaff = query({
  args: {},
  returns: v.array(orderReturn),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current.user) return [];

    const currentEmail = String(current.identity?.email ?? current.user?.email ?? "").trim().toLowerCase();
    const staffRecord = currentEmail
      ? await ctx.db
          .query("staff")
          .withIndex("by_email", (q: any) => q.eq("email", currentEmail))
          .first()
      : null;

    const isStaffLike = Boolean(
      canManage(current.user) ||
      staffRecord ||
      current.user?.role === "staff" ||
      current.user?.role === "admin" ||
      current.user?.staffRole ||
      current.user?.accessLevel ||
      current.user?.department ||
      current.user?.isOwner
    );
    if (!isStaffLike) return [];

    const orders = await ctx.db.query("partsOrders").order("desc").collect();
    return orders.map(mapOrder);
  },
});

export const setQuote = mutation({
  args: {
    orderId: v.id("partsOrders"),
    partCost: v.number(),
    deliveryFee: v.optional(v.number()),
    bankingDetails: v.optional(v.string()),
    customerMessage: v.optional(v.string()),
    quoteAttachmentStorageIds: v.array(v.id("_storage")),
    quoteAttachmentNames: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!canManage(current.user)) throw new Error("Not authorized");
    if (!await hasPartsMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const totalAmount = args.partCost + (order.fulfillmentType === "drop_off" ? Number(args.deliveryFee ?? order.deliveryFee ?? 0) : 0);
    await ctx.db.patch(args.orderId, {
      partCost: args.partCost,
      deliveryFee: order.fulfillmentType === "drop_off" ? Number(args.deliveryFee ?? order.deliveryFee ?? 0) : 0,
      totalAmount,
      bankingDetails: args.bankingDetails ?? order.bankingDetails,
      quoteAttachmentStorageIds: args.quoteAttachmentStorageIds,
      quoteAttachmentNames: args.quoteAttachmentNames,
      status: "availability_confirmed",
      bankingDetailsSentAt: Date.now(),
      updatedAt: Date.now(),
      acknowledgedAt: order.acknowledgedAt ?? Date.now(),
    });

    await ctx.db.insert("partsOrderLedger", {
      partsOrderId: args.orderId,
      entryType: "quote_set",
      description: `Quote set for ${order.itemDescription}`,
      amount: totalAmount,
      currency: "ZAR",
      createdByUserId: current.userId,
      createdByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      metadata: JSON.stringify({ partCost: args.partCost, deliveryFee: order.fulfillmentType === "drop_off" ? Number(args.deliveryFee ?? order.deliveryFee ?? 0) : 0, totalAmount, bankingDetails: Boolean(args.bankingDetails) }),
      createdAt: Date.now(),
    });

    const messageBody = args.customerMessage?.trim() || `Your quote for ${order.itemDescription} is ready${order.fulfillmentType === "drop_off" ? `, including a delivery fee of R${Number(args.deliveryFee ?? order.deliveryFee ?? 0).toFixed(2)}` : ''}. Please make payment and upload proof. Handled by ${current.user?.name ?? current.identity.name ?? 'Parts Team'}.`;

    await ctx.db.insert("notifications", {
      userId: order.userId,
      type: "parts_order_quote",
      title: "Quote and banking details ready",
      message: messageBody,
      targetRoute: "PartsOrders",
      targetId: String(order._id),
      isRead: false,
    });
    for (const recipientId of await getOperationalRecipients(ctx)) {
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
        userId: recipientId,
        title: "Parts Quote Ready",
        message: `${order.customerName}'s quote for ${order.itemDescription} is ready.`,
      });
    }

    await ctx.db.insert("messages", {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      senderRole: "staff",
      recipientId: order.userId,
      partsOrderId: order._id,
      content: messageBody,
      attachmentStorageIds: args.quoteAttachmentStorageIds.map(String),
      attachmentNames: args.quoteAttachmentNames,
      isRead: false,
    });
    const customerUser = await safeDbGet(ctx, order.userId);
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, messageBody);
      await sendWhatsAppToCustomer(customerUser.phone, messageBody);
    }

    return null;
  },
});

export const confirmAvailability = mutation({
  args: { orderId: v.id("partsOrders"), customerMessage: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!canManage(current.user)) throw new Error("Not authorized");
    if (!await hasPartsMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    await ctx.db.patch(args.orderId, {
      status: "availability_confirmed",
      availabilityConfirmedByUserId: current.userId,
      availabilityConfirmedByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      bankingDetailsSentAt: Date.now(),
      updatedAt: Date.now(),
      acknowledgedAt: order.acknowledgedAt ?? Date.now(),
    });

    await ctx.db.insert("notifications", {
      userId: order.userId,
      type: "parts_order_available",
      title: "Part available",
      message: args.customerMessage?.trim() || `Your request for ${order.itemDescription} is available. Staff will send banking details and quote shortly.`,
      targetRoute: "PartsOrders",
      targetId: String(order._id),
      isRead: false,
    });
    await notifyPartsDepartmentEmails(
      ctx,
      "Parts order available",
      `${order.customerName}'s request for ${order.itemDescription} is available.`
    );
    for (const recipientId of await getOperationalRecipients(ctx)) {
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
        userId: recipientId,
        title: "Parts Order Available",
        message: `${order.customerName}'s request for ${order.itemDescription} is now available.`,
      });
    }

    const customerMessage = args.customerMessage?.trim() || `Your request for ${order.itemDescription} is available. Assisting staff: ${current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Parts Team'}.`;
    await ctx.db.insert("messages", {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      senderRole: "staff",
      recipientId: order.userId,
      partsOrderId: order._id,
      content: customerMessage,
      isRead: false,
    });
    const customerUser = await safeDbGet(ctx, order.userId);
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, customerMessage);
      await sendWhatsAppToCustomer(customerUser.phone, customerMessage);
    }

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: current.userId,
      type: "parts_order_confirmed",
      title: "Parts order availability confirmed",
      description: `${order.customerName}'s order for ${order.itemDescription} is available.`,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      metadata: JSON.stringify({ orderId: String(order._id), status: "availability_confirmed", orderType: order.orderType, fulfillmentType: order.fulfillmentType }),
      triggeredBy: current.userId,
    });
    return null;
  },
});

export const submitPaymentProof = mutation({
  args: {
    orderId: v.id("partsOrders"),
    storageIds: v.array(v.id("_storage")),
    names: v.optional(v.array(v.string())),
    mimeTypes: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (String(order.userId) !== String(current.userId) && !canManage(current.user)) {
      throw new Error("Not authorized");
    }
    if (!args.storageIds.length) throw new Error("At least one proof file is required");

    await ctx.db.patch(args.orderId, {
      paymentProofStorageIds: args.storageIds,
      paymentProofNames: args.names,
      paymentProofTypes: args.mimeTypes,
      paymentProofSubmittedAt: Date.now(),
      status: order.status === "availability_confirmed" ? "payment_proof_submitted" : order.status,
      updatedAt: Date.now(),
      acknowledgedAt: order.acknowledgedAt ?? Date.now(),
    });

    await ctx.db.insert("partsOrderLedger", {
      partsOrderId: args.orderId,
      entryType: "payment_proof_submitted",
      description: `Payment proof uploaded for ${order.itemDescription}`,
      amount: Number(order.totalAmount ?? 0),
      currency: "ZAR",
      createdByUserId: current.userId,
      createdByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Customer",
      metadata: JSON.stringify({ storageIds: args.storageIds.map(String), names: args.names, mimeTypes: args.mimeTypes }),
      createdAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      userId: order.userId,
      type: "parts_order_payment_proof_submitted",
      title: "Payment proof sent",
      message: "We received your payment proof and staff will verify it shortly.",
      targetRoute: "PartsOrders",
      targetId: String(order._id),
      isRead: false,
    });

    return null;
  },
});

export const confirmPayment = mutation({
  args: { orderId: v.id("partsOrders"), customerMessage: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!canManage(current.user)) throw new Error("Not authorized");
    if (!await hasPartsMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const now = Date.now();
    const totalAmount = calculateTotalAmount(order);

    await ctx.db.patch(args.orderId, {
      status: "payment_confirmed",
      paymentConfirmedAt: now,
      paymentConfirmedByUserId: current.userId,
      paymentConfirmedByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      totalAmount,
      reviewRequired: true,
      updatedAt: now,
      acknowledgedAt: order.acknowledgedAt ?? now,
    });

    await ctx.db.insert("partsOrderLedger", {
      partsOrderId: args.orderId,
      entryType: "payment_confirmed",
      description: `Payment confirmed for ${order.itemDescription}`,
      amount: totalAmount,
      currency: "ZAR",
      createdByUserId: current.userId,
      createdByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      metadata: JSON.stringify({ totalAmount, partCost: order.partCost, deliveryFee: order.deliveryFee, fulfillmentType: order.fulfillmentType }),
      createdAt: now,
    });

    await ctx.db.insert("notifications", {
      userId: order.userId,
      type: "parts_order_payment_confirmed",
      title: "Payment confirmed",
      message: args.customerMessage?.trim() || `Payment has been confirmed for ${order.itemDescription}. Please choose delivery or collection if you have not already.`,
      targetRoute: "PartsOrders",
      targetId: String(order._id),
      isRead: false,
    });
    await notifyPartsDepartmentEmails(
      ctx,
      "Parts payment confirmed",
      `${order.customerName}'s payment for ${order.itemDescription} was confirmed.`
    );

    const customerMessage = args.customerMessage?.trim() || `Payment confirmed for ${order.itemDescription}. Please choose delivery or collection. Assisted by ${current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Parts Team'}.`;
    await ctx.db.insert("messages", {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      senderRole: "staff",
      recipientId: order.userId,
      partsOrderId: order._id,
      content: customerMessage,
      isRead: false,
    });
    const customerUser = await safeDbGet(ctx, order.userId);
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, customerMessage);
      await sendWhatsAppToCustomer(customerUser.phone, customerMessage);
    }

    return null;
  },
});

export const markFulfilled = mutation({
  args: { orderId: v.id("partsOrders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!canManage(current.user)) throw new Error("Not authorized");
    if (!await hasPartsMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      status: "fulfilled",
      fulfilledAt: now,
      completedAt: now,
      updatedAt: now,
      acknowledgedAt: order.acknowledgedAt ?? now,
    });

    await ctx.db.insert("partsOrderLedger", {
      partsOrderId: args.orderId,
      entryType: "fulfilled",
      description: `Order fulfilled for ${order.itemDescription}`,
      amount: Number(order.totalAmount ?? 0),
      currency: "ZAR",
      createdByUserId: current.userId,
      createdByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      metadata: JSON.stringify({ status: "fulfilled" }),
      createdAt: now,
    });

    await ctx.db.insert("notifications", {
      userId: order.userId,
      type: "parts_order_completed",
      title: "Order delivered / collected",
      message: `Your ${order.itemDescription} order has been fulfilled. Please submit your review now.`,
      targetRoute: "Review",
      targetId: String(order._id),
      isRead: false,
    });
    await notifyPartsDepartmentEmails(
      ctx,
      "Parts order completed",
      `${order.customerName}'s order for ${order.itemDescription} has been completed.`
    );

    const customerMessage = `Your ${order.itemDescription} order is complete. Please submit your mandatory review. ${current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Parts Team'} assisted you.`;
    await ctx.db.insert("messages", {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      senderRole: "staff",
      recipientId: order.userId,
      partsOrderId: args.orderId,
      content: customerMessage,
      isRead: false,
    });
    const customerUser = await safeDbGet(ctx, order.userId);
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, customerMessage);
      await sendWhatsAppToCustomer(customerUser.phone, customerMessage);
    }

    return null;
  },
});

export const submitMandatoryReview = mutation({
  args: {
    orderId: v.id("partsOrders"),
    rating: v.number(),
    comment: v.string(),
    title: v.optional(v.string()),
  },
  returns: v.id("reviews"),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (String(order.userId) !== String(current.userId)) throw new Error("Not authorized");
    if (order.status !== "fulfilled") throw new Error("You can only review after delivery or collection");
    if (order.reviewId) throw new Error("Review already submitted");
    if (args.rating < 1 || args.rating > 5) throw new Error("Invalid rating");

    const reviewId = await ctx.db.insert("reviews", {
      userId: current.userId,
      userName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Customer",
      userEmail: current.identity.email,
      partsOrderId: args.orderId,
      serviceType: "Parts / Accessories",
      vehicleDescription: order.itemDescription,
      rating: args.rating,
      title: args.title,
      comment: args.comment,
      staffName: order.availabilityConfirmedByName ?? order.paymentConfirmedByName,
      sharedToGoogle: false,
      isPublic: true,
    });

    await ctx.db.patch(args.orderId, {
      reviewId,
      reviewRequired: false,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("partsOrderLedger", {
      partsOrderId: args.orderId,
      entryType: "review_submitted",
      description: `Review submitted for ${order.itemDescription}`,
      amount: 0,
      currency: "ZAR",
      createdByUserId: current.userId,
      createdByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Customer",
      metadata: JSON.stringify({ reviewId: String(reviewId), rating: args.rating }),
      createdAt: Date.now(),
    });

    return reviewId;
  },
});

export const markUnavailable = mutation({
  args: { orderId: v.id("partsOrders"), customerMessage: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!canManage(current.user)) throw new Error("Not authorized");
    if (!await hasPartsMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    await ctx.db.patch(args.orderId, { status: "unavailable", updatedAt: Date.now() });

    const customerMessage = args.customerMessage?.trim() || `Your request for ${order.itemDescription} is currently unavailable.`;
    await ctx.db.insert("notifications", {
      userId: order.userId,
      type: "parts_order_unavailable",
      title: "Part currently unavailable",
      message: customerMessage,
      targetRoute: "PartsOrders",
      targetId: String(order._id),
      isRead: false,
    });
    await notifyPartsDepartmentEmails(
      ctx,
      "Parts order unavailable",
      `${order.customerName}'s order for ${order.itemDescription} is currently unavailable.`
    );
    await ctx.db.insert("messages", {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      senderRole: "staff",
      recipientId: order.userId,
      partsOrderId: order._id,
      content: customerMessage,
      isRead: false,
    });
    const customerUser = await safeDbGet(ctx, order.userId);
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, customerMessage);
      await sendWhatsAppToCustomer(customerUser.phone, customerMessage);
    }

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: current.userId,
      type: "parts_order_unavailable",
      title: "Parts order unavailable",
      description: `${order.customerName}'s order for ${order.itemDescription} is currently unavailable.`,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      metadata: JSON.stringify({ orderId: String(order._id), status: "unavailable", orderType: order.orderType, fulfillmentType: order.fulfillmentType }),
      triggeredBy: current.userId,
    });
    return null;
  },
});

export const scheduleDelivery = mutation({
  args: {
    orderId: v.id("partsOrders"),
    driverUserId: v.optional(v.string()),
    driverName: v.optional(v.string()),
    scheduleDate: v.string(),
    scheduleTime: v.optional(v.string()),
    notes: v.optional(v.string()),
    customerMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!canManage(current.user)) throw new Error("Not authorized");
    if (!await hasPartsMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const existingSchedule = await ctx.db
      .query("driverSchedules")
      .withIndex("by_partsOrderId", (q: any) => q.eq("partsOrderId", args.orderId))
      .first();

    const schedulePayload = {
      ownerUserId: order.ownerUserId ?? current.userId,
      driverUserId: args.driverUserId,
      driverName: args.driverName,
      sourceType: "parts_order",
      partsOrderId: args.orderId,
      customerName: order.customerName,
      contactDetails: order.contactDetails,
      address: order.fulfillmentType === "drop_off" ? order.dropOffAddress : undefined,
      scheduleDate: args.scheduleDate,
      scheduleTime: args.scheduleTime,
      status: "received",
      notes: args.notes ?? order.notes,
      receivedByUserId: current.userId,
      receivedByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
    } as const;

    let scheduleId = existingSchedule?._id;
    if (existingSchedule) {
      await ctx.db.patch(existingSchedule._id, {
        ...schedulePayload,
        updatedAt: Date.now(),
      });
    } else {
      scheduleId = await ctx.db.insert("driverSchedules", schedulePayload as any);
    }

    await ctx.db.patch(args.orderId, {
      status: order.fulfillmentType === "drop_off" ? "scheduled_for_delivery" : "scheduled_for_collection",
      driverScheduleId: scheduleId,
      assignedToUserId: args.driverUserId,
      assignedToName: args.driverName,
      updatedAt: Date.now(),
    });

    const customerMessage = args.customerMessage?.trim() || `Your ${order.itemDescription} order has been scheduled for ${args.scheduleDate}${args.scheduleTime ? ` at ${args.scheduleTime}` : ""} by ${current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Parts Team'}.`;
    await ctx.db.insert("notifications", {
      userId: order.userId,
      type: "parts_order_scheduled",
      title: "Delivery / collection scheduled",
      message: customerMessage,
      targetRoute: "PartsOrders",
      targetId: String(order._id),
      isRead: false,
    });
    await notifyPartsDepartmentEmails(
      ctx,
      "Parts order scheduled",
      `${order.customerName}'s order for ${order.itemDescription} was scheduled for ${args.scheduleDate}${args.scheduleTime ? ` at ${args.scheduleTime}` : ""}.`
    );

    await ctx.db.insert("messages", {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      senderRole: "staff",
      recipientId: order.userId,
      partsOrderId: args.orderId,
      content: customerMessage,
      isRead: false,
    });
    const customerUser = await safeDbGet(ctx, order.userId);
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, customerMessage);
      await sendWhatsAppToCustomer(customerUser.phone, customerMessage);
    }

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: current.userId,
      type: "parts_order_scheduled",
      title: "Parts order delivery scheduled",
      description: `${order.customerName}'s order for ${order.itemDescription} was scheduled for delivery.`,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      metadata: JSON.stringify({ orderId: String(order._id), driverScheduleId: String(scheduleId), scheduleDate: args.scheduleDate, scheduleTime: args.scheduleTime, driverName: args.driverName }),
      triggeredBy: current.userId,
    });
    return null;
  },
});

export const completeOrder = mutation({
  args: { orderId: v.id("partsOrders"), customerMessage: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!canManage(current.user)) throw new Error("Not authorized");
    if (!await hasPartsMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    await ctx.db.patch(args.orderId, {
      status: "fulfilled",
      completedAt: Date.now(),
      fulfilledAt: Date.now(),
      reviewRequired: true,
      updatedAt: Date.now(),
    });

    const customerMessage = args.customerMessage?.trim() || `Your ${order.itemDescription} order is complete. Please submit your mandatory review. ${current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Parts Team'} assisted you.`;
    await ctx.db.insert("notifications", {
      userId: order.userId,
      type: "parts_order_completed",
      title: "Order delivered / collected",
      message: customerMessage,
      targetRoute: "Review",
      targetId: String(order._id),
      isRead: false,
    });
    await notifyPartsDepartmentEmails(
      ctx,
      "Parts order completed",
      `${order.customerName}'s order for ${order.itemDescription} has been completed.`
    );

    await ctx.db.insert("messages", {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      senderRole: "staff",
      recipientId: order.userId,
      partsOrderId: args.orderId,
      content: customerMessage,
      isRead: false,
    });
    const customerUser = await safeDbGet(ctx, order.userId);
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, customerMessage);
      await sendWhatsAppToCustomer(customerUser.phone, customerMessage);
    }

    return null;
  },
});

export const updateFulfillmentType = mutation({
  args: {
    orderId: v.id("partsOrders"),
    fulfillmentType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current.user) throw new Error("Not authenticated");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const fulfillmentType = args.fulfillmentType;
    const deliveryFee = fulfillmentType === "drop_off" ? Number(order.deliveryFee ?? 0) : 0;
    const totalAmount = Number(order.partCost ?? 0) + deliveryFee;
    const now = Date.now();

    await ctx.db.patch(args.orderId, {
      fulfillmentType,
      totalAmount,
      updatedAt: now,
    });

    await ctx.db.insert("partsOrderLedger", {
      partsOrderId: args.orderId,
      entryType: "fulfillment_choice_updated",
      description: `Fulfillment updated to ${fulfillmentType.replace('_', ' ')}`,
      amount: totalAmount,
      currency: "ZAR",
      createdByUserId: current.userId,
      createdByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      metadata: JSON.stringify({ fulfillmentType, partCost: order.partCost, deliveryFee, totalAmount }),
      createdAt: now,
    });

    await ctx.db.insert("notifications", {
      userId: order.userId,
      type: "parts_order_fulfillment_updated",
      title: "Fulfillment choice updated",
      message: `Your fulfillment choice for ${order.itemDescription} is now ${fulfillmentType.replace('_', ' ')}.`,
      targetRoute: "PartsOrders",
      targetId: String(order._id),
      isRead: false,
    });

    return null;
  },
});

export const receiveOrder = mutation({
  args: { orderId: v.id("partsOrders"), customerMessage: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!canManage(current.user)) throw new Error("Not authorized");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      status: "received",
      receivedByUserId: current.userId,
      receivedByName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      updatedAt: now,
    });

    const customerMessage = args.customerMessage?.trim() || `Your ${order.itemDescription} request has been received by ${current.user?.name ?? current.identity.name ?? current.identity.email ?? 'Parts Team'}.`;
    await ctx.db.insert("notifications", {
      userId: order.userId,
      type: "parts_order_received_by_staff",
      title: "Order received by staff",
      message: customerMessage,
      targetRoute: "PartsOrders",
      targetId: String(order._id),
      isRead: false,
    });
    await ctx.db.insert("messages", {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      senderRole: "staff",
      recipientId: order.userId,
      partsOrderId: order._id,
      content: customerMessage,
      isRead: false,
    });
    const customerUser = await safeDbGet(ctx, order.userId);
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, customerMessage);
      await sendWhatsAppToCustomer(customerUser.phone, customerMessage);
    }

    return null;
  },
});

export const updatePendingItems = mutation({
  args: {
    orderId: v.id("partsOrders"),
    pendingItems: v.string(),
    customerMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!canManage(current.user)) throw new Error("Not authorized");
    if (!await hasPartsMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const pendingItems = args.pendingItems.trim();
    await ctx.db.patch(args.orderId, {
      pendingItems,
      updatedAt: Date.now(),
      acknowledgedAt: order.acknowledgedAt ?? Date.now(),
      status: order.status === "submitted" ? "received" : order.status,
    });

    const customerMessage = args.customerMessage?.trim() || `For ${order.itemDescription}, we still need: ${pendingItems}.`;
    await ctx.db.insert("messages", {
      senderId: current.userId,
      senderName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Staff",
      senderRole: "staff",
      recipientId: order.userId,
      partsOrderId: order._id,
      content: customerMessage,
      isRead: false,
    });
    await ctx.db.insert("notifications", {
      userId: order.userId,
      type: "parts_order_pending_items",
      title: "Pending items update",
      message: customerMessage,
      targetRoute: "PartsOrders",
      targetId: String(order._id),
      isRead: false,
    });
    await notifyPartsDepartmentEmails(
      ctx,
      "Parts order pending items",
      `${order.customerName}'s order for ${order.itemDescription} still needs: ${pendingItems}.`
    );

    const customerUser = await safeDbGet(ctx, order.userId);
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, customerMessage);
      await sendWhatsAppToCustomer(customerUser.phone, customerMessage);
    }

    return null;
  },
});

export const assignOrder = mutation({
  args: {
    orderId: v.id("partsOrders"),
    staffId: v.optional(v.string()),
    assignedToUserId: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!canManage(current.user)) throw new Error("Not authorized");
    if (!await hasPartsMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const targetStaffId = args.assignedToUserId ?? args.staffId ?? undefined;
    const assignedUser = targetStaffId ? await safeDbGet(ctx, targetStaffId) : null;
    const assignedName = args.assignedToName ?? assignedUser?.name ?? assignedUser?.email ?? "Staff";

    await ctx.db.patch(args.orderId, {
      assignedToUserId: targetStaffId,
      assignedToName: assignedName,
      updatedAt: Date.now(),
    });

    if (targetStaffId) {
      await ctx.db.insert("notifications", {
        userId: order.userId,
        type: "parts_order_assigned",
        title: "Order assigned",
        message: `Your ${order.itemDescription} order has been assigned to ${assignedName}.`,
        targetRoute: "PartsOrders",
        targetId: String(order._id),
        isRead: false,
      });

      await ctx.db.insert("notifications", {
        userId: targetStaffId,
        type: "parts_order_assigned",
        title: "New parts order assigned",
        message: `A ${order.orderType} order for ${order.itemDescription} has been assigned to you.`,
        targetRoute: "PartsOrders",
        targetId: String(order._id),
        isRead: false,
      });
      await notifyPartsDepartmentEmails(
        ctx,
        "Parts order assigned",
        `${order.customerName}'s order for ${order.itemDescription} has been assigned to ${assignedName}.`
      );
    }

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: current.userId,
      type: "parts_order_assigned",
      title: "Parts order assigned",
      description: `${order.customerName}'s order for ${order.itemDescription} was assigned to ${assignedName}.`,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      metadata: JSON.stringify({ orderId: String(order._id), assignedToUserId: targetStaffId, assignedToName: assignedName }),
      triggeredBy: current.userId,
    });

    return null;
  },
});