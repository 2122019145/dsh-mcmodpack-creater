# 六个真踩过的坑

按「症状 → 证据 → 根因 → 修法」写。所有日志行都来自 `latest.log` / `debug.log`，搜 `FTB Quests` 即可。

---

## 1. id 超出有符号 64 位 → 依赖被清空（"不按顺序解锁"的头号原因）

**症状**：任务书能打开，节点都在，但**可以从头点到尾**，前面的没做完后面也能勾。

**证据**（在 `.snbt` 里数一下）：

```bash
grep -c dependencies chapters/tech_main.snbt
# 期望：任务数 − 1；实际：0
```

同时会看到：

- 章节的 `group:` 变成 `""`
- 所有 id 变成陌生的随机串（`0CCD612C04E40E90` 这种）
- lang 键全部对不上，任务名回退成 task 类型的默认名（`勾选标记` / `Checkmark`）
- 文件修改时间 = 你进游戏的时间

**根因**：`QuestObjectBase` 用 `Long.parseLong(id, 16)` 读 id。`A100000000000001`、`B000…`、`C000…`、`F000…` 这些首位 ≥ 8 的值超过 `Long.MAX_VALUE`，解析抛异常 → FTB 认定 id 无效 → 给每个对象重新随机编号 → **整个 `.snbt` 被重写**，依赖字段在重编号时全部丢弃。

**修法**：所有 id 首位改成 ≤ 7（`1…`章节、`2…`任务、`3…`目标、`4…`奖励），依赖用同一张映射表生成。
改完**必须让游戏重新读**（完全退出重进世界），旧的世界进度按旧 id 存的，等于清零。

> 这条我猜错过一次：先以为是 `default_hide_dependency_lines`，又以为是 `progression_mode`，都没用。
> **判据只有一个：文件里 `dependencies` 的条数。**

---

## 2. 语言文件的位置/格式不对 → 0 条翻译

**症状**：节点有，但没名字；鼠标悬停显示 `勾选标记`（checkmark 任务的默认名）；说明文字空白。

**证据**：

```
[FTB Quests/]: loaded translation tables for 1 language(s)          ← 只找到兜底语言
[FTB Quests/]: received translation table en_us (with 0 entries)    ← 0 条
```

正常应该是：

```
[FTB Quests/]: loaded translation tables for 2 language(s)
[FTB Quests/]: received translation table zh_cn (with 86 entries)   ← 任务数×3 + 2
```

**根因**：2101.1.x 的 `TranslationManager` 用正则 `^\w+\.snbt$` 扫 **`lang/` 下的文件**（`loadFromNBT`），
即 `lang/zh_cn.snbt`。把文案写成 `lang/zh_cn/chapters/xxx.snbt` 的分目录（那是 2101.2+ 的格式）时，
它一个都扫不到，且**不打任何错误**。

**修法**：改成单文件 `lang/<locale>.snbt`，内容带外层大括号、键名前一个 tab、LF 换行。

```snbt
{
	quest.2000000000000001.title: "起点：第一块铁"
	quest.2000000000000001.quest_desc: [
		"第一段。"
		"第二段。"
	]
	chapter.1000000000000002.title: "主线"
}
```

修好后日志的 `entries` 应该 = 任务数 × 3 + 章节 + 分组。

---

## 3. 版本隔离：文件写对了，但游戏根本没读

**症状**：任务书**完全空白**，连章节都没有。

**证据**：

```
[FTB Quests/]: Loading quests from D:\mc-work\versions\<实例>\config\ftbquests\quests
[FTB Quests/]: Loaded 2 chapter groups, 1 chapters, 28 quests     ← 28 是"旧文件"里的
[FTB Quests/]: Read 605 bytes, 1 objects                          ← 这是世界里的队伍进度，不是任务
```

**根因**：PCL/HMCL 开了版本隔离，游戏读 `versions/<实例>/config/`，而你写在了 `<workdir>/config/`。

**判据**：实例目录下同时存在 `mods/`、`logs/`、`saves/` → 已隔离。

**修法**：把 `config/ftbquests` 和 `kubejs` 整体搬进实例目录，根目录那份删掉（否则两处不一致）。
生成脚本要能自动识别：只在唯一一个「带 `mods/` 的实例」下写。

---

## 4. 任务对象里内联 title/description → 读档时被丢掉

**症状**：你在 `.snbt` 里明明写了 `title: "第一块铁"`，进游戏还是没名字；退出后打开文件，**这两行消失了**。

**根因**：FTB 2101 的任务对象没有这两个字段，解析时忽略、保存时抹掉。文案只有 lang 一条路。

**修法**：删掉内联字段，只写 lang。别做"双保险"，双保险等于没保险。

---

## 5. 多方块结构当成物品任务 → 永远完成不了

**症状**：某个节点怎么都勾不上，明明机器已经搭好了。

**根因**：电弧炉（Immersive Engineering）、高炉、反应堆这类是**多方块结构**，游戏里没有对应的"物品"可交；
写成 `type: "item"` 就永远等不到那个物品。

**修法**：改成 `{ id: "3…", type: "checkmark" }`，在说明里写清"搭好后自己勾一下"。
同理适用于：达成某种布局、走过某条路线、看过某个界面这类无法用物品/进度表示的进度。

---

## 6. 物品 id 凭记忆写 → 任务指向空气

**症状**：任务书里那个节点显示成紫黑方块 / 空图标；玩家交不上东西。

**证据**：`mekanism:osmium_ingot` 根本不存在，真名是 `mekanism:ingot_osmium`。

**修法**：逐个到已装 jar 里反查，不要信 wiki、不要信记忆：

```python
import zipfile, glob, json, re, os
def has_id(ns, name):
    for jar in glob.glob(f"mods/*.jar"):
        try:
            with zipfile.ZipFile(jar) as z:
                for n in z.namelist():
                    if re.match(rf"assets/{ns}/lang/en_us\.json$", n):
                        d = json.loads(z.read(n).decode("utf-8", "ignore"))
                        return any(k.endswith("." + name) for k in d)
        except Exception:
            continue
    return False
```

一次性校验整张表：把所有任务/奖励里的 id 按 namespace 分组，逐个查，输出可疑清单。

**附带一条同源教训**：模组 jar 的**文件名**也不可信。Xaero 的两件曾下发成 `xaerominimap-forge-26.3-*.jar`，
里面的 `mods.toml` 写着 `versionRange = "[26.3, 26.4.0)"`，塞进 1.21.1 直接崩。
批量装完必须抽查 jar 内 `mods.toml` / `neoforge.mods.toml` 的 `versionRange`。

---

## 附加：在游戏里编辑过一次之后

只要在游戏里动过任务书（拖动、改字、加节点），FTB 会**把整个 `.snbt` 按它自己的顺序重写**：
键按字母排序、未识别字段清空、缩进统一。这时候再拿手写的脚本覆盖，等于把它们冲掉。

对策：**要么全程脚本生成、不进编辑器改；要么改了之后把游戏写出来的文件当唯一真相，别再跑生成器**。
二选一，别混。
