import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Linking,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { showSuccessToast } from '../lib/toast';

function goBackOrHome(navigation: any, fallbackRoute = 'Main') {
  if (navigation?.canGoBack?.()) {
    navigation.goBack();
  } else {
    navigation.navigate(fallbackRoute);
  }
}

const STEPS = [
  'Personal Details',
  'Next of Kin',
  'Employment & Income',
  'Banking Details',
  'Review & Submit',
];

const ACCOUNT_TYPES = ['Savings', 'Cheque/Current', 'Transmission'];
const BANKS = ['ABSA', 'Capitec', 'FNB', 'Nedbank', 'Standard Bank', 'African Bank', 'TymeBank', 'Discovery Bank', 'Other'];

export default function FinanceApplicationScreen({ navigation, route }: any) {
  const vehicleItem = route?.params?.vehicle;
  const voiceDraft = route?.params?.voiceDraft ?? null;
  const user = useQuery(api.users.me);
  const customerProfile = useQuery(api.customerProfiles.getMyProfile);
  const submitApp = useMutation(api.finance.submit);
  const generateUploadUrl = useMutation(api.inventory.generateUploadUrl);
  const uploadAndResolve = useMutation(api.inventory.uploadAndResolve);
  const rawSalesExecutives = useQuery(api.staff.publicOnlineSalesAndServiceStaff);
  const salesExecutives = useMemo(() => (rawSalesExecutives ?? []).filter((staff: any) => staff.role === 'sales_executive'), [rawSalesExecutives]);

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [selectedSalesExecutiveId, setSelectedSalesExecutiveId] = useState<string | null>(null);

  // Form fields
  const [firstName, setFirstName] = useState(user?.name?.split(' ')[0] ?? '');
  const [surname, setSurname] = useState(user?.name?.split(' ').slice(1).join(' ') ?? '');
  const [title, setTitle] = useState('');
  const [initials, setInitials] = useState('');
  const [dependants, setDependants] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [dateMarried, setDateMarried] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [address, setAddress] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [postalAddress, setPostalAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [homeTel, setHomeTel] = useState('');
  const [workTel, setWorkTel] = useState('');
  const [cell, setCell] = useState('');
  const [fax, setFax] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [spouseNames, setSpouseNames] = useState('');
  const [spouseId, setSpouseId] = useState('');
  const [occupation, setOccupation] = useState('');

  const [nextOfKinName, setNextOfKinName] = useState('');
  const [nextOfKinRelationship, setNextOfKinRelationship] = useState('');
  const [nextOfKinAddress, setNextOfKinAddress] = useState('');
  const [nextOfKinTel, setNextOfKinTel] = useState('');

  const [employerName, setEmployerName] = useState('');
  const [employerContact, setEmployerContact] = useState('');
  const [employerAddress, setEmployerAddress] = useState('');
  const [salaryDate, setSalaryDate] = useState('');
  const [yearsAtCompany, setYearsAtCompany] = useState('');
  const [grossIncome, setGrossIncome] = useState('');
  const [netIncome, setNetIncome] = useState('');
  const [monthlyExpenses, setMonthlyExpenses] = useState('');
  const [clothingAccount, setClothingAccount] = useState('');
  const [loan, setLoan] = useState('');
  const [groceries, setGroceries] = useState('');
  const [policies, setPolicies] = useState('');
  const [transport, setTransport] = useState('');
  const [cellPhoneContract, setCellPhoneContract] = useState('');

  const [bondHolder, setBondHolder] = useState('');
  const [propertyValue, setPropertyValue] = useState('');
  const [installment, setInstallment] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [datePurchased, setDatePurchased] = useState('');
  const [registeredAs, setRegisteredAs] = useState('');
  const [ownName, setOwnName] = useState('');
  const [spouse, setSpouse] = useState('');
  const [renting, setRenting] = useState('');
  const [amountOutstanding, setAmountOutstanding] = useState('');

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState('');

  const [hasTradeIn, setHasTradeIn] = useState(false);
  const [tradeInBank, setTradeInBank] = useState('');
  const [tradeInBrand, setTradeInBrand] = useState('');
  const [tradeInYear, setTradeInYear] = useState('');
  const [tradeInKm, setTradeInKm] = useState('');
  const [tradeInColour, setTradeInColour] = useState('');
  const [tradeInService, setTradeInService] = useState('');
  const [tradeInSpareKey, setTradeInSpareKey] = useState('');

  const [docMethod, setDocMethod] = useState('');
  const [attachmentUploads, setAttachmentUploads] = useState<Array<{ name: string; url: string; mimeType: string }>>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);

  const isImageAttachment = (mimeType?: string, name?: string) => {
    const fileName = String(name ?? '').toLowerCase();
    return Boolean(mimeType?.startsWith('image/') || fileName.match(/\.(png|jpe?g|webp|heic|heif|gif)$/));
  };

  const uploadAttachment = useCallback(async (picked: { uri: string; name?: string; mimeType?: string }) => {
    const mimeType = picked.mimeType ?? (picked.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    const uploadUrl = await generateUploadUrl({});
    let responseBody = '';

    if (Platform.OS === 'web') {
      const webFetch = (globalThis as any).fetch;
      const file = (globalThis as any)?.File && picked.uri.startsWith('blob:')
        ? await webFetch(picked.uri).then((r: any) => r.blob())
        : await webFetch(picked.uri).then((r: any) => r.blob()).catch(() => null);
      const uploadResult = await webFetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
        },
        body: file ?? picked.uri,
      });
      responseBody = await uploadResult.text();
    } else {
      const FileSystem = await import('expo-file-system');
      const uploadResult = await FileSystem.uploadAsync(uploadUrl, picked.uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          'Content-Type': mimeType,
        },
      });
      responseBody = String((uploadResult as any).body ?? '');
    }

    let storageId = '';
    try {
      const parsed = JSON.parse(responseBody);
      storageId = parsed.storageId || parsed.id || '';
    } catch {
      storageId = responseBody.trim();
    }
    if (!storageId) throw new Error('Failed to upload attachment');
    const url = await uploadAndResolve({ storageId: storageId as any });
    setAttachmentUploads((current: Array<{ name: string; url: string; mimeType: string }>) => [...current, { name: picked.name ?? 'Attachment', url, mimeType }]);
  }, [generateUploadUrl, uploadAndResolve]);

  const pickAttachment = useCallback(async (mode: 'pdf' | 'image') => {
    try {
      setAttachmentBusy(true);
      const DocumentPicker: any = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: mode === 'pdf' ? 'application/pdf' : 'image/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? (mode === 'pdf' ? 'application/pdf' : 'image/jpeg');
      if (mode === 'pdf' && mimeType !== 'application/pdf') {
        Alert.alert('Invalid file', 'Please choose a PDF document.');
        return;
      }
      if (mode === 'image' && !String(mimeType).startsWith('image/')) {
        Alert.alert('Invalid file', 'Please choose an image file.');
        return;
      }
      await uploadAttachment({ uri: asset.uri, name: asset.name, mimeType });
    } catch (e: any) {
      Alert.alert('Attachment Error', e?.message ?? 'Failed to add attachment');
    } finally {
      setAttachmentBusy(false);
    }
  }, [uploadAttachment]);

  useEffect(() => {
    if (!voiceDraft) return;
    if (voiceDraft.firstName) setFirstName(voiceDraft.firstName);
    if (voiceDraft.surname) setSurname(voiceDraft.surname);
    if (voiceDraft.title) setTitle(voiceDraft.title);
    if (voiceDraft.initials) setInitials(voiceDraft.initials);
    if (voiceDraft.dependants) setDependants(voiceDraft.dependants);
    if (voiceDraft.maritalStatus) setMaritalStatus(voiceDraft.maritalStatus);
    if (voiceDraft.dateMarried) setDateMarried(voiceDraft.dateMarried);
    if (voiceDraft.idNumber) setIdNumber(voiceDraft.idNumber);
    if (voiceDraft.address) setAddress(voiceDraft.address);
    if (voiceDraft.homeAddress) setHomeAddress(voiceDraft.homeAddress);
    if (voiceDraft.postalAddress) setPostalAddress(voiceDraft.postalAddress);
    if (voiceDraft.postalCode) setPostalCode(voiceDraft.postalCode);
    if (voiceDraft.homeTel) setHomeTel(voiceDraft.homeTel);
    if (voiceDraft.workTel) setWorkTel(voiceDraft.workTel);
    if (voiceDraft.cell) setCell(voiceDraft.cell);
    if (voiceDraft.fax) setFax(voiceDraft.fax);
    if (voiceDraft.phone) setPhone(voiceDraft.phone);
    if (voiceDraft.email) setEmail(voiceDraft.email);
    if (voiceDraft.spouseNames) setSpouseNames(voiceDraft.spouseNames);
    if (voiceDraft.spouseId) setSpouseId(voiceDraft.spouseId);
    if (voiceDraft.occupation) setOccupation(voiceDraft.occupation);
    if (voiceDraft.nextOfKinName) setNextOfKinName(voiceDraft.nextOfKinName);
    if (voiceDraft.nextOfKinRelationship) setNextOfKinRelationship(voiceDraft.nextOfKinRelationship);
    if (voiceDraft.nextOfKinAddress) setNextOfKinAddress(voiceDraft.nextOfKinAddress);
    if (voiceDraft.nextOfKinTel) setNextOfKinTel(voiceDraft.nextOfKinTel);
    if (voiceDraft.employerName) setEmployerName(voiceDraft.employerName);
    if (voiceDraft.employerContact) setEmployerContact(voiceDraft.employerContact);
    if (voiceDraft.employerAddress) setEmployerAddress(voiceDraft.employerAddress);
    if (voiceDraft.salaryDate) setSalaryDate(voiceDraft.salaryDate);
    if (voiceDraft.yearsAtCompany) setYearsAtCompany(voiceDraft.yearsAtCompany);
    if (voiceDraft.grossIncome) setGrossIncome(voiceDraft.grossIncome);
    if (voiceDraft.netIncome) setNetIncome(voiceDraft.netIncome);
    if (voiceDraft.monthlyExpenses) setMonthlyExpenses(voiceDraft.monthlyExpenses);
    if (voiceDraft.clothingAccount) setClothingAccount(voiceDraft.clothingAccount);
    if (voiceDraft.loan) setLoan(voiceDraft.loan);
    if (voiceDraft.groceries) setGroceries(voiceDraft.groceries);
    if (voiceDraft.policies) setPolicies(voiceDraft.policies);
    if (voiceDraft.transport) setTransport(voiceDraft.transport);
    if (voiceDraft.cellPhoneContract) setCellPhoneContract(voiceDraft.cellPhoneContract);
    if (voiceDraft.bondHolder) setBondHolder(voiceDraft.bondHolder);
    if (voiceDraft.propertyValue) setPropertyValue(voiceDraft.propertyValue);
    if (voiceDraft.installment) setInstallment(voiceDraft.installment);
    if (voiceDraft.purchasePrice) setPurchasePrice(voiceDraft.purchasePrice);
    if (voiceDraft.datePurchased) setDatePurchased(voiceDraft.datePurchased);
    if (voiceDraft.registeredAs) setRegisteredAs(voiceDraft.registeredAs);
    if (voiceDraft.ownName) setOwnName(voiceDraft.ownName);
    if (voiceDraft.spouse) setSpouse(voiceDraft.spouse);
    if (voiceDraft.renting) setRenting(voiceDraft.renting);
    if (voiceDraft.amountOutstanding) setAmountOutstanding(voiceDraft.amountOutstanding);
    if (voiceDraft.bankName) setBankName(voiceDraft.bankName);
    if (voiceDraft.accountNumber) setAccountNumber(voiceDraft.accountNumber);
    if (voiceDraft.accountType) setAccountType(voiceDraft.accountType);
    if (typeof voiceDraft.hasTradeIn === 'boolean') setHasTradeIn(voiceDraft.hasTradeIn);
    if (voiceDraft.tradeInFinancingBank) setTradeInBank(voiceDraft.tradeInFinancingBank);
    if (voiceDraft.tradeInCarBrand) setTradeInBrand(voiceDraft.tradeInCarBrand);
    if (voiceDraft.tradeInYearModel) setTradeInYear(voiceDraft.tradeInYearModel);
    if (voiceDraft.tradeInKm) setTradeInKm(voiceDraft.tradeInKm);
    if (voiceDraft.tradeInColour) setTradeInColour(voiceDraft.tradeInColour);
    if (voiceDraft.tradeInServiceHistory) setTradeInService(voiceDraft.tradeInServiceHistory);
    if (voiceDraft.tradeInSpareKey) setTradeInSpareKey(voiceDraft.tradeInSpareKey);
    if (voiceDraft.documentMethod) setDocMethod(voiceDraft.documentMethod);
  }, [voiceDraft]);

  useEffect(() => {
    const profileName = customerProfile?.fullName ?? user?.name ?? '';
    if (profileName && !firstName && !surname) {
      const parts = profileName.trim().split(/\s+/);
      setFirstName(parts[0] ?? '');
      setSurname(parts.slice(1).join(' '));
    }
    if (customerProfile?.phone && !phone) setPhone(customerProfile.phone);
    if (customerProfile?.vehicleDescription && !occupation) {
      setOccupation('');
    }
  }, [customerProfile, user, firstName, surname, phone, occupation]);

  const selectedCustomerLabel = customerProfile?.fullName ?? user?.name ?? 'Customer';

  const openQuickWhatsApp = async () => {
    const lines = [
      'Hi Vincent, I want to apply for vehicle finance.',
      vehicleDesc ? `Vehicle: ${vehicleDesc}` : undefined,
      firstName || surname ? `Name: ${[firstName, surname].filter(Boolean).join(' ')}` : undefined,
      phone ? `Phone: ${phone}` : undefined,
      email ? `Email: ${email}` : undefined,
      hasTradeIn ? 'I also have a trade-in vehicle.' : undefined,
      'Please advise me on the next steps.',
    ].filter(Boolean);

    const url = `https://wa.me/27615276436?text=${encodeURIComponent(lines.join('\n'))}`;
    await Linking.openURL(url);
  };

  const vehicleDesc = vehicleItem
    ? `${vehicleItem.year} ${vehicleItem.make} ${vehicleItem.model}${vehicleItem.variant ? ' ' + vehicleItem.variant : ''}`
    : '';

  const selectedCustomerProfileId = route?.params?.customerProfileId ? String(route.params.customerProfileId) : undefined;

  const canProceed = () => {
    switch (step) {
      case 0: return firstName && surname && idNumber && address && email && phone;
      case 1: return nextOfKinName && nextOfKinAddress;
      case 2: return employerName && occupation && employerContact && employerAddress && salaryDate && yearsAtCompany && grossIncome && netIncome && monthlyExpenses;
      case 3: return bankName && accountNumber && accountType;
      case 4: return true;
      default: return false;
    }
  };

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError('');
    try {
      const assignedSalesExecutiveName = selectedSalesExecutiveId
        ? (salesExecutives.find((s: any) => s._id === selectedSalesExecutiveId)?.name ?? salesExecutives.find((s: any) => s._id === selectedSalesExecutiveId)?.email)
        : undefined;

      await submitApp({
        inventoryItemId: vehicleItem?._id,
        vehicleDescription: vehicleDesc || undefined,
        customerProfileId: selectedCustomerProfileId,
        dealerSupplier: undefined,
        dealerContactPerson: undefined,
        cashPriceVatIncl: undefined,
        vatableExtrasVatIncl: undefined,
        addCover: undefined,
        radioTape: undefined,
        licenceReg: idNumber || undefined,
        numberPlates: undefined,
        creditLife: undefined,
        warranty: undefined,
        advance: undefined,
        arrears: undefined,
        residual: undefined,
        title: title || undefined,
        initials: initials || undefined,
        firstName,
        surname,
        dependants: dependants || undefined,
        maritalStatus: maritalStatus || undefined,
        dateMarried: dateMarried || undefined,
        idNumber,
        address,
        homeAddress: homeAddress || undefined,
        postalAddress: postalAddress || undefined,
        postalCode: postalCode || undefined,
        homeTel: homeTel || undefined,
        workTel: workTel || undefined,
        cell: cell || undefined,
        fax: fax || undefined,
        email,
        phone,
        spouseNames: spouseNames || undefined,
        spouseId: spouseId || undefined,
        occupation,
        nextOfKinName,
        nextOfKinRelationship: nextOfKinRelationship || undefined,
        nextOfKinAddress,
        nextOfKinTel: nextOfKinTel || undefined,
        employerName,
        employerContact,
        employerAddress,
        salaryDate,
        yearsAtCompany,
        grossIncome,
        monthlyCommission: undefined,
        carAllowance: undefined,
        otherIncome: undefined,
        otherIncomeSource: undefined,
        netIncome,
        monthlyExpenses,
        bondPaymentRent: undefined,
        bankName,
        accountNumber,
        accountType,
        bondHolder: bondHolder || undefined,
        propertyValue: propertyValue || undefined,
        installment: installment || undefined,
        purchasePrice: purchasePrice || undefined,
        datePurchased: datePurchased || undefined,
        registeredAs: registeredAs || undefined,
        ownName: ownName || undefined,
        spouse: spouse || undefined,
        renting: renting || undefined,
        amountOutstanding: amountOutstanding || undefined,
        hasTradeIn,
        tradeInFinancingBank: hasTradeIn ? tradeInBank : undefined,
        tradeInCarBrand: hasTradeIn ? tradeInBrand : undefined,
        tradeInYearModel: hasTradeIn ? tradeInYear : undefined,
        tradeInKm: hasTradeIn ? tradeInKm : undefined,
        tradeInColour: hasTradeIn ? tradeInColour : undefined,
        tradeInServiceHistory: hasTradeIn ? tradeInService : undefined,
        tradeInSpareKey: hasTradeIn ? tradeInSpareKey : undefined,
        attachmentUrls: attachmentUploads.length ? attachmentUploads.map((a: { url: string }) => a.url) : undefined,
        attachmentNames: attachmentUploads.length ? attachmentUploads.map((a: { name: string }) => a.name) : undefined,
        documentMethod: docMethod || undefined,
        assignedToUserId: selectedSalesExecutiveId ?? undefined,
        assignedToName: assignedSalesExecutiveName,
      });
      setSuccess(true);
      showSuccessToast('Finance application submitted', 'Your application was sent successfully.');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to submit. Please try again.');
    }
    setSubmitting(false);
  }, [
    submitApp,
    vehicleItem?._id,
    vehicleDesc,
    selectedCustomerProfileId,
    title,
    initials,
    firstName,
    surname,
    dependants,
    maritalStatus,
    dateMarried,
    idNumber,
    address,
    homeAddress,
    postalAddress,
    postalCode,
    homeTel,
    workTel,
    cell,
    fax,
    email,
    phone,
    spouseNames,
    spouseId,
    occupation,
    nextOfKinName,
    nextOfKinRelationship,
    nextOfKinAddress,
    nextOfKinTel,
    employerName,
    employerContact,
    employerAddress,
    salaryDate,
    yearsAtCompany,
    grossIncome,
    netIncome,
    monthlyExpenses,
    bankName,
    accountNumber,
    accountType,
    bondHolder,
    propertyValue,
    installment,
    purchasePrice,
    datePurchased,
    registeredAs,
    ownName,
    spouse,
    renting,
    amountOutstanding,
    hasTradeIn,
    tradeInBank,
    tradeInBrand,
    tradeInYear,
    tradeInKm,
    tradeInColour,
    tradeInService,
    tradeInSpareKey,
    docMethod,
    selectedSalesExecutiveId,
    attachmentUploads,
    salesExecutives,
  ]);

  useEffect(() => {
    if (!voiceDraft || submitting || success) return;
    const ready = firstName && surname && idNumber && address && email && phone && nextOfKinName && nextOfKinAddress && employerName && occupation && employerContact && employerAddress && salaryDate && yearsAtCompany && grossIncome && netIncome && monthlyExpenses && bankName && accountNumber && accountType;
    if (!ready) return;
    void handleSubmit();
  }, [voiceDraft, submitting, success, firstName, surname, idNumber, address, email, phone, nextOfKinName, nextOfKinAddress, employerName, occupation, employerContact, employerAddress, salaryDate, yearsAtCompany, grossIncome, netIncome, monthlyExpenses, bankName, accountNumber, accountType, handleSubmit, user?._id]);

  const renderInput = (
    label: string,
    value: string,
    setter: (v: string) => void,
    opts?: { placeholder?: string; keyboardType?: any; multiline?: boolean; required?: boolean }
  ) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>
        {label} {opts?.required !== false && <Text style={{ color: colors.error }}>*</Text>}
      </Text>
      <TextInput
        style={[styles.fieldInput, opts?.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={setter}
        placeholder={opts?.placeholder ?? label}
        placeholderTextColor={colors.textLight}
        keyboardType={opts?.keyboardType ?? 'default'}
        multiline={opts?.multiline}
      />
    </View>
  );

  if (success) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          </View>
          <Text style={styles.successTitle}>Application Submitted!</Text>
          <Text style={styles.successDesc}>
            Your finance application{vehicleDesc ? ` for the ${vehicleDesc}` : ''} has been submitted successfully.
          </Text>
          <Text style={styles.successNote}>
            Our finance team will review your application and get back to you. You can track the status in your notifications.
          </Text>

          {docMethod && (
            <View style={styles.docNote}>
              <Ionicons name={docMethod === 'whatsapp' ? 'logo-whatsapp' : 'mail'} size={20} color={colors.primary} />
              <Text style={styles.docNoteText}>
                {docMethod === 'whatsapp'
                  ? 'Please send your supporting documents via WhatsApp to our finance team.'
                  : 'Please email your supporting documents to finance@hyundai.co.za'}
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.successBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.successBtnText}>Done</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.successBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
            onPress={() => navigation.navigate('FinanceApplications')}
          >
            <Text style={styles.successBtnText}>View Application Progress</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.primary }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => step > 0 ? setStep(step - 1) : goBackOrHome(navigation)}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Finance Application</Text>
            <Text style={styles.headerSub}>Step {step + 1} of {STEPS.length}</Text>
          </View>
          <TouchableOpacity onPress={() => goBackOrHome(navigation)}>
            <Ionicons name="close" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
        </View>
      </SafeAreaView>

      {/* Step title */}
      <View style={styles.stepHeader}>
        <Ionicons
          name={['person', 'people', 'briefcase', 'card', 'document-text'][step] as any}
          size={22}
          color={colors.primary}
        />
        <Text style={styles.stepTitle}>{STEPS[step]}</Text>
      </View>

      {vehicleDesc && step === 0 && (
        <View style={styles.vehicleBanner}>
          <Ionicons name="car-sport" size={18} color={colors.primary} />
          <Text style={styles.vehicleBannerText}>Applying for: {vehicleDesc}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* STEP 0: Personal Details */}
          {step === 0 && (
            <>
              {renderInput('Name', firstName, setFirstName)}
              {renderInput('Surname', surname, setSurname)}
              {renderInput('ID No.', idNumber, setIdNumber, { placeholder: 'South African ID number', keyboardType: 'numeric' })}
              {renderInput('Address', address, setAddress, { multiline: true, placeholder: 'Residential address' })}
              {renderInput('Email Address', email, setEmail, { keyboardType: 'email-address' })}
              {renderInput('Phone Number', phone, setPhone, { keyboardType: 'phone-pad', placeholder: 'e.g. 072 123 4567' })}
            </>
          )}

          {/* STEP 1: Next of Kin */}
          {step === 1 && (
            <>
              <Text style={styles.stepHint}>In case of emergency or for reference purposes.</Text>
              {renderInput('Next of Kin', nextOfKinName, setNextOfKinName, { placeholder: 'Full name of next of kin' })}
              {renderInput('Next of Kin Address', nextOfKinAddress, setNextOfKinAddress, { multiline: true, placeholder: 'Full address' })}
            </>
          )}

          {/* STEP 2: Employment & Income */}
          {step === 2 && (
            <>
              {renderInput('Name of Employer', employerName, setEmployerName)}
              {renderInput('Occupation', occupation, setOccupation, { placeholder: 'Your current occupation' })}
              {renderInput('Contact Details for the Employer', employerContact, setEmployerContact, { keyboardType: 'phone-pad', placeholder: 'Phone number or email' })}
              {renderInput('Employer Address', employerAddress, setEmployerAddress, { multiline: true })}
              {renderInput('Salary Date', salaryDate, setSalaryDate, { placeholder: 'e.g. 25th of every month' })}
              {renderInput('Years Worked @ the Company', yearsAtCompany, setYearsAtCompany, { keyboardType: 'numeric', placeholder: 'e.g. 3' })}
              {renderInput('Gross Income', grossIncome, setGrossIncome, { keyboardType: 'numeric', placeholder: 'e.g. 35000' })}
              {renderInput('Net Income', netIncome, setNetIncome, { keyboardType: 'numeric', placeholder: 'Take-home pay after deductions' })}
              {renderInput('Monthly Expenses', monthlyExpenses, setMonthlyExpenses, { keyboardType: 'numeric', placeholder: 'Total monthly expenses' })}
              {renderInput('Clothing Account', clothingAccount, setClothingAccount, { keyboardType: 'numeric', placeholder: 'Monthly amount' })}
              {renderInput('Loan', loan, setLoan, { keyboardType: 'numeric', placeholder: 'Monthly amount' })}
              {renderInput('Groceries', groceries, setGroceries, { keyboardType: 'numeric', placeholder: 'Monthly amount' })}
              {renderInput('Policies', policies, setPolicies, { keyboardType: 'numeric', placeholder: 'Monthly amount' })}
              {renderInput('Transport', transport, setTransport, { keyboardType: 'numeric', placeholder: 'Monthly amount' })}
              {renderInput('Cell Phone Contract', cellPhoneContract, setCellPhoneContract, { keyboardType: 'numeric', placeholder: 'Monthly amount' })}

              <View style={styles.tradeToggle}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tradeToggleTitle}>Do you have a trade-in?</Text>
                  <Text style={styles.tradeToggleSub}>Select yes if you want to trade in your current vehicle.</Text>
                </View>
                <Switch
                  value={hasTradeIn}
                  onValueChange={setHasTradeIn}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={hasTradeIn ? colors.primary : colors.surface}
                />
              </View>

              {hasTradeIn && (
                <>
                  <Text style={styles.stepHint}>Tell us about the vehicle you want to trade in.</Text>
                  {renderInput('Trade-In Finance Bank', tradeInBank, setTradeInBank, { required: false, placeholder: 'Current finance bank, if any' })}
                  {renderInput('Trade-In Vehicle Brand', tradeInBrand, setTradeInBrand, { required: false, placeholder: 'e.g. Toyota' })}
                  {renderInput('Trade-In Year / Model', tradeInYear, setTradeInYear, { required: false, placeholder: 'e.g. 2020 Corolla' })}
                  {renderInput('Trade-In Mileage', tradeInKm, setTradeInKm, { required: false, keyboardType: 'numeric', placeholder: 'e.g. 85000 km' })}
                  {renderInput('Trade-In Colour', tradeInColour, setTradeInColour, { required: false, placeholder: 'Vehicle colour' })}
                  {renderInput('Trade-In Service History', tradeInService, setTradeInService, { required: false, placeholder: 'Full / partial / none' })}
                  {renderInput('Trade-In Spare Key', tradeInSpareKey, setTradeInSpareKey, { required: false, placeholder: 'Yes / No' })}
                </>
              )}
            </>
          )}

          {/* STEP 3: Banking Details */}
          {step === 3 && (
            <>
              <Text style={styles.stepHint}>Your banking details are kept secure and confidential.</Text>
              <Text style={styles.fieldLabel}>Bank Name <Text style={{ color: colors.error }}>*</Text></Text>
              <View style={styles.chipRow}>
                {BANKS.map(b => (
                  <TouchableOpacity
                    key={b}
                    style={[styles.chip, bankName === b && styles.chipActive]}
                    onPress={() => setBankName(b)}
                  >
                    <Text style={[styles.chipText, bankName === b && styles.chipTextActive]}>{b}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {renderInput('Account Number', accountNumber, setAccountNumber, { keyboardType: 'numeric' })}
              <Text style={styles.fieldLabel}>Type of Account <Text style={{ color: colors.error }}>*</Text></Text>
              <View style={styles.chipRow}>
                {ACCOUNT_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, accountType === t && styles.chipActive]}
                    onPress={() => setAccountType(t)}
                  >
                    <Text style={[styles.chipText, accountType === t && styles.chipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* STEP 4: Review & Submit */}
          {step === 4 && (
            <>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewSection}>Personal Details</Text>
                <Text style={styles.reviewLine}>Customer: {selectedCustomerLabel}</Text>
                <Text style={styles.reviewLine}>{firstName} {surname}</Text>
                <Text style={styles.reviewLine}>ID No.: {idNumber}</Text>
                <Text style={styles.reviewLine}>{address}</Text>
                <Text style={styles.reviewLine}>{email} | {phone}</Text>
              </View>

              <View style={styles.reviewCard}>
                <Text style={styles.reviewSection}>Next of Kin</Text>
                <Text style={styles.reviewLine}>{nextOfKinName}</Text>
                <Text style={styles.reviewLine}>{nextOfKinAddress}</Text>
              </View>

              <View style={styles.reviewCard}>
                <Text style={styles.reviewSection}>Employment & Income</Text>
                <Text style={styles.reviewLine}>Employer: {employerName}</Text>
                <Text style={styles.reviewLine}>Occupation: {occupation}</Text>
                <Text style={styles.reviewLine}>Employer Contact: {employerContact}</Text>
                <Text style={styles.reviewLine}>Employer Address: {employerAddress}</Text>
                <Text style={styles.reviewLine}>Salary Date: {salaryDate}</Text>
                <Text style={styles.reviewLine}>Years Worked: {yearsAtCompany}</Text>
                <Text style={styles.reviewLine}>Gross Income: R{grossIncome}</Text>
                <Text style={styles.reviewLine}>Net Income: R{netIncome}</Text>
                <Text style={styles.reviewLine}>Monthly Expenses: R{monthlyExpenses}</Text>
                <Text style={styles.reviewLine}>Clothing Account: R{clothingAccount}</Text>
                <Text style={styles.reviewLine}>Loan: R{loan}</Text>
                <Text style={styles.reviewLine}>Groceries: R{groceries}</Text>
                <Text style={styles.reviewLine}>Policies: R{policies}</Text>
                <Text style={styles.reviewLine}>Transport: R{transport}</Text>
                <Text style={styles.reviewLine}>Cell Phone Contract: R{cellPhoneContract}</Text>
              </View>

              <View style={styles.reviewCard}>
                <Text style={styles.reviewSection}>Banking</Text>
                <Text style={styles.reviewLine}>{bankName}</Text>
                <Text style={styles.reviewLine}>Account Number: {accountNumber}</Text>
                <Text style={styles.reviewLine}>Type of Account: {accountType}</Text>
              </View>

              {hasTradeIn && (
                <View style={styles.reviewCard}>
                  <Text style={styles.reviewSection}>Trade-In</Text>
                  <Text style={styles.reviewLine}>Finance Bank: {tradeInBank || '—'}</Text>
                  <Text style={styles.reviewLine}>Vehicle Brand: {tradeInBrand || '—'}</Text>
                  <Text style={styles.reviewLine}>Year / Model: {tradeInYear || '—'}</Text>
                  <Text style={styles.reviewLine}>Mileage: {tradeInKm ? `${tradeInKm} km` : '—'}</Text>
                  <Text style={styles.reviewLine}>Colour: {tradeInColour || '—'}</Text>
                  <Text style={styles.reviewLine}>Service History: {tradeInService || '—'}</Text>
                  <Text style={styles.reviewLine}>Spare Key: {tradeInSpareKey || '—'}</Text>
                </View>
              )}

              <View style={styles.reviewCard}>
                <Text style={styles.reviewSection}>Documents</Text>
                <Text style={styles.reviewHint}>Choose how you want to send your supporting documents.</Text>
                <View style={styles.docOptions}>
                  <TouchableOpacity
                    style={[styles.docOption, docMethod === 'whatsapp' && styles.docOptionActive]}
                    onPress={() => setDocMethod('whatsapp')}
                  >
                    <Ionicons
                      name="logo-whatsapp"
                      size={18}
                      color={docMethod === 'whatsapp' ? colors.white : '#25D366'}
                    />
                    <Text style={[styles.docOptionText, docMethod === 'whatsapp' && { color: colors.white }]}>
                      WhatsApp
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.docOption, docMethod === 'email' && styles.docOptionActive]}
                    onPress={() => setDocMethod('email')}
                  >
                    <Ionicons
                      name="mail"
                      size={18}
                      color={docMethod === 'email' ? colors.white : colors.primary}
                    />
                    <Text style={[styles.docOptionText, docMethod === 'email' && { color: colors.white }]}>
                      Email
                    </Text>
                  </TouchableOpacity>
                </View>

                {attachmentUploads.length > 0 && (
                  <View style={styles.attachmentPreviewSection}>
                    <Text style={styles.reviewHint}>Uploaded files</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachmentRow}>
                      {attachmentUploads.map((attachment: { name: string; url: string; mimeType: string }, index: number) => {
                        const imageFile = isImageAttachment(attachment.mimeType, attachment.name);
                        return (
                          <View key={`${attachment.url}-${index}`} style={styles.attachmentPreviewCard}>
                            {imageFile ? (
                              <Image source={{ uri: attachment.url }} style={styles.attachmentPreviewImage} />
                            ) : (
                              <View style={styles.attachmentPreviewFallback}>
                                <Ionicons name="document-text" size={22} color={colors.primary} />
                              </View>
                            )}
                            <Text style={styles.attachmentPreviewName} numberOfLines={1}>
                              {attachment.name}
                            </Text>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={styles.reviewCard}>
                <Text style={styles.reviewSection}>Sales Executive</Text>
                <Text style={styles.reviewLine}>
                  {selectedSalesExecutiveId ? (salesExecutives.find((s: any) => s._id === selectedSalesExecutiveId)?.name || 'Selected sales executive') : 'No sales executive selected'}
                </Text>
                <Text style={styles.reviewHint}>Optional. If you skip this, the application will still submit and can be assigned later.</Text>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Select Your Sales Executive</Text>
              <View style={styles.chipRow}>
                {salesExecutives.map((staff: any) => (
                  <TouchableOpacity
                    key={staff._id}
                    style={[styles.chip, selectedSalesExecutiveId === staff._id && styles.chipActive]}
                    onPress={() => setSelectedSalesExecutiveId(staff._id)}
                  >
                    <Text style={[styles.chipText, selectedSalesExecutiveId === staff._id && styles.chipTextActive]}>
                      {staff.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom buttons */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        {step === STEPS.length - 1 ? (
          <TouchableOpacity
            style={[styles.nextBtn, styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Ionicons name="document-text" size={20} color={colors.white} />
            <Text style={styles.nextBtnText}>{submitting ? 'Submitting...' : 'Submit Application'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, !canProceed() && { opacity: 0.5 }]}
            onPress={() => setStep(step + 1)}
            disabled={!canProceed()}
          >
            <Text style={styles.nextBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.white} />
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    backgroundColor: colors.primary,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.white },
  headerSub: { fontSize: 12, color: colors.primaryLight, marginTop: 1 },
  progressBar: {
    height: 3,
    backgroundColor: colors.primary,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.primaryLight,
    borderRadius: 2,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  stepTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  stepHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  vehicleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.primary + '10',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  vehicleBannerText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  formContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 120,
    paddingTop: spacing.sm,
  },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.text },
  chipTextActive: { color: colors.white },
  tradeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  tradeToggleTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  tradeToggleSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  reviewCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  reviewSection: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  reviewLine: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  docOptions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 8,
    marginBottom: 20,
  },
  docOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  docOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  docOptionText: { fontSize: 15, fontWeight: '700', color: colors.text },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.error + '10',
    padding: 12,
    borderRadius: radius.md,
  },
  errorText: { fontSize: 13, color: colors.error, flex: 1 },
  quickWhatsAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    paddingVertical: 14,
    borderRadius: radius.lg,
    marginBottom: 20,
  },
  quickWhatsAppText: { fontSize: 15, fontWeight: '700', color: colors.white },
  bottomBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radius.lg,
  },
  submitBtn: { backgroundColor: colors.success },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  // Success
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  successIcon: { marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  successDesc: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
  successNote: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 16, lineHeight: 20 },
  docNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primary + '10',
    padding: 16,
    borderRadius: radius.lg,
    marginTop: 24,
  },
  docNoteText: { fontSize: 13, color: colors.text, flex: 1, lineHeight: 18 },
  successBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: radius.lg,
    marginTop: 32,
  },
  successBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  attachmentPreviewSection: {
    marginTop: 8,
  },
  attachmentPreviewCard: {
    width: 96,
    marginRight: 10,
  },
  attachmentPreviewImage: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  attachmentPreviewFallback: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentPreviewName: {
    marginTop: 6,
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  attachmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  attachmentBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  reviewHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radius.lg,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  secondaryBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    borderRadius: radius.lg,
  },
  secondaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.text },
  progressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    paddingVertical: 16,
    borderRadius: radius.lg,
    marginTop: 20,
  },
  progressBtnText: { fontSize: 14, fontWeight: '700', color: colors.text },
});