import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useAction, useMutation } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { Alert } from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: { type: string; data?: string };
  isVoice?: boolean;
  timestamp: number;
}

const SUGGESTIONS = [
  { text: '🎙️ Voice booking', msg: 'Kira, help me book a service by voice' },
  { text: '🗓️ Voice reminder', msg: 'Remind me tomorrow at 9 to follow up' },
  { text: '📝 Add a note', msg: 'Add a note for follow-up' },
  { text: '📣 Make an enquiry', msg: 'I want to make an enquiry about a vehicle' },
  { text: '💰 Voice finance', msg: 'Help me apply for finance by voice' },
  { text: '🔧 Book a service', msg: 'I need to book a service' },
  { text: '🚗 Available stock', msg: "What cars are available?" },
  { text: '🆚 Compare cars', msg: 'Help me compare cars' },
  { text: '📋 My bookings', msg: "What bookings do I have?" },
  { text: '🪙 My rewards', msg: 'How many tokens do I have?' },
];

// Language support
const LANGUAGES = [
  { code: 'en-US', label: 'English (US)', flag: '🇺🇸' },
  { code: 'en-GB', label: 'English (UK)', flag: '🇬🇧' },
  { code: 'af-ZA', label: 'Afrikaans', flag: '🇿🇦' },
  { code: 'zu-ZA', label: 'isiZulu', flag: '🇿🇦' },
  { code: 'xh-ZA', label: 'isiXhosa', flag: '🇿🇦' },
  { code: 'st-ZA', label: 'Sesotho', flag: '🇿🇦' },
  { code: 'fr-FR', label: 'Français', flag: '🇫🇷' },
  { code: 'es-ES', label: 'Español', flag: '🇪🇸' },
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'de-DE', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'it-IT', label: 'Italiano', flag: '🇮🇹' },
  { code: 'zh-CN', label: '中文', flag: '🇨🇳' },
  { code: 'ja-JP', label: '日本語', flag: '🇯🇵' },
  { code: 'ko-KR', label: '한국어', flag: '🇰🇷' },
  { code: 'hi-IN', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'ar-SA', label: 'العربية', flag: '🇸🇦' },
  { code: 'sw-KE', label: 'Kiswahili', flag: '🇰🇪' },
  { code: 'ru-RU', label: 'Русский', flag: '🇷🇺' },
];


export default function AIChatScreen({ navigation }: any) {
  const context = useQuery(api.ai.getContext);
  const chatAction = useAction(api.ai.chat);
  const extractVoiceIntent = useAction(api.ai.extractVoiceIntent);
  const memory = useQuery(api.chatMemory.loadMemory);
  const saveExchange = useMutation(api.chatMemory.saveExchange);
  const autoLinkProfile = useMutation(api.customerProfiles.autoLink);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [profileLinked, setProfileLinked] = useState(false);
  const flatListRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const lastTranscriptRef = useRef('');

  const handleVoiceTranscript = async (transcript: string) => {
    const spoken = transcript.trim();
    if (!spoken || !context) return;

    try {
      const intent = await extractVoiceIntent({
        transcript: spoken,
        currentDate: new Date().toISOString().split('T')[0],
        userRole: context.userRole,
      });

      if (intent.intent === 'test_drive' && intent.testDrive) {
        navigation.navigate('TestDriveBooking', { voiceDraft: intent.testDrive, autoSubmit: true });
        return;
      }

      if (intent.intent === 'booking' && intent.booking) {
        navigation.navigate('NewBooking', { voiceDraft: intent.booking, autoSubmit: true });
        return;
      }

      if (intent.intent === 'finance' && intent.finance) {
        navigation.navigate('FinanceApplication', { voiceDraft: intent.finance, autoSubmit: true });
        return;
      }

      if (intent.intent === 'enquiry') {
        navigation.navigate('ContactUs', {
          voiceDraft: intent.enquiry ?? { subject: 'General enquiry', message: spoken },
        });
        return;
      }

      if (intent.intent === 'calendar' && intent.calendar) {
        navigation.navigate('Calendar', { voiceDraft: intent.calendar });
        return;
      }
    } catch {}

    await sendMessage(spoken, true);
  };

  // Auto-link customer profile when context loads
  useEffect(() => {
    if (context && !profileLinked) {
      setProfileLinked(true);
      autoLinkProfile({
        userName: context.userName || undefined,
        userPhone: undefined,
      }).catch(() => {});
    }
  }, [context, profileLinked, autoLinkProfile]);

  // Load previous conversation from memory on mount
  useEffect(() => {
    if (memory && !memoryLoaded && messages.length === 0) {
      setMemoryLoaded(true);
      if (memory.messages.length > 0) {
        const restored = memory.messages.slice(-10).map((m: any, i: number) => ({
          id: `mem-${i}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.timestamp,
        }));
        setMessages(restored);
      }
    }
  }, [memory, memoryLoaded, messages.length]);

  useEffect(() => {
    if (context && memoryLoaded && messages.length === 0) {
      const name = context.userName?.split(' ')[0] || 'there';
      const defaultCar = context.vehicles.find((v: any) => v.isDefault);
      const pending = context.bookings.filter((b: any) => b.status === 'pending' || b.status === 'confirmed');

      let greeting = `Hey ${name}! 👋 Great to see you.\n\n`;
      if (defaultCar) {
        greeting += `How's the ${defaultCar.year} ${defaultCar.make} ${defaultCar.model} treating you? `;
      }
      if (pending.length > 0) {
        greeting += `I'm keeping track of your ${pending.length} active booking${pending.length > 1 ? 's' : ''} — everything's on schedule. `;
      }
      if (!context.vehicles.length) {
        greeting += `I see you're new here — welcome! Let's get your vehicle set up so I can give you personalised advice. `;
      }
      greeting += `\n\nJust type or hit the mic 🎙️ — I'm all ears!`;

      setMessages((prev: Message[]) => [{
        id: 'welcome',
        role: 'assistant',
        content: greeting,
        timestamp: Date.now(),
      }, ...prev.filter(m => m.id !== 'welcome')]);
    }
  }, [context, memoryLoaded, messages.length]);

  useEffect(() => {
    if (listening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [listening, pulseAnim]);

  const speakText = (text: string) => {
    if (!speakEnabled) return;
    try {
      const w = globalThis as any;
      if (w.speechSynthesis) {
        w.speechSynthesis.cancel();
        const clean = text
          .replace(/\*\*/g, '')
          .replace(/💡.*?:/g, '')
          .replace(/[🚗🔧✨👋📅⚡🛞❄️🔍💡🎙️🪙⚖️🎵🏞️🎁🇺🇸🇬🇧🇿🇦🇫🇷🇪🇸🇧🇷🇩🇪🇮🇹🇨🇳🇯🇵🇰🇷🇮🇳🇸🇦🇰🇪🇷🇺]/g, '')
          .replace(/\n+/g, '. ')
          .trim();
        const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
        sentences.forEach((sentence) => {
          const utterance = new (w.SpeechSynthesisUtterance)(sentence.trim());
          utterance.lang = selectedLang.code;
          utterance.rate = 1.05;
          utterance.pitch = 1.0;
          w.speechSynthesis.speak(utterance);
        });
      }
    } catch {}
  };

  const startListening = () => {
    try {
      const w = globalThis as any;
      const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        Alert.alert('Voice input unavailable', 'This browser does not support voice input.');
        return;
      }

      if (w.speechSynthesis) w.speechSynthesis.cancel();

      const recognition = new SpeechRecognition();
      recognition.lang = selectedLang.code;
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 3;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        setListening(true);
        setInterimText('');
        lastTranscriptRef.current = '';
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
        setInterimText(display);
        lastTranscriptRef.current = display;

        if (final) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            recognition.stop();
          }, 1200);
        }

        if (interim) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            recognition.stop();
          }, 2000);
        }
      };

      recognition.onend = () => {
        setListening(false);
        clearTimeout(silenceTimerRef.current);
        const transcript = lastTranscriptRef.current.trim();
        setInterimText('');
        if (transcript) {
          handleVoiceTranscript(transcript);
        }
      };

      recognition.onerror = () => {
        setListening(false);
        setInterimText('');
        clearTimeout(silenceTimerRef.current);
      };

      recognition.start();
    } catch {
      setListening(false);
    }
  };

  const stopListening = () => {
    clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
  };

  const sendMessage = async (text: string, isVoice = false) => {
    if (!text.trim() || loading || !context) {
      if (!context) {
        Alert.alert('Chat unavailable', 'Kira is still loading. Please try again in a moment.');
      }
      return;
    }

    setLoading(true);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      isVoice,
      timestamp: Date.now(),
    };
    setMessages((prev: Message[]) => [...prev, userMsg]);
    setInput('');

    try { (globalThis as any).speechSynthesis?.cancel(); } catch {}

    try {
      const chatHistory = [...messages, userMsg]
        .filter(m => m.id !== 'welcome')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      let memoryContext: string | undefined;
      if (memory && (memory.summary || memory.messages.length > 0)) {
        const parts: string[] = [];
        if (memory.summary) parts.push(memory.summary);
        if (memory.preferences) parts.push(memory.preferences);
        parts.push(`Interactions: ${memory.interactionCount}`);
        const recentMemory = memory.messages.slice(-4);
        if (recentMemory.length > 0) {
          parts.push(recentMemory.map((m: any) => `${m.role}: ${m.content.substring(0, 80)}`).join('\n'));
        }
        memoryContext = parts.join('\n');
      }

      const result = await chatAction({
        messages: chatHistory,
        context: JSON.stringify(context),
        isVoice,
        memoryContext,
      });

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.reply,
        action: result.action ?? undefined,
        timestamp: Date.now(),
      };
      setMessages((prev: Message[]) => [...prev, assistantMsg]);

      if (speakEnabled) {
        speakText(result.reply);
      }

      saveExchange({
        userMessage: text.trim(),
        assistantReply: result.reply,
      }).catch(() => {});
    } catch (error: any) {
      setMessages((prev: Message[]) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I hit a temporary error. Please try again.',
        timestamp: Date.now(),
      }]);
      Alert.alert('Chat error', error?.message || 'Something went wrong while sending your message.');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (action: { type: string; data?: string }) => {
    switch (action.type) {
      case 'book_service':
        navigation.navigate('NewBooking', { autoSubmit: true });
        break;
      case 'test_drive':
        navigation.navigate('TestDriveBooking', { autoSubmit: true });
        break;
      case 'view_stock':
        navigation.navigate('Main', { screen: 'StockTab' });
        break;
      case 'compare_vehicles':
        navigation.navigate('CompareVehicles');
        break;
      case 'view_bookings':
        navigation.navigate('Main', { screen: 'BookingsTab' });
        break;
      case 'finance_apply':
        navigation.navigate('FinanceApplication');
        break;
      case 'make_enquiry':
        navigation.navigate('ContactUs');
        break;
      case 'calendar':
        navigation.navigate('Calendar');
        break;
      default:
        break;
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>K</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
          {item.isVoice && isUser && (
            <View style={styles.voiceBadge}>
              <Ionicons name="mic" size={10} color={colors.white} />
              <Text style={styles.voiceBadgeText}>Voice</Text>
            </View>
          )}
          <Text style={[styles.msgText, isUser && styles.userMsgText]}>{item.content}</Text>
          <View style={styles.msgFooter}>
            <Text style={[styles.msgTime, isUser && styles.userMsgTime]}>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            {!isUser && (
              <TouchableOpacity onPress={() => speakText(item.content)} style={styles.replayBtn}>
                <Ionicons name="volume-medium" size={14} color={colors.textLight} />
              </TouchableOpacity>
            )}
          </View>
          {item.action && item.action.type !== 'none' && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction(item.action!)}>
              <Ionicons
                name={item.action.type === 'book_service' || item.action.type === 'test_drive' ? 'calendar' : item.action.type === 'calendar' ? 'calendar-outline' : item.action.type === 'finance_apply' ? 'document-text' : item.action.type === 'view_stock' ? 'car-sport' : 'list'}
                size={16}
                color={colors.primary}
              />
              <Text style={styles.actionBtnText}>
                {item.action.type === 'book_service' ? 'Book Now' : item.action.type === 'test_drive' ? 'Book Test Drive' : item.action.type === 'calendar' ? 'Open Calendar' : item.action.type === 'finance_apply' ? 'Apply for Finance' : item.action.type === 'view_stock' ? 'Browse Stock' : 'View'}
              </Text>
              <Ionicons name="arrow-forward" size={14} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>K</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>Kira</Text>
              <Text style={styles.headerSub}>{listening ? '🎙️ Listening...' : loading ? '⚡ Thinking...' : `● Online · ${selectedLang.flag}`}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.langToggle} onPress={() => setShowLangPicker(true)}>
            <Text style={{ fontSize: 18 }}>{selectedLang.flag}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.speakToggle, speakEnabled && styles.speakToggleActive]}
            onPress={() => {
              setSpeakEnabled(!speakEnabled);
              if (speakEnabled) {
                try { (globalThis as any).speechSynthesis?.cancel(); } catch {}
              }
            }}
          >
            <Ionicons
              name={speakEnabled ? "volume-high" : "volume-mute"}
              size={18}
              color={speakEnabled ? colors.primary : colors.textLight}
            />
          </TouchableOpacity>
        </View>

        {showLangPicker && (
          <View style={styles.langModal}>
            <View style={styles.langModalContent}>
              <View style={styles.langModalHeader}>
                <Text style={styles.langModalTitle}>Select Language</Text>
                <TouchableOpacity onPress={() => setShowLangPicker(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item: Message) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListHeaderComponent={
              messages.length <= 1 ? (
                <View style={styles.suggestions}>
                  <View style={styles.voiceFlowCard}>
                    <Ionicons name="mic-outline" size={22} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.voiceFlowTitle}>Voice-first KIRA</Text>
                      <Text style={styles.voiceFlowText}>Say a booking, enquiry, finance request, reminder, or note naturally and Kira will route it.</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.calendarQuickChip} onPress={() => navigation.navigate('Calendar')}>
                    <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                    <Text style={styles.calendarQuickChipText}>Open Calendar & Notes</Text>
                  </TouchableOpacity>
                  <View style={styles.micHintBox}>
                    <Ionicons name="mic" size={28} color={colors.primary} />
                    <Text style={styles.micHintText}>Tap the mic below to speak a booking, reminder, note, enquiry, or finance request</Text>
                  </View>
                  <Text style={styles.suggestLabel}>Or try one of these...</Text>
                  <View style={styles.suggestGrid}>
                    {SUGGESTIONS.map((s, i) => (
                      <TouchableOpacity key={i} style={styles.suggestBtn} onPress={() => sendMessage(s.msg)}>
                        <Text style={styles.suggestBtnText}>{s.text}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null
            }
          />

          {loading && (
            <View style={styles.typingRow}>
              <View style={styles.avatar}><Text style={styles.avatarText}>K</Text></View>
              <View style={styles.typingBubble}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.typingText}>Kira is thinking...</Text>
              </View>
            </View>
          )}

          {listening && (
            <View style={styles.listeningBar}>
              <Animated.View style={[styles.listeningPulse, { transform: [{ scale: pulseAnim }] }]}>
                <Ionicons name="mic" size={24} color={colors.white} />
              </Animated.View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listeningTitle}>{interimText ? `"${interimText}"` : 'Listening...'}</Text>
                <Text style={styles.listeningHint}>{interimText ? 'Keep talking or pause to send' : 'Speak naturally, I\'m all ears'}</Text>
              </View>
              <TouchableOpacity onPress={stopListening} style={styles.stopBtn}>
                <Ionicons name="stop-circle" size={28} color={colors.error} />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputRow}>
            <TouchableOpacity
              style={[styles.micBtn, listening && styles.micBtnActive]}
              onPress={listening ? stopListening : startListening}
              disabled={loading}
            >
              <Ionicons name={listening ? "stop" : "mic"} size={24} color={listening ? colors.white : colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask Kira anything..."
              placeholderTextColor={colors.textLight}
              multiline
              maxLength={500}
              onSubmitEditing={() => sendMessage(input)}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={() => sendMessage(input)}
              disabled={!input.trim() || loading}
            >
              <Ionicons name="send" size={20} color={colors.white} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface + 'E6',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    elevation: 2,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.sm,
  },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarText: { color: colors.white, fontWeight: '800', fontSize: 18 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 11, color: colors.success, fontWeight: '500' },
  langToggle: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  speakToggle: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  speakToggleActive: { backgroundColor: colors.primary + '15' },
  body: { flex: 1 },
  messageList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
    gap: 6,
  },
  msgRowUser: { justifyContent: 'flex-end' },
  avatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  bubble: {
    maxWidth: '75%',
    borderRadius: 18,
    padding: spacing.md,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  msgText: { fontSize: 15, lineHeight: 22, color: colors.text },
  userMsgText: { color: colors.white },
  msgFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  msgTime: { fontSize: 10, color: colors.textLight },
  userMsgTime: { color: 'rgba(255,255,255,0.6)' },
  replayBtn: {
    width: 24, height: 24, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  voiceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8, alignSelf: 'flex-start', marginBottom: 4,
  },
  voiceBadgeText: { fontSize: 9, color: colors.white, fontWeight: '600' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: colors.primary + '10',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.white,
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  typingText: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' },
  listeningBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.primary + '08',
    borderTopWidth: 1,
    borderTopColor: colors.primary + '20',
  },
  listeningPulse: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.error,
    justifyContent: 'center', alignItems: 'center',
  },
  listeningTitle: { fontSize: 15, fontWeight: '700', color: colors.primary },
  listeningHint: { fontSize: 12, color: colors.textSecondary },
  stopBtn: { marginLeft: 'auto' },
  stopBtnText: { fontSize: 13, fontWeight: '600', color: colors.error },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface + 'E6',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  micBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primary + '12',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary + '30',
  },
  micBtnActive: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sendBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  suggestions: { marginBottom: spacing.lg, paddingTop: spacing.sm },
  voiceFlowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  voiceFlowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  voiceFlowText: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  micHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary + '08',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary + '15',
  },
  micHintText: {
    fontSize: 15, fontWeight: '600', color: colors.primary, flex: 1,
  },
  suggestLabel: {
    fontSize: 13, fontWeight: '600', color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  suggestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestBtn: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  suggestBtnText: { fontSize: 13, fontWeight: '500', color: colors.text },
  langModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  langModalContent: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.lg,
    width: '90%',
    maxWidth: 300,
  },
  langModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  langModalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    marginBottom: 4,
  },
  langOptionActive: { backgroundColor: colors.primary },
  langFlag: { fontSize: 20, fontWeight: '700', color: colors.text },
  langLabel: { fontSize: 14, color: colors.textSecondary },
  langLabelActive: { color: colors.primary },
  calendarQuickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary + '10',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  calendarQuickChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
});