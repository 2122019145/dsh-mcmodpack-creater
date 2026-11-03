/**
 * HMCL-MCP stdio JSON-RPC client.
 * Spawns `java -jar hmcl-mcp.jar`, which is the packaged MCP server (Node
 * runtime + java agent + HMCL bundled inside), and speaks MCP over stdio.
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';

/** Expand a leading `~` and make the path absolute; spawn() does neither. */
function expandPath(input, fallback) {
  const raw = (typeof input === 'string' && input.trim()) ? input.trim() : fallback;
  if (raw === '~') return homedir();
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return resolve(homedir(), raw.slice(2));
  return isAbsolute(raw) ? raw : resolve(raw);
}

export class HmclMcpClient extends EventEmitter {
  constructor(config = {}) {
    super();
    this.jarPath = expandPath(config.jarPath);
    this.workdir = expandPath(config.workdir, '~/.hmcl-mcp');
    this.javaPath = config.javaPath || 'java';
    this.agentPort = Number(config.agentPort) || 28501;
    this.agentToken = config.agentToken || 'hmcl-mcp';
    this.curseforgeApiKey = config.curseforgeApiKey;
    this.process = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.stdoutBuffer = '';
    this.initialized = false;
    this.tools = [];
  }

  /** Start the HMCL-MCP process and initialize the connection. */
  async start() {
    if (this.process) {
      throw new Error('Client already started');
    }
    if (!existsSync(this.jarPath)) {
      throw new Error(`HMCL-MCP jar not found: ${this.jarPath}`);
    }
    // spawn() fails outright when cwd does not exist.
    mkdirSync(this.workdir, { recursive: true });

    const env = { ...process.env };
    if (this.curseforgeApiKey) {
      env.HMCL_MCP_CURSEFORGE_API_KEY = this.curseforgeApiKey;
    }
    env.HMCL_MCP_WORKDIR = this.workdir;
    env.HMCL_MCP_AGENT_PORT = String(this.agentPort);
    env.HMCL_MCP_AGENT_TOKEN = this.agentToken;
    env.HMCL_MCP_JAVA = this.javaPath;

    const child = spawn(this.javaPath, ['-jar', this.jarPath], {
      cwd: this.workdir,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.process = child;

    child.stdout.on('data', (data) => {
      this.handleStdout(data.toString());
    });

    child.stderr.on('data', (data) => {
      // HMCL-MCP logs to stderr; only real failures are surfaced as errors.
      const text = data.toString();
      if (text.includes('error') || text.includes('Exception')) {
        this.emit('error', new Error(`HMCL-MCP stderr: ${text}`));
      } else {
        this.emit('log', text);
      }
    });

    // An unhandled 'error' event would take the whole DSH process down.
    child.on('error', (err) => {
      this.failPendingRequests(new Error(`Failed to start HMCL-MCP: ${err.message}`));
      this.emit('error', err);
    });

    child.on('close', (code) => {
      this.failPendingRequests(new Error(`HMCL-MCP exited with code ${code}`));
      this.process = null;
      this.initialized = false;
      this.emit('close', code);
    });

    // Initialize MCP connection
    await this.initialize();
    await this.listTools();
  }

  /** Reject every in-flight request so callers never hang on a dead process. */
  failPendingRequests(error) {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
    this.stdoutBuffer = '';
  }

  /** Handle incoming MCP messages from stdout (newline-delimited, may split). */
  handleStdout(data) {
    this.stdoutBuffer += data;
    let newlineIndex = this.stdoutBuffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const message = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (message) {
        try {
          this.handleMessage(JSON.parse(message));
        } catch (err) {
          this.emit('error', new Error(`Failed to parse MCP message: ${err.message}`));
        }
      }
      newlineIndex = this.stdoutBuffer.indexOf('\n');
    }
  }

  /** Handle a parsed MCP message. */
  handleMessage(message) {
    if (message.jsonrpc !== '2.0') {
      this.emit('error', new Error(`Invalid JSON-RPC version: ${message.jsonrpc}`));
      return;
    }

    if (message.id !== undefined) {
      // Response to a request
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(`MCP error: ${message.error.message}`));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method) {
      // Notification
      this.emit('notification', message.method, message.params);
    }
  }

  /** Send an MCP request and await its response. */
  async sendRequest(method, params = null) {
    if (!this.process?.stdin?.writable) {
      throw new Error('HMCL-MCP process is not running');
    }
    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method
    };
    // `params: null` is NOT the same as omitting it: the MCP SDK validates the
    // params shape per method and silently drops requests that carry null.
    if (params !== null && params !== undefined) request.params = params;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  /** Send an MCP notification (no id, no response expected). */
  sendNotification(method, params = null) {
    if (!this.process?.stdin?.writable) {
      throw new Error('HMCL-MCP process is not running');
    }
    const notification = { jsonrpc: '2.0', method };
    if (params !== null && params !== undefined) notification.params = params;
    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  /** Initialize the MCP connection. */
  async initialize() {
    const initRequest = {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {
          listChanged: true
        }
      },
      clientInfo: {
        name: 'dsh-hmcl-mcp',
        version: '0.2.0'
      }
    };

    const response = await this.sendRequest('initialize', initRequest);
    if (!response || !response.capabilities) {
      throw new Error('Invalid initialize response');
    }

    // A notification has no id — awaiting a reply here deadlocks forever.
    this.sendNotification('notifications/initialized');

    this.initialized = true;
    this.emit('initialized');
  }

  /** Get the list of available tools. */
  async listTools() {
    if (!this.initialized) {
      throw new Error('Client not initialized');
    }

    const response = await this.sendRequest('tools/list');
    this.tools = response.tools || [];
    return this.tools;
  }

  /** Call a tool by name. */
  async callTool(name, args = {}) {
    if (!this.initialized) {
      throw new Error('Client not initialized');
    }

    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args
    });

    if (response.content) {
      return response.content;
    } else if (response.data) {
      return response.data;
    } else {
      return response;
    }
  }

  /** Stop the HMCL-MCP process. */
  async stop() {
    const child = this.process;
    if (child) {
      child.kill('SIGTERM');
      await setTimeout(1000);
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGKILL');
      }
      this.process = null;
    }
    this.failPendingRequests(new Error('HMCL-MCP client stopped'));
    this.initialized = false;
    this.tools = [];
  }
}
