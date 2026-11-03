import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { dashboardScript } from './admin-page.mjs';

test('第二页修改筛选后点刷新，自动回到第一页，防止第2/1页空结果',async()=>{
    const nodes=new Map(),listeners=new Map(),values={ram:'',model:''},requests=[];
    function node(key){if(!nodes.has(key))nodes.set(key,{textContent:'',disabled:false,append(){},replaceChildren(){},addEventListener(type,fn){listeners.set(key+type,fn);}});return nodes.get(key);}
    const context={
        document:{querySelector:node,querySelectorAll:()=>[],createElement:()=>node(Symbol())},
        window:{location:{assign(){}}},AbortController,URLSearchParams,Intl,Date,
        FormData:class{*[Symbol.iterator](){yield* Object.entries(values);}},
        fetch:async url=>{requests.push(url);return {ok:true,status:200,json:async()=>({summary:{parameter_sets:values.ram?1:30,submissions:30,ram_types:2},rows:[]})};}
    };
    vm.runInNewContext(dashboardScript,context);
    const settle=()=>new Promise(resolve=>setImmediate(resolve));
    await settle();
    listeners.get('#nextclick')();await settle();
    assert.equal(new URL(requests.at(-1),'https://test').searchParams.get('page'),'1');
    values.ram='NEE';listeners.get('#refreshclick')();await settle();
    assert.equal(new URL(requests.at(-1),'https://test').searchParams.get('page'),'0');
    assert.match(node('#status').textContent,/第 1 \/ 1 页/);
});
