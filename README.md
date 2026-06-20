# Mariko OC 配置助手

一个无需安装依赖的本地网页工具。输入 CPU、GPU、SoC Speedo、RAM Module ID、机型和
使用场景后，生成 Horizon-OC 的安全起步配置与调参路线。

页面默认填入 OLED 设备参数：CPU/GPU/SoC Speedo `1662/1694/1728`，RAM `WT:F`。
生成配置后可点击“保存成长图”，将当前完整页面导出为 PNG。

## 使用

直接双击 `index.html`，或在目录中启动本地服务器：

```bash
python3 -m http.server 8080
```

然后访问 `http://127.0.0.1:8080`。

## 测试

```bash
node --test configurator.test.js
```

工具依据用户提供的 Mariko OC Guide 整理。Speedo 不能直接证明某组 UV 或频率稳定，
生成结果是测试起点，不是稳定性保证。

## 配置原则

- 推荐配置区只显示当前可直接填写的单一值。
- Speedo 仅用于体质提示，不在指南没有分档表时推导 UV、VMIN 或 RAM 上限。
- RAM 延迟按照文档使用 `2133 Latency Max`。识别到颗粒时应用对应 Common 时序并从
  `DVB Shift 10` 开始验证；未识别颗粒时保持默认 Timing Reductions 和 `DVB Shift 5`。
- 插电 GPU 默认使用 `1152 MHz`。只有关闭 GPU Scheduling 且确认 1228 MHz 电压低于
  `800 mV` 后，才把 `1228 MHz` 作为后续调参目标。
- 颗粒频率范围、UV 递增、电压调整和 DVB 10 测试流程统一放在“后续调参说明”。
