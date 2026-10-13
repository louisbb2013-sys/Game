import type { Answer, LivePublic as CoreLivePublic } from '@lumo/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Rewards } from './rewards';

export interface LiveReward {
  rank: number;
  xp: number;
  coins: number;
  rewards: Rewards;
}

export type LivePublic = CoreLivePublic & { serverNow: number };

type AckResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

let shared: Socket | null = null;
// Leaving is deferred a moment so a quick remount (React dev mode, route refresh) doesn't leave the game.
const pendingLeave = new Map<string, ReturnType<typeof setTimeout>>();

/** One socket for the whole app; the session cookie authenticates it. */
export function liveSocket(): Socket {
  if (!shared) shared = io({ path: '/api/live/socket', withCredentials: true, transports: ['websocket', 'polling'] });
  // A refused handshake (e.g. signed out at the time) doesn't retry on its own.
  else if (!shared.connected && !shared.active) shared.connect();
  return shared;
}

export function liveCall<T = object>(event: string, body: object): Promise<AckResult<T>> {
  const s = liveSocket();
  return new Promise((resolve) => {
    s.timeout(15_000).emit(event, body, (err: Error | null, r: AckResult<T>) => resolve(err ? { ok: false, error: 'network' } : r));
  });
}

export type RoomStatus = 'joining' | 'in' | 'closed' | 'kicked' | 'error';

/** Join a game room and follow its state until you leave. */
export function useLiveRoom(code: string) {
  const [state, setState] = useState<LivePublic | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [status, setStatus] = useState<RoomStatus>('joining');
  const [error, setError] = useState<string | null>(null);
  const [reward, setReward] = useState<LiveReward | null>(null);
  const [connected, setConnected] = useState(true);
  const codeRef = useRef(code);
  codeRef.current = code;

  const join = useCallback(async () => {
    const r = await liveCall<{ state: LivePublic; you: string; reward: LiveReward | null }>('live:join', { code: codeRef.current });
    if (!r.ok) {
      setStatus('error');
      setError(r.error);
      return;
    }
    setState(r.state);
    setMe(r.you);
    if (r.reward) setReward(r.reward);
    setStatus('in');
  }, []);

  useEffect(() => {
    const s = liveSocket();
    clearTimeout(pendingLeave.get(code));
    pendingLeave.delete(code);
    const onState = (v: LivePublic) => v.code === codeRef.current && setState(v);
    const onReward = (r: LiveReward) => setReward(r);
    const onClosed = (v: { code: string }) => v.code === codeRef.current && setStatus('closed');
    const onKicked = (v: { code: string }) => v.code === codeRef.current && setStatus('kicked');
    // After a network drop, rejoin: the server keeps your score.
    const onConnect = () => {
      setConnected(true);
      void join();
    };
    const onDisconnect = () => setConnected(false);
    s.on('live:state', onState);
    s.on('live:reward', onReward);
    s.on('live:closed', onClosed);
    s.on('live:kicked', onKicked);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    if (s.connected) void join();
    return () => {
      s.off('live:state', onState);
      s.off('live:reward', onReward);
      s.off('live:closed', onClosed);
      s.off('live:kicked', onKicked);
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      pendingLeave.set(
        code,
        setTimeout(() => {
          pendingLeave.delete(code);
          void liveCall('live:leave', { code });
        }, 400),
      );
    };
  }, [code, join]);

  const send = useCallback((event: string, body: object = {}) => liveCall(event, { code: codeRef.current, ...body }), []);
  const answer = useCallback((questionId: string, a: Answer) => send('live:answer', { questionId, answer: a }), [send]);

  return { state, me, status, error, reward, connected, send, answer };
}
