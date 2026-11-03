# Device Samples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在显式生成配置后静默接收硬件参数样本，并保持本地推荐完全可用。

**Architecture:** 独立 Worker 校验 JSON 并通过 D1 原子 UPSERT 保存；静态前端的独立 reporter 在表单提交成功后异步调用。生产地址未配置时不发送，先使用本地 Worker/D1 验收。

**Tech Stack:** 原生 JavaScript、Cloudflare Workers/D1、cf CLI、Miniflare、node:test。

**Spec:** docs/superpowers/specs/2026-11-03-device-samples-design.md

## Global Constraints

- 点击有效“生成配置”时上传，不弹窗或显示上传提示。
- 不阻塞推荐，不自动收集页面访问或表单变更；失败可再次点击重试。
- 固定字段白名单；Speedo 1200–2000 整数；RAM ID 1–32 字符；2048 字节请求体限制。
- 不收集身份、主机秘密或持久访客 ID；样本元组不等于真实机器数量或稳定验证。
- 不发布网页、不创建生产资源，不修改 HoshinoAtmosphere，保留既有未提交“底座”文案修改。

## Review Focus

- 默认值/示例/随机输入可能是真实提交，统计不得命名为去重用户或设备数。
- input/change 自动重算不得悄悄扩大到每次变更上传。
- 无 Content-Length、分块和多字节字符请求也必须限制实际字节数。
- 并发重复提交必须依靠数据库约束避免重复和丢计数。
- CORS 不是身份认证；公开写入口须限流，且不能公开读样本或凭据。

---

### Task 1: Worker 接收与 D1 存储

**Files:** Create api/{package.json,cloudflare.config.ts,schema.sql,worker.mjs,worker.test.mjs,README.md,queries.sql} and .gitignore.

**Interfaces:** POST /api/device-samples accepts the fixed spec payload; returns 204 on accepted write, otherwise 400/403/404/405/413/415/429/503. GET /healthz returns only health status. Bindings: DB, INTAKE_LIMITER, ALLOWED_ORIGINS. No public read endpoint.

- [x] Add tests using a real Miniflare Worker and D1 for insert, canonicalized repeat, concurrent UPSERT, invalid types/enums/extras/control chars, streamed/multibyte oversize, CORS/preflight, rate-limiting and database failure.
- [x] Run tests RED before implementing worker handler (missing valid API response is expected).
- [x] Implement bounded request reading, allowlist validation, bound SQL, UPSERT and structured operational error logging without request body.
- [x] Configure local cf development and production config template without creating cloud resources; pin dependencies and inspect actual cf schema.
- [x] Run npm --prefix api test. Expected: all API tests pass.

### Task 2: 前端静默上传

**Files:** Create device-samples.js, device-samples.test.js, sample-config.js. Modify app.js, app.test.js and index.html.

**Interfaces:** window.MarikoDeviceSamples.createReporter({endpoint,appVersion,fetchImpl?,timeoutMs?}) returns a function accepting validated result.input. It never throws to caller; success/inflight dedup is page-local. Endpoint comes from window.MarikoSampleConfig. Empty endpoint is disabled.

- [x] Add reporter tests for whitelist/numeric conversion, credentials omitted, failure retry, timeout abort, concurrent repeat dedup, invalid endpoint and disabled endpoint.
- [x] Add controller tests proving valid explicit submit sends once; invalid submit, initial load, change, example, copy do not send; rejected/throwing reporter cannot affect generation or copy.
- [x] Run node --test RED to demonstrate missing reporter/submit hook.
- [x] Implement reporter and invoke it only after generateResult(true) returns true in submit listener. Preserve DOM layout and recommendation logic, update asset cache keys.
- [x] Run node --test. Expected: all old and new root tests pass.

### Task 3: 本地联调、维护说明和审查

**Files:** Modify README.md, api/README.md and API queries; add local verification record.

**Interfaces:** npm --prefix api run dev serves local API at 127.0.0.1:8787 with local D1; existing preview stays on 18765. npm --prefix api run check validates cf build without deployment.

- [x] Run local Worker and apply schema locally. Use real browser to submit, edit, repeat and verify SQL rows; block endpoint to confirm recommendation/copy still work.
- [x] Document D1 dashboard viewing, limited SQL summaries/CSV export, production deployment steps and the unset endpoint status. State sample-quality limitations.
- [x] Run root tests, API tests, syntax checks, cf dry-run and git diff --check.
- [x] Request one independent final review and fix important findings with regression tests.
- [x] Report exactly what is locally verified and what remains to deploy; leave public site untouched.
