import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { sendSMSToCustomer, sendWhatsAppToCustomer } from './emails';

// Shared helper: resolve the authenticated app user from the current identity.
async function findUserByIdentity(ctx: any, identity: any) {
  if (identity?.subject) {
    try {
      const doc = await ctx.db.get(identity.subject);
      if (doc) {
        if (doc.userId) {
          const user = await ctx.db.get(doc.userId);
          if (user) return user;
        } else if (doc.email !== undefined || doc.role !== undefined) {
          return doc;
        }
      }
    } catch {}
  }

  if (identity?.email) {
    const user = await ctx.db.query("users").withIndex("email", (q: any) => q.eq("email", identity.email)).first();
    if (user) return user;
  }

  if (identity?.tokenIdentifier) {
    const parts = identity.tokenIdentifier.split("|");
    const possibleId = parts[parts.length - 1];
    if (possibleId) {
      try {
        const doc = await ctx.db.get(possibleId);
        if (doc) {
          if (doc.userId) {
            const user = await ctx.db.get(doc.userId);
            if (user) return user;
          } else if (doc.email !== undefined || doc.role !== undefined) {
            return doc;
          }
        }
      } catch {}
    }
  }

  return null;
}

// Helper: get stable user from identity
async function getUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await findUserByIdentity(ctx, identity);
}

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";

function canSeeAllWorkspace(user: any) {
  const role = String(user?.staffRole ?? user?.role ?? "").trim().toLowerCase();
  return Boolean(
    user?.isOwner ||
    role === "admin" ||
    role === "dealer_principal" ||
    role === "dp" ||
    role === "sales_manager"
  );
}

function canManageTestDrives(user: any) {
  const role = String(user?.staffRole ?? user?.role ?? "").trim().toLowerCase();
  return Boolean(
    canSeeAllWorkspace(user) ||
    role === "sales_executive" ||
    role === "sales"
  );
}

async function hasTestDriveMenuAccess(ctx: any, user: any, userId: string) {
  if (!user || (!user?.role && !user?.staffRole)) return true;
  if (canSeeAllWorkspace(user)) return true;

  const key = `staff:${userId}:menu:test_drives`;
  const row = await ctx.db
    .query("widgetVisibility")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .first();
  return !row?.hidden;
}

function isSalesStaff(user: any) {
  const role = String(user?.staffRole ?? user?.role ?? "").trim().toLowerCase();
  return ["sales_executive", "sales_manager", "sales"].includes(role);
}

function canReassignTestDrive(user: any, td: any) {
  return Boolean((canSeeAllWorkspace(user) || isSalesStaff(user)) && !td.acknowledgedAt);
}

function canAccessTestDrive(user: any, currentUserId: string, td: any) {
  if (canSeeAllWorkspace(user)) return true;
  return Boolean(
    String(td.ownerUserId ?? "") === currentUserId ||
    String(td.userId ?? "") === currentUserId ||
    String(td.assignedToUserId ?? "") === currentUserId ||
    String(td.assignedTo ?? "") === currentUserId
  );
}

async function getAdminRecipients(ctx: any) {
  const users = await ctx.db.query("users").collect();
  return users
    .filter((u: any) => canSeeAllWorkspace(u))
    .map((u: any) => String(u._id));
}

async function getSalesExecutiveRecipients(ctx: any) {
  const users = await ctx.db.query("users").collect();
  return users
    .filter((u: any) => (u.staffRole === "sales_executive" || u.staffRole === "sales") && !u.isDeleted)
    .map((u: any) => String(u._id));
}

async function getPrimarySalesExecutive(ctx: any) {
  const salesExecutives = await getSalesExecutiveRecipients(ctx);
  if (salesExecutives.length > 0) return salesExecutives[0];
  const admins = await getAdminRecipients(ctx);
  return admins[0] ?? null;
}

async function getCustomerWorkspaceOwnerId(ctx: any, linkedUserId: string) {
  const profile = await ctx.db
    .query("customerProfiles")
    .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", linkedUserId))
    .first();
  return profile?.ownerUserId ?? profile?.assignedToUserId ?? profile?.assignedByUserId ?? null;
}

async function getOperationalRecipients(ctx: any) {
  const users = await ctx.db.query("users").collect();
  return users
    .filter((u: any) => canSeeAllWorkspace(u) || canManageTestDrives(u))
    .filter((u: any) => !u.isDeleted)
    .map((u: any) => String(u._id));
}

async function notifyTestDriveActivity(
  ctx: any,
  td: any,
  currentUserId: string,
  payload: {
    customerTitle: string;
    customerMessage: string;
    staffTitle?: string;
    staffMessage?: string;
    type: string;
  }
) {
  const operationalRecipients = new Set<string>([
    ...(await getOperationalRecipients(ctx)),
    td.ownerUserId,
    td.assignedToUserId,
  ].filter(Boolean) as string[]);

  const currentUser = await ctx.db.get(currentUserId as any).catch(() => null);
  const senderName = currentUser?.name ?? currentUser?.email ?? 'Sales Executive';

  await ctx.db.insert("notifications", {
    userId: td.userId,
    type: payload.type,
    title: payload.customerTitle,
    message: payload.customerMessage,
    bookingId: undefined,
    isRead: false,
  });

  await ctx.db.insert("messages", {
    senderId: currentUserId,
    senderName,
    senderRole: "staff",
    recipientId: td.userId,
    content: payload.customerMessage,
    isRead: false,
  });

  if (td.userPhone) {
    await sendSMSToCustomer(td.userPhone, payload.customerMessage);
    await sendWhatsAppToCustomer(td.userPhone, payload.customerMessage);
  }

  for (const recipientId of operationalRecipients) {
    if (!recipientId || recipientId === td.userId || recipientId === currentUserId) continue;
    await ctx.db.insert("notifications", {
      userId: recipientId,
      type: payload.type,
      title: payload.staffTitle ?? payload.customerTitle,
      message: payload.staffMessage ?? payload.customerMessage,
      bookingId: undefined,
      isRead: false,
    });
    await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
      userId: recipientId,
      title: payload.staffTitle ?? payload.customerTitle,
      message: payload.staffMessage ?? payload.customerMessage,
    });
  }
}

async function getCurrentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await findUserByIdentity(ctx, identity);
  if (!user) return null;
  return { identity, user, userId: String(user._id) };
}

function getAssignedStaff(current: any) {
  if (!current?.user) return null;
  const assignedStaffUserId = String(current.user.assignedStaffUserId ?? "").trim();
  if (!assignedStaffUserId) return null;
  return {
    assignedStaffUserId,
    assignedStaffName: current.user.assignedStaffName ?? current.user.name ?? current.user.email ?? "Sales Executive",
    assignedStaffRole: current.user.assignedStaffRole ?? current.user.staffRole ?? current.user.role,
    assignedStaffDealershipId: current.user.assignedStaffDealershipId ?? current.user.dealershipId,
    assignedStaffDealershipName: current.user.assignedStaffDealershipName ?? current.user.dealershipName,
    assignedStaffDealershipBrand: current.user.assignedStaffDealershipBrand ?? current.user.dealershipBrand,
  };
}

const testDriveReturn = v.object({
  _id: v.id("testDrives"),
  _creationTime: v.number(),
  ownerUserId: v.optional(v.string()),
  userId: v.string(),
  customerProfileId: v.optional(v.string()),
  userName: v.string(),
  userEmail: v.optional(v.string()),
  userPhone: v.optional(v.string()),
  inventoryItemId: v.id("inventory"),
  vehicleDescription: v.string(),
  preferredDate: v.string(),
  preferredTime: v.string(),
  confirmedDate: v.optional(v.string()),
  confirmedTime: v.optional(v.string()),
  pickupLocation: v.optional(v.string()),
  pickupTime: v.optional(v.string()),
  status: v.string(),
  rejectionReason: v.optional(v.string()),
  completedAt: v.optional(v.number()),
  acknowledgedAt: v.optional(v.number()),
  notes: v.optional(v.string()),
  assignedTo: v.optional(v.string()),
  assignedToName: v.optional(v.string()),
  assignedToUserId: v.optional(v.string()),
  assignedDriverName: v.optional(v.string()),
  userImage: v.optional(v.string()),
  dealershipId: v.optional(v.string()),
  dealershipName: v.optional(v.string()),
  dealershipBrand: v.optional(v.string()),
});

function mapTestDrive(td: any) {
  return {
    _id: td._id,
    _creationTime: td._creationTime,
    ownerUserId: td.ownerUserId,
    userId: td.userId,
    customerProfileId: td.customerProfileId,
    userName: td.userName,
    userEmail: td.userEmail,
    userPhone: td.userPhone,
    inventoryItemId: td.inventoryItemId,
    vehicleDescription: td.vehicleDescription,
    preferredDate: td.preferredDate,
    preferredTime: td.preferredTime,
    confirmedDate: td.confirmedDate,
    confirmedTime: td.confirmedTime,
    pickupLocation: td.pickupLocation,
    pickupTime: td.pickupTime,
    status: td.status,
    rejectionReason: td.rejectionReason,
    completedAt: td.completedAt,
    notes: td.notes,
    assignedTo: td.assignedTo,
    assignedToName: td.assignedToName,
    assignedToUserId: td.assignedToUserId,
    assignedDriverName: td.assignedDriverName,
    userImage: td.userImage,
    dealershipId: td.dealershipId,
    dealershipName: td.dealershipName,
    dealershipBrand: td.dealershipBrand,
  };
}

function testDriveScheduleUpdateMessage(td: any, date?: string, time?: string) {
  return `${td.vehicleDescription} is scheduled for ${date ?? td.confirmedDate ?? td.preferredDate} at ${time ?? td.confirmedTime ?? td.preferredTime}.`;
}

export const escalatePending = internalMutation({
  args: { testDriveId: v.id("testDrives") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const td = await ctx.db.get(args.testDriveId);
    if (!td || td.status !== "pending") return null;

    const adminRecipients = await getAdminRecipients(ctx);
    const salesRecipients = await getSalesExecutiveRecipients(ctx);
    const notifiedRecipients = Array.from(new Set([
      td.ownerUserId,
      td.assignedToUserId,
      ...adminRecipients,
      ...salesRecipients,
    ].filter(Boolean)));

    for (const userId of notifiedRecipients) {
      if (userId === td.userId) continue;
      await ctx.db.insert("notifications", {
        userId,
        type: "test_drive_escalated",
        title: "Test Drive Needs Attention",
        message: `${td.userName}'s test drive for ${td.vehicleDescription} is still pending and needs intervention.`,
        isRead: false,
      });
    }

    await ctx.db.insert("notifications", {
      userId: td.userId,
      type: "test_drive_escalated",
      title: "Test Drive Needs Attention",
      message: `${td.vehicleDescription} is still pending. We are escalating this to the team.`,
      isRead: false,
    });

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: td.ownerUserId ?? td.userId,
      type: "test_drive_escalated",
      title: "Test Drive Escalated",
      description: `${td.userName}'s test drive for ${td.vehicleDescription} is still pending and has been escalated.`,
      customerName: td.userName,
      customerPhone: td.userPhone,
      metadata: JSON.stringify({ testDriveId: args.testDriveId.toString(), status: td.status, assignedToUserId: td.assignedToUserId }),
      triggeredBy: td.userId,
    });

    return null;
  },
});

export const book = mutation({
  args: {
    inventoryItemId: v.id("inventory"),
    vehicleDescription: v.string(),
    preferredDate: v.string(),
    preferredTime: v.string(),
    pickupLocation: v.optional(v.string()),
    pickupTime: v.optional(v.string()),
    notes: v.optional(v.string()),
    phone: v.optional(v.string()),
    customerProfileId: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
  },
  returns: v.id("testDrives"),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Please sign in before booking a test drive.");

    const customerProfile = args.customerProfileId
      ? await ctx.db.get(args.customerProfileId as any)
      : null;
    const targetUserId = String(customerProfile?.linkedUserId ?? current.userId);
    const targetUser = customerProfile?.linkedUserId ? await ctx.db.get(customerProfile.linkedUserId as any) : current.user;
    const userName = customerProfile?.fullName ?? targetUser?.name ?? targetUser?.email ?? "Customer";
    const userEmail = customerProfile?.contactEmail ?? targetUser?.email;
    const userPhone = customerProfile?.whatsappNumber ?? customerProfile?.phone ?? args.phone ?? targetUser?.phone;
    const dealershipId = customerProfile?.dealershipId ?? args.dealershipId;
    const dealershipName = customerProfile?.dealershipName ?? args.dealershipName;
    const dealershipBrand = customerProfile?.dealershipBrand ?? args.dealershipBrand;

    const tdId = await ctx.db.insert("testDrives", {
      ownerUserId: current.userId,
      userId: targetUserId,
      customerProfileId: customerProfile?._id ? String(customerProfile._id) : undefined,
      userName,
      userEmail,
      userImage: (customerProfile?.profileImage ?? targetUser?.profileImage) || targetUser?.image,
      userPhone,
      inventoryItemId: args.inventoryItemId,
      vehicleDescription: args.vehicleDescription,
      preferredDate: args.preferredDate,
      preferredTime: args.preferredTime,
      pickupLocation: args.pickupLocation,
      pickupTime: args.pickupTime,
      status: "pending",
      notes: args.notes,
      dealershipId,
      dealershipName,
      dealershipBrand,
    });

    const adminRecipients = await getAdminRecipients(ctx);
    const pickupSummary = args.pickupLocation || args.pickupTime
      ? ` Pickup${args.pickupLocation ? ` at ${args.pickupLocation}` : ''}${args.pickupTime ? `, time ${args.pickupTime}` : ''}.`
      : '';

    await ctx.db.insert("notifications", {
      userId: targetUserId,
      type: "booking_created",
      title: "Test Drive Requested",
      message: `Your test drive for ${args.vehicleDescription} on ${args.preferredDate} at ${args.preferredTime} has been submitted.${pickupSummary} We'll confirm shortly!`,
      bookingId: undefined,
      isRead: false,
    });

    for (const recipientId of adminRecipients) {
      if (!recipientId || recipientId === targetUserId) continue;
      await ctx.db.insert("notifications", {
        userId: recipientId,
        type: "booking_created",
        title: "New Test Drive Request",
        message: `${userName} requested a test drive for ${args.vehicleDescription} on ${args.preferredDate} at ${args.preferredTime}${pickupSummary}`,
        bookingId: undefined,
        isRead: false,
      });
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
        userId: recipientId,
        title: "New Test Drive Request",
        message: `${userName} requested a test drive for ${args.vehicleDescription} on ${args.preferredDate} at ${args.preferredTime}${pickupSummary}`,
      });
    }

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: current.userId,
      type: "test_drive_requested",
      title: "Test Drive Request",
      description: `${userName} requested a test drive for ${args.vehicleDescription} on ${args.preferredDate} at ${args.preferredTime}${args.pickupLocation ? ` | Pickup: ${args.pickupLocation}` : ''}${args.pickupTime ? ` | Pickup time: ${args.pickupTime}` : ''}`,
      customerName: userName,
      customerPhone: userPhone,
      metadata: JSON.stringify({
        testDriveId: tdId.toString(),
        ownerUserId: current.userId,
        vehicleDescription: args.vehicleDescription,
        date: args.preferredDate,
        time: args.preferredTime,
        pickupLocation: args.pickupLocation,
        pickupTime: args.pickupTime,
        dealershipId,
        dealershipName,
        dealershipBrand,
      }),
      triggeredBy: targetUserId,
    });

    await ctx.scheduler.runAfter(2 * 60 * 60 * 1000, internal.testDrives.escalatePending, {
      testDriveId: tdId,
    });

    return tdId;
  },
});

export const listMine = query({
  args: {},
  returns: v.array(testDriveReturn),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const tds = await ctx.db
      .query("testDrives")
      .withIndex("by_userId", (q: any) => q.eq("userId", current.userId))
      .order("desc")
      .collect();

    return tds.map(mapTestDrive);
  },
});

export const listAll = query({
  args: {},
  returns: v.array(testDriveReturn),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    if (!await hasTestDriveMenuAccess(ctx, current.user, current.userId)) return [];

    if (canSeeAllWorkspace(current.user)) {
      const tds = await ctx.db.query("testDrives").order("desc").collect();
      return tds.map(mapTestDrive);
    }

    const owned = await ctx.db
      .query("testDrives")
      .withIndex("by_userId", (q: any) => q.eq("userId", current.userId))
      .order("desc")
      .collect();
    const assigned = await ctx.db
      .query("testDrives")
      .withIndex("by_assignedToUserId", (q: any) => q.eq("assignedToUserId", current.userId))
      .order("desc")
      .collect();

    const dealershipId = String(current.user?.dealershipId ?? "").trim();
    const tds = [...owned, ...assigned]
      .filter((td: any, index: number, arr: any[]) => arr.findIndex((row: any) => String(row._id) === String(td._id)) === index)
      .filter((td: any) => String(td.dealershipId ?? "") === dealershipId || td.ownerUserId === current.userId || td.assignedToUserId === current.userId)
      .sort((a: any, b: any) => b._creationTime - a._creationTime);
    return tds.map(mapTestDrive);
  },
});

export const listPending = query({
  args: {},
  returns: v.array(testDriveReturn),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    if (!await hasTestDriveMenuAccess(ctx, current.user, current.userId)) return [];

    const tds = await ctx.db
      .query("testDrives")
      .withIndex("by_status", (q: any) => q.eq("status", "pending"))
      .order("desc")
      .collect();

    if (canSeeAllWorkspace(current.user)) {
      return tds.map(mapTestDrive);
    }

    return tds
      .filter((td: any) => canAccessTestDrive(current.user, current.userId, td))
      .map(mapTestDrive);
  },
});

export const accept = mutation({
  args: {
    testDriveId: v.id("testDrives"),
    assignedToUserId: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    confirmedDate: v.optional(v.string()),
    confirmedTime: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !canManageTestDrives(current.user)) throw new Error("Not authorized");
    if (!await hasTestDriveMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");

    const td = await ctx.db.get(args.testDriveId);
    if (!td || !canAccessTestDrive(current.user, current.userId, td)) throw new Error("Test drive not found");

    const assignedToUserId = args.assignedToUserId ?? current.userId;
    const assignedUser = await ctx.db.get(assignedToUserId as any);
    const assignedToName = args.assignedToName ?? assignedUser?.name ?? assignedUser?.email ?? current.user?.name ?? "Sales Executive";
    const confirmedDate = args.confirmedDate ?? td.confirmedDate ?? td.preferredDate;
    const confirmedTime = args.confirmedTime ?? td.confirmedTime ?? td.preferredTime;
    const now = Date.now();

    await ctx.db.patch(args.testDriveId, {
      status: "confirmed",
      assignedTo: assignedToUserId,
      assignedToUserId,
      assignedToName,
      confirmedDate,
      confirmedTime,
      acknowledgedAt: td.acknowledgedAt ?? now,
    });

    await notifyTestDriveActivity(ctx, {
      ...td,
      assignedToUserId,
      assignedToName,
      confirmedDate,
      confirmedTime,
    }, current.userId, {
      type: "booking_confirmed",
      customerTitle: "Test Drive Confirmed",
      customerMessage: `Your test drive for ${td.vehicleDescription} has been confirmed for ${confirmedDate} at ${confirmedTime} with ${assignedToName}.`,
      staffTitle: "Test Drive Confirmed",
      staffMessage: `${td.userName}'s test drive for ${td.vehicleDescription} was confirmed for ${confirmedDate} at ${confirmedTime} with ${assignedToName}.`,
    });

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: td.ownerUserId ?? current.userId,
      type: "booking_confirmed",
      title: "Test Drive Confirmed",
      description: `${td.userName} test drive for ${td.vehicleDescription} confirmed for ${confirmedDate} at ${confirmedTime} by ${assignedToName}`,
      customerName: td.userName,
      customerPhone: td.userPhone,
      metadata: JSON.stringify({ testDriveId: args.testDriveId.toString(), confirmedDate, confirmedTime, assignedToUserId }),
      triggeredBy: current.userId,
    });

    return null;
  },
});

export const reject = mutation({
  args: {
    testDriveId: v.id("testDrives"),
    rejectionReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !canManageTestDrives(current.user)) throw new Error("Not authorized");
    if (!await hasTestDriveMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");

    const td = await ctx.db.get(args.testDriveId);
    if (!td) throw new Error("Test drive not found");

    await ctx.db.patch(args.testDriveId, {
      status: "rejected",
      rejectionReason: args.rejectionReason?.trim() || undefined,
    });

    await notifyTestDriveActivity(ctx, td, current.userId, {
      type: "booking_updated",
      customerTitle: "Test Drive Rejected",
      customerMessage: `Your test drive for ${td.vehicleDescription} was rejected.${args.rejectionReason ? ` Reason: ${args.rejectionReason.trim()}.` : ""}`,
      staffTitle: "Test Drive Rejected",
      staffMessage: `${td.userName}'s test drive for ${td.vehicleDescription} was rejected.${args.rejectionReason ? ` Reason: ${args.rejectionReason.trim()}.` : ""}`,
    });

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: td.ownerUserId ?? current.userId,
      type: "booking_updated",
      title: "Test Drive Rejected",
      description: `${td.userName} test drive for ${td.vehicleDescription} was rejected${args.rejectionReason ? ` (${args.rejectionReason.trim()})` : ""}`,
      customerName: td.userName,
      customerPhone: td.userPhone,
      metadata: JSON.stringify({ testDriveId: args.testDriveId.toString(), rejectionReason: args.rejectionReason }),
      triggeredBy: current.userId,
    });

    return null;
  },
});

export const reschedule = mutation({
  args: {
    testDriveId: v.id("testDrives"),
    confirmedDate: v.string(),
    confirmedTime: v.string(),
    assignedToUserId: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !canManageTestDrives(current.user)) throw new Error("Not authorized");
    if (!await hasTestDriveMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");

    const td = await ctx.db.get(args.testDriveId);
    if (!td) throw new Error("Test drive not found");

    const assignedToUserId = args.assignedToUserId ?? td.assignedToUserId ?? current.userId;
    const assignedUser = await ctx.db.get(assignedToUserId as any);
    const assignedToName = args.assignedToName ?? assignedUser?.name ?? assignedUser?.email ?? td.assignedToName ?? current.user?.name ?? "Sales Executive";

    await ctx.db.patch(args.testDriveId, {
      status: "confirmed",
      assignedTo: assignedToUserId,
      assignedToUserId,
      assignedToName,
      confirmedDate: args.confirmedDate,
      confirmedTime: args.confirmedTime,
    });

    const scheduleText = `${args.confirmedDate} at ${args.confirmedTime}`;

    await notifyTestDriveActivity(ctx, {
      ...td,
      assignedToUserId,
      assignedToName,
      confirmedDate: args.confirmedDate,
      confirmedTime: args.confirmedTime,
    }, current.userId, {
      type: "booking_updated",
      customerTitle: "Test Drive Rescheduled",
      customerMessage: `Your test drive for ${td.vehicleDescription} has been rescheduled to ${scheduleText} with ${assignedToName}.`,
      staffTitle: "Test Drive Rescheduled",
      staffMessage: `${td.userName}'s test drive for ${td.vehicleDescription} has been rescheduled to ${scheduleText} with ${assignedToName}.`,
    });

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: td.ownerUserId ?? current.userId,
      type: "booking_updated",
      title: "Test Drive Rescheduled",
      description: `${td.userName} test drive for ${td.vehicleDescription} rescheduled to ${scheduleText} by ${assignedToName}`,
      customerName: td.userName,
      customerPhone: td.userPhone,
      metadata: JSON.stringify({ testDriveId: args.testDriveId.toString(), confirmedDate: args.confirmedDate, confirmedTime: args.confirmedTime, assignedToUserId }),
      triggeredBy: current.userId,
    });

    return null;
  },
});

export const complete = mutation({
  args: { testDriveId: v.id("testDrives") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !canManageTestDrives(current.user)) throw new Error("Not authorized");
    if (!await hasTestDriveMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");

    const td = await ctx.db.get(args.testDriveId);
    if (!td) throw new Error("Test drive not found");

    await ctx.db.patch(args.testDriveId, {
      status: "completed",
      completedAt: Date.now(),
    });

    await notifyTestDriveActivity(ctx, td, current.userId, {
      type: "booking_completed",
      customerTitle: "Test Drive Completed",
      customerMessage: `Your test drive for ${td.vehicleDescription} is complete. You can now add your review.`,
      staffTitle: "Test Drive Completed",
      staffMessage: `${td.userName}'s test drive for ${td.vehicleDescription} was completed and can now be reviewed.`,
    });

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: td.ownerUserId ?? current.userId,
      type: "booking_completed",
      title: "Test Drive Completed",
      description: `${td.userName} test drive for ${td.vehicleDescription} marked completed by ${current.user?.name ?? current.user?.email ?? 'staff'}`,
      customerName: td.userName,
      customerPhone: td.userPhone,
      metadata: JSON.stringify({ testDriveId: args.testDriveId.toString() }),
      triggeredBy: current.userId,
    });

    return null;
  },
});

export const assign = mutation({
  args: {
    testDriveId: v.id("testDrives"),
    staffId: v.optional(v.string()),
    assignedToUserId: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !canSeeAllWorkspace(current.user)) throw new Error("Not authorized");
    if (!await hasTestDriveMenuAccess(ctx, current.user, current.userId)) throw new Error("Not authorized");

    const td = await ctx.db.get(args.testDriveId);
    if (!td) throw new Error("Test drive not found");

    const targetStaffId = args.assignedToUserId ?? args.staffId ?? undefined;
    const customerRecipientId = td.userId;
    const workspaceOwnerRecipientId = td.ownerUserId && td.ownerUserId !== td.userId ? td.ownerUserId : undefined;
    const assignedUser = targetStaffId ? await ctx.db.get(targetStaffId as any) : null;
    const assignedName = args.assignedToName ?? assignedUser?.name ?? assignedUser?.email ?? "Sales Executive";

    await ctx.db.patch(args.testDriveId, {
      assignedTo: targetStaffId,
      assignedToUserId: targetStaffId,
      assignedToName: assignedName,
      ownerUserId: td.ownerUserId ?? current.userId,
    });

    if (targetStaffId) {
      await ctx.db.insert("notifications", {
        userId: customerRecipientId,
        type: "booking_assigned",
        title: "Test Drive Assigned",
        message: `Your test drive for ${td.vehicleDescription} has been assigned to ${assignedName}.`,
        bookingId: undefined,
        isRead: false,
      });
      if (workspaceOwnerRecipientId) {
        await ctx.db.insert("notifications", {
          userId: workspaceOwnerRecipientId,
          type: "booking_assigned",
          title: "Test Drive Assigned",
          message: `${td.userName}'s test drive for ${td.vehicleDescription} has been assigned to ${assignedName}.`,
          bookingId: undefined,
          isRead: false,
        });
      }
      await ctx.db.insert("notifications", {
        userId: targetStaffId,
        type: "booking_assigned",
        title: "New Test Drive Assigned",
        message: `${td.userName}'s test drive for ${td.vehicleDescription} has been assigned to you.`,
        bookingId: undefined,
        isRead: false,
      });
    }

    return null;
  },
});

export const updateStatus = mutation({
  args: {
    testDriveId: v.id("testDrives"),
    status: v.string(),
    assignedTo: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    assignedDriverName: v.optional(v.string()),
    pickupLocation: v.optional(v.string()),
    pickupTime: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const td = await ctx.db.get(args.testDriveId);
    if (!td || (!canSeeAllWorkspace(current.user) && td.userId !== current.userId && td.ownerUserId !== current.userId && td.assignedToUserId !== current.userId)) {
      throw new Error("Test drive not found");
    }

    const customerRecipientId = td.userId;
    const workspaceOwnerRecipientId = td.ownerUserId && td.ownerUserId !== td.userId ? td.ownerUserId : undefined;
    const patch: any = { status: args.status };
    if (args.assignedTo !== undefined) {
      patch.assignedTo = args.assignedTo;
      patch.assignedToUserId = args.assignedTo;
    }
    if (args.assignedToName !== undefined) patch.assignedToName = args.assignedToName;
    if (args.assignedDriverName !== undefined) patch.assignedDriverName = args.assignedDriverName;
    if (args.pickupLocation !== undefined) patch.pickupLocation = args.pickupLocation;
    if (args.pickupTime !== undefined) patch.pickupTime = args.pickupTime;
    await ctx.db.patch(args.testDriveId, patch);

    const adminRecipients = await getAdminRecipients(ctx);
    const notificationRecipients = Array.from(new Set([td.ownerUserId, td.assignedToUserId, ...adminRecipients].filter(Boolean)));
    const pickupSummary = args.pickupLocation || args.pickupTime
      ? ` Pickup${args.pickupLocation ? `: ${args.pickupLocation}` : ''}${args.pickupTime ? ` at ${args.pickupTime}` : ''}.`
      : '';
    const driverSummary = args.assignedDriverName ? ` Driver assigned: ${args.assignedDriverName}.` : '';

    for (const recipientId of notificationRecipients) {
      if (recipientId === customerRecipientId) continue;
      await ctx.db.insert("notifications", {
        userId: recipientId,
        type: "booking_updated",
        title: `Test Drive ${args.status.charAt(0).toUpperCase() + args.status.slice(1)}`,
        message: `${td.userName}'s test drive for ${td.vehicleDescription} is now ${args.status}.${pickupSummary}${driverSummary}`,
        bookingId: undefined,
        isRead: false,
      });
    }

    if (workspaceOwnerRecipientId && workspaceOwnerRecipientId !== customerRecipientId) {
      await ctx.db.insert("notifications", {
        userId: workspaceOwnerRecipientId,
        type: "booking_updated",
        title: `Test Drive ${args.status.charAt(0).toUpperCase() + args.status.slice(1)}`,
        message: `${td.userName}'s test drive for ${td.vehicleDescription} is now ${args.status}.${pickupSummary}${driverSummary}`,
        bookingId: undefined,
        isRead: false,
      });
    }

    await ctx.db.insert("notifications", {
      userId: customerRecipientId,
      type: "booking_updated",
      title: `Test Drive ${args.status.charAt(0).toUpperCase() + args.status.slice(1)}`,
      message: `Your test drive for ${td.vehicleDescription} is now ${args.status}.${pickupSummary}${driverSummary}`,
      bookingId: undefined,
      isRead: false,
    });

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: td.ownerUserId ?? current.userId,
      type: "booking_updated",
      title: "Test Drive Updated",
      description: `${td.userName} test drive for ${td.vehicleDescription} updated to ${args.status}.${pickupSummary}${driverSummary}`,
      customerName: td.userName,
      customerPhone: td.userPhone,
      metadata: JSON.stringify({
        testDriveId: args.testDriveId.toString(),
        ownerUserId: td.ownerUserId,
        status: args.status,
        pickupLocation: args.pickupLocation ?? td.pickupLocation,
        pickupTime: args.pickupTime ?? td.pickupTime,
        assignedDriverName: args.assignedDriverName ?? td.assignedDriverName,
      }),
      triggeredBy: current.userId,
    });

    return null;
  },
});