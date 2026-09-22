import { View, Text, ScrollView, Pressable } from "react-native";
import { Link, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  Mic,
  Languages,
  ShieldCheck,
  Users,
  ClipboardList,
  FileText,
  Eye,
  ArrowRight,
} from "lucide-react-native";
import HomeNav from "../components/HomeNav";
// import Footer from "../components/Footer";
import ContactSection from "../components/ContactSection";

const CAPABILITIES = [
  {
    icon: Languages,
    title: "Multilingual consultations",
    body: "Records a visit in Urdu, Punjabi, Pashto, Sindhi or Nepali and gives the patient their summary back in their own language - not just English",
  },
  {
    icon: ShieldCheck,
    title: "AI drafting, doctor approval",
    body: "GPT-based structuring drafts the clinical note and medication list; an NLI grounding check flags anything not actually said before a doctor signs off.",
  },
  {
    icon: Mic,
    title: "Hands-free accessibility",
    body: 'Blind and low-vision patients sign in and ask about their visit by voice alone - say "Hey Doctor," no screen, no tapping required.',
  },
  {
    icon: Users,
    title: "Front-desk intake & queue",
    body: "Receptionists register patients and manage a live token queue, so walk-ins are tracked from arrival to being called in.",
  },
  {
    icon: FileText,
    title: "Reports & billing",
    body: "Patients upload doctor-requested lab reports for OCR review, and every visit closes with a clean, printable bill.",
  },
  {
    icon: ClipboardList,
    title: "Cross-check safety net",
    body: "A second reviewing doctor can be looped in on any consultation before it is released to the patient.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Record the visit",
    body: "The consultation is recorded and transcribed, whatever language it happens in.",
  },
  {
    n: "02",
    title: "AI structures it",
    body: "Symptoms, diagnosis and medications are extracted and checked against the transcript for grounding.",
  },
  {
    n: "03",
    title: "Doctor reviews & releases",
    body: "The doctor edits and approves; the patient gets a plain-language summary, spoken aloud if needed.",
  },
];

// Bundle the hero video as a local asset. Swap the require() for a remote
// URL string (e.g. "https://.../hero-bg.mp4") if you'd rather host it.
const heroSource = require("../../assets/hero-bg.mp4");

export default function Home() {
  const router = useRouter();

  const player = useVideoPlayer(heroSource, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <ScrollView className="flex-1 bg-white">
      <HomeNav />

      <VideoView
        player={player}
        style={{ width: "100%", height: 450 }}
        contentFit="cover"
        nativeControls={false}
      />

      <View className="mt-6 flex-row flex-wrap items-center justify-center gap-3">
        <Pressable
          onPress={() => router.push("/login")}
          className="flex-row items-center gap-2 rounded-lg bg-[#4ab96a] px-6 py-3"
        >
          <Text className="text-sm font-semibold text-white">Sign in</Text>
          <ArrowRight size={16} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => router.push("/phone-sign-in")}
          className="rounded-lg bg-slate-100 px-6 py-3"
        >
          <Text className="text-sm font-semibold text-slate-700">
            Sign in by phone call
          </Text>
        </Pressable>
      </View>

      {/* What it does */}
      <View className="mx-auto w-full max-w-[1080px] px-6 py-16">
        <View className="mb-10 items-center">
          <Text className="mb-2 text-center text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            What it does
          </Text>
          <Text className="text-center text-sm text-slate-500">
            Built around one visit's real lifecycle, from the front desk to the
            patient's follow-up.
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-5">
          {CAPABILITIES.map(({ icon: Icon, title, body }) => (
            <View
              key={title}
              className="w-full rounded-xl border border-slate-200 p-5 sm:w-[47%] lg:w-[31%]"
            >
              <View className="mb-3 flex size-9 items-center justify-center rounded-lg bg-[#4ab96a]/10">
                <Icon size={18} color="#4ab96a" strokeWidth={2} />
              </View>
              <Text className="mb-1.5 text-sm font-semibold text-slate-900">
                {title}
              </Text>
              <Text className="text-[13px] leading-relaxed text-slate-500">
                {body}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* How a visit flows through it */}
      <View className="bg-slate-50 px-6 py-16">
        <View className="mx-auto w-full max-w-[900px]">
          <View className="mb-10 items-center">
            <Text className="text-center text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              How a visit flows through it
            </Text>
          </View>

          <View className="flex-row flex-wrap gap-6">
            {STEPS.map(({ n, title, body }) => (
              <View key={n} className="w-full sm:w-[30%]">
                <Text className="mb-3 text-2xl font-bold text-[#4ab96a]">
                  {n}
                </Text>
                <Text className="mb-1.5 text-sm font-semibold text-slate-900">
                  {title}
                </Text>
                <Text className="text-[13px] leading-relaxed text-slate-500">
                  {body}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Accessibility CTA */}
      <View className="mx-auto w-full max-w-[900px] px-6 py-16">
        <View className="flex-col items-center gap-3 rounded-2xl bg-[#792884] px-8 py-10 sm:flex-row sm:justify-between">
          <View className="flex-row items-center gap-3">
            <Eye size={22} color="#4ab96a" strokeWidth={2} />
            <Text className="max-w-[440px] text-center text-sm text-white sm:text-left">
              Built for accessibility from the ground up - blind and low-vision
              patients can sign in and use the whole app by voice, no screen
              required.
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/login")}
            className="rounded-lg bg-[#4ab96a] px-6 py-3"
          >
            <Text className="text-sm font-semibold text-white">Try it now</Text>
          </Pressable>
        </View>
      </View>

      <Text className="mx-auto mb-2 text-center text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
        Contact Us
      </Text>
      <ContactSection />

      {/* <Footer /> */}
    </ScrollView>
  );
}
