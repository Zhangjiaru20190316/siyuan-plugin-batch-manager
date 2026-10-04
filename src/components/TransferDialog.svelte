<script lang="ts">
    import {createEventDispatcher, onMount} from "svelte";
    import {listDocs, searchTargetDocs} from "../api";
    import type {DocItem, NotebookItem} from "../types";
    import Icon from "./Icon.svelte";

    export let i18n: any;
    export let notebooks: NotebookItem[];
    /** 待转移文档（用于合法性校验：不能移入自身或自身的子文档） */
    export let items: DocItem[];
    export let count: number;
    const dispatch = createEventDispatcher();

    type ChainItem = { id: string; name: string; path: string };
    type TargetDoc = { id: string; name: string; box: string; path: string; hpath: string };

    let tab: "browse" | "search" = "search";
    let toNotebook = notebooks.length ? notebooks[0].id : "";

    /* ---------- 浏览模式：级联下拉 ---------- */
    let chain: ChainItem[] = [];
    let levels: { opts: any[]; selected: string; loading: boolean }[] = [];

    /* ---------- 搜索模式 ---------- */
    let kw = "";
    let searching = false;
    let searched = false;
    let results: TargetDoc[] = [];
    let nbNames = new Map<string, string>();
    notebooks.forEach((n) => nbNames.set(n.id, n.name));

    /* ---------- 当前目标 ---------- */
    let picked: TargetDoc | null = null;

    /** 目标父文档（null = 笔记本根目录） */
    $: targetDoc = picked
        ? picked
        : chain.length
            ? {id: chain[chain.length - 1].id, name: chain[chain.length - 1].name, box: toNotebook, path: chain[chain.length - 1].path, hpath: ""}
            : null;

    $: nbName = (notebooks.find((n) => n.id === toNotebook) || {name: ""}).name;
    $: targetLabel = targetDoc
        ? `${targetDoc.box ? nbNames.get(targetDoc.box) || targetDoc.box : nbName} / ${targetDoc.hpath ? targetDoc.hpath.replace(/^\//, "") : chainPath(targetDoc)}`
        : `${nbName} / ${i18n.move.rootLabel}`;
    $: toID = targetDoc ? targetDoc.id : toNotebook;

    function chainPath(t: TargetDoc): string {
        // 浏览模式选出的目标：仅显示最后一级名（前面级别已在下拉中体现）
        return t.name;
    }

    /** 校验单篇文档能否移入目标：目标是其自身或其子文档则非法。
     *  目标作为参数传入（而非闭包读取），否则 $: 不会在 targetDoc 变化时重算。
     *  思源布局：父文档 /P.sy 的子文档位于 /P/ 目录，因此子路径前缀按去掉 .sy 的目录比对 */
    function invalidReason(it: DocItem, target: TargetDoc | null): string {
        if (!target) return "";
        if (it.id === target.id) return i18n.move.invalidSelf;
        const itDir = it.path.replace(/\.sy$/, "") + "/";
        if (it.notebook === target.box && (target.path + "/").startsWith(itDir)) return i18n.move.invalidChild;
        return "";
    }

    $: invalidPairs = items.map((it) => ({item: it, reason: invalidReason(it, targetDoc)})).filter((p) => p.reason);
    $: validItems = items.filter((it) => !invalidReason(it, targetDoc));

    /* ---------- 浏览模式逻辑 ---------- */

    async function loadLevel(depth: number, parentPath: string) {
        if (!levels[depth]) levels[depth] = {opts: [], selected: "", loading: false};
        levels[depth].loading = true;
        levels[depth].opts = [];
        levels[depth].selected = "";
        levels = levels;
        const r = await listDocs(toNotebook, parentPath);
        levels[depth].opts = r.ok ? r.data : [];
        levels[depth].loading = false;
        levels = levels;
    }

    async function resetToNotebook() {
        chain = [];
        levels = [];
        picked = null;
        if (toNotebook) await loadLevel(0, "/");
    }

    async function pick(depth: number, ev: Event) {
        const v = (ev.target as HTMLSelectElement).value;
        levels[depth].selected = v;
        levels = levels;
        picked = null;
        if (!v) {
            chain = chain.slice(0, depth);
            levels = levels.slice(0, depth + 1);
            return;
        }
        const doc = levels[depth].opts.find((o) => o.id === v);
        if (!doc) return;
        chain = chain.slice(0, depth);
        chain = [...chain, {id: doc.id, name: String(doc.name || "").replace(/\.sy$/, ""), path: doc.path}];
        levels = levels.slice(0, depth + 1);
        await loadLevel(depth + 1, doc.path);
    }

    /* ---------- 搜索模式逻辑 ---------- */

    async function doSearch() {
        const q = kw.trim();
        if (!q) return;
        searching = true;
        searched = true;
        results = [];
        const r = await searchTargetDocs(q, 50);
        results = r.ok ? r.data || [] : [];
        searching = false;
    }

    function chooseResult(t: TargetDoc) {
        picked = t;
    }

    function clearPicked() {
        picked = null;
    }

    onMount(resetToNotebook);
</script>

<div class="bm-dlg">
    <div class="bm-dlg-hint">{i18n.move.countInfo.replace("{n}", String(count))}</div>

    <!-- 方式切换 -->
    <div class="bm-tabs" role="tablist">
        <button class="bm-tab {tab === 'search' ? 'bm-tab--act' : ''}" role="tab" aria-selected={tab === "search"}
                on:click={() => (tab = "search")}>
            <Icon name="search" size={13}/>{i18n.move.tabSearch}
        </button>
        <button class="bm-tab {tab === 'browse' ? 'bm-tab--act' : ''}" role="tab" aria-selected={tab === "browse"}
                on:click={() => (tab = "browse")}>
            <Icon name="chevron-down" size={13}/>{i18n.move.tabBrowse}
        </button>
    </div>

    {#if tab === "search"}
        <div class="bm-tsearch">
            <div class="bm-tsearch-bar">
                <input class="b3-text-field bm-tsearch-input" placeholder={i18n.move.searchPh} bind:value={kw}
                       on:keydown={(e) => e.key === "Enter" && doSearch()}/>
                <button class="b3-button b3-button--outline" on:click={doSearch} disabled={searching || !kw.trim()}>
                    <Icon name="search" size={13}/>{i18n.move.searchBtn}
                </button>
            </div>
            <div class="bm-tsearch-list">
                {#if searching}
                    <div class="bm-tsearch-tip">{i18n.table.loading}</div>
                {:else if searched && !results.length}
                    <div class="bm-tsearch-tip">{i18n.move.noResult}</div>
                {:else if !searched}
                    <div class="bm-tsearch-tip">{i18n.move.searchTip}</div>
                {:else}
                    {#each results as t (t.id)}
                        <button class="bm-tsearch-item {picked && picked.id === t.id ? 'bm-tsearch-item--act' : ''}"
                                title={t.hpath} on:click={() => chooseResult(t)}>
                            <Icon name="file" size={13}/>
                            <span class="bm-tsearch-name">{t.name}</span>
                            <span class="bm-tsearch-path">{nbNames.get(t.box) || t.box}{t.hpath}</span>
                        </button>
                    {/each}
                {/if}
            </div>
        </div>
    {:else}
        <div class="bm-tbrowse">
            <div class="bm-dlg-row">
                <span class="bm-dlg-label">{i18n.move.notebook}</span>
                <select class="b3-select" style="max-width:220px" bind:value={toNotebook} on:change={resetToNotebook}>
                    {#each notebooks as nb (nb.id)}
                        <option value={nb.id}>{nb.name}</option>
                    {/each}
                </select>
            </div>
            <div>
                <div class="bm-dlg-section-title">{i18n.move.target}</div>
                {#each levels as lv, depth (depth)}
                    <div class="bm-dlg-row" style="margin-left:{depth * 14}px">
                        <Icon name="chevron-right" size={12}/>
                        <select class="b3-select" style="max-width:280px" on:change={(e) => pick(depth, e)}>
                            <option value="">{i18n.move.stopHere}</option>
                            {#each lv.opts as o (o.id)}
                                <option value={o.id}>{o.name}</option>
                            {/each}
                        </select>
                        {#if lv.loading}<span class="bm-move-loading">{i18n.table.loading}</span>{/if}
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <!-- 当前目标 -->
    <div class="bm-target-label">
        <Icon name="target" size={14}/>
        <span>{i18n.move.targetLabel.replace("{t}", targetLabel)}</span>
        {#if picked}
            <button class="bm-target-clear" title={i18n.move.clearPick} on:click={clearPicked}>
                <Icon name="close" size={12}/>
            </button>
        {/if}
    </div>

    {#if invalidPairs.length}
        <div class="bm-dlg-hint bm-invalid-hint">
            {i18n.move.invalidHint.replace("{n}", String(invalidPairs.length))}
        </div>
    {/if}

    <div class="bm-dlg-actions">
        <button class="b3-button b3-button--cancel" on:click={() => dispatch("cancel")}>{i18n.common.cancel}</button>
        <button class="b3-button b3-button--text" disabled={!toNotebook || !validItems.length}
                title={!validItems.length ? i18n.move.invalidAll : ""}
                on:click={() => dispatch("confirm", {toID, label: targetLabel, validItems, invalidPairs})}>
            <Icon name="transfer" size={13}/>{i18n.move.confirm}
        </button>
    </div>
</div>
