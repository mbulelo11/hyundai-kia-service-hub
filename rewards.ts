import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";

const EARN_RATES = {
  perKm: 1.0,        // 1 token per km
  ecoBonus: 0.5,     // extra 0.5/km for eco driving
  serviceComplete: 50, // 50 tokens per service
  review: 25,         // 25 tokens for leaving a review
  referral: 100,      // 100 tokens for referral
  dailyCheckIn: 5,    // 5 tokens daily check-in
  testDrive: 30,      // 30 tokens for test drive
};

const LEVELS = [
  { name: "Bronze", minKm: 0 },
  { name: "Silver", minKm: 1000 },
  { name: "Gold", minKm: 5000 },
  { name: "Platinum", minKm: 15000 },
  { name: "Diamond", minKm: 50000 },
];

async function findCurrentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  if (identity.subject) {
    try {
      const doc: any = await ctx.db.get(identity.subject as any);
      if (doc) {
        if (doc.userId) {
          try {
            const user = await ctx.db.get(doc.userId);
            if (user) return user;
          } catch {}
        } else if (doc.email !== undefined || doc.role !== undefined || doc.staffRole !== undefined) {
          return doc;
        }
      }
    } catch {}
  }

  if (identity.email) {
    const byEmail = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", identity.email))
      .first();
    if (byEmail) return byEmail;
  }

  if (identity.tokenIdentifier) {
    const parts = identity.tokenIdentifier.split("|");
    const possibleId = parts[parts.length - 1];
    if (possibleId) {
      try {
        const doc: any = await ctx.db.get(possibleId as any);
        if (doc) {
          if (doc.userId) {
            try {
              const user = await ctx.db.get(doc.userId as any);
              if (user) return user;
            } catch {}
          } else if (doc.email !== undefined || doc.role !== undefined || doc.staffRole !== undefined) {
            return doc;
          }
        }
      } catch {}
    }
  }

  return null;
}

async function canManageTokenSettings(ctx: any) {
  const user = await findCurrentUser(ctx);
  const email = String(user?.email ?? "").trim().toLowerCase();
  return Boolean(
    user?.isOwner ||
    email === VINCENT_ADMIN_EMAIL ||
    user?.staffRole === "dp"
  );
}

async function getTokenEarningEnabled(ctx: any) {
  const settings = await ctx.db.query("appSettings").first();
  return settings?.tokenEarningEnabled ?? true;
}

function getLevel(km: number): string {
  let level = "Bronze";
  for (const l of LEVELS) {
    if (km >= l.minKm) level = l.name;
  }
  return level;
}

export const getSettings = query({
  args: {},
  returns: v.object({
    tokenEarningEnabled: v.boolean(),
    updatedAt: v.number(),
  }),
  handler: async (ctx) => {
    const settings = await ctx.db.query("appSettings").first();
    return {
      tokenEarningEnabled: settings?.tokenEarningEnabled ?? true,
      updatedAt: settings?.updatedAt ?? Date.now(),
    };
  },
});

export const setTokenEarningEnabled = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await canManageTokenSettings(ctx))) {
      throw new Error("Not authorized");
    }

    const settings = await ctx.db.query("appSettings").first();
    const now = Date.now();
    if (settings) {
      await ctx.db.patch(settings._id, {
        tokenEarningEnabled: args.enabled,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("appSettings", {
        tokenEarningEnabled: args.enabled,
        updatedAt: now,
      });
    }
    return null;
  },
});

// Get or create rewards wallet
export const getWallet = query({
  args: {},
  returns: v.union(v.object({
    _id: v.id("rewards"),
    userId: v.string(),
    tokenType: v.string(),
    balance: v.number(),
    totalEarned: v.number(),
    totalRedeemed: v.number(),
    lifetimeKm: v.number(),
    carbonSaved: v.number(),
    streak: v.number(),
    level: v.string(),
    lastDriveSync: v.optional(v.number()),
    recentEarnings: v.array(v.object({
      type: v.string(),
      amount: v.number(),
      description: v.string(),
      timestamp: v.number(),
      km: v.optional(v.number()),
    })),
    nextLevel: v.optional(v.object({
      name: v.string(),
      kmNeeded: v.number(),
    })),
  }), v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Find user
    let userId = identity.subject;
    try {
      const doc: any = await ctx.db.get(identity.subject as any);
      if (doc?.userId) userId = doc.userId;
      else if (doc?._id) userId = doc._id;
    } catch {}

    const wallet = await ctx.db.query("rewards")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .first();

    if (!wallet) return null;

    const earningsLog = wallet.earningsLog ?? [];
    const recentEarnings = earningsLog.slice(-20).reverse();

    // Calculate next level
    let nextLevel = undefined;
    for (const l of LEVELS) {
      if (wallet.lifetimeKm < l.minKm) {
        nextLevel = { name: l.name, kmNeeded: l.minKm - wallet.lifetimeKm };
        break;
      }
    }

    return {
      _id: wallet._id,
      userId: wallet.userId,
      tokenType: wallet.tokenType,
      balance: wallet.balance,
      totalEarned: wallet.totalEarned,
      totalRedeemed: wallet.totalRedeemed,
      lifetimeKm: wallet.lifetimeKm,
      carbonSaved: wallet.carbonSaved,
      streak: wallet.streak,
      level: wallet.level,
      lastDriveSync: wallet.lastDriveSync,
      recentEarnings,
      nextLevel,
    };
  },
});

// Initialize wallet
export const initWallet = mutation({
  args: {
    tokenType: v.optional(v.string()),
  },
  returns: v.id("rewards"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    let userId = identity.subject;
    try {
      const doc: any = await ctx.db.get(identity.subject as any);
      if (doc?.userId) userId = doc.userId;
      else if (doc?._id) userId = doc._id;
    } catch {}

    // Check if already exists
    const existing = await ctx.db.query("rewards")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .first();
    if (existing) return existing._id;

    // Determine token type from vehicle make
    let tokenType = args.tokenType ?? "HMT";
    const vehicles = await ctx.db.query("vehicles")
      .withIndex("by_userId", (q: any) => q.eq("userId", identity.subject))
      .collect();
    const kiaVehicle = vehicles.find((v: any) => v.make?.toLowerCase().includes("kia"));
    if (kiaVehicle) tokenType = "KMT";

    return await ctx.db.insert("rewards", {
      userId,
      tokenType,
      balance: 10, // Welcome bonus
      totalEarned: 10,
      totalRedeemed: 0,
      lifetimeKm: 0,
      carbonSaved: 0,
      streak: 0,
      level: "Bronze",
      lastDriveSync: Date.now(),
      earningsLog: [{
        type: "check_in",
        amount: 10,
        description: "Welcome bonus! 🎉",
        timestamp: Date.now(),
      }],
    });
  },
});

// Log a drive (earn tokens per km)
export const logDrive = mutation({
  args: {
    km: v.number(),
    isEcoDrive: v.optional(v.boolean()),
  },
  returns: v.object({
    earned: v.number(),
    newBalance: v.number(),
    level: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    let userId = identity.subject;
    try {
      const doc: any = await ctx.db.get(identity.subject as any);
      if (doc?.userId) userId = doc.userId;
      else if (doc?._id) userId = doc._id;
    } catch {}

    const wallet = await ctx.db.query("rewards")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .first();
    if (!wallet) throw new Error("Wallet not found. Please initialize first.");

    const newKm = wallet.lifetimeKm + args.km;
    const newLevel = getLevel(newKm);
    if (!(await getTokenEarningEnabled(ctx))) {
      return { earned: 0, newBalance: wallet.balance, level: newLevel };
    }

    let earned = Math.round(args.km * EARN_RATES.perKm);
    if (args.isEcoDrive) {
      earned += Math.round(args.km * EARN_RATES.ecoBonus);
    }

    const carbonSaved = wallet.carbonSaved + (args.km * 0.12); // ~120g CO2/km tracked
    const log = wallet.earningsLog ?? [];

    // Check streak
    const lastSync = wallet.lastDriveSync ?? 0;
    const daysSinceLast = (Date.now() - lastSync) / (1000 * 60 * 60 * 24);
    let streak = wallet.streak;
    if (daysSinceLast <= 1.5) streak += 1;
    else streak = 1;

    // Streak bonus
    let streakBonus = 0;
    if (streak >= 7) streakBonus = 10;
    if (streak >= 30) streakBonus = 25;

    const totalEarned = earned + streakBonus;

    log.push({
      type: "drive",
      amount: totalEarned,
      description: `${args.km}km drive${args.isEcoDrive ? " (Eco)" : ""}${streakBonus > 0 ? ` +${streakBonus} streak bonus` : ""}`,
      timestamp: Date.now(),
      km: args.km,
    });

    // Keep last 100 entries
    const trimmedLog = log.slice(-100);

    await ctx.db.patch(wallet._id, {
      balance: wallet.balance + totalEarned,
      totalEarned: wallet.totalEarned + totalEarned,
      lifetimeKm: newKm,
      carbonSaved: Math.round(carbonSaved * 100) / 100,
      level: newLevel,
      streak,
      lastDriveSync: Date.now(),
      earningsLog: trimmedLog,
    });

    return { earned: totalEarned, newBalance: wallet.balance + totalEarned, level: newLevel };
  },
});

// Log bonus (service, review, referral, etc.)
export const logBonus = mutation({
  args: {
    type: v.string(),
    description: v.optional(v.string()),
  },
  returns: v.object({ earned: v.number(), newBalance: v.number() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    let userId = identity.subject;
    try {
      const doc: any = await ctx.db.get(identity.subject as any);
      if (doc?.userId) userId = doc.userId;
      else if (doc?._id) userId = doc._id;
    } catch {}

    const wallet = await ctx.db.query("rewards")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .first();
    if (!wallet) throw new Error("Wallet not found");

    if (!(await getTokenEarningEnabled(ctx))) {
      return { earned: 0, newBalance: wallet.balance };
    }

    const rateMap: Record<string, number> = {
      service: EARN_RATES.serviceComplete,
      review: EARN_RATES.review,
      referral: EARN_RATES.referral,
      check_in: EARN_RATES.dailyCheckIn,
      test_drive: EARN_RATES.testDrive,
    };

    const earned = rateMap[args.type] ?? 10;
    const log = wallet.earningsLog ?? [];
    log.push({
      type: args.type,
      amount: earned,
      description: args.description ?? `${args.type} bonus`,
      timestamp: Date.now(),
    });

    await ctx.db.patch(wallet._id, {
      balance: wallet.balance + earned,
      totalEarned: wallet.totalEarned + earned,
      earningsLog: log.slice(-100),
    });

    return { earned, newBalance: wallet.balance + earned };
  },
});

// Redeem tokens
export const redeem = mutation({
  args: {
    amount: v.number(),
    description: v.string(),
  },
  returns: v.object({ success: v.boolean(), newBalance: v.number() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    let userId = identity.subject;
    try {
      const doc: any = await ctx.db.get(identity.subject as any);
      if (doc?.userId) userId = doc.userId;
      else if (doc?._id) userId = doc._id;
    } catch {}

    const wallet = await ctx.db.query("rewards")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .first();
    if (!wallet) throw new Error("Wallet not found");
    if (wallet.balance < args.amount) throw new Error("Insufficient balance");

    const log = wallet.earningsLog ?? [];
    log.push({
      type: "redeem",
      amount: -args.amount,
      description: `Redeemed: ${args.description}`,
      timestamp: Date.now(),
    });

    await ctx.db.patch(wallet._id, {
      balance: wallet.balance - args.amount,
      totalRedeemed: wallet.totalRedeemed + args.amount,
      earningsLog: log.slice(-100),
    });

    return { success: true, newBalance: wallet.balance - args.amount };
  },
});