export function formatBeijing(value) {
    if (!value || !Number.isFinite(new Date(value).getTime())) return '—';
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value));
}

function dashboardClient() {
    const form = document.querySelector('#filters'), body = document.querySelector('#rows'), status = document.querySelector('#status');
    const previous = document.querySelector('#previous'), next = document.querySelector('#next');
    let page = 0, activeRequest, sequence = 0, lastFilters = '';
    const labels = { regular: '续航版 / OLED', lite: 'Lite', handheld: '掌机', plugged: '底座', balanced: '指南安全上限', performance: '进阶性能' };
    function notice(message) {
        body.replaceChildren();
        const row = document.createElement('tr'), cell = document.createElement('td');
        cell.colSpan = 9; cell.textContent = message; cell.className = 'empty'; row.append(cell); body.append(row);
    }
    async function load() {
        const current = ++sequence;
        activeRequest?.abort(); activeRequest = new AbortController();
        const query = new URLSearchParams(new FormData(form));
        if (query.toString() !== lastFilters) { page = 0; lastFilters = query.toString(); }
        query.set('page', String(page));
        status.textContent = '正在读取…'; notice('加载中…'); previous.disabled = true; next.disabled = true;
        document.querySelectorAll('[data-stat]').forEach(el => { el.textContent = '—'; });
        try {
            const response = await fetch('/admin/api/samples?' + query, { signal: activeRequest.signal, cache: 'no-store' });
            if (response.status === 401) { window.location.assign('/admin'); return; }
            if (!response.ok) throw new Error('加载失败，请稍后刷新。');
            const data = await response.json();
            if (current !== sequence) return;
            for (const el of document.querySelectorAll('[data-stat]')) el.textContent = Number(data.summary[el.dataset.stat]).toLocaleString('zh-CN');
            body.replaceChildren();
            for (const item of data.rows) {
                const tr = document.createElement('tr');
                const values = [item.cpu_speedo, item.gpu_speedo, item.soc_speedo, item.ram_id, labels[item.model] || item.model, labels[item.last_mode] || item.last_mode, labels[item.last_goal] || item.last_goal, item.submission_count, formatBeijing(item.last_seen_at)];
                values.forEach((value, index) => { const td = document.createElement('td'); td.textContent = String(value); if (index === 3) td.className = 'ram'; tr.append(td); });
                body.append(tr);
            }
            if (!data.rows.length) notice('暂无匹配的参数样本');
            const pages = Math.max(1, Math.ceil(data.summary.parameter_sets / 25));
            status.textContent = '第 ' + (page + 1) + ' / ' + pages + ' 页 · ' + formatBeijing(new Date().toISOString()) + ' 更新';
            previous.disabled = page === 0; next.disabled = (page + 1) * 25 >= data.summary.parameter_sets || page >= 10000;
        } catch (error) {
            if (current !== sequence || error.name === 'AbortError') return;
            status.textContent = '读取失败'; notice('暂时无法读取数据，请点击刷新重试。');
        }
    }
    form.addEventListener('submit', event => { event.preventDefault(); page = 0; load(); });
    document.querySelector('#refresh').addEventListener('click', () => load());
    previous.addEventListener('click', () => { if (page > 0) { page--; load(); } });
    next.addEventListener('click', () => { page++; load(); });
    load();
}

export const dashboardScript = formatBeijing.toString() + '\n(' + dashboardClient.toString() + ')();';

const style = `
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:#0a0d0f;color:#f2f4ed}*{box-sizing:border-box}body{margin:0}main{max-width:1450px;margin:0 auto;padding:44px 28px}header{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:30px}.eyebrow{color:#c8f15b;letter-spacing:.16em;font-size:12px;font-weight:700}h1{font-size:30px;letter-spacing:-.03em;margin:10px 0}p{color:#96a2a2;font-size:14px;line-height:1.7}button,input,select{font:inherit}button{background:#c8f15b;color:#16200a;border:0;border-radius:10px;padding:11px 18px;font-weight:650;cursor:pointer}button:disabled{opacity:.35;cursor:default}.secondary{background:#1c2529;color:#e0e6e4;border:1px solid #344148}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:24px 0}.card{background:#11191d;border:1px solid #273338;border-radius:16px;padding:24px}.card span{font-size:13px;color:#9ca9a9}.card strong{display:block;font-size:34px;margin-top:12px;color:#c8f15b;font-variant-numeric:tabular-nums}#filters{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:28px 0 20px}label{display:flex;flex-direction:column;gap:8px;font-size:13px;color:#a7b2b2}input,select{background:#10171a;border:1px solid #344148;border-radius:10px;padding:11px 12px;color:#f2f4ed;min-height:43px}input:focus,select:focus{outline:2px solid #c8f15b;outline-offset:2px}.table-wrap{overflow:auto;border:1px solid #273338;border-radius:14px}table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:14px;font-variant-numeric:tabular-nums}th,td{padding:17px 16px;text-align:left;border-bottom:1px solid #263237}th{background:#151f23;color:#a4b4b3;font-weight:500;font-size:12px}td{background:#0f1619}tr:last-child td{border-bottom:0}.ram{color:#d6ed9b;font-weight:600}.empty{padding:60px;text-align:center;color:#91a1a3}.pagination{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:20px}#status{font-size:13px;color:#91a1a3}.pagination nav{display:flex;gap:8px}.note{margin-top:26px;font-size:12px}.login{max-width:460px;margin:12vh auto}.login form{display:grid;gap:18px}.login input{width:100%}.error{color:#ffae82}.login button{width:100%}@media(max-width:650px){main{padding:28px 16px}h1{font-size:25px}.stats{gap:8px}.card{padding:16px 12px}.card strong{font-size:27px}.card span{font-size:11px}#filters label:first-child{flex:1;min-width:160px}.pagination{align-items:start;flex-direction:column}.login{margin:6vh auto}.empty{padding:42px 18px}header{gap:12px}}`;

export function renderAdminPage({ nonce, loggedIn = false, error = false }) {
    const content = loggedIn ? `
<header><div><div class="eyebrow">HOSHINO · PRIVATE DASHBOARD</div><h1>设备参数样本</h1><p>查看线上提交的体质与内存信息</p></div><form action="/admin/logout" method="post"><button class="secondary">退出登录</button></form></header>
<section class="stats" aria-label="当前筛选统计"><div class="card"><span>参数组合</span><strong data-stat="parameter_sets">—</strong></div><div class="card"><span>接收次数</span><strong data-stat="submissions">—</strong></div><div class="card"><span>内存 ID 种类</span><strong data-stat="ram_types">—</strong></div></section>
<form id="filters"><label>内存 ID（精确匹配）<input name="ram" maxlength="32" placeholder="全部，例如 WT:F"></label><label>机型<select name="model"><option value="">全部机型</option value="regular">续航版 / OLED</option><option value="lite">Switch Lite</option></select></label><button type="submit">筛选</button><button type="button" class="secondary" id="refresh">刷新</button></form>
<div class="table-wrap"><table><thead><tr><th>CPU Speedo</th><th>GPU Speedo</th><th>SoC Speedo</th><th>内存 ID</th><th>机型</th><th>场景</th><th>配置</th><th>接收次数</th><th>最近提交 · 北京时间</th></tr></thead><tbody id="rows"><tr><td colspan="9" class="empty">加载中…</td></tr></tbody></table></div>
<div class="pagination"><span id="status" role="status"></span><nav><button id="previous" class="secondary" disabled>上一页</button><button id="next" class="secondary" disabled>下一页</button></nav></div><p class="note">每页 25 条，最近提交优先。统计随筛选变化。<br>这些是用户填写的参数样本，参数组合数和接收次数均不代表人数、真实设备数量或实机稳定性。</p><script src="/admin/app.js"></script>` : `
<section class="login card"><div class="eyebrow">HOSHINO · PRIVATE DASHBOARD</div><h1>后台登录</h1><p>登录后查看线上设备参数样本。</p><form action="/admin/login" method="post"><label>管理密码<input name="password" type="password" autocomplete="current-password" maxlength="128" required autofocus></label>${error ? '<p class="error" role="alert">密码不正确，请重试。</p>' : ''}<button>登录</button></form></section>`;
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>星野 · 设备参数后台</title><style nonce="${nonce}">${style}</style></head><body><main>${content}</main></body></html>`;
}
