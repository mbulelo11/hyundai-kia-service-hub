import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

const formatPrice = (price?: number) => (price ? `R ${price.toLocaleString()}` : 'Price on request');

export default function CompareVehiclesScreen({ navigation, route }: any) {
  const inventoryItems = useQuery(api.inventory.list, { categoryFilter: undefined, limit: 10 });
  const items = useMemo(() => inventoryItems ?? [], [inventoryItems]);
  const [selectedIds, setSelectedIds] = useState<string[]>(route?.params?.initialVehicleIds ?? []);

  useEffect(() => {
    const initial = route?.params?.initialVehicleIds;
    if (Array.isArray(initial) && initial.length > 0) {
      setSelectedIds((prev: string[]) => Array.from(new Set([...(prev ?? []), ...initial.map(String)])).slice(0, 4));
    }
  }, [route?.params?.initialVehicleIds]);

  const selectedItems = useMemo(
    () => items.filter((item: any) => selectedIds.includes(String(item._id))).slice(0, 4),
    [items, selectedIds]
  );

  const comparisonLink = useMemo(() => {
    const base = 'https://app.hyundai.kia.compare';
    return `${base}/compare?ids=${encodeURIComponent(selectedIds.join(','))}`;
  }, [selectedIds]);

  const toggleItem = (itemId: string) => {
    setSelectedIds((prev: string[]) => {
      if (prev.includes(itemId)) return prev.filter((id: string) => id !== itemId);
      if (prev.length >= 4) return prev;
      return [...prev, itemId];
    });
  };

  const handleShare = async () => {
    await Share.share({ message: comparisonLink, url: comparisonLink });
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.primary }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Compare Vehicles</Text>
            <Text style={styles.subtitle}>Select up to 4 cars to compare side by side</Text>
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={handleShare} disabled={selectedItems.length === 0}>
            <Text style={styles.saveBtnText}>Share</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Selected vehicles</Text>
        {selectedItems.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="git-compare-outline" size={42} color={colors.textLight} />
            <Text style={styles.emptyText}>Tap Compare on stock, or pick vehicles below.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compareRow}>
            {selectedItems.map((item: any) => (
              <View key={item._id} style={styles.compareCard}>
                {item.imageUrls?.[0] ? (
                  <Image source={{ uri: item.imageUrls[0] }} style={styles.compareImage} resizeMode="contain" />
                ) : (
                  <View style={[styles.compareImage, styles.comparePlaceholder]}>
                    <Ionicons name="car-sport" size={34} color={colors.textLight} />
                  </View>
                )}
                <Text style={styles.compareName} numberOfLines={2}>{item.year} {item.make} {item.model}</Text>
                <Text style={styles.comparePrice}>{formatPrice(item.price)}</Text>
                <TouchableOpacity style={styles.removeBtn} onPress={() => toggleItem(String(item._id))}>
                  <Text style={styles.removeBtnText}>Remove</Text>
                </TouchableOpacity>
                <View style={styles.specRow}><Text style={styles.specLabel}>Category</Text><Text style={styles.specValue}>{item.category}</Text></View>
                <View style={styles.specRow}><Text style={styles.specLabel}>Color</Text><Text style={styles.specValue}>{item.color ?? '—'}</Text></View>
                <View style={styles.specRow}><Text style={styles.specLabel}>Status</Text><Text style={styles.specValue}>{item.status}</Text></View>
              </View>
            ))}
          </ScrollView>
        )}

        <Text style={styles.sectionTitle}>Stock list</Text>
        <View style={styles.grid}>
          {items.map((item: any) => {
            const selected = selectedIds.includes(String(item._id));
            return (
              <TouchableOpacity key={item._id} style={[styles.stockCard, selected && styles.stockCardActive]} onPress={() => toggleItem(String(item._id))}>
                {item.imageUrls?.[0] ? (
                  <Image source={{ uri: item.imageUrls[0] }} style={styles.stockImage} resizeMode="contain" />
                ) : (
                  <View style={[styles.stockImage, styles.comparePlaceholder]}>
                    <Ionicons name="car-outline" size={28} color={colors.textLight} />
                  </View>
                )}
                <Text style={styles.stockTitle} numberOfLines={2}>{item.year} {item.make} {item.model}</Text>
                <Text style={styles.stockMeta}>{formatPrice(item.price)}</Text>
                <Text style={styles.stockMeta}>{item.color ?? item.category}</Text>
                <View style={[styles.selectChip, selected && styles.selectChipActive]}>
                  <Text style={[styles.selectChipText, selected && styles.selectChipTextActive]}>{selected ? 'Selected' : 'Add'}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSoft, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderLight },
  title: { color: colors.white, fontSize: 20, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  content: { padding: spacing.lg, paddingBottom: 100 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.white, marginBottom: spacing.sm, marginTop: spacing.sm },
  emptyBox: { alignItems: 'center', paddingVertical: 28, backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight, gap: 10 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 20 },
  compareRow: { gap: spacing.md, paddingVertical: 8 },
  compareCard: { width: 220, backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight, overflow: 'hidden', paddingBottom: 12, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  compareImage: { width: '100%', height: 140, backgroundColor: colors.surfaceSoft },
  comparePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  compareName: { fontSize: 15, fontWeight: '800', color: colors.white, paddingHorizontal: 12, paddingTop: 10 },
  comparePrice: { fontSize: 16, fontWeight: '800', color: colors.primaryLight, paddingHorizontal: 12, marginTop: 4 },
  removeBtn: { alignSelf: 'flex-start', marginLeft: 12, marginTop: 8, backgroundColor: colors.error + '18', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  removeBtnText: { color: colors.error, fontSize: 12, fontWeight: '700' },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, marginTop: 8 },
  specLabel: { fontSize: 12, color: colors.textSecondary },
  specValue: { fontSize: 12, fontWeight: '700', color: colors.white },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md },
  stockCard: { width: '48%', backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight, overflow: 'hidden', paddingBottom: 12, shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  stockCardActive: { borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.18, shadowRadius: 12, elevation: 5 },
  stockImage: { width: '100%', height: 120, backgroundColor: colors.surfaceSoft },
  stockTitle: { paddingHorizontal: 10, paddingTop: 8, fontSize: 14, fontWeight: '800', color: colors.white },
  stockMeta: { paddingHorizontal: 10, marginTop: 4, fontSize: 12, color: colors.textSecondary },
  selectChip: { alignSelf: 'flex-start', marginLeft: 10, marginTop: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceSoft },
  selectChipActive: { backgroundColor: colors.primary },
  selectChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  selectChipTextActive: { color: colors.white },
  saveBtn: { backgroundColor: colors.surfaceElevated, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderLight },
  saveBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
});