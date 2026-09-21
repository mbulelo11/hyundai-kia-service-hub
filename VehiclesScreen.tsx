import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

const POPULAR_MAKES = ['Hyundai', 'Toyota', 'Nissan', 'Ford', 'BMW', 'Mercedes', 'Volkswagen', 'Honda', 'Kia', 'Mazda'];

export default function VehiclesScreen({ navigation }: any) {
  const vehicles = useQuery(api.vehicles.list) ?? [];
  const addVehicle = useMutation(api.vehicles.add);
  const setDefault = useMutation(api.vehicles.setDefault);
  const removeVehicle = useMutation(api.vehicles.remove);

  const [showAdd, setShowAdd] = useState(false);
  const [make, setMake] = useState('Hyundai');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [registration, setRegistration] = useState('');

  const handleAdd = async () => {
    if (!make.trim() || !model.trim() || !year.trim() || !registration.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all fields');
      return;
    }
    await addVehicle({
      make: make.trim(),
      model: model.trim(),
      year: parseInt(year),
      registration: registration.trim().toUpperCase(),
    });
    setShowAdd(false);
    setModel('');
    setRegistration('');
  };

  const handleRemove = (id: any) => {
    Alert.alert(
      'Archive Vehicle',
      'This vehicle will be hidden from your list but all associated booking history will be preserved. You can contact support to restore it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => removeVehicle({ vehicleId: id }) },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Vehicles</Text>
          <TouchableOpacity onPress={() => setShowAdd(true)}>
            <Ionicons name="add-circle" size={28} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {vehicles.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="car-outline" size={56} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No vehicles added</Text>
              <Text style={styles.emptyText}>Add your vehicle to start booking services</Text>
            </View>
          )}
          {vehicles.map((v: any) => (
            <View key={v._id} style={[styles.card, v.isDefault && styles.defaultCard]}>
              <View style={styles.cardLeft}>
                <Ionicons name="car" size={28} color={v.isDefault ? colors.primary : colors.textSecondary} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>
                  {v.year} {v.make} {v.model}
                </Text>
                <Text style={styles.cardReg}>{v.registration}</Text>
                {v.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultText}>DEFAULT</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardActions}>
                {!v.isDefault && (
                  <TouchableOpacity
                    style={styles.setDefaultBtn}
                    onPress={() => setDefault({ vehicleId: v._id })}
                  >
                    <Text style={styles.setDefaultText}>Set Default</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => handleRemove(v._id)}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* Add Vehicle Modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalContainer}
        >
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Add Vehicle</Text>
              <TouchableOpacity onPress={handleAdd}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.form}>
              <Text style={styles.label}>Make</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.makePicker}>
                {POPULAR_MAKES.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.makeChip, make === m && styles.makeChipActive]}
                    onPress={() => setMake(m)}
                  >
                    <Text style={[styles.makeChipText, make === m && styles.makeChipTextActive]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Model</Text>
              <TextInput
                style={styles.input}
                value={model}
                onChangeText={setModel}
                placeholder="e.g. Tucson, i30, Creta"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Year</Text>
              <TextInput
                style={styles.input}
                value={year}
                onChangeText={setYear}
                placeholder="e.g. 2024"
                keyboardType="number-pad"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.label}>Registration Number</Text>
              <TextInput
                style={styles.input}
                value={registration}
                onChangeText={setRegistration}
                placeholder="e.g. ABC 123 GP"
                autoCapitalize="characters"
                placeholderTextColor={colors.textLight}
              />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingVertical: 64, backgroundColor: colors.surface, marginHorizontal: spacing.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderLight, marginTop: spacing.lg },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  defaultCard: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.surfaceElevated },
  cardLeft: { marginRight: spacing.md },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardReg: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  defaultBadge: {
    backgroundColor: colors.primary + '15',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  defaultText: { fontSize: 10, fontWeight: '700', color: colors.primary, letterSpacing: 1 },
  cardActions: { alignItems: 'flex-end', gap: spacing.sm },
  setDefaultBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.primary + '10',
  },
  setDefaultText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalSafe: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  cancelText: { fontSize: 16, color: colors.textSecondary },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  saveText: { fontSize: 16, fontWeight: '600', color: colors.primary },
  form: { padding: spacing.lg, gap: spacing.sm },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  makePicker: { marginVertical: spacing.sm },
  makeChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  makeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  makeChipText: { fontSize: 14, fontWeight: '500', color: colors.text },
  makeChipTextActive: { color: colors.white },
});