import React from 'react';
import { Image, Text, View, StyleSheet } from 'react-native';
import { colors } from './theme';

type UserAvatarProps = {
  uri?: string | null;
  name?: string | null;
  email?: string | null;
  size?: number;
  fallbackSize?: number;
  borderRadius?: number;
  backgroundColor?: string;
  textColor?: string;
  style?: any;
  imageStyle?: any;
};

export default function UserAvatar({
  uri,
  name,
  email,
  size = 40,
  fallbackSize,
  borderRadius,
  backgroundColor = colors.primary,
  textColor = colors.white,
  style,
  imageStyle,
}: UserAvatarProps) {
  const initialsSource = String(name ?? email ?? '?').trim();
  const initials = initialsSource ? initialsSource.charAt(0).toUpperCase() : '?';
  const avatarSize = size;
  const textSize = fallbackSize ?? Math.max(12, Math.round(size * 0.42));
  const radiusValue = borderRadius ?? Math.round(size / 2);

  return (
    <View style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: radiusValue, backgroundColor }, style]}>
      {uri ? (
        <Image source={{ uri }} style={[styles.image, { borderRadius: radiusValue }, imageStyle]} />
      ) : (
        <Text style={[styles.text, { color: textColor, fontSize: textSize }]}>{initials}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  text: {
    fontWeight: '800',
  },
});