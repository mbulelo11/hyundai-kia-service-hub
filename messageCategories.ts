export type MessageCategoryKey =
  | 'serviceBookings'
  | 'vehicleEnquiries'
  | 'testDriveBookings'
  | 'events'
  | 'partsOrders'
  | 'merchandiseOrders'
  | 'financeApplications'
  | 'warrantyClaims'
  | 'referralWallet';

export type MessageCategoryRoute = {
  route: string;
  params?: Record<string, any>;
};

export type MessageCategoryItem = {
  key: MessageCategoryKey;
  label: string;
  description: string;
  icon: string;
  customerRoute: MessageCategoryRoute;
  staffRoute: MessageCategoryRoute;
};

export type MessageMenuItem = {
  key: string;
  label: string;
  icon: string;
  route: string;
  params?: Record<string, any>;
  description?: string;
};

export type MessageMenuSection = {
  title: string;
  items: MessageMenuItem[];
};

export const MESSAGE_CATEGORY_ITEMS: MessageCategoryItem[] = [
  {
    key: 'serviceBookings',
    label: 'Service bookings',
    description: 'Questions, replies, and updates tied to service work.',
    icon: 'construct-outline',
    customerRoute: { route: 'Main', params: { screen: 'BookingsTab' } },
    staffRoute: { route: 'StaffInbox' },
  },
  {
    key: 'vehicleEnquiries',
    label: 'Vehicle enquiries',
    description: 'Stock leads and vehicle-specific customer enquiries.',
    icon: 'car-sport-outline',
    customerRoute: { route: 'Messages', params: { categoryKey: 'vehicleEnquiries' } },
    staffRoute: { route: 'StaffMessages', params: { categoryKey: 'vehicleEnquiries' } },
  },
  {
    key: 'testDriveBookings',
    label: 'Test drive bookings',
    description: 'Book, confirm, or follow up on test drives.',
    icon: 'speedometer-outline',
    customerRoute: { route: 'TestDriveBooking' },
    staffRoute: { route: 'StaffTestDriveBookings' },
  },
  {
    key: 'events',
    label: 'Events invites',
    description: 'Invites, RSVPs, and event updates.',
    icon: 'calendar-outline',
    customerRoute: { route: 'Events' },
    staffRoute: { route: 'Events' },
  },
  {
    key: 'partsOrders',
    label: 'Parts & accessories',
    description: 'Parts, accessories, quotes, and payment updates.',
    icon: 'cube-outline',
    customerRoute: { route: 'PartsOrders' },
    staffRoute: { route: 'PartsOrders' },
  },
  {
    key: 'merchandiseOrders',
    label: 'Merchandise orders',
    description: 'Order status, quotes, and fulfilment follow-up.',
    icon: 'pricetag-outline',
    customerRoute: { route: 'Main', params: { screen: 'MerchandiseTab' } },
    staffRoute: { route: 'MerchandiseOrders' },
  },
  {
    key: 'financeApplications',
    label: 'Finance updates',
    description: 'Application progress, documents, and approvals.',
    icon: 'document-text-outline',
    customerRoute: { route: 'FinanceApplications' },
    staffRoute: { route: 'FinanceApplications' },
  },
  {
    key: 'warrantyClaims',
    label: 'Warranty claims',
    description: 'Warranty submissions, status updates, and approvals.',
    icon: 'shield-checkmark-outline',
    customerRoute: { route: 'Messages', params: { categoryKey: 'warrantyClaims' } },
    staffRoute: { route: 'StaffMessages', params: { categoryKey: 'warrantyClaims' } },
  },
  {
    key: 'referralWallet',
    label: 'Referral wallet',
    description: 'Wallet balance, earnings, and withdrawal requests.',
    icon: 'wallet-outline',
    customerRoute: { route: 'Rewards' },
    staffRoute: { route: 'StaffWallet' },
  },
];

export function getMessageCategoryRoute(categoryKey: MessageCategoryKey, isStaffUser: boolean): MessageCategoryRoute {
  const item = MESSAGE_CATEGORY_ITEMS.find((entry) => entry.key === categoryKey);
  return isStaffUser ? item?.staffRoute ?? { route: 'StaffMessages' } : item?.customerRoute ?? { route: 'Messages' };
}

export function getMessageMenuItems(isStaffUser: boolean): MessageMenuItem[] {
  return [
    {
      key: 'inbox',
      label: isStaffUser ? 'Inbox' : 'Messages',
      icon: 'mail-outline',
      route: isStaffUser ? 'StaffMessages' : 'Messages',
    },
    ...MESSAGE_CATEGORY_ITEMS.map((item) => {
      const route = getMessageCategoryRoute(item.key, isStaffUser);
      return {
        key: item.key,
        label: item.label,
        icon: item.icon,
        route: route.route,
        params: route.params,
        description: item.description,
      };
    }),
    {
      key: 'notifications',
      label: 'Notifications',
      icon: 'notifications-outline',
      route: 'Notifications',
    },
  ];
}

export function getGroupedMessageMenuItems(isStaffUser: boolean): MessageMenuSection[] {
  const items = getMessageMenuItems(isStaffUser);
  const byKey = new Map(items.map((item) => [item.key, item]));
  return [
    { title: 'Inbox', items: [byKey.get('inbox')].filter(Boolean) as MessageMenuItem[] },
    {
      title: 'Bookings',
      items: ['serviceBookings', 'testDriveBookings', 'events'].map((key) => byKey.get(key)).filter(Boolean) as MessageMenuItem[],
    },
    {
      title: 'Enquiries',
      items: ['vehicleEnquiries'].map((key) => byKey.get(key)).filter(Boolean) as MessageMenuItem[],
    },
    {
      title: 'Orders',
      items: ['partsOrders', 'merchandiseOrders'].map((key) => byKey.get(key)).filter(Boolean) as MessageMenuItem[],
    },
    {
      title: 'Finance',
      items: ['financeApplications'].map((key) => byKey.get(key)).filter(Boolean) as MessageMenuItem[],
    },
    {
      title: 'Claims',
      items: ['warrantyClaims'].map((key) => byKey.get(key)).filter(Boolean) as MessageMenuItem[],
    },
    {
      title: 'Wallet',
      items: ['referralWallet'].map((key) => byKey.get(key)).filter(Boolean) as MessageMenuItem[],
    },
    {
      title: 'Notifications',
      items: [byKey.get('notifications')].filter(Boolean) as MessageMenuItem[],
    },
  ].filter((section) => section.items.length > 0);
}

export function getMessageCategoryByRoute(route: string): MessageCategoryItem | undefined {
  return MESSAGE_CATEGORY_ITEMS.find((entry) => entry.customerRoute.route === route || entry.staffRoute.route === route);
}

export function getNotificationMessageCategoryKey(notif: any, isStaffUser: boolean): MessageCategoryKey | null {
  const type = String(notif?.type ?? '').toLowerCase();
  const targetRoute = String(notif?.targetRoute ?? notif?.screen ?? '').trim();

  if (notif?.bookingId || targetRoute === 'BookingDetail' || targetRoute === 'StaffBookingDetail' || type.startsWith('booking')) {
    return 'serviceBookings';
  }

  if (notif?.vehicleInventoryItemId || notif?.vehicleDescription || notif?.vehicleImageUrl || type === 'enquiry_sent' || type === 'customer_enquiry' || type.includes('vehicle_enquiry') || (type === 'new_message' && (String(notif?.title ?? '').toLowerCase().includes('enquiry') || String(notif?.message ?? '').toLowerCase().includes('enquiry')))) {
    return 'vehicleEnquiries';
  }

  if (notif?.testDriveId || targetRoute === 'StaffTestDriveBookings' || targetRoute === 'TestDriveBooking' || type.startsWith('test_drive')) {
    return 'testDriveBookings';
  }

  if (targetRoute === 'Events' || type.startsWith('event') || type.includes('invite')) {
    return 'events';
  }

  if (notif?.partsOrderId || targetRoute === 'PartsOrders' || type.startsWith('parts_order')) {
    return 'partsOrders';
  }

  if (notif?.merchandiseOrderId || targetRoute === 'MerchandiseOrders' || type.startsWith('merchandise_order')) {
    return 'merchandiseOrders';
  }

  if (notif?.financeApplicationId || targetRoute === 'FinanceApplications' || targetRoute === 'FinanceApplicationDetail' || type.startsWith('finance')) {
    return 'financeApplications';
  }

  if (targetRoute === 'ClaimsApproval' || targetRoute === 'WarrantyClaims' || type.startsWith('warranty') || type.includes('claim')) {
    return 'warrantyClaims';
  }

  if (targetRoute === 'Rewards' || targetRoute === 'StaffWallet' || type.includes('wallet') || type.includes('referral')) {
    return 'referralWallet';
  }

  if (isStaffUser && targetRoute === 'StaffMessages') return null;
  return null;
}