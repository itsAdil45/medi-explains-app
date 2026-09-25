import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import {
  User,
  Mail,
  Globe,
  Stethoscope,
  Building2,
  Lock,
  Banknote,
  Phone,
  Eye,
  Check,
  ChevronDown,
} from "lucide-react-native";

import { api } from "@/api/client";
import { useAuth } from "@/api/auth";

function Field({
  icon: Icon,
  label,
  ...props
}: {
  icon?: any;
  label: string;
  [key: string]: any;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-slate-700">{label}</Text>

      <View className="relative">
        {Icon && (
          <View className="absolute left-3 top-0 z-10 h-11 items-center justify-center">
            <Icon size={17} color="#94a3b8" />
          </View>
        )}

        <TextInput
          {...props}
          placeholderTextColor="#94a3b8"
          className={`h-11 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 ${
            Icon ? "pl-10" : "px-3"
          }`}
        />
      </View>
    </View>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="rounded-xl border border-slate-200 bg-white">
      <View className="border-b border-slate-100 px-5 py-4">
        <Text className="text-base font-semibold text-slate-900">{title}</Text>

        {description && (
          <Text className="mt-1 text-xs text-slate-500">{description}</Text>
        )}
      </View>

      <View className="gap-4 p-5">{children}</View>
    </View>
  );
}

export default function Profile() {
  const { user, setUser } = useAuth();

  const isDoctor =
    user?.role === "doctor" || user?.role === "cross_check_doctor";

  const isTreatingDoctor = user?.role === "doctor";
  const isPatient = user?.role === "patient";

  const [form, setForm] = useState({
    full_name: user?.full_name,
    email: user?.email,
    phone: user?.phone || "",
    is_blind: user?.is_blind || false,
    preferred_language: user?.preferred_language,
    specialty: user?.specialty || "",
    clinic: user?.clinic || "",
    doctor_fee: user?.doctor_fee ?? "",
  });

  const [langs, setLangs] = useState<any[]>([]);
  const [languageOpen, setLanguageOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [pwForm, setPwForm] = useState({
    current_password: "",
    new_password: "",
    confirm: "",
  });

  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);

  useEffect(() => {
    api
      .languages()
      .then(setLangs)
      .catch(() => {});
  }, []);

  const update = (key: string, value: any) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

    setSaved(false);
  };

  const updatePw = (key: string, value: string) => {
    setPwForm((current) => ({
      ...current,
      [key]: value,
    }));

    setPwSaved(false);
  };

  async function saveProfile() {
    setErr(null);
    setSaved(false);
    setSaving(true);

    try {
      const body: any = {
        full_name: form.full_name,
        email: form.email,
        preferred_language: form.preferred_language,
      };

      if (isPatient) {
        body.phone = form.phone.trim() || null;
        body.is_blind = form.is_blind;
      }

      if (isDoctor) {
        body.specialty = form.specialty;
        body.clinic = form.clinic;
      }

      if (isTreatingDoctor) {
        body.doctor_fee =
          form.doctor_fee === "" ? null : Number(form.doctor_fee);
      }

      const updated = await api.updateProfile(body);

      setUser(updated);
      setSaved(true);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    setPwErr(null);
    setPwSaved(false);

    if (pwForm.new_password !== pwForm.confirm) {
      setPwErr("New passwords do not match");
      return;
    }

    if (pwForm.new_password.length < 8) {
      setPwErr("New password must be at least 8 characters");
      return;
    }

    setPwBusy(true);

    try {
      await api.changePassword(pwForm.current_password, pwForm.new_password);

      setPwForm({
        current_password: "",
        new_password: "",
        confirm: "",
      });

      setPwSaved(true);
    } catch (e: any) {
      setPwErr(e.message);
    } finally {
      setPwBusy(false);
    }
  }

  const selectedLanguage = langs.find(
    (language) => language.code === form.preferred_language,
  );

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-5 py-6"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Page Header */}
      <View className="mb-6">
        <Text className="text-xl font-bold tracking-tight text-slate-900">
          Your profile
        </Text>

        <Text className="mt-1 text-sm text-slate-500">
          Manage your account details and password.
        </Text>
      </View>

      <View className="gap-5">
        {/* ========================================================= */}
        {/* ACCOUNT DETAILS */}
        {/* ========================================================= */}

        <SectionCard
          title="Account details"
          description={`${user?.role.replace("_", " ")} account`}
        >
          {/* Full Name */}
          <Field
            icon={User}
            label="Full name"
            value={form.full_name}
            onChangeText={(value: string) => update("full_name", value)}
            autoCapitalize="words"
            placeholder="Your full name"
          />

          {/* Email */}
          <Field
            icon={Mail}
            label="Email"
            value={form.email}
            onChangeText={(value: string) => update("email", value)}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="you@example.com"
          />

          {/* ======================================================= */}
          {/* PATIENT PHONE */}
          {/* ======================================================= */}

          {isPatient && (
            <View>
              <Field
                icon={Phone}
                label="Phone number"
                value={form.phone}
                onChangeText={(value: string) => update("phone", value)}
                placeholder="e.g. 03001234567"
                keyboardType="phone-pad"
              />

              <Text className="mt-1.5 text-xs leading-5 text-slate-500">
                Used for "Sign in by phone call" - we'll call this number and
                read your sign-in code aloud.
              </Text>
            </View>
          )}

          {/* ======================================================= */}
          {/* BLIND / LOW VISION */}
          {/* ======================================================= */}

          {isPatient && (
            <Pressable
              onPress={() => update("is_blind", !form.is_blind)}
              className="flex-row items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 active:bg-slate-100"
            >
              <View
                className={`mt-0.5 h-5 w-5 items-center justify-center rounded border ${
                  form.is_blind
                    ? "border-[#792884] bg-[#792884]"
                    : "border-slate-300 bg-white"
                }`}
              >
                {form.is_blind && (
                  <Check size={14} color="white" strokeWidth={3} />
                )}
              </View>

              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Eye size={16} color="#94a3b8" />

                  <Text className="text-sm font-medium text-slate-900">
                    I am blind or have low vision
                  </Text>
                </View>

                <Text className="mt-1 text-xs leading-5 text-slate-500">
                  Helps your care team offer voice-first features by default,
                  like hands-free sign-in.
                </Text>
              </View>
            </Pressable>
          )}

          {/* ======================================================= */}
          {/* LANGUAGE */}
          {/* ======================================================= */}

          <View>
            <Text className="mb-1.5 text-sm font-medium text-slate-700">
              Preferred language
            </Text>

            <Pressable
              onPress={() => setLanguageOpen((current) => !current)}
              className={`h-12 flex-row items-center rounded-lg border bg-slate-50 px-3 ${
                languageOpen ? "border-[#792884]" : "border-slate-200"
              }`}
            >
              <Globe size={17} color="#94a3b8" />

              <Text
                className="ml-3 flex-1 text-sm text-slate-900"
                numberOfLines={1}
              >
                {selectedLanguage
                  ? `${selectedLanguage.name} — ${selectedLanguage.native}`
                  : "Select language"}
              </Text>

              <ChevronDown
                size={18}
                color="#64748b"
                style={{
                  transform: [
                    {
                      rotate: languageOpen ? "180deg" : "0deg",
                    },
                  ],
                }}
              />
            </Pressable>

            {languageOpen && (
              <View className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
                {langs.length === 0 ? (
                  <View className="px-4 py-3">
                    <Text className="text-sm text-slate-500">
                      Loading languages...
                    </Text>
                  </View>
                ) : (
                  langs.map((language) => {
                    const selected = language.code === form.preferred_language;

                    return (
                      <Pressable
                        key={language.code}
                        onPress={() => {
                          update("preferred_language", language.code);
                          setLanguageOpen(false);
                        }}
                        className={`flex-row items-center px-4 py-3 ${
                          selected ? "bg-purple-50" : "active:bg-slate-50"
                        }`}
                      >
                        <View className="flex-1">
                          <Text
                            className={`text-sm ${
                              selected
                                ? "font-semibold text-[#792884]"
                                : "text-slate-900"
                            }`}
                          >
                            {language.name}
                          </Text>

                          <Text className="mt-0.5 text-xs text-slate-500">
                            {language.native}
                          </Text>
                        </View>

                        {selected && (
                          <Check size={17} color="#792884" strokeWidth={2.5} />
                        )}
                      </Pressable>
                    );
                  })
                )}
              </View>
            )}
          </View>

          {/* ======================================================= */}
          {/* DOCTOR FIELDS */}
          {/* ======================================================= */}

          {isDoctor && (
            <>
              {/* Specialty */}
              <Field
                icon={Stethoscope}
                label="Specialty"
                value={form.specialty}
                onChangeText={(value: string) => update("specialty", value)}
                placeholder="e.g. General Medicine"
              />

              {/* Clinic */}
              <Field
                icon={Building2}
                label="Clinic"
                value={form.clinic}
                onChangeText={(value: string) => update("clinic", value)}
                placeholder="e.g. City Hospital"
              />

              {/* Consultation Fee */}
              {isTreatingDoctor && (
                <Field
                  icon={Banknote}
                  label="Consultation fee"
                  value={String(form.doctor_fee)}
                  onChangeText={(value: string) => update("doctor_fee", value)}
                  placeholder="e.g. 2000"
                  keyboardType="decimal-pad"
                />
              )}
            </>
          )}

          {/* Profile Error */}
          {err && (
            <Text className="text-xs font-medium text-red-600">{err}</Text>
          )}

          {/* Profile Success */}
          {saved && (
            <Text className="text-xs font-medium text-emerald-600">
              Profile updated.
            </Text>
          )}

          {/* Save Profile */}
          <Pressable
            disabled={saving}
            onPress={saveProfile}
            className={`mt-1 self-start rounded-lg px-5 py-3 ${
              saving ? "bg-slate-300" : "bg-[#792884] active:bg-[#682173]"
            }`}
          >
            {saving ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="white" />

                <Text className="text-sm font-semibold text-white">
                  Saving...
                </Text>
              </View>
            ) : (
              <Text className="text-sm font-semibold text-white">
                Save changes
              </Text>
            )}
          </Pressable>
        </SectionCard>

        {/* ========================================================= */}
        {/* CHANGE PASSWORD */}
        {/* ========================================================= */}

        <SectionCard title="Change password">
          {/* Current Password */}
          <Field
            icon={Lock}
            label="Current password"
            value={pwForm.current_password}
            onChangeText={(value: string) =>
              updatePw("current_password", value)
            }
            secureTextEntry
            autoCapitalize="none"
            placeholder="Current password"
          />

          {/* New Password */}
          <Field
            icon={Lock}
            label="New password"
            value={pwForm.new_password}
            onChangeText={(value: string) => updatePw("new_password", value)}
            secureTextEntry
            autoCapitalize="none"
            placeholder="At least 8 characters"
          />

          {/* Confirm Password */}
          <Field
            icon={Lock}
            label="Confirm new password"
            value={pwForm.confirm}
            onChangeText={(value: string) => updatePw("confirm", value)}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Repeat new password"
          />

          {/* Password Error */}
          {pwErr && (
            <Text className="text-xs font-medium text-red-600">{pwErr}</Text>
          )}

          {/* Password Success */}
          {pwSaved && (
            <Text className="text-xs font-medium text-emerald-600">
              Password changed.
            </Text>
          )}

          {/* Update Password */}
          <Pressable
            disabled={pwBusy}
            onPress={savePassword}
            className={`mt-1 self-start rounded-lg border px-5 py-3 ${
              pwBusy
                ? "border-slate-200 bg-slate-100"
                : "border-slate-200 bg-slate-100 active:bg-slate-200"
            }`}
          >
            {pwBusy ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#475569" />

                <Text className="text-sm font-semibold text-slate-600">
                  Updating...
                </Text>
              </View>
            ) : (
              <Text className="text-sm font-semibold text-slate-700">
                Update password
              </Text>
            )}
          </Pressable>
        </SectionCard>
      </View>

      {/* Bottom spacing */}
      <View className="h-8" />
    </ScrollView>
  );
}
