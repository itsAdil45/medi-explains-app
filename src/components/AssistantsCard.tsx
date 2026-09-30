import { useEffect, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { Check, UserMinus, UserPlus } from "lucide-react-native";

import { api } from "@/api/client";
import { useAuth } from "@/api/auth";
import { SelectField } from "@/components/ui/select";

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-slate-700">{label}</Text>
      <TextInput
        placeholderTextColor="#94a3b8"
        className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900"
        {...props}
      />
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`h-11 flex-row items-center justify-center gap-2 rounded-lg bg-[#792884] px-4 ${
        disabled ? "opacity-50" : "active:opacity-80"
      }`}
    >
      <UserPlus size={16} color="white" />
      <Text className="text-sm font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

// Doctor's own profile: who reviews my prescriptions, and whether that
// review is required before I can approve.
export default function AssistantsCard() {
  const { user, setUser } = useAuth();
  const [assistants, setAssistants] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [pick, setPick] = useState("");
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    api
      .listAssistants()
      .then(setAssistants)
      .catch((e) => setErr(e.message));
    api
      .availableAssistants()
      .then(setAvailable)
      .catch(() => {});
  }
  useEffect(load, []);

  async function run(fn: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      await fn();
      if (message) setNotice(message);
      load();
      return true;
    } catch (e: any) {
      setErr(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addExisting() {
    if (!pick) return;
    const ok = await run(
      () => api.linkAssistant({ assistant_id: Number(pick) }),
      "Assistant added.",
    );
    if (ok) setPick("");
  }

  async function addNew() {
    const full_name = form.full_name.trim();
    const email = form.email.trim();
    if (full_name.length < 2 || !email.includes("@")) {
      setErr("Enter the assistant's full name and a valid email.");
      return;
    }
    const ok = await run(
      () =>
        api.linkAssistant({
          full_name,
          email,
          phone: form.phone.trim() || null,
        }),
      `${full_name} added - they'll get an email to set their password.`,
    );
    if (ok) setForm({ full_name: "", email: "", phone: "" });
  }

  function confirmRemove(a: any) {
    Alert.alert("Remove assistant", `Remove ${a.full_name} as your assistant?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          run(() => api.unlinkAssistant(a.id), `${a.full_name} removed.`),
      },
    ]);
  }

  const toggleRequired = () =>
    run(async () => {
      setUser(
        await api.updateProfile({
          requires_assistant_review: !user?.requires_assistant_review,
        }),
      );
    });

  const required = !!user?.requires_assistant_review;

  return (
    <View className="rounded-xl border border-slate-200 bg-white">
      <View className="border-b border-slate-100 px-5 py-4">
        <Text className="text-base font-semibold text-slate-900">
          Assistants
        </Text>
        <Text className="mt-1 text-xs text-slate-500">
          Send a drafted prescription to an assistant to check. They can
          correct it and send it back; you still confirm every change and give
          the final approval.
        </Text>
      </View>

      <View className="gap-4 p-5">
        <Pressable
          disabled={busy}
          onPress={toggleRequired}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: required, disabled: busy }}
          className="flex-row items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 active:bg-slate-100"
        >
          <View
            className={`mt-0.5 h-5 w-5 items-center justify-center rounded border ${
              required
                ? "border-[#792884] bg-[#792884]"
                : "border-slate-300 bg-white"
            }`}
          >
            {required && <Check size={14} color="white" strokeWidth={3} />}
          </View>
          <View className="flex-1">
            <Text className="text-sm font-medium text-slate-900">
              Require assistant review before I approve
            </Text>
            <Text className="mt-1 text-xs leading-5 text-slate-500">
              When on, the Approve button stays locked until an assistant has
              reviewed the prescription.
            </Text>
          </View>
        </Pressable>

        {assistants.length === 0 ? (
          <Text className="text-sm text-slate-500">No assistants yet.</Text>
        ) : (
          <View className="gap-2">
            {assistants.map((a) => (
              <View
                key={a.id}
                className="flex-row items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-2.5"
              >
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-900">
                    {a.full_name}
                    {!a.is_active && (
                      <Text className="text-xs font-normal text-slate-500">
                        {" "}
                        (deactivated)
                      </Text>
                    )}
                  </Text>
                  <Text className="text-xs text-slate-500">
                    {a.email}
                    {a.phone && ` · ${a.phone}`}
                    {a.pending_reviews > 0 &&
                      ` · ${a.pending_reviews} waiting for review`}
                  </Text>
                </View>
                <Pressable
                  disabled={busy}
                  onPress={() => confirmRemove(a)}
                  accessibilityLabel={`Remove ${a.full_name} as your assistant`}
                  className="flex-row items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 active:bg-slate-50"
                >
                  <UserMinus size={15} color="#334155" />
                  <Text className="text-xs font-semibold text-slate-700">
                    Remove
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View className="gap-3 border-t border-slate-200 pt-4">
          <View className="flex-row self-start rounded-lg bg-slate-100 p-[3px]">
            {(
              [
                ["existing", "Existing assistant"],
                ["new", "New assistant"],
              ] as const
            ).map(([k, label]) => (
              <Pressable
                key={k}
                onPress={() => setMode(k)}
                className={`rounded-md px-3.5 py-1.5 ${mode === k ? "bg-white shadow-sm" : ""}`}
              >
                <Text
                  className={`text-xs font-semibold ${mode === k ? "text-slate-900" : "text-slate-500"}`}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === "existing" ? (
            <View className="gap-3">
              <SelectField
                className=""
                label="Assistant"
                value={pick}
                disabled={available.length === 0}
                placeholder={
                  available.length
                    ? "Select…"
                    : "No other assistants in your organization"
                }
                options={available.map((a) => ({
                  id: a.id,
                  label: `${a.full_name} · ${a.email}`,
                }))}
                onChange={setPick}
              />
              <ActionButton
                label="Add"
                onPress={addExisting}
                disabled={busy || !pick}
              />
            </View>
          ) : (
            <View className="gap-3">
              <Field
                label="Full name"
                value={form.full_name}
                onChangeText={(v) => setForm((f) => ({ ...f, full_name: v }))}
                autoCapitalize="words"
                placeholder="Assistant's full name"
              />
              <Field
                label="Email"
                value={form.email}
                onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="assistant@example.com"
              />
              <Field
                label="Phone"
                value={form.phone}
                onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                keyboardType="phone-pad"
                placeholder="Optional"
              />
              <ActionButton
                label="Create & add"
                onPress={addNew}
                disabled={busy}
              />
            </View>
          )}
        </View>

        {err && <Text className="text-xs font-medium text-red-600">{err}</Text>}
        {notice && (
          <Text className="text-xs font-medium text-emerald-700">{notice}</Text>
        )}
      </View>
    </View>
  );
}
