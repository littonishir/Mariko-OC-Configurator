import { renderAdminPage, dashboardScript } from './admin-page.mjs';

const COOKIE = '__Secure-hoc_admin';
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2,'0')).join('');
const digest = value => crypto.subtle.digest('SHA-256', encoder.encode(value));
function response(body, status = 200, headers = {}) {
    return new Response(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', ...headers } });
}
function page(loggedIn, status = 200, error = false) {
    const nonce = crypto.randomUUID();
    return response(renderAdminPage({ nonce, loggedIn, error }), status, { 'Content-Type':'text/html; charset=utf-8', 'Content-Security-Policy':`default-src 'none'; style-src 'nonce-${nonce}'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'` });
}
function sessionToken(request) {
    const token = request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
const cookieHeader = (value, maxAge) => `${COOKIE}=${value}; Path=/admin; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
async function readPassword(request) {
    if (Number(request.headers.get('Content-Length')) > 512) return { status:413 };
    if (!request.body) return { status:400 };
    const reader = request.body.getReader();
    let size=0, text=''; const decoder=new TextDecoder('utf-8',{fatal:true});
    try {
        while(true) {
            const {done,value}=await reader.read(); if(done)break;
            size+=value.byteLength;
            if(size>512){await reader.cancel();return {status:413};}
            text+=decoder.decode(value,{stream:true});
        }
        text+=decoder.decode();
        return { password:new URLSearchParams(text).get('password') || '' };
    } catch (_) {return {status:400};} finally {reader.releaseLock();}
}

export async function handleAdmin(request, env) {
    const url = new URL(request.url), path=url.pathname;
    if (!env.DB || !env.ADMIN_LOGIN_LIMITER || !/^[a-f0-9]{64}$/i.test(env.ADMIN_PASSWORD_HASH || '')) return response('后台暂不可用',503);
    try {
        const origin=request.headers.get('Origin');
        if (origin && origin!==url.origin) return response('Forbidden',403);
        if (path==='/admin/login' && request.method==='POST') {
            if (origin!==url.origin) return response('Forbidden',403);
            const key=hex(await digest(request.headers.get('CF-Connecting-IP') || 'unknown'));
            if (!(await env.ADMIN_LOGIN_LIMITER.limit({key})).success) return response('登录尝试过多，请一分钟后重试。',429,{'Retry-After':'60'});
            if (request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/x-www-form-urlencoded') return response('Unsupported Media Type',415);
            const parsed=await readPassword(request);if(parsed.status)return response('请求无效',parsed.status);
            const supplied=await digest(parsed.password), expected=Uint8Array.from(env.ADMIN_PASSWORD_HASH.match(/../g),x=>parseInt(x,16));
            if(!crypto.subtle.timingSafeEqual(supplied,expected)) return page(false,401,true);
            const token=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
            const now=Math.floor(Date.now()/1000);
            await env.DB.batch([
                env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now),
                env.DB.prepare('INSERT INTO admin_sessions(token_hash,expires_at,created_at) VALUES(?,?,?)').bind(hex(await digest(token)),now+SESSION_SECONDS,now)
            ]);
            return response(null,303,{Location:'/admin','Set-Cookie':cookieHeader(token,SESSION_SECONDS)});
        }
        const token=sessionToken(request), tokenHash=token ? hex(await digest(token)):null;
        const session=tokenHash ? await env.DB.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash=? AND expires_at>?').bind(tokenHash,Math.floor(Date.now()/1000)).first():null;
        if (path==='/admin' || path==='/admin/') {
            if(request.method!=='GET')return response('Method Not Allowed',405);
            return page(!!session);
        }
        if(!session)return response('Unauthorized',401);
        if(path==='/admin/logout' && request.method==='POST') {
            if(origin!==url.origin)return response('Forbidden',403);
            await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(tokenHash).run();
            return response(null,303,{Location:'/admin','Set-Cookie':cookieHeader('',0)});
        }
        if(request.method!=='GET')return response('Method Not Allowed',405);
        if(path==='/admin/app.js')return response(dashboardScript,200,{'Content-Type':'application/javascript; charset=utf-8'});
        if(path!=='/admin/api/samples')return response('Not Found',404);
        const rawPage=url.searchParams.get('page') || '0', ram=(url.searchParams.get('ram') || '').trim().toUpperCase(), model=url.searchParams.get('model') || '';
        if(!/^\d{1,5}$/.test(rawPage) || Number(rawPage)>10000 || ram.length>32 || /[\p{Cc}\p{Cf}]/u.test(ram) || (model && !['regular','lite'].includes(model)))return response('筛选条件无效',400);
        const clauses=[],params=[];
        if(ram){clauses.push('ram_id=?');params.push(ram);}if(model){clauses.push('model=?');params.push(model);}
        const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
        const results=await env.DB.batch([
            env.DB.prepare('SELECT COUNT(*) AS parameter_sets, COALESCE(SUM(submission_count),0) AS submissions, COUNT(DISTINCT ram_id) AS ram_types FROM device_samples'+where).bind(...params),
            env.DB.prepare('SELECT cpu_speedo,gpu_speedo,soc_speedo,ram_id,model,last_mode,last_goal,submission_count,first_seen_at,last_seen_at FROM device_samples'+where+' ORDER BY last_seen_at DESC,id DESC LIMIT 25 OFFSET ?').bind(...params,Number(rawPage)*25)
        ]);
        return response(JSON.stringify({summary:results[0].results[0],rows:results[1].results,page:Number(rawPage)}),200,{'Content-Type':'application/json; charset=utf-8'});
    } catch (_) {console.error(JSON.stringify({event:'admin_request_failed'}));return response('后台暂不可用，请稍后重试。',503);}
}
