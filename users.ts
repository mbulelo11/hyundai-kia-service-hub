import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getViewer } from "./auth";

const ALLOWED_STAFF_DOMAINS = [
  "hyundai", "kia", "hyundaisa", "kiasa",
  "hyundaimotor", "kiamotor", "hyundaigroup",
];
const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";

function isStaffEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const domainBase = domain.split(".")[0];
  return ALLOWED_STAFF_DOMAINS.some(
    (allowed) => domainBase === allowed || domain.includes(allowed)
  );
}

function isVincentAdminEmail(email: string) {
  return email.trim().toLowerCase() === VINCENT_ADMIN_EMAIL;
}

function isAdminOnlyUser(user: any) {
  return isVincentAdminEmail(String(user?.email ?? ""));
}

function isStaffLikeUser(user: any) {
  return Boolean(user?.role === "staff" || user?.staffRole || isAdminOnlyUser(user));
}

function pickPreferredUserByEmail(users: any[]) {
  return users
    .filter((user: any) => user && !user.isDeleted)
    .sort((a: any, b: any) => {
      const aScore = (isStaffLikeUser(a) ? 100 : 0) + (a.isOwner ? 20 : 0);
      const bScore = (isStaffLikeUser(b) ? 100 : 0) + (b.isOwner ? 20 : 0);
      return bScore - aScore || Number(b._creationTime ?? 0) - Number(a._creationTime ?? 0);
    })[0] ?? null;
}

async function getStaffRecordByEmail(ctx: any, email: string) {
  return await ctx.db
    .query("staff")
    .withIndex("by_email", (q: any) => q.eq("email", email))
    .first();
}

async function getDealershipById(ctx: any, dealershipId?: string) {
  if (!dealershipId) return null;
  try {
    return await ctx.db.get(dealershipId as any);
  } catch {
    return null;
  }
}

function buildUserResult(user: any) {
  const result: any = { _id: user._id };
  if (typeof user.name === "string") result.name = user.name;
  if (typeof user.email === "string") result.email = user.email;
  if (typeof user.phone === "string") result.phone = user.phone;
  if (typeof user.alternatePhone === "string") result.alternatePhone = user.alternatePhone;
  if (typeof user.birthday === "string") result.birthday = user.birthday;
  if (typeof user.address === "string") result.address = user.address;
  if (typeof user.preferredContactMethod === "string") result.preferredContactMethod = user.preferredContactMethod;
  if (typeof user.profileNotes === "string") result.profileNotes = user.profileNotes;
  if (typeof user.lastSeenAt === "number") result.lastSeenAt = user.lastSeenAt;
  if (typeof user.role === "string") result.role = user.role;
  if (typeof user.department === "string") result.department = user.department;
  if (typeof user.staffRole === "string") result.staffRole = user.staffRole;
  if (typeof user.staffApprovalStatus === "string") result.staffApprovalStatus = user.staffApprovalStatus;
  if (typeof user.accessLevel === "string") result.accessLevel = user.accessLevel;
  if (typeof user.image === "string") result.image = user.image;
  if (typeof user.profileImage === "string") result.profileImage = user.profileImage;
  if (typeof user.displayName === "string") result.displayName = user.displayName;
  if (typeof user.bio === "string") result.bio = user.bio;
  if (typeof user.dealershipId === "string") result.dealershipId = user.dealershipId;
  if (typeof user.dealershipName === "string") result.dealershipName = user.dealershipName;
  if (typeof user.dealershipBrand === "string") result.dealershipBrand = user.dealershipBrand;
  if (typeof user.dealershipLocation === "string") result.dealershipLocation = user.dealershipLocation;
  if (typeof user.assignedStaffUserId === "string") result.assignedStaffUserId = user.assignedStaffUserId;
  if (typeof user.assignedStaffName === "string") result.assignedStaffName = user.assignedStaffName;
  if (typeof user.assignedStaffRole === "string") result.assignedStaffRole = user.assignedStaffRole;
  if (typeof user.assignedStaffDealershipId === "string") result.assignedStaffDealershipId = user.assignedStaffDealershipId;
  if (typeof user.assignedStaffDealershipName === "string") result.assignedStaffDealershipName = user.assignedStaffDealershipName;
  if (typeof user.assignedStaffDealershipBrand === "string") result.assignedStaffDealershipBrand = user.assignedStaffDealershipBrand;
  if (typeof user.assignedStaffDealershipLocation === "string") result.assignedStaffDealershipLocation = user.assignedStaffDealershipLocation;
  if (typeof user.workspaceId === "string") result.workspaceId = user.workspaceId;
  return result;
}

function getOrCreateWorkspaceId(user: any) {
  const existing = String(user?.workspaceId ?? "").trim();
  if (existing) return existing;
  return `workspace_${String(user?._id ?? user?.userId ?? Date.now())}`;
}

// Shared helper: find user by identity using multiple strategies
async function findUserByIdentity(ctx: any, identity: any) {
  // Strategy 1: identity.subject may be session ID or user ID
  if (identity.subject) {
    try {
      const doc = await ctx.db.get(identity.subject);
      if (doc) {
        // If it's a session doc (has userId field), follow it to the user
        if (doc.userId) {
          try {
            const user = await ctx.db.get(doc.userId);
            if (user) return user;
          } catch (_e) { /* skip */ }
        } else if (doc.email !== undefined || doc.role !== undefined) {
          if (doc.email) {
            const matches = await ctx.db.query("users").withIndex("email", (q: any) => q.eq("email", doc.email)).collect();
            const preferred = pickPreferredUserByEmail(matches);
            if (preferred) return preferred;
          }
          return doc;
        }
      }
    } catch (_e) {
      // subject might not be a valid Id
    }
  }

  // Strategy 2: email index lookup
  if (identity.email) {
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", identity.email))
      .collect();
    const preferred = pickPreferredUserByEmail(users);
    if (preferred) return preferred;
  }

  // Strategy 3: tokenIdentifier = "<issuer>|<id>" - id might be session or user
  if (identity.tokenIdentifier) {
    const parts = identity.tokenIdentifier.split("|");
    const possibleId = parts[parts.length - 1];
    if (possibleId) {
      try {
        const doc = await ctx.db.get(possibleId);
        if (doc) {
          if (doc.userId) {
            try {
              const user = await ctx.db.get(doc.userId);
              if (user) return user;
            } catch (_e) { /* skip */ }
          } else if (doc.email !== undefined || doc.role !== undefined) {
            if (doc.email) {
              const matches = await ctx.db.query("users").withIndex("email", (q: any) => q.eq("email", doc.email)).collect();
              const preferred = pickPreferredUserByEmail(matches);
              if (preferred) return preferred;
            }
            return doc;
          }
        }
      } catch (_e) {
        // not a valid Id
      }
    }
  }

  return null;
}

export const me = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await findUserByIdentity(ctx, identity);
    if (!user) return null;
    if (user.isDeleted) return null;

    const resolvedUser = { ...user };

    return buildUserResult(resolvedUser);
  },
});

export const getUserById = query({
  args: { userId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    if (!args.userId) return null;
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const current = await findUserByIdentity(ctx, identity);
    if (!current || !isAdminOnlyUser(current)) return null;

    try {
      const user = await ctx.db.get(args.userId as any);
      return user || null;
    } catch {
      return null;
    }
  },
});

export const listAll = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("users"),
    _creationTime: v.number(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    alternatePhone: v.optional(v.string()),
    birthday: v.optional(v.string()),
    address: v.optional(v.string()),
    preferredContactMethod: v.optional(v.string()),
    profileNotes: v.optional(v.string()),
    lastSeenAt: v.optional(v.number()),
    role: v.optional(v.string()),
    department: v.optional(v.string()),
    staffRole: v.optional(v.string()),
    staffApprovalStatus: v.optional(v.string()),
    accessLevel: v.optional(v.string()),
    image: v.optional(v.string()),
    profileImage: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    isOwner: v.optional(v.boolean()),
    isDeleted: v.optional(v.boolean()),
    workspaceId: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    dealershipLocation: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const current = await findUserByIdentity(ctx, identity);
    if (!current || current.isDeleted) return [];
    if (!isAdminOnlyUser(current)) return [];

    const users = await ctx.db.query("users").collect();
    return users
      .filter((user: any) => !user.isDeleted)
      .map((user: any) => ({
        _id: user._id,
        _creationTime: user._creationTime,
        name: user.name,
        email: user.email,
        phone: user.phone,
        alternatePhone: user.alternatePhone,
        birthday: user.birthday,
        address: user.address,
        preferredContactMethod: user.preferredContactMethod,
        profileNotes: user.profileNotes,
        lastSeenAt: user.lastSeenAt,
        role: user.role,
        department: user.department,
        staffRole: user.staffRole,
        staffApprovalStatus: user.staffApprovalStatus,
        accessLevel: user.accessLevel,
        image: user.image,
        profileImage: user.profileImage,
        displayName: user.displayName,
        bio: user.bio,
        isOwner: user.isOwner,
        isDeleted: user.isDeleted,
        workspaceId: user.workspaceId,
        dealershipId: user.dealershipId,
        dealershipName: user.dealershipName,
        dealershipBrand: user.dealershipBrand,
        dealershipLocation: user.dealershipLocation,
      }));
  },
});

export const listAdminOnly = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("users"),
    _creationTime: v.number(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    alternatePhone: v.optional(v.string()),
    birthday: v.optional(v.string()),
    address: v.optional(v.string()),
    preferredContactMethod: v.optional(v.string()),
    profileNotes: v.optional(v.string()),
    lastSeenAt: v.optional(v.number()),
    role: v.optional(v.string()),
    department: v.optional(v.string()),
    staffRole: v.optional(v.string()),
    staffApprovalStatus: v.optional(v.string()),
    accessLevel: v.optional(v.string()),
    image: v.optional(v.string()),
    profileImage: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    isOwner: v.optional(v.boolean()),
    isDeleted: v.optional(v.boolean()),
    workspaceId: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    dealershipLocation: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const current = await findUserByIdentity(ctx, identity);
    if (!current || current.isDeleted || !isAdminOnlyUser(current)) return [];

    const users = await ctx.db.query("users").collect();
    return users
      .filter((user: any) => !user.isDeleted)
      .map((user: any) => ({
        _id: user._id,
        _creationTime: user._creationTime,
        name: user.name,
        email: user.email,
        phone: user.phone,
        alternatePhone: user.alternatePhone,
        birthday: user.birthday,
        address: user.address,
        preferredContactMethod: user.preferredContactMethod,
        profileNotes: user.profileNotes,
        lastSeenAt: user.lastSeenAt,
        role: user.role,
        department: user.department,
        staffRole: user.staffRole,
        staffApprovalStatus: user.staffApprovalStatus,
        accessLevel: user.accessLevel,
        image: user.image,
        profileImage: user.profileImage,
        displayName: user.displayName,
        bio: user.bio,
        isOwner: user.isOwner,
        isDeleted: user.isDeleted,
        workspaceId: user.workspaceId,
        dealershipId: user.dealershipId,
        dealershipName: user.dealershipName,
        dealershipBrand: user.dealershipBrand,
        dealershipLocation: user.dealershipLocation,
      }));
  },
});

export const listStaffOnly = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("users"),
    _creationTime: v.number(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    alternatePhone: v.optional(v.string()),
    birthday: v.optional(v.string()),
    address: v.optional(v.string()),
    preferredContactMethod: v.optional(v.string()),
    profileNotes: v.optional(v.string()),
    lastSeenAt: v.optional(v.number()),
    role: v.optional(v.string()),
    staffRole: v.optional(v.string()),
    staffApprovalStatus: v.optional(v.string()),
    accessLevel: v.optional(v.string()),
    image: v.optional(v.string()),
    profileImage: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    isOwner: v.optional(v.boolean()),
    isDeleted: v.optional(v.boolean()),
    workspaceId: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    dealershipLocation: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const current = await findUserByIdentity(ctx, identity);
    if (!current || current.isDeleted || !isStaffLikeUser(current)) return [];

    const users = await ctx.db
      .query("users")
      .withIndex("by_role", (q: any) => q.eq("role", "staff"))
      .collect();

    return users.map((user: any) => ({
      _id: user._id,
      _creationTime: user._creationTime,
      name: user.name,
      email: user.email,
      phone: user.phone,
      alternatePhone: user.alternatePhone,
      birthday: user.birthday,
      address: user.address,
      preferredContactMethod: user.preferredContactMethod,
      profileNotes: user.profileNotes,
      lastSeenAt: user.lastSeenAt,
      role: user.role,
      staffRole: user.staffRole,
      staffApprovalStatus: user.staffApprovalStatus,
      accessLevel: user.accessLevel,
      image: user.image,
      profileImage: user.profileImage,
      displayName: user.displayName,
      bio: user.bio,
      isOwner: user.isOwner,
      isDeleted: user.isDeleted,
      workspaceId: user.workspaceId,
      dealershipId: user.dealershipId,
      dealershipName: user.dealershipName,
      dealershipBrand: user.dealershipBrand,
      dealershipLocation: user.dealershipLocation,
    }));
  },
});

export const listAppAccounts = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({
    _id: v.id("users"),
    _creationTime: v.number(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    lastSeenAt: v.optional(v.number()),
    role: v.optional(v.string()),
    staffRole: v.optional(v.string()),
    staffApprovalStatus: v.optional(v.string()),
    accessLevel: v.optional(v.string()),
    image: v.optional(v.string()),
    profileImage: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    dealershipLocation: v.optional(v.string()),
    isOwner: v.optional(v.boolean()),
    isOnline: v.boolean(),
    accountType: v.string(),
  })),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const current = await findUserByIdentity(ctx, identity);
    if (!current || current.isDeleted || !isAdminOnlyUser(current)) return [];

    const limit = Math.max(1, Math.min(args.limit ?? 40, 100));
    const staffUsers = await ctx.db
      .query("users")
      .withIndex("by_role", (q: any) => q.eq("role", "staff"))
      .collect();
    const customerUsers = await ctx.db
      .query("users")
      .withIndex("by_role", (q: any) => q.eq("role", "customer"))
      .collect();

    const combined = [...customerUsers, ...staffUsers]
      .filter((user: any) => user && !user.isDeleted)
      .filter((user: any, index: number, array: any[]) => index === array.findIndex((candidate) => String(candidate._id) === String(user._id)))
      .sort((a: any, b: any) => {
        const aName = String(a.displayName ?? a.name ?? a.email ?? '').toLowerCase();
        const bName = String(b.displayName ?? b.name ?? b.email ?? '').toLowerCase();
        const aRole = String(a.role ?? 'customer');
        const bRole = String(b.role ?? 'customer');
        return aRole.localeCompare(bRole) || aName.localeCompare(bName);
      })
      .slice(0, limit);

    const now = Date.now();
    return combined.map((user: any) => ({
      _id: user._id,
      _creationTime: user._creationTime,
      name: user.name,
      email: user.email,
      phone: user.phone,
      lastSeenAt: user.lastSeenAt,
      role: user.role,
      staffRole: user.staffRole,
      staffApprovalStatus: user.staffApprovalStatus,
      accessLevel: user.accessLevel,
      image: user.image,
      profileImage: user.profileImage,
      displayName: user.displayName,
      bio: user.bio,
      dealershipId: user.dealershipId,
      dealershipName: user.dealershipName,
      dealershipBrand: user.dealershipBrand,
      dealershipLocation: user.dealershipLocation,
      isOwner: user.isOwner,
      isOnline: typeof user.lastSeenAt === 'number' && now - user.lastSeenAt < 120000,
      accountType: user.role === 'staff' ? 'staff' : 'customer',
    }));
  },
});

export const adminSetRoleAccess = mutation({
  args: {
    userId: v.id("users"),
    role: v.string(),
    staffRole: v.optional(v.string()),
    staffApprovalStatus: v.optional(v.string()),
    accessLevel: v.optional(v.string()),
    workspaceId: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    dealershipLocation: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const current = await findUserByIdentity(ctx, identity);
    if (!current || current.isDeleted) throw new Error("Not authorized");
    if (!isAdminOnlyUser(current)) throw new Error("Not authorized");

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User record not found");

    const nextWorkspaceId = String(args.workspaceId ?? "").trim() || String(target.workspaceId ?? "").trim() || getOrCreateWorkspaceId(target);
    await ctx.db.patch(args.userId, {
      role: args.role,
      staffRole: args.staffRole,
      staffApprovalStatus: args.staffApprovalStatus,
      accessLevel: args.accessLevel && isAdminOnlyUser(current) ? args.accessLevel : "limited_access",
      workspaceId: nextWorkspaceId,
      dealershipId: args.dealershipId,
      dealershipName: args.dealershipName,
      dealershipBrand: args.dealershipBrand,
      dealershipLocation: args.dealershipLocation,
      isDeleted: false,
    });
    return null;
  },
});

export const removeUser = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const current = await findUserByIdentity(ctx, identity);
    if (!current || current.isDeleted) throw new Error("Not authorized");
    if (!isAdminOnlyUser(current)) throw new Error("Not authorized");

    const target = await ctx.db.get(args.userId);
    if (!target) return null;

    await ctx.db.patch(args.userId, {
      isDeleted: true,
      role: "customer",
      accessLevel: "limited_access",
      staffApprovalStatus: undefined,
    });
    return null;
  },
});

export const generateProfileUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    phone: v.optional(v.string()),
    alternatePhone: v.optional(v.string()),
    birthday: v.optional(v.string()),
    address: v.optional(v.string()),
    preferredContactMethod: v.optional(v.string()),
    profileNotes: v.optional(v.string()),
    profileImage: v.optional(v.string()),
    profileImageStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");
    const user = viewer.user ?? await findUserByIdentity(ctx, viewer.identity);
    if (!user || user.isDeleted) throw new Error("User record not found");

    const workspaceId = getOrCreateWorkspaceId(user);
    if (user.workspaceId !== workspaceId) {
      await ctx.db.patch(user._id, { workspaceId });
      user.workspaceId = workspaceId;
    }

    const patch: any = { updatedAt: Date.now() };
    if (args.displayName !== undefined) {
      const cleanDisplayName = args.displayName.trim();
      patch.displayName = cleanDisplayName || undefined;
      patch.name = cleanDisplayName || undefined;
    }
    if (args.bio !== undefined) patch.bio = args.bio.trim() || undefined;
    if (args.phone !== undefined) patch.phone = args.phone.trim() || undefined;
    if (args.alternatePhone !== undefined) patch.alternatePhone = args.alternatePhone.trim() || undefined;
    if (args.birthday !== undefined) patch.birthday = args.birthday.trim() || undefined;
    if (args.address !== undefined) patch.address = args.address.trim() || undefined;
    if (args.preferredContactMethod !== undefined) patch.preferredContactMethod = args.preferredContactMethod.trim() || undefined;
    if (args.profileNotes !== undefined) patch.profileNotes = args.profileNotes.trim() || undefined;
    if (args.profileImage !== undefined) {
      patch.profileImage = args.profileImage;
      patch.image = args.profileImage;
    }
    if (args.profileImageStorageId) {
      const imageUrl = await ctx.storage.getUrl(args.profileImageStorageId);
      if (imageUrl) {
        patch.profileImage = imageUrl;
        patch.image = imageUrl;
      }
    }

    await ctx.db.patch(user._id, patch);

    const customerProfile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", String(user._id)))
      .first();
    if (customerProfile && typeof patch.profileImage === "string") {
      await ctx.db.patch(customerProfile._id, { profileImage: patch.profileImage });
    }

    return null;
  },
});

export const setAssignedStaff = mutation({
  args: {
    staffUserId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("Not authenticated");

    const customer = viewer.user ?? await findUserByIdentity(ctx, viewer.identity);
    if (!customer || customer.isDeleted) throw new Error("User record not found");

    const selectedRecord = await ctx.db.get(args.staffUserId);
    if (!selectedRecord) {
      throw new Error("Selected staff member is not valid");
    }

    const selectedEmail = String(selectedRecord.email ?? "").trim().toLowerCase();
    const staffRecord = selectedEmail
      ? await getStaffRecordByEmail(ctx, selectedEmail)
      : null;
    const linkedStaffUser = selectedEmail
      ? await ctx.db
          .query("users")
          .withIndex("email", (q: any) => q.eq("email", selectedEmail))
          .first()
      : null;

    const resolvedStaffUser = linkedStaffUser ?? (String(selectedRecord.role ?? "").trim().toLowerCase() === "staff" ? selectedRecord : null) ?? staffRecord;
    if (!resolvedStaffUser) {
      throw new Error("Selected staff member is not valid");
    }

    const staffWorkspaceId = String(resolvedStaffUser.workspaceId ?? "").trim() || getOrCreateWorkspaceId(resolvedStaffUser);
    if (!resolvedStaffUser.workspaceId) {
      await ctx.db.patch(resolvedStaffUser._id, { workspaceId: staffWorkspaceId });
    }
    const customerWorkspaceId = String(customer.workspaceId ?? "").trim() || getOrCreateWorkspaceId(customer);
    if (!customer.workspaceId) {
      await ctx.db.patch(customer._id, { workspaceId: customerWorkspaceId });
    }

    await ctx.db.patch(customer._id, {
      role: customer.role ?? "customer",
      accessLevel: customer.accessLevel ?? "limited_access",
      isOwner: customer.isOwner ?? false,
      assignedStaffUserId: String(resolvedStaffUser._id),
      assignedStaffName: resolvedStaffUser.displayName ?? resolvedStaffUser.name ?? resolvedStaffUser.email ?? undefined,
      assignedStaffRole: resolvedStaffUser.staffRole ?? resolvedStaffUser.role,
      assignedStaffDealershipId: resolvedStaffUser.dealershipId,
      assignedStaffDealershipName: resolvedStaffUser.dealershipName,
      assignedStaffDealershipBrand: resolvedStaffUser.dealershipBrand,
      assignedStaffDealershipLocation: resolvedStaffUser.dealershipLocation,
      workspaceId: staffWorkspaceId,
      updatedAt: Date.now(),
    });

    const customerProfile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", String(customer._id)))
      .first();
    if (customerProfile) {
      await ctx.db.patch(customerProfile._id, {
        ownerUserId: String(resolvedStaffUser._id),
        assignedToUserId: String(resolvedStaffUser._id),
        assignedToName: resolvedStaffUser.displayName ?? resolvedStaffUser.name ?? resolvedStaffUser.email ?? undefined,
        assignedByUserId: customerProfile.assignedByUserId ?? String(customer._id),
        assignedByName: customerProfile.assignedByName ?? customer.displayName ?? customer.name ?? customer.email ?? undefined,
        dealershipId: resolvedStaffUser.dealershipId ?? customerProfile.dealershipId,
        workspaceId: staffWorkspaceId,
      });
    }

    return null;
  },
});

export const adminUpdateUserProfile = mutation({
  args: {
    userId: v.id("users"),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    phone: v.optional(v.string()),
    alternatePhone: v.optional(v.string()),
    birthday: v.optional(v.string()),
    address: v.optional(v.string()),
    preferredContactMethod: v.optional(v.string()),
    profileNotes: v.optional(v.string()),
    profileImage: v.optional(v.string()),
    profileImageStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const current = await findUserByIdentity(ctx, identity);
    if (!current || current.isDeleted || !isAdminOnlyUser(current)) throw new Error("Not authorized");

    const target = await ctx.db.get(args.userId);
    if (!target || target.isDeleted) throw new Error("User record not found");

    const patch: any = { updatedAt: Date.now() };
    if (args.displayName !== undefined) {
      const cleanDisplayName = args.displayName.trim();
      patch.displayName = cleanDisplayName || undefined;
      patch.name = cleanDisplayName || undefined;
    }
    if (args.bio !== undefined) patch.bio = args.bio.trim() || undefined;
    if (args.phone !== undefined) patch.phone = args.phone.trim() || undefined;
    if (args.alternatePhone !== undefined) patch.alternatePhone = args.alternatePhone.trim() || undefined;
    if (args.birthday !== undefined) patch.birthday = args.birthday.trim() || undefined;
    if (args.address !== undefined) patch.address = args.address.trim() || undefined;
    if (args.preferredContactMethod !== undefined) patch.preferredContactMethod = args.preferredContactMethod.trim() || undefined;
    if (args.profileNotes !== undefined) patch.profileNotes = args.profileNotes.trim() || undefined;
    if (args.profileImage !== undefined) {
      patch.profileImage = args.profileImage;
      patch.image = args.profileImage;
    }
    if (args.profileImageStorageId) {
      const imageUrl = await ctx.storage.getUrl(args.profileImageStorageId);
      if (imageUrl) {
        patch.profileImage = imageUrl;
        patch.image = imageUrl;
      }
    }

    await ctx.db.patch(target._id, patch);

    const customerProfile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", String(target._id)))
      .first();
    if (customerProfile && typeof patch.profileImage === "string") {
      await ctx.db.patch(customerProfile._id, { profileImage: patch.profileImage });
    }

    return null;
  },
});

export const getProfile = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      alternatePhone: v.optional(v.string()),
      birthday: v.optional(v.string()),
      address: v.optional(v.string()),
      preferredContactMethod: v.optional(v.string()),
      profileNotes: v.optional(v.string()),
      lastSeenAt: v.optional(v.number()),
      role: v.optional(v.string()),
      staffRole: v.optional(v.string()),
      staffApprovalStatus: v.optional(v.string()),
      accessLevel: v.optional(v.string()),
      image: v.optional(v.string()),
      profileImage: v.optional(v.string()),
      displayName: v.optional(v.string()),
      bio: v.optional(v.string()),
      isOwner: v.optional(v.boolean()),
      isDeleted: v.optional(v.boolean()),
      workspaceId: v.optional(v.string()),
      dealershipId: v.optional(v.string()),
      dealershipName: v.optional(v.string()),
      dealershipBrand: v.optional(v.string()),
      dealershipLocation: v.optional(v.string()),
      assignedStaffUserId: v.optional(v.string()),
      assignedStaffName: v.optional(v.string()),
      assignedStaffRole: v.optional(v.string()),
      assignedStaffDealershipId: v.optional(v.string()),
      assignedStaffDealershipName: v.optional(v.string()),
      assignedStaffDealershipBrand: v.optional(v.string()),
      assignedStaffDealershipLocation: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const current = await findUserByIdentity(ctx, identity);
    if (!current || !isAdminOnlyUser(current)) return null;

    const user = await ctx.db.get(args.userId);
    if (!user || user.isDeleted) return null;
    return {
      _id: user._id,
      _creationTime: user._creationTime,
      name: user.name,
      email: user.email,
      phone: user.phone,
      alternatePhone: user.alternatePhone,
      birthday: user.birthday,
      address: user.address,
      preferredContactMethod: user.preferredContactMethod,
      profileNotes: user.profileNotes,
      lastSeenAt: user.lastSeenAt,
      role: user.role,
      staffRole: user.staffRole,
      staffApprovalStatus: user.staffApprovalStatus,
      accessLevel: user.accessLevel,
      image: user.image,
      profileImage: user.profileImage,
      displayName: user.displayName,
      bio: user.bio,
      isOwner: user.isOwner,
      isDeleted: user.isDeleted,
      workspaceId: user.workspaceId,
      dealershipId: user.dealershipId,
      dealershipName: user.dealershipName,
      dealershipBrand: user.dealershipBrand,
      dealershipLocation: user.dealershipLocation,
      assignedStaffUserId: user.assignedStaffUserId,
      assignedStaffName: user.assignedStaffName,
      assignedStaffRole: user.assignedStaffRole,
      assignedStaffDealershipId: user.assignedStaffDealershipId,
      assignedStaffDealershipName: user.assignedStaffDealershipName,
      assignedStaffDealershipBrand: user.assignedStaffDealershipBrand,
      assignedStaffDealershipLocation: user.assignedStaffDealershipLocation,
    };
  },
});

export const ensureRole = mutation({
  args: {},
  returns: v.object({
    role: v.string(),
    staffRole: v.optional(v.string()),
    staffApprovalStatus: v.optional(v.string()),
    workspaceId: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    dealershipLocation: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await findUserByIdentity(ctx, identity);
    if (!user) throw new Error("User record not found");

    if (!String(user.workspaceId ?? "").trim()) {
      const workspaceId = getOrCreateWorkspaceId(user);
      await ctx.db.patch(user._id, { workspaceId });
      user.workspaceId = workspaceId;
    }

    const email = (user.email ?? identity.email ?? "").trim().toLowerCase();
    const staffRecord = email ? await getStaffRecordByEmail(ctx, email) : null;
    const staffDealership = staffRecord?.dealershipId ? await getDealershipById(ctx, staffRecord.dealershipId) : null;
    const resolvedDealershipId = staffRecord?.dealershipId ?? (staffDealership?._id ? String(staffDealership._id) : user.dealershipId);
    const resolvedDealershipName = staffRecord?.dealershipName ?? staffDealership?.name ?? user.dealershipName;
    const resolvedDealershipBrand = staffRecord?.dealershipBrand ?? staffDealership?.brand ?? user.dealershipBrand;
    const resolvedDealershipLocation = staffRecord?.dealershipLocation ?? staffDealership?.location ?? user.dealershipLocation;

    if (isVincentAdminEmail(email)) {
      await ctx.db.patch(user._id, {
        role: "staff",
        staffRole: "dp",
        staffApprovalStatus: "approved",
        accessLevel: "full_access",
        isOwner: true,
        isDeleted: false,
        dealershipId: resolvedDealershipId,
        dealershipName: resolvedDealershipName,
        dealershipBrand: resolvedDealershipBrand,
        dealershipLocation: resolvedDealershipLocation,
      });
      return { role: "staff", staffRole: "dp", staffApprovalStatus: "approved", dealershipId: resolvedDealershipId, dealershipName: resolvedDealershipName, dealershipBrand: resolvedDealershipBrand, dealershipLocation: resolvedDealershipLocation };
    }

    if (staffRecord) {
      const staffAccessLevel = String(staffRecord.accessLevel ?? "").trim() || "limited_access";
      const staffApprovalStatus = String(staffRecord.approvalStatus ?? "").trim() || "approved";
      await ctx.db.patch(user._id, {
        role: "staff",
        staffRole: staffRecord.role,
        staffApprovalStatus,
        accessLevel: staffAccessLevel,
        isOwner: false,
        isDeleted: false,
        dealershipId: resolvedDealershipId,
        dealershipName: resolvedDealershipName,
        dealershipBrand: resolvedDealershipBrand,
        dealershipLocation: resolvedDealershipLocation,
      });
      return { role: "staff", staffRole: staffRecord.role, staffApprovalStatus, dealershipId: resolvedDealershipId, dealershipName: resolvedDealershipName, dealershipBrand: resolvedDealershipBrand, dealershipLocation: resolvedDealershipLocation };
    }

    if (user.role) {
      if (!String(user.workspaceId ?? "").trim()) {
        const workspaceId = getOrCreateWorkspaceId(user);
        await ctx.db.patch(user._id, { workspaceId });
        user.workspaceId = workspaceId;
      }
      const result: any = { role: user.role };
      if (typeof user.staffRole === "string") result.staffRole = user.staffRole;
      if (typeof user.staffApprovalStatus === "string") result.staffApprovalStatus = user.staffApprovalStatus;
      if (typeof user.workspaceId === "string") result.workspaceId = user.workspaceId;
      if (typeof user.dealershipId === "string") result.dealershipId = user.dealershipId;
      if (typeof user.dealershipName === "string") result.dealershipName = user.dealershipName;
      if (typeof user.dealershipBrand === "string") result.dealershipBrand = user.dealershipBrand;
      if (typeof user.dealershipLocation === "string") result.dealershipLocation = user.dealershipLocation;
      return result;
    }

    if (isStaffEmail(email)) {
      await ctx.db.patch(user._id, {
        role: "staff",
        staffRole: staffRecord?.role ?? "service_advisor",
        staffApprovalStatus: "pending",
        accessLevel: "limited_access",
        isOwner: false,
        dealershipId: resolvedDealershipId,
        dealershipName: resolvedDealershipName,
        dealershipBrand: resolvedDealershipBrand,
        dealershipLocation: resolvedDealershipLocation,
      });
      return { role: "staff", staffRole: staffRecord?.role ?? "service_advisor", staffApprovalStatus: "pending", dealershipId: resolvedDealershipId, dealershipName: resolvedDealershipName, dealershipBrand: resolvedDealershipBrand, dealershipLocation: resolvedDealershipLocation };
    }

    await ctx.db.patch(user._id, { role: "customer", accessLevel: "limited_access", isOwner: false });
    await ctx.runMutation(internal.notifications.notifyActivity, {
      type: 'new_user',
      title: 'New user registered',
      message: `${user.displayName || user.name || user.email || 'A user'} joined the app.`,
    });
    return { role: "customer" };
  },
});

export const setMyDealership = mutation({
  args: {
    dealershipId: v.id("dealerships"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await findUserByIdentity(ctx, identity);
    if (!user || user.isDeleted) throw new Error("User record not found");
    const dealership = await getDealershipById(ctx, args.dealershipId);
    if (!dealership) throw new Error("Dealership not found");

    const patch = {
      dealershipId: String(dealership._id),
      dealershipName: dealership.name,
      dealershipBrand: dealership.brand,
      dealershipLocation: dealership.location,
    };

    await ctx.db.patch(user._id, patch);

    const staffRecord = await getStaffRecordByEmail(ctx, String(user.email ?? identity.email ?? "").trim().toLowerCase());
    if (staffRecord) {
      await ctx.db.patch(staffRecord._id, patch);
    }

    return null;
  },
});

export const savePushToken = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await findUserByIdentity(ctx, identity);
    if (user) {
      await ctx.db.patch(user._id, { pushToken: args.token });
    }
    return null;
  },
});

export const adminFixRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.string(),
    staffRole: v.optional(v.string()),
    staffApprovalStatus: v.optional(v.string()),
    accessLevel: v.optional(v.string()),
    workspaceId: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    dealershipLocation: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const current = await findUserByIdentity(ctx, identity);
    if (!current || current.isDeleted || !isAdminOnlyUser(current)) throw new Error("Not authorized");

    const patch: any = { role: args.role };
    if (args.staffRole) patch.staffRole = args.staffRole;
    if (args.staffApprovalStatus) patch.staffApprovalStatus = args.staffApprovalStatus;
    if (args.accessLevel) patch.accessLevel = args.accessLevel;
    if (args.workspaceId) patch.workspaceId = args.workspaceId;
    if (args.dealershipId) patch.dealershipId = args.dealershipId;
    if (args.dealershipName) patch.dealershipName = args.dealershipName;
    if (args.dealershipBrand) patch.dealershipBrand = args.dealershipBrand;
    if (args.dealershipLocation) patch.dealershipLocation = args.dealershipLocation;
    patch.workspaceId = String(args.workspaceId ?? "").trim() || getOrCreateWorkspaceId(await ctx.db.get(args.userId));
    await ctx.db.patch(args.userId, patch);
    return null;
  },
});

export const touchPresence = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await findUserByIdentity(ctx, identity);
    if (!user || user.isDeleted) return null;
    await ctx.db.patch(user._id, { lastSeenAt: Date.now() });
    return null;
  },
});