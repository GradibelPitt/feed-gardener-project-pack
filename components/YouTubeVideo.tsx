'use client';

import { useState } from 'react';
import type { HarvestItem } from '@/lib/crawler/types';
import './youtube-video.css';

export default function YouTubeVideo({ item }: { item: HarvestItem }) {
  const [playing, setPlaying] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  if (playing && item.embedUrl) {
    return (
      <iframe
        className="youtube-video"
        src={item.embedUrl}
        title={`YouTube: ${item.title}`}
        loading="lazy"
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }

  const preview = (
    <>
      {item.imageUrl && !imageFailed ? (
        <img src={item.imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} />
      ) : (
        <span className="youtube-video-fallback">YouTube</span>
      )}
      <span className="youtube-video-play" aria-hidden="true">
        ▶
      </span>
    </>
  );

  return item.embedUrl ? (
    <button
      className="youtube-video youtube-video-preview"
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play ${item.title}`}
    >
      {preview}
    </button>
  ) : (
    <a
      className="youtube-video youtube-video-preview"
      href={item.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${item.title} on YouTube`}
    >
      {preview}
    </a>
  );
}
