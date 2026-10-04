import {Dialog} from "siyuan";
import type {OpResult} from "./types";
import {esc, fmt} from "./util";
import type App from "./App.svelte";

/* ============ 确认对话框（支持危险样式 + 复选框），Promise 化 ============ */

export interface ConfirmOptions {
    title: string;
    /** 允许 HTML */
    html: string;
    okText: string;
    cancelText: string;
    danger?: boolean;
    checkboxLabel?: string;
    checkboxChecked?: boolean;
    checkboxHint?: string;
    width?: string;
}

export function confirmDialog(opts: ConfirmOptions): Promise<{ ok: boolean; checked: boolean }> {
    return new Promise((resolve) => {
        let settled = false;
        const fin = (ok: boolean, checked: boolean) => {
            if (settled) return;
            settled = true;
            try {
                dialog.destroy();
            } catch {
                /* ignore */
            }
            resolve({ok, checked});
        };
        const cbHtml = opts.checkboxLabel
            ? `<label class="bm-confirm-cb ${opts.danger ? "bm-confirm-cb--danger" : ""}">
                   <input type="checkbox" id="bm-confirm-ck" ${opts.checkboxChecked ? "checked" : ""}/>
                   <span>${esc(opts.checkboxLabel)}</span>
               </label>
               ${opts.checkboxHint ? `<div class="bm-confirm-hint">${esc(opts.checkboxHint)}</div>` : ""}`
            : "";
        const dialog = new Dialog({
            title: opts.title,
            width: opts.width || "520px",
            content: `<div class="bm-confirm">
                <div class="bm-confirm-body">${opts.html}${cbHtml}</div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel" id="bm-confirm-no">${esc(opts.cancelText)}</button>
                    <button class="b3-button ${opts.danger ? "b3-button--error" : "b3-button--text"}" id="bm-confirm-yes">${esc(opts.okText)}</button>
                </div>
            </div>`,
            destroyCallback: () => fin(false, false),
        });
        const el = dialog.element;
        el.querySelector("#bm-confirm-yes")?.addEventListener("click", () => {
            const ck = el.querySelector("#bm-confirm-ck") as HTMLInputElement | null;
            fin(true, ck ? ck.checked : false);
        });
        el.querySelector("#bm-confirm-no")?.addEventListener("click", () => fin(false, false));
    });
}

/* ============ 结果报告 ============ */

export function showReport(opName: string, results: OpResult[], i18n: any): void {
    const okN = results.filter((r) => r.ok).length;
    const fails = results.filter((r) => !r.ok);
    const failHtml = fails.length
        ? `<div class="bm-report-fails"><div class="bm-report-fails-hd">${esc(i18n.report.failDetail)}</div>
             ${fails.slice(0, 100).map((f) => `<div class="bm-report-row"><span class="bm-report-name" title="${esc(f.name)}">${esc(f.name)}</span><span class="bm-report-msg">${esc(f.msg || "unknown")}</span></div>`).join("")}
             ${fails.length > 100 ? `<div class="bm-report-row">… ${fails.length - 100}</div>` : ""}
           </div>`
        : "";
    const dialog = new Dialog({
        title: `${opName}`,
        width: "560px",
        content: `<div class="bm-confirm">
            <div class="bm-confirm-body">
                <div class="bm-report-summary">${esc(fmt(i18n.report.summary, {ok: okN, fail: fails.length}))}</div>
                ${failHtml}
            </div>
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--text" id="bm-report-close">${esc(i18n.common.close)}</button>
            </div>
        </div>`,
    });
    dialog.element.querySelector("#bm-report-close")?.addEventListener("click", () => dialog.destroy());
}

/* ============ 在 Dialog 中挂载 Svelte 组件 ============ */

export interface Mounted {
    dialog: Dialog;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    comp: any;
    close: () => void;
}

export function mountSvelte(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Comp: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props: Record<string, any>,
    opts: { title: string; width?: string },
): Mounted {
    const dialog = new Dialog({
        title: opts.title,
        width: opts.width || "620px",
        content: `<div class="bm-mount"></div>`,
        destroyCallback: () => {
            try {
                comp?.$destroy();
            } catch {
                /* ignore */
            }
        },
    });
    const target = dialog.element.querySelector(".bm-mount") as HTMLElement;
    const comp = new Comp({target, props});
    return {
        dialog,
        comp,
        close: () => {
            try {
                dialog.destroy();
            } catch {
                /* ignore */
            }
        },
    };
}

export type AppLike = App;
