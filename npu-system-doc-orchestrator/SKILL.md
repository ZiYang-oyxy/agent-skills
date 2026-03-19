---
name: npu-system-doc-orchestrator
description: Draft engineering-facing NPU or AI accelerator chip soft-hardware system overview documents, especially when Codex needs to explain software architecture, chip architecture, buses, on-chip or off-chip interconnects, memory hierarchy, and core coordination mechanisms; delegate chapter collection and drafting to subagents; and consolidate the result into one consistent narrative. Use for 芯片软硬件系统介绍, architecture whitepaper-style drafts, or any request to split NPU chip-system documentation across subagents and merge it back.
---

# NPU System Doc Orchestrator

## Overview

Treat NPU documentation as an orchestration problem rather than a single-pass writing task. Build the outline first, assign narrow chapter scopes to subagents, let each subagent collect and draft inside its scope, then merge, normalize, and finalize in the main agent.

## Set The Default Target

- Default audience: 研发团队
- Default document type: 芯片软硬件系统介绍 / 技术架构说明
- Default emphasis: 软件总体架构、芯片计算与控制架构、总线与片上互联、内存层次、主机到设备接口、软硬件协同机制
- Default scope: 芯片及紧邻系统边界；主机接口、板级内存与外部互联可写，训练集群和服务部署默认不展开
- Default exclusions: 训练路径、推理路径、性能方法论、能力边界、部署流程、运维、问题定位，除非用户明确要求
- Default summary language: 中文；如果正文另有语言要求，仅摘要、概述、总结类部分默认保持中文

If product-specific facts are missing, write a reusable framework or clearly marked assumptions. Do not invent chip specifications, benchmark numbers, supported features, or roadmap commitments.

## Work In This Order

1. Ground in source material.
   Read user notes, prior documents, repos, slides, benchmark tables, architecture sketches, or requirement docs before drafting. Search local material first. Browse only when the user asks for external research or when the facts are current and uncertain.

2. Lock the master outline.
   Start from `references/outline.md`. Shrink or expand based on requested depth, but keep the document centered on software layers, chip architecture, buses, interconnects, memory hierarchy, and software-to-hardware control/data flow.

3. Decide the subagent split.
   Use 3 to 5 subagents. Split by chapter ownership, not by sentence-level editing. Keep the main agent responsible for title, summary, terminology normalization, cross-chapter transitions, final introduction, and final consistency pass.

4. Launch subagents with narrow scopes.
   Use `references/subagent-contract.md`. Pass only the chapter slice, audience, known facts, exclusions, and output format needed for that chapter. Tell each subagent it is not alone in the document and must not rewrite or speculate about other chapters.

5. Review each chapter draft before merge.
   Rewrite or reject sections that drift into training or inference usage paths, describe hardware without the matching software control path, make unsupported performance claims, or drift into deployment and troubleshooting when those are out of scope.

6. Consolidate in the main agent.
   Merge chapters into one narrative. Remove repeated definitions. Normalize names for compute blocks, memory hierarchy, interconnects, precisions, runtime layers, and metrics. Make the global order read as:
   problem and goals -> software architecture -> chip architecture -> buses and interconnects -> memory hierarchy -> soft-hardware coordination mechanisms.

7. Add diagrams only when they improve clarity.
   If you create or modify Mermaid, invoke `$mermaid-sop-check` at `/Volumes/code/agent-skills/mermaid-sop-check` first and validate every new or modified diagram with `mmdc` before delivery.

8. Run a final quality pass.
   Use `references/quality-checklist.md`. The final draft must read as though one author wrote it.

## Choose The Subagent Split

For a full-length NPU chip-system overview, use this default split:

- Agent 1: 方案概述 + 设计目标与范围
- Agent 2: 软件总体架构，包括编译器、Runtime、驱动、固件、工具链
- Agent 3: 芯片计算与控制架构
- Agent 4: 总线、片上互联、主机接口与内存子系统
- Agent 5: 软硬件协同机制，包括命令流、数据流、同步、内存管理、可观测性

For a shorter document, collapse to 3 agents:

- Agent A: 概述 + 软件总体架构
- Agent B: 芯片架构
- Agent C: 总线/互联/内存 + 软硬件协同机制

Do not ask subagents to write the final abstract, executive summary, or the final cross-chapter comparison tables. Keep those in the main agent.

## Enforce Writing Rules

- Separate facts, inferences, and assumptions.
- Prefer system behavior over marketing language.
- Tie each major hardware block to its software enablement path.
- Distinguish control path, data path, configuration path, and observability path.
- Explain buses, NoC, DMA, memory controllers, queues, barriers, and address spaces as mechanisms, not as disconnected block lists.
- Prefer tables for interfaces, memory hierarchy, arbitration points, synchronization points, and software-to-hardware responsibility splits.
- If the user asks for a “方案” or “系统介绍”, default to an engineering overview rather than a sales deck.
- Keep training, inference, performance benchmarking, and roadmap-style boundaries out unless the user explicitly asks for them.

## Shape The Final Deliverable

Unless the user asks otherwise, produce:

- title
- 中文摘要或概述
- chaptered Markdown body
- 1 to 3 architecture diagrams when useful
- key tables for interfaces, buses or interconnects, memory hierarchy, and responsibility boundaries
- a short assumptions section when source facts are incomplete

## Use The Bundled References

- Read `references/outline.md` to structure the document and chapter goals.
- Read `references/subagent-contract.md` to prepare subagent prompts and output contracts.
- Read `references/quality-checklist.md` before merging and before final delivery.
