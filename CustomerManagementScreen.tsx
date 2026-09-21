import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ScrollView,
  Linking,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Share,
  Pressable,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useAction, usePaginatedQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import {
  getInviteShareUrl,
  getShareMessage,
  type ShareContext,
} from '../lib/shareUtils';
import UserAvatar from '../lib/UserAvatar';

const WHATSAPP_BUSINESS = '27615276436';

function formatPhoneForWhatsApp(phone: string): string {
  let clean = phone.replace(/[\s\-()]/g, '');
  if (clean.startsWith('0')) {
    clean = '27' + clean.substring(1);
  }
  if (!clean.startsWith('+') && !clean.startsWith('27')) {
    clean = '27' + clean;
  }
  return clean.replace('+', '');
}

type CustomerProfile = {
  _id: string;
  firstName: string;
  surname: string;
  fullName: string;
  phone: string;
  homePhone?: string;
  workPhone?: string;
  contactEmail?: string;
  whatsappNumber?: string;
  companyName?: string;
  companyVehicles?: string;
  vehicleDescription: string;
  registrationDate?: string;
  tradeInInterest?: string;
  referralNotes?: string;
  applicationNotes?: string;
  notesSummary?: string;
  linkedUserId?: string;
  profileImage?: string;
  displayName?: string;
  isActive: boolean;
  sourceLabel?: 'restored' | 'imported';
};

// --- MESSAGE TEMPLATES ---
const MESSAGE_TEMPLATES = [
  {
    id: 'welcome',
    label: 'KiRA Welcome',
    icon: 'sparkles-outline',
    color: '#FF6B35',
    generate: (c: CustomerProfile) =>
      `Hi ${c.firstName}! 👋 This is KiRA, your personal AI assistant at Hyundai. I'm here to help you with everything related to your ${c.vehicleDescription} — from booking services to exploring trade-in options, browsing new stock, and even helping with finance applications.\n\nI already know your car and can give you personalised recommendations. Think of me as your smart dealership companion, available 24/7!\n\nFor the best experience, download our *Hyundai Service Connect* app. You'll be able to:\n✅ Book services in seconds\n✅ Chat with me (KiRA) anytime\n✅ Browse available stock\n✅ Track your bookings\n✅ Get trade-in valuations\n✅ Apply for vehicle finance\n\nWelcome to the Hyundai family! Reply anytime — I'm always here. 🚗`,
  },
  {
    id: 'install_guide',
    label: 'App Install Guide',
    icon: 'download-outline',
    color: '#0EA5E9',
    generate: (c: CustomerProfile) =>
      `Hi ${c.firstName}! Here's how to install the *Hyundai Service Connect* app:\n\n📱 *For Android:*\n1. Open Google Play Store\n2. Search "Hyundai Service Connect"\n3. Tap "Install"\n4. Open the app and sign in with your Google or Apple account\n5. Add your ${c.vehicleDescription} to your profile\n\n🍎 *For iPhone:*\n1. Open the App Store\n2. Search "Hyundai Service Connect"\n3. Tap "Get" to download\n4. Open the app and sign in\n5. Add your vehicle details\n\n💡 *Once installed:*\n• Tap "Chat with KiRA" to talk to me — your AI assistant\n• Go to "Book Service" for quick appointments\n• Browse "Stock" to see available cars\n• Check "Profile" to manage your vehicle\n\nNeed help? Just reply here and I'll walk you through it! 😊`,
  },
  {
    id: 'service_reminder',
    label: 'Service Reminder',
    icon: 'construct-outline',
    color: colors.primary,
    generate: (c: CustomerProfile) =>
      `Hi ${c.firstName}, this is a friendly reminder from Hyundai Service. Your ${c.vehicleDescription} may be due for a service. Book your next appointment through our app or reply here. We look forward to seeing you!`,
  },
  {
    id: 'trade_in',
    label: 'Trade-In Offer',
    icon: 'swap-horizontal-outline',
    color: '#8B5CF6',
    generate: (c: CustomerProfile) =>
      `Hi ${c.firstName}, we have exciting trade-in offers available for your ${c.vehicleDescription}. Upgrade to a newer model with great deals. Would you like to know more? Reply or visit us at the dealership.`,
  },
  {
    id: 'invite',
    label: 'App Invite',
    icon: 'phone-portrait-outline',
    // --- Changed line ---
    // color: colors.accent,
    color: colors.accent,
    generate: (c: CustomerProfile) => {
      const dealershipName = c.companyName?.trim() || 'your dealership';
      // Modified the message to match the specified change
      return `${c.firstName} • ${dealershipName}\n${getInviteShareUrl()}`;
    },
  },
  {
    id: 'followup',
    label: 'Follow Up',
    icon: 'chatbubble-outline',
    color: '#10B981',
    generate: (c: CustomerProfile) =>
      `Hi ${c.firstName}, just following up on your ${c.vehicleDescription}. ${c.applicationNotes ? `Re: ${c.applicationNotes}. ` : ''}Is there anything we can help you with? Feel free to reach out anytime.`,
  },
  {
    id: 'custom',
    label: 'Custom Message',
    icon: 'create-outline',
    color: colors.textSecondary,
    generate: (_c: CustomerProfile) => '',
  },
];

export default function CustomerManagementScreen({ navigation }: any) {
  const me = useQuery(api.users.me);
  const customersPage = usePaginatedQuery(api.customerProfiles.listPaged, {}, { initialNumItems: 30 });
  const referralData = useQuery(api.referrals.getMyCode);
  const messageHistoryQuery = useQuery(api.customerProfiles.getWhatsappHistory, {});
  const usersQuery = useQuery(api.users.listAll);
  const myUploadsQuery = useQuery(api.customerProfiles.listMyUploads);
  const customerCountQuery = useQuery(api.customerProfiles.countAccessible);
  const customers = useMemo(() => customersPage.results ?? [], [customersPage.results]);
  const users = useMemo(() => usersQuery ?? [], [usersQuery]);
  const myUploads = useMemo(() => myUploadsQuery ?? [], [myUploadsQuery]);
  const messageHistory = useMemo(() => messageHistoryQuery ?? [], [messageHistoryQuery]);
  const addCustomer = useMutation(api.customerProfiles.addOne);
  const removeCustomer = useMutation(api.customerProfiles.remove);
  const logMessage = useMutation(api.customerProfiles.logWhatsappMessage);
  const extractPdfTextFromBase64 = useAction(api.customerProfilesPdf.extractPdfTextFromBase64);
  const addCustomerNote = useMutation(api.sales.addNote);
  const updateCustomerNote = useMutation(api.sales.updateNote);
  const deleteCustomerNote = useMutation(api.sales.deleteNote);
  const addCustomerReminder = useMutation(api.sales.addReminder);
  const repairLegacyOwnership = useMutation(api.customerProfiles.repairLegacyOwnership);
  const didRepairLegacyOwnership = useRef(false);

  useEffect(() => {
    const email = String(me?.email ?? '').trim().toLowerCase();
    const canRepair = email === 'vincentmm@hyundai.co.za' || email === 'mbulelo111@gmail.com';
    if (!canRepair || didRepairLegacyOwnership.current) return;
    if (customersPage.status === 'LoadingFirstPage' || myUploadsQuery === undefined) return;

    didRepairLegacyOwnership.current = true;
    repairLegacyOwnership().catch(() => {
      didRepairLegacyOwnership.current = false;
    });
  }, [me?.email, customersPage.status, myUploadsQuery, repairLegacyOwnership]);

  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [messageType, setMessageType] = useState('custom');
  const [activeSection, setActiveSection] = useState<'customers' | 'companies'>('customers');
  const [showNotes, setShowNotes] = useState(false);
  const [selectedNotesCustomer, setSelectedNotesCustomer] = useState<CustomerProfile | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<{ _id: string; body: string } | null>(null);

  // Add form
  const [addForm, setAddForm] = useState({
    firstName: '',
    surname: '',
    phone: '',
    vehicleDescription: '',
    registrationDate: '',
    contactEmail: '',
    whatsappNumber: '',
    companyName: '',
    companyVehicles: '',
  });

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<Array<{
    firstName: string; surname: string; phone: string;
    vehicleDescription: string; registrationDate?: string;
    homePhone?: string; workPhone?: string;
    tradeInInterest?: string; applicationNotes?: string; referralNotes?: string;
  }>>([]);
  const [importFileName, setImportFileName] = useState('');
  const seedProfiles = useMutation(api.customerProfiles.seed);

  // CSV Parser
  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headerLine = lines[0];
    const headers = headerLine.split(',').map(h => h.trim().toLowerCase());

    // Map common header names
    const findCol = (keywords: string[]) =>
      headers.findIndex(h => keywords.some(k => h.includes(k)));
    const descIdx = findCol(['description', 'vehicle', 'car', 'model']);
    const regIdx = findCol(['reg', 'date', 'registration']);
    const firstIdx = findCol(['first', 'firstname']);
    const surIdx = findCol(['sur', 'last', 'surname', 'lastname']);
    const mobIdx = findCol(['mobile', 'cell', 'phone']);
    const homeIdx = findCol(['home']);
    const workIdx = findCol(['work']);
    const appIdx = findCol(['application', 'app']);
    const tradeIdx = findCol(['trade']);
    const refIdx = findCol(['ref']);

    const results: typeof importPreview = [];
    for (let i = 1; i < lines.length; i++) {
      // Handle CSV with commas inside quotes
      const row: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const ch of lines[i]) {
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ',' && !inQuotes) { row.push(current.trim()); current = ''; }
        else { current += ch; }
      }
      row.push(current.trim());

      const firstName = (firstIdx >= 0 ? row[firstIdx] : '')?.trim();
      const surname = (surIdx >= 0 ? row[surIdx] : '')?.trim();
      const phone = (mobIdx >= 0 ? row[mobIdx] : '')?.replace(/[\s\-()]/g, '');
      const vehicle = (descIdx >= 0 ? row[descIdx] : '')?.trim();

      if (!firstName || !surname || !phone) continue;

      results.push({
        firstName,
        surname,
        phone,
        vehicleDescription: vehicle || 'Unknown',
        registrationDate: regIdx >= 0 ? row[regIdx]?.trim() : undefined,
        homePhone: homeIdx >= 0 ? row[homeIdx]?.replace(/[\s\-()]/g, '') : undefined,
        workPhone: workIdx >= 0 ? row[workIdx]?.replace(/[\s\-()]/g, '') : undefined,
        applicationNotes: appIdx >= 0 ? row[appIdx]?.trim() : undefined,
        tradeInInterest: tradeIdx >= 0 ? row[tradeIdx]?.trim() : undefined,
        referralNotes: refIdx >= 0 ? row[refIdx]?.trim() : undefined,
      });
    }
    return results;
  };

  // Parse PDF via LLM
  const parsePDFWithAI = async (text: string) => {
    try {
      const response = await globalThis.fetch('https://api.a0.dev/ai/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'Extract customer data from this document. Return a JSON array of objects with: firstName, surname, phone, vehicleDescription, registrationDate (optional), homePhone (optional), workPhone (optional), tradeInInterest (optional), applicationNotes (optional). Only return the JSON array, nothing else.',
            },
            { role: 'user', content: text },
          ],
          schema: {
            type: 'object',
            properties: {
              customers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    firstName: { type: 'string' },
                    surname: { type: 'string' },
                    phone: { type: 'string' },
                    vehicleDescription: { type: 'string' },
                    registrationDate: { type: 'string' },
                    homePhone: { type: 'string' },
                    workPhone: { type: 'string' },
                    tradeInInterest: { type: 'string' },
                    applicationNotes: { type: 'string' },
                  },
                  required: ['firstName', 'surname', 'phone'],
                },
              },
            },
            required: ['customers'],
          },
        }),
      });
      const data = await response.json();
      if (data.schema_data?.customers) {
        return data.schema_data.customers.map((c: any) => ({
          ...c,
          vehicleDescription: c.vehicleDescription || 'Unknown',
          phone: c.phone?.replace(/[\s\-()]/g, '') || '',
        })).filter((c: any) => c.firstName && c.surname && c.phone);
      }
      return [];
    } catch {
      return [];
    }
  };

  // File Import Handler
  const handleImportFile = async () => {
    try {
      setImportLoading(true);

      let assetName = 'Customer Details PDF';
      let pdfBase64 = '';

      if (Platform.OS === 'web') {
        const file = await new Promise<any>((resolve) => {
          const input = (globalThis as any).document?.createElement('input');
          if (!input) {
            resolve(null);
            return;
          }
          input.type = 'file';
          input.accept = 'application/pdf';
          input.onchange = () => {
            const selected = input.files?.[0] ?? null;
            resolve(selected);
          };
          input.click();
        });

        if (!file) {
          setImportLoading(false);
          return;
        }

        assetName = file.name || assetName;
        pdfBase64 = await new Promise<string>((resolve, reject) => {
          const ReaderClass = (globalThis as any).FileReader;
          const reader = new ReaderClass();
          reader.onload = () => {
            const result = String(reader.result ?? '');
            resolve(result.split(',')[1] || '');
          };
          reader.onerror = () => reject(new Error('Failed to read PDF file'));
          reader.readAsDataURL(file);
        });
      } else {
        const DocumentPicker: any = await import('expo-document-picker');
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/pdf',
          copyToCacheDirectory: true,
          multiple: false,
        });

        if (result.canceled || !result.assets?.length) {
          return;
        }

        const asset = result.assets[0];
        assetName = asset.name ?? assetName;
        const FileSystem: any = await import('expo-file-system');
        pdfBase64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      setImportFileName(assetName);
      const extractedText = await extractPdfTextFromBase64({ pdfBase64 });
      const parsedCustomers = await parsePDFWithAI(extractedText);

      if (!parsedCustomers.length) {
        Alert.alert('No customers found', 'The PDF was loaded, but no customer records could be extracted.');
        return;
      }

      setImportPreview(parsedCustomers);
      setShowImport(true);
    } catch (e: any) {
      Alert.alert('Import Error', e?.message || 'Failed to import the PDF');
    } finally {
      setImportLoading(false);
    }
  };

  // Confirm Import
  const handleConfirmImport = async () => {
    if (importPreview.length === 0) return;
    setImportLoading(true);
    try {
      const count = await seedProfiles({ profiles: importPreview });
      Alert.alert(
        'Import Complete',
        `Successfully imported ${count} new customer${count !== 1 ? 's' : ''}.\n${importPreview.length - count} were duplicates or skipped.`,
        [{ text: 'OK' }]
      );
      setShowImport(false);
      setImportPreview([]);
      setImportFileName('');
    } catch (e: any) {
      Alert.alert('Import Error', e?.message || 'Failed to import customers');
    } finally {
      setImportLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const customerList = Array.isArray(customers) ? customers : [];
    if (!search.trim()) return customerList;
    const q = search.toLowerCase();
    return customerList.filter((c: CustomerProfile) =>
      c.fullName.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.vehicleDescription.toLowerCase().includes(q)
    );
  }, [customers, search]);

  const stats = useMemo(() => ({
    total: customerCountQuery ?? (Array.isArray(customers) ? customers.length : 0),
    withTradeIn: (Array.isArray(customers) ? customers : []).filter((c: CustomerProfile) => c.tradeInInterest).length,
    withNotes: (Array.isArray(customers) ? customers : []).filter((c: CustomerProfile) => c.applicationNotes).length,
    messagesSent: Array.isArray(messageHistory) ? messageHistory.length : 0,
  }), [customerCountQuery, customers, messageHistory]);

  const inviteLink = getInviteShareUrl(referralData?.code ?? '');
  const inviteMessage = getShareMessage({ type: 'invite', referralCode: referralData?.code ?? '' } as ShareContext, referralData?.code ?? '');

  const openWhatsApp = useCallback(async (customer: CustomerProfile, message: string, type: string) => {
    const phone = formatPhoneForWhatsApp(customer.phone);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    try {
      await logMessage({
        customerId: customer._id,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        message,
        messageType: type,
      });
    } catch (e) {
      // Log failed, still open WhatsApp
    }

    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      // Fallback to web WhatsApp
      await Linking.openURL(`https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`);
    }
  }, [logMessage]);

  const openEmail = useCallback(async (email?: string, subject?: string, body?: string) => {
    if (!email) {
      Alert.alert('No email', 'This contact does not have an email address saved yet.');
      return;
    }
    const url = `mailto:${encodeURIComponent(email)}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}${body ? `${subject ? '&' : '?'}body=${encodeURIComponent(body)}` : ''}`;
    await Linking.openURL(url);
  }, []);

  const openWhatsapp = useCallback(async (phone?: string, message?: string) => {
    const raw = (phone ?? '').replace(/[\s\-()]/g, '');
    if (!raw) {
      Alert.alert('No WhatsApp number', 'This contact does not have a WhatsApp number saved yet.');
      return;
    }
    const normalized = raw.startsWith('0') ? `27${raw.substring(1)}` : raw.startsWith('27') ? raw : `27${raw}`;
    const url = `https://wa.me/${normalized}?text=${encodeURIComponent(message ?? inviteMessage)}`;
    await Linking.openURL(url);
  }, [inviteMessage]);

  const openAppChat = useCallback((customer: CustomerProfile) => {
    if (!customer.linkedUserId) {
      Alert.alert('Invite first', 'This contact is not linked to an app account yet. Send them an invite link first.');
      return;
    }
    navigation.navigate('StaffChat', {
      customerId: customer.linkedUserId,
      customerName: customer.fullName,
      chatType: 'customer',
    });
  }, [navigation]);

  const shareInvite = useCallback(async (customer: CustomerProfile) => {
    const subject = `Join Hyundai/Kia Service Connect`;
    const message = `${inviteMessage}\n\nFor: ${customer.fullName}`;
    if (Platform.OS === 'web') {
      const clipboard = (globalThis as any)?.navigator?.clipboard;
      if (clipboard?.writeText) {
        await clipboard.writeText(`${inviteLink}\n\n${message}`);
        Alert.alert('Copied', 'Invite link copied to clipboard.');
        return;
      }
    }
    await Share.share({ title: subject, message: `${message}\n${inviteLink}` });
  }, [inviteLink, inviteMessage]);

  const handleQuickMessage = (customer: CustomerProfile, template: (typeof MESSAGE_TEMPLATES)[number]) => {
    setSelectedCustomer(customer);
    setMessageType(template.id);
    const msg = template.generate(customer);
    if (template.id === 'custom') {
      setMessageText('');
      setShowMessage(true);
    } else {
      setMessageText(msg);
      setShowMessage(true);
    }
  };

  const openCustomerActions = (customer: CustomerProfile) => {
    Alert.alert(customer.fullName, 'Choose a contact action', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'App Chat', onPress: () => openAppChat(customer) },
      { text: 'WhatsApp', onPress: () => openWhatsapp(customer.whatsappNumber ?? customer.phone, `${customer.fullName} — ${customer.vehicleDescription}`) },
      { text: 'Email', onPress: () => openEmail(customer.contactEmail, `${customer.fullName} · Hyundai/Kia Service Connect`, inviteMessage) },
      { text: 'Invite Link', onPress: () => shareInvite(customer) },
      { text: 'Call Notes', onPress: () => {
        setSelectedNotesCustomer(customer);
        setNoteText('');
        setEditingNote(null);
        setShowNotes(true);
      } },
    ]);
  };

  const handleSaveNote = async () => {
    if (!selectedNotesCustomer || !noteText.trim() || savingNote) return;
    setSavingNote(true);
    try {
      if (editingNote) {
        await updateCustomerNote({
          noteId: editingNote._id as any,
          body: noteText.trim(),
        });
      } else {
        await addCustomerNote({
          customerId: selectedNotesCustomer._id as any,
          body: noteText.trim(),
        });
      }
      setNoteText('');
      setEditingNote(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save note');
    } finally {
      setSavingNote(false);
    }
  };

  const handleEditNote = (note: { _id: string; body: string }) => {
    setEditingNote(note);
    setNoteText(note.body);
  };

  const handleDeleteNote = (note: { _id: string; body: string }) => {
    Alert.alert('Delete note', 'Remove this note permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomerNote({ noteId: note._id as any });
            if (editingNote?._id === note._id) {
              setEditingNote(null);
              setNoteText('');
            }
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to delete note');
          }
        },
      },
    ]);
  };

  const handleCancelEditNote = () => {
    setEditingNote(null);
    setNoteText('');
  };

  const openFollowUpReminderForCustomer = () => {
    if (!selectedNotesCustomer) return;
    void addCustomerReminder({
      customerId: selectedNotesCustomer._id as any,
      title: `Follow-up with ${selectedNotesCustomer.fullName}`,
      dueAt: Date.now() + 24 * 60 * 60 * 1000,
      notes: noteText.trim() || selectedNotesCustomer.notesSummary || `Follow up after call with ${selectedNotesCustomer.fullName}`,
    }).catch((error: any) => {
      Alert.alert('Reminder', error?.message || 'Failed to save reminder');
    });
    setShowNotes(false);
  };

  const handleSendMessage = () => {
    if (!selectedCustomer || !messageText.trim()) return;
    openWhatsApp(selectedCustomer, messageText.trim(), messageType);
    setShowMessage(false);
    setMessageText('');
    setSelectedCustomer(null);
  };

  const handleDelete = (customer: CustomerProfile) => {
    Alert.alert(
      'Delete Customer',
      `Remove ${customer.fullName} from the database? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeCustomer({ profileId: customer._id });
            } catch (e) {
              Alert.alert('Error', 'Failed to delete customer');
            }
          },
        },
      ]
    );
  };

  const handleAdd = async () => {
    if (!addForm.firstName.trim() || !addForm.surname.trim() || !addForm.phone.trim() || !addForm.vehicleDescription.trim()) {
      Alert.alert('Missing Info', 'First name, surname, phone, and vehicle are required.');
      return;
    }
    try {
      const savedId = await addCustomer({
        firstName: addForm.firstName.trim(),
        surname: addForm.surname.trim(),
        phone: addForm.phone.replace(/\s+/g, ''),
        contactEmail: addForm.contactEmail.trim() || undefined,
        whatsappNumber: addForm.whatsappNumber.trim() || undefined,
        companyName: addForm.companyName.trim() || undefined,
        companyVehicles: addForm.companyVehicles.trim() || undefined,
        vehicleDescription: addForm.vehicleDescription.trim(),
        registrationDate: addForm.registrationDate.trim() || undefined,
      });

      const savedCustomer: CustomerProfile = {
        _id: savedId,
        firstName: addForm.firstName.trim(),
        surname: addForm.surname.trim(),
        fullName: `${addForm.firstName.trim()} ${addForm.surname.trim()}`,
        phone: addForm.phone.replace(/\s+/g, ''),
        homePhone: undefined,
        workPhone: undefined,
        contactEmail: addForm.contactEmail.trim() || undefined,
        whatsappNumber: addForm.whatsappNumber.trim() || undefined,
        companyName: addForm.companyName.trim() || undefined,
        companyVehicles: addForm.companyVehicles.trim() || undefined,
        vehicleDescription: addForm.vehicleDescription.trim(),
        registrationDate: addForm.registrationDate.trim() || undefined,
        tradeInInterest: undefined,
        referralNotes: undefined,
        applicationNotes: undefined,
        linkedUserId: undefined,
        profileImage: undefined,
        displayName: undefined,
        isActive: true,
      };

      const inviteTemplate = MESSAGE_TEMPLATES.find((t) => t.id === 'invite');
      const inviteText = inviteTemplate?.generate(savedCustomer) ?? inviteMessage;
      await openWhatsApp(savedCustomer, inviteText, 'invite');
      setShowAdd(false);
      setAddForm({ firstName: '', surname: '', phone: '', vehicleDescription: '', registrationDate: '', contactEmail: '', whatsappNumber: '', companyName: '', companyVehicles: '' });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to add customer');
    }
  };

  const openBusinessWhatsApp = () => {
    Linking.openURL(`https://wa.me/c/${WHATSAPP_BUSINESS}`);
  };

  const openKira = () => {
    navigation.navigate('AIChat');
  };

  const customersWithContacts = useMemo(() => {
    return customers.map((customer: CustomerProfile) => {
      const linkedUser = users.find((user: any) => String(user._id) === String(customer.linkedUserId));
      return {
        ...customer,
        profileImage: linkedUser?.profileImage ?? linkedUser?.image,
        displayName: linkedUser?.displayName ?? linkedUser?.name,
        contactEmail: customer.contactEmail ?? linkedUser?.email,
        whatsappNumber: customer.whatsappNumber ?? customer.phone ?? linkedUser?.phone,
      };
    });
  }, [customers, users]);

  const myUploadsWithContacts = useMemo(() => {
    return myUploads.map((customer: CustomerProfile) => {
      const linkedUser = users.find((user: any) => String(user._id) === String(customer.linkedUserId));
      return {
        ...customer,
        profileImage: linkedUser?.profileImage ?? linkedUser?.image,
        displayName: linkedUser?.displayName ?? linkedUser?.name,
        contactEmail: customer.contactEmail ?? linkedUser?.email,
        whatsappNumber: customer.whatsappNumber ?? customer.phone ?? linkedUser?.phone,
      };
    });
  }, [myUploads, users]);

  const selectedNotes = useQuery(
    api.sales.listNotes,
    selectedNotesCustomer ? { customerId: selectedNotesCustomer._id as any } : 'skip'
  ) ?? [];

  const visibleCustomers = useMemo(() => {
    const byId = new Map<string, CustomerProfile>();
    for (const customer of customersWithContacts) {
      byId.set(customer._id, customer);
    }
    return [...byId.values()];
  }, [customersWithContacts]);

  const companyCards = useMemo(() => {
    const grouped = new Map<string, { name: string; cars: Set<string>; customers: CustomerProfile[] }>();
    for (const customer of customersWithContacts) {
      const companyName = (customer.companyName ?? '').trim();
      if (!companyName) continue;
      const existing = grouped.get(companyName) ?? { name: companyName, cars: new Set<string>(), customers: [] as CustomerProfile[] };
      existing.customers.push(customer);
      const fleetText = [customer.companyVehicles, customer.vehicleDescription].filter(Boolean).join(' · ');
      if (fleetText) existing.cars.add(fleetText);
      grouped.set(companyName, existing);
    }
    return [...grouped.values()].sort((a, b) => b.customers.length - a.customers.length || a.name.localeCompare(b.name));
  }, [customersWithContacts]);

  const renderCustomer = ({ item }: { item: CustomerProfile }) => {
    const isExpanded = expandedId === item._id;
    const displayCompany = item.companyName?.trim();

    return (
      <Pressable
        style={({ hovered, pressed }: any) => [
          styles.customerCard,
          isExpanded && styles.cardExpanded,
          hovered && styles.cardHovered,
          pressed && styles.cardPressed,
        ]}
        onPress={() => setExpandedId(isExpanded ? null : item._id)}
      >
        <View style={styles.cardHeader}>
          <UserAvatar uri={item.profileImage} name={item.fullName} size={44} backgroundColor={colors.primary + '15'} textColor={colors.primary} />
          <View style={styles.cardInfo}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardName}>{item.fullName}</Text>
              {displayCompany ? (
                <View style={styles.companyPill}>
                  <Ionicons name="business-outline" size={11} color={colors.primary} />
                  <Text style={styles.companyPillText}>{displayCompany}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.cardVehicle}>{item.vehicleDescription}</Text>
            <Text style={styles.cardPhone}>{item.phone}</Text>
            <View style={styles.cardMetaRow}>
              {item.contactEmail ? <Text style={styles.metaPill}>Email {item.contactEmail}</Text> : null}
              {item.whatsappNumber ? <Text style={styles.metaPill}>WA {item.whatsappNumber}</Text> : null}
              {item.registrationDate ? <Text style={styles.metaPill}>Reg {item.registrationDate}</Text> : null}
              {item.sourceLabel === 'restored' || item.sourceLabel === 'imported' ? (
                <View style={styles.sourcePill}>
                  <Ionicons name="cloud-download-outline" size={10} color={colors.primary} />
                  <Text style={styles.sourcePillText}>{item.sourceLabel}</Text>
                </View>
              ) : null}
              {!item.isActive ? (
                <View style={styles.inactivePill}>
                  <Ionicons name="eye-off-outline" size={10} color={colors.textSecondary} />
                  <Text style={styles.inactivePillText}>inactive</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={(e: any) => { e.stopPropagation(); openWhatsapp(item.whatsappNumber ?? item.phone, `${item.fullName} — ${item.vehicleDescription}`); }}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={(e: any) => { e.stopPropagation(); openCustomerActions(item); }}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.expandedSection}>
            {item.companyVehicles ? (
              <View style={styles.detailPanel}>
                <Text style={styles.detailLabel}>Company vehicles</Text>
                <Text style={styles.detailValue}>{item.companyVehicles}</Text>
              </View>
            ) : null}
            {item.applicationNotes ? (
              <View style={styles.detailPanel}>
                <Text style={styles.detailLabel}>Application notes</Text>
                <Text style={styles.detailValue}>{item.applicationNotes}</Text>
              </View>
            ) : null}
            {item.notesSummary ? (
              <View style={styles.detailPanel}>
                <Text style={styles.detailLabel}>Last conversation</Text>
                <Text style={styles.detailValue}>{item.notesSummary}</Text>
              </View>
            ) : null}
            {item.referralNotes ? (
              <View style={styles.detailPanel}>
                <Text style={styles.detailLabel}>Referral notes</Text>
                <Text style={styles.detailValue}>{item.referralNotes}</Text>
              </View>
            ) : null}
            {item.tradeInInterest ? (
              <View style={styles.detailPanel}>
                <Text style={styles.detailLabel}>Trade-in interest</Text>
                <Text style={[styles.detailValue, { color: '#8B5CF6' }]}>{item.tradeInInterest}</Text>
              </View>
            ) : null}

            <View style={styles.quickActionRow}>
              <TouchableOpacity style={styles.quickAction} onPress={() => openWhatsapp(item.whatsappNumber ?? item.phone, `${item.fullName} — ${item.vehicleDescription}`)}>
                <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                <Text style={styles.quickActionText}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickAction} onPress={() => openEmail(item.contactEmail, `${item.fullName} · Hyundai/Kia Service Connect`, inviteMessage)}>
                <Ionicons name="mail-outline" size={16} color={colors.primary} />
                <Text style={styles.quickActionText}>Email</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickAction} onPress={() => openAppChat(item)}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
                <Text style={styles.quickActionText}>App Chat</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickAction} onPress={() => {
                setSelectedNotesCustomer(item);
                setNoteText('');
                setShowNotes(true);
              }}>
                <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                <Text style={styles.quickActionText}>Call Notes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickAction} onPress={() => shareInvite(item)}>
                <Ionicons name="link-outline" size={16} color={colors.primary} />
                <Text style={styles.quickActionText}>Invite Link</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.quickLabel}>Quick WhatsApp Message</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templateScroll}>
              {MESSAGE_TEMPLATES.map((t: { id: string; label: string; icon: string; color: string; generate: (c: CustomerProfile) => string; }) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.templateBtn, { borderColor: t.color + '40' }]}
                  onPress={() => handleQuickMessage(item, t as any)}
                >
                  <Ionicons name={t.icon as any} size={16} color={t.color} />
                  <Text style={[styles.templateLabel, { color: t.color }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={styles.deleteText}>Remove Customer</Text>
            </TouchableOpacity>
          </View>
        )}
      </Pressable>
    );
  };

  if (customersPage.status === 'LoadingFirstPage') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <View style={styles.loadingCard}>
          <View style={styles.loadingLine} />
          <View style={[styles.loadingLine, { width: '70%', marginTop: 10 }]} />
          <View style={[styles.loadingLine, { width: '90%', marginTop: 18, height: 84, borderRadius: 18 }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Customers</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={openKira} style={styles.headerBtn}>
              <Ionicons name="sparkles" size={20} color="#FF6B35" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleImportFile} style={styles.headerBtn} disabled={importLoading}>
              {importLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.headerBtn}>
              <Ionicons name="time-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={openBusinessWhatsApp} style={styles.headerBtn}>
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.addBtn}>
              <Ionicons name="add" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionTabs}>
          {(['customers', 'companies', 'uploads'] as const).map((section) => (
            <TouchableOpacity key={section} style={[styles.sectionTab, activeSection === section && styles.sectionTabActive]} onPress={() => setActiveSection(section)}>
              <Text style={[styles.sectionTabText, activeSection === section && styles.sectionTabTextActive]}>
                {section === 'customers' ? 'Customers' : section === 'companies' ? 'Companies' : 'My Uploads'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.total}</Text>
            <Text style={styles.statLabel}>Customers</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#8B5CF6' }]}>{stats.withTradeIn}</Text>
            <Text style={styles.statLabel}>Trade-In</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: colors.accent }]}>{stats.withNotes}</Text>
            <Text style={styles.statLabel}>With Notes</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#25D366' }]}>{stats.messagesSent}</Text>
            <Text style={styles.statLabel}>Messages</Text>
          </View>
        </View>

        <View style={styles.companyStrip}>
          <Text style={styles.companyStripTitle}>Companies</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.companyStripScroll}>
            {companyCards.length === 0 ? (
              <View style={styles.companyEmptyChip}><Text style={styles.companyEmptyChipText}>No companies added yet</Text></View>
            ) : companyCards.map((company: { name: string; cars: Set<string>; customers: CustomerProfile[] }) => (
              <View key={company.name} style={styles.companyCard}>
                <Text style={styles.companyCardName}>{company.name}</Text>
                <Text style={styles.companyCardMeta}>{company.customers.length} contact{company.customers.length === 1 ? '' : 's'}</Text>
                <Text style={styles.companyCardMeta} numberOfLines={2}>{Array.from(company.cars).join(' • ') || 'Fleet details pending'}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textLight} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search name, phone, vehicle, or company..."
              placeholderTextColor={colors.textLight}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={colors.textLight} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Customer List */}
        {activeSection === 'customers' ? (
          <FlatList
            data={filtered}
            keyExtractor={(item: CustomerProfile) => item._id}
            renderItem={renderCustomer}
            contentContainerStyle={styles.listContent}
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              if (customersPage.status === 'CanLoadMore') {
                customersPage.loadMore(30);
              }
            }}
            ListFooterComponent={customersPage.status === 'LoadingMore' ? (
              <View style={styles.loadingFooter}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={colors.textLight} />
                <Text style={styles.emptyText}>
                  {search ? 'No customers match your search' : 'No customers yet'}
                </Text>
              </View>
            }
          />
        ) : activeSection === 'companies' ? (
          <ScrollView contentContainerStyle={styles.listContent}>
            {companyCards.map((company: { name: string; cars: Set<string>; customers: CustomerProfile[] }) => (
              <View key={company.name} style={styles.companyDetailCard}>
                <Text style={styles.companyDetailName}>{company.name}</Text>
                <Text style={styles.companyDetailMeta}>{company.customers.length} customers on file</Text>
                <Text style={styles.companyDetailVehicles}>{Array.from(company.cars).join('\n')}</Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <FlatList
            data={myUploadsWithContacts}
            keyExtractor={(item: CustomerProfile) => item._id}
            renderItem={renderCustomer}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="cloud-upload-outline" size={48} color={colors.textLight} />
                <Text style={styles.emptyText}>No contacts uploaded by you yet</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>

      {/* --- ADD CUSTOMER MODAL --- */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Customer</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.fieldLabel}>First Name *</Text>
              <TextInput
                style={styles.input}
                value={addForm.firstName}
                onChangeText={(t: string) => setAddForm((p: { firstName: string; surname: string; phone: string; vehicleDescription: string; registrationDate: string; contactEmail: string; whatsappNumber: string; companyName: string; companyVehicles: string; }) => ({ ...p, firstName: t }))}
                placeholder="Enter first name"
                placeholderTextColor={colors.textLight}
              />
              <Text style={styles.fieldLabel}>Surname *</Text>
              <TextInput
                style={styles.input}
                value={addForm.surname}
                onChangeText={(t: string) => setAddForm((p: { firstName: string; surname: string; phone: string; vehicleDescription: string; registrationDate: string; contactEmail: string; whatsappNumber: string; companyName: string; companyVehicles: string; }) => ({ ...p, surname: t }))}
                placeholder="Enter surname"
                placeholderTextColor={colors.textLight}
              />
              <Text style={styles.fieldLabel}>Phone *</Text>
              <TextInput
                style={styles.input}
                value={addForm.phone}
                onChangeText={(t: string) => setAddForm((p: { firstName: string; surname: string; phone: string; vehicleDescription: string; registrationDate: string; contactEmail: string; whatsappNumber: string; companyName: string; companyVehicles: string; }) => ({ ...p, phone: t }))}
                placeholder="e.g. 0781234567"
                placeholderTextColor={colors.textLight}
                keyboardType="phone-pad"
              />
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={addForm.contactEmail}
                onChangeText={(t: string) => setAddForm((p: any) => ({ ...p, contactEmail: t }))}
                placeholder="e.g. client@company.com"
                placeholderTextColor={colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Text style={styles.fieldLabel}>WhatsApp Number</Text>
              <TextInput
                style={styles.input}
                value={addForm.whatsappNumber}
                onChangeText={(t: string) => setAddForm((p: any) => ({ ...p, whatsappNumber: t }))}
                placeholder="e.g. 0781234567"
                placeholderTextColor={colors.textLight}
                keyboardType="phone-pad"
              />
              <Text style={styles.fieldLabel}>Company Name</Text>
              <TextInput
                style={styles.input}
                value={addForm.companyName}
                onChangeText={(t: string) => setAddForm((p: any) => ({ ...p, companyName: t }))}
                placeholder="e.g. Fleet Services Pty Ltd"
                placeholderTextColor={colors.textLight}
              />
              <Text style={styles.fieldLabel}>Company Cars / Fleet</Text>
              <TextInput
                style={styles.input}
                value={addForm.companyVehicles}
                onChangeText={(t: string) => setAddForm((p: any) => ({ ...p, companyVehicles: t }))}
                placeholder="e.g. 3x Hyundai Tucson, 2x Creta"
                placeholderTextColor={colors.textLight}
                multiline
              />
              <Text style={styles.fieldLabel}>Vehicle *</Text>
              <TextInput
                style={styles.input}
                value={addForm.vehicleDescription}
                onChangeText={(t: string) => setAddForm((p: { firstName: string; surname: string; phone: string; vehicleDescription: string; registrationDate: string; contactEmail: string; whatsappNumber: string; companyName: string; companyVehicles: string; }) => ({ ...p, vehicleDescription: t }))}
                placeholder="e.g. TUCSON 2.0 PREMIUM"
                placeholderTextColor={colors.textLight}
              />
              <Text style={styles.fieldLabel}>Registration Date</Text>
              <TextInput
                style={styles.input}
                value={addForm.registrationDate}
                onChangeText={(t: string) => setAddForm((p: { firstName: string; surname: string; phone: string; vehicleDescription: string; registrationDate: string; contactEmail: string; whatsappNumber: string; companyName: string; companyVehicles: string; }) => ({ ...p, registrationDate: t }))}
                placeholder="e.g. 15/03/2023"
                placeholderTextColor={colors.textLight}
              />
              <TouchableOpacity style={styles.submitBtn} onPress={handleAdd}>
                <Ionicons name="person-add" size={18} color={colors.white} />
                <Text style={styles.submitText}>Add Customer</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- MESSAGE COMPOSE MODAL --- */}
      <Modal visible={showMessage} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>WhatsApp Message</Text>
                {selectedCustomer && (
                  <Text style={styles.modalSubtitle}>To: {selectedCustomer.fullName}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => { setShowMessage(false); setSelectedCustomer(null); }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Template buttons */}
            {selectedCustomer && (
              <View style={styles.templateGrid}>
                {MESSAGE_TEMPLATES.filter((t: { id: string }) => t.id !== 'custom').map((t: { id: string; label: string; icon: string; color: string; generate: (c: CustomerProfile) => string; }) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.templateGridBtn,
                      messageType === t.id && { borderColor: t.color, backgroundColor: t.color + '10' },
                    ]}
                    onPress={() => {
                      setMessageType(t.id);
                      setMessageText(t.generate(selectedCustomer));
                    }}
                  >
                    <Ionicons name={t.icon as any} size={16} color={t.color} />
                    <Text style={[styles.templateGridLabel, messageType === t.id && { color: t.color }]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabel}>Message</Text>
            <TextInput
              style={[styles.input, styles.messageInput]}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Type your message..."
              placeholderTextColor={colors.textLight}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.sendBtn, !messageText.trim() && { opacity: 0.5 }]}
              onPress={handleSendMessage}
              disabled={!messageText.trim()}
            >
              <Ionicons name="logo-whatsapp" size={20} color={colors.white} />
              <Text style={styles.sendText}>Open in WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- NOTES MODAL --- */}
      <Modal visible={showNotes} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Call Notes</Text>
                {selectedNotesCustomer && (
                  <Text style={styles.modalSubtitle}>Customer: {selectedNotesCustomer.fullName}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => { setShowNotes(false); setSelectedNotesCustomer(null); setNoteText(''); }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ paddingBottom: 8 }}>
              {selectedNotes.length > 0 ? selectedNotes.map((note: any) => (
                <View key={note._id} style={styles.noteItem}>
                  <View style={styles.noteRowTop}>
                    <Text style={styles.noteBody}>{note.body}</Text>
                    <View style={styles.noteActionRow}>
                      <TouchableOpacity style={styles.noteActionBtn} onPress={() => handleEditNote(note)}>
                        <Ionicons name="pencil-outline" size={14} color={colors.primary} />
                        <Text style={styles.noteActionText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.noteActionBtn} onPress={() => handleDeleteNote(note)}>
                        <Ionicons name="trash-outline" size={14} color={colors.error} />
                        <Text style={[styles.noteActionText, { color: colors.error }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.noteMeta}>{new Date(note.createdAt).toLocaleString()}</Text>
                </View>
              )) : (
                <View style={styles.emptyState}>
                  <Ionicons name="document-text-outline" size={40} color={colors.textLight} />
                  <Text style={styles.emptyText}>No call notes yet</Text>
                </View>
              )}
            </ScrollView>

            <Text style={styles.fieldLabel}>Add note from the last call</Text>
            <TextInput
              style={[styles.input, styles.messageInput]}
              value={noteText}
              onChangeText={setNoteText}
              placeholder={editingNote ? 'Update this note...' : 'What was the last conversation about?'}
              placeholderTextColor={colors.textLight}
              multiline
              textAlignVertical="top"
            />

            {editingNote ? (
              <TouchableOpacity style={styles.cancelEditBtn} onPress={handleCancelEditNote}>
                <Text style={styles.cancelEditText}>Cancel edit</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.sendBtn, (!noteText.trim() || savingNote) && { opacity: 0.5 }]}
              onPress={handleSaveNote}
              disabled={!noteText.trim() || savingNote}
            >
              {savingNote ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="save-outline" size={20} color={colors.white} />
              )}
              <Text style={styles.sendText}>{editingNote ? 'Update Note' : 'Save Note'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.photoSecondaryBtn, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '24' }]}
              onPress={openFollowUpReminderForCustomer}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={[styles.photoSecondaryText, { color: colors.primary }]}>Create follow-up reminder</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- MESSAGE HISTORY MODAL --- */}
      <Modal visible={showHistory} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Message History</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={messageHistory}
              keyExtractor={(item: { _id: string }) => item._id}
              renderItem={({ item }: { item: { _id: string; customerName: string; customerPhone: string; message: string; messageType: string; sentAt: number; } }) => (
                <View style={styles.historyItem}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyName}>{item.customerName}</Text>
                    <Text style={styles.historyTime}>
                      {new Date(item.sentAt).toLocaleDateString()} {new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={styles.historyTypeBadge}>
                    <Text style={styles.historyType}>{item.messageType.replace('_', ' ')}</Text>
                  </View>
                  <Text style={styles.historyMsg} numberOfLines={2}>{item.message}</Text>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="chatbubble-outline" size={40} color={colors.textLight} />
                  <Text style={styles.emptyText}>No messages sent yet</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* --- IMPORT PREVIEW MODAL --- */}
      <Modal visible={showImport} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Import Preview</Text>
                <Text style={styles.modalSubtitle}>
                  {importFileName} — {importPreview.length} customer{importPreview.length !== 1 ? 's' : ''} found
                </Text>
              </View>
              <TouchableOpacity onPress={() => { setShowImport(false); setImportPreview([]); }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={importPreview}
              keyExtractor={(_item: any, idx: number) => `import-${idx}`}
              renderItem={({ item: p, index }: { item: { firstName: string; surname: string; phone: string; vehicleDescription: string; registrationDate?: string; homePhone?: string; workPhone?: string; tradeInInterest?: string; applicationNotes?: string; referralNotes?: string; }; index: number }) => (
                <View style={styles.importRow}>
                  <View style={styles.importRowNum}>
                    <Text style={styles.importRowNumText}>{index + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.importName}>{p.firstName} {p.surname}</Text>
                    <Text style={styles.importDetail}>{p.phone} — {p.vehicleDescription}</Text>
                    {p.registrationDate && (
                      <Text style={styles.importDetail}>Reg: {p.registrationDate}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setImportPreview((prev: Array<{
                        firstName: string; surname: string; phone: string; vehicleDescription: string; registrationDate?: string;
                        homePhone?: string; workPhone?: string; tradeInInterest?: string; applicationNotes?: string; referralNotes?: string;
                      }>) => prev.filter((_, i: number) => i !== index));
                    }}
                  >
                    <Ionicons name="close-circle" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
              )}
              style={{ maxHeight: 400 }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>All entries removed</Text>
                </View>
              }
            />

            <View style={styles.importActions}>
              <TouchableOpacity
                style={styles.importCancelBtn}
                onPress={() => { setShowImport(false); setImportPreview([]); }}
              >
                <Text style={styles.importCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.importConfirmBtn, importPreview.length === 0 && { opacity: 0.5 }]}
                onPress={handleConfirmImport}
                disabled={importPreview.length === 0 || importLoading}
              >
                {importLoading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={18} color={colors.white} />
                    <Text style={styles.importConfirmText}>
                      Import {importPreview.length} Customer{importPreview.length !== 1 ? 's' : ''}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  backBtn: { marginRight: spacing.md },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.text },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  sectionTab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  sectionTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sectionTabText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  sectionTabTextActive: { color: colors.white },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  statNum: { fontSize: 20, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  searchRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  customerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardHovered: { transform: [{ translateY: -1 }] },
  cardPressed: { transform: [{ scale: 0.99 }] },
  cardExpanded: { borderColor: colors.primary + '40' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  cardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardAvatarImage: { width: '100%', height: '100%' },
  cardAvatarText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  cardInfo: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardName: { fontSize: 15, fontWeight: '800', color: colors.text },
  cardVehicle: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  cardPhone: { fontSize: 12, color: colors.textLight, marginTop: 1 },
  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  metaPill: {
    fontSize: 11,
    color: colors.textSecondary,
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  companyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary + '12',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  companyPillText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary + '12',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  sourcePillText: { fontSize: 10, fontWeight: '800', color: colors.primary, textTransform: 'uppercase' },
  inactivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  inactivePillText: { fontSize: 10, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase' },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  quickActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  quickActionText: { fontSize: 12, fontWeight: '700', color: colors.text },
  expandedSection: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
  },
  detailPanel: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  detailLabel: { fontSize: 13, color: colors.textSecondary },
  detailValue: { fontSize: 13, fontWeight: '500', color: colors.text, maxWidth: '60%', textAlign: 'right' },
  quickLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  templateScroll: { marginBottom: spacing.md },
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginRight: spacing.sm,
    backgroundColor: colors.surface,
  },
  templateLabel: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.error + '08',
    borderWidth: 1,
    borderColor: colors.error + '20',
  },
  deleteText: { fontSize: 13, fontWeight: '500', color: colors.error },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: colors.textLight, marginTop: spacing.md },

  // Modals
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '85%',
    paddingHorizontal: spacing.xl,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: colors.borderLight,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  modalSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  messageInput: { height: 120, textAlignVertical: 'top' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    marginTop: spacing.xl,
  },
  submitText: { fontSize: 16, fontWeight: '700', color: colors.white },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#25D366',
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
  },
  sendText: { fontSize: 16, fontWeight: '700', color: colors.white },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  templateGridBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  templateGridLabel: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },

  // History
  historyItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyName: { fontSize: 14, fontWeight: '600', color: colors.text },
  historyTime: { fontSize: 11, color: colors.textLight },
  historyTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '10',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
  },
  historyType: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.primary,
    textTransform: 'capitalize',
  },
  historyMsg: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  noteItem: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  noteRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  noteBody: { fontSize: 13, color: colors.text, lineHeight: 18 },
  noteActionRow: { flexDirection: 'row', gap: spacing.xs },
  noteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  noteActionText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  noteMeta: { fontSize: 11, color: colors.textLight, marginTop: 6 },
  cancelEditBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cancelEditText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },

  // Import
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  importRowNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  importRowNumText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  importName: { fontSize: 14, fontWeight: '600', color: colors.text },
  importDetail: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  importActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  importCancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  importCancelText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  importConfirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  importConfirmText: { fontSize: 15, fontWeight: '600', color: colors.white },
  companyStrip: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  companyStripTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  companyStripScroll: { gap: spacing.sm },
  companyEmptyChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  companyEmptyChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  companyCard: { width: 220, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  companyCardName: { fontSize: 14, fontWeight: '800', color: colors.text },
  companyCardMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
  companyDetailCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, marginBottom: spacing.md, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  companyDetailName: { fontSize: 16, fontWeight: '800', color: colors.text },
  companyDetailMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  companyDetailVehicles: { fontSize: 12, color: colors.text, marginTop: 10, lineHeight: 18 },
  loadingCard: { width: '84%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight },
  loadingLine: { width: '100%', height: 16, borderRadius: 999, backgroundColor: colors.borderLight, opacity: 0.55 },
  loadingFooter: { paddingVertical: spacing.lg, alignItems: 'center' },
  photoSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
  },
  photoSecondaryText: { fontSize: 16, fontWeight: '700', color: colors.text },
});
