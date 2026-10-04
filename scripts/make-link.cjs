/* 开发期：把 dist 目录以 junction 链接到思源工作空间 data/plugins/<插件名>，配合 `pnpm dev` 热更新 */
const fs = require("fs");
const path = require("path");
const {findWorkspace} = require("./lib-ws.cjs");

const PLUGIN_NAME = "siyuan-plugin-batch-manager";
const ws = findWorkspace(process.argv[2]);
if (!ws) {
    console.error("未找到思源工作空间。用法：node scripts/make-link.cjs [工作空间路径]，或设置环境变量 SIYUAN_WORKSPACE");
    process.exit(1);
}
const dist = path.resolve(__dirname, "..", "dist");
if (!fs.existsSync(path.join(dist, "index.js"))) {
    console.error("dist/index.js 不存在，请先执行 pnpm build");
    process.exit(1);
}
const pluginsDir = path.join(ws, "data", "plugins");
fs.mkdirSync(pluginsDir, {recursive: true});
const link = path.join(pluginsDir, PLUGIN_NAME);

if (fs.existsSync(link) || fs.existsSync(link + ".sy")) {
    const st = fs.lstatSync(link);
    if (st.isSymbolicLink()) {
        fs.rmSync(link);
    } else if (st.isDirectory()) {
        // 已存在同名真实目录：可能是 junction（Windows 上 lstat 对 junction 返回目录）——检查是否指向本 dist
        try {
            const target = fs.realpathSync(link);
            if (target === fs.realpathSync(dist)) {
                fs.rmdirSync(link);
            } else {
                console.error(`已存在同名插件目录且不指向本 dist：${link}，请手动处理后重试`);
                process.exit(1);
            }
        } catch {
            console.error(`无法处理已存在的 ${link}，请手动删除后重试`);
            process.exit(1);
        }
    } else {
        fs.rmSync(link);
    }
}

fs.symlinkSync(dist, link, "junction");
console.log(`已链接：${link}  ->  ${dist}`);
console.log("在思源中启用插件即可（若已启用，重载插件或重启思源）。");
