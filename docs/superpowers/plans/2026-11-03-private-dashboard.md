# Private Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让用户登录网页查看正式 D1 参数样本。

**Architecture:** 同一 Worker `/admin` 路由独立验证密码和数据库会话，公开采集路由保留原有处理。HTML/JS 模块返回私有表格，使用同源只读 JSON API。

**Tech Stack:** JavaScript、Workers WebCrypto、D1、node:test/Miniflare、cf/Vite。

**Spec:** docs/superpowers/specs/2026-11-03-private-dashboard-design.md

## Global Constraints

- 后台必须登录，仅自己查看。生产密码不进 Git，显示北京时间。
- 公开配置网页及采集保持正常；数据不声称真实设备数/人数。
- 8 小时会话，退出立即撤销；只读数据，25 条分页，参数化查询。

## Review Focus

- 缺绑定和错误凭据必须关闭后台，不能回落到公开读取。
- 过期/篡改/已退出会话不可重放，跨域提交不可创建或删除会话。
- 数据中的任意文本不可注入 HTML/SQL；JSON 和页面不可被缓存。
- 并发筛选/翻页结果不可倒序覆盖，空库/错误需清楚反馈。
- 新私有路由不能把密码保护应用到公开采集接口。

### Task 1: 私有路由与会话

Files: api/admin.mjs, api/admin.test.mjs, api/worker.mjs, api/schema.sql, api/cloudflare.config.ts.

- [x] 写真实 Worker/D1 测试并运行 RED：未登录API401、错误密码401、正确登录303与Cookie、退出撤销、过期/篡改拒绝、跨域拒绝、限流429、缺绑定503。
- [x] 实现只读统计/筛选分页和会话处理；保存随机密码哈希，constant-time 比较。
- [x] 运行 API 与既有全部测试 GREEN。

### Task 2: 登录页与数据表格

Files: api/admin-page.mjs, api/admin-page.test.mjs, api/README.md.

- [x] 写测试覆盖北京时间、静态模板无样本/密码、恶意文本按 DOM 文本渲染的边界。
- [x] 实现登录与后台，原生表格、筛选、概览、刷新、退出，CSP nonce/no-store。
- [x] 浏览器使用本地真实 D1 核对登录/筛选/翻页/错误，运行完整测试与生产构建。

### Task 3: 审查与部署

- [x] 独立审查；修复重要问题后重新验证。
- [x] 正式 D1 增量建会话表，上传新构建与登录秘密，核对已有采集绑定和限流。
- [x] 正式浏览器验证未登录、登录读库、退出；密码保存项目外权限600文件交付用户。
- [x] 文档记录链接和使用方式，推送源码，公开网页静态内容无需变更。
