# FTB Quests 文件格式参考

> 以 `ftb-quests 2101.1.37`（1.21.1 NeoForge）实测为准。2101.2+ 换成 JSON5，差异在文末单列。
> 所有 `.snbt` 都是 **SNBT**（不是 JSON）：键值之间换行分隔、逗号可选、字符串双引号、数字可带 `d`/`L` 后缀。

## 一、目录结构

```
<config>/ftbquests/quests/
├── data.snbt                  全局设置（version / progression_mode / fallback_locale …）
├── chapter_groups.snbt        分组列表
├── chapters/
│   └── <chapter_file>.snbt    一个章节一个文件，文件名 = 章节里的 filename 字段
└── lang/
    └── zh_cn.snbt             2101.1.x：一个语言一个文件
```

2101.2+/JSON5 版：

```
└── lang/
    └── zh_cn/
        ├── chapter.snbt
        ├── chapter_group.snbt
        └── chapters/<chapter_file>.snbt
```

## 二、id 规则（最容易死人的一条）

- 16 位**十六进制**字符串，大写，无 `0x` 前缀。
- **首位必须 ≤ 7**：FTB 用 `Long.parseLong(id, 16)` 读，`A000…` 以上超出 `Long.MAX_VALUE` → 解析失败 → 游戏重新随机编号并重写文件。
- 全局唯一：任务、任务目标、奖励、章节、分组**共用一个命名空间**，撞号后者覆盖前者。
- 引用一律用完整 16 位字符串。

建议分段：

```
1xxx…   章节 / 分组
2xxx…   任务
3xxx…   任务目标（task）
4xxx…   奖励（reward）
```

## 三、data.snbt

```snbt
{
	version: 13
	progression_mode: "linear"      // linear = 隐藏未解锁节点；flexible = 全显示但仍受依赖约束
	fallback_locale: "en_us"
	lock_message: "先把手头这步做完。"
	default_consume_items: false
	default_autoclaim_rewards: "disabled"
	grid_scale: 0.5d
	icon: { id: "create:water_wheel" }
	show_lock_icons: true
}
```

`version` 固定 13（2101.x）。游戏加载后会自己补全缺失字段并回写，所以手写时不必求全。

## 四、chapter_groups.snbt

```snbt
{
	chapter_groups: [
		{ id: "1000000000000001" }
	]
}
```

分组的显示名在 lang：`chapter_group.<id>.title`。

## 五、章节文件

```snbt
{
	filename: "tech_main"
	id: "1000000000000002"
	group: "1000000000000001"          // 必须存在于 chapter_groups，否则会被写成 ""
	order_index: 0
	icon: { id: "create:water_wheel" }
	default_hide_dependency_lines: false   // true 会把依赖连线藏起来，看着像一盘散沙
	progression_mode: "linear"
	quests: [ { … }, { … } ]
}
```

## 六、任务对象

```snbt
{
	id: "2000000000000001"
	x: 0.0d
	y: 1.5d
	dependencies: ["2000000000000000"]     // 前置任务 id 列表；空 = 一开局就能做
	tasks: [ … ]
	rewards: [ … ]
	// 可选：shape: "hexagon" / "gear" / "circle"、"size"、"icon"、"min_width"、"optional"、"invisible"、"tags"
}
```

**任务对象里不能写 `title` / `subtitle` / `description`。** 2101 读档时会把这些不认识的字段丢掉，文案只能放 lang。

> 坐标：x 向右增大，y 向下增大，一格 = 1.0。主线一般 `y + 1.5` 递进，支线在 x 上偏移 ±3。

## 七、任务目标（tasks）

| type | 写法 | 说明 |
|---|---|---|
| `item` | `{ id: "3…", type: "item", item: { count: 1, id: "create:shaft" }, count: 8L }` | 上交/持有 8 个。**`count` 写在外层**，内层 `item.count` 恒为 1 |
| `checkmark` | `{ id: "3…", type: "checkmark" }` | 玩家自己勾。**多方块结构、无法用物品表示的进度都用它** |
| `advancement` | `{ id: "3…", type: "advancement", advancement: "minecraft:story/iron_tools" }` | 达成进度 |
| `kill` | `{ id: "3…", type: "kill", entity: "minecraft:zombie", value: 20L }` | 击杀数 |
| `dimension` | `{ id: "3…", type: "dimension", dimension: "minecraft:the_nether" }` | 去过某维度 |
| `biome` | `{ id: "3…", type: "biome", biome: "minecraft:desert" }` | 到过某生物群系 |

其余类型（`observation`、`stage`、`xp` 等）各家版本有出入：**在游戏里手动加一个该类型的任务，退出后看它写出来的字段，照着抄**，比查文档可靠。

## 八、奖励（rewards）

```snbt
// 经验
{ id: "4…", type: "xp", xp: 40 }

// 物品：数量写在外层 count
{ id: "4…", type: "item", count: 16, item: { count: 1, id: "minecraft:bread" } }

// 战利品表 / 指令 / 多选一
{ id: "4…", type: "loot", table_id: "minecraft:chests/simple_dungeon" }
{ id: "4…", type: "command", command: "give @p minecraft:diamond 1", permission_level: 0 }
{ id: "4…", type: "choice", ... }
```

奖励给"能用得上但不顶替关键进度"的东西最舒服：送木板、煤、少量锭、经验；别送终局材料。

## 九、语言文件（文案）

**2101.1.x：`lang/<locale>.snbt`，一个语言一个文件，带外层大括号，键名前一个 tab。**

```snbt
{
	quest.2000000000000001.title: "起点：第一块铁"
	quest.2000000000000001.quest_subtitle: "先把镐子磨亮"
	quest.2000000000000001.quest_desc: [
		"第一段。"
		""
		"{image:minecraft:textures/item/iron_pickaxe.png width:64 height:64 align:1}"
	]
	chapter.1000000000000002.title: "从水车到 ME 网络"
	chapter_group.1000000000000001.title: "主线"
}
```

- 键名模板：`quest.<任务id>.title` / `.quest_subtitle` / `.quest_desc`；`chapter.<章节id>.title`；`chapter_group.<分组id>.title`；task 也能单独起名：`task.<任务目标id>.title`。
- `quest_desc` 是**字符串数组**，空字符串 `""` 表示空行。
- 富文本：`{image:<namespace>:<path> width:W height:H align:0|1}` 插图片；文本里支持 `&6` 这类颜色码。

**2101.2+**：改成 `lang/<locale>/chapters/<章节文件名>.snbt`，内容是 JSON5（结构同上，允许不加引号的键、允许尾逗号）。

判据：`TranslationManager` 里出现 `^\w+\.snbt$` 就是单文件世代；出现 `Json5Util` 就是分目录世代。

## 十、两代差异速查

| 项 | 2101.1.x | 2101.2+ |
|---|---|---|
| 序列化 | SNBT | JSON5 |
| 扩展名 | `.snbt` | `.snbt` / `.json5`（看 `Json5Util.FILE_EXT`） |
| 文案 | `lang/<locale>.snbt` | `lang/<locale>/chapters/<name>.snbt` |
| 读取方法 | `loadFromNBT` | `loadFromFile` |
| 章节扫描 | 遍历目录 | `Files.list` + 扩展名过滤 |

**永远先按第一步的检测脚本判定，不要凭整合包里的目录长相猜。**
