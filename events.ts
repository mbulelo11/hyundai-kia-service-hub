import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";

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
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", identity.email))
      .first();
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

function canManageEvents(user: any) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  return Boolean(email === VINCENT_ADMIN_EMAIL);
}

async function getCurrentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await findUserByIdentity(ctx, identity);
  if (!user || user.isDeleted) return null;
  return user;
}

async function getEventWithCounts(ctx: any, event: any, currentUserId?: string) {
  const creator = await safeDbGet(ctx, event.creatorUserId);
  const interests = await ctx.db
    .query("eventInterests")
    .withIndex("by_eventId", (q: any) => q.eq("eventId", event._id))
    .collect();
  const invites = await ctx.db
    .query("eventInvites")
    .withIndex("by_eventId", (q: any) => q.eq("eventId", event._id))
    .collect();
  const myInterest = currentUserId
    ? interests.find((item: any) => String(item.userId) === String(currentUserId) && item.isInterested)
    : null;
  const myInvite = currentUserId
    ? invites.find((item: any) => String(item.inviteeUserId) === String(currentUserId))
    : null;

  return {
    _id: event._id,
    _creationTime: event._creationTime,
    creatorUserId: event.creatorUserId,
    creatorName: creator?.displayName || creator?.name || creator?.email || 'Host',
    creatorImage: creator?.profileImage || creator?.image,
    title: event.title,
    description: event.description,
    date: event.date,
    time: event.time,
    endTime: event.endTime,
    fees: event.fees,
    location: event.location,
    mediaUrl: event.mediaUrl,
    mediaType: event.mediaType,
    interestedCount: interests.filter((item: any) => item.isInterested).length,
    inviteCount: invites.length,
    isInterested: Boolean(myInterest),
    inviteStatus: myInvite?.status ?? null,
    isCreator: currentUserId ? String(event.creatorUserId) === String(currentUserId) : false,
  };
}

export const listAll = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    const events = await ctx.db
      .query("events")
      .withIndex("by_isDeleted_and_createdAt", (q: any) => q.eq("isDeleted", false))
      .order("desc")
      .take(100);

    const results = [];
    for (const event of events) {
      results.push(await getEventWithCounts(ctx, event, current?._id));
    }
    return results;
  },
});

export const listMine = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const created = await ctx.db
      .query("events")
      .withIndex("by_creatorUserId", (q: any) => q.eq("creatorUserId", String(current._id)))
      .order("desc")
      .collect();
    const invited = await ctx.db
      .query("eventInvites")
      .withIndex("by_inviteeUserId", (q: any) => q.eq("inviteeUserId", String(current._id)))
      .collect();
    const interested = await ctx.db
      .query("eventInterests")
      .withIndex("by_userId", (q: any) => q.eq("userId", String(current._id)))
      .collect();

    const eventIds = new Set<string>();
    for (const event of created) eventIds.add(String(event._id));
    for (const invite of invited) eventIds.add(String(invite.eventId));
    for (const interest of interested) eventIds.add(String(interest.eventId));

    const results = [];
    for (const eventId of eventIds) {
      const event = await ctx.db.get(eventId as any);
      if (event && !event.isDeleted) {
        results.push(await getEventWithCounts(ctx, event, String(current._id)));
      }
    }

    return results.sort((a: any, b: any) => b._creationTime - a._creationTime);
  },
});

export const createEvent = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    date: v.string(),
    time: v.optional(v.string()),
    endTime: v.optional(v.string()),
    fees: v.optional(v.string()),
    location: v.string(),
    mediaStorageId: v.optional(v.id("_storage")),
    mediaType: v.optional(v.union(v.literal("image"), v.literal("video"))),
    mediaUrl: v.optional(v.string()),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const mediaUrl = args.mediaStorageId ? await ctx.storage.getUrl(args.mediaStorageId) : args.mediaUrl;
    const eventId = await ctx.db.insert("events", {
      creatorUserId: String(current._id),
      title: args.title.trim(),
      description: args.description.trim(),
      date: args.date,
      time: args.time,
      endTime: args.endTime,
      fees: args.fees?.trim() || undefined,
      location: args.location.trim(),
      mediaStorageId: args.mediaStorageId,
      mediaType: args.mediaType,
      mediaUrl: mediaUrl || undefined,
      feedPostId: undefined,
      isDeleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.runMutation(internal.notifications.notifyActivity, {
      type: 'event_created',
      title: 'Event created',
      message: `${args.title} was created and is now available in the events feed.`,
      targetRoute: 'Events',
      targetId: String(eventId),
    });

    return eventId;
  },
});

export const inviteUsers = mutation({
  args: {
    eventId: v.id("events"),
    inviteeUserIds: v.array(v.id("users")),
  },
  returns: v.object({ sentCount: v.number() }),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    if (!event || event.isDeleted) throw new Error("Event not found");
    if (!canManageEvents(current) && String(event.creatorUserId) !== String(current._id)) {
      throw new Error("Not authorized");
    }

    let sentCount = 0;
    for (const inviteeUserId of args.inviteeUserIds) {
      const existing = await ctx.db
        .query("eventInvites")
        .withIndex("by_eventId_and_inviteeUserId", (q: any) => q.eq("eventId", args.eventId).eq("inviteeUserId", String(inviteeUserId)))
        .first();
      if (existing) continue;

      await ctx.db.insert("eventInvites", {
        eventId: args.eventId,
        inviterUserId: String(current._id),
        inviteeUserId: String(inviteeUserId),
        status: 'invited',
        createdAt: Date.now(),
      });

      await ctx.db.insert("notifications", {
        userId: String(inviteeUserId),
        type: 'event_invite',
        title: 'You were invited to an event',
        message: `${event.title} on ${event.date}${event.time ? ` at ${event.time}` : ''} in ${event.location}.`,
        targetRoute: 'Events',
        targetId: String(args.eventId),
        isRead: false,
      });

      await ctx.db.insert("messages", {
        senderId: String(current._id),
        senderName: current.displayName || current.name || 'Event host',
        senderRole: 'staff',
        recipientId: String(inviteeUserId),
        content: `You are invited to ${event.title} on ${event.date}${event.time ? ` at ${event.time}` : ''} at ${event.location}. Fees: ${event.fees || 'Free'}.`,
        isRead: false,
      });
      sentCount += 1;
    }

    return { sentCount };
  },
});

export const toggleInterest = mutation({
  args: {
    eventId: v.id("events"),
    interested: v.boolean(),
  },
  returns: v.object({ interested: v.boolean() }),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    if (!event || event.isDeleted) throw new Error("Event not found");

    const existing = await ctx.db
      .query("eventInterests")
      .withIndex("by_eventId_and_userId", (q: any) => q.eq("eventId", args.eventId).eq("userId", String(current._id)))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { isInterested: args.interested, updatedAt: now });
    } else {
      await ctx.db.insert("eventInterests", {
        eventId: args.eventId,
        userId: String(current._id),
        isInterested: args.interested,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (args.interested) {
      await ctx.db.insert("messages", {
        senderId: 'system',
        senderName: 'Kira',
        senderRole: 'system',
        recipientId: String(current._id),
        content: `Event details: ${event.title} on ${event.date}${event.time ? ` at ${event.time}` : ''} in ${event.location}. Fees: ${event.fees || 'Free'}.`,
        isRead: false,
      });
      await ctx.db.insert("notifications", {
        userId: String(current._id),
        type: 'event_interested',
        title: 'Event saved to your inbox',
        message: `${event.title} details were sent to your inbox.`,
        targetRoute: 'Events',
        targetId: String(args.eventId),
        isRead: false,
      });

      if (String(event.creatorUserId) !== String(current._id)) {
        await ctx.db.insert("notifications", {
          userId: String(event.creatorUserId),
          type: 'event_interested',
          title: 'Someone is interested in your event',
          message: `${current.displayName || current.name || 'A user'} is interested in ${event.title}.`,
          targetRoute: 'Events',
          targetId: String(args.eventId),
          isRead: false,
        });
      }
    }

    return { interested: args.interested };
  },
});