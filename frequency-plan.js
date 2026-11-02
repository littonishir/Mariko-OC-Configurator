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
        [1887, 1445416, -31515, 113], [1963.5, 1490873, -32155, 113]
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
        const baseline = { cpu: 1020, gpu: handheld ? 384 : 768, ramStart: 1600, ramTarget: 1600 };
        // 以下预算是本助手的选档策略，不是上游安全电压或新增电压设置。
        const cpuBudget = handheld ? (input.model === "lite" ? 900 : 950) : 1000;
        const gpuBudget = handheld ? 610 : (input.mode === "plugged" ? 700 : 750);
        const gpuCap = handheld ? (input.model === "lite" ? 614.4 : 768)
            : (input.mode === "plugged" ? 998.4 : 1075.2);
        const cpuPoints = CPU.filter(point => estimateCpuMv(point, input.cpuSpeedo) <= cpuBudget);
        const gpuInRange = input.gpuSpeedo >= 1300 && input.gpuSpeedo < 1850;
        const gpuPoints = gpuInRange ? GPU.filter(point => point[0] <= gpuCap
            && estimateGpuMv(point, input.gpuSpeedo) <= gpuBudget) : [];
        const cpuPoint = cpuPoints[cpuPoints.length - 1] || CPU[0];
        const gpuPoint = gpuPoints[gpuPoints.length - 1] || GPU.find(point => point[0] === baseline.gpu);
        const advanced = {
            cpu: cpuPoint[0], gpu: gpuPoint[0], ramStart: 1600,
            ramTarget: ram && ram.ratedClock ? ram.ratedClock : 1600
        };
        const clocks = input.goal === "performance" ? advanced : baseline;
        return {
            clocks,
            cpu: {
                estimatedMv: estimateCpuMv(CPU.find(point => point[0] === clocks.cpu), input.cpuSpeedo),
                budgetMv: cpuBudget,
                route: CPU.filter(point => point[0] <= clocks.cpu).map(point => point[0])
            },
            gpu: {
                estimatedMv: gpuInRange ? estimateGpuMv(GPU.find(point => point[0] === clocks.gpu), input.gpuSpeedo) : null,
                budgetMv: gpuBudget, capMHz: gpuCap, inRange: gpuInRange,
                route: GPU.filter(point => point[0] >= baseline.gpu && point[0] <= clocks.gpu).map(point => point[0])
            },
            ram: {
                route: [1600, 1866, 2133].filter(freq => freq <= clocks.ramTarget),
                ratingMbps: ram ? ram.ratingMbps : null
            }
        };
    }

    return { selectFrequencies };
}));
