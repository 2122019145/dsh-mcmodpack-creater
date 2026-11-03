#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""gen_quests.py —— 把一份 JSON 任务表编译成 FTB Quests 的 .snbt + lang。

用法：
    python gen_quests.py --spec quests.json --workdir ~/.mc-work --check-only
    python gen_quests.py --spec quests.json --workdir ~/.mc-work
    python gen_quests.py --spec quests.json --workdir ~/.mc-work --instance 实例名
    python gen_quests.py --spec quests.json --workdir ~/.mc-work --mods-dir ~/.mc-work/versions/<实例>/mods

    --mode flat   2101.1.x：文案写 lang/<locale>.snbt 单文件（默认）
    --mode json5  2101.2+ ：文案写 lang/<locale>/chapters/<name>.snbt
    --mode auto   读 ftb-quests jar 自动判定（找不到 jar 时回落到 flat）

spec 最小形态见 SKILL.md；字段全表：
    chapter_title  str      章节名（写进 lang）
    group_title    str      分组名
    icon           str      章节图标物品 id
    chapter_file   str      文件名，默认 tech_main
    locales        [str]    默认 ["zh_cn", "en_us"]（内容相同）
    quests         [obj]    见下

quest 字段：
    key         str   本文件内唯一，用于依赖引用（不会写进 .snbt）
    title       str
    subtitle    str   可选
    desc        [str] 可选；"" 表示空行；支持 {image:ns:path width:W height:H align:1}
    item        str|null   null 或省略 => checkmark 任务（多方块结构用这个）
    count       int   上交数量，默认 1
    deps        [str] 前置任务 key 列表
    rewards     [obj] type=xp -> {"amount": n}；type=item -> {"id","count"}；type=loot -> {"table_id"}
    x, y        float 可选，省略时按顺序竖排（每格 1.5）
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import zipfile
import glob

CHAPTER_ID = "1000000000000002"
GROUP_ID = "1000000000000001"
ID_RE = re.compile(r"^[0-7][0-9A-F]{15}$")
ITEM_RE = re.compile(r"^[a-z0-9_]+:[a-z0-9_/]+$")


def q(s: str) -> str:
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


class Ids:
    """任务/目标/奖励各自独立命名空间，全部首位 ≤ 7。"""

    def __init__(self):
        self.quest = {}
        self._n = {"task": 0, "reward": 0}

    def qid(self, key: str) -> str:
        if key not in self.quest:
            self.quest[key] = "2" + f"{len(self.quest) + 1:015X}"
        return self.quest[key]

    def next(self, kind: str) -> str:
        self._n[kind] += 1
        return ("3" if kind == "task" else "4") + f"{self._n[kind]:015X}"


def render_quest(qs: dict, ids: Ids, y_default: float) -> str:
    qid = ids.qid(qs["key"])
    x = float(qs.get("x", 0.0))
    y = float(qs.get("y", y_default))
    L = ["\t\t{"]
    deps = [ids.qid(d) for d in qs.get("deps", [])]
    if deps:
        L.append("\t\t\tdependencies: [" + ", ".join(q(d) for d in deps) + "]")
    L.append(f"\t\t\tid: {q(qid)}")
    L.append(f"\t\t\tx: {x:.1f}d")
    L.append(f"\t\t\ty: {y:.1f}d")
    L.append("\t\t\ttasks: [{")
    L.append(f"\t\t\t\tid: {q(ids.next('task'))}")
    item = qs.get("item")
    if item:
        L.append(f"\t\t\t\titem: {{ count: 1, id: {q(item)} }}")
        cnt = int(qs.get("count", 1))
        if cnt > 1:
            L.append(f"\t\t\t\tcount: {cnt}L")
        L.append('\t\t\t\ttype: "item"')
    else:
        L.append('\t\t\t\ttype: "checkmark"')
    L.append("\t\t\t}]")
    rewards = qs.get("rewards") or []
    if rewards:
        rs = []
        for r in rewards:
            rid = ids.next("reward")
            if r["type"] == "xp":
                rs.append("\t\t\t\t{\n" + f"\t\t\t\t\tid: {q(rid)}\n"
                          '\t\t\t\t\ttype: "xp"\n' + f"\t\t\t\t\txp: {int(r.get('amount', 0))}\n\t\t\t\t}}")
            elif r["type"] == "loot":
                rs.append("\t\t\t\t{\n" + f"\t\t\t\t\tid: {q(rid)}\n"
                          f"\t\t\t\t\ttable_id: {q(r['table_id'])}\n"
                          '\t\t\t\t\ttype: "loot"\n' + "\t\t\t\t}")
            else:
                rs.append("\t\t\t\t{\n" + f"\t\t\t\t\tid: {q(rid)}\n"
                          f"\t\t\t\t\tcount: {int(r.get('count', 1))}\n"
                          f"\t\t\t\t\titem: {{ count: 1, id: {q(r['id'])} }}\n"
                          '\t\t\t\t\ttype: "item"\n' + "\t\t\t\t}")
        L.append("\t\t\trewards: [\n" + "\n".join(rs) + "\n\t\t\t]")
    L.append("\t\t}")
    return "\n".join(L)


def build(spec: dict, mode: str) -> dict:
    ids = Ids()
    for qs in spec["quests"]:          # 先分配，依赖才能拿到同一个 id
        ids.qid(qs["key"])
    y = 0.0
    blocks = []
    for qs in spec["quests"]:
        blocks.append(render_quest(qs, ids, y))
        y += 1.5

    chapter_file = spec.get("chapter_file", "tech_main")
    chapter = f"""\t{{
\t\tdefault_hide_dependency_lines: false
\t\tdefault_quest_shape: ""
\t\tfilename: {q(chapter_file)}
\t\tgroup: {q(GROUP_ID)}
\t\ticon: {{ id: {q(spec.get('icon', 'minecraft:book'))} }}
\t\tid: {q(CHAPTER_ID)}
\t\torder_index: 0
\t\tprogression_mode: {q(spec.get('progression', 'linear'))}
\t\tquests: [
{chr(10).join(blocks)}
\t\t]
\t}}"""

    data = """{
\tdefault_autoclaim_rewards: "disabled"
\tdefault_consume_items: false
\tdefault_quest_shape: "circle"
\tdefault_reward_team: false
\tfallback_locale: "en_us"
\tgrid_scale: 0.5d
\ticon: {
\t\tid: %s
\t}
\tlock_message: %s
\tprogression_mode: %s
\tshow_lock_icons: true
\tversion: 13
}
""" % (q(spec.get("icon", "minecraft:book")),
       q(spec.get("lock_message", "先把手头这步做完。")),
       q(spec.get("progression", "linear")))

    groups = "{\n\tchapter_groups: [\n\t\t{ id: " + q(GROUP_ID) + " }\n\t]\n}\n"

    entries = []
    for qs in spec["quests"]:
        qid = ids.qid(qs["key"])
        entries.append(f"\tquest.{qid}.title: {q(qs['title'])}")
        if qs.get("subtitle"):
            entries.append(f"\tquest.{qid}.quest_subtitle: {q(qs['subtitle'])}")
        desc = qs.get("desc") or []
        if desc:
            body = "\n".join("\t\t" + q(d) for d in desc)
            entries.append(f"\tquest.{qid}.quest_desc: [\n{body}\n\t]")
    entries.append(f"\tchapter.{CHAPTER_ID}.title: {q(spec.get('chapter_title', ''))}")
    entries.append(f"\tchapter_group.{GROUP_ID}.title: {q(spec.get('group_title', '主线'))}")

    return {
        "chapter": chapter, "data": data, "groups": groups,
        "quest_entries": entries,
        "quest_lang": "{\n" + "\n".join(entries) + "\n}\n",
        "chapter_file": chapter_file,
        "chapter_title_line": f"chapter.{CHAPTER_ID}.title: {q(spec.get('chapter_title', ''))}",
        "group_title_line": f"chapter_group.{GROUP_ID}.title: {q(spec.get('group_title', '主线'))}",
    }


def write_files(base: str, parts: dict, spec: dict, mode: str, locales: list) -> None:
    os.makedirs(os.path.join(base, "chapters"), exist_ok=True)
    os.makedirs(os.path.join(base, "lang"), exist_ok=True)
    for name, txt in (("chapters/" + parts["chapter_file"] + ".snbt", parts["chapter"] + "\n"),
                      ("data.snbt", parts["data"]),
                      ("chapter_groups.snbt", parts["groups"])):
        with open(os.path.join(base, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(txt)

    for loc in locales:
        # 清掉另一代的残留，避免两套文案同时存在（FTB 只会读其中一套，另一套纯属误导）
        stale_dir = os.path.join(base, "lang", loc)
        stale_file = os.path.join(base, "lang", f"{loc}.snbt")
        if mode == "json5" and os.path.isfile(stale_file):
            os.remove(stale_file)
        if mode != "json5" and os.path.isdir(stale_dir):
            shutil.rmtree(stale_dir)
    for loc in locales:
        if mode == "json5":
            d = os.path.join(base, "lang", loc, "chapters")
            os.makedirs(d, exist_ok=True)
            # 只留 quest.* 键
            with open(os.path.join(d, parts["chapter_file"] + ".snbt"), "w",
                      encoding="utf-8", newline="\n") as f:
                f.write("{\n" + "\n".join(parts["quest_entries"]) + "\n}\n")
            with open(os.path.join(base, "lang", loc, "chapter.snbt"), "w",
                      encoding="utf-8", newline="\n") as f:
                f.write("{\n\t" + parts["chapter_title_line"] + "\n}\n")
            with open(os.path.join(base, "lang", loc, "chapter_group.snbt"), "w",
                      encoding="utf-8", newline="\n") as f:
                f.write("{\n\t" + parts["group_title_line"] + "\n}\n")
        else:
            with open(os.path.join(base, "lang", f"{loc}.snbt"), "w",
                      encoding="utf-8", newline="\n") as f:
                f.write(parts["quest_lang"])


def check(base: str, parts: dict, spec: dict, mods_dir: str | None) -> list:
    errs = []
    txt = open(os.path.join(base, "chapters", parts["chapter_file"] + ".snbt"), encoding="utf-8").read()
    ids = re.findall(r'id: "([0-9A-Z]{16})"', txt)
    if len(ids) != len(set(ids)):
        errs.append("id 有重复")
    for i in ids:
        if not ID_RE.match(i):
            errs.append(f"id 不能解析成有符号 long（首位必须 ≤7）：{i}")
    n_quest = len(spec["quests"])
    deps_n = txt.count("dependencies")
    expect = sum(1 for x in spec["quests"] if x.get("deps"))
    if deps_n != expect:
        errs.append(f"依赖条数不符：文件 {deps_n}，期望 {expect}")
    if "version: 13" not in open(os.path.join(base, "data.snbt"), encoding="utf-8").read():
        errs.append("data.snbt version 不是 13")

    used = []
    for x in spec["quests"]:
        if x.get("item"):
            used.append(x["item"])
        for r in (x.get("rewards") or []):
            if r["type"] == "item":
                used.append(r["id"])
    for i in used:
        if not ITEM_RE.match(i):
            errs.append(f"物品 id 形状不对：{i}")

    if mods_dir:
        known = load_mod_lang(mods_dir)
        missing = []
        for i in used:
            ns, name = i.split(":", 1)
            if ns in ("minecraft",):
                continue
            keys = known.get(ns)
            if keys is None:
                missing.append(f"{i}（没找到 {ns} 的 jar）")
            elif not any(k.endswith("." + name) for k in keys):
                missing.append(i)
        if missing:
            errs.append("物品 id 在模组里查不到：" + ", ".join(sorted(set(missing))[:10]))
    return errs


def load_mod_lang(mods_dir: str) -> dict:
    out: dict = {}
    for jar in glob.glob(os.path.join(mods_dir, "*.jar")):
        try:
            with zipfile.ZipFile(jar) as z:
                for n in z.namelist():
                    m = re.match(r"assets/([^/]+)/lang/en_us\.json$", n)
                    if m:
                        data = json.loads(z.read(n).decode("utf-8", "ignore"))
                        out.setdefault(m.group(1), set()).update(data.keys())
        except Exception:
            continue
    return out


def detect_mode(mods_dir: str | None) -> str:
    if not mods_dir:
        return "flat"
    for jar in glob.glob(os.path.join(mods_dir, "ftb-quests*.jar")):
        try:
            with zipfile.ZipFile(jar) as z:
                d = z.read("dev/ftb/mods/ftbquests/quest/translation/TranslationManager.class")
            return "flat" if b"loadFromNBT" in d else "json5"
        except Exception:
            pass
    return "flat"


def resolve_root(workdir: str, instance: str | None) -> str:
    if instance:
        return os.path.join(workdir, "versions", instance)
    vdir = os.path.join(workdir, "versions")
    if os.path.isdir(vdir):
        cands = [d for d in os.listdir(vdir)
                 if os.path.isdir(os.path.join(vdir, d, "mods"))]
        if len(cands) == 1:
            print(f"[i] 版本隔离：使用实例 {cands[0]}")
            return os.path.join(vdir, cands[0])
        if len(cands) > 1:
            raise SystemExit(f"有多个已装 mod 的实例，请用 --instance 指定：{cands}")
    return workdir


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--workdir", default=os.path.expanduser("~/.hmcl-mcp"))
    ap.add_argument("--instance", default=None)
    ap.add_argument("--mods-dir", default=None, help="给了就顺手校验物品 id 是否存在")
    ap.add_argument("--mode", default="auto", choices=["auto", "flat", "json5"])
    ap.add_argument("--locales", default="zh_cn,en_us")
    ap.add_argument("--check-only", action="store_true")
    a = ap.parse_args()
    a.workdir = os.path.expanduser(os.path.expandvars(a.workdir))
    if a.mods_dir:
        a.mods_dir = os.path.expanduser(os.path.expandvars(a.mods_dir))

    spec = json.load(open(a.spec, encoding="utf-8"))
    root = resolve_root(a.workdir, a.instance)
    mods_dir = a.mods_dir or os.path.join(root, "mods")
    mode = detect_mode(mods_dir) if a.mode == "auto" else a.mode
    print(f"[i] 模式：{mode}｜根目录：{root}")

    base = os.path.join(root, "config", "ftbquests", "quests")
    parts = build(spec, mode)
    locales = [x.strip() for x in a.locales.split(",") if x.strip()]

    if not a.check_only:
        write_files(base, parts, spec, mode, locales)
        print(f"[✓] 已写入 {base}")

    errs = check(base, parts, spec, mods_dir if a.mods_dir or os.path.isdir(mods_dir) else None)
    print(f"任务数 {len(spec['quests'])}｜依赖 {sum(1 for x in spec['quests'] if x.get('deps'))} 条")
    if errs:
        print("[✗] 自检失败：")
        for e in errs:
            print("  -", e)
        return 1
    print("[✓] 自检通过：id 合规 / 依赖可解析 / 物品 id 存在 / version 13")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
