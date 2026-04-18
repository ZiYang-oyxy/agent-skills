#!/usr/bin/env node

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const homeDir = os.homedir();
const codexHome = process.env.CODEX_HOME
  ? expandHome(process.env.CODEX_HOME)
  : path.join(homeDir, ".codex");
const sessionsRoot = path.join(codexHome, "sessions");
const skillRoot = path.join(homeDir, ".agents", "skills", "session-html-recap");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessionSpec = args.session ?? "current";
  const cwd = args.cwd ? path.resolve(expandHome(args.cwd)) : process.cwd();
  const outPath = args.out ? path.resolve(expandHome(args.out)) : null;

  const warnings = [];
  const resolution = await resolveSessionFile(sessionSpec, cwd, warnings);
  const parsed = await parseRollout(resolution.rolloutPath, warnings);
  const artifacts = await collectArtifacts(parsed.pathCandidates, parsed.meta?.cwd ?? cwd, resolution.rolloutPath);

  const data = {
    sessionId: parsed.meta?.id ?? resolution.threadId ?? "unknown",
    rolloutPath: resolution.rolloutPath,
    sourceResolution: resolution.sourceResolution,
    cwd: parsed.meta?.cwd ?? cwd,
    startedAt: parsed.meta?.timestamp ?? parsed.startedAt ?? null,
    updatedAt: parsed.updatedAt ?? null,
    cliVersion: parsed.meta?.cli_version ?? null,
    modelProvider: parsed.meta?.model_provider ?? null,
    titleCandidate: buildTitle(parsed.transcript),
    summaryFacts: buildSummaryFacts(parsed, artifacts, resolution),
    warnings,
    stats: {
      userMessages: parsed.transcript.filter((item) => item.role === "user").length,
      assistantMessages: parsed.transcript.filter((item) => item.role === "assistant").length,
      toolCalls: parsed.toolEvents.length,
      artifacts: artifacts.length,
    },
    timeline: selectTimeline(parsed.timeline),
    evidence: parsed.toolEvents.slice(0, 9),
    transcript: parsed.transcript.slice(0, 160),
    toolEvents: parsed.toolEvents.slice(0, 240),
    artifacts,
  };

  const output = JSON.stringify(data, null, 2);
  if (outPath) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, output, "utf8");
  } else {
    process.stdout.write(`${output}\n`);
  }
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

async function resolveSessionFile(sessionSpec, cwd, warnings) {
  const files = await listRolloutFiles(sessionsRoot);
  if (files.length === 0) {
    throw new Error(`No Codex rollout files found under ${sessionsRoot}`);
  }

  if (sessionSpec === "current") {
    const threadId = process.env.CODEX_THREAD_ID;
    if (threadId) {
      const byThread = files.find((file) => file.includes(threadId));
      if (byThread) {
        return {
          rolloutPath: byThread,
          threadId,
          sourceResolution: "current-via-CODEX_THREAD_ID",
        };
      }
      warnings.push(`CODEX_THREAD_ID=${threadId} was present but no matching rollout file was found; falling back to cwd match.`);
    }
    const byCwd = await newestFileByMetaMatch(files, (meta) => meta?.cwd === cwd);
    if (byCwd) {
      return {
        rolloutPath: byCwd.path,
        threadId: byCwd.meta?.id ?? null,
        sourceResolution: "current-via-cwd-fallback",
      };
    }
    const newest = await newestFile(files);
    warnings.push(`No current-session match was found for cwd ${cwd}; using the latest rollout instead.`);
    return {
      rolloutPath: newest.path,
      threadId: newest.meta?.id ?? null,
      sourceResolution: "current-via-latest-fallback",
    };
  }

  if (sessionSpec === "last") {
    const newest = await newestFile(files);
    return {
      rolloutPath: newest.path,
      threadId: newest.meta?.id ?? null,
      sourceResolution: "last-via-mtime",
    };
  }

  const expandedSpec = expandHome(sessionSpec);
  if (await fileExists(expandedSpec)) {
    return {
      rolloutPath: path.resolve(expandedSpec),
      threadId: extractThreadIdFromPath(expandedSpec),
      sourceResolution: "explicit-rollout-path",
    };
  }

  const threadMatch = files.find((file) => file.includes(sessionSpec));
  if (threadMatch) {
    return {
      rolloutPath: threadMatch,
      threadId: sessionSpec,
      sourceResolution: "explicit-thread-id",
    };
  }

  const metaMatch = await newestFileByMetaMatch(files, (meta) => meta?.id === sessionSpec);
  if (metaMatch) {
    return {
      rolloutPath: metaMatch.path,
      threadId: sessionSpec,
      sourceResolution: "explicit-thread-id-meta",
    };
  }

  throw new Error(`Could not resolve session target: ${sessionSpec}`);
}

async function listRolloutFiles(root) {
  const results = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  }
  await walk(root);
  return results;
}

async function newestFile(files) {
  const stats = await Promise.all(
    files.map(async (file) => ({
      path: file,
      stat: await fs.stat(file),
      meta: await readSessionMeta(file),
    })),
  );
  stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return stats[0];
}

async function newestFileByMetaMatch(files, predicate) {
  const matches = [];
  for (const file of files) {
    const meta = await readSessionMeta(file);
    if (predicate(meta)) {
      const stat = await fs.stat(file);
      matches.push({ path: file, stat, meta });
    }
  }
  if (matches.length === 0) {
    return null;
  }
  matches.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return matches[0];
}

async function readSessionMeta(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  const firstLine = content.split("\n").find((line) => line.trim().length > 0);
  if (!firstLine) {
    return null;
  }
  try {
    const parsed = JSON.parse(firstLine);
    return parsed.type === "session_meta" ? parsed.payload : null;
  } catch {
    return null;
  }
}

async function parseRollout(filePath, warnings) {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  const transcript = [];
  const timeline = [];
  const toolEvents = [];
  const callsById = new Map();
  const pathCandidates = new Set();
  let meta = null;
  let startedAt = null;
  let updatedAt = null;

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      warnings.push(`Skipped an unparsable JSONL line in ${filePath}.`);
      continue;
    }

    const timestamp = entry.timestamp ?? null;
    if (!startedAt || (timestamp && timestamp < startedAt)) {
      startedAt = timestamp;
    }
    if (!updatedAt || (timestamp && timestamp > updatedAt)) {
      updatedAt = timestamp;
    }

    if (entry.type === "session_meta") {
      meta = entry.payload;
      continue;
    }

    if (entry.type === "response_item") {
      const payload = entry.payload ?? {};
      if (payload.type === "message" && (payload.role === "user" || payload.role === "assistant")) {
        const text = normalizeText(extractMessageText(payload.content));
        if (!text) {
          continue;
        }
        if (payload.role === "user" && isHarnessUserMessage(text)) {
          continue;
        }
        const phase = payload.phase ?? "message";
        transcript.push({
          role: payload.role,
          phase,
          timestamp,
          text: trimForDisplay(text, 2400),
        });
        timeline.push({
          kind: payload.role,
          title: payload.role === "user" ? "User prompt" : phase === "final" ? "Final answer" : "Assistant update",
          summary: summarizeText(text, payload.role === "user" ? 180 : 220),
          timestamp,
        });
        extractPaths(text).forEach((value) => pathCandidates.add(value));
        continue;
      }

      if (payload.type === "function_call") {
        const call = {
          callId: payload.call_id ?? null,
          name: payload.name ?? "unknown_tool",
          arguments: normalizeText(payload.arguments ?? ""),
          timestamp,
        };
        if (call.callId) {
          callsById.set(call.callId, call);
        }
        extractPaths(call.arguments).forEach((value) => pathCandidates.add(value));
        continue;
      }

      if (payload.type === "function_call_output") {
        const callId = payload.call_id ?? null;
        const prior = callId ? callsById.get(callId) : null;
        const outputText = normalizeText(
          typeof payload.output === "string" ? payload.output : JSON.stringify(payload.output ?? "", null, 2),
        );
        extractPaths(outputText).forEach((value) => pathCandidates.add(value));
        toolEvents.push({
          kind: "tool",
          title: prior ? prior.name : "Tool output",
          summary: summarizeToolOutput(prior?.arguments ?? "", outputText),
          timestamp,
          details: {
            callId,
            arguments: trimForDisplay(prior?.arguments ?? "", 1200),
            output: trimForDisplay(outputText, 1600),
          },
        });
        timeline.push({
          kind: "tool",
          title: prior ? `Tool: ${prior.name}` : "Tool output",
          summary: summarizeToolOutput(prior?.arguments ?? "", outputText),
          timestamp,
        });
      }
    }
  }

  return {
    meta,
    startedAt,
    updatedAt,
    transcript,
    timeline,
    toolEvents,
    pathCandidates,
  };
}

function extractMessageText(content) {
  if (!Array.isArray(content)) {
    return "";
  }
  const parts = [];
  for (const item of content) {
    if (!item || typeof item !== "object") {
      continue;
    }
    if (typeof item.text === "string") {
      parts.push(item.text);
      continue;
    }
    if (typeof item.content === "string") {
      parts.push(item.content);
    }
  }
  return parts.join("\n\n");
}

function normalizeText(input) {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimForDisplay(input, limit) {
  if (!input) {
    return "";
  }
  const masked = maskSecrets(input);
  if (masked.length <= limit) {
    return masked;
  }
  return `${masked.slice(0, limit)}\n\n...[truncated]`;
}

function summarizeText(input, limit) {
  const oneLine = maskSecrets(input).replace(/\s+/g, " ").trim();
  if (oneLine.length <= limit) {
    return oneLine;
  }
  return `${oneLine.slice(0, limit - 1)}...`;
}

function summarizeToolOutput(argumentsText, outputText) {
  const argSummary = summarizeText(argumentsText, 120);
  const outputSummary = summarizeText(outputText, 200);
  if (argSummary && outputSummary) {
    return `${argSummary} -> ${outputSummary}`;
  }
  return argSummary || outputSummary || "Tool call completed.";
}

function maskSecrets(input) {
  return String(input)
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "sk-****")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._-]{12,}\b/gi, "$1****")
    .replace(/\b([A-Za-z0-9_]{0,12}(?:api[_-]?key|token|secret)[A-Za-z0-9_]{0,12}\s*[=:]\s*)(['"]?)[^'"\s]{8,}\2/gi, "$1****")
    .replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/g, "[redacted-token]");
}

function extractPaths(input) {
  const matches = new Set();
  const text = String(input ?? "");
  const patterns = [
    /(?:^|[\s`"'(])(~\/[^\s`"'()<>{}\]]+)/g,
    /(?:^|[\s`"'(])(\/(?:Users|Volumes|tmp|private|var|opt|Applications|Library|System|root)[^\s`"'()<>{}\]]+)/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1]?.replace(/[),.;:]+$/, "");
      if (!raw) {
        continue;
      }
      matches.add(path.resolve(expandHome(raw)));
    }
  }

  return [...matches];
}

async function collectArtifacts(candidates, cwd, rolloutPath) {
  const results = [];
  const cwdResolved = path.resolve(cwd);
  const outputRoot = path.join(homeDir, "tmp", "codex-session-recaps");

  for (const candidate of candidates) {
    if (!candidate || candidate === rolloutPath) {
      continue;
    }
    if (!isInterestingArtifact(candidate, cwdResolved, outputRoot)) {
      continue;
    }
    if (!(await fileExists(candidate))) {
      continue;
    }
    const stat = await fs.stat(candidate);
    results.push({
      path: candidate,
      kind: stat.isDirectory() ? "directory" : classifyArtifact(candidate),
      modifiedAt: new Date(stat.mtimeMs).toISOString(),
    });
  }

  const unique = new Map(results.map((item) => [item.path, item]));
  return [...unique.values()].sort((a, b) => a.path.localeCompare(b.path)).slice(0, 12);
}

function isInterestingArtifact(candidate, cwd, outputRoot) {
  if (candidate.includes("/.codex/sessions/") || candidate.includes("/.codex/tmp/")) {
    return false;
  }
  if (candidate.startsWith(cwd)) {
    return true;
  }
  if (candidate.startsWith(skillRoot)) {
    return true;
  }
  if (candidate.startsWith(outputRoot)) {
    return true;
  }
  return false;
}

function classifyArtifact(candidate) {
  const ext = path.extname(candidate).toLowerCase();
  if (ext === ".html") {
    return "html";
  }
  if (ext === ".md") {
    return "markdown";
  }
  if (ext === ".json" || ext === ".jsonl") {
    return "json";
  }
  if (ext === ".mjs" || ext === ".js" || ext === ".ts") {
    return "code";
  }
  if (ext === ".yaml" || ext === ".yml") {
    return "yaml";
  }
  return ext ? ext.slice(1) : "file";
}

function buildTitle(transcript) {
  const firstUser = transcript.find((item) => item.role === "user");
  if (!firstUser) {
    return "Codex Session Recap";
  }
  const cleaned = summarizeText(firstUser.text.replace(/^#+\s*/gm, ""), 90);
  return cleaned || "Codex Session Recap";
}

function isHarnessUserMessage(text) {
  return (
    text.startsWith("# AGENTS.md instructions for ") ||
    text.startsWith("<environment_context>") ||
    (text.includes("AGENTS.md instructions for ") && text.includes("<INSTRUCTIONS>"))
  );
}

function buildSummaryFacts(parsed, artifacts, resolution) {
  const transcript = parsed.transcript;
  const userTurns = transcript.filter((item) => item.role === "user").length;
  const assistantTurns = transcript.filter((item) => item.role === "assistant").length;
  const started = parsed.meta?.timestamp ?? parsed.startedAt ?? "unknown";
  const updated = parsed.updatedAt ?? "unknown";
  return [
    `Session source: ${resolution.sourceResolution}`,
    `Rollout file: ${resolution.rolloutPath}`,
    `Working directory: ${parsed.meta?.cwd ?? "unknown"}`,
    `Started: ${started}`,
    `Last updated: ${updated}`,
    `Messages: ${userTurns} user / ${assistantTurns} assistant`,
    `Tool events captured: ${parsed.toolEvents.length}`,
    `Artifacts detected: ${artifacts.length}`,
  ];
}

function selectTimeline(items) {
  if (items.length <= 18) {
    return items;
  }
  const head = items.slice(0, 8);
  const tail = items.slice(-10);
  return [...head, ...tail];
}

function extractThreadIdFromPath(filePath) {
  const match = path.basename(filePath).match(/([0-9a-f]{8,}-[0-9a-f-]{8,})\.jsonl$/i);
  return match ? match[1] : null;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
