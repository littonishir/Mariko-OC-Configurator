const MAX_BYTES = 2048;
const FIELDS = ["schemaVersion", "appVersion", "cpuSpeedo", "gpuSpeedo", "socSpeedo", "ramId", "model", "mode", "goal"];
const CONTROLS = /[\p{Cc}\p{Cf}]/u;

function respond(status, origin, extraHeaders = {}) {
    const headers = { "Cache-Control": "no-store", Vary: "Origin", ...extraHeaders };
    if (origin) headers["Access-Control-Allow-Origin"] = origin;
    return new Response(null, { status, headers });
}

async function readLimitedJson(request) {
    if (Number(request.headers.get("Content-Length")) > MAX_BYTES) return { status: 413 };
    if (!request.body) return { status: 400 };
    const reader = request.body.getReader();
    const chunks = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > MAX_BYTES) {
                await reader.cancel();
                return { status: 413 };
            }
            chunks.push(value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
    } catch (_) {
        return { status: 400 };
    } finally {
        reader.releaseLock();
    }
}

function validate(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (Object.keys(value).length !== FIELDS.length || FIELDS.some(key => !Object.hasOwn(value, key))) return null;
    if (value.schemaVersion !== 1) return null;
    if (typeof value.appVersion !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$/.test(value.appVersion)) return null;
    if ([value.cpuSpeedo, value.gpuSpeedo, value.socSpeedo].some(n => !Number.isInteger(n) || n < 1200 || n > 2000)) return null;
    if (typeof value.ramId !== "string" || value.ramId.length > 32 || CONTROLS.test(value.ramId)) return null;
    const ramId = value.ramId.trim().toUpperCase();
    if (!ramId || ramId.length > 32) return null;
    if (!["regular", "lite"].includes(value.model) || !["handheld", "plugged"].includes(value.mode) || !["balanced", "performance"].includes(value.goal)) return null;
    return { ...value, ramId };
}

export default {
    async fetch(request, env) {
        const { pathname } = new URL(request.url);
        if (pathname === "/healthz" && request.method === "GET") {
            return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
        }
        if (pathname !== "/api/device-samples") return respond(404);
        const origin = request.headers.get("Origin");
        const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
        if (!origin || !allowed.includes(origin)) return respond(403);
        if (request.method === "OPTIONS") return respond(204, origin, {
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "600"
        });
        if (request.method !== "POST") return respond(405, origin, { Allow: "POST, OPTIONS" });
        if (!env.DB || !env.INTAKE_LIMITER) return respond(503, origin);

        try {
            // 端点总限流，近似且按节点独立；不创建访客 ID 或把 IP 写入数据库。
            const { success } = await env.INTAKE_LIMITER.limit({ key: "device-samples" });
            if (!success) return respond(429, origin, { "Retry-After": "60" });
            if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") return respond(415, origin);
            const parsed = await readLimitedJson(request);
            if (parsed.status) return respond(parsed.status, origin);
            const sample = validate(parsed.value);
            if (!sample) return respond(400, origin);
            const now = new Date().toISOString();
            await env.DB.prepare(`
                INSERT INTO device_samples
                    (cpu_speedo, gpu_speedo, soc_speedo, ram_id, model, last_mode, last_goal, last_app_version, first_seen_at, last_seen_at, submission_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                ON CONFLICT (cpu_speedo, gpu_speedo, soc_speedo, ram_id, model) DO UPDATE SET
                    last_mode = CASE WHEN excluded.last_seen_at >= device_samples.last_seen_at THEN excluded.last_mode ELSE device_samples.last_mode END,
                    last_goal = CASE WHEN excluded.last_seen_at >= device_samples.last_seen_at THEN excluded.last_goal ELSE device_samples.last_goal END,
                    last_app_version = CASE WHEN excluded.last_seen_at >= device_samples.last_seen_at THEN excluded.last_app_version ELSE device_samples.last_app_version END,
                    first_seen_at = MIN(device_samples.first_seen_at, excluded.first_seen_at),
                    last_seen_at = MAX(device_samples.last_seen_at, excluded.last_seen_at),
                    submission_count = device_samples.submission_count + 1
            `).bind(sample.cpuSpeedo, sample.gpuSpeedo, sample.socSpeedo, sample.ramId, sample.model,
                sample.mode, sample.goal, sample.appVersion, now, now).run();
            return respond(204, origin);
        } catch (_) {
            console.error(JSON.stringify({ event: "device_sample_write_failed" }));
            return respond(503, origin);
        }
    }
};
