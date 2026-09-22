import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isLocalePreference,
  localeFromLanguages,
  resolveLocale,
  visibleInterfaceLocale,
} from './locale.ts';

test('ships the temporarily English-only interface while retaining locale support', () => {
  assert.equal(visibleInterfaceLocale, 'en');
});

test('uses Chinese only when the primary system language is Chinese', () => {
  assert.equal(localeFromLanguages(['zh-CN', 'en-US']), 'zh');
  assert.equal(localeFromLanguages(['zh-Hant-TW']), 'zh');
  assert.equal(localeFromLanguages(['en-US', 'zh-CN']), 'en');
  assert.equal(localeFromLanguages(['ja-JP']), 'en');
  assert.equal(localeFromLanguages(undefined), 'en');
});

test('explicit language settings override the system language', () => {
  assert.equal(resolveLocale('en', ['zh-CN']), 'en');
  assert.equal(resolveLocale('zh', ['en-US']), 'zh');
  assert.equal(resolveLocale('system', ['zh-CN']), 'zh');
  assert.equal(resolveLocale('system', ['fr-FR']), 'en');
});

test('accepts only supported language settings', () => {
  assert.equal(isLocalePreference('system'), true);
  assert.equal(isLocalePreference('en'), true);
  assert.equal(isLocalePreference('zh'), true);
  assert.equal(isLocalePreference('fr'), false);
  assert.equal(isLocalePreference(null), false);
});
