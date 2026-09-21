import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isPostOwnedByCurrentUser(current: any, post: any) {
  if (!current || !post) return false;

  const currentDisplayNames = [
    current.user?.displayName,
    current.user?.name,
    current.identity?.name,
    current.identity?.email,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);

  const postOwnerNames = [
    post.authorDisplayName,
    post.authorPhone,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);

  return Boolean(
    post.userId === current.userId ||
    postOwnerNames.some((value) => currentDisplayNames.includes(value))
  );
}

function canViewerSeePost(current: any, post: any) {
  if (!post || post.isDeleted) return false;
  if (post.isApproved === false && !current?.isAdminLike) return false;
  return true;
}

async function safeDbGet(ctx: any, id: string | undefined | null) {
  if (!id) return null;
  try {
    return await ctx.db.get(id as any);
  } catch {
    return null;
  }
}

async function deleteStorageIds(ctx: any, storageIds: Array<string | undefined | null>) {
  await Promise.all(
    storageIds
      .filter((id): id is string => Boolean(id))
      .map(async (id) => {
        try {
          await ctx.storage.delete(id as any);
        } catch {
          // ignore missing files
        }
      }),
  );
}

async function findUserByIdentity(ctx: any, identity: any) {
  if (identity?.subject) {
    try {
      const doc: any = await ctx.db.get(identity.subject);
      if (doc) {
        if (doc.userId) {
          const user = await safeDbGet(ctx, doc.userId);
          if (user) return user;
        } else if (doc.email !== undefined || doc.role !== undefined) {
          return doc;
        }
      }
    } catch {
      // ignore invalid ids
    }
  }

  if (identity?.email) {
    const userByEmail = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", identity.email))
      .first();
    if (userByEmail) return userByEmail;
  }

  if (identity?.tokenIdentifier) {
    const parts = String(identity.tokenIdentifier).split("|");
    const possibleId = parts[parts.length - 1];
    if (possibleId) {
      try {
        const doc: any = await ctx.db.get(possibleId);
        if (doc) {
          if (doc.userId) {
            const user = await safeDbGet(ctx, doc.userId);
            if (user) return user;
          } else if (doc.email !== undefined || doc.role !== undefined) {
            return doc;
          }
        }
      } catch {
        // ignore invalid ids
      }
    }
  }

  return null;
}

async function getCurrentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await findUserByIdentity(ctx, identity);
  if (!user || user.isDeleted) return null;

  const email = String(user.email ?? identity.email ?? "").trim().toLowerCase();
  const role = String(user.role ?? "").trim().toLowerCase();
  const staffRole = String(user.staffRole ?? "").trim().toLowerCase();
  const accessLevel = String(user.accessLevel ?? "").trim().toLowerCase();
  const isAdminLike = Boolean(
    user.isOwner ||
    email === VINCENT_ADMIN_EMAIL ||
    role === "admin" ||
    staffRole === "dp"
  );

  return { identity, user, userId: String(user._id), isAdminLike };
}

async function getUserSummary(ctx: any, userId: string) {
  const user = await safeDbGet(ctx, userId);
  if (!user || user.isDeleted) {
    return {
      displayName: "Community member",
      profileImage: undefined,
      role: "user",
      staffRole: undefined,
      phone: undefined,
      dealershipId: undefined,
      dealershipName: undefined,
      dealershipBrand: undefined,
      dealershipLocation: undefined,
    };
  }

  return {
    displayName: user.displayName || user.name || "Community member",
    profileImage: user.profileImage || user.image,
    role: user.role || "user",
    staffRole: user.staffRole,
    phone: user.phone,
    dealershipId: user.dealershipId,
    dealershipName: user.dealershipName,
    dealershipBrand: user.dealershipBrand,
    dealershipLocation: user.dealershipLocation,
  };
}

async function canUserPost(ctx: any, current: any) {
  if (!current) return false;
  if (current.isAdminLike) return true;

  const settings = await ctx.db.query("appSettings").first();
  if (!settings) return true;
  if (settings.userPostingEnabled === false && current.user.role !== "staff") return false;
  return true;
}

function canManagePostRecord(current: any, post: any) {
  if (!current || !post) return false;
  const legacyOwnerIds = [
    post.userId,
    post.ownerUserId,
    post.ownerId,
    post.owner_id,
    post.createdBy,
    post.createdByUserId,
    post.postedBy,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  return Boolean(
    current.isAdminLike ||
    legacyOwnerIds.includes(current.userId) ||
    isPostOwnedByCurrentUser(current, post)
  );
}

function makeReactionSummary() {
  return { like: 0, love: 0, celebrate: 0, laugh: 0, wow: 0, sad: 0, angry: 0 };
}

async function getReactionState(ctx: any, postId: string, userId?: string) {
  const reactions = await ctx.db
    .query("postReactions")
    .withIndex("by_postId", (q: any) => q.eq("postId", postId))
    .collect();

  const summary = makeReactionSummary();
  let myReaction: string | undefined;
  let reactionCount = 0;

  for (const reaction of reactions) {
    if (reaction.isDeleted) continue;
    reactionCount += 1;
    if ((summary as any)[reaction.reactionType] !== undefined) {
      (summary as any)[reaction.reactionType] += 1;
    }
    if (userId && reaction.userId === userId) {
      myReaction = reaction.reactionType;
    }
  }

  return { reactionSummary: summary, reactionCount, myReaction };
}

async function getCommentReactionState(ctx: any, commentId: string, userId?: string) {
  const reactions = await ctx.db
    .query("commentReactions")
    .withIndex("by_commentId", (q: any) => q.eq("commentId", commentId))
    .collect();

  let likeCount = 0;
  let myReaction: string | undefined;
  for (const reaction of reactions) {
    if (reaction.isDeleted) continue;
    if (reaction.reactionType === "like") likeCount += 1;
    if (userId && reaction.userId === userId) myReaction = reaction.reactionType;
  }

  return { likeCount, myReaction };
}

async function getActiveLikeCount(ctx: any, postId: string) {
  const reactions = await ctx.db
    .query("postReactions")
    .withIndex("by_postId", (q: any) => q.eq("postId", postId))
    .collect();

  return reactions.filter((reaction: any) => !reaction.isDeleted && reaction.reactionType === "like").length;
}

async function syncLikeCount(ctx: any, postId: string) {
  const post = await getPostByPostId(ctx, postId);
  if (!post) return;
  const likeCount = await getActiveLikeCount(ctx, postId);
  await ctx.db.patch(post._id, {
    likeCount,
    updatedAt: Date.now(),
  });
}

async function syncReactionCount(ctx: any, postId: string) {
  const post = await getPostByPostId(ctx, postId);
  if (!post) return;
  const reactionState = await getReactionState(ctx, postId);
  await ctx.db.patch(post._id, {
    likeCount: reactionState.reactionSummary.like,
    updatedAt: Date.now(),
  });
}

async function getCurrentViewerId(ctx: any) {
  const current = await getCurrentUser(ctx);
  if (current) {
    return { viewerId: current.userId, viewerEmail: String(current.user.email ?? "").trim().toLowerCase() || undefined };
  }
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const viewerId = identity.subject ? String(identity.subject) : identity.email ? String(identity.email).trim().toLowerCase() : null;
  if (!viewerId) return null;
  return {
    viewerId,
    viewerEmail: String(identity.email ?? "").trim().toLowerCase() || undefined,
  };
}

async function saveArchiveSnapshot(ctx: any, post: any, current?: any) {
  const snapshot = JSON.stringify({
    postId: post.postId,
    userId: post.userId,
    role: post.role,
    postType: post.postType,
    title: post.title,
    content: post.content,
    image: post.image,
    imageUrls: post.imageUrls ?? [],
    imageStorageIds: post.imageStorageIds ?? [],
    video: post.video,
    videoStorageId: post.videoStorageId,
    mediaType: post.mediaType,
    publicPreviewEnabled: post.publicPreviewEnabled,
    isSharedToMainFeed: post.isSharedToMainFeed,
    groupId: post.groupId,
    eventId: post.eventId,
    carMake: post.carMake,
    carModel: post.carModel,
    carYear: post.carYear,
    carStory: post.carStory,
    tag: post.tag,
    authorDisplayName: post.authorDisplayName,
    authorProfileImage: post.authorProfileImage,
    authorPhone: post.authorPhone,
    authorStaffRole: post.authorStaffRole,
    authorDealershipId: post.authorDealershipId,
    authorDealershipName: post.authorDealershipName,
    authorDealershipBrand: post.authorDealershipBrand,
    authorDealershipLocation: post.authorDealershipLocation,
    isApproved: post.isApproved,
    isDeleted: post.isDeleted,
    likeCount: post.likeCount,
    viewCount: post.viewCount,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  });

  const existing = await ctx.db
    .query("postArchives")
    .withIndex("by_postId", (q: any) => q.eq("postId", post.postId))
    .first();

  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      snapshot,
      archivedAt: now,
      userId: post.userId,
    });
    return existing._id;
  }

  return await ctx.db.insert("postArchives", {
    postId: post.postId,
    userId: post.userId,
    archivedAt: now,
    snapshot,
  });
}

async function restoreArchivedPost(ctx: any, archive: any, current: any) {
  const snapshot = JSON.parse(String(archive.snapshot ?? "{}"));
  const now = Date.now();
  const existingPost = await getPostByPostId(ctx, String(snapshot.postId ?? archive.postId));
  const restoredFields = {
    postId: String(snapshot.postId ?? archive.postId),
    userId: String(snapshot.userId ?? archive.userId ?? current.userId),
    role: String(snapshot.role ?? "user"),
    postType: snapshot.postType ?? "community",
    title: snapshot.title,
    content: String(snapshot.content ?? ""),
    image: snapshot.image,
    imageUrls: snapshot.imageUrls ?? [],
    imageStorageIds: snapshot.imageStorageIds ?? [],
    video: snapshot.video,
    videoStorageId: snapshot.videoStorageId,
    mediaType: snapshot.mediaType,
    publicPreviewEnabled: snapshot.publicPreviewEnabled,
    isSharedToMainFeed: snapshot.isSharedToMainFeed ?? true,
    groupId: snapshot.groupId,
    eventId: snapshot.eventId,
    carMake: snapshot.carMake,
    carModel: snapshot.carModel,
    carYear: snapshot.carYear,
    carStory: snapshot.carStory,
    tag: snapshot.tag,
    authorDisplayName: snapshot.authorDisplayName,
    authorProfileImage: snapshot.authorProfileImage,
    authorPhone: snapshot.authorPhone,
    authorStaffRole: snapshot.authorStaffRole,
    authorDealershipId: snapshot.authorDealershipId,
    authorDealershipName: snapshot.authorDealershipName,
    authorDealershipBrand: snapshot.authorDealershipBrand,
    authorDealershipLocation: snapshot.authorDealershipLocation,
    isApproved: snapshot.isApproved ?? true,
    isDeleted: false,
    likeCount: typeof snapshot.likeCount === 'number' ? snapshot.likeCount : 0,
    viewCount: typeof snapshot.viewCount === 'number' ? snapshot.viewCount : 0,
    commentCount: typeof snapshot.commentCount === 'number' ? snapshot.commentCount : 0,
    createdAt: typeof snapshot.createdAt === 'number' ? snapshot.createdAt : now,
    updatedAt: now,
  };

  if (existingPost) {
    await ctx.db.patch(existingPost._id, {
      ...restoredFields,
      createdAt: existingPost.createdAt,
    });
    return { postId: String(restoredFields.postId), restoredPostId: String(existingPost._id), action: 'patched' as const };
  }

  const restoredPostId = await ctx.db.insert("posts", restoredFields);
  return { postId: String(restoredFields.postId), restoredPostId: String(restoredPostId), action: 'inserted' as const };
}

function mapPost(post: any, author: any, hasLiked: boolean, media?: { image?: string; imageUrls?: string[]; video?: string }, reactionState?: { reactionSummary: ReturnType<typeof makeReactionSummary>; reactionCount: number; myReaction?: string }) {
  return {
    _id: post._id,
    postId: post.postId,
    userId: post.userId,
    role: post.role,
    postType: post.postType ?? 'community',
    title: post.title,
    content: post.content,
    image: media?.image ?? post.image,
    imageUrls: media?.imageUrls ?? post.imageUrls ?? (post.image ? [post.image] : []),
    imageStorageIds: post.imageStorageIds ?? [],
    video: media?.video ?? post.video,
    videoStorageId: post.videoStorageId,
    mediaType: post.mediaType,
    publicPreviewEnabled: post.publicPreviewEnabled,
    isSharedToMainFeed: post.isSharedToMainFeed ?? false,
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
    reactionCount: reactionState?.reactionCount ?? 0,
    reactionSummary: reactionState?.reactionSummary ?? makeReactionSummary(),
    myReaction: reactionState?.myReaction,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    authorDisplayName: author.displayName,
    authorProfileImage: author.profileImage,
    authorPhone: author.phone,
    authorStaffRole: author.staffRole,
    authorDealershipId: author.dealershipId,
    authorDealershipName: author.dealershipName,
    authorDealershipBrand: author.dealershipBrand,
    authorDealershipLocation: author.dealershipLocation,
    hasLiked,
  };
}

async function resolvePostMedia(ctx: any, post: any) {
  const imageUrls = post.imageStorageIds?.length
    ? (await Promise.all(post.imageStorageIds.map((id: string) => ctx.storage.getUrl(id)))).filter(Boolean) as string[]
    : post.imageUrls ?? [];
  const image = imageUrls[0] ?? post.image;
  const video = post.videoStorageId
    ? await ctx.storage.getUrl(post.videoStorageId)
    : post.video;
  return {
    imageUrls,
    image,
    video: video ?? post.video,
  };
}

function normalizeMedia(post: any, media: { image?: string; imageUrls?: string[]; video?: string }) {
  const imageUrls = media.imageUrls?.length ? media.imageUrls : post.imageUrls ?? (media.image ? [media.image] : []);
  const image = media.image ?? imageUrls[0] ?? post.image;
  const video = media.video ?? post.video;
  const mediaType = video ? 'video' : imageUrls.length > 1 ? 'image' : post.mediaType;

  return {
    ...post,
    image,
    imageUrls,
    video,
    mediaType,
  };
}

async function buildFeedPost(ctx: any, post: any, current: any) {
  const author = await getUserSummary(ctx, post.userId);
  const reactionState = current ? await getReactionState(ctx, post.postId, current.userId) : await getReactionState(ctx, post.postId);
  const media = await resolvePostMedia(ctx, post);
  return mapPost(normalizeMedia(post, media), author, reactionState.myReaction === 'like', media, reactionState);
}

async function getFollowingSet(ctx: any, userId: string) {
  const follows = await ctx.db
    .query("follows")
    .withIndex("by_followerId", (q: any) => q.eq("followerId", userId))
    .collect();
  const set = new Set<string>();
  for (const follow of follows) {
    if (!follow.isDeleted) set.add(follow.followingId);
  }
  return set;
}

export const listFollowingIds = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const following = await getFollowingSet(ctx, current.userId);
    return Array.from(following);
  },
});

export const followUser = mutation({
  args: { followingId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const followingId = String(args.followingId).trim();
    if (!followingId || followingId === current.userId) return null;

    const existing = await ctx.db
      .query("follows")
      .withIndex("by_followerId_and_followingId", (q: any) => q.eq("followerId", current.userId).eq("followingId", followingId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isDeleted: false,
        updatedAt: Date.now(),
      });
      return null;
    }

    await ctx.db.insert("follows", {
      followerId: current.userId,
      followingId,
      isDeleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const unfollowUser = mutation({
  args: { followingId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const followingId = String(args.followingId).trim();
    if (!followingId) return null;

    const existing = await ctx.db
      .query("follows")
      .withIndex("by_followerId_and_followingId", (q: any) => q.eq("followerId", current.userId).eq("followingId", followingId))
      .first();

    if (!existing) return null;

    await ctx.db.patch(existing._id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const trackPostView = mutation({
  args: {
    postId: v.string(),
    source: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const post = await getPostByPostId(ctx, args.postId);
    if (!post || post.isDeleted) return null;

    const viewer = await getCurrentViewerId(ctx);
    if (!viewer) return null;

    const existing = await ctx.db
      .query("postViews")
      .withIndex("by_postId_and_viewerId", (q: any) => q.eq("postId", args.postId).eq("viewerId", viewer.viewerId))
      .first();

    if (existing) return null;

    await ctx.db.insert("postViews", {
      postId: args.postId,
      viewerId: viewer.viewerId,
      viewerEmail: viewer.viewerEmail,
      viewedAt: Date.now(),
    });

    await ctx.db.patch(post._id, {
      viewCount: (post.viewCount ?? 0) + 1,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const listPostsByType = query({
  args: {
    postType: v.union(v.literal("community"), v.literal("news"), v.literal("special"), v.literal("competition"), v.literal("initiative"), v.literal("club"), v.literal("event"), v.literal("group"), v.literal("recommendation"), v.literal("advert"), v.literal("promotion"), v.literal("cars")),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const take = Math.min(Math.max(args.limit ?? 12, 1), 100);
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_postType_and_createdAt", (q: any) => q.eq("postType", args.postType))
      .order("desc")
      .take(take * 2);

    const visible = posts.filter((post: any) => canViewerSeePost(current, post));
    const result = [];
    for (const post of visible.slice(0, take)) {
      result.push(await buildFeedPost(ctx, post, current));
    }
    return result;
  },
});

export const addComment = mutation({
  args: {
    postId: v.string(),
    text: v.string(),
    parentCommentId: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const post = await getPostByPostId(ctx, args.postId);
    if (!post || post.isDeleted) throw new Error("Post not found");

    const text = String(args.text ?? "").trim();
    if (!text) throw new Error("Comment text is required");

    const now = Date.now();
    const commentId = makeId("comment");
    await ctx.db.insert("postComments", {
      commentId,
      postId: args.postId,
      userId: current.userId,
      text,
      parentCommentId: args.parentCommentId,
      likeCount: 0,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });

    await ctx.db.patch(post._id, {
      commentCount: (post.commentCount ?? 0) + 1,
      updatedAt: now,
    });

    return commentId;
  },
});

export const toggleLike = mutation({
  args: { postId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await toggleReaction(ctx, { postId: args.postId, reactionType: "like" });
  },
});

export const toggleReaction = mutation({
  args: {
    postId: v.string(),
    reactionType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const post = await getPostByPostId(ctx, args.postId);
    if (!post || post.isDeleted) return null;

    const reactionType = String(args.reactionType ?? "like").trim() || "like";
    const existing = await ctx.db
      .query("postReactions")
      .withIndex("by_postId_and_userId", (q: any) => q.eq("postId", args.postId).eq("userId", current.userId))
      .collect();

    const active = existing.filter((reaction: any) => !reaction.isDeleted).sort((a: any, b: any) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;
    const now = Date.now();

    if (active && active.reactionType === reactionType) {
      await ctx.db.patch(active._id, { isDeleted: true, updatedAt: now });
    } else if (active) {
      await ctx.db.patch(active._id, { reactionType, updatedAt: now, isDeleted: false });
    } else {
      await ctx.db.insert("postReactions", {
        postId: args.postId,
        userId: current.userId,
        reactionType,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      });
    }

    await syncReactionCount(ctx, args.postId);
    return null;
  },
});

export const toggleCommentLike = mutation({
  args: { commentId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const comment = await ctx.db
      .query("postComments")
      .withIndex("by_commentId", (q: any) => q.eq("commentId", args.commentId))
      .first();
    if (!comment || comment.isDeleted) return null;

    const existing = await ctx.db
      .query("commentReactions")
      .withIndex("by_commentId_and_userId", (q: any) => q.eq("commentId", args.commentId).eq("userId", current.userId))
      .collect();
    const active = existing.filter((reaction: any) => !reaction.isDeleted).sort((a: any, b: any) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;
    const now = Date.now();

    if (active) {
      await ctx.db.patch(active._id, { isDeleted: true, updatedAt: now });
    } else {
      await ctx.db.insert("commentReactions", {
        commentId: args.commentId,
        userId: current.userId,
        reactionType: "like",
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      });
    }

    const likeCount = active ? Math.max(0, (comment.likeCount ?? 0) - 1) : (comment.likeCount ?? 0) + 1;
    await ctx.db.patch(comment._id, {
      likeCount,
      updatedAt: now,
    });

    return null;
  },
});

export const listByContext = query({
  args: {
    groupId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const groupId = String(args.groupId ?? "").trim();
    if (!groupId) return [];

    const take = Math.min(Math.max(args.limit ?? 12, 1), 100);
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_groupId_and_createdAt", (q: any) => q.eq("groupId", groupId))
      .order("desc")
      .take(take * 2);

    const visible = posts.filter((post: any) => canViewerSeePost(current, post) && String(post.groupId ?? "") === groupId);
    const result = [];
    for (const post of visible.slice(0, take)) {
      result.push(await buildFeedPost(ctx, post, current));
    }
    return result;
  },
});

async function getPostByPostId(ctx: any, postId: string) {
  return await ctx.db
    .query("posts")
    .withIndex("by_postId", (q: any) => q.eq("postId", postId))
    .first();
}

async function getLatestActiveUserReaction(ctx: any, postId: string, userId: string) {
  const reactions = await ctx.db
    .query("postReactions")
    .withIndex("by_postId_and_userId", (q: any) => q.eq("postId", postId).eq("userId", userId))
    .collect();

  return reactions
    .filter((reaction: any) => !reaction.isDeleted)
    .sort((a: any, b: any) => Math.max(b.updatedAt ?? 0, b.createdAt ?? 0) - Math.max(a.updatedAt ?? 0, a.createdAt ?? 0))[0] ?? null;
}

export const listFeed = query({
  args: {
    mode: v.optional(v.union(v.literal("global"), v.literal("following"))),
    limit: v.optional(v.number()),
    includeUnapproved: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      _id: v.id("posts"),
      postId: v.string(),
      userId: v.string(),
      role: v.string(),
      postType: v.string(),
      title: v.optional(v.string()),
      content: v.string(),
      image: v.optional(v.string()),
      imageUrls: v.array(v.string()),
      imageStorageIds: v.array(v.string()),
      video: v.optional(v.string()),
      videoStorageId: v.optional(v.string()),
      mediaType: v.optional(v.string()),
      publicPreviewEnabled: v.optional(v.boolean()),
      isSharedToMainFeed: v.boolean(),
      groupId: v.optional(v.string()),
      eventId: v.optional(v.string()),
      carMake: v.optional(v.string()),
      carModel: v.optional(v.string()),
      carYear: v.optional(v.number()),
      carStory: v.optional(v.string()),
      tag: v.optional(v.string()),
      isApproved: v.boolean(),
      isDeleted: v.boolean(),
      likeCount: v.number(),
      commentCount: v.number(),
      reactionCount: v.number(),
      reactionSummary: v.object({
        like: v.number(),
        love: v.number(),
        celebrate: v.number(),
        laugh: v.number(),
        wow: v.number(),
        sad: v.number(),
        angry: v.number(),
      }),
      myReaction: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      authorDisplayName: v.string(),
      authorProfileImage: v.optional(v.string()),
      authorPhone: v.optional(v.string()),
      authorStaffRole: v.optional(v.string()),
      authorDealershipId: v.optional(v.string()),
      authorDealershipName: v.optional(v.string()),
      authorDealershipBrand: v.optional(v.string()),
      authorDealershipLocation: v.optional(v.string()),
      hasLiked: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);

    const take = Math.min(Math.max(args.limit ?? 30, 1), 100);
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_isDeleted_and_isApproved_and_createdAt", (q: any) => q.eq("isDeleted", false))
      .order("desc")
      .take(take * 2);

    const followingSet = args.mode === "following" && current
      ? await getFollowingSet(ctx, current.userId)
      : null;

    const showUnapproved = Boolean(args.includeUnapproved && current?.isAdminLike);
    const filtered = posts.filter((post: any) => canViewerSeePost(current, post) || showUnapproved);

    const visibleByMode = args.mode === "following" && followingSet && current
      ? filtered.filter((post: any) => post.userId === current.userId || followingSet.has(post.userId))
      : filtered;

    const sliced = visibleByMode.slice(0, take);
    const result = [];

    for (const post of sliced) {
      result.push(await buildFeedPost(ctx, post, current));
    }

    return result;
  },
});

export const listFeedPaged = query({
  args: {
    mode: v.optional(v.union(v.literal("global"), v.literal("following"))),
    includeUnapproved: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(v.any()),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const page = await ctx.db
      .query("posts")
      .withIndex("by_isDeleted_and_isApproved_and_createdAt", (q: any) => q.eq("isDeleted", false))
      .order("desc")
      .paginate(args.paginationOpts);

    const followingSet = args.mode === "following" && current
      ? await getFollowingSet(ctx, current.userId)
      : null;

    const showUnapproved = Boolean(args.includeUnapproved && current?.isAdminLike);
    const filtered = page.page.filter((post: any) => canViewerSeePost(current, post) || showUnapproved);
    const visible = args.mode === "following" && followingSet && current
      ? filtered.filter((post: any) => post.userId === current.userId || followingSet.has(post.userId))
      : filtered;

    const result: Array<any> = [];
    for (const post of visible) {
      result.push(await buildFeedPost(ctx, post, current));
    }

    return {
      page: result,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("posts"),
      postId: v.string(),
      userId: v.string(),
      role: v.string(),
      postType: v.string(),
      title: v.optional(v.string()),
      content: v.string(),
      image: v.optional(v.string()),
      imageUrls: v.array(v.string()),
      imageStorageIds: v.array(v.string()),
      video: v.optional(v.string()),
      videoStorageId: v.optional(v.string()),
      mediaType: v.optional(v.string()),
      publicPreviewEnabled: v.optional(v.boolean()),
      isSharedToMainFeed: v.boolean(),
      groupId: v.optional(v.string()),
      eventId: v.optional(v.string()),
      carMake: v.optional(v.string()),
      carModel: v.optional(v.string()),
      carYear: v.optional(v.number()),
      carStory: v.optional(v.string()),
      tag: v.optional(v.string()),
      isApproved: v.boolean(),
      isDeleted: v.boolean(),
      likeCount: v.number(),
      commentCount: v.number(),
      reactionCount: v.number(),
      reactionSummary: v.object({
        like: v.number(),
        love: v.number(),
        celebrate: v.number(),
        laugh: v.number(),
        wow: v.number(),
        sad: v.number(),
        angry: v.number(),
      }),
      myReaction: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      authorDisplayName: v.string(),
      authorProfileImage: v.optional(v.string()),
      authorPhone: v.optional(v.string()),
      authorStaffRole: v.optional(v.string()),
      authorDealershipId: v.optional(v.string()),
      authorDealershipName: v.optional(v.string()),
      authorDealershipBrand: v.optional(v.string()),
      authorDealershipLocation: v.optional(v.string()),
      hasLiked: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_userId_and_createdAt", (q: any) => q.eq("userId", current.userId))
      .order("desc")
      .collect();

    const result = [];
    for (const post of posts) {
      result.push(await buildFeedPost(ctx, post, current));
    }
    return result;
  },
});

export const listPostsByUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const take = Math.min(Math.max(args.limit ?? 12, 1), 100);
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_userId_and_createdAt", (q: any) => q.eq("userId", args.userId))
      .order("desc")
      .take(take * 2);

    const visible = posts.filter((post: any) => canViewerSeePost(current, post));
    const result = [];
    for (const post of visible.slice(0, take)) {
      result.push(await buildFeedPost(ctx, post, current));
    }
    return result;
  },
});

export const listComments = query({
  args: { postId: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("postComments"),
      commentId: v.string(),
      postId: v.string(),
      userId: v.string(),
      text: v.string(),
      parentCommentId: v.optional(v.string()),
      likeCount: v.number(),
      myReaction: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      authorDisplayName: v.string(),
      authorProfileImage: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const comments = await ctx.db
      .query("postComments")
      .withIndex("by_postId_and_createdAt", (q: any) => q.eq("postId", args.postId))
      .order("desc")
      .take(50);

    const result = [];
    for (const comment of comments) {
      if (comment.isDeleted) continue;
      const author = await getUserSummary(ctx, comment.userId);
      const commentReactionState = await getCommentReactionState(ctx, comment.commentId, current.userId);
      result.push({
        _id: comment._id,
        commentId: comment.commentId,
        postId: comment.postId,
        userId: comment.userId,
        text: comment.text,
        parentCommentId: comment.parentCommentId,
        likeCount: commentReactionState.likeCount,
        myReaction: commentReactionState.myReaction,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        authorDisplayName: author.displayName,
        authorProfileImage: author.profileImage,
      });
    }
    return result;
  },
});

export const publicGetPostPreview = query({
  args: { postId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      postId: v.string(),
      title: v.optional(v.string()),
      content: v.string(),
      image: v.optional(v.string()),
      imageUrls: v.array(v.string()),
      video: v.optional(v.string()),
      mediaType: v.optional(v.string()),
      createdAt: v.number(),
      authorDisplayName: v.string(),
      authorProfileImage: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const post = await getPostByPostId(ctx, args.postId);
    if (!post || post.isDeleted || !post.isApproved) return null;
    const author = await getUserSummary(ctx, post.userId);
    const media = await resolvePostMedia(ctx, post);
    return {
      postId: post.postId,
      title: post.title,
      content: post.content,
      image: media.image,
      imageUrls: media.imageUrls,
      video: media.video,
      mediaType: media.video ? "video" : media.imageUrls.length > 1 ? "image" : post.mediaType,
      createdAt: post.createdAt,
      authorDisplayName: author.displayName,
      authorProfileImage: author.profileImage,
    };
  },
});

export const createPost = mutation({
  args: {
    content: v.string(),
    authorUserId: v.optional(v.id("users")),
    imageStorageId: v.optional(v.id("_storage")),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
    videoStorageId: v.optional(v.id("_storage")),
    title: v.optional(v.string()),
    postType: v.optional(v.union(v.literal("community"), v.literal("news"), v.literal("special"), v.literal("competition"), v.literal("initiative"), v.literal("club"), v.literal("event"), v.literal("group"), v.literal("recommendation"), v.literal("advert"), v.literal("promotion"), v.literal("cars"))),
    mediaType: v.optional(v.union(v.literal("image"), v.literal("video"))),
    groupId: v.optional(v.string()),
    eventId: v.optional(v.string()),
    isSharedToMainFeed: v.optional(v.boolean()),
    carMake: v.optional(v.string()),
    carModel: v.optional(v.string()),
    carYear: v.optional(v.number()),
    carStory: v.optional(v.string()),
    tag: v.optional(v.union(v.literal("delivery"), v.literal("blog"), v.literal("competition"))),
  },
  returns: v.id("posts"),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    let authorUser = current?.user ?? null;
    let authorUserId = current?.userId ?? null;
    let authorIsAdminLike = current?.isAdminLike ?? false;

    if (!authorUser && args.authorUserId) {
      const fallbackUser = await safeDbGet(ctx, args.authorUserId);
      if (!fallbackUser || fallbackUser.isDeleted) throw new Error("Not authenticated");
      authorUser = fallbackUser;
      authorUserId = String(fallbackUser._id);
      const fallbackEmail = String(fallbackUser.email ?? "").trim().toLowerCase();
      const fallbackRole = String(fallbackUser.role ?? "").trim().toLowerCase();
      const fallbackStaffRole = String(fallbackUser.staffRole ?? "").trim().toLowerCase();
      const fallbackAccessLevel = String(fallbackUser.accessLevel ?? "").trim().toLowerCase();
      authorIsAdminLike = Boolean(
        fallbackUser.isOwner ||
        fallbackEmail === VINCENT_ADMIN_EMAIL ||
        fallbackRole === "admin" ||
        fallbackStaffRole === "dp"
      );
    }

    if (!authorUser || !authorUserId) throw new Error("Not authenticated");
    if (!await canUserPost(ctx, { ...current, user: authorUser, userId: authorUserId, isAdminLike: authorIsAdminLike })) throw new Error("Posting is disabled for this account");

    const content = args.content.trim();
    if (!content) throw new Error("Post content is required");

    const imageStorageIds = args.imageStorageIds?.length ? args.imageStorageIds : args.imageStorageId ? [args.imageStorageId] : [];
    const hasImage = imageStorageIds.length > 0;
    const hasVideo = Boolean(args.videoStorageId);
    if ((hasImage && hasVideo) || (!hasImage && !hasVideo && !args.mediaType)) {
      // media is optional, but when provided it must be exactly one type
    }

    const imageUrls = hasImage
      ? (await Promise.all(imageStorageIds.map((id: any) => ctx.storage.getUrl(id)))).filter(Boolean) as string[]
      : [];
    const image = imageUrls[0];
    const video = args.videoStorageId ? await ctx.storage.getUrl(args.videoStorageId) : undefined;
    if (hasImage && imageStorageIds.length > 0 && imageUrls.length === 0) {
      throw new Error("Image upload could not be found. Please upload the image again.");
    }
    if (hasVideo && !video) {
      throw new Error("Video upload could not be found. Please upload the video again.");
    }
    const now = Date.now();
    const userRole = authorUser.role || "user";

    const postId = makeId("post");
    const authorDisplayName = authorUser.displayName || authorUser.name || current?.identity?.name || current?.identity?.email || "Community member";
    const authorProfileImage = authorUser.profileImage || authorUser.image;
    const inserted = await ctx.db.insert("posts", {
      postId,
      userId: authorUserId,
      role: userRole,
      postType: args.postType ?? "community",
      title: args.title,
      content,
      image,
      imageUrls,
      imageStorageIds,
      video,
      videoStorageId: args.videoStorageId,
      mediaType: imageUrls.length > 0 ? "image" : video ? "video" : args.mediaType,
      isSharedToMainFeed: args.isSharedToMainFeed ?? !(args.groupId || args.eventId),
      groupId: args.groupId,
      eventId: args.eventId,
      carMake: args.carMake,
      carModel: args.carModel,
      carYear: args.carYear,
      carStory: args.carStory,
      tag: args.tag,
      isApproved: true,
      isDeleted: false,
      likeCount: 0,
      viewCount: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
      authorDisplayName,
      authorProfileImage,
      authorPhone: authorUser.phone,
      authorStaffRole: authorUser.staffRole,
      authorDealershipId: authorUser.dealershipId,
      authorDealershipName: authorUser.dealershipName,
      authorDealershipBrand: authorUser.dealershipBrand,
      authorDealershipLocation: authorUser.dealershipLocation,
    });
    await ctx.db.insert('notifications', {
      userId: String(authorUserId),
      type: 'post_created',
      title: 'Post published',
      message: `${authorDisplayName} published a new post.`,
      postId: postId,
      targetRoute: 'SocialFeed',
      targetId: postId,
      isRead: false,
    });
    await ctx.runMutation(internal.notifications.notifyActivity, {
      type: 'post_created',
      title: 'Post published',
      message: `${authorDisplayName} published a new post.`,
      postId: postId,
      targetRoute: 'SocialFeed',
      targetId: postId,
    });
    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: authorUserId,
      type: 'post_created',
      title: 'Post published',
      description: `${authorDisplayName} published a new post${args.title ? `: ${args.title}` : ''}.`,
      customerName: authorDisplayName,
      customerPhone: authorUser.phone,
      metadata: JSON.stringify({ postId, postType: args.postType ?? 'community', title: args.title, hasMedia: Boolean(imageUrls.length || video) }),
      triggeredBy: authorUserId,
    });
    return inserted;
  },
});

export const updatePost = mutation({
  args: {
    postId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    postType: v.optional(v.union(v.literal("community"), v.literal("news"), v.literal("special"), v.literal("competition"), v.literal("initiative"), v.literal("club"), v.literal("event"), v.literal("group"), v.literal("recommendation"), v.literal("advert"), v.literal("promotion"), v.literal("cars"))),
    imageStorageIds: v.optional(v.array(v.string())),
    videoStorageId: v.optional(v.id("_storage")),
    mediaType: v.optional(v.union(v.literal("image"), v.literal("video"))),
    carMake: v.optional(v.string()),
    carModel: v.optional(v.string()),
    carYear: v.optional(v.number()),
    carStory: v.optional(v.string()),
    tag: v.optional(v.string()),
    clearMedia: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const post = await getPostByPostId(ctx, args.postId);
    if (!post || post.isDeleted) return null;
    if (!canManagePostRecord(current, post)) return null;

    const previousImageStorageIds: string[] = post.imageStorageIds ?? [];
    const previousVideoStorageId: string | undefined = post.videoStorageId;

    const patch: Record<string, any> = {
      title: args.title ?? post.title,
      content: args.content ?? post.content,
      postType: args.postType ?? post.postType,
      carMake: args.carMake ?? post.carMake,
      carModel: args.carModel ?? post.carModel,
      carYear: typeof args.carYear === "number" ? args.carYear : post.carYear,
      carStory: args.carStory ?? post.carStory,
      tag: args.tag ?? post.tag,
      updatedAt: Date.now(),
    };

    const nextImageStorageIds = typeof args.imageStorageIds !== "undefined"
      ? (args.imageStorageIds ?? [])
      : undefined;
    const nextVideoStorageId = typeof args.videoStorageId !== "undefined"
      ? args.videoStorageId
      : undefined;

    let resolvedImageUrls: string[] | undefined;
    let resolvedVideoUrl: string | undefined;

    if (args.clearMedia) {
      resolvedImageUrls = [];
      patch.image = undefined;
      patch.imageUrls = [];
      patch.imageStorageIds = [];
      patch.video = undefined;
      patch.videoStorageId = undefined;
      patch.mediaType = undefined;
    } else if (typeof nextImageStorageIds !== "undefined") {
      resolvedImageUrls = (await Promise.all(nextImageStorageIds.map((id: string) => ctx.storage.getUrl(id)))).filter(Boolean) as string[];
      if (nextImageStorageIds.length > 0 && resolvedImageUrls.length === 0) {
        throw new Error("Image upload could not be found. Please upload the image again.");
      }
      patch.image = resolvedImageUrls[0];
      patch.imageUrls = resolvedImageUrls;
      patch.imageStorageIds = nextImageStorageIds;
      patch.video = undefined;
      patch.videoStorageId = undefined;
      patch.mediaType = resolvedImageUrls.length > 0 ? "image" : undefined;
    } else if (typeof nextVideoStorageId !== "undefined") {
      resolvedVideoUrl = await ctx.storage.getUrl(nextVideoStorageId);
      if (!resolvedVideoUrl) {
        throw new Error("Video upload could not be found. Please upload the video again.");
      }
      patch.image = undefined;
      patch.imageUrls = [];
      patch.imageStorageIds = [];
      patch.video = resolvedVideoUrl;
      patch.videoStorageId = String(nextVideoStorageId);
      patch.mediaType = "video";
    }

    await ctx.db.patch(post._id, patch);

    const storageIdsToDelete = new Set<string>();
    if (args.clearMedia) {
      for (const storageId of previousImageStorageIds) storageIdsToDelete.add(storageId);
      if (previousVideoStorageId) storageIdsToDelete.add(previousVideoStorageId);
    } else if (typeof nextImageStorageIds !== "undefined") {
      const nextImageStorageIdSet = new Set(nextImageStorageIds);
      for (const storageId of previousImageStorageIds) {
        if (!nextImageStorageIdSet.has(storageId)) storageIdsToDelete.add(storageId);
      }
      if (previousVideoStorageId) storageIdsToDelete.add(previousVideoStorageId);
    } else if (typeof nextVideoStorageId !== "undefined") {
      for (const storageId of previousImageStorageIds) storageIdsToDelete.add(storageId);
      if (previousVideoStorageId && previousVideoStorageId !== String(nextVideoStorageId)) {
        storageIdsToDelete.add(previousVideoStorageId);
      }
    }
    await deleteStorageIds(ctx, Array.from(storageIdsToDelete));

    await ctx.db.insert('notifications', {
      userId: String(post.userId),
      type: 'post_updated',
      title: 'Post updated',
      message: 'Your post was updated successfully.',
      isRead: false,
    });
    await ctx.runMutation(internal.notifications.notifyActivity, {
      type: 'post_updated',
      title: 'Post updated',
      message: 'A post was updated in the feed.',
    });
    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: post.userId,
      type: 'post_updated',
      title: 'Post updated',
      description: `${current.user?.displayName || current.user?.name || current.identity?.name || current.identity?.email || 'Someone'} updated a post.`,
      customerName: current.user?.displayName || current.user?.name || current.identity?.name || current.identity?.email || undefined,
      metadata: JSON.stringify({ postId: args.postId, postType: args.postType ?? post.postType, title: args.title ?? post.title }),
      triggeredBy: current.userId,
    });
    return null;
  },
});

export const removePostMedia = mutation({
  args: { postId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const post = await getPostByPostId(ctx, args.postId);
    if (!post || post.isDeleted) return null;
    if (!canManagePostRecord(current, post)) return null;

    await ctx.db.patch(post._id, {
      image: undefined,
      imageUrls: [],
      imageStorageIds: [],
      video: undefined,
      videoStorageId: undefined,
      mediaType: undefined,
      updatedAt: Date.now(),
    });

    await deleteStorageIds(ctx, [...(post.imageStorageIds ?? []), post.videoStorageId]);
    return null;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const approvePost = mutation({
  args: { postId: v.string(), isApproved: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current || !current.isAdminLike) throw new Error("Not authorized");

    const post = await getPostByPostId(ctx, args.postId);
    if (!post) throw new Error("Post not found");

    await ctx.db.patch(post._id, {
      isApproved: args.isApproved,
      updatedAt: Date.now(),
    });
    await ctx.runMutation(internal.notifications.notifyActivity, {
      type: 'post_updated',
      title: 'Post moderation updated',
      message: `A post was ${args.isApproved ? 'approved' : 'unapproved'}.`,
    });
    return null;
  },
});

export const restorePost = mutation({
  args: { postId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      postId: v.string(),
      restoredPostId: v.string(),
      action: v.union(v.literal('patched'), v.literal('inserted')),
    })
  ),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const post = await getPostByPostId(ctx, args.postId);
    if (post && !canManagePostRecord(current, post)) return null;

    const archive = await ctx.db
      .query("postArchives")
      .withIndex("by_postId", (q: any) => q.eq("postId", args.postId))
      .first();
    if (!archive) throw new Error("Archived snapshot not found");
    if (!canManagePostRecord(current, { userId: archive.userId })) return null;

    const restored = await restoreArchivedPost(ctx, archive, current);
    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: current.userId,
      type: 'post_restored',
      title: 'Post restored',
      description: `${current.user?.displayName || current.user?.name || current.identity?.name || current.identity?.email || 'Someone'} restored a post.`,
      metadata: JSON.stringify({ postId: restored.postId, restoredPostId: restored.restoredPostId, action: restored.action }),
      triggeredBy: current.userId,
    });
    return restored;
  },
});

export const restoreAllMyPosts = mutation({
  args: {},
  returns: v.object({
    restoredCount: v.number(),
    restoredPostIds: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return { restoredCount: 0, restoredPostIds: [] };

    let restoredCount = 0;
    const restoredPostIds: string[] = [];

    for await (const archive of ctx.db
      .query("postArchives")
      .withIndex("by_userId", (q: any) => q.eq("userId", current.userId))) {
      const restored = await restoreArchivedPost(ctx, archive, current);
      restoredPostIds.push(restored.restoredPostId);
      restoredCount += 1;
    }

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_userId_and_createdAt", (q: any) => q.eq("userId", current.userId))
      .collect();

    for (const post of posts) {
      if (!post.isDeleted) continue;
      await ctx.db.patch(post._id, {
        isDeleted: false,
        isApproved: true,
        updatedAt: Date.now(),
      });
      restoredCount += 1;
    }

    return { restoredCount, restoredPostIds };
  },
});

export const restoreAllArchivedPosts = mutation({
  args: {},
  returns: v.object({
    restoredCount: v.number(),
    restoredPostIds: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current || !current.isAdminLike) throw new Error("Not authorized");

    let restoredCount = 0;
    const restoredPostIds: string[] = [];
    for await (const archive of ctx.db.query("postArchives")) {
      const restored = await restoreArchivedPost(ctx, archive, current);
      restoredPostIds.push(restored.restoredPostId);
      restoredCount += 1;
    }

    return { restoredCount, restoredPostIds };
  },
});

const MAINTENANCE_RESTORE_KEY = "restore-all-posts-once";

export const maintenanceRestoreAllPosts = mutation({
  args: { maintenanceKey: v.string() },
  returns: v.object({
    restoredCount: v.number(),
    restoredPostIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    if (args.maintenanceKey !== MAINTENANCE_RESTORE_KEY) {
      throw new Error("Not authorized");
    }

    let restoredCount = 0;
    const restoredPostIds: string[] = [];
    const restoredPostIdsSet = new Set<string>();

    for await (const archive of ctx.db.query("postArchives")) {
      const snapshot = JSON.parse(String(archive.snapshot ?? "{}"));
      const postId = String(snapshot.postId ?? archive.postId);
      const restored = await restoreArchivedPost(ctx, archive, { userId: archive.userId });
      restoredPostIds.push(restored.restoredPostId);
      restoredCount += 1;
    }

    const softDeletedPosts = await ctx.db
      .query("posts")
      .withIndex("by_isDeleted_and_isApproved_and_createdAt", (q: any) => q.eq("isDeleted", true))
      .collect();

    for (const post of softDeletedPosts) {
      if (restoredPostIdsSet.has(post.postId)) continue;
      await ctx.db.patch(post._id, {
        isDeleted: false,
        isApproved: true,
        updatedAt: Date.now(),
      });
      restoredCount += 1;
    }

    return { restoredCount, restoredPostIds };
  },
});

export const removePost = mutation({
  args: { postId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const post = await getPostByPostId(ctx, args.postId);
    if (!post) return null;
    if (!canManagePostRecord(current, post)) return null;

    const archive = await ctx.db
      .query("postArchives")
      .withIndex("by_postId", (q: any) => q.eq("postId", args.postId))
      .first();

    await deleteStorageIds(ctx, [
      ...(post.imageStorageIds ?? []),
      post.videoStorageId,
    ]);

    if (archive) {
      await ctx.db.delete(archive._id);
    }

    await ctx.db.delete(post._id);
    return null;
  },
});

export const permanentlyDeletePost = mutation({
  args: { postId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const post = await getPostByPostId(ctx, args.postId);
    const archive = await ctx.db
      .query("postArchives")
      .withIndex("by_postId", (q: any) => q.eq("postId", args.postId))
      .first();

    if (!post && !archive) throw new Error("Post not found");
    if (post && !canManagePostRecord(current, post)) throw new Error("Not authorized");
    if (archive && !canManagePostRecord(current, { userId: archive.userId })) throw new Error("Not authorized");

    if (post) {
      const storageIdsToDelete = [
        ...(post.imageStorageIds ?? []),
        post.videoStorageId,
      ];
      await deleteStorageIds(ctx, storageIdsToDelete);
      await ctx.db.delete(post._id);
    }

    if (archive) {
      await ctx.db.delete(archive._id);
    }

    return null;
  },
});