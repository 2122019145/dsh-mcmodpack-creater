#!/usr/bin/env node

/**
 * Simple test script for the HMCL-MCP client.
 */

import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { PLUGIN_ROOT, expandPath } from './lib/paths.js';

// Portable defaults: the jar lives next to package.json unless overridden.
const jarPath = process.env.HMCL_MCP_JAR || path.join(PLUGIN_ROOT, 'hmcl-mcp.jar');
const workdir = expandPath(process.env.HMCL_MCP_WORKDIR, { fallback: '~/.hmcl-mcp' });

async function testMcpClient() {
  console.log('Testing HMCL-MCP client...');

  const env = { ...process.env };
  env.HMCL_MCP_WORKDIR = workdir;
  env.HMCL_MCP_AGENT_PORT = '28501';
  env.HMCL_MCP_AGENT_TOKEN = 'hmcl-mcp';
  env.HMCL_MCP_JAVA = 'java';

  const child = spawn('java', ['-jar', jarPath], {
    cwd: workdir,
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let output = '';
  let error = '';

  child.stdout.on('data', (data) => {
    output += data.toString();
  });

  child.stderr.on('data', (data) => {
    error += data.toString();
  });

  // Wait for server to start
  await setTimeout(3000);

  // Send a simple MCP message
  const initMessage = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: { listChanged: true }
      },
      clientInfo: {
        name: 'test-client',
        version: '0.1.0'
      }
    }
  };

  child.stdin.write(JSON.stringify(initMessage) + '\n');

  // Wait for response
  await setTimeout(2000);

  // Send initialized notification
  const initializedMessage = {
    jsonrpc: '2.0',
    method: 'notifications/initialized'
  };

  child.stdin.write(JSON.stringify(initializedMessage) + '\n');

  // Wait for tools list
  await setTimeout(2000);

  // Send tools list request
  const toolsMessage = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list'
  };

  child.stdin.write(JSON.stringify(toolsMessage) + '\n');

  // Wait for response
  await setTimeout(3000);

  console.log('Output:', output);
  console.log('Error:', error);

  // Terminate the process
  child.kill('SIGTERM');
  await setTimeout(1000);
}

testMcpClient().catch(console.error);