import {defineConfig, type Plugin} from "vite";
import {svelte, vitePreprocess} from "@sveltejs/vite-plugin-svelte";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const r = (p: string) => path.resolve(rootDir, p);

/**
 * 构建后把插件元数据复制进 dist（思源按目录加载：index.js / index.css / plugin.json / i18n/…）
 * watch 模式下每次重建都会执行 writeBundle，保证 dist 始终完整。
 */
function copyPluginMeta(): Plugin {
    return {
        name: "copy-plugin-meta",
        writeBundle() {
            const out = r("dist");
            fs.mkdirSync(out, {recursive: true});
            for (const f of ["plugin.json", "README.md", "preview.png", "icon.png"]) {
                if (fs.existsSync(r(f))) fs.copyFileSync(r(f), path.join(out, f));
            }
            for (const d of ["i18n"]) {
                if (fs.existsSync(r(d))) fs.cpSync(r(d), path.join(out, d), {recursive: true, force: true});
            }
        },
    };
}

export default defineConfig({
    plugins: [svelte({preprocess: vitePreprocess()}), copyPluginMeta()],
    build: {
        target: "esnext",
        outDir: "dist",
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        lib: {
            entry: r("src/index.ts"),
            formats: ["cjs"],
            fileName: () => "index.js",
            name: "BatchManagerPlugin",
        },
        cssCodeSplit: false,
        rollupOptions: {
            external: ["siyuan", "process"],
            output: {
                // css 产物输出为 dist/index.css（内核 loader 自动注入）
                assetFileNames: "index.[ext]",
            },
        },
    },
});
