import test from 'node:test';
import assert from 'node:assert/strict';
import gateway from '../pages-gateway/_worker.js';

test('Pages入口透传请求的公开地址、Origin、Cookie和POST内容',async()=>{
    const seen=[];
    const env={HOC_SERVICE:{fetch:async request=>{
        seen.push({url:request.url,origin:request.headers.get('Origin'),cookie:request.headers.get('Cookie'),body:await request.text()});
        return new Response(null,{status:303,headers:{Location:'/admin','Set-Cookie':'__Secure-hoc_admin=token; Secure; HttpOnly; Path=/admin','Cache-Control':'no-store'}});
    }}};
    const response=await gateway.fetch(new Request('https://hoshino-hoc.pages.dev/admin/login',{method:'POST',headers:{Origin:'https://hoshino-hoc.pages.dev',Cookie:'existing=one'},body:'password=test'}),env);
    assert.equal(response.status,303);
    assert.equal(response.headers.get('Location'),'/admin');
    assert.match(response.headers.get('Set-Cookie'),/Secure; HttpOnly/);
    assert.deepEqual(seen,[{url:'https://hoshino-hoc.pages.dev/admin/login',origin:'https://hoshino-hoc.pages.dev',cookie:'existing=one',body:'password=test'}]);
});

test('只代理指定路由，不开放任意目标；缺绑定和服务失败关闭入口',async()=>{
    const service={HOC_SERVICE:{fetch:async()=>new Response('ready',{status:200})}};
    for(const path of ['/admin','/admin/app.js','/admin/api/samples?ram=NEE','/api/device-samples','/healthz'])assert.equal((await gateway.fetch(new Request('https://test'+path),service)).status,200);
    assert.equal((await gateway.fetch(new Request('https://test/elsewhere'),service)).status,404);
    assert.equal((await gateway.fetch(new Request('https://test/admin'),{})).status,503);
    assert.equal((await gateway.fetch(new Request('https://test/admin'),{HOC_SERVICE:{fetch:async()=>{throw new Error('down');}}})).status,503);
    assert.equal((await gateway.fetch(new Request('https://test/'),service)).headers.get('Location'),'/admin');
});
