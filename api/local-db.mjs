import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const action = process.argv[2];
if (!["init", "list"].includes(action)) {
    console.error("使用 npm run db:init 或 npm run db:list（仅本地数据库）。");
    process.exitCode = 1;
} else {
    const sql = action === "init" ? readFileSync(new URL("schema.sql", import.meta.url), "utf8")
        : "SELECT cpu_speedo,gpu_speedo,soc_speedo,ram_id,model,last_mode,last_goal,submission_count,first_seen_at,last_seen_at FROM device_samples ORDER BY last_seen_at DESC LIMIT 100";
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("node_modules/cf/bin/cf", import.meta.url)),
        "d1", "raw", "00000000-0000-0000-0000-000000000001", "--mode", "development", "--local",
        "--persist-to", ".cloudflare/state", "--sql", sql
    ], { cwd: fileURLToPath(new URL(".", import.meta.url)), stdio: "inherit" });
    if (result.error) console.error("本地数据库命令启动失败。");
    process.exitCode = result.status ?? 1;
}
