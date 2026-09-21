import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAction, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, radius, spacing } from '../lib/theme';
import {
  AudioSession,
  LiveKitRoom,
  RoomAudioRenderer,
  registerGlobals,
  useLocalParticipant,
  useRoomContext,
} from '@livekit/react-native';

if (Platform.OS !== 'web') {
  try {
    registerGlobals();
  } catch {}
}

function buildRoomName(currentUserId: string, peerId?: string, bookingId?: string, partsOrderId?: string) {
  if (bookingId) return `booking-${bookingId}`;
  if (partsOrderId) return `parts-${partsOrderId}`;
  const ids = [currentUserId, peerId].filter(Boolean).map(String).sort();
  return `direct-${ids.join('-') || 'room'}`;
}

function CallBody({ navigation, peerName, contextTitle, contextSubtitle }: { navigation: any; peerName?: string; contextTitle?: string; contextSubtitle?: string; }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [micEnabled, setMicEnabled] = useState(true);
  const [micBusy, setMicBusy] = useState(false);

  const connectedCount = room?.remoteParticipants ? room.remoteParticipants.size : 0;

  const toggleMic = async () => {
    try {
      setMicBusy(true);
      const next = !micEnabled;
      await localParticipant.setMicrophoneEnabled(next);
      setMicEnabled(next);
    } catch (error: any) {
      Alert.alert('Microphone', error?.message ?? 'Unable to update microphone state.');
    } finally {
      setMicBusy(false);
    }
  };

  const endCall = async () => {
    try {
      await room?.disconnect();
    } catch {}
    navigation.goBack();
  };

  return (
    <View style={styles.callRoot}>
      <RoomAudioRenderer />
      <View style={styles.headerCard}>
        <View style={styles.avatarWrap}>
          <Ionicons name="call" size={30} color={colors.primary} />
        </View>
        <Text style={styles.title}>{peerName || 'Live call'}</Text>
        {contextTitle ? <Text style={styles.subtitle}>{contextTitle}</Text> : null}
        {contextSubtitle ? <Text style={styles.meta}>{contextSubtitle}</Text> : null}
        <Text style={styles.status}>{connectedCount > 0 ? `${connectedCount} other participant(s) connected` : 'Waiting for the other side to join...'}</Text>
      </View>

      <View style={styles.controlRow}>
        <TouchableOpacity style={[styles.controlBtn, micEnabled && styles.controlBtnActive]} onPress={() => void toggleMic()} disabled={micBusy}>
          {micBusy ? (
            <ActivityIndicator size="small" color={micEnabled ? colors.white : colors.primary} />
          ) : (
            <Ionicons name={micEnabled ? 'mic' : 'mic-off'} size={22} color={micEnabled ? colors.white : colors.primary} />
          )}
          <Text style={[styles.controlText, micEnabled && styles.controlTextActive]}>{micEnabled ? 'Mute' : 'Unmute'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.controlBtn, styles.endBtn]} onPress={() => void endCall()}>
          <Ionicons name="call" size={22} color={colors.white} />
          <Text style={styles.endText}>End</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function LiveCallScreen({ route, navigation }: any) {
  const user = useQuery(api.users.me);
  const getCallToken = useAction(api.livekit.getCallToken);
  const {
    peerId,
    peerName,
    bookingId,
    partsOrderId,
    contextTitle,
    contextSubtitle,
  } = route.params ?? {};

  const currentUserId = String(user?._id ?? '');
  const participantName = String(user?.displayName ?? user?.name ?? user?.email ?? 'User').trim();
  const roomName = useMemo(
    () => buildRoomName(currentUserId, peerId, bookingId, partsOrderId),
    [bookingId, currentUserId, partsOrderId, peerId]
  );

  const [tokenState, setTokenState] = useState<{ token: string; url: string; roomName: string; participantName: string } | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user) return;
      setLoadingToken(true);
      setError('');
      try {
        const result = await getCallToken({
          roomName,
          participantName,
        });
        if (!active) return;
        setTokenState(result);
      } catch (err: any) {
        if (!active) return;
        setError(String(err?.message ?? err));
      } finally {
        if (active) setLoadingToken(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [getCallToken, participantName, roomName, user]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let mounted = true;
    (async () => {
      try {
        await AudioSession.startAudioSession();
      } catch {}
    })();
    return () => {
      mounted = false;
      try {
        AudioSession.stopAudioSession();
      } catch {}
    };
  }, []);

  if (!user || loadingToken || !tokenState) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{error ? error : 'Preparing call...'}</Text>
          {error ? (
            <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.retryText}>Go back</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <LiveKitRoom
        serverUrl={tokenState.url}
        token={tokenState.token}
        connect
        audio
        video={false}
      >
        <CallBody navigation={navigation} peerName={peerName} contextTitle={contextTitle} contextSubtitle={contextSubtitle} />
      </LiveKitRoom>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  retryText: { color: colors.white, fontWeight: '800' },
  callRoot: { flex: 1, padding: spacing.lg, gap: spacing.lg, justifyContent: 'center' },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  avatarWrap: {
    width: 70,
    height: 70,
    borderRadius: 24,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 14, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  meta: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  status: { marginTop: 8, fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  controlRow: { flexDirection: 'row', gap: spacing.md },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  controlBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  endBtn: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  controlText: { fontSize: 14, fontWeight: '900', color: colors.primary },
  controlTextActive: { color: colors.white },
  endText: { fontSize: 14, fontWeight: '900', color: colors.white },
});
