import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions, Log, LogLevel } from 'miniflare';

const password = 'test-only-password-not-production-123';
async function setup(t, { hash = true, limiter = true, limit = 5 } = {}) {
    const mf = new Miniflare(convertV4MiniflareOptions({
        modules: ['worker.mjs','admin.mjs','admin-page.mjs'].map(name=>({type:'ESModule',path:fileURLToPath(new URL(name,import.meta.url)),contents:readFileSync(new URL(name,import.meta.url),'utf8')})), compatibilityDate: '2026-11-03',
        d1Databases: ['DB'], bindings: { ADMIN_PASSWORD_HASH: hash ? createHash('sha256').update(password).digest('hex') : '', ALLOWED_ORIGINS: 'https://littonishir.github.io' },
        ratelimits: { ...(limiter ? { ADMIN_LOGIN_LIMITER: { namespace_id: '11032027', simple: { limit, period: 60 } } } : {}), INTAKE_LIMITER: { namespace_id: '11032026', simple: { limit: 120, period: 60 } } },
        log: new Log(LogLevel.NONE)
    }));
    t.after(() => mf.dispose());
    const db = await mf.getD1Database('DB');
    await db.batch(readFileSync(new URL('schema.sql', import.meta.url), 'utf8').split(';').filter(s => s.trim()).map(s => db.prepare(s)));
    const request = (path = '/admin', options = {}) => mf.dispatchFetch(`https://samples.test${path}`, { redirect: 'manual', ...options });
    const login = (value = password, origin = 'https://samples.test') => request('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin }, body: new URLSearchParams({ password: value }).toString() });
    const auth = async () => (await login()).headers.get('Set-Cookie')?.split(';')[0];
    return { mf, db, request, login, auth };
}

test('未登录只见登录页，管理API拒绝且不允许跨域读取', async t => {
    const { request } = await setup(t);
    const page = await request();
    assert.equal(page.status, 200);
    assert.match(await page.text(), /后台登录/);
    assert.equal(page.headers.get('Cache-Control'), 'no-store');
    assert.equal(page.headers.get('Referrer-Policy'), 'same-origin', '原生同源表单必须保留 Origin，不能被 no-referrer 变成 null');
    assert.match(page.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    const data = await request('/admin/api/samples');
    assert.equal(data.status, 401);
    assert.equal(data.headers.get('Access-Control-Allow-Origin'), null);
});

test('登录Cookie受保护，会话只存哈希；篡改和过期会话拒绝', async t => {
    const { request, login, db } = await setup(t);
    assert.equal((await login('wrong')).status, 401);
    const ok = await login();
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.get('Location'), '/admin');
    const setCookie = ok.headers.get('Set-Cookie');
    for (const expected of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/admin', 'Max-Age=28800']) assert.ok(setCookie.includes(expected));
    const cookie = setCookie.split(';')[0];
    const [session] = (await db.prepare('SELECT * FROM admin_sessions').all()).results;
    assert.equal(session.token_hash.length, 64);
    assert.equal(session.token_hash.includes(cookie.split('=')[1]), false);
    assert.equal((await request('/admin/api/samples', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await request('/admin/api/samples', { headers: { Cookie: cookie + 'x' } })).status, 401);
    await db.prepare('UPDATE admin_sessions SET expires_at=0').run();
    assert.equal((await request('/admin/api/samples', { headers: { Cookie: cookie } })).status, 401);
});

test('退出立即撤销会话，旧Cookie不能重放', async t => {
    const { request, auth } = await setup(t);
    const cookie = await auth();
    const logout = await request('/admin/logout', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://samples.test' } });
    assert.equal(logout.status, 303);
    assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
    assert.equal((await request('/admin/api/samples', { headers: { Cookie: cookie } })).status, 401);
});

test('跨域登录和退出拒绝，登录限流和缺绑定关闭后台', async t => {
    const { login, request, auth } = await setup(t);
    assert.equal((await login(password, 'https://evil.test')).status, 403);
    const cookie = await auth();
    assert.equal((await request('/admin/logout', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.test' } })).status, 403);
    assert.equal((await request('/admin/api/samples', { headers: { Cookie: cookie, Origin: 'https://evil.test' } })).status, 403);
    const limited = await setup(t, { limit: 1 });
    assert.equal((await limited.login('wrong')).status, 401);
    assert.equal((await limited.login()).status, 429);
    for (const options of [{ hash: false }, { limiter: false }]) assert.equal((await (await setup(t, options)).request()).status, 503);
});

test('后台只读过滤和分页统计正确，未知颗粒按文字返回', async t => {
    const { db, request, auth } = await setup(t);
    const statements = Array.from({ length: 31 }, (_, i) => db.prepare(`INSERT INTO device_samples(cpu_speedo,gpu_speedo,soc_speedo,ram_id,model,last_mode,last_goal,last_app_version,first_seen_at,last_seen_at,submission_count) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(1600+i,1700,1700,i===30?'<img src=x onerror=alert(1)>':'WT:F','regular','plugged','performance','test','2026-11-03T00:00:00Z',`2026-11-03T00:00:${String(i).padStart(2,'0')}Z`,2));
    await db.batch(statements);
    const cookie = await auth(), headers = { Cookie: cookie };
    const response = await request('/admin/api/samples', { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const data = await response.json();
    assert.deepEqual(data.summary, { parameter_sets: 31, submissions: 62, ram_types: 2 });
    assert.equal(data.rows.length, 25);
    assert.equal(data.rows[0].ram_id, '<img src=x onerror=alert(1)>');
    const page = await (await request('/admin/api/samples?page=1', { headers })).json();
    assert.equal(page.rows.length, 6);
    const filtered = await (await request('/admin/api/samples?ram=wt%3Af&model=regular', { headers })).json();
    assert.equal(filtered.summary.parameter_sets, 30);
    for (const query of ['page=-1','page=1.5','page=10001','ram='+ 'x'.repeat(33),'model=erista']) assert.equal((await request('/admin/api/samples?'+query,{headers})).status,400);
    const empty = await (await request('/admin/api/samples?ram=none',{headers})).json();
    assert.equal(empty.summary.parameter_sets,0);
    assert.deepEqual(empty.rows,[]);
    assert.equal((await request('/admin/api/samples', { method:'DELETE',headers })).status,405);
});

test('登录限制实际体积，不回显密码', async t => {
    const { request, login } = await setup(t);
    assert.equal((await login('p'.repeat(600))).status,413);
    const bad = await login('sensitive-wrong-password');
    assert.doesNotMatch(await bad.text(), /sensitive-wrong-password/);
    assert.equal((await request('/admin/login',{method:'POST',headers:{Origin:'https://samples.test','Content-Type':'application/json'},body:'{}'})).status,415);
});
