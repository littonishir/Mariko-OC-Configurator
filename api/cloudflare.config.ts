import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ mode }) => {
    const local = mode === "development";
    const databaseId = process.env.HOC_SAMPLES_DATABASE_ID || "1144835d-67d5-4b93-8e34-0c817910633e";
    return {
        accountId: "c636db5fa24042aa0368b30589eb8861",
        worker: {
            name: "hoshino-hoc-device-samples",
            entrypoint: "./worker.mjs",
            compatibilityDate: "2026-11-03",
            env: {
                DB: bindings.d1({ name: "hoshino-hoc-samples", id: local ? "00000000-0000-0000-0000-000000000001" : databaseId }),
                INTAKE_LIMITER: bindings.rateLimit({ namespace: "11032026", simple: { limit: 120, period: 60 } }),
                ADMIN_LOGIN_LIMITER: bindings.rateLimit({ namespace: "11032027", simple: { limit: 5, period: 60 } }),
                ADMIN_PASSWORD_HASH: bindings.secret(),
                ALLOWED_ORIGINS: bindings.text(local ? "http://127.0.0.1:18765,http://localhost:18765" : "https://littonishir.github.io")
            },
            observability: {
                enabled: true, redactQueryString: true,
                logs: { enabled: true, invocationLogs: false },
                traces: { enabled: true, headSamplingRate: 0.1 }
            }
        }
    };
});
