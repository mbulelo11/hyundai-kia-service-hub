import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getViewer, isVincentAdminEmail } from "./auth";

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";

function isAdminLike(user: any) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  return Boolean(email === VINCENT_ADMIN_EMAIL);
}

async function getCurrentUser(ctx: any) {
  const viewer = await getViewer(ctx);
  if (viewer?.user && !viewer.user.isDeleted) {
    return {
      identity: viewer.identity,
      user: viewer.user,
      userId: viewer.userId,
      isAdminLike: isAdminLike(viewer.user) || viewer.isElevated,
    };
  }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const email = String(identity.email ?? "").trim().toLowerCase();
  if (isVincentAdminEmail(email)) {
    return {
      identity,
      user: { email, isOwner: true, staffRole: "dp", accessLevel: "full_access" },
      userId: email,
      isAdminLike: true,
    };
  }
  return null;
}

function requireDealershipAdmin(current: any) {
  if (!current || !current.isAdminLike) throw new Error("Not authorized");
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : undefined;
}

function buildDealershipPatch(args: {
  name?: string;
  brand?: string;
  location?: string;
  city?: string;
  province?: string;
  address?: string;
  phone?: string;
  contactEmail?: string;
  backgroundImageUrl?: string;
  latitude?: number;
  longitude?: number;
  isActive?: boolean;
}, requireCoreFields: boolean = false) {
  const patch: Record<string, any> = {};
  const name = cleanText(args.name);
  const brand = cleanText(args.brand);
  const location = cleanText(args.location);

  if (requireCoreFields && (!name || !brand || !location)) {
    throw new Error('Dealership name, brand, and location are required');
  }

  const city = cleanText(args.city);
  const province = cleanText(args.province);
  const address = cleanText(args.address);
  const phone = cleanText(args.phone);
  const contactEmail = cleanText(args.contactEmail)?.toLowerCase();
  const backgroundImageUrl = cleanText(args.backgroundImageUrl);

  if (name !== undefined) patch.name = name;
  if (brand !== undefined) patch.brand = brand;
  if (location !== undefined) patch.location = location;
  if (city !== undefined) patch.city = city;
  if (province !== undefined) patch.province = province;
  if (address !== undefined) patch.address = address;
  if (phone !== undefined) patch.phone = phone;
  if (contactEmail !== undefined) patch.contactEmail = contactEmail;
  if (backgroundImageUrl !== undefined) patch.backgroundImageUrl = backgroundImageUrl;
  if (typeof args.latitude === "number") patch.latitude = args.latitude;
  if (typeof args.longitude === "number") patch.longitude = args.longitude;
  if (typeof args.isActive === "boolean") patch.isActive = args.isActive;
  return patch;
}

function dealerViewFromRecord(dealership: any, dealershipStaff: any[], onlineStaff: any[]) {
  return {
    _id: dealership._id,
    _creationTime: dealership._creationTime,
    name: dealership.name,
    brand: dealership.brand,
    location: dealership.location,
    city: dealership.city,
    province: dealership.province,
    address: dealership.address,
    phone: dealership.phone,
    contactEmail: dealership.contactEmail,
    backgroundImageUrl: dealership.backgroundImageUrl,
    latitude: dealership.latitude,
    longitude: dealership.longitude,
    isActive: dealership.isActive !== false,
    onlineStaffCount: onlineStaff.length,
    staffCount: dealershipStaff.length,
    onlineStaff,
  };
}

async function loadDealershipViews(ctx: any) {
  const dealerships = await ctx.db.query("dealerships").collect();
  const staff = await ctx.db.query("staff").collect();
  const users = await ctx.db.query("users").collect();
  const now = Date.now();

  return dealerships
    .filter((dealership: any) => dealership.isActive !== false)
    .map((dealership: any) => {
      const dealershipStaff = staff.filter((member: any) => {
        const memberDealershipId = String(member.dealershipId ?? "");
        const memberDealershipName = String(member.dealershipName ?? "").trim().toLowerCase();
        return memberDealershipId === String(dealership._id) || memberDealershipName === String(dealership.name ?? "").trim().toLowerCase();
      });

      const onlineStaff = dealershipStaff
        .map((member: any) => {
          const linkedUser = users.find((u: any) => String(u.email ?? "").trim().toLowerCase() === String(member.email ?? "").trim().toLowerCase());
          const lastSeenAt = linkedUser?.lastSeenAt;
          const isOnline = typeof lastSeenAt === "number" && now - lastSeenAt < 120000;
          return {
            staffId: String(member._id),
            userId: linkedUser ? String(linkedUser._id) : undefined,
            name: member.name,
            role: member.role,
            profileImage: linkedUser?.profileImage ?? linkedUser?.image,
            phone: member.phone ?? linkedUser?.phone,
            lastSeenAt,
            isOnline,
            dealershipId: String(dealership._id),
            dealershipName: dealership.name,
            dealershipBrand: dealership.brand,
            dealershipLocation: dealership.location,
          };
        })
        .filter((member: any) => member.isOnline)
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

      return dealerViewFromRecord(dealership, dealershipStaff, onlineStaff);
    })
    .sort((a: any, b: any) => Number(b.onlineStaffCount > 0) - Number(a.onlineStaffCount > 0) || b.onlineStaffCount - a.onlineStaffCount || a.name.localeCompare(b.name));
}

export const listPublicAvailable = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("dealerships"),
    _creationTime: v.number(),
    name: v.string(),
    brand: v.string(),
    location: v.string(),
    city: v.optional(v.string()),
    province: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    backgroundImageUrl: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    isActive: v.boolean(),
    onlineStaffCount: v.number(),
    staffCount: v.number(),
    onlineStaff: v.array(v.object({
      staffId: v.string(),
      userId: v.optional(v.string()),
      name: v.string(),
      role: v.string(),
      profileImage: v.optional(v.string()),
      phone: v.optional(v.string()),
      lastSeenAt: v.optional(v.number()),
      isOnline: v.boolean(),
      dealershipId: v.string(),
      dealershipName: v.string(),
      dealershipBrand: v.string(),
      dealershipLocation: v.string(),
    })),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    return await loadDealershipViews(ctx);
  },
});

export const listSignupOptions = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("dealerships"),
    _creationTime: v.number(),
    name: v.string(),
    brand: v.string(),
    location: v.string(),
    city: v.optional(v.string()),
    province: v.optional(v.string()),
    backgroundImageUrl: v.optional(v.string()),
    isActive: v.boolean(),
  })),
  handler: async (ctx) => {
    const dealerships = await ctx.db.query("dealerships").collect();
    return dealerships
      .filter((dealership: any) => dealership.isActive !== false)
      .sort((a: any, b: any) => a.name.localeCompare(b.name))
      .map((dealership: any) => ({
        _id: dealership._id,
        _creationTime: dealership._creationTime,
        name: dealership.name,
        brand: dealership.brand,
        location: dealership.location,
        city: dealership.city,
        province: dealership.province,
        backgroundImageUrl: dealership.backgroundImageUrl,
        isActive: dealership.isActive !== false,
      }));
  },
});

export const generateBackgroundUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    requireDealershipAdmin(current);
    return await ctx.storage.generateUploadUrl();
  },
});

export const createSignupDealership = mutation({
  args: {
    name: v.string(),
    brand: v.string(),
    location: v.string(),
    city: v.optional(v.string()),
    province: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    backgroundImageStorageId: v.optional(v.id("_storage")),
  },
  returns: v.id("dealerships"),
  handler: async (ctx, args) => {
    const normalizedName = cleanText(args.name);
    const normalizedBrand = cleanText(args.brand);
    const normalizedLocation = cleanText(args.location);
    if (!normalizedName || !normalizedBrand || !normalizedLocation) {
      throw new Error('Dealership name, brand, and location are required');
    }

    const backgroundImageUrl = args.backgroundImageStorageId ? await ctx.storage.getUrl(args.backgroundImageStorageId) : undefined;

    return await ctx.db.insert("dealerships", {
      name: normalizedName,
      brand: normalizedBrand,
      location: normalizedLocation,
      city: cleanText(args.city),
      province: cleanText(args.province),
      address: cleanText(args.address),
      phone: cleanText(args.phone),
      contactEmail: cleanText(args.contactEmail)?.toLowerCase(),
      backgroundImageUrl: backgroundImageUrl ?? undefined,
      isActive: true,
    });
  },
});

export const listAll = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("dealerships"),
    _creationTime: v.number(),
    name: v.string(),
    brand: v.string(),
    location: v.string(),
    city: v.optional(v.string()),
    province: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    backgroundImageUrl: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    isActive: v.boolean(),
    onlineStaffCount: v.number(),
    staffCount: v.number(),
    onlineStaff: v.array(v.object({
      staffId: v.string(),
      userId: v.optional(v.string()),
      name: v.string(),
      role: v.string(),
      profileImage: v.optional(v.string()),
      phone: v.optional(v.string()),
      lastSeenAt: v.optional(v.number()),
      isOnline: v.boolean(),
      dealershipId: v.string(),
      dealershipName: v.string(),
      dealershipBrand: v.string(),
      dealershipLocation: v.string(),
    })),
  })),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current || !current.isAdminLike) return [];
    return await loadDealershipViews(ctx);
  },
});

export const add = mutation({
  args: {
    name: v.string(),
    brand: v.string(),
    location: v.string(),
    city: v.optional(v.string()),
    province: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    backgroundImageStorageId: v.optional(v.id("_storage")),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
  },
  returns: v.id("dealerships"),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    requireDealershipAdmin(current);

    const normalizedName = cleanText(args.name);
    const normalizedBrand = cleanText(args.brand);
    const normalizedLocation = cleanText(args.location);
    if (!normalizedName || !normalizedBrand || !normalizedLocation) {
      throw new Error('Dealership name, brand, and location are required');
    }

    const backgroundImageUrl = args.backgroundImageStorageId ? await ctx.storage.getUrl(args.backgroundImageStorageId) : undefined;
    const dealershipId = await ctx.db.insert("dealerships", {
      name: normalizedName,
      brand: normalizedBrand,
      location: normalizedLocation,
      city: cleanText(args.city),
      province: cleanText(args.province),
      address: cleanText(args.address),
      phone: cleanText(args.phone),
      contactEmail: cleanText(args.contactEmail)?.toLowerCase(),
      backgroundImageUrl: backgroundImageUrl ?? undefined,
      latitude: args.latitude,
      longitude: args.longitude,
      isActive: true,
    });

    return dealershipId;
  },
});

export const update = mutation({
  args: {
    dealershipId: v.id("dealerships"),
    name: v.optional(v.string()),
    brand: v.optional(v.string()),
    location: v.optional(v.string()),
    city: v.optional(v.string()),
    province: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    backgroundImageStorageId: v.optional(v.id("_storage")),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    requireDealershipAdmin(current);

    const dealership = await ctx.db.get(args.dealershipId);
    if (!dealership) throw new Error("Dealership not found");

    const patch = buildDealershipPatch({
      name: args.name,
      brand: args.brand,
      location: args.location,
      city: args.city,
      province: args.province,
      address: args.address,
      phone: args.phone,
      contactEmail: args.contactEmail,
      backgroundImageUrl: args.backgroundImageStorageId ? await ctx.storage.getUrl(args.backgroundImageStorageId) ?? undefined : undefined,
      latitude: args.latitude,
      longitude: args.longitude,
      isActive: args.isActive,
    });

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.dealershipId, patch);
    }
    return null;
  },
});

export const assignStaff = mutation({
  args: {
    staffId: v.id("staff"),
    dealershipId: v.id("dealerships"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    requireDealershipAdmin(current);

    const staffMember = await ctx.db.get(args.staffId);
    const dealership = await ctx.db.get(args.dealershipId);
    if (!staffMember || !dealership) throw new Error("Record not found");

    const dealershipFields = {
      dealershipId: String(dealership._id),
      dealershipName: dealership.name,
      dealershipBrand: dealership.brand,
      dealershipLocation: dealership.location,
    };

    await ctx.db.patch(args.staffId, dealershipFields);

    const linkedUser = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", String(staffMember.email ?? "").trim().toLowerCase()))
      .first();

    if (linkedUser) {
      await ctx.db.patch(linkedUser._id, {
        ...dealershipFields,
        role: "staff",
        staffRole: staffMember.role,
        staffApprovalStatus: staffMember.approvalStatus ?? "approved",
        accessLevel: staffMember.accessLevel ?? linkedUser.accessLevel ?? "limited_access",
        isDeleted: false,
      });
    }

    const staffUser = linkedUser ?? await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", String(staffMember.email ?? "").trim().toLowerCase()))
      .first();

    if (!staffUser) {
      const matchingStaffUsers = await ctx.db.query("users").collect();
      const userByEmail = matchingStaffUsers.find((user: any) => String(user.email ?? "").trim().toLowerCase() === String(staffMember.email ?? "").trim().toLowerCase());
      if (userByEmail) {
        await ctx.db.patch(userByEmail._id, {
          ...dealershipFields,
          role: "staff",
          staffRole: staffMember.role,
          staffApprovalStatus: staffMember.approvalStatus ?? "approved",
          accessLevel: staffMember.accessLevel ?? "limited_access",
          isDeleted: false,
        });
      }
    }

    return null;
  },
});

export const resolveForRequest = query({
  args: {
    brand: v.optional(v.string()),
    location: v.optional(v.string()),
    city: v.optional(v.string()),
    province: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.object({
    _id: v.id("dealerships"),
    name: v.string(),
    brand: v.string(),
    location: v.string(),
    city: v.optional(v.string()),
    province: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    backgroundImageUrl: v.optional(v.string()),
    onlineStaffCount: v.number(),
  })),
  handler: async (ctx, args) => {
    const dealerships = await loadDealershipViews(ctx);
    if (!dealerships.length) return null;

    const brand = String(args.brand ?? "").trim().toLowerCase();
    const location = String(args.location ?? "").trim().toLowerCase();
    const city = String(args.city ?? "").trim().toLowerCase();
    const province = String(args.province ?? "").trim().toLowerCase();

    const scored = dealerships.map((dealership: any) => {
      let score = 0;
      const haystack = [dealership.name, dealership.brand, dealership.location, dealership.city, dealership.province, dealership.address].filter(Boolean).join(" ").toLowerCase();
      if (brand && haystack.includes(brand)) score += 4;
      if (location && haystack.includes(location)) score += 3;
      if (city && String(dealership.city ?? "").toLowerCase() === city) score += 3;
      if (province && String(dealership.province ?? "").toLowerCase() === province) score += 2;
      score += dealership.onlineStaffCount > 0 ? 2 : 0;
      return { dealership, score };
    });

    scored.sort((a: any, b: any) => b.score - a.score || b.dealership.onlineStaffCount - a.dealership.onlineStaffCount || a.dealership.name.localeCompare(b.dealership.name));
    const best = scored[0]?.dealership;
    if (!best) return null;
    return {
      _id: best._id,
      name: best.name,
      brand: best.brand,
      location: best.location,
      city: best.city,
      province: best.province,
      address: best.address,
      phone: best.phone,
      contactEmail: best.contactEmail,
      backgroundImageUrl: best.backgroundImageUrl,
      onlineStaffCount: best.onlineStaffCount,
    };
  },
});