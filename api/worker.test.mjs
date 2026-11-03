import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from "miniflare";

const origin = "https://littonishir.github.io";
const payload = { schemaVersion: 1, appVersion: "20261103-hoc26", cpuSpeedo: 1662, gpuSpeedo: 1694, socSpeedo: 1728, ramId: "WT:F", model: "regular", mode: "handheld", goal: "performance" };

async function setup(t, { limit = 120, withDB = true, withLimiter = true, withSchema = true, timestamps } = {}) {
    const scriptPath = new URL("worker.mjs", import.meta.url);
    // 仅测试时控制接收时刻，验证真实请求/SQL 在写入乱序时仍保持时间一致。
    const clock = timestamps ? `const testTimes=${JSON.stringify(timestamps)};const RealDate=globalThis.Date;globalThis.Date=class extends RealDate{toISOString(){return testTimes.shift() ?? super.toISOString();}};` : "";
    const script = clock + readFileSync(scriptPath, "utf8");
    const mf = new Miniflare(convertV4MiniflareOptions({
        modules: true, script, compatibilityDate: "2026-11-03",
        d1Databases: withDB ? ["DB"] : [],
        ratelimits: withLimiter ? { INTAKE_LIMITER: { namespace_id: "11032026", simple: { limit, period: 60 } } } : {},
        bindings: { ALLOWED_ORIGINS: origin },
        log: new Log(LogLevel.NONE)
    }));
    t.after(() => mf.dispose());
    const db = withDB ? await mf.getD1Database("DB") : null;
    const schema = new URL("schema.sql", import.meta.url);
    if (db && withSchema) await db.batch(readFileSync(schema, "utf8").split(";").filter(s => s.trim()).map(s => db.prepare(s)));
    const send = (data = payload, options = {}) => mf.dispatchFetch("https://samples.test/api/device-samples", {
        method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...options.headers },
        body: JSON.stringify(data), ...options
    });
    const rows = async () => (await db.prepare("SELECT * FROM device_samples ORDER BY id").all()).results;
    return { mf, db, send, rows };
}

test("有效参数写入真实 D1，公开响应不泄漏样本", async t => {
    const { send, rows } = await setup(t);
    const response = await send();
    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    const [record] = await rows();
    assert.equal(record.cpu_speedo, 1662);
    assert.equal(record.ram_id, "WT:F");
    assert.equal(record.submission_count, 1);
    assert.match(record.first_seen_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(record.last_app_version, payload.appVersion);
    assert.equal(Object.hasOwn(record, "ip"), false);
});

test("同一硬件大小写规范化和并发提交使用原子 UPSERT", async t => {
    const { send, rows } = await setup(t);
    const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => send({ ...payload, ramId: i % 2 ? " wt:f " : "WT:F" })));
    assert.ok(responses.every(r => r.status === 204));
    assert.equal((await rows()).length, 1);
    assert.equal((await rows())[0].submission_count, 8);
    await send({ ...payload, mode: "plugged", goal: "balanced" });
    assert.equal((await rows()).length, 1);
    assert.equal((await rows())[0].last_mode, "plugged");
    await send({ ...payload, cpuSpeedo: 1663 });
    assert.equal((await rows()).length, 2);
});

test("写入乱序时首次时间取最早，最近时间和元数据保持同一次提交", async t => {
    const later = "2026-11-03T10:00:00.010Z", earlier = "2026-11-03T10:00:00.000Z";
    const { send, rows } = await setup(t, { timestamps: [later, earlier] });
    assert.equal((await send({ ...payload, mode: "plugged", goal: "performance", appVersion: "new" })).status, 204);
    assert.equal((await send({ ...payload, mode: "handheld", goal: "balanced", appVersion: "old" })).status, 204);
    const [record] = await rows();
    assert.equal(record.first_seen_at, earlier);
    assert.equal(record.last_seen_at, later);
    assert.equal(record.last_mode, "plugged");
    assert.equal(record.last_goal, "performance");
    assert.equal(record.last_app_version, "new");
    assert.equal(record.submission_count, 2);
});

test("拒绝非法类型、边界、枚举和额外字段，不写入 D1", async t => {
    const { send, rows } = await setup(t);
    for (const patch of [
        { cpuSpeedo: "1662" }, { gpuSpeedo: 1694.1 }, { socSpeedo: null },
        { cpuSpeedo: 1199 }, { gpuSpeedo: 2001 }, { schemaVersion: 2 },
        { ramId: " " }, { ramId: "X".repeat(33) }, { ramId: "WT:F\n" },
        { model: "erista" }, { mode: "docked" }, { goal: "x" },
        { appVersion: "" }, { appVersion: "X".repeat(65) },
        { ip: "1.2.3.4" }, { serialNumber: "secret" }
    ]) assert.equal((await send({ ...payload, ...patch })).status, 400, JSON.stringify(patch));
    for (const value of [null, [], "test", {}, { ...payload, ramId: 123 }]) assert.equal((await send(value)).status, 400);
    assert.equal((await rows()).length, 0);
});

test("支持未知颗粒及参数边界，不把模型参考范围当接口边界", async t => {
    const { send, rows } = await setup(t);
    assert.equal((await send({ ...payload, cpuSpeedo: 1200, gpuSpeedo: 2000, ramId: "未知颗粒" })).status, 204);
    assert.equal((await rows())[0].ram_id, "未知颗粒");
});

test("SQL 参数绑定允许颗粒文字但不能执行 SQL", async t => {
    const { send, rows } = await setup(t);
    assert.equal((await send({ ...payload, ramId: "');DROP TABLE device_samples;--" })).status, 204);
    assert.equal((await rows()).length, 1);
});

test("限制 JSON 类型、非法 JSON 和含多字节的实际请求体长度", async t => {
    const { mf, send, rows } = await setup(t);
    assert.equal((await send(payload, { headers: { Origin: origin, "Content-Type": "text/plain" } })).status, 415);
    assert.equal((await send(payload, { body: "{" })).status, 400);
    const bytes = new TextEncoder().encode(JSON.stringify({ ...payload, ramId: "字".repeat(1000) }));
    const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, 1024)); controller.enqueue(bytes.slice(1024)); controller.close(); } });
    const response = await mf.dispatchFetch("https://samples.test/api/device-samples", {
        method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: stream, duplex: "half"
    });
    assert.equal(response.status, 413);
    assert.equal((await rows()).length, 0);
});

test("CORS 精确匹配来源，拒绝缺失和伪装 Origin", async t => {
    const { send, rows } = await setup(t);
    for (const bad of ["", "null", "https://littonishir.github.io.evil.test", "https://other.github.io", "http://127.0.0.1:18765"]) {
        const response = await send(payload, { headers: { Origin: bad, "Content-Type": "application/json" } });
        assert.equal(response.status, 403);
        assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
    }
    assert.equal((await rows()).length, 0);
});

test("预检无需写库；错误方法和公开 GET 不读取样本", async t => {
    const { mf, rows } = await setup(t);
    const url = "https://samples.test/api/device-samples";
    const preflight = await mf.dispatchFetch(url, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
    for (const method of ["GET", "PUT", "DELETE"]) assert.equal((await mf.dispatchFetch(url, { method, headers: { Origin: origin } })).status, 405);
    assert.equal((await rows()).length, 0);
    const health = await mf.dispatchFetch("https://samples.test/healthz");
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal((await mf.dispatchFetch("https://samples.test/anything")).status, 404);
});

test("缺少必要绑定或数据库异常时返回 503 而不是谎报接收", async t => {
    for (const options of [{ withDB: false }, { withLimiter: false }, { withSchema: false }]) {
        const { send } = await setup(t, options);
        assert.equal((await send()).status, 503);
    }
});

test("公开写入使用平台限流，超过限制不继续写库", async t => {
    const { send, rows } = await setup(t, { limit: 1 });
    assert.equal((await send()).status, 204);
    const response = await send({ ...payload, cpuSpeedo: 1663 });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
    assert.equal((await rows()).length, 1);
});
