/* 真实接口验收测试：在临时笔记本中创建测试文档，逐一验证 插件所用内核 API 的行为：
 * 删除→回收站布局（为"彻底删除"定位真实路径）、移动、重命名、导出，最后清理。
 * 只操作 "BM-验收测试" 笔记本，不触碰用户数据。
 */
const fs = require("fs");
const path = require("path");
const {apiToken} = require("./lib-ws.cjs");

const WS = process.argv[2] || process.env.SIYUAN_WORKSPACE;
if (!WS) {
    console.error("用法: node scripts/acceptance.cjs <思源工作空间路径>（或设置环境变量 SIYUAN_WORKSPACE）");
    process.exit(1);
}
const TOKEN = apiToken(WS);
const H = {"Content-Type": "application/json", Authorization: `Token ${TOKEN}`};
const NB_NAME = "BM-验收测试";

async function post(url, body) {
    const res = await fetch(`http://127.0.0.1:6806${url}`, {method: "POST", headers: H, body: JSON.stringify(body)});
    const j = await res.json().catch(() => ({code: -1, msg: "bad response: " + res.status}));
    return j;
}
const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
    if (cond) { pass++; log(`  ✓ ${name} ${extra}`); } else { fail++; log(`  ✗ ${name} ${extra}`); }
}

async function main() {
    log("== 0. 内核版本 ==");
    const ver = await post("/api/system/version", {});
    log("  version:", ver.data);

    log("== 1. 清理旧测试笔记本 ==");
    let nb = await post("/api/notebook/lsNotebooks", {});
    const old = (nb.data.notebooks || []).find((n) => n.name === NB_NAME);
    if (old) {
        await post("/api/notebook/removeNotebook", {notebook: old.id});
        log("  已移除旧测试笔记本", old.id);
    }

    log("== 2. 创建测试笔记本 + 3 篇文档 ==");
    const cn = await post("/api/notebook/createNotebook", {name: NB_NAME});
    check("createNotebook", cn.code === 0, cn.msg);
    nb = await post("/api/notebook/lsNotebooks", {});
    const notebook = (nb.data.notebooks || []).find((n) => n.name === NB_NAME);
    check("lsNotebooks 含新笔记本", !!notebook);
    const nbId = notebook.id;

    const docTitles = ["BM测试文档A", "BM测试文档B", "BM测试文档C"];
    for (const t of docTitles) {
        const r = await post("/api/filetree/createDocWithMd", {notebook: nbId, path: `/${t}`, markdown: `# ${t}\n\n批量管理插件验收测试内容。`});
        check(`createDocWithMd ${t}`, r.code === 0, r.msg);
    }
    const ld = await post("/api/filetree/listDocsByPath", {notebook: nbId, path: "/"});
    check("listDocsByPath 3 篇", (ld.data.files || []).length === 3, JSON.stringify((ld.data.files || []).map((f) => f.name)));
    const docs = ld.data.files;

    log("== 3. SQL stmt 键验证 ==");
    const q = await post("/api/query/sql", {sql: `SELECT id,content FROM blocks WHERE type='d' AND box='${nbId}'`, stmt: `SELECT id,content FROM blocks WHERE type='d' AND box='${nbId}'`});
    check("sql(stmt) 命中 3 篇", q.code === 0 && (q.data || []).length === 3, `rows=${(q.data || []).length}`);

    log("== 4. 删除一篇（removeDocByID → 回收站）并探明回收站布局 ==");
    const victim = docs.find((d) => d.name.startsWith("BM测试文档A"));
    const rm = await post("/api/filetree/removeDocByID", {id: victim.id});
    check("removeDocByID", rm.code === 0, rm.msg);
    const ld2 = await post("/api/filetree/listDocsByPath", {notebook: nbId, path: "/"});
    check("删除后剩 2 篇", (ld2.data.files || []).length === 2);
    // 文件系统层找回收站
    const nbDir = path.join(WS, "data", nbId);
    const trashDir = path.join(nbDir, ".trash");
    log("  回收站目录:", trashDir, "存在:", fs.existsSync(trashDir));
    if (fs.existsSync(trashDir)) {
        const walk = (d, p = "") => fs.readdirSync(d, {withFileTypes: true}).flatMap((e) => {
            const rel = p ? `${p}/${e.name}` : e.name;
            return e.isDirectory() ? walk(path.join(d, e.name), rel) : [rel];
        });
        log("  .trash 内容:", walk(trashDir).join(", "));
    }

    log("== 5. 尝试彻底删除（removeFile on .trash path）==");
    if (fs.existsSync(trashDir)) {
        const entries = fs.readdirSync(trashDir).filter((f) => f.startsWith(victim.id));
        if (entries.length) {
            const rf = await post("/api/file/removeFile", {path: `/data/${nbId}/.trash/${entries[0]}`});
            log("  removeFile:", JSON.stringify(rf));
            log("  文件仍存在?", fs.existsSync(path.join(trashDir, entries[0])));
        } else {
            log("  .trash 中没有以块 id 命名的文件，列出全部:", fs.readdirSync(trashDir).join(", "));
        }
    }

    log("== 6. 移动（moveDocsByID B → C 下）==");
    const docB = docs.find((d) => d.name.startsWith("BM测试文档B"));
    const docC = docs.find((d) => d.name.startsWith("BM测试文档C"));
    const mv = await post("/api/filetree/moveDocsByID", {fromIDs: [docB.id], toID: docC.id});
    check("moveDocsByID", mv.code === 0, mv.msg);
    const ldC = await post("/api/filetree/listDocsByPath", {notebook: nbId, path: docC.path});
    check("C 下有 1 篇子文档", (ldC.data.files || []).length === 1, JSON.stringify((ldC.data.files || []).map((f) => f.name)));

    log("== 7. 重命名（renameDocByID）==");
    const rn = await post("/api/filetree/renameDocByID", {id: docC.id, title: "BM测试文档C-已改名"});
    check("renameDocByID", rn.code === 0, rn.msg);

    log("== 8. 导出（exportMds 多篇合并）==");
    const ex = await post("/api/export/exportMds", {ids: [docB.id, docC.id]});
    check("exportMds", ex.code === 0 && !!(ex.data && ex.data.zip), ex.msg);
    if (ex.data && ex.data.zip) {
        const z = await fetch(`http://127.0.0.1:6806${ex.data.zip}`, {headers: {Authorization: `Token ${TOKEN}`}});
        const buf = Buffer.from(await z.arrayBuffer());
        check("下载合并 zip", z.ok && buf.length > 100 && buf.slice(0, 2).toString() === "PK", `${buf.length} bytes`);
        fs.writeFileSync(path.join(__dirname, "..", "test-export.zip"), buf);
        log("  已保存 test-export.zip 供人工检查");
    }

    log("== 9. 清理：移除测试笔记本 ==");
    const rmnb = await post("/api/notebook/removeNotebook", {notebook: nbId});
    check("removeNotebook", rmnb.code === 0, rmnb.msg);
    // 顺带清理 .trash 残留
    if (fs.existsSync(trashDir)) fs.rmSync(trashDir, {recursive: true, force: true});

    log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
