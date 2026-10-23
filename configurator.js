(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    root.MarikoConfigurator = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const DVB_SHIFT_MAX = 8;

    const RAM_PROFILES = [
        {
            id: "WT:B",
            aliases: ["WT:B"],
            tier: "GOD",
            range: [3066, 3200],
            vdd2: 1175,
            vddq: 600,
            common: "(4-4-5) 4-2-6-5-6",
            tight: "(6-6-7) 5-2-6-5-6"
        },
        {
            id: "NEI / NEE / x267",
            aliases: ["NEI", "NEE", "X267"],
            tier: "GOD",
            range: [3100, 3300],
            vdd2: 1175,
            vddq: 640,
            common: "(3-3-2) 1-5-5-4-6",
            tight: "(4-4-4) 2-7-6-5-6"
        },
        {
            id: "AA-MGCL / AA-MGCR",
            aliases: ["AA-MGCL", "AA-MGCR", "MGCL", "MGCR"],
            tier: "S",
            range: [2766, 3100],
            vdd2: 1175,
            vddq: 640,
            common: "(4-4-5) 4-5-5-6-6",
            tight: "(4-4-8) 5-5-6-7-6"
        },
        {
            id: "WT:E",
            aliases: ["WT:E"],
            tier: "A?",
            range: [2500, 3033],
            vdd2: 1175,
            vddq: 600,
            common: "(2-2-2) 1-4-4-4-6",
            tight: "(3-5-3) 2-5-4-5-6"
        },
        {
            id: "AM-MGCJ",
            aliases: ["AM-MGCJ", "MGCJ"],
            tier: "B",
            range: [2633, 2933],
            vdd2: 1175,
            vddq: 640,
            common: "(3-2-4) 1-4-4-4-6",
            tight: "(4-3-8) 1-5-4-4-6"
        },
        {
            id: "WT:F",
            aliases: ["WT:F"],
            tier: "C",
            range: [2633, 2800],
            vdd2: 1175,
            vddq: 600,
            common: "(4-4-2) 4-4-6-3-6",
            tight: "(5-5-4) 4-5-6-5-6"
        },
        {
            id: "AB-MGCL",
            aliases: ["AB-MGCL"],
            tier: "D",
            range: [2500, 2766],
            vdd2: 1175,
            vddq: 640,
            common: "(4-4-4) 3-4-5-6-6",
            tight: "(4-4-8) 4-5-6-8-6"
        },
        {
            id: "NME",
            aliases: ["NME"],
            tier: "E",
            range: [2300, 2766],
            vdd2: 1175,
            vddq: 640,
            common: "(2-2-3) 0-1-2-2-6",
            tight: "(5-3-4) 1-8-3-3-6"
        }
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

    function speedoGrade(value) {
        if (value < 1450) return { label: "低于常见范围", tone: "warn" };
        if (value > 1810) return { label: "高于常见范围", tone: "warn" };
        if (value >= 1650) return { label: "良好", tone: "good" };
        return { label: "常见范围", tone: "neutral" };
    }

    function ramStepMode(targetClock) {
        const jedecClocks = [1866, 1996, 2133, 2400, 2666, 2933, 3200];
        if (jedecClocks.includes(targetClock)) return "JEDEC";
        return targetClock % 100 === 0 ? "100 MHz" : "66 MHz";
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
        if (!["regular", "lite"].includes(input.model)) errors.push("请选择正确的机型");
        if (!["handheld", "plugged"].includes(input.mode)) errors.push("请选择使用场景");
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
        const isLite = input.model === "lite";
        const isHandheld = input.mode === "handheld";
        const isPerformance = input.goal === "performance";
        const timingPresetName = isPerformance ? "ST" : "Common";
        const timingPresetValue = ram
            ? (isPerformance ? ram.tight : ram.common)
            : null;
        const ramCap = isLite ? 2800 : Number.POSITIVE_INFINITY;
        const ramTarget = 2400;
        let ramTuningTarget = 2400;

        if (isPerformance) {
            if (isHandheld) {
                ramTuningTarget = 2500;
            } else if (ram) {
                ramTuningTarget = Math.max(2400, Math.min(ram.range[0], ramCap));
            } else {
                ramTuningTarget = Math.min(2666, ramCap);
            }
        }
        if (ramTuningTarget === 2533) ramTuningTarget = 2500;

        const cpuClock = isHandheld ? (isLite ? 1785 : 1963) : 2397;
        const gpuClock = isHandheld
            ? (isLite ? 921 : 998)
            : 1152;
        const batteryLimit = isLite ? 6.5 : 8.6;
        const warnings = [
            "该结果是安全起点和调参目标，不是稳定性保证；每台芯片体质都不同。",
            "RAM 不稳定可能导致 emuNAND、sysNAND 或 SD 卡损坏，务必先备份并在 emuNAND 测试。"
        ];

        if (!ram) {
            warnings.push("未识别 RAM ID，已采用保守通用参数，不提供颗粒专属时序。");
        } else {
            warnings.push(`已应用 ${ram.id} 的文档 ${timingPresetName} 时序；若不稳定，先恢复 Common 或默认 Timing Reductions。`);
        }
        if (input.cpuSpeedo < 1450 || input.gpuSpeedo < 1450 || input.socSpeedo < 1450) {
            warnings.push("至少一项 Speedo 低于指南常见范围，降压和高频余量可能较小。");
        }
        if (input.cpuSpeedo > 1810 || input.gpuSpeedo > 1810 || input.socSpeedo > 1810) {
            warnings.push("至少一项 Speedo 高于指南常见范围，请确认录入值无误。");
        }
        if (!isHandheld && isPerformance) {
            warnings.push("当前配置保守使用 1152 MHz；只有关闭 GPU调度且确认 1228 MHz 电压低于 800 mV 后，才测试 1228 MHz。");
        }
        if (ramTuningTarget > 3000) warnings.push("后续目标超过 3000 MHz，更容易发生 PLL掉频，必须监控实际内存时钟。");
        if (isHandheld) warnings.push(`掌机长时间整机功耗建议控制在 ${batteryLimit} W 以下。`);

        return {
            ok: true,
            input,
            diagnosis: {
                cpu: speedoGrade(input.cpuSpeedo),
                gpu: speedoGrade(input.gpuSpeedo),
                soc: speedoGrade(input.socSpeedo),
                ram: ram ? { label: "已识别", tone: "good" } : { label: "未知", tone: "warn" }
            },
            clocks: {
                cpu: cpuClock,
                gpu: gpuClock,
                ramStart: 2133,
                ramTarget,
                ramTuningTarget,
                powerLimit: isHandheld ? batteryLimit : (isLite ? 12 : 18)
            },
            cpu: {
                boostClock: 2601,
                uvTable: 1683,
                lowUvStart: 4,
                highUvStart: 5,
                lowVmin: "590 mV",
                highVmin: "750 mV",
                voltageLimit: "1120 mV"
            },
            gpu: {
                table: "高降压",
                vmin: "580 mV",
                vmax: "800 mV",
                voltageOffset: "0"
            },
            ram: {
                recognized: Boolean(ram),
                id: ram ? ram.id : input.ramId,
                tier: ram ? ram.tier : "未知",
                expectedRange: ram ? `${ram.range[0]}-${ram.range[1]} MHz` : "未知，保守测试",
                vdd2: ram ? `${ram.vdd2} mV` : "1175 mV",
                vddq: ram ? `${ram.vddq} mV` : "保持默认/查明颗粒后设置",
                common: ram ? ram.common : "使用默认 Common Timings",
                tight: ram ? ram.tight : "暂不使用 ST Timings",
                dvbShift: ram ? DVB_SHIFT_MAX : 5,
                socVmax: "默认",
                hpMode: "关闭",
                stepMode: ramStepMode(ramTarget),
                maxClock: `${ramTarget} MHz`,
                latencyEditor: "2133 Latency Max",
                timingReductions: timingPresetValue
                    ? `${timingPresetName}: ${timingPresetValue}`
                    : "默认"
            },
            risk: isPerformance ? "进阶调校" : "指南安全上限",
            tuningNotes: {
                cpu: [
                    "CPU低频降压从 4、CPU高频降压从 5 开始逐级验证；不能启动或不稳定时降低降压等级。",
                    "只有 CPU高频降压 1 仍不稳定时，才把 CPU降压模式从 1683 MHz 分界频率改为 1581 MHz。",
                    "低频不稳定时可把 CPU低频最低电压提高到 610-620 mV；高内存频率可能需要 850-870 mV CPU高频最低电压。"
                ],
                gpu: [
                    "GPU电压偏移首轮保持 0；基础配置稳定后再按 5、10、15、20、25 逐级测试，部分 GPU 必须保持 0。",
                    isHandheld
                        ? `当前 ${gpuClock} MHz 是指南给出的掌机安全上限，长时间使用仍需监控整机功耗。`
                        : "只有在 GPU调度关闭且 1228 MHz 电压低于 800 mV 时才测试 1228 MHz，否则保持 1152 MHz。"
                ],
                ram: [
                    ram
                        ? `已按文档应用 ${ram.id} ${timingPresetName} 时序，并将 DVB偏移设为 ${DVB_SHIFT_MAX}；先验证该组合稳定性。`
                        : "未识别 RAM 颗粒，保持默认内存时序优化，并使用 DVB偏移 5。",
                    isPerformance && ramTuningTarget > ramTarget
                        ? `2400 MHz 基线稳定后，再逐级测试到 ${ramTuningTarget} MHz；该值是调参目标，不是稳定保证。`
                        : isHandheld
                            ? "当前 2400 MHz 是指南给出的掌机续航与性能平衡点。"
                            : "插电模式仍从 2400 MHz 保守基线开始，确认稳定后再单独提高频率。",
                    "文档默认在 1866 MHz 以上使用 2133 tRWL，因此内存延迟编辑使用 2133 Latency Max。",
                    ram
                        ? isPerformance
                            ? "ST 不稳定时，按 t8 → t1 → t2 → t3 → t6 → t7 → t4 → t5 顺序逐项放宽；仍不稳定则退回 Common。"
                            : `Common 稳定后可测试 ST 时序 ${ram.tight}；失败时退回 Common。`
                        : "识别 RAM 颗粒后再测试对应的 Common/ST 时序。",
                    `Common/ST 稳定后再把 DVB偏移从 ${DVB_SHIFT_MAX} 逐步降低到 2-4。`,
                    "稳定后再开启高性能模式；2533 MHz 可能需要更宽松时序，3000 MHz 以上需监控 PLL掉频。"
                ]
            },
            warnings
        };
    }

    function toText(result) {
        if (!result || !result.ok) return "无法生成配置";
        return [
            "Mariko OC 推荐配置",
            `场景: ${result.input.model === "lite" ? "Switch Lite" : "续航版 / OLED"} · ${result.input.mode === "handheld" ? "掌机" : "插电/底座"} · ${result.risk}`,
            "",
            `[时钟] CPU ${result.clocks.cpu} MHz / GPU ${result.clocks.gpu} MHz / RAM ${result.clocks.ramStart} → ${result.clocks.ramTarget} MHz`,
            `[CPU] CPU低频降压 ${result.cpu.lowUvStart} / CPU高频降压 ${result.cpu.highUvStart} / CPU降压模式 ${result.cpu.uvTable} MHz 分界频率 / CPU低频最低电压 ${result.cpu.lowVmin} / CPU高频最低电压 ${result.cpu.highVmin} / CPU最高电压 ${result.cpu.voltageLimit} / CPU最高频率 ${result.clocks.cpu} MHz / CPU加速频率 ${result.cpu.boostClock} MHz`,
            `[GPU] GPU降压模式 ${result.gpu.table} / GPU最低电压 ${result.gpu.vmin} / GPU最高电压 ${result.gpu.vmax} / GPU电压偏移 ${result.gpu.voltageOffset}`,
            `[RAM] DVB偏移 ${result.ram.dvbShift} / SoC最高电压 ${result.ram.socVmax} / 高性能模式 ${result.ram.hpMode} / 内存VDD2电压 ${result.ram.vdd2} / 内存VDDQ电压 ${result.ram.vddq} / 步进模式 ${result.ram.stepMode} / 内存最高频率 ${result.ram.maxClock} / 内存延迟编辑 ${result.ram.latencyEditor} / 内存时序优化 ${result.ram.timingReductions}`,
            "",
            "后续调参说明:",
            ...Object.entries(result.tuningNotes).flatMap(([scope, notes]) => notes.map((note) => `- [${scope.toUpperCase()}] ${note}`)),
            "",
            "注意:",
            ...result.warnings.map((warning) => `- ${warning}`)
        ].join("\n");
    }

    return { DVB_SHIFT_MAX, RAM_PROFILES, findRamProfile, recommend, toText };
}));
