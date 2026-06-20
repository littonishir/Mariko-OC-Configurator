(function () {
    "use strict";

    const form = document.querySelector("#config-form");
    const resultPanel = document.querySelector("#result");
    const template = document.querySelector("#result-template");
    const errorBox = document.querySelector("#form-error");
    let latestResult = null;

    function escapeHtml(value) {
        return String(value).replace(/[&<>'"]/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            "\"": "&quot;"
        }[character]));
    }

    function readForm() {
        const data = new FormData(form);
        return Object.fromEntries(data.entries());
    }

    function metric(label, value, suffix) {
        return `<div class="clock"><span>${label}</span><strong>${value}</strong><small>${suffix}</small></div>`;
    }

    function row(label, value) {
        return `<div class="config-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
    }

    function section(title, kicker, rows) {
        return `<section class="config-card"><div class="card-title"><span>${kicker}</span><h3>${title}</h3></div>${rows.join("")}</section>`;
    }

    function render(result) {
        resultPanel.replaceChildren(template.content.cloneNode(true));
        const root = resultPanel.querySelector(".result-content");
        const model = result.input.model === "lite" ? "Switch Lite" : "续航版 / OLED";
        const mode = result.input.mode === "handheld" ? "掌机模式" : "插电 / 底座";
        root.querySelector(".profile-meta").innerHTML = `<span>${model}</span><span>${mode}</span><span>${result.risk}</span>`;

        root.querySelector(".diagnosis").innerHTML = [
            ["CPU", result.input.cpuSpeedo, result.diagnosis.cpu],
            ["GPU", result.input.gpuSpeedo, result.diagnosis.gpu],
            ["SoC", result.input.socSpeedo, result.diagnosis.soc],
            ["RAM", result.input.ramId, result.diagnosis.ram]
        ].map(([name, value, grade]) => `
            <div class="diagnosis-item">
                <span>${name}</span><strong>${value}</strong><em class="${grade.tone}">${grade.label}</em>
            </div>`).join("");

        root.querySelector(".clock-strip").innerHTML = [
            metric("CPU", result.clocks.cpu, "MHz"),
            metric("GPU", result.clocks.gpu, "MHz"),
            metric("RAM 目标", result.clocks.ramTarget, "MHz")
        ].join("");

        root.querySelector(".config-sections").innerHTML = [
            section("处理器", "CPU", [
                row("CPU 低压降压 (CPU Low UV)", result.cpu.lowUvStart),
                row("CPU 高压降压 (CPU High UV)", result.cpu.highUvStart),
                row("CPU 降压表 (CPU UV Table)", `${result.cpu.uvTable} MHz 分界频率 (Tbreak)`),
                row("CPU 低压最低电压 (CPU Low VMIN)", result.cpu.lowVmin),
                row("CPU 高压最低电压 (CPU High VMIN)", result.cpu.highVmin),
                row("CPU 最大电压 (CPU Max Voltage)", result.cpu.voltageLimit),
                row("CPU 最大频率 (CPU Max Clock)", `${result.clocks.cpu} MHz`),
                row("CPU 超频频率 (CPU Boost Clock)", `${result.cpu.boostClock} MHz`)
            ]),
            section("图形处理器", "GPU", [
                row("GPU 降压表 (GPU Undervolt Table)", result.gpu.table),
                row("GPU 最低电压 (GPU VMIN)", result.gpu.vmin),
                row("GPU 最大电压 (GPU Maximum Voltage)", result.gpu.vmax),
                row("GPU 电压偏移 (GPU Voltage Offset)", result.gpu.voltageOffset)
            ]),
            section("内存", "RAM", [
                row("DVB 偏移 (DVB Shift)", result.ram.dvbShift),
                row("SoC 最大电压 (SoC Max Volt)", result.ram.socVmax),
                row("高性能模式 (HP Mode)", result.ram.hpMode),
                row("内存 VDD2 电压 (RAM VDD2 Voltage)", result.ram.vdd2),
                row("内存 VDDQ 电压 (RAM VDDQ Voltage)", result.ram.vddq),
                row("步进模式 (Step Mode)", result.ram.stepMode),
                row("内存最大频率 (RAM Max Clock)", result.ram.maxClock),
                row("内存延迟编辑器 (RAM Latency Editor)", result.ram.latencyEditor),
                row("内存时序优化 (RAM Timing Reductions)", result.ram.timingReductions)
            ])
        ].join("");

        const tuningItems = Object.entries(result.tuningNotes).flatMap(([scope, notes]) => {
            return notes.map((note) => `<li><strong>${scope.toUpperCase()}</strong>${escapeHtml(note)}</li>`);
        }).join("");
        root.querySelector(".config-sections").insertAdjacentHTML("afterend", `
            <section class="tuning-box">
                <h3>后续调参说明</h3>
                <p>上方是当前可直接填写值。以下内容只在基础配置稳定后逐项尝试。</p>
                <ul>${tuningItems}</ul>
            </section>`);

        root.querySelector(".warning-box").innerHTML = `
            <h3>验证顺序</h3>
            <ol><li>保持 RAM 1600 MHz，先验证 CPU 降压。</li><li>CPU 稳定后验证 GPU，GPU Voltage Offset 保持 0。</li><li>最后验证 RAM 频率、Common 时序和 DVB 10；不稳定时先恢复默认时序。</li><li>保存 KIP、重启，并监控温度、功耗和实际时钟。</li></ol>
            <h3>风险提示</h3>
            <ul>${result.warnings.map((warning) => `<li>${warning}</li>`).join("")}</ul>`;

        root.querySelector(".copy-button").addEventListener("click", copyResult);
        root.querySelector(".save-image-button").addEventListener("click", saveLongImage);
    }

    async function copyResult(event) {
        const button = event.currentTarget;
        const text = window.MarikoConfigurator.toText(latestResult);
        try {
            await navigator.clipboard.writeText(text);
            button.textContent = "已复制";
        } catch (_) {
            const area = document.createElement("textarea");
            area.value = text;
            document.body.appendChild(area);
            area.select();
            document.execCommand("copy");
            area.remove();
            button.textContent = "已复制";
        }
        window.setTimeout(() => { button.textContent = "复制结果"; }, 1600);
    }

    async function saveLongImage(event) {
        const button = event.currentTarget;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "正在生成...";

        try {
            const canvas = renderLongImage(latestResult);

            const png = await new Promise((resolve, reject) => {
                canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG 生成失败")), "image/png");
            });
            const downloadUrl = URL.createObjectURL(png);
            const link = document.createElement("a");
            const model = latestResult.input.model === "lite" ? "Lite" : "OLED";
            const ramId = latestResult.input.ramId.replace(/[^a-z0-9]+/gi, "-");
            const fileName = `Mariko-OC-${model}-${latestResult.input.cpuSpeedo}-${latestResult.input.gpuSpeedo}-${latestResult.input.socSpeedo}-${ramId}.png`;
            link.href = downloadUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.__marikoLastExport = {
                fileName,
                mimeType: png.type,
                bytes: png.size,
                width: canvas.width,
                height: canvas.height
            };
            button.dataset.exportFile = fileName;
            button.dataset.exportBytes = String(png.size);
            button.dataset.exportWidth = String(canvas.width);
            button.dataset.exportHeight = String(canvas.height);
            window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
            button.textContent = "已保存";
        } catch (error) {
            console.error(error);
            button.textContent = "生成失败";
        } finally {
            window.setTimeout(() => {
                button.disabled = false;
                button.textContent = originalText;
            }, 1800);
        }
    }

    function renderLongImage(result) {
        const width = 1400;
        const workingHeight = 9000;
        const margin = 76;
        const contentWidth = width - margin * 2;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = workingHeight;
        const context = canvas.getContext("2d");
        const colors = {
            background: "#0a0d0f",
            panel: "#111619",
            panelDark: "#0c1012",
            line: "#273035",
            text: "#f2f4ed",
            muted: "#8d9898",
            acid: "#c8f15b",
            orange: "#ff9e64"
        };
        let y = 72;

        context.fillStyle = colors.background;
        context.fillRect(0, 0, width, workingHeight);
        context.strokeStyle = "rgba(255,255,255,.025)";
        context.lineWidth = 1;
        for (let x = 0; x <= width; x += 40) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, workingHeight);
            context.stroke();
        }
        for (let lineY = 0; lineY <= workingHeight; lineY += 40) {
            context.beginPath();
            context.moveTo(0, lineY);
            context.lineTo(width, lineY);
            context.stroke();
        }

        context.fillStyle = colors.acid;
        context.font = canvasFont(800, 18);
        context.fillText("HORIZON-OC · MARIKO 调校报告", margin, y);
        y += 64;
        context.fillStyle = colors.text;
        context.font = canvasFont(800, 66);
        context.fillText("星野無上 HOC 配置助手", margin, y);
        y += 50;
        context.fillStyle = colors.muted;
        context.font = canvasFont(400, 23);
        context.fillText("基于 Speedo 与 RAM 颗粒生成的安全起点，请逐项验证稳定性。", margin, y);
        y += 52;

        const model = result.input.model === "lite" ? "Switch Lite" : "OLED / 续航版";
        const mode = result.input.mode === "handheld" ? "掌机模式" : "插电 / 底座";
        y = drawSummaryCard(context, {
            x: margin,
            y,
            width: contentWidth,
            colors,
            values: [
                ["CPU Speedo", result.input.cpuSpeedo, result.diagnosis.cpu.label],
                ["GPU Speedo", result.input.gpuSpeedo, result.diagnosis.gpu.label],
                ["SoC Speedo", result.input.socSpeedo, result.diagnosis.soc.label],
                ["RAM Module", result.input.ramId, result.diagnosis.ram.label]
            ],
            profile: `${model}  ·  ${mode}  ·  ${result.risk}`
        }) + 24;

        y = drawClockCard(context, margin, y, contentWidth, colors, [
            ["CPU 频率上限", result.clocks.cpu, "MHz"],
            ["GPU 频率上限", result.clocks.gpu, "MHz"],
            ["RAM 目标频率", result.clocks.ramTarget, "MHz"]
        ]) + 24;

        y = drawConfigCard(context, margin, y, contentWidth, colors, "CPU", "处理器配置", [
            ["CPU 低压降压 (CPU Low UV)", result.cpu.lowUvStart],
            ["CPU 高压降压 (CPU High UV)", result.cpu.highUvStart],
            ["CPU 降压表 (CPU UV Table)", `${result.cpu.uvTable} MHz 分界频率 (Tbreak)`],
            ["CPU 低压最低电压 (CPU Low VMIN)", result.cpu.lowVmin],
            ["CPU 高压最低电压 (CPU High VMIN)", result.cpu.highVmin],
            ["CPU 最大电压 (CPU Max Voltage)", result.cpu.voltageLimit],
            ["CPU 最大频率 (CPU Max Clock)", `${result.clocks.cpu} MHz`],
            ["CPU 超频频率 (CPU Boost Clock)", `${result.cpu.boostClock} MHz`]
        ]) + 18;

        y = drawConfigCard(context, margin, y, contentWidth, colors, "GPU", "图形处理器配置", [
            ["GPU 降压表 (GPU Undervolt Table)", result.gpu.table],
            ["GPU 最低电压 (GPU VMIN)", result.gpu.vmin],
            ["GPU 最大电压 (GPU Maximum Voltage)", result.gpu.vmax],
            ["GPU 电压偏移 (GPU Voltage Offset)", result.gpu.voltageOffset]
        ]) + 18;

        y = drawConfigCard(context, margin, y, contentWidth, colors, "RAM", "内存配置", [
            ["DVB 偏移 (DVB Shift)", result.ram.dvbShift],
            ["SoC 最大电压 (SoC Max Volt)", result.ram.socVmax],
            ["高性能模式 (HP Mode)", result.ram.hpMode],
            ["内存 VDD2 电压 (RAM VDD2 Voltage)", result.ram.vdd2],
            ["内存 VDDQ 电压 (RAM VDDQ Voltage)", result.ram.vddq],
            ["步进模式 (Step Mode)", result.ram.stepMode],
            ["内存最大频率 (RAM Max Clock)", result.ram.maxClock],
            ["内存延迟编辑器 (RAM Latency Editor)", result.ram.latencyEditor],
            ["内存时序优化 (RAM Timing Reductions)", result.ram.timingReductions]
        ]) + 18;

        const tuningNotes = Object.entries(result.tuningNotes).flatMap(([scope, notes]) => {
            return notes.map((note) => `[${scope.toUpperCase()}] ${note}`);
        });
        y = drawListCard(context, margin, y, contentWidth, colors, "后续调参说明", tuningNotes) + 18;

        y = drawListCard(context, margin, y, contentWidth, colors, "验证顺序", [
            "保持 RAM 1600 MHz，先验证 CPU 降压设置。",
            "CPU 稳定后验证 GPU，GPU Voltage Offset 保持 0。",
            "最后验证 RAM 频率、Common 时序和 DVB 10；不稳定时先恢复默认时序。",
            "保存 KIP、重启，并监控温度、功耗和实际时钟。"
        ]) + 18;
        y = drawListCard(context, margin, y, contentWidth, colors, "风险提示", result.warnings) + 42;

        context.fillStyle = colors.muted;
        context.font = canvasFont(400, 18);
        context.fillText("Mariko OC Guide 数据整理 · 配置仅用于辅助判断，不构成稳定性保证", margin, y);
        y += 36;
        context.fillStyle = colors.acid;
        context.font = canvasFont(750, 18);
        context.fillText("交流社群", margin, y);
        context.fillStyle = colors.muted;
        context.font = canvasFont(600, 18);
        context.fillText("阿抖群：912250885031    阿Q群：281559687", margin + 96, y);
        y += 70;

        const output = document.createElement("canvas");
        output.width = width;
        output.height = Math.ceil(y);
        output.getContext("2d").drawImage(canvas, 0, 0, width, output.height, 0, 0, width, output.height);
        return output;
    }

    function drawSummaryCard(context, options) {
        const { x, y, width, colors, values, profile } = options;
        const height = 228;
        drawRoundedRect(context, x, y, width, height, 24, colors.panel, colors.line);
        context.fillStyle = colors.muted;
        context.font = canvasFont(600, 20);
        context.fillText(profile, x + 28, y + 40);
        const itemWidth = (width - 56) / values.length;
        values.forEach(([label, value, grade], index) => {
            const itemX = x + 28 + itemWidth * index;
            context.fillStyle = colors.muted;
            context.font = canvasFont(650, 17);
            context.fillText(label, itemX, y + 92);
            context.fillStyle = colors.text;
            context.font = canvasFont(800, 34);
            context.fillText(String(value), itemX, y + 140);
            context.fillStyle = colors.acid;
            context.font = canvasFont(750, 16);
            context.fillText(grade, itemX, y + 178);
        });
        return y + height;
    }

    function drawClockCard(context, x, y, width, colors, values) {
        const height = 156;
        drawRoundedRect(context, x, y, width, height, 22, "#19220f", "#405020");
        const itemWidth = width / values.length;
        values.forEach(([label, value, unit], index) => {
            const itemX = x + itemWidth * index + 28;
            context.fillStyle = "#a8b58a";
            context.font = canvasFont(650, 17);
            context.fillText(label, itemX, y + 42);
            context.fillStyle = colors.acid;
            context.font = canvasFont(850, 48);
            context.fillText(String(value), itemX, y + 105);
            const valueWidth = context.measureText(String(value)).width;
            context.fillStyle = "#77805f";
            context.font = canvasFont(650, 16);
            context.fillText(unit, itemX + valueWidth + 10, y + 104);
            if (index > 0) {
                context.strokeStyle = "#405020";
                context.beginPath();
                context.moveTo(x + itemWidth * index, y + 24);
                context.lineTo(x + itemWidth * index, y + height - 24);
                context.stroke();
            }
        });
        return y + height;
    }

    function drawConfigCard(context, x, y, width, colors, kicker, title, rows) {
        const labelWidth = 500;
        const valueWidth = width - labelWidth - 88;
        const rowLayouts = rows.map(([label, value]) => {
            context.font = canvasFont(600, 20);
            const labelLines = wrapCanvasText(context, label, labelWidth - 30);
            context.font = canvasFont(700, 21);
            const valueLines = wrapCanvasText(context, value, valueWidth);
            return { labelLines, valueLines, height: Math.max(labelLines.length, valueLines.length) * 32 + 28 };
        });
        const height = 76 + rowLayouts.reduce((sum, row) => sum + row.height, 0);
        drawRoundedRect(context, x, y, width, height, 22, colors.panelDark, colors.line);
        context.fillStyle = colors.acid;
        context.font = canvasFont(850, 17);
        context.fillText(kicker, x + 28, y + 45);
        context.fillStyle = colors.text;
        context.font = canvasFont(750, 23);
        context.fillText(title, x + 92, y + 46);
        context.strokeStyle = colors.line;
        context.beginPath();
        context.moveTo(x, y + 76);
        context.lineTo(x + width, y + 76);
        context.stroke();

        let rowY = y + 76;
        rowLayouts.forEach((layout, index) => {
            context.fillStyle = colors.muted;
            context.font = canvasFont(600, 20);
            drawCanvasLines(context, layout.labelLines, x + 28, rowY + 32, 32);
            context.fillStyle = colors.text;
            context.font = canvasFont(700, 21);
            drawCanvasLines(context, layout.valueLines, x + labelWidth + 28, rowY + 32, 32);
            rowY += layout.height;
            if (index < rowLayouts.length - 1) {
                context.strokeStyle = colors.line;
                context.beginPath();
                context.moveTo(x + 20, rowY);
                context.lineTo(x + width - 20, rowY);
                context.stroke();
            }
        });
        return y + height;
    }

    function drawListCard(context, x, y, width, colors, title, items) {
        context.font = canvasFont(500, 20);
        const lines = items.map((item) => wrapCanvasText(context, item, width - 110));
        const height = 78 + lines.reduce((sum, itemLines) => sum + itemLines.length * 31 + 16, 0) + 18;
        drawRoundedRect(context, x, y, width, height, 22, "#161411", "#4e3929");
        context.fillStyle = colors.orange;
        context.font = canvasFont(800, 23);
        context.fillText(title, x + 28, y + 46);
        let itemY = y + 88;
        lines.forEach((itemLines, index) => {
            context.fillStyle = colors.orange;
            context.font = canvasFont(800, 18);
            context.fillText(String(index + 1).padStart(2, "0"), x + 30, itemY);
            context.fillStyle = "#c3c8c6";
            context.font = canvasFont(500, 20);
            drawCanvasLines(context, itemLines, x + 82, itemY, 31);
            itemY += itemLines.length * 31 + 16;
        });
        return y + height;
    }

    function wrapCanvasText(context, value, maxWidth) {
        const lines = [];
        let current = "";
        Array.from(String(value)).forEach((character) => {
            const candidate = current + character;
            if (current && context.measureText(candidate).width > maxWidth) {
                lines.push(current);
                current = character;
            } else {
                current = candidate;
            }
        });
        if (current) lines.push(current);
        return lines.length ? lines : [""];
    }

    function drawCanvasLines(context, lines, x, y, lineHeight) {
        lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
    }

    function drawRoundedRect(context, x, y, width, height, radius, fill, stroke) {
        const right = x + width;
        const bottom = y + height;
        context.beginPath();
        context.moveTo(x + radius, y);
        context.lineTo(right - radius, y);
        context.quadraticCurveTo(right, y, right, y + radius);
        context.lineTo(right, bottom - radius);
        context.quadraticCurveTo(right, bottom, right - radius, bottom);
        context.lineTo(x + radius, bottom);
        context.quadraticCurveTo(x, bottom, x, bottom - radius);
        context.lineTo(x, y + radius);
        context.quadraticCurveTo(x, y, x + radius, y);
        context.closePath();
        context.fillStyle = fill;
        context.fill();
        context.strokeStyle = stroke;
        context.lineWidth = 2;
        context.stroke();
    }

    function canvasFont(weight, size) {
        return `${weight} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    }

    function generateResult(scrollToResult) {
        const result = window.MarikoConfigurator.recommend(readForm());
        if (!result.ok) {
            errorBox.textContent = result.errors.join("；");
            errorBox.hidden = false;
            return false;
        }
        errorBox.hidden = true;
        latestResult = result;
        render(result);
        if (scrollToResult) {
            resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return true;
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        generateResult(true);
    });

    form.addEventListener("change", () => {
        if (latestResult) generateResult(false);
    });

    document.querySelector("#fill-example").addEventListener("click", () => {
        form.elements.cpuSpeedo.value = "1662";
        form.elements.gpuSpeedo.value = "1694";
        form.elements.socSpeedo.value = "1728";
        form.elements.ramId.value = "WT:F";
        form.elements.model.value = "regular";
    });
}());
