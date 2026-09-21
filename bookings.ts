import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { isVincentAdminUser, isRegionalManagerUser, isServiceManagerUser, isPartsAccessoriesManagerUser, isAdminUser, getUserDepartment, canAccessDepartment, getViewer } from "./auth";
import { notifyStaff, notifyCustomer } from './emails';
import { sendSMSToStaff, sendWhatsAppToStaff, sendSMSToCustomer, sendWhatsAppToCustomer, sendEmailToCustomer } from './emails';

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";
const GOOGLE_CALENDAR_BASE_URL = "https://calendar.google.com/calendar/render?action=TEMPLATE";
const SERVICE_REFERRAL_REWARD = 50;

function canSeeAllWorkspace(user: any) {
  const role = String(user?.staffRole ?? user?.role ?? "").trim().toLowerCase();
  return Boolean(
    isVincentAdminUser(user) ||
    isAdminUser(user) ||
    role === "service_manager" ||
    role === "workshop_manager" ||
    role === "service_advisor"
  );
}

function isPartsAndAccessoriesManager(user: any) {
  const role = String(user?.staffRole ?? user?.role ?? "").trim().toLowerCase();
  return Boolean(isPartsAccessoriesManagerUser(user) || ["parts_manager", "accessories_manager", "merchandise_manager", "parts_accessories_manager", "parts_and_accessories_manager", "parts_accessory_manager"].includes(role));
}

function isWorkshopFlowUser(user: any) {
  return Boolean(canSeeAllWorkspace(user) || isPartsAndAccessoriesManager(user));
}

async function isSalesExecutiveUser(ctx: any, userId?: string | null) {
  if (!userId) return false;
  const user = await safeDbGet(ctx, userId);
  const role = String(user?.staffRole ?? user?.role ?? "").trim().toLowerCase();
  return ["sales_executive", "sales_manager", "sales"].includes(role);
}

async function getAdminRecipients(ctx: any) {
  const users = await ctx.db.query("users").collect();
  return users
    .filter((u: any) => canSeeAllWorkspace(u))
    .map((u: any) => String(u._id));
}

async function getServiceNotificationRecipients(ctx: any, dealershipId?: string) {
  const users = await ctx.db.query("users").collect();
  return users
    .filter((u: any) => {
      const role = String(u?.staffRole ?? u?.role ?? "").trim().toLowerCase();
      const matchesRole = ["service_advisor", "service_manager", "workshop_manager"].includes(role);
      if (!matchesRole) return false;
      if (!dealershipId) return true;
      return String(u.dealershipId ?? "") === String(dealershipId);
    })
    .map((u: any) => ({ userId: String(u._id), email: String(u.email ?? "").trim() }))
    .filter((row: any) => row.email);
}

async function getCustomerWorkspaceOwnerId(ctx: any, linkedUserId: string) {
  const profile = await ctx.db
    .query("customerProfiles")
    .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", linkedUserId))
    .first();
  return profile?.ownerUserId ?? profile?.assignedToUserId ?? profile?.assignedByUserId ?? null;
}

async function getBookingWorkspaceOwnerId(ctx: any, booking: any) {
  if (!booking?.userId) return booking?.ownerUserId ?? null;
  const profileOwnerId = await getCustomerWorkspaceOwnerId(ctx, booking.userId);
  return booking.ownerUserId ?? profileOwnerId ?? booking.assignedToUserId ?? booking.assignedTo ?? null;
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
  if (identity?.subject) {
    try {
      const subjectDoc: any = await safeDbGet(ctx, identity.subject);
      if (subjectDoc?.userId) {
        const nestedUser = await safeDbGet(ctx, subjectDoc.userId);
        if (nestedUser) return nestedUser;
      }
      if (subjectDoc?.email || subjectDoc?.role) return subjectDoc;
    } catch {}
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
        const nestedUser = await safeDbGet(ctx, tokenDoc.userId);
        if (nestedUser) return nestedUser;
      }
      if (tokenDoc?.email || tokenDoc?.role) return tokenDoc;
    }
  }

  return null;
}

function buildGoogleCalendarUrl(title: string, details: string, date: string, timeSlot: string) {
  const [hours, minutes] = timeSlot.split(':');
  const start = `${date.replace(/-/g, '')}T${hours}${minutes}00`;
  const endHour = String(Number(hours) + 1).padStart(2, '0');
  const end = `${date.replace(/-/g, '')}T${endHour}${minutes}00`;
  return `${GOOGLE_CALENDAR_BASE_URL}&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}&dates=${start}/${end}`;
}

function buildCalendarUrl(title: string, details: string, date: string, timeSlot?: string) {
  if (timeSlot) return buildGoogleCalendarUrl(title, details, date, timeSlot);
  // For all-day events, end date needs to be next day (exclusive)
  const d = new Date(`${date}T00:00:00`);
  const nextDay = new Date(d.getTime() + 86400000).toISOString().split('T')[0];
  const startDay = date.replace(/-/g, '');
  const endDay = nextDay.replace(/-/g, '');
  return `${GOOGLE_CALENDAR_BASE_URL}&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}&dates=${startDay}/${endDay}`;
}

function normalizeCalendarText(value: any) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getCalendarEntryKey(entry: { title?: string; details?: string; date?: string; time?: string; allDay?: boolean }) {
  return [
    normalizeCalendarText(entry.title),
    normalizeCalendarText(entry.details),
    normalizeCalendarText(entry.date),
    normalizeCalendarText(entry.time),
    String(Boolean(entry.allDay)),
  ].join('|');
}

function sameCalendarEntry(existing: any, args: { title: string; details?: string; date: string; time?: string; allDay?: boolean }) {
  return getCalendarEntryKey(existing) === getCalendarEntryKey(args);
}

function dedupeCalendarEntries(entries: any[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = getCalendarEntryKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function createCalendarEntry(ctx: any, booking: any, vehicle: any, createdBy: string) {
  const title = `${booking.serviceType} Booking`;
  const details = [
    booking.customerName ? `Customer: ${booking.customerName}` : null,
    vehicle ? `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.registration})` : null,
    booking.notes ? `Notes: ${booking.notes}` : null,
  ].filter(Boolean).join("\n");
  const reminderAt = parseBookingReminderTime(booking.date, booking.timeSlot);
  const googleCalendarUrl = buildGoogleCalendarUrl(title, details, booking.date, booking.timeSlot);

  await ctx.db.insert("calendarEntries", {
    userId: booking.userId,
    bookingId: booking._id,
    title,
    details,
    date: booking.date,
    time: booking.timeSlot,
    allDay: false,
    source: "booking",
    reminderAt: reminderAt ?? undefined,
    googleCalendarUrl,
    createdBy,
  });
}

async function getCurrentUser(ctx: any) {
  const viewer = await getViewer(ctx);
  if (!viewer) return null;

  return {
    identity: viewer.identity,
    userId: String(viewer.userId),
    user: viewer.user,
    isModerator: Boolean(
      viewer.user?.isOwner ||
      String(viewer.user?.email ?? "").trim().toLowerCase() === VINCENT_ADMIN_EMAIL ||
      viewer.user?.staffRole === "dp" ||
      viewer.user?.staffRole === "regional" ||
      viewer.user?.staffRole === "regional_manager"
    ),
    isWorkshopManager: isServiceManagerUser(viewer.user) || viewer.user?.role === "workshop_manager",
  };
}

function getAssignedStaff(current: any) {
  if (!current?.user) return null;
  const assignedStaffUserId = String(current.user.assignedStaffUserId ?? "").trim();
  if (!assignedStaffUserId) return null;
  return {
    assignedStaffUserId,
    assignedStaffName: current.user.assignedStaffName ?? current.user.name ?? current.user.email ?? "Staff",
    assignedStaffRole: current.user.assignedStaffRole ?? current.user.staffRole ?? current.user.role,
    assignedStaffDealershipId: current.user.assignedStaffDealershipId ?? current.user.dealershipId,
  };
}

function canAccessBooking(current: any, booking: any) {
  if (!current?.user || !booking) return false;
  if (canSeeAllWorkspace(current.user)) return true;
  if (!canAccessDepartment(current.user, booking.department ?? "service")) return false;
  const currentUserId = String(current.userId ?? "");
  return Boolean(
    String(booking.ownerUserId ?? booking.ownerId ?? booking.owner_id ?? "") === currentUserId ||
    String(booking.userId ?? "") === currentUserId ||
    String(booking.assignedTo ?? "") === currentUserId ||
    String(booking.assignedToUserId ?? "") === currentUserId
  );
}

function isServiceStaff(user: any) {
  const role = String(user?.staffRole ?? user?.role ?? "").trim().toLowerCase();
  return ["service_advisor", "service_manager", "workshop_manager"].includes(role);
}

async function recordServiceCommission(ctx: any, booking: any, current: any, staffName: string) {
  const creditedStaffUserId = booking.assignedToUserId ?? booking.assignedTo ?? booking.ownerUserId ?? null;
  if (!creditedStaffUserId) return;

  const creditedStaff = await safeDbGet(ctx, creditedStaffUserId);
  if (!creditedStaff) return;

  const role = String(creditedStaff.staffRole ?? creditedStaff.role ?? "").trim().toLowerCase();
  if (!role || (!isServiceStaff(creditedStaff) && !["sales_executive", "sales_manager", "sales"].includes(role))) return;

  const existingCredit = await ctx.db
    .query("salesExecutiveWalletTransactions")
    .withIndex("by_bookingId", (q: any) => q.eq("bookingId", booking._id))
    .first();
  if (existingCredit) return;

  const amount = 50;
  const existingWallet = await ctx.db
    .query("salesExecutiveWallets")
    .withIndex("by_userId", (q: any) => q.eq("userId", String(creditedStaffUserId)))
    .first();
  const nextBalance = (existingWallet?.balance ?? 0) + amount;
  if (existingWallet) {
    await ctx.db.patch(existingWallet._id, {
      balance: nextBalance,
      totalEarned: (existingWallet.totalEarned ?? 0) + amount,
      lastUpdatedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("salesExecutiveWallets", {
      userId: String(creditedStaffUserId),
      balance: amount,
      totalEarned: amount,
      totalWithdrawn: 0,
      lastUpdatedAt: Date.now(),
      createdAt: Date.now(),
    });
  }

  await ctx.db.insert("salesExecutiveWalletTransactions", {
    userId: String(creditedStaffUserId),
    bookingId: booking._id,
    transactionType: "service_booking_credit",
    amount,
    description: `R50 credit for completed service booking ${booking.referenceNumber ?? booking._id.toString()}`,
    createdAt: Date.now(),
  });

  await ctx.db.patch(booking._id, {
    walletCreditedAt: Date.now(),
    walletCreditAmount: amount,
  });

  await ctx.runMutation(internal.activityLog.logInternal, {
    ownerUserId: String(creditedStaffUserId),
    type: "wallet_credit",
    title: "Service booking commission credited",
    description: `${booking.customerName ?? "Customer"}'s ${booking.serviceType} completed and credited R50.`,
    customerName: booking.customerName,
    customerPhone: booking.customerPhone ?? undefined,
    metadata: JSON.stringify({ bookingId: booking._id.toString(), amount, transactionType: "service_booking_credit" }),
    triggeredBy: current.userId,
  });
}

async function creditServiceReferralWallet(ctx: any, booking: any) {
  const referredUserId = String(booking.ownerUserId ?? booking.userId ?? "");
  if (!referredUserId) return;
  const existing = await ctx.db
    .query("referralWalletTransactions")
    .withIndex("by_sourceType_and_sourceId", (q: any) => q.eq("sourceType", "service_booking").eq("sourceId", String(booking._id)))
    .first();
  if (existing) return;
  await ctx.runMutation(internal.referrals.creditReferralEvent, {
    userId: referredUserId,
    sourceType: "service_booking",
    sourceId: String(booking._id),
    amount: SERVICE_REFERRAL_REWARD,
    description: `Referral reward for completed service booking ${booking.serviceType}`,
    metadata: JSON.stringify({ bookingId: String(booking._id), serviceType: booking.serviceType, status: booking.status }),
  });
}

const bookingReturnValidator = v.object({
  _id: v.id("bookings"),
  _creationTime: v.number(),
  ownerUserId: v.optional(v.string()),
  userId: v.string(),
  customerProfileId: v.optional(v.string()),
  vehicleId: v.id("vehicles"),
  referenceNumber: v.optional(v.string()),
  serviceType: v.string(),
  serviceAmount: v.optional(v.number()),
  date: v.string(),
  timeSlot: v.string(),
  status: v.string(),
  notes: v.optional(v.string()),
  pickupRequested: v.optional(v.boolean()),
  pickupLocation: v.optional(v.string()),
  pickupTime: v.optional(v.string()),
  assignedDriverId: v.optional(v.string()),
  assignedDriverName: v.optional(v.string()),
  assignedTo: v.optional(v.string()),
  assignedToName: v.optional(v.string()),
  assignedToUserId: v.optional(v.string()),
  assignedToRole: v.optional(v.string()),
  customerEmail: v.optional(v.string()),
  customerName: v.optional(v.string()),
  customerImage: v.optional(v.string()),
  userImage: v.optional(v.string()),
  customerPhone: v.optional(v.string()),
  ratingId: v.optional(v.id("ratings")),
  acknowledgedAt: v.optional(v.number()),
  walletCreditedAt: v.optional(v.number()),
  walletCreditAmount: v.optional(v.number()),
  statusHistory: v.optional(v.array(v.object({
    status: v.string(),
    timestamp: v.number(),
    updatedBy: v.optional(v.string()),
    updatedByName: v.optional(v.string()),
    note: v.optional(v.string()),
  }))),
});

const bookingDetailValidator = v.object({
  booking: bookingReturnValidator,
  vehicle: v.union(
    v.object({
      _id: v.id("vehicles"),
      make: v.string(),
      model: v.string(),
      year: v.number(),
      registration: v.string(),
      color: v.optional(v.string()),
      mileage: v.optional(v.number()),
    }),
    v.null()
  ),
  customerProfile: v.union(
    v.object({
      _id: v.string(),
      firstName: v.string(),
      surname: v.string(),
      fullName: v.string(),
      phone: v.string(),
      homePhone: v.optional(v.string()),
      workPhone: v.optional(v.string()),
      vehicleDescription: v.string(),
      registrationDate: v.optional(v.string()),
      tradeInInterest: v.optional(v.string()),
      referralNotes: v.optional(v.string()),
      applicationNotes: v.optional(v.string()),
    }),
    v.null()
  ),
});

const MORNING_SLOTS = ["07:00", "07:30", "08:00", "08:30", "09:00"];

function isMorningSlot(slot: string) {
  return MORNING_SLOTS.includes(slot);
}

function bookingReference() {
  return `BK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function sameDay(date: string) {
  return date === new Date().toISOString().split("T")[0];
}

function parseBookingReminderTime(date: string, timeSlot: string) {
  const reminderTarget = new Date(`${date}T${timeSlot}:00`);
  if (Number.isNaN(reminderTarget.getTime())) return null;
  const reminderAt = reminderTarget.getTime() - 2 * 60 * 60 * 1000;
  return reminderAt > Date.now() ? reminderAt : Date.now() + 60 * 1000;
}

function bookingSummary(booking: any, vehicle: any) {
  return {
    booking: mapBooking(booking),
    customerName: booking.customerName ?? "Customer",
    customerEmail: booking.customerEmail ?? "",
    customerPhone: booking.customerPhone ?? "",
    vehicleInfo: vehicle
      ? `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.registration})`
      : "Unknown vehicle",
  };
}

function mapDetailBooking(booking: any, vehicle: any, customerProfile: any) {
  return {
    booking: mapBooking(booking),
    vehicle: vehicle
      ? {
          _id: vehicle._id,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          registration: vehicle.registration,
          color: vehicle.color,
          mileage: vehicle.mileage,
        }
      : null,
    customerProfile: customerProfile
      ? {
          _id: customerProfile._id.toString(),
          firstName: customerProfile.firstName,
          surname: customerProfile.surname,
          fullName: customerProfile.fullName,
          phone: customerProfile.phone,
          homePhone: customerProfile.homePhone,
          workPhone: customerProfile.workPhone,
          vehicleDescription: customerProfile.vehicleDescription,
          registrationDate: customerProfile.registrationDate,
          tradeInInterest: customerProfile.tradeInInterest,
          referralNotes: customerProfile.referralNotes,
          applicationNotes: customerProfile.applicationNotes,
        }
      : null,
  };
}

function mapBooking(b: any) {
  return {
    _id: b._id,
    _creationTime: b._creationTime,
    ownerUserId: b.ownerUserId,
    userId: b.userId,
    customerProfileId: b.customerProfileId,
    vehicleId: b.vehicleId,
    referenceNumber: b.referenceNumber ?? `BK-${b._id.toString().slice(-6).toUpperCase()}`,
    serviceType: b.serviceType,
    serviceAmount: b.serviceAmount,
    date: b.date,
    timeSlot: b.timeSlot,
    status: b.status,
    notes: b.notes,
    pickupRequested: b.pickupRequested,
    pickupLocation: b.pickupLocation,
    pickupTime: b.pickupTime,
    assignedDriverId: b.assignedDriverId,
    assignedDriverName: b.assignedDriverName,
    assignedTo: b.assignedTo,
    assignedToName: b.assignedToName,
    assignedToUserId: b.assignedToUserId,
    assignedToRole: b.assignedToRole,
    customerEmail: b.customerEmail,
    customerName: b.customerName,
    customerImage: b.customerImage,
    userImage: b.userImage,
    customerPhone: b.customerPhone,
    ratingId: b.ratingId,
    walletCreditedAt: b.walletCreditedAt,
    walletCreditAmount: b.walletCreditAmount,
    statusHistory: b.statusHistory,
  };
}

export const getReminderContext = internalQuery({
  args: { bookingId: v.id("bookings") },
  returns: v.union(
    v.object({
      booking: bookingReturnValidator,
      customerName: v.string(),
      customerEmail: v.string(),
      vehicleInfo: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return null;
    const vehicle = await ctx.db.get(booking.vehicleId);
    return bookingSummary(booking, vehicle);
  },
});

export const create = mutation({
  args: {
    vehicleId: v.optional(v.id('vehicles')),
    vehicleMake: v.optional(v.string()),
    vehicleModel: v.optional(v.string()),
    vehicleYear: v.optional(v.number()),
    vehicleRegistration: v.optional(v.string()),
    vehicleColor: v.optional(v.string()),
    customerProfileId: v.optional(v.id('customerProfiles')),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    serviceType: v.string(),
    serviceAmount: v.optional(v.number()),
    date: v.string(),
    timeSlot: v.string(),
    notes: v.optional(v.string()),
  },
  returns: v.id('bookings'),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.userId) throw new Error('Not authenticated');

    if (!MORNING_SLOTS.includes(args.timeSlot)) {
      throw new Error("Bookings are only available between 07:00 and 09:00.");
    }

    if (sameDay(args.date)) {
      const currentHour = new Date().getHours();
      const currentMinutes = new Date().getMinutes();
      const afterCutoff = currentHour > 9 || (currentHour === 9 && currentMinutes > 0);
      if (afterCutoff) {
        throw new Error("Same-day booking is only available before 09:00. Please book for tomorrow.");
      }
    }

    const customerProfile = args.customerProfileId ? await ctx.db.get(args.customerProfileId) : null;
    const customerName = customerProfile?.fullName ?? args.customerName ?? viewer.user?.name ?? viewer.identity?.name ?? viewer.identity?.email ?? "Customer";
    const customerEmail = customerProfile?.contactEmail ?? args.customerEmail ?? viewer.user?.email ?? viewer.identity?.email ?? "";
    const customerPhone = customerProfile?.phone ?? args.customerPhone ?? "";

    let vehicle = args.vehicleId ? await ctx.db.get(args.vehicleId) : null;
    if (!vehicle) {
      if (!args.vehicleMake || !args.vehicleModel || !args.vehicleYear || !args.vehicleRegistration) {
        throw new Error("Please provide vehicle details for this customer booking.");
      }
      const vehicleId = await ctx.db.insert("vehicles", {
        userId: viewer.userId,
        make: args.vehicleMake,
        model: args.vehicleModel,
        year: args.vehicleYear,
        registration: args.vehicleRegistration,
        color: args.vehicleColor,
        mileage: undefined,
        isDefault: false,
        isDeleted: false,
      });
      vehicle = await ctx.db.get(vehicleId);
    }
    if (!vehicle) throw new Error('Vehicle not found');

    const referenceNumber = bookingReference();

    const bookingId = await ctx.db.insert('bookings', {
      ownerUserId: viewer.userId,
      userId: viewer.userId,
      customerProfileId: args.customerProfileId,
      vehicleId: vehicle._id,
      referenceNumber,
      serviceType: args.serviceType,
      serviceAmount: args.serviceAmount,
      date: args.date,
      timeSlot: args.timeSlot,
      status: 'pending',
      notes: args.notes,
      customerName,
      customerEmail,
      customerPhone,
      assignedTo: undefined,
      assignedToUserId: undefined,
      assignedToName: undefined,
      assignedToRole: undefined,
    });

    if (customerProfile) {
      await ctx.db.patch(customerProfile._id, {
        ownerUserId: viewer.userId,
        assignedToUserId: undefined,
        assignedToName: undefined,
        assignedByUserId: viewer.userId,
        assignedByName: customerName,
      });
    }

    await ctx.scheduler.runAfter(0, internal.emails.notifyStaffOfNewBooking, {
      bookingId,
      customerName,
      customerEmail,
      serviceType: args.serviceType,
      date: args.date,
      timeSlot: args.timeSlot,
      vehicleInfo: `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.registration})`,
      notes: args.notes,
    });

    const serviceRecipients = await getServiceNotificationRecipients(ctx, vehicle?.dealershipId);
    for (const recipient of serviceRecipients) {
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
        userId: recipient.userId,
        title: `New Service Booking: ${args.serviceType}`,
        message: `${customerName} submitted a ${args.serviceType} booking for ${args.date} at ${args.timeSlot}.\nVehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.registration})`,
      });
    }

    return bookingId;
  },
});

export const listMine = query({
  args: {},
  returns: v.array(bookingReturnValidator),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_userId", (q: any) => q.eq("userId", current.userId))
      .order("desc")
      .collect();

    return bookings.map(mapBooking);
  },
});

export const getById = query({
  args: { bookingId: v.id("bookings") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const booking = await ctx.db.get(args.bookingId);
    if (!booking || !canAccessBooking(current, booking)) return null;

    const vehicle = await ctx.db.get(booking.vehicleId);
    const customerProfile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", booking.userId))
      .first();

    return mapDetailBooking(booking, vehicle, customerProfile);
  },
});

export const listByUser = query({
  args: { userId: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    if (!args.userId) return [];

    const scopeIds = Array.from(new Set([
      String(args.userId),
    ].filter(Boolean)));

    const buckets = await Promise.all([
      ...scopeIds.map((scopeId) => ctx.db.query("bookings").withIndex("by_userId", (q: any) => q.eq("userId", scopeId)).collect()),
      ...scopeIds.map((scopeId) => ctx.db.query("bookings").withIndex("by_ownerUserId", (q: any) => q.eq("ownerUserId", scopeId)).collect()),
    ]);

    const merged = buckets
      .flat()
      .filter((booking: any, index: number, arr: any[]) => arr.findIndex((row: any) => String(row._id) === String(booking._id)) === index)
      .sort((a: any, b: any) => Number(b._creationTime ?? 0) - Number(a._creationTime ?? 0));

    return merged;
  },
});

export const getLatest = query({
  args: {},
  returns: v.union(bookingReturnValidator, v.null()),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const booking = await ctx.db
      .query("bookings")
      .withIndex("by_userId", (q: any) => q.eq("userId", current.userId))
      .order("desc")
      .first();

    return booking ? mapBooking(booking) : null;
  },
});

export const getUpcoming = query({
  args: {},
  returns: v.union(bookingReturnValidator, v.null()),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const today = new Date().toISOString().split("T")[0];
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_userId", (q: any) => q.eq("userId", current.userId))
      .order("desc")
      .collect();

    const upcoming = bookings.find(
      (b: any) => b.date >= today && (b.status === "pending" || b.status === "confirmed")
    );

    return upcoming ? mapBooking(upcoming) : null;
  },
});

// === STAFF FUNCTIONS ===

export const listForStaff = query({
  args: {},
  returns: v.array(bookingReturnValidator),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    if (canSeeAllWorkspace(current.user)) {
      const bookings = await ctx.db.query("bookings").order("desc").collect();
      return bookings.map(mapBooking);
    }

    if (isServiceStaff(current.user)) {
      const bookings = await ctx.db.query("bookings").order("desc").collect();
      return bookings
        .filter((booking: any) => canAccessDepartment(current.user, booking.department ?? "service"))
        .map(mapBooking);
    }

    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_ownerUserId", (q: any) => q.eq("ownerUserId", current.userId))
      .order("desc")
      .collect();

    return bookings
      .filter((booking: any) => canAccessDepartment(current.user, booking.department ?? "service"))
      .map(mapBooking);
  },
});

export const listUnassigned = query({
  args: {},
  returns: v.array(bookingReturnValidator),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    // Allow admins and service advisors to see unassigned bookings
    const isAdmin = canSeeAllWorkspace(current.user);
    const isServiceAdvisor = current.user?.staffRole === "service_advisor";
    
    if (!isAdmin && !isServiceAdvisor) return [];

    const pending = await ctx.db
      .query("bookings")
      .withIndex("by_status", (q: any) => q.eq("status", "pending"))
      .order("desc")
      .collect();

    return pending.filter((b: any) => !b.assignedTo).map(mapBooking);
  },
});

export const listServiceAdvisorQueue = query({
  args: {},
  returns: v.array(bookingReturnValidator),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const isAdmin = canSeeAllWorkspace(current.user);
    const isServiceAdvisor = current.user?.staffRole === "service_advisor";

    if (!isAdmin && !isServiceAdvisor) return [];

    const advisors = await ctx.db
      .query("users")
      .withIndex("by_role", (q: any) => q.eq("role", "staff"))
      .collect();
    const advisorIds = new Set(
      advisors
        .filter((user: any) => user.staffRole === "service_advisor")
        .map((user: any) => String(user._id))
    );

    const bookings = await ctx.db
      .query("bookings")
      .order("desc")
      .collect();

    return bookings
      .filter((booking: any) => {
        const isAssignedToMe = booking.assignedToUserId === current.userId;
        const isUnassigned = !booking.assignedToUserId && booking.status !== "completed";
        return (isAdmin || isServiceAdvisor) && (isAssignedToMe || isUnassigned) && booking.status !== "completed";
      })
      .map(mapBooking);
  },
});

// NEW SIMPLE STAFF QUERY - NO PERMISSION DRAMA
export const listAllBookingsForStaffSimple = query({
  args: {},
  returns: v.array(bookingReturnValidator),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    
    const bookings = await ctx.db.query('bookings').order('desc').collect();
    // SHOW ALL BOOKINGS - INCLUDING COMPLETED (nothing filtered out!)
    const visibleBookings = bookings.filter((b: any) => 
      canAccessDepartment(current.user, b.department ?? 'service'));

    if (canSeeAllWorkspace(current.user) || isServiceStaff(current.user) || isWorkshopFlowUser(current.user)) {
      return visibleBookings.map(mapBooking);
    }

    return visibleBookings
      .filter((b: any) => b.ownerUserId === current.userId || b.userId === current.userId || b.assignedTo === current.userId || b.assignedToUserId === current.userId)
      .map(mapBooking);
  },
});

export const assignBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    staffId: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");

    const targetStaffId = args.assignedTo ?? args.staffId ?? undefined;
    const staffName = current.user?.name ?? current.user?.email ?? current.identity.name ?? current.identity.email ?? "Service Team";
    const patch: any = {};
    let resolvedStaffUserId: string | undefined;
    let resolvedStaffRole: string | undefined;
    let resolvedStaffName: string | undefined;
    let resolvedStaffEmail: string | undefined;
    let resolvedStaffPhone: string | undefined;

    if (targetStaffId) {
      const staffRow = await ctx.db
        .query("staff")
        .withIndex("by_email", (q: any) => q.eq("email", targetStaffId))
        .first() ?? await ctx.db.get(targetStaffId as any);

      const linkedUser = staffRow?.email
        ? await ctx.db.query("users").withIndex("email", (q: any) => q.eq("email", String(staffRow.email).trim().toLowerCase())).first()
        : null;

      resolvedStaffUserId = String(linkedUser?._id ?? staffRow?._id ?? targetStaffId);
      resolvedStaffRole = String(staffRow?.role ?? linkedUser?.staffRole ?? linkedUser?.role ?? "").trim() || undefined;
      resolvedStaffName = args.assignedToName ?? staffRow?.name ?? linkedUser?.name ?? linkedUser?.email ?? args.assignedToName;
      resolvedStaffEmail = String(staffRow?.email ?? linkedUser?.email ?? targetStaffId ?? "").trim() || undefined;
      resolvedStaffPhone = String(staffRow?.phone ?? linkedUser?.phone ?? "").trim() || undefined;

      patch.assignedTo = String(staffRow?._id ?? targetStaffId);
      patch.assignedToUserId = resolvedStaffUserId;
      patch.assignedToName = resolvedStaffName;
      patch.assignedToRole = resolvedStaffRole;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.bookingId, patch);
    }

    const assignedLabel = resolvedStaffName ?? args.assignedToName ?? booking.assignedToName ?? "Service Advisor";

    if (targetStaffId) {
      const serviceRecipients = await getServiceNotificationRecipients(ctx, booking.dealershipId);
     const notifyTargets = Array.from(new Set([resolvedStaffUserId, ...serviceRecipients.map((recipient: any) => recipient.userId)].filter(Boolean)));
      await ctx.runMutation(internal.notifications.createInternal, {
        userId: booking.userId,
        type: "booking_updated",
        title: "Booking Assigned",
        message: `Your ${booking.serviceType} booking has been assigned to ${assignedLabel}.`,
        bookingId: args.bookingId,
      });
      if (booking.ownerUserId && booking.ownerUserId !== booking.userId) {
        await ctx.runMutation(internal.notifications.createInternal, {
          userId: booking.ownerUserId,
          type: "booking_updated",
          title: "Booking Assigned",
          message: `${booking.customerName ?? "Customer"}'s ${booking.serviceType} booking has been assigned to ${assignedLabel}.`,
          bookingId: args.bookingId,
        });
      }
      for (const userId of notifyTargets) {
        await ctx.runMutation(internal.notifications.createInternal, {
          userId: String(userId),
          type: "booking_assigned",
          title: "New Booking Assigned",
          message: `${booking.customerName ?? "Customer"}'s ${booking.serviceType} booking has been assigned to you for moderation and updates.`,
          bookingId: args.bookingId,
        });
      }
      if (resolvedStaffEmail) {
        await ctx.scheduler.runAfter(0, internal.emails.notifyStaffOfAssignmentEmail, {
          staffEmail: resolvedStaffEmail,
          staffPhone: resolvedStaffPhone,
          staffName: resolvedStaffName ?? assignedLabel,
          assignmentType: "service_booking",
          referenceNumber: booking.referenceNumber ?? booking._id.toString().slice(-6).toUpperCase(),
          customerName: booking.customerName ?? "Customer",
          customerPhone: booking.customerPhone ?? undefined,
          details: `${booking.serviceType} booking for ${booking.date} at ${booking.timeSlot}`,
        });
      }
    }

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: current.userId,
      type: "booking_updated",
      title: "Booking Assigned",
      description: `${staffName} assigned ${booking.customerName ?? "Customer"}'s ${booking.serviceType} booking to ${assignedLabel}`,
      customerName: booking.customerName,
      customerPhone: undefined,
      metadata: JSON.stringify({ bookingId: args.bookingId.toString(), assignedTo: targetStaffId, assignedToName: assignedLabel, assignedToUserId: resolvedStaffUserId, assignedToRole: resolvedStaffRole }),
      triggeredBy: current.userId,
    });

    return null;
  },
});

export const acceptBooking = mutation({
  args: { bookingId: v.id("bookings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const booking = await ctx.db.get(args.bookingId);
    if (!booking || !canAccessBooking(current, booking)) throw new Error("Booking not found");

    const customerRecipientId = booking.userId;
    const workspaceOwnerRecipientId = booking.ownerUserId && booking.ownerUserId !== booking.userId ? booking.ownerUserId : undefined;
    const staffName = current.user?.name ?? current.identity.name ?? "Service Advisor";
    const now = Date.now();
    const history = booking.statusHistory ?? [];

    await ctx.db.patch(args.bookingId, {
      assignedTo: current.userId,
      assignedToName: staffName,
      status: "confirmed",
      acknowledgedAt: booking.acknowledgedAt ?? now,
      statusHistory: [...history, {
        status: "confirmed",
        timestamp: now,
        updatedBy: current.userId,
        updatedByName: staffName,
        note: "Booking accepted and confirmed",
      }],
    });

    await ctx.db.insert("notifications", {
      userId: customerRecipientId,
      type: "booking_confirmed",
      title: "Booking Confirmed!",
      message: `Your ${booking.serviceType} booking for ${booking.date} at ${booking.timeSlot} has been confirmed by ${staffName}.`,
      bookingId: args.bookingId,
      isRead: false,
    });

    await ctx.db.insert("messages", {
      bookingId: args.bookingId,
      senderId: current.userId,
      senderName: staffName,
      senderRole: "staff",
      recipientId: customerRecipientId,
      content: `Your ${booking.serviceType} booking for ${booking.date} at ${booking.timeSlot} has been confirmed by ${staffName}.`,
      isRead: false,
    });

    await ctx.scheduler.runAfter(0, internal.emails.notifyCustomerOfUpdate, {
      bookingId: args.bookingId,
      customerEmail: booking.customerEmail ?? "",
      customerName: booking.customerName ?? "Customer",
      customerId: booking.userId,
      customerPhone: booking.customerPhone ?? undefined,
      serviceType: booking.serviceType,
      date: booking.date,
      timeSlot: booking.timeSlot,
      newStatus: "confirmed",
      assignedStaffName: staffName,
    });

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: current.userId,
      type: "booking_confirmed",
      title: "Booking Confirmed",
      description: `${staffName} confirmed ${booking.customerName ?? "Customer"}'s ${booking.serviceType} for ${booking.date}`,
      customerName: booking.customerName,
      customerPhone: undefined,
      metadata: JSON.stringify({ bookingId: args.bookingId.toString() }),
      triggeredBy: current.userId,
    });

    return null;
  },
});

// Admin functions
export const listAll = query({
  args: {
    statusFilter: v.optional(v.string()),
  },
  returns: v.array(bookingReturnValidator),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || (!current.isModerator && !current.isWorkshopManager)) return [];

    if (canSeeAllWorkspace(current.user)) {
      const bookings = args.statusFilter
        ? await ctx.db
          .query("bookings")
          .withIndex("by_status", (q: any) => q.eq("status", args.statusFilter!))
          .order("desc")
          .collect()
        : await ctx.db.query("bookings").order("desc").collect();
      return bookings.map(mapBooking);
    }

    const bookings = args.statusFilter
      ? await ctx.db.query("bookings").withIndex("by_status", (q: any) => q.eq("status", args.statusFilter!)).order("desc").collect()
      : await ctx.db.query("bookings").withIndex("by_ownerUserId", (q: any) => q.eq("ownerUserId", current.userId)).order("desc").collect();

    return bookings
      .filter((booking: any) => canAccessDepartment(current.user, booking.department ?? "service"))
      .filter((booking: any) => String(booking.ownerUserId ?? booking.ownerId ?? booking.owner_id ?? booking.userId ?? "") === current.userId || String(booking.assignedToUserId ?? "") === current.userId || String(booking.assignedTo ?? "") === current.userId)
      .map(mapBooking);
  },
});

export const updateStatus = mutation({
  args: {
    bookingId: v.id("bookings"),
    status: v.string(),
    assignedTo: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    assignedDriverId: v.optional(v.string()),
    assignedDriverName: v.optional(v.string()),
    pickupRequested: v.optional(v.boolean()),
    pickupLocation: v.optional(v.string()),
    pickupTime: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const booking = await ctx.db.get(args.bookingId);
    if (!booking || !canAccessBooking(current, booking)) throw new Error("Booking not found");

    const customerRecipientId = booking.userId;
    const workspaceOwnerRecipientId = booking.ownerUserId && booking.ownerUserId !== booking.userId ? booking.ownerUserId : undefined;
    const staffName = args.assignedToName ?? current.user?.name ?? current.identity.name ?? "Service Team";
    const now = Date.now();
    const history = booking.statusHistory ?? [];

    const update: any = {
      status: args.status,
      statusHistory: [...history, {
        status: args.status,
        timestamp: now,
        updatedBy: current.userId,
        updatedByName: staffName,
        note: `Status updated to ${args.status}`,
      }],
    };
    if (args.assignedTo !== undefined) update.assignedTo = args.assignedTo;
    if (args.assignedToName !== undefined) update.assignedToName = args.assignedToName;
    if (args.assignedTo !== undefined) {
      update.assignedToUserId = args.assignedTo;
      const assignedUser = await safeDbGet(ctx, args.assignedTo);
      if (assignedUser) {
        update.assignedToRole = assignedUser.staffRole ?? assignedUser.role;
        update.assignedToName = args.assignedToName ?? assignedUser.name ?? assignedUser.email ?? args.assignedToName;
      }
    }
    if (args.assignedDriverId !== undefined) update.assignedDriverId = args.assignedDriverId;
    if (args.assignedDriverName !== undefined) update.assignedDriverName = args.assignedDriverName;
    if (args.pickupRequested !== undefined) update.pickupRequested = args.pickupRequested;
    if (args.pickupLocation !== undefined) update.pickupLocation = args.pickupLocation;
    if (args.pickupTime !== undefined) update.pickupTime = args.pickupTime;
    await ctx.db.patch(args.bookingId, update);

    const pickupSummary = booking.pickupRequested || args.pickupRequested
      ? ` Courtesy pickup${args.pickupLocation || booking.pickupLocation ? ` from ${args.pickupLocation || booking.pickupLocation}` : ''}${args.pickupTime || booking.pickupTime ? ` at ${args.pickupTime || booking.pickupTime}` : ''}.`
      : '';
    const driverSummary = args.assignedDriverName || booking.assignedDriverName
      ? ` Driver assigned: ${args.assignedDriverName || booking.assignedDriverName}.`
      : '';

    const customerMessage = `Your ${booking.serviceType} booking for ${booking.date} has been updated to "${args.status}" by ${staffName}.${pickupSummary}${driverSummary}`;

    await ctx.db.insert("notifications", {
      userId: customerRecipientId,
      type: "booking_updated",
      title: `Booking ${args.status.charAt(0).toUpperCase() + args.status.slice(1)}`,
      message: customerMessage,
      bookingId: args.bookingId,
      isRead: false,
    });
    if (workspaceOwnerRecipientId) {
      await ctx.db.insert("notifications", {
        userId: workspaceOwnerRecipientId,
        type: "booking_updated",
        title: `Booking ${args.status.charAt(0).toUpperCase() + args.status.slice(1)}`,
        message: `${booking.customerName ?? "Customer"}'s ${booking.serviceType} booking was updated to "${args.status}" by ${staffName}.${pickupSummary}${driverSummary}`,
        bookingId: args.bookingId,
        isRead: false,
      });
    }

    await ctx.db.insert("messages", {
      bookingId: args.bookingId,
      senderId: current.userId,
      senderName: staffName,
      senderRole: "staff",
      recipientId: customerRecipientId,
      content: customerMessage,
      isRead: false,
    });

    if (args.status === "completed") {
      await recordServiceCommission(ctx, booking, current, staffName);
      await creditServiceReferralWallet(ctx, booking);
      const serviceRecipients = await getServiceNotificationRecipients(ctx, booking.dealershipId);
      for (const recipient of serviceRecipients) {
        await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
          userId: recipient.userId,
          title: `Service Booking Completed: ${booking.serviceType}`,
          message: `${booking.customerName ?? "Customer"}'s ${booking.serviceType} booking for ${booking.date} has been completed.`,
        });
      }
    }

    const customerEmail = booking.customerEmail || "";
    if (customerEmail || booking.userId) {
      await ctx.scheduler.runAfter(0, internal.emails.notifyCustomerOfUpdate, {
        bookingId: args.bookingId,
        customerEmail,
        customerName: booking.customerName ?? "Customer",
        customerId: booking.userId,
        customerPhone: booking.customerPhone ?? undefined,
        serviceType: booking.serviceType,
        date: booking.date,
        timeSlot: booking.timeSlot,
        newStatus: args.status,
        assignedStaffName: staffName,
      });
    }

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: current.userId,
      type: args.status === "completed" ? "booking_completed" : "booking_updated",
      title: `Booking ${args.status.charAt(0).toUpperCase() + args.status.slice(1)}`,
      description: `${booking.customerName ?? "Customer"}'s ${booking.serviceType} updated to "${args.status}" by ${staffName}${pickupSummary}${driverSummary}`,
      customerName: booking.customerName,
      customerPhone: undefined,
      metadata: JSON.stringify({ bookingId: args.bookingId.toString(), status: args.status, pickupRequested: args.pickupRequested ?? booking.pickupRequested, pickupLocation: args.pickupLocation ?? booking.pickupLocation, pickupTime: args.pickupTime ?? booking.pickupTime, assignedDriverId: args.assignedDriverId ?? booking.assignedDriverId, assignedDriverName: args.assignedDriverName ?? booking.assignedDriverName }),
      triggeredBy: current.userId,
    });

    return null;
  },
});

export const listCalendarEntries = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("calendarEntries"),
    _creationTime: v.number(),
    userId: v.string(),
    bookingId: v.optional(v.id("bookings")),
    title: v.string(),
    details: v.optional(v.string()),
    date: v.string(),
    time: v.optional(v.string()),
    endDate: v.optional(v.string()),
    allDay: v.boolean(),
    source: v.string(),
    reminderAt: v.optional(v.number()),
    googleCalendarUrl: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    isCompleted: v.optional(v.boolean()),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const entries = await ctx.db
      .query("calendarEntries")
      .withIndex("by_userId", (q: any) => q.eq("userId", current.userId))
      .order("desc")
      .collect();

    return dedupeCalendarEntries(entries);
  },
});

export const addCalendarEntry = mutation({
  args: {
    title: v.string(),
    details: v.optional(v.string()),
    date: v.string(),
    time: v.optional(v.string()),
    allDay: v.optional(v.boolean()),
    source: v.optional(v.string()),
    reminderAt: v.optional(v.number()),
  },
  returns: v.id("calendarEntries"),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    // Validate date format (YYYY-MM-DD)
    if (!args.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      throw new Error("Invalid date format. Use YYYY-MM-DD");
    }

    // Validate time format if provided (HH:MM)
    if (args.time && !args.time.match(/^\d{2}:\d{2}$/)) {
      throw new Error("Invalid time format. Use HH:MM");
    }

    // Validate date actually exists
    const dateObj = new Date(`${args.date}T00:00:00Z`);
    if (isNaN(dateObj.getTime())) {
      throw new Error("Invalid date");
    }

    const recent = await ctx.db
      .query("calendarEntries")
      .withIndex("by_userId_date", (q: any) => q.eq("userId", current.userId).eq("date", args.date))
      .order("desc")
      .take(25);

    const normalizedArgs = {
      title: args.title,
      details: args.details,
      date: args.date,
      time: args.time,
      allDay: args.allDay ?? false,
    };

    const duplicate = recent.find((entry: any) =>
      sameCalendarEntry(entry, normalizedArgs)
    );
    if (duplicate) return duplicate._id;

    const googleCalendarUrl = buildCalendarUrl(args.title, args.details ?? "", args.date, args.time);
    const entryId = await ctx.db.insert("calendarEntries", {
      userId: current.userId,
      title: args.title,
      details: args.details,
      date: args.date,
      time: args.time,
      endDate: undefined,
      allDay: args.allDay ?? false,
      source: args.source ?? "manual",
      reminderAt: args.reminderAt,
      googleCalendarUrl,
      createdBy: current.userId,
      isCompleted: false,
    });

    await ctx.db.insert("notifications", {
      userId: current.userId,
      type: "calendar_entry_created",
      title: "Note Saved",
      message: `${args.title}${args.details ? ` � ${args.details}` : ""}`,
      bookingId: undefined,
      isRead: false,
    });

    const staffUsers = await ctx.db.query("users").collect();
    for (const staff of staffUsers) {
      if (staff.role === "staff") {
        await ctx.db.insert("notifications", {
          userId: String(staff._id),
          type: "calendar_entry_created",
          title: "New Calendar Note",
          message: `${current.user?.name ?? current.identity.name ?? current.identity.email ?? "Customer"}: ${args.title}${args.details ? ` � ${args.details}` : ""}`,
          bookingId: undefined,
          isRead: false,
        });
      }
    }

    await ctx.db.insert("activityLog", {
      ownerUserId: current.userId,
      type: "calendar_entry_created",
      title: "Calendar Note Saved",
      description: `${args.title}${args.details ? ` - ${args.details}` : ""}`,
      customerName: current.user?.name ?? current.identity.name ?? current.identity.email ?? "Customer",
      customerPhone: undefined,
      metadata: JSON.stringify({ calendarEntryId: entryId.toString(), source: args.source ?? "manual", reminderAt: args.reminderAt }),
      triggeredBy: current.userId,
      isNotified: false,
    });

    if (args.reminderAt && args.reminderAt > Date.now()) {
      await ctx.scheduler.runAfter(args.reminderAt - Date.now(), internal.emails.sendCalendarReminder, {
        userId: current.userId,
        title: args.title,
        details: args.details,
        date: args.date,
        time: args.time,
        calendarEntryId: entryId,
      });
    }

    return entryId;
  },
});

export const completeCalendarEntry = mutation({
  args: { entryId: v.id("calendarEntries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const entry = await ctx.db.get(args.entryId);
    if (!entry || (!current.isModerator && entry.userId !== current.userId)) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.entryId, { isCompleted: true });
    return null;
  },
});

export const confirmBooking = mutation({
  args: { bookingId: v.id("bookings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const booking = await ctx.db.get(args.bookingId);
    if (!booking || !canAccessBooking(current, booking)) throw new Error("Booking not found");

    const customerRecipientId = booking.userId;
    const workspaceOwnerRecipientId = booking.ownerUserId && booking.ownerUserId !== booking.userId ? booking.ownerUserId : undefined;
    const staffName = args.assignedToName ?? current.user?.name ?? current.identity.name ?? "Service Advisor";
    const now = Date.now();
    const history = booking.statusHistory ?? [];

    await ctx.db.patch(args.bookingId, {
      assignedTo: current.userId,
      assignedToName: staffName,
      status: "confirmed",
      acknowledgedAt: booking.acknowledgedAt ?? now,
      statusHistory: [...history, {
        status: "confirmed",
        timestamp: now,
        updatedBy: current.userId,
        updatedByName: staffName,
        note: "Booking accepted and confirmed",
      }],
    });

    await ctx.db.insert("notifications", {
      userId: customerRecipientId,
      type: "booking_confirmed",
      title: "Booking Confirmed!",
      message: `Your ${booking.serviceType} booking for ${booking.date} at ${booking.timeSlot} has been confirmed by ${staffName}.`,
      bookingId: args.bookingId,
      isRead: false,
    });

    await ctx.scheduler.runAfter(0, internal.emails.notifyCustomerOfUpdate, {
      bookingId: args.bookingId,
      customerEmail: booking.customerEmail ?? "",
      customerName: booking.customerName ?? "Customer",
      customerId: booking.userId,
      serviceType: booking.serviceType,
      date: booking.date,
      timeSlot: booking.timeSlot,
      newStatus: "confirmed",
      assignedStaffName: staffName,
    });

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: current.userId,
      type: "booking_confirmed",
      title: "Booking Confirmed",
      description: `${staffName} confirmed ${booking.customerName ?? "Customer"}'s ${booking.serviceType} for ${booking.date}`,
      customerName: booking.customerName,
      customerPhone: undefined,
      metadata: JSON.stringify({ bookingId: args.bookingId.toString() }),
      triggeredBy: current.userId,
    });

    return null;
  },
});

export const update = mutation({
  args: {
    bookingId: v.id('bookings'),
    status: v.union(v.literal('confirmed'), v.literal('rejected'), v.literal('cancelled')),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error('Booking not found');

    // Update booking
    await ctx.db.patch(args.bookingId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    // IF CONFIRMED, SEND CUSTOMER NOTIFICATIONS
    if (args.status === 'confirmed') {
      try {
        const customer = await ctx.db.get(booking.customerId);
        const profile = await ctx.db.get(booking.customerProfileId);
        const vehicle = await ctx.db.get(booking.vehicleId);

        // Send SMS to customer
        if (profile?.phone) {
          await sendSMSToCustomer(
            profile.phone,
            `Your booking for ${vehicle?.make} ${vehicle?.model} on ${booking.date} has been confirmed!`
          );
        }

        // Send WhatsApp to customer
        if (profile?.whatsappNumber) {
          await sendWhatsAppToCustomer(
            profile.whatsappNumber,
            `Your booking for ${vehicle?.make} ${vehicle?.model} on ${booking.date} has been confirmed! We'll see you soon.`
          );
        }

        // Send email to customer
        if (customer?.email) {
          await sendEmailToCustomer(
            customer.email,
            `Booking Confirmed`,
            `Your booking for ${vehicle?.make} ${vehicle?.model} on ${booking.date} is confirmed. Thank you!`
          );
        }

        // Create in-app notification for customer
        await ctx.db.insert('notifications', {
          recipientId: booking.customerId,
          type: 'booking_confirmed',
          title: 'Booking Confirmed',
          message: `Your ${vehicle?.make} ${vehicle?.model} booking is confirmed for ${booking.date}`,
          link: `/booking/${args.bookingId}`,
          createdAt: Date.now(),
        });
      } catch (error) {
        console.error('Failed to send customer notifications:', error);
      }
    }

    return args.bookingId;
  },
});

// NEW: Get all bookings for today (for staff) - includes completed
export const listTodaysBookings = query({
  args: {},
  returns: v.array(bookingReturnValidator),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const today = new Date().toISOString().split("T")[0];
    
    let bookings = await ctx.db
      .query("bookings")
      .order("desc")
      .collect();

    // Filter to today's bookings
    bookings = bookings.filter((b: any) => b.date === today);

    // Apply access control
    if (canSeeAllWorkspace(current.user)) {
      return bookings.map(mapBooking);
    }

    if (isServiceStaff(current.user)) {
      return bookings.map(mapBooking);
    }

    return bookings
      .filter((b: any) => 
        b.userId === current.userId || 
        b.ownerUserId === current.userId || 
        b.assignedToUserId === current.userId ||
        b.assignedTo === current.userId
      )
      .map(mapBooking);
  },
});

// NEW: Get all bookings ever for a customer (nothing hidden)
export const listAllCustomerBookings = query({
  args: {},
  returns: v.array(bookingReturnValidator),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_userId", (q: any) => q.eq("userId", current.userId))
      .order("desc")
      .collect();

    return bookings.map(mapBooking);
  },
});

// NEW: Staff view - all bookings including completed (NOTHING FILTERED OUT)
export const listAllStaffBookings = query({
  args: {},
  returns: v.array(bookingReturnValidator),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    if (canSeeAllWorkspace(current.user)) {
      const bookings = await ctx.db.query("bookings").order("desc").collect();
      return bookings.map(mapBooking);
    }

    const bookings = await ctx.db.query("bookings").order("desc").collect();

    if (isServiceStaff(current.user)) {
      return bookings
        .filter((booking: any) => canAccessDepartment(current.user, booking.department ?? "service"))
        .map(mapBooking);
    }

    return bookings
      .filter((b: any) =>
        b.ownerUserId === current.userId ||
        b.assignedToUserId === current.userId ||
        b.assignedTo === current.userId)
      .map(mapBooking);
  },
});

export const getSalesExecutiveWalletSummary = query({
  args: {},
  returns: v.union(v.null(), v.object({
    userId: v.string(),
    balance: v.number(),
    totalEarned: v.number(),
    totalWithdrawn: v.number(),
    transactions: v.array(v.object({
      _id: v.id("salesExecutiveWalletTransactions"),
      _creationTime: v.number(),
      userId: v.string(),
      bookingId: v.id("bookings"),
      transactionType: v.string(),
      amount: v.number(),
      description: v.string(),
      createdAt: v.number(),
    })),
    completedBookings: v.array(bookingReturnValidator),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current?.user) return null;
    const role = String(current.user.staffRole ?? current.user.role ?? "").trim().toLowerCase();
    if (!["sales_executive", "sales_manager", "sales"].includes(role) && !canSeeAllWorkspace(current.user)) return null;

    const wallet = await ctx.db
      .query("salesExecutiveWallets")
      .withIndex("by_userId", (q: any) => q.eq("userId", current.userId))
      .first();

    const transactions = await ctx.db
      .query("salesExecutiveWalletTransactions")
      .withIndex("by_userId", (q: any) => q.eq("userId", current.userId))
      .order("desc")
      .collect();

    const completedBookings = await ctx.db
      .query("bookings")
      .withIndex("by_ownerUserId", (q: any) => q.eq("ownerUserId", current.userId))
      .order("desc")
      .collect();

    return {
      userId: current.userId,
      balance: wallet?.balance ?? 0,
      totalEarned: wallet?.totalEarned ?? 0,
      totalWithdrawn: wallet?.totalWithdrawn ?? 0,
      transactions,
      completedBookings: completedBookings
        .filter((booking: any) => booking.status === "completed" && Number(booking.walletCreditAmount ?? 50) > 0)
        .map(mapBooking),
    };
  },
});
