# 星野無上 HOC 配置助手

面向 Mariko 设备的 Horizon-OC 超频配置生成工具。输入 CPU、GPU、SoC Speedo、
RAM Module ID、设备类型和使用场景，即可生成一套可继续验证的配置起点。

## 在线使用

访问：[星野無上 HOC 配置助手](https://littonishir.github.io/Mariko-OC-Configurator/)

工具为纯静态网页，所有参数均在浏览器本地处理，不会上传硬件信息。

## 主要功能

- 根据 CPU、GPU、SoC Speedo 展示芯片体质参考。
- 识别 RAM Module ID，并给出对应的内存频率与时序起点。
- 区分 OLED、续航版和 Lite 设备的配置范围。
- 提供均衡配置与进阶性能配置。
- 按 Horizon-OC 设置顺序展示 CPU、GPU 和内存参数。
- 给出后续逐级验证路线及风险提示。
- 支持把完整配置页面保存为长图。

## 使用方法

1. 输入设备的 CPU、GPU、SoC Speedo。
2. 输入 RAM Module ID，例如 `WT:F`。
3. 选择设备类型和配置倾向。
4. 点击“生成配置”。
5. 根据生成结果填写 Horizon-OC，并逐级进行稳定性测试。
6. 需要分享时，点击“保存成长图”。

页面默认提供一组 OLED 示例参数：

```text
CPU Speedo: 1662
GPU Speedo: 1694
SoC Speedo: 1728
RAM Module ID: WT:F
```

## 配置原则

- 推荐配置区只显示当前可以直接填写的单一值。
- Speedo 仅用于体质参考；没有明确分档依据时，不直接推导 UV、VMIN 或 RAM 上限。
- RAM 延迟编辑器按照文档使用 `2133 Latency Max`。
- 识别到内存颗粒时，应用对应的 Common 时序，并从 `DVB Shift 10` 开始验证。
- 未识别内存颗粒时，采用保守参数并显示提示，不盲目套用高频配置。
- 插电 GPU 默认使用 `1152 MHz`；更高频率需要结合电压和稳定性单独验证。
- 均衡与进阶配置会使用不同的内存时序优化起点。

## 风险提示

生成结果是依据文档整理出的调试起点，不是稳定性保证，也不能代替逐级测试。
超频和降压可能引发死机、花屏、数据损坏、异常发热或无法启动。请确认自己了解恢复方法，
并自行承担修改设备配置产生的风险。

## 本地运行

项目不依赖构建工具，可以直接打开 `index.html`，也可以启动本地静态服务器：

```bash
python3 -m http.server 8080
```

然后访问 `http://127.0.0.1:8080`。

## 开发与测试

项目使用原生 HTML、CSS 和 JavaScript，配置生成逻辑位于 `configurator.js`。

运行测试：

```bash
node --test configurator.test.js
```

运行 JavaScript 语法检查：

```bash
node --check app.js
node --check configurator.js
```

## 交流社群

- 阿抖群：`912250885031`
- 阿Q群：`281559687`

## 资料说明

本工具依据 Mariko OC Guide 及 Horizon-OC 配置条目整理。文档或 Horizon-OC 更新后，
具体参数名称、范围和行为可能发生变化，请以当前版本实际表现为准。
