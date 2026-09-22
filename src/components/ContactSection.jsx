import { Phone, Mail } from "lucide-react-native";
import { View, Text, TextInput, ScrollView, Pressable } from "react-native";

function ContactSection() {
  const infoItems = [
    {
      title: "To Know More",
      Icon: Phone,
      lines: ["+1 934 203 2603"],
    },
    {
      title: "Email Now",
      Icon: Mail,
      lines: ["info@vibrantlogics.com"],
    },
  ];

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-4 py-5"
      keyboardShouldPersistTaps="handled"
    >
      <View className="mx-auto w-full max-w-5xl gap-6">
        {/* Left: Info Cards */}
        <View className="w-full gap-8 md:flex-row">
          <View className="w-full gap-8 md:w-1/2">
            {infoItems.map(({ title, Icon, lines }) => (
              <View key={title} className="relative pt-4">
                {/* Card title */}
                <Text className="absolute left-6 top-0 z-10 bg-white px-1 text-sm font-semibold text-[#792884]">
                  {title}
                </Text>

                {/* Card */}
                <View className="flex-row items-center gap-4 rounded-xl border border-gray-200 p-5 pt-6">
                  {/* Icon */}
                  <View className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#4ab96a]">
                    <Icon size={20} color="#ffffff" strokeWidth={2} />
                  </View>

                  {/* Text */}
                  <View className="flex-1">
                    {lines.map((line) => (
                      <Text
                        key={line}
                        className="text-base font-semibold leading-6 text-[#792884]"
                      >
                        {line}
                      </Text>
                    ))}
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Right: Contact Form */}
          <View className="w-full rounded-2xl border border-[#4ab96a]/20 bg-[#4ab96a]/5 p-6 md:w-1/2 md:p-8">
            {/* Name */}
            <View className="mb-5">
              <Text className="mb-2 text-sm font-semibold text-gray-800">
                Name<Text className="text-[#4ab96a]">*</Text>
              </Text>

              <TextInput
                placeholder="Daniel Scoot"
                placeholderTextColor="#9ca3af"
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600"
              />
            </View>

            {/* Phone + Email */}
            <View className="gap-5 md:flex-row">
              {/* Phone */}
              <View className="flex-1">
                <Text className="mb-2 text-sm font-semibold text-gray-800">
                  Phone
                </Text>

                <TextInput
                  placeholder="+8801700000000"
                  placeholderTextColor="#9ca3af"
                  keyboardType="phone-pad"
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600"
                />
              </View>

              {/* Email */}
              <View className="flex-1">
                <Text className="mb-2 text-sm font-semibold text-gray-800">
                  Email
                </Text>

                <TextInput
                  placeholder="info@primejapan.com"
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600"
                />
              </View>
            </View>

            {/* Address */}
            <View className="mt-5">
              <Text className="mb-2 text-sm font-semibold text-gray-800">
                Address
              </Text>

              <TextInput
                placeholder="168/170, Avenue 01, Old York Drive Rich Mirpur DOHS, Bangladesh"
                placeholderTextColor="#9ca3af"
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600"
              />
            </View>

            {/* Message */}
            <View className="mt-5">
              <Text className="mb-2 text-sm font-semibold text-gray-800">
                Write Your Message
                <Text className="text-[#4ab96a]">*</Text>
              </Text>

              <TextInput
                placeholder="What's on your mind"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                className="min-h-[110px] w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600"
              />
            </View>

            {/* Submit */}
            <Pressable
              onPress={() => {
                // Handle form submission here
              }}
              className="mt-6 self-start rounded-lg bg-[#4ab96a] px-8 py-3 active:bg-[#3fa25b]"
            >
              <Text className="text-sm font-semibold text-white">
                Submit Now
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

export default ContactSection;
