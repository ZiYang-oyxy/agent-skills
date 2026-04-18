#!/usr/bin/env node

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const homeDir = os.homedir();
const templatePath = new URL("../assets/offline_recap_template.html", import.meta.url);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Missing required --input path");
  }

  const inputPath = path.resolve(expandHome(args.input));
  const data = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const outPath = args.out
    ? path.resolve(expandHome(args.out))
    : defaultOutputPath(data);

  const template = await fs.readFile(templatePath, "utf8");
  const html = render(template, data);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, html, "utf8");
  process.stdout.write(`${outPath}\n`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      args[key] = value;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }
  if (inputPath === "~") {
    return homeDir;
  }
  if (inputPath.startsWith("~/")) {
    return path.join(homeDir, inputPath.slice(2));
  }
  return inputPath;
}

function defaultOutputPath(data) {
  const startedAt = new Date(data.startedAt ?? Date.now());
  const stamp = [
    startedAt.getFullYear(),
    String(startedAt.getMonth() + 1).padStart(2, "0"),
    String(startedAt.getDate()).padStart(2, "0"),
    "-",
    String(startedAt.getHours()).padStart(2, "0"),
    String(startedAt.getMinutes()).padStart(2, "0"),
    String(startedAt.getSeconds()).padStart(2, "0"),
  ].join("");
  const threadId = sanitizeFilename(data.sessionId ?? "session");
  return path.join(homeDir, "tmp", "codex-session-recaps", `${stamp}-${threadId}.html`);
}

function render(template, data) {
  const title = escapeHtml(data.titleCandidate || "Codex 会话回放");
  const subtitle = escapeHtml(
    `按时间回放线程 ${data.sessionId ?? "未知"} 的完整对话过程，包含用户提问、Codex 回应、工具调用和最终结果。`,
  );
  const warningsHtml = data.warnings?.length
    ? `<div class="warning-box"><h3>注意事项</h3>${data.warnings
        .map((warning) => `<p>${escapeHtml(warning)}</p>`)
        .join("")}</div>`
    : "";
  const badgesHtml = [
    badge(`线程 ${data.sessionId ?? "未知"}`),
    badge(`来源 ${data.sourceResolution ?? "未知"}`),
    badge(`命令行版本 ${data.cliVersion ?? "未知"}`),
    badge(`模型提供方 ${data.modelProvider ?? "未知"}`),
  ].join("");
  const metaHtml = [
    stat("开始时间", formatDateTime(data.startedAt)),
    stat("更新时间", formatDateTime(data.updatedAt)),
    stat("工具调用", String(data.stats?.toolCalls ?? 0)),
    stat("产物数量", String(data.stats?.artifacts ?? 0)),
  ].join("");
  const replayHtml = renderReplay(data);
  const summaryCardsHtml = (data.summaryFacts ?? [])
    .map(
      (fact) => `
        <article class="summary-card">
          <p>${escapeHtml(fact)}</p>
        </article>`,
    )
    .join("");
  const artifactRailHtml = data.artifacts?.length
    ? data.artifacts
        .map(
          (item) => `
            <article class="artifact-card">
              <div class="card-eyebrow">${escapeHtml(item.kind ?? "artifact")}</div>
              <h3>${escapeHtml(path.basename(item.path))}</h3>
              <div class="artifact-meta">${escapeHtml(formatDateTime(item.modifiedAt))}</div>
              <a class="path-link" href="${escapeAttribute(toFileHref(item.path))}">${escapeHtml(item.path)}</a>
            </article>`,
        )
        .join("")
    : `<article class="artifact-card"><h3>未发现产物路径</h3><p>采集器没有找到适合在回放页展示的稳定输出文件。</p></article>`;
  const detailsHtml = renderDetails(data);

  return template
    .replaceAll("__TITLE__", title)
    .replaceAll("__HERO_KICKER__", "Codex 会话回放")
    .replaceAll("__HERO_TITLE__", title)
    .replaceAll("__HERO_SUBTITLE__", subtitle)
    .replaceAll("__META_HTML__", metaHtml)
    .replaceAll("__WARNINGS_HTML__", warningsHtml)
    .replaceAll("__SUMMARY_HTML__", summaryCardsHtml)
    .replaceAll("__BADGES_HTML__", badgesHtml)
    .replaceAll("__REPLAY_HTML__", replayHtml)
    .replaceAll("__ARTIFACT_RAIL_HTML__", artifactRailHtml)
    .replaceAll("__DETAILS_HTML__", detailsHtml);
}

function renderReplay(data) {
  const replayItems = buildReplayItems(data);
  if (!replayItems.length) {
    return `<article class="message-block assistant-block"><div class="message-shell"><div class="message-head"><span class="speaker">助手</span></div><div class="message-body"><p>所选会话中没有可回放的事件。</p></div></div></article>`;
  }

  return replayItems
    .map((item) => {
      if (item.kind === "tool") {
        return renderToolBlock(item);
      }
      return renderMessageBlock(item);
    })
    .join("");
}

function buildReplayItems(data) {
  const transcriptItems = (data.transcript ?? []).map((item, index) => ({
    ...item,
    kind: "message",
    order: index,
  }));
  const toolItems = (data.toolEvents ?? []).map((item, index) => ({
    ...item,
    kind: "tool",
    order: index,
  }));
  return [...transcriptItems, ...toolItems].sort((a, b) => {
    const left = a.timestamp ?? "";
    const right = b.timestamp ?? "";
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    if (a.kind !== b.kind) {
      return a.kind === "message" ? -1 : 1;
    }
    return a.order - b.order;
  });
}

function renderMessageBlock(item) {
  const roleClass = item.role === "user" ? "user-block" : "assistant-block";
  const speaker = item.role === "user" ? "用户" : "助手";
  const phaseLabel = item.role === "assistant" ? phaseBadge(item.phase) : "";
  return `
    <article class="message-block ${roleClass}">
      <div class="message-shell">
        <div class="message-head">
          <span class="speaker">${escapeHtml(speaker)}</span>
          ${phaseLabel}
          <span class="message-time">${escapeHtml(formatDateTime(item.timestamp))}</span>
        </div>
        <div class="message-body markdown-body">${renderMarkdown(item.text)}</div>
      </div>
    </article>`;
}

function renderToolBlock(item) {
  const argumentPreview = item.details?.arguments ? `<pre>${escapeHtml(item.details.arguments)}</pre>` : "";
  const outputPreview = item.details?.output ? `<pre>${escapeHtml(item.details.output)}</pre>` : "";
  return `
    <article class="tool-block">
      <div class="tool-shell">
        <div class="tool-head">
          <span class="speaker">工具</span>
          <span class="tool-name">${escapeHtml(item.title ?? "工具事件")}</span>
          <span class="message-time">${escapeHtml(formatDateTime(item.timestamp))}</span>
        </div>
        <p class="tool-summary">${escapeHtml(item.summary ?? "")}</p>
        <details>
          <summary>查看命令与输出</summary>
          ${argumentPreview}
          ${outputPreview}
        </details>
      </div>
    </article>`;
}

function renderDetails(data) {
  const sections = [];

  sections.push(`
    <details open>
      <summary>会话元数据</summary>
      <pre>${escapeHtml(
        JSON.stringify(
          {
            sessionId: data.sessionId,
            rolloutPath: data.rolloutPath,
            sourceResolution: data.sourceResolution,
            cwd: data.cwd,
            startedAt: data.startedAt,
            updatedAt: data.updatedAt,
          },
          null,
          2,
        ),
      )}</pre>
    </details>`);

  const transcriptItems = data.transcript ?? [];
  if (transcriptItems.length) {
    sections.push(`
      <details>
        <summary>对话摘录</summary>
        <pre>${escapeHtml(
          transcriptItems
            .map(
              (item) =>
                `[${formatDateTime(item.timestamp)}] ${localizeRole(item.role)} (${localizePhase(item.phase)})\n${item.text}\n`,
            )
            .join("\n"),
        )}</pre>
      </details>`);
  }

  const evidenceItems = data.evidence ?? [];
  if (evidenceItems.length) {
    sections.push(`
      <details>
        <summary>工具调用摘录</summary>
        <pre>${escapeHtml(
          evidenceItems
            .map((item) => {
              const args = item.details?.arguments ? `参数:\n${item.details.arguments}\n\n` : "";
              const output = item.details?.output ? `输出:\n${item.details.output}\n` : "";
              return `${item.title}\n${args}${output}`.trim();
            })
            .join("\n\n---\n\n"),
        )}</pre>
      </details>`);
  }

  return sections.join("");
}

function stat(label, value) {
  return `
    <article class="stat">
      <span class="stat-label">${escapeHtml(label)}</span>
      <span class="stat-value">${escapeHtml(value)}</span>
    </article>`;
}

function badge(value) {
  return `<span class="badge">${escapeHtml(value)}</span>`;
}

function phaseBadge(value) {
  if (!value) {
    return "";
  }
  const label = localizePhase(value);
  return `<span class="phase-tag">${escapeHtml(label)}</span>`;
}

function localizeRole(value) {
  if (value === "user") {
    return "用户";
  }
  if (value === "assistant") {
    return "助手";
  }
  return value ?? "未知";
}

function localizePhase(value) {
  if (value === "final" || value === "final_answer") {
    return "最终答复";
  }
  if (value === "commentary") {
    return "过程说明";
  }
  if (value === "message") {
    return "消息";
  }
  return value ?? "未知";
}


function renderMarkdown(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      const langLabel = language ? `<div class="code-lang">${escapeHtml(language)}</div>` : "";
      blocks.push(`<div class="code-block">${langLabel}<pre>${escapeHtml(codeLines.join("\n"))}</pre></div>`);
      continue;
    }

    if (isTableHeader(lines, index)) {
      const tableLines = [lines[index]];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderTable(tableLines));
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length + 1, 6);
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${renderMarkdown(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    if (isListLine(line)) {
      const renderedList = renderList(lines, index, getLeadingSpaces(line));
      blocks.push(renderedList.html);
      index = renderedList.nextIndex;
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index];
      const nextTrimmed = next.trim();
      if (
        !nextTrimmed ||
        nextTrimmed.startsWith("```") ||
        /^(#{1,6})\s+/.test(nextTrimmed) ||
        /^>\s?/.test(nextTrimmed) ||
        /^[-*+]\s+/.test(nextTrimmed) ||
        /^\d+\.\s+/.test(nextTrimmed) ||
        /^---+$/.test(nextTrimmed) ||
        /^\*\*\*+$/.test(nextTrimmed) ||
        isTableHeader(lines, index)
      ) {
        break;
      }
      paragraphLines.push(next);
      index += 1;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraphLines.join("\n"))}</p>`);
  }

  return blocks.join("");
}

function renderInlineMarkdown(text) {
  const placeholders = [];
  let working = escapeHtml(text ?? "");

  working = working.replace(/`([^`]+)`/g, (_, code) => storePlaceholder(placeholders, `<code>${escapeHtml(code)}</code>`));
  working = working.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safeHref = sanitizeHref(href);
    return storePlaceholder(
      placeholders,
      `<a href="${escapeAttribute(safeHref)}" target="_blank" rel="noreferrer">${renderInlineMarkdown(label)}</a>`,
    );
  });
  working = working.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  working = working.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  working = working.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
  working = working.replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
  working = working.replace(/\n/g, "<br>");

  return restorePlaceholders(working, placeholders);
}

function renderTable(tableLines) {
  const rows = tableLines.map((line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim()),
  );

  const header = rows[0];
  const body = rows.slice(1);
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead>
        <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function renderList(lines, startIndex, baseIndent) {
  const firstMarker = parseListMarker(lines[startIndex]);
  const listTag = firstMarker?.ordered ? "ol" : "ul";
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    while (index < lines.length && !lines[index].trim()) {
      index += 1;
    }
    if (index >= lines.length) {
      break;
    }

    const marker = parseListMarker(lines[index]);
    if (!marker || marker.indent < baseIndent) {
      break;
    }
    if (marker.indent > baseIndent) {
      break;
    }
    if (marker.ordered !== firstMarker.ordered) {
      break;
    }

    index += 1;
    const contentLines = [marker.content];
    const childBlocks = [];

    while (index < lines.length) {
      const nextLine = lines[index];
      const nextTrimmed = nextLine.trim();

      if (!nextTrimmed) {
        index += 1;
        if (index < lines.length && isListLine(lines[index]) && getLeadingSpaces(lines[index]) > baseIndent) {
          continue;
        }
        break;
      }

      const nextMarker = parseListMarker(nextLine);
      const nextIndent = getLeadingSpaces(nextLine);

      if (nextMarker) {
        if (nextIndent === baseIndent) {
          break;
        }
        if (nextIndent > baseIndent) {
          const nested = renderList(lines, index, nextIndent);
          childBlocks.push(nested.html);
          index = nested.nextIndex;
          continue;
        }
      }

      if (nextIndent <= baseIndent) {
        break;
      }

      contentLines.push(nextLine.slice(Math.min(nextLine.length, baseIndent + 2)).trimEnd());
      index += 1;
    }

    const contentHtml = contentLines.filter(Boolean).length
      ? renderInlineMarkdown(contentLines.join("\n"))
      : "";
    items.push(`<li>${contentHtml}${childBlocks.join("")}</li>`);
  }

  return {
    html: `<${listTag}>${items.join("")}</${listTag}>`,
    nextIndex: index,
  };
}

function isTableHeader(lines, index) {
  if (index + 1 >= lines.length) {
    return false;
  }
  const header = lines[index].trim();
  const separator = lines[index + 1].trim();
  return header.includes("|") && /^[:|\-\s]+$/.test(separator) && separator.includes("-");
}

function isListLine(line) {
  return Boolean(parseListMarker(line));
}

function parseListMarker(line) {
  const match = String(line ?? "").match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
  if (!match) {
    return null;
  }
  return {
    indent: match[1].length,
    ordered: /\d+\./.test(match[2]),
    content: match[3],
  };
}

function getLeadingSpaces(line) {
  const match = String(line ?? "").match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function sanitizeHref(href) {
  const raw = String(href ?? "").trim();
  if (!raw) {
    return "#";
  }
  if (/^(https?:|file:|mailto:)/i.test(raw)) {
    return raw;
  }
  if (raw.startsWith("/")) {
    return `file://${raw}`;
  }
  return raw;
}

function storePlaceholder(placeholders, html) {
  const key = `@@PLACEHOLDER_${placeholders.length}@@`;
  placeholders.push({ key, html });
  return key;
}

function restorePlaceholders(text, placeholders) {
  return placeholders.reduce((acc, item) => acc.replaceAll(item.key, item.html), text);
}

function formatDateTime(value) {
  if (!value) {
    return "unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(input) {
  return escapeHtml(input).replaceAll("`", "&#96;");
}

function sanitizeFilename(input) {
  return String(input ?? "session").replace(/[^A-Za-z0-9._-]+/g, "-");
}

function toFileHref(filePath) {
  return `file://${filePath}`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
