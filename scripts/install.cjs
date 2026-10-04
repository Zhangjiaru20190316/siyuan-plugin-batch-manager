/* 一键安装/更新：
 * 1) 构建 dist → 2) 复制到 工作空间/data/plugins/<name>（真实目录，内核运行期可识别）→
 * 3) /api/petal/setPetalEnabled 启用（3.4.x 读 frontend 键；同时带 app 兼容新内核）→ 推送前端热加载
 * 注：新版内核另有 /api/bazaar/installLocalBazaarPackage（zip 上传安装），本脚本用复制+启用方式兼容 3.0~3.4。
 */
const fs = require("fs");
const path = require("path");
const {execSync} = require("child_process");
const {findWorkspace, apiToken, kernelAlive} = require("./lib-ws.cjs");

const PLUGIN_NAME = "siyuan-plugin-batch-manager";

async function post(ws, url, body) {
    const res = await fetch(`http://127.0.0.1:6806${url}`, {
        method: "POST",
        headers: {"Content-Type": "application/json", Authorization: `Token ${apiToken(ws)}`},
        body: JSON.stringify(body),
    });
    return res.json().catch(() => ({code: -1, msg: "bad response"}));
}

async function main() {
    const rebuild = process.argv.includes("--rebuild");
    const root = path.resolve(__dirname, "..");
    const dist = path.join(root, "dist");
    if (rebuild || !fs.existsSync(path.join(dist, "index.js"))) {
        console.log("构建…");
        execSync("pnpm build", {cwd: root, stdio: "inherit"});
    }

    const ws = findWorkspace(process.argv.find((a) => /^--?workspace=|^--ws=/.test(a) && a.split("=")[1]));
    if (!ws) {
        console.error("未找到思源工作空间。用法：node scripts/install.cjs [工作空间路径] 或设置 SIYUAN_WORKSPACE");
        process.exit(1);
    }
    console.log("工作空间:", ws);

    // 复制 dist → data/plugins/<name>（若存在 junction 则替换为真实目录）
    const target = path.join(ws, "data", "plugins", PLUGIN_NAME);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.rmSync(target, {recursive: true, force: true});
    fs.cpSync(dist, target, {recursive: true});
    console.log("已复制 dist →", target);

    if (!(await kernelAlive())) {
        console.error("思源内核未运行，无法热启用。文件已就位，下次启动思源后在 设置→插件 中启用。");
        process.exit(0);
    }

    const force = process.argv.includes("--reload");
    if (force) {
        // 开发更新：先禁用再启用，确保前端收到 reload 事件
        await post(ws, "/api/petal/setPetalEnabled", {packageName: PLUGIN_NAME, enabled: false, frontend: "desktop", app: "desktop"});
        await new Promise((r) => setTimeout(r, 600));
    }
    const r = await post(ws, "/api/petal/setPetalEnabled", {packageName: PLUGIN_NAME, enabled: true, frontend: "desktop", app: "desktop"});
    if (r.code !== 0) {
        console.error("启用失败：", r.msg, "—— 请在 设置 → 插件 中手动启用");
        process.exit(1);
    }
    console.log("已启用（内核已推送热加载）");

    await new Promise((r) => setTimeout(r, 800));
    const lp = await post(ws, "/api/petal/loadPetals", {frontend: "desktop"});
    const me = (lp.data || []).find((p) => p.name === PLUGIN_NAME);
    if (me) {
        console.log(`loadPetals 确认：enabled=${me.enabled} js=${(me.js || "").length}B css=${(me.css || "").length}B i18n=${me.i18n ? Object.keys(me.i18n).length + " keys" : "none"}`);
        if (!(me.js || "").length) console.warn("警告：index.js 为空");
    } else {
        console.log("loadPetals 未列出，请 F5 刷新界面或重启思源后重试");
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
