# 可访问的 Pages 入口

2026-11-03 用户报告 workers.dev 超时，本机直连/代理均复现；Pages 域名在本机能连接。用户无自有域名，授权尝试其他入口。

- 后台：https://hoshino-hoc.pages.dev/admin
- 参数接收：https://hoshino-hoc.pages.dev/api/device-samples
- 健康检查：https://hoshino-hoc.pages.dev/healthz
- Pages 项目：`hoshino-hoc`，生产分支 `main`。
- Service Binding：`HOC_SERVICE` → `hoshino-hoc-device-samples`（production）。

Pages 只处理请求入口，通过内部 Service Binding 调用原 Worker，不依赖请求端连接 workers.dev。数据库、密码和会话逻辑仍在同一 Worker，不复制数据、不修改认证。请求保留公开 URL、Origin、Cookie 和请求体，后端原有同源检查继续生效。入口缺绑定/内部失败返回503，未知路径404，根路径302跳转/admin，不跟随外部重定向。

`_worker.js` 使用 Pages advanced mode，仅部署这一个入口模块。虽然 Cloudflare 对新应用推荐 Workers，本项目增加 Pages 仅为解决现有服务的 workers.dev 访问障碍。

## 首次部署配置

通过 Cloudflare Pages API 创建 direct upload 项目，`deployment_configs.production` 使用：

```json
{
  "compatibility_date": "2026-11-03",
  "fail_open": false,
  "services": {
    "HOC_SERVICE": {
      "service": "hoshino-hoc-device-samples",
      "environment": "production"
    }
  }
}
```

Preview 不绑定正式服务，不能读取正式数据。部署API为 `POST /accounts/{account_id}/pages/projects/hoshino-hoc/deployments`，multipart字段：`branch=main`、`manifest={}`、`_worker.js` 文件（application/javascript+module）。无需静态资源、密码或数据库绑定。首次部署 ID `58de7f2f-220d-416c-9445-816a9159891d`。

原 Worker 更新后，Pages 自动调用更新后的服务；仅变更入口代码时才需要重新部署 Pages。Pages 和 Worker 必须属于同一 Cloudflare 账号。

## 验证

根目录 `node --test` 含网关的请求/响应透传和路由失败测试。正式验收需从可达网络验证登录、读数据、退出、未登录401及 GitHub Pages 跨域提交204；测试样本用唯一标记，验收后只删除这条记录。
