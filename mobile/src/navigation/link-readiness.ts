import { Platform } from 'react-native';
import nativeLinks, { type LinkDelivery } from '../../modules/opax-links';

export type { LinkDelivery };
export const linkDeliveryParam = '__opaxLinkDelivery';

let ready = false;
let capture: { remove(): void } | null = null;
let listener: ((delivery: LinkDelivery) => Promise<boolean>) | null = null;
const pending: LinkDelivery[] = [];
const acknowledged = new Set<string>();
let draining = false;
let revision = 0;

/** The native inbox is authoritative; snapshots and events can overlap. */
function receive(deliveries: LinkDelivery[], route = true) {
  for (const delivery of deliveries) {
    if (
      acknowledged.has(delivery.id) ||
      pending.some((entry) => entry.id === delivery.id)
    )
      continue;
    pending.push(delivery);
  }
  pending.sort((a, b) => a.sequence - b.sequence);
  if (route) drain();
}

function drain() {
  revision++;
  if (draining || !ready || !capture) return;
  draining = true;
  const owner = capture;
  const startedAt = revision;
  void (async () => {
    try {
      while (capture === owner && ready && pending.length) {
        const deliver = listener;
        if (!deliver) break;
        const delivery = pending[0]!;
        // The listener resolves only when this ID reaches navigation state.
        // A root unmount cancels an uncommitted navigation without consuming it.
        if (!(await deliver(delivery)) || capture !== owner) break;
        await nativeLinks!.acknowledge(delivery.id);
        acknowledged.add(delivery.id);
        const index = pending.findIndex((entry) => entry.id === delivery.id);
        if (index >= 0) pending.splice(index, 1);
      }
    } catch {
      // Failed navigation or persistence keeps the delivery pending for retry.
    } finally {
      draining = false;
      if (
        capture &&
        revision !== startedAt &&
        ready &&
        listener &&
        pending.length
      )
        drain();
    }
  })();
}

export function installAndroidLinkCapture(): () => void {
  if (Platform.OS !== 'android' || !nativeLinks || capture) return () => {};
  // Subscribe before reading so an intent arriving during startup cannot fall
  // between the snapshot and event listener. Identity makes the overlap safe.
  const subscription = nativeLinks.addListener('onLinkDeliveries', (event) =>
    receive(event.deliveries),
  );
  capture = subscription;
  receive(nativeLinks.pending());
  return () => {
    if (capture !== subscription) return;
    subscription.remove();
    capture = null;
    listener = null;
    pending.length = 0;
    acknowledged.clear();
    ready = false;
  };
}

export const hasAndroidLinkCapture = () => capture !== null;

/** Initial navigation uses the oldest pending delivery, never the latest URL. */
export function initialAndroidLink(): LinkDelivery | undefined {
  if (!capture) return undefined;
  const snapshot = nativeLinks!.pending();
  receive(snapshot, false);
  // A native acknowledgement can finish before its JS promise resolves.
  // The older JS queue must never reselect that already-consumed delivery.
  return snapshot[0];
}

export function linkDeliveryPath(path: string, id: string): string {
  const hash = path.indexOf('#');
  const suffix = hash < 0 ? '' : path.slice(hash);
  const base = hash < 0 ? path : path.slice(0, hash);
  const query = base.indexOf('?');
  const pathname = query < 0 ? base : base.slice(0, query);
  const params = new URLSearchParams(query < 0 ? '' : base.slice(query + 1));
  // An external URL cannot supply its own navigation receipt.
  params.set(linkDeliveryParam, id);
  return `${pathname}?${params}${suffix}`;
}

export function subscribeAndroidLinks(
  next: (delivery: LinkDelivery) => Promise<boolean>,
) {
  listener = next;
  drain();
  return () => {
    if (listener === next) listener = null;
  };
}

export function setLinkNavigationReady(value: boolean) {
  ready = value;
  drain();
}
