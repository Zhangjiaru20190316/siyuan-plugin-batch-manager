import {Dialog, Plugin} from "siyuan";
import App from "./App.svelte";
import type {BatchSettings} from "./types";
import "./index.css";
import zhCN from "../i18n/zh_CN.json";

export type I18N = typeof zhCN;
export type {BatchSettings};

export default class BatchManagerPlugin extends Plugin {
    /** 基类 i18n 类型为 Record<string,string>，此处以 t 取强类型视图 */
    get t(): I18N {
        return this.i18n as unknown as I18N;
    }

    settings: BatchSettings = {directDelete: false, concurrency: 1};
    private main: { dialog: Dialog; app: any } | null = null;

    onload(): void {
        // 顶栏按钮
        this.addTopBar({
            id: "batchManager",
            icon: "iconFiles",
            title: `${this.t.pluginName} (Ctrl+Alt+B)`,
            callback: () => this.toggleMain(),
        });

        // 命令面板 + 快捷键（langKey 对应 i18n 中的 cmdOpen 字段）
        this.addCommand({
            langKey: "cmdOpen",
            hotkey: "⌘⌥B",
            callback: () => this.toggleMain(),
        });
    }

    onLayoutReady(): void {
        this.loadSettings()
            .then(() => this.setupSettingTab())
            .catch(() => undefined);
    }

    onunload(): void {
        this.closeMain();
    }

    /* ==================== 主界面 ==================== */

    toggleMain(): void {
        if (this.main) this.closeMain();
        else this.openMain();
    }

    openMain(): void {
        const dialog = new Dialog({
            title: `${this.t.pluginName} v${"0.2.0"}`,
            content: `<div id="bm-root"></div>`,
            width: "1020px",
            destroyCallback: () => {
                if (this.main && this.main.dialog === dialog) {
                    try {
                        this.main.app?.$destroy();
                    } catch {
                        /* ignore */
                    }
                    this.main = null;
                }
            },
        });
        const target = dialog.element.querySelector("#bm-root") as HTMLElement;
        const app = new App({target, props: {plugin: this, i18n: this.t}});
        this.main = {dialog, app};
    }

    closeMain(): void {
        this.main?.dialog.destroy();
        this.main = null;
    }

    /* ==================== 设置 ==================== */

    async loadSettings(): Promise<void> {
        try {
            const raw = await this.loadData("settings.json");
            if (raw) this.settings = {...this.settings, ...(typeof raw === "string" ? JSON.parse(raw) : raw)};
        } catch {
            /* 首次无配置 */
        }
    }

    async saveSettings(): Promise<void> {
        try {
            await this.saveData("settings.json", JSON.stringify(this.settings));
        } catch {
            /* ignore */
        }
    }

    /** 设置页（设置 → 插件 → 批量管理）：siyuan Setting.addItem 为 createElement 风格 */
    private setupSettingTab(): void {
        try {
            const setting = this.setting;
            if (!setting || typeof setting.addItem !== "function") return;

            // 彻底删除默认勾选
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "b3-switch";
            cb.checked = this.settings.directDelete;
            setting.addItem({
                title: this.t.settings.directDelete,
                description: this.t.settings.directDeleteTip,
                actionElement: cb,
            });
            cb.addEventListener("change", async () => {
                this.settings.directDelete = cb.checked;
                await this.saveSettings();
            });

            // 并发数
            const sel = document.createElement("select");
            sel.className = "b3-select";
            sel.style.width = "80px";
            [1, 2, 3].forEach((n) => {
                const o = document.createElement("option");
                o.value = String(n);
                o.textContent = String(n);
                if (this.settings.concurrency === n) o.selected = true;
                sel.appendChild(o);
            });
            setting.addItem({
                title: this.t.settings.concurrency,
                description: this.t.settings.concurrencyTip,
                actionElement: sel,
            });
            sel.addEventListener("change", async () => {
                this.settings.concurrency = Number(sel.value) || 1;
                await this.saveSettings();
            });
        } catch {
            /* 设置面板不可用时，主界面 ⚙ 仍可修改设置 */
        }
    }
}
