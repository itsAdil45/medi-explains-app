// Language plumbing shared by every voice surface: the "Hey Doctor"
// sign-in (useWakePhraseSignIn, phone-sign-in), the post-login assistant
// (VoiceAssistant) and queue call-outs (QueueWidget). Ported from the
// website's src/voice/voiceLang.js - keep the two in step.
import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Before login there's no profile to read the patient's language from, so
// the device remembers the last patient language seen here (auth.tsx sets
// it on sign-in) - a returning patient hears their own language from the
// first "Hey Doctor", and the sign-in screens offer a picker for everyone
// else. AsyncStorage is async, so the value is mirrored in memory for the
// synchronous getter once loaded.
const AS_KEY = 'mxp_voice_lang'
let deviceLang: string | null = null
let deviceLangLoad: Promise<string> | null = null

export function loadDeviceVoiceLang(): Promise<string> {
  if (!deviceLangLoad) {
    deviceLangLoad = AsyncStorage.getItem(AS_KEY)
      .then((v) => (deviceLang ??= v || 'en'))
      .catch(() => (deviceLang ??= 'en'))
  }
  return deviceLangLoad
}

export function getDeviceVoiceLang() {
  return deviceLang || 'en'
}

export function setDeviceVoiceLang(lang: string | null | undefined) {
  if (!lang) return
  deviceLang = lang
  AsyncStorage.setItem(AS_KEY, lang).catch(() => {})
}

// Pre-login voice language: the device's remembered patient language,
// changeable from the sign-in screens.
export function useDeviceVoiceLang(): [string, (lang: string) => void] {
  const [lang, setLang] = useState(getDeviceVoiceLang)
  useEffect(() => {
    let live = true
    loadDeviceVoiceLang().then((l) => live && setLang(l))
    return () => { live = false }
  }, [])
  function change(next: string) {
    setDeviceVoiceLang(next)
    setLang(next)
  }
  return [lang, change]
}

const RTL = new Set(['ur', 'ar', 'pa_shah', 'ps', 'sd'])
export const isRtl = (lang: string) => RTL.has(lang)

// Speech recognizer locales to try, best first. Neither platform covers
// every language here: no Shahmukhi Punjabi at all (ur-PK is the closest
// match and keeps output in Arabic script), and Pashto/Sindhi support
// varies by device - so each falls back toward Urdu, which their speakers
// in Pakistan are commonly fluent in, then English.
const RECOGNITION_LOCALES: Record<string, string[]> = {
  en: ['en-US'],
  ur: ['ur-PK', 'en-US'],
  pa_shah: ['ur-PK', 'en-US'],
  ps: ['ps-AF', 'ur-PK', 'en-US'],
  sd: ['sd-IN', 'ur-PK', 'en-US'],
  ar: ['ar-SA', 'en-US'],
  ne: ['ne-NP', 'en-US'],
}
const unsupportedLocales = new Set<string>()

export function recognitionLocale(lang: string) {
  const chain = RECOGNITION_LOCALES[lang] || RECOGNITION_LOCALES.en
  return chain.find((l) => !unsupportedLocales.has(l)) || 'en-US'
}

// Locales to listen for a spoken *number* in, one per attempt, cycling.
// English comes first whatever the patient's language: in Pakistan a phone
// number or code is usually read out in English digits ("zero three zero
// four..."), which the Urdu recognizer mangles - while the patient's own
// recognizer is still tried next for someone counting in their language.
// South Asian patients get Indian English rather than US English: it
// follows their accent far better, and Urdu/Punjabi digits said in the
// same breath ("zero teen zero chaar") come back romanised, which
// DIGIT_WORDS below reads - en-US mostly drops them.
const SOUTH_ASIAN = new Set(['ur', 'pa_shah', 'ps', 'sd', 'ne'])
export function digitRecognitionLocales(lang: string) {
  const native = recognitionLocale(lang)
  const english = SOUTH_ASIAN.has(lang) && !unsupportedLocales.has('en-IN') ? 'en-IN' : 'en-US'
  return native === 'en-US' ? [english] : [english, native]
}

// Called on a recognizer 'language-not-supported' error; the next
// recognitionLocale() / digitRecognitionLocales() call moves down the
// chain. Returns false once there's nothing left to fall back to, so
// callers don't restart forever.
export function markLocaleUnsupported(locale: string) {
  if (locale === 'en-US') return false
  unsupportedLocales.add(locale)
  return true
}

const ARABIC_FOLD: Record<string, string> = {
  'ي': 'ی', 'ى': 'ی', 'ې': 'ی', 'ك': 'ک', 'ڪ': 'ک',
  'ة': 'ه', 'ہ': 'ه', 'ە': 'ه', 'ۀ': 'ه', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا',
}
function fold(text: string | null | undefined) {
  return (text || '')
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, '')
    .replace(/[يىېكڪةہەۀأإآ]/g, (c) => ARABIC_FOLD[c])
}

// Forgiving on purpose - a blind/low-vision patient shouldn't need to hit
// one exact phrase. Every language's forms are always checked: the
// recognizer emits a single script, and English "Hey Doctor" stays valid
// whatever the patient's language.
const WAKE_PHRASES = [
  'hey doctor', 'hey doc', 'ok doctor', 'okay doctor', 'hello doctor', 'hey assistant',
  // Urdu / Shahmukhi Punjabi (and the Urdu fallback recognizer for Pashto/Sindhi)
  'ہے ڈاکٹر', 'ہائے ڈاکٹر', 'ہیلو ڈاکٹر', 'اے ڈاکٹر', 'او ڈاکٹر', 'اوکے ڈاکٹر', 'ڈاکٹر صاحب',
  // Pashto
  'هې ډاکټر', 'اې ډاکټر', 'سلام ډاکټر', 'ډاکټر صاحب',
  // Sindhi
  'هي ڊاڪٽر', 'اي ڊاڪٽر', 'ڊاڪٽر صاحب',
  // Arabic
  'يا دكتور', 'مرحبا دكتور', 'هاي دكتور', 'اهلا دكتور', 'يا طبيب',
  // Nepali
  'हे डाक्टर', 'हे डॉक्टर', 'हेलो डाक्टर', 'ए डाक्टर', 'नमस्ते डाक्टर', 'ओके डाक्टर',
].map(fold)

export function containsWakePhrase(text: string) {
  const t = fold(text)
  return WAKE_PHRASES.some((p) => t.includes(p))
}

// Native-script numerals - Arabic-Indic, Extended (Urdu/Persian),
// Devanagari, Gurmukhi - mapped to ASCII.
const NUMERAL_BASES = [0x0660, 0x06f0, 0x0966, 0x0a66]
function asciiDigits(text: string) {
  return text.replace(/[٠-٩۰-۹०-९੦-੯]/g, (c) => {
    const code = c.charCodeAt(0)
    const base = NUMERAL_BASES.find((b) => code >= b && code <= b + 9) ?? code
    return String(code - base)
  })
}

// Spoken digit words. The recognizer sometimes returns numerals ("123456")
// and sometimes words ("one two three...") depending on cadence - both
// forms, in every supported language, have to fill the field correctly.
// Each digit also lists the *English* number words as an Urdu-script
// recognizer writes them ("تھری", "فائیو") - in Pakistan a phone number is
// usually read out in English digits, and the ur-PK recognizer (also used
// for Shahmukhi, Pashto and Sindhi) transliterates rather than translates.
// And the reverse: Urdu/Punjabi/Hindi digits as the *English* recognizer
// romanises them ("teen", "chaar", "panj") - it hears a patient counting
// in their own language as Hinglish, not as English numbers.
const DIGIT_WORDS: Record<number, string[]> = {
  0: ['zero', 'oh', 'sifar', 'sifr', 'siffar', 'shunya', 'صفر', 'زیرو', 'زیرہ', 'سفر', 'ٻڙي', 'शून्य', 'सुन्ना', 'ਸਿਫ਼ਰ', 'ਸਿਫਰ', 'ਜ਼ੀਰੋ'],
  1: ['one', 'won', 'ek', 'aik', 'ik', 'ikk', 'ایک', 'اک', 'یو', 'ون', 'وَن', 'وان', 'هڪ', 'واحد', 'एक', 'ਇੱਕ', 'ਇਕ', 'ਵਨ'],
  2: ['two', 'to', 'too', 'do', 'doh', 'دو', 'دوه', 'ٹو', 'ٹُو', 'ٻه', 'اثنان', 'اثنين', 'दुई', 'ਦੋ', 'ਟੂ'],
  3: ['three', 'tree', 'teen', 'tin', 'tinn', 'تین', 'تن', 'ترے', 'تھری', 'تری', 'ٹری', 'درې', 'دری', 'ٽي', 'ثلاثه', 'तीन', 'ਤਿੰਨ', 'ਥ੍ਰੀ'],
  4: ['four', 'for', 'char', 'chaar', 'چار', 'فور', 'څلور', 'اربعه', 'चार', 'ਚਾਰ', 'ਫੋਰ'],
  5: ['five', 'panch', 'paanch', 'panj', 'paanj', 'پانچ', 'پنج', 'فائیو', 'فائو', 'فایو', 'فائیوو', 'پنځه', 'خمسه', 'पाँच', 'पांच', 'ਪੰਜ', 'ਫਾਈਵ'],
  6: ['six', 'chhe', 'chhey', 'chhah', 'che', 'chay', 'chhay', 'چھ', 'چھے', 'چھه', 'سکس', 'سیکس', 'شپږ', 'ڇهه', 'ڇه', 'سته', 'छ', 'ਛੇ', 'ਸਿਕਸ'],
  7: ['seven', 'saat', 'sat', 'satt', 'سات', 'ست', 'سیون', 'سیوین', 'سیوِن', 'اوه', 'سبعه', 'सात', 'ਸੱਤ', 'ਸਤ', 'ਸੈਵਨ'],
  8: ['eight', 'ate', 'aath', 'aat', 'ath', 'atth', 'آٹھ', 'اٹھ', 'ایٹ', 'ایٹھ', 'اته', 'اٺ', 'ثمانیه', 'आठ', 'ਅੱਠ', 'ਅਠ', 'ਏਟ'],
  9: ['nine', 'nau', 'nao', 'nou', 'نو', 'نوں', 'نائن', 'ناین', 'نائین', 'نهه', 'تسعه', 'नौ', 'ਨੌਂ', 'ਨੌ', 'ਨਾਈਨ'],
}
const WORD_TO_DIGIT = new Map<string, string>()
for (const [digit, words] of Object.entries(DIGIT_WORDS)) {
  for (const w of words) WORD_TO_DIGIT.set(fold(w), digit)
}

// "zero three double zero..." - how numbers are commonly read out.
const REPEAT_WORDS = new Map<string, number>(
  ([
    ['double', 2], ['ڈبل', 2], ['ਡਬਲ', 2], ['डबल', 2], ['triple', 3], ['ٹرپل', 3], ['ਟ੍ਰਿਪਲ', 3], ['ट्रिपल', 3],
  ] as [string, number][]).map(([w, n]) => [fold(w), n] as [string, number]),
)

export function extractDigits(transcript: string) {
  const words = asciiDigits(fold(transcript))
    .replace(/[.,،۔?؟!:;"'()\-–—+]/g, ' ')
    .split(/\s+/)
  let digits = ''
  let repeat = 1
  for (const w of words) {
    if (REPEAT_WORDS.has(w)) {
      repeat = REPEAT_WORDS.get(w) ?? 1
      continue
    }
    let d: string | null = null
    if (/^\d+$/.test(w)) d = w
    else if (WORD_TO_DIGIT.has(w)) d = WORD_TO_DIGIT.get(w) ?? null
    if (d !== null) {
      // "double 3" repeats one digit, not a whole group like "double 300".
      digits += d.length === 1 ? d.repeat(repeat) : d
    }
    repeat = 1
  }
  return digits
}
