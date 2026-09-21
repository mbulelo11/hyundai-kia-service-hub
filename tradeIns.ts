import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const tradeInReturn = v.object({
  _id: v.id("tradeIns"),
  _creationTime: v.number(),
  ownerId: v.optional(v.string()),
  ownerUserId: v.optional(v.string()),
  userId: v.string(),
  customerProfileId: v.optional(v.string()),
  firstName: v.string(),
  surname: v.string(),
  idNumber: v.string(),
  contactDetails: v.string(),
  vehicleName: v.string(),
  yearModel: v.string(),
  colour: v.string(),
  spareKey: v.string(),
  serviceHistory: v.string(),
  reg: v.string(),
  mileage: v.string(),
  vin: v.string(),
  engineNumber: v.string(),
  underFinance: v.string(),
  financedByBank: v.optional(v.string()),
  expectedValue: v.string(),
  purchaseIntent: v.string(),
  imageUrls: v.array(v.string()),
  imageNames: v.array(v.string()),
  status: v.string(),
  appointmentAt: v.optional(v.number()),
  finalOfferAmount: v.optional(v.number()),
  staffNotes: v.optional(v.string()),
  assignedToUserId: v.optional(v.string()),
  assignedToName: v.optional(v.string()),
  financeApplicationId: v.optional(v.id("financeApplications")),
  dealershipId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const tradeInInboxReturn = v.object({
  _id: v.id("tradeIns"),
  _creationTime: v.number(),
  firstName: v.string(),
  surname: v.string(),
  idNumber: v.string(),
  contactDetails: v.string(),
  vehicleName: v.string(),
  yearModel: v.string(),
  colour: v.string(),
  spareKey: v.string(),
  serviceHistory: v.string(),
  reg: v.string(),
  mileage: v.string(),
  vin: v.string(),
  engineNumber: v.string(),
  underFinance: v.string(),
  financedByBank: v.optional(v.string()),
  expectedValue: v.string(),
  purchaseIntent: v.string(),
  imageUrls: v.array(v.string()),
  imageNames: v.array(v.string()),
  status: v.string(),
  appointmentAt: v.optional(v.number()),
  finalOfferAmount: v.optional(v.number()),
  staffNotes: v.optional(v.string()),
  assignedToUserId: v.optional(v.string()),
  assignedToName: v.optional(v.string()),
  financeApplicationId: v.optional(v.id("financeApplications")),
  customerProfileId: v.optional(v.string()),
  dealershipId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function normalizeRole(value: any) {
  return String(value ?? '').trim().toLowerCase();
}

function canSeeTradeIns(current: any) {
  const role = normalizeRole(current?.role);
  const staffRole = normalizeRole(current?.staffRole);
  const department = normalizeRole(current?.department);
  return Boolean(
    role === 'staff' ||
    role === 'admin' ||
    role === 'dp' ||
    staffRole === 'dealership_principal' ||
    staffRole === 'sales' ||
    staffRole === 'sales_executive' ||
    staffRole === 'sales_manager' ||
    staffRole === 'service_advisor' ||
    staffRole === 'parts_manager' ||
    department === 'sales' ||
    department === 'service' ||
    department === 'management' ||
    Boolean(current?.email === 'vincentmm@hyundai.co.za')
  );
}

function mapTradeInInboxRow(tradeIn: any) {
  return {
    _id: tradeIn._id,
    _creationTime: tradeIn._creationTime,
    firstName: tradeIn.firstName,
    surname: tradeIn.surname,
    idNumber: tradeIn.idNumber,
    contactDetails: tradeIn.contactDetails,
    vehicleName: tradeIn.vehicleName,
    yearModel: tradeIn.yearModel,
    colour: tradeIn.colour,
    spareKey: tradeIn.spareKey,
    serviceHistory: tradeIn.serviceHistory,
    reg: tradeIn.reg,
    mileage: tradeIn.mileage,
    vin: tradeIn.vin,
    engineNumber: tradeIn.engineNumber,
    underFinance: tradeIn.underFinance,
    financedByBank: tradeIn.financedByBank,
    expectedValue: tradeIn.expectedValue,
    purchaseIntent: tradeIn.purchaseIntent,
    imageUrls: tradeIn.imageUrls ?? [],
    imageNames: tradeIn.imageNames ?? [],
    status: tradeIn.status,
    appointmentAt: tradeIn.appointmentAt,
    finalOfferAmount: tradeIn.finalOfferAmount,
    staffNotes: tradeIn.staffNotes,
    assignedToUserId: tradeIn.assignedToUserId,
    assignedToName: tradeIn.assignedToName,
    financeApplicationId: tradeIn.financeApplicationId,
    customerProfileId: tradeIn.customerProfileId,
    dealershipId: tradeIn.dealershipId,
    createdAt: tradeIn.createdAt,
    updatedAt: tradeIn.updatedAt,
  };
}

async function getCurrentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Not authenticated');

  const user = await ctx.db
    .query('users')
    .withIndex('email', (q: any) => q.eq('email', identity.email ?? ''))
    .first();

  if (user) {
    return {
      userId: String(user._id),
      name: String(user.name ?? identity.name ?? identity.email ?? 'User'),
      email: String(user.email ?? identity.email ?? ''),
      role: normalizeRole(user.role ?? user.staffRole),
      department: String(user.department ?? '').toLowerCase(),
      dealershipId: user.dealershipId,
    };
  }

  return {
    userId: String(identity.subject),
    name: String(identity.name ?? identity.email ?? 'User'),
    email: String(identity.email ?? ''),
    role: 'customer',
    department: '',
    dealershipId: undefined,
  };
}

export const listMine = query({
  args: {},
  returns: v.array(tradeInReturn),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    const tradeIns = await ctx.db
      .query('tradeIns')
      .withIndex('by_userId', (q: any) => q.eq('userId', current.userId))
      .order('desc')
      .take(100);
    return tradeIns as any;
  },
});

export const listAll = query({
  args: {},
  returns: v.array(tradeInReturn),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!canSeeTradeIns(current)) return [];

    const tradeIns = current.dealershipId
      ? await ctx.db
          .query('tradeIns')
          .withIndex('by_dealershipId', (q: any) => q.eq('dealershipId', current.dealershipId))
          .order('desc')
          .take(200)
      : await ctx.db
          .query('tradeIns')
          .withIndex('by_createdAt', (q: any) => q.gte('createdAt', 0))
          .order('desc')
          .take(200);
    return tradeIns as any;
  },
});

export const listStaffInbox = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(tradeInInboxReturn),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!canSeeTradeIns(current)) return [];

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    const tradeIns = current.dealershipId
      ? await ctx.db
          .query('tradeIns')
          .withIndex('by_dealershipId', (q: any) => q.eq('dealershipId', current.dealershipId))
          .order('desc')
          .take(limit)
      : await ctx.db
          .query('tradeIns')
          .withIndex('by_createdAt', (q: any) => q.gte('createdAt', 0))
          .order('desc')
          .take(limit);
    return tradeIns.map(mapTradeInInboxRow) as any;
  },
});

export const create = mutation({
  args: {
    customerProfileId: v.optional(v.string()),
    firstName: v.string(),
    surname: v.string(),
    idNumber: v.string(),
    contactDetails: v.string(),
    vehicleName: v.string(),
    yearModel: v.string(),
    colour: v.string(),
    spareKey: v.string(),
    serviceHistory: v.string(),
    reg: v.string(),
    mileage: v.string(),
    vin: v.string(),
    engineNumber: v.string(),
    underFinance: v.string(),
    financedByBank: v.optional(v.string()),
    expectedValue: v.string(),
    purchaseIntent: v.string(),
    imageUrls: v.array(v.string()),
    imageNames: v.array(v.string()),
  },
  returns: v.object({ tradeInId: v.id('tradeIns') }),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const now = Date.now();
    const customerProfile = args.customerProfileId ? await ctx.db.get(args.customerProfileId as any) : null;
    const dealershipId = String(customerProfile?.dealershipId ?? current.dealershipId ?? '');
    const tradeInId = await ctx.db.insert('tradeIns', {
      ownerId: current.userId,
      ownerUserId: current.userId,
      userId: current.userId,
      customerProfileId: args.customerProfileId,
      firstName: args.firstName,
      surname: args.surname,
      idNumber: args.idNumber,
      contactDetails: args.contactDetails,
      vehicleName: args.vehicleName,
      yearModel: args.yearModel,
      colour: args.colour,
      spareKey: args.spareKey,
      serviceHistory: args.serviceHistory,
      reg: args.reg,
      mileage: args.mileage,
      vin: args.vin,
      engineNumber: args.engineNumber,
      underFinance: args.underFinance,
      financedByBank: args.financedByBank,
      expectedValue: args.expectedValue,
      purchaseIntent: args.purchaseIntent,
      imageUrls: args.imageUrls,
      imageNames: args.imageNames,
      status: 'submitted',
      dealershipId: dealershipId || undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('activityLog', {
      ownerUserId: current.userId,
      type: 'trade_in_submitted',
      title: 'Trade-in submitted',
      description: `${args.firstName} ${args.surname} submitted ${args.vehicleName} for trade-in review.`,
      metadata: JSON.stringify({ tradeInId: String(tradeInId), purchaseIntent: args.purchaseIntent }),
      isNotified: false,
      triggeredBy: current.userId,
    });

    await notifyTradeInDepartment(ctx, { _id: tradeInId, ...args });

    return { tradeInId };
  },
});

export const update = mutation({
  args: {
    tradeInId: v.id('tradeIns'),
    status: v.optional(v.string()),
    appointmentAt: v.optional(v.number()),
    finalOfferAmount: v.optional(v.number()),
    staffNotes: v.optional(v.string()),
    assignedToUserId: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    financeApplicationId: v.optional(v.id('financeApplications')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const role = normalizeRole(current.role);
    const canSeeAll = canSeeTradeIns(current);
    if (!canSeeAll) throw new Error('Not authorized');

    const existing = await ctx.db.get(args.tradeInId);
    if (!existing) throw new Error('Trade-in not found');

    const resolvedStatus = args.status ?? (typeof args.finalOfferAmount === 'number' ? 'valued' : existing.status);

    await ctx.db.patch(args.tradeInId, {
      status: resolvedStatus,
      appointmentAt: args.appointmentAt ?? existing.appointmentAt,
      finalOfferAmount: args.finalOfferAmount ?? existing.finalOfferAmount,
      staffNotes: args.staffNotes ?? existing.staffNotes,
      assignedToUserId: args.assignedToUserId ?? existing.assignedToUserId,
      assignedToName: args.assignedToName ?? existing.assignedToName,
      financeApplicationId: args.financeApplicationId ?? existing.financeApplicationId,
      updatedAt: Date.now(),
    });

    await ctx.db.insert('activityLog', {
      ownerUserId: String(existing.userId),
      type: 'trade_in_updated',
      title: 'Trade-in updated',
      description: 'Your trade-in for ' + existing.vehicleName + ' was updated to ' + resolvedStatus + '.',
      metadata: JSON.stringify({ tradeInId: String(args.tradeInId), status: resolvedStatus, finalOfferAmount: args.finalOfferAmount ?? existing.finalOfferAmount }),
      isNotified: false,
      triggeredBy: current.userId,
    });

    if (existing.userId) {
      const offer = typeof (args.finalOfferAmount ?? existing.finalOfferAmount) === 'number' ? Number(args.finalOfferAmount ?? existing.finalOfferAmount) : null;
      const message = offer !== null
        ? 'Staff replied with a trade-in value of R' + offer.toLocaleString('en-ZA') + (args.staffNotes ? ': ' + args.staffNotes : '')
        : 'Your trade-in for ' + existing.vehicleName + ' was updated to ' + resolvedStatus + '.';

      await ctx.db.insert('notifications', {
        userId: String(existing.userId),
        type: offer !== null ? 'trade_in_valued' : 'trade_in_updated',
        title: offer !== null ? 'Trade-in value ready' : 'Trade-in update',
        message,
        targetRoute: 'TradeIn',
        targetId: String(args.tradeInId),
        isRead: false,
      });
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
        userId: String(existing.userId),
        title: offer !== null ? 'Trade-in value ready' : 'Trade-in update',
        message,
      });
    }

    return null;
  },
});

export const emailToDepartment = mutation({
  args: {
    tradeInId: v.id('tradeIns'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!canSeeTradeIns(current)) throw new Error('Not authorized');

    const tradeIn = await ctx.db.get(args.tradeInId);
    if (!tradeIn) throw new Error('Trade-in not found');

    await notifyTradeInDepartment(ctx, tradeIn as any);
    return null;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error('Not authenticated');
    return await ctx.storage.generateUploadUrl();
  },
});

export const uploadAndResolve = mutation({
  args: {
    storageId: v.id('_storage'),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error('Not authenticated');
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error('Could not resolve storage URL');
    return url;
  },
});

async function notifyTradeInDepartment(ctx: any, tradeIn: any) {
  const dealershipId = tradeIn.dealershipId ?? null;
  const staffMembers = dealershipId
    ? await ctx.db.query('staff').withIndex('by_dealershipId', (q: any) => q.eq('dealershipId', dealershipId)).collect()
    : await ctx.db.query('staff').collect();

  const recipients = staffMembers.filter((staff: any) => {
    if (!staff.isActive) return false;
    const role = normalizeRole(staff.role);
    const department = normalizeRole(staff.dealershipBrand ?? staff.dealershipName ?? staff.dealershipLocation);
    return (
      role === 'dealership_principal' ||
      role === 'sales' ||
      role === 'sales_executive' ||
      role === 'sales_manager' ||
      role === 'moderator' ||
      role === 'admin' ||
      department.includes('sales') ||
      department.includes('management')
    );
  });

  const subject = `New trade-in submission: ${tradeIn.firstName} ${tradeIn.surname}`;
  const message = [
    `Trade-in vehicle: ${tradeIn.vehicleName}`,
    `Owner: ${tradeIn.firstName} ${tradeIn.surname}`,
    `Contact: ${tradeIn.contactDetails}`,
    `Expected value: ${tradeIn.expectedValue}`,
    `Intent: ${tradeIn.purchaseIntent}`,
    'Open the Trade-In inbox to review appointment and offer details.',
  ].join('\n');

  for (const staff of recipients) {
    const userId = String(staff.userId ?? staff._id);
    await ctx.db.insert('notifications', {
      userId,
      type: 'trade_in_submitted',
      title: 'New trade-in submitted',
      message: message.slice(0, 180),
      customerName: `${tradeIn.firstName} ${tradeIn.surname}`,
      customerPhone: tradeIn.contactDetails,
      targetRoute: 'TradeIn',
      targetId: String(tradeIn._id),
      isRead: false,
    });
    await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
      userId,
      title: subject,
      message,
    });
    await ctx.scheduler.runAfter(0, internal.emails.sendTradeInSubmissionEmail, {
      userId,
      firstName: tradeIn.firstName,
      surname: tradeIn.surname,
      contactDetails: tradeIn.contactDetails,
      vehicleName: tradeIn.vehicleName,
      yearModel: tradeIn.yearModel,
      colour: tradeIn.colour,
      reg: tradeIn.reg,
      mileage: tradeIn.mileage,
      vin: tradeIn.vin,
      engineNumber: tradeIn.engineNumber,
      underFinance: tradeIn.underFinance,
      financedByBank: tradeIn.financedByBank,
      expectedValue: tradeIn.expectedValue,
      purchaseIntent: tradeIn.purchaseIntent,
      status: 'submitted',
      imageUrls: tradeIn.imageUrls ?? [],
      imageNames: tradeIn.imageNames ?? [],
    });
  }
}
