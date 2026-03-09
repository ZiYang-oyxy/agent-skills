---
name: mermaid-sop-check
description: Focused SOP for writing Mermaid and preventing rendering failures with mermaid-cli. Use when Codex creates or edits Mermaid diagrams, validates standalone .mmd files, validates Mermaid code blocks embedded in Markdown, or debugs Mermaid parse/render errors before delivery.
---

# Mermaid SOP

## 安装与环境确认

先全局安装 Mermaid CLI：

```bash
npm install -g @mermaid-js/mermaid-cli
```

确认命令可用：

```bash
mmdc -V
```

## 执行步骤

1. 编写 Mermaid 图。
2. 做一次“常见语法坑”自检。
3. 运行 `mmdc` 渲染检查。
4. 若失败，先修语法再重跑，直到退出码为 `0`。

## 常见语法坑（优先排查）

- 声明行缺失或拼写错误（例如 `flowchart TD`、`sequenceDiagram`、`classDiagram`）。
- 图类型与语法混用（例如在 `flowchart` 中写 `sequence` 语法）。
- `flowchart` 中使用裸 `end` 导致解析异常（改词或加引号）。
- 节点文本包含特殊字符但未加引号。
- `%%` 注释写法或位置不当导致解析异常。

## mmdc 检查命令

检查单个 `.mmd` 文件：

```bash
mmdc -i <file.mmd> -o /tmp/<name>.svg -q
```

检查 Markdown 中的 Mermaid 代码块（```mermaid ... ```）：

```bash
mmdc -i <doc.md> -o /tmp/<name>.check.md -a /tmp/<name>-artefacts -q
```

## 失败处理顺序

1. 先回到“常见语法坑”逐项排查。
2. 用最小改动修复单一问题后立刻重跑 `mmdc`。
3. 仅在命令成功（退出码 `0`）后再继续后续工作。

## 交付前检查

- 对每个新增或修改的 Mermaid 图至少运行一次 `mmdc`。
- 不跳过 Markdown 内嵌 Mermaid 的检查。
- 不以“肉眼阅读通过”替代 `mmdc` 实际渲染。
