/* 共享：定位思源工作空间（Windows 优先级：参数 > 环境变量 > 运行中进程 --workspace > 常见默认路径） */
const fs = require("fs");
const path = require("path");
const os = require("os");
const {execSync} = require("child_process");

function findWorkspace(explicit) {
    const candidates = [];
    if (explicit) candidates.push(explicit);
    if (process.env.SIYUAN_WORKSPACE) candidates.push(process.env.SIYUAN_WORKSPACE);

    // 运行中的 SiYuan 进程命令行 --workspace 参数最可靠
    try {
        const out = execSync(
            `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name like 'SiYuan%'\\" | Select-Object -ExpandProperty CommandLine"`,
            {encoding: "utf8", timeout: 15000},
        );
        for (const line of out.split(/\r?\n/)) {
            const m = line.match(/--workspace[= ]+"?([^"\s]+)"?/i);
            if (m) candidates.push(m[1]);
        }
    } catch {
        /* ignore */
    }

    const home = os.homedir();
    candidates.push(path.join(home, "SiYuan"));
    candidates.push(path.join(home, "Documents", "SiYuan"));

    for (const c of candidates) {
        if (!c) continue;
        const p = path.resolve(c);
        if (fs.existsSync(path.join(p, "conf", "conf.json")) && fs.existsSync(path.join(p, "data"))) return p;
    }
    return null;
}

function apiToken(ws) {
    try {
        const conf = JSON.parse(fs.readFileSync(path.join(ws, "conf", "conf.json"), "utf8"));
        return (conf.api && conf.api.token) || "";
    } catch {
        return "";
    }
}

async function kernelPost(ws, url, body) {
    const token = apiToken(ws);
    const res = await fetch(`http://127.0.0.1:6806${url}`, {
        method: "POST",
        headers: {"Content-Type": "application/json", Authorization: `Token ${token}`},
        body: JSON.stringify(body),
    });
    return await res.json();
}

async function kernelAlive() {
    try {
        const res = await fetch("http://127.0.0.1:6806/api/system/version", {method: "POST", body: "{}"});
        return res.ok;
    } catch {
        return false;
    }
}

module.exports = {findWorkspace, apiToken, kernelPost, kernelAlive};
