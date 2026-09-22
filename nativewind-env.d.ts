/// <reference types="react-native-css/types" />

// react-native-css/types only extends React Native's component props
// (className, etc.) — it doesn't shim CSS imports, so a plain
// `import "./global.css"` is otherwise an unresolved module to
// TypeScript. Per the Nativewind v5 docs' own troubleshooting note.
declare module "*.css";
