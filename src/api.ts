import {fetchSyncPost} from "siyuan";
import type {DocFilters, DocItem, DocRow, NotebookItem, OpResult} from "./types";
import {sanitizeSeg} from "./util";

/** 内核统一响应包装：所有调用都不会 throw，失败以 {ok:false,msg} 返回，便于批量流程继续 */
export interface Res<T> {
    ok: boolean;
    code: number;
    msg: string;
    data: T | null;
}

export async function post<T = any>(url: string, body: any): Promise<Res<T>> {
    try {
        const r = await fetchSyncPost(url, body);
        if (r && typeof r === "object" && "code" in r) {
            if (r.code === 0) return {ok: true, code: 0, msg: r.msg || "", data: (r.data ?? null) as T};
            return {ok: false, code: r.code, msg: r.msg || `code ${r.code}`, data: null};
        }
        return {ok: false, code: -1, msg: "invalid kernel response", data: null};
    } catch (e: any) {
        return {ok: false, code: -1, msg: e?.message || String(e), data: null};
    }
}

/* ============================ 笔记本 ============================ */

export async function listNotebooks(): Promise<Res<NotebookItem[]>> {
    const r = await post<{ notebooks: NotebookItem[] }>("/api/notebook/lsNotebooks", {});
    if (!r.ok) return {ok: false, code: r.code, msg: r.msg, data: null};
    const nbs = (r.data?.notebooks || []).filter((n) => !n.closed);
    return {ok: true, code: 0, msg: "", data: nbs};
}

/* ============================ 文档列表（树形懒加载） ============================ */

export async function listDocs(notebook: string, path: string): Promise<Res<any[]>> {
    const r = await post<{ files: any[] }>("/api/filetree/listDocsByPath", {notebook, path});
    if (!r.ok) return {ok: false, code: r.code, msg: r.msg, data: null};
    return {ok: true, code: 0, msg: "", data: r.data?.files || []};
}

/** listDocsByPath 的 files → DocRow[]（懒加载树） */
export function toRows(files: any[], depth: number, notebook: string, parentTrail: string): DocRow[] {
    return (files || []).map((f) => {
        const name = String(f.name || "").replace(/\.sy$/, "");
        const sub = typeof f.subFileCount === "number" ? f.subFileCount : 0;
        return {
            id: f.id,
            name,
            notebook,
            path: f.path,
            subFileCount: sub,
            ctime: f.ctime,
            mtime: f.mtime,
            depth,
            expandable: sub > 0,
            expanded: false,
            childrenLoaded: false,
            trail: parentTrail ? `${parentTrail} / ${name}` : name,
        } as DocRow;
    });
}

/* ============================ SQL 筛选（分页） ============================ */

/**
 * 思源 3.x 内核 SQL 接口请求键为 stmt（旧版为 sql），这里两个键都传以兼容。
 * 文档块 type='d'：content 为标题，created/updated 为 YYYYMMDDHHmmss 字符串，
 * 按字典序比较即可做时间区间过滤。
 */
function escSql(s: string): string {
    return (s || "").replace(/'/g, "''");
}

function buildWhere(f: DocFilters): string {
    const w = [`type='d'`];
    if (f.notebook) w.push(`box='${escSql(f.notebook)}'`);
    if (f.from) w.push(`updated>='${f.from.replace(/-/g, "")}000000'`);
    if (f.to) w.push(`updated<='${f.to.replace(/-/g, "")}235959'`);
    if (f.kw) w.push(`content LIKE '%${escSql(f.kw)}%'`);
    return w.join(" AND ");
}

export async function queryDocs(f: DocFilters, opt: { limit: number; offset: number }): Promise<Res<any[]>> {
    const sql = `SELECT id, box, path, hpath, content, created, updated FROM blocks WHERE ${buildWhere(f)} ORDER BY updated DESC LIMIT ${opt.limit} OFFSET ${opt.offset}`;
    return post<any[]>("/api/query/sql", {sql, stmt: sql});
}

export async function countDocs(f: DocFilters): Promise<Res<number>> {
    const sql = `SELECT COUNT(*) AS total FROM blocks WHERE ${buildWhere(f)}`;
    const r = await post<any[]>("/api/query/sql", {sql, stmt: sql});
    if (!r.ok) return {ok: false, code: r.code, msg: r.msg, data: null};
    const n = Array.isArray(r.data) && r.data.length ? Number(r.data[0].total || 0) : 0;
    return {ok: true, code: 0, msg: "", data: n};
}

/** SQL 行 → DocRow（筛选结果不可展开，路径列显示 hpath） */
export function queryToRows(rows: any[]): DocRow[] {
    return (rows || []).map((r) => ({
        id: r.id,
        name: r.content || "(untitled)",
        notebook: r.box,
        path: r.path,
        subFileCount: undefined,
        created: r.created,
        updated: r.updated,
        hPath: r.hpath,
        depth: 0,
        expandable: false,
        expanded: false,
        childrenLoaded: true,
        trail: r.hpath || r.path,
    }));
}

/* ============================ 删除 ============================ */

/** 删除文档（进回收站，可在 文档树→更多→回收站 恢复）。优先新接口 removeDocByID，失败回退 removeDoc。 */
export async function removeDoc(d: DocItem): Promise<Res<null>> {
    if (d.id) {
        const r = await post<null>("/api/filetree/removeDocByID", {id: d.id});
        if (r.ok) return r;
    }
    return post<null>("/api/filetree/removeDoc", {notebook: d.notebook, path: d.path});
}

/**
 * 彻底删除（实验性）：3.x 内核没有 .trash 目录，removeDoc 后文档进入
 * 工作空间 /history/<时间戳>-delete/<笔记本>/<docId>.sy（即"回收站/数据历史"）；
 * 若被删文档带子文档，还会有同名目录 /history/<dir>/<笔记本>/<docId>/。
 * 此处定位后调用 /api/file/removeFile 物理删除（该接口可删非空目录）。
 * 历史文件写入与 removeDoc 返回存在延迟，故带重试；失败仅报告"已入回收站但未彻底删除"。
 */
export async function purgeDocFromTrash(d: DocItem): Promise<Res<null>> {
    if (!d.notebook || !d.id) return {ok: false, code: -1, msg: "missing notebook/id", data: null};

    const listDeleteDirs = async (): Promise<string[]> => {
        const rh = await post<any[]>("/api/file/readDir", {path: "/history"});
        if (!rh.ok || !Array.isArray(rh.data)) return [];
        return rh.data
            .map((e) => String(e.name || ""))
            .filter((n) => n.endsWith("-delete"))
            .sort((a, b) => b.localeCompare(a))
            .slice(0, 5);
    };

    /** 平铺查找：<nb>/<id>.sy 与 <nb>/<id>/ 目录 */
    const findFlat = async (): Promise<string[]> => {
        const hits: string[] = [];
        for (const dn of await listDeleteDirs()) {
            const base = `/history/${dn}/${d.notebook}`;
            const rd = await post<any[]>("/api/file/readDir", {path: base});
            if (!rd.ok || !Array.isArray(rd.data)) continue;
            for (const e of rd.data) {
                const name = String(e.name || "");
                if (name === `${d.id}.sy` || name === d.id) hits.push(`${base}/${name}`);
            }
            if (hits.length) break;
        }
        return hits;
    };

    /** 兜底：嵌套布局时的受限递归查找 */
    const findDeep = async (): Promise<string | null> => {
        const want = (n: string) => n === `${d.id}.sy` || n === d.id;
        const walk = async (dir: string, depth: number): Promise<string | null> => {
            if (depth > 8) return null;
            const rd = await post<any[]>("/api/file/readDir", {path: dir});
            if (!rd.ok || !Array.isArray(rd.data)) return null;
            for (const e of rd.data) if (want(String(e.name || ""))) return `${dir}/${e.name}`;
            for (const e of rd.data.slice(0, 60)) {
                if (e.isDir && !e.isSymlink) {
                    const hit = await walk(`${dir}/${e.name}`, depth + 1);
                    if (hit) return hit;
                }
            }
            return null;
        };
        for (const dn of await listDeleteDirs()) {
            const hit = await walk(`/history/${dn}/${d.notebook}`, 0);
            if (hit) return hit;
        }
        return null;
    };

    let hits = await findFlat();
    for (let i = 0; i < 4 && !hits.length; i++) {
        await new Promise((r) => setTimeout(r, 750));
        hits = await findFlat();
    }
    if (!hits.length) {
        const deep = await findDeep();
        if (deep) hits = [deep];
    }
    if (!hits.length) return {ok: false, code: -1, msg: "trash entry not found", data: null};

    let last: Res<null> = {ok: true, code: 0, msg: "", data: null};
    for (const p of hits) {
        last = await post<null>("/api/file/removeFile", {path: p});
    }
    return last;
}

/* ============================ 移动 / 转移 ============================ */

/** 按块 ID 批量移动；toID 可为文档 ID 或笔记本 ID（移至笔记本根） */
export async function moveDocsByID(fromIDs: string[], toID: string): Promise<Res<null>> {
    return post<null>("/api/filetree/moveDocsByID", {fromIDs, toID});
}

/** 转移对话框用：按标题关键字搜目标文档（跨笔记本，含 box/path/hpath 供校验与显示） */
export interface TargetDoc {
    id: string;
    name: string;
    box: string;
    path: string;
    hpath: string;
}

export async function searchTargetDocs(kw: string, limit = 50): Promise<Res<TargetDoc[]>> {
    const like = escSql(kw);
    const sql = `SELECT id, box, path, hpath, content FROM blocks WHERE type='d' AND content LIKE '%${like}%' ORDER BY updated DESC LIMIT ${limit}`;
    const r = await post<any[]>("/api/query/sql", {sql, stmt: sql});
    if (!r.ok) return {ok: false, code: r.code, msg: r.msg, data: null};
    const rows = (r.data || []).map((x) => ({
        id: x.id,
        name: x.content || "(untitled)",
        box: x.box,
        path: x.path,
        hpath: x.hpath || x.path,
    }));
    return {ok: true, code: 0, msg: "", data: rows};
}

/* ============================ 重命名 ============================ */

export async function renameDocByID(id: string, title: string): Promise<Res<null>> {
    return post<null>("/api/filetree/renameDocByID", {id, title});
}

/* ============================ 导出 ============================ */

/** 单篇导出为 zip（含资源）；data.zip 为可下载的 URL 路径（如 /export/xxx.md.zip） */
export async function exportMd(id: string): Promise<Res<{ name: string; zip: string }>> {
    return post<{ name: string; zip: string }>("/api/export/exportMd", {id});
}

/** 多篇合并导出为一个 zip（内核侧合并，含资源） */
export async function exportMds(ids: string[]): Promise<Res<{ name: string; zip: string }>> {
    return post<{ name: string; zip: string }>("/api/export/exportMds", {ids});
}

/** 取单篇 Markdown 纯文本（不含资源文件） */
export async function exportMdContent(id: string): Promise<Res<{ hPath: string; content: string }>> {
    return post<{ hPath: string; content: string }>("/api/export/exportMdContent", {id});
}

/** 下载内核生成的导出 zip */
export async function fetchZipBlob(zipUrl: string): Promise<Blob> {
    const url = /^https?:/.test(zipUrl) ? zipUrl : window.location.origin + zipUrl;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    return await res.blob();
}

/* ============================ 批量执行器（小并发 ≤3，可取消） ============================ */

export async function runBatch<T extends DocItem>(
    items: T[],
    worker: (item: T) => Promise<{ ok: boolean; msg?: string }>,
    opts: { concurrency?: number; onProgress?: (done: number, total: number) => void; cancel?: () => boolean },
): Promise<OpResult[]> {
    const results: OpResult[] = [];
    const total = items.length;
    let done = 0;
    let idx = 0;
    const n = Math.max(1, Math.min(3, Math.floor(opts.concurrency || 1)));
    const cancelled = () => opts.cancel?.() === true;

    const runner = async () => {
        for (; ;) {
            if (cancelled()) return;
            const i = idx++;
            if (i >= total) return;
            const it = items[i];
            let r: { ok: boolean; msg?: string };
            try {
                r = await worker(it);
            } catch (e: any) {
                r = {ok: false, msg: e?.message || String(e)};
            }
            results.push({id: it.id, name: it.name, ...r});
            done++;
            opts.onProgress?.(done, total);
        }
    };
    await Promise.all(Array.from({length: n}, runner));
    return results;
}

/* ============================ 其他 ============================ */

export function notebookNameOf(map: Map<string, string>, id: string): string {
    return map.get(id) || sanitizeSeg(id);
}
