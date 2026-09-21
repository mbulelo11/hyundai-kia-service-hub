export const api = {
  users: {
    me: undefined,
    listAll: undefined,
    listAppAccounts: undefined,
    ensureRole: async () => undefined,
    touchPresence: async () => undefined,
    setAssignedStaff: async () => undefined,
    updateProfile: async () => undefined,
    generateProfileUploadUrl: async () => '',
    publicAvailableStaff: undefined,
  },
  notifications: {
    getUnreadCount: undefined,
    listMine: undefined,
  },
  messages: {
    listMyConversations: undefined,
    send: async () => undefined,
  },
  customerProfiles: {
    autoLink: async () => undefined,
    getMyProfile: undefined,
    syncMyProfile: async () => undefined,
  },
  staff: {
    publicAvailableStaff: undefined,
  },
  bookings: {
    getUpcoming: undefined,
    getLatest: undefined,
    create: async () => undefined,
    listMine: undefined,
    getById: undefined,
  },
  ai: {
    getContext: undefined,
    chat: async () => undefined,
  },
  rewards: {
    getWallet: undefined,
  },
  referrals: {
    getMyCode: undefined,
    listMine: undefined,
    trackShare: async () => undefined,
  },
  socialAccounts: {
    getConnectionStatus: undefined,
    listMine: undefined,
    connect: async () => undefined,
    disconnect: async () => undefined,
  },
  hederaWallets: {
    listMine: undefined,
    connectNative: async () => undefined,
    connectExternal: async () => undefined,
    disconnect: async () => undefined,
  },
  posts: {
    generateUploadUrl: async () => '',
    createPost: async () => undefined,
    publicGetPostPreview: undefined,
  },
  events: {
    listAll: undefined,
    createEvent: async () => undefined,
    inviteUsers: async () => undefined,
    toggleInterest: async () => undefined,
  },
  groups: {
    listAll: undefined,
    listMine: undefined,
    listPendingRequests: undefined,
    createGroup: async () => undefined,
    requestJoin: async () => undefined,
    reviewJoinRequest: async () => undefined,
    closeGroup: async () => undefined,
    reportGroup: async () => undefined,
  },
  activityLog: {
    trackStockEngagement: async () => undefined,
  },
  partsOrders: {
    listForStaff: undefined,
  },
  vehicles: {
    list: undefined,
    add: async () => undefined,
    setDefault: async () => undefined,
    remove: async () => undefined,
  },
  ratings: {
    submit: async () => undefined,
  },
};

export default api;
