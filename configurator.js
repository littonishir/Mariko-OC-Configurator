(function (root, factory) {
    const api = factory(typeof module === "object" && module.exports
        ? require("./frequency-plan.js") : root.MarikoFrequencyPlan);
    if (typeof module === "object" && module.exports) module.exports = api;
    root.MarikoConfigurator = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (frequencyPlan) {
    "use strict";

    const HISTORY_NOTICE = "旧版曾统一推荐降压、紧时序和高频，已有用户反馈无法启动或进不去系统。请停用旧截图与旧推荐，先回退到自己已验证可启动的配置，再逐项排查。";
    const BASELINE_NOTE = "适用 HOC 2.6.0。保守配置用于确认基础运行，进阶配置按 Speedo、电压表和内存规格选择频率。调频器运行档与 KIP 上限分开设置；解锁频率不等于使用高频。先通过保守配置，再按 RAM → CPU → GPU 逐项提高，出现异常回退上一档。";
    const MODE_LABELS = { handheld: "掌机", plugged: "普通 USB 插电", docked: "官方充电器／底座" };
    const DVB_SHIFT_MAX = 8;
    // 只识别颗粒名称；别名不能确定这台机器的稳定频率、电压或时序。
    const RAM_PROFILES = [
        { id: "WT:B", aliases: ["WT:B"], ratedClock: 2133, ratingMbps: 4266 },
        { id: "NEE / x267", aliases: ["NEE", "X267"], ratedClock: 2133, ratingMbps: 4266 },
        { id: "NEI", aliases: ["NEI"], ratedClock: null, ratingMbps: null },
        { id: "AA-MGCL / MGCL", aliases: ["AA-MGCL", "MGCL"], ratedClock: 2133, ratingMbps: 4266 },
        { id: "AA-MGCR / MGCR", aliases: ["AA-MGCR", "MGCR"], ratedClock: null, ratingMbps: null },
        { id: "WT:E", aliases: ["WT:E"], ratedClock: 2133, ratingMbps: 4266 },
        { id: "AM-MGCJ", aliases: ["AM-MGCJ", "MGCJ"], ratedClock: 1866, ratingMbps: 3733 },
        { id: "WT:F", aliases: ["WT:F"], ratedClock: 2133, ratingMbps: 4266 },
        { id: "AB-MGCL", aliases: ["AB-MGCL"], ratedClock: 2133, ratingMbps: 4266 },
        { id: "NME", aliases: ["NME"], ratedClock: 1866, ratingMbps: 3733 }
    ];

    function normalizeRamId(value) {
        return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
    }

    function findRamProfile(value) {
        const normalized = normalizeRamId(value);
        return RAM_PROFILES.find((profile) => profile.aliases.some(
            (alias) => normalizeRamId(alias) === normalized
        )) || null;
    }

    function validateInput(input) {
        const errors = [];
        ["cpuSpeedo", "gpuSpeedo", "socSpeedo"].forEach((key) => {
            const value = Number(input[key]);
            if (!Number.isFinite(value) || value < 1200 || value > 2000) {
                errors.push(`${key} 必须是 1200 到 2000 之间的数字`);
            }
        });
        if (!String(input.ramId || "").trim()) errors.push("请输入 RAM Module ID");
        if (input.ramId.length > 32) errors.push("RAM Module ID 最多 32 个字符，请只填写颗粒标识");
        if (!["regular", "lite"].includes(input.model)) errors.push("请选择正确的机型");
        if (!Object.hasOwn(MODE_LABELS, input.mode)) errors.push("请选择使用场景");
        if (!["balanced", "performance"].includes(input.goal)) errors.push("请选择调校目标");
        return errors;
    }

    function recommend(rawInput) {
        const input = {
            cpuSpeedo: Number(rawInput.cpuSpeedo),
            gpuSpeedo: Number(rawInput.gpuSpeedo),
            socSpeedo: Number(rawInput.socSpeedo),
            ramId: String(rawInput.ramId || "").trim(),
            model: rawInput.model || "regular",
            mode: rawInput.mode || "handheld",
            goal: rawInput.goal || "balanced"
        };
        const errors = validateInput(input);
        if (errors.length) return { ok: false, errors };

        const ram = findRamProfile(input.ramId);
        const isHandheld = input.mode === "handheld";
        const isPerformance = input.goal === "performance";
        const frequencies = frequencyPlan.selectFrequencies(input, ram);
        const warnings = [
            HISTORY_NOTICE,
            "HOC 默认参数不等于 HOS 原厂设置，也不保证任何一台机器稳定；GPU HiOPT 仍是 HOC 的电压表，不代表完全无降压。",
            "Speedo 不能单独确定稳定频率、降压等级或最低电压，识别 RAM 颗粒也不能保证高频稳定。",
            "超频或内存不稳定可能导致死机、无法启动以及 emuNAND、sysNAND 或 SD 卡数据损坏；先备份并确认恢复方法，再在 emuNAND 验证。"
        ];
        if (!ram) warnings.push("未识别 RAM ID；仅展示 HOC 默认 KIP 参数，运行频率保持 1600 MHz，查明颗粒前不提供升频路线。");
        if (ram && !ram.ratedClock) warnings.push(`${ram.id} 的速度等级尚未核实，RAM 先保持 1600 MHz，不套用其他颗粒的频率。`);
        if (!frequencies.gpu.inRange) warnings.push("GPU Speedo 超出 HOC Mariko 分档参考范围（1300–1849），请核对录入与机型；GPU 保持保守频率。");
        if (input.model === "lite") warnings.push("Lite 的供电与散热条件不同，不能照搬 OLED／续航版的高频结果；插电也不代表具备底座散热条件。");

        const tuningNotes = {
            ram: [
                "首轮 RAM 运行在 1600 MHz；保留默认电压、默认延迟、DVB 0、高性能关闭，时序缩减 t1–t8 及其他时序微调全部恢复默认 0。",
                "2133 MHz 是本次保留的 HOC 默认 KIP 上限，不是需要立即设置的运行频率。"
            ],
            cpu: [
                "首轮调频器 CPU 设为 1020 MHz，低频／高频降压均为 0；加速频率是独立 KIP 设置，可能暂时高于运行档。",
                "先验证冷启动、休眠唤醒及游戏负载，再单独测试 CPU 升频或降压，每次只改变一项；不凭 Speedo 推算最低电压。"
            ],
            gpu: [
                `首轮调频器 GPU 设为 ${isHandheld ? 384 : 768} MHz，HiOPT、最低电压 610 mV、电压偏移 0 为 HOC 默认排查起点。`,
                "CPU 和 RAM 保持已验证值，单独测试 GPU；出现花屏、卡死或休眠异常立即回退，不统一推荐额外降压。"
            ]
        };
        if (isPerformance) {
            tuningNotes.ram = [
                `RAM 运行路线：${frequencies.ram.route.join(" → ")} MHz。${ram && ram.ratingMbps ? `按 ${ram.id} 的 ${ram.ratingMbps} Mbps 规格选档；规格不代表这台机器的稳定保证。` : "速度等级未核实，先保持 1600 MHz。"}`,
                "一次只改变一项；全程保留 DVB 0、默认电压和默认时序，不额外提高 VDDQ 或收紧时序。"
            ];
            tuningNotes.cpu = [
                `CPU 运行路线：${frequencies.cpu.route.join(" → ")} MHz；按 TBREAK1683 表与 CPU Speedo 筛选，降压保持 0/0，当前表不推荐超过 1963.5 MHz。`,
                "CPU 加速频率仍保持 HOC 默认 1963.5 MHz，可能短暂高于所选运行档；先检查实际时钟。"
            ];
            tuningNotes.gpu = [
                `GPU 运行路线：${frequencies.gpu.route.join(" → ")} MHz；使用 HiOPT、最低电压 610 mV、偏移 0，选档同时考虑机型和供电场景。`,
                "GPU 与 RAM 可能相互影响；各项分别通过后再检查组合负载、休眠与冷启动，异常回退上一档。"
            ];
        }

        return {
            ok: true,
            input,
            diagnosis: {
                cpu: { label: "电压表估算参考", tone: "neutral" },
                gpu: { label: "电压表估算参考", tone: "neutral" },
                soc: { label: "仅记录，不判断稳定", tone: "neutral" },
                ram: ram ? { label: "已识别，不代表稳定", tone: "neutral" } : { label: "未识别", tone: "warn" }
            },
            clocks: frequencies.clocks,
            frequencyPlan: frequencies,
            // 与 HOC 2.6.0-rel customize.cpp 对齐；并非 HOS 原厂参数或实机稳定性结论。
            cpu: {
                boostClock: 1963.5, maxClock: 1963.5, uvTable: 1683,
                lowUvStart: 0, highUvStart: 0, lowVmin: "620 mV",
                highVmin: "750 mV", voltageLimit: "1120 mV"
            },
            gpu: { table: "HiOPT（HOC 默认）", vmin: "610 mV", vmax: "800 mV", voltageOffset: "0" },
            ram: {
                recognized: Boolean(ram), id: ram ? ram.id : input.ramId,
                vdd2: "1175 mV", vddq: "600 mV", dvbShift: 0, socVmax: "默认（0）",
                hpMode: "关闭", stepMode: "JEDEC", maxClock: "2133 MHz",
                latencyEditor: "默认／自动（覆盖项全部 0）",
                timingReductions: "默认（t1–t8 全部 0；其他时序微调也保持默认）"
            },
            risk: isPerformance ? "进阶配置" : "保守配置",
            tuningNotes,
            validationSteps: [
                "先备份 NAND、SD 卡、当前可启动的 loader.kip 与 HOC 配置，并确认能进入 Hekate 和从电脑恢复备份；先保留已验证可启动的配置。",
                "按 HOC 对应页面区分调频器运行档和 KIP 设置；KIP 更改后必须保存 KIP、完全重启。检查全局、掌机／插电及各游戏配置，确认旧超频档没有自动覆盖运行值。",
                "先验证不加额外降压、RAM 1600 MHz 的排查基线，检查监控中的实际时钟、电压与温度；不要同时测试 CPU、GPU 和 RAM 升频。",
                "每次只改一项，记录结果，逐项验证冷启动、休眠唤醒及常玩的游戏；单次进桌面或跑分通过不等于长期稳定。",
                "回退：遇到无法启动、花屏、卡死或休眠异常，停止测试，通过 Hekate／读卡器恢复先前已验证的 KIP 与 HOC 配置，再完全重启；若基线仍异常，先排查版本和环境，不继续加压或升频。"
            ],
            warnings
        };
    }

    function configSections(result) {
        return [
            {
                title: "安全设置", kicker: "SAFE", textLabel: "安全设置",
                rows: [["解锁频率", "建议打开"], ["解锁说明", "解锁不等于使用高频；先验证下列运行档"]]
            },
            {
                title: "内存", kicker: "RAM", textLabel: "RAM",
                rows: [
                    ["RAM运行频率（调频器）", `${result.clocks.ramTarget} MHz`],
                    ["DVB偏移", result.ram.dvbShift],
                    ["SoC最高电压", result.ram.socVmax],
                    ["高性能模式", result.ram.hpMode],
                    ["内存VDD2电压", result.ram.vdd2],
                    ["内存VDDQ电压", result.ram.vddq],
                    ["步进模式", result.ram.stepMode],
                    ["内存最高频率（KIP上限）", result.ram.maxClock],
                    ["内存延迟编辑", result.ram.latencyEditor],
                    ["内存时序优化", result.ram.timingReductions]
                ]
            },
            {
                title: "处理器", kicker: "CPU", textLabel: "CPU",
                rows: [
                    ["CPU运行频率（调频器）", `${result.clocks.cpu} MHz`],
                    ["CPU低频降压", result.cpu.lowUvStart],
                    ["CPU高频降压", result.cpu.highUvStart],
                    ["CPU降压模式", `${result.cpu.uvTable} MHz 分界频率`],
                    ["CPU低频最低电压", result.cpu.lowVmin],
                    ["CPU高频最低电压", result.cpu.highVmin],
                    ["CPU最高电压", result.cpu.voltageLimit],
                    ["CPU最高频率（KIP上限）", `${result.cpu.maxClock} MHz`],
                    ["CPU加速频率（KIP）", `${result.cpu.boostClock} MHz`]
                ]
            },
            {
                title: "图形处理器", kicker: "GPU", textLabel: "GPU",
                rows: [
                    ["GPU运行频率（调频器）", `${result.clocks.gpu} MHz`],
                    ["GPU降压模式", result.gpu.table],
                    ["GPU最低电压", result.gpu.vmin],
                    ["GPU最高电压", result.gpu.vmax],
                    ["GPU电压偏移", result.gpu.voltageOffset]
                ]
            }
        ];
    }

    function selectionNotes(result) {
        if (result.input.goal !== "performance") return ["RAM 1600 MHz、CPU 1020 MHz、GPU 掌机 384／插电 768 MHz；先确认基础运行，再切换进阶配置。"];
        const plan = result.frequencyPlan;
        return [
            `CPU：Speedo ${result.input.cpuSpeedo}，TBREAK1683 表估算约 ${plan.cpu.estimatedMv} mV；本工具以 ${plan.cpu.budgetMv} mV 预算筛选到 ${result.clocks.cpu} MHz。`,
            plan.gpu.estimatedMv === null ? "GPU：Speedo 超出 Mariko 参考范围，保留保守频率。"
                : `GPU：Speedo ${result.input.gpuSpeedo}，HiOPT 表在 0–90°C 范围估算约 ${plan.gpu.estimatedMv} mV；以 ${plan.gpu.budgetMv} mV 预算及场景范围筛选到 ${result.clocks.gpu} MHz。`,
            `RAM：${plan.ram.ratingMbps ? `${plan.ram.ratingMbps} Mbps 规格，` : "速度等级未核实，"}建议 ${result.clocks.ramTarget} MHz；SoC Speedo 不用于推算颗粒极限。`,
            "电压估算只是选档参考，不是应填写的电压，也不是实测结果；预算是本工具的筛选策略，不是上游安全线。实际电压、温度和功耗以监控为准。"
        ];
    }

    function presetSummaryRows(result) {
        return ["balanced", "performance"].map(goal => {
            const input = { ...result.input, goal };
            const {clocks} = frequencyPlan.selectFrequencies(input, findRamProfile(input.ramId));
            return [goal === "balanced" ? "保守配置" : "进阶配置", clocks.ramTarget, clocks.cpu, clocks.gpu];
        });
    }

    function toText(result) {
        if (!result || !result.ok) return "无法生成配置";
        return [
            "星野無上 HOC 配置助手 · 2026-11-02 修正版",
            `场景: ${result.input.model === "lite" ? "Switch Lite" : "续航版 / OLED"} · ${MODE_LABELS[result.input.mode]} · ${result.risk}`,
            `硬件记录: CPU Speedo ${result.input.cpuSpeedo} / GPU Speedo ${result.input.gpuSpeedo} / SoC Speedo ${result.input.socSpeedo} / RAM ${result.input.ramId}`,
            "", HISTORY_NOTICE, BASELINE_NOTE, "",
            ...presetSummaryRows(result).map(([name, ram, cpu, gpu]) => `[${name}] RAM ${ram} / CPU ${cpu} / GPU ${gpu} MHz`),
            `以下详细参数对应：${result.risk}`, "",
            ...configSections(result).map(({ textLabel, rows }) =>
                `[${textLabel}] ${rows.map(([label, value]) => `${label} ${value}`).join(" / ")}`),
            "", "选档依据:", ...selectionNotes(result).map(note => `- ${note}`),
            "", "验证顺序与回退:",
            ...result.validationSteps.map((step, index) => `${index + 1}. ${step}`),
            "", "后续调参说明:",
            ...Object.entries(result.tuningNotes).flatMap(([scope, notes]) => notes.map((note) => `- [${scope.toUpperCase()}] ${note}`)),
            "", "注意:",
            ...result.warnings.map((warning) => `- ${warning}`)
        ].join("\n");
    }

    return { HISTORY_NOTICE, BASELINE_NOTE, MODE_LABELS, DVB_SHIFT_MAX, RAM_PROFILES, findRamProfile, recommend, configSections, selectionNotes, presetSummaryRows, toText };
}));
