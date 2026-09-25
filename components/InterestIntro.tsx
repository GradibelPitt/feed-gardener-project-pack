'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './InterestIntro.module.css';

const storageKey = 'feed-gardener:interest-intro:v1';
let seenThisSession = false;

function hasSeenIntro() {
  if (seenThisSession) return true;
  try {
    return window.localStorage.getItem(storageKey) === 'seen';
  } catch {
    return false;
  }
}

function rememberIntro() {
  seenThisSession = true;
  try {
    window.localStorage.setItem(storageKey, 'seen');
  } catch {
    // Storage can be unavailable; still show at most once in this session.
  }
}

/** A one-time, non-blocking cue. Mount only when the interests panel is shown. */
export default function InterestIntro({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const panel = useRef<HTMLElement>(null);
  const dismissed = useRef(false);
  const [active, setActive] = useState(false);

  function dismiss() {
    dismissed.current = true;
    rememberIntro();
    setActive(false);
  }

  useEffect(() => {
    if (hasSeenIntro() || !panel.current) return;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    let endTimer: ReturnType<typeof setTimeout> | undefined;
    let inView = false;
    let started = false;

    function schedule() {
      clearTimeout(startTimer);
      if (started || dismissed.current || !inView || document.hidden) return;
      startTimer = setTimeout(() => {
        if (dismissed.current || hasSeenIntro()) return;
        started = true;
        rememberIntro();
        setActive(true);
        endTimer = setTimeout(() => setActive(false), 4200);
      }, 450);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        schedule();
      },
      { threshold: 0.25 },
    );
    observer.observe(panel.current);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') dismiss();
    }
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      observer.disconnect();
      clearTimeout(startTimer);
      clearTimeout(endTimer);
      document.removeEventListener('visibilitychange', schedule);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <section
      ref={panel}
      className={`${className} ${styles.panel}`}
      aria-label="My interests"
      data-interest-intro={active ? 'active' : undefined}
      onPointerDownCapture={dismiss}
      onFocusCapture={dismiss}
    >
      {children}
    </section>
  );
}

export function InterestIntroTarget({ children }: { children: ReactNode }) {
  return (
    <span className={styles.target}>
      {children}
      <span className={styles.ink} aria-hidden="true">
        <svg className={styles.circle} viewBox="0 0 240 66" preserveAspectRatio="none">
          <path
            pathLength="1"
            d="M218 12 C184 1 77 0 29 9 C1 14 -1 43 20 54 C53 68 189 66 222 52 C247 41 239 16 214 9 C177 -1 66 3 25 14"
          />
        </svg>
        <svg className={styles.arrow} viewBox="0 0 76 48">
          <path
            className={styles.desktopArrow}
            pathLength="1"
            d="M5 6 C29 -1 31 29 63 31 M48 21 L64 31 L47 37"
          />
          <path
            className={styles.mobileArrow}
            pathLength="1"
            d="M68 36 C38 48 37 13 8 18 M20 8 L7 18 L20 27"
          />
        </svg>
      </span>
    </span>
  );
}
