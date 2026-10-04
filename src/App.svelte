<script lang="ts">
    import {onMount} from "svelte";
    import {showMessage} from "siyuan";
    import * as api from "./api";
    import type {BatchSettings, DocFilters, DocItem, DocRow, NotebookItem, OpResult} from "./types";
    import {esc, fmt, fmtDocTime} from "./util";
    import {confirmDialog, mountSvelte, showReport} from "./ui";
    import {exportDocs} from "./exporter";
    import ExportDialog from "./components/ExportDialog.svelte";
    import TransferDialog from "./components/TransferDialog.svelte";
    import RenameDialog from "./components/RenameDialog.svelte";
    import Icon from "./components/Icon.svelte";

    export let plugin: any;
    export let i18n: any;

    /* ---------- 笔记本 ---------- */
    let notebooks: NotebookItem[] = [];
    let nbNames = new Map<string, string>();
    let activeNotebook = "";

    /* ---------- 表格状态 ---------- */
    let mode: "tree" | "query" = "tree";
    let rows: DocRow[] = [];
    let loading = false;
    let errMsg = "";

    /* ---------- 筛选 ---------- */
    let fNotebook = "";
    let fKw = "";
    let fFrom = "";
    let fTo = "";
    const pageSize = 50;
    let page = 1;
    let total = 0;
    let totalPages = 1;

    /* ---------- 选择 ---------- */
    let selectedDocs = new Map<string, DocItem>();
    $: selCount = selectedDocs.size;
    $: allVisibleChecked = rows.length > 0 && rows.every((r) => selectedDocs.has(r.id));

    /* ---------- 进度 ---------- */
    let prog = {show: false, op: "", done: 0, total: 0, indet: false};
    $: progPct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
    let cancelFlag = false;

    onMount(async () => {
        await loadNotebooks();
    });

    /* ==================== 加载 ==================== */

    async function loadNotebooks() {
        loading = true;
        errMsg = "";
        const r = await api.listNotebooks();
        if (!r.ok) {
            errMsg = r.msg || i18n.msg.loadError;
        } else {
            notebooks = r.data || [];
            notebooks.forEach((n) => nbNames.set(n.id, n.name));
            if (notebooks.length && !activeNotebook) {
                activeNotebook = notebooks[0].id;
                await loadTreeRoot();
            }
        }
        loading = false;
    }

    async function openNotebook(id: string) {
        if (activeNotebook === id && mode === "tree" && rows.length) return;
        activeNotebook = id;
        mode = "tree";
        await loadTreeRoot();
    }

    async function loadTreeRoot() {
        loading = true;
        errMsg = "";
        const r = await api.listDocs(activeNotebook, "/");
        if (!r.ok) {
            errMsg = r.msg || i18n.msg.loadError;
            rows = [];
        } else {
            const nbName = nbNames.get(activeNotebook) || activeNotebook;
            rows = api.toRows(r.data, 0, activeNotebook, nbName);
        }
        loading = false;
    }

    async function toggleRow(row: DocRow) {
        if (!row.expandable) return;
        if (row.expanded) {
            const i = rows.findIndex((x) => x.id === row.id);
            let j = i + 1;
            while (j < rows.length && rows[j].depth > row.depth) j++;
            rows.splice(i + 1, j - i - 1);
            row.expanded = false;
            rows = rows;
            return;
        }
        if (!row.childrenLoaded) {
            loading = true;
            const r = await api.listDocs(row.notebook, row.path);
            loading = false;
            if (!r.ok) {
                showMessage(r.msg || i18n.msg.loadError);
                return;
            }
            const kids = api.toRows(r.data, row.depth + 1, row.notebook, row.trail);
            const i = rows.findIndex((x) => x.id === row.id);
            rows.splice(i + 1, 0, ...kids);
            row.childrenLoaded = true;
        }
        row.expanded = true;
        rows = rows;
    }

    /* ==================== 筛选查询 ==================== */

    function curFilters(): DocFilters {
        return {notebook: fNotebook, kw: fKw.trim(), from: fFrom, to: fTo};
    }

    async function runQuery(reset = true) {
        mode = "query";
        if (reset) page = 1;
        loading = true;
        errMsg = "";
        const f = curFilters();
        const [cr, qr] = await Promise.all([api.countDocs(f), api.queryDocs(f, {limit: pageSize, offset: (page - 1) * pageSize})]);
        if (!cr.ok) {
            errMsg = cr.msg || i18n.msg.loadError;
            rows = [];
            total = 0;
            totalPages = 1;
        } else if (!qr.ok) {
            errMsg = qr.msg || i18n.msg.loadError;
            rows = [];
        } else {
            total = cr.data || 0;
            totalPages = Math.max(1, Math.ceil(total / pageSize));
            rows = api.queryToRows(qr.data || []).map((r) => ({
                ...r,
                // 路径列带上笔记本名，跨库筛选时可分辨来源
                trail: `${nbNames.get(r.notebook) || r.notebook}${r.trail}`,
            }));
        }
        loading = false;
    }

    async function resetFilters() {
        fNotebook = "";
        fKw = "";
        fFrom = "";
        fTo = "";
        mode = "tree";
        if (activeNotebook) await loadTreeRoot();
    }

    async function pagePrev() {
        if (page > 1) {
            page--;
            await runQuery(false);
        }
    }
    async function pageNext() {
        if (page < totalPages) {
            page++;
            await runQuery(false);
        }
    }

    /* ==================== 选择 ==================== */

    function toggleRowSel(row: DocRow, ev: Event) {
        const c = (ev.target as HTMLInputElement).checked;
        if (c) selectedDocs.set(row.id, row);
        else selectedDocs.delete(row.id);
        selectedDocs = selectedDocs;
    }

    function toggleAllVisible() {
        if (allVisibleChecked) rows.forEach((r) => selectedDocs.delete(r.id));
        else rows.forEach((r) => selectedDocs.set(r.id, r));
        selectedDocs = selectedDocs;
    }

    function selectVisible() {
        rows.forEach((r) => selectedDocs.set(r.id, r));
        selectedDocs = selectedDocs;
    }

    function invertVisible() {
        rows.forEach((r) => (selectedDocs.has(r.id) ? selectedDocs.delete(r.id) : selectedDocs.set(r.id, r)));
        selectedDocs = selectedDocs;
    }

    function clearSel() {
        selectedDocs.clear();
        selectedDocs = selectedDocs;
    }

    /** 嵌套选择只保留顶层根：父文档的删除/转移会连带子文档，父子重复处理会产生假失败或拆散层级 */
    function topLevelOnly(items: DocItem[]): DocItem[] {
        const dir = (p: string) => p.replace(/\.sy$/, "") + "/";
        return items.filter((d) => !items.some((o) => o.id !== d.id && o.notebook === d.notebook && dir(d.path).startsWith(dir(o.path))));
    }

    /** 按当前筛选条件全选：分页拉取全部 id（每次 500，上限 10000） */
    async function selectAllFiltered() {
        if (mode !== "query") return;
        cancelFlag = false;
        prog = {show: true, op: i18n.select.loadingAll, done: 0, total: 0, indet: true};
        const f = curFilters();
        let fetched = 0;
        for (let off = 0; off < 10000; off += 500) {
            if (cancelFlag) break;
            const r = await api.queryDocs(f, {limit: 500, offset: off});
            if (!r.ok) {
                showMessage(r.msg || i18n.msg.loadError);
                break;
            }
            const list = r.data || [];
            api.queryToRows(list).forEach((row) => selectedDocs.set(row.id, row));
            fetched += list.length;
            prog = {...prog, done: fetched};
            if (list.length < 500) break;
        }
        prog.show = false;
        selectedDocs = selectedDocs;
        showMessage(fmt(i18n.select.selectedFiltered, {n: selectedDocs.size}));
    }

    /* ==================== 进度控制 ==================== */

    function startProgress(op: string) {
        cancelFlag = false;
        prog = {show: true, op, done: 0, total: 0, indet: false};
    }
    function endProgress() {
        prog.show = false;
    }

    /** 从选择中移除操作成功的文档并刷新当前视图 */
    function pruneSelection(results: OpResult[]) {
        results.filter((r) => r.ok).forEach((r) => selectedDocs.delete(r.id));
        selectedDocs = selectedDocs;
    }
    async function refreshView() {
        if (mode === "query") await runQuery(false);
        else if (activeNotebook) await loadTreeRoot();
    }

    /* ==================== 批量删除 ==================== */

    async function doDelete() {
        const items = topLevelOnly([...selectedDocs.values()]);
        if (!items.length) {
            showMessage(i18n.msg.noSelection);
            return;
        }
        const subTotal = items.reduce((s, d) => s + (d.subFileCount || 0), 0);
        const hasSubInfo = mode === "tree" || items.some((d) => d.subFileCount != null);
        const body =
            `<div>${fmt(i18n.delete.confirmBody, {n: items.length})}</div>` +
            (hasSubInfo && subTotal > 0
                ? `<div class="bm-confirm-hint" style="color:var(--b3-theme-on-surface-light)">${fmt(i18n.delete.withChildren, {c: subTotal})}</div>`
                : `<div class="bm-confirm-hint" style="color:var(--b3-theme-on-surface-light)">${i18n.delete.maybeChildren}</div>`) +
            `<div style="margin-top:8px">${i18n.delete.trashTip}</div>`;
        const res = await confirmDialog({
            title: i18n.delete.confirmTitle,
            html: body,
            okText: i18n.ops.del,
            cancelText: i18n.common.cancel,
            danger: true,
            checkboxLabel: i18n.delete.permanent,
            checkboxChecked: !!plugin.settings.directDelete,
            checkboxHint: i18n.delete.permanentTip,
        });
        if (!res.ok) return;

        startProgress(i18n.delete.running);
        const results = await api.runBatch(
            items,
            async (d) => {
                const r = await api.removeDoc(d);
                if (!r.ok) return r;
                if (res.checked) {
                    const p = await api.purgeDocFromTrash(d);
                    if (!p.ok) return {ok: true, msg: i18n.delete.permanentFailed};
                }
                return {ok: true};
            },
            // 删除固定串行，安全第一
            {concurrency: 1, onProgress: (done, t) => (prog = {...prog, done, total: t}), cancel: () => cancelFlag},
        );
        endProgress();
        pruneSelection(results);
        // 父文档删除成功会连带子文档，把随之消失的子文档一并移出选择
        for (const r of results) {
            if (!r.ok) continue;
            const d = items.find((x) => x.id === r.id);
            if (!d) continue;
            const dir = d.path.replace(/\.sy$/, "") + "/";
            [...selectedDocs.values()].forEach((s) => {
                if (s.notebook === d.notebook && s.path.replace(/\.sy$/, "").startsWith(dir)) selectedDocs.delete(s.id);
            });
        }
        selectedDocs = selectedDocs;
        showReport(i18n.delete.done, results, i18n);
        await refreshView();
    }

    /* ==================== 批量导出 ==================== */

    function openExport() {
        const items = [...selectedDocs.values()];
        if (!items.length) {
            showMessage(i18n.msg.noSelection);
            return;
        }
        const m = mountSvelte(ExportDialog, {i18n, count: items.length}, {title: i18n.exportDlg.title, width: "480px"});
        m.comp.$on("cancel", () => m.close());
        m.comp.$on("confirm", async (e: CustomEvent) => {
            m.close();
            await performExport(items, e.detail);
        });
    }

    async function performExport(items: DocItem[], opts: { mode: "merged" | "individual"; includeAssets: boolean }) {
        startProgress(i18n.exportRun.running);
        try {
            const {results, fileCount} = await exportDocs(
                items,
                {...opts, concurrency: plugin.settings.concurrency || 1},
                {
                    onPhase: (p) => {
                        if (p === "merging") prog = {...prog, op: i18n.exportRun.merging, indet: true};
                    },
                    onProgress: (done, t) => (prog = {...prog, done, total: t}),
                    cancel: () => cancelFlag,
                },
            );
            endProgress();
            if (fileCount > 0) showMessage(fmt(i18n.exportRun.saved, {n: fileCount}));
            showReport(i18n.exportRun.done, results, i18n);
        } catch (e: any) {
            endProgress();
            showMessage(e?.message || String(e));
        }
    }

    /* ==================== 批量转移 ==================== */

    function openTransfer() {
        const items = topLevelOnly([...selectedDocs.values()]);
        if (!items.length) {
            showMessage(i18n.msg.noSelection);
            return;
        }
        const m = mountSvelte(TransferDialog, {i18n, notebooks, items, count: items.length}, {title: i18n.move.title, width: "560px"});
        m.comp.$on("cancel", () => m.close());
        m.comp.$on("confirm", async (e: CustomEvent) => {
            const {toID, label, validItems, invalidPairs} = e.detail;
            m.close();
            await performTransfer(validItems, invalidPairs, toID, label);
        });
    }

    /** 分批（50/批）调用内核 moveDocsByID；自身/子文档等非法项跳过并计入报告 */
    async function performTransfer(
        valid: DocItem[],
        invalid: { item: DocItem; reason: string }[],
        toID: string,
        label: string,
    ) {
        if (!valid.length) return;
        const chunkSize = 50;
        startProgress(i18n.move.running);
        prog = {...prog, total: valid.length, done: 0};
        const results: OpResult[] = invalid.map((p) => ({id: p.item.id, name: p.item.name, ok: false, msg: p.reason}));
        for (let i = 0; i < valid.length; i += chunkSize) {
            if (cancelFlag) break;
            const chunk = valid.slice(i, i + chunkSize);
            const r = await api.moveDocsByID(chunk.map((d) => d.id), toID);
            chunk.forEach((d) => results.push({id: d.id, name: d.name, ok: r.ok, msg: r.ok ? "" : `${r.msg} (→ ${label})`}));
            prog = {...prog, done: Math.min(i + chunkSize, valid.length)};
        }
        endProgress();
        pruneSelection(results);
        showReport(i18n.move.done, results, i18n);
        await refreshView();
    }

    /* ==================== 批量重命名 ==================== */

    function openRename() {
        const items = [...selectedDocs.values()];
        if (!items.length) {
            showMessage(i18n.msg.noSelection);
            return;
        }
        const m = mountSvelte(RenameDialog, {i18n, items}, {title: i18n.rename.title, width: "640px"});
        m.comp.$on("cancel", () => m.close());
        m.comp.$on("apply", async (e: CustomEvent) => {
            const list: { item: DocItem; title: string }[] = e.detail.list;
            m.close();
            await performRename(list);
        });
    }

    async function performRename(list: { item: DocItem; title: string }[]) {
        startProgress(i18n.rename.running);
        const results = await api.runBatch(
            list.map((x) => x.item),
            async (d) => {
                const t = list.find((x) => x.item.id === d.id)?.title || "";
                return api.renameDocByID(d.id, t);
            },
            {concurrency: 1, onProgress: (done, t) => (prog = {...prog, done, total: t}), cancel: () => cancelFlag},
        );
        endProgress();
        showReport(i18n.rename.done, results, i18n);
        await refreshView();
    }

    /* ==================== 设置 ==================== */

    async function openSettingsDialog() {
        const {Dialog} = await import("siyuan");
        const dialog = new Dialog({
            title: i18n.settings.title,
            width: "460px",
            content: `<div class="bm-dlg">
                <div class="bm-dlg-row">
                    <label><input type="checkbox" id="bm-set-dd" ${plugin.settings.directDelete ? "checked" : ""}/>${esc(i18n.settings.directDelete)}</label>
                </div>
                <div class="bm-dlg-hint">${esc(i18n.settings.directDeleteTip)}</div>
                <div class="bm-dlg-row">
                    <span>${esc(i18n.settings.concurrency)}</span>
                    <select class="b3-select" id="bm-set-cc">
                        ${[1, 2, 3].map((n) => `<option value="${n}" ${plugin.settings.concurrency === n ? "selected" : ""}>${n}</option>`).join("")}
                    </select>
                </div>
                <div class="bm-dlg-hint">${esc(i18n.settings.concurrencyTip)}</div>
                <div class="bm-dlg-actions">
                    <button class="b3-button b3-button--cancel" id="bm-set-cancel">${esc(i18n.common.cancel)}</button>
                    <button class="b3-button b3-button--text" id="bm-set-save">${esc(i18n.common.save)}</button>
                </div>
            </div>`,
        });
        const el = dialog.element;
        el.querySelector("#bm-set-cancel")?.addEventListener("click", () => dialog.destroy());
        el.querySelector("#bm-set-save")?.addEventListener("click", async () => {
            plugin.settings.directDelete = (el.querySelector("#bm-set-dd") as HTMLInputElement).checked;
            plugin.settings.concurrency = Number((el.querySelector("#bm-set-cc") as HTMLSelectElement).value) || 1;
            await plugin.saveSettings();
            showMessage(i18n.settings.saved);
            dialog.destroy();
        });
    }
</script>

<div class="bm-app">
    <!-- 筛选栏：分组带文字标签，右侧为选择状态与选择操作 -->
    <div class="bm-toolbar">
        <div class="bm-filters">
            <label class="bm-fgroup" title={i18n.filter.notebook}>
                <span class="bm-flabel">{i18n.filter.notebook}</span>
                <select class="b3-select" bind:value={fNotebook}>
                    <option value="">{i18n.filter.allNotebooks}</option>
                    {#each notebooks as nb (nb.id)}
                        <option value={nb.id}>{nb.name}</option>
                    {/each}
                </select>
            </label>
            <label class="bm-fgroup bm-fgroup--grow" title={i18n.filter.keyword}>
                <span class="bm-flabel">{i18n.filter.keyword}</span>
                <input class="b3-text-field" placeholder={i18n.filter.keywordPh} bind:value={fKw}
                       on:keydown={(e) => e.key === "Enter" && runQuery()}/>
            </label>
            <label class="bm-fgroup" title={i18n.filter.updatedRange}>
                <span class="bm-flabel">{i18n.filter.updatedRange}</span>
                <input type="date" class="b3-text-field" bind:value={fFrom} title={i18n.filter.from}/>
                <span class="bm-fsep">~</span>
                <input type="date" class="b3-text-field" bind:value={fTo} title={i18n.filter.to}/>
            </label>
            <button class="b3-button b3-button--outline bm-btn-withicon" on:click={() => runQuery()} title={i18n.filter.search}>
                <Icon name="search" size={13}/>{i18n.filter.search}
            </button>
            <button class="b3-button bm-btn-withicon" on:click={resetFilters} title={i18n.filter.reset}>
                <Icon name="reset" size={13}/>{i18n.filter.reset}
            </button>
        </div>
    </div>

    <!-- 选择栏：已选统计 + 选择操作 -->
    <div class="bm-toolbar bm-toolbar--sel">
        <span class="bm-selcount" class:bm-selcount--zero={selCount === 0}>{fmt(i18n.select.selectedCount, {n: selCount})}</span>
        <button class="bm-mini-btn" on:click={selectVisible} title={i18n.select.all}>{i18n.select.all}</button>
        <button class="bm-mini-btn" on:click={invertVisible} title={i18n.select.invert}>{i18n.select.invert}</button>
        {#if mode === "query"}
            <button class="bm-mini-btn" on:click={selectAllFiltered} title={i18n.select.allFiltered}>{i18n.select.allFiltered}</button>
        {/if}
        {#if selCount > 0}
            <button class="bm-mini-btn bm-mini-btn--warn" on:click={clearSel}>{i18n.select.clear}</button>
        {/if}
        <span class="fn__flex-1"></span>
        <button class="bm-mini-btn bm-mini-btn--setting" on:click={openSettingsDialog} title={i18n.ops.settings}>
            <Icon name="gear" size={13}/>{i18n.ops.settings}
        </button>
    </div>

    <!-- 主体：左侧笔记本 / 右侧表格 -->
    <div class="bm-body">
        <div class="bm-side">
            <div class="bm-side-hd">
                <span class="bm-side-title"><Icon name="notebook" size={13}/>{i18n.side.notebooks}</span>
                <button class="bm-mini-btn" title={i18n.side.refresh} on:click={loadNotebooks}>
                    <Icon name="refresh" size={12}/>{i18n.side.refreshBtn}
                </button>
            </div>
            <div class="bm-side-tip">{i18n.side.tip}</div>
            {#each notebooks as nb (nb.id)}
                <div class="bm-nb {mode === 'tree' && nb.id === activeNotebook ? 'bm-nb--act' : ''}"
                     role="button" tabindex="0"
                     on:click={() => openNotebook(nb.id)}
                     on:keydown={(e) => (e.key === "Enter" || e.key === " ") && openNotebook(nb.id)}>
                    <Icon name="notebook" size={13}/>
                    <span class="bm-nb-name" title={nb.name}>{nb.name}</span>
                    {#if nb.count != null}
                        <span class="bm-nb-count">{nb.count}</span>
                    {/if}
                </div>
            {/each}
        </div>

        <div class="bm-main">
            {#if loading && !rows.length}
                <div class="bm-state"><Icon name="refresh" size={22}/><span>{i18n.table.loading}</span></div>
            {:else if errMsg}
                <div class="bm-state bm-state--err"><Icon name="close" size={22}/><span>{errMsg}</span></div>
            {:else if !rows.length}
                <div class="bm-state">
                    <Icon name="inbox" size={36}/>
                    <span class="bm-state-main">{i18n.table.empty}</span>
                    <span class="bm-state-sub">{i18n.table.emptyHint}</span>
                </div>
            {:else}
                <div class="bm-table-wrap">
                    <table class="b3-table bm-table">
                        <thead>
                            <tr>
                                <th class="bm-col-ck"><input type="checkbox" checked={allVisibleChecked} on:change={toggleAllVisible}/></th>
                                <th>{i18n.table.title}</th>
                                <th>{i18n.table.path}</th>
                                <th class="bm-col-num">{i18n.table.subDocs}</th>
                                <th class="bm-col-time">{i18n.table.created}</th>
                                <th class="bm-col-time">{i18n.table.updated}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each rows as row (row.id)}
                                <tr class:bm-row-sel={selectedDocs.has(row.id)}>
                                    <td class="bm-col-ck"><input type="checkbox" checked={selectedDocs.has(row.id)} on:change={(e) => toggleRowSel(row, e)}/></td>
                                    <td>
                                        <div class="bm-title" style="padding-left:{row.depth * 16}px">
                                            {#if row.expandable}
                                                <button class="bm-exp" tabindex="-1" title={row.expanded ? i18n.table.collapse : i18n.table.expand}
                                                        on:click={() => toggleRow(row)}>
                                                    <Icon name={row.expanded ? "chevron-down" : "chevron-right"} size={12}/>
                                                </button>
                                            {:else}
                                                <span class="bm-exp bm-exp--leaf"></span>
                                            {/if}
                                            <Icon name="file" size={13}/>
                                            <span class="bm-name" title={row.name}>{row.name}</span>
                                        </div>
                                    </td>
                                    <td class="bm-path" title={row.trail}>{row.trail}</td>
                                    <td class="bm-col-num">{row.subFileCount != null ? row.subFileCount : "—"}</td>
                                    <td class="bm-col-time">{fmtDocTime(row, "c")}</td>
                                    <td class="bm-col-time">{fmtDocTime(row, "m")}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
                {#if mode === "query"}
                    <div class="bm-pager">
                        <button class="b3-button" disabled={page <= 1} on:click={pagePrev}>‹ {i18n.pager.prev}</button>
                        <span>{fmt(i18n.pager.page, {p: page, t: totalPages})}</span>
                        <button class="b3-button" disabled={page >= totalPages} on:click={pageNext}>{i18n.pager.next} ›</button>
                        <span class="fn__flex-1"></span>
                        <span class="bm-pager-total">{fmt(i18n.pager.total, {n: total})}</span>
                    </div>
                {/if}
            {/if}
        </div>
    </div>

    <!-- 批量操作栏：底部固定，随选择状态启用 -->
    <div class="bm-opbar">
        <button class="bm-op" disabled={selCount === 0} on:click={openExport} title={i18n.exportDlg.title}>
            <Icon name="export" size={15}/>{i18n.ops.export}
        </button>
        <button class="bm-op" disabled={selCount === 0} on:click={openTransfer} title={i18n.move.title}>
            <Icon name="transfer" size={15}/>{i18n.ops.move}
        </button>
        <button class="bm-op" disabled={selCount === 0} on:click={openRename} title={i18n.rename.title}>
            <Icon name="rename" size={15}/>{i18n.ops.rename}
        </button>
        <span class="bm-opbar-tip">{selCount > 0 ? "" : i18n.select.tipNone}</span>
        <span class="fn__flex-1"></span>
        <button class="bm-op bm-op--danger" disabled={selCount === 0} on:click={doDelete} title={i18n.delete.confirmTitle}>
            <Icon name="trash" size={15}/>{i18n.ops.del}
        </button>
    </div>

    <!-- 进度遮罩 -->
    {#if prog.show}
        <div class="bm-progress-mask">
            <div class="bm-progress">
                <div class="bm-progress-t">
                    <Icon name="refresh" size={14}/>
                    {prog.op} {prog.total ? `${prog.done}/${prog.total}` : "…"}
                </div>
                <div class="bm-progress-bar">
                    <div class="bm-progress-in" class:bm-progress-in--indet={prog.indet || !prog.total}
                         style="width:{prog.total ? progPct : 0}%"></div>
                </div>
                {#if prog.total}
                    <div class="bm-progress-pct">{progPct}%</div>
                {/if}
                <button class="b3-button b3-button--cancel" on:click={() => (cancelFlag = true)}>{i18n.common.cancel}</button>
            </div>
        </div>
    {/if}
</div>
