import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireViewer } from "./auth";

function isSalesAdmin(viewer: { isElevated: boolean }) {
  return viewer.isElevated;
}

function requireOwnOrElevated(viewer: { userId: string; isElevated: boolean }, ownerId: string) {
  if (!viewer.isElevated && ownerId !== viewer.userId) {
    throw new Error("Not authorized");
  }
}

function getCustomerOwnerId(customer: any) {
  return String(customer?.ownerId ?? customer?.ownerUserId ?? "").trim();
}

function canAccessCustomerRecord(viewer: any, customer: any) {
  if (viewer?.isElevated) return true;
  const ownerId = getCustomerOwnerId(customer);
  return Boolean(ownerId && ownerId === viewer.userId);
}

function customerProjection(customer: any) {
  return {
    _id: customer._id,
    ownerId: customer.ownerId,
    name: customer.name,
    contactInfo: customer.contactInfo,
    email: customer.email,
    phone: customer.phone,
    notesSummary: customer.notesSummary,
    dealershipId: customer.dealershipId,
    isCommunityVisible: customer.isCommunityVisible,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

const customerValidator = v.object({
  _id: v.id("customers"),
  _creationTime: v.number(),
  ownerId: v.string(),
  dealershipId: v.optional(v.string()),
  name: v.string(),
  contactInfo: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  notesSummary: v.optional(v.string()),
  isCommunityVisible: v.boolean(),
  isDeleted: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const noteValidator = v.object({
  _id: v.id("customerNotes"),
  _creationTime: v.number(),
  ownerId: v.string(),
  customerId: v.id("customerProfiles"),
  authorId: v.string(),
  body: v.string(),
  isDeleted: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const reminderValidator = v.object({
  _id: v.id("customerReminders"),
  _creationTime: v.number(),
  ownerId: v.string(),
  customerId: v.id("customerProfiles"),
  createdBy: v.string(),
  title: v.string(),
  dueAt: v.number(),
  status: v.string(),
  notes: v.optional(v.string()),
  isDeleted: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const directMessageValidator = v.object({
  _id: v.id("directMessages"),
  _creationTime: v.number(),
  ownerId: v.string(),
  customerId: v.optional(v.id("customers")),
  senderId: v.string(),
  recipientId: v.string(),
  body: v.string(),
  isRead: v.boolean(),
  isDeleted: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const financeRecordValidator = v.object({
  _id: v.id("financeRecords"),
  _creationTime: v.number(),
  ownerId: v.string(),
  customerId: v.id("customers"),
  createdBy: v.string(),
  dealValue: v.optional(v.number()),
  status: v.string(),
  lenderName: v.optional(v.string()),
  notes: v.optional(v.string()),
  isDeleted: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function getViewerOrThrow(ctx: any) {
  const viewer = await requireViewer(ctx);
  if (!viewer?.user) throw new Error("Not authenticated");
  return viewer;
}

async function getCustomerOrThrow(ctx: any, customerId: string) {
  const customer = await ctx.db.get(customerId as any);
  if (!customer || customer.isDeleted) throw new Error("Customer not found");
  return customer;
}

function sameCalendarText(value: string | undefined) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function dedupeByKey<T>(rows: T[], keyFn: (row: T) => string) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = keyFn(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildGoogleCalendarUrl(title: string, details: string, date: string, time: string) {
  const [hours, minutes] = time.split(':');
  const start = `${date.replace(/-/g, '')}T${hours}${minutes}00`;
  const endHour = String(Number(hours) + 1).padStart(2, '0');
  const end = `${date.replace(/-/g, '')}T${endHour}${minutes}00`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}&dates=${start}/${end}`;
}

export const getCommunityCustomers = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("customers"),
    ownerId: v.string(),
    name: v.string(),
    contactInfo: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (!viewer) return [];

    const customers = await ctx.db
      .query("customers")
      .withIndex("by_isCommunityVisible_and_createdAt", (q: any) => q.eq("isCommunityVisible", true))
      .order("desc")
      .take(100);

    return customers
      .filter((customer: any) => !customer.isDeleted)
      .map((customer: any) => ({
        _id: customer._id,
        ownerId: customer.ownerId,
        name: customer.name,
        contactInfo: customer.contactInfo,
      }));
  },
});

export const listCustomers = query({
  args: {},
  returns: v.array(customerValidator),
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx);

    if (isSalesAdmin(viewer)) {
      return await ctx.db.query("customers").collect();
    }

    const customers = await ctx.db
      .query("customers")
      .withIndex("by_ownerId_and_createdAt", (q: any) => q.eq("ownerId", viewer.userId))
      .order("desc")
      .collect();
    return customers.filter((customer: any) => !customer.isDeleted);
  },
});

export const createCustomer = mutation({
  args: {
    ownerId: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    name: v.string(),
    contactInfo: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notesSummary: v.optional(v.string()),
    isCommunityVisible: v.boolean(),
  },
  returns: v.id("customers"),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const ownerId = viewer.isElevated ? (args.ownerId ?? viewer.userId) : viewer.userId;
    requireOwnOrElevated(viewer, ownerId);

    const now = Date.now();
    return await ctx.db.insert("customers", {
      ownerId,
      dealershipId: viewer.isElevated ? args.dealershipId : String((viewer as any)?.user?.dealershipId ?? args.dealershipId ?? "") || undefined,
      name: args.name.trim(),
      contactInfo: args.contactInfo?.trim() || undefined,
      email: args.email?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      notesSummary: args.notesSummary?.trim() || undefined,
      isCommunityVisible: args.isCommunityVisible,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCustomer = mutation({
  args: {
    customerId: v.id("customers"),
    dealershipId: v.optional(v.string()),
    name: v.optional(v.string()),
    contactInfo: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notesSummary: v.optional(v.string()),
    isCommunityVisible: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const customer = await getCustomerOrThrow(ctx, String(args.customerId));
    requireOwnOrElevated(viewer, String(customer.ownerId));

    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (args.dealershipId !== undefined) patch.dealershipId = viewer.isElevated ? args.dealershipId : String((viewer as any)?.user?.dealershipId ?? args.dealershipId ?? "") || undefined;
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.contactInfo !== undefined) patch.contactInfo = args.contactInfo.trim() || undefined;
    if (args.email !== undefined) patch.email = args.email.trim() || undefined;
    if (args.phone !== undefined) patch.phone = args.phone.trim() || undefined;
    if (args.notesSummary !== undefined) patch.notesSummary = args.notesSummary.trim() || undefined;
    if (args.isCommunityVisible !== undefined) patch.isCommunityVisible = args.isCommunityVisible;

    await ctx.db.patch(customer._id, patch);
    return null;
  },
});

export const deleteCustomer = mutation({
  args: { customerId: v.id("customers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const customer = await getCustomerOrThrow(ctx, String(args.customerId));
    requireOwnOrElevated(viewer, String(customer.ownerId));
    await ctx.db.patch(customer._id, { isDeleted: true, updatedAt: Date.now() });
    return null;
  },
});

export const listNotes = query({
  args: { customerId: v.id("customerProfiles") },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const customer = await getCustomerOrThrow(ctx, String(args.customerId));
    if (!canAccessCustomerRecord(viewer, customer)) throw new Error("Not authorized");
    const customerOwnerId = getCustomerOwnerId(customer) || viewer.userId;

    const notes = viewer.isElevated
      ? await ctx.db
          .query("customerNotes")
          .withIndex("by_customerId", (q: any) => q.eq("customerId", args.customerId))
          .collect()
      : await ctx.db
          .query("customerNotes")
          .withIndex("by_ownerId_and_customerId", (q: any) => q.eq("ownerId", customerOwnerId).eq("customerId", args.customerId))
          .collect();

    return dedupeByKey(notes.filter((note: any) => !note.isDeleted), (note: any) =>
      [note.authorId, sameCalendarText(note.body), Number(note.createdAt ?? 0) > 0 ? Math.floor(Number(note.createdAt) / 1000) : 0].join('|')
    );
  },
});

export const addNote = mutation({
  args: {
    customerId: v.id("customerProfiles"),
    body: v.string(),
  },
  returns: v.id("customerNotes"),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const customer = await getCustomerOrThrow(ctx, String(args.customerId));
    if (!canAccessCustomerRecord(viewer, customer)) throw new Error("Not authorized");
    const customerOwnerId = getCustomerOwnerId(customer) || viewer.userId;

    const body = sameCalendarText(args.body);
    const recentNotes = await ctx.db
      .query("customerNotes")
      .withIndex("by_ownerId_and_customerId", (q: any) => q.eq("ownerId", customerOwnerId).eq("customerId", args.customerId))
      .order("desc")
      .take(8);
    const duplicate = recentNotes.find((note: any) =>
      !note.isDeleted &&
      sameCalendarText(note.body) === body &&
      note.authorId === viewer.userId &&
      Date.now() - note.createdAt < 10000
    );
    if (duplicate) return duplicate._id;

    const now = Date.now();
    const noteId = await ctx.db.insert("customerNotes", {
      ownerId: customerOwnerId,
      customerId: args.customerId,
      authorId: viewer.userId,
      body,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(customer._id, {
      notesSummary: body,
      updatedAt: now,
    });

    return noteId;
  },
});

export const updateNote = mutation({
  args: {
    noteId: v.id("customerNotes"),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const note = await ctx.db.get(args.noteId);
    if (!note || note.isDeleted) throw new Error("Note not found");
    requireOwnOrElevated(viewer, String(note.ownerId));
    await ctx.db.patch(note._id, { body: args.body.trim(), updatedAt: Date.now() });
    return null;
  },
});

export const deleteNote = mutation({
  args: { noteId: v.id("customerNotes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const note = await ctx.db.get(args.noteId);
    if (!note || note.isDeleted) throw new Error("Note not found");
    requireOwnOrElevated(viewer, String(note.ownerId));
    await ctx.db.patch(note._id, { isDeleted: true, updatedAt: Date.now() });
    return null;
  },
});

export const listReminders = query({
  args: { customerId: v.id("customerProfiles") },
  returns: v.array(reminderValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const customer = await getCustomerOrThrow(ctx, String(args.customerId));
    const customerOwnerId = getCustomerOwnerId(customer) || viewer.userId;
    requireOwnOrElevated(viewer, customerOwnerId);

    const reminders = viewer.isElevated
      ? await ctx.db
          .query("customerReminders")
          .withIndex("by_customerId", (q: any) => q.eq("customerId", args.customerId))
          .collect()
      : await ctx.db
          .query("customerReminders")
          .withIndex("by_ownerId_and_customerId", (q: any) => q.eq("ownerId", customerOwnerId).eq("customerId", args.customerId))
          .collect();

    return dedupeByKey(reminders.filter((reminder: any) => !reminder.isDeleted), (reminder: any) =>
      [reminder.createdBy, sameCalendarText(reminder.title), Number(reminder.dueAt ?? 0), sameCalendarText(reminder.notes), Math.floor(Number(reminder.createdAt ?? 0) / 1000)].join('|')
    );
  },
});

export const addReminder = mutation({
  args: {
    customerId: v.id("customerProfiles"),
    title: v.string(),
    dueAt: v.number(),
    notes: v.optional(v.string()),
  },
  returns: v.id("customerReminders"),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const customer = await getCustomerOrThrow(ctx, String(args.customerId));
    const customerOwnerId = getCustomerOwnerId(customer) || viewer.userId;
    requireOwnOrElevated(viewer, customerOwnerId);

    const title = sameCalendarText(args.title);
    const notes = sameCalendarText(args.notes);
    const recentReminders = await ctx.db
      .query("customerReminders")
      .withIndex("by_ownerId_and_customerId", (q: any) => q.eq("ownerId", customerOwnerId).eq("customerId", args.customerId))
      .order("desc")
      .take(8);
    const duplicate = recentReminders.find((reminder: any) =>
      !reminder.isDeleted &&
      sameCalendarText(reminder.title) === title &&
      reminder.dueAt === args.dueAt &&
      sameCalendarText(reminder.notes) === notes &&
      reminder.createdBy === viewer.userId &&
      Date.now() - reminder.createdAt < 10000
    );
    if (duplicate) return duplicate._id;

    const now = Date.now();
    const reminderId = await ctx.db.insert("customerReminders", {
      ownerId: customerOwnerId,
      customerId: args.customerId,
      createdBy: viewer.userId,
      title,
      dueAt: args.dueAt,
      notes: notes || undefined,
      status: "open",
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    const dueDate = new Date(args.dueAt);
    const date = dueDate.toISOString().split("T")[0];
    const time = `${String(dueDate.getHours()).padStart(2, "0")}:${String(dueDate.getMinutes()).padStart(2, "0")}`;
    const googleCalendarUrl = buildGoogleCalendarUrl(title, notes, date, time);
    await ctx.db.insert("calendarEntries", {
      userId: customerOwnerId,
      title,
      details: notes || undefined,
      date,
      time,
      endDate: undefined,
      allDay: false,
      source: "customer_reminder",
      reminderAt: args.dueAt,
      googleCalendarUrl,
      createdBy: viewer.userId,
      isCompleted: false,
    });

    const delay = args.dueAt - Date.now();
    if (delay > 0) {
      await ctx.scheduler.runAfter(delay, internal.emails.sendCalendarReminder, {
        userId: String(customer.ownerId),
        title,
        details: notes || undefined,
        date,
        time,
        calendarEntryId: reminderId,
      });
    }

    return reminderId;
  },
});

export const updateReminder = mutation({
  args: {
    reminderId: v.id("customerReminders"),
    title: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder || reminder.isDeleted) throw new Error("Reminder not found");
    requireOwnOrElevated(viewer, String(reminder.ownerId));

    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.dueAt !== undefined) patch.dueAt = args.dueAt;
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(reminder._id, patch);
    return null;
  },
});

export const deleteReminder = mutation({
  args: { reminderId: v.id("customerReminders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder || reminder.isDeleted) throw new Error("Reminder not found");
    requireOwnOrElevated(viewer, String(reminder.ownerId));
    await ctx.db.patch(reminder._id, { isDeleted: true, updatedAt: Date.now() });
    return null;
  },
});

export const listDirectMessages = query({
  args: { customerId: v.optional(v.id("customers")) },
  returns: v.array(directMessageValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);

    if (viewer.isElevated) {
      const messages = args.customerId
        ? await ctx.db
            .query("directMessages")
            .withIndex("by_customerId", (q: any) => q.eq("customerId", args.customerId))
            .collect()
        : await ctx.db.query("directMessages").collect();
      return messages.filter((message: any) => !message.isDeleted);
    }

    const messages = args.customerId
      ? await ctx.db
          .query("directMessages")
          .withIndex("by_ownerId_and_customerId", (q: any) => q.eq("ownerId", viewer.userId).eq("customerId", args.customerId!))
          .collect()
      : await ctx.db
          .query("directMessages")
          .withIndex("by_ownerId", (q: any) => q.eq("ownerId", viewer.userId))
          .collect();

    return messages.filter((message: any) => !message.isDeleted);
  },
});

export const sendDirectMessage = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    recipientId: v.string(),
    body: v.string(),
  },
  returns: v.id("directMessages"),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const customer = args.customerId ? await getCustomerOrThrow(ctx, String(args.customerId)) : null;
    if (customer) requireOwnOrElevated(viewer, String(customer.ownerId));

    const ownerId = customer ? String(customer.ownerId) : viewer.userId;
    const now = Date.now();
    const messageId = await ctx.db.insert("directMessages", {
      ownerId,
      customerId: args.customerId,
      senderId: viewer.userId,
      recipientId: args.recipientId,
      body: args.body.trim(),
      isRead: false,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.action.sendSecurePushToUser, {
      userId: args.recipientId,
      title: "You have a new direct message",
      body: "Open the app to view it.",
      data: { screen: "Messages", messageId: String(messageId), customerId: args.customerId ? String(args.customerId) : null },
    });

    return messageId;
  },
});

export const markDirectMessageRead = mutation({
  args: { messageId: v.id("directMessages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message || message.isDeleted) throw new Error("Message not found");
    requireOwnOrElevated(viewer, String(message.ownerId));
    await ctx.db.patch(message._id, { isRead: true, updatedAt: Date.now() });
    return null;
  },
});

export const listFinanceRecords = query({
  args: { customerId: v.id("customers") },
  returns: v.array(financeRecordValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const customer = await getCustomerOrThrow(ctx, String(args.customerId));
    requireOwnOrElevated(viewer, String(customer.ownerId));

    const records = viewer.isElevated
      ? await ctx.db
          .query("financeRecords")
          .withIndex("by_customerId", (q: any) => q.eq("customerId", args.customerId))
          .collect()
      : await ctx.db
          .query("financeRecords")
          .withIndex("by_ownerId_and_customerId", (q: any) => q.eq("ownerId", viewer.userId).eq("customerId", args.customerId))
          .collect();

    return records.filter((record: any) => !record.isDeleted);
  },
});

export const addFinanceRecord = mutation({
  args: {
    customerId: v.id("customers"),
    dealValue: v.optional(v.number()),
    status: v.string(),
    lenderName: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.id("financeRecords"),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const customer = await getCustomerOrThrow(ctx, String(args.customerId));
    requireOwnOrElevated(viewer, String(customer.ownerId));

    const now = Date.now();
    return await ctx.db.insert("financeRecords", {
      ownerId: String(customer.ownerId),
      customerId: args.customerId,
      createdBy: viewer.userId,
      dealValue: args.dealValue,
      status: args.status.trim(),
      lenderName: args.lenderName?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateFinanceRecord = mutation({
  args: {
    financeRecordId: v.id("financeRecords"),
    dealValue: v.optional(v.number()),
    status: v.optional(v.string()),
    lenderName: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const record = await ctx.db.get(args.financeRecordId);
    if (!record || record.isDeleted) throw new Error("Finance record not found");
    requireOwnOrElevated(viewer, String(record.ownerId));

    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (args.dealValue !== undefined) patch.dealValue = args.dealValue;
    if (args.status !== undefined) patch.status = args.status.trim();
    if (args.lenderName !== undefined) patch.lenderName = args.lenderName.trim() || undefined;
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    await ctx.db.patch(record._id, patch);
    return null;
  },
});

export const deleteFinanceRecord = mutation({
  args: { financeRecordId: v.id("financeRecords") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const record = await ctx.db.get(args.financeRecordId);
    if (!record || record.isDeleted) throw new Error("Finance record not found");
    requireOwnOrElevated(viewer, String(record.ownerId));
    await ctx.db.patch(record._id, { isDeleted: true, updatedAt: Date.now() });
    return null;
  },
});

export const getCustomerFeedSummary = query({
  args: { customerId: v.id("customers") },
  returns: v.union(v.null(), v.object({
    customerId: v.id("customers"),
    noteCount: v.number(),
    reminderCount: v.number(),
    messageCount: v.number(),
    financeRecordCount: v.number(),
  })),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx);
    const customer = await getCustomerOrThrow(ctx, String(args.customerId));
    const customerOwnerId = getCustomerOwnerId(customer) || viewer.userId;
    requireOwnOrElevated(viewer, customerOwnerId);

    const notes = await ctx.db
      .query("customerNotes")
      .withIndex(viewer.isElevated ? "by_customerId" : "by_ownerId_and_customerId", (q: any) =>
        viewer.isElevated ? q.eq("customerId", args.customerId) : q.eq("ownerId", customerOwnerId).eq("customerId", args.customerId)
      )
      .collect();
    const reminders = await ctx.db
      .query("customerReminders")
      .withIndex(viewer.isElevated ? "by_customerId" : "by_ownerId_and_customerId", (q: any) =>
        viewer.isElevated ? q.eq("customerId", args.customerId) : q.eq("ownerId", customerOwnerId).eq("customerId", args.customerId)
      )
      .collect();
    const messages = await ctx.db
      .query("directMessages")
      .withIndex(viewer.isElevated ? "by_customerId" : "by_ownerId_and_customerId", (q: any) =>
        viewer.isElevated ? q.eq("customerId", args.customerId) : q.eq("ownerId", customerOwnerId).eq("customerId", args.customerId)
      )
      .collect();
    const financeRecords = await ctx.db
      .query("financeRecords")
      .withIndex(viewer.isElevated ? "by_customerId" : "by_ownerId_and_customerId", (q: any) =>
        viewer.isElevated ? q.eq("customerId", args.customerId) : q.eq("ownerId", customerOwnerId).eq("customerId", args.customerId)
      )
      .collect();

    return {
      customerId: args.customerId,
      noteCount: notes.filter((row: any) => !row.isDeleted).length,
      reminderCount: reminders.filter((row: any) => !row.isDeleted).length,
      messageCount: messages.filter((row: any) => !row.isDeleted).length,
      financeRecordCount: financeRecords.filter((row: any) => !row.isDeleted).length,
    };
  },
});