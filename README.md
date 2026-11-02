# 星野無上 HOC 配置助手

面向 Mariko 设备的 Horizon-OC 配置助手，提供 **保守配置 / 进阶配置**，当前参数依据 **HOC 2.6.0-rel**。
进阶配置结合 Speedo、电压表、机型、供电场景和 RAM 规格选择频率；Speedo 不代表稳定性保证。

## 2026-11-02 修正说明

旧版将额外降压、DVB 8、颗粒时序和较高频率同时推荐给不同设备，已有用户反馈无法启动。
这些因素没有逐项隔离，不能断定某个电压就是唯一原因，也不能用一台 OLED 的成功结果保证其他机器稳定。
请停用旧导出图与旧推荐，先恢复自己已验证可启动的配置，再逐项排查。

## 在线使用

访问：[星野無上 HOC 配置助手](https://littonishir.github.io/Mariko-OC-Configurator/)

工具为纯静态网页，所有参数均在浏览器本地处理，不会上传硬件信息。

## 主要功能

- CPU／GPU Speedo 参与电压表估算选档，SoC Speedo 保留记录，不标注体质等级。
- RAM 根据可核对的 3733／4266 Mbps 规格，分别建议 1866／2133 MHz；速度等级未核实则保持 1600 MHz。
- 提供保守配置和进阶配置，页面同时展示两套频率对比；切换方案查看对应详细参数。
- 两套保留相同的 KIP 电压与默认时序，进阶只改变运行频率。
- 网页、长图和复制结果按“安全设置 → RAM → CPU → GPU”展示配置。
- 安全设置保留“解锁频率：建议打开”，说明解锁不等于选用高频，不自动修改主机。
- 分开显示调频器的初始运行档与 KIP 上限，CPU 加速单独列出。
- 给出后续逐级验证路线及风险提示。
- 支持把完整配置页面保存为长图。

## 使用方法

1. 输入设备的 CPU、GPU、SoC Speedo。
2. 输入 RAM Module ID，例如 `WT:F`。
3. 选择设备类型、供电场景（掌机、普通 USB 插电、官方充电器／底座）和配置方案。
4. 点击“生成配置”。
5. 先备份当前可启动的 KIP、HOC 配置、SD 卡与 NAND，并确认可以进入 Hekate 恢复。
6. 区分运行档和 KIP 参数，不要整套覆盖已验证的配置。KIP 修改后保存 KIP 并完全重启。
7. 检查全局和各游戏的自动超频档，按页面步骤逐项验证冷启动、休眠唤醒和游戏负载。
8. 需要分享时，复制结果或保存长图；二者均包含版本、参数、验证步骤和回退提示。

页面默认提供一组 OLED 示例参数：

```text
CPU Speedo: 1662
GPU Speedo: 1694
SoC Speedo: 1728
RAM Module ID: WT:F
```

## 配置原则

保守配置的运行档是本工具选择的排查条件，不是所有游戏的 HOS 默认值，也不是恒定实际频率；请在监控中核对。

| 项目 | 调频器初始运行档 | KIP 参数（HOC 2.6.0 默认） |
| --- | --- | --- |
| RAM | 1600 MHz | 上限 2133 MHz；VDD2/VDDQ 1175/600 mV；DVB 0；高性能关闭；JEDEC；延迟覆盖及时序缩减默认 0 |
| CPU | 1020 MHz | 上限／加速 1963.5 MHz；降压 0/0；分界 1683 MHz；VMIN 620/750 mV；VMAX 1120 mV |
| GPU | 掌机 384／插电 768 MHz | HiOPT；VMIN 610 mV；VMAX 800 mV；偏移 0 |

HOC 默认不同于 HOS 原厂设置，HiOPT 也不是“无降压”。这些参数只用于重新建立排查条件，不保证稳定。
KIP 上限不代表应该立即使用该频率；CPU 加速可暂时高于调频器运行档。

进阶配置先通过保守配置，再按 RAM → CPU → GPU 一项一项升频。内存路线为 `1600 → 1866 → 2133 MHz`，
3733 Mbps 颗粒止于 1866；4266 Mbps 颗粒止于 2133。未知颗粒、NEI 和未核实的 MGCR 别名保持 1600。
不自动添加 Common/ST 时序、DVB 偏移或额外降压。Lite 单独限制掌机功耗倾向与 GPU 频率。

## 进阶频率如何选择

`frequency-plan.js` 使用 HOC 的 **TBREAK1683** CPU 表和 **HiOPT** GPU 表，按 NVIDIA Tegra CVB 数学形式计算电压参考；
GPU 包含 0–90°C 每 1°C 的温度项扫描。电压结果按 5 mV 向上取整。它是简化模型，未模拟实际供电、板级裕量、
调度、RAM 与 GPU 的相互影响或老化，不能当作实测电压或要求用户手动填写的电压。

筛选预算是本工具的取舍，不是 HOC 官方推荐安全线，也不是要设置的 VMAX：

| 场景 | CPU 估算预算 | GPU 估算预算 | GPU 频率范围 |
| --- | --- | --- | --- |
| 掌机 OLED／续航版 | 950 mV | 610 mV | ≤768 MHz |
| 掌机 Lite | 900 mV | 610 mV | ≤614.4 MHz |
| 普通 USB 插电 | 1000 mV | 700 mV | ≤998.4 MHz |
| 官方充电器／底座 | 1000 mV | 750 mV | ≤1075.2 MHz |

在范围内选取估算电压不超过预算的最高档；CPU 保持 UV0/0，始终不超过当前表支持的 1963.5 MHz。
GPU Speedo 超出 HOC Mariko 分档参考范围（1300–1849）时不推导进阶频率。
两台设备即使 Speedo 相同，实际稳定性、温度和功耗仍可能不同。

## 风险提示

生成结果不能代替实机逐级测试；自动化测试只验证输出规则，不验证主机稳定性。
超频和降压可能引发死机、花屏、数据损坏、异常发热或无法启动。请确认自己了解恢复方法，
遇到异常立即停止测试，通过 Hekate／读卡器恢复之前可启动的 KIP 与 HOC 配置，然后完全重启。
若初始配置仍异常，先排查 HOC、Atmosphère 版本与现有环境，不继续盲目加压或升频。

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
node --test
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

参数与数值表以 [HOC 2.6.0-rel 的 customize.cpp](https://github.com/Horizon-OC/Horizon-OC/blob/2.6.0-rel/Source/Atmosphere/stratosphere/loader/source/oc/customize.cpp)
为依据；[pcv.hpp](https://github.com/Horizon-OC/Horizon-OC/blob/2.6.0-rel/Source/Atmosphere/stratosphere/loader/source/oc/pcv/pcv.hpp) 明确了 CPU 表选择。
GPU 场景范围参考 [clock_manager.cpp](https://github.com/Horizon-OC/Horizon-OC/blob/2.6.0-rel/Source/hoc-clk/sysmodule/src/mgr/clock_manager.cpp)；即使开启解锁，本工具也保留自己的筛选范围。
RAM 规格依据 [Hekate v6.5.4 的 gui_info.c](https://github.com/CTCaer/hekate/blob/v6.5.4/nyx/nyx_gui/frontend/gui_info.c)，型号的额定速度不作为主机稳定性保证。
CVB 计算形式参考 [NVIDIA Tegra cvb.c](https://github.com/OE4T/linux-tegra-4.9/blob/oe4t-patches-l4t-r32.7.4/drivers/soc/tegra/cvb.c)，
缩放参数参照[对应驱动](https://github.com/OE4T/linux-tegra-4.9/blob/oe4t-patches-l4t-r32.7.4/drivers/soc/tegra/tegra210-dvfs.c)。
上述 HOC、Hekate 与 NVIDIA/Linux 来源按各自 GPL-2.0 许可提供；本项目对数据与公式注明出处，不把模型输出称为上游官方配置。
其他版本应重新核对参数，不能直接沿用本版结论。
