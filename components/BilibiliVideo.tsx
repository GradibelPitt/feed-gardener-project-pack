'use client';

import { useState } from 'react';
import type { HarvestItem } from '@/lib/crawler/types';
import './youtube-video.css';

export default function BilibiliVideo({
  item,
}: {
  item: Pick<HarvestItem, 'title' | 'url' | 'imageUrl' | 'embedUrl'>;
}) {
  const [playing, setPlaying] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const validEmbed =
    /^https:\/\/player\.bilibili\.com\/player\.html\?bvid=BV[0-9A-Za-z]{10}&autoplay=0$/.test(
      item.embedUrl ?? '',
    );

  if (playing && validEmbed) {
    return (
      <iframe
        className="youtube-video"
        src={item.embedUrl}
        title={`Bilibili: ${item.title}`}
        loading="lazy"
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }

  const preview = (
    <>
      {item.imageUrl && !imageFailed ? (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="youtube-video-fallback">Bilibili</span>
      )}
      <span className="youtube-video-play" aria-hidden="true">
        ▶
      </span>
    </>
  );

  return validEmbed ? (
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
      aria-label={`Open ${item.title} on Bilibili`}
    >
      {preview}
    </a>
  );
}
