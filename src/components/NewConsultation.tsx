import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { router } from "expo-router";

import { api } from "@/api/client";
import Recorder from "@/components/Recorder";
import LanguagePicker from "@/components/LanguagePicker";

type Patient = {
  id: number;
  full_name: string;
  email?: string;
  preferred_language?: string;
};

type Lang = {
  code: string;
  name: string;
  native: string;
  has_tts: boolean;
  rtl?: boolean;
  quality?: string;
};

type Consultation = {
  id: number;
};

function SelectField({
  label,
  value,
  placeholder,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: {
    value: string;
    label: string;
  }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value);

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-slate-700">{label}</Text>

      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={`h-11 flex-row items-center rounded-lg border border-slate-200 bg-slate-50 px-3 ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <Text
          className={`flex-1 text-sm ${
            selected ? "text-slate-900" : "text-slate-400"
          }`}
          numberOfLines={1}
        >
          {selected?.label || placeholder}
        </Text>

        <ChevronDown size={17} color="#64748b" />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={() => setOpen(false)}
        >
          <Pressable
            className="max-h-[70%] rounded-t-2xl bg-white pb-6 pt-2"
            onPress={(event) => event.stopPropagation()}
          >
            <View className="mb-1 items-center py-2">
              <View className="h-1 w-10 rounded-full bg-slate-300" />
            </View>

            <Text className="px-5 py-3 text-base font-semibold text-slate-900">
              {label}
            </Text>

            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => {
                const isSelected = item.value === value;

                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    className={`flex-row items-center px-5 py-3.5 ${
                      isSelected ? "bg-purple-50" : "active:bg-slate-50"
                    }`}
                  >
                    <Text
                      className={`flex-1 text-sm ${
                        isSelected
                          ? "font-semibold text-[#792884]"
                          : "text-slate-900"
                      }`}
                    >
                      {item.label}
                    </Text>

                    {isSelected && (
                      <Check size={17} color="#792884" strokeWidth={2.5} />
                    )}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ConsentCheckbox({
  checked,
  onPress,
  children,
}: {
  checked: boolean;
  onPress: () => void;
  children: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-start gap-3 active:opacity-70"
    >
      <View
        className={`mt-0.5 h-5 w-5 items-center justify-center rounded border ${
          checked
            ? "border-[#792884] bg-[#792884]"
            : "border-slate-300 bg-white"
        }`}
      >
        {checked && <Check size={14} color="#fff" strokeWidth={3} />}
      </View>

      <Text className="flex-1 text-[13px] leading-5 text-slate-700">
        {children}
      </Text>
    </Pressable>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <View className="rounded-xl border border-slate-200 bg-white p-5">
      {children}
    </View>
  );
}

export default function NewConsultation() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [langs, setLangs] = useState<Lang[]>([]);

  const [patientId, setPatientId] = useState("");
  const [outputLang, setOutputLang] = useState("en");

  const [sttPrimary, setSttPrimary] = useState("");
  const [sttSecondary, setSttSecondary] = useState("");

  const [docConsent, setDocConsent] = useState(false);
  const [patConsent, setPatConsent] = useState(false);

  const [consultation, setConsultation] = useState<Consultation | null>(null);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      try {
        const [patientData, languageData] = await Promise.all([
          api.listPatients(),
          api.languages(),
        ]);

        setPatients(patientData);
        setLangs(languageData);
      } catch (e: any) {
        setErr(e.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // When a patient is selected, use their preferred
  // language as the default output language.
  useEffect(() => {
    if (!patientId) return;

    const patient = patients.find((p) => String(p.id) === String(patientId));

    if (patient?.preferred_language) {
      setOutputLang(patient.preferred_language);
    }
  }, [patientId, patients]);

  async function start() {
    setErr(null);

    if (!patientId) {
      setErr("Select a patient");
      return;
    }

    if (!docConsent || !patConsent) {
      setErr("Both consents are required");
      return;
    }

    setCreating(true);

    try {
      const c = await api.createConsultation({
        patient_id: Number(patientId),
        doctor_consent: true,
        patient_consent: true,
        patient_language: outputLang,
        stt_primary_language: sttPrimary || null,
        stt_secondary_language: sttSecondary || null,
      });

      setConsultation(c);
    } catch (e: any) {
      setErr(e.message || "Failed to create consultation");
    } finally {
      setCreating(false);
    }
  }

  async function onAudio(file: { uri: string; name: string; type: string }) {
    if (!consultation) return;

    setUploading(true);
    setErr(null);

    try {
      await api.uploadAudio(consultation.id, file);

      router.replace(`/consultation/${consultation.id}`);
    } catch (e: any) {
      setErr(e.message || "Failed to upload audio");
      setUploading(false);
    }
  }

  const patientOptions = patients.map((patient) => ({
    value: String(patient.id),
    label: `${patient.full_name} (${patient.email || "No email"}) — prefers ${(
      patient.preferred_language || "en"
    ).toUpperCase()}`,
  }));

  const languageOptions = langs.map((language) => ({
    value: language.code,
    label: `${language.name} (${language.native})`,
  }));

  const secondaryLanguageOptions = langs
    .filter((language) => language.code !== sttPrimary)
    .map((language) => ({
      value: language.code,
      label: `${language.name} (${language.native})`,
    }));

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-5 py-6"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View className="mx-auto w-full max-w-[720px]">
        <SectionCard>
          <Text className="text-lg font-semibold text-slate-900">
            {!consultation
              ? "Start a new consultation"
              : `Consultation #${consultation.id} ready`}
          </Text>

          <View className="mt-5 gap-5">
            {!consultation ? (
              <>
                {/* PATIENT */}
                <SelectField
                  label="Patient"
                  value={patientId}
                  placeholder={
                    loading ? "Loading patients..." : "— Select patient —"
                  }
                  options={patientOptions}
                  onChange={setPatientId}
                  disabled={loading}
                />

                {/* SPOKEN LANGUAGE */}
                <View className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <Text className="mb-1 text-[13px] font-bold text-slate-900">
                    Spoken language during the consultation
                  </Text>

                  <Text className="mb-4 text-xs leading-5 text-slate-500">
                    Helps the AI transcribe accurately. Leave blank for
                    auto-detect. For code-switched consultations (e.g. English
                    mixed with Urdu), set both primary and secondary.
                  </Text>

                  <View className="gap-4">
                    <SelectField
                      label="Primary spoken language"
                      value={sttPrimary}
                      placeholder="— Auto-detect —"
                      options={[
                        {
                          value: "",
                          label: "— Auto-detect —",
                        },
                        ...languageOptions,
                      ]}
                      onChange={setSttPrimary}
                    />

                    <SelectField
                      label="Secondary spoken language (optional, for code-switching)"
                      value={sttSecondary}
                      placeholder="— None —"
                      options={[
                        {
                          value: "",
                          label: "— None —",
                        },
                        ...secondaryLanguageOptions,
                      ]}
                      onChange={setSttSecondary}
                    />
                  </View>
                </View>

                {/* OUTPUT LANGUAGE */}
                <View>
                  <Text className="mb-2 text-[13px] font-bold text-slate-900">
                    Patient's preferred language for the written/audio summary
                  </Text>

                  <LanguagePicker value={outputLang} onChange={setOutputLang} />
                </View>

                {/* CONSENT */}
                <View className="rounded-lg border border-slate-200 p-4">
                  <Text className="mb-1 text-[13px] font-bold text-slate-900">
                    Consent
                  </Text>

                  <Text className="mb-4 text-xs leading-5 text-slate-500">
                    Recording cannot start until both parties consent. Consent
                    can be withdrawn later and the recording deleted.
                  </Text>

                  <View className="gap-3">
                    <ConsentCheckbox
                      checked={docConsent}
                      onPress={() => setDocConsent((current) => !current)}
                    >
                      I (the doctor) consent to recording for documentation and
                      prototype use.
                    </ConsentCheckbox>

                    <ConsentCheckbox
                      checked={patConsent}
                      onPress={() => setPatConsent((current) => !current)}
                    >
                      The patient has given informed verbal consent to record
                      this consultation.
                    </ConsentCheckbox>
                  </View>
                </View>

                {/* ERROR */}
                {err && (
                  <Text className="text-xs font-medium text-red-600">
                    {err}
                  </Text>
                )}

                {/* CREATE */}
                <Pressable
                  disabled={creating || loading}
                  onPress={start}
                  className={`items-center rounded-lg px-4 py-3 ${
                    creating || loading
                      ? "bg-slate-300"
                      : "bg-[#792884] active:bg-[#682173]"
                  }`}
                >
                  {creating ? (
                    <View className="flex-row items-center gap-2">
                      <ActivityIndicator size="small" color="#fff" />

                      <Text className="text-sm font-semibold text-white">
                        Creating...
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-sm font-semibold text-white">
                      Create consultation
                    </Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                {/* RECORDING */}
                <Text className="text-sm leading-5 text-slate-500">
                  Record the consultation. When you stop, the audio uploads and
                  the AI pipeline runs in the background.
                </Text>

                <Recorder onComplete={onAudio} disabled={uploading} />

                {uploading && (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" />

                    <Text className="text-sm text-slate-500">Uploading...</Text>
                  </View>
                )}

                {err && (
                  <Text className="text-xs font-medium text-red-600">
                    {err}
                  </Text>
                )}
              </>
            )}
          </View>
        </SectionCard>
      </View>
    </ScrollView>
  );
}
