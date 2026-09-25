'use client';

import { useEffect, type ReactNode } from 'react';

const REVEAL_SELECTOR = '.motion-reveal:not(.is-revealed)';

export default function MotionRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('js');

    if (typeof IntersectionObserver === 'undefined') {
      document
        .querySelectorAll<HTMLElement>(REVEAL_SELECTOR)
        .forEach((el) => el.classList.add('is-revealed'));
      return;
    }

    const reveal = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    const scan = () => {
      document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((el) => reveal.observe(el));
    };

    scan();

    const mo = new MutationObserver(() => scan());
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      reveal.disconnect();
      mo.disconnect();
    };
  }, []);

  return <div className="motion-shell">{children}</div>;
}
