# VETRIX ERP

Production-grade multilingual ERP.

## Core Principles

- Correctness over speed.
- Read the minimum required context.
- Search before opening files.
- Modify only files related to the task.
- Keep changes as small as possible.
- Reuse existing components.
- Never refactor unrelated code.
- Never rewrite working code.

## Repository Rules

Never inspect unless required:

- node_modules
- dist
- build
- generated files
- vendor code

## Workflow

Implementation details are delegated to Skills.

Use the appropriate Skill for:

- Implement
- Review
- Bug Fix
- Frontend
- Backend
- Testing
- Security
- UI/UX
- Accounting
- Respiratory
- Sleep Analyzer
- Multilingual
- Deployment

If no Skill matches, stay within the smallest possible context.

## Skills

Use skills from:

.claude/skills/

When working on:

- frontend → use frontend skill
- backend → use backend skill
- accounting → use accounting skill
- crm → use crm skill
- inventory → use inventory skill
- respiratory → use respiratory skill
- sleep analyzer → use sleep-analyzer skill
- reports → use reports skill
- ui/ux → use uiux skill
- multilingual → use multilingual skill
- deployment → use deployment skill
- bug fixing → use bugfix skill
- security → use security skill
- implementation → use implement skill

Always load only the relevant skill.
Never load unrelated skills.