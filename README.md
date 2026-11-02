# 星野無上 HOC 配置助手

**本分支仅本地调试，未经用户验收不发布。** 线上 `gh-pages` 已回滚到 `8266c10`；不要同时推送 main 与 gh-pages。
本地分支 `dev/guide-performance-local` 保留旧版布局与“指南安全上限 / 进阶性能”两个名称。

适用 Mariko（续航版、OLED、Lite）及 **HOC 2.6.0-rel**。纯静态网页，不上传硬件信息，不写入主机。

## 指南安全上限

名称沿用原版；以下是本工具与用户共同确定的基础档，不代表上游通用稳定性保证。

| 运行频率 | 掌机 | 插电／底座 |
| --- | ---: | ---: |
| RAM | 1866 MHz | 1866 MHz |
| CPU | 1581 MHz | 1785 MHz |
| GPU | 614.4 MHz | 768 MHz |

- 解锁频率：建议打开；解锁不等于立即使用最高档。
- CPU：低频／高频降压0/0，1683分界，VMIN620/750、VMAX1120 mV；KIP上限和加速1963.5 MHz。
- GPU：HiOPT、VMIN610、VMAX800 mV、偏移0。
- RAM：DVB0、HP关闭、JEDEC、默认延迟与时序，VDD2/VDDQ1175/600 mV；KIP内存上限1866 MHz。
- CPU加速可能暂时高于运行档。运行档、KIP上限与加速设置要分别核对。

## 进阶性能

CPU/GPU按 **实际TBREAK1683 / HiOPT表** 与Speedo估算选档；RAM根据指南颗粒经验，再与GPU/RAM电压关系取交集。
不根据Speedo猜测“最高可稳定降压等级”。低频UV保留0，只有推荐CPU频率超过1963.5时才用高频UV1，不自动使用4/5级降压。
CPU最低620/750、GPU最低610、CPU最高1120、GPU最高800 mV保持不变；加速仍1963.5 MHz。

以下预算是本工具减少候选范围的策略，**不是HOC官方安全线、实测电压、额外电压设置，也不代表电流或功耗已满足限制**。
CVB计算形式参考NVIDIA实现，GPU扫描0–90°C温度项，估算向上取整到5mV；未模拟供电裕量、调度、老化或降压稳定性。

| 场景 | CPU预算／频率范围 | GPU预算／频率范围 |
| --- | --- | --- |
| 续航版／OLED掌机 | 1000 mV／≤1963.5 MHz | 650 mV／≤921.6 MHz |
| Lite掌机 | 950 mV／≤1785 MHz | 625 mV／≤768 MHz |
| 续航版／OLED插电 | 1100 mV／≤2397 MHz | 750 mV／≤1075.2 MHz |
| Lite插电 | 1050 mV／≤2193 MHz | 700 mV／≤921.6 MHz |

插电方案按官方充电器条件选档，普通USB或供电不明时沿用掌机方案。输入超出本工具Mariko参考范围1300–1849时，
对应项目不外推；没有符合预算的升频档则保留指南频率。此范围和预算是本工具取舍，不是芯片物理边界。

### RAM规则

先按下表选择，再检查HOC `board_volt.cpp` 中GPU Speedo分档对应的RAM电压要求：

| RAM ID | 首版进阶目标 | VDDQ |
| --- | ---: | ---: |
| WT:B、WT:E、WT:F | 2400 MHz | 600 mV |
| NEI／NEE／x267、AA-MGCL／MGCR | 2400 MHz | 640 mV |
| AM-MGCJ、AB-MGCL、NME | 2133 MHz | 640 mV |
| 未识别ID | 1866 MHz | 600 mV |

这是对社区经验范围的保守缩小，不是额定规格、HOC内置颗粒保证或已验证结果。VDDQ640来自指南经验，不能理解为厂商额定值。
Hekate规格表仅用于核对颗粒身份和3733/4266Mbps速度等级，额定速度不是超频极限；NEI/MGCR身份映射仍以完整颗粒信息为准。

GPU分档采用 **2.6.0代码**：1300–1624、1625–1689、1690–1753、1754–1849。第一档在RAM2400时电压表要求640mV，
不符合保持GPU最低610mV的策略，因此降到2133；其余分档的2400目标在本版表中要求不高于610。
这只排除一个已知电压冲突，不证明内存稳定，也不能替代GPU与RAM的组合测试。

全部保持VDD2 1175mV、DVB0、HP关闭、默认时序和延迟，不套Common/ST，不自动推荐2666MHz以上的极限档。
先单独验证颗粒电压，再按1866→2133→2400逐级提高。CPU高频750mV固定的前提下，不照抄指南高RAM频率可能需要850–870mV的配置。

### 示例

CPU1651 / GPU1677 / SoC1688 / WT:F，续航版或OLED：

| 方案／场景 | RAM | CPU | GPU | CPU降压 |
| --- | ---: | ---: | ---: | --- |
| 指南安全上限／掌机 | 1866 | 1581 | 614.4 | 0/0 |
| 指南安全上限／插电 | 1866 | 1785 | 768 | 0/0 |
| 进阶性能／掌机 | 2400 | 1963.5 | 921.6 | 0/0 |
| 进阶性能／插电 | 2400 | 2193 | 1075.2 | 0/1 |

频率单位MHz。示例是规则计算结果，没有替用户的主机完成这些组合的实机验证。

## 使用与回退

先备份NAND、SD卡、可启动KIP及HOC配置，确认可以进入Hekate恢复。先通过指南配置，再一次只改一项颗粒电压、CPU降压或频率。
KIP参数更改后保存KIP并完全重启；检查旧的全局／各游戏自动档是否覆盖推荐运行值。
逐项观察冷启动、休眠唤醒、实际时钟和常玩的游戏；跑分提升、一次进桌面或单项测试通过都不代表组合长期稳定。
高频UV1不稳定时，恢复UV0/0及指南档，必要时RAM1600排查，不继续增加降压等级。异常立即恢复此前可启动KIP与配置。
超频或内存不稳定可能导致卡死、无法启动、数据损坏。保留温度及功耗保护的默认设置，不照搬指南中关闭保护的建议。

页面、复制文本和PNG共同使用 `configSections`、`selectionNotes` 与验证步骤，输出顺序为安全设置→RAM→CPU→GPU。
未增加对比表或表单；旧版正常布局保留，仅修复长内存ID在手机上的自动折行。

## 资料来源与版本冲突

- [HOC 2.6.0-rel](https://github.com/Horizon-OC/Horizon-OC/releases/tag/2.6.0-rel)：本整合包实际使用版本。
- [customize.cpp](https://github.com/Horizon-OC/Horizon-OC/blob/2.6.0-rel/Source/Atmosphere/stratosphere/loader/source/oc/customize.cpp)：默认值、CPU/GPU电压表。
- [pcv.hpp](https://github.com/Horizon-OC/Horizon-OC/blob/2.6.0-rel/Source/Atmosphere/stratosphere/loader/source/oc/pcv/pcv.hpp)、[pcv_mariko.cpp](https://github.com/Horizon-OC/Horizon-OC/blob/2.6.0-rel/Source/Atmosphere/stratosphere/loader/source/oc/pcv/pcv_mariko.cpp)：实际选表、UV门槛、频率范围。
- [board_fuse.cpp](https://github.com/Horizon-OC/Horizon-OC/blob/2.6.0-rel/Source/hoc-clk/sysmodule/src/board/board_fuse.cpp)、[board_volt.cpp](https://github.com/Horizon-OC/Horizon-OC/blob/2.6.0-rel/Source/hoc-clk/sysmodule/src/board/board_volt.cpp)：GPU Speedo分档及RAM/GPU电压关系。
- [HOC官网Mariko指南](https://github.com/Horizon-OC/horizon-oc.github.io/blob/21c574a07d953c3341e573624c26fb3e9bf1a9a8/docs/mariko.md)、[另一版指南](https://github.com/Horizon-OC/horizon-oc.github.io/blob/21c574a07d953c3341e573624c26fb3e9bf1a9a8/docs/mariko2.md)：2026-06-07的经验资料，用于参考颗粒、供电、调整顺序，不直接套用整套高频/低压/紧时序。
- [Hekate v6.5.4颗粒规格](https://github.com/CTCaer/hekate/blob/v6.5.4/nyx/nyx_gui/frontend/gui_info.c)：颗粒名称及3733/4266Mbps规格。
- [NVIDIA Tegra CVB公式](https://github.com/OE4T/linux-tegra-4.9/blob/oe4t-patches-l4t-r32.7.4/drivers/soc/tegra/cvb.c)、[缩放参数](https://github.com/OE4T/linux-tegra-4.9/blob/oe4t-patches-l4t-r32.7.4/drivers/soc/tegra/tegra210-dvfs.c)。
- [HOC Web-vMin-Calculator](https://github.com/Horizon-OC/Web-vMin-Calculator)：交叉参考；分档边界有三个值与2.6.0不同，实际使用代码边界。
- [Dominatorul测试指南备份](https://github.com/dominatorul/Guides/blob/main/stability.md)：明确标记可能过时，测试思路仅作补充；基准测试不能当作稳定证明。

例如官网指南仍提DVB10，但2.6.0界面最高8；不同指南颗粒等级与频率也有差异。发生冲突以目标版本源码和用户确认的设置为准。
HOC代码支持的最大频率或校验上限不表示该频率适合日常使用。上游代码与文档按各自许可证提供，数据和公式在此注明出处。

## 本地预览与验证

```bash
cd /Users/velvet/Geek.localized/Mariko-OC-Configurator
python3 -m http.server 18765 --bind 127.0.0.1
```

访问 `http://127.0.0.1:18765`。测试：

```bash
node --test
node --check app.js
node --check configurator.js
node --check frequency-plan.js
git diff --check
```

后续发布须单独得到用户验收；改JS/CSS时同步更新HTML资源版本号，防止混用旧脚本缓存。

交流社群：阿抖群912250885031，阿Q群281559687。
