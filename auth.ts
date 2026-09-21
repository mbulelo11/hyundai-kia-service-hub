import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params: Record<string, any>) {
        return {
          email: String(params.email ?? "").trim().toLowerCase(),
          name: String(params.name ?? "").trim() || undefined,
        };
      },
    }),
  ],
});

export const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";
export const VINCENT_ADMIN_EMAIL_VARIANTS = [
  VINCENT_ADMIN_EMAIL,
  "vincentmmm@hyundai.co.za",
];

export function isVincentAdminEmail(email: string) {
  const normalized = String(email ?? "").trim().toLowerCase();
  return VINCENT_ADMIN_EMAIL_VARIANTS.includes(normalized);
}

export function isVincentAdminUser(user: any) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  return isVincentAdminEmail(email);
}

export function canOpenAdminPanel(user: any) {
  return isVincentAdminUser(user);
}

export function isRegionalManagerUser(user: any) {
  return false;
}

export function isServiceManagerUser(user: any) {
  return false;
}

export function isServiceAdvisorUser(user: any) {
  return false;
}

export function isSalesExecutiveUser(user: any) {
  return false;
}

export function isPartsAccessoriesManagerUser(user: any) {
  return false;
}

type Viewer = {
  identity: any;
  user: any;
  userId: string;
  isElevated: boolean;
};

export function isElevatedUser(user: any) {
  return isVincentAdminUser(user);
}

export function canAccessAllInformation(user: any) {
  return isVincentAdminUser(user);
}

export function canAccessAllServiceBookings(user: any) {
  return isVincentAdminUser(user);
}

export function canAccessAllPartsOrders(user: any) {
  return isVincentAdminUser(user);
}

export function getUserRole(user: any) {
  return String(user?.role ?? user?.staffRole ?? "").trim().toLowerCase();
}

export function getUserDepartment(user: any) {
  return String(user?.department ?? "").trim().toLowerCase();
}

export function isAdminUser(user: any) {
  return isVincentAdminUser(user);
}

export function isStaffUser(user: any) {
  return String(user?.role ?? "").trim().toLowerCase() === "staff";
}

export function isCustomerUser(user: any) {
  return String(user?.role ?? "").trim().toLowerCase() === "customer";
}

export function canAccessDepartment(user: any, department: string) {
  const currentDepartment = getUserDepartment(user);
  const targetDepartment = String(department ?? "").trim().toLowerCase();
  if (!targetDepartment) return false;
  if (isAdminUser(user)) return true;
  if (!currentDepartment) return false;
  return currentDepartment === targetDepartment;
}

export function canBypassOwnerIsolation(user: any) {
  return isVincentAdminUser(user);
}

export function canAccessOwnRecord(user: any, record: any) {
  if (canBypassOwnerIsolation(user)) return true;
  const userId = String(user?._id ?? user?.userId ?? "");
  return [record?.owner_id, record?.ownerId, record?.ownerUserId, record?.userId, record?.triggeredBy, record?.createdBy, record?.senderId, record?.recipientId].map((v) => String(v ?? "")).includes(userId);
}

async function findUserByIdentity(ctx: any, identity: any) {
  if (!identity) return null;

  if (identity.subject) {
    try {
      const doc: any = await ctx.db.get(identity.subject);
      if (doc?.userId) {
        const linked = await ctx.db.get(doc.userId);
        if (linked) return linked;
      }
      if (doc?.email !== undefined || doc?.role !== undefined) {
        return doc;
      }
    } catch {
      // subject is not a direct user id
    }
  }

  if (identity.email) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", identity.email))
      .first();
    if (user) return user;
  }

  if (identity.tokenIdentifier) {
    const possibleId = String(identity.tokenIdentifier).split("|").pop();
    if (possibleId) {
      try {
        const doc: any = await ctx.db.get(possibleId);
        if (doc?.userId) {
          const linked = await ctx.db.get(doc.userId);
          if (linked) return linked;
        }
        if (doc?.email !== undefined || doc?.role !== undefined) {
          return doc;
        }
      } catch {
        // token identifier is not a direct user id
      }
    }
  }

  return null;
}

export async function getViewer(ctx: any): Promise<Viewer | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await findUserByIdentity(ctx, identity);
  const email = String(identity.email ?? user?.email ?? "").trim().toLowerCase();
  const resolvedUser = user ?? {
    _id: String(identity.subject ?? email ?? "anonymous"),
    email: email || undefined,
    name: (identity.name ?? email) || "User",
    role: email === VINCENT_ADMIN_EMAIL ? "admin" : "customer",
    staffRole: undefined,
    accessLevel: email === VINCENT_ADMIN_EMAIL ? "full_access" : "limited_access",
    isOwner: email === VINCENT_ADMIN_EMAIL,
    isDeleted: false,
  };

  if (!resolvedUser || resolvedUser.isDeleted) return null;

  return {
    identity,
    user: resolvedUser,
    userId: String(resolvedUser._id),
    isElevated: isElevatedUser(resolvedUser),
  };
}

export async function requireViewer(ctx: any): Promise<Viewer> {
  const viewer = await getViewer(ctx);
  if (!viewer) {
    throw new Error("Not authenticated");
  }
  return viewer;
}