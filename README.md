# siyuan-plugin-batch-manager 思源笔记·批量管理

对笔记本/文档进行批量管理的思源笔记插件：**浏览、SQL 筛选、多选、批量删除、批量导出 Markdown、批量转移、批量重命名**。

基于官方模板 `plugin-sample-vite-svelte`（Vite + TypeScript + **Svelte 4**）。

> **UI 选型说明（Svelte）**：本插件界面状态多且联动强（勾选集合、筛选分页、批量进度、级联选择器），Svelte 的响应式声明（`$:`、`bind:group`）能以最少样板代码完成状态→视图同步，且模板即官方 vite-svelte 模板、编译产物自带轻量运行时，无需额外运行时依赖；相比手写 DOM/原生 TS 维护成本显著更低。

![preview](preview.png)

## 功能

| 功能 | 说明 |
|---|---|
| F1 浏览与筛选 | 左侧笔记本树（懒加载展开子文档），右侧文档表格（标题/路径/子文档数/创建/更新时间）；工具栏支持 按笔记本 + 更新时间区间 + 标题关键字 的 SQL 筛选，分页（50/页） |
| F2 批量勾选 | 单选 / 全选本页 / 反选本页 / 按筛选结果全选（分页拉取全部 id，上限 10000），已选数量实时统计 |
| F3 批量删除 | 二次确认（红色危险样式，显示篇数与子文档数）；默认走回收站可恢复；可选"彻底删除"（物理删除，红色警示）；串行执行 + 进度条 + 可取消 + 结果报告 |
| F4 批量导出 | 合并为一个 zip / 逐篇保存；可选是否包含资源（图片等）；合并+含资源时调用内核 `exportMds` 一次打包；进度与结果报告 |
| F5 批量转移 | 双模式选择目标：**搜索目标**（跨笔记本按标题关键字搜索，点击选中）或 **逐级浏览**（级联下拉）；目标为笔记本根目录时可只选笔记本；自动校验并跳过"目标是自身/自身子文档"的项；分批（50/批）调用 `moveDocsByID`，进度 + 结果报告 |
| F6 批量重命名 | 前缀 / 后缀 / 查找替换（可正则），实时预览，非法标题标红跳过 |

快捷键：`Ctrl+Alt+B` 打开/关闭面板；也可点击顶栏图标。

## 安装

### 方式一：一键脚本（推荐，本机开发安装）

```bash
pnpm i                 # 安装依赖
pnpm build             # 构建到 dist/
pnpm install:plugin    # 复制 dist 到工作空间 data/plugins/ 并自动启用（热加载）
```

`install:plugin` 会：

1. 定位工作空间（优先级：命令行参数 > `SIYUAN_WORKSPACE` 环境变量 > 运行中进程的 `--workspace` > 默认路径）；
2. 将 `dist/` **复制**到 `工作空间/data/plugins/siyuan-plugin-batch-manager`（内核只在启动时扫描插件目录，但运行期可通过启用 API 注册，故用真实目录复制）；
3. 若思源正在运行，调用内核 `/api/petal/setPetalEnabled` 启用并推送前端热加载（加 `--reload` 参数先禁用再启用，用于开发期强制重载）；若未运行则提示启动后启用。

> 注：`pnpm makeLink` 仍提供 junction 链接方式（链接后需重启思源让内核扫描到插件），适合配合 `pnpm dev` 长期开发；日常更新推荐 `node scripts/install.cjs --reload`。

### 方式二：手动

```bash
pnpm i && pnpm build
# 把 dist 目录内容复制到 工作空间/data/plugins/siyuan-plugin-batch-manager/
# 重启思源或在 设置 → 插件 中启用
```

## 本地开发（热加载）

```bash
pnpm i
pnpm makeLink   # 建立工作空间 → dist 的 junction（等价 install:plugin 的链接步骤）
pnpm dev        # vite build --watch，重建后思源内"重载插件"即生效
```

> 反复禁用/启用插件可验证 `onunload` 清理（对话框与事件均会销毁，无 DOM 残留）。

## 使用说明

1. 点击顶栏图标或 `Ctrl+Alt+B` 打开面板；
2. **浏览**：点左侧笔记本加载其根文档，点行首箭头图标懒加载展开子文档；
3. **筛选**：顶部选择笔记本（可"全部"）、输入标题关键字、选择更新时间区间后点"筛选"，表格切换为 SQL 结果（带分页）；点"重置"回到树形浏览；
4. **勾选**：表格复选框单选；工具栏"全选本页/反选本页/选中全部筛选结果"；统计徽标实时显示已选数量；
5. **删除**：点红色"删除"→ 确认框显示篇数与级联子文档数 →（可选勾选"彻底删除"）→ 进度 → 报告。默认移入回收站（文档树 → 更多 → 回收站 可恢复）；
6. **导出**：选择合并 zip / 逐篇保存、是否含资源 → 进度 → 浏览器/Electron 下载；
7. **转移**：选择「搜索目标」（输入标题关键字 → 回车 → 点击结果）或「逐级浏览」选目标父文档；不选父文档即转移到笔记本根目录；目标是自身或其子文档的项会自动跳过并说明；
8. **重命名**：选择方式并填写参数，预览确认后应用；
9. **设置**：选择栏右侧「设置」按钮或 设置 → 插件 → 批量管理：默认勾选彻底删除、批量并发数（1~3，删除固定串行）。

## 技术要点（真实内核验证过的 API）

- 笔记本列表 `/api/notebook/lsNotebooks`；子文档懒加载 `/api/filetree/listDocsByPath`（`ctime/mtime/subFileCount` 等）；
- SQL 筛选 `/api/query/sql`（**3.x 内核请求键为 `stmt`，旧版为 `sql`，本插件两个键都传**）；文档块 `type='d'`，`content` 为标题，`created/updated` 为 `YYYYMMDDHHmmss` 可按字典序比较；
- 删除 `/api/filetree/removeDocByID`（回退 `removeDoc`）→ 回收站；彻底删除 = 回收站定位后 `/api/file/removeFile` 物理删除（尽力而为，失败仅提示）；
- 移动/转移 `/api/filetree/moveDocsByID`（转移目标搜索复用 `/api/query/sql`）；重命名 `/api/filetree/renameDocByID`；
- 导出 `/api/export/exportMds`（多篇合并 zip）、`exportMd`（单篇 zip）、`exportMdContent`（纯 Markdown），zip 从 `origin + data.zip` 下载；
- 批量执行：小并发池（≤3，删除串行），逐项 try/catch，汇总成功/失败报告。

## 已知限制

- 仅桌面端（desktop / browser-desktop / desktop-window），未适配移动端；
- 树形浏览的时间戳来自文件系统（ctime/mtime）；SQL 筛选来自内容块数据库，两者可能有细微差异；文档删除后 SQL 索引可能短暂残留旧条目；
- 关键字筛选使用 SQL `LIKE`，`%`/`_` 按通配符解释；
- "选中全部筛选结果"上限 10000 篇；
- **"彻底删除"为实验性**：3.x 内核的回收站即数据历史（删除的文档进入 `工作空间/history/<时间戳>-delete/…`），插件通过读取历史目录并调用文件接口物理删除；开启云端同步时，刚删除的文档可能被同步引擎恢复（属思源同步语义，与插件无关），且历史目录布局随版本可能变化，失败时自动降级为"仅入回收站"并在报告中说明；
- 桌面端导出时右下角会出现浏览器式下载确认条，需点击「保存」后文件才落盘（Electron 下载行为）；
- 逐篇导出在浏览器端可能触发"允许下载多个文件"询问（桌面端无此问题）。

## Roadmap

- [ ] 移动端适配（frontends 增加 browser-mobile）
- [ ] Dock 侧边栏常驻面板模式
- [ ] 导出格式扩展（HTML/Word/Pandoc 全家桶）
- [ ] 重命名增加序号/日期变量
- [ ] 操作撤销（删除后一键还原最近一批）

## License

[AGPL-3.0](./LICENSE)
