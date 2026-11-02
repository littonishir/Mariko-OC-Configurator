(function (root, factory) {
    const api = factory(typeof module === "object" && module.exports
        ? require("./frequency-plan.js") : root.MarikoFrequencyPlan);
    if (typeof module === "object" && module.exports) module.exports = api;
    root.MarikoConfigurator = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (frequencyPlan) {
    "use strict";

    const HISTORY_NOTICE = "旧版曾统一推荐降压、紧时序和高频，已有用户反馈无法启动或进不去系统。请停用旧截图与旧推荐，先回退到自己已验证可启动的配置，再逐项排查。";
    const BASELINE_NOTE = "适用 HOC 2.6.0。先通过指南安全上限，再逐项应用进阶性能；最低电压保留 CPU 620/750、GPU 610 mV，DVB 0、默认时序。插电／底座按官方充电器条件选档，普通 USB 沿用掌机配置。";
    const MODE_LABELS = { handheld: "掌机", plugged: "插电／底座" };
    const DVB_SHIFT_MAX = 8;
    // 只识别颗粒名称；别名不能确定这台机器的稳定频率、电压或时序。
    const RAM_PROFILES = [
        { id: "WT:B", aliases: ["WT:B"], ratingMbps: 4266, advancedClock: 2666, vddq: 600 },
        { id: "NEE / x267", aliases: ["NEE", "X267"], ratingMbps: 4266, advancedClock: 2666, vddq: 640 },
        { id: "NEI", aliases: ["NEI"], ratingMbps: null, advancedClock: 2666, vddq: 640 },
        { id: "AA-MGCL / MGCL", aliases: ["AA-MGCL", "MGCL"], ratingMbps: 4266, advancedClock: 2666, vddq: 640 },
        { id: "AA-MGCR / MGCR", aliases: ["AA-MGCR", "MGCR"], ratingMbps: null, advancedClock: 2666, vddq: 640 },
        { id: "WT:E", aliases: ["WT:E"], ratingMbps: 4266, advancedClock: 2400, vddq: 600 },
        { id: "AM-MGCJ", aliases: ["AM-MGCJ", "MGCJ"], ratingMbps: 3733, advancedClock: 2400, vddq: 640 },
        { id: "WT:F", aliases: ["WT:F"], ratingMbps: 4266, advancedClock: 2400, vddq: 600 },
        { id: "AB-MGCL", aliases: ["AB-MGCL"], ratingMbps: 4266, advancedClock: 2400, vddq: 640 },
        { id: "NME", aliases: ["NME"], ratingMbps: 3733, advancedClock: 2133, vddq: 640 }
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
            if (!Number.isInteger(value) || value < 1200 || value > 2000) {
                errors.push(`${key} 必须是 1200 到 2000 之间的整数`);
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
            "生成配置不是本机实测结果；逐项检查冷启动、休眠和实际游戏负载。",
            "HOC 默认参数不等于 HOS 原厂设置，也不保证任何一台机器稳定；GPU HiOPT 仍是 HOC 的电压表，不代表完全无降压。",
            "Speedo 不能单独确定稳定频率、降压等级或最低电压，识别 RAM 颗粒也不能保证高频稳定。",
            "超频或内存不稳定可能导致死机、无法启动以及 emuNAND、sysNAND 或 SD 卡数据损坏；先备份并确认恢复方法，再在 emuNAND 验证。"
        ];
        if (!ram) warnings.push("未识别 RAM ID；RAM 保持指南档 1866 MHz 和默认参数，查明颗粒前不额外升频。");
        if (!frequencies.cpu.inRange) warnings.push("CPU Speedo 超出本工具 Mariko 参考范围（1300–1849），请核对录入；CPU 沿用指南频率。");
        if (!frequencies.gpu.inRange) warnings.push("GPU Speedo 超出 HOC Mariko 分档参考范围（1300–1849），请核对录入与机型；GPU 保持保守频率。");
        if (isPerformance && frequencies.ram.requestedClock > frequencies.clocks.ramTarget) warnings.push(`颗粒经验档为 ${frequencies.ram.requestedClock} MHz；为保留 GPU 最低 610 mV，本次内存下调至 ${frequencies.clocks.ramTarget} MHz。`);
        if (isPerformance && frequencies.cpu.highUv) warnings.push("CPU 高频降压 1 用于开启更高频率范围，Speedo 无法保证该降压等级稳定；若无法启动或异常，恢复高频降压 0 和指南配置，不继续增加等级。");
        if (input.model === "lite") warnings.push("Lite 的供电与散热条件不同，不能照搬 OLED／续航版的高频结果；插电也不代表具备底座散热条件。");

        const tuningNotes = {
            ram: [
                "指南档 RAM 1866 MHz，DVB 0、高性能关闭、默认延迟、时序缩减 t1–t8 及其他时序微调保持默认 0。",
                "已有无法启动或卡死问题时，先回到自己已验证配置；必要时用 1600 MHz 排查，不能启动时不要继续升频。"
            ],
            cpu: [
                `指南档 CPU ${isHandheld ? 1581 : 1785} MHz，低频／高频降压均为 0；加速频率独立为 1963.5 MHz，可能暂时高于运行档。`,
                "先验证冷启动、休眠唤醒及游戏负载，再单独测试 CPU 升频或降压，每次只改变一项；不凭 Speedo 推算最低电压。"
            ],
            gpu: [
                `指南档 GPU ${isHandheld ? 614.4 : 768} MHz，HiOPT、最低电压 610 mV、电压偏移 0。`,
                "CPU 和 RAM 保持已验证值，单独测试 GPU；出现花屏、卡死或休眠异常立即回退，不统一推荐额外降压。"
            ]
        };
        if (isPerformance) {
            tuningNotes.ram = [
                `RAM 运行路线：${frequencies.ram.route.join(" → ")} MHz。${ram ? `参考 ${ram.id} 的指南经验，再检查 HOC GPU/RAM 电压关系；经验频率不是这台机器的实测结果。` : "颗粒未识别，保持指南1866档。"}`,
                `颗粒 VDDQ 建议 ${frequencies.ram.vddq} mV，VDD2 1175 mV；先验证这项，再逐档升频。DVB 0、默认延迟、默认时序、高性能关闭，不套用 Common/ST。`
            ];
            tuningNotes.cpu = [
                `CPU 运行路线：${frequencies.cpu.route.join(" → ")} MHz；低频降压 0、高频降压 ${frequencies.cpu.highUv}。超过 1963.5 MHz 才使用高频降压 1，先单独验证降压再升频；不能稳定则回退指南档。`,
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
                boostClock: 1963.5, maxClock: frequencies.cpu.maxClock, uvTable: 1683,
                lowUvStart: 0, highUvStart: frequencies.cpu.highUv, lowVmin: "620 mV",
                highVmin: "750 mV", voltageLimit: "1120 mV"
            },
            gpu: { table: "HiOPT（HOC 默认）", vmin: "610 mV", vmax: "800 mV", voltageOffset: "0" },
            ram: {
                recognized: Boolean(ram), id: ram ? ram.id : input.ramId,
                vdd2: "1175 mV", vddq: `${frequencies.ram.vddq} mV`, dvbShift: 0, socVmax: "默认（0）",
                hpMode: "关闭", stepMode: "JEDEC", maxClock: `${frequencies.clocks.ramTarget} MHz`,
                latencyEditor: "默认",
                timingReductions: "默认（t1–t8 全部 0；其他时序微调也保持默认）"
            },
            risk: isPerformance ? "进阶性能" : "指南安全上限",
            tuningNotes,
            validationSteps: [
                "先备份 NAND、SD 卡、当前可启动的 loader.kip 与 HOC 配置，并确认能进入 Hekate 和从电脑恢复备份；先保留已验证可启动的配置。",
                "按 HOC 对应页面区分调频器运行档和 KIP 设置；KIP 更改后必须保存 KIP、完全重启。检查全局、掌机／插电及各游戏配置，确认旧超频档没有自动覆盖运行值。",
                "先通过指南安全上限（RAM1866、CPU与GPU使用指南档），再逐项设置颗粒电压、CPU降压或频率；不要同时更改。监控实际时钟、温度与功耗，异常时恢复指南档，必要时RAM1600排查。",
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
                rows: [["解锁频率", "建议打开"]]
            },
            {
                title: "内存", kicker: "RAM", textLabel: "RAM",
                rows: [
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
                    ["GPU降压模式", result.gpu.table],
                    ["GPU最低电压", result.gpu.vmin],
                    ["GPU最高电压", result.gpu.vmax],
                    ["GPU电压偏移", result.gpu.voltageOffset]
                ]
            }
        ];
    }

    function selectionNotes(result) {
        if (result.input.goal !== "performance") return ["指南档 RAM1866、CPU 掌机1581／插电1785、GPU 掌机614.4／插电768 MHz；CPU降压0/0、默认时序。名称沿用原版，不代表保证所有机器稳定；CPU加速仍可暂时到1963.5 MHz。"];
        const plan = result.frequencyPlan;
        return [
            !plan.cpu.inRange ? "CPU：Speedo 超出参考范围，沿用指南频率，不外推电压与更高降压等级。"
                : plan.cpu.matchedBudget ? `CPU：Speedo ${result.input.cpuSpeedo}，TBREAK1683 表估算约 ${plan.cpu.estimatedMv} mV；本工具以 ${plan.cpu.budgetMv} mV 预算筛选到 ${result.clocks.cpu} MHz。`
                    : "CPU：未找到符合筛选预算的升频档，沿用指南频率。",
            plan.gpu.estimatedMv === null ? "GPU：Speedo 超出 Mariko 参考范围，保留保守频率。"
                : plan.gpu.matchedBudget ? `GPU：Speedo ${result.input.gpuSpeedo}，HiOPT 表在 0–90°C 范围估算约 ${plan.gpu.estimatedMv} mV；以 ${plan.gpu.budgetMv} mV 预算及场景范围筛选到 ${result.clocks.gpu} MHz。`
                    : "GPU：未找到符合筛选预算的升频档，沿用指南频率。",
            `RAM：按颗粒指南经验及 HOC GPU 分档 ${plan.gpu.bracket === null ? "未识别" : plan.gpu.bracket}，建议 ${result.clocks.ramTarget} MHz，VDDQ ${plan.ram.vddq} mV；保留 GPU 最低610 mV，SoC Speedo 不用于推算颗粒极限。`,
            "电压估算只是选档参考，不是应填写的电压，也不是实测结果；预算是本工具的筛选策略，不是上游安全线。实际电压、温度和功耗以监控为准。",
            ...(result.clocks.ramTarget % 1 === 0 && ![1866,1996,2133,2400,2666,2933,3200].includes(result.clocks.ramTarget)
                ? [`${result.clocks.ramTarget} MHz 是自定义内存最大档，HOC 会将它附加到 JEDEC 频率列表，步进模式仍使用 JEDEC。`]
                : []),
            ...(result.clocks.ramTarget >= 2533
                ? ["该内存频率跨过 2533 MHz 时序阈值；保持默认时序不代表绕过该变化，需单独验证，异常退到 2400 MHz。"]
                : [])
        ];
    }

    function toText(result) {
        if (!result || !result.ok) return "无法生成配置";
        return [
            "星野無上 HOC 配置助手 · 2026-11-02 修正版",
            `场景: ${result.input.model === "lite" ? "Switch Lite" : "续航版 / OLED"} · ${MODE_LABELS[result.input.mode]} · ${result.risk}`,
            `硬件记录: CPU Speedo ${result.input.cpuSpeedo} / GPU Speedo ${result.input.gpuSpeedo} / SoC Speedo ${result.input.socSpeedo} / RAM ${result.input.ramId}`,
            "", HISTORY_NOTICE, BASELINE_NOTE, "",
            `[建议频率] CPU ${result.clocks.cpu} MHz / GPU ${result.clocks.gpu} MHz / RAM ${result.clocks.ramTarget} MHz`,
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

    return { HISTORY_NOTICE, BASELINE_NOTE, MODE_LABELS, DVB_SHIFT_MAX, RAM_PROFILES, findRamProfile, recommend, configSections, selectionNotes, toText };
}));
