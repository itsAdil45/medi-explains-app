import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ChevronRight } from "lucide-react-native";
import { ONBOARDING_SEEN_KEY } from "@/constants/onboarding";

const SLIDES = [
  {
    image: require("@/assets/images/onboarding/ob-1.png"),
    title: "Every word, understood",
    body: "Your consultation is transcribed and translated into your own language, so nothing gets lost along the way.",
  },
  {
    image: require("@/assets/images/onboarding/ob-2.png"),
    title: 'Just say "Hey Doctor"',
    body: "Sign in and ask questions hands-free - built for patients who are blind or have low vision.",
  },
  {
    image: require("@/assets/images/onboarding/ob-3.png"),
    title: "Never miss a dose",
    body: "Medication reminders that speak each instruction aloud, right when it's time to take it.",
  },
] as const;

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  async function finish(destination: "/" | "/login") {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "true").catch(() => {});
    router.replace(destination);
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  }

  function goNext() {
    if (isLast) {
      finish("/login");
      return;
    }
    scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
  }

  return (
    <View className="flex-1">
      <LinearGradient
        colors={["#792884", "#4ab96a", "#792884"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {!isLast && (
        <Pressable
          onPress={() => finish("/")}
          style={{ position: "absolute", top: insets.top + 12, right: 20, zIndex: 10 }}
          className="rounded-full bg-white/15 px-4 py-2"
        >
          <Text className="text-sm font-semibold text-white">Skip</Text>
        </Pressable>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={{ width }} className="flex-1 items-center justify-center px-8">
            <View className="mb-8 aspect-square w-full max-w-[300px] items-center justify-center rounded-[32px] bg-white p-6 shadow-xl">
              <Image source={slide.image} style={{ width: "100%", height: "100%" }} contentFit="contain" />
            </View>
            <Text className="mb-3 text-center text-2xl font-bold text-white">{slide.title}</Text>
            <Text className="text-center text-[15px] leading-6 text-white/85">{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom + 24 }} className="px-8 pt-2">
        <View className="mb-5 flex-row items-center justify-center gap-2">
          {SLIDES.map((slide, i) => (
            <View
              key={slide.title}
              className={`rounded-full ${i === index ? "h-2 w-6 bg-white" : "h-2 w-2 bg-white/40"}`}
            />
          ))}
        </View>

        <Pressable
          onPress={goNext}
          className="flex-row items-center justify-center gap-1.5 rounded-lg bg-white py-3.5"
        >
          <Text className="text-sm font-bold text-[#792884]">{isLast ? "Get started" : "Next"}</Text>
          {!isLast && <ChevronRight size={16} color="#792884" />}
        </Pressable>

        {isLast && (
          <Pressable onPress={() => finish("/")} className="mt-3 items-center py-2">
            <Text className="text-xs font-semibold text-white/80">I'll explore on my own first</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
