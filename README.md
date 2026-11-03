# DSH HMCL-MCP 插件

一个 DeepSeek Harness 插件，用于桥接 HMCL-MCP，让智能体能够自主管理 Minecraft 整合包、搜索模组并安装它们。

## 功能特性

- **21 个 HMCL-MCP 工具**：完整访问 HMCL 的 Minecraft 管理能力
- **整合包管理**：从 Modrinth 和 CurseForge 搜索、下载并安装整合包
- **模组管理**：搜索、下载并安装单个模组
- **自主整合包构建**：根据主题自动搜索、筛选并安装模组的高级工具
- **版本管理**：列出并安装 Minecraft 版本与加载器
- **游戏启动**：启动与停止 Minecraft 游戏
- **FTB Quests 支持**：根据 JSON 规格自动生成任务线（.snbt + 语言文件）

## 安装

### 从源码安装

1. 安装依赖：

```bash
git clone https://github.com/2122019145/dsh-mcmodpack-creater.git
cd dsh-mcmodpack-creater
npm install
```

2. 放置 HMCL-MCP JAR：

   将 `hmcl-mcp.jar` 放到本仓库根目录（与 `package.json` 同级），或在 DSH 配置里用 `jarPath` / 环境变量 `HMCL_MCP_JAR` 指向它。JAR 体积较大，未随仓库提交。

3. 在 DSH 桌面端配置文件中注册插件（`~/.dsh/profiles/desktop/package.json`）：

   ```json
   "dependencies": {
     "dsh-hmcl-mcp": "link:../../../dsh-mcmodpack-creater",
     ...
   }
   ```

   `link:` 后面是**相对于 profile 目录**（`~/.dsh/profiles/desktop`）的路径；上面的写法假设仓库克隆在 `~/dsh-mcmodpack-creater`。换成你实际的相对路径即可（写成绝对路径也能用，但换机器后需要修改）。

   并在 `dsh.profile.bundles` 中添加：

   ```json
   "dsh.profile.bundles": [
     "dsh-hmcl-mcp",
     ...
   ]
   ```

4. 重启 DSH 桌面端。

> 仓库根目录的 `desktop-package.json` 是一份最小示例模板，可按需参考。

## 使用方法

### 可用工具

#### 环境工具

- `hmcl_check_environment` — 检查 HMCL 环境状态与配置
- `hmcl_install_hmcl` — 安装 HMCL（打包 JAR 形式下为空操作）
- `hmcl_start_hmcl` — 启动 HMCL 无头服务
- `hmcl_stop_hmcl` — 停止 HMCL 无头服务

#### 版本工具

- `hmcl_list_versions` — 列出已安装的 Minecraft 版本
- `hmcl_list_remote_versions` — 列出可用的远程 Minecraft 版本
- `hmcl_install_version` — 安装指定 Minecraft 版本

#### 加载器工具

- `hmcl_list_loader_versions` — 列出可用的加载器版本
- `hmcl_install_loader` — 安装模组加载器

#### 整合包工具

- `hmcl_search_modpacks` — 搜索整合包
- `hmcl_get_modpack` — 获取整合包详情
- `hmcl_download_modpack` — 下载整合包
- `hmcl_install_modpack` — 安装整合包
- `hmcl_list_modpacks` — 列出已安装的整合包

#### 模组工具

- `hmcl_search_mods` — 搜索模组
- `hmcl_get_mod` — 获取模组详情
- `hmcl_download_mod` — 下载模组
- `hmcl_install_mod` — 安装模组
- `hmcl_list_mods` — 列出已安装的模组

#### 游戏启动

- `hmcl_launch_game` — 启动 Minecraft
- `hmcl_stop_game` — 停止 Minecraft

#### FTB Quests 工具

- `ftb_build_quests` — 根据 JSON 规格构建 FTB Quests 任务线（.snbt + 语言文件），自动检测格式版本
- `ftb_detect_mode` — 从已安装的 ftb-quests jar 检测格式代号（flat / json5）
- `ftb_verify_items` — 校验规格中引用的物品 ID 是否存在于模组目录

#### 高级工具

- `hmcl_build_modpack` — **根据主题自主构建自定义整合包**

### 使用示例

#### 搜索并安装整合包

```javascript
// 搜索整合包
const modpacks = await hmcl_search_modpacks({
  query: "tech",
  source: "modrinth",
  limit: 5
});

// 下载并安装整合包
await hmcl_install_modpack({
  id: modpacks[0].id,
  source: "modrinth",
  name: "my-tech-pack"
});
```

#### 构建自定义整合包

```javascript
// 自动构建科技主题整合包
const result = await hmcl_build_modpack({
  theme: "technology and automation",
  gameVersion: "1.20.1",
  loader: "fabric",
  instanceName: "my-tech-pack",
  limit: 15
});
```

#### 搜索并安装单个模组

```javascript
// 搜索模组
const mods = await hmcl_search_mods({
  query: "storage",
  source: "modrinth",
  gameVersion: "1.20.1",
  limit: 10
});

// 下载并安装模组
await hmcl_install_mod({
  id: mods[0].id,
  instance: "my-tech-pack",
  source: "modrinth"
});
```

#### 生成 FTB Quests 任务线

```javascript
// 构建任务线
await ftb_build_quests({
  specPath: "./quests.json",
  workdir: "~/.hmcl-mcp",
  instance: "my-tech-pack",
  mode: "auto"
});
```

## 配置

插件通过 DSH 配置系统进行配置，可选配置项如下：

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `jarPath` | HMCL-MCP JAR 文件路径（相对路径以插件目录为基准） | `hmcl-mcp.jar` |
| `workdir` | HMCL-MCP 工作目录（游戏根目录，支持 `~`） | `~/.hmcl-mcp` |
| `javaPath` | Java 可执行文件路径 | `java` |
| `agentPort` | HMCL-MCP 代理 HTTP 端口 | `28501` |
| `agentToken` | HMCL-MCP 代理令牌 | `hmcl-mcp` |
| `curseforgeApiKey` | CurseForge API 密钥（可选） | — |

## 环境要求

- Java 17+ 运行时
- HMCL-MCP JAR 文件（需自行放置到插件目录，或用 `jarPath` / `HMCL_MCP_JAR` 指定）
- Python 3（仅 FTB Quests 相关工具需要）

## 路径与环境变量

代码中不包含任何机器相关的绝对路径：

- 默认 `jarPath` = `hmcl-mcp.jar`，相对**插件目录**解析（即 `lib/paths.js` 所在包的根目录）
- 默认 `workdir` = `~/.hmcl-mcp`，`~` 会自动展开
- FTB Quests 的 Python 脚本按模块自身位置定位，与当前工作目录无关

无需改代码即可用环境变量覆盖：

| 环境变量 | 作用 |
| --- | --- |
| `HMCL_MCP_JAR` | HMCL-MCP JAR 路径，优先级高于配置 |
| `HMCL_MCP_WORKDIR` | 工作目录，优先级高于配置 |
| `HMCL_MCP_JAVA` | Java 可执行文件路径 |
| `PYTHON` | Python 可执行文件（默认 `python`） |

## 架构说明

插件启动一个 HMCL-MCP 进程，通过 stdio 上的 JSON-RPC 与其通信，将 MCP 工具桥接进 DSH 工具生态。FTB Quests 相关工具则通过调用 Python 脚本完成任务线生成与物品校验。

## 许可证

MIT
