const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const sourcePath = `${__dirname}/device-samples.js`;
const api = require(sourcePath);
const base = { cpuSpeedo: 1662, gpuSpeedo: 1694, socSpeedo: 1728, ramId: "WT:F", model: "regular", mode: "handheld", goal: "performance" };
const options = { endpoint: "https://samples.example/api/device-samples", appVersion: "20261103-hoc26" };

test("上传只含固定字段，不带 Cookie 或附带身份字段", async () => {
    const requests = [];
    const report = api.createReporter({ ...options, fetchImpl: async (url, init) => { requests.push({ url, init }); return { status: 204, ok: true }; } });
    await report({ ...base, cpuSpeedo: "1662", ramId: " wt:f ", serialNumber: "secret", ip: "1.2.3.4" });
    assert.equal(requests.length, 1);
    const { init } = requests[0];
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.equal(init.referrerPolicy, "no-referrer");
    assert.deepEqual(JSON.parse(init.body), { schemaVersion: 1, appVersion: options.appVersion, ...base });
});

test("同页成功和并发重复提交去重；新参数可以提交", async () => {
    let calls = 0, resolve;
    const pending = new Promise(r => { resolve = r; });
    const report = api.createReporter({ ...options, fetchImpl: async () => { calls++; return pending; } });
    const one = report(base), two = report({ ...base, ramId: " wt:f " });
    assert.equal(calls, 1);
    await two;
    const three = report(base);
    assert.equal(calls, 1, "重复调用不能提前清除第一条尚未完成请求的去重状态");
    resolve({ status: 204, ok: true });
    await Promise.all([one, two, three]);
    await report(base);
    assert.equal(calls, 1);
    await report({ ...base, cpuSpeedo: 1663 });
    assert.equal(calls, 2);
});

test("HTTP 失败或网络失败静默结束，之后显式点击可以重试", async () => {
    for (const failure of [async () => { throw new Error("offline"); }, async () => ({ status: 503, ok: false })]) {
        let calls = 0;
        const report = api.createReporter({ ...options, fetchImpl: async (...args) => { calls++; return failure(...args); } });
        await assert.doesNotReject(report(base));
        await report(base);
        assert.equal(calls, 2);
    }
});

test("超时中止上传并释放去重项，不挂住下一次点击", async () => {
    let calls = 0;
    const report = api.createReporter({ ...options, timeoutMs: 15, fetchImpl: async (_url, init) => {
        calls++;
        return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    } });
    await report(base);
    await report(base);
    assert.equal(calls, 2);
});

test("未配置和不安全 endpoint 不发送，非法值也不发送", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return { status: 204, ok: true }; };
    for (const endpoint of ["", "javascript:alert(1)", "http://public.example/api", "https://user:secret@samples.example/api", "https://samples.example/api?token=x"]) {
        await api.createReporter({ ...options, endpoint, fetchImpl })(base);
    }
    const report = api.createReporter({ ...options, fetchImpl });
    for (const patch of [{ cpuSpeedo: 1200.5 }, { gpuSpeedo: null }, { ramId: " " }, { ramId: "X".repeat(33) }, { mode: "docked" }]) await report({ ...base, ...patch });
    assert.equal(calls, 0);
    await api.createReporter({ ...options, endpoint: "http://127.0.0.1:8787/api/device-samples", fetchImpl })(base);
    assert.equal(calls, 1);
});

test("浏览器配置区分本地数据库接口与正式 Cloudflare 接口", () => {
    const configPath = `${__dirname}/sample-config.js`;
    assert.equal(fs.existsSync(configPath), true, "上传配置尚未实现");
    for (const [hostname, expected] of [["127.0.0.1", "http://127.0.0.1:8787/api/device-samples"], ["littonishir.github.io", "https://hoshino-hoc.pages.dev/api/device-samples"]]) {
        const window = { location: { hostname } };
        vm.runInNewContext(fs.readFileSync(configPath, "utf8"), { window });
        assert.equal(window.MarikoSampleConfig.endpoint, expected);
    }
});
