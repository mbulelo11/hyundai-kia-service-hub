import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { sendSMSToCustomer, sendWhatsAppToCustomer } from './emails';

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";

function isAdminLikeUser(user: any) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  const role = String(user?.staffRole ?? user?.role ?? "").trim().toLowerCase();
  return Boolean(
    user?.isOwner ||
    email === VINCENT_ADMIN_EMAIL ||
    role === "admin" ||
    role === "dealer_principal" ||
    role === "dp" ||
    role === "moderator"
  );
}

function canSeeAllWorkspace(user: any) {
  return isAdminLikeUser(user);
}

function canInspectAnyDirectChat(user: any) {
  return isAdminLikeUser(user);
}

function canAdminViewAllDirectMessages(current: any) {
  return isAdminLikeUser(current);
}

const messageReturn = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  bookingId: v.optional(v.id("bookings")),
  partsOrderId: v.optional(v.id("partsOrders")),
  senderId: v.string(),
  senderName: v.string(),
  senderRole: v.string(),
  recipientId: v.optional(v.string()),
  content: v.string(),
  customerName: v.optional(v.string()),
  customerPhone: v.optional(v.string()),
  customerEmail: v.optional(v.string()),
  vehicleInventoryItemId: v.optional(v.id("inventory")),
  vehicleDescription: v.optional(v.string()),
  vehicleImageUrl: v.optional(v.string()),
  vehicleYear: v.optional(v.number()),
  vehicleMake: v.optional(v.string()),
  vehicleModel: v.optional(v.string()),
  vehicleVariant: v.optional(v.string()),
  vehiclePrice: v.optional(v.number()),
  vehicleColor: v.optional(v.string()),
  attachmentUrls: v.optional(v.array(v.string())),
  attachmentNames: v.optional(v.array(v.string())),
  isRead: v.boolean(),
  isArchived: v.optional(v.boolean()),
  archivedAt: v.optional(v.number()),
});

// Extract the base user ID from a potentially compound "userId|sessionId" format
function extractBaseId(id: string): string {
  if (!id) return "";
  const pipeIndex = id.indexOf("|");
  return pipeIndex > 0 ? id.substring(0, pipeIndex) : id;
}

async function safeDbGet(ctx: any, id: string | null | undefined) {
  if (!id) return null;
  try {
    return await ctx.db.get(id as any);
  } catch {
    return null;
  }
}

async function resolveAttachmentUrls(ctx: any, storageIds?: string[] | null) {
  if (!storageIds?.length) return undefined;
  const urls = await Promise.all(storageIds.map((id) => ctx.storage.getUrl(id)));
  return urls.filter((url): url is string => Boolean(url));
}

function pickPreferredUserByEmail(users: any[]) {
  return users
    .filter((user: any) => user && !user.isDeleted)
    .sort((a: any, b: any) => {
      const aScore = (a?.role === "staff" || a?.staffRole || a?.isOwner ? 100 : 0);
      const bScore = (b?.role === "staff" || b?.staffRole || b?.isOwner ? 100 : 0);
      return bScore - aScore || Number(b._creationTime ?? 0) - Number(a._creationTime ?? 0);
    })[0] ?? null;
}

function extractPhoneFromText(value?: string | null) {
  const text = String(value ?? '');
  const labeledMatch = text.match(/(?:^|\n|\r|\s)(?:phone|tel|mobile|whatsapp)\s*[:\-]?\s*([+\d][\d\s()\-]{7,})/i);
  if (labeledMatch?.[1]) return labeledMatch[1].trim();
  const looseMatch = text.match(/(?:\+?\d[\d\s()\-]{7,}\d)/);
  return looseMatch?.[0]?.trim();
}

function getWorkspaceRecipients(allUsers: any[], currentUserId: string): string[] {
  return Array.from(
    new Set(
      allUsers
        .filter((user: any) => {
          const role = String(user.role ?? '').trim().toLowerCase();
          const staffRole = String(user.staffRole ?? '').trim().toLowerCase();
          const email = String(user.email ?? '').trim().toLowerCase();
          return Boolean(
            user.isOwner ||
            email === VINCENT_ADMIN_EMAIL ||
            role === 'admin' ||
            role === 'staff' ||
            staffRole === 'dp' ||
            staffRole === 'moderator' ||
            staffRole === 'regional' ||
            staffRole === 'regional_manager' ||
            String(user.accessLevel ?? '').trim().toLowerCase() === 'full_access'
          );
        })
        .map((user: any) => String(user._id))
        .filter((userId: string) => userId !== currentUserId)
    )
  );
}

async function getDefaultEnquiryRecipientId(ctx: any, currentUserId: string) {
  const allUsers = await ctx.db.query('users').collect();
  const salesRecipients = getWorkspaceRecipients(allUsers, currentUserId).filter((userId: string) => {
    const user = allUsers.find((row: any) => String(row._id) === String(userId));
    const role = String(user?.staffRole ?? user?.role ?? '').trim().toLowerCase();
    return [
      'sales_executive',
      'sales_manager',
      'sales',
      'dp',
      'admin',
      'dealer_principal',
    ].includes(role) || Boolean(user?.isOwner);
  });
  return salesRecipients[0] ?? getWorkspaceRecipients(allUsers, currentUserId)[0] ?? null;
}

async function getSalesEnquiryRecipients(ctx: any, currentUserId: string) {
  const allUsers = await ctx.db.query('users').collect();
  return getWorkspaceRecipients(allUsers, currentUserId).filter((userId: string) => {
    const user = allUsers.find((row: any) => String(row._id) === String(userId));
    const role = String(user?.staffRole ?? user?.role ?? '').trim().toLowerCase();
    return [
      'sales_executive',
      'sales_manager',
      'sales',
      'dp',
      'admin',
      'dealer_principal',
    ].includes(role) || Boolean(user?.isOwner);
  });
}

async function getOnlineSalesEnquiryRecipients(ctx: any, currentUserId: string) {
  const allUsers = await ctx.db.query('users').collect();
  const salesRecipients = await getSalesEnquiryRecipients(ctx, currentUserId);
  const now = Date.now();
  const online = salesRecipients.filter((userId: string) => {
    const user = allUsers.find((row: any) => String(row._id) === String(userId));
    return typeof user?.lastSeenAt === 'number' && now - user.lastSeenAt < 2 * 60 * 1000;
  });
  return online.length ? online : salesRecipients;
}

// Check if two IDs refer to the same user (handles compound IDs)
function sameUser(id1: string, id2: string): boolean {
  if (!id1 || !id2) return false;
  return extractBaseId(id1) === extractBaseId(id2);
}

// Helper: get stable user ID from identity
async function getStableUserId(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const subject = identity.subject ?? "";

  // Strategy 1: Try direct lookup of subject as document ID
  try {
    const doc = await ctx.db.get(subject);
    if (doc) {
      if (doc.userId) {
        const user = await ctx.db.get(doc.userId);
        if (user) {
          return {
            userId: String(user._id),
            user,
            name: user.name || identity.name || identity.email || "User",
            email: user.email,
            role: user.role || "customer",
          };
        }
      }
      if (doc.email) {
        const matches = await ctx.db.query("users").withIndex("email", (q: any) => q.eq("email", doc.email)).collect();
        const preferred = pickPreferredUserByEmail(matches);
        const resolved = preferred ?? doc;
        return {
          userId: String(resolved._id),
          user: resolved,
          name: resolved.name || identity.name || identity.email || "User",
          email: resolved.email,
          role: resolved.role || "customer",
        };
      }
    }
  } catch {}

  // Strategy 2: If subject is compound "userId|sessionId", try each part
  if (subject.includes("|")) {
    const parts = subject.split("|");
    for (const part of parts) {
      try {
        const doc = await ctx.db.get(part);
        if (doc) {
          if (doc.userId) {
            const user = await ctx.db.get(doc.userId);
            if (user) {
              return {
                userId: String(user._id),
                user,
                name: user.name || identity.name || identity.email || "User",
                email: user.email,
                role: user.role || "customer",
              };
            }
          }
          if (doc.email) {
            const matches = await ctx.db.query("users").withIndex("email", (q: any) => q.eq("email", doc.email)).collect();
            const preferred = pickPreferredUserByEmail(matches);
            const resolved = preferred ?? doc;
            return {
              userId: String(resolved._id),
              user: resolved,
              name: resolved.name || identity.name || identity.email || "User",
              email: resolved.email,
              role: resolved.role || "customer",
            };
          }
        }
      } catch {}
    }
  }

  // Strategy 3: Fallback to email lookup
  const email = identity.email ?? "";
  if (email) {
    const users = await ctx.db.query("users").withIndex("email", (q: any) => q.eq("email", email)).collect();
    const preferred = pickPreferredUserByEmail(users);
    if (preferred) {
      return {
        userId: String(preferred._id),
        user: preferred,
        name: preferred.name || identity.name || email,
        email: preferred.email,
        role: preferred.role || "customer",
      };
    }
  }

  return null;
}

// Helper: get the current authenticated user with role metadata
async function getCurrentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  let userId = String(identity.subject);
  let user: any = null;

  try {
    const subjectDoc = await ctx.db.get(identity.subject as any);
    if (subjectDoc?.userId) {
      const nestedUser = await ctx.db.get(subjectDoc.userId as any);
      if (nestedUser) {
        userId = String(nestedUser._id);
        user = nestedUser;
      }
    } else if (subjectDoc?.email !== undefined || subjectDoc?.role !== undefined) {
      userId = String(subjectDoc._id);
      user = subjectDoc;
    }
  } catch {}

  if (!user && identity.email) {
    const foundUsers = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", identity.email))
      .collect();
    const preferred = pickPreferredUserByEmail(foundUsers);
    if (preferred) {
      userId = String(preferred._id);
      user = preferred;
    }
  }

  const email = String(user?.email ?? identity.email ?? "").trim().toLowerCase();
  const isModerator = Boolean(
    user?.isOwner ||
    email === VINCENT_ADMIN_EMAIL ||
    user?.staffRole === "dp"
  );

  return {
    identity,
    userId,
    user,
    name: user?.name || identity.name || identity.email || "User",
    email,
    role: user?.role || "customer",
    isModerator,
  };
}

function canAccessBooking(current: any, booking: any) {
  if (!current || !booking) return false;
  return canSeeAllWorkspace(current.user) || sameUser(booking.ownerUserId ?? "", current.userId) || sameUser(booking.userId, current.userId) || sameUser(booking.assignedTo ?? "", current.userId) || sameUser(booking.assignedToUserId ?? "", current.userId) || sameUser(booking.assignedDriverId ?? "", current.userId);
}

// Look up a user's name from their ID (handles compound IDs)
async function lookupUserName(ctx: any, id: string): Promise<string> {
  const baseId = extractBaseId(id);
  if (!baseId) return "Unknown";
  const user = await safeDbGet(ctx, baseId);
  if (user?.name) return user.name;
  if (user?.email) return user.email.split("@")[0];
  // Maybe it's a session - try userId field
  if (user?.userId) {
    const realUser = await safeDbGet(ctx, user.userId);
    if (realUser?.name) return realUser.name;
    if (realUser?.email) return realUser.email.split("@")[0];
  }
  return "User";
}

// MIGRATION: Fix all existing messages with compound IDs and empty names
export const migrateMessages = mutation({
  args: {},
  returns: v.object({ fixed: v.number(), total: v.number() }),
  handler: async (ctx) => {
    const allMessages = await ctx.db.query("messages").collect();
    let fixed = 0;

    for (const msg of allMessages) {
      const patches: any = {};
      let needsPatch = false;

      // Fix compound senderId
      if (msg.senderId && msg.senderId.includes("|")) {
        patches.senderId = extractBaseId(msg.senderId);
        needsPatch = true;
      }

      // Fix compound recipientId
      if (msg.recipientId && msg.recipientId.includes("|")) {
        patches.recipientId = extractBaseId(msg.recipientId);
        needsPatch = true;
      }

      // Fix empty senderName
      if (!msg.senderName || msg.senderName.trim() === "") {
        const senderId = patches.senderId || msg.senderId;
        patches.senderName = await lookupUserName(ctx, senderId);
        needsPatch = true;
      }

      // Fix senderRole if needed
      if (msg.senderId) {
        const baseId = extractBaseId(msg.senderId);
        try {
          const user = await ctx.db.get(baseId);
          if (user?.role && user.role !== msg.senderRole) {
            patches.senderRole = user.role;
            needsPatch = true;
          }
        } catch {}
      }

      if (needsPatch) {
        await ctx.db.patch(msg._id, patches);
        fixed++;
      }
    }

    return { fixed, total: allMessages.length };
  },
});

export const send = mutation({
  args: {
    bookingId: v.optional(v.id("bookings")),
    partsOrderId: v.optional(v.id("partsOrders")),
    recipientId: v.optional(v.string()),
    content: v.string(),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    vehicleInventoryItemId: v.optional(v.id("inventory")),
    vehicleDescription: v.optional(v.string()),
    vehicleImageUrl: v.optional(v.string()),
    vehicleYear: v.optional(v.number()),
    vehicleMake: v.optional(v.string()),
    vehicleModel: v.optional(v.string()),
    vehicleVariant: v.optional(v.string()),
    vehiclePrice: v.optional(v.number()),
    vehicleColor: v.optional(v.string()),
    attachmentStorageIds: v.optional(v.array(v.string())),
    attachmentNames: v.optional(v.array(v.string())),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const userInfo = await getStableUserId(ctx);
    if (!userInfo) throw new Error("Not authenticated");

    const senderRole = userInfo.role === "staff" ? "staff" : "customer";
    const isCustomerEnquiry = Boolean(!args.bookingId && senderRole === 'customer' && !args.recipientId);
    const defaultRecipientId = isCustomerEnquiry
      ? await getDefaultEnquiryRecipientId(ctx, userInfo.userId)
      : null;
    const cleanRecipientId = args.recipientId ? extractBaseId(args.recipientId) : defaultRecipientId ? extractBaseId(defaultRecipientId) : undefined;
    const recipientTarget = cleanRecipientId ? await resolveRecipientTarget(ctx, cleanRecipientId) : null;
    const messageRecipientId = recipientTarget?.resolvedUserId ?? cleanRecipientId;
    const isEnquiryMessage = Boolean(isCustomerEnquiry || (!args.bookingId && !cleanRecipientId && senderRole === 'customer'));

    if (!(await canSendToRecipient(ctx, userInfo, cleanRecipientId ?? null, args.bookingId))) {
      throw new Error("Not authorized");
    }

    const msgId = await ctx.db.insert("messages", {
      bookingId: args.bookingId,
      partsOrderId: args.partsOrderId,
      senderId: userInfo.userId,
      senderName: userInfo.name,
      senderRole,
      recipientId: messageRecipientId,
      content: args.content,
      customerName: args.customerName ?? (senderRole === 'customer' ? userInfo.name : undefined),
      customerPhone: args.customerPhone ?? userInfo.user?.phone ?? undefined,
      customerEmail: args.customerEmail ?? userInfo.user?.email ?? undefined,
      vehicleInventoryItemId: args.vehicleInventoryItemId,
      vehicleDescription: args.vehicleDescription,
      vehicleImageUrl: args.vehicleImageUrl,
      vehicleYear: args.vehicleYear,
      vehicleMake: args.vehicleMake,
      vehicleModel: args.vehicleModel,
      vehicleVariant: args.vehicleVariant,
      vehiclePrice: args.vehiclePrice,
      vehicleColor: args.vehicleColor,
      attachmentStorageIds: args.attachmentStorageIds,
      attachmentNames: args.attachmentNames,
      isRead: false,
    });

    if (messageRecipientId) {
      const recipientRoute = senderRole === 'staff' ? 'Messages' : 'StaffChat';
      const recipientPhone = recipientTarget?.phone ?? recipientTarget?.directDoc?.phone ?? recipientTarget?.linkedUser?.phone;
      await ctx.db.insert("notifications", {
        userId: messageRecipientId,
        type: "new_message",
        title: senderRole === "staff" ? "New staff message" : "New direct message",
        message: args.content.substring(0, 100) + (args.content.length > 100 ? "..." : ""),
        senderId: userInfo.userId,
        bookingId: args.bookingId,
        targetRoute: recipientRoute,
        targetId: userInfo.userId,
        isRead: false,
      });

      if (senderRole === 'staff' && recipientPhone) {
        const staffText = args.content.substring(0, 100) + (args.content.length > 100 ? '...' : '');
        await sendSMSToCustomer(recipientPhone, staffText);
        await sendWhatsAppToCustomer(recipientPhone, staffText);
      }
    }

    const allUsers = await ctx.db.query("users").collect();
    const moderatorUsers = getWorkspaceRecipients(allUsers, userInfo.userId);

    if (senderRole === "customer") {
      await ctx.db.insert("notifications", {
        userId: userInfo.userId,
        type: args.bookingId ? "booking_message_sent" : isEnquiryMessage ? "enquiry_sent" : "direct_message_sent",
        title: args.bookingId ? "Message Sent" : isEnquiryMessage ? "Enquiry Sent" : "Message Sent",
        message: args.content.substring(0, 100) + (args.content.length > 100 ? "..." : ""),
        senderId: userInfo.userId,
        bookingId: args.bookingId,
        vehicleInventoryItemId: args.vehicleInventoryItemId,
        vehicleDescription: args.vehicleDescription,
        vehicleImageUrl: args.vehicleImageUrl,
        vehicleYear: args.vehicleYear,
        vehicleMake: args.vehicleMake,
        vehicleModel: args.vehicleModel,
        vehicleVariant: args.vehicleVariant,
        vehiclePrice: args.vehiclePrice,
        vehicleColor: args.vehicleColor,
        targetRoute: args.bookingId ? "StaffBookingDetail" : "ActivityFeed",
        targetId: args.bookingId ? String(args.bookingId) : userInfo.userId,
        isRead: true,
      });

      for (const s of moderatorUsers) {
        if (cleanRecipientId && sameUser(s, cleanRecipientId)) continue;
        await ctx.db.insert("notifications", {
          userId: s,
          type: "new_message",
          title: args.bookingId ? "New booking message" : isEnquiryMessage ? "New enquiry from " + userInfo.name : "New direct message from " + userInfo.name,
          message: args.content.substring(0, 100) + (args.content.length > 100 ? "..." : ""),
          senderId: userInfo.userId,
          customerUserId: userInfo.userId,
          customerName: userInfo.name,
          customerPhone: userInfo.user?.phone ?? undefined,
          customerEmail: userInfo.user?.email ?? undefined,
          vehicleInventoryItemId: args.vehicleInventoryItemId,
          vehicleDescription: args.vehicleDescription,
          vehicleImageUrl: args.vehicleImageUrl,
          vehicleYear: args.vehicleYear,
          vehicleMake: args.vehicleMake,
          vehicleModel: args.vehicleModel,
          vehicleVariant: args.vehicleVariant,
          vehiclePrice: args.vehiclePrice,
          vehicleColor: args.vehicleColor,
          bookingId: args.bookingId,
          targetRoute: args.bookingId ? "StaffBookingDetail" : "StaffChat",
          targetId: args.bookingId ? String(args.bookingId) : userInfo.userId,
          isRead: false,
        });
      }

      if (isEnquiryMessage) {
        const enquiryRecipients = await getSalesEnquiryRecipients(ctx, userInfo.userId);
        const enquiryTitle = `New Enquiry from ${userInfo.name}`;
        const enquiryMessage = [
          `Customer: ${userInfo.name}`,
          userInfo.user?.phone ? `Phone: ${userInfo.user.phone}` : null,
          userInfo.user?.email ? `Email: ${userInfo.user.email}` : null,
          args.vehicleDescription ? `Vehicle: ${args.vehicleDescription}` : null,
          `Message: ${args.content}`,
        ].filter(Boolean).join("\n");

        for (const userId of enquiryRecipients) {
          await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
            userId,
            title: enquiryTitle,
            message: enquiryMessage,
          });
        }
      }
    }

    if (args.bookingId && !cleanRecipientId) {
      const booking = await ctx.db.get(args.bookingId);
      if (booking) {
        const targetId = senderRole === "customer" ? (booking.ownerUserId ?? booking.assignedTo ?? booking.assignedToUserId) : booking.userId;
        if (targetId && !sameUser(targetId, userInfo.userId)) {
          await ctx.db.insert("notifications", {
            userId: extractBaseId(targetId),
            type: "new_message",
            title: senderRole === "staff" ? "Reply from Service Advisor" : "New customer message",
            message: args.content.substring(0, 100) + (args.content.length > 100 ? "..." : ""),
            senderId: userInfo.userId,
            bookingId: args.bookingId,
            targetRoute: "StaffBookingDetail",
            targetId: String(args.bookingId),
            isRead: false,
          });
        }
      }
    }

    if (!args.bookingId) {
      if (senderRole === 'customer' && isEnquiryMessage) {
        await ctx.scheduler.runAfter(24 * 60 * 60 * 1000, internal.messages.sendEnquiryFollowUpReminder, {
          messageId: msgId,
        });
      }
    }

    if (senderRole === "customer") {
      await ctx.runMutation(internal.activityLog.logInternal, {
        ownerUserId: userInfo.userId,
        type: args.bookingId ? "message_received" : isEnquiryMessage ? "customer_enquiry" : "customer_message",
        title: args.bookingId ? "New Message" : isEnquiryMessage ? "New Enquiry" : "New Message",
        description: `${userInfo.name}: "${args.content.substring(0, 120)}${args.content.length > 120 ? "..." : ""}"`,
        customerName: userInfo.name,
        customerPhone: userInfo.user?.phone ?? undefined,
        customerEmail: userInfo.user?.email ?? undefined,
        metadata: JSON.stringify({ bookingId: args.bookingId?.toString(), senderId: userInfo.userId, customerPhone: userInfo.user?.phone, customerEmail: userInfo.user?.email }),
        triggeredBy: userInfo.userId,
      });
    }

    return msgId;
  },
});

export const generateAttachmentUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

export const broadcast = mutation({
  args: {
    audience: v.union(v.literal("customers"), v.literal("users")),
    content: v.string(),
  },
  returns: v.object({ sentCount: v.number() }),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !current.isModerator) {
      throw new Error("Not authorized");
    }

    const recipientIds = new Set<string>();

    if (args.audience === "customers") {
      const profiles = await ctx.db.query("customerProfiles").collect();
      for (const profile of profiles) {
        if (typeof profile.linkedUserId === "string" && profile.linkedUserId.trim()) {
          recipientIds.add(extractBaseId(profile.linkedUserId));
        }
      }
    } else {
      const users = await ctx.db.query("users").collect();
      for (const user of users) {
        if (!user.isDeleted) {
          recipientIds.add(String(user._id));
        }
      }
    }

    recipientIds.delete(current.userId);

    let sentCount = 0;
    for (const recipientId of recipientIds) {
      await ctx.db.insert("messages", {
        senderId: current.userId,
        senderName: current.name,
        senderRole: "staff",
        recipientId,
        content: args.content,
        isRead: false,
      });

      await ctx.db.insert("notifications", {
        userId: recipientId,
        type: "new_message",
        title: args.audience === "customers" ? "New message for customers" : "New message for users",
        message: args.content.substring(0, 100) + (args.content.length > 100 ? "..." : ""),
        senderId: current.userId,
        isRead: false,
      });
      sentCount++;
    }

    return { sentCount };
  },
});

export const sendEnquiryFollowUpReminder = internalMutation({
  args: {
    messageId: v.id("messages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const enquiry = await ctx.db.get(args.messageId);
    if (!enquiry || enquiry.bookingId || enquiry.senderRole !== "customer") {
      return null;
    }

    const allUsers = await ctx.db.query("users").collect();
    const salesUsers = getWorkspaceRecipients(allUsers, String(enquiry.senderId ?? "")).filter((userId: string) => {
      const user = allUsers.find((row: any) => String(row._id) === String(userId));
      const role = String(user?.staffRole ?? user?.role ?? "").trim().toLowerCase();
      return [
        'sales_executive',
        'sales_manager',
        'sales',
        'dp',
        'admin',
        'dealer_principal',
      ].includes(role) || Boolean(user?.isOwner);
    });

    for (const user of allUsers) {
      const isModerator = user.isOwner || String(user.email ?? "").trim().toLowerCase() === VINCENT_ADMIN_EMAIL || user.staffRole === "dp" || user.staffRole === "regional" || user.staffRole === "regional_manager";
      const role = String(user?.staffRole ?? user?.role ?? "").trim().toLowerCase();
      if (!isModerator && !['sales_executive', 'sales_manager', 'sales'].includes(role)) continue;
      await ctx.db.insert("notifications", {
        userId: String(user._id),
        type: "enquiry_reminder",
        title: "Follow Up Required",
        message: `Please follow up on ${enquiry.senderName}'s enquiry: ${enquiry.content.substring(0, 120)}${enquiry.content.length > 120 ? "..." : ""}`,
        isRead: false,
      });
    }

    for (const userId of salesUsers) {
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
        userId,
        title: "Follow Up Required",
        message: `Please follow up on ${enquiry.senderName}'s enquiry: ${enquiry.content.substring(0, 120)}${enquiry.content.length > 120 ? "..." : ""}`,
      });
    }

    return null;
  },
});

export const listByBooking = query({
  args: { bookingId: v.id("bookings") },
  returns: v.array(messageReturn),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const booking = await ctx.db.get(args.bookingId);
    if (!booking || !canAccessBooking(current, booking)) return [];

    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_bookingId", (q: any) => q.eq("bookingId", args.bookingId))
      .order("asc")
      .collect();

    const results = [];
    for (const m of msgs) {
      let name = m.senderName;
      if (!name || name.trim() === "") {
        name = await lookupUserName(ctx, m.senderId);
      }
      const attachmentUrls = await resolveAttachmentUrls(ctx, m.attachmentStorageIds);
      results.push({
        _id: m._id,
        _creationTime: m._creationTime,
        bookingId: m.bookingId,
        partsOrderId: m.partsOrderId,
        senderId: extractBaseId(m.senderId),
        senderName: name,
        senderRole: m.senderRole,
        recipientId: m.recipientId ? extractBaseId(m.recipientId) : undefined,
        content: m.content,
        customerName: m.customerName,
        customerPhone: m.customerPhone,
        customerEmail: m.customerEmail,
        vehicleInventoryItemId: m.vehicleInventoryItemId,
        vehicleDescription: m.vehicleDescription,
        vehicleImageUrl: m.vehicleImageUrl,
        vehicleYear: m.vehicleYear,
        vehicleMake: m.vehicleMake,
        vehicleModel: m.vehicleModel,
        vehicleVariant: m.vehicleVariant,
        vehiclePrice: m.vehiclePrice,
        vehicleColor: m.vehicleColor,
        attachmentUrls,
        attachmentNames: m.attachmentNames,
        isRead: m.isRead,
      });
    }
    return results;
  },
});

export const listPartsOrderMessages = query({
  args: { partsOrderId: v.id("partsOrders") },
  returns: v.array(messageReturn),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const order = await ctx.db.get(args.partsOrderId);
    if (!order) return [];

    const isOrderCustomer = sameUser(String(order.userId), current.userId);
    const isStaffViewer = current.isModerator || current.role === "staff" || current.user?.role === "staff" || Boolean(current.user?.staffRole || current.user?.accessLevel || current.user?.department || current.user?.isOwner);
    if (!isOrderCustomer && !isStaffViewer) return [];

    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_partsOrderId", (q: any) => q.eq("partsOrderId", args.partsOrderId))
      .order("asc")
      .collect();

    const results = [];
    for (const m of msgs) {
      let name = m.senderName;
      if (!name || name.trim() === "") {
        name = await lookupUserName(ctx, m.senderId);
      }
      const attachmentUrls = await resolveAttachmentUrls(ctx, m.attachmentStorageIds);
      results.push({
        _id: m._id,
        _creationTime: m._creationTime,
        bookingId: m.bookingId,
        partsOrderId: m.partsOrderId,
        senderId: extractBaseId(m.senderId),
        senderName: name,
        senderRole: m.senderRole,
        recipientId: m.recipientId ? extractBaseId(m.recipientId) : undefined,
        content: m.content,
        customerName: m.customerName,
        customerPhone: m.customerPhone,
        customerEmail: m.customerEmail,
        vehicleInventoryItemId: m.vehicleInventoryItemId,
        vehicleDescription: m.vehicleDescription,
        vehicleImageUrl: m.vehicleImageUrl,
        vehicleYear: m.vehicleYear,
        vehicleMake: m.vehicleMake,
        vehicleModel: m.vehicleModel,
        vehicleVariant: m.vehicleVariant,
        vehiclePrice: m.vehiclePrice,
        vehicleColor: m.vehicleColor,
        attachmentUrls,
        attachmentNames: m.attachmentNames,
        isRead: m.isRead,
      });
    }
    return results;
  },
});

export const listDirectMessages = query({
  args: { customerId: v.string() },
  returns: v.array(messageReturn),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !args.customerId) return [];

    const currentUserId = extractBaseId(current.userId);
    const targetUserId = extractBaseId(args.customerId);
    if (!currentUserId || !targetUserId) return [];

    const canSeeAllDirects = canAdminViewAllDirectMessages(current);
    const msgs = await ctx.db.query("messages").order("desc").collect();
    const thread = msgs.filter((msg: any) => {
      if (msg.bookingId) return false;
      const senderId = extractBaseId(msg.senderId);
      const recipientId = extractBaseId(msg.recipientId ?? "");
      if (canSeeAllDirects) {
        return sameUser(senderId, targetUserId) || sameUser(recipientId, targetUserId);
      }
      return (
        (sameUser(senderId, currentUserId) && sameUser(recipientId, targetUserId)) ||
        (sameUser(senderId, targetUserId) && sameUser(recipientId, currentUserId))
      );
    }).sort((a: any, b: any) => a._creationTime - b._creationTime);

    const results = [];
    for (const m of thread) {
      let name = m.senderName;
      if (!name || name.trim() === "") {
        name = await lookupUserName(ctx, m.senderId);
      }
      const attachmentUrls = await resolveAttachmentUrls(ctx, m.attachmentStorageIds);
      results.push({
        _id: m._id,
        _creationTime: m._creationTime,
        bookingId: m.bookingId,
        partsOrderId: m.partsOrderId,
        senderId: extractBaseId(m.senderId),
        senderName: name,
        senderRole: m.senderRole,
        recipientId: m.recipientId ? extractBaseId(m.recipientId) : undefined,
        content: m.content,
        customerName: m.customerName,
        customerPhone: m.customerPhone,
        customerEmail: m.customerEmail,
        vehicleInventoryItemId: m.vehicleInventoryItemId,
        vehicleDescription: m.vehicleDescription,
        vehicleImageUrl: m.vehicleImageUrl,
        vehicleYear: m.vehicleYear,
        vehicleMake: m.vehicleMake,
        vehicleModel: m.vehicleModel,
        vehicleVariant: m.vehicleVariant,
        vehiclePrice: m.vehiclePrice,
        vehicleColor: m.vehicleColor,
        attachmentUrls,
        attachmentNames: m.attachmentNames,
        isRead: m.isRead,
      });
    }
    return results;
  },
});

export const listStaffConversations = query({
  args: {},
  returns: v.array(v.object({
    bookingId: v.optional(v.id("bookings")),
    customerId: v.string(),
    customerAvatar: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    lastMessage: v.string(),
    lastMessageTime: v.number(),
    customerName: v.string(),
    unreadCount: v.number(),
    serviceType: v.optional(v.string()),
    isDirectEnquiry: v.boolean(),
    vehicleInventoryItemId: v.optional(v.id("inventory")),
    vehicleDescription: v.optional(v.string()),
    vehicleImageUrl: v.optional(v.string()),
    vehicleYear: v.optional(v.number()),
    vehicleMake: v.optional(v.string()),
    vehicleModel: v.optional(v.string()),
    vehicleVariant: v.optional(v.string()),
    vehiclePrice: v.optional(v.number()),
    vehicleColor: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const allMessages = await ctx.db.query("messages").order("desc").collect();
    const convos: Record<string, any> = {};

    for (const msg of allMessages) {
      const baseSenderId = extractBaseId(msg.senderId);
      const baseRecipientId = msg.recipientId ? extractBaseId(msg.recipientId) : "";
      const booking = msg.bookingId ? await ctx.db.get(msg.bookingId) : null;
      const isCustomerEnquiry = !msg.bookingId && msg.senderRole === "customer";
      const isRelevant = current.isModerator
        ? true
        : msg.bookingId
          ? Boolean(booking && canAccessBooking(current, booking))
          : isCustomerEnquiry
            ? true
            : sameUser(baseSenderId, current.userId) || sameUser(baseRecipientId, current.userId);

      if (!isRelevant) continue;

      let customerId = "";
      let customerName = "";
      let customerAvatar: string | undefined;
      let customerPhone: string | undefined;
      let customerEmail: string | undefined;
      let serviceType: string | undefined;
      let isDirectEnquiry = !msg.bookingId;

      if (msg.bookingId && booking) {
        customerId = String(booking.userId);
        customerName = booking.customerName || "";
        serviceType = booking.serviceType;
        const customerUser = await safeDbGet(ctx, booking.userId);
        customerAvatar = customerUser?.profileImage ?? customerUser?.image ?? undefined;
        customerPhone = customerUser?.phone ?? customerUser?.whatsappNumber ?? customerUser?.alternatePhone ?? booking.customerPhone ?? undefined;
        customerEmail = customerUser?.email ?? booking.customerEmail ?? undefined;
        isDirectEnquiry = false;
      } else if (msg.senderRole === "customer") {
        customerId = baseSenderId;
        customerName = msg.customerName || msg.senderName || "";
        customerPhone = msg.customerPhone;
        customerEmail = msg.customerEmail;
        const customerUser = await safeDbGet(ctx, customerId);
        customerAvatar = customerUser?.profileImage ?? customerUser?.image ?? undefined;
        customerPhone = customerPhone ?? customerUser?.phone ?? customerUser?.whatsappNumber ?? customerUser?.alternatePhone ?? extractPhoneFromText(msg.content) ?? undefined;
        customerEmail = customerEmail ?? customerUser?.email ?? undefined;
      } else {
        customerId = baseRecipientId || baseSenderId;
        customerName = msg.customerName || "";
        customerPhone = msg.customerPhone;
        customerEmail = msg.customerEmail;
        const customerUser = await safeDbGet(ctx, customerId);
        customerAvatar = customerUser?.profileImage ?? customerUser?.image ?? undefined;
        customerPhone = customerPhone ?? customerUser?.phone ?? customerUser?.whatsappNumber ?? customerUser?.alternatePhone ?? extractPhoneFromText(msg.content) ?? undefined;
        customerEmail = customerEmail ?? customerUser?.email ?? undefined;
      }

      if (!customerId) continue;
      if (!customerName || customerName.trim() === "") {
        customerName = await lookupUserName(ctx, customerId);
      }
      if (!customerAvatar) {
        const customerUser = await safeDbGet(ctx, customerId);
        customerAvatar = customerUser?.profileImage ?? customerUser?.image ?? undefined;
        customerPhone = customerPhone ?? customerUser?.phone ?? customerUser?.whatsappNumber ?? customerUser?.alternatePhone ?? undefined;
        customerEmail = customerEmail ?? customerUser?.email ?? undefined;
      }

      const key = msg.bookingId ? String(msg.bookingId) : `direct_${customerId}`;
      if (!convos[key]) {
        convos[key] = {
          bookingId: msg.bookingId,
          customerId,
          customerAvatar,
          customerPhone,
          customerEmail,
          lastMessage: msg.content,
          lastMessageTime: msg._creationTime,
          customerName,
          unreadCount: 0,
          serviceType,
          isDirectEnquiry,
          vehicleInventoryItemId: msg.vehicleInventoryItemId,
          vehicleDescription: msg.vehicleDescription,
          vehicleImageUrl: msg.vehicleImageUrl,
          vehicleYear: msg.vehicleYear,
          vehicleMake: msg.vehicleMake,
          vehicleModel: msg.vehicleModel,
          vehicleVariant: msg.vehicleVariant,
          vehiclePrice: msg.vehiclePrice,
          vehicleColor: msg.vehicleColor,
        };
      }
      if (msg._creationTime > convos[key].lastMessageTime) {
        convos[key].lastMessage = msg.content;
        convos[key].lastMessageTime = msg._creationTime;
        convos[key].vehicleInventoryItemId = msg.vehicleInventoryItemId ?? convos[key].vehicleInventoryItemId;
        convos[key].vehicleDescription = msg.vehicleDescription ?? convos[key].vehicleDescription;
        convos[key].vehicleImageUrl = msg.vehicleImageUrl ?? convos[key].vehicleImageUrl;
        convos[key].vehicleYear = msg.vehicleYear ?? convos[key].vehicleYear;
        convos[key].vehicleMake = msg.vehicleMake ?? convos[key].vehicleMake;
        convos[key].vehicleModel = msg.vehicleModel ?? convos[key].vehicleModel;
        convos[key].vehicleVariant = msg.vehicleVariant ?? convos[key].vehicleVariant;
        convos[key].vehiclePrice = msg.vehiclePrice ?? convos[key].vehiclePrice;
        convos[key].vehicleColor = msg.vehicleColor ?? convos[key].vehicleColor;
        convos[key].customerPhone = convos[key].customerPhone ?? customerPhone;
        convos[key].customerEmail = convos[key].customerEmail ?? customerEmail;
      }
      if (!msg.isRead && !sameUser(msg.senderId, current.userId)) {
        convos[key].unreadCount += 1;
      }
    }

    return Object.values(convos).sort((a: any, b: any) => b.lastMessageTime - a.lastMessageTime);
  },
});

export const listMyConversations = query({
  args: {},
  returns: v.array(v.object({
    bookingId: v.optional(v.id("bookings")),
    customerId: v.string(),
    customerAvatar: v.optional(v.string()),
    lastMessage: v.string(),
    lastMessageTime: v.number(),
    customerName: v.string(),
    unreadCount: v.number(),
    serviceType: v.optional(v.string()),
    isDirectEnquiry: v.boolean(),
    vehicleInventoryItemId: v.optional(v.id("inventory")),
    vehicleDescription: v.optional(v.string()),
    vehicleImageUrl: v.optional(v.string()),
    vehicleYear: v.optional(v.number()),
    vehicleMake: v.optional(v.string()),
    vehicleModel: v.optional(v.string()),
    vehicleVariant: v.optional(v.string()),
    vehiclePrice: v.optional(v.number()),
    vehicleColor: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const allMessages = await ctx.db.query("messages").order("desc").collect();
    const bookingCache: Record<string, any> = {};
    const myMsgs = [];

    for (const msg of allMessages) {
      if (msg.bookingId) {
        const bookingKey = String(msg.bookingId);
        if (!(bookingKey in bookingCache)) {
          bookingCache[bookingKey] = await ctx.db.get(msg.bookingId);
        }
        const booking = bookingCache[bookingKey];
        if (booking && canAccessBooking(current, booking)) {
          myMsgs.push(msg);
          continue;
        }
      }

      const baseSender = extractBaseId(msg.senderId);
      const baseRecipient = extractBaseId(msg.recipientId ?? "");
      if (sameUser(baseSender, current.userId) || sameUser(baseRecipient, current.userId)) {
        myMsgs.push(msg);
      }
    }

    const convos: Record<string, any> = {};

    for (const msg of myMsgs) {
      const baseSenderId = extractBaseId(msg.senderId);
      const baseRecipientId = msg.recipientId ? extractBaseId(msg.recipientId) : "";
      const customerId = msg.senderRole === "customer" ? baseSenderId : (baseRecipientId || baseSenderId);
      if (!customerId) continue;

      let customerName = msg.senderRole === "customer" ? (msg.customerName || msg.senderName || "") : (msg.customerName || "");
      if (!customerName || customerName.trim() === "") {
        customerName = await lookupUserName(ctx, customerId);
      }

      let customerAvatar: string | undefined;
      const customerUser = await safeDbGet(ctx, extractBaseId(customerId));
      customerAvatar = customerUser?.profileImage ?? customerUser?.image ?? undefined;
      if (!customerAvatar) {
        const profile = await ctx.db
          .query("customerProfiles")
          .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", customerId))
          .first();
        customerAvatar = profile?.profileImage ?? undefined;
      }

      const key = msg.bookingId ? String(msg.bookingId) : `direct_${customerId}`;
      if (!convos[key]) {
        let serviceType: string | undefined;
        if (msg.bookingId) {
          try {
            const booking = await ctx.db.get(msg.bookingId);
            if (booking && canAccessBooking(current, booking)) {
              serviceType = booking?.serviceType;
            }
          } catch {}
        }
        convos[key] = {
          bookingId: msg.bookingId,
          customerId,
          customerAvatar,
          lastMessage: msg.content,
          lastMessageTime: msg._creationTime,
          customerName,
          unreadCount: 0,
          serviceType,
          isDirectEnquiry: !msg.bookingId && !msg.recipientId && Boolean(msg.vehicleInventoryItemId || msg.vehicleDescription),
          vehicleInventoryItemId: msg.vehicleInventoryItemId,
          vehicleDescription: msg.vehicleDescription,
          vehicleImageUrl: msg.vehicleImageUrl,
          vehicleYear: msg.vehicleYear,
          vehicleMake: msg.vehicleMake,
          vehicleModel: msg.vehicleModel,
          vehicleVariant: msg.vehicleVariant,
          vehiclePrice: msg.vehiclePrice,
          vehicleColor: msg.vehicleColor,
        };
      }
      if (!msg.isRead && !sameUser(msg.senderId, current.userId)) {
        convos[key].unreadCount++;
      }
    }

    return Object.values(convos).sort((a: any, b: any) => b.lastMessageTime - a.lastMessageTime);
  },
});

export const listMyDirectThreads = query({
  args: {},
  returns: v.array(v.object({
    counterpartId: v.string(),
    counterpartName: v.string(),
    counterpartAvatar: v.optional(v.string()),
    counterpartPhone: v.optional(v.string()),
    partsOrderId: v.optional(v.id("partsOrders")),
    partsOrderTitle: v.optional(v.string()),
    lastMessage: v.string(),
    lastMessageTime: v.number(),
    unreadCount: v.number(),
    isArchived: v.boolean(),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const allMessages = await ctx.db.query("messages").order("desc").collect();
    const allPartsOrders = await ctx.db.query("partsOrders").order("desc").collect();
    const threads: Record<string, any> = {};

    for (const msg of allMessages) {
      if (msg.bookingId) continue;

      const senderId = extractBaseId(msg.senderId);
      const recipientId = extractBaseId(msg.recipientId ?? "");
      const counterpartId = sameUser(senderId, current.userId)
        ? recipientId
        : sameUser(recipientId, current.userId)
          ? senderId
          : "";

      if (!counterpartId) continue;

      const matchedPartsOrder = msg.partsOrderId
        ? allPartsOrders.find((order: any) => String(order._id) === String(msg.partsOrderId))
        : allPartsOrders.find((order: any) => sameUser(String(order.userId ?? ""), counterpartId) || String(order.customerName ?? "").trim().toLowerCase() === String(msg.senderName ?? "").trim().toLowerCase());

      if (!threads[counterpartId]) {
        const counterpartUser = await safeDbGet(ctx, counterpartId);
        threads[counterpartId] = {
          counterpartId,
          counterpartName: await lookupUserName(ctx, counterpartId),
          counterpartAvatar: counterpartUser?.profileImage ?? counterpartUser?.image ?? undefined,
          counterpartPhone: counterpartUser?.phone ?? counterpartUser?.whatsappNumber ?? counterpartUser?.alternatePhone ?? extractPhoneFromText(msg.content) ?? undefined,
          partsOrderId: matchedPartsOrder?._id ?? msg.partsOrderId,
          partsOrderTitle: matchedPartsOrder?.itemDescription,
          lastMessage: msg.content,
          lastMessageTime: msg._creationTime,
          unreadCount: 0,
          isArchived: Boolean(msg.isArchived),
        };
      }

      if (msg._creationTime > threads[counterpartId].lastMessageTime) {
        threads[counterpartId].lastMessage = msg.content;
        threads[counterpartId].lastMessageTime = msg._creationTime;
        threads[counterpartId].isArchived = Boolean(msg.isArchived);
      }
      if (matchedPartsOrder?._id) {
        threads[counterpartId].partsOrderId = matchedPartsOrder._id;
        threads[counterpartId].partsOrderTitle = matchedPartsOrder.itemDescription;
      } else if (msg.partsOrderId) {
        threads[counterpartId].partsOrderId = msg.partsOrderId;
      }

      if (!msg.isRead && sameUser(recipientId, current.userId)) {
        threads[counterpartId].unreadCount += 1;
      }
    }

    return Object.values(threads).sort((a: any, b: any) => b.lastMessageTime - a.lastMessageTime);
  },
});

export const listPartsOrderThreads = query({
  args: {},
  returns: v.array(v.object({
    partsOrderId: v.id("partsOrders"),
    customerId: v.string(),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    itemDescription: v.string(),
    orderType: v.string(),
    status: v.string(),
    fulfillmentType: v.string(),
    vehicleVin: v.string(),
    yearModel: v.optional(v.string()),
    lastMessage: v.string(),
    lastMessageTime: v.number(),
    unreadCount: v.number(),
    isArchived: v.boolean(),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const isStaffLike = canAdminViewAllDirectMessages(current) || current.role === "staff" || current.user?.role === "staff" || Boolean(current.user?.staffRole || current.user?.accessLevel || current.user?.department || current.user?.isOwner);
    if (!isStaffLike) return [];

    const allOrders = await ctx.db.query("partsOrders").order("desc").collect();
    const allMessages = await ctx.db.query("messages").order("desc").collect();
    const threads: Array<any> = [];

    for (const order of allOrders) {
      const orderId = String(order._id);
      const threadMessages = allMessages.filter((msg: any) => {
        if (msg.bookingId) return false;
        if (String(msg.partsOrderId ?? "") === orderId) return true;
        const senderName = String(msg.senderName ?? "").trim().toLowerCase();
        const orderName = String(order.customerName ?? "").trim().toLowerCase();
        return senderName && orderName && senderName === orderName && String(msg.content ?? "").toLowerCase().includes(String(order.itemDescription ?? "").trim().toLowerCase().slice(0, 12));
      });
      if (!threadMessages.length) continue;

      const latest = threadMessages.reduce((acc: any, msg: any) => (msg._creationTime > acc._creationTime ? msg : acc), threadMessages[0]);
      threads.push({
        partsOrderId: order._id,
        customerId: String(order.userId),
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        itemDescription: order.itemDescription,
        orderType: order.orderType,
        status: order.status,
        fulfillmentType: order.fulfillmentType,
        vehicleVin: order.vehicleVin,
        yearModel: order.yearModel,
        lastMessage: latest.content,
        lastMessageTime: latest._creationTime,
        unreadCount: threadMessages.filter((msg: any) => !msg.isRead).length,
        isArchived: threadMessages.every((msg: any) => Boolean(msg.isArchived)),
      });
    }

    return threads.sort((a: any, b: any) => b.lastMessageTime - a.lastMessageTime);
  },
});

export const archiveDirectThread = mutation({
  args: { customerId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !args.customerId) return null;

    const targetBaseId = extractBaseId(args.customerId);
    const canSeeAllDirects = canAdminViewAllDirectMessages(current);
    const messages = await ctx.db.query("messages").order("desc").collect();

    for (const msg of messages) {
      if (msg.bookingId) continue;
      const senderId = extractBaseId(msg.senderId);
      const recipientId = extractBaseId(msg.recipientId ?? "");
      const inThread = canSeeAllDirects
        ? sameUser(senderId, targetBaseId) || sameUser(recipientId, targetBaseId)
        : (sameUser(senderId, current.userId) && sameUser(recipientId, targetBaseId)) || (sameUser(senderId, targetBaseId) && sameUser(recipientId, current.userId));

      if (inThread) {
        await ctx.db.patch(msg._id, {
          isArchived: true,
          archivedAt: Date.now(),
        });
      }
    }

    return null;
  },
});

export const unarchiveDirectThread = mutation({
  args: { customerId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !args.customerId) return null;

    const targetBaseId = extractBaseId(args.customerId);
    const canSeeAllDirects = canAdminViewAllDirectMessages(current);
    const messages = await ctx.db.query("messages").order("desc").collect();

    for (const msg of messages) {
      if (msg.bookingId) continue;
      const senderId = extractBaseId(msg.senderId);
      const recipientId = extractBaseId(msg.recipientId ?? "");
      const inThread = canSeeAllDirects
        ? sameUser(senderId, targetBaseId) || sameUser(recipientId, targetBaseId)
        : (sameUser(senderId, current.userId) && sameUser(recipientId, targetBaseId)) || (sameUser(senderId, targetBaseId) && sameUser(recipientId, current.userId));

      if (inThread) {
        await ctx.db.patch(msg._id, {
          isArchived: false,
          archivedAt: undefined,
        });
      }
    }

    return null;
  },
});

export const listInboxContacts = query({
  args: {},
  returns: v.array(v.object({
    recipientId: v.string(),
    name: v.string(),
    avatar: v.optional(v.string()),
    subtitle: v.string(),
    kind: v.string(),
    isOnline: v.optional(v.boolean()),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const contacts: Record<string, any> = {};
    const addContact = (contact: any) => {
      if (!contact?.recipientId) return;
      const key = String(contact.recipientId);
      if (contacts[key]) return;
      contacts[key] = contact;
    };

    const now = Date.now();
    const allUsers: any[] = await ctx.db.query("users").collect();
    const usersById = new Map<string, any>(allUsers.map((user: any) => [String(user._id), user]));
    const usersByEmail = new Map<string, any>(
      allUsers
        .map((user: any) => [String(user.email ?? "").trim().toLowerCase(), user] as const)
        .filter(([email]) => Boolean(email))
    );

    if (current.isModerator) {
      for (const user of allUsers) {
        if (user.isDeleted) continue;
        const role = String(user.role ?? "customer");
        addContact({
          recipientId: String(user._id),
          name: user.displayName || user.name || user.email || "User",
          avatar: user.profileImage ?? user.image ?? undefined,
          subtitle: role === "staff"
            ? String(user.staffRole ?? user.accessLevel ?? "Staff").replace(/_/g, " ")
            : "Customer",
          kind: role === "staff" ? "staff" : "customer",
          isOnline: typeof user.lastSeenAt === "number" ? now - user.lastSeenAt < 120000 : false,
        });
      }
      return Object.values(contacts).sort((a: any, b: any) =>
        Number(b.isOnline) - Number(a.isOnline) || String(a.name).localeCompare(String(b.name))
      );
    }

    if (current.user?.role === "staff") {
      for (const user of allUsers) {
        if (user.isDeleted || user.role !== "staff") continue;
        if (String(user._id) === current.userId) continue;
        addContact({
          recipientId: String(user._id),
          name: user.displayName || user.name || user.email || "Staff",
          avatar: user.profileImage ?? user.image ?? undefined,
          subtitle: [String(user.staffRole ?? user.accessLevel ?? "staff").replace(/_/g, " "), user.dealershipName, user.dealershipLocation].filter(Boolean).join(" • "),
          kind: "staff",
          isOnline: typeof user.lastSeenAt === "number" ? now - user.lastSeenAt < 120000 : false,
        });
      }
    }

    if (current.role === "customer" || current.user?.role === "staff" || current.isModerator) {
      const staffMembers: any[] = await ctx.db.query("customerProfiles").collect();
      for (const profile of staffMembers) {
        const isVisible =
          sameUser(profile.ownerUserId ?? "", current.userId) ||
          sameUser(profile.assignedToUserId ?? "", current.userId) ||
          sameUser(profile.assignedByUserId ?? "", current.userId);
        if (!isVisible || !profile.linkedUserId) continue;

        const linkedUser = usersById.get(String(profile.linkedUserId)) ?? await safeDbGet(ctx, profile.linkedUserId);
        if (!linkedUser || linkedUser.isDeleted) continue;
        if (linkedUser.role === "staff") continue;
        addContact({
          recipientId: String(linkedUser._id),
          name: linkedUser.displayName || linkedUser.name || profile.fullName || linkedUser.email || "Customer",
          avatar: linkedUser.profileImage ?? linkedUser.image ?? profile.profileImage ?? undefined,
          subtitle: "Assigned customer",
          kind: "customer",
          isOnline: typeof linkedUser.lastSeenAt === "number" ? now - linkedUser.lastSeenAt < 120000 : false,
        });
      }

      if (current.role === "customer") {
        for (const user of allUsers) {
          if (user.isDeleted || user.role !== "staff") continue;
          addContact({
            recipientId: String(user._id),
            name: user.displayName || user.name || user.email || "Staff",
            avatar: user.profileImage ?? user.image ?? undefined,
            subtitle: String(user.staffRole ?? user.accessLevel ?? "staff").replace(/_/g, " "),
            kind: "staff",
            isOnline: typeof user.lastSeenAt === "number" ? now - user.lastSeenAt < 120000 : false,
          });
        }
      }

      if (current.role === "customer") {
        const follows: any[] = await ctx.db
          .query("follows")
          .withIndex("by_followerId", (q: any) => q.eq("followerId", current.userId))
          .collect();

        for (const follow of follows) {
          if (follow.isDeleted) continue;
          const followedUser = usersById.get(String(follow.followingId)) ?? await safeDbGet(ctx, follow.followingId);
          if (!followedUser || followedUser.isDeleted) continue;
          const role = String(followedUser.role ?? "user");
          addContact({
            recipientId: String(followedUser._id),
            name: followedUser.displayName || followedUser.name || followedUser.email || "User",
            avatar: followedUser.profileImage ?? followedUser.image ?? undefined,
            subtitle: role === "staff"
              ? String(followedUser.staffRole ?? followedUser.accessLevel ?? "staff").replace(/_/g, " ")
              : "Followed user",
            kind: role === "staff" ? "staff" : "user",
            isOnline: typeof followedUser.lastSeenAt === "number" ? now - followedUser.lastSeenAt < 120000 : false,
          });
        }
      }

      return Object.values(contacts).sort((a: any, b: any) =>
        Number(b.isOnline) - Number(a.isOnline) || String(a.name).localeCompare(String(b.name))
      );
    }

    const allMessages: any[] = await ctx.db.query("messages").order("desc").collect();
    for (const msg of allMessages) {
      if (msg.bookingId) continue;

      const senderId = extractBaseId(msg.senderId);
      const recipientId = extractBaseId(msg.recipientId ?? "");
      const involvesCurrent = sameUser(senderId, current.userId) || sameUser(recipientId, current.userId);
      if (!involvesCurrent) continue;

      const counterpartId = sameUser(senderId, current.userId) ? recipientId : senderId;
      if (!counterpartId) continue;
      const counterpartUser = await ctx.db.get(extractBaseId(counterpartId) as any);
      if (!counterpartUser || counterpartUser.isDeleted) continue;
      const role = String(counterpartUser.role ?? "customer");
      addContact({
        recipientId: String(counterpartUser._id),
        name: counterpartUser.displayName || counterpartUser.name || counterpartUser.email || "User",
        avatar: counterpartUser.profileImage ?? counterpartUser.image ?? undefined,
        subtitle: role === "staff"
          ? String(counterpartUser.staffRole ?? counterpartUser.accessLevel ?? "staff").replace(/_/g, " ")
          : "Direct contact",
        kind: role === "staff" ? "staff" : "customer",
        isOnline: typeof counterpartUser.lastSeenAt === "number" ? now - counterpartUser.lastSeenAt < 120000 : false,
      });
    }

    return Object.values(contacts).sort((a: any, b: any) =>
      Number(b.isOnline) - Number(a.isOnline) || String(a.name).localeCompare(String(b.name))
    );
  },
});

export const markRead = mutation({
  args: { bookingId: v.id("bookings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const booking = await ctx.db.get(args.bookingId);
    if (!booking || !canAccessBooking(current, booking)) return null;

    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_bookingId", (q: any) => q.eq("bookingId", args.bookingId))
      .collect();

    for (const msg of msgs) {
      if (!msg.isRead && !sameUser(msg.senderId, current.userId)) {
        await ctx.db.patch(msg._id, { isRead: true });
      }
    }
    return null;
  },
});

export const markDirectRead = mutation({
  args: { customerId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !args.customerId) return null;

    const targetBaseId = extractBaseId(args.customerId);
    const messages = await ctx.db.query("messages").order("desc").collect();

    for (const msg of messages) {
      if (msg.bookingId) continue;
      const senderId = extractBaseId(msg.senderId);
      const recipientId = extractBaseId(msg.recipientId ?? "");
      const inThread = sameUser(senderId, targetBaseId) || sameUser(recipientId, targetBaseId);
      const involvesCurrent = sameUser(senderId, current.userId) || sameUser(recipientId, current.userId);
      if (inThread && involvesCurrent && !msg.isRead && !sameUser(msg.senderId, current.userId)) {
        await ctx.db.patch(msg._id, { isRead: true });
      }
    }

    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_userId_read", (q: any) => q.eq("userId", current.userId).eq("isRead", false))
      .collect();

    for (const notification of unreadNotifications) {
      const notifTarget = extractBaseId(String(notification.targetId ?? ""));
      const matchesDirectThread =
        notification.type === "new_message" &&
        !notification.bookingId &&
        (sameUser(notifTarget, targetBaseId) || (!notifTarget && notification.targetRoute === "StaffChat"));

      if (matchesDirectThread) {
        await ctx.db.patch(notification._id, { isRead: true });
      }
    }

    return null;
  },
});

async function resolveRecipientTarget(ctx: any, recipientId: string | null | undefined) {
  const baseId = extractBaseId(String(recipientId ?? ""));
  if (!baseId) return null;

  const directDoc = await safeDbGet(ctx, baseId);
  if (!directDoc) return null;

  const email = String(directDoc.email ?? "").trim().toLowerCase();
  const role = String(directDoc.role ?? "").trim().toLowerCase();
  const isStaffRecord = Boolean(
    directDoc.approvalStatus !== undefined ||
    directDoc.accessLevel !== undefined ||
    directDoc.dealershipName !== undefined ||
    directDoc.dealershipLocation !== undefined ||
    (role && role !== "customer")
  );

  const linkedUser = email
    ? await ctx.db
        .query("users")
        .withIndex("email", (q: any) => q.eq("email", email))
        .first()
    : null;

  return {
    baseId,
    directDoc,
    linkedUser,
    isStaffRecord,
    resolvedUserId: linkedUser ? String(linkedUser._id) : (!isStaffRecord ? baseId : undefined),
    displayName: String(directDoc.displayName ?? directDoc.name ?? linkedUser?.displayName ?? linkedUser?.name ?? directDoc.email ?? linkedUser?.email ?? "User"),
    phone: directDoc.phone ?? linkedUser?.phone ?? linkedUser?.whatsappNumber ?? linkedUser?.alternatePhone,
    email,
  };
}

async function canSendToRecipient(ctx: any, sender: any, recipientId: string | null | undefined, bookingId?: string | null): Promise<boolean> {
  if (!recipientId) return true;
  if (isAdminLikeUser(sender.user)) return true;

  const senderRole = String(sender?.role ?? sender?.user?.role ?? "").trim().toLowerCase();
  const senderStaffRole = String(sender?.user?.staffRole ?? sender?.staffRole ?? "").trim().toLowerCase();

  const recipientTarget = await resolveRecipientTarget(ctx, recipientId);
  if (!recipientTarget) return false;

  if (bookingId) {
    const booking = await safeDbGet(ctx, bookingId);
    if (booking && canAccessBooking(sender, booking)) {
      return true;
    }
  }

  const recipientRole = String(recipientTarget.directDoc.role ?? "customer").trim().toLowerCase();
  const recipientIsStaff = recipientTarget.isStaffRecord || recipientRole === "staff" || recipientRole === "sales_executive" || recipientRole === "sales_manager" || recipientRole === "sales" || recipientRole === "service_advisor" || recipientRole === "dealership_principal";

  if (recipientIsStaff) {
    if (senderRole === "customer") return true;
    if (senderRole === "staff") return true;
    if (senderStaffRole) return true;
  }

  if (senderRole === "staff") {
    return true;
  }

  if (senderRole === "customer") {
    if (recipientIsStaff) return true;
    const profile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", recipientTarget.baseId))
      .first();
    if (!profile) return false;

    return Boolean(
      String(profile.ownerUserId ?? "") === sender.userId ||
      String(profile.assignedToUserId ?? "") === sender.userId ||
      String(profile.assignedByUserId ?? "") === sender.userId ||
      String(profile.linkedUserId ?? "") === recipientTarget.baseId
    );
  }

  return false;
}