"use client";

import { useEffect } from "react";

import { useConfigStore, type AiConfig, type WebdavSyncConfig } from "@/stores/use-config-store";

type PublicConfigResponse = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
};

export function ServerConfigBootstrap() {
    useEffect(() => {
        let cancelled = false;
        fetch("/api/config/public", { cache: "no-store" })
            .then(async (response) => {
                if (!response.ok) throw new Error(await response.text());
                return (await response.json()) as PublicConfigResponse;
            })
            .then((payload) => {
                if (cancelled) return;
                useConfigStore.setState((state) => ({
                    config: {
                        ...state.config,
                        ...payload.config,
                    },
                    webdav: {
                        ...state.webdav,
                        ...payload.webdav,
                    },
                }));
            })
            .catch((error) => {
                console.error("[server-config] load failed", error);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return null;
}
