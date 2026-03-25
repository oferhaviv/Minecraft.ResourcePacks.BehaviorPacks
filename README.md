# Minecraft Addons

A collection of Bedrock Edition behavior packs.

---

## <img src="HarvestGuard/pack_icon.png" width="96" alt="HarvestGuard"/> Harvest Guard 
> A vanilla-friendly farming safety add-on for Minecraft Bedrock Edition.

Prevents players from accidentally destroying crops before they are ready to harvest, and protects the base blocks of vertical plants. Activates only when the player is holding a configured tool (hoe or axe), so normal gameplay is unaffected.



### Features

- **Crop protection** — blocks breaking unripe wheat, carrots, potatoes, beetroot, nether wart, and cocoa pods
- **Stem protection** — always blocks breaking melon and pumpkin stems
- **Cave vine protection** — always blocks breaking cave vines (all variants: plain, head with berries, body with berries)
- **Sweet berry bush protection** — always blocks breaking sweet berry bushes
- **Base protection** — only protects the *bottom* block of sugar cane, bamboo, and cactus columns; upper blocks can be harvested freely
- **Bamboo sapling protection** — always blocks breaking bamboo saplings
- **Farmland protection** — always blocks breaking farmland directly
- **Cocoa log protection** — blocks breaking a jungle log that has an unripe cocoa pod attached; shares the Cocoa toggle (no extra setting)
- **Per-player settings** — every player configures their own tool group and which crops to protect
- **Multiplayer safe** — settings are stored per-player via dynamic properties; no shared state

### Protected Blocks Reference

| Category | Block | Rule | Mature / Safe to break |
|---|---|---|---|
| Crops | Wheat | Growth-based | `growth = 7` |
| Crops | Carrots | Growth-based | `growth = 7` |
| Crops | Potatoes | Growth-based | `growth = 7` |
| Crops | Beetroot | Growth-based | `growth = 7` |
| Crops | Nether Wart | Growth-based | `age = 3` |
| Crops | Cocoa | Growth-based | `age = 2` |
| Crops | Jungle Log | Cocoa base | No unripe pod on any side |
| Stems | Melon Stem | Always blocked | — |
| Stems | Pumpkin Stem | Always blocked | — |
| Vines | Cave Vines (all variants) | Always blocked | — |
| Vines | Sweet Berry Bush | Always blocked | — |
| Bases | Sugar Cane | Base only | Upper blocks free |
| Bases | Bamboo | Base only | Upper blocks free |
| Bases | Bamboo Sapling | Always blocked | — |
| Bases | Cactus | Base only | Upper blocks free |
| Other | Farmland | Always blocked | — |

### Tool Groups

The add-on only activates when the player holds a tool from the selected group. Wooden tools are excluded by design.

| Index | Group | Tools |
|---|---|---|
| 0 | Hoes | Iron, Golden, Diamond, Netherite, Copper hoe |
| 1 | Axes | Iron, Golden, Diamond, Netherite, Copper axe |
| 2 | Hoes & Axes | All of the above |

### Installation

1. Download or clone the repository
2. Copy the `HarvestGuard` folder into your world's `behavior_packs` directory
3. Activate the pack in your world settings
4. Each player enables it via `/scriptevent hg:active true`

### Usage

All commands are issued in-game via the `/scriptevent` command:

| Command | Description |
|---|---|
| `/scriptevent hg:settings` | Open the settings dialog (tool group, crop toggles, debug level) |
| `/scriptevent hg:active true\|false` | Enable or disable Harvest Guard for yourself |
| `/scriptevent hg:restore` | Reset all your settings to defaults |
| `/scriptevent hg:show` | Print your current settings to chat |

### Settings

Settings are configured per-player through the in-game dialog (`hg:settings`):

| Setting | Default | Description |
|---|---|---|
| Enable | Off | Master on/off switch |
| Tool | Hoes | Which tool group triggers the guard |
| Wheat | On | Protect unripe wheat |
| Carrots | On | Protect unripe carrots |
| Potatoes | On | Protect unripe potatoes |
| Beetroot | On | Protect unripe beetroot |
| Nether Wart | On | Protect unripe nether wart |
| Cocoa | On | Protect unripe cocoa pods and their host jungle log |
| Melon Stem | On | Protect melon stems |
| Pumpkin Stem | On | Protect pumpkin stems |
| Sweet Berry Bush | On | Protect sweet berry bushes |
| Cave Vines | On | Protect cave vines |
| Sugar Cane | On | Protect base of sugar cane |
| Bamboo | On | Protect base of bamboo and bamboo saplings |
| Cactus | On | Protect base of cactus |
| Protect Breaking Farmland | On | Protect farmland from being broken directly |
| Debug Level | None | `Basic` logs guard events to the content log |

### Requirements

- Minecraft Bedrock Edition
- Scripting API: `@minecraft/server` 2.5.0, `@minecraft/server-ui` 2.0.0

---

## ZipIt

*Documentation coming soon.*

---
