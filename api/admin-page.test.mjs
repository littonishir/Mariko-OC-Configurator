import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { formatBeijing, renderAdminPage, dashboardScript } from './admin-page.mjs';

test('时间转换为北京时间，空值或非法值显示占位',()=>{
    assert.equal(formatBeijing('2026-11-03T04:54:00.238Z'),'2026/11/03 12:54:00');
    assert.equal(formatBeijing(''), '—');
    assert.equal(formatBeijing('bad'), '—');
});
test('页面是静态外壳，数据与密码不嵌入HTML；脚本独立且可解析',()=>{
    const page=renderAdminPage({nonce:'test-nonce',loggedIn:true});
    assert.match(page,/北京时间/);assert.match(page,/参数组合/);assert.match(page,/\/admin\/app.js/);
    assert.doesNotMatch(page,/ADMIN_PASSWORD_HASH|token_hash|cpu_speedo|1662/);
    assert.match(renderAdminPage({nonce:'n',error:true}),/密码不正确/);
    assert.doesNotThrow(()=>new vm.Script(dashboardScript));
});
