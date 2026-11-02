const test = require("node:test");
const assert = require("node:assert/strict");
const {recommend, toText} = require("./configurator.js");
const base = {cpuSpeedo:1651,gpuSpeedo:1677,socSpeedo:1688,ramId:"WT:F",model:"regular",mode:"handheld",goal:"performance"};

test("已确认指南档为1866内存及掌机1581/614.4、插电1785/768", () => {
    for (const model of ["regular","lite"]) {
        const h=recommend({...base,model,goal:"balanced"});
        assert.deepEqual(h.clocks,{cpu:1581,gpu:614.4,ramStart:1866,ramTarget:1866});
        const p=recommend({...base,model,mode:"plugged",goal:"balanced"});
        assert.deepEqual(p.clocks,{cpu:1785,gpu:768,ramStart:1866,ramTarget:1866});
        assert.equal(h.risk,"指南安全上限");
        assert.equal(h.cpu.highUvStart,0);
        assert.equal(h.ram.vddq,"600 mV");
        assert.equal(h.ram.maxClock,"1866 MHz");
    }
});

test("进阶CPU按电压表选频且超过1963.5时才使用最小高频降压1", () => {
    const h=recommend(base);
    assert.equal(h.clocks.cpu,1963.5);
    assert.equal(h.cpu.highUvStart,0);
    assert.equal(h.frequencyPlan.cpu.estimatedMv,995);
    const p=recommend({...base,mode:"plugged"});
    assert.equal(p.clocks.cpu,2193);
    assert.equal(p.cpu.maxClock,2193);
    assert.equal(p.cpu.lowUvStart,0);
    assert.equal(p.cpu.highUvStart,1);
    assert.equal(p.frequencyPlan.cpu.estimatedMv,1065);
    assert.equal(p.cpu.boostClock,1963.5);
    assert.equal(recommend({...base,mode:"plugged",cpuSpeedo:1800}).clocks.cpu,2295);
    assert.equal(recommend({...base,mode:"plugged",cpuSpeedo:1849}).clocks.cpu,2397);
});

test("GPU继续HiOPT，按Speedo估算与机型限制选档", () => {
    assert.equal(recommend({...base,gpuSpeedo:1400}).clocks.gpu,691.2);
    assert.equal(recommend(base).clocks.gpu,921.6);
    assert.equal(recommend({...base,model:"lite"}).clocks.gpu,768);
    const p=recommend({...base,mode:"plugged"});
    assert.equal(p.clocks.gpu,1075.2);
    assert.equal(p.frequencyPlan.gpu.estimatedMv,695);
    assert.equal(recommend({...base,mode:"plugged",model:"lite"}).clocks.gpu,921.6);
});

test("内存经验与GPU最低电压一起筛选，避免单看颗粒等级", () => {
    for(const ramId of ["WT:B","WT:E","WT:F","AA-MGCL","MGCR","NEI","NEE","X267"]) {
        const r=recommend({...base,ramId});
        assert.equal(r.clocks.ramTarget,2400);
        assert.equal(r.ram.maxClock,"2400 MHz");
        assert.equal(r.frequencyPlan.ram.requiredGpuMv,610);
    }
    for(const ramId of ["AM-MGCJ","NME","AB-MGCL"]) assert.equal(recommend({...base,ramId}).clocks.ramTarget,2133);
    assert.equal(recommend(base).ram.vddq,"600 mV");
    assert.equal(recommend({...base,ramId:"NEE"}).ram.vddq,"640 mV");
    assert.equal(recommend({...base,ramId:"NME"}).ram.vddq,"640 mV");
    const unknown=recommend({...base,ramId:"UNKNOWN"});
    assert.equal(unknown.clocks.ramTarget,1866);
    assert.equal(unknown.ram.vddq,"600 mV");
});

test("GPU分档临界1625以2.6.0代码为准，不照抄网页计算器差一值边界", () => {
    assert.equal(recommend({...base,gpuSpeedo:1624}).clocks.ramTarget,2133);
    assert.equal(recommend({...base,gpuSpeedo:1625}).clocks.ramTarget,2400);
    for(const [s,b] of [[1624,0],[1625,1],[1689,1],[1690,2],[1753,2],[1754,3]]) {
        assert.equal(recommend({...base,gpuSpeedo:s}).frequencyPlan.gpu.bracket,b);
    }
});

test("超出参考范围不外推对应项目", () => {
    assert.equal(recommend({...base,cpuSpeedo:1200}).clocks.cpu,1581);
    assert.equal(recommend({...base,gpuSpeedo:1850}).clocks.gpu,614.4);
    assert.equal(recommend({...base,gpuSpeedo:1850}).clocks.ramTarget,1866);
});

test("完整方案不抄紧时序，不降低用户指定最低电压", () => {
    for(const ramId of ["WT:F","NME","WT:B","NEI","UNKNOWN"]) for(const model of ["regular","lite"]) for(const mode of ["handheld","plugged"]) for(const goal of ["balanced","performance"]) {
        const r=recommend({...base,ramId,model,mode,goal});
        assert.equal(r.cpu.lowVmin,"620 mV");assert.equal(r.cpu.highVmin,"750 mV");
        assert.equal(r.gpu.vmin,"610 mV");assert.equal(r.gpu.table,"HiOPT（HOC 默认）");
        assert.equal(r.cpu.lowUvStart,0);assert.ok([0,1].includes(r.cpu.highUvStart));
        assert.equal(r.cpu.voltageLimit,"1120 mV");assert.equal(r.gpu.voltageOffset,"0");
        assert.equal(r.ram.dvbShift,0);assert.equal(r.ram.hpMode,"关闭");
        assert.match(r.ram.timingReductions,/t1.*t8.*0/);
        assert.ok(r.clocks.cpu<=r.cpu.maxClock);
        assert.ok(r.clocks.cpu<=2397 && r.clocks.ramTarget<=2400);
        assert.ok(r.frequencyPlan.ram.requiredGpuMv<=610);
    }
});

test("复制输出是所选单套方案，包含逐项提高和UV失败回退", () => {
    const text=toText(recommend({...base,mode:"plugged"}));
    assert.match(text,/进阶性能/);assert.match(text,/CPU运行频率.*2193/);
    assert.match(text,/CPU高频降压 1/);assert.match(text,/RAM运行频率.*2400/);
    assert.match(text,/1866.*2133.*2400/);assert.match(text,/回退/);
    assert.doesNotMatch(text,/待实机验证|\[保守配置\]|\[进阶配置\]|Common:|ST:/);
});
