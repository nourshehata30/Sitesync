import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from "react";
import * as api from "./api";
import { applyServer, Editable, emptyState, localEdit, SyncState } from "./sync/core";

const STATE_KEY = "sitesync.state.v1";
const TOKEN_KEY = "sitesync.token";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

interface Ctx {
  state: SyncState;
  token: string | null;
  ready: boolean;
  status: SyncStatus;
  signIn(mode: "login" | "register", email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  edit(id: string, patch: Editable): void;
  addPhoto(id: string, uri: string): void;
  syncNow(): Promise<void>;
}

const C = createContext<Ctx>(null!);
export const useApp = () => useContext(C);

type Action = { type: "load"; state: SyncState } | { type: "set"; fn: (s: SyncState) => SyncState };
const reducer = (s: SyncState, a: Action) => (a.type === "load" ? a.state : a.fn(s));

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, emptyState);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const stateRef = useRef(state);
  stateRef.current = state;
  const inFlight = useRef(false);

  // Hydrate from disk: the app is fully usable with zero connectivity from the first frame.
  useEffect(() => {
    (async () => {
      const [raw, tok] = await Promise.all([AsyncStorage.getItem(STATE_KEY), SecureStore.getItemAsync(TOKEN_KEY)]);
      if (raw) dispatch({ type: "load", state: { ...emptyState(), ...JSON.parse(raw) } });
      setToken(tok);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STATE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const syncNow = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setStatus("syncing");
    try {
      // 1) upload queued photos; on success they become part of the pending patch
      for (const item of [...stateRef.current.photoQueue]) {
        const blob = await api.uploadPhoto(token, item.uri);
        dispatch({
          type: "set",
          fn: (s) => {
            const current = s.records[item.inspectionId]?.photos ?? [];
            const next = localEdit(s, item.inspectionId, { photos: [...current, blob] }, Date.now());
            return { ...next, photoQueue: s.photoQueue.filter((p) => p.uri !== item.uri) };
          },
        });
      }
      // 2) push + pull until the server says there's nothing more
      let more = true;
      while (more) {
        const sent = stateRef.current.pending;
        const res = await api.sync(token, stateRef.current.cursor, sent);
        dispatch({ type: "set", fn: (s) => applyServer(s, sent, res) });
        more = res.has_more;
      }
      setStatus("idle");
    } catch (e) {
      if (e instanceof api.ApiError && e.status === 401) {
        await signOut();
      }
      const net = await NetInfo.fetch();
      setStatus(net.isConnected ? "error" : "offline");
    } finally {
      inFlight.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Sync when the network returns, and on a gentle timer while foregrounded.
  useEffect(() => {
    if (!token) return;
    const unsub = NetInfo.addEventListener((n) => {
      if (n.isConnected) void syncNow();
      else setStatus("offline");
    });
    const t = setInterval(() => void syncNow(), 30_000);
    void syncNow();
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [token, syncNow]);

  const signIn: Ctx["signIn"] = async (mode, email, password) => {
    const { access_token } = await api.auth(mode, email, password);
    await SecureStore.setItemAsync(TOKEN_KEY, access_token);
    setToken(access_token);
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await AsyncStorage.removeItem(STATE_KEY);
    dispatch({ type: "load", state: emptyState() });
    setToken(null);
  };

  const value: Ctx = {
    state,
    token,
    ready,
    status,
    signIn,
    signOut,
    edit: (id, patch) => {
      dispatch({ type: "set", fn: (s) => localEdit(s, id, patch, Date.now()) });
      void syncNow();
    },
    addPhoto: (id, uri) => {
      dispatch({ type: "set", fn: (s) => ({ ...s, photoQueue: [...s.photoQueue, { inspectionId: id, uri }] }) });
      void syncNow();
    },
    syncNow,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
