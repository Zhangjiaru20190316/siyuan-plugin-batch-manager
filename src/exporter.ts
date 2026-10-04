import JSZip from "jszip";
import * as api from "./api";
import type {DocItem, OpResult} from "./types";
import {downloadBlob, sanitizeZipPath, urlBasename} from "./util";

export interface ExportOptions {
    mode: "merged" | "individual";
    includeAssets: boolean;
    concurrency: number;
}

export interface ExportHooks {
    onPhase: (phase: string) => void;
    onProgress: (done: number, total: number) => void;
    cancel: () => boolean;
}

function ts(): string {
    const d = new Date();
    const p = (n: number) => (n < 10 ? "0" + n : "" + n);
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * 批量导出：
 * - merged + assets：单次调用内核 /api/export/exportMds（内核合并打包，含资源），直接下载
 * - merged + !assets：逐篇 exportMdContent，前端 JSZip 合并为纯 md zip
 * - individual + assets：逐篇 exportMd，逐个下载 zip
 * - individual + !assets：逐篇 exportMdContent，单文件 zip 逐个下载
 * 返回逐篇 OpResult（merged+assets 场景为整体成功/失败）。
 */
export async function exportDocs(items: DocItem[], opts: ExportOptions, hooks: ExportHooks): Promise<{ results: OpResult[]; fileCount: number }> {
    const okAll = (): OpResult[] => items.map((i) => ({id: i.id, name: i.name, ok: true}));
    const failAll = (msg: string): OpResult[] => items.map((i) => ({id: i.id, name: i.name, ok: false, msg}));

    // ① 合并 + 含资源：一次内核调用
    if (opts.mode === "merged" && opts.includeAssets) {
        hooks.onPhase("");
        hooks.onProgress(0, 1);
        const r = await api.exportMds(items.map((i) => i.id));
        if (!r.ok || !r.data?.zip) return {results: failAll(r.msg || "exportMds failed"), fileCount: 0};
        const blob = await api.fetchZipBlob(r.data.zip);
        downloadBlob(blob, urlBasename(r.data.zip) || `siyuan-export-${ts()}.zip`);
        hooks.onProgress(1, 1);
        return {results: okAll(), fileCount: 1};
    }

    // ② 其余场景逐篇处理
    const zip = opts.mode === "merged" ? new JSZip() : null;
    let fileCount = 0;

    const results = await api.runBatch(
        items,
        async (d) => {
            if (hooks.cancel()) return {ok: false, msg: "canceled"};
            if (opts.includeAssets) {
                // 每篇一个内核 zip
                const r = await api.exportMd(d.id);
                if (!r.ok || !r.data?.zip) return {ok: false, msg: r.msg || "exportMd failed"};
                const blob = await api.fetchZipBlob(r.data.zip).catch((e: any) => {
                    throw new Error(e?.message || "download zip failed");
                });
                if (zip) {
                    const inner = await JSZip.loadAsync(blob);
                    const folder = sanitizeZipPath(d.hPath || d.name) || sanitizeZipPath(d.id);
                    Object.keys(inner.files).forEach((name) => {
                        zip.file(`${folder}/${name}`, inner.files[name].async("uint8array"));
                    });
                } else {
                    downloadBlob(blob, urlBasename(r.data.zip) || `${d.name}.zip`);
                }
                return {ok: true};
            }
            // 纯 Markdown
            const r = await api.exportMdContent(d.id);
            if (!r.ok || !r.data) return {ok: false, msg: r.msg || "exportMdContent failed"};
            if (zip) {
                const p = sanitizeZipPath(r.data.hPath || d.name) || sanitizeZipPath(d.id);
                zip.file(`${p}.md`, r.data.content);
            } else {
                const one = new JSZip();
                one.file(`${sanitizeZipPath(d.name)}.md`, r.data.content);
                const blob = await one.generateAsync({type: "blob"});
                downloadBlob(blob, `${sanitizeZipPath(d.name)}.zip`);
            }
            return {ok: true};
        },
        {concurrency: opts.concurrency, onProgress: hooks.onProgress, cancel: hooks.cancel},
    );

    if (zip) {
        hooks.onPhase("merging");
        const blob = await zip.generateAsync({type: "blob"});
        downloadBlob(blob, `siyuan-batch-md-${ts()}.zip`);
        fileCount = 1;
    }
    return {results, fileCount};
}
