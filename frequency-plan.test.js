const test = require("node:test");
const assert = require("node:assert/strict");
const {recommend, toText} = require("./configurator.js");
const base = {cpuSpeedo:1651,gpuSpeedo:1677,socSpeedo:1688,ramId:"WT:F",model:"regular",mode:"handheld",goal:"performance"};

test("进阶按实际1683分界电压表筛选CPU档位，而不是HOS默认表或固定高频", () => {
    assert.equal(recommend({...base,cpuSpeedo:1400}).clocks.cpu,1683);
    assert.equal(recommend(base).clocks.cpu,1785);
    assert.equal(recommend({...base,cpuSpeedo:1800}).clocks.cpu,1963.5);
    assert.equal(recommend({...base,mode:"plugged"}).clocks.cpu,1963.5);
    assert.equal(recommend({...base,model:"lite"}).clocks.cpu,1683);
    assert.equal(recommend(base).frequencyPlan.cpu.estimatedMv,915);
});

test("HiOPT根据GPU Speedo估算并遵守掌机及供电场景边界", () => {
    assert.equal(recommend({...base,gpuSpeedo:1300}).clocks.gpu,460.8);
    assert.equal(recommend({...base,gpuSpeedo:1400}).clocks.gpu,614.4);
    assert.equal(recommend(base).clocks.gpu,768);
    assert.equal(recommend({...base,model:"lite"}).clocks.gpu,614.4);
    assert.equal(recommend({...base,mode:"plugged",gpuSpeedo:1400}).clocks.gpu,844.8);
    assert.equal(recommend({...base,mode:"plugged"}).clocks.gpu,998.4);
    assert.equal(recommend({...base,mode:"docked"}).clocks.gpu,1075.2);
    assert.equal(recommend({...base,mode:"docked"}).frequencyPlan.gpu.estimatedMv,695);
});

test("内存按可核对的3733与4266规格分档，未知速度等级保持1600", () => {
    for (const ramId of ["AM-MGCJ","MGCJ","NME"]) assert.equal(recommend({...base,ramId}).clocks.ramTarget,1866);
    for (const ramId of ["WT:B","WT:E","WT:F","AA-MGCL","AB-MGCL","NEE","X267"]) assert.equal(recommend({...base,ramId}).clocks.ramTarget,2133);
    for (const ramId of ["UNKNOWN","NEI","AA-MGCR","MGCR"]) assert.equal(recommend({...base,ramId}).clocks.ramTarget,1600);
    assert.equal(recommend({...base,ramId:"WT:B",goal:"balanced"}).clocks.ramTarget,1600);
});

test("保守进阶文本直接给配置，保留统一的升频顺序与估算来源", () => {
    const text=toText(recommend(base));
    assert.match(text,/进阶配置/);
    assert.match(text,/CPU运行频率.*1785/);
    assert.match(text,/GPU运行频率.*768/);
    assert.match(text,/RAM运行频率.*2133/);
    assert.match(text,/估算.*不是.*电压|不是.*实测/);
    assert.match(text,/1600.*1866.*2133/);
    assert.doesNotMatch(text,/待实机验证|安全上限|体质良好/);
});

test("进阶低高Speedo不会改变最低电压或越过当前KIP表", () => {
    for (const cpuSpeedo of [1200,1300,1400,1651,1800,2000]) {
        for (const gpuSpeedo of [1200,1300,1400,1677,1800,1850,2000]) {
            const r=recommend({...base,cpuSpeedo,gpuSpeedo,mode:"docked"});
            assert.ok(r.clocks.cpu<=1963.5);
            assert.ok(r.clocks.gpu<=1075.2);
            assert.equal(r.cpu.lowUvStart,0);
            assert.equal(r.cpu.highUvStart,0);
            assert.equal(r.cpu.lowVmin,"620 mV");
            assert.equal(r.gpu.vmin,"610 mV");
            assert.equal(r.ram.dvbShift,0);
        }
    }
    assert.equal(recommend({...base,gpuSpeedo:1850}).clocks.gpu,384);
});
