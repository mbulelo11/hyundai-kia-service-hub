import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Simple base64 encoder for Convex runtime
function base64Encode(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let result = '';
  let i = 0;
  while (i < str.length) {
    const a = str.charCodeAt(i++);
    const b = i < str.length ? str.charCodeAt(i++) : 0;
    const c = i < str.length ? str.charCodeAt(i++) : 0;
    const bitmap = (a << 16) | (b << 8) | c;
    result += chars.charAt((bitmap >> 18) & 63);
    result += chars.charAt((bitmap >> 12) & 63);
    result += i - 2 < str.length ? chars.charAt((bitmap >> 6) & 63) : '=';
    result += i - 1 < str.length ? chars.charAt(bitmap & 63) : '=';
  }
  return result;
}

// Send email via Resend API
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = (globalThis as any).process?.env?.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[EMAIL SKIPPED - No RESEND_API_KEY] To: ${to}, Subject: ${subject}`);
    return false;
  }

  try {
    const fromEmail = (globalThis as any).process?.env?.FROM_EMAIL || "Hyundai Service Hub <noreply@hyundaiservicehub.com>";
    const res = await (globalThis as any).fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[EMAIL ERROR] ${res.status}: ${err}`);
      return false;
    }

    console.log(`[EMAIL SENT] To: ${to}, Subject: ${subject}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL ERROR]`, error);
    return false;
  }
}

// Send SMS via Twilio - simplified implementation
const sendSMS = async (phoneNumber: string, message: string) => {
  const accountSid = (globalThis as any).process?.env?.TWILIO_ACCOUNT_SID;
  const authToken = (globalThis as any).process?.env?.TWILIO_AUTH_TOKEN;
  const fromPhone = (globalThis as any).process?.env?.TWILIO_PHONE_NUMBER;
  
  if (!accountSid || !authToken || !fromPhone) {
    console.log('[SMS SKIPPED - Twilio not configured]');
    return null;
  }

  try {
    const credentials = accountSid + ':' + authToken;
    const encoded = base64Encode(credentials);

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = `From=${encodeURIComponent(fromPhone)}&To=${encodeURIComponent(phoneNumber)}&Body=${encodeURIComponent(message)}`;

    const response = await (globalThis as any).fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encoded}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body,
    } as any);

    if (!response.ok) {
      console.error('[SMS send failed]:', await response.text());
      return null;
    }

    console.log('[SMS SENT]', phoneNumber);
    return await response.json();
  } catch (error) {
    console.error('[SMS error]:', error);
    return null;
  }
};

const sendWhatsApp = async (phoneNumber: string, message: string) => {
  const accountSid = (globalThis as any).process?.env?.TWILIO_ACCOUNT_SID;
  const authToken = (globalThis as any).process?.env?.TWILIO_AUTH_TOKEN;
  const whatsappNumber = (globalThis as any).process?.env?.TWILIO_WHATSAPP_NUMBER;
  
  if (!accountSid || !authToken || !whatsappNumber) {
    console.log('[WHATSAPP SKIPPED - Twilio not configured]');
    return null;
  }

  try {
    const credentials = accountSid + ':' + authToken;
    const encoded = base64Encode(credentials);

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const from = `whatsapp:${whatsappNumber}`;
    const to = `whatsapp:${phoneNumber}`;
    const body = `From=${encodeURIComponent(from)}&To=${encodeURIComponent(to)}&Body=${encodeURIComponent(message)}`;

    const response = await (globalThis as any).fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encoded}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body,
    } as any);

    if (!response.ok) {
      console.error('[WHATSAPP send failed]:', await response.text());
      return null;
    }

    console.log('[WHATSAPP SENT]', phoneNumber);
    return await response.json();
  } catch (error) {
    console.error('[WHATSAPP error]:', error);
    return null;
  }
};

// TWILIO SMS/WHATSAPP HELPERS

export const sendSMSToStaff = async (phoneNumber: string, message: string) => {
  return sendSMS(phoneNumber, message);
};

export const sendWhatsAppToStaff = async (phoneNumber: string, message: string) => {
  return sendWhatsApp(phoneNumber, message);
};

export const sendSMSToCustomer = async (phoneNumber: string, message: string) => {
  return sendSMS(phoneNumber, message);
};

export const sendWhatsAppToCustomer = async (phoneNumber: string, message: string) => {
  return sendWhatsApp(phoneNumber, message);
};

// EMAIL HELPERS (already exist)

export const sendEmailToCustomer = async (email: string, subject: string, message: string) => {
  return sendEmail(email, subject, message);
};

export const sendEmailToStaff = async (email: string, subject: string, message: string) => {
  return sendEmail(email, subject, message);
};

// Multi-channel notification helper
export const notifyStaff = async (ctx: any, staffEmail: string, staffPhone: string | null, subject: string, message: string, type: string) => {
  const results = {
    email: false,
    sms: false,
    inApp: false,
  };

  // Send email
  try {
    await sendEmail(staffEmail, subject, message);
    results.email = true;
  } catch (error) {
    console.error('Staff email notification failed:', error);
  }

  // Send SMS if phone available
  if (staffPhone) {
    try {
      await sendSMS(staffPhone, message);
      results.sms = true;
    } catch (error) {
      console.error('Staff SMS notification failed:', error);
    }
  }

  return results;
};

export const notifyCustomer = async (ctx: any, customerEmail: string, customerPhone: string | null, subject: string, message: string, useWhatsApp: boolean = true) => {
  const results = {
    email: false,
    sms: false,
    whatsapp: false,
    inApp: false,
  };

  // Send email
  try {
    await sendEmail(customerEmail, subject, message);
    results.email = true;
  } catch (error) {
    console.error('Customer email notification failed:', error);
  }

  // Send WhatsApp if phone available and enabled
  if (customerPhone && useWhatsApp) {
    try {
      await sendWhatsApp(customerPhone, message);
      results.whatsapp = true;
    } catch (error) {
      console.error('Customer WhatsApp notification failed:', error);
    }
  }

  return results;
};

export const getEmailByUserId = internalQuery({
  args: { userId: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId as any);
    return typeof user?.email === "string" && user.email.trim() ? user.email.trim() : null;
  },
});

export const getNotificationContactByUserId = internalQuery({
  args: { userId: v.string() },
  returns: v.object({
    email: v.union(v.null(), v.string()),
    phone: v.union(v.null(), v.string()),
    name: v.union(v.null(), v.string()),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId as any);
    return {
      email: typeof user?.email === "string" && user.email.trim() ? user.email.trim() : null,
      phone: typeof user?.phone === "string" && user.phone.trim() ? user.phone.trim() : null,
      name: typeof user?.name === "string" && user.name.trim() ? user.name.trim() : null,
    };
  },
});

export const sendNotificationDelivery = internalAction({
  args: {
    userId: v.string(),
    type: v.optional(v.string()),
    title: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contact = await ctx.runQuery(internal.emails.getNotificationContactByUserId, { userId: args.userId });
    const safeMessage = args.message.slice(0, 180);
    const whatsappTypes = new Set([
      "booking_confirmed",
      "booking_reminder",
      "finance_approved",
      "test_drive_confirmed",
      "urgent_alert",
    ]);
    const shouldSendWhatsApp = Boolean(args.type && whatsappTypes.has(args.type));
    if (contact.email) {
      await sendEmail(contact.email, args.title, safeMessage);
    }
    if (contact.phone && shouldSendWhatsApp) {
      await sendWhatsApp(contact.phone, `${args.title}\n\n${safeMessage}`);
    }
    return null;
  },
});

export const sendNotificationEmail = internalAction({
  args: {
    userId: v.string(),
    title: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await ctx.runQuery(internal.emails.getEmailByUserId, { userId: args.userId });
    if (!email) return null;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #002C5F; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Hyundai Service Hub</h1>
        </div>
        <div style="padding: 24px; background: #f9fafb;">
          <h2 style="color: #002C5F; margin-top: 0;">${args.title}</h2>
          <p style="color: #374151; font-size: 16px; white-space: pre-wrap; line-height: 1.6;">${args.message}</p>
        </div>
      </div>
    `;

    await sendEmail(email, args.title, html);
    return null;
  },
});

export const sendTradeInSubmissionEmail = internalAction({
  args: {
    userId: v.string(),
    firstName: v.string(),
    surname: v.string(),
    contactDetails: v.string(),
    vehicleName: v.string(),
    yearModel: v.string(),
    colour: v.string(),
    reg: v.string(),
    mileage: v.string(),
    vin: v.string(),
    engineNumber: v.string(),
    underFinance: v.string(),
    financedByBank: v.optional(v.string()),
    expectedValue: v.string(),
    purchaseIntent: v.string(),
    status: v.string(),
    imageUrls: v.array(v.string()),
    imageNames: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contact = await ctx.runQuery(internal.emails.getNotificationContactByUserId, { userId: args.userId });
    if (!contact.email) return null;

    const imageGallery = args.imageUrls.length
      ? `
        <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px;">
          ${args.imageUrls
            .map((url, index) => `
              <a href="${url}" style="text-decoration: none; display: inline-block;">
                <img src="${url}" alt="Trade-in photo ${index + 1}" style="width: 150px; height: 110px; object-fit: cover; border-radius: 12px; border: 1px solid #e5e7eb;" />
              </a>
            `)
            .join('')}
        </div>
      `
      : '<p style="color:#6b7280;">No images were attached.</p>';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 760px; margin: 0 auto;">
        <div style="background: #002C5F; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">New Trade-In Submission</h1>
        </div>
        <div style="padding: 24px; background: #f9fafb;">
          <h2 style="color: #002C5F; margin-top: 0;">${args.firstName} ${args.surname}</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6; margin-top: 0;">
            A customer trade-in has been submitted and is ready for review by the sales department.
          </p>
          <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden;">
            <tr><td style="padding: 10px 12px; color: #6b7280; width: 160px; border-bottom: 1px solid #e5e7eb;">Contact</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${args.contactDetails}</td></tr>
            <tr><td style="padding: 10px 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Vehicle</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${args.vehicleName} ${args.yearModel}</td></tr>
            <tr><td style="padding: 10px 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Colour</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${args.colour}</td></tr>
            <tr><td style="padding: 10px 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Registration</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${args.reg}</td></tr>
            <tr><td style="padding: 10px 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Mileage</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${args.mileage}</td></tr>
            <tr><td style="padding: 10px 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">VIN</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${args.vin}</td></tr>
            <tr><td style="padding: 10px 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Engine No.</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${args.engineNumber}</td></tr>
            <tr><td style="padding: 10px 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Finance</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${args.underFinance}${args.financedByBank ? ` · Bank: ${args.financedByBank}` : ''}</td></tr>
            <tr><td style="padding: 10px 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Expected Value</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 700;">${args.expectedValue}</td></tr>
            <tr><td style="padding: 10px 12px; color: #6b7280;">Intent</td><td style="padding: 10px 12px;">${args.purchaseIntent}</td></tr>
          </table>
          <div style="margin-top: 18px; padding: 14px; background: #ECFDF5; border-radius: 12px; border: 1px solid #D1FAE5;">
            <strong style="color: #065F46;">Status:</strong> ${args.status}
          </div>
          <h3 style="margin-top: 22px; color: #002C5F;">Vehicle photos</h3>
          ${imageGallery}
          <div style="margin-top: 22px; padding: 14px; background: #FEF3C7; border-radius: 12px; border: 1px solid #FDE68A;">
            <p style="margin: 0; color: #92400E; font-weight: 700;">Please review this submission and contact the customer as soon as possible.</p>
          </div>
        </div>
      </div>
    `;

    await sendEmail(contact.email, `New Trade-In Submission: ${args.firstName} ${args.surname}`, html);
    return null;
  },
});

// Internal query: get active staff emails (so actions can access DB)
export const getActiveStaffEmails = internalQuery({
  args: {},
  returns: v.array(v.object({ name: v.string(), email: v.string(), role: v.string() })),
  handler: async (ctx) => {
    const staff = await ctx.db.query("staff").collect();
    return staff
      .filter((s: any) => s.isActive)
      .map((s: any) => ({ name: s.name, email: s.email, role: s.role }));
  },
});

// Called when a new booking is created - notify all active service advisors
export const notifyStaffOfNewBooking = internalAction({
  args: {
    bookingId: v.id("bookings"),
    customerName: v.string(),
    customerEmail: v.string(),
    serviceType: v.string(),
    date: v.string(),
    timeSlot: v.string(),
    vehicleInfo: v.string(),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const subject = `New Service Booking: ${args.serviceType}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #002C5F; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Hyundai Service Hub</h1>
        </div>
        <div style="padding: 24px; background: #f9fafb;">
          <h2 style="color: #002C5F; margin-top: 0;">New Service Booking</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #6b7280; width: 140px;">Customer</td><td style="padding: 8px 0; font-weight: 600;">${args.customerName}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Email</td><td style="padding: 8px 0;">${args.customerEmail}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Service Type</td><td style="padding: 8px 0; font-weight: 600;">${args.serviceType}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Vehicle</td><td style="padding: 8px 0;">${args.vehicleInfo}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Date</td><td style="padding: 8px 0; font-weight: 600;">${args.date}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Time</td><td style="padding: 8px 0; font-weight: 600;">${args.timeSlot}</td></tr>
            ${args.notes ? `<tr><td style="padding: 8px 0; color: #6b7280;">Notes</td><td style="padding: 8px 0; font-style: italic;">${args.notes}</td></tr>` : ''}
          </table>
          <div style="margin-top: 20px; padding: 16px; background: #FEF3C7; border-radius: 8px;">
            <p style="margin: 0; color: #92400E; font-weight: 600;">Action Required: Please review and confirm this booking.</p>
          </div>
        </div>
        <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
          Hyundai Service Hub - Automated Notification
        </div>
      </div>
    `;

    // Get all active staff emails
    const allStaff = await ctx.runQuery(internal.emails.getActiveStaffEmails, {});
    
    for (const staff of allStaff) {
      await sendEmail(staff.email, subject, html);
    }

    return null;
  },
});

// Called when booking status is updated - notify customer via email + in-app + SMS/WhatsApp
export const notifyCustomerOfUpdate = internalAction({
  args: {
    bookingId: v.id("bookings"),
    customerEmail: v.string(),
    customerName: v.string(),
    customerId: v.string(),
    serviceType: v.string(),
    date: v.string(),
    timeSlot: v.string(),
    newStatus: v.string(),
    assignedStaffName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const statusLabels: Record<string, string> = {
      'pending': 'Pending Review',
      'confirmed': 'Confirmed',
      'in-progress': 'In Progress',
      'completed': 'Completed',
    };

    const statusColors: Record<string, string> = {
      'pending': '#F59E0B',
      'confirmed': '#3B82F6',
      'in-progress': '#8B5CF6',
      'completed': '#10B981',
    };

    const statusLabel = statusLabels[args.newStatus] || args.newStatus;
    const statusColor = statusColors[args.newStatus] || '#6b7280';

    const subject = `Booking Update: ${args.serviceType} - ${statusLabel}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #002C5F; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Hyundai Service Hub</h1>
        </div>
        <div style="padding: 24px; background: #f9fafb;">
          <h2 style="color: #002C5F; margin-top: 0;">Hi ${args.customerName},</h2>
          <p style="color: #374151; font-size: 16px;">Your booking has been updated:</p>
          
          <div style="background: white; border-radius: 12px; padding: 20px; margin: 16px 0; border: 1px solid #e5e7eb;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280; width: 120px;">Service</td><td style="padding: 8px 0; font-weight: 600;">${args.serviceType}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Date</td><td style="padding: 8px 0;">${args.date}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Time</td><td style="padding: 8px 0;">${args.timeSlot}</td></tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Status</td>
                <td style="padding: 8px 0;">
                  <span style="background: ${statusColor}20; color: ${statusColor}; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 14px;">${statusLabel}</span>
                </td>
              </tr>
              ${args.assignedStaffName ? `<tr><td style="padding: 8px 0; color: #6b7280;">Advisor</td><td style="padding: 8px 0; font-weight: 600;">${args.assignedStaffName}</td></tr>` : ''}
            </table>
          </div>

          ${args.newStatus === 'confirmed' ? `
            <div style="margin-top: 16px; padding: 16px; background: #ECFDF5; border-radius: 8px;">
              <p style="margin: 0; color: #065F46; font-weight: 600;">Your booking has been confirmed! We look forward to seeing you.</p>
            </div>
          ` : ''}
        </div>
        <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
          Hyundai Service Hub - Automated Notification
        </div>
      </div>
    `;

    // Send email to customer
    await sendEmail(args.customerEmail, subject, html);

    // Send SMS notification
    const smsMessage = `Hi ${args.customerName}, your ${args.serviceType} booking for ${args.date} at ${args.timeSlot} is now ${statusLabel}. ${args.assignedStaffName ? 'Assigned to: ' + args.assignedStaffName : 'Thank you!'}`;
    await sendSMSToCustomer("", smsMessage);

    // Send WhatsApp notification
    const whatsappMessage = `Hello ${args.customerName}! 👋\n\nYour booking status: ${statusLabel}\nService: ${args.serviceType}\nDate: ${args.date}\nTime: ${args.timeSlot}\n${args.assignedStaffName ? '\nAssigned to: ' + args.assignedStaffName : ''}\n\nThank you! 🚗`;
    await sendWhatsAppToCustomer("", whatsappMessage);

    // Create in-app notification for customer
    await ctx.runMutation(internal.notifications.createInternal, {
      userId: args.customerId,
      type: args.newStatus === 'confirmed' ? 'booking_confirmed' : 'booking_updated',
      title: args.newStatus === 'confirmed' 
        ? 'Booking Confirmed!' 
        : `Booking ${statusLabel}`,
      message: args.newStatus === 'confirmed'
        ? `Your ${args.serviceType} on ${args.date} at ${args.timeSlot} has been confirmed.${args.assignedStaffName ? ` Your advisor: ${args.assignedStaffName}` : ''}`
        : `Your ${args.serviceType} booking status has been updated to ${statusLabel}.`,
      bookingId: args.bookingId,
    });

    return null;
  },
});

export const sendBookingReminder = internalAction({
  args: {
    bookingId: v.id("bookings"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reminder = await ctx.runQuery(internal.bookings.getReminderContext, {
      bookingId: args.bookingId,
    });
    if (!reminder) return null;

    await ctx.runMutation(internal.notifications.createInternal, {
      userId: reminder.booking.userId,
      type: 'booking_reminder',
      title: 'Booking Reminder',
      message: `Reminder: your ${reminder.booking.serviceType} is scheduled for ${reminder.booking.date} at ${reminder.booking.timeSlot}.`,
      bookingId: args.bookingId,
    });

    await ctx.runMutation(internal.activityLog.logInternal, {
      type: 'booking_reminder',
      title: 'Booking Reminder Sent',
      description: `${reminder.customerName}'s reminder for ${reminder.booking.serviceType} on ${reminder.booking.date} at ${reminder.booking.timeSlot}.`,
      customerName: reminder.customerName,
      customerPhone: undefined,
      metadata: JSON.stringify({ bookingId: args.bookingId.toString() }),
      triggeredBy: reminder.booking.userId,
    });

    return null;
  },
});

export const sendCalendarReminder = internalAction({
  args: {
    userId: v.string(),
    title: v.string(),
    details: v.optional(v.string()),
    date: v.string(),
    time: v.optional(v.string()),
    calendarEntryId: v.id("calendarEntries"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const when = args.time ? `${args.date} at ${args.time}` : args.date;
    await ctx.runMutation(internal.notifications.createInternal, {
      userId: args.userId,
      type: 'calendar_reminder',
      title: 'Reminder Due',
      message: args.details
        ? `${args.title} is due for ${when}. ${args.details}`
        : `${args.title} is due for ${when}.`,
      bookingId: undefined,
    });

    await ctx.runMutation(internal.activityLog.logInternal, {
      type: 'calendar_reminder',
      title: 'Calendar Reminder Sent',
      description: `${args.title} reminder sent for ${when}.`,
      customerName: undefined,
      customerPhone: undefined,
      metadata: JSON.stringify({ calendarEntryId: args.calendarEntryId.toString(), date: args.date, time: args.time }),
      triggeredBy: args.userId,
    });

    return null;
  },
});

// STAFF ASSIGNMENT NOTIFICATIONS - using existing helpers

export const notifyStaffOfAssignmentEmail = internalAction({
  args: {
    staffEmail: v.string(),
    staffPhone: v.optional(v.string()),
    staffName: v.string(),
    assignmentType: v.string(),
    referenceNumber: v.string(),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    details: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const subject = `New ${args.assignmentType.replace(/_/g, ' ')} Assignment - Ref: ${args.referenceNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #002C5F; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Hyundai Service Hub</h1>
        </div>
        <div style="padding: 24px; background: #f9fafb;">
          <h2 style="color: #002C5F; margin-top: 0;">New Assignment</h2>
          <p>Hi ${args.staffName},</p>
          <p>You have been assigned a new <strong>${args.assignmentType.replace(/_/g, ' ')}</strong>:</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #6b7280; width: 120px;">Reference</td><td style="padding: 8px 0; font-weight: 600;">${args.referenceNumber}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Customer</td><td style="padding: 8px 0;">${args.customerName}</td></tr>
            ${args.customerPhone ? `<tr><td style="padding: 8px 0; color: #6b7280;">Phone</td><td style="padding: 8px 0;">${args.customerPhone}</td></tr>` : ''}
          </table>
          <div style="margin-top: 16px; padding: 16px; background: #ECFDF5; border-radius: 8px;">
            <p style="margin: 0; color: #065F46; font-weight: 600;">Details: ${args.details}</p>
          </div>
          <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">Please review and take action in your dashboard.</p>
        </div>
      </div>
    `;

    // Send email to staff
    await sendEmail(args.staffEmail, subject, html);

    // Send SMS if phone available
    if (args.staffPhone) {
      const smsMsg = `New ${args.assignmentType} assigned to you! Ref: ${args.referenceNumber}, Customer: ${args.customerName}. Check your dashboard.`;
      await sendSMS(args.staffPhone, smsMsg);
    }

    return null;
  },
});

// Notify customer that staff has been assigned
export const notifyCustomerOfAssignmentEmail = internalAction({
  args: {
    customerEmail: v.string(),
    customerPhone: v.optional(v.string()),
    customerName: v.string(),
    staffName: v.string(),
    staffPhone: v.optional(v.string()),
    assignmentType: v.string(),
    referenceNumber: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const subject = `Your ${args.assignmentType.replace(/_/g, ' ')} has been assigned - Ref: ${args.referenceNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #002C5F; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Hyundai Service Hub</h1>
        </div>
        <div style="padding: 24px; background: #f9fafb;">
          <h2 style="color: #002C5F; margin-top: 0;">Assignment Confirmation</h2>
          <p>Hi ${args.customerName},</p>
          <p>Your <strong>${args.assignmentType.replace(/_/g, ' ')}</strong> (Ref: ${args.referenceNumber}) has been assigned to:</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #6b7280; width: 100px;">Name</td><td style="padding: 8px 0; font-weight: 600;">${args.staffName}</td></tr>
            ${args.staffPhone ? `<tr><td style="padding: 8px 0; color: #6b7280;">Phone</td><td style="padding: 8px 0;">${args.staffPhone}</td></tr>` : ''}
          </table>
          <p style="margin-top: 16px; color: #374151; font-size: 14px;">They will be in touch with you shortly.</p>
        </div>
      </div>
    `;

    // Send email to customer
    await sendEmail(args.customerEmail, subject, html);

    // Send WhatsApp if phone available
    if (args.customerPhone) {
      const whatsappMsg = `Hi ${args.customerName}, your ${args.assignmentType} (Ref: ${args.referenceNumber}) has been assigned to ${args.staffName}. ${args.staffPhone ? `Contact: ${args.staffPhone}` : 'They will reach out soon.'}`;
      await sendWhatsApp(args.customerPhone, whatsappMsg);
    }

    return null;
  },
});