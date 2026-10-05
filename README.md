<div align="center">

<h1 align="center"><img src="app-icon.svg" alt="" width="64" valign="middle"> Mindrizzle</h1>

**Catch your mind drizzle.**<br>
**让想法有处可落，让笔记自然成形。**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB.svg)](https://tauri.app/)
[![Vue](https://img.shields.io/badge/Vue-3-42B883.svg)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-runtime-000000.svg)](https://bun.sh/)
[![Version](https://img.shields.io/badge/version-alpha_0.0.1-orange.svg)](package.json)
[![Top Language](https://img.shields.io/github/languages/top/LogicAurora/Mindrizzle.svg)](https://github.com/LogicAurora/Mindrizzle)
[![GitHub Stars](https://img.shields.io/github/stars/LogicAurora/Mindrizzle.svg?style=flat)](https://github.com/LogicAurora/Mindrizzle/stargazers)
[![Commit Activity](https://img.shields.io/github/commit-activity/y/LogicAurora/Mindrizzle.svg)](https://github.com/LogicAurora/Mindrizzle/commits/main/)
[![Visitors](https://komarev.com/ghpvc/?username=LogicAurora&repo=Mindrizzle&label=visitors&color=blue)](https://github.com/LogicAurora/Mindrizzle)

</div>

Mindrizzle 是一款桌面优先的画布式笔记应用，适合那些还没准备好排成章节、却值得先记下来的想法。与必须从标题一路写到结尾的长文档不同，Mindrizzle 把笔记拆成可以独立编辑和移动的内容块，让记录顺序不必等于最终结构。

你可以先写下一句问题，再补上相关解释、代码片段或数学公式；当它们之间的联系逐渐清晰时，再把内容块移动、缩放、排列或联结起来。画布可以平移和缩放，因此笔记既能从一个局部开始，也能逐步展开成更大的思路图。无需先想好完整提纲，整理本身就是记录过程的一部分。

它可以用于课程与阅读笔记：把概念、例子、公式放在一起对照；也可以用于项目探索：在同一画布上并排记录问题、实现片段和待确认的想法。对于灵感收集，则可以先把零散念头放下来，等有空时再重新组织。Mindrizzle 更适合开放式草稿和可视化整理，而不是替代需要严格章节结构的正式文档。

项目仍处于早期迭代阶段，界面、交互与文件格式可能继续调整。欢迎试用、反馈问题，或通过 Issue 和 Pull Request 参与改进。

## 功能概览

- **自由画布**：创建、移动、缩放和排列内容块；支持框选、块间联结以及桌面布局整理。
- **富文本**：支持标题、列表、引用、粗体、斜体、下划线等格式，可插入行内公式和块级公式。
- **代码块**：提供代码编辑、语言选择、语法高亮和复制，支持 JavaScript、TypeScript、Python、HTML、CSS、JSON、Bash、C、C++、Java、Go、Rust、Vue、PHP、Ruby、Swift、Kotlin 与纯文本。
- **编辑控制**：可切换编辑/只读模式、删除选中块、调整画布缩放，并模拟移动端布局。
- **主题设置**：支持浅色、深色、跟随系统，以及自定义主题主色。
- **本地存档**：Tauri 桌面版在本机读写 `.mdrf` 笔记文件，不需要云端账号。

便签集页面可创建笔记并查看标题、描述和上次编辑时间。**记事板页面目前仍是开发占位页，尚未提供完整功能。**

## 使用方式

1. 在便签集页面新建笔记，填写标题、描述和文件名；文件名留空时会自动生成。
2. 进入笔记后，在画布空白处添加富文本块或代码块，再编辑内容并按需拖动、缩放和排列。
3. 选中富文本块后，可使用格式操作；选择代码块可编辑代码、切换语言或复制内容。
4. 点击工具栏的保存按钮，将当前正文写入存档。

## 数据与文件

桌面版的 `.mdrf` 是 Mindrizzle 使用的本地笔记归档，包含笔记元信息与正文。保存时会更新归档文件；Rust 文件层使用临时文件写入后再替换原文件，以降低写入中断导致损坏的风险。

通过 `bun run dev` 在浏览器中预览时，文件层命令由浏览器端存储实现，笔记保存在当前浏览器站点的 `localStorage` 中。浏览器预览数据与桌面版 `.mdrf` 文件彼此独立；清理浏览器站点数据会影响预览笔记。浏览器预览不是 `.mdrf` 文件的导入或导出工具。

## 技术栈

- **前端**：Vue 3、TypeScript、Vite、Vuetify
- **富文本编辑器**：ProseKit、ProseMirror、KaTeX、DOMPurify
- **桌面应用**：Tauri 2
- **文件层**：Rust、Tokio、quick-xml、tar、flate2
- **代码高亮**：highlight.js

## 开始开发

### 环境要求

- [Bun](https://bun.sh/)
- [Rust 工具链](https://www.rust-lang.org/tools/install)
- Tauri 2 所需的系统依赖。Linux 依赖因发行版而异，请参考 [Tauri 前置要求](https://v2.tauri.app/start/prerequisites/)。

### 安装依赖

```bash
bun install
```

### 浏览器预览

```bash
bun run dev
```

Vite 默认在 `http://localhost:1420` 启动。浏览器模式适合检查前端界面与交互；笔记写入浏览器 `localStorage`，不会创建桌面 `.mdrf` 文件。

### 启动桌面应用

```bash
bun run tauri dev
```

### 检查与构建

```bash
# TypeScript 检查
bunx tsc --noEmit

# Vite 前端构建
bunx vite build

# Rust 检查
cd src-tauri && cargo check
```

`bun run build` 会依次运行 Vue/TypeScript 类型检查和 Vite 构建。项目使用 TypeScript 6.0.x，以兼容当前 `vue-tsc` 使用的编译器入口；升级 TypeScript 时也需要确认 `vue-tsc` 支持对应版本。Tauri 打包配置同样会调用 `bun run build`。

修改 Rust 文件归档逻辑后，运行 Rust 测试：

```bash
cd src-tauri && cargo test
```

## 项目结构

```text
src/
├── Controls/              # 画布、富文本编辑器、代码块与对话框
├── Views/                 # 便签集、编辑器、设置与调试页面
├── utils/                 # 画布坐标、路由、存储与 Tauri 调用封装
└── App.vue                # 应用外壳与导航

src-tauri/src/
├── mdr_file_*.rs          # .mdrf 文件、缓存、目录与归档操作
└── main.rs / lib.rs       # Tauri 应用入口

src/docs/flow/             # 画布与编辑器流程文档
```

## 参与贡献

欢迎通过 [Issues](https://github.com/LogicAurora/Mindrizzle/issues) 报告问题或提出想法，也欢迎提交 Pull Request。提交前请根据改动范围运行前端类型检查、Vite 构建或 Rust 检查；涉及画布与编辑器交互时，也请同步维护 `src/docs/flow` 中的流程文档。

## 许可证

Mindrizzle 采用 [GNU General Public License v3.0](LICENSE)。

<h2 align="center">贡献者</h2>

<p align="center">
	<a href="https://github.com/LogicAurora/Mindrizzle/graphs/contributors">
		<img src="https://contrib.rocks/image?repo=LogicAurora/Mindrizzle" alt="Mindrizzle contributors" />
	</a>
</p>

<p align="center">
	<a href="https://github.com/LogicAurora/Mindrizzle">
		&#9733; 给 Mindrizzle 点个 Star
	</a>
</p>