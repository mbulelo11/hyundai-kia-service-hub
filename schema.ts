import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const schema = defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    alternatePhone: v.optional(v.string()),
    birthday: v.optional(v.string()),
    address: v.optional(v.string()),
    preferredContactMethod: v.optional(v.string()),
    profileNotes: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    lastSeenAt: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal("admin"), v.literal("staff"), v.literal("customer"))),
    department: v.optional(v.union(v.literal("sales"), v.literal("service"), v.literal("parts"), v.literal("management"))),
    staffRole: v.optional(v.string()),
    staffApprovalStatus: v.optional(v.string()),
    accessLevel: v.optional(v.string()),
    isOwner: v.optional(v.boolean()),
    isDeleted: v.optional(v.boolean()),
    pushToken: v.optional(v.string()),
    userId: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    profileImage: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    dealershipLocation: v.optional(v.string()),
    workspaceId: v.optional(v.string()),
    assignedStaffUserId: v.optional(v.string()),
    assignedStaffName: v.optional(v.string()),
    assignedStaffRole: v.optional(v.string()),
    assignedStaffDealershipId: v.optional(v.string()),
    assignedStaffDealershipName: v.optional(v.string()),
    assignedStaffDealershipBrand: v.optional(v.string()),
    assignedStaffDealershipLocation: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("email", ["email"]).index("by_role", ["role"]).index("by_department", ["department"]).index("by_dealershipId", ["dealershipId"]).index("by_workspaceId", ["workspaceId"]),

  hederaWalletConnections: defineTable({
    userId: v.string(),
    connectionMode: v.string(), // "native" | "external"
    walletName: v.optional(v.string()),
    network: v.string(), // "testnet" | "mainnet"
    accountId: v.string(),
    publicKey: v.optional(v.string()),
    isConnected: v.boolean(),
    connectedAt: v.number(),
    disconnectedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_network", ["userId", "network"])
    .index("by_userId_connectionMode", ["userId", "connectionMode"])
    .index("by_accountId", ["accountId"]),

  hederaWalletTransactions: defineTable({
    userId: v.string(),
    walletConnectionId: v.optional(v.id("hederaWalletConnections")),
    network: v.string(),
    accountId: v.string(),
    counterpartyAccountId: v.optional(v.string()),
    tokenId: v.optional(v.string()),
    amountTinybars: v.string(),
    direction: v.string(), // "send" | "receive"
    status: v.string(), // "draft" | "pending" | "submitted" | "confirmed" | "failed"
    txId: v.optional(v.string()),
    memo: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_accountId", ["accountId"])
    .index("by_walletConnectionId", ["walletConnectionId"]),

  vehicles: defineTable({
    userId: v.string(),
    make: v.string(),
    model: v.string(),
    year: v.number(),
    registration: v.string(),
    color: v.optional(v.string()),
    mileage: v.optional(v.number()),
    isDefault: v.boolean(),
    isDeleted: v.optional(v.boolean()), // soft delete - NEVER hard delete
  }).index("by_userId", ["userId"]),

  bookings: defineTable({
    ownerId: v.optional(v.string()),
    ownerUserId: v.optional(v.string()),
    userId: v.string(),
    customerProfileId: v.optional(v.string()),
    vehicleId: v.id("vehicles"),
    referenceNumber: v.optional(v.string()),
    serviceType: v.string(),
    serviceAmount: v.optional(v.number()),
    date: v.string(),
    timeSlot: v.string(),
    status: v.string(),
    notes: v.optional(v.string()),
    pickupRequested: v.optional(v.boolean()),
    pickupLocation: v.optional(v.string()),
    pickupTime: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    assignedDriverId: v.optional(v.string()),
    assignedDriverName: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    assignedToUserId: v.optional(v.string()),
    assignedToRole: v.optional(v.string()),
    assignedTechnicianId: v.optional(v.string()),
    assignedTechnicianName: v.optional(v.string()),
    assignedTechnicianUserId: v.optional(v.string()),
    technicianProgressStatus: v.optional(v.string()),
    technicianProgressNote: v.optional(v.string()),
    technicianProgressUpdatedAt: v.optional(v.number()),
    customerEmail: v.optional(v.string()),
    customerName: v.optional(v.string()),
    customerImage: v.optional(v.string()),
    userImage: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    ratingId: v.optional(v.id("ratings")),
    department: v.optional(v.string()),
    acknowledgedAt: v.optional(v.number()),
    walletCreditedAt: v.optional(v.number()),
    walletCreditAmount: v.optional(v.number()),
    // Status history for tracking service progress
    statusHistory: v.optional(v.array(v.object({
      status: v.string(),
      timestamp: v.number(),
      updatedBy: v.optional(v.string()),
      updatedByName: v.optional(v.string()),
      note: v.optional(v.string()),
    }))),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_date", ["date"])
    .index("by_assignedTo", ["assignedTo"])
    .index("by_assignedToUserId", ["assignedToUserId"])
    .index("by_assignedToRole", ["assignedToRole"])
    .index("by_assignedTechnicianUserId", ["assignedTechnicianUserId"])
    .index("by_assignedDriverId", ["assignedDriverId"])
    .index("by_referenceNumber", ["referenceNumber"])
    .index("by_dealershipId", ["dealershipId"]),

  ratings: defineTable({
    bookingId: v.id("bookings"),
    userId: v.string(),         // customer who rated
    staffId: v.optional(v.string()), // staff who handled the booking
    staffName: v.optional(v.string()),
    serviceType: v.string(),
    rating: v.number(),         // 1-5 stars
    comment: v.optional(v.string()),
  })
    .index("by_bookingId", ["bookingId"])
    .index("by_userId", ["userId"])
    .index("by_staffId", ["staffId"]),

  staff: defineTable({
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    whatsappNumber: v.optional(v.string()),
    role: v.string(), // "dealership_principal" | "sales" | "service_advisor" | "driver"
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    dealershipLocation: v.optional(v.string()),
    approvalStatus: v.optional(v.string()), // "pending" | "approved" | "rejected"
    accessLevel: v.optional(v.string()), // "full_access" | "limited_access"
    isActive: v.boolean(),
  })
    .index("by_role", ["role"])
    .index("by_email", ["email"])
    .index("by_dealershipId", ["dealershipId"]),

  dealerships: defineTable({
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
  })
    .index("by_brand", ["brand"])
    .index("by_location", ["location"])
    .index("by_city", ["city"])
    .index("by_province", ["province"])
    .index("by_isActive", ["isActive"]),

  notifications: defineTable({
    userId: v.string(),
    type: v.string(),
    title: v.string(),
    message: v.string(),
    senderId: v.optional(v.string()),
    bookingId: v.optional(v.id("bookings")),
    financeApplicationId: v.optional(v.id("financeApplications")),
    testDriveId: v.optional(v.id("testDrives")),
    customerUserId: v.optional(v.string()),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    vehicleInventoryItemId: v.optional(v.id("inventory")),
    vehicleDescription: v.optional(v.string()),
    vehicleImageUrl: v.optional(v.string()),
    vehicleYear: v.optional(v.number()),
    vehicleMake: v.optional(v.string()),
    vehicleModel: v.optional(v.string()),
    vehicleVariant: v.optional(v.string()),
    vehiclePrice: v.optional(v.number()),
    vehicleColor: v.optional(v.string()),
    postId: v.optional(v.string()),
    targetRoute: v.optional(v.string()),
    targetId: v.optional(v.string()),
    isRead: v.boolean(),
    isArchived: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    // NEVER delete notifications - they are permanent records
  })
    .index("by_userId", ["userId"])
    .index("by_userId_read", ["userId", "isRead"])
    .index("by_userId_read_isArchived", ["userId", "isRead", "isArchived"]),

  calendarEntries: defineTable({
    userId: v.string(),
    bookingId: v.optional(v.id("bookings")),
    title: v.string(),
    details: v.optional(v.string()),
    date: v.string(),
    time: v.optional(v.string()),
    endDate: v.optional(v.string()),
    allDay: v.boolean(),
    source: v.string(), // "booking" | "manual"
    reminderAt: v.optional(v.number()),
    googleCalendarUrl: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    isCompleted: v.optional(v.boolean()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_date", ["userId", "date"])
    .index("by_bookingId", ["bookingId"]),

  appSettings: defineTable({
    tokenEarningEnabled: v.boolean(),
    userPostingEnabled: v.optional(v.boolean()),
    updatedAt: v.number(),
  }),

  brochures: defineTable({
    title: v.string(),
    fileName: v.string(),
    fileUrl: v.string(),
    storageId: v.string(),
    mimeType: v.string(),
    isActive: v.boolean(),
    uploadedByUserId: v.string(),
    uploadedByName: v.string(),
    uploadedAt: v.number(),
  }).index("by_isActive", ["isActive"]),

  widgetVisibility: defineTable({
    key: v.string(),
    hidden: v.boolean(),
    updatedAt: v.number(),
    updatedByUserId: v.optional(v.string()),
  }).index("by_key", ["key"]),

  events: defineTable({
    creatorUserId: v.string(),
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
    feedPostId: v.optional(v.string()),
    isDeleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_creatorUserId", ["creatorUserId"])
    .index("by_isDeleted_and_createdAt", ["isDeleted", "createdAt"])
    .index("by_date", ["date"]),

  eventInvites: defineTable({
    eventId: v.id("events"),
    inviterUserId: v.string(),
    inviteeUserId: v.string(),
    status: v.string(), // "invited" | "declined" | "accepted"
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_inviteeUserId", ["inviteeUserId"])
    .index("by_eventId_and_inviteeUserId", ["eventId", "inviteeUserId"]),

  eventInterests: defineTable({
    eventId: v.id("events"),
    userId: v.string(),
    isInterested: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_userId", ["userId"])
    .index("by_eventId_and_userId", ["eventId", "userId"]),

  groups: defineTable({
    groupId: v.string(),
    creatorUserId: v.string(),
    name: v.string(),
    description: v.string(),
    category: v.string(), // "club" | "initiative"
    avatarImageStorageId: v.optional(v.id("_storage")),
    avatarImageUrl: v.optional(v.string()),
    backgroundImageStorageId: v.optional(v.id("_storage")),
    backgroundImageUrl: v.optional(v.string()),
    criteriaText: v.optional(v.string()),
    rulesText: v.optional(v.string()),
    joinQuestions: v.array(v.string()),
    feedPostId: v.optional(v.string()),
    isClosed: v.boolean(),
    isDeleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_creatorUserId", ["creatorUserId"])
    .index("by_category", ["category"])
    .index("by_isClosed_and_createdAt", ["isClosed", "createdAt"])
    .index("by_groupId", ["groupId"])
    .index("by_groupId_and_createdAt", ["groupId", "createdAt"]),

  groupMemberships: defineTable({
    groupId: v.string(),
    userId: v.string(),
    role: v.string(), // "owner" | "admin" | "member"
    status: v.string(), // "pending" | "accepted" | "rejected" | "removed"
    reviewedByUserId: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    joinedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_groupId", ["groupId"])
    .index("by_userId", ["userId"])
    .index("by_groupId_and_userId", ["groupId", "userId"])
    .index("by_status", ["status"]),

  groupJoinRequests: defineTable({
    requestId: v.string(),
    groupId: v.string(),
    userId: v.string(),
    answers: v.array(v.object({
      question: v.string(),
      answer: v.string(),
    })),
    note: v.optional(v.string()),
    status: v.string(), // "pending" | "accepted" | "rejected"
    reviewedByUserId: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_groupId", ["groupId"])
    .index("by_userId", ["userId"])
    .index("by_groupId_and_userId", ["groupId", "userId"])
    .index("by_status", ["status"]),

  groupReports: defineTable({
    reportId: v.string(),
    groupId: v.string(),
    reporterUserId: v.string(),
    reason: v.string(),
    details: v.optional(v.string()),
    status: v.string(), // "open" | "reviewed" | "closed"
    reviewedByUserId: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_groupId", ["groupId"])
    .index("by_reporterUserId", ["reporterUserId"])
    .index("by_status", ["status"]),

  messages: defineTable({
    ownerUserId: v.optional(v.string()),
    bookingId: v.optional(v.id("bookings")),
    partsOrderId: v.optional(v.id("partsOrders")),
    senderId: v.string(),
    senderName: v.string(),
    senderRole: v.string(), // "customer" | "staff"
    recipientId: v.optional(v.string()),
    content: v.string(),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    vehicleInventoryItemId: v.optional(v.id("inventory")),
    vehicleDescription: v.optional(v.string()),
    vehicleImageUrl: v.optional(v.string()),
    vehicleYear: v.optional(v.number()),
    vehicleMake: v.optional(v.string()),
    vehicleModel: v.optional(v.string()),
    vehicleVariant: v.optional(v.string()),
    vehiclePrice: v.optional(v.number()),
    vehicleColor: v.optional(v.string()),
    attachmentStorageIds: v.optional(v.array(v.string())),
    attachmentNames: v.optional(v.array(v.string())),
    isRead: v.boolean(),
    isArchived: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
  })
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_bookingId", ["bookingId"])
    .index("by_partsOrderId", ["partsOrderId"])
    .index("by_senderId", ["senderId"])
    .index("by_recipientId", ["recipientId"]),

  activityLog: defineTable({
    ownerId: v.optional(v.string()),
    ownerUserId: v.optional(v.string()),
    owner_id: v.optional(v.string()),
    type: v.string(),
    title: v.string(),
    description: v.string(),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerUserId: v.optional(v.string()),
    actorName: v.optional(v.string()),
    metadata: v.optional(v.string()),
    isNotified: v.boolean(),
    triggeredBy: v.optional(v.string()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_owner_id", ["owner_id"])
    .index("by_type", ["type"])
    .index("by_triggeredBy", ["triggeredBy"])
    .index("by_isNotified", ["isNotified"]),

  inventory: defineTable({
    ownerUserId: v.optional(v.string()),
    category: v.string(),
    make: v.string(),
    model: v.string(),
    year: v.number(),
    variant: v.optional(v.string()),
    color: v.optional(v.string()),
    vin: v.optional(v.string()),
    price: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    cashbackAmount: v.optional(v.number()),
    specialLabel: v.optional(v.string()),
    specialNotes: v.optional(v.string()),
    specialPrice: v.optional(v.number()),
    status: v.string(),
    imageUrl: v.optional(v.string()),
    imageIds: v.optional(v.array(v.id("_storage"))), // legacy - kept for migration
    storedImageUrls: v.optional(v.array(v.string())), // direct image URLs
    sourceName: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceLocation: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    isAvailable: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    addedBy: v.optional(v.string()),
  })
    .index("by_category", ["category"])
    .index("by_make", ["make"])
    .index("by_status", ["status"])
    .index("by_sourceUrl", ["sourceUrl"])
    .index("by_sourceName", ["sourceName"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_addedBy", ["addedBy"]),

  merchandiseItems: defineTable({
    brand: v.union(v.literal("Hyundai"), v.literal("Kia")),
    title: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    sku: v.optional(v.string()),
    price: v.number(),
    stockQuantity: v.number(),
    isAvailable: v.boolean(),
    isVisibleToCustomers: v.optional(v.boolean()),
    imageUrls: v.array(v.string()),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
    sizeAllocations: v.optional(v.array(v.object({
      size: v.string(),
      quantity: v.number(),
    }))),
    createdByUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_brand", ["brand"])
    .index("by_brand_and_isAvailable", ["brand", "isAvailable"])
    .index("by_brand_and_createdAt", ["brand", "createdAt"])
    .index("by_sku", ["sku"]),

  merchandiseCategories: defineTable({
    brand: v.union(v.literal("Hyundai"), v.literal("Kia")),
    name: v.string(),
    createdByUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_brand", ["brand"])
    .index("by_brand_and_name", ["brand", "name"])
    .index("by_brand_and_createdAt", ["brand", "createdAt"]),

  merchandiseOrders: defineTable({
    userId: v.string(),
    brand: v.union(v.literal("Hyundai"), v.literal("Kia")),
    merchandiseItemId: v.id("merchandiseItems"),
    itemTitle: v.string(),
    itemDescription: v.optional(v.string()),
    itemImageUrls: v.optional(v.array(v.string())),
    sku: v.optional(v.string()),
    quantity: v.number(),
    unitPrice: v.number(),
    subtotalAmount: v.optional(v.number()),
    deliveryFee: v.optional(v.number()),
    totalAmount: v.number(),
    invoiceNumber: v.optional(v.string()),
    invoiceSentAt: v.optional(v.number()),
    companyDetails: v.optional(v.string()),
    fulfillmentType: v.string(),
    deliveryAddress: v.optional(v.string()),
    contactPreference: v.optional(v.string()),
    notes: v.optional(v.string()),
    customerName: v.string(),
    customerPhone: v.string(),
    bankingDetails: v.optional(v.string()),
    quoteAttachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    quoteAttachmentNames: v.optional(v.array(v.string())),
    status: v.string(),
    paymentProofStorageIds: v.optional(v.array(v.id("_storage"))),
    paymentProofNames: v.optional(v.array(v.string())),
    paymentProofTypes: v.optional(v.array(v.string())),
    paymentProofUrls: v.optional(v.array(v.string())),
    paymentProofSubmittedAt: v.optional(v.number()),
    paymentConfirmedAt: v.optional(v.number()),
    receivedByUserId: v.optional(v.string()),
    receivedByName: v.optional(v.string()),
    availabilityConfirmedByUserId: v.optional(v.string()),
    availabilityConfirmedByName: v.optional(v.string()),
    fulfilledAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    acknowledgedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_brand", ["userId", "brand"])
    .index("by_brand", ["brand"])
    .index("by_brand_and_status", ["brand", "status"])
    .index("by_merchandiseItemId", ["merchandiseItemId"])
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  merchandiseOrderLedger: defineTable({
    merchandiseOrderId: v.id("merchandiseOrders"),
    entryType: v.string(),
    description: v.string(),
    amount: v.number(),
    currency: v.string(),
    createdByUserId: v.string(),
    createdByName: v.optional(v.string()),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_merchandiseOrderId", ["merchandiseOrderId"])
    .index("by_merchandiseOrderId_and_createdAt", ["merchandiseOrderId", "createdAt"])
    .index("by_entryType", ["entryType"]),

  shoppingCartItems: defineTable({
    userId: v.string(),
    cartType: v.string(),
    brand: v.optional(v.union(v.literal("Hyundai"), v.literal("Kia"))),
    merchandiseItemId: v.optional(v.id("merchandiseItems")),
    title: v.string(),
    description: v.optional(v.string()),
    sku: v.optional(v.string()),
    unitPrice: v.number(),
    quantity: v.number(),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    vehicleVin: v.optional(v.string()),
    yearModel: v.optional(v.string()),
    contactDetails: v.optional(v.string()),
    orderType: v.optional(v.string()),
    itemDescription: v.optional(v.string()),
    referencePhotos: v.optional(v.array(v.string())),
    fulfillmentType: v.optional(v.string()),
    deliveryAddress: v.optional(v.string()),
    dropOffAddress: v.optional(v.string()),
    contactPreference: v.optional(v.string()),
    notes: v.optional(v.string()),
    imageUrls: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_cartType", ["userId", "cartType"])
    .index("by_merchandiseItemId", ["merchandiseItemId"])
    .index("by_cartType", ["cartType"]),

  rewards: defineTable({
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
    earningsLog: v.optional(v.array(v.object({
      type: v.string(),
      amount: v.number(),
      description: v.string(),
      timestamp: v.number(),
      km: v.optional(v.number()),
    }))),
  }).index("by_userId", ["userId"]),

  referralWallets: defineTable({
    userId: v.string(),
    balance: v.number(),
    totalEarned: v.number(),
    totalWithdrawn: v.number(),
    lastUpdatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  referralWalletTransactions: defineTable({
    userId: v.string(),
    sourceType: v.string(),
    sourceId: v.string(),
    transactionType: v.string(),
    amount: v.number(),
    description: v.string(),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_sourceType_and_sourceId", ["sourceType", "sourceId"]),

  tradeIns: defineTable({
    ownerId: v.optional(v.string()),
    ownerUserId: v.optional(v.string()),
    userId: v.string(),
    customerProfileId: v.optional(v.string()),
    firstName: v.string(),
    surname: v.string(),
    idNumber: v.string(),
    contactDetails: v.string(),
    vehicleName: v.string(),
    yearModel: v.string(),
    colour: v.string(),
    spareKey: v.string(),
    serviceHistory: v.string(),
    reg: v.string(),
    mileage: v.string(),
    vin: v.string(),
    engineNumber: v.string(),
    underFinance: v.string(),
    financedByBank: v.optional(v.string()),
    expectedValue: v.string(),
    purchaseIntent: v.string(),
    imageUrls: v.array(v.string()),
    imageNames: v.array(v.string()),
    status: v.string(),
    appointmentAt: v.optional(v.number()),
    finalOfferAmount: v.optional(v.number()),
    staffNotes: v.optional(v.string()),
    assignedToUserId: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    financeApplicationId: v.optional(v.id("financeApplications")),
    dealershipId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_status", ["status"])
    .index("by_assignedToUserId", ["assignedToUserId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_dealershipId", ["dealershipId"]),

  withdrawalRequests: defineTable({
    ownerId: v.optional(v.string()),
    ownerUserId: v.optional(v.string()),
    userId: v.string(),
    requesterName: v.string(),
    requesterRole: v.optional(v.string()),
    walletType: v.string(),
    amount: v.number(),
    currency: v.optional(v.string()),
    invoiceNumber: v.string(),
    invoiceUrl: v.optional(v.string()),
    attachmentUrls: v.array(v.string()),
    attachmentNames: v.array(v.string()),
    notes: v.optional(v.string()),
    status: v.string(),
    requestedAt: v.number(),
    approvedAt: v.optional(v.number()),
    approvedByUserId: v.optional(v.string()),
    approvedByName: v.optional(v.string()),
    rejectedAt: v.optional(v.number()),
    rejectedByUserId: v.optional(v.string()),
    rejectedByName: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),
    dpNotifiedAt: v.optional(v.number()),
    department: v.optional(v.string()),
    acknowledgedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_status", ["status"])
    .index("by_walletType", ["walletType"])
    .index("by_invoiceNumber", ["invoiceNumber"])
    .index("by_createdAt", ["createdAt"]),

  warrantyClaims: defineTable({
    ownerId: v.optional(v.string()),
    ownerUserId: v.optional(v.string()),
    userId: v.string(),
    requesterName: v.string(),
    requesterRole: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    customerProfileId: v.optional(v.string()),
    warrantyClaimNumber: v.string(),
    vehicleDescription: v.string(),
    vin: v.optional(v.string()),
    registration: v.optional(v.string()),
    mileage: v.optional(v.string()),
    issueDescription: v.string(),
    attachmentUrls: v.array(v.string()),
    attachmentNames: v.array(v.string()),
    notes: v.optional(v.string()),
    status: v.string(),
    assignedToUserId: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    department: v.optional(v.string()),
    acknowledgedAt: v.optional(v.number()),
    reviewedAt: v.optional(v.number()),
    reviewedByUserId: v.optional(v.string()),
    reviewedByName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_status", ["status"])
    .index("by_dealershipId", ["dealershipId"])
    .index("by_assignedToUserId", ["assignedToUserId"])
    .index("by_createdAt", ["createdAt"]),

  salesExecutiveWallets: defineTable({
    userId: v.string(),
    balance: v.number(),
    totalEarned: v.number(),
    totalWithdrawn: v.number(),
    lastUpdatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  salesExecutiveWalletTransactions: defineTable({
    userId: v.string(),
    bookingId: v.id("bookings"),
    transactionType: v.string(),
    amount: v.number(),
    description: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_bookingId", ["bookingId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  testDrives: defineTable({
    ownerUserId: v.optional(v.string()),
    userId: v.string(),
    customerProfileId: v.optional(v.string()),
    userName: v.string(),
    userEmail: v.optional(v.string()),
    userPhone: v.optional(v.string()),
    userImage: v.optional(v.string()),
    inventoryItemId: v.id("inventory"),
    vehicleDescription: v.string(), // "2025 Hyundai Tucson Elite"
    preferredDate: v.string(),
    preferredTime: v.string(),
    confirmedDate: v.optional(v.string()),
    confirmedTime: v.optional(v.string()),
    pickupLocation: v.optional(v.string()),
    pickupTime: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    dealershipName: v.optional(v.string()),
    dealershipBrand: v.optional(v.string()),
    status: v.string(), // "pending" | "confirmed" | "rejected" | "completed" | "cancelled"
    notes: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    acknowledgedAt: v.optional(v.number()),
    assignedTo: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    assignedToUserId: v.optional(v.string()),
    assignedDriverName: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_assignedToUserId", ["assignedToUserId"])
    .index("by_status", ["status"])
    .index("by_inventoryItemId", ["inventoryItemId"])
    .index("by_dealershipId", ["dealershipId"]),

  financeApplications: defineTable({
    ownerId: v.optional(v.string()),
    ownerUserId: v.optional(v.string()),
    owner_id: v.optional(v.string()),
    userId: v.string(),
    customerProfileId: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    // Vehicle of interest
    inventoryItemId: v.optional(v.id("inventory")),
    vehicleDescription: v.optional(v.string()),
    dealerSupplier: v.optional(v.string()),
    dealerContactPerson: v.optional(v.string()),
    cashPriceVatIncl: v.optional(v.string()),
    vatableExtrasVatIncl: v.optional(v.string()),
    addCover: v.optional(v.string()),
    radioTape: v.optional(v.string()),
    licenceReg: v.optional(v.string()),
    numberPlates: v.optional(v.string()),
    creditLife: v.optional(v.string()),
    warranty: v.optional(v.string()),
    advance: v.optional(v.string()),
    arrears: v.optional(v.string()),
    residual: v.optional(v.string()),
    // Personal Details
    title: v.optional(v.string()),
    initials: v.optional(v.string()),
    firstName: v.string(),
    surname: v.string(),
    dependants: v.optional(v.string()),
    maritalStatus: v.optional(v.string()),
    dateMarried: v.optional(v.string()),
    idNumber: v.string(),
    address: v.string(),
    homeAddress: v.optional(v.string()),
    postalAddress: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    homeTel: v.optional(v.string()),
    workTel: v.optional(v.string()),
    cell: v.optional(v.string()),
    fax: v.optional(v.string()),
    email: v.string(),
    phone: v.string(),
    spouseNames: v.optional(v.string()),
    spouseId: v.optional(v.string()),
    occupation: v.optional(v.string()),
    // Next of Kin
    nextOfKinName: v.string(),
    nextOfKinRelationship: v.optional(v.string()),
    nextOfKinAddress: v.string(),
    nextOfKinTel: v.optional(v.string()),
    // Employment
    employerName: v.string(),
    employerContact: v.string(),
    employerAddress: v.string(),
    salaryDate: v.string(),
    yearsAtCompany: v.string(),
    grossIncome: v.string(),
    monthlyCommission: v.optional(v.string()),
    carAllowance: v.optional(v.string()),
    otherIncome: v.optional(v.string()),
    otherIncomeSource: v.optional(v.string()),
    netIncome: v.string(),
    monthlyExpenses: v.string(),
    bondPaymentRent: v.optional(v.string()),
    // Banking
    bankName: v.string(),
    accountNumber: v.string(),
    accountType: v.string(),
    // Bond / housing
    bondHolder: v.optional(v.string()),
    propertyValue: v.optional(v.string()),
    installment: v.optional(v.string()),
    purchasePrice: v.optional(v.string()),
    datePurchased: v.optional(v.string()),
    registeredAs: v.optional(v.string()),
    ownName: v.optional(v.string()),
    spouse: v.optional(v.string()),
    renting: v.optional(v.string()),
    amountOutstanding: v.optional(v.string()),
    // Trade-in (optional)
    hasTradeIn: v.boolean(),
    tradeInFinancingBank: v.optional(v.string()),
    tradeInCarBrand: v.optional(v.string()),
    tradeInYearModel: v.optional(v.string()),
    tradeInKm: v.optional(v.string()),
    tradeInColour: v.optional(v.string()),
    tradeInServiceHistory: v.optional(v.string()),
    tradeInSpareKey: v.optional(v.string()),
    // Supporting documents (optional)
    attachmentUrls: v.optional(v.array(v.string())),
    attachmentNames: v.optional(v.array(v.string())),
    // Document submission
    documentMethod: v.optional(v.string()), // "whatsapp" | "email"
    detailedSummary: v.optional(v.string()),
    // Status
    status: v.string(), // "submitted" | "under_review" | "approved" | "declined" | "more_info_needed"
    staffNotes: v.optional(v.string()),
    acknowledgedAt: v.optional(v.number()),
    assignedTo: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    assignedToUserId: v.optional(v.string()),
    assignedByUserId: v.optional(v.string()),
    assignedByName: v.optional(v.string()),
    assignedAt: v.optional(v.number()),
    reassignedAt: v.optional(v.number()),
    dealStatus: v.optional(v.string()), // "open" | "won" | "delivered" | "closed"
    closedDeal: v.optional(v.boolean()),
    closedDealAt: v.optional(v.number()),
    closedByUserId: v.optional(v.string()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_owner_id", ["owner_id"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_assignedToUserId", ["assignedToUserId"])
    .index("by_closedDeal", ["closedDeal"])
    .index("by_dealershipId", ["dealershipId"])
    .index("by_dealershipId_and_status", ["dealershipId", "status"]),

  partsOrders: defineTable({
    ownerId: v.optional(v.string()),
    ownerUserId: v.optional(v.string()),
    userId: v.string(),
    customerName: v.string(),
    customerPhone: v.string(),
    vehicleVin: v.string(),
    yearModel: v.optional(v.string()),
    contactDetails: v.string(),
    orderType: v.string(),
    itemDescription: v.string(),
    referencePhotos: v.optional(v.array(v.string())),
    fulfillmentType: v.string(), // "pickup" | "drop_off"
    dropOffAddress: v.optional(v.string()),
    contactPreference: v.optional(v.string()),
    notes: v.optional(v.string()),
    pendingItems: v.optional(v.string()),
    partCost: v.optional(v.number()),
    deliveryFee: v.optional(v.number()),
    totalAmount: v.optional(v.number()),
    bankingDetails: v.optional(v.string()),
    quoteAttachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    quoteAttachmentNames: v.optional(v.array(v.string())),
    paymentProofStorageIds: v.optional(v.array(v.id("_storage"))),
    paymentProofNames: v.optional(v.array(v.string())),
    paymentProofTypes: v.optional(v.array(v.string())),
    paymentProofSubmittedAt: v.optional(v.number()),
    paymentConfirmedByUserId: v.optional(v.string()),
    paymentConfirmedByName: v.optional(v.string()),
    reviewRequired: v.optional(v.boolean()),
    reviewId: v.optional(v.id("reviews")),
    reviewedAt: v.optional(v.number()),
    fulfilledAt: v.optional(v.number()),
    acknowledgedAt: v.optional(v.number()),
    assignedToUserId: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    receivedByUserId: v.optional(v.string()),
    receivedByName: v.optional(v.string()),
    availabilityConfirmedByUserId: v.optional(v.string()),
    availabilityConfirmedByName: v.optional(v.string()),
    bankingDetailsSentAt: v.optional(v.number()),
    paymentConfirmedAt: v.optional(v.number()),
    driverScheduleId: v.optional(v.id("driverSchedules")),
    department: v.optional(v.string()),
    status: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_assignedToUserId", ["assignedToUserId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_reviewRequired", ["reviewRequired"]),

  partsOrderLedger: defineTable({
    partsOrderId: v.id("partsOrders"),
    entryType: v.string(),
    description: v.string(),
    amount: v.number(),
    currency: v.string(),
    createdByUserId: v.string(),
    createdByName: v.optional(v.string()),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_partsOrderId", ["partsOrderId"])
    .index("by_partsOrderId_and_createdAt", ["partsOrderId", "createdAt"])
    .index("by_entryType", ["entryType"]),

  driverSchedules: defineTable({
    ownerUserId: v.optional(v.string()),
    driverUserId: v.optional(v.string()),
    driverName: v.optional(v.string()),
    sourceType: v.string(), // "booking" | "parts_order" | "manual"
    bookingId: v.optional(v.id("bookings")),
    partsOrderId: v.optional(v.id("partsOrders")),
    customerName: v.string(),
    contactDetails: v.optional(v.string()),
    address: v.optional(v.string()),
    scheduleDate: v.string(),
    scheduleTime: v.optional(v.string()),
    status: v.string(), // "received" | "in_progress" | "completed"
    notes: v.optional(v.string()),
    receivedByUserId: v.optional(v.string()),
    receivedByName: v.optional(v.string()),
    completedByUserId: v.optional(v.string()),
    completedByName: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  })
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_driverUserId", ["driverUserId"])
    .index("by_status", ["status"])
    .index("by_partsOrderId", ["partsOrderId"])
    .index("by_bookingId", ["bookingId"])
    .index("by_scheduleDate", ["scheduleDate"]),

  reviews: defineTable({
    userId: v.string(),
    userName: v.string(),
    userEmail: v.optional(v.string()),
    bookingId: v.optional(v.id("bookings")),
    testDriveId: v.optional(v.id("testDrives")),
    partsOrderId: v.optional(v.id("partsOrders")),
    serviceType: v.string(),
    vehicleDescription: v.optional(v.string()),
    rating: v.number(), // 1-5 stars
    title: v.optional(v.string()),
    comment: v.string(),
    staffName: v.optional(v.string()),
    sharedToGoogle: v.boolean(),
    isPublic: v.boolean(),
    staffResponse: v.optional(v.string()),
    staffRespondedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_bookingId", ["bookingId"])
    .index("by_testDriveId", ["testDriveId"])
    .index("by_partsOrderId", ["partsOrderId"])
    .index("by_rating", ["rating"]),

  posts: defineTable({
    postId: v.string(),
    userId: v.string(),
    role: v.string(),
    postType: v.optional(v.string()),
    title: v.optional(v.string()),
    content: v.string(),
    image: v.optional(v.string()),
    video: v.optional(v.string()),
    videoStorageId: v.optional(v.string()),
    imageStorageIds: v.optional(v.array(v.string())),
    imageUrls: v.optional(v.array(v.string())),
    mediaType: v.optional(v.union(v.literal("image"), v.literal("video"))),
    isSharedToMainFeed: v.optional(v.boolean()),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    vehicleInventoryItemId: v.optional(v.id("inventory")),
    vehicleDescription: v.optional(v.string()),
    vehicleImageUrl: v.optional(v.string()),
    vehicleYear: v.optional(v.number()),
    vehicleMake: v.optional(v.string()),
    vehicleModel: v.optional(v.string()),
    vehicleVariant: v.optional(v.string()),
    vehiclePrice: v.optional(v.number()),
    vehicleColor: v.optional(v.string()),
    authorDisplayName: v.optional(v.string()),
    authorProfileImage: v.optional(v.string()),
    authorPhone: v.optional(v.string()),
    authorStaffRole: v.optional(v.string()),
    authorDealershipId: v.optional(v.string()),
    authorDealershipName: v.optional(v.string()),
    authorDealershipBrand: v.optional(v.string()),
    authorDealershipLocation: v.optional(v.string()),
    isApproved: v.boolean(),
    isDeleted: v.boolean(),
    likeCount: v.number(),
    viewCount: v.optional(v.number()),
    commentCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_isDeleted_and_isApproved_and_createdAt", ["isDeleted", "isApproved", "createdAt"])
    .index("by_postType_and_createdAt", ["postType", "createdAt"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_postId", ["postId"]),

  postViews: defineTable({
    postId: v.string(),
    viewerId: v.string(),
    viewerEmail: v.optional(v.string()),
    viewedAt: v.number(),
  })
    .index("by_postId", ["postId"])
    .index("by_postId_and_viewerId", ["postId", "viewerId"])
    .index("by_viewerId", ["viewerId"]),

  postArchives: defineTable({
    postId: v.string(),
    userId: v.string(),
    archivedAt: v.number(),
    snapshot: v.string(),
    deletedByUserId: v.optional(v.string()),
    deletedByName: v.optional(v.string()),
    deletedByEmail: v.optional(v.string()),
  })
    .index("by_postId", ["postId"])
    .index("by_userId", ["userId"])
    .index("by_userId_archivedAt", ["userId", "archivedAt"]),

  postLikes: defineTable({
    postId: v.string(),
    userId: v.string(),
    createdAt: v.number(),
    isDeleted: v.boolean(),
  })
    .index("by_postId_and_userId", ["postId", "userId"])
    .index("by_postId", ["postId"])
    .index("by_userId", ["userId"]),

  postReactions: defineTable({
    postId: v.string(),
    userId: v.string(),
    reactionType: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    isDeleted: v.boolean(),
  })
    .index("by_postId", ["postId"])
    .index("by_postId_and_userId", ["postId", "userId"])
    .index("by_userId", ["userId"]),

  postComments: defineTable({
    commentId: v.string(),
    postId: v.string(),
    userId: v.string(),
    text: v.string(),
    parentCommentId: v.optional(v.string()),
    likeCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    isDeleted: v.boolean(),
  })
    .index("by_postId_and_createdAt", ["postId", "createdAt"])
    .index("by_postId", ["postId"])
    .index("by_userId", ["userId"])
    .index("by_commentId", ["commentId"]),

  commentReactions: defineTable({
    commentId: v.string(),
    userId: v.string(),
    reactionType: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    isDeleted: v.boolean(),
  })
    .index("by_commentId", ["commentId"])
    .index("by_commentId_and_userId", ["commentId", "userId"])
    .index("by_userId", ["userId"]),

  follows: defineTable({
    followerId: v.string(),
    followingId: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    isDeleted: v.boolean(),
  })
    .index("by_followerId_and_followingId", ["followerId", "followingId"])
    .index("by_followerId", ["followerId"])
    .index("by_followingId", ["followingId"]),

  customers: defineTable({
    ownerId: v.string(),
    owner_id: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    name: v.string(),
    contactInfo: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notesSummary: v.optional(v.string()),
    isCommunityVisible: v.boolean(),
    isDeleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_owner_id", ["owner_id"])
    .index("by_ownerId_and_createdAt", ["ownerId", "createdAt"])
    .index("by_isCommunityVisible_and_createdAt", ["isCommunityVisible", "createdAt"])
    .index("by_dealershipId", ["dealershipId"])
    .index("by_dealershipId_and_createdAt", ["dealershipId", "createdAt"]),

  customerNotes: defineTable({
    ownerId: v.string(),
    customerId: v.id("customerProfiles"),
    authorId: v.string(),
    body: v.string(),
    isDeleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_customerId", ["customerId"])
    .index("by_ownerId_and_customerId", ["ownerId", "customerId"])
    .index("by_customerId_and_createdAt", ["customerId", "createdAt"]),

  customerReminders: defineTable({
    ownerId: v.string(),
    customerId: v.id("customerProfiles"),
    createdBy: v.string(),
    title: v.string(),
    dueAt: v.number(),
    status: v.string(),
    notes: v.optional(v.string()),
    isDeleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_customerId", ["customerId"])
    .index("by_ownerId_and_customerId", ["ownerId", "customerId"])
    .index("by_dueAt", ["dueAt"]),

  directMessages: defineTable({
    ownerId: v.string(),
    customerId: v.optional(v.id("customers")),
    senderId: v.string(),
    recipientId: v.string(),
    body: v.string(),
    isRead: v.boolean(),
    isDeleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_customerId", ["customerId"])
    .index("by_recipientId", ["recipientId"])
    .index("by_ownerId_and_customerId", ["ownerId", "customerId"])
    .index("by_createdAt", ["createdAt"]),

  referrals: defineTable({
    referrerId: v.string(),
    referrerName: v.string(),
    referralCode: v.string(),
    platform: v.string(),
    status: v.string(),
    referredUserName: v.optional(v.string()),
    tokenReward: v.optional(v.number()),
  })
    .index("by_referrerId", ["referrerId"])
    .index("by_referralCode", ["referralCode"])
    .index("by_status", ["status"]),

  customerProfiles: defineTable({
    ownerId: v.optional(v.string()),
    ownerUserId: v.optional(v.string()),
    owner_id: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
    workspaceId: v.optional(v.string()),
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
    allocatedVehicleDescription: v.optional(v.string()),
    allocatedVehicleInventoryItemId: v.optional(v.id("inventory")),
    allocatedVehicleMake: v.optional(v.string()),
    allocatedVehicleModel: v.optional(v.string()),
    allocatedVehicleYear: v.optional(v.number()),
    allocatedVehicleVin: v.optional(v.string()),
    allocatedVehicleRegistration: v.optional(v.string()),
    allocatedVehicleStatus: v.optional(v.string()),
    allocatedVehicleSoldAt: v.optional(v.number()),
    allocatedVehicleDeliveredAt: v.optional(v.number()),
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
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_owner_id", ["owner_id"])
    .index("by_ownerUserId_and_createdAt", ["ownerUserId", "createdAt"])
    .index("by_assignedToUserId", ["assignedToUserId"])
    .index("by_assignedToUserId_and_createdAt", ["assignedToUserId", "createdAt"])
    .index("by_assignedByUserId", ["assignedByUserId"])
    .index("by_linkedUserId", ["linkedUserId"])
    .index("by_phone", ["phone"])
    .index("by_isActive", ["isActive"])
    .index("by_dealershipId", ["dealershipId"])
    .index("by_dealershipId_and_createdAt", ["dealershipId", "createdAt"])
    .index("by_workspaceId", ["workspaceId"])
    .index("by_workspaceId_and_createdAt", ["workspaceId", "createdAt"]),

  whatsappMessages: defineTable({
    customerId: v.string(),
    customerName: v.string(),
    customerPhone: v.string(),
    message: v.string(),
    messageType: v.string(),
    sentBy: v.string(),
    sentAt: v.number(),
    status: v.string(),
  })
    .index("by_customerId", ["customerId"])
    .index("by_sentAt", ["sentAt"]),

  financeRecords: defineTable({
    ownerId: v.string(),
    owner_id: v.optional(v.string()),
    customerId: v.id("customers"),
    createdBy: v.string(),
    dealValue: v.optional(v.number()),
    status: v.string(),
    lenderName: v.optional(v.string()),
    notes: v.optional(v.string()),
    isDeleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_owner_id", ["owner_id"])
    .index("by_customerId", ["customerId"])
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),
});

export default schema;