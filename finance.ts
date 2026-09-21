import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { isVincentAdminUser, isAdminUser, canBypassOwnerIsolation, getUserDepartment, canAccessDepartment } from "./auth";
import { sendSMSToCustomer, sendWhatsAppToCustomer } from './emails';

const VINCENT_ADMIN_EMAIL = "vincentmm@hyundai.co.za";
const FINANCE_REFERRAL_REWARD = 50;

async function safeDbGet(ctx: any, id: string | undefined | null) {
  if (!id) return null;
  try {
    return await ctx.db.get(id as any);
  } catch {
    return null;
  }
}

// Helper to get stable user ID
async function getStableUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const subjectDoc: any = await safeDbGet(ctx, identity.subject);
  if (subjectDoc?.userId) {
    const user = await safeDbGet(ctx, subjectDoc.userId);
    if (user) return user._id;
  }
  if (subjectDoc?.email || subjectDoc?.role) {
    return subjectDoc._id;
  }

  if (identity.email) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", identity.email))
      .first();
    if (user) return user._id;
  }

  if (identity.tokenIdentifier) {
    const possibleId = identity.tokenIdentifier.split("|").pop();
    const tokenDoc: any = await safeDbGet(ctx, possibleId);
    if (tokenDoc?.userId) {
      const user = await safeDbGet(ctx, tokenDoc.userId);
      if (user) return user._id;
    }
    if (tokenDoc?.email || tokenDoc?.role) {
      return tokenDoc._id;
    }
  }

  return identity.subject;
}

async function getCurrentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const userId = await getStableUserId(ctx);
  const user = await safeDbGet(ctx, userId);
  const identityEmail = String(identity.email ?? "").trim().toLowerCase();
  const syntheticUser = user ?? (identityEmail ? {
    _id: userId,
    email: identityEmail,
    role: identityEmail === VINCENT_ADMIN_EMAIL ? "staff" : "customer",
    staffRole: identityEmail === VINCENT_ADMIN_EMAIL ? "dp" : undefined,
    accessLevel: identityEmail === VINCENT_ADMIN_EMAIL ? "full_access" : "limited_access",
    isOwner: identityEmail === VINCENT_ADMIN_EMAIL,
  } : null);
  const scopeIds = Array.from(new Set([String(userId), String(identity.subject), identityEmail, ...(identity.email ? [String(identity.email).trim().toLowerCase()] : [])]));
  return {
    userId,
    user: syntheticUser,
    scopeIds,
    isStaff: Boolean(syntheticUser?.role === "staff" || isAdminUser(syntheticUser) || identityEmail === VINCENT_ADMIN_EMAIL),
    isAdmin: Boolean(identityEmail === VINCENT_ADMIN_EMAIL || canBypassOwnerIsolation(syntheticUser)),
    department: getUserDepartment(syntheticUser),
  };
}

function getAssignedStaff(current: any) {
  if (!current?.user) return null;
  const assignedStaffUserId = String(current.user.assignedStaffUserId ?? "").trim();
  if (!assignedStaffUserId) return null;
  return {
    assignedStaffUserId,
    assignedStaffName: current.user.assignedStaffName ?? current.user.name ?? current.user.email ?? "Sales Executive",
    assignedStaffRole: current.user.assignedStaffRole ?? current.user.staffRole ?? current.user.role,
    assignedStaffDealershipId: current.user.assignedStaffDealershipId ?? current.user.dealershipId,
  };
}

async function getStaffRecipientIds(ctx: any): Promise<string[]> {
  const recipientIds = new Set<string>();

  const users = await ctx.db.query("users").collect();
  for (const user of users) {
    const role = String(user?.staffRole ?? user?.role ?? "").trim().toLowerCase();
    const isAdminRecipient = Boolean(user?.isOwner || role === 'admin' || role === 'dp' || role === 'dealer_principal' || String(user?.email ?? '').trim().toLowerCase() === VINCENT_ADMIN_EMAIL);
    if (isAdminRecipient) {
      recipientIds.add(String(user._id));
    }
  }

  return [...recipientIds];
}

async function getFinanceDepartmentRecipientIds(ctx: any): Promise<string[]> {
  const users = await ctx.db.query("users").collect();
  return users
    .filter((user: any) => {
      const role = String(user?.staffRole ?? user?.role ?? "").trim().toLowerCase();
      return ["finance", "finance_manager", "sales_executive", "sales_manager", "dp"].includes(role) || String(user?.department ?? "").trim().toLowerCase() === "sales" || String(user?.department ?? "").trim().toLowerCase() === "management";
    })
    .map((user: any) => String(user._id));
}

async function creditFinanceReferralWallet(ctx: any, app: any) {
  const ownerUserId = String(app.ownerUserId ?? app.ownerId ?? app.owner_id ?? app.userId ?? "");
  if (!ownerUserId) return;
  const existing = await ctx.db
    .query("referralWalletTransactions")
    .withIndex("by_sourceType_and_sourceId", (q: any) => q.eq("sourceType", "finance_application").eq("sourceId", String(app._id)))
    .first();
  if (existing) return;
  await ctx.runMutation(internal.referrals.creditReferralEvent, {
    userId: ownerUserId,
    sourceType: "finance_application",
    sourceId: String(app._id),
    amount: FINANCE_REFERRAL_REWARD,
    description: `Referral reward for delivered finance application ${app.vehicleDescription ?? `${app.firstName} ${app.surname}`}`,
    metadata: JSON.stringify({ financeApplicationId: String(app._id), status: app.status, dealStatus: app.dealStatus }),
  });
}

async function getPushTokensForUserIds(ctx: any, userIds: string[]): Promise<string[]> {
  const tokens: string[] = [];
  for (const userId of userIds) {
    const user = await safeDbGet(ctx, userId);
    if (user?.pushToken) {
      tokens.push(user.pushToken);
    }
  }
  return tokens;
}

function selectApplicationFields(app: any) {
  const result: any = {
    _id: app._id,
    _creationTime: app._creationTime,
    userId: app.userId,
    inventoryItemId: app.inventoryItemId,
    vehicleDescription: app.vehicleDescription,
    dealerSupplier: app.dealerSupplier,
    dealerContactPerson: app.dealerContactPerson,
    cashPriceVatIncl: app.cashPriceVatIncl,
    vatableExtrasVatIncl: app.vatableExtrasVatIncl,
    addCover: app.addCover,
    radioTape: app.radioTape,
    licenceReg: app.licenceReg,
    numberPlates: app.numberPlates,
    creditLife: app.creditLife,
    warranty: app.warranty,
    advance: app.advance,
    arrears: app.arrears,
    residual: app.residual,
    title: app.title,
    initials: app.initials,
    firstName: app.firstName,
    surname: app.surname,
    dependants: app.dependants,
    maritalStatus: app.maritalStatus,
    dateMarried: app.dateMarried,
    idNumber: app.idNumber,
    address: app.address,
    homeAddress: app.homeAddress,
    postalAddress: app.postalAddress,
    postalCode: app.postalCode,
    homeTel: app.homeTel,
    workTel: app.workTel,
    cell: app.cell,
    fax: app.fax,
    email: app.email,
    phone: app.phone,
    spouseNames: app.spouseNames,
    spouseId: app.spouseId,
    occupation: app.occupation,
    nextOfKinName: app.nextOfKinName,
    nextOfKinRelationship: app.nextOfKinRelationship,
    nextOfKinAddress: app.nextOfKinAddress,
    nextOfKinTel: app.nextOfKinTel,
    employerName: app.employerName,
    employerContact: app.employerContact,
    employerAddress: app.employerAddress,
    salaryDate: app.salaryDate,
    yearsAtCompany: app.yearsAtCompany,
    grossIncome: app.grossIncome,
    monthlyCommission: app.monthlyCommission,
    carAllowance: app.carAllowance,
    otherIncome: app.otherIncome,
    otherIncomeSource: app.otherIncomeSource,
    netIncome: app.netIncome,
    monthlyExpenses: app.monthlyExpenses,
    bondPaymentRent: app.bondPaymentRent,
    bankName: app.bankName,
    accountNumber: app.accountNumber,
    accountType: app.accountType,
    bondHolder: app.bondHolder,
    propertyValue: app.propertyValue,
    installment: app.installment,
    purchasePrice: app.purchasePrice,
    datePurchased: app.datePurchased,
    registeredAs: app.registeredAs,
    ownName: app.ownName,
    spouse: app.spouse,
    renting: app.renting,
    amountOutstanding: app.amountOutstanding,
    hasTradeIn: app.hasTradeIn,
    tradeInFinancingBank: app.tradeInFinancingBank,
    tradeInCarBrand: app.tradeInCarBrand,
    tradeInYearModel: app.tradeInYearModel,
    tradeInKm: app.tradeInKm,
    tradeInColour: app.tradeInColour,
    tradeInServiceHistory: app.tradeInServiceHistory,
    tradeInSpareKey: app.tradeInSpareKey,
    attachmentUrls: app.attachmentUrls,
    attachmentNames: app.attachmentNames,
    documentMethod: app.documentMethod,
    status: app.status,
    staffNotes: app.staffNotes,
    assignedTo: app.assignedTo,
    assignedToName: app.assignedToName,
    assignedToUserId: app.assignedToUserId,
    assignedByUserId: app.assignedByUserId,
    assignedByName: app.assignedByName,
    assignedAt: app.assignedAt,
    reassignedAt: app.reassignedAt,
    dealStatus: app.dealStatus,
    closedDeal: app.closedDeal,
    closedDealAt: app.closedDealAt,
    closedByUserId: app.closedByUserId,
    dealershipId: app.dealershipId,
  };

  return result;
}

function buildInsertPayload(args: any, userId: string) {
  const payload: any = {
    ownerId: userId,
    ownerUserId: userId,
    owner_id: userId,
    userId,
    customerProfileId: args.customerProfileId,
    dealershipId: args.dealershipId,
    title: args.title,
    initials: args.initials,
    firstName: args.firstName,
    surname: args.surname,
    dependants: args.dependants,
    maritalStatus: args.maritalStatus,
    dateMarried: args.dateMarried,
    idNumber: args.idNumber,
    address: args.address,
    homeAddress: args.homeAddress,
    postalAddress: args.postalAddress,
    postalCode: args.postalCode,
    homeTel: args.homeTel,
    workTel: args.workTel,
    cell: args.cell,
    fax: args.fax,
    email: args.email,
    phone: args.phone,
    spouseNames: args.spouseNames,
    spouseId: args.spouseId,
    occupation: args.occupation,
    nextOfKinName: args.nextOfKinName,
    nextOfKinRelationship: args.nextOfKinRelationship,
    nextOfKinAddress: args.nextOfKinAddress,
    nextOfKinTel: args.nextOfKinTel,
    employerName: args.employerName,
    employerContact: args.employerContact,
    employerAddress: args.employerAddress,
    salaryDate: args.salaryDate,
    yearsAtCompany: args.yearsAtCompany,
    grossIncome: args.grossIncome,
    monthlyCommission: args.monthlyCommission,
    carAllowance: args.carAllowance,
    otherIncome: args.otherIncome,
    otherIncomeSource: args.otherIncomeSource,
    netIncome: args.netIncome,
    monthlyExpenses: args.monthlyExpenses,
    bondPaymentRent: args.bondPaymentRent,
    bankName: args.bankName,
    accountNumber: args.accountNumber,
    accountType: args.accountType,
    bondHolder: args.bondHolder,
    propertyValue: args.propertyValue,
    installment: args.installment,
    purchasePrice: args.purchasePrice,
    datePurchased: args.datePurchased,
    registeredAs: args.registeredAs,
    ownName: args.ownName,
    spouse: args.spouse,
    renting: args.renting,
    amountOutstanding: args.amountOutstanding,
    hasTradeIn: args.hasTradeIn,
    status: "submitted",
  };

  if (args.inventoryItemId) payload.inventoryItemId = args.inventoryItemId;
  if (args.vehicleDescription) payload.vehicleDescription = args.vehicleDescription;
  if (args.dealerSupplier) payload.dealerSupplier = args.dealerSupplier;
  if (args.dealerContactPerson) payload.dealerContactPerson = args.dealerContactPerson;
  if (args.cashPriceVatIncl) payload.cashPriceVatIncl = args.cashPriceVatIncl;
  if (args.vatableExtrasVatIncl) payload.vatableExtrasVatIncl = args.vatableExtrasVatIncl;
  if (args.addCover) payload.addCover = args.addCover;
  if (args.radioTape) payload.radioTape = args.radioTape;
  if (args.licenceReg) payload.licenceReg = args.licenceReg;
  if (args.numberPlates) payload.numberPlates = args.numberPlates;
  if (args.creditLife) payload.creditLife = args.creditLife;
  if (args.warranty) payload.warranty = args.warranty;
  if (args.advance) payload.advance = args.advance;
  if (args.arrears) payload.arrears = args.arrears;
  if (args.residual) payload.residual = args.residual;
  if (args.tradeInFinancingBank) payload.tradeInFinancingBank = args.tradeInFinancingBank;
  if (args.tradeInCarBrand) payload.tradeInCarBrand = args.tradeInCarBrand;
  if (args.tradeInYearModel) payload.tradeInYearModel = args.tradeInYearModel;
  if (args.tradeInKm) payload.tradeInKm = args.tradeInKm;
  if (args.tradeInColour) payload.tradeInColour = args.tradeInColour;
  if (args.tradeInServiceHistory) payload.tradeInServiceHistory = args.tradeInServiceHistory;
  if (args.tradeInSpareKey) payload.tradeInSpareKey = args.tradeInSpareKey;
  if (args.attachmentUrls?.length) payload.attachmentUrls = args.attachmentUrls;
  if (args.attachmentNames?.length) payload.attachmentNames = args.attachmentNames;
  if (args.documentMethod) payload.documentMethod = args.documentMethod;
  if (args.assignedToUserId) payload.assignedToUserId = args.assignedToUserId;
  if (args.assignedToName) payload.assignedToName = args.assignedToName;
  if (args.assignedToUserId || args.assignedToName) payload.assignedAt = Date.now();

  return payload;
}

function buildApplicationSummary(app: any, statusLabel?: string, staffNotes?: string) {
  const tradeInSummary = app.hasTradeIn
    ? `${app.tradeInCarBrand ?? "Unknown"} ${app.tradeInYearModel ?? ""} | ${app.tradeInKm ?? "0"} km | ${app.tradeInColour ?? "Unknown"}`
    : "No trade-in";
  const attachmentSummary = Array.isArray(app.attachmentNames) && app.attachmentNames.length > 0
    ? `Attachments: ${app.attachmentNames.join(", ")}`
    : null;

  return [
    `Finance Application Update`,
    `Name: ${app.firstName} ${app.surname}`,
    `ID Number: ${app.idNumber}`,
    `Phone: ${app.phone}`,
    `Email: ${app.email}`,
    `Vehicle: ${app.vehicleDescription ?? "a vehicle"}`,
    `Occupation: ${app.occupation ?? "N/A"}`,
    `Status: ${statusLabel ?? app.status}`,
    staffNotes ? `Staff Notes: ${staffNotes}` : null,
    `Address: ${app.address}`,
    `Next of Kin: ${app.nextOfKinName}`,
    `Next of Kin Address: ${app.nextOfKinAddress}`,
    `Employer: ${app.employerName}`,
    `Employer Contact: ${app.employerContact}`,
    `Employer Address: ${app.employerAddress}`,
    `Salary Date: ${app.salaryDate}`,
    `Years at Company: ${app.yearsAtCompany}`,
    `Gross Income: R${app.grossIncome}`,
    `Net Income: R${app.netIncome}`,
    `Monthly Expenses: R${app.monthlyExpenses}`,
    `Bank: ${app.bankName}`,
    `Account Type: ${app.accountType}`,
    `Account Number: ${app.accountNumber}`,
    `Trade-In: ${tradeInSummary}`,
    `Trade-In Finance Bank: ${app.tradeInFinancingBank ?? "N/A"}`,
    `Service History: ${app.tradeInServiceHistory ?? "N/A"}`,
    `Spare Key: ${app.tradeInSpareKey ?? "N/A"}`,
    attachmentSummary,
    `Documents via: ${app.documentMethod ?? "N/A"}`,
  ].filter(Boolean).join("\n");
}

function buildFinanceMessagePayload(args: { senderId: string; senderName: string; senderRole: string; recipientId?: string; content: string; }) {
  return {
    senderId: args.senderId,
    senderName: args.senderName,
    senderRole: args.senderRole,
    recipientId: args.recipientId,
    content: args.content,
    isRead: false,
  };
}

const statusLabels: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  pre_approved: "Pre-Approved",
  contract_ready: "Contract Ready",
  approved: "Contract Ready",
  declined: "Declined",
  more_info_needed: "More Information Needed",
};

const financeAdminReturnValidator = v.object({
  _id: v.id("financeApplications"),
  _creationTime: v.number(),
  userId: v.string(),
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
  nextOfKinName: v.string(),
  nextOfKinRelationship: v.optional(v.string()),
  nextOfKinAddress: v.string(),
  nextOfKinTel: v.optional(v.string()),
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
  bankName: v.string(),
  accountNumber: v.string(),
  accountType: v.string(),
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
  hasTradeIn: v.boolean(),
  tradeInFinancingBank: v.optional(v.string()),
  tradeInCarBrand: v.optional(v.string()),
  tradeInYearModel: v.optional(v.string()),
  tradeInKm: v.optional(v.string()),
  tradeInColour: v.optional(v.string()),
  tradeInServiceHistory: v.optional(v.string()),
  tradeInSpareKey: v.optional(v.string()),
  attachmentUrls: v.optional(v.array(v.string())),
  attachmentNames: v.optional(v.array(v.string())),
  documentMethod: v.optional(v.string()),
  status: v.string(),
  staffNotes: v.optional(v.string()),
  assignedTo: v.optional(v.string()),
  assignedToName: v.optional(v.string()),
  assignedToUserId: v.optional(v.string()),
  assignedByUserId: v.optional(v.string()),
  assignedByName: v.optional(v.string()),
  assignedAt: v.optional(v.number()),
  reassignedAt: v.optional(v.number()),
  dealStatus: v.optional(v.string()),
  closedDeal: v.optional(v.boolean()),
  closedDealAt: v.optional(v.number()),
  closedByUserId: v.optional(v.string()),
  dealershipId: v.optional(v.string()),
});

function isFinanceAdminUser(user: any) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  return Boolean(isAdminUser(user) || email === VINCENT_ADMIN_EMAIL);
}

function isFinanceStaffUser(user: any) {
  return Boolean(user?.role === 'staff' || isAdminUser(user));
}

function canAccessFinanceDepartment(user: any, app: any) {
  if (isFinanceAdminUser(user)) return true;
  return canAccessDepartment(user, String(app?.department ?? "sales"));
}

function canAccessFinanceRecord(user: any, userId: string, app: any) {
  if (isFinanceAdminUser(user)) return true;
  return [app.owner_id, app.ownerUserId, app.ownerId, app.assignedToUserId, app.userId].map(String).includes(String(userId));
}

function canAccessFinanceRecordForStaff(user: any, currentUserId: string, app: any) {
  if (isFinanceAdminUser(user)) return true;
  return [app.owner_id, app.ownerUserId, app.ownerId, app.assignedToUserId, app.userId].map(String).includes(String(currentUserId));
}

function canAccessAllFinance(user: any) {
  return Boolean(isFinanceAdminUser(user));
}

function canReassignFinance(user: any, app: any) {
  return canAccessAllFinance(user) && !app.acknowledgedAt;
}

function mapAdminFinance(app: any) {
  return {
    _id: app._id,
    _creationTime: app._creationTime,
    userId: app.userId,
    inventoryItemId: app.inventoryItemId,
    vehicleDescription: app.vehicleDescription,
    dealerSupplier: app.dealerSupplier,
    dealerContactPerson: app.dealerContactPerson,
    cashPriceVatIncl: app.cashPriceVatIncl,
    vatableExtrasVatIncl: app.vatableExtrasVatIncl,
    addCover: app.addCover,
    radioTape: app.radioTape,
    licenceReg: app.licenceReg,
    numberPlates: app.numberPlates,
    creditLife: app.creditLife,
    warranty: app.warranty,
    advance: app.advance,
    arrears: app.arrears,
    residual: app.residual,
    title: app.title,
    initials: app.initials,
    firstName: app.firstName,
    surname: app.surname,
    dependants: app.dependants,
    maritalStatus: app.maritalStatus,
    dateMarried: app.dateMarried,
    idNumber: app.idNumber,
    address: app.address,
    homeAddress: app.homeAddress,
    postalAddress: app.postalAddress,
    postalCode: app.postalCode,
    homeTel: app.homeTel,
    workTel: app.workTel,
    cell: app.cell,
    fax: app.fax,
    email: app.email,
    phone: app.phone,
    spouseNames: app.spouseNames,
    spouseId: app.spouseId,
    occupation: app.occupation,
    nextOfKinName: app.nextOfKinName,
    nextOfKinRelationship: app.nextOfKinRelationship,
    nextOfKinAddress: app.nextOfKinAddress,
    nextOfKinTel: app.nextOfKinTel,
    employerName: app.employerName,
    employerContact: app.employerContact,
    employerAddress: app.employerAddress,
    salaryDate: app.salaryDate,
    yearsAtCompany: app.yearsAtCompany,
    grossIncome: app.grossIncome,
    monthlyCommission: app.monthlyCommission,
    carAllowance: app.carAllowance,
    otherIncome: app.otherIncome,
    otherIncomeSource: app.otherIncomeSource,
    netIncome: app.netIncome,
    monthlyExpenses: app.monthlyExpenses,
    bondPaymentRent: app.bondPaymentRent,
    bankName: app.bankName,
    accountNumber: app.accountNumber,
    accountType: app.accountType,
    bondHolder: app.bondHolder,
    propertyValue: app.propertyValue,
    installment: app.installment,
    purchasePrice: app.purchasePrice,
    datePurchased: app.datePurchased,
    registeredAs: app.registeredAs,
    ownName: app.ownName,
    spouse: app.spouse,
    renting: app.renting,
    amountOutstanding: app.amountOutstanding,
    hasTradeIn: app.hasTradeIn,
    tradeInFinancingBank: app.tradeInFinancingBank,
    tradeInCarBrand: app.tradeInCarBrand,
    tradeInYearModel: app.tradeInYearModel,
    tradeInKm: app.tradeInKm,
    tradeInColour: app.tradeInColour,
    tradeInServiceHistory: app.tradeInServiceHistory,
    tradeInSpareKey: app.tradeInSpareKey,
    documentMethod: app.documentMethod,
    status: app.status,
    staffNotes: app.staffNotes,
    assignedTo: app.assignedTo,
    assignedToName: app.assignedToName,
    assignedToUserId: app.assignedToUserId,
    assignedByUserId: app.assignedByUserId,
    assignedByName: app.assignedByName,
    assignedAt: app.assignedAt,
    reassignedAt: app.reassignedAt,
    dealStatus: app.dealStatus,
    closedDeal: app.closedDeal,
    closedDealAt: app.closedDealAt,
    closedByUserId: app.closedByUserId,
    dealershipId: app.dealershipId,
  };
}

// Submit a finance application
export const submit = mutation({
  args: {
    inventoryItemId: v.optional(v.id("inventory")),
    vehicleDescription: v.optional(v.string()),
    customerProfileId: v.optional(v.string()),
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
    nextOfKinName: v.string(),
    nextOfKinRelationship: v.optional(v.string()),
    nextOfKinAddress: v.string(),
    nextOfKinTel: v.optional(v.string()),
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
    bankName: v.string(),
    accountNumber: v.string(),
    accountType: v.string(),
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
    hasTradeIn: v.boolean(),
    tradeInFinancingBank: v.optional(v.string()),
    tradeInCarBrand: v.optional(v.string()),
    tradeInYearModel: v.optional(v.string()),
    tradeInKm: v.optional(v.string()),
    tradeInColour: v.optional(v.string()),
    tradeInServiceHistory: v.optional(v.string()),
    tradeInSpareKey: v.optional(v.string()),
    attachmentUrls: v.optional(v.array(v.string())),
    attachmentNames: v.optional(v.array(v.string())),
    documentMethod: v.optional(v.string()),
    assignedToUserId: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
  },
  returns: v.id("financeApplications"),
  handler: async (ctx, args) => {
    const userId = await getStableUserId(ctx);
    const currentUser = await getCurrentUser(ctx);

    const linkedCustomerProfile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", userId))
      .first();
    const selectedCustomerProfile = args.customerProfileId
      ? await safeDbGet(ctx, args.customerProfileId)
      : null;

    const resolvedUserId = String(selectedCustomerProfile?.linkedUserId ?? userId);
    let resolvedAssignedToUserId = args.assignedToUserId ?? undefined;
    let resolvedAssignedToName = args.assignedToName ?? undefined;
    if (resolvedAssignedToUserId) {
      const assigneeDoc = await safeDbGet(ctx, resolvedAssignedToUserId);
      if (assigneeDoc) {
        if (typeof assigneeDoc.email === "string" && assigneeDoc.email) {
          const linkedUser = await ctx.db
            .query("users")
            .withIndex("email", (q: any) => q.eq("email", assigneeDoc.email))
            .first();
          if (linkedUser?._id) {
            resolvedAssignedToUserId = String(linkedUser._id);
          } else {
            resolvedAssignedToUserId = String(assigneeDoc._id);
          }
        } else {
          resolvedAssignedToUserId = String(assigneeDoc._id);
        }
        resolvedAssignedToName = resolvedAssignedToName ?? assigneeDoc.name ?? assigneeDoc.email ?? undefined;
      }
    }

    const fullName = `${args.firstName} ${args.surname}`;
    const vehicleLabel = args.vehicleDescription ?? "a vehicle";
    const documentMethodLabel = args.documentMethod ? args.documentMethod.toUpperCase() : "Not selected";
    const tradeInSummary = args.hasTradeIn
      ? `${args.tradeInCarBrand ?? "Unknown"} ${args.tradeInYearModel ?? ""} | ${args.tradeInKm ?? "0"} km | ${args.tradeInColour ?? "Unknown"}`
      : "No trade-in";

    const id = await ctx.db.insert("financeApplications", buildInsertPayload({
      ...args,
      assignedToUserId: resolvedAssignedToUserId,
      assignedToName: resolvedAssignedToName,
      dealershipId: selectedCustomerProfile?.dealershipId ?? currentUser.user?.dealershipId,
    }, resolvedUserId));

    if (resolvedAssignedToUserId) {
      const assignee = await safeDbGet(ctx, resolvedAssignedToUserId);
      const assigneeName = resolvedAssignedToName ?? assignee?.name ?? assignee?.email ?? "Sales Executive";
      await ctx.runMutation(internal.activityLog.logInternal, {
        ownerUserId: userId,
        type: "finance_applied",
        title: "Finance Application Routed",
        description: `${fullName} selected ${assigneeName} for finance support on ${vehicleLabel}.`,
        customerName: fullName,
        customerPhone: args.phone,
        metadata: JSON.stringify({
          assignedToUserId: resolvedAssignedToUserId,
          assignedToName: assigneeName,
          vehicleDescription: vehicleLabel,
          fullName,
        }),
        triggeredBy: userId,
      });
    }

    const detailedSummary = buildApplicationSummary({
      ...args,
      assignedToUserId: resolvedAssignedToUserId,
      assignedToName: resolvedAssignedToName,
      vehicleDescription: vehicleLabel,
    }, "Submitted");

    const staffRecipients = await getStaffRecipientIds(ctx);
    for (const staffUserId of staffRecipients) {
      await ctx.db.insert("notifications", {
        userId: staffUserId,
        type: "finance_new",
        title: "New Finance Application",
        message: detailedSummary,
        financeApplicationId: id,
        targetRoute: "FinanceApplicationDetail",
        targetId: String(id),
        isRead: false,
      });
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
        userId: staffUserId,
        title: "New Finance Application",
        message: `${fullName} submitted a finance application for ${vehicleLabel}.`,
      });
    }

    const adminRecipients = await getStaffRecipientIds(ctx);
    const adminTokens = await getPushTokensForUserIds(ctx, adminRecipients);
    if (adminTokens.length > 0) {
      await ctx.scheduler.runAfter(0, internal.pushNotifications.sendNotification, {
        to: adminTokens,
        title: "New Finance Application",
        body: `${fullName} submitted a finance application for ${vehicleLabel}.`,
        data: { screen: "FinanceApplicationDetail", financeApplicationId: id },
      });
    }

    const customerUser = await safeDbGet(ctx, resolvedUserId);
    if (customerUser?.pushToken) {
      await ctx.scheduler.runAfter(0, internal.pushNotifications.sendNotification, {
        to: customerUser.pushToken,
        title: "Finance Application Submitted",
        body: `Your application for ${vehicleLabel} has been received.`,
        data: { screen: "FinanceApplicationDetail", financeApplicationId: id },
      });
    }

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: resolvedUserId,
      type: "finance_applied",
      title: "Finance Application",
      description: `${fullName} submitted a finance application for ${vehicleLabel}. Documents via ${documentMethodLabel}.`,
      customerName: fullName,
      customerPhone: args.phone,
      metadata: JSON.stringify({
        ...args,
        assignedToUserId: resolvedAssignedToUserId,
        assignedToName: resolvedAssignedToName,
        vehicleDescription: vehicleLabel,
        fullName,
        documentMethodLabel,
      }),
      triggeredBy: resolvedUserId,
    });

    return id;
  },
});

// Customer: list my applications
export const listMine = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("financeApplications"),
    userId: v.string(),
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
    nextOfKinName: v.string(),
    nextOfKinRelationship: v.optional(v.string()),
    nextOfKinAddress: v.string(),
    nextOfKinTel: v.optional(v.string()),
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
    bankName: v.string(),
    accountNumber: v.string(),
    accountType: v.string(),
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
    hasTradeIn: v.boolean(),
    tradeInFinancingBank: v.optional(v.string()),
    tradeInCarBrand: v.optional(v.string()),
    tradeInYearModel: v.optional(v.string()),
    tradeInKm: v.optional(v.string()),
    tradeInColour: v.optional(v.string()),
    tradeInServiceHistory: v.optional(v.string()),
    tradeInSpareKey: v.optional(v.string()),
    attachmentUrls: v.optional(v.array(v.string())),
    attachmentNames: v.optional(v.array(v.string())),
    documentMethod: v.optional(v.string()),
    status: v.string(),
    staffNotes: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    assignedToUserId: v.optional(v.string()),
    assignedByUserId: v.optional(v.string()),
    assignedByName: v.optional(v.string()),
    assignedAt: v.optional(v.number()),
    reassignedAt: v.optional(v.number()),
    dealStatus: v.optional(v.string()),
    closedDeal: v.optional(v.boolean()),
    closedDealAt: v.optional(v.number()),
    closedByUserId: v.optional(v.string()),
    _creationTime: v.number(),
  })),
  handler: async (ctx) => {
    const { userId, scopeIds } = await getCurrentUser(ctx);
    const ownRows = await Promise.all(scopeIds.map((scopeId) =>
      ctx.db.query("financeApplications").withIndex("by_userId", (q: any) => q.eq("userId", scopeId)).collect()
    ));
    const ownedRows = await Promise.all(scopeIds.map((scopeId) =>
      ctx.db.query("financeApplications").withIndex("by_ownerUserId", (q: any) => q.eq("ownerUserId", scopeId)).collect()
    ));
    const assignedRows = await Promise.all(scopeIds.map((scopeId) =>
      ctx.db.query("financeApplications").withIndex("by_assignedToUserId", (q: any) => q.eq("assignedToUserId", scopeId)).collect()
    ));
    const apps = [...ownRows.flat(), ...ownedRows.flat(), ...assignedRows.flat()]
      .filter((app: any, index: number, arr: any[]) => arr.findIndex((row: any) => String(row._id) === String(app._id)) === index)
      .sort((a: any, b: any) => b._creationTime - a._creationTime);
    return apps.map((a: any) => selectApplicationFields(a));
  },
});

// Staff: list all applications
export const listAll = query({
  args: { statusFilter: v.optional(v.string()) },
  returns: v.array(financeAdminReturnValidator),
  handler: async (ctx, args) => {
    const { user, isStaff } = await getCurrentUser(ctx);
    if (!isStaff) throw new Error("Not authorized");

    if (isFinanceAdminUser(user)) {
      const apps = args.statusFilter
        ? await ctx.db.query("financeApplications")
          .withIndex("by_status", (q: any) => q.eq("status", args.statusFilter))
          .order("desc")
          .collect()
        : await ctx.db.query("financeApplications").order("desc").collect();
      return apps.map(mapAdminFinance);
    }

    const currentUserId = String(user?._id ?? ctx?.userId ?? "");
    const all = await ctx.db.query("financeApplications").order("desc").collect();
    const scoped = all.filter((app: any) => canAccessFinanceDepartment(user, app) && canAccessFinanceRecordForStaff(user, currentUserId, app));
    return scoped.map(mapAdminFinance);
  },
});

export const listAdmin = query({
  args: { statusFilter: v.optional(v.string()) },
  returns: v.array(financeAdminReturnValidator),
  handler: async (ctx, args) => {
    const { user, isStaff } = await getCurrentUser(ctx);
    if (!isFinanceAdminUser(user)) throw new Error("Not authorized");

    const apps = args.statusFilter
      ? await ctx.db.query("financeApplications")
        .withIndex("by_status", (q: any) => q.eq("status", args.statusFilter))
        .order("desc")
        .collect()
      : await ctx.db.query("financeApplications").order("desc").collect();

    return apps.map(mapAdminFinance);
  },
});

export const listPaged = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(financeAdminReturnValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const { user, isStaff } = await getCurrentUser(ctx);
    if (!isStaff && !isFinanceAdminUser(user)) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const currentUserId = String(user?._id ?? "");
    const all = await ctx.db.query("financeApplications").order("desc").collect();
    const scoped = isFinanceAdminUser(user)
      ? all
      : all.filter((app: any) => canAccessFinanceDepartment(user, app) && canAccessFinanceRecordForStaff(user, currentUserId, app));
    const paged = scoped.slice(0, args.paginationOpts.numItems);
    return { page: paged.map(mapAdminFinance), isDone: scoped.length <= args.paginationOpts.numItems, continueCursor: String(args.paginationOpts.numItems) };
  },
});

export const listSalesExecutiveQueue = query({
  args: {},
  returns: v.array(financeAdminReturnValidator),
  handler: async (ctx) => {
    const { user, isStaff } = await getCurrentUser(ctx);
    if (!isStaff && !isFinanceAdminUser(user)) throw new Error("Not authorized");
    if (!isFinanceAdminUser(user) && !isFinanceStaffUser(user)) throw new Error("Not authorized");

    const staffUsers = await ctx.db
      .query("users")
      .withIndex("by_role", (q: any) => q.eq("role", "staff"))
      .collect();
    const salesIds = new Set(
      staffUsers
        .filter((member: any) => member.staffRole === "sales_executive")
        .map((member: any) => String(member._id))
    );

    const apps = await ctx.db.query("financeApplications").order("desc").collect();
    const allowed = canAccessAllFinance(user)
      ? apps
      : apps.filter((app: any) => app.assignedToUserId && salesIds.has(app.assignedToUserId));
    return allowed.map(mapAdminFinance);
  },
});

export const getById = query({
  args: { id: v.id("financeApplications") },
  returns: v.union(v.null(), v.object({
    _id: v.id("financeApplications"),
    _creationTime: v.number(),
    userId: v.string(),
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
    nextOfKinName: v.string(),
    nextOfKinRelationship: v.optional(v.string()),
    nextOfKinAddress: v.string(),
    nextOfKinTel: v.optional(v.string()),
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
    bankName: v.string(),
    accountNumber: v.string(),
    accountType: v.string(),
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
    hasTradeIn: v.boolean(),
    tradeInFinancingBank: v.optional(v.string()),
    tradeInCarBrand: v.optional(v.string()),
    tradeInYearModel: v.optional(v.string()),
    tradeInKm: v.optional(v.string()),
    tradeInColour: v.optional(v.string()),
    tradeInServiceHistory: v.optional(v.string()),
    tradeInSpareKey: v.optional(v.string()),
    attachmentUrls: v.optional(v.array(v.string())),
    attachmentNames: v.optional(v.array(v.string())),
    documentMethod: v.optional(v.string()),
    status: v.string(),
    staffNotes: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    assignedToUserId: v.optional(v.string()),
    assignedByUserId: v.optional(v.string()),
    assignedByName: v.optional(v.string()),
    assignedAt: v.optional(v.number()),
    reassignedAt: v.optional(v.number()),
    dealStatus: v.optional(v.string()),
    closedDeal: v.optional(v.boolean()),
    closedDealAt: v.optional(v.number()),
    closedByUserId: v.optional(v.string()),
    dealershipId: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const { user, isStaff, userId, scopeIds } = await getCurrentUser(ctx);
    const app = await ctx.db.get(args.id);
    if (!app) return null;

    if (isFinanceAdminUser(user)) return selectApplicationFields(app);
    if (app.department && !canAccessFinanceDepartment(user, app)) return null;
    if (!canAccessFinanceRecord(user, userId, app) && !scopeIds.some((scopeId) => [app.owner_id, app.ownerUserId, app.ownerId, app.assignedToUserId, app.userId].map(String).includes(String(scopeId)))) return null;

    return selectApplicationFields(app);
  },
});

// Staff: update application status
export const updateStatus = mutation({
  args: {
    id: v.id("financeApplications"),
    status: v.union(
      v.literal("submitted"),
      v.literal("under_review"),
      v.literal("pre_approved"),
      v.literal("contract_ready"),
      v.literal("approved"),
      v.literal("declined"),
      v.literal("more_info_needed")
    ),
    staffNotes: v.optional(v.string()),
    declineReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, isStaff, userId } = await getCurrentUser(ctx);
    if (!isStaff) {
      throw new Error("Not authorized");
    }

    const app = await ctx.db.get(args.id);
    if (!app) throw new Error("Application not found");
    if (!isFinanceAdminUser(user) && String(app.assignedToUserId ?? app.ownerUserId ?? app.userId) !== String(userId)) {
      throw new Error("Not authorized");
    }

    const staffName = user?.name ?? user?.email ?? "Staff";
    const statusLabel = statusLabels[args.status] ?? args.status;
    const feedback = args.declineReason?.trim() || args.staffNotes;

    await ctx.db.patch(args.id, {
      status: args.status,
      staffNotes: feedback,
      assignedToName: staffName,
      acknowledgedAt: app.acknowledgedAt ?? Date.now(),
    });

    const updatedApp = {
      ...app,
      status: args.status,
      staffNotes: feedback,
      assignedToName: staffName,
    };
    const customerMessage = buildApplicationSummary(updatedApp, statusLabel, feedback);

    await ctx.db.insert("notifications", {
      userId: app.userId,
      type: "finance_update",
      title: `Finance Application ${statusLabel}`,
      message: customerMessage,
      financeApplicationId: args.id,
      targetRoute: "FinanceApplicationDetail",
      targetId: String(args.id),
      isRead: false,
    });

    await ctx.db.insert("messages", buildFinanceMessagePayload({
      senderId: String(user?._id ?? app.assignedByUserId ?? app.userId),
      senderName: staffName,
      senderRole: "staff",
      recipientId: app.userId,
      content: customerMessage,
    }));

    const customerUser = await safeDbGet(ctx, app.userId);
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, customerMessage);
      await sendWhatsAppToCustomer(customerUser.phone, customerMessage);
    }

    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: String(user?._id ?? app.assignedByUserId ?? app.userId),
      type: "finance_applied",
      title: `Finance Application ${statusLabel}`,
      description: `${staffName} updated ${app.firstName} ${app.surname}'s finance application to ${statusLabel}.`,
      customerName: `${app.firstName} ${app.surname}`,
      customerPhone: app.phone,
      metadata: JSON.stringify({ financeApplicationId: args.id.toString(), status: args.status, staffNotes: args.staffNotes }),
      triggeredBy: String(user?._id ?? app.assignedByUserId ?? app.userId),
    });

    return null;
  },
});

export const sendFinanceFollowUpReminder = mutation({
  args: { id: v.id("financeApplications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, isStaff, userId } = await getCurrentUser(ctx);
    if (!isStaff) throw new Error("Not authorized");

    const app = await ctx.db.get(args.id);
    if (!app) throw new Error("Application not found");

    const staffName = user?.name ?? user?.email ?? "Staff";
    await ctx.runMutation(internal.activityLog.logInternal, {
      ownerUserId: user?._id ? String(user._id) : undefined,
      type: "finance_applied",
      title: "Finance Follow-up Reminder",
      description: `${staffName} requested a finance follow-up for ${app.firstName} ${app.surname}.`,
      customerName: `${app.firstName} ${app.surname}`,
      customerPhone: app.phone,
      metadata: JSON.stringify({ financeApplicationId: args.id.toString() }),
      triggeredBy: user?._id ? String(user._id) : undefined,
    });

    return null;
  },
});

export const assignLead = mutation({
  args: {
    id: v.id("financeApplications"),
    assignedToUserId: v.optional(v.union(v.id("users"), v.id("staff"))),
    assignedToName: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("submitted"),
      v.literal("under_review"),
      v.literal("pre_approved"),
      v.literal("contract_ready"),
      v.literal("approved"),
      v.literal("declined"),
      v.literal("more_info_needed")
    )),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, isStaff } = await getCurrentUser(ctx);
    if (!isStaff) throw new Error("Not authorized");

    const app = await ctx.db.get(args.id);
    if (!app) throw new Error("Application not found");
    if (!isFinanceAdminUser(user) && String(app.assignedToUserId ?? app.ownerUserId ?? app.userId) !== String(user?._id ?? "")) throw new Error("Not authorized");

    const now = Date.now();
    const assignedName = args.assignedToName ?? user?.name ?? user?.email ?? "Staff";

    if (app.acknowledgedAt) throw new Error("This application has already been acknowledged and cannot be reassigned.");
    if (!canReassignFinance(user, app)) throw new Error("Not authorized");

    let resolvedAssigneeUserId: string | undefined = undefined;
    let resolvedAssigneeName = args.assignedToName;

    if (args.assignedToUserId) {
      const assigneeDoc = await safeDbGet(ctx, args.assignedToUserId);
      if (assigneeDoc) {
        if (typeof assigneeDoc.email === "string" && assigneeDoc.email) {
          const linkedUser = await ctx.db
            .query("users")
            .withIndex("email", (q: any) => q.eq("email", assigneeDoc.email))
            .first();
          resolvedAssigneeUserId = linkedUser?._id ? String(linkedUser._id) : String(assigneeDoc._id);
        } else {
          resolvedAssigneeUserId = String(assigneeDoc._id);
        }
        resolvedAssigneeName = resolvedAssigneeName ?? assigneeDoc.name ?? assigneeDoc.email ?? undefined;
      } else {
        resolvedAssigneeUserId = String(args.assignedToUserId);
      }
    }

    const patch: any = {
      assignedByUserId: user?._id ?? undefined,
      assignedByName: assignedName,
      assignedAt: app.assignedAt ?? now,
      reassignedAt: app.assignedAt ? now : undefined,
      assignedToName: resolvedAssigneeName ?? app.assignedToName,
      assignedToUserId: resolvedAssigneeUserId,
      assignedTo: resolvedAssigneeName ?? app.assignedTo,
    };
    if (args.status) patch.status = args.status;

    await ctx.db.patch(args.id, patch);

    const assignee = resolvedAssigneeUserId ? await safeDbGet(ctx, resolvedAssigneeUserId) : null;
    const assigneeLabel = resolvedAssigneeName ?? assignee?.name ?? assignee?.email ?? "Sales Executive";
    const message = buildApplicationSummary({ ...app, ...patch }, "Assigned", `Assigned to ${assigneeLabel}`);

    await ctx.db.insert("notifications", {
      userId: app.userId,
      type: "finance_assigned",
      title: "Finance Application Assigned",
      message,
      financeApplicationId: args.id,
      targetRoute: "FinanceApplicationDetail",
      targetId: String(args.id),
      isRead: false,
    });

    await ctx.db.insert("messages", buildFinanceMessagePayload({
      senderId: String(user?._id ?? app.assignedByUserId ?? app.userId),
      senderName: user?.name ?? user?.email ?? "Staff",
      senderRole: "staff",
      recipientId: app.userId,
      content: `Your finance application has been assigned to ${assigneeLabel}.`,
    }));

    await ctx.db.insert("notifications", {
      userId: resolvedAssigneeUserId,
      type: "finance_assigned",
      title: "New Finance Lead Assigned",
      message: `${app.firstName} ${app.surname}'s finance application has been assigned to you.`,
      isRead: false,
    });

    return null;
  },
});

export const closeDeal = mutation({
  args: {
    id: v.id("financeApplications"),
    delivered: v.optional(v.boolean()),
    dealStatus: v.optional(v.union(v.literal("sold"), v.literal("delivered"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, isStaff } = await getCurrentUser(ctx);
    if (!isStaff) throw new Error("Not authorized");

    const app = await ctx.db.get(args.id);
    if (!app) throw new Error("Application not found");
    if (!isFinanceAdminUser(user) && String(app.assignedToUserId ?? app.ownerUserId ?? app.userId) !== String(user?._id ?? "")) throw new Error("Not authorized");

    const closedAt = Date.now();
    const statusText = args.dealStatus ?? (args.delivered ? "delivered" : "sold");
    const inventory = app.inventoryItemId ? await ctx.db.get(app.inventoryItemId) : null;
    const derivedVehicleDescription = [inventory?.year, inventory?.make, inventory?.model].filter(Boolean).join(" ");
    const allocatedVehicleDescription = app.vehicleDescription || derivedVehicleDescription || "Vehicle";

    await ctx.db.patch(args.id, {
      dealStatus: statusText,
      closedDeal: true,
      closedDealAt: closedAt,
      closedByUserId: user?._id,
      status: "approved",
    });

    if (statusText === "delivered") {
      await creditFinanceReferralWallet(ctx, app);
    }

    const customerProfile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", app.userId))
      .first();

    if (customerProfile) {
      await ctx.db.patch(customerProfile._id, {
        allocatedVehicleDescription,
        allocatedVehicleInventoryItemId: app.inventoryItemId,
        allocatedVehicleMake: inventory?.make,
        allocatedVehicleModel: inventory?.model,
        allocatedVehicleYear: inventory?.year,
        allocatedVehicleVin: inventory?.vin,
        allocatedVehicleRegistration: inventory?.vin ?? customerProfile.allocatedVehicleRegistration,
        allocatedVehicleStatus: statusText,
        allocatedVehicleSoldAt: statusText === "sold" ? closedAt : customerProfile.allocatedVehicleSoldAt,
        allocatedVehicleDeliveredAt: statusText === "delivered" ? closedAt : customerProfile.allocatedVehicleDeliveredAt,
      });
    }

    if (inventory) {
      const existingVehicles = await ctx.db
        .query("vehicles")
        .withIndex("by_userId", (q: any) => q.eq("userId", app.userId))
        .collect();
      const registration = inventory.vin ?? `${app._id}`;
      const alreadyLinked = existingVehicles.some((vehicle: any) => vehicle.registration === registration);
      if (!alreadyLinked) {
        await ctx.db.insert("vehicles", {
          userId: app.userId,
          make: inventory.make,
          model: inventory.model,
          year: inventory.year,
          registration,
          color: inventory.color,
          mileage: inventory.mileage,
          isDefault: existingVehicles.length === 0,
          isDeleted: false,
        });
      }
    }

    const summary = buildApplicationSummary(
      { ...app, dealStatus: statusText, closedDeal: true },
      statusText === "delivered" ? "Delivered" : "Sold",
      statusText === "delivered" ? "Vehicle delivered to customer" : "Vehicle marked as sold and allocated"
    );

    await ctx.db.insert("notifications", {
      userId: app.userId,
      type: "finance_closed",
      title: statusText === "delivered" ? "Vehicle Delivered" : "Vehicle Sold",
      message: summary,
      financeApplicationId: args.id,
      targetRoute: "FinanceApplicationDetail",
      targetId: String(args.id),
      isRead: false,
    });

    const financeRecipients = await getFinanceDepartmentRecipientIds(ctx);
    for (const userId of financeRecipients) {
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
        userId,
        title: statusText === "delivered" ? "Finance Deal Delivered" : "Finance Deal Closed",
        message: `${app.firstName} ${app.surname}'s finance deal for ${allocatedVehicleDescription} has been marked ${statusText}.`,
      });
    }

    await ctx.db.insert("messages", buildFinanceMessagePayload({
      senderId: String(user?._id ?? app.closedByUserId ?? app.userId),
      senderName: user?.name ?? user?.email ?? "Staff",
      senderRole: "staff",
      recipientId: app.userId,
      content: summary,
    }));

    const customerUser = await safeDbGet(ctx, app.userId);
    if (customerUser?.phone) {
      await sendSMSToCustomer(customerUser.phone, summary);
      await sendWhatsAppToCustomer(customerUser.phone, summary);
    }

    return null;
  },
});