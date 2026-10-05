import { useEffect, useState } from 'react';
import { portraits } from '../api/runtime';
import { Portrait } from '../design/people';
import type { PortraitInfo } from '../api/portrait-index';
export function CachedPortrait({
  name,
  slug,
  size = 'row',
  testID,
  onCredit,
  retryKey = 0,
}: {
  name: string;
  slug?: string;
  size?: 'row' | 'profile';
  testID?: string;
  onCredit?: (info: PortraitInfo | null) => void;
  retryKey?: number;
}) {
  const [saved, setSaved] = useState<{
    localURI: string;
    info: PortraitInfo;
    identity: string;
  } | null>(null);
  const identity = slug ?? name;
  useEffect(() => {
    let active = true;
    if (!portraits) return;
    Promise.resolve(portraits.get({ name, slug }))
      .then((value) => {
        if (active) {
          setSaved(value ? { ...value, identity } : null);
          onCredit?.(value?.info ?? null);
        }
      })
      .catch(() => {
        if (active) {
          setSaved(null);
          onCredit?.(null);
        }
      });
    return () => {
      active = false;
    };
  }, [identity, name, slug, onCredit, retryKey]);
  const current = saved?.identity === identity ? saved : null;
  return (
    <Portrait
      key={`${identity}/${retryKey}`}
      size={size}
      name={name}
      localURI={current?.localURI}
      official={current ? /^\d+$/.test(current.info.key) : undefined}
      testID={current ? testID : testID ? `${testID}-blank` : undefined}
    />
  );
}
