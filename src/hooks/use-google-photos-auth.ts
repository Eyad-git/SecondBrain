"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchGooglePhotosSessionStatus,
  readStoredGooglePhotosToken,
  writeStoredGooglePhotosToken,
} from "@/lib/google-photos/token";
import { useNodeStore } from "@/lib/store/use-node-store";

/**
 * Keeps Google Photos OAuth in sync across Context pane, Ask, and page reloads.
 * Server HttpOnly cookie powers Ask vision; localStorage powers Picker on the client.
 */
export function useGooglePhotosAuth() {
  const storeToken = useNodeStore((s) => s.googlePhotosAccessToken);
  const setStoreToken = useNodeStore((s) => s.setGooglePhotosAccessToken);
  const [serverConnected, setServerConnected] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const applyToken = useCallback(
    (token: string | null) => {
      if (token) {
        writeStoredGooglePhotosToken(token);
        setStoreToken(token);
      } else {
        setStoreToken(null);
      }
    },
    [setStoreToken]
  );

  const refreshSession = useCallback(async () => {
    const stored = readStoredGooglePhotosToken();
    if (stored) applyToken(stored);

    const status = await fetchGooglePhotosSessionStatus();
    setServerConnected(status.connected);
    setHydrated(true);
    return { storedToken: stored, serverConnected: status.connected };
  }, [applyToken]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const connected = Boolean(storeToken) || serverConnected;

  return {
    accessToken: storeToken,
    connected,
    serverConnected,
    hydrated,
    applyToken,
    refreshSession,
  };
}
