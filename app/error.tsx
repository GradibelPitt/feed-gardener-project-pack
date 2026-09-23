'use client';

import styles from './error.module.css';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.screen}>
      <section className={styles.card} role="alert">
        <span className={styles.eyebrow}>Feeder</span>
        <h1>Something went wrong</h1>
        <p>Your saved items remain on this device. Try loading the page again.</p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
