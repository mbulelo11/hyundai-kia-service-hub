import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../lib/theme';
import {
  PUBLIC_LANDING_URL,
  SOCIAL_PLATFORMS,
  shareOnPlatform,
  type ShareContext,
  type SocialPlatformId,
} from '../lib/shareUtils';

interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  message: string;
  title?: string;
  shareUrl?: string;
  shareContext?: ShareContext;
  referralCode?: string;
  onShareComplete?: (platform: string) => void;
}

export default function ShareSheetModal({
  visible,
  onClose,
  message,
  title = 'Share',
  shareUrl = PUBLIC_LANDING_URL,
  shareContext = { type: 'invite' },
  referralCode,
  onShareComplete,
}: ShareSheetProps) {
  const platforms: Array<{ id: SocialPlatformId; label: string; icon: string; color: string }> = [
    ...SOCIAL_PLATFORMS,
  ];

  const handleShare = async (platformId: SocialPlatformId) => {
    try {
      await shareOnPlatform(platformId, shareContext, referralCode);
      onShareComplete?.(platformId);
      onClose();
    } catch {
      // silent fail
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.title}>{title}</Text>
          <Text style={s.preview} numberOfLines={3}>{message}</Text>

          <View style={s.grid}>
            {platforms.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={s.platformBtn}
                onPress={() => handleShare(p.id)}
                activeOpacity={0.7}
              >
                <View style={[s.iconCircle, { backgroundColor: p.color + '15' }]}>
                  <Ionicons name={p.icon as any} size={26} color={p.color} />
                </View>
                <Text style={s.platformLabel}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xxl,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  preview: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.xl,
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  platformBtn: {
    alignItems: 'center',
    gap: 6,
    width: 72,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  platformLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});