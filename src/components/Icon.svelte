<script lang="ts">
    /**
     * 统一图标组件：自绘 16×16 线性图标，stroke 跟随文字颜色（currentColor），
     * 显式 width/height 属性，不依赖思源内置 sprite，杜绝主题下 SVG 撑大重叠。
     */
    export let name: string;
    export let size = 14;

    const paths: Record<string, string> = {
        // 笔记本（叠层文件夹）
        notebook:
            '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/>' +
            '<path d="M3.5 10.5V3.5a1 1 0 0 1 1-1h6.5"/>',
        // 文档
        file:
            '<path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9.5 1.5z"/>' +
            '<path d="M9.5 1.5V5H13"/>',
        // 文件夹（转移目标父文档）
        folder:
            '<path d="M1.5 13.5v-10a1 1 0 0 1 1-1h3.6l1.5 2h5.4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1z"/>',
        // 搜索
        search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
        // 重置（左旋箭头）
        reset: '<path d="M2.5 8a5.5 5.5 0 1 0 1.62-3.9L2.5 5.2"/><path d="M2.5 2.6v2.6h2.6"/>',
        // 刷新
        refresh: '<path d="M13.5 8a5.5 5.5 0 1 1-1.62-3.9L13.5 5.2"/><path d="M13.5 2.6v2.6h-2.6"/>',
        // 导出（下载）
        export: '<path d="M8 2.5v7.5M4.8 7l3.2 3.2L11.2 7"/><path d="M2.5 13h11"/>',
        // 转移（双向箭头）
        transfer: '<path d="M2 5h11M9.5 2L13 5l-3.5 3"/><path d="M14 11H3M6.5 8L3 11l3.5 3"/>',
        // 重命名（铅笔）
        rename: '<path d="M11.3 2.2l2.5 2.5L6 12.5l-3 .8.8-3 9.5-8.1z"/>',
        // 删除（垃圾桶）
        trash:
            '<path d="M2.5 4.5h11M6.5 2.5h3"/>' +
            '<path d="M4.2 4.5l.6 8.6a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-8.6"/>' +
            '<path d="M6.5 7.5v4M9.5 7.5v4"/>',
        // 设置（齿轮）
        gear:
            '<circle cx="8" cy="8" r="2.4"/>' +
            '<path d="M8 1.8v1.8M8 12.4v1.8M1.8 8h1.8M12.4 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M12.4 3.6l-1.3 1.3M4.9 11.1l-1.3 1.3"/>',
        // 展开箭头
        "chevron-right": '<path d="M6 3.5L10.5 8 6 12.5"/>',
        "chevron-down": '<path d="M3.5 6L8 10.5 12.5 6"/>',
        // 对勾 / 叉
        check: '<path d="M3 8.5l3.5 3.5L13 4.5"/>',
        close: '<path d="M4 4l8 8M12 4l-8 8"/>',
        // 准星（目标）
        target: '<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="1.8"/>',
        // 空状态（打开的盒子）
        inbox: '<path d="M2 9.5l1.6-6a1 1 0 0 1 1-.7h6.8a1 1 0 0 1 1 .7l1.6 6"/><path d="M2 9.5v3.2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5"/><path d="M2 9.5h3.5l1 1.6h3l1-1.6H14"/>',
    };
</script>

<svg class="bm-icon" width={size} height={size} viewBox="0 0 16 16" fill="none"
     stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
     aria-hidden="true" style="flex-shrink:0">
    {@html paths[name] || ""}
</svg>
