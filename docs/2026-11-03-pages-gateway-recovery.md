# workers.dev 超时后的入口修复

用户报告后台 ERR_TIMED_OUT。当前机器直连与系统代理均无法连接原 workers.dev 域名，域名解析结果异常；原服务已从 Cloudflare 外部浏览器验证正常。相同网络中 pages.dev 可以正常连接。
用户没有自有域名并明确授权尝试其他入口，因此增加 Cloudflare Pages Service Binding 网关，保留原 Worker、数据库和密码。

## 发布

- 新后台：https://hoshino-hoc.pages.dev/admin
- 新采集：https://hoshino-hoc.pages.dev/api/device-samples
- Pages 部署：`58de7f2f-220d-416c-9445-816a9159891d`，success。
- 网关和前端源码：`75d497f10e40b823edbee8d0405174eac37083b5`。
- GitHub Pages 静态发布：`9c72862d9a9ef9d02f1d421806443fdc3ea16911`。
- GitHub Pages 构建：`41592281920`，success。
- 网页版本：`20261103-release2`，采集版本：`20261103-hoc26-release2`。

## 验证证据

- 当前机器浏览器和 curl 实测新域名健康检查 HTTP200、登录页可打开、未登录API401。
- 当前机器真实浏览器使用原密码登录、读取API200、退出后旧会话API401；没有依赖外部代验绕过用户当前网络。
- 正式 GitHub Pages 点击“生成配置”，新 Pages API完成请求，在原 D1 核对三种Speedo、RAM、版本与接收次数1。
- 同一机器打开新后台可看到刚提交的线上样本及北京时间；验收完成后只删除明确标记的合成样本，不更改用户数据。
- 原密码未改变，项目外权限600登录信息文件已更新新地址。
- 全部50项测试通过；JS语法和diff检查通过，公开代码中没有密码或哈希。独立审查无阻塞问题，并另外跑过真实Miniflare内部Service Binding认证/采集流程。
- 已保存网关单元测试；独立审查的真实绑定流程尚未另存为长期回归，这是后续可补强项。

Pages入口代码与部署方式见 `pages-gateway/README.md`。原 workers.dev 路由保留，网站客户端不再依赖该路由。后续可按实际需要绑定自有域名，但本次不购买域名、不改系统DNS或代理设置。
