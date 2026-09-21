import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

const COPILOT_STUDIO_AGENT_URL =
  'https://copilotstudio.microsoft.com/environments/c24b1170-af50-e3e9-886c-8ec71c526644/bots/cr4ce_hyundaikiaservicehubagent_snI0FO/webchat?version=2&enableFileAttachment=false&cliAgent=true';

type LeadStatus = 'New' | 'Contacted' | 'Callback due';

type Lead = {
  id: string;
  name: string;
  dealership: string;
  vehicle: string;
  source: string;
  sourceUrl: string;
  contact: string;
  consentAt: string;
  callbackDate: string;
  status: LeadStatus;
  emailOptIn: boolean;
};

type Source = {
  name: string;
  kind: string;
  detail: string;
  limit: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'blue' | 'green' | 'orange';
};

const sources: Source[] = [
  {
    name: 'Partner dealership forms',
    kind: 'First-party',
    detail: 'Forms shared by contracted Hyundai and Kia dealerships.',
    limit: 'Partner permission required',
    icon: 'handshake-outline',
    tone: 'blue',
  },
  {
    name: 'Public business listings',
    kind: 'Business data',
    detail: 'Business contact details published for dealership enquiries.',
    limit: 'Respect listing terms + rate limits',
    icon: 'business-outline',
    tone: 'green',
  },
  {
    name: 'Approved advertising leads',
    kind: 'Consent-based',
    detail: 'Leads delivered by an ad platform with consent metadata.',
    limit: 'Use platform-approved export/API',
    icon: 'megaphone-outline',
    tone: 'orange',
  },
  {
    name: 'Opt-in enquiry forms',
    kind: 'First-party',
    detail: 'Customer-submitted forms with a clear contact permission.',
    limit: 'Store consent text + timestamp',
    icon: 'document-text-outline',
    tone: 'blue',
  },
  {
    name: 'Permitted APIs',
    kind: 'Integration',
    detail: 'Structured records from providers that allow collection.',
    limit: 'Follow API terms + quotas',
    icon: 'code-slash-outline',
    tone: 'green',
  },
];

const initialLeads: Lead[] = [
  {
    id: 'SA-1048',
    name: 'Thando Mokoena',
    dealership: 'Hyundai Centurion',
    vehicle: 'Tucson Executive',
    source: 'Partner dealership forms',
    sourceUrl: 'https://forms.hyundai.example/centurion',
    contact: 'thando.m@example.com',
    consentAt: '21 Sep 2026, 08:42',
    callbackDate: '22 Sep 2026',
    status: 'New',
    emailOptIn: true,
  },
  {
    id: 'SA-1047',
    name: 'Lerato Naidoo',
    dealership: 'Kia Umhlanga',
    vehicle: 'Sportage',
    source: 'Approved advertising leads',
    sourceUrl: 'https://ads.example/lead/sa-1047',
    contact: '+27 82 555 0191',
    consentAt: '21 Sep 2026, 08:16',
    callbackDate: 'Today',
    status: 'Callback due',
    emailOptIn: false,
  },
  {
    id: 'SA-1046',
    name: 'Mandla Dlamini',
    dealership: 'Hyundai Cape Town',
    vehicle: 'i20 N',
    source: 'Public business listings',
    sourceUrl: 'https://listing.example/hyundai-cape-town',
    contact: 'mandla.d@example.com',
    consentAt: '20 Sep 2026, 15:30',
    callbackDate: '24 Sep 2026',
    status: 'Contacted',
    emailOptIn: true,
  },
];

const today = new Intl.DateTimeFormat('en-ZA', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export default function App() {
  const [leads, setLeads] = useState(initialLeads);
  const [activeFilter, setActiveFilter] = useState<'All' | LeadStatus>('All');
  const [showIntake, setShowIntake] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [dealership, setDealership] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  const [consented, setConsented] = useState(false);
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [notice, setNotice] = useState('');
  const [showAgent, setShowAgent] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const browserNavigator = typeof navigator !== 'undefined' ? navigator : undefined;
    if (browserNavigator && typeof browserNavigator.onLine === 'boolean') {
      setIsOnline(browserNavigator.onLine);
    }
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    if (browserNavigator?.addEventListener) {
      browserNavigator.addEventListener('online', handleOnline);
      browserNavigator.addEventListener('offline', handleOffline);
      return () => {
        browserNavigator.removeEventListener('online', handleOnline);
        browserNavigator.removeEventListener('offline', handleOffline);
      };
    }
    return undefined;
  }, []);

  const filteredLeads = useMemo(
    () => (activeFilter === 'All' ? leads : leads.filter((lead) => lead.status === activeFilter)),
    [activeFilter, leads],
  );

  const addLead = () => {
    if (!name.trim() || !contact.trim() || !vehicle.trim() || !dealership.trim() || !sourceUrl.trim() || !callbackDate.trim()) {
      setNotice('Complete every field before saving the lead.');
      return;
    }
    try {
      const source = new URL(sourceUrl.trim());
      if (!['http:', 'https:'].includes(source.protocol)) throw new Error('Unsupported URL');
    } catch {
      setNotice('Enter a valid HTTPS source URL, for example https://dealer.example/leads.');
      return;
    }
    if (!consented) {
      setNotice('Consent is required before contact details can be stored.');
      return;
    }

    setLeads((current) => [
      {
        id: `SA-${1050 + Math.max(0, ...current.map((lead) => Number(lead.id.replace('SA-', '')) || 0)) - 1049}`,
        name: name.trim(),
        dealership: dealership.trim(),
        vehicle: vehicle.trim(),
        source: 'Partner dealership forms',
        sourceUrl: sourceUrl.trim(),
        contact: contact.trim(),
        consentAt: `${today}, now`,
        callbackDate: callbackDate.trim(),
        status: 'New',
        emailOptIn,
      },
      ...current,
    ]);
    setName('');
    setContact('');
    setVehicle('');
    setDealership('');
    setSourceUrl('');
    setCallbackDate('');
    setConsented(false);
    setEmailOptIn(false);
    setShowIntake(false);
    setNotice('Lead saved with a consent timestamp.');
  };

  const markContacted = (id: string) => {
    setLeads((current) => current.map((lead) => (lead.id === id ? { ...lead, status: 'Contacted' } : lead)));
    setNotice('Lead marked as contacted. No message was sent automatically.');
  };

  const requestEmail = (lead: Lead) => {
    if (!lead.emailOptIn) {
      setNotice('Email is blocked: this lead has not opted in.');
      return;
    }
    setNotice(`Email draft prepared for ${lead.name}. Review before sending.`);
  };

  const scheduleReminder = (lead: Lead) => {
    if (!lead.emailOptIn) {
      setNotice('Calendar reminders are blocked: this lead has not opted in.');
      return;
    }
    setNotice(`Reminder scheduled for ${lead.callbackDate}. Review the invite before sending.`);
  };

  const openSource = async (sourceUrl: string) => {
    try {
      if (!(await Linking.canOpenURL(sourceUrl))) {
        setNotice('This source link is not available on the current device.');
        return;
      }
      await Linking.openURL(sourceUrl);
    } catch {
      setNotice('The source link could not be opened. Check the URL and try again.');
    }
  };

  const openAgent = () => {
    if (!isOnline) {
      setNotice('You are offline. Reconnect before opening the notification assistant.');
      return;
    }
    setAgentError(false);
    setAgentLoading(true);
    setShowAgent(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>SERVICE HUB</Text>
            <Text style={styles.title}>Lead desk</Text>
            <Text style={styles.subtitle}>A consent-first pipeline for South African dealerships.</Text>
          </View>
          <View style={styles.headerBadge} accessibilityLabel={isOnline ? 'Connection online' : 'Connection offline'}>
            <View style={[styles.liveDot, !isOnline && styles.liveDotOffline]} />
            <Text style={styles.headerBadgeText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
          </View>
        </View>

        {!isOnline ? (
          <View style={styles.offlineBanner} accessibilityLiveRegion="polite">
            <Ionicons name="cloud-offline-outline" size={18} color="#FDBA74" />
            <Text style={styles.offlineText}>You’re offline. Saved lead work remains available; connected tools are paused.</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.agentBanner} onPress={openAgent} accessibilityRole="button" accessibilityLabel="Open notification assistant" accessibilityHint="Opens the connected Copilot Studio assistant">
          <View style={styles.agentIcon}>
            <Ionicons name="sparkles-outline" size={20} color="#A5F3FC" />
          </View>
          <View style={styles.agentCopy}>
            <Text style={styles.agentTitle}>Open notification assistant</Text>
            <Text style={styles.agentText}>Use the connected Copilot Studio agent in Microsoft Teams.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#67E8F9" />
        </TouchableOpacity>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>50 leads a day, without the shortcuts.</Text>
            <Text style={styles.heroText}>
              Use documented sources, partner permissions and approved APIs. Every contact stays traceable from source to callback.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setShowIntake(true)} accessibilityRole="button" accessibilityLabel="Add consented lead">
              <Ionicons name="add" size={20} color="#06131F" />
              <Text style={styles.primaryButtonText}>Add consented lead</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.targetBlock}>
            <Text style={styles.targetValue}>{leads.length}</Text>
            <Text style={styles.targetLabel}>in queue</Text>
            <View style={styles.targetRule} />
            <Text style={styles.targetMeta}>Target 50 / day</Text>
          </View>
        </View>

        {notice ? (
          <TouchableOpacity style={styles.notice} onPress={() => setNotice('')} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Ionicons name="information-circle-outline" size={19} color="#67E8F9" />
            <Text style={styles.noticeText}>{notice}</Text>
            <Ionicons name="close" size={18} color="#94A3B8" />
          </TouchableOpacity>
        ) : null}

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Source guardrails</Text>
            <Text style={styles.sectionHint}>Only use collection methods you are authorised to use.</Text>
          </View>
          <View style={styles.securePill}>
            <Ionicons name="shield-checkmark-outline" size={15} color="#86EFAC" />
            <Text style={styles.secureText}>Compliant by default</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sourceRow}>
          {sources.map((source) => (
            <View key={source.name} style={styles.sourceCard}>
              <View style={[
                styles.sourceIcon,
                source.tone === 'blue' ? styles.sourceIconblue : source.tone === 'green' ? styles.sourceIcongreen : styles.sourceIconorange,
              ]}>
                <Ionicons name={source.icon} size={21} color={source.tone === 'blue' ? '#67E8F9' : source.tone === 'green' ? '#86EFAC' : '#FDBA74'} />
              </View>
              <Text style={styles.sourceKind}>{source.kind}</Text>
              <Text style={styles.sourceName}>{source.name}</Text>
              <Text style={styles.sourceDetail}>{source.detail}</Text>
              <View style={styles.limitRow}>
                <Ionicons name="timer-outline" size={14} color="#94A3B8" />
                <Text style={styles.limitText}>{source.limit}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Lead queue</Text>
            <Text style={styles.sectionHint}>Contact details are visible only for consented records.</Text>
          </View>
          <Text style={styles.queueCount}>{filteredLeads.length} records</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(['All', 'New', 'Callback due', 'Contacted'] as const).map((filter) => (
            <TouchableOpacity key={filter} style={[styles.filter, activeFilter === filter && styles.filterActive]} onPress={() => setActiveFilter(filter)} accessibilityRole="button" accessibilityState={{ selected: activeFilter === filter }}>
              <Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]}>{filter}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredLeads.map((lead) => (
          <View key={lead.id} style={styles.leadRow}>
            <View style={styles.leadTop}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{lead.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Text></View>
              <View style={styles.leadIdentity}>
                <Text style={styles.leadName}>{lead.name}</Text>
                <Text style={styles.leadMeta}>{lead.id} · {lead.dealership}</Text>
              </View>
              <Text style={[styles.status, lead.status === 'Callback due' ? styles.statusOrange : lead.status === 'Contacted' ? styles.statusGreen : styles.statusBlue]}>{lead.status}</Text>
            </View>
            <View style={styles.leadDetails}>
              <View><Text style={styles.detailLabel}>INTEREST</Text><Text style={styles.detailValue}>{lead.vehicle}</Text></View>
              <View><Text style={styles.detailLabel}>CALLBACK</Text><Text style={styles.detailValue}>{lead.callbackDate}</Text></View>
              <View>
                <Text style={styles.detailLabel}>SOURCE</Text>
                <Text style={styles.detailValue}>{lead.source}</Text>
                <TouchableOpacity onPress={() => openSource(lead.sourceUrl)} accessibilityRole="link" accessibilityLabel={`Open source for ${lead.name}`}>
                  <Text style={styles.sourceUrl}>{lead.sourceUrl}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.leadActions}>
              <Text style={styles.consentText}><Ionicons name="checkmark-circle" size={15} color="#86EFAC" /> Consent logged {lead.consentAt}</Text>
              <View style={styles.actionButtons}>
                {lead.emailOptIn ? (
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => requestEmail(lead)} accessibilityRole="button" accessibilityLabel={`Draft email for ${lead.name}`}>
                    <Ionicons name="mail-outline" size={16} color="#CBD5E1" /><Text style={styles.secondaryButtonText}>Draft email</Text>
                  </TouchableOpacity>
                ) : null}
                {lead.emailOptIn ? (
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => scheduleReminder(lead)} accessibilityRole="button" accessibilityLabel={`Schedule reminder for ${lead.name}`}>
                    <Ionicons name="calendar-outline" size={16} color="#CBD5E1" /><Text style={styles.secondaryButtonText}>Reminder</Text>
                  </TouchableOpacity>
                ) : null}
                {lead.status !== 'Contacted' ? (
                  <TouchableOpacity style={styles.smallPrimary} onPress={() => markContacted(lead.id)} accessibilityRole="button" accessibilityLabel={`Mark ${lead.name} contacted`}>
                    <Text style={styles.smallPrimaryText}>Mark contacted</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        ))}

        {showIntake ? (
          <View style={styles.intake}>
            <View style={styles.intakeHeader}>
              <View><Text style={styles.intakeTitle}>Capture a consented lead</Text><Text style={styles.intakeHint}>No consent, no contact record.</Text></View>
              <TouchableOpacity onPress={() => setShowIntake(false)} accessibilityRole="button" accessibilityLabel="Close lead form">
                <Ionicons name="close" size={24} color="#CBD5E1" />
              </TouchableOpacity>
            </View>
            {[
              ['Full name', name, setName, 'e.g. Ayanda Khumalo'],
              ['Contact detail', contact, setContact, 'Email or phone number'],
              ['Vehicle interest', vehicle, setVehicle, 'e.g. Kia Seltos'],
              ['Dealership / company', dealership, setDealership, 'Partner dealership'],
              ['Source URL', sourceUrl, setSourceUrl, 'Documented listing, form or API URL'],
              ['Callback date', callbackDate, setCallbackDate, 'e.g. 24 Sep 2026'],
            ].map(([label, value, setter, placeholder]) => (
              <View key={label as string} style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{label as string}</Text>
                <TextInput
                  style={styles.input}
                  value={value as string}
                  onChangeText={setter as (value: string) => void}
                  placeholder={`${placeholder as string}…`}
                  placeholderTextColor="#64748B"
                  accessibilityLabel={label as string}
                  autoCapitalize={label === 'Contact detail' || label === 'Source URL' ? 'none' : 'words'}
                  autoCorrect={label !== 'Contact detail' && label !== 'Source URL'}
                  keyboardType={label === 'Contact detail' ? 'email-address' : label === 'Source URL' ? 'url' : 'default'}
                />
              </View>
            ))}
            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}><Text style={styles.toggleTitle}>Consent to store and contact</Text><Text style={styles.toggleHint}>Required. Record the source URL and timestamp in production.</Text></View>
              <Switch value={consented} onValueChange={setConsented} accessibilityLabel="Consent to store and contact" trackColor={{ false: '#334155', true: '#0E7490' }} thumbColor={consented ? '#67E8F9' : '#CBD5E1'} />
            </View>
            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}><Text style={styles.toggleTitle}>Email opt-in</Text><Text style={styles.toggleHint}>Only opted-in contacts can receive email drafts or reminders.</Text></View>
              <Switch value={emailOptIn} onValueChange={setEmailOptIn} accessibilityLabel="Email opt-in" trackColor={{ false: '#334155', true: '#0E7490' }} thumbColor={emailOptIn ? '#67E8F9' : '#CBD5E1'} />
            </View>
            <TouchableOpacity style={[styles.primaryButton, !consented && styles.primaryButtonDisabled]} onPress={addLead} accessibilityRole="button" accessibilityLabel="Save lead securely">
              <Ionicons name="save-outline" size={18} color="#06131F" /><Text style={styles.primaryButtonText}>Save lead securely</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.footerNote}>
          <Ionicons name="lock-closed-outline" size={15} color="#64748B" />
          <Text style={styles.footerText}>No crawler bypasses. No unsolicited email. Keep source URLs, consent timestamps, retention rules and unsubscribe history with each record.</Text>
        </View>

        <Modal visible={showAgent} animationType="slide" onRequestClose={() => setShowAgent(false)}>
          <SafeAreaView style={styles.agentModal}>
            <View style={styles.agentModalHeader}>
              <View>
                <Text style={styles.agentModalTitle}>Notification assistant</Text>
                <Text style={styles.agentModalHint}>Copilot Studio · Microsoft Teams</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAgent(false)} style={styles.closeAgent} accessibilityRole="button" accessibilityLabel="Close notification assistant">
                <Ionicons name="close" size={24} color="#CBD5E1" />
              </TouchableOpacity>
            </View>
            {agentError ? (
              <View style={styles.agentError}>
                <Ionicons name="cloud-offline-outline" size={34} color="#FDBA74" />
                <Text style={styles.agentErrorTitle}>Assistant unavailable</Text>
                <Text style={styles.agentErrorText}>Check your connection or Microsoft Teams sign-in, then try again.</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={openAgent} accessibilityRole="button" accessibilityLabel="Retry assistant connection">
                  <Text style={styles.primaryButtonText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {!agentError ? <WebView
              source={{ uri: COPILOT_STUDIO_AGENT_URL }}
              startInLoadingState
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              onLoadStart={() => { setAgentLoading(true); setAgentError(false); }}
              onLoadEnd={() => setAgentLoading(false)}
              onError={() => { setAgentLoading(false); setAgentError(true); }}
            /> : null}
            {agentLoading ? (
              <View style={styles.agentLoading} pointerEvents="none">
                <ActivityIndicator size="large" color="#67E8F9" />
                <Text style={styles.agentLoadingText}>Loading assistant…</Text>
              </View>
            ) : null}
          </SafeAreaView>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07111F' },
  container: { padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  brand: { color: '#67E8F9', fontSize: 11, fontWeight: '800', letterSpacing: 2.2, marginBottom: 8 },
  title: { color: '#F8FAFC', fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  subtitle: { color: '#94A3B8', fontSize: 14, marginTop: 6, maxWidth: 275, lineHeight: 20 },
  headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#1E4052', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  liveDotOffline: { backgroundColor: '#FB923C' },
  headerBadgeText: { color: '#86EFAC', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  offlineBanner: { backgroundColor: '#3B291E', borderWidth: 1, borderColor: '#754C2D', borderRadius: 10, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  offlineText: { color: '#FED7AA', flex: 1, fontSize: 12, lineHeight: 17 },
  hero: { backgroundColor: '#0D2433', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1A4355', flexDirection: 'row', marginBottom: 16 },
  heroCopy: { flex: 1, paddingRight: 12 },
  heroTitle: { color: '#F8FAFC', fontSize: 24, fontWeight: '800', lineHeight: 29, letterSpacing: -0.5 },
  heroText: { color: '#B8D0DB', fontSize: 13, lineHeight: 19, marginTop: 9, marginBottom: 17 },
  targetBlock: { width: 86, borderLeftWidth: 1, borderLeftColor: '#28556A', paddingLeft: 15, justifyContent: 'center' },
  targetValue: { color: '#67E8F9', fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  targetLabel: { color: '#CBD5E1', fontSize: 12, marginTop: -4 },
  targetRule: { width: 30, height: 1, backgroundColor: '#3A7186', marginVertical: 12 },
  targetMeta: { color: '#94A3B8', fontSize: 11, lineHeight: 15 },
  primaryButton: { backgroundColor: '#67E8F9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: '#06131F', fontWeight: '800', fontSize: 13 },
  notice: { backgroundColor: '#102A3B', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 18 },
  noticeText: { color: '#CDECF5', flex: 1, fontSize: 12, lineHeight: 17 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10, marginBottom: 13 },
  sectionTitle: { color: '#F8FAFC', fontSize: 19, fontWeight: '800' },
  sectionHint: { color: '#7F94A5', fontSize: 12, marginTop: 4 },
  securePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingBottom: 2 },
  secureText: { color: '#86EFAC', fontSize: 11, fontWeight: '700' },
  sourceRow: { gap: 10, paddingBottom: 10 },
  sourceCard: { width: 205, backgroundColor: '#0D1B2A', borderWidth: 1, borderColor: '#203246', borderRadius: 14, padding: 14 },
  sourceIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  sourceIconblue: { backgroundColor: '#123847' },
  sourceIcongreen: { backgroundColor: '#12352E' },
  sourceIconorange: { backgroundColor: '#3B291E' },
  sourceKind: { color: '#7DD3FC', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  sourceName: { color: '#F8FAFC', fontSize: 14, fontWeight: '800', marginTop: 5 },
  sourceDetail: { color: '#94A3B8', fontSize: 12, lineHeight: 17, marginTop: 7, minHeight: 51 },
  limitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 11 },
  limitText: { color: '#CBD5E1', fontSize: 10, flex: 1, lineHeight: 14 },
  queueCount: { color: '#67E8F9', fontSize: 12, fontWeight: '700' },
  filterRow: { gap: 8, paddingBottom: 12 },
  filter: { borderWidth: 1, borderColor: '#2A3A4D', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
  filterActive: { backgroundColor: '#123847', borderColor: '#2C7285' },
  filterText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#A5F3FC' },
  leadRow: { backgroundColor: '#0D1B2A', borderWidth: 1, borderColor: '#203246', borderRadius: 14, padding: 14, marginBottom: 10 },
  leadTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#214A5B', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#A5F3FC', fontSize: 12, fontWeight: '800' },
  leadIdentity: { flex: 1, marginLeft: 10 },
  leadName: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  leadMeta: { color: '#7F94A5', fontSize: 11, marginTop: 3 },
  status: { fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12 },
  statusBlue: { color: '#7DD3FC', backgroundColor: '#123847' },
  statusOrange: { color: '#FDBA74', backgroundColor: '#3B291E' },
  statusGreen: { color: '#86EFAC', backgroundColor: '#12352E' },
  leadDetails: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1E3042', marginTop: 13, paddingVertical: 11, gap: 10 },
  detailLabel: { color: '#64748B', fontSize: 9, fontWeight: '800', letterSpacing: 0.7, marginBottom: 3 },
  detailValue: { color: '#CBD5E1', fontSize: 11, maxWidth: 110 },
  leadActions: { marginTop: 11 },
  consentText: { color: '#86A2AF', fontSize: 10, flex: 1 },
  actionButtons: { flexDirection: 'row', gap: 8, marginTop: 10, justifyContent: 'flex-end' },
  secondaryButton: { borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  secondaryButtonText: { color: '#CBD5E1', fontSize: 11, fontWeight: '700' },
  smallPrimary: { backgroundColor: '#1B6074', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8, justifyContent: 'center' },
  smallPrimaryText: { color: '#D9FAFF', fontSize: 11, fontWeight: '800' },
  intake: { backgroundColor: '#102334', borderRadius: 16, borderWidth: 1, borderColor: '#2E5C70', padding: 16, marginTop: 10 },
  intakeHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  intakeTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '800' },
  intakeHint: { color: '#86A2AF', fontSize: 12, marginTop: 4 },
  inputGroup: { marginBottom: 11 },
  inputLabel: { color: '#C5D7DE', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  input: { backgroundColor: '#091827', borderWidth: 1, borderColor: '#294154', color: '#F8FAFC', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, fontSize: 13 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#244052', paddingVertical: 12, gap: 12 },
  toggleCopy: { flex: 1 },
  toggleTitle: { color: '#E2F1F4', fontSize: 12, fontWeight: '800' },
  toggleHint: { color: '#7F94A5', fontSize: 10, lineHeight: 14, marginTop: 3 },
  footerNote: { flexDirection: 'row', gap: 7, marginTop: 24, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#1B2A3A' },
  footerText: { color: '#64748B', fontSize: 11, lineHeight: 16, flex: 1 },
  agentBanner: { backgroundColor: '#12283A', borderWidth: 1, borderColor: '#2D6074', borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 20 },
  agentIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#174559', alignItems: 'center', justifyContent: 'center' },
  agentCopy: { flex: 1 },
  agentTitle: { color: '#E0FBFF', fontSize: 13, fontWeight: '800' },
  agentText: { color: '#8FB5C2', fontSize: 11, lineHeight: 15, marginTop: 3 },
  agentModal: { flex: 1, backgroundColor: '#07111F' },
  agentModalHeader: { minHeight: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#203246' },
  agentModalTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '800' },
  agentModalHint: { color: '#7F94A5', fontSize: 11, marginTop: 3 },
  closeAgent: { padding: 6 },
  agentLoading: { ...StyleSheet.absoluteFillObject, top: 64, backgroundColor: '#07111F', alignItems: 'center', justifyContent: 'center', gap: 10 },
  agentLoadingText: { color: '#CBD5E1', fontSize: 13 },
  agentError: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  agentErrorTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '800' },
  agentErrorText: { color: '#94A3B8', fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 8 },
});
