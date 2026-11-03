// Pages 只作为可访问入口；内部 Service Binding 复用原 Worker 的认证、限流和 D1。
export default {
    async fetch(request, env) {
        const path = new URL(request.url).pathname;
        const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
        if (path === '/') return new Response(null, { status: 302, headers: { ...headers, Location: '/admin' } });
        if (path !== '/admin' && !path.startsWith('/admin/') && path !== '/api/device-samples' && path !== '/healthz') return new Response('Not Found', { status: 404, headers });
        if (!env.HOC_SERVICE) return new Response('服务暂不可用', { status: 503, headers });
        try {
            // 保留 Pages 的公开 URL 和 Origin，让原服务器继续严格验证同源登录。
            return await env.HOC_SERVICE.fetch(request);
        } catch (_) {
            return new Response('服务暂不可用，请稍后重试。', { status: 503, headers });
        }
    }
};
