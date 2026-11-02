const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const configurator = require("./configurator.js");

// 仅提供控制器依赖的 DOM 边界，不模拟推荐逻辑或复制成功行为。
function controller({ clipboardFails = false, fallbackCopies = true } = {}) {
    function node() {
        return {
            textContent: "", innerHTML: "", hidden: true, children: [], listeners: {},
            addEventListener(name, fn) { this.listeners[name] = fn; },
            replaceChildren(...children) { this.children = children; },
            insertAdjacentHTML() {}, scrollIntoView() {}, select() {}, remove() {}
        };
    }
    const form = node();
    const values = { cpuSpeedo: "1651", gpuSpeedo: "1677", socSpeedo: "1688", ramId: "WT:F", model: "regular", mode: "handheld", goal: "performance" };
    form.elements = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }]));
    const result = node();
    const error = node();
    const fields = Object.fromEntries([
        ".profile-meta", ".preset-comparison", ".diagnosis", ".clock-strip", ".baseline-note",
        ".config-sections", ".warning-box", ".copy-button", ".save-image-button"
    ].map(key => [key, node()]));
    const root = node();
    root.querySelector = selector => fields[selector];
    result.querySelector = () => result.children.length ? root : null;
    const nodes = {
        "#config-form": form, "#result": result, "#form-error": error,
        "#result-template": { content: { cloneNode: () => root } },
        "#update-notice p": node(), "#fill-example": node()
    };
    const copied = [];
    const body = node();
    body.appendChild = child => body.children.push(child);
    const document = {
        querySelector: selector => nodes[selector], body,
        createElement: () => node(), execCommand: () => fallbackCopies
    };
    const navigator = { clipboard: { writeText: async text => {
        if (clipboardFails) throw new Error("clipboard unavailable");
        copied.push(text);
    } } };
    class FormData {
        entries() { return Object.entries(form.elements).map(([key, field]) => [key, field.value]); }
    }
    vm.runInNewContext(fs.readFileSync(require.resolve("./app.js"), "utf8"), {
        document, navigator, FormData, console,
        window: { MarikoConfigurator: configurator, setTimeout() {} }
    });
    return {
        form, result, error, fields, copied,
        submit() { form.listeners.submit({ preventDefault() {} }); },
        edit(key, value) { form.elements[key].value = value; form.listeners.change(); },
        copy() { return fields[".copy-button"].listeners.click({ currentTarget: fields[".copy-button"] }); }
    };
}

test("无效输入撤下旧配置且恢复有效输入后重新生成", () => {
    const app = controller();
    app.submit();
    assert.equal(app.result.children.length, 1);
    app.edit("ramId", " ");
    assert.equal(app.error.hidden, false);
    assert.equal(app.result.children.length, 0);
    assert.match(app.result.textContent, /无效|重新/);
    app.edit("ramId", "UNKNOWN");
    assert.equal(app.error.hidden, true);
    assert.equal(app.result.children.length, 1);
    assert.match(app.fields[".warning-box"].innerHTML, /未识别 RAM ID/);
});

test("无效输入不再允许旧回调复制上一次配置", async () => {
    const app = controller();
    app.submit();
    app.edit("ramId", " ");
    await app.copy();
    assert.equal(app.copied.length, 0);
});

test("剪贴板和兼容复制都失败时不谎报成功", async () => {
    const app = controller({ clipboardFails: true, fallbackCopies: false });
    app.submit();
    await app.copy();
    assert.match(app.fields[".copy-button"].textContent, /复制失败/);
});

test("成功复制的是当前配置且兼容复制成功可以提示成功", async () => {
    const app = controller();
    app.submit();
    app.edit("ramId", "UNKNOWN");
    await app.copy();
    assert.equal(app.copied.length, 1);
    assert.match(app.copied[0], /RAM UNKNOWN/);
    assert.doesNotMatch(app.copied[0], /2400/);
    assert.equal(app.fields[".copy-button"].textContent, "已复制");
    const fallback = controller({ clipboardFails: true, fallbackCopies: true });
    fallback.submit();
    await fallback.copy();
    assert.equal(fallback.fields[".copy-button"].textContent, "已复制");
});
