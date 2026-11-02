const test=require("node:test");
const assert=require("node:assert/strict");
const {findRamProfile,recommend,configSections,toText}=require("./configurator");
const base={cpuSpeedo:1651,gpuSpeedo:1677,socSpeedo:1688,ramId:"WT:F",model:"regular",mode:"handheld",goal:"balanced"};

test("颗粒别名规范化和未知值",()=>{
    assert.equal(findRamProfile(" wt:f ").id,"WT:F");
    assert.equal(findRamProfile("aa-mgcr").id,"AA-MGCR / MGCR");
    assert.equal(findRamProfile("unknown"),null);
});
test("拒绝无效数字/空颗粒/机型和额外场景",()=>{
    for(const input of [{...base,cpuSpeedo:NaN},{...base,gpuSpeedo:Infinity},{...base,socSpeedo:5000},{...base,ramId:" "},{...base,ramId:"x".repeat(33)},{...base,model:"erista"},{...base,mode:"docked"},{...base,goal:"bad"}])assert.equal(recommend(input).ok,false);
    assert.equal(toText(null),"无法生成配置");
});
test("共享输出顺序为安全RAMCPUGPU并区分运行档与KIP",()=>{
    for(const goal of ["balanced","performance"]) {
        const r=recommend({...base,goal});
        assert.deepEqual(configSections(r).map(s=>s.textLabel),["安全设置","RAM","CPU","GPU"]);
        const text=toText(r);
        assert.match(text,/解锁频率 建议打开/);assert.match(text,/KIP上限/);
        assert.match(text,/冷启动/);assert.match(text,/休眠/);assert.match(text,/备份/);
        assert.match(text,/不是.*实测/);
    }
});
test("识别颗粒与Speedo不构成稳定性结论",()=>{
    const r=recommend(base);
    assert.match(r.warnings.join("\n"),/Speedo.*不能/);
    assert.match(r.warnings.join("\n"),/损坏/);
    assert.doesNotMatch(JSON.stringify(r.diagnosis),/良好|体质好/);
});
test("整数Speedo分档不能被小数输入绕过",()=>{
    for(const key of ["cpuSpeedo","gpuSpeedo","socSpeedo"]) {
        const r=recommend({...base,goal:"performance",[key]:1624.1});
        assert.equal(r.ok,false);
        assert.match(r.errors.join("\n"),/整数/);
    }
});
