'use client';

import type { ReactNode } from 'react';
import styles from './InterestIntro.module.css';

export default function InterestIntro({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <section className={className} aria-label="My interests">
      {children}
    </section>
  );
}

export function InterestIntroTarget({
  children,
  active,
  instruction,
  step,
  className,
}: {
  children: ReactNode;
  active: boolean;
  instruction: string;
  step: number;
  className?: string;
}) {
  return (
    <span className={`${styles.target} ${className ?? ''}`} data-guide-active={active || undefined}>
      {children}
      {active && (
        <>
          <span className={styles.ink} aria-hidden="true">
            <svg className={styles.circle} viewBox="0 0 240 66" preserveAspectRatio="none">
              <path
                pathLength="1"
                d="M218 12 C184 1 77 0 29 9 C1 14 -1 43 20 54 C53 68 189 66 222 52 C247 41 239 16 214 9 C177 -1 66 3 25 14"
              />
            </svg>
            <svg className={styles.arrow} viewBox="0 0 76 48">
              <path pathLength="1" d="M5 6 C29 -1 31 29 63 31 M48 21 L64 31 L47 37" />
            </svg>
          </span>
          <span className={styles.instruction} role="status">
            <strong>Step {step} of 6</strong>
            {instruction}
          </span>
        </>
      )}
    </span>
  );
}
