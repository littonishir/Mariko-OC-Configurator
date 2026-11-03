(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    root.MarikoDeviceSamples = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    function endpointUrl(value) {
        try {
            const url = new URL(value);
            const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
            if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash || url.pathname !== "/api/device-samples") return null;
            return url.href;
        } catch (_) { return null; }
    }

    function samplePayload(input, appVersion) {
        if (!input || typeof appVersion !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$/.test(appVersion)) return null;
        const cpuSpeedo = Number(input.cpuSpeedo), gpuSpeedo = Number(input.gpuSpeedo), socSpeedo = Number(input.socSpeedo);
        if ([cpuSpeedo, gpuSpeedo, socSpeedo].some(n => !Number.isInteger(n) || n < 1200 || n > 2000)) return null;
        if (typeof input.ramId !== "string" || input.ramId.length > 32 || /[\p{Cc}\p{Cf}]/u.test(input.ramId)) return null;
        const ramId = input.ramId.trim().toUpperCase();
        if (!ramId || ramId.length > 32) return null;
        const { model, mode, goal } = input;
        if (!["regular", "lite"].includes(model) || !["handheld", "plugged"].includes(mode) || !["balanced", "performance"].includes(goal)) return null;
        return { schemaVersion: 1, appVersion, cpuSpeedo, gpuSpeedo, socSpeedo, ramId, model, mode, goal };
    }

    function createReporter({ endpoint = "", appVersion, fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = 3000 } = {}) {
        const url = endpointUrl(endpoint);
        const accepted = new Set(), inflight = new Set();
        return async function report(input) {
            if (!url || typeof fetchImpl !== "function") return false;
            let key, timer, ownsRequest = false;
            try {
                const sample = samplePayload(input, appVersion);
                if (!sample) return false;
                key = JSON.stringify(sample);
                if (accepted.has(key) || inflight.has(key)) return false;
                inflight.add(key);
                ownsRequest = true;
                const controller = new AbortController();
                const timeout = new Promise(resolve => {
                    timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs);
                });
                const response = await Promise.race([fetchImpl(url, {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: key,
                    credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
                    mode: "cors", cache: "no-store", signal: controller.signal
                }), timeout]);
                if (!response || response.status !== 204) return false;
                accepted.add(key);
                return true;
            } catch (_) {
                return false;
            } finally {
                clearTimeout(timer);
                if (ownsRequest) inflight.delete(key);
            }
        };
    }

    return { createReporter };
}));
