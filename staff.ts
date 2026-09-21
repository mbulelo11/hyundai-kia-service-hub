import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";
const SERVICE_MANAGER_ROLES = ["service_manager", "workshop_manager"];
const TECHNICIAN_ROLES = ["technician", "motor_technician", "diagnostic_technician"];
const PARTS_MANAGER_ROLES = ["parts_manager", "parts_accessories_manager", "parts_and_accessories_manager", "parts_accessory_manager", "parts_accessories"];
const ACCESSORIES_MANAGER_ROLES = ["accessories_manager", "parts_accessories_manager", "parts_and_accessories_manager", "parts_accessory_manager", "parts_accessories"];
const MERCHANDISE_MANAGER_ROLES = ["merchandise_manager"];

function isAdminLikeUser(user: any) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  return Boolean(user?.isOwner || email === VINCENT_ADMIN_EMAIL || user?.staffRole === "dp");
}

function isServiceStaffRole(role: string) {
  return ["service_advisor", ...SERVICE_MANAGER_ROLES].includes(String(role ?? "").trim().toLowerCase());
}

function isTechnicianStaffRole(role: string) {
  return TECHNICIAN_ROLES.includes(String(role ?? "").trim().toLowerCase());
}

function isServiceAdvisorRole(role: string) {
  return String(role ?? "").trim().toLowerCase() === "service_advisor";
}

function isSalesStaffRole(role: string) {
  return ["sales_executive", "sales_manager", "sales"].includes(String(role ?? "").trim().toLowerCase());
}

function isFinanceStaffRole(role: string) {
  return ["sales_executive"].includes(String(role ?? "").trim().toLowerCase());
}

async function findUserByIdentity(ctx: any, identity: any) {
  if (identity?.subject) {
    try {
      const subjectDoc: any = await ctx.db.get(identity.subject);
      if (subjectDoc?.userId) {
        const nested = await ctx.db.get(subjectDoc.userId);
        if (nested) return nested;
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
      try {
        const tokenDoc: any = await ctx.db.get(possibleId);
        if (tokenDoc?.userId) {
          const nested = await ctx.db.get(tokenDoc.userId);
          if (nested) return nested;
        }
        if (tokenDoc?.email || tokenDoc?.role) return tokenDoc;
      } catch {}
    }
  }

  return null;
}

async function resolveCurrentUserFromIdentity(ctx: any, identity: any) {
  return await findUserByIdentity(ctx, identity);
}

function getStaffRoleKey(user: any) {
  const role = user?.staffRole ?? user?.role;
  if (role) {
    return String(role).trim().toLowerCase();
  }
  return "unknown";
}

function isModeratorUser(user: any) {
  return user?.staffRole === "admin" || user?.staffRole === "moderator";
}

function getStaffQuickActions(user: any) {
  const isModerator = isModeratorUser(user);
  const roleKey = getStaffRoleKey(user);

  if (isModerator) {
    return STAFF_QUICK_ACTIONS.filter((item) => !item.moderatorOnly || isModerator);
  }

  if (roleKey === 'sales' || roleKey === 'sales_executive') {
    return STAFF_QUICK_ACTIONS.filter((item) => item.key === 'customerDatabase');
  }

  return STAFF_QUICK_ACTIONS.filter((item) => item.key === 'staffManagement' || item.key === 'customerDatabase' || !item.moderatorOnly);
}

type StaffQuickAction = {
  key: string;
  label: string;
  description: string;
  icon: string;
  moderatorOnly: boolean;
};

const staffReturnValidator = v.object({
  _id: v.id("staff"),
  _creationTime: v.number(),
  name: v.string(),
  email: v.string(),
  phone: v.optional(v.string()),
  role: v.string(),
  dealershipId: v.optional(v.string()),
  dealershipName: v.optional(v.string()),
  dealershipBrand: v.optional(v.string()),
  dealershipLocation: v.optional(v.string()),
  approvalStatus: v.optional(v.string()),
  accessLevel: v.optional(v.string()),
  isActive: v.boolean(),
});

function mapStaffRow(s: any) {
  return {
    _id: s._id,
    _creationTime: s._creationTime,
    name: s.name,
    email: s.email,
    phone: s.phone,
    role: s.role,
    dealershipId: s.dealershipId,
    dealershipName: s.dealershipName,
    dealershipBrand: s.dealershipBrand,
    dealershipLocation: s.dealershipLocation,
    approvalStatus: s.approvalStatus,
    accessLevel: s.accessLevel,
    isActive: s.isActive,
  };
}

function buildOnlineStaffResponse(staff: any[], users: any[], rolePredicate: (role: string) => boolean) {
  const now = Date.now();
  return staff
    .filter((member: any) => member.isActive && rolePredicate(member.role))
    .map((member: any) => {
      const linkedUser = users.find((u: any) => String(u.email ?? "").trim().toLowerCase() === String(member.email ?? "").trim().toLowerCase());
      const lastSeenAt = linkedUser?.lastSeenAt;
      return {
        staffId: String(member._id),
        name: member.name,
        role: member.role,
        phone: member.phone ?? linkedUser?.phone,
        userId: linkedUser ? String(linkedUser._id) : undefined,
        isOnline: typeof lastSeenAt === 'number' && now - lastSeenAt < 120000,
        isActive: Boolean(member.isActive),
        dealershipId: member.dealershipId ?? linkedUser?.dealershipId,
        dealershipName: member.dealershipName ?? linkedUser?.dealershipName,
        dealershipBrand: member.dealershipBrand ?? linkedUser?.dealershipBrand,
        dealershipLocation: member.dealershipLocation ?? linkedUser?.dealershipLocation,
      };
    })
    .sort((a: any, b: any) => Number(b.isOnline) - Number(a.isOnline) || a.name.localeCompare(b.name));
}

function expandUniversalStaffForDealerships(member: any, linkedUser: any, dealerships: any[]) {
  const isVincent = String(member.email ?? "").trim().toLowerCase() === VINCENT_ADMIN_EMAIL || String(member.name ?? "").trim().toLowerCase() === "mbulelo vincent mayoyo";
  if (!isVincent) {
    return [{
      staffId: String(member._id),
      name: member.name,
      role: member.role,
      userId: linkedUser ? String(linkedUser._id) : undefined,
      isOnline: typeof linkedUser?.lastSeenAt === 'number' && Date.now() - linkedUser.lastSeenAt < 120000,
      isActive: Boolean(member.isActive),
      dealershipId: member.dealershipId ?? linkedUser?.dealershipId,
      dealershipName: member.dealershipName ?? linkedUser?.dealershipName,
      dealershipBrand: member.dealershipBrand ?? linkedUser?.dealershipBrand,
      dealershipLocation: member.dealershipLocation ?? linkedUser?.dealershipLocation,
    }];
  }

  const activeDealerships = dealerships.filter((dealership: any) => dealership.isActive);
  if (!activeDealerships.length) {
    return [{
      staffId: String(member._id),
      name: member.name,
      role: member.role,
      userId: linkedUser ? String(linkedUser._id) : undefined,
      isOnline: typeof linkedUser?.lastSeenAt === 'number' && Date.now() - linkedUser.lastSeenAt < 120000,
      isActive: true,
      dealershipId: member.dealershipId ?? linkedUser?.dealershipId,
      dealershipName: member.dealershipName ?? linkedUser?.dealershipName,
      dealershipBrand: member.dealershipBrand ?? linkedUser?.dealershipBrand,
      dealershipLocation: member.dealershipLocation ?? linkedUser?.dealershipLocation,
    }];
  }

  return activeDealerships.map((dealership: any) => ({
    staffId: String(member._id),
    name: member.name,
    role: member.role,
    userId: linkedUser ? String(linkedUser._id) : undefined,
    isOnline: typeof linkedUser?.lastSeenAt === 'number' && Date.now() - linkedUser.lastSeenAt < 120000,
    isActive: true,
    dealershipId: String(dealership._id),
    dealershipName: dealership.name,
    dealershipBrand: dealership.brand,
    dealershipLocation: dealership.location,
  }));
}

export const add = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    role: v.string(),
    approvalStatus: v.optional(v.string()),
    accessLevel: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    dealershipLocation: v.optional(v.string()),
  },
  returns: v.id("staff"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const current = await findUserByIdentity(ctx, identity);
    if (!current || !isAdminLikeUser(current)) throw new Error("Not authorized");

    const normalizedEmail = args.email.trim().toLowerCase();
    const existingStaff = await ctx.db
      .query("staff")
      .withIndex("by_email", (q: any) => q.eq("email", normalizedEmail))
      .first();

    const payload = {
      name: args.name.trim(),
      email: normalizedEmail,
      phone: args.phone?.trim() || undefined,
      role: args.role,
      dealershipId: args.dealershipId?.trim() || undefined,
      dealershipName: args.dealershipName?.trim() || undefined,
      dealershipBrand: args.dealershipBrand?.trim() || undefined,
      dealershipLocation: args.dealershipLocation?.trim() || undefined,
      approvalStatus: args.approvalStatus ?? "pending",
      accessLevel: args.accessLevel ?? "limited_access",
      isActive: true,
    };

    const staffId = existingStaff
      ? (await ctx.db.patch(existingStaff._id, payload), existingStaff._id)
      : await ctx.db.insert("staff", payload);

    const linkedUser = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", normalizedEmail))
      .first();

    if (linkedUser) {
      await ctx.db.patch(linkedUser._id, {
        role: "staff",
        staffRole: args.role,
        staffApprovalStatus: "approved",
        accessLevel: args.accessLevel ?? linkedUser.accessLevel ?? "limited_access",
        dealershipId: args.dealershipId?.trim() || linkedUser.dealershipId,
        dealershipName: args.dealershipName?.trim() || linkedUser.dealershipName,
        dealershipBrand: args.dealershipBrand?.trim() || linkedUser.dealershipBrand,
        dealershipLocation: args.dealershipLocation?.trim() || linkedUser.dealershipLocation,
        isDeleted: false,
      });
    }

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: String(current._id),
      type: "customer_added",
      title: "Staff Added",
      description: `${args.name.trim()} was added as ${args.role.replace(/_/g, ' ')}`,
      customerName: args.name.trim(),
      customerPhone: args.phone?.trim(),
      metadata: JSON.stringify({ email: normalizedEmail, role: args.role, staffId: String(staffId) }),
      triggeredBy: String(current._id),
    });

    return staffId;
  },
});

export const toggleActive = mutation({
  args: { staffId: v.id("staff") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const current = await findUserByIdentity(ctx, identity);
    if (!current || !isAdminLikeUser(current)) throw new Error("Not authorized");

    const staff = await ctx.db.get(args.staffId);
    if (!staff) throw new Error("Staff member not found");

    await ctx.db.patch(args.staffId, { isActive: !staff.isActive });
    return null;
  },
});

export const remove = mutation({
  args: { staffId: v.id("staff") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const current = await findUserByIdentity(ctx, identity);
    if (!current || !isAdminLikeUser(current)) throw new Error("Not authorized");

    const staff = await ctx.db.get(args.staffId);
    if (!staff) throw new Error("Staff member not found");

    const linkedUser = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", String(staff.email ?? "").trim().toLowerCase()))
      .first();
    if (linkedUser) {
      await ctx.db.patch(linkedUser._id, {
        isDeleted: true,
        role: "customer",
        staffRole: undefined,
        staffApprovalStatus: "removed",
      });
    }

    await ctx.db.delete(args.staffId);
    return null;
  },
});

export const list = query({
  args: {},
  returns: v.array(staffReturnValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const staff = await ctx.db.query("staff").order("desc").collect();
    return staff.map(mapStaffRow);
  },
});

export const listByRole = query({
  args: { role: v.string() },
  returns: v.array(staffReturnValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const staff = await ctx.db
      .query("staff")
      .withIndex("by_role", (q: any) => q.eq("role", args.role))
      .collect();
    return staff
      .filter((s: any) => s.isActive)
      .map(mapStaffRow);
  },
});

export const listActive = query({
  args: {},
  returns: v.array(staffReturnValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const staff = await ctx.db.query("staff").collect();
    return staff
      .filter((s: any) => s.isActive)
      .map(mapStaffRow);
  },
});

export const listActiveWithUsers = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("staff"),
    _creationTime: v.number(),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    role: v.string(),
    approvalStatus: v.optional(v.string()),
    accessLevel: v.optional(v.string()),
    isActive: v.boolean(),
    userId: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const staff = await ctx.db.query("staff").collect();
    const activeStaff = staff.filter((s: any) => s.isActive);
    const users = await ctx.db.query("users").collect();

    return activeStaff.map((s: any) => {
      const linkedUser = users.find((u: any) => String(u.email ?? "").trim().toLowerCase() === String(s.email ?? "").trim().toLowerCase());
      return {
        _id: s._id,
        _creationTime: s._creationTime,
        name: s.name,
        email: s.email,
        phone: s.phone,
        role: s.role,
        approvalStatus: s.approvalStatus,
        accessLevel: s.accessLevel,
        isActive: s.isActive,
        userId: linkedUser ? String(linkedUser._id) : undefined,
      };
    });
  },
});

export const publicAvailableStaff = query({
  args: {},
  handler: async (ctx) => {
    const staff = await ctx.db.query("staff").collect();
    const users = await ctx.db.query("users").collect();
    const now = Date.now();

    return staff
      .filter((member: any) => member.isActive && (isServiceAdvisorRole(member.role) || isSalesStaffRole(member.role)))
      .map((member: any) => {
        const linkedUser = users.find((u: any) => String(u.email ?? "").trim().toLowerCase() === String(member.email ?? "").trim().toLowerCase());
        const lastSeenAt = linkedUser?.lastSeenAt;
        return {
          staffId: String(member._id),
          name: member.name,
          role: member.role,
          phone: member.phone ?? linkedUser?.phone,
          userId: linkedUser ? String(linkedUser._id) : undefined,
          isOnline: typeof lastSeenAt === 'number' && now - lastSeenAt < 120000,
          isActive: Boolean(member.isActive),
          dealershipId: member.dealershipId ?? linkedUser?.dealershipId,
          dealershipName: member.dealershipName ?? linkedUser?.dealershipName,
          dealershipBrand: member.dealershipBrand ?? linkedUser?.dealershipBrand,
          dealershipLocation: member.dealershipLocation ?? linkedUser?.dealershipLocation,
        };
      })
      .sort((a: any, b: any) => Number(b.isOnline) - Number(a.isOnline) || a.name.localeCompare(b.name));
  },
});

export const publicOnlineServiceStaff = query({
  args: {},
  returns: v.array(v.object({
    staffId: v.optional(v.string()),
    name: v.string(),
    role: v.string(),
    phone: v.optional(v.string()),
    userId: v.optional(v.string()),
    isOnline: v.boolean(),
    isActive: v.boolean(),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    dealershipLocation: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const current = await resolveCurrentUserFromIdentity(ctx, identity);
    if (!current || current.isDeleted || !(isAdminLikeUser(current) || isServiceStaffRole(current.staffRole ?? current.role) || isSalesStaffRole(current.staffRole ?? current.role))) return [];

    const staff = await ctx.db.query("staff").collect();
    const users = await ctx.db.query("users").collect();
    return buildOnlineStaffResponse(staff, users, isServiceStaffRole);
  },
});

export const publicOnlineSalesAndServiceStaff = query({
  args: {},
  returns: v.array(v.object({
    staffId: v.optional(v.string()),
    name: v.string(),
    role: v.string(),
    phone: v.optional(v.string()),
    userId: v.optional(v.string()),
    isOnline: v.boolean(),
    isActive: v.boolean(),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    dealershipLocation: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const current = await resolveCurrentUserFromIdentity(ctx, identity);
    if (!current || current.isDeleted || !(isAdminLikeUser(current) || isServiceStaffRole(current.staffRole ?? current.role) || isSalesStaffRole(current.staffRole ?? current.role))) return [];

    const staff = await ctx.db.query("staff").collect();
    const users = await ctx.db.query("users").collect();
    return buildOnlineStaffResponse(staff, users, (role: string) => isServiceStaffRole(role) || isSalesStaffRole(role));
  },
});

export const publicOnlineFinanceStaff = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const current = await resolveCurrentUserFromIdentity(ctx, identity);
    if (!current || current.isDeleted || !(isAdminLikeUser(current) || isSalesStaffRole(current.staffRole ?? current.role))) return [];

    const staff = await ctx.db.query("staff").collect();
    const users = await ctx.db.query("users").collect();
    return buildOnlineStaffResponse(staff, users, isSalesStaffRole);
  },
});

export const publicOnlineTechnicians = query({
  args: {},
  returns: v.array(v.object({
    staffId: v.optional(v.string()),
    name: v.string(),
    role: v.string(),
    userId: v.optional(v.string()),
    isOnline: v.boolean(),
    isActive: v.boolean(),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    dealershipLocation: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const current = await resolveCurrentUserFromIdentity(ctx, identity);
    if (!current || current.isDeleted || !(isAdminLikeUser(current) || isServiceStaffRole(current.staffRole ?? current.role))) return [];

    const staff = await ctx.db.query("staff").collect();
    const users = await ctx.db.query("users").collect();
    return buildOnlineStaffResponse(staff, users, isTechnicianStaffRole);
  },
});

type StaffSectionKey = 'staffMain' | 'staffProfile' | 'inbox' | 'notifications' | 'socialFeed' | 'customerDatabase' | 'financeApplications' | 'serviceBookings' | 'calendarNotes' | 'events' | 'partsOrders' | 'testDriveBookings' | 'tradeIn' | 'enquiries' | 'groups';

type StaffMenuConfigItem = {
  key: string;
  label: string;
  description: string;
  route: string;
  icon: string;
  group: 'My tools' | 'Sales' | 'Service' | 'Admin';
};

const staffMenuConfigItemValidator = v.object({
  key: v.string(),
  label: v.string(),
  description: v.string(),
  icon: v.string(),
  route: v.string(),
  group: v.union(v.literal('My tools'), v.literal('Sales'), v.literal('Service'), v.literal('Admin')),
});

export const publicStaffMenuConfig = query({
  args: {},
  returns: v.array(staffMenuConfigItemValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const current = await findUserByIdentity(ctx, identity);
    if (!current || current.isDeleted || !(isAdminLikeUser(current) || isServiceStaffRole(current.staffRole ?? current.role) || isSalesStaffRole(current.staffRole ?? current.role))) return [];

    const currentEmail = String(current.email ?? '').trim().toLowerCase();
    const canAccessAdmin = currentEmail === VINCENT_ADMIN_EMAIL || isAdminLikeUser(current);
    const roleKey = String(current.staffRole ?? current.role ?? '').trim().toLowerCase();
    const isSales = isSalesStaffRole(current.staffRole ?? current.role);
    const isService = isServiceStaffRole(current.staffRole ?? current.role);

    const items: StaffMenuConfigItem[] = [
      { key: 'StaffMain', label: 'Staff Dashboard', description: 'Overview and quick actions', route: 'StaffMain', icon: 'grid-outline', group: 'My tools' },
      { key: 'StaffMessages', label: 'Messages', description: 'Customer and staff conversations', route: 'StaffMessages', icon: 'chatbubble-ellipses-outline', group: 'My tools' },
      { key: 'Notifications', label: 'Notifications', description: 'App-wide alerts and updates', route: 'Notifications', icon: 'notifications-outline', group: 'My tools' },
      { key: 'AIChat', label: 'KIRA Assistant', description: 'Assistant for customers and staff', route: 'AIChat', icon: 'sparkles-outline', group: 'My tools' },
      { key: 'StaffProfile', label: 'Staff Profile', description: 'Personal profile and settings', route: 'StaffProfile', icon: 'person-circle-outline', group: 'My tools' },
      { key: 'ShareApp', label: 'Share App', description: 'Share the app with customers', route: 'ShareApp', icon: 'share-social-outline', group: 'My tools' },
      { key: 'TradeIn', label: 'Trade-In Submissions', description: 'Customer trade-ins and valuations', route: 'TradeIn', icon: 'pricetag-outline', group: 'My tools' },
      { key: 'FinanceApplications', label: 'Finance Applications', description: 'Review submitted finance applications', route: 'FinanceApplications', icon: 'document-text-outline', group: 'Sales' },
      { key: 'CustomerManagement', label: 'Customer Database', description: 'Search and manage customers', route: 'CustomerManagement', icon: 'people-circle-outline', group: 'Sales' },
      { key: 'InventoryScreen', label: 'Inventory', description: 'Vehicle stock and availability', route: 'InventoryScreen', icon: 'car-outline', group: 'Sales' },
      { key: 'CompareVehicles', label: 'Compare Vehicles', description: 'Side-by-side vehicle comparison', route: 'CompareVehicles', icon: 'swap-horizontal-outline', group: 'Sales' },
      { key: 'ActivityFeed', label: 'Activity Feed', description: 'Lead and enquiry activity stream', route: 'ActivityFeed', icon: 'pulse-outline', group: 'Sales' },
      { key: 'StaffTestDriveBookings', label: 'Test Drive Bookings', description: 'Manage test drive slots', route: 'StaffTestDriveBookings', icon: 'car-sport', group: 'Sales' },
      { key: 'Review', label: 'Reviews', description: 'Customer review management', route: 'Review', icon: 'star-outline', group: 'Sales' },
      { key: 'StaffInbox', label: 'Service Inbox', description: 'Service bookings and inbox items', route: 'StaffInbox', icon: 'calendar-outline', group: 'Service' },
      { key: 'Calendar', label: 'Calendar & Notes', description: 'Reminders and task planning', route: 'Calendar', icon: 'calendar-number-outline', group: 'Service' },
      { key: 'Events', label: 'Events', description: 'Events and invitations', route: 'Events', icon: 'sparkles', group: 'Service' },
      { key: 'Groups', label: 'Groups', description: 'Customer and staff groups', route: 'Groups', icon: 'people-outline', group: 'Service' },
      { key: 'PartsOrders', label: 'Parts Orders', description: 'Parts and accessory requests', route: 'PartsOrders', icon: 'cube-outline', group: 'Service' },
      { key: 'MerchandiseHub', label: 'Merchandise Hub', description: 'Manage branded merchandise', route: 'MerchandiseHub', icon: 'pricetag-outline', group: 'Service' },
      { key: 'MerchandiseOrders', label: 'Merchandise Orders', description: 'Review merchandise orders', route: 'MerchandiseOrders', icon: 'receipt-outline', group: 'Service' },
      { key: 'BrochureManager', label: 'Brochure Manager', description: 'Brochure uploads and management', route: 'BrochureManager', icon: 'folder-open-outline', group: 'Service' },
    ];

    if (canAccessAdmin) {
      items.push(
        { key: 'Staff', label: 'Staff Directory', description: 'Dealership staff and roles', route: 'Staff', icon: 'business-outline', group: 'Admin' },
        { key: 'AdminConsole', label: 'Admin Console', description: 'Management and admin tools', route: 'AdminConsole', icon: 'shield-checkmark-outline', group: 'Admin' },
        { key: 'Users', label: 'User Moderation', description: 'Moderate users and reports', route: 'Users', icon: 'person-remove-outline', group: 'Admin' },
        { key: 'StaffAnalytics', label: 'Analytics', description: 'Performance and activity analytics', route: 'StaffAnalytics', icon: 'stats-chart-outline', group: 'Admin' },
        { key: 'ConnectedAccounts', label: 'Connected Accounts', description: 'Linked accounts and access', route: 'ConnectedAccounts', icon: 'link-outline', group: 'Admin' },
        { key: 'StaffWallet', label: 'Staff Wallet', description: 'Wallet and payout tools', route: 'StaffWallet', icon: 'wallet-outline', group: 'Admin' }
      );
    }

    const allowedKeys = new Set<string>([
      'StaffMain',
      'StaffMessages',
      'Notifications',
      'AIChat',
      'StaffProfile',
      'ShareApp',
      'TradeIn',
      'FinanceApplications',
      'CustomerManagement',
      'InventoryScreen',
      'CompareVehicles',
      'ActivityFeed',
      'StaffTestDriveBookings',
      'Review',
      'StaffInbox',
      'Calendar',
      'Events',
      'Groups',
      'PartsOrders',
      'MerchandiseHub',
      'MerchandiseOrders',
      'BrochureManager',
      'Staff',
      'AdminConsole',
      'Users',
      'StaffAnalytics',
      'ConnectedAccounts',
      'StaffWallet',
    ]);

    const visibleItems = items.filter((item) => {
      if (!allowedKeys.has(item.key)) return false;
      if (item.group === 'Admin') return canAccessAdmin;
      if (item.group === 'Service') return isService || isSales || canAccessAdmin;
      if (item.group === 'Sales') return isSales || canAccessAdmin;
      return true;
    });

    const order: StaffMenuConfigItem['group'][] = ['My tools', 'Sales', 'Service', 'Admin'];
    return visibleItems.sort((a, b) => {
      const groupDiff = order.indexOf(a.group) - order.indexOf(b.group);
      if (groupDiff !== 0) return groupDiff;
      return a.label.localeCompare(b.label);
    });
  },
});

const STAFF_QUICK_ACTIONS: StaffQuickAction[] = [
  { key: 'staffManagement', label: 'Staff Management', description: 'Manage staff directory and roles', icon: 'person-add-outline', moderatorOnly: false },
  { key: 'customerDatabase', label: 'Customer Database', description: 'Search and manage customer records', icon: 'people-circle-outline', moderatorOnly: false },
  { key: 'inventory', label: 'Inventory', description: 'Manage vehicle stock and availability', icon: 'car-outline', moderatorOnly: false },
  { key: 'compareVehicles', label: 'Compare Vehicles', description: 'Side-by-side vehicle comparison', icon: 'swap-horizontal-outline', moderatorOnly: false },
  { key: 'activityFeed', label: 'Activity Feed', description: 'Lead and enquiry activity stream', icon: 'pulse-outline', moderatorOnly: false },
  { key: 'calendar', label: 'Calendar & Notes', description: 'Reminders and task planning', icon: 'calendar-number-outline', moderatorOnly: false },
  { key: 'events', label: 'Events', description: 'Events and invitations', icon: 'sparkles', moderatorOnly: false },
  { key: 'groups', label: 'Groups', description: 'Customer and staff groups', icon: 'people-outline', moderatorOnly: false },
  { key: 'partsOrders', label: 'Parts Orders', description: 'Parts and accessory requests', icon: 'cube-outline', moderatorOnly: false },
  { key: 'merchandiseHub', label: 'Merchandise Hub', description: 'Manage branded merchandise', icon: 'pricetag-outline', moderatorOnly: false },
  { key: 'merchandiseOrders', label: 'Merchandise Orders', description: 'Review merchandise orders', icon: 'receipt-outline', moderatorOnly: false },
  { key: 'brochureManager', label: 'Brochure Manager', description: 'Brochure uploads and management', icon: 'folder-open-outline', moderatorOnly: false },
  { key: 'staffProfile', label: 'Staff Profile', description: 'Personal profile and settings', icon: 'person-circle-outline', moderatorOnly: false },
  { key: 'shareApp', label: 'Share App', description: 'Share the app with customers', icon: 'share-social-outline', moderatorOnly: false },
  { key: 'review', label: 'Reviews', description: 'Customer review management', icon: 'star-outline', moderatorOnly: false },
  { key: 'staff', label: 'Staff Directory', description: 'Dealership staff and roles', icon: 'business-outline', moderatorOnly: true },
  { key: 'adminConsole', label: 'Admin Console', description: 'Management and admin tools', icon: 'shield-checkmark-outline', moderatorOnly: true },
  { key: 'users', label: 'User Moderation', description: 'Moderate users and reports', icon: 'person-remove-outline', moderatorOnly: true },
  { key: 'staffAnalytics', label: 'Analytics', description: 'Performance and activity analytics', icon: 'stats-chart-outline', moderatorOnly: true },
  { key: 'connectedAccounts', label: 'Connected Accounts', description: 'Linked accounts and access', icon: 'link-outline', moderatorOnly: true },
  { key: 'staffWallet', label: 'Staff Wallet', description: 'Wallet and payout tools', icon: 'wallet-outline', moderatorOnly: true },
];
