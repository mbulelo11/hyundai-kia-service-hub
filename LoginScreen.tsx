import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { a0 } from 'a0-sdk';
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { PUBLIC_CONTACT_URL, PUBLIC_LANDING_URL, PUBLIC_PRIVACY_URL, PUBLIC_TERMS_URL } from '../lib/shareUtils';

const STAFF_DOMAINS = ['hyundai', 'kia', 'hyundaisa', 'kiasa', 'hyundaimotor', 'kiamotor'];

function isValidStaffEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const domainBase = domain.split('.')[0];
  return STAFF_DOMAINS.some((d) => domainBase === d || domain.includes(d));
}

type LoginMode = 'customer' | 'staff';

export default function LoginScreen() {
  const [mode, setMode] = useState<LoginMode>('customer');
  const [customerFlow, setCustomerFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [staffFlow, setStaffFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [selectedDealershipId, setSelectedDealershipId] = useState('');
  const [selectedStaffUserId, setSelectedStaffUserId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuthActions();
  const setMyDealership = useMutation(api.users.setMyDealership);
  const setAssignedStaff = useMutation(api.users.setAssignedStaff);
  const staffSignupDealerships = useQuery(api.dealerships.listSignupOptions) ?? [];
  const signupStaff = (useQuery(api.staff.publicAvailableStaff) ?? []).filter((member: any) => member.isActive !== false);
  const isWeb = Platform.OS === 'web';
  const publicBaseUrl =
    typeof globalThis !== 'undefined' && (globalThis as any)?.location?.origin
      ? (globalThis as any).location.origin
      : PUBLIC_LANDING_URL.replace(/\/$/, '');

  const openPublicPage = (hashPath: string) => {
    const clean = hashPath.replace(/^#\/?/, '');
    const urlMap: Record<string, string> = {
      'privacy-policy': PUBLIC_PRIVACY_URL,
      terms: PUBLIC_TERMS_URL,
      contact: PUBLIC_CONTACT_URL,
      home: PUBLIC_LANDING_URL,
    };
    Linking.openURL(urlMap[clean] ?? `${publicBaseUrl}/#${clean}`).catch(() => {});
  };

  const handleCustomerAuth = async () => {
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password.');
      return;
    }

    if (customerFlow === 'signUp' && !name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (customerFlow === 'signUp' && !selectedStaffUserId) {
      setError('Please choose the staff member who assisted you.');
      return;
    }

    setLoading(true);
    try {
      await signIn('password', {
        email: email.trim().toLowerCase(),
        password,
        name: customerFlow === 'signUp' ? name.trim() : undefined,
        flow: customerFlow,
      });

      if (customerFlow === 'signUp' && selectedStaffUserId) {
        await setAssignedStaff({ staffUserId: selectedStaffUserId as any });
      }
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('InvalidAccountId') || msg.includes('InvalidSecret')) {
        setError(customerFlow === 'signIn'
          ? 'Invalid email or password. If you\'re new, switch to Sign Up.'
          : 'Account may already exist. Try Sign In instead.'
        );
      } else {
        setError(msg || 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStaffAuth = async () => {
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password.');
      return;
    }

    if (!isValidStaffEmail(email.trim())) {
      setError('Only Hyundai and Kia business email addresses are accepted for staff login.');
      return;
    }

    if (staffFlow === 'signUp' && !name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (staffFlow === 'signUp' && !staffSignupDealerships.length) {
      setError('No dealership locations have been created yet. Please ask an admin to create one first.');
      return;
    }

    if (staffFlow === 'signUp' && !selectedDealershipId) {
      setError('Please select the dealership you belong to.');
      return;
    }

    setLoading(true);
    try {
      await signIn('password', {
        email: email.trim().toLowerCase(),
        password,
        name: staffFlow === 'signUp' ? name.trim() : undefined,
        flow: staffFlow,
      });

      if (staffFlow === 'signUp' && selectedDealershipId) {
        await setMyDealership({ dealershipId: selectedDealershipId as any });
      }
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('InvalidAccountId') || msg.includes('InvalidSecret')) {
        setError(staffFlow === 'signIn'
          ? 'Invalid email or password. If you\'re new, switch to Sign Up.'
          : 'Account may already exist. Try Sign In instead.'
        );
      } else {
        setError(msg || 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const mobileAuthCard = (
    <View style={styles.mobileShell}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.mobileScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.mobileBrandSection}>
              <View style={styles.mobileLogoCircle}>
                <Ionicons name="car-sport" size={34} color={colors.white} />
              </View>
              <Text style={styles.mobileAppName}>HYUNDAI</Text>
              <Text style={styles.mobileSubtitle}>SERVICE HUB</Text>
            </View>

            <View style={styles.mobileModeToggle}>
              <TouchableOpacity
                style={[styles.mobileModeBtn, mode === 'customer' && styles.mobileModeBtnActive]}
                onPress={() => { setMode('customer'); setError(''); }}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="person"
                  size={14}
                  color={mode === 'customer' ? colors.primary : 'rgba(255,255,255,0.8)'}
                />
                <Text style={[styles.mobileModeBtnText, mode === 'customer' && styles.mobileModeBtnTextActive]}>Customer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mobileModeBtn, mode === 'staff' && styles.mobileModeBtnActive]}
                onPress={() => { setMode('staff'); setError(''); }}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="briefcase"
                  size={14}
                  color={mode === 'staff' ? colors.primary : 'rgba(255,255,255,0.8)'}
                />
                <Text style={[styles.mobileModeBtnText, mode === 'staff' && styles.mobileModeBtnTextActive]}>Staff</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.mobileAuthSection}>
              <Text style={styles.mobileAuthTitle}>Welcome back</Text>
              <Text style={styles.mobileAuthDesc}>
                Sign in or create an account to continue
              </Text>

              <View style={styles.mobileFlowToggle}>
                <TouchableOpacity
                  style={[styles.mobileFlowBtn, customerFlow === 'signIn' && styles.mobileFlowBtnActive]}
                  onPress={() => { setCustomerFlow('signIn'); setStaffFlow('signIn'); setError(''); }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.mobileFlowBtnText, customerFlow === 'signIn' && styles.mobileFlowBtnTextActive]}>Sign In</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.mobileFlowBtn, customerFlow === 'signUp' && styles.mobileFlowBtnActive]}
                  onPress={() => { setCustomerFlow('signUp'); setStaffFlow('signUp'); setError(''); }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.mobileFlowBtnText, customerFlow === 'signUp' && styles.mobileFlowBtnTextActive]}>Sign Up</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.mobileInput}
                placeholder="Email Address"
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TextInput
                style={styles.mobileInput}
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              {error ? (
                <View style={styles.mobileErrorBox}>
                  <Ionicons name="warning" size={16} color={colors.error} />
                  <Text style={styles.mobileErrorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.mobilePrimaryButton, loading && { opacity: 0.8 }]}
                onPress={mode === 'customer' ? handleCustomerAuth : handleStaffAuth}
                disabled={loading}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.mobilePrimaryButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>

              <View style={styles.mobileFooterLinks}>
                <TouchableOpacity onPress={() => openPublicPage('privacy-policy')}>
                  <Text style={styles.mobileFooterLink}>Privacy Policy</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openPublicPage('terms')}>
                  <Text style={styles.mobileFooterLink}>Terms of Service</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openPublicPage('contact')}>
                  <Text style={styles.mobileFooterLink}>Contact Us</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );

  if (!isWeb) {
    return mobileAuthCard;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* Brand */}
            <View style={styles.brandSection}>
              <View style={styles.logoCircle}>
                <Ionicons name="car-sport" size={44} color={colors.white} />
              </View>
              <Text style={styles.appName}>HYUNDAI</Text>
              <Text style={styles.subtitle}>SERVICE HUB</Text>
            </View>

            {/* Mode Toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'customer' && styles.modeBtnActive]}
                onPress={() => { setMode('customer'); setError(''); }}
              >
                <Ionicons
                  name="person"
                  size={18}
                  color={mode === 'customer' ? colors.primary : 'rgba(255,255,255,0.6)'}
                />
                <Text style={[styles.modeBtnText, mode === 'customer' && styles.modeBtnTextActive]}>
                  Customer
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'staff' && styles.modeBtnActive]}
                onPress={() => { setMode('staff'); setError(''); }}
              >
                <Ionicons
                  name="briefcase"
                  size={18}
                  color={mode === 'staff' ? colors.primary : 'rgba(255,255,255,0.6)'}
                />
                <Text style={[styles.modeBtnText, mode === 'staff' && styles.modeBtnTextActive]}>
                  Staff
                </Text>
              </TouchableOpacity>
            </View>

            {mode === 'customer' ? (
              /* CUSTOMER LOGIN */
              <View style={styles.authSection}>
                <Text style={styles.authTitle}>Welcome back</Text>
                <Text style={styles.authDesc}>
                  {isWeb ? 'Sign in or create an account to continue' : 'Sign in to book your vehicle service'}
                </Text>

                {isWeb ? (
                  <>
                    <View style={styles.flowToggle}>
                      <TouchableOpacity
                        style={[styles.flowBtn, customerFlow === 'signIn' && styles.flowBtnActive]}
                        onPress={() => { setCustomerFlow('signIn'); setError(''); }}
                      >
                        <Text style={[styles.flowBtnText, customerFlow === 'signIn' && styles.flowBtnTextActive]}>
                          Sign In
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.flowBtn, customerFlow === 'signUp' && styles.flowBtnActive]}
                        onPress={() => { setCustomerFlow('signUp'); setError(''); }}
                      >
                        <Text style={[styles.flowBtnText, customerFlow === 'signUp' && styles.flowBtnTextActive]}>
                          Sign Up
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {customerFlow === 'signUp' && (
                      <TextInput
                        style={styles.input}
                        placeholder="Full Name"
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                      />
                    )}

                    {customerFlow === 'signUp' ? (
                      <View style={styles.staffPickerSection}>
                        <Text style={styles.staffPickerLabel}>Choose the staff member who assisted you</Text>
                        <Text style={styles.staffPickerSub}>This will automatically route your bookings, test drives, and finance applications to that staff member.</Text>
                        <Text style={styles.staffPickerHint}>Scroll to see more staff</Text>
                        <ScrollView
                          style={styles.staffPickerScroll}
                          contentContainerStyle={styles.staffPickerList}
                          nestedScrollEnabled
                          keyboardShouldPersistTaps="handled"
                          showsVerticalScrollIndicator
                        >
                          {signupStaff.map((member: any) => {
                            const staffSelectionId = String(member.userId ?? member.staffId ?? member._id ?? '');
                            const isSelected = selectedStaffUserId === staffSelectionId;
                            return (
                              <TouchableOpacity
                                key={`${staffSelectionId}-${member.dealershipId ?? member.dealershipName ?? 'all'}`}
                                style={[styles.staffPickerCard, isSelected && styles.staffPickerCardActive]}
                                onPress={() => setSelectedStaffUserId(staffSelectionId)}
                              >
                                <Text style={[styles.staffPickerName, isSelected && styles.staffPickerNameActive]}>
                                  {member.name}
                                </Text>
                                <Text style={[styles.staffPickerMeta, isSelected && styles.staffPickerMetaActive]}>
                                  {(member.role ?? 'staff').replace(/_/g, ' ')}{member.dealershipName ? ` • ${member.dealershipName}` : ''}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    ) : null}

                    <TextInput
                      style={styles.input}
                      placeholder="Email Address"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />

                    <TextInput
                      style={styles.input}
                      placeholder="Password"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                    />

                    {error ? (
                      <View style={styles.errorBox}>
                        <Ionicons name="warning" size={16} color={colors.error} />
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    ) : null}

                    <TouchableOpacity
                      style={[styles.staffButton, loading && { opacity: 0.6 }]}
                      onPress={handleCustomerAuth}
                      disabled={loading}
                      activeOpacity={0.8}
                    >
                      {loading ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <Text style={styles.staffButtonText}>
                          {customerFlow === 'signIn' ? 'Sign In' : 'Create Account'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.googleButton}
                      onPress={() => a0.auth.signInWithGoogle()}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="logo-google" size={22} color={colors.text} />
                      <Text style={styles.googleText}>Continue with Google</Text>
                    </TouchableOpacity>

                    {Platform.OS === 'ios' && (
                      <TouchableOpacity
                        style={styles.appleButton}
                        onPress={() => a0.auth.signInWithApple()}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="logo-apple" size={22} color={colors.white} />
                        <Text style={styles.appleText}>Continue with Apple</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            ) : (
              /* STAFF LOGIN */
              <View style={styles.authSection}>
                <Text style={styles.authTitle}>
                  {staffFlow === 'signIn' ? 'Staff Sign In' : 'Staff Registration'}
                </Text>
                <Text style={styles.authDesc}>
                  Use your Hyundai or Kia business email
                </Text>

                {/* Sign In / Sign Up Toggle */}
                <View style={styles.flowToggle}>
                  <TouchableOpacity
                    style={[styles.flowBtn, staffFlow === 'signIn' && styles.flowBtnActive]}
                    onPress={() => { setStaffFlow('signIn'); setError(''); }}
                  >
                    <Text style={[styles.flowBtnText, staffFlow === 'signIn' && styles.flowBtnTextActive]}>
                      Sign In
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.flowBtn, staffFlow === 'signUp' && styles.flowBtnActive]}
                    onPress={() => { setStaffFlow('signUp'); setError(''); }}
                  >
                    <Text style={[styles.flowBtnText, staffFlow === 'signUp' && styles.flowBtnTextActive]}>
                      Sign Up
                    </Text>
                  </TouchableOpacity>
                </View>

                {staffFlow === 'signUp' ? (
                  <>
                    <View style={styles.signupFieldSection}>
                      <Text style={styles.fieldLabel}>Full Name *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your full name"
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                      />
                    </View>
                    <View style={styles.dealershipSection}>
                      <Text style={styles.dealershipLabel}>Choose your dealership</Text>
                      <Text style={styles.dealershipSub}>
                        This keeps your dashboard and assignments tied to the right location.
                      </Text>
                      {staffSignupDealerships.length === 0 ? (
                        <View style={styles.emptyDealershipBox}>
                          <Ionicons name="business-outline" size={18} color={colors.primaryLight} />
                          <Text style={styles.emptyDealershipText}>No dealership locations exist yet. Staff sign up is disabled until an admin creates one.</Text>
                        </View>
                      ) : (
                        <View style={styles.dealershipGrid}>
                          {staffSignupDealerships.map((dealership: any) => (
                            <TouchableOpacity
                              key={dealership._id}
                              style={[styles.dealershipCard, selectedDealershipId === String(dealership._id) && styles.dealershipCardActive]}
                              onPress={() => setSelectedDealershipId(String(dealership._id))}
                            >
                              <Text style={[styles.dealershipName, selectedDealershipId === String(dealership._id) && styles.dealershipNameActive]}>
                                {dealership.name}
                              </Text>
                              <Text style={[styles.dealershipMeta, selectedDealershipId === String(dealership._id) && styles.dealershipMetaActive]}>
                                {dealership.brand} • {dealership.location}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  </>
                ) : null}

                <TextInput
                  style={styles.input}
                  placeholder="Business Email"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />

                {error ? (
                  <View style={styles.errorBox}>
                    <Ionicons name="warning" size={16} color={colors.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.staffButton, loading && { opacity: 0.6 }]}
                  onPress={handleStaffAuth}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={styles.staffButtonText}>
                      {staffFlow === 'signIn' ? 'Sign In' : 'Create Account'}
                    </Text>
                  )}
                </TouchableOpacity>

                <View style={styles.domainHint}>
                  <Ionicons name="shield-checkmark" size={14} color="rgba(255,255,255,0.4)" />
                  <Text style={styles.domainHintText}>
                    Accepted: @hyundai.*, @kia.* domains
                  </Text>
                </View>
              </View>
            )}

            <Text style={styles.terms}>
              By continuing, you agree to our Terms of Service
            </Text>
            <Text style={styles.copyright}>
              Copyright © {new Date().getFullYear()} Mbulelo Vincent Mayoyo
            </Text>

            <View style={styles.webLinks}>
              <TouchableOpacity style={styles.webLinkBtn} onPress={() => openPublicPage('privacy-policy')}>
                <Text style={styles.webLinkText}>Privacy Policy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.webLinkBtn} onPress={() => openPublicPage('terms')}>
                <Text style={styles.webLinkText}>Terms of Service</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.webLinkBtn} onPress={() => openPublicPage('contact')}>
                <Text style={styles.webLinkText}>Contact Us</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  brandSection: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 24,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primaryLight,
    letterSpacing: 6,
    marginTop: 2,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.lg,
    padding: 4,
    marginBottom: spacing.xl,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  modeBtnActive: {
    backgroundColor: colors.white,
  },
  modeBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  modeBtnTextActive: {
    color: colors.primary,
  },
  authSection: {
    gap: spacing.md,
  },
  authTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
  },
  authDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  dealershipSection: {
    gap: spacing.sm,
  },
  signupFieldSection: {
    gap: spacing.sm,
  },
  staffPickerSection: {
    gap: 10,
  },
  staffPickerLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
  },
  staffPickerSub: {
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.65)',
  },
  staffPickerHint: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  staffPickerScroll: {
    height: 240,
    maxHeight: 240,
  },
  staffPickerList: {
    gap: 10,
    paddingRight: 4,
  },
  staffPickerCard: {
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  staffPickerCardActive: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  staffPickerName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  staffPickerNameActive: {
    color: colors.primary,
  },
  staffPickerMeta: {
    marginTop: 3,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  staffPickerMetaActive: {
    color: colors.primaryLight,
  },
  dealershipLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
  },
  dealershipSub: {
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.65)',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  dealershipGrid: {
    gap: 10,
  },
  emptyDealershipBox: {
    gap: 10,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  emptyDealershipText: {
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },
  createDealershipBtn: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.full,
  },
  createDealershipBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  linkButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  linkButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryLight,
    textDecorationLine: 'underline',
  },
  inputLight: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dealershipCard: {
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dealershipCardActive: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  dealershipName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  dealershipNameActive: {
    color: colors.primary,
  },
  dealershipMeta: {
    marginTop: 3,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  dealershipMetaActive: {
    color: colors.primaryLight,
  },
  flowToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    padding: 3,
  },
  flowBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  flowBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  flowBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  flowBtnTextActive: {
    color: colors.white,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.15)',
    padding: 12,
    borderRadius: radius.sm,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#FCA5A5',
  },
  staffButton: {
    backgroundColor: colors.white,
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  staffButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  domainHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  domainHintText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  terms: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  copyright: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginTop: 8,
  },
  webLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  webLinkBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  webLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryLight,
    textDecorationLine: 'underline',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    paddingVertical: 16,
    borderRadius: radius.lg,
  },
  googleText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.black,
    paddingVertical: 16,
    borderRadius: radius.lg,
  },
  appleText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  mobileShell: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  mobileScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  mobileBrandSection: {
    alignItems: 'center',
    marginBottom: 14,
  },
  mobileLogoCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginBottom: 8,
  },
  mobileAppName: {
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: 2.6,
    color: colors.white,
  },
  mobileSubtitle: {
    marginTop: 1,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 4.5,
    color: 'rgba(255,255,255,0.70)',
  },
  mobileModeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 9,
    padding: 4,
    marginBottom: 14,
  },
  mobileModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 8,
  },
  mobileModeBtnActive: {
    backgroundColor: colors.white,
  },
  mobileModeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.82)',
  },
  mobileModeBtnTextActive: {
    color: colors.primary,
  },
  mobileAuthSection: {
    gap: 8,
  },
  mobileAuthTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
  },
  mobileAuthDesc: {
    fontSize: 11,
    lineHeight: 14,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    marginBottom: 3,
  },
  mobileFlowToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 9,
    padding: 3,
  },
  mobileFlowBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 7,
  },
  mobileFlowBtnActive: {
    backgroundColor: colors.white,
  },
  mobileFlowBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
  },
  mobileFlowBtnTextActive: {
    color: colors.primary,
  },
  mobileInput: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 9,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 13.5,
    color: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  mobileErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  mobileErrorText: {
    flex: 1,
    fontSize: 12,
    color: colors.white,
  },
  mobilePrimaryButton: {
    backgroundColor: colors.white,
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 2,
  },
  mobilePrimaryButtonText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: colors.primary,
  },
  mobileFooterLinks: {
    marginTop: 5,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  mobileFooterLink: {
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.70)',
    textDecorationLine: 'underline',
  },
});