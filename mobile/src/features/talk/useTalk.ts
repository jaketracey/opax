import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as voice from '../../voice';
import type { EndReason, VoiceFailure, VoiceSnapshot } from '../../voice';
import * as uiBridge from './bridge';
import {
  applyEvent,
  emptySnapshot,
  eventKeys,
  isCallActive,
  recoverSnapshot,
} from './model';

export function useTalk() {
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>(emptySnapshot);
  const current = useRef(snapshot);
  const [consent, showConsent] = useState(false);
  const [consentLoaded, setConsentLoaded] = useState(false);
  const [error, setError] = useState<VoiceFailure | null>(null);
  const [terminal, setTerminal] = useState<EndReason | null>(null);
  const [busy, setBusy] = useState(false);
  const dispatching = useRef(false);
  const mounted = useRef(false);
  const focusGeneration = useRef(0);
  const sequence = useRef(0);
  const revisions = useRef<Partial<Record<keyof VoiceSnapshot, number>>>({});
  const set = useCallback((value: VoiceSnapshot) => {
    current.current = value;
    setSnapshot(value);
  }, []);
  const recover = useCallback(async () => {
    const generation = focusGeneration.current;
    const before = sequence.current;
    const result = await voice.snapshot();
    if (!mounted.current || generation !== focusGeneration.current) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const changed = new Set<keyof VoiceSnapshot>();
    for (const key of Object.keys(
      revisions.current,
    ) as (keyof VoiceSnapshot)[]) {
      if (revisions.current[key]! > before) changed.add(key);
    }
    set(recoverSnapshot(current.current, result.value, changed));
    if (!changed.has('reason') && result.value.reason)
      setTerminal(result.value.reason);
  }, [set]);
  const refresh = useCallback(async () => {
    const generation = focusGeneration.current;
    const before = sequence.current;
    setError(null);
    const result = await voice.status();
    if (!mounted.current || generation !== focusGeneration.current) return;
    // The subscribed status event is authoritative. Failed status must clear
    // cached allowance even if native is unavailable and emits no event.
    if (!result.ok && (revisions.current.status ?? 0) <= before) {
      set({ ...current.current, status: null });
      setError(result.error);
    }
  }, [set]);
  useFocusEffect(
    useCallback(() => {
      mounted.current = true;
      dispatching.current = false;
      setBusy(false);
      setConsentLoaded(false);
      const generation = ++focusGeneration.current;
      const unsubscribe = voice.subscribe((event) => {
        if (!mounted.current || generation !== focusGeneration.current) return;
        sequence.current += 1;
        for (const key of eventKeys[event.type])
          revisions.current[key] = sequence.current;
        if (event.type === 'error') setError(event.error);
        if (event.type === 'state' && event.reason) setTerminal(event.reason);
        set(applyEvent(current.current, event));
      });
      // Subscribe first; status owns the network read; snapshot recovers atomic
      // native values afterwards while retaining events newer than that read.
      void (async () => {
        await refresh();
        if (!mounted.current || generation !== focusGeneration.current) return;
        await recover();
        const granted = await uiBridge.readConsent();
        if (mounted.current && generation === focusGeneration.current) {
          showConsent(granted);
          setConsentLoaded(true);
        }
      })();
      return () => {
        mounted.current = false;
        focusGeneration.current += 1;
        unsubscribe();
        void voice.end().then(() => uiBridge.discardEvidence());
        // The React state and all transient captions belong to this screen only.
        set({ ...emptySnapshot });
        setTerminal(null);
        setError(null);
      };
    }, [recover, refresh, set]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (!mounted.current) return;
      if (state === 'background') void uiBridge.background();
      if (state === 'active')
        void (async () => {
          await refresh();
          await recover();
        })();
      // A brief inactive state (Control Centre) leaves the call alone.
    });
    return () => subscription.remove();
  }, [recover, refresh]);
  async function run(action: () => ReturnType<typeof voice.start>) {
    if (dispatching.current) return;
    dispatching.current = true;
    const generation = focusGeneration.current;
    setBusy(true);
    const result = await action();
    if (mounted.current && generation === focusGeneration.current) {
      dispatching.current = false;
      if (!result.ok) setError(result.error);
      setBusy(false);
    }
    return result;
  }
  async function start() {
    if (!consent || !consentLoaded) {
      setError('consentRequired');
      return;
    }
    setTerminal(null);
    setError(null);
    await run(voice.start); // Native repeats fresh status before permission/reservation.
  }
  async function changeConsent(granted: boolean) {
    const generation = focusGeneration.current;
    setBusy(true);
    const stored = await uiBridge.setConsent(granted);
    if (mounted.current && generation === focusGeneration.current) {
      showConsent(stored && granted);
      if (!stored) setError('unavailable');
      setBusy(false);
    }
    return stored && mounted.current && generation === focusGeneration.current;
  }
  async function agreeAndStart() {
    if (await changeConsent(true)) {
      if (!mounted.current || AppState.currentState === 'background') return;
      setTerminal(null);
      setError(null);
      await run(voice.start);
    }
  }
  return {
    snapshot,
    consent,
    consentLoaded,
    error,
    terminal,
    busy,
    active: isCallActive(snapshot.state),
    start,
    refresh,
    changeConsent,
    agreeAndStart,
    // End must remain available while Start is awaiting native dispatch.
    end: async () => {
      const generation = focusGeneration.current;
      const result = await voice.end();
      if (mounted.current && generation === focusGeneration.current) {
        dispatching.current = false;
        if (!result.ok) setError(result.error);
        setBusy(false);
      }
      return result;
    },
    mute: () => run(() => voice.mute(current.current.mode !== 'muted')),
    send: (text: string) => run(() => uiBridge.sendText(text)),
  };
}
