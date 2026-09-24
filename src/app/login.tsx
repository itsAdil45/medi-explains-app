import { useState } from "react";
import { Link, Redirect, useRouter } from "expo-router";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Stethoscope, Mail, Lock, Mic } from "lucide-react-native";
import { useAuth } from "@/api/auth";
import { useWakePhraseSignIn } from "@/hooks/useWakePhraseSignIn";

const DEMO_ACCOUNTS = [
  { email: "doctor@demo.com", role: "Doctor", tone: "green" as const },
  { email: "patient.ur@demo.com", role: "Patient", tone: "red" as const },
  { email: "receptionist@demo.com", role: "Receptionist", tone: "blue" as const },
];

// No ui/badge.tsx in this project yet (unlike @/components/ui/button etc on
// the website), so this mimics just the one tone mapping Login.jsx needs
// rather than pulling in a whole badge component for a single screen.
const TONE_STYLES: Record<string, { bg: string; text: string }> = {
  green: { bg: "bg-emerald-100", text: "text-emerald-700" },
  red: { bg: "bg-rose-100", text: "text-rose-700" },
  blue: { bg: "bg-sky-100", text: "text-sky-700" },
};

export default function Login() {
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("doctor@demo.com");
  const [password, setPassword] = useState("demo1234");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Native mimic of App.jsx's <RedirectIfAuthed> wrapper around /login - an
  // already-signed-in user shouldn't see the login form again.
  if (!authLoading && user) return <Redirect href="/" />;

  // Unauthenticated blind patients have no menu to tap to reach phone
  // sign-in - listening for the wake phrase right on the landing page, no
  // toggle required, is the only way "just say Hey Doctor" actually works
  // for a first-time (or rare re-entry) visitor.
  const {
    supported: wakeSupported,
    listening: wakeListening,
    denied: wakeDenied,
  } = useWakePhraseSignIn();

  async function submit() {
    setErr(null);
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword("demo1234");
  }

  return (
    <View className="flex-1">
      {/* RN has no radial-gradient, so a diagonal linear gradient stands in
          for the web version's radial wash - same approach as phone-sign-in. */}
      <LinearGradient
        colors={["#792884", "#4ab96a", "#792884"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <View className="flex-1 items-center justify-center p-6">
        <View className="mb-7 w-full max-w-[400px]">
          <Link href="/" asChild>
            <Pressable className="flex-row items-center gap-2.5 self-start">
              <View className="size-8 items-center justify-center rounded-lg bg-[#792884]">
                <Stethoscope size={16} color="#fff" strokeWidth={2} />
              </View>
              <Text className="text-base font-semibold tracking-tight text-white">
                AI Healthcare<Text className="text-[#4ab96a]">+</Text>
              </Text>
            </Pressable>
          </Link>
        </View>

        <View className="w-full max-w-[400px] rounded-2xl bg-white p-8 pt-9 shadow-xl">
          <Text className="mb-1.5 text-xl font-bold tracking-tight text-slate-900">
            Welcome back
          </Text>
          <Text className="mb-4 text-sm text-slate-500">
            Sign in to continue your clinical workflow.
          </Text>

          {wakeSupported && !wakeDenied && (
            <View className="mb-5 flex-row items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
              <View className="relative size-2 items-center justify-center">
                {wakeListening && (
                  <View className="absolute size-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <View
                  className={`size-2 rounded-full ${wakeListening ? "bg-emerald-500" : "bg-slate-300"}`}
                />
              </View>
              <Mic size={14} color="#64748b" strokeWidth={2} />
              <Text className="text-xs text-slate-500">
                Say "Hey Doctor" to sign in by voice, hands-free
              </Text>
            </View>
          )}

          <View>
            <Text className="mb-1.5 text-xs font-semibold text-slate-700">
              Email address
            </Text>
            <View className="mb-4 flex-row items-center rounded-lg border border-slate-200 px-3">
              <Mail size={16} color="#94a3b8" />
              <TextInput
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                className="ml-2 flex-1 py-3 text-sm text-slate-900"
              />
            </View>

            <View className="flex-row items-center justify-between">
              <Text className="mb-1.5 text-xs font-semibold text-slate-700">
                Password
              </Text>
              <Link href="/forgot-password" asChild>
                <Pressable className="mb-1.5">
                  <Text className="text-xs font-semibold text-[#4ab96a]">
                    Forgot password?
                  </Text>
                </Pressable>
              </Link>
            </View>
            <View className="mb-1.5 flex-row items-center rounded-lg border border-slate-200 px-3">
              <Lock size={16} color="#94a3b8" />
              <TextInput
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                className="ml-2 flex-1 py-3 text-sm text-slate-900"
              />
            </View>

            {err && <Text className="mt-2 text-xs font-medium text-red-600">{err}</Text>}

            <Pressable
              onPress={submit}
              disabled={loading}
              className={`mt-5 items-center rounded-lg py-3 ${loading ? "bg-[#4ab96a]/50" : "bg-[#4ab96a]"}`}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-sm font-semibold text-white">Sign in</Text>
              )}
            </Pressable>
          </View>

          <View className="my-5 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-slate-200" />
            <Text className="text-[11px] font-semibold tracking-wide text-slate-400">
              DEMO ACCOUNTS
            </Text>
            <View className="h-px flex-1 bg-slate-200" />
          </View>

          <View className="gap-1.5">
            {DEMO_ACCOUNTS.map((d) => (
              <Pressable
                key={d.email}
                onPress={() => fillDemo(d.email)}
                className="flex-row items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <Text className="text-xs text-slate-700">{d.email}</Text>
                <View className={`rounded-full px-2 py-0.5 ${TONE_STYLES[d.tone].bg}`}>
                  <Text className={`text-[11px] font-semibold ${TONE_STYLES[d.tone].text}`}>
                    {d.role}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>

          <View className="mt-4 items-center">
            <Link href="/phone-sign-in" asChild>
              <Pressable>
                <Text className="text-xs font-semibold text-[#4ab96a]">
                  Sign in by phone call instead
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>

        <Text className="mt-5 text-center text-xs text-white/55">
          AI Healthcare+ - built to make every consultation clearer, for doctors
          and patients alike.
        </Text>
      </View>
    </View>
  );
}
