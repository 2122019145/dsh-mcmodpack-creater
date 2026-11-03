# DSH HMCL-MCP Plugin

A DeepSeek Harness plugin that bridges HMCL-MCP, enabling agents to manage Minecraft modpacks, search for mods, and install them autonomously.

## Features

- **21 HMCL-MCP Tools**: Full access to HMCL's Minecraft management capabilities
- **Modpack Management**: Search, download, and install modpacks from Modrinth and CurseForge
- **Mod Management**: Search, download, and install individual mods
- **Autonomous Modpack Building**: High-level tool that automatically searches, selects, and installs mods based on a theme
- **Version Management**: List and install Minecraft versions and loaders
- **Game Launch**: Launch and stop Minecraft games

## Installation

### Development (Local)

1. Build the plugin:
```bash
cd D:\dsh1\package-agent
npm install
```

2. Register in your DSH desktop profile:
   - Add to `~/.dsh/profiles/desktop/package.json`:
     ```json
     "dependencies": {
       "dsh-hmcl-mcp": "link:D:/dsh1/package-agent",
       ...
     }
     ```
   - Add to `dsh.profile.bundles`:
     ```json
     "dsh.profile.bundles": [
       "dsh-hmcl-mcp",
       ...
     ]
     ```

3. Restart DSH Desktop

## Usage

### Available Tools

#### Environment Tools
- `hmcl_check_environment` - Check HMCL environment status
- `hmcl_install_hmcl` - Install HMCL (no-op for packaged JAR)
- `hmcl_start_hmcl` - Start HMCL headless server
- `hmcl_stop_hmcl` - Stop HMCL headless server

#### Version Tools
- `hmcl_list_versions` - List installed Minecraft versions
- `hmcl_list_remote_versions` - List available remote versions
- `hmcl_install_version` - Install a Minecraft version

#### Loader Tools
- `hmcl_list_loader_versions` - List available loader versions
- `hmcl_install_loader` - Install a mod loader

#### Modpack Tools
- `hmcl_search_modpacks` - Search modpacks
- `hmcl_get_modpack` - Get modpack details
- `hmcl_download_modpack` - Download a modpack
- `hmcl_install_modpack` - Install a modpack
- `hmcl_list_modpacks` - List installed modpacks

#### Mod Tools
- `hmcl_search_mods` - Search mods
- `hmcl_get_mod` - Get mod details
- `hmcl_download_mod` - Download a mod
- `hmcl_install_mod` - Install a mod
- `hmcl_list_mods` - List installed mods

#### Game Launch
- `hmcl_launch_game` - Launch Minecraft
- `hmcl_stop_game` - Stop Minecraft

#### High-Level Tools
- `hmcl_build_modpack` - **Autonomously build a custom modpack** by theme

### Example Usage

#### Search and Install a Modpack
```javascript
// Search for modpacks
const modpacks = await hmcl_search_modpacks({
  query: "tech",
  source: "modrinth",
  limit: 5
});

// Download and install a modpack
await hmcl_install_modpack({
  id: modpacks[0].id,
  source: "modrinth",
  name: "my-tech-pack"
});
```

#### Build a Custom Modpack
```javascript
// Automatically build a tech modpack
const result = await hmcl_build_modpack({
  theme: "technology and automation",
  gameVersion: "1.20.1",
  loader: "fabric",
  instanceName: "my-tech-pack",
  limit: 15
});
```

#### Search and Install Individual Mods
```javascript
// Search for mods
const mods = await hmcl_search_mods({
  query: "storage",
  source: "modrinth",
  gameVersion: "1.20.1",
  limit: 10
});

// Download and install a mod
await hmcl_install_mod({
  id: mods[0].id,
  instance: "my-tech-pack",
  source: "modrinth"
});
```

## Configuration

The plugin can be configured via the DSH configuration system. Available options:

- `jarPath`: Path to the HMCL-MCP JAR file (default: `D:\dsh1\mcpackage_genacter\HMCL-MCP\build\hmcl-mcp.jar`)
- `workdir`: Working directory for HMCL-MCP (default: `~/.hmcl-mcp`)
- `javaPath`: Java executable path (default: `java`)
- `agentPort`: HMCL-MCP agent HTTP port (default: 28501)
- `agentToken`: HMCL-MCP agent token (default: `hmcl-mcp`)
- `curseforgeApiKey`: Optional CurseForge API key

## Requirements

- Java 17+ runtime
- HMCL-MCP JAR file (included with the plugin)

## Architecture

The plugin spawns an HMCL-MCP process and communicates with it via JSON-RPC over stdio, bridging the MCP tools into the DSH tool ecosystem.

## License

MIT