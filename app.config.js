// Everything static lives in app.json; this only adds what depends on the
// environment.
//
// Android 9+ release builds refuse plain-http requests unless the app opts
// in. A dev machine on the LAN (EXPO_PUBLIC_API_URL=http://192.168...) needs
// that opt-in for a preview/release APK to reach it - debug builds already
// allow it - while a build pointed at an https API keeps Android's block.
module.exports = ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || "";
  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      ["expo-build-properties", { android: { usesCleartextTraffic: apiUrl.startsWith("http://") } }],
    ],
  };
};
