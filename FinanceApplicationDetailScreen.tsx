import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

export default function FinanceApplicationDetailScreen({ route, navigation }: any) {
  const routeApplication = route.params?.application;
  const applicationId = route.params?.applicationId ?? routeApplication?._id ?? null;
  const isStaffView = Boolean(route.params?.isStaff);
  const [showPreview, setShowPreview] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const updateStatus = useMutation(api.finance.updateStatus);
  const closeDeal = useMutation(api.finance.closeDeal);
  const assignLead = useMutation(api.finance.assignLead);
  const salesStaff = useQuery(api.staff.publicOnlineFinanceStaff, isStaffView ? {} : 'skip') ?? [];
  const application = useQuery(api.finance.getById, applicationId ? { id: applicationId } : 'skip') ?? null;

  const formatApplicationSummary = (app: any) => {
    const fullName = `${app.firstName ?? ''} ${app.surname ?? app.lastName ?? ''}`.trim();
    const tradeInSummary = app.hasTradeIn
      ? `${app.tradeInCarBrand ?? 'Unknown'} ${app.tradeInYearModel ?? ''} ${app.tradeInKm ? `| ${app.tradeInKm} km` : ''} ${app.tradeInColour ? `| ${app.tradeInColour}` : ''}`.trim()
      : 'No trade-in';

    return `
Finance Application Summary

PERSONAL DETAILS
Name: ${fullName || 'Unknown'}
ID No.: ${app.idNumber ?? ''}
Email: ${app.email ?? ''}
Phone: ${app.phone ?? ''}
Address: ${app.address ?? ''}

NEXT OF KIN
Name: ${app.nextOfKinName ?? ''}
Address: ${app.nextOfKinAddress ?? ''}

EMPLOYMENT
Employer: ${app.employerName ?? ''}
Occupation: ${app.occupation ?? ''}
Years Worked: ${app.yearsAtCompany ?? ''}
Salary Date: ${app.salaryDate ?? ''}
Gross Income: ${app.grossIncome ?? ''}
Net Income: ${app.netIncome ?? ''}

MONTHLY EXPENSES
Monthly Total: ${app.monthlyExpenses ?? 0}

BANKING
Bank: ${app.bankName ?? ''}
Account: ${app.accountNumber ?? ''}
Type: ${app.accountType ?? ''}

TRADE-IN
${tradeInSummary}
${app.staffNotes ? `
STAFF FEEDBACK
${app.staffNotes}
` : ''}

Status: ${app.status ?? ''}
`;
  };

  const handleShare = async () => {
    try {
      const summary = formatApplicationSummary(application);
      await Share.share({
        message: summary,
        title: 'Finance Application',
      });
    } catch {
      // no-op
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!application?._id) return;
    setStatusUpdating(true);
    try {
      await updateStatus({
        id: application._id,
        status: newStatus,
        staffNotes: `Status updated to ${newStatus}`,
      });
    } catch {
      // no-op
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDecline = async () => {
    if (!application?._id) return;
    const reason = declineReason.trim();
    if (!reason) return;
    setStatusUpdating(true);
    try {
      await updateStatus({
        id: application._id,
        status: 'declined',
        staffNotes: reason,
        declineReason: reason,
      });
      setDeclineReason('');
    } catch {
      // no-op
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleCloseDeal = async (delivered: boolean) => {
    if (!application?._id) return;
    setStatusUpdating(true);
    try {
      await closeDeal({
        id: application._id,
        delivered,
        dealStatus: delivered ? 'delivered' : 'sold',
      });
    } catch {
      // no-op
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAssign = async (staff: any) => {
    if (!application?._id) return;
    try {
      setStatusUpdating(true);
      await assignLead({
        id: application._id,
        assignedToUserId: staff.userId ?? undefined,
        assignedToName: staff.name ?? staff.email,
      });
      setShowAssign(false);
    } catch {
      // no-op
    } finally {
      setStatusUpdating(false);
    }
  };

  const statusOptions = [
    { key: 'submitted', label: 'Submitted' },
    { key: 'under_review', label: 'Under Review' },
    { key: 'pre_approved', label: 'Pre-Approved' },
    { key: 'contract_ready', label: 'Contract Ready' },
  ];

  const fullName = `${application?.firstName ?? ''} ${application?.surname ?? application?.lastName ?? ''}`.trim();

  if (applicationId && application === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.accessDeniedWrap}>
          <Ionicons name="lock-closed-outline" size={44} color={colors.primary} />
          <Text style={styles.accessDeniedTitle}>Loading finance application</Text>
          <Text style={styles.accessDeniedText}>We're opening the submitted finance application. If it still fails, refresh the app and try again.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Finance Application</Text>
          <Text style={styles.status}>{application?.status ?? 'submitted'}</Text>
        </View>

        {!isStaffView ? (
          <View style={styles.customerBanner}>
            <Ionicons name="document-text-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.customerBannerTitle}>Submitted finance application</Text>
              <Text style={styles.customerBannerText}>This is your customer view. You can review the submitted details and track the current status here.</Text>
            </View>
          </View>
        ) : null}

        {isStaffView ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={() => setShowPreview(true)}
            >
              <Ionicons name="eye" size={18} color="white" />
              <Text style={styles.primaryButtonText}>View</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={handleShare}
            >
              <Ionicons name="share-social" size={18} color={colors.primary} />
              <Text style={styles.buttonText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={() => setShowAssign(true)}
            >
              <Ionicons name="person-add" size={18} color={colors.primary} />
              <Text style={styles.buttonText}>Assign</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.button, styles.primaryButton, { marginBottom: spacing.lg }]} onPress={() => setShowPreview(true)}>
            <Ionicons name="eye" size={18} color="white" />
            <Text style={styles.primaryButtonText}>View full submitted details</Text>
          </TouchableOpacity>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Details</Text>
          <SummaryRow label="Name" value={fullName || '—'} />
          <SummaryRow label="ID No." value={application?.idNumber} />
          <SummaryRow label="Email" value={application?.email} />
          <SummaryRow label="Phone" value={application?.phone} />
          <SummaryRow label="Address" value={application?.address} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next of Kin</Text>
          <SummaryRow label="Name" value={application?.nextOfKinName} />
          <SummaryRow label="Address" value={application?.nextOfKinAddress} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Employment</Text>
          <SummaryRow label="Employer" value={application?.employerName} />
          <SummaryRow label="Occupation" value={application?.occupation} />
          <SummaryRow label="Years Worked" value={application?.yearsAtCompany} />
          <SummaryRow label="Salary Date" value={application?.salaryDate} />
          <SummaryRow label="Gross Income" value={application?.grossIncome ? `R${application.grossIncome}` : '—'} />
          <SummaryRow label="Net Income" value={application?.netIncome ? `R${application.netIncome}` : '—'} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monthly Expenses</Text>
          <SummaryRow label="Monthly Total" value={application?.monthlyExpenses ? `R${application.monthlyExpenses}` : '—'} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Banking Details</Text>
          <SummaryRow label="Bank Name" value={application?.bankName} />
          <SummaryRow label="Account Number" value={application?.accountNumber} />
          <SummaryRow label="Account Type" value={application?.accountType} />
        </View>

        {application?.hasTradeIn && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trade-In Vehicle</Text>
            <SummaryRow label="Brand" value={application.tradeInCarBrand} />
            <SummaryRow label="Year / Model" value={application.tradeInYearModel} />
            <SummaryRow label="Mileage" value={application.tradeInKm ? `${application.tradeInKm} km` : '—'} />
            <SummaryRow label="Colour" value={application.tradeInColour} />
            <SummaryRow label="Finance Bank" value={application.tradeInFinancingBank} />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Update Status</Text>
          <View style={styles.statusGrid}>
            {statusOptions.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.statusButton,
                  application?.status === option.key && styles.statusButtonActive,
                ]}
                onPress={() => handleStatusUpdate(option.key)}
                disabled={statusUpdating}
              >
                <Text
                  style={[
                    styles.statusButtonText,
                    application?.status === option.key && styles.statusButtonTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {isStaffView ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Close as Sold / Delivered</Text>
              <Text style={styles.helperText}>
                Mark the application as sold when the deal is finalized, or delivered once the car has left the dealership.
              </Text>
              <View style={styles.dealActionRow}>
                <TouchableOpacity
                  style={[styles.dealActionPill, styles.dealActionPillSecondary]}
                  onPress={() => handleCloseDeal(false)}
                  disabled={statusUpdating}
                >
                  <View style={[styles.dealActionIconWrap, styles.dealActionIconWrapSecondary]}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                  </View>
                  <View style={styles.dealActionTextWrap}>
                    <Text style={styles.dealActionLabel}>Mark Sold</Text>
                    <Text style={styles.dealActionHint}>Close the deal in the finance system</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dealActionPill, styles.dealActionPillPrimary]}
                  onPress={() => handleCloseDeal(true)}
                  disabled={statusUpdating}
                >
                  <View style={[styles.dealActionIconWrap, styles.dealActionIconWrapPrimary]}>
                    <Ionicons name="car-sport" size={16} color={colors.white} />
                  </View>
                  <View style={styles.dealActionTextWrap}>
                    <Text style={styles.dealActionLabelPrimary}>Mark Delivered</Text>
                    <Text style={styles.dealActionHintPrimary}>Record the vehicle handover</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Decline Application</Text>
              <Text style={styles.helperText}>
                Add a clear reason before declining so the user can see why the application was declined.
              </Text>
              <TextInput
                value={declineReason}
                onChangeText={setDeclineReason}
                placeholder="Reason for decline"
                placeholderTextColor={colors.textSecondary}
                multiline
                style={styles.textInput}
                editable={!statusUpdating}
              />
              <TouchableOpacity
                style={[
                  styles.declineButton,
                  (!declineReason.trim() || statusUpdating) && styles.buttonDisabled,
                ]}
                onPress={handleDecline}
                disabled={!declineReason.trim() || statusUpdating}
              >
                <Ionicons name="close-circle" size={18} color={colors.white} />
                <Text style={styles.declineButtonText}>Decline & Send Reason</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Assigned Staff</Text>
              <SummaryRow label="Assigned to" value={application?.assignedToName || 'Unassigned'} />
            </View>

            {application?.staffNotes ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Staff Feedback</Text>
                <Text style={styles.feedbackText}>{application.staffNotes}</Text>
              </View>
            ) : null}
          </>
        ) : null}

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <Modal
        visible={showPreview}
        animationType="slide"
        onRequestClose={() => setShowPreview(false)}
      >
        <SafeAreaView style={styles.container}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowPreview(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Full Application Preview</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.previewText}>{formatApplicationSummary(application)}</Text>
            <View style={{ height: spacing.xl }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={showAssign} transparent animationType="slide" onRequestClose={() => setShowAssign(false)}>
        <View style={styles.assignOverlay}>
          <View style={styles.assignCard}>
            <View style={styles.assignHeader}>
              <Text style={styles.assignTitle}>Assign Finance Lead</Text>
              <TouchableOpacity onPress={() => setShowAssign(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {salesStaff.map((staff: any) => (
                <TouchableOpacity key={staff.userId ?? staff.email} style={styles.assignRow} onPress={() => void handleAssign(staff)}>
                  <View style={styles.assignAvatar}><Ionicons name="person" size={18} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.assignName}>{staff.name ?? staff.email}</Text>
                    <Text style={styles.assignRole}>{staff.role}</Text>
                  </View>
                  {staff.isOnline ? <View style={styles.assignOnlineDot} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: any }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  status: {
    fontSize: 14,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  dealActionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  dealActionPill: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
  },
  dealActionPillSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.borderLight,
  },
  dealActionPillPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dealActionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealActionIconWrapSecondary: {
    backgroundColor: colors.primary + '14',
  },
  dealActionIconWrapPrimary: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  dealActionTextWrap: {
    flex: 1,
  },
  dealActionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  dealActionLabelPrimary: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  dealActionHint: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dealActionHintPrimary: {
    fontSize: 11,
    color: colors.primaryLight,
    marginTop: 2,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statusButton: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statusButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  statusButtonTextActive: {
    color: colors.white,
  },
  helperText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  textInput: {
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  declineButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  declineButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  feedbackText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  modalContent: {
    flex: 1,
    padding: spacing.lg,
  },
  previewText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 24,
    fontFamily: 'monospace',
  },
  assignOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  assignCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  assignHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  assignTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  assignAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  assignRole: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  assignOnlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  accessDeniedWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  accessDeniedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  accessDeniedText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  customerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '20',
    marginBottom: spacing.lg,
  },
  customerBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },
  customerBannerText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
});