# Agency agents (Cursor)

Installed from [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) as `.cursor/rules/*.mdc`.

## Design / game UI set

| Rule | Use for |
|------|---------|
| `ui-designer` | Screens, HUD chrome, visual hierarchy |
| `ux-architect` | Flows, information architecture |
| `whimsy-injector` | Delight, motion, personality |
| `ui-finish-gate-reviewer` | Polish / shipping gate |
| `visual-storyteller` | Narrative visuals, mood |
| `inclusive-visuals-specialist` | Accessibility / inclusive visuals |
| `brand-guardian` | Brand consistency |
| `game-designer` | Loops, spectator/strategy feel |
| `level-designer` | Track/space readability |
| `technical-artist` | 3D look, shaders, art pipeline |
| `frontend-developer` | Svelte / Vite / Three.js implementation |

## Docs

Use **Context7** MCP for latest library docs (Svelte, Vite, Three.js, Tailwind). Project config: `.cursor/mcp.json`. Rule: `.cursor/rules/context7-docs.mdc`.

## How to use in Cursor

Ask explicitly, e.g.:

- “Activate **UI Designer** and redesign the pit wall HUD”
- “Activate **Game Designer** + **Whimsy Injector** for the landing screen”
- “Activate **UI Finish Gate Reviewer** before we ship”

Rules are `alwaysApply: false` — they load when you request them (or via Agent Decides).
