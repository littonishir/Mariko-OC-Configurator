# HOC 设备参数样本接口

2026-11-03 用户批准上线，正式 Cloudflare Worker/D1 已部署。正式 endpoint 在上一级 `sample-config.js` 中配置，本地预览仍使用 127.0.0.1:8787。

- 接口：`https://hoshino-hoc-device-samples.hoshino-hoc.workers.dev/api/device-samples`
- Worker：`hoshino-hoc-device-samples`
- D1：`hoshino-hoc-samples`，UUID `1144835d-67d5-4b93-8e34-0c817910633e`，APAC 区域。
- [正式数据库后台](https://dash.cloudflare.com/c636db5fa24042aa0368b30589eb8861/workers/d1/databases/1144835d-67d5-4b93-8e34-0c817910633e)
- 本地 `npm run db:list` 只查询本地库，不代表线上数据；正式数据在上面的 D1 后台查看。

## 私有网页后台

[打开设备参数后台](https://hoshino-hoc-device-samples.hoshino-hoc.workers.dev/admin)。输入管理密码后查看参数、接收次数和北京时间，可按内存 ID/机型筛选，25 条一页。点“刷新”重新读取；点“退出登录”立即撤销当前会话。没有用户名、公开注册或数据修改功能。

初始密码由加密随机数生成，只保存在本机项目外的登录信息文件，仓库不包含密码。服务器通过 Worker secret `ADMIN_PASSWORD_HASH` 校验密码；会话 8 小时有效，Cookie 为 Secure/HttpOnly/SameSite=Strict，数据库只存会话令牌哈希。未登录读管理 API 返回 401，登录限流为每来源 IP 约5次/分钟。`/admin/api/samples` 仅允许有效管理会话读取。

本地后台地址 `http://127.0.0.1:8787/admin`，使用被 Git 忽略的 `.dev.vars` 中密码哈希。`npm run db:init` 会增量创建 `admin_sessions` 表，不更改样本。

**修改或丢失密码**：重新生成高强度密码，计算 SHA-256 并更新 Worker 的 `ADMIN_PASSWORD_HASH` Secret；同时在正式 D1 执行 `DELETE FROM admin_sessions;` 撤销全部旧会话，再登录新密码。只更换密码哈希不会自动撤销旧 Cookie，原有会话最长仍有效8小时。不要把明文密码或会话 Cookie 放进仓库、URL 或分享链接。

部分网络不能访问 `workers.dev`。这类请求会静默失败，配置生成仍正常；需要提高此类网络的采集覆盖时，可绑定自有域名后更新 endpoint，当前账号尚无已接入域名。后台也受相同的网络可达性影响。

## 本地运行

cf 与依赖要求 Node.js `^22.23.0 || ^24.22.0 || ^26.12.0`；本次使用 Codex 已有的 Node 24.22.1 验证。

```bash
cd /Users/velvet/Geek.localized/Mariko-OC-Configurator/api
npm ci
npm run db:init
npm run dev
```

另一个终端启动网页：

```bash
cd /Users/velvet/Geek.localized/Mariko-OC-Configurator
python3 -m http.server 18765 --bind 127.0.0.1
```

打开 http://127.0.0.1:18765，输入参数后点击“生成配置”。查看最近 100 条本地记录：

```bash
cd /Users/velvet/Geek.localized/Mariko-OC-Configurator/api
npm run db:list
```

`db:init` 只执行 CREATE IF NOT EXISTS，不删除已有数据。上述命令均使用本地 D1，目录为 `.cloudflare/state/v3/d1`，已排除 Git。`cf --persist-to` 参数传 `.cloudflare/state`，工具会自行添加 `v3`，不要再手动重复拼接。

## 收集行为与数据

- 仅点击有效的“生成配置”时发送，不弹窗、不显示上传成功或失败提示。
- 不随页面打开、字段变更、填入示例、复制或保存图片上传；字段变更仍在本地自动重算。
- 记录 CPU/GPU/SoC Speedo、RAM ID、机型，最近一次场景/目标/网页版本，首次与最近接收时间和次数。
- 机型目前只有 `regular`（续航版/OLED）和 `lite`，不能从现有表单区分 OLED 与续航版；不根据 Speedo 猜测机型。
- RAM ID 去首尾空格并转大写；同一 CPU/GPU/SoC/RAM/model 元组一行，D1 唯一约束与 UPSERT 保证并发去重。
- 当前页面已经成功或正在发送的相同完整内容不重复发送；失败后再次点击可以重试。不设自动重试、Cookie 或持久访客 ID。
- 请求超时 3 秒、无 Cookie/账号凭据、不传 Referer、不跟随重定向，失败不影响本地功能。
- 不向数据库写入 IP、账号、序列号、密钥、截图、游戏或浏览器指纹。Cloudflare 自身处理请求的基础设施日志与样本数据库是两回事，不能宣称整条链路完全不接触 IP。

**这些是自行填写的输入样本，不是实机扫描或稳定性报告。** 固定示例、误填、随机输入都可能进入库。相同参数可能属于多台机器，同一用户也可能填写多组参数；行数与 `submission_count` 均不能用作去重设备数/用户数。RAM 别名目前只做大小写与空白规范化，不合并不同写法的颗粒别名。

## 接口与访问

`POST /api/device-samples` 接收固定 9 个字段：

```json
{"schemaVersion":1,"appVersion":"20261103-hoc26","cpuSpeedo":1662,"gpuSpeedo":1694,"socSpeedo":1728,"ramId":"WT:F","model":"regular","mode":"handheld","goal":"performance"}
```

成功为 204，无返回样本数据。非法输入 400、错误来源 403、错误方法 405、请求超长 413、错误类型 415、限流 429、必要绑定缺失或写入异常 503。`GET /healthz` 只返回进程状态 `{ok:true}`，不代表写库探测成功。其余路径 404，样本没有公开查询端点。

服务端只接受固定字段，Speedo 为 1200–2000 整数，RAM ID 1–32 字符且无控制字符，JSON 实际请求体最多 2048 字节。未知颗粒名称可保存，SQL 使用参数绑定。生产 CORS 只允许 `https://littonishir.github.io`，本地模式只允许 18765 的 localhost/127.0.0.1。Origin 校验并不是身份认证，程序仍可能伪造请求。

平台限流为整个端点约 120 次/分钟/Cloudflare 节点，超限则跳过收集，不能当作全球严格限额或防止分布式滥用的保证。正式部署前需要验收实际访问量和额度；不需要把 Cloudflare Token 放进网页。

## 后续部署

1. 正式 D1 已创建；无需重复创建。`schema.sql` 使用 CREATE IF NOT EXISTS 初始化表，不导入本地测试记录。
2. `cloudflare.config.ts` 已记录正式数据库 UUID，可用 `HOC_SAMPLES_DATABASE_ID` 覆盖。登录 cf CLI 后使用 `cf deploy` 的默认生产模式部署 `hoshino-hoc-device-samples`；本地命令必须带 `--mode development`，不会使用正式库。首次发布通过已授权 Cloudflare 连接器上传 cf 构建产物，并核对绑定和路由。
3. 用真实正式来源做验收，确认成功写入与 CORS；变更域名时更新上一级 `sample-config.js` 的 `productionEndpoint`。
4. 网页单独发布：须经用户授权；`main` 保存源码，`gh-pages` 仅部署网站静态文件。更新 HTML 静态资源版本号，并核对实际线上页面，而不只是本地代码。
5. 进入 Cloudflare 后台 → 存储与数据库 → D1 → `hoshino-hoc-samples` → Console，执行 `queries.sql` 中查询查看/汇总。数据库访问仍受 Cloudflare 账号权限控制，无独立公开管理页。

如果后续要提供 Excel/CSV 导出或设备稳定性反馈，可在此接口基础上增加；本版不把“生成过配置”认定为“超频稳定”。

## 验证

```bash
npm test
npm run check
```

API 测试使用真实 Miniflare Workers/D1，内存数据库随测试结束销毁。项目根目录执行 `node --test` 可同时运行前端、推荐和 API 测试。`npm run check` 只构建，不部署。
