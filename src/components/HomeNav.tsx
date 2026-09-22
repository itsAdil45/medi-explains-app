import { View, Text, Image, Pressable, Linking } from "react-native";
import { Link } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import { Stethoscope, Mic } from "lucide-react-native";
import { useWakePhraseSignIn } from "../hooks/useWakePhraseSignIn";

export default function HomeNav() {
  const {
    supported: wakeSupported,
    listening: wakeListening,
    denied: wakeDenied,
  } = useWakePhraseSignIn();

  return (
    <View className="relative overflow-hidden px-6 pt-4">
      {/* RN has no radial-gradient, so a linear gradient top-left -> bottom-right
          stands in for the web version's radial wash */}
      <LinearGradient
        colors={[
          "rgba(121,40,132,0.75)",
          "rgba(121,40,132,0.95)",
          "rgba(121,40,132,0.85)",
        ]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      {/* <Svg
        className="pointer-events-none absolute -right-36 -top-36 z-10 opacity-20"
        width={640}
        height={640}
        viewBox="0 0 640 640"
        fill="none"
      >
        <Circle cx={320} cy={320} r={300} stroke="#4ab96a" strokeWidth={4.5} />
        <Circle cx={320} cy={320} r={220} stroke="#4ab96a" strokeWidth={4.5} />
      </Svg> */}

      <View className="relative z-10 my-4 flex-col items-center gap-[45px] md:flex-row md:justify-between md:gap-0">
        <Pressable
          onPress={() => Linking.openURL("https://vibrantlogics.com")}
          className="z-10 self-center rounded bg-white/95 px-2 py-1 shadow-sm md:self-start"
        >
          <Image
            source={require("../../assets/vibrant-logics.webp")}
            style={{ height: 64, width: 150 }}
            resizeMode="contain"
          />
        </Pressable>

        <View className="z-10 items-center self-center">
          <View className="flex-row items-center gap-2.5">
            <View className="flex size-9 items-center justify-center rounded-lg bg-[#4ab96a]">
              <Stethoscope size={18} color="#fff" strokeWidth={2} />
            </View>
            <Link href="/" asChild>
              <Pressable>
                <Text className="text-3xl font-semibold tracking-tight text-white">
                  AI Healthcare<Text className="text-[#4ab96a]">+</Text>
                </Text>
              </Pressable>
            </Link>
          </View>

          {wakeSupported && !wakeDenied && (
            <View className="mt-6 w-fit flex-row items-center gap-2 self-center rounded-lg bg-white/10 px-3 py-2">
              <View className="relative size-2 items-center justify-center">
                {wakeListening && (
                  <View className="absolute size-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <View
                  className={`size-2 rounded-full ${wakeListening ? "bg-emerald-500" : "bg-white/30"}`}
                />
              </View>
              <Mic size={14} color="rgba(255,255,255,0.7)" strokeWidth={2} />
              <Text className="text-xs text-white/70">
                Say "Hey Doctor" to sign in by voice, hands-free
              </Text>
            </View>
          )}
        </View>

        {/* empty spacer to balance the logo's width on md+ so the center column stays centered */}
        <View className="hidden md:block md:w-[150px]" />
      </View>
    </View>
  );
}
