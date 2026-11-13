import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as voice from '../../voice';
import type { EndReason, VoiceFailure } from '../../voice';
import * as uiBridge from './bridge';
import {
  asksForMicrophone,
  microphoneBlocked,
  microphoneGranted,
  requestMicrophone,
} from '../../voice/microphone';
import {
  applyEvent,
  emptySnapshot,
  eventFailure,
  eventKeys,
  isCallActive,
  recoverSnapshot,
  sendFailure,
  type TalkFailure,
  type TalkSnapshot,
} from './model';

/**
 * Android's microphone step before a call (src/voice/README.md): the
 * rationale before the system dialog, or how the last request ended.
 */
export type MicrophoneStep = 'rationale' | 'denied' | 'blocked' | null;

export function useTalk() {
  const [snapshot, setSnapshot] = useState<TalkSnapshot>(emptySnapshot);
  const current = useRef(snapshot);
  const [consent, showConsent] = useState(false);
  const [consentLoaded, setConsentLoaded] = useState(false);
  const [error, setError] = useState<TalkFailure | null>(null);
  const [terminal, setTerminal] = useState<EndReason | null>(null);
  const [busy, setBusy] = useState(false);
  // The focus generation whose status and consent reads have both finished.
  const [settled, setSettled] = useState(0);
  const [microphone, setMicrophone] = useState<MicrophoneStep>(null);
  const dispatching = useRef(false);
  const commandGeneration = useRef(0);
  // Android pauses the app behind the permission dialog and resumes it before
  // the answer arrives; that round trip is not a visit away from the call.
  const askingMicrophone = useRef(false);
  const mounted = useRef(false);
  const focusGeneration = useRef(0);
  const focusRead = useRef<Promise<void>>(Promise.resolve());
  const sequence = useRef(0);
  const revisions = useRef<Partial<Record<keyof TalkSnapshot, number>>>({});
  const set = useCallback((value: TalkSnapshot) => {
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
    const changed = new Set<keyof TalkSnapshot>();
    for (const key of Object.keys(
      revisions.current,
    ) as (keyof TalkSnapshot)[]) {
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
  // The call belongs to this screen's mount, not its focus: a push inside
  // the Talk stack (the Sources sheet, a record) never ends it. Leaving Talk
  // unmounts the screen, which ends the call (specs/account.md 7.4).
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = voice.subscribe((event) => {
      if (!mounted.current) return;
      sequence.current += 1;
      for (const key of eventKeys[event.type])
        revisions.current[key] = sequence.current;
      if (event.type === 'error')
        setError(eventFailure(event.error, current.current.state));
      // "Already in a call" is about the call under way, so it lapses when
      // that call moves on; it must not outlive it as the screen's message.
      if (event.type === 'state')
        setError((shown) => (shown === 'alreadyInCall' ? null : shown));
      if (event.type === 'state' && event.reason) setTerminal(event.reason);
      set(applyEvent(current.current, event));
    });
    return () => {
      mounted.current = false;
      commandGeneration.current += 1;
      dispatching.current = false;
      focusGeneration.current += 1;
      unsubscribe();
      void voice.end().then(() => uiBridge.discardEvidence());
      // The React state and all transient captions belong to this screen only.
      set({ ...emptySnapshot });
      setTerminal(null);
      setError(null);
    };
  }, [set]);
  // Each time Talk is shown: a fresh status read (unless a call is running),
  // then the native snapshot, then the stored consent.
  useFocusEffect(
    useCallback(() => {
      const generation = ++focusGeneration.current;
      const calling = isCallActive(current.current.state);
      if (!calling) setMicrophone(null);
      focusRead.current = (async () => {
        if (!calling) {
          await refresh();
          if (!mounted.current || generation !== focusGeneration.current)
            return;
          await recover();
        }
        const granted = await uiBridge.readConsent();
        if (mounted.current && generation === focusGeneration.current) {
          showConsent(granted);
          setConsentLoaded(true);
          setSettled(generation);
        }
      })();
    }, [recover, refresh]),
  );
  useEffect(() => {
    // iOS's microphone prompt and Control Centre pass through inactive
    // alone, without the background: that is not a new visit, and a refresh
    // then would clear the denial the prompt just produced.
    let away = false;
    let last: string = AppState.currentState;
    const subscription = AppState.addEventListener('change', (state) => {
      if (!mounted.current) return;
      if (state === 'background') away = true;
      const returning = state === 'active' && (away || last !== 'inactive');
      last = state;
      if (state === 'active') away = false;
      if (askingMicrophone.current) return;
      if (state === 'background') void uiBridge.background();
      if (returning)
        void (async () => {
          // Settings can revoke access while this screen remains mounted.
          // Stop before recovering a live snapshot; returning never restarts it.
          const checkMicrophone = asksForMicrophone();
          let revoked = false;
          if (checkMicrophone) {
            revoked = !(await microphoneGranted());
            if (!mounted.current) return;
            if (revoked && isCallActive(current.current.state)) {
              await voice.end();
              if (!mounted.current) return;
              setMicrophone(microphoneBlocked() ? 'blocked' : 'denied');
            }
          }
          await refresh();
          await recover();
          // Back from Settings: access turned on clears the refusal.
          if (checkMicrophone && !revoked && mounted.current)
            setMicrophone((step) => (step === 'rationale' ? step : null));
        })();
      // A brief inactive state (Control Centre) leaves the call alone.
    });
    return () => subscription.remove();
  }, [recover, refresh]);
  async function run(
    action: () => ReturnType<typeof voice.start>,
    describe: (error: VoiceFailure) => TalkFailure = (error) => error,
  ) {
    if (dispatching.current) return;
    const generation = ++commandGeneration.current;
    dispatching.current = true;
    setBusy(true);
    const result = await action();
    // The call outlives a push inside Talk; only leaving Talk drops it.
    if (mounted.current && generation === commandGeneration.current) {
      dispatching.current = false;
      if (!result.ok) setError(describe(result.error));
      setBusy(false);
    }
    return generation === commandGeneration.current ? result : undefined;
  }
  // Native repeats fresh status before permission/reservation. On Android the
  // microphone is asked here first, so `start()` only checks it (README.md).
  async function begin() {
    setTerminal(null);
    setError(null);
    if (asksForMicrophone()) {
      const granted = await microphoneGranted();
      if (!mounted.current) return;
      if (!granted) {
        setMicrophone(microphoneBlocked() ? 'blocked' : 'rationale');
        return;
      }
      setMicrophone(null);
    }
    await run(voice.start);
  }
  async function start() {
    if (!consent || !consentLoaded) {
      setError('consentRequired');
      return;
    }
    await begin();
  }
  /** The rationale's Continue: the system dialog, then the call if allowed. */
  async function allowMicrophone() {
    if (askingMicrophone.current || dispatching.current) return;
    if (asksForMicrophone() && (!consent || !consentLoaded)) {
      setMicrophone(null);
      setError('consentRequired');
      return;
    }
    const generation = focusGeneration.current;
    askingMicrophone.current = true;
    setBusy(true);
    const access = await requestMicrophone();
    askingMicrophone.current = false;
    if (!mounted.current || generation !== focusGeneration.current) return;
    setBusy(false);
    if (access === 'granted') {
      setMicrophone(null);
      if (AppState.currentState !== 'background') await run(voice.start);
      return;
    }
    setMicrophone(access);
    // The dialog held back the return-to-app refresh; read status now.
    await refresh();
    if (mounted.current && generation === focusGeneration.current)
      await recover();
  }
  async function changeConsent(granted: boolean) {
    setBusy(true);
    const stored = await uiBridge.setConsent(granted);
    if (mounted.current) {
      showConsent(stored && granted);
      if (stored && !granted && asksForMicrophone()) setMicrophone(null);
      if (!stored) setError('unavailable');
      setBusy(false);
    }
    return stored && mounted.current;
  }
  /** Consent was just stored by the consent sheet: start without asking. */
  async function startConsented() {
    showConsent(true);
    setConsentLoaded(true);
    // Refocusing from Android's consent route also starts a status read.
    // Kotlin refuses Start while that read is in flight.
    if (Platform.OS === 'android') await focusRead.current;
    if (!mounted.current || AppState.currentState === 'background') return;
    await begin();
  }
  async function agreeAndStart() {
    if (await changeConsent(true)) {
      if (!mounted.current || AppState.currentState === 'background') return;
      await begin();
    }
  }
  return {
    snapshot,
    consent,
    consentLoaded,
    error,
    terminal,
    busy,
    microphone,
    settled,
    active: isCallActive(snapshot.state),
    start,
    allowMicrophone,
    declineMicrophone: () => setMicrophone(null),
    refresh,
    changeConsent,
    agreeAndStart,
    startConsented,
    // End must remain available while Start is awaiting native dispatch.
    end: async () => {
      const generation = ++commandGeneration.current;
      const result = await voice.end();
      if (mounted.current && generation === commandGeneration.current) {
        dispatching.current = false;
        if (!result.ok) setError(result.error);
        setBusy(false);
      }
      return result;
    },
    mute: () => run(() => voice.mute(current.current.mode !== 'muted')),
    send: (text: string) => run(() => uiBridge.sendText(text), sendFailure),
  };
}
