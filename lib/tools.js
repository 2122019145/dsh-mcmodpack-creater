/**
 * HMCL-MCP tool definitions for DeepSeek Harness.
 * Wraps the 21 HMCL-MCP tools as DSH tools using the MCP client.
 * Follows minecraft-dev/tools.js pattern: plain object literals for parameters/output.schema.
 */

import { defineTool } from '@deepseek-ai/dsh-tools';
import { HmclMcpClient } from './mcp-client.js';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Global MCP client instance (one per plugin instance). */
let globalClient = null;

/** Path to the Python executable. */
const PYTHON_PATH = process.env.PYTHON || 'python';

/**
 * Path to the FTB Quests generation script, resolved against THIS module —
 * `resolve('./lib/...')` would depend on the process cwd, which is the DSH
 * workspace rather than the plugin directory.
 */
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FTB_GEN_SCRIPT = resolve(PLUGIN_ROOT, 'lib/ftb-quests/python/ftb_tools.py');

/** Run a Python script and return parsed JSON output. */
async function runPython(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const pythonArgs = [scriptPath, ...args];
    const proc = spawn(PYTHON_PATH, pythonArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    // Without this, a missing interpreter leaves the promise pending forever.
    proc.on('error', (err) => {
      reject(new Error(`Failed to run ${PYTHON_PATH}: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`Failed to parse Python output: ${err.message}. Output: ${stdout}`));
      }
    });
  });
}

/** Check if Python is available. */
async function checkPython() {
  return new Promise((resolveCheck) => {
    try {
      const proc = spawn(PYTHON_PATH, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] });
      proc.on('error', () => resolveCheck(false));
      proc.on('close', (code) => resolveCheck(code === 0));
    } catch {
      resolveCheck(false);
    }
  });
}

/** Get or create the MCP client. */
function getClient(config) {
  if (!globalClient) {
    globalClient = new HmclMcpClient(config);
  }
  return globalClient;
}

/** Ensure the client is started and ready. */
async function ensureClient(config) {
  const client = getClient(config);
  if (!client.initialized) {
    await client.start();
  }
  return client;
}

/** Clean up the client on plugin unload. */
export function cleanupClient() {
  if (globalClient) {
    globalClient.stop().catch(err => console.error('Error stopping MCP client:', err));
    globalClient = null;
  }
}

/** Schema field helpers using plain object literals (minecraft-dev pattern). */
function strField(required = true, description, enumValues, defaultValue) {
  const f = { type: 'string' };
  if (required) f.required = true;
  if (description) f.description = description;
  if (enumValues) f.enum = enumValues;
  if (defaultValue !== undefined) f.default = defaultValue;
  return f;
}

function numField(required = true, description, defaultValue) {
  const f = { type: 'number' };
  if (required) f.required = true;
  if (description) f.description = description;
  if (defaultValue !== undefined) f.default = defaultValue;
  return f;
}

function boolField(required = true, description, defaultValue) {
  const f = { type: 'boolean' };
  if (required) f.required = true;
  if (description) f.description = description;
  if (defaultValue !== undefined) f.default = defaultValue;
  return f;
}

/**
 * Array field. `items` is either a primitive type name or a complete value
 * schema. The harness value-schema DSL rejects any `type: 'object'` node that
 * does not declare `additionalProperties` explicitly, so the string form of
 * `'object'` gets `additionalProperties: true` by default.
 */
function arrField(required = true, description, items = 'string') {
  let itemsSchema;
  if (typeof items === 'string') {
    itemsSchema = { type: items };
    if (items === 'object') itemsSchema.additionalProperties = true;
  } else {
    itemsSchema = items;
  }
  const f = { type: 'array', items: itemsSchema };
  if (required) f.required = true;
  if (description) f.description = description;
  return f;
}

/** Array of `{ id, source, required }` mod references (closed object items). */
function modRefsField(required = false, description) {
  return arrField(required, description, {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', required: true, description: 'Mod id or slug (Modrinth slug / CurseForge numeric id)' },
      source: { type: 'string', enum: ['modrinth', 'curseforge'], description: 'Source platform (default: modrinth)' },
      required: { type: 'boolean', description: 'Whether the mod is mandatory for the theme' },
    },
  });
}

/**
 * Build the output contract and render for a tool returning a JSON result.
 * The body is whatever the MCP server sent back (an array of content parts,
 * a `{ mode }` object, an `{ error }` object, ...), and the harness validates
 * every successful result against this schema — so it must accept any JSON
 * value instead of a closed `{ ok, data, error }` object.
 */
function outputText() {
  return {
    output: {
      schema: { type: 'json', description: 'Raw HMCL-MCP tool result' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
  };
}

/**
 * Flatten a cordis config node: live fields arrive as `{ get(): T }`
 * references, and handing those to the MCP client yields `[object Object]`.
 */
function unwrapConfig(source) {
  const out = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    out[key] = value !== null && typeof value === 'object' && typeof value.get === 'function'
      ? value.get()
      : value;
  }
  return out;
}

/** Register all HMCL-MCP tools on ctx.tools. */
export function apply(ctx, rawConfig = {}) {
  const config = unwrapConfig(rawConfig);

  // Kill the MCP server (and the headless HMCL JVM it owns) with the plugin.
  try {
    ctx?.on?.('dispose', () => cleanupClient());
  } catch {
    /* older hosts have no lifecycle event — the process dies with DSH anyway */
  }
  // HMCL environment tools
  ctx.tools.register(defineTool({
    name: 'hmcl_check_environment',
    description: 'Check HMCL environment status and configuration',
    parameters: {},
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('check_environment');
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_install_hmcl',
    description: 'Install HMCL (no-op for packaged JAR form)',
    parameters: {},
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('install_hmcl');
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_start_hmcl',
    description: 'Start HMCL headless server',
    parameters: {},
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('start_hmcl');
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_stop_hmcl',
    description: 'Stop HMCL headless server',
    parameters: {},
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('stop_hmcl');
    }
  }));

  // Minecraft version tools
  ctx.tools.register(defineTool({
    name: 'hmcl_list_versions',
    description: 'List installed Minecraft versions',
    parameters: {},
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('list_versions');
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_list_remote_versions',
    description: 'List available remote Minecraft versions',
    parameters: {
      type: strField(false, 'Filter by version type', ['release', 'snapshot', 'all'], 'release'),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('list_remote_versions', { type: args.type });
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_install_version',
    description: 'Install a Minecraft version',
    parameters: {
      version: strField(true, 'Minecraft version to install'),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('install_version', { mc_version: args.version });
    }
  }));

  // Loader tools
  ctx.tools.register(defineTool({
    name: 'hmcl_list_loader_versions',
    description: 'List available loader versions',
    parameters: {
      loader: strField(true, 'Mod loader type', ['fabric', 'forge', 'neoforge', 'quilt', 'optifine', 'liteloader', 'legacyfabric', 'cleanroom']),
      gameVersion: strField(true, 'Minecraft version'),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('list_loader_versions', {
        loader: args.loader,
        game_version: args.gameVersion,
      });
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_install_loader',
    description: 'Install a mod loader',
    parameters: {
      loader: strField(true, 'Mod loader type', ['fabric', 'forge', 'neoforge', 'quilt', 'optifine', 'liteloader', 'legacyfabric', 'cleanroom']),
      versionId: strField(true, 'Loader version ID'),
      gameVersion: strField(true, 'Minecraft version'),
      name: strField(false, 'Instance name (optional)'),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('install_loader', {
        loader: args.loader,
        version_id: args.versionId,
        game_version: args.gameVersion,
        name: args.name,
      });
    }
  }));

  // Modpack tools
  ctx.tools.register(defineTool({
    name: 'hmcl_search_modpacks',
    description: 'Search modpacks from Modrinth or CurseForge',
    parameters: {
      query: strField(false, 'Search query', undefined, ''),
      source: strField(false, 'Source platform', ['modrinth', 'curseforge'], 'modrinth'),
      limit: numField(false, 'Maximum results', 10),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('search_modpacks', {
        query: args.query || '',
        source: args.source || 'modrinth',
        limit: args.limit || 10,
      });
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_get_modpack',
    description: 'Get detailed information about a modpack',
    parameters: {
      id: strField(true, 'Modpack ID'),
      source: strField(false, 'Source platform', ['modrinth', 'curseforge'], 'modrinth'),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('get_modpack', {
        id: args.id,
        source: args.source || 'modrinth',
      });
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_download_modpack',
    description: 'Download a modpack to the local mcpacks directory',
    parameters: {
      id: strField(true, 'Modpack ID'),
      versionId: strField(false, 'Specific version ID (optional)'),
      source: strField(false, 'Source platform', ['modrinth', 'curseforge'], 'modrinth'),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('download_modpack', {
        id: args.id,
        versionId: args.versionId,
        source: args.source || 'modrinth',
      });
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_install_modpack',
    description: 'Install a modpack as a new instance',
    parameters: {
      id: strField(true, 'Modpack ID or path'),
      versionId: strField(false, 'Specific version ID (optional)'),
      source: strField(false, 'Source platform', ['modrinth', 'curseforge'], 'modrinth'),
      name: strField(false, 'Instance name (optional)'),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('install_modpack', {
        id: args.id,
        versionId: args.versionId,
        source: args.source || 'modrinth',
        name: args.name,
      });
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_list_modpacks',
    description: 'List installed modpacks',
    parameters: {},
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('list_modpacks');
    }
  }));

  // Mod tools
  ctx.tools.register(defineTool({
    name: 'hmcl_search_mods',
    description: 'Search mods from Modrinth or CurseForge',
    parameters: {
      query: strField(false, 'Search query', undefined, ''),
      source: strField(false, 'Source platform', ['modrinth', 'curseforge'], 'modrinth'),
      gameVersion: strField(false, 'Minecraft version'),
      limit: numField(false, 'Maximum results', 10),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('search_mods', {
        query: args.query || '',
        source: args.source || 'modrinth',
        gameVersion: args.gameVersion,
        limit: args.limit || 10,
      });
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_get_mod',
    description: 'Get detailed information about a mod',
    parameters: {
      id: strField(true, 'Mod ID'),
      source: strField(false, 'Source platform', ['modrinth', 'curseforge'], 'modrinth'),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('get_mod', {
        id: args.id,
        source: args.source || 'modrinth',
      });
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_download_mod',
    description: 'Download a mod to the local modfiles directory',
    parameters: {
      id: strField(true, 'Mod ID'),
      versionId: strField(false, 'Specific version ID (optional)'),
      source: strField(false, 'Source platform', ['modrinth', 'curseforge'], 'modrinth'),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('download_mod', {
        id: args.id,
        versionId: args.versionId,
        source: args.source || 'modrinth',
      });
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_install_mod',
    description: 'Install a mod into an existing instance',
    parameters: {
      id: strField(true, 'Mod ID or local path'),
      versionId: strField(false, 'Specific version ID (optional)'),
      instance: strField(true, 'Target instance name'),
      source: strField(false, 'Source platform', ['modrinth', 'curseforge'], 'modrinth'),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('install_mod', {
        id: args.id,
        versionId: args.versionId,
        instance: args.instance,
        source: args.source || 'modrinth',
      });
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_list_mods',
    description: 'List installed mods in an instance',
    parameters: {
      instance: strField(true, 'Instance name'),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('list_mods', { instance: args.instance });
    }
  }));

  // Game launch tools
  ctx.tools.register(defineTool({
    name: 'hmcl_launch_game',
    description: 'Launch Minecraft game',
    parameters: {
      version: strField(true, 'Minecraft version or instance name'),
      username: strField(false, 'Username (default: Steve)', undefined, 'Steve'),
      maxMemory: numField(false, 'Max memory in MB'),
      javaPath: strField(false, 'Java executable path'),
      extraArgs: arrField(false, 'Additional launch arguments', 'string'),
    },
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('launch_game', {
        version: args.version,
        username: args.username || 'Steve',
        maxMemory: args.maxMemory,
        javaPath: args.javaPath,
        extraArgs: args.extraArgs || [],
      });
    }
  }));

  ctx.tools.register(defineTool({
    name: 'hmcl_stop_game',
    description: 'Stop the running Minecraft game',
    parameters: {},
    ...outputText(),
    async execute(args, exec) {
      // ensureClient() is async — calling .callTool() on its Promise throws.
      const client = await ensureClient(config);
      return client.callTool('stop_game');
    }
  }));

  // High-level orchestrator tool
  ctx.tools.register(defineTool({
    name: 'hmcl_build_modpack',
    description: 'Autonomously search, select, download, and install mods to build a custom modpack',
    parameters: {
      theme: strField(true, 'Theme/description for the modpack'),
      gameVersion: strField(false, 'Minecraft version (optional, will auto-detect)'),
      loader: strField(false, 'Mod loader type', ['fabric', 'forge', 'neoforge', 'quilt']),
      mods: modRefsField(false, 'Specific mods to include (optional)'),
      exclude: arrField(false, 'Mods to exclude by ID (optional)', 'string'),
      instanceName: strField(false, 'Name for the new instance (optional)'),
      limit: numField(false, 'Max mods to search for (default: 20)', 20),
    },
    ...outputText(),
    async execute(args, exec) {
      const client = await ensureClient(config);

      // Step 1: Get available versions if not specified
      if (!args.gameVersion) {
        const versions = await client.callTool('list_remote_versions', { type: 'release' });
        args.gameVersion = versions.versions?.[0]?.id || '1.20.1';
      }

      // Step 2: Search for mods if not explicitly provided
      let modsToInstall = args.mods || [];
      if (!modsToInstall.length) {
        const searchResults = await client.callTool('search_mods', {
          query: args.theme,
          source: 'modrinth',
          gameVersion: args.gameVersion,
          limit: args.limit || 20,
        });

        modsToInstall = (searchResults.mods || []).slice(0, 10).map(mod => ({
          id: mod.id,
          source: 'modrinth',
          required: true,
        }));
      }

      // Step 3: Filter out excluded mods
      modsToInstall = modsToInstall.filter(mod =>
        !args.exclude?.includes(mod.id)
      );

      // Step 4: Install the loader if specified
      if (args.loader && !args.mods) {
        const loaderVersions = await client.callTool('list_loader_versions', {
          loader: args.loader,
          game_version: args.gameVersion,
        });

        if (loaderVersions.versions?.length > 0) {
          const loaderVersion = loaderVersions.versions[0];
          await client.callTool('install_loader', {
            loader: args.loader,
            version_id: loaderVersion.id,
            game_version: args.gameVersion,
            name: args.instanceName || `modpack-${Date.now()}`,
          });
        }
      }

      // Step 5: Download and install each mod
      const results = [];
      for (const mod of modsToInstall) {
        try {
          await client.callTool('download_mod', {
            id: mod.id,
            source: mod.source || 'modrinth',
          });

          const installResult = await client.callTool('install_mod', {
            id: mod.id,
            instance: args.instanceName || `modpack-${Date.now()}`,
            source: mod.source || 'modrinth',
          });

          results.push({
            mod: mod.id,
            status: 'success',
            result: installResult,
          });
        } catch (error) {
          results.push({
            mod: mod.id,
            status: 'error',
            error: error.message,
          });
        }
      }

      return {
        theme: args.theme,
        gameVersion: args.gameVersion,
        loader: args.loader,
        modsInstalled: results.filter(r => r.status === 'success').length,
        modsTotal: modsToInstall.length,
        results: results,
        instanceName: args.instanceName || `modpack-${Date.now()}`,
      };
    }
  }));

  // FTB Quests tools
  ctx.tools.register(defineTool({
    name: 'ftb_build_quests',
    description: 'Build FTB Quests questline (.snbt + lang) from a JSON spec. Auto-detects format generation from ftb-quests jar.',
    parameters: {
      specPath: strField(true, 'Path to quests.json spec file'),
      workdir: strField(false, 'HMCL-MCP workdir (default: D:/mc-work)', undefined, 'D:/mc-work'),
      instance: strField(false, 'Instance name for version-isolated installs'),
      modsDir: strField(false, 'Mods directory for item ID validation and format detection'),
      mode: strField(false, 'FTB Quests format mode', ['auto', 'flat', 'json5'], 'auto'),
      locales: strField(false, 'Comma-separated locales (default: zh_cn,en_us)', undefined, 'zh_cn,en_us'),
      checkOnly: boolField(false, 'Only validate, do not write files'),
    },
    ...outputText(),
    async execute(args, exec) {
      const pythonAvailable = await checkPython();
      if (!pythonAvailable) {
        return { error: 'Python not available — FTB Quests generation requires Python 3' };
      }

      const pythonArgs = [
        '--spec', args.specPath,
        '--workdir', args.workdir || 'D:/mc-work',
        '--mode', args.mode || 'auto',
        '--locales', args.locales || 'zh_cn,en_us',
      ];

      if (args.instance) {
        pythonArgs.push('--instance', args.instance);
      }
      if (args.modsDir) {
        pythonArgs.push('--mods-dir', args.modsDir);
      }
      if (args.checkOnly) {
        pythonArgs.push('--check-only');
      }

      try {
        const result = await runPython(FTB_GEN_SCRIPT, pythonArgs);
        return result;
      } catch (err) {
        return { error: err.message };
      }
    }
  }));

  ctx.tools.register(defineTool({
    name: 'ftb_verify_items',
    description: 'Verify that item IDs referenced in a FTB Quests spec exist in the mods directory jars.',
    parameters: {
      specPath: strField(true, 'Path to quests.json spec file'),
      modsDir: strField(true, 'Mods directory to search for item IDs'),
    },
    ...outputText(),
    async execute(args, exec) {
      const pythonAvailable = await checkPython();
      if (!pythonAvailable) {
        return { error: 'Python not available — FTB Quests verification requires Python 3' };
      }

      try {
        const result = await runPython(FTB_GEN_SCRIPT, [
          '--spec', args.specPath,
          '--verify-items',
          '--mods-dir', args.modsDir,
        ]);
        return result;
      } catch (err) {
        return { error: err.message };
      }
    }
  }));

  ctx.tools.register(defineTool({
    name: 'ftb_detect_mode',
    description: 'Detect FTB Quests format generation (flat/json5) from the installed ftb-quests jar.',
    parameters: {
      modsDir: strField(true, 'Mods directory containing ftb-quests*.jar'),
    },
    ...outputText(),
    async execute(args, exec) {
      const pythonAvailable = await checkPython();
      if (!pythonAvailable) {
        return { error: 'Python not available — FTB Quests detection requires Python 3' };
      }

      try {
        // `--detect-only` returns before the spec is read, so the placeholder
        // path below is never opened — argparse just requires the flag.
        const result = await runPython(FTB_GEN_SCRIPT, [
          '--spec', FTB_GEN_SCRIPT.replace(/\.py$/, '-dummy.json'),
          '--mods-dir', args.modsDir,
          '--detect-only',
        ]);
        return { mode: result.mode || 'flat', message: 'Format detected', modsDir: result.modsDir };
      } catch (err) {
        return { mode: 'flat', message: `Detection fallback: ${err.message}` };
      }
    }
  }));
}