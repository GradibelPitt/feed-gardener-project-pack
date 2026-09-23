'use client';

import Link from 'next/link';
import { type Locale, visibleInterfaceLocale } from '@/lib/locale';

export default function InstructionsPage() {
  const locale: Locale = visibleInterfaceLocale;
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  return (
    <main className="instructions-page">
      <header>
        <Link href="/">← {t('返回', 'Back')}</Link>
        <span>FEEDER</span>
      </header>
      <section>
        <p className="instructions-kicker">{t('使用说明', 'INSTRUCTIONS')}</p>
        <h1>{t('从兴趣开始。', 'Start with your interests.')}</h1>

        <ol>
          <li>
            <strong>{t('设置兴趣', 'Set interests')}</strong>
            <span>
              {t(
                '选择领域、主题、探索比例和屏蔽项。',
                'Choose domains, topics, exploration, and exclusions.',
              )}
            </span>
          </li>
          <li>
            <strong>{t('发现内容', 'Discover')}</strong>
            <span>
              {t(
                '选择 1–10 的 Jev 目标均分，查看逐批模拟的 Feed 和公开来源板块。',
                'Choose a Jev target average from 1–10, then explore the iterated feed and public-source boards.',
              )}
            </span>
          </li>
          <li>
            <strong>{t('保存与反馈', 'Save and give feedback')}</strong>
            <span>
              {t(
                '打开原文、稍后读、隐藏或标记不感兴趣。',
                'Open a source, save for later, hide, or mark not interested.',
              )}
            </span>
          </li>
          <li>
            <strong>{t('调整兴趣权重', 'Tune your interests')}</strong>
            <span>
              {t(
                '在 My garden 调整标签 JEV；它只影响 Feeder，不改变平台推荐。',
                'Adjust tag JEV in My garden. It shapes Feeder only, not source-platform recommendations.',
              )}
            </span>
          </li>
        </ol>

        <aside>
          <strong>{t('当前范围', 'Current scope')}</strong>
          <p>
            {t(
              '当前使用公开候选与手动导入链接；在 Discover → Sources → YouTube 输入 Data API key 后才可搜索。key 仅在本机服务内存中保存至重启。YouTube 嵌入展示与 Jev 均分分开。反馈只更新 Feeder 本地兴趣。',
              'Current candidates come from public sources and manually imported links. Enter a Data API key in Discover → Sources → YouTube to enable search. The local server keeps it in memory until restart. YouTube embeds stay outside the Jev average. Feedback updates Feeder locally.',
            )}
          </p>
        </aside>
        <section id="youtube-privacy">
          <h2>YouTube connection & privacy</h2>
          <p>
            Use Connect to YouTube in Connections & privacy. Google handles sign-in. This app
            requests read access to your YouTube account and uses it to identify your channel;
            connecting does not like, dislike, or play videos.
          </p>
          <p>
            The local server holds the access token and channel ID/name in memory for up to one
            hour, or until you disconnect or restart the server. Your browser receives only an
            opaque HttpOnly session cookie. Platform credentials are not written to disk, included
            in exports, logged, or sent to Jev. We do not request a refresh token. Your existing
            preferences and saved resources remain in browser storage.
          </p>
          <p>
            Disconnect YouTube removes this app’s session and requests Google token revocation. If
            Google cannot be reached, remove access in{' '}
            <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">
              your Google account
            </a>
            . Expiry or a server restart removes local access but does not itself revoke Google’s
            grant.
          </p>
          <p>
            This local development app uses YouTube API Services. By connecting, you agree to{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
              YouTube’s Terms of Service
            </a>
            . Google’s handling of data is described in the{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
              Google Privacy Policy
            </a>
            . Contact the operator who runs this local app for data or connection questions; a
            public deployment needs its own operator contact and privacy review.
          </p>
        </section>
      </section>
    </main>
  );
}
