<script lang="ts">
    import {createEventDispatcher} from "svelte";
    import type {DocItem} from "../types";
    export let i18n: any;
    export let items: DocItem[];
    const dispatch = createEventDispatcher();

    let mode = "prefix";
    let prefix = "";
    let suffix = "";
    let find = "";
    let repl = "";
    let useRegex = false;

    $: regexError = (() => {
        if (mode !== "replace" || !useRegex || !find) return "";
        try {
            void new RegExp(find, "g");
            return "";
        } catch (e: any) {
            return String(e?.message || e);
        }
    })();

    /** 返回 {title} 或 {error}。状态必须全部走参数：Svelte 的 $: 只收集语句内直接引用的变量，闭包读取不会建立依赖 */
    function computeRename(name: string, mode: string, prefix: string, suffix: string, find: string, repl: string, useRegex: boolean): { title?: string; error?: string } {
        let t = name;
        if (mode === "prefix") {
            t = prefix + name;
        } else if (mode === "suffix") {
            t = name + suffix;
        } else {
            if (!find) return {error: i18n.rename.needFind};
            if (useRegex) {
                try {
                    t = name.replace(new RegExp(find, "g"), repl);
                } catch (e: any) {
                    return {error: i18n.rename.regexError.replace("{e}", String(e?.message || e))};
                }
            } else {
                t = name.split(find).join(repl);
            }
        }
        t = (t || "").trim();
        if (!t || t.length > 255 || /[\\/]/.test(t)) return {error: i18n.rename.badName};
        return {title: t};
    }

    $: previews = items.slice(0, 50).map((it) => ({it, r: computeRename(it.name, mode, prefix, suffix, find, repl, useRegex)}));
    $: validList = items
        .map((it) => ({item: it, r: computeRename(it.name, mode, prefix, suffix, find, repl, useRegex)}))
        .filter((x) => x.r.title)
        .map((x) => ({item: x.item, title: x.r.title as string}));
    $: canApply =
        validList.length > 0 &&
        !regexError &&
        (mode !== "replace" ? true : !!find) &&
        (mode !== "prefix" || !!prefix) &&
        (mode !== "suffix" || !!suffix);

    function apply() {
        dispatch("apply", {list: validList});
    }
</script>

<div class="bm-dlg">
    <div class="bm-dlg-hint">{i18n.rename.countInfo.replace("{n}", String(items.length))}</div>

    <div class="bm-dlg-row">
        <span>{i18n.rename.mode}</span>
        <label><input type="radio" name="bm-rn-mode" value="prefix" bind:group={mode}/>{i18n.rename.prefix}</label>
        <label><input type="radio" name="bm-rn-mode" value="suffix" bind:group={mode}/>{i18n.rename.suffix}</label>
        <label><input type="radio" name="bm-rn-mode" value="replace" bind:group={mode}/>{i18n.rename.replace}</label>
    </div>

    {#if mode === "prefix"}
        <div class="bm-dlg-row"><input class="b3-text-field" style="max-width:320px" placeholder={i18n.rename.prefixPh} bind:value={prefix}/></div>
    {:else if mode === "suffix"}
        <div class="bm-dlg-row"><input class="b3-text-field" style="max-width:320px" placeholder={i18n.rename.suffixPh} bind:value={suffix}/></div>
    {:else}
        <div class="bm-dlg-row">
            <input class="b3-text-field" style="max-width:180px" placeholder={i18n.rename.findPh} bind:value={find}/>
            <span>→</span>
            <input class="b3-text-field" style="max-width:180px" placeholder={i18n.rename.replacePh} bind:value={repl}/>
            <label><input type="checkbox" bind:checked={useRegex}/>{i18n.rename.useRegex}</label>
        </div>
        {#if regexError}<div class="bm-preview-invalid">{i18n.rename.regexError.replace("{e}", regexError)}</div>{/if}
    {/if}

    <div>
        <div class="bm-dlg-section-title">{i18n.rename.preview}</div>
        <table class="bm-preview-table" style="margin-top:6px">
            <thead>
                <tr><th>{i18n.rename.original}</th><th>{i18n.rename.renamed}</th></tr>
            </thead>
            <tbody>
                {#each previews as p (p.it.id)}
                    <tr>
                        <td title={p.it.name}>{p.it.name}</td>
                        {#if p.r.title}
                            {#if p.r.title === p.it.name}
                                <td style="color:var(--b3-theme-on-surface-light)">{p.r.title}</td>
                            {:else}
                                <td>{p.r.title}</td>
                            {/if}
                        {:else}
                            <td class="bm-preview-invalid" title={p.r.error}>{i18n.rename.invalid}: {p.r.error}</td>
                        {/if}
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>

    <div class="bm-dlg-actions">
        <button class="b3-button b3-button--cancel" on:click={() => dispatch("cancel")}>{i18n.common.cancel}</button>
        <button class="b3-button b3-button--text" disabled={!canApply} on:click={apply}>
            {i18n.rename.apply.replace("{n}", String(validList.length))}
        </button>
    </div>
</div>
