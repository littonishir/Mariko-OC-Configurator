const test = require("node:test");
const assert = require("node:assert/strict");
const { findRamProfile, recommend, configSections, toText } = require("./configurator.js");

const base = {
    cpuSpeedo: 1651, gpuSpeedo: 1677, socSpeedo: 1688,
    ramId: "WT:F", model: "regular", mode: "handheld", goal: "balanced"
};

test("识别内存别名而不把识别结果作为稳定频率保证", () => {
    assert.equal(findRamProfile(" wt:f ").id, "WT:F");
    assert.equal(findRamProfile("aa-mgcr").id, "AA-MGCR / MGCR");
    assert.equal(findRamProfile("unknown"), null);
});

test("首次配置从1600内存和非超频运行值排查而非直接2400", () => {
    const result = recommend(base);
    assert.equal(result.ok, true);
    assert.equal(result.clocks.cpu, 1020);
    assert.equal(result.clocks.gpu, 384);
    assert.equal(result.clocks.ramStart, 1600);
    assert.equal(result.clocks.ramTarget, 1600);
    assert.equal(result.ram.maxClock, "2133 MHz");
    assert.equal(result.risk, "保守配置");
});

test("CPU和GPU保持HOC2.6.0默认而非套用额外降压和2601加速", () => {
    const result = recommend(base);
    assert.deepEqual(result.cpu, {
        boostClock: 1963.5, maxClock: 1963.5, uvTable: 1683,
        lowUvStart: 0, highUvStart: 0, lowVmin: "620 mV",
        highVmin: "750 mV", voltageLimit: "1120 mV"
    });
    assert.deepEqual(result.gpu, {table: "HiOPT（HOC 默认）", vmin: "610 mV", vmax: "800 mV", voltageOffset: "0"});
});

test("默认内存不套用Common或ST且DVB和时序恢复原始默认", () => {
    const result = recommend(base);
    assert.equal(result.ram.dvbShift, 0);
    assert.equal(result.ram.hpMode, "关闭");
    assert.equal(result.ram.stepMode, "JEDEC");
    assert.equal(result.ram.vdd2, "1175 mV");
    assert.equal(result.ram.vddq, "600 mV");
    assert.match(result.ram.timingReductions, /t1.*t8.*0/);
    assert.match(result.ram.latencyEditor, /默认/);
    assert.doesNotMatch(result.ram.timingReductions, /Common:|ST:/);
});

test("两套配置只改变运行频率而不自动增加降压或修改时序", () => {
    const normal = recommend(base);
    const advanced = recommend({...base, goal: "performance"});
    assert.deepEqual(advanced.cpu, normal.cpu);
    assert.deepEqual(advanced.gpu, normal.gpu);
    assert.deepEqual(advanced.ram, normal.ram);
    assert.ok(advanced.clocks.cpu > normal.clocks.cpu);
    assert.ok(advanced.clocks.gpu > normal.clocks.gpu);
    assert.equal(advanced.clocks.ramStart, 1600);
    const notes = Object.values(advanced.tuningNotes).flat().join("\n");
    assert.match(notes, /1866/);
    assert.match(notes, /一项|一个变量/);
    assert.equal(advanced.risk, "进阶配置");
});

test("未知内存不输出颗粒时序或高频目标", () => {
    for (const goal of ["balanced", "performance"]) {
        const result = recommend({...base, ramId: "UNKNOWN", goal});
        assert.equal(result.ram.recognized, false);
        assert.equal(result.clocks.ramTarget, 1600);
        assert.equal(result.ram.dvbShift, 0);
        assert.match(result.warnings.join("\n"), /未识别 RAM ID/);
        assert.doesNotMatch(Object.values(result.tuningNotes).flat().join("\n"), /2400|ST:|Common:/);
    }
});

test("Speedo只作记录不能被标为良好或用来推导降压值", () => {
    const low = recommend({...base, cpuSpeedo: 1400, gpuSpeedo: 1400, socSpeedo: 1400});
    const high = recommend({...base, cpuSpeedo: 1800, gpuSpeedo: 1800, socSpeedo: 1800});
    assert.deepEqual(low.cpu, high.cpu);
    assert.deepEqual(low.gpu, high.gpu);
    for (const part of ["cpu", "gpu", "soc"]) {
        assert.match(high.diagnosis[part].label, /参考|记录/);
        assert.doesNotMatch(high.diagnosis[part].label, /良好|体质好/);
    }
    assert.match(high.warnings.join("\n"), /Speedo.*不能/);
});

test("各内存机型场景与模式都保持默认电压与时序及频率边界", () => {
    // 14 个别名及 1 个未知值 × 2 机型 × 3 场景 × 2 配置 = 180 组。
    for (const ramId of ["WT:B", "NEI", "NEE", "X267", "AA-MGCL", "AA-MGCR", "MGCL", "MGCR", "WT:E", "AM-MGCJ", "MGCJ", "WT:F", "AB-MGCL", "NME", "UNKNOWN"]) {
        for (const model of ["regular","lite"]) {
            for (const mode of ["handheld","plugged","docked"]) {
                for (const goal of ["balanced","performance"]) {
                    const result = recommend({...base,ramId,model,mode,goal});
                    assert.equal(result.ok,true);
                    assert.ok(result.clocks.cpu >= 1020 && result.clocks.cpu <= 1963.5);
                    assert.ok(result.clocks.gpu >= 384 && result.clocks.gpu <= 1075.2);
                    assert.ok(result.clocks.ramTarget >= 1600 && result.clocks.ramTarget <= 2133);
                    if (goal === "balanced") {
                        assert.equal(result.clocks.cpu,1020);
                        assert.equal(result.clocks.gpu,mode === "handheld" ? 384 : 768);
                        assert.equal(result.clocks.ramTarget,1600);
                    }
                    assert.equal(result.cpu.boostClock,1963.5);
                    assert.equal(result.ram.dvbShift,0);
                    assert.match(result.ram.timingReductions,/t1.*t8.*0/);
                }
            }
        }
    }
});

test("复制文本区分运行频率与KIP上限并包含回退与验证顺序", () => {
    const result = recommend(base);
    const text = toText(result);
    const sections = text.split("\n").filter(line => /^\[(安全设置|RAM|CPU|GPU)\]/.test(line));
    assert.equal(sections.length,4);
    assert.match(sections[0], /^\[安全设置\].*解锁频率.*建议打开/);
    assert.match(sections[0], /解锁.*不.*高频/);
    assert.match(sections[1], /^\[RAM\].*运行频率.*1600/);
    assert.match(sections[2], /^\[CPU\].*运行频率.*1020/);
    assert.match(sections[3], /^\[GPU\].*运行频率.*384/);
    assert.match(sections[1],/KIP上限.*2133/);
    assert.match(sections[2],/KIP上限.*1963.5/);
    assert.match(text,/验证顺序/);
    assert.match(text,/回退/);
    assert.match(text,/冷启动/);
    assert.match(text,/休眠/);
    assert.doesNotMatch(text,/安全上限|安全起点|直接填写值|2601|590 mV|580 mV/);
    assert.deepEqual(configSections(result).map(section => section.textLabel), ["安全设置", "RAM", "CPU", "GPU"]);
});

test("风险提示承认历史故障和默认值不等于稳定保证", () => {
    const warnings = recommend(base).warnings.join("\n");
    assert.match(warnings,/旧版|历史/);
    assert.match(warnings,/无法启动|进不去系统/);
    assert.match(warnings,/默认.*不.*稳定/);
    assert.match(warnings,/备份/);
    assert.match(warnings,/损坏/);
});

test("拒绝无效硬件输入和场景", () => {
    for (const input of [
        {...base,cpuSpeedo:5000}, {...base,gpuSpeedo:NaN},
        {...base,socSpeedo:Infinity}, {...base,ramId:" "},
        {...base,model:"erista"}, {...base,mode:"bad"}, {...base,goal:"bad"},
        {...base,ramId:"x".repeat(33)}
    ]) {
        assert.equal(recommend(input).ok,false);
    }
    assert.equal(toText({ok:false}),"无法生成配置");
});
