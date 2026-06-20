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
    assert.equal(result.ram.hpMode, "OFF");
    assert.equal(result.ram.dvbShift, 10);
    assert.equal(result.ram.latencyEditor, "2133 Latency Max");
    assert.equal(result.ram.timingReductions, "Common: (4-4-5) 4-2-6-5-6");
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
    assert.equal(result.ram.timingReductions, "保持默认 (Default)");
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
    assert.match(text, /CPU UV Table/);
    assert.match(text, /CPU Max Voltage/);
    assert.match(text, /CPU Max Clock/);
    assert.match(text, /CPU Boost Clock/);
    assert.ok(text.indexOf("CPU Low UV") < text.indexOf("CPU High UV"));
    assert.ok(text.indexOf("CPU High UV") < text.indexOf("CPU UV Table"));
    assert.ok(text.indexOf("GPU Undervolt Table") < text.indexOf("GPU VMIN"));
    assert.ok(text.indexOf("GPU VMIN") < text.indexOf("GPU Maximum Voltage"));
    assert.doesNotMatch(text, /GPU Scheduling Override|GPU DVFS Mode|GPU DVFS Offset/);
    assert.ok(text.indexOf("DVB Shift") < text.indexOf("SoC Max Volt"));
    assert.ok(text.indexOf("SoC Max Volt") < text.indexOf("HP Mode"));
    assert.ok(text.indexOf("RAM VDD2 Voltage") < text.indexOf("RAM VDDQ Voltage"));
    assert.ok(text.indexOf("Step Mode") < text.indexOf("RAM Max Clock"));
    assert.ok(text.indexOf("RAM Latency Editor") < text.indexOf("RAM Timing Reductions"));
    assert.match(text, /数据风险|损坏/);
});

test("拒绝不合理的 Speedo", () => {
    const result = recommend({ ...base, cpuSpeedo: 5000 });
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /1200 到 2000/);
});
