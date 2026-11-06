import { useState } from 'react';
import { photoUrl } from '../lib/format';

interface Props {
  src: string | undefined;
  alt: string;
  className?: string;
}

/** Image with a neutral placeholder for listings without photos or broken files. */
export function Photo({ src, alt, className }: Props) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className={`photo-placeholder ${className ?? ''}`} role="img" aria-label="No photo">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path fill="currentColor" d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2ZM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5Z" />
        </svg>
        <span>No photo</span>
      </div>
    );
  }
  return <img className={className} src={photoUrl(src)} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
}
