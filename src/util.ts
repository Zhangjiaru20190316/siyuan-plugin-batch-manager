/** 极简模板格式化：fmt("已选 {n} 篇", {n: 3}) */
export function fmt(tpl: string, vars: Record<string, unknown>): string {
    if (!tpl) return "";
    return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** unix 秒 → "YYYY-MM-DD HH:mm" */
export function fmtUnix(sec?: number): string {
    if (!sec) return "—";
    const d = new Date(sec * 1000);
    const p = (n: number) => (n < 10 ? "0" + n : "" + n);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 思源块时间 "YYYYMMDDHHmmss" → "YYYY-MM-DD HH:mm" */
export function fmtSiYuanTime(s?: string): string {
    if (!s || s.length < 12) return "—";
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
}

/** 取两种时间来源中可用的一种 */
export function fmtDocTime(row: { ctime?: number; mtime?: number; created?: string; updated?: string }, kind: "c" | "m"): string {
    if (kind === "c") return row.ctime ? fmtUnix(row.ctime) : fmtSiYuanTime(row.created);
    return row.mtime ? fmtUnix(row.mtime) : fmtSiYuanTime(row.updated);
}

/** 文件名段净化：去掉文件系统非法字符 */
export function sanitizeSeg(name: string): string {
    const s = (name || "").replace(/[\\/:*?"<>|#%&{}$!'@+`=?~^]/g, "_").trim();
    return s || "untitled";
}

/** hPath（/父/子/文档）→ zip 内安全相对路径 */
export function sanitizeZipPath(hPath: string): string {
    return (hPath || "").split("/").filter(Boolean).map(sanitizeSeg).join("/");
}

/** HTML 转义 */
export function esc(s: string): string {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** 触发浏览器下载（Electron 中即保存到下载目录） */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 从 URL 解码文件名：/export/%E7%AC%AC....md.zip → 第一章....md.zip */
export function urlBasename(u: string): string {
    try {
        const raw = (u || "").split("/").pop() || "";
        return decodeURIComponent(raw);
    } catch {
        return (u || "").split("/").pop() || "export.zip";
    }
}
