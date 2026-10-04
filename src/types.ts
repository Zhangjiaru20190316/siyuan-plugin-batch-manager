/** 笔记本（来自 /api/notebook/lsNotebooks，已过滤 closed） */
export interface NotebookItem {
    id: string;
    name: string;
    icon?: string;
    closed?: boolean;
    /** 笔记本内文档数（部分版本返回） */
    count?: number;
}

/** 文档（统一模型：树形浏览与 SQL 筛选两种来源都映射到该结构） */
export interface DocItem {
    id: string;
    /** 展示名（已去除 .sy 后缀） */
    name: string;
    /** 所属笔记本 id（box） */
    notebook: string;
    /** 文档树路径，如 /20240101120000-abcdef.sy */
    path: string;
    /** 子文档数（SQL 结果中无此字段） */
    subFileCount?: number;
    /** 创建时间 YYYYMMDDHHmmss（SQL 结果） */
    created?: string;
    /** 更新时间 YYYYMMDDHHmmss（SQL 结果） */
    updated?: string;
    /** 创建时间 unix 秒（listDocsByPath 结果） */
    ctime?: number;
    /** 更新时间 unix 秒（listDocsByPath 结果） */
    mtime?: number;
    /** 人类可读路径（SQL 结果） */
    hPath?: string;
}

/** 表格行：DocItem + 树形展示所需字段 */
export interface DocRow extends DocItem {
    depth: number;
    /** 是否可展开（树形模式且 subFileCount > 0） */
    expandable: boolean;
    expanded: boolean;
    /** 子文档是否已加载 */
    childrenLoaded: boolean;
    /** 用于"路径"列显示：笔记本名 / 父链 / 文档名 */
    trail: string;
}

/** 单篇文档操作结果 */
export interface OpResult {
    id: string;
    name: string;
    ok: boolean;
    msg?: string;
}

/** 插件设置 */
export interface BatchSettings {
    /** 删除确认框中"彻底删除"默认勾选状态 */
    directDelete: boolean;
    /** 批量操作并发数（1~3） */
    concurrency: number;
}

/** 筛选条件 */
export interface DocFilters {
    /** 笔记本 id，空串表示全部 */
    notebook: string;
    /** 标题关键字（content LIKE） */
    kw: string;
    /** 更新时间起，yyyy-MM-dd，空串不启用 */
    from: string;
    /** 更新时间止，yyyy-MM-dd，空串不启用 */
    to: string;
}
