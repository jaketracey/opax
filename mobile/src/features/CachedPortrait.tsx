import { useEffect, useMemo, useState } from 'react';
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
    request: object;
    onDisplay: (visible: boolean) => void;
  } | null>(null);
  const identity = slug ?? name;
  const request = useMemo(() => ({}), [name, slug, retryKey]);
  useEffect(() => {
    let active = true;
    onCredit?.(null);
    if (!portraits) return;
    Promise.resolve(portraits.get({ name, slug, refresh: retryKey > 0 }))
      .then((value) => {
        if (active) {
          let failed = false;
          setSaved(
            value
              ? {
                  ...value,
                  request,
                  onDisplay: (visible) => {
                    if (!visible) failed = true;
                    if (active && (!visible || !failed))
                      onCredit?.(visible ? value.info : null);
                  },
                }
              : null,
          );
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
  }, [request, name, slug, onCredit, retryKey]);
  const current = saved?.request === request ? saved : null;
  return (
    <Portrait
      key={`${identity}/${retryKey}`}
      size={size}
      name={name}
      localURI={current?.localURI}
      onDisplay={current?.onDisplay}
      official={current ? /^\d+$/.test(current.info.key) : undefined}
      testID={current ? testID : testID ? `${testID}-blank` : undefined}
    />
  );
}
