export type Locale = 'en' | 'zh';
export type LocalePreference = 'system' | Locale;

// The interface is temporarily English-only. Keep the locale helpers and Chinese
// strings intact so the selector can be restored without recreating translations.
export const visibleInterfaceLocale: Locale = 'en';

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === 'system' || value === 'en' || value === 'zh';
}

export function localeFromLanguages(languages: readonly string[] | undefined): Locale {
  const primaryLanguage = languages?.find((language) => language.trim().length > 0) ?? 'en';
  return /^zh(?:-|$)/i.test(primaryLanguage) ? 'zh' : 'en';
}

export function resolveLocale(
  preference: LocalePreference,
  languages: readonly string[] | undefined,
): Locale {
  return preference === 'system' ? localeFromLanguages(languages) : preference;
}
