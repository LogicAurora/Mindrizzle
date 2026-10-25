<!-- 最后验证: 2026-10-25 -->
# 06 私有文件

附件、图片、大文本放 `ctx.files`，文件落在当前 `.mdrf` 的 `ComponentsData/<uuid>/`，随笔记一起走。

```ts
const files = ctx.files
await files.write('assets/rows.json', JSON.stringify({ rows }))
const rows = JSON.parse(await files.readText('assets/rows.json'))
const list = await files.list()
const imageUrl = files.url('assets/cover.png') // 直接给 <img :src>
```

| 方法 | 说明 |
| --- | --- |
| `url(path)` | 生成 `mdrfcd://<笔记名>/<uuid>/<path>` |
| `write(path, string \| Uint8Array)` | 写入文本或二进制，单文件上限 64 MiB |
| `readText(path)` | 读 UTF-8 文本 |
| `readBinary(path)` | 读二进制 |
| `list()` | 列出本块目录下的相对路径 |
| `remove(path)` | 删除（不存在时无操作） |
| `exists(path)` | 是否存在 |
| `exportTo(path, targetPath)` | 桌面端另存到用户选定路径（路径由保存对话框给出） |

## 导出给用户

`exportTo` 只在桌面端可用；网页端没有文件系统，自己把 `readBinary` 的结果包成 Blob 下载。
用户选的路径可能含中文与空格，直接丢给 `exportTo` 即可，Rust 侧只校验非空与绝对路径。

```ts
const bytes = await ctx.files.readBinary('file.bin')
if (isTauri()) {
  const target = await save({ defaultPath: name })
  if (target) await ctx.files.exportTo('file.bin', target)
} else {
  downloadBlob(bytes, name)
}
```

## 存图片

```ts
const buffer = new Uint8Array(await file.arrayBuffer())
await ctx.files.write(`images/${Date.now()}.png`, buffer)
ctx.setConfig({ path: `images/${Date.now()}.png` })
```

`config` 里只存相对路径，渲染时 `ctx.files.url(path)` 现拼 URL。不要手写 `mdrfcd://` 字符串。

## 注意

- 路径不得含 `..`、反斜杠与平台非法字符；不允许绝对路径。
- **写入会重打整个归档**：不要在逐帧或每次按键里调用，缓存后防抖再写。
- 单文件上限 64 MiB，超出请换存储方式或拆分。
- 只读态下 store 不做拦截，需要组件自己判断 `ctx.readOnly` 再决定是否写入。

## 和 config 的分工

| 数据 | 放哪 |
| --- | --- |
| 开关、选项、短文本、小数组 | `config` |
| 图片、附件、长文本、二进制 | `ctx.files` |
| 纯 UI 状态（展开、草稿、加载中） | 组件内 `ref` |
