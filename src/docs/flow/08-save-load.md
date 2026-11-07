<!-- 最后验证: 2026-11-07 -->

# 08 序列化与加载

## 图 8.1 save 数据流

```mermaid
flowchart TD
  A["save()"] --> B["syncComponentData 拉取各组件 saveConfig"]
  B --> C["计算块群包围盒中心 cx, cy"]
  C --> D["toSaveRect 相对 origin + pan - 中心"]
  D --> E["序列化 items（单一 layout）"]
  E --> F["序列化 origin + links + annotations"]
  F --> G["返回 JSON 字符串"]
```

## 图 8.2 load 数据流

```mermaid
flowchart TD
  A["load(raw)"] --> B["JSON.parse"]
  B --> C{"格式？"}
  C -->|数组| D["state.items = map(normalizeLoadedItem)"]
  C -->|含 items| E["读取 origin + items"]
  E --> F["map(normalizeLoadedItem)"]
  D --> G["pan = 0"]
  F --> G
  G --> H["清 virtualSnapshots / virtualScrolls"]
  H --> I["reconcileVirtualBlocks 首次定虚拟集"]
  I --> J["linkedPairs + annotations 恢复"]
  J --> K["nextTick × 2"]
  K --> L["autoArrange"]
  L --> M["reconcileVirtualBlocks 二次定虚拟集"]
  M --> N["loadConfig 各组件"]
  N --> O["recomputeMasks"]
```

## 图 8.3 normalizeLoadedItem 数据分支

```mermaid
flowchart TD
  A["normalizeLoadedItem(it)"] --> B["component 未知则回落 RichTextEditor"]
  B --> C{"isLegacyFlat?"}
  C -->|是| D["用 it.x/y/w/h 构造 layout"]
  C -->|否| E["读取 it.layout.desktop 或 it.layout"]
  D --> F["补默认尺寸"]
  E --> F
  F --> G["坐标类型兜底归 0"]
  G --> H["读取 arranged"]
  H --> I["markRaw 返回"]
```

## 组件私有文件（ComponentsData）

- 归档内固定结构：`meta.json`、`body.json`、`ComponentsData/<组件 UUID>/<相对路径>`，随 `.mdrf` 一起打包。
- 前端唯一入口 `src/utils/componentDataStore.ts`，URL 形如 `mdrfcd://<笔记名>/<组件 UUID>/<相对路径>`。
- 写入/删除：与正文共用同一份命名缓存（命中则不解包）→ 改文件 → 原子重打包，不再额外失效暂存区。
- 读取/list/exists 直接从归档流里找条目，不落盘。

## 图 8.5 归档读写与缓存

```mermaid
flowchart TD
  subgraph 读路径
    L["fetch_file_list（目录扫描）"] --> M["get_mdr_file_meta"]
    M --> M1{"缓存签名匹配？"}
    M1 -->|是| M2["直读缓存 meta.json"]
    M1 -->|否| M3["extract_meta 流式扫描到 meta.json"]
    D["get_mdr_file_body"] --> D1{"缓存签名匹配？"}
    D1 -->|是| D2["直读缓存 body.json"]
    D1 -->|否| D3["整包解包到命名缓存 + 写签名"]
  end
  subgraph 写路径
    W["set_mdr_file_body / set_mdr_file_meta / 组件数据写删"] --> W1["open_note_cache"]
    W1 --> W2["改缓存内文件"]
    W2 --> W3["pack_cache_atomic 整包重写"]
    W3 --> W4["刷新缓存签名"]
  end
```

- 缓存目录 `Mindrizzle_<pid>_<归档路径>` 跨调用存活；签名文件 `<目录>.synced` 记录归档大小与 mtime，
  放在目录外避免被 `pack_cache` 打进 `.mdrf`。归档被外部改写时签名不匹配，自动整包重解。
- **打包不可省**：`.mdrf` 是整包 tar(+gzip)，任何写入都要全量重写；优化点只在「不重复解包」——
  打开→保存→关闭→再打开只需一次解包。
- 失效点：`move_*` / `delete_mdrf_file` 调 `invalidate_named`；`rename_mdrf_file` 把缓存目录一起改名（签名不变，继续可用），
  需要同时改标题时在改名前后的同一份缓存上再打包一次。
- 重命名只在「标题 == 旧文件名」时才传 `mdrFileInfo`，用户自定义过标题的笔记纯改名不会整包重写。

## 笔记定位（工作区 / 外部文件）

- 前端文件接口集中在 `src/fileOperations/`：`types.ts` 定义请求类型，`index.ts` 路由到 Tauri IPC 或浏览器端 `browserStore.ts`；界面层使用命名方法，不直接传命令名和参数对象。
- 默认工作区：只传 `fileName`，后端拼到用户文档目录 `Mindrizzle/`。
- 自定义工作区：额外传 `dir`（绝对目录），归档为 `dir/<fileName>.mdrf`。
- 外部文件：传 `filePath`（绝对路径），后端直接读写该归档，保存写回原文件。
- `fetch_file_list` / `is_file_name_valid` / `create_mdr_file` / `get|set_mdr_file_body` / 组件数据命令均接受同一组定位参数；缓存键改用归档绝对路径，避免不同工作区同名笔记互相覆盖。
- 网页端上传的 `.mdrf` 解包后只作为**外部文件副本**存进 IndexedDB（不写文件索引），打开与保存都按副本名读写。
- 「移动到工作区」：桌面端由 `move_mdrf_file` 把归档移进目标目录并从外部列表移除；网页端 `moveLocalNoteToWorkspace` 把副本名补进文件索引。

## 图 8.4 跨画布剪贴板

```mermaid
flowchart TD
  A["copySelection()"] --> B["选中块快照 + 选中集内的 links"]
  B --> C["pushClipboardEntry 补 source/createdAt"]
  C --> D["localStorage 持久化，最多 20 条"]
  D --> E["pasteBlocks(entry)"]
  E --> F{"来源笔记 == 当前笔记？"}
  F -->|是| G["原坐标起步，与现有块重叠则 +32 递推"]
  F -->|否| H["落到当前视口中心"]
  G --> I["新 uuid 建块"]
  H --> I
  I --> J["copyComponentFiles 按 source 搬资产"]
  J --> K["links 映射到新 uuid"]
  K --> L["选中新块 + recomputeMasks"]
```

- 剪贴板是应用级共享数据（`src/utils/blockClipboard.ts`），跨便签保留历史；内容相同的复制只刷新时间并提到最前。
- 块只看 `config` / `layout` / `arranged`，不依赖原块实例；粘贴后原块再改不会影响已复制内容。
- 资产文件按 `source`（fileName + dir/filePath）定位：`ComponentDataStore` 支持显式传入来源笔记，`copyComponentFiles` 从源笔记读、写入当前笔记。

## 兼容规则速查

- 块标识字段为 `uuid`（放置时生成、持久化），不做旧 `id` 字段兼容
- 旧扁平格式（`it.x/y/w/h`）→ 转为 `layout`
- `origin` 坐标归一化：保存时减去块群中心，加载时归零 pan；批注笔画点走同一偏移
- 批注 `annotations` 缺失时视为空数组；连接线两端块不存在时丢弃
- 旧双布局数据只读取 `layout.desktop`，移动端布局直接丢弃
- 旧对象型 `arranged` 只读取 `desktop` 状态
- 旧剪贴板条目不含单一布局时直接丢弃

## 维护提示

- 新增字段 → 更新图 8.1、8.3
- 改兼容规则 → 更新图 8.3 + 加测试
- 改复制/粘贴语义 → 更新图 8.4
- 改批注结构 → 更新图 8.1、8.2 与 12-annotation
