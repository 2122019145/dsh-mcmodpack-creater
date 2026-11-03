# 不靠手点，把任务书验一遍

日志只能证明"文件被读了"，证明不了"锁住了"。要看到锁，得真的进游戏看一眼。
下面这套做法不需要任何 MCP 或自动化框架，只用 Python + PowerShell。

## 一、启动：直接复刻启动器的命令行

不要重新拼 classpath，**从启动器日志里把参数捞出来**。PCL 会把每个参数单独打一行：

```
12:22:40.495 I <135 · L/获取启动参数> [ModLaunch] -Djava.library.path=D:\mc-work\versions\X\natives
12:22:40.495 I <135 · L/获取启动参数> [ModLaunch] --username
...
```

```python
import re
pat = re.compile(r"^\d{2}:\d{2}:\d{2}\.\d{3} I <\d+ · L/获取启动参数> \[ModLaunch\] (.*)$")
blocks, cur = [], []
for line in open(r"D:/PCL/Log1.txt", encoding="utf-8", errors="replace"):
    m = pat.match(line)
    (cur.append(m.group(1)) if m else (blocks.append(cur) or cur.clear()))
```

取最后一块，末尾那行 `==== 启动参数结束 ====` 丢掉，就是完整的 argv。

**关键点：**

- 用 `--quickPlaySingleplayer "<存档名>"` 直接进世界，跳过主菜单 —— 少点两次，也少一次注入失败的机会。
- **进程必须挂在"后台任务"里跑**，不能 `DETACHED_PROCESS` 起完就撒手：沙箱会在父进程退出时清掉整棵进程树，游戏会一秒内被杀掉，日志 0 字节。前台阻塞 + 后台任务 = 稳。
- 窗口尺寸会被 `options.txt` 覆盖，起来之后再 `MoveWindow` 拉大。

## 二、截图：先声明 DPI 感知

```csharp
[DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int v);
...
SetProcessDpiAwareness(2);   // 不写这句，125% 缩放下截出来的区域整体偏移
```

窗口定位：`EnumWindows` 找 `class == "GLFW30"` 的可见窗口，取 `GetClientRect` + `ClientToScreen(0,0)`，
再用 `Graphics.CopyFromScreen` 截那块区域。`PrintWindow` 对 GLFW 常常全黑，别用。

## 三、按键：只有 PostMessage 有用

实测结论（同一台机器、同一个窗口、窗口已是前台）：

| 方式 | 结果 |
|---|---|
| `SendInput`（40 字节 INPUT 结构、带 `KEYEVENTF_SCANCODE`） | 返回 1，**游戏毫无反应** |
| `keybd_event` | 无反应 |
| `mouse_event`（先 `SetCursorPos`） | 光标会动，**游戏不响应点击** |
| `PostMessage(WM_KEYDOWN / WM_KEYUP)` | ✅ 有效 |

```csharp
uint sc = MapVirtualKey(vk, 0);
IntPtr down = (IntPtr)(1 | (sc << 16));
IntPtr up   = (IntPtr)(1 | (sc << 16) | (1 << 30) | (1 << 31));
PostMessage(hwnd, 0x0100, (IntPtr)vk, down);
Thread.Sleep(90);
PostMessage(hwnd, 0x0101, (IntPtr)vk, up);
```

`lParam` 必须带扫描码，否则 GLFW 认不出。**鼠标点击这条路是死的**——需要点的地方，一律想办法换成键位。

## 四、打开任务书：先绑键

FTB Quests 的 `key.ftbquests.quests` **默认未绑定**。关掉游戏，在 `options.txt` 里加/改：

```
key_key.ftbquests.quests:key.keyboard.j
```

注意前缀是 `key_` + `key.ftbquests.quests`（变成 `key_key.…`）。改完再启动才生效；
游戏正常退出时会回写 `options.txt`，所以**必须在游戏关闭时改**。

## 五、验收清单

1. 进世界 → 按 `J` → 任务书打开
2. 第一个节点**亮着**（无锁），后续节点**带🔒**
3. 悬停第一个节点，提示里是**你写的标题 + 副标题**（不是 `勾选标记`）
4. 节点之间能看到连线（`default_hide_dependency_lines: false`）
5. 对照日志 `translation table … (with N entries)`，N ≈ 任务数×3+2

五项全过才算真的成了。少一项就回 `pitfalls.md` 对照症状。

## 六、附：这套环境的两个额外限制

- 用 `--quickPlaySingleplayer "<中文存档名>"` 时，参数要走宽字符（Python 的 `subprocess` 在 Windows 上是 UTF-16，没问题）；用 bat 批处理传中文会乱码。
- 沙箱里 `Start-Process` / 分离进程一律活不下来，**别浪费时间在"后台常驻"上**，直接开一个后台任务把游戏阻塞跑在里面。
