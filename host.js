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
   * Relative paths resolve against the plugin directory, so the default
   * `hmcl-mcp.jar` expects the jar next to `package.json`. The environment
   * variable `HMCL_MCP_JAR` overrides this value.
   */
  jarPath: Schema.string().default('hmcl-mcp.jar'),
  /**
   * Working directory for HMCL-MCP (game root: versions/, libraries/, assets/).
   * `~` is expanded; the environment variable `HMCL_MCP_WORKDIR` overrides it.
   */
  workdir: Schema.string().default('~/.hmcl-mcp'),
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
