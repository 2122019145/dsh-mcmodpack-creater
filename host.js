/** HMCL-MCP plugin host entry point. */
import { apply as registerTools } from './lib/tools.js';

/** Plugin name. */
export const name = 'dsh-hmcl-mcp';

/** Services required by the tool consumer. */
export const inject = ['tools'];

/** Configuration schema. */
import Schema from '@deepseek-ai/schemastery';

export const Config = Schema.object({
  /**
   * Path to the HMCL-MCP JAR file (the packaged MCP server).
   * Forward slashes on purpose: a single-backslash string drops the separators
   * (`\d`, `\m` are not escapes) and yields a path like `D:dsh1mc...jar`.
   */
  jarPath: Schema.string().default('D:/dsh1/mcpackage_genacter/HMCL-MCP/build/hmcl-mcp.jar'),
  /** Working directory for HMCL-MCP (game root: versions/, libraries/, assets/). */
  workdir: Schema.string().default('D:/mc-work'),
  /** Java executable path (default: 'java' on PATH). */
  javaPath: Schema.string().default('java'),
  /** HMCL-MCP agent HTTP port. */
  agentPort: Schema.number().default(28501),
  /** HMCL-MCP agent token. */
  agentToken: Schema.string().default('hmcl-mcp'),
  /** CurseForge API key (optional). */
  curseforgeApiKey: Schema.string(),
});

/** Apply the plugin: register HMCL-MCP tools. */
export function apply(ctx, config = {}) {
  registerTools(ctx, config);
}
