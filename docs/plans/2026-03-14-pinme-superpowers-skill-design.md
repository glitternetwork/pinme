# PinMe Superpowers Skill 设计文档

Date: 2026-03-14
Updated: 2026-03-14

## 目标

用 superpowers 规范重写现有的 `.claude/skills/pinme/SKILL.md`，使其：
1. CSO 优化 — description 精确描述触发条件，提高发现率
2. 登录流程 — 完整覆盖 `pinme login` 流程
3. 结构清晰 — 单文件包含所有内容
4. 可发布 — 符合 superpowers 技能体系规范，可供他人安装

## 方案

**最终方案：单文件（由方案 C 演化而来）**

```
.claude/skills/pinme/
  SKILL.md              # 包含流程指导 + Worker 参考 + 邮件发送等全部内容
```

原计划为方案 C（主文件 + worker-reference.md），但经验证发现 Claude Code 的 skill 系统不会自动加载 SKILL.md 以外的文件，Agent 看到 "See worker-reference.md" 也不保证会去读取。合并为单文件确保 Agent 一定能看到全部内容，且总量（~400 行）仍可接受。

## SKILL.md 结构

### Frontmatter
- name: pinme
- description: 只写触发条件，纯触发词密度优先

### 内容
1. Overview — 一句话核心价值
2. When to Use — dot 流程图：上传 vs 全栈
3. Path 1: Upload — 无需登录的文件上传流程
4. Path 2: Full-Stack — 需登录的全栈项目流程（含 login）
5. Worker Code Pattern — 代码模板 + 禁止列表
6. Sending Email — Pinme Send Email API
7. Frontend API / D1 / SQL Migration — 参考代码
8. Capability Boundaries — 能力边界与降级
9. Common Mistakes — 错误处理表
10. Other Commands — 命令速查

## 关键改进点

| 现有问题 | 改进 |
|---------|------|
| description 包含工作流描述 | 只写触发条件 |
| 无决策流程图 | 添加 dot 流程图 |
| 登录流程不明确 | 明确 login 步骤 |
| schema 路径错误（backend/schema/） | 修正为 db/（与代码一致） |
| 缺少邮件发送功能 | 添加完整的 Send Email API 文档 |
| 缺少模板修改指导 | 明确 pinme create 生成模板，基于模板修改 |
| 缺少 Worker 部署地址 | 添加 {name}.pinme.pro |
| 拆分为两个文件但 Agent 无法自动加载 | 合并为单文件 |
