const test = require("node:test");
const assert = require("node:assert/strict");
const { findRamProfile, recommend, toText } = require("./configurator.js");

const base = {
    cpuSpeedo: 1650,
    gpuSpeedo: 1680,
    socSpeedo: 1700,
    ramId: "WT:B",
    model: "regular",
    mode: "handheld",
    goal: "balanced"
};

test("识别 RAM ID 时忽略大小写和空格", () => {
    assert.equal(findRamProfile(" wt:b ").tier, "GOD");
    assert.equal(findRamProfile("aa-mgcr").tier, "S");
});

test("续航版掌机配置采用指南安全上限", () => {
    const result = recommend(base);
    assert.equal(result.ok, true);
    assert.deepEqual(result.clocks, {
        cpu: 1963,
        gpu: 998,
        ramStart: 2133,
        ramTarget: 2400,
        ramTuningTarget: 2400,
        powerLimit: 8.6
    });
    assert.equal(result.cpu.voltageLimit, "1120 mV");
    assert.equal(result.gpu.voltageOffset, "0");
    assert.equal(result.ram.hpMode, "关闭");
    assert.equal(result.ram.dvbShift, 8);
    assert.equal(result.ram.latencyEditor, "2133 Latency Max");
    assert.equal(result.ram.timingReductions, "Common: (4-4-5) 4-2-6-5-6");
    assert.match(toText(result), /DVB偏移 8/);
    assert.doesNotMatch(toText(result), /DVB偏移 10/);
});

test("Lite 掌机使用更低 CPU GPU 和功耗上限", () => {
    const result = recommend({ ...base, model: "lite" });
    assert.equal(result.clocks.cpu, 1785);
    assert.equal(result.clocks.gpu, 921);
    assert.equal(result.clocks.powerLimit, 6.5);
});

test("未知 RAM 使用保守参数并给出警告", () => {
    const result = recommend({ ...base, ramId: "UNKNOWN" });
    assert.equal(result.ram.recognized, false);
    assert.equal(result.clocks.ramTarget, 2400);
    assert.equal(result.ram.dvbShift, 5);
    assert.equal(result.ram.timingReductions, "默认");
    assert.match(result.warnings.join("\n"), /未识别 RAM ID/);
});

test("NME 进阶目标不会降低 2400 MHz 安全基线", () => {
    const result = recommend({
        ...base,
        ramId: "NME",
        mode: "plugged",
        goal: "performance"
    });
    assert.equal(result.clocks.ramTarget, 2400);
    assert.equal(result.clocks.ramTuningTarget, 2400);
});

test("Speedo 不会直接改写没有文档分档依据的 CPU 起步值", () => {
    const lowSpeedo = recommend({ ...base, cpuSpeedo: 1400, socSpeedo: 1400 });
    const highSpeedo = recommend({ ...base, cpuSpeedo: 1800, socSpeedo: 1800 });
    assert.deepEqual(lowSpeedo.cpu, highSpeedo.cpu);
    assert.equal(lowSpeedo.cpu.lowUvStart, 4);
    assert.equal(lowSpeedo.cpu.uvTable, 1683);
    assert.equal(lowSpeedo.cpu.lowVmin, "590 mV");
});

test("性能配置文本包含主要参数与风险", () => {
    const result = recommend({ ...base, mode: "plugged", goal: "performance" });
    const text = toText(result);
    assert.match(text, /CPU 2397 MHz/);
    assert.match(text, /GPU 1152 MHz/);
    assert.equal(result.clocks.ramTarget, 2400);
    assert.equal(result.clocks.ramTuningTarget, 3066);
    assert.equal(result.ram.timingReductions, "ST: (6-6-7) 5-2-6-5-6");
    assert.match(text, /ST 不稳定时/);
    assert.match(text, /再逐级测试到 3066 MHz/);
    assert.match(text, /1228 MHz/);
    assert.match(text, /CPU降压模式/);
    assert.match(text, /CPU最高电压/);
    assert.match(text, /CPU最高频率/);
    assert.match(text, /CPU加速频率/);
    assert.ok(text.indexOf("CPU低频降压") < text.indexOf("CPU高频降压"));
    assert.ok(text.indexOf("CPU高频降压") < text.indexOf("CPU降压模式"));
    assert.ok(text.indexOf("GPU降压模式") < text.indexOf("GPU最低电压"));
    assert.ok(text.indexOf("GPU最低电压") < text.indexOf("GPU最高电压"));
    assert.doesNotMatch(text, /GPU Scheduling Override|GPU DVFS Mode|GPU DVFS Offset/);
    assert.ok(text.indexOf("DVB偏移") < text.indexOf("SoC最高电压"));
    assert.ok(text.indexOf("SoC最高电压") < text.indexOf("高性能模式"));
    assert.ok(text.indexOf("内存VDD2电压") < text.indexOf("内存VDDQ电压"));
    assert.ok(text.indexOf("步进模式") < text.indexOf("内存最高频率"));
    assert.ok(text.indexOf("内存延迟编辑") < text.indexOf("内存时序优化"));
    assert.match(text, /数据风险|损坏/);
});

test("拒绝不合理的 Speedo", () => {
    const result = recommend({ ...base, cpuSpeedo: 5000 });
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /1200 到 2000/);
});

test("复制结果按安全设置、RAM、CPU、GPU展示并保留原参数", () => {
    const text = toText(recommend(base));
    const sections = text.split("\n").filter((line) => /^\[(安全设置|RAM|CPU|GPU)\]/.test(line));
    assert.equal(sections.length, 4);
    assert.match(sections[0], /^\[安全设置\] 解锁频率 建议打开$/);
    assert.match(sections[1], /^\[RAM\] DVB偏移 8/);
    assert.match(sections[2], /^\[CPU\] CPU低频降压 4/);
    assert.match(sections[3], /^\[GPU\] GPU降压模式 高降压/);
    assert.match(sections[1], /内存最高频率 2400 MHz/);
    assert.match(sections[2], /CPU最高频率 1963 MHz/);
    assert.match(sections[3], /GPU电压偏移 0/);
});

test("未知内存与Lite进阶场景仍按相同顺序显示安全建议", () => {
    const text = toText(recommend({ ...base, ramId: "UNKNOWN", model: "lite", mode: "plugged", goal: "performance" }));
    const sections = text.match(/^\[(安全设置|RAM|CPU|GPU)\].*$/gm);
    assert.equal(sections.length, 4);
    assert.match(sections[0], /^\[安全设置\] 解锁频率 建议打开$/);
    assert.match(sections[1], /^\[RAM\] DVB偏移 5/);
    assert.match(sections[2], /^\[CPU\]/);
    assert.match(sections[3], /^\[GPU\]/);
    assert.match(text, /未识别 RAM ID/);
    assert.match(text, /稳定性保证/);
});
