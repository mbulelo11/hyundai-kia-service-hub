import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing } from '../lib/theme';

export default function StaffDebugScreen() {
  const user = useQuery(api.users.me);
  const bookings = useQuery(api.bookings.listAllBookingsForStaffSimple) ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>🔍 DEBUG: Staff Access</Text>

        {/* USER INFO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Account</Text>
          {user === undefined ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : user === null ? (
            <Text style={styles.error}>NOT AUTHENTICATED</Text>
          ) : (
            <>
              <DebugField label="Name" value={user.name} />
              <DebugField label="Email" value={user.email} />
              <DebugField label="Role" value={user.role} highlight={user.role !== 'staff'} />
              <DebugField label="Staff Role" value={user.staffRole} />
              <DebugField label="Is Owner" value={String(user.isOwner)} />
              <DebugField label="Is Deleted" value={String(user.isDeleted)} />
              <DebugField label="Staff Approval" value={user.staffApprovalStatus} />
              {user.role !== 'staff' && (
                <Text style={styles.warning}>
                  ⚠️ Your role is '{user.role}'. Staff must have role='staff'.
                </Text>
              )}
            </>
          )}
        </View>

        {/* BOOKINGS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bookings Found: {bookings.length}</Text>
          {bookings.length === 0 ? (
            <Text style={styles.warning}>No bookings returned from query</Text>
          ) : (
            bookings.map((b: any, i: number) => (
              <View key={i} style={styles.bookingDebug}>
                <Text style={styles.debugText}>
                  {i + 1}. {b.customerName} - {b.serviceType} ({b.status})
                </Text>
              </View>
            ))
          )}
        </View>

        {/* RECOMMENDATIONS */}
        {user && user.role !== 'staff' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚡ Action Required</Text>
            <Text style={styles.fixText}>
              Your user account must have role='staff' to access staff features. Contact admin to update your role.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DebugField({ label, value, highlight }: any) {
  return (
    <View style={[styles.field, highlight && styles.fieldHighlight]}>
      <Text style={styles.fieldLabel}>{label}:</Text>
      <Text style={highlight ? styles.fieldValueBad : styles.fieldValue}>{value || '(empty)'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1, padding: spacing.lg },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.lg },
  section: { marginBottom: spacing.xl, backgroundColor: colors.surface, padding: spacing.lg, borderRadius: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.primary, marginBottom: spacing.md },
  field: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  fieldHighlight: { backgroundColor: colors.warning + '15' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  fieldValue: { fontSize: 13, color: colors.text, marginTop: 2, fontWeight: '500' },
  fieldValueBad: { fontSize: 13, color: colors.error, marginTop: 2, fontWeight: '700' },
  error: { fontSize: 14, color: colors.error, fontWeight: '700' },
  warning: { fontSize: 13, color: colors.warning, marginTop: spacing.sm, lineHeight: 20 },
  fixText: { fontSize: 13, color: colors.text, lineHeight: 20 },
  bookingDebug: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  debugText: { fontSize: 12, color: colors.text, fontFamily: 'monospace' },
});
