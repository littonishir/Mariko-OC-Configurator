(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    root.MarikoFrequencyPlan = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    // 数值来源：HOC 2.6.0-rel customize.cpp 的 TBREAK1683 / HiOPT 表。
    // 数学形式：NVIDIA Tegra CVB（sources 与本工具筛选策略见 README）。
    const CPU = [
        [1020, 1008066, -24205, 113], [1224, 1008066, -24205, 113],
        [1428, 1008066, -24205, 113], [1581, 1008066, -24205, 113],
        [1683, 1329076, -29795, 113], [1785, 1386213, -30655, 113],
        [1887, 1445416, -31515, 113], [1963.5, 1490873, -32155, 113],
        [2091, 1580725, -33235, 113], [2193, 1580725, -33235, 113],
        [2295, 1635431, -34095, 113], [2397, 1702903, -34955, 113]
    ];
    const GPU = [
        [384, 758712, -7304, -552, 119, -3750, -2],
        [460.8, 778712, -7304, -552, 119, -3750, -2],
        [537.6, 798712, -7304, -552, 119, -3750, -2],
        [614.4, 818712, -7304, -552, 119, -3750, -2],
        [691.2, 838712, -7304, -552, 119, -3750, -2],
        [768, 880210, -7955, -584, 0, -2849, 39],
        [844.8, 926398, -8892, -602, -60, -384, -93],
        [921.6, 970060, -10108, -614, -179, 1508, -13],
        [998.4, 1065665, -16075, -497, -179, 3213, 9],
        [1075.2, 1132576, -16093, -648, 0, 1077, 40]
    ];

    function nearest(value) {
        return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
    }

    function cvbUv(point, speedo) {
        const [, c0, c1, c2] = point;
        return nearest((nearest(c2 * speedo / 100) + c1) * speedo / 100) + c0;
    }

    function estimateCpuMv(point, speedo) {
        const floor = point[0] >= 1683 ? 750 : 620;
        return Math.ceil(Math.max(floor, cvbUv(point, speedo) / 1000) / 5) * 5;
    }

    function estimateGpuMv(point, speedo) {
        const [, , , , c3, c4, c5] = point;
        const base = cvbUv(point, speedo);
        // 0–90°C 每1°C扫描温度项的最高值；不把估算值作为应写入的电压。
        let maximum = 610000;
        for (let temperature = 0; temperature <= 90; temperature++) {
            const scaled = nearest(c3 * speedo / 100) + c4 + nearest(c5 * temperature / 10);
            maximum = Math.max(maximum, base + nearest(scaled * temperature / 10));
        }
        return Math.ceil(maximum / 5000) * 5;
    }

    function selectFrequencies(input, ram) {
        const handheld = input.mode === "handheld";
        const lite = input.model === "lite";
        const baseline = { cpu: handheld ? 1581 : 1785, gpu: handheld ? 614.4 : 768, ramStart: 1866, ramTarget: 1866 };
        // 以下预算是本助手的选档策略，不是上游安全电压或新增电压设置。
        const cpuBudget = handheld ? (lite ? 950 : 1000) : (lite ? 1050 : 1100);
        const cpuCap = handheld ? (lite ? 1785 : 1963.5) : (lite ? 2193 : 2397);
        const gpuBudget = handheld ? (lite ? 625 : 650) : (lite ? 700 : 750);
        const gpuCap = handheld ? (lite ? 768 : 921.6) : (lite ? 921.6 : 1075.2);
        const cpuInRange = input.cpuSpeedo >= 1300 && input.cpuSpeedo < 1850;
        const cpuPoints = cpuInRange ? CPU.filter(point => point[0] >= baseline.cpu && point[0] <= cpuCap
            && estimateCpuMv(point, input.cpuSpeedo) <= cpuBudget) : [];
        const gpuInRange = input.gpuSpeedo >= 1300 && input.gpuSpeedo < 1850;
        const gpuPoints = gpuInRange ? GPU.filter(point => point[0] >= baseline.gpu && point[0] <= gpuCap
            && estimateGpuMv(point, input.gpuSpeedo) <= gpuBudget) : [];
        const cpuPoint = cpuPoints[cpuPoints.length - 1] || CPU.find(point => point[0] === baseline.cpu);
        const gpuPoint = gpuPoints[gpuPoints.length - 1] || GPU.find(point => point[0] === baseline.gpu);
        const bracket = !gpuInRange ? null : input.gpuSpeedo <= 1624 ? 0 : input.gpuSpeedo <= 1689 ? 1 : input.gpuSpeedo <= 1753 ? 2 : 3;
        let ramTarget = ram && gpuInRange ? ram.advancedClock : 1866;
        // 对应 HOC board_volt.cpp 在 GPU 最低电压 610mV 时的内存频率边界。
        const ramAt610 = [2266, 2433, 2533, 2600];
        while (bracket !== null && ramTarget > ramAt610[bracket]) {
            ramTarget = ramTarget > 2133 ? 2133 : 1866;
        }
        const advanced = {
            cpu: cpuPoint[0], gpu: gpuPoint[0], ramStart: 1866, ramTarget
        };
        const clocks = input.goal === "performance" ? advanced : baseline;
        return {
            clocks,
            cpu: {
                estimatedMv: estimateCpuMv(CPU.find(point => point[0] === clocks.cpu), input.cpuSpeedo),
                budgetMv: cpuBudget, inRange: cpuInRange, matchedBudget: cpuPoints.length > 0,
                highUv: clocks.cpu > 1963.5 ? 1 : 0,
                maxClock: Math.max(1963.5, clocks.cpu),
                route: CPU.filter(point => point[0] >= baseline.cpu && point[0] <= clocks.cpu).map(point => point[0])
            },
            gpu: {
                estimatedMv: gpuInRange ? estimateGpuMv(GPU.find(point => point[0] === clocks.gpu), input.gpuSpeedo) : null,
                budgetMv: gpuBudget, capMHz: gpuCap, inRange: gpuInRange, bracket, matchedBudget: gpuPoints.length > 0,
                route: GPU.filter(point => point[0] >= baseline.gpu && point[0] <= clocks.gpu).map(point => point[0])
            },
            ram: {
                route: [1866, 2133, 2400].filter(freq => freq <= clocks.ramTarget),
                ratingMbps: ram ? ram.ratingMbps : null,
                vddq: input.goal === "performance" && ram && gpuInRange ? ram.vddq : 600,
                requestedClock: ram ? ram.advancedClock : 1866,
                // 本版只选1866/2133/2400；2400在bracket1的表要求为610，其余所选档<=610。
                requiredGpuMv: clocks.ramTarget <= 1866 ? 610 : clocks.ramTarget === 2400 && bracket === 1 ? 610 : 590
            }
        };
    }

    return { selectFrequencies };
}));
