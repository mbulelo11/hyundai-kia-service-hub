import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
    const doc: any = await safeDbGet(ctx, identity.subject);
    if (doc?.userId) {
      const nested = await safeDbGet(ctx, doc.userId);
      if (nested) return nested;
    }
    if (doc?.email || doc?.role) return doc;
  }

  if (identity?.email) {
    const user = await ctx.db.query("users").withIndex("email", (q: any) => q.eq("email", identity.email)).first();
    if (user) return user;
  }

  if (identity?.tokenIdentifier) {
    const possibleId = String(identity.tokenIdentifier).split("|").pop();
    if (possibleId) {
      const doc: any = await safeDbGet(ctx, possibleId);
      if (doc?.userId) {
        const nested = await safeDbGet(ctx, doc.userId);
        if (nested) return nested;
      }
      if (doc?.email || doc?.role) return doc;
    }
  }

  return null;
}

async function getCurrentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await findUserByIdentity(ctx, identity);
  if (!user || user.isDeleted) return null;
  const email = String(user.email ?? "").trim().toLowerCase();
  const isAdminLike = Boolean(
    user.isOwner ||
    email === VINCENT_ADMIN_EMAIL ||
    user.role === "staff" ||
    user.staffRole === "dp"
  );
  return { identity, user, userId: String(user._id), isAdminLike };
}

async function getGroupByGroupId(ctx: any, groupId: string) {
  return await ctx.db.query("groups").withIndex("by_groupId", (q: any) => q.eq("groupId", groupId)).first();
}

async function getGroupCounts(ctx: any, groupId: string, currentUserId?: string) {
  const memberships = await ctx.db.query("groupMemberships").withIndex("by_groupId", (q: any) => q.eq("groupId", groupId)).collect();
  const requests = await ctx.db.query("groupJoinRequests").withIndex("by_groupId", (q: any) => q.eq("groupId", groupId)).collect();
  const reports = await ctx.db.query("groupReports").withIndex("by_groupId", (q: any) => q.eq("groupId", groupId)).collect();
  const activeMembership = currentUserId ? memberships.find((m: any) => String(m.userId) === String(currentUserId) && m.status === "accepted") : null;
  const pendingRequest = currentUserId ? requests.find((r: any) => String(r.userId) === String(currentUserId) && r.status === "pending") : null;
  return {
    memberCount: memberships.filter((m: any) => m.status === "accepted").length,
    pendingCount: requests.filter((r: any) => r.status === "pending").length,
    reportCount: reports.length,
    isMember: Boolean(activeMembership),
    isPending: Boolean(pendingRequest),
    myMembership: activeMembership,
  };
}

async function getGroupView(ctx: any, group: any, currentUserId?: string) {
  const creator = await safeDbGet(ctx, group.creatorUserId);
  const counts = await getGroupCounts(ctx, String(group.groupId), currentUserId);
  const avatarImageUrl = group.avatarImageStorageId
    ? await ctx.storage.getUrl(group.avatarImageStorageId)
    : group.avatarImageUrl;
  const backgroundImageUrl = group.backgroundImageStorageId
    ? await ctx.storage.getUrl(group.backgroundImageStorageId)
    : group.backgroundImageUrl;
  return {
    _id: group._id,
    _creationTime: group._creationTime,
    groupId: group.groupId,
    creatorUserId: group.creatorUserId,
    creatorName: creator?.displayName || creator?.name || creator?.email || "Host",
    creatorImage: creator?.profileImage || creator?.image,
    name: group.name,
    description: group.description,
    category: group.category,
    avatarImageUrl: avatarImageUrl || undefined,
    backgroundImageUrl: backgroundImageUrl || undefined,
    criteriaText: group.criteriaText,
    rulesText: group.rulesText,
    joinQuestions: group.joinQuestions ?? [],
    isClosed: group.isClosed,
    isDeleted: group.isDeleted,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    ...counts,
  };
}

function canManageGroup(group: any, current: any, membership?: any) {
  return Boolean(current?.isAdminLike || String(group.creatorUserId) === String(current?.userId) || membership?.role === "admin" || membership?.role === "owner");
}

function canManageGroups(user: any) {
  const email = String(user?.email ?? '').trim().toLowerCase();
  return Boolean(email === 'vincentmm@hyundai.co.za');
}

export const listAll = query({
  args: { category: v.optional(v.union(v.literal("club"), v.literal("initiative"), v.literal("event"))), limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const take = Math.min(Math.max(args.limit ?? 40, 1), 100);
    const groups = await ctx.db.query("groups").withIndex("by_isClosed_and_createdAt", (q: any) => q.eq("isClosed", false)).order("desc").take(take * 2);
    const filtered = args.category ? groups.filter((group: any) => group.category === args.category) : groups;
    const visible = filtered.filter((group: any) => !group.isDeleted).slice(0, take);
    const result: any[] = [];
    for (const group of visible) {
      result.push(await getGroupView(ctx, group, current?.userId));
    }
    return result;
  },
});

export const listMine = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    const memberships = await ctx.db.query("groupMemberships").withIndex("by_userId", (q: any) => q.eq("userId", current.userId)).collect();
    const created = await ctx.db.query("groups").withIndex("by_creatorUserId", (q: any) => q.eq("creatorUserId", current.userId)).collect();
    const groupIds = new Set<string>(created.map((group: any) => String(group.groupId)));
    for (const membership of memberships) {
      groupIds.add(String(membership.groupId));
    }
    const result: any[] = [];
    for (const groupId of groupIds) {
      const group = await getGroupByGroupId(ctx, groupId);
      if (group && !group.isDeleted) {
        result.push(await getGroupView(ctx, group, current.userId));
      }
    }
    return result.sort((a: any, b: any) => b.createdAt - a.createdAt);
  },
});

export const getGroup = query({
  args: { groupId: v.string() },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const group = await getGroupByGroupId(ctx, args.groupId);
    if (!group || group.isDeleted) return null;
    return await getGroupView(ctx, group, current?.userId);
  },
});

export const createGroup = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    category: v.union(v.literal("club"), v.literal("initiative"), v.literal("event")),
    criteriaText: v.optional(v.string()),
    rulesText: v.optional(v.string()),
    joinQuestions: v.optional(v.array(v.string())),
    avatarImageStorageId: v.optional(v.id("_storage")),
    avatarImageUrl: v.optional(v.string()),
    backgroundImageStorageId: v.optional(v.id("_storage")),
    backgroundImageUrl: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const now = Date.now();
    const groupId = makeId("group");
    const avatarImageUrl = args.avatarImageStorageId ? await ctx.storage.getUrl(args.avatarImageStorageId) : args.avatarImageUrl;
    const backgroundImageUrl = args.backgroundImageStorageId ? await ctx.storage.getUrl(args.backgroundImageStorageId) : args.backgroundImageUrl;

    const inserted = await ctx.db.insert("groups", {
      groupId,
      creatorUserId: current.userId,
      name: args.name.trim(),
      description: args.description.trim(),
      category: args.category,
      avatarImageStorageId: args.avatarImageStorageId,
      avatarImageUrl: avatarImageUrl || undefined,
      backgroundImageStorageId: args.backgroundImageStorageId,
      backgroundImageUrl: backgroundImageUrl || undefined,
      criteriaText: args.criteriaText?.trim() || undefined,
      rulesText: args.rulesText?.trim() || undefined,
      joinQuestions: (args.joinQuestions ?? []).map((question: string) => String(question).trim()).filter(Boolean),
      isClosed: false,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("groupMemberships", {
      groupId,
      userId: current.userId,
      role: "owner",
      status: "accepted",
      reviewedByUserId: current.userId,
      reviewedAt: now,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("notifications", {
      userId: current.userId,
      type: "group_created",
      title: "Group created",
      message: `${args.name} is ready to use as a feed.`,
      targetRoute: "Groups",
      targetId: groupId,
      isRead: false,
    });
    await ctx.runMutation(internal.notifications.notifyActivity, {
      type: "group_created",
      title: "Group created",
      message: `${args.name} was created by ${current.user.displayName || current.user.name || current.user.email || "a user"}.`,
      targetRoute: "Groups",
      targetId: groupId,
    });
    return groupId;
  },
});

export const updateGroup = mutation({
  args: {
    groupId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.union(v.literal("club"), v.literal("initiative"), v.literal("event"))),
    criteriaText: v.optional(v.string()),
    rulesText: v.optional(v.string()),
    joinQuestions: v.optional(v.array(v.string())),
    avatarImageStorageId: v.optional(v.id("_storage")),
    avatarImageUrl: v.optional(v.string()),
    backgroundImageStorageId: v.optional(v.id("_storage")),
    backgroundImageUrl: v.optional(v.string()),
    isClosed: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    const group = await getGroupByGroupId(ctx, args.groupId);
    if (!group || group.isDeleted) throw new Error("Group not found");

    const membership = await ctx.db.query("groupMemberships").withIndex("by_groupId_and_userId", (q: any) => q.eq("groupId", args.groupId).eq("userId", current.userId)).first();
    if (!canManageGroup(group, current, membership)) throw new Error("Not authorized");

    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description.trim();
    if (args.category !== undefined) patch.category = args.category;
    if (args.criteriaText !== undefined) patch.criteriaText = args.criteriaText.trim() || undefined;
    if (args.rulesText !== undefined) patch.rulesText = args.rulesText.trim() || undefined;
    if (args.joinQuestions !== undefined) patch.joinQuestions = args.joinQuestions.map((question: string) => String(question).trim()).filter(Boolean);
    if (args.avatarImageStorageId !== undefined) {
      patch.avatarImageStorageId = args.avatarImageStorageId;
      patch.avatarImageUrl = args.avatarImageStorageId ? await ctx.storage.getUrl(args.avatarImageStorageId) : args.avatarImageUrl;
    } else if (args.avatarImageUrl !== undefined) {
      patch.avatarImageUrl = args.avatarImageUrl;
    }
    if (args.backgroundImageStorageId !== undefined) {
      patch.backgroundImageStorageId = args.backgroundImageStorageId;
      patch.backgroundImageUrl = args.backgroundImageStorageId ? await ctx.storage.getUrl(args.backgroundImageStorageId) : args.backgroundImageUrl;
    } else if (args.backgroundImageUrl !== undefined) {
      patch.backgroundImageUrl = args.backgroundImageUrl;
    }
    if (typeof args.isClosed === "boolean") patch.isClosed = args.isClosed;

    await ctx.db.patch(group._id, patch);
    if (args.isClosed) {
      await ctx.runMutation(internal.notifications.notifyActivity, {
        type: "group_closed",
        title: "Group closed",
        message: `${group.name} was closed by a moderator.`,
        targetRoute: "Groups",
        targetId: args.groupId,
      });
    }
    return null;
  },
});

export const requestJoin = mutation({
  args: {
    groupId: v.string(),
    answers: v.array(v.object({ question: v.string(), answer: v.string() })),
    note: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    const group = await getGroupByGroupId(ctx, args.groupId);
    if (!group || group.isDeleted) throw new Error("Group not found");
    if (group.isClosed) throw new Error("This group is closed");

    const existingMembership = await ctx.db.query("groupMemberships").withIndex("by_groupId_and_userId", (q: any) => q.eq("groupId", args.groupId).eq("userId", current.userId)).first();
    if (existingMembership?.status === "accepted") return String(existingMembership._id);

    const existingRequest = await ctx.db.query("groupJoinRequests").withIndex("by_groupId_and_userId", (q: any) => q.eq("groupId", args.groupId).eq("userId", current.userId)).first();
    const now = Date.now();
    const requestId = existingRequest?.requestId || makeId("join");
    const status = "pending";

    if (existingRequest) {
      await ctx.db.patch(existingRequest._id, {
        answers: args.answers,
        note: args.note?.trim() || undefined,
        status,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("groupJoinRequests", {
        requestId,
        groupId: args.groupId,
        userId: current.userId,
        answers: args.answers,
        note: args.note?.trim() || undefined,
        status,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(existingMembership?._id ?? await ctx.db.insert("groupMemberships", {
      groupId: args.groupId,
      userId: current.userId,
      role: "member",
      status,
      createdAt: now,
      updatedAt: now,
    }), {
      status,
      updatedAt: now,
    });

    await ctx.runMutation(internal.notifications.notifyActivity, {
      type: "group_join_requested",
      title: "Group join request",
      message: `${current.user.displayName || current.user.name || current.user.email || "A user"} requested to join ${group.name}.`,
      targetRoute: "Groups",
      targetId: args.groupId,
    });
    return requestId;
  },
});

export const reviewJoinRequest = mutation({
  args: {
    requestId: v.string(),
    status: v.union(v.literal("accepted"), v.literal("rejected")),
    reviewedNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const request = await ctx.db.query("groupJoinRequests").withIndex("by_status", (q: any) => q.eq("status", "pending")).collect().then((rows: any[]) => rows.find((row) => String(row.requestId) === args.requestId));
    if (!request) throw new Error("Join request not found");
    const group = await getGroupByGroupId(ctx, request.groupId);
    if (!group || group.isDeleted) throw new Error("Group not found");

    const membership = await ctx.db.query("groupMemberships").withIndex("by_groupId_and_userId", (q: any) => q.eq("groupId", request.groupId).eq("userId", current.userId)).first();
    if (!canManageGroup(group, current, membership)) throw new Error("Not authorized");

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: args.status,
      reviewedByUserId: current.userId,
      reviewedAt: now,
      updatedAt: now,
    });

    const member = await ctx.db.query("groupMemberships").withIndex("by_groupId_and_userId", (q: any) => q.eq("groupId", request.groupId).eq("userId", request.userId)).first();
    if (member) {
      await ctx.db.patch(member._id, {
        status: args.status,
        reviewedByUserId: current.userId,
        reviewedAt: now,
        joinedAt: args.status === "accepted" ? now : undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("groupMemberships", {
        groupId: request.groupId,
        userId: request.userId,
        role: "member",
        status: args.status,
        reviewedByUserId: current.userId,
        reviewedAt: now,
        joinedAt: args.status === "accepted" ? now : undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("notifications", {
      userId: request.userId,
      type: "group_join_reviewed",
      title: args.status === "accepted" ? "Join request approved" : "Join request rejected",
      message: `${group.name}: your request was ${args.status}.`,
      targetRoute: "Groups",
      targetId: request.groupId,
      isRead: false,
    });

    await ctx.runMutation(internal.notifications.notifyActivity, {
      type: "group_join_reviewed",
      title: args.status === "accepted" ? "Join approved" : "Join rejected",
      message: `${current.user.displayName || current.current.name || current.user.email || "A moderator"} reviewed ${group.name}.`,
      targetRoute: "Groups",
      targetId: request.groupId,
    });

    return null;
  },
});

export const setMemberRole = mutation({
  args: {
    groupId: v.string(),
    userId: v.string(),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("owner")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    const group = await getGroupByGroupId(ctx, args.groupId);
    if (!group || group.isDeleted) throw new Error("Group not found");
    const membership = await ctx.db.query("groupMemberships").withIndex("by_groupId_and_userId", (q: any) => q.eq("groupId", args.groupId).eq("userId", current.userId)).first();
    if (!canManageGroup(group, current, membership)) throw new Error("Not authorized");

    const target = await ctx.db.query("groupMemberships").withIndex("by_groupId_and_userId", (q: any) => q.eq("groupId", args.groupId).eq("userId", args.userId)).first();
    if (!target) throw new Error("Member not found");
    await ctx.db.patch(target._id, { role: args.role, updatedAt: Date.now() });
    return null;
  },
});

export const reportGroup = mutation({
  args: { groupId: v.string(), reason: v.string(), details: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");
    const group = await getGroupByGroupId(ctx, args.groupId);
    if (!group || group.isDeleted) throw new Error("Group not found");

    const now = Date.now();
    const reportId = makeId("report");
    await ctx.db.insert("groupReports", {
      reportId,
      groupId: args.groupId,
      reporterUserId: current.userId,
      reason: args.reason.trim(),
      details: args.details?.trim() || undefined,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.notifications.notifyActivity, {
      type: "group_reported",
      title: "Group report",
      message: `${current.user.displayName || current.user.name || current.user.email || "A user"} reported ${group.name}: ${args.reason}`,
      targetRoute: "Groups",
      targetId: args.groupId,
    });
    return reportId;
  },
});

export const closeGroup = mutation({
  args: { groupId: v.string(), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !current.isAdminLike) throw new Error("Not authorized");
    const group = await getGroupByGroupId(ctx, args.groupId);
    if (!group) throw new Error("Group not found");
    await ctx.db.patch(group._id, { isClosed: true, updatedAt: Date.now() });
    await ctx.runMutation(internal.notifications.notifyActivity, {
      type: "group_closed",
      title: "Group closed",
      message: `${group.name} was closed${args.reason ? `: ${args.reason}` : ''}.`,
      targetRoute: "Groups",
      targetId: args.groupId,
    });
    return null;
  },
});

export const listPendingRequests = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current?.isAdminLike) return [];
    const take = Math.min(Math.max(args.limit ?? 50, 1), 100);
    const requests = await ctx.db.query("groupJoinRequests").withIndex("by_status", (q: any) => q.eq("status", "pending")).collect();
    const result: any[] = [];
    for (const request of requests.slice(0, take)) {
      const group = await getGroupByGroupId(ctx, request.groupId);
      if (!group || group.isDeleted) continue;
      const reviewerMembership = await ctx.db.query("groupMemberships").withIndex("by_groupId_and_userId", (q: any) => q.eq("groupId", request.groupId).eq("userId", current.userId)).first();
      if (!canManageGroup(group, current, reviewerMembership)) continue;
      const requester = await safeDbGet(ctx, request.userId);
      result.push({
        requestId: request.requestId,
        groupId: request.groupId,
        groupName: group.name,
        groupCategory: group.category,
        userId: request.userId,
        userName: requester?.displayName || requester?.name || requester?.email || "Member",
        userImage: requester?.profileImage || requester?.image,
        answers: request.answers ?? [],
        note: request.note,
        createdAt: request.createdAt,
      });
    }
    return result;
  },
});

export const listPosts = query({
  args: { groupId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const posts = await ctx.db.query("posts").order("desc").take(Math.min(Math.max(args.limit ?? 30, 1), 100));
    const result: any[] = [];
    for (const post of posts) {
      if (!post.isDeleted && post.isApproved) {
        const author = await ctx.db.get(post.userId as any);
        result.push({
          _id: post._id,
          postId: post.postId,
          userId: post.userId,
          role: post.role,
          postType: post.postType ?? 'group',
          title: post.title,
          content: post.content,
          image: post.image,
          imageUrls: post.imageUrls ?? (post.image ? [post.image] : []),
          imageStorageIds: post.imageStorageIds ?? [],
          video: post.video,
          videoStorageId: post.videoStorageId,
          mediaType: post.mediaType,
          groupId: post.groupId,
          eventId: post.eventId,
          carMake: post.carMake,
          carModel: post.carModel,
          carYear: post.carYear,
          carStory: post.carStory,
          tag: post.tag,
          isApproved: post.isApproved,
          isDeleted: post.isDeleted,
          likeCount: post.likeCount,
          commentCount: post.commentCount,
          reactionCount: post.likeCount,
          reactionSummary: { like: post.likeCount ?? 0, love: 0, celebrate: 0, laugh: 0, wow: 0, sad: 0, angry: 0 },
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          authorDisplayName: author?.displayName || author?.name || 'Community member',
          authorProfileImage: author?.profileImage || author?.image,
          authorPhone: author?.phone,
          authorStaffRole: author?.staffRole,
          authorDealershipId: author?.dealershipId,
          authorDealershipName: author?.dealershipName,
          authorDealershipBrand: author?.dealershipBrand,
          authorDealershipLocation: author?.dealershipLocation,
          hasLiked: false,
        });
      }
    }
    return result;
  },
});