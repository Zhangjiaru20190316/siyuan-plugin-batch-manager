<script lang="ts">
    import {createEventDispatcher} from "svelte";
    export let i18n: any;
    export let count: number;
    const dispatch = createEventDispatcher();

    let mode = "merged";
    let includeAssets = true;
</script>

<div class="bm-dlg">
    <div class="bm-dlg-hint">{i18n.exportDlg.countInfo.replace("{n}", String(count))}</div>

    <div>
        <div class="bm-dlg-section-title">{i18n.exportDlg.mode}</div>
        <div class="bm-dlg-row" style="margin-top:6px">
            <label><input type="radio" name="bm-exp-mode" value="merged" bind:group={mode}/>{i18n.exportDlg.merged}</label>
            <label><input type="radio" name="bm-exp-mode" value="individual" bind:group={mode}/>{i18n.exportDlg.individual}</label>
        </div>
    </div>

    <div>
        <div class="bm-dlg-row">
            <label>
                <input type="checkbox" bind:checked={includeAssets}/>
                {i18n.exportDlg.includeAssets}
            </label>
        </div>
        <div class="bm-dlg-hint" style="margin-top:4px">{i18n.exportDlg.assetsTip}</div>
    </div>

    <div class="bm-dlg-actions">
        <button class="b3-button b3-button--cancel" on:click={() => dispatch("cancel")}>{i18n.common.cancel}</button>
        <button class="b3-button b3-button--text" on:click={() => dispatch("confirm", {mode, includeAssets})}>
            {i18n.exportDlg.go}
        </button>
    </div>
</div>
