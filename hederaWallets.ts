import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

async function safeDbGet(ctx: any, id: string | undefined | null) {
  if (!id) return null;
  try {
    return await ctx.db.get(id as any);
  } catch {
    return null;
  }
}

async function getStableUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  let userId = String(identity.subject);
  const subjectDoc: any = await safeDbGet(ctx, identity.subject);
  if (subjectDoc?.userId) {
    const user = await safeDbGet(ctx, subjectDoc.userId);
    if (user) userId = String(user._id);
  } else if (subjectDoc?.email || subjectDoc?.role) {
    userId = String(subjectDoc._id);
  } else if (identity.email) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", identity.email))
      .first();
    if (user) userId = String(user._id);
  }

  return userId;
}

function toConnectionResult(wallet: any) {
  return {
    _id: String(wallet._id),
    connectionMode: wallet.connectionMode,
    walletName: wallet.walletName,
    network: wallet.network,
    accountId: wallet.accountId,
    publicKey: wallet.publicKey,
    isConnected: wallet.isConnected,
    connectedAt: wallet.connectedAt,
    disconnectedAt: wallet.disconnectedAt,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
}

function toTransactionResult(tx: any) {
  return {
    _id: String(tx._id),
    walletConnectionId: tx.walletConnectionId ? String(tx.walletConnectionId) : undefined,
    network: tx.network,
    accountId: tx.accountId,
    counterpartyAccountId: tx.counterpartyAccountId,
    tokenId: tx.tokenId,
    amountTinybars: tx.amountTinybars,
    direction: tx.direction,
    status: tx.status,
    txId: tx.txId,
    memo: tx.memo,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  };
}

export const listMine = query({
  args: {},
  returns: v.array(v.object({
    _id: v.string(),
    connectionMode: v.string(),
    walletName: v.optional(v.string()),
    network: v.string(),
    accountId: v.string(),
    publicKey: v.optional(v.string()),
    isConnected: v.boolean(),
    connectedAt: v.number(),
    disconnectedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = await getStableUserId(ctx);
    const wallets = await ctx.db
      .query("hederaWalletConnections")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .collect();

    return wallets
      .slice()
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
      .map(toConnectionResult);
  },
});

export const listTransactions = query({
  args: {},
  returns: v.array(v.object({
    _id: v.string(),
    walletConnectionId: v.optional(v.string()),
    network: v.string(),
    accountId: v.string(),
    counterpartyAccountId: v.optional(v.string()),
    tokenId: v.optional(v.string()),
    amountTinybars: v.string(),
    direction: v.string(),
    status: v.string(),
    txId: v.optional(v.string()),
    memo: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = await getStableUserId(ctx);
    const transactions = await ctx.db
      .query("hederaWalletTransactions")
      .withIndex("by_userId_createdAt", (q: any) => q.eq("userId", userId))
      .collect();

    return transactions
      .slice()
      .sort((a: any, b: any) => b.createdAt - a.createdAt)
      .map(toTransactionResult);
  },
});

async function setOtherWalletsDisconnected(ctx: any, userId: string, keepWalletId?: string) {
  const wallets = await ctx.db
    .query("hederaWalletConnections")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .collect();

  const now = Date.now();
  await Promise.all(
    wallets.map(async (wallet: any) => {
      if (keepWalletId && String(wallet._id) === keepWalletId) return;
      if (!wallet.isConnected) return;
      await ctx.db.patch(wallet._id, {
        isConnected: false,
        disconnectedAt: now,
        updatedAt: now,
      });
    })
  );
}

async function upsertConnection(
  ctx: any,
  args: {
    connectionMode: string;
    walletName?: string;
    network: string;
    accountId: string;
    publicKey?: string;
  }
) {
  const userId = await getStableUserId(ctx);
  const now = Date.now();

  const existing = await ctx.db
    .query("hederaWalletConnections")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .collect();

  const match = existing.find((wallet: any) =>
    wallet.connectionMode === args.connectionMode &&
    wallet.network === args.network &&
    wallet.accountId === args.accountId
  );

  if (match) {
    await setOtherWalletsDisconnected(ctx, userId, String(match._id));
    await ctx.db.patch(match._id, {
      walletName: args.walletName ?? match.walletName,
      publicKey: args.publicKey ?? match.publicKey,
      isConnected: true,
      connectedAt: match.connectedAt ?? now,
      disconnectedAt: undefined,
      updatedAt: now,
    });
    return String(match._id);
  }

  await setOtherWalletsDisconnected(ctx, userId);
  const id = await ctx.db.insert("hederaWalletConnections", {
    userId,
    connectionMode: args.connectionMode,
    walletName: args.walletName,
    network: args.network,
    accountId: args.accountId,
    publicKey: args.publicKey,
    isConnected: true,
    connectedAt: now,
    disconnectedAt: undefined,
    createdAt: now,
    updatedAt: now,
  });

  return String(id);
}

export const connectNative = mutation({
  args: {
    walletName: v.optional(v.string()),
    network: v.string(),
    accountId: v.string(),
    publicKey: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    return await upsertConnection(ctx, {
      connectionMode: "native",
      walletName: args.walletName,
      network: args.network,
      accountId: args.accountId,
      publicKey: args.publicKey,
    });
  },
});

export const connectExternal = mutation({
  args: {
    walletName: v.optional(v.string()),
    network: v.string(),
    accountId: v.string(),
    publicKey: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    return await upsertConnection(ctx, {
      connectionMode: "external",
      walletName: args.walletName,
      network: args.network,
      accountId: args.accountId,
      publicKey: args.publicKey,
    });
  },
});

export const disconnect = mutation({
  args: {
    connectionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = await getStableUserId(ctx);
    const connection = await safeDbGet(ctx, args.connectionId);
    if (!connection || String(connection.userId) !== userId) return null;

    await ctx.db.patch(connection._id, {
      isConnected: false,
      disconnectedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordTransaction = mutation({
  args: {
    walletConnectionId: v.optional(v.string()),
    network: v.string(),
    accountId: v.string(),
    counterpartyAccountId: v.optional(v.string()),
    tokenId: v.optional(v.string()),
    amountTinybars: v.string(),
    direction: v.string(),
    status: v.string(),
    txId: v.optional(v.string()),
    memo: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await getStableUserId(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("hederaWalletTransactions", {
      userId,
      walletConnectionId: args.walletConnectionId as any,
      network: args.network,
      accountId: args.accountId,
      counterpartyAccountId: args.counterpartyAccountId,
      tokenId: args.tokenId,
      amountTinybars: args.amountTinybars,
      direction: args.direction,
      status: args.status,
      txId: args.txId,
      memo: args.memo,
      createdAt: now,
      updatedAt: now,
    });
    return String(id);
  },
});