import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';

function goBackOrHome(navigation: any, fallbackRoute = 'Main') {
  if (navigation?.canGoBack?.()) {
    navigation.goBack();
  } else {
    navigation.navigate(fallbackRoute);
  }
}

export default function CarModeScreen({ navigation }: any) {
  const upcoming = useQuery(api.bookings.getUpcoming);
  const latest = useQuery(api.bookings.getLatest);
  const vehicles = useQuery(api.vehicles.list) ?? [];
  const context = useQuery(api.ai.getContext);
  const wallet = useQuery(api.rewards.getWallet);
  const createBooking = useMutation(api.bookings.create);
  const chatAction = useAction(api.ai.chat);

  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [showResponse, setShowResponse] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');
  const silenceTimerRef = useRef<any>(null);

  // Faster pulse animation
  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  // Text-to-speech — faster rate, sentence splitting
  const speak = useCallback((text: string) => {
    try {
      if (Platform.OS !== 'web') return;
      const speechSynthesis = (globalThis as any)?.speechSynthesis;
      const SpeechSynthesisUtteranceCtor = (globalThis as any)?.SpeechSynthesisUtterance;
      if (!speechSynthesis || !SpeechSynthesisUtteranceCtor) return;
      speechSynthesis.cancel();
      const clean = text.replace(/[🚗🔧✨👋📅⚡🛞❄️🔍💡🎙️🪙⚖️🎵🏞️🎁]/g, '').replace(/\*\*/g, '').replace(/\n+/g, '. ').trim();
      const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
      sentences.forEach(sentence => {
        const utterance = new SpeechSynthesisUtteranceCtor(sentence.trim());
        utterance.rate = 1.05;
        utterance.pitch = 1;
        utterance.lang = 'en-US';
        speechSynthesis.speak(utterance);
      });
    } catch {}
  }, []);

  // Process voice/text with AI — optimized
  const processWithAI = useCallback(async (text: string) => {
    if (!context || !text.trim()) return;
    setProcessing(true);
    setAiResponse('');
    setShowResponse(true);

    try {
      if (Platform.OS === 'web') {
        (globalThis as any)?.speechSynthesis?.cancel?.();
      }
    } catch {}

    try {
      const result = await chatAction({
        messages: [{ role: 'user', content: text }],
        context: JSON.stringify(context),
        isVoice: true,
      });

      setAiResponse(result.reply);
      speak(result.reply);

      if (result.action) {
        setTimeout(() => {
          switch (result.action?.type) {
            case 'book_service':
              navigation.navigate('NewBooking');
              break;
            case 'view_stock':
              goBackOrHome(navigation);
              setTimeout(() => navigation.navigate('Main', { screen: 'StockTab' }), 300);
              break;
            case 'view_bookings':
              goBackOrHome(navigation);
              setTimeout(() => navigation.navigate('Main', { screen: 'BookingsTab' }), 300);
              break;
          }
        }, 3000);
      }
    } catch {
      setAiResponse("Sorry, I couldn't process that. Please try again.");
      speak("Sorry, I couldn't process that.");
    }
    setProcessing(false);
  }, [context, chatAction, speak, navigation]);

  // Speech recognition — optimized with interim results and silence detection
  const startListening = useCallback(() => {
    try {
      if (Platform.OS !== 'web') {
        setAiResponse('Voice recognition is only available on web in this mode.');
        setShowResponse(true);
        return;
      }
      const SpeechRecognition = (globalThis as any)?.SpeechRecognition || (globalThis as any)?.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setAiResponse("Voice recognition is not supported in this browser.");
        setShowResponse(true);
        return;
      }

      try { (globalThis as any)?.speechSynthesis?.cancel?.(); } catch {}

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 3;

      recognition.onstart = () => {
        setListening(true);
        setVoiceText('');
        setShowResponse(false);
        transcriptRef.current = '';
        startPulse();
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        const display = final || interim;
        setVoiceText(display);
        transcriptRef.current = display;

        // Auto-stop after silence
        clearTimeout(silenceTimerRef.current);
        if (final) {
          silenceTimerRef.current = setTimeout(() => {
            recognition.stop();
          }, 1200);
        } else {
          silenceTimerRef.current = setTimeout(() => {
            recognition.stop();
          }, 2000);
        }
      };

      recognition.onend = () => {
        setListening(false);
        stopPulse();
        clearTimeout(silenceTimerRef.current);
        const finalText = transcriptRef.current.trim();
        if (finalText) {
          processWithAI(finalText);
        }
      };

      recognition.onerror = (event: any) => {
        setListening(false);
        stopPulse();
        clearTimeout(silenceTimerRef.current);
        if (event.error === 'no-speech') {
          setAiResponse("I didn't hear anything. Tap the mic and speak.");
          setShowResponse(true);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setAiResponse("Voice recognition is not available.");
      setShowResponse(true);
    }
  }, [startPulse, stopPulse, processWithAI]);

  const stopListening = useCallback(() => {
    clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const handleRepeatLast = async () => {
    if (!latest) {
      setAiResponse("You don't have any previous bookings to repeat.");
      setShowResponse(true);
      speak("You don't have any previous bookings to repeat.");
      return;
    }
    const defaultVehicle = vehicles.find((v: any) => v.isDefault);
    if (!defaultVehicle) {
      setAiResponse("Please add a vehicle first from the home screen.");
      setShowResponse(true);
      speak("Please add a vehicle first.");
      return;
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
    const date = tomorrow.toISOString().split('T')[0];

    try {
      await createBooking({
        vehicleId: defaultVehicle._id,
        serviceType: latest.serviceType,
        date,
        timeSlot: latest.timeSlot,
      });
      const msg = `Done! ${latest.serviceType} booked for ${date} at ${latest.timeSlot}.`;
      setAiResponse(msg);
      setShowResponse(true);
      speak(msg);
    } catch {
      setAiResponse("Failed to create booking. Please try from the home screen.");
      setShowResponse(true);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => goBackOrHome(navigation)} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color={colors.carText} />
          </TouchableOpacity>
          <View style={styles.headerBrand}>
            <Ionicons name="car-sport" size={22} color={colors.carAccent} />
            <Text style={styles.headerTitle}>CAR MODE</Text>
            {wallet && (
              <TouchableOpacity onPress={() => navigation.navigate('Rewards')} style={{ marginLeft: 8 }}>
                <Text style={{ color: '#8B5CF6', fontSize: 12, fontWeight: '700' }}>
                  {wallet.balance} {wallet.tokenType}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('AIChat')}
            style={styles.chatBtn}
          >
            <Ionicons name="chatbubble-ellipses" size={20} color={colors.carAccent} />
          </TouchableOpacity>
        </View>

        {/* Voice Command Area */}
        <View style={styles.voiceArea}>
          {showResponse && aiResponse ? (
            <View style={styles.responseBubble}>
              <Ionicons name="sparkles" size={18} color={colors.carAccent} style={{ marginBottom: 8 }} />
              <Text style={styles.responseText}>{aiResponse}</Text>
              <TouchableOpacity
                style={styles.dismissBtn}
                onPress={() => { setShowResponse(false); setAiResponse(''); }}
              >
                <Text style={styles.dismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.voiceHint}>
                {listening ? 'Listening...' : processing ? 'Processing...' : 'Tap the mic or use quick actions'}
              </Text>
              {voiceText ? (
                <Text style={styles.transcriptText}>"{voiceText}"</Text>
              ) : null}
            </>
          )}

          {/* Microphone Button */}
          <Animated.View style={[styles.micOuter, { transform: [{ scale: pulseAnim }] }]}>
            <TouchableOpacity
              style={[styles.micBtn, listening && styles.micBtnActive]}
              onPress={listening ? stopListening : startListening}
              activeOpacity={0.7}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator size="large" color={colors.carText} />
              ) : (
                <Ionicons
                  name={listening ? 'mic' : 'mic-outline'}
                  size={48}
                  color={listening ? colors.error : colors.carText}
                />
              )}
            </TouchableOpacity>
          </Animated.View>

          <Text style={styles.voiceLabel}>
            {listening ? '"Book my car service"' : 'Voice Command'}
          </Text>
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('NewBooking')}
          >
            <Ionicons name="add-circle" size={32} color={colors.carAccent} />
            <Text style={styles.actionText}>Book{'\n'}Service</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleRepeatLast}
          >
            <Ionicons name="repeat" size={32} color={colors.statusConfirmed} />
            <Text style={styles.actionText}>Repeat{'\n'}Last</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              if (upcoming) {
                const msg = `Your next service is ${upcoming.serviceType} on ${upcoming.date} at ${upcoming.timeSlot}. Status: ${upcoming.status}.`;
                setAiResponse(msg);
                setShowResponse(true);
                speak(msg);
              } else {
                const msg = "You have no upcoming bookings.";
                setAiResponse(msg);
                setShowResponse(true);
                speak(msg);
              }
            }}
          >
            <Ionicons name="calendar" size={32} color={colors.statusPending} />
            <Text style={styles.actionText}>View{'\n'}Upcoming</Text>
          </TouchableOpacity>
        </View>

        {/* Status bar */}
        <View style={styles.bottomStatus}>
          {upcoming ? (
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: colors.statusConfirmed }]} />
              <Text style={styles.statusText}>
                Next: {upcoming.serviceType} on {upcoming.date}
              </Text>
            </View>
          ) : (
            <Text style={styles.noUpcoming}>No upcoming services</Text>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.carSurface,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.carBorder,
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerTitle: {
    fontSize: 16, fontWeight: '800',
    color: colors.carText, letterSpacing: 2,
  },
  chatBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.carSurface,
    justifyContent: 'center', alignItems: 'center',
  },
  // Voice area
  voiceArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  voiceHint: {
    fontSize: 16, color: 'rgba(255,255,255,0.5)',
    textAlign: 'center', marginBottom: spacing.xl,
  },
  transcriptText: {
    fontSize: 18, color: colors.carAccent,
    fontStyle: 'italic', textAlign: 'center',
    marginBottom: spacing.lg,
  },
  responseBubble: {
    backgroundColor: colors.carSurface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.carBorder,
    alignItems: 'center',
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  responseText: {
    fontSize: 16, color: colors.carText,
    textAlign: 'center', lineHeight: 24,
  },
  dismissBtn: { marginTop: spacing.lg },
  dismissText: { fontSize: 14, color: colors.carAccent, fontWeight: '600' },
  micOuter: { marginBottom: spacing.lg },
  micBtn: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.carSurface,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: colors.carBorder,
  },
  micBtnActive: {
    backgroundColor: '#1a0a0a',
    borderColor: colors.error,
  },
  voiceLabel: {
    fontSize: 14, color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
  // Buttons
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  actionBtn: {
    backgroundColor: colors.carSurface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    width: 100,
    borderWidth: 1,
    borderColor: colors.carBorder,
  },
  actionText: {
    fontSize: 12, fontWeight: '700',
    color: colors.carText,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 16,
  },
  bottomStatus: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  noUpcoming: { fontSize: 14, color: 'rgba(255,255,255,0.4)' },
});