// 正式 Cloudflare 接口地址；这里没有密钥。本地预览使用独立本地库。
(function (window) {
    const productionEndpoint = "https://hoshino-hoc.pages.dev/api/device-samples";
    const local = ["127.0.0.1", "localhost"].includes(window.location.hostname);
    window.MarikoSampleConfig = {
        endpoint: local ? "http://127.0.0.1:8787/api/device-samples" : productionEndpoint,
        appVersion: "20261103-hoc26-release2"
    };
}(window));
