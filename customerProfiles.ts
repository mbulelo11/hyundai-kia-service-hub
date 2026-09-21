import { query, mutation, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { isAdminUser, canBypassOwnerIsolation, canAccessOwnRecord, getUserDepartment, canAccessDepartment } from "./auth";

async function safeDbGet(ctx: any, id: string | undefined | null) {
  if (!id) return null;
  try {
    return await ctx.db.get(id as any);
  } catch {
    return null;
  }
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseCustomerBackupCsv(csvText: string) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const rows = [] as Array<{
    firstName: string;
    surname: string;
    phone: string;
    homePhone?: string;
    workPhone?: string;
    contactEmail?: string;
    whatsappNumber?: string;
    companyName?: string;
    companyVehicles?: string;
    vehicleDescription: string;
    registrationDate?: string;
    tradeInInterest?: string;
    applicationNotes?: string;
    referralNotes?: string;
    notesSummary?: string;
  }>;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length < 3) continue;

    const [vehicleDescription = "", registrationDate = "", firstName = "", surname = "", phone = "", homePhone = "", workPhone = "", contactEmail = "", whatsappNumber = "", companyName = "", companyVehicles = "", applicationNotes = "", tradeInInterest = "", referralNotes = "", notesSummary = ""] = cells;
    const cleanFirstName = firstName.trim();
    const cleanSurname = surname.trim();
    const cleanPhone = phone.replace(/\s+/g, "").trim();

    if (!cleanFirstName || !cleanSurname || !cleanPhone) continue;

    rows.push({
      firstName: cleanFirstName,
      surname: cleanSurname,
      phone: cleanPhone,
      homePhone: homePhone.replace(/\s+/g, "").trim() || undefined,
      workPhone: workPhone.replace(/\s+/g, "").trim() || undefined,
      contactEmail: contactEmail.replace(/\s+/g, "").trim() || undefined,
      whatsappNumber: whatsappNumber.replace(/\s+/g, "").trim() || undefined,
      companyName: companyName.replace(/\s+/g, "").trim() || undefined,
      companyVehicles: companyVehicles.replace(/\s+/g, "").trim() || undefined,
      vehicleDescription: vehicleDescription.trim() || "Unknown",
      registrationDate: registrationDate.trim() || undefined,
      tradeInInterest: tradeInInterest.trim() || undefined,
      applicationNotes: applicationNotes.trim() || undefined,
      referralNotes: referralNotes.trim() || undefined,
      notesSummary: notesSummary.trim() || undefined,
    });
  }

  return rows;
}

async function getCurrentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const authUser = await findUserByIdentity(ctx, identity);
  if (!authUser) {
    return {
      identity,
      userId: String(identity.subject),
      user: null,
      scopeIds: Array.from(new Set([String(identity.subject)])),
    };
  }

  return {
    identity,
    userId: String(authUser._id),
    user: authUser,
    scopeIds: Array.from(new Set([String(authUser._id), String(identity.subject)])),
  };
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

function isStaffLikeUser(user: any) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  return Boolean(user?.role === "staff" || user?.staffRole || isAdminUser(user) || email === "vincentmm@hyundai.co.za");
}

function canAccessAllCustomerProfiles(user: any) {
  return Boolean(canBypassOwnerIsolation(user));
}

function canSeeAll(user: any) {
  const email = String(user?.email ?? '').trim().toLowerCase();
  return Boolean(email === 'vincentmm@hyundai.co.za' || user?.staffRole === 'dp');
}

function getCurrentDealershipId(current: any) {
  return String(current?.user?.dealershipId ?? "").trim() || undefined;
}

function getCurrentWorkspaceId(current: any) {
  return String(current?.user?.workspaceId ?? current?.userId ?? "").trim() || undefined;
}

function getAssignedStaffForCurrentUser(current: any) {
  if (!current?.user) return null;
  const assignedStaffUserId = String(current.user.assignedStaffUserId ?? "").trim();
  if (!assignedStaffUserId) return null;
  return {
    assignedStaffUserId,
    assignedStaffName: current.user.assignedStaffName ?? current.user.assignedStaffRole ?? undefined,
    assignedStaffRole: current.user.assignedStaffRole ?? undefined,
    assignedStaffDealershipId: current.user.assignedStaffDealershipId ?? current.user.dealershipId,
    assignedStaffDealershipName: current.user.assignedStaffDealershipName ?? current.user.dealershipName,
    assignedStaffDealershipBrand: current.user.assignedStaffDealershipBrand ?? current.user.dealershipBrand,
    assignedStaffDealershipLocation: current.user.assignedStaffDealershipLocation ?? current.user.dealershipLocation,
  };
}

function getWorkspaceScopeIds(current: any) {
  const workspaceId = getCurrentWorkspaceId(current);
  const userId = String(current?.userId ?? "").trim();
  return Array.from(new Set([workspaceId, userId].filter(Boolean)));
}

function profileMatchesWorkspace(profile: any, current: any) {
  if (canAccessAllCustomerProfiles(current?.user)) return true;
  const currentWorkspaceId = getCurrentWorkspaceId(current);
  if (!currentWorkspaceId) return false;
  return String(profile.workspaceId ?? profile.ownerUserId ?? profile.ownerId ?? profile.owner_id ?? profile.linkedUserId ?? "").trim() === currentWorkspaceId;
}

async function getDealershipIdForUserId(ctx: any, userId: string | undefined) {
  if (!userId) return undefined;
  const user = await safeDbGet(ctx, userId);
  return String(user?.dealershipId ?? "").trim() || undefined;
}

function canAccessCustomerProfileForStaff(current: any, profile: any) {
  if (!current?.user) return false;
  if (canBypassOwnerIsolation(current.user)) return true;

  const currentUserId = String(current.userId ?? "");
  return Boolean(
    String(profile.ownerUserId ?? profile.ownerId ?? profile.owner_id ?? "") === currentUserId ||
    String(profile.linkedUserId ?? "") === currentUserId
  );
}

function canMutateCustomerProfile(current: any, profile: any) {
  if (!current?.user) return false;
  if (canBypassOwnerIsolation(current.user)) return true;

  const currentUserId = String(current.userId ?? "");
  return Boolean(
    canAccessDepartment(current.user, "sales") && (
      String(profile.ownerUserId ?? profile.ownerId ?? profile.owner_id ?? "") === currentUserId ||
      String(profile.linkedUserId ?? "") === currentUserId
    )
  );
}

function canViewCustomerProfiles(current: any) {
  return Boolean(current?.user || current?.identity);
}

function mapCustomerProfile(p: any) {
  const result: any = {
    _id: p._id.toString(),
    firstName: p.firstName,
    surname: p.surname,
    fullName: p.fullName,
    phone: p.phone,
    vehicleDescription: p.vehicleDescription,
    contactEmail: p.contactEmail,
    whatsappNumber: p.whatsappNumber,
    companyName: p.companyName,
    companyVehicles: p.companyVehicles,
    profileImage: p.profileImage,
    sourceLabel: p.sourceLabel,
    isActive: p.isActive,
  };

  if (typeof p.homePhone === "string") result.homePhone = p.homePhone;
  if (typeof p.workPhone === "string") result.workPhone = p.workPhone;
  if (typeof p.contactEmail === "string") result.contactEmail = p.contactEmail;
  if (typeof p.whatsappNumber === "string") result.whatsappNumber = p.whatsappNumber;
  if (typeof p.companyName === "string") result.companyName = p.companyName;
  if (typeof p.companyVehicles === "string") result.companyVehicles = p.companyVehicles;
  if (typeof p.registrationDate === "string") result.registrationDate = p.registrationDate;
  if (typeof p.tradeInInterest === "string") result.tradeInInterest = p.tradeInInterest;
  if (typeof p.referralNotes === "string") result.referralNotes = p.referralNotes;
  if (typeof p.applicationNotes === "string") result.applicationNotes = p.applicationNotes;
  if (typeof p.notesSummary === "string") result.notesSummary = p.notesSummary;
  if (typeof p.linkedUserId === "string") result.linkedUserId = p.linkedUserId;
  if (typeof p.assignedToUserId === "string") result.assignedToUserId = p.assignedToUserId;
  if (typeof p.assignedToName === "string") result.assignedToName = p.assignedToName;
  if (typeof p.assignedByUserId === "string") result.assignedByUserId = p.assignedByUserId;
  if (typeof p.assignedByName === "string") result.assignedByName = p.assignedByName;
  if (typeof p.assignedAt === "number") result.assignedAt = p.assignedAt;
  return result;
}

function mapCustomerProfileForStaff(p: any) {
  return mapCustomerProfile(p);
}

async function getStaffByUserId(ctx: any, userId: string) {
  const user = await safeDbGet(ctx, userId);
  if (!user?.email) return null;
  return await ctx.db
    .query("staff")
    .withIndex("by_email", (q: any) => q.eq("email", user.email))
    .first();
}

async function findLinkedAppUser(ctx: any, profile: { phone: string; contactEmail?: string; firstName: string; surname: string }) {
  const email = String(profile.contactEmail ?? "").trim().toLowerCase();
  if (email) {
    const byEmail = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", email))
      .first();
    if (byEmail) return byEmail;
  }

  const normalizedPhone = String(profile.phone ?? "").replace(/\s+/g, "").trim();
  if (normalizedPhone) {
    const users = await ctx.db.query("users").collect();
    const byPhone = users.find((user: any) => {
      const phone = String(user.phone ?? "").replace(/\s+/g, "").trim();
      const altPhone = String(user.alternatePhone ?? "").replace(/\s+/g, "").trim();
      return phone === normalizedPhone || altPhone === normalizedPhone;
    });
    if (byPhone) return byPhone;
  }

  const fullName = `${profile.firstName} ${profile.surname}`.trim().toLowerCase();
  if (fullName) {
    const users = await ctx.db.query("users").collect();
    const byName = users.find((user: any) => {
      const displayName = String(user.displayName ?? user.name ?? "").trim().toLowerCase();
      return displayName === fullName;
    });
    if (byName) return byName;
  }

  return null;
}

function getScopeIds(current: any) {
  return Array.from(new Set([
    ...(Array.isArray(current?.scopeIds) ? current.scopeIds : []),
    ...(current?.userId ? [String(current.userId)] : []),
    ...(current?.identity?.subject ? [String(current.identity.subject)] : []),
  ].filter(Boolean)));
}

// Seed customer profiles from parsed CSV data
export const seed = mutation({
  args: {
    profiles: v.array(v.object({
      firstName: v.string(),
      surname: v.string(),
      phone: v.string(),
      homePhone: v.optional(v.string()),
      workPhone: v.optional(v.string()),
      contactEmail: v.optional(v.string()),
      whatsappNumber: v.optional(v.string()),
      companyName: v.optional(v.string()),
      companyVehicles: v.optional(v.string()),
      vehicleDescription: v.string(),
      registrationDate: v.optional(v.string()),
      tradeInInterest: v.optional(v.string()),
      referralNotes: v.optional(v.string()),
      applicationNotes: v.optional(v.string()),
      notesSummary: v.optional(v.string()),
    })),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    let count = 0;
    for (const p of args.profiles) {
      const fullName = `${p.firstName} ${p.surname}`.trim();
      if (!fullName || fullName.length < 2) continue;

      const existing = await ctx.db
        .query("customerProfiles")
        .withIndex("by_phone", (q: any) => q.eq("phone", p.phone))
        .first();
      if (existing) continue;

      const linkedUser = await findLinkedAppUser(ctx, p);
      const assignedStaff = getAssignedStaffForCurrentUser(current);
      const workspaceId = getCurrentWorkspaceId(current);
      await ctx.db.insert("customerProfiles", {
        ownerUserId: assignedStaff?.assignedStaffUserId ?? current.userId,
        dealershipId: assignedStaff?.assignedStaffDealershipId ?? getCurrentDealershipId(current),
        workspaceId,
        firstName: p.firstName,
        surname: p.surname,
        fullName,
        phone: p.phone,
        homePhone: p.homePhone,
        workPhone: p.workPhone,
        contactEmail: p.contactEmail,
        whatsappNumber: p.whatsappNumber,
        companyName: p.companyName,
        companyVehicles: p.companyVehicles,
        vehicleDescription: p.vehicleDescription,
        registrationDate: p.registrationDate,
        tradeInInterest: p.tradeInInterest,
        referralNotes: p.referralNotes,
        applicationNotes: p.applicationNotes,
        notesSummary: p.notesSummary,
        profileImage: linkedUser?.profileImage ?? linkedUser?.image,
        linkedUserId: linkedUser ? String(linkedUser._id) : undefined,
        assignedToUserId: assignedStaff?.assignedStaffUserId,
        assignedToName: assignedStaff?.assignedStaffName,
        assignedByUserId: current.userId,
        assignedByName: current.user?.name ?? current.user?.email ?? "Staff",
        sourceLabel: "imported",
        isActive: true,
      });
      count++;
    }
    return count;
  },
});

// Add a single customer profile
export const addOne = mutation({
  args: {
    firstName: v.string(),
    surname: v.string(),
    phone: v.string(),
    homePhone: v.optional(v.string()),
    workPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    whatsappNumber: v.optional(v.string()),
    companyName: v.optional(v.string()),
    companyVehicles: v.optional(v.string()),
    vehicleDescription: v.string(),
    registrationDate: v.optional(v.string()),
    tradeInInterest: v.optional(v.string()),
    applicationNotes: v.optional(v.string()),
    referralNotes: v.optional(v.string()),
    notesSummary: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const fullName = `${args.firstName} ${args.surname}`.trim();
    const normalized = args.phone.replace(/\s+/g, "");
    const ownerName = current.user?.name ?? current.user?.email ?? "Staff";
    const linkedUser = await findLinkedAppUser(ctx, {
      firstName: args.firstName,
      surname: args.surname,
      phone: normalized,
      contactEmail: args.contactEmail,
    });
    const assignedStaff = getAssignedStaffForCurrentUser(current);
    const workspaceId = getCurrentWorkspaceId(current);

    const patch = {
      ownerUserId: assignedStaff?.assignedStaffUserId ?? current.userId,
      workspaceId,
      firstName: args.firstName,
      surname: args.surname,
      fullName,
      phone: normalized,
      homePhone: args.homePhone,
      workPhone: args.workPhone,
      contactEmail: args.contactEmail,
      whatsappNumber: args.whatsappNumber,
      companyName: args.companyName,
      companyVehicles: args.companyVehicles,
      vehicleDescription: args.vehicleDescription,
      registrationDate: args.registrationDate,
      tradeInInterest: args.tradeInInterest,
      applicationNotes: args.applicationNotes,
      referralNotes: args.referralNotes,
      notesSummary: args.notesSummary,
      profileImage: linkedUser?.profileImage ?? linkedUser?.image,
      linkedUserId: linkedUser ? String(linkedUser._id) : undefined,
      sourceLabel: "manual",
      assignedToUserId: assignedStaff?.assignedStaffUserId ?? current.userId,
      assignedToName: assignedStaff?.assignedStaffName ?? ownerName,
      assignedByUserId: current.userId,
      assignedByName: ownerName,
      assignedAt: Date.now(),
      isActive: true,
    } as const;

    const existing = await ctx.db
      .query("customerProfiles")
      .withIndex("by_phone", (q: any) => q.eq("phone", normalized))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id.toString();
    }

    const id = await ctx.db.insert("customerProfiles", patch);

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: current.userId,
      type: "customer_profile_created",
      title: "Customer Profile Created",
      description: `Created profile for ${fullName}`,
      customerName: fullName,
      customerPhone: normalized,
      metadata: JSON.stringify({ profileId: id.toString() }),
      triggeredBy: current.userId,
    });

    return id.toString();
  },
});

// Delete a customer profile
export const remove = mutation({
  args: { profileId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    const profile = await safeDbGet(ctx, args.profileId);
    if (!profile) return false;
    if (!canMutateCustomerProfile(current, profile)) throw new Error("Not authorized");
    try {
      await ctx.db.delete(args.profileId as any);
      return true;
    } catch {
      return false;
    }
  },
});

// Log a WhatsApp message sent to a customer
export const logWhatsappMessage = mutation({
  args: {
    customerId: v.string(),
    customerName: v.string(),
    customerPhone: v.string(),
    message: v.string(),
    messageType: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    const id = await ctx.db.insert("whatsappMessages", {
      customerId: args.customerId,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      message: args.message,
      messageType: args.messageType,
      sentBy: current.userId,
      sentAt: Date.now(),
      status: "composed",
    });

    if (args.messageType === "welcome" || args.messageType === "install_guide") {
      await ctx.runMutation(internal.activityLog.logInternal, {
        ownerUserId: current.userId,
        type: "welcome_sent",
        title: "Welcome Message Sent",
        description: `KiRA welcome message sent to ${args.customerName} (${args.customerPhone})`,
        customerName: args.customerName,
        customerPhone: args.customerPhone,
        metadata: JSON.stringify({ messageType: args.messageType }),
        triggeredBy: current.userId,
      });
    }

    return id.toString();
  },
});

// Get WhatsApp message history
export const getWhatsappHistory = query({
  args: { customerId: v.optional(v.string()) },
  returns: v.array(v.object({
    _id: v.string(),
    customerName: v.string(),
    customerPhone: v.string(),
    message: v.string(),
    messageType: v.string(),
    sentAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    if (!args.customerId) return [];

    const profile = await ctx.db.get(args.customerId as any);
    if (!profile) return [];
    if (!canAccessCustomerProfileForStaff(current, profile)) return [];

    let messages;
    messages = await ctx.db
      .query("whatsappMessages")
      .withIndex("by_customerId", (q: any) => q.eq("customerId", args.customerId))
      .order("desc")
      .take(50);
    return messages.map((m: any) => ({
      _id: m._id.toString(),
      customerName: m.customerName,
      customerPhone: m.customerPhone,
      message: m.message,
      messageType: m.messageType,
      sentAt: m.sentAt,
    }));
  },
});

export const list = query({
  args: {},
  returns: v.array(v.object({
    _id: v.string(),
    firstName: v.string(),
    surname: v.string(),
    fullName: v.string(),
    phone: v.string(),
    homePhone: v.optional(v.string()),
    workPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    whatsappNumber: v.optional(v.string()),
    companyName: v.optional(v.string()),
    companyVehicles: v.optional(v.string()),
    vehicleDescription: v.string(),
    registrationDate: v.optional(v.string()),
    tradeInInterest: v.optional(v.string()),
    referralNotes: v.optional(v.string()),
    applicationNotes: v.optional(v.string()),
    notesSummary: v.optional(v.string()),
    profileImage: v.optional(v.string()),
    linkedUserId: v.optional(v.string()),
    assignedToUserId: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    assignedByUserId: v.optional(v.string()),
    assignedByName: v.optional(v.string()),
    assignedAt: v.optional(v.number()),
    sourceLabel: v.optional(v.string()),
    isActive: v.boolean(),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    if (canAccessAllCustomerProfiles(current.user)) {
      const allProfiles = (await ctx.db.query("customerProfiles").collect())
        .filter((p: any) => p.isActive !== false)
        .map((p: any) => mapCustomerProfileForStaff(p));
      return allProfiles.sort((a: any, b: any) => b._creationTime - a._creationTime);
    }

    const scopeIds = getWorkspaceScopeIds(current);
    const owned = await Promise.all(scopeIds.map((scopeId) =>
      ctx.db.query("customerProfiles").withIndex("by_workspaceId", (q: any) => q.eq("workspaceId", scopeId)).collect()
    ));
    const linked = await Promise.all(scopeIds.map((scopeId) =>
      ctx.db.query("customerProfiles").withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", scopeId)).collect()
    ));

    const merged = [...owned.flat(), ...linked.flat()]
      .filter((p: any, index: number, arr: any[]) => arr.findIndex((row: any) => String(row._id) === String(p._id)) === index)
      .filter((profile: any) => canAccessCustomerProfileForStaff(current, profile) && profile.isActive !== false && profileMatchesWorkspace(profile, current))
      .sort((a: any, b: any) => b._creationTime - a._creationTime)
      .map((p: any) => mapCustomerProfileForStaff(p));

    return merged;
  },
});

export const listPaged = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(v.object({
      _id: v.string(),
      firstName: v.string(),
      surname: v.string(),
      fullName: v.string(),
      phone: v.string(),
      homePhone: v.optional(v.string()),
      workPhone: v.optional(v.string()),
      contactEmail: v.optional(v.string()),
      whatsappNumber: v.optional(v.string()),
      companyName: v.optional(v.string()),
      companyVehicles: v.optional(v.string()),
      vehicleDescription: v.string(),
      registrationDate: v.optional(v.string()),
      tradeInInterest: v.optional(v.string()),
      referralNotes: v.optional(v.string()),
      applicationNotes: v.optional(v.string()),
      notesSummary: v.optional(v.string()),
      profileImage: v.optional(v.string()),
      linkedUserId: v.optional(v.string()),
      assignedToUserId: v.optional(v.string()),
      assignedToName: v.optional(v.string()),
      assignedByUserId: v.optional(v.string()),
      assignedByName: v.optional(v.string()),
      assignedAt: v.optional(v.number()),
      sourceLabel: v.optional(v.string()),
      isActive: v.boolean(),
    })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    if (canAccessAllCustomerProfiles(current.user)) {
      const paged = await ctx.db
        .query("customerProfiles")
        .order("desc")
        .paginate(args.paginationOpts);
      return {
        page: paged.page.map((p: any) => mapCustomerProfileForStaff(p)),
        isDone: paged.isDone,
        continueCursor: paged.continueCursor,
      };
    }

    const scopeIds = getWorkspaceScopeIds(current);
    const buckets = await Promise.all([
      ...scopeIds.map((scopeId: string | undefined) => ctx.db.query("customerProfiles").withIndex("by_workspaceId", (q: any) => q.eq("workspaceId", scopeId as string)).collect()),
      ...scopeIds.map((scopeId: string | undefined) => ctx.db.query("customerProfiles").withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", scopeId as string)).collect()),
    ]);
    const merged = buckets.flat()
      .filter((p: any, index: number, arr: any[]) => arr.findIndex((row: any) => String(row._id) === String(p._id)) === index)
      .filter((profile: any) => canAccessCustomerProfileForStaff(current, profile) && profile.isActive !== false && profileMatchesWorkspace(profile, current))
      .sort((a: any, b: any) => b._creationTime - a._creationTime);

    const pageSize = args.paginationOpts.numItems ?? 20;
    const start = Math.max(0, args.paginationOpts.cursor ? Number(args.paginationOpts.cursor) || 0 : 0);
    const pageItems = merged.slice(start, start + pageSize).map((p: any) => mapCustomerProfileForStaff(p));
    return {
      page: pageItems,
      isDone: start + pageSize >= merged.length,
      continueCursor: String(start + pageSize),
    };
  },
});

export const countAccessible = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return 0;

    if (canAccessAllCustomerProfiles(current.user)) {
      return (await ctx.db.query("customerProfiles").collect()).length;
    }

    const scopeIds = getWorkspaceScopeIds(current);
    const buckets = await Promise.all([
      ...scopeIds.map((scopeId) => ctx.db.query("customerProfiles").withIndex("by_workspaceId", (q: any) => q.eq("workspaceId", scopeId)).collect()),
      ...scopeIds.map((scopeId) => ctx.db.query("customerProfiles").withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", scopeId)).collect()),
    ]);

    return buckets.flat()
      .filter((p: any, index: number, arr: any[]) => arr.findIndex((row: any) => String(row._id) === String(p._id)) === index)
      .filter((profile: any) => canAccessCustomerProfileForStaff(current, profile) && profile.isActive !== false && profileMatchesWorkspace(profile, current))
      .length;
  },
});

export const listMine = query({
  args: {},
  returns: v.array(v.object({
    _id: v.string(),
    firstName: v.string(),
    surname: v.string(),
    fullName: v.string(),
    phone: v.string(),
    homePhone: v.optional(v.string()),
    workPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    whatsappNumber: v.optional(v.string()),
    companyName: v.optional(v.string()),
    companyVehicles: v.optional(v.string()),
    vehicleDescription: v.string(),
    registrationDate: v.optional(v.string()),
    tradeInInterest: v.optional(v.string()),
    referralNotes: v.optional(v.string()),
    applicationNotes: v.optional(v.string()),
    notesSummary: v.optional(v.string()),
    linkedUserId: v.optional(v.string()),
    assignedToUserId: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    assignedByUserId: v.optional(v.string()),
    assignedByName: v.optional(v.string()),
    assignedAt: v.optional(v.number()),
    isActive: v.boolean(),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    const workspaceId = getCurrentWorkspaceId(current);
    const profiles = await ctx.db
      .query("customerProfiles")
      .withIndex("by_workspaceId", (q: any) => q.eq("workspaceId", workspaceId ?? current.userId))
      .collect();
    return profiles
      .filter((p: any) => p.isActive !== false)
      .map((p: any) => mapCustomerProfile(p));
  },
});

export const listMyUploads = query({
  args: {},
  returns: v.array(v.object({
    _id: v.string(),
    firstName: v.string(),
    surname: v.string(),
    fullName: v.string(),
    phone: v.string(),
    homePhone: v.optional(v.string()),
    workPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    whatsappNumber: v.optional(v.string()),
    companyName: v.optional(v.string()),
    companyVehicles: v.optional(v.string()),
    vehicleDescription: v.string(),
    registrationDate: v.optional(v.string()),
    tradeInInterest: v.optional(v.string()),
    referralNotes: v.optional(v.string()),
    applicationNotes: v.optional(v.string()),
    notesSummary: v.optional(v.string()),
    profileImage: v.optional(v.string()),
    linkedUserId: v.optional(v.string()),
    assignedToUserId: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    assignedByUserId: v.optional(v.string()),
    assignedByName: v.optional(v.string()),
    assignedAt: v.optional(v.number()),
    sourceLabel: v.optional(v.string()),
    isActive: v.boolean(),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const workspaceId = getCurrentWorkspaceId(current);
    const owned = await ctx.db
      .query("customerProfiles")
      .withIndex("by_workspaceId", (q: any) => q.eq("workspaceId", workspaceId ?? current.userId))
      .collect();

    return owned
      .filter((profile: any) => canAccessCustomerProfileForStaff(current, profile))
      .sort((a: any, b: any) => b._creationTime - a._creationTime)
      .map((p: any) => mapCustomerProfileForStaff(p));
  },
});

export const repairLegacyOwnership = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current?.user) throw new Error("Not authenticated");

    const isPrimaryAdmin = String(current.user.email ?? "").trim().toLowerCase() === "vincentmm@hyundai.co.za";
    if (!isPrimaryAdmin && !current.user.isOwner) throw new Error("Not authorized");

    const legacyProfiles = await ctx.db.query("customerProfiles").collect();
    let updated = 0;
    for (const profile of legacyProfiles) {
      if (!profile.ownerUserId) {
        await ctx.db.patch(profile._id, {
          ownerUserId: current.userId,
          assignedByUserId: profile.assignedByUserId ?? current.userId,
          assignedByName: profile.assignedByName ?? current.user?.name ?? current.user?.email ?? "Staff",
        });
        updated++;
      }
    }
    return updated;
  },
});

export const assignAllCurrentCustomersToVincent = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    const currentUser = current?.user ?? null;
    const isPrimaryAdmin = Boolean(currentUser) && String(currentUser.email ?? "").trim().toLowerCase() === "vincentmm@hyundai.co.za";
    if (currentUser && !isPrimaryAdmin && !currentUser.isOwner) throw new Error("Not authorized");

    const vincent = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", "vincentmm@hyundai.co.za"))
      .first();
    if (!vincent) throw new Error("Mbulelo Vincent user record not found");

    const profiles = await ctx.db.query("customerProfiles").collect();
    const customerUserIds = new Set<string>();
    let updated = 0;

    for (const profile of profiles) {
      if (profile.linkedUserId) customerUserIds.add(String(profile.linkedUserId));
      if (profile.ownerUserId) customerUserIds.add(String(profile.ownerUserId));
      await ctx.db.patch(profile._id, {
        ownerId: String(vincent._id),
        ownerUserId: String(vincent._id),
        assignedToUserId: String(vincent._id),
        assignedToName: vincent.name ?? vincent.displayName ?? vincent.email ?? "Mbulelo Vincent Mayoyo",
        assignedByUserId: current?.userId ?? String(vincent._id),
        assignedByName: currentUser?.name ?? currentUser?.email ?? vincent.name ?? vincent.email ?? "Mbulelo Vincent Mayoyo",
        dealershipId: vincent.dealershipId ?? profile.dealershipId,
      });
      updated++;
    }

    const bookingRows = await ctx.db.query("bookings").collect();
    for (const booking of bookingRows) {
      if (!customerUserIds.has(String(booking.userId ?? ""))) continue;
      await ctx.db.patch(booking._id, {
        ownerUserId: String(vincent._id),
        assignedToUserId: String(vincent._id),
        assignedTo: String(vincent._id),
        assignedToName: vincent.name ?? vincent.displayName ?? vincent.email ?? "Mbulelo Vincent Mayoyo",
        dealershipId: vincent.dealershipId ?? booking.dealershipId,
      });
    }

    const testDriveRows = await ctx.db.query("testDrives").collect();
    for (const td of testDriveRows) {
      if (!customerUserIds.has(String(td.userId ?? ""))) continue;
      await ctx.db.patch(td._id, {
        ownerUserId: String(vincent._id),
        assignedToUserId: String(vincent._id),
        assignedTo: String(vincent._id),
        assignedToName: vincent.name ?? vincent.displayName ?? vincent.email ?? "Mbulelo Vincent Mayoyo",
        dealershipId: vincent.dealershipId ?? td.dealershipId,
        dealershipName: vincent.dealershipName ?? td.dealershipName,
        dealershipBrand: vincent.dealershipBrand ?? td.dealershipBrand,
      });
    }

    const financeRows = await ctx.db.query("financeApplications").collect();
    for (const app of financeRows) {
      if (!customerUserIds.has(String(app.userId ?? ""))) continue;
      await ctx.db.patch(app._id, {
        ownerId: String(vincent._id),
        ownerUserId: String(vincent._id),
        owner_id: String(vincent._id),
        assignedToUserId: String(vincent._id),
        assignedToName: vincent.name ?? vincent.displayName ?? vincent.email ?? "Mbulelo Vincent Mayoyo",
        assignedByUserId: current?.userId ?? String(vincent._id),
        assignedByName: currentUser?.name ?? currentUser?.email ?? vincent.name ?? vincent.email ?? "Mbulelo Vincent Mayoyo",
        dealershipId: vincent.dealershipId ?? app.dealershipId,
      });
    }

    return updated;
  },
});

export const assignAllCurrentCustomersToVincentInternal = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const vincent = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", "vincentmm@hyundai.co.za"))
      .first();
    if (!vincent) throw new Error("Mbulelo Vincent user record not found");

    const profiles = await ctx.db.query("customerProfiles").collect();
    const customerUserIds = new Set<string>();
    let updated = 0;

    for (const profile of profiles) {
      if (profile.linkedUserId) customerUserIds.add(String(profile.linkedUserId));
      if (profile.ownerUserId) customerUserIds.add(String(profile.ownerUserId));
      await ctx.db.patch(profile._id, {
        ownerId: String(vincent._id),
        ownerUserId: String(vincent._id),
        assignedToUserId: String(vincent._id),
        assignedToName: vincent.name ?? vincent.displayName ?? vincent.email ?? "Mbulelo Vincent Mayoyo",
        assignedByUserId: String(vincent._id),
        assignedByName: vincent.name ?? vincent.displayName ?? vincent.email ?? "Mbulelo Vincent Mayoyo",
        dealershipId: vincent.dealershipId ?? profile.dealershipId,
      });
      updated++;
    }

    const bookingRows = await ctx.db.query("bookings").collect();
    for (const booking of bookingRows) {
      if (!customerUserIds.has(String(booking.userId ?? ""))) continue;
      await ctx.db.patch(booking._id, {
        ownerUserId: String(vincent._id),
        assignedToUserId: String(vincent._id),
        assignedTo: String(vincent._id),
        assignedToName: vincent.name ?? vincent.displayName ?? vincent.email ?? "Mbulelo Vincent Mayoyo",
        dealershipId: vincent.dealershipId ?? booking.dealershipId,
      });
    }

    const testDriveRows = await ctx.db.query("testDrives").collect();
    for (const td of testDriveRows) {
      if (!customerUserIds.has(String(td.userId ?? ""))) continue;
      await ctx.db.patch(td._id, {
        ownerUserId: String(vincent._id),
        assignedToUserId: String(vincent._id),
        assignedTo: String(vincent._id),
        assignedToName: vincent.name ?? vincent.displayName ?? vincent.email ?? "Mbulelo Vincent Mayoyo",
        dealershipId: vincent.dealershipId ?? td.dealershipId,
        dealershipName: vincent.dealershipName ?? td.dealershipName,
        dealershipBrand: vincent.dealershipBrand ?? td.dealershipBrand,
      });
    }

    const financeRows = await ctx.db.query("financeApplications").collect();
    for (const app of financeRows) {
      if (!customerUserIds.has(String(app.userId ?? ""))) continue;
      await ctx.db.patch(app._id, {
        ownerId: String(vincent._id),
        ownerUserId: String(vincent._id),
        owner_id: String(vincent._id),
        assignedToUserId: String(vincent._id),
        assignedToName: vincent.name ?? vincent.displayName ?? vincent.email ?? "Mbulelo Vincent Mayoyo",
        assignedByUserId: String(vincent._id),
        assignedByName: vincent.name ?? vincent.displayName ?? vincent.email ?? "Mbulelo Vincent Mayoyo",
        dealershipId: vincent.dealershipId ?? app.dealershipId,
      });
    }

    return updated;
  },
});

// Lookup customer profile by phone number
export const lookupByPhone = query({
  args: { phone: v.string() },
  returns: v.union(
    v.object({
      _id: v.string(),
      firstName: v.string(),
      surname: v.string(),
      fullName: v.string(),
      phone: v.string(),
      vehicleDescription: v.string(),
      contactEmail: v.optional(v.string()),
      whatsappNumber: v.optional(v.string()),
      companyName: v.optional(v.string()),
      companyVehicles: v.optional(v.string()),
      registrationDate: v.optional(v.string()),
      tradeInInterest: v.optional(v.string()),
      referralNotes: v.optional(v.string()),
      applicationNotes: v.optional(v.string()),
      notesSummary: v.optional(v.string()),
      linkedUserId: v.optional(v.string()),
      isActive: v.boolean(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;
    const normalized = args.phone.replace(/\s+/g, "");
    const profile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_phone", (q: any) => q.eq("phone", normalized))
      .first();
    if (!profile) return null;
    if (!canAccessAllCustomerProfiles(current.user) && !canAccessCustomerProfileForStaff(current, profile) && !profileMatchesWorkspace(profile, current)) return null;
    return {
      _id: profile._id.toString(),
      firstName: profile.firstName,
      surname: profile.surname,
      fullName: profile.fullName,
      phone: profile.phone,
      vehicleDescription: profile.vehicleDescription,
      contactEmail: profile.contactEmail,
      whatsappNumber: profile.whatsappNumber,
      companyName: profile.companyName,
      companyVehicles: profile.companyVehicles,
      registrationDate: profile.registrationDate,
      tradeInInterest: profile.tradeInInterest,
      referralNotes: profile.referralNotes,
      applicationNotes: profile.applicationNotes,
      notesSummary: profile.notesSummary,
      linkedUserId: profile.linkedUserId,
      isActive: profile.isActive,
    };
  },
});

export const getMyProfile = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.string(),
      firstName: v.string(),
      surname: v.string(),
      fullName: v.string(),
      phone: v.string(),
      vehicleDescription: v.string(),
      contactEmail: v.optional(v.string()),
      whatsappNumber: v.optional(v.string()),
      companyName: v.optional(v.string()),
      companyVehicles: v.optional(v.string()),
      registrationDate: v.optional(v.string()),
      tradeInInterest: v.optional(v.string()),
      referralNotes: v.optional(v.string()),
      applicationNotes: v.optional(v.string()),
      notesSummary: v.optional(v.string()),
      linkedUserId: v.optional(v.string()),
      assignedToUserId: v.optional(v.string()),
      assignedToName: v.optional(v.string()),
      assignedByUserId: v.optional(v.string()),
      assignedByName: v.optional(v.string()),
      assignedAt: v.optional(v.number()),
      profileImage: v.optional(v.string()),
      sourceLabel: v.optional(v.string()),
      isActive: v.boolean(),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;
    const profile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", current.userId))
      .first();
    if (!profile) return null;
    return mapCustomerProfile(profile);
  },
});

// Link a customer profile to an authenticated user (auto-match by phone or name)
export const linkToUser = mutation({
  args: { profileId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    try {
      await ctx.db.patch(args.profileId as any, {
        linkedUserId: current.userId,
      });
      return true;
    } catch {
      return false;
    }
  },
});

// Auto-link: find profile matching user's name or phone and link it
export const autoLink = mutation({
  args: {
    userName: v.optional(v.string()),
    userPhone: v.optional(v.string()),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const existing = await ctx.db
      .query("customerProfiles")
      .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", current.userId))
      .first();
    if (existing) return existing._id.toString();

    if (args.userPhone) {
      const normalized = args.userPhone.replace(/\s+/g, "");
      const byPhone = await ctx.db
        .query("customerProfiles")
        .withIndex("by_phone", (q: any) => q.eq("phone", normalized))
        .first();
      if (byPhone && !byPhone.linkedUserId) {
        await ctx.db.patch(byPhone._id, { linkedUserId: current.userId });
        return byPhone._id.toString();
      }
    }

    if (args.userName) {
      const nameLower = args.userName.toLowerCase().trim();
      const all = await ctx.db.query("customerProfiles").collect();
      const match = all.find((p: any) =>
        !p.linkedUserId && p.fullName.toLowerCase() === nameLower
      );
      if (match) {
        await ctx.db.patch(match._id, { linkedUserId: current.userId });
        return match._id.toString();
      }
    }

    return null;
  },
});

// Get customer context for KiRA - returns all known info about a user
export const getKiraContext = query({
  args: {},
  returns: v.union(
    v.object({
      knownCustomer: v.boolean(),
      fullName: v.optional(v.string()),
      vehicleDescription: v.optional(v.string()),
      contactEmail: v.optional(v.string()),
      whatsappNumber: v.optional(v.string()),
      companyName: v.optional(v.string()),
      companyVehicles: v.optional(v.string()),
      registrationDate: v.optional(v.string()),
      tradeInInterest: v.optional(v.string()),
      referralNotes: v.optional(v.string()),
      applicationNotes: v.optional(v.string()),
      notesSummary: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const linked = await ctx.db
      .query("customerProfiles")
      .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", current.userId))
      .first();

    if (linked) {
      return {
        knownCustomer: true,
        fullName: linked.fullName,
        vehicleDescription: linked.vehicleDescription,
        contactEmail: linked.contactEmail,
        whatsappNumber: linked.whatsappNumber,
        companyName: linked.companyName,
        companyVehicles: linked.companyVehicles,
        registrationDate: linked.registrationDate,
        tradeInInterest: linked.tradeInInterest,
        referralNotes: linked.referralNotes,
        applicationNotes: linked.applicationNotes,
        notesSummary: linked.notesSummary,
      };
    }

    return { knownCustomer: false };
  },
});

export const syncMyProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    phone: v.optional(v.string()),
    vehicleDescription: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return "";

    const rawName = (args.displayName ?? current.user?.displayName ?? current.user?.name ?? current.user?.email ?? current.identity?.name ?? current.identity?.email ?? "").trim();
    const parts = rawName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? current.user?.name ?? current.identity?.name ?? "";
    const surname = parts.slice(1).join(" ");
    const phone = (args.phone ?? current.user?.phone ?? "").replace(/\s+/g, "").trim();
    const vehicleDescription = (args.vehicleDescription ?? "").trim();
    const profileImage = current.user?.profileImage ?? current.user?.image ?? undefined;
    const assignedStaff = getAssignedStaffForCurrentUser(current);

    const patch = {
      ownerUserId: assignedStaff?.assignedStaffUserId ?? current.userId,
      workspaceId: assignedStaff?.assignedStaffUserId ?? current.userId,
      firstName,
      surname,
      fullName: rawName || `${firstName} ${surname}`.trim(),
      phone: phone || current.user?.phone || "",
      vehicleDescription: vehicleDescription || "Unknown",
      profileImage,
      linkedUserId: current.userId,
      dealershipId: assignedStaff?.assignedStaffDealershipId ?? getCurrentDealershipId(current),
      assignedToUserId: assignedStaff?.assignedStaffUserId,
      assignedToName: assignedStaff?.assignedStaffName,
      assignedByUserId: current.userId,
      assignedByName: current.user?.name ?? current.user?.email ?? "Staff",
      isActive: true,
    };

    const existing = await ctx.db
      .query("customerProfiles")
      .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", current.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id.toString();
    }

    const byPhone = phone
      ? await ctx.db.query("customerProfiles").withIndex("by_phone", (q: any) => q.eq("phone", phone)).first()
      : null;
    if (byPhone) {
      await ctx.db.patch(byPhone._id, patch);
      return byPhone._id.toString();
    }

    const id = await ctx.db.insert("customerProfiles", {
      ...patch,
        dealershipId: assignedStaff?.assignedStaffDealershipId ?? getCurrentDealershipId(current),
    });
    return id.toString();
  },
});

// Get all profiles for KiRA staff context (so staff KiRA knows all customers)
export const getAllForKira = query({
  args: {},
  returns: v.array(v.object({
    fullName: v.string(),
    phone: v.string(),
    vehicleDescription: v.string(),
    contactEmail: v.optional(v.string()),
    whatsappNumber: v.optional(v.string()),
    companyName: v.optional(v.string()),
    companyVehicles: v.optional(v.string()),
    registrationDate: v.optional(v.string()),
    tradeInInterest: v.optional(v.string()),
    referralNotes: v.optional(v.string()),
    applicationNotes: v.optional(v.string()),
    notesSummary: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    const all = await ctx.db.query("customerProfiles").collect();
    return all
      .filter((p: any) => p.isActive !== false)
      .filter((p: any) => canAccessAllCustomerProfiles(current.user) || canAccessCustomerProfileForStaff(current, p))
      .map((p: any) => ({
        fullName: p.fullName,
        phone: p.phone,
        vehicleDescription: p.vehicleDescription,
        contactEmail: p.contactEmail,
        whatsappNumber: p.whatsappNumber,
        companyName: p.companyName,
        companyVehicles: p.companyVehicles,
        registrationDate: p.registrationDate,
        tradeInInterest: p.tradeInInterest,
        referralNotes: p.referralNotes,
        applicationNotes: p.applicationNotes,
        notesSummary: p.notesSummary,
      }));
  },
});

// Update a customer profile (staff function)
export const update = mutation({
  args: {
    profileId: v.string(),
    tradeInInterest: v.optional(v.string()),
    referralNotes: v.optional(v.string()),
    applicationNotes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    const profile = await safeDbGet(ctx, args.profileId);
    if (!profile) throw new Error("Customer profile not found");
    if (!canMutateCustomerProfile(current, profile)) throw new Error("Not authorized");
    try {
      const patch: any = {};
      if (args.tradeInInterest !== undefined) patch.tradeInInterest = args.tradeInInterest;
      if (args.referralNotes !== undefined) patch.referralNotes = args.referralNotes;
      if (args.applicationNotes !== undefined) patch.applicationNotes = args.applicationNotes;
      if (args.isActive !== undefined) patch.isActive = args.isActive;
      await ctx.db.patch(profile._id, patch);
      return true;
    } catch {
      return false;
    }
  },
});

export const assignToStaff = mutation({
  args: {
    profileId: v.string(),
    staffUserId: v.id("users"),
    assignedToName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current?.user || !canBypassOwnerIsolation(current.user)) throw new Error("Not authorized");

    const profile = await safeDbGet(ctx, args.profileId);
    if (!profile) throw new Error("Customer profile not found");

    const staffUser = await safeDbGet(ctx, args.staffUserId);
    if (!staffUser) throw new Error("Staff user not found");

    const staffRecord = await getStaffByUserId(ctx, String(staffUser._id));
    if (!staffRecord || !staffRecord.isActive) throw new Error("Selected user is not an active staff member");

    const assignedName = args.assignedToName ?? staffUser.name ?? staffUser.email ?? staffRecord.name;
    await ctx.db.patch(profile._id, {
      ownerId: String(staffUser._id),
      ownerUserId: String(staffUser._id),
      workspaceId: String(staffUser._id),
      assignedToUserId: String(staffUser._id),
      assignedToName: assignedName,
      assignedByUserId: current.userId,
      assignedByName: current.user?.name ?? current.user?.email ?? "Staff",
      assignedAt: Date.now(),
      dealershipId: staffUser.dealershipId ?? profile.dealershipId,
    });
    return null;
  },
});

export const unassign = mutation({
  args: { profileId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current?.user || !isStaffLikeUser(current.user)) throw new Error("Not authorized");
    const profile = await safeDbGet(ctx, args.profileId);
    if (!profile) throw new Error("Customer profile not found");
    await ctx.db.patch(profile._id, {
      assignedToUserId: undefined,
      assignedToName: undefined,
      assignedByUserId: undefined,
      assignedByName: undefined,
      assignedAt: undefined,
    });
    return null;
  },
});

// Restore customer profiles from the exported backup CSV asset.
export const restoreFromBackupCsv = action({
  args: {
    csvUrl: v.optional(v.string()),
    replaceExisting: v.optional(v.boolean()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const csvUrl = args.csvUrl ?? "https://nabdgzjpwhkjfimljnql.supabase.co/storage/v1/object/public/project_assets/477a3d37-0b61-49c5-8096-451c1592e304/assets/b17620f7-0a94-4d15-95c5-b285d92fcc14_LEADS%2008%20JAN%20SERV%20ADVISORS(Leads%20list%20).csv";
    const response = await (globalThis as any).fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`Failed to load backup CSV: ${response.status}`);
    }

    const csvText = await response.text();
    const profiles = parseCustomerBackupCsv(csvText);
    if (!profiles.length) {
      throw new Error("No customer rows were found in the backup CSV.");
    }

    return await ctx.runMutation(internal.customerProfiles.restoreFromBackupRows, {
      profiles,
      replaceExisting: args.replaceExisting ?? true,
      ownerUserId: current?.userId,
    });
  },
});

export const restoreFromBackupRows = internalMutation({
  args: {
    profiles: v.array(v.object({
      firstName: v.string(),
      surname: v.string(),
      phone: v.string(),
      homePhone: v.optional(v.string()),
      workPhone: v.optional(v.string()),
      contactEmail: v.optional(v.string()),
      whatsappNumber: v.optional(v.string()),
      companyName: v.optional(v.string()),
      companyVehicles: v.optional(v.string()),
      vehicleDescription: v.string(),
      registrationDate: v.optional(v.string()),
      tradeInInterest: v.optional(v.string()),
      applicationNotes: v.optional(v.string()),
      referralNotes: v.optional(v.string()),
      notesSummary: v.optional(v.string()),
    })),
    replaceExisting: v.boolean(),
    ownerUserId: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (args.replaceExisting) {
      const existing = await ctx.db.query("customerProfiles").collect();
      for (const row of existing) {
        await ctx.db.delete(row._id);
      }
    }

    let count = 0;
    for (const p of args.profiles) {
      const fullName = `${p.firstName} ${p.surname}`.trim();
      if (!fullName || fullName.length < 2) continue;

      const existing = await ctx.db
        .query("customerProfiles")
        .withIndex("by_phone", (q: any) => q.eq("phone", p.phone))
        .first();
      if (existing) continue;

      const linkedUser = await findLinkedAppUser(ctx, p);
      await ctx.db.insert("customerProfiles", {
        ownerUserId: args.ownerUserId,
        workspaceId: String(args.ownerUserId),
        dealershipId: await getDealershipIdForUserId(ctx, args.ownerUserId),
        firstName: p.firstName,
        surname: p.surname,
        fullName,
        phone: p.phone,
        homePhone: p.homePhone,
        workPhone: p.workPhone,
        contactEmail: p.contactEmail,
        whatsappNumber: p.whatsappNumber,
        companyName: p.companyName,
        companyVehicles: p.companyVehicles,
        vehicleDescription: p.vehicleDescription,
        registrationDate: p.registrationDate,
        tradeInInterest: p.tradeInInterest,
        referralNotes: p.referralNotes,
        applicationNotes: p.applicationNotes,
        notesSummary: p.notesSummary,
        profileImage: linkedUser?.profileImage ?? linkedUser?.image,
        linkedUserId: linkedUser ? String(linkedUser._id) : undefined,
        sourceLabel: "restored",
        isActive: true,
      });
      count++;
    }

    return count;
  },
});